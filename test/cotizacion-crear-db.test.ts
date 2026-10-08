import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const m = vi.hoisted(() => ({ db: null as any, reserve: vi.fn(), cancel: vi.fn(), notify: vi.fn(), approvals: true }));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const out = [];
        for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
        return out;
    }),
    logAudit: vi.fn(),
}));
vi.mock('../src/lib/email', () => ({ notifyQuoteSent: m.notify }));
vi.mock('../src/lib/webhooks', () => ({ dispatchEvent: vi.fn(), dispatchQuoteEvent: vi.fn() }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ reserveUsage: m.reserve, cancelUsage: m.cancel }));
vi.mock('../src/lib/context', () => ({ currentUserId: () => null }));
vi.mock('../src/lib/fmt-server', () => ({ intlLocale: () => 'es-MX' }));
vi.mock('../src/lib/org-entitlements', () => ({
    assertResourceCapacity: async () => {},
    checkEntitlement: async () => ({ ok: m.approvals }),
    parsedResourceLimit: () => null,
    ResourceLimitReachedError: class extends Error {},
}));
vi.mock('../src/lib/impuestos-db', () => ({
    taxCatalogFor: async () => ({ resolve: () => 0.16, defaultRate: 0.16, retenciones: [] }),
    TaxCatalogUnavailableError: class extends Error {},
}));
vi.mock('../src/lib/fx/FXService', () => ({ FXService: { getExchangeRate: vi.fn() }, FXUnavailableError: class extends Error {} }));

const { createCotizacion } = await import('../src/lib/cotizaciones');

const ORG = '00000000-0000-4000-8000-000000000001';
const opts = { origin: 'https://cord.test', ip: '127.0.0.1' };
const linea = (precio = 100, nego: number | null = null, descripcion = 'Servicio') =>
    ({ descripcion, cantidad: 1, precio_unitario: precio, precio_negociado: nego });

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key, quote_prefix text default 'COT', moneda text default 'MXN',
            sandbox_of uuid, is_demo boolean default false,
            aprob_descuento_max numeric default 0, aprob_monto_max numeric default 0, aprob_margen_min numeric default 0);
        create table cotizaciones(id uuid primary key default gen_random_uuid(), org_id uuid, cliente_id uuid, folio text not null,
            status text, subtotal numeric, iva numeric, total numeric, terminos text, vigencia timestamptz, notas text,
            sent_at timestamptz, aprob_estado text, aprob_motivo text, moneda text, base_currency text, fiscal_currency text,
            fx_rate numeric, fx_rate_source text, fx_locked_until timestamptz, iva_incluido boolean, anticipo_pct numeric,
            es_recurrente boolean, creado_por uuid, retencion_total numeric, retenciones_snapshot jsonb,
            public_token text default md5(random()::text));
        create table cotizacion_items(cotizacion_id uuid, producto_id uuid, descripcion text, cantidad numeric, precio_unitario numeric,
            precio_negociado numeric, costo_unitario numeric, orden int, tax_rate numeric);
        create table cotizacion_versiones(cotizacion_id uuid, org_id uuid, version int, subtotal numeric, iva numeric, total numeric,
            items jsonb, notas text, iva_incluido boolean);
        create table eventos(org_id uuid, cotizacion_id uuid, tipo text, detalle text);
        create function falla_item() returns trigger language plpgsql as $$
        begin if new.descripcion = 'FALLA' then raise exception 'falla simulada'; end if; return new; end $$;
        create trigger trg_falla_item before insert on cotizacion_items for each row execute function falla_item();
        insert into orgs(id) values ('${ORG}');`);
}, 15000);

beforeEach(async () => {
    vi.clearAllMocks();
    m.approvals = true;
    m.reserve.mockResolvedValue({ ok: true, id: 'res-1' });
    m.notify.mockResolvedValue({ sent: false });
    await m.db.exec(`delete from eventos; delete from cotizacion_items; delete from cotizacion_versiones; delete from cotizaciones;
        update orgs set quote_prefix = 'COT', aprob_descuento_max = 0, aprob_monto_max = 0, moneda = 'MXN';`);
});

afterAll(async () => { await m.db.close(); });

describe('folio', () => {
    it('dos altas simultáneas no comparten folio', async () => {
        const [a, b] = await Promise.all([
            createCotizacion(ORG, { items: [linea()] }, opts),
            createCotizacion(ORG, { items: [linea()] }, opts),
        ]);
        expect(new Set([a.folio, b.folio]).size).toBe(2);
        expect([a.folio, b.folio].sort()).toEqual(['COT-0001', 'COT-0002']);
    });

    it('un prefijo con dígitos no se mezcla con el consecutivo', async () => {
        await m.db.exec("update orgs set quote_prefix = 'Q2026'");
        await createCotizacion(ORG, { items: [linea()] }, opts);
        const b = await createCotizacion(ORG, { items: [linea()] }, opts);
        expect(b.folio).toBe('Q2026-0002');
    });
});

describe('alta atómica', () => {
    it('si falla una línea no queda una cotización a medias', async () => {
        await expect(createCotizacion(ORG, { items: [linea(), linea(1, null, 'FALLA')] }, opts)).rejects.toThrow('falla simulada');
        expect((await m.db.query('select count(*)::int n from cotizaciones')).rows[0].n).toBe(0);
        expect((await m.db.query('select count(*)::int n from eventos')).rows[0].n).toBe(0);
    });

    it('si falla después de reservar el envío, el envío se libera', async () => {
        await expect(createCotizacion(ORG, { send: true, items: [linea(1, null, 'FALLA')] }, opts)).rejects.toThrow();
        expect(m.cancel).toHaveBeenCalledWith(ORG, 'res-1');
    });
});

describe('envíos y aprobación al crear', () => {
    it('crear con "Enviar" consume un envío', async () => {
        const r = await createCotizacion(ORG, { send: true, items: [linea()] }, opts);
        expect(r.needsApproval).toBe(false);
        expect(m.reserve).toHaveBeenCalledWith(ORG, 'envios', 1);
        expect((await m.db.query('select status from cotizaciones')).rows[0].status).toBe('sent');
    });

    it('sin envíos disponibles no crea ni envía', async () => {
        m.reserve.mockResolvedValue({ ok: false, reason: 'Llegaste al límite de envíos de tu plan.' });
        const err = await createCotizacion(ORG, { send: true, items: [linea()] }, opts).catch((e) => e);
        expect(err.status).toBe(402);
        expect((await m.db.query('select count(*)::int n from cotizaciones')).rows[0].n).toBe(0);
    });

    it('un borrador no consume envíos', async () => {
        await createCotizacion(ORG, { items: [linea()] }, opts);
        expect(m.reserve).not.toHaveBeenCalled();
    });

    it('un descuento sobre el tope queda pendiente y no consume envío', async () => {
        await m.db.exec('update orgs set aprob_descuento_max = 10');
        const r = await createCotizacion(ORG, { send: true, items: [linea(100, 70)] }, opts);
        expect(r.needsApproval).toBe(true);
        expect(r.motivo).toMatch(/descuento 30%/);
        expect(m.reserve).not.toHaveBeenCalled();
        const q = (await m.db.query('select status, aprob_estado from cotizaciones')).rows[0];
        expect(q).toMatchObject({ status: 'draft', aprob_estado: 'pendiente' });
    });

    it('el tope de monto se compara en la divisa del negocio', async () => {
        await m.db.exec('update orgs set aprob_monto_max = 50000');
        const { FXService } = await import('../src/lib/fx/FXService');
        (FXService.getExchangeRate as any).mockResolvedValue({ appliedRate: 20, source: 'spot', lockedUntil: null });
        // USD 3,000 + IVA = USD 3,480 ≈ MXN 69,600: rebasa el tope de MXN 50,000.
        const r = await createCotizacion(ORG, { send: true, base_currency: 'USD', fiscal_currency: 'MXN', items: [linea(3000)] }, opts);
        expect(r.needsApproval).toBe(true);
    });
});

describe('duplicar es un alta completa', () => {
    it('conserva divisa, impuesto por línea, IVA incluido y costo; marca el origen', async () => {
        const { FXService } = await import('../src/lib/fx/FXService');
        (FXService.getExchangeRate as any).mockResolvedValue({ appliedRate: 18, source: 'spot', lockedUntil: null });
        const original = await createCotizacion(ORG, {
            base_currency: 'USD', fiscal_currency: 'MXN', iva_incluido: true,
            items: [{ ...linea(116), costo_unitario: 40, tax_rate: 0 }],
        }, opts);
        const copia = await createCotizacion(ORG, {
            base_currency: 'USD', fiscal_currency: 'MXN', iva_incluido: true,
            items: [{ ...linea(116), costo_unitario: 40, tax_rate: 0 }],
        }, { ...opts, duplicateOf: { id: original.id, folio: original.folio } });
        const q = (await m.db.query('select base_currency, iva_incluido, total from cotizaciones where id = $1', [copia.id])).rows[0];
        expect(q).toMatchObject({ base_currency: 'USD', iva_incluido: true });
        const it = (await m.db.query('select tax_rate, costo_unitario from cotizacion_items where cotizacion_id = $1', [copia.id])).rows[0];
        expect(Number(it.costo_unitario)).toBe(40);
        const ev = (await m.db.query("select detalle from eventos where cotizacion_id = $1 and tipo = 'created'", [copia.id])).rows[0];
        expect(ev.detalle).toBe(`Duplicada de ${original.folio}`);
    });
});

describe('correcciones de la revisión', () => {
    it('el folio 10000 no se trunca', async () => {
        await m.db.exec(`insert into cotizaciones (org_id, folio, status) values ('${ORG}', 'COT-9999', 'draft')`);
        const r = await createCotizacion(ORG, { items: [linea()] }, opts);
        expect(r.folio).toBe('COT-10000');
    });

    it('una venta en otra divisa sin tasa propia se convierte con la de hoy antes de comparar el tope', async () => {
        await m.db.exec('update orgs set aprob_monto_max = 50000');
        const { FXService } = await import('../src/lib/fx/FXService');
        (FXService.getExchangeRate as any).mockResolvedValue({ appliedRate: 18, source: 'spot', lockedUntil: null });
        // USD 1,000 + IVA = USD 1,160 ≈ MXN 20,880: no rebasa el tope.
        const r = await createCotizacion(ORG, { send: true, base_currency: 'USD', fiscal_currency: 'USD', items: [linea(1000)] }, opts);
        expect(r.needsApproval).toBe(false);
    });
});
