// Detalle legible de un evento de factura, en el idioma de quien lo lee.
//
// `eventos.detalle` se guarda como texto en español desde que existe la
// actividad de facturas, y ese formato ya tiene lectores: la analítica extrae
// el motivo de "Anulada: …". Cambiar lo que se escribe rompería esos lectores y
// dejaría las filas viejas sin traducir, así que la traducción vive al pintar.
// Sin imports a propósito: función pura, probada en test/invoice-timeline-detail.test.ts.

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

    if ((m = d.match(/^Factura (.+) emitida$/))) return `Invoice ${m[1]} issued`;
    if (d === 'Emitida por recurrencia') return 'Issued by recurrence';
    if (d === 'Enviada automáticamente') return 'Sent automatically';
    if ((m = d.match(/^Enviada a (.+) \(envío masivo\)$/))) return `Sent to ${m[1]} (bulk send)`;
    if ((m = d.match(/^Enviada a (.+)$/))) return `Sent to ${m[1]}`;
    if ((m = d.match(/^Abono de (.+)$/))) return `Payment of ${m[1]}`;
    if ((m = d.match(/^Anulada: (.+)$/))) return `Voided: ${m[1]}`;
    if ((m = d.match(/^Error al emitir: (.+)$/))) return `Issuing failed: ${m[1] === 'desconocido' ? 'unknown' : m[1]}`;
    return d;
}
