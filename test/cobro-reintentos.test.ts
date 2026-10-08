// Política de reintentos del cobro automático y métodos ofrecidos por divisa.
import { describe, expect, it } from 'vitest';
import {
    categoriaRechazo, decidirReintento, diaUtc, proximoDiaDePago,
    MAX_INTENTOS_DOMICILIACION, MAX_INTENTOS_TARJETA,
} from '../src/lib/cobros/reintentos';
import { domiciliacionDelPais, etiquetaMetodo, metodosPara, resumenMetodo } from '../src/lib/cobros/metodos';

const ahora = new Date('2026-10-08T14:00:00Z'); // jueves
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('categoría del rechazo', () => {
    it('el decline_code manda sobre el genérico card_declined', () => {
        expect(categoriaRechazo('card_declined', 'stolen_card')).toBe('bloqueado');
        expect(categoriaRechazo('card_declined', 'insufficient_funds')).toBe('fondos');
        expect(categoriaRechazo('card_declined', 'authentication_required')).toBe('autenticacion');
        expect(categoriaRechazo('card_declined', null)).toBe('rechazo');
    });
    it('reconoce los códigos de un débito bancario', () => {
        expect(categoriaRechazo('debit_not_authorized')).toBe('mandato');
        expect(categoriaRechazo('authorization_revoked')).toBe('mandato');
        expect(categoriaRechazo('account_closed')).toBe('metodo');
        expect(categoriaRechazo('insufficient_funds')).toBe('fondos');
        expect(categoriaRechazo('generic_could_not_process')).toBe('rechazo');
    });
});

describe('tarjeta', () => {
    const base = { tipoMetodo: 'card', ahora } as const;
    it('un rechazo duro no se reintenta y apaga el método', () => {
        for (const declineCode of ['lost_card', 'stolen_card', 'fraudulent', 'pickup_card']) {
            expect(decidirReintento({ ...base, codigo: 'card_declined', declineCode, intento: 1 }))
                .toEqual({ accion: 'detener', categoria: 'bloqueado', motivo: 'bloqueado', desactivar: true });
        }
    });
    it('una tarjeta vencida pide otro método', () => {
        expect(decidirReintento({ ...base, codigo: 'expired_card', intento: 1 }))
            .toMatchObject({ accion: 'detener', motivo: 'metodo_invalido', desactivar: true });
    });
    it('la autenticación requerida la resuelve el cliente, sin apagar el cobro automático', () => {
        expect(decidirReintento({ ...base, codigo: 'authentication_required', intento: 1 }))
            .toMatchObject({ accion: 'detener', motivo: 'requiere_autenticacion', desactivar: false });
    });
    it('fondos insuficientes esperan al siguiente día de pago dentro de una semana', () => {
        // 8 oct + 2 = 10 oct; el 16 queda a 8 días: sin día de pago en la semana, va a los 3 días.
        expect(iso((decidirReintento({ ...base, codigo: 'card_declined', declineCode: 'insufficient_funds', intento: 1 }) as any).siguienteAt))
            .toBe('2026-10-11');
        const finDeMes = new Date('2026-10-27T10:00:00Z');
        expect(iso(proximoDiaDePago(finDeMes, 2))).toBe('2026-11-01');
        expect(iso(proximoDiaDePago(new Date('2026-10-13T10:00:00Z'), 2))).toBe('2026-10-16');
    });
    it('un rechazo blando sigue la escalera de 2, 4 y 7 días', () => {
        const dias = [1, 2, 3].map((intento) => iso((decidirReintento({ ...base, codigo: 'card_declined', declineCode: 'do_not_honor', intento }) as any).siguienteAt));
        expect(dias).toEqual([iso(diaUtc(ahora, 2)), iso(diaUtc(ahora, 4)), iso(diaUtc(ahora, 7))]);
    });
    it('una falla del emisor se reintenta al día siguiente', () => {
        expect(iso((decidirReintento({ ...base, codigo: 'processing_error', intento: 1 }) as any).siguienteAt)).toBe('2026-10-09');
    });
    it('el último intento se detiene como agotado', () => {
        expect(decidirReintento({ ...base, codigo: 'card_declined', declineCode: 'insufficient_funds', intento: MAX_INTENTOS_TARJETA }))
            .toMatchObject({ accion: 'detener', motivo: 'agotado', desactivar: false });
    });
});

describe('domiciliación', () => {
    it('solo fondos insuficientes se reintentan, como máximo dos veces', () => {
        const fondos = (intento: number) => decidirReintento({ codigo: 'insufficient_funds', tipoMetodo: 'sepa_debit', intento, ahora, primerIntentoAt: ahora });
        expect(fondos(1).accion).toBe('reintentar');
        expect(fondos(2).accion).toBe('reintentar');
        expect(fondos(MAX_INTENTOS_DOMICILIACION)).toMatchObject({ accion: 'detener', motivo: 'agotado' });
        expect(decidirReintento({ codigo: 'generic_could_not_process', tipoMetodo: 'us_bank_account', intento: 1, ahora }))
            .toMatchObject({ accion: 'detener', motivo: 'agotado', desactivar: false });
    });
    it('un mandato revocado apaga el método', () => {
        expect(decidirReintento({ codigo: 'debit_not_authorized', tipoMetodo: 'us_bank_account', intento: 1, ahora }))
            .toMatchObject({ accion: 'detener', motivo: 'mandato_revocado', desactivar: true });
    });
    it('no reintenta fuera de la ventana del esquema', () => {
        const primer = new Date(ahora.getTime() - 29 * 86_400_000);
        expect(decidirReintento({ codigo: 'insufficient_funds', tipoMetodo: 'sepa_debit', intento: 2, ahora, primerIntentoAt: primer }))
            .toMatchObject({ accion: 'detener', motivo: 'agotado' });
        // ACH tiene 40 días: el mismo caso sí cabe.
        expect(decidirReintento({ codigo: 'insufficient_funds', tipoMetodo: 'us_bank_account', intento: 2, ahora, primerIntentoAt: primer }).accion)
            .toBe('reintentar');
    });
});

describe('métodos ofrecidos', () => {
    const activas = { sepa_debit_payments: 'active', us_bank_account_ach_payments: 'active' };
    it('la domiciliación solo en su divisa, con la capacidad activa y si el negocio la acepta', () => {
        expect(metodosPara({ aceptaTarjeta: true, aceptaDomiciliacion: true, capacidades: activas }, 'EUR')).toEqual(['card', 'sepa_debit']);
        expect(metodosPara({ aceptaTarjeta: true, aceptaDomiciliacion: true, capacidades: activas }, 'usd')).toEqual(['card', 'us_bank_account']);
        expect(metodosPara({ aceptaTarjeta: true, aceptaDomiciliacion: true, capacidades: activas }, 'MXN')).toEqual(['card']);
        expect(metodosPara({ aceptaTarjeta: true, aceptaDomiciliacion: false, capacidades: activas }, 'EUR')).toEqual(['card']);
        expect(metodosPara({ aceptaTarjeta: true, aceptaDomiciliacion: true, capacidades: { sepa_debit_payments: 'pending' } }, 'EUR')).toEqual(['card']);
        expect(metodosPara({ aceptaTarjeta: false, aceptaDomiciliacion: true, capacidades: activas }, 'EUR')).toEqual(['sepa_debit']);
    });
    it('el país del negocio decide qué domiciliación se pide', () => {
        expect(domiciliacionDelPais('es')).toBe('sepa_debit');
        expect(domiciliacionDelPais('US')).toBe('us_bank_account');
        expect(domiciliacionDelPais('MX')).toBeNull();
    });
    it('del método solo se guarda tipo, marca y últimos cuatro', () => {
        const card = resumenMetodo({ type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 3, exp_year: 2030, fingerprint: 'x' } });
        expect(card).toEqual({ tipo: 'card', marca: 'visa', last4: '4242', banco: null, vence: '03/2030' });
        expect(etiquetaMetodo(card)).toBe('Visa •••• 4242');
        const sepa = resumenMetodo({ type: 'sepa_debit', sepa_debit: { last4: '3000', bank_code: '37040044', country: 'DE' } });
        expect(etiquetaMetodo(sepa, 'en')).toBe('SEPA account •••• 3000');
        const ach = resumenMetodo({ type: 'us_bank_account', us_bank_account: { last4: '6789', bank_name: 'STRIPE TEST BANK', routing_number: '110000000' } });
        expect(JSON.stringify(ach)).not.toContain('110000000');
        expect(etiquetaMetodo(ach)).toBe('STRIPE TEST BANK •••• 6789');
    });
});
