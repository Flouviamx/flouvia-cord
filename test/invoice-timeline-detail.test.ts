import { describe, it, expect } from 'vitest';
import { invoiceEventDetail } from '../src/lib/fiscal/timeline-detail';

describe('detalle de la actividad de una factura', () => {
    it('oculta el detalle que solo repite la etiqueta del evento', () => {
        expect(invoiceEventDetail('created', 'Borrador creado', 'es')).toBe('');
        expect(invoiceEventDetail('created', 'Borrador creado', 'en')).toBe('');
        expect(invoiceEventDetail('paid', 'Saldo liquidado', 'en')).toBe('');
        expect(invoiceEventDetail('void', 'Anulada', 'es')).toBe('');
    });

    it('conserva un detalle con información aunque el tipo sea el mismo', () => {
        expect(invoiceEventDetail('created', 'Error al emitir: RFC inválido', 'es')).toBe('Error al emitir: RFC inválido');
        expect(invoiceEventDetail('void', 'Anulada: duplicada', 'en')).toBe('Voided: duplicada');
    });

    it('corrige el plural de los recordatorios, incluidas las filas viejas', () => {
        expect(invoiceEventDetail('reminder', 'Aviso de vencimiento (1 días antes)', 'es')).toBe('Aviso de vencimiento (1 día antes)');
        expect(invoiceEventDetail('reminder', 'Aviso de vencimiento (7 días antes)', 'es')).toBe('Aviso de vencimiento (7 días antes)');
        expect(invoiceEventDetail('reminder', 'Recordatorio de cobro (1 día vencida)', 'es')).toBe('Recordatorio de cobro (1 día vencida)');
        expect(invoiceEventDetail('reminder', 'Aviso de vencimiento (vence hoy)', 'es')).toBe('Aviso de vencimiento (vence hoy)');
        expect(invoiceEventDetail('reminder', 'Aviso de vencimiento (vence hoy)', 'en')).toBe('Due-date notice (due today)');
    });

    it('traduce al inglés los detalles que escribe la app', () => {
        expect(invoiceEventDetail('reminder', 'Aviso de vencimiento (1 días antes)', 'en')).toBe('Due-date notice (1 day before)');
        expect(invoiceEventDetail('reminder', 'Recordatorio de cobro (14 días vencida)', 'en')).toBe('Collection reminder (14 days overdue)');
        expect(invoiceEventDetail('issued', 'Factura A-001048 emitida', 'en')).toBe('Invoice A-001048 issued');
        expect(invoiceEventDetail('issued', 'Emitida por recurrencia', 'en')).toBe('Issued by recurrence');
        expect(invoiceEventDetail('sent', 'Enviada a raul@elzarco.mx (envío masivo)', 'en')).toBe('Sent to raul@elzarco.mx (bulk send)');
        expect(invoiceEventDetail('sent', 'Enviada a raul@elzarco.mx', 'en')).toBe('Sent to raul@elzarco.mx');
        expect(invoiceEventDetail('sent', 'Enviada automáticamente', 'en')).toBe('Sent automatically');
        expect(invoiceEventDetail('payment', 'Abono de $96,000.00 MXN', 'en')).toBe('Payment of $96,000.00 MXN');
        expect(invoiceEventDetail('created', 'Error al emitir: desconocido', 'en')).toBe('Issuing failed: unknown');
    });

    it('traduce la sustitución, la factura global y el motivo del SAT', () => {
        expect(invoiceEventDetail('void', 'Anulada: 02 · Comprobante emitido con errores sin relación', 'en'))
            .toBe('Voided: 02 · Issued with errors, without a replacement');
        expect(invoiceEventDetail('void', 'Anulada: 02 · Comprobante emitido con errores sin relación — Cliente equivocado', 'en'))
            .toBe('Voided: 02 · Issued with errors, without a replacement — Cliente equivocado');
        expect(invoiceEventDetail('void', 'Anulada: 04 · Operación nominativa relacionada en una factura global', 'es'))
            .toBe('Anulada: 04 · Operación nominativa relacionada en una factura global');
        expect(invoiceEventDetail('void', 'Sustituida por F-000002', 'en')).toBe('Replaced by F-000002');
        expect(invoiceEventDetail('issued', 'Sustituye a F-000001', 'en')).toBe('Replaces F-000001');
        expect(invoiceEventDetail('created', 'Borrador que sustituye a la factura original', 'en')).toBe('Draft replacing the original invoice');
        expect(invoiceEventDetail('created', 'Factura global con 1 venta(s)', 'en')).toBe('Global invoice with 1 sale');
        expect(invoiceEventDetail('created', 'Factura global con 12 venta(s)', 'en')).toBe('Global invoice with 12 sales');
        expect(invoiceEventDetail('payment', 'Pago de $100.00 MXN recibido en una factura ya sustituida: aplícalo a la que la sustituye o devuélvelo', 'en'))
            .toBe('Payment of $100.00 MXN received on an invoice that was already replaced: apply it to the replacement or refund it');
    });

    it('traduce el complemento de pago de México', () => {
        expect(invoiceEventDetail('payment', 'Complemento de pago emitido (9F1C-UUID)', 'en')).toBe('Payment complement issued (9F1C-UUID)');
        expect(invoiceEventDetail('payment', 'Complemento de pago emitido', 'en')).toBe('Payment complement issued');
        expect(invoiceEventDetail('payment', 'Complemento de pago pendiente: escríbenos para reintentarlo', 'en')).toBe('Payment complement pending: write to us to retry it');
        expect(invoiceEventDetail('payment', 'Complemento de pago pendiente: reintenta desde la factura', 'en')).toBe('Payment complement pending: write to us to retry it');
        expect(invoiceEventDetail('payment', 'Complemento de pago no automático: pago en efectivo', 'en')).toBe('Payment complement not issued automatically: pago en efectivo');
        expect(invoiceEventDetail('payment', 'Complemento de pago emitido (9F1C-UUID)', 'es')).toBe('Complemento de pago emitido (9F1C-UUID)');
    });

    it('deja pasar tal cual un detalle que no reconoce', () => {
        expect(invoiceEventDetail('uncollectible', 'Cliente en quiebra', 'en')).toBe('Cliente en quiebra');
        expect(invoiceEventDetail('sent', '', 'en')).toBe('');
    });
});
