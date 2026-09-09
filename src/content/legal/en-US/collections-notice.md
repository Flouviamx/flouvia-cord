---
docId: collections-notice
version: "2026-09-01"
effectiveDate: "2026-09-01"
supersedes: null
locale: en-US
jurisdiction: GLOBAL
appliesToCountries: [MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE]
requiresAction: false
action: none
acceptanceScope: none
publicationStatus: draft
sourceKind: markdown
editorialStage: technical-draft
sourceOfTruth: src/content/legal/en-US/collections-notice.md
artifactRoute: /en/legal/collections-notice
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["terms","privacy"]
sourceSections: ["terms@2026-08-11#pagos-autorizacion","privacy@2026-08-29#uso"]
releaseBlockers: ["verified-identity", "debt-classification", "stop-channel", "participant-attribution", "provider-account-contracts", "legal-review", "versioned-publication"]
---

# Collections notice

**TECHNICAL DRAFT — unpublished and not in force.** The frontmatter date identifies this editorial copy, not the start of a campaign or contractual change. This notice authorizes no new messages and does not replace the terms agreed between creditor and debtor.

## 1. Scope and participants

Cord enables the business using it (the Customer) to manage receivables and, if it activates the relevant feature, prepare or send email reminders on behalf of the creditor. Cord is a Flouvia technology tool: it does not purchase the debt, become the creditor, a law firm or a financial institution, or decide whether an amount is legally enforceable.

The Customer retains the buyer relationship and is responsible for the creditor's identity, the source and accuracy of the balance, the contact channel and commercial terms. Flouvia's complete identity, address and legal contacts still require verification for publication.

## 2. Eligible receivables and configuration

The flow selects overdue balances from quotes or invoices, accounts for applicable payments and credits, and excludes settled balances, current plans, excluded records and cases outside the configuration. Within technical limits, the Customer sets grace period, cadence, minimum amount, language, tone, signature, maximum per run and the point at which installments may be proposed.

The initial configuration is disabled and uses approval mode. Autonomous collections require an eligible plan and express activation by a permitted user. The scheduled run is daily in the reviewed Vercel Hobby configuration; manual execution also exists. Scheduling does not guarantee delivery, exact frequency or recovery.

Before activation, the Customer must determine whether an account is commercial or consumer, who may receive communications and which notice, time, frequency, validation, record or licensing requirements apply. Cord does not automatically classify these obligations by country, state, debt type or recipient.

## 3. Approval and automatic mode

In approval mode, the model prepares a draft. An authorized user may edit, regenerate, discard or approve it; only approval attempts delivery. Approval can also materialize a proposed payment plan before the email is attempted. If delivery later fails, the plan may remain active and its state must be checked.

In automatic mode, generated output is attempted without individual human review. Grace, cadence, exclusion and volume controls reduce unwanted sends but do not establish the legal or factual correctness of each message. Enabling that mode records the Customer's operational choice; it does not shift all responsibility for content or system behavior away from Cord.

## 4. Identification, content and stop channel

The email identifies the creditor using the available name, may include a tax identifier, uses “creditor via Cord,” provides a Reply-To when configured, states that it is an automated collections message and includes a link to the available document or payment path. It must not threaten, harass, impersonate authorities, disclose the debt to unrelated third parties or claim nonexistent consequences or powers.

Each email says the person can reply or contact the creditor to request that automated messages stop. **This is currently a request, not an instant Cord-enforced unsubscribe.** Automated inbound replies to Cord are blocked by middleware; the creditor must monitor its mailbox, verify the request and add the relevant exclusion. The UI can exclude a customer, quote or invoice, but no public one-click unsubscribe link exists.

The Customer must not enable messages when the contact is inappropriate, withdrawn, exposes information to third parties or is already subject to an applicable stop request. It must maintain a complaints, correction and preferences process. Any legal exceptions to cessation require separate analysis; this notice does not decide them.

## 5. Amounts, links, installments and interest

Messages rely on Cord's balance and days-overdue calculations; the Customer must verify them and correct misrecorded payments, credits or due dates. A link supports payment only where the rail is available; otherwise it opens the document and options. It must not be described as a tax record or judgment.

The agent may propose two to six installments only after the configured threshold and where no plan is active. The server computes amounts that add to the balance and disallows principal discounts. In approval mode, a proposal remains pending until a user activates it; in automatic mode it can be materialized through the model's tool when context appears to contain acceptance.

Today, seller and buyer messages are mapped to the same role in model context, and inbound email is disabled. The system therefore **does not demonstrate reliable attribution of installment acceptance to the debtor**. This is a release blocker: automatic negotiation or activation of plans must not be offered until participant separation and acceptance evidence are implemented.

Automatic late interest remains disabled in every country. A historical value or Customer text does not authorize its generation, and this notice sets no rate.

## 6. Data and providers

To select and draft, Cord processes organization and document identifiers, buyer name and email, balance, currency, due date, days overdue, link, settings and selected history. Context sent to Anthropic can include name, balance, delinquency, link and history; Resend receives recipient, sender, subject and content for email delivery.

The Customer must limit history and signatures to relevant information, avoid unnecessary sensitive or third-party data and have a basis for supplying the data. Anthropic and Resend roles, regions, contracts and transfers must be coordinated with privacy, the DPA and subprocessors before publication.

## 7. Records, outcomes and limits

Cord stores drafts, messages, status, errors, dates, provider identifiers, approvals, exclusions and plan events. A “sent” status means the provider accepted the delivery request; it does not establish reading, receipt by the proper person, validity of the balance or agreement.

Cord does not guarantee a response, payment, plan, preservation of a commercial relationship or compliance merely through use of the tool. The Customer must monitor failures, stop automation where appropriate and provide human review. Nothing excludes Cord's own obligations concerning design, security or execution.

## 8. Coordination and blockers

This notice is coordinated with the approved versions of terms, privacy, payment terms, AI disclosure and acceptable use policy. It does not replace creditor contracts or mandatory law, and it does not automatically make Cord a regulated collection agency.

**Blockers:** identity/contacts; classification by market and debt type; public stop channel and verified execution; participant separation and plan-acceptance evidence; roles/contracts/transfers; retention and complaints; bilingual legal review and versioned publication.

Provenance and evidence: [phase 5.3 automation review](../../../../docs/historial/revisiones-legales/2026-09-01-automation.md). Original clauses remain preserved as identified by `sourceSections`.
