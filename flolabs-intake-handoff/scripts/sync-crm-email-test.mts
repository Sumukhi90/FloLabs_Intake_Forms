import { parseEmailEnvironment } from '../src/server/env.ts';
import { createSqliteEmailStore, EmailSyncError, resolveLocalEmailDatabasePath, synchronizeInbox } from '../src/server/email/mailbox.ts';

const env = parseEmailEnvironment(process.env);
if (process.env.NODE_ENV === 'production' || env.CRM_EMAIL_TEST_COMMANDS_ENABLED !== 'true') {
  console.error('Mailbox test sync is disabled. Use a non-production environment and explicitly set CRM_EMAIL_TEST_COMMANDS_ENABLED=true.');
  process.exit(1);
}
if (
  !env.CRM_EMAIL_IMAP_HOST ||
  env.CRM_EMAIL_IMAP_PORT !== 993 ||
  !env.CRM_EMAIL_IMAP_USERNAME ||
  !env.CRM_EMAIL_IMAP_PASSWORD ||
  !env.CRM_EMAIL_DATABASE_PATH
) {
  console.error('Inbox sync is not configured. Set the IMAP host, port 993, username, password, and local database path.');
  process.exit(1);
}

const store = createSqliteEmailStore(resolveLocalEmailDatabasePath(env.CRM_EMAIL_DATABASE_PATH));
try {
  const result = await synchronizeInbox({
    host: env.CRM_EMAIL_IMAP_HOST,
    port: 993,
    mailbox: env.CRM_EMAIL_IMAP_MAILBOX,
    username: env.CRM_EMAIL_IMAP_USERNAME,
    password: env.CRM_EMAIL_IMAP_PASSWORD,
  }, store);
  console.log(`Inbox sync finished: ${result.imported} imported, ${result.duplicates} duplicates skipped.`);
} catch (error) {
  console.error(error instanceof EmailSyncError
    ? `Inbox sync failed (${error.code}). Check mailbox access and retry later.`
    : 'Inbox sync failed. Provider details and mailbox contents were not logged.');
  process.exitCode = 1;
} finally {
  store.close();
}
