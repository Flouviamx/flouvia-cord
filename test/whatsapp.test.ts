import { describe, expect, it } from 'vitest';
import { toE164 } from '../src/lib/whatsapp';

describe('toE164', () => {
    it('acepta el número ya escrito con separadores', () => {
        expect(toE164('+52 55 1234 5678')).toBe('+525512345678');
        expect(toE164('+34-600-123-456')).toBe('+34600123456');
        expect(toE164('+1 (415) 555-2671')).toBe('+14155552671');
        expect(toE164('0052 5512345678')).toBe('+525512345678');
    });

    it('un número sin lada de país no se completa a la fuerza', () => {
        // Inventar la lada entrega el mensaje a un desconocido con el mismo
        // número en otro país: sin `+`, no hay envío.
        expect(toE164('5512345678')).toBeNull();
        expect(toE164('55 1234 5678')).toBeNull();
    });

    it('rechaza lo que no es un número marcable', () => {
        expect(toE164('')).toBeNull();
        expect(toE164(null)).toBeNull();
        expect(toE164('+0123456789')).toBeNull();
        expect(toE164('+52 5512')).toBeNull();
        expect(toE164('+52123456789012345678')).toBeNull();
        expect(toE164('no-es-un-numero')).toBeNull();
    });
});
