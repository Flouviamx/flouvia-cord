import { beforeEach, describe, expect, it, vi } from 'vitest';

// /api/org/recordatorios: la API acepta exactamente lo que la pantalla ofrece
// (vocabulario cerrado y tope), con permiso, y solo toca lo que viene.

const m = vi.hoisted(() => ({
    denegado: null as Response | null,
    guardados: [] as unknown[],
    pausas: [] as unknown[],
    guardadas: [-7, -1, 3, 7, 14, 30] as number[],
    clienteExiste: true,
}));
vi.mock('../src/lib/queries', () => ({ requirePerm: async () => m.denegado }));
vi.mock('../src/lib/db', () => ({ getActiveOrgId: async () => 'org-1', logAudit: async () => {}, reqIp: () => null }));
vi.mock('../src/lib/recordatorios-db', () => ({
    leerAjustesRecordatorios: async () => ({ activos: true, etapas: m.guardadas, pausados: [] }),
    guardarAjustesRecordatorios: async (_o: string, c: unknown) => { m.guardados.push(c); },
    pausarCliente: async (_o: string, id: string, pausado: boolean) => { m.pausas.push({ id, pausado }); return m.clienteExiste; },
}));

const { PATCH, POST } = await import('../src/pages/api/org/recordatorios');
const pedir = async (fn: any, body: unknown) => {
    const res: Response = await fn({ request: new Request('https://cordhq.app/api/org/recordatorios', { method: 'PATCH', body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
};
const CLIENTE = '55555555-5555-4555-8555-555555555551';

beforeEach(() => { m.denegado = null; m.guardados = []; m.pausas = []; m.guardadas = [-7, -1, 3, 7, 14, 30]; m.clienteExiste = true; });

describe('guardar el calendario', () => {
    it('guarda las etapas ordenadas y el interruptor', async () => {
        const r = await pedir(PATCH, { activos: false, etapas: [30, -14, 0] });
        expect(r).toEqual({ status: 200, body: { ok: true, activos: false, etapas: [-14, 0, 30] } });
        expect(m.guardados).toEqual([{ activos: false, etapas: [-14, 0, 30] }]);
    });

    it('solo toca lo que viene', async () => {
        await pedir(PATCH, { activos: true });
        expect(m.guardados).toEqual([{ activos: true }]);
    });

    it('rechaza lo que la pantalla no ofrece, vacío o de más, sin guardar', async () => {
        expect(await pedir(PATCH, { etapas: [5] })).toMatchObject({ status: 400, body: { field: 'etapas', code: 'fuera_de_menu' } });
        expect(await pedir(PATCH, { etapas: [] })).toMatchObject({ status: 400, body: { code: 'vacio' } });
        const r = await pedir(PATCH, { etapas: [-14, -7, -3, -1, 0, 1, 3, 7, 14] });
        expect(r).toMatchObject({ status: 400, body: { code: 'demasiadas' } });
        expect(r.body.error).toContain('8');
        expect(await pedir(PATCH, { activos: 'si' })).toMatchObject({ status: 400, body: { field: 'activos' } });
        expect(await pedir(PATCH, {})).toMatchObject({ status: 400 });
        expect(m.guardados).toEqual([]);
    });

    it('conserva una etapa que la cuenta ya tenía guardada fuera del menú', async () => {
        m.guardadas = [-7, 5];
        expect(await pedir(PATCH, { etapas: [-7, 5] })).toMatchObject({ status: 200 });
        expect(await pedir(PATCH, { etapas: [-7, 6] })).toMatchObject({ status: 400 });
    });

    it('sin permiso no guarda', async () => {
        m.denegado = new Response(JSON.stringify({ error: 'No tienes permiso para esta acción.' }), { status: 403 });
        expect((await pedir(PATCH, { activos: false })).status).toBe(403);
        expect(m.guardados).toEqual([]);
    });
});

describe('pausar a un cliente', () => {
    it('pausa y reanuda con la lista "No escribir a"', async () => {
        expect(await pedir(POST, { cliente_id: CLIENTE, pausado: true })).toEqual({ status: 200, body: { ok: true, pausado: true } });
        expect(await pedir(POST, { cliente_id: CLIENTE, pausado: false })).toEqual({ status: 200, body: { ok: true, pausado: false } });
        expect(m.pausas).toEqual([{ id: CLIENTE, pausado: true }, { id: CLIENTE, pausado: false }]);
    });

    it('valida el cliente y su organización', async () => {
        expect((await pedir(POST, { cliente_id: 'x', pausado: true })).status).toBe(400);
        expect((await pedir(POST, { cliente_id: CLIENTE })).status).toBe(400);
        m.clienteExiste = false;
        expect((await pedir(POST, { cliente_id: CLIENTE, pausado: true })).status).toBe(404);
    });
});
