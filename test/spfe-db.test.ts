// Cola de la factura electrónica entre empresarios por la solución pública de
// la AEAT (src/lib/fiscal/spfe/cola.ts) contra Postgres real (PGlite) con el
// esquema de db/schema.sql tal cual, y una AEAT SIMULADA que implementa el
// puerto de transporte de Cord (transporte.ts). No simula el protocolo SOAP de
// la AEAT, que no está publicado: simula lo que la Orden HAC/1028/2026 dice que
// hace la solución pública (admite o rechaza con motivo, consulta por código
// único, guarda los estados), con fallos de red, respuestas perdidas y
// rechazos de la petición.
//
// Cubre: interruptor y "Próximamente", fecha de activación, envío y su
// idempotencia, respuesta perdida resuelta por CONSULTA (nunca reenvío),
// descarte y reenvío solo tras consultar, pausa por rechazo de la petición,
// rechazo de una factura, cobro, cancelación, impago, pago declarado en la
// propia factura, baja, estados del cliente, lease, inmutabilidad y RLS.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeSchemaDb } from './helpers/schema-subset';
import { SPFE_FUERA, SPFE_SAMPLES } from './helpers/spfe-samples';

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

process.env.SPFE_ENABLED = 'true';
process.env.SPFE_ENTORNO = 'pruebas';

const { procesarOrgSpfe, orgsSpfe, veredictoConsulta } = await import('../src/lib/fiscal/spfe/cola');
const { estadoSpfeFactura, estadoSpfeOrg } = await import('../src/lib/fiscal/spfe/estado');
const { SpfePeticionRechazadaError, SpfeSinRespuestaError } = await import('../src/lib/fiscal/spfe/transporte');
const { claveCodigo } = await import('../src/lib/fiscal/spfe/factura');
type Transporte = import('../src/lib/fiscal/spfe/transporte').SpfeTransporte;
type Codigo = import('../src/lib/fiscal/spfe/factura').SpfeCodigo;

const ORG = '00000000-0000-4000-8000-0000000000e1';
const ORG2 = '00000000-0000-4000-8000-0000000000e2';

// ── AEAT simulada ────────────────────────────────────────────────────────────
type Plan = 'ok' | 'perdida' | 'caida' | 'peticion' | 'rechazo';
interface FacturaAeat {
    consta: boolean;
    xml: string;
    emisor: { codigo: 'SETTLEMENT' | 'DEFAULT'; fecha?: string } | null;
    destinatario: { codigo: any; fecha: string; motivo?: '01' | '02' }[];
}
const aeat = {
    facturas: new Map<string, FacturaAeat>(),
    plan: [] as Plan[],
    llamadas: [] as { servicio: string; claves: string[] }[],
    csv: 0,
};
const tag = (xml: string, name: string) => new RegExp(`<cbc:${name}>([^<]*)</cbc:${name}>`).exec(xml)?.[1] ?? null;

function procesar(servicio: string, items: { id: string; codigo: Codigo; xml: string }[], fn: (item: any, f: FacturaAeat | undefined) => any) {
    const plan = aeat.plan.shift() ?? 'ok';
    aeat.llamadas.push({ servicio, claves: items.map((i) => claveCodigo(i.codigo)) });
    if (plan === 'caida') throw new SpfeSinRespuestaError('ECONNRESET');
    if (plan === 'peticion') throw new SpfePeticionRechazadaError('Certificado no reconocido.');
    const resultados = new Map<string, any>();
    for (const item of items) {
        const clave = claveCodigo(item.codigo);
        resultados.set(item.id, plan === 'rechazo'
            ? { resultado: 'rechazado', codigo: '1105', descripcion: 'El NIF del destinatario no está identificado.' }
            : fn(item, aeat.facturas.get(clave)));
    }
    if (plan === 'perdida') throw new SpfeSinRespuestaError('respuesta truncada');
    return { csv: `CSV${++aeat.csv}`, resultados };
}

const transporte: Transporte = {
    entorno: 'pruebas',
    async remitirFacturas(items) {
        return procesar('remitir', items, (item, f) => {
            if (f?.consta) return { resultado: 'rechazado', codigo: '2001', descripcion: 'Factura duplicada.', duplicado: true };
            aeat.facturas.set(claveCodigo(item.codigo), { consta: true, xml: item.xml, emisor: null, destinatario: [] });
            return { resultado: 'admitido', localizador: `LOC-${item.codigo.numero}` };
        });
    },
    async anularFacturas(items) {
        return procesar('anular', items, (_item, f) => {
            if (!f?.consta) return { resultado: 'rechazado', descripcion: 'No consta la factura.' };
            f.consta = false;
            return { resultado: 'admitido' };
        });
    },
    async comunicarEstados(items) {
        return procesar('estados', items, (item, f) => {
            if (!f?.consta) return { resultado: 'rechazado', descripcion: 'No consta la factura.' };
            const codigo = tag(item.xml, 'ResponseCode');
            if (codigo === 'SETTLEMENT') f.emisor = { codigo, fecha: tag(item.xml, 'EffectiveDate') ?? undefined };
            else if (codigo === 'DEFAULT') f.emisor = { codigo };
            else f.emisor = null;
            return { resultado: 'admitido' };
        });
    },
    async consultarFacturas(codigos) {
        aeat.llamadas.push({ servicio: 'consultar', claves: codigos.map(claveCodigo) });
        return codigos.map((codigo) => {
            const f = aeat.facturas.get(claveCodigo(codigo));
            return f
                ? { codigo, consta: f.consta, localizador: `LOC-${codigo.numero}`, estadoEmisor: f.emisor, estadosDestinatario: f.destinatario }
                : { codigo, consta: false };
        });
    },
};
const llamadas = (servicio: string, numero?: string) => aeat.llamadas.filter((l) => l.servicio === servicio && (!numero || l.claves.some((c) => c.includes(`|${numero}|`)))).length;

// ── Base ─────────────────────────────────────────────────────────────────────
function seccionSpfe(): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- ── Factura electrónica entre empresarios: solución pública de la AEAT');
    const fin = schema.indexOf('-- END spfe', inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(inicio);
    return schema.slice(inicio, fin);
}

beforeAll(async () => {
    m.db = await makeSchemaDb(['orgs', 'cotizaciones', 'documentos_fiscales', 'documento_pagos'], [
        'create role cord_app',
        seccionSpfe(),
        'grant select, insert, update, delete on all tables in schema public to cord_app',
    ]);
    await m.db.query(`insert into orgs (id, nombre, country_code, moneda, zona_horaria, verifactu_cert_enc, verifactu_cert_pass_enc)
        values ($1, 'Distribuciones Centro SL', 'ES', 'EUR', 'Europe/Madrid', 'enc:p12', 'enc:pass'),
               ($2, 'Otra SL', 'ES', 'EUR', 'Europe/Madrid', null, null)`, [ORG, ORG2]);
}, 60_000);

afterAll(async () => { await m.db?.close(); });

beforeEach(() => {
    aeat.plan = [];
    aeat.llamadas = [];
});

let seq = 0;
async function emitir(sampleId: string, over: Record<string, unknown> = {}, opts: { issuedAt?: string; org?: string; rectificaA?: string } = {}) {
    const s = SPFE_SAMPLES.find((x) => x.id === sampleId) ?? SPFE_FUERA.find((x) => x.id === sampleId);
    if (!s) throw new Error(sampleId);
    const src = { ...s.source, ...over } as any;
    const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
    const numero = `${src.invoiceNumber}-${seq}`;
    await m.db.query(`insert into documentos_fiscales (id, org_id, cotizacion_id, country_code, document_type, status, lifecycle,
            invoice_number, currency, subtotal, tax_total, total, issued_at, issuer_snapshot, recipient_snapshot, line_items_snapshot,
            due_date, provider_data, ledger_currency, fx_rate, service_date, service_date_end, retencion_total, retenciones_snapshot,
            credit_note_of, updated_at)
        values ($1, $2, null, 'ES', $3, 'issued', 'open', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now())`,
    [id, opts.org ?? ORG, src.documentType, numero, src.currency, src.subtotal, src.taxTotal, src.total,
        opts.issuedAt ?? new Date().toISOString(), JSON.stringify(src.issuer), JSON.stringify(src.recipient), JSON.stringify(src.lines),
        src.dueDate ?? null,
        JSON.stringify(src.qrUrl || src.tipoRectificativa ? { verifactu: { qrUrl: src.qrUrl ?? null, tipoFactura: src.tipoRectificativa ?? 'F1' } } : {}),
        src.ledgerCurrency ?? null, src.fxRate ?? null, src.serviceDate ?? null, src.serviceDateEnd ?? null,
        src.retencionTotal ?? 0, JSON.stringify(src.retenciones ?? []), opts.rectificaA ?? null]);
    return { id, numero };
}

const pasada = (opts: { transporte?: Transporte | null } = { transporte }) => procesarOrgSpfe(ORG, opts);
const mensajes = async (doc: string): Promise<any[]> => (await m.db.query(
    'select orden, tipo, estado, csv, localizador, error_mensaje, datos, xml, enviado_at from spfe_mensajes where documento_id = $1 order by orden', [doc])).rows;
/** Simula que pasaron más de dos minutos desde el envío (la cola solo consulta lo viejo). */
const envejecer = () => m.db.query("update spfe_mensajes set enviado_at = now() - interval '5 minutes' where estado in ('pendiente', 'incierto') and enviado_at is not null");

// ── Pruebas ──────────────────────────────────────────────────────────────────
describe('interruptor y transporte', () => {
    it('apagado no toca nada', async () => {
        process.env.SPFE_ENABLED = 'false';
        try {
            expect(await pasada()).toMatchObject({ omitido: 'apagado' });
        } finally {
            process.env.SPFE_ENABLED = 'true';
        }
        expect((await m.db.query('select * from spfe_envio_estado')).rows).toEqual([]);
    });

    it('sin la especificación de la AEAT no hay transporte: ni lease, ni certificado, ni cola', async () => {
        expect(await procesarOrgSpfe(ORG)).toMatchObject({ omitido: 'transporte_no_publicado' });
        expect((await m.db.query('select * from spfe_envio_estado')).rows).toEqual([]);
        const e = await estadoSpfeOrg(ORG);
        expect(e).toMatchObject({ riel: 'proximamente', entorno: 'pruebas', certificado: true, enCola: 0 });
    });

    it('el barrido solo encuentra organizaciones españolas con certificado', async () => {
        await m.db.query("insert into orgs (id, nombre, country_code, verifactu_cert_enc) values ('00000000-0000-4000-8000-0000000000e3', 'MX', 'MX', 'enc:x')");
        expect(await orgsSpfe()).toEqual([ORG]);
    });
});

describe('factura', () => {
    it('lo emitido antes de activar el riel no se envía de golpe', async () => {
        const vieja = await emitir('spfe-mixto', {}, { issuedAt: new Date(Date.now() - 86_400_000).toISOString() });
        const r = await pasada();
        expect(r.omitido).toBeUndefined();
        expect(await mensajes(vieja.id)).toEqual([]);
        const [e] = (await m.db.query('select activado_at from spfe_envio_estado where org_id = $1', [ORG])).rows;
        expect(e.activado_at).toBeTruthy();
    });

    it('detalle de la factura antes de enviarse: lista o qué falta; fuera de ámbito no aplica', async () => {
        await m.db.query("update spfe_envio_estado set proximo_envio_at = now() + interval '1 hour'");
        try {
            const buena = await emitir('spfe-ipsi');
            const sinCp = await emitir('cliente-sin-cp');
            const extranjero = await emitir('cliente-extranjero');
            expect(await estadoSpfeFactura(ORG, buena.id)).toMatchObject({ riel: 'proximamente', faltantes: [], alta: null });
            expect((await estadoSpfeFactura(ORG, sinCp.id))?.faltantes.map((p) => p.code)).toEqual(['spfe_direccion_cliente']);
            expect(await estadoSpfeFactura(ORG, extranjero.id)).toBeNull();
            // En pausa no se envía, pero lo enviable sí queda en la cola.
            expect(await pasada()).toMatchObject({ omitido: 'en_pausa' });
            expect((await mensajes(buena.id)).map((x) => x.estado)).toEqual(['pendiente']);
            expect(await mensajes(sinCp.id)).toEqual([]);
            expect(await mensajes(extranjero.id)).toEqual([]);
        } finally {
            await m.db.query('update spfe_envio_estado set proximo_envio_at = null');
        }
        await pasada();
    });

    it('se envía una vez, queda admitida con su CSV y no se vuelve a encolar', async () => {
        const doc = await emitir('spfe-mixto');
        const r = await pasada();
        expect(r).toMatchObject({ admitidos: expect.any(Number) });
        const [alta] = await mensajes(doc.id);
        expect(alta).toMatchObject({ orden: 1, tipo: 'alta', estado: 'admitido', localizador: `LOC-${doc.numero}` });
        expect(alta.csv).toMatch(/^CSV\d+$/);
        expect(alta.xml).toContain('<cbc:CopyIndicator>false</cbc:CopyIndicator>');
        expect(alta.xml).toContain(`<cbc:ID>${doc.numero}</cbc:ID>`);
        expect(alta.datos).toMatchObject({ tipoFactura: '380', nifEmisor: 'B28003218', numero: doc.numero, moneda: 'EUR' });
        await pasada();
        expect(llamadas('remitir', doc.numero)).toBe(1);
        expect(await mensajes(doc.id)).toHaveLength(1);
        expect(await estadoSpfeFactura(ORG, doc.id)).toMatchObject({ alta: { tipo: 'alta', estado: 'admitido' }, faltantes: [] });
    });

    it('respuesta perdida: incierto, se CONSULTA y queda admitida sin reenviar', async () => {
        const doc = await emitir('spfe-fecha-operacion');
        aeat.plan = ['perdida'];
        const r = await pasada();
        expect(r.inciertos).toBe(1);
        expect((await mensajes(doc.id))[0].estado).toBe('incierto');
        // Recién enviado: todavía no se consulta.
        await pasada();
        expect((await mensajes(doc.id))[0].estado).toBe('incierto');
        await envejecer();
        const r2 = await pasada();
        expect(r2.resueltosPorConsulta).toBe(1);
        expect(await mensajes(doc.id)).toMatchObject([{ orden: 1, estado: 'admitido', localizador: `LOC-${doc.numero}` }]);
        expect(llamadas('remitir', doc.numero)).toBe(1);
    });

    it('caída antes de procesar: la consulta dice que no consta, se descarta y SOLO entonces se escribe un envío nuevo', async () => {
        const doc = await emitir('spfe-usd');
        aeat.plan = ['caida'];
        await pasada();
        expect((await mensajes(doc.id)).map((x) => x.estado)).toEqual(['incierto']);
        await envejecer();
        await pasada();
        const ms = await mensajes(doc.id);
        expect(ms.map((x) => [x.orden, x.estado])).toEqual([[1, 'descartado'], [2, 'admitido']]);
        expect(ms[0].xml).toBe(ms[1].xml);
        // El orden de las llamadas: remitir (caído), consultar, remitir.
        const orden = aeat.llamadas.filter((l) => l.claves.some((c) => c.includes(doc.numero))).map((l) => l.servicio);
        expect(orden).toEqual(['remitir', 'consultar', 'remitir']);
    });

    it('un proceso que murió entre marcar y enviar se trata como enviado: se consulta', async () => {
        const doc = await emitir('spfe-ipsi');
        await m.db.query("update spfe_envio_estado set proximo_envio_at = now() + interval '1 hour'");
        await pasada();
        await m.db.query("update spfe_envio_estado set proximo_envio_at = null");
        await m.db.query("update spfe_mensajes set enviado_at = now() - interval '5 minutes' where documento_id = $1", [doc.id]);
        await pasada();
        // No constaba: descartado y reenviado tras la consulta.
        expect((await mensajes(doc.id)).map((x) => x.estado)).toEqual(['descartado', 'admitido']);
        const orden = aeat.llamadas.filter((l) => l.claves.some((c) => c.includes(doc.numero))).map((l) => l.servicio);
        expect(orden).toEqual(['consultar', 'remitir']);
    });

    it('rechazo de la petición: nada se marca, la organización se pausa', async () => {
        const doc = await emitir('spfe-igic');
        aeat.plan = ['peticion'];
        const r = await pasada();
        expect(r.error).toMatch(/Certificado/);
        const [msg] = await mensajes(doc.id);
        expect(msg).toMatchObject({ estado: 'pendiente', enviado_at: null });
        const [e] = (await m.db.query('select proximo_envio_at > now() as pausa, ultimo_error from spfe_envio_estado where org_id = $1', [ORG])).rows;
        expect(e.pausa).toBe(true);
        expect(await pasada()).toMatchObject({ omitido: 'en_pausa' });
        await m.db.query('update spfe_envio_estado set proximo_envio_at = null');
        await pasada();
        expect((await mensajes(doc.id)).map((x) => x.estado)).toEqual(['admitido']);
    });

    it('una factura rechazada queda a la vista y no se reenvía sola', async () => {
        const doc = await emitir('spfe-inversion');
        aeat.plan = ['rechazo'];
        expect(await pasada()).toMatchObject({ rechazados: 1 });
        await pasada();
        expect((await mensajes(doc.id)).map((x) => x.estado)).toEqual(['rechazado']);
        expect(llamadas('remitir', doc.numero)).toBe(1);
        const org = await estadoSpfeOrg(ORG);
        expect(org.incidencias).toContainEqual(expect.objectContaining({ documentoId: doc.id, tipo: 'alta', motivo: expect.stringMatching(/NIF del destinatario/) }));
        expect(await estadoSpfeFactura(ORG, doc.id)).toMatchObject({ alta: { estado: 'rechazado', error: expect.stringMatching(/NIF/) } });
    });

    it('lo que la SPFE no admitiría no se encola (cliente sin NIF, retención, extranjero)', async () => {
        const docs = await Promise.all(['cliente-sin-nif', 'irpf', 'cliente-extranjero'].map((id) => emitir(id)));
        await pasada();
        for (const d of docs) expect(await mensajes(d.id)).toEqual([]);
    });
});

describe('estados de cobro del emisor', () => {
    const pagar = async (doc: string, monto: number, dia: string) => {
        await m.db.query(`insert into documento_pagos (org_id, documento_id, monto, currency, aplicado_at) values ($1, $2, $3, 'EUR', $4)`, [ORG, doc, monto, `${dia}T10:00:00Z`]);
    };
    const conciliar = (doc: string, lifecycle: string, pagado: number, reembolsado = 0) => m.db.query(
        'update documentos_fiscales set lifecycle = $2, amount_paid = $3, amount_refunded = $4, updated_at = now() where id = $1', [doc, lifecycle, pagado, reembolsado]);

    it('abono parcial: nada; pagada: SETTLEMENT con la fecha del último pago; reembolso: CANCELSETTLEMENT', async () => {
        const doc = await emitir('spfe-mixto');
        await pasada();
        const total = Number((await m.db.query('select total from documentos_fiscales where id = $1', [doc.id])).rows[0].total);
        await pagar(doc.id, 100, '2026-10-20');
        await conciliar(doc.id, 'open', 100);
        await pasada();
        expect((await mensajes(doc.id)).map((x) => x.tipo)).toEqual(['alta']);
        await pagar(doc.id, total - 100, '2026-10-22');
        await conciliar(doc.id, 'paid', total);
        await pasada();
        const cobro = (await mensajes(doc.id))[1];
        expect(cobro).toMatchObject({ orden: 2, tipo: 'cobro', estado: 'admitido', datos: { fechaCobro: '2026-10-22', vencimiento: '2026-11-07' } });
        expect(cobro.xml).toContain('<cbc:ResponseCode>SETTLEMENT</cbc:ResponseCode><cbc:EffectiveDate>2026-10-22</cbc:EffectiveDate>');
        const clave = `B28003218|${doc.numero}|`;
        expect([...aeat.facturas.entries()].find(([k]) => k.startsWith(clave))?.[1].emisor).toEqual({ codigo: 'SETTLEMENT', fecha: '2026-10-22' });
        await pasada();
        expect(await mensajes(doc.id)).toHaveLength(2);
        // Reembolso: la factura vuelve a deber.
        await conciliar(doc.id, 'open', total, 50);
        await pasada();
        expect((await mensajes(doc.id)).map((x) => [x.tipo, x.estado])).toEqual([['alta', 'admitido'], ['cobro', 'admitido'], ['anula_cobro', 'admitido']]);
        expect(await estadoSpfeFactura(ORG, doc.id)).toMatchObject({ cobro: { tipo: 'anula_cobro', estado: 'admitido' } });
    });

    it('incobrable: DEFAULT con el vencimiento; cobrada después: cancela el impago y comunica el cobro', async () => {
        const doc = await emitir('spfe-ipsi');
        await pasada();
        await conciliar(doc.id, 'uncollectible', 0);
        await pasada();
        expect((await mensajes(doc.id)).at(-1)).toMatchObject({ tipo: 'impago', estado: 'admitido', datos: { vencimiento: '2026-11-07' } });
        const total = Number((await m.db.query('select total from documentos_fiscales where id = $1', [doc.id])).rows[0].total);
        await pagar(doc.id, total, '2026-12-01');
        await conciliar(doc.id, 'paid', total);
        await pasada();
        await pasada();
        expect((await mensajes(doc.id)).map((x) => x.tipo)).toEqual(['alta', 'impago', 'anula_impago', 'cobro']);
        expect((await mensajes(doc.id)).at(-1)).toMatchObject({ estado: 'admitido', datos: { fechaCobro: '2026-12-01' } });
    });

    it('pagada al expedirse: la factura lleva la fecha de pago y el cobro no se comunica aparte', async () => {
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
        const doc = await emitir('spfe-mixto', { dueDate: null });
        const total = Number((await m.db.query('select total from documentos_fiscales where id = $1', [doc.id])).rows[0].total);
        await pagar(doc.id, total, hoy);
        await conciliar(doc.id, 'paid', total);
        await pasada();
        await pasada();
        const ms = await mensajes(doc.id);
        expect(ms.map((x) => x.tipo)).toEqual(['alta']);
        expect(ms[0].datos.pagadaEl).toBe(hoy);
        expect(ms[0].xml).toContain(`<cac:PrepaidPayment><cbc:PaidDate>${hoy}</cbc:PaidDate></cac:PrepaidPayment>`);
    });

    it('una rectificativa no lleva estado de cobro', async () => {
        const original = await emitir('spfe-mixto', {}, { issuedAt: new Date(Date.now() - 60_000).toISOString() });
        const doc = await emitir('spfe-rectificativa', {}, { rectificaA: original.id });
        await pasada();
        await conciliar(doc.id, 'paid', 0);
        await pasada();
        expect((await mensajes(doc.id)).map((x) => x.tipo)).toEqual(['alta']);
        expect((await mensajes(doc.id))[0].xml).toContain('<cbc:InvoiceTypeCode>384</cbc:InvoiceTypeCode>');
    });
});

describe('baja y estados del cliente', () => {
    it('anular una factura admitida la da de baja; una que nunca salió se descarta', async () => {
        const admitida = await emitir('spfe-mixto');
        await pasada();
        await m.db.query("update spfe_envio_estado set proximo_envio_at = now() + interval '1 hour'");
        const nueva = await emitir('spfe-ipsi');
        await pasada();
        expect((await mensajes(nueva.id)).map((x) => x.estado)).toEqual(['pendiente']);
        await m.db.query("update documentos_fiscales set lifecycle = 'void', status = 'cancelled', voided_at = now() where id = any($1::uuid[])", [[admitida.id, nueva.id]]);
        await m.db.query('update spfe_envio_estado set proximo_envio_at = null');
        await pasada();
        expect((await mensajes(nueva.id)).map((x) => x.estado)).toEqual(['descartado']);
        const ms = await mensajes(admitida.id);
        expect(ms.map((x) => [x.tipo, x.estado])).toEqual([['alta', 'admitido'], ['baja', 'admitido']]);
        expect(ms[1].xml).toContain('<cbc:ResponseCode>CANCELINVOICE</cbc:ResponseCode>');
        expect(llamadas('remitir', nueva.numero)).toBe(0);
        expect(await estadoSpfeFactura(ORG, admitida.id)).toMatchObject({ alta: { tipo: 'baja', estado: 'admitido' } });
    });

    it('recoge el pago y el rechazo que comunicó el cliente', async () => {
        const pagada = await emitir('spfe-mixto');
        const rechazada = await emitir('spfe-ipsi');
        await pasada();
        const f = (doc: { numero: string }) => [...aeat.facturas.entries()].find(([k]) => k.includes(`|${doc.numero}|`))![1];
        f(pagada).destinatario.push({ codigo: 'PAYMENT', fecha: '2026-11-02' });
        f(rechazada).destinatario.push({ codigo: 'REJECTION', fecha: '2026-10-25', motivo: '02' });
        // La consulta de estados va por turnos: hasta que toca no se pregunta.
        await pasada();
        expect((await m.db.query('select count(*)::int as n from spfe_estados_destinatario')).rows[0].n).toBe(0);
        await m.db.query('update spfe_envio_estado set proxima_consulta_at = null');
        const r = await pasada();
        expect(r.estadosDestinatario).toBe(2);
        expect(await estadoSpfeFactura(ORG, pagada.id)).toMatchObject({ destinatario: { codigo: 'PAYMENT', fecha: '2026-11-02', motivo: null } });
        expect(await estadoSpfeFactura(ORG, rechazada.id)).toMatchObject({ destinatario: { codigo: 'REJECTION', motivo: '02' } });
        expect((await estadoSpfeOrg(ORG)).incidencias).toContainEqual({ documentoId: rechazada.id, numero: rechazada.numero, tipo: 'rechazo_cliente', motivo: '02' });
        // Idempotente: la misma observación no se duplica.
        await m.db.query('update spfe_envio_estado set proxima_consulta_at = null');
        expect((await pasada()).estadosDestinatario).toBe(0);
    });
});

describe('garantías', () => {
    it('un solo proceso en vuelo por organización (lease)', async () => {
        await m.db.query("update spfe_envio_estado set lease_hasta = now() + interval '1 minute', lease_token = 'otro'");
        try {
            expect(await pasada()).toMatchObject({ omitido: 'en_curso' });
        } finally {
            await m.db.query('update spfe_envio_estado set lease_hasta = null, lease_token = null');
        }
    });

    it('lo enviado es inmutable y un incierto solo se resuelve consultando', async () => {
        const [admitido] = (await m.db.query("select id from spfe_mensajes where estado = 'admitido' limit 1")).rows;
        await expect(m.db.query("update spfe_mensajes set xml = '<x/>' where id = $1", [admitido.id])).rejects.toThrow(/no se modifican/);
        await expect(m.db.query("update spfe_mensajes set error_mensaje = 'x' where id = $1", [admitido.id])).rejects.toThrow(/finales/);
        await expect(m.db.query('delete from spfe_mensajes where id = $1', [admitido.id])).rejects.toThrow(/no se borra/);
        const doc = await emitir('spfe-igic');
        aeat.plan = ['perdida'];
        await pasada();
        const [incierto] = (await m.db.query("select id from spfe_mensajes where documento_id = $1", [doc.id])).rows;
        await expect(m.db.query("update spfe_mensajes set estado = 'pendiente' where id = $1", [incierto.id])).rejects.toThrow(/consultando/);
        await expect(m.db.query("update spfe_mensajes set estado = 'rechazado' where id = $1", [incierto.id])).rejects.toThrow(/consultando/);
    });

    it('una organización no ve la cola, los estados ni la configuración de otra (RLS con el rol de aplicación)', async () => {
        await emitir('spfe-mixto', {}, { org: ORG2 });
        const contar = (org: string, tabla: string) => m.db.transaction(async (t: any) => {
            await t.query('set local role cord_app');
            await t.query("select set_config('app.org_id', $1, true)", [org]);
            return Number((await t.query(`select count(*)::int as n from ${tabla}`)).rows[0].n);
        });
        for (const tabla of ['spfe_mensajes', 'spfe_estados_destinatario', 'spfe_envio_estado']) {
            expect(await contar(ORG, tabla), tabla).toBeGreaterThan(0);
            expect(await contar(ORG2, tabla), tabla).toBe(0);
        }
    });
});

describe('veredicto de una consulta', () => {
    const c = { nifEmisor: 'B28003218', numero: 'A-1', fecha: '2026-10-08' };
    it('cada tipo se da por hecho solo si la SPFE tiene su efecto', () => {
        expect(veredictoConsulta('alta', {}, { codigo: c, consta: true })).toBe('admitido');
        expect(veredictoConsulta('alta', {}, { codigo: c, consta: false })).toBe('descartado');
        expect(veredictoConsulta('baja', {}, { codigo: c, consta: false })).toBe('admitido');
        expect(veredictoConsulta('cobro', { fechaCobro: '2026-10-22' }, { codigo: c, consta: true, estadoEmisor: { codigo: 'SETTLEMENT', fecha: '2026-10-22' } })).toBe('admitido');
        expect(veredictoConsulta('cobro', { fechaCobro: '2026-10-22' }, { codigo: c, consta: true, estadoEmisor: { codigo: 'SETTLEMENT', fecha: '2026-10-21' } })).toBe('descartado');
        expect(veredictoConsulta('anula_cobro', {}, { codigo: c, consta: true, estadoEmisor: null })).toBe('admitido');
        expect(veredictoConsulta('impago', {}, { codigo: c, consta: true, estadoEmisor: { codigo: 'DEFAULT' } })).toBe('admitido');
        expect(veredictoConsulta('anula_impago', {}, { codigo: c, consta: true, estadoEmisor: { codigo: 'DEFAULT' } })).toBe('descartado');
    });
});
