# Twenty schema map (T1)

Verified against the live instance on 2026-10-23 (`https://157-230-82-204.sslip.io`); schema updates and snapshots through 2026-10-24 are historical evidence, not a verification of the instance's current version.
Machine-readable snapshots: `docs/snapshots/twenty-schema-2026-10-23.json` (T1), the `2026-10-24-t2a` through `t2e` snapshots (subsequent schema changes and metadata), and the later `t2c`/`t2d` snapshots for Site status and Inquiry changes. The latest saved metadata snapshot is `docs/snapshots/twenty-schema-2026-10-24-t2e.json`.
Re-generate with `node --env-file=.env.local scripts/t1-schema-probe.mjs <out.json>` from `flolabs-intake-handoff/`.

T1 live data observed on 2026-10-23: 5 People, 1 Application, 1 Site, 0 Attachments.

## Current access and count discrepancy (2026-10-27)

The user reports that current workspace screenshots show 6 People and 3 Applications in their object views, but zero records in the Data Model screen's Records column. The repository's last saved metadata snapshot, `docs/snapshots/twenty-schema-2026-10-24-t2e.json`, also records 6 People and 3 Applications. These are separate observations; the snapshot does not explain the Data Model display, and neither count should be treated as proof of the other's correctness.

This execution could not query the live workspace: opening `https://157-230-82-204.sslip.io` reached the sign-in page, and no `TWENTY_BASE_URL`/`TWENTY_API_KEY` was configured locally. The UI screenshots establish visibility only. The Accounts > Emails menu was not accessible for inspection, so mailbox connection status, workspace version, native email API availability, and API-key permissions remain unverified. The application authenticates its named GraphQL operations with `TWENTY_API_KEY`; its current client has no email/thread operations.

The saved T2e metadata snapshot shows a `messageThreadTargets` relation on Person and no corresponding `messageThreadTargets` relation on the custom Application object (which has `agentChatThreadTargets`). This is schema-snapshot evidence only, not verification that the current workspace supports message/thread reads or writes. Do not add a custom relation or alter the schema without owner approval.

To reconcile the displayed counts, an authorized read-only check should compare, in the same workspace and account, the People and Applications list query results with the Data Model metadata record counts, while noting filters, soft-deleted records, and permission scope. To verify email support, inspect that workspace's API schema/playground and Accounts > Emails state using authorized access; do not infer support from the menu or the Person relation alone.

## Schema structure from saved live verification (2026-10-23; changes through 2026-10-24)

```mermaid
erDiagram
    PERSON ||--o{ APPLICATION : "applications / person (personId)"
    SITE ||--o{ APPLICATION : "applications / site (siteId)"
    PERSON ||--o{ ATTACHMENT : "attachments / targetPerson"
    APPLICATION ||--o{ ATTACHMENT : "attachments / targetApplication"
    SITE ||--o{ ATTACHMENT : "attachments / targetSite"
    PERSON }o--o| COMPANY : "company (native, unused)"

    PERSON {
        FULL_NAME name
        EMAILS emails
        PHONES phones
        ADDRESS location
        LINKS linkedinLink
        TEXT education
        TEXT legacyHubspotId
    }
    APPLICATION {
        TEXT name
        MULTI_SELECT positionAppliedFor "Programs Applied For, 40 options"
        SELECT source "26 options"
        TEXT submissionKey
        SELECT siteStatus
        TEXT siteKeyReceived
        TEXT sourceDetail
        TEXT referralName
        BOOLEAN safeSenderConfirmed
        DATE_TIME submittedAt
        TEXT sourceFormId
        TEXT formVersion
        SELECT lifecycleStage
        SELECT leadStatus
        FILES cvResume
        BOOLEAN communicationConsent
        DATE_TIME communicationConsentAt
        BOOLEAN phoneMessagingConsent
        DATE_TIME phoneMessagingConsentAt
        TEXT consentVersion
    }
    SITE {
        TEXT name
        TEXT siteId
        TEXT hostname
        BOOLEAN active
    }
    ATTACHMENT {
        TEXT name
        FILES file
        SELECT fileCategory
    }
```

People also carry Twenty's native activity relations (notes, tasks, timeline, calendar, messages, opportunities, list memberships); Applications and Sites have notes, tasks and timeline.

## API access with the current key

| Endpoint | Result | Use |
|---|---|---|
| REST records `/rest/<plural>` | 200 | Record reads/writes. Not used by the app: the `filter` parser fails on `)` and `,` even inside quotes (T3) |
| GraphQL records `/graphql` | 200 | Record reads/writes. **Used by the app** (values as variables) |
| REST metadata `/rest/metadata/objects` | 200 (403 until 2026-10-24) | Schema reads and changes (T2) |
| GraphQL metadata `/metadata` | 200 | Schema reads, file upload mutations |
| OpenAPI `/rest/open-api/core` | 200 | Per-object request/response schemas |

Schema changes go through GraphQL `/metadata` (`updateOneField`, `createOneField`); see `scripts/t2a-apply.mjs`. Updating a select field's `options` replaces the whole list, so existing options must be re-sent with their ids.

## Write formats (composite fields)

Values are API values, never UI labels.

| Twenty type | Write shape |
|---|---|
| FULL_NAME | `{ firstName, lastName }` |
| EMAILS | `{ primaryEmail, additionalEmails: [] }`. Person.emails has `maxNumberOfValues: 1` |
| PHONES | `{ primaryPhoneNumber, primaryPhoneCountryCode, primaryPhoneCallingCode, additionalPhones: [] }`. Person.phones has `maxNumberOfValues: 1` |
| LINKS | `{ primaryLinkUrl, primaryLinkLabel, secondaryLinks: [] }` |
| ADDRESS | `{ addressStreet1, addressStreet2, addressCity, addressState, addressPostcode, addressCountry }` (also addressLat/Lng) |
| SELECT | one value string, e.g. `"OTHER"` |
| MULTI_SELECT | array of value strings, e.g. `["UI_UX_DESIGN_INTERN", "FINANCE_INTERN"]` |
| FILES | array of `{ fileId, label }` (response adds `extension`, `url`) |
| RELATION (many-to-one) | set the join column: `personId`, `siteId` |

Confirmed by a test write in T5 (2026-10-24): `addressCountry` = English country name ("United States"); `primaryPhoneNumber` = national number ("5125550142"), `primaryPhoneCountryCode` = ISO code ("US"), `primaryPhoneCallingCode` = "+1".

## Person (`person` / `people`)

| Spec field | API name | Type | Notes |
|---|---|---|---|
| First/Last Name | `name.firstName` / `name.lastName` | FULL_NAME | |
| Email | `emails.primaryEmail` | EMAILS | match key |
| Phone | `phones` | PHONES | |
| Country / State / City | `location.addressCountry` / `.addressState` / `.addressCity` | ADDRESS | label "Location" |
| LinkedIn URL | `linkedinLink.primaryLinkUrl` | LINKS | label "Linkedin" |
| Education/Major | `education` | TEXT | |
| (relation) | `applications` | RELATION one-to-many -> `application.person` | |
| (relation) | `attachments` | RELATION one-to-many -> `attachment.target` | |
| (other, unused) | `legacyHubspotId`, `jobTitle`, `company`/`companyId`, `avatarFile` | | |

## Application (`application` / `applications`)

| Spec field | API name | Type | Notes |
|---|---|---|---|
| (label identifier) | `name` | TEXT | Display name in the UI. Value to be decided in T5 |
| Programs Applied For | `positionAppliedFor` | MULTI_SELECT | label "Programs Applied For" (T2a), 40 options, see below |
| How did you hear about us? | `source` | SELECT | single value, 26 options (T2a), see below |
| Site status | `siteStatus` | SELECT | added in T2c: `KNOWN`, `MISSING`, `UNKNOWN`, `INACTIVE`; field id `e1f9fe42-a6d7-4077-ae4b-7f41ed01193f` |
| Site key received | `siteKeyReceived` | TEXT | added in T2c: `?site=` value as received (max 64); field id `af0dfd1a-a93b-47cb-8b8a-0a1882fceadb` |
| Submission key | `submissionKey` | TEXT | added in T2a, field id `e1fd1843-ca3c-4b38-8c79-c46b34483170`; retry protection (spec D8) |
| Source Detail | `sourceDetail` | TEXT | exists |
| Referral Name | `referralName` | TEXT | exists |
| Safe-sender confirmation | `safeSenderConfirmed` | BOOLEAN | default false |
| Submitted At | `submittedAt` | DATE_TIME | |
| Source Form ID | `sourceFormId` | TEXT | |
| Form Version | `formVersion` | TEXT | |
| Lifecycle Stage | `lifecycleStage` | SELECT | `INTERESTED` |
| Lead Status | `leadStatus` | SELECT | `UNCONTACTED`, `CONTACTED`, `BEFORE_MEETING` |
| CV | `cvResume` | **FILES** | label "CV / Resume", `maxNumberOfValues: 10`, field id `b0449d1e-9e4f-42e5-8ba2-f53b9c4f8de8` |
| Person | `person` / `personId` | RELATION many-to-one -> `person.applications` | onDelete SET_NULL |
| Site | `site` / `siteId` | RELATION many-to-one -> `site.applications` | onDelete SET_NULL |
| Attachments | `attachments` | RELATION one-to-many -> `attachment.target` | |
| Marketing/newsletter consent | `communicationConsent`, `communicationConsentAt` | BOOLEAN / DATE_TIME | kept and used (spec D5) |
| SMS/phone consent | `phoneMessagingConsent`, `phoneMessagingConsentAt` | BOOLEAN / DATE_TIME | kept and used (spec D5) |
| Consent wording version | `consentVersion` | TEXT | |

### positionAppliedFor options (live)

Values are the API values to send. Decision (2026-10-24): live labels are kept; the third column shows the earlier spec proposal, now superseded. `BACKEND_DEVELOPER_INTERN` "Backend Developer Intern" was added in T2a (last position).

| Value | Live label (kept) | Earlier spec proposal (superseded) |
|---|---|---|
| `AI_AGI_INTERN` | AI/AGI Intern | **AI/AGI Developer Intern** |
| `BACKEND_DEVELOPER_INTERN` | Backend Developer Intern | = (added in T2a) |
| `FRONT_END_DEVELOPER_INTERN` | Front-end Developer Intern | **Front-End Developer Intern** |
| `JOURNALISM_PR_INTERN` | Journalism & PR Intern | **Journalism and PR Intern** |
| `PODCAST_PRODUCTION_INTERN_POSITION` | Podcast Production Intern Position | **Podcast Production Intern** |
| `PRODUCT_DEVELOPMENT_INTERN_AI_ROBOTICS` | Product Development Intern (AI & Robotics) | **Product Development Intern (AI and Robotics)** |
| `ANIMAL_SCIENCE_AND_VETERINARY_RESEARCH_INTERN` | Animal Science and Veterinary Research Intern | = |
| `BIOMEDICAL_ENGINEERING_INTERN` | Biomedical Engineering Intern | = |
| `BUSINESS_DEVELOPMENT_AND_SALES_INTERN_AI_AND_ROBOTICS` | Business Development and Sales Intern (AI and Robotics) | = |
| `COMPUTER_VISION_ENGINEERING_INTERN` | Computer Vision Engineering Intern | = |
| `CONTENT_MARKETING_INTERN` | Content Marketing Intern | = |
| `CONTROL_SYSTEMS_ENGINEERING_INTERN` | Control Systems Engineering Intern | = |
| `DIGITAL_MARKETING_INTERN` | Digital Marketing Intern | = |
| `EDTECH_AND_INNOVATION_INTERN` | EdTech and Innovation Intern | = |
| `EMBEDDED_SYSTEMS_INTERN` | Embedded Systems Intern | = |
| `ETHICAL_AND_LEGAL_RESEARCH_INTERN` | Ethical and Legal Research Intern | = |
| `FINANCE_INTERN` | Finance Intern | = |
| `GTM_ENGINEER_GO_TO_MARKET_ENGINEER_INTERN` | GTM Engineer (Go-To-Market Engineer) Intern | = |
| `GTM_INFLUENCER_INTERN` | GTM Influencer Intern | = |
| `HOSPITALITY_AND_TOURISM_INTERN` | Hospitality and Tourism Intern | = |
| `HUMAN_ROBOT_INTERACTION_INTERN` | Human-Robot Interaction Intern | = |
| `MACHINE_LEARNING_ENGINEERING_INTERN` | Machine Learning Engineering Intern | = |
| `MARKETING_INTERN` | Marketing Intern | = |
| `MECHATRONICS_ENGINEERING_INTERN` | Mechatronics Engineering Intern | = |
| `NEUROSCIENCE_INTERN` | Neuroscience Intern | = |
| `OPERATIONS_INTERN` | Operations Intern | = |
| `PROJECT_MANAGEMENT_INTERN` | Project Management Intern | = |
| `PROMPT_ENGINEER_INTERN` | Prompt Engineer Intern | = |
| `QUALITY_ASSURANCE_INTERN` | Quality Assurance Intern | = |
| `QUANTUM_ENGINEER_INTERN` | Quantum Engineer Intern | = |
| `RESEARCH_ASSOCIATE_INTERN_OPEN_SOURCE_PROJECTS` | Research Associate Intern (Open-Source Projects) | = |
| `ROBOTICS_ENGINEERING_INTERN` | Robotics Engineering Intern | = |
| `SENSOR_INTEGRATION_INTERN` | Sensor Integration Intern | = |
| `SEO_SPECIALIST_INTERN` | SEO Specialist Intern | = |
| `SOCIAL_MEDIA_INTERN` | Social Media Intern | = |
| `SOFTWARE_DEVELOPMENT_INTERN` | Software Development Intern | = |
| `SPACE_SCIENCE_INTERN` | Space Science Intern | = |
| `SPORT_SCIENCE_INTERN` | Sport Science Intern | = |
| `TECHNICAL_WRITING_INTERN` | Technical Writing Intern | = |
| `UI_UX_DESIGN_INTERN` | UI/UX Design Intern | = |

### source options (live, SELECT, after T2a)

`INDEED_COM` "Indeed", `GLASSDOOR_COM` "Glassdoor", `GOOGLE_COM` "Google", `FACEBOOK_COM` "Facebook", `INSTAGRAM_COM` "Instagram", `LINKEDIN_COM` "LinkedIn", `SIMPLYHIRED_COM` "SimplyHired", `NORTHEASTERN_UNIVERSITY_S_INTERNAL_JOB_PORTAL` "Northeastern University's Internal Job Portal", `AUSTIN_COMMUNITY_COLLEGE` "Austin Community College", `TEXAS_A_M_UNIVERSITY_CORPUS_CHRISTI` "Texas A&M University-Corpus Christi", `TEXAS_A_M_UNIVERSITY_KINGSVILLE` "Texas A&M University-Kingsville", `JACKSON_COLLEGE` "Jackson College", `PURDUE_NORTHWEST` "Purdue Northwest", `CENTRAL_GEORGIA_TECHNICAL_COLLEGE` "Central Georgia Technical College", `HANDSHAKE` "Handshake", `ALABAMA_STATE_UNIVERSITY` "Alabama State University", `WORK_UA` "Work.ua", `TIKTOK` "TikTok", `REDDIT` "Reddit", `YOUTUBE` "YouTube", `X_TWITTER` "X (Twitter)", `COMPANY_WEBSITE` "Company Website", `JOB_BOARD` "Job Board", `EVENT` "Event", `REFERRAL` "Referral", `OTHER` "Other".

T2a added TikTok, Reddit, YouTube, X (Twitter), Company Website, Job Board, Event and Referral, and relabelled the 8 ".com"/Northeastern options; values unchanged. `OTHER` stays last.

## Site (`site` / `sites`)

| API name | Type |
|---|---|
| `name` | TEXT |
| `siteId` | TEXT (site key) |
| `hostname` | TEXT |
| `active` | BOOLEAN (default true) |
| `applications` | RELATION one-to-many -> `application.site` |
| `attachments` | RELATION one-to-many -> `attachment.target` |

Records (16, created 2026-10-24 by `scripts/t2-sites.mjs`; `flomad` inactive: expired certificate, site down). Checked 2026-10-26 against the project lead's canonical registry (`src/shared/config/sites.ts`): every `siteId`, name and hostname matches; no cleanup needed. Only active Sites are accepted on submission:

| id | name | siteId | hostname | active |
|---|---|---|---|---|
| `dd1ed9f3-b482-4935-993d-54c9fdadc1bc` | Athletic Performance Intelligence | `athletic_performance_intelligence` | www.athleticperformanceintelligence.com | true |
| `5ed5b8db-1958-4617-9942-2d45fb908a98` | Bootcamp University | `bootcamp_university` | www.bootcampuniversity.org | true |
| `5cbfa225-5e5e-4d8d-8676-c5e4a8ff3a86` | CAIPO | `caipo` | www.caipo.ai | true |
| `865f923f-ad6b-415b-a895-da476a749da4` | Cosmos Intelligence | `cosmos_intelligence` | www.cosmosintelligence.org | true |
| `71ef0476-0540-4229-800f-74c86fc266b5` | FloBrain | `flobrain` | www.flobrain.ai | true |
| `be6cc5b2-2405-490d-9471-77a37a861c7a` | FloLabs Innovations Group | `flolabs_innovations_group` | www.flolabsinnovations.com | true |
| `f39c8196-db3d-41ee-bc58-abfecf43933d` | FloLabs International | `flolabs_international` | www.flolabs.international | true |
| `1ed21c2c-f7ec-4343-a965-425d03568069` | Flomad | `flomad` | www.flomad.com | false |
| `1bf1758e-36b9-4e7c-88c2-d315744459b0` | Flomad Travel | `flomad_travel` | www.flomadtravel.com | true |
| `136a52fe-250d-40b3-b94f-43b9d05c178a` | Flo Studios | `flo_studios` | www.flostudios.ai | true |
| `68dc7d9c-1d22-446d-bce9-b668f6e86990` | Hephaestus International | `hephaestus_international` | www.hephaestus.international | true |
| `da57350e-bedc-4f4a-9d03-5806065f6b8f` | Legal Ethics Ventures Institute | `legal_ethics_ventures_institute` | www.legalethicsventuresinstitute.com | true |
| `97d16c63-27aa-48a4-b26a-9e2f0729238b` | Moodchanger | `moodchanger` | www.moodchanger.ai | true |
| `c87adcc9-1edd-4a4e-af19-1ee6f8fc80d5` | Robocollective | `robocollective` | www.robocollective.ai | true |
| `77bd7aa8-c574-4bf9-96c2-4b8b0c712c4c` | Space Ventures Institute | `space_ventures_institute` | www.spaceventuresinstitute.com | true |
| `4fbfaae6-c3b7-4dc1-9de7-32c91d65ef5c` | TARRL | `tarrl` | www.tarrl.org | true |

## Attachment (`attachment` / `attachments`)

`name` TEXT, `file` FILES (`maxNumberOfValues: 1`), `fullPath` TEXT (legacy), `fileCategory` SELECT (`ARCHIVE`, `AUDIO`, `IMAGE`, `PRESENTATION`, `SPREADSHEET`, `TEXT_DOCUMENT`, `VIDEO`, `OTHER`), polymorphic target join columns incl. `targetApplicationId`, `targetPersonId`, `targetSiteId`.

## File upload (CV path decision)

The API supports server-side file upload through GraphQL `/metadata`:

1. `createFileUpload(filename, size, fileFolder: FilesField, fieldMetadataId: "<FILES field id>")` returns `FileUploadTarget { fileId, uploadUrl, contentType, expiresAt }`.
2. PUT the bytes to `uploadUrl`.
3. `completeFileUpload(fileId)`.
4. Write the record with `cvResume: [{ fileId, label }]` (or an Attachment with `file: [...]` + `targetApplicationId`).

**Result: path A is supported by the API.** Preferred variant: the native `Application.cvResume` FILES field (field id above), since HR sees the CV on the record itself. An Attachment record is the alternative. Not yet exercised end to end (T1 is read-only). T6c confirms with a real upload, after T6c-0 points storage at R2.

## Inquiry (`inquiry` / `inquiries`), created in T2b 2026-10-24

`name` TEXT ("First Last - Subject"), `subject` TEXT, `message` TEXT, `status` SELECT (`NEW` default, `IN_PROGRESS`, `CLOSED`), `submittedAt` DATE_TIME, `submissionKey` TEXT, `person`/`personId` RELATION many-to-one -> `person.inquiries`, `site`/`siteId` RELATION many-to-one -> `site.inquiries`, `siteStatus` SELECT (`KNOWN`/`MISSING`/`UNKNOWN`/`INACTIVE`) and `siteKeyReceived` TEXT (added in T2d, `scripts/t2d-inquiry-site-status.mjs`, snapshot `twenty-schema-2026-10-24-t2d.json`). Object id `4c3e95a3-0373-4f1f-91b1-55e7845cf78c`.

**Permissions (resolved 2026-10-24):** the API key's role first got FORBIDDEN on Inquiry (new objects are not covered by per-object role rules); the team lead granted access and the live writes passed.

## Form Submission (`formSubmission` / `formSubmissions`), created 2026-10-24

`name` TEXT, `formType` SELECT (`CONTACTED`, `BEFORE_MEETING`, `MASTERCLASS`), `tracks` MULTI_SELECT (5 track values; Twenty label for `BUSINESS_GROWTH_ENTREPRENEURSHIP` is "Business Management / Growth & Entrepreneurship" because option labels may not contain commas), `formVersion` TEXT, `submittedAt` DATE_TIME, `submissionKey` TEXT, `answers` RAW_JSON, `answersSummary` RICH_TEXT, `hoursPerWeek` NUMBER, `commitmentDuration` SELECT (`UNDER_3_MONTHS`, `MONTHS_3_TO_6`, `MONTHS_6_TO_12`, `OVER_12_MONTHS`), `remoteOk` / `canAttendMeetings` / `continueToInterview` / `referencesContactAllowed` BOOLEAN, `stillInterested` SELECT (`YES_DEFINITELY`, `YES_WITH_QUESTIONS`, `UNSURE`, `NO`), `canMeetCommitment` SELECT (`YES`, `NO`, `NEED_TO_DISCUSS`), `application`/`applicationId` RELATION many-to-one -> `application.formSubmissions`. GraphQL enum for formType: `FormSubmissionFormTypeEnum`.

## Reference (`reference` / `references`), created 2026-10-24

`name` TEXT labelled **"Full Name"** (the reference's full name), `title` TEXT, `organization` TEXT, `relationship` TEXT, `email` EMAILS, `phone` PHONES, `knownDuration` SELECT (`MONTHS_0_TO_6`, `MONTHS_6_TO_12`, `YEARS_1_TO_2`, `YEARS_2_TO_3`), `application`/`applicationId` RELATION many-to-one -> `application.references`.

**Permissions (resolved 2026-10-24):** read/create granted like Inquiry. Verified live: `answers` RAW_JSON and `answersSummary` sent as `{ markdown }` are stored as sent; Reference `phone` accepts empty parts when no phone is given.

## Person consent fields, created in T2b 2026-10-24

`communicationConsent` BOOLEAN (default false), `communicationConsentAt` DATE_TIME, `consentVersion` TEXT, `communicationConsentSite` TEXT (site key). Filled by the Newsletter and by the Application marketing opt-in when empty (spec D17).

## Approved changes (spec section 7, Checkpoint A 2026-10-24)

**T2a applied on 2026-10-24** (`scripts/t2a-apply.mjs`). Verified by diffing the before/after snapshots: only the T2a changes below; no field or option removed, no value renamed, record counts unchanged.

- **T2a (POC, applied):** Application: add `BACKEND_DEVELOPER_INTERN`; 8 `source` options + label cleanup (values unchanged); relabel `positionAppliedFor` to "Programs Applied For" (API name unchanged); `submissionKey` TEXT.
- **T2b (revised POC, not applied):** `inquiry`, `formSubmission` (with `answers` RAW_JSON + `answersSummary` RICH_TEXT, which stores `{ markdown }`), `reference`. None exist yet. No `subscription` object. Person: `communicationConsent`, `communicationConsentAt`, `consentVersion`, `communicationConsentSite` for Newsletter sign-ups (names approved).

Every record gets an auto-generated `id` (UUID) from Twenty. The REST create schema does not accept a client `id`, so retry protection uses the separate `submissionKey` field.

The instance also has native `messageList` (name, description, members, campaigns), `messageListMember` (list, person) and `messageCampaign` objects (Twenty's email campaigns). They track list membership only (no consent fields), a possible target for the Newsletter later.
