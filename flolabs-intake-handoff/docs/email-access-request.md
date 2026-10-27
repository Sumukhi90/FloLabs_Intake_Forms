# Email integration access request

Ready to send to the named owners. Please provision credentials through the approved local secret store or an authorized secret manager integration; **do not send passwords, API keys, or tokens in chat or email**. This request does not authorize production changes, live email, schema changes, or DNS changes. AWS resources and access are out of scope.

## Atankeu / Twenty workspace administrator

Please provide:

- The current workspace URL and a short-lived API key through the local secret store as `TWENTY_BASE_URL` and `TWENTY_API_KEY`.
- Read-only GraphQL permissions for People and Applications `totalCount`, the probe's Site fields (`id`, `name`, `siteId`, `hostname`, `active`) and Attachment `totalCount`, plus reads of only the explicitly identified synthetic test Person/Application and their relevant Person relationship.
- Read-only `/metadata` access for object, field, and relationship metadata, plus GraphQL introspection for the current schema and supported email/thread operations.
- A read-only authenticated browser session for the workspace version/about view, People and Applications lists, Data Model, and Accounts > Emails.

No create/update/delete, schema mutation, or send-email permission is requested for discovery. We will compare current API counts, Data Model counts, and visible list rows in the same workspace/account to investigate the reported 6/3 versus zero discrepancy. Please identify a synthetic test Person and Application safe to inspect. Do not provide bulk contact exports.

For the separately authorized acceptance test, after read-only duplicate checks, please enable temporary permission to create only the two approved synthetic test People and Applications (each Application linked to its Person) in a dedicated test workspace or with the narrowest available record scope. Do not grant schema, delete, or general production write access. If these permissions cannot be limited safely, provide a dedicated test workspace instead.

## Whitney

Please confirm:

- The dedicated synthetic Person, sender mailbox, recipient, reply-from account, and allowed test scenario for a later live end-to-end test.
- That the recipient address may receive a uniquely identifiable test message and reply, and that no real applicant or production record will be used.
- The already selected data policy: People association only after native support is verified; Application association remains indirect or unset.
- Any required schema change must be proposed separately and receive your explicit approval before implementation. This request does not seek schema-change approval.
- Confirm the two explicitly described synthetic records and one blocked-send / one allowed-send test are authorized, including removal of test records if appropriate under retention policy.

## Mailbox owner / operations

Please confirm the dedicated test mailbox is enabled for authenticated IMAP and SMTP over implicit TLS, and authorize network access from the development/test host. Provision its connection settings and credentials only through the approved local secret store using:

- `CRM_EMAIL_IMAP_HOST`, `CRM_EMAIL_IMAP_PORT=993`, `CRM_EMAIL_IMAP_USERNAME`, `CRM_EMAIL_IMAP_PASSWORD`
- `CRM_EMAIL_SMTP_HOST`, `CRM_EMAIL_SMTP_PORT=465`, `CRM_EMAIL_SMTP_USERNAME`, `CRM_EMAIL_SMTP_PASSWORD`
- `CRM_EMAIL_ALLOWED_RECIPIENTS` containing only Whitney-approved test recipient(s)

Please explicitly name the authorized sender, test recipient, and reply-from account. No real-applicant recipients, bulk sends, or TLS-validation exceptions are requested. Do not connect or change Twenty Accounts > Emails settings without separate approval.

For local use, place `TWENTY_BASE_URL`, `TWENTY_API_KEY`, `LINK_TOKEN_SECRET`, the SMTP and IMAP settings above, the two approved recipients in `CRM_EMAIL_ALLOWED_RECIPIENTS`, `CRM_EMAIL_DATABASE_PATH=.local/email.sqlite`, and `CRM_EMAIL_TEST_COMMANDS_ENABLED=true` in the approved local secret store or ignored `.env.local`. Set `CRM_EMAIL_TEST_BLOCK_RECIPIENT=natanahelatankeu@gmail.com` only for the local test-blocklist operation. Do not send these values in chat. The run must be non-production and use the explicit allowlist.

## After access is ready

1. The developer runs the existing read-only Twenty schema/count probe and checks the same-workspace UI/API counts.
2. The developer verifies the live GraphQL email/thread operations, actual permission requirements, and Accounts > Emails connection without changing settings.
3. If supported and approved, implement People association only; leave Application association indirect/unset.
4. After Whitney approves the synthetic recipient and scenario, perform one controlled send-and-reply test, verify received content in the test mailbox, thread headers, duplicate sync behavior, and CRM association.
5. Test consent, the local HR test blocklist, unsubscribe handling, and provider-failure behavior with isolated test resources. Report each case and any unavailable path separately. Do not send campaigns or perform AWS work.
