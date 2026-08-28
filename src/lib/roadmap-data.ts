export interface RoadmapItem {
    id: string;
    slug: string;
    title: { es: string; en: string };
    shortDesc: { es: string; en: string };
    content: { es: string; en: string };
    area: 'cotizaciones' | 'finanzas' | 'fiscal';
    status: 'live' | 'beta' | 'next';
    api: boolean;
    family: 'quotes' | 'payments' | 'invoicing' | 'platform';
    market: { es: string; en: string };
    workflow: { es: string[]; en: string[] };
    scope: { es: string; en: string };
    boundaries: { es: string; en: string };
    related: string[];
}

type RoadmapBaseItem = Omit<RoadmapItem, 'family' | 'market' | 'workflow' | 'scope' | 'boundaries' | 'related'>;
type RoadmapEnhancement = Pick<RoadmapItem, 'family' | 'market' | 'workflow' | 'scope' | 'boundaries' | 'related'>;

const roadmapBase: RoadmapBaseItem[] = [
    {
        id: '1',
        slug: 'editor-cotizaciones',
        title: {
            es: 'Editor de cotizaciones',
            en: 'Quote Editor'
        },
        shortDesc: {
            es: 'Precios negociados línea por línea. Arrastra productos, aplica descuentos por volumen y ajusta márgenes en tiempo real con cálculo de impuestos en vivo.',
            en: 'Negotiated prices line by line. Drag and drop products, apply volume discounts, and adjust margins in real time with live tax calculations.'
        },
        content: {
            es: `## Control total sobre tus propuestas
El editor de cotizaciones de Cord está diseñado para darte agilidad sin perder control. No necesitas saltar entre hojas de Excel y formatos en PDF. Desde una sola pantalla, puedes buscar productos de tu catálogo, ajustar cantidades y ver cómo el precio cambia en tiempo real.

### Beneficios clave:
- **Impuesto por línea y por país:** cada concepto lleva su propia tasa, así que un servicio gravado y uno exento conviven en la misma cotización sin aplanarse a una sola tasa. El nombre y las tasas sugeridas cambian con el país de tu cuenta: IVA en México, Colombia, España, Argentina, Chile y Perú; VAT en Reino Unido; sales tax en Estados Unidos, sembrado por estado en las 50 entidades más D.C.; y GST/HST en Canadá. Ves el total final antes de enviar la cotización.
- **Descuentos por partida o globales:** Ideal para negociaciones donde el volumen dicta el precio.
- **Guardado automático:** Crea borradores sin perder información.`,
            en: `## Total control over your proposals
Cord's quote editor is designed to give you agility without losing control. You don't need to jump between Excel sheets and PDF formats. From a single screen, you can search for products in your catalog, adjust quantities, and see how the price changes in real-time.

### Key benefits:
- **Tax per line and country:** every line item carries its own rate, so taxed and exempt services can coexist without flattening to one rate. Names and suggested rates change with your account country: VAT in the UK; sales tax in the US, seeded by state across all 50 states plus DC; IVA in Mexico, Colombia, Spain, Argentina, Chile, and Peru; and GST/HST in Canada. You see the final total before sending the quote.
- **Line-item or global discounts:** Ideal for negotiations where volume dictates the price.
- **Auto-save:** Create drafts without losing information.`
        },
        area: 'cotizaciones',
        status: 'live',
        api: true
    },
    {
        id: '2',
        slug: 'link-publico',
        title: {
            es: 'Link público interactivo',
            en: 'Interactive Public Link'
        },
        shortDesc: {
            es: 'Tu cliente aprueba en un clic desde su celular. Olvídate de los PDFs estáticos. Entrega una experiencia de marca profesional y digital.',
            en: 'Your client approves in one click from their phone. Forget about static PDFs. Deliver a professional and digital brand experience.'
        },
        content: {
            es: `## La mejor primera impresión
Cuando envías una cotización, tu cliente no recibe un archivo muerto adjunto a un correo. Recibe un enlace único y seguro donde tu marca es la protagonista.

Al abrir el enlace, el cliente puede ver el detalle completo de los productos, los términos de pago y, lo más importante, un botón prominente para "Aprobar cotización".

### Beneficios clave:
- **Aprobación sin fricción:** Tu cliente no necesita crear una cuenta para aceptar los términos.
- **Optimizado para móviles:** La gran mayoría de los tomadores de decisiones revisan correos en el celular. Nuestro link se ve perfecto en cualquier dispositivo.
- **Historial inmutable:** Una vez aprobada, la cotización se congela, evitando confusiones sobre qué versión de PDF era la correcta.`,
            en: `## The best first impression
When you send a quote, your client doesn't receive a dead file attached to an email. They receive a unique, secure link where your brand takes center stage.

Upon opening the link, the client can see the full product details, payment terms, and most importantly, a prominent "Approve Quote" button.

### Key benefits:
- **Frictionless approval:** Your client doesn't need to create an account to accept terms.
- **Mobile-optimized:** Most decision-makers review emails on their phones. Our link looks perfect on any device.
- **Immutable history:** Once approved, the quote is frozen, preventing confusion over which PDF version was correct.`
        },
        area: 'cotizaciones',
        status: 'live',
        api: false
    },
    {
        id: '3',
        slug: 'seguimiento-vivo',
        title: {
            es: 'Seguimiento en vivo',
            en: 'Live Tracking'
        },
        shortDesc: {
            es: 'Te avisamos por correo o Slack en el momento en que tu cliente abre la cotización, y ves en vivo si la sigue viendo. Llama en el momento de mayor interés y cierra más tratos.',
            en: 'We alert you by email or Slack the moment your client opens the quote, and you can see live whether they are still viewing it. Call them when they are most interested and close more deals.'
        },
        content: {
            es: `## El poder del "Timing"
Saber exactamente cuándo tu cliente está evaluando tu propuesta cambia por completo la dinámica de ventas. Con el seguimiento en vivo de Cord, te enteras por correo o Slack en cuanto tu prospecto hace clic en el enlace, y si tienes la cotización abierta, un indicador te dice si la sigue viendo en ese momento.

### Beneficios clave:
- **Llamadas oportunas:** Llama cuando la actividad indica interés reciente, sin adivinar si la propuesta ya fue revisada.
- **Menos seguimiento manual:** Olvídate del correo "Hola, ¿tuviste oportunidad de revisar mi cotización?". Ahora lo sabes con certeza.
- **Analíticas de interés:** Descubre si un cliente abre la cotización múltiples veces a lo largo de los días, lo que indica un alto nivel de interés.`,
            en: `## The power of Timing
Knowing exactly when your client is evaluating your proposal completely changes the sales dynamic. With Cord's live tracking, you find out by email or Slack the moment your prospect clicks the link, and if you have the quote open, an indicator tells you whether they're viewing it right now.

### Key benefits:
- **Timely calls:** Reach out when activity shows recent interest, without guessing whether the proposal has been reviewed.
- **Less manual follow-up:** Forget the "Hi, did you get a chance to review my quote?" email. Now you know for sure.
- **Interest analytics:** Discover if a client opens the quote multiple times over several days, indicating a high level of interest.`
        },
        area: 'cotizaciones',
        status: 'live',
        api: true
    },
    {
        id: '4',
        slug: 'cord-elements',
        title: {
            es: 'Cord Elements',
            en: 'Cord Elements'
        },
        shortDesc: {
            es: 'Embebe nuestro motor de cotizaciones directamente en el portal de tu empresa o sitio web. SDK estable (React, Vue, Web Component) con hooks headless para construir tu propia experiencia.',
            en: 'Embed our quoting engine directly into your company portal or website. Stable SDK (React, Vue, Web Component) with headless hooks to build your own experience.'
        },
        content: {
            es: `## Cotizaciones en piloto automático
Con Cord Elements, puedes ofrecer una experiencia de "autoservicio" a tus clientes mayoristas recurrentes. Al integrar unas pocas líneas de código en tu portal existente, habilitas un carrito de compras especializado para tratos comerciales complejos.

### Beneficios clave:
- **Menor carga operativa:** Tus agentes de ventas no tienen que armar cotizaciones repetitivas para clientes habituales.
- **Precios dinámicos respetados:** Elements lee la lista de precios específica asignada a ese cliente y muestra sus descuentos negociados automáticamente.
- **UI personalizable de verdad:** Usa el cotizador con tu marca tal cual, o construye tu propia interfaz por completo con los hooks headless (\`useQuoteBuilder\`); el SDK nunca te obliga a pelear con estilos que no puedes sobreescribir.
- **Tipado end-to-end:** Los tipos de TypeScript se generan del código real, no se escriben a mano; tu editor siempre sabe qué existe.`,
            en: `## Quotes on autopilot
With Cord Elements, you can offer a "self-service" experience to your recurring wholesale clients. By embedding a few lines of code into your existing portal, you enable a specialized shopping cart for complex commercial deals.

### Key benefits:
- **Lower operational load:** Your sales agents don't have to build repetitive quotes for regular clients.
- **Dynamic pricing respected:** Elements reads the specific price list assigned to that client and automatically displays their negotiated discounts.
- **Real customizable UI:** Use the quoter with your brand as-is, or build your entire own interface with the headless hooks (\`useQuoteBuilder\`); the SDK never forces you to fight styles you can't override.
- **End-to-end typed:** TypeScript types are generated from the real code, never hand-written; your editor always knows what's there.`
        },
        area: 'cotizaciones',
        status: 'live',
        api: true
    },
    {
        id: '12',
        slug: 'sello-de-confianza',
        title: {
            es: 'Sello de confianza y firma verificable',
            en: 'Trust seal & verifiable signature'
        },
        shortDesc: {
            es: 'Cada cotización que aprueba tu cliente queda ligada a un hash SHA-256, su IP y la fecha exacta. Un sello visible identifica la versión aceptada antes de continuar a facturación.',
            en: 'Every approved quote is tied to a SHA-256 hash, the client IP, and the exact date. A visible seal identifies the accepted version before invoicing continues.'
        },
        content: {
            es: `## El respaldo que evita el "yo nunca aprobé eso"
Cotizar por WhatsApp o PDF suelto no deja una prueba integrada de que tu cliente aceptó los términos. Cord liga cada aprobación con un hash criptográfico, nombre, IP, fecha y hora, y lo muestra en un sello visible dentro de la misma cotización.

### Beneficios clave:
- **Evidencia real, no solo un "aprobado":** El sello de auditoría queda ligado a la versión exacta de la cotización que tu cliente vio y aceptó.
- **Continuidad hacia facturación:** La versión aprobada conserva la base comercial que Cord utiliza al preparar la factura; los datos fiscales se validan antes de timbrar.
- **Visible en todos lados:** El mismo sello aparece tanto en el link público (\`/q\`) como en cualquier cotizador embebido con Cord Elements en tu propio sitio; no es exclusivo de un canal.`,
            en: `## The backup that ends "I never approved that"
Quoting over WhatsApp or a loose PDF leaves no integrated proof that your client accepted the terms. Cord ties every approval to a cryptographic hash, name, IP, date, and time, then shows it in a visible seal inside the quote.

### Key benefits:
- **Real evidence, not just an "approved" flag:** The audit seal is tied to the exact version of the quote your client saw and accepted.
- **Continuity into invoicing:** The approved version keeps the commercial basis Cord uses to prepare the invoice; fiscal data is validated before stamping.
- **Visible everywhere:** The same seal shows up on the public link (\`/q\`) and on any quote embedded via Cord Elements on your own site; it isn't exclusive to one channel.`
        },
        area: 'cotizaciones',
        status: 'live',
        api: false
    },
    {
        id: '5',
        slug: 'clientes-credito',
        title: {
            es: 'Clientes y crédito (Net 30/60)',
            en: 'Clients & Credit (Net 30/60)'
        },
        shortDesc: {
            es: 'Asigna límites de crédito y términos de pago por cliente. Cord bloquea nuevas cotizaciones si el cliente excede su límite o tiene facturas vencidas.',
            en: 'Assign credit limits and payment terms per client. Cord blocks new quotes if the client exceeds their limit or has overdue invoices.'
        },
        content: {
            es: `## Control de riesgo automatizado
Vender a crédito es estándar, pero controlar ese riesgo suele requerir comunicación manual constante entre el equipo de ventas y el equipo de finanzas. Cord automatiza estas reglas.

### Beneficios clave:
- **Límites de crédito duros:** Si un cliente tiene un límite de $100,000 MXN y ya tiene deuda por $95,000, un agente no podrá aprobarle una cotización de $10,000.
- **Términos Net 30/60:** Al aprobar la cotización, Cord programa automáticamente la fecha de vencimiento y el ciclo de cobranza.
- **Autonomía para ventas:** Los agentes pueden vender libremente siempre que el cliente esté al corriente, sin fricción ni autorizaciones manuales.
- **Ficha del cliente:** cada perfil de cliente muestra su uso de crédito en vivo (saldo abierto vs. límite, con aviso si lo excede), su tasa de cierre real y el descuento que se le ha cedido en negociación; la misma señal que usa el motor de riesgo, visible de un vistazo.`,
            en: `## Automated risk control
Selling on credit is standard, but controlling that risk usually requires constant manual communication between sales and finance teams. Cord automates these rules.

### Key benefits:
- **Hard credit limits:** If a client has a $100,000 MXN limit and already owes $95,000, an agent won't be able to approve a $10,000 quote for them.
- **Net 30/60 Terms:** Upon approving the quote, Cord automatically schedules the due date and the collections cycle.
- **Autonomy for sales:** Agents can sell freely as long as the client is in good standing, without friction or manual authorizations.
- **Client profile:** every client profile shows live credit usage (open balance vs. limit, with a warning if they're over it), their real close rate, and the discount you've given them in negotiation; the same signal the risk engine uses, visible at a glance.`
        },
        area: 'finanzas',
        status: 'live',
        api: true
    },
    {
        id: '6',
        slug: 'multi-divisa-fx',
        title: {
            es: 'Multi-divisa y FX',
            en: 'Multi-currency & FX'
        },
        shortDesc: {
            es: 'Cotiza y cobra en la moneda de tu cliente, lleva tus libros en la tuya. El tipo de cambio se congela 30 días al cotizar y la factura lo declara.',
            en: 'Quote and charge in your client currency, keep your books in yours. The exchange rate locks for 30 days at quote time and the invoice states it.'
        },
        content: {
            es: `## Vender en otra moneda, sin sorpresas
Cuando el ciclo de venta dura semanas, el tipo de cambio del día que cotizaste y el del día que cobras no son el mismo. Cord separa dos monedas y las mantiene consistentes de punta a punta: la moneda en la que le vendes a tu cliente, y la de tu contabilidad.

### Beneficios clave:
- **Tipo de cambio congelado 30 días:** al guardar la cotización, la tasa del día queda fija. Puedes añadir un colchón sobre ella para absorber la volatilidad de la ventana de crédito.
- **La factura lo declara:** el comprobante se emite en la moneda de la venta e imprime el tipo de cambio aplicado y el total convertido a tu moneda contable. En México es el TipoCambio que exige el SAT en un CFDI que no está en pesos.
- **Cobro en la moneda correcta:** el cliente paga con tarjeta en la moneda de la cotización, no en una convertida a última hora.
- **Sin tasas inventadas:** si el tipo de cambio no se puede obtener en ese momento, Cord no guarda la cotización y te lo dice, en vez de usar un número aproximado que después aparece en una factura.`,
            en: `## Selling in another currency, without surprises
When a sales cycle takes weeks, the exchange rate on the day you quoted and the day you get paid aren't the same. Cord keeps two currencies apart and consistent end to end: the one you sell in, and the one your books use.

### Key benefits:
- **Rate locked for 30 days:** saving the quote fixes that day's rate. You can add a cushion on top to absorb volatility during the credit window.
- **The invoice states it:** the document is issued in the selling currency and prints the applied exchange rate plus the total converted to your accounting currency. In Mexico that's the TipoCambio the SAT requires on a CFDI that isn't in pesos.
- **Charged in the right currency:** your client pays by card in the quote's currency, not one converted at the last minute.
- **No invented rates:** if the exchange rate can't be retrieved at that moment, Cord won't save the quote and tells you, instead of using an approximate number that shows up on an invoice later.`
        },
        area: 'finanzas',
        status: 'live',
        api: false
    },
    {
        id: '7',
        slug: 'cobranza-ia',
        title: {
            es: 'Cobranza con IA',
            en: 'AI Collections'
        },
        shortDesc: {
            es: 'Un agente inteligente que, al vencer el crédito, escribe recordatorios cordiales por correo con el link de pago real, y si el cliente no puede pagar de golpe, negocia un plan de 2 o 3 cuotas mensuales.',
            en: 'An intelligent agent that writes polite email reminders with the real payment link once credit terms lapse. If the client cannot pay in full, it can negotiate a plan of 2 or 3 monthly installments.'
        },
        content: {
            es: `## Recupera tu dinero sin dañar la relación
Perseguir la cartera vencida es incómodo para los equipos de ventas y consume tiempo valioso del equipo administrativo. Nuestro agente de cobranza con Inteligencia Artificial lo hace por ti, y solo entra en acción cuando el crédito realmente venció.

### Beneficios clave:
- **Tono adaptativo:** La IA sabe si el cliente se retrasó por primera vez (tono amable y recordatorio) o si lleva 60 días vencido (tono más firme).
- **Link de pago real en cada correo:** Cuando tienes cobros en línea activos, el recordatorio lleva al pago del monto exacto pendiente por tarjeta o, para cuentas mexicanas que cobran en MXN, por SPEI.
- **Negocia cuotas por ti:** Si el cliente no puede saldar de golpe, el agente puede acordar un plan de 2 o 3 cuotas mensuales que suman exactamente el adeudo (sin descuentos), y crea automáticamente los cobros pagables de cada cuota.
- **Control total (opt-in):** La cobranza autónoma se activa manualmente por negocio. Tú decides cuándo tu cartera queda en manos del agente.`,
            en: `## Recover your money without damaging relationships
Chasing overdue invoices is awkward for sales teams and consumes valuable admin time. Our AI collections agent does it for you, and only steps in once the credit terms have actually lapsed.

### Key benefits:
- **Adaptive tone:** The AI knows if a client is late for the first time (polite reminder tone) or if they are 60 days overdue (firmer tone).
- **A real payment link in every email:** When online payments are active, the reminder goes to the exact outstanding amount by card or, for Mexican accounts charging in MXN, by SPEI.
- **Negotiates installments for you:** If the client can't pay in full, the agent can agree to a plan of 2 or 3 monthly installments that add up to the exact amount owed (no discounts), automatically creating the payable charges for each one.
- **Full control (opt-in):** Autonomous collections is enabled manually per business. You decide when your receivables go to the agent.`
        },
        area: 'finanzas',
        status: 'live',
        api: false
    },
    {
        id: '11',
        slug: 'anticipos-pagos-parciales',
        title: {
            es: 'Anticipos y pagos parciales',
            en: 'Deposits and Partial Payments'
        },
        shortDesc: {
            es: 'Pide un anticipo al aprobar y el saldo según los términos. El cliente ve el desglose claro y paga cada parte en línea, cada una a tu banco.',
            en: 'Ask for a deposit on approval and the balance per terms. The client sees a clear breakdown and pays each part online, straight to your bank.'
        },
        content: {
            es: `## Cobra como realmente operas
No todas las ventas se pagan de una sola vez. Muchos negocios cobran un porcentaje por adelantado para arrancar el pedido y el resto contra entrega. Cord lo hace nativo.

### Beneficios clave:
- **% de anticipo por cotización o por default:** Define un anticipo (ej. 50%) en el editor, o configúralo como default de tu negocio para que se pre-llene solo. El editor te muestra en vivo cuánto paga tu cliente al aprobar y cuánto queda de saldo.
- **Desglose claro para el cliente:** El link público muestra "total $X · hoy pagas $Y de anticipo, saldo $Z". Nada de sorpresas.
- **El pago se abre cuando tiene sentido:** Una cotización a contado se paga de inmediato; una a crédito (Net 30/60) no pide dinero hasta que llega la fecha de vencimiento. El anticipo, si lo hay, siempre es pagable al aprobar.
- **Cada parte, un cobro real:** Anticipo, saldo y cuotas son cobros independientes con su propio link, cada uno directo a tu banco vía Cord Payments. La cotización se marca pagada solo cuando no queda ningún cobro pendiente.`,
            en: `## Charge the way sales actually work
Not every sale is paid all at once. Many businesses collect a percentage up front to kick off the order and the rest on delivery. Cord makes it native.

### Key benefits:
- **Deposit % per quote or as a default:** Set a deposit (e.g. 50%) in the editor, or configure it as your business default so it pre-fills. The editor shows you live how much your client pays on approval and how much is left as balance.
- **A clear breakdown for the client:** The public link shows "total $X · today you pay $Y as a deposit, balance $Z." No surprises.
- **Payment opens when it makes sense:** A cash quote is payable right away; a credit quote (Net 30/60) doesn't ask for money until the due date arrives. The deposit, if any, is always payable on approval.
- **Each part is a real charge:** Deposit, balance and installments are independent charges each with their own link, all straight to your bank via Cord Payments. The quote is marked paid only once no charge remains pending.`
        },
        area: 'finanzas',
        status: 'live',
        api: false
    },
    {
        id: '18',
        slug: 'cord-payments',
        title: {
            es: 'Cord Payments',
            en: 'Cord Payments'
        },
        shortDesc: {
            es: 'Cobra cotizaciones y facturas desde el mismo link que ya conoce tu cliente. Tarjeta en mercados compatibles y SPEI para operaciones en MXN.',
            en: 'Collect quotes and invoices from the same link your client already knows. Cards in supported markets and SPEI for MXN transactions.'
        },
        content: {
            es: `## Del acuerdo al dinero, sin cambiar de sistema
Cord Payments conecta el momento en que una venta se aprueba con el momento en que el dinero llega a tu cuenta. El cliente paga desde el link de la cotización o de la factura; Cord conserva el estado del cobro junto al documento que lo originó.

No es una cartera donde Cord retiene tus fondos. La cuenta de cobro pertenece a tu negocio y los cargos se procesan sobre esa cuenta conectada. Antes de habilitarla, Cord recopila los datos y documentos que el proveedor exige para verificar a la empresa, sus representantes y sus beneficiarios reales.

### Capacidades disponibles:
- **Tarjeta desde el link público:** el comprador paga el importe pendiente sin pedir otro enlace ni entrar a un portal separado.
- **SPEI para México:** cuando la operación está denominada en MXN, Cord puede mostrar una CLABE asociada al cobro y conciliar la transferencia cuando llega.
- **Anticipo, saldo y parcialidades:** cada parte conserva su importe, estado y referencia, y la cotización solo queda pagada cuando ya no existe saldo pendiente.
- **Facturas cobrables:** las facturas de Cord Invoicing también tienen un link público con el saldo vigente y el método disponible para esa cuenta.
- **Depósitos y conciliación:** el negocio consulta los depósitos enviados a su cuenta bancaria, su estado y la frecuencia configurada.
- **Operación posterior al cobro:** reembolsos, contracargos y evidencia permanecen ligados a la organización y al movimiento que los originó.

### Disponibilidad real
El alta de cobros en línea depende del país de la organización y de los requisitos que devuelve el proveedor. México, Estados Unidos, Canadá, Brasil, España, Reino Unido, Alemania y Francia tienen carril de cuenta conectada. Colombia, Argentina, Chile y Perú pueden cotizar, facturar y registrar pagos manuales, pero hoy no muestran el alta de Cord Payments.

SPEI es un riel mexicano y solo liquida MXN. Fuera de México, Cord no muestra ese método ni aplica una tarifa mexicana a otra divisa.`,
            en: `## From agreement to money, without switching systems
Cord Payments connects the moment a sale is approved with the moment funds reach your account. The client pays from the quote or invoice link; Cord keeps the payment state next to the document that created it.

This is not a wallet where Cord holds your funds. The payment account belongs to your business and charges are processed on that connected account. Before enabling it, Cord collects the information and documents the provider requires to verify the company, its representatives, and its beneficial owners.

### Available capabilities:
- **Card payments from the public link:** the buyer pays the outstanding amount without requesting another link or entering a separate portal.
- **SPEI for Mexico:** when the transaction is denominated in MXN, Cord can show a bank account number tied to the charge and reconcile the transfer when it arrives.
- **Deposit, balance, and installments:** every part keeps its amount, status, and reference, and the quote becomes paid only when no balance remains.
- **Payable invoices:** Cord Invoicing documents also have a public link with the current balance and the method available to that account.
- **Payouts and reconciliation:** the business can review payouts sent to its bank account, their status, and the configured schedule.
- **After-payment operations:** refunds, disputes, and evidence remain tied to the organization and the movement that created them.

### Actual availability
Online payment onboarding depends on the organization's country and on the requirements returned by the provider. Mexico, the United States, Canada, Brazil, Spain, the United Kingdom, Germany, and France have a connected-account rail. Colombia, Argentina, Chile, and Peru can quote, invoice, and record manual payments, but do not currently see Cord Payments onboarding.

SPEI is a Mexican rail and settles only MXN. Outside Mexico, Cord does not show that method or apply a Mexican fee to another currency.`
        },
        area: 'finanzas',
        status: 'live',
        api: false
    },

    {
        id: '8',
        slug: 'cfdi-automatico',
        title: {
            es: 'CFDI 4.0 en Cord Invoicing',
            en: 'CFDI 4.0 in Cord Invoicing'
        },
        shortDesc: {
            es: 'El carril mexicano de Cord Invoicing: timbrado directo ante el SAT. Al aprobarse la cotización se emite la factura PUE sin recapturar nada. Exclusivo de México.',
            en: 'The Mexican rail of Cord Invoicing: stamped directly with the SAT. Approving the quote issues the PUE invoice with zero retyping. Mexico-only.'
        },
        content: {
            es: `## Facturación invisible
Este es el carril de **México** dentro de Cord Invoicing. El CFDI 4.0 es una obligación mexicana: si vendes desde otro país, Cord emite tu factura por el carril comercial y no verás nada de esto.

La facturación electrónica en México puede ser un dolor de cabeza administrativo. En Cord, el timbrado está integrado directamente en el flujo de ventas para que ocurra en segundo plano.

### Beneficios clave:
- **Cero recaptura:** Todo lo que se negoció en la cotización (clave de producto SAT, unidades, impuestos) se transfiere directamente a la factura.
- **Timbrado PUE automático:** Si el trato fue de contado, al aprobarse la cotización se emite un CFDI de Ingreso PUE sin recapturar nada. Para ventas a crédito (Net 30) marcamos la cotización como PPD; el Complemento de Recepción de Pagos (REP) automático está en nuestro roadmap.
- **Almacenamiento seguro XML/PDF:** Todos tus comprobantes fiscales se resguardan en la nube, accesible tanto para ti como para tu cliente desde su portal.`,
            en: `## Invisible invoicing
This is the **Mexico** rail inside Cord Invoicing. CFDI 4.0 is a Mexican obligation: if you sell from another country, Cord issues your invoice on the commercial rail and you will never see any of this.

Electronic invoicing in Mexico can be an administrative headache. In Cord, stamping is integrated directly into the sales flow so it happens in the background.

### Key benefits:
- **Zero retyping:** Everything negotiated on the quote (SAT product code, units, taxes) transfers directly to the invoice.
- **Automatic PUE stamping:** If the deal was cash, an income PUE CFDI is issued when the quote is approved, with zero retyping. Credit sales (Net 30) are marked as PPD; automatic Payment Receipt Complement (REP) generation is on our roadmap.
- **Secure XML/PDF storage:** All your tax receipts are safely stored in the cloud, accessible to both you and your client from their portal.`
        },
        area: 'fiscal',
        status: 'live',
        api: true
    },
    {
        id: '19',
        slug: 'verifactu-espana',
        title: {
            es: 'Verifactu en Cord Invoicing',
            en: 'Verifactu in Cord Invoicing'
        },
        shortDesc: {
            es: 'El carril español de Cord Invoicing: registros encadenados, QR de verificación y envío a la AEAT cuando la activación regulatoria esté completa.',
            en: 'The Spanish rail for Cord Invoicing: chained records, a verification QR, and AEAT submission once regulatory activation is complete.'
        },
        content: {
            es: `## Facturación verificable para España
Verifactu no es un formato decorativo ni una integración opcional. Es el sistema que exige que cada factura genere un registro de alta, que ese registro conserve la huella del anterior y que la secuencia pueda verificarse.

Cord ya cuenta con el motor técnico que construye esa cadena por organización. La huella SHA-256 se genera al emitir, el registro se conserva como append-only y una corrección no reescribe el pasado: crea un nuevo registro de subsanación o anulación.

### Qué está construido:
- **Cadena por organización:** cada registro recibe una secuencia y enlaza la huella del registro anterior del mismo negocio.
- **Protección contra edición:** la base de datos bloquea cambios a la huella, el payload, la secuencia y el tipo después de firmarlos.
- **Certificado por empresa:** la organización puede conectar su certificado electrónico desde Ajustes, con validación de contraseña y caducidad antes de guardarlo cifrado.
- **QR y huella en el PDF:** cuando una factura sí tiene un registro Verifactu, el documento incorpora la información de cotejo correspondiente.
- **Envío desacoplado:** emitir la factura y remitir el registro son pasos separados para que una caída temporal de la AEAT no destruya el documento ya creado.

### Por qué figura como próximamente
El motor fue verificado contra ejemplos de huella, WSDL y XSD publicados por la AEAT, pero todavía falta completar la identidad del propio sistema informático de Cord, realizar el trámite regulatorio y probar un envío real en preproducción con un certificado español.

Hasta que esas condiciones se cumplan, una organización española recibe una factura comercial con su numeración y requisitos locales. Cord no muestra un QR, una huella ni un estado de envío que no existan.`,
            en: `## Verifiable invoicing for Spain
Verifactu is not a decorative format or an optional integration. It requires every invoice to create a registration record, each record to retain the previous fingerprint, and the resulting sequence to remain verifiable.

Cord already has the technical engine that builds that chain per organization. The SHA-256 fingerprint is generated at issue time, the record is stored as append-only, and a correction never rewrites the past: it creates a new correction or cancellation record.

### What is built:
- **A chain per organization:** every record receives a sequence and links to the previous record's fingerprint for the same business.
- **Protection against edits:** the database blocks changes to the fingerprint, payload, sequence, and type after signing.
- **Certificate per company:** the organization can connect its electronic certificate from Settings, with password and expiration validation before encrypted storage.
- **QR and fingerprint in the PDF:** when an invoice has a real Verifactu record, the document includes the corresponding verification information.
- **Decoupled submission:** issuing the invoice and submitting its record are separate steps so a temporary AEAT outage does not destroy the document already created.

### Why it is marked coming soon
The engine was verified against the fingerprint examples, WSDL, and XSD published by the AEAT, but Cord still needs to complete its own software-system identity, finish the regulatory process, and test a real preproduction submission with a Spanish certificate.

Until those conditions are met, a Spanish organization receives a commercial invoice with its local numbering and requirements. Cord does not show a QR, fingerprint, or submission state that does not exist.`
        },
        area: 'fiscal',
        status: 'next',
        api: false
    },
    {
        id: '9',
        slug: 'validacion-constancia',
        title: {
            es: 'Validación de Constancia y RFC',
            en: 'RFC & Tax ID Validation'
        },
        shortDesc: {
            es: 'Lectura automática de la Constancia de Situación Fiscal de tus clientes mediante OCR. Evita errores de timbrado por códigos postales o regímenes incorrectos.',
            en: 'Automatic reading of your clients tax situation certificates via OCR. Avoid stamping errors due to incorrect zip codes or tax regimes.'
        },
        content: {
            es: `## Datos maestros, sin captura manual
Hoy el RFC, el código postal y el régimen fiscal de un cliente mexicano se capturan a mano en su ficha. El SAT exige que esos datos coincidan exactamente con sus propios registros para timbrar un CFDI 4.0: un espacio de más o una coma mal puesta ya es un error de timbrado.

### Qué estamos construyendo:
- **Extracción por OCR:** que tu cliente suba el PDF de su Constancia de Situación Fiscal y Cord llene su ficha automáticamente, en vez de retecleear nombre, código postal y régimen.
- **Validación contra listas negras:** verificar en el momento que el RFC no esté en las listas EFOS/EDOS del SAT y que la Constancia siga vigente.
- **Actualización masiva:** pedirle a toda tu cartera que suba su Constancia al día con un solo envío, en vez de perseguir cliente por cliente.

### Por qué todavía no está:
Leer una Constancia con IA y decidir qué campo llena qué columna exige cubrir el formato exacto que emite el SAT y sus variantes históricas; un dato mal mapeado no es un typo cualquiera, es un CFDI que el SAT rechaza. Antes de ofrecerlo, cada campo que la IA extraiga debe validarse contra el RFC real antes de sobreescribir la ficha del cliente.`,
            en: `## Master data, without manual typing
Today a Mexican client's RFC, zip code, and tax regime are captured by hand on their profile. The SAT requires that data to match its own records exactly to stamp a CFDI 4.0: an extra space or a misplaced comma is already a stamping error.

### What we're building:
- **OCR extraction:** your client uploads the PDF of their Tax Situation Certificate and Cord fills in their profile automatically, instead of anyone retyping name, zip code, and tax regime.
- **Blacklist validation:** check on the spot that the RFC isn't on the SAT's EFOS/EDOS lists and that the certificate is still current.
- **Bulk updates:** ask your entire client portfolio to upload an up-to-date certificate in a single request, instead of chasing them one by one.

### Why it isn't here yet:
Reading a certificate with AI and deciding which field fills which column means covering the exact format the SAT issues, plus its historical variants; a field mapped wrong isn't a typo, it's a CFDI the SAT rejects. Before offering it, every field the AI extracts has to be validated against the real RFC before it overwrites the client's profile.`
        },
        area: 'fiscal',
        status: 'next',
        api: true
    },
    {
        id: '10',
        slug: 'facturacion-internacional',
        title: {
            es: 'Facturación comercial internacional',
            en: 'International commercial invoicing'
        },
        shortDesc: {
            es: 'Factura en el país donde vendes y en la moneda de la venta. CFDI 4.0 ante el SAT en México; en el resto del mundo, una factura con tu marca, folio propio y el tipo de cambio declarado.',
            en: 'Invoice in the country where you sell and in the currency of the sale. CFDI 4.0 with the SAT in Mexico; everywhere else, an invoice with your brand, its own numbering, and the exchange rate stated on it.'
        },
        content: {
            es: `## Una sola forma de facturar, en cualquier país
El carril regulatorio cambia según dónde estés; tu flujo de trabajo no. Apruebas la cotización, presionas facturar y Cord elige el carril correcto por ti.

### Beneficios clave:
- **México (CFDI 4.0 real):** timbrado ante el SAT, con tu propio CSD si lo subiste, y XML + PDF descargables. Este carril es exclusivo de México: es la regulación mexicana, no la de todos.
- **España (Verifactu):** el motor de encadenado y envío conforme al RD 1007/2023 está construido y verificado contra los vectores oficiales de la AEAT: huella SHA-256, código QR de verificación y estructura del envío. Su activación en producción depende de un trámite propio de Cord ante la autoridad española, todavía en curso; mientras tanto, tu factura se emite como documento comercial con folio propio, nunca como un registro Verifactu simulado.
- **Resto del mundo (factura de Cord):** folio propio por organización, datos congelados en el momento de emitir, y un PDF con el logo y el color de tu negocio. Es una factura comercial: no afirma haber sido presentada ante la autoridad fiscal local.
- **En la moneda de la venta:** el documento se emite en la moneda en que le vendiste al cliente. Si tu contabilidad va en otra, la factura declara el tipo de cambio aplicado y el total convertido.
- **Numeración por país:** cada país lleva su propia serie (España reinicia cada año, como exige su gestoría), así que un cambio de mercado no rompe tu secuencia de folios.

### Lo que todavía no hace:
Fuera de México y España, la factura no se presenta automáticamente ante la autoridad local. Los rieles de facturación electrónica obligatoria de otros países, como DIAN en Colombia o SII en Chile, están en la lista, y la arquitectura ya está preparada para conectarlos.`,
            en: `## One way to invoice, in any country
The regulatory rail changes depending on where you are; your workflow does not. Approve the quote, hit invoice, and Cord picks the right rail for you.

### Key benefits:
- **Mexico (real CFDI 4.0):** stamped with the SAT, using your own CSD if you uploaded it, with downloadable XML + PDF. This rail is Mexico-only: it is Mexican regulation, not everyone's.
- **Spain (Verifactu):** the chaining and submission engine required by RD 1007/2023 is built and verified against the AEAT's official test vectors: SHA-256 fingerprint, verification QR code, and submission structure. Going live in production depends on Cord's own registration with the Spanish tax authority, still underway; until then, your invoice is issued as a commercial document with its own numbering, never as a simulated Verifactu record.
- **Everywhere else (a Cord invoice):** its own numbering per organization, data frozen at issue time, and a PDF carrying your business's logo and color. It is a commercial invoice: it does not claim to have been filed with the local tax authority.
- **In the currency of the sale:** the document is issued in the currency you sold in. If your books are in a different one, the invoice states the exchange rate applied and the converted total.
- **Numbering per country:** each country keeps its own series (Spain resets yearly, as its accounting practice requires), so entering a new market never breaks your folio sequence.

### What it does not do yet:
Outside Mexico and Spain, the invoice is not automatically filed with the local authority. Mandatory e-invoicing rails in other countries, such as DIAN in Colombia or SII in Chile, are on the list, and the architecture is ready to connect them.`
        },
        area: 'fiscal',
        status: 'live',
        api: true
    },
    {
        id: '13',
        slug: 'notificaciones',
        title: {
            es: 'Notificaciones por correo y Slack',
            en: 'Email and Slack notifications'
        },
        shortDesc: {
            es: 'Entérate por correo o Slack cuando tu cliente ve, aprueba, rechaza o paga una cotización, sin tener que revisar el dashboard.',
            en: 'Find out by email or Slack when your client views, approves, rejects, or pays a quote without checking the dashboard.'
        },
        content: {
            es: `## Entérate en el momento, no cuando revisas el dashboard
Una matriz de 7 eventos por 2 canales (correo y Slack) en Ajustes › Notificaciones. Marca las casillas que quieras y se guardan al instante.

### Beneficios clave:
- **Correo al dueño de la cuenta:** vista, aprobada, rechazada, pago recibido, por vencer, pago vencido y equipo; vienen encendidos por default en aprobada/rechazada/pagada desde el primer día.
- **Slack para todo el equipo:** conecta un Incoming Webhook y publica los mismos eventos en tu canal, con folio, cliente, total y link directo.
- **Sin ruido falso:** solo se dispara lo que de verdad marcaste; nada se postea "por si acaso".`,
            en: `## Find out the moment it happens, not when you check the dashboard
A matrix of 7 events by 2 channels (email and Slack) under Settings › Notifications. Check the boxes you want and they save instantly.

### Key benefits:
- **Email to the account owner:** viewed, approved, rejected, payment received, about to expire, overdue, and team; approved/rejected/paid come on by default from day one.
- **Slack for the whole team:** connect an Incoming Webhook and post the same events to your channel, with folio, client, total, and a direct link.
- **No false noise:** only what you actually checked fires; nothing gets posted "just in case".`
        },
        area: 'finanzas',
        status: 'live',
        api: false
    },
    {
        id: '14',
        slug: 'facturas-emitidas',
        title: {
            es: 'Cord Invoicing',
            en: 'Cord Invoicing'
        },
        shortDesc: {
            es: 'Crea, emite, entrega y cobra facturas desde una sola bandeja, con folio, saldo, link del cliente, actividad y documentos fiscales cuando correspondan.',
            en: 'Create, issue, deliver, and collect invoices from one inbox, with number, balance, client link, activity, and fiscal files when applicable.'
        },
        content: {
            es: `## De la captura al cobro, sin salir de Cord
Cord Invoicing reúne el documento comercial, la emisión fiscal que corresponda al país, la entrega y la cobranza. Cada factura conserva un solo historial desde el borrador hasta el pago.

### Beneficios clave:
- **Creación y emisión directa:** arma conceptos, guarda borradores sin folio y emite sólo después de revisar cliente, total, vencimiento y destino.
- **Entrega con contexto:** envía por correo, comparte el link del cliente, descarga PDF/XML y consulta si la factura fue enviada, vista, vencida o pagada.
- **Cobranza completa:** registra pagos manuales o parciales, cobra en el link público cuando Cord Payments está habilitado y convierte una factura en recurrencia mensual.
- **Operación verificable:** actividad por documento, selección masiva sólo para facturas elegibles, exportación CSV y documentos de prueba marcados sin mezclarlos con estados comerciales.
- **Automatizable:** lista y administra facturas mediante la API pública de Cord y sus herramientas MCP.`,
            en: `## From capture to collection, without leaving Cord
Cord Invoicing brings together the commercial document, the fiscal issuance required for the seller's country, delivery, and collection. Each invoice keeps one history from draft to payment.

### Key benefits:
- **Direct creation and issuance:** build line items, save drafts without a number, and issue only after reviewing the client, total, due date, and recipient.
- **Delivery with context:** send by email, share the client link, download PDF/XML, and see whether an invoice was sent, viewed, overdue, or paid.
- **Complete collection:** record manual or partial payments, collect through the public link when Cord Payments is enabled, and turn an invoice into a monthly recurrence.
- **Verifiable operations:** per-document activity, bulk selection restricted to eligible invoices, CSV export, and test documents labeled separately from commercial status.
- **Automatable:** list and manage invoices through Cord's public API and MCP tools.`
        },
        area: 'fiscal',
        status: 'live',
        api: true
    },
    {
        id: '15',
        slug: 'integraciones-y-flujos',
        title: {
            es: 'Integraciones y flujos',
            en: 'Integrations & flows'
        },
        shortDesc: {
            es: 'Conecta Cord con las herramientas donde ya trabajas y encadena acciones automáticas: cuando pasa X en una cotización, que ocurra Y, sin escribir código.',
            en: 'Connect Cord to the tools you already use and chain automatic actions: when X happens on a quote, make Y happen without writing code.'
        },
        content: {
            es: `## Que el cierre dispare el resto del trabajo
Hoy Cord ya avisa lo que pasa (correo, Slack, webhooks) y su API pública permite construir lo que quieras encima. Lo que falta es el paso intermedio: encadenar acciones sin escribir código.

### Qué estamos construyendo:
- **Catálogo de integraciones:** conexiones listas con las herramientas donde ya vive tu operación, en vez de un webhook que alguien tiene que programar.
- **Flujos con condiciones:** "si la cotización supera cierto monto, pide aprobación y avisa al canal de dirección"; "si el cliente no abre el link en 3 días, manda el recordatorio". Reglas visibles, editables y auditables.
- **Acciones encadenadas:** que aprobar dispare la factura, el alta del cliente y la tarea de seguimiento, sin que nadie las haga a mano.

### Por qué todavía no está:
Una automatización que falla en silencio es peor que no tenerla. Antes de abrirla queremos que cada flujo deje registro de qué se disparó, cuándo y con qué resultado, y que se pueda reintentar.`,
            en: `## Let the close trigger the rest of the work
Cord already tells you what happens (email, Slack, webhooks) and its public API lets you build anything on top. What's missing is the middle step: chaining actions without writing code.

### What we're building:
- **Integration catalog:** ready-made connections to the tools your operation already lives in, instead of a webhook someone has to program.
- **Conditional flows:** "if the quote is above a certain amount, request approval and notify the leadership channel"; "if the client doesn't open the link in 3 days, send the reminder." Rules that are visible, editable, and auditable.
- **Chained actions:** approval triggering the invoice, the client record, and the follow-up task, without anyone doing them by hand.

### Why it isn't here yet:
An automation that fails silently is worse than not having one. Before opening it up, we want every flow to record what fired, when, and with what result, and to be retryable.`
        },
        area: 'cotizaciones',
        status: 'next',
        api: true
    },
    {
        id: '16',
        slug: 'ciclo-de-vida-contrato',
        title: {
            es: 'Ciclo de vida del contrato',
            en: 'Contract lifecycle'
        },
        shortDesc: {
            es: 'Una venta no termina al cobrar: vence, se renueva y se vuelve a negociar. Renovaciones en un clic, duplicar y ajustar, y aviso antes de que expire.',
            en: 'A sale does not end at payment: it expires, renews, and gets renegotiated. One-click renewals, duplicate and adjust, and a heads-up before it expires.'
        },
        content: {
            es: `## El trato después del trato
La mayoría de las herramientas de cotización terminan en "Pagada". Pero el contrato que firmaste tiene vigencia, y la siguiente venta al mismo cliente casi siempre es la anterior con ajustes.

### Qué estamos construyendo:
- **Renovación en un clic:** desde una cotización cerrada, generar la del siguiente periodo con los términos ya cargados y solo tocar lo que cambió.
- **Duplicar y ajustar:** partir de un trato existente para el mismo cliente u otro, conservando líneas, precios negociados y condiciones.
- **Vigencia y avisos:** saber qué contratos vencen el mes que entra, con tiempo para renegociar en vez de enterarte cuando el cliente ya se fue.
- **Historial del cliente en una línea de tiempo:** qué se le vendió, a qué precio y bajo qué condiciones, cada vez.

### Por qué todavía no está:
Renovar bien exige decidir qué se congela y qué se recalcula: precios de lista que cambiaron, impuestos, tipo de cambio, descuentos que eran excepcionales. Copiar el documento es la parte fácil.`,
            en: `## The deal after the deal
Most quoting tools end at "Paid." But the contract you signed has a term, and the next sale to that client is almost always the previous one with adjustments.

### What we're building:
- **One-click renewal:** from a closed quote, generate the next period's with the terms already loaded, touching only what changed.
- **Duplicate and adjust:** start from an existing deal for the same or another client, keeping lines, negotiated prices, and conditions.
- **Terms and reminders:** know which contracts expire next month, with time to renegotiate instead of finding out once the client is gone.
- **Client history as a timeline:** what was sold, at what price, and under what conditions, every time.

### Why it isn't here yet:
Renewing properly means deciding what freezes and what recalculates: list prices that moved, taxes, exchange rate, discounts that were one-offs. Copying the document is the easy part.`
        },
        area: 'cotizaciones',
        status: 'next',
        api: true
    },
    {
        id: '17',
        slug: 'pagos-por-milestones',
        title: {
            es: 'Estructuras de pago personalizadas',
            en: 'Custom payment structures'
        },
        shortDesc: {
            es: 'Cronogramas de pago a tu medida: entregables, avance de obra o fechas propias. Cada hito con su monto, su condición y su cobro.',
            en: 'Payment schedules your way: deliverables, project milestones, or your own dates. Each milestone with its amount, condition, and charge.'
        },
        content: {
            es: `## Cobrar como de verdad se cerró el trato
Cord ya cobra por anticipo y saldo, y en cuotas parejas. Lo que falta es el caso real de proyectos e implementaciones: pagos atados a **hitos**, no a un calendario uniforme.

### Qué estamos construyendo:
- **Cronograma por hitos:** define cada etapa con su nombre, su porcentaje o monto y su condición ("al entregar el diseño", "al arrancar producción"), en vez de dividir el total en partes iguales.
- **Liberación por evento:** que el cobro de un hito se habilite cuando ese hito se marca cumplido, no cuando llega una fecha arbitraria.
- **Visible para el cliente:** el link público muestra el cronograma completo: qué ya pagó, qué sigue y qué falta por cumplirse, sin que nadie tenga que explicarlo por correo.
- **Ajustes a medio camino:** un proyecto que cambia de alcance debe poder re-negociar los hitos pendientes sin romper los ya cobrados.

### Por qué todavía no está:
Un hito que se puede cobrar antes de cumplirse es un problema de dinero, no de interfaz. El orden correcto es primero la condición y su evidencia, después el botón de pago.`,
            en: `## Charging the way the deal was actually closed
Cord already charges deposit-and-balance, and in even installments. What's missing is the real case for projects and implementations: payments tied to **milestones**, not a uniform calendar.

### What we're building:
- **Milestone schedule:** define each stage with its name, its percentage or amount, and its condition ("on design delivery", "at production start"), instead of splitting the total into equal parts.
- **Event-based release:** a milestone's charge unlocks when that milestone is marked complete, not when an arbitrary date arrives.
- **Visible to the client:** the public link shows the full schedule: what is paid, what is next, and what remains, without anyone explaining it over email.
- **Mid-flight adjustments:** a project that changes scope should be able to renegotiate pending milestones without breaking the ones already charged.

### Why it isn't here yet:
A milestone that can be charged before it's met is a money problem, not an interface one. The right order is the condition and its evidence first, the payment button second.`
        },
        area: 'finanzas',
        status: 'next',
        api: true
    }
];

const roadmapEnhancements = {
    'editor-cotizaciones': {
        family: 'quotes', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Elige un cliente y agrega productos del catálogo o conceptos nuevos.', 'Ajusta cantidades, precios, descuentos, impuestos por línea y condiciones de pago.', 'Revisa el margen, guarda el borrador y envía un único link al cliente.'],
            en: ['Choose a client and add catalog products or new line items.', 'Adjust quantities, prices, discounts, per-line taxes, and payment terms.', 'Review margin, save the draft, and send one link to the client.']
        },
        scope: { es: 'Disponible en los mercados ofrecidos por Cord. Las etiquetas fiscales, tasas sugeridas, divisa y formato cambian según la organización.', en: 'Available across Cord supported markets. Tax labels, suggested rates, currency, and formatting adapt to the organization.' },
        boundaries: { es: 'Las tasas sugeridas no sustituyen el criterio fiscal del negocio. Si Cord no puede obtener un tipo de cambio real, la cotización multi-divisa no se guarda con una tasa inventada.', en: 'Suggested rates do not replace the business tax judgment. If Cord cannot retrieve a real exchange rate, a multi-currency quote is not saved with an invented rate.' },
        related: ['link-publico', 'multi-divisa-fx', 'sello-de-confianza']
    },
    'link-publico': {
        family: 'quotes', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Cord genera un token único cuando envías la cotización.', 'El cliente abre el link sin crear cuenta y revisa conceptos, términos y documentos.', 'La aprobación, el rechazo o el pago se registra sobre la misma versión del trato.'],
            en: ['Cord creates a unique token when you send the quote.', 'The client opens the link without an account and reviews line items, terms, and documents.', 'Approval, rejection, or payment is recorded against the same version of the deal.']
        },
        scope: { es: 'El link funciona en escritorio y móvil, y adapta idioma, moneda y métodos de cobro a la organización y al documento.', en: 'The link works on desktop and mobile, adapting language, currency, and payment methods to the organization and document.' },
        boundaries: { es: 'Un link permite revisar y actuar sobre una cotización concreta. No expone el resto de la cuenta, el catálogo ni otros clientes del negocio.', en: 'A link allows reviewing and acting on one specific quote. It does not expose the rest of the account, catalog, or other customers.' },
        related: ['seguimiento-vivo', 'sello-de-confianza', 'cord-payments']
    },
    'seguimiento-vivo': {
        family: 'quotes', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['El cliente abre el link público y Cord registra la vista con fecha y hora.', 'Correo o Slack avisa según las preferencias del negocio.', 'La ficha de la cotización muestra aperturas e indica si el cliente continúa activo en ese momento.'],
            en: ['The client opens the public link and Cord records the view with date and time.', 'Email or Slack sends an alert according to the business preferences.', 'The quote detail shows openings and indicates whether the client is still active at that moment.']
        },
        scope: { es: 'El registro de vistas y la actividad viven junto a la cotización. Las notificaciones se configuran por canal y evento.', en: 'View history and activity live next to the quote. Notifications are configured by channel and event.' },
        boundaries: { es: 'Cord informa actividad observada en el link, no intención de compra. Una apertura no se presenta como aprobación ni como probabilidad de cierre.', en: 'Cord reports observed activity on the link, not purchase intent. An opening is never presented as approval or a close probability.' },
        related: ['link-publico', 'notificaciones', 'ciclo-de-vida-contrato']
    },
    'cord-elements': {
        family: 'platform', market: { es: 'Web, React y Vue', en: 'Web, React, and Vue' },
        workflow: {
            es: ['Instala el paquete o registra el Web Component en el portal existente.', 'Autentica la sesión y carga catálogo, cliente y reglas desde Cord.', 'Escucha eventos o usa los hooks headless para controlar tu propia interfaz.'],
            en: ['Install the package or register the Web Component in the existing portal.', 'Authenticate the session and load catalog, client, and rules from Cord.', 'Listen for events or use headless hooks to control your own interface.']
        },
        scope: { es: 'SDK tipado para React, Vue y Web Components, con una ruta headless para equipos que necesitan controlar por completo la presentación.', en: 'Typed SDK for React, Vue, and Web Components, with a headless path for teams that need full presentation control.' },
        boundaries: { es: 'Elements embebe el motor de cotización; no convierte un portal sin autenticación ni permisos en un entorno seguro por sí solo.', en: 'Elements embeds the quoting engine; it does not make a portal secure without its own authentication and permission model.' },
        related: ['editor-cotizaciones', 'integraciones-y-flujos', 'link-publico']
    },
    'sello-de-confianza': {
        family: 'quotes', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['El cliente revisa la versión vigente y confirma la aprobación.', 'Cord congela el contenido aceptado y genera su hash SHA-256.', 'Nombre, IP, fecha y huella quedan en la actividad y en el sello visible.'],
            en: ['The client reviews the current version and confirms approval.', 'Cord freezes the accepted content and creates its SHA-256 hash.', 'Name, IP, date, and fingerprint remain in activity and in the visible seal.']
        },
        scope: { es: 'La evidencia se liga a la versión exacta aprobada y acompaña tanto al link público como a las experiencias creadas con Cord Elements.', en: 'Evidence is tied to the exact approved version and accompanies both the public link and experiences built with Cord Elements.' },
        boundaries: { es: 'El sello documenta el evento técnico de aprobación. No se presenta como certificación notarial ni sustituye asesoría sobre la forma legal exigida para un contrato específico.', en: 'The seal documents the technical approval event. It is not presented as notarization and does not replace advice on the legal form required for a specific contract.' },
        related: ['link-publico', 'cfdi-automatico', 'cord-elements']
    },
    'clientes-credito': {
        family: 'quotes', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Define límite y términos de crédito en la ficha del cliente.', 'Cord suma el saldo abierto antes de autorizar una nueva venta a crédito.', 'Al aprobar, calcula vencimiento y conecta el documento con el ciclo de cobranza.'],
            en: ['Set the credit limit and terms on the customer profile.', 'Cord adds open balances before allowing a new credit sale.', 'On approval, it calculates the due date and connects the document to collections.']
        },
        scope: { es: 'Crédito comercial por cliente, con Net 30/60, saldo abierto y bloqueo cuando la nueva operación rebasa el límite configurado.', en: 'Commercial credit per customer, with Net 30/60 terms, open balance, and blocking when a new sale exceeds the configured limit.' },
        boundaries: { es: 'Cord ejecuta las reglas que configura la organización; no realiza una consulta externa de buró ni asigna por sí solo la solvencia del cliente.', en: 'Cord enforces the rules configured by the organization; it does not run an external credit-bureau check or assign customer solvency on its own.' },
        related: ['cobranza-ia', 'anticipos-pagos-parciales', 'facturas-emitidas']
    },
    'multi-divisa-fx': {
        family: 'quotes', market: { es: 'Divisas ofrecidas por Cord', en: 'Currencies offered by Cord' },
        workflow: {
            es: ['Selecciona la divisa de venta y conserva la divisa contable de la organización.', 'Cord consulta fuentes reales y congela la tasa con fecha al guardar.', 'Cotización, factura y libro contable consumen la misma dirección de conversión.'],
            en: ['Choose the selling currency while keeping the organization accounting currency.', 'Cord queries real sources and freezes the dated rate when saving.', 'Quote, invoice, and ledger consume the same conversion direction.']
        },
        scope: { es: 'La factura declara la moneda de la venta y, cuando corresponde, el tipo de cambio y el total contable derivados de la tasa congelada.', en: 'The invoice states the selling currency and, when applicable, the exchange rate and accounting total derived from the frozen rate.' },
        boundaries: { es: 'Una fuente que no publica un par cede a la siguiente. Si ninguna lo cubre o la red impide demostrar la tasa, Cord falla cerrado.', en: 'A source that does not publish a pair yields to the next. If none covers it or the network prevents proving the rate, Cord fails closed.' },
        related: ['editor-cotizaciones', 'facturacion-internacional', 'cord-payments']
    },
    'cobranza-ia': {
        family: 'payments', market: { es: 'Correo; pago según mercado', en: 'Email; payment by market' },
        workflow: {
            es: ['El negocio activa la cobranza autónoma y define qué cartera puede gestionar.', 'Al vencer, el agente envía recordatorios con el saldo y el link pagable cuando existe.', 'Si el cliente solicita cuotas, el agente solo puede ofrecer planes dentro de las reglas configuradas.'],
            en: ['The business enables autonomous collections and defines which receivables it may manage.', 'Once overdue, the agent sends reminders with the balance and a payable link when available.', 'If the customer requests installments, the agent may offer only plans within configured rules.']
        },
        scope: { es: 'Opera por correo y mantiene el historial junto a la deuda. Puede crear dos o tres cuotas que sumen el adeudo sin aplicar descuentos.', en: 'It operates by email and keeps history next to the debt. It can create two or three installments that add up to the balance without discounts.' },
        boundaries: { es: 'Es opt-in por negocio y no decide condonaciones, descuentos ni acciones legales. El link de pago aparece solo donde Cord Payments está disponible y activo.', en: 'It is opt-in per business and does not decide write-offs, discounts, or legal action. The payment link appears only where Cord Payments is available and active.' },
        related: ['clientes-credito', 'cord-payments', 'anticipos-pagos-parciales']
    },
    'anticipos-pagos-parciales': {
        family: 'payments', market: { es: 'Cobro en línea según mercado', en: 'Online payment by market' },
        workflow: {
            es: ['Define el porcentaje de anticipo y las condiciones del saldo.', 'El link explica cuánto se paga hoy y cuánto queda pendiente.', 'Cada cobro actualiza el saldo hasta cerrar por completo la cotización o factura.'],
            en: ['Set the deposit percentage and balance terms.', 'The link explains how much is due today and how much remains.', 'Every charge updates the balance until the quote or invoice is fully settled.']
        },
        scope: { es: 'Admite anticipos, saldos, pagos parciales y cuotas asociadas a una misma venta, con movimientos independientes y trazables.', en: 'Supports deposits, balances, partial payments, and installments tied to one sale, with independent traceable movements.' },
        boundaries: { es: 'El pago en línea requiere Cord Payments activo. Donde no existe ese carril, el negocio puede registrar pagos manuales sin fingir una conciliación bancaria automática.', en: 'Online payment requires active Cord Payments. Where that rail is unavailable, the business can record manual payments without pretending automatic bank reconciliation.' },
        related: ['cord-payments', 'pagos-por-milestones', 'clientes-credito']
    },
    'cord-payments': {
        family: 'payments', market: { es: '8 mercados con cobro en línea', en: '8 online-payment markets' },
        workflow: {
            es: ['Completa el alta de la empresa, representantes y beneficiarios que pida el proveedor.', 'Activa los métodos disponibles para el país y acepta la tarifa aplicable cuando exista.', 'Cobra desde el link y consulta movimientos, depósitos, reembolsos o contracargos en Cord.'],
            en: ['Complete onboarding for the company, representatives, and owners required by the provider.', 'Enable methods available for the country and accept the applicable fee when one exists.', 'Collect from the link and review movements, payouts, refunds, or disputes in Cord.']
        },
        scope: { es: 'Tarjeta en MX, US, CA, BR, ES, GB, DE y FR. SPEI solo para operaciones en MXN de cuentas mexicanas.', en: 'Cards in MX, US, CA, BR, ES, GB, DE, and FR. SPEI only for MXN transactions on Mexican accounts.' },
        boundaries: { es: 'CO, AR, CL y PE permanecen con pagos manuales. Las tarifas de plataforma fuera de MXN no se inventan: mientras no exista una tabla verificada, Cord no aplica una comisión regional.', en: 'CO, AR, CL, and PE remain on manual payments. Platform fees outside MXN are not invented: until a verified schedule exists, Cord does not apply a regional fee.' },
        related: ['anticipos-pagos-parciales', 'cobranza-ia', 'facturas-emitidas']
    },
    'cfdi-automatico': {
        family: 'invoicing', market: { es: 'México', en: 'Mexico' },
        workflow: {
            es: ['Configura datos fiscales y conecta el CSD del negocio.', 'Revisa receptor, conceptos, impuestos, moneda y método antes de emitir.', 'Cord timbra mediante el proveedor fiscal y conserva XML, PDF, UUID y estado.'],
            en: ['Configure tax details and connect the business digital seal certificate.', 'Review recipient, line items, taxes, currency, and method before issuing.', 'Cord stamps through the fiscal provider and stores XML, PDF, UUID, and status.']
        },
        scope: { es: 'Carril exclusivo de México para CFDI 4.0 de ingreso. Usa el CSD de la organización cuando está conectado y separa documentos de prueba de comprobantes reales.', en: 'Mexico-only rail for CFDI 4.0 income documents. It uses the organization certificate when connected and separates test documents from real receipts.' },
        boundaries: { es: 'CFDI no se ofrece fuera de México. Los flujos PPD requieren el tratamiento fiscal correspondiente; un documento simulado nunca se presenta como válido ante el SAT.', en: 'CFDI is not offered outside Mexico. PPD flows require the corresponding fiscal treatment; a simulated document is never presented as valid with the SAT.' },
        related: ['facturas-emitidas', 'validacion-constancia', 'facturacion-internacional']
    },
    'verifactu-espana': {
        family: 'invoicing', market: { es: 'España', en: 'Spain' },
        workflow: {
            es: ['La organización conecta un certificado español válido.', 'Al emitir, Cord genera el registro, la secuencia y la huella enlazada.', 'Un proceso separado remite el registro a la AEAT y conserva respuesta y reintentos.'],
            en: ['The organization connects a valid Spanish certificate.', 'On issue, Cord creates the record, sequence, and linked fingerprint.', 'A separate process submits the record to the AEAT and retains responses and retries.']
        },
        scope: { es: 'Motor construido para España y marcado como próximamente hasta completar identidad del SIF, trámite y prueba real en preproducción.', en: 'Engine built for Spain and marked coming soon until SIF identity, regulatory process, and a real preproduction test are complete.' },
        boundaries: { es: 'Sin certificado o activación regulatoria, la factura española usa el carril comercial. No se muestra QR ni estado Verifactu falso.', en: 'Without a certificate or regulatory activation, the Spanish invoice uses the commercial rail. No false QR or Verifactu status is shown.' },
        related: ['facturas-emitidas', 'facturacion-internacional', 'cfdi-automatico']
    },
    'validacion-constancia': {
        family: 'invoicing', market: { es: 'México', en: 'Mexico' },
        workflow: {
            es: ['El cliente o el negocio carga la Constancia de Situación Fiscal.', 'OCR propone razón social, RFC, código postal y régimen detectados.', 'Cord valida antes de permitir que los datos sustituyan la ficha vigente.'],
            en: ['The customer or business uploads the Tax Situation Certificate.', 'OCR proposes the detected legal name, RFC, postal code, and tax regime.', 'Cord validates the result before allowing it to replace the current customer profile.']
        },
        scope: { es: 'Iniciativa futura para reducir recaptura y errores de receptor en CFDI 4.0. El alcance incluye extracción, revisión y actualización controlada.', en: 'Future initiative to reduce retyping and recipient errors in CFDI 4.0. Scope includes extraction, review, and controlled updates.' },
        boundaries: { es: 'No se liberará como lectura ciega. Un campo extraído debe poder revisarse y validarse antes de cambiar datos fiscales utilizados para timbrar.', en: 'It will not ship as blind extraction. A captured field must be reviewable and validated before changing tax data used for stamping.' },
        related: ['cfdi-automatico', 'facturas-emitidas']
    },
    'facturacion-internacional': {
        family: 'invoicing', market: { es: 'Fuera de México; España según modo', en: 'Outside Mexico; Spain by mode' },
        workflow: {
            es: ['La organización configura su perfil fiscal, serie y moneda contable.', 'Al emitir, Cord congela emisor, receptor, líneas, impuestos y tipo de cambio.', 'Genera un PDF con marca, folio, vencimiento, impuestos y forma de pago.'],
            en: ['The organization configures its tax profile, series, and accounting currency.', 'On issue, Cord freezes issuer, recipient, lines, taxes, and exchange rate.', 'It creates a branded PDF with number, due date, taxes, and payment instructions.']
        },
        scope: { es: 'Factura comercial para los mercados soportados sin un riel fiscal activo. España usa Verifactu solo cuando la organización y Cord cumplen sus condiciones de activación.', en: 'Commercial invoice for supported markets without an active fiscal rail. Spain uses Verifactu only when both the organization and Cord meet activation conditions.' },
        boundaries: { es: 'Fuera de los rieles regulatorios conectados, Cord no afirma presentar el documento ante la autoridad local. DIAN, SII y otros sistemas no están conectados hoy.', en: 'Outside connected regulatory rails, Cord does not claim to file the document with a local authority. DIAN, SII, and other systems are not connected today.' },
        related: ['facturas-emitidas', 'verifactu-espana', 'multi-divisa-fx']
    },
    'notificaciones': {
        family: 'quotes', market: { es: 'Correo y Slack', en: 'Email and Slack' },
        workflow: {
            es: ['Elige canal y evento en Ajustes.', 'Cord guarda la matriz de preferencias al cambiar cada opción.', 'Cuando ocurre una vista, aprobación, rechazo o pago, envía solo los avisos activados.'],
            en: ['Choose channel and event in Settings.', 'Cord saves the preference matrix as each option changes.', 'When a view, approval, rejection, or payment occurs, it sends only enabled alerts.']
        },
        scope: { es: 'Siete clases de evento por correo y Slack, con folio, cliente, total y enlace cuando el canal permite ese contexto.', en: 'Seven event classes across email and Slack, with number, customer, total, and link when the channel supports that context.' },
        boundaries: { es: 'Slack requiere un Incoming Webhook configurado por la organización. Cord no publica eventos desactivados ni sustituye el historial interno por mensajes externos.', en: 'Slack requires an Incoming Webhook configured by the organization. Cord does not publish disabled events or replace internal history with external messages.' },
        related: ['seguimiento-vivo', 'link-publico', 'integraciones-y-flujos']
    },
    'facturas-emitidas': {
        family: 'invoicing', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Crea un borrador desde cero o desde una cotización aprobada.', 'Revisa y emite por el carril fiscal o comercial que corresponda.', 'Entrega el link, registra pagos y sigue saldo, actividad, recurrencia y documentos.'],
            en: ['Create a draft from scratch or from an approved quote.', 'Review and issue through the applicable fiscal or commercial rail.', 'Deliver the link and track payments, balance, activity, recurrence, and files.']
        },
        scope: { es: 'Bandeja completa de facturas con borradores, folios, emisión, actividad, pago manual o en línea, exportación y automatización por API y MCP.', en: 'Complete invoice inbox with drafts, numbering, issuance, activity, manual or online payment, export, and automation through API and MCP.' },
        boundaries: { es: 'El documento fiscal depende del país y de la configuración real. Cord Invoicing no transforma una factura comercial en clearance local cuando ese proveedor regulatorio no existe.', en: 'The fiscal document depends on the country and actual configuration. Cord Invoicing does not turn a commercial invoice into local clearance where no regulatory provider exists.' },
        related: ['cfdi-automatico', 'facturacion-internacional', 'cord-payments']
    },
    'integraciones-y-flujos': {
        family: 'platform', market: { es: 'Plataforma Cord', en: 'Cord platform' },
        workflow: {
            es: ['Elige un evento de origen y define condiciones visibles.', 'Selecciona una o varias acciones y prueba el flujo antes de activarlo.', 'Consulta cada ejecución, su resultado y la opción de reintento cuando falle.'],
            en: ['Choose a source event and define visible conditions.', 'Select one or more actions and test the flow before enabling it.', 'Review every execution, its result, and a retry option when it fails.']
        },
        scope: { es: 'Iniciativa futura sobre la API, webhooks, correo y Slack ya existentes. Busca permitir automatización sin escribir código.', en: 'Future initiative built on the existing API, webhooks, email, and Slack. It aims to enable automation without writing code.' },
        boundaries: { es: 'No se lanzará sin historial de ejecución, errores accionables e idempotencia. Una automatización silenciosa no puede mover una venta o una factura sin evidencia.', en: 'It will not ship without execution history, actionable errors, and idempotency. A silent automation cannot move a sale or invoice without evidence.' },
        related: ['cord-elements', 'notificaciones', 'ciclo-de-vida-contrato']
    },
    'ciclo-de-vida-contrato': {
        family: 'quotes', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Marca vigencia y fecha de renovación en el trato cerrado.', 'Cord avisa antes del vencimiento y prepara una nueva versión desde el acuerdo anterior.', 'El vendedor revisa precios, impuestos, divisa y excepciones antes de enviar.'],
            en: ['Set term and renewal date on the closed deal.', 'Cord alerts before expiration and prepares a new version from the previous agreement.', 'The seller reviews prices, taxes, currency, and exceptions before sending.']
        },
        scope: { es: 'Iniciativa futura para renovaciones, duplicación controlada y una línea de tiempo del historial comercial por cliente.', en: 'Future initiative for renewals, controlled duplication, and a customer commercial-history timeline.' },
        boundaries: { es: 'Renovar no significa copiar a ciegas. Precios de lista, impuestos, tipo de cambio y descuentos excepcionales deben revisarse antes de crear un nuevo compromiso.', en: 'Renewing does not mean copying blindly. List prices, taxes, exchange rates, and exceptional discounts must be reviewed before creating a new commitment.' },
        related: ['clientes-credito', 'integraciones-y-flujos', 'pagos-por-milestones']
    },
    'pagos-por-milestones': {
        family: 'payments', market: { es: 'Cobro según mercado', en: 'Payment by market' },
        workflow: {
            es: ['Define nombre, importe o porcentaje y condición para cada hito.', 'El cliente ve el cronograma completo y el estado de cada etapa.', 'El cobro se habilita cuando la condición se confirma y conserva evidencia del cambio.'],
            en: ['Define the name, amount or percentage, and condition for every milestone.', 'The client sees the full schedule and each stage status.', 'Payment unlocks when the condition is confirmed and retains evidence of the change.']
        },
        scope: { es: 'Iniciativa futura para proyectos, obra e implementaciones que no caben en anticipo, saldo o cuotas uniformes.', en: 'Future initiative for projects, construction, and implementations that do not fit deposit, balance, or even installments.' },
        boundaries: { es: 'Un hito no podrá cobrarse solo porque llegó una fecha si su condición no está cumplida. Los cambios de alcance deben respetar lo ya cobrado.', en: 'A milestone cannot be charged merely because a date arrived when its condition is unmet. Scope changes must preserve what has already been collected.' },
        related: ['anticipos-pagos-parciales', 'cord-payments', 'ciclo-de-vida-contrato']
    }
} satisfies Record<string, RoadmapEnhancement>;

export const roadmapData: RoadmapItem[] = roadmapBase.map((item) => {
    const enhancement = roadmapEnhancements[item.slug as keyof typeof roadmapEnhancements];
    if (!enhancement) throw new Error(`Falta información ampliada para ${item.slug}`);
    return { ...item, ...enhancement };
});
