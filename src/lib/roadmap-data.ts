export interface RoadmapItem {
    id: string;
    slug: string;
    title: { es: string; en: string };
    shortDesc: { es: string; en: string };
    content: { es: string; en: string };
    area: 'cotizaciones' | 'finanzas' | 'fiscal';
    status: 'live' | 'beta' | 'next';
    api: boolean;
}

export const roadmapData: RoadmapItem[] = [
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
- **Cálculo de impuestos en vivo:** Aplica el IVA u otras retenciones y visualiza el total final antes de enviar la cotización.
- **Descuentos por partida o globales:** Ideal para negociaciones donde el volumen dicta el precio.
- **Guardado automático:** Crea borradores sin perder información.`,
            en: `## Total control over your proposals
Cord's quote editor is designed to give you agility without losing control. You don't need to jump between Excel sheets and PDF formats. From a single screen, you can search for products in your catalog, adjust quantities, and see how the price changes in real-time.

### Key benefits:
- **Live tax calculation:** Apply VAT or other withholdings and view the final total before sending the quote.
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
            es: 'Notificaciones push en el momento exacto en que tu cliente abre la cotización. Llama en el momento de mayor interés y cierra más tratos.',
            en: 'Push notifications the exact moment your client opens the quote. Call them when they are most interested and close more deals.'
        },
        content: {
            es: `## El poder del "Timing"
Saber exactamente cuándo tu cliente está evaluando tu propuesta cambia por completo la dinámica de ventas. Con el seguimiento en vivo de Cord, recibes una notificación en tu dashboard en el milisegundo exacto en el que tu prospecto hace clic en el enlace.

### Beneficios clave:
- **Llamadas oportunas:** Llama a tu cliente justo cuando está pensando en ti. La tasa de conversión aumenta drásticamente.
- **Menos seguimiento manual:** Olvídate del correo "Hola, ¿tuviste oportunidad de revisar mi cotización?". Ahora lo sabes con certeza.
- **Analíticas de interés:** Descubre si un cliente abre la cotización múltiples veces a lo largo de los días, lo que indica un alto nivel de interés.`,
            en: `## The power of Timing
Knowing exactly when your client is evaluating your proposal completely changes the sales dynamic. With Cord's live tracking, you receive a notification on your dashboard the exact millisecond your prospect clicks the link.

### Key benefits:
- **Timely calls:** Call your client right when they are thinking about you. Conversion rates increase dramatically.
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
- **UI personalizable de verdad:** Usa el cotizador con tu marca tal cual, o construye tu propia interfaz por completo con los hooks headless (\`useQuoteBuilder\`) — el SDK nunca te obliga a pelear con estilos que no puedes sobreescribir.
- **Tipado end-to-end:** Los tipos de TypeScript se generan del código real, no se escriben a mano — tu editor siempre sabe qué existe.`,
            en: `## Quotes on autopilot
With Cord Elements, you can offer a "self-service" experience to your recurring wholesale clients. By embedding a few lines of code into your existing portal, you enable a specialized shopping cart for complex commercial deals.

### Key benefits:
- **Lower operational load:** Your sales agents don't have to build repetitive quotes for regular clients.
- **Dynamic pricing respected:** Elements reads the specific price list assigned to that client and automatically displays their negotiated discounts.
- **Real customizable UI:** Use the quoter with your brand as-is, or build your entire own interface with the headless hooks (\`useQuoteBuilder\`) — the SDK never forces you to fight styles you can't override.
- **End-to-end typed:** TypeScript types are generated from the real code, never hand-written — your editor always knows what's there.`
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
            es: 'Cada cotización que aprueba tu cliente queda firmada con un hash SHA-256, su IP y la fecha exacta. Un sello visible se lo confirma, y le confirma que ese documento está listo para facturarse con CFDI 4.0.',
            en: 'Every quote your client approves gets signed with a SHA-256 hash, their IP, and the exact date. A visible seal confirms it — and confirms the document is ready to be invoiced with CFDI 4.0.'
        },
        content: {
            es: `## El respaldo que evita el "yo nunca aprobé eso"
Cotizar por WhatsApp o PDF suelto no deja ninguna prueba de que tu cliente aceptó los términos. Cord firma cada aprobación con un hash criptográfico inmutable — nombre, IP, fecha y hora — y lo muestra en un sello visible dentro de la misma cotización.

### Beneficios clave:
- **Evidencia real, no solo un "aprobado":** El sello de auditoría queda ligado a la versión exacta de la cotización que tu cliente vio y aceptó.
- **Listo para facturar:** Para negocios en México, el sello indica que ese documento está preparado para timbrarse con CFDI 4.0 sin recapturar nada.
- **Visible en todos lados:** El mismo sello aparece tanto en el link público (\`/q\`) como en cualquier cotizador embebido con Cord Elements en tu propio sitio — no es exclusivo de un canal.`,
            en: `## The backup that ends "I never approved that"
Quoting over WhatsApp or a loose PDF leaves no proof your client accepted the terms. Cord signs every approval with an immutable cryptographic hash — name, IP, date, and time — and shows it in a visible seal right inside the quote.

### Key benefits:
- **Real evidence, not just an "approved" flag:** The audit seal is tied to the exact version of the quote your client saw and accepted.
- **Ready to invoice:** For Mexican businesses, the seal signals the document is prepared to be stamped with CFDI 4.0 with zero retyping.
- **Visible everywhere:** The same seal shows up on the public link (\`/q\`) and on any quote embedded via Cord Elements on your own site — it isn't exclusive to one channel.`
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
- **Ficha del cliente:** cada perfil de cliente muestra su uso de crédito en vivo (saldo abierto vs. límite, con aviso si lo excede), su tasa de cierre real y el descuento que se le ha cedido en negociación — la misma señal que usa el motor de riesgo, visible de un vistazo.`,
            en: `## Automated risk control
Selling on credit is standard, but controlling that risk usually requires constant manual communication between sales and finance teams. Cord automates these rules.

### Key benefits:
- **Hard credit limits:** If a client has a $100,000 MXN limit and already owes $95,000, an agent won't be able to approve a $10,000 quote for them.
- **Net 30/60 Terms:** Upon approving the quote, Cord automatically schedules the due date and the collections cycle.
- **Autonomy for sales:** Agents can sell freely as long as the client is in good standing, without friction or manual authorizations.
- **Client profile:** every client profile shows live credit usage (open balance vs. limit, with a warning if they're over it), their real close rate, and the discount you've given them in negotiation — the same signal the risk engine uses, visible at a glance.`
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
            en: 'An intelligent agent that, once credit terms lapse, writes polite email reminders with the real payment link — and if the client can\'t pay in full, negotiates a plan of 2 or 3 monthly installments.'
        },
        content: {
            es: `## Recupera tu dinero sin dañar la relación
Perseguir la cartera vencida es incómodo para los equipos de ventas y consume tiempo valioso del equipo administrativo. Nuestro agente de cobranza con Inteligencia Artificial lo hace por ti, y solo entra en acción cuando el crédito realmente venció.

### Beneficios clave:
- **Tono adaptativo:** La IA sabe si el cliente se retrasó por primera vez (tono amable y recordatorio) o si lleva 60 días vencido (tono más firme).
- **Link de pago real en cada correo:** Cuando tienes cobros en línea activos, el recordatorio incluye un botón que lleva directo al pago del monto exacto pendiente (tarjeta o SPEI), directo a tu banco.
- **Negocia cuotas por ti:** Si el cliente no puede saldar de golpe, el agente puede acordar un plan de 2 o 3 cuotas mensuales que suman exactamente el adeudo (sin descuentos), y crea automáticamente los cobros pagables de cada cuota.
- **Control total (opt-in):** La cobranza autónoma se activa manualmente por negocio. Tú decides cuándo tu cartera queda en manos del agente.`,
            en: `## Recover your money without damaging relationships
Chasing overdue invoices is awkward for sales teams and consumes valuable admin time. Our AI collections agent does it for you, and only steps in once the credit terms have actually lapsed.

### Key benefits:
- **Adaptive tone:** The AI knows if a client is late for the first time (polite reminder tone) or if they are 60 days overdue (firmer tone).
- **A real payment link in every email:** When you have online payments active, the reminder includes a button that goes straight to paying the exact outstanding amount (card or SPEI), directly to your bank.
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
- **Cada parte, un cobro real:** Anticipo, saldo y cuotas son cobros independientes con su propio link, cada uno directo a tu banco vía Stripe. La cotización se marca pagada solo cuando no queda ningún cobro pendiente.`,
            en: `## Charge the way sales actually work
Not every sale is paid all at once. Many businesses collect a percentage up front to kick off the order and the rest on delivery. Cord makes it native.

### Key benefits:
- **Deposit % per quote or as a default:** Set a deposit (e.g. 50%) in the editor, or configure it as your business default so it pre-fills. The editor shows you live how much your client pays on approval and how much is left as balance.
- **A clear breakdown for the client:** The public link shows "total $X · today you pay $Y as a deposit, balance $Z." No surprises.
- **Payment opens when it makes sense:** A cash quote is payable right away; a credit quote (Net 30/60) doesn't ask for money until the due date arrives. The deposit, if any, is always payable on approval.
- **Each part is a real charge:** Deposit, balance and installments are independent charges each with their own link, all straight to your bank via Stripe. The quote is marked paid only once no charge remains pending.`
        },
        area: 'finanzas',
        status: 'live',
        api: false
    },

    {
        id: '8',
        slug: 'cfdi-automatico',
        title: {
            es: 'Cord Invoicing — CFDI 4.0 (México)',
            en: 'Cord Invoicing — CFDI 4.0 (Mexico)'
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
            es: `## Datos maestros siempre correctos
Con la entrada del CFDI 4.0, el SAT exige que el Nombre, Código Postal y Régimen Fiscal del receptor coincidan exactamente con sus bases de datos. Un espacio de más o una coma mal puesta resulta en un error de timbrado.

### Beneficios clave:
- **Extracción OCR:** Tus clientes simplemente suben el PDF de su Constancia de Situación Fiscal y Cord extrae todos los datos automáticamente mediante inteligencia artificial.
- **Validación instantánea:** Cord verifica en tiempo real que el RFC no esté en listas negras (EFOS/EDOS) y que la información sea vigente.
- **Actualización masiva:** Solicita a toda tu cartera de clientes que actualicen sus datos con un solo clic a través de un portal seguro.`,
            en: `## Master data always correct
With CFDI 4.0, the SAT requires the receiver's Name, Zip Code, and Tax Regime to match exactly with their databases. An extra space or a misplaced comma results in a stamping error.

### Key benefits:
- **OCR Extraction:** Your clients simply upload the PDF of their Tax Situation Certificate and Cord extracts all the data automatically using artificial intelligence.
- **Instant validation:** Cord verifies in real-time that the RFC is not on blacklists (EFOS/EDOS) and that the information is current.
- **Bulk updates:** Ask your entire client portfolio to update their data with a single click through a secure portal.`
        },
        area: 'fiscal',
        status: 'next',
        api: true
    },
    {
        id: '10',
        slug: 'facturacion-internacional',
        title: {
            es: 'Cord Invoicing',
            en: 'Cord Invoicing'
        },
        shortDesc: {
            es: 'Factura en el país donde vendes y en la moneda de la venta. CFDI 4.0 ante el SAT en México; en el resto del mundo, una factura con tu marca, folio propio y el tipo de cambio declarado.',
            en: 'Invoice in the country where you sell and in the currency of the sale. CFDI 4.0 with the SAT in Mexico; everywhere else, an invoice with your brand, its own numbering, and the exchange rate stated on it.'
        },
        content: {
            es: `## Una sola forma de facturar, en cualquier país
El carril regulatorio cambia según dónde estés; tu flujo de trabajo no. Apruebas la cotización, presionas facturar y Cord elige el carril correcto por ti.

### Beneficios clave:
- **México — CFDI 4.0 real:** timbrado ante el SAT, con tu propio CSD si lo subiste, y XML + PDF descargables. Este carril es exclusivo de México: es la regulación mexicana, no la de todos.
- **Resto del mundo — factura de Cord:** folio propio por organización, datos congelados en el momento de emitir, y un PDF con el logo y el color de tu negocio. Es una factura comercial: no afirma haber sido presentada ante la autoridad fiscal local.
- **En la moneda de la venta:** el documento se emite en la moneda en que le vendiste al cliente. Si tu contabilidad va en otra, la factura declara el tipo de cambio aplicado y el total convertido.
- **Numeración por país:** cada país lleva su propia serie, así que un cambio de mercado no rompe tu secuencia de folios.

### Lo que todavía no hace:
Fuera de México, la factura no se presenta automáticamente ante la autoridad local. Los rieles de facturación electrónica obligatoria de otros países —Verifactu en España, DIAN en Colombia, SII en Chile— están en la lista, y la arquitectura ya está preparada para conectarlos.`,
            en: `## One way to invoice, in any country
The regulatory rail changes depending on where you are; your workflow does not. Approve the quote, hit invoice, and Cord picks the right rail for you.

### Key benefits:
- **Mexico — real CFDI 4.0:** stamped with the SAT, using your own CSD if you uploaded it, with downloadable XML + PDF. This rail is Mexico-only: it is Mexican regulation, not everyone's.
- **Everywhere else — a Cord invoice:** its own numbering per organization, data frozen at issue time, and a PDF carrying your business's logo and color. It is a commercial invoice: it does not claim to have been filed with the local tax authority.
- **In the currency of the sale:** the document is issued in the currency you sold in. If your books are in a different one, the invoice states the exchange rate applied and the converted total.
- **Numbering per country:** each country keeps its own series, so entering a new market never breaks your folio sequence.

### What it does not do yet:
Outside Mexico, the invoice is not automatically filed with the local authority. Mandatory e-invoicing rails in other countries — Verifactu in Spain, DIAN in Colombia, SII in Chile — are on the list, and the architecture is already prepared to connect them.`
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
            es: 'Entérate por correo o Slack cuando tu cliente ve, aprueba, rechaza o paga una cotización — sin tener que revisar el dashboard.',
            en: 'Find out by email or Slack when your client views, approves, rejects, or pays a quote — without checking the dashboard.'
        },
        content: {
            es: `## Entérate en el momento, no cuando revisas el dashboard
Una matriz de 7 eventos por 2 canales (correo y Slack) en Ajustes › Notificaciones. Marca las casillas que quieras y se guardan al instante.

### Beneficios clave:
- **Correo al dueño de la cuenta:** vista, aprobada, rechazada, pago recibido, por vencer, pago vencido y equipo — vienen encendidos por default en aprobada/rechazada/pagada desde el primer día.
- **Slack para todo el equipo:** conecta un Incoming Webhook y publica los mismos eventos en tu canal, con folio, cliente, total y link directo.
- **Sin ruido falso:** solo se dispara lo que de verdad marcaste — nada se postea "por si acaso".`,
            en: `## Find out the moment it happens, not when you check the dashboard
A matrix of 7 events by 2 channels (email and Slack) under Settings › Notifications. Check the boxes you want and they save instantly.

### Key benefits:
- **Email to the account owner:** viewed, approved, rejected, payment received, about to expire, overdue, and team — approved/rejected/paid come on by default from day one.
- **Slack for the whole team:** connect an Incoming Webhook and post the same events to your channel, with folio, client, total, and a direct link.
- **No false noise:** only what you actually checked fires — nothing gets posted "just in case".`
        },
        area: 'finanzas',
        status: 'live',
        api: false
    },
    {
        id: '14',
        slug: 'facturas-emitidas',
        title: {
            es: 'Cord Invoicing: facturas de principio a fin',
            en: 'Cord Invoicing: invoices from start to finish'
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
- **Cobranza completa:** registra pagos manuales o parciales, cobra en el link público cuando Stripe Connect está habilitado y convierte una factura en recurrencia mensual.
- **Operación verificable:** actividad por documento, selección masiva sólo para facturas elegibles, exportación CSV y documentos de prueba marcados sin mezclarlos con estados comerciales.
- **Automatizable:** lista y administra facturas mediante la API pública de Cord y sus herramientas MCP.`,
            en: `## From capture to collection, without leaving Cord
Cord Invoicing brings together the commercial document, the fiscal issuance required for the seller's country, delivery, and collection. Each invoice keeps one history from draft to payment.

### Key benefits:
- **Direct creation and issuance:** build line items, save drafts without a number, and issue only after reviewing the client, total, due date, and recipient.
- **Delivery with context:** send by email, share the client link, download PDF/XML, and see whether an invoice was sent, viewed, overdue, or paid.
- **Complete collection:** record manual or partial payments, collect through the public link when Stripe Connect is enabled, and turn an invoice into a monthly recurrence.
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
            es: 'Conecta Cord con las herramientas donde ya trabajas y encadena acciones automáticas: cuando pasa X en una cotización, que ocurra Y — sin escribir código.',
            en: 'Connect Cord to the tools you already work in and chain automatic actions: when X happens on a quote, make Y happen — without writing code.'
        },
        content: {
            es: `## Que el cierre dispare el resto del trabajo
Hoy Cord ya avisa lo que pasa (correo, Slack, webhooks) y su API pública permite construir lo que quieras encima. Lo que falta es el paso intermedio: encadenar acciones sin escribir código.

### Qué estamos construyendo:
- **Catálogo de integraciones:** conexiones listas con las herramientas donde ya vive tu operación, en vez de un webhook que alguien tiene que programar.
- **Flujos con condiciones:** "si la cotización supera cierto monto, pide aprobación y avisa al canal de dirección"; "si el cliente no abre el link en 3 días, manda el recordatorio". Reglas visibles, editables y auditables.
- **Acciones encadenadas:** que aprobar dispare la factura, el alta del cliente y la tarea de seguimiento, sin que nadie las haga a mano.

### Por qué todavía no está:
Una automatización que falla en silencio es peor que no tenerla. Antes de abrirla queremos que cada flujo deje registro de qué se disparó, cuándo y con qué resultado — y que se pueda reintentar.`,
            en: `## Let the close trigger the rest of the work
Cord already tells you what happens (email, Slack, webhooks) and its public API lets you build anything on top. What's missing is the middle step: chaining actions without writing code.

### What we're building:
- **Integration catalog:** ready-made connections to the tools your operation already lives in, instead of a webhook someone has to program.
- **Conditional flows:** "if the quote is above a certain amount, request approval and notify the leadership channel"; "if the client doesn't open the link in 3 days, send the reminder." Rules that are visible, editable, and auditable.
- **Chained actions:** approval triggering the invoice, the client record, and the follow-up task, without anyone doing them by hand.

### Why it isn't here yet:
An automation that fails silently is worse than not having one. Before opening it up, we want every flow to record what fired, when, and with what result — and to be retryable.`
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
- **Visible para el cliente:** el link público muestra el cronograma completo — qué ya pagó, qué sigue y qué falta por cumplirse — sin que nadie tenga que explicarlo por correo.
- **Ajustes a medio camino:** un proyecto que cambia de alcance debe poder re-negociar los hitos pendientes sin romper los ya cobrados.

### Por qué todavía no está:
Un hito que se puede cobrar antes de cumplirse es un problema de dinero, no de interfaz. El orden correcto es primero la condición y su evidencia, después el botón de pago.`,
            en: `## Charging the way the deal was actually closed
Cord already charges deposit-and-balance, and in even installments. What's missing is the real case for projects and implementations: payments tied to **milestones**, not a uniform calendar.

### What we're building:
- **Milestone schedule:** define each stage with its name, its percentage or amount, and its condition ("on design delivery", "at production start"), instead of splitting the total into equal parts.
- **Event-based release:** a milestone's charge unlocks when that milestone is marked complete, not when an arbitrary date arrives.
- **Visible to the client:** the public link shows the full schedule — what's paid, what's next, and what's still pending — without anyone explaining it over email.
- **Mid-flight adjustments:** a project that changes scope should be able to renegotiate pending milestones without breaking the ones already charged.

### Why it isn't here yet:
A milestone that can be charged before it's met is a money problem, not an interface one. The right order is the condition and its evidence first, the payment button second.`
        },
        area: 'finanzas',
        status: 'next',
        api: true
    }
];
