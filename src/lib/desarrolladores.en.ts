// src/lib/desarrolladores.en.ts
import type { DevPage } from './desarrolladores';

export const DEV_PAGES_EN: DevPage[] = [
    {
        slug: 'api',
        nav: 'REST API',
        eyebrow: 'REST API',
        titulo: 'Your quoting engine, connected to everything.',
        sub: 'Cord stops being just a screen for humans and becomes a system your other systems can talk to. Read and create quotes, clients, and products from your ERP, CRM, or a script — with a single key.',
        metaTitle: 'B2B Quoting REST API — Cord Developers',
        metaDescription: "Cord's REST API (/api/v1) reads and creates quotes, clients, and products with a Bearer key. Available on every plan, including Free, with no-cost test keys.",
        plan: 'Available on every plan (Free included) · free test keys to integrate before paying',
        stats: [
            { valor: '9', countup: 9, label: 'REST endpoints on your real data' },
            { valor: '1', countup: 1, label: 'API key to authenticate everything (Bearer)' },
            { valor: '100', countup: 100, suffix: '%', label: 'predictable JSON, no scraping or manual exports' },
        ],
        blocks: [
            {
                eyebrow: 'WHAT IS IT FOR?',
                titulo: 'Your big clients already have their system. Talk to it.',
                copy: 'Imagine a client tied to a slow ERP their employees hate. With the API, their developers connect that ERP to Cord: your team quotes in Cord\'s fast engine and the data returns to the client\'s ERP in the background. No one changes tools, everyone wins.',
                bullets: [
                    'Import your catalog and clients from your system, without retyping',
                    'Create quotes automatically when something happens in your ERP',
                    'Sync statuses (viewed, approved, paid) back to your system',
                ],
            },
            {
                eyebrow: 'AUTHENTICATION',
                titulo: 'One key. Two scopes. Revocable instantly.',
                copy: 'Generate an API key in Settings and send it in the header of every request. Read-only keys can query; write keys can also create. Did one leak? Revoke it and it stops working instantly. We only store its hash in the database — never the plaintext key.',
                bullets: [
                    'Standard header: Authorization: Bearer sk_live_…',
                    'Read and write scopes per key',
                    'Test keys (sk_test_) free to integrate without a plan',
                ],
                code: {
                    label: 'Create a quote',
                    body: `curl -X POST https://cord.flouvia.com/api/v1/cotizaciones \
  -H "Authorization: Bearer sk_live_xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "c_8f2a…",
    "items": [
      { "descripcion": "Cement 50kg",
        "cantidad": 120, "precio_unitario": 182 }
    ]
  }'`,
                },
            },
            {
                eyebrow: 'ENDPOINTS',
                titulo: 'Everything you see in the app, also via API.',
                copy: 'Quotes, clients, products, and collections — the same data from your dashboard, in JSON. Paginate with limit and offset, filter by status, and build whatever you need on top.',
                bullets: [
                    'GET/POST /cotizaciones · GET /cotizaciones/:id',
                    'GET/POST /clientes · GET/POST /productos',
                    'GET /cobranza — AR, overdue, and aging',
                ],
                code: {
                    label: 'Response from /api/v1/cotizaciones',
                    body: `{
  "data": [
    {
      "id": "q_19a…",
      "folio": "COT-0149",
      "cliente": "Distribuidora El Zarco",
      "status": "sent",
      "total": 196469.2,
      "terminos": "Net 30"
    }
  ],
  "meta": { "limit": 50, "offset": 0, "total": 1 }
}`,
                },
            },
        ],
        steps: [
            { titulo: 'Generate your key', copy: 'In Settings › Developers › API. Copy it once — it\'s only shown when created.' },
            { titulo: 'Authenticate', copy: 'Send Authorization: Bearer in every request to https://cord.flouvia.com/api/v1.' },
            { titulo: 'Read and create', copy: 'Query JSON or create quotes from your ERP, CRM, or automation.' },
        ],
        faqs: [
            { q: 'Do I need the Developer plan to get API access?', a: 'No. The API is available on every plan, including Free — each plan comes with a different number of keys and a monthly call limit (Free: 2 keys, Developer: 200 keys + 50,000 calls/month); there is no single plan that "unlocks" the API.' },
            { q: 'Are test keys free?', a: "Yes. You can generate an sk_test_ key at no cost to integrate and test before activating a real sk_live_ key." },
            { q: 'What can I do with the API besides creating quotes?', a: 'Read and create clients and products, and query your collections pipeline — generally, the same things you see in the app, exposed as REST endpoints under /api/v1.' },
        ],
        cta: { titulo: 'Connect Cord to your system.', sub: 'Generate a free test key and make your first call today.' },
    },
    {
        slug: 'mcp',
        nav: 'Bidirectional MCP + agent governance',
        eyebrow: 'BIDIRECTIONAL MCP · AGENT GOVERNANCE',
        titulo: 'Your business talks to AI. And AI talks to your systems.',
        sub: 'Cord\'s MCP is no longer a one-way street. Cord is a server: an AI like Claude queries your AR and builds quotes using 7 tools. And Cord is a client: it connects to your CRM or ERP\'s MCP servers, under permissions you sign off on. You decide who touches what.',
        metaTitle: 'Bidirectional MCP server for B2B AI agents — Cord',
        metaDescription: "Cord is an MCP server (an AI like Claude queries your pipeline with 7 tools) and an MCP client (it connects to your CRM or ERP's servers under permissions you control). Available on every plan.",
        plan: 'Available on all plans · uses the same API key (more active keys as you upgrade; live consumption is metered by use)',
        stats: [
            { valor: '7', countup: 7, label: 'tools Cord exposes to AI via JSON-RPC' },
            { valor: '2', countup: 2, label: 'inbound transports: stateless HTTP and session HTTP/SSE' },
            { valor: '5', countup: 5, label: 'max agent loop iterations before quoting (safety limit)' },
        ],
        blocks: [
            {
                eyebrow: 'CORD AS A SERVER',
                titulo: '7 tools. Two ways to connect.',
                copy: 'Connect Cord to an assistant like Claude and the AI works with your real data: checks the pipeline, finds overdue accounts, looks up a client, or drafts a quote. There are two entry doors: JSON-RPC 2.0 over stateless HTTP at /api/mcp, where the 7 tools live; and an HTTP/SSE channel with session at /api/mcp/sse + /api/mcp/message. Both authenticate with your API key and respect each tool\'s scope.',
                bullets: [
                    'The 7 tools run inside your org — the AI queries, it doesn\'t make things up',
                    'Write actions require a key with write permission',
                    'The SSE session is tied to your org_id: every query respects your RLS',
                ],
                code: {
                    label: 'Tools exposed by Cord',
                    body: `listar_cotizaciones       detalle_cotizacion
cartera_vencida           resumen_negocio
buscar_cliente            listar_productos
crear_cotizacion_borrador`,
                },
            },
            {
                eyebrow: 'CORD AS A CLIENT',
                titulo: 'Cord also queries your client\'s systems.',
                copy: 'Flip the arrow. You register the URL of your CRM or ERP\'s MCP servers and Cord connects to them as a client. When you build a quote with AI, the agent loop at /api/cotizaciones/ai-draft first asks those remote systems —a client\'s balance, last order, agreed conditions— and then builds the lines with that context. Up to 5 loops max, and it closes every connection when done.',
                bullets: [
                    'Connects via SSE injecting each remote server\'s authorization token',
                    'Each external tool is prefixed by server to prevent collisions',
                    'The agent loop interleaves your tools and remote ones in a single conversation',
                ],
                code: {
                    label: 'The agent loop builds with remote context',
                    body: `// /api/cotizaciones/ai-draft
const { tools, toolMap } =
  await mcpManager.getAnthropicTools();
const allTools = [armar_cotizacion, ...tools];
// the AI queries your CRM before quoting (max 5 loops)
await mcpManager.disconnectAll();`,
                },
            },
            {
                eyebrow: 'AGENT GOVERNANCE',
                titulo: 'Each agent touches only what you sign off on.',
                copy: 'No open access. Each org has a default agent, the Cord Assistant, and a permissions table dictating which external servers it can connect to. If a server isn\'t on its allowlist, the agent doesn\'t even see it. Everything lives with Row Level Security in the database: every query filters by your org_id and no one crosses data between businesses.',
                bullets: [
                    'Register and toggle MCP servers in Settings › Developers',
                    'Grant or revoke the agent\'s permission per server, instantly',
                    'RLS on mcp_servers, agentes_ia, and agentes_permisos: org isolation',
                ],
            },
        ],
        steps: [
            { titulo: 'Generate your key', copy: 'The same API key from Settings › Developers › API. One key works for the REST API and inbound MCP.' },
            { titulo: 'Connect the server', copy: 'Add https://cord.flouvia.com/api/mcp in your AI client with the authorization header. For session streaming, use the SSE channel.' },
            { titulo: 'Register and allow', copy: 'Add your CRM or ERP\'s MCP server URL and grant your agent access to them. The AI now queries your systems before quoting.' },
        ],
        faqs: [
            { q: 'Is Cord\'s MCP only for an AI to read my data?', a: 'No. Cord works both ways: as an MCP server (an AI like Claude queries your pipeline and builds quotes with 7 tools) and as an MCP client (it connects to your CRM or ERP\'s MCP servers under permissions you authorize).' },
            { q: 'Can any AI agent touch any data in my account?', a: 'No. Agent governance in Settings lets you define, server by server, which tools each agent can use — access is explicit, never open by default.' },
            { q: 'Do I need a different key for MCP and the REST API?', a: 'No, it\'s the same API key for both — the authorization header is identical.' },
        ],
        cta: { titulo: 'Connect AI to your business. In both directions.', sub: 'Same header, same key. Expose your 7 tools and link your systems with permissions you control.' },
    },
    {
        slug: 'elements',
        nav: 'Cord Elements',
        eyebrow: 'CORD ELEMENTS · EMBEDDABLE QUOTER',
        titulo: 'Your quoter, inside their site.',
        sub: 'Bring Cord\'s quoter to your clients\' portal with one line of code. Your brand, approval, counteroffer, and online payment — all within their ecosystem, without them ever leaving their site.',
        metaTitle: 'Cord Elements — embeddable B2B quoter for your site',
        metaDescription: 'Embed the Cord quoter in your portal with one line of code: an iframe, the <cord-cotizador> Web Component, or the @flouviahq/elements package for React/Vue. Free signup, no backend required.',
        plan: 'Free signup. On the Free plan, the public link carries a discreet "via Cord"; you can remove it and leave only your brand from Settings › Developers, where you also define the allowlist of domains authorized to embed.',
        stats: [
            { valor: '1', countup: 1, label: 'line of code to mount it on any site' },
            { valor: '5', countup: 5, label: 'ways to use it today: HTML (embed.js), React, and Web Component in Vue, Astro, and HTML' },
            { valor: '5', countup: 5, label: 'live events: ready, approved, rejected, message, and pay' },
        ],
        blocks: [
            {
                eyebrow: 'ONE LINE OF CODE',
                titulo: 'Paste. Done. No backend.',
                copy: 'A script and a <div>. The quoter appears as an <iframe> served by Cord, shows a skeleton while loading, and automatically adjusts its height to the content via postMessage. There\'s no server to maintain or data to sync: the quote\'s public token is all you need.',
                bullets: [
                    'Works on any stack: WordPress, plain HTML, whatever',
                    'Auto-height — the embed measures its content and notifies your page',
                    'Skeleton with shimmer while loading and fade-in when ready: no empty boxes',
                ],
                code: {
                    label: 'On any HTML site',
                    body: `<!-- One line + one div -->
<script src="https://cord.flouvia.com/embed.js" async></script>
<div data-cord-cotizador data-token="abc123"></div>`,
                },
            },
            {
                eyebrow: 'NATIVE IN YOUR FRAMEWORK',
                titulo: 'An npm package. React or Web Component.',
                copy: 'Install @flouviahq/elements and use it like any other component. In React you import <CordCotizador> with typed callbacks; in Vue, Astro, or HTML you use the <cord-cotizador> Web Component, which re-emits events as native, un-prefixed CustomEvents. Same iframe underneath, the integration your team prefers.',
                bullets: [
                    'import { CordCotizador } from \'@flouviahq/elements/react\'',
                    'Web Component <cord-cotizador token="…"> for Vue, Astro, Svelte, and HTML',
                    'Typed callbacks: onApproved, onRejected, onMessage, onPay, and onReady',
                ],
                code: {
                    label: 'React / Next.js',
                    body: `// npm install @flouviahq/elements
import { CordCotizador } from '@flouviahq/elements/react';

export function Cotizacion({ token }) {
  return (
    <CordCotizador
      token={token}
      onApproved={(d) => console.log('Approved', d.folio)}
      onPay={() => location.assign('/thanks')}
    />
  );
}`,
                },
            },
            {
                eyebrow: 'YOUR BRAND · SECURE BY DESIGN',
                titulo: 'The full quoter, not a toy widget.',
                copy: 'Inside the embed is the exact same quoter from your account: your color, your logo, and your details. The client approves, rejects, negotiates the price, or pays with Stripe without leaving their portal, and you decide which domains can embed it with a per-account allowlist (CSP frame-ancestors) that shields against clickjacking.',
                bullets: [
                    'Your brand, not ours — color, logo, and details from your Cord account',
                    'Approval, counteroffer, chat, and online payment, all embedded',
                    'Domain allowlist per account: only you decide where it can live',
                ],
            },
        ],
        steps: [
            { titulo: 'Copy your snippet', copy: 'Add the embed.js script, install @flouviahq/elements, or paste the Web Component — depending on your stack. The only thing that changes is how you load the quoter.' },
            { titulo: 'Appears with your brand', copy: 'Pass the quote\'s public token. The color, logo, and data come from your Cord account — zero extra configuration on the host site.' },
            { titulo: 'React to the client', copy: 'Listen to cord:approved, cord:pay, and other events on your own page to trigger your analytics, redirect, or sync your CRM in real time.' },
        ],
        faqs: [
            { q: 'Does Cord Elements require me to run my own backend?', a: 'No. It\'s an embedded iframe (or the @flouviahq/elements package for React/Vue/Web Component) that talks directly to Cord — you paste the snippet and need no extra server.' },
            { q: 'Can I remove the "via Cord" branding from the embedded quoter?', a: 'Yes, on a paid plan you can remove the "via Cord" notice and leave only your brand from Settings › Developers. The Free plan shows that discreet notice.' },
            { q: 'What framework does Cord Elements work with?', a: 'The <cord-cotizador> Web Component works in any HTML, Astro, or Vue site; there\'s a native React wrapper (@flouviahq/elements/react) and a one-line loader (embed.js) for WordPress or framework-less sites.' },
        ],
        cta: { titulo: 'Bring your quoter to where your clients are.', sub: 'Create your free account and embed your first quoter today — one line of code.' },
    },
    {
        slug: 'fx',
        nav: 'Multi-currency FX',
        eyebrow: 'MULTI-CURRENCY FX API',
        titulo: 'Quote in USD, charge in MXN.',
        sub: 'Connect to our real-time exchange rate API (Banxico/FIX or interbank) to keep your price lists stable in dollars, but always quote and charge in exact local currency.',
        metaTitle: 'Multi-currency & FX hedging API — Cord Developers',
        metaDescription: 'Quote in USD or EUR with a 30-day rate lock (FX lock) and invoice in pesos with CFDI 4.0. Banxico FIX rate included on every plan; live interbank rate from the Professional plan up.',
        plan: 'Free on all plans. Banxico FIX at no extra cost; live interbank rates on the Professional plan.',
        stats: [
            { valor: '3', countup: 3, label: 'FX sources (Banxico, FIX, real-time Interbank)' },
            { valor: '0', countup: 0, suffix: '%', label: 'margin of error in currency fluctuations' },
            { valor: '24/7', label: 'availability of the exchange API' },
        ],
        blocks: [
            {
                eyebrow: 'LIVE EXCHANGE RATES',
                titulo: 'Protect your margin.',
                copy: 'Don\'t lose money due to an outdated exchange rate. Our API allows you to freeze the exchange rate at the time of quoting, with a specific validity (e.g., 24 hours).',
                bullets: [
                    'Official exchange rates updated daily',
                    'Validity per quote with FX freezing',
                    'Native support in the Web Component',
                ],
                code: {
                    label: 'FX Request',
                    body: `// Get today's exchange rate\nconst fx = await cord.fx.getRate({ from: 'USD', to: 'MXN' });\nconsole.log('USD/MXN:', fx.rate);`,
                }
            },
        ],
        steps: [
            { titulo: 'Define your base currency', copy: 'Your products can be in USD and quoted in MXN.' },
            { titulo: 'Apply the FX', copy: 'The quoter queries the API and shows the exact MXN equivalent.' },
            { titulo: 'Charge exact', copy: 'The client pays the exact MXN amount calculated at that moment.' },
        ],
        faqs: [
            { q: 'Does the exchange rate update in real time?', a: 'Yes. Cord queries an exchange-rate source (Banxico FIX or interbank, depending on your plan) at the moment you quote, and you can freeze that rate for up to 30 days (FX lock) to protect your margin.' },
            { q: 'Do I invoice in dollars, or always in pesos?', a: 'Your client can see the price in USD or EUR, but the CFDI 4.0 is stamped in Mexican pesos with the SAT — Cord converts using the rate you locked in when you quoted.' },
            { q: 'Does the live interbank rate cost extra?', a: 'The Banxico FIX rate is included on every plan; live interbank rates are available from the Professional plan up.' },
        ],
        cta: { titulo: 'Keep your profitability shielded.', sub: 'Integrate live exchange rates today.' },
    },
    {
        slug: 'fiscal',
        nav: 'US/MX Tax',
        eyebrow: 'INTERNATIONAL TAX',
        titulo: 'Cross-border commerce, without friction.',
        sub: 'Sell from US to MX or vice versa without breaking local rules. Support for Sales Tax, withheld IVA, IEPS, and dual invoicing.',
        metaTitle: 'International US/MX tax & invoicing — Cord Developers',
        metaDescription: "Cord's multi-country fiscal architecture: real CFDI 4.0 e-invoicing for Mexico via Facturapi, and a commercial-invoice adapter for US operations. For B2B businesses selling cross-border.",
        plan: 'Developer Plan',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'SAT and IRS regulatory compliance' },
            { valor: '2', countup: 2, label: 'tax regimes supported simultaneously' },
            { valor: '1', countup: 1, label: 'unified API for both countries' },
        ],
        blocks: [
            {
                eyebrow: 'TAX COMPLIANCE',
                titulo: 'Local taxes, globally.',
                copy: 'Automatically apply the correct taxes based on the destination. If the buyer is in Texas, you charge Sales Tax; if they are in Monterrey, you charge 16% IVA (or 8% at the border).',
                bullets: [
                    'RFC (Mexico) and EIN (US) validation',
                    'Dynamic calculation of tax rates (Sales Tax vs IVA)',
                    'Support for customs declarations (pedimentos) and withholdings',
                ],
                code: {
                    label: 'Tax Calculation',
                    body: `// Determine taxes by region\nconst taxes = await cord.tax.calculate({ \n  amount: 1500, \n  buyer_region: 'MX-NLE',\n  seller_region: 'US-TX'\n});`,
                }
            },
        ],
        steps: [
            { titulo: 'Configure your entities', copy: 'Add your LLC and your S.A. de C.V. under the same account.' },
            { titulo: 'Map your products', copy: 'Assign SAT codes and their US equivalents.' },
            { titulo: 'Quote without thinking', copy: 'The API automatically applies the corresponding tax rules.' },
        ],
        faqs: [
            { q: 'Is the CFDI 4.0 for Mexico real or a test?', a: 'It\'s real: Cord stamps invoices with the SAT via a certified PAC (Facturapi) once you connect your CSD. Without a key configured, stamping runs in simulated mode so you can test the flow risk-free.' },
            { q: 'Does Cord already issue complete tax invoices for the United States?', a: "Cord's architecture is designed for multiple countries (one adapter per tax provider), and the Mexico flow (CFDI 4.0) is already production-ready. If you need to sell cross-border to or from the US, contact sales to confirm the exact scope available for your case." },
            { q: 'Can I have one legal entity in Mexico and another in the US under the same account?', a: "Cord's data model supports multiple legal entities under one account. Contact sales to confirm availability for your plan and use case." },
        ],
        cta: { titulo: 'Expand your market without the tax headache.', sub: 'Join the companies operating binationally.' },
    },
    {
        slug: 'integraciones',
        nav: 'Integrations & webhooks',
        eyebrow: 'INTEGRATIONS · WEBHOOKS',
        titulo: 'Connect Cord to any ERP or CRM. No waiting for a connector.',
        sub: 'We don\'t maintain proprietary connectors for every system (SAP, Oracle, Salesforce…). Instead, Cord emits signed webhooks on every event of your sales cycle — point them at Zapier, Make, n8n, or your own backend and react in real time. Everything you see in the app is also available via REST API.',
        metaTitle: 'Webhooks & B2B integrations (Zapier, Make, n8n) — Cord',
        metaDescription: 'Cord emits signed webhooks (HMAC-SHA256) on every sales event — quote.sent, quote.approved, quote.paid — that you connect to Zapier, Make, n8n, or your backend. Available on every plan, no proprietary connectors to wait for.',
        plan: 'On every plan · webhooks capped by plan (Free 1 → Developer 100) · native Slack · free test keys for the API',
        stats: [
            { valor: '6', countup: 6, label: 'events Cord emits: sent, viewed, approved, rejected, paid, invoiced' },
            { valor: '1', countup: 1, label: 'HMAC-SHA256 signature per delivery (X-Cord-Signature), verifiable' },
            { valor: '3', countup: 3, label: 'ways to integrate: outbound webhooks, REST API and MCP' },
        ],
        blocks: [
            {
                eyebrow: 'OUTBOUND WEBHOOKS',
                titulo: 'Your system reacts to every sales event.',
                copy: 'Register a URL under Settings › Developers › Webhooks and pick the events you care about. When a quote is sent, viewed, approved, rejected, paid, or invoiced, Cord POSTs the JSON payload. Each delivery is signed with HMAC-SHA256 in the X-Cord-Signature header so you can verify it came from Cord. It\'s best-effort with one retry, and every attempt is logged so you can replay it.',
                bullets: [
                    'Header X-Cord-Signature: sha256=&lt;hmac of the raw body&gt; + X-Cord-Event',
                    'Payload with id, folio, status, total, client and public link',
                    'Delivery log with status, latency and a replay button in Settings',
                ],
            },
            {
                eyebrow: 'NO PROPRIETARY CONNECTORS',
                titulo: 'Zapier, Make, n8n, or your backend.',
                copy: 'Instead of locking you into a "native" connector per vendor, you point the webhook at a no-code platform (Zapier, Make, n8n) and from there reach thousands of apps —including SAP, Oracle, Salesforce, HubSpot or Notion— without us writing code for you. Want full control? Call the REST API directly. And if your team lives in Slack, that one is a native integration: alerts for every event arrive on their own.',
                bullets: [
                    'Connect to 5,000+ apps via Zapier / Make / n8n with one webhook',
                    'Or use the REST API: create quotes, clients and products from your code',
                    'Native Slack: automatic notification on every quote event',
                ],
            },
        ],
        steps: [
            { titulo: 'Register your endpoint', copy: 'Under Settings › Developers › Webhooks. Pick the events and save the secret (shown once).' },
            { titulo: 'Verify the signature', copy: 'Compute the HMAC-SHA256 of the raw body with your secret and compare it to X-Cord-Signature.' },
            { titulo: 'Route to your system', copy: 'Process the JSON in your backend, or drop it into Zapier/Make/n8n to reach your ERP or CRM.' },
        ],
        faqs: [
            { q: 'Does Cord have a native connector for SAP, Salesforce, or Oracle?', a: 'We don\'t maintain proprietary connectors per system. Instead, Cord emits signed webhooks (HMAC-SHA256) on every sales-cycle event that you point at Zapier, Make, n8n, or your own backend to connect with SAP, Salesforce, or any other system.' },
            { q: 'How many webhook endpoints can I configure?', a: 'It depends on your plan: from 1 endpoint on the Free plan up to 100 on the Developer plan. Overages are metered by API consumption, not by number of webhooks.' },
            { q: 'How do I verify a webhook really came from Cord?', a: 'Every delivery includes the X-Cord-Signature header with an HMAC-SHA256 of the raw body, signed with the secret Cord gave you when you created the endpoint — you validate it before processing the event.' },
        ],
        cta: { titulo: 'Connect Cord to your stack today.', sub: 'Register a webhook or generate a test key and receive your first event in minutes.' },
    },
];

export const findDevPageEn = (slug: string) => DEV_PAGES_EN.find((p) => p.slug === slug);
