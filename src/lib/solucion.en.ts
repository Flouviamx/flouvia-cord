// src/lib/solucion.en.ts

import type { Solution } from './solucion';

export const SOLUCIONES_EN: Solution[] = [
    {
        slug: 'empresas',
        nav: 'Enterprise',
        eyebrow: 'FOR ENTERPRISES',
        titulo: 'Your whole team quotes. Nobody gives away margin without sign-off.',
        sub: 'Cord puts discount, amount and margin limits on every quote, holds the ones that break them until someone with approval rights signs off, and logs who did what. Your reps keep closing from a single link: client approval, payment and invoice.',
        metaTitle: 'Quoting with Approvals, Permissions and SSO for Sales Teams — Cord',
        metaDescription: 'Discount, amount and margin limits with internal approval, per-section permissions, SAML 2.0 SSO and an audit log. Your team quotes, collects and invoices from one link in 12 countries, with CFDI 4.0 in Mexico.',
        paraQuien: 'For organizations where several people quote and several departments answer for it: sales builds the proposal, sales leadership signs off on exceptions, finance invoices and collects, and IT decides how people sign in. Everyone sees what their permissions allow.',
        dolor: 'When every rep negotiates on their own, margin leaks through discounts nobody approved and nobody can trace later.',

        integrations: [
            { name: 'HubSpot' },
            { name: 'Xero' },
            { name: 'QuickBooks Online' },
            { name: 'Slack' },
            { name: 'Microsoft Teams' }
        ],

        security: {
            eyebrow: 'SECURITY',
            titulo: 'The questions your IT team will ask, answered.',
            copy: 'These are the safeguards Cord runs today, described as they actually work, with no badges or certifications we do not hold yet.',
            features: [
                { title: 'Data scoped per organization', desc: 'Every query declares which organization it runs for. One organization\'s clients, catalog, invoices and team never show up in another.' },
                { title: 'Encrypted credentials', desc: 'Integration tokens are stored encrypted with AES-256-GCM, and passwords are hashed with Argon2id.' },
                { title: 'Evidence for every approval', desc: 'When your client approves, Cord records their name, the date, the IP and a SHA-256 fingerprint of the lines they accepted.' },
                { title: 'Audit log', desc: 'Invitations, permission changes, SSO and integration connections, and invoice activity are logged with date and IP. From the Professional plan.' }
            ]
        },

        workflow: [
            { step: '01', titulo: 'Quote within the rules', desc: 'The rep builds the proposal from your catalog, with each client\'s tier discount applied.' },
            { step: '02', titulo: 'Internal approval', desc: 'If it exceeds the discount, amount or margin you set, it waits until someone with approval rights releases it.' },
            { step: '03', titulo: 'Client approval', desc: 'Your client approves from the link and Cord keeps the evidence with a SHA-256 fingerprint.' },
            { step: '04', titulo: 'Data to your systems', desc: 'HubSpot, your accounting and your webhooks get the change without anyone retyping it.' }
        ],

        pillars: [
            {
                titulo: 'Approval by exception',
                desc: 'Set the maximum discount, the maximum amount and the minimum margin. Anything past them stays away from the client until someone with the Approvals permission releases it.',
                link: 'See approvals',
                href: '/producto/aprobaciones'
            },
            {
                titulo: 'Wired into your CRM and your books',
                desc: 'Connect HubSpot, Xero, QuickBooks Online, Slack and Microsoft Teams from Settings. For your own systems, a REST API and webhooks.',
                link: 'See integrations',
                href: '/integraciones'
            },
            {
                titulo: 'Access that fits the job',
                desc: 'Start from Admin, Sales or Read-only, then fine-tune ten permissions person by person.',
                link: 'See team and roles',
                href: '/producto/equipo'
            }
        ],

        stats: [
            { valor: '3', label: 'limits per quote: discount, amount and margin' },
            { valor: '10', label: 'per-section permissions for each person' },
            { valor: 'SAML 2.0', label: 'SSO with Okta, Microsoft Entra or Google Workspace' },
        ],
        blocks: [
            {
                eyebrow: 'MARGIN UNDER CONTROL',
                titulo: 'Every pricing exception gets a name and a timestamp.',
                copy: 'Reps build quotes from your catalog, and client tiers (Standard, Silver, Gold and Distributor) apply their discount automatically. If a proposal goes past the maximum discount, the amount cap or the minimum margin you set, it does not go out: it waits with the exact reason until someone with the Approvals permission releases it or sends it back.',
                bullets: [
                    'Three limits: discount, amount and margin',
                    'Margin given away and 90-day cash flow in Finance',
                    'The invoice comes from the approved version',
                ],
            },
            {
                eyebrow: 'NO RETYPING',
                titulo: 'What closes in Cord flows to the rest of your stack on its own.',
                copy: 'HubSpot gets each quote as a Deal, with the stage mapped to its status; Xero or QuickBooks Online get the final invoice, and Google Sheets or Excel keep a row per sale. For your own systems, the REST API and HMAC-signed webhooks report every quote, payment and invoice, and keep retrying for almost four days if your server does not answer.',
                bullets: [
                    'Payments and payouts arrive as events too',
                    'Final invoices pushed to Xero or QuickBooks Online',
                    'Catalog and clients via API or CSV import',
                ],
            },
            {
                eyebrow: 'ACCESS GOVERNANCE',
                titulo: 'IT decides how people sign in. No one relies on a password.',
                copy: 'With SAML 2.0 SSO, only emails from domains you verified through DNS get in, and each person\'s role can come from the group your identity provider sends. You can require two-step verification for the whole team, end idle sessions and restrict invitations to your domains. Revoke someone\'s access and they are out on their next click.',
                bullets: [
                    'Domains verified with a DNS record',
                    'Role assigned from your provider\'s group',
                    'Mandatory SSO, with the owner as fallback',
                ],
            },
        ],
        faqs: [
            {
                q: 'Which plan do I need for approvals, SSO and the audit log?',
                a: 'Internal approvals and SSO are on the Scale plan, which includes 15 users. Teamwork, per-section permissions and the audit log start on Professional, with 5 users. Each additional user is billed separately; prices are on the pricing page.',
            },
            {
                q: 'Can each rep have a different limit?',
                a: 'Today the limits belong to the organization: maximum discount, maximum amount and minimum margin apply to the whole team. What does change per person is who can approve, because approving is a separate permission. If two business units need different rules, each one can be its own organization.',
            },
            {
                q: 'How does what closes in Cord reach our systems?',
                a: 'Through ready-made integrations for HubSpot, Xero, QuickBooks Online, Google Sheets, Excel, Slack and Microsoft Teams, or through the REST API and webhooks. Webhooks are HMAC-signed and, if your server does not answer, Cord retries up to 11 times over about four days. Zapier, Make and n8n cover the rest without code.',
            },
            {
                q: 'How do we handle several legal entities?',
                a: 'Each legal entity is its own organization in Cord, with its own country, currency, taxes, numbering and team, and in Mexico it issues CFDI under its own RFC. One person can belong to several with a different role in each. Every organization has its own plan, and Cord does not combine several into one report.',
            },
            {
                q: 'Can we bring our catalog and our clients?',
                a: 'Yes. Import products and clients from a CSV file, up to 2,000 rows per upload, or create them through the API. If a product already exists with the same SKU, it is updated instead of duplicated.',
            },
            {
                q: 'What security and uptime commitments do you publish?',
                a: 'Cord scopes data per organization, stores integration credentials encrypted, lets you require two-step verification and SSO, and logs sensitive changes with date and IP. We do not yet publish third-party certifications, historical uptime metrics or a standard SLA.',
            },
        ],
        interlink: { href: '/producto/aprobaciones', label: 'approvals and margin control' },
        cta: { titulo: 'Put rules on your pricing before you add more reps.', sub: 'Book a demo with your sales team and your IT team.' },
    },
    {
        slug: 'startups',
        nav: 'Startups',
        eyebrow: 'FOR STARTUPS',
        titulo: 'Send the proposal today. Get paid through the same link.',
        sub: 'Cord gives your startup the sales flow you have no time to build: a branded proposal, client approval, card payment and invoice. Start free with no credit card, and plug your product in through the API when you need it.',
        metaTitle: 'Proposals, Card Payments and Invoicing for Startups — Cord',
        metaDescription: 'Send branded proposals, get paid by card inside the link and invoice without retyping. A free plan that never expires, plus REST API, webhooks and MCP for your product, in 12 countries. CFDI 4.0 for startups in Mexico.',
        paraQuien: 'For founders and small teams selling services, software or products who would rather not build their own quoting and payments system. Start on the Free plan and upgrade when your first sales hire arrives, with nothing to migrate.',
        dolor: 'You write the proposal in a doc, collect by bank transfer and invoice by hand: three tools for a single sale.',

        integrations: [
            { name: 'Zapier' },
            { name: 'Make' },
            { name: 'n8n' },
            { name: 'Slack' },
            { name: 'HubSpot' }
        ],

        useCases: [
            {
                title: 'Agencies & consultancies',
                desc: 'Send the services proposal, collect a deposit on approval and turn the retainer into a monthly charge on the card your client authorized once.',
                link: '/casos-de-uso/agencias',
                logos: [
                    { name: 'HubSpot', domain: 'hubspot.com' },
                    { name: 'Gmail', domain: 'mail.google.com' },
                    { name: 'WhatsApp', domain: 'whatsapp.com' }
                ]
            },
            {
                title: 'SaaS',
                desc: 'Quote the annual plan or a custom contract in your client\'s currency, collect it by card inside the link, and create quotes from your own product through the API.',
                link: '/casos-de-uso/saas',
                logos: [
                    { name: 'Zapier', domain: 'zapier.com' },
                    { name: 'Make', domain: 'make.com' },
                    { name: 'n8n', domain: 'n8n.io' }
                ]
            },
            {
                title: 'Wholesale & trading',
                desc: 'Tiered client pricing, a catalog imported from CSV or Shopify, and Net 30 or Net 60 terms with an alert when a client goes over their credit limit.',
                link: '/casos-de-uso/comercializadoras',
                logos: [
                    { name: 'Shopify', domain: 'shopify.com' },
                    { name: 'Google Sheets', domain: 'sheets.google.com' },
                    { name: 'Excel', domain: 'excel.cloud.microsoft' }
                ]
            },
            {
                title: 'Software studios',
                desc: 'Split the project into deposit and balance or into installments, let your client comment line by line, and get pinged in Slack or Teams the moment they approve.',
                link: '/casos-de-uso/software-factory',
                logos: [
                    { name: 'Slack', domain: 'slack.com' },
                    { name: 'Microsoft Teams', domain: 'teams.microsoft.com' },
                    { name: 'Xero', domain: 'xero.com' }
                ]
            }
        ],

        workflow: [
            { step: '01', titulo: 'Proposal', desc: 'Duplicate the last quote that worked, or let AI draft the lines from your client\'s request.' },
            { step: '02', titulo: 'Approval', desc: 'Your client opens the link, with no account needed, and approves with their name.' },
            { step: '03', titulo: 'Payment', desc: 'They pay by card in the same link: in full, with a deposit or in installments.' },
            { step: '04', titulo: 'Invoice', desc: 'One button issues it with the same data; in Mexico, CFDI 4.0 from Starter.' }
        ],

        pillars: [
            {
                titulo: 'Get paid in the same link',
                desc: 'Your client approves and pays by card without leaving your proposal. No extra subscription: you pay a per-charge fee, on the Free plan too.',
                link: 'See Cord Payments',
                href: '/producto/pagos'
            },
            {
                titulo: 'Know when they open it',
                desc: 'Cord alerts you the moment your client opens the proposal and logs every time they come back, so you call while you are still on their mind.',
                link: 'See tracking',
                href: '/producto/seguimiento'
            },
            {
                titulo: 'Invoicing from day one',
                desc: 'Ten commercial invoices a month on Free and unlimited from Starter. In Mexico, Starter includes 30 CFDI 4.0 invoices a month.',
                link: 'See invoicing',
                href: '/producto/facturacion'
            }
        ],

        stats: [
            { valor: '0', label: 'monthly fee on the Free plan, which never expires' },
            { valor: '8', label: 'countries with card payments inside the link' },
            { valor: '14', label: 'currencies to quote and invoice in' },
        ],
        blocks: [
            {
                eyebrow: 'SPEED',
                titulo: 'From the call to the proposal, the same afternoon.',
                copy: 'Load your catalog once. From then on, duplicate the last quote that worked, or paste what your client asked for and AI suggests the lines using your catalog prices. Taxes, total and expiry are calculated for you, and the list shows where each proposal stands.',
                bullets: [
                    '3 AI drafts a month on the Free plan',
                    'Duplicate a quote and change only what differs',
                    'Sent, viewed, approved or paid, at a glance',
                ],
            },
            {
                eyebrow: 'FIRST IMPRESSION',
                titulo: 'A proposal that does not give away you are a team of three.',
                copy: 'Your logo and colors on a link your client opens on their phone, with no account and nothing to download. They approve with their name, and Cord records the date, the IP and a SHA-256 fingerprint of what they accepted. From Starter, the "Powered by Cord" mark goes away.',
                bullets: [
                    'Approval with name, date and IP',
                    'Only your brand, no "Powered by", from Starter',
                    'Client comments line by line',
                ],
            },
            {
                eyebrow: 'LESS ADMIN',
                titulo: 'The invoice comes from the sale, not from retyping it.',
                copy: 'Once the quote is approved or paid, one button issues the invoice with the same client and line items, and emails it with the PDF and its payment link. In Mexico, Cord stamps CFDI 4.0 with your own certificate; on the Free plan you issue a proforma. If the invoice stays open, payment reminders go out on their own.',
                bullets: [
                    'CFDI 4.0 with your own certificate',
                    'PDF and payment link in the same email',
                    'Reminders before and after the due date',
                ],
            },
        ],
        faqs: [
            {
                q: 'How much does it cost to start?',
                a: 'Nothing. The Free plan never expires and needs no credit card: it includes 5 sends a month, up to 5 active quotes, 10 commercial invoices and card payments. When you need more sends or want to remove the Cord mark, move to Starter; prices are on the pricing page.',
            },
            {
                q: 'Can I take card payments on the Free plan?',
                a: 'Yes. Cord Payments is on every plan, Free included, in Mexico, the United States, Canada, Brazil, Spain, the United Kingdom, Germany and France; you pay a per-charge fee, not a subscription. In Colombia, Argentina, Chile and Peru you collect through your own Mercado Pago account.',
            },
            {
                q: 'Does it work for subscriptions or annual contracts?',
                a: 'Yes. Quote the annual plan in your client\'s currency and collect it through the link. If you would rather charge monthly, your client authorizes their card once on a retainer and Cord Payments charges it every month. From Professional you can also repeat an invoice every month.',
            },
            {
                q: 'Can I integrate Cord into my product?',
                a: 'Yes, from the Free plan, with 100 API calls a month. The REST API creates clients and quotes, webhooks notify your backend of every event, and Cord Elements puts the quote builder on your site as a Web Component, in React or in Vue. Test keys run against a separate environment, and the MCP server lets an AI like Claude look things up and draft quotes.',
            },
            {
                q: 'What happens when I hire my first salesperson?',
                a: 'Move to Professional and invite up to five people with per-section permissions. Your clients, catalog and history stay where they are: nothing to migrate.',
            },
        ],
        interlink: { href: '/producto/pagos', label: 'card payments inside the link' },
        cta: { titulo: 'Your next proposal can collect its own payment.', sub: 'Create your free account, no credit card, and send the first one today.' },
    },
];
