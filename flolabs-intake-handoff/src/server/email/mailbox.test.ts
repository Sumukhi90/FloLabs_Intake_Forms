import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSqliteEmailStore,
  EmailSendError,
  EmailSyncError,
  parseInboundMessage,
  resolveLocalEmailDatabasePath,
  sendEmail,
  synchronizeInbox,
  type EmailStore,
  type StoredEmail,
} from './mailbox';

const directories: string[] = [];
const stores: EmailStore[] = [];
const createStore = () => {
  const directory = mkdtempSync(join(tmpdir(), 'flolabs-email-test-'));
  directories.push(directory);
  const store = createSqliteEmailStore(join(directory, 'mail.sqlite'));
  stores.push(store);
  return store;
};
const smtp = {
  host: 'mail.example.test',
  port: 465 as const,
  username: 'crm.test1@example.test',
  password: 'never-log-this-secret',
  senderEmail: 'crm.test1@example.test',
  allowedRecipients: ['approved@example.test'],
};

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('outbound email safety', () => {
  it('restricts CLI mailbox storage to the local ignored data directory', () => {
    expect(resolveLocalEmailDatabasePath('.local/email.sqlite')).toContain('.local');
    expect(() => resolveLocalEmailDatabasePath('../outside.sqlite')).toThrow('EMAIL_DATABASE_PATH_MUST_BE_UNDER_LOCAL');
  });

  it('sends only to approved recipients over the configured transport and stores the message', async () => {
    const store = createStore();
    const deliver = vi.fn(async (message: { messageId: string }) => ({ messageId: message.messageId, accepted: ['approved@example.test'] }));
    const result = await sendEmail(smtp, store, {
      key: 'test-hr-1',
      to: 'approved@example.test',
      subject: 'Test',
      text: 'Safe test content',
      purpose: 'HR_TEST',
      contactId: 'person-1',
      applicationId: 'application-1',
    }, deliver);
    expect(result.messageId).toMatch(/^<.*@flolabsinnovations\.com>$/);
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver.mock.calls[0]?.[0]).toMatchObject({ to: 'approved@example.test', subject: 'Test' });
    expect(store.findByMessageId([result.messageId])).toMatchObject({
      state: 'sent',
      contactId: 'person-1',
      applicationId: 'application-1',
    });
  });

  it('blocks HR sends from the persistent local suppression list before provider invocation', async () => {
    const store = createStore();
    store.addSuppression('APPROVED@example.test', 'MANUAL_TEST_BLOCK');
    const deliver = vi.fn();

    const failure = await sendEmail(smtp, store, {
      key: 'suppressed-hr-test',
      to: 'approved@example.test',
      subject: 'Test',
      text: 'Safe test content',
      purpose: 'HR_TEST',
    }, deliver).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      code: 'RECIPIENT_SUPPRESSED',
      suppressionReason: 'MANUAL_TEST_BLOCK',
      providerInvoked: false,
    });
    expect(deliver).not.toHaveBeenCalled();
    expect(store.listMessages()).toHaveLength(0);
  });

  it('fails closed when suppression status cannot be read', async () => {
    const store = createStore();
    const unreadableStore: EmailStore = {
      ...store,
      reserveOutboundUnlessSuppressed: () => { throw new Error('local suppression database unavailable'); },
    };
    const deliver = vi.fn();
    const failure = await sendEmail(smtp, unreadableStore, {
      key: 'suppression-lookup-failure',
      to: 'approved@example.test',
      subject: 'Test',
      text: 'Safe test content',
      purpose: 'HR_TEST',
    }, deliver).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'ELIGIBILITY_UNAVAILABLE', providerInvoked: false });
    expect(deliver).not.toHaveBeenCalled();
    expect(store.listMessages()).toHaveLength(0);
  });

  it('normalizes and persists suppression entries across store restarts without replacing the original reason', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flolabs-email-restart-test-'));
    directories.push(directory);
    const databasePath = join(directory, 'mail.sqlite');
    const firstStore = createSqliteEmailStore(databasePath);
    expect(firstStore.addSuppression(' APPROVED@EXAMPLE.TEST ', 'MANUAL_TEST_BLOCK'))
      .toEqual({ created: true, reason: 'MANUAL_TEST_BLOCK' });
    firstStore.close();

    const reopenedStore = createSqliteEmailStore(databasePath);
    expect(reopenedStore.addSuppression('approved@example.test', 'UNSUBSCRIBED'))
      .toEqual({ created: false, reason: 'MANUAL_TEST_BLOCK' });
    expect(reopenedStore.getSuppression('Approved@example.test')).toMatchObject({
      email: 'approved@example.test',
      reason: 'MANUAL_TEST_BLOCK',
    });
    reopenedStore.close();
  });

  it('refuses an unapproved address and malformed messages before provider invocation', async () => {
    const deliver = vi.fn();
    await expect(sendEmail(smtp, createStore(), {
      key: 'not-approved',
      to: 'person@example.test',
      subject: 'Test',
      text: 'Test',
      purpose: 'HR_TEST',
    }, deliver)).rejects.toMatchObject({ code: 'RECIPIENT_NOT_APPROVED' });
    await expect(sendEmail(smtp, createStore(), {
      key: 'invalid',
      to: 'not-an-email',
      subject: '',
      text: '',
      purpose: 'HR_TEST',
    }, deliver)).rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
    const invalidPurposeStore = createStore();
    await expect(Reflect.apply(sendEmail, undefined, [
      smtp,
      invalidPurposeStore,
      {
        key: 'invalid-purpose',
        to: 'approved@example.test',
        subject: 'Test',
        text: 'Test',
        purpose: 'CAMPAIGN',
      },
      deliver,
    ])).rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
    await expect(sendEmail(smtp, invalidPurposeStore, {
      key: 'invalid-marketing-topic',
      to: 'approved@example.test',
      subject: 'Test',
      text: 'Test',
      purpose: 'MARKETING',
      topic: 'newsletter\n',
    }, deliver, async () => ({ allowed: true, personId: 'consented-person' })))
      .rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
    expect(invalidPurposeStore.listMessages()).toHaveLength(0);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('requires explicit consent and an active-suppression check for marketing sends', async () => {
    const store = createStore();
    const deliver = vi.fn(async (message: { messageId: string }) => ({
      messageId: message.messageId,
      accepted: ['approved@example.test'],
    }));
    const message = {
      key: 'marketing-test',
      to: 'approved@example.test',
      subject: 'Test newsletter',
      text: 'Approved test content',
      purpose: 'MARKETING' as const,
      topic: 'newsletter',
    };
    await expect(sendEmail(smtp, store, message, deliver))
      .rejects.toMatchObject({ code: 'ELIGIBILITY_UNAVAILABLE' });
    await expect(sendEmail(smtp, store, { ...message, topic: undefined }, deliver, async () => ({
      allowed: true,
      personId: 'consented-person',
    }))).rejects.toMatchObject({ code: 'ELIGIBILITY_UNAVAILABLE' });
    await expect(sendEmail(smtp, store, message, deliver, async () => ({
      allowed: false,
      reason: 'NO_CONSENT',
    }))).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    await expect(sendEmail(smtp, store, message, deliver, async () => ({
      allowed: false,
      reason: 'SUPPRESSED',
    }))).rejects.toMatchObject({ code: 'SUPPRESSED' });
    await expect(sendEmail(smtp, store, message, deliver, async () => {
      throw new Error('suppression database unavailable');
    })).rejects.toMatchObject({ code: 'ELIGIBILITY_UNAVAILABLE' });
    await expect(sendEmail(smtp, store, message, deliver, async () => ({
      allowed: false,
      reason: 'LOOKUP_FAILED',
    }))).rejects.toMatchObject({ code: 'ELIGIBILITY_UNAVAILABLE' });
    expect(deliver).not.toHaveBeenCalled();
    expect(store.listMessages()).toHaveLength(0);
  });

  it('associates eligible marketing messages with the consented Twenty person', async () => {
    const store = createStore();
    const deliver = vi.fn(async (message: { messageId: string }) => ({
      messageId: message.messageId,
      accepted: ['approved@example.test'],
    }));
    const eligibility = vi.fn(async (email: string, topic: string) => {
      expect(email).toBe('approved@example.test');
      expect(topic).toBe('newsletter');
      return { allowed: true as const, personId: 'consented-person' };
    });
    const result = await sendEmail(smtp, store, {
      key: 'eligible-marketing',
      to: 'approved@example.test',
      subject: 'Test newsletter',
      text: 'Approved test content',
      purpose: 'MARKETING',
      topic: ' newsletter ',
      contactId: 'unverified-caller-person',
    }, deliver, eligibility);
    expect(eligibility).toHaveBeenCalledOnce();
    expect(store.findByMessageId([result.messageId])).toMatchObject({ contactId: 'consented-person' });
    expect(deliver).toHaveBeenCalledOnce();
  });

  it('does not resubmit duplicate idempotency keys', async () => {
    const store = createStore();
    const deliver = vi.fn(async (message: { messageId: string }) => ({ messageId: message.messageId, accepted: ['approved@example.test'] }));
    const message = { key: 'once', to: 'approved@example.test', subject: 'Test', text: 'Body', purpose: 'HR_TEST' as const };
    await sendEmail(smtp, store, message, deliver);
    await expect(sendEmail(smtp, store, message, deliver)).rejects.toMatchObject({ code: 'DUPLICATE' });
    await expect(sendEmail(smtp, store, { ...message, text: 'Different body' }, deliver))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(deliver).toHaveBeenCalledOnce();
  });

  it('preserves Message-ID reply references and CRM association for outgoing replies', async () => {
    const store = createStore();
    const deliver = vi.fn(async (message: { messageId: string; inReplyTo?: string; references?: string[] }) => ({
      messageId: message.messageId,
      accepted: ['approved@example.test'],
    }));
    const original = await sendEmail(smtp, store, {
      key: 'original',
      to: 'approved@example.test',
      subject: 'Original',
      text: 'Original message',
      purpose: 'HR_TEST',
      contactId: 'person-1',
      applicationId: 'application-1',
    }, deliver);
    const reply = await sendEmail(smtp, store, {
      key: 'reply',
      to: 'approved@example.test',
      subject: 'Re: Original',
      text: 'Reply body',
      purpose: 'HR_TEST',
      replyToMessageId: original.messageId,
    }, deliver);
    expect(deliver.mock.calls[1]?.[0]).toMatchObject({
      inReplyTo: original.messageId,
      references: [original.messageId],
    });
    expect(store.findByMessageId([reply.messageId])).toMatchObject({
      threadId: original.messageId,
      inReplyTo: original.messageId,
      contactId: 'person-1',
      applicationId: 'application-1',
    });
  });

  it('records ambiguous provider failures and redacts credentials and provider error text', async () => {
    const store = createStore();
    const failure = await sendEmail(smtp, store, {
      key: 'failed',
      to: 'approved@example.test',
      subject: 'Test',
      text: 'Body',
      purpose: 'HR_TEST',
    }, async () => {
      throw new Error(`auth failed: ${smtp.password}`);
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EmailSendError);
    expect(String(failure)).not.toContain(smtp.password);
    try {
      await sendEmail(smtp, store, {
        key: 'failed',
        to: 'approved@example.test',
        subject: 'Test',
        text: 'Body',
        purpose: 'HR_TEST',
      }, async () => ({ messageId: 'unused', accepted: ['approved@example.test'] }));
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(smtp.password);
      expect((error as EmailSendError).code).toBe('DUPLICATE');
    }

    const timedOut = await sendEmail(smtp, store, {
      key: 'timeout',
      to: 'approved@example.test',
      subject: 'Test',
      text: 'Body',
      purpose: 'HR_TEST',
    }, async () => {
      throw new Error(`socket timeout ${smtp.password}`);
    }).catch((error: unknown) => error);
    expect(timedOut).toMatchObject({ code: 'DELIVERY_UNKNOWN', providerInvoked: true });
    expect(String(timedOut)).not.toContain(smtp.password);
    expect(store.listMessages()).toContainEqual(expect.objectContaining({ state: 'unknown' }));
  });

  it('records a definitive provider rejection as failed, not uncertain delivery', async () => {
    const store = createStore();
    const deliver = vi.fn(async () => ({ messageId: '<provider-response@example.test>', accepted: [] }));
    const failure = await sendEmail(smtp, store, {
      key: 'recipient-not-accepted',
      to: 'approved@example.test',
      subject: 'Test',
      text: 'Safe test content',
      purpose: 'HR_TEST',
    }, deliver).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'PROVIDER_REJECTED', providerInvoked: true });
    expect(deliver).toHaveBeenCalledOnce();
    expect(store.listMessages()).toContainEqual(expect.objectContaining({ state: 'failed' }));
  });

  it('refuses Message-ID matches with conflicting thread or CRM associations', () => {
    const store = createStore();
    const email = (key: string, threadId: string, contactId: string): StoredEmail => ({
      key,
      direction: 'outbound',
      threadId,
      messageId: '<duplicate@example.test>',
      inReplyTo: null,
      references: [],
      from: 'hr@example.test',
      to: ['applicant@example.test'],
      subject: 'Application follow-up',
      date: new Date().toISOString(),
      text: 'Original',
      contactId,
      applicationId: 'application-1',
      providerId: null,
      mailbox: null,
      uidValidity: null,
      uid: null,
      contentHash: 'hash',
      state: 'sent',
    });
    store.reserveOutbound(email('outbound:first', 'thread-1', 'person-1'));
    store.reserveOutbound(email('outbound:second', 'thread-2', 'person-2'));

    expect(store.findByMessageId(['<duplicate@example.test>'])).toBeNull();
  });

  it('matches a message ID only when the correspondent is part of the stored conversation', () => {
    const store = createStore();
    store.reserveOutbound({
      key: 'outbound:correspondent',
      direction: 'outbound',
      threadId: '<original@example.test>',
      messageId: '<original@example.test>',
      inReplyTo: null,
      references: [],
      from: 'hr@example.test',
      to: ['applicant@example.test'],
      subject: 'Application follow-up',
      date: new Date().toISOString(),
      text: 'Original',
      contactId: 'person-1',
      applicationId: 'application-1',
      providerId: null,
      mailbox: null,
      uidValidity: null,
      uid: null,
      contentHash: 'hash',
      state: 'sent',
    });

    expect(store.findByMessageId(['<original@example.test>'], 'other@example.test')).toBeNull();
    expect(store.findByMessageId(['<original@example.test>'], 'APPLICANT@example.test'))
      .toMatchObject({ contactId: 'person-1' });
  });
});

describe('IMAP parsing and synchronization', () => {
  const reply = [
    'From: applicant@example.test',
    'To: crm.test1@example.test',
    'Subject: Re: FloLabs application',
    'Message-ID: <reply-1@example.test>',
    'In-Reply-To: <original@flolabsinnovations.com>',
    'References: <original@flolabsinnovations.com>',
    'Date: Tue, 12 May 2026 10:00:00 +0000',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Thanks, I completed the form.',
  ].join('\r\n');

  it('extracts reply headers and plain text while ignoring HTML', async () => {
    const multipartReply = reply.replace(
      'Content-Type: text/plain; charset=utf-8\r\n\r\nThanks, I completed the form.',
      [
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="test-boundary"',
        '',
        '--test-boundary',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Thanks, I completed the form.',
        '--test-boundary',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<p>HTML-only private markup</p>',
        '--test-boundary--',
      ].join('\r\n'),
    );
    const parsed = await parseInboundMessage(Buffer.from(multipartReply), new Date('2026-05-12T10:00:00Z'));
    expect(parsed).toMatchObject({
      messageId: '<reply-1@example.test>',
      inReplyTo: '<original@flolabsinnovations.com>',
      references: ['<original@flolabsinnovations.com>'],
      from: 'applicant@example.test',
      text: 'Thanks, I completed the form.',
    });
    expect(JSON.stringify(parsed)).not.toContain('HTML-only private markup');
  });

  it('associates replies with the known original message and de-duplicates repeated syncs', async () => {
    const store = createStore();
    const outbound: StoredEmail = {
      key: 'outbound:original',
      direction: 'outbound',
      threadId: '<original@flolabsinnovations.com>',
      messageId: '<original@flolabsinnovations.com>',
      inReplyTo: null,
      references: [],
      from: smtp.username,
      to: ['applicant@example.test'],
      subject: 'Application follow-up',
      date: new Date().toISOString(),
      text: 'Original',
      contactId: 'person-123',
      applicationId: 'application-123',
      providerId: null,
      mailbox: null,
      uidValidity: null,
      uid: null,
      contentHash: 'hash',
      state: 'sent',
    };
    store.reserveOutbound(outbound);
    const fakeClient = {
      mailbox: { uidValidity: 123n },
      connect: vi.fn(async () => undefined),
      getMailboxLock: vi.fn(async () => ({ release: vi.fn() })),
      search: vi.fn(async () => [8]),
      async *fetch() {
        yield {
          uid: 8,
          size: Buffer.byteLength(reply),
          source: Buffer.from(reply),
          internalDate: new Date('2026-05-12T10:00:00Z'),
        };
      },
      logout: vi.fn(async () => undefined),
    };
    const factory = () => fakeClient;
    expect(await synchronizeInbox({
      host: 'mail.example.test',
      port: 993,
      username: smtp.username,
      password: smtp.password,
    }, store, factory)).toEqual({ imported: 1, duplicates: 0 });
    expect(store.findByMessageId(['<reply-1@example.test>'])).toMatchObject({
      threadId: '<original@flolabsinnovations.com>',
      contactId: 'person-123',
      applicationId: 'application-123',
    });
    expect(store.listMessages().filter((message) => message.threadId === '<original@flolabsinnovations.com>')).toHaveLength(2);
    expect(await synchronizeInbox({
      host: 'mail.example.test',
      port: 993,
      username: smtp.username,
      password: smtp.password,
    }, store, factory)).toEqual({ imported: 0, duplicates: 1 });
    expect(fakeClient.logout).toHaveBeenCalledTimes(2);
  });

  it('de-duplicates the same inbound message after IMAP UIDVALIDITY changes', async () => {
    const store = createStore();
    const createClient = (uidValidity: bigint) => ({
      mailbox: { uidValidity },
      connect: async () => undefined,
      getMailboxLock: async () => ({ release: () => undefined }),
      search: async () => [8],
      async *fetch() {
        yield {
          uid: 8,
          size: Buffer.byteLength(reply),
          source: Buffer.from(reply),
          internalDate: new Date('2026-05-12T10:00:00Z'),
        };
      },
      logout: async () => undefined,
    });
    const settings = {
      host: 'mail.example.test',
      port: 993 as const,
      username: 'hr@example.test',
      password: 'test-secret',
    };

    expect(await synchronizeInbox(settings, store, () => createClient(123n)))
      .toEqual({ imported: 1, duplicates: 0 });
    expect(await synchronizeInbox(settings, store, () => createClient(124n)))
      .toEqual({ imported: 0, duplicates: 1 });
    expect(store.listMessages()).toHaveLength(1);
  });

  it('associates replies by References when In-Reply-To is absent', async () => {
    const store = createStore();
    store.reserveOutbound({
      key: 'outbound:referenced',
      direction: 'outbound',
      threadId: '<root@example.test>',
      messageId: '<root@example.test>',
      inReplyTo: null,
      references: [],
      from: smtp.username,
      to: ['applicant@example.test'],
      subject: 'Application follow-up',
      date: new Date().toISOString(),
      text: 'Original',
      contactId: 'person-123',
      applicationId: 'application-123',
      providerId: null,
      mailbox: null,
      uidValidity: null,
      uid: null,
      contentHash: 'hash',
      state: 'sent',
    });
    const referencesOnlyReply = reply
      .replace('In-Reply-To: <original@flolabsinnovations.com>\r\n', '')
      .replace('<original@flolabsinnovations.com>', '<root@example.test>');
    const fakeClient = {
      mailbox: { uidValidity: 2 },
      connect: async () => undefined,
      getMailboxLock: async () => ({ release: () => undefined }),
      search: async () => [2],
      async *fetch() {
        yield {
          uid: 2,
          size: Buffer.byteLength(referencesOnlyReply),
          source: Buffer.from(referencesOnlyReply),
          internalDate: new Date('2026-05-12T10:00:00Z'),
        };
      },
      logout: async () => undefined,
    };

    expect(await synchronizeInbox({
      host: 'mail.example.test',
      port: 993,
      username: smtp.username,
      password: smtp.password,
    }, store, () => fakeClient)).toEqual({ imported: 1, duplicates: 0 });
    expect(store.findByMessageId(['<reply-1@example.test>'])).toMatchObject({
      threadId: '<root@example.test>',
      contactId: 'person-123',
      applicationId: 'application-123',
    });
  });

  it('does not associate a reply with known headers from an unrelated sender', async () => {
    const store = createStore();
    store.reserveOutbound({
      key: 'outbound:unmatched',
      direction: 'outbound',
      threadId: '<original@flolabsinnovations.com>',
      messageId: '<original@flolabsinnovations.com>',
      inReplyTo: null,
      references: [],
      from: smtp.username,
      to: ['applicant@example.test'],
      subject: 'Re: FloLabs application',
      date: new Date().toISOString(),
      text: 'Original',
      contactId: 'person-should-not-match',
      applicationId: 'application-should-not-match',
      providerId: null,
      mailbox: null,
      uidValidity: null,
      uid: null,
      contentHash: 'hash',
      state: 'sent',
    });
    const unrelatedReply = reply.replace('From: applicant@example.test', 'From: other@example.test');
    const fakeClient = {
      mailbox: { uidValidity: 1 },
      connect: async () => undefined,
      getMailboxLock: async () => ({ release: () => undefined }),
      search: async () => [1],
      async *fetch() {
        yield { uid: 1, size: Buffer.byteLength(unrelatedReply), source: Buffer.from(unrelatedReply), internalDate: new Date() };
      },
      logout: async () => undefined,
    };
    await synchronizeInbox({ host: 'mail.example.test', port: 993, username: smtp.username, password: smtp.password }, store, () => fakeClient);
    expect(store.findByMessageId(['<reply-1@example.test>'])).toMatchObject({
      threadId: '<reply-1@example.test>',
      contactId: null,
      applicationId: null,
    });
  });

  it('rejects oversized and malformed messages with safe errors', async () => {
    await expect(parseInboundMessage(Buffer.alloc(1024 * 1024 + 1), new Date()))
      .rejects.toMatchObject({ code: 'MESSAGE_TOO_LARGE' });
    await expect(parseInboundMessage('not a valid email', new Date()))
      .rejects.toBeInstanceOf(EmailSyncError);
  });

  it('sanitizes IMAP authentication and connection failures', async () => {
    const failure = await synchronizeInbox({
      host: 'mail.example.test',
      port: 993,
      username: smtp.username,
      password: smtp.password,
    }, createStore(), () => ({
      mailbox: false,
      connect: async () => { throw new Error(`bad password ${smtp.password}`); },
      getMailboxLock: async () => { throw new Error('unreachable'); },
      search: async () => false,
      async *fetch() {},
      logout: async () => undefined,
    })).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'IMAP_FAILED' });
    expect(String(failure)).not.toContain(smtp.password);
  });
});
