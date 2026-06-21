// src/lib/desarrolladores.en.ts
import type { DevPage } from './desarrolladores';

export const DEV_PAGES_EN: DevPage[] = [
    {
        slug: 'api',
        nav: 'REST API',
        eyebrow: 'REST API',
        titulo: 'Your quoting engine,<br/>connected to everything.',
        sub: 'Cord stops being just a screen for humans and becomes a system your other systems can talk to. Read and create quotes, clients, and products from your ERP, CRM, or a script — with a single key.',
        plan: 'Business Plan · free test keys to integrate before paying',
        stats: [
            { valor: '9', countup: 9, label: 'REST endpoints on your real data' },
            { valor: '1', countup: 1, label: 'API key to authenticate everything (Bearer)' },
            { valor: '100', countup: 100, suffix: '%', label: 'predictable JSON, no scraping or manual exports' },
        ],
        blocks: [
            {
                eyebrow: 'WHAT IS IT FOR?',
                titulo: 'Your big clients already have<br/>their system. Talk to it.',
                copy: 'Imagine a client tied to a slow ERP their employees hate. With the API, their developers connect that ERP to Cord: your team quotes in Cord\'s fast engine and the data returns to the client\'s ERP in the background. No one changes tools, everyone wins.',
                bullets: [
                    'Import your catalog and clients from your system, without retyping',
                    'Create quotes automatically when something happens in your ERP',
                    'Sync statuses (viewed, approved, paid) back to your system',
                ],
            },
            {
                eyebrow: 'AUTHENTICATION',
                titulo: 'One key. Two scopes.<br/>Revocable instantly.',
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
                titulo: 'Everything you see in the app,<br/>also via API.',
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
        cta: { titulo: 'Connect Cord to your system.', sub: 'Generate a free test key and make your first call today.' },
    },
    {
        slug: 'mcp',
        nav: 'MCP for AI',
        eyebrow: 'BIDIRECTIONAL MCP · AGENT GOVERNANCE',
        titulo: 'Your business talks to AI.<br/>And AI talks to your systems.',
        sub: 'Cord\'s MCP is no longer a one-way street. Cord is a server: an AI like Claude queries your AR and builds quotes using 7 tools. And Cord is a client: it connects to your CRM or ERP\'s MCP servers, under permissions you sign off on. You decide who touches what.',
        plan: 'Available on all plans · uses the same API key (more active keys as you upgrade; live consumption is metered by use)',
        stats: [
            { valor: '7', countup: 7, label: 'tools Cord exposes to AI via JSON-RPC' },
            { valor: '2', countup: 2, label: 'inbound transports: stateless HTTP and session HTTP/SSE' },
            { valor: '5', countup: 5, label: 'max agent loop iterations before quoting (safety limit)' },
        ],
        blocks: [
            {
                eyebrow: 'CORD AS A SERVER',
                titulo: '7 tools.<br/>Two ways to connect.',
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
                titulo: 'Cord also queries<br/>your client\'s systems.',
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
                titulo: 'Each agent touches<br/>only what you sign off on.',
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
        cta: { titulo: 'Connect AI to your business. In both directions.', sub: 'Same header, same key. Expose your 7 tools and link your systems with permissions you control.' },
    },
    {
        slug: 'elements',
        nav: 'Cord Elements',
        eyebrow: 'CORD ELEMENTS · EMBEDDABLE QUOTER',
        titulo: 'Your quoter,<br/>inside their site.',
        sub: 'Bring Cord\'s quoter to your clients\' portal with one line of code. Your brand, approval, counteroffer, and online payment — all within their ecosystem, without them ever leaving their site.',
        plan: 'Free signup. On the Free plan, the public link carries a discreet "via Cord"; you can remove it and leave only your brand from Settings › Developers, where you also define the allowlist of domains authorized to embed.',
        stats: [
            { valor: '1', countup: 1, label: 'line of code to mount it on any site' },
            { valor: '5', countup: 5, label: 'ways to use it today: HTML (embed.js), React, and Web Component in Vue, Astro, and HTML' },
            { valor: '5', countup: 5, label: 'live events: ready, approved, rejected, message, and pay' },
        ],
        blocks: [
            {
                eyebrow: 'ONE LINE OF CODE',
                titulo: 'Paste. Done.<br/>No backend.',
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
                titulo: 'An npm package.<br/>React or Web Component.',
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
                titulo: 'The full quoter,<br/>not a toy widget.',
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
        cta: { titulo: 'Bring your quoter to where your clients are.', sub: 'Create your free account and embed your first quoter today — one line of code.' },
    },
];

export const findDevPageEn = (slug: string) => DEV_PAGES_EN.find((p) => p.slug === slug);
