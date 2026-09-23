import type { IntegrationLandingSlug } from './integraciones-landing';

export interface IntegrationFact { valor: string; texto: string }
export interface IntegrationChip { titulo: string; linea: string; monto?: string }

interface StoryCopy { datos: IntegrationFact[]; chip: IntegrationChip }

export interface IntegrationStory {
    brand: { from: string; to: string; accent: string };
    shot: { x: string; y: string };
    es: StoryCopy;
    en: StoryCopy;
}

export const INTEGRATION_STORY: Record<IntegrationLandingSlug, IntegrationStory> = {
    hubspot: {
        brand: { from: '#ff7a59', to: '#7a2410', accent: '#ff5c35' },
        shot: { x: '8%', y: '12%' },
        es: {
            datos: [
                { valor: '3 objetos', texto: 'Empresas, Contactos y Deals. Cord no toca nada más de tu cuenta.' },
                { valor: '7 estados', texto: 'de la cotización, cada uno con su etapa en tu pipeline.' },
                { valor: '2 sentidos', texto: 'las correcciones de contacto en HubSpot también llegan a Cord.' },
                { valor: 'Gratis', texto: 'incluida en todos los planes de Cord.' },
            ],
            chip: { titulo: 'Deal movido a Aprobada', linea: 'COT-0152 · Aceros del Norte', monto: '$184,300.00 MXN' },
        },
        en: {
            datos: [
                { valor: '3 objects', texto: 'Companies, Contacts and Deals. Cord touches nothing else in your account.' },
                { valor: '7 statuses', texto: 'of the quote, each with its stage in your pipeline.' },
                { valor: 'Both ways', texto: 'contact fixes made in HubSpot reach Cord too.' },
                { valor: 'Free', texto: 'included in every Cord plan.' },
            ],
            chip: { titulo: 'Deal moved to Approved', linea: 'COT-0152 · Aceros del Norte', monto: '$184,300.00 MXN' },
        },
    },
    shopify: {
        brand: { from: '#95bf47', to: '#3c5a20', accent: '#5e8e3e' },
        shot: { x: '7%', y: '11%' },
        es: {
            datos: [
                { valor: '2 permisos', texto: 'leer productos y leer clientes. Cord no escribe en tu tienda.' },
                { valor: 'Por variante', texto: 'cada talla o presentación entra con su precio y su SKU.' },
                { valor: 'Segundos', texto: 'tarda un cambio de Shopify en verse en Cord.' },
                { valor: 'Gratis', texto: 'incluida en todos los planes de Cord.' },
            ],
            chip: { titulo: 'Catálogo sincronizado', linea: '248 productos · 96 clientes', monto: 'mi-tienda.myshopify.com' },
        },
        en: {
            datos: [
                { valor: '2 permissions', texto: 'read products and read customers. Cord never writes to your store.' },
                { valor: 'Per variant', texto: 'every size or format comes in with its price and SKU.' },
                { valor: 'Seconds', texto: 'is how long a Shopify change takes to show up in Cord.' },
                { valor: 'Free', texto: 'included in every Cord plan.' },
            ],
            chip: { titulo: 'Catalog synced', linea: '248 products · 96 customers', monto: 'my-store.myshopify.com' },
        },
    },
    'mercado-pago': {
        brand: { from: '#2bb5f0', to: '#063f73', accent: '#009ee3' },
        shot: { x: '5%', y: '10%' },
        es: {
            datos: [
                { valor: '6 países', texto: 'México, Brasil, Colombia, Argentina, Chile y Perú.' },
                { valor: '1 link', texto: 'tu cliente aprueba y paga en la misma página.' },
                { valor: 'Directo', texto: 'el dinero llega a tu cuenta de Mercado Pago, nunca a la de Cord.' },
                { valor: 'Verificado', texto: 'solo un pago aprobado en tu cuenta marca el cobro como pagado.' },
            ],
            chip: { titulo: 'Pago aprobado', linea: 'COT-0148 · Distribuidora del Bajío', monto: '$48,720.00 MXN' },
        },
        en: {
            datos: [
                { valor: '6 countries', texto: 'Mexico, Brazil, Colombia, Argentina, Chile and Peru.' },
                { valor: '1 link', texto: 'your client approves and pays on the same page.' },
                { valor: 'Direct', texto: 'the money reaches your Mercado Pago account, never Cord\'s.' },
                { valor: 'Verified', texto: 'only an approved payment in your account marks the charge as paid.' },
            ],
            chip: { titulo: 'Payment approved', linea: 'COT-0148 · Distribuidora del Bajío', monto: '$48,720.00 MXN' },
        },
    },
    slack: {
        brand: { from: '#7c3a7e', to: '#2a0a2c', accent: '#611f69' },
        shot: { x: '6%', y: '8%' },
        es: {
            datos: [
                { valor: '6 avisos', texto: 'vista, aprobada, rechazada, pago recibido, por vencer y pago vencido.' },
                { valor: '3 días', texto: 'antes de su vigencia llega el aviso de cotización por vencer.' },
                { valor: '1 canal', texto: 'Cord solo publica ahí y no lee tu espacio de trabajo.' },
                { valor: 'Gratis', texto: 'incluida en todos los planes de Cord.' },
            ],
            chip: { titulo: '#ventas', linea: 'COT-0152 aprobada · Aceros del Norte', monto: '$184,300.00 MXN' },
        },
        en: {
            datos: [
                { valor: '6 alerts', texto: 'viewed, approved, rejected, payment received, expiring and overdue.' },
                { valor: '3 days', texto: 'before it expires, the expiring quote alert arrives.' },
                { valor: '1 channel', texto: 'Cord only posts there and does not read your workspace.' },
                { valor: 'Free', texto: 'included in every Cord plan.' },
            ],
            chip: { titulo: '#sales', linea: 'COT-0152 approved · Aceros del Norte', monto: '$184,300.00 MXN' },
        },
    },
    zapier: {
        brand: { from: '#ff7a3d', to: '#6b1d00', accent: '#ff4f00' },
        shot: { x: '7%', y: '10%' },
        es: {
            datos: [
                { valor: '1 clic', texto: 'para autorizar, sin crear ni pegar llaves de API.' },
                { valor: 'Instantáneo', texto: 'el Zap arranca en cuanto pasa algo en Cord.' },
                { valor: '100 webhooks', texto: 'de cupo propio por organización, aparte de los de tu plan.' },
                { valor: 'Gratis', texto: 'incluida en todos los planes de Cord.' },
            ],
            chip: { titulo: 'Cotización pagada', linea: 'Nuevo renglón en Google Sheets' },
        },
        en: {
            datos: [
                { valor: '1 click', texto: 'to authorize, with no API key to create or paste.' },
                { valor: 'Instant', texto: 'the Zap starts the moment something happens in Cord.' },
                { valor: '100 webhooks', texto: 'of their own per organization, apart from your plan\'s.' },
                { valor: 'Free', texto: 'included in every Cord plan.' },
            ],
            chip: { titulo: 'Quote paid', linea: 'New row in Google Sheets' },
        },
    },
    make: {
        brand: { from: '#a142f4', to: '#2c0660', accent: '#6d00cc' },
        shot: { x: '6%', y: '11%' },
        es: {
            datos: [
                { valor: '1 clic', texto: 'para autorizar, sin llaves que pegar.' },
                { valor: '4 tipos', texto: 'de módulo: disparador, acciones, búsquedas y Make an API Call.' },
                { valor: 'Todas', texto: 'las zonas de Make: la autorización regresa a la tuya.' },
                { valor: 'Gratis', texto: 'incluida en todos los planes de Cord.' },
            ],
            chip: { titulo: 'Watch Events', linea: 'quote.approved · COT-0152' },
        },
        en: {
            datos: [
                { valor: '1 click', texto: 'to authorize, with no key to paste.' },
                { valor: '4 kinds', texto: 'of module: trigger, actions, searches and Make an API Call.' },
                { valor: 'Every', texto: 'Make zone: the authorization returns to yours.' },
                { valor: 'Free', texto: 'included in every Cord plan.' },
            ],
            chip: { titulo: 'Watch Events', linea: 'quote.approved · COT-0152' },
        },
    },
    n8n: {
        brand: { from: '#f0708f', to: '#5c0f24', accent: '#ea4b71' },
        shot: { x: '5%', y: '9%' },
        es: {
            datos: [
                { valor: 'Firmado', texto: 'cada entrega se verifica antes de arrancar el flujo.' },
                { valor: 'Automático', texto: 'el webhook se registra al activar y se borra al desactivar.' },
                { valor: '3 recursos', texto: 'clientes, cotizaciones y tareas desde el nodo Cord.' },
                { valor: 'npm', texto: 'paquete publicado con constancia de origen.' },
            ],
            chip: { titulo: 'Cord Trigger', linea: 'Firma verificada · quote.approved' },
        },
        en: {
            datos: [
                { valor: 'Signed', texto: 'every delivery is verified before the flow starts.' },
                { valor: 'Automatic', texto: 'the webhook is registered on activate and deleted on deactivate.' },
                { valor: '3 resources', texto: 'clients, quotes and tasks from the Cord node.' },
                { valor: 'npm', texto: 'package published with provenance.' },
            ],
            chip: { titulo: 'Cord Trigger', linea: 'Signature verified · quote.approved' },
        },
    },
    teams: {
        brand: { from: '#7b83eb', to: '#1f2266', accent: '#5b5fc7' },
        shot: { x: '7%', y: '10%' },
        es: {
            datos: [
                { valor: '6 avisos', texto: 'vista, aprobada, rechazada, pagada, por vencer y pago vencido.' },
                { valor: '1 URL', texto: 'la del flujo de Power Automate de tu canal.' },
                { valor: '3 canales', texto: 'correo, Slack y Teams, cada uno por separado.' },
                { valor: 'Gratis', texto: 'incluida en todos los planes de Cord.' },
            ],
            chip: { titulo: 'Cotización aprobada', linea: 'COT-0152 · Aceros del Norte', monto: '$184,300.00 MXN' },
        },
        en: {
            datos: [
                { valor: '6 alerts', texto: 'viewed, approved, rejected, paid, expiring and overdue.' },
                { valor: '1 URL', texto: 'the one from your channel\'s Power Automate flow.' },
                { valor: '3 channels', texto: 'email, Slack and Teams, each one on its own.' },
                { valor: 'Free', texto: 'included in every Cord plan.' },
            ],
            chip: { titulo: 'Quote approved', linea: 'COT-0152 · Aceros del Norte', monto: '$184,300.00 MXN' },
        },
    },
    whatsapp: {
        brand: { from: '#2fb56a', to: '#053d2b', accent: '#128c7e' },
        shot: { x: '8%', y: '10%' },
        es: {
            datos: [
                { valor: 'Tu número', texto: 'los mensajes salen de tu cuenta de WhatsApp Business.' },
                { valor: 'Plantilla', texto: 'aprobada por Meta, con datos del evento en cada variable.' },
                { valor: '60 por hora', texto: 'mensajes por cuenta desde tus workflows.' },
                { valor: 'Sin costo en Cord', texto: 'Meta cobra cada conversación a tu cuenta.' },
            ],
            chip: { titulo: 'Recordatorio de cotización', linea: 'COT-0152 · vence 2026-09-26', monto: '$184,300.00 MXN' },
        },
        en: {
            datos: [
                { valor: 'Your number', texto: 'messages go out from your WhatsApp Business account.' },
                { valor: 'Template', texto: 'approved by Meta, with event data in each variable.' },
                { valor: '60 an hour', texto: 'messages per account from your workflows.' },
                { valor: 'No Cord fee', texto: 'Meta bills each conversation to your account.' },
            ],
            chip: { titulo: 'Quote reminder', linea: 'COT-0152 · due 2026-09-26', monto: '$184,300.00 MXN' },
        },
    },
};
