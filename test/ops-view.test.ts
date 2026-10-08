import { describe, expect, it } from 'vitest';
import { isOpsViewToken, newOpsViewToken, opsViewAllows, opsViewHash } from '../src/lib/ops-view';

describe('"ver como" de Cord Ops: solo lectura', () => {
    it('rechaza toda escritura, en la app y en la API', () => {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
            expect(opsViewAllows(method, '/api/tareas')).toBe(false);
            expect(opsViewAllows(method, '/app/cotizaciones')).toBe(false);
        }
    });

    it('deja leer las páginas y las lecturas de la API', () => {
        expect(opsViewAllows('GET', '/app')).toBe(true);
        expect(opsViewAllows('GET', '/app/cotizaciones/123')).toBe(true);
        expect(opsViewAllows('HEAD', '/app/clientes')).toBe(true);
        expect(opsViewAllows('GET', '/api/billing/connect/payouts')).toBe(true);
        expect(opsViewAllows('GET', '/app/wb/api')).toBe(true);
    });

    it('bloquea las lecturas con efectos, los flujos OAuth, las exportaciones y la cuenta personal', () => {
        for (const path of [
            '/api/billing/handoff',
            '/api/billing/connect/status',
            '/api/integraciones/hubspot/conectar',
            '/api/integraciones/gmail/callback',
            '/api/cobros/abc/reembolso',
            '/api/cotizaciones/abc/stream',
            '/api/org/export',
            '/api/productos/export',
            '/api/account/sessions',
            '/api/auth/logout',
            '/api/test-mode/reset',
            '/api/keys',
            '/api/cli/status',
        ]) expect(opsViewAllows('GET', path), path).toBe(false);
    });

    it('el token es de 256 bits en hexadecimal y la base solo ve su sha256', () => {
        const token = newOpsViewToken();
        expect(isOpsViewToken(token)).toBe(true);
        expect(isOpsViewToken(token.toUpperCase())).toBe(false);
        expect(isOpsViewToken('x'.repeat(64))).toBe(false);
        expect(opsViewHash(token)).not.toBe(token);
        expect(opsViewHash(token)).toMatch(/^[a-f0-9]{64}$/);
    });
});
