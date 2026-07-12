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
- **Descuentos por partida o globales:** Ideal para negociaciones B2B donde el volumen dicta el precio.
- **Guardado automático:** Crea borradores sin perder información.`,
            en: `## Total control over your proposals
Cord's quote editor is designed to give you agility without losing control. You don't need to jump between Excel sheets and PDF formats. From a single screen, you can search for products in your catalog, adjust quantities, and see how the price changes in real-time.

### Key benefits:
- **Live tax calculation:** Apply VAT or other withholdings and view the final total before sending the quote.
- **Line-item or global discounts:** Ideal for B2B negotiations where volume dictates the price.
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
            es: 'Embebe nuestro motor de cotizaciones directamente en el portal de tu empresa o sitio web B2B. Tus clientes cotizan solos desde tu propio entorno.',
            en: 'Embed our quoting engine directly into your company portal or B2B website. Let your clients build quotes on their own.'
        },
        content: {
            es: `## Cotizaciones en piloto automático
Con Cord Elements, puedes ofrecer una experiencia de "autoservicio" a tus clientes mayoristas recurrentes. Al integrar unas pocas líneas de código en tu portal existente o sitio B2B, habilitas un carrito de compras especializado para tratos comerciales complejos.

### Beneficios clave:
- **Menor carga operativa:** Tus agentes de ventas no tienen que armar cotizaciones repetitivas para clientes habituales.
- **Precios dinámicos respetados:** Elements lee la lista de precios específica asignada a ese cliente y muestra sus descuentos negociados automáticamente.
- **UI personalizable:** Los componentes se mimetizan con el diseño de tu sitio web para una experiencia de marca unificada.`,
            en: `## Quotes on autopilot
With Cord Elements, you can offer a "self-service" experience to your recurring wholesale clients. By embedding a few lines of code into your existing portal or B2B site, you enable a specialized shopping cart for complex commercial deals.

### Key benefits:
- **Lower operational load:** Your sales agents don't have to build repetitive quotes for regular clients.
- **Dynamic pricing respected:** Elements reads the specific price list assigned to that client and automatically displays their negotiated discounts.
- **Customizable UI:** The components blend with your website's design for a unified brand experience.`
        },
        area: 'cotizaciones',
        status: 'beta',
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
Vender a crédito en B2B es estándar, pero controlar ese riesgo suele requerir comunicación manual constante entre el equipo de ventas y el equipo de finanzas. Cord automatiza estas reglas.

### Beneficios clave:
- **Límites de crédito duros:** Si un cliente tiene un límite de $100,000 MXN y ya tiene deuda por $95,000, un agente no podrá aprobarle una cotización de $10,000.
- **Términos Net 30/60:** Al aprobar la cotización, Cord programa automáticamente la fecha de vencimiento y el ciclo de cobranza.
- **Autonomía para ventas:** Los agentes pueden vender libremente siempre que el cliente esté al corriente, sin fricción ni autorizaciones manuales.`,
            en: `## Automated risk control
Selling on credit in B2B is standard, but controlling that risk usually requires constant manual communication between sales and finance teams. Cord automates these rules.

### Key benefits:
- **Hard credit limits:** If a client has a $100,000 MXN limit and already owes $95,000, an agent won't be able to approve a $10,000 quote for them.
- **Net 30/60 Terms:** Upon approving the quote, Cord automatically schedules the due date and the collections cycle.
- **Autonomy for sales:** Agents can sell freely as long as the client is in good standing, without friction or manual authorizations.`
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
            es: 'Cotiza en dólares, cobra en pesos. Tipo de cambio actualizado en tiempo real según el Banco de México (Banxico). Protégete de la volatilidad cambiaria.',
            en: 'Quote in USD, charge in MXN. Exchange rates updated in real-time based on the Central Bank (Banxico). Protect your margins from volatility.'
        },
        content: {
            es: `## Operaciones transfronterizas fluidas
Muchos distribuidores en México compran su inventario en dólares pero venden a sus clientes finales en pesos. La volatilidad del tipo de cambio (FX) puede destruir los márgenes si las cotizaciones no se actualizan rápido.

### Beneficios clave:
- **Sincronización Banxico:** El tipo de cambio se actualiza automáticamente según la tasa oficial del día.
- **Flexibilidad al timbrar:** Genera la cotización en USD para fijar el valor comercial, pero emite el CFDI 4.0 y realiza el cobro en MXN usando la tasa del momento del pago.
- **Protección de márgenes:** Evita pérdidas por fluctuaciones cambiarias en cotizaciones que tardan días en aprobarse.`,
            en: `## Seamless cross-border operations
Many distributors in Mexico buy inventory in dollars but sell to end clients in pesos. Exchange rate volatility (FX) can destroy margins if quotes aren't updated quickly.

### Key benefits:
- **Banxico synchronization:** The exchange rate updates automatically based on the official daily rate.
- **Flexible stamping:** Generate the quote in USD to fix the commercial value, but issue the CFDI 4.0 and collect payment in MXN using the rate at the time of payment.
- **Margin protection:** Prevent losses from currency fluctuations on quotes that take days to get approved.`
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
            es: `## Cobra como realmente operas en B2B
No todas las ventas se pagan de una sola vez. Muchos negocios cobran un porcentaje por adelantado para arrancar el pedido y el resto contra entrega. Cord lo hace nativo.

### Beneficios clave:
- **% de anticipo por cotización o por default:** Define un anticipo (ej. 50%) en el editor, o configúralo como default de tu negocio para que se pre-llene solo. El editor te muestra en vivo cuánto paga tu cliente al aprobar y cuánto queda de saldo.
- **Desglose claro para el cliente:** El link público muestra "total $X · hoy pagas $Y de anticipo, saldo $Z". Nada de sorpresas.
- **El pago se abre cuando tiene sentido:** Una cotización a contado se paga de inmediato; una a crédito (Net 30/60) no pide dinero hasta que llega la fecha de vencimiento. El anticipo, si lo hay, siempre es pagable al aprobar.
- **Cada parte, un cobro real:** Anticipo, saldo y cuotas son cobros independientes con su propio link, cada uno directo a tu banco vía Stripe. La cotización se marca pagada solo cuando no queda ningún cobro pendiente.`,
            en: `## Charge the way B2B actually works
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
            es: 'Timbrado CFDI 4.0 automático',
            en: 'Automated CFDI 4.0 Stamping'
        },
        shortDesc: {
            es: 'Directo al SAT. Cuando una cotización es aprobada, se convierte en pedido y se timbra la factura PUE o PPD con su respectivo complemento de pago.',
            en: 'Directly to the SAT. When a quote is approved, it becomes an order and the PUE or PPD invoice is stamped automatically. No retyping required.'
        },
        content: {
            es: `## Facturación B2B invisible
La facturación electrónica en México (CFDI 4.0) puede ser un dolor de cabeza administrativo. En Cord, hemos integrado el timbrado directamente en el flujo de ventas para que ocurra mágicamente en segundo plano.

### Beneficios clave:
- **Cero recaptura:** Todo lo que se negoció en la cotización (clave de producto SAT, unidades, impuestos) se transfiere directamente a la factura.
- **Timbrado PUE automático:** Si el trato fue de contado, al aprobarse la cotización se emite un CFDI de Ingreso PUE sin recapturar nada. Para ventas a crédito (Net 30) marcamos la cotización como PPD; el Complemento de Recepción de Pagos (REP) automático está en nuestro roadmap.
- **Almacenamiento seguro XML/PDF:** Todos tus comprobantes fiscales se resguardan en la nube, accesibles tanto para ti como para tu cliente desde su portal.`,
            en: `## Invisible B2B invoicing
Electronic invoicing in Mexico (CFDI 4.0) can be an administrative headache. In Cord, we have integrated stamping directly into the sales flow so it happens magically in the background.

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
            es: 'Facturación internacional',
            en: 'International Invoicing'
        },
        shortDesc: {
            es: 'Emite facturas de comercio exterior con cumplimiento de regulaciones locales para ventas transfronterizas. Arquitectura fiscal preparada para escala global.',
            en: 'Issue foreign trade invoices with local compliance regulations for sales in the US and Latin America. Global tax architecture.'
        },
        content: {
            es: `## Expande tus fronteras
Vender a otros países desde México requiere procesos fiscales muy específicos, como el Complemento de Comercio Exterior (CCE) o el uso de facturas proforma para aduanas. Cord simplifica estas complejidades.

### Beneficios clave:
- **CFDI de Exportación:** Emite comprobantes con las claves requeridas para exportación definitiva o temporal.
- **Idiomas duales:** Genera la representación impresa (PDF) en inglés y español para que tanto la autoridad mexicana como tu cliente en Estados Unidos puedan comprender el documento.
- **Integración logística:** Conecta el valor de la mercancía con la carta porte para un despacho aduanal sin demoras.`,
            en: `## Expand your borders
Selling to other countries from Mexico requires highly specific tax processes, such as the Foreign Trade Complement (CCE) or using proforma invoices for customs. Cord simplifies these complexities.

### Key benefits:
- **Export CFDI:** Issue receipts with the required codes for definitive or temporary export.
- **Dual languages:** Generate the printed representation (PDF) in both English and Spanish so both the Mexican authority and your US client can understand the document.
- **Logistics integration:** Connect the value of the merchandise with the waybill (Carta Porte) for delay-free customs clearance.`
        },
        area: 'fiscal',
        status: 'next',
        api: true
    }
];
