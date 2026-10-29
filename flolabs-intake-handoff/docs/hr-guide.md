# HR guide: FloLabs intake forms and Twenty CRM

For the FloLabs HR team. It explains how applicants reach FloLabs through the forms, what arrives in Twenty, what every field means, and what HR does at each stage. No technical knowledge is needed; the few steps that need the tech team are marked **(tech team)**.

Last updated: 26 October 2026.

---

## 1. The big picture

The forms replace the old HubSpot forms. Everything an applicant or visitor sends lands in **Twenty**, FloLabs' CRM (https://157-230-82-204.sslip.io).

**The intern recruitment pipeline:**

1. **Application.** The applicant fills in the Application form on a FloLabs website (or through a link).
2. **Contacted.** HR emails the applicant two personal links: **Form 1 "Tell Us More About You"** and **Form 2 "Getting Ready for Your Orientation"**.
3. **Orientation meeting.**
4. **Masterclass.** HR emails the personal link to **Form 3 "Final Steps Before Your Interview"** (self-assessment and two references).
5. **Final interview → Onboarded.**

Besides the pipeline, every FloLabs website can show a **Contact Us** form and a **Newsletter** sign-up box.

**What the system does automatically:** checks every answer, blocks bots and spam, saves each submission in Twenty, links it to the right person, application and website, and writes a readable summary of the answers.

**What HR still does by hand (for now):** send the Form 1-3 links, move applicants between pipeline stages (Lead Status), answer Contact Us messages, and decide on applicants. Automatic production email and automatic stage changes remain deferred. A separate Mailjet HTTPS command exists only for an explicitly allowlisted test recipient; it is not the production HR workflow.

## 2. The forms at a glance

| Form | Who fills it | How they get it | What it creates in Twenty |
|---|---|---|---|
| **Application** | Anyone applying for an internship | Embedded on a FloLabs website, or the link `https://forms.flolabsinnovations.com/apply?site=<website>` | A **Person** (or updates an existing one) + one **Application** with the CV |
| **Form 1: Tell Us More About You** | An applicant HR has contacted | A personal link from HR | A **Form Submission** (type Contacted) linked to the Application |
| **Form 2: Getting Ready for Your Orientation** | The same applicant, before the orientation meeting | A personal link from HR | A **Form Submission** (type Before Meeting) |
| **Form 3: Final Steps Before Your Interview** | An applicant after the masterclass | A personal link from HR | A **Form Submission** (type Masterclass) + two **Reference** records |
| **Contact Us** | Any website visitor | Embedded on a FloLabs website | A **Person** (or updates one) + an **Inquiry** |
| **Newsletter** | Any website visitor (email only) | Embedded on a FloLabs website | A **Person** (or updates one) with newsletter consent |

**One person, one record.** People are matched by **email address**. If someone who already exists in Twenty applies again or signs up for the newsletter, the system reuses their Person record and **only fills fields that are still empty**. It never overwrites what is already there, so corrections HR makes in Twenty are kept.

## 3. What HR does at each stage

### Stage 1: a new application arrives

Open **Applications** in Twenty. Each new Application is named "**First Last - Program(s)**", for example "Jane Doe - UI/UX Design Intern, Finance Intern".

Check on the record:
- **Programs Applied For**: one or more of the 40 programs (section 7). One Application holds all the programs chosen in that submission.
- **CV / Resume**: click to open the CV (PDF or Word, max 5 MB, checked on upload).
- **Person**: the applicant's name, email, phone, location, LinkedIn and education are on the linked Person.
- **Site** and **Site status**: which website the application came from (section 6).
- **How did you hear about us?** (`Source`), with **Source Detail** (when "Other") or **Referral Name** (when "Referral").
- **Consents**: whether the applicant agreed to marketing emails or text messages (section 8).

New Applications start with **Lifecycle Stage = Interested** and **Lead Status = Uncontacted**. HR updates Lead Status by hand as the applicant moves on.

### Stage 2: contacting the applicant (Forms 1 and 2)

1. **Create an email draft (authorized tech team).** Use the Application id from Twenty and the command in the appendix. It looks up the applicant, checks both forms are not already submitted, and prints a draft with two personal links.
2. **Review and send the draft manually** from hr@flolabsinnovations.com (template in section 10). The command does not send email.
3. Set **Lead Status = Contacted** on the Application.

About the links:
- Each link is **personal**: it belongs to one Application and one form. Never send one applicant's link to someone else.
- Each link **works once**. After the applicant sends the form, the link shows "You have already sent this form".
- Links **expire 21 days** after the tech team creates them. After that the applicant sees "This link has expired" and is asked to write to hr@flolabsinnovations.com; ask the tech team for a new link. So send links soon after you receive them.
- Opening a link or filling it halfway does not use it up. Only a successful send does.
- The forms can be sent in any order; nothing forces Form 1 before Form 2.

What the applicant sees: their name, email and programs at the top (read-only), a sentence telling them which track each program belongs to, and only the questions for **their own programs**. Someone who applied for programs in two tracks gets one combined form. Forms 1 and 2 have three steps (About you or Program overview → Interest or Thought and Feedback → Closing question). The applicant can go back and forth, and their answers are saved **in their own browser** while they type, so closing the tab does not lose them on that device.

### Stage 3: reading Forms 1 and 2

Open the Application, then its **Form Submissions**, or open **Form Submissions** directly. Each is named "**Form 1 (Contacted) - First Last**" or "**Form 2 (Before Meeting) - First Last**".

- **Answers Summary**: read this. It lists every question in bold with the applicant's answer below, grouped by section and program.
- The filter fields (section 9) let you sort and filter many applicants at once, for example everyone who can commit at least 15 hours a week, or everyone with "Yes but I have questions".

Set **Lead Status = Before Meeting** once Form 2 is in, if that is your convention.

### Stage 4: the masterclass (Form 3)

Create and review the **Form 3 email draft (authorized tech team)** using the command in the appendix, then send it manually (template in section 10). The command checks that Form 3 has not already been submitted and does not send email. Form 3 has three steps: Self-assessment and continued interest → References → Contacting your references.

When it arrives:
- The **Form Submission** "Form 3 (Masterclass) - First Last" shows whether they want to continue to the final interview, whether they can meet the commitment, and whether FloLabs may contact their references (with their explanation if not).
- Two **References** are linked to the Application: full name, position/title, organization, relationship, email, phone (optional) and how long they have known the applicant. The two references always have different emails, and neither is the applicant's own.
- **Only contact references if "References contact allowed" is Yes.**

### Contact Us messages

Open **Inquiries**. Each is named "**First Last - Subject**", with the full message, the website it came from, and a link to the Person (whose email you reply to).

**Status** starts at **New**. Set it to **In Progress** when someone is handling it and **Closed** when done. Nobody is notified automatically, so check Inquiries regularly (or set up a saved view filtered on Status = New).

### Newsletter sign-ups

A sign-up creates or updates a **Person** with:
- **Communication Consent** = Yes
- **Communication Consent At** = date and time of sign-up
- **Consent Version** = which consent wording they saw (`newsletter-consent-v1`)
- **Communication Consent Site** = the website they signed up on

To list subscribers: People → filter **Communication Consent = Yes**.

**Unsubscribe requests:** set Communication Consent to No on the Person, and note the date.

**Important:** the newsletter is **single opt-in** for now. People are subscribed as soon as they submit their email; there is no confirmation email yet. A confirmation step (double opt-in) will come with Amazon SES. Until then, if someone says they never signed up, set their consent to No.

## 4. What applicants may tell you, and what to answer

| The applicant says / sees | What it means | What HR does |
|---|---|---|
| "This link is not valid" | The link was changed, cut off in the email, or is for another form | Ask them to click the link directly from the email. If it still fails, ask the tech team for a new link. |
| "We could not find your application" | The Application was deleted in Twenty | Check the Application still exists. If they should continue, they apply again or the tech team creates a link for the right Application. |
| "You have already sent this form" | The form was already received | Nothing: the answers are in Twenty. If they need to change something, they email HR, who notes it on the record. |
| "This form is temporarily unavailable" | Twenty could not be reached at that moment | Ask them to try again later. If it lasts more than an hour, tell the tech team. |
| "Too many attempts. Please wait a moment and try again." | The anti-spam limit was hit (section 11) | Ask them to wait 30 minutes and try again. |
| "We could not verify your submission" | The security check (Cloudflare) failed | Ask them to reload the page and try again, with ad-blockers or VPN off if possible. |
| CV refused | The file is not a real PDF or Word (.docx) file, or is over 5 MB | Ask them to export their CV as PDF, under 5 MB. |
| "I lost my answers" | Answers are kept only in the browser and device they used, until they send | They should reopen the link **in the same browser on the same device**; the answers come back. On another device they start again. |
| "I don't want my answers left on a shared computer" | The draft is in that browser | The link at the bottom of the form, **Clear my draft**, deletes it. Sending the form also deletes it. |

## 5. Do's and don'ts

- **Do** edit Person details in Twenty when an applicant asks for a correction; the forms will not overwrite them.
- **Do** keep the **Sites** list up to date (section 6). Ask the tech team before adding a new website.
- **Don't** forward an applicant's link to anyone else: whoever opens it can answer in the applicant's name.
- **Don't** edit the **Answers** field (raw data) on Form Submissions. If you must note something, use a Note on the record.
- **Don't** delete Sites, or change a program or source **value** in Twenty's settings. The forms depend on them; ask the tech team first. Changing a **label** (the visible name) is safe.
- **Don't** paste API keys or passwords into emails or chats.
- **Privacy:** Applications, Form Submissions, References and Inquiries contain personal data. Only FloLabs staff who need it should have Twenty access. FloLabs still has to decide how long this data is kept and who deletes it.

## 6. Websites (Sites) and "Site status"

Each FloLabs website has a **Site** record in Twenty (16 today: FloLabs International, Robocollective, FloBrain, Bootcamp University, ...). When a form is placed on a website, it is tagged with that website's **Site ID** (for example `robocollective`), so every submission knows where it came from.

Forms are accepted **only from a website that is in Twenty and active**. A submission is **refused** (the visitor sees "This form cannot be sent from this page", and nothing is saved in Twenty) when:
- no website was given, for example the `/apply` link was shared **without `?site=`**;
- the Site ID is not in Twenty, for example a new website not added yet;
- the website is marked **inactive** (today: Flomad).

So always share the Application link **with** its `?site=`, for example `https://forms.flolabsinnovations.com/apply?site=flolabs_international`. A new website must be added by the tech team (with the project lead's approval) before its forms work.

Every Application and Inquiry therefore has **Site status = Known** and is linked to its Site. Older test records may still show Missing, Unknown or Inactive from before this rule.

## 7. Programs and tracks

Each internship is a **program**. Each program belongs to one **track**. In Twenty, programs are in **Programs Applied For** on the Application; tracks are in **Tracks** on each Form Submission.

| Track | Programs |
|---|---|
| **AI & Software Engineering** (9) | AI/AGI Intern; Backend Developer Intern; Computer Vision Engineering Intern; Front-end Developer Intern; Machine Learning Engineering Intern; Prompt Engineer Intern; Quality Assurance Intern; Research Associate Intern (Open-Source Projects); Software Development Intern |
| **Robotics & Intelligent Systems** (8) | Control Systems Engineering Intern; Embedded Systems Intern; Human-Robot Interaction Intern; Mechatronics Engineering Intern; Product Development Intern (AI & Robotics); Robotics Engineering Intern; Sensor Integration Intern; Neuroscience Intern |
| **Business Management, Growth & Entrepreneurship** (13) | Business Development and Sales Intern (AI and Robotics); Content Marketing Intern; Digital Marketing Intern; Finance Intern; GTM Engineer (Go-To-Market Engineer) Intern; GTM Influencer Intern; Hospitality and Tourism Intern; Marketing Intern; Operations Intern; Podcast Production Intern Position; Project Management Intern; SEO Specialist Intern; Social Media Intern |
| **Design & Technical Communication** (3) | Journalism & PR Intern; Technical Writing Intern; UI/UX Design Intern |
| **Emerging Sciences & Technology** (7) | Animal Science and Veterinary Research Intern; Biomedical Engineering Intern; EdTech and Innovation Intern; Ethical and Legal Research Intern; Quantum Engineer Intern; Space Science Intern; Sport Science Intern |

In Twenty, the business track is spelled "Business Management **/** Growth & Entrepreneurship" (Twenty does not allow commas in option names). It is the same track.

## 8. Field reference

### Person (People)

| Field | Comes from | Notes |
|---|---|---|
| Name (first, last) | Application, Contact Us | |
| Emails | All forms | Used to recognise returning people |
| Phones | Application | Stored with the country code |
| Location (country, state, city) | Application | State is optional |
| Linkedin | Application | Optional; must be a linkedin.com address |
| Education | Application | Education/major |
| Communication Consent / At / Consent Version / Communication Consent Site | Newsletter, or the Application's marketing tick box | Newsletter subscription (section 3) |

### Application

| Field | Meaning |
|---|---|
| Name | "First Last - Program(s)" |
| Programs Applied For | One or more of the 40 programs |
| CV / Resume | The CV file |
| Source ("How did you hear about us?") | One of 26 options, e.g. LinkedIn, Handshake, Referral, Other |
| Source Detail / Referral Name | Filled when the source is Other / Referral |
| Safe Sender Confirmed | The applicant confirmed they added hr@flolabsinnovations.com to their contacts (required) |
| Communication Consent (+ At) | Ticked "Send me FloLabs news, programs and event updates by email" (optional) |
| Phone Messaging Consent (+ At) | Ticked "Send me text messages (SMS) about my application and FloLabs programs" (optional) |
| Consent Version | Which consent wording was shown (`application-consent-v1`) |
| Site / Site Status / Site Key Received | The website it came from (section 6) |
| Submitted At | Date and time of submission |
| Lifecycle Stage / Lead Status | Interested / Uncontacted at first; HR updates them |
| Source Form ID / Form Version / Submission Key | Technical; leave as they are |

### Form Submission

| Field | Meaning |
|---|---|
| Name | "Form 1 (Contacted) - First Last" (or Form 2 / Form 3) |
| Form Type | Contacted (Form 1), Before Meeting (Form 2), Masterclass (Form 3) |
| Tracks | The applicant's track(s) |
| Answers Summary | **Read this**: every question and answer, formatted |
| Answers | The raw answers (technical source of the summary; do not edit) |
| Submitted At, Form Version, Submission Key | Technical details |
| Application | The Application it belongs to |

Filter fields (filled only by the form that asks the question):

| Field | Form | Values |
|---|---|---|
| Hours Per Week | Form 1 | 1 to 40 |
| Commitment Duration | Form 1 | Under 3 months / 3-6 months / 6-12 months / Over 12 months |
| Remote Ok | Form 1 | Comfortable working remotely in a team: Yes / No |
| Can Attend Meetings | Form 1 | Yes / No |
| Still Interested | Form 2 | Yes definitely / Yes but I have questions / I'm unsure / No |
| Continue To Interview | Form 3 | Yes / No |
| Can Meet Commitment | Form 3 | Yes / No / I need to discuss my availability |
| References Contact Allowed | Form 3 | Yes / No (if No, the explanation is in the Answers Summary) |

### Reference

| Field | Meaning |
|---|---|
| Full Name, Title, Organization, Relationship | As given by the applicant |
| Email, Phone | Phone is optional |
| Known Duration | 0-6 months / 6-12 months / 1-2 years / 2-3 years |
| Application | The applicant's Application |

### Inquiry (Contact Us)

| Field | Meaning |
|---|---|
| Name | "First Last - Subject" |
| Subject, Message | What the visitor wrote |
| Status | New / In Progress / Closed (HR updates it) |
| Person | Who wrote (reply to their email) |
| Site / Site Status / Site Key Received | Which website (section 6) |
| Submitted At | Date and time |

**"Created by"** on records made by the forms shows **"Application Form Integration"**: the name of the system's access key, not a person.

## 9. Finding things quickly in Twenty

Suggested saved views (Twenty: open a list → filter/sort → save as view):
- **New applications:** Applications, Lead Status = Uncontacted, sorted by Submitted At (newest first).
- **Form 1 received:** Form Submissions, Form Type = Contacted.
- **Has questions before orientation:** Form Submissions, Still Interested = Yes but I have questions.
- **Ready for final interview:** Form Submissions, Form Type = Masterclass, Continue To Interview = Yes.
- **Open Contact Us messages:** Inquiries, Status = New.
- **Newsletter subscribers:** People, Communication Consent = Yes.

## 10. Email templates

Adapt freely. Send from hr@flolabsinnovations.com; applicants confirmed they added this address to their contacts.

**Forms 1 and 2 (after the application):**

> Subject: Your FloLabs application: next steps
>
> Hello {First name},
>
> Thank you for applying to {Program}. Before we meet, please complete these two short forms:
>
> 1. Tell Us More About You: {Form 1 link}
> 2. Getting Ready for Your Orientation: {Form 2 link}
>
> Each link is personal and works once. Your answers are saved on your device as you type, so you can come back to them in the same browser.
>
> Best regards,
> FloLabs HR

**Form 3 (after the masterclass):**

> Subject: FloLabs: final steps before your interview
>
> Hello {First name},
>
> Thank you for attending the masterclass. Please complete this last form, which includes two professional or academic references:
>
> Final Steps Before Your Interview: {Form 3 link}
>
> The link is personal and works once.
>
> Best regards,
> FloLabs HR

## 11. Limits and protections (good to know)

- **Bot protection:** every form runs a Cloudflare security check, usually invisible to the person.
- **Anti-spam limits:** at most **50 sends per 10 minutes from one internet connection**, and **5 submissions per 30 minutes for one email address** (for Forms 1-3: per Application). Normal applicants never reach them.
- **CVs:** PDF or Word (.docx) only, max 5 MB, checked to be real documents.
- **Answers Summary:** what applicants type is shown as plain text; links or formatting they type cannot turn into clickable traps.
- **Personal links:** cannot be guessed or altered; a changed link is refused.

## 12. Who to contact

| Topic | Contact |
|---|---|
| Form 1-3 links, a form not working, a new website, changes to questions | The tech team running the forms (see the production runbook) |
| Twenty access, users, permissions | The Twenty administrator (team lead) |
| What to ask applicants, wording of emails | HR |

**Changing questions or wording** is a small code change (the questions live in the forms app, with a version number stored on every submission). Send the exact new wording to the tech team.

---

### Appendix: creating an HR email draft (authorized tech team)

On the server where the forms app runs (see the production runbook, step 7), use the Application id from Twenty. The command checks the Application, applicant email, program data, and already-submitted forms before printing the draft. Links remain personal, single-use, and expire 21 days after creation.

```bash
cd /opt/flolabs-forms/repo/flolabs-intake-handoff
sudo -u flolabs-forms node --env-file=/opt/flolabs-forms/.env.production \
  --conditions=react-server scripts/make-hr-email-draft.mts <applicationId> contacted https://forms.flolabsinnovations.com
```

Use `contacted` for Forms 1 and 2 or `masterclass` for Form 3. Review the recipient, subject, programs, and links before sending. This command only creates a draft; it never sends email. Personal links expire 21 days after creation.

The allowlist-gated Mailjet/IMAP procedure is documented in [email-local-testing.md](./email-local-testing.md). It must only be used with an approved test mailbox and test Application; do not use it to contact applicants.
