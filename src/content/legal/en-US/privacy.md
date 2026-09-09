---
docId: privacy
version: "2026-08-29"
effectiveDate: "2026-08-29"
supersedes: "2026-08-11"
locale: en-US
jurisdiction: GLOBAL
appliesToCountries: [MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE]
requiresAction: true
action: acknowledged
acceptanceScope: personal
publicationStatus: published
sourceKind: html-snapshot
sourceInputsSha256: "bfbe0bab8b861568dac9a3117d3c2f83fee7c491d901e44f5b3202d5b11a7038"
legacyScope: data-astro-cid-dcn55ul3
sourceOfTruth: src/content/legal/en-US/privacy.md
artifactRoute: /en/privacidad
artifactSha256: "4f10b3260909d902e7aaacf2ef40c05a000a4ed4a9154176b19050a3e0b9bb10"
lastReviewed: "2026-08-29"
reviewedBy: Internal technical audit; external legal review pending
---

<main class="legal-page js-anim">
<div class="legal-header">
<h1 class="editorial masked-title">Privacy<br>Policy</h1>
<div class="reveal">
<p class="last-updated">Last updated: August 29, 2026</p>
</div>
</div>
<!-- Grid de 2 columnas: Sidebar + Contenido -->
<div class="legal-grid reveal">
<!-- Índice Sticky (Izquierda) -->
<aside class="toc-sidebar">
<span class="toc-eyebrow">CONTENTS</span>
<ul class="toc-list">
<li>
<a href="#rol" class="toc-link active">1. Controller</a>
</li>
<li>
<a href="#datos" class="toc-link">2. Data collected</a>
</li>
<li>
<a href="#uso" class="toc-link">3. Purposes</a>
</li>
<li>
<a href="#anonimizados" class="toc-link">4. Anonymized Data</a>
</li>
<li>
<a href="#cookies" class="toc-link">5. Cookie Policy</a>
</li>
<li>
<a href="#dpa" class="toc-link">6. Roles and Third Parties</a>
</li>
<li>
<a href="#internacionales" class="toc-link">7. International Transfers</a>
</li>
<li>
<a href="#negocio" class="toc-link">8. Business Transfers</a>
</li>
<li>
<a href="#seguridad" class="toc-link">9. Security</a>
</li>
<li>
<a href="#brechas" class="toc-link">10. Data Breaches</a>
</li>
<li>
<a href="#portabilidad" class="toc-link">11. Portability</a>
</li>
<li>
<a href="#menores" class="toc-link">12. Minors</a>
</li>
<li>
<a href="#arco" class="toc-link">13. Privacy Rights</a>
</li>
<li>
<a href="#cambios" class="toc-link">14. Changes</a>
</li>
</ul>
</aside>
<!-- Contenido Legal (Derecha) -->
<div class="legal-content">
<!-- Caja gris estilo Flouvia -->
<div class="intro-box">
<p>This notice is issued under Mexico's <strong>Federal Law on Protection of Personal Data Held by Private Parties (LFPDPPP)</strong>. Other mandatory laws may apply depending on the people, organizations, processing, and locations involved, including the GDPR or Brazil's LGPD. This notice does not claim that one legal basis or procedure is sufficient in every jurisdiction, and it is not by itself a Data Processing Agreement.</p>
</div>
<p>
<strong>Flouvia</strong> and <strong>CORD</strong> are trade names used by Andre Valle Ortega, the operator identified in this notice. This document describes the processing evidenced in the current Cord code and configuration; it does not turn an optional or unconfigured integration into an active data flow.</p>
<!-- Los H2 ahora tienen un ID para anclarlos al índice -->
<h2 id="rol" class="editorial">
<span class="num">01</span> Identity of the Controller</h2>
<p>For legal and operational purposes, it is important to distinguish how we interact with data:</p>
<ul>
<li>
<strong>As Data Controller:</strong> We act as controllers over the data of you and your team (our direct clients) when creating an account or subscribing.</li>
<li>
<strong>As Data Processor:</strong> We act as processors over the data of <em>your own clients</em>. We only process this information following your instructions on the platform.</li>
</ul>
<p class="legal-warning">Open compliance item: the controller’s verified service address has not yet been published. This omission does not restrict any privacy right or request channel.</p>
<h2 id="datos" class="editorial">
<span class="num">02</span> Personal Data Collected</h2>
<p>We collect information through three main channels:</p>
<ul>
<li>
<strong>Identity Data:</strong> Name, email address, and passwords (managed securely via encrypted hashes).</li>
<li>
<strong>Tax Data (CFDI 4.0):</strong> RFC, Legal Name, Tax Regime, Zip Code, and Digital Seal Certificates (CSD).</li>
<li>
<strong>Tax Data (Verifactu, Spain):</strong> NIF/CIF, legal name, tax address, and, if the business configures the feature, an electronic certificate (.p12/.pfx). The certificate and password are stored encrypted. Real AEAT submission has an additional environment gate that is disabled by default; without the verified system identity and an enabled submission path, Cord produces a commercial document and must not claim remittance.</li>
<li>
<strong>Financial and Asset Data:</strong> Bank name, account holder, CLABE, payment movements, refunds, disputes, and negative balances. CORD stores the CLABE encrypted and keeps its last four digits for display. <em>CORD does not store card numbers or security codes; Stripe tokenizes them directly.</em>
</li>
<li>
<strong>Identity Verification Data:</strong> Information on the legal representative, directors and beneficial owners (25% or more), and images of official identification and, where required, proof of address. Document images are transmitted directly to Stripe and are not persistently stored by CORD. Before transmitting them, CORD strips the file's metadata, including any GPS location the capturing device may have embedded. CORD retains a compliance record of each submission — which part of the document was sent, when, from which IP address, the technical form of the file and the verification system's reply — for five (5) years, as required by anti-money-laundering regulation. That record never includes the image, a thumbnail, the document number, the date of birth or the personal address.</li>
<li>
<strong>Business Data:</strong> Product catalog, price lists, and data of the companies you quote to.</li>
<li>
<strong>Buyer and Dispute Evidence:</strong> Buyer name, email, purchase IP address, commercial communications, receipts, delivery documents, service dates, and other evidence that the Client decides to save or send to contest a payment dispute.</li>
</ul>
<p>Because payment onboarding may involve financial, asset, or identity-verification data, we request the data subject's express electronic consent before completing it. Consent may be revoked through the procedure in section 13, without retroactive effect; however, revocation or failure to provide required data may prevent CORD and Stripe from enabling or maintaining payment services.</p>
<h2 id="uso" class="editorial">
<span class="num">03</span> Purposes</h2>
<p>The collected data is used exclusively for the following essential purposes:</p>
<ul>
<li>Generate, store, and send quotes, and process the stamping of electronic invoices.</li>
<li>Manage the billing of your monthly subscription and calculate excess usage.</li>
<li>
<strong>Payment Processing (Stripe Connect Custom):</strong> Connect the Client's payment account, receive and reconcile payments, calculate and collect Cord transaction fees, schedule payouts, process refunds, manage chargebacks and negative balances, and comply with financial verification requirements. Banking data is encrypted in CORD and transmitted to Stripe by API. Document images are transmitted to Stripe without persistent storage in CORD, with their metadata stripped beforehand.</li>
<li>
<strong>Artificial Intelligence:</strong> Process the text required by the AI feature the user invokes. Cord uses Anthropic's commercial API; the provider's current published policy states that commercial inputs and outputs are not used for model training unless the commercial customer opts in. Cord does not present that provider policy as a guarantee that AI processing is risk-free.</li>
<li>
<strong>Autonomous AI Collections (optional):</strong> If the account Administrator enables it, Cord processes receivables data (client name, email, amount owed, due date, and the conversation context selected by the workflow) to draft or send reminders on the creditor's behalf. It is disabled by default.</li>
<li>Send transactional emails and notifications.</li>
</ul>
<h2 id="anonimizados" class="editorial">
<span class="num">04</span> Anonymized and Aggregated Data</h2>
<p>We may create aggregated or de-identified statistics to analyze trends and improve Cord. Removing direct identifiers alone does not make data anonymous: if a dataset can reasonably be linked back to a person, we continue treating it as personal data. We do not promise that every de-identification technique makes re-identification impossible.</p>
<h2 id="cookies" class="editorial">
<span class="num">05</span> Cookie Policy</h2>
<p>CORD uses cookies and tracking technologies in a minimalist and non-invasive manner. We do not sell your browsing data to third-party advertising networks.</p>
<ul>
<li>
<strong>Strictly Necessary Cookies:</strong> Used to keep your session active, authenticate your identity, and prevent Cross-Site Request Forgery (CSRF) attacks. Without these cookies, the application cannot function securely. These are always on and cannot be disabled from the cookie banner.</li>
<li>
<strong>Browser Product Analytics (PostHog):</strong> Measures page views and feature adoption after you accept analytics in the banner. Signed-in browser events may be linked to the user and organization. Separately, if PostHog is configured, Cord's server may record organization-level business events with person-profile creation disabled; those events do not depend on a browser cookie.</li>
<li>
<strong>Cookieless Web Analytics (Vercel):</strong> Records aggregated page-view dimensions without third-party cookies. Cord removes query strings and replaces customer, document, dispute, SSO, invitation, public-link, and identity-capture identifiers before transmission. Vercel still processes the technical request needed to provide its service, so this is described precisely rather than as “identifies nobody.”</li>
</ul>
<p>You can change your analytics cookie preference at any time. <button type="button" id="cc-reopen" class="cc-reopen-link">Manage cookie preferences</button>
</p>
<h2 id="dpa" class="editorial">
<span class="num">06</span> Processing roles and third parties</h2>
<p>This privacy notice does <strong>not</strong> make a complete Article 28 DPA effective merely through use of Cord. A standalone DPA is still a controlled draft and must be completed with verified party details, processing schedules, transfer mechanism, and execution evidence before a customer relies on it. The inventory below states each third party's actual role; not every recipient is a sub-processor.</p>
<div class="table-wrapper">
<table>
<thead>
<tr>
<th>Third party</th>
<th>Role</th>
<th>Purpose and activation</th>
</tr>
</thead>
<tbody>
<tr>
<td>
<strong>Neon</strong>
</td>
<td>Sub-processor</td>
<td>Hosting of the PostgreSQL database containing account, operational, and customer data. <em>Core infrastructure.</em>
</td>
</tr>
<tr>
<td>
<strong>Vercel</strong>
</td>
<td>Sub-processor</td>
<td>Hosting, request execution, technical logs, and aggregated web analytics. <em>Core infrastructure; paths containing identifiers are redacted before Web Analytics.</em>
</td>
</tr>
<tr>
<td>
<strong>Anthropic</strong>
</td>
<td>Sub-processor</td>
<td>Text processing for AI features, including quotes and collections when used. <em>Only when an AI feature is invoked.</em>
</td>
</tr>
<tr>
<td>
<strong>Resend</strong>
</td>
<td>Sub-processor</td>
<td>Delivery of transactional email and management of the double-opt-in newsletter. <em>When Cord sends email or a user confirms an editorial subscription.</em>
</td>
</tr>
<tr>
<td>
<strong>PostHog</strong>
</td>
<td>Sub-processor</td>
<td>Product analytics. Browser capture starts after consent; the server may emit organization-level business telemetry without creating a person profile. <em>Only when PostHog is configured; browser capture requires analytics consent.</em>
</td>
</tr>
<tr>
<td>
<strong>Upstash</strong>
</td>
<td>Sub-processor</td>
<td>Distributed rate limiting and ephemeral technical sessions. <em>Only when Upstash environment variables are configured; PostgreSQL is the fallback.</em>
</td>
</tr>
<tr>
<td>
<strong>Slack (alertas de Cord)</strong>
</td>
<td>Sub-processor</td>
<td>Receipt of minimized operational alerts through a Cord-controlled webhook. <em>Only when the internal webhook is configured.</em>
</td>
</tr>
<tr>
<td>
<strong>Facturapi</strong>
</td>
<td>Sub-processor</td>
<td>Preparation, stamping, and retrieval of CFDI, including the CSD configured by the business. <em>Only for Mexican CFDI when the provider is configured.</em>
</td>
</tr>
<tr>
<td>
<strong>Stripe</strong>
</td>
<td>Provider with its own legal duties</td>
<td>Subscriptions, payments, refunds, disputes, payouts, and financial/identity verification. Its role depends on the product and may include independent regulatory duties. <em>When billing or Cord Payments is used.</em>
</td>
</tr>
<tr>
<td>
<strong>Google</strong>
</td>
<td>Provider with its own legal duties</td>
<td>User-selected OAuth authentication; Cord receives the authorized identifier, name, and email. <em>Only when Google sign-in is selected.</em>
</td>
</tr>
<tr>
<td>
<strong>Apple</strong>
</td>
<td>Provider with its own legal duties</td>
<td>User-selected authentication; Cord receives the identifier and data authorized by Apple. <em>Only when Apple sign-in is selected.</em>
</td>
</tr>
<tr>
<td>
<strong>SAT, PAC y AEAT</strong>
</td>
<td>Authority or legally required recipient</td>
<td>Recipients of tax data when an applicable tax obligation or feature is actually enabled. <em>SAT/PAC when stamping CFDI. AEAT only when Verifactu and submission are configured; submission is disabled by default today.</em>
</td>
</tr>
<tr>
<td>
<strong>SAML, MCP, Slack y webhooks del Cliente</strong>
</td>
<td>Customer-directed integration</td>
<td>Data exchange with the identity provider, MCP server, Slack workspace, or endpoint configured by the Customer. <em>Only under the Customer’s instruction and configuration.</em>
</td>
</tr>
</tbody>
</table>
</div>
<h2 id="internacionales" class="editorial">
<span class="num">07</span> International Data Transfers</h2>
<p>Some providers may process data outside the country where the user or Customer is located. A provider's public DPA or sub-processor list is evidence of its published terms, but it does not prove Cord's account-specific region, configuration, or executed transfer mechanism. Those records remain part of the release checklist. Where Chapter V GDPR applies, an adequacy decision, the applicable 2021 Standard Contractual Clauses, or another valid mechanism must be identified for the particular transfer; consent to this notice is not used as a blanket substitute.</p>
<h2 id="negocio" class="editorial">
<span class="num">08</span> Business Transfers (M&amp;A)</h2>
<p>Information relevant to the Services may form part of a merger, acquisition, financing, restructuring, insolvency, or sale of assets, subject to confidentiality, purpose limitation, and notice duties that apply to the transaction. This does not authorize an unrelated buyer to disregard this notice or applicable law.</p>
<h2 id="seguridad" class="editorial">
<span class="num">09</span> Retention and Security</h2>
<p>Cord uses TLS in transit and field-level encryption for stored CLABEs and configured secrets. Stamped CFDI and identity-submission compliance records are currently configured around five-year retention. When Verifactu mode is actually enabled, the database stores an append-only sequence whose records reference the previous hash; this technical property is not described as proof that every Spanish retention obligation is already operational. Payment, dispute, provider, backup, and legal-acceptance retention still requires a documented record-by-record schedule. Identity-document images sent to Stripe are not persistently stored by Cord.</p>
<h2 id="brechas" class="editorial">
<span class="num">10</span> Security Breach Protocol</h2>
<p>If Cord becomes aware of a personal-data breach affecting Customer Data for which it acts as processor, Cord will inform the applicable Customer without undue delay and provide information reasonably available for that Customer's assessment and notifications. When Cord acts as controller, it will assess notice to authorities and affected people under the law that applies to the incident. The GDPR's 72-hour supervisory-authority period is not described as a 72-business-hour processor-to-customer deadline.</p>
<h2 id="portabilidad" class="editorial">
<span class="num">11</span> Data Portability and Deletion</h2>
<p>Account settings provide JSON export of organization data and CSV exports of products and clients. Deleting an organization removes its primary Cord database row and dependent operational rows. It does not by itself erase records that a provider keeps under its own legal duties, data already delivered under a Customer instruction, backups still within their rotation period, or the pseudonymous legal-acceptance evidence Cord retains to establish the contract. Requests concerning those records are assessed separately under the applicable law.</p>
<h2 id="menores" class="editorial">
<span class="num">12</span> Minors Privacy</h2>
<p>CORD is a SaaS platform designed exclusively for businesses and professionals. We do not knowingly collect or solicit Personal Information from anyone under the age of 18. If we learn that we have collected information from a minor without proper verifiable corporate consent, we will delete that information from our servers as quickly as possible.</p>
<h2 id="arco" class="editorial">
<span class="num">13</span> Privacy Rights</h2>
<p>The name and legal basis of each right depends on the applicable law. Mexico provides Access, Rectification, Cancellation, and Objection (ARCO); GDPR regimes include access, rectification, erasure, restriction, portability, and objection; Brazil's LGPD provides its own statutory rights. Settings currently supports organization export, selected CSV exports, correction of account data, and organization deletion. Other requests require individual assessment and are not described as automated merely because a Settings page exists.</p>
<p>Requests that cannot be completed in Settings may be sent to <strong>legal@flouvia.com</strong>. Describe the right and the account or relationship involved. Do not attach an identity document unless Cord asks for a proportionate verification method after reviewing the request; requesting a full ID by default would collect more data than necessary.</p>
<h2 id="cambios" class="editorial">
<span class="num">14</span> Changes to the Policy</h2>
<p>Each published notice has a version and a content hash. Material changes that require a new acknowledgement are presented through Cord's legal re-acknowledgement screen and recorded against the exact version shown. Continued use is not described as “explicit acceptance.” A change to a sub-processor or transfer also follows the notice and objection procedure in the applicable executed DPA, if one exists.</p>
</div>
</div>
</main>
