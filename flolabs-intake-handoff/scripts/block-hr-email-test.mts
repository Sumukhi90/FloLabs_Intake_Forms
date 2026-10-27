import { randomUUID } from 'node:crypto';
import { parseEmailEnvironment } from '../src/server/env.ts';
import { createSqliteEmailStore, resolveLocalEmailDatabasePath } from '../src/server/email/mailbox.ts';

if (process.env.NODE_ENV === 'production' || process.env.CRM_EMAIL_TEST_COMMANDS_ENABLED !== 'true') {
  console.error('HR test blocklist changes are disabled. Use a non-production environment and explicitly set CRM_EMAIL_TEST_COMMANDS_ENABLED=true.');
  process.exit(1);
}

const env = parseEmailEnvironment(process.env);
if (!env.CRM_EMAIL_DATABASE_PATH || !env.CRM_EMAIL_TEST_BLOCK_RECIPIENT) {
  console.error('HR test blocklist is not configured. Set CRM_EMAIL_DATABASE_PATH under .local and CRM_EMAIL_TEST_BLOCK_RECIPIENT in the approved local environment.');
  process.exit(1);
}
const recipient = env.CRM_EMAIL_TEST_BLOCK_RECIPIENT;

const store = createSqliteEmailStore(resolveLocalEmailDatabasePath(env.CRM_EMAIL_DATABASE_PATH));
const correlationId = randomUUID();
try {
  const result = store.addSuppression(recipient, 'MANUAL_TEST_BLOCK');
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    correlationId,
    operation: 'hr_test_suppression_add',
    status: result.created ? 'created' : 'already_blocked',
    recipient: '[redacted]',
    suppressionReason: result.reason,
    providerInvoked: false,
    executionMode: 'local_test',
  }));
} catch (error) {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : 'SUPPRESSION_WRITE_FAILED';
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    correlationId,
    operation: 'hr_test_suppression_add',
    status: 'failed',
    recipient: '[redacted]',
    error: code,
    providerInvoked: false,
    executionMode: 'local_test',
  }));
  process.exitCode = 1;
} finally {
  store.close();
}
