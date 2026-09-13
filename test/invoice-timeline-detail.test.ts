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

    it('deja pasar tal cual un detalle que no reconoce', () => {
        expect(invoiceEventDetail('uncollectible', 'Cliente en quiebra', 'en')).toBe('Cliente en quiebra');
        expect(invoiceEventDetail('sent', '', 'en')).toBe('');
    });
});
