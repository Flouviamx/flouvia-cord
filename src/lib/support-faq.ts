// FAQ del hub de soporte (/soporte, /en/support) — fuente única compartida
// entre SupportCards.astro (renderizado visible) y soporte.astro (FAQPage
// JSON-LD), para que el schema siempre coincida con el texto visible.
export interface SupportFaq { q: string; a: string; }

export const SUPPORT_FAQ_ES: SupportFaq[] = [
    { q: "¿Cuándo se deposita el dinero en mi cuenta?", a: "Los pagos procesados con tarjeta se depositan en tu cuenta bancaria configurada en un plazo de T+3 a T+7 días naturales, según el calendario de depósitos de Cord Pagos." },
    { q: "¿Cómo cancelo una factura (CFDI)?", a: "Ve a la sección de Facturación en tu portal, busca la factura emitida, selecciona 'Opciones' y haz clic en 'Generar Egreso (Nota de Crédito)'. Cord vinculará automáticamente el UUID padre." },
    { q: "¿Puedo cobrar en dólares (USD)?", a: "Sí. Cord te permite emitir cotizaciones en USD. La disponibilidad del cobro y la conversión depende de la moneda habilitada en tu cuenta de pagos." },
    { q: "¿Qué pasa si un cliente no paga a tiempo?", a: "Cord enviará recordatorios automáticos según la configuración de tu cuenta y, si configuraste el interés moratorio, lo calculará sobre el saldo vencido." },
    { q: "¿Cord cobra comisiones por transacción?", a: "Cord Pagos cobra una tarifa transparente por método, más IVA. La ves y aceptas antes de activarla; el dinero del cliente sigue llegando directo a tu cuenta." },
    { q: "¿Dónde encuentro mis API Keys?", a: "Puedes encontrar tus llaves (Test y Live) en Ajustes > Desarrolladores > Claves de API. Las llaves live están disponibles en todos los planes, incluido el Gratis — cada plan solo tiene un límite distinto de llaves (Gratis: 2, Developer: 200)." },
];

export const SUPPORT_FAQ_EN: SupportFaq[] = [
    { q: "When is the money deposited into my account?", a: "Card payments are deposited into your configured bank account within T+3 to T+7 calendar days, depending on your Cord Payments payout schedule." },
    { q: "How do I cancel an invoice (CFDI)?", a: "Go to the Billing section in your portal, find the issued invoice, select 'Options' and click 'Generate Expense (Credit Note)'. Cord will automatically link the parent UUID." },
    { q: "Can I charge in dollars (USD)?", a: "Yes. Cord lets you issue quotes in USD. Payment and conversion availability depends on the currencies enabled for your payments account." },
    { q: "What happens if a client doesn't pay on time?", a: "Cord will send automatic reminders based on your account settings, and if you configured late fees, it will calculate them on the overdue balance." },
    { q: "Does Cord charge transaction fees?", a: "Cord Payments charges a transparent method-specific fee, plus tax. You see and accept it before activation, while customer funds continue to settle directly into your account." },
    { q: "Where can I find my API Keys?", a: "You can find your keys (Test and Live) in Settings > Developers > API Keys. Live keys are available on every plan, including Free — each plan just has a different key limit (Free: 2, Developer: 200)." },
];
