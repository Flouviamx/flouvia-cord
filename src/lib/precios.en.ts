// src/lib/precios.en.ts
// SOLO COPY en inglés. Los precios NO viven aquí.
//
// Hasta ago 2026 este archivo era un catálogo gemelo con su propia tabla de
// precios (0/12/30/70/150) que ninguna suscripción cobró jamás: el checkout usa
// los Price de Stripe, y la landing en inglés publicaba cifras inventadas. La
// tabla pública describe el contrato, nunca lo define (regla 18) — así que los
// importes se toman de `precios.ts`, que ahora los tiene por divisa.
import type { Plan, CompareGroup } from './precios';
import { PLANES, overageRow } from './precios';

const precioDe = (id: Plan['id']): Plan['precio'] => {
    const plan = PLANES.find((p) => p.id === id);
    if (!plan) throw new Error(`precios.en.ts: no existe el plan ${id} en precios.ts`);
    return plan.precio;
};

export const PLANES_EN: Plan[] = [
    {
        id: 'free',
        nombre: 'Free',
        tagline: 'For your first clients. Every month.',
        precio: precioDe('free'),
        ctaLabel: 'Start for free',
        ctaHref: '/registro',
        feats: [
            '5 sends per month, renewed monthly',
            'Up to 5 active quotes at a time',
            '50 products and 50 clients',
            '3 AI generations per month',
            '10 commercial invoices per month',
            '"Powered by Cord" branding',
        ],
    },
    {
        id: 'starter',
        nombre: 'Starter',
        tagline: 'More proposals. Your brand up front.',
        precio: precioDe('starter'),
        ctaLabel: 'Start now',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui3vQBd5goOHQ1',
        feats: [
            'Unlimited sends; up to 50 active quotes',
            '500 products and clients',
            'Unlimited commercial invoices',
            '30 tax-compliant invoices + 20 AI generations/mo',
            'Your brand (no "Powered by")',
        ],
    },
    {
        id: 'pro',
        nombre: 'Professional',
        tagline: 'Your team, sales and collections together.',
        precio: precioDe('pro'),
        destacado: true,
        ribbon: 'FOR YOUR TEAM',
        ctaLabel: 'Start now',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui45gzUJYA3O2w',
        feats: [
            'Unlimited quotes',
            '5 users included',
            '200 tax invoices + 50 AI generations/mo',
            'Collections, recurring invoices and 90-day cash flow',
            'Live tracking and your own domain for links',
        ],
    },
    {
        id: 'scale',
        nombre: 'Scale',
        tagline: 'Automate follow-up and protect your margin.',
        precio: precioDe('scale'),
        ctaLabel: 'Start now',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui4AQicrCoCMUt',
        feats: [
            'Everything in Professional',
            '15 users included',
            '500 tax invoices + 500 AI generations/mo',
            'Autonomous AI collections and approval flows',
            'Enterprise SSO and AI agent governance',
        ],
    },
    {
        id: 'developer',
        nombre: 'Developer',
        tagline: 'Capacity and terms tailored to you.',
        precio: precioDe('developer'),
        custom: true,
        ctaLabel: 'Talk to sales',
        ctaHref: '/en/contacto/ventas',
        stripeProductId: 'prod_Ui4Iff1aimaK0y',
        feats: [
            'Everything in Scale',
            'Unlimited users and AI',
            '1,000 tax invoices + 50,000 API reqs/mo',
            'Overage at the lowest cost',
            'Custom terms and onboarding',
        ],
    },
];

export const COMPARATIVA_EN: CompareGroup[] = [
    {
        titulo: 'System Limits',
        rows: [
            { label: 'Active quotes', free: '5', starter: '50', pro: 'Unlimited', scale: 'Unlimited', developer: 'Unlimited' },
            { label: 'Product catalog', free: '50', starter: '500', pro: 'Unlimited', scale: 'Unlimited', developer: 'Unlimited' },
            { label: 'Client directory', free: '50', starter: '500', pro: 'Unlimited', scale: 'Unlimited', developer: 'Unlimited' },
            { label: 'System users', free: '1', starter: '1', pro: '5', scale: '15', developer: 'Unlimited' },
        ],
    },
    {
        titulo: 'Included Monthly Consumption',
        rows: [
            { label: 'Sent quotes', free: '5 / mo', starter: 'Unlimited', pro: 'Unlimited', scale: 'Unlimited', developer: 'Unlimited' },
            { label: 'AI quote generation', free: '3 / mo', starter: '20 / mo', pro: '50 / mo', scale: '500 / mo', developer: 'Unlimited' },
            { label: 'Commercial invoices', free: '10 / mo', starter: 'Unlimited', pro: 'Unlimited', scale: 'Unlimited', developer: 'Unlimited', hint: 'In Mexico and Spain the commercial document is a pro forma.' },
            { label: 'Tax-compliant invoices', free: false, starter: '30 / mo', pro: '200 / mo', scale: '500 / mo', developer: '1,000 / mo', hint: 'CFDI 4.0 in Mexico; VERI*FACTU in Spain once activation is complete. In other markets Cord issues a commercial invoice and does not file with other tax authorities.' },
            { label: 'Public API calls', free: '100 / mo', starter: '1,000 / mo', pro: '5,000 / mo', scale: '10,000 / mo', developer: '50,000 / mo' },
        ],
    },
    {
        titulo: 'Quotes and Editor',
        rows: [
            { label: 'Editor with live gross margin', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Free line item (quote without a product)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Tiered price lists (Silver, Gold, Distributor)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'PDF templates (classic, minimal, detailed)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'PDF with your logo and brand color', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Duplicate quote', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Immutable version history', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Partial approval per line item', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Kanban pipeline (drag to advance)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Tasks and reminders (CRM)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Configurable taxes (VAT, excise, withholdings)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Customer Experience (public link)',
        rows: [
            { label: 'Public link + downloadable PDF', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: '"Your customer viewed the quote" alert', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Presence "viewing it right now"', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Approval with technical evidence (SHA-256)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Counteroffer and chat with the customer', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Line-item negotiation (threads)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Online card payment (Stripe)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Customizable portal (banner and welcome)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Artificial Intelligence',
        rows: [
            { label: 'Build a quote from text with AI', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Autonomous AI collections (negotiates installments)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'AI CFO (cash flow insight)', free: false, starter: false, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Tax and Multi-currency',
        rows: [
            { label: 'Integrated fiscal issuance', free: false, starter: true, pro: true, scale: true, developer: true, hint: 'CFDI 4.0 in Mexico with a configured issuer. VERI*FACTU in Spain requires activation and validation. No universal tax compliance promise.' },
            { label: 'Your own CSD (digital seal, Mexico)', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Exchange rate locked at quote time', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'CRM, Analytics and Closing',
        rows: [
            { label: 'Pipeline and funnel tracking', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Analytics: close rate and conversion', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Analytics: forecast and margin given', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Top customers and top products', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'CFO Dashboard (DSO, risk concentration)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Weighted customer ranking', free: false, starter: false, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Risk and Treasury',
        rows: [
            { label: 'Collections module (AR aging)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: '90-day cash flow forecast', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Approval flows (discount/amount/margin limits)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Silent margin auditor', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Automated late-payment interest', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Recurring invoices', free: false, starter: false, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Identity and Branding',
        rows: [
            { label: 'Bulk import (CSV)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Remove "Powered by Cord" branding', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Customize color and logo', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Your own domain for links (quotes.yourcompany.com)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Emails from your domain (SMTP)', free: false, starter: false, pro: false, scale: 'Coming soon', developer: 'Coming soon' },
            { label: 'Multi-currency (14 offered currencies)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Notifications and Integrations',
        rows: [
            { label: 'Transactional emails (sent, viewed, approved…)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Automated payment reminders', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Real-time notification center', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Slack integration', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Custom email sender and template', free: false, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Team, Roles and Security',
        rows: [
            { label: 'Roles and permissions per section', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Team invitations by email', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Organizations and workspace switching', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'SSO / SAML (enterprise)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Immutable audit log (DB trace)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Row Level Security (RLS) in the database', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Encryption in transit and at rest (TLS + AES-256)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Developers and Infrastructure',
        rows: [
            { label: 'Public REST API', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Included API keys', free: '2', starter: '5', pro: '20', scale: '50', developer: '200' },
            { label: 'Outbound webhooks (HMAC signature)', free: '1', starter: '3', pro: '10', scale: '25', developer: '100' },
            { label: 'Delivery log + retry (replay)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'MCP server (for AI agents)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'AI agent governance (outbound MCP)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Embeddable quoter (Cord Elements)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'SDKs (React, Vue, Framer, Webflow)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Overages (pay per use)',
        rows: [
            overageRow('usuario', 'Additional user'),
            overageRow('ia', 'Extra AI generation'),
            overageRow('timbrado', 'Extra tax invoice'),
            overageRow('api', 'Extra API (per 100 req)'),
        ],
    },
];

export const FAQ_PRECIOS_EN: { q: string; a: string }[] = [
    {
        q: 'Can I really start for free?',
        a: 'Yes. Free has no expiry date: it includes 5 quote sends each month, up to 5 active quotes at a time, 50 products and 50 clients. Share a link and download a PDF with your logo; “Powered by Cord” stays visible. No credit card required.',
    },
    {
        q: 'What counts as an "active quote"?',
        a: 'A quote that is still alive in your pipeline (draft, sent, viewed, or approved without closing). Closed, paid, or expired quotes do not consume your limit, so the plan goes further than it seems. On Free, on top of the 5 active quotes there is a cap of 5 SENT quotes per month — that one does reset every month, regardless of how many you close.',
    },
    {
        q: 'What happens if I exceed the included consumption?',
        a: 'Free has hard limits. From Starter, extra AI actions, tax invoices and API requests are billed at the published rates; commercial invoices have no cap on paid plans. Starter retains one user. On Professional and Scale each additional user is billed every month while active. You can review usage in the app.',
    },
    {
        q: 'Can I change plans anytime?',
        a: 'Anytime, with no contracts or penalties. You upgrade instantly (prorated) and downgrade at the end of your cycle. If you cancel, your data remains intact on the Free plan.',
    },
    {
        q: 'Do prices include tax?',
        a: 'Yes. What you see is what you pay, with nothing added at checkout. Businesses in Mexico are billed in Mexican pesos (MXN); Spain, Germany and France, in euros (EUR); other supported markets, in US dollars (USD). Existing subscriptions keep their billing currency.',
    },
    {
        q: 'How does e-invoicing work?',
        a: 'There are two kinds of invoice. Commercial invoices (pro formas in Mexico and Spain) are on every plan: 10 per month on Free and unlimited from Starter. Tax-compliant invoices start at Starter with 30 per month; Professional includes 200 and Scale 500. Today Cord issues CFDI 4.0 in Mexico, and VERI*FACTU in Spain requires completed activation. In other markets Cord issues the commercial invoice and does not file with other tax authorities. A pro forma does not replace a CFDI.',
    },
    {
        q: 'What happens after my 5 free sends?',
        a: 'New sends pause until the first day of the next month (UTC), when your allowance resets to 5. Wait for renewal or choose Starter for unlimited monthly sends. The active quote limit is separate: closing a quote frees a slot but does not replenish sends. Reaching the allowance does not start a paid subscription.',
    },
    {
        q: 'When should I pay for Cord?',
        a: 'Choose Starter for tax-compliant invoices where Cord supports them, unlimited sends or to remove “Powered by Cord”. Professional adds unlimited quotes, 5 included users, live tracking, collections, recurring invoices and a 90-day cash-flow view. Scale adds approvals, autonomous AI collections and SSO. Stay on Free as long as its limits fit your business.',
    },
    {
        q: 'Can I remove Cord branding and use my own domain?',
        a: 'You can remove “Powered by Cord” from Starter onwards, including Professional and Scale. Your logo and colors are available even on Free. Sending email from your domain (SMTP) is coming soon to Scale. From Professional you can serve your links from your own subdomain, such as quotes.yourcompany.com, set up in Settings › Domain.',
    },
    {
        q: 'Does Free limit how much money I can collect?',
        a: 'There is currently no monthly revenue threshold that requires a plan upgrade. Free limits sends, active quotes and other resources. Online payments have processing fees and require an eligible account in a Cord Payments market; a free subscription does not remove those fees.',
    },
    {
        q: 'Is the Developer plan for integrating Cord into my system?',
        a: "Exactly. Developer includes 50,000 API calls and 1,000 tax invoices per month, the cheapest overages, unlimited users and AI, and the embeddable quoter — the foundation for connecting Cord to your ERP, e-commerce, or client portal. It has no self-serve price: you sign up by talking to sales, so capacity and terms match your integration.",
    },
    {
        q: 'Do I need to be a Flouvia customer to sign up for a plan?',
        a: 'No. Cord is independent software: businesses in the 12 supported markets can sign up directly at cordhq.app and choose a plan, with no prior relationship with Flouvia or any other product required.',
    },
];
