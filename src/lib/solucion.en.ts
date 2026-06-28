// src/lib/solucion.en.ts

import type { Solution } from './solucion';

export const SOLUCIONES_EN: Solution[] = [
    {
        slug: 'empresas',
        nav: 'Enterprise',
        eyebrow: 'FOR ENTERPRISES',
        titulo: 'Scalable quoting for high-performance teams.',
        sub: 'Modernize your company\'s commercial process. Cord eliminates approval bottlenecks, controls margin in real-time, and ensures every sent proposal complies with company guidelines.',
        metaTitle: 'B2B Quoting Software for Enterprise — Cord by Flouvia',
        metaDescription: 'Enterprise platform to scale quoting processes, control volume pricing lists, and manage credit approvals with security and compliance.',
        paraQuien: 'Cord for Enterprise is designed for corporations, large-scale distributors, and consolidated B2B companies handling large proposal volumes, requiring strict control over pricing and margins, and needing total visibility over their sales pipeline.',
        dolor: 'Decentralized commercial processes cause margin leaks and loss of visibility in closing.',
        integrations: [
            { name: 'SAP' },
            { name: 'Salesforce' },
            { name: 'Oracle NetSuite' },
            { name: 'HubSpot' },
            { name: 'Microsoft Dynamics' }
        ],
        security: {
            eyebrow: 'TRUST CENTER',
            titulo: 'Bank-Grade Security & Compliance',
            copy: 'Large enterprises cannot afford risks in their financial flows. Cord is built from the ground up under the highest standards of operational security and cloud infrastructure.',
            features: [
                { title: 'Audit Log', desc: 'Every action is recorded with user, IP, and timestamp in an immutable, read-only log.' },
                { title: 'SHA-256 Signatures', desc: 'Every approved quote generates an immutable cryptographic hash on our servers.' },
                { title: 'Advanced RBAC', desc: 'Granular roles and permissions. Define who can see what and who can approve discounts.' },
                { title: 'Data Residency', desc: 'Your data encrypted at rest (AES-256) and in transit (TLS 1.3).' }
            ]
        },
        workflow: [
            { step: '01', titulo: 'Controlled Quoting', desc: 'The sales rep builds the proposal using locked price lists and pre-approved margins.' },
            { step: '02', titulo: 'Approval Routing', desc: 'If the discount exceeds the threshold, Cord automatically routes the alert to Finance or the Regional Manager.' },
            { step: '03', titulo: 'Cryptographic Closing', desc: 'The client signs digitally. Cord seals the final PDF guaranteeing its legal immutability.' },
            { step: '04', titulo: 'Integrate your ERP', desc: 'Upon approval, Cord fires a webhook with the payload so your ERP or CRM can trigger billing.' }
        ],
        pillars: [
            {
                titulo: 'Centralized Control',
                desc: 'Define complex business rules and control margin in real-time through approval levels.',
                link: 'Explore',
                href: '/producto/aprobaciones'
            },
            {
                titulo: 'Integrate your ERP',
                desc: 'Connect your ERP or CRM through our REST API and webhooks to trigger actions automatically.',
                link: 'Explore',
                href: '/desarrolladores/api'
            },
            {
                titulo: 'Enterprise Security',
                desc: 'Immutable cryptographic signatures and Role-Based Access Control (RBAC) to protect your pipeline.',
                link: 'Explore',
                href: '/producto/negociacion'
            }
        ],
        stats: [
            { valor: '99.9', countup: 99.9, decimals: 1, suffix: '%', label: 'historical uptime on our infrastructure' },
            { valor: '10x', label: 'faster internal approvals' },
            { valor: '0', countup: 0, label: 'margin leaks due to calculation errors' },
        ],
        blocks: [
            {
                eyebrow: 'PRICE CONTROL',
                titulo: 'Protect your margin at scale.',
                copy: 'Set complex business rules, pricing lists by client tier, and discount limits per rep. Cord ensures no quote leaves without the expected margin and centralizes financial decision-making.',
                bullets: [
                    'Dynamic pricing lists by volume and region',
                    'Automated internal approvals by amount',
                    'Audit and traceability on every price change',
                ],
            },
            {
                eyebrow: 'ENTERPRISE INTEGRATION',
                titulo: 'Connected to your operational ecosystem.',
                copy: 'Cord is not a silo. Through our robust APIs and Webhooks, you can sync catalogs, update CRMs (Salesforce, HubSpot), and trigger billing in your ERP the millisecond a client approves.',
                bullets: [
                    'REST API to connect your ERP or CRM',
                    'Real-time webhooks for business events',
                    'Massive catalogs managed via API',
                ],
            },
            {
                eyebrow: 'SECURITY & COMPLIANCE',
                titulo: 'Architecture designed for compliance.',
                copy: 'From SHA-256 cryptographic signatures on every quote version to Role-Based Access Control (RBAC). Cord meets the highest standards so your IT department approves the platform in record time.',
                bullets: [
                    'Immutable signatures on approved proposals',
                    'Granular roles and permissions per sales team',
                    'Enterprise SLA with dedicated 24/7 support',
                ],
            },
        ],
        resultado: {
            cliente: 'Grupo Nacional Distribuidor',
            metricas: [
                { valor: '+$14M', label: 'in revenue recovered by price control' },
                { valor: '−45%', label: 'in corporate sales cycle time' },
                { valor: '100%', label: 'team adoption in 3 weeks' },
            ],
            nota: 'By unifying their operations on Cord, Grupo Nacional reduced their quoting times and managed to shield their margins against market variations, eliminating email approvals.',
        },
        faqs: [
            {
                q: 'Does Cord support internal approval workflows for discounts?',
                a: 'Yes. You can set logical thresholds. If a rep offers a discount larger than allowed, the quote is blocked and requires a manager\'s authorization before being sent to the final client.',
            },
            {
                q: 'How does Cord integrate with our current ERP?',
                a: 'Our REST API and Webhooks let you read and write clients, inventory, and pricing lists from your own software. Every event (such as a quote approval) fires a webhook with the payload so your ERP or CRM —SAP, Oracle, HubSpot, or any other— can consume it and trigger billing.',
            },
            {
                q: 'Can we migrate our catalog of thousands of SKUs?',
                a: 'Absolutely. Cord is built to scale. You can import via CSV or connect our API to ingest massive catalogs. Price updates reflect in real-time across the system without affecting historical quotes.',
            },
            {
                q: 'What are the platform\'s security standards?',
                a: 'All data is encrypted at rest and in transit. Closed quotes generate an SHA-256 hash signature ensuring immutability. We offer Enterprise SLAs for availability and direct technical support.',
            },
        ],
        interlink: { href: '/desarrolladores/api', label: 'API & Webhooks for integrations' },
        cta: { titulo: 'Scale your commercial operation with confidence.', sub: 'Schedule a technical session with our solutions team.' },
    },
    {
        slug: 'startups',
        nav: 'Startups',
        eyebrow: 'FOR STARTUPS',
        titulo: 'Grow fast, bill instantly.',
        sub: 'Agility is your biggest advantage. Cord lets you send professional proposals in minutes, iterate pricing, close deals with one click, and automate billing without touching a tax portal.',
        metaTitle: 'Fast Quoting and Billing for Startups — Cord by Flouvia',
        metaDescription: 'Cord helps startups and fast-growing agencies send proposals, close clients with one click, and automate billing. Scale without bureaucracy.',
        paraQuien: 'Cord for Startups is designed for tech companies, digital agencies, and fast-growing businesses that need extreme speed to propose, iterate, and close clients without traditional administrative overhead.',
        dolor: 'You waste hours putting together proposals in PDFs that do not convert and billing by hand.',
        useCases: [
            {
                title: 'Agencies & Consultancies',
                desc: 'Send professional services proposals instantly, with binding electronic signatures, and automate recurring monthly retainer collection without friction.',
                link: '/casos-de-uso/agencias',
                logos: [
                    { name: 'Ogilvy', domain: 'ogilvy.com' },
                    { name: 'Accenture', domain: 'accenture.com' },
                    { name: 'IDEO', domain: 'ideo.com' }
                ]
            },
            {
                title: 'B2B SaaS',
                desc: 'Manage subscriptions, custom contracts, and Enterprise plans. Integrate recurring payments and issue automated CFDI invoices without touching the SAT portal.',
                link: '/casos-de-uso/saas',
                logos: [
                    { name: 'Linear', domain: 'linear.app' },
                    { name: 'Stripe', domain: 'stripe.com' },
                    { name: 'Vercel', domain: 'vercel.com' }
                ]
            },
            {
                title: 'B2B Wholesale',
                desc: 'Quote in volume, apply discounts through dynamic tiers, handle extensive catalogs, and automate large order billing upon payment confirmation.',
                link: '/casos-de-uso/comercializadoras',
                logos: [
                    { name: 'Grainger', domain: 'grainger.com' },
                    { name: 'Uline', domain: 'uline.com' },
                    { name: 'Fastenal', domain: 'fastenal.com' }
                ]
            },
            {
                title: 'Software Factories',
                desc: 'Send custom development budgets, split payments by delivery milestones, and receive real-time notifications when the client approves the proposal.',
                link: '/casos-de-uso/software-factory',
                logos: [
                    { name: 'Cursor', domain: 'cursor.com' },
                    { name: 'GitHub', domain: 'github.com' },
                    { name: 'GitLab', domain: 'gitlab.com' }
                ]
            }
        ],
        stats: [
            { valor: '2', countup: 2, suffix: ' min', label: 'to send a polished proposal' },
            { valor: '1', countup: 1, suffix: ' click', label: 'for your client to approve and pay' },
            { valor: '0', countup: 0, label: 'hours wasted billing by hand' },
        ],
        blocks: [
            {
                eyebrow: 'EXECUTION SPEED',
                titulo: 'From pitch to close on the same day.',
                copy: 'Don\'t let the client cool off. With pre-configured templates and an editor built for speed, you can send beautiful, interactive proposals while the client still has your meeting in their head.',
                bullets: [
                    'Lightning-fast editor with markdown support',
                    'Real-time metrics: know when they open your proposal',
                    'Magic links for immediate approval',
                ],
            },
            {
                eyebrow: 'PREMIUM PRESENTATION',
                titulo: 'Look like a public company from Day 1.',
                copy: 'Your prospects judge you by your presentation. Cord wraps your offer in a flawless digital experience (Quiet Luxury) that screams professionalism, setting you apart from startups sending Word-generated PDFs.',
                bullets: [
                    'World-class responsive design by default',
                    'Your logo and colors in every interaction',
                    'Clean, frictionless acceptance flows',
                ],
            },
            {
                eyebrow: 'PURE AUTOMATION',
                titulo: 'Less back-office, more sales.',
                copy: 'When the client approves, Cord takes over. It generates the invoice with the exact deal data and sends it to the client. You can focus on delivering the product, not administrative chores.',
                bullets: [
                    'Automated billing on the Starter plan',
                    'Optional online payment directly in the proposal',
                    'Automated timeline with approval evidence',
                ],
            },
        ],
        resultado: {
            cliente: 'Acme AI / Y Combinator W26',
            metricas: [
                { valor: '3x', label: 'faster sales cycle speed' },
                { valor: '100%', label: 'automated post-close billing' },
                { valor: '0', countup: 0, label: 'friction in B2B onboarding' },
            ],
            nota: 'With a team of only 4 people, Acme AI uses Cord to handle all their annual enterprise subscriptions, looking like a corporation while operating with the agility of a startup.',
        },
        faqs: [
            {
                q: 'Does Cord work for startups selling subscriptions (SaaS)?',
                a: 'Yes. You can quote recurring concepts (monthly or annually). When the client approves the subscription proposal, you can connect it with your favorite payment gateway using our API or collect setup fees immediately.',
            },
            {
                q: 'How do I know if my prospect is interested?',
                a: 'The dashboard notifies you instantly when they open your proposal and counts how many times they view it. This gives you the perfect timing to follow up and close the sale before they cool off.',
            },
            {
                q: 'Can I integrate Cord with my No-Code tools?',
                a: 'Of course! Cord has Webhooks that you can easily connect to Zapier, Make, or n8n to trigger Slack notifications, update Airtable databases, or create clients in HubSpot.',
            },
            {
                q: 'Do I need an accounting team to bill?',
                a: 'No. Cord automates invoice generation upon client approval. You just connect your digital seals (CSD) once, and we handle stamping and sending the properly formed invoice.',
            },
        ],
        interlink: { href: '/producto/cfdi', label: 'automated invoicing' },
        cta: { titulo: 'The secret tool to grow without bureaucracy.', sub: 'Create your free account today. Close your first deal tomorrow.' },
    },
];
