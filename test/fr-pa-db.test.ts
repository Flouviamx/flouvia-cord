// Emisión por plataforma autorizada en Francia (src/lib/fiscal/transmision/)
// contra Postgres real (PGlite) con el esquema de db/schema.sql tal cual, y una
// Iopole SIMULADA a nivel HTTP: el adaptador real (iopole/cliente.ts) habla
// con un `fetch` que solo atiende las rutas que declara la OpenAPI fijada en
// scripts/fixtures/iopole/, valida cada cuerpo contra su esquema y valida sus
// propias respuestas contra el de la respuesta. Lo que la especificación no
// documenta (qué hace Iopole por dentro) se simula con lo mínimo: acepta,
// asigna ids, guarda los estados.
//
// Cubre: interruptor y "Próximamente", alta (y su respuesta perdida resuelta
// por consulta), aviso de onboarding, envío de la factura entre empresas y su
// idempotencia, respuesta perdida resuelta por CONSULTA (nunca reenvío),
// descarte y reenvío solo tras consultar, factura bloqueada que no se
// reevalúa, estados 200/213 con su motivo y su renglón en la historia, nota de
// crédito de una factura rechazada (anulación contable, no se transmite),
// cobros 212 (y la devolución en negativo), e-reporting 10.1/10.2/10.3/10.4,
// pausa por credenciales, eventos del e-reporting, inmutabilidad y RLS.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeSchemaDb, schemaFor } from './helpers/schema-subset';
import { frPaSample, PARTICULIER } from './helpers/fr-pa-samples';
import { crearValidador } from '../scripts/lib/openapi-mini.mjs';

const m = vi.hoisted(() => ({ db: null as any }));

vi.mock('../src/lib/db', () => {
    const run = (q: { text: string; values: any[] }) => m.db.query(q.text, q.values).then((r: any) => r.rows);
    const sql = (s: TemplateStringsArray, ...values: any[]) => {
        const q: any = { text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values };
        q.then = (res: any, rej: any) => run(q).then(res, rej);
        q.catch = (rej: any) => run(q).catch(rej);
        return q;
    };
    const tx = (setup: (t: any) => Promise<void>) => async (...queries: any[]) => m.db.transaction(async (t: any) => {
        await setup(t);
        const rows = [];
        for (const q of queries) rows.push((await t.query(q.text, q.values)).rows);
        return rows;
    });
    return {
        sql,
        withOrgTx: (org: string, ...queries: any[]) => tx((t) => t.query("select set_config('app.org_id',$1,true)", [org]))(...queries),
        withSystemTx: (...queries: any[]) => tx((t) => t.query("select set_config('app.scope','system',true)"))(...queries),
    };
});
vi.mock('../src/lib/crypto-secret', () => ({
    encryptRequiredSecret: (v: string) => `enc:${v}`,
    decryptSecret: (v: unknown) => (typeof v === 'string' && v.startsWith('enc:') ? v.slice(4) : null),
}));
vi.mock('../src/lib/log', () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    return { log, default: log };
});

process.env.IOPOLE_ENABLED = 'true';
process.env.IOPOLE_ENTORNO = 'preproduccion';
process.env.IOPOLE_CLIENT_ID = 'cord-pruebas';
process.env.IOPOLE_CLIENT_SECRET = 'secreto-de-pruebas';

const { procesarOrgPa, orgsPa } = await import('../src/lib/fiscal/transmision/cola');
const { solicitarAlta, refrescarAlta, resolverIncierta } = await import('../src/lib/fiscal/transmision/alta');
const { aplicarEvento } = await import('../src/lib/fiscal/transmision/eventos');
const { estadoPaOrg, estadoPaFactura } = await import('../src/lib/fiscal/transmision/estado');
const { interpretar } = await import('../src/lib/fiscal/transmision/iopole/webhook');
const { IopoleCliente, olvidarTokens } = await import('../src/lib/fiscal/transmision/iopole/cliente');
const { HOSTS_IOPOLE } = await import('../src/lib/fiscal/transmision/config');

const ORG = '00000000-0000-4000-8000-0000000000f1';
const ORG2 = '00000000-0000-4000-8000-0000000000f2';
const SIREN = '303265045';

// ── Iopole simulada (HTTP) ──────────────────────────────────────────────────
type Plan = 'ok' | 'perdida' | 'caida' | 'http500' | 'http401' | 'http400';
const SPECS = Object.fromEntries((['config', 'invoicing', 'reporting'] as const).map((id) => {
    const spec = JSON.parse(readFileSync(new URL(`../scripts/fixtures/iopole/operator-${id}.json`, import.meta.url), 'utf8'));
    return [id, { spec, v: crearValidador(spec) }];
})) as Record<string, { spec: any; v: ReturnType<typeof crearValidador> }>;

interface FacturaIopole { id: string; numero: string; siren: string; creada: string; estados: any[] }
const iopole = {
    plan: [] as Plan[],
    llamadas: [] as { metodo: string; ruta: string; cuerpo?: any; archivo?: { nombre: string; bytes: Uint8Array } }[],
    errores: [] as string[],
    altas: new Map<string, { siren: string; state: string; body: any }>(),
    facturas: new Map<string, FacturaIopole>(),
    seq: 0,
};
const nuevoId = () => `00000000-0000-4000-a000-${String(++iopole.seq).padStart(12, '0')}`;
const llamadas = (metodo: string, prefijo: string) => iopole.llamadas.filter((l) => l.metodo === metodo && l.ruta.startsWith(prefijo));

/** La plantilla de la OpenAPI que atiende esta ruta, o null si no existe. */
function operacion(metodo: string, path: string): { spec: string; plantilla: string; params: Record<string, string> } | null {
    for (const [id, { spec }] of Object.entries(SPECS)) {
        for (const plantilla of Object.keys(spec.paths)) {
            if (!spec.paths[plantilla][metodo.toLowerCase()]) continue;
            const nombres: string[] = [];
            const re = new RegExp(`^${plantilla.replace(/[.]/g, '\\.').replace(/\{(\w+)\}/g, (_m, n) => { nombres.push(n); return '([^/]+)'; })}$`);
            const mm = re.exec(path);
            if (mm) return { spec: id, plantilla, params: Object.fromEntries(nombres.map((n, i) => [n, decodeURIComponent(mm[i + 1])])) };
        }
    }
    return null;
}

function responder(op: { spec: string; plantilla: string }, metodo: string, status: number, cuerpo: unknown): Response {
    const schema = SPECS[op.spec].v.esquemaRespuesta(metodo, op.plantilla, status);
    if (schema) {
        const errores = SPECS[op.spec].v.validar(schema, cuerpo);
        if (errores.length) iopole.errores.push(`respuesta simulada ${metodo} ${op.plantilla} ${status}: ${errores.join('; ')}`);
    }
    return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function estadoIopole(f: FacturaIopole, code: string, value: string, motivo?: string) {
    const fecha = new Date().toISOString();
    return {
        statusId: nuevoId(), date: fecha, destType: 'PLATFORM', invoiceId: f.id,
        status: { code, networkCode: value },
        xml: '<x/>',
        json: {
            testIndicator: true,
            identification: { id: `cdv-${iopole.seq}`, date: fecha },
            sender: { siren: SIREN }, recipients: [],
            responses: [{
                documentReference: { issuerAssignedId: f.numero, typeCode: '380', receiptDate: fecha, issueDate: fecha, issuer: { siren: f.siren } },
                documentStatus: { code },
                ...(motivo ? { rejectionDetail: { reason: 'VAT_RATE_INCORRECT', message: motivo } } : {}),
            }],
        },
    };
}

const fetchIopole: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const metodo = String(init?.method || 'GET').toUpperCase();
    if (url.toString() === HOSTS_IOPOLE.preproduccion.token) {
        const form = new URLSearchParams(String(init?.body));
        if (form.get('grant_type') !== 'client_credentials' || form.get('client_id') !== 'cord-pruebas') return new Response('{"error":"invalid_client"}', { status: 401 });
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }), { status: 200 });
    }
    if (url.origin !== HOSTS_IOPOLE.preproduccion.api) { iopole.errores.push(`host inesperado ${url.origin}`); return new Response('{}', { status: 404 }); }
    if ((init?.headers as any)?.Authorization !== 'Bearer tok') iopole.errores.push(`${metodo} ${url.pathname}: sin token`);
    const op = operacion(metodo, url.pathname);
    if (!op) { iopole.errores.push(`${metodo} ${url.pathname}: la OpenAPI no declara esta ruta`); return new Response('{"message":"not found"}', { status: 404 }); }

    let cuerpo: any;
    let archivo: { nombre: string; bytes: Uint8Array } | undefined;
    if (init?.body instanceof FormData) {
        const f = init.body.get('file');
        if (!(f instanceof Blob)) iopole.errores.push(`${op.plantilla}: multipart sin campo file`);
        else {
            const nombre = (f as File).name;
            const patron = SPECS[op.spec].v.deref(SPECS[op.spec].v.esquemaCuerpo(metodo, op.plantilla, 'multipart/form-data'))?.properties?.file?.pattern;
            if (patron && !new RegExp(patron).test(nombre)) iopole.errores.push(`${op.plantilla}: nombre de archivo ${nombre} fuera del patrón`);
            archivo = { nombre, bytes: new Uint8Array(await f.arrayBuffer()) };
        }
    } else if (init?.body) {
        cuerpo = JSON.parse(String(init.body));
        const schema = SPECS[op.spec].v.esquemaCuerpo(metodo, op.plantilla);
        const errores = schema ? SPECS[op.spec].v.validar(schema, cuerpo) : [`${op.plantilla}: no declara cuerpo JSON`];
        if (errores.length) {
            iopole.errores.push(`${metodo} ${op.plantilla}: ${errores.join('; ')}`);
            return responder(op, metodo, 400, { statusMessage: 'Request validation failure', details: { code: 'VALIDATION', path: [], message: errores[0] } });
        }
    }
    iopole.llamadas.push({ metodo, ruta: url.pathname + url.search, cuerpo, archivo });

    const plan = iopole.plan.shift() ?? 'ok';
    if (plan === 'caida') throw new TypeError('fetch failed');
    if (plan === 'http401') return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
    if (plan === 'http500') return new Response(JSON.stringify({ message: 'Internal error' }), { status: 500 });
    if (plan === 'http400') return responder(op, metodo, 400, { statusMessage: 'Request validation failure', details: { code: 'BUSINESS', path: ['invoice'], message: 'rechazo simulado' } });

    let res: Response;
    switch (op.plantilla) {
        case '/v1/config/french/enrollment': {
            const id = nuevoId();
            iopole.altas.set(id, { siren: cuerpo.siren, state: 'STARTED', body: cuerpo });
            res = responder(op, metodo, 201, { enrollmentId: id, onboardingUrl: `https://admin.iopole.fr/onboarding/${id}` });
            break;
        }
        case '/v1/config/enrollment/{enrollmentId}': {
            const a = iopole.altas.get(op.params.enrollmentId);
            res = a ? responder(op, metodo, 200, { enrollmentId: op.params.enrollmentId, identifierScheme: '0002', identifierValue: a.siren, name: 'Atelier Lumière SAS', state: a.state, enrollmentLink: `https://admin.iopole.fr/onboarding/${op.params.enrollmentId}` })
                : new Response('{"message":"No ongoing enrollment"}', { status: 404 });
            break;
        }
        case '/v1/config/enrollment/{scheme}/{identifier}/link': {
            const hit = [...iopole.altas.entries()].find(([, a]) => a.siren === op.params.identifier && a.state !== 'COMPLETED');
            res = hit ? responder(op, metodo, 200, { enrollmentId: hit[0], onboardingUrl: `https://admin.iopole.fr/onboarding/${hit[0]}` })
                : new Response('{"message":"No ongoing enrollment"}', { status: 404 });
            break;
        }
        case '/v1/config/business/entity':
            res = responder(op, metodo, 200, { data: [{ businessEntityId: '11111111-2222-4333-8444-555555555555', name: 'Atelier Lumière SAS', country: 'FR', type: 'LEGAL_UNIT', scope: 'PRIMARY', identifierScheme: '0002', identifierValue: SIREN, identifiers: [] }], meta: { offset: 0, limit: 200, count: 1 } });
            break;
        case '/v1/invoice': {
            const id = nuevoId();
            const numero = archivo!.nombre.replace(/\.pdf$/i, '');
            iopole.facturas.set(id, { id, numero, siren: SIREN, creada: new Date().toISOString(), estados: [] });
            res = responder(op, metodo, 201, { type: 'INVOICE', id });
            break;
        }
        case '/v1.1/invoice/search': {
            const q = url.searchParams.get('q') ?? '';
            const siren = /seller\.siren:"(\d+)"/.exec(q)?.[1];
            const data = [...iopole.facturas.values()].filter((f) => f.siren === siren).map((f) => ({
                metadata: { invoiceId: f.id, state: 'DELIVERED', direction: 'OUTBOUND', createDate: f.creada },
                businessData: { invoiceId: f.numero },
            }));
            res = responder(op, metodo, 200, { data, meta: { offset: 0, limit: 200, count: data.length } });
            break;
        }
        case '/v1/invoice/{invoiceId}/status-history':
            res = responder(op, metodo, 200, iopole.facturas.get(op.params.invoiceId)?.estados ?? []);
            break;
        case '/v1/invoice/{invoiceId}/status': {
            const f = iopole.facturas.get(op.params.invoiceId);
            const e = f ? estadoIopole(f, 'PAYMENT_RECEIVED', '212') : null;
            if (f && e) f.estados.push(e);
            res = responder(op, metodo, 201, { type: 'STATUS', id: e?.statusId ?? nuevoId() });
            break;
        }
        default:
            // Reporting: 202 con el id del envío.
            res = responder(op, metodo, 202, {
                type: op.plantilla.includes('/payment/')
                    ? (op.plantilla.includes('/invoice/') ? 'PAYMENT_INVOICE' : 'PAYMENT_TRANSACTION')
                    : (op.plantilla.includes('/invoice/') ? 'INVOICE' : 'TRANSACTION'),
                id: nuevoId(),
            });
    }
    if (plan === 'perdida') throw new TypeError('socket hang up');
    return res;
};

const proveedor = new IopoleCliente({ entorno: 'preproduccion', clientId: 'cord-pruebas', clientSecret: 'secreto-de-pruebas', fetchImpl: fetchIopole });
const pasada = (opts: { hoy?: string } = {}) => procesarOrgPa(ORG, { proveedor, ...opts });

// ── Base ─────────────────────────────────────────────────────────────────────
function seccion(): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- ── Francia: emisión por plataforma autorizada (oct 2026)');
    const fin = schema.indexOf('-- END fr-pa', inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(inicio);
    // Sin las dos columnas: ya las crea schemaFor desde el mismo esquema.
    return schema.slice(inicio, fin).replace(/^alter table (documentos_fiscales|productos) add column[^;]+;$/gm, '');
}

beforeAll(async () => {
    m.db = await makeSchemaDb(['orgs', 'cotizaciones', 'documentos_fiscales', 'documento_pagos', 'documento_reembolso_asignaciones', 'eventos', 'productos'], [
        // Los reembolsos cambiaron de llave primaria (Stripe y Mercado Pago): el
        // esquema la suelta antes de relajar `stripe_refund_id`.
        ...schemaFor(['documento_reembolsos']).map((st) => (/stripe_refund_id drop not null/.test(st)
            ? `alter table documento_reembolsos drop constraint if exists documento_reembolsos_pkey; ${st}` : st)),
        'create role cord_app',
        seccion(),
        'grant select, insert, update, delete on all tables in schema public to cord_app',
    ]);
    const fm = JSON.stringify({ tax_id: 'FR40303265045', fr_regime_tva: 'reel_mensuel', address_line1: '12 rue de la Paix', postal_code: '75002', city: 'Paris' });
    await m.db.query(`insert into orgs (id, nombre, country_code, moneda, zona_horaria, email_contacto, fiscal_metadata)
        values ($1, 'Atelier Lumière SAS', 'FR', 'EUR', 'Europe/Paris', 'compta@atelier-lumiere.fr', $2::jsonb),
               ($3, 'Autre SARL', 'FR', 'EUR', 'Europe/Paris', 'contact@autre.fr', $2::jsonb)`, [ORG, fm, ORG2]);
}, 60_000);

afterAll(async () => { await m.db?.close(); });

beforeEach(() => {
    iopole.plan = [];
    iopole.llamadas = [];
    olvidarTokens();
});

let seq = 0;
async function emitir(sampleId: string, opts: { issuedAt?: string; org?: string; numero?: string; over?: Record<string, unknown>; creditNoteOf?: string } = {}) {
    const s = frPaSample(sampleId).source as any;
    Object.assign(s, opts.over ?? {});
    const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
    const numero = opts.numero ?? `F-2026-${String(500 + seq).padStart(6, '0')}`;
    await m.db.query(`insert into documentos_fiscales (id, org_id, country_code, document_type, status, lifecycle, invoice_number, currency,
            subtotal, tax_total, total, issued_at, issuer_snapshot, recipient_snapshot, line_items_snapshot, due_date, provider_data,
            ledger_currency, fx_rate, credit_note_of, buyer_reference, purchase_order, delivery_address, updated_at)
        values ($1, $2, 'FR', $3, 'issued', 'open', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, '{}'::jsonb, $14, $15, $16, $17, $18, $19, now())`,
    [id, opts.org ?? ORG, opts.creditNoteOf ? 'commercial_credit_note' : 'commercial_invoice', numero, s.currency, s.subtotal, s.taxTotal, s.total,
        opts.issuedAt ?? new Date().toISOString(), JSON.stringify(s.issuer), JSON.stringify(s.recipient), JSON.stringify(s.lines),
        s.dueDate ?? null, s.ledgerCurrency ?? null, s.fxRate ?? null, opts.creditNoteOf ?? null, s.buyerReference ?? null, s.purchaseOrder ?? null,
        s.deliveryAddress ? JSON.stringify(s.deliveryAddress) : null]);
    return { id, numero, total: Number(s.total) };
}

const envios = async (doc: string): Promise<any[]> => (await m.db.query(
    'select tipo, clave, estado, numero, id_proveedor, error_codigo, error_mensaje, datos, archivo, periodo, fecha_limite::text as limite, confirmado_at from pa_envios where documento_id = $1 order by created_at', [doc])).rows;
const timeline = async (doc: string): Promise<string[]> => (await m.db.query(
    "select detalle from eventos where documento_id = $1 and tipo = 'plataforma' order by created_at", [doc])).rows.map((r: any) => r.detalle);
const envejecer = (segundos: number) => m.db.query(`update pa_envios set enviado_at = now() - make_interval(secs => ${segundos}) where estado in ('pendiente', 'incierto') and enviado_at is not null`);
const ayer = () => new Date(Date.now() - 86_400_000).toISOString();
const hoyParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function aviso(payload: unknown) {
    return aplicarEvento(interpretar(payload), 'iopole', 'preproduccion');
}

// ── Pruebas ──────────────────────────────────────────────────────────────────
describe('interruptor', () => {
    it('apagado: no habla con la plataforma y la pantalla dice "Próximamente"', async () => {
        process.env.IOPOLE_ENABLED = 'false';
        try {
            expect(await procesarOrgPa(ORG)).toMatchObject({ omitido: 'apagado' });
            const e = await estadoPaOrg(ORG);
            expect(e).toMatchObject({ activo: false, alta: null, regimen: 'reel_mensuel', faltaPerfil: null });
            const doc = await emitir('b2b-servicios', { issuedAt: new Date(Date.now() - 6 * 86_400_000).toISOString() });
            expect(await estadoPaFactura(ORG, doc.id)).toMatchObject({ activo: false, tratamiento: 'B2B', faltantes: [], envio: null });
            expect(await solicitarAlta(ORG, null)).toMatchObject({ ok: false, code: 'riel_apagado' });
        } finally {
            process.env.IOPOLE_ENABLED = 'true';
        }
        expect(iopole.llamadas).toEqual([]);
    });

    it('el barrido solo encuentra organizaciones de Francia reales', async () => {
        await m.db.query("insert into orgs (id, nombre, country_code) values ('00000000-0000-4000-8000-0000000000f9', 'ES', 'ES')");
        expect(await orgsPa()).toEqual([ORG, ORG2]);
    });

    it('sin alta completada no se envía nada', async () => {
        expect(await pasada()).toMatchObject({ omitido: 'sin_alta' });
        expect(llamadas('POST', '/v1/invoice')).toHaveLength(0);
    });
});

describe('alta del negocio', () => {
    it('falta el régimen: lo dice antes de llamar a la plataforma', async () => {
        await m.db.query("update orgs set fiscal_metadata = fiscal_metadata - 'fr_regime_tva' where id = $1", [ORG2]);
        expect(await solicitarAlta(ORG2, null, { proveedor })).toMatchObject({ ok: false, code: 'falta_regimen' });
        expect(iopole.llamadas).toEqual([]);
    });

    it('crea el alta solo para emitir y devuelve el enlace del mandato; una segunda vez no crea otra', async () => {
        const r = await solicitarAlta(ORG, { nombre: 'Claire', apellido: 'Martin', cargo: 'Présidente' }, { proveedor });
        expect(r).toMatchObject({ ok: true, estado: 'en_curso' });
        expect((r as any).enlace).toMatch(/^https:\/\/admin\.iopole\.fr\/onboarding\//);
        const [alta] = llamadas('POST', '/v1/config/french/enrollment');
        expect(alta.cuerpo).toMatchObject({
            siren: SIREN, registrationStrategy: 'NONE', selfBilling: false, registerInPeppolInternational: false,
            operatorRelation: { direction: 'OUTBOUND' },
            businessEntityDetails: { vatRegime: 'REAL_MONTHLY_TAX_REGIME', contactEmail: 'compta@atelier-lumiere.fr', address: '12 rue de la Paix, 75002 Paris' },
            legalRepresentative: { firstName: 'Claire', lastName: 'Martin', position: 'Présidente' },
        });
        expect(await solicitarAlta(ORG, null, { proveedor })).toMatchObject({ ok: true, estado: 'en_curso' });
        expect(llamadas('POST', '/v1/config/french/enrollment')).toHaveLength(1);
    });

    it('la respuesta perdida de un alta se resuelve CONSULTANDO por SIREN, sin crear otra', async () => {
        await m.db.query("update orgs set fiscal_metadata = fiscal_metadata || '{\"fr_regime_tva\": \"simplifie\", \"tax_id\": \"FR83404833048\"}'::jsonb where id = $1", [ORG2]);
        iopole.plan = ['perdida'];
        const r = await solicitarAlta(ORG2, null, { proveedor });
        expect(r).toMatchObject({ ok: true, estado: 'en_curso' });
        expect(llamadas('POST', '/v1/config/french/enrollment')).toHaveLength(1);
        expect(llamadas('GET', '/v1/config/enrollment/0002/404833048/link')).toHaveLength(1);
        const [a] = (await m.db.query('select estado, alta_id, enlace from pa_altas where org_id = $1', [ORG2])).rows;
        expect(a.estado).toBe('en_curso');
        expect(a.enlace).toContain(a.alta_id);
    });

    it('un alta que no llegó a crearse queda incierta y, pasado el plazo, descartada', async () => {
        await m.db.query("update pa_altas set estado = 'cancelada' where org_id = $1", [ORG2]);
        await m.db.query("update orgs set fiscal_metadata = fiscal_metadata || '{\"tax_id\": \"FR96552100554\"}'::jsonb where id = $1", [ORG2]);
        iopole.plan = ['caida'];
        expect(await solicitarAlta(ORG2, null, { proveedor })).toMatchObject({ ok: true, estado: 'incierto' });
        await m.db.query("update pa_altas set solicitado_at = now() - interval '3 hours' where org_id = $1 and estado = 'incierto'", [ORG2]);
        expect(await resolverIncierta(ORG2, proveedor)).toMatchObject({ estado: 'descartada' });
    });

    it('el aviso de onboarding COMPLETED completa el alta; uno viejo no la retrocede', async () => {
        const [a] = (await m.db.query('select alta_id from pa_altas where org_id = $1', [ORG])).rows;
        expect(await aviso({ enrollmentId: a.alta_id, eventId: 'e1', companyName: 'Atelier', identifierScheme: '0002', identifierValue: SIREN, status: 'MANDATE_SIGNED', date: new Date(Date.now() - 2 * 86_400_000).toISOString() })).toMatchObject({ aplicado: true });
        expect(await aviso({ enrollmentId: a.alta_id, eventId: 'e2', status: 'COMPLETED', date: new Date(Date.now() - 86_400_000 * 1.5).toISOString() })).toMatchObject({ aplicado: true });
        expect(await aviso({ enrollmentId: a.alta_id, eventId: 'e3', status: 'STARTED', date: new Date(Date.now() - 3 * 86_400_000).toISOString() })).toMatchObject({ aplicado: false });
        const [alta] = (await m.db.query('select estado, etapa, completada_at from pa_altas where org_id = $1', [ORG])).rows;
        expect(alta).toMatchObject({ estado: 'completada', etapa: 'COMPLETED' });
        expect(await aviso({ enrollmentId: '99999999-0000-4000-8000-000000000000', eventId: 'x', status: 'COMPLETED', date: new Date().toISOString() })).toMatchObject({ aplicado: false, razon: 'alta_desconocida' });
        // Completada: la consulta guarda el id de la entidad del negocio.
        await refrescarAlta(ORG, { proveedor });
        expect((await m.db.query('select entidad_id from pa_altas where org_id = $1', [ORG])).rows[0].entidad_id).toBe('11111111-2222-4333-8444-555555555555');
    });
});

describe('factura entre empresas (flujo 2)', () => {
    it('lo emitido antes del alta no se envía; lo de después sale una vez, como Factur-X', async () => {
        const vieja = await emitir('b2b-servicios', { issuedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() });
        const doc = await emitir('b2b-servicios');
        const r = await pasada();
        expect(r).toMatchObject({ aceptados: 1 });
        expect(await envios(vieja.id)).toEqual([]);
        expect((await estadoPaFactura(ORG, vieja.id))?.sinAlta).toBe(true);
        const [e] = await envios(doc.id);
        expect(e).toMatchObject({ tipo: 'factura', estado: 'aceptado', numero: doc.numero });
        expect(Buffer.from(e.archivo).subarray(0, 5).toString()).toBe('%PDF-');
        const [envio] = llamadas('POST', '/v1/invoice');
        expect(envio.archivo?.nombre).toBe(`${doc.numero}.pdf`);
        expect(Buffer.from(envio.archivo!.bytes).equals(Buffer.from(e.archivo))).toBe(true);
        expect(await timeline(doc.id)).toEqual(['Enviada a la plataforma de facturación electrónica']);
        await pasada();
        expect(llamadas('POST', '/v1/invoice')).toHaveLength(1);
    });

    it('respuesta perdida: incierto, se CONSULTA y queda aceptada sin reenviar', async () => {
        const doc = await emitir('b2b-servicios');
        iopole.plan = ['perdida'];
        expect(await pasada()).toMatchObject({ inciertos: 1 });
        expect((await envios(doc.id))[0].estado).toBe('incierto');
        await pasada();
        expect(llamadas('POST', '/v1/invoice')).toHaveLength(1);
        await envejecer(300);
        expect(await pasada()).toMatchObject({ resueltosPorConsulta: 1 });
        expect(llamadas('POST', '/v1/invoice')).toHaveLength(1);
        expect(llamadas('GET', '/v1.1/invoice/search')).toHaveLength(1);
        expect(llamadas('GET', '/v1.1/invoice/search')[0].ruta).toContain('expand=businessData');
        const [e] = await envios(doc.id);
        expect(e.estado).toBe('aceptado');
        expect(e.id_proveedor).toBeTruthy();
    });

    it('sin rastro tras 24 h se descarta y solo entonces se envía de nuevo', async () => {
        const doc = await emitir('b2b-servicios');
        iopole.plan = ['caida'];
        await pasada();
        await envejecer(300);
        await pasada();
        expect((await envios(doc.id)).map((e) => e.estado)).toEqual(['incierto']);
        expect(llamadas('POST', '/v1/invoice')).toHaveLength(1);
        await envejecer(25 * 3600);
        await pasada();
        expect((await envios(doc.id)).map((e) => e.estado)).toEqual(['descartado', 'aceptado']);
        expect(llamadas('POST', '/v1/invoice')).toHaveLength(2);
    });

    it('lo que no se puede transmitir queda bloqueado con su motivo una sola vez', async () => {
        const doc = await emitir('b2b-servicios', { over: { lines: frPaSample('b2b-servicios').source.lines.map(({ nature: _n, ...l }) => l) } });
        expect(await pasada()).toMatchObject({ bloqueados: 1 });
        await pasada();
        const e = await envios(doc.id);
        expect(e).toHaveLength(1);
        expect(e[0]).toMatchObject({ tipo: 'factura', estado: 'rechazado', error_codigo: 'fr_operation_category' });
        expect(llamadas('POST', '/v1/invoice')).toHaveLength(0);
        expect((await estadoPaOrg(ORG)).incidencias.some((i) => i.documentoId === doc.id)).toBe(true);
    });

    it('la plataforma rechaza el envío: final, sin reintento, con su renglón en la historia', async () => {
        const doc = await emitir('b2b-servicios');
        iopole.plan = ['http400'];
        expect(await pasada()).toMatchObject({ rechazados: 1 });
        await pasada();
        expect(llamadas('POST', '/v1/invoice')).toHaveLength(1);
        expect((await envios(doc.id))[0]).toMatchObject({ estado: 'rechazado', error_codigo: 'BUSINESS' });
        expect(await timeline(doc.id)).toEqual(['La plataforma no admitió el envío']);
    });

    it('credenciales rechazadas: nada se procesa, vuelve a la cola y la organización se pausa', async () => {
        const doc = await emitir('b2b-servicios');
        iopole.plan = ['http401'];
        expect(await pasada()).toMatchObject({ error: 'peticion_rechazada' });
        expect((await envios(doc.id))[0]).toMatchObject({ estado: 'pendiente' });
        expect((await m.db.query('select enviado_at from pa_envios where documento_id = $1', [doc.id])).rows[0].enviado_at).toBeNull();
        expect(await pasada()).toMatchObject({ omitido: 'en_pausa' });
        expect((await estadoPaOrg(ORG)).pausada).toBe(true);
        await m.db.query('update pa_cola set proximo_envio_at = null');
        await pasada();
        expect((await envios(doc.id))[0].estado).toBe('aceptado');
    });
});

describe('estados del ciclo de vida (webhook)', () => {
    it('200 y 213 con su motivo: a la historia de la factura, sin duplicar avisos repetidos', async () => {
        const doc = await emitir('b2b-servicios');
        await pasada();
        const [e] = await envios(doc.id);
        const f = iopole.facturas.get(e.id_proveedor)!;
        const depositada = estadoIopole(f, 'SUBMITTED', '200');
        const rechazada = estadoIopole(f, 'REJECTED', '213', 'Taux de TVA incorrect');
        expect(await aviso(depositada)).toEqual({ aplicado: true });
        expect(await aviso(rechazada)).toEqual({ aplicado: true });
        expect(await aviso(rechazada)).toMatchObject({ aplicado: false, razon: 'repetido' });
        expect(await timeline(doc.id)).toEqual([
            'Enviada a la plataforma de facturación electrónica',
            'Estado 200 · Depositada en la plataforma',
            'Estado 213 · Rechazada por una plataforma: Taux de TVA incorrect · VAT_RATE_INCORRECT',
        ]);
        const v = await estadoPaFactura(ORG, doc.id);
        expect(v?.estados[0]).toMatchObject({ codigo: '213', rechazo: true, motivo: 'Taux de TVA incorrect · VAT_RATE_INCORRECT' });
        expect((await estadoPaOrg(ORG)).incidencias.some((i) => i.documentoId === doc.id && i.estado === '213')).toBe(true);

        // Su nota de crédito es una anulación contable: no se transmite.
        const nota = await emitir('b2b-servicios', { creditNoteOf: doc.id });
        await pasada();
        expect((await envios(nota.id))[0]).toMatchObject({ estado: 'rechazado', error_codigo: 'anulacion_contable' });
        expect(llamadas('POST', '/v1/invoice')).toHaveLength(1);
    });

    it('el primer estado de una factura incierta la encuentra por emisor y número', async () => {
        const doc = await emitir('b2b-servicios');
        iopole.plan = ['perdida'];
        await pasada();
        const f = [...iopole.facturas.values()].find((x) => x.numero === doc.numero)!;
        expect(await aviso(estadoIopole(f, 'SUBMITTED', '200'))).toEqual({ aplicado: true });
        expect((await envios(doc.id))[0]).toMatchObject({ estado: 'aceptado', id_proveedor: f.id });
    });
});

describe('cobros con la TVA exigible al cobro', () => {
    it('212 por tasa al pagar un servicio, y la devolución en negativo con su motivo', async () => {
        const doc = await emitir('b2b-servicios');
        await pasada();
        await m.db.query(`insert into documento_pagos (org_id, documento_id, monto, currency, metodo, stripe_payment_intent_id, aplicado_at)
            values ($1, $2, 600, 'EUR', 'stripe', 'pi_123', now())`, [ORG, doc.id]);
        await pasada();
        const cobro = (await envios(doc.id)).find((e) => e.tipo === 'cobro');
        expect(cobro).toMatchObject({ estado: 'aceptado' });
        const [estado] = llamadas('POST', '/v1/invoice/');
        expect(estado.cuerpo).toEqual({ code: 'PAYMENT_RECEIVED', payment: [{ vatRate: 20, amount: 600, currency: 'EUR' }] });
        expect(await timeline(doc.id)).toContain('Cobro comunicado a la plataforma');

        await m.db.query(`insert into documento_reembolsos (org_id, stripe_refund_id, stripe_payment_intent_id, monto, currency, status, updated_at)
            values ($1, 're_1', 'pi_123', 100, 'EUR', 'succeeded', now())`, [ORG]);
        await pasada();
        const estados = llamadas('POST', '/v1/invoice/');
        expect(estados.at(-1)?.cuerpo).toEqual({ code: 'PAYMENT_RECEIVED', message: 'Remboursement', payment: [{ vatRate: 20, amount: -100, currency: 'EUR' }] });
        await pasada();
        expect(llamadas('POST', '/v1/invoice/')).toHaveLength(2);
    });

    it('con la opción por los débitos, o en una venta de bienes, el cobro no se comunica', async () => {
        const debits = await emitir('b2b-mixte-debits');
        const bienes = await emitir('b2b-biens');
        await pasada();
        for (const d of [debits, bienes]) {
            await m.db.query(`insert into documento_pagos (org_id, documento_id, monto, currency, metodo, aplicado_at) values ($1, $2, 100, 'EUR', 'manual', now())`, [ORG, d.id]);
        }
        await pasada();
        for (const d of [debits, bienes]) expect((await envios(d.id)).map((e) => e.tipo)).toEqual(['factura']);
    });
});

describe('e-reporting', () => {
    it('factura con el extranjero (10.1) y su cobro en euros (10.2); la devolución no se puede declarar', async () => {
        const doc = await emitir('b2bint-services-hors-ue', { over: { lines: [{ ...frPaSample('b2bint-services-hors-ue').source.lines[0], taxRate: 0.2, taxAmount: 960, total: 5760 }], taxTotal: 960, total: 5760, recipient: { ...frPaSample('b2bint-services-hors-ue').source.recipient, address: { line1: 'Unter den Linden 1', city: 'Berlin', postalCode: '10117', countryCode: 'DE' }, taxId: 'DE136695976' } } });
        await pasada();
        const [rep] = await envios(doc.id);
        expect(rep).toMatchObject({ tipo: 'reporte_factura', estado: 'aceptado', periodo: expect.stringMatching(/^\d{4}-\d{2}-D[123]$/) });
        const [llamada] = llamadas('POST', `/v1/reporting/transaction/invoice/scheme/0002/value/${SIREN}`);
        expect(llamada.cuerpo.invoice).toMatchObject({ invoiceId: doc.numero, processType: 'S1', buyer: { identifier: { scheme: '0223', value: 'DE136695976' } } });

        await m.db.query(`insert into documento_pagos (org_id, documento_id, monto, currency, metodo, stripe_payment_intent_id, aplicado_at) values ($1, $2, 5760, 'EUR', 'stripe', 'pi_int', now())`, [ORG, doc.id]);
        await m.db.query(`insert into documento_reembolsos (org_id, stripe_refund_id, stripe_payment_intent_id, monto, currency, status, updated_at) values ($1, 're_int', 'pi_int', 60, 'EUR', 'succeeded', now())`, [ORG]);
        await pasada();
        const todos = await envios(doc.id);
        const pago = todos.find((e) => e.tipo === 'reporte_pago_factura' && e.estado === 'aceptado');
        expect(pago?.datos.reporte).toMatchObject({ numero: doc.numero, porTasa: [{ tasa: 20, importe: 5760 }] });
        expect(todos.find((e) => e.tipo === 'reporte_pago_factura' && e.estado === 'rechazado')).toMatchObject({ error_codigo: 'devolucion_reporte' });
        expect(llamadas('POST', `/v1/reporting/payment/invoice/scheme/0002/value/${SIREN}`)).toHaveLength(1);
    });

    it('ventas a particulares: un agregado por día cerrado y divisa (10.3); el día en curso espera', async () => {
        const a = await emitir('b2c-services', { issuedAt: ayer() });
        const b = await emitir('b2c-mixte', { issuedAt: ayer() });
        const hoy = await emitir('b2c-services');
        await pasada();
        const [tx] = (await m.db.query("select clave, estado, datos from pa_envios where tipo = 'reporte_transacciones' and estado = 'aceptado'")).rows;
        expect(tx.datos.documentos.sort()).toEqual([a.id, b.id].sort());
        expect(tx.clave).toMatch(/^tx:\d{4}-\d{2}-\d{2}:EUR:1$/);
        const [llamada] = llamadas('POST', `/v1/reporting/transaction/scheme/0002/value/${SIREN}`);
        expect(llamada.cuerpo.transactions.map((t: any) => [t.categoryCode, t.monetary.taxBasisTotalAmount.amount])).toEqual([['TLB1', 210], ['TPS1', 195]]);
        expect(llamada.cuerpo).toMatchObject({ registerId: 'CORD', closureId: expect.stringMatching(/-EUR-1$/) });
        expect((await estadoPaFactura(ORG, hoy.id))?.envio).toBeNull();
        expect((await estadoPaFactura(ORG, a.id))?.envio).toMatchObject({ tipo: 'reporte_transacciones', estado: 'aceptado' });
        // Al día siguiente, la venta de hoy va en su propio agregado.
        const manana = new Date(Date.now() + 86_400_000);
        await pasada({ hoy: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(manana) });
        expect((await estadoPaFactura(ORG, hoy.id))?.envio).toMatchObject({ tipo: 'reporte_transacciones', estado: 'aceptado' });

        // Lo cobrado ayer (10.4): solo la parte de servicios, en euros.
        await m.db.query(`insert into documento_pagos (org_id, documento_id, monto, currency, metodo, aplicado_at) values ($1, $2, $3, 'EUR', 'manual', $4)`, [ORG, b.id, b.total, ayer()]);
        await pasada();
        const [pagos] = llamadas('POST', `/v1/reporting/payment/transaction/scheme/0002/value/${SIREN}`);
        expect(pagos.cuerpo).toEqual({ transaction: { payment: { paymentDate: expect.any(String), taxDetails: [{ taxRate: 10, collectedAmount: '66.00' }] } } });
        await pasada();
        expect(llamadas('POST', `/v1/reporting/payment/transaction/scheme/0002/value/${SIREN}`)).toHaveLength(1);
    });

    it('confirmación y rechazo asíncronos del e-reporting (eventos del operador)', async () => {
        const [tx] = (await m.db.query("select id_proveedor from pa_envios where tipo = 'reporte_transacciones' and estado = 'aceptado' limit 1")).rows;
        expect(await aviso({ eventId: 'ev1', eventType: 'EREPORTING_TRANSACTION_ATTACHED', timestamp: new Date().toISOString(), referencedObject: { type: 'TRANSACTION', id: tx.id_proveedor }, payload: { reportId: 'r1', fluxType: '10.3' } })).toEqual({ aplicado: true });
        expect((await m.db.query('select confirmado_at from pa_envios where id_proveedor = $1', [tx.id_proveedor])).rows[0].confirmado_at).toBeTruthy();
        const [pago] = (await m.db.query("select id_proveedor from pa_envios where tipo = 'reporte_pago_transacciones' and estado = 'aceptado' limit 1")).rows;
        expect(await aviso({ eventId: 'ev2', eventType: 'EREPORTING_ERROR', timestamp: new Date().toISOString(), referencedObject: { type: 'PAYMENT', id: pago.id_proveedor }, payload: { rejectionDetail: { reason: 'VALIDATION_FAILURE', message: 'Taux inconnu' } } })).toEqual({ aplicado: true });
        expect((await m.db.query('select estado, error_codigo from pa_envios where id_proveedor = $1', [pago.id_proveedor])).rows[0]).toEqual({ estado: 'rechazado', error_codigo: 'ereporting_error' });
        expect(await aviso({ eventId: 'ev3', eventType: 'PEPPOL_MIGRATION_COMPLETED', timestamp: new Date().toISOString(), referencedObject: { type: 'BUSINESS_ENTITY', id: 'x' }, payload: {} })).toMatchObject({ aplicado: false });
    });

    it('un particular sin naturaleza en un concepto se aparta con su motivo y el día sale igual', async () => {
        const mal = await emitir('b2c-services', { issuedAt: ayer(), over: { lines: frPaSample('b2c-services').source.lines.map(({ nature: _n, ...l }) => l) } });
        await pasada();
        expect((await envios(mal.id))[0]).toMatchObject({ tipo: 'reporte_transacciones', estado: 'rechazado', error_codigo: 'sin_categoria' });
    });
});

describe('garantías del esquema', () => {
    it('lo enviado es inmutable y un incierto solo se resuelve consultando', async () => {
        const [aceptado] = (await m.db.query("select id from pa_envios where estado = 'aceptado' limit 1")).rows;
        await expect(m.db.query(`update pa_envios set datos = '{}'::jsonb where id = $1`, [aceptado.id])).rejects.toThrow(/no se modifican/);
        await expect(m.db.query(`update pa_envios set estado = 'pendiente' where id = $1`, [aceptado.id])).rejects.toThrow(/solo puede pasar a rechazado/);
        await expect(m.db.query('delete from pa_envios where id = $1', [aceptado.id])).rejects.toThrow(/no se borra/);
        const doc = await emitir('b2b-servicios');
        iopole.plan = ['perdida'];
        await pasada();
        const [incierto] = (await m.db.query("select id from pa_envios where documento_id = $1", [doc.id])).rows;
        await expect(m.db.query(`update pa_envios set estado = 'pendiente' where id = $1`, [incierto.id])).rejects.toThrow(/consultando/);
        const [rechazado] = (await m.db.query("select id from pa_envios where estado = 'rechazado' limit 1")).rows;
        await expect(m.db.query(`update pa_envios set error_mensaje = 'x' where id = $1`, [rechazado.id])).rejects.toThrow(/finales/);
    });

    it('una organización no ve el alta, la cola ni los estados de otra (RLS con el rol de aplicación)', async () => {
        const contar = (org: string, tabla: string) => m.db.transaction(async (t: any) => {
            await t.query('set local role cord_app');
            await t.query("select set_config('app.org_id', $1, true)", [org]);
            return Number((await t.query(`select count(*)::int as n from ${tabla}`)).rows[0].n);
        });
        for (const tabla of ['pa_altas', 'pa_envios', 'pa_estados', 'pa_cola']) {
            expect(await contar(ORG, tabla), tabla).toBeGreaterThan(0);
        }
        await m.db.query('delete from pa_altas where org_id = $1', [ORG2]);
        for (const tabla of ['pa_altas', 'pa_envios', 'pa_estados', 'pa_cola']) {
            expect(await contar(ORG2, tabla), tabla).toBe(0);
        }
    });

    it('la Iopole simulada no vio una ruta, un cuerpo ni una respuesta fuera de la OpenAPI', () => {
        expect(iopole.errores).toEqual([]);
        expect(hoyParis()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(PARTICULIER.address?.countryCode).toBe('FR');
    });

    it('los esquemas de la sección no se cuelan en otros: schemaFor lee las dos columnas nuevas', () => {
        const cols = schemaFor(['documentos_fiscales', 'productos']).join('\n');
        expect(cols).toContain('delivery_address jsonb');
        expect(cols).toContain('naturaleza text');
    });
});
