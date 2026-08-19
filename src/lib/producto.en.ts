// src/lib/producto.en.ts
import type { Feature } from './producto';

export const FEATURES_EN: Feature[] = [
    {
        slug: 'editor',
        nav: 'Quote editor',
        eyebrow: 'QUOTE EDITOR',
        titulo: 'The perfect quote, in minutes.',
        sub: 'Drag products from your catalog, negotiate prices line by line, and watch the total recalculate with tax live. What used to take an hour in Excel now takes minutes.',
        metaTitle: 'How to make quotes with negotiated prices — Cord',
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
                copy: 'The list price is just the starting point. In Cord, you adjust the price of each line and the system shows you the applied discount instantly — you decide how far to go, the system makes sure the numbers add up.',
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
        metaTitle: 'Quote approval via link without registration — Cord',
        metaDescription: "Cord's public link creates a branded page (logo, colors, and tax details) where your client reviews the quote and approves in one click — no account, no downloads. For any business, anywhere.",
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
        slug: 'clientes-credito',
        nav: 'Clients and credit',
        eyebrow: 'CLIENTS AND CREDIT',
        titulo: 'Credit is your advantage. Control it.',
        sub: 'Selling on credit is selling more — if you control it. Cord saves each client\'s terms (Cash, Net 30, Net 60) and their credit limit, and applies them automatically to each quote.',
        metaTitle: 'Credit management: Net 30, Net 60, and credit limit per client — Cord',
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
        metaTitle: 'Automated AI collections for any business — Cord',
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
        titulo: 'Quote in dollars. Invoice in your currency. Protect your margin.',
        sub: 'Your client sees the price in their currency; you invoice in yours. Cord locks the daily exchange rate for 30 days and adds a hedging buffer, so the margin you closed is the margin you collect.',
        metaTitle: 'Quotes in dollars and euros with FX hedging — Cord',
        metaDescription: 'Quote in USD or EUR and invoice in your tax currency. Cord takes the spot rate from the ECB, applies a hedging buffer to protect your margin, and locks the FX rate for 30 days. For any business, anywhere, that deals in foreign currency.',
        plan: 'Available on all plans',
        stats: [
            { valor: '30', countup: 30, suffix: ' days', label: 'that the exchange rate is locked per quote' },
            { valor: '3', countup: 3, label: 'presentation currencies: USD, EUR, and MXN — invoice in the tax currency you use' },
            { valor: '2', countup: 2, suffix: '%', label: 'suggested hedging buffer over the spot rate, adjustable' },
        ],
        blocks: [
            {
                eyebrow: 'TWO CURRENCIES, ONE DEAL',
                titulo: 'The client sees dollars. You invoice in yours.',
                copy: 'In Cord, the presentation currency and the tax currency are two different things. Your client reviews and approves the quote in dollars or euros; you record your own tax currency (in Mexico, pesos via real CFDI 4.0). Cord saves both currencies and the rate it locked them at within the same quote, without you tracking the conversion by hand.',
                bullets: [
                    'Present in USD, EUR, or MXN; invoice in your tax currency',
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
                titulo: 'Your client sees dollars. You invoice in yours. No one gets confused.',
                copy: 'Present in USD or EUR as your international client expects; invoice in your own tax currency, whether that\'s pesos, dollars, or whatever you use (in Mexico, via real CFDI 4.0). Both currencies stay locked together in the same document.',
            },
        ],
        faqs: [
            {
                q: 'Can I quote in dollars and invoice in pesos with Cord?',
                a: 'Yes. In Cord, the presentation currency is independent of the tax currency. Your client reviews and approves the quote in dollars (USD) or euros (EUR), while you record your own tax currency (for example, Mexican pesos). Cord saves both currencies and the applied exchange rate within the same quote, so you don\'t need to track the conversion separately in an Excel sheet. If your business is in Mexico, the invoice is issued in pesos as a real CFDI 4.0 with the SAT.',
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
        slug: 'facturacion',
        nav: 'Cord Invoicing',
        eyebrow: 'CORD INVOICING',
        titulo: 'An invoice stops being a PDF you email.',
        sub: 'Cord issues the invoice, gives it your own numbering, stamps it where stamping is required, sends it to your client with its own payment link, and tells you how much is still owed. In Mexico that means real CFDI 4.0 with the SAT; everywhere else, a commercial invoice with your brand and the exchange rate stated on it.',
        metaTitle: 'Cord Invoicing: online invoicing with a payment link and CFDI 4.0 — Cord',
        metaDescription: 'Issue invoices with your own numbering, send them with their payment link, and follow the balance until it is paid. Real CFDI 4.0 stamped with the SAT in Mexico, commercial invoices everywhere else, in the currency of the sale.',
        plan: 'Invoice issuing from the Starter plan — CFDI 4.0 in Mexico and a commercial invoice everywhere else; multi-currency on all plans, including the free one',
        stats: [
            { valor: '5', countup: 5, label: 'lifecycle states: draft, open, paid, void and uncollectible' },
            { valor: '1', countup: 1, label: 'link per invoice, with its live balance and its own checkout' },
            { valor: '4.0', label: 'CFDI version Cord stamps for real with the SAT' },
        ],
        blocks: [
            {
                eyebrow: 'A FULL LIFECYCLE',
                titulo: 'An invoice is not a file. It is a state.',
                copy: 'You build it as a draft and review it without committing anything: the number is not burned until you issue it. Issuing makes it immutable and stamped. When money comes in, the balance drops on its own. Got it wrong before collecting? It voids with the tax provider. Already collected? The right move is a credit note, and Cord will not let you confuse the two.',
                bullets: [
                    'Editable draft that consumes no number and no stamp',
                    'Real cancellation with the SAT, not just a color change on screen',
                    'Credit note when the invoice already has payments applied',
                ],
            },
            {
                eyebrow: 'A PAYMENT LINK PER INVOICE',
                titulo: 'Your client opens the invoice and pays right there.',
                copy: 'Every invoice gets its own page carrying your brand: line items, due date, payments already received, and the balance left. From there it gets paid by card, straight into your account. The PDF downloads, and in Mexico so does the XML. You see when your client opened it — and only when your client opens it, not when you check your own link.',
                bullets: [
                    'A public page per invoice, with your logo and your color',
                    'Card checkout for the balance, into your connected account',
                    'PDF always, stamped XML in Mexico',
                ],
            },
            {
                eyebrow: 'THE RAIL CHANGES BY COUNTRY',
                titulo: 'Mexico stamps with the SAT. Everywhere else invoices with your numbering.',
                copy: 'When the business is Mexican, Cord stamps real CFDI 4.0 through an authorized certification provider: valid UUID, XML and PDF, under your own digital seal certificate. Outside Mexico it issues a commercial invoice with your own sequential numbering and your brand — and says so plainly, without pretending it filed anything with an authority that is not connected yet. The workflow is identical either way.',
                bullets: [
                    'CFDI 4.0 stamped with the SAT under your company certificate',
                    'Commercial invoice with your own sequential numbering outside Mexico',
                    'The invoice is issued in the currency of the sale, with the exchange rate stated',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'FROM DEAL TO INVOICE',
                titulo: 'Invoice from a closed quote or from scratch, without switching tools.',
                copy: 'If the deal already lived in Cord, the invoice inherits client, lines and currency. If it did not, you create it directly: that is the most common case in a business, and it should not require inventing a quote first.',
            },
            {
                eyebrow: 'THE BALANCE UPDATES ITSELF',
                titulo: 'You stop wondering how much is left on each invoice.',
                copy: 'A card payment from the link, a wire you record by hand: both bring down the balance of the same invoice. When it reaches zero the invoice is marked paid and leaves your overdue book.',
            },
            {
                eyebrow: 'INVOICING BY API',
                titulo: 'Everything above also works without opening Cord.',
                copy: 'The v1 API creates drafts, issues, sends, records payments and voids. Webhooks fire when an invoice is issued, paid, fails to collect, or goes past due.',
            },
        ],
        faqs: [
            {
                q: 'Can I issue an invoice without creating a quote first?',
                a: 'Yes. In Cord an invoice is an object of its own: go to Invoices, pick a client, enter the line items and save it as a draft. No quote required. If the deal did come from an approved quote, the invoice inherits client, lines and currency automatically and the two stay linked.',
            },
            {
                q: 'Does Cord stamp real CFDI 4.0 with the SAT?',
                a: 'Yes, in Mexico. Cord stamps CFDI 4.0 through an authorized certification provider using your own company digital seal certificate: the document is issued under your tax ID, with a valid UUID, XML and PDF. You upload your certificate once in Settings and every invoice is stamped under your account, not a shared one.',
            },
            {
                q: 'How do I cancel an invoice that was already stamped?',
                a: 'From the invoice detail, with the Void action. Cord sends the cancellation to the SAT using your own certificate and only marks it void once the SAT confirms; if the SAT rejects it, Cord tells you instead of showing a "cancelled" invoice that is still live. If the invoice already has payments applied it cannot be voided: Cord asks you to issue a credit note, which is the correct document for that case.',
            },
            {
                q: 'What is the invoice page and what does my client see there?',
                a: 'It is a link belonging to each invoice, with your logo and your color. Your client sees the line items, the total, the due date, the payments already received and the balance left, and can pay it by card right there; the money lands in your connected account. They can also download the PDF and, in Mexico, the stamped XML.',
            },
            {
                q: 'Can I invoice in dollars if my books are in another currency?',
                a: 'Yes. The invoice is issued in the currency of the sale — the one your client approved and pays — and states the exchange rate to your accounting currency, which is exactly what the SAT requires. Cord takes the rate from a real, dated source. If it cannot get a rate, issuing fails with a clear message rather than inventing a number: an invoice carrying a fake exchange rate is a tax problem, not a detail.',
            },
            {
                q: 'Does Cord tell me when an invoice goes past due?',
                a: 'Yes. Every invoice carries its own due date, and Cord emails the client a reminder before and after it lands. The inbox shows how much is outstanding, how much is past due, and how many days each invoice has been late. Webhooks also fire an event when an invoice goes past due, gets paid, or fails to collect.',
            },
            {
                q: 'Can I invoice from my own system, without opening Cord?',
                a: 'Yes. The v1 API exposes the full invoice: create a draft, issue it, send it to the client, record a payment, void it and issue a credit note, plus read invoices with their balance. Webhooks report every state change. Cord also exposes an MCP server, so an AI assistant can read your invoices and prepare drafts.',
            },
            {
                q: 'What if my business is not in Mexico?',
                a: 'Cord issues a commercial invoice with your own sequential numbering, your tax details and your brand, in the currency of the sale. It is a valid commercial document for collecting and for your books, and Cord says exactly that: it does not claim to have filed anything with your local tax authority, because that rail is not connected outside Mexico yet. The per-country architecture is already built to add them.',
            },
        ],
        cta: { titulo: 'Issue, send and collect. In one place.', sub: 'Invoice with your own numbering, send it with its payment link, and watch the balance drop. Start for free.' },
    },
    {
        slug: 'finanzas',
        nav: 'Finance & CFO',
        eyebrow: 'YOUR AI CFO',
        titulo: 'Predictive cash flow at 90 days.',
        sub: 'Cross-reference your pipeline with each client\'s real payment history. Know what you will collect before you collect it and spot non-payment risks before they happen.',
        metaTitle: 'Predictive cash flow and AI CFO dashboard — Cord',
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
        metaTitle: 'Margin control and approval workflows for sales — Cord',
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
        metaTitle: 'Team management, roles and multi-entity accounts — Cord',
        metaDescription: 'Manage your sales team with granular permissions and handle multiple companies or entities from a single Cord account.',
        plan: 'Available from the Starter plan (Multi-entity requires Professional)',
        stats: [
            { valor: '5', countup: 5, label: 'levels of granular permissions' },
            { valor: '100', countup: 100, suffix: '%', label: 'of actions are left in the audit log' },
            { valor: 'SSO', label: 'secure corporate login' },
        ],
        blocks: [
            {
                eyebrow: 'TEAM PERMISSIONS',
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
                    'Robust authentication',
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
        nav: 'Negotiation',
        eyebrow: 'NEGOTIATION & APPROVALS',
        titulo: 'Bulletproof agreements, line by line.',
        sub: 'Your clients can review, adjust quantities, or counteroffer on specific products. Every change generates an immutable, cryptographically signed version — goodbye misunderstandings.',
        metaTitle: 'Quote Negotiation with Digital Signature — Cord',
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

];

export const findFeatureEn = (slug: string) => FEATURES_EN.find(f => f.slug === slug);
