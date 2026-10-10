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
        metaDescription: "Cord's collections agent writes to each overdue account with its real balance and payment link, can offer plans of 2 to 6 installments within your limits and waits for your approval before sending. From the Professional plan.",
        plan: 'AI collections agent and collections module (receivables, priorities and payment promises) from Professional',
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
                a: 'The agent is available from the Professional plan, like the collections module (receivables by age, priorities, payment promises and WhatsApp reminders). Each email it drafts uses one AI action from your plan: Professional includes 50 a month and Scale 500; anything beyond that is billed as overage.',
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
                a: "Yes. You refund all or part of a quote payment from Payments, and an invoice payment from that invoice's detail page, also when Mercado Pago collected it. Cord confirms your identity before it's sent, and tells you before you confirm what the method doesn't allow, such as returning only part of an ACH debit. Only people with the Refunds permission can do it, and that permission is separate: not even the Admin role has it by default. A quote payment collected with Mercado Pago is refunded in your Mercado Pago account and Cord records it automatically.",
            },
        ],
        cta: { titulo: 'Turn on payments before you send your next quote.', sub: 'Cord Payments or Mercado Pago, from Settings › Payments. Free to start.' },
    },
    {
        slug: 'facturacion',
        nav: 'Cord Invoicing',
        eyebrow: 'CORD INVOICING',
        titulo: 'An invoice that knows how much you are still owed.',
        sub: "Cord issues your invoices under your own numbering, sends them to your client with the PDF and a payment link, and tracks the balance until it reaches zero. In Mexico it stamps CFDI 4.0 with the SAT from the Starter plan; outside Mexico it issues a commercial document with your country's taxes.",
        metaTitle: 'Cord Invoicing: invoices with a payment link, reminders and CFDI 4.0 — Cord',
        metaDescription: 'Issue invoices under your own numbering, send them with a PDF and a payment link, and follow the balance with automatic reminders, credit notes and recurring invoices. CFDI 4.0 in Mexico from Starter; commercial documents from the Free plan.',
        plan: 'Commercial documents from the Free plan (10 a month; no cap from Starter). CFDI 4.0 in Mexico from Starter, with 30 tax invoices included each month. Recurring invoices from Professional.',
        stats: [
            { valor: '5', countup: 5, label: 'invoice statuses: draft, open, paid, void and uncollectible' },
            { valor: '6', countup: 6, label: 'reminders per open invoice: 7 days and 1 day before the due date, and 3, 7, 14 and 30 days after' },
            { valor: '12', countup: 12, label: 'countries where you invoice: CFDI 4.0 in Mexico and a commercial document in the other 11' },
        ],
        blocks: [
            {
                eyebrow: 'FROM DRAFT TO NUMBER',
                titulo: 'The invoice number is assigned when you issue, not when you type.',
                copy: "In Invoices you pick the client, add items from your catalog or as free lines, and save a draft that uses up no number and no stamp: if you throw it away, your numbering has no gaps. With Issue and send, Cord assigns the next number in your series, issues the document and emails your client the PDF as an attachment plus the invoice's link. If issuing fails, the invoice stays a draft and tells you what to fix.",
                bullets: [
                    'Drafts that use up no number and no stamp',
                    'Your own numbering series, set in Settings',
                    "An email to the client with the PDF attached and the invoice's link",
                ],
            },
            {
                eyebrow: 'THE INVOICE KNOWS WHERE IT STANDS',
                titulo: "Issued, sent, viewed, paid: you see it without asking anyone.",
                copy: "Every invoice shows its progress and its activity: when it went out, when your client opened it (only your client, not you checking the link) and every reminder and payment. Your client pays from their link; wires, cash or checks you record yourself, and they can't exceed the balance. While it stays open, Cord reminds your client of the due date before and after it, and never sends the same reminder twice.",
                bullets: [
                    'Invoice progress: issued, sent, viewed and paid',
                    'Reminders before and after the due date',
                    'Payments recorded by hand against the same balance',
                ],
            },
            {
                eyebrow: 'THE RIGHT DOCUMENT',
                titulo: "CFDI 4.0 where the SAT requires it. A commercial document where it doesn't.",
                copy: "In Mexico, from the Starter plan and with your digital seal certificate uploaded, Cord stamps CFDI 4.0 under your own RFC: UUID, XML and PDF, with VAT and withholdings broken down per item. On the Free plan you issue a pro forma, which does not replace a tax invoice. Outside Mexico the document is commercial (your numbering, your brand and the tax under your country's name: VAT, TVA, IGV or sales tax) and its footer states that it was not filed with any authority.",
                bullets: [
                    'CFDI 4.0 with your own CSD, from Starter',
                    'Pro forma on Free, labeled as such',
                    'Taxes broken down by rate on the PDF',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE SAME INVOICE EVERY MONTH',
                titulo: 'Thirty clients with the same monthly invoice are no longer thirty invoices to type.',
                copy: 'On an invoice you already issued, "Repeat monthly" makes it recurring: Cord issues a new one on the 1st of every month, with its own number and its amounts frozen, and sends it to your client with its link. You can pause it whenever you want, even after a downgrade. From the Professional plan.',
            },
            {
                eyebrow: 'FIX IT WITHOUT DELETING IT',
                titulo: "An invoice with a mistake isn't edited: it's voided or credited, and Cord knows which one applies.",
                copy: "With no payments applied, you void it; in Mexico, Cord sends the cancellation to the SAT with your certificate and only marks it void once the SAT confirms. With payments, it takes you to a credit note, full or partial, that can never add up to more than the original invoice.",
            },
            {
                eyebrow: 'FROM QUOTE TO INVOICE',
                titulo: "If the deal closed in Cord, the invoice isn't typed again.",
                copy: 'From an approved or paid quote, one button issues the invoice with the same client, the same line items and the same currency, and the two stay linked. In Mexico that button says Stamp CFDI 4.0; on the Free plan, Issue pro forma.',
            },
        ],
        faqs: [
            {
                q: "What document does Cord issue if my business isn't in Mexico?",
                a: "A commercial document with your numbering, your tax details and your country's name for the tax, in Cord's 11 countries outside Mexico. In the United States, sales tax rates are seeded from the state you declare in your tax profile, along with the exempt option. In Spain you issue a pro forma, numbered by series and year and with IRPF withholding where it applies: VERI*FACTU registration with the AEAT is not active in Cord yet, so no document is filed with the tax authority.",
            },
            {
                q: "What if my client doesn't accept the cancellation of a CFDI?",
                a: 'The invoice stays open until the SAT confirms the cancellation. Meanwhile, the detail shows where the request stands (awaiting recipient acceptance, being verified, rejected or expired), and Check cancellation status asks again without sending another request. If it is rejected or expires, the invoice keeps its status and you decide: try again or issue a credit note.',
            },
            {
                q: 'What does my client receive?',
                a: "An email in your business's name with the PDF attached and a button to the invoice's page. There they see the items, the taxes by rate, the payments already received and the balance; they can pay it in full or choose Pay another amount with the payment methods you have turned on, and download the PDF and, in Mexico, the XML. The same page tells them you can see when they opened it and whether it was paid.",
            },
            {
                q: 'When does my client get reminders?',
                a: "Seven days and one day before the due date, and 3, 7, 14 and 30 days after it, on every plan. Each reminder goes out only once, and they stop as soon as the invoice is paid, voided or marked uncollectible. For a different message or channel, build it with Cord Workflows; for someone to chase overdue accounts one by one, that's AI collections.",
            },
            {
                q: 'How many invoices can I issue each month?',
                a: "On Free, 10 commercial documents a month. From Starter, commercial documents have no cap and tax invoices are included: 30 a month on Starter, 200 on Professional and 500 on Scale; anything beyond that is billed as overage. Viewing and collecting the invoices you already issued is never blocked, whether you run out of quota or downgrade.",
            },
            {
                q: 'Can I invoice from my own system?',
                a: "Yes. Cord's API creates drafts, issues, sends, records payments, voids and issues credit notes, and webhooks tell you when an invoice is issued, sent, paid, fails to collect, becomes overdue, is voided or is marked uncollectible. With the MCP server, an AI assistant can look up your invoices and prepare drafts, without issuing them.",
            },
        ],
        cta: { titulo: 'Your next invoice can go out with its payment link.', sub: 'Commercial documents from the Free plan; CFDI 4.0 from Starter.' },
    },
    {
        slug: 'workflows',
        nav: 'Cord Workflows',
        eyebrow: 'CORD WORKFLOWS',
        titulo: 'Follow-up on every sale, on autopilot.',
        sub: '"When this happens, do this" rules that take the next step of every sale for you, without writing code. A task when the client opens the quote, an email if they have not opened it in two days, a Slack message when the deposit arrives.',
        metaTitle: 'Cord Workflows: automate sales and collections without code — Cord',
        metaDescription: 'Automate follow-up on quotes, payments and invoices: 44 events or a fixed schedule trigger tasks, emails, WhatsApp, Slack, Teams and HubSpot notes, with conditions, waits and lookups. From the Free plan.',
        plan: 'From the Free plan: 1 active workflow on Free, 5 on Starter and no cap from Professional. Runs have no cap; on Free, emails to the client count toward your 5 sends a month.',
        stats: [
            { valor: '44', countup: 44, label: 'Cord events that can start a workflow, plus a fixed schedule' },
            { valor: '11', countup: 11, label: 'actions: tasks, email, WhatsApp, Slack, Teams, HubSpot and more' },
            { valor: '9', countup: 9, label: 'ready-to-publish ideas, one per real use case' },
        ],
        blocks: [
            {
                eyebrow: 'WHEN THIS HAPPENS',
                titulo: 'A real event starts the flow, not a reminder in your calendar.',
                copy: "A workflow watches your account and runs on its own when the client opens a quote, a deposit arrives, an invoice gets paid or a dispute is opened. It can also run at a fixed time, every day, week or month, read in your business's time zone and not the server's.",
                bullets: [
                    '44 events across quotes, approvals, payments, invoices, clients, products and tasks',
                    'Daily, weekly or monthly schedule in your time zone',
                    'Time alerts: quote about to expire, invoice about to be due and invoice past due for days',
                ],
            },
            {
                eyebrow: 'DO THIS',
                titulo: 'Eleven actions, from a task to a note in HubSpot.',
                copy: 'Create a task for the team, email the owner or everyone, write to the client under your brand or send them a WhatsApp with your approved template. Post to Slack or Teams, add a note in HubSpot or send the data to your own URL. On documents it only does what is narrowly defined: expire an overdue quote, approve an internal request or void an invoice with no payments.',
                bullets: [
                    "Email and WhatsApp to the document's client, never to a typed-in address",
                    'Slack, Microsoft Teams and HubSpot from the same editor',
                    'Event data sent to your own URL over HTTPS',
                ],
            },
            {
                eyebrow: 'CONDITIONS, WAITS AND LOOKUPS',
                titulo: "Wait for the client to decide. And if they don't, follow up.",
                copy: "Split the flow into two branches with up to five conditions on the event data, including whether a value changed: the total of a quote that was resent or a client's payment terms. Wait 1 to 30 days, or until something happens with a deadline, and look up data from your account (overdue receivables, open pipeline, the client's balance) before deciding.",
                bullets: [
                    '"If it matches / if it doesn\'t" branches, no formulas',
                    'Conditional wait: until the client opens or approves, with a deadline',
                    'Change conditions, such as "the total changed"',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE QUOTE NOBODY OPENED',
                titulo: 'Two days unopened, an email. A week undecided, an alert for you.',
                copy: "The follow-up ladder waits for the client to open the quote: if they do, it creates the task to call them while it's warm; if they haven't opened it in two days, it writes to them for you, and if five days later there's still no decision, it alerts you with the balance that client already owes you.",
            },
            {
                eyebrow: 'THE DEPOSIT NOBODY SAW',
                titulo: 'Work starts when the deposit arrives, not when someone checks payments.',
                copy: 'When the client pays the deposit, the workflow creates the task to start the work the next day and tells the owner how much came in and how much is still due. If the payment is a balance or an installment, it does nothing.',
            },
            {
                eyebrow: 'NOTHING IS A BLACK BOX',
                titulo: 'You know what it will do before you publish it, and what it did afterwards.',
                copy: "Before publishing, you test the draft against the latest real event: lookups run, actions don't, and you see the exact text that would go out. Once published, every run shows the result of each step, a failed run is retried from there, and the health panel groups the last 30 days of failures by cause.",
            },
        ],
        faqs: [
            {
                q: 'Do I need to know how to code to use Cord Workflows?',
                a: 'No. The editor reads top to bottom in two blocks, "When this happens" and "Do this", and every step is picked from a list. Cord also includes 9 ready ideas (such as the quote follow-up ladder or the Monday collections summary) that you can publish as they are or adapt.',
            },
            {
                q: 'How do I make something happen three days before a due date?',
                a: 'With time alerts. Once a day, Cord checks your open quotes and invoices and, if a workflow is listening, emits "An invoice is about to be due" with the days left. You pick the exact day with a condition, such as "Days until due equals 3"; after the due date it works the same way with "An invoice has been past due for days". Invoices already get automatic reminders: a workflow is for a different message, another channel or an alert to your team.',
            },
            {
                q: 'Can a workflow charge or issue invoices for me?',
                a: "No. A workflow doesn't charge, doesn't issue invoices or CFDI, doesn't record payments and doesn't approve or reject a quote on your client's behalf: those decisions stay with a person or the client. What it does on your documents is narrow and explicit: write to the document's client, expire a quote past its validity, void an invoice that has no payments yet and approve an internal approval request, which requires the approvals included in the Scale plan.",
            },
            {
                q: 'How many workflows can I have on each plan?',
                a: 'The Free plan allows 1 active workflow, Starter 5 and from Professional there is no cap. Only active ones count: drafts and paused workflows take no slot. Runs have no cap; the only thing counted on Free is emails to the client, which count toward your 5 sends a month.',
            },
            {
                q: 'What happens to runs in progress if I change a workflow?',
                a: 'They finish with the version they started with. What you edit is a draft, and it only changes what runs when you press Publish; each new run takes a copy of the version published at that moment.',
            },
            {
                q: 'Can a workflow trigger itself endlessly?',
                a: 'No. A workflow is never triggered by the events it causes itself, and a chain of workflows triggering each other is cut off after three levels. Each event also says who caused it (the client, a team member, the API, an AI agent or another workflow), so you can ignore whatever did not come from your client.',
            },
            {
                q: 'What do I need to connect first?',
                a: "Tasks, emails and sending to your own URL work without connecting anything. Slack, Microsoft Teams, HubSpot and WhatsApp are connected once in Settings › Integrations; WhatsApp also needs a template approved by Meta and the client's phone number with its country code. To take Cord events to any other app, there are Zapier, Make and n8n.",
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
        eyebrow: 'TEAM, ROLES AND SECURITY',
        titulo: 'Your whole team in Cord, each person with the access they need.',
        sub: "You invite your team with per-section permissions, so whoever quotes doesn't have to touch your collections or your settings. With SSO, your team signs in with your company account, and each legal entity lives in its own organization.",
        metaTitle: 'Team, roles, permissions and SSO for your sales team — Cord',
        metaDescription: 'Invite your team with per-section permissions, require two-factor authentication and connect SSO with SAML 2.0 (Okta, Microsoft Entra, Google Workspace). Team from the Professional plan; SSO from Scale.',
        plan: 'Inviting your team and adjusting permissions, from Professional (5 users included; 15 on Scale; additional users at an extra cost). SSO with SAML from Scale. Creating another organization does not depend on your plan: each one has its own.',
        stats: [
            { valor: '10', countup: 10, label: 'per-section permissions, from Quotes to Refunds' },
            { valor: '3', countup: 3, label: 'starting roles (Admin, Rep and Read only) that you fine-tune section by section' },
            { valor: '1', countup: 1, suffix: ' h', label: 'to switch off required SSO if your identity provider goes down' },
        ],
        blocks: [
            {
                eyebrow: 'PER-SECTION PERMISSIONS',
                titulo: "Whoever quotes doesn't need to see your collections.",
                copy: "Each person has ten permissions you turn on or off: Quotes, Approvals, Collections, Clients, Products, Reports, Settings, Payment settings, Refunds and Team. You start from a role (Admin, Rep or Read only) and fine-tune it. The permission decides the screen and the operation too: without Collections, a rep doesn't see Invoices or Payments, and can't operate them some other way.",
                bullets: [
                    'Admin, Rep and Read only as a starting point',
                    'Ten permissions you adjust person by person',
                    'The account owner always keeps full access',
                ],
            },
            {
                eyebrow: 'SEVERAL COMPANIES',
                titulo: 'Each legal entity, in its own organization.',
                copy: "If you run several brands or legal entities, each one lives in its own Cord organization, with its own country, currency, taxes, tax details, numbering and team. You switch between them from the selector without signing in again, and you can group new ones under the main one to keep them close. Each person only gets into the organizations you invited them to, with the role you gave them in each.",
                bullets: [
                    'Its own country, currency, taxes and tax details in each one',
                    'Switch organizations from the selector',
                    'A different role per organization for the same person',
                ],
            },
            {
                eyebrow: 'SSO WITH SAML 2.0',
                titulo: 'Your team signs in with your company account.',
                copy: "You connect Okta, Microsoft Entra or Google Workspace by pasting your provider's metadata XML, and Cord takes the sign-in URL and the certificate from it. Only emails from a domain you verified through DNS sign in through that connection, accounts can be created on first sign-in, and each person's role can come from an attribute your provider sends, such as their group. If you require SSO, password, Google, Apple and passkeys stop working for everyone except the owner. From the Scale plan.",
                bullets: [
                    'Domains verified with a DNS record',
                    'Role assigned from the group your provider sends',
                    'Required SSO, with the owner as the fallback',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'THE DAY SOMEONE LEAVES',
                titulo: 'You revoke access and that person loses the organization right then.',
                copy: "In Team & roles, Revoke access removes them from the organization: on their next click, it's gone. It is recorded in the audit log with date and IP, and if you require SSO, without their account in your identity provider they can't get back in.",
            },
            {
                eyebrow: 'A LEAKED PASSWORD',
                titulo: "A leaked password isn't enough to get into your account.",
                copy: 'In Settings › Security you require two-factor authentication for your whole team, end sessions after one to twenty-four hours of inactivity and limit invitations to your company domains. Each person can sign in with a passkey, and sees and closes their open sessions from their account.',
            },
            {
                eyebrow: 'EVERY REP, WITH THEIR NUMBERS',
                titulo: 'You know who quotes, who closes and who collects, without asking for a report.',
                copy: 'In Reports › Team, Cord ranks every rep by quotes, close rate, amount closed and collected, average ticket and days to close. Each quote counts for whoever created it, and anyone with the Reports permission can see it.',
            },
        ],
        faqs: [
            {
                q: "Can a rep see another rep's clients?",
                a: "Yes. Permissions are per section, not per book of business: the whole team sees the organization's quotes and client directory, and permissions decide who can create, edit or approve them. What does disappear without its permission is Invoices, Payments, Collections and Reports. If you need to fully separate two books of business (two business units, for example), each one can be its own organization.",
            },
            {
                q: 'Which plan do I need to work as a team?',
                a: 'Free and Starter are single-user. From Professional you invite your team with 5 users included, Scale includes 15, and each additional user is billed separately; the price is on the plans page. The audit log is available from Professional and SSO from Scale. Requiring two-factor authentication, the inactivity timeout and invitation domains are on every plan.',
            },
            {
                q: 'Is each organization paid for separately?',
                a: "Yes. Creating another organization doesn't depend on your plan, and each one has its own: you can keep your main company on Professional and a new brand on Free. Their data doesn't mix (clients, catalog, invoices and team belong to each one), and Cord does not add several organizations up into a consolidated report.",
            },
            {
                q: 'How is SSO different from signing in with Google?',
                a: 'Anyone can sign in to Cord with Google, Apple, a password or a passkey. SSO adds that your company decides who gets in: only emails from your verified domains, with the role your identity provider says and, if you require it, with no other way in for your team.',
            },
            {
                q: 'What if my identity provider goes down?',
                a: 'The account owner always keeps their password as a fallback, even when SSO is required. With it, they can switch off the requirement for one hour so the team can sign in some other way; when the hour is up, SSO is required again on its own.',
            },
            {
                q: 'What gets recorded in the audit log?',
                a: "Invitations, permission changes and revoked access; SSO and integration connections; invoice issuing, sending and payments; and changes to the organization's settings, each with its date and the IP it came from. Anyone with the Settings permission can review it, from the Professional plan.",
            },
        ],
        cta: { titulo: 'Invite your team without handing over the keys to everything.', sub: 'Team and permissions from the Professional plan; SSO from Scale.' },
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
