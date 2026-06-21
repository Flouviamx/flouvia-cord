// src/lib/solucion.en.ts
import type { Solution } from './solucion';

export const SOLUCIONES_EN: Solution[] = [
    {
        slug: 'distribuidoras',
        nav: 'Distributors & Wholesalers',
        eyebrow: 'DISTRIBUTORS AND WHOLESALERS',
        titulo: 'Every client,<br/>their own price.',
        sub: 'You sell the same thing to 200 clients at 200 different prices. Cord saves the negotiated price and terms for each client and applies them automatically — so anyone on your team can quote fast without giving away margin or breaking agreements.',
        metaTitle: 'Quoting software for distributors and wholesalers in Mexico — Cord by Flouvia',
        metaDescription: 'Cord allows distributors and wholesalers in Mexico to manage price lists per client, Net 30/60 terms, credit limits, and automatic CFDI — all in one platform.',
        paraQuien: 'Cord for distributors is designed for businesses with 10 to 200 active clients, managing differentiated prices per client and processing between 20 and 500 quotes a month. If you sell the same catalog at different prices based on volume and relationship, and today you keep those agreements in Excel or in your reps\' heads, Cord is for you.',
        dolor: 'The special price lives in one person\'s head and in outdated Excel sheets.',
        stats: [
            { valor: '200+', label: 'clients with their own price, without loose spreadsheets' },
            { valor: '−12%', label: 'controlled discount, not improvised' },
            { valor: '4', countup: 4, suffix: ' min', label: 'to build a complete quote' },
        ],
        blocks: [
            {
                eyebrow: 'PRICE PER CLIENT',
                titulo: 'The right price<br/>comes out on its own.',
                copy: 'In distribution, the list price is just the starting point: every client has their own based on volume and relationship. Cord records the negotiated price of each line and shows you the discount applied, so your team quotes the same conditions without having to ask.',
                bullets: [
                    'Negotiated price per line, with the discount % visible',
                    'The list price is recorded — always know how much you gave up',
                    'Free lines for freight, concepts, or monthly promos',
                ],
            },
            {
                eyebrow: 'CENTRAL CATALOG',
                titulo: 'A single source<br/>of truth.',
                copy: 'Load your catalog once — with SKU, unit, and list price — and add it to any quote with one click. No more price lists in five different versions circulating on WhatsApp.',
                bullets: [
                    'Instant search by name or SKU',
                    'Import your full catalog via CSV in minutes',
                    'Activate or pause products without losing their history',
                ],
            },
            {
                eyebrow: 'TERMS AND CREDIT',
                titulo: 'Every client,<br/>their conditions.',
                copy: 'Save the default terms for each client (Cash, Net 30, Net 60) and their credit limit. When quoting them, the conditions apply themselves and you know how much credit room they have left before approving.',
                bullets: [
                    'Default payment terms per client',
                    'Credit limit in MXN, visible before closing',
                    'Complete history of each account in one place',
                ],
            },
        ],
        resultado: {
            cliente: 'Distribuidora El Zarco · Mexico City Wholesale Market',
            metricas: [
                { valor: '−67%', label: 'in order processing time' },
                { valor: '+25%', label: 'in average ticket size' },
                { valor: '100%', label: 'of sales orders automated' },
            ],
            nota: 'Distribuidora El Zarco, a wholesaler in the Mexico City Wholesale Market, adopted Cord to manage their differentiated pricing per client and automate their quoting workflow.',
        },
        faqs: [
            {
                q: 'How does Cord manage differentiated pricing per client in a distributorship?',
                a: 'Cord allows you to assign a negotiated price to each quote line, independent of the catalog list price. When a rep quotes a specific client, the system automatically applies the agreed prices and discounts for that client, showing the discount percentage applied per line. The list price is recorded as a reference to control the given margin.',
            },
            {
                q: 'Does Cord work for distributors that handle hundreds of SKUs?',
                a: 'Yes. Cord\'s catalog accepts bulk import via CSV, instant search by name or SKU, and custom units (pieces, boxes, tons, liters, whatever fits the product). Products are activated or paused without deleting their price history. There is no product limit on paid plans.',
            },
            {
                q: 'Does Cord work for distributors in wholesale markets in Mexico?',
                a: 'Yes. Cord is specifically designed for wholesale distributors in Mexico. A documented use case is Distribuidora El Zarco in the Mexico City Wholesale Market, where Cord reduced order processing time by 67%, increased average ticket size by 25%, and automated 100% of sales orders.',
            },
            {
                q: 'What happens if a distributor\'s client asks for a price not in the catalog?',
                a: 'Cord includes free lines in the quote editor, allowing you to add custom concepts outside the catalog with their description, quantity, unit, and price. They are used for freight, maneuvers, special discounts, or any non-standard concept.',
            },
        ],
        interlink: { href: '/producto/clientes-credito', label: 'clients and credit' },
        cta: { titulo: 'Quote each client at their price.', sub: 'Free up to 5 active quotes. No credit card required.' },
    },
    {
        slug: 'construccion',
        nav: 'Construction & Materials',
        eyebrow: 'CONSTRUCTION AND MATERIALS',
        titulo: 'Volume, site<br/>and credit, under control.',
        sub: 'Quotes for hundreds of thousands of pesos, site deliveries, and clients asking for Net 60: the daily life of a materials supplier. Cord puts a folio, validity, and credit limit to each deal — and notifies you the moment they approve it.',
        metaTitle: 'Construction materials quotes with CFDI and credit — Cord by Flouvia',
        metaDescription: 'Cord allows hardware stores, materials suppliers, and construction providers to quote large volumes without errors, control Net 60 credit per site, and stamp CFDI 4.0 automatically at closing.',
        paraQuien: 'Cord for construction is designed for hardware stores, materials suppliers, and site providers in Mexico that build high-value quotes with many lines, handle Net 30 or Net 60 credit per site, and need to stamp CFDI 4.0 at closing. If you sell cement, rebar, aggregates, or finishes by volume and give credit to construction companies, Cord is for you.',
        dolor: 'Huge quotes built by hand, with the risk of a typo eating the margin.',
        stats: [
            { valor: '$196,469', label: 'quoted and approved on the same day' },
            { valor: '100', countup: 100, suffix: '%', label: 'of totals calculated without typing errors' },
            { valor: 'Net 60', label: 'credit per client, with controlled limit' },
        ],
        blocks: [
            {
                eyebrow: 'LARGE QUOTES',
                titulo: 'Hundreds of lines,<br/>zero typos.',
                copy: 'Cement by the ton, rebar by the piece, block by the thousand, sand by m³. Build quotes of any size with real units and watch the subtotal, tax, and total recalculate instantly, with correct rounding and tabular numbers.',
                bullets: [
                    'Real units: bags, m³, pieces, rolls, tons',
                    'Configurable 16% tax and always squared totals',
                    'Consecutive folio with your prefix (COT-0148, COT-0149…)',
                ],
            },
            {
                eyebrow: 'SITE CREDIT',
                titulo: 'Say yes with confidence<br/>(and no, on time).',
                copy: 'In materials, credit is the sales tool. Assign a limit per client and let the system monitor it: before sending a Net 60 quote you know how much is available. The "we slipped up" ceases to exist.',
                bullets: [
                    'Credit limit in MXN per client',
                    'Net 30 / Net 60 terms with clear due dates',
                    'Exposure visible before approving each deal',
                ],
            },
            {
                eyebrow: 'FROM YES TO CFDI',
                titulo: 'Approved on site,<br/>invoiced instantly.',
                copy: 'The client opens the link from the construction site, approves from their phone, and you find out right away. When it closes, the CFDI 4.0 invoice comes out with the same data — no retyping in another portal — and stays linked to its quote.',
                bullets: [
                    'Public link that gets approved from any mobile',
                    'Immediate notice when the client opens and approves it',
                    'Automated CFDI 4.0 on close (Starter plan and up)',
                ],
            },
        ],
        faqs: [
            {
                q: 'Does Cord work for hardware stores and construction material suppliers in Mexico?',
                a: 'Yes. Cord is designed to handle the specific needs of the construction sector: high-value quotes with many lines, real units like bags, m³, pieces, and tons, Net 30 or Net 60 credit per site or construction company, and automated CFDI 4.0 upon closing. The editor recalculates subtotal and tax in real time to avoid typing errors in large quotes.',
            },
            {
                q: 'How does Cord control client credit in the construction sector?',
                a: 'Cord allows assigning a credit limit in pesos to each construction company or site. Before sending a quote on credit, the seller sees how much available credit the client has left against the assigned limit. Net 30 or Net 60 terms are configured per client and applied automatically to each quote.',
            },
            {
                q: 'Can a hardware store\'s client approve the quote from the construction site?',
                a: 'Yes. Cord generates a public link that the client can open from any cell phone without installing anything or creating an account. They can review materials, quantities, and prices from the site and approve with a button. The supplier receives an immediate notification of the approval.',
            },
            {
                q: 'Does Cord generate the CFDI automatically for construction material companies?',
                a: 'Yes. Starting from the Starter plan, Cord stamps the CFDI 4.0 automatically when an approved quote is closed. The receipt\'s data is taken directly from the quote: products, quantities, negotiated prices, and the client\'s RFC. No need to retype in any external invoicing portal.',
            },
        ],
        interlink: { href: '/producto/cfdi', label: 'CFDI 4.0 e-invoicing' },
        cta: { titulo: 'Quote the whole site<br/>in minutes.', sub: 'Start for free and upload your materials catalog today.' },
    },
    {
        slug: 'manufactura',
        nav: 'Manufacturing',
        eyebrow: 'MANUFACTURING',
        titulo: 'Quote spec,<br/>batch, and delivery.',
        sub: 'In manufacturing, every quote is a small project: specifications, minimum quantities, delivery times. With free lines and quote notes, Cord documents the entire agreement — and the timeline saves who approved what and when.',
        metaTitle: 'Manufacturing quotes with technical specification and CFDI in Mexico — Cord by Flouvia',
        metaDescription: 'Cord allows manufacturing companies in Mexico to quote batches with technical specs, MOQ, delivery times, and condition notes. The client approves via link and CFDI 4.0 is stamped automatically.',
        paraQuien: 'Cord for manufacturing is designed for companies that quote custom projects to other companies in Mexico — CNC machining, laser cutting, assembly, plastic injection, metalworking — with technical specifications, minimum order quantities, and delivery times.',
        dolor: 'The technical agreement gets lost in emails and no one remembers what price the previous batch was closed at.',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'of the agreement documented in one place' },
            { valor: '0', countup: 0, label: 'double entries between quote and invoice' },
            { valor: '3', countup: 3, label: 'payment terms depending on the client' },
        ],
        blocks: [
            {
                eyebrow: 'SPECIFICATION',
                titulo: 'The technical detail,<br/>part of the quote.',
                copy: 'Not everything fits in a catalog. Free lines let you quote custom concepts — material, finish, tolerance, minimum quantity — with their price and full description, so the client approves exactly what was agreed.',
                bullets: [
                    'Free lines for concepts outside the catalog',
                    'Long descriptions with the batch specification',
                    'Quote notes: MOQ, delivery time, conditions',
                ],
            },
            {
                eyebrow: 'HISTORY',
                titulo: 'At what price did you close<br/>the last batch.',
                copy: 'Each client accumulates their history: what they asked for, at what price, when, and who approved it. The next time they ask for a run, you have the exact reference at hand — without digging through emails from six months ago.',
                bullets: [
                    'Quote history per client',
                    'Negotiated price recorded line by line',
                    'Timeline with the complete chronology of each deal',
                ],
            },
            {
                eyebrow: 'FORMAL CLOSING',
                titulo: 'Approval with evidence,<br/>invoice without retyping.',
                copy: 'The client approves on the link and it\'s recorded who and when — evidence of the agreement. When closing, the CFDI 4.0 is built with the quote data: quantities, prices, and RFC are already there, stamping is one click.',
                bullets: [
                    'Approval recorded on the timeline as evidence',
                    'CFDI 4.0 with the exact quote data',
                    'UUID, XML, and PDF available instantly (Starter plan and up)',
                ],
            },
        ],
        faqs: [
            {
                q: 'Does Cord allow quoting batches with technical specifications in manufacturing?',
                a: 'Yes. Cord includes free lines in the quote editor where you can enter the full technical specification of each concept: material, finish, tolerance, minimum order quantity (MOQ), and any relevant condition. The quote notes field allows adding general batch conditions like delivery times, advance payment percentage, and blueprint references.',
            },
            {
                q: 'Does Cord save the price history of previous batches in manufacturing?',
                a: 'Yes. Every client in Cord accumulates the complete quote history: what was quoted, at what price, with what specification, and who approved. When the same client asks for a run again, the seller can review the price and conditions of the previous batch directly in the client\'s profile, without searching through emails or files.',
            },
            {
                q: 'Does Cord work for machining, laser cutting, or assembly companies in Mexico?',
                a: 'Yes. Cord is designed for any manufacturing company quoting custom projects to other companies in Mexico: CNC machining, laser cutting, assembly, plastic injection, metalworking, and the like. Free lines allow describing each process with its specification and unit price, and the system generates the CFDI 4.0 automatically upon closing.',
            },
            {
                q: 'How is the client\'s approval recorded on a manufacturing quote?',
                a: 'When the client approves the quote through Cord\'s public link, the system records in the timeline who approved, from what device, and at what time. This record serves as evidence of the commercial agreement. The quote\'s status automatically changes to "approved" and becomes available to generate the CFDI.',
            },
        ],
        interlink: { href: '/producto/seguimiento', label: 'live tracking' },
        cta: { titulo: 'Document the agreement,<br/>don\'t chase it.', sub: 'Start for free — your first custom quote today.' },
    },
    {
        slug: 'servicios',
        nav: 'Professional Services',
        eyebrow: 'PROFESSIONAL SERVICES',
        titulo: 'Proposals as serious<br/>as your work.',
        sub: 'A generic PDF proposal competes poorly against an elegant page with your brand, clear amounts, and an approve button. Send a link that closes for you — and find out the exact moment your prospect opens it.',
        metaTitle: 'B2B proposals with link approval for professional services in Mexico — Cord by Flouvia',
        metaDescription: 'Cord allows firms, consultancies, and agencies in Mexico to send proposals with their brand, know the exact moment the prospect opens them, receive approval with a button, and collect the advance online.',
        paraQuien: 'Cord for professional services is designed for firms, consultancies, agencies, and practices that send proposals to B2B clients in Mexico and need to know if they were read, close them with a button, and collect the advance. If your sale depends on a well-presented proposal and timely follow-up, Cord is for you.',
        dolor: 'The perfect proposal dies in the inbox and you never know if they opened it.',
        stats: [
            { valor: '1', countup: 1, suffix: ' click', label: 'between your proposal and the "yes"' },
            { valor: '3', countup: 3, suffix: ' min', label: 'it takes to alert you they opened it' },
            { valor: '2', countup: 2, suffix: '×', label: 'more closes when you follow up on time' },
        ],
        blocks: [
            {
                eyebrow: 'YOUR BRAND',
                titulo: 'The proposal is signed by<br/>your firm.',
                copy: 'Your logo, your name, and your color preside over the proposal. On paid plans, the "Powered by Cord" disappears and the experience is 100% yours: your prospect sees a serious firm, with serious processes, before reading the first number.',
                bullets: [
                    'Configurable brand logo and color',
                    'Page and PDF with careful typography, prominent amounts',
                    'Clear validity and terms in every proposal',
                ],
            },
            {
                eyebrow: 'THE SIGNAL THAT MATTERS',
                titulo: 'You know the moment<br/>they read it.',
                copy: 'Interest cools quickly. Cord alerts you as soon as your prospect opens the proposal and how many times they\'ve seen it — so you call when you\'re top-of-mind, not two weeks later.',
                bullets: [
                    'Instant alert when they open your proposal',
                    'Open count (Viewed it 3 times? They\'re deciding)',
                    'The status changes alone: sent → viewed → approved',
                ],
            },
            {
                eyebrow: 'ZERO FRICTION',
                titulo: 'Approving is a button,<br/>not a phone call.',
                copy: 'Your prospect opens the link anywhere, reviews the scope, and approves right there — no creating an account, no downloading anything. If you handle online payments, they can pay the advance at that moment; if not, it\'s recorded under their terms.',
                bullets: [
                    'One-click approval, no registration or friction',
                    'Works on WhatsApp, email, or wherever you share it',
                    'Optional online payment with Stripe (Professional plan)',
                ],
            },
        ],
        faqs: [
            {
                q: 'Does Cord work for sending commercial proposals to B2B clients in Mexico?',
                a: 'Yes. Cord generates a proposal link with the business\'s brand (logo, colors, tax details) that the prospect can open from any device. The proposal shows the services, prices, and payment terms, and includes buttons to approve, reject, or ask questions. The prospect is not required to create an account or download anything.',
            },
            {
                q: 'How do I know if my prospect has seen the proposal I sent?',
                a: 'Cord sends a real-time notification as soon as the prospect opens the proposal link. The dashboard shows the exact time of each opening and the number of times it was opened. If the prospect viewed it multiple times, it usually indicates they are evaluating the decision — the ideal time to follow up.',
            },
            {
                q: 'Does Cord allow collecting an advance when a service proposal is approved?',
                a: 'Yes. With the Professional plan and up, Cord allows activating online payments with Stripe. When the client approves the proposal, they can pay the advance directly from the same page, without the need for a separate transfer or additional follow-up.',
            },
            {
                q: 'Does Cord generate CFDIs for professional service companies in Mexico?',
                a: 'Yes. From the Starter plan, Cord stamps the CFDI 4.0 automatically when the client approves the proposal. The receipt\'s data (service description, price, client\'s RFC) is taken from the approved proposal. Available for any company with a Mexico RFC that issues CFDI for services.',
            },
        ],
        interlink: { href: '/producto/link-publico', label: 'the public approval link' },
        cta: { titulo: 'The next proposal you send<br/>will have an approve button.', sub: 'See a sample proposal or create your own for free.' },
    },
];

export const findSolucionEn = (slug: string) => SOLUCIONES_EN.find((s) => s.slug === slug);
