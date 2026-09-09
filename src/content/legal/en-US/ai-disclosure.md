---
docId: ai-disclosure
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
sourceOfTruth: src/content/legal/en-US/ai-disclosure.md
artifactRoute: /en/legal/ai-disclosure
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["privacy","collections-notice"]
sourceSections: ["privacy@2026-08-29#uso","privacy@2026-08-29#dpa"]
releaseBlockers: ["verified-identity", "anthropic-account-evidence", "ai-transparency-review", "mcp-tool-confirmation", "participant-attribution", "human-review-procedure", "legal-review", "versioned-publication"]
---

# Artificial intelligence disclosure

**TECHNICAL DRAFT — unpublished and not in force.** The frontmatter date is editorial. This text describes features reviewed as of September 1, 2026; it does not enable AI, change providers or constitute a compliance assessment.

## 1. Scope and provider

Cord uses Anthropic's commercial API for two functions: converting text, images or PDFs into draft quote line items, and drafting collection messages or proposals. The particular model may change through technical configuration; displaying a model name does not guarantee constant behavior.

Anthropic receives instructions and content only when a feature is invoked or an enabled automation runs. Its current public information says commercial-product chats are not used for model training unless the commercial customer participates or expressly opts in, but that publication does not establish the Cord account's configuration, contract, region or retention. Those matters remain blocked pending verification.

## 2. Quote drafting

A user may submit free text and an image or PDF within technical limits. Cord adds the active catalog—identifiers, names, units and prices—so the model can extract concepts and suggest matches. The file and catalog are transmitted to Anthropic; no separate local OCR is performed.

Output returns to the editor as line items. When an identifier matches, the server retakes name, unit and list price from the catalog and constrains quantities and suggested prices, but it does not validate the complete order, buyer intent, taxes, inventory or legality. The endpoint does not automatically save or send the draft: the user must review it in the editor.

Documents can contain misleading instructions, personal data, secrets or unrelated content. The Customer must minimize files and review every page. Format and size limits alone do not detect prompt injection, fraud or third-party rights.

## 3. MCP tools and integrations

If plan and configuration permit, the quote assistant may query active MCP servers the agent is allowed to access. Tool names, descriptions, schemas, calls and results pass through the AI flow; results may be sent back to Anthropic as context.

Authorizing a server currently normally grants `["*"]`, meaning every tool it exposes. The model can invoke them without per-call human confirmation, and the code does not verifiably distinguish reads from writes. An externally effective tool could therefore modify a connected system. Write tools must not be enabled until per-tool permissions, effect classification, preview, confirmation and audit are implemented. Disabling or deleting a server does not reverse prior actions.

## 4. AI collections and actions

The agent receives buyer name, balance, days overdue, link, settings and selected history. It drafts email in Spanish or English and may propose installments within server-validated limits. It cannot discount principal or generate automatic late interest.

In approval mode, output remains a draft that a user can edit, regenerate, discard or approve. Approval may activate a proposed plan before attempting email delivery. In automatic mode, text is sent without individual human review and a tool may materialize installments when context appears to contain acceptance.

Current context does not reliably distinguish seller from buyer, and inbound replies are disabled. Automatic installment negotiation is blocked until attribution and evidence are corrected. The model must not be presented as a lawyer, authority, final decision-maker or human.

## 5. Transparency to individuals

Current automated email states that it is an automated collections message sent by Cord for the creditor. That disclosure must remain visible and understandable, including after editing. Reply-To identifies the creditor's channel when configured.

The interface must distinguish AI suggestions from confirmed data and allow human correction. Cord does not currently add a universal technical mark or machine-readable metadata to every generated text. Nor is there a public per-output screen explaining model, version, criteria or appeal route. Applicable requirements must be assessed by feature and market; a generic “AI” label does not establish compliance.

## 6. Data, purposes and retention

In addition to the content described, Cord records external usage, model, operation, token counts, success or failure and organization-level run metadata. Collection drafts and messages may persist with approvals, errors and delivery references. Provider request retention, logs and any opt-in must be contractually verified.

The Customer must have a basis to transmit buyer, employee and third-party information, notify them where required and avoid sensitive categories, credentials or secrets unless necessary and demonstrably protected. Processing to operate a feature does not authorize advertising, voluntary training or an incompatible purpose. Privacy, the DPA, subprocessors and retention must specify roles and rights requests.

## 7. Limitations, review and security

AI can omit, duplicate, infer or draft incorrectly; outputs are not legal, tax, financial or professional advice. Catalog matching, server-side calculation or structured format reduces particular errors but does not certify the result.

The Customer must review amounts, recipient, tone, data, links, products, tool permissions and consequences before using an output. Automatic mode requires failure monitoring and human intervention. Cord retains responsibility for its own controls and cannot displace it through an absolute disclaimer.

Incidents, unexpected content or a challenged outcome must be capable of human escalation. The procedure, timeframes and genuine contact remain pending; no uniform right or unimplemented automated feature is promised.

## 8. Coordination and blockers

This disclosure coordinates with approved privacy, DPA, subprocessors, collections notice, acceptable use and terms. It incorporates no future provider policy and authorizes no new purpose.

**Blockers:** identity/contacts; Anthropic contract, region and retention; market-specific transparency assessment following the EU's August 2, 2026 rules; per-tool MCP permissions and effect confirmation; participant attribution and installment acceptance; human procedure, retention and rights; legal review and versioned publication.

Provenance and evidence: [phase 5.3 automation review](../../../../docs/historial/revisiones-legales/2026-09-01-automation.md). Original sources remain preserved as identified by `sourceSections`.
