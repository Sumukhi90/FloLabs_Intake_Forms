import 'server-only';
import { EmailProviderError } from './mailbox';

const SEND_API_URL = 'https://api.mailjet.com/v3.1/send';
const REQUEST_TIMEOUT_MS = 15_000;

type MailjetSettings = {
  apiKey: string;
  apiSecret: string;
  senderEmail: string;
  replyToEmail: string;
};

type OutboundMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
};

type MailjetResponse = {
  Messages?: Array<{
    Status?: string;
    To?: Array<{ Email?: string; MessageID?: number | string; MessageUUID?: string; MessageHref?: string; Status?: string }>;
  }>;
};

export function createMailjetDelivery(
  settings: MailjetSettings,
  fetchImpl: typeof fetch = fetch,
): (message: OutboundMessage) => Promise<{ messageId?: string; accepted: string[] }> {
  return async (message) => {
    let response: Response;
    try {
      response = await fetchImpl(SEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${settings.apiKey}:${settings.apiSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          Messages: [{
            From: { Email: settings.senderEmail },
            To: [{ Email: message.to }],
            ReplyTo: { Email: settings.replyToEmail },
            Subject: message.subject,
            TextPart: message.text,
            Headers: {
              'Message-ID': message.messageId,
              ...(message.inReplyTo ? { 'In-Reply-To': message.inReplyTo } : {}),
              ...(message.references?.length ? { References: message.references.join(' ') } : {}),
            },
          }],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      throw new EmailProviderError('DELIVERY_UNKNOWN');
    }

    if (response.status === 401 || response.status === 403) {
      throw new EmailProviderError('PROVIDER_AUTH_FAILED');
    }
    if (response.status === 429) throw new EmailProviderError('RATE_LIMITED');
    if (!response.ok) {
      if (response.status >= 500) throw new EmailProviderError('DELIVERY_UNKNOWN');
      throw new EmailProviderError('PROVIDER_REJECTED');
    }

    let body: MailjetResponse;
    try {
      body = await response.json() as MailjetResponse;
    } catch {
      throw new EmailProviderError('DELIVERY_UNKNOWN');
    }
    const result = body.Messages?.[0];
    if (result?.Status !== 'success') throw new EmailProviderError('PROVIDER_REJECTED');
    const acceptedRecipient = result.To?.find((recipient) =>
      recipient.Email?.trim().toLowerCase() === message.to.trim().toLowerCase() &&
      (recipient.Status === undefined || recipient.Status === 'success'),
    );
    if (!acceptedRecipient) throw new EmailProviderError('PROVIDER_REJECTED');
    const providerMessageId = acceptedRecipient.MessageUUID ??
      (acceptedRecipient.MessageID === undefined ? undefined : String(acceptedRecipient.MessageID));
    return {
      accepted: [message.to],
      ...(providerMessageId ? { messageId: providerMessageId } : {}),
    };
  };
}
