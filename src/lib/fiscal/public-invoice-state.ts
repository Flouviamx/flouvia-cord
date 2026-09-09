/** Public copy follows the document ledger, never a redirect's success flag. */
export function publicInvoiceGuidance(f: {
    estado: string; esNotaCredito: boolean; porDevolver: number; saldo: number;
    acreditado: number; puedePagar: boolean; regresoDePago: boolean;
}, locale: string) {
    const en = locale === 'en';
    if (f.estado === 'void') return en ? 'This document was cancelled. No payment is required.' : 'Este documento fue cancelado. No necesitas pagarlo.';
    if (f.esNotaCredito) return en ? 'This credit note reduces the original invoice. It is not a payment request.' : 'Esta nota de crédito reduce la factura original. No es una solicitud de pago.';
    if (f.regresoDePago) return en ? 'We are checking your payment. Wait for confirmation before paying again.' : 'Estamos verificando tu pago. Espera la confirmación antes de volver a pagar.';
    if (f.porDevolver > 0) return en ? 'There is an amount to be returned to you. Contact the business to arrange it.' : 'Hay un importe por devolverte. Contacta a la empresa para coordinarlo.';
    if (f.estado === 'paid' && f.saldo <= 0) return en ? 'There is no balance due. You can download your document below.' : 'No tienes saldo pendiente. Puedes descargar tu comprobante abajo.';
    if (f.estado !== 'open') return en ? 'Contact the business to review this invoice.' : 'Contacta a la empresa para revisar esta factura.';
    if (f.puedePagar) return en ? 'Pay the balance or make a partial payment below. Your recorded payments appear on this page.' : 'Paga el saldo o realiza un abono abajo. Los pagos registrados aparecen en esta página.';
    return en ? 'Contact the business to arrange payment. If you already paid, refresh the balance to check whether it has been recorded.' : 'Contacta a la empresa para coordinar el pago. Si ya pagaste, actualiza el saldo para consultar si quedó registrado.';
}

export function publicInvoiceContact(email: string | null, phone: string | null, reference: string, locale: string) {
    const validEmail = email?.trim();
    const subject = `${locale === 'en' ? 'Invoice' : 'Factura'} ${reference}`;
    // Do not allow header injection or multiple recipients in a stored address.
    const mailto = validEmail && /^[a-zA-Z0-9.!#$&'*+\-/=?^_`{|}~]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(validEmail)
        ? `mailto:${encodeURIComponent(validEmail)}?subject=${encodeURIComponent(subject)}` : null;
    const normalizedPhone = phone?.replace(/[\s().-]/g, '') || '';
    const tel = /^\+?\d{8,15}$/.test(normalizedPhone) ? `tel:${normalizedPhone}` : null;
    return { mailto, tel };
}

export function publicPaymentIntent(value: string | null) {
    return value && /^pi_[a-zA-Z0-9]{1,200}$/.test(value) ? value : null;
}
