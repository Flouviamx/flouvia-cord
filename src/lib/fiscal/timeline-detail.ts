// Detalle legible de un evento de factura, en el idioma de quien lo lee.
//
// `eventos.detalle` se guarda como texto en español desde que existe la
// actividad de facturas, y ese formato ya tiene lectores: la analítica extrae
// el motivo de "Anulada: …". Cambiar lo que se escribe rompería esos lectores y
// dejaría las filas viejas sin traducir, así que la traducción vive al pintar.
// Sin dependencias de servidor a propósito: función pura, probada en
// test/invoice-timeline-detail.test.ts. Solo importa el catálogo de motivos del
// SAT, que también es puro, para no duplicar sus descripciones.

import { MOTIVOS_CANCELACION } from './cfdi-catalogos';
import { ESTADOS_DGFIP } from './transmision/estados';

// Francia: lo que deja en la historia la plataforma autorizada (transmision/).
const PLATAFORMA_EN: Record<string, string> = {
    'Enviada a la plataforma de facturación electrónica': 'Sent to the e-invoicing platform',
    'Cobro comunicado a la plataforma': 'Payment reported to the platform',
    'La plataforma no admitió el envío': 'The platform did not accept the submission',
    'La plataforma no admitió el cobro comunicado': 'The platform did not accept the reported payment',
    'La plataforma no pudo entregar la factura': 'The platform could not deliver the invoice',
    'Anulada tras un litigio': 'Cancelled after a dispute',
};

export type TimelineLocale = 'es' | 'en';

// Detalles que solo repiten la etiqueta del evento ("Borrador creado" bajo
// "Borrador creado"): no aportan nada y se ocultan.
const REDUNDANTES: Record<string, string[]> = {
    created: ['Borrador creado'],
    paid: ['Saldo liquidado'],
    void: ['Anulada'],
    viewed: ['El cliente abrió la factura'],
};

const dias = (n: string, locale: TimelineLocale) =>
    locale === 'en' ? (n === '1' ? 'day' : 'days') : (n === '1' ? 'día' : 'días');

export function invoiceEventDetail(tipo: string, detalle: string, locale: TimelineLocale): string {
    const d = String(detalle || '').trim();
    if (!d) return '';
    if (REDUNDANTES[tipo]?.includes(d)) return '';

    if (locale === 'en' && d === 'Registro corregido y reenviado a la AEAT') return 'Record corrected and resent to the AEAT';
    if (locale === 'en' && d === 'Anulación corregida y reenviada a la AEAT') return 'Cancellation corrected and resent to the AEAT';

    let m: RegExpMatchArray | null;

    if ((m = d.match(/^Recordatorio de cobro \((\d+) días? vencida\)$/))) {
        return locale === 'en'
            ? `Collection reminder (${m[1]} ${dias(m[1], locale)} overdue)`
            : `Recordatorio de cobro (${m[1]} ${dias(m[1], locale)} vencida)`;
    }
    if ((m = d.match(/^Aviso de vencimiento \((\d+) días? antes\)$/))) {
        return locale === 'en'
            ? `Due-date notice (${m[1]} ${dias(m[1], locale)} before)`
            : `Aviso de vencimiento (${m[1]} ${dias(m[1], locale)} antes)`;
    }

    if (locale === 'es') return d;

    if (tipo === 'plataforma') {
        if (PLATAFORMA_EN[d]) return PLATAFORMA_EN[d];
        // "Estado 213 · Rechazada por una plataforma: motivo" — el motivo lo
        // escribió la plataforma y se deja tal cual.
        if ((m = d.match(/^Estado (\d{3}) · ([^:]+)(?:: (.+))?$/))) {
            const e = ESTADOS_DGFIP[m[1]];
            return `Status ${m[1]} · ${e ? e.en : m[2]}${m[3] ? `: ${m[3]}` : ''}`;
        }
        if ((m = d.match(/^Anulada tras un litigio(?:: (.+))?$/))) return `Cancelled after a dispute${m[1] ? `: ${m[1]}` : ''}`;
        if ((m = d.match(/^Estado (.+)$/))) return `Status ${m[1]}`;
    }

    if ((m = d.match(/^Factura (.+) emitida$/))) return `Invoice ${m[1]} issued`;
    if (d === 'Emitida por recurrencia') return 'Issued by recurrence';
    if (d === 'Enviada automáticamente') return 'Sent automatically';
    if ((m = d.match(/^Enviada a (.+) \(envío masivo\)$/))) return `Sent to ${m[1]} (bulk send)`;
    if ((m = d.match(/^Enviada a (.+)$/))) return `Sent to ${m[1]}`;
    if ((m = d.match(/^Abono de (.+)$/))) return `Payment of ${m[1]}`;
    if ((m = d.match(/^Anulada: (0[1-4]) · (.+)$/))) {
        // Motivo del SAT: "Anulada: 02 · Comprobante emitido con errores sin relación[ — nota]".
        const motivo = MOTIVOS_CANCELACION[m[1] as keyof typeof MOTIVOS_CANCELACION];
        const [descripcion, ...nota] = m[2].split(' — ');
        const en = motivo && descripcion === motivo.es ? motivo.en : descripcion;
        return `Voided: ${m[1]} · ${en}${nota.length ? ` — ${nota.join(' — ')}` : ''}`;
    }
    if ((m = d.match(/^El cobro automático no pasó \(ref: (.+)\)$/))) return `Automatic payment did not go through (ref: ${m[1]})`;
    if ((m = d.match(/^El pago desde el portal no se completó \(ref: (.+)\)$/))) return `Payment from the portal was not completed (ref: ${m[1]})`;
    if ((m = d.match(/^Anulada: (.+)$/))) return `Voided: ${m[1]}`;
    if ((m = d.match(/^Borrador que sustituye a (.+)$/))) return `Draft replacing ${m[1] === 'la factura original' ? 'the original invoice' : m[1]}`;
    if ((m = d.match(/^Sustituye a (.+)$/))) return `Replaces ${m[1] === 'la factura original' ? 'the original invoice' : m[1]}`;
    if ((m = d.match(/^Sustituida por (.+)$/))) return `Replaced by ${m[1]}`;
    if ((m = d.match(/^Factura global con (\d+) venta\(s\)$/))) return `Global invoice with ${m[1]} sale${m[1] === '1' ? '' : 's'}`;
    if ((m = d.match(/^Pago de (.+) recibido en una factura ya sustituida: aplícalo a la que la sustituye o devuélvelo$/))) {
        return `Payment of ${m[1]} received on an invoice that was already replaced: apply it to the replacement or refund it`;
    }
    if ((m = d.match(/^Pago de (.+) recibido DESPUÉS de anular la factura: debe devolverse al cliente$/))) {
        return `Payment of ${m[1]} received AFTER the invoice was voided: it must be refunded to the client`;
    }
    // SPEI (cobros/spei.ts): dinero que llegó y todavía no es un pago.
    if ((m = d.match(/^Transferencia SPEI incompleta: llegaron (.+) de (.+); faltan (.+) a la misma CLABE\. El pago se registra al completarse$/))) {
        return `Incomplete SPEI transfer: ${m[1]} of ${m[2]} arrived; ${m[3]} still due to the same CLABE. The payment is recorded once it is complete`;
    }
    if ((m = d.match(/^Transferencia SPEI sin pago abierto: (.+) a favor del cliente\. Se aplica cuando vuelva a elegir SPEI en la factura$/))) {
        return `SPEI transfer with no open payment: ${m[1]} in the client's favor. It is applied when they choose SPEI on the invoice again`;
    }
    if ((m = d.match(/^Transferencia SPEI de más: (.+) a favor del cliente, sin aplicar a la factura\. Hay que devolvérselo$/))) {
        return `SPEI overpayment: ${m[1]} in the client's favor, not applied to the invoice. It must be returned to them`;
    }
    if ((m = d.match(/^Error al emitir: (.+)$/))) return `Issuing failed: ${m[1] === 'desconocido' ? 'unknown' : m[1]}`;
    // México: complemento de pago (payment-complement.ts). El motivo o el error
    // vienen del SAT o del proveedor y se dejan tal cual.
    if ((m = d.match(/^Complemento de pago emitido(?: \((.+)\))?$/))) return `Payment complement issued${m[1] ? ` (${m[1]})` : ''}`;
    if ((m = d.match(/^Complemento de pago no automático: (.+)$/))) return `Payment complement not issued automatically: ${m[1]}`;
    if ((m = d.match(/^Complemento de pago pendiente: (.+)$/))) {
        // "reintenta desde la factura" es de filas anteriores: ese botón no existe.
        const fijo: Record<string, string> = { 'escríbenos para reintentarlo': 'write to us to retry it', 'reintenta desde la factura': 'write to us to retry it' };
        return `Payment complement pending: ${fijo[m[1]] ?? m[1]}`;
    }
    return d;
}
