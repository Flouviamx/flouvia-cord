import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn(), system: vi.fn(), draft: vi.fn(), issue: vi.fn(), email: vi.fn(), gate: vi.fn(), reserve: vi.fn(), cancel: vi.fn(), flush: vi.fn() }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, withSystemTx: m.system, sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }) }));
vi.mock('../src/lib/fiscal/invoices', () => ({ createInvoiceDraft: m.draft, finalizeInvoice: m.issue }));
vi.mock('../src/lib/email', () => ({ notifyInvoiceIssued: m.email }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: vi.fn() }));
vi.mock('../src/lib/org-entitlements', () => ({ checkEntitlement: m.gate }));
vi.mock('../src/lib/billing', () => ({ reserveUsage: m.reserve, cancelUsage: m.cancel, flushUsageReservation: m.flush }));
import { recurrenceDay, proximaEmision } from '../src/lib/fiscal/recurrence-calendar';
import { runRecurrencias, createRecurrencia } from '../src/lib/fiscal/recurrencias';
const row = (extra = {}) => ({ id: 'rec-a', org_id: 'org-a', cliente_id: 'client-a', next_run_at: new Date(2026, 8, 6),
    updated_at: '2026-08-01T00:00:00Z', cadencia: 'mensual', dia_mes: 6, dias_credito: 30, currency: 'MXN', org_country_code: 'MX', lineas_snapshot: [], ...extra });
beforeEach(() => {
    vi.clearAllMocks(); m.tx.mockReset(); m.system.mockResolvedValue([[row()]]);
    m.tx.mockResolvedValue([[{ id: 'rec-a' }]]); m.gate.mockResolvedValue({ ok: true });
    m.draft.mockResolvedValue({ ok: true, documentId: 'doc-a' }); m.issue.mockResolvedValue({ emitted: true, billable: true });
    m.reserve.mockResolvedValue({ ok: true, id: 'usage-a' }); m.email.mockResolvedValue(true);
});
describe('calendario de recurrencias', () => {
    it.each([new Date('2026-09-06T00:00:00Z'), '2026-09-06'])('acepta DATE sin convertirlo a un string local: %s', value => expect(recurrenceDay(value)).toBe('2026-09-06'));
    it.each(['2026-02-30', '2026-13-01', '06/09/2026', new Date(NaN)])('rechaza fecha inválida %s', value => expect(() => recurrenceDay(value)).toThrow());
    it.each([['mensual', '2027-01-28'], ['trimestral', '2027-03-28'], ['anual', '2027-12-28']] as const)('cadencia %s conserva el día y cruza el año', (cadence, expected) => {
        expect(recurrenceDay(proximaEmision(new Date('2026-12-28T00:00:00Z'), cadence, 31))).toBe(expected);
    });
});
describe('ejecución de un periodo', () => {
    it('conserva microsegundos en la versión de edición usada por el claim', async () => {
        const version = '2026-08-01 00:00:00.123456+00';
        m.system.mockResolvedValue([[row({ updated_at: version })]]);
        await runRecurrencias();
        expect(m.system.mock.calls[0][0].text).toContain('r.updated_at::text as updated_at');
        expect(m.tx.mock.calls.find(([, q]) => q.text.includes('returning r.id'))![1].values).toContain(version);
    });
    it('solo el ganador del claim emite y su vencimiento usa la fecha original', async () => {
        let claimed = false;
        m.tx.mockImplementation(async (_org, query) => {
            if (query.text.includes('returning r.id')) { if (claimed) return [[]]; claimed = true; }
            return [[{ id: 'rec-a' }]];
        });
        const result = await Promise.all([runRecurrencias(), runRecurrencias()]);
        expect(result.reduce((n, r) => n + r.emitidas, 0)).toBe(1);
        expect(m.draft).toHaveBeenCalledTimes(1);
        expect(m.draft).toHaveBeenCalledWith('org-a', expect.objectContaining({ dueDate: '2026-10-06' }));
        const claim = m.tx.mock.calls.find(([, q]) => q.text.includes('returning r.id'))![1];
        expect(claim.text).toContain('r.updated_at ='); expect(claim.values).toContain('2026-10-06');
        expect(m.issue).toHaveBeenCalledTimes(1); expect(m.reserve).not.toHaveBeenCalled();
    });
    it('una fecha defectuosa no interrumpe las demás recurrencias', async () => {
        m.system.mockResolvedValue([[row({ id: 'bad', next_run_at: 'invalid' }), row()]]);
        expect(await runRecurrencias()).toMatchObject({ emitidas: 1, fallidas: 1 });
    });
    it('si se pausó o editó después del barrido, no emite ni consume uso', async () => {
        m.tx.mockResolvedValue([[]]); await runRecurrencias();
        expect(m.draft).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled();
    });
    it('no envía ni duplica compensaciones cuando el dominio rechaza la emisión', async () => {
        m.issue.mockResolvedValue({ emitted: false, error: 'No emitida' });
        expect((await runRecurrencias()).fallidas).toBe(1);
        expect(m.cancel).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
    });
    it('una emisión de prueba no consume timbrado', async () => {
        m.issue.mockResolvedValue({ emitted: true, billable: false }); await runRecurrencias();
        expect(m.cancel).not.toHaveBeenCalled(); expect(m.flush).not.toHaveBeenCalled();
    });
    it('conserva el aviso cuando la factura existe pero el correo falla', async () => {
        m.email.mockResolvedValue(false);
        expect(await runRecurrencias()).toMatchObject({ emitidas: 1, enviadas: 0, detalle: [{ ok: true, error: 'correo_no_enviado' }] });
        expect(m.tx.mock.calls.some(([, q]) => q.values.includes('Factura emitida; falta reenviar el correo desde su detalle.'))).toBe(true);
    });
    it('no emite sin plan o sin reserva disponible', async () => {
        m.issue.mockResolvedValue({ emitted: false, error: 'Límite' }); expect((await runRecurrencias()).fallidas).toBe(1); expect(m.email).not.toHaveBeenCalled();
        m.gate.mockResolvedValue({ ok: false }); m.draft.mockClear(); await runRecurrencias(); expect(m.draft).not.toHaveBeenCalled();
    });
    it('rechaza fechas imposibles y finales anteriores sin escribir', async () => {
        const base = { clienteId: 'client-a', nombre: 'Mensual', lineas: [{ descripcion: 'Servicio', cantidad: 1, precioUnitario: 100 }], currency: 'MXN', cadencia: 'mensual' as const, diaMes: 6, diasCredito: 30 };
        expect((await createRecurrencia('org-a', { ...base, primeraEmision: '2026-02-30' })).ok).toBe(false);
        expect((await createRecurrencia('org-a', { ...base, primeraEmision: '2026-09-06', endDate: '2026-08-06' })).ok).toBe(false);
        expect(m.tx).not.toHaveBeenCalled();
    });
});

it('el claim real de PostgreSQL se gana una vez y respeta pausa y ediciones', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    try {
        await db.exec("create table orgs(id text primary key,sandbox_of text); create table documento_recurrencias(id text,org_id text,activa boolean,next_run_at date,end_date date,updated_at timestamptz); insert into orgs values('org-a',null); insert into documento_recurrencias values('rec-a','org-a',true,'2020-09-06',null,'2020-08-01T00:00:00Z')");
        m.system.mockResolvedValue([[row({ next_run_at: '2020-09-06', updated_at: '2020-08-01T00:00:00Z' })]]);
        await runRecurrencias();
        const claim = m.tx.mock.calls.find(([, q]) => q.text.includes('returning r.id'))![1];
        let n = 0; const query = claim.text.replace(/\?/g, () => `$${++n}`);
        expect((await db.query(query, claim.values)).rows).toHaveLength(1);
        expect((await db.query(query, claim.values)).rows).toHaveLength(0);
        await db.exec("update documento_recurrencias set next_run_at='2020-09-06', updated_at='2020-08-01T00:00:00Z',activa=false");
        expect((await db.query(query, claim.values)).rows).toHaveLength(0);
        await db.exec("update documento_recurrencias set activa=true,updated_at='2020-08-02T00:00:00Z'");
        expect((await db.query(query, claim.values)).rows).toHaveLength(0);
    } finally { await db.close(); }
}, 15000);
