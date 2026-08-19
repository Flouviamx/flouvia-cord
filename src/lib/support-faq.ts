// FAQ del hub de soporte (/soporte, /en/support) — fuente única compartida
// entre SupportCards.astro (renderizado visible) y soporte.astro (FAQPage
// JSON-LD), para que el schema siempre coincida con el texto visible.
export interface SupportFaq { q: string; a: string; }

export const SUPPORT_FAQ_ES: SupportFaq[] = [
    { q: "¿Cuándo se deposita el dinero en mi cuenta?", a: "Los pagos procesados con tarjeta se depositan en tu cuenta bancaria configurada en un plazo de T+3 a T+7 días naturales, según el calendario de depósitos de Cord Payments." },
    { q: "¿Cómo cancelo una factura (CFDI)?", a: "Ve a la sección de Facturación en tu portal, busca la factura emitida, selecciona 'Opciones' y haz clic en 'Generar Egreso (Nota de Crédito)'. Cord vinculará automáticamente el UUID padre." },
    { q: "¿Puedo cotizar y cobrar en otra moneda?", a: "Sí. Eliges la moneda de venta en el editor y tu cliente ve y paga con tarjeta en esa moneda. Si tu contabilidad va en otra, Cord congela el tipo de cambio 30 días al guardar la cotización y la factura lo declara junto con el total convertido. La transferencia SPEI es un riel mexicano y solo cobra en pesos." },
    { q: "¿Qué pasa si un cliente no paga a tiempo?", a: "Cord enviará recordatorios automáticos según la configuración de tu cuenta y, si configuraste el interés moratorio, lo calculará sobre el saldo vencido." },
    { q: "¿Cord cobra comisiones por transacción?", a: "Cord Payments cobra una tarifa transparente por método, más IVA. La ves y aceptas antes de activarla; el dinero del cliente sigue llegando directo a tu cuenta." },
    { q: "¿Dónde encuentro mis API Keys?", a: "Puedes encontrar tus llaves (Test y Live) en Ajustes > Desarrolladores > Claves de API. Las llaves live están disponibles en todos los planes, incluido el Gratis — cada plan solo tiene un límite distinto de llaves (Gratis: 2, Developer: 200)." },
];

export const SUPPORT_FAQ_EN: SupportFaq[] = [
    { q: "When is the money deposited into my account?", a: "Card payments are deposited into your configured bank account within T+3 to T+7 calendar days, depending on your Cord Payments payout schedule." },
    { q: "How do I cancel an invoice (CFDI)?", a: "Go to the Billing section in your portal, find the issued invoice, select 'Options' and click 'Generate Expense (Credit Note)'. Cord will automatically link the parent UUID." },
    { q: "Can I quote and charge in another currency?", a: "Yes. You pick the selling currency in the editor and your client sees and pays by card in that currency. If your books are in a different one, Cord locks the exchange rate for 30 days when you save the quote, and the invoice states it along with the converted total. SPEI transfer is a Mexican rail and only charges in pesos." },
    { q: "What happens if a client doesn't pay on time?", a: "Cord will send automatic reminders based on your account settings, and if you configured late fees, it will calculate them on the overdue balance." },
    { q: "Does Cord charge transaction fees?", a: "Cord Payments charges a transparent method-specific fee, plus tax. You see and accept it before activation, while customer funds continue to settle directly into your account." },
    { q: "Where can I find my API Keys?", a: "You can find your keys (Test and Live) in Settings > Developers > API Keys. Live keys are available on every plan, including Free — each plan just has a different key limit (Free: 2, Developer: 200)." },
];
