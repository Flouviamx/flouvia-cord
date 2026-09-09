---
docId: terms
version: "2026-08-11"
effectiveDate: "2026-08-11"
supersedes: null
locale: en-US
jurisdiction: GLOBAL
appliesToCountries: [MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE]
requiresAction: true
action: accepted
acceptanceScope: personal
publicationStatus: published
sourceKind: html-snapshot
sourceInputsSha256: "0763ac85813e752056f011eb10355ebd940f97f69278d3c20f357a8d2d7cdbc1"
legacyScope: data-astro-cid-mfyzunhh
sourceOfTruth: src/content/legal/en-US/terms.md
artifactRoute: /en/terminos
artifactSha256: "891f4c861dae2d5fcbf93737cb93e8470582b430c01de4ee33220a5e29c18fd7"
lastReviewed: "2026-08-29"
reviewedBy: Internal technical audit; external legal review pending
---

<main class="legal-page js-anim">
<div class="legal-header">
<h1 class="editorial masked-title">Terms and<br>Conditions</h1>
<div class="reveal">
<p class="last-updated">Last updated: August 11, 2026</p>
</div>
</div>
<!-- Grid de 2 columnas: Sidebar + Contenido -->
<div class="legal-grid reveal">
<!-- Índice Sticky (Izquierda) -->
<aside class="toc-sidebar">
<span class="toc-eyebrow">CONTENTS</span>
<ul class="toc-list">
<li>
<a href="#descripcion" class="toc-link active">1. The Software</a>
</li>
<li>
<a href="#pi" class="toc-link">2. IP and Feedback</a>
</li>
<li>
<a href="#facturacion" class="toc-link">3. Plans and Overages</a>
</li>
<li>
<a href="#pagos-autorizacion" class="toc-link">4. Debit Authorization</a>
</li>
<li>
<a href="#prohibidas" class="toc-link">5. Prohibited Activities</a>
</li>
<li>
<a href="#fairuse" class="toc-link">6. Fair Use Policy</a>
</li>
<li>
<a href="#terceros" class="toc-link">7. Third-Party Apps</a>
</li>
<li>
<a href="#fiscal" class="toc-link">8. Tax Responsibility</a>
</li>
<li>
<a href="#confidencialidad" class="toc-link">9. Confidentiality</a>
</li>
<li>
<a href="#indemnizacion" class="toc-link">10. Indemnification</a>
</li>
<li>
<a href="#sla" class="toc-link">11. SLA and Force Majeure</a>
</li>
<li>
<a href="#limite" class="toc-link">12. Limitation of Liability</a>
</li>
<li>
<a href="#api" class="toc-link">13. Public API</a>
</li>
<li>
<a href="#marca" class="toc-link">14. Brand Usage</a>
</li>
<li>
<a href="#reembolsos" class="toc-link">15. Payments and Disputes</a>
</li>
<li>
<a href="#ley" class="toc-link">16. Applicable Law</a>
</li>
<li>
<a href="#cambios" class="toc-link">17. Changes to Terms</a>
</li>
</ul>
</aside>
<!-- Contenido Legal (Derecha) -->
<div class="legal-content">
<!-- Caja gris de introducción -->
<div class="intro-box">
<p>Welcome to CORD (<a href="https://cordhq.app">cordhq.app</a>). By creating an account or using our software as a service (SaaS) platform, you and the legal entity you represent agree to be legally bound by the following Terms and Conditions, operated by <strong>Andre Valle Ortega</strong> (hereinafter "Flouvia", "we", or "CORD").</p>
</div>
<p>If you do not agree with these terms, you must not use our services or access our APIs.</p>
<h2 id="descripcion" class="editorial">
<span class="num">01</span> Software Description</h2>
<p>CORD is a technological platform designed for quote generation, collection management, and issuance of invoices — digital tax receipts (CFDI 4.0) for businesses in Mexico, and CORD's own commercial invoice for the rest of the world. Flouvia provides the cloud tool, but the User is solely responsible for the accuracy of the data entered, the amounts quoted, and the invoices issued.</p>
<h2 id="pi" class="editorial">
<span class="num">02</span> Intellectual Property and Feedback</h2>
<p>Flouvia grants you a limited, non-exclusive, non-transferable license to use the CORD software. All code, design, interface (UI/UX), and algorithms belong to us. However, <strong>you retain 100% intellectual property over your catalogs, price lists, logos, and client information.</strong> We claim no rights over your business information.</p>
<p>
<strong>Feedback:</strong> If you provide us with suggestions, comments, or ideas to improve the platform ("Feedback"), you grant us a worldwide, perpetual, irrevocable, and royalty-free license to implement, modify, and exploit such improvements without obligation of compensation or recognition.</p>
<h2 id="facturacion" class="editorial">
<span class="num">03</span> Billing Plans and Overages</h2>
<p>Access to CORD is governed by an automated subscription scheme:</p>
<ul>
<li>
<strong>Plan Limits:</strong> Each subscription includes a base monthly quota of AI uses, invoices issued, API calls, and User seats.</li>
<li>
<strong>Metered Billing:</strong> To avoid interrupting your operations, CORD <strong>will not block</strong> your service if you exceed your plan limits. The system will record the additional consumption, which will be automatically billed at the end of your monthly cycle via <em>Stripe</em> at the unit rates listed on our <a href="/en/precios">pricing page</a>.</li>
</ul>
<h2 id="pagos-autorizacion" class="editorial">
<span class="num">04</span> Payment Terms and Debit Authorization</h2>
<p>To use our paid plans, you must provide a valid payment method. By doing so, <strong>you expressly authorize us and our exclusive payment processor (Stripe, Inc.)</strong> to make automatic and recurring charges to your card or bank account for your subscription amount and any generated overages.</p>
<p>Additionally, by processing payments through CORD, you agree to be bound by the <a href="https://stripe.com/mx/legal/ssa" target="_blank" rel="noopener noreferrer">Stripe Services Agreement</a>. If automatic billing fails, we reserve the right to temporarily suspend access to your account until payment is regularized.</p>
<h3 style="margin-top: 2rem; margin-bottom: 1rem; color: var(--color-text);">Payments from your Clients (Stripe Connect Custom)</h3>
<p>If you choose to receive payments from your own clients through our platform, you will use <strong>Stripe Connect Custom</strong>. CORD acts as the technological platform and collects your KYC information solely to transmit it securely to Stripe via API. Stripe is the actual payment processor for these transactions. CORD is not a bank, nor does it hold, retain, or transfer funds. By setting up payments, you agree to the <a href="https://stripe.com/connect-account/legal" target="_blank" rel="noopener noreferrer">Stripe Connected Account Agreement</a>. CORD is not responsible for any withholdings, restrictions, or account closures imposed by Stripe.</p>
<h3 style="margin-top: 2rem; margin-bottom: 1rem; color: var(--color-text);">Deposits, Partial Payments and Installment Plans</h3>
<p>CORD lets you request a deposit (a percentage payable on approval) and collect the balance according to the credit terms you set, or split a receivable into installments. Each portion is an independent charge processed through your connected Stripe account. <strong>You are solely responsible</strong> for the commercial terms you offer (deposit amount, credit period, number of installments), for delivering the goods or services agreed with your client, and for the correct tax treatment of each payment before the SAT (e.g. whether a partial payment constitutes a deposit, a payment in installments, or requires a Payment Receipt Complement/REP). CORD does not determine, guarantee, or enforce collection of any balance, and does not generate the REP automatically. Amounts, due dates, and payment status shown in the platform are a management aid and do not constitute a fiscal receipt or accounting record.</p>
<h3 style="margin-top: 2rem; margin-bottom: 1rem; color: var(--color-text);">Autonomous AI Collections</h3>
<p>CORD offers an optional AI collections agent that, once you enable it for your business, may contact your clients on your behalf (via email) about overdue balances, include payment links, and propose installment plans. By enabling this feature <strong>you authorize CORD to send these communications in your name</strong> and confirm you have a legitimate commercial relationship and a lawful basis to contact those clients. You are responsible for the accuracy of the receivables data and for ensuring these communications comply with applicable consumer-protection, data-protection, and debt-collection laws. The agent uses artificial intelligence and its wording may vary; CORD is not liable for the tone, content, or commercial consequences of any message, nor for amounts it fails to recover. You may disable autonomous collections at any time.</p>
<h2 id="prohibidas" class="editorial">
<span class="num">05</span> Prohibited and Restricted Activities</h2>
<p>CORD is a platform for lawful commerce. As an infrastructure that issues invoices — including, for businesses in Mexico, interacting with the SAT to issue CFDI — it is <strong>strictly prohibited</strong> to use our software for:</p>
<ul>
<li>Simulating operations, tax evasion, or issuing invoices covering non-existent operations (companies classified as EFOS/EDOS by tax authorities).</li>
<li>Money laundering, terrorist financing, or any activity that violates applicable federal or international laws.</li>
<li>Selling illegal, unauthorized regulated goods or services, or those prohibited under Stripe&#39;s Acceptable Use Policy.</li>
</ul>
<p>We reserve the right to suspend or permanently cancel, without prior notice or right to refund, any account we suspect is engaging in these practices, and we will report such activities to the competent authorities and our financial partners.</p>
<h2 id="fairuse" class="editorial">
<span class="num">06</span> Fair Use Policy</h2>
<p>To protect the stability of the shared infrastructure, features marketed as "Unlimited" are subject to a Fair Use Policy. We reserve the right to audit accounts showing abusive or anomalous consumption (e.g. using bots to saturate the Anthropic API). If abuse is detected, we will temporarily limit requests (Rate Limiting) and contact the User to migrate them to dedicated infrastructure.</p>
<h2 id="terceros" class="editorial">
<span class="num">07</span> Third-Party Apps and Integrations</h2>
<p>The Service may interact with third-party products, services, or applications not owned or controlled by Flouvia (e.g. Shopify, external CRMs). You acknowledge and agree that we do not endorse such applications and are not responsible for their failures, security vulnerabilities, or data loss resulting from their use. Your use of third-party applications is at your own risk.</p>
<h2 id="fiscal" class="editorial">
<span class="num">08</span> Tax and Legal Responsibility</h2>
<p>CORD acts strictly as a technology provider and communication channel to the tax authorities it integrates with directly: the Authorized Certification Provider (PAC) and the SAT in Mexico, and the Tax Agency (AEAT) in Spain for businesses that connect a Verifactu certificate.</p>
<ul>
<li>
<strong>No Accounting Advice:</strong> Flouvia is not a tax firm. The configuration of taxes, withholdings (IVA, ISR, IRPF), and the use of SAT or AEAT catalogs fall entirely on the User.</li>
<li>
<strong>Billing Errors:</strong> Flouvia is not responsible for fines, surcharges, or audits resulting from invoices (CFDI, Verifactu, or commercial) issued with data entry errors by the User.</li>
<li>
<strong>Verifactu Certificate:</strong> the electronic certificate used to sign and remit invoicing records to the AEAT is issued to the User by their own certification authority; the User is responsible for its custody, validity, and renewal before expiration. Records generated before the certificate is connected, or after it expires, are issued as commercial documents only and are not registered with the AEAT.</li>
</ul>
<h2 id="confidencialidad" class="editorial">
<span class="num">09</span> Confidentiality</h2>
<p>Both parties ("Receiving Party" and "Disclosing Party") may have access to confidential technical, financial, or business information. The Receiving Party commits to protecting the Disclosing Party's Confidential Information using the same degree of care it uses to protect its own, and in no event less than a reasonable degree. This confidentiality obligation shall survive the termination of your CORD subscription.</p>
<p>
<strong>Activity on public proposal links:</strong> when you send a proposal through a CORD link, the platform records activity on that link so you can follow up: when it was opened, how many times and by how many distinct devices, which sections the recipient reviewed and for how long, and whether they are viewing it at that moment. This data is visible to you as the sender, is scoped to that proposal, and is never shared with other businesses. The link itself tells the recipient that their activity is visible. IP addresses associated with this activity are stored hashed; the exception is the record of a digital signature, where the address is preserved in full as evidence of the signature.</p>
<h2 id="indemnizacion" class="editorial">
<span class="num">10</span> Indemnification</h2>
<p>The User agrees to defend, indemnify, and hold harmless Flouvia, its directors, employees, and technology providers from any claim, demand, fine, or damage (including legal fees) arising from the misuse of the Platform, the violation of these terms, or the issuance of invoices (CFDI or commercial) with fraudulent data to third parties.</p>
<h2 id="sla" class="editorial">
<span class="num">11</span> SLA, Availability and Force Majeure</h2>
<p>Flouvia provides the service on a best-effort basis and does not currently offer a standard uptime commitment. Availability also depends on third-party payment, database, hosting, and tax-authority services. Any individually agreed service level must be set out in a separate written agreement.</p>
<p>
<strong>Force Majeure:</strong> Flouvia shall not be liable for failure or delay in performing its obligations caused by events beyond its reasonable control, including but not limited to natural disasters, pandemics, acts of terrorism, strikes, massive failures of internet providers, or government actions.</p>
<h2 id="limite" class="editorial">
<span class="num">12</span> Limitation of Liability</h2>
<p>To the maximum extent permitted by applicable law, Flouvia's total and cumulative liability to the User for any damage, loss, or cause of action related to the use of CORD shall be strictly limited to the total amount the User has paid to Flouvia for the service during the twelve (12) months immediately preceding the event giving rise to the claim.</p>
<h2 id="api" class="editorial">
<span class="num">13</span> Public API Terms</h2>
<p>The use of the CORD API and outgoing Webhooks is restricted to your plan limits. The Client agrees to protect their API keys (<code>sk_live_...</code>). Flouvia is not responsible for data extraction or the issuance of fraudulent invoices resulting from the leak of your credentials.</p>
<h2 id="marca" class="editorial">
<span class="num">14</span> Brand Usage (Publicity)</h2>
<p>Unless the Client explicitly expresses otherwise in writing, by using the CORD Services, the Client grants Flouvia the non-exclusive right to use and display the Client's name, logo, and trademarks on the Flouvia website and in marketing materials for the purpose of identifying them as a customer of the platform.</p>
<h2 id="reembolsos" class="editorial">
<span class="num">15</span> Payments, Disputes and Refunds</h2>
<h3 id="cord-pagos">Cord Payments transaction fees</h3>
<p>When the Client activates the current Cord Payments fee schedule, each payment is subject to the total rate shown in Settings before acceptance. The current blended rates are: card payments, 4% plus MXN $3, plus VAT; recurring card payments, the same blended rate, which includes card processing and Cord's 0.4% margin; and SPEI transfers, 1% plus MXN $7, plus VAT, capped at MXN $588.12 total per payment. Funds are charged on the Client's connected payment account and are never held by Flouvia. Transaction and processing fees are generally not returned when the Client issues a voluntary refund, unless Flouvia expressly confirms otherwise in writing. Legacy organizations remain on their previous fee schedule until an authorized member accepts the new version.</p>
<h3>Chargebacks, dispute fees and negative balances</h3>
<p>The Client is the seller and merchant responsible to its buyer for each transaction, including authorization of the charge, delivery of the product or service, refunds, customer service, and applicable taxes. Cord provides the technology and does not become the seller or assume the Client's commercial obligations.</p>
<p>When a buyer files a chargeback or other payment dispute, Stripe may debit the disputed amount and any network or processor fee from the connected account balance. If that balance is insufficient, Flouvia may be liable to Stripe under the payment processing arrangement. As between the Client and Flouvia, the Client assumes the economic responsibility for the disputed amount, dispute fee, and any related negative balance attributable to the Client's transactions, except to the extent caused directly by Flouvia's proven fraud or willful misconduct.</p>
<p>The Client must reimburse any amount owed under the preceding paragraph within five business days after written notice. To the extent permitted by law and by Stripe, the Client authorizes Flouvia to recover or offset those amounts against present or future connected account balances. Flouvia may also pause new payment processing or payouts and require another authorized payment method until the negative balance is settled.</p>
<p>The Client must provide complete and truthful evidence within the deadline communicated by Cord or Stripe and must reasonably cooperate in the dispute process. Cord may assist with evidence preparation and transmission but does not guarantee the outcome. If a dispute is won, recovered amounts will be credited as determined by Stripe; processor or network fees that Stripe does not return remain payable by the Client.</p>
<p>All charges are securely processed by Stripe. Subscriptions renew automatically. The Client can cancel at any time from the Billing Portal. Upon cancellation, the service will remain active until the end of the already paid period. <strong>Flouvia does not issue full or partial refunds for unused months or overage consumption.</strong>
</p>
<h2 id="ley" class="editorial">
<span class="num">16</span> Applicable Law and Jurisdiction</h2>
<p>This Agreement is governed by and construed in accordance with the current laws of the <strong>United Mexican States</strong>, without giving effect to its conflict of law principles. For any controversy, dispute, or claim arising from or related to these Terms or the use of the Platform, the parties expressly submit to the exclusive jurisdiction of the <strong>competent Federal or Local Courts of Mexico City</strong>, waiving any other jurisdiction that may correspond to them due to their present or future domiciles.</p>
<h2 id="cambios" class="editorial">
<span class="num">17</span> Modifications to the Terms</h2>
<p>Flouvia may update these Terms and Conditions at any time. Substantial changes will be notified to the account Administrator via email or through a notice in the application Dashboard.</p>
</div>
</div>
</main>
