// /api/facturas/[id]/reembolso: quién puede reembolsar y con qué garantías.
// El dinero se prueba en factura-reembolso-db.test.ts; aquí, la puerta: permiso
// "Reembolsos", reautenticación reciente, rate limit y respuestas sin el
// mensaje crudo del proveedor (regla 14).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    perm: vi.fn(), fresh: vi.fn(), limit: vi.fn(), audit: vi.fn(), ejecutar: vi.fn(), preparar: vi.fn(), invalidate: vi.fn(),
}));
vi.mock('../src/lib/db', () => ({ getActiveOrgId: async () => 'org-1', logAudit: m.audit, reqIp: () => '203.0.113.7' }));
vi.mock('../src/lib/context', () => ({ currentLocale: () => 'es', currentUserId: () => 'user-1' }));
vi.mock('../src/lib/queries', () => ({ requirePerm: m.perm, invalidateMoneyCaches: m.invalidate }));
vi.mock('../src/lib/step-up', () => ({ requireFreshAuth: m.fresh }));
vi.mock('../src/lib/ratelimit', () => ({
    strictRateLimit: m.limit,
    strictLimitResponse: (r: { ok: boolean }) => (r.ok ? null : new Response('{}', { status: 429 })),
}));
vi.mock('../src/lib/cobros/reembolsos', () => ({ ejecutarReembolso: m.ejecutar, prepararReembolso: m.preparar }));

import { GET, POST } from '../src/pages/api/facturas/[id]/reembolso';

const DOC = '11111111-1111-4111-8111-111111111111';
const PAGO = '22222222-2222-4222-8222-222222222222';
const cuerpo = { nonce: 'n'.repeat(43), alcance: 'factura', amountMinor: 4000, feeDisclosureAccepted: true };
const post = (body: unknown = cuerpo) => POST({
    params: { id: DOC },
    request: new Request(`https://cordhq.app/api/facturas/${DOC}/reembolso`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
} as any);
const get = () => GET({ params: { id: DOC }, url: new URL(`https://cordhq.app/api/facturas/${DOC}/reembolso?pago=${PAGO}`) } as any);
const prohibido = () => new Response(JSON.stringify({ error: 'No tienes permiso para esta acción.' }), { status: 403 });

beforeEach(() => {
    vi.clearAllMocks();
    m.perm.mockResolvedValue(null);
    m.fresh.mockResolvedValue(null);
    m.limit.mockResolvedValue({ ok: true });
    m.ejecutar.mockResolvedValue({ ok: true, solicitudId: 'sol-1', estado: 'succeeded', monto: 40, currency: 'MXN', alcance: 'factura', cfdi: false });
    m.preparar.mockResolvedValue({ pagoId: PAGO, bloqueo: null, nonce: 'x', maxFactura: 100 });
});

describe('permiso y reautenticación', () => {
    it('sin el permiso Reembolsos no autoriza ni ejecuta', async () => {
        m.perm.mockResolvedValue(prohibido());
        expect((await get()).status).toBe(403);
        expect((await post()).status).toBe(403);
        expect(m.perm).toHaveBeenCalledWith('reembolsar');
        expect(m.preparar).not.toHaveBeenCalled();
        expect(m.ejecutar).not.toHaveBeenCalled();
    });
    it('con el permiso pero sin identidad reciente pide reautenticarse antes de mover dinero', async () => {
        m.fresh.mockResolvedValue(new Response(JSON.stringify({ error: 'reauthentication_required' }), { status: 428 }));
        expect((await post()).status).toBe(428);
        expect(m.ejecutar).not.toHaveBeenCalled();
    });
    it('el diálogo no necesita reautenticación; ejecutar sí', async () => {
        expect((await get()).status).toBe(200);
        expect(m.fresh).not.toHaveBeenCalled();
        expect(m.preparar).toHaveBeenCalledWith('org-1', DOC, PAGO, 'user-1');
    });
    it('con permiso e identidad reciente ejecuta, audita y responde 202', async () => {
        const res = await post({ ...cuerpo, reason: 'Pedido cancelado' });
        expect(res.status).toBe(202);
        expect(m.ejecutar).toHaveBeenCalledWith('org-1', DOC, { nonce: cuerpo.nonce, alcance: 'factura', montoMinimo: 4000, motivo: 'Pedido cancelado', userId: 'user-1' });
        expect(m.audit).toHaveBeenCalledWith('org-1', expect.objectContaining({ accion: 'facturas.reembolso_solicitado', entidad_id: DOC, ip: '203.0.113.7' }));
        expect(m.invalidate).toHaveBeenCalledWith('org-1');
    });
});

describe('contrato de la ruta', () => {
    it('tiene su propio rate limit, estricto', async () => {
        m.limit.mockResolvedValue({ ok: false });
        expect((await post()).status).toBe(429);
        expect(m.limit).toHaveBeenCalledWith('invoice-refund:org-1', 20, 86_400);
        expect(m.ejecutar).not.toHaveBeenCalled();
    });
    it('exige la aceptación de la tarifa y un monto entero en unidad mínima', async () => {
        expect((await post({ ...cuerpo, feeDisclosureAccepted: false })).status).toBe(400);
        expect((await post({ ...cuerpo, amountMinor: 40.5 })).status).toBe(400);
        expect((await post({ ...cuerpo, extra: 1 })).status).toBe(400);
        expect(m.ejecutar).not.toHaveBeenCalled();
    });
    it('un rechazo del proveedor sale traducido, con referencia, nunca con su texto', async () => {
        m.ejecutar.mockResolvedValue({ ok: false, error: 'rechazo', mensaje: 'No pudimos completar la operación (ref: AB12)', referencia: 'AB12' });
        const res = await post();
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({ error: 'No pudimos completar la operación (ref: AB12)', code: 'rechazo', reference: 'AB12' });
        expect(m.audit).not.toHaveBeenCalled();
    });
    it('cada motivo de bloqueo tiene un mensaje para el negocio', async () => {
        for (const code of ['manual', 'cotizacion', 'transferencia', 'metodo', 'no_confirmado', 'plazo', 'reembolsado', 'pendiente_registro', 'sin_cuenta', 'proveedor', 'autorizacion', 'capacidad', 'completo', 'monto', 'alcance', 'incierto']) {
            m.ejecutar.mockResolvedValue({ ok: false, error: code, referencia: 'R1' });
            const data = await (await post()).json();
            expect(data.code).toBe(code);
            expect(data.error).toMatch(/\S{3,}/);
            expect(data.error).not.toMatch(/stripe/i);
        }
    });
});
