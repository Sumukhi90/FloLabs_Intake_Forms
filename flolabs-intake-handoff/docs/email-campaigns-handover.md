# Email & Campaigns handover

Status as of 2026-10-30: **local HR test implementation available; live acceptance blocked by missing credentials, permissions, and approvals**.

## What exists

- The HR workflow generates drafts. A separate, non-production Mailjet HTTPS test command requires an explicit recipient allowlist. It is not the regular applicant notification workflow. Initial acceptance must use the dedicated test mailbox; the real HR inbox must not be connected.
- The server-only mailbox module implements provider delivery, IMAP UID/UIDVALIDITY synchronization, parsing, Message-ID reply threading, deduplication, and a local SQLite test store. It does not write email messages or threads to Twenty.
- IMAP synchronization now selects an administrator-configurable folder (`CRM_EMAIL_IMAP_MAILBOX`, default `INBOX`), explicitly requires TLS certificate and hostname validation, and refuses the live HR mailbox username before connecting. Use only the dedicated acceptance mailbox.
- HR test outbound uses Mailjet Send API v3.1 over HTTPS with the fixed HR sender and Reply-To. The implementation is locally mocked only; API credentials, sender verification and live provider acceptance remain unverified.
- HR test sends now check a persistent, local SQLite suppression table immediately before outbound reservation/provider invocation. The test-only `block-hr-email:test` command records `MANUAL_TEST_BLOCK`; duplicate block requests preserve the original reason. Suppression lookup failures fail closed. These local entries are not synced with Twenty or the separate marketing suppression backend and are not production suppression storage.
- The HR test command emits structured JSON audit events to stdout/stderr with a correlation ID, UTC timestamp, CRM IDs when available, redacted recipient, outcome, suppression reason, provider-invocation status, retry count, and test execution mode. It does not retain a separate durable audit log. Provider acceptance is recorded separately from inbox delivery confirmation.
- Marketing eligibility requires an explicit `MARKETING` purpose, topic, and eligibility callback. Consent must be true in the existing Twenty Person record and active suppression lookups must return clear; failures block. No campaign sender currently wires this path to a live provider. Bulk sending remains deferred.
- Existing unsubscribe/feedback code remains outside this one-to-one HR deliverable. AWS resources and access are explicitly out of scope; no AWS deployment, DNS change, or AWS integration test is part of this work.
- Application links remain single-use and expire after 21 days. Existing loopback HTTP support is unchanged.

## This work

- Added a local, persistent manual HR test-blocklist and wired it into the shared email send path so HR and marketing sends fail closed on a matching local entry or a suppression lookup error.
- Added a Mailjet v3.1 HTTPS sender with safe handling for authorization, rate-limit, rejected-message, and uncertain-delivery results; it carries Message-ID, In-Reply-To, References, fixed HR sender and Reply-To. The test HR command now uses this adapter, adds its correlation ID to the subject, and audits the Mailjet provider ID where returned.
- Added structured, PII-redacted audit output to the test send command and documented local-only scope, safety boundaries, and the blocked-send procedure.
- Added tests for Mailjet request construction and provider outcomes, suppressed-recipient rejection before the provider request, suppression lookup failure, persistence across store restarts and IMAP UIDVALIDITY changes, normalized addresses, idempotent reason preservation, provider non-acceptance, and safe reply association using `References` without `In-Reply-To` while rejecting unrelated correspondents.
- Removed the unused direct Nodemailer sender dependency; outbound test delivery is exclusively Mailjet HTTPS.

## Verification performed

- Full suite: 31 test files passed, 3 skipped; 446 tests passed, 12 skipped.
- Focused Mailjet/email/environment suite: 3 test files passed; 58 tests passed.
- `npm run lint`, `npm run typecheck`, and `npm run build` passed. Next.js emitted a non-fatal warning that it found a parent `package-lock.json` outside this Git repository.
- `git diff --check` passed. `npm run build:ses-feedback` was not run because AWS/SES is explicitly out of scope.
- The HR suppression tests are mocked/local: they verify that a persisted `MANUAL_TEST_BLOCK` prevents the provider mock from being called and that suppression lookup failures fail closed. They do not prove a live mailbox or CRM integration.
- IMAP safety tests verify the live HR username is refused before a client/network connection is created; live mailbox isolation and DNS/mail-routing status remain unverified.
- No live CRM read/write, mailbox connection, Mailjet send, email receive, or reply test was performed. No test Applications or People were created and no recipient was added to the configured local test blocklist. No email was sent and no CRM record changed. `.env.local` is absent; dedicated test mailbox, CRM, and Mailjet configuration must be provisioned securely before live verification.

## Required access and approvals

See [email-access-request.md](./email-access-request.md) for a concise, ready-to-send request separated by owner.

### Atankeu / Twenty workspace administrator

- Provision the target workspace URL and a short-lived API key through the authorized local secret store as `TWENTY_BASE_URL` and `TWENTY_API_KEY`. For discovery, grant read-only GraphQL access to People/Application counts and the approved synthetic Person/Application records, plus read-only `/metadata` schema queries and GraphQL introspection. Do not grant write access for schema discovery.
- Provide read-only browser access to the workspace version/about view, Data Model, and Accounts > Emails.
- Confirm which test Person and Application are synthetic and safe to inspect. Do not export applicant data.
- The current execution has no local `.env.local` or relevant environment configuration and reaches the sign-in page. API version, record counts, API permissions, and mailbox status therefore remain unverified.

### Whitney

- Approve any future schema change only after the actual workspace schema proves it is needed. No schema change is proposed here.
- Approve the test sender, test recipient, reply-from account, synthetic CRM record, and any live send/receive test.
- Keep Application association indirect or unset. Thread association to People is also blocked until native operations and permissions are confirmed.

### Mailbox owner / operations

- Provision credentials and exact connection settings for the dedicated test mailbox locally using `CRM_EMAIL_IMAP_HOST`, `CRM_EMAIL_IMAP_PORT`, `CRM_EMAIL_IMAP_MAILBOX`, `CRM_EMAIL_IMAP_USERNAME`, and `CRM_EMAIL_IMAP_PASSWORD`. Never connect the real HR inbox during acceptance. Authorize execution-host network access using implicit TLS and validate the certificate hostname.
- Provision Mailjet credentials locally using `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `MAILJET_FROM_EMAIL=hr@flolabsinnovations.com`, and `MAILJET_REPLY_TO_EMAIL=hr@flolabsinnovations.com`. Verify and authorize the sender/domain and approve the dedicated test recipient in `CRM_EMAIL_ALLOWED_RECIPIENTS` before any send.
- Confirm the test mailbox is available under Accounts > Emails only for inspection. Do not connect or alter CRM settings without authorization.

### Test-record owner

- After read-only discovery, provide permission to create exactly two temporary test Applications and their correctly linked People if those records do not already exist. Prefer a dedicated test workspace or record-limited permissions; no broad production write access. Provide only synthetic required form fields through an approved local channel, identify the authorized test mailbox there, and confirm the test records can be removed afterward if policy permits.
- Approve one blocked-send test to the suppressed test address and one real test send to the explicitly authorized mailbox. No live send is permitted until sender, recipient, reply-from account, and test records are confirmed.

## Exact next steps after access is provisioned

1. Run the existing read-only probe from this folder:
   `node --env-file=.env.local scripts/t1-schema-probe.mjs .local/twenty-schema-current.json`
   Compare current People/Application counts from GraphQL, object-list rows, and Data Model counts in the same workspace/account. Investigate workspace identity, filters, soft-deleted records, and permission scope; do not infer missing data from the UI count alone.
2. Inspect the live GraphQL schema and read-only Accounts > Emails state. Confirm native email send, message/thread read/query, People target association, and the exact required permissions. Do not implement CRM persistence based only on the historical T2e snapshot.
3. If native People-thread support is verified and approved, implement only those supported operations; leave Application association indirect/unset. Obtain Whitney's decision before any schema change.
4. With an approved test mailbox, recipient, reply-from account, verified Mailjet sender, and synthetic Person, test provider acceptance, actual inbox delivery, reply, IMAP sync, Message-ID/In-Reply-To/References matching, duplicate sync, and supported Person association. Record each outcome; Mailjet acceptance is not delivery proof.
5. Add a truthful local `MANUAL_TEST_BLOCK` only after the test recipient is approved. Run the normal HR command once against the blocked test Application and verify the logged `RECIPIENT_SUPPRESSED` outcome with `providerInvoked: false`. Then, only after explicit approval and mailbox setup, test the eligible recipient, inbox receipt, reply threading, duplicate prevention, and People association. Do not send campaigns or perform AWS work.

The reported screenshot counts (6 People, 3 Applications) and zero Data Model Records values, and the saved 2026-10-24 snapshot counts (6 and 3), are observations that do not resolve the discrepancy. No current live evidence is available.

This document records implementation and access status, not authoritative Git metadata. Check the repository status and commit history at handover time.
