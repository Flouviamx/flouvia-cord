// Factura electrónica con SUNAT contra Postgres real (PGlite) con la sección
// "Rieles fiscales de LatAm" de db/schema.sql tal cual, y un SUNAT simulado
// en fetch que habla SOAP como el real (billService y billConsultService):
// aceptación con CDR, observaciones, rechazo en CDR y en soap:Fault (número
// usado), excepción (número libre), respuesta perdida y su recuperación por
// consulta, número ocupado por otro sistema, servicio beta sin estado, nota
// de crédito, numeración concurrente, idempotencia, descarga del XML y el
// outbox del cron.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import forge from 'node-forge';
import { xmlsDelZip, zipComprobante } from '../src/lib/fiscal/latam/sunat/zip';

const m = vi.hoisted(() => ({ db: null as any, finalize: vi.fn() }));

vi.mock('../src/lib/db', () => {
    const run = (q: { text: string; values: any[] }) => m.db.query(q.text, q.values).then((r: any) => r.rows);
    const sql = (s: TemplateStringsArray, ...values: any[]) => {
        const q: any = { text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values };
        q.then = (res: any, rej: any) => run(q).then(res, rej);
        q.catch = (rej: any) => run(q).catch(rej);
        return q;
    };
    const tx = (setup: (tx: any) => Promise<void>) => async (...queries: any[]) => m.db.transaction(async (t: any) => {
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
vi.mock('../src/lib/fiscal/invoices', () => ({ finalizeInvoice: m.finalize }));

const ORG = '00000000-0000-4000-8000-0000000000c1';
const ORG2 = '00000000-0000-4000-8000-0000000000c2';
const RUC = '20100066603';
const RUC_CLIENTE = '20131312955';
/** Cliente designado agente de retención del IGV en los ajustes. */
const RUC_AGENTE = '20000000001';
const CLAVE_SOL = 'clave-sol-secreta';

process.env.SUNAT_ENABLED = 'true';
process.env.SUNAT_ENTORNO = 'produccion';

const { PeruSunatProvider } = await import('../src/lib/fiscal/providers/PeruSunatProvider');
const { parsearCertificado } = await import('../src/lib/fiscal/latam/certificado');
const { guardarCredencial, guardarAjustes } = await import('../src/lib/fiscal/latam/credenciales');
const { estadoSunat } = await import('../src/lib/fiscal/latam/sunat/estado');
const { xmlAceptadoSunat } = await import('../src/lib/fiscal/latam/sunat/descarga');
const { railListo } = await import('../src/lib/fiscal/latam/estado');
const { orgsConPendientes, resolverPendientesDeOrg } = await import('../src/lib/fiscal/latam/resolucion');
const { representacionDe } = await import('../src/lib/fiscal/latam/representacion');
const provider = new PeruSunatProvider();

// ── SUNAT simulado ───────────────────────────────────────────────────────────
type Comportamiento = 'ok' | 'obs' | 'cdr_rechazo' | 'fault_rechazo' | 'excepcion' | 'perdida' | 'caida' | 'html';
interface Registrado { estado: 'aceptado' | 'rechazado'; receptor: string; resumen: string; proceso: string; referencia: string; archivo: string }
const sunat = {
    /** Producción guarda lo recibido; beta no (cada envío se valida suelto). */
    registrados: new Map<string, Registrado>(),
    plan: [] as Comportamiento[],
    consultaCaida: false,
    proceso: 0,
    llamadas: [] as { op: string; url: string; body: string }[],
};
const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1] ?? '';
const sobre = (cuerpo: string) => '<?xml version="1.0" encoding="UTF-8"?><soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">'
    + `<soap-env:Header/><soap-env:Body>${cuerpo}</soap-env:Body></soap-env:Envelope>`;
const fault = (code: string, msg: string) => new Response(sobre(`<soap-env:Fault><faultcode>soap-env:Client.${code}</faultcode><faultstring>${msg}</faultstring></soap-env:Fault>`), { status: 500 });

function cdrZip(r: Registrado, codigo: number, descripcion: string, notas: string[] = []): string {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"'
        + ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">'
        + `<cbc:UBLVersionID>2.0</cbc:UBLVersionID><cbc:CustomizationID>1.0</cbc:CustomizationID><cbc:ID>${r.proceso}</cbc:ID>`
        + '<cbc:IssueDate>2026-10-09T10:00:00</cbc:IssueDate><cbc:IssueTime>00:00:00</cbc:IssueTime><cbc:ResponseDate>2026-10-09</cbc:ResponseDate>'
        + notas.map((n) => `<cbc:Note>${n}</cbc:Note>`).join('')
        + `<cac:DocumentResponse><cac:Response><cbc:ReferenceID>${r.referencia}</cbc:ReferenceID><cbc:ResponseCode>${codigo}</cbc:ResponseCode>`
        + `<cbc:Description>${descripcion}</cbc:Description></cac:Response><cac:DocumentReference><cbc:ID>${r.referencia}</cbc:ID></cac:DocumentReference>`
        + `<cac:RecipientParty><cac:PartyIdentification><cbc:ID>${r.receptor}</cbc:ID></cac:PartyIdentification></cac:RecipientParty></cac:DocumentResponse></ar:ApplicationResponse>`;
    return Buffer.from(zipComprobante(`R-${r.archivo}`, xml)).toString('base64');
}

function sendBill(url: string, body: string): Response {
    const archivo = tag(body, 'fileName').replace(/\.zip$/, '');
    const [{ xml }] = xmlsDelZip(new Uint8Array(Buffer.from(tag(body, 'contentFile'), 'base64')));
    const receptor = /<cac:AccountingCustomerParty>[\s\S]*?<cbc:ID schemeID="(\w+)">([^<]+)<\/cbc:ID>/.exec(xml);
    const r: Registrado = {
        estado: 'aceptado', archivo, proceso: String(1_791_530_000_000 + ++sunat.proceso),
        referencia: /<cbc:ID>([^<]+)<\/cbc:ID>/.exec(xml)![1], receptor: receptor ? `${receptor[1]}-${receptor[2]}` : '', resumen: /<ds:DigestValue>([^<]+)/.exec(xml)![1],
    };
    const produccion = !url.includes('e-beta');
    const comportamiento = sunat.plan.shift() ?? 'ok';
    if (comportamiento === 'caida') throw new TypeError('fetch failed');
    if (comportamiento === 'html') return new Response('<html><body>Service Unavailable</body></html>', { status: 503 });
    if (comportamiento === 'excepcion') return fault('0109', 'El sistema no puede responder su solicitud. (El servicio de autenticación no está disponible)');
    if (produccion && sunat.registrados.has(archivo)) return fault('1033', 'El comprobante fue registrado previamente con otros datos');
    if (comportamiento === 'fault_rechazo') {
        if (produccion) sunat.registrados.set(archivo, { ...r, estado: 'rechazado' });
        return fault('3280', "El importe total del comprobante no coincide con el valor calculado - Detalle: xxx.xxx.xxx value='ticket: 1 error: INFO : 3280'");
    }
    if (comportamiento === 'cdr_rechazo') {
        if (produccion) sunat.registrados.set(archivo, { ...r, estado: 'rechazado' });
        return new Response(sobre(`<br:sendBillResponse xmlns:br="http://service.sunat.gob.pe"><applicationResponse>${cdrZip(r, 2017, 'El numero de documento de identidad del receptor debe ser RUC')}</applicationResponse></br:sendBillResponse>`));
    }
    if (produccion) sunat.registrados.set(archivo, r);
    if (comportamiento === 'perdida') throw new TypeError('socket hang up');
    const notas = comportamiento === 'obs' ? ['4252 - El dato ingresado como atributo @listName es incorrecto.'] : [];
    return new Response(sobre(`<br:sendBillResponse xmlns:br="http://service.sunat.gob.pe"><applicationResponse>${cdrZip(r, 0, `La Factura numero ${r.referencia}, ha sido aceptada`, notas)}</applicationResponse></br:sendBillResponse>`));
}

function consulta(op: 'getStatus' | 'getStatusCdr', body: string): Response {
    if (sunat.consultaCaida) throw new TypeError('fetch failed');
    const archivo = `${tag(body, 'rucComprobante')}-${tag(body, 'tipoComprobante')}-${tag(body, 'serieComprobante')}-${tag(body, 'numeroComprobante')}`;
    const r = sunat.registrados.get(archivo);
    const codigo = !r ? '0011' : r.estado === 'aceptado' ? '0001' : '0002';
    const mensaje = !r ? 'El comprobante de pago electrónico no existe' : r.estado === 'aceptado' ? 'El comprobante existe y está aceptado' : 'El comprobante existe pero está rechazado';
    if (op === 'getStatus') {
        return new Response(sobre(`<ns2:getStatusResponse xmlns:ns2="http://service.sunat.gob.pe"><status><statusCode>${codigo}</statusCode><statusMessage>${mensaje}</statusMessage></status></ns2:getStatusResponse>`));
    }
    const content = r ? `<content>${cdrZip(r, r.estado === 'aceptado' ? 0 : 2017, mensaje)}</content>` : '';
    return new Response(sobre(`<ns2:getStatusCdrResponse xmlns:ns2="http://service.sunat.gob.pe"><statusCdr>${content}<statusCode>${r ? '0004' : '0011'}</statusCode><statusMessage>${mensaje}</statusMessage></statusCdr></ns2:getStatusCdrResponse>`));
}

async function fakeFetch(url: string, init: RequestInit): Promise<Response> {
    const body = String(init.body ?? '');
    const op = String((init.headers as Record<string, string>).SOAPAction).replace(/"/g, '').replace('urn:', '');
    sunat.llamadas.push({ op, url: String(url), body });
    expect(String(url)).toMatch(/^https:\/\/e-(beta|factura)\.sunat\.gob\.pe\//);
    switch (op) {
        case 'sendBill': return sendBill(String(url), body);
        case 'getStatus':
        case 'getStatusCdr':
            expect(String(url)).toBe('https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService');
            return consulta(op, body);
        default: throw new Error(`operación no simulada: ${op}`);
    }
}
const llamadas = (op: string) => sunat.llamadas.filter((l) => l.op === op);

// ── Base ─────────────────────────────────────────────────────────────────────
function seccionLatam(): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- ── Rieles fiscales de LatAm');
    const fin = schema.indexOf('-- END rieles-latam', inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(inicio);
    return schema.slice(inicio, fin);
}

function certificadoDePrueba() {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const key = forge.pki.privateKeyFromPem(keyPem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '0b';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: 'EMPRESA DE PRUEBA' }, { name: 'organizationalUnitName', value: RUC }]);
    cert.setIssuer([{ name: 'commonName', value: 'Entidad de certificación' }]);
    cert.sign(key, forge.md.sha256.create());
    return { certPem: forge.pki.certificateToPem(cert), keyPem };
}

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create role cord_app;
        create table orgs(id uuid primary key, country_code text, rfc text, razon_social text, nombre text, fiscal_metadata jsonb);
        create table clientes(id uuid primary key, org_id uuid not null references orgs(id) on delete cascade);
        create table documentos_fiscales(
            id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, cliente_id uuid, cotizacion_id uuid,
            credit_note_of uuid, service_date date, service_date_end date, due_date date, notes text, status text not null default 'error',
            provider_document_id text, provider_data jsonb, updated_at timestamptz);
        create table documento_pagos(id serial primary key, org_id uuid not null, documento_id uuid not null, monto numeric not null);
        create table cotizacion_cobros(id serial primary key, org_id uuid not null, cotizacion_id uuid not null, monto numeric not null, status text not null);
        insert into orgs values ('${ORG}', 'PE', null, null, 'Empresa', '{"tax_id":"${RUC}","legal_name":"EMPRESA DE PRUEBA S.A.C."}'), ('${ORG2}', 'PE', null, null, null, '{}');
        grant select, insert, update, delete on all tables in schema public to cord_app;`);
    await m.db.exec(seccionLatam());
    const { certPem, keyPem } = certificadoDePrueba();
    const parsed = parsearCertificado({ certificado: certPem, llave: keyPem });
    const meta = { identificador: RUC, nombreArchivo: 'empresa.pfx', subidoPor: null };
    await guardarCredencial(ORG, 'sunat', 'produccion', parsed, { ...meta, secretos: { usuarioSol: 'CORDENVIO', claveSol: CLAVE_SOL } });
    await guardarCredencial(ORG, 'sunat', 'homologacion', parsed, meta);
    await guardarAjustes(ORG, 'sunat', {
        serie: 'F001', concepto: 'servicios', afectacionSinIgv: '20', ultimoNumeroFactura: 100, ultimoNumeroNotaCredito: 7,
        agentesRetencion: [RUC_AGENTE],
    });
}, 30_000);

afterAll(async () => {
    vi.unstubAllGlobals();
    await m.db?.close();
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    sunat.plan = [];
    sunat.llamadas = [];
    sunat.consultaCaida = false;
    m.finalize.mockReset();
});

let seq = 0;
const lineas = (base: number, rate = 0.18) => [{
    description: 'Servicio de consultoría', quantity: 1, unitPrice: base, taxRate: rate, subtotal: base,
    taxAmount: Math.round(base * rate * 100) / 100, total: Math.round(base * (1 + rate) * 100) / 100,
}];

async function nuevoDocumento(opts: { creditNoteOf?: string; dueDate?: string; notes?: string; org?: string } = {}) {
    const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
    await m.db.query('insert into documentos_fiscales (id, org_id, credit_note_of, due_date, notes) values ($1, $2, $3, $4, $5)',
        [id, opts.org ?? ORG, opts.creditNoteOf ?? null, opts.dueDate ?? null, opts.notes ?? null]);
    return id;
}

function request(documentId: string, over: Record<string, unknown> = {}) {
    const base = (over.base as number) ?? 100;
    return {
        documentId, invoiceNumber: `FA-${seq}`, idempotencyKey: `k-${documentId}`, orgId: ORG, quoteId: documentId,
        countryCode: 'PE', documentType: 'sunat_invoice',
        issuer: { legalName: 'EMPRESA DE PRUEBA S.A.C.', taxId: RUC, address: { countryCode: 'PE' } },
        recipient: { legalName: 'CLIENTE S.A.', taxId: RUC_CLIENTE, address: { countryCode: 'PE' } },
        lines: lineas(base), totals: { subtotal: base, taxes: Math.round(base * 18) / 100, total: Math.round(base * 118) / 100, currency: 'PEN' },
        issuedAt: new Date().toISOString(), ...over,
    } as any;
}

const intentos = async (doc: string) => (await m.db.query(
    'select estado, numero, tipo, entorno, autorizacion, observaciones, error_codigo, error_mensaje, respuesta from fiscal_rail_comprobantes where documento_id = $1 order by created_at, numero', [doc])).rows;
const numeroDe = (r: { fiscalId?: string }) => Number(String(r.fiscalId).split('-').at(-1));
const envejecer = () => m.db.exec(`alter table fiscal_rail_comprobantes disable trigger trg_fiscal_rail_comprobante_inmutable;
    update fiscal_rail_comprobantes set created_at = now() - interval '10 minutes', enviado_at = now() - interval '10 minutes' where estado in ('incierto', 'pendiente');
    alter table fiscal_rail_comprobantes enable trigger trg_fiscal_rail_comprobante_inmutable;`);
/** El siguiente número que Cord tomará en la serie de facturas de producción. */
const siguiente = async (tipo = '01') => {
    const [r] = (await m.db.query(`select coalesce(max(numero), 0)::int as n from fiscal_rail_comprobantes
        where rail = 'sunat' and entorno = 'produccion' and serie = 'F001' and tipo = $1
          and (estado in ('pendiente', 'incierto', 'autorizado') or coalesce(respuesta->>'numero_consumido', 'false') = 'true')`, [tipo])).rows;
    return Math.max(r.n, tipo === '01' ? 100 : 7) + 1;
};

// ── Pruebas ──────────────────────────────────────────────────────────────────
describe('estado del riel', () => {
    it('dice qué falta en vocabulario de códigos y solo está listo con todo; nunca devuelve secretos', async () => {
        expect((await estadoSunat(ORG2)).faltantes).toEqual(['ruc', 'razon_social', 'serie', 'concepto', 'certificado']);
        expect(await railListo(ORG2, 'sunat')).toBe(false);
        const e = await estadoSunat(ORG);
        expect(e).toMatchObject({ habilitado: true, entorno: 'produccion', ruc: RUC, faltantes: [], listo: true, usuarioSol: 'CORDENVIO' });
        expect(e.credencial?.identificador).toBe(RUC);
        expect(JSON.stringify(e)).not.toMatch(/BEGIN|PRIVATE/);
        expect(JSON.stringify(e)).not.toContain(CLAVE_SOL);
        expect(await railListo(ORG, 'sunat')).toBe(true);
    });

    it('con el riel apagado nada está listo y un documento sunat_* no degrada en silencio', async () => {
        process.env.SUNAT_ENABLED = 'false';
        try {
            expect(await railListo(ORG, 'sunat')).toBe(false);
            const doc = await nuevoDocumento();
            await expect(provider.issueDocument(request(doc))).rejects.toThrow(/no está activa/);
            const comercial = await provider.issueDocument(request(doc, { documentType: 'commercial_invoice' }));
            expect(comercial.rawProviderData?.regulatory_status).toBe('commercial_only');
            expect(sunat.llamadas).toHaveLength(0);
        } finally {
            process.env.SUNAT_ENABLED = 'true';
        }
    });
});

describe('aceptación', () => {
    it('factura aceptada: serie y correlativo propios, CDR, QR, XML descargable y replay idempotente', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(r.provider).toBe('sunat');
        // El primer número continúa al último emitido fuera de Cord (ajustes: 100).
        expect(r.fiscalId).toBe(`${RUC}-01-F001-101`);
        expect(r.invoiceNumber).toBe('F001-00000101');
        expect(r.rawProviderData).toMatchObject({ regulatory_status: 'sunat', livemode: true });
        expect(r.rawProviderData?.simulado).toBeUndefined();

        const [envio] = llamadas('sendBill');
        expect(envio.url).toBe('https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService');
        expect(tag(envio.body, 'wsse:Username')).toBe(`${RUC}CORDENVIO`);
        expect(tag(envio.body, 'wsse:Password')).toBe(CLAVE_SOL);
        expect(tag(envio.body, 'fileName')).toBe(`${RUC}-01-F001-101.zip`);

        const rep = representacionDe(r.rawProviderData)!;
        expect(rep).toMatchObject({ titulo: 'FACTURA ELECTRÓNICA', qrNivel: 'Q', qrPosicion: 'inferior' });
        const resumen = (r.rawProviderData as any).latam.autorizacion.resumen;
        expect(rep.qrUrl).toBe(`${RUC}|01|F001|101|18.00|118.00|${(r.rawProviderData as any).latam.comprobante.fecha}|6|${RUC_CLIENTE}|${resumen}`);
        expect(rep.prueba).toBeUndefined();

        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'autorizado', numero: 101, tipo: '01', entorno: 'produccion' });
        expect(i.autorizacion).toMatch(/^1791530\d+$/);
        expect(i.respuesta.cdr).toMatchObject({ codigo: 0, referencia: 'F001-101', receptor: `6-${RUC_CLIENTE}` });

        // El ejemplar electrónico es exactamente lo que se envió.
        const xml = await xmlAceptadoSunat(ORG, doc);
        expect(xml?.archivo).toBe(`${RUC}-01-F001-101`);
        const [{ xml: enviado }] = xmlsDelZip(new Uint8Array(Buffer.from(tag(envio.body, 'contentFile'), 'base64')));
        expect(xml?.xml).toBe(enviado);
        expect(xml?.xml).toContain(`<ds:DigestValue>${resumen}</ds:DigestValue>`);

        const replay = await provider.issueDocument(request(doc));
        expect(replay.fiscalId).toBe(r.fiscalId);
        expect(llamadas('sendBill')).toHaveLength(1);
    });

    it('aceptada con observaciones: se conservan y viajan a provider_data', async () => {
        const doc = await nuevoDocumento();
        sunat.plan = ['obs'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        const obs = (r.rawProviderData as any).latam.observaciones;
        expect(obs).toEqual([expect.objectContaining({ code: 4252, mensaje: expect.stringMatching(/observación \(código 4252\)/) })]);
    });

    it('al crédito con abono previo y cliente agente de retención: cuota neta y retención del 3 %', async () => {
        const vence = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
        const doc = await nuevoDocumento({ dueDate: vence });
        await m.db.query('insert into documento_pagos (org_id, documento_id, monto) values ($1, $2, 100)', [ORG, doc]);
        const r = await provider.issueDocument(request(doc, { base: 1000, recipient: { legalName: 'AGENTE S.A.', taxId: RUC_AGENTE, address: { countryCode: 'PE' } } }));
        expect(r.success).toBe(true);
        const [{ xml }] = xmlsDelZip(new Uint8Array(Buffer.from(tag(llamadas('sendBill')[0].body, 'contentFile'), 'base64')));
        // 1180 − 100 cobrados − 35.40 de retención.
        expect(xml).toContain('<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID><cbc:Amount currencyID="PEN">1044.60</cbc:Amount>');
        expect(xml).toContain(`<cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID><cbc:Amount currencyID="PEN">1044.60</cbc:Amount><cbc:PaymentDueDate>${vence}</cbc:PaymentDueDate>`);
        expect(xml).toContain('<cbc:AllowanceChargeReasonCode>62</cbc:AllowanceChargeReasonCode><cbc:MultiplierFactorNumeric>0.03</cbc:MultiplierFactorNumeric><cbc:Amount currencyID="PEN">35.40</cbc:Amount>');
        const rep = representacionDe(r.rawProviderData)!;
        expect(rep.filas).toEqual(expect.arrayContaining([{ k: 'Forma de pago', v: 'Crédito' }, { k: 'Retención del IGV (3 %)', v: 'S/ 35.40' }]));
    });

    it('error de datos ANTES de enviar: no toca SUNAT y explica qué corregir', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc, { recipient: { legalName: 'Juan Pérez', taxId: '12345678', address: { countryCode: 'PE' } } }));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(`err_pe_${doc}`);
        expect(r.error).toMatch(/boleta de venta/);
        expect(sunat.llamadas).toHaveLength(0);
        expect(await intentos(doc)).toHaveLength(0);
    });
});

describe('rechazos y excepciones', () => {
    it('rechazo en la CDR: mensaje de Cord, número usado y el siguiente documento toma otro', async () => {
        const n = await siguiente();
        const doc = await nuevoDocumento();
        sunat.plan = ['cdr_rechazo'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(`err_pe_${doc}`);
        expect(r.error).toMatch(/código 2017/);
        expect(r.error).toMatch(/número nuevo/);
        expect(r.error).not.toMatch(/soap|xxx|ticket/i);
        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'rechazado', numero: n, error_codigo: '2017' });
        expect(i.respuesta.numero_consumido).toBe(true);
        // Al corregir y reintentar, el número es otro.
        const otra = await provider.issueDocument(request(doc));
        expect(numeroDe(otra)).toBe(n + 1);
    });

    it('rechazo como soap:Fault (3280): número usado, mensaje traducido', async () => {
        const n = await siguiente();
        const doc = await nuevoDocumento();
        sunat.plan = ['fault_rechazo'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/importe total distinto/);
        expect((await intentos(doc))[0]).toMatchObject({ estado: 'rechazado', numero: n, error_codigo: '3280' });
        expect(await siguiente()).toBe(n + 1);
    });

    it('excepción (0109): el comprobante no quedó informado y el número se reutiliza', async () => {
        const n = await siguiente();
        const doc = await nuevoDocumento();
        sunat.plan = ['excepcion'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/código 109.*no quedó registrada/);
        expect((await intentos(doc))[0]).toMatchObject({ estado: 'rechazado', numero: n });
        expect((await intentos(doc))[0].respuesta.numero_consumido).toBe(false);
        // Excepción de SUNAT: no se consulta, el número sigue libre.
        expect(llamadas('getStatus')).toHaveLength(0);
        const otra = await provider.issueDocument(request(doc));
        expect(numeroDe(otra)).toBe(n);
    });

    it('número ocupado desde otro sistema: SUNAT responde 1033, la consulta lo confirma ajeno y se toma el siguiente', async () => {
        const n = await siguiente();
        sunat.registrados.set(`${RUC}-01-F001-${n}`, {
            estado: 'aceptado', archivo: `${RUC}-01-F001-${n}`, proceso: '1', referencia: `F001-${n}`, receptor: '6-20999999990', resumen: 'otro',
        });
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(numeroDe(r)).toBe(n + 1);
        const [ajeno, propio] = await intentos(doc);
        expect(ajeno).toMatchObject({ estado: 'rechazado', numero: n });
        expect(ajeno.respuesta.numero_consumido).toBe(true);
        expect(propio).toMatchObject({ estado: 'autorizado', numero: n + 1 });
        expect(llamadas('getStatus')).toHaveLength(1);
    });
});

describe('respuesta perdida', () => {
    it('SUNAT registró pero la respuesta se perdió: la consulta inmediata lo recupera sin reenviar', async () => {
        const doc = await nuevoDocumento();
        sunat.plan = ['perdida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(llamadas('sendBill')).toHaveLength(1);
        expect(llamadas('getStatus')).toHaveLength(1);
        expect(llamadas('getStatusCdr')).toHaveLength(1);
        const [i] = await intentos(doc);
        expect(i.estado).toBe('autorizado');
        expect(i.respuesta.recuperado).toBe(true);
    });

    it('sin respuesta ni registro: queda incierto, el reintento consulta (no reenvía) y el cron lo descarta y libera', async () => {
        const n = await siguiente();
        const doc = await nuevoDocumento();
        sunat.plan = ['caida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(doc);
        expect(r.rawProviderData).toMatchObject({ delivery_uncertain: true, retry_safe: true });
        expect((await intentos(doc))[0]).toMatchObject({ estado: 'incierto', numero: n });

        // Otro documento no puede numerar mientras el anterior no se resuelve.
        const otro = await nuevoDocumento();
        const bloqueado = await provider.issueDocument(request(otro));
        expect(bloqueado.success).toBe(false);
        expect(bloqueado.error).toMatch(/esperando la confirmación/);

        const reintento = await provider.issueDocument(request(doc));
        expect(reintento.rawProviderData?.delivery_uncertain).toBe(true);
        expect(llamadas('sendBill')).toHaveLength(1);

        await envejecer();
        await m.db.query("update documentos_fiscales set provider_document_id = id::text, provider_data = '{\"delivery_uncertain\":true,\"retry_safe\":true}' where id = $1", [doc]);
        expect(await orgsConPendientes('sunat')).toEqual([ORG]);
        expect(await resolverPendientesDeOrg(ORG, 'sunat')).toMatchObject({ revisados: 1, descartados: 1, autorizados: 0 });
        const [d] = (await m.db.query('select provider_document_id, provider_data from documentos_fiscales where id = $1', [doc])).rows;
        expect(d.provider_document_id).toBe(`err_sunat_${doc}`);
        expect(d.provider_data.delivery_uncertain).toBeUndefined();
        expect(m.finalize).not.toHaveBeenCalled();

        // El número no llegó a SUNAT: se reutiliza.
        const ok = await provider.issueDocument(request(doc));
        expect(numeroDe(ok)).toBe(n);
    });

    it('respuesta perdida y consulta caída: incierto; el cron lo recupera como aceptado y termina la emisión', async () => {
        const doc = await nuevoDocumento();
        sunat.plan = ['perdida'];
        sunat.consultaCaida = true;
        const r = await provider.issueDocument(request(doc));
        expect(r.rawProviderData?.delivery_uncertain).toBe(true);
        sunat.consultaCaida = false;
        await envejecer();
        expect(await resolverPendientesDeOrg(ORG, 'sunat')).toMatchObject({ autorizados: 1 });
        expect(m.finalize).toHaveBeenCalledWith(ORG, doc);
        expect((await intentos(doc))[0].estado).toBe('autorizado');
        expect(await orgsConPendientes('sunat')).toEqual([]);
        expect(llamadas('sendBill')).toHaveLength(1);
    });

    it('una respuesta que no es SOAP (HTML de un proxy) se trata como incierta, nunca como rechazo', async () => {
        const doc = await nuevoDocumento();
        sunat.plan = ['html'];
        const r = await provider.issueDocument(request(doc));
        expect(r.rawProviderData?.delivery_uncertain).toBe(true);
        await envejecer();
        expect(await resolverPendientesDeOrg(ORG, 'sunat')).toMatchObject({ descartados: 1 });
    });
});

describe('servicio beta (homologación)', () => {
    it('usa el usuario de pruebas, marca el documento como prueba y resuelve lo incierto reenviando el MISMO XML', async () => {
        process.env.SUNAT_ENTORNO = 'homologacion';
        try {
            const doc = await nuevoDocumento();
            const r = await provider.issueDocument(request(doc));
            expect(r.success).toBe(true);
            expect(r.invoiceNumber).toBe('H-F001-00000101');
            expect(r.rawProviderData).toMatchObject({ livemode: false, simulado: true });
            expect(representacionDe(r.rawProviderData)?.prueba).toBe(true);
            const [envio] = llamadas('sendBill');
            expect(envio.url).toBe('https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService');
            expect(tag(envio.body, 'wsse:Username')).toBe(`${RUC}MODDATOS`);

            const otro = await nuevoDocumento();
            sunat.plan = ['caida'];
            const incierto = await provider.issueDocument(request(otro));
            // Beta no guarda estado: el reenvío del mismo XML es la consulta.
            expect(incierto.success).toBe(true);
            const [, primero, segundo] = llamadas('sendBill');
            expect(segundo.body).toBe(primero.body);
            expect(llamadas('getStatus')).toHaveLength(0);
        } finally {
            process.env.SUNAT_ENTORNO = 'produccion';
        }
    });
});

describe('nota de crédito', () => {
    it('modifica la factura aceptada con su propia secuencia, tipo 01 si la acredita completa', async () => {
        const factura = await nuevoDocumento();
        const f = await provider.issueDocument(request(factura));
        const nc = await nuevoDocumento({ creditNoteOf: factura, notes: 'Error en el servicio facturado' });
        const r = await provider.issueDocument(request(nc, { documentType: 'sunat_credit_note' }));
        expect(r.success).toBe(true);
        expect(r.fiscalId).toBe(`${RUC}-07-F001-8`);
        expect(r.invoiceNumber).toBe('NC-F001-00000008');
        const [{ xml }] = xmlsDelZip(new Uint8Array(Buffer.from(tag(llamadas('sendBill').at(-1)!.body, 'contentFile'), 'base64')));
        expect(xml).toContain(`<cbc:ReferenceID>F001-${numeroDe(f)}</cbc:ReferenceID><cbc:ResponseCode>01</cbc:ResponseCode><cbc:Description>Error en el servicio facturado</cbc:Description>`);
        expect(representacionDe(r.rawProviderData)?.titulo).toBe('NOTA DE CRÉDITO ELECTRÓNICA');

        // Una parte: disminución en el valor (09), siguiente número de la serie de notas.
        const parcial = await nuevoDocumento({ creditNoteOf: factura });
        const p = await provider.issueDocument(request(parcial, { documentType: 'sunat_credit_note', base: 50 }));
        expect(p.fiscalId).toBe(`${RUC}-07-F001-9`);
        const [{ xml: xml2 }] = xmlsDelZip(new Uint8Array(Buffer.from(tag(llamadas('sendBill').at(-1)!.body, 'contentFile'), 'base64')));
        expect(xml2).toContain('<cbc:ResponseCode>09</cbc:ResponseCode>');
    });

    it('sin la factura aceptada por SUNAT no se envía', async () => {
        const factura = await nuevoDocumento();
        const nc = await nuevoDocumento({ creditNoteOf: factura });
        const r = await provider.issueDocument(request(nc, { documentType: 'sunat_credit_note' }));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/no fue aceptada por SUNAT/);
        expect(llamadas('sendBill')).toHaveLength(0);
    });

    it('una factura aceptada no se da de baja: se compensa con nota de crédito', async () => {
        const r = await provider.cancelDocument('x');
        expect(r).toMatchObject({ success: false, status: 'rejected' });
        expect(r.error).toMatch(/nota de crédito/);
    });
});

describe('numeración e idempotencia', () => {
    it('emisiones concurrentes de la misma serie toman números consecutivos sin huecos', async () => {
        const n = await siguiente();
        const docs = await Promise.all([nuevoDocumento(), nuevoDocumento(), nuevoDocumento()]);
        const rs = await Promise.all(docs.map((d) => provider.issueDocument(request(d))));
        expect(rs.every((r) => r.success)).toBe(true);
        expect(rs.map(numeroDe).sort((a, b) => a - b)).toEqual([n, n + 1, n + 2]);
    }, 30_000);

    it('dos emisiones simultáneas del MISMO documento envían una sola vez', async () => {
        const doc = await nuevoDocumento();
        const [a, b] = await Promise.all([provider.issueDocument(request(doc)), provider.issueDocument(request(doc))]);
        expect(a.success && b.success).toBe(true);
        expect(a.fiscalId).toBe(b.fiscalId);
        expect(llamadas('sendBill')).toHaveLength(1);
        expect((await intentos(doc)).filter((i: any) => i.estado === 'autorizado')).toHaveLength(1);
    }, 30_000);
});

describe('aislamiento (RLS con el rol de aplicación)', () => {
    it('una organización no ve los comprobantes, credenciales ni ajustes de otra', async () => {
        const contar = (org: string, tabla: string) => m.db.transaction(async (t: any) => {
            await t.query('set local role cord_app');
            await t.query("select set_config('app.org_id', $1, true)", [org]);
            return Number((await t.query(`select count(*)::int as n from ${tabla} where rail = 'sunat'`)).rows[0].n);
        });
        for (const tabla of ['fiscal_rail_comprobantes', 'fiscal_rail_credenciales', 'fiscal_rail_ajustes']) {
            expect(await contar(ORG, tabla), tabla).toBeGreaterThan(0);
            expect(await contar(ORG2, tabla), tabla).toBe(0);
        }
        // El XML aceptado tampoco se sirve a otra organización.
        const [{ documento_id }] = (await m.db.query("select documento_id from fiscal_rail_comprobantes where rail = 'sunat' and estado = 'autorizado' limit 1")).rows;
        expect(await xmlAceptadoSunat(ORG2, documento_id)).toBeNull();
    });
});
