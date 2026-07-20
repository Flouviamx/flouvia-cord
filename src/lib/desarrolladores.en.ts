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
                    body: `curl -X POST https://cordhq.app/api/v1/cotizaciones \
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
            { titulo: 'Authenticate', copy: 'Send Authorization: Bearer in every request to https://cordhq.app/api/v1.' },
            { titulo: 'Read and create', copy: 'Query JSON or create quotes from your ERP, CRM, or automation.' },
        ],
        faqs: [
            { q: 'Do I need the Developer plan to get API access?', a: 'No. The API is available on every plan, including Free — each plan comes with a different number of keys and a monthly call limit (Free: 2 keys, Developer: 200 keys + 50,000 calls/month); there is no single plan that "unlocks" the API.' },
            { q: 'Are test keys free?', a: "Yes. You can generate an sk_test_ key at no cost to integrate and test before activating a real sk_live_ key." },
            { q: 'What can I do with the API besides creating quotes?', a: 'Read and create clients and products, and query your collections pipeline — generally, the same things you see in the app, exposed as REST endpoints under /api/v1.' },
        ],
        cta: { titulo: 'Connect Cord to your system.', sub: 'Generate a free test key and make your first call today.' },
        trust: {
            eyebrow: 'INFRASTRUCTURE',
            titulo: 'Built for production',
            proteccion: {
                icon: 'shield',
                titulo: 'Enterprise-grade security',
                copy: 'Every call travels encrypted with TLS; data at rest, with AES-256. Row Level Security in the database isolates every organization — no query ever crosses data between different businesses.',
            },
            puntos: [
                { icon: 'key', titulo: 'Test and live keys, revocable instantly' },
                { icon: 'doc', titulo: 'We only store your key\'s hash, never in plaintext' },
            ],
            grid: [
                { icon: 'gauge', titulo: '~500 requests/min per IP', copy: 'The limit runs on a 60-second window; if you hit it, the response carries the exact code and wait time.' },
                { icon: 'globe', titulo: 'Infrastructure and data hosted in Mexico', copy: "Your database and the API's compute live in the Mexico region — no unnecessary hops to other continents." },
                { icon: 'unlock', titulo: 'Available from the Free plan', copy: 'There\'s no exclusive plan that "unlocks" the API — every plan ships its own number of keys and monthly call limit.' },
                { icon: 'layers', titulo: 'limit/offset pagination on every endpoint', copy: 'Every listing endpoint accepts limit and offset, so you build your own pagination without guessing page size.' },
            ],
        },
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
            { titulo: 'Connect the server', copy: 'Add https://cordhq.app/api/mcp in your AI client with the authorization header. For session streaming, use the SSE channel.' },
            { titulo: 'Register and allow', copy: 'Add your CRM or ERP\'s MCP server URL and grant your agent access to them. The AI now queries your systems before quoting.' },
        ],
        faqs: [
            { q: 'Is Cord\'s MCP only for an AI to read my data?', a: 'No. Cord works both ways: as an MCP server (an AI like Claude queries your pipeline and builds quotes with 7 tools) and as an MCP client (it connects to your CRM or ERP\'s MCP servers under permissions you authorize).' },
            { q: 'Can any AI agent touch any data in my account?', a: 'No. Agent governance in Settings lets you define, server by server, which tools each agent can use — access is explicit, never open by default.' },
            { q: 'Do I need a different key for MCP and the REST API?', a: 'No, it\'s the same API key for both — the authorization header is identical.' },
        ],
        cta: { titulo: 'Connect AI to your business. In both directions.', sub: 'Same header, same key. Expose your 7 tools and link your systems with permissions you control.' },
        trust: {
            eyebrow: 'GOVERNANCE',
            titulo: 'Explicit access, never open',
            proteccion: {
                icon: 'shield',
                titulo: 'Every query respects your RLS',
                copy: 'The MCP session is bound to your org_id: every tool the AI invokes —yours or an external server\'s— filters through Row Level Security. No agent ever sees another organization\'s data.',
            },
            puntos: [
                { icon: 'doc', titulo: 'Every agent action lands in the audit log' },
                { icon: 'key', titulo: 'Same API key for the REST API and MCP' },
            ],
            grid: [
                { icon: 'toggle', titulo: 'Per-server permission, revocable instantly', copy: "Turn your agent's access to each external MCP server on or off from Settings, without waiting on a deploy." },
                { icon: 'route', titulo: 'Up to 5 agent-loop turns per quote', copy: "It's a safety cap: the AI queries your systems up to 5 times before drafting — never an infinite loop." },
                { icon: 'globe', titulo: '2 transports: stateless HTTP and HTTP/SSE', copy: 'Use plain JSON-RPC for one-off calls, or the SSE channel with a session when you need continuous streaming.' },
                { icon: 'unlock', titulo: 'Available on every plan', copy: "Inbound and outbound MCP share the same API key — there's no separate plan for connecting AI to your business." },
            ],
        },
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
            { valor: '6', countup: 6, label: 'ways to use it today: HTML (embed.js), React, Vue, Astro, Framer, and Webflow' },
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
<script src="https://cordhq.app/embed.js" async></script>
<div data-cord-token="abc123"></div>`,
                },
            },
            {
                eyebrow: 'NATIVE IN YOUR FRAMEWORK',
                titulo: 'An npm package. Typed, themeable, headless if you want.',
                copy: 'Install @flouviahq/elements 1.0 and use it like any other component. In React you import <CordCotizador> with typed callbacks; in Vue, Astro, Svelte, or HTML you use the <cord-cotizador> Web Component. TypeScript types are generated straight from the real build (never hand-written), so they never drift from the SDK. And if you\'d rather build your own interface, the useQuoteBuilder() hook gives you the quoter\'s state without a single line of our UI.',
                bullets: [
                    'import { CordCotizador } from \'@flouviahq/elements/react\'',
                    'Web Component &lt;cord-cotizador token="…"&gt; for Vue, Astro, Svelte, and HTML — plus SDKs for Framer and Webflow',
                    'Real Appearance API: theme the iframe (color, font, radii), or pass appearance.baseTheme:"none" to go fully headless',
                ],
                code: {
                    label: 'React / Next.js',
                    body: `// npm install @flouviahq/elements
import { CordCotizador } from '@flouviahq/elements/react';

export function Cotizacion({ token }) {
  return (
    <CordCotizador
      token={token}
      appearance={{ theme: 'auto' }}
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
                copy: 'Inside the embed is the exact same quoter from your account: your color, your logo, and your details, computed by the SAME engine the rest of Cord uses (never a total that drifts). The client approves, rejects, negotiates the price, or pays without leaving their portal, and you control access with separate keys: a publishable one (pk_, scoped to creating quotes and reading the catalog) for the browser, and a secret one (sk_) for your backend — plus the domain allowlist (CSP frame-ancestors) that shields against clickjacking.',
                bullets: [
                    'pk_ publishable keys (narrow scope) and sk_ secret keys — never expose your full CRM in the browser',
                    'Approval, counteroffer, chat, SHA-256 legal signature, and online payment, all embedded',
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
            { q: 'Does Cord Elements require me to run my own backend?', a: 'No. It\'s an embedded iframe (or the @flouviahq/elements package for React/Vue/Web Component) that talks directly to Cord — you paste the snippet and need no extra server. If you do have a backend, the Server SDK (@flouviahq/elements/server) gives you the same data plus webhooks verified with an HMAC signature.' },
            { q: 'Can I use it fully headless, with no Cord UI at all?', a: 'Yes. The useQuoteBuilder() hook exposes the quoter\'s full state (line items, totals, client, submission) without rendering our UI — you build your own interface with your own components and just consume the logic.' },
            { q: 'Does it ship with TypeScript types?', a: 'Yes, generated straight from the build\'s source code (never hand-written) — when a type changes in the SDK, your editor reflects it immediately, with no risk of the package and its .d.ts files drifting apart.' },
            { q: 'Can I remove the "via Cord" branding from the embedded quoter?', a: 'Yes, on a paid plan you can remove the "via Cord" notice and leave only your brand from Settings › Developers. The Free plan shows that discreet notice.' },
            { q: 'What framework does Cord Elements work with?', a: 'The <cord-cotizador> Web Component works in any HTML, Astro, or Vue site; there\'s a native React wrapper (@flouviahq/elements/react), SDKs for Framer and Webflow, and a one-line loader (embed.js) for WordPress or framework-less sites.' },
        ],
        cta: { titulo: 'Bring your quoter to where your clients are.', sub: 'Create your free account and embed your first quoter today — one line of code.' },
        trust: {
            eyebrow: 'EMBEDDABLE QUOTER',
            titulo: 'Secure by design',
            proteccion: {
                icon: 'shield',
                titulo: 'Shielded against clickjacking',
                copy: 'You decide which domains your embedded quoter can live on: a per-account allowlist controls the CSP frame-ancestors header, so no one else can embed it on a site you didn\'t authorize.',
            },
            puntos: [
                { icon: 'unlock', titulo: 'Free signup, no backend of your own to maintain' },
                { icon: 'doc', titulo: '5 live events: ready, approved, rejected, message, pay' },
            ],
            grid: [
                { icon: 'globe', titulo: 'Works on any stack: HTML, React, Vue, Astro', copy: 'The same secure iframe mounts via a script tag, the npm package, or the Web Component — pick what fits your stack.' },
                { icon: 'key', titulo: 'Narrow-scope pk_ publishable keys', copy: 'A pk_ key can only create quotes and read your catalog — never your pipeline or your full CRM, even if it ends up exposed in the browser.' },
                { icon: 'toggle', titulo: 'Remove the "via Cord" notice on a paid plan', copy: 'The Free plan shows a discreet "via Cord" notice; remove it anytime from Settings on a paid plan.' },
                { icon: 'route', titulo: 'Same engine, six ways to integrate it', copy: 'Switch from plain HTML to React, Vue, Framer, or Webflow without losing anything — same totals engine, same events.' },
            ],
        },
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
        trust: {
            eyebrow: 'FX COVERAGE',
            titulo: 'Your margin, protected',
            proteccion: {
                icon: 'shield',
                titulo: 'The rate you lock is the rate you get',
                copy: 'Freeze the exchange rate for up to 30 days (FX lock) from the moment you quote. Even if the peso moves before your client pays, your margin doesn\'t move with it.',
            },
            puntos: [
                { icon: 'gauge', titulo: 'Configurable coverage buffer per quote' },
                { icon: 'doc', titulo: 'CFDI 4.0 is stamped in pesos, with the rate already applied' },
            ],
            grid: [
                { icon: 'globe', titulo: 'Banxico FIX at no extra cost, on every plan', copy: "Banxico's official rate is included from the Free plan, at no extra charge to query." },
                { icon: 'refresh', titulo: 'Live interbank rates from the Professional plan', copy: "For larger deals, the live interbank rate shrinks the margin you'd otherwise leave on the table." },
                { icon: 'lock', titulo: 'Rate frozen for up to 30 days (FX lock)', copy: 'Quote today, your client approves in two weeks, and the rate you showed them is still the one that gets invoiced.' },
                { icon: 'layers', titulo: 'Quoting currency and invoicing currency, independent', copy: 'Your client can see the price in USD while the CFDI 4.0 stamps in pesos — no manual conversion on your end.' },
            ],
        },
    },
    {
        slug: 'fiscal',
        nav: 'US/MX Tax',
        eyebrow: 'TAX ARCHITECTURE',
        titulo: 'Real CFDI 4.0 for Mexico. Built to grow to more countries.',
        sub: "Cord's tax stamping runs in production with the SAT through a certified PAC. The architecture is multi-country by design — each new market is added as its own adapter, no core rewrite required.",
        metaTitle: 'CFDI 4.0 and multi-country tax architecture — Cord Developers',
        metaDescription: "Real CFDI 4.0 e-invoicing for Mexico via Facturapi, built on an adapter architecture ready to add more countries. Documentation for Cord's tax layer.",
        plan: 'Developer Plan',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'real CFDI 4.0 stamping with the SAT (Mexico)' },
            { valor: '1', countup: 1, label: 'certified PAC already in production (Facturapi)' },
            { valor: 'MX', label: 'tax country in production today — built to add more' },
        ],
        blocks: [
            {
                eyebrow: 'CFDI COMPLIANCE',
                titulo: 'Real stamping, an architecture built to grow.',
                copy: "Every approved quote can be invoiced as a real CFDI 4.0 with the SAT, using your own Digital Seal Certificate (CSD) and RFC — not a simulation. The engine is built as one adapter per country, so adding a new market doesn't touch the core.",
                bullets: [
                    'CFDI 4.0 stamped through a certified PAC (Facturapi), real SAT UUID',
                    'Without a CSD connected, stamping runs in simulated mode so you can test the flow risk-free',
                    'Tax regime, CFDI use, and postal code captured per customer to stamp to a named recipient',
                ],
                code: {
                    label: 'Issued tax document',
                    body: `// Real CFDI 4.0 recorded after invoicing\n{\n  "tipo": "cfdi",\n  "uuid_sat": "3f29a7c1-...-a1b2",\n  "rfc_emisor": "XAXX010101000",\n  "rfc_receptor": "XEXX010101000",\n  "total": 1500.00,\n  "pdf_url": "/api/cotizaciones/{id}/cfdi?type=pdf",\n  "xml_url": "/api/cotizaciones/{id}/cfdi?type=xml"\n}`,
                }
            },
        ],
        steps: [
            { titulo: 'Connect your CSD', copy: 'Upload your Digital Seal Certificate and RFC in Settings › Tax — every Cord account runs its own organization with the PAC.' },
            { titulo: 'Capture recipient tax data', copy: 'Tax regime, CFDI use, and postal code per customer, so you never re-enter anything when invoicing.' },
            { titulo: 'Invoice with one click', copy: 'Marking an approved quote as invoiced generates the real CFDI 4.0 and hands you the PDF/XML.' },
        ],
        faqs: [
            { q: 'Is the CFDI 4.0 for Mexico real or a test?', a: 'It\'s real: Cord stamps invoices with the SAT via a certified PAC (Facturapi) once you connect your CSD. Without a key configured, stamping runs in simulated mode so you can test the flow risk-free.' },
            { q: 'Does Cord already issue complete tax invoices for the United States?', a: "Not yet. The architecture is ready for a US invoicing adapter (commercial invoice), but today the only tax provider in production is Mexico via CFDI 4.0. If you need real US invoicing today, that's not a case Cord covers yet — reach out if you'd like us to prioritize it." },
            { q: 'Can I have one legal entity in Mexico and another in the US under the same account?', a: "Not yet. Each Cord account has a single tax country. To operate two legal entities in different countries you'll need two separate accounts — there's no native support for multiple entities under one organization." },
        ],
        cta: { titulo: 'Real invoicing in Mexico from day one.', sub: 'Connect your CSD and stamp production CFDI 4.0 — no simulations.' },
        trust: {
            eyebrow: 'TAX COMPLIANCE',
            titulo: 'Compliance without friction',
            proteccion: {
                icon: 'shield',
                titulo: 'Real CFDI 4.0 with the SAT',
                copy: 'Stamping runs in production through a certified PAC (Facturapi): your Digital Seal Certificate, your RFC, your real invoice. Without a key configured, the flow runs in simulated mode so you can test it risk-free.',
            },
            puntos: [
                { icon: 'doc', titulo: 'Tax regime, CFDI use, and postal code captured per customer' },
                { icon: 'layers', titulo: 'One adapter per country, built to add markets' },
            ],
            grid: [
                { icon: 'gauge', titulo: 'VAT and withholdings configurable per business', copy: "Every organization sets its own VAT rate and withholdings in Settings — the quoting engine applies them without anyone having to remember." },
                { icon: 'globe', titulo: 'One adapter per country, not a monolith', copy: 'Mexico already runs in production through a certified PAC; adding a new country means adding its own tax provider, not rewriting the core.' },
                { icon: 'unlock', titulo: 'Developer plan', copy: 'The highest stamping volume and live API keys live on the Developer plan.' },
                { icon: 'route', titulo: 'Cross-border US/MX: on the roadmap, not in production', copy: "The US invoicing adapter isn't finished yet — reach out if your use case needs it, so we know when to prioritize it." },
            ],
        },
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
        trust: {
            eyebrow: 'RELIABILITY',
            titulo: 'Deliveries you can trust',
            proteccion: {
                icon: 'shield',
                titulo: 'Every delivery, signed and verifiable',
                copy: 'Every webhook goes out signed with HMAC-SHA256 in the X-Cord-Signature header — you compute the hash of the raw body with your secret and confirm it came from Cord, not someone else.',
            },
            puntos: [
                { icon: 'refresh', titulo: 'Automatic retry if the first delivery fails' },
                { icon: 'doc', titulo: 'Delivery log with status, latency, and manual resend' },
            ],
            grid: [
                { icon: 'route', titulo: 'Zapier, Make, n8n, or your own backend', copy: 'One webhook reaches thousands of apps without Cord maintaining a proprietary connector for each one.' },
                { icon: 'toggle', titulo: 'Native Slack: automatic alerts per event', copy: 'Unlike Zapier or Make, Slack needs no middleman: the notification lands straight in your channel.' },
                { icon: 'gauge', titulo: 'From 1 endpoint (Free) to 100 (Developer)', copy: 'The limit grows with your plan; overages are measured by API usage, not by the number of registered endpoints.' },
                { icon: 'key', titulo: 'Secret shown once, never in plaintext', copy: 'Copy it when you create it — after that only its fingerprint remains to sign with, no way to see it in full again.' },
            ],
        },
    },
];

export const findDevPageEn = (slug: string) => DEV_PAGES_EN.find((p) => p.slug === slug);
