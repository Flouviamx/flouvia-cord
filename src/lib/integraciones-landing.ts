import { BRAND_LOGOS } from './integraciones/catalogo';

export type IntegrationLandingSlug = 'hubspot' | 'shopify' | 'mercado-pago' | 'slack' | 'zapier' | 'make' | 'n8n' | 'teams' | 'whatsapp' | 'gmail' | 'google-sheets' | 'excel' | 'quickbooks' | 'xero';
export type IntegrationLandingCategory = 'crm' | 'ecommerce' | 'cobros' | 'contabilidad' | 'productividad' | 'comunicacion' | 'automatizacion';

export interface IntegrationFlow { cord: string; app: string; dir: string }
export interface IntegrationBlock { eyebrow: string; titulo: string; copy: string; bullets: string[] }
export interface IntegrationStep { name: string; text: string }
export interface IntegrationLink { label: string; href: string }

export interface IntegrationCopy {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    titulo: string;
    sub: string;
    resumen: string;
    plan: string;
    flujoTitulo: string;
    flujo: IntegrationFlow[];
    blocks: IntegrationBlock[];
    pasos: IntegrationStep[];
    limites: string[];
    faqs: { q: string; a: string }[];
    guias: IntegrationLink[];
    cta: { titulo: string; sub: string };
}

export interface IntegrationLanding {
    slug: IntegrationLandingSlug;
    nombre: string;
    dominio: string;
    logo: string;
    categoria: IntegrationLandingCategory;
    related: IntegrationLandingSlug[];
    producto: string;
    es: IntegrationCopy;
    en: IntegrationCopy;
}

const DOCS = 'https://docs.cordhq.app/docs';
const DOCS_EN = 'https://docs.cordhq.app/en/docs';

export const CATEGORY_LABEL: Record<IntegrationLandingCategory, { es: string; en: string }> = {
    crm: { es: 'CRM', en: 'CRM' },
    ecommerce: { es: 'Comercio electrónico', en: 'E-commerce' },
    cobros: { es: 'Cobros', en: 'Payments' },
    comunicacion: { es: 'Comunicación', en: 'Communication' },
    automatizacion: { es: 'Automatización', en: 'Automation' },
    contabilidad: { es: 'Contabilidad', en: 'Accounting' },
    productividad: { es: 'Productividad', en: 'Productivity' },
};

export const INTEGRATION_PAGES: IntegrationLanding[] = [
    {
        slug: 'hubspot',
        nombre: 'HubSpot',
        dominio: 'hubspot.com',
        logo: BRAND_LOGOS.hubspot,
        categoria: 'crm',
        related: ['slack', 'zapier', 'make'],
        producto: 'seguimiento',
        es: {
            metaTitle: 'Integración con HubSpot: clientes y Deals sincronizados | Cord',
            metaDescription: 'Conecta HubSpot en un clic: cada cliente de Cord llega como Empresa y Contacto, cada cotización enviada como Deal que avanza de etapa solo, y los cambios de contacto regresan a Cord.',
            eyebrow: 'INTEGRACIÓN · HUBSPOT',
            titulo: 'HubSpot y Cord, con los mismos clientes y las mismas ventas.',
            sub: 'Tus clientes y cotizaciones de Cord, al día en HubSpot sin capturarlos dos veces. El Deal nace cuando envías la cotización y avanza solo cuando tu cliente la abre, la aprueba o la paga.',
            resumen: 'Clientes, contactos y Deals sincronizados con tus cotizaciones.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Qué viaja entre Cord y HubSpot',
            flujo: [
                { cord: 'Cliente (empresa)', app: 'Empresa', dir: 'Cord → HubSpot; el nombre regresa' },
                { cord: 'Contacto, correo y teléfono', app: 'Contacto asociado a la Empresa', dir: 'En los dos sentidos' },
                { cord: 'Cotización enviada', app: 'Deal con monto y divisa', dir: 'Cord → HubSpot' },
                { cord: 'Estado de la cotización', app: 'Etapa del Deal', dir: 'Cord → HubSpot' },
            ],
            blocks: [
                {
                    eyebrow: 'CLIENTES EN LOS DOS SENTIDOS',
                    titulo: 'Corrige un correo en HubSpot y también cambia en Cord.',
                    copy: 'Cada cliente de Cord se crea en HubSpot como Empresa y, si tiene correo o nombre de contacto, también como Contacto asociado. Antes de crear un Contacto, Cord busca uno con el mismo correo para no duplicarlo. Si alguien corrige en HubSpot el nombre de la Empresa, o el nombre, correo o teléfono del Contacto, el cambio llega a Cord al momento.',
                    bullets: [
                        'Sin contactos duplicados: se busca por correo antes de crear',
                        'Solo regresan cambios de clientes ya vinculados',
                        'Un campo vacío en HubSpot no borra el dato en Cord',
                    ],
                },
                {
                    eyebrow: 'EL DEAL AVANZA SOLO',
                    titulo: 'Tu pipeline refleja lo que hizo el cliente, no lo que alguien recordó mover.',
                    copy: 'Cada cotización enviada se crea como Deal con su monto y su divisa, asociado a la Empresa y al Contacto. Cord lo mueve de etapa cuando el cliente abre la cotización, la aprueba, la rechaza, vence, la paga o se factura. Tú eliges el pipeline y la etapa de cada estado; si usas el pipeline predeterminado, Cord ya propone una.',
                    bullets: [
                        'Los borradores no se envían: el Deal nace con la cotización enviada',
                        'Siete estados con su etapa: enviada, vista, aprobada, rechazada, vencida, pagada y facturada',
                        'La fecha de cierre se escribe solo al llegar a un estado final',
                    ],
                },
                {
                    eyebrow: 'PERMISOS MÍNIMOS',
                    titulo: 'Cord solo toca Empresas, Contactos y Deals.',
                    copy: 'Al autorizar, HubSpot te muestra exactamente lo que Cord pide: leer y escribir Empresas, Contactos y Deals. Cord no lee tus correos, llamadas, tickets, listas ni formularios. El acceso se guarda cifrado y, al desconectar, Cord revoca su autorización en tu cuenta de HubSpot. Cada conexión, sincronización o desconexión queda en la auditoría de tu cuenta.',
                    bullets: [
                        'Autorización en la propia página de HubSpot, sin contraseñas',
                        'Una cuenta de HubSpot por organización de Cord',
                        'Desde tus workflows, una nota en HubSpot cuando el cliente aprueba',
                    ],
                },
            ],
            pasos: [
                { name: 'Abre la integración', text: 'En Cord, ve a Ajustes › Integraciones y toca HubSpot. Necesitas el permiso de Ajustes.' },
                { name: 'Conecta HubSpot', text: 'Pulsa Conectar HubSpot, elige la cuenta y acepta los permisos. En HubSpot necesitas un usuario que pueda instalar apps.' },
                { name: 'Revisa las etapas', text: 'Confirma el pipeline y la etapa de HubSpot para cada estado de la cotización y guarda.' },
                { name: 'Envía lo que ya tenías', text: 'Si quieres, pulsa Enviar datos existentes para mandar tus clientes y cotizaciones anteriores. Desde ahí, todo lo nuevo se envía solo.' },
            ],
            limites: [
                'Mover un Deal de etapa en HubSpot no cambia la cotización en Cord: el estado de la venta lo deciden la aprobación y el pago del cliente.',
                'Crear una Empresa o un Contacto nuevo en HubSpot no crea un cliente en Cord.',
                'Cord no busca Empresas existentes por nombre: revisa duplicados después de enviar tus datos existentes.',
                'Un Deal en una divisa que tu cuenta de HubSpot no tiene activada no se puede crear.',
            ],
            faqs: [
                {
                    q: '¿Qué necesito para conectar HubSpot con Cord?',
                    a: 'En Cord, el permiso de Ajustes. En HubSpot, un usuario que pueda instalar apps en la cuenta; si no lo tienes, pide a un Super Admin de HubSpot que haga la conexión. La integración está incluida en todos los planes de Cord, desde Gratis.',
                },
                {
                    q: '¿Si muevo un Deal en HubSpot cambia la cotización en Cord?',
                    a: 'No. Cord manda sobre el estado de la venta: mover un Deal de etapa, cambiar su monto o borrarlo en HubSpot no cambia nada en Cord. Lo que sí regresa son las correcciones de nombre, correo y teléfono de clientes ya vinculados.',
                },
                {
                    q: '¿La integración duplica mis contactos?',
                    a: 'No duplica contactos: antes de crear uno, Cord busca en HubSpot un Contacto con el mismo correo y, si existe, lo usa. Con las Empresas es distinto: cada cliente de Cord crea su propia Empresa, así que si ya la tenías capturada en HubSpot puedes terminar con dos.',
                },
                {
                    q: '¿Qué permisos pide Cord en HubSpot?',
                    a: 'Solo leer y escribir Empresas, Contactos y Deals. Cord no lee correos, llamadas, tickets, listas, formularios ni ningún otro objeto de HubSpot.',
                },
                {
                    q: '¿Puedo conectar varias cuentas de HubSpot?',
                    a: 'Cada organización de Cord se conecta a una sola cuenta de HubSpot, y una cuenta de HubSpot solo puede estar conectada a una organización. Para cambiar de cuenta, desconecta la actual y conecta la nueva; Cord restablece las etapas porque los pipelines de la otra cuenta no existen en la nueva.',
                },
            ],
            guias: [
                { label: 'Conectar HubSpot', href: `${DOCS}/automatizacion/integraciones/hubspot` },
                { label: 'Qué se sincroniza', href: `${DOCS}/automatizacion/integraciones/hubspot-sincronizacion` },
                { label: 'Pipeline y etapas', href: `${DOCS}/automatizacion/integraciones/hubspot-etapas` },
                { label: 'Problemas con HubSpot', href: `${DOCS}/automatizacion/integraciones/hubspot-problemas` },
            ],
            cta: { titulo: 'Tu CRM al día, sin capturar dos veces.', sub: 'Conecta HubSpot desde Ajustes y deja que cada cotización mueva su Deal. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'HubSpot integration: synced clients and Deals | Cord',
            metaDescription: 'Connect HubSpot in one click: every Cord client arrives as a Company and Contact, every sent quote as a Deal that moves stages on its own, and contact changes flow back to Cord.',
            eyebrow: 'INTEGRATION · HUBSPOT',
            titulo: 'HubSpot and Cord, with the same clients and the same sales.',
            sub: 'Your Cord clients and quotes, up to date in HubSpot without entering them twice. The Deal is born when you send the quote and moves on its own when your client opens, approves or pays it.',
            resumen: 'Clients, contacts and Deals synced with your quotes.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'What travels between Cord and HubSpot',
            flujo: [
                { cord: 'Client (company)', app: 'Company', dir: 'Cord → HubSpot; the name comes back' },
                { cord: 'Contact, email and phone', app: 'Contact associated with the Company', dir: 'Both ways' },
                { cord: 'Sent quote', app: 'Deal with amount and currency', dir: 'Cord → HubSpot' },
                { cord: 'Quote status', app: 'Deal stage', dir: 'Cord → HubSpot' },
            ],
            blocks: [
                {
                    eyebrow: 'CLIENTS BOTH WAYS',
                    titulo: 'Fix an email in HubSpot and it changes in Cord too.',
                    copy: 'Every Cord client is created in HubSpot as a Company and, if it has an email or contact name, as an associated Contact too. Before creating a Contact, Cord looks for one with the same email so it is not duplicated. If someone corrects the Company name, or the Contact name, email or phone in HubSpot, the change reaches Cord right away.',
                    bullets: [
                        'No duplicate contacts: Cord searches by email before creating',
                        'Only changes to already-linked clients come back',
                        'An empty field in HubSpot does not erase the value in Cord',
                    ],
                },
                {
                    eyebrow: 'THE DEAL MOVES ON ITS OWN',
                    titulo: 'Your pipeline shows what the client did, not what someone remembered to move.',
                    copy: 'Every sent quote is created as a Deal with its amount and currency, associated with the Company and the Contact. Cord moves its stage when the client opens the quote, approves it, rejects it, it expires, it is paid or it is invoiced. You pick the pipeline and the stage for each status; on the default pipeline Cord already suggests one.',
                    bullets: [
                        'Drafts are not sent: the Deal is born with the sent quote',
                        'Seven statuses with their stage: sent, viewed, approved, rejected, expired, paid and invoiced',
                        'The close date is written only when a final status is reached',
                    ],
                },
                {
                    eyebrow: 'MINIMUM PERMISSIONS',
                    titulo: 'Cord only touches Companies, Contacts and Deals.',
                    copy: 'When you authorize, HubSpot shows exactly what Cord asks for: read and write Companies, Contacts and Deals. Cord does not read your emails, calls, tickets, lists or forms. Access is stored encrypted and, when you disconnect, Cord revokes its authorization in your HubSpot account. Every connection, sync or disconnection is recorded in your account audit log.',
                    bullets: [
                        'Authorization on HubSpot\'s own page, no passwords',
                        'One HubSpot account per Cord organization',
                        'From your workflows, a HubSpot note when the client approves',
                    ],
                },
            ],
            pasos: [
                { name: 'Open the integration', text: 'In Cord, go to Settings › Integrations and tap HubSpot. You need the Settings permission.' },
                { name: 'Connect HubSpot', text: 'Press Connect HubSpot, pick the account and accept the permissions. In HubSpot you need a user who can install apps.' },
                { name: 'Review the stages', text: 'Confirm the HubSpot pipeline and stage for each quote status and save.' },
                { name: 'Send what you already had', text: 'Optionally press Send existing data to push your earlier clients and quotes. From then on, everything new is sent automatically.' },
            ],
            limites: [
                'Moving a Deal stage in HubSpot does not change the quote in Cord: the sale status is decided by the client\'s approval and payment.',
                'Creating a new Company or Contact in HubSpot does not create a client in Cord.',
                'Cord does not look up existing Companies by name: check for duplicates after sending your existing data.',
                'A Deal in a currency your HubSpot account has not enabled cannot be created.',
            ],
            faqs: [
                {
                    q: 'What do I need to connect HubSpot with Cord?',
                    a: 'In Cord, the Settings permission. In HubSpot, a user who can install apps in the account; if you do not have one, ask a HubSpot Super Admin to connect it. The integration is included in every Cord plan, starting with Free.',
                },
                {
                    q: 'If I move a Deal in HubSpot, does the quote change in Cord?',
                    a: 'No. Cord owns the sale status: moving a Deal stage, changing its amount or deleting it in HubSpot changes nothing in Cord. What does come back are name, email and phone corrections for already-linked clients.',
                },
                {
                    q: 'Does the integration duplicate my contacts?',
                    a: 'It does not duplicate contacts: before creating one, Cord looks in HubSpot for a Contact with the same email and uses it if it exists. Companies are different: every Cord client creates its own Company, so if you already had it in HubSpot you may end up with two.',
                },
                {
                    q: 'Which permissions does Cord request in HubSpot?',
                    a: 'Only read and write Companies, Contacts and Deals. Cord does not read emails, calls, tickets, lists, forms or any other HubSpot object.',
                },
                {
                    q: 'Can I connect several HubSpot accounts?',
                    a: 'Each Cord organization connects to a single HubSpot account, and a HubSpot account can only be connected to one organization. To switch accounts, disconnect the current one and connect the new one; Cord resets the stages because the other account\'s pipelines do not exist in the new one.',
                },
            ],
            guias: [
                { label: 'Connect HubSpot', href: `${DOCS_EN}/automatizacion/integraciones/hubspot` },
                { label: 'What syncs', href: `${DOCS_EN}/automatizacion/integraciones/hubspot-sincronizacion` },
                { label: 'Pipeline and stages', href: `${DOCS_EN}/automatizacion/integraciones/hubspot-etapas` },
                { label: 'HubSpot troubleshooting', href: `${DOCS_EN}/automatizacion/integraciones/hubspot-problemas` },
            ],
            cta: { titulo: 'Your CRM up to date, without entering data twice.', sub: 'Connect HubSpot from Settings and let every quote move its Deal. Free to start.' },
        },
    },
    {
        slug: 'shopify',
        nombre: 'Shopify',
        dominio: 'shopify.com',
        logo: BRAND_LOGOS.shopify,
        categoria: 'ecommerce',
        related: ['hubspot', 'zapier', 'make'],
        producto: 'editor',
        es: {
            metaTitle: 'Integración con Shopify: cotiza mayoreo con el catálogo de tu tienda | Cord',
            metaDescription: 'Conecta tu tienda de Shopify y cotiza mayoreo con tus productos, precios y clientes reales. Cuando la cotización cierra, el pedido vuelve a tu tienda si tú lo activas.',
            eyebrow: 'INTEGRACIÓN · SHOPIFY',
            titulo: 'Tu tienda vende al público. Cord cierra el mayoreo.',
            sub: 'Los productos y los clientes de Shopify entran a Cord y se mantienen al día solos, así cotizas volumen con los SKU y los precios que ya tienes. Cuando la cotización cierra, el pedido vuelve a tu tienda si tú lo activas.',
            resumen: 'Catálogo y clientes para cotizar, y el pedido de vuelta al cerrar.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Qué viaja entre Cord y tu tienda',
            flujo: [
                { cord: 'Productos y variantes', app: 'Catálogo de Cord', dir: 'Cada variante con su precio y su SKU' },
                { cord: 'Clientes de la tienda', app: 'Clientes de Cord', dir: 'Sin duplicar a quien ya existe' },
                { cord: 'Cambios en Shopify', app: 'Se reflejan en Cord', dir: 'En segundos, por webhook' },
                { cord: 'Cotización cerrada', app: 'Pedido en tu tienda', dir: 'Si tú lo activas' },
            ],
            blocks: [
                {
                    eyebrow: 'CADA VARIANTE, SU PRECIO',
                    titulo: 'Una camisa con tres tallas son tres productos, no uno.',
                    copy: 'En Shopify el precio y el SKU viven en la variante, no en el producto. Cord respeta eso: cada variante entra como un producto propio, así que cotizas la talla exacta con su precio exacto. Un producto que borras en Shopify se desactiva en Cord en vez de desaparecer, porque puede estar dentro de una cotización que ya enviaste.',
                    bullets: [
                        'Precio y SKU por variante',
                        'Un borrado en la tienda no rompe una cotización enviada',
                        'Sincronización completa cuando la pidas, con un botón',
                    ],
                },
                {
                    eyebrow: 'SIN DUPLICAR CLIENTES',
                    titulo: 'Tu lista de clientes no se llena de copias.',
                    copy: 'La empresa sale de la compañía del cliente en Shopify y, si no tiene, de su nombre. Si ese correo ya existe en Cord, la integración lo reconoce y completa lo que falte en lugar de crear una segunda ficha. Cuando el comerciante cambia algo en Shopify, Cord lo actualiza en segundos y solo si de verdad cambió.',
                    bullets: [
                        'La empresa sale de la compañía, no de un campo vacío',
                        'Un correo conocido se reconoce, no se duplica',
                        'Un cambio repetido no reescribe la ficha',
                    ],
                },
                {
                    eyebrow: 'TÚ DECIDES QUÉ ESCRIBE',
                    titulo: 'Cord lee tu tienda, y solo escribe lo que tú enciendas.',
                    copy: 'Leer productos y clientes es automático. Crear pedidos no: nace apagado y lo activas tú en la tarjeta, eligiendo si el pedido entra al aprobarse la cotización o cuando el cliente pague. Cord no edita tu catálogo ni cambia precios; lo único que escribe es ese pedido, que descuenta inventario como cualquier otro de tu tienda. Si desinstalas la app desde Shopify, Cord se entera solo y deja de sincronizar.',
                    bullets: [
                        'La única escritura es el pedido, y nace apagado',
                        'No edita tu catálogo ni cambia tus precios',
                        'Desinstalar en Shopify desconecta en Cord',
                    ],
                },
            ],
            pasos: [
                { name: 'Abre la tarjeta de Shopify', text: 'En Cord, entra a Ajustes › Integraciones › Shopify.' },
                { name: 'Escribe el dominio de tu tienda', text: 'El que termina en myshopify.com; lo ves en Shopify › Configuración › Dominios.' },
                { name: 'Autoriza en Shopify', text: 'Shopify te muestra exactamente qué pide la app: leer productos y clientes, y crear pedidos cuando tú lo actives.' },
                { name: 'Cotiza con tu catálogo', text: 'En unos minutos tus productos y clientes están en Cord, listos para armar la cotización.' },
            ],
            limites: [
'El pedido en Shopify nace apagado: lo activas tú en la tarjeta, eligiendo si se crea al aprobarse la cotización o cuando el cliente pague.',
                'El pedido se crea en la divisa de tu tienda. Si la cotización va en otra divisa, Cord no lo crea en vez de cobrar en la equivocada.',
                'El impuesto del pedido lo calcula Shopify con la configuración de tu tienda; el documento fiscal sigue siendo el de Cord.',
                'Cada variante entra como un producto de Cord, así que un catálogo con muchas variantes llega con muchos renglones.',
                'Las existencias todavía no se consultan al cotizar; el catálogo trae precio y SKU.',
            ],
            faqs: [
                {
                    q: '¿Cord puede cambiar algo en mi tienda?',
                    a: 'Solo lo que tú enciendas. Lee productos y clientes, y la única escritura es crear el pedido al cerrar la cotización, que nace apagado. Nunca cambia precios ni edita tu catálogo.',
                },
                {
                    q: '¿Qué pasa con los productos que borro en Shopify?',
                    a: 'Se desactivan en Cord en lugar de borrarse, porque pueden estar dentro de una cotización que ya enviaste. Desactivado significa que no aparece al armar cotizaciones nuevas.',
                },
                {
                    q: '¿Se duplican mis clientes?',
                    a: 'No. Si el correo del cliente de Shopify ya existe en Cord, se reconoce esa ficha y se completa lo que falte.',
                },
                {
                    q: '¿Cada cuánto se actualiza?',
                    a: 'Los cambios llegan por webhook en segundos. Además puedes pedir una sincronización completa desde la tarjeta cuando quieras.',
                },
                {
                    q: '¿Sirve con cualquier plan de Shopify?',
                    a: 'Sí. La integración usa la API de administración estándar, así que no exige Shopify Plus.',
                },
            ],
            guias: [
                { label: 'Conectar Shopify', href: 'https://cordhq.app/soporte/conectar-shopify' },
                { label: 'Editor de cotizaciones', href: `${DOCS}/cotizacion/editor` },
            ],
            cta: { titulo: 'Cotiza mayoreo con el catálogo que ya tienes.', sub: 'Conecta tu tienda desde Ajustes y empieza a cotizar con tus productos reales. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Shopify integration: quote wholesale with your store catalog | Cord',
            metaDescription: 'Connect your Shopify store and quote wholesale with your real products, prices and customers. When the quote closes, the order goes back to your store if you turn it on.',
            eyebrow: 'INTEGRATION · SHOPIFY',
            titulo: 'Your store sells retail. Cord closes the wholesale.',
            sub: 'Shopify products and customers flow into Cord and stay current on their own, so you quote volume with the SKUs and prices you already have. When the quote closes, the order goes back to your store if you turn it on.',
            resumen: 'Catalog and customers to quote with, and the order back when you close.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'What flows between Cord and your store',
            flujo: [
                { cord: 'Products and variants', app: 'Cord catalog', dir: 'Each variant with its price and SKU' },
                { cord: 'Store customers', app: 'Cord clients', dir: 'Without duplicating who already exists' },
                { cord: 'Changes in Shopify', app: 'Reflected in Cord', dir: 'Within seconds, by webhook' },
                { cord: 'Quote closed', app: 'Order in your store', dir: 'If you turn it on' },
            ],
            blocks: [
                {
                    eyebrow: 'EACH VARIANT, ITS PRICE',
                    titulo: 'A shirt in three sizes is three products, not one.',
                    copy: 'In Shopify, price and SKU live on the variant, not the product. Cord respects that: every variant comes in as its own product, so you quote the exact size at the exact price. A product you delete in Shopify is deactivated in Cord instead of disappearing, because it may sit inside a quote you already sent.',
                    bullets: [
                        'Price and SKU per variant',
                        'A deletion in the store never breaks a sent quote',
                        'Full sync whenever you ask, with one button',
                    ],
                },
                {
                    eyebrow: 'NO DUPLICATE CUSTOMERS',
                    titulo: 'Your client list does not fill up with copies.',
                    copy: 'The company comes from the customer\'s company in Shopify and, if there is none, from their name. If that email already exists in Cord, the integration recognizes it and fills in what is missing instead of creating a second record. When the merchant changes something in Shopify, Cord updates it within seconds, and only if it really changed.',
                    bullets: [
                        'The company comes from the company field, not an empty one',
                        'A known email is recognized, not duplicated',
                        'A repeated change does not rewrite the record',
                    ],
                },
                {
                    eyebrow: 'YOU DECIDE WHAT IT WRITES',
                    titulo: 'Cord reads your store, and only writes what you turn on.',
                    copy: 'Reading products and customers is automatic. Creating orders is not: it starts off and you turn it on from the card, choosing whether the order lands when the quote is approved or when the client pays. Cord never edits your catalog or changes prices; the only thing it writes is that order, which draws down inventory like any other order in your store. If you uninstall the app from Shopify, Cord finds out on its own and stops syncing.',
                    bullets: [
                        'The only write is the order, and it starts off',
                        'It never edits your catalog or changes your prices',
                        'Uninstalling in Shopify disconnects in Cord',
                    ],
                },
            ],
            pasos: [
                { name: 'Open the Shopify card', text: 'In Cord, go to Settings › Integrations › Shopify.' },
                { name: 'Type your store domain', text: 'The one ending in myshopify.com; you will find it in Shopify › Settings › Domains.' },
                { name: 'Authorize in Shopify', text: 'Shopify shows exactly what the app asks for: read products and customers, and create orders when you turn that on.' },
                { name: 'Quote with your catalog', text: 'Within minutes your products and customers are in Cord, ready to build the quote.' },
            ],
            limites: [
'The Shopify order starts off: you turn it on in the card, choosing whether it is created when the quote is approved or when the client pays.',
                'The order is created in your store currency. If the quote uses a different currency, Cord does not create it instead of charging in the wrong one.',
                'Order taxes are calculated by Shopify with your store settings; the fiscal document is still the one from Cord.',
                'Each variant comes in as a Cord product, so a catalog with many variants arrives with many rows.',
                'Stock levels are not checked while quoting yet; the catalog brings price and SKU.',
            ],
            faqs: [
                {
                    q: 'Can Cord change anything in my store?',
                    a: 'Only what you turn on. It reads products and customers, and the only write is creating the order when a quote closes, which starts off. It never changes your prices or edits your catalog.',
                },
                {
                    q: 'What happens to products I delete in Shopify?',
                    a: 'They are deactivated in Cord instead of deleted, because they may sit inside a quote you already sent. Deactivated means they no longer appear when building new quotes.',
                },
                {
                    q: 'Will my customers be duplicated?',
                    a: 'No. If the Shopify customer email already exists in Cord, that record is recognized and completed with whatever is missing.',
                },
                {
                    q: 'How often does it update?',
                    a: 'Changes arrive by webhook within seconds. You can also request a full sync from the card whenever you want.',
                },
                {
                    q: 'Does it work with any Shopify plan?',
                    a: 'Yes. The integration uses the standard Admin API, so it does not require Shopify Plus.',
                },
            ],
            guias: [
                { label: 'Connect Shopify', href: 'https://cordhq.app/en/support/conectar-shopify' },
                { label: 'Quote editor', href: `${DOCS_EN}/cotizacion/editor` },
            ],
            cta: { titulo: 'Quote wholesale with the catalog you already have.', sub: 'Connect your store from Settings and start quoting with your real products. Free to start.' },
        },
    },
    {
        slug: 'mercado-pago',
        nombre: 'Mercado Pago',
        dominio: 'mercadopago.com',
        logo: '/imgs/integrations/mercadopago.svg',
        categoria: 'cobros',
        related: ['whatsapp', 'slack', 'hubspot'],
        producto: 'pagos',
        es: {
            metaTitle: 'Cobra con Mercado Pago desde tu cotización | Cord',
            metaDescription: 'Conecta tu cuenta de Mercado Pago y cobra cotizaciones desde el mismo link: el dinero llega a tu cuenta. En México y Latinoamérica: alternativa a Cord Payments en México y Brasil, y el cobro en línea en Colombia, Argentina, Chile y Perú.',
            eyebrow: 'INTEGRACIÓN · MERCADO PAGO',
            titulo: 'Tu cliente paga con Mercado Pago, sin salir de la cotización.',
            sub: 'Conecta tu cuenta de Mercado Pago y cada cotización ofrece el botón de pago en la misma página donde tu cliente la aprobó. El dinero llega a tu cuenta de Mercado Pago, nunca a la de Cord.',
            resumen: 'Cobro en línea con tu cuenta de Mercado Pago, en cotizaciones y facturas.',
            plan: 'Disponible en todos los planes de Cord; la comisión es la de tu cuenta de Mercado Pago',
            flujoTitulo: 'Cómo viaja un pago',
            flujo: [
                { cord: 'Cotización aprobada', app: 'Checkout de Mercado Pago', dir: 'El cliente paga con los métodos de su país' },
                { cord: 'Cobro marcado pagado', app: 'Pago aprobado', dir: 'Cord lee el pago en tu cuenta antes de marcarlo' },
                { cord: 'Anticipo, saldo o cuotas', app: 'Un cobro por cada parte', dir: 'Se pagan por separado' },
            ],
            blocks: [
                {
                    eyebrow: 'EL RIEL QUE CORRESPONDE A TU PAÍS',
                    titulo: 'Donde ya tienes Cord Payments, es una alternativa. Donde no, es la forma de cobrar en línea.',
                    copy: 'En México y Brasil, tu cliente ve primero el pago con Cord Payments y, debajo, el botón Pagar con Mercado Pago. En Colombia, Argentina, Chile y Perú, donde Cord Payments no está disponible, Mercado Pago es el cobro en línea de tu cuenta. En el resto de los países de Cord no se ofrece.',
                    bullets: [
                        'México y Brasil: alternativa debajo de Cord Payments',
                        'Colombia, Argentina, Chile y Perú: el cobro en línea de tu cuenta',
                        'Disponible en México y en Latinoamérica: Brasil, Colombia, Argentina, Chile y Perú',
                    ],
                },
                {
                    eyebrow: 'CONFIRMACIÓN VERIFICADA',
                    titulo: 'Un aviso no marca un pago. Leerlo en tu cuenta, sí.',
                    copy: 'Cuando hay un pago, Mercado Pago avisa a Cord con un mensaje firmado y Cord rechaza cualquiera cuya firma no coincida. Después Cord lee el pago en Mercado Pago con el acceso de tu cuenta: solo un pago aprobado marca el cobro como pagado. Un pago pendiente, por ejemplo en efectivo, se marca cuando Mercado Pago lo aprueba, y un aviso repetido nunca registra el pago dos veces.',
                    bullets: [
                        'Avisos firmados; los que no coinciden se rechazan',
                        'Solo un pago aprobado en tu cuenta cuenta como pagado',
                        'Si un cobro se paga por los dos rieles, queda anotado en el historial',
                    ],
                },
                {
                    eyebrow: 'TU CUENTA, TUS CONDICIONES',
                    titulo: 'El dinero nunca pasa por Cord.',
                    copy: 'Cord cobra con tu propia cuenta de Mercado Pago: tú apareces como vendedor en el checkout y cada pago llega ahí, con la comisión de tus condiciones con Mercado Pago. Cord guarda el acceso cifrado, lo renueva solo y lo usa únicamente para abrir el cobro de tus cotizaciones y facturas, y leer si ya se pagó o se reembolsó.',
                    bullets: [
                        'Tú eres el vendedor en el checkout',
                        'Acceso cifrado que se renueva solo',
                        'Desconectar deja de ofrecer Mercado Pago; lo ya pagado conserva su historial',
                    ],
                },
            ],
            pasos: [
                { name: 'Abre Cobros', text: 'En Cord, ve a Ajustes › Cobros. Necesitas el permiso Configurar cobros.' },
                { name: 'Conecta Mercado Pago', text: 'En la tarjeta de Mercado Pago, pulsa Conectar Mercado Pago.' },
                { name: 'Autoriza tu cuenta', text: 'Inicia sesión con la cuenta de negocio que va a recibir el dinero y autoriza a Cord.' },
                { name: 'Listo para cobrar', text: 'De vuelta en Cord la tarjeta dice Conectado y tus cotizaciones y facturas ofrecen el botón de pago.' },
            ],
            limites: [
                'Las igualas recurrentes no se cobran con Mercado Pago: necesitan la suscripción de Cord Payments.',
                'Los contracargos de Mercado Pago todavía no llegan a Cord: se atienden desde tu cuenta de Mercado Pago.',
            ],
            faqs: [
                {
                    q: '¿Cord cobra con mi cuenta de Mercado Pago o con la de Cord?',
                    a: 'Con la tuya. Tú apareces como vendedor en el checkout y el dinero llega directo a tu cuenta de Mercado Pago; nunca pasa por Cord.',
                },
                {
                    q: '¿Qué comisión cobra Mercado Pago?',
                    a: 'La de tu cuenta, según las condiciones que tengas con Mercado Pago. Se descuenta de cada pago.',
                },
                {
                    q: '¿En qué países puedo cobrar con Mercado Pago en Cord?',
                    a: 'Cord lo ofrece en México y Brasil, como alternativa a Cord Payments, y en Colombia, Argentina, Chile y Perú, como el cobro en línea de tu cuenta. En todos ellos cobras con tu propia cuenta de Mercado Pago y con los métodos que Mercado Pago tenga disponibles en cada país.',
                },
                {
                    q: '¿Qué ve mi cliente al pagar?',
                    a: 'En la página de pago de la cotización ve el botón Pagar con Mercado Pago con su logo. Si también tienes Cord Payments, primero ve ese pago y debajo el botón de Mercado Pago. Al pulsarlo va al checkout de Mercado Pago y, cuando el pago se aprueba, regresa a tu link.',
                },
                {
                    q: '¿Puedo probarlo sin cobrar de verdad?',
                    a: 'Crea una cotización por un importe bajo, págala desde otro navegador sin sesión con una tarjeta que no sea de tu misma cuenta de Mercado Pago —Mercado Pago no deja pagarte a ti mismo— y reembólsala después desde Mercado Pago.',
                },
            ],
            guias: [
                { label: 'Mercado Pago en Cord', href: `${DOCS}/pagos/mercado-pago` },
                { label: 'Métodos de cobro', href: `${DOCS}/pagos/metodos` },
            ],
            cta: { titulo: 'Cobra con el riel que tu cliente ya usa.', sub: 'Conecta Mercado Pago desde Ajustes › Cobros y cobra tu próxima cotización en el mismo link. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Get paid with Mercado Pago from your quote | Cord',
            metaDescription: 'Connect your Mercado Pago account and collect quotes from the same link: the money lands in your account. An alternative to Cord Payments in Mexico and Brazil, and the online payment rail in Colombia, Argentina, Chile and Peru.',
            eyebrow: 'INTEGRATION · MERCADO PAGO',
            titulo: 'Your client pays with Mercado Pago, without leaving the quote.',
            sub: 'Connect your Mercado Pago account and every quote offers the payment button on the same page where your client approved it. The money lands in your Mercado Pago account, never in Cord\'s.',
            resumen: 'Online payments through your Mercado Pago account, on quotes and invoices.',
            plan: 'Available on every Cord plan; the fee is the one on your Mercado Pago account',
            flujoTitulo: 'How a payment travels',
            flujo: [
                { cord: 'Approved quote', app: 'Mercado Pago checkout', dir: 'The client pays with the methods of their country' },
                { cord: 'Charge marked paid', app: 'Approved payment', dir: 'Cord reads the payment in your account before marking it' },
                { cord: 'Deposit, balance or installments', app: 'One charge per part', dir: 'Each one paid separately' },
            ],
            blocks: [
                {
                    eyebrow: 'THE RAIL FOR YOUR COUNTRY',
                    titulo: 'Where you already have Cord Payments, it is an alternative. Where you don\'t, it is how you get paid online.',
                    copy: 'In Mexico and Brazil, your client first sees the Cord Payments checkout and, below it, the Pay with Mercado Pago button. In Colombia, Argentina, Chile and Peru, where Cord Payments is not available, Mercado Pago is your account\'s online payment rail. In Cord\'s other countries it is not offered.',
                    bullets: [
                        'Mexico and Brazil: an alternative below Cord Payments',
                        'Colombia, Argentina, Chile and Peru: your online payment rail',
                        'Available in Mexico and across Latin America: Brazil, Colombia, Argentina, Chile and Peru',
                    ],
                },
                {
                    eyebrow: 'VERIFIED CONFIRMATION',
                    titulo: 'A notification does not mark a payment. Reading it in your account does.',
                    copy: 'When a payment happens, Mercado Pago notifies Cord with a signed message and Cord rejects any whose signature does not match. Then Cord reads the payment in Mercado Pago with your account\'s access: only an approved payment marks the charge as paid. A pending payment, such as cash, is marked when Mercado Pago approves it, and a repeated notification never records the payment twice.',
                    bullets: [
                        'Signed notifications; mismatches are rejected',
                        'Only a payment approved in your account counts as paid',
                        'If a charge is paid through both rails, it is noted in the history',
                    ],
                },
                {
                    eyebrow: 'YOUR ACCOUNT, YOUR TERMS',
                    titulo: 'The money never goes through Cord.',
                    copy: 'Cord charges with your own Mercado Pago account: you appear as the seller at checkout and every payment lands there, with the fee from your terms with Mercado Pago. Cord stores the access encrypted, renews it automatically and only uses it to open the charges on your quotes and invoices, and read whether they were paid or refunded.',
                    bullets: [
                        'You are the seller at checkout',
                        'Encrypted access that renews itself',
                        'Disconnecting stops offering Mercado Pago; paid charges keep their history',
                    ],
                },
            ],
            pasos: [
                { name: 'Open Payments', text: 'In Cord, go to Settings › Payments. You need the Configure payments permission.' },
                { name: 'Connect Mercado Pago', text: 'On the Mercado Pago card, press Connect Mercado Pago.' },
                { name: 'Authorize your account', text: 'Sign in with the business account that will receive the money and authorize Cord.' },
                { name: 'Ready to get paid', text: 'Back in Cord the card says Connected and your quotes and invoices offer the payment button.' },
            ],
            limites: [
                'Recurring retainers are not charged with Mercado Pago: they need the Cord Payments subscription.',
                'Mercado Pago chargebacks do not reach Cord yet: you handle them from your Mercado Pago account.',
            ],
            faqs: [
                {
                    q: 'Does Cord charge with my Mercado Pago account or with Cord\'s?',
                    a: 'With yours. You appear as the seller at checkout and the money goes straight to your Mercado Pago account; it never goes through Cord.',
                },
                {
                    q: 'What fee does Mercado Pago charge?',
                    a: 'The one on your account, according to your terms with Mercado Pago. It is deducted from each payment.',
                },
                {
                    q: 'In which countries can I get paid with Mercado Pago in Cord?',
                    a: 'Cord offers it in Mexico and Brazil, as an alternative to Cord Payments, and in Colombia, Argentina, Chile and Peru, as your account\'s online payment rail. In all of them you get paid with your own Mercado Pago account and with the methods Mercado Pago offers in each country.',
                },
                {
                    q: 'What does my client see when paying?',
                    a: 'On the quote payment page they see the Pay with Mercado Pago button with its logo. If you also have Cord Payments, they see that checkout first and the Mercado Pago button below. Pressing it takes them to the Mercado Pago checkout and, once the payment is approved, back to your link.',
                },
                {
                    q: 'Can I test it without charging for real?',
                    a: 'Create a quote for a small amount, pay it from another browser without a session using a card that is not from your own Mercado Pago account —Mercado Pago does not let you pay yourself— and refund it afterwards from Mercado Pago.',
                },
            ],
            guias: [
                { label: 'Mercado Pago in Cord', href: `${DOCS_EN}/pagos/mercado-pago` },
                { label: 'Payment methods', href: `${DOCS_EN}/pagos/metodos` },
            ],
            cta: { titulo: 'Get paid on the rail your client already uses.', sub: 'Connect Mercado Pago from Settings › Payments and collect your next quote in the same link. Free to start.' },
        },
    },
    {
        slug: 'slack',
        nombre: 'Slack',
        dominio: 'slack.com',
        logo: BRAND_LOGOS.slack,
        categoria: 'comunicacion',
        related: ['teams', 'hubspot', 'make'],
        producto: 'workflows',
        es: {
            metaTitle: 'Integración con Slack: avisos de ventas y cobros en tu canal | Cord',
            metaDescription: 'Añade Cord a Slack y elige el canal: tu equipo se entera cuando un cliente abre, aprueba o paga una cotización, y tus workflows publican mensajes propios con datos del evento.',
            eyebrow: 'INTEGRACIÓN · SLACK',
            titulo: 'Tu equipo se entera en Slack cuando el cliente abre, aprueba o paga.',
            sub: 'Con Añadir a Slack eliges el canal y Cord publica ahí los avisos que marques, sin que nadie abra Cord. Cord no lee tus mensajes y solo puede publicar en ese canal.',
            resumen: 'Avisos de tus cotizaciones y mensajes de workflows en tu canal.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Qué llega a tu canal',
            flujo: [
                { cord: 'Tu cliente vio la cotización', app: 'Aviso en el canal', dir: 'Al abrir el link público' },
                { cord: 'Cotización aprobada o rechazada', app: 'Aviso con folio, cliente y total', dir: 'Al decidir el cliente' },
                { cord: 'Pago recibido o pago vencido', app: 'Aviso con enlace a la cotización', dir: 'Al registrarse o vencer' },
                { cord: 'Un workflow', app: 'Tu propio texto con datos del evento', dir: 'Cuando tú decidas' },
            ],
            blocks: [
                {
                    eyebrow: 'AVISOS DE TUS COTIZACIONES',
                    titulo: 'El folio, el cliente y el total, en el canal donde ya está tu equipo.',
                    copy: 'Conectar Slack no enciende nada por sí solo: en Ajustes › Notificaciones marcas la columna de Slack en los eventos que quieras —cotización vista, aprobada, rechazada, pago recibido, por vencer y pago vencido—. Cada aviso es un mensaje corto con el folio, lo que pasó, el cliente, el total con su divisa y un enlace para abrir la cotización.',
                    bullets: [
                        'Tú eliges qué eventos llegan a Slack, al correo o a los dos',
                        'Cotización por vencer: 3 días antes de su vigencia',
                        'Enviar prueba antes de encender cualquier aviso',
                    ],
                },
                {
                    eyebrow: 'MENSAJES PROPIOS CON WORKFLOWS',
                    titulo: 'Escribe el mensaje tú y decide cuándo sale.',
                    copy: 'Con la acción Enviar un mensaje a Slack de Cord Workflows publicas el texto que quieras, con datos del evento como {{cliente}}, {{folio}} o {{monto}}, y solo cuando se cumplan tus condiciones: cuando entra un anticipo, cuando abren un contracargo o solo cuando la venta pasa de cierto monto. Funciona aunque los avisos de Notificaciones estén apagados.',
                    bullets: [
                        'Cualquiera de los disparadores de Cord Workflows',
                        'Condiciones y esperas antes de publicar',
                        'El mismo canal conectado, sin configurar otra app',
                    ],
                },
                {
                    eyebrow: 'SIN LEER NADA',
                    titulo: 'Cord publica en un canal. No lee tu espacio de trabajo.',
                    copy: 'Cord publica con un Incoming Webhook: una dirección que Slack genera para el canal que eliges. Slack agrega a tu espacio una app llamada Cord que firma los mensajes. Si prefieres que salgan con el nombre e ícono de tu propia app de Slack, puedes pegar un webhook propio.',
                    bullets: [
                        'Autorización en la página de Slack',
                        'Webhook propio como alternativa',
                        'Si borras el webhook o la app en Slack, deja de funcionar al instante',
                    ],
                },
            ],
            pasos: [
                { name: 'Abre la integración', text: 'En Cord, ve a Ajustes › Integraciones y toca Slack.' },
                { name: 'Añade Cord a Slack', text: 'Pulsa Añadir a Slack, elige el canal donde quieres los avisos y pulsa Permitir.' },
                { name: 'Envía una prueba', text: 'De vuelta en Cord, la tarjeta dice Conectado a tu canal. Pulsa Enviar prueba para ver un mensaje de ejemplo.' },
                { name: 'Activa los avisos', text: 'En Ajustes › Notificaciones marca la columna de Slack en los eventos que quieras.' },
            ],
            limites: [
                'Cord publica en un solo canal a la vez; para varios canales puedes usar Make con los webhooks de Cord.',
                'Los avisos de Notificaciones son de cotizaciones: un evento sin folio no se publica.',
                'El aviso de "alguien se unió al equipo" solo llega por correo.',
                'Si tu espacio restringe la instalación de apps, un administrador de Slack tendrá que aprobarla.',
            ],
            faqs: [
                {
                    q: '¿Cord puede leer los mensajes de mi Slack?',
                    a: 'No. Cord publica con un Incoming Webhook, una dirección que Slack genera para un canal específico. Cord no lee tus mensajes y solo puede publicar en ese canal.',
                },
                {
                    q: '¿Qué avisos puedo recibir en Slack?',
                    a: 'Cotización vista por el cliente, aprobada, rechazada, pago recibido, cotización por vencer (3 días antes) y pago vencido. Los activas uno por uno en Ajustes › Notificaciones; conectar Slack no enciende ninguno por sí solo.',
                },
                {
                    q: '¿Puedo mandar mensajes con mi propio texto?',
                    a: 'Sí, con la acción Enviar un mensaje a Slack de Cord Workflows. Escribes el texto con datos del evento y eliges cuándo sale, con condiciones y esperas. Publica en el mismo canal conectado y funciona aunque los avisos de Notificaciones estén apagados.',
                },
                {
                    q: '¿Cómo cambio de canal o desconecto Slack?',
                    a: 'En la tarjeta de Slack pulsa Cambiar de canal y elige otro en Slack, o Desconectar para que Cord deje de publicar. Los workflows que usan la acción de Slack empezarán a pedir que conectes Slack otra vez.',
                },
            ],
            guias: [
                { label: 'Slack en Cord', href: `${DOCS}/automatizacion/integraciones/slack` },
                { label: 'Acciones de workflows', href: `${DOCS}/automatizacion/workflows/acciones` },
            ],
            cta: { titulo: 'Que la venta llegue al canal antes que la pregunta.', sub: 'Añade Cord a Slack desde Ajustes y elige qué avisos quiere tu equipo. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Slack integration: sales and payment alerts in your channel | Cord',
            metaDescription: 'Add Cord to Slack and pick the channel: your team knows when a client opens, approves or pays a quote, and your workflows post their own messages with event data.',
            eyebrow: 'INTEGRATION · SLACK',
            titulo: 'Your team hears it in Slack when the client opens, approves or pays.',
            sub: 'With Add to Slack you pick the channel and Cord posts the alerts you choose there, without anyone opening Cord. Cord does not read your messages and can only post to that channel.',
            resumen: 'Quote alerts and workflow messages in your channel.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'What reaches your channel',
            flujo: [
                { cord: 'Your client viewed the quote', app: 'Alert in the channel', dir: 'When the public link is opened' },
                { cord: 'Quote approved or rejected', app: 'Alert with number, client and total', dir: 'When the client decides' },
                { cord: 'Payment received or overdue', app: 'Alert with a link to the quote', dir: 'When it is recorded or falls due' },
                { cord: 'A workflow', app: 'Your own text with event data', dir: 'Whenever you decide' },
            ],
            blocks: [
                {
                    eyebrow: 'QUOTE ALERTS',
                    titulo: 'The number, the client and the total, in the channel your team already uses.',
                    copy: 'Connecting Slack turns nothing on by itself: in Settings › Notifications you tick the Slack column on the events you want —quote viewed, approved, rejected, payment received, expiring and payment overdue—. Each alert is a short message with the quote number, what happened, the client, the total with its currency and a link to open the quote.',
                    bullets: [
                        'You choose which events go to Slack, email or both',
                        'Quote expiring: 3 days before its validity date',
                        'Send a test before turning any alert on',
                    ],
                },
                {
                    eyebrow: 'YOUR OWN MESSAGES WITH WORKFLOWS',
                    titulo: 'Write the message yourself and decide when it goes out.',
                    copy: 'With the Send a Slack message action in Cord Workflows you post any text, with event data such as {{client}}, {{folio}} or {{amount}}, and only when your conditions are met: when a deposit arrives, when a chargeback is opened or only when the sale is above a certain amount. It works even with Notifications alerts turned off.',
                    bullets: [
                        'Any Cord Workflows trigger',
                        'Conditions and waits before posting',
                        'The same connected channel, no other app to set up',
                    ],
                },
                {
                    eyebrow: 'NOTHING IS READ',
                    titulo: 'Cord posts to one channel. It does not read your workspace.',
                    copy: 'Cord posts through an Incoming Webhook: an address Slack generates for the channel you choose. Slack adds an app called Cord to your workspace that signs the messages. If you would rather they come from your own Slack app\'s name and icon, you can paste your own webhook.',
                    bullets: [
                        'Authorization on Slack\'s own page',
                        'Your own webhook as an alternative',
                        'Delete the webhook or the app in Slack and it stops working instantly',
                    ],
                },
            ],
            pasos: [
                { name: 'Open the integration', text: 'In Cord, go to Settings › Integrations and tap Slack.' },
                { name: 'Add Cord to Slack', text: 'Press Add to Slack, pick the channel for the alerts and press Allow.' },
                { name: 'Send a test', text: 'Back in Cord the card says Connected to your channel. Press Send test to see a sample message.' },
                { name: 'Turn on the alerts', text: 'In Settings › Notifications tick the Slack column on the events you want.' },
            ],
            limites: [
                'Cord posts to one channel at a time; for several channels you can use Make with Cord webhooks.',
                'Notifications alerts are about quotes: an event without a quote number is not posted.',
                'The "someone joined the team" alert only goes out by email.',
                'If your workspace restricts app installs, a Slack admin will need to approve it.',
            ],
            faqs: [
                {
                    q: 'Can Cord read my Slack messages?',
                    a: 'No. Cord posts through an Incoming Webhook, an address Slack generates for one specific channel. Cord does not read your messages and can only post to that channel.',
                },
                {
                    q: 'Which alerts can I get in Slack?',
                    a: 'Quote viewed by the client, approved, rejected, payment received, quote expiring (3 days before) and payment overdue. You turn them on one by one in Settings › Notifications; connecting Slack turns none on by itself.',
                },
                {
                    q: 'Can I send messages with my own text?',
                    a: 'Yes, with the Send a Slack message action in Cord Workflows. You write the text with event data and choose when it goes out, with conditions and waits. It posts to the same connected channel and works even with Notifications alerts turned off.',
                },
                {
                    q: 'How do I change channel or disconnect Slack?',
                    a: 'On the Slack card press Change channel and pick another in Slack, or Disconnect so Cord stops posting. Workflows using the Slack action will start asking you to connect Slack again.',
                },
            ],
            guias: [
                { label: 'Slack in Cord', href: `${DOCS_EN}/automatizacion/integraciones/slack` },
                { label: 'Workflow actions', href: `${DOCS_EN}/automatizacion/workflows/acciones` },
            ],
            cta: { titulo: 'Let the sale reach the channel before the question does.', sub: 'Add Cord to Slack from Settings and choose the alerts your team wants. Free to start.' },
        },
    },
    {
        slug: 'zapier',
        nombre: 'Zapier',
        dominio: 'zapier.com',
        logo: BRAND_LOGOS.zapier,
        categoria: 'automatizacion',
        related: ['make', 'n8n', 'hubspot'],
        producto: 'workflows',
        es: {
            metaTitle: 'Integración con Zapier: conecta Cord con miles de apps | Cord',
            metaDescription: 'La app de Cord para Zapier: disparadores instantáneos de cotizaciones, pagos y facturas, acciones para crear clientes y cotizaciones, y autorización con un clic, sin llaves de API.',
            eyebrow: 'INTEGRACIÓN · ZAPIER',
            titulo: 'Cord y miles de apps, conectados sin escribir código.',
            sub: 'La app de Cord para Zapier lleva lo que pasa en tus ventas a cualquier herramienta —una hoja de cálculo, tu gestor de proyectos, tu ERP— y crea datos en Cord desde tus Zaps. Se autoriza con un clic, sin llaves que pegar.',
            resumen: 'Disparadores, acciones y búsquedas de Cord en tus Zaps.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Qué incluye la app de Cord',
            flujo: [
                { cord: 'Disparadores instantáneos', app: 'Cotización creada, enviada, abierta, aprobada, rechazada o pagada', dir: 'También pago parcial, factura pagada, cliente nuevo o cualquier evento' },
                { cord: 'Acciones', app: 'Crear y actualizar clientes, crear y enviar cotizaciones', dir: 'También marcarlas pagadas y crear tareas' },
                { cord: 'Búsquedas', app: 'Cliente por correo o nombre', dir: 'Y cotización por folio' },
            ],
            blocks: [
                {
                    eyebrow: 'AUTORIZACIÓN CON UN CLIC',
                    titulo: 'Sin crear, copiar ni pegar una llave de API.',
                    copy: 'Al conectar Cord en un Zap se abre una pantalla de Cord donde eliges el espacio de trabajo y pulsas Autorizar. Zapier renueva el acceso solo y, si algún día quieres cortarlo, revocas la conexión desde Ajustes › Modo desarrollador › API, donde aparece como Conexión autorizada de Zapier.',
                    bullets: [
                        'OAuth 2.0: la autorización vive en una pantalla de Cord',
                        'Quien autoriza necesita acceso a Ajustes en ese espacio',
                        'Revocable en cualquier momento desde Cord',
                    ],
                },
                {
                    eyebrow: 'DISPARADORES INSTANTÁNEOS',
                    titulo: 'El Zap arranca en cuanto pasa algo, no cada quince minutos.',
                    copy: 'Cada Zap activo crea su propio webhook en Cord y lo borra al apagarse. Los eventos llegan firmados y la app verifica la firma antes de dar por bueno un evento. Esos webhooks tienen un cupo propio de 100 por organización, aparte de los endpoints de tu plan, así que tus Zaps no te quitan lugares.',
                    bullets: [
                        'Cotizaciones, pagos parciales, facturas pagadas y clientes nuevos',
                        'Un disparador "cualquier evento de Cord" para todo lo demás',
                        'Cupo aparte de los webhooks de tu plan',
                    ],
                },
                {
                    eyebrow: 'EJEMPLOS REALES',
                    titulo: 'Lo que tu equipo hacía copiando datos, hecho solo.',
                    copy: 'Una cotización pagada agrega un renglón en Google Sheets. Un lead de tu formulario se convierte en cliente de Cord. Una cotización aprobada abre un proyecto en Asana, Trello o ClickUp. Si prefieres no instalar la app, Webhooks by Zapier y la API de Cord cubren los mismos casos.',
                    bullets: [
                        'Cotización pagada → renglón en Google Sheets',
                        'Formulario nuevo → cliente en Cord',
                        'Cotización aprobada → tarea en tu gestor de proyectos',
                    ],
                },
            ],
            pasos: [
                { name: 'Abre la invitación', text: 'En Cord, ve a Ajustes › Integraciones › Zapier y pulsa Abrir Cord en Zapier. Acepta la invitación y Zapier agrega Cord a tus apps.' },
                { name: 'Crea un Zap', text: 'Elige Cord como disparador o como acción y pulsa Conectar.' },
                { name: 'Autoriza en Cord', text: 'En la pantalla de Cord elige el espacio de trabajo y pulsa Autorizar. No hay llaves que crear.' },
            ],
            limites: [
                'La app de Cord se comparte por invitación desde Ajustes; todavía no aparece en el directorio público de Zapier.',
                'Webhooks by Zapier, la alternativa sin app, está en los planes de pago de Zapier y no verifica la firma de Cord.',
            ],
            faqs: [
                {
                    q: '¿Necesito una llave de API para conectar Zapier?',
                    a: 'No. La app de Cord se conecta por OAuth: al pulsar Conectar en un Zap se abre una pantalla de Cord donde eliges el espacio de trabajo y autorizas. Zapier renueva el acceso solo.',
                },
                {
                    q: '¿Qué disparadores y acciones tiene la app de Cord?',
                    a: 'Disparadores instantáneos de cotización creada, enviada, abierta, aprobada, rechazada o pagada; pago parcial; factura pagada; cliente nuevo; o cualquier evento de Cord. Acciones para crear y actualizar clientes, crear y enviar cotizaciones, marcarlas pagadas y crear tareas. Y búsquedas de cliente por correo o nombre y de cotización por folio.',
                },
                {
                    q: '¿Los Zaps cuentan contra el límite de webhooks de mi plan?',
                    a: 'No. Cada Zap activo crea su propio webhook en Cord con un cupo de 100 por organización, aparte de los endpoints de tu plan.',
                },
                {
                    q: '¿Cómo corto el acceso de Zapier?',
                    a: 'En Ajustes › Modo desarrollador › API, donde la conexión aparece como Conexión autorizada de Zapier. Al revocarla se cierra el acceso.',
                },
            ],
            guias: [
                { label: 'Zapier en Cord', href: `${DOCS}/automatizacion/integraciones/zapier` },
                { label: 'Webhooks para desarrolladores', href: `${DOCS}/desarrolladores/herramientas/webhooks` },
            ],
            cta: { titulo: 'Tus ventas, conectadas con el resto de tu operación.', sub: 'Abre Cord en Zapier desde Ajustes y crea tu primer Zap. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Zapier integration: connect Cord with thousands of apps | Cord',
            metaDescription: 'The Cord app for Zapier: instant triggers for quotes, payments and invoices, actions to create clients and quotes, and one-click authorization with no API keys.',
            eyebrow: 'INTEGRATION · ZAPIER',
            titulo: 'Cord and thousands of apps, connected without code.',
            sub: 'The Cord app for Zapier takes what happens in your sales to any tool —a spreadsheet, your project manager, your ERP— and creates data in Cord from your Zaps. It is authorized in one click, with no keys to paste.',
            resumen: 'Cord triggers, actions and searches in your Zaps.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'What the Cord app includes',
            flujo: [
                { cord: 'Instant triggers', app: 'Quote created, sent, opened, approved, rejected or paid', dir: 'Also partial payment, invoice paid, new client or any event' },
                { cord: 'Actions', app: 'Create and update clients, create and send quotes', dir: 'Also mark them paid and create tasks' },
                { cord: 'Searches', app: 'Client by email or name', dir: 'And quote by number' },
            ],
            blocks: [
                {
                    eyebrow: 'ONE-CLICK AUTHORIZATION',
                    titulo: 'No API key to create, copy or paste.',
                    copy: 'When you connect Cord in a Zap, a Cord screen opens where you pick the workspace and press Authorize. Zapier renews access on its own and, if you ever want to cut it, you revoke the connection from Settings › Developer mode › API, where it shows as Zapier\'s Authorized connection.',
                    bullets: [
                        'OAuth 2.0: authorization lives on a Cord screen',
                        'Whoever authorizes needs Settings access in that workspace',
                        'Revocable at any time from Cord',
                    ],
                },
                {
                    eyebrow: 'INSTANT TRIGGERS',
                    titulo: 'The Zap starts the moment something happens, not every fifteen minutes.',
                    copy: 'Every active Zap creates its own webhook in Cord and deletes it when turned off. Events arrive signed and the app verifies the signature before accepting an event. Those webhooks have their own allowance of 100 per organization, separate from your plan\'s endpoints, so your Zaps take no slots.',
                    bullets: [
                        'Quotes, partial payments, paid invoices and new clients',
                        'An "any Cord event" trigger for everything else',
                        'An allowance separate from your plan\'s webhooks',
                    ],
                },
                {
                    eyebrow: 'REAL EXAMPLES',
                    titulo: 'What your team did by copying data, done on its own.',
                    copy: 'A paid quote adds a row in Google Sheets. A lead from your form becomes a Cord client. An approved quote opens a project in Asana, Trello or ClickUp. If you would rather not install the app, Webhooks by Zapier and the Cord API cover the same cases.',
                    bullets: [
                        'Paid quote → row in Google Sheets',
                        'New form entry → client in Cord',
                        'Approved quote → task in your project manager',
                    ],
                },
            ],
            pasos: [
                { name: 'Open the invitation', text: 'In Cord, go to Settings › Integrations › Zapier and press Open Cord in Zapier. Accept the invitation and Zapier adds Cord to your apps.' },
                { name: 'Create a Zap', text: 'Pick Cord as the trigger or the action and press Connect.' },
                { name: 'Authorize in Cord', text: 'On the Cord screen pick the workspace and press Authorize. No keys to create.' },
            ],
            limites: [
                'The Cord app is shared by invitation from Settings; it is not listed in Zapier\'s public directory yet.',
                'Webhooks by Zapier, the no-app alternative, is on Zapier\'s paid plans and does not verify Cord\'s signature.',
            ],
            faqs: [
                {
                    q: 'Do I need an API key to connect Zapier?',
                    a: 'No. The Cord app connects through OAuth: pressing Connect in a Zap opens a Cord screen where you pick the workspace and authorize. Zapier renews access on its own.',
                },
                {
                    q: 'Which triggers and actions does the Cord app have?',
                    a: 'Instant triggers for quote created, sent, opened, approved, rejected or paid; partial payment; invoice paid; new client; or any Cord event. Actions to create and update clients, create and send quotes, mark them paid and create tasks. And searches for a client by email or name and a quote by number.',
                },
                {
                    q: 'Do Zaps count against my plan\'s webhook limit?',
                    a: 'No. Every active Zap creates its own webhook in Cord with an allowance of 100 per organization, separate from your plan\'s endpoints.',
                },
                {
                    q: 'How do I cut Zapier\'s access?',
                    a: 'In Settings › Developer mode › API, where the connection shows as Zapier\'s Authorized connection. Revoking it closes the access.',
                },
            ],
            guias: [
                { label: 'Zapier in Cord', href: `${DOCS_EN}/automatizacion/integraciones/zapier` },
                { label: 'Webhooks for developers', href: `${DOCS_EN}/desarrolladores/herramientas/webhooks` },
            ],
            cta: { titulo: 'Your sales, connected to the rest of your operation.', sub: 'Open Cord in Zapier from Settings and create your first Zap. Free to start.' },
        },
    },
    {
        slug: 'make',
        nombre: 'Make',
        dominio: 'make.com',
        logo: BRAND_LOGOS.make,
        categoria: 'automatizacion',
        related: ['zapier', 'n8n', 'slack'],
        producto: 'workflows',
        es: {
            metaTitle: 'Integración con Make: escenarios con cotizaciones y pagos | Cord',
            metaDescription: 'La app de Cord para Make: Watch Events instantáneo, acciones para clientes, cotizaciones y tareas, búsquedas con paginación y Make an API Call. Se autoriza con un clic, en todas las zonas de Make.',
            eyebrow: 'INTEGRACIÓN · MAKE',
            titulo: 'Lleva cada venta de Cord a tus escenarios de Make.',
            sub: 'La app de Cord para Make arranca tus escenarios en cuanto pasa algo en Cord y crea o actualiza datos en Cord desde ellos. Se autoriza con un clic, sin llaves de API.',
            resumen: 'Watch Events, acciones y búsquedas de Cord en tus escenarios.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Los módulos de Cord en Make',
            flujo: [
                { cord: 'Disparador instantáneo', app: 'Watch Events', dir: 'Eliges los eventos de Cord que arrancan el escenario' },
                { cord: 'Acciones', app: 'Clientes, cotizaciones y tareas', dir: 'Crear, actualizar, obtener, enviar y marcar pagada' },
                { cord: 'Búsquedas', app: 'Search Clients y Search Quotes', dir: 'Con paginación' },
                { cord: 'Universal', app: 'Make an API Call', dir: 'Cualquier otra operación de la API de Cord' },
            ],
            blocks: [
                {
                    eyebrow: 'AUTORIZACIÓN CON UN CLIC',
                    titulo: 'Crea la conexión y autoriza en Cord. Nada más.',
                    copy: 'En un escenario agregas cualquier módulo de Cord, pulsas Create a connection y se abre una pantalla de Cord donde eliges el espacio de trabajo y autorizas. Make renueva el acceso solo y, para cortarlo, revocas la conexión desde Ajustes › Modo desarrollador › API. La autorización regresa a la zona de Make de la que viniste.',
                    bullets: [
                        'OAuth 2.0, sin llaves que pegar',
                        'Funciona en todas las zonas de Make',
                        'Revocable desde Cord en cualquier momento',
                    ],
                },
                {
                    eyebrow: 'WATCH EVENTS',
                    titulo: 'El escenario arranca en cuanto el cliente aprueba o paga.',
                    copy: 'Watch Events registra su propio webhook en Cord con los eventos que elijas y tiene un cupo aparte de los endpoints de tu plan. Cada evento trae su identificador, su tipo, cuándo ocurrió y los datos del objeto —en una cotización: folio, estado, moneda, total, cliente y link público—.',
                    bullets: [
                        'Eventos de cotizaciones, pagos, facturas y clientes',
                        'El identificador del evento no cambia entre reintentos',
                        'Cupo aparte de los webhooks de tu plan',
                    ],
                },
                {
                    eyebrow: 'DE VUELTA A CORD',
                    titulo: 'Crea clientes y cotizaciones desde cualquier escenario.',
                    copy: 'Las acciones crean, actualizan y obtienen clientes; crean, obtienen, envían y marcan pagadas cotizaciones; y crean tareas. Para todo lo demás, Make an API Call llama a cualquier operación de la API de Cord con la misma conexión. Si prefieres no instalar la app, los módulos Webhooks y HTTP de Make cubren los mismos casos.',
                    bullets: [
                        'Create a Client, Update a Client, Get a Client',
                        'Create, Get, Send y Mark as Paid para cotizaciones',
                        'Create a Task para tu equipo',
                    ],
                },
            ],
            pasos: [
                { name: 'Instala la app', text: 'En Cord, ve a Ajustes › Integraciones › Make y pulsa Abrir Cord en Make. Pulsa Instalar y elige tu organización de Make.' },
                { name: 'Crea la conexión', text: 'En un escenario agrega cualquier módulo de Cord y pulsa Create a connection › Save.' },
                { name: 'Autoriza en Cord', text: 'En la pantalla de Cord elige el espacio de trabajo y pulsa Autorizar.' },
            ],
            limites: [
                'Make solo deja instalar apps a quien es Administrador, Propietario o Desarrollador de aplicaciones de la organización de Make.',
                'La app se comparte por invitación desde Ajustes; todavía no aparece en el catálogo público de Make.',
                'Make no verifica la firma de los webhooks de Cord: trata la URL de un webhook de Make como un secreto.',
            ],
            faqs: [
                {
                    q: '¿Necesito una llave de API para usar Cord en Make?',
                    a: 'No con la app de Cord: se autoriza por OAuth en una pantalla de Cord. Solo necesitas una llave si prefieres los módulos genéricos HTTP de Make en lugar de la app.',
                },
                {
                    q: '¿Qué módulos tiene la app de Cord para Make?',
                    a: 'Watch Events como disparador instantáneo; las acciones Create a Client, Update a Client, Get a Client, Create a Quote, Get a Quote, Send a Quote, Mark a Quote as Paid y Create a Task; las búsquedas Search Clients y Search Quotes con paginación; y Make an API Call para cualquier otra operación.',
                },
                {
                    q: '¿Funciona si mi cuenta de Make está en Europa?',
                    a: 'Sí. La app funciona en todas las zonas de Make y la autorización regresa a la zona de la que viniste.',
                },
                {
                    q: '¿Cómo evito procesar dos veces el mismo evento?',
                    a: 'Si Make no responde, Cord reintenta la entrega con el mismo identificador de evento. Agrega en tu escenario un filtro o un almacén de datos por ese identificador para no procesarlo dos veces.',
                },
            ],
            guias: [
                { label: 'Make en Cord', href: `${DOCS}/automatizacion/integraciones/make` },
                { label: 'Webhooks para desarrolladores', href: `${DOCS}/desarrolladores/herramientas/webhooks` },
            ],
            cta: { titulo: 'Tus escenarios, alimentados por tus ventas.', sub: 'Instala Cord en Make desde Ajustes y arma tu primer escenario. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Make integration: scenarios with quotes and payments | Cord',
            metaDescription: 'The Cord app for Make: instant Watch Events, actions for clients, quotes and tasks, paginated searches and Make an API Call. One-click authorization, in every Make zone.',
            eyebrow: 'INTEGRATION · MAKE',
            titulo: 'Take every Cord sale into your Make scenarios.',
            sub: 'The Cord app for Make starts your scenarios the moment something happens in Cord and creates or updates data in Cord from them. It is authorized in one click, with no API keys.',
            resumen: 'Cord Watch Events, actions and searches in your scenarios.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'Cord modules in Make',
            flujo: [
                { cord: 'Instant trigger', app: 'Watch Events', dir: 'You pick the Cord events that start the scenario' },
                { cord: 'Actions', app: 'Clients, quotes and tasks', dir: 'Create, update, get, send and mark as paid' },
                { cord: 'Searches', app: 'Search Clients and Search Quotes', dir: 'Paginated' },
                { cord: 'Universal', app: 'Make an API Call', dir: 'Any other Cord API operation' },
            ],
            blocks: [
                {
                    eyebrow: 'ONE-CLICK AUTHORIZATION',
                    titulo: 'Create the connection and authorize in Cord. That\'s it.',
                    copy: 'In a scenario you add any Cord module, press Create a connection and a Cord screen opens where you pick the workspace and authorize. Make renews access on its own and, to cut it, you revoke the connection from Settings › Developer mode › API. Authorization returns to the Make zone you came from.',
                    bullets: [
                        'OAuth 2.0, no keys to paste',
                        'Works in every Make zone',
                        'Revocable from Cord at any time',
                    ],
                },
                {
                    eyebrow: 'WATCH EVENTS',
                    titulo: 'The scenario starts the moment the client approves or pays.',
                    copy: 'Watch Events registers its own webhook in Cord with the events you choose and has an allowance separate from your plan\'s endpoints. Each event carries its id, its type, when it happened and the object data —for a quote: number, status, currency, total, client and public link—.',
                    bullets: [
                        'Events for quotes, payments, invoices and clients',
                        'The event id does not change between retries',
                        'An allowance separate from your plan\'s webhooks',
                    ],
                },
                {
                    eyebrow: 'BACK INTO CORD',
                    titulo: 'Create clients and quotes from any scenario.',
                    copy: 'Actions create, update and get clients; create, get, send and mark quotes as paid; and create tasks. For everything else, Make an API Call calls any Cord API operation with the same connection. If you would rather not install the app, Make\'s Webhooks and HTTP modules cover the same cases.',
                    bullets: [
                        'Create a Client, Update a Client, Get a Client',
                        'Create, Get, Send and Mark as Paid for quotes',
                        'Create a Task for your team',
                    ],
                },
            ],
            pasos: [
                { name: 'Install the app', text: 'In Cord, go to Settings › Integrations › Make and press Open Cord in Make. Press Install and pick your Make organization.' },
                { name: 'Create the connection', text: 'In a scenario add any Cord module and press Create a connection › Save.' },
                { name: 'Authorize in Cord', text: 'On the Cord screen pick the workspace and press Authorize.' },
            ],
            limites: [
                'Make only lets Administrators, Owners or App Developers of the Make organization install apps.',
                'The app is shared by invitation from Settings; it is not in Make\'s public catalog yet.',
                'Make does not verify the signature of Cord webhooks: treat a Make webhook URL as a secret.',
            ],
            faqs: [
                {
                    q: 'Do I need an API key to use Cord in Make?',
                    a: 'Not with the Cord app: it is authorized through OAuth on a Cord screen. You only need a key if you prefer Make\'s generic HTTP modules over the app.',
                },
                {
                    q: 'Which modules does the Cord app for Make have?',
                    a: 'Watch Events as an instant trigger; the actions Create a Client, Update a Client, Get a Client, Create a Quote, Get a Quote, Send a Quote, Mark a Quote as Paid and Create a Task; the paginated searches Search Clients and Search Quotes; and Make an API Call for any other operation.',
                },
                {
                    q: 'Does it work if my Make account is in Europe?',
                    a: 'Yes. The app works in every Make zone and authorization returns to the zone you came from.',
                },
                {
                    q: 'How do I avoid processing the same event twice?',
                    a: 'If Make does not respond, Cord retries delivery with the same event id. Add a filter or a data store keyed by that id to your scenario so it is not processed twice.',
                },
            ],
            guias: [
                { label: 'Make in Cord', href: `${DOCS_EN}/automatizacion/integraciones/make` },
                { label: 'Webhooks for developers', href: `${DOCS_EN}/desarrolladores/herramientas/webhooks` },
            ],
            cta: { titulo: 'Your scenarios, fed by your sales.', sub: 'Install Cord in Make from Settings and build your first scenario. Free to start.' },
        },
    },
    {
        slug: 'n8n',
        nombre: 'n8n',
        dominio: 'n8n.io',
        logo: BRAND_LOGOS.n8n,
        categoria: 'automatizacion',
        related: ['make', 'zapier', 'slack'],
        producto: 'workflows',
        es: {
            metaTitle: 'Nodo de Cord para n8n: automatiza ventas en tus flujos | Cord',
            metaDescription: 'Instala n8n-nodes-cord en tu n8n: Cord Trigger registra su webhook y verifica la firma de cada entrega, y el nodo Cord crea y busca clientes, cotizaciones y tareas.',
            eyebrow: 'INTEGRACIÓN · N8N',
            titulo: 'Cord dentro de tus flujos de n8n, con la firma verificada.',
            sub: 'El nodo comunitario n8n-nodes-cord registra su propio webhook en Cord, verifica la firma de cada entrega y te deja crear clientes, cotizaciones y tareas desde tus flujos.',
            resumen: 'Nodo comunitario con disparador firmado y acciones de Cord.',
            plan: 'Incluida en todos los planes de Cord; los webhooks y las llamadas cuentan en los límites de tu plan',
            flujoTitulo: 'Los nodos de Cord en n8n',
            flujo: [
                { cord: 'Cord Trigger', app: 'Eventos que eliges', dir: 'Registra el webhook al activar y lo borra al desactivar' },
                { cord: 'Clientes', app: 'Crear, actualizar, obtener y buscar', dir: 'Desde el nodo Cord' },
                { cord: 'Cotizaciones', app: 'Crear, obtener, buscar, enviar y marcar pagada', dir: 'Desde el nodo Cord' },
                { cord: 'Tareas', app: 'Crear', dir: 'Desde el nodo Cord' },
            ],
            blocks: [
                {
                    eyebrow: 'DISPARADOR FIRMADO',
                    titulo: 'Un POST que no viene de Cord se descarta.',
                    copy: 'Cord Trigger verifica la firma de cada entrega antes de arrancar el flujo, así que nadie puede disparar tu automatización mandando datos falsos a la URL del webhook. Al activar el flujo, n8n registra el webhook en Cord por ti y lo borra cuando lo desactivas.',
                    bullets: [
                        'Verificación de la firma X-Cord-Signature-V1',
                        'Registro y borrado del webhook automáticos',
                        'Eliges los eventos que arrancan el flujo',
                    ],
                },
                {
                    eyebrow: 'TU INSTANCIA, TUS DATOS',
                    titulo: 'Pensado para quien opera su propio n8n.',
                    copy: 'El nodo se instala desde Settings › Community nodes con permiso de administrador en tu instalación de n8n. La credencial Cord API usa una llave secreta de Cord; las llaves de prueba trabajan contra tu entorno de prueba y el botón de probar te dice cuál estás usando.',
                    bullets: [
                        'Paquete publicado en npm con constancia de origen',
                        'Llaves de prueba para tu entorno de prueba',
                        'El nodo HTTP Request cubre cualquier endpoint restante',
                    ],
                },
            ],
            pasos: [
                { name: 'Instala el nodo', text: 'En n8n, entra a Settings › Community nodes e instala n8n-nodes-cord.' },
                { name: 'Crea una llave', text: 'En Cord, activa el modo desarrollador al final del índice de Ajustes y crea una llave secreta con permiso de escritura en la pestaña API.' },
                { name: 'Agrega la credencial', text: 'En n8n crea una credencial Cord API, pega la llave y pruébala.' },
                { name: 'Arma el flujo', text: 'Agrega Cord Trigger con los eventos que quieras y el nodo Cord para actuar sobre clientes, cotizaciones y tareas. Activa el flujo.' },
            ],
            limites: [
                'Hoy funciona en n8n autoalojado; en n8n Cloud aparecerá cuando n8n termine de verificar el nodo.',
                'n8n se conecta con una llave de API, no con OAuth: cada instancia tiene su propia dirección de regreso.',
                'Los webhooks y las llamadas de API cuentan contra los límites de tu plan, igual que con Zapier o Make.',
            ],
            faqs: [
                {
                    q: '¿El nodo de Cord funciona en n8n Cloud?',
                    a: 'Todavía no. Hoy funciona en n8n autoalojado; aparecerá en el panel de nodos de n8n Cloud cuando n8n termine de verificarlo. Se envió a verificación en septiembre de 2026.',
                },
                {
                    q: '¿Qué puedo hacer con el nodo Cord?',
                    a: 'Crear, actualizar, obtener y buscar clientes; crear, obtener, buscar, enviar y marcar pagadas cotizaciones; y crear tareas. Para cualquier otro endpoint puedes usar el nodo HTTP Request contra la API de Cord.',
                },
                {
                    q: '¿Cómo sé que un evento viene de Cord?',
                    a: 'Cord Trigger verifica la firma X-Cord-Signature-V1 de cada entrega; un POST a la URL del webhook que no venga de Cord se descarta.',
                },
                {
                    q: '¿Puedo probar sin tocar mis datos reales?',
                    a: 'Sí. Las llaves que empiezan con sk_test_ trabajan contra tu entorno de prueba, y el botón de probar de la credencial te dice si la llave es de prueba o de producción.',
                },
            ],
            guias: [
                { label: 'Conectar n8n', href: 'https://cordhq.app/soporte/conectar-n8n' },
                { label: 'API de Cord', href: `${DOCS}/desarrolladores/empezar/resumen` },
            ],
            cta: { titulo: 'Tu automatización, con datos que sí vienen de Cord.', sub: 'Instala n8n-nodes-cord y conecta tu cuenta con una llave. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Cord node for n8n: automate sales in your flows | Cord',
            metaDescription: 'Install n8n-nodes-cord in your n8n: Cord Trigger registers its webhook and verifies every delivery\'s signature, and the Cord node creates and searches clients, quotes and tasks.',
            eyebrow: 'INTEGRATION · N8N',
            titulo: 'Cord inside your n8n flows, with the signature verified.',
            sub: 'The n8n-nodes-cord community node registers its own webhook in Cord, verifies the signature of every delivery and lets you create clients, quotes and tasks from your flows.',
            resumen: 'A community node with a signed trigger and Cord actions.',
            plan: 'Included in every Cord plan; webhooks and calls count toward your plan limits',
            flujoTitulo: 'Cord nodes in n8n',
            flujo: [
                { cord: 'Cord Trigger', app: 'The events you choose', dir: 'Registers the webhook on activate and deletes it on deactivate' },
                { cord: 'Clients', app: 'Create, update, get and search', dir: 'From the Cord node' },
                { cord: 'Quotes', app: 'Create, get, search, send and mark paid', dir: 'From the Cord node' },
                { cord: 'Tasks', app: 'Create', dir: 'From the Cord node' },
            ],
            blocks: [
                {
                    eyebrow: 'SIGNED TRIGGER',
                    titulo: 'A POST that does not come from Cord is dropped.',
                    copy: 'Cord Trigger verifies the signature of every delivery before starting the flow, so nobody can fire your automation by sending fake data to the webhook URL. When you activate the flow, n8n registers the webhook in Cord for you and deletes it when you deactivate it.',
                    bullets: [
                        'X-Cord-Signature-V1 signature verification',
                        'Automatic webhook registration and removal',
                        'You choose the events that start the flow',
                    ],
                },
                {
                    eyebrow: 'YOUR INSTANCE, YOUR DATA',
                    titulo: 'Built for teams that run their own n8n.',
                    copy: 'The node installs from Settings › Community nodes with admin rights on your n8n installation. The Cord API credential uses a Cord secret key; test keys work against your test environment and the test button tells you which one you are using.',
                    bullets: [
                        'Package published on npm with provenance',
                        'Test keys for your test environment',
                        'The HTTP Request node covers any remaining endpoint',
                    ],
                },
            ],
            pasos: [
                { name: 'Install the node', text: 'In n8n, open Settings › Community nodes and install n8n-nodes-cord.' },
                { name: 'Create a key', text: 'In Cord, turn on developer mode at the bottom of the Settings index and create a secret key with write permission in the API tab.' },
                { name: 'Add the credential', text: 'In n8n create a Cord API credential, paste the key and test it.' },
                { name: 'Build the flow', text: 'Add Cord Trigger with the events you want and the Cord node to act on clients, quotes and tasks. Activate the flow.' },
            ],
            limites: [
                'Today it works on self-hosted n8n; it will appear in n8n Cloud once n8n finishes verifying the node.',
                'n8n connects with an API key, not OAuth: every instance has its own return address.',
                'Webhooks and API calls count against your plan limits, just like with Zapier or Make.',
            ],
            faqs: [
                {
                    q: 'Does the Cord node work on n8n Cloud?',
                    a: 'Not yet. Today it works on self-hosted n8n; it will show up in the n8n Cloud node panel once n8n finishes verifying it. It was submitted for verification in September 2026.',
                },
                {
                    q: 'What can I do with the Cord node?',
                    a: 'Create, update, get and search clients; create, get, search, send and mark quotes as paid; and create tasks. For any other endpoint you can use the HTTP Request node against the Cord API.',
                },
                {
                    q: 'How do I know an event comes from Cord?',
                    a: 'Cord Trigger verifies the X-Cord-Signature-V1 signature of every delivery; a POST to the webhook URL that does not come from Cord is dropped.',
                },
                {
                    q: 'Can I test without touching my real data?',
                    a: 'Yes. Keys starting with sk_test_ work against your test environment, and the credential\'s test button tells you whether the key is a test or a production key.',
                },
            ],
            guias: [
                { label: 'Connect n8n', href: 'https://cordhq.app/en/support/conectar-n8n' },
                { label: 'Cord API', href: `${DOCS_EN}/desarrolladores/empezar/resumen` },
            ],
            cta: { titulo: 'Your automation, with data that really comes from Cord.', sub: 'Install n8n-nodes-cord and connect your account with a key. Free to start.' },
        },
    },
    {
        slug: 'teams',
        nombre: 'Microsoft Teams',
        dominio: 'teams.microsoft.com',
        logo: BRAND_LOGOS.teams,
        categoria: 'comunicacion',
        related: ['slack', 'whatsapp', 'hubspot'],
        producto: 'workflows',
        es: {
            metaTitle: 'Integración con Microsoft Teams: avisos de ventas en tu canal | Cord',
            metaDescription: 'Conecta un canal de Microsoft Teams con un flujo de Power Automate: tarjetas cuando una cotización se ve, se aprueba o se paga, y mensajes propios desde tus workflows.',
            eyebrow: 'INTEGRACIÓN · MICROSOFT TEAMS',
            titulo: 'Tus ventas, en una tarjeta dentro de tu canal de Teams.',
            sub: 'Cord publica en Teams a través de un flujo de Power Automate: pegas la URL del flujo y tu canal recibe una tarjeta cuando una cotización avanza, sin que nadie abra Cord.',
            resumen: 'Tarjetas de tus cotizaciones y mensajes de workflows en tu canal.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Qué llega a tu canal',
            flujo: [
                { cord: 'Cotización vista, aprobada o rechazada', app: 'Tarjeta en el canal', dir: 'Los eventos que marques' },
                { cord: 'Pago recibido o vencido', app: 'Tarjeta en el canal', dir: 'Los eventos que marques' },
                { cord: 'Un workflow', app: 'Tu propio texto con datos del evento', dir: 'Aunque los avisos estén apagados' },
            ],
            blocks: [
                {
                    eyebrow: 'CON EL FLUJO DE TU CANAL',
                    titulo: 'Microsoft retiró los conectores antiguos. Cord usa el camino vigente.',
                    copy: 'Los Incoming Webhook de Office 365 están retirados, así que la URL que Cord necesita la da un flujo de Power Automate del canal: la plantilla "Post to a channel when a webhook request is received". Pegas esa URL en Cord, pulsas Enviar prueba y aparece una tarjeta de ejemplo en el canal.',
                    bullets: [
                        'Plantilla oficial de Workflows en Teams',
                        'Enviar prueba antes de encender avisos',
                        'La URL es una credencial: si se filtra, borra el flujo y crea otro',
                    ],
                },
                {
                    eyebrow: 'CADA CANAL POR SEPARADO',
                    titulo: 'Unos eventos a Teams, otros al correo o a Slack.',
                    copy: 'En Ajustes › Notificaciones marcas la columna Teams en los eventos que quieras: cotización vista, aprobada, rechazada, pagada, por vencer y pago vencido. Cada canal se marca por separado. Con la acción Enviar un mensaje a Teams de Cord Workflows publicas tu propio texto con datos del evento.',
                    bullets: [
                        'Correo, Slack y Teams como columnas independientes',
                        'Mensajes propios desde Cord Workflows',
                        'El workflow publica aunque esos avisos estén apagados',
                    ],
                },
            ],
            pasos: [
                { name: 'Crea el flujo en Teams', text: 'En el canal, abre Workflows desde el menú de los tres puntos y usa la plantilla "Post to a channel when a webhook request is received". Elige el equipo y el canal.' },
                { name: 'Copia la URL del flujo', text: 'Al terminar el asistente, copia la URL del flujo; empieza con https://prod- y termina en logic.azure.com.' },
                { name: 'Pégala en Cord', text: 'En Ajustes › Integraciones › Microsoft Teams pega la URL, guarda y pulsa Enviar prueba.' },
                { name: 'Elige los avisos', text: 'En Ajustes › Notificaciones marca la columna Teams en los eventos que quieras.' },
            ],
            limites: [
                'Hoy la conexión es con la URL de un flujo de Power Automate; conectar con tu cuenta de Microsoft y elegir el equipo y el canal desde Cord todavía no está disponible.',
                'Si el flujo se apaga o se borra en Teams, Cord no puede publicar hasta que lo actives o pegues una URL nueva.',
            ],
            faqs: [
                {
                    q: '¿Por qué Cord usa Power Automate y no un Incoming Webhook?',
                    a: 'Porque Microsoft retiró los conectores antiguos de Teams (los Incoming Webhook de Office 365). La URL vigente para publicar en un canal es la de un flujo de Power Automate, y es la que Cord usa.',
                },
                {
                    q: '¿Qué avisos puedo recibir en Teams?',
                    a: 'Cotización vista, aprobada, rechazada, pagada, por vencer y pago vencido. Los marcas en Ajustes › Notificaciones, por separado de los de Slack y el correo.',
                },
                {
                    q: '¿Puedo mandar mensajes con mi propio texto?',
                    a: 'Sí, con la acción Enviar un mensaje a Teams de Cord Workflows, usando datos del evento como {{cliente}}, {{folio}} o {{total}}. Publica aunque los avisos de Notificaciones estén apagados.',
                },
                {
                    q: '¿Qué hago si Teams no acepta la tarjeta?',
                    a: 'Normalmente el flujo se apagó o se borró en Teams. Ábrelo en Workflows y actívalo, o crea otro y pega la URL nueva en Cord.',
                },
            ],
            guias: [
                { label: 'Conectar Microsoft Teams', href: 'https://cordhq.app/soporte/conectar-teams' },
                { label: 'Acciones de workflows', href: `${DOCS}/automatizacion/workflows/acciones` },
            ],
            cta: { titulo: 'Que tu equipo vea la venta donde ya conversa.', sub: 'Conecta tu canal de Teams desde Ajustes y elige qué avisos quieres. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Microsoft Teams integration: sales alerts in your channel | Cord',
            metaDescription: 'Connect a Microsoft Teams channel with a Power Automate flow: cards when a quote is viewed, approved or paid, and your own messages from your workflows.',
            eyebrow: 'INTEGRATION · MICROSOFT TEAMS',
            titulo: 'Your sales, in a card inside your Teams channel.',
            sub: 'Cord posts to Teams through a Power Automate flow: you paste the flow URL and your channel gets a card when a quote moves forward, without anyone opening Cord.',
            resumen: 'Quote cards and workflow messages in your channel.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'What reaches your channel',
            flujo: [
                { cord: 'Quote viewed, approved or rejected', app: 'Card in the channel', dir: 'The events you tick' },
                { cord: 'Payment received or overdue', app: 'Card in the channel', dir: 'The events you tick' },
                { cord: 'A workflow', app: 'Your own text with event data', dir: 'Even with alerts turned off' },
            ],
            blocks: [
                {
                    eyebrow: 'WITH YOUR CHANNEL\'S FLOW',
                    titulo: 'Microsoft retired the old connectors. Cord uses the current path.',
                    copy: 'Office 365 Incoming Webhooks are retired, so the URL Cord needs comes from a Power Automate flow on the channel: the "Post to a channel when a webhook request is received" template. You paste that URL in Cord, press Send test and a sample card appears in the channel.',
                    bullets: [
                        'Official Workflows template in Teams',
                        'Send a test before turning alerts on',
                        'The URL is a credential: if it leaks, delete the flow and create another',
                    ],
                },
                {
                    eyebrow: 'EACH CHANNEL SEPARATELY',
                    titulo: 'Some events to Teams, others to email or Slack.',
                    copy: 'In Settings › Notifications you tick the Teams column on the events you want: quote viewed, approved, rejected, paid, expiring and payment overdue. Each channel is ticked separately. With the Send a Teams message action in Cord Workflows you post your own text with event data.',
                    bullets: [
                        'Email, Slack and Teams as independent columns',
                        'Your own messages from Cord Workflows',
                        'The workflow posts even with those alerts off',
                    ],
                },
            ],
            pasos: [
                { name: 'Create the flow in Teams', text: 'In the channel, open Workflows from the three-dot menu and use the "Post to a channel when a webhook request is received" template. Pick the team and the channel.' },
                { name: 'Copy the flow URL', text: 'When the wizard finishes, copy the flow URL; it starts with https://prod- and ends in logic.azure.com.' },
                { name: 'Paste it in Cord', text: 'In Settings › Integrations › Microsoft Teams paste the URL, save and press Send test.' },
                { name: 'Choose the alerts', text: 'In Settings › Notifications tick the Teams column on the events you want.' },
            ],
            limites: [
                'Today the connection uses a Power Automate flow URL; connecting with your Microsoft account and picking the team and channel from Cord is not available yet.',
                'If the flow is turned off or deleted in Teams, Cord cannot post until you turn it on or paste a new URL.',
            ],
            faqs: [
                {
                    q: 'Why does Cord use Power Automate instead of an Incoming Webhook?',
                    a: 'Because Microsoft retired the old Teams connectors (Office 365 Incoming Webhooks). The current URL for posting to a channel is a Power Automate flow\'s, and that is what Cord uses.',
                },
                {
                    q: 'Which alerts can I get in Teams?',
                    a: 'Quote viewed, approved, rejected, paid, expiring and payment overdue. You tick them in Settings › Notifications, separately from Slack and email.',
                },
                {
                    q: 'Can I send messages with my own text?',
                    a: 'Yes, with the Send a Teams message action in Cord Workflows, using event data such as {{client}}, {{folio}} or {{total}}. It posts even with Notifications alerts turned off.',
                },
                {
                    q: 'What if Teams does not accept the card?',
                    a: 'Usually the flow was turned off or deleted in Teams. Open it in Workflows and turn it on, or create another and paste the new URL in Cord.',
                },
            ],
            guias: [
                { label: 'Connect Microsoft Teams', href: 'https://cordhq.app/en/support/conectar-teams' },
                { label: 'Workflow actions', href: `${DOCS_EN}/automatizacion/workflows/acciones` },
            ],
            cta: { titulo: 'Let your team see the sale where they already talk.', sub: 'Connect your Teams channel from Settings and choose your alerts. Free to start.' },
        },
    },
    {
        slug: 'whatsapp',
        nombre: 'WhatsApp Business',
        dominio: 'whatsapp.com',
        logo: BRAND_LOGOS.whatsapp,
        categoria: 'comunicacion',
        related: ['mercado-pago', 'slack', 'teams'],
        producto: 'workflows',
        es: {
            metaTitle: 'WhatsApp Business en Cord: recordatorios a tus clientes | Cord',
            metaDescription: 'Manda recordatorios de cotizaciones y facturas por WhatsApp desde tus workflows, con tu número y tu plantilla aprobada por Meta. Los mensajes salen de tu cuenta de WhatsApp Business.',
            eyebrow: 'INTEGRACIÓN · WHATSAPP BUSINESS',
            titulo: 'El recordatorio llega al chat que tu cliente sí abre.',
            sub: 'Con tu cuenta de WhatsApp Business, tus workflows mandan a cada cliente tu plantilla aprobada: la cotización por vencer, la factura del día o el link de pago. Los mensajes salen de tu número.',
            resumen: 'Recordatorios y avisos a tus clientes desde tus workflows.',
            plan: 'Incluida en todos los planes de Cord; Meta cobra cada conversación a tu cuenta',
            flujoTitulo: 'Cómo sale un mensaje',
            flujo: [
                { cord: 'Un workflow', app: 'Tu plantilla aprobada', dir: 'Cada variable del paso llena {{1}}, {{2}}… en orden' },
                { cord: 'El cliente del documento', app: 'Su teléfono con lada de país', dir: 'Nunca un número escrito en el paso' },
                { cord: 'Tu número de WhatsApp Business', app: 'El mensaje', dir: 'Sale de tu cuenta, no de la de Cord' },
            ],
            blocks: [
                {
                    eyebrow: 'CON TU PLANTILLA APROBADA',
                    titulo: 'Cord no te ofrece un campo que Meta va a rechazar.',
                    copy: 'Meta no permite iniciar una conversación con texto libre, solo con una plantilla aprobada. Por eso la acción Mandarle un WhatsApp al cliente usa el nombre de tu plantilla y rellena sus variables con datos del evento —{{cliente}}, {{folio}}, {{total}}, {{vence}}— en lugar de ofrecerte un mensaje libre que nunca se enviaría.',
                    bullets: [
                        'Tu plantilla, su idioma y sus variables',
                        'Datos del evento en cada variable',
                        'Prueba con tu propio número desde Ajustes',
                    ],
                },
                {
                    eyebrow: 'SIEMPRE AL CLIENTE CORRECTO',
                    titulo: 'El teléfono sale del cliente, no de un campo del paso.',
                    copy: 'El mensaje va al teléfono del cliente del documento y exige lada de país: el mismo número existe en varios países y Cord no adivina cuál es. El token de Meta se guarda cifrado y no se vuelve a mostrar, y los workflows mandan hasta 60 WhatsApp por hora por cuenta.',
                    bullets: [
                        'Lada de país obligatoria, sin suposiciones',
                        'Token cifrado que no se vuelve a mostrar',
                        'Tope de 60 mensajes por hora por cuenta',
                    ],
                },
            ],
            pasos: [
                { name: 'Prepara tu app en Meta', text: 'En Meta for Developers crea una app de WhatsApp Business y agrega tu número emisor.' },
                { name: 'Aprueba una plantilla', text: 'En el Administrador de WhatsApp crea una plantilla de mensaje y mándala a aprobar.' },
                { name: 'Conecta en Cord', text: 'En Ajustes › Integraciones › WhatsApp Business pega el identificador del número y un token de acceso permanente, y escribe el nombre y el idioma de tu plantilla.' },
                { name: 'Prueba y úsala', text: 'Pulsa Mandar prueba con tu propio número y agrega la acción Mandarle un WhatsApp al cliente a tus workflows.' },
            ],
            limites: [
                'La conexión se hace pegando el identificador del número y un token de Meta; conectar con un botón todavía no está disponible.',
                'Meta solo permite iniciar la conversación con una plantilla aprobada, no con texto libre.',
                'El costo por conversación lo cobra Meta a tu cuenta y depende del país.',
                'Un cliente sin teléfono con lada de país no recibe el mensaje.',
            ],
            faqs: [
                {
                    q: '¿Los mensajes salen de mi número o del de Cord?',
                    a: 'De tu número. Cord manda WhatsApp con la Cloud API de Meta y con tu cuenta de WhatsApp Business, y el costo por conversación lo cobra Meta a tu cuenta, no Cord.',
                },
                {
                    q: '¿Por qué no puedo escribir un mensaje libre?',
                    a: 'Porque Meta no permite iniciar una conversación con texto libre, solo con una plantilla aprobada. Cord usa tu plantilla y rellena sus variables con datos del evento; un campo libre prometería algo que Meta rechaza.',
                },
                {
                    q: '¿A qué número se manda el mensaje?',
                    a: 'Al teléfono del cliente del documento, guardado con lada de país. Si el número no tiene lada, el mensaje no se manda: Cord no adivina el país, porque el mismo número existe en varios.',
                },
                {
                    q: '¿Cuántos mensajes puedo mandar?',
                    a: 'Los workflows mandan hasta 60 WhatsApp por hora por cuenta, y la prueba de Ajustes hasta 5 por hora.',
                },
            ],
            guias: [
                { label: 'Conectar WhatsApp Business', href: 'https://cordhq.app/soporte/conectar-whatsapp' },
                { label: 'Acciones de workflows', href: `${DOCS}/automatizacion/workflows/acciones` },
            ],
            cta: { titulo: 'Cobra por el canal que tu cliente sí lee.', sub: 'Conecta tu WhatsApp Business y agrega el recordatorio a tu primer workflow. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'WhatsApp Business in Cord: reminders to your clients | Cord',
            metaDescription: 'Send quote and invoice reminders over WhatsApp from your workflows, with your number and your Meta-approved template. Messages go out from your WhatsApp Business account.',
            eyebrow: 'INTEGRATION · WHATSAPP BUSINESS',
            titulo: 'The reminder lands in the chat your client actually opens.',
            sub: 'With your WhatsApp Business account, your workflows send each client your approved template: the quote about to expire, the invoice due today or the payment link. Messages go out from your number.',
            resumen: 'Reminders and alerts to your clients from your workflows.',
            plan: 'Included in every Cord plan; Meta bills each conversation to your account',
            flujoTitulo: 'How a message goes out',
            flujo: [
                { cord: 'A workflow', app: 'Your approved template', dir: 'Each step variable fills {{1}}, {{2}}… in order' },
                { cord: 'The document\'s client', app: 'Their phone with country code', dir: 'Never a number typed into the step' },
                { cord: 'Your WhatsApp Business number', app: 'The message', dir: 'Sent from your account, not Cord\'s' },
            ],
            blocks: [
                {
                    eyebrow: 'WITH YOUR APPROVED TEMPLATE',
                    titulo: 'Cord does not offer you a field Meta will reject.',
                    copy: 'Meta does not allow starting a conversation with free text, only with an approved template. That is why the Send the client a WhatsApp action uses your template name and fills its variables with event data —{{client}}, {{folio}}, {{total}}, {{due}}— instead of offering a free message that would never be sent.',
                    bullets: [
                        'Your template, its language and its variables',
                        'Event data in every variable',
                        'Test with your own number from Settings',
                    ],
                },
                {
                    eyebrow: 'ALWAYS THE RIGHT CLIENT',
                    titulo: 'The phone comes from the client, not from a step field.',
                    copy: 'The message goes to the document client\'s phone and requires a country code: the same number exists in several countries and Cord does not guess which. The Meta token is stored encrypted and never shown again, and workflows send up to 60 WhatsApp messages per hour per account.',
                    bullets: [
                        'Country code required, no guessing',
                        'Encrypted token that is never shown again',
                        'A cap of 60 messages per hour per account',
                    ],
                },
            ],
            pasos: [
                { name: 'Set up your Meta app', text: 'In Meta for Developers create a WhatsApp Business app and add your sender number.' },
                { name: 'Get a template approved', text: 'In WhatsApp Manager create a message template and submit it for approval.' },
                { name: 'Connect in Cord', text: 'In Settings › Integrations › WhatsApp Business paste the phone number ID and a permanent access token, and enter your template name and language.' },
                { name: 'Test and use it', text: 'Press Send test with your own number and add the Send the client a WhatsApp action to your workflows.' },
            ],
            limites: [
                'You connect by pasting the phone number ID and a Meta token; connecting with a button is not available yet.',
                'Meta only allows starting the conversation with an approved template, not free text.',
                'Meta bills the cost per conversation to your account and it depends on the country.',
                'A client without a phone with country code does not get the message.',
            ],
            faqs: [
                {
                    q: 'Do messages go out from my number or Cord\'s?',
                    a: 'From yours. Cord sends WhatsApp with Meta\'s Cloud API and your WhatsApp Business account, and Meta bills the cost per conversation to your account, not Cord.',
                },
                {
                    q: 'Why can\'t I write a free message?',
                    a: 'Because Meta does not allow starting a conversation with free text, only with an approved template. Cord uses your template and fills its variables with event data; a free field would promise something Meta rejects.',
                },
                {
                    q: 'Which number does the message go to?',
                    a: 'The phone of the document\'s client, saved with a country code. Without a country code the message is not sent: Cord does not guess the country, because the same number exists in several.',
                },
                {
                    q: 'How many messages can I send?',
                    a: 'Workflows send up to 60 WhatsApp messages per hour per account, and the test in Settings up to 5 per hour.',
                },
            ],
            guias: [
                { label: 'Connect WhatsApp Business', href: 'https://cordhq.app/en/support/conectar-whatsapp' },
                { label: 'Workflow actions', href: `${DOCS_EN}/automatizacion/workflows/acciones` },
            ],
            cta: { titulo: 'Collect on the channel your client actually reads.', sub: 'Connect your WhatsApp Business and add the reminder to your first workflow. Free to start.' },
        },
    },
    {
        slug: 'gmail',
        nombre: 'Gmail',
        dominio: 'mail.google.com',
        logo: BRAND_LOGOS.gmail,
        categoria: 'productividad',
        related: ['whatsapp', 'slack', 'hubspot'],
        producto: 'editor',
        es: {
            metaTitle: 'Integración con Gmail: cotiza y envía desde tu correo | Cord',
            metaDescription: 'Tus cotizaciones y facturas salen desde tu Gmail, y dentro de Gmail ves el estado de cada cotización y la armas con IA a partir del correo del cliente.',
            eyebrow: 'INTEGRACIÓN · GMAIL',
            titulo: 'Cotiza y cobra desde el correo donde ya hablas con tus clientes.',
            sub: 'Conecta tu Gmail y las cotizaciones, facturas y recordatorios salen desde tu dirección. Con el complemento, dentro de Gmail ves cada cotización en vivo y la armas con IA a partir del pedido del cliente.',
            resumen: 'Envía desde tu Gmail y cotiza sin salir del correo.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis. Cotizar con IA usa las cotizaciones con IA de tu plan.',
            flujoTitulo: 'Qué pasa entre Cord y Gmail',
            flujo: [
                { cord: 'Cotización, factura o recordatorio de pago', app: 'Sale desde tu dirección de Gmail', dir: 'Al conectar tu Gmail' },
                { cord: 'Cotización del hilo', app: 'Estado y última actividad en el panel de Gmail', dir: 'Con el complemento' },
                { cord: 'Borrador de cotización', app: 'Armado con IA desde el correo del cliente', dir: 'Cuando tú lo pides' },
            ],
            blocks: [
                {
                    eyebrow: 'DESDE TU DIRECCIÓN',
                    titulo: 'El cliente reconoce al remitente y te responde a ti.',
                    copy: 'Al conectar tu Gmail, los correos que Cord manda a tus clientes salen desde tu cuenta: quedan en tus Enviados y la respuesta llega a tu bandeja. Si Gmail no acepta un envío, el correo sale desde Cord para que la factura no se pierda.',
                    bullets: [
                        'Cotizaciones, facturas y recordatorios de pago',
                        'Cord solo pide permiso para enviar; no lee tu correo',
                        'Un envío fallido sale desde Cord y la tarjeta te pide reconectar',
                    ],
                },
                {
                    eyebrow: 'DENTRO DE GMAIL',
                    titulo: 'La cotización del hilo, en vivo, junto al correo.',
                    copy: 'El complemento de Cord muestra si quien te escribe ya es tu cliente y, si el correo es de una cotización, su estado y lo último que pasó con ella. Desde ahí respondes en el mismo hilo con la cotización o armas una nueva con IA a partir del pedido del correo.',
                    bullets: [
                        'Estado y última actividad de la cotización del hilo',
                        'Responder en el mismo hilo con la tarjeta de la cotización',
                        'Insertar una cotización mientras redactas',
                    ],
                },
                {
                    eyebrow: 'TUS DATOS DE GOOGLE',
                    titulo: 'Qué lee Cord de tu cuenta de Google, y qué no.',
                    copy: 'El envío pide solo el permiso de enviar correo y tu dirección. El complemento lee únicamente el correo que tienes abierto: el remitente, el asunto y el folio de una cotización; el texto del correo viaja a Cord solo cuando pulsas Cotizar con IA. Cord no vende estos datos, no los usa para publicidad ni para entrenar modelos de IA generales, y el uso que hace de la información recibida de las APIs de Google se ajusta a la Política de Datos de Usuario de los Servicios de API de Google, incluidos los requisitos de Uso Limitado.',
                    bullets: [
                        'Sin acceso a tu bandeja completa',
                        'El texto del correo solo cuando tú lo pides',
                        'Revocas el acceso cuando quieras desde Cord o desde tu cuenta de Google',
                    ],
                },
            ],
            pasos: [
                { name: 'Conecta tu Gmail', text: 'En Ajustes › Integraciones › Gmail pulsa Conectar Gmail y autoriza el envío con tu cuenta de Google.' },
                { name: 'Manda una cotización', text: 'Envíala como siempre desde Cord: el correo sale desde tu dirección y aparece en tus Enviados.' },
                { name: 'Usa Cord dentro de Gmail', text: 'Con el complemento instalado, abre el correo de un cliente y pulsa el ícono de Cord en el panel derecho.' },
            ],
            limites: [
                'El complemento para Gmail todavía no está publicado en Google Workspace Marketplace; el envío desde tu Gmail sí está disponible.',
                'Los avisos internos de Cord (a ti y a tu equipo) siguen saliendo desde Cord.',
                'Gmail limita cuántos correos puede mandar una cuenta al día; los envíos que pasen ese límite salen desde Cord.',
            ],
            faqs: [
                {
                    q: '¿Cord puede leer mis correos?',
                    a: 'El envío no: solo pide permiso para enviar. El complemento lee únicamente el correo que tienes abierto, y del texto solo cuando pulsas Cotizar con IA. Nunca lee tu bandeja completa.',
                },
                {
                    q: '¿Qué pasa si desconecto Gmail?',
                    a: 'Los correos a tus clientes vuelven a salir desde Cord, como antes. También puedes quitar el acceso desde la configuración de seguridad de tu cuenta de Google.',
                },
                {
                    q: '¿Funciona con Google Workspace?',
                    a: 'Sí, con cuentas de Gmail y de Google Workspace. En Workspace, tu administrador puede tener que permitir la app.',
                },
            ],
            guias: [
                { label: 'Conectar Gmail', href: 'https://cordhq.app/soporte/conectar-gmail' },
                { label: 'Integraciones de Cord', href: `${DOCS}/automatizacion/integraciones` },
            ],
            cta: { titulo: 'Que tus cotizaciones salgan de quien las firma.', sub: 'Conecta tu Gmail desde Ajustes. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Gmail integration: quote and send from your email | Cord',
            metaDescription: 'Your quotes and invoices go out from your Gmail, and inside Gmail you see each quote\'s status and build it with AI from the client\'s email.',
            eyebrow: 'INTEGRATION · GMAIL',
            titulo: 'Quote and get paid from the inbox where you already talk to clients.',
            sub: 'Connect your Gmail and quotes, invoices and reminders go out from your address. With the add-on, inside Gmail you see each quote live and build it with AI from the client\'s order.',
            resumen: 'Send from your Gmail and quote without leaving your inbox.',
            plan: 'Included in every Cord plan, starting with Free. Quoting with AI uses your plan\'s AI quotes.',
            flujoTitulo: 'What happens between Cord and Gmail',
            flujo: [
                { cord: 'Quote, invoice or payment reminder', app: 'Sent from your Gmail address', dir: 'Once you connect Gmail' },
                { cord: 'The thread\'s quote', app: 'Status and latest activity in the Gmail panel', dir: 'With the add-on' },
                { cord: 'Draft quote', app: 'Built with AI from the client\'s email', dir: 'When you ask for it' },
            ],
            blocks: [
                {
                    eyebrow: 'FROM YOUR ADDRESS',
                    titulo: 'Clients recognize the sender and reply to you.',
                    copy: 'Once you connect Gmail, the emails Cord sends to your clients go out from your account: they stay in your Sent folder and replies land in your inbox. If Gmail rejects a send, the email goes out from Cord so the invoice is not lost.',
                    bullets: [
                        'Quotes, invoices and payment reminders',
                        'Cord only asks permission to send; it does not read your email',
                        'A failed send goes out from Cord and the card asks you to reconnect',
                    ],
                },
                {
                    eyebrow: 'INSIDE GMAIL',
                    titulo: 'The thread\'s quote, live, next to the email.',
                    copy: 'The Cord add-on shows whether the sender is already your client and, if the email is about a quote, its status and what last happened to it. From there you reply in the same thread with the quote or build a new one with AI from the order in the email.',
                    bullets: [
                        'Status and latest activity of the thread\'s quote',
                        'Reply in the same thread with the quote card',
                        'Insert a quote while you compose',
                    ],
                },
                {
                    eyebrow: 'YOUR GOOGLE DATA',
                    titulo: 'What Cord reads from your Google account, and what it does not.',
                    copy: 'Sending asks only for permission to send email and your address. The add-on reads only the email you have open: the sender, the subject and a quote number; the email text reaches Cord only when you click Quote with AI. Cord does not sell this data, does not use it for advertising or to train general AI models, and its use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.',
                    bullets: [
                        'No access to your full inbox',
                        'Email text only when you ask for it',
                        'Revoke access anytime from Cord or your Google account',
                    ],
                },
            ],
            pasos: [
                { name: 'Connect your Gmail', text: 'In Settings › Integrations › Gmail click Connect Gmail and authorize sending with your Google account.' },
                { name: 'Send a quote', text: 'Send it from Cord as usual: the email goes out from your address and shows up in your Sent folder.' },
                { name: 'Use Cord inside Gmail', text: 'With the add-on installed, open a client\'s email and click the Cord icon in the right panel.' },
            ],
            limites: [
                'The Gmail add-on is not yet published on Google Workspace Marketplace; sending from your Gmail is available now.',
                'Cord\'s internal notifications (to you and your team) still go out from Cord.',
                'Gmail limits how many emails an account can send per day; sends beyond that limit go out from Cord.',
            ],
            faqs: [
                {
                    q: 'Can Cord read my email?',
                    a: 'Sending cannot: it only asks permission to send. The add-on reads only the email you have open, and its text only when you click Quote with AI. It never reads your full inbox.',
                },
                {
                    q: 'What happens if I disconnect Gmail?',
                    a: 'Emails to your clients go back to being sent from Cord, as before. You can also remove access from your Google account\'s security settings.',
                },
                {
                    q: 'Does it work with Google Workspace?',
                    a: 'Yes, with Gmail and Google Workspace accounts. In Workspace, your administrator may need to allow the app.',
                },
            ],
            guias: [
                { label: 'Connect Gmail', href: 'https://cordhq.app/en/support/conectar-gmail' },
                { label: 'Cord integrations', href: `${DOCS_EN}/automatizacion/integraciones` },
            ],
            cta: { titulo: 'Let your quotes come from the person who signs them.', sub: 'Connect your Gmail from Settings. Free to start.' },
        },
    },
    {
        slug: 'google-sheets',
        nombre: 'Google Sheets',
        dominio: 'sheets.google.com',
        logo: BRAND_LOGOS['google-sheets'],
        categoria: 'productividad',
        related: ['excel', 'quickbooks', 'xero'],
        producto: 'finanzas',
        es: {
            metaTitle: 'Integración con Google Sheets: cotizaciones y facturas al día | Cord',
            metaDescription: 'Cada cotización y cada factura de Cord como una fila en tu hoja de Google, al día sola: importes como número, divisa en su columna y fechas en tu zona horaria.',
            eyebrow: 'INTEGRACIÓN · GOOGLE SHEETS',
            titulo: 'Tus cotizaciones y facturas en tu hoja de Google, al día solas.',
            sub: 'Cord escribe una fila por documento y la actualiza cada vez que cambia de estado. Sumas el mes, filtras por cliente y armas tus gráficas sin exportar nada.',
            resumen: 'Una fila por cotización y por factura, al día sola.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Qué se escribe en tu hoja',
            flujo: [
                { cord: 'Cotización enviada, aprobada, rechazada, vencida o pagada', app: 'Fila en la pestaña Cotizaciones', dir: 'Se reemplaza por folio' },
                { cord: 'Factura emitida, enviada, pagada, vencida o cancelada', app: 'Fila en la pestaña Facturas', dir: 'Se reemplaza por folio' },
                { cord: 'Actualizar ahora', app: 'Tus últimos 500 documentos por pestaña', dir: 'Cuando lo pides' },
            ],
            blocks: [
                {
                    eyebrow: 'DATOS QUE SIRVEN',
                    titulo: 'Números que se suman, divisas que no se mezclan.',
                    copy: 'Los importes llegan como número, no como texto, así que suman y grafican sin limpiar nada. La divisa va en su propia columna para que no sumes pesos con dólares, y las fechas llegan en la zona horaria de tu cuenta con formato AAAA-MM-DD.',
                    bullets: [
                        'Cotizaciones: folio, cliente, estado, fecha, vigencia, divisa, subtotal, descuento, impuestos, total, cobrado y link',
                        'Facturas: folio, cliente, estado, estado fiscal, fecha, vencimiento, divisa, total, pagado, saldo y link',
                        'Encabezado fijo y con filtro',
                    ],
                },
                {
                    eyebrow: 'SE GUÍA POR EL FOLIO',
                    titulo: 'Ordena, filtra y agrega tus columnas.',
                    copy: 'Cord encuentra cada documento por su folio en la columna A, no por el número de fila. Puedes ordenar, filtrar y agregar tus propias columnas a la derecha sin romper la sincronización. Y Cord solo puede abrir la hoja que crea: el resto de tu Drive no lo ve.',
                    bullets: [
                        'La fila se reemplaza, no se duplica',
                        'Un documento nuevo se agrega al final',
                        'Borrar la primera fila no rompe nada',
                    ],
                },
            ],
            pasos: [
                { name: 'Conecta', text: 'En Ajustes › Integraciones › Google Sheets pulsa Conectar Google Sheets y autoriza con tu cuenta.' },
                { name: 'Cord crea el archivo', text: 'Al volver, Cord crea el archivo y lo llena con lo que ya tenías.' },
                { name: 'Ábrelo', text: 'Pulsa Abrir la hoja. Desde ahí, cada cambio de estado se escribe solo.' },
            ],
            limites: [
                'Cord crea su propio archivo; todavía no escribe en una hoja que ya tengas.',
                'La sincronización va de Cord a la hoja: editar una fila no cambia el documento en Cord.',
            ],
            faqs: [
                { q: '¿Qué pasa si borro el archivo?', a: 'Desconecta y vuelve a conectar; Cord crea uno nuevo y lo llena.' },
                { q: '¿Puedo tener Google Sheets y Excel a la vez?', a: 'Sí. Son dos integraciones distintas y cada una lleva su propio archivo.' },
            ],
            guias: [
                { label: 'Conectar Google Sheets', href: `${DOCS}/automatizacion/integraciones/google-sheets` },
            ],
            cta: { titulo: 'Tus números donde ya los llevas.', sub: 'Conecta Google Sheets desde Ajustes. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Google Sheets integration: quotes and invoices kept current | Cord',
            metaDescription: 'Every Cord quote and invoice as a row in your Google sheet, kept current on its own: numeric amounts, currency in its own column and dates in your time zone.',
            eyebrow: 'INTEGRATION · GOOGLE SHEETS',
            titulo: 'Your quotes and invoices in your Google sheet, current on their own.',
            sub: 'Cord writes one row per document and updates it every time it changes status. Total the month, filter by client and build charts without exporting anything.',
            resumen: 'One row per quote and invoice, kept current on its own.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'What gets written to your sheet',
            flujo: [
                { cord: 'Quote sent, approved, rejected, expired or paid', app: 'Row in the Quotes tab', dir: 'Replaced by number' },
                { cord: 'Invoice issued, sent, paid, overdue or canceled', app: 'Row in the Invoices tab', dir: 'Replaced by number' },
                { cord: 'Update now', app: 'Your latest 500 documents per tab', dir: 'On request' },
            ],
            blocks: [
                {
                    eyebrow: 'USEFUL DATA',
                    titulo: 'Numbers that add up, currencies that do not mix.',
                    copy: 'Amounts arrive as numbers, not text, so they sum and chart without cleanup. Currency has its own column so you never add pesos to dollars, and dates arrive in your account time zone as YYYY-MM-DD.',
                    bullets: [
                        'Quotes: number, client, status, date, valid until, currency, subtotal, discount, taxes, total, collected and link',
                        'Invoices: number, client, status, tax status, date, due date, currency, total, paid, balance and link',
                        'Frozen, filtered header row',
                    ],
                },
                {
                    eyebrow: 'MATCHED BY NUMBER',
                    titulo: 'Sort, filter and add your own columns.',
                    copy: 'Cord finds each document by its number in column A, not by row position. You can sort, filter and add your own columns to the right without breaking the sync. And Cord can only open the sheet it creates: it never sees the rest of your Drive.',
                    bullets: [
                        'The row is replaced, not duplicated',
                        'A new document is added at the end',
                        'Deleting the first row breaks nothing',
                    ],
                },
            ],
            pasos: [
                { name: 'Connect', text: 'In Settings › Integrations › Google Sheets click Connect Google Sheets and authorize with your account.' },
                { name: 'Cord creates the file', text: 'When you come back, Cord creates the file and fills it with what you already had.' },
                { name: 'Open it', text: 'Click Open the sheet. From then on, every status change is written on its own.' },
            ],
            limites: [
                'Cord creates its own file; it does not yet write to a sheet you already have.',
                'Sync goes from Cord to the sheet: editing a row does not change the document in Cord.',
            ],
            faqs: [
                { q: 'What if I delete the file?', a: 'Disconnect and connect again; Cord creates and fills a new one.' },
                { q: 'Can I have Google Sheets and Excel at the same time?', a: 'Yes. They are two separate integrations and each keeps its own file.' },
            ],
            guias: [
                { label: 'Connect Google Sheets', href: `${DOCS_EN}/automatizacion/integraciones/google-sheets` },
            ],
            cta: { titulo: 'Your numbers where you already keep them.', sub: 'Connect Google Sheets from Settings. Free to start.' },
        },
    },
    {
        slug: 'excel',
        nombre: 'Microsoft Excel',
        dominio: 'excel.cloud.microsoft',
        logo: BRAND_LOGOS['excel'],
        categoria: 'productividad',
        related: ['google-sheets', 'quickbooks', 'xero'],
        producto: 'finanzas',
        es: {
            metaTitle: 'Integración con Microsoft Excel: cotizaciones y facturas al día | Cord',
            metaDescription: 'Cada cotización y cada factura de Cord como una fila en tu libro de Excel, al día sola: importes como número, divisa en su columna y fechas en tu zona horaria.',
            eyebrow: 'INTEGRACIÓN · MICROSOFT EXCEL',
            titulo: 'Tus cotizaciones y facturas en tu libro de Excel, al día solas.',
            sub: 'Cord escribe una fila por documento y la actualiza cada vez que cambia de estado. Sumas el mes, filtras por cliente y armas tus gráficas sin exportar nada.',
            resumen: 'Una fila por cotización y por factura, al día sola.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Qué se escribe en tu hoja',
            flujo: [
                { cord: 'Cotización enviada, aprobada, rechazada, vencida o pagada', app: 'Fila en la pestaña Cotizaciones', dir: 'Se reemplaza por folio' },
                { cord: 'Factura emitida, enviada, pagada, vencida o cancelada', app: 'Fila en la pestaña Facturas', dir: 'Se reemplaza por folio' },
                { cord: 'Actualizar ahora', app: 'Tus últimos 500 documentos por pestaña', dir: 'Cuando lo pides' },
            ],
            blocks: [
                {
                    eyebrow: 'DATOS QUE SIRVEN',
                    titulo: 'Números que se suman, divisas que no se mezclan.',
                    copy: 'Los importes llegan como número, no como texto, así que suman y grafican sin limpiar nada. La divisa va en su propia columna para que no sumes pesos con dólares, y las fechas llegan en la zona horaria de tu cuenta con formato AAAA-MM-DD.',
                    bullets: [
                        'Cotizaciones: folio, cliente, estado, fecha, vigencia, divisa, subtotal, descuento, impuestos, total, cobrado y link',
                        'Facturas: folio, cliente, estado, estado fiscal, fecha, vencimiento, divisa, total, pagado, saldo y link',
                        'Encabezado fijo y con filtro',
                    ],
                },
                {
                    eyebrow: 'SE GUÍA POR EL FOLIO',
                    titulo: 'Ordena, filtra y agrega tus columnas.',
                    copy: 'Cord encuentra cada documento por su folio en la columna A, no por el número de fila. Puedes ordenar, filtrar y agregar tus propias columnas a la derecha sin romper la sincronización. Los datos van en tablas de Excel reales, con filtros y fórmulas por nombre de columna.',
                    bullets: [
                        'La fila se reemplaza, no se duplica',
                        'Un documento nuevo se agrega al final',
                        'Borrar la primera fila no rompe nada',
                    ],
                },
            ],
            pasos: [
                { name: 'Conecta', text: 'En Ajustes › Integraciones › Microsoft Excel pulsa Conectar Excel y autoriza con tu cuenta.' },
                { name: 'Cord crea el archivo', text: 'Al volver, Cord crea el archivo y lo llena con lo que ya tenías.' },
                { name: 'Ábrelo', text: 'Pulsa Abrir la hoja. Desde ahí, cada cambio de estado se escribe solo.' },
            ],
            limites: [
                'Cord crea su propio archivo; todavía no escribe en una hoja que ya tengas.',
                'La sincronización va de Cord a la hoja: editar una fila no cambia el documento en Cord.',
            ],
            faqs: [
                { q: '¿Qué pasa si borro el archivo?', a: 'Desconecta y vuelve a conectar; Cord crea uno nuevo y lo llena.' },
                { q: '¿Puedo tener Google Sheets y Excel a la vez?', a: 'Sí. Son dos integraciones distintas y cada una lleva su propio archivo.' },
            ],
            guias: [
                { label: 'Conectar Microsoft Excel', href: `${DOCS}/automatizacion/integraciones/excel` },
            ],
            cta: { titulo: 'Tus números donde ya los llevas.', sub: 'Conecta Microsoft Excel desde Ajustes. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Microsoft Excel integration: quotes and invoices kept current | Cord',
            metaDescription: 'Every Cord quote and invoice as a row in your Excel workbook, kept current on its own: numeric amounts, currency in its own column and dates in your time zone.',
            eyebrow: 'INTEGRATION · MICROSOFT EXCEL',
            titulo: 'Your quotes and invoices in your Excel workbook, current on their own.',
            sub: 'Cord writes one row per document and updates it every time it changes status. Total the month, filter by client and build charts without exporting anything.',
            resumen: 'One row per quote and invoice, kept current on its own.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'What gets written to your sheet',
            flujo: [
                { cord: 'Quote sent, approved, rejected, expired or paid', app: 'Row in the Quotes tab', dir: 'Replaced by number' },
                { cord: 'Invoice issued, sent, paid, overdue or canceled', app: 'Row in the Invoices tab', dir: 'Replaced by number' },
                { cord: 'Update now', app: 'Your latest 500 documents per tab', dir: 'On request' },
            ],
            blocks: [
                {
                    eyebrow: 'USEFUL DATA',
                    titulo: 'Numbers that add up, currencies that do not mix.',
                    copy: 'Amounts arrive as numbers, not text, so they sum and chart without cleanup. Currency has its own column so you never add pesos to dollars, and dates arrive in your account time zone as YYYY-MM-DD.',
                    bullets: [
                        'Quotes: number, client, status, date, valid until, currency, subtotal, discount, taxes, total, collected and link',
                        'Invoices: number, client, status, tax status, date, due date, currency, total, paid, balance and link',
                        'Frozen, filtered header row',
                    ],
                },
                {
                    eyebrow: 'MATCHED BY NUMBER',
                    titulo: 'Sort, filter and add your own columns.',
                    copy: 'Cord finds each document by its number in column A, not by row position. You can sort, filter and add your own columns to the right without breaking the sync. Data goes into real Excel tables, with filters and formulas by column name.',
                    bullets: [
                        'The row is replaced, not duplicated',
                        'A new document is added at the end',
                        'Deleting the first row breaks nothing',
                    ],
                },
            ],
            pasos: [
                { name: 'Connect', text: 'In Settings › Integrations › Microsoft Excel click Connect Excel and authorize with your account.' },
                { name: 'Cord creates the file', text: 'When you come back, Cord creates the file and fills it with what you already had.' },
                { name: 'Open it', text: 'Click Open the sheet. From then on, every status change is written on its own.' },
            ],
            limites: [
                'Cord creates its own file; it does not yet write to a sheet you already have.',
                'Sync goes from Cord to the sheet: editing a row does not change the document in Cord.',
            ],
            faqs: [
                { q: 'What if I delete the file?', a: 'Disconnect and connect again; Cord creates and fills a new one.' },
                { q: 'Can I have Google Sheets and Excel at the same time?', a: 'Yes. They are two separate integrations and each keeps its own file.' },
            ],
            guias: [
                { label: 'Connect Microsoft Excel', href: `${DOCS_EN}/automatizacion/integraciones/excel` },
            ],
            cta: { titulo: 'Your numbers where you already keep them.', sub: 'Connect Microsoft Excel from Settings. Free to start.' },
        },
    },
    {
        slug: 'quickbooks',
        nombre: 'QuickBooks Online',
        dominio: 'quickbooks.intuit.com',
        logo: BRAND_LOGOS['quickbooks'],
        categoria: 'contabilidad',
        related: ['xero', 'google-sheets', 'excel'],
        producto: 'facturacion',
        es: {
            metaTitle: 'Integración con QuickBooks Online: tus facturas sin capturarlas dos veces | Cord',
            metaDescription: 'Cada factura definitiva de Cord entra a QuickBooks Online con su cliente, sus líneas y su divisa, asentada en tus libros. Sin duplicados y sin volver a capturar.',
            eyebrow: 'INTEGRACIÓN · QUICKBOOKS ONLINE',
            titulo: 'Tus facturas de Cord en QuickBooks Online, sin capturarlas dos veces.',
            sub: 'Cada factura definitiva entra a tu contabilidad con su cliente, sus conceptos y su divisa, asentada en tus libros. Dejas de cuadrar a fin de mes lo que ya estaba en dos lugares.',
            resumen: 'Tus facturas de Cord en tu contabilidad, asentada en tus libros.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Qué viaja a tu contabilidad',
            flujo: [
                { cord: 'Factura definitiva', app: 'Factura de venta con sus líneas', dir: 'Asentada en tus libros' },
                { cord: 'Cliente de la factura', app: 'Cliente o contacto, sin duplicar', dir: 'Buscado primero por correo' },
                { cord: 'Enviar las facturas pendientes', app: 'Las últimas 50 que falten', dir: 'Cuando lo pides' },
            ],
            blocks: [
                {
                    eyebrow: 'SIN DUPLICADOS',
                    titulo: 'Una factura se registra una sola vez.',
                    copy: 'Cord recuerda qué factura quedó en tu contabilidad y no la repite, aunque el evento se reintente. El cliente se busca primero por correo para no llenarte el catálogo de duplicados, y el vínculo se recuerda para las siguientes facturas.',
                    bullets: [
                        'Solo facturas definitivas, nunca cotizaciones ni borradores de Cord',
                        'El precio negociado con su descuento ya aplicado',
                        'Cada importe calculado sobre el precio ya redondeado, para que cuadre al centavo',
                    ],
                },
                {
                    eyebrow: 'CÓMO ENTRA',
                    titulo: 'Asentada, con un solo servicio en tu catálogo.',
                    copy: 'QuickBooks no maneja borradores, así que Cord solo manda facturas definitivas. Toda línea de QuickBooks cuelga de un producto: Cord usa un único servicio llamado Cord en vez de inventar uno por concepto, y deja el folio en la nota privada para no pisar tu numeración.',
                    bullets: ['Un servicio llamado Cord, creado una sola vez', 'El folio de Cord en la nota privada', 'Tu numeración de facturas intacta'],
                },
            ],
            pasos: [
                { name: 'Conecta', text: 'En Ajustes › Integraciones › QuickBooks Online pulsa Conectar QuickBooks y autoriza.' },
                { name: 'Emite como siempre', text: 'Cada factura definitiva nueva viaja sola a tu contabilidad.' },
                { name: 'Manda lo anterior', text: 'Si ya tenías facturas, pulsa Enviar las facturas pendientes.' },
            ],
            limites: [
                'Todavía no manda los pagos: el cobro se registra en tu contabilidad como siempre.',
                'Todavía no mapea tus códigos de impuesto: revisa el impuesto de la primera factura.',
                'El flujo va de Cord a tu contabilidad, no al revés.',
            ],
            faqs: [
                { q: '¿Se puede duplicar una factura?', a: 'No. Cord recuerda cada factura registrada y no la vuelve a mandar.' },
                { q: '¿Qué pasa si conecto otra empresa?', a: 'Cord empieza de cero con ella en vez de reusar los vínculos de la anterior.' },
            ],
            guias: [
                { label: 'Conectar QuickBooks Online', href: `${DOCS}/automatizacion/integraciones/quickbooks` },
            ],
            cta: { titulo: 'Emite una vez, y que tu contabilidad se entere sola.', sub: 'Conecta QuickBooks Online desde Ajustes. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'QuickBooks Online integration: your invoices without typing them twice | Cord',
            metaDescription: 'Every final Cord invoice enters QuickBooks Online with its customer, lines and currency, recorded in your books. No duplicates and no retyping.',
            eyebrow: 'INTEGRATION · QUICKBOOKS ONLINE',
            titulo: 'Your Cord invoices in QuickBooks Online, without typing them twice.',
            sub: 'Every final invoice enters your accounting with its customer, lines and currency, recorded in your books. Stop reconciling at month end what was already in two places.',
            resumen: 'Your Cord invoices in your accounting, recorded in your books.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'What travels to your accounting',
            flujo: [
                { cord: 'Final invoice', app: 'Sales invoice with its lines', dir: 'Recorded in your books' },
                { cord: 'Invoice customer', app: 'Customer or contact, not duplicated', dir: 'Looked up by email first' },
                { cord: 'Send pending invoices', app: 'The latest 50 missing ones', dir: 'On request' },
            ],
            blocks: [
                {
                    eyebrow: 'NO DUPLICATES',
                    titulo: 'An invoice is recorded only once.',
                    copy: 'Cord remembers which invoice was recorded in your accounting and does not repeat it, even if the event is retried. The customer is looked up by email first so your list does not fill with duplicates, and the link is remembered for later invoices.',
                    bullets: [
                        'Only final invoices, never quotes or Cord drafts',
                        'The negotiated price with its discount applied',
                        'Each amount computed on the already-rounded price, so it matches to the cent',
                    ],
                },
                {
                    eyebrow: 'HOW IT ARRIVES',
                    titulo: 'Recorded, with a single service in your catalog.',
                    copy: 'QuickBooks has no drafts, so Cord only sends final invoices. Every QuickBooks line hangs from a product: Cord uses one service called Cord instead of inventing one per item, and keeps its number in the private note so it never overwrites your numbering.',
                    bullets: ['One service called Cord, created once', 'The Cord number in the private note', 'Your invoice numbering untouched'],
                },
            ],
            pasos: [
                { name: 'Connect', text: 'In Settings › Integrations › QuickBooks Online click Connect QuickBooks and authorize.' },
                { name: 'Invoice as usual', text: 'Every new final invoice travels to your accounting on its own.' },
                { name: 'Send the backlog', text: 'If you already had invoices, click Send pending invoices.' },
            ],
            limites: [
                'It does not send payments yet: record the payment in your accounting as usual.',
                'It does not map your tax codes yet: check the tax on the first invoice.',
                'It flows from Cord to your accounting, not the other way.',
            ],
            faqs: [
                { q: 'Can an invoice be duplicated?', a: 'No. Cord remembers every recorded invoice and never sends it again.' },
                { q: 'What if I connect another company?', a: 'Cord starts from scratch with it instead of reusing the previous links.' },
            ],
            guias: [
                { label: 'Connect QuickBooks Online', href: `${DOCS_EN}/automatizacion/integraciones/quickbooks` },
            ],
            cta: { titulo: 'Invoice once, and let your accounting know on its own.', sub: 'Connect QuickBooks Online from Settings. Free to start.' },
        },
    },
    {
        slug: 'xero',
        nombre: 'Xero',
        dominio: 'xero.com',
        logo: BRAND_LOGOS['xero'],
        categoria: 'contabilidad',
        related: ['quickbooks', 'google-sheets', 'excel'],
        producto: 'facturacion',
        es: {
            metaTitle: 'Integración con Xero: tus facturas sin capturarlas dos veces | Cord',
            metaDescription: 'Cada factura definitiva de Cord entra a Xero con su cliente, sus líneas y su divisa, como borrador para que la apruebe tu contador. Sin duplicados y sin volver a capturar.',
            eyebrow: 'INTEGRACIÓN · XERO',
            titulo: 'Tus facturas de Cord en Xero, sin capturarlas dos veces.',
            sub: 'Cada factura definitiva entra a tu contabilidad con su cliente, sus conceptos y su divisa, como borrador para que la apruebe tu contador. Dejas de cuadrar a fin de mes lo que ya estaba en dos lugares.',
            resumen: 'Tus facturas de Cord en tu contabilidad, como borrador para que la apruebe tu contador.',
            plan: 'Incluida en todos los planes de Cord, desde Gratis',
            flujoTitulo: 'Qué viaja a tu contabilidad',
            flujo: [
                { cord: 'Factura definitiva', app: 'Factura de venta con sus líneas', dir: 'Como borrador para que la apruebe tu contador' },
                { cord: 'Cliente de la factura', app: 'Cliente o contacto, sin duplicar', dir: 'Buscado primero por correo' },
                { cord: 'Enviar las facturas pendientes', app: 'Las últimas 50 que falten', dir: 'Cuando lo pides' },
            ],
            blocks: [
                {
                    eyebrow: 'SIN DUPLICADOS',
                    titulo: 'Una factura se registra una sola vez.',
                    copy: 'Cord recuerda qué factura quedó en tu contabilidad y no la repite, aunque el evento se reintente. El cliente se busca primero por correo para no llenarte el catálogo de duplicados, y el vínculo se recuerda para las siguientes facturas.',
                    bullets: [
                        'Solo facturas definitivas, nunca cotizaciones ni borradores de Cord',
                        'El precio negociado con su descuento ya aplicado',
                        'Cada importe calculado sobre el precio ya redondeado, para que cuadre al centavo',
                    ],
                },
                {
                    eyebrow: 'CÓMO ENTRA',
                    titulo: 'En borrador, y la apruebas tú.',
                    copy: 'Un sistema de fuera no debería asentar solo en los libros de nadie: la factura entra como borrador con el folio de Cord en la referencia, y tu contador la revisa antes de aprobarla. Los importes van sin impuesto incluido porque Cord ya calculó el impuesto por línea.',
                    bullets: ['Factura de venta en estado borrador', 'El folio de Cord en la referencia', 'Permisos solo sobre facturas y contactos'],
                },
            ],
            pasos: [
                { name: 'Conecta', text: 'En Ajustes › Integraciones › Xero pulsa Conectar Xero y autoriza.' },
                { name: 'Emite como siempre', text: 'Cada factura definitiva nueva viaja sola a tu contabilidad.' },
                { name: 'Manda lo anterior', text: 'Si ya tenías facturas, pulsa Enviar las facturas pendientes.' },
            ],
            limites: [
                'Todavía no manda los pagos: el cobro se registra en tu contabilidad como siempre.',
                'Todavía no mapea tus códigos de impuesto: revisa el impuesto de la primera factura.',
                'El flujo va de Cord a tu contabilidad, no al revés.',
            ],
            faqs: [
                { q: '¿Se puede duplicar una factura?', a: 'No. Cord recuerda cada factura registrada y no la vuelve a mandar.' },
                { q: '¿Qué pasa si conecto otra empresa?', a: 'Cord empieza de cero con ella en vez de reusar los vínculos de la anterior.' },
            ],
            guias: [
                { label: 'Conectar Xero', href: `${DOCS}/automatizacion/integraciones/xero` },
            ],
            cta: { titulo: 'Emite una vez, y que tu contabilidad se entere sola.', sub: 'Conecta Xero desde Ajustes. Gratis para empezar.' },
        },
        en: {
            metaTitle: 'Xero integration: your invoices without typing them twice | Cord',
            metaDescription: 'Every final Cord invoice enters Xero with its customer, lines and currency, as a draft for your accountant to approve. No duplicates and no retyping.',
            eyebrow: 'INTEGRATION · XERO',
            titulo: 'Your Cord invoices in Xero, without typing them twice.',
            sub: 'Every final invoice enters your accounting with its customer, lines and currency, as a draft for your accountant to approve. Stop reconciling at month end what was already in two places.',
            resumen: 'Your Cord invoices in your accounting, as a draft for your accountant to approve.',
            plan: 'Included in every Cord plan, starting with Free',
            flujoTitulo: 'What travels to your accounting',
            flujo: [
                { cord: 'Final invoice', app: 'Sales invoice with its lines', dir: 'As a draft for your accountant to approve' },
                { cord: 'Invoice customer', app: 'Customer or contact, not duplicated', dir: 'Looked up by email first' },
                { cord: 'Send pending invoices', app: 'The latest 50 missing ones', dir: 'On request' },
            ],
            blocks: [
                {
                    eyebrow: 'NO DUPLICATES',
                    titulo: 'An invoice is recorded only once.',
                    copy: 'Cord remembers which invoice was recorded in your accounting and does not repeat it, even if the event is retried. The customer is looked up by email first so your list does not fill with duplicates, and the link is remembered for later invoices.',
                    bullets: [
                        'Only final invoices, never quotes or Cord drafts',
                        'The negotiated price with its discount applied',
                        'Each amount computed on the already-rounded price, so it matches to the cent',
                    ],
                },
                {
                    eyebrow: 'HOW IT ARRIVES',
                    titulo: 'As a draft, and you approve it.',
                    copy: 'An outside system should not post to anyone\'s books on its own: the invoice arrives as a draft with the Cord number as its reference, and your accountant reviews it before approving. Amounts are tax exclusive because Cord already computed tax per line.',
                    bullets: ['Sales invoice in draft status', 'The Cord number as the reference', 'Permissions only over invoices and contacts'],
                },
            ],
            pasos: [
                { name: 'Connect', text: 'In Settings › Integrations › Xero click Connect Xero and authorize.' },
                { name: 'Invoice as usual', text: 'Every new final invoice travels to your accounting on its own.' },
                { name: 'Send the backlog', text: 'If you already had invoices, click Send pending invoices.' },
            ],
            limites: [
                'It does not send payments yet: record the payment in your accounting as usual.',
                'It does not map your tax codes yet: check the tax on the first invoice.',
                'It flows from Cord to your accounting, not the other way.',
            ],
            faqs: [
                { q: 'Can an invoice be duplicated?', a: 'No. Cord remembers every recorded invoice and never sends it again.' },
                { q: 'What if I connect another company?', a: 'Cord starts from scratch with it instead of reusing the previous links.' },
            ],
            guias: [
                { label: 'Connect Xero', href: `${DOCS_EN}/automatizacion/integraciones/xero` },
            ],
            cta: { titulo: 'Invoice once, and let your accounting know on its own.', sub: 'Connect Xero from Settings. Free to start.' },
        },
    },
];

export const findIntegrationPage = (slug: string | undefined) => INTEGRATION_PAGES.find((p) => p.slug === slug) ?? null;
