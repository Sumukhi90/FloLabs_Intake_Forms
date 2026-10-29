import { randomUUID } from 'node:crypto';
import { getEnv } from '../src/server/env.ts';
import { EmailSendError, createSqliteEmailStore, resolveLocalEmailDatabasePath, sendEmail } from '../src/server/email/mailbox.ts';
import { createMailjetDelivery } from '../src/server/email/mailjet.ts';
import { createHrEmailDraftWithAssociationForApplication, HrEmailWorkflowError } from '../src/server/forms/hr-email-workflow.ts';
import { TwentyError, createTwentyClient } from '../src/server/twenty/client.ts';

const [applicationId, stageArg, formsBaseUrl, idempotencyKey] = process.argv.slice(2);
const stages = ['contacted', 'masterclass'] as const;
const stage = stages.find((candidate) => candidate === stageArg);
if (!applicationId || !stage || !formsBaseUrl || !idempotencyKey) {
  console.error('Usage: npm run send-hr-email:test -- <applicationId> <contacted|masterclass> <https-forms-origin> <unique-idempotency-key>');
  process.exit(1);
}

const env = getEnv();
if (env.NODE_ENV === 'production' || env.CRM_EMAIL_TEST_COMMANDS_ENABLED !== 'true') {
  console.error('HR test sending is disabled. Use a non-production environment and explicitly set CRM_EMAIL_TEST_COMMANDS_ENABLED=true.');
  process.exit(1);
}
if (
  !env.LINK_TOKEN_SECRET ||
  !env.MAILJET_API_KEY ||
  !env.MAILJET_API_SECRET ||
  !env.MAILJET_FROM_EMAIL ||
  !env.MAILJET_REPLY_TO_EMAIL ||
  !env.CRM_EMAIL_DATABASE_PATH ||
  !env.CRM_EMAIL_ALLOWED_RECIPIENTS
) {
  console.error('HR test send is not configured. Set the link secret, Mailjet API credentials, approved HR sender/Reply-To, test recipient allowlist, and local database path.');
  process.exit(1);
}

const store = createSqliteEmailStore(resolveLocalEmailDatabasePath(env.CRM_EMAIL_DATABASE_PATH));
const twenty = createTwentyClient({ baseUrl: env.TWENTY_BASE_URL, apiKey: env.TWENTY_API_KEY });
const correlationId = randomUUID();
let applicationIdForAudit: string | undefined;
let personIdForAudit: string | undefined;
let recipientKnown = false;
try {
  const result = await createHrEmailDraftWithAssociationForApplication(
    { applicationId, stage, formsBaseUrl, secret: env.LINK_TOKEN_SECRET },
    { twenty },
  );
  applicationIdForAudit = result.applicationId;
  personIdForAudit = result.contactId;
  recipientKnown = true;
  const sent = await sendEmail({
    senderEmail: env.MAILJET_FROM_EMAIL,
    allowedRecipients: env.CRM_EMAIL_ALLOWED_RECIPIENTS.split(',').map((address) => address.trim()).filter(Boolean),
  }, store, {
    key: idempotencyKey,
    to: result.draft.to,
    subject: `[CRM EMAIL TEST ${correlationId}] ${result.draft.subject}`,
    text: result.draft.body,
    purpose: 'HR_TEST',
    contactId: result.contactId,
    applicationId: result.applicationId,
  }, createMailjetDelivery({
    apiKey: env.MAILJET_API_KEY,
    apiSecret: env.MAILJET_API_SECRET,
    senderEmail: env.MAILJET_FROM_EMAIL,
    replyToEmail: env.MAILJET_REPLY_TO_EMAIL,
  }));
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    correlationId,
    operation: 'hr_email_send',
    status: 'provider_accepted',
    applicationId: applicationIdForAudit,
    personId: personIdForAudit,
    recipient: '[redacted]',
    suppressionDecision: 'not_suppressed',
    providerInvoked: true,
    retryCount: 0,
    executionMode: 'mailjet_api',
    messageId: sent.messageId,
    providerMessageId: sent.providerMessageId,
    deliveryConfirmed: false,
  }));
  console.log('Mailjet accepted the HR test message. This does not confirm recipient delivery; verify the controlled inbox before any retry.');
} catch (error) {
  if (error instanceof EmailSendError) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      correlationId,
      operation: 'hr_email_send',
      status: error.code === 'RECIPIENT_SUPPRESSED' ? 'blocked' : 'failed',
      applicationId: applicationIdForAudit,
      personId: personIdForAudit,
      recipient: recipientKnown ? '[redacted]' : undefined,
      suppressionDecision: error.code === 'RECIPIENT_SUPPRESSED' ? 'suppressed' : 'not_confirmed',
      suppressionReason: error.suppressionReason,
      error: error.code,
      providerInvoked: error.providerInvoked,
      retryCount: 0,
      executionMode: 'mailjet_api',
    }));
    console.error(`HR test send stopped (${error.code}). Review the sanitized result and verify provider/mailbox status before any retry.`);
  } else if (error instanceof TwentyError) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      correlationId,
      operation: 'hr_email_send',
      status: 'failed',
      applicationId: applicationIdForAudit,
      personId: personIdForAudit,
      error: error.code,
      providerInvoked: false,
      retryCount: 0,
      executionMode: 'mailjet_api',
    }));
    console.error(`Twenty lookup failed (${error.code}); no message was sent.`);
  } else if (error instanceof HrEmailWorkflowError) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      correlationId,
      operation: 'hr_email_send',
      status: 'failed',
      applicationId: applicationIdForAudit,
      personId: personIdForAudit,
      error: 'HR_WORKFLOW_FAILED',
      providerInvoked: false,
      retryCount: 0,
      executionMode: 'mailjet_api',
    }));
    console.error(`${error.message} No message was sent.`);
  } else {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      correlationId,
      operation: 'hr_email_send',
      status: 'failed',
      applicationId: applicationIdForAudit,
      personId: personIdForAudit,
      error: 'UNEXPECTED_FAILURE',
      providerInvoked: false,
      retryCount: 0,
      executionMode: 'mailjet_api',
    }));
    console.error('HR test send failed. No provider details or credentials were logged.');
  }
  process.exitCode = 1;
} finally {
  store.close();
}
