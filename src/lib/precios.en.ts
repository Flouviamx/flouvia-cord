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
        precioMensual: 12,
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
        precioMensual: 30,
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
        precioMensual: 70,
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
        precioMensual: 150,
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
            { label: 'Legally binding digital signature (SHA-256)', free: true, starter: true, pro: true, scale: true, developer: true },
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
            { label: 'Automated E-invoicing CFDI 4.0 (SAT)', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Your own CSD (digital seal)', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Multi-currency with FX hedging (rate lock)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'International invoicing (US / EU)', free: false, starter: false, pro: false, scale: true, developer: true },
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
            { label: 'Approval flows (discount/amount/margin limits)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Silent margin auditor', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Collections module (AR aging)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Automated late-payment interest', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: '90-day cash flow forecast', free: false, starter: false, pro: false, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Identity and Branding',
        rows: [
            { label: 'Bulk import (CSV)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Remove "Powered by Cord" branding', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Customize color and logo', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Emails from your domain (SMTP)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Multi-currency (MXN, USD, EUR)', free: true, starter: true, pro: true, scale: true, developer: true },
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
            { label: 'SSO / SAML (enterprise)', free: false, starter: false, pro: false, scale: false, developer: true },
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
            { label: 'Additional user', free: 'Hard limit', starter: 'Hard limit', pro: '$15 / u', scale: '$15 / u', developer: '$10 / u' },
            { label: 'Extra AI generation', free: 'Hard limit', starter: '$0.20 / use', pro: '$0.18 / use', scale: '$0.15 / use', developer: '$0.13 / use' },
            { label: 'Extra E-invoice (CFDI)', free: false, starter: '$0.15 / file', pro: '$0.15 / file', scale: '$0.10 / file', developer: '$0.08 / file' },
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
