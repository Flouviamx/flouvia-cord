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
- **Impuesto por línea y por país:** cada concepto lleva su propia tasa, así que un servicio gravado y uno exento conviven en la misma cotización sin aplanarse a una sola tasa. El nombre y las tasas sugeridas cambian con el país de tu cuenta: IVA en México, Colombia, España, Argentina, Chile y Perú; VAT en Reino Unido; sales tax en Estados Unidos, sembrado por estado en las 50 entidades más D.C.; y en Canadá el GST con la tasa provincial desglosada, o la HST. En Chile el IVA se calcula sobre el neto del documento, como lo define el SII. Ves el total final antes de enviar la cotización.
- **Descuentos y cupones:** un descuento sobre toda la venta, en porcentaje o en monto, o un cupón de tu negocio. Se aplica antes de impuestos y se reparte entre las líneas.
- **Guardado automático:** Crea borradores sin perder información.`,
            en: `## Total control over your proposals
Cord's quote editor is designed to give you agility without losing control. You don't need to jump between Excel sheets and PDF formats. From a single screen, you can search for products in your catalog, adjust quantities, and see how the price changes in real-time.

### Key benefits:
- **Tax per line and country:** every line item carries its own rate, so taxed and exempt services can coexist without flattening to one rate. Names and suggested rates change with your account country: VAT in the UK; sales tax in the US, seeded by state across all 50 states plus DC; IVA in Mexico, Colombia, Spain, Argentina, Chile, and Peru; and in Canada, GST with the provincial rate broken out, or HST. In Chile, VAT is computed on the document's net total, as the SII defines it. You see the final total before sending the quote.
- **Discounts and coupons:** a discount on the whole sale, as a percentage or an amount, or one of your business's coupons. It applies before tax and is spread across the lines.
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
            es: 'Embebe cotizaciones y facturas en el portal de tu empresa o tu sitio web. SDK estable (React, Vue, Web Components) con un núcleo headless para construir tu propia experiencia, y SDK de servidor y CLI aparte.',
            en: 'Embed quotes and invoices in your company portal or website. Stable SDK (React, Vue, Web Components) with a headless core to build your own experience, plus a separate server SDK and CLI.'
        },
        content: {
            es: `## Cotizaciones en piloto automático
Con Cord Elements, puedes ofrecer una experiencia de "autoservicio" a tus clientes mayoristas recurrentes. Al integrar unas pocas líneas de código en tu portal existente, habilitas un carrito de compras especializado para tratos comerciales complejos.

### Beneficios clave:
- **Menor carga operativa:** Tus agentes de ventas no tienen que armar cotizaciones repetitivas para clientes habituales.
- **Tus impuestos y divisas, no unos fijos:** El cotizador toma de tu cuenta las divisas que ofreces, el impuesto de cada línea y tus retenciones; el total coincide con el que calcula Cord.
- **Cotización, factura y datos fiscales:** \`<cord-quote>\` para aprobar y firmar, \`<cord-invoice>\` para cobrar una factura y \`<cord-fiscal-form>\` para capturar el RFC, el régimen y el uso de CFDI ya validados.
- **UI personalizable de verdad:** Temas, 22 variables y reglas por componente sin escribir CSS, o tu propia interfaz completa con el núcleo headless (\`useQuoteBuilder\`, \`createQuoteBuilder\`).
- **Seguro por diseño:** Solo en los dominios que autorizas se puede aprobar y pagar, y el pago siempre se abre en una ventana de Cord, nunca dentro de tu sitio.
- **Tipado end-to-end:** Los tipos de TypeScript se generan del código real, no se escriben a mano; tu editor siempre sabe qué existe.`,
            en: `## Quotes on autopilot
With Cord Elements, you can offer a "self-service" experience to your recurring wholesale clients. By embedding a few lines of code into your existing portal, you enable a specialized shopping cart for complex commercial deals.

### Key benefits:
- **Lower operational load:** Your sales agents don't have to build repetitive quotes for regular clients.
- **Your taxes and currencies, not fixed ones:** The quote builder takes the currencies you offer, each line's tax and your withholdings from your account; the total matches the one Cord computes.
- **Quote, invoice and tax details:** \`<cord-quote>\` to approve and sign, \`<cord-invoice>\` to collect an invoice and \`<cord-fiscal-form>\` to capture the RFC, tax regime and CFDI use already validated.
- **Real customizable UI:** Themes, 22 variables and per-component rules without writing CSS, or your own full interface with the headless core (\`useQuoteBuilder\`, \`createQuoteBuilder\`).
- **Secure by design:** Approving and paying only work on the domains you authorize, and payment always opens in a Cord window, never inside your site.
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
        id: '23',
        slug: 'descuentos-y-cupones',
        title: {
            es: 'Descuentos y cupones',
            en: 'Discounts and coupons'
        },
        shortDesc: {
            es: 'Un descuento sobre toda la venta, en porcentaje o en monto, o un cupón con vigencia y tope de usos. Se aplica antes de impuestos, se reparte entre las líneas y llega igual a la factura y al documento fiscal.',
            en: 'A discount on the whole sale, as a percentage or an amount, or a coupon with validity dates and a usage cap. It applies before tax, is spread across the lines, and carries through unchanged to the invoice and the tax document.'
        },
        content: {
            es: `## Una rebaja que cuadra en cada documento
Un descuento parece una resta, pero en una venta con varias tasas de impuesto, retenciones y un documento fiscal detrás, mal repartido descuadra el total. Cord lo calcula con el mismo motor que el resto de la venta: se aplica antes de impuestos, se reparte entre las líneas en proporción a su importe y la suma por línea es exactamente el descuento.

### Qué incluye
- **Descuento de documento:** en porcentaje o en un monto en la divisa de la venta. Un monto nunca supera el importe bruto, y con precios con impuesto incluido rebaja lo que paga el cliente.
- **Cupones de tu negocio:** código propio, vigencia en la zona horaria de tu negocio, divisa obligatoria cuando el cupón es un monto, y tope de usos global y por cliente. Se administran en Ajustes › Descuentos › Cupones.
- **El uso se cuenta cuando compromete:** el cupón se redime al aprobarse la cotización o al emitirse la factura, no al escribirlo. Si ya no quedan usos, la cotización no se aprueba ni la factura se emite, y queda anotado en el historial. Rechazar la cotización, anular la factura o borrar el borrador libera el uso.
- **Hasta el documento fiscal:** el PDF muestra el importe bruto de cada concepto y el renglón de descuento con su código. En México cada concepto del CFDI lleva su parte del descuento, en España el registro declara la base ya descontada y una nota de crédito lo prorratea.
- **Retenciones sobre la base correcta:** se calculan sobre las bases ya descontadas.
- **Aprobaciones coherentes:** un descuento manual cuenta para los flujos de aprobación de descuento; un cupón, que ya autorizó el negocio, no.
- **Por API y en tu sitio:** la API acepta un descuento o un código de cupón, y el cupón es el único descuento que admite una llave publicable, así que tu cotizador embebido puede ofrecerlo.

### Límites claros
Un cupón ya aplicado se conserva al editar el documento aunque después venza. Código, tipo, valor y divisa no se editan: un cupón usado se desactiva, no se borra. Una factura recurrente solo lleva un descuento manual.`,
            en: `## A discount that adds up on every document
A discount looks like a subtraction, but on a sale with several tax rates, withholdings and a tax document behind it, a badly allocated discount throws off the total. Cord computes it with the same engine as the rest of the sale: it applies before tax, is spread across the lines in proportion to their amount, and the per-line amounts add up exactly to the discount.

### What's included
- **Document discount:** a percentage or an amount in the sale currency. An amount never exceeds the gross total, and with tax-inclusive prices it reduces what the customer pays.
- **Your own coupons:** your own code, validity dates in your business's time zone, a required currency when the coupon is an amount, and a usage cap overall and per customer. Manage them in Settings › Discounts › Coupons.
- **Usage counts when it commits:** a coupon is redeemed when the quote is approved or the invoice is issued, not when it's typed. If no uses are left, the quote is not approved and the invoice is not issued, and the history says so. Rejecting the quote, voiding the invoice or deleting the draft releases the use.
- **All the way to the tax document:** the PDF shows each line's gross amount and a discount row with its code. In Mexico each CFDI line carries its share of the discount, in Spain the record declares the discounted base, and a credit note prorates it.
- **Withholdings on the right base:** they are computed on the discounted bases.
- **Consistent approvals:** a manual discount counts toward discount approval flows; a coupon, already authorized by the business, does not.
- **Through the API and on your site:** the API accepts a discount or a coupon code, and the coupon is the only discount a publishable key can apply, so your embedded quote builder can offer it.

### Clear limits
A coupon already applied stays when the document is edited, even if it later expires. Code, type, value and currency can't be edited: a used coupon is deactivated, not deleted. A recurring invoice carries only a manual discount.`
        },
        area: 'cotizaciones',
        status: 'live',
        api: true
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
- **Portal del cliente:** un link por cliente con todas sus facturas y el pago de varias en un solo cobro.
- **Depósitos y conciliación:** el negocio consulta los depósitos enviados a su cuenta bancaria, su estado y la frecuencia configurada.
- **Operación posterior al cobro:** reembolsos, contracargos y evidencia permanecen ligados a la organización y al movimiento que los originó.
- **Mercado Pago como segundo riel:** el cliente paga la cotización o la factura desde el mismo link con el botón de Mercado Pago, y el dinero llega a la cuenta de Mercado Pago del negocio. Admite abono parcial de una factura, Cord confirma el pago leyéndolo en Mercado Pago —no confiando en el aviso— y lee los reembolsos hechos ahí para reabrir el saldo. En México y Brasil es la alternativa y Cord Payments sigue siendo el principal.

### Disponibilidad real
El alta de cobros en línea depende del país de la organización y de los requisitos que devuelve el proveedor. México, Estados Unidos, Canadá, Brasil, España, Reino Unido, Alemania y Francia tienen carril de cuenta conectada. En Colombia, Argentina, Chile y Perú, Cord Payments no está disponible y el cobro en línea es con Mercado Pago. Mercado Pago funciona en México, Brasil, Colombia, Argentina, Chile y Perú: la conexión se confirmó el 21 de septiembre de 2026 con cuentas de México y de Colombia.

### Qué sigue:
El cobro automático de facturas con reintentos y la domiciliación SEPA y ACH están construidos y en beta hasta completar su activación.

Igualas recurrentes con Mercado Pago: hoy una iguala necesita la suscripción de Cord Payments, porque Mercado Pago cobra cuando el cliente abre el link y no guarda su tarjeta para después.

SPEI es un riel mexicano y solo liquida MXN. Fuera de México, Cord no muestra ese método ni aplica una tarifa mexicana a otra divisa.`,
            en: `## From agreement to money, without switching systems
Cord Payments connects the moment a sale is approved with the moment funds reach your account. The client pays from the quote or invoice link; Cord keeps the payment state next to the document that created it.

This is not a wallet where Cord holds your funds. The payment account belongs to your business and charges are processed on that connected account. Before enabling it, Cord collects the information and documents the provider requires to verify the company, its representatives, and its beneficial owners.

### Available capabilities:
- **Card payments from the public link:** the buyer pays the outstanding amount without requesting another link or entering a separate portal.
- **SPEI for Mexico:** when the transaction is denominated in MXN, Cord can show a bank account number tied to the charge and reconcile the transfer when it arrives.
- **Deposit, balance, and installments:** every part keeps its amount, status, and reference, and the quote becomes paid only when no balance remains.
- **Payable invoices:** Cord Invoicing documents also have a public link with the current balance and the method available to that account.
- **Customer portal:** one link per customer with all their invoices and payment of several in a single charge.
- **Payouts and reconciliation:** the business can review payouts sent to its bank account, their status, and the configured schedule.
- **After-payment operations:** refunds, disputes, and evidence remain tied to the organization and the movement that created them.
- **Mercado Pago as a second rail:** the client pays the quote or the invoice from the same link with the Mercado Pago button, and the money lands in the business's Mercado Pago account. It supports partial payment of an invoice, Cord confirms the payment by reading it in Mercado Pago — not by trusting the notice — and reads refunds issued there to reopen the balance. In Mexico and Brazil it is the alternative and Cord Payments remains the main rail.

### Actual availability
Online payment onboarding depends on the organization's country and on the requirements returned by the provider. Mexico, the United States, Canada, Brazil, Spain, the United Kingdom, Germany, and France have a connected-account rail. In Colombia, Argentina, Chile, and Peru, Cord Payments is not available and online collection runs on Mercado Pago. Mercado Pago works in Mexico, Brazil, Colombia, Argentina, Chile, and Peru: the connection was confirmed on September 21, 2026 with Mexican and Colombian accounts.

### What's next:
Automatic invoice collection with retries and SEPA and ACH direct debit are built and in beta until their activation is complete.

Recurring retainers with Mercado Pago: today a retainer needs the Cord Payments subscription, because Mercado Pago charges when the client opens the link and does not store their card for later.

SPEI is a Mexican rail and settles only MXN. Outside Mexico, Cord does not show that method or apply a Mexican fee to another currency.`
        },
        area: 'finanzas',
        status: 'live',
        api: false
    },
    {
        id: '24',
        slug: 'portal-del-cliente',
        title: {
            es: 'Portal del cliente y pago de varias facturas',
            en: 'Customer portal and multi-invoice payment'
        },
        shortDesc: {
            es: 'Un link por cliente con todas sus facturas, su saldo por divisa y el pago de varias en un solo cobro. Si después se devuelve parte del dinero, el reembolso se reparte entre las facturas que pagó.',
            en: 'One link per customer with all their invoices, their balance by currency, and payment of several in a single charge. If part of the money is refunded later, the refund is allocated across the invoices it paid.'
        },
        content: {
            es: `## Lo que debe tu cliente, en un solo lugar
Las áreas de cuentas por pagar no pagan factura por factura: revisan todo lo pendiente con un proveedor y liquidan varias a la vez. El portal del cliente les da exactamente eso, sin crear una cuenta y sin pedirte un estado de cuenta por correo.

### Qué incluye
- **Un link por cliente:** reúne sus facturas emitidas con su estado, su vencimiento y sus descargas. Lo creas, lo envías, lo rotas o lo apagas desde la ficha del cliente, y cada acción queda en la auditoría.
- **Saldo por divisa:** si el cliente tiene facturas en pesos y en dólares, ve dos saldos. Cord nunca suma importes de divisas distintas.
- **Pago de varias facturas:** el cliente elige cuáles paga y Cord fija el reparto al crear el cobro con el saldo real de cada una, no con lo que mande el navegador. Un solo cargo liquida cada factura por separado, y cada una conserva su historial.
- **Reembolsos repartidos:** devolver parte de un cobro que pagó varias facturas reabre el saldo factura por factura, de la última aplicada a la primera, cada una completa o nada. Así el reembolso siempre sabe a qué factura le toca.
- **Privado por diseño:** el link es la credencial. No se comparte como origen con otros sitios, no se guarda en caché, no se indexa y no lleva analítica. Vive en cordhq.app, nunca en el dominio propio de tu negocio, porque es una superficie donde se paga.

### Límites claros
El pago en línea desde el portal requiere Cord Payments activo. Con Mercado Pago como único riel, el cliente ve sus facturas y su saldo, y paga cada una desde su propio link. Solo aparecen las facturas ligadas a un cliente, y un CFDI sustituido no se lista: lo reemplaza su sustituto.`,
            en: `## What your customer owes, in one place
Accounts payable teams don't pay invoice by invoice: they review everything outstanding with a supplier and settle several at once. The customer portal gives them exactly that, without creating an account and without asking you for a statement by email.

### What's included
- **One link per customer:** it gathers their issued invoices with status, due date and downloads. You create, send, rotate or turn it off from the customer profile, and every action is recorded in the audit log.
- **Balance by currency:** if the customer has invoices in pesos and in dollars, they see two balances. Cord never adds up amounts in different currencies.
- **Paying several invoices:** the customer picks which ones to pay and Cord sets the allocation when the charge is created, using each invoice's real balance, not whatever the browser sends. One charge settles each invoice separately, and each keeps its own history.
- **Allocated refunds:** refunding part of a charge that paid several invoices reopens the balance invoice by invoice, from the last one applied to the first, each one in full or not at all. The refund always knows which invoice it belongs to.
- **Private by design:** the link is the credential. It is not shared as a referrer with other sites, not cached, not indexed and carries no analytics. It lives on cordhq.app, never on your business's own domain, because it is a surface where people pay.

### Clear limits
Paying online from the portal requires Cord Payments to be active. With Mercado Pago as the only rail, the customer sees their invoices and balance, and pays each one from its own link. Only invoices linked to a customer appear, and a substituted CFDI is not listed: its replacement is.`
        },
        area: 'finanzas',
        status: 'live',
        api: false
    },
    {
        id: '25',
        slug: 'cobro-automatico',
        title: {
            es: 'Cobro automático con reintentos',
            en: 'Automatic collection with retries'
        },
        shortDesc: {
            es: 'Tu cliente autoriza una tarjeta o una cuenta desde su portal y Cord cobra sus facturas al vencer, en un solo cargo por divisa, con reintentos que distinguen un rechazo definitivo de uno temporal.',
            en: 'Your customer authorizes a card or a bank account from their portal and Cord collects their invoices when due, in one charge per currency, with retries that tell a final decline from a temporary one.'
        },
        content: {
            es: `## Que la factura se cobre sola, con permiso del cliente
El cobro automático no lo enciende el negocio por su cuenta: lo autoriza el cliente. Desde su portal registra un método de pago, o marca "guardar" al pagar una factura, y desde ese día sus facturas se cobran al vencer sin que nadie tenga que perseguirlas.

### Cómo funciona
- **Consentimiento con evidencia:** el servidor registra fecha, IP y navegador de la autorización, y el cobro automático solo se activa cuando el procesador de pagos confirma ese método para ese cliente.
- **Un cargo por cliente y divisa:** cada día Cord reúne las facturas que vencen a partir del día de la autorización y las cobra en un solo cargo por divisa. Lo que ya debía antes no se le carga por sorpresa: lo paga desde su portal.
- **Aviso previo:** el correo de cada factura le dice al cliente la fecha y el método con que se cobrará.
- **Reintentos con criterio:** una tarjeta robada, un fraude o un mandato revocado apagan el método y no se reintentan; datos vencidos piden otro método; si el banco exige autenticación, se pide pagar desde el portal; fondos insuficientes esperan al siguiente 1 o 16 del mes; el resto se reintenta a los 2, 4 y 7 días, con un máximo de cuatro intentos con tarjeta. Un débito bancario solo se reintenta por fondos, dos veces y dentro del plazo de su esquema.
- **Nada se cobra dos veces:** un cargo cuya respuesta no llegó se reintenta con la misma clave de idempotencia y, si en 20 horas no aparece, se cancela.
- **Avisos a las dos partes:** el cliente recibe un correo con su portal cuando un cobro falla, y el negocio, una tarea cuando el cobro se detiene.

### Por qué está en beta
El código, la política de reintentos y sus pruebas están completos. Falta encender en la plataforma de pagos los avisos que este carril necesita, los de autorización confirmada y de débito en proceso, y completar la prueba de punta a punta en modo de prueba. Hasta entonces no se ofrece como disponible.`,
            en: `## Invoices that collect themselves, with the customer's permission
Automatic collection is not something the business turns on by itself: the customer authorizes it. From their portal they save a payment method, or tick "save" when paying an invoice, and from that day on their invoices are collected when due without anyone chasing them.

### How it works
- **Consent with evidence:** the server records the date, IP and browser of the authorization, and automatic collection only turns on once the payment processor confirms that method for that customer.
- **One charge per customer and currency:** every day Cord gathers the invoices due on or after the authorization date and collects them in a single charge per currency. What was already owed before is not charged by surprise: the customer pays it from their portal.
- **Advance notice:** each invoice email tells the customer the date and the method that will be charged.
- **Sensible retries:** a stolen card, fraud or a revoked mandate turns the method off and is never retried; expired details ask for another method; if the bank requires authentication, the customer is asked to pay from the portal; insufficient funds wait for the next 1st or 16th of the month; everything else is retried after 2, 4 and 7 days, up to four card attempts. A bank debit is only retried for insufficient funds, twice, within its scheme's window.
- **Nothing is charged twice:** a charge whose response never arrived is retried with the same idempotency key and, if it hasn't appeared after 20 hours, it is canceled.
- **Both sides are told:** the customer gets an email with their portal when a charge fails, and the business gets a task when collection stops.

### Why it is in beta
The code, the retry policy and their tests are complete. What remains is turning on the notifications this rail needs in the payments platform, for confirmed authorizations and debits in progress, and completing the end-to-end test in test mode. Until then it is not offered as available.`
        },
        area: 'finanzas',
        status: 'beta',
        api: false
    },
    {
        id: '26',
        slug: 'domiciliacion-sepa-ach',
        title: {
            es: 'Domiciliación bancaria SEPA y ACH',
            en: 'SEPA and ACH direct debit'
        },
        shortDesc: {
            es: 'Tu cliente paga la factura con un débito a su cuenta: SEPA en euros para negocios de España, Alemania y Francia, y ACH en dólares para Estados Unidos, con el mandato y los avisos que exige cada esquema.',
            en: 'Your customer pays the invoice with a debit from their bank account: SEPA in euros for businesses in Spain, Germany and France, and ACH in US dollars for the United States, with the mandate and notices each scheme requires.'
        },
        content: {
            es: `## Para el cliente que no paga facturas con tarjeta
En Europa y en Estados Unidos muchas empresas pagan a sus proveedores por domiciliación, no con tarjeta. Cord ofrece ese método en el link de la factura y en el portal del cliente, sobre la misma cuenta de cobros del negocio.

### Qué incluye
- **SEPA Direct Debit en euros** para negocios de España, Alemania y Francia, y **ACH Direct Debit en dólares** para negocios de Estados Unidos.
- **Se enciende por negocio** en Ajustes › Cobros. Cord pide la capacidad para la cuenta de cobros y solo ofrece el método cuando está activa.
- **Débito en proceso, a la vista:** un débito tarda días en confirmarse. Mientras tanto la factura no se puede cobrar otra vez ni anular, y el link y el portal lo dicen.
- **Mandato y avisos del esquema:** el titular recibe el aviso de cada cargo SEPA y la confirmación del mandato ACH.
- **Con el cobro automático:** el cliente puede autorizar su cuenta desde el portal para que sus facturas se cobren al vencer.

### Por qué está en beta
Falta habilitar SEPA y ACH para las cuentas de cobro en la plataforma de pagos, encender los avisos de débitos en proceso y de mandatos, y completar la prueba de punta a punta con cuentas de prueba de España y de Estados Unidos.`,
            en: `## For customers who don't pay invoices by card
In Europe and the United States many companies pay their suppliers by direct debit, not by card. Cord offers that method on the invoice link and in the customer portal, on the business's own payment account.

### What's included
- **SEPA Direct Debit in euros** for businesses in Spain, Germany and France, and **ACH Direct Debit in US dollars** for businesses in the United States.
- **Turned on per business** in Settings › Payments. Cord requests the capability for the payment account and only offers the method once it is active.
- **Debits in progress, in plain sight:** a debit takes days to confirm. Meanwhile the invoice can't be charged again or voided, and the link and the portal say so.
- **Scheme mandate and notices:** the account holder receives a notice for every SEPA charge and the ACH mandate confirmation.
- **With automatic collection:** the customer can authorize their account from the portal so their invoices are collected when due.

### Why it is in beta
SEPA and ACH still need to be enabled for payment accounts in the payments platform, the notifications for debits in progress and mandates need to be turned on, and the end-to-end test with Spanish and US test accounts needs to be completed.`
        },
        area: 'finanzas',
        status: 'beta',
        api: false
    },

    {
        id: '8',
        slug: 'cfdi-automatico',
        title: {
            es: 'CFDI 4.0 completo en Cord Invoicing',
            en: 'Complete CFDI 4.0 in Cord Invoicing'
        },
        shortDesc: {
            es: 'El carril mexicano de Cord Invoicing: PUE o PPD según el cobro, complemento de pago por cada abono, claves SAT por concepto, factura global, sustitución y CFDI a clientes extranjeros. Exclusivo de México.',
            en: 'The Mexican rail of Cord Invoicing: PUE or PPD based on payment, a payment complement for every payment, SAT codes per line item, global invoice, substitution and CFDI for foreign customers. Mexico only.'
        },
        content: {
            es: `## El ciclo completo del CFDI, no solo el timbre
Este es el carril de **México** dentro de Cord Invoicing. El CFDI 4.0 es una obligación mexicana: si vendes desde otro país, nada de esto aplica a tu cuenta.

Timbrar una factura es la parte fácil. El trabajo está en lo que viene después: la venta a crédito que exige complemento de pago, el cliente que pide su factura de una venta que ya entró en la global, la corrección que obliga a sustituir. Cord cubre ese ciclo dentro del mismo flujo de venta.

### Qué incluye
- **PUE o PPD según el cobro real:** si la factura nace pagada se timbra PUE con la forma de pago real; si no, PPD con forma 99.
- **Complemento de pago:** cada pago que se registra sobre un CFDI PPD emite su CFDI tipo P, una sola vez por pago, con su estado a la vista; si no se pudo timbrar, nos escribes y lo reintentamos.
- **Claves SAT por concepto:** la clave de producto o servicio y la de unidad viven en el producto y también en cada línea, y la de la línea gana. El editor avisa qué conceptos caerían en la clave genérica, busca en el catálogo del SAT, y el CSV de productos las importa y exporta.
- **Factura global:** para las ventas cobradas a público en general que no tienen factura propia, con la periodicidad, los meses y el año que pide el SAT. Una venta nunca queda a la vez en una global y en una factura individual; si después el cliente pide la suya, la global se cancela con motivo 04 y se vuelve a emitir.
- **Sustitución:** corrige un CFDI con uno nuevo relacionado (relación 04); los pagos pasan al sustituto en la misma operación y el original se cancela con motivo 01.
- **Motivos de cancelación:** eliges 02, 03 o 04; el 01 solo se usa al sustituir.
- **Clientes extranjeros y público en general:** RFC genérico de extranjeros con el identificador fiscal de su país y uso S01, o RFC genérico nacional con régimen 616 y el código postal del emisor.
- **Cero recaptura:** lo negociado en la cotización (conceptos, claves, impuestos y descuento) pasa a la factura, timbrada con tu propio sello digital (CSD) si lo subiste.

### Lo que todavía no hace
No emite el complemento de Comercio Exterior ni IEPS, y la lectura automática de la Constancia de Situación Fiscal sigue en el roadmap.`,
            en: `## The full CFDI cycle, not just the stamp
This is the **Mexico** rail inside Cord Invoicing. CFDI 4.0 is a Mexican obligation: if you sell from another country, none of this applies to your account.

Stamping an invoice is the easy part. The work is in what comes after: the credit sale that requires a payment complement, the customer who asks for their own invoice for a sale already included in the global invoice, the correction that requires a substitution. Cord covers that cycle inside the same sales flow.

### What's included
- **PUE or PPD based on actual payment:** an invoice that is born paid is stamped PUE with the real payment form; otherwise, PPD with form 99.
- **Payment complement:** every payment recorded on a PPD CFDI issues its type P CFDI, once per payment, with its status in view; if stamping fails, you write to us and we retry it.
- **SAT codes per line item:** the product or service code and the unit code live on the product and also on each line, and the line's code wins. The editor flags which lines would fall back to the generic code, searches the SAT catalog, and the product CSV imports and exports them.
- **Global invoice:** for paid sales to the general public that have no invoice of their own, with the periodicity, months and year the SAT requires. A sale is never in a global invoice and an individual invoice at the same time; if the customer later asks for theirs, the global invoice is canceled with reason 04 and issued again.
- **Substitution:** fix a CFDI with a new related one (relation 04); payments move to the replacement in the same operation and the original is canceled with reason 01.
- **Cancellation reasons:** you choose 02, 03 or 04; 01 is only used when substituting.
- **Foreign customers and the general public:** the generic foreign RFC with the customer's own tax ID and use S01, or the generic domestic RFC with regime 616 and the issuer's postal code.
- **Zero retyping:** what was negotiated on the quote (lines, codes, taxes and discount) carries into the invoice, stamped with your own digital seal certificate (CSD) if you uploaded it.

### What it does not do yet
It does not issue the Foreign Trade complement or IEPS, and automatic reading of the Tax Situation Certificate is still on the roadmap.`
        },
        area: 'fiscal',
        status: 'live',
        api: true
    },
    {
        id: '10',
        slug: 'facturacion-internacional',
        title: {
            es: 'Facturación internacional',
            en: 'International invoicing'
        },
        shortDesc: {
            es: 'Factura en el país donde vendes y en la moneda de la venta. Cord elige el carril de cada país: CFDI en México, factura electrónica europea, rieles de autoridad en beta y, donde no hay uno activo, una factura comercial con folio propio.',
            en: 'Invoice in the country where you sell and in the currency of the sale. Cord picks each country\'s rail: CFDI in Mexico, European e-invoices, tax authority rails in beta and, where none is active, a commercial invoice with its own numbering.'
        },
        content: {
            es: `## Una sola forma de facturar, en cualquier país
El carril regulatorio cambia según dónde estés; tu flujo de trabajo no. Apruebas la cotización, presionas facturar y Cord elige el carril que corresponde a tu país y a tu cuenta.

### Cómo se decide el carril
- **México:** CFDI 4.0 timbrado ante el SAT.
- **Unión Europea:** la factura sale además como Factur-X, XRechnung o Peppol cuando el negocio lo elige: en Alemania y Francia desde hoy, y en España sobre las facturas registradas con Verifactu, que también pueden salir como Facturae.
- **España, Argentina, Brasil, Chile, Colombia y Perú:** el registro o la autorización ante la AEAT, ARCA, el sistema nacional de la NFS-e y la SEFAZ, el SII, la DIAN y la SUNAT están construidos y en beta. Cada uno se enciende por país después de su prueba con un contribuyente real, y cada cuenta lo activa con sus propias credenciales.
- **Francia:** la transmisión por plataforma autorizada está construida y en beta; las menciones de la reforma ya van en toda factura francesa.
- **Sin riel activo:** factura comercial de Cord, con folio propio por organización, datos congelados al emitir y un PDF con tu marca. No afirma haber sido presentada ante la autoridad fiscal local.

### En todos los países
- **En la moneda de la venta:** si tu contabilidad va en otra, la factura declara el tipo de cambio aplicado y el total convertido.
- **Numeración por país y por emisor:** cada país lleva su propia serie (España reinicia cada año), y dos organizaciones con el mismo identificador fiscal no pueden numerar con la misma serie.
- **Idioma y vocabulario del país:** el PDF se escribe en la lengua del emisor y nombra el impuesto y el identificador fiscal como los nombra su autoridad.
- **Proforma donde hace falta:** en México, en España y donde el riel del país está activo, el documento sin validez fiscal sale como proforma, para que nadie lo confunda con una factura.

### Lo que todavía no hace
Fuera de los rieles activos, la factura no se presenta ante la autoridad local. Peppol para Reino Unido y la recepción de facturas de proveedores están en el roadmap.`,
            en: `## One way to invoice, in any country
The regulatory rail changes depending on where you are; your workflow does not. Approve the quote, hit invoice, and Cord picks the rail that matches your country and your account.

### How the rail is chosen
- **Mexico:** CFDI 4.0 stamped with the SAT.
- **European Union:** the invoice also comes out as Factur-X, XRechnung or Peppol when the business chooses to: in Germany and France today, and in Spain on invoices registered with Verifactu, which can also come out as Facturae.
- **Spain, Argentina, Brazil, Chile, Colombia and Peru:** registration or authorization with the AEAT, ARCA, the national NFS-e system and the SEFAZ, the SII, the DIAN and SUNAT is built and in beta. Each one is switched on per country after testing with a real taxpayer, and each account activates it with its own credentials.
- **France:** transmission through an approved platform is built and in beta; the reform's mandatory mentions already appear on every French invoice.
- **No active rail:** a Cord commercial invoice, with its own numbering per organization, data frozen at issue time and a PDF carrying your brand. It does not claim to have been filed with the local tax authority.

### In every country
- **In the currency of the sale:** if your books are in another currency, the invoice states the exchange rate applied and the converted total.
- **Numbering per country and issuer:** each country keeps its own series (Spain resets yearly), and two organizations with the same tax ID can't number with the same series.
- **The country's language and vocabulary:** the PDF is written in the issuer's language and names the tax and the tax ID the way its authority does.
- **Pro forma where it matters:** in Mexico, in Spain and wherever the country's rail is active, a document without tax validity comes out as a pro forma so nobody mistakes it for an invoice.

### What it does not do yet
Outside active rails, the invoice is not filed with the local authority. Peppol for the United Kingdom and receiving supplier invoices are on the roadmap.`
        },
        area: 'fiscal',
        status: 'live',
        api: true
    },
    {
        id: '27',
        slug: 'identificador-fiscal',
        title: {
            es: 'Identificador fiscal validado en 12 países',
            en: 'Tax ID validated in 12 countries'
        },
        shortDesc: {
            es: 'RFC, NIF, EIN, SIREN, USt-IdNr., VAT, Business Number, CNPJ, CPF, NIT, CUIT, RUT y RUC con la forma oficial y, donde existe, el dígito de control de cada país. Un error de captura se detecta al escribirlo, no cuando la autoridad rechaza la factura.',
            en: 'RFC, NIF, EIN, SIREN, USt-IdNr., VAT, Business Number, CNPJ, CPF, NIT, CUIT, RUT and RUC checked against each country\'s official format and, where one exists, its check digit. A typo is caught as it is typed, not when the authority rejects the invoice.'
        },
        content: {
            es: `## El dato que más rechazos causa, revisado antes de guardar
Un identificador fiscal mal capturado no falla al guardarlo: falla semanas después, cuando la autoridad rechaza la factura o el alta de cobros se detiene. Cord lo revisa en el momento con las reglas de cada país y te dice qué dato no cuadra, con su nombre local.

### Qué se valida
- **México:** RFC con su fecha y su dígito verificador; los RFC genéricos del SAT se aceptan.
- **España:** NIF, NIE y CIF con su letra o dígito de control.
- **Estados Unidos:** EIN con un prefijo que el IRS haya asignado, porque el EIN no tiene dígito de control.
- **Francia:** SIREN y SIRET con su dígito, y el número de TVA, cuya clave se calcula desde el SIREN.
- **Alemania:** USt-IdNr. con su dígito de control; la Steuernummer, por su forma, porque cada Land usa la suya.
- **Reino Unido:** VAT number con la verificación de HMRC, UTR y número de Companies House.
- **Canadá:** Business Number con su dígito y, si se captura, su cuenta de programa (RT para GST/HST).
- **Brasil:** CNPJ, también el alfanumérico, y CPF con sus dígitos verificadores.
- **Argentina, Chile y Perú:** CUIT, RUT y RUC con su dígito verificador.
- **Colombia:** NIT, con su dígito verificador cuando se captura separado por guion.

### Dónde aplica
En los datos de tu organización, la ficha de cada cliente, la importación por CSV, la API, el servidor MCP, la configuración asistida con IA, el cliente que se crea desde una cotización, el alta de cobros y el formulario fiscal de Cord Elements. El navegador valida mientras se escribe y el servidor vuelve a validar con el mismo código.`,
            en: `## The field behind the most rejections, checked before it is saved
A mistyped tax ID doesn't fail when it's saved: it fails weeks later, when the authority rejects the invoice or payment onboarding stalls. Cord checks it on the spot with each country's rules and tells you which field is wrong, using its local name.

### What is validated
- **Mexico:** RFC with its date and check digit; the SAT's generic RFCs are accepted.
- **Spain:** NIF, NIE and CIF with their control letter or digit.
- **United States:** EIN with a prefix the IRS has assigned, since the EIN has no check digit.
- **France:** SIREN and SIRET with their check digit, and the VAT number, whose key is computed from the SIREN.
- **Germany:** USt-IdNr. with its check digit; the Steuernummer by its format, because each state uses its own.
- **United Kingdom:** VAT number with HMRC's check, UTR and Companies House number.
- **Canada:** Business Number with its check digit and, if entered, its program account (RT for GST/HST).
- **Brazil:** CNPJ, including the alphanumeric one, and CPF with their check digits.
- **Argentina, Chile and Peru:** CUIT, RUT and RUC with their check digit.
- **Colombia:** NIT, with its check digit when entered after a hyphen.

### Where it applies
Your organization's details, each customer profile, CSV import, the API, the MCP server, AI-assisted setup, a customer created from a quote, payment onboarding and the Cord Elements tax form. The browser validates as you type and the server validates again with the same code.`
        },
        area: 'fiscal',
        status: 'live',
        api: true
    },
    {
        id: '28',
        slug: 'impuestos-canada',
        title: {
            es: 'Canadá: GST con la tasa provincial desglosada',
            en: 'Canada: GST with the provincial rate broken out'
        },
        shortDesc: {
            es: 'En Quebec, Columbia Británica, Saskatchewan y Manitoba el impuesto provincial se cobra junto al GST, no en su lugar. Cord lo calcula como una tasa combinada y lo desglosa en cada documento: GST y QST, PST o RST, o HST en las provincias armonizadas.',
            en: 'In Quebec, British Columbia, Saskatchewan and Manitoba the provincial tax is charged on top of GST, not instead of it. Cord computes it as one combined rate and breaks it out on every document: GST and QST, PST or RST, or HST in the harmonized provinces.'
        },
        content: {
            es: `## Dos impuestos en una línea, sin descuadrar
Una venta en Montreal lleva el 5 % de GST y el 9.975 % de QST; en Vancouver, GST y 7 % de PST. Capturarlos como dos tasas sueltas hacía que la línea cobrara solo una. Cord guarda una tasa combinada por línea, la calcula con el mismo motor que el resto de los países y la separa en sus impuestos al mostrarla.

### Qué incluye
- **Tasas por provincia:** al elegir la provincia de tu negocio, el catálogo se siembra con la combinada de esa provincia como predeterminada, más el GST solo y la HST de las provincias armonizadas, para vender hacia ellas. Son las tasas de la CRA vigentes desde el 1 de abril de 2025.
- **Desglose exacto:** el GST federal se calcula sobre la base y el provincial se queda con el resto, así que la suma es exactamente lo cobrado.
- **El nombre correcto:** QST en Quebec, RST en Manitoba y PST en el resto; en francés, TPS, TVQ y TVH.
- **En todas las superficies:** PDF, links de cotización y factura, impresión, detalle y los tres editores muestran cada impuesto por separado.
- **Tu número de QST** se imprime junto al de GST/HST.
- **Documentos anteriores, a salvo:** una tasa provincial suelta guardada antes se lee como la combinada, para que un borrador o una recurrencia vieja nunca cobre solo el GST.`,
            en: `## Two taxes on one line, without throwing off the total
A sale in Montreal carries 5% GST and 9.975% QST; in Vancouver, GST and 7% PST. Entering them as two separate rates meant the line only charged one. Cord stores one combined rate per line, computes it with the same engine as every other country, and splits it into its taxes when it's shown.

### What's included
- **Rates by province:** when you pick your business's province, the catalog is seeded with that province's combined rate as the default, plus GST alone and the HST of the harmonized provinces for selling into them. These are the CRA's rates in effect since April 1, 2025.
- **An exact breakdown:** federal GST is computed on the base and the provincial tax takes the rest, so the sum is exactly what was charged.
- **The right name:** QST in Quebec, RST in Manitoba and PST elsewhere; in French, TPS, TVQ and TVH.
- **On every surface:** the PDF, the quote and invoice links, printouts, detail views and the three editors show each tax separately.
- **Your QST number** is printed next to your GST/HST number.
- **Older documents stay safe:** a standalone provincial rate saved earlier is read as the combined rate, so an old draft or recurrence never charges GST alone.`
        },
        area: 'fiscal',
        status: 'live',
        api: false
    },
    {
        id: '29',
        slug: 'iva-por-documento-chile',
        title: {
            es: 'Chile: IVA calculado por documento',
            en: 'Chile: VAT calculated per document'
        },
        shortDesc: {
            es: 'En Chile el SII calcula el IVA sobre el neto total, no sumando líneas redondeadas. Cord calcula así en toda cuenta chilena: cotización, link público, factura, nota de crédito y PDF dan el mismo peso.',
            en: 'In Chile the SII calculates VAT on the net total, not by adding up rounded lines. Cord calculates it that way for every Chilean account: the quote, public link, invoice, credit note and PDF all agree to the peso.'
        },
        content: {
            es: `## Un peso de diferencia es una nota de crédito
El formato del documento tributario electrónico del SII define el IVA como el monto neto por la tasa, redondeado una sola vez. Con el IVA redondeado línea por línea, una factura de varias líneas en pesos descuadraba seguido: en pruebas con importes al azar, una de cada cuatro con dos líneas y casi la mitad con cinco. El SII no la rechaza, pero obliga a corregirla con una nota de crédito o de débito.

### Qué cambia
- **IVA del documento:** por tasa, el impuesto es el neto total por la tasa, redondeado a pesos una sola vez.
- **Reparto por línea sin perder un peso:** para mostrar el impuesto de cada línea, Cord reparte el del documento por mayor residuo; la suma por línea es exactamente el total.
- **Con precio con IVA incluido:** la base sale del total con IVA dividido entre 1.19, como indica el formato, y el IVA se calcula sobre esa base.
- **En toda la cuenta, no solo en la factura electrónica:** cotizaciones, editor, link público, aprobación parcial, factura, nota de crédito, factura desde la cotización y PDF usan la misma regla.
- **Lo que el cliente vio no cambia:** cada cotización guarda la regla con la que se calcularon sus totales, así que una cotización anterior conserva sus importes y una factura emitida nunca se recalcula.`,
            en: `## One peso off means a credit note
The SII's electronic tax document format defines VAT as the net amount times the rate, rounded once. With VAT rounded line by line, a multi-line invoice in pesos was often off: in tests with random amounts, one in four with two lines and nearly half with five. The SII doesn't reject it, but it requires correcting it with a credit or debit note.

### What changes
- **Document-level VAT:** per rate, the tax is the net total times the rate, rounded to pesos once.
- **Per-line split without losing a peso:** to show each line's tax, Cord splits the document's tax by largest remainder; the per-line amounts add up exactly to the total.
- **With VAT-inclusive prices:** the base comes from the VAT-inclusive total divided by 1.19, as the format specifies, and VAT is computed on that base.
- **Across the account, not just the e-invoice:** quotes, the editor, the public link, partial approval, invoices, credit notes, invoices created from quotes and the PDF all use the same rule.
- **What the customer saw doesn't change:** each quote stores the rule its totals were computed with, so an older quote keeps its amounts and an issued invoice is never recalculated.`
        },
        area: 'fiscal',
        status: 'live',
        api: false
    },
    {
        id: '30',
        slug: 'factura-electronica-europea',
        title: {
            es: 'Factura electrónica europea: Factur-X, XRechnung y Peppol',
            en: 'European e-invoicing: Factur-X, XRechnung and Peppol'
        },
        shortDesc: {
            es: 'La misma factura del PDF, escrita para el sistema contable de tu cliente según la norma EN 16931. Se descarga desde la factura o viaja adjunta en el correo, y no se genera si algo no cuadra al céntimo.',
            en: 'The same invoice as the PDF, written for your customer\'s accounting system under the EN 16931 standard. Download it from the invoice or send it attached to the email; it is never generated if anything is off by a cent.'
        },
        content: {
            es: `## Una factura que el sistema de tu cliente puede leer
Cada vez más clientes en Europa no quieren un PDF: quieren una factura que su sistema contable lea solo. Cord escribe la factura en los formatos de la norma europea EN 16931 a partir de los mismos datos congelados al emitir, sin recalcular un solo importe.

### Qué incluye
- **Tres formatos EN 16931:** Factur-X perfil EN 16931, un PDF/A-3 con el XML dentro que también vale como ZUGFeRD; XRechnung 3.0, en UBL o CII; y Peppol BIS Billing 3.0.
- **Descarga y correo:** el detalle de la factura lista los formatos disponibles y lo que falta para los demás, y el link del cliente ofrece los disponibles. En el correo, Factur-X sustituye al PDF y XRechnung se adjunta junto a él. Por defecto, Factur-X en Francia y XRechnung en Alemania.
- **Al céntimo o no sale:** los totales se comprueban contra el documento antes de generarlo. Una factura que no cuadra o a la que le falta un dato falla con el motivo y el lugar donde se corrige.
- **Exenciones con su causa:** cada concepto al 0 % lleva su categoría y su causa de exención, y el PDF cita el precepto.
- **Datos del comprador:** referencia del comprador, orden de compra, dirección electrónica y, para la administración pública alemana, el Leitweg-ID con su dígito de control, desde el editor y la API.
- **Verificado contra los validadores oficiales:** cada cambio pasa por los validadores de KoSIT para XRechnung, el schematron de la norma EN 16931, las reglas de Peppol y la validación PDF/A.

### Límites claros
Cord genera y adjunta; no transmite por la red Peppol. La excepción es Francia, donde la transmisión por plataforma autorizada está en beta. Una factura con retenciones no se puede representar en EN 16931; en España se entrega como Facturae.`,
            en: `## An invoice your customer's system can read
More and more customers in Europe don't want a PDF: they want an invoice their accounting system reads on its own. Cord writes the invoice in the formats of the European standard EN 16931 from the same data frozen at issue time, without recalculating a single amount.

### What's included
- **Three EN 16931 formats:** Factur-X EN 16931 profile, a PDF/A-3 with the XML inside that is also valid as ZUGFeRD; XRechnung 3.0, in UBL or CII; and Peppol BIS Billing 3.0.
- **Download and email:** the invoice detail lists the formats available and what's missing for the others, and the customer link offers the available ones. In the email, Factur-X replaces the PDF and XRechnung is attached alongside it. By default, Factur-X in France and XRechnung in Germany.
- **To the cent or not at all:** totals are checked against the document before it's generated. An invoice that doesn't add up or is missing a field fails with the reason and where to fix it.
- **Exemptions with their reason:** each 0% line carries its category and exemption reason, and the PDF cites the legal provision.
- **Buyer data:** buyer reference, purchase order, electronic address and, for the German public sector, the Leitweg-ID with its check digit, from the editor and the API.
- **Checked against the official validators:** every change runs through KoSIT's XRechnung validators, the EN 16931 schematron, the Peppol rules and PDF/A validation.

### Clear limits
Cord generates and attaches; it does not transmit over the Peppol network. The exception is France, where transmission through an approved platform is in beta. An invoice with withholdings can't be represented in EN 16931; in Spain it is delivered as Facturae.`
        },
        area: 'fiscal',
        status: 'live',
        api: false
    },
    {
        id: '31',
        slug: 'facturae-espana',
        title: {
            es: 'Facturae para España',
            en: 'Facturae for Spain'
        },
        shortDesc: {
            es: 'La factura española en Facturae 3.2.2, con el IRPF que la norma europea no admite y firma XAdES opcional con el certificado del negocio. Se genera sobre las facturas registradas con Verifactu, por eso está en beta.',
            en: 'The Spanish invoice in Facturae 3.2.2, with the IRPF withholding the European standard can\'t carry and optional XAdES signing with the business\'s certificate. It is generated on invoices registered with Verifactu, which is why it is in beta.'
        },
        content: {
            es: `## El formato español que sí declara el IRPF
Muchos profesionales en España facturan con retención de IRPF, y la norma europea EN 16931 no tiene dónde declararla. Facturae sí: es el formato de la administración española y una de las sintaxis que el Real Decreto 238/2026 admite para la factura electrónica entre empresarios.

### Qué incluye
- **Facturae 3.2.2** generada del mismo documento congelado que el PDF, en euros, con los totales comprobados al céntimo antes de entregarla.
- **IVA e IRPF:** el IVA con su tipo y el IRPF como impuesto retenido. Una retención que no sea de IRPF falla con su motivo.
- **Operaciones especiales:** exenta y no sujeta con la mención de su causa, inversión del sujeto pasivo con su literal legal, operación intracomunitaria con los NIF con prefijo de país, exportación y servicio a un cliente de fuera de la UE.
- **Rectificativas por diferencias,** con la factura original, igual que el registro de Verifactu.
- **Firma XAdES-EPES opcional** según la política de firma de Facturae v3.1, con el certificado que el negocio sube para Verifactu, y solo si activa la firma en Ajustes, porque es una firma en su nombre.
- **En el correo:** el negocio puede adjuntar la Facturae a cada factura, firmada o sin firmar.

### Por qué está en beta
Facturae solo se genera sobre una factura, no sobre una proforma, y en España el documento es una factura cuando la cuenta registra con Verifactu. Mientras la activación de Verifactu siga pendiente, el documento español es una proforma y no tiene versión Facturae.`,
            en: `## The Spanish format that does declare IRPF
Many professionals in Spain invoice with an IRPF withholding, and the European standard EN 16931 has nowhere to declare it. Facturae does: it is the Spanish administration's format and one of the syntaxes Royal Decree 238/2026 accepts for B2B e-invoicing.

### What's included
- **Facturae 3.2.2** generated from the same frozen document as the PDF, in euros, with totals checked to the cent before it's delivered.
- **VAT and IRPF:** VAT with its rate and IRPF as a withheld tax. A withholding other than IRPF fails with its reason.
- **Special operations:** exempt and not-subject operations with their legal mention, reverse charge with its legal wording, intra-EU operations with country-prefixed tax IDs, exports, and services to customers outside the EU.
- **Corrective invoices by differences,** referencing the original invoice, matching the Verifactu record.
- **Optional XAdES-EPES signature** under the Facturae v3.1 signature policy, with the certificate the business uploads for Verifactu, and only if signing is turned on in Settings, because it is a signature on the business's behalf.
- **In the email:** the business can attach the Facturae to every invoice, signed or unsigned.

### Why it is in beta
Facturae is only generated for an invoice, not a pro forma, and in Spain a document is an invoice once the account registers with Verifactu. While Verifactu activation is pending, a Spanish document is a pro forma and has no Facturae version.`
        },
        area: 'fiscal',
        status: 'beta',
        api: false
    },
    {
        id: '19',
        slug: 'verifactu-espana',
        title: {
            es: 'Verifactu en Cord Invoicing',
            en: 'Verifactu in Cord Invoicing'
        },
        shortDesc: {
            es: 'El carril español de Cord Invoicing: registros encadenados, QR de cotejo y envío a la AEAT, con corrección de incidencias desde la factura. Construido y en beta hasta completar su activación; obligatorio desde 2027.',
            en: 'The Spanish rail of Cord Invoicing: chained records, a verification QR and AEAT submission, with incidents fixed from the invoice. Built and in beta until activation is complete; mandatory from 2027.'
        },
        content: {
            es: `## Facturación verificable para España
Verifactu exige que cada factura genere un registro de alta, que ese registro conserve la huella del anterior y que la secuencia se remita a la AEAT. Cord construye esa cadena por organización: la huella SHA-256 se genera al emitir, el registro no se puede editar y una corrección nunca reescribe el pasado: crea un registro nuevo.

### Qué está construido
- **Cadena por organización, inalterable:** la base de datos bloquea cambios a la huella, el contenido, la secuencia y el tipo de un registro firmado.
- **Envío desacoplado y con reintentos:** emitir y remitir son pasos separados, así que una caída de la AEAT no impide facturar. El envío agrupa registros, respeta el tiempo de espera que pide la AEAT y conserva cada respuesta.
- **Incidencias que se corrigen desde la factura:** el detalle muestra el estado del último registro con el código y el motivo de la AEAT, y "Corregir y reenviar" crea la subsanación que corresponde sin cambiar importes.
- **Certificado por empresa:** cada negocio conecta su certificado electrónico, validado antes de guardarse cifrado.
- **QR de cotejo en el PDF:** al principio de la primera página, con el tamaño que pide la norma, y solo cuando la factura tiene un registro real.
- **Declaración responsable:** el propio sistema publica la declaración del productor con los mismos datos que viajan en cada registro.

### Por qué está en beta
El motor se verificó contra los vectores oficiales de la huella y contra el WSDL y los XSD de la AEAT. Falta el trámite: configurar la identidad del sistema, firmar la declaración responsable y completar un envío en el portal de pruebas de la AEAT con el certificado de un contribuyente español. Hasta entonces, el documento de una cuenta española es una proforma, y Cord no muestra un QR, una huella ni un estado de envío que no existan.

### Fechas de la obligación
Según el Real Decreto-ley 15/2025, publicado en el BOE, Verifactu es obligatorio desde el 1 de enero de 2027 para los contribuyentes del Impuesto sobre Sociedades y desde el 1 de julio de 2027 para el resto. Son fechas de la norma, no fechas de entrega de Cord.`,
            en: `## Verifiable invoicing for Spain
Verifactu requires every invoice to create a registration record, each record to keep the previous record's fingerprint, and the sequence to be submitted to the AEAT. Cord builds that chain per organization: the SHA-256 fingerprint is generated at issue time, the record can't be edited, and a correction never rewrites the past: it creates a new record.

### What is built
- **A tamper-proof chain per organization:** the database blocks changes to the fingerprint, content, sequence and type of a signed record.
- **Decoupled submission with retries:** issuing and submitting are separate steps, so an AEAT outage never stops you from invoicing. Submission batches records, honors the wait time the AEAT asks for and keeps every response.
- **Incidents fixed from the invoice:** the detail view shows the last record's status with the AEAT's code and reason, and "Correct and resend" creates the right correction record without changing amounts.
- **A certificate per company:** each business connects its electronic certificate, validated before it's stored encrypted.
- **Verification QR on the PDF:** at the top of the first page, at the size the regulation requires, and only when the invoice has a real record.
- **Responsible statement:** the system itself publishes the producer's statement with the same data that travels in every record.

### Why it is in beta
The engine was verified against the official fingerprint vectors and the AEAT's WSDL and XSD. The paperwork remains: configuring the system's identity, signing the responsible statement and completing a submission on the AEAT test portal with a Spanish taxpayer's certificate. Until then, a Spanish account's document is a pro forma, and Cord shows no QR, fingerprint or submission status that doesn't exist.

### Obligation dates
Under Royal Decree-law 15/2025, published in the BOE, Verifactu is mandatory from January 1, 2027 for corporate income tax payers and from July 1, 2027 for everyone else. These are the regulation's dates, not Cord delivery dates.`
        },
        area: 'fiscal',
        status: 'beta',
        api: false
    },
    {
        id: '32',
        slug: 'factura-electronica-francia',
        title: {
            es: 'Francia: emisión por plataforma autorizada',
            en: 'France: issuing through an approved platform'
        },
        shortDesc: {
            es: 'Las facturas entre empresas francesas viajan como Factur-X por una plataforma autorizada, las ventas a particulares y al extranjero se declaran en el e-reporting y los cobros se comunican cuando la TVA es exigible al cobro. Construido y en beta.',
            en: 'Invoices between French businesses travel as Factur-X through an approved platform, sales to consumers and abroad are declared through e-reporting, and payments are reported when VAT is due on receipt. Built and in beta.'
        },
        content: {
            es: `## La reforma francesa, del lado de quien emite
Desde el 1 de septiembre de 2026 toda empresa establecida en Francia debe poder recibir facturas electrónicas, y las grandes empresas y las de tamaño intermedio (ETI) además emiten y declaran por una plataforma autorizada. Las PYME y las microempresas emiten y declaran desde el 1 de septiembre de 2027. Son las fechas que fija la DGFiP para la obligación, no fechas de entrega de Cord.

### Qué está construido
- **Facturas entre empresas francesas:** el Factur-X de la factura se transmite por la plataforma, y Cord muestra cada estado del ciclo de vida, del 200 al 213, con su fecha y su motivo.
- **E-reporting:** las ventas a empresas de fuera de Francia se declaran factura por factura, y las ventas a particulares, agregadas por día, divisa y categoría, en los plazos de tu régimen de TVA.
- **Cobros:** cuando la TVA es exigible al cobro, cada pago se comunica como "Encaissée" o en el e-reporting de pagos, repartido por tasa.
- **Las menciones de la reforma en toda factura francesa,** con o sin plataforma: categoría de la operación (bienes, servicios o mixta), opción por el pago de la TVA según los débitos, SIREN del cliente y dirección de entrega.
- **Alta del negocio desde Ajustes:** el negocio verifica su identidad y firma su mandato en la plataforma con un enlace que genera Cord.
- **Rechazos con instrucciones:** una factura rechazada por el cliente o por una plataforma muestra lo que pide la DGFiP: una anulación contable y una factura nueva.

### Por qué está en beta
Todo lo anterior se comprueba contra las reglas de validación de la norma francesa y la especificación publicada del operador. Falta el contrato de producción con la plataforma y la prueba de punta a punta con una organización francesa; hasta entonces la pantalla dice "Próximamente" y no se transmite nada.`,
            en: `## The French reform, from the issuer's side
From September 1, 2026 every business established in France must be able to receive electronic invoices, and large and mid-sized companies (ETI) must also issue and report through an approved platform. SMEs and micro-businesses issue and report from September 1, 2027. These are the dates the DGFiP sets for the obligation, not Cord delivery dates.

### What is built
- **Invoices between French businesses:** the invoice's Factur-X is transmitted through the platform, and Cord shows every lifecycle status, from 200 to 213, with its date and reason.
- **E-reporting:** sales to businesses outside France are reported invoice by invoice, and sales to consumers are aggregated by day, currency and category, on the deadlines of your VAT regime.
- **Payments:** when VAT is due on receipt, each payment is reported as "Encaissée" or in the payments e-reporting, split by rate.
- **The reform's mentions on every French invoice,** with or without the platform: operation category (goods, services or mixed), the option to pay VAT on debits, the customer's SIREN and the delivery address.
- **Business onboarding from Settings:** the business verifies its identity and signs its mandate on the platform through a link Cord generates.
- **Rejections with instructions:** an invoice rejected by the customer or by a platform shows what the DGFiP requires: an accounting cancellation and a new invoice.

### Why it is in beta
All of the above is checked against the French standard's validation rules and the operator's published specification. The production contract with the platform and the end-to-end test with a French organization remain; until then the screen says "Coming soon" and nothing is transmitted.`
        },
        area: 'fiscal',
        status: 'beta',
        api: false
    },
    {
        id: '33',
        slug: 'arca-argentina',
        title: {
            es: 'Argentina: factura electrónica ante ARCA',
            en: 'Argentina: e-invoicing with ARCA'
        },
        shortDesc: {
            es: 'Facturas A, B y C y notas de crédito con CAE pedido directamente a ARCA, con el certificado de cada negocio, su QR y las leyendas obligatorias. Construido y en beta: se enciende tras la prueba con un contribuyente real.',
            en: 'Type A, B and C invoices and credit notes with a CAE requested directly from ARCA, using each business\'s certificate, with its QR and mandatory legends. Built and in beta: it is switched on after testing with a real taxpayer.'
        },
        content: {
            es: `## El CAE, sin intermediarios
Cord se conecta directamente con los servicios web de ARCA: se autentica con el certificado del negocio, pide el CAE de cada comprobante y guarda la respuesta de ARCA como la fuente de verdad. No hay un proveedor intermedio entre tu factura y la autoridad.

### Qué cubre
- **Clase A, B o C** según tu condición frente al IVA y la de tu cliente, con la tabla de la RG 5616/2024. Monotributo y exento emiten C.
- **Receptor** con CUIT, DNI o consumidor final sin identificar, este último solo en B y C y por debajo del tope de la RG 5700/2025.
- **IVA por alícuota, descuentos y servicios:** el descuento de documento viaja neto y cuadra con la factura; los servicios llevan su período y su vencimiento.
- **Moneda extranjera:** con la cotización congelada del documento si tu contabilidad va en pesos, o con la oficial de ARCA; sin cotización, no se envía.
- **Nota de crédito** asociada a la factura que ajusta. Un comprobante con CAE no se anula: se compensa con nota de crédito.
- **Nada se duplica:** si la respuesta se pierde, Cord consulta a ARCA antes de volver a pedir y conserva el mismo número.
- **Impresión** con letra, código, CAE y su vencimiento, QR de la RG 4892/2020 y las leyendas de consumidor final y de transparencia fiscal.

### Por qué está en beta
Los pedidos se validan contra los esquemas oficiales de ARCA y se probaron contra sus servidores de homologación, pero falta la primera emisión real con el certificado de un contribuyente. Se enciende para Argentina después de esa prueba, y cada negocio la activa con su punto de venta de web services y su certificado.`,
            en: `## The CAE, with no middleman
Cord connects directly to ARCA's web services: it authenticates with the business's certificate, requests the CAE for each document and keeps ARCA's response as the source of truth. There is no intermediary between your invoice and the authority.

### What it covers
- **Type A, B or C** based on your VAT status and your customer's, following RG 5616/2024. Monotributo and exempt businesses issue type C.
- **Recipients** with CUIT, DNI or as an unidentified final consumer, the latter only on B and C and below the RG 5700/2025 threshold.
- **VAT by rate, discounts and services:** the document discount travels net and matches the invoice; services carry their period and due date.
- **Foreign currency:** with the document's frozen exchange rate if your books are in pesos, or ARCA's official rate; without a rate, nothing is sent.
- **Credit notes** linked to the invoice they adjust. A document with a CAE isn't voided: it is offset with a credit note.
- **Nothing is duplicated:** if a response is lost, Cord queries ARCA before asking again and keeps the same number.
- **Printout** with the letter, code, CAE and its expiry, the RG 4892/2020 QR, and the final-consumer and tax-transparency legends.

### Why it is in beta
Requests are validated against ARCA's official schemas and were tested against its homologation servers, but the first real issuance with a taxpayer's certificate is still pending. It is switched on for Argentina after that test, and each business activates it with its web services point of sale and its certificate.`
        },
        area: 'fiscal',
        status: 'beta',
        api: false
    },
    {
        id: '34',
        slug: 'factura-electronica-brasil',
        title: {
            es: 'Brasil: NFS-e y NF-e',
            en: 'Brazil: NFS-e and NF-e'
        },
        shortDesc: {
            es: 'Servicios con la NFS-e de Padrão Nacional y mercancías con la NF-e modelo 55 ante la SEFAZ de tu estado, con el certificado A1 del negocio y sin agregador. Cord elige el documento según los conceptos. Construido y en beta.',
            en: 'Services with the national-standard NFS-e and goods with the model 55 NF-e before your state\'s SEFAZ, using the business\'s A1 certificate and no aggregator. Cord picks the document from the line items. Built and in beta.'
        },
        content: {
            es: `## Dos documentos, un solo flujo
En Brasil los servicios y las mercancías se facturan con documentos distintos ante autoridades distintas: la NFS-e, del sistema nacional, y la NF-e, de la SEFAZ de cada estado. Cord decide por los conceptos: todo servicios va a la NFS-e, todo productos con sus datos fiscales va a la NF-e, y una mezcla se detiene y explica que son dos documentos.

### NFS-e de Padrão Nacional (servicios)
- Emisión directa ante el sistema nacional de la NFS-e con el certificado ICP-Brasil A1 del negocio.
- Serie y número propios del negocio, un servicio de la lista nacional por nota, ISS dentro del precio y la retención del ISS por el tomador cuando corresponde.
- Simples Nacional con su porcentaje aproximado de tributos, y el descuento como desconto incondicionado.
- Cancelación por evento, consultada antes para no duplicarla. La NFS-e no tiene nota de crédito: se cancela y se emite de nuevo.

### NF-e modelo 55 (mercancías)
- Autorización síncrona ante la SEFAZ autorizadora de tu estado, con contingencia automática en la SVC cuando la SEFAZ no recibe el pedido.
- Simples Nacional y MEI dentro del estado y hacia otros; Régimen Normal con ICMS propio dentro del estado, IPI, PIS/COFINS e IBS/CBS, obligatorio para ese régimen desde el 3 de agosto de 2026.
- Cancelación dentro de las 24 horas, Carta de Correção, inutilização de números y DANFE.
- Numeración sin huecos: un número que nunca salió se reutiliza, y uno que ya tiene otro documento se consulta antes de saltarlo.

### Por qué está en beta
Cada documento se valida contra los esquemas y las tablas oficiales, pero la autoridad exige un certificado de cliente incluso para consultar: falta la primera emisión real con el certificado de un contribuyente. Además, los estados de AM, MS, PE, PR, SC y TO exigen datos del responsable técnico del software que Cord todavía no tiene, y quedan fuera hasta entonces.`,
            en: `## Two documents, one flow
In Brazil, services and goods are invoiced with different documents before different authorities: the NFS-e, from the national system, and the NF-e, from each state's SEFAZ. Cord decides from the line items: all services go to the NFS-e, all products with their tax data go to the NF-e, and a mix stops and explains that these are two documents.

### National-standard NFS-e (services)
- Issued directly with the national NFS-e system using the business's ICP-Brasil A1 certificate.
- The business's own series and number, one service from the national list per note, ISS included in the price, and ISS withheld by the buyer where applicable.
- Simples Nacional with its approximate tax percentage, and discounts as unconditional discounts.
- Cancellation by event, checked first so it's never duplicated. The NFS-e has no credit note: it is canceled and issued again.

### Model 55 NF-e (goods)
- Synchronous authorization with your state's authorizing SEFAZ, with automatic contingency on the SVC when the SEFAZ doesn't receive the request.
- Simples Nacional and MEI within the state and to other states; Regular Regime with in-state ICMS, IPI, PIS/COFINS and IBS/CBS, mandatory for that regime since August 3, 2026.
- Cancellation within 24 hours, Carta de Correção, number inutilização and the DANFE.
- Gap-free numbering: a number that never went out is reused, and one already held by another document is checked before moving on.

### Why it is in beta
Every document is validated against the official schemas and tables, but the authority requires a client certificate even to query: the first real issuance with a taxpayer's certificate is still pending. In addition, the states of AM, MS, PE, PR, SC and TO require technical-responsible data for the software that Cord doesn't have yet, and stay out until then.`
        },
        area: 'fiscal',
        status: 'beta',
        api: false
    },
    {
        id: '35',
        slug: 'sii-chile',
        title: {
            es: 'Chile: documentos tributarios electrónicos ante el SII',
            en: 'Chile: electronic tax documents with the SII'
        },
        shortDesc: {
            es: 'Factura afecta y exenta, notas de crédito y débito, enviadas directo al SII con los folios y el certificado del negocio, timbre electrónico y copia cedible. Incluye el set de pruebas y el intercambio de la certificación. Construido y en beta.',
            en: 'Taxable and exempt invoices, credit and debit notes, sent directly to the SII with the business\'s folios and certificate, electronic stamp and assignable copy. Includes the certification test set and exchange. Built and in beta.'
        },
        content: {
            es: `## Del folio al veredicto del SII
Cord toma el folio, timbra, firma, sube el documento al SII y consulta su veredicto, sin un proveedor de por medio. El negocio sube sus archivos de folios (CAF) y su certificado; Cord se encarga de que un folio usado no se vuelva a usar nunca.

### Qué cubre
- **Factura electrónica (33), factura exenta (34), nota de débito (56) y nota de crédito (61).**
- **Folios bajo control:** cada CAF se valida contra el RUT del negocio y se guarda cifrado; Cord avisa cuando quedan pocos o están por vencer.
- **Timbre electrónico y copia cedible:** el PDF lleva el recuadro del SII, el timbre PDF417 y, en las facturas, la copia cedible con el acuse de recibo de la Ley 19.983. Se revisó contra el manual de muestras impresas del SII.
- **IVA por documento,** como lo define el formato del SII, en toda la cuenta.
- **Veredicto sin duplicados:** si el SII no responde en el momento, Cord guarda el número de envío y consulta después; solo reenvía el mismo archivo cuando el SII dijo que no lo recibió.
- **Certificación ante el SII desde Ajustes:** set de pruebas con sus libros de ventas y compras, simulación, intercambio de información y muestras impresas.
- **Intercambio con proveedores:** una casilla propia recibe los documentos que te emiten, los valida, responde al emisor y registra la aceptación o el reclamo ante el SII dentro de sus 8 días.

### Por qué está en beta
Se reproducen los ejemplos oficiales del SII y cada envío se valida contra sus esquemas, pero falta obtener un token y subir un documento con un certificado registrado ante el SII y un CAF real. Cada negocio, además, debe completar su certificación como emisor ante el SII.`,
            en: `## From folio to the SII's verdict
Cord takes the folio, stamps, signs, uploads the document to the SII and checks its verdict, with no provider in between. The business uploads its folio files (CAF) and its certificate; Cord makes sure a used folio is never used again.

### What it covers
- **Electronic invoice (33), exempt invoice (34), debit note (56) and credit note (61).**
- **Folios under control:** each CAF is validated against the business's RUT and stored encrypted; Cord warns when few are left or they're about to expire.
- **Electronic stamp and assignable copy:** the PDF carries the SII box, the PDF417 stamp and, on invoices, the assignable copy with the Law 19.983 receipt acknowledgment. It was reviewed against the SII's printed samples manual.
- **Document-level VAT,** as the SII format defines it, across the account.
- **A verdict without duplicates:** if the SII doesn't answer right away, Cord keeps the submission number and checks later; it only resends the same file when the SII said it never received it.
- **SII certification from Settings:** the test set with its sales and purchase ledgers, simulation, information exchange and printed samples.
- **Exchange with suppliers:** a dedicated mailbox receives the documents issued to you, validates them, replies to the issuer and records acceptance or a claim with the SII within its 8 days.

### Why it is in beta
The SII's official examples are reproduced and every submission is validated against its schemas, but getting a token and uploading a document with a certificate registered with the SII and a real CAF is still pending. Each business must also complete its certification as an issuer with the SII.`
        },
        area: 'fiscal',
        status: 'beta',
        api: false
    },
    {
        id: '36',
        slug: 'dian-colombia',
        title: {
            es: 'Colombia: factura electrónica de venta ante la DIAN',
            en: 'Colombia: electronic sales invoice with the DIAN'
        },
        shortDesc: {
            es: 'Factura de venta con validación previa, notas crédito y débito, CUFE y QR, firmada con el certificado del negocio y enviada como software propio, sin proveedor tecnológico. Incluye el set de pruebas de la habilitación. Construido y en beta.',
            en: 'Sales invoices with prior validation, credit and debit notes, CUFE and QR, signed with the business\'s certificate and sent as in-house software, with no technology provider. Includes the enablement test set. Built and in beta.'
        },
        content: {
            es: `## Validación previa, como software propio
Cord se registra ante la DIAN como el software propio de cada facturador: no es un proveedor tecnológico ni usa uno. Arma el documento según el Anexo Técnico 1.9 de la Resolución 000165 de 2023, lo firma con el certificado del negocio y recibe la validación de la DIAN en la misma llamada.

### Qué cubre
- **Factura de venta, nota crédito y nota débito,** con su CUFE o CUDE y el QR de consulta.
- **Numeración dentro de tu resolución:** Cord avisa cuando quedan pocos números o la vigencia está por terminar, y nunca envía fuera del rango.
- **Adquiriente:** consumidor final, NIT con dígito verificador, cédula u otro documento de persona, y clientes del exterior.
- **IVA por línea** al 19, 16, 5 o 0 %, con las líneas al 0 % como exentas o excluidas según decida el negocio.
- **Retenciones** de ReteIVA y ReteRenta cuando el tributo es inequívoco.
- **Otra moneda** con la tasa a pesos congelada del documento.
- **Entrega completa:** el contenedor firmado con el documento y la respuesta de la DIAN viaja en el correo junto con el PDF, en un solo archivo.
- **Habilitación desde Ajustes:** el negocio envía el set de pruebas de la DIAN y consulta su resultado sin salir de Cord.

### Por qué está en beta
Se reproducen los CUFE oficiales del Anexo y cada documento se valida contra los esquemas de la DIAN, pero el ambiente de habilitación no evalúa una firma sin un certificado avalado: falta la primera validación real con el certificado de un facturador.`,
            en: `## Prior validation, as in-house software
Cord is registered with the DIAN as each issuer's own software: it is not a technology provider and doesn't use one. It builds the document per Technical Annex 1.9 of Resolution 000165 of 2023, signs it with the business's certificate and receives the DIAN's validation in the same call.

### What it covers
- **Sales invoice, credit note and debit note,** with their CUFE or CUDE and the lookup QR.
- **Numbering within your resolution:** Cord warns when few numbers are left or the validity is about to end, and never sends outside the range.
- **Buyers:** final consumer, NIT with check digit, national ID or another personal document, and customers abroad.
- **VAT per line** at 19, 16, 5 or 0%, with 0% lines treated as exempt or excluded as the business decides.
- **Withholdings** for ReteIVA and ReteRenta when the tax is unambiguous.
- **Other currencies** with the document's frozen rate to pesos.
- **Complete delivery:** the signed container with the document and the DIAN's response travels in the email together with the PDF, in a single file.
- **Enablement from Settings:** the business sends the DIAN test set and checks its result without leaving Cord.

### Why it is in beta
The Annex's official CUFEs are reproduced and every document is validated against the DIAN's schemas, but the enablement environment doesn't evaluate a signature without an accredited certificate: the first real validation with an issuer's certificate is still pending.`
        },
        area: 'fiscal',
        status: 'beta',
        api: false
    },
    {
        id: '37',
        slug: 'sunat-peru',
        title: {
            es: 'Perú: factura electrónica ante la SUNAT',
            en: 'Peru: e-invoicing with SUNAT'
        },
        shortDesc: {
            es: 'Factura y nota de crédito enviadas directo a SUNAT desde el sistema del contribuyente, firmadas con el certificado del negocio, con forma de pago, retención del IGV y QR. Construido y en beta.',
            en: 'Invoices and credit notes sent directly to SUNAT under the taxpayer\'s own issuing system, signed with the business\'s certificate, with payment terms, IGV withholding and QR. Built and in beta.'
        },
        content: {
            es: `## Directo a SUNAT, sin OSE ni PSE
En el sistema de emisión del contribuyente, el negocio envía cada comprobante a SUNAT con su propio certificado y un usuario SOL secundario. Cord arma el comprobante, lo firma y guarda la constancia de recepción (CDR) que responde SUNAT.

### Qué cubre
- **Factura (01) y nota de crédito (07)** con serie propia del negocio, que continúa la numeración que ya traía.
- **Clientes con RUC** y su dígito verificador, y **exportación** de bienes o servicios a clientes del exterior.
- **IGV por concepto:** 18 % gravado; exonerado o inafecto según lo indica el negocio; y la tasa del régimen MYPE de restaurantes y hoteles cuando corresponde.
- **Forma de pago:** contado, o crédito con su cuota y vencimiento, descontando lo ya cobrado.
- **Retención del IGV** cuando el cliente es agente de retención y la venta al crédito supera el monto de la norma.
- **Rechazos claros:** Cord distingue un rechazo que consume el número de una excepción que no lo consume, y si la respuesta se pierde, consulta antes de volver a enviar.
- **Impresión y XML:** representación impresa con el valor resumen y el QR, y el XML aceptado para descargar desde la factura y desde el link del cliente.

### Por qué está en beta
Se probó contra el servicio beta de SUNAT con respuestas reales de aceptación y de rechazo, pero falta el envío a producción con el certificado y el usuario SOL de un contribuyente. Cada negocio debe afiliarse como emisor desde sus sistemas en SUNAT Operaciones en Línea.`,
            en: `## Straight to SUNAT, with no OSE or PSE
Under the taxpayer's own issuing system, the business sends each document to SUNAT with its own certificate and a secondary SOL user. Cord builds the document, signs it and keeps the receipt (CDR) SUNAT returns.

### What it covers
- **Invoice (01) and credit note (07)** with the business's own series, continuing the numbering it already had.
- **Customers with a RUC** and its check digit, and **exports** of goods or services to customers abroad.
- **IGV per line:** 18% taxable; exonerated or unaffected as the business indicates; and the MYPE restaurant and hotel rate where applicable.
- **Payment terms:** cash, or credit with its installment and due date, net of what was already collected.
- **IGV withholding** when the customer is a withholding agent and the credit sale exceeds the regulatory amount.
- **Clear rejections:** Cord tells a rejection that uses up the number from an exception that doesn't, and if a response is lost, it queries before sending again.
- **Printout and XML:** printed representation with the digest value and the QR, and the accepted XML to download from the invoice and from the customer link.

### Why it is in beta
It was tested against SUNAT's beta service with real acceptance and rejection responses, but submitting to production with a taxpayer's certificate and SOL user is still pending. Each business must enroll as an issuer from its own systems in SUNAT Operaciones en Línea.`
        },
        area: 'fiscal',
        status: 'beta',
        api: false
    },
    {
        id: '38',
        slug: 'sales-tax-estados-unidos',
        title: {
            es: 'Estados Unidos: sales tax por la dirección del cliente',
            en: 'United States: sales tax by customer address'
        },
        shortDesc: {
            es: 'La tasa combinada de estado, condado, ciudad y distritos especiales, calculada para la dirección de cada cliente en los estados donde tu negocio recauda, con desglose por jurisdicción en cada documento y su propia cuota mensual por plan. Construido y en beta.',
            en: 'The combined state, county, city and special district rate, calculated for each customer\'s address in the states where your business collects, with a breakdown by jurisdiction on every document and its own monthly allowance per plan. Built and in beta.'
        },
        content: {
            es: `## La tasa real de cada dirección, no la mínima del estado
El catálogo de arranque de Estados Unidos trae la tasa estatal, pero un negocio en Los Ángeles cobra cerca de 9.5 %, no 7.25 %: se suman condado, ciudad y distritos especiales. Con esta preferencia, la tasa de cada línea sale de un cálculo real por la dirección del cliente, hecho sobre la cuenta de cobros del propio negocio y con sus registros ante cada estado.

### Qué incluye
- **Configuración en Ajustes › Impuestos:** domicilio del negocio, qué vende (servicios, bienes físicos, software como servicio para empresas o servicios digitales) y los estados donde recauda.
- **Desglose por jurisdicción** en el PDF, los links de cotización y factura, la impresión y los editores, por ejemplo "California 6%" y "Los Angeles County 0.25%".
- **Un 0 % que se explica:** "Sin obligación de recaudar sales tax en Texas" o "Cliente exento" con su certificado, en vez de una línea en cero sin contexto.
- **Al centavo con el documento:** la tasa guardada reproduce exactamente el impuesto calculado, y la venta se registra con la misma cifra que el documento cobra.
- **Cada venta registrada una sola vez:** al emitir la factura o al cobrarse la cotización; anular una factura revierte la venta.
- **Falla cerrado:** sin una dirección suficiente, con un certificado de exención vencido o sin respuesta del servicio de cálculo, el documento no se guarda y el editor dice por qué.
- **Su propia cuota:** disponible desde Starter, con un número de ventas registradas incluidas al mes según el plan, aparte de la cuota de facturas con validez fiscal.

### Por qué está en beta
El cálculo y el registro están cubiertos con pruebas contra un servicio simulado, pero falta probarlos con llaves reales en una cuenta de Estados Unidos. Además, el excedente sobre la cuota todavía no se cobra, así que lo incluido funciona como tope: al llegar a él, la tasa se captura a mano hasta el mes siguiente o hasta mejorar el plan.`,
            en: `## The real rate for each address, not the state minimum
The US starter catalog carries the state rate, but a business in Los Angeles charges around 9.5%, not 7.25%: county, city and special districts add up. With this preference, each line's rate comes from a real calculation for the customer's address, done on the business's own payment account and with its own state registrations.

### What's included
- **Setup in Settings › Taxes:** business address, what you sell (services, physical goods, business software as a service or digital services) and the states where you collect.
- **Breakdown by jurisdiction** on the PDF, the quote and invoice links, printouts and editors, for example "California 6%" and "Los Angeles County 0.25%".
- **A 0% that explains itself:** "No obligation to collect sales tax in Texas" or "Exempt customer" with its certificate, instead of a bare zero.
- **To the cent with the document:** the stored rate reproduces exactly the calculated tax, and the sale is recorded with the same figure the document charges.
- **Each sale recorded once:** when the invoice is issued or the quote is paid; voiding an invoice reverses the sale.
- **Fails closed:** without a usable address, with an expired exemption certificate or without a response from the calculation service, the document isn't saved and the editor says why.
- **Its own allowance:** available from Starter, with a number of recorded sales included each month by plan, separate from the tax-compliant invoice allowance.

### Why it is in beta
Calculation and recording are covered by tests against a simulated service, but testing them with live keys on a US account is still pending. Also, overage beyond the allowance isn't billed yet, so the included amount works as a cap: once it's reached, rates are entered by hand until the next month or a plan upgrade.`
        },
        area: 'fiscal',
        status: 'beta',
        api: false
    },
    {
        id: '39',
        slug: 'factura-b2b-espana',
        title: {
            es: 'España: factura electrónica entre empresarios',
            en: 'Spain: e-invoicing between businesses'
        },
        shortDesc: {
            es: 'Envío de la factura a la solución pública de la AEAT y comunicación de su cobro, obligatorio desde el 6 de octubre de 2027 para quien factura más de 8 millones de euros. Construido; espera la especificación técnica de la AEAT.',
            en: 'Sending invoices to the AEAT\'s public solution and reporting their payment, mandatory from October 6, 2027 for businesses invoicing over 8 million euros. Built; waiting for the AEAT\'s technical specification.'
        },
        content: {
            es: `## La obligación y su calendario
La Ley 18/2022, de creación y crecimiento de empresas, obliga a los empresarios y profesionales de España a emitir, remitir y recibir factura electrónica entre ellos, e informar de su estado de pago. El Real Decreto 238/2026 y la Orden HAC/1028/2026, publicados en el BOE, fijan las fechas:

- **6 de octubre de 2027:** empresarios con un volumen de operaciones superior a 8 millones de euros.
- **6 de octubre de 2028:** el resto.
- **6 de octubre de 2029:** los estados de pago de personas físicas y entidades en atribución de rentas de hasta 8 millones, voluntarios hasta entonces.

Son las fechas de la obligación, no fechas de entrega de Cord.

### Qué está construido
- **La factura del Anexo I** de la Orden, en UBL, desde el mismo documento congelado que el PDF, con la clave de régimen por línea y el QR de Verifactu cuando lo hay.
- **Estados del emisor:** el cobro se deriva de los pagos reales ya conciliados (cobrada, cobro anulado, impagada), sin pagos parciales, que la norma no contempla para el emisor.
- **Una cola que consulta antes de reenviar,** con la baja de la factura al anularla y los estados que comunique el cliente.
- **Pantallas honestas:** el detalle de la factura y Ajustes muestran las fechas y si la factura ya tiene lo que pide la AEAT.

### Qué lo bloquea
La AEAT no ha publicado la especificación técnica del servicio: el WSDL, sus extensiones, las reglas de validación, los ejemplos, el catálogo de errores ni el entorno de pruebas. El riel dice "Próximamente" y no envía nada hasta que Cord pueda probarlo contra lo publicado.`,
            en: `## The obligation and its timeline
Law 18/2022 on business creation and growth requires businesses and professionals in Spain to issue, send and receive electronic invoices between themselves, and to report their payment status. Royal Decree 238/2026 and Order HAC/1028/2026, published in the BOE, set the dates:

- **October 6, 2027:** businesses with turnover above 8 million euros.
- **October 6, 2028:** everyone else.
- **October 6, 2029:** payment statuses for individuals and pass-through entities up to 8 million, voluntary until then.

These are the obligation's dates, not Cord delivery dates.

### What is built
- **The Annex I invoice** of the Order, in UBL, from the same frozen document as the PDF, with the regime key per line and the Verifactu QR when there is one.
- **Issuer statuses:** payment is derived from real, reconciled payments (paid, payment canceled, unpaid), without partial payments, which the regulation doesn't provide for the issuer.
- **A queue that queries before resending,** with the invoice withdrawn when it's voided and the statuses the customer reports.
- **Honest screens:** the invoice detail and Settings show the dates and whether the invoice already has what the AEAT requires.

### What blocks it
The AEAT has not published the service's technical specification: the WSDL, its extensions, the validation rules, examples, the error catalog or the test environment. The rail says "Coming soon" and sends nothing until Cord can test it against what is published.`
        },
        area: 'fiscal',
        status: 'next',
        api: false
    },
    {
        id: '40',
        slug: 'peppol-reino-unido',
        title: {
            es: 'Reino Unido: factura electrónica por Peppol',
            en: 'United Kingdom: e-invoicing over Peppol'
        },
        shortDesc: {
            es: 'HMRC exigirá factura electrónica en toda factura con IVA desde abril de 2029, con Peppol como red de intercambio. Hoy Cord genera Peppol solo para emisores de la Unión Europea.',
            en: 'HMRC will require e-invoicing for every VAT invoice from April 2029, with Peppol as the exchange network. Today Cord generates Peppol only for issuers established in the European Union.'
        },
        content: {
            es: `## Lo que anunció HMRC
HMRC confirmó que la factura electrónica será obligatoria para todas las facturas con IVA a partir de abril de 2029, y el gobierno británico indicó que Peppol será la red central de interoperabilidad. El modelo es descentralizado: las facturas viajan entre empresas por la red, no por una plataforma de validación del gobierno. Los hitos de implementación se publicarán en una hoja de ruta de HMRC y el Department for Business and Trade.

Es la fecha de la obligación anunciada, no una fecha de entrega de Cord.

### Lo que Cord ya tiene
- **Peppol BIS Billing 3.0,** validado contra las reglas oficiales, hoy para emisores establecidos en la Unión Europea.
- **El VAT number británico** validado con la verificación de HMRC, y el vocabulario fiscal del Reino Unido en cada documento.

### Qué lo bloquea
Las especificaciones técnicas y el calendario por fases del Reino Unido no están publicados. Además, la obligación exige enviar por la red Peppol, y hoy Cord genera y adjunta la factura electrónica, no la transmite por un punto de acceso. Hacen falta las dos piezas antes de ofrecerlo.`,
            en: `## What HMRC announced
HMRC has confirmed that e-invoicing will be mandatory for all VAT invoices from April 2029, and the UK government has said Peppol will be the core interoperability network. The model is decentralized: invoices travel between businesses over the network, not through a government clearance platform. The implementation milestones will be set out in a roadmap from HMRC and the Department for Business and Trade.

That is the date of the announced obligation, not a Cord delivery date.

### What Cord already has
- **Peppol BIS Billing 3.0,** validated against the official rules, today for issuers established in the European Union.
- **The UK VAT number** validated with HMRC's check, and UK tax vocabulary on every document.

### What blocks it
The UK's technical specifications and phasing are not yet published. The obligation also requires sending over the Peppol network, and today Cord generates and attaches e-invoices rather than transmitting them through an access point. Both pieces are needed before offering it.`
        },
        area: 'fiscal',
        status: 'next',
        api: false
    },
    {
        id: '41',
        slug: 'boleta-peru',
        title: {
            es: 'Perú: boleta de venta y resumen diario',
            en: 'Peru: sales receipts and daily summary'
        },
        shortDesc: {
            es: 'La boleta para clientes sin RUC, que SUNAT recibe en un resumen diario con respuesta diferida, más la nota de débito, las detracciones, las percepciones y la guía de remisión. Hoy Cord las rechaza antes de enviar.',
            en: 'The sales receipt for customers without a RUC, which SUNAT receives in a daily summary with a deferred response, plus debit notes, detracciones, perceptions and the remission guide. Today Cord rejects these before sending.'
        },
        content: {
            es: `## Qué falta en Perú
La factura electrónica de Perú está construida y en beta. Lo que sigue cubre las ventas y los ajustes que esa primera versión rechaza antes de enviar, con un mensaje que lo dice.

### Lo que viene
- **Boleta de venta (03):** la que recibe un cliente sin RUC. Se informa a SUNAT en un resumen diario que se procesa de forma asíncrona y devuelve un ticket que hay que consultar.
- **Nota de débito.**
- **Detracciones (SPOT) y percepciones:** hoy, declararlas en Ajustes deja el riel sin activar, para no emitir a medias.
- **Varias cuotas por factura, anticipos y operaciones gratuitas.**
- **Guía de remisión.**

### Qué lo bloquea
Es trabajo de Cord, no de la autoridad: la boleta necesita un segundo flujo de envío asíncrono con su consulta de ticket, y cada caso se valida contra el servicio beta de SUNAT antes de ofrecerlo.`,
            en: `## What's left in Peru
E-invoicing for Peru is built and in beta. What comes next covers the sales and adjustments that first version rejects before sending, with a message that says so.

### What's coming
- **Sales receipt (boleta, 03):** what a customer without a RUC receives. It is reported to SUNAT in a daily summary that is processed asynchronously and returns a ticket that has to be checked.
- **Debit note.**
- **Detracciones (SPOT) and perceptions:** today, declaring them in Settings leaves the rail inactive, so nothing is issued halfway.
- **Several installments per invoice, advances and free transfers.**
- **Remission guide.**

### What blocks it
It's Cord's work, not the authority's: the receipt needs a second, asynchronous submission flow with its ticket check, and each case is validated against SUNAT's beta service before it's offered.`
        },
        area: 'fiscal',
        status: 'next',
        api: false
    },
    {
        id: '42',
        slug: 'nfe-devolucion-brasil',
        title: {
            es: 'Brasil: devolución, ST y DIFAL en la NF-e',
            en: 'Brazil: returns, ST and DIFAL on the NF-e'
        },
        shortDesc: {
            es: 'La NF-e de devolución de mercancía, la sustitución tributaria, el DIFAL a no contribuyentes de otro estado y el IBS/CBS del Simples Nacional, obligatorio en la NF-e desde el 4 de enero de 2027.',
            en: 'The NF-e for returned goods, tax substitution, DIFAL to non-taxpayers in other states, and IBS/CBS for Simples Nacional, mandatory on the NF-e from January 4, 2027.'
        },
        content: {
            es: `## Qué falta en Brasil
La NF-e y la NFS-e están construidas y en beta. Lo que sigue son los casos que hoy se rechazan antes de numerar, con un mensaje que explica por qué.

### Lo que viene
- **NF-e de devolución:** la devolución de una mercancía es otra NF-e, no una nota de crédito.
- **Sustitución tributaria (ST) y DIFAL** a no contribuyentes de otro estado, y el Régimen Normal en ventas a otro estado.
- **IBS/CBS del Simples Nacional:** la Nota Técnica 2025.002 de la NF-e lo vuelve obligatorio desde el 4 de enero de 2027. Es la fecha de la obligación; Cord no emitirá esas notas mientras no estén publicadas las reglas para declararlo.
- **Exportación y retenciones,** en la NF-e y en la NFS-e.
- **Los estados de AM, MS, PE, PR, SC y TO,** que exigen el registro del responsable técnico del software.

### Qué lo bloquea
El IBS/CBS del Simples Nacional espera reglas publicadas. El resto es trabajo de Cord: modelar el ICMS entre estados para la ST y el DIFAL, y completar el registro del responsable técnico del software en los estados que lo piden.`,
            en: `## What's left in Brazil
The NF-e and NFS-e are built and in beta. What comes next are the cases that are rejected today before a number is assigned, with a message explaining why.

### What's coming
- **Return NF-e:** returning goods is another NF-e, not a credit note.
- **Tax substitution (ST) and DIFAL** to non-taxpayers in other states, and the Regular Regime on sales to other states.
- **IBS/CBS for Simples Nacional:** NF-e Technical Note 2025.002 makes it mandatory from January 4, 2027. That is the obligation's date; Cord won't issue those notes until the rules for declaring it are published.
- **Exports and withholdings,** on the NF-e and the NFS-e.
- **The states of AM, MS, PE, PR, SC and TO,** which require the software's technical-responsible registration.

### What blocks it
IBS/CBS for Simples Nacional is waiting for published rules. The rest is Cord's work: modeling interstate ICMS for ST and DIFAL, and completing the software's technical-responsible registration in the states that require it.`
        },
        area: 'fiscal',
        status: 'next',
        api: false
    },
    {
        id: '43',
        slug: 'guia-despacho-chile',
        title: {
            es: 'Chile: guía de despacho, exportación y boleta',
            en: 'Chile: dispatch guides, exports and receipts'
        },
        shortDesc: {
            es: 'La guía de despacho y su libro, los documentos de exportación, la factura de compra y la boleta electrónica, que hoy se rechazan antes de tomar folio.',
            en: 'The dispatch guide and its ledger, export documents, the purchase invoice and the electronic receipt, which today are rejected before a folio is taken.'
        },
        content: {
            es: `## Qué falta en Chile
Los documentos tributarios electrónicos del SII están construidos y en beta para facturas y notas. Lo que sigue:

- **Guía de despacho (52)** y su libro, que el set de certificación pide si el negocio los postuló.
- **Factura de exportación y sus notas (110, 111 y 112),** en otra divisa.
- **Factura de compra (46)** como documento emitido.
- **Boleta electrónica (39 y 41)** para clientes sin RUT.
- **Boleta de honorarios** y su retención.

### Qué lo bloquea
Es trabajo de Cord. Cada documento se construye contra el formato del SII y se prueba en su ambiente de certificación antes de ofrecerlo; mientras tanto Ajustes lo dice y el documento se rechaza antes de tomar folio, para no gastar uno. También evaluaremos si Cord puede registrarse ante el SII como software de mercado certificado, para simplificar la certificación de cada negocio.`,
            en: `## What's left in Chile
The SII's electronic tax documents are built and in beta for invoices and notes. What comes next:

- **Dispatch guide (52)** and its ledger, which the certification test set asks for if the business applied for them.
- **Export invoice and its notes (110, 111 and 112),** in other currencies.
- **Purchase invoice (46)** as an issued document.
- **Electronic receipt (boleta, 39 and 41)** for customers without a RUT.
- **Fee receipt (boleta de honorarios)** and its withholding.

### What blocks it
It's Cord's work. Each document is built against the SII format and tested in its certification environment before it's offered; meanwhile Settings says so and the document is rejected before a folio is taken, so none is wasted. We will also assess whether Cord can register with the SII as certified market software, to simplify each business's certification.`
        },
        area: 'fiscal',
        status: 'next',
        api: false
    },
    {
        id: '44',
        slug: 'radian-colombia',
        title: {
            es: 'Colombia: eventos RADIAN y documento soporte',
            en: 'Colombia: RADIAN events and support documents'
        },
        shortDesc: {
            es: 'Los eventos que permiten que la factura circule como título valor, el documento soporte de compras a no obligados a facturar, la factura de exportación y los impuestos que hoy no se informan.',
            en: 'The events that let an invoice circulate as a negotiable instrument, the support document for purchases from parties not required to invoice, the export invoice and the taxes not reported today.'
        },
        content: {
            es: `## Qué falta en Colombia
La factura electrónica de venta ante la DIAN está construida y en beta. Lo que sigue:

- **Eventos RADIAN,** como el acuse de recibo y la aceptación de la factura, que la DIAN registra para que la factura circule como título valor.
- **Documento soporte** de compras a personas no obligadas a facturar.
- **Factura de exportación** y facturas de contingencia.
- **INC, ICUI, ICA e impuestos saludables,** ReteICA informado, AIU, mandatos, propinas y cargos de documento.
- **Nómina electrónica.**

### Qué lo bloquea
Es trabajo de Cord sobre el mismo marco: cada documento se arma contra el Anexo Técnico y se prueba en el ambiente de habilitación de la DIAN. El acuse y la aceptación, además, los genera quien recibe la factura, así que dependen de la recepción de facturas de proveedores.`,
            en: `## What's left in Colombia
The electronic sales invoice with the DIAN is built and in beta. What comes next:

- **RADIAN events,** such as acknowledgment of receipt and acceptance of the invoice, which the DIAN records so the invoice can circulate as a negotiable instrument.
- **Support document** for purchases from parties not required to invoice.
- **Export invoice** and contingency invoices.
- **INC, ICUI, ICA and health taxes,** ReteICA reporting, AIU, mandates, tips and document-level charges.
- **Electronic payroll.**

### What blocks it
It's Cord's work on the same framework: each document is built against the Technical Annex and tested in the DIAN's enablement environment. Acknowledgment and acceptance are also generated by whoever receives the invoice, so they depend on receiving supplier invoices.`
        },
        area: 'fiscal',
        status: 'next',
        api: false
    },
    {
        id: '45',
        slug: 'recepcion-facturas-proveedores',
        title: {
            es: 'Recepción de facturas de proveedores',
            en: 'Receiving supplier invoices'
        },
        shortDesc: {
            es: 'Recibir, validar y responder las facturas electrónicas que te emiten, donde la ley obliga a poder recibirlas. Hoy Cord emite; la recepción existe solo en el intercambio de Chile.',
            en: 'Receiving, validating and answering the e-invoices issued to you, where the law requires being able to receive them. Today Cord issues; receiving exists only in Chile\'s exchange.'
        },
        content: {
            es: `## Del otro lado de la factura
Las reformas de factura electrónica no solo obligan a emitir: también a recibir. En Francia, toda empresa debe poder recibir facturas electrónicas desde el 1 de septiembre de 2026 (DGFiP). En España, la ley obliga a emitir, remitir y recibir factura electrónica entre empresarios en las fechas de la solución pública de la AEAT: 6 de octubre de 2027 y de 2028 (BOE). Son fechas de la obligación, no fechas de entrega de Cord.

### Hoy
- **Chile:** Cord recibe por intercambio los documentos que te emiten, los valida, responde al emisor y registra la aceptación o el reclamo ante el SII.
- **Francia:** Cord solo emite por la plataforma autorizada, y Ajustes lo dice: el negocio necesita su propia plataforma de recepción.
- **El resto:** Cord no recibe facturas de proveedores.

### Qué lo bloquea
Recibir no es guardar un archivo: exige mostrar y conservar las facturas recibidas, responder o comunicar sus estados en los plazos de cada país y no mover la dirección de recepción que el negocio ya tiene con otra plataforma. Es una superficie nueva de Cord, que se diseñará país por país.`,
            en: `## The other side of the invoice
E-invoicing reforms don't only require issuing: they also require receiving. In France, every business must be able to receive electronic invoices from September 1, 2026 (DGFiP). In Spain, the law requires businesses to issue, send and receive B2B e-invoices on the dates of the AEAT's public solution: October 6, 2027 and 2028 (BOE). These are the obligation's dates, not Cord delivery dates.

### Today
- **Chile:** Cord receives the documents issued to you through the exchange, validates them, replies to the issuer and records acceptance or a claim with the SII.
- **France:** Cord only issues through the approved platform, and Settings says so: the business needs its own reception platform.
- **Everywhere else:** Cord does not receive supplier invoices.

### What blocks it
Receiving isn't storing a file: it means showing and keeping the invoices received, answering or reporting their statuses on each country's deadlines, and not moving the reception address the business already has with another platform. It's a new Cord surface, to be designed country by country.`
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
        id: '13',
        slug: 'notificaciones',
        title: {
            es: 'Notificaciones por correo, Slack y Teams',
            en: 'Email, Slack and Teams notifications'
        },
        shortDesc: {
            es: 'Entérate por correo, Slack o Teams cuando tu cliente ve, aprueba, rechaza o paga una cotización, sin tener que revisar el dashboard.',
            en: 'Find out by email, Slack or Teams when your client views, approves, rejects, or pays a quote without checking the dashboard.'
        },
        content: {
            es: `## Entérate en el momento, no cuando revisas el dashboard
Una matriz de eventos por canal (correo, Slack y Microsoft Teams) en Ajustes › Notificaciones. Marca las casillas que quieras y se guardan al instante.

### Beneficios clave:
- **Correo al dueño de la cuenta:** vista, aprobada, rechazada, pago recibido, por vencer, pago vencido y equipo; vienen encendidos por default en aprobada/rechazada/pagada desde el primer día.
- **Recordatorio de tareas a cada responsable:** cada mañana, desde las 8:00 de tu zona, un correo con sus tareas de hoy y las vencidas. Viene encendido y se apaga para toda la organización.
- **Slack y Teams para todo el equipo:** conecta tu canal de Slack con Añadir a Slack, o el de Teams con tu cuenta de Microsoft, y publica los mismos eventos con folio, cliente, total y link directo.
- **Sin ruido falso:** solo se dispara lo que de verdad marcaste; nada se postea "por si acaso".`,
            en: `## Find out the moment it happens, not when you check the dashboard
A matrix of events by channel (email, Slack and Microsoft Teams) under Settings › Notifications. Check the boxes you want and they save instantly.

### Key benefits:
- **Email to the account owner:** viewed, approved, rejected, payment received, about to expire, overdue, and team; approved/rejected/paid come on by default from day one.
- **Task reminder to each assignee:** every morning, from 8:00 in your time zone, an email with their tasks due today and overdue. It comes on by default and turns off for the whole organization.
- **Slack and Teams for the whole team:** connect your Slack channel with Add to Slack, or your Teams channel with your Microsoft account, and post the same events with folio, client, total, and a direct link.
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
- **Recordatorios a tu ritmo:** eliges cuándo recibe tu cliente cada recordatorio (antes, el día y después del vencimiento, hasta 8 por factura), los apagas o pausas a un cliente; salen en el idioma de tu cuenta, con tu firma y una sola vez por etapa.
- **Operación verificable:** actividad por documento, selección masiva sólo para facturas elegibles, exportación CSV y documentos de prueba marcados sin mezclarlos con estados comerciales.
- **Automatizable:** lista y administra facturas mediante la API pública de Cord y sus herramientas MCP.`,
            en: `## From capture to collection, without leaving Cord
Cord Invoicing brings together the commercial document, the fiscal issuance required for the seller's country, delivery, and collection. Each invoice keeps one history from draft to payment.

### Key benefits:
- **Direct creation and issuance:** build line items, save drafts without a number, and issue only after reviewing the client, total, due date, and recipient.
- **Delivery with context:** send by email, share the client link, download PDF/XML, and see whether an invoice was sent, viewed, overdue, or paid.
- **Complete collection:** record manual or partial payments, collect through the public link when Cord Payments is enabled, and turn an invoice into a monthly recurrence.
- **Reminders on your schedule:** choose when your client gets each reminder (before, on, and after the due date, up to 8 per invoice), turn them off, or pause a client; they go out in your account's language, with your signature, and once per stage.
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
Cord Workflows convierte lo que pasa en una venta en el siguiente paso, sin escribir código, y el directorio de integraciones conecta Cord con las herramientas donde ya trabaja tu equipo.

### Qué incluye:
- **Workflows con condiciones y esperas:** eliges un evento de Cord, pones condiciones visibles y encadenas pasos. Por ejemplo: tres días después de enviar una cotización, si sigue sin abrirse, crea una tarea para llamar al cliente.
- **Disparadores de tiempo:** además del evento, un horario fijo ("cada lunes a las 9", en la zona horaria de tu cuenta) y las anclas de vencimiento, que avisan antes de la fecha y no solo cuando ya pasó.
- **Espera hasta que ocurra:** el workflow espera a que el cliente abra o pague, con un plazo máximo, y sigue por una rama u otra según lo que pase.
- **Consultas antes de decidir:** cartera vencida, pipeline abierto, cobrado del periodo o el saldo del cliente, para usar ese dato en el mensaje o en la condición.
- **Prueba sin publicar:** corre el borrador con tu último evento real y muestra qué pasos se cumplirían y con qué texto exacto, sin mandar nada.
- **Datos de tu negocio en cualquier texto:** el nombre del negocio, su correo, su teléfono, su divisa y la fecha de hoy en tu zona horaria, sin escribirlos a mano en cada workflow.
- **Panel de salud:** ejecuciones, fallidas y las causas más frecuentes de los últimos 30 días, agrupadas por motivo y no por texto libre.
- **Acciones reales:** crear una tarea, avisar al equipo por correo, escribirle al cliente con tu marca, caducar una cotización, anular una factura, mandar los datos a una URL, publicar en Slack o Teams, o dejar una nota en el Deal de HubSpot.
- **Historial de cada ejecución:** qué se disparó, cuándo, con qué resultado y el error legible cuando algo falla. Un paso que falla se reintenta; la entrega es al menos una vez.
- **HubSpot en los dos sentidos:** tus clientes se mantienen al día con Empresas y Contactos, y cada cotización crea y mueve su Deal por el pipeline. Mover un Deal en HubSpot no cambia nada en Cord.
- **Google Sheets y Excel:** cada cotización y cada factura como una fila en tu hoja, al día sola: folio, cliente, estado, fechas, divisa y montos como números que puedes sumar. Cord crea el archivo y solo puede abrir ese, así que no ve el resto de tu Drive ni de tu OneDrive.
- **Shopify en los dos sentidos:** el catálogo y los clientes de tu tienda entran a Cord para cotizar mayoreo con precios y SKU reales, y cuando la cotización se aprueba o se paga, el pedido se crea en tu tienda para que el surtido y el inventario sigan donde ya viven, en la divisa de la cotización si tu tienda la acepta. El pedido nace apagado: lo activas tú.
- **QuickBooks Online y Xero:** cada factura definitiva entra a tu contabilidad con su cliente, sus líneas y su divisa, sin duplicarse: asentada en QuickBooks y en borrador en Xero para que la apruebe tu contador.
- **Gmail:** las cotizaciones, facturas y recordatorios de pago salen desde tu propia dirección, y el complemento de Cord para Gmail muestra la cotización del hilo en vivo, responde con ella en el mismo hilo y arma la cotización con IA a partir del pedido del correo.
- **Apps de Cord en Zapier y Make, sin llaves:** se conectan con un clic en una pantalla de Cord, con disparadores instantáneos, acciones y búsquedas. Cada conexión se puede revocar desde Ajustes.
- **Slack con Añadir a Slack y Teams con tu cuenta de Microsoft:** eliges el canal y listo, sin copiar URLs. WhatsApp le escribe al cliente con tu plantilla aprobada por Meta.
- **Nodo de Cord para n8n:** se instala desde Community Nodes como **n8n-nodes-cord** en n8n autoalojado, con su disparador que registra el webhook y verifica la firma.
- **La barra superior muestra tus apps conectadas:** los logos de las que usas y el acceso a las demás, sin salir de la pantalla.
- **Para quien programa:** API pública v1, webhooks firmados con historial de entregas y servidor MCP.

### Qué sigue:
- **Contabilidad local:** Alegra (México, Colombia y Perú), Holded (España) y Siigo (Colombia).
- **Pagos hacia tu contabilidad:** que el cobro también llegue a QuickBooks y Xero, no solo la factura.
- **El complemento de Gmail en Google Workspace Marketplace**, para instalarlo con un clic desde Gmail.
- **Google Calendar y Google Drive:** el seguimiento agendado cuando una cotización está por vencer, y el PDF de cada factura en una carpeta de tu Drive.
- **n8n Cloud:** el nodo se envió a verificación de n8n el 21 de septiembre de 2026; aparece en n8n Cloud cuando n8n lo apruebe.
- **WhatsApp con un botón:** conectar el número sin pasar por la consola de Meta, cuando Meta apruebe a Cord como proveedor.
- **Directorios públicos:** Cord en el buscador de Zapier, en el catálogo de Make y en el directorio de apps de Slack.`,
            en: `## Let the close trigger the rest of the work
Cord Workflows turns what happens in a sale into the next step, without writing code, and the integrations directory connects Cord with the tools your team already uses.

### What's included:
- **Workflows with conditions and waits:** pick a Cord event, set visible conditions and chain steps. For example: three days after sending a quote, if it is still unopened, create a task to call the client.
- **Time triggers:** besides the event, a fixed schedule ("every Monday at 9", in your account's time zone) and due-date anchors that warn you before the date, not only once it has passed.
- **Wait until it happens:** the workflow waits for the client to open or pay, with a time limit, and continues down one branch or the other depending on what happens.
- **Lookups before deciding:** overdue receivables, open pipeline, what was collected, or the client's balance, to use that number in the message or in the condition.
- **Test without publishing:** run the draft with your latest real event and see which steps would be met and with what exact text, without sending anything.
- **Your business data in any text:** the business name, its email, phone, currency and today's date in your time zone, without typing them into every workflow.
- **Health panel:** runs, failures and the most frequent causes over the last 30 days, grouped by reason rather than by free text.
- **Real actions:** create a task, email your team, email the client with your branding, expire a quote, void an invoice, send the data to a URL, post to Slack or Teams, or add a note to the HubSpot Deal.
- **History for every run:** what fired, when, with what result, and a readable error when something fails. A failed step is retried; delivery is at least once.
- **HubSpot both ways:** your clients stay in sync with Companies and Contacts, and every quote creates and moves its Deal through the pipeline. Moving a Deal in HubSpot changes nothing in Cord.
- **Google Sheets and Excel:** every quote and every invoice as a row in your spreadsheet, kept current on its own: number, client, status, dates, currency and amounts as numbers you can actually sum. Cord creates the file and can only open that one, so it never sees the rest of your Drive or OneDrive.
- **Shopify both ways:** your store's catalog and customers flow into Cord so you can quote wholesale with real prices and SKUs, and when the quote is approved or paid, the order is created in your store so fulfillment and inventory stay where they already live, in the quote's currency if your store accepts it. Orders start off: you turn them on.
- **QuickBooks Online and Xero:** every final invoice enters your accounting with its customer, lines and currency, never duplicated: recorded in QuickBooks and as a draft in Xero for your accountant to approve.
- **Gmail:** quotes, invoices and payment reminders go out from your own address, and the Cord add-on for Gmail shows the thread's quote live, replies with it in the same thread and builds the quote with AI from the order in the email.
- **Cord apps on Zapier and Make, without keys:** connect with one click on a Cord screen, with instant triggers, actions and searches. Each connection can be revoked from Settings.
- **Slack with Add to Slack and Teams with your Microsoft account:** pick the channel and you are done, with no URLs to copy. WhatsApp messages the client with your Meta-approved template.
- **Cord node for n8n:** install it from Community Nodes as **n8n-nodes-cord** on self-hosted n8n, with a trigger that registers its webhook and verifies the signature.
- **The top bar shows your connected apps:** the logos of the ones you use and quick access to the rest, without leaving the screen.
- **For developers:** public API v1, signed webhooks with delivery history, and an MCP server.

### What's next:
- **Local accounting:** Alegra (Mexico, Colombia and Peru), Holded (Spain) and Siigo (Colombia).
- **Payments into your accounting:** the payment should reach QuickBooks and Xero too, not only the invoice.
- **The Gmail add-on on Google Workspace Marketplace**, to install it with one click from Gmail.
- **Google Calendar and Google Drive:** follow-ups scheduled when a quote is about to expire, and each invoice PDF in a folder in your Drive.
- **n8n Cloud:** the node was submitted to n8n's verification on September 21, 2026; it appears in n8n Cloud once n8n approves it.
- **WhatsApp with a button:** connect the number without going through Meta's console, once Meta approves Cord as a provider.
- **Public directories:** Cord in Zapier's search, Make's catalog, and the Slack app directory.`
        },
        area: 'cotizaciones',
        status: 'live',
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
    },
    {
        id: '21',
        slug: 'configuracion-con-ia',
        title: {
            es: 'Configuración con IA',
            en: 'AI-assisted setup'
        },
        shortDesc: {
            es: 'Dale a Cord tu sitio, a qué te dedicas y tu lista de precios: propone perfil, marca, impuestos, catálogo y plantillas, y tú lo apruebas. Desde el onboarding, la terminal o un agente de IA.',
            en: 'Give Cord your website, what you do and your price list: it proposes profile, branding, taxes, catalog and templates, and you approve it. From onboarding, the terminal or an AI agent.'
        },
        content: {
            es: `## Tu cuenta lista en minutos, sin capturar campo por campo
Al crear tu cuenta, Cord te pide tres cosas opcionales: tu sitio web, una descripción de tu negocio y tu lista de precios en Excel, CSV, PDF o foto. Con eso arma una propuesta completa de configuración.

### Qué propone
- **Perfil y marca:** nombre, contacto, logo y color de tu sitio, y la plantilla del PDF.
- **Impuestos:** solo los que tu negocio maneja y tu catálogo todavía no tiene, como una retención. Llegan desmarcados: tú decides.
- **Catálogo:** los productos de tu lista de precios con SKU, unidad y precio, en tu divisa.
- **Cotizaciones y mensajes:** términos de pago, vigencia, condiciones y plantillas para enviar por correo o WhatsApp.

### Una sola propuesta, tres caminos
- **Onboarding y Ajustes:** el asistente aparece al terminar el alta y en Ajustes › General › Configurar con IA.
- **Terminal:** \`cord setup\` del CLI lee tu sitio y tu archivo, y abre la revisión en el navegador.
- **Agentes de IA:** por el servidor MCP, la herramienta \`proponer_configuracion\` hace lo mismo y te comparte el link.

### Nada se aplica sin ti
La IA solo redacta. Cada dato se valida con las mismas reglas que Ajustes (un RFC que no pasa la validación se descarta y te decimos por qué), y lo que llega de tu sitio se trata como contenido, nunca como instrucciones. Una persona con permiso de Ajustes revisa, edita y aprueba.`,
            en: `## Your account ready in minutes, without filling in field by field
When you create your account, Cord asks for three optional things: your website, a description of your business and your price list as Excel, CSV, PDF or a photo. From that it builds a complete setup proposal.

### What it proposes
- **Profile and branding:** name, contact, logo and color from your website, and the PDF template.
- **Taxes:** only the ones your business uses that your catalog doesn't have yet, such as a withholding. They arrive unchecked: you decide.
- **Catalog:** the products from your price list with SKU, unit and price, in your currency.
- **Quotes and messages:** payment terms, validity, conditions and templates to send by email or WhatsApp.

### One proposal, three ways in
- **Onboarding and Settings:** the assistant appears when you finish signing up and in Settings › General › Set up with AI.
- **Terminal:** the CLI's \`cord setup\` reads your website and file and opens the review in the browser.
- **AI agents:** through the MCP server, the \`proponer_configuracion\` tool does the same and shares the link with you.

### Nothing is applied without you
The AI only drafts. Every field is validated with the same rules as Settings (a tax ID that fails validation is dropped and we tell you why), and what comes from your website is treated as content, never as instructions. A person with Settings permission reviews, edits and approves.`
        },
        area: 'cotizaciones',
        status: 'live',
        api: true
    },
    {
        id: '22',
        slug: 'tareas-y-seguimiento',
        title: {
            es: 'Tareas con responsable y recordatorio',
            en: 'Tasks with owners and reminders'
        },
        shortDesc: {
            es: 'Cada seguimiento con responsable, fecha y prioridad, agrupado por urgencia, y un correo cada mañana a quien le toca con lo de hoy y lo vencido.',
            en: 'Every follow-up with an owner, due date and priority, grouped by urgency, plus a morning email to whoever owns it with what is due today and overdue.'
        },
        content: {
            es: `## Que ningún trato se enfríe por falta de seguimiento
Una cotización que nadie persigue se pierde aunque el cliente estuviera interesado. Las tareas de Cord convierten cada seguimiento en un pendiente con dueño y fecha, en el mismo lugar donde vive el trato.

### Qué incluye
- **Responsable, fecha y prioridad:** cada tarea tiene a quién le toca, cuándo vence y si es urgente. Sin elegir responsable, es de quien la escribe.
- **Agrupadas por urgencia:** vencidas, hoy, mañana, esta semana, más adelante y sin fecha, según el día en la zona horaria de tu negocio, no la del servidor.
- **Captura en segundos:** desde el Inicio, desde la página Tareas o con la tecla T en cualquier pantalla, con atajos de fecha Hoy, Mañana y Lunes.
- **Completar con Deshacer, posponer y editar:** sin recargar la página; y si el servidor rechaza un cambio, la tarea no desaparece.
- **Ligadas al documento:** una tarea que nace de una cotización o factura muestra su folio y el cliente como enlace.
- **Recordatorio cada mañana:** desde las 8:00 de tu zona, cada responsable recibe un solo correo con sus tareas de hoy y las vencidas. Se apaga en Ajustes › Notificaciones.
- **Tareas que Cord crea por ti:** responder un contracargo y transferir un reembolso por SPEI llegan con prioridad alta.

### También automatizable
Los workflows, la API (\`POST /api/v1/tareas\`) y el servidor MCP crean tareas; cada una emite \`task.created\` y, al completarse, \`task.completed\`.`,
            en: `## No deal goes cold for lack of follow-up
A quote nobody follows up on is lost even if the client was interested. Cord tasks turn each follow-up into a to-do with an owner and a date, in the same place the deal lives.

### What it includes
- **Owner, due date and priority:** every task has who it belongs to, when it is due and whether it is urgent. Without choosing an owner, it belongs to whoever typed it.
- **Grouped by urgency:** overdue, today, tomorrow, this week, later and no date, based on the day in your business's time zone, not the server's.
- **Capture in seconds:** from Home, from the Tasks page, or with the T key on any screen, with Today, Tomorrow and Monday date shortcuts.
- **Complete with Undo, snooze and edit:** without reloading the page; and if the server rejects a change, the task doesn't disappear.
- **Linked to the document:** a task created from a quote or invoice shows its number and the client as a link.
- **Morning reminder:** from 8:00 in your time zone, each owner gets a single email with their tasks due today and overdue. Turn it off in Settings › Notifications.
- **Tasks Cord creates for you:** responding to a chargeback and transferring a SPEI refund arrive with high priority.

### Automatable too
Workflows, the API (\`POST /api/v1/tareas\`) and the MCP server create tasks; each one emits \`task.created\` and, when completed, \`task.completed\`.`
        },
        area: 'cotizaciones',
        status: 'live',
        api: true
    },
{
    "id": "20",
    "slug": "confiabilidad-operativa",
    "title": {
        "es": "Confiabilidad de pagos y facturas",
        "en": "Payment and invoice reliability"
    },
    "shortDesc": {
        "es": "Correcciones construidas para pagos parciales, créditos, recurrencias y cambios de método. La fase continúa con validación integrada y recuperación operativa.",
        "en": "Implemented fixes for partial payments, credits, recurrence and method switching. Work continues with integrated validation and operational recovery."
    },
    "content": {
        "es": "## Fase 1: operaciones comprobables\n\nEl programa sigue abierto. Hay correcciones implementadas y probadas, pero todavía falta completar la validación integrada y comprobar su publicación.\n\n### Construido y probado\n\n- Verificación 2FA también en solicitudes del panel cuando la organización la exige.\n- Pagos sucesivos por el saldo de una factura y registro separado de pagos, créditos y reembolsos confirmados.\n- Impuestos y retenciones por concepto, notas de crédito relacionadas y cancelaciones que esperan confirmación.\n- PDF/XML disponibles desde el enlace de la factura, saldo actualizable y siguiente acción según el estado.\n- Reserva del periodo de facturas recurrentes frente a ejecuciones simultáneas y cambios de calendario.\n- Contratación en EUR con precios fijos y conservación de la moneda de contratos existentes; personalización según el plan efectivo.\n- Cambio SPEI/tarjeta con verificación del intento anterior y registro durable de reintentos. Pendiente de prueba integrada antes de publicarse.\n- Registro de comisiones de facturas directas con desglose conservado, costos verificables y revisión de datos inciertos; probado localmente.\n- Inactividad comprobada también en API y facturación, con renovación atómica y sin extender la sesión desde páginas públicas; probado localmente.\n- API del checkout anterior unificada con la pantalla actual, conservando su respuesta y tarifas; pendiente de publicación.\n- Comprobación automática de pruebas, tipos y compilación preparada; falta su primera ejecución en GitHub.\n\n### Facturación comercial en Gratis — preparada para publicación\n\nFacturas comerciales: 10 al mes en Gratis e ilimitadas desde Starter (proforma en MX/ES). Facturas con validez fiscal desde Starter donde esté habilitada, con cuota propia de 30/200/500 al mes en Starter/Profesional/Scale. El contador cubre todos los países, evita consumo duplicado y conserva documentos existentes al cambiar de plan. La activación fiscal española sigue pendiente.\n\n### Pendiente de cerrar\n\nAceptación integrada y recuperación de comisiones pendientes, aislamiento con el rol real de base de datos, aceptación integrada de sesiones por inactividad, recuperación de eventos, alertas y restauración de respaldos. Repetir la auditoría de sesiones anteriores antes de publicar; las transferencias tardías requieren recuperación adicional.\n\nLas pruebas reducen regresiones en los escenarios cubiertos; no prometen cero fallos ni sustituyen una prueba de operación completa. Consulta [las guías actualizadas](https://docs.cordhq.app/docs/pagos/mejoras-confiabilidad).\n\n### Después: fase 2\n\nMayor continuidad del trato, acciones y responsables, seguimiento y flujos útiles para negocios que venden productos o servicios. Estas iniciativas siguen planeadas; no forman parte de la entrega actual. Las tareas con responsable y recordatorio diario ya están disponibles como entrega propia: [Tareas con responsable y recordatorio](/roadmap/tareas-y-seguimiento).",
        "en": "## Phase 1: verifiable operations\n\nThe program remains open. Fixes are implemented and tested, but integrated validation and publication checks are not yet complete.\n\n### Implemented and tested\n\n- 2FA on dashboard requests when required by the organization.\n- Subsequent invoice payments use the current balance, with payments, credits and confirmed refunds kept separate.\n- Per-line taxes and withholdings, linked credit notes and cancellation that waits for confirmation.\n- Available PDF/XML downloads from invoice links, refreshable balances and next actions based on status.\n- Recurring-period claims protect against concurrent runs and calendar edits.\n- Fixed EUR subscription pricing and preservation of existing contract currency; customization follows the effective plan.\n- SPEI/card switching verifies the previous attempt and stores retries durably. Integrated testing remains pending before publication.\n\n- Direct-invoice fee ledger with preserved splits, verifiable costs and review of uncertain data; tested locally.\n- Idle timeout also checked on APIs and billing, with atomic refresh and no renewal from public pages; tested locally.\n- Previous checkout API unified with the current payment screen, preserving its response and accepted rates; publication pending.\n- Automated tests, type checks and build verification prepared; its first GitHub run remains pending.\n\n### Commercial documents in Free — prepared for publication\n\nCommercial invoices: 10 per month on Free and unlimited from Starter (pro formas in MX/ES). Tax-compliant invoices from Starter where enabled, with their own 30/200/500 monthly allowance on Starter/Professional/Scale. Usage covers all countries, prevents duplicate consumption and preserves existing documents across plan changes. Spanish fiscal activation remains pending.\n\n### Still to complete\n\nIntegrated acceptance and recovery of pending fees, isolation using the actual database role, integrated idle-session acceptance, event recovery, alerts and backup restoration. Repeat the legacy-session audit before release; late bank transfers need additional recovery work.\n\nTests reduce regressions in covered scenarios; they do not promise zero failures or replace a complete operational test. See [the updated guides](https://docs.cordhq.app/en/docs/pagos/mejoras-confiabilidad).\n\n### Next: phase 2\n\nGreater deal continuity, actions and owners, follow-up and useful workflows for businesses selling products or services. These initiatives remain planned and are not part of this delivery. Tasks with owners and a daily reminder already shipped as their own delivery: [Tasks with owners and reminders](/en/roadmap/tareas-y-seguimiento)."
    },
    "area": "finanzas",
    "status": "next",
    "api": false
}
];

const roadmapEnhancements = {
"confiabilidad-operativa": {
    "family": "payments",
    "market": {
        "es": "Payments, Invoicing y cuenta",
        "en": "Payments, Invoicing and account"
    },
    "workflow": {
        "es": [
            "Verifica saldo, moneda y estado antes de intentar otro cobro.",
            "Consulta el resultado de pagos, cancelaciones y emisiones sin asumir confirmación.",
            "Resuelve los movimientos pendientes y valida el flujo integrado antes de activar cambios."
        ],
        "en": [
            "Verify balance, currency and status before trying another payment.",
            "Check payment, cancellation and issuance results without assuming confirmation.",
            "Resolve pending movements and validate the integrated flow before enabling changes."
        ]
    },
    "scope": {
        "es": "Fase 1 en curso: correcciones de código con pruebas y migraciones autorizadas. Incluye documentación del alcance y de los pendientes.",
        "en": "Phase 1 in progress: code fixes with tests and authorized migrations, including documented scope and remaining work."
    },
    "boundaries": {
        "es": "Implementado no equivale a publicado. No se promete recuperación total, devolución automática de transferencias tardías ni aislamiento real ya activado.",
        "en": "Implemented does not mean published. Full recovery, automatic late-transfer refunds and activated real-role isolation are not promised."
    },
    "related": [
        "cord-payments",
        "facturas-emitidas",
        "link-publico"
    ]
},
    'editor-cotizaciones': {
        family: 'quotes', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Elige un cliente y agrega productos del catálogo o conceptos nuevos.', 'Ajusta cantidades, precios, descuentos, impuestos por línea y condiciones de pago.', 'Revisa el margen, guarda el borrador y envía un único link al cliente.'],
            en: ['Choose a client and add catalog products or new line items.', 'Adjust quantities, prices, discounts, per-line taxes, and payment terms.', 'Review margin, save the draft, and send one link to the client.']
        },
        scope: { es: 'Disponible en los mercados ofrecidos por Cord. Las etiquetas fiscales, tasas sugeridas, divisa y formato cambian según la organización.', en: 'Available across Cord supported markets. Tax labels, suggested rates, currency, and formatting adapt to the organization.' },
        boundaries: { es: 'Las tasas sugeridas no sustituyen el criterio fiscal del negocio. Si Cord no puede obtener un tipo de cambio real, la cotización multi-divisa no se guarda con una tasa inventada.', en: 'Suggested rates do not replace the business tax judgment. If Cord cannot retrieve a real exchange rate, a multi-currency quote is not saved with an invented rate.' },
        related: ['descuentos-y-cupones', 'link-publico', 'multi-divisa-fx']
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
    'configuracion-con-ia': {
        family: 'platform', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Comparte tu sitio, una descripción o tu lista de precios.', 'Cord propone perfil, marca, impuestos, catálogo y plantillas, validados con las reglas de tu país.', 'Revisas, editas y apruebas; Cord lo aplica con los mismos controles que Ajustes.'],
            en: ['Share your website, a description or your price list.', 'Cord proposes profile, branding, taxes, catalog and templates, validated with your country rules.', 'You review, edit and approve; Cord applies it with the same controls as Settings.']
        },
        scope: { es: 'Configuración inicial desde el onboarding, Ajustes, el CLI (cord setup), la API (POST /api/v1/setup/plans) y el servidor MCP, con una sola revisión para todos.', en: 'Initial setup from onboarding, Settings, the CLI (cord setup), the API (POST /api/v1/setup/plans) and the MCP server, with one review for all of them.' },
        boundaries: { es: 'Propone; no aplica nada sin aprobación de una persona. No sube tu certificado fiscal ni activa cobros en línea: esos pasos siguen siendo tuyos.', en: 'It proposes; nothing is applied without a person approving it. It does not upload your tax certificate or enable online payments: those steps remain yours.' },
        related: ['cord-elements', 'integraciones-y-flujos', 'editor-cotizaciones']
    },
    'cord-elements': {
        family: 'platform', market: { es: 'Web, React y Vue', en: 'Web, React, and Vue' },
        workflow: {
            es: ['Instala el paquete o registra el Web Component en el portal existente.', 'Autentica la sesión y carga catálogo, cliente y reglas desde Cord.', 'Escucha eventos o usa los hooks headless para controlar tu propia interfaz.'],
            en: ['Install the package or register the Web Component in the existing portal.', 'Authenticate the session and load catalog, client, and rules from Cord.', 'Listen for events or use headless hooks to control your own interface.']
        },
        scope: { es: 'SDK tipado para React, Vue y Web Components (cotización, factura y formulario fiscal), con un núcleo headless para controlar por completo la presentación. @flouviahq/node y @flouviahq/cli cubren el backend y las pruebas locales.', en: 'Typed SDK for React, Vue, and Web Components (quote, invoice and tax form), with a headless core for full presentation control. @flouviahq/node and @flouviahq/cli cover the backend and local testing.' },
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
        boundaries: { es: 'Es opt-in por negocio y no decide condonaciones, descuentos ni acciones legales. El link de pago aparece donde hay un riel de cobro en línea activo, sea Cord Payments o Mercado Pago.', en: 'It is opt-in per business and does not decide write-offs, discounts, or legal action. The payment link appears where an online payment rail is active, either Cord Payments or Mercado Pago.' },
        related: ['clientes-credito', 'cord-payments', 'anticipos-pagos-parciales']
    },
    'anticipos-pagos-parciales': {
        family: 'payments', market: { es: 'Cobro en línea según mercado', en: 'Online payment by market' },
        workflow: {
            es: ['Define el porcentaje de anticipo y las condiciones del saldo.', 'El link explica cuánto se paga hoy y cuánto queda pendiente.', 'Cada cobro actualiza el saldo hasta cerrar por completo la cotización o factura.'],
            en: ['Set the deposit percentage and balance terms.', 'The link explains how much is due today and how much remains.', 'Every charge updates the balance until the quote or invoice is fully settled.']
        },
        scope: { es: 'Admite anticipos, saldos, pagos parciales y cuotas asociadas a una misma venta, con movimientos independientes y trazables.', en: 'Supports deposits, balances, partial payments, and installments tied to one sale, with independent traceable movements.' },
        boundaries: { es: 'El pago en línea requiere Cord Payments o Mercado Pago activo. Donde no existe ese carril, el negocio puede registrar pagos manuales sin fingir una conciliación bancaria automática.', en: 'Online payment requires active Cord Payments or Mercado Pago. Where that rail is unavailable, the business can record manual payments without pretending automatic bank reconciliation.' },
        related: ['cord-payments', 'pagos-por-milestones', 'clientes-credito']
    },
    'cord-payments': {
        family: 'payments', market: { es: '8 mercados con cobro en línea', en: '8 online-payment markets' },
        workflow: {
            es: ['Completa el alta de la empresa, representantes y beneficiarios que pida el proveedor.', 'Activa los métodos disponibles para el país y acepta la tarifa aplicable cuando exista.', 'Cobra desde el link y consulta movimientos, depósitos, reembolsos o contracargos en Cord.'],
            en: ['Complete onboarding for the company, representatives, and owners required by the provider.', 'Enable methods available for the country and accept the applicable fee when one exists.', 'Collect from the link and review movements, payouts, refunds, or disputes in Cord.']
        },
        scope: { es: 'Tarjeta en MX, US, CA, BR, ES, GB, DE y FR. SPEI solo para operaciones en MXN de cuentas mexicanas. Mercado Pago como segundo riel para cotizaciones y facturas en MX, BR, CO, AR, CL y PE.', en: 'Cards in MX, US, CA, BR, ES, GB, DE, and FR. SPEI only for MXN transactions on Mexican accounts. Mercado Pago as a second rail for quotes and invoices in MX, BR, CO, AR, CL, and PE.' },
        boundaries: { es: 'En CO, AR, CL y PE el cobro en línea es con Mercado Pago; sin él, pagos manuales. Mercado Pago no cobra igualas recurrentes. Las tarifas de plataforma fuera de MXN no se inventan: mientras no exista una tabla verificada, Cord no aplica una comisión regional.', en: 'In CO, AR, CL, and PE online collection runs on Mercado Pago; without it, manual payments. Mercado Pago does not collect recurring retainers. Platform fees outside MXN are not invented: until a verified schedule exists, Cord does not apply a regional fee.' },
        related: ['portal-del-cliente', 'cobro-automatico', 'anticipos-pagos-parciales']
    },
    'cfdi-automatico': {
        family: 'invoicing', market: { es: 'México', en: 'Mexico' },
        workflow: {
            es: ['Configura tus datos fiscales y conecta tu CSD.', 'Revisa receptor, conceptos, claves SAT, impuestos, forma de pago y uso antes de emitir.', 'Cord timbra, guarda XML y PDF, y emite el complemento de pago, la sustitución o la cancelación cuando corresponde.'],
            en: ['Set up your tax details and connect your CSD.', 'Review recipient, lines, SAT codes, taxes, payment form and use before issuing.', 'Cord stamps, stores the XML and PDF, and issues the payment complement, substitution or cancellation when needed.']
        },
        scope: { es: 'Carril exclusivo de México: CFDI de ingreso y de egreso, complemento de pago, factura global y sustitución, con tu CSD cuando está conectado. Cada CFDI, nota de crédito y complemento de pago cuenta en la cuota de facturas con validez fiscal; los documentos de prueba no.', en: 'Mexico-only rail: income and credit CFDI, payment complements, global invoice and substitution, with your CSD when connected. Every CFDI, credit note and payment complement counts toward the tax-compliant invoice allowance; test documents don\'t.' },
        boundaries: { es: 'CFDI no se ofrece fuera de México. No emite complemento de Comercio Exterior ni IEPS. Un CFDI con notas de crédito o complementos de pago vigentes no se sustituye hasta resolverlos, y la factura global se corrige cancelándola. Un documento de prueba nunca se presenta como válido ante el SAT.', en: 'CFDI is not offered outside Mexico. It doesn\'t issue the Foreign Trade complement or IEPS. A CFDI with active credit notes or payment complements can\'t be substituted until they are resolved, and the global invoice is corrected by canceling it. A test document is never presented as valid with the SAT.' },
        related: ['facturas-emitidas', 'descuentos-y-cupones', 'validacion-constancia']
    },
    'verifactu-espana': {
        family: 'invoicing', market: { es: 'España', en: 'Spain' },
        workflow: {
            es: ['La organización conecta un certificado español válido.', 'Al emitir, Cord genera el registro, la secuencia y la huella enlazada, sin depender de la red.', 'Un proceso separado remite el registro a la AEAT, guarda la respuesta y permite corregir lo rechazado desde la factura.'],
            en: ['The organization connects a valid Spanish certificate.', 'On issue, Cord creates the record, sequence and linked fingerprint, with no network dependency.', 'A separate process submits the record to the AEAT, keeps the response and lets you fix rejections from the invoice.']
        },
        scope: { es: 'Motor construido para España, en beta hasta completar la identidad del sistema, la declaración responsable y la prueba en el portal de la AEAT. Cada factura registrada cuenta en la cuota de facturas con validez fiscal, desde Starter.', en: 'Engine built for Spain, in beta until the system identity, the responsible statement and the AEAT test portal submission are complete. Each registered invoice counts toward the tax-compliant invoice allowance, from Starter.' },
        boundaries: { es: 'Sin activación o sin certificado, el documento español es una proforma: no se muestra un QR ni un estado Verifactu falso. Una factura con IGIC, IPSI o recargo de equivalencia se rechaza al emitir por este carril.', en: 'Without activation or a certificate, the Spanish document is a pro forma: no false QR or Verifactu status is shown. An invoice with IGIC, IPSI or equivalence surcharge is rejected when issued on this rail.' },
        related: ['facturae-espana', 'factura-b2b-espana', 'facturacion-internacional']
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
        family: 'invoicing', market: { es: 'Mercados sin riel fiscal activo', en: 'Markets without an active tax rail' },
        workflow: {
            es: ['La organización configura su perfil fiscal, serie y moneda contable.', 'Al emitir, Cord elige el carril del país y congela emisor, receptor, líneas, impuestos y tipo de cambio.', 'Genera un PDF con marca, folio, vencimiento, impuestos y forma de pago.'],
            en: ['The organization configures its tax profile, series, and accounting currency.', 'On issue, Cord picks the country\'s rail and freezes issuer, recipient, lines, taxes, and exchange rate.', 'It creates a branded PDF with number, due date, taxes, and payment instructions.']
        },
        scope: { es: 'Factura comercial para los mercados sin un riel fiscal activo, y punto de partida de los rieles de cada país: CFDI en México; Verifactu en España; ARCA, NFS-e y NF-e, SII, DIAN y SUNAT en Latinoamérica; y la factura electrónica europea.', en: 'Commercial invoice for markets without an active tax rail, and the starting point for each country\'s rails: CFDI in Mexico; Verifactu in Spain; ARCA, NFS-e and NF-e, SII, DIAN and SUNAT in Latin America; and European e-invoicing.' },
        boundaries: { es: 'Cord no afirma presentar un documento ante una autoridad con la que no hay un riel activo para esa cuenta. Los rieles en beta se encienden por país; hasta entonces el documento de Argentina, Brasil, Chile, Colombia y Perú es una factura comercial, y el de España, una proforma.', en: 'Cord never claims to file a document with an authority it has no active rail with for that account. Beta rails are switched on per country; until then the document in Argentina, Brazil, Chile, Colombia and Peru is a commercial invoice, and in Spain a pro forma.' },
        related: ['facturas-emitidas', 'factura-electronica-europea', 'multi-divisa-fx']
    },
    'descuentos-y-cupones': {
        family: 'quotes', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Crea el cupón en Ajustes › Descuentos › Cupones o captura el descuento en el editor.', 'Cord valida vigencia, divisa y usos, y reparte el descuento entre las líneas antes de impuestos.', 'Al aprobarse la cotización o emitirse la factura se registra el uso; rechazar, anular o borrar el borrador lo libera.'],
            en: ['Create the coupon in Settings › Discounts › Coupons or enter the discount in the editor.', 'Cord checks validity, currency and uses, and spreads the discount across the lines before tax.', 'When the quote is approved or the invoice is issued, the use is recorded; rejecting, voiding or deleting the draft releases it.']
        },
        scope: { es: 'Cotizaciones y facturas en los 12 mercados, desde el editor, la API y el cotizador embebido. El descuento llega al PDF, al link público y al documento fiscal de cada país.', en: 'Quotes and invoices in all 12 markets, from the editor, the API and the embedded quote builder. The discount reaches the PDF, the public link and each country\'s tax document.' },
        boundaries: { es: 'El descuento de documento aplica a la venta completa; el precio negociado de cada línea sigue siendo su precio. Un cupón usado no se reescribe y una recurrencia no lleva cupones. Un concepto que el descuento deja en cero no puede ir en un CFDI y se rechaza antes de timbrar.', en: 'The document discount applies to the whole sale; each line\'s negotiated price stays its price. A used coupon can\'t be rewritten and a recurrence carries no coupons. A line the discount brings to zero can\'t go on a CFDI and is rejected before stamping.' },
        related: ['editor-cotizaciones', 'cfdi-automatico', 'cord-elements']
    },
    'portal-del-cliente': {
        family: 'payments', market: { es: 'Mercados con Cord Payments', en: 'Cord Payments markets' },
        workflow: {
            es: ['Desde la ficha del cliente, crea el link de su portal y envíaselo.', 'El cliente revisa sus facturas, elige cuáles paga y las paga en un solo cobro.', 'Cord aplica el pago a cada factura con el reparto fijado al crear el cobro, y un reembolso posterior se reparte igual.'],
            en: ['From the customer profile, create their portal link and send it.', 'The customer reviews their invoices, picks which ones to pay and pays them in a single charge.', 'Cord applies the payment to each invoice with the allocation set when the charge was created, and a later refund is allocated the same way.']
        },
        scope: { es: 'Facturas emitidas de un cliente, saldo por divisa y pago agrupado con tarjeta y, cuando esté activa, domiciliación bancaria. El pago en línea está disponible donde opera Cord Payments.', en: 'A customer\'s issued invoices, balance by currency and grouped payment by card and, once active, direct debit. Online payment is available where Cord Payments operates.' },
        boundaries: { es: 'El portal no suma divisas ni deja pagar un importe distinto al saldo real de cada factura elegida. No reemplaza el link de cada factura, que sigue funcionando. Sin Cord Payments, muestra las facturas pero no cobra desde el portal.', en: 'The portal never adds up currencies or lets the customer pay an amount other than each chosen invoice\'s real balance. It doesn\'t replace each invoice\'s own link, which keeps working. Without Cord Payments, it shows the invoices but doesn\'t collect from the portal.' },
        related: ['cord-payments', 'cobro-automatico', 'facturas-emitidas']
    },
    'cobro-automatico': {
        family: 'payments', market: { es: 'Mercados con Cord Payments', en: 'Cord Payments markets' },
        workflow: {
            es: ['El cliente autoriza un método desde su portal o al pagar una factura.', 'Al vencer sus facturas, Cord cobra en un solo cargo por divisa las que cubre la autorización.', 'Si el cargo falla, aplica la política de reintentos y avisa al cliente y al negocio.'],
            en: ['The customer authorizes a method from their portal or when paying an invoice.', 'When invoices fall due, Cord collects the ones the authorization covers in a single charge per currency.', 'If the charge fails, it applies the retry policy and notifies the customer and the business.']
        },
        scope: { es: 'Facturas emitidas a clientes con portal, cobradas con tarjeta o, cuando esté activa, con domiciliación SEPA o ACH. Requiere Cord Payments.', en: 'Invoices issued to customers with a portal, collected by card or, once active, by SEPA or ACH direct debit. Requires Cord Payments.' },
        boundaries: { es: 'El negocio no puede activarlo en nombre del cliente: solo apagarlo, por cliente o para toda la cuenta. Solo cobra facturas que vencen a partir de la autorización, y no cobra con Mercado Pago.', en: 'The business can\'t turn it on for the customer: it can only turn it off, per customer or for the whole account. It only collects invoices due on or after the authorization, and doesn\'t collect through Mercado Pago.' },
        related: ['portal-del-cliente', 'domiciliacion-sepa-ach', 'cobranza-ia']
    },
    'domiciliacion-sepa-ach': {
        family: 'payments', market: { es: 'España, Alemania, Francia y EE. UU.', en: 'Spain, Germany, France and the US' },
        workflow: {
            es: ['El negocio activa la domiciliación en Ajustes › Cobros.', 'El cliente elige pagar con su cuenta desde el link de la factura o su portal, y acepta el mandato.', 'El débito queda en proceso hasta que el banco lo confirma; mientras tanto, la factura no se puede cobrar dos veces.'],
            en: ['The business turns on direct debit in Settings › Payments.', 'The customer chooses to pay from their bank account on the invoice link or their portal, and accepts the mandate.', 'The debit stays in progress until the bank confirms it; meanwhile, the invoice can\'t be charged twice.']
        },
        scope: { es: 'SEPA en euros para negocios de España, Alemania y Francia; ACH en dólares para negocios de Estados Unidos. En el link de la factura y en el portal del cliente.', en: 'SEPA in euros for businesses in Spain, Germany and France; ACH in US dollars for businesses in the United States. On the invoice link and in the customer portal.' },
        boundaries: { es: 'SEPA solo en euros y ACH solo en dólares, sobre la cuenta de cobros del negocio. ACH no admite reembolsos parciales. Un débito rechazado por fondos se reintenta como máximo dos veces dentro del plazo del esquema.', en: 'SEPA only in euros and ACH only in US dollars, on the business\'s payment account. ACH doesn\'t support partial refunds. A debit declined for insufficient funds is retried at most twice within the scheme\'s window.' },
        related: ['portal-del-cliente', 'cobro-automatico', 'cord-payments']
    },
    'identificador-fiscal': {
        family: 'platform', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Escribes el identificador en Ajustes, en la ficha del cliente, en un CSV o por la API.', 'Cord lo normaliza y comprueba su forma y su dígito de control con las reglas del país.', 'Si no cuadra, te dice qué dato revisar con un ejemplo válido; si cuadra, lo guarda normalizado.'],
            en: ['You enter the tax ID in Settings, on the customer profile, in a CSV or through the API.', 'Cord normalizes it and checks its format and check digit with the country\'s rules.', 'If it doesn\'t match, it tells you which field to review with a valid example; if it does, it saves it normalized.']
        },
        scope: { es: 'Los 12 mercados de Cord, en cada superficie donde se captura un identificador fiscal, con un solo validador compartido por la app, la API y Cord Elements.', en: 'All 12 Cord markets, on every surface where a tax ID is entered, with a single validator shared by the app, the API and Cord Elements.' },
        boundaries: { es: 'Valida la forma y el dígito de control; no consulta los padrones de cada autoridad, así que no confirma que el identificador esté activo. Lo que no se puede demostrar mal no se bloquea: un falso rechazo dejaría a un negocio sin poder facturar ni cobrar.', en: 'It validates format and check digit; it doesn\'t query each authority\'s registry, so it doesn\'t confirm the ID is active. What can\'t be proven wrong isn\'t blocked: a false rejection would leave a business unable to invoice or collect.' },
        related: ['facturacion-internacional', 'configuracion-con-ia', 'cord-elements']
    },
    'impuestos-canada': {
        family: 'invoicing', market: { es: 'Canadá', en: 'Canada' },
        workflow: {
            es: ['Elige la provincia de tu negocio en Ajustes y el catálogo se siembra con sus tasas.', 'En cada línea eliges la tasa combinada, el GST solo o la HST de la provincia del cliente.', 'Cord calcula con una tasa por línea y muestra el GST y el impuesto provincial por separado en cada documento.'],
            en: ['Pick your business\'s province in Settings and the catalog is seeded with its rates.', 'On each line you choose the combined rate, GST alone or the HST of the customer\'s province.', 'Cord computes one rate per line and shows GST and the provincial tax separately on every document.']
        },
        scope: { es: 'Cotizaciones y facturas de negocios en Canadá, con catálogo sembrado por provincia y desglose en todos los documentos.', en: 'Quotes and invoices for businesses in Canada, with a catalog seeded by province and the breakdown on every document.' },
        boundaries: { es: 'Cord calcula con las tasas que eliges por línea; no determina por sí solo el lugar de suministro de cada venta. El sales tax por dirección del cliente es una capacidad de Estados Unidos.', en: 'Cord computes with the rates you choose per line; it doesn\'t determine the place of supply of each sale on its own. Sales tax by customer address is a United States capability.' },
        related: ['editor-cotizaciones', 'facturacion-internacional', 'iva-por-documento-chile']
    },
    'iva-por-documento-chile': {
        family: 'invoicing', market: { es: 'Chile', en: 'Chile' },
        workflow: {
            es: ['Capturas la cotización o la factura como en cualquier país.', 'Cord calcula el IVA sobre el neto total de cada tasa y lo reparte entre las líneas.', 'El documento guarda la regla con sus totales, y la factura electrónica del SII lleva ese mismo IVA.'],
            en: ['You enter the quote or invoice as in any other country.', 'Cord computes VAT on each rate\'s net total and splits it across the lines.', 'The document stores the rule with its totals, and the SII e-invoice carries that same VAT.']
        },
        scope: { es: 'Toda cuenta chilena, con o sin la factura electrónica del SII activa.', en: 'Every Chilean account, with or without the SII e-invoice turned on.' },
        boundaries: { es: 'Aplica solo a cuentas de Chile; el resto de los países redondea por línea, como validan sus autoridades. Con precio con IVA incluido, el total puede quedar a un peso de la suma capturada, como ya ocurría por línea.', en: 'It applies only to Chilean accounts; other countries round per line, as their authorities validate. With VAT-inclusive prices, the total can end up one peso off the entered sum, as already happened per line.' },
        related: ['sii-chile', 'editor-cotizaciones', 'facturacion-internacional']
    },
    'factura-electronica-europea': {
        family: 'invoicing', market: { es: 'Alemania, Francia y España', en: 'Germany, France and Spain' },
        workflow: {
            es: ['Completa en Ajustes › Perfil fiscal el contacto, la dirección electrónica y el formato del correo.', 'Al emitir, Cord arma la factura electrónica desde el documento congelado y comprueba cada total.', 'La descargas desde la factura o viaja en el correo; si algo no cuadra, ves qué falta y dónde corregirlo.'],
            en: ['In Settings › Tax profile, fill in the contact, the electronic address and the email format.', 'On issue, Cord builds the e-invoice from the frozen document and checks every total.', 'Download it from the invoice or send it with the email; if something doesn\'t add up, you see what\'s missing and where to fix it.']
        },
        scope: { es: 'Facturas y notas de crédito de emisores establecidos en Alemania y Francia; en España, sobre las facturas registradas con Verifactu.', en: 'Invoices and credit notes from issuers established in Germany and France; in Spain, on invoices registered with Verifactu.' },
        boundaries: { es: 'Solo para emisores de la Unión Europea y sobre facturas, no proformas. Las divisas con tres decimales y las facturas con retenciones fallan con su motivo. Cord no transmite por la red Peppol.', en: 'Only for EU issuers and on invoices, not pro formas. Currencies with three decimals and invoices with withholdings fail with their reason. Cord doesn\'t transmit over the Peppol network.' },
        related: ['facturae-espana', 'factura-electronica-francia', 'peppol-reino-unido']
    },
    'facturae-espana': {
        family: 'invoicing', market: { es: 'España', en: 'Spain' },
        workflow: {
            es: ['Elige Facturae como formato del correo en Ajustes › Perfil fiscal y, si quieres, activa la firma.', 'Al emitir una factura registrada con Verifactu, Cord arma la Facturae del documento congelado y comprueba los totales.', 'La descargas desde la factura o viaja adjunta en el correo, firmada o sin firmar.'],
            en: ['Choose Facturae as the email format in Settings › Tax profile and, if you want, turn on signing.', 'When an invoice registered with Verifactu is issued, Cord builds the Facturae from the frozen document and checks the totals.', 'Download it from the invoice or send it attached to the email, signed or unsigned.']
        },
        scope: { es: 'Facturas y notas de crédito de emisores establecidos en España, en euros, con IVA e IRPF.', en: 'Invoices and credit notes from issuers established in Spain, in euros, with VAT and IRPF.' },
        boundaries: { es: 'Cord genera y adjunta la Facturae; no la presenta en FACe ni captura los códigos DIR3 que exige la administración pública. Una retención distinta del IRPF falla con su motivo.', en: 'Cord generates and attaches the Facturae; it doesn\'t submit it to FACe or capture the DIR3 codes the public sector requires. A withholding other than IRPF fails with its reason.' },
        related: ['verifactu-espana', 'factura-electronica-europea', 'factura-b2b-espana']
    },
    'factura-electronica-francia': {
        family: 'invoicing', market: { es: 'Francia', en: 'France' },
        workflow: {
            es: ['El negocio completa su perfil fiscal: SIREN, régimen de TVA, opción por los débitos y naturaleza de sus productos.', 'Se da de alta en la plataforma desde Ajustes y firma su mandato.', 'Cord transmite, declara y comunica cobros con una cola que consulta antes de reenviar, y muestra cada estado en la factura.'],
            en: ['The business completes its tax profile: SIREN, VAT regime, option on debits and the nature of its products.', 'It signs up for the platform from Settings and signs its mandate.', 'Cord transmits, reports and communicates payments through a queue that queries before resending, and shows every status on the invoice.']
        },
        scope: { es: 'Negocios establecidos en Francia con el alta completada: facturas entre empresas por la plataforma, e-reporting de ventas internacionales y a particulares, y cobros cuando la TVA es exigible al cobro. Requiere un plan con emisión fiscal integrada.', en: 'Businesses established in France with onboarding completed: B2B invoices through the platform, e-reporting of international and consumer sales, and payments when VAT is due on receipt. Requires a plan with integrated tax issuance.' },
        boundaries: { es: 'Cord solo emite: no recibe facturas, así que el negocio necesita su propia plataforma de recepción. Una declaración del e-reporting no se corrige desde Cord, una factura transmitida se corrige con nota de crédito, y no se transmiten autofacturación, varios vendedores, anticipos ni régimen de margen.', en: 'Cord only issues: it doesn\'t receive invoices, so the business needs its own reception platform. An e-reporting declaration can\'t be corrected from Cord, a transmitted invoice is corrected with a credit note, and self-billing, multiple sellers, advances and the margin scheme are not transmitted.' },
        related: ['factura-electronica-europea', 'recepcion-facturas-proveedores', 'facturacion-internacional']
    },
    'arca-argentina': {
        family: 'invoicing', market: { es: 'Argentina', en: 'Argentina' },
        workflow: {
            es: ['El negocio crea en ARCA un punto de venta de web services y un certificado asociado a la factura electrónica.', 'En Ajustes sube el certificado y completa punto de venta, condición frente al IVA y concepto.', 'Al emitir, Cord pide el CAE, guarda la respuesta y, si no llega, consulta antes de reintentar.'],
            en: ['The business creates a web services point of sale in ARCA and a certificate linked to e-invoicing.', 'In Settings it uploads the certificate and fills in the point of sale, VAT status and concept.', 'On issue, Cord requests the CAE, stores the response and, if none arrives, queries before retrying.']
        },
        scope: { es: 'Negocios de Argentina con plan Starter o superior. Cada comprobante autorizado cuenta en la cuota de facturas con validez fiscal; los de homologación no.', en: 'Businesses in Argentina on Starter or higher. Each authorized document counts toward the tax-compliant invoice allowance; homologation documents don\'t.' },
        boundaries: { es: 'No emite Factura E de exportación, Factura de Crédito Electrónica MiPyME, comprobantes M ni CAEA, ni a receptores no categorizados, y no informa retenciones, percepciones ni otros tributos: esos casos se rechazan antes de pedir el CAE.', en: 'It doesn\'t issue export type E invoices, MiPyME Electronic Credit Invoices, type M documents or CAEA, nor to uncategorized recipients, and it doesn\'t report withholdings, perceptions or other levies: those cases are rejected before requesting the CAE.' },
        related: ['facturacion-internacional', 'identificador-fiscal', 'facturas-emitidas']
    },
    'factura-electronica-brasil': {
        family: 'invoicing', market: { es: 'Brasil', en: 'Brazil' },
        workflow: {
            es: ['El negocio sube su certificado A1 y completa municipio, serie, régimen y los datos fiscales de sus productos.', 'Cord decide si el documento es NFS-e o NF-e según los conceptos y lo envía a la autoridad que corresponde.', 'Guarda el XML autorizado, imprime el documento y, si la respuesta se pierde, consulta antes de reintentar.'],
            en: ['The business uploads its A1 certificate and fills in municipality, series, regime and its products\' tax data.', 'Cord decides whether the document is an NFS-e or an NF-e from the line items and sends it to the right authority.', 'It stores the authorized XML, prints the document and, if the response is lost, queries before retrying.']
        },
        scope: { es: 'Negocios de Brasil con plan Starter o superior, con su municipio adherido a la NFS-e nacional o habilitados como emisores de NF-e ante la SEFAZ de su estado. Cada nota autorizada cuenta en la cuota de facturas con validez fiscal; las de homologación no.', en: 'Businesses in Brazil on Starter or higher, with their municipality on the national NFS-e or enabled as NF-e issuers with their state\'s SEFAZ. Each authorized note counts toward the tax-compliant invoice allowance; homologation notes don\'t.' },
        boundaries: { es: 'No emite exportación, moneda extranjera, sustitución tributaria, DIFAL, devolución de mercancía ni retenciones federales. La NF-e del Simples Nacional exige IBS/CBS desde el 4 de enero de 2027, y Cord no la emitirá mientras sus reglas no estén publicadas.', en: 'It doesn\'t issue exports, foreign currency, tax substitution, DIFAL, returns of goods or federal withholdings. The Simples Nacional NF-e requires IBS/CBS from January 4, 2027, and Cord won\'t issue it until its rules are published.' },
        related: ['nfe-devolucion-brasil', 'facturacion-internacional', 'identificador-fiscal']
    },
    'sii-chile': {
        family: 'invoicing', market: { es: 'Chile', en: 'Chile' },
        workflow: {
            es: ['El negocio registra su certificado ante el SII, postula como emisor y sube sus folios.', 'Completa la certificación del SII desde Ajustes: set de pruebas, libros, intercambio y muestras impresas.', 'Con la resolución, emite: Cord timbra, envía, consulta el veredicto e imprime el documento con su copia cedible.'],
            en: ['The business registers its certificate with the SII, applies as an issuer and uploads its folios.', 'It completes the SII certification from Settings: test set, ledgers, exchange and printed samples.', 'With the resolution, it issues: Cord stamps, sends, checks the verdict and prints the document with its assignable copy.']
        },
        scope: { es: 'Negocios de Chile con plan Starter o superior, certificados como emisores ante el SII. Cada documento aceptado cuenta en la cuota de facturas con validez fiscal; los de certificación no.', en: 'Businesses in Chile on Starter or higher, certified as issuers with the SII. Each accepted document counts toward the tax-compliant invoice allowance; certification documents don\'t.' },
        boundaries: { es: 'No emite boleta, factura de exportación, guía de despacho, factura de compra ni boleta de honorarios, ni documentos con retenciones: se rechazan antes de tomar folio. Los montos van en pesos chilenos.', en: 'It doesn\'t issue receipts, export invoices, dispatch guides, purchase invoices or fee receipts, nor documents with withholdings: they are rejected before a folio is taken. Amounts are in Chilean pesos.' },
        related: ['iva-por-documento-chile', 'guia-despacho-chile', 'recepcion-facturas-proveedores']
    },
    'dian-colombia': {
        family: 'invoicing', market: { es: 'Colombia', en: 'Colombia' },
        workflow: {
            es: ['El negocio se habilita en el portal de la DIAN como software propio y recibe su set de pruebas.', 'En Ajustes carga sus datos, su certificado y el rango de pruebas, y envía el set desde Cord.', 'Superado el set y asociada su resolución, emite: Cord firma, envía, recibe la validación y entrega el documento.'],
            en: ['The business enables itself on the DIAN portal as in-house software and receives its test set.', 'In Settings it loads its details, certificate and test range, and sends the set from Cord.', 'Once the set is passed and its resolution is linked, it issues: Cord signs, sends, receives the validation and delivers the document.']
        },
        scope: { es: 'Negocios de Colombia con plan Starter o superior, habilitados ante la DIAN con software propio. Cada documento validado cuenta en la cuota de facturas con validez fiscal; los de habilitación no.', en: 'Businesses in Colombia on Starter or higher, enabled with the DIAN as in-house software. Each validated document counts toward the tax-compliant invoice allowance; enablement documents don\'t.' },
        boundaries: { es: 'No emite factura de exportación, contingencia, documento soporte, nómina electrónica ni eventos RADIAN, ni informa INC, ICUI, ICA o AIU: esos casos se rechazan antes de enviar.', en: 'It doesn\'t issue export invoices, contingency invoices, support documents, electronic payroll or RADIAN events, nor report INC, ICUI, ICA or AIU: those cases are rejected before sending.' },
        related: ['radian-colombia', 'facturacion-internacional', 'identificador-fiscal']
    },
    'sunat-peru': {
        family: 'invoicing', market: { es: 'Perú', en: 'Peru' },
        workflow: {
            es: ['El negocio se afilia como emisor desde sus sistemas, registra su certificado y crea un usuario SOL secundario.', 'En Ajustes sube el certificado y el usuario, y elige serie y afectación del IGV.', 'Al emitir, Cord firma, envía, guarda la constancia de SUNAT y, si la respuesta se pierde, consulta antes de reintentar.'],
            en: ['The business enrolls as an issuer from its own systems, registers its certificate and creates a secondary SOL user.', 'In Settings it uploads the certificate and user, and chooses the series and IGV treatment.', 'On issue, Cord signs, sends, keeps SUNAT\'s receipt and, if the response is lost, queries before retrying.']
        },
        scope: { es: 'Negocios de Perú con plan Starter o superior, afiliados como emisores electrónicos desde sus sistemas. Cada comprobante aceptado cuenta en la cuota de facturas con validez fiscal; los del servicio beta no.', en: 'Businesses in Peru on Starter or higher, enrolled as electronic issuers from their own systems. Each accepted document counts toward the tax-compliant invoice allowance; beta service documents don\'t.' },
        boundaries: { es: 'No emite boleta ni resumen diario, nota de débito, detracciones, percepciones, anticipos, operaciones gratuitas, ISC, ICBPER, IVAP, varias cuotas ni guía de remisión. Un comprobante aceptado no se anula: se compensa con nota de crédito.', en: 'It doesn\'t issue receipts or the daily summary, debit notes, detracciones, perceptions, advances, free transfers, ISC, ICBPER, IVAP, multiple installments or remission guides. An accepted document isn\'t voided: it is offset with a credit note.' },
        related: ['boleta-peru', 'facturacion-internacional', 'identificador-fiscal']
    },
    'sales-tax-estados-unidos': {
        family: 'invoicing', market: { es: 'Estados Unidos', en: 'United States' },
        workflow: {
            es: ['Configura domicilio, qué vendes y los estados donde recaudas en Ajustes › Impuestos.', 'Al guardar una cotización o factura, Cord calcula la tasa por la dirección del cliente y congela el desglose por jurisdicción.', 'Al emitirse la factura o cobrarse la cotización, registra la venta una sola vez.'],
            en: ['Set your address, what you sell and the states where you collect in Settings › Taxes.', 'When a quote or invoice is saved, Cord calculates the rate for the customer\'s address and freezes the breakdown by jurisdiction.', 'When the invoice is issued or the quote is paid, it records the sale once.']
        },
        scope: { es: 'Negocios de Estados Unidos con plan Starter o superior y Cord Payments activo, para clientes con dirección en Estados Unidos.', en: 'US businesses on Starter or higher with Cord Payments active, for customers with a US address.' },
        boundaries: { es: 'Cord calcula con los registros que declara el negocio: no decide dónde debe registrarse ni presenta las declaraciones. Una nota de crédito no revierte la venta en parte, la clasificación es una por negocio y no por producto, y los reportes para declarar todavía no se exponen.', en: 'Cord calculates with the registrations the business declares: it doesn\'t decide where to register or file the returns. A credit note doesn\'t partially reverse the sale, classification is one per business rather than per product, and filing reports aren\'t exposed yet.' },
        related: ['editor-cotizaciones', 'cord-payments', 'facturacion-internacional']
    },
    'factura-b2b-espana': {
        family: 'invoicing', market: { es: 'España', en: 'Spain' },
        workflow: {
            es: ['La factura a un cliente empresario establecido en España se encola al emitirse.', 'Cord la envía a la solución pública de la AEAT con el certificado del negocio y, si no hay respuesta, consulta antes de reenviar.', 'Comunica el cobro o el impago a partir de los pagos conciliados y muestra lo que informe el cliente.'],
            en: ['An invoice to a business customer established in Spain is queued when issued.', 'Cord sends it to the AEAT\'s public solution with the business\'s certificate and, if there is no response, queries before resending.', 'It reports payment or non-payment from reconciled payments and shows what the customer reports.']
        },
        scope: { es: 'Facturas de emisores en España a clientes empresarios o profesionales establecidos en España, enviadas en nombre propio con el certificado del negocio.', en: 'Invoices from issuers in Spain to business or professional customers established in Spain, sent in the business\'s own name with its certificate.' },
        boundaries: { es: 'No aplica a clientes extranjeros ni a facturas simplificadas. País Vasco y Navarra dependen de acuerdos con sus Haciendas forales todavía sin publicar, y una factura con IRPF se entrega como Facturae mientras la AEAT no publique cómo declararlo.', en: 'It doesn\'t apply to foreign customers or simplified invoices. The Basque Country and Navarre depend on agreements with their regional tax authorities that aren\'t published yet, and an invoice with IRPF is delivered as Facturae until the AEAT publishes how to declare it.' },
        related: ['verifactu-espana', 'facturae-espana', 'recepcion-facturas-proveedores']
    },
    'peppol-reino-unido': {
        family: 'invoicing', market: { es: 'Reino Unido', en: 'United Kingdom' },
        workflow: {
            es: ['HMRC publica la hoja de ruta y las especificaciones técnicas.', 'Cord adapta la factura Peppol al emisor británico y suma el envío por un punto de acceso de la red.', 'El negocio activa el envío y cada factura viaja al sistema de su cliente.'],
            en: ['HMRC publishes the roadmap and technical specifications.', 'Cord adapts the Peppol invoice to UK issuers and adds sending through a network access point.', 'The business turns on sending and each invoice travels to its customer\'s system.']
        },
        scope: { es: 'Negocios del Reino Unido registrados para el IVA, en sus facturas a otras empresas y al sector público.', en: 'VAT-registered businesses in the United Kingdom, on their invoices to other businesses and the public sector.' },
        boundaries: { es: 'Según HMRC, quien no está registrado para el IVA queda fuera. Hasta que exista el riel, un negocio británico emite la factura comercial de Cord con su PDF.', en: 'According to HMRC, businesses not registered for VAT are out of scope. Until the rail exists, a UK business issues the Cord commercial invoice with its PDF.' },
        related: ['factura-electronica-europea', 'identificador-fiscal', 'facturacion-internacional']
    },
    'boleta-peru': {
        family: 'invoicing', market: { es: 'Perú', en: 'Peru' },
        workflow: {
            es: ['La venta a un cliente sin RUC genera una boleta.', 'Cord la incluye en el resumen diario y consulta el ticket hasta conocer el resultado.', 'La boleta aceptada se imprime y se entrega como cualquier comprobante.'],
            en: ['A sale to a customer without a RUC produces a receipt.', 'Cord includes it in the daily summary and checks the ticket until the result is known.', 'The accepted receipt is printed and delivered like any other document.']
        },
        scope: { es: 'Negocios de Perú con la factura electrónica de SUNAT activa.', en: 'Businesses in Peru with SUNAT e-invoicing active.' },
        boundaries: { es: 'Mientras tanto, una venta a un cliente sin RUC se rechaza antes de enviar, con un mensaje que lo explica, y Cord no emite una boleta a medias.', en: 'Meanwhile, a sale to a customer without a RUC is rejected before sending, with a message that explains why, and Cord never issues a half-built receipt.' },
        related: ['sunat-peru', 'facturacion-internacional', 'facturas-emitidas']
    },
    'nfe-devolucion-brasil': {
        family: 'invoicing', market: { es: 'Brasil', en: 'Brazil' },
        workflow: {
            es: ['El producto y el cliente declaran el régimen, el estado y el tratamiento del ICMS.', 'Cord calcula la ST, el DIFAL o el IBS/CBS según las reglas publicadas.', 'La NF-e se autoriza ante la SEFAZ como cualquier otra, y la devolución referencia la nota original.'],
            en: ['The product and the customer declare the regime, state and ICMS treatment.', 'Cord computes ST, DIFAL or IBS/CBS according to the published rules.', 'The NF-e is authorized with the SEFAZ like any other, and the return references the original note.']
        },
        scope: { es: 'Negocios de Brasil que venden mercancías con la NF-e.', en: 'Businesses in Brazil selling goods with the NF-e.' },
        boundaries: { es: 'Hasta entonces, esos casos se rechazan antes de numerar: ningún número se consume en un documento que no se puede emitir bien.', en: 'Until then, those cases are rejected before a number is assigned: no number is used up on a document that can\'t be issued correctly.' },
        related: ['factura-electronica-brasil', 'facturacion-internacional', 'facturas-emitidas']
    },
    'guia-despacho-chile': {
        family: 'invoicing', market: { es: 'Chile', en: 'Chile' },
        workflow: {
            es: ['El negocio sube los folios del nuevo tipo de documento.', 'Cord arma, timbra y envía el documento como las facturas, y lo incluye en la certificación si el negocio lo postuló.', 'El PDF sigue el manual de muestras impresas del SII.'],
            en: ['The business uploads the folios for the new document type.', 'Cord builds, stamps and sends the document like invoices, and includes it in the certification if the business applied for it.', 'The PDF follows the SII\'s printed samples manual.']
        },
        scope: { es: 'Negocios de Chile con los documentos del SII activos.', en: 'Businesses in Chile with the SII documents active.' },
        boundaries: { es: 'Mientras tanto, una venta que necesita uno de estos documentos (cliente sin RUT, cliente extranjero, retención) se rechaza antes de tomar folio.', en: 'Meanwhile, a sale that needs one of these documents (customer without a RUT, foreign customer, withholding) is rejected before a folio is taken.' },
        related: ['sii-chile', 'iva-por-documento-chile', 'facturacion-internacional']
    },
    'radian-colombia': {
        family: 'invoicing', market: { es: 'Colombia', en: 'Colombia' },
        workflow: {
            es: ['El negocio emite o recibe el documento desde Cord.', 'Cord lo arma según el Anexo Técnico, lo firma y lo envía a la DIAN.', 'La respuesta de la DIAN queda con el documento y su evento.'],
            en: ['The business issues or receives the document from Cord.', 'Cord builds it per the Technical Annex, signs it and sends it to the DIAN.', 'The DIAN\'s response stays with the document and its event.']
        },
        scope: { es: 'Negocios de Colombia con la factura electrónica de la DIAN activa.', en: 'Businesses in Colombia with DIAN e-invoicing active.' },
        boundaries: { es: 'Mientras tanto, esos casos se rechazan o se advierten antes de enviar, sin consumir un número de la resolución.', en: 'Meanwhile, those cases are rejected or flagged before sending, without using up a number from the resolution.' },
        related: ['dian-colombia', 'recepcion-facturas-proveedores', 'facturacion-internacional']
    },
    'recepcion-facturas-proveedores': {
        family: 'invoicing', market: { es: 'Mercados con factura electrónica obligatoria', en: 'Markets with mandatory e-invoicing' },
        workflow: {
            es: ['La factura del proveedor llega a la casilla o a la dirección electrónica del negocio.', 'Cord la valida, la muestra con su estado y la conserva.', 'El negocio la acepta o la rechaza, y Cord comunica esa decisión en los plazos del país.'],
            en: ['The supplier\'s invoice arrives at the business\'s mailbox or electronic address.', 'Cord validates it, shows it with its status and keeps it.', 'The business accepts or rejects it, and Cord reports that decision on the country\'s deadlines.']
        },
        scope: { es: 'Iniciativa futura para las facturas recibidas de proveedores en los países que obligan a recibirlas. Hoy existe en Chile, dentro del intercambio del SII.', en: 'Future initiative for invoices received from suppliers in countries that require receiving them. Today it exists in Chile, within the SII exchange.' },
        boundaries: { es: 'Cord no registra una dirección de recepción en nombre del negocio ni acepta o rechaza una factura sin una decisión explícita de una persona.', en: 'Cord never registers a reception address on the business\'s behalf, nor accepts or rejects an invoice without a person\'s explicit decision.' },
        related: ['factura-electronica-francia', 'sii-chile', 'factura-b2b-espana']
    },
    'tareas-y-seguimiento': {
        family: 'quotes', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Captura la tarea con fecha, prioridad y responsable, o deja que un workflow, la API o un contracargo la cree.', 'El equipo la ve agrupada por urgencia en el Inicio y en Tareas, y la completa, pospone o reasigna sin recargar.', 'Cada mañana, cada responsable recibe un correo con lo de hoy y lo vencido.'],
            en: ['Capture the task with a date, priority and owner, or let a workflow, the API or a chargeback create it.', 'The team sees it grouped by urgency on Home and in Tasks, and completes, snoozes or reassigns it without reloading.', 'Every morning, each owner gets an email with what is due today and overdue.']
        },
        scope: { es: 'Tareas con responsable, prioridad, notas y fecha en el día civil del negocio; página propia con filtros y completadas, contador en el menú lateral y recordatorio diario por correo con opción de apagarlo.', en: 'Tasks with owner, priority, notes and a due date on the business\'s calendar day; their own page with filters and completed tasks, a sidebar counter and a daily email reminder that can be turned off.' },
        boundaries: { es: 'El recordatorio es un correo por persona al día, sin aviso por Slack ni Teams. La API crea tareas, pero asignarlas, completarlas y borrarlas se hace en la app. Eliminar una tarea no se puede deshacer.', en: 'The reminder is one email per person per day, with no Slack or Teams alert. The API creates tasks, but assigning, completing and deleting them happens in the app. Deleting a task cannot be undone.' },
        related: ['seguimiento-vivo', 'notificaciones', 'integraciones-y-flujos']
    },
    'notificaciones': {
        family: 'quotes', market: { es: 'Correo, Slack y Teams', en: 'Email, Slack and Teams' },
        workflow: {
            es: ['Elige canal y evento en Ajustes.', 'Cord guarda la matriz de preferencias al cambiar cada opción.', 'Cuando ocurre una vista, aprobación, rechazo o pago, envía solo los avisos activados.'],
            en: ['Choose channel and event in Settings.', 'Cord saves the preference matrix as each option changes.', 'When a view, approval, rejection, or payment occurs, it sends only enabled alerts.']
        },
        scope: { es: 'Siete clases de evento por correo, Slack y Microsoft Teams, con folio, cliente, total y enlace cuando el canal permite ese contexto, más el recordatorio diario de tareas por correo a cada responsable.', en: 'Seven event classes across email, Slack, and Microsoft Teams, with number, customer, total, and link when the channel supports that context, plus the daily task reminder email to each assignee.' },
        boundaries: { es: 'Slack se conecta con Añadir a Slack o un webhook propio; Teams, con tu cuenta de Microsoft o un flujo de Power Automate del canal. Cord no publica eventos desactivados ni sustituye el historial interno por mensajes externos.', en: 'Slack connects with Add to Slack or your own webhook; Teams, with your Microsoft account or the channel\'s Power Automate flow. Cord does not publish disabled events or replace internal history with external messages.' },
        related: ['seguimiento-vivo', 'tareas-y-seguimiento', 'integraciones-y-flujos']
    },
    'facturas-emitidas': {
        family: 'invoicing', market: { es: '12 mercados soportados', en: '12 supported markets' },
        workflow: {
            es: ['Crea un borrador desde cero o desde una cotización aprobada.', 'Revisa y emite por el carril fiscal o comercial que corresponda.', 'Entrega el link, registra pagos y sigue saldo, actividad, recurrencia y documentos.'],
            en: ['Create a draft from scratch or from an approved quote.', 'Review and issue through the applicable fiscal or commercial rail.', 'Deliver the link and track payments, balance, activity, recurrence, and files.']
        },
        scope: { es: 'Bandeja completa de facturas con borradores, folios, emisión, actividad, pago manual o en línea, recordatorios con calendario propio, exportación y automatización por API y MCP.', en: 'Complete invoice inbox with drafts, numbering, issuance, activity, manual or online payment, reminders on your own schedule, export, and automation through API and MCP.' },
        boundaries: { es: 'El documento fiscal depende del país y de la configuración real. Cord Invoicing no transforma una factura comercial en clearance local cuando ese proveedor regulatorio no existe.', en: 'The fiscal document depends on the country and actual configuration. Cord Invoicing does not turn a commercial invoice into local clearance where no regulatory provider exists.' },
        related: ['facturacion-internacional', 'portal-del-cliente', 'cord-payments']
    },
    'integraciones-y-flujos': {
        family: 'platform', market: { es: 'Plataforma Cord', en: 'Cord platform' },
        workflow: {
            es: ['Elige el evento de Cord que arranca el workflow y define condiciones visibles.', 'Encadena acciones —tarea, correo al equipo, Slack o nota en HubSpot— y publícalo cuando esté listo.', 'Revisa cada ejecución, su resultado y el error legible cuando un paso falla.'],
            en: ['Pick the Cord event that starts the workflow and set visible conditions.', 'Chain actions — task, team email, Slack or a HubSpot note — and publish when ready.', 'Review every run, its result, and the readable error when a step fails.']
        },
        scope: { es: 'Workflows sobre los eventos de Cord y sobre un horario fijo, con consultas, esperas condicionadas y prueba sin publicar; directorio de integraciones con HubSpot, Shopify, Gmail, Google Sheets, Excel, QuickBooks, Xero, Slack, Teams y WhatsApp; apps de Zapier y Make y nodo de n8n; y la plataforma para desarrolladores: API v1, webhooks firmados y MCP.', en: 'Workflows on Cord events and on a fixed schedule, with lookups, conditional waits and a test run before publishing; an integrations directory with HubSpot, Shopify, Gmail, Google Sheets, Excel, QuickBooks, Xero, Slack, Teams and WhatsApp; Zapier and Make apps and an n8n node; and the developer platform: API v1, signed webhooks and MCP.' },
        boundaries: { es: 'Un workflow no cobra ni emite facturas: esas siguen siendo decisiones de una persona. Cuando le escribe al cliente, lo hace con tu marca o, por WhatsApp, con tu plantilla aprobada por Meta. Las esperas se cuentan en días y la entrega es al menos una vez, así que cada paso queda en el historial.', en: 'A workflow never charges or issues invoices: those stay human decisions. When it writes to the client, it does so with your branding or, on WhatsApp, with your Meta-approved template. Waits are counted in days and delivery is at least once, so every step stays in the history.' },
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
