// src/lib/precios.en.ts
import type { Plan, CompareGroup } from './precios';

export const PLANES_EN: Plan[] = [
    {
        id: 'free',
        nombre: 'Free',
        tagline: 'To test the system.',
        precioMensual: 0,
        ctaLabel: 'Start for free',
        ctaHref: '/registro',
        feats: [
            '5 active quotes',
            '50 products and 50 clients',
            '3 AI generations per month',
            'Public link + PDF',
            '"Powered by Cord" branding',
        ],
    },
    {
        id: 'starter',
        nombre: 'Starter',
        tagline: 'For solo sellers.',
        precioMensual: 240,
        ctaLabel: 'Start now',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui3vQBd5goOHQ1',
        feats: [
            '50 active quotes',
            '500 products and clients',
            '20 AI generations + 3 e-invoices/mo',
            'Your brand (no "Powered by")',
            'CSV import',
        ],
    },
    {
        id: 'pro',
        nombre: 'Professional',
        tagline: 'For teams that sell seriously.',
        precioMensual: 590,
        destacado: true,
        ribbon: 'MOST POPULAR',
        ctaLabel: 'Start now',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui45gzUJYA3O2w',
        feats: [
            'Unlimited quotes',
            'Up to 5 users',
            '50 AI generations + 20 e-invoices/mo',
            'Live tracking and analytics',
            'Immutable audit log',
        ],
    },
    {
        id: 'scale',
        nombre: 'Scale',
        tagline: 'For operations with control.',
        precioMensual: 1390,
        ctaLabel: 'Start now',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui4AQicrCoCMUt',
        feats: [
            'Everything in Professional',
            'Up to 15 users',
            '500 AI generations + 100 e-invoices/mo',
            'Approval flows and collections',
            'Emails from your domain (SMTP)',
        ],
    },
    {
        id: 'developer',
        nombre: 'Developer',
        tagline: 'To integrate into your stack.',
        precioMensual: 2990,
        ctaLabel: 'Start now',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui4Iff1aimaK0y',
        feats: [
            'Everything in Scale',
            'Unlimited users and AI',
            '1,000 e-invoices + 50,000 API reqs/mo',
            'Overage at the lowest cost',
            'Infrastructure to integrate',
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
            { label: 'AI quote generation', free: '3 / mo', starter: '20 / mo', pro: '50 / mo', scale: '500 / mo', developer: 'Unlimited' },
            { label: 'E-invoicing CFDI 4.0 (SAT)', free: false, starter: '3 / mo', pro: '20 / mo', scale: '100 / mo', developer: '1,000 / mo' },
            { label: 'Public API calls', free: '100 / mo', starter: '1,000 / mo', pro: '5,000 / mo', scale: '10,000 / mo', developer: '50,000 / mo' },
        ],
    },
    {
        titulo: 'Identity and Data',
        rows: [
            { label: 'Bulk import (CSV)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Remove "Powered by Cord" branding', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Emails from your domain (SMTP)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Multi-currency (MXN, USD, EUR)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'CRM, Analytics and Closing',
        rows: [
            { label: 'Presence "viewing it right now"', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Analytics: close rate and conversion', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Analytics: forecast and margin given', free: false, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Risk and Treasury',
        rows: [
            { label: 'Automated E-invoicing CFDI 4.0', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Approval flows (discount/amount limits)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Collections module (AR aging)', free: false, starter: false, pro: false, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Infrastructure and Developers',
        rows: [
            { label: 'Zapier / Webhooks integration', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Embeddable quoter (Cord Elements)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Immutable audit log (DB trace)', free: false, starter: false, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Overages (pay per use)',
        rows: [
            { label: 'Additional user', free: 'Hard limit', starter: 'Hard limit', pro: '$300 / u', scale: '$300 / u', developer: '$200 / u' },
            { label: 'Extra AI generation', free: 'Hard limit', starter: '$4.00 / use', pro: '$3.50 / use', scale: '$3.00 / use', developer: '$2.50 / use' },
            { label: 'Extra E-invoice (CFDI)', free: false, starter: '$3.00 / file', pro: '$3.00 / file', scale: '$2.00 / file', developer: '$1.50 / file' },
            { label: 'Extra API (per 100 req)', free: 'Hard limit', starter: '$0.03 USD', pro: '$0.03 USD', scale: '$0.02 USD', developer: '$0.02 USD' },
        ],
    },
];

export const FAQ_PRECIOS_EN: { q: string; a: string }[] = [
    {
        q: 'Can I really start for free?',
        a: "Yes. The Free plan is forever: up to 5 active quotes, 50 products, 50 clients, public link, and PDF. We don't ask for a credit card to sign up.",
    },
    {
        q: 'What counts as an "active quote"?',
        a: 'A quote that is still alive in your pipeline (draft, sent, viewed, or approved without closing). Closed, paid, or expired quotes do not consume your limit, so the plan goes further than it seems.',
    },
    {
        q: 'What happens if I exceed the included consumption?',
        a: 'It depends on the plan. In Free and Starter, some limits are hard caps (they pause until the next cycle or until you upgrade). From Professional onwards, overages are charged per use at the end of the month via Stripe: AI generations, e-invoices, users, and API calls. No surprises: you can see your consumption in real time inside the app.',
    },
    {
        q: 'Can I change plans anytime?',
        a: 'Anytime, with no contracts or penalties. You upgrade instantly (prorated) and downgrade at the end of your cycle. If you cancel, your data remains intact on the Free plan.',
    },
    {
        q: 'Do prices include tax (IVA)?',
        a: 'Yes. All prices are in Mexican Pesos (MXN) and include IVA. What you see is what you pay.',
    },
    {
        q: 'How does CFDI 4.0 e-invoicing work?',
        a: 'From the Starter plan, you connect your Digital Seal Certificate (CSD) once, and when you close a quote, Cord stamps the CFDI 4.0 with the SAT using the exact same data. No retyping in another portal.',
    },
    {
        q: 'Can I test Cord without paying?',
        a: "Yes. The Free plan is forever: 5 active quotes, no credit card required. When you're ready, you can upgrade to a paid plan. You can change or cancel anytime.",
    },
    {
        q: 'Is the Developer plan for integrating Cord into my system?',
        a: 'Exactly. Developer includes 50,000 API calls per month, the cheapest overages, unlimited users and AI, and the embeddable quoter. It is the foundation for connecting Cord to your ERP, e-commerce, or client portal.',
    },
];
