# Email & Campaigns handover

Status as of 2026-10-27: **partially implemented; live integration blocked**.

## What exists

- The HR workflow generates drafts. A separate, non-production SMTP test command requires an explicit recipient allowlist. It is not the regular applicant notification workflow.
- The server-only mailbox module implements SMTP delivery, IMAP UID/UIDVALIDITY synchronization, parsing, Message-ID reply threading, deduplication, and a local SQLite test store. It does not write email messages or threads to Twenty.
- Marketing eligibility requires an explicit `MARKETING` purpose, topic, and eligibility callback. Consent must be true in the existing Twenty Person record and active suppression lookups must return clear; failures block. No campaign sender currently wires this path to a live provider. Bulk sending remains deferred.
- Unsubscribe updates the Person consent flag and records durable suppression when the configured store is available. SES event processing stores hard-bounce and complaint suppressions; duplicate markers are idempotent. The SES/SNS/Lambda path is not deployed or connected to the mailbox SMTP sender.
- Application links remain single-use and expire after 21 days. Existing loopback HTTP support is unchanged.

## This work

- Rejected invalid runtime sender purposes and normalized/validated suppression topic identifiers consistently before lookups and persistence.
- Corrected the SES Lambda role to include `dynamodb:Query`, required by its suppression-store lookups. Removed configured `AWS_REGION` from the Lambda environment because Lambda provides this reserved runtime variable.
- Added focused tests for invalid purpose/topic, topic normalization, and fail-closed eligibility. Updated setup and schema documentation with current evidence and approvals needed.

## Verification performed

- Full tests: `npm test` — **426 passed, 12 skipped** (30 test files passed, 3 skipped).
- Focused email/suppression tests: **58 passed** across six files.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run build:ses-feedback` passed.
- The SAM template parsed using the installed YAML parser; structural checks confirmed the feedback role includes `dynamodb:Query` and the function does not configure `AWS_REGION`. `sam validate` and `sam build` were unavailable because SAM CLI is not installed.
- `git diff --check` passed. A scan found no AWS key, private key, or non-placeholder mailbox password in the modified tracked files.
- No live CRM, mailbox, HubSpot, or AWS test was performed. No email was sent, CRM record changed, infrastructure deployed, or DNS changed.

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

- Provision the test mailbox credentials locally (never in chat or source) using `CRM_EMAIL_IMAP_HOST`, `CRM_EMAIL_IMAP_PORT`, `CRM_EMAIL_IMAP_USERNAME`, `CRM_EMAIL_IMAP_PASSWORD`, `CRM_EMAIL_SMTP_HOST`, `CRM_EMAIL_SMTP_PORT`, `CRM_EMAIL_SMTP_USERNAME`, and `CRM_EMAIL_SMTP_PASSWORD`.
- Authorize execution-host network access and provide an explicit recipient allowlist in `CRM_EMAIL_ALLOWED_RECIPIENTS`. Use implicit TLS (IMAP 993, SMTP 465); do not disable certificate checks.
- Confirm the test mailbox is available under Accounts > Emails only for inspection. Do not connect or alter CRM settings without authorization.

### AWS administrator

- Provide an isolated non-production account/role and region if SES feedback live verification is requested. Review the corrected IAM role, function/SNS permissions, SES identity/configuration set, and failure queue access.
- Install/enable SAM CLI for full template validation. Any deployment, SES configuration, or DNS action requires separate explicit authorization and owner review.

## Exact next steps after access is provisioned

1. Run the existing read-only probe from this folder:
   `node --env-file=.env.local scripts/t1-schema-probe.mjs .local/twenty-schema-current.json`
   Compare current People/Application counts from GraphQL, object-list rows, and Data Model counts in the same workspace/account. Investigate workspace identity, filters, soft-deleted records, and permission scope; do not infer missing data from the UI count alone.
2. Inspect the live GraphQL schema and read-only Accounts > Emails state. Confirm native email send, message/thread read/query, People target association, and the exact required permissions. Do not implement CRM persistence based only on the historical T2e snapshot.
3. If native People-thread support is verified and approved, implement only those supported operations; leave Application association indirect/unset. Obtain Whitney's decision before any schema change.
4. With an approved test mailbox, recipient, reply-from account, and synthetic Person, test provider connectivity, send and verify actual inbox delivery, reply, sync, Message-ID/In-Reply-To/References matching, duplicate sync, and Person association. Record each outcome; SMTP acceptance is not delivery proof.
5. Test consent denial, active suppression, unsubscribe, duplicate/delayed SES events, and hard-bounce/complaint suppression against an isolated authorized non-production store. Do not send marketing or deploy the SES stack until separately approved.

The reported screenshot counts (6 People, 3 Applications) and zero Data Model Records values, and the saved 2026-10-24 snapshot counts (6 and 3), are observations that do not resolve the discrepancy. No current live evidence is available.

This document records implementation and access status, not authoritative Git metadata. Check the repository status and commit history at handover time.
