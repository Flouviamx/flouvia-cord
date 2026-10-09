// Factura electrónica con la DIAN contra Postgres real (PGlite) con las
// secciones "Rieles fiscales de LatAm" y "DIAN" de db/schema.sql tal cual, y
// una DIAN simulada en fetch que habla SOAP 1.2 como la real: recibe el zip,
// RECALCULA el CUFE/CUDE del XML con la clave técnica o el PIN (como la regla
// FAD06/CAD06) y responde DianResponse con ApplicationResponse. Cubre
// validación, rechazo con reglas, respuesta perdida y su recuperación por
// consulta, caída antes de procesar y el cron, "procesado anteriormente",
// fault de certificado, nota crédito, numeración concurrente dentro del rango,
// contenedor, set de pruebas, inmutabilidad y RLS.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';

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
const NIT = '900373076';
const DV = '4';
const CLAVE_TECNICA = 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c';
const PIN = '12345';
const SOFTWARE = '56f2ae4e-9812-4fad-9255-08fcfcd5ccb0';
const TEST_SET = '4de36cb4-9973-4ea4-a156-34e909aa24dc';

process.env.DIAN_ENABLED = 'true';
process.env.DIAN_ENTORNO = 'homologacion';

const { ColombiaDianProvider } = await import('../src/lib/fiscal/providers/ColombiaDianProvider');
const { parsearCertificado } = await import('../src/lib/fiscal/latam/certificado');
const { guardarCredencial, guardarAjustes, credencialActiva } = await import('../src/lib/fiscal/latam/credenciales');
const { estadoDian, identidadDeOrg } = await import('../src/lib/fiscal/latam/dian/estado');
const { contextoDian, enviarSetDePruebasOrg, estadoSetDePruebasOrg, guardarClaves } = await import('../src/lib/fiscal/latam/dian/autorizacion');
const { contenedorDeDocumento, adjuntoDian } = await import('../src/lib/fiscal/latam/dian/contenedor');
const { cadenaDesde, certificadosDePkcs12 } = await import('../src/lib/fiscal/latam/dian/cadena');
const { railListo } = await import('../src/lib/fiscal/latam/estado');
const { resolverPendientesDeOrg } = await import('../src/lib/fiscal/latam/resolucion');
const { representacionDe } = await import('../src/lib/fiscal/latam/representacion');
const { cadenaDePrueba } = await import('../scripts/dian-cadena-prueba.mjs');
const provider = new ColombiaDianProvider();

// ── DIAN simulada ────────────────────────────────────────────────────────────
type Comportamiento = 'ok' | 'notificacion' | 'rechazo' | 'perdida' | 'caida' | 'fault' | 'duplicado';
const dian = {
    plan: [] as Comportamiento[],
    validados: new Map<string, { id: string; valido: boolean }>(),
    zips: new Map<string, string>(),
    llamadas: [] as { op: string; body: string }[],
};
const NS_B = 'http://schemas.datacontract.org/2004/07/DianResponse';
const sobre = (op: string, inner: string) => '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing"><s:Header>'
    + `<a:Action s:mustUnderstand="1">http://wcf.dian.colombia/IWcfDianCustomerServices/${op}Response</a:Action></s:Header>`
    + `<s:Body><${op}Response xmlns="http://wcf.dian.colombia">${inner}</${op}Response></s:Body></s:Envelope>`;
const respuestaApp = (id: string) => Buffer.from('<?xml version="1.0" encoding="utf-8" standalone="no"?><ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
    + `<cbc:ID>${id}</cbc:ID><cbc:IssueDate>2026-10-09</cbc:IssueDate><cbc:IssueTime>10:00:07-05:00</cbc:IssueTime></ApplicationResponse>`).toString('base64');
const dianResponse = (r: { valido: boolean; codigo: string; reglas?: string[]; id?: string; clave?: string }) => `<b:ErrorMessage xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">${(r.reglas ?? []).map((x) => `<c:string>${x}</c:string>`).join('')}</b:ErrorMessage>`
    + `<b:IsValid>${r.valido}</b:IsValid><b:StatusCode>${r.codigo}</b:StatusCode><b:StatusDescription>${r.valido ? 'Procesado Correctamente.' : 'Documento con errores en campos mandatorios.'}</b:StatusDescription>`
    + `<b:StatusMessage>x</b:StatusMessage><b:XmlBase64Bytes>${r.valido && r.id ? respuestaApp(r.id) : ''}</b:XmlBase64Bytes><b:XmlBytes/><b:XmlDocumentKey>${r.clave ?? ''}</b:XmlDocumentKey><b:XmlFileName>f</b:XmlFileName>`;
const dianResult = (op: string, r: Parameters<typeof dianResponse>[0]) => sobre(op, `<${op}Result xmlns:b="${NS_B}" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">${dianResponse(r)}</${op}Result>`);

const v = (xml: string, re: RegExp) => re.exec(xml)?.[1] ?? '';
const sha384 = (s: string) => createHash('sha384').update(s).digest('hex');
/** Recalcula el CUFE/CUDE desde el XML, como la DIAN. */
function cufeDelXml(xml: string): { id: string; cufe: string; recalculado: string } {
    const cab = /<cbc:ProfileExecutionID>(\d)<\/cbc:ProfileExecutionID><cbc:ID>([^<]+)<\/cbc:ID><cbc:UUID[^>]*>([0-9a-f]+)<\/cbc:UUID><cbc:IssueDate>([^<]+)<\/cbc:IssueDate><cbc:IssueTime>([^<]+)<\/cbc:IssueTime>/.exec(xml)!;
    const [, amb, id, cufe, fecha, hora] = cab;
    const total = /<cac:(?:Legal|Requested)MonetaryTotal>([\s\S]*?)<\/cac:(?:Legal|Requested)MonetaryTotal>/.exec(xml)![1];
    const antes = xml.slice(0, xml.search(/<cac:(?:Legal|Requested)MonetaryTotal>/));
    const iva = v(antes, /<cac:TaxTotal><cbc:TaxAmount currencyID="[A-Z]+">([^<]+)<\/cbc:TaxAmount>/) || '0.00';
    const bruto = v(total, /<cbc:LineExtensionAmount currencyID="[A-Z]+">([^<]+)</);
    const pagar = v(total, /<cbc:PayableAmount currencyID="[A-Z]+">([^<]+)</);
    const nit = v(xml, /<cac:AccountingSupplierParty>[\s\S]*?<cac:PartyTaxScheme>[\s\S]*?<cbc:CompanyID[^>]*>([^<]+)</);
    const adq = v(xml, /<cac:AccountingCustomerParty>[\s\S]*?<cac:PartyTaxScheme>[\s\S]*?<cbc:CompanyID[^>]*>([^<]+)</);
    const clave = xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no"?><Invoice') ? CLAVE_TECNICA : PIN;
    return { id, cufe, recalculado: sha384(`${id}${fecha}${hora}${bruto}01${iva}040.00030.00${pagar}${nit}${adq}${clave}${amb}`) };
}

function recibir(op: 'SendBillSync' | 'SendTestSetAsync', body: string): Response {
    const comportamiento = dian.plan.shift() ?? 'ok';
    if (comportamiento === 'caida') throw new TypeError('fetch failed');
    if (comportamiento === 'fault') return new Response(readFileSync(new URL('../scripts/fixtures/dian/respuesta-fault-certificado-no-confiable.xml', import.meta.url), 'utf8'), { status: 500 });
    const zip = Buffer.from(v(body, /<wcf:contentFile>([^<]+)</), 'base64');
    const archivos = unzipSync(zip);
    const nombres = Object.keys(archivos);
    expect(nombres).toHaveLength(1);
    expect(nombres[0]).toMatch(/^(fv|nc|nd)0900373076000\d{2}[0-9A-F]{8}\.xml$/);
    expect(v(body, /<wcf:fileName>([^<]+)</)).toBe(`z${nombres[0].slice(2, -4)}.zip`);
    const xml = strFromU8(archivos[nombres[0]]);
    expect(xml).toContain('<ds:SignatureValue');
    const { id, cufe, recalculado } = cufeDelXml(xml);
    if (op === 'SendTestSetAsync') {
        expect(v(body, /<wcf:testSetId>([^<]+)</)).toBe(TEST_SET);
        const zipKey = `zk-${dian.zips.size + 1}`;
        dian.zips.set(zipKey, cufe);
        dian.validados.set(cufe, { id, valido: cufe === recalculado });
        return new Response(sobre(op, `<${op}Result xmlns:b="http://schemas.datacontract.org/2004/07/UploadDocumentResponse"><b:ErrorMessageList/><b:ZipKey>${zipKey}</b:ZipKey></${op}Result>`));
    }
    if (comportamiento === 'duplicado') {
        dian.validados.set(cufe, { id, valido: true });
        return new Response(dianResult(op, { valido: false, codigo: '99', reglas: ['Regla: 90, Rechazo: Documento procesado anteriormente.'], clave: cufe }));
    }
    if (cufe !== recalculado) return new Response(dianResult(op, { valido: false, codigo: '99', reglas: ['Regla: FAD06, Rechazo: Valor del CUFE no está calculado correctamente.'], clave: cufe }));
    if (comportamiento === 'rechazo') {
        dian.validados.set(cufe, { id, valido: false });
        return new Response(dianResult(op, { valido: false, codigo: '99', reglas: ['Regla: FAK24, Rechazo: No fue informado el número de identificación del adquiriente.', 'Regla: FAJ71, Notificación: correo'], clave: cufe }));
    }
    dian.validados.set(cufe, { id, valido: true });
    if (comportamiento === 'perdida') throw new TypeError('socket hang up');
    const reglas = comportamiento === 'notificacion' ? ['Regla: FAJ71, Notificación: El correo del emisor no corresponde al registrado en el RUT.'] : [];
    return new Response(dianResult(op, { valido: true, codigo: '00', reglas, id, clave: cufe }));
}

async function fakeFetch(url: string, init: RequestInit): Promise<Response> {
    const body = String(init.body ?? '');
    const op = /action="http:\/\/wcf\.dian\.colombia\/IWcfDianCustomerServices\/(\w+)"/.exec(String((init.headers as Record<string, string>)['Content-Type']))![1];
    expect(String(url)).toBe('https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc');
    expect(body).toContain('<wsse:BinarySecurityToken');
    expect(body).toContain(`<wsa:Action>http://wcf.dian.colombia/IWcfDianCustomerServices/${op}</wsa:Action>`);
    dian.llamadas.push({ op, body });
    switch (op) {
        case 'SendBillSync':
        case 'SendTestSetAsync':
            return recibir(op, body);
        case 'GetStatus': {
            const d = dian.validados.get(v(body, /<wcf:trackId>([^<]+)</));
            if (!d) return new Response(dianResult(op, { valido: false, codigo: '66', reglas: [] }));
            return new Response(dianResult(op, d.valido ? { valido: true, codigo: '00', id: d.id } : { valido: false, codigo: '99', reglas: ['Regla: FAK24, Rechazo: adquiriente'] }));
        }
        case 'GetStatusZip': {
            const cufe = dian.zips.get(v(body, /<wcf:trackId>([^<]+)</));
            const d = cufe ? dian.validados.get(cufe) : null;
            const inner = d ? `<b:DianResponse>${dianResponse(d.valido ? { valido: true, codigo: '00', id: d.id } : { valido: false, codigo: '99', reglas: ['Regla: FAD06, Rechazo: CUFE'] })}</b:DianResponse>` : '';
            return new Response(sobre(op, `<${op}Result xmlns:b="${NS_B}">${inner}</${op}Result>`));
        }
        default:
            throw new Error(`operación no simulada: ${op}`);
    }
}
const llamadas = (op: string) => dian.llamadas.filter((l) => l.op === op);

// ── Base ─────────────────────────────────────────────────────────────────────
function seccion(inicio: string, fin: string): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const a = schema.indexOf(inicio);
    const b = schema.indexOf(fin, a);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    return schema.slice(a, b);
}

const AJUSTES = {
    tipoPersona: '1', responsabilidades: ['O-13'], tributo: '01', municipio: '11001', softwareId: SOFTWARE, prefijoNotas: 'NC',
    testSetId: TEST_SET,
    numeracion: { homologacion: { numero: '18760000001', prefijo: 'SETP', desde: 990000000, hasta: 990000100, vigenteDesde: '2019-01-19', vigenteHasta: '2030-01-19' } },
};

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create role cord_app;
        create table orgs(id uuid primary key, country_code text, rfc text, fiscal_metadata jsonb, razon_social text, nombre text, direccion text);
        create table clientes(id uuid primary key, org_id uuid not null references orgs(id) on delete cascade);
        create table documentos_fiscales(
            id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, cliente_id uuid,
            credit_note_of uuid, service_date date, service_date_end date, due_date date, status text not null default 'error',
            provider_document_id text, provider_data jsonb, updated_at timestamptz default now());
        insert into orgs values
            ('${ORG}', 'CO', null, '{"tax_id":"900.373.076-4","legal_name":"Negocio de Prueba S.A.S.","address_line1":"Calle 100 # 10-20"}', null, 'Negocio', null),
            ('${ORG2}', 'CO', null, '{}', null, 'Otro', null);
        grant select, insert, update, delete on all tables in schema public to cord_app;`);
    await m.db.exec(seccion('-- ── Rieles fiscales de LatAm', '-- END rieles-latam'));
    await m.db.exec(seccion('-- ── DIAN: factura electrónica de venta de Colombia', '-- END dian'));
    await m.db.exec('grant select, insert, update, delete on all tables in schema public to cord_app;');

    const c = cadenaDePrueba(NIT);
    const p12 = c.p12('clave');
    const parsed = parsearCertificado({ pkcs12: p12, pkcs12Password: 'clave' });
    const cadena = cadenaDesde(parsed.certPem, certificadosDePkcs12(p12, 'clave'));
    await guardarCredencial(ORG, 'dian', 'homologacion', { ...parsed, certPem: cadena.join('\n') }, { identificador: NIT, nombreArchivo: 'firma.p12', subidoPor: null, secretos: { pin: PIN } });
    await guardarAjustes(ORG, 'dian', AJUSTES);
}, 60_000);

afterAll(async () => {
    vi.unstubAllGlobals();
    await m.db?.close();
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    dian.plan = [];
    dian.llamadas = [];
    m.finalize.mockReset();
});

let seq = 0;
const lineas = (base: number, rate = 0.19) => [{
    description: 'Servicio', quantity: 1, unitPrice: base, taxRate: rate, subtotal: base,
    taxAmount: Math.round(base * rate * 100) / 100, total: Math.round(base * (1 + rate) * 100) / 100,
}];

async function nuevoDocumento(opts: { ficha?: Record<string, unknown> | null; creditNoteOf?: string; org?: string } = {}) {
    const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
    const cliente = `00000000-0000-4000-a000-${String(seq).padStart(12, '0')}`;
    await m.db.query('insert into clientes (id, org_id, dian) values ($1, $2, $3)', [cliente, opts.org ?? ORG, opts.ficha === undefined ? { tipoPersona: '1', tributo: '01', responsabilidades: ['O-13'] } : opts.ficha]);
    await m.db.query('insert into documentos_fiscales (id, org_id, cliente_id, credit_note_of, due_date) values ($1, $2, $3, $4, $5)', [id, opts.org ?? ORG, cliente, opts.creditNoteOf ?? null, null]);
    return id;
}

function request(documentId: string, over: Record<string, unknown> = {}) {
    const base = (over.base as number) ?? 100_000;
    return {
        documentId, invoiceNumber: `FV-${seq}`, idempotencyKey: `k-${documentId}`, orgId: ORG, quoteId: documentId,
        countryCode: 'CO', documentType: 'dian_invoice',
        issuer: { legalName: 'Negocio de Prueba S.A.S.', taxId: '900.373.076-4', address: { countryCode: 'CO', line1: 'Calle 100 # 10-20' } },
        recipient: { legalName: 'Cliente S.A.S.', taxId: '800197268-4', email: 'compras@cliente.co', address: { countryCode: 'CO' } },
        lines: lineas(base), totals: { subtotal: base, taxes: Math.round(base * 19) / 100, total: Math.round(base * 119) / 100, currency: 'COP' },
        issuedAt: new Date().toISOString(), ...over,
    } as any;
}

const intentos = async (doc: string) => (await m.db.query(
    'select id, estado, numero, serie, tipo, autorizacion, observaciones, error_codigo, error_mensaje, respuesta from fiscal_rail_comprobantes where documento_id = $1 order by created_at, numero', [doc])).rows;

// ── Pruebas ──────────────────────────────────────────────────────────────────
describe('estado del riel', () => {
    it('dice qué falta y solo está listo con todo, sin exponer secretos', async () => {
        const otra = await estadoDian(ORG2);
        expect(otra.faltantes).toEqual(expect.arrayContaining(['nit', 'tipo_persona', 'municipio', 'software', 'resolucion', 'prefijo_notas', 'certificado']));
        expect(await railListo(ORG2, 'dian')).toBe(false);

        // Sin la clave técnica todavía no está listo.
        expect((await estadoDian(ORG)).faltantes).toEqual(['clave_tecnica']);
        expect(await guardarClaves(ORG, 'homologacion', { claveTecnica: CLAVE_TECNICA })).toBe(true);
        expect((await credencialActiva(ORG, 'dian', 'homologacion'))?.secretos).toEqual({ pin: PIN, claveTecnica: CLAVE_TECNICA });
        const e = await estadoDian(ORG);
        expect(e).toMatchObject({ habilitado: true, entorno: 'homologacion', nit: NIT, dv: DV, faltantes: [], listo: true, secretos: { pin: true, claveTecnica: true } });
        expect(JSON.stringify(e)).not.toMatch(/BEGIN|PRIVATE|fc8eac42/);
        expect(await railListo(ORG, 'dian')).toBe(true);
    });

    it('con el riel apagado nada está listo y un documento dian_* no degrada en silencio', async () => {
        process.env.DIAN_ENABLED = 'false';
        try {
            expect(await railListo(ORG, 'dian')).toBe(false);
            const doc = await nuevoDocumento();
            await expect(provider.issueDocument(request(doc))).rejects.toThrow(/no está activa/);
            const comercial = await provider.issueDocument(request(doc, { documentType: 'commercial_invoice' }));
            expect(comercial.rawProviderData?.regulatory_status).toBe('commercial_only');
            expect(dian.llamadas).toHaveLength(0);
        } finally {
            process.env.DIAN_ENABLED = 'true';
        }
    });
});

let facturaValidada = '';
describe('validación previa', () => {
    it('factura validada: CUFE, número de la resolución, XML guardado y replay idempotente', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(r.provider).toBe('dian');
        expect(r.fiscalId).toMatch(/^[0-9a-f]{96}$/);
        expect(r.invoiceNumber).toBe('SETP990000000');
        expect(r.rawProviderData).toMatchObject({ regulatory_status: 'dian', livemode: false, simulado: true });
        const rep = representacionDe(r.rawProviderData)!;
        expect(rep.titulo).toBe('FACTURA ELECTRÓNICA DE VENTA');
        expect(rep.qrUrl).toContain(`CUFE: ${r.fiscalId}`);
        expect(rep.qrUrl).toContain(`QRCode: https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${r.fiscalId}`);
        expect(rep.qrCadaPagina).toBe(true);
        expect(rep.pie).toContain(r.fiscalId);
        expect(rep.filas.find((f) => f.k === 'Validada por la DIAN')?.v).toBe('09/10/2026 10:00:07');

        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'autorizado', numero: 990000000, serie: 'SETP', tipo: '01', autorizacion: r.fiscalId });
        const [g] = (await m.db.query('select nombre_xml, xml_firmado, xml_sha256, respuesta_xml, validado_fecha::text as f, validado_hora as h from dian_documentos where intento_id = $1', [i.id])).rows;
        expect(g.nombre_xml).toBe('fv0900373076000263B023380.xml');
        expect(g.xml_sha256).toBe(createHash('sha256').update(g.xml_firmado).digest('hex'));
        expect(g.respuesta_xml).toContain('<ApplicationResponse');
        expect([g.f, g.h]).toEqual(['2026-10-09', '10:00:07-05:00']);

        const antes = llamadas('SendBillSync').length;
        const replay = await provider.issueDocument(request(doc));
        expect(replay.fiscalId).toBe(r.fiscalId);
        expect(llamadas('SendBillSync')).toHaveLength(antes);
        facturaValidada = doc;
    });

    it('validada con notificaciones: se conservan y viajan a provider_data', async () => {
        dian.plan = ['notificacion'];
        const r = await provider.issueDocument(request(await nuevoDocumento()));
        expect(r.success).toBe(true);
        expect((r.rawProviderData as any).latam.observaciones[0]).toMatchObject({ code: 'FAJ71' });
    });

    it('rechazo con reglas: mensaje para el negocio, borrador descartable y el número se reutiliza', async () => {
        const doc = await nuevoDocumento();
        dian.plan = ['rechazo'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(`err_co_${doc}`);
        expect(r.error).toMatch(/datos del cliente.*regla FAK24/);
        expect(r.error).not.toMatch(/No fue informado/);
        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'rechazado', error_codigo: 'FAK24' });

        const otro = await nuevoDocumento();
        expect((await provider.issueDocument(request(otro))).success).toBe(true);
        expect((await intentos(otro))[0].numero).toBe(i.numero);
    });

    it('consumidor final sin identificación y datos faltantes ANTES de enviar', async () => {
        const cf = await provider.issueDocument(request(await nuevoDocumento({ ficha: null }), { recipient: { legalName: 'Juan', taxId: '', address: { countryCode: 'CO' } } }));
        expect(cf.success).toBe(true);
        expect((cf.rawProviderData as any).latam.comprobante.adquiriente).toMatchObject({ numero: '222222222222', consumidor_final: true });

        const antes = llamadas('SendBillSync').length;
        const sinFicha = await provider.issueDocument(request(await nuevoDocumento({ ficha: null })));
        expect(sinFicha.success).toBe(false);
        expect(sinFicha.error).toMatch(/persona natural o jurídica/);
        const exento = await provider.issueDocument(request(await nuevoDocumento(), { lines: lineas(1000, 0), totals: { subtotal: 1000, taxes: 0, total: 1000, currency: 'COP' } }));
        expect(exento.success).toBe(false);
        expect(exento.error).toMatch(/exentos o excluidos/);
        expect(llamadas('SendBillSync')).toHaveLength(antes);
    });
});

describe('respuestas perdidas: se consulta, nunca se reenvía', () => {
    it('la DIAN validó y la respuesta se perdió: la consulta inmediata lo recupera', async () => {
        const doc = await nuevoDocumento();
        dian.plan = ['perdida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(llamadas('SendBillSync')).toHaveLength(1);
        expect(llamadas('GetStatus')).toHaveLength(1);
        const [i] = await intentos(doc);
        expect(i.estado).toBe('autorizado');
        expect(i.respuesta.recuperado).toBe(true);
    });

    it('caída antes de procesar: queda incierto, el reintento consulta y el cron lo descarta y libera el número', async () => {
        const doc = await nuevoDocumento();
        dian.plan = ['caida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.rawProviderData).toMatchObject({ delivery_uncertain: true, retry_safe: true });
        const [i] = await intentos(doc);
        expect(i.estado).toBe('incierto');

        // Reintento inmediato: consulta (66, reciente) y NO reenvía.
        const envios = llamadas('SendBillSync').length;
        const r2 = await provider.issueDocument(request(doc));
        expect(r2.rawProviderData).toMatchObject({ delivery_uncertain: true });
        expect(llamadas('SendBillSync')).toHaveLength(envios);

        // El cron, pasado el margen, lo descarta y el número vuelve a estar libre.
        await m.db.exec(`alter table fiscal_rail_comprobantes disable trigger trg_fiscal_rail_comprobante_inmutable;
            update fiscal_rail_comprobantes set created_at = now() - interval '10 minutes', enviado_at = now() - interval '10 minutes' where id = '${i.id}';
            alter table fiscal_rail_comprobantes enable trigger trg_fiscal_rail_comprobante_inmutable;`);
        const res = await resolverPendientesDeOrg(ORG, 'dian');
        expect(res).toMatchObject({ descartados: 1 });
        const [{ provider_document_id }] = (await m.db.query('select provider_document_id from documentos_fiscales where id = $1', [doc])).rows;
        expect(provider_document_id === null || String(provider_document_id).startsWith('err_')).toBe(true);
        const r3 = await provider.issueDocument(request(doc));
        expect(r3.success).toBe(true);
        expect((await intentos(doc)).map((x: any) => x.estado)).toEqual(['descartado', 'autorizado']);
    });

    it('"documento procesado anteriormente": se consulta y es el mismo documento', async () => {
        const doc = await nuevoDocumento();
        dian.plan = ['duplicado'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(llamadas('GetStatus')).toHaveLength(1);
    });

    it('fault de certificado no avalado: rechazado sin quedar incierto y la pantalla lo dice', async () => {
        const doc = await nuevoDocumento();
        dian.plan = ['fault'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.rawProviderData?.delivery_uncertain).toBeUndefined();
        expect(r.error).toMatch(/ONAC/);
        expect((await intentos(doc))[0].estado).toBe('rechazado');
        expect((await estadoDian(ORG)).credencial?.verificacionError).toMatch(/ONAC/);
        // El siguiente envío correcto limpia el aviso.
        expect((await provider.issueDocument(request(await nuevoDocumento()))).success).toBe(true);
        expect((await estadoDian(ORG)).credencial?.verificacionError).toBeNull();
    });
});

describe('nota crédito y numeración', () => {
    it('nota crédito: CUDE con el PIN, numeración propia y referencia a la factura', async () => {
        const nc = await nuevoDocumento({ creditNoteOf: facturaValidada });
        const r = await provider.issueDocument(request(nc, { documentType: 'dian_credit_note' }));
        expect(r.success).toBe(true);
        expect(r.invoiceNumber).toBe('NC1');
        const latam = (r.rawProviderData as any).latam;
        expect(latam.autorizacion.tipo).toBe('CUDE');
        expect(latam.comprobante.factura_ajustada).toMatchObject({ id: 'SETP990000000', concepto: '2' });
        expect(representacionDe(r.rawProviderData)?.titulo).toBe('NOTA CRÉDITO ELECTRÓNICA');

        const sinFactura = await provider.issueDocument(request(await nuevoDocumento({ creditNoteOf: '00000000-0000-4000-9000-999999999999' }), { documentType: 'dian_credit_note' }));
        expect(sinFactura.success).toBe(false);
        expect(sinFactura.error).toMatch(/no fue validada/);
    });

    it('dos facturas a la vez: números distintos y consecutivos; fuera del rango no se envía', async () => {
        const [a, b] = [await nuevoDocumento(), await nuevoDocumento()];
        const [ra, rb] = await Promise.all([provider.issueDocument(request(a)), provider.issueDocument(request(b))]);
        expect(ra.success && rb.success).toBe(true);
        const nums = [(await intentos(a))[0].numero, (await intentos(b))[0].numero].sort();
        expect(nums[1]).toBe(nums[0] + 1);

        await m.db.query("update fiscal_rail_secuencias set ultimo_autorizado = 990000100 where org_id = $1 and serie = 'SETP'", [ORG]);
        const agotada = await provider.issueDocument(request(await nuevoDocumento()));
        expect(agotada.success).toBe(false);
        expect(agotada.error).toMatch(/agotó el rango/);
        expect((await estadoDian(ORG)).numeracion).toMatchObject({ agotada: true, proximoAlFin: true });
        await m.db.query("update fiscal_rail_secuencias set ultimo_autorizado = null where org_id = $1 and serie = 'SETP'", [ORG]);
    });
});

describe('contenedor, set de pruebas e inmutabilidad', () => {
    it('contenedor firmado con el documento y la respuesta de la DIAN; el zip del correo', async () => {
        const c = await contenedorDeDocumento(ORG, facturaValidada);
        expect(c?.nombre).toMatch(/^ad0900373076000\d{2}[0-9A-F]{8}\.xml$/);
        expect(c?.xml).toContain('<AttachedDocument');
        expect(c?.xml).toContain('<![CDATA[<?xml');
        expect(c?.xml).toContain('<cbc:ValidationResultCode>02</cbc:ValidationResultCode>');
        expect(c?.xml).toContain('<ds:SignatureValue');
        const zip = await adjuntoDian(ORG, facturaValidada, { filename: 'f.pdf', content: new Uint8Array([37, 80, 68, 70]) });
        const dentro = unzipSync(zip!.content);
        expect(Object.keys(dentro).sort()).toEqual([c!.nombre, c!.nombre.replace(/\.xml$/, '.pdf')].sort());
        expect(zip!.filename).toMatch(/^z0900373076000\d{2}[0-9A-F]{8}\.zip$/);
        expect(await contenedorDeDocumento(ORG, '00000000-0000-4000-9000-999999999999')).toBeNull();
    });

    it('set de pruebas: SendTestSetAsync con el TestSetId, números reservados y resultado por ZipKey', async () => {
        const ctx = await contextoDian(ORG, 'homologacion', await identidadDeOrg(ORG));
        const envios = await enviarSetDePruebasOrg(ctx, { facturas: 2, notasCredito: 1, notasDebito: 1 }, TEST_SET);
        expect(envios.map((e) => e.clase)).toEqual(['factura', 'factura', 'nota_credito', 'nota_debito']);
        expect(envios.every((e) => e.zipKey && !e.error)).toBe(true);
        expect(llamadas('SendTestSetAsync')).toHaveLength(4);
        expect(llamadas('SendBillSync')).toHaveLength(0);
        const estados = await estadoSetDePruebasOrg(ctx, envios);
        expect(estados.map((e) => e.aceptado)).toEqual([true, true, true, true]);

        // Una factura emitida después no repite los números del set.
        const doc = await nuevoDocumento();
        expect((await provider.issueDocument(request(doc))).success).toBe(true);
        const usados = envios.filter((e) => e.clase === 'factura').map((e) => Number(e.id.slice(4)));
        expect((await intentos(doc))[0].numero).toBeGreaterThan(Math.max(...usados));
    });

    it('lo firmado no se reescribe y la respuesta de la DIAN es definitiva', async () => {
        const [i] = await intentos(facturaValidada);
        await expect(m.db.query("update dian_documentos set xml_firmado = 'x' where intento_id = $1", [i.id])).rejects.toThrow(/no se modifica/);
        await expect(m.db.query("update dian_documentos set respuesta_xml = 'x' where intento_id = $1", [i.id])).rejects.toThrow(/definitiva/);
        await expect(m.db.query('delete from dian_documentos where intento_id = $1', [i.id])).rejects.toThrow(/no se borra/);
    });

    it('aislamiento: una organización no ve los documentos de otra', async () => {
        const contar = (org: string) => m.db.transaction(async (t: any) => {
            await t.query('set local role cord_app');
            await t.query("select set_config('app.org_id', $1, true)", [org]);
            return Number((await t.query('select count(*)::int as n from dian_documentos')).rows[0].n);
        });
        expect(await contar(ORG)).toBeGreaterThan(0);
        expect(await contar(ORG2)).toBe(0);
    });
});
