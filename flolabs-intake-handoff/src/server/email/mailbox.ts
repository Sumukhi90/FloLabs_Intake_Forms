import 'server-only';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import { z } from 'zod';
import { normalizeTopic } from '../suppression/normalize';

const emailAddress = z.string().email();
const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_STORED_TEXT_CHARS = 64 * 1024;
const messageIdPattern = /^<[^<>\s@]+@[^<>\s@]+>$/;

export function resolveLocalEmailDatabasePath(configuredPath: string): string {
  const directory = resolve('.local');
  const databasePath = resolve(configuredPath);
  const pathFromDirectory = relative(directory, databasePath);
  if (!pathFromDirectory || pathFromDirectory === '..' || pathFromDirectory.startsWith(`..${sep}`) || isAbsolute(pathFromDirectory)) {
    throw new Error('EMAIL_DATABASE_PATH_MUST_BE_UNDER_LOCAL');
  }
  return databasePath;
}

export type StoredEmail = {
  key: string;
  direction: 'inbound' | 'outbound';
  threadId: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string;
  to: string[];
  subject: string;
  date: string;
  text: string;
  contactId: string | null;
  applicationId: string | null;
  providerId: string | null;
  mailbox: string | null;
  uidValidity: string | null;
  uid: number | null;
  contentHash: string | null;
  state: 'pending' | 'unknown' | 'failed' | 'sent' | 'received';
};

export type EmailSuppressionReason = 'MANUAL_TEST_BLOCK' | 'UNSUBSCRIBED' | 'HARD_BOUNCE' | 'COMPLAINT';
export type EmailSuppression = {
  email: string;
  reason: EmailSuppressionReason;
  createdAt: string;
};

export type EmailStore = {
  reserveOutbound(email: StoredEmail): boolean;
  reserveOutboundUnlessSuppressed(email: StoredEmail): { reserved: boolean; suppressionReason?: EmailSuppressionReason };
  updateOutbound(key: string, state: 'unknown' | 'failed' | 'sent', providerId?: string): void;
  getSuppression(email: string): EmailSuppression | null;
  addSuppression(email: string, reason: EmailSuppressionReason): { created: boolean; reason: EmailSuppressionReason };
  findByMessageId(messageIds: string[], correspondent?: string): StoredEmail | null;
  saveInbound(email: StoredEmail, uidValidity: string, lastUid: number): boolean;
  getCursor(mailbox: string, uidValidity: string): number;
  listMessages(): Array<Pick<StoredEmail, 'direction' | 'messageId' | 'threadId' | 'contactId' | 'applicationId' | 'state'>>;
  close(): void;
};

function rowToEmail(row: Record<string, unknown>): StoredEmail {
  return {
    key: String(row.key),
    direction: row.direction as StoredEmail['direction'],
    threadId: String(row.thread_id),
    messageId: row.message_id ? String(row.message_id) : null,
    inReplyTo: row.in_reply_to ? String(row.in_reply_to) : null,
    references: JSON.parse(String(row.references_json)) as string[],
    from: String(row.from_address),
    to: JSON.parse(String(row.to_json)) as string[],
    subject: String(row.subject),
    date: String(row.date),
    text: String(row.text),
    contactId: row.contact_id ? String(row.contact_id) : null,
    applicationId: row.application_id ? String(row.application_id) : null,
    providerId: row.provider_id ? String(row.provider_id) : null,
    mailbox: row.mailbox ? String(row.mailbox) : null,
    uidValidity: row.uid_validity ? String(row.uid_validity) : null,
    uid: row.uid === null ? null : Number(row.uid),
    contentHash: row.content_hash ? String(row.content_hash) : null,
    state: row.state as StoredEmail['state'],
  };
}

export function createSqliteEmailStore(databasePath: string): EmailStore {
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS email_messages (
      key TEXT PRIMARY KEY,
      direction TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      message_id TEXT,
      in_reply_to TEXT,
      references_json TEXT NOT NULL,
      from_address TEXT NOT NULL,
      to_json TEXT NOT NULL,
      subject TEXT NOT NULL,
      date TEXT NOT NULL,
      text TEXT NOT NULL,
      contact_id TEXT,
      application_id TEXT,
      provider_id TEXT,
      mailbox TEXT,
      uid_validity TEXT,
      uid INTEGER,
      content_hash TEXT,
      state TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS email_messages_message_id ON email_messages(message_id);
    CREATE UNIQUE INDEX IF NOT EXISTS email_messages_inbound_content_hash
      ON email_messages(mailbox, content_hash)
      WHERE direction = 'inbound' AND content_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS email_messages_imap_uid
      ON email_messages(mailbox, uid_validity, uid) WHERE direction = 'inbound';
    CREATE TABLE IF NOT EXISTS email_sync_cursor (
      mailbox TEXT PRIMARY KEY,
      uid_validity TEXT NOT NULL,
      last_uid INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_suppressions (
      email TEXT PRIMARY KEY,
      reason TEXT NOT NULL CHECK (reason IN ('MANUAL_TEST_BLOCK', 'UNSUBSCRIBED', 'HARD_BOUNCE', 'COMPLAINT')),
      created_at TEXT NOT NULL
    );
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO email_messages (
      key, direction, thread_id, message_id, in_reply_to, references_json,
      from_address, to_json, subject, date, text, contact_id, application_id,
      provider_id, mailbox, uid_validity, uid, content_hash, state
    ) VALUES (
      $key, $direction, $threadId, $messageId, $inReplyTo, $references,
      $from, $to, $subject, $date, $text, $contactId, $applicationId,
      $providerId, $mailbox, $uidValidity, $uid, $contentHash, $state
    )
  `);
  const getSuppression = db.prepare('SELECT email, reason, created_at FROM email_suppressions WHERE email = ?');
  const insertSuppression = db.prepare('INSERT OR IGNORE INTO email_suppressions (email, reason, created_at) VALUES (?, ?, ?)');

  function insertEmail(email: StoredEmail): boolean {
    return insert.run({
      $key: email.key,
      $direction: email.direction,
      $threadId: email.threadId,
      $messageId: email.messageId,
      $inReplyTo: email.inReplyTo,
      $references: JSON.stringify(email.references),
      $from: email.from,
      $to: JSON.stringify(email.to),
      $subject: email.subject,
      $date: email.date,
      $text: email.text,
      $contactId: email.contactId,
      $applicationId: email.applicationId,
      $providerId: email.providerId,
      $mailbox: email.mailbox,
      $uidValidity: email.uidValidity,
      $uid: email.uid,
      $contentHash: email.contentHash,
      $state: email.state,
    }).changes === 1;
  }

  return {
    reserveOutbound(email) {
      return insertEmail(email);
    },

    reserveOutboundUnlessSuppressed(email) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const recipient = email.to[0]?.trim().toLowerCase();
        const suppression = recipient ? getSuppression.get(recipient) as
          | { reason: EmailSuppressionReason }
          | undefined : undefined;
        if (suppression) {
          db.exec('COMMIT');
          return { reserved: false, suppressionReason: suppression.reason };
        }
        const reserved = insertEmail(email);
        db.exec('COMMIT');
        return { reserved };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    updateOutbound(key, state, providerId) {
      const result = db.prepare('UPDATE email_messages SET state = ?, provider_id = ? WHERE key = ? AND direction = ?')
        .run(state, providerId ?? null, key, 'outbound');
      if (result.changes !== 1) throw new Error('EMAIL_STORE_UPDATE_FAILED');
    },

    getSuppression(email) {
      const normalizedEmail = email.trim().toLowerCase();
      const row = getSuppression.get(normalizedEmail) as
        | { email: string; reason: EmailSuppressionReason; created_at: string }
        | undefined;
      return row ? { email: row.email, reason: row.reason, createdAt: row.created_at } : null;
    },

    addSuppression(email, reason) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!emailAddress.safeParse(normalizedEmail).success) throw new Error('INVALID_SUPPRESSION_EMAIL');
      const inserted = insertSuppression.run(normalizedEmail, reason, new Date().toISOString());
      const row = getSuppression.get(normalizedEmail) as
        | { reason: EmailSuppressionReason }
        | undefined;
      if (!row) throw new Error('EMAIL_SUPPRESSION_STORE_FAILED');
      return { created: inserted.changes === 1, reason: row.reason };
    },

    findByMessageId(messageIds, correspondent) {
      const lookup = db.prepare('SELECT * FROM email_messages WHERE message_id = ? ORDER BY rowid');
      const normalizedCorrespondent = correspondent?.trim().toLowerCase();
      const candidates: StoredEmail[] = [];
      for (const messageId of messageIds) {
        const rows = lookup.all(messageId) as Array<Record<string, unknown>>;
        for (const row of rows) {
          const email = rowToEmail(row);
          if (
            normalizedCorrespondent &&
            (email.direction === 'outbound'
              ? !email.to.some((address) => address.trim().toLowerCase() === normalizedCorrespondent)
              : email.from.trim().toLowerCase() !== normalizedCorrespondent)
          ) {
            continue;
          }
          candidates.push(email);
        }
      }
      if (!candidates.length) return null;
      const threads = new Set(candidates.map((candidate) => candidate.threadId));
      const contactIds = new Set(candidates.map((candidate) => candidate.contactId).filter((id): id is string => !!id));
      const applicationIds = new Set(candidates.map((candidate) => candidate.applicationId).filter((id): id is string => !!id));
      if (threads.size !== 1 || contactIds.size > 1 || applicationIds.size > 1) return null;
      return candidates[0] ?? null;
    },

    saveInbound(email, uidValidity, lastUid) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const added = insertEmail(email);
        db.prepare(`
          INSERT INTO email_sync_cursor (mailbox, uid_validity, last_uid) VALUES (?, ?, ?)
          ON CONFLICT(mailbox) DO UPDATE SET uid_validity = excluded.uid_validity, last_uid = MAX(last_uid, excluded.last_uid)
        `).run(email.mailbox, uidValidity, lastUid);
        db.exec('COMMIT');
        return added;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    getCursor(mailbox, uidValidity) {
      const row = db.prepare('SELECT uid_validity, last_uid FROM email_sync_cursor WHERE mailbox = ?')
        .get(mailbox) as { uid_validity: string; last_uid: number } | undefined;
      if (row?.uid_validity === uidValidity) return Number(row.last_uid);
      db.prepare(`
        INSERT INTO email_sync_cursor (mailbox, uid_validity, last_uid) VALUES (?, ?, 0)
        ON CONFLICT(mailbox) DO UPDATE SET uid_validity = excluded.uid_validity, last_uid = 0
      `).run(mailbox, uidValidity);
      return 0;
    },

    listMessages() {
      const rows = db.prepare(`
        SELECT direction, message_id, thread_id, contact_id, application_id, state
        FROM email_messages ORDER BY date, rowid
      `).all() as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        direction: row.direction as StoredEmail['direction'],
        messageId: row.message_id ? String(row.message_id) : null,
        threadId: String(row.thread_id),
        contactId: row.contact_id ? String(row.contact_id) : null,
        applicationId: row.application_id ? String(row.application_id) : null,
        state: row.state as StoredEmail['state'],
      }));
    },

    close() {
      db.close();
    },
  };
}

export class EmailSendError extends Error {
  constructor(readonly code:
    | 'INVALID_MESSAGE'
    | 'RECIPIENT_NOT_APPROVED'
    | 'RECIPIENT_SUPPRESSED'
    | 'CONSENT_REQUIRED'
    | 'SUPPRESSED'
    | 'ELIGIBILITY_UNAVAILABLE'
    | 'DUPLICATE'
    | 'IDEMPOTENCY_CONFLICT'
    | 'STORE_FAILED'
    | 'PROVIDER_AUTH_FAILED'
    | 'PROVIDER_REJECTED'
    | 'RATE_LIMITED'
    | 'DELIVERY_UNKNOWN', options: { providerInvoked?: boolean; suppressionReason?: EmailSuppressionReason } = {}) {
    super(`Email send failed: ${code}`);
    this.name = 'EmailSendError';
    this.providerInvoked = options.providerInvoked ?? false;
    this.suppressionReason = options.suppressionReason;
  }

  readonly providerInvoked: boolean;
  readonly suppressionReason: EmailSuppressionReason | undefined;
}

export type EmailDeliverySettings = {
  senderEmail: string;
  allowedRecipients: string[];
};

type OutboundEmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
};
type EmailDeliveryResponse = { messageId?: string; accepted?: Array<string | { address: string }> };
type MarketingEligibility =
  | { allowed: true; personId: string }
  | { allowed: false; reason: 'INVALID_EMAIL' | 'INVALID_TOPIC' | 'NO_CONSENT' | 'SUPPRESSED' | 'LOOKUP_FAILED' };
type MarketingEligibilityCheck = (email: string, topic: string) => Promise<MarketingEligibility>;
export type EmailProviderErrorCode = 'PROVIDER_AUTH_FAILED' | 'PROVIDER_REJECTED' | 'RATE_LIMITED' | 'DELIVERY_UNKNOWN';

export class EmailProviderError extends Error {
  constructor(readonly code: EmailProviderErrorCode) {
    super(`Email provider failed: ${code}`);
    this.name = 'EmailProviderError';
  }
}

export async function sendEmail(
  settings: EmailDeliverySettings,
  store: EmailStore,
  input: {
    key: string;
    to: string;
    subject: string;
    text: string;
    purpose: 'HR_TEST' | 'MARKETING';
    topic?: string;
    contactId?: string;
    applicationId?: string;
    replyToMessageId?: string;
  },
  deliver: (message: OutboundEmailMessage) => Promise<EmailDeliveryResponse>,
  checkEligibility?: MarketingEligibilityCheck,
): Promise<{ messageId: string; providerMessageId?: string }> {
  const recipient = input.to.trim().toLowerCase();
  if (
    !emailAddress.safeParse(recipient).success ||
    !input.key.trim() ||
    input.key.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(input.key) ||
    !input.subject.trim() ||
    /[\r\n]/.test(input.subject) ||
    !input.text.trim() ||
    input.subject.length > 998 ||
    input.text.length > MAX_STORED_TEXT_CHARS
  ) {
    throw new EmailSendError('INVALID_MESSAGE');
  }
  if (input.purpose !== 'HR_TEST' && input.purpose !== 'MARKETING') {
    throw new EmailSendError('INVALID_MESSAGE');
  }
  if (!settings.allowedRecipients.some((allowed) => allowed.trim().toLowerCase() === recipient)) {
    throw new EmailSendError('RECIPIENT_NOT_APPROVED');
  }
  let eligiblePersonId: string | undefined;
  if (input.purpose === 'MARKETING') {
    if (!input.topic?.trim() || !checkEligibility) throw new EmailSendError('ELIGIBILITY_UNAVAILABLE');
    let topic: string;
    try {
      topic = normalizeTopic(input.topic ?? '');
    } catch {
      throw new EmailSendError('INVALID_MESSAGE');
    }
    let eligibility: MarketingEligibility;
    try {
      eligibility = await checkEligibility(recipient, topic);
    } catch {
      throw new EmailSendError('ELIGIBILITY_UNAVAILABLE');
    }
    if (!eligibility.allowed) {
      if (eligibility.reason === 'NO_CONSENT') throw new EmailSendError('CONSENT_REQUIRED');
      if (eligibility.reason === 'SUPPRESSED') throw new EmailSendError('SUPPRESSED');
      if (eligibility.reason === 'INVALID_EMAIL') throw new EmailSendError('INVALID_MESSAGE');
      if (eligibility.reason === 'INVALID_TOPIC') throw new EmailSendError('INVALID_MESSAGE');
      throw new EmailSendError('ELIGIBILITY_UNAVAILABLE');
    }
    if (!eligibility.personId.trim()) throw new EmailSendError('ELIGIBILITY_UNAVAILABLE');
    eligiblePersonId = eligibility.personId;
  }
  const parent = input.replyToMessageId ? store.findByMessageId([input.replyToMessageId]) : null;
  if (input.replyToMessageId && !parent) throw new EmailSendError('INVALID_MESSAGE');
  const references = parent
    ? [...new Set([...parent.references, ...(parent.messageId ? [parent.messageId] : [])])]
    : [];
  const contentHash = createHash('sha256')
    .update(`${recipient}\n${input.subject}\n${input.text}\n${parent?.messageId ?? ''}\n${eligiblePersonId ?? input.contactId ?? ''}\n${input.applicationId ?? ''}`)
    .digest('hex');
  const messageId = `<${createHash('sha256').update(input.key).digest('hex')}@flolabsinnovations.com>`;
  const email: StoredEmail = {
    key: `outbound:${input.key}`,
    direction: 'outbound',
    threadId: parent?.threadId ?? messageId,
    messageId,
    inReplyTo: parent?.messageId ?? null,
    references,
    from: settings.senderEmail,
    to: [recipient],
    subject: input.subject,
    date: new Date().toISOString(),
    text: input.text,
    contactId: parent ? parent.contactId : eligiblePersonId ?? input.contactId ?? null,
    applicationId: parent ? parent.applicationId : input.applicationId ?? null,
    providerId: null,
    mailbox: null,
    uidValidity: null,
    uid: null,
    contentHash,
    state: 'pending',
  };
  let reservation: { reserved: boolean; suppressionReason?: EmailSuppressionReason };
  try {
    reservation = store.reserveOutboundUnlessSuppressed(email);
  } catch {
    throw new EmailSendError('ELIGIBILITY_UNAVAILABLE');
  }
  if (reservation.suppressionReason) {
    throw new EmailSendError('RECIPIENT_SUPPRESSED', { suppressionReason: reservation.suppressionReason });
  }
  if (!reservation.reserved) {
    const existing = store.findByMessageId([messageId]);
    if (existing?.contentHash !== contentHash) throw new EmailSendError('IDEMPOTENCY_CONFLICT');
    throw new EmailSendError('DUPLICATE');
  }

  try {
    const response = await deliver({
      from: settings.senderEmail,
      to: recipient,
      subject: input.subject,
      text: input.text,
      messageId,
      ...(parent?.messageId ? { inReplyTo: parent.messageId } : {}),
      ...(references.length ? { references } : {}),
    });
    const accepted = response.accepted?.some((address) =>
      (typeof address === 'string' ? address : address.address).trim().toLowerCase() === recipient,
    );
    if (!accepted) throw new EmailProviderError('PROVIDER_REJECTED');
    const providerId = response.messageId && /^[\x21-\x7e]{1,998}$/.test(response.messageId) ? response.messageId : undefined;
    try {
      store.updateOutbound(email.key, 'sent', providerId);
    } catch {
      throw new EmailSendError('DELIVERY_UNKNOWN', { providerInvoked: true });
    }
    return { messageId, ...(providerId ? { providerMessageId: providerId } : {}) };
  } catch (error) {
    try {
      const definitivelyRejected =
        error instanceof EmailProviderError && error.code !== 'DELIVERY_UNKNOWN';
      store.updateOutbound(email.key, definitivelyRejected ? 'failed' : 'unknown');
    } catch {
      throw error instanceof EmailSendError ? error : new EmailSendError('DELIVERY_UNKNOWN', { providerInvoked: true });
    }
    if (error instanceof EmailSendError) throw error;
    if (error instanceof EmailProviderError) {
      throw new EmailSendError(error.code, { providerInvoked: true });
    }
    throw new EmailSendError('DELIVERY_UNKNOWN', { providerInvoked: true });
  }
}

export class EmailSyncError extends Error {
  constructor(readonly code: 'IMAP_FAILED' | 'MESSAGE_TOO_LARGE' | 'INVALID_MESSAGE' | 'LIVE_HR_MAILBOX_FORBIDDEN') {
    super(`Email synchronization failed: ${code}`);
    this.name = 'EmailSyncError';
  }
}

export type ParsedInbound = Omit<StoredEmail, 'key' | 'direction' | 'threadId' | 'contactId' | 'applicationId' | 'providerId' | 'mailbox' | 'uidValidity' | 'uid' | 'state'>;

export async function parseInboundMessage(source: Buffer | string, internalDate: Date): Promise<ParsedInbound> {
  if (Buffer.byteLength(source) > MAX_MESSAGE_BYTES) throw new EmailSyncError('MESSAGE_TOO_LARGE');
  try {
    const rawSource = Buffer.isBuffer(source) ? source : Buffer.from(source);
    const parsed = await simpleParser(rawSource, { skipHtmlToText: true, maxHtmlLengthToParse: 0 });
    const from = parsed.from?.value[0]?.address?.trim().toLowerCase();
    if (!from || !emailAddress.safeParse(from).success) throw new EmailSyncError('INVALID_MESSAGE');
    const to = parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flatMap((item) => item.value.map((entry) => entry.address?.trim().toLowerCase() ?? '').filter(Boolean)) : [];
    const referenceHeader = parsed.references ?? [];
    const references = (Array.isArray(referenceHeader) ? referenceHeader : [referenceHeader])
      .flatMap((line) => line.match(/<[^<>\s]+@[^<>\s]+>/g) ?? []);
    const parsedMessageId = parsed.messageId?.trim();
    const messageId = parsedMessageId && messageIdPattern.test(parsedMessageId) ? parsedMessageId : null;
    const inReplyTo = parsed.inReplyTo?.match(/<[^<>\s]+@[^<>\s]+>/)?.[0] ?? null;
    return {
      messageId,
      inReplyTo,
      references,
      from,
      to,
      subject: (parsed.subject ?? '').slice(0, 998),
      date: (parsed.date ?? internalDate).toISOString(),
      text: (parsed.text ?? '').slice(0, MAX_STORED_TEXT_CHARS),
      contentHash: createHash('sha256').update(rawSource).digest('hex'),
    };
  } catch (error) {
    if (error instanceof EmailSyncError) throw error;
    throw new EmailSyncError('INVALID_MESSAGE');
  }
}

export type EmailImapClient = {
  connect(): Promise<void>;
  getMailboxLock(path: string): Promise<{ release(): void }>;
  search(criteria: { uid: string }, options: { uid: true }): Promise<number[] | false | undefined>;
  fetch(
    range: number[],
    query: { uid: true; source: { maxLength: number }; size: true; internalDate: true },
    options: { uid: true },
  ): AsyncIterable<Pick<FetchMessageObject, 'uid' | 'size' | 'source' | 'internalDate'>>;
  logout(): Promise<void>;
  mailbox: false | { uidValidity: number | bigint };
};

type EmailImapSettings = {
  host: string;
  port: 993;
  username: string;
  password: string;
  mailbox?: string;
};

export async function synchronizeInbox(
  settings: EmailImapSettings,
  store: EmailStore,
  createClient: (settings: EmailImapSettings) => EmailImapClient = (config) =>
    new ImapFlow({
      host: config.host,
      port: config.port,
      secure: true,
      auth: { user: config.username, pass: config.password },
      tls: { rejectUnauthorized: true, servername: config.host },
      logger: false,
      socketTimeout: 20_000,
      greetingTimeout: 10_000,
    }),
): Promise<{ imported: number; duplicates: number }> {
  if (settings.username.trim().toLowerCase() === 'hr@flolabsinnovations.com') {
    throw new EmailSyncError('LIVE_HR_MAILBOX_FORBIDDEN');
  }
  const client = createClient(settings);
  const mailboxName = settings.mailbox?.trim() || 'INBOX';
  const mailboxIdentity = JSON.stringify([settings.username.trim().toLowerCase(), mailboxName]);
  let operationFailed = false;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailboxName);
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new EmailSyncError('IMAP_FAILED');
      const uidValidity = String(mailbox.uidValidity);
      const lastUid = store.getCursor(mailboxIdentity, uidValidity);
      const uids = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
      if (!uids || !uids.length) return { imported: 0, duplicates: 0 };
      let imported = 0;
      let duplicates = 0;
      for await (const message of client.fetch(uids, { uid: true, source: { maxLength: MAX_MESSAGE_BYTES + 1 }, size: true, internalDate: true }, { uid: true })) {
        if (message.size && message.size > MAX_MESSAGE_BYTES) throw new EmailSyncError('MESSAGE_TOO_LARGE');
        if (!message.source) throw new EmailSyncError('INVALID_MESSAGE');
        const parsed = await parseInboundMessage(message.source, message.internalDate instanceof Date ? message.internalDate : new Date());
        const references = parsed.inReplyTo
          ? [...new Set([parsed.inReplyTo, ...parsed.references])]
          : [...parsed.references].reverse();
        const parent = store.findByMessageId(references, parsed.from);
        const messageUidKey = `${mailboxIdentity}:${uidValidity}:${message.uid}`;
        const id = parsed.messageId?.trim();
        const threadId = parent?.threadId ?? id ?? `imap:${createHash('sha256').update(messageUidKey).digest('hex')}`;
        const record: StoredEmail = {
          ...parsed,
          key: `inbound:${createHash('sha256').update(messageUidKey).digest('hex')}`,
          direction: 'inbound',
          threadId,
          contactId: parent?.contactId ?? null,
          applicationId: parent?.applicationId ?? null,
          providerId: null,
          mailbox: mailboxIdentity,
          uidValidity,
          uid: message.uid,
          state: 'received',
        };
        const added = store.saveInbound(record, uidValidity, message.uid);
        if (added) imported += 1;
        else duplicates += 1;
      }
      return { imported, duplicates };
    } finally {
      lock.release();
    }
  } catch (error) {
    operationFailed = true;
    if (error instanceof EmailSyncError) throw error;
    throw new EmailSyncError('IMAP_FAILED');
  } finally {
    try {
      await client.logout();
    } catch {
      if (!operationFailed) throw new EmailSyncError('IMAP_FAILED');
    }
  }
}
