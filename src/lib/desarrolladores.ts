// src/lib/desarrolladores.ts
// Contenido de las páginas para desarrolladores (/desarrolladores/[slug]).
// El copy vive aquí; el layout en src/pages/desarrolladores/[slug].astro y los
// mockups en src/components/desarrolladores/DevMock.astro (calcas 1:1 del
// Workbench, de Ajustes › MCP y de Facturas). Cada bloque declara su `mock`.
//
// Regla de este archivo: cada número y cada capacidad se verifica en código
// antes de escribirse (límites en entitlements.ts/billing.ts/apikey.ts, eventos
// en domain-events.ts, herramientas en mcp.ts, fuentes FX en FXService.ts).

export interface DevBlock {
    eyebrow: string;
    titulo: string;       // admite HTML inline (nunca <br/>, regla 2)
    copy: string;
    bullets: string[];
    mock?: string;        // id del mockup en DevMock.astro
}

export interface DevStep { titulo: string; copy: string; }

export interface DevFaq { q: string; a: string; }

export interface DevPage {
    slug: string;
    nav: string;
    eyebrow: string;
    titulo: string;
    sub: string;             // primer párrafo: define qué es (lo extraen los buscadores con IA)
    metaTitle?: string;
    metaDescription?: string;
    plan: string;
    heroMock?: string;       // id del mockup del hero en DevMock.astro
    updated?: string;        // fecha visible de la última revisión del contenido (AAAA-MM-DD)
    blocks: DevBlock[];
    steps?: DevStep[];      // solo Elements: los pasos de instalación
    faqs: DevFaq[];
    cta: { titulo: string; sub: string };
}

const UPDATED = '2026-09-30';

export const DEV_PAGES: DevPage[] = [
    {
        slug: 'api',
        nav: 'API REST',
        eyebrow: 'API REST',
        titulo: 'Cotiza, factura y cobra desde tu propio código.',
        sub: 'La API REST de Cord crea y consulta cotizaciones, clientes, productos y facturas con una llave Bearer, y ejecuta las mismas acciones que la app: enviar, aprobar, emitir o registrar un pago. Respuestas JSON predecibles, especificación OpenAPI y llaves de prueba que trabajan en un entorno aislado de tus datos reales.',
        metaTitle: 'API REST de cotizaciones y facturas — Cord para desarrolladores',
        metaDescription: 'Crea cotizaciones, clientes, productos y facturas por API REST con una llave Bearer. Idempotency-Key, eventos con cursor, especificación OpenAPI y llaves de prueba en un entorno aislado. Desde el plan Gratis.',
        plan: 'En todos los planes. Gratis incluye 2 llaves y 100 llamadas al mes; las llaves de prueba no consumen tu cuota.',
        heroMock: 'hero-api',
        updated: UPDATED,
        blocks: [
            {
                eyebrow: 'IDEMPOTENCIA',
                titulo: 'Reintenta sin miedo a duplicar.',
                copy: 'Una red inestable no debería crear dos cotizaciones. Manda una Idempotency-Key en cualquier POST, PATCH o DELETE: si la petición se repite con la misma llave y el mismo cuerpo, Cord devuelve la respuesta original, marcada con Idempotent-Replayed, en vez de ejecutar dos veces. Si el cuerpo cambió, responde con un error explícito.',
                bullets: [
                    'Funciona en todas las mutaciones de /api/v1',
                    'La respuesta repetida es idéntica, byte por byte',
                    'Misma llave con otro cuerpo: error, nunca un duplicado silencioso',
                ],
                mock: 'code-idempotency',
            },
            {
                eyebrow: 'RECURSOS',
                titulo: 'Lo que ves en la app, también por API.',
                copy: 'No es una API de solo lectura. Crea una cotización y envíala, apruébala o regístrala como pagada. Crea una factura como borrador y emítela, mándala, anótale un pago o una nota de crédito. Todo con los mismos permisos, validaciones y totales que usa la app.',
                bullets: [
                    'Cotizaciones, facturas, clientes, productos, tareas y cobranza',
                    'Acciones con POST { "action": "send" | "approve" | "finalize" | … }',
                    'Paginación con limit y offset, o con cursor en eventos y facturas',
                ],
                mock: 'wb-endpoints',
            },
            {
                eyebrow: 'EVENTOS',
                titulo: 'Sincroniza sin perderte nada.',
                copy: 'GET /api/v1/events devuelve el historial de tu negocio, del más reciente al más antiguo: cotizaciones enviadas, vistas, aprobadas o pagadas, facturas emitidas, clientes nuevos. Filtra por tipo o por objeto y avanza con next_cursor. Es el complemento de los webhooks para reconstruir cualquier estado.',
                bullets: [
                    'Filtros ?type=quote.approved y ?object_id=',
                    'Hasta 200 eventos por página con cursor estable',
                    'Los mismos tipos que reciben tus webhooks',
                ],
                mock: 'code-events',
            },
        ],
        faqs: [
            { q: '¿Qué es la API de Cord?', a: 'Es una API REST bajo https://cordhq.app/api/v1 que da acceso programático a cotizaciones, facturas, clientes, productos, tareas, cobranza y eventos de tu negocio. Se autentica con una llave Bearer y responde en JSON con la forma { data, meta } o { error, code }.' },
            { q: '¿Necesito un plan de pago para usar la API?', a: 'No. La API está en todos los planes, incluido Gratis, con 2 llaves y 100 llamadas al mes. Starter incluye 1,000 llamadas, Profesional 5,000, Scale 10,000 y Developer 50,000. Las llaves de prueba no consumen cuota.' },
            { q: '¿Cómo pruebo sin tocar mis datos reales?', a: 'Con una llave sk_test_. Opera sobre un entorno de prueba separado de tu cuenta, así que puedes crear y borrar cotizaciones sin afectar a tus clientes ni a tus reportes.' },
            { q: '¿Cómo evito crear registros duplicados si reintento?', a: 'Manda el header Idempotency-Key en la petición. Si la repites con la misma llave y el mismo cuerpo, Cord devuelve la respuesta original sin ejecutarla otra vez.' },
            { q: '¿Hay especificación OpenAPI?', a: 'Sí, en https://cordhq.app/openapi.yaml, y un resumen para asistentes de IA en https://cordhq.app/llms.txt. Los dos se enlazan desde el Workbench.' },
        ],
        cta: { titulo: 'Haz tu primera llamada hoy.', sub: 'Crea tu cuenta, genera una llave de prueba y llama a /api/v1/me en menos de un minuto.' },
    },
    {
        slug: 'workbench',
        nav: 'Workbench',
        eyebrow: 'WORKBENCH PARA DESARROLLADORES',
        titulo: 'Toda tu integración, en un panel dentro de la app.',
        sub: 'El Workbench de Cord es un panel para desarrolladores que se abre dentro de la app, sobre la pantalla en la que estés. Reúne llaves de API, webhooks, el registro de cada petición, los eventos del negocio y la salud de tu integración, con un modo de prueba separado de tus datos reales.',
        metaTitle: 'Workbench para desarrolladores: registros de API, webhooks y salud — Cord',
        metaDescription: 'El Workbench de Cord muestra cada petición a la API con su estado y latencia, gestiona webhooks firmados, llaves de prueba y producción, y alerta cuando un endpoint falla. Incluido en todos los planes.',
        plan: 'Incluido en todos los planes. Lo abre cualquier miembro con acceso a Ajustes.',
        heroMock: 'hero-workbench',
        updated: UPDATED,
        blocks: [
            {
                eyebrow: 'REGISTROS',
                titulo: 'Cada petición, con su respuesta.',
                copy: 'Busca por ruta, filtra por método o por tipo de respuesta y abre cualquier petición para ver su estado, latencia, IP, la llave que la hizo y el entorno. Cuando algo falla sabes en segundos si fue un 401 por una llave revocada o un 422 por un campo mal formado.',
                bullets: [
                    'Filtros por método (GET, POST) y por clase (2xx, 4xx, 5xx)',
                    'Detalle con la llave que hizo la llamada, por nombre',
                    'Cord no guarda el cuerpo de tus peticiones: solo metadatos',
                ],
                mock: 'wb-logs',
            },
            {
                eyebrow: 'WEBHOOKS',
                titulo: 'Endpoints que puedes probar sin esperar un evento real.',
                copy: 'Registra una URL, elige los eventos y guarda el secreto. Con Probar mandas una entrega de prueba al instante, con Rotar secreto cambias la firma sin cortar el tráfico, y el historial de cada endpoint muestra sus entregas con el código que devolvió tu servidor.',
                bullets: [
                    'Firma X-Cord-Signature-V1 con marca de tiempo',
                    'Rotación de secreto con periodo de gracia',
                    'Pausa un endpoint con un interruptor, sin borrarlo',
                ],
                mock: 'wb-webhooks',
            },
            {
                eyebrow: 'SALUD',
                titulo: 'Te enteras antes que tu cliente.',
                copy: 'La pestaña Salud junta lo que puede romper una integración: endpoints con fallos seguidos, eventos en cola o agotados, y las rutas que más errores devuelven. Si un endpoint acumula fallos, lo ves aquí y recibes un aviso antes de que Cord lo desactive.',
                bullets: [
                    'Fallos seguidos por endpoint',
                    'Cola de eventos: pendientes, vencidos y agotados',
                    'Rutas con más errores 4xx y 5xx',
                ],
                mock: 'wb-health',
            },
        ],
        faqs: [
            { q: '¿Qué es el Workbench de Cord?', a: 'Es el panel para desarrolladores de Cord. Se abre dentro de la app y reúne llaves de API, webhooks, el registro de peticiones, los eventos del negocio y la salud de la integración, con un modo de prueba separado.' },
            { q: '¿Qué guarda Cord de cada petición a la API?', a: 'Método, ruta, código de respuesta, latencia, IP, la llave y el entorno. No guarda el cuerpo de la petición ni el de la respuesta, para no almacenar datos de tus clientes fuera de su lugar.' },
            { q: '¿Qué pasa si mi endpoint de webhook deja de responder?', a: 'Cord reintenta cada entrega hasta 11 veces con espera creciente, durante casi cuatro días. Si el endpoint acumula fallos seguidos, lo verás en Salud y recibirás un aviso; tras 5 fallos seguidos Cord lo desactiva para no insistir contra un servidor caído.' },
            { q: '¿Quién puede abrir el Workbench?', a: 'Cualquier miembro de la organización con acceso a Ajustes. Está incluido en todos los planes.' },
        ],
        cta: { titulo: 'Integra con los ojos abiertos.', sub: 'Crea tu cuenta, abre el Workbench y sigue tu primera petición en vivo.' },
    },
    {
        slug: 'mcp',
        nav: 'Servidor MCP',
        eyebrow: 'SERVIDOR MCP',
        titulo: 'Tu negocio, disponible para Claude, Cursor y cualquier agente.',
        sub: 'El servidor MCP de Cord conecta asistentes de IA como Claude o Cursor con los datos reales de tu negocio mediante el Model Context Protocol. Con 19 herramientas, la IA consulta cotizaciones, facturas y cartera vencida, y con una llave de escritura también crea borradores, envía cotizaciones o registra pagos.',
        metaTitle: 'Servidor MCP para Claude y Cursor: cotizaciones y facturas con IA — Cord',
        metaDescription: 'Conecta Claude, Cursor o cualquier cliente MCP a Cord con tu API key. 19 herramientas: 9 de lectura (cotizaciones, facturas, cartera vencida) y 10 de escritura (borradores, envío, pagos). En todos los planes.',
        plan: 'En todos los planes. Usa la misma API key que la API REST; las herramientas de escritura exigen una llave con permiso de escritura.',
        heroMock: 'hero-mcp',
        updated: UPDATED,
        blocks: [
            {
                eyebrow: 'CONEXIÓN',
                titulo: 'Pega un bloque de configuración y listo.',
                copy: 'En Ajustes › MCP copias la configuración exacta para Claude Desktop, para Cursor o la URL directa para cualquier otro cliente. La conexión es https://cordhq.app/api/mcp con tu llave en el header Authorization. Para clientes que necesitan sesión, Cord también expone un canal SSE.',
                bullets: [
                    'JSON-RPC 2.0 sobre HTTP, sin estado',
                    'Canal SSE con sesión en /api/mcp/sse',
                    'La misma llave que ya usas en la API REST',
                ],
                mock: 'mcp-connect',
            },
            {
                eyebrow: 'HERRAMIENTAS',
                titulo: '19 herramientas, cada una con su permiso.',
                copy: 'La IA puede preguntar "¿qué facturas están vencidas?" o "¿cómo va el negocio?" con las 9 herramientas de lectura. Con una llave de escritura puede además crear una cotización o una factura en borrador, enviar una cotización, marcarla como aprobada o pagada, dar de alta un cliente o registrar una promesa de pago.',
                bullets: [
                    'Lectura: cotizaciones, facturas, clientes, productos, eventos y cartera',
                    'Escritura: solo con una llave que tenga ese permiso',
                    'Resultados paginados con next_cursor, igual que la API',
                ],
                mock: 'mcp-tools',
            },
            {
                eyebrow: 'PROBADOR',
                titulo: 'Mira exactamente lo que recibe la IA.',
                copy: 'Antes de configurar un cliente, prueba cualquier herramienta de lectura desde Ajustes › MCP con tus datos reales. Eliges la herramienta, pasas argumentos en JSON y ves la respuesta tal como le llega al modelo. Las de escritura no se ejecutan ahí, para no crear datos por accidente.',
                bullets: [
                    'Corre con tu sesión, sin configurar ninguna llave',
                    'Argumentos opcionales en JSON, por ejemplo {"limit": 5}',
                    'Solo herramientas de lectura',
                ],
                mock: 'mcp-playground',
            },
        ],
        faqs: [
            { q: '¿Qué es el servidor MCP de Cord?', a: 'Es un servidor del Model Context Protocol en https://cordhq.app/api/mcp que expone 19 herramientas sobre los datos de tu negocio. Cualquier cliente MCP, como Claude Desktop o Cursor, puede usarlas autenticándose con tu API key de Cord.' },
            { q: '¿La IA puede modificar mis datos?', a: 'Solo si le das una llave con permiso de escritura. Con una llave de lectura, las 10 herramientas de escritura responden que la acción requiere ese permiso y no ejecutan nada.' },
            { q: '¿Qué puedo preguntarle a Claude sobre mi negocio?', a: 'Cosas como qué facturas están vencidas, cómo va el pipeline, qué pasó con una cotización o cuánto te debe un cliente. Con una llave de escritura también puedes pedirle que arme una cotización en borrador para que la revises antes de enviarla.' },
            { q: '¿Si la IA reintenta, puede duplicar una cotización?', a: 'No. La herramienta crear_cotizacion_borrador acepta un idempotency_key: un reintento con la misma clave devuelve la cotización que ya se creó en vez de hacer otra.' },
            { q: '¿Necesito una llave distinta para MCP?', a: 'No. Es la misma API key de la API REST y va en el mismo header Authorization: Bearer.' },
        ],
        cta: { titulo: 'Pregúntale a tu negocio.', sub: 'Crea tu cuenta, copia la configuración para Claude o Cursor y haz tu primera pregunta.' },
    },
    {
        slug: 'integraciones',
        nav: 'Webhooks e integraciones',
        eyebrow: 'WEBHOOKS · INTEGRACIONES',
        titulo: 'Que tu sistema se entere de cada venta, al momento.',
        sub: 'Los webhooks de Cord avisan a tu servidor cada vez que pasa algo en tu ciclo de venta: una cotización enviada, vista, aprobada o pagada, una factura emitida, un cliente nuevo. Cada aviso es un POST en JSON firmado con HMAC-SHA256, con reintentos automáticos y un historial que puedes revisar en el Workbench.',
        metaTitle: 'Webhooks firmados para cotizaciones y facturas (Zapier, Make, n8n) — Cord',
        metaDescription: '41 eventos de venta —quote.approved, quote.paid, invoice.finalized— enviados como POST firmado con HMAC-SHA256, con 11 reintentos. Conéctalos a tu backend, Zapier, Make o n8n. En todos los planes.',
        plan: 'En todos los planes: 16 endpoints en Gratis, Starter y Profesional, 32 en Scale y 100 en Developer.',
        heroMock: 'hero-webhook',
        updated: UPDATED,
        blocks: [
            {
                eyebrow: 'FIRMA',
                titulo: 'Verifica que el aviso vino de Cord.',
                copy: 'Cada entrega lleva X-Cord-Signature-V1 con una marca de tiempo y el HMAC-SHA256 del cuerpo crudo, firmado con el secreto de tu endpoint. Lo validas en unas pocas líneas antes de procesar el evento, y la marca de tiempo te protege de que alguien reenvíe una entrega vieja.',
                bullets: [
                    'X-Cord-Event-Id para deduplicar sin leer el cuerpo',
                    'X-Cord-Attempt dice qué intento de entrega es',
                    'Durante una rotación firma con el secreto nuevo y el anterior',
                ],
                mock: 'code-verify',
            },
            {
                eyebrow: 'CATÁLOGO',
                titulo: '41 eventos para todo el ciclo de venta.',
                copy: 'No solo cotizaciones. Recibe avisos de facturas finalizadas, enviadas, pagadas o vencidas, de pagos parciales o fallidos, reembolsos, contracargos, depósitos, clientes, productos, tareas y promesas de pago. Suscribe cada endpoint solo a lo que necesita.',
                bullets: [
                    'quote.* · invoice.* · payment.* · refund.* · payout.*',
                    'client.* · product.* · task.* · promise.* · dispute.*',
                    'Los mismos tipos que devuelve GET /api/v1/events',
                ],
                mock: 'event-catalog',
            },
            {
                eyebrow: 'SIN CÓDIGO',
                titulo: 'Zapier, Make y n8n, sin copiar llaves.',
                copy: 'Zapier y Make se conectan con Cord por OAuth: autorizas la app una vez y aparece en el Workbench como conexión autorizada, que puedes revocar cuando quieras. n8n usa una API key. Las tres crean sus propias suscripciones de webhook, con un cupo aparte de 100 que no consume los endpoints de tu equipo.',
                bullets: [
                    'Autorización OAuth para Zapier y Make',
                    'Revoca una app sin tocar tus llaves',
                    'HubSpot, Slack y Microsoft Teams se conectan directo desde Ajustes',
                ],
                mock: 'oauth-apps',
            },
        ],
        faqs: [
            { q: '¿Qué es un webhook de Cord?', a: 'Es un aviso automático: cuando pasa un evento en tu cuenta, como una cotización aprobada o una factura pagada, Cord hace un POST en JSON a la URL que registraste, firmado con HMAC-SHA256 para que verifiques su origen.' },
            { q: '¿Qué pasa si mi servidor no responde?', a: 'Cord reintenta hasta 11 veces con espera creciente durante casi cuatro días, con un timeout de 5 segundos por intento. Tras 3 fallos seguidos recibes un aviso y tras 5 el endpoint se desactiva hasta que lo reactives.' },
            { q: '¿Cómo evito procesar el mismo evento dos veces?', a: 'Usa X-Cord-Event-Id, que también viaja como campo id en el cuerpo. Es el mismo en todos los reintentos de un evento, así que basta con guardar los que ya procesaste.' },
            { q: '¿Cord tiene conector nativo para SAP, Salesforce u Oracle?', a: 'No. La conexión directa existe para HubSpot, Slack y Microsoft Teams, entre otras. Para SAP, Salesforce u Oracle apuntas un webhook a tu backend o a Zapier, Make o n8n, y usas la API REST para escribir de vuelta en Cord.' },
            { q: '¿Cuántos endpoints puedo tener?', a: '16 en Gratis, Starter y Profesional, 32 en Scale y 100 en Developer. Las suscripciones que crean Zapier, Make o n8n tienen un cupo aparte de 100 por organización.' },
        ],
        cta: { titulo: 'Recibe tu primer evento en minutos.', sub: 'Registra un endpoint en el Workbench y usa Probar para ver la entrega llegar.' },
    },
    {
        slug: 'elements',
        nav: 'Cord Elements',
        eyebrow: 'CORD ELEMENTS · COTIZADOR EMBEBIBLE',
        titulo: 'Tu cotizador, dentro del sitio de tu cliente.',
        sub: 'Cord Elements lleva tus cotizaciones y facturas al portal de tus clientes con una línea de código. Ven tu marca, revisan cada partida, aprueban con firma, negocian y pagan, y tu página recibe cada paso como un evento tipado.',
        metaTitle: 'Cord Elements — cotizaciones y facturas embebibles para React, Vue y HTML',
        metaDescription: 'Embebe cotizaciones y facturas en cualquier sitio con una línea: embed.js, los Web Components <cord-quote> y <cord-invoice> o @flouviahq/elements para React, Vue, Framer y Webflow. Aprobación con firma, pago en línea y 11 eventos tipados.',
        plan: 'En todos los planes, incluido Gratis. Desde Starter quitas la marca de Cord en Ajustes › Marca y apariencia. Los dominios donde el cliente puede aprobar y pagar se definen en Ajustes › Cotizador embebible.',
        updated: UPDATED,
        blocks: [
            {
                eyebrow: 'UNA LÍNEA DE CÓDIGO',
                mock: 'el-oneline',
                titulo: 'Pegar. Listo. Sin backend.',
                copy: 'Un script y un <div>. La cotización aparece en un iframe servido por Cord que mide su contenido y ajusta la altura solo. No hay servidor que mantener ni datos que sincronizar: el token público es todo lo que necesitas. Con data-cord-document="invoice" el mismo script muestra una factura.',
                bullets: [
                    'WordPress, Webflow, Shopify o HTML plano: cualquier sitio que acepte un script',
                    'Altura automática: nada de barras de scroll ni cajas vacías',
                    'Aprobar, firmar y pagar solo en los dominios que autorizas; en cualquier otro, solo lectura',
                ],
            },
            {
                eyebrow: 'EVENTOS',
                mock: 'el-events',
                titulo: 'Tu página se entera de cada paso del cliente.',
                copy: 'Cuando el cliente abre, aprueba, rechaza, escribe o paga, el iframe le avisa a tu página con un evento tipado y su detalle. Si el vendedor cambia la cotización o una factura queda pagada, también te enteras. Con React o Vue llegan como callbacks; con el Web Component, como eventos del DOM.',
                bullets: [
                    'onApproved trae signed_by y el hash de la firma',
                    'onUpdated y onStatusChanged mantienen tu página al día; onPaid avisa cuando se salda una factura',
                    'Los eventos van solo al origen de tu sitio; a un sitio no autorizado le llegan sin datos',
                ],
            },
            {
                eyebrow: 'HEADLESS',
                mock: 'el-headless',
                titulo: 'O construye tu propia interfaz sobre nuestro estado.',
                copy: 'Si no quieres nuestro diseño, el núcleo headless te da el estado completo para armar una cotización desde tu UI: partidas, cliente, impuesto por línea, retenciones y total, con el mismo motor que el servidor. Las divisas y tasas salen de tu cuenta de Cord. Tú pones el markup; Cord crea la cotización y te devuelve su link.',
                bullets: [
                    'Publishable key pk_ en el navegador, o tu propio proxy con una sk_',
                    'useQuoteBuilder en React, useCordQuoteBuilder en Vue o createQuoteBuilder sin framework',
                    'baseTheme: "none" para no inyectar ni una línea de CSS',
                ],
            },
        ],
        steps: [
            { titulo: 'Copia tu snippet', copy: 'embed.js para cualquier sitio, o npm install @flouviahq/elements si usas React, Vue, Framer o Webflow.' },
            { titulo: 'Autoriza tu dominio', copy: 'En Ajustes › Cotizador embebible agrega el dominio de tu sitio para que el cliente pueda aprobar y pagar ahí.' },
            { titulo: 'Pasa el token', copy: 'El token público de la cotización. Tu marca y tus datos salen de tu cuenta de Cord.' },
            { titulo: 'Escucha los eventos', copy: 'onApproved, onPay y los demás para redirigir, cobrar o sincronizar tu CRM en tiempo real.' },
        ],
        faqs: [
            { q: '¿Qué es Cord Elements?', a: 'Es el SDK de Cord para mostrar tus cotizaciones y facturas dentro de otro sitio. Incluye un loader de una línea (embed.js), los Web Components <cord-quote>, <cord-invoice> y <cord-fiscal-form>, componentes para React, Vue, Framer y Webflow, y un núcleo headless para armar cotizaciones con tu propia UI. Para tu servidor está @flouviahq/node.' },
            { q: '¿Necesito montar un backend propio?', a: 'No para mostrar una cotización: el iframe habla directo con Cord y basta con el token público. Para crear cotizaciones desde el navegador usas una publishable key (pk_) de alcance acotado; si prefieres no exponer ninguna llave, tu backend hace de proxy con una secret key (sk_).' },
            { q: '¿Puedo usarlo sin la interfaz de Cord?', a: 'Sí. useQuoteBuilder() en React o createQuoteBuilder() sin framework exponen el estado del cotizador (partidas, cliente, totales y envío) sin renderizar nada nuestro, y con baseTheme: "none" el SDK no inyecta CSS.' },
            { q: '¿Quién puede embeber mis cotizaciones?', a: 'Tú decides. En Ajustes › Cotizador embebible defines los dominios autorizados y Cord los aplica con el header frame-ancestors, así que ningún otro sitio puede mostrarlas dentro de un iframe. Sin dominios, cualquier sitio puede mostrar la cotización pero solo en lectura: aprobar, firmar y pagar se hacen en el link público, y los eventos llegan sin datos.' },
            { q: '¿Puedo quitar la marca de Cord?', a: 'Sí, desde el plan Starter, en Ajustes › Marca y apariencia. En el plan Gratis la cotización muestra un aviso discreto de Cord al pie.' },
            { q: '¿El cliente puede pagar desde el embed?', a: 'Sí, cuando tienes Cord Payments activo y el dominio está autorizado. Al pulsar pagar, Cord abre el cobro en una ventana propia: los datos de pago nunca se capturan dentro del iframe de tu sitio. Tu página recibe el evento pay con la URL, solo como aviso.' },
        ],
        cta: { titulo: 'Lleva tu cotizador a donde están tus clientes.', sub: 'Crea tu cuenta gratis y embebe tu primera cotización hoy.' },
    },
    {
        slug: 'fx',
        nav: 'Multi-divisa',
        eyebrow: 'MULTI-DIVISA · TIPO DE CAMBIO',
        titulo: 'Vende en la moneda de tu cliente. Lleva tus libros en la tuya.',
        sub: 'Cord separa la moneda en la que vendes de la moneda en la que llevas tu contabilidad. Cotizas y cobras en dólares o euros, el tipo de cambio se congela al cotizar con una fuente publicada y fechada, y la factura declara esa tasa y el total en tu moneda contable. Si no hay una tasa real, Cord no inventa una.',
        metaTitle: 'Cotizaciones y facturas en varias monedas con tipo de cambio congelado — Cord',
        metaDescription: 'Cotiza en USD o EUR y lleva tus libros en MXN: Cord congela el tipo de cambio 30 días con una fuente publicada (BCE primero) y la factura declara la tasa y el total contable. Disponible por API.',
        plan: 'En todos los planes. La API acepta base_currency, fiscal_currency y fx_buffer_pct al crear una cotización.',
        heroMock: 'hero-fx',
        updated: UPDATED,
        blocks: [
            {
                eyebrow: 'DOS MONEDAS, DOS TRABAJOS',
                titulo: 'La moneda de venta y la contable no se mezclan.',
                copy: 'La moneda de venta es la que ve tu cliente: en ella se capturan los precios, se muestra el link, se cobra y se emite la factura. La contable es la de tus libros. Cuando son distintas, la factura declara el tipo de cambio y el total convertido; nunca se reetiquetan los importes.',
                bullets: [
                    'base_currency: la moneda en la que vendes y cobras',
                    'fiscal_currency: la moneda de tu contabilidad',
                    'La factura devuelve tipo_cambio y total_contable por API',
                ],
                mock: 'fx-invoice',
            },
            {
                eyebrow: 'TASA CONGELADA',
                titulo: 'El margen no se mueve a mitad de la negociación.',
                copy: 'Al crear la cotización, Cord toma la tasa del día y la congela durante 30 días. Puedes sumarle un colchón con fx_buffer_pct para cubrirte de la volatilidad de ese cliente. Esa tasa es la que usa después la factura: no hay tres cálculos distintos para la misma venta.',
                bullets: [
                    'Colchón por cotización, no uno fijo para toda la cuenta',
                    'La misma tasa en la cotización, el cobro y la factura',
                    'Una tasa en caché solo vale si tiene menos de 24 horas',
                ],
                mock: 'code-fx',
            },
            {
                eyebrow: 'FUENTES',
                titulo: 'Si ninguna fuente publica el par, Cord se detiene.',
                copy: 'Cord consulta primero la referencia diaria del Banco Central Europeo. Como publica unas 30 divisas, para pares como COP, CLP, PEN o ARS pasa a dos fuentes de cobertura amplia. Si ninguna tiene el par, la cotización no se crea y el mensaje dice por qué. Una tasa de 1.0 inventada nunca llega a tu factura.',
                bullets: [
                    'Banco Central Europeo como primera referencia',
                    'Dos fuentes de respaldo para divisas latinoamericanas',
                    '"Esta fuente no cubre el par" y "no hubo respuesta" se tratan distinto',
                ],
                mock: 'fx-sources',
            },
        ],
        faqs: [
            { q: '¿Qué fuente usa Cord para el tipo de cambio?', a: 'Primero la referencia diaria del Banco Central Europeo, vía Frankfurter. Para divisas que el BCE no publica, como COP, CLP, PEN o ARS, consulta en orden dos fuentes de cobertura amplia. Si ninguna tiene el par, la operación se detiene con un mensaje claro.' },
            { q: '¿Cuánto tiempo se congela la tasa?', a: '30 días desde que se crea la cotización. Durante ese tiempo la tasa no cambia aunque el mercado se mueva.' },
            { q: '¿Puedo cotizar en dólares y facturar en pesos?', a: 'Puedes cotizar, cobrar y facturar en dólares mientras tu contabilidad va en pesos: la factura declara el tipo de cambio congelado y el total en tu moneda contable. En México, el CFDI se emite en la moneda de la venta con su tipo de cambio.' },
            { q: '¿Qué pasa si no hay tipo de cambio disponible?', a: 'Cord no crea la cotización y responde con un error claro (503 en la API). Usa una tasa en caché solo si tiene menos de 24 horas; nunca sustituye por 1.0 ni por una estimación.' },
        ],
        cta: { titulo: 'Vende en cualquier moneda sin perder el margen.', sub: 'Crea tu cuenta y cotiza en dólares o euros con la tasa congelada.' },
    },
    {
        slug: 'fiscal',
        nav: 'Facturación fiscal',
        eyebrow: 'FACTURACIÓN FISCAL',
        titulo: 'Facturas legales en México, comerciales en el resto, por API.',
        sub: 'Cord Invoicing emite facturas desde la app o por API y adapta el documento al país de tu negocio: CFDI 4.0 timbrado ante el SAT en México, y factura comercial con los impuestos de cada país en el resto. España cuenta con el registro Verifactu construido y en proceso de activación ante la AEAT.',
        metaTitle: 'API de facturación: CFDI 4.0 en México y facturas por país — Cord',
        metaDescription: 'Crea, emite y cobra facturas por API: CFDI 4.0 timbrado ante el SAT en México, impuestos por línea y por país, pagos parciales y notas de crédito. Verifactu construido para España.',
        plan: 'La emisión fiscal está disponible desde el plan Starter donde está habilitada. Gratis emite documentos comerciales.',
        heroMock: 'hero-fiscal',
        updated: UPDATED,
        blocks: [
            {
                eyebrow: 'CICLO COMPLETO',
                titulo: 'Crea, emite, cobra y corrige desde tu código.',
                copy: 'POST /api/v1/facturas crea un borrador. Después, sobre la misma factura, emites, envías con el PDF adjunto, registras un pago total o parcial, anulas o generas una nota de crédito. Cada acción dispara su evento, así que tu sistema puede reaccionar por webhook.',
                bullets: [
                    'Borrador primero: nada se timbra hasta que emites',
                    'Pagos parciales acotados al saldo real',
                    'invoice.finalized, invoice.paid e invoice.voided como webhooks',
                ],
                mock: 'code-invoice',
            },
            {
                eyebrow: 'FACTURAS EN LA APP',
                titulo: 'Tu equipo ve lo mismo que tu integración.',
                copy: 'Lo que creas por API aparece en Facturas con su estado comercial y fiscal: por cobrar, vencida, pagada o anulada, y si hubo un error al emitir. Por cobrar, vencido y cobrado del mes se calculan solos.',
                bullets: [
                    'Estado comercial y estado fiscal separados',
                    'Saldo y vencimiento de cada factura',
                    'Exportación a CSV y facturas recurrentes',
                ],
                mock: 'app-invoices',
            },
            {
                eyebrow: 'POR PAÍS',
                titulo: 'El documento correcto para cada país.',
                copy: 'En México, Cord timbra CFDI 4.0 ante el SAT con tu Certificado de Sello Digital, a través de un proveedor autorizado. En el resto de los países emite una factura comercial con los impuestos por línea de ese país, como el sales tax por estado en Estados Unidos o el IVA e IRPF en España. Para España, el registro Verifactu con huella SHA-256 encadenada está construido y verificado contra los ejemplos oficiales de la AEAT; se activa en cuanto concluya el alta ante la AEAT.',
                bullets: [
                    'México: CFDI 4.0 con UUID del SAT, PDF y XML',
                    'Impuestos y retenciones por línea, no una tasa plana',
                    'España: Verifactu construido, pendiente de activación ante la AEAT',
                ],
                mock: 'fiscal-countries',
            },
        ],
        faqs: [
            { q: '¿Cord timbra CFDI 4.0 real?', a: 'Sí. En México, Cord timbra CFDI 4.0 ante el SAT con tu Certificado de Sello Digital a través de un proveedor autorizado (PAC), y te entrega el UUID, el PDF y el XML.' },
            { q: '¿Puedo emitir facturas por API?', a: 'Sí. POST /api/v1/facturas crea un borrador y POST /api/v1/facturas/{id} con action finalize lo emite. La misma ruta acepta send, payment, void y credit_note.' },
            { q: '¿Cord emite facturas fiscales en Estados Unidos?', a: 'Cord emite facturas comerciales con sales tax por estado. Estados Unidos no tiene un sistema nacional de factura electrónica como el CFDI, así que la factura comercial es el documento habitual.' },
            { q: '¿Cord ya registra facturas ante la AEAT con Verifactu?', a: 'Todavía no. El registro Verifactu está construido y verificado contra los ejemplos oficiales de la AEAT, pero su activación depende del alta de Cord como productor del software ante la AEAT. Mientras tanto, en España las facturas se emiten como comerciales.' },
            { q: '¿Qué pasa si hay un error al emitir?', a: 'La factura queda con el estado fiscal "error" y no se marca como emitida. Lo ves en la app y en la API, y puedes corregir los datos y volver a emitir.' },
        ],
        cta: { titulo: 'Factura desde tu sistema, con el documento correcto.', sub: 'Crea tu cuenta, configura tus datos fiscales y emite tu primera factura por API.' },
    },
];

export const findDevPage = (slug: string) => DEV_PAGES.find((p) => p.slug === slug);
