// FAQ del hub de soporte (/soporte, /en/support) — fuente única compartida
// entre SupportCards.astro (renderizado visible) y soporte.astro (FAQPage
// JSON-LD), para que el schema siempre coincida con el texto visible.
export interface SupportFaq { q: string; a: string; }

export const SUPPORT_FAQ_ES: SupportFaq[] = [
    { q: "¿Cuándo se deposita el dinero en mi cuenta?", a: "Los pagos procesados con tarjeta se depositan en tu cuenta bancaria configurada en un plazo de T+3 a T+7 días naturales, dependiendo del calendario Payout de tu cuenta conectada de Stripe." },
    { q: "¿Cómo cancelo una factura (CFDI)?", a: "Ve a la sección de Facturación en tu portal, busca la factura emitida, selecciona 'Opciones' y haz clic en 'Generar Egreso (Nota de Crédito)'. Cord vinculará automáticamente el UUID padre." },
    { q: "¿Puedo cobrar en dólares (USD)?", a: "Sí. Cord te permite emitir cotizaciones en USD. Stripe se encargará de hacer la conversión cambiaria si tu cuenta destino está en pesos." },
    { q: "¿Qué pasa si un cliente no paga a tiempo?", a: "Cord enviará recordatorios automáticos según la configuración de tu cuenta y, si configuraste el interés moratorio, lo calculará sobre el saldo vencido." },
    { q: "¿Cord cobra comisiones por transacción?", a: "No. Cord es una plataforma SaaS y solo pagas tu mensualidad. Los cobros con tarjeta generan la comisión estándar directa de Stripe, sin intermediarios." },
    { q: "¿Dónde encuentro mis API Keys?", a: "Puedes encontrar tus llaves (Test y Live) en Ajustes > Desarrolladores > Claves de API. Las llaves live están disponibles en todos los planes, incluido el Gratis — cada plan solo tiene un límite distinto de llaves (Gratis: 2, Developer: 200)." },
];

export const SUPPORT_FAQ_EN: SupportFaq[] = [
    { q: "When is the money deposited into my account?", a: "Payments processed by card are deposited into your configured bank account within T+3 to T+7 calendar days, depending on the Payout schedule of your connected Stripe account." },
    { q: "How do I cancel an invoice (CFDI)?", a: "Go to the Billing section in your portal, find the issued invoice, select 'Options' and click 'Generate Expense (Credit Note)'. Cord will automatically link the parent UUID." },
    { q: "Can I charge in dollars (USD)?", a: "Yes. Cord allows you to issue quotes in USD. Stripe will handle the currency conversion if your destination account is in MXN." },
    { q: "What happens if a client doesn't pay on time?", a: "Cord will send automatic reminders based on your account settings, and if you configured late fees, it will calculate them on the overdue balance." },
    { q: "Does Cord charge transaction fees?", a: "No. Cord is a SaaS platform and you only pay your monthly fee. Card charges generate Stripe's standard direct fee, with no intermediaries." },
    { q: "Where can I find my API Keys?", a: "You can find your keys (Test and Live) in Settings > Developers > API Keys. Live keys are available on every plan, including Free — each plan just has a different key limit (Free: 2, Developer: 200)." },
];
