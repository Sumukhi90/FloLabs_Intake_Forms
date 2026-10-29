import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import {
  createSqliteEmailStore,
  EmailProviderError,
  EmailSendError,
  sendEmail,
  type EmailStore,
} from './mailbox';
import { createMailjetDelivery } from './mailjet';

const settings = {
  apiKey: 'mailjet-test-key',
  apiSecret: 'mailjet-test-secret',
  senderEmail: 'hr@flolabsinnovations.com',
  replyToEmail: 'hr@flolabsinnovations.com',
};

const message = {
  from: settings.senderEmail,
  to: 'authorized-test@example.test',
  subject: '[CRM EMAIL TEST test-123]',
  text: 'Safe synthetic message.',
  messageId: '<message-123@flolabsinnovations.com>',
  inReplyTo: '<parent-123@flolabsinnovations.com>',
  references: ['<root-123@flolabsinnovations.com>', '<parent-123@flolabsinnovations.com>'],
};
const directories: string[] = [];
const stores: EmailStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createStore(): EmailStore {
  const directory = mkdtempSync(join(tmpdir(), 'flolabs-mailjet-test-'));
  directories.push(directory);
  const store = createSqliteEmailStore(join(directory, 'mail.sqlite'));
  stores.push(store);
  return store;
}

describe('Mailjet delivery', () => {
  it('sends authenticated HTTPS JSON with HR sender, Reply-To, and threading headers', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({
        Messages: [{
          Status: 'success',
          To: [{
            Email: message.to,
            MessageID: 12345,
            MessageUUID: 'provider-uuid-123',
          }],
        }],
      }), { status: 200 });
    });

    const result = await createMailjetDelivery(settings, fetcher)(message);
    const body = JSON.parse(String(requestInit?.body)) as {
      Messages: Array<{
        From: { Email: string };
        ReplyTo: { Email: string };
        To: Array<{ Email: string }>;
        Headers: Record<string, string>;
      }>;
    };
    const authorization = new Headers(requestInit?.headers).get('Authorization');
    expect(requestUrl).toBe('https://api.mailjet.com/v3.1/send');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
    expect(authorization).toBe(`Basic ${Buffer.from(`${settings.apiKey}:${settings.apiSecret}`).toString('base64')}`);
    expect(body.Messages[0]).toMatchObject({
      From: { Email: settings.senderEmail },
      ReplyTo: { Email: settings.replyToEmail },
      To: [{ Email: message.to }],
      Headers: {
        'Message-ID': message.messageId,
        'In-Reply-To': message.inReplyTo,
        References: message.references.join(' '),
      },
    });
    expect(result).toEqual({ accepted: [message.to], messageId: 'provider-uuid-123' });
  });

  it.each([
    [401, 'PROVIDER_AUTH_FAILED'],
    [403, 'PROVIDER_AUTH_FAILED'],
    [429, 'RATE_LIMITED'],
    [400, 'PROVIDER_REJECTED'],
    [503, 'DELIVERY_UNKNOWN'],
  ] as const)('maps provider HTTP %i to a safe error code', async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('provider detail must not leak', { status }));
    const failure = await createMailjetDelivery(settings, fetcher)(message).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EmailProviderError);
    expect(failure).toMatchObject({ code });
    expect(String(failure)).not.toContain('provider detail');
    expect(String(failure)).not.toContain(settings.apiSecret);
  });

  it('treats a network failure or malformed success body as an uncertain delivery', async () => {
    const networkFailure = vi.fn<typeof fetch>().mockRejectedValue(new Error(settings.apiSecret));
    const failure = await createMailjetDelivery(settings, networkFailure)(message).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'DELIVERY_UNKNOWN' });
    expect(String(failure)).not.toContain(settings.apiSecret);

    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response('{invalid', { status: 200 }));
    await expect(createMailjetDelivery(settings, malformed)(message)).rejects.toMatchObject({
      code: 'DELIVERY_UNKNOWN',
    });
  });

  it('rejects unsuccessful or mismatched recipient results', async () => {
    const unsuccessful = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      Messages: [{ Status: 'error', To: [{ Email: message.to, Status: 'error' }] }],
    }), { status: 200 }));
    await expect(createMailjetDelivery(settings, unsuccessful)(message)).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
    });

    const mismatched = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      Messages: [{ Status: 'success', To: [{ Email: 'other@example.test', Status: 'success' }] }],
    }), { status: 200 }));
    await expect(createMailjetDelivery(settings, mismatched)(message)).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
    });

    const rejectedRecipient = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      Messages: [{ Status: 'success', To: [{ Email: message.to, Status: 'error' }] }],
    }), { status: 200 }));
    await expect(createMailjetDelivery(settings, rejectedRecipient)(message)).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
    });
  });

  it('stores the Mailjet provider ID and maps a provider failure without leaking response data', async () => {
    const store = createStore();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      Messages: [{
        Status: 'success',
        To: [{ Email: message.to, Status: 'success', MessageUUID: 'mailjet-message-uuid' }],
      }],
    }), { status: 200 }));
    const sent = await sendEmail({
      senderEmail: settings.senderEmail,
      allowedRecipients: [message.to],
    }, store, {
      key: 'mailjet-success',
      to: message.to,
      subject: message.subject,
      text: message.text,
      purpose: 'HR_TEST',
    }, createMailjetDelivery(settings, fetcher));

    expect(sent.providerMessageId).toBe('mailjet-message-uuid');
    expect(store.findByMessageId([sent.messageId])).toMatchObject({
      providerId: 'mailjet-message-uuid',
      state: 'sent',
    });

    const failedFetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider response', { status: 401 }));
    const failedStore = createStore();
    const failure = await sendEmail({
      senderEmail: settings.senderEmail,
      allowedRecipients: [message.to],
    }, failedStore, {
      key: 'mailjet-auth-failure',
      to: message.to,
      subject: message.subject,
      text: message.text,
      purpose: 'HR_TEST',
    }, createMailjetDelivery(settings, failedFetcher)).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect(failure).toMatchObject({ code: 'PROVIDER_AUTH_FAILED', providerInvoked: true });
    expect(String(failure)).not.toContain('private provider response');
    expect(String(failure)).not.toContain(settings.apiSecret);
    expect(failedStore.listMessages()).toContainEqual(expect.objectContaining({ state: 'failed' }));
  });

  it('does not invoke Mailjet when the local suppression check blocks the recipient', async () => {
    const store = createStore();
    store.addSuppression(message.to, 'MANUAL_TEST_BLOCK');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const failure = await sendEmail({
      senderEmail: settings.senderEmail,
      allowedRecipients: [message.to],
    }, store, {
      key: 'mailjet-suppressed',
      to: message.to,
      subject: message.subject,
      text: message.text,
      purpose: 'HR_TEST',
    }, createMailjetDelivery(settings, fetcher)).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      code: 'RECIPIENT_SUPPRESSED',
      suppressionReason: 'MANUAL_TEST_BLOCK',
      providerInvoked: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
