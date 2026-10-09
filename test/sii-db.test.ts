// Factura electrónica con el SII contra Postgres real (PGlite) con las
// secciones "Rieles fiscales de LatAm" y "Chile: factura electrónica con el
// SII" de db/schema.sql tal cual, y un SII simulado en fetch que habla como el
// real (CrSeed, GetTokenFromSeed, DTEUpload, QueryEstUp, QueryEstDte):
// aceptación, rechazo, validación diferida, respuesta perdida y su
// recuperación por consulta, reenvío del MISMO archivo cuando el SII dice que
// no lo recibió, folios que nunca se reutilizan, nota de crédito, el outbox
// del cron, concurrencia y aislamiento.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import forge from 'node-forge';
import { cafDePrueba, llavesCaf } from '../scripts/fixtures/sii/caf-prueba.mjs';

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
const RUT = '76123456-0';
const RUT_FIRMANTE = '11111111-1';
const RUT_CLIENTE = '77777777-7';

process.env.SII_ENABLED = 'true';
process.env.SII_ENTORNO = 'homologacion';

const { ChileSiiProvider } = await import('../src/lib/fiscal/providers/ChileSiiProvider');
const { parsearCertificado } = await import('../src/lib/fiscal/latam/certificado');
const { guardarCredencial, guardarAjustes, eliminarCredencial } = await import('../src/lib/fiscal/latam/credenciales');
const { estadoSii } = await import('../src/lib/fiscal/latam/sii/estado');
const { parsearCaf } = await import('../src/lib/fiscal/latam/sii/caf');
const { consumirFolio, guardarCaf, listarCafs, quitarCaf } = await import('../src/lib/fiscal/latam/sii/cafs');
const { xmlIntercambio } = await import('../src/lib/fiscal/latam/sii/intercambio');
const { fechaChile } = await import('../src/lib/fiscal/latam/sii/texto');
const { railListo } = await import('../src/lib/fiscal/latam/estado');
const { orgsConPendientes, resolverPendientesDeOrg } = await import('../src/lib/fiscal/latam/resolucion');
const { representacionDe } = await import('../src/lib/fiscal/latam/representacion');
const provider = new ChileSiiProvider({ esperaVeredictoMs: 30 });
const HOY = fechaChile(new Date());

// ── SII simulado ─────────────────────────────────────────────────────────────
type Veredicto = 'ok' | 'reparo' | 'rechazo' | 'esquema' | 'lento';
type Plan = Veredicto | 'perdida' | 'caida' | 'status3';
interface Envio { trackId: string; tipo: string; folio: string; archivo: string; veredicto: Veredicto }
const sii = {
    tokens: 0, tokenValido: '', track: 4000,
    envios: new Map<string, Envio>(),
    porFolio: new Map<string, Envio>(),
    plan: [] as Plan[],
    uploads: [] as string[],
    ops: [] as string[],
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tags = (o: Record<string, string | number>) => Object.entries(o).map(([k, v]) => `<${k}>${v}</${k}>`).join('');
function respuesta(op: string, hdr: Record<string, string | number>, body: Record<string, string | number> = {}): Response {
    const inner = '<?xml version="1.0" encoding="UTF-8"?><SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">'
        + `<SII:RESP_HDR>${tags(hdr)}</SII:RESP_HDR>${Object.keys(body).length ? `<SII:RESP_BODY>${tags(body)}</SII:RESP_BODY>` : ''}</SII:RESPUESTA>`;
    return new Response('<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Body>'
        + `<ns1:${op}Response soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:ns1="http://DefaultNamespace"><ns1:${op}Return xsi:type="xsd:string">${esc(inner)}</ns1:${op}Return></ns1:${op}Response>`
        + '</soapenv:Body></soapenv:Envelope>');
}
const param = (body: string, k: string) => new RegExp(`<${k} xsi:type="xsd:string">([^<]*)</${k}>`).exec(body)?.[1] ?? '';
const recepcion = (status: number, trackId?: string) => new Response(`<?xml version="1.0"?>\n<RECEPCIONDTE>\n<RUTSENDER>${RUT_FIRMANTE}</RUTSENDER>\n<RUTCOMPANY>${RUT}</RUTCOMPANY>\n`
    + `<FILE>envio.xml</FILE>\n<TIMESTAMP>2026-10-09 12:00:00</TIMESTAMP>\n<STATUS>${status}</STATUS>\n${trackId ? `<TRACKID>${trackId}</TRACKID>\n` : ''}</RECEPCIONDTE>\n`);

function upload(init: RequestInit): Response {
    const token = /TOKEN=([^;\s]+)/.exec(String((init.headers as Record<string, string>).Cookie ?? ''))?.[1];
    const cuerpo = Buffer.from(init.body as Uint8Array).toString('latin1');
    const archivo = cuerpo.slice(cuerpo.indexOf('<?xml'), cuerpo.lastIndexOf('</EnvioDTE>') + '</EnvioDTE>'.length);
    sii.uploads.push(archivo);
    if (token !== sii.tokenValido) return recepcion(5);
    const plan = sii.plan.shift() ?? 'ok';
    if (plan === 'caida') throw new TypeError('fetch failed');
    if (plan === 'status3') return recepcion(3);
    const trackId = String(++sii.track);
    const e: Envio = { trackId, tipo: /<TipoDTE>(\d+)</.exec(archivo)![1], folio: /<Folio>(\d+)</.exec(archivo)![1], archivo, veredicto: plan === 'perdida' ? 'ok' : plan };
    sii.envios.set(trackId, e);
    sii.porFolio.set(`${e.tipo}:${e.folio}`, e);
    if (plan === 'perdida') throw new TypeError('socket hang up');
    return recepcion(0, trackId);
}

function estadoEnvio(body: string): Response {
    if (param(body, 'Token') !== sii.tokenValido) return respuesta('getEstUp', { ESTADO: '001', GLOSA: 'TOKEN NO EXISTE' });
    const e = sii.envios.get(param(body, 'TrackId'));
    if (!e) return respuesta('getEstUp', { ESTADO: '-11', GLOSA: 'ERROR' });
    const hdr = { TRACKID: e.trackId, ESTADO: 'EPR', GLOSA: 'Envio Procesado', NUM_ATENCION: '1' };
    const cuenta = (a: number, r: number, rep: number) => ({ TIPO_DOCTO: e.tipo, INFORMADOS: 1, ACEPTADOS: a, RECHAZADOS: r, REPAROS: rep });
    switch (e.veredicto) {
        case 'ok': return respuesta('getEstUp', hdr, cuenta(1, 0, 0));
        case 'reparo': return respuesta('getEstUp', hdr, cuenta(0, 0, 1));
        case 'rechazo': return respuesta('getEstUp', hdr, cuenta(0, 1, 0));
        case 'esquema': return respuesta('getEstUp', { TRACKID: e.trackId, ESTADO: 'RSC', GLOSA: 'Rechazado por Error en Schema' });
        default: return respuesta('getEstUp', { TRACKID: e.trackId, ESTADO: 'SOK', GLOSA: 'Schema Validado' });
    }
}

function estadoDte(body: string): Response {
    if (param(body, 'Token') !== sii.tokenValido) return respuesta('getEstDte', { ESTADO: '001', GLOSA: 'TOKEN NO EXISTE' });
    const e = sii.porFolio.get(`${param(body, 'TipoDte')}:${param(body, 'FolioDte')}`);
    if (!e || e.veredicto === 'lento') return respuesta('getEstDte', { ESTADO: 'FAU', GLOSA: 'DOCUMENTO NO RECIBIDO POR EL SII' });
    if (e.veredicto === 'rechazo' || e.veredicto === 'esquema') return respuesta('getEstDte', { ESTADO: 'FAN', GLOSA: 'DOCUMENTO ANULADO' });
    return respuesta('getEstDte', { ESTADO: 'DOK', GLOSA: 'DOCUMENTO RECIBIDO POR EL SII. DATOS COINCIDEN' });
}

async function fakeFetch(url: string, init: RequestInit): Promise<Response> {
    const u = String(url);
    const body = typeof init.body === 'string' ? init.body : '';
    const op = u.includes('CrSeed') ? 'getSeed' : u.includes('GetTokenFromSeed') ? 'getToken' : u.includes('QueryEstUp') ? 'getEstUp'
        : u.includes('QueryEstDte') ? 'getEstDte' : u.includes('DTEUpload') ? 'upload' : '';
    sii.ops.push(op);
    expect(u).toMatch(/^https:\/\/maullin\.sii\.cl\//);
    switch (op) {
        case 'getSeed': return respuesta('getSeed', { ESTADO: '00' }, { SEMILLA: '012345678901' });
        case 'getToken': {
            expect(body).toContain('&lt;Semilla&gt;012345678901&lt;/Semilla&gt;');
            sii.tokenValido = `TOK${++sii.tokens}`;
            return respuesta('getToken', { ESTADO: '00', GLOSA: 'Token Creado' }, { TOKEN: sii.tokenValido });
        }
        case 'upload': return upload(init);
        case 'getEstUp': return estadoEnvio(body);
        case 'getEstDte': return estadoDte(body);
        default: throw new Error(`servicio no simulado: ${u}`);
    }
}
const cuantas = (op: string) => sii.ops.filter((o) => o === op).length;

// ── Base ─────────────────────────────────────────────────────────────────────
function seccion(desde: string, hasta: string): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf(desde);
    const fin = schema.indexOf(hasta, inicio);
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
    cert.setSubject([{ name: 'commonName', value: 'FIRMANTE DE PRUEBA' }]);
    cert.setIssuer([{ name: 'commonName', value: 'CA DE PRUEBA' }]);
    cert.sign(key, forge.md.sha256.create());
    return { certPem: forge.pki.certificateToPem(cert), keyPem };
}

const llaves = llavesCaf();
async function subirCaf(org: string, tipo: number, desde: number, hasta: number) {
    const { xml } = cafDePrueba({ rut: RUT, tipo, desde, hasta, fecha: HOY, llaves });
    return guardarCaf(org, 'homologacion', parsearCaf(xml, RUT), xml, { nombreArchivo: `caf-${tipo}.xml` });
}

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create role cord_app;
        create table orgs(id uuid primary key, country_code text, rfc text, fiscal_metadata jsonb, razon_social text, nombre text, direccion text);
        create table clientes(id uuid primary key, org_id uuid not null references orgs(id) on delete cascade);
        create table documentos_fiscales(
            id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, cliente_id uuid,
            credit_note_of uuid, service_date date, service_date_end date, due_date date, notes text, status text not null default 'error',
            provider_document_id text, provider_data jsonb, updated_at timestamptz);
        insert into orgs values
            ('${ORG}', 'CL', null, '{"tax_id":"76.123.456-0","legal_name":"Empresa de Prueba SpA"}', null, 'Prueba', 'Av. Providencia 1234'),
            ('${ORG2}', 'CL', null, '{}', null, null, null);
        grant select, insert, update, delete on all tables in schema public to cord_app;`);
    await m.db.exec(seccion('-- ── Rieles fiscales de LatAm', '-- END rieles-latam'));
    await m.db.exec(seccion('-- ── Chile: factura electrónica con el SII', '-- END sii'));
    const { certPem, keyPem } = certificadoDePrueba();
    await guardarCredencial(ORG, 'sii', 'homologacion', parsearCertificado({ certificado: certPem, llave: keyPem }), { identificador: RUT_FIRMANTE, nombreArchivo: 'firmante.pfx', subidoPor: null });
    await guardarAjustes(ORG, 'sii', {
        giro: 'Servicios de consultoría informática', acteco: [620200], comuna: 'Providencia', ciudad: 'Santiago',
        unidadSii: 'PROVIDENCIA', resoluciones: { homologacion: { numero: 0, fecha: '2026-10-01' } },
    });
    await subirCaf(ORG, 33, 1, 40);
    await subirCaf(ORG, 34, 1, 3);
    await subirCaf(ORG, 61, 1, 10);
}, 60_000);

afterAll(async () => {
    vi.unstubAllGlobals();
    await m.db?.close();
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    sii.plan = [];
    sii.ops = [];
    m.finalize.mockReset();
});

let seq = 0;
async function nuevoDocumento(opts: { creditNoteOf?: string; org?: string; giro?: string | null; comuna?: string | null } = {}) {
    const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
    const cliente = `00000000-0000-4000-a000-${String(seq).padStart(12, '0')}`;
    await m.db.query('insert into clientes (id, org_id, giro, comuna) values ($1, $2, $3, $4)',
        [cliente, opts.org ?? ORG, opts.giro === undefined ? 'Comercio al por menor' : opts.giro, opts.comuna === undefined ? 'La Florida' : opts.comuna]);
    await m.db.query('insert into documentos_fiscales (id, org_id, cliente_id, credit_note_of) values ($1, $2, $3, $4)', [id, opts.org ?? ORG, cliente, opts.creditNoteOf ?? null]);
    return id;
}

const lineaIva = (neto: number) => ({ description: 'Servicio de consultoría', quantity: 1, unitPrice: neto, taxRate: 0.19, subtotal: neto, taxAmount: Math.round(neto * 0.19), total: neto + Math.round(neto * 0.19) });
function request(documentId: string, over: Record<string, unknown> = {}) {
    const neto = (over.neto as number) ?? 100_000;
    const iva = Math.round(neto * 0.19);
    return {
        documentId, invoiceNumber: `FA-${seq}`, idempotencyKey: `k-${documentId}`, orgId: ORG, quoteId: documentId,
        countryCode: 'CL', documentType: 'sii_invoice',
        issuer: { legalName: 'Empresa de Prueba SpA', taxId: '76.123.456-0', address: { line1: 'Av. Providencia 1234', city: 'Santiago', countryCode: 'CL' } },
        recipient: { legalName: 'Cliente Ltda.', taxId: '77.777.777-7', address: { line1: 'San Diego 2222', city: 'Santiago', countryCode: 'CL' } },
        lines: [lineaIva(neto)], totals: { subtotal: neto, taxes: iva, total: neto + iva, currency: 'CLP' },
        issuedAt: new Date().toISOString(), ...over,
    } as any;
}

const intentos = async (doc: string) => (await m.db.query(
    'select id, estado, tipo, numero, autorizacion, observaciones, error_codigo, error_mensaje, respuesta from fiscal_rail_comprobantes where documento_id = $1 order by created_at, numero', [doc])).rows;
const siguiente = async (tipo: number) => {
    const [{ s }] = (await m.db.query(
        'select min(folio_siguiente) as s from fiscal_sii_cafs where org_id = $1 and tipo_dte = $2 and folio_siguiente <= folio_hasta', [ORG, tipo])).rows;
    return s === null ? Infinity : Number(s);
};
const envejecer = (estado: string, intervalo: string) => m.db.exec(`alter table fiscal_rail_comprobantes disable trigger trg_fiscal_rail_comprobante_inmutable;
    update fiscal_rail_comprobantes set created_at = now() - interval '${intervalo}', enviado_at = now() - interval '${intervalo}' where rail = 'sii' and estado = '${estado}';
    alter table fiscal_rail_comprobantes enable trigger trg_fiscal_rail_comprobante_inmutable;`);

// ── Pruebas ──────────────────────────────────────────────────────────────────
describe('estado del riel', () => {
    it('dice qué falta en vocabulario de códigos y solo está listo con todo', async () => {
        expect((await estadoSii(ORG2)).faltantes).toEqual(['rut', 'razon_social', 'direccion', 'giro', 'acteco', 'comuna', 'unidad_sii', 'resolucion', 'certificado', 'folios']);
        expect(await railListo(ORG2, 'sii')).toBe(false);
        const e = await estadoSii(ORG);
        expect(e).toMatchObject({ habilitado: true, entorno: 'homologacion', rut: RUT, faltantes: [], listo: true });
        expect(e.credencial?.identificador).toBe(RUT_FIRMANTE);
        expect(e.folios.find((f) => f.tipo === 33)).toMatchObject({ disponibles: 40, porAgotarse: false });
        expect(JSON.stringify(e)).not.toMatch(/BEGIN|PRIVATE|RSASK|caf_enc/);
    });

    it('con el riel apagado nada está listo y un documento sii_* no degrada en silencio', async () => {
        process.env.SII_ENABLED = 'false';
        try {
            expect(await railListo(ORG, 'sii')).toBe(false);
            const doc = await nuevoDocumento();
            await expect(provider.issueDocument(request(doc))).rejects.toThrow(/no está activa/);
            const comercial = await provider.issueDocument(request(doc, { documentType: 'commercial_invoice' }));
            expect(comercial.rawProviderData?.regulatory_status).toBe('commercial_only');
            expect(sii.ops).toHaveLength(0);
        } finally {
            process.env.SII_ENABLED = 'true';
        }
    });
});

describe('emisión', () => {
    it('factura 33 aceptada: folio del CAF, timbre, número legal y replay sin reenviar', async () => {
        const doc = await nuevoDocumento();
        const folio = await siguiente(33);
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(r.provider).toBe('sii');
        expect(r.fiscalId).toBe(`${RUT}/T33/F${folio}`);
        expect(r.invoiceNumber).toBe(`C-FE-${folio}`);
        expect(r.rawProviderData).toMatchObject({ regulatory_status: 'sii', livemode: false, simulado: true });
        expect(await siguiente(33)).toBe(folio + 1);

        const archivo = sii.uploads.at(-1)!;
        expect(archivo.split('\n')[0]).toBe('<?xml version="1.0" encoding="ISO-8859-1"?>');
        expect(archivo).toContain(`<RutEnvia>${RUT_FIRMANTE}</RutEnvia>`);
        expect(archivo).toContain('<RutReceptor>60803000-K</RutReceptor>');
        expect(archivo).toContain('<GiroRecep>Comercio al por menor</GiroRecep>');
        expect(archivo).toContain('<CmnaRecep>La Florida</CmnaRecep>');
        expect(archivo).toContain('<MntNeto>100000</MntNeto>');
        expect(archivo).toContain('<IVA>19000</IVA>');

        const rep = representacionDe(r.rawProviderData)!;
        expect(rep.titulo).toBe('FACTURA ELECTRÓNICA');
        expect(rep.recuadro?.lineas).toEqual(['R.U.T.: 76.123.456-0', 'FACTURA ELECTRÓNICA', `N° ${folio}`]);
        expect(rep.recuadro?.pie).toBe('S.I.I. - PROVIDENCIA');
        expect(rep.timbre?.leyendas.join(' ')).toMatch(/Timbre Electrónico SII.*Res\. 0 de 2026/);
        expect(rep.timbre?.filas.length).toBeGreaterThanOrEqual(3);
        expect(rep.cedible?.leyenda).toBe('CEDIBLE');
        expect(rep.prueba).toBe(true);

        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'autorizado', tipo: '33', numero: folio, autorizacion: String(sii.track) });

        const uploads = cuantas('upload');
        const replay = await provider.issueDocument(request(doc));
        expect(replay.fiscalId).toBe(r.fiscalId);
        expect(cuantas('upload')).toBe(uploads);
    });

    it('el token se reutiliza y, si el SII lo desconoce (STATUS 5), se renueva y se sube el MISMO archivo', async () => {
        await provider.issueDocument(request(await nuevoDocumento()));
        expect(cuantas('getToken')).toBe(0);

        sii.tokenValido = 'revocado';
        const doc = await nuevoDocumento();
        const uploads = cuantas('upload');
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(cuantas('getToken')).toBe(1);
        expect(cuantas('upload')).toBe(uploads + 2);
        expect(sii.uploads.at(-1)).toBe(sii.uploads.at(-2));
        const [{ token_enc }] = (await m.db.query("select token_enc from fiscal_rail_accesos where rail = 'sii'")).rows;
        expect(token_enc).toMatch(/^enc:/);
    });

    it('factura exenta (34) cuando todos los conceptos son exentos', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc, {
            lines: [{ description: 'Curso de capacitación', quantity: 2, unitPrice: 30_000, taxRate: 0, subtotal: 60_000, taxAmount: 0, total: 60_000 }],
            totals: { subtotal: 60_000, taxes: 0, total: 60_000, currency: 'CLP' },
        }));
        expect(r.success).toBe(true);
        expect(r.invoiceNumber).toMatch(/^C-FX-\d+$/);
        expect(sii.uploads.at(-1)).toContain('<MntExe>60000</MntExe>');
        expect(representacionDe(r.rawProviderData)?.titulo).toBe('FACTURA NO AFECTA O EXENTA ELECTRÓNICA');
    });

    it('aceptada con reparos: se emite y el reparo queda a la vista', async () => {
        sii.plan = ['reparo'];
        const r = await provider.issueDocument(request(await nuevoDocumento()));
        expect(r.success).toBe(true);
        expect((r.rawProviderData as any).latam.observaciones[0].mensaje).toMatch(/reparos/);
    });
});

describe('lo que se rechaza ANTES de enviar no consume folio', () => {
    it('retención de honorarios, IVA que no es el 19 % del neto y cliente sin giro', async () => {
        const folio = await siguiente(33);
        const ret = await provider.issueDocument(request(await nuevoDocumento(), {
            totals: { subtotal: 100_000, taxes: 19_000, total: 103_750, currency: 'CLP', retencionTotal: 15_250, retenciones: [{ monto: 15_250 }] },
        }));
        expect(ret.success).toBe(false);
        expect(ret.error).toMatch(/boleta de honorarios/);
        const iva = await provider.issueDocument(request(await nuevoDocumento(), {
            lines: [lineaIva(1003), lineaIva(1003)].map((l) => ({ ...l, taxAmount: 191, total: 1194 })),
            totals: { subtotal: 2006, taxes: 382, total: 2388, currency: 'CLP' },
        }));
        expect(iva.error).toMatch(/19 %/);
        const sinGiro = await provider.issueDocument(request(await nuevoDocumento({ giro: null })));
        expect(sinGiro.error).toMatch(/giro/i);
        const usd = await provider.issueDocument(request(await nuevoDocumento(), { totals: { subtotal: 100, taxes: 19, total: 119, currency: 'USD' } }));
        expect(usd.error).toMatch(/pesos chilenos/);
        expect(sii.ops).not.toContain('upload');
        expect(await siguiente(33)).toBe(folio);
    });
});

describe('veredicto del SII', () => {
    it('rechazo: mensaje para el usuario, documento libre y el folio NO se reutiliza', async () => {
        const doc = await nuevoDocumento();
        const folio = await siguiente(33);
        sii.plan = ['rechazo'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(`err_cl_${doc}`);
        expect(r.error).toMatch(/rechazó/);
        expect((await intentos(doc))[0]).toMatchObject({ estado: 'rechazado', numero: folio, error_codigo: 'EPR' });

        // El mismo documento se reemite con un folio NUEVO.
        const again = await provider.issueDocument(request(doc));
        expect(again.success).toBe(true);
        expect(again.fiscalId).toBe(`${RUT}/T33/F${folio + 1}`);
    });

    it('rechazo por esquema (RSC): mensaje traducido, sin la glosa cruda', async () => {
        sii.plan = ['esquema'];
        const r = await provider.issueDocument(request(await nuevoDocumento()));
        expect(r.success).toBe(false);
        expect(r.error).not.toMatch(/Schema|RSC/);
    });

    it('en validación: delivery_uncertain con su trackid; el reintento CONSULTA y termina sin reenviar', async () => {
        const doc = await nuevoDocumento();
        sii.plan = ['lento'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(doc);
        expect(r.rawProviderData).toMatchObject({ delivery_uncertain: true, retry_safe: true, latam: { track_id: String(sii.track) } });
        expect(r.error).toMatch(new RegExp(`envío N° ${sii.track}`));
        expect((await intentos(doc))[0].estado).toBe('pendiente');

        const uploads = cuantas('upload');
        const todavia = await provider.issueDocument(request(doc));
        expect(todavia.rawProviderData?.delivery_uncertain).toBe(true);
        sii.envios.get(String(sii.track))!.veredicto = 'ok';
        const fin = await provider.issueDocument(request(doc));
        expect(fin.success).toBe(true);
        expect(cuantas('upload')).toBe(uploads);
    });
});

describe('respuestas perdidas: se consulta, nunca se reenvía a ciegas', () => {
    it('el SII lo recibió pero la respuesta se perdió: el reintento lo recupera con QueryEstDte', async () => {
        const doc = await nuevoDocumento();
        sii.plan = ['perdida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.rawProviderData).toMatchObject({ delivery_uncertain: true, retry_safe: true });
        expect((await intentos(doc))[0].estado).toBe('incierto');
        const uploads = cuantas('upload');
        const again = await provider.issueDocument(request(doc));
        expect(again.success).toBe(true);
        expect(cuantas('upload')).toBe(uploads);
        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'autorizado', autorizacion: 'SII-DOK' });
        expect(i.respuesta.recuperado).toBe(true);
    });

    it('STATUS 3 (archivo cortado): el reintento sube el MISMO archivo, no uno nuevo', async () => {
        const doc = await nuevoDocumento();
        sii.plan = ['status3'];
        const r = await provider.issueDocument(request(doc));
        expect(r.rawProviderData?.delivery_uncertain).toBe(true);
        const primero = sii.uploads.at(-1);
        const again = await provider.issueDocument(request(doc));
        expect(again.success).toBe(true);
        expect(sii.uploads.at(-1)).toBe(primero);
    });

    it('sin respuesta y sin registro: incierto; el cron lo descarta pasado el plazo y libera el documento', async () => {
        const doc = await nuevoDocumento();
        const folio = await siguiente(33);
        sii.plan = ['caida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.rawProviderData).toMatchObject({ delivery_uncertain: true, retry_safe: true });
        expect((await intentos(doc))[0]).toMatchObject({ estado: 'incierto', numero: folio });

        // Reciente: el SII todavía podría registrarlo, así que no se descarta.
        const again = await provider.issueDocument(request(doc));
        expect(again.rawProviderData?.delivery_uncertain).toBe(true);

        await envejecer('incierto', '3 hours');
        await m.db.query("update documentos_fiscales set provider_document_id = id::text, provider_data = '{\"delivery_uncertain\":true,\"retry_safe\":true}' where id = $1", [doc]);
        expect(await orgsConPendientes('sii')).toEqual([ORG]);
        const res = await resolverPendientesDeOrg(ORG, 'sii');
        expect(res).toMatchObject({ revisados: 1, descartados: 1, autorizados: 0 });
        const [d] = (await m.db.query('select provider_document_id, provider_data from documentos_fiscales where id = $1', [doc])).rows;
        expect(d.provider_document_id).toBe(`err_sii_${doc}`);
        expect(d.provider_data.error).toMatch(/folio nuevo/);
        expect(m.finalize).not.toHaveBeenCalled();

        // Reemitido, toma otro folio: el del intento descartado no vuelve.
        const nuevo = await provider.issueDocument(request(doc));
        expect(nuevo.success).toBe(true);
        expect(Number(nuevo.fiscalId!.split('/F')[1])).toBeGreaterThan(folio);
    });

    it('el cron termina de emitir lo que el SII aceptó después', async () => {
        const doc = await nuevoDocumento();
        sii.plan = ['lento'];
        await provider.issueDocument(request(doc));
        sii.envios.get(String(sii.track))!.veredicto = 'ok';
        await envejecer('pendiente', '10 minutes');
        const res = await resolverPendientesDeOrg(ORG, 'sii');
        expect(res).toMatchObject({ autorizados: 1 });
        expect(m.finalize).toHaveBeenCalledWith(ORG, doc);
        expect(await orgsConPendientes('sii')).toEqual([]);
    });
});

describe('nota de crédito (61)', () => {
    it('referencia la factura (CodRef 3) con su mismo receptor y folio del CAF 61', async () => {
        const factura = await nuevoDocumento();
        const f = await provider.issueDocument(request(factura));
        const folioFactura = Number(f.fiscalId!.split('/F')[1]);
        const nc = await nuevoDocumento({ creditNoteOf: factura, giro: 'Otro giro' });
        const r = await provider.issueDocument(request(nc, { documentType: 'sii_credit_note', neto: 10_000 }));
        expect(r.success).toBe(true);
        expect(r.invoiceNumber).toMatch(/^C-NC-\d+$/);
        const archivo = sii.uploads.at(-1)!;
        expect(archivo).toContain('<TipoDTE>61</TipoDTE>');
        expect(archivo).toMatch(new RegExp(`<TpoDocRef>33</TpoDocRef>\\n<FolioRef>${folioFactura}</FolioRef>`));
        expect(archivo).toContain('<CodRef>3</CodRef>');
        expect(archivo).toContain('<GiroRecep>Comercio al por menor</GiroRecep>');
        const rep = representacionDe(r.rawProviderData)!;
        expect(rep.titulo).toBe('NOTA DE CRÉDITO ELECTRÓNICA');
        expect(rep.cedible).toBeUndefined();
    });

    it('sin la factura aceptada por el SII no se emite', async () => {
        const nc = await nuevoDocumento({ creditNoteOf: await nuevoDocumento() });
        const r = await provider.issueDocument(request(nc, { documentType: 'sii_credit_note', neto: 1000 }));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/no fue aceptada por el SII/);
    });

    it('un DTE aceptado no se anula ante el SII', async () => {
        const r = await provider.cancelDocument('x');
        expect(r).toMatchObject({ success: false, status: 'rejected' });
        expect(r.error).toMatch(/nota de crédito/);
    });
});

describe('XML para el cliente', () => {
    it('sobre de intercambio dirigido al cliente con el DTE tal como lo aceptó el SII; sin certificado, el DTE solo', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        const pd = r.rawProviderData;
        const [i] = await intentos(doc);
        const dte = (await m.db.query('select solicitud from fiscal_rail_comprobantes where id = $1', [i.id])).rows[0].solicitud.dte as string;
        const xml = (await xmlIntercambio(ORG, { id: doc, provider_data: pd }))!.toString('latin1');
        expect(xml).toContain(`<RutReceptor>${RUT_CLIENTE}</RutReceptor>`);
        expect(xml).toContain(dte.slice(dte.indexOf('<DTE'), dte.lastIndexOf('</DTE>') + 6));
        expect(await xmlIntercambio(ORG, { id: await nuevoDocumento() })).toBeNull();
    });
});

describe('folios', () => {
    it('concurrentes toman folios consecutivos y distintos; el mismo documento dos veces sube una sola vez', async () => {
        const docs = await Promise.all([nuevoDocumento(), nuevoDocumento(), nuevoDocumento()]);
        const antes = await siguiente(33);
        const rs = await Promise.all(docs.map((d) => provider.issueDocument(request(d))));
        expect(rs.every((r) => r.success)).toBe(true);
        const folios = rs.map((r) => Number(r.fiscalId!.split('/F')[1])).sort((a, b) => a - b);
        expect(folios).toEqual([antes, antes + 1, antes + 2]);

        const doc = await nuevoDocumento();
        const uploads = cuantas('upload');
        const [a, b] = await Promise.all([provider.issueDocument(request(doc)), provider.issueDocument(request(doc))]);
        expect(a.fiscalId).toBe(b.fiscalId);
        expect(cuantas('upload')).toBe(uploads + 1);
    }, 30_000);

    it('la base impide reutilizar, solapar o borrar folios usados', async () => {
        const [caf33] = (await m.db.query('select id, folio_siguiente from fiscal_sii_cafs where org_id = $1 and tipo_dte = 33', [ORG])).rows;
        await expect(m.db.query('update fiscal_sii_cafs set folio_siguiente = folio_siguiente - 1 where id = $1', [caf33.id])).rejects.toThrow(/no se reutiliza/);
        await expect(m.db.query('delete from fiscal_sii_cafs where id = $1', [caf33.id])).rejects.toThrow(/no se borra/);
        await expect(m.db.query("update fiscal_sii_cafs set folio_hasta = 99 where id = $1", [caf33.id])).rejects.toThrow(/identidad/);
        expect(await quitarCaf(ORG, 'homologacion', caf33.id)).toBe(false);
        await expect(subirCaf(ORG, 33, 30, 60)).rejects.toThrow(/se cruzan/);
        const nuevo = await subirCaf(ORG, 61, 11, 20);
        expect(await quitarCaf(ORG, 'homologacion', nuevo)).toBe(true);
        expect((await listarCafs(ORG, 'homologacion', HOY)).map((c) => `${c.tipo}:${c.desde}`)).toEqual(['33:1', '34:1', '61:1']);
        await expect(Promise.resolve().then(() => parsearCaf(cafDePrueba({ rut: '96543210-8', tipo: 33 }).xml, RUT))).rejects.toThrow(/RUT/);
    });

    it('sin folios vigentes se dice antes de emitir', async () => {
        while ((await siguiente(34)) <= 3) await consumirFolio(ORG, 'homologacion', 34, HOY, RUT);
        await expect(consumirFolio(ORG, 'homologacion', 34, HOY, RUT)).rejects.toThrow(/No te quedan folios/);
        const r = await provider.issueDocument(request(await nuevoDocumento(), {
            lines: [{ description: 'Exento', quantity: 1, unitPrice: 1000, taxRate: 0, subtotal: 1000, taxAmount: 0, total: 1000 }],
            totals: { subtotal: 1000, taxes: 0, total: 1000, currency: 'CLP' },
        }));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/No te quedan folios/);
    });
});

describe('aislamiento (RLS con el rol de aplicación)', () => {
    it('una organización no ve los CAF ni los comprobantes de otra', async () => {
        const contar = (org: string, tabla: string) => m.db.transaction(async (t: any) => {
            await t.query('set local role cord_app');
            await t.query("select set_config('app.org_id', $1, true)", [org]);
            return Number((await t.query(`select count(*)::int as n from ${tabla}`)).rows[0].n);
        });
        for (const tabla of ['fiscal_sii_cafs', 'fiscal_rail_comprobantes', 'fiscal_rail_credenciales']) {
            expect(await contar(ORG, tabla), tabla).toBeGreaterThan(0);
            expect(await contar(ORG2, tabla), tabla).toBe(0);
        }
    });

    it('sin el certificado, el XML del cliente es el DTE firmado tal cual', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        await eliminarCredencial(ORG, 'sii', 'homologacion');
        const xml = (await xmlIntercambio(ORG, { id: doc, provider_data: r.rawProviderData }))!.toString('latin1');
        expect(xml.split('\n')[1]).toBe('<DTE version="1.0">');
        expect(xml).not.toContain('<EnvioDTE');
    });
});
