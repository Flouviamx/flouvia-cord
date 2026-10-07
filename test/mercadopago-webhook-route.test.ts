// Ruteo del webhook de Mercado Pago (crítico C2 de la auditoría de oct 2026):
// antes leía el pago con hasta 25 organizaciones en serie y respondía 200 aunque
// el proveedor o la base hubieran fallado, así que un pago podía perderse para
// siempre. Ahora resuelve la organización por `cord_org`/`user_id` y responde
// 503 —Mercado Pago reintenta— ante cualquier falla temporal.
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), process: vi.fn(), alert: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => m.resolve(s.join('?'), values),
}));
vi.mock('../src/lib/mercadopago', async (orig) => ({
    ...(await orig<typeof import('../src/lib/mercadopago')>()),
    readMpPayment: m.read,
}));
vi.mock('../src/lib/mercadopago-cobro', () => ({ processMpPayment: m.process }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: m.alert }));
vi.mock('../src/lib/after', () => ({ after: (p: Promise<unknown>) => { void p; } }));

import { POST } from '../src/pages/api/mercadopago/webhook';

const SECRET = 's3cret';
const orgA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const pago = { id: '9001', status: 'approved', monto: 100, moneda: 'MXN', referencia: 'x', metodo: null, collectorId: '777', liveMode: true, reembolsos: [] };

function aviso(opts: { query?: string; body?: Record<string, unknown>; firma?: boolean } = {}) {
    const ts = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', SECRET).update(`id:9001;request-id:req-1;ts:${ts};`).digest('hex');
    const url = new URL(`https://cordhq.app/api/mercadopago/webhook?data.id=9001&type=payment${opts.query ?? ''}`);
    const request = new Request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-request-id': 'req-1',
            ...(opts.firma === false ? {} : { 'x-signature': `ts=${ts},v1=${v1}` }),
        },
        body: JSON.stringify({ type: 'payment', data: { id: '9001' }, user_id: 777, ...(opts.body ?? {}) }),
    });
    return POST({ request, url } as any) as Promise<Response>;
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.MP_WEBHOOK_SECRET = SECRET;
    m.resolve.mockResolvedValue([{ org_id: orgA, mp_user_id: '777' }]);
    m.read.mockResolvedValue({ ok: true, payment: pago });
    m.process.mockResolvedValue({ propio: true, estado: 'saldada' });
});

describe('webhook de Mercado Pago', () => {
    it('sin secreto configurado falla cerrado', async () => {
        delete process.env.MP_WEBHOOK_SECRET;
        expect((await aviso()).status).toBe(503);
        expect(m.read).not.toHaveBeenCalled();
    });

    it('sin firma válida no lee nada', async () => {
        expect((await aviso({ firma: false })).status).toBe(401);
        expect(m.resolve).not.toHaveBeenCalled();
    });

    it('resuelve la organización por cord_org y user_id, lee el pago con ella y lo aplica', async () => {
        const res = await aviso({ query: `&cord_org=${orgA}` });
        expect(res.status).toBe(200);
        expect(m.resolve.mock.calls[0][1]).toEqual([orgA, '777']);
        expect(m.read).toHaveBeenCalledWith(orgA, '9001');
        expect(m.process).toHaveBeenCalledWith(orgA, '777', pago);
    });

    it('un cord_org que no es uuid se ignora: no se manda a la base', async () => {
        await aviso({ query: '&cord_org=drop%20table' });
        expect(m.resolve.mock.calls[0][1]).toEqual([null, '777']);
    });

    it('si el pago no es de la primera organización, prueba la siguiente', async () => {
        m.resolve.mockResolvedValue([{ org_id: orgA, mp_user_id: '777' }, { org_id: orgB, mp_user_id: '777' }]);
        m.process.mockResolvedValueOnce({ propio: false, estado: 'ajeno' }).mockResolvedValueOnce({ propio: true, estado: 'saldada' });
        const res = await aviso();
        expect(res.status).toBe(200);
        expect(m.process.mock.calls.map((c) => c[0])).toEqual([orgA, orgB]);
    });

    it('el proveedor no respondió: 503 para que Mercado Pago reintente (antes: 200 y el pago perdido)', async () => {
        m.read.mockResolvedValue({ ok: false, reason: 'temporal' });
        expect((await aviso()).status).toBe(503);
    });

    it('la base falló al resolver o al aplicar: 503', async () => {
        m.resolve.mockRejectedValueOnce(new Error('neon caído'));
        expect((await aviso()).status).toBe(503);
        m.process.mockRejectedValueOnce(new Error('neon caído'));
        expect((await aviso()).status).toBe(503);
    });

    it('un pago que ninguna organización reconoce se acusa con 200 (no es de Cord)', async () => {
        m.read.mockResolvedValue({ ok: false, reason: 'ajeno' });
        const res = await aviso();
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ignorado: 'ajeno' });
    });

    it('sin organización conectada a esa cuenta se acusa con 200; la conciliación lo verá al reconectar', async () => {
        m.resolve.mockResolvedValue([]);
        expect((await aviso()).status).toBe(200);
        expect(m.read).not.toHaveBeenCalled();
    });

    it('la organización dueña perdió su autorización: se avisa a Ops', async () => {
        m.read.mockResolvedValue({ ok: false, reason: 'sin_credenciales' });
        expect((await aviso()).status).toBe(200);
        expect(m.alert).toHaveBeenCalledWith('Pago de Mercado Pago sin credencial para leerlo', expect.stringContaining(orgA));
    });

    it('un aviso que no es de pago se acusa sin leer nada', async () => {
        const ts = Math.floor(Date.now() / 1000);
        const v1 = createHmac('sha256', SECRET).update(`id:9001;request-id:req-1;ts:${ts};`).digest('hex');
        const url = new URL('https://cordhq.app/api/mercadopago/webhook?data.id=9001&type=merchant_order');
        const request = new Request(url, { method: 'POST', headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' }, body: '{}' });
        const res = await POST({ request, url } as any) as Response;
        expect(res.status).toBe(200);
        expect(m.read).not.toHaveBeenCalled();
    });
});
