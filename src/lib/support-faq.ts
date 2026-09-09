// FAQ del hub de soporte (/soporte, /en/support) — fuente única compartida
// entre SupportCards.astro (renderizado visible) y soporte.astro (FAQPage
// JSON-LD), para que el schema siempre coincida con el texto visible.
export interface SupportFaq { q: string; a: string; }

export const SUPPORT_FAQ_ES: SupportFaq[] = [
    { q: "¿Puedo contratar Cord en euros?", a: "Para nuevas contrataciones de España, Alemania y Francia, Starter, Profesional y Scale tienen precios fijos en EUR. Un contrato existente conserva su moneda. El resumen muestra el total mensual o anual y los excedentes aplicables; Developer en EUR se cotiza por ventas." },
    { q: "Ya pagué, ¿por qué el enlace aún muestra saldo?", a: "Volver de la pantalla de pago no confirma por sí solo el cobro. Usa Actualizar saldo y revisa el estado. Si tu banco ya muestra el cargo, contacta al negocio antes de pagar otra vez." },
    { q: "¿Cuándo se deposita el dinero en mi cuenta?", a: "Depende de la frecuencia que elijas en Ajustes › Cobros: puedes recibir depósitos diarios, semanales o mensuales, con el retraso mínimo que permita tu país. Los primeros depósitos de una cuenta nueva tardan más mientras se completa la revisión inicial, y la fecha estimada de cada uno aparece en tu panel de Cobros." },
    { q: "¿Cómo cancelo una factura (CFDI)?", a: "Abre la factura y elige Más acciones > Anular factura. Si tiene pagos aplicados, Cord bloquea la anulación y propone una nota de crédito. Una solicitud pendiente no significa que el CFDI esté cancelado: usa Consultar cancelación para revisar su estado. La nota de crédito y el reembolso son acciones distintas." },
    { q: "¿Puedo cotizar y cobrar en otra moneda?", a: "Sí. Eliges la moneda de venta en el editor y tu cliente ve y paga con tarjeta en esa moneda. Si tu contabilidad va en otra, Cord congela el tipo de cambio 30 días al guardar la cotización y la factura lo declara junto con el total convertido. La transferencia SPEI es un riel mexicano y solo cobra en pesos." },
    { q: "¿Qué pasa si un cliente no paga a tiempo?", a: "Cord puede preparar o enviar recordatorios según la configuración de tu cuenta. El interés moratorio automático está suspendido mientras concluye la revisión jurídica por país." },
    { q: "¿Cord cobra comisiones por transacción?", a: "Cord Payments cobra una tarifa transparente por método, más IVA. La ves y aceptas antes de activarla; el dinero del cliente sigue llegando directo a tu cuenta." },
    { q: "¿Dónde encuentro mis API Keys?", a: "Puedes encontrar tus llaves (Test y Live) en Ajustes > Desarrolladores > Claves de API. Las llaves live están disponibles en todos los planes, incluido el Gratis — cada plan solo tiene un límite distinto de llaves (Gratis: 2, Developer: 200)." },
];

export const SUPPORT_FAQ_EN: SupportFaq[] = [
    { q: "Can I subscribe to Cord in euros?", a: "New subscriptions in Spain, Germany and France have fixed EUR prices for Starter, Professional and Scale. Existing contracts keep their currency. Checkout shows the monthly or annual total and applicable overage; Developer in EUR is quoted by sales." },
    { q: "I paid. Why does the link still show a balance?", a: "Returning from payment does not itself confirm the charge. Use Refresh balance and check the status. If your bank already shows a charge, contact the business before paying again." },
    { q: "When is the money deposited into my account?", a: "It depends on the frequency you pick in Settings > Payments: daily, weekly or monthly payouts, with the minimum delay your country allows. A new account’s first payouts take longer while the initial review completes, and the estimated arrival date for each one is shown in your Payments dashboard." },
    { q: "How do I cancel an invoice (CFDI)?", a: "Open the invoice and choose More actions > Void invoice. If payments have been applied, Cord blocks voiding and suggests a credit note. A pending request does not mean the CFDI is canceled: use Check cancellation status. A credit note and a refund are different actions." },
    { q: "Can I quote and charge in another currency?", a: "Yes. You pick the selling currency in the editor and your client sees and pays by card in that currency. If your books are in a different one, Cord locks the exchange rate for 30 days when you save the quote, and the invoice states it along with the converted total. SPEI transfer is a Mexican rail and only charges in pesos." },
    { q: "What happens if a client doesn't pay on time?", a: "Cord can prepare or send reminders based on your account settings. Automatic late interest is suspended while the country-by-country legal review is completed." },
    { q: "Does Cord charge transaction fees?", a: "Cord Payments charges a transparent method-specific fee, plus tax. You see and accept it before activation, while customer funds continue to settle directly into your account." },
    { q: "Where can I find my API Keys?", a: "You can find your keys (Test and Live) in Settings > Developers > API Keys. Live keys are available on every plan, including Free — each plan just has a different key limit (Free: 2, Developer: 200)." },
];
