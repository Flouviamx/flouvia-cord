import { beforeEach, describe, expect, it, vi } from 'vitest';

type Q = { text: string; values: unknown[] };

const m = vi.hoisted(() => ({
    queries: [] as Q[],
    rows: new Map<RegExp, unknown[]>(),
    perm: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
    withOrgTx: async (_org: string, ...qs: Q[]) => qs.map((q) => {
        m.queries.push(q);
        for (const [re, rows] of m.rows) if (re.test(q.text)) return rows;
        return [];
    }),
    getActiveOrgId: async () => 'org-a',
    reqIp: () => '127.0.0.1',
    logAudit: vi.fn(),
}));
vi.mock('../src/lib/queries', () => ({ requirePermAny: m.perm }));
vi.mock('../src/lib/context', () => ({ currentLocale: () => 'es' }));

const { POST, PATCH, DELETE } = await import('../src/pages/api/tareas');

const QUOTE = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';
const call = (fn: any, method: string, body: Record<string, unknown>) =>
    fn({ request: new Request('https://cord.test/api/tareas', { method, body: JSON.stringify(body) }) }) as Promise<Response>;

beforeEach(() => {
    vi.clearAllMocks();
    m.queries.length = 0;
    m.rows.clear();
    m.perm.mockResolvedValue(null);
    m.rows.set(/insert into tareas/, [{ id: TASK }]);
});

describe('/api/tareas', () => {
    it.each([['POST', POST, { titulo: 'x' }], ['PATCH', PATCH, { id: TASK, done: true }], ['DELETE', DELETE, { id: TASK }]])(
        '%s exige un permiso de escritura y sin él no toca la base', async (method, fn, body) => {
            m.perm.mockResolvedValue(new Response('{}', { status: 403 }));
            expect((await call(fn, method as string, body as any)).status).toBe(403);
            expect(m.perm).toHaveBeenCalledWith(['cotizar', 'cobranza', 'clientes']);
            expect(m.queries).toHaveLength(0);
        });

    it('no liga una tarea a la cotización de otra org', async () => {
        expect((await call(POST, 'POST', { titulo: 'Llamar', cotizacion_id: QUOTE })).status).toBe(404);
        expect(m.queries.some((q) => /insert into tareas/.test(q.text))).toBe(false);
        expect(m.queries[0].values).toEqual([QUOTE, 'org-a']);
    });

    it('liga la tarea a una cotización propia', async () => {
        m.rows.set(/from cotizaciones/, [{ id: QUOTE }]);
        const res = await call(POST, 'POST', { titulo: 'Llamar', cotizacion_id: QUOTE, due_date: '2026-10-01' });
        expect(await res.json()).toEqual({ id: TASK });
    });

    it('rechaza ids y fechas mal formadas sin consultar la base', async () => {
        expect((await call(POST, 'POST', { titulo: 'x', cotizacion_id: "1' or '1'='1" })).status).toBe(404);
        expect((await call(POST, 'POST', { titulo: 'x', due_date: 'mañana' })).status).toBe(400);
        expect((await call(PATCH, 'PATCH', { id: 'abc', done: true })).status).toBe(404);
        expect((await call(DELETE, 'DELETE', { id: 'abc' })).status).toBe(404);
        expect(m.queries).toHaveLength(0);
    });
});
