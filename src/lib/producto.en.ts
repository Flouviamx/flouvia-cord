// src/lib/producto.en.ts
import type { Feature } from './producto';

export const FEATURES_EN: Feature[] = [
    {
        slug: 'editor',
        nav: 'Quote editor',
        eyebrow: 'QUOTE EDITOR',
        titulo: 'The perfect quote,<br/>in minutes.',
        sub: 'Drag products from your catalog, negotiate prices line by line, and watch the total recalculate with tax live. What used to take an hour in Excel now takes minutes.',
        metaTitle: 'How to make B2B quotes with negotiated prices in Mexico — Cord by Flouvia',
        metaDescription: 'Cord\'s quote editor lets you negotiate the price of each product separately, apply Net 30/60 terms, calculate tax in real time, and generate an approval link with your brand.',
        plan: 'Available on all plans',
        stats: [
            { valor: '4', countup: 4, suffix: ' min', label: 'average time to build a quote' },
            { valor: '100', countup: 100, suffix: '%', label: 'of totals calculated without typos' },
            { valor: '3', countup: 3, label: 'payment terms: Cash, Net 30, and Net 60' },
        ],
        blocks: [
            {
                eyebrow: 'NEGOTIATED PRICES',
                titulo: 'Every client has their price.<br/>Respect it without thinking.',
                copy: 'In B2B, the list price is just the starting point. In Cord, you adjust the price of each line and the system shows you the applied discount instantly — you decide how far to go, the system makes sure the numbers add up.',
                bullets: [
                    'Negotiated price per line, with the discount % visible',
                    'The list price is recorded — you always know how much you conceded',
                    'Free lines for concepts outside the catalog',
                ],
            },
            {
                eyebrow: 'CATALOG',
                titulo: 'Your catalog works for you.',
                copy: 'Upload your products once (with SKU, unit, and list price) and add them to any quote with one click. No retyping, no copy-pasting from another file, no outdated prices.',
                bullets: [
                    'Instant search by name or SKU',
                    'Real units: pieces, bags, m³, rolls, whatever you sell',
                    'Activate or pause products without deleting them',
                ],
            },
            {
                eyebrow: 'LIVE TOTALS',
                titulo: 'Tax and totals,<br/>always correct.',
                copy: 'Every change recalculates subtotal, tax, and total instantly, with correct rounding and fintech-style tabular numbers. Define the validity and credit terms, and the quote is ready to send.',
                bullets: [
                    'Configurable 16% tax per business',
                    'Validity with automatic expiration date',
                    'Consecutive folio with your prefix (COT-0148, COT-0149…)',
                ],
            },
        ],
        faqs: [
            {
                q: 'How does Cord\'s quote editor work?',
                a: 'Cord\'s quote editor allows you to add products from the catalog with one click, negotiate the price of each line individually, apply volume discounts, and define payment terms (Cash, Net 30, or Net 60). The subtotal, tax, and total recalculate automatically in real time. The average time to build a quote is 4 minutes.',
            },
            {
                q: 'Can I have different prices for each client in Cord?',
                a: 'Yes. In Cord, each quote line has its own negotiated price, independent of the list price in the catalog. The system shows the percentage discount applied per line and saves the list price as a reference to know exactly how much was conceded on each sale.',
            },
            {
                q: 'Does Cord\'s editor calculate tax automatically?',
                a: 'Yes. Cord calculates the 16% tax automatically with every change in the editor. The subtotal, tax, and total update in real time without the need for manual formulas. The tax rate is configurable per business.',
            },
        ],
        cta: { titulo: 'Build your first quote today.', sub: 'Free up to 5 active quotes. No credit card required.' },
    },
    {
        slug: 'link-publico',
        nav: 'Public link',
        eyebrow: 'PUBLIC LINK',
        titulo: 'Your client approves<br/>in one click.',
        sub: 'Every quote generates an elegant link with your brand. Your client opens it from their phone, reviews the prices, and approves — no account creation, no downloads, no friction.',
        metaTitle: 'B2B quote approval via link without registration — Cord by Flouvia',
        plan: 'Available on all plans',
        stats: [
            { valor: '0', countup: 0, label: 'accounts your client needs to create' },
            { valor: '1', countup: 1, suffix: ' click', label: 'to approve the quote' },
            { valor: '24/7', label: 'available from any device' },
        ],
        blocks: [
            {
                eyebrow: 'ZERO FRICTION',
                titulo: 'No registration, no lost PDF<br/>in the email.',
                copy: 'The attached PDF dies in the inbox. Cord\'s link lives: your client opens it anywhere, sees the latest version, and acts right there. Approving or rejecting is a button, not a phone call.',
                bullets: [
                    'Works on WhatsApp, email, or wherever you share it',
                    'Always shows the current version of the quote',
                    'Approve/Reject buttons right on the page',
                ],
            },
            {
                eyebrow: 'YOUR BRAND',
                titulo: 'The page is signed by your business,<br/>not ours.',
                copy: 'Your logo, your name, and your colors preside over the quote. On paid plans, the "Powered by Cord" disappears and the experience is 100% yours — your client sees a serious company with serious systems.',
                bullets: [
                    'Configurable logo and brand color in Settings',
                    'Careful design: fintech typography, prominent amounts',
                    'Also downloadable as a PDF with the same brand',
                ],
            },
            {
                eyebrow: 'FROM YES TO ORDER',
                titulo: 'Once approved,<br/>the deal begins.',
                copy: 'When your client approves, you get an instant notification and the quote changes status automatically. If online payment is enabled, they can pay right there; if they use credit, it\'s recorded under their Net 30/60 terms.',
                bullets: [
                    'Immediate approval notification',
                    'Online payment with Stripe (Professional plan)',
                    'The complete history is left on the timeline',
                ],
            },
        ],
        faqs: [
            {
                q: 'Does my client need to create an account to approve a Cord quote?',
                a: 'No. The client receives a link, opens it from their phone or computer, reviews the products and total with the seller\'s brand, and approves or rejects with a button. They don\'t need to register, install anything, or download files.',
            },
            {
                q: 'Does Cord\'s quote link work on WhatsApp?',
                a: 'Yes. Cord\'s public link can be shared via WhatsApp, email, or any channel. The client opens it directly from the chat and can approve the quote without leaving the browser.',
            },
            {
                q: 'Can I remove Cord\'s branding from the approval link?',
                a: 'Yes. On paid plans (Starter and up), the "Powered by Cord" is removed, and the link exclusively shows the logo, name, colors, and tax details of the business sending the quote. The experience is 100% your own brand.',
            },
        ],
        cta: { titulo: 'The next quote you send on WhatsApp could have an approve button.', sub: 'See the sample quote or create your own for free.' },
    },
    {
        slug: 'seguimiento',
        nav: 'Live tracking',
        eyebrow: 'LIVE TRACKING',
        titulo: 'You know the exact moment<br/>they view it.',
        sub: 'No more asking "did you review it yet?". Cord notifies you the moment your client opens the quote, how many times they\'ve seen it, and what they did next — so you call at the perfect time.',
        metaTitle: 'Know when your client opened the quote — live tracking | Cord by Flouvia',
        plan: 'Available on all plans',
        stats: [
            { valor: '3', countup: 3, suffix: ' min', label: 'the alert arrives as soon as they open the link' },
            { valor: '100', countup: 100, suffix: '%', label: 'of the journey is on the timeline' },
            { valor: '2', countup: 2, suffix: '×', label: 'more closes when you follow up on time' },
        ],
        blocks: [
            {
                eyebrow: 'THE SIGNAL THAT MATTERS',
                titulo: 'Interest cools fast.<br/>Catch it hot.',
                copy: 'A quote viewed 5 minutes ago is a live sale; one viewed 2 weeks ago is a dead chore. Cord turns the link opening into an actionable signal: you find out instantly and can respond when you\'re top-of-mind for your client.',
                bullets: [
                    '"Viewed" event with exact date and time',
                    'Open count (Viewed it 3 times? They\'re comparing)',
                    'The quote status changes automatically: sent → viewed',
                ],
            },
            {
                eyebrow: 'TIMELINE',
                titulo: 'The whole story,<br/>in a single thread.',
                copy: 'Created, sent, viewed, approved, paid, invoiced — every quote carries its full history. Anyone on your team can open the details and understand in seconds where the deal stands, without asking in the WhatsApp group.',
                bullets: [
                    'Complete chronology per quote',
                    'Global activity feed on the dashboard',
                    'Instant context for your entire team',
                ],
            },
            {
                eyebrow: 'PIPELINE',
                titulo: 'Your real pipeline,<br/>not the one in the notebook.',
                copy: 'The dashboard groups your quotes by status and tells you how much money is about to close, how much you closed in the month, and your close rate. Decisions with numbers, not hunches.',
                bullets: [
                    'Live KPIs: to close, closed this month, close rate',
                    'Visual pipeline by status',
                    'Detect expiring quotes before they expire',
                ],
            },
        ],
        faqs: [
            {
                q: 'How do I know if my client has seen the quote in Cord?',
                a: 'Cord sends a real-time notification as soon as the client opens the quote link. The dashboard shows the "viewed" event with the exact date and time, and the number of times the client has opened it. If the quote was viewed multiple times, it usually indicates the client is comparing options.',
            },
            {
                q: 'Does Cord save the complete history of each quote?',
                a: 'Yes. Every quote in Cord has a complete timeline: when it was created, sent, viewed by the client (and how many times), approved or rejected, and when the e-invoice was stamped. Any team member can view the history without needing to ask.',
            },
            {
                q: 'Does Cord have a quote pipeline?',
                a: 'Yes. Cord\'s dashboard shows quotes grouped by status (draft, sent, viewed, approved, invoiced) with the total value of each stage. It includes live KPIs: amount to close, amount closed in the month, and close rate. It also detects upcoming expirations before quotes expire.',
            },
        ],
        cta: { titulo: 'Stop chasing. Start knowing.', sub: 'Your first "viewed" notification is priceless.' },
    },
    {
        slug: 'cfdi',
        nav: 'E-invoicing (CFDI)',
        eyebrow: 'CFDI 4.0 E-INVOICING',
        titulo: 'From approved quote<br/>to stamped invoice.',
        sub: 'When the deal closes, the invoice comes out on its own: real CFDI 4.0, stamped with the SAT, right from the quote. No retyping in another portal, no transcription errors.',
        metaTitle: 'Automated CFDI 4.0 from the approved quote — Cord by Flouvia',
        plan: 'Available from the Starter plan',
        stats: [
            { valor: '1', countup: 1, suffix: ' click', label: 'from approved quote to CFDI' },
            { valor: '0', countup: 0, label: 'double entries — data travels on its own' },
            { valor: '5', countup: 5, suffix: ' min', label: 'to connect your CSD the first time' },
        ],
        blocks: [
            {
                eyebrow: 'NO RETYPING',
                titulo: 'The data is already there.<br/>Use it.',
                copy: 'The quote already has the products, quantities, negotiated prices, and the client\'s RFC. Stamping is one click: Cord builds the CFDI 4.0 with that exact data and sends it to the PAC. Zero transcription, zero typos.',
                bullets: [
                    'CFDI 4.0 with the exact quote data',
                    'RFC and tax details saved on the client\'s profile',
                    'UUID, XML, and PDF available instantly',
                ],
            },
            {
                eyebrow: 'YOUR CSD, SECURE',
                titulo: 'Connect your seal once<br/>and forget it.',
                copy: 'You upload your Digital Seal Certificate (CSD) just once, protected and isolated in your account. From then on, every stamp uses your seal without you ever touching .cer and .key files again.',
                bullets: [
                    'Encrypted and isolated CSD per business',
                    'Stamping with a SAT-authorized PAC',
                    'Only for Mexico — as it should be',
                ],
            },
            {
                eyebrow: 'FULL CYCLE',
                titulo: 'The quote, the payment,<br/>and the invoice: one thread.',
                copy: 'The invoice doesn\'t live in another system: it stays linked to its quote, with its event on the timeline. When accounting asks, everything is in the same place — who approved, when they paid, and what UUID they got.',
                bullets: [
                    'Invoice linked to its quote and timeline',
                    '"Invoiced" status visible in your pipeline',
                    'History ready for reconciliation',
                ],
            },
        ],
        faqs: [
            {
                q: 'How does Cord stamp the CFDI automatically?',
                a: 'When the client approves a quote in Cord, the system builds the CFDI 4.0 with the exact data from the quote: products, quantities, prices, client\'s RFC, and issuer\'s tax details. It sends it to the authorized PAC and returns the UUID, XML, and stamped PDF with the SAT. All without leaving Cord or retyping data in another portal.',
            },
            {
                q: 'What do I need to activate CFDI in Cord?',
                a: 'You only need your SAT Digital Seal Certificate (CSD): the .cer and .key files with their password. They are uploaded once in Cord\'s settings section and remain encrypted and isolated in your account. The process takes less than 5 minutes. Available for businesses with a Mexico RFC from the Starter plan.',
            },
            {
                q: 'Is the Cord CFDI valid with the SAT?',
                a: 'Yes. Cord stamps real CFDI 4.0 through an Authorized Certification Provider (PAC) authorized by the SAT. The generated receipt has a valid UUID, includes the issuer\'s digital seal, and complies with version 4.0 of the Digital Tax Receipt via Internet standard currently in force in Mexico.',
            },
        ],
        cta: { titulo: 'Invoice without leaving the deal.', sub: 'Automated CFDI 4.0 starting from the Starter plan.' },
    },
    {
        slug: 'clientes-credito',
        nav: 'Clients and credit',
        eyebrow: 'CLIENTS AND CREDIT',
        titulo: 'Credit is your advantage.<br/>Control it.',
        sub: 'In B2B, selling on credit is selling more — if you control it. Cord saves each client\'s terms (Cash, Net 30, Net 60) and their credit limit, and applies them automatically to each quote.',
        metaTitle: 'B2B credit management: Net 30, Net 60, and credit limit per client — Cord by Flouvia',
        plan: 'Professional plan and above',
        stats: [
            { valor: '3', countup: 3, label: 'terms per client: Cash, Net 30, Net 60' },
            { valor: '100', countup: 100, suffix: '%', label: 'of your quotes respect the assigned limit' },
            { valor: '1', countup: 1, label: 'profile per client with their full history' },
        ],
        blocks: [
            {
                eyebrow: 'DIRECTORY',
                titulo: 'Each client, a profile<br/>that says it all.',
                copy: 'Company, contact, email, RFC, payment terms, and credit limit — the client profile gathers everything your team needs to quote them right. And since it lives in the system, everyone quotes with the same rules.',
                bullets: [
                    'Tax data ready for the CFDI',
                    'Default terms that apply themselves when quoting',
                    'Quote history per client',
                ],
            },
            {
                eyebrow: 'CREDIT LIMIT',
                titulo: 'Say yes with confidence<br/>(and no, on time).',
                copy: 'Assign a credit limit per client and let the system monitor it. Before sending a quote on credit, you know how much room the client has left — the "we slipped up" ceases to exist.',
                bullets: [
                    'Credit limit in MXN per client',
                    'Exposure visibility before approving credit',
                    'Net 30/60 with clear due dates',
                ],
            },
            {
                eyebrow: 'RELATIONSHIP',
                titulo: 'Good clients<br/>show in the data.',
                copy: 'Who approves fast, who pays on time, who asks and never closes. With the concentrated history, you decide who gets better prices and who needs an advance — with evidence, not memory.',
                bullets: [
                    'Quotes, approvals, and payments per client',
                    'Better pricing and credit decisions',
                    'Commercial memory stops living in just one person',
                ],
            },
        ],
        faqs: [
            {
                q: 'How does Cord handle Net 30 and Net 60 credit terms?',
                a: 'In Cord, each client has their default credit terms configured (Cash, Net 30, or Net 60). When creating a quote for that client, the terms are automatically applied without needing to remember or type them every time. The client and seller clearly see the terms on the approval link.',
            },
            {
                q: 'Does Cord allow assigning a credit limit per client?',
                a: 'Yes. Cord allows you to define a credit limit in currency for each client. Before sending a quote on credit, the seller can see how much available credit the client has left versus the total exposed amount. Available on the Professional plan and up.',
            },
            {
                q: 'Does Cord save the quote history per client?',
                a: 'Yes. Each client profile in Cord gathers all sent quotes, approved quotes, payments, and generated CFDIs. The history lets you identify which clients approve quickly, who pays on time, and who requests quotes without closing them, to make better pricing and credit decisions.',
            },
        ],
        cta: { titulo: 'Know your clients by their numbers.', sub: 'Start for free and upload your directory in minutes.' },
    },
    {
        slug: 'cobranza-ia',
        nav: 'AI Collections',
        eyebrow: 'AUTONOMOUS AI COLLECTIONS',
        titulo: 'Your collections work alone,<br/>even at night.',
        sub: 'An artificial intelligence agent follows up on every overdue invoice for you: it emails the client, negotiates an installment plan, and only alerts you when it needs your approval. You approve, the AI chases — without your AR going cold.',
        metaTitle: 'Automated AI collections for B2B companies in Mexico — Cord by Flouvia',
        metaDescription: 'Cord\'s AI collections agent follows up on overdue invoices, negotiates payment plans of up to 3 monthly installments, and projects your cash flow 90 days out.',
        plan: 'Scale plan and above',
        stats: [
            { valor: '24/7', label: 'the agent follows up without rest or forgetting' },
            { valor: '3', countup: 3, label: 'monthly installments it can negotiate on its own' },
            { valor: '90', countup: 90, suffix: ' days', label: 'of AI-projected cash flow' },
        ],
        blocks: [
            {
                eyebrow: 'AUTONOMOUS AGENT',
                titulo: 'It\'s not a reminder.<br/>It\'s a collector that negotiates.',
                copy: 'You activate autonomous collections per client and the agent takes the overdue AR: it contacts via email, reads the response, and proposes a payment plan of up to three monthly installments. If the client accepts within the limits you defined, it closes the deal; if they ask for something out of range, it escalates it to you. Works nights and weekends.',
                bullets: [
                    'Contacts via email and understands the client\'s response',
                    'Negotiates up to 3 monthly installments within your rules',
                    'Escalates to a human when it goes out of bounds',
                ],
            },
            {
                eyebrow: 'PREDICTIVE CASH FLOW',
                titulo: 'You know how much you\'ll collect<br/>before you collect it.',
                copy: 'Cord crosses each client\'s actual average payment delay with your weighted pipeline to project your revenue week by week, up to 90 days. Instead of guessing, you see the expected flow with probability scenarios and an "AI CFO Insight" that tells you where the risk is and what to collect first.',
                bullets: [
                    '90-day projection based on your actual payment history',
                    'Probability scenarios, not a single optimistic figure',
                    'Detects risk concentration and AR that will fall behind',
                ],
            },
            {
                eyebrow: 'YOU ARE IN CHARGE',
                titulo: 'The AI proposes.<br/>You approve.',
                copy: 'Autonomous collections is opt-in and controlled by you: you turn on the agent per client, define how far it can negotiate, and review each plan from an oversight dashboard. Everything the agent does is left in the immutable audit log — every email, every agreement, every installment. It\'s never a black box.',
                bullets: [
                    'Opt-in per client: you decide who the AI chases',
                    'Oversight dashboard with every conversation live',
                    'Every action recorded in the immutable audit log',
                ],
            },
        ],
        faqs: [
            {
                q: 'How does Cord\'s AI agent collect automatically?',
                a: 'Cord\'s AI collections agent follows up on overdue invoices on its own: it contacts the client via email, interprets the response, and proposes a payment plan of up to three monthly installments. If the client accepts within the limits configured by the business, the agreement is logged; if it goes outside those limits, the agent escalates it to a person. It works 24 hours a day and everything is recorded in the audit log.',
            },
            {
                q: 'Are AI collections secure? Who approves the agreements?',
                a: 'Yes. Autonomous collections are opt-in and activated on a per-client basis. The business defines up to how many installments and what conditions the agent can negotiate, and reviews each plan from an oversight dashboard. Every action by the agent — emails, agreements, installments — is recorded in Cord\'s immutable audit log, so it\'s never a black box.',
            },
            {
                q: 'What is Cord\'s AI cash flow projection?',
                a: 'Cord estimates your revenue up to 90 days forward by crossing the actual average payment delay of each client with the weighted value of your pipeline. Instead of a single number, it shows probability scenarios and an "AI CFO Insight" panel that highlights risk concentration and which accounts to collect first. Available on the Scale plan and above.',
            },
        ],
        cta: { titulo: 'Let AI chase your receivables.', sub: 'Autonomous collections lives on the Scale plan. You approve, it collects.' },
    },
    {
        slug: 'divisas',
        nav: 'Multi-currency & FX',
        eyebrow: 'MULTI-CURRENCY AND FX HEDGING',
        titulo: 'Quote in dollars.<br/>Invoice in pesos.<br/>Protect your margin.',
        sub: 'Your client sees the price in their currency; you invoice in pesos. Cord locks the daily exchange rate for 30 days and adds a hedging buffer, so the margin you closed is the margin you collect.',
        metaTitle: 'Quotes in dollars and euros with FX hedging for companies in Mexico — Cord by Flouvia',
        metaDescription: 'Quote in USD or EUR and invoice in MXN. Cord takes the spot rate from the ECB, applies a hedging buffer to protect your margin, and locks the FX rate for 30 days.',
        plan: 'Available on all plans',
        stats: [
            { valor: '30', countup: 30, suffix: ' days', label: 'that the exchange rate is locked per quote' },
            { valor: '3', countup: 3, label: 'presentation currencies: USD, EUR, and MXN' },
            { valor: '2', countup: 2, suffix: '%', label: 'suggested hedging buffer over the spot rate, adjustable' },
        ],
        blocks: [
            {
                eyebrow: 'TWO CURRENCIES, ONE DEAL',
                titulo: 'The client sees dollars.<br/>The SAT sees pesos.',
                copy: 'In Cord, the presentation currency and the tax currency are two different things. Your client reviews and approves the quote in dollars or euros; you invoice in pesos, as you live in Mexico. Cord saves both currencies and the rate it locked them at within the same quote, without you tracking the conversion by hand.',
                bullets: [
                    'Present in USD, EUR, or MXN; always invoice in pesos',
                    'The applied rate is saved in the quote',
                    'The client decides in their currency; you fulfill in yours',
                ],
            },
            {
                eyebrow: 'REAL EXCHANGE RATE',
                titulo: 'Today\'s rate,<br/>not the old Excel\'s.',
                copy: 'Cord fetches the live spot exchange rate from the European Central Bank data, without you typing anything or depending on an outdated sheet. If the external service fails, Cord uses a backup rate so your quote never gets stuck. You see it in the editor before saving.',
                bullets: [
                    'Live spot rate (ECB data), without typing anything',
                    'Exchange rate preview while building the quote',
                    'Backup rate if the external service fails',
                ],
            },
            {
                eyebrow: 'HEDGING AND FX LOCK',
                titulo: 'The margin you close<br/>is the one you collect.',
                copy: 'Between the client approving in dollars and you invoicing weeks later in pesos, the exchange rate moves and eats your profit. Cord adds a hedging buffer to the spot rate (2% by default, you adjust it) and locks that number for 30 days. It\'s not a bank forward: it\'s a safety margin Cord calculates and freezes.',
                bullets: [
                    'Configurable hedging buffer over the spot rate',
                    'FX lock: the rate is frozen for 30 days per quote',
                    'Protects your profit from movement between approval and invoicing',
                ],
            },
        ],
        faqs: [
            {
                q: 'Can I quote in dollars and invoice in pesos with Cord?',
                a: 'Yes. In Cord, the presentation currency is independent of the tax currency. Your client reviews and approves the quote in dollars (USD) or euros (EUR), while you invoice in Mexican pesos (MXN). Cord saves both currencies and the applied exchange rate within the same quote, so you don\'t need to track the conversion separately in an Excel sheet. The invoice is always issued in pesos.',
            },
            {
                q: 'Where does Cord get the exchange rate?',
                a: 'Cord obtains the live spot rate from the European Central Bank\'s data, without you having to manually enter anything. The exchange rate is shown in the quote editor before saving. If the external service is unresponsive due to a network issue, Cord applies a backup rate so the quote is never left ungenerated. The available presentation currencies are USD, EUR, and MXN.',
            },
            {
                q: 'What is Cord\'s FX hedging and FX lock?',
                a: 'FX hedging is an extra percentage (buffer) that Cord adds to the spot exchange rate to give you margin against currency movements; the default is 2% and you can adjust it. It\'s not a forward or a hedge contracted with a bank: it\'s a cushion the software calculates and leaves fixed. The FX lock freezes that rate for 30 days from when you create the quote, so even if the client approves today and you invoice weeks later, the exchange rate you collect is the same one you closed, and dollar volatility doesn\'t eat the profit you negotiated.',
            },
        ],
        cta: { titulo: 'Sell in dollars without losing on the exchange.', sub: 'Quote in USD or EUR, invoice in pesos, and let Cord protect your margin.' },
    },
    {
        slug: 'internacional',
        nav: 'International Invoicing',
        eyebrow: 'INTERNATIONAL INVOICING (US/MX)',
        titulo: 'Quote in dollars.<br/>Invoice the right way.',
        sub: 'Sell to clients in the US without losing margin to the exchange rate: quote in USD, shield the rate for 30 days, and invoice in MXN with real CFDI 4.0. A single platform for the business that no longer fits within one border.',
        metaTitle: 'US/MX international invoicing: quote in dollars, invoice CFDI 4.0 in pesos — Cord by Flouvia',
        metaDescription: 'Cord quotes in USD with FX hedging (rate locked for 30 days) and invoices in MXN with CFDI 4.0 stamped with the SAT via Facturapi. Multi-country architecture ready to grow.',
        plan: 'FX hedging and multi-currency on all plans; CFDI 4.0 SAT stamping from the Starter plan',
        stats: [
            { valor: '30', countup: 30, suffix: ' days', label: 'you freeze the quote\'s exchange rate (FX lock)' },
            { valor: '2', countup: 2, label: 'currencies per deal: one to quote, one to invoice' },
            { valor: '4.0', label: 'CFDI version Cord stamps real with the SAT' },
        ],
        blocks: [
            {
                eyebrow: 'FX HEDGING',
                titulo: 'The dollar moves.<br/>Your margin doesn\'t.',
                copy: 'Between your client approving in dollars and you invoicing weeks later, the exchange rate can eat your profit. Cord takes the real spot rate from the European Central Bank, adds the hedging buffer you define, and freezes that exchange rate for 30 days. The margin you promised is the margin you collect.',
                bullets: [
                    'Live spot rate (USD to MXN, EUR to MXN) from ECB source',
                    'Configurable hedging buffer to absorb volatility',
                    '30-day FX lock: the rate gets saved with the quote',
                ],
            },
            {
                eyebrow: 'TWO CURRENCIES, ONE DEAL',
                titulo: 'You quote in the currency<br/>your client understands.',
                copy: 'In the editor, you choose the presentation currency —what your client abroad sees— and the tax currency you\'ll invoice with. Cord saves both in the quote along with the frozen rate, so the document the client approves and the CFDI that enters your accounting never contradict each other.',
                bullets: [
                    'Presentation currency (USD) separated from tax currency (MXN)',
                    'Preview of the converted amount before sending',
                    'Rate, source, and validity are logged in the deal',
                ],
            },
            {
                eyebrow: 'REAL CFDI + GLOBAL ARCHITECTURE',
                titulo: 'Mexico stamps for real.<br/>The rest is already wired.',
                copy: 'When a deal closes in Mexico, Cord issues a real CFDI 4.0 with the SAT through Facturapi: UUID, XML, and stamped PDF. Underneath, a tax provider pattern routes each issuance according to the business\'s country and centralizes it in a single record: the foundation ready to add more countries as you grow.',
                bullets: [
                    'Real CFDI 4.0 stamped with the SAT (Mexico) via Facturapi',
                    'Unified tax registry per country in one place',
                    'Multi-country architecture ready to expand',
                ],
            },
        ],
        faqs: [
            {
                q: 'Does Cord let me quote in dollars and invoice in pesos?',
                a: 'Yes. In Cord\'s editor, you define two currencies: the presentation currency your client sees the quote in (e.g., USD) and the tax currency you\'ll invoice with (e.g., MXN). Cord gets the real spot exchange rate, applies the hedging buffer you configure, and freezes it for 30 days along with the quote. When the deal closes in Mexico, the invoice is issued as a CFDI 4.0 in pesos.',
            },
            {
                q: 'How does Cord protect my margin against exchange rate movements?',
                a: 'Cord uses FX hedging. It takes the live spot rate (ECB data via Frankfurter), adds a buffer percentage you define to absorb volatility, and locks that exchange rate for 30 days (FX lock). This way, even if the dollar moves between approval and invoicing, you invoice at the rate you agreed upon and keep the margin. FX hedging and multi-currency are available on all plans, including the free tier.',
            },
            {
                q: 'Does Cord invoice US clients the same way as in Mexico?',
                a: 'Not exactly the same, and it\'s important to be clear. In Mexico, Cord stamps real CFDI 4.0 with the SAT through an Authorized Certification Provider (Facturapi), with valid UUID, XML, and PDF. For the United States, there is no equivalent government stamp: issuing Commercial Invoices in the US is built into the architecture as an in-development module, not as a real stamp equivalent to the CFDI. Today, what truly closes the tax cycle is Mexico; the multi-country base is already built to grow into other countries.',
            },
        ],
        cta: { titulo: 'Sell without borders. Invoice without surprises.', sub: 'Quote in dollars with a shielded rate and stamp your CFDI 4.0 in pesos. Start for free.' },
    },
];

export const findFeatureEn = (slug: string) => FEATURES_EN.find(f => f.slug === slug);
