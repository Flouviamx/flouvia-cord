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
                    'Online card payment, available on every plan',
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
        titulo: 'Know what each client owes you before you sell to them again.',
        sub: 'Every client has a record with their payment terms, their credit limit and an up-to-date account statement that brings quotes and invoices together. You sell on credit with the numbers in front of you, not from memory.',
        metaTitle: 'Clients, Net 30/60 credit and per-client account statements — Cord',
        metaDescription: "Store each client's payment terms (Cash, Net 30, Net 60), credit limit and price tier, and check their account statement by age, with quotes and invoices together. On every plan.",
        plan: 'Available on every plan: 50 clients on Free, 500 on Starter and no cap from Professional',
        stats: [
            { valor: '3', countup: 3, label: 'payment terms per client: Cash, Net 30 and Net 60' },
            { valor: '5', countup: 5, label: 'aging bands in the account statement: current, 1–30, 31–60, 61–90 and over 90 days' },
            { valor: '4', countup: 4, label: 'price tiers per client (Standard, Silver, Gold and Distributor), each with its discount' },
        ],
        blocks: [
            {
                eyebrow: 'THE RECORD',
                titulo: 'One client, one record with everything you need to quote them.',
                copy: 'Company, contact, tax ID under the name their country uses, address, payment terms, credit limit and price tier. The tier applies its discount as soon as you pick the client in the editor, so your whole team quotes by the same rules. Your directory comes in and goes out as CSV.',
                bullets: [
                    'Tax ID labeled the way their country calls it: RFC, NIF, EIN…',
                    'Silver, Gold and Distributor tiers with an automatic discount',
                    'Directory import and export in CSV',
                ],
            },
            {
                eyebrow: 'ACCOUNT STATEMENT',
                titulo: 'What they owe you, by age, on their own record.',
                copy: "Each client's record brings together what they have open in approved quotes and in invoices, net of deposits, partial payments and credit notes, and splits it by age: current, 1 to 30 days, 31 to 60, 61 to 90 and over 90. Each document shows its due date and days overdue, and opens its detail in one click.",
                bullets: [
                    'Total balance, overdue amount and oldest delay, as of today',
                    'Quotes and invoices together, never counting the same sale twice',
                    'On every plan, nothing to set up',
                ],
            },
            {
                eyebrow: 'LIMITS AND TERMS',
                titulo: 'The limit warns you. The decision is still yours.',
                copy: "With a limit in place, the record shows what share of the credit is in use and flags it when the open balance goes over; from Professional, the collections board gathers every client over their limit. And a Net 30 or Net 60 sale doesn't charge the client early: the link confirms the order on credit, shows the due date and, if you collect online, offers payment when the date arrives.",
                bullets: [
                    "Share of credit in use, with an alert when it's exceeded",
                    'Clients over their limit in one place, from Professional',
                    'On credit, the link shows the due date instead of charging',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE CLIENT WHO DRIFTS AWAY',
                titulo: "A good client doesn't tell you when they stop buying.",
                copy: "The clients report lists the ones who have history with you but no activity in 90 days, with what they've bought and their tier. It's the call worth making before it becomes a habit.",
            },
            {
                eyebrow: 'DISCOUNT VERSUS PUNCTUALITY',
                titulo: 'Your Gold tier gets your best price. Does it also pay on time?',
                copy: "The tier-by-payment-behavior matrix crosses each client's commercial tier with their actual punctuality (on time, 1 to 7 days late, more than 7), so your discounts reward the clients who earn them.",
            },
            {
                eyebrow: 'BEFORE YOU RENEGOTIATE',
                titulo: "You walk into the negotiation knowing how much you've already given.",
                copy: "The record shows the discount given against your list price, what you sell them most and their close rate with you. If they ask for another discount, you know where you're starting from.",
            },
        ],
        faqs: [
            {
                q: 'Does Cord block a quote if the client goes over their limit?',
                a: "No. The limit is an alert, not a lock: the record flags the balance above the limit and the collections board lists it, but the quote can still be sent. If you want a brake before selling, approval rules hold a quote by amount, discount or margin until someone with permission approves it; they're on the Scale plan.",
            },
            {
                q: 'When does the Net 30 or Net 60 clock start?',
                a: "On the day your client approves the quote. That date drives the due date they see on the link, the aging in the account statement and when the sale enters your overdue receivables. Terms are chosen on each quote (Cash, Net 30 or Net 60), and the record stores each client's terms.",
            },
            {
                q: 'Can I bring my directory over from another system?',
                a: "Yes. You upload a CSV with company, contact, email, phone, tax ID, terms and credit limit; if a client already exists, matched by tax ID or company name, it's updated instead of duplicated. You can also export the full directory whenever you need it.",
            },
            {
                q: "Who can change a client's limit or terms?",
                a: "Anyone with the Clients permission, the same one that creates and edits records; the rest of the team can view them. Note that the Rep role has that permission by default. If you'd rather only your admin team touch limits and terms, remove it in Settings › Team & roles; inviting more people is available from Professional.",
            },
        ],
        cta: { titulo: 'Import your directory and give every client their own rules.', sub: 'Import your clients from CSV in minutes. Free for up to 50 clients.' },
    },
    {
        slug: 'cobranza-ia',
        nav: 'AI Collections',
        eyebrow: 'AI COLLECTIONS',
        titulo: 'An agent that drafts your collections and waits for your go-ahead.',
        sub: 'Every day, the agent reviews your overdue accounts and writes to each one with its real balance, its days overdue and the link to pay. It can offer an installment plan within your limits, and nothing goes out without your approval until you decide to let it run on its own.',
        metaTitle: 'AI collections: an agent that drafts and negotiates your overdue accounts — Cord',
        metaDescription: "Cord's collections agent writes to each overdue account with its real balance and payment link, can offer plans of 2 to 6 installments within your limits and waits for your approval before sending. On the Scale plan.",
        plan: 'AI collections agent on the Scale plan; the collections module (receivables, priorities and payment promises) from Professional',
        stats: [
            { valor: '1', countup: 1, label: 'daily run over your overdue accounts, plus any you start with "Run now"' },
            { valor: '6', countup: 6, label: 'monthly installments at most in a plan; you set the cap from 2' },
            { valor: '0', countup: 0, label: 'emails sent without your approval while the agent works in approval mode' },
        ],
        blocks: [
            {
                eyebrow: 'THE AGENT',
                titulo: 'Every email carries the real balance and the link to pay.',
                copy: "Once a day, the agent takes the accounts that are past their due date and the grace days you set, and drafts a different email for each one: the balance actually left after what they already paid, the days overdue, and the link to pay online. It writes in the tone you choose, in Spanish or English and with your signature, and doesn't write to the same account again before the number of days you set.",
                bullets: [
                    'Grace days, days between emails and minimum amount, set by you',
                    'Warm, professional or firm tone, with your signature',
                    'Up-to-date retainers and excluded accounts never get emails',
                ],
            },
            {
                eyebrow: 'INSTALLMENT PLANS',
                titulo: "If the client can't pay it all, it offers installments.",
                copy: "From the days overdue you choose, the agent can propose a plan of 2 to 6 monthly installments that add up exactly to the balance: no discounts on what's owed and no amounts rounded by eye, because Cord calculates the installments, not the model. In approval mode, the plan only becomes real when you approve it; then the pending balance is replaced by installments with their own due dates, payable from the same link.",
                bullets: [
                    'From 2 to 6 monthly installments; you set the maximum',
                    'Installments add up to the balance to the cent, no write-offs',
                    'Progress in view: how many installments are paid and when the next one is due',
                ],
            },
            {
                eyebrow: 'YOU DECIDE',
                titulo: 'Nothing reaches your client without going through your inbox.',
                copy: "In approval mode, every email waits in the inbox: you approve it, edit it, ask the agent to redo it with an instruction, or discard it, and you get a single notice per run, not one per client. \"Up next\" tells you who it will write to on the next run and who it won't, and why. And if a client shouldn't get emails, you exclude them in one click.",
                bullets: [
                    'Approve, edit, redo or discard every draft',
                    '"Up next": who it will write to, and why not the rest',
                    'Every approval, discard and exclusion is logged in the audit trail',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'OVERDUE AND UNTOUCHED',
                titulo: 'The most expensive account is the one nobody has touched.',
                copy: "The collections board separates what's overdue with a payment promise from what nobody has handled, and ranks the rest by amount and days overdue. It's available from the Professional plan, before you turn on any agent.",
            },
            {
                eyebrow: 'RECOVERED BY THE AGENT',
                titulo: 'Only what was paid after its email counts as recovered.',
                copy: "The agent's dashboard adds up what was collected in the last 30 days on accounts it had already written to before the payment; money that came in on its own isn't credited to it. Next to it, you see how many installment plans are still active and how much money they commit.",
            },
            {
                eyebrow: 'FROM APPROVAL TO AUTOMATIC',
                titulo: 'You start by approving everything. You let go once the emails stop needing changes.',
                copy: "The agent starts in approval mode. Once you've approved eight emails without changing a word, Cord suggests switching it to automatic; if you'd rather keep reviewing, it keeps waiting for your go-ahead.",
            },
        ],
        faqs: [
            {
                q: 'What happens when the client replies?',
                a: "The reply goes to your contact email: the agent writes on behalf of your business and your client answers you. If you'd rather take over, you write from that account's thread in Cord and the agent reads your message before its next email. If a draft doesn't reflect what you already discussed, you give it an instruction (\"agreed to three installments\", \"shorter\") and it redoes it.",
            },
            {
                q: 'How is it different from automatic reminders?',
                a: "Reminders go out on every plan with the same template for everyone: by default, an invoice gets a notice seven days and one day before it's due, and 3, 7, 14 and 30 days after. The agent writes a different email for each account based on how late it is and what's already been said, respects your exclusions and can offer installments. The two can run side by side.",
            },
            {
                q: 'Can the agent offer discounts?',
                a: "No. Its rules forbid discounts on what's owed, and a plan is only recorded if its installments add up exactly to the balance: Cord checks it on the server instead of trusting what the model writes. It also won't propose a second plan to an account that already has one in place.",
            },
            {
                q: 'Which address does it write from, and what does my client see?',
                a: "The email goes out in your business's name through Cord, with replies going to your contact email, and includes a button to pay online when you have payments turned on. The footer says it's an automated collections message sent on behalf of your business and how to ask for those messages to stop.",
            },
            {
                q: 'Which plan do I need, and what does it use up?',
                a: 'The agent is on the Scale plan, and each email it drafts uses one AI action from your plan: Scale includes 500 a month and anything beyond that is billed as overage. The collections module (receivables by age, priorities, payment promises and WhatsApp reminders) is available from Professional.',
            },
        ],
        cta: { titulo: "Your overdue accounts don't have to wait until you have time.", sub: 'Turn on the agent in approval mode and review its first emails. Available on the Scale plan.' },
    },
    {
        slug: 'divisas',
        nav: 'Multi-currency & FX',
        eyebrow: 'MULTI-CURRENCY',
        titulo: "Sell in your client's currency. Keep your books in yours.",
        sub: 'You quote and invoice in any of 14 currencies, and every sale is recorded in your accounting currency at a rate taken from a published source, never made up. If no source publishes the exchange rate, the operation stops and tells you why.',
        metaTitle: 'Quotes and invoices in dollars, euros and 12 more currencies — Cord',
        metaDescription: "Quote and invoice in your client's currency and record every sale in your accounting currency at an exchange rate from a published source, locked when you quote and declared on the invoice. 14 currencies, on every plan.",
        plan: 'Available on every plan, including Free',
        stats: [
            { valor: '14', countup: 14, label: "currencies to quote and invoice in: those of Cord's 12 countries plus JPY, CNY, CHF and AUD" },
            { valor: '3', countup: 3, label: 'exchange-rate sources checked in order, starting with the European Central Bank' },
            { valor: '24', countup: 24, suffix: ' h', label: "maximum age for a stored rate; if it's older, the operation stops" },
        ],
        blocks: [
            {
                eyebrow: 'THE SALE CURRENCY',
                titulo: 'Your client sees, approves and pays in their currency.',
                copy: 'You pick the currency when you build the quote and enter prices directly in it. The link, the email, the online payment and the invoice all go out in that same currency, with its own symbol and format, without anyone converting by hand in a spreadsheet.',
                bullets: [
                    "14 currencies: those of Cord's 12 countries plus JPY, CNY, CHF and AUD",
                    'Link, email, payment and invoice in the same currency',
                    'Prices are entered in the sale currency',
                ],
            },
            {
                eyebrow: 'YOUR ACCOUNTING CURRENCY',
                titulo: 'Your books stay in your currency, with the rate in plain sight.',
                copy: 'When you sell in one currency and keep your books in another, Cord locks the exchange rate when you save the quote, and that same rate is the one the invoice declares, even if you issue it weeks later. The invoice stores the total in both currencies and the PDF prints the rate used.',
                bullets: [
                    'Rate locked when you quote: the same one the invoice declares',
                    'Total in the sale currency and in your accounting currency',
                    'In Mexico, the CFDI carries that rate as its exchange rate',
                ],
            },
            {
                eyebrow: 'A RATE YOU CAN BACK UP',
                titulo: 'No published rate, no rate.',
                copy: "Cord looks up the exchange rate from public sources that date every figure, starting with the European Central Bank. If none of them responds, the quote isn't saved and the editor tells you why: you can try again in a moment or quote in your own currency. A stored rate is only reused if it's less than 24 hours old; it's never replaced with 1:1 or a fixed table.",
                bullets: [
                    'The European Central Bank first, then broad-coverage sources',
                    'Never a 1:1 rate or a fixed fallback table',
                    'With no rate to back it up, the operation stops with a clear message',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'BEFORE YOU SEND',
                titulo: "Before sending the quote, you already know what it's worth in your currency.",
                copy: "When you pick another currency, the editor shows today's exchange rate and one clear line: what your client pays and what that means in your books. If no rate is available at that moment, it says so right there instead of showing you a placeholder number.",
            },
            {
                eyebrow: "CENTS THAT DON'T EXIST",
                titulo: 'A Chilean peso has no cents. Charging it as if it did multiplies the charge by a hundred.',
                copy: "Cord knows each currency's decimals: the yen and the Chilean peso carry no cents, and that's how they reach the online payment. A tool that assumes two decimals for every currency charges your client a hundred times too much.",
            },
            {
                eyebrow: 'BEYOND THE EURO AND THE DOLLAR',
                titulo: "From dollars to Colombian pesos, even though the European Central Bank doesn't publish them.",
                copy: "The ECB doesn't publish every Latin American currency. For the Colombian, Chilean or Argentine peso or the Peruvian sol, Cord takes the rate from other dated sources, in order, instead of leaving you unable to quote.",
            },
        ],
        faqs: [
            {
                q: 'Which currencies can I use?',
                a: "Fourteen: Mexican peso, US dollar, Canadian dollar, Brazilian real, euro, pound sterling, Colombian peso, Argentine peso, Chilean peso and Peruvian sol (the currencies of the 12 countries where Cord operates), plus yen, yuan, Swiss franc and Australian dollar for international trade. If your account already used a currency that's no longer on the list, you keep it.",
            },
            {
                q: 'Does the locked rate protect my margin?',
                a: "It protects your numbers, not the money. The locked rate decides how the sale is recorded in your accounting currency and which exchange rate the invoice declares; the editor lets you add a cushion of 1, 2 or 5% on top of today's rate, with 2% by default. It isn't an FX hedge: your client pays the amount in the sale currency, and the money is converted when it reaches your account by your bank or payment processor at that day's rate.",
            },
            {
                q: 'Does anything change if my client pays online?',
                a: 'The payment is made in the sale currency. SPEI only accepts Mexican pesos, so on a quote in another currency your client pays by card even if you have SPEI turned on.',
            },
        ],
        cta: { titulo: 'Quote abroad without an exchange-rate spreadsheet on the side.', sub: 'Pick the currency when you build the quote. On every plan, free to start.' },
    },
    {
        slug: 'pagos',
        nav: 'Cord Payments',
        eyebrow: 'CORD PAYMENTS',
        titulo: 'The link that closes the sale also collects it.',
        sub: "Your client pays from the quote or the invoice, by card or through Mercado Pago depending on your country, and the money lands in your account, not Cord's. Setting up your payout account (identity, owners and bank details) happens inside Cord.",
        metaTitle: 'Cord Payments: card, SPEI and Mercado Pago payments from your link — Cord',
        metaDescription: 'Collect quotes and invoices from their own link: cards in 8 countries, SPEI in Mexican pesos and Mercado Pago in six Latin American markets. Deposits, monthly retainers and partial payments, on every plan.',
        plan: 'Available on every plan, including Free. No extra subscription: fees are per payment and depend on the currency and the rail.',
        stats: [
            { valor: '12', countup: 12, label: 'countries with online payment: 8 with Cord Payments and 6 with Mercado Pago; Mexico and Brazil have both' },
            { valor: '4', countup: 4, label: 'ways to collect a quote: full payment, deposit and balance, installments or a monthly retainer' },
            { valor: '0', countup: 0, label: 'third-party dashboards to set up your payout account' },
        ],
        blocks: [
            {
                eyebrow: 'TWO RAILS, ONE LINK',
                titulo: 'Card, SPEI or Mercado Pago, depending on where you sell.',
                copy: "With Cord Payments your client pays by card inside your link, under your brand, without being sent to another site; on quotes in Mexican pesos they can also pay by SPEI, to a CLABE reserved for that payment that reconciles itself. Where Cord Payments isn't available, you collect through your Mercado Pago account: your client pays in its checkout and comes back to your link.",
                bullets: [
                    'The card is charged inside your link, under your brand',
                    'SPEI to a CLABE reserved for each payment, which reconciles itself',
                    "The money goes to your account, never to Cord's",
                ],
            },
            {
                eyebrow: 'WHAT GETS CHARGED',
                titulo: 'Deposit on approval, balance on the due date, retainer every month.',
                copy: 'If you ask for a deposit, the link shows your client at first glance how much they pay on approval and when the balance is due, and charges each part separately. A retainer is authorized once by card and Cord Payments charges it every month. On an invoice, your client can pay part of the balance by card or through Mercado Pago, and the rest stays open.',
                bullets: [
                    'Deposit and balance, each with its own due date',
                    'Monthly retainers: your client authorizes their card once',
                    'Partial payments toward an invoice balance',
                ],
            },
            {
                eyebrow: 'AFTER THE CHARGE',
                titulo: 'You know how much gets deposited, when, and to which account.',
                copy: "In Payments you see your available balance and the next payout with its status (scheduled, in transit or deposited) and arrival date, plus what went to fees, refunds and disputes. You choose how often you get paid, and your bank account is entered in your country's format (CLABE, IBAN, routing number or sort code) and validated before it's saved, including check digits where the format has them.",
                bullets: [
                    'The next payout, with its status and arrival date',
                    'Daily, weekly or monthly payouts, your choice',
                    "Payout account validated in your country's format",
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THREE PARTNERS, NO MADE-UP OWNER',
                titulo: "A company with three partners sets up its account without declaring a sole owner who doesn't exist.",
                copy: "Cord Payments onboarding asks each person's real role (who owns 25% or more, who runs the company) and registers each one with their stake. Each ID photo can be taken on a phone by scanning a code, without losing what was already filled in on the computer.",
            },
            {
                eyebrow: 'CHARGEBACKS',
                titulo: 'If a charge is disputed, the evidence is already assembled.',
                copy: 'Cord gathers what proves the sale (who approved the quote, when, from which IP and which line items) into a document ready to send. You add your files and respond from Payments before the deadline.',
            },
            {
                eyebrow: 'PAYMENTS RECORD THEMSELVES',
                titulo: 'No one has to mark the sale as paid.',
                copy: "When a payment comes in (card, SPEI or Mercado Pago), the quote or invoice updates itself: the balance goes down and, once it reaches zero, it's marked paid. If the same quote gets paid through both rails, it's flagged in the history for you to review instead of being added up silently.",
            },
        ],
        faqs: [
            {
                q: 'How much does it cost to collect online with Cord?',
                a: "There's no extra fee on any plan, including Free: you pay per payment. For payments in Mexican pesos through Cord Payments, the rate is 4% + MXN 3 + VAT by card and 1% + MXN 7 + VAT by SPEI, capped at MXN 588.12 per SPEI payment; it's deducted from the payment and Payments shows the net that reaches your bank. With Mercado Pago you pay your own Mercado Pago account's rates, and Cord adds nothing on top.",
            },
            {
                q: "What if Cord Payments isn't available in my country?",
                a: 'You collect online through your own Mercado Pago account: you connect it in Settings › Payments and your client pays from the same quote or invoice link. Cord tells you which rail applies in your country before you start onboarding, not after an error.',
            },
            {
                q: 'What changes when I collect through Mercado Pago?',
                a: "Your client completes the payment in Mercado Pago's checkout and comes back to your link, and the money lands in your Mercado Pago account. It works for a quote's full payment, deposit, balance and installments, and for paying toward an invoice. What only exists with Cord Payments is SPEI with a CLABE per payment and monthly card retainers. If you issue a refund from Mercado Pago, Cord reads it and records it on the quote or invoice.",
            },
            {
                q: 'What does Cord Payments onboarding ask for?',
                a: "Your business details, the people who control it (each partner with 25% or more and whoever runs it, with their real role) and your payout account. What's requested comes from your country's requirements: in Spain, Germany or the United Kingdom, for example, you're not asked for a personal ID number that doesn't apply there. You can take the ID photo with your phone by scanning a QR code, and Cord strips its GPS location before sending it for verification.",
            },
            {
                q: 'When do I start receiving payouts?',
                a: 'As soon as your account is verified. While something is missing, Payments shows how many requirements are pending and the deadline, and payouts wait. Changing your payout frequency or bank account requires confirming your identity, because it decides where and how often your money goes out.',
            },
            {
                q: 'Can I refund a payment?',
                a: "Yes. With Cord Payments you refund all or part of a payment from Payments, and your identity is confirmed before it's sent. Only people with the Refunds permission can do it, and that permission is separate: not even the Admin role has it by default. With Mercado Pago, the refund is made in your Mercado Pago account and Cord records it automatically.",
            },
        ],
        cta: { titulo: 'Turn on payments before you send your next quote.', sub: 'Cord Payments or Mercado Pago, from Settings › Payments. Free to start.' },
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
        slug: 'workflows',
        nav: 'Cord Workflows',
        eyebrow: 'CORD WORKFLOWS',
        titulo: 'Follow-up on every sale, on autopilot.',
        sub: '"When this happens, do this" rules that take the next step for you: a task when the client opens the quote, a reminder before the invoice is due, a Slack message when the deposit lands. No code.',
        metaTitle: 'Cord Workflows: no-code sales and collections automation — Cord',
        metaDescription: 'Automate follow-up on quotes and invoices: 44 events or a fixed schedule trigger tasks, emails, WhatsApp, Slack, Teams and HubSpot notes, with conditions and waits.',
        plan: 'Starting on the Free plan: 1 active workflow on Free, 5 on Starter and no cap from Professional. Runs are unlimited',
        stats: [
            { valor: '44', countup: 44, label: 'Cord events that can start a workflow, plus a fixed schedule' },
            { valor: '11', countup: 11, label: 'actions: tasks, email, WhatsApp, Slack, Teams, HubSpot and more' },
            { valor: '9', countup: 9, label: 'ready-to-publish ideas, one per real use case' },
        ],
        blocks: [
            {
                eyebrow: 'WHEN THIS HAPPENS',
                titulo: 'A real event starts the flow, not a reminder in your calendar.',
                copy: 'A workflow watches your account. When the client opens a quote, a deposit arrives, an invoice falls due or a chargeback is opened, it runs on its own. It can also run at a fixed time —"every Monday at 9"— read in your business time zone, not the server\'s.',
                bullets: [
                    '44 events across quotes, payments, invoices, clients, products and tasks',
                    'A fixed schedule in your account time zone',
                    'Time signals: quote expiring, invoice due soon and invoice past due',
                ],
            },
            {
                eyebrow: 'DO THIS',
                titulo: 'Eleven actions, from a task to a HubSpot note.',
                copy: 'Create a task for the right person, email the team, write to the client with your brand or send them a WhatsApp with your approved template. Post to Slack or Teams, add a note in HubSpot or send the data to your own URL. On the document itself it only does what is bounded: expire an out-of-date quote, approve an internal request or void an invoice with no payments.',
                bullets: [
                    'Email and WhatsApp go to the document\'s client, never to a typed-in address',
                    'Slack, Microsoft Teams and HubSpot from the same editor',
                    'Event data sent to your own URL over HTTPS',
                ],
            },
            {
                eyebrow: 'CONDITIONS, WAITS AND LOOKUPS',
                titulo: 'Wait for the client to decide. And if they don\'t, follow up.',
                copy: 'Split the flow into two branches based on the event data, wait 1 to 30 days or until something happens with a deadline, and look up a figure from your account —overdue receivables, open pipeline, client balance— before deciding. Before publishing, test the draft against the latest real event: lookups run, actions don\'t.',
                bullets: [
                    '"If met / if not met" branches, no formulas',
                    'Conditional wait: until the client opens or approves, with a deadline',
                    'Test without publishing against the latest real event',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE QUOTE NOBODY OPENED',
                titulo: 'Follow-up stopped depending on someone remembering.',
                copy: 'The follow-up ladder waits two days for the client to open the quote. If they do, it creates the task to call them while it is fresh; if not, it writes to them for you.',
            },
            {
                eyebrow: 'THE INVOICE THAT WENT OVERDUE QUIETLY',
                titulo: 'Collections start before the due date, not a month after.',
                copy: 'A reminder to the client three days before, another on the due date and, if it is still unpaid, an alert to the owner with the balance already owed.',
            },
            {
                eyebrow: 'NOTHING IS A BLACK BOX',
                titulo: 'Every run says what it did, step by step.',
                copy: 'The history shows the status of every run and the result of every step. The health panel groups the last 30 days of failures by cause, not by message.',
            },
        ],
        faqs: [
            {
                q: 'Do I need to know how to code to use Cord Workflows?',
                a: 'No. The editor reads top to bottom in two blocks, "When this happens" and "Do this", and every step is picked from a list. Cord also ships 9 ready-to-use ideas —such as the quote follow-up ladder or the staged collection of an overdue invoice— that you can publish as they are or adapt.',
            },
            {
                q: 'What can start a workflow?',
                a: 'Any of Cord\'s 44 events —quotes sent, viewed, approved or paid; deposits and failed payments; invoices issued, due soon or past due; chargebacks, refunds and payouts; clients, products and tasks— or a fixed schedule such as "every Monday at 9" in your business time zone. Each workflow has exactly one trigger.',
            },
            {
                q: 'Can a workflow charge or issue invoices for me?',
                a: 'No. A workflow does not charge, does not issue invoices or CFDI, does not record payments and does not approve or reject a quote on your client\'s behalf: those decisions stay with a person or the client. What it does on your documents is bounded and explicit: write to the document\'s client, expire a quote that is past its validity, approve an internal approval request and void an invoice that has no payments yet.',
            },
            {
                q: 'How many workflows can I have on each plan?',
                a: 'The Free plan allows 1 active workflow, Starter 5 and from Professional there is no cap. Only active ones count: drafts and paused workflows take no slot. Runs are unlimited too; an active workflow runs every time its event happens.',
            },
            {
                q: 'What happens to runs in progress if I change a workflow?',
                a: 'They finish with the version they started with. What you edit is a draft, and what runs only changes when you press Publish; every new run takes a copy of the version published at that moment.',
            },
            {
                q: 'Can a workflow trigger itself forever?',
                a: 'No. A workflow is never triggered by the events it causes, and a chain of workflows triggering each other is cut after three levels.',
            },
            {
                q: 'Which tools does it connect to?',
                a: 'Actions post to Slack and Microsoft Teams, add notes in HubSpot and send WhatsApp messages with your WhatsApp Business account. To take Cord events to any other app there are Zapier, Make and n8n, or an action that sends the data to your own URL.',
            },
        ],
        cta: { titulo: 'Let the next step take itself.', sub: 'Publish your first workflow from one of the 9 ready ideas. Free to start.' },
    },
    {
        slug: 'finanzas',
        nav: 'Finance & cash flow',
        eyebrow: 'FINANCE AND CASH FLOW',
        titulo: 'Your next 90 days of cash, week by week.',
        sub: "Cord projects your cash flow from three separate sources (what you're already owed, what you'll likely close and your retainers) and dates every amount with each client's real payment history. No formulas to maintain and no mixing up certainty with probability.",
        metaTitle: '90-day cash flow forecast, DSO and concentration risk — Cord',
        metaDescription: 'A weekly 90-day cash flow forecast that keeps receivables, weighted pipeline and retainers apart, with DSO, concentration risk, MRR and profitability by client tier. From the Professional plan.',
        plan: 'Professional plan and above',
        stats: [
            { valor: '90', countup: 90, suffix: ' days', label: 'of forecast, split into 13 weeks' },
            { valor: '3', countup: 3, label: 'separate sources: receivables, weighted pipeline and retainers' },
            { valor: '4', countup: 4, label: 'health indicators on your home screen: DSO, concentration, discount given and expected income' },
        ],
        blocks: [
            {
                eyebrow: '90-DAY CASH FLOW',
                titulo: 'Three sources, never mixed.',
                copy: "The forecast keeps apart what you're already owed on approved quotes, what you'll likely close from your pipeline, and your retainers' monthly charges. Each source has its own color, week by week for 13 weeks, and the cumulative curve tells you how much will have come in by each date.",
                bullets: [
                    'Receivables, weighted pipeline and retainers, kept apart',
                    '13-week cash flow and a cumulative cash curve',
                    'Calculated as of today, with no formulas to build',
                ],
            },
            {
                eyebrow: 'REAL PROBABILITY',
                titulo: 'Each open quote weighs what that client usually closes.',
                copy: "A proposal to a client who approves seven out of ten isn't worth the same as one to a client who almost never closes. Cord weights each open quote by its client's historical close rate and places it on the calendar using how long that client takes to close and to pay. The client-weighted pipeline shows you who is carrying your coming weeks.",
                bullets: [
                    'Probability per client, from their actual wins',
                    'Expected date: their days to close plus their days to pay',
                    'Conservative assumptions for clients with no history',
                ],
            },
            {
                eyebrow: 'MRR AND PROFITABILITY',
                titulo: "What recurs, what's at risk and what your discounts leave you.",
                copy: 'The Finance report adds up the contracted MRR from your retainers and annualizes it, and sets apart the MRR at risk: retainers with a failed charge or scheduled to cancel. It also crosses each client tier with its discount, its close rate and what it actually buys from you.',
                bullets: [
                    'Contracted MRR and ARR',
                    'MRR at risk: failed charges and scheduled cancellations',
                    'Profitability by tier: discount, close rate and closed value',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE CONTRACT VERSUS REALITY',
                titulo: 'Your client signed Net 30 and pays on day 44. The forecast uses 44.',
                copy: "What you're already owed isn't projected to the contract date, but to the due date plus that client's actual average delay. If they have no payment history yet, your whole portfolio's average delay is used.",
            },
            {
                eyebrow: "THE RISK YOU CAN'T SEE IN THE BALANCE",
                titulo: 'If a single client holds half your pipeline, you see it on your home screen.',
                copy: "The pipeline health widget marks your average days to collect and your largest client's weight in green, amber or red. The cash flow report also measures how much of what you expect to collect in the next 30 days depends on that client.",
            },
            {
                eyebrow: 'NOTHING GETS LOST',
                titulo: "What doesn't land within 90 days doesn't disappear: it's shown separately.",
                copy: 'A quote that would close on day 120 or a retainer charge beyond the horizon lands in "Beyond horizon", with its amount and how many movements it covers. The 13 weeks plus that line add up exactly to everything that went into the forecast.',
            },
        ],
        faqs: [
            {
                q: 'Does the forecast use artificial intelligence?',
                a: "No. It's statistics on your own history: each client's actual close rate, days to close and days to pay. When a client has no history, Cord uses conservative assumptions (a 25% chance of closing, 50% if they already opened the quote, 14 days to close and 30 to pay) instead of making up their behavior.",
            },
            {
                q: 'Where do I see these numbers?',
                a: "In Reports › Cash flow · 90 days and Reports › Finance, calculated as of today, and on your home screen with the Pipeline health and Expected cash flow widgets. Each person arranges, hides or resizes their own widgets without moving anyone else's.",
            },
            {
                q: 'Who can see them?',
                a: "Anyone with the Reports permission; the owner always has it. The Rep role includes it by default, so if you'd rather keep leadership numbers to the right people, adjust it in Settings › Team & roles; inviting your team is available from Professional. The Collections and receivables report also requires the Collections permission.",
            },
            {
                q: 'What does each plan include?',
                a: 'The 90-day cash flow and the Finance report are available from Professional. On Starter you already get the pipeline forecast and discount given, and on Free your close rate, funnel, and top clients and products.',
            },
        ],
        cta: { titulo: "Decide with the cash that's coming, not the cash that's gone.", sub: 'The 90-day cash flow is on the Professional plan. Start free and upgrade when you need it.' },
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
