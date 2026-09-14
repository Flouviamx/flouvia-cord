import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const m = vi.hoisted(() => ({ db: null as any, concurrent: null as null | string, cancel: vi.fn(), reserve: vi.fn() }));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => {
        const rows = await m.db.transaction(async (tx: any) => {
            await tx.query("select set_config('app.org_id',$1,true)", [org]);
            const out = [];
            for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
            return out;
        });
        if (m.concurrent && queries.some((q) => /^select (id, status, version|c\.id, c\.folio, c\.aprob_estado)/.test(q.text.trim()))) {
            const mutation = m.concurrent;
            m.concurrent = null;
            await m.db.exec(mutation);
        }
        return rows;
    },
    logAudit: vi.fn(),
}));
vi.mock('../src/lib/queries', () => ({ invalidateMoneyCaches: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchQuoteEvent: vi.fn(), dispatchQuoteEventFrom: vi.fn() }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ reserveUsage: m.reserve, cancelUsage: m.cancel }));
vi.mock('../src/lib/org-entitlements', () => ({ requireEntitlement: async () => null }));
vi.mock('../src/lib/fiscal/emit', () => ({ emitFiscalDocument: vi.fn() }));
vi.mock('../src/lib/cotizaciones', () => ({
    MAX_ITEMS: 200,
    QuoteError: class extends Error { status = 400; },
    assertClienteDeOrg: async () => {},
    productosDeOrg: async () => new Set<string>(),
}));
vi.mock('../src/lib/cobros', () => ({ materializeAnticipoCobros: vi.fn() }));
vi.mock('../src/lib/impuestos-db', () => ({
    taxCatalogFor: async () => ({ resolve: () => 0, defaultRate: 0, retenciones: [] }),
    TaxCatalogUnavailableError: class extends Error {},
}));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn() }));
vi.mock('../src/lib/fx/FXService', () => ({ FXService: { getExchangeRate: vi.fn() }, FXUnavailableError: class extends Error {} }));
vi.mock('../src/lib/email', () => ({ notifyQuoteSent: async () => ({ sent: false }) }));

const { runQuoteAction } = await import('../src/lib/actions/quotes');

const ORG = '00000000-0000-4000-8000-000000000001';
const QUOTE = '00000000-0000-4000-8000-000000000003';
const ctx = { orgId: ORG, origin: 'https://cord.test' };
const one = async (q: string) => (await m.db.query(q)).rows[0];

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key, sandbox_of uuid, is_demo boolean default false, country_code text);
        create table cotizaciones(id uuid primary key, org_id uuid, folio text, status text, version int default 1,
            base_currency text, fiscal_currency text, moneda text, fx_rate numeric, fx_rate_source text, fx_locked_until timestamptz,
            sent_at timestamptz, approved_at timestamptz, paid_at timestamptz, payment_method text, aprob_estado text,
            cliente_id uuid, terminos text, vigencia date, notas text, subtotal numeric, iva numeric, total numeric,
            retencion_total numeric, retenciones_snapshot jsonb, iva_incluido boolean, anticipo_pct numeric, es_recurrente boolean);
        create table eventos(org_id uuid, cotizacion_id uuid, tipo text, detalle text);
        create table cotizacion_items(cotizacion_id uuid, producto_id uuid, descripcion text, cantidad numeric, precio_unitario numeric,
            precio_negociado numeric, costo_unitario numeric, orden int, tax_rate numeric);
        create table cotizacion_versiones(cotizacion_id uuid, org_id uuid, version int, subtotal numeric, iva numeric, total numeric,
            items jsonb, notas text, iva_incluido boolean);
        create table cotizacion_cobros(cotizacion_id uuid, status text, stripe_payment_intent_id text);
        create function falla_item() returns trigger language plpgsql as $$
        begin if new.descripcion = 'FALLA' then raise exception 'falla simulada'; end if; return new; end $$;
        create trigger trg_falla_item before insert on cotizacion_items for each row execute function falla_item();
        insert into orgs(id) values ('${ORG}');`);
}, 15000);

beforeEach(async () => {
    m.concurrent = null;
    vi.clearAllMocks();
    m.reserve.mockResolvedValue({ ok: true, id: 'res-1' });
    await m.db.exec(`
        delete from eventos; delete from cotizacion_items; delete from cotizacion_versiones; delete from cotizaciones;
        insert into cotizaciones(id, org_id, folio, status, base_currency, fiscal_currency, fx_rate, total, aprob_estado)
            values ('${QUOTE}', '${ORG}', 'COT-1', 'sent', 'MXN', 'MXN', 1, 100, null);
        insert into cotizacion_items(cotizacion_id, descripcion, cantidad, precio_unitario, orden) values ('${QUOTE}', 'original', 1, 100, 0);
        insert into cotizacion_versiones(cotizacion_id, org_id, version, total) values ('${QUOTE}', '${ORG}', 1, 100);`);
});

afterAll(async () => { await m.db.close(); });

describe('transiciones contra Postgres', () => {
    it('aprueba cuando el estado sigue siendo el esperado', async () => {
        const r = await runQuoteAction(ctx, QUOTE, { action: 'approve' });
        expect(r.status).toBe(200);
        expect((await one('select status from cotizaciones')).status).toBe('approved');
        expect((await one("select count(*)::int n from eventos where tipo = 'approved'")).n).toBe(1);
    });

    it('si otra petición rechaza entre la lectura y la escritura, no pisa el rechazo', async () => {
        m.concurrent = "update cotizaciones set status = 'rejected'";
        const r = await runQuoteAction(ctx, QUOTE, { action: 'approve' });
        expect(r.status).toBe(409);
        expect((await one('select status, approved_at from cotizaciones')).status).toBe('rejected');
        expect((await one('select count(*)::int n from eventos')).n).toBe(0);
    });

    it('un envío concurrente libera el cupo y no deja la cotización enviada dos veces', async () => {
        await m.db.exec("update cotizaciones set status = 'draft'");
        m.concurrent = "update cotizaciones set status = 'sent', sent_at = now()";
        const r = await runQuoteAction(ctx, QUOTE, { action: 'send' });
        expect(r.status).toBe(409);
        expect(m.cancel).toHaveBeenCalledWith(ORG, 'res-1');
        expect((await one('select count(*)::int n from eventos')).n).toBe(0);
    });

    it('no toca cotizaciones de otra organización aunque coincida el id', async () => {
        const r = await runQuoteAction({ ...ctx, orgId: '00000000-0000-4000-8000-000000000009' }, QUOTE, { action: 'approve' });
        expect(r.status).toBe(404);
        expect((await one('select status from cotizaciones')).status).toBe('sent');
    });
});

describe('solicitud de aprobación contra Postgres', () => {
    beforeEach(async () => { await m.db.exec("update cotizaciones set status = 'draft', aprob_estado = 'pendiente'"); });

    it('aprobar la solicitud envía y registra un solo evento', async () => {
        expect((await runQuoteAction(ctx, QUOTE, { action: 'approve_request' })).status).toBe(200);
        const q = await one('select status, aprob_estado from cotizaciones');
        expect(q).toMatchObject({ status: 'sent', aprob_estado: 'aprobada' });
        expect((await one('select count(*)::int n from eventos')).n).toBe(1);
    });

    it('si otro gerente la rechaza al mismo tiempo, la aprobación no la envía', async () => {
        m.concurrent = "update cotizaciones set aprob_estado = 'rechazada'";
        expect((await runQuoteAction(ctx, QUOTE, { action: 'approve_request' })).status).toBe(409);
        const q = await one('select status, aprob_estado from cotizaciones');
        expect(q).toMatchObject({ status: 'draft', aprob_estado: 'rechazada' });
        expect((await one('select count(*)::int n from eventos')).n).toBe(0);
    });
});

describe('edición de líneas contra Postgres', () => {
    beforeEach(async () => { await m.db.exec("update cotizaciones set status = 'draft'"); });

    it('reemplaza encabezado, líneas y versión juntos', async () => {
        const r = await runQuoteAction(ctx, QUOTE, { action: 'update_draft', items: [{ descripcion: 'nueva', cantidad: 2, precio_unitario: 50 }] });
        expect(r.status).toBe(200);
        expect((await m.db.query('select descripcion from cotizacion_items')).rows).toEqual([{ descripcion: 'nueva' }]);
    });

    it('si falla una línea no se pierde nada: ni líneas ni encabezado', async () => {
        await expect(runQuoteAction(ctx, QUOTE, {
            action: 'update_draft',
            notas: 'no debería guardarse',
            items: [{ descripcion: 'buena', cantidad: 1, precio_unitario: 1 }, { descripcion: 'FALLA', cantidad: 1, precio_unitario: 1 }],
        })).rejects.toThrow('falla simulada');
        expect((await m.db.query('select descripcion from cotizacion_items')).rows).toEqual([{ descripcion: 'original' }]);
        expect((await one('select notas, total from cotizaciones'))).toMatchObject({ notas: null });
        expect(Number((await one('select total from cotizaciones')).total)).toBe(100);
    });
});
