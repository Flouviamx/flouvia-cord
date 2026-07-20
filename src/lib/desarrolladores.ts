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
    titulo: string;       // admite     copy: string;
    bullets: string[];
    code?: { label: string; body: string };   // snippet opcional como visual del bloque
}

export interface DevStep { titulo: string; copy: string; }

export interface DevFaq { q: string; a: string; }

// Íconos disponibles en el mapa compartido de src/components/desarrolladores/TrustGrid.astro
export type DevTrustIcon = 'shield' | 'key' | 'doc' | 'gauge' | 'globe' | 'unlock' | 'layers' | 'toggle' | 'route' | 'refresh' | 'lock';

export interface DevTrustItem {
    icon: DevTrustIcon;
    titulo: string;
    copy?: string;   // texto extendido que se revela al expandir la celda (grid del TrustGrid)
}

export interface DevTrust {
    eyebrow: string;
    titulo: string;
    proteccion: { icon: DevTrustIcon; titulo: string; copy: string };
    puntos: DevTrustItem[];  // 2 renglones cortos bajo el bloque de protección
    grid: DevTrustItem[];    // 4 celdas del grid 2×2 con divisores hairline
}

export interface DevPage {
    slug: string;
    nav: string;
    eyebrow: string;
    titulo: string;       // H1, admite <br/>
    sub: string;
    metaTitle?: string;      // <title>/OG — keyword-rich (cae a `${nav} — Cord`)
    metaDescription?: string;// meta description (cae a `sub`)
    plan: string;
    stats: DevStat[];
    blocks: DevBlock[];
    steps: DevStep[];
    faqs: DevFaq[];        // FAQ + FAQPage JSON-LD (mínimo 3 por página)
    cta: { titulo: string; sub: string };
    trust?: DevTrust;       // sección "confianza/infra" debajo del bento (TrustGrid.astro)
}

export const DEV_PAGES: DevPage[] = [
    {
        slug: 'api',
        nav: 'API REST',
        eyebrow: 'API REST',
        titulo: 'Tu motor de cotizaciones, conectado a todo.',
        sub: 'Cord deja de ser solo una pantalla para humanos y se convierte en un sistema con el que tus otros sistemas pueden hablar. Lee y crea cotizaciones, clientes y productos desde tu ERP, tu CRM o un script — con una sola llave.',
        metaTitle: 'API REST de cotizaciones B2B — Cord Developers',
        metaDescription: 'La API REST de Cord (/api/v1) lee y crea cotizaciones, clientes y productos con una llave Bearer. Disponible en todos los planes, incluido el Gratis, con llaves de prueba sin costo.',
        plan: 'Disponible en todos los planes (Gratis incluido) · llaves de prueba gratis para integrar antes de pagar',
        stats: [
            { valor: '9', countup: 9, label: 'endpoints REST sobre tus datos reales' },
            { valor: '1', countup: 1, label: 'API key para autenticar todo (Bearer)' },
            { valor: '100', countup: 100, suffix: '%', label: 'JSON predecible, sin scraping ni exportar a mano' },
        ],
        blocks: [
            {
                eyebrow: '¿PARA QUÉ SIRVE?',
                titulo: 'Tus clientes grandes ya tienen su sistema. Habla con él.',
                copy: 'Imagina un cliente atado a un ERP lento que sus empleados odian. Con la API, sus programadores conectan ese ERP con Cord: tu equipo cotiza en el motor rápido de Cord y los datos regresan al ERP del cliente en el fondo. Nadie cambia de herramienta, todos ganan.',
                bullets: [
                    'Importa tu catálogo y clientes desde tu sistema, sin recapturar',
                    'Crea cotizaciones automáticamente cuando algo pasa en tu ERP',
                    'Sincroniza estados (vista, aprobada, pagada) de vuelta a tu sistema',
                ],
            },
            {
                eyebrow: 'AUTENTICACIÓN',
                titulo: 'Una llave. Dos permisos. Revocable al instante.',
                copy: 'Genera una API key en Ajustes y mándala en el header de cada petición. Las llaves de solo lectura pueden consultar; las de escritura también crean. ¿Se filtró una? La revocas y deja de funcionar al momento. En la base solo guardamos su hash — nunca la llave en claro.',
                bullets: [
                    'Header estándar: Authorization: Bearer sk_live_…',
                    'Scopes de lectura y escritura por llave',
                    'Llaves de prueba (sk_test_) gratis para integrar sin plan',
                ],
                code: {
                    label: 'Crear una cotización',
                    body: `curl -X POST https://cordhq.app/api/v1/cotizaciones \\
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
                titulo: 'Todo lo que ves en la app, también por API.',
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
            { titulo: 'Autentícate', copy: 'Manda Authorization: Bearer en cada petición a https://cordhq.app/api/v1.' },
            { titulo: 'Lee y crea', copy: 'Consulta JSON o crea cotizaciones desde tu ERP, CRM o automatización.' },
        ],
        faqs: [
            { q: '¿Necesito el plan Developer para tener acceso a la API?', a: 'No. La API está disponible en todos los planes, incluido el Gratis — cada plan trae un número de llaves y un límite mensual de llamadas distinto (Gratis 2 llaves, Developer 200 llaves + 50,000 llamadas al mes); no hay un plan exclusivo que "desbloquee" la API.' },
            { q: '¿Las llaves de prueba (test) tienen costo?', a: 'No. Puedes generar una llave sk_test_ sin costo para integrar y probar antes de activar una llave sk_live_ real.' },
            { q: '¿Qué puedo hacer con la API además de crear cotizaciones?', a: 'Leer y crear clientes y productos, y consultar tu cartera de cobranza — en general, lo mismo que ves en la app, expuesto como endpoints REST bajo /api/v1.' },
        ],
        cta: { titulo: 'Conecta Cord a tu sistema.', sub: 'Genera una llave de prueba gratis y haz tu primera llamada hoy.' },
        trust: {
            eyebrow: 'INFRAESTRUCTURA',
            titulo: 'Construida para producción',
            proteccion: {
                icon: 'shield',
                titulo: 'Seguridad de nivel empresarial',
                copy: 'Cada llamada viaja cifrada con TLS; los datos en reposo, con AES-256. La Row Level Security de la base aísla cada organización — ninguna consulta cruza datos entre negocios distintos.',
            },
            puntos: [
                { icon: 'key', titulo: 'Llaves test y live, revocables al instante' },
                { icon: 'doc', titulo: 'Solo guardamos el hash de tu llave, nunca en claro' },
            ],
            grid: [
                { icon: 'gauge', titulo: '~500 peticiones/min por IP', copy: 'El límite corre por ventana de 60 segundos; si lo alcanzas, la respuesta trae el código y el tiempo de espera exactos.' },
                { icon: 'globe', titulo: 'Infraestructura y datos alojados en México', copy: 'Tu base de datos y el cómputo de la API viven en la región de México, sin saltos innecesarios a otros continentes.' },
                { icon: 'unlock', titulo: 'Disponible desde el plan Gratis', copy: 'No existe un plan exclusivo que "desbloquea" la API — cada plan trae su propio número de llaves y límite mensual de llamadas.' },
                { icon: 'layers', titulo: 'Paginación limit/offset en cada endpoint', copy: 'Todos los listados aceptan limit y offset, así construyes tu propia paginación sin adivinar el tamaño de página.' },
            ],
        },
    },
    {
        slug: 'mcp',
        nav: 'MCP bidireccional + gobernanza de agentes',
        eyebrow: 'MCP BIDIRECCIONAL · GOBERNANZA DE AGENTES',
        titulo: 'Tu negocio habla con la IA. Y la IA habla con tus sistemas.',
        sub: 'El MCP de Cord ya no va en un solo sentido. Cord es servidor: una IA como Claude consulta tu cartera y arma cotizaciones con 7 herramientas. Y Cord es cliente: se conecta a los servidores MCP de tu CRM o ERP, bajo permisos que tú firmas. Tú decides quién toca qué.',
        metaTitle: 'Servidor MCP bidireccional para IA y agentes B2B — Cord',
        metaDescription: 'Cord es servidor MCP (una IA como Claude consulta tu cartera con 7 herramientas) y cliente MCP (se conecta a los servidores de tu CRM o ERP bajo permisos que tú controlas). Disponible en todos los planes.',
        plan: 'Disponible en todos los planes · usa la misma API key (más llaves activas conforme subes de plan; el consumo en vivo se mide por uso)',
        stats: [
            { valor: '7', countup: 7, label: 'herramientas que Cord expone a la IA por JSON-RPC' },
            { valor: '2', countup: 2, label: 'transportes entrantes: HTTP sin estado y HTTP/SSE con sesión' },
            { valor: '5', countup: 5, label: 'iteraciones máximas del agent loop antes de cotizar (tope de seguridad)' },
        ],
        blocks: [
            {
                eyebrow: 'CORD COMO SERVIDOR',
                titulo: '7 herramientas. Dos formas de conectarse.',
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
                titulo: 'Cord también consulta los sistemas de tu cliente.',
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
                titulo: 'Cada agente toca solo lo que le firmas.',
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
            { titulo: 'Conecta el servidor', copy: 'Agrega https://cordhq.app/api/mcp en tu cliente de IA con el header de autorización. Para streaming con sesión, usa el canal SSE.' },
            { titulo: 'Registra y permite', copy: 'Suma la URL de los servidores MCP de tu CRM o ERP y otorga a tu agente acceso a ellos. La IA ya consulta tus sistemas antes de cotizar.' },
        ],
        faqs: [
            { q: '¿El MCP de Cord solo sirve para que una IA lea mis datos?', a: 'No. Cord funciona en los dos sentidos: como servidor MCP (una IA como Claude consulta tu cartera y arma cotizaciones con 7 herramientas) y como cliente MCP (se conecta a los servidores MCP de tu CRM o ERP bajo los permisos que tú autorices).' },
            { q: '¿Cualquier agente de IA puede tocar cualquier dato de mi cuenta?', a: 'No. La gobernanza de agentes en Ajustes te deja definir, servidor por servidor, qué herramientas puede usar cada agente — el acceso es explícito, nunca total por defecto.' },
            { q: '¿Necesito una llave distinta para el MCP y para la API REST?', a: 'No. Es la misma API key la que usas para ambos; el header de autorización es idéntico.' },
        ],
        cta: { titulo: 'Conecta la IA a tu negocio. En los dos sentidos.', sub: 'Mismo header, misma llave. Expón tus 7 herramientas y enlaza tus sistemas con permisos que tú controlas.' },
        trust: {
            eyebrow: 'GOBERNANZA',
            titulo: 'Acceso explícito, nunca abierto',
            proteccion: {
                icon: 'shield',
                titulo: 'Cada consulta respeta tu RLS',
                copy: 'La sesión MCP queda atada a tu org_id: cada herramienta que la IA invoca —tuya o de un servidor externo— filtra por Row Level Security. Ningún agente ve datos de otra organización.',
            },
            puntos: [
                { icon: 'doc', titulo: 'Cada acción del agente queda en el audit log' },
                { icon: 'key', titulo: 'Misma API key para la API REST y el MCP' },
            ],
            grid: [
                { icon: 'toggle', titulo: 'Permiso por servidor, revocable al instante', copy: 'Activas o apagas el acceso de tu agente a cada servidor MCP externo desde Ajustes, sin esperar un despliegue.' },
                { icon: 'route', titulo: 'Máximo 5 vueltas del agent loop por cotización', copy: 'Es un tope de seguridad: la IA consulta tus sistemas hasta 5 veces antes de armar el borrador, nunca en loop infinito.' },
                { icon: 'globe', titulo: '2 transportes: HTTP sin estado y HTTP/SSE', copy: 'Usa JSON-RPC simple para llamadas puntuales, o el canal SSE con sesión cuando necesitas streaming continuo.' },
                { icon: 'unlock', titulo: 'Disponible en todos los planes', copy: 'El MCP entrante y saliente usan la misma llave de API — no hay un plan aparte para conectar IA a tu negocio.' },
            ],
        },
    },
    {
        slug: 'elements',
        nav: 'Cord Elements',
        eyebrow: 'CORD ELEMENTS · COTIZADOR EMBEBIBLE',
        titulo: 'Tu cotizador, dentro de su web.',
        sub: 'Lleva el cotizador de Cord al portal de tus clientes con una línea de código. Tu marca, aprobación, contraoferta y pago en línea — todo dentro de su ecosistema, sin que salgan de su sitio.',
        metaTitle: 'Cord Elements — cotizador B2B embebible para tu sitio',
        metaDescription: 'Embebe el cotizador de Cord en tu portal con una línea de código: iframe, Web Component <cord-cotizador> o el paquete @flouviahq/elements para React/Vue. Signup gratis, sin backend propio.',
        plan: 'Signup gratis. En el plan Gratis el link público lleva el discreto "vía Cord"; lo quitas y dejas solo tu marca desde Ajustes › Developers, donde también defines la allowlist de dominios autorizados para embeber.',
        stats: [
            { valor: '1', countup: 1, label: 'línea de código para montarlo en cualquier sitio' },
            { valor: '6', countup: 6, label: 'formas de usarlo hoy: HTML (embed.js), React, Vue, Astro, Framer y Webflow' },
            { valor: '5', countup: 5, label: 'eventos en vivo: ready, approved, rejected, message y pay' },
        ],
        blocks: [
            {
                eyebrow: 'UNA LÍNEA DE CÓDIGO',
                titulo: 'Pegar. Listo. Sin backend.',
                copy: 'Un script y un <div>. El cotizador aparece como un <iframe> servido por Cord, muestra un skeleton mientras carga y se ajusta solo a la altura del contenido vía postMessage. No hay servidor que mantener ni datos que sincronizar: el token público de la cotización es todo lo que necesitas.',
                bullets: [
                    'Funciona en cualquier stack: WordPress, HTML plano, lo que sea',
                    'Altura automática — el embed mide su contenido y le avisa a tu página',
                    'Skeleton con shimmer mientras carga y fade-in al estar listo: nada de cajas vacías',
                ],
                code: {
                    label: 'En cualquier sitio HTML',
                    body: `<!-- Una línea + un div -->
<script src="https://cordhq.app/embed.js" async></script>
<div data-cord-token="abc123"></div>`,
                },
            },
            {
                eyebrow: 'NATIVO EN TU FRAMEWORK',
                titulo: 'Un paquete de npm. Tipado, tematizable y headless si quieres.',
                copy: 'Instala @flouviahq/elements 1.0 y úsalo como un componente más. En React importas <CordCotizador> con callbacks tipados; en Vue, Astro, Svelte o HTML usas el Web Component <cord-cotizador>. Los tipos de TypeScript se generan del build real (no se escriben a mano), así que nunca divergen del SDK. Y si prefieres construir tu propia interfaz, el hook useQuoteBuilder() te da el estado del cotizador sin una sola línea de nuestra UI.',
                bullets: [
                    'import { CordCotizador } from \'@flouviahq/elements/react\'',
                    'Web Component &lt;cord-cotizador token="…"&gt; para Vue, Astro, Svelte y HTML — también SDKs para Framer y Webflow',
                    'Appearance API real: tematiza el iframe (color, fuente, radios) o pasa appearance.baseTheme:"none" para 100% headless',
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
      onApproved={(d) => console.log('Aprobada', d.folio)}
      onPay={() => location.assign('/gracias')}
    />
  );
}`,
                },
            },
            {
                eyebrow: 'TU MARCA · SEGURO POR DISEÑO',
                titulo: 'El cotizador completo, no un widget de juguete.',
                copy: 'Dentro del embed va el mismo cotizador de tu cuenta: tu color, tu logo y tus datos, calculados por el MISMO motor que usa el resto de Cord (nunca un total que diverja). El cliente aprueba, rechaza, negocia el precio o paga sin salir de su portal, y tú controlas el acceso con llaves separadas: una pública (pk_, solo para crear cotizaciones y leer catálogo) para el navegador, y una secreta (sk_) para tu backend — más la allowlist de dominios (CSP frame-ancestors) que blinda contra clickjacking.',
                bullets: [
                    'Llaves pk_ (públicas, de scope acotado) y sk_ (secretas) — nunca expongas tu CRM completo en el navegador',
                    'Aprobación, contraoferta, chat, firma legal SHA-256 y pago en línea, todos embebidos',
                    'Allowlist de dominios por cuenta: solo tú decides dónde puede vivir',
                ],
            },
        ],
        steps: [
            { titulo: 'Copia tu snippet', copy: 'Agrega el script de embed.js, instala @flouviahq/elements o pega el Web Component — según tu stack. Lo único que cambia es cómo cargas el cotizador.' },
            { titulo: 'Aparece con tu marca', copy: 'Pasa el token público de la cotización. El color, logo y datos salen de tu cuenta de Cord — cero configuración extra en el sitio anfitrión.' },
            { titulo: 'Reacciona al cliente', copy: 'Escucha cord:approved, cord:pay y los demás eventos en tu propia página para disparar tu analítica, redirigir o sincronizar tu CRM en tiempo real.' },
        ],
        faqs: [
            { q: '¿Cord Elements requiere que monte un backend propio?', a: 'No. Es un iframe embebido (o el paquete @flouviahq/elements para React/Vue/Web Component) que habla directo con Cord — pegas el snippet y no necesitas servidor adicional. Si sí tienes backend, el Server SDK (@flouviahq/elements/server) te da acceso a los mismos datos y a webhooks verificados con firma HMAC.' },
            { q: '¿Puedo usarlo 100% headless, sin la interfaz de Cord?', a: 'Sí. El hook useQuoteBuilder() expone todo el estado del cotizador (líneas, totales, cliente, envío) sin renderizar nuestra UI — construyes tu propia interfaz con tus componentes y solo usas la lógica.' },
            { q: '¿Tiene tipos de TypeScript?', a: 'Sí, generados directo del código fuente del build (no escritos a mano) — si un tipo cambia en el SDK, tu editor lo refleja de inmediato, sin que el paquete y sus .d.ts se desincronicen.' },
            { q: '¿Puedo quitar la marca "vía Cord" del cotizador embebido?', a: 'Sí, desde un plan de pago puedes quitar el "vía Cord" y dejar solo tu marca desde Ajustes › Developers. En el plan Gratis se muestra ese aviso discreto.' },
            { q: '¿En qué framework funciona Cord Elements?', a: 'El Web Component <cord-cotizador> funciona en cualquier HTML, Astro o Vue; hay un wrapper nativo de React (@flouviahq/elements/react), SDKs para Framer y Webflow, y un loader de una línea (embed.js) para WordPress o sitios sin framework.' },
        ],
        cta: { titulo: 'Lleva tu cotizador a donde están tus clientes.', sub: 'Crea tu cuenta gratis y embebe tu primer cotizador hoy mismo — una línea de código.' },
        trust: {
            eyebrow: 'COTIZADOR EMBEBIBLE',
            titulo: 'Seguro por diseño',
            proteccion: {
                icon: 'shield',
                titulo: 'Blindado contra clickjacking',
                copy: 'Tú decides en qué dominios puede vivir tu cotizador embebido: una allowlist por cuenta controla el header CSP frame-ancestors, así nadie más puede insertarlo en un sitio que no autorizaste.',
            },
            puntos: [
                { icon: 'unlock', titulo: 'Signup gratis, sin backend propio que mantener' },
                { icon: 'doc', titulo: '5 eventos en vivo: ready, approved, rejected, message, pay' },
            ],
            grid: [
                { icon: 'globe', titulo: 'Funciona en cualquier stack: HTML, React, Vue, Astro', copy: 'El mismo iframe seguro se monta con un script, el paquete de npm o el Web Component — tú eliges según tu stack.' },
                { icon: 'key', titulo: 'Llaves pk_ públicas de scope acotado', copy: 'Una llave pk_ solo puede crear cotizaciones y leer catálogo — nunca tu cartera ni tu CRM completo, aunque quede expuesta en el navegador.' },
                { icon: 'toggle', titulo: 'Quita el aviso "vía Cord" desde un plan de pago', copy: 'En el plan Gratis el cotizador muestra un discreto "vía Cord"; lo retiras en cualquier momento desde Ajustes.' },
                { icon: 'route', titulo: 'Mismo motor, seis formas de integrarlo', copy: 'Cambias de HTML plano a React, Vue, Framer o Webflow sin perder nada — el mismo cálculo de totales y los mismos eventos.' },
            ],
        },
    },
    {
        slug: 'fx',
        nav: 'Multi-divisa FX',
        eyebrow: 'API MULTI-DIVISA FX',
        titulo: 'Cotiza en USD, cobra en MXN.',
        sub: 'Conéctate a nuestra API de tipos de cambio en tiempo real (Banxico/FIX o interbancario) para mantener tus listas de precios estables en dólares, pero cotizar y cobrar siempre en moneda local exacta.',
        metaTitle: 'API de multi-divisa y cobertura cambiaria (FX) — Cord',
        metaDescription: 'Cotiza en USD o EUR con tasa de cambio protegida por 30 días (FX lock) y factura en pesos con CFDI 4.0. Fix de Banxico incluido en todos los planes; tasa interbancaria en vivo desde el plan Profesional.',
        plan: 'Gratis en todos los planes. Fix de Banxico sin costo extra; tipos interbancarios en vivo en plan Profesional.',
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
        faqs: [
            { q: '¿La tasa de cambio se actualiza en tiempo real?', a: 'Sí. Cord consulta una fuente de tipo de cambio (fix de Banxico o interbancario según tu plan) al momento de cotizar, y puedes congelar esa tasa hasta por 30 días (FX lock) para proteger tu margen.' },
            { q: '¿Facturo en dólares o siempre en pesos?', a: 'Tu cliente puede ver el precio en USD o EUR, pero el CFDI 4.0 se timbra en pesos mexicanos ante el SAT — Cord hace la conversión con la tasa que congelaste al cotizar.' },
            { q: '¿El tipo de cambio interbancario tiene costo extra?', a: 'El fix de Banxico está incluido en todos los planes; los tipos interbancarios en vivo están disponibles desde el plan Profesional.' },
        ],
        cta: { titulo: 'Mantén tu rentabilidad blindada.', sub: 'Integra tipos de cambio en vivo hoy mismo.' },
        trust: {
            eyebrow: 'COBERTURA CAMBIARIA',
            titulo: 'Tu margen, protegido',
            proteccion: {
                icon: 'shield',
                titulo: 'La tasa que cierras es la que cobras',
                copy: 'Congela el tipo de cambio hasta por 30 días (FX lock) desde que cotizas. Aunque el peso se mueva antes de que tu cliente pague, tu margen no se mueve con él.',
            },
            puntos: [
                { icon: 'gauge', titulo: 'Buffer de cobertura configurable por cotización' },
                { icon: 'doc', titulo: 'El CFDI 4.0 se timbra en pesos, ya con la tasa aplicada' },
            ],
            grid: [
                { icon: 'globe', titulo: 'Fix de Banxico sin costo extra, en todos los planes', copy: 'El tipo de cambio oficial de Banxico viene incluido desde el plan Gratis, sin cargo adicional por consultarlo.' },
                { icon: 'refresh', titulo: 'Tipos interbancarios en vivo desde plan Profesional', copy: 'Para operaciones grandes, la tasa interbancaria en tiempo real reduce el margen que dejas sobre la mesa.' },
                { icon: 'lock', titulo: 'Tasa congelada hasta 30 días (FX lock)', copy: 'Cotizas hoy, tu cliente aprueba en dos semanas, y la tasa que le mostraste sigue siendo la que se factura.' },
                { icon: 'layers', titulo: 'Divisa de cotización y de facturación, independientes', copy: 'Tu cliente puede ver el precio en USD mientras el CFDI 4.0 se timbra en pesos, sin que hagas la conversión a mano.' },
            ],
        },
    },
    {
        slug: 'fiscal',
        nav: 'Fiscal US/MX',
        eyebrow: 'ARQUITECTURA FISCAL',
        titulo: 'CFDI 4.0 real para México. Lista para crecer a más países.',
        sub: 'El timbrado fiscal de Cord corre en producción ante el SAT vía un PAC certificado. La arquitectura es multi-país por diseño — cada mercado nuevo se agrega como su propio adaptador, sin reescribir el core.',
        metaTitle: 'CFDI 4.0 y arquitectura fiscal multi-país — Cord Developers',
        metaDescription: 'Timbrado CFDI 4.0 real ante el SAT para México vía Facturapi, con una arquitectura de adaptadores lista para sumar más países. Documentación de la capa fiscal de Cord.',
        plan: 'Plan Developer',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'timbrado CFDI 4.0 real ante el SAT (México)' },
            { valor: '1', countup: 1, label: 'PAC certificado ya en producción (Facturapi)' },
            { valor: 'MX', label: 'país fiscal en producción — arquitectura lista para sumar más' },
        ],
        blocks: [
            {
                eyebrow: 'CFDI COMPLIANCE',
                titulo: 'Timbrado real, arquitectura para crecer.',
                copy: 'Cada cotización aprobada se puede facturar como CFDI 4.0 real ante el SAT, con tu propio Certificado de Sello Digital (CSD) y tu RFC — no una simulación. El motor está construido como un adaptador por país, así que sumar un mercado nuevo no exige tocar el core.',
                bullets: [
                    'CFDI 4.0 timbrado vía un PAC certificado (Facturapi), UUID del SAT real',
                    'Sin CSD conectado, el timbrado corre en modo simulado para probar el flujo sin comprometerte',
                    'Régimen fiscal, uso de CFDI y código postal capturados por cliente para timbrar nominativo',
                ],
                code: {
                    label: 'Documento fiscal emitido',
                    body: `// CFDI 4.0 registrado tras facturar\n{\n  "tipo": "cfdi",\n  "uuid_sat": "3f29a7c1-...-a1b2",\n  "rfc_emisor": "XAXX010101000",\n  "rfc_receptor": "XEXX010101000",\n  "total": 1500.00,\n  "pdf_url": "/api/cotizaciones/{id}/cfdi?type=pdf",\n  "xml_url": "/api/cotizaciones/{id}/cfdi?type=xml"\n}`,
                }
            },
        ],
        steps: [
            { titulo: 'Conecta tu CSD', copy: 'Sube tu Certificado de Sello Digital y tu RFC en Ajustes › Fiscal — cada cuenta de Cord opera su propia organización en el PAC.' },
            { titulo: 'Captura los datos del receptor', copy: 'Régimen fiscal, uso de CFDI y código postal por cliente, para timbrar nominativo sin recapturar nada al facturar.' },
            { titulo: 'Factura con un clic', copy: 'Al marcar una cotización aprobada como facturada, Cord genera el CFDI 4.0 real y te entrega el PDF/XML.' },
        ],
        faqs: [
            { q: '¿El CFDI 4.0 para México es real o de prueba?', a: 'Es real: Cord timbra ante el SAT vía un PAC certificado (Facturapi) cuando conectas tu CSD. Sin una llave configurada, el timbrado corre en modo simulado para que puedas probar el flujo sin comprometerte.' },
            { q: '¿Cord ya emite facturas fiscales completas para Estados Unidos?', a: 'Todavía no. La arquitectura está lista para un adaptador de facturación de EE.UU. (commercial invoice), pero hoy el único proveedor fiscal en producción es México vía CFDI 4.0. Si necesitas facturación real en EE.UU. hoy, no es un caso que Cord cubra todavía — contáctanos si quieres que lo prioricemos.' },
            { q: '¿Puedo tener una entidad en México y otra en Estados Unidos en la misma cuenta?', a: 'No todavía. Cada cuenta de Cord tiene un solo país fiscal asociado. Para operar dos entidades legales en países distintos necesitas dos cuentas separadas — no hay soporte nativo para múltiples entidades bajo la misma organización.' },
        ],
        cta: { titulo: 'Factura real en México desde el día uno.', sub: 'Conecta tu CSD y timbra CFDI 4.0 de producción — sin simulaciones.' },
        trust: {
            eyebrow: 'CUMPLIMIENTO FISCAL',
            titulo: 'Cumplimiento sin fricción',
            proteccion: {
                icon: 'shield',
                titulo: 'CFDI 4.0 real ante el SAT',
                copy: 'El timbrado corre en producción vía un PAC certificado (Facturapi): tu Certificado de Sello Digital, tu RFC, tu factura real. Sin una llave configurada, el flujo corre en modo simulado para que pruebes sin comprometerte.',
            },
            puntos: [
                { icon: 'doc', titulo: 'Régimen fiscal, uso de CFDI y código postal capturados por cliente' },
                { icon: 'layers', titulo: 'Arquitectura de adaptador por país, lista para sumar mercados' },
            ],
            grid: [
                { icon: 'gauge', titulo: 'IVA y retenciones ISR/IVA configurables por negocio', copy: 'Cada organización define su tasa de IVA y sus retenciones en Ajustes — el motor de cotización las aplica sin que nadie las recuerde a mano.' },
                { icon: 'globe', titulo: 'Un adaptador por país, no un monolito', copy: 'México ya opera en producción vía un PAC certificado; sumar un país nuevo es agregar su propio proveedor fiscal, no reescribir el core.' },
                { icon: 'unlock', titulo: 'Plan Developer', copy: 'El mayor volumen de timbrado y las llaves de API en vivo viven en el plan Developer.' },
                { icon: 'route', titulo: 'Cross-border US/MX: en el roadmap, no en producción', copy: 'El adaptador de facturación para Estados Unidos todavía no está terminado — contáctanos si tu caso de uso lo necesita, para saber cuándo estará listo.' },
            ],
        },
    },
    {
        slug: 'integraciones',
        nav: 'Integraciones y webhooks',
        eyebrow: 'INTEGRACIONES · WEBHOOKS',
        titulo: 'Conecta Cord a cualquier ERP o CRM. Sin esperar un conector.',
        sub: 'No mantenemos conectores propietarios para cada sistema (SAP, Oracle, Salesforce…). En su lugar Cord emite webhooks firmados en cada evento de tu ciclo de venta — los apuntas a Zapier, Make, n8n o tu propio backend y reaccionas en tiempo real. Lo que ves en la app, también por API REST.',
        metaTitle: 'Webhooks y integraciones B2B (Zapier, Make, n8n) — Cord',
        metaDescription: 'Cord emite webhooks firmados (HMAC-SHA256) en cada evento de venta — quote.sent, quote.approved, quote.paid — que conectas a Zapier, Make, n8n o tu backend. Disponible en todos los planes, sin conectores propietarios que esperar.',
        plan: 'En todos los planes · webhooks limitados por plan (Free 1 → Developer 100) · Slack nativo · llaves de prueba gratis para la API',
        stats: [
            { valor: '6', countup: 6, label: 'eventos que Cord emite: sent, viewed, approved, rejected, paid, invoiced' },
            { valor: '1', countup: 1, label: 'firma HMAC-SHA256 por entrega (X-Cord-Signature), verificable' },
            { valor: '3', countup: 3, label: 'formas de integrar: webhooks salientes, API REST y MCP' },
        ],
        blocks: [
            {
                eyebrow: 'WEBHOOKS SALIENTES',
                titulo: 'Tu sistema reacciona a cada evento de venta.',
                copy: 'Registras una URL en Ajustes › Developers › Webhooks y eliges qué eventos te interesan. Cuando una cotización se envía, se ve, se aprueba, se rechaza, se paga o se factura, Cord hace un POST con el payload en JSON. Cada entrega va firmada con HMAC-SHA256 en el header X-Cord-Signature para que verifiques que vino de Cord. Es best-effort con un reintento, y cada intento queda en un log que puedes reenviar.',
                bullets: [
                    'Header X-Cord-Signature: sha256=&lt;hmac del cuerpo crudo&gt; + X-Cord-Event',
                    'Payload con id, folio, status, total, cliente y link público',
                    'Log de entregas con estado, latencia y botón de reenvío en Ajustes',
                ],
            },
            {
                eyebrow: 'SIN CONECTORES PROPIETARIOS',
                titulo: 'Zapier, Make, n8n o tu backend.',
                copy: 'En vez de atarte a un conector "nativo" por cada proveedor, apuntas el webhook a una plataforma no-code (Zapier, Make, n8n) y de ahí llegas a miles de apps —incluidos SAP, Oracle, Salesforce, HubSpot o Notion— sin que escribamos código por ti. ¿Prefieres control total? Llama directo a la API REST. Y si tu equipo vive en Slack, esa sí es integración nativa: las alertas de cada evento llegan solas.',
                bullets: [
                    'Conecta a más de 5,000 apps vía Zapier / Make / n8n con un webhook',
                    'O usa la API REST: crea cotizaciones, clientes y productos desde tu código',
                    'Slack nativo: notificación automática en cada evento de cotización',
                ],
            },
        ],
        steps: [
            { titulo: 'Registra tu endpoint', copy: 'En Ajustes › Developers › Webhooks. Elige los eventos y guarda el secret (se muestra una vez).' },
            { titulo: 'Verifica la firma', copy: 'Calcula el HMAC-SHA256 del cuerpo crudo con tu secret y compáralo con X-Cord-Signature.' },
            { titulo: 'Enruta a tu sistema', copy: 'Procesa el JSON en tu backend, o déjalo caer en Zapier/Make/n8n para llegar a tu ERP o CRM.' },
        ],
        faqs: [
            { q: '¿Cord tiene un conector nativo para SAP, Salesforce u Oracle?', a: 'No mantenemos conectores propietarios por sistema. En su lugar, Cord emite webhooks firmados (HMAC-SHA256) en cada evento del ciclo de venta que apuntas a Zapier, Make, n8n o tu propio backend para conectar con SAP, Salesforce o cualquier otro sistema.' },
            { q: '¿Cuántos endpoints de webhook puedo configurar?', a: 'Depende del plan: desde 1 endpoint en el plan Gratis hasta 100 en el plan Developer. Los excedentes se miden por consumo de API, no por número de webhooks.' },
            { q: '¿Cómo verifico que un webhook realmente viene de Cord?', a: 'Cada entrega incluye el header X-Cord-Signature con un HMAC-SHA256 del cuerpo crudo, firmado con el secret que Cord te dio al crear el endpoint — lo validas antes de procesar el evento.' },
        ],
        cta: { titulo: 'Conecta Cord a tu stack hoy.', sub: 'Registra un webhook o genera una llave de prueba y recibe tu primer evento en minutos.' },
        trust: {
            eyebrow: 'CONFIABILIDAD',
            titulo: 'Entregas en las que puedes confiar',
            proteccion: {
                icon: 'shield',
                titulo: 'Cada entrega, firmada y verificable',
                copy: 'Todo webhook sale firmado con HMAC-SHA256 en el header X-Cord-Signature — calculas el hash del cuerpo crudo con tu secret y confirmas que vino de Cord, no de alguien más.',
            },
            puntos: [
                { icon: 'refresh', titulo: 'Reintento automático si la primera entrega falla' },
                { icon: 'doc', titulo: 'Log de entregas con estado, latencia y reenvío manual' },
            ],
            grid: [
                { icon: 'route', titulo: 'Zapier, Make, n8n o tu backend propio', copy: 'Un mismo webhook llega a miles de apps sin que Cord mantenga un conector propietario por cada una.' },
                { icon: 'toggle', titulo: 'Slack nativo: alertas automáticas por evento', copy: 'A diferencia de Zapier o Make, Slack no necesita intermediario: la notificación llega sola a tu canal.' },
                { icon: 'gauge', titulo: 'De 1 endpoint (Gratis) a 100 (Developer)', copy: 'El límite crece con el plan; los excedentes se miden por consumo de API, no por número de endpoints registrados.' },
                { icon: 'key', titulo: 'Secret mostrado una sola vez, nunca en claro', copy: 'Cópialo al crearlo — después solo queda su huella para firmar, no hay forma de volver a verlo completo.' },
            ],
        },
    },
];

export const findDevPage = (slug: string) => DEV_PAGES.find((p) => p.slug === slug);
