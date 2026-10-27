# Non-production email feedback and suppression setup

This is an approval-gated implementation guide, not authorization to deploy or send. Campaign delivery remains deferred. The HR Form 1-3 workflow remains draft-only and is not coupled to marketing consent or suppression.

## Proposed flow

```text
SES configuration set -> restricted SNS topic -> Lambda -> DynamoDB suppression table
                                            \-> Lambda asynchronous failure destination -> SQS DLQ
```

The handler accepts messages only from its configured SNS topic. Delivery, rejection, transient/undetermined bounce, and delay events are recorded as processed but do not suppress an address. Permanent bounces and complaints create all-marketing suppressions. Event identifiers are hashed before storage; logs contain result codes and counts, not message content or recipient addresses.

The app's durable store is DynamoDB, configured through `AWS_REGION` and `SUPPRESSION_TABLE_NAME`; the app should use its workload IAM role, never static AWS keys. Before marketing eligibility can pass, the app separately finds the recipient in Twenty and requires `communicationConsent === true`, then checks the DynamoDB suppression table. Neither the feedback handler nor its test-only in-memory store sends mail. The HR draft command remains independent.

The Lambda obtains `AWS_REGION` from the AWS runtime; do not define it in the function's configured environment variables because Lambda reserves that key. The feedback handler's DynamoDB store queries active suppressions, so its execution role needs `dynamodb:Query` in addition to the item get/put/update actions.

## Approval and prerequisites

Before an administrator performs any AWS action:

- **Whitney** approves the suppression reasons/scopes, the single-opt-in policy, unsubscribe language, secret management/link ownership, and whether any future marketing sender may be enabled. Bulk campaign sending remains deferred unless explicitly approved.
- **Atankeu** reviews the app-side store/event contract against the existing suppression PoC and confirms that the PoC remains a separate, non-production example rather than a second source of truth.
- **Whitney/CRM administrator** confirms that `communicationConsent` is the approved current marketing-consent field, and approves the unsubscribe update semantics. No Twenty schema changes are included.
- **AWS administrator** selects an isolated non-production account and region, reviews the template and IAM policy, confirms SES event-publishing support, establishes the approved workload roles, and owns any deployment/rollback.
- **DNS administrator** confirms the authoritative zone and existing senders before publishing only actual SES-generated records. DNS changes are not part of this stack or guide's implementation.

Do not use production contacts or send real email for validation. The current app has no sender that generates these links; token generation is not integrated into any email path.

## Build and template review

Run from `flolabs-intake-handoff/`:

```powershell
npm run build:ses-feedback
sam validate --template-file infra/aws/template.yaml
sam build --template-file infra/aws/template.yaml
```

The build produces `infra/aws/dist/handler.mjs`; the SAM `CodeUri` points to that local bundle. Build and validate only after installing the lockfile dependencies. This project does not deploy automatically. A human administrator must review the built template and account/region before any deployment. The template limits `EnvironmentName` to `dev` or `staging`, retains the DynamoDB table on deletion/replacement, enables point-in-time recovery and server-side encryption, and expires only processed-event markers after one year.

Local verification on 2026-10-27: the handler bundle builds and the template parses with the installed YAML parser; a structural check confirms the feedback role has the required `dynamodb:Query` action and the function does not configure reserved `AWS_REGION`. `sam validate` and `sam build` remain unverified because SAM CLI is unavailable. No AWS resources were deployed.

If and only if the approved administrator separately authorizes a non-production deployment, SAM's guided deployment is:

```powershell
sam deploy --guided --template-file .aws-sam/build/template.yaml
```

Choose the approved non-production account/region and review the change set. Do not deploy from this task or infer production approval from the presence of the template. Before production use, add operational alarms for Lambda errors/DLQ depth and document a tested replay procedure; the proposed template does not configure notification destinations or prove those operations.

## Least-privilege permissions

The template gives the feedback Lambda role only:

- `dynamodb:GetItem` and `dynamodb:PutItem` for event markers, `dynamodb:UpdateItem` for suppression records, and `dynamodb:Query` for active suppression lookups on the one table;
- `sqs:SendMessage` on the one failure queue;
- `logs:CreateLogStream` and `logs:PutLogEvents` on that function's log group.

The Lambda resource policy grants invocation only to the SNS service for this topic. The topic policy allows `ses.amazonaws.com` to publish only for the selected account and this stack's SES configuration-set ARN. Do not broaden either policy to `Principal: *`. SES must be configured separately to associate only an approved identity and the generated configuration set; this stack does not verify identities or enable sending.

The failure destination can contain the original SES/SNS invocation payload, including recipient addresses. Although the handler never logs that payload, authorize DLQ readers narrowly, do not export or log message bodies, and approve retention/replay handling before deployment. The proposed queue is encrypted and retained for at most 14 days; no consumer or alarm is provisioned here.

The deployed app's own workload role needs only `dynamodb:Query` for the pre-send check and `dynamodb:UpdateItem` for unsubscribe writes on the same table ARN. It does not need event-marker, SNS publish, SES send, SQS, or Lambda permissions. The app still needs its separately configured, least-privilege Twenty credential to find and update People. Do not put AWS access keys in `.env` or a source file.

The app returns an unavailable response for unsubscribe requests if the suppression table/region is not configured. The handler fails closed on DynamoDB errors so an eligibility lookup cannot authorize a marketing send. These safeguards do not replace IAM review or a deployed sender-side check.

## SES-generated DNS verification checklist

Use values from the selected SES account and region only. **Never copy example or placeholder record values into public DNS.** The SES configuration set in this template is for feedback events, not identity verification.

- [ ] Confirm the exact domain/subdomain and sender identity with Whitney and the AWS administrator.
- [ ] In SES, create/verify the approved identity and copy the actual SES-generated domain-verification TXT name/value.
- [ ] Enable the approved DKIM mode and copy each actual SES-generated DKIM CNAME name/target (Easy DKIM normally provides three).
- [ ] Have the DNS administrator confirm the authoritative zone, current apex SPF TXT value, and all existing senders. Preserve the existing SPF record; never add a second SPF TXT record. Merge only an approved SES mechanism into the existing record if SES's selected sending path requires it.
- [ ] If custom MAIL FROM is approved, use the actual SES-generated subdomain, MX target, and SPF requirements. Do not invent these values or apply the default MAIL FROM instructions to a custom domain.
- [ ] Review the current DMARC policy, strict alignment, reporting destination, and all senders. Changes to `p=none`, `quarantine`, or `reject` require domain-owner approval; do not invent a reporting address.
- [ ] After the DNS administrator publishes the approved values, verify them using authoritative and independent DNS lookups, then confirm the identity and DKIM status in the same SES region. Record the timestamp, region, identity, and observed statuses without storing credentials.
- [ ] Do not send a test message unless Whitney and the AWS administrator explicitly approve the sender, recipient, account production status, and synthetic test plan.

The earlier read-only audit observed an existing apex SPF record and `_dmarc` policy with `p=none` and strict SPF/DKIM alignment. Those public resolver observations are not authoritative-zone confirmation and are not SES verification evidence. No DNS records were changed.

## Application handover and limitations

- The unsubscribe URL uses a signed capability in the URL fragment so the token is not sent in the initial page request. A future authorized sender must include this URL in an approved marketing message; there is no current sender integration or `List-Unsubscribe` header integration.
- Twenty consent changes performed manually are still checked at send time; a DynamoDB suppression also blocks marketing even if a CRM field is later changed.
- No mechanism to lift suppressions or automatically resubscribe is provided. Approve and implement an audited policy before adding one.
- Synthetic tests cover parsing, duplicate events, retry after persistence failure, suppression, unsubscribe, and fail-closed eligibility. They do not verify AWS delivery/retry semantics, IAM, SES interoperability, deployment, or end-to-end behavior.
- The Python suppression PoC remains separate, in-memory, and unsuitable for production authorization.
