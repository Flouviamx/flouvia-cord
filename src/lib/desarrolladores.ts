// src/lib/desarrolladores.ts
// Contenido de las páginas para desarrolladores (/desarrolladores/[slug]).
// El copy y los ejemplos de código viven aquí; el layout y los mockups viven en
// src/pages/desarrolladores/[slug].astro. Espejo del patrón de producto.ts.

export interface DevStat {
    valor: string;
    countup?: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    label: string;
}

export interface DevBlock {
    eyebrow: string;
    titulo: string;       // admite <br/>
    copy: string;
    bullets: string[];
    code?: { label: string; body: string };   // snippet opcional como visual del bloque
}

export interface DevStep { titulo: string; copy: string; }

export interface DevPage {
    slug: string;
    nav: string;
    eyebrow: string;
    titulo: string;       // H1, admite <br/>
    sub: string;
    plan: string;
    stats: DevStat[];
    blocks: DevBlock[];
    steps: DevStep[];
    cta: { titulo: string; sub: string };
}

export const DEV_PAGES: DevPage[] = [
    {
        slug: 'api',
        nav: 'API REST',
        eyebrow: 'API REST',
        titulo: 'Tu motor de cotizaciones,<br/>conectado a todo.',
        sub: 'Cord deja de ser solo una pantalla para humanos y se convierte en un sistema con el que tus otros sistemas pueden hablar. Lee y crea cotizaciones, clientes y productos desde tu ERP, tu CRM o un script — con una sola llave.',
        plan: 'Plan Negocio · llaves de prueba gratis para integrar antes de pagar',
        stats: [
            { valor: '9', countup: 9, label: 'endpoints REST sobre tus datos reales' },
            { valor: '1', countup: 1, label: 'API key para autenticar todo (Bearer)' },
            { valor: '100', countup: 100, suffix: '%', label: 'JSON predecible, sin scraping ni exportar a mano' },
        ],
        blocks: [
            {
                eyebrow: '¿PARA QUÉ SIRVE?',
                titulo: 'Tus clientes grandes ya tienen<br/>su sistema. Habla con él.',
                copy: 'Imagina un cliente atado a un ERP lento que sus empleados odian. Con la API, sus programadores conectan ese ERP con Cord: tu equipo cotiza en el motor rápido de Cord y los datos regresan al ERP del cliente en el fondo. Nadie cambia de herramienta, todos ganan.',
                bullets: [
                    'Importa tu catálogo y clientes desde tu sistema, sin recapturar',
                    'Crea cotizaciones automáticamente cuando algo pasa en tu ERP',
                    'Sincroniza estados (vista, aprobada, pagada) de vuelta a tu sistema',
                ],
            },
            {
                eyebrow: 'AUTENTICACIÓN',
                titulo: 'Una llave. Dos permisos.<br/>Revocable al instante.',
                copy: 'Genera una API key en Ajustes y mándala en el header de cada petición. Las llaves de solo lectura pueden consultar; las de escritura también crean. ¿Se filtró una? La revocas y deja de funcionar al momento. En la base solo guardamos su hash — nunca la llave en claro.',
                bullets: [
                    'Header estándar: Authorization: Bearer sk_live_…',
                    'Scopes de lectura y escritura por llave',
                    'Llaves de prueba (sk_test_) gratis para integrar sin plan',
                ],
                code: {
                    label: 'Crear una cotización',
                    body: `curl -X POST https://cord.flouvia.com/api/v1/cotizaciones \\
  -H "Authorization: Bearer sk_live_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "cliente_id": "c_8f2a…",
    "items": [
      { "descripcion": "Cemento 50kg",
        "cantidad": 120, "precio_unitario": 182 }
    ]
  }'`,
                },
            },
            {
                eyebrow: 'ENDPOINTS',
                titulo: 'Todo lo que ves en la app,<br/>también por API.',
                copy: 'Cotizaciones, clientes, productos y cobranza — los mismos datos de tu panel, en JSON. Pagina con limit y offset, filtra por estado, y construye lo que necesites encima.',
                bullets: [
                    'GET/POST /cotizaciones · GET /cotizaciones/:id',
                    'GET/POST /clientes · GET/POST /productos',
                    'GET /cobranza — cartera, vencidos y aging',
                ],
                code: {
                    label: 'Respuesta de /api/v1/cotizaciones',
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
            { titulo: 'Genera tu llave', copy: 'En Ajustes › Developers › API. Cópiala una vez — solo se muestra al crearla.' },
            { titulo: 'Autentícate', copy: 'Manda Authorization: Bearer en cada petición a https://cord.flouvia.com/api/v1.' },
            { titulo: 'Lee y crea', copy: 'Consulta JSON o crea cotizaciones desde tu ERP, CRM o automatización.' },
        ],
        cta: { titulo: 'Conecta Cord a tu sistema.', sub: 'Genera una llave de prueba gratis y haz tu primera llamada hoy.' },
    },
    {
        slug: 'mcp',
        nav: 'MCP bidireccional + gobernanza de agentes',
        eyebrow: 'MCP BIDIRECCIONAL · GOBERNANZA DE AGENTES',
        titulo: 'Tu negocio habla con la IA.<br/>Y la IA habla con tus sistemas.',
        sub: 'El MCP de Cord ya no va en un solo sentido. Cord es servidor: una IA como Claude consulta tu cartera y arma cotizaciones con 7 herramientas. Y Cord es cliente: se conecta a los servidores MCP de tu CRM o ERP, bajo permisos que tú firmas. Tú decides quién toca qué.',
        plan: 'Disponible en todos los planes · usa la misma API key (más llaves activas conforme subes de plan; el consumo en vivo se mide por uso)',
        stats: [
            { valor: '7', countup: 7, label: 'herramientas que Cord expone a la IA por JSON-RPC' },
            { valor: '2', countup: 2, label: 'transportes entrantes: HTTP sin estado y HTTP/SSE con sesión' },
            { valor: '5', countup: 5, label: 'iteraciones máximas del agent loop antes de cotizar (tope de seguridad)' },
        ],
        blocks: [
            {
                eyebrow: 'CORD COMO SERVIDOR',
                titulo: '7 herramientas.<br/>Dos formas de conectarse.',
                copy: 'Conectas Cord a un asistente como Claude y la IA trabaja con tus datos reales: revisa el pipeline, encuentra lo vencido, busca un cliente o arma un borrador. Hay dos puertas de entrada: JSON-RPC 2.0 sobre HTTP sin estado en /api/mcp, donde viven las 7 herramientas; y un canal HTTP/SSE con sesión en /api/mcp/sse + /api/mcp/message. Ambas se autentican con tu API key y respetan el scope de cada herramienta.',
                bullets: [
                    'Las 7 tools corren dentro de tu org — la IA consulta, no inventa',
                    'Las acciones de escritura exigen una llave con permiso de escritura',
                    'La sesión SSE queda atada a tu org_id: cada query respeta tu RLS',
                ],
                code: {
                    label: 'Herramientas que expone Cord',
                    body: `listar_cotizaciones       detalle_cotizacion
cartera_vencida           resumen_negocio
buscar_cliente            listar_productos
crear_cotizacion_borrador`,
                },
            },
            {
                eyebrow: 'CORD COMO CLIENTE',
                titulo: 'Cord también consulta<br/>los sistemas de tu cliente.',
                copy: 'Da la vuelta a la flecha. Registras la URL de los servidores MCP de tu CRM o ERP y Cord se conecta a ellos como cliente. Cuando armas una cotización con IA, el agent loop de /api/cotizaciones/ai-draft pregunta primero a esos sistemas remotos —saldo de un cliente, último pedido, condiciones pactadas— y luego arma las líneas con ese contexto. Hasta 5 vueltas como tope, y al terminar cierra cada conexión.',
                bullets: [
                    'Conecta por SSE inyectando el token de autorización de cada servidor remoto',
                    'Cada herramienta externa se prefija por servidor para no colisionar',
                    'El agent loop intercala tus tools y las remotas en una sola conversación',
                ],
                code: {
                    label: 'El agent loop arma con contexto remoto',
                    body: `// /api/cotizaciones/ai-draft
const { tools, toolMap } =
  await mcpManager.getAnthropicTools();
const allTools = [armar_cotizacion, ...tools];
// la IA consulta tu CRM antes de cotizar (max 5 vueltas)
await mcpManager.disconnectAll();`,
                },
            },
            {
                eyebrow: 'GOBERNANZA DE AGENTES',
                titulo: 'Cada agente toca<br/>solo lo que le firmas.',
                copy: 'Nada de accesos abiertos. Cada org tiene un agente por defecto, el Asistente Cord, y una tabla de permisos que dicta a qué servidores externos puede conectarse. Si un servidor no está en su allowlist, el agente ni lo ve. Todo vive con Row Level Security en la base: cada consulta filtra por tu org_id y nadie cruza datos entre negocios.',
                bullets: [
                    'Registras y activas/desactivas servidores MCP en Ajustes › Developers',
                    'Otorgas o revocas el permiso del agente por servidor, al instante',
                    'RLS en mcp_servers, agentes_ia y agentes_permisos: aislamiento por org',
                ],
            },
        ],
        steps: [
            { titulo: 'Genera tu llave', copy: 'La misma API key de Ajustes › Developers › API. Una llave sirve para la API REST y para el MCP entrante.' },
            { titulo: 'Conecta el servidor', copy: 'Agrega https://cord.flouvia.com/api/mcp en tu cliente de IA con el header de autorización. Para streaming con sesión, usa el canal SSE.' },
            { titulo: 'Registra y permite', copy: 'Suma la URL de los servidores MCP de tu CRM o ERP y otorga a tu agente acceso a ellos. La IA ya consulta tus sistemas antes de cotizar.' },
        ],
        cta: { titulo: 'Conecta la IA a tu negocio. En los dos sentidos.', sub: 'Mismo header, misma llave. Expón tus 7 herramientas y enlaza tus sistemas con permisos que tú controlas.' },
    },
    {
        slug: 'elements',
        nav: 'Cord Elements',
        eyebrow: 'CORD ELEMENTS · COTIZADOR EMBEBIBLE',
        titulo: 'Tu cotizador,<br/>dentro de su web.',
        sub: 'Lleva el cotizador de Cord al portal de tus clientes con una línea de código. Tu marca, aprobación, contraoferta y pago en línea — todo dentro de su ecosistema, sin que salgan de su sitio.',
        plan: 'Signup gratis. En el plan Gratis el link público lleva el discreto "vía Cord"; lo quitas y dejas solo tu marca desde Ajustes › Developers, donde también defines la allowlist de dominios autorizados para embeber.',
        stats: [
            { valor: '1', countup: 1, label: 'línea de código para montarlo en cualquier sitio' },
            { valor: '5', countup: 5, label: 'formas de usarlo hoy: HTML (embed.js), React, y el Web Component en Vue, Astro y HTML' },
            { valor: '5', countup: 5, label: 'eventos en vivo: ready, approved, rejected, message y pay' },
        ],
        blocks: [
            {
                eyebrow: 'UNA LÍNEA DE CÓDIGO',
                titulo: 'Pegar. Listo.<br/>Sin backend.',
                copy: 'Un script y un <div>. El cotizador aparece como un <iframe> servido por Cord, muestra un skeleton mientras carga y se ajusta solo a la altura del contenido vía postMessage. No hay servidor que mantener ni datos que sincronizar: el token público de la cotización es todo lo que necesitas.',
                bullets: [
                    'Funciona en cualquier stack: WordPress, HTML plano, lo que sea',
                    'Altura automática — el embed mide su contenido y le avisa a tu página',
                    'Skeleton con shimmer mientras carga y fade-in al estar listo: nada de cajas vacías',
                ],
                code: {
                    label: 'En cualquier sitio HTML',
                    body: `<!-- Una línea + un div -->
<script src="https://cord.flouvia.com/embed.js" async></script>
<div data-cord-cotizador data-token="abc123"></div>`,
                },
            },
            {
                eyebrow: 'NATIVO EN TU FRAMEWORK',
                titulo: 'Un paquete de npm.<br/>React o Web Component.',
                copy: 'Instala @flouviahq/elements y úsalo como un componente más. En React importas <CordCotizador> con callbacks tipados; en Vue, Astro o HTML usas el Web Component <cord-cotizador>, que re-emite los eventos como CustomEvents nativos sin prefijo. Mismo iframe por debajo, la integración que prefiera tu equipo.',
                bullets: [
                    'import { CordCotizador } from \'@flouviahq/elements/react\'',
                    'Web Component &lt;cord-cotizador token="…"&gt; para Vue, Astro, Svelte y HTML',
                    'Callbacks tipados: onApproved, onRejected, onMessage, onPay y onReady',
                ],
                code: {
                    label: 'React / Next.js',
                    body: `// npm install @flouviahq/elements
import { CordCotizador } from '@flouviahq/elements/react';

export function Cotizacion({ token }) {
  return (
    <CordCotizador
      token={token}
      onApproved={(d) => console.log('Aprobada', d.folio)}
      onPay={() => location.assign('/gracias')}
    />
  );
}`,
                },
            },
            {
                eyebrow: 'TU MARCA · SEGURO POR DISEÑO',
                titulo: 'El cotizador completo,<br/>no un widget de juguete.',
                copy: 'Dentro del embed va el mismo cotizador de tu cuenta: tu color, tu logo y tus datos. El cliente aprueba, rechaza, negocia el precio o paga con Stripe sin salir de su portal, y tú decides en qué dominios puede embeberse con una allowlist por cuenta (CSP frame-ancestors) que blinda contra clickjacking.',
                bullets: [
                    'Tu marca, no la nuestra — color, logo y datos de tu cuenta de Cord',
                    'Aprobación, contraoferta, chat y pago en línea, todos embebidos',
                    'Allowlist de dominios por cuenta: solo tú decides dónde puede vivir',
                ],
            },
        ],
        steps: [
            { titulo: 'Copia tu snippet', copy: 'Agrega el script de embed.js, instala @flouviahq/elements o pega el Web Component — según tu stack. Lo único que cambia es cómo cargas el cotizador.' },
            { titulo: 'Aparece con tu marca', copy: 'Pasa el token público de la cotización. El color, logo y datos salen de tu cuenta de Cord — cero configuración extra en el sitio anfitrión.' },
            { titulo: 'Reacciona al cliente', copy: 'Escucha cord:approved, cord:pay y los demás eventos en tu propia página para disparar tu analítica, redirigir o sincronizar tu CRM en tiempo real.' },
        ],
        cta: { titulo: 'Lleva tu cotizador a donde están tus clientes.', sub: 'Crea tu cuenta gratis y embebe tu primer cotizador hoy mismo — una línea de código.' },
    },
    {
        slug: 'fx',
        nav: 'Multi-divisa FX',
        eyebrow: 'API MULTI-DIVISA FX',
        titulo: 'Cotiza en USD,<br/>cobra en MXN.',
        sub: 'Conéctate a nuestra API de tipos de cambio en tiempo real (Banxico/FIX o interbancario) para mantener tus listas de precios estables en dólares, pero cotizar y cobrar siempre en moneda local exacta.',
        plan: 'Gratis en todos los planes. Fix de Banxico sin costo extra; tipos interbancarios en vivo en plan Pro.',
        stats: [
            { valor: '3', countup: 3, label: 'fuentes de FX (Banxico, FIX, Interbancario real-time)' },
            { valor: '0', countup: 0, suffix: '%', label: 'margen de error en fluctuaciones cambiarias' },
            { valor: '24/7', label: 'disponibilidad de la API cambiaria' },
        ],
        blocks: [
            {
                eyebrow: 'TIPOS DE CAMBIO EN VIVO',
                titulo: 'Protege tu margen.',
                copy: 'No pierdas dinero por un tipo de cambio desactualizado. Nuestra API te permite congelar el tipo de cambio al momento de cotizar, con una vigencia específica (ej. 24 horas).',
                bullets: [
                    'Tipos de cambio oficiales actualizados al día',
                    'Vigencia por cotización con congelamiento de FX',
                    'Soporte nativo en el Web Component',
                ],
                code: {
                    label: 'Petición FX',
                    body: `// Obtener tipo de cambio del día\nconst fx = await cord.fx.getRate({ from: 'USD', to: 'MXN' });\nconsole.log('USD/MXN:', fx.rate);`,
                }
            },
        ],
        steps: [
            { titulo: 'Define tu moneda base', copy: 'Tus productos pueden estar en USD y cotizarse en MXN.' },
            { titulo: 'Aplica el FX', copy: 'El cotizador consulta la API y muestra el equivalente en MXN exacto.' },
            { titulo: 'Cobra exacto', copy: 'El cliente paga la cantidad en MXN calculada en ese instante.' },
        ],
        cta: { titulo: 'Mantén tu rentabilidad blindada.', sub: 'Integra tipos de cambio en vivo hoy mismo.' },
    },
    {
        slug: 'fiscal',
        nav: 'Fiscal US/MX',
        eyebrow: 'FISCAL INTERNACIONAL',
        titulo: 'Cross-border commerce,<br/>sin fricción.',
        sub: 'Vende desde US a MX o viceversa sin romper las reglas locales. Soporte para Sales Tax, IVA retenido, IEPS y facturación dual.',
        plan: 'Plan Enterprise',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'cumplimiento normativo SAT e IRS' },
            { valor: '2', countup: 2, label: 'regímenes fiscales soportados simultáneamente' },
            { valor: '1', countup: 1, label: 'API unificada para ambos países' },
        ],
        blocks: [
            {
                eyebrow: 'TAX COMPLIANCE',
                titulo: 'Impuestos locales, globales.',
                copy: 'Aplica automáticamente los impuestos correctos según el destino. Si el comprador está en Texas, cobras Sales Tax; si está en Monterrey, cobras IVA del 16% (u 8% en frontera).',
                bullets: [
                    'Validación de RFC (México) y EIN (US)',
                    'Cálculo dinámico de tasas de impuestos (Sales Tax vs IVA)',
                    'Soporte para pedimentos y retenciones',
                ],
                code: {
                    label: 'Cálculo de Tax',
                    body: `// Determinar los impuestos por región\nconst taxes = await cord.tax.calculate({ \n  amount: 1500, \n  buyer_region: 'MX-NLE',\n  seller_region: 'US-TX'\n});`,
                }
            },
        ],
        steps: [
            { titulo: 'Configura tus entidades', copy: 'Agrega tu LLC y tu S.A. de C.V. bajo la misma cuenta.' },
            { titulo: 'Mapea tus productos', copy: 'Asigna los códigos del SAT y los equivalentes en US.' },
            { titulo: 'Cotiza sin pensar', copy: 'La API aplica las reglas fiscales correspondientes automáticamente.' },
        ],
        cta: { titulo: 'Expande tu mercado sin el dolor de cabeza fiscal.', sub: 'Únete a las empresas que operan binacionalmente.' },
    },
];

export const findDevPage = (slug: string) => DEV_PAGES.find((p) => p.slug === slug);
