// src/lib/producto.en.ts
import type { Feature } from './producto';

export const FEATURES_EN: Feature[] = [
    {
        slug: 'editor',
        nav: 'Quote editor',
        eyebrow: 'QUOTE EDITOR',
        titulo: 'The perfect quote, in minutes.',
        sub: 'Drag products from your catalog, negotiate prices line by line, and watch the total recalculate with tax live. What used to take an hour in Excel now takes minutes.',
        metaTitle: 'How to make B2B quotes with negotiated prices in Mexico — Cord',
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
                titulo: 'Every client has their price. Respect it without thinking.',
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
                titulo: 'Tax and totals, always correct.',
                copy: 'Every change recalculates subtotal, tax, and total instantly, with correct rounding and fintech-style tabular numbers. Define the validity and credit terms, and the quote is ready to send.',
                bullets: [
                    'Configurable 16% tax per business',
                    'Validity with automatic expiration date',
                    'Consecutive folio with your prefix (COT-0148, COT-0149…)',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE COST OF SPREADSHEETS',
                titulo: 'Every hour in a spreadsheet is a sale you did not close.',
                copy: 'While you drag cells and fix formulas, your competitor already sent their quote. Cord builds the same quote in 4 minutes — catalog, tax, and total already solved.',
            },
            {
                eyebrow: 'ZERO FRICTION',
                titulo: 'Add, negotiate, send. Without jumping across three screens.',
                copy: 'Search the product, adjust the line price, watch the total recalculate — all in the same place where you used to bounce between the catalog, a calculator, and a Word doc.',
            },
            {
                eyebrow: 'ZERO TYPOS',
                titulo: 'The number you send is the correct number.',
                copy: 'Tax, totals, and per-line discounts calculate themselves. No more clients calling to tell you your spreadsheet added up wrong.',
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
        titulo: 'Your client approves in one click.',
        sub: 'Every quote generates an elegant link with your brand. Your client opens it from their phone, reviews the prices, and approves — no account creation, no downloads, no friction.',
        metaTitle: 'B2B quote approval via link without registration — Cord',
        metaDescription: "Cord's public link creates a branded page (logo, colors, and tax details) where your client reviews the quote and approves in one click — no account, no downloads. For any B2B business in Mexico.",
        plan: 'Available on all plans',
        stats: [
            { valor: '0', countup: 0, label: 'accounts your client needs to create' },
            { valor: '1', countup: 1, suffix: ' click', label: 'to approve the quote' },
            { valor: '24/7', label: 'available from any device' },
        ],
        blocks: [
            {
                eyebrow: 'ZERO FRICTION',
                titulo: 'No registration, no lost PDF in the email.',
                copy: 'The attached PDF dies in the inbox. Cord\'s link lives: your client opens it anywhere, sees the latest version, and acts right there. Approving or rejecting is a button, not a phone call.',
                bullets: [
                    'Works on WhatsApp, email, or wherever you share it',
                    'Always shows the current version of the quote',
                    'Approve/Reject buttons right on the page',
                ],
            },
            {
                eyebrow: 'YOUR BRAND',
                titulo: 'The page is signed by your business, not ours.',
                copy: 'Your logo, your name, and your colors preside over the quote. On paid plans, the "Powered by Cord" disappears and the experience is 100% yours — your client sees a serious company with serious systems.',
                bullets: [
                    'Configurable logo and brand color in Settings',
                    'Careful design: fintech typography, prominent amounts',
                    'Also downloadable as a PDF with the same brand',
                ],
            },
            {
                eyebrow: 'FROM YES TO ORDER',
                titulo: 'Once approved, the deal begins.',
                copy: 'When your client approves, you get an instant notification and the quote changes status automatically. If online payment is enabled, they can pay right there; if they use credit, it\'s recorded under their Net 30/60 terms.',
                bullets: [
                    'Immediate approval notification',
                    'Online payment with Stripe (Professional plan)',
                    'The complete history is left on the timeline',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE PDF NOBODY REOPENS',
                titulo: 'An attachment dies in the inbox. A link stays alive.',
                copy: 'Most quote PDFs get opened once and lost. Cord sends a link your client can approve with a thumb, from WhatsApp, without hunting for a lost file.',
            },
            {
                eyebrow: 'YOUR BRAND, NOT OURS',
                titulo: 'It should look like a serious company sent it — because it did.',
                copy: 'Your logo, your colors, your own domain. Your client sees your business, not a generic "powered by". Trust is built from the first click.',
            },
            {
                eyebrow: 'FROM YES TO GETTING PAID',
                titulo: 'Approval stops being the end of the process. It becomes the start of getting paid.',
                copy: 'The second your client says yes, you know instantly and payment or credit terms are ready to activate. Zero "did you see my quote?" calls.',
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
        titulo: 'You know the exact moment they view it.',
        sub: 'No more asking "did you review it yet?". Cord notifies you the moment your client opens the quote, how many times they\'ve seen it, and what they did next — so you call at the perfect time.',
        metaTitle: 'Know when your client opened the quote: live tracking — Cord',
        metaDescription: "Cord's live tracking notifies you the exact moment your client opens the quote, how many times they viewed it, and what they did next — so you know exactly when to follow up. No more guessing.",
        plan: 'Available on all plans',
        stats: [
            { valor: '3', countup: 3, suffix: ' min', label: 'the alert arrives as soon as they open the link' },
            { valor: '100', countup: 100, suffix: '%', label: 'of the journey is on the timeline' },
            { valor: '2', countup: 2, suffix: '×', label: 'more closes when you follow up on time' },
        ],
        blocks: [
            {
                eyebrow: 'THE SIGNAL THAT MATTERS',
                titulo: 'Interest cools fast. Catch it hot.',
                copy: 'A quote viewed 5 minutes ago is a live sale; one viewed 2 weeks ago is a dead chore. Cord turns the link opening into an actionable signal: you find out instantly and can respond when you\'re top-of-mind for your client.',
                bullets: [
                    '"Viewed" event with exact date and time',
                    'Open count (Viewed it 3 times? They\'re comparing)',
                    'The quote status changes automatically: sent → viewed',
                ],
            },
            {
                eyebrow: 'TIMELINE',
                titulo: 'The whole story, in a single thread.',
                copy: 'Created, sent, viewed, approved, paid, invoiced — every quote carries its full history. Anyone on your team can open the details and understand in seconds where the deal stands, without asking in the WhatsApp group.',
                bullets: [
                    'Complete chronology per quote',
                    'Global activity feed on the dashboard',
                    'Instant context for your entire team',
                ],
            },
            {
                eyebrow: 'PIPELINE',
                titulo: 'Your real pipeline, not the one in the notebook.',
                copy: 'The dashboard groups your quotes by status and tells you how much money is about to close, how much you closed in the month, and your close rate. Decisions with numbers, not hunches.',
                bullets: [
                    'Live KPIs: to close, closed this month, close rate',
                    'Visual pipeline by status',
                    'Detect expiring quotes before they expire',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'INTEREST COOLS OFF FAST',
                titulo: 'A client who viewed your quote 10 minutes ago is still thinking about you.',
                copy: 'One who viewed it two weeks ago is not. Cord alerts you the exact second they open the link — so you call while you are still on their mind.',
            },
            {
                eyebrow: 'VIEWED 3 TIMES = THEY ARE COMPARING',
                titulo: 'You know exactly how close the yes is.',
                copy: 'Every open gets logged. If your client came back several times in one day, they are not ignoring you — they are deciding. That is your cue to call, not to wait.',
            },
            {
                eyebrow: 'YOUR REAL PIPELINE',
                titulo: 'Stop guessing how much you will close this month.',
                copy: 'The dashboard tells you how much is about to close, how much already closed, and which quotes have gone dangerously silent. Decisions with numbers, not with the memory of your last call.',
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
        titulo: 'From approved quote to stamped invoice.',
        sub: 'When the deal closes, the invoice comes out on its own: real CFDI 4.0, stamped with the SAT, right from the quote. No retyping in another portal, no transcription errors.',
        metaTitle: 'Automated CFDI 4.0 from the approved quote — Cord',
        metaDescription: "Cord automatically stamps CFDI 4.0 e-invoices with Mexico's SAT the moment a quote is approved — no re-entering data in another portal. Real e-invoicing for any B2B business in Mexico.",
        plan: 'Available from the Starter plan',
        stats: [
            { valor: '1', countup: 1, suffix: ' click', label: 'from approved quote to CFDI' },
            { valor: '0', countup: 0, label: 'double entries — data travels on its own' },
            { valor: '5', countup: 5, suffix: ' min', label: 'to connect your CSD the first time' },
        ],
        blocks: [
            {
                eyebrow: 'NO RETYPING',
                titulo: 'The data is already there. Use it.',
                copy: 'The quote already has the products, quantities, negotiated prices, and the client\'s RFC. Stamping is one click: Cord builds the CFDI 4.0 with that exact data and sends it to the PAC. Zero transcription, zero typos.',
                bullets: [
                    'CFDI 4.0 with the exact quote data',
                    'RFC and tax details saved on the client\'s profile',
                    'UUID, XML, and PDF available instantly',
                ],
            },
            {
                eyebrow: 'YOUR CSD, SECURE',
                titulo: 'Connect your seal once and forget it.',
                copy: 'You upload your Digital Seal Certificate (CSD) just once, protected and isolated in your account. From then on, every stamp uses your seal without you ever touching .cer and .key files again.',
                bullets: [
                    'Encrypted and isolated CSD per business',
                    'Stamping with a SAT-authorized PAC',
                    'Only for Mexico — as it should be',
                ],
            },
            {
                eyebrow: 'FULL CYCLE',
                titulo: 'The quote, the payment, and the invoice: one thread.',
                copy: 'The invoice doesn\'t live in another system: it stays linked to its quote, with its event on the timeline. When accounting asks, everything is in the same place — who approved, when they paid, and what UUID they got.',
                bullets: [
                    'Invoice linked to its quote and timeline',
                    '"Invoiced" status visible in your pipeline',
                    'History ready for reconciliation',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE RISK OF RETYPING',
                titulo: 'Every time you type a piece of data again, there is a chance for a tax error.',
                copy: 'The tax ID, products, amounts — they are already in the approved quote. Cord uses them as-is to stamp the invoice. Zero transcription, zero fines from a fat-fingered digit.',
            },
            {
                eyebrow: '5 MINUTES, ONCE',
                titulo: 'Connect your digital seal today. Never touch it again.',
                copy: 'You upload your certificate once, encrypted and isolated in your account. From there, every approved quote becomes an invoice with one click — not an appointment with your accountant.',
            },
            {
                eyebrow: 'EVERYTHING IN ONE THREAD',
                titulo: 'When accounting asks, everything is in the same place.',
                copy: 'The invoice stays linked to its quote, with its UUID and full timeline. No searching two different systems to reconcile who paid what.',
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
        titulo: 'Credit is your advantage. Control it.',
        sub: 'In B2B, selling on credit is selling more — if you control it. Cord saves each client\'s terms (Cash, Net 30, Net 60) and their credit limit, and applies them automatically to each quote.',
        metaTitle: 'B2B credit management: Net 30, Net 60, and credit limit per client — Cord',
        metaDescription: "Cord stores each client's credit terms (Cash, Net 30, Net 60) and credit limit, applying them automatically to every quote — sell on credit without losing control of your receivables.",
        plan: 'Professional plan and above',
        stats: [
            { valor: '3', countup: 3, label: 'terms per client: Cash, Net 30, Net 60' },
            { valor: '100', countup: 100, suffix: '%', label: 'of your quotes respect the assigned limit' },
            { valor: '1', countup: 1, label: 'profile per client with their full history' },
        ],
        blocks: [
            {
                eyebrow: 'DIRECTORY',
                titulo: 'Each client, a profile that says it all.',
                copy: 'Company, contact, email, RFC, payment terms, and credit limit — the client profile gathers everything your team needs to quote them right. And since it lives in the system, everyone quotes with the same rules.',
                bullets: [
                    'Tax data ready for the CFDI',
                    'Default terms that apply themselves when quoting',
                    'Quote history per client',
                ],
            },
            {
                eyebrow: 'CREDIT LIMIT',
                titulo: 'Say yes with confidence (and no, on time).',
                copy: 'Assign a credit limit per client and let the system monitor it. Before sending a quote on credit, you know how much room the client has left — the "we slipped up" ceases to exist.',
                bullets: [
                    'Credit limit in MXN per client',
                    'Exposure visibility before approving credit',
                    'Net 30/60 with clear due dates',
                ],
            },
            {
                eyebrow: 'RELATIONSHIP',
                titulo: 'Good clients show in the data.',
                copy: 'Who approves fast, who pays on time, who asks and never closes. With the concentrated history, you decide who gets better prices and who needs an advance — with evidence, not memory.',
                bullets: [
                    'Quotes, approvals, and payments per client',
                    'Better pricing and credit decisions',
                    'Commercial memory stops living in just one person',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: '"WE MISSED IT" NO LONGER HAPPENS',
                titulo: 'You know how much credit each client has left before you say yes.',
                copy: 'Set a credit limit per client and let the system watch it. Selling on credit stops being an act of faith.',
            },
            {
                eyebrow: 'THE SAME RULES FOR EVERYONE',
                titulo: 'No sales rep should be allowed to invent their own terms.',
                copy: 'Cash, Net 30, or Net 60 — the client record applies them automatically on every quote. The business sets the rules, not the memory of each rep.',
            },
            {
                eyebrow: 'COMMERCIAL MEMORY, TURNED INTO DATA',
                titulo: 'Who pays on time shows up. Who does not, too.',
                copy: 'The full history per client tells you who deserves a better price and who should pay a deposit — with evidence, not the opinion of one rep who might leave tomorrow.',
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
        titulo: 'Your collections work alone, even at night.',
        sub: 'An artificial intelligence agent follows up on every overdue invoice for you: it emails the client, negotiates an installment plan, and only alerts you when it needs your approval. You approve, the AI chases — without your AR going cold.',
        metaTitle: 'Automated AI collections for B2B companies in Mexico — Cord',
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
                titulo: 'It\'s not a reminder. It\'s a collector that negotiates.',
                copy: 'You activate autonomous collections per client and the agent takes the overdue AR: it contacts via email, reads the response, and proposes a payment plan of up to three monthly installments. If the client accepts within the limits you defined, it closes the deal; if they ask for something out of range, it escalates it to you. Works nights and weekends.',
                bullets: [
                    'Contacts via email and understands the client\'s response',
                    'Negotiates up to 3 monthly installments within your rules',
                    'Escalates to a human when it goes out of bounds',
                ],
            },
            {
                eyebrow: 'PREDICTIVE CASH FLOW',
                titulo: 'You know how much you\'ll collect before you collect it.',
                copy: 'Cord crosses each client\'s actual average payment delay with your weighted pipeline to project your revenue week by week, up to 90 days. Instead of guessing, you see the expected flow with probability scenarios and an "AI CFO Insight" that tells you where the risk is and what to collect first.',
                bullets: [
                    '90-day projection based on your actual payment history',
                    'Probability scenarios, not a single optimistic figure',
                    'Detects risk concentration and AR that will fall behind',
                ],
            },
            {
                eyebrow: 'YOU ARE IN CHARGE',
                titulo: 'The AI proposes. You approve.',
                copy: 'Autonomous collections is opt-in and controlled by you: you turn on the agent per client, define how far it can negotiate, and review each plan from an oversight dashboard. Everything the agent does is left in the immutable audit log — every email, every agreement, every installment. It\'s never a black box.',
                bullets: [
                    'Opt-in per client: you decide who the AI chases',
                    'Oversight dashboard with every conversation live',
                    'Every action recorded in the immutable audit log',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'NEVER TIRED OF ASKING',
                titulo: 'Your best collector never sleeps, never gets frustrated, never forgets.',
                copy: 'The AI agent follows up on every overdue invoice at night, on weekends, always. Your receivables stop cooling off while you wait for someone to have time to write.',
            },
            {
                eyebrow: 'NEGOTIATES, NOT JUST REMINDS',
                titulo: 'It does not send a "please pay". It proposes a real payment plan.',
                copy: 'Up to three monthly installments, within the limits you set. If the client asks for something outside that range, the AI escalates to you — it never decides beyond what it should.',
            },
            {
                eyebrow: 'ZERO BLACK BOX',
                titulo: 'Everything the AI does, you can read.',
                copy: 'Every email, every agreement, every installment lands in an immutable audit log. You turn the agent on client by client — automation does not mean losing control.',
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
        titulo: 'Quote in dollars. Invoice in pesos. Protect your margin.',
        sub: 'Your client sees the price in their currency; you invoice in pesos. Cord locks the daily exchange rate for 30 days and adds a hedging buffer, so the margin you closed is the margin you collect.',
        metaTitle: 'Quotes in dollars and euros with FX hedging for companies in Mexico — Cord',
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
                titulo: 'The client sees dollars. The SAT sees pesos.',
                copy: 'In Cord, the presentation currency and the tax currency are two different things. Your client reviews and approves the quote in dollars or euros; you invoice in pesos, as you live in Mexico. Cord saves both currencies and the rate it locked them at within the same quote, without you tracking the conversion by hand.',
                bullets: [
                    'Present in USD, EUR, or MXN; always invoice in pesos',
                    'The applied rate is saved in the quote',
                    'The client decides in their currency; you fulfill in yours',
                ],
            },
            {
                eyebrow: 'REAL EXCHANGE RATE',
                titulo: 'Today\'s rate, not the old Excel\'s.',
                copy: 'Cord fetches the live spot exchange rate from the European Central Bank data, without you typing anything or depending on an outdated sheet. If the external service fails, Cord uses a backup rate so your quote never gets stuck. You see it in the editor before saving.',
                bullets: [
                    'Live spot rate (ECB data), without typing anything',
                    'Exchange rate preview while building the quote',
                    'Backup rate if the external service fails',
                ],
            },
            {
                eyebrow: 'HEDGING AND FX LOCK',
                titulo: 'The margin you close is the one you collect.',
                copy: 'Between the client approving in dollars and you invoicing weeks later in pesos, the exchange rate moves and eats your profit. Cord adds a hedging buffer to the spot rate (2% by default, you adjust it) and locks that number for 30 days. It\'s not a bank forward: it\'s a safety margin Cord calculates and freezes.',
                bullets: [
                    'Configurable hedging buffer over the spot rate',
                    'FX lock: the rate is frozen for 30 days per quote',
                    'Protects your profit from movement between approval and invoicing',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE DOLLAR MOVES. YOUR MARGIN SHOULD NOT.',
                titulo: 'Between approval and invoicing, the exchange rate can eat your profit.',
                copy: 'Cord locks the rate for 30 days with a hedging buffer. The margin you negotiated is the margin you collect, no matter what the dollar does in between.',
            },
            {
                eyebrow: 'NOTHING TO TYPE IN',
                titulo: "Today's rate, not last week's spreadsheet.",
                copy: 'Cord pulls the live exchange rate automatically. No one on your team has to remember to check it before quoting.',
            },
            {
                eyebrow: 'TWO CURRENCIES, ONE DEAL',
                titulo: 'Your client sees dollars. The tax authority sees pesos. No one gets confused.',
                copy: 'Present in USD or EUR as your international client expects; invoice in pesos as Mexico requires. Both currencies stay locked together in the same document.',
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
        titulo: 'Quote in dollars. Invoice the right way.',
        sub: 'Sell to clients in the US without losing margin to the exchange rate: quote in USD, shield the rate for 30 days, and invoice in MXN with real CFDI 4.0. A single platform for the business that no longer fits within one border.',
        metaTitle: 'US/MX international invoicing: quote in dollars, invoice CFDI 4.0 in pesos — Cord',
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
                titulo: 'The dollar moves. Your margin doesn\'t.',
                copy: 'Between your client approving in dollars and you invoicing weeks later, the exchange rate can eat your profit. Cord takes the real spot rate from the European Central Bank, adds the hedging buffer you define, and freezes that exchange rate for 30 days. The margin you promised is the margin you collect.',
                bullets: [
                    'Live spot rate (USD to MXN, EUR to MXN) from ECB source',
                    'Configurable hedging buffer to absorb volatility',
                    '30-day FX lock: the rate gets saved with the quote',
                ],
            },
            {
                eyebrow: 'TWO CURRENCIES, ONE DEAL',
                titulo: 'You quote in the currency your client understands.',
                copy: 'In the editor, you choose the presentation currency —what your client abroad sees— and the tax currency you\'ll invoice with. Cord saves both in the quote along with the frozen rate, so the document the client approves and the CFDI that enters your accounting never contradict each other.',
                bullets: [
                    'Presentation currency (USD) separated from tax currency (MXN)',
                    'Preview of the converted amount before sending',
                    'Rate, source, and validity are logged in the deal',
                ],
            },
            {
                eyebrow: 'REAL CFDI + GLOBAL ARCHITECTURE',
                titulo: 'Mexico stamps for real. The rest is already wired.',
                copy: 'When a deal closes in Mexico, Cord issues a real CFDI 4.0 with the SAT through Facturapi: UUID, XML, and stamped PDF. Underneath, a tax provider pattern routes each issuance according to the business\'s country and centralizes it in a single record: the foundation ready to add more countries as you grow.',
                bullets: [
                    'Real CFDI 4.0 stamped with the SAT (Mexico) via Facturapi',
                    'Unified tax registry per country in one place',
                    'Multi-country architecture ready to expand',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'SELLING WITHOUT BORDERS',
                titulo: 'The business that no longer fits in one country should not run on tools built for one country.',
                copy: 'Quote in dollars to a client in Texas and invoice in pesos in Guadalajara — from the same account, the same catalog, the same system.',
            },
            {
                eyebrow: 'REAL HEDGING',
                titulo: 'The exchange rate stops being a gamble.',
                copy: 'Configurable hedging buffer plus a 30-day rate lock. You know exactly how many pesos you will collect from the moment the client approves in dollars.',
            },
            {
                eyebrow: 'MEXICO STAMPS FOR REAL',
                titulo: 'Real CFDI 4.0, not a simulation that looks like an invoice.',
                copy: 'When the deal closes in Mexico, the UUID, XML, and PDF come out stamped with the tax authority — on an architecture already built to add more countries.',
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
    {
        slug: 'finanzas',
        nav: 'Finance & CFO',
        eyebrow: 'YOUR AI CFO',
        titulo: 'Predictive cash flow at 90 days.',
        sub: 'Cross-reference your pipeline with each client\'s real payment history. Know what you will collect before you collect it and spot non-payment risks before they happen.',
        metaTitle: 'Predictive cash flow and AI CFO for B2B — Cord',
        metaDescription: 'Cord uses AI to project your cash flow up to 90 days by crossing your pipeline with the actual payment history of your clients.',
        plan: 'Scale plan and above',
        stats: [
            { valor: '90', countup: 90, suffix: ' days', label: 'of predictive projection' },
            { valor: '100', countup: 100, suffix: '%', label: 'based on your portfolio\'s real history' },
            { valor: '1', countup: 1, suffix: ' click', label: 'to see the risk indicator per client' },
        ],
        blocks: [
            {
                eyebrow: 'REAL PREDICTION',
                titulo: 'No more guessing in Excel.',
                copy: 'Cord doesn\'t assume a Net 30 client pays on day 30. It analyzes their real history and if they usually pay on day 45, it projects your flow with that delay (DSO).',
                bullets: [
                    'DSO (Days Sales Outstanding) calculated per client',
                    'Automatic adjustment to collection reality',
                    'Visual report without building formulas',
                ],
            },
            {
                eyebrow: 'ACTIVE RISK',
                titulo: 'The traffic light that protects your portfolio.',
                copy: 'The AI CFO reviews risk concentration. If a client representing 40% of your receivables starts to fall behind, it warns you so you can tighten credit.',
                bullets: [
                    'Early warnings of non-payment risk',
                    'Visualized portfolio concentration',
                    'Actionable recommendations with one click',
                ],
            },
            {
                eyebrow: 'MANAGEMENT REPORT',
                titulo: 'The finance meeting, ready in seconds.',
                copy: 'Export the projection or grant your executive team access to a live dashboard where the numbers are always up to date.',
                bullets: [
                    'Live dashboard for the CFO',
                    'Export to CSV or PDF',
                    'Zero monthly reconciliation time',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'NO MORE GUESSWORK',
                titulo: 'You know how much you will collect before you collect it.',
                copy: "Cord does not assume Net 30 gets paid on day 30. It analyzes each client's real history and projects your flow with the truth, not the contract.",
            },
            {
                eyebrow: 'THE RISK YOU DO NOT SEE IN TIME',
                titulo: 'If 40% of your receivables depend on a single client, you want to know today.',
                copy: 'The risk concentration alert warns you before that client starts slipping — so you can act while there is still room to maneuver.',
            },
            {
                eyebrow: 'BOARD-READY',
                titulo: 'The report that used to take you an afternoon is already built.',
                copy: 'A live, exportable dashboard, always up to date. Zero reconciliation time when someone from finance asks how the month is going.',
            },
        ],
        faqs: [
            {
                q: 'How does Cord project cash flow?',
                a: 'Cord crosses approved quotes (pipeline) with the historical payment behavior of each client to predict when the money will actually come in, not when the invoice theoretically expires.',
            },
            {
                q: 'What is DSO and why is it important?',
                a: 'DSO (Days Sales Outstanding) measures how many days it takes a client to pay. Cord calculates it automatically and uses it to warn about risks if a client starts increasing their payment time.',
            },
            {
                q: 'Who has access to this information?',
                a: 'On advanced plans, you can define roles. Only users with management or CFO permissions can view the projections and total risk concentration of the company.',
            },
        ],
        cta: { titulo: 'Anticipate cash flow bumps.', sub: 'Your AI-powered CFO is available on the Scale plan.' },
    },
    {
        slug: 'aprobaciones',
        nav: 'Margin control',
        eyebrow: 'MARGIN CONTROL AND APPROVALS',
        titulo: 'Sell fast, but with the right margin.',
        sub: 'Define discount thresholds by role. If a sales rep gives a discount greater than allowed, the quote is paused and requests management approval. You protect the margin, they close the deal.',
        metaTitle: 'Margin control and approval workflows for B2B sales — Cord',
        metaDescription: 'Set up discount thresholds and management approval workflows to ensure the profitability of every quote in your sales team.',
        plan: 'Professional plan and above',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'of quotes pass margin validation' },
            { valor: '1', countup: 1, suffix: ' click', label: 'to approve or reject from your phone' },
            { valor: '0', countup: 0, label: 'month-end surprises due to excessive discounts' },
        ],
        blocks: [
            {
                eyebrow: 'AUTOMATIC THRESHOLDS',
                titulo: 'Clear rules for the whole team.',
                copy: 'Set a rule that reps can give up to a 10% discount. Anything below that goes straight to the client; anything above requires your click.',
                bullets: [
                    'Configurable discount thresholds by role',
                    'Silent real-time validation',
                    'Automatic blocking of unauthorized sends',
                ],
            },
            {
                eyebrow: 'MANAGEMENT FLOW',
                titulo: 'Silent auditor.',
                copy: 'When a quote requires approval, you get an instant notification. You can see how much the rep conceded and approve or request adjustments from anywhere.',
                bullets: [
                    'Push or email notifications',
                    'One-click approval on mobile',
                    'Internal chat on the quote for adjustments',
                ],
            },
            {
                eyebrow: 'IMMUTABLE LOG',
                titulo: 'Everything is recorded.',
                copy: 'The quote\'s timeline saves who requested the approval, who granted it, and at what time. Zero doubts about why a price went out lower than normal.',
                bullets: [
                    'Complete approval history',
                    'Margin auditing',
                    'Clear accountability for every discount',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE DISCOUNT NOBODY AUTHORIZED',
                titulo: 'A rep in a rush to close can give away your margin without meaning to.',
                copy: 'Define how far a discount can go before your approval is required. Sales speed no longer competes with profitability.',
            },
            {
                eyebrow: 'APPROVE FROM WHEREVER YOU ARE',
                titulo: 'One tap from your phone, and the sale keeps moving.',
                copy: 'When a quote crosses the threshold, you get notified instantly — with the exact margin being given up. Approving or requesting changes takes seconds, not a meeting.',
            },
            {
                eyebrow: 'SILENT AUDITOR',
                titulo: 'Every exception gets logged, even when no one is watching in the moment.',
                copy: 'Who requested the discount, who approved it, and why — the immutable log answers the question before anyone has to ask it.',
            },
        ],
        faqs: [
            {
                q: 'Can I have different thresholds per sales rep?',
                a: 'Yes. You can define general rules or adjust the allowed discount thresholds based on hierarchy (e.g., Junior Rep 5%, Senior Rep 15%).',
            },
            {
                q: 'How do I approve a quote that exceeded the margin?',
                a: 'You receive an instant notification. Upon opening it, you see the profitability summary and two buttons: Approve or Reject. If you approve it, the rep can then send it.',
            },
            {
                q: 'Does the client know about the approval process?',
                a: 'No. The flow is completely internal. For the client, the quote simply arrives once the commercial team has released it.',
            },
        ],
        cta: { titulo: 'Stop losing margin by mistake.', sub: 'Protect your profitability on every quote with the Professional plan.' },
    },
    {
        slug: 'equipo',
        nav: 'Roles & team',
        eyebrow: 'TEAM, ROLES AND MULTI-ENTITY',
        titulo: 'Your whole team, working in sync.',
        sub: 'Invite your sales reps, admins, and accountants with granular permissions. Manage multiple entities or brands from a single master account.',
        metaTitle: 'Team management, roles and multi-entity for B2B — Cord',
        metaDescription: 'Manage your sales team with granular permissions and handle multiple companies or entities from a single Cord account.',
        plan: 'Available from the Starter plan (Multi-entity requires Professional)',
        stats: [
            { valor: '5', countup: 5, label: 'levels of granular permissions' },
            { valor: '100', countup: 100, suffix: '%', label: 'of actions are left in the audit log' },
            { valor: 'SSO', label: 'secure corporate login' },
        ],
        blocks: [
            {
                eyebrow: 'B2B PERMISSIONS',
                titulo: 'Everyone sees only what they should.',
                copy: 'A sales rep only sees their own clients and quotes. The sales manager sees everyone\'s pipeline. The accountant logs in just to download the CFDIs. Total security by design.',
                bullets: [
                    'Predefined roles (Admin, Manager, Rep, Accountant)',
                    'Total privacy between rep portfolios',
                    'Export or deletion blocks',
                ],
            },
            {
                eyebrow: 'MULTI-ENTITY',
                titulo: 'Several entities, one single dashboard.',
                copy: 'If your corporate group operates with several brands or tax entities, you don\'t need separate accounts. Switch companies with one click, share the catalog if you want, and keep collections organized.',
                bullets: [
                    'Quick company switching (Org switching)',
                    'Isolated logo, colors, and tax seals',
                    'Consolidated or individual reports',
                ],
            },
            {
                eyebrow: 'SSO AND SECURITY',
                titulo: 'Enterprise-grade access.',
                copy: 'Your team logs in with your domain\'s Google or Microsoft credentials. If someone leaves the company, you cut their email and they instantly lose access to Cord.',
                bullets: [
                    'Single Sign-On (SSO) with standard providers',
                    'Robust authentication backed by Clerk',
                    'Session log and access auditing',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EVERYONE SEES ONLY WHAT THEY NEED',
                titulo: 'Security should not be a favor you ask your sales rep for.',
                copy: 'The rep only sees their own book. The manager sees the full pipeline. The accountant only gets in for the invoices. No one has access to more than they need, by design.',
            },
            {
                eyebrow: 'GROW WITHOUT MULTIPLYING ACCOUNTS',
                titulo: 'Multiple legal entities, one single control panel.',
                copy: 'Switch companies with one click instead of juggling separate passwords for every brand in the group. Catalog, collections, and reports stay organized separately.',
            },
            {
                eyebrow: 'ENTERPRISE-GRADE SECURITY',
                titulo: 'When someone leaves the company, their access leaves the same day.',
                copy: 'Sign-in with your team\'s corporate credentials. Cut the email, Cord gets cut too — no tickets, no waiting for someone to remember to revoke access.',
            },
        ],
        faqs: [
            {
                q: 'Can a sales rep see another rep\'s clients?',
                a: 'By default, no. The "Rep" role restricts the view solely to their own portfolio and their own quotes. Only managers and admins have a global view.',
            },
            {
                q: 'How does the multi-entity feature work?',
                a: 'You can create multiple Organizations under your same user account. Each organization has its own RFC, logo, seal certificate, and clients. You can invite users to one company and not another.',
            },
            {
                q: 'What is SSO and why is it more secure?',
                a: 'Single Sign-On (SSO) allows your employees to log in using your company\'s identity system (e.g., Google Workspace). This way they don\'t have to remember new passwords and you centralize access control.',
            },
        ],
        cta: { titulo: 'Bring your team on board.', sub: 'Start collaborating and standardizing your process today.' },
    },
    {
        slug: 'negociacion',
        nav: 'B2B Negotiation',
        eyebrow: 'NEGOTIATION & APPROVALS',
        titulo: 'Bulletproof agreements, line by line.',
        sub: 'Your clients can review, adjust quantities, or counteroffer on specific products. Every change generates an immutable, cryptographically signed version — goodbye misunderstandings.',
        metaTitle: 'B2B Quote Negotiation — Cord',
        metaDescription: 'Allow clients to approve or counteroffer line by line. Every version is immutable and SHA-256 signed for full transparency.',
        plan: 'Available on the Pro plan',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'traceability on every version' },
            { valor: '0', countup: 0, label: 'misunderstandings about the final price' },
            { valor: 'SHA-256', label: 'cryptographic signature per document' },
        ],
        blocks: [
            {
                eyebrow: 'LINE-BY-LINE APPROVAL',
                titulo: 'Surgical negotiation.',
                copy: 'The client doesn\'t reject the whole quote if one price doesn\'t fit. They can approve 9 items and counteroffer on just 1. You decide to accept, reject, or counter, keeping the deal alive.',
                bullets: [
                    'Line-level approval and counteroffers',
                    'Quantity adjustments suggested by client',
                    'Integrated chat flow to discuss terms',
                ],
            },
            {
                eyebrow: 'IMMUTABLE VERSIONS',
                titulo: 'A history that doesn\'t lie.',
                copy: 'Every time a quote changes state (sent, counteroffer, approved), Cord generates an immutable snapshot. If a client says "I approved something else", you have the exact record of who, when, and what.',
                bullets: [
                    'Visual version history (v1, v2, v3...)',
                    'Quick diff comparison between versions',
                    'One-click restore to a previous version',
                ],
            },
            {
                eyebrow: 'CRYPTOGRAPHIC SIGNATURE',
                titulo: 'Bank-grade security.',
                copy: 'The final approved version is sealed with a SHA-256 hash. This guarantees not a single comma can be altered after approval without breaking the mathematical signature.',
                bullets: [
                    'SHA-256 signature injected in the final PDF',
                    'Independent mathematical audit',
                    'Legal certainty in the commercial agreement',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'TOTAL REJECTION, AVOIDED',
                titulo: 'One price should not cost you the whole sale.',
                copy: 'Your client approves 9 lines and objects to just 1 — not all 10. Negotiation becomes surgical instead of all-or-nothing.',
            },
            {
                eyebrow: 'THE "I NEVER APPROVED THAT"',
                titulo: 'Every version gets frozen. No one can rewrite history.',
                copy: 'If the client says they approved something else, you have the exact record: what, when, and who. Memory no longer depends on a lost email.',
            },
            {
                eyebrow: 'BANK-GRADE CERTAINTY',
                titulo: 'A signature not even you can alter afterward.',
                copy: 'A SHA-256 hash seals the final approved version. Not a single comma can be touched without the mathematical signature giving it away.',
            },
        ],
        faqs: [
            {
                q: 'What does it mean for a quote to have immutable versions?',
                a: 'It means that every time there is a negotiation, instead of overwriting the original document, a new version is created. All previous versions are permanently saved and cannot be modified, serving as evidence of the sales process.',
            },
            {
                q: 'How does the SHA-256 signature work?',
                a: 'It is a cryptographic algorithm that takes the exact content of the approved quote and generates a unique code. If someone tried to change a price or quantity after approval, the code would change entirely, exposing the manipulation.',
            },
            {
                q: 'Does the client need an account to negotiate?',
                a: 'No. The client accesses via the secure public link, verifies their identity with an OTP code sent to their email (optional), and can comment, approve, or counteroffer directly from their browser.',
            },
        ],
        cta: { titulo: 'Close deals with full transparency.', sub: 'Prevent misunderstandings and formalize your sales.' },
    },
    {
        slug: 'presupuestos',
        nav: 'Budgets',
        eyebrow: 'FINANCIAL PLANNING',
        titulo: 'The budget that checks itself against reality.',
        sub: 'Plan your sales, collections and cash by month — and Cord puts what you actually sold and collected under every figure. You know if you are above or below plan without typing a thing.',
        metaTitle: 'Budgets with automatic comparison against real sales — Cord',
        metaDescription: 'Budget schedules connected to your real sales and collections: budget vs. actuals month by month, a one-click full financial plan, and NPV, EOQ and variance calculators.',
        plan: 'Free to try · full from Professional',
        stats: [
            { valor: '1', countup: 1, suffix: ' click', label: 'to create your connected Sales → Collections → Cash plan' },
            { valor: '0', countup: 0, suffix: ' data entry', label: 'to compare against your real sales and collections' },
            { valor: '3', countup: 3, label: 'decision calculators: NPV/IRR, inventory (EOQ) and variances' },
        ],
        blocks: [
            {
                eyebrow: 'BUDGET VS. ACTUALS',
                titulo: "Excel doesn't know what you sold. Cord does.",
                copy: 'Connect a budget row to your real data — closed sales, units or collections received — and under every month you see what actually happened, with the variance in green or red. The budget audits itself.',
                bullets: [
                    'Closed sales, units sold or collections received, by month',
                    'Variance against plan calculated automatically',
                    'Zero double entry: the data already lives in Cord',
                ],
            },
            {
                eyebrow: 'FULL PLAN IN ONE CLICK',
                titulo: 'Sales, collections and cash, already connected.',
                copy: 'The wizard builds the full cascade — how much you will sell, when you will actually get paid, and whether the cash holds up — with cross-schedule formulas pre-wired and seeded with your real average sales from recent months.',
                bullets: [
                    'Staggered collections (40/30/30) adjustable to your real pattern',
                    'Month-by-month cash balance with inflows and outflows',
                    'Optional production and raw-material purchase schedules',
                ],
            },
            {
                eyebrow: 'DECISIONS WITH NUMBERS',
                titulo: 'Calculators that answer expensive questions.',
                copy: 'Is this investment worth it? How much inventory should I order? Why did actual cost beat standard? NPV/IRR with payback period, economic order quantity (EOQ) and variance analysis — with scenarios you can save and reopen.',
                bullets: [
                    'NPV, IRR and payback period with a cash-flow assistant',
                    'Economic order quantity and reorder point',
                    'Price and quantity variance, favorable or unfavorable',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE PLAN THAT DOES NOT DIE',
                titulo: 'Most budgets are abandoned by February. Yours reviews itself every month.',
                copy: 'A budget spreadsheet gets abandoned because comparing it to reality takes hours. In Cord the comparison is already done when you open the page.',
            },
            {
                eyebrow: 'NO BLANK-SHEET START',
                titulo: 'Your first full financial plan, ready before your coffee cools.',
                copy: 'The wizard builds Sales → Collections → Cash with cross-wired formulas and your real history as the starting point. You just adjust the assumptions.',
            },
            {
                eyebrow: 'MEETINGS WITH EVIDENCE',
                titulo: '"We are 12% below the sales plan" — said with data, not hunches.',
                copy: 'Every budgeted cell shows the actual for that month and its variance. Monday\'s conversation goes from opinions to decisions.',
            },
        ],
        faqs: [
            {
                q: 'What does "Budget vs. Actuals" mean?',
                a: 'You connect a row of your schedule to a real data source in your account — closed sales, units sold or collections received — and Cord shows under each budgeted month what actually happened, with the variance percentage. Use period labels like "Jan 2026" so each column matches its month.',
            },
            {
                q: 'Do I need a cost-accounting background to use it?',
                a: 'No. Templates ship with the classic formulas pre-built (Production = Sales + desired ending inventory − beginning inventory, staggered collections, cash balance) and the full-plan wizard creates the connected cascade for you. If you do know cost accounting, the formula builder gives you full control: sums, chained factors, row-by-row multiplication and references to prior periods.',
            },
            {
                q: 'What does the free plan include?',
                a: 'The Free plan includes 1 schedule and Starter 3, so you can try the editor with your numbers. From Professional you get unlimited schedules, the one-click full financial plan, the comparison against your real data, and the analysis tools (NPV/IRR, EOQ and variances).',
            },
            {
                q: 'Is this an inventory system?',
                a: 'No — it is a planning tool. Beginning and ending inventory are assumptions you set per period, not balances tracked from warehouse movements. To decide how much to order and when, the optimal inventory calculator (EOQ) gives you the economic order quantity and the reorder point.',
            },
        ],
        cta: { titulo: 'Stop planning blind.', sub: 'Create your first schedule for free — and connect the plan to reality from Professional.' },
    },
];

export const findFeatureEn = (slug: string) => FEATURES_EN.find(f => f.slug === slug);
