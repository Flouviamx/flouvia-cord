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
        nav: 'MCP para IA',
        eyebrow: 'MCP · INTELIGENCIA ARTIFICIAL',
        titulo: 'Habla con tu negocio.<br/>En lenguaje natural.',
        sub: 'MCP (Model Context Protocol) es la evolución de la API: deja que una inteligencia artificial como Claude entienda tus datos. En vez de programar, preguntas — y la IA consulta tu cartera, arma cotizaciones y te avisa qué cobrar.',
        plan: 'Plan Negocio · usa la misma API key',
        stats: [
            { valor: '7', countup: 7, label: 'herramientas que la IA puede usar sobre tu negocio' },
            { valor: '0', countup: 0, label: 'líneas de código para conectarlo' },
            { valor: '1', countup: 1, label: 'minuto para configurarlo en tu cliente de IA' },
        ],
        blocks: [
            {
                eyebrow: '¿QUÉ ES MCP?',
                titulo: 'No es un chatbot.<br/>Es tu negocio, con contexto.',
                copy: 'Mientras una API la usan programadores, el MCP lo usa una IA directamente. Conectas Cord a un asistente como Claude y este puede leer tu base de datos para responder con números reales: "Tienes 3 facturas en riesgo de impago, ¿les mando recordatorio?".',
                bullets: [
                    'La IA ve tus datos en vivo — no inventa, consulta',
                    'Funciona en clientes compatibles con MCP (como Claude)',
                    'Mismas llaves y permisos que la API: tú controlas el acceso',
                ],
            },
            {
                eyebrow: 'LO QUE PUEDE HACER',
                titulo: 'Pregunta como le hablarías<br/>a tu mejor analista.',
                copy: 'La IA tiene herramientas para consultar y actuar: revisar el pipeline, encontrar lo vencido, buscar un cliente, leer el catálogo y hasta armar una cotización en borrador. Tú decides cuáles permites según el scope de la llave.',
                bullets: [
                    '"¿Cómo va el negocio este mes?" → resumen_negocio',
                    '"¿Qué facturas están vencidas?" → cartera_vencida',
                    '"Arma una cotización para ACME de 50 sacos" → crear_cotizacion_borrador',
                ],
                code: {
                    label: 'Herramientas disponibles',
                    body: `listar_cotizaciones      detalle_cotizacion
cartera_vencida          resumen_negocio
buscar_cliente           listar_productos
crear_cotizacion_borrador`,
                },
            },
            {
                eyebrow: 'CONECTARLO',
                titulo: 'Un servidor. Una URL.<br/>Tu llave de siempre.',
                copy: 'Agrega Cord como servidor MCP en tu cliente de IA con la URL y tu API key en el header. Listo: la IA ya puede trabajar con tu negocio. Sin instalar nada, sin servidores que mantener.',
                bullets: [
                    'Transporte HTTP estándar (JSON-RPC) — sin estado',
                    'Autenticación por Authorization: Bearer',
                    'Las acciones quedan registradas en tu bitácora de auditoría',
                ],
                code: {
                    label: 'Configuración del cliente MCP',
                    body: `{
  "mcpServers": {
    "cord": {
      "url": "https://cord.flouvia.com/api/mcp",
      "headers": {
        "Authorization": "Bearer sk_live_xxxx"
      }
    }
  }
}`,
                },
            },
        ],
        steps: [
            { titulo: 'Genera tu llave', copy: 'La misma API key de Ajustes › Developers › API. Una llave sirve para API y MCP.' },
            { titulo: 'Conecta el servidor', copy: 'Agrega https://cord.flouvia.com/api/mcp en tu cliente MCP con el header de autorización.' },
            { titulo: 'Pregunta', copy: 'Habla con tu negocio en lenguaje natural — la IA usa las herramientas por ti.' },
        ],
        cta: { titulo: 'Dale a la IA acceso a tu negocio.', sub: 'Conéctalo en un minuto con la misma llave de la API.' },
    },
];

export const findDevPage = (slug: string) => DEV_PAGES.find((p) => p.slug === slug);
