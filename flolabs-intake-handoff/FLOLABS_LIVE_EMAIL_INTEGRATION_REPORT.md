# FloLabs Live Email Integration Report

## Current status

No live email or CRM test was attempted. Mohamed's security guide requires the live provider and CRM checks to wait for approved credentials, mailbox configuration, recipient authorization, and company approval. The local `.env.local` file was absent, and no process environment values were configured for the checked Twenty, Mailjet, IMAP, allowlist, or local email-store settings. No secret values were read or printed.

| Acceptance step | Status |
|---|---|
| Mailjet authentication and sender authorization | BLOCKED |
| Controlled outbound provider acceptance and message ID | NOT TESTED |
| Independent receipt in approved test mailbox | NOT TESTED |
| SPF/DKIM/DMARC result inspection | NOT TESTED |
| Dedicated test mailbox IMAP TLS/authentication | BLOCKED |
| Actual inbound retrieval and reply | NOT TESTED |
| Actual Twenty API connectivity and permissions | BLOCKED |
| Twenty email persistence and contact/application association | NOT IMPLEMENTED |
| Live bounce, complaint, and unsubscribe provider events | NOT TESTED |

## Implementation boundary

The code uses Mailjet Send API for controlled outbound testing and IMAP TLS/993 for test inbox synchronization. It has no SMTP-authenticated outbound transport. The local SQLite store is used for message/thread history, test suppression, and IMAP cursors. The existing email client does not persist email activities or threads into Twenty. Inbound correspondence can inherit Person/Application IDs only when it matches an outbound message in the local store; this is not a CRM association.

The existing bounce/complaint event handler consumes SES/SNS-shaped events and writes to a DynamoDB suppression store. It is not a Mailjet webhook integration and has not been deployed or verified. AWS work is not part of this live-test authorization.

## Required access and approvals

Provision all credentials using the company-approved secret manager or ignored `.env.local`; never send them in chat.

- **Mailbox owner / Mohamed:** Dedicated test mailbox; confirmed IMAP hostname, port `993`, username, folder, and credential; allowlisted network access. Do not provide or use the live `hr@flolabsinnovations.com` inbox.
- **Mailjet account owner / operations:** Approved Mailjet API key/secret, confirmation that `hr@flolabsinnovations.com` is a verified sender and Reply-To, and explicit recipient authorization for the dedicated test mailbox.
- **Whitney:** Explicit approval of the synthetic test Person/application, recipient, reply-from account, and the one-send/one-reply scenario; confirmation of what CRM association is expected and approval for any required record write.
- **Atankeu / Twenty workspace administrator:** Correct workspace URL and short-lived scoped API key provisioned securely; read permission for the synthetic Person/Application and required relationship/schema metadata. Write access only if separately approved for synthetic test records. No schema changes are authorized by this report.

Expected local configuration names are documented in `.env.example` and `docs/email-access-request.md`: `TWENTY_BASE_URL`, `TWENTY_API_KEY`, `LINK_TOKEN_SECRET`, `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `MAILJET_FROM_EMAIL`, `MAILJET_REPLY_TO_EMAIL`, `CRM_EMAIL_IMAP_HOST`, `CRM_EMAIL_IMAP_PORT`, `CRM_EMAIL_IMAP_MAILBOX`, `CRM_EMAIL_IMAP_USERNAME`, `CRM_EMAIL_IMAP_PASSWORD`, `CRM_EMAIL_ALLOWED_RECIPIENTS`, `CRM_EMAIL_DATABASE_PATH`, and `CRM_EMAIL_TEST_COMMANDS_ENABLED`. Secrets must only be provisioned locally through the approved method.

## Safe execution sequence after prerequisites

1. Reconfirm Mohamed's security approval and that the dedicated mailbox and test host are authorized.
2. Verify Twenty endpoint/authentication read-only and confirm the exact synthetic Person/Application link before any write.
3. Verify Mailjet sender authorization and approved recipient allowlist without sending.
4. Add a truthful manual test suppression for the blocked synthetic recipient in the approved test store; reopen the store and verify persistence.
5. Attempt exactly one normal-path blocked send and verify `RECIPIENT_SUPPRESSED` with no provider invocation.
6. Only after explicit authorization, send one uniquely identified message to the approved controlled test recipient; independently verify mailbox receipt.
7. Reply once from the controlled mailbox; synchronize using the dedicated test folder and verify headers, deduplication, and local threading.
8. Verify Twenty CRM persistence/association only if a supported existing API mechanism is confirmed and the required write is explicitly approved. Do not infer this from local SQLite metadata.
9. Record sanitized outcomes. Provider acceptance is not proof of inbox delivery; local thread association is not proof of CRM association.

No message was sent; no external endpoint was contacted; no CRM records, production data, DNS, or provider settings were changed.
