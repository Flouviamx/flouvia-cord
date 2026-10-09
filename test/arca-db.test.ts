// Factura electrónica con ARCA contra Postgres real (PGlite) con la sección
// "Rieles fiscales de LatAm" de db/schema.sql tal cual, y un ARCA simulado en
// fetch que habla SOAP como el real (WSAA + WSFEv1): autorización, rechazo con
// observaciones, respuesta perdida y su recuperación por consulta, caché y
// renovación del ticket, nota de crédito con comprobante asociado,
// numeración concurrente, idempotencia, inmutabilidad y el outbox del cron.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import forge from 'node-forge';

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

const ORG = '00000000-0000-4000-8000-0000000000b1';
const ORG2 = '00000000-0000-4000-8000-0000000000b2';
const CUIT = '30712345671';
const CUIT_RI = '20111111112';
const NS = 'http://ar.gov.afip.dif.FEV1/';

process.env.ARCA_ENABLED = 'true';
process.env.ARCA_ENTORNO = 'homologacion';

const { ArgentinaArcaProvider } = await import('../src/lib/fiscal/providers/ArgentinaArcaProvider');
const { parsearCertificado } = await import('../src/lib/fiscal/latam/certificado');
const { guardarCredencial, guardarAjustes } = await import('../src/lib/fiscal/latam/credenciales');
const { estadoArca } = await import('../src/lib/fiscal/latam/arca/estado');
const { railListo } = await import('../src/lib/fiscal/latam/estado');
const { orgsConPendientes, resolverPendientesDeOrg } = await import('../src/lib/fiscal/latam/resolucion');
const { representacionDe } = await import('../src/lib/fiscal/latam/representacion');
const provider = new ArgentinaArcaProvider();

// ── ARCA simulado ────────────────────────────────────────────────────────────
type Comportamiento = 'ok' | 'obs' | 'rechazo' | 'perdida' | 'caida' | 'error500';
interface Emitido { cae: string; vto: string; docTipo: string; docNro: string; fch: string; total: string; monId: string; cotiz: string; asoc: string }
const arca = {
    logins: 0, tokenSeq: 0, caeSeq: 0, tokenValido: '',
    ultimo: new Map<string, number>(),
    emitidos: new Map<string, Emitido>(),
    plan: [] as Comportamiento[],
    llamadas: [] as { op: string; body: string }[],
};
const tag = (xml: string, name: string) => new RegExp(`<ar:${name}>([^<]*)</ar:${name}>`).exec(xml)?.[1] ?? '';
const soap = (op: string, inner: string) => '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
    + `<soap:Header><FEHeaderInfo xmlns="${NS}"><ambiente>HomologacionExterno - srt</ambiente></FEHeaderInfo></soap:Header>`
    + `<soap:Body><${op}Response xmlns="${NS}"><${op}Result>${inner}</${op}Result></${op}Response></soap:Body></soap:Envelope>`;
const errores = (code: number, msg: string) => `<Errors><Err><Code>${code}</Code><Msg>${msg}</Msg></Err></Errors>`;
const masDias = (aaaammdd: string, dias: number) => {
    const d = new Date(`${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
};

function loginWsaa(): Response {
    arca.logins++;
    const token = Buffer.from(`<sso><operation><login><relations><relation key="${CUIT}" reltype="4"/></relations></login></operation></sso><!--${++arca.tokenSeq}-->`).toString('base64');
    arca.tokenValido = token;
    const ta = '<?xml version="1.0" encoding="UTF-8"?><loginTicketResponse version="1.0"><header>'
        + `<generationTime>${new Date(Date.now() - 60_000).toISOString()}</generationTime>`
        + `<expirationTime>${new Date(Date.now() + 12 * 3600_000).toISOString()}</expirationTime></header>`
        + `<credentials><token>${token}</token><sign>firma-${arca.tokenSeq}</sign></credentials></loginTicketResponse>`;
    const escapado = ta.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return new Response('<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>'
        + `<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escapado}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`);
}

function caeSolicitar(body: string): Response {
    const pto = Number(tag(body, 'PtoVta'));
    const tipo = Number(tag(body, 'CbteTipo'));
    const nro = Number(tag(body, 'CbteDesde'));
    const fch = tag(body, 'CbteFch');
    const clave = `${pto}:${tipo}`;
    const comportamiento = arca.plan.shift() ?? 'ok';
    if (comportamiento === 'caida') throw new TypeError('fetch failed');
    if (comportamiento === 'error500') return new Response(soap('FECAESolicitar', errores(500, 'Error interno de aplicación')));
    const cab = `<FeCabResp><Cuit>${CUIT}</Cuit><PtoVta>${pto}</PtoVta><CbteTipo>${tipo}</CbteTipo><FchProceso>20261008120000</FchProceso><CantReg>1</CantReg>`;
    const det = (resultado: string, obs: string, cae = '', vto = '') => `<FeDetResp><FECAEDetResponse><Concepto>${tag(body, 'Concepto')}</Concepto><DocTipo>${tag(body, 'DocTipo')}</DocTipo>`
        + `<DocNro>${tag(body, 'DocNro')}</DocNro><CbteDesde>${nro}</CbteDesde><CbteHasta>${nro}</CbteHasta><CbteFch>${fch}</CbteFch><Resultado>${resultado}</Resultado>`
        + `${obs}<CAE>${cae}</CAE><CAEFchVto>${vto}</CAEFchVto></FECAEDetResponse></FeDetResp>`;
    const ultimo = arca.ultimo.get(clave) ?? 0;
    if (nro !== ultimo + 1) {
        return new Response(soap('FECAESolicitar', `${cab}<Resultado>R</Resultado><Reproceso>N</Reproceso></FeCabResp>`
            + det('R', '<Observaciones><Obs><Code>10016</Code><Msg>El numero o fecha del comprobante no se corresponde con el proximo a autorizar.</Msg></Obs></Observaciones>')));
    }
    if (comportamiento === 'rechazo') {
        return new Response(soap('FECAESolicitar', `${cab}<Resultado>R</Resultado><Reproceso>N</Reproceso></FeCabResp>`
            + det('R', '<Observaciones><Obs><Code>10015</Code><Msg>Factura B (CbteDesde igual a CbteHasta), DocTipo: 80 DocNro 0 no es valido.</Msg></Obs></Observaciones>')));
    }
    const cae = String(70_000_000_000_000 + ++arca.caeSeq);
    const vto = masDias(fch, 10);
    arca.ultimo.set(clave, nro);
    arca.emitidos.set(`${clave}:${nro}`, {
        cae, vto, docTipo: tag(body, 'DocTipo'), docNro: tag(body, 'DocNro'), fch, total: tag(body, 'ImpTotal'),
        monId: tag(body, 'MonId'), cotiz: tag(body, 'MonCotiz'), asoc: /<ar:CbtesAsoc>[\s\S]*<\/ar:CbtesAsoc>/.exec(body)?.[0] ?? '',
    });
    if (comportamiento === 'perdida') throw new TypeError('socket hang up');
    const obs = comportamiento === 'obs'
        ? '<Observaciones><Obs><Code>10217</Code><Msg>El credito fiscal discriminado en el presente comprobante solo podra ser computado...</Msg></Obs></Observaciones>' : '';
    return new Response(soap('FECAESolicitar', `${cab}<Resultado>A</Resultado><Reproceso>N</Reproceso></FeCabResp>${det('A', obs, cae, vto)}`));
}

function compConsultar(body: string): Response {
    const pto = tag(body, 'PtoVta');
    const tipo = tag(body, 'CbteTipo');
    const nro = tag(body, 'CbteNro');
    const e = arca.emitidos.get(`${pto}:${tipo}:${nro}`);
    if (!e) return new Response(soap('FECompConsultar', errores(602, 'Sin Resultados: - en la condicion de busqueda')));
    return new Response(soap('FECompConsultar', `<ResultGet><Concepto>1</Concepto><DocTipo>${e.docTipo}</DocTipo><DocNro>${e.docNro}</DocNro>`
        + `<CbteDesde>${nro}</CbteDesde><CbteHasta>${nro}</CbteHasta><CbteFch>${e.fch}</CbteFch><ImpTotal>${e.total}</ImpTotal>`
        + `<MonId>${e.monId}</MonId><MonCotiz>${e.cotiz}</MonCotiz><Resultado>A</Resultado><CodAutorizacion>${e.cae}</CodAutorizacion>`
        + `<EmisionTipo>CAE</EmisionTipo><FchVto>${e.vto}</FchVto><FchProceso>20261008120000</FchProceso><PtoVta>${pto}</PtoVta><CbteTipo>${tipo}</CbteTipo></ResultGet>`));
}

async function fakeFetch(url: string, init: RequestInit): Promise<Response> {
    const body = String(init.body ?? '');
    if (String(url).includes('LoginCms')) return loginWsaa();
    const op = String((init.headers as Record<string, string>).SOAPAction).replace(/"/g, '').replace(NS, '');
    arca.llamadas.push({ op, body });
    const conToken = ['FECAESolicitar', 'FECompUltimoAutorizado', 'FECompConsultar', 'FEParamGetCotizacion'];
    if (conToken.includes(op) && tag(body, 'Token') !== arca.tokenValido) {
        return new Response(soap(op, errores(600, 'ValidacionDeToken: No aparecio CUIT en lista de relaciones')));
    }
    switch (op) {
        case 'FECompUltimoAutorizado': {
            const n = arca.ultimo.get(`${tag(body, 'PtoVta')}:${tag(body, 'CbteTipo')}`) ?? 0;
            return new Response(soap(op, `<PtoVta>${tag(body, 'PtoVta')}</PtoVta><CbteTipo>${tag(body, 'CbteTipo')}</CbteTipo><CbteNro>${n}</CbteNro>`));
        }
        case 'FECAESolicitar': return caeSolicitar(body);
        case 'FECompConsultar': return compConsultar(body);
        case 'FEParamGetCotizacion':
            return new Response(soap(op, `<ResultGet><MonId>${tag(body, 'MonId')}</MonId><MonCotiz>1000.5</MonCotiz><FchCotiz>20261008</FchCotiz></ResultGet>`));
        default:
            throw new Error(`operación no simulada: ${op}`);
    }
}
const llamadas = (op: string) => arca.llamadas.filter((l) => l.op === op);

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
    cert.serialNumber = '0a';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: 'cord' }, { type: '2.5.4.5', value: `CUIT ${CUIT}` }]);
    cert.setIssuer([{ name: 'commonName', value: 'Computadores Test' }]);
    cert.sign(key, forge.md.sha256.create());
    return { certPem: forge.pki.certificateToPem(cert), keyPem };
}

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create role cord_app;
        create table orgs(id uuid primary key, country_code text, rfc text, fiscal_metadata jsonb);
        create table clientes(id uuid primary key, org_id uuid not null references orgs(id) on delete cascade);
        create table documentos_fiscales(
            id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, cliente_id uuid,
            credit_note_of uuid, service_date date, service_date_end date, due_date date, status text not null default 'error',
            provider_document_id text, provider_data jsonb, updated_at timestamptz);
        insert into orgs values ('${ORG}', 'AR', null, '{"tax_id":"30-71234567-1"}'), ('${ORG2}', 'AR', null, '{}');
        grant select, insert, update, delete on all tables in schema public to cord_app;`);
    await m.db.exec(seccionLatam());
    const { certPem, keyPem } = certificadoDePrueba();
    const parsed = parsearCertificado({ certificado: certPem, llave: keyPem });
    expect(parsed.sujetoSerialNumber).toBe(`CUIT ${CUIT}`);
    await guardarCredencial(ORG, 'arca', 'homologacion', parsed, { identificador: CUIT, nombreArchivo: 'cord.crt', subidoPor: null });
    await guardarAjustes(ORG, 'arca', { puntoVenta: 3, condicionEmisor: 'responsable_inscripto', concepto: 1 });
}, 30_000);

afterAll(async () => {
    vi.unstubAllGlobals();
    await m.db?.close();
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    arca.plan = [];
    arca.llamadas = [];
    m.finalize.mockReset();
});

let seq = 0;
const lineas = (base: number, rate = 0.21) => [{
    description: 'Servicio', quantity: 1, unitPrice: base, taxRate: rate, subtotal: base,
    taxAmount: Math.round(base * rate * 100) / 100, total: Math.round(base * (1 + rate) * 100) / 100,
}];

async function nuevoDocumento(opts: { condicion?: number | null; creditNoteOf?: string; org?: string } = {}) {
    const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
    const cliente = `00000000-0000-4000-a000-${String(seq).padStart(12, '0')}`;
    await m.db.query('insert into clientes (id, org_id, condicion_iva) values ($1, $2, $3)', [cliente, opts.org ?? ORG, opts.condicion === undefined ? 1 : opts.condicion]);
    await m.db.query('insert into documentos_fiscales (id, org_id, cliente_id, credit_note_of) values ($1, $2, $3, $4)', [id, opts.org ?? ORG, cliente, opts.creditNoteOf ?? null]);
    return id;
}

function request(documentId: string, over: Record<string, unknown> = {}) {
    const base = (over.base as number) ?? 1000;
    return {
        documentId, invoiceNumber: `FA-${seq}`, idempotencyKey: `k-${documentId}`, orgId: ORG, quoteId: documentId,
        countryCode: 'AR', documentType: 'arca_invoice',
        issuer: { legalName: 'ACME SRL', taxId: '30-71234567-1', address: { countryCode: 'AR' } },
        recipient: { legalName: 'Cliente SA', taxId: CUIT_RI, address: { countryCode: 'AR' } },
        lines: lineas(base), totals: { subtotal: base, taxes: Math.round(base * 21) / 100, total: Math.round(base * 121) / 100, currency: 'ARS' },
        issuedAt: new Date().toISOString(), ...over,
    } as any;
}

const intentos = async (doc: string) => (await m.db.query(
    'select estado, numero, autorizacion, autorizacion_vence::text as vence, observaciones, error_codigo, error_mensaje, respuesta from fiscal_rail_comprobantes where documento_id = $1 order by created_at, numero', [doc])).rows;

// ── Pruebas ──────────────────────────────────────────────────────────────────
describe('estado del riel', () => {
    it('dice qué falta en vocabulario de códigos y solo está listo con todo', async () => {
        expect((await estadoArca(ORG2)).faltantes).toEqual(['cuit', 'punto_venta', 'condicion_emisor', 'concepto', 'certificado']);
        expect(await railListo(ORG2, 'arca')).toBe(false);
        const e = await estadoArca(ORG);
        expect(e).toMatchObject({ habilitado: true, entorno: 'homologacion', cuit: CUIT, faltantes: [], listo: true });
        expect(e.credencial?.identificador).toBe(CUIT);
        expect(JSON.stringify(e)).not.toMatch(/BEGIN|PRIVATE/);
    });

    it('con el riel apagado nada está listo y un documento arca_* no degrada en silencio', async () => {
        process.env.ARCA_ENABLED = 'false';
        try {
            expect(await railListo(ORG, 'arca')).toBe(false);
            const doc = await nuevoDocumento();
            await expect(provider.issueDocument(request(doc))).rejects.toThrow(/no está activa/);
            const comercial = await provider.issueDocument(request(doc, { documentType: 'commercial_invoice' }));
            expect(comercial.rawProviderData?.regulatory_status).toBe('commercial_only');
            expect(arca.llamadas).toHaveLength(0);
        } finally {
            process.env.ARCA_ENABLED = 'true';
        }
    });
});

describe('autorización', () => {
    it('Factura A autorizada: CAE, número legal de ARCA, QR y replay idempotente', async () => {
        const doc = await nuevoDocumento({ condicion: 1 });
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(r.provider).toBe('arca');
        expect(r.fiscalId).toMatch(/^\d{14}$/);
        expect(r.invoiceNumber).toBe('H-FA-A-00003-00000001');
        expect(r.rawProviderData).toMatchObject({ regulatory_status: 'arca', livemode: false, simulado: true });
        const rep = representacionDe(r.rawProviderData);
        expect(rep?.letra).toBe('A');
        expect(rep?.codigo).toBe('COD. 01');
        expect(rep?.qrUrl).toMatch(/^https:\/\/www\.arca\.gob\.ar\/fe\/qr\/\?p=/);
        const qr = JSON.parse(Buffer.from(rep!.qrUrl!.split('?p=')[1], 'base64').toString('utf8'));
        expect(qr).toMatchObject({ ver: 1, cuit: Number(CUIT), ptoVta: 3, tipoCmp: 1, nroCmp: 1, importe: 1210, moneda: 'PES', ctz: 1, tipoDocRec: 80, nroDocRec: Number(CUIT_RI), tipoCodAut: 'E', codAut: Number(r.fiscalId) });
        expect(rep?.filas.find((f) => f.k === 'CAE N°')?.v).toBe(r.fiscalId);
        expect(rep?.prueba).toBe(true);

        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'autorizado', numero: 1, autorizacion: r.fiscalId });
        expect(i.vence).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        const pedidosAntes = llamadas('FECAESolicitar').length;
        const replay = await provider.issueDocument(request(doc));
        expect(replay.fiscalId).toBe(r.fiscalId);
        expect(replay.invoiceNumber).toBe(r.invoiceNumber);
        expect(llamadas('FECAESolicitar')).toHaveLength(pedidosAntes);
    });

    it('el ticket del WSAA se reutiliza, se renueva cerca del vencimiento y cuando ARCA lo rechaza', async () => {
        const loginsAntes = arca.logins;
        await provider.issueDocument(request(await nuevoDocumento()));
        expect(arca.logins).toBe(loginsAntes);

        // A menos de 10 minutos de vencer ya no se usa.
        await m.db.query("update fiscal_rail_accesos set expira_at = now() + interval '5 minutes'");
        await provider.issueDocument(request(await nuevoDocumento()));
        expect(arca.logins).toBe(loginsAntes + 1);

        // ARCA lo invalida (600): se pide otro y se reintenta la MISMA consulta.
        arca.tokenValido = 'revocado';
        const r = await provider.issueDocument(request(await nuevoDocumento()));
        expect(r.success).toBe(true);
        expect(arca.logins).toBe(loginsAntes + 2);
        const [{ token_enc }] = (await m.db.query("select token_enc from fiscal_rail_accesos")).rows;
        expect(token_enc).toMatch(/^enc:/);
    });

    it('rechazo con observaciones: mensaje traducido, el borrador queda descartable y el número se reutiliza', async () => {
        const doc = await nuevoDocumento();
        const ultimo = arca.ultimo.get('3:1') ?? 0;
        arca.plan = ['rechazo'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(`err_ar_${doc}`);
        expect(r.rawProviderData?.delivery_uncertain).toBeUndefined();
        expect(r.error).not.toMatch(/DocNro 0 no es valido|CbteDesde/);
        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'rechazado', numero: ultimo + 1, error_codigo: '10015' });
        expect(i.observaciones[0]).toMatchObject({ code: 10015 });

        // El rechazo no consume número en ARCA: la siguiente factura lo usa.
        const otro = await nuevoDocumento();
        const ok = await provider.issueDocument(request(otro));
        expect(ok.success).toBe(true);
        expect((await intentos(otro))[0].numero).toBe(ultimo + 1);
    });

    it('autorizado con observaciones: se conservan y viajan a provider_data', async () => {
        const doc = await nuevoDocumento({ condicion: 6 });
        arca.plan = ['obs'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect((r.rawProviderData as any).latam.observaciones[0]).toMatchObject({ code: 10217 });
        expect(representacionDe(r.rawProviderData)?.leyendas.join(' ')).toMatch(/Régimen General/);
    });

    it('Factura B a consumidor final sin identificar', async () => {
        const doc = await nuevoDocumento({ condicion: null });
        const r = await provider.issueDocument(request(doc, { recipient: { legalName: 'Consumidor', taxId: '', address: { countryCode: 'AR' } } }));
        expect(r.success).toBe(true);
        expect(r.invoiceNumber).toMatch(/^H-FA-B-00003-/);
        const pedido = llamadas('FECAESolicitar').at(-1)!.body;
        expect(tag(pedido, 'DocTipo')).toBe('99');
        expect(tag(pedido, 'CondicionIVAReceptorId')).toBe('5');
        const rep = representacionDe(r.rawProviderData)!;
        expect(rep.leyendas).toContain('A CONSUMIDOR FINAL');
        expect(rep.leyendas.join(' ')).toMatch(/Transparencia Fiscal/);
    });

    it('error de datos ANTES de pedir el CAE: no toca ARCA y explica qué corregir', async () => {
        const doc = await nuevoDocumento({ condicion: null });
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/condición frente al IVA de este cliente/);
        expect(llamadas('FECAESolicitar')).toHaveLength(0);
        expect(await intentos(doc)).toHaveLength(0);
    });

    it('factura en dólares: cotización oficial de ARCA, o la congelada del documento si es a pesos', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc, { totals: { subtotal: 1000, taxes: 210, total: 1210, currency: 'USD' } }));
        expect(r.success).toBe(true);
        const pedido = llamadas('FECAESolicitar').at(-1)!.body;
        expect([tag(pedido, 'MonId'), tag(pedido, 'MonCotiz')]).toEqual(['DOL', '1000.5']);

        const doc2 = await nuevoDocumento();
        await provider.issueDocument(request(doc2, { totals: { subtotal: 1000, taxes: 210, total: 1210, currency: 'USD', exchangeRate: 1234.56, ledgerCurrency: 'ARS' } }));
        expect(tag(llamadas('FECAESolicitar').at(-1)!.body, 'MonCotiz')).toBe('1234.56');
    });
});

describe('respuestas perdidas: se consulta, nunca se reenvía', () => {
    it('la respuesta se perdió pero ARCA autorizó: la consulta inmediata lo recupera', async () => {
        const doc = await nuevoDocumento();
        arca.plan = ['perdida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(llamadas('FECAESolicitar')).toHaveLength(1);
        expect(llamadas('FECompConsultar').length).toBeGreaterThan(0);
        const [i] = await intentos(doc);
        expect(i.estado).toBe('autorizado');
        expect(i.respuesta.recuperado).toBe(true);
    });

    it('sin respuesta y sin registro: queda incierto, bloquea el número y el reintento no reenvía', async () => {
        const doc = await nuevoDocumento();
        arca.plan = ['caida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(doc);
        expect(r.rawProviderData).toMatchObject({ delivery_uncertain: true, retry_safe: true });
        expect((await intentos(doc))[0].estado).toBe('incierto');

        // Otra factura del mismo punto de venta no puede saltarse el número en duda.
        const otra = await provider.issueDocument(request(await nuevoDocumento()));
        expect(otra.success).toBe(false);
        expect(otra.error).toMatch(/esperando la confirmación/);

        // Reintento del mismo documento: consulta (todavía reciente) y no reenvía.
        const pedidos = llamadas('FECAESolicitar').length;
        const again = await provider.issueDocument(request(doc));
        expect(again.rawProviderData?.delivery_uncertain).toBe(true);
        expect(llamadas('FECAESolicitar')).toHaveLength(pedidos);
    });

    it('el cron descarta lo que ARCA no registró y libera el documento; autoriza lo que sí', async () => {
        // Envejece los intentos inciertos (created_at es inmutable por el trigger).
        await m.db.exec(`alter table fiscal_rail_comprobantes disable trigger trg_fiscal_rail_comprobante_inmutable;
            update fiscal_rail_comprobantes set created_at = now() - interval '10 minutes', enviado_at = now() - interval '10 minutes' where estado = 'incierto';
            alter table fiscal_rail_comprobantes enable trigger trg_fiscal_rail_comprobante_inmutable;`);
        const [incierto] = (await m.db.query("select documento_id from fiscal_rail_comprobantes where estado = 'incierto'")).rows;
        await m.db.query("update documentos_fiscales set provider_document_id = id::text, provider_data = '{\"delivery_uncertain\":true,\"retry_safe\":true}' where id = $1", [incierto.documento_id]);

        expect(await orgsConPendientes('arca')).toEqual([ORG]);
        const r = await resolverPendientesDeOrg(ORG, 'arca');
        expect(r).toMatchObject({ revisados: 1, descartados: 1, autorizados: 0 });
        const [doc] = (await m.db.query('select provider_document_id, provider_data from documentos_fiscales where id = $1', [incierto.documento_id])).rows;
        expect(doc.provider_document_id).toBe(`err_arca_${incierto.documento_id}`);
        expect(doc.provider_data.delivery_uncertain).toBeUndefined();
        expect(doc.provider_data.error).toMatch(/no registró/);
        expect(m.finalize).not.toHaveBeenCalled();

        // Uno que ARCA sí autorizó (la respuesta se perdió y nadie consultó).
        const otro = await nuevoDocumento();
        arca.plan = ['perdida'];
        const fetchReal = globalThis.fetch;
        // La consulta inmediata también falla: el intento queda incierto.
        vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
            const op = String((init.headers as Record<string, string>)?.SOAPAction ?? '');
            if (op.includes('FECompConsultar')) throw new TypeError('fetch failed');
            return fakeFetch(url, init);
        }));
        const pendiente = await provider.issueDocument(request(otro));
        expect(pendiente.rawProviderData?.delivery_uncertain).toBe(true);
        vi.stubGlobal('fetch', fetchReal);
        await m.db.exec(`alter table fiscal_rail_comprobantes disable trigger trg_fiscal_rail_comprobante_inmutable;
            update fiscal_rail_comprobantes set created_at = now() - interval '10 minutes', enviado_at = now() - interval '10 minutes' where estado = 'incierto';
            alter table fiscal_rail_comprobantes enable trigger trg_fiscal_rail_comprobante_inmutable;`);
        const r2 = await resolverPendientesDeOrg(ORG, 'arca');
        expect(r2).toMatchObject({ autorizados: 1 });
        expect(m.finalize).toHaveBeenCalledWith(ORG, otro);
        expect((await intentos(otro))[0].estado).toBe('autorizado');
        expect(await orgsConPendientes('arca')).toEqual([]);
    });

    it('error interno de ARCA (500): incierto, sin reenviar', async () => {
        const doc = await nuevoDocumento();
        arca.plan = ['error500'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.rawProviderData?.delivery_uncertain).toBe(true);
        expect((await intentos(doc))[0].estado).toBe('incierto');
        // Se libera para no contaminar las pruebas siguientes.
        await m.db.exec(`alter table fiscal_rail_comprobantes disable trigger trg_fiscal_rail_comprobante_inmutable;
            update fiscal_rail_comprobantes set created_at = now() - interval '10 minutes', enviado_at = now() - interval '10 minutes' where estado = 'incierto';
            alter table fiscal_rail_comprobantes enable trigger trg_fiscal_rail_comprobante_inmutable;`);
        expect(await resolverPendientesDeOrg(ORG, 'arca')).toMatchObject({ descartados: 1 });
    });
});

describe('nota de crédito', () => {
    it('misma clase y receptor que la factura, con CbtesAsoc y comprobante asociado impreso', async () => {
        const factura = await nuevoDocumento({ condicion: 1 });
        const f = await provider.issueDocument(request(factura));
        expect(f.success).toBe(true);
        const numeroFactura = Number(f.invoiceNumber!.split('-').at(-1));

        // El cliente cambió de condición después: la NC conserva la de la factura.
        const nc = await nuevoDocumento({ condicion: 5, creditNoteOf: factura });
        const r = await provider.issueDocument(request(nc, { documentType: 'arca_credit_note', base: 100 }));
        expect(r.success).toBe(true);
        expect(r.invoiceNumber).toMatch(/^H-NC-A-00003-/);
        const pedido = llamadas('FECAESolicitar').at(-1)!.body;
        expect(tag(pedido, 'CbteTipo')).toBe('3');
        expect(tag(pedido, 'CondicionIVAReceptorId')).toBe('1');
        expect(pedido).toContain(`<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>1</ar:Tipo><ar:PtoVta>3</ar:PtoVta><ar:Nro>${numeroFactura}</ar:Nro><ar:Cuit>${CUIT}</ar:Cuit>`);
        const rep = representacionDe(r.rawProviderData)!;
        expect(rep.titulo).toBe('NOTA DE CRÉDITO A');
        expect(rep.filas.find((x) => x.k === 'Comprobante asociado')?.v).toBe(`FACTURA A ${f.invoiceNumber!.slice(-14)}`);
    });

    it('sin CAE en la factura original no se autoriza', async () => {
        const factura = await nuevoDocumento();
        const nc = await nuevoDocumento({ creditNoteOf: factura });
        const r = await provider.issueDocument(request(nc, { documentType: 'arca_credit_note', base: 100 }));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/no tiene un CAE/);
    });

    it('un comprobante autorizado no se anula ante ARCA', async () => {
        const r = await provider.cancelDocument('x');
        expect(r).toMatchObject({ success: false, status: 'rejected' });
        expect(r.error).toMatch(/nota de crédito/);
    });
});

describe('numeración e idempotencia', () => {
    it('emisiones concurrentes del mismo punto de venta toman números consecutivos sin huecos', async () => {
        const docs = await Promise.all([nuevoDocumento(), nuevoDocumento(), nuevoDocumento()]);
        const antes = arca.ultimo.get('3:1') ?? 0;
        const rs = await Promise.all(docs.map((d) => provider.issueDocument(request(d))));
        expect(rs.every((r) => r.success)).toBe(true);
        const numeros = (await Promise.all(docs.map(async (d) => (await intentos(d))[0].numero))).sort((a, b) => a - b);
        expect(numeros).toEqual([antes + 1, antes + 2, antes + 3]);
        expect(rs.filter((r) => true).map((r) => r.fiscalId).length).toBe(new Set(rs.map((r) => r.fiscalId)).size);
    }, 30_000);

    it('dos emisiones simultáneas del MISMO documento piden un solo CAE', async () => {
        const doc = await nuevoDocumento();
        const pedidos = llamadas('FECAESolicitar').length;
        const [a, b] = await Promise.all([provider.issueDocument(request(doc)), provider.issueDocument(request(doc))]);
        expect(a.success && b.success).toBe(true);
        expect(a.fiscalId).toBe(b.fiscalId);
        expect(llamadas('FECAESolicitar')).toHaveLength(pedidos + 1);
        expect((await intentos(doc)).filter((i: any) => i.estado === 'autorizado')).toHaveLength(1);
    }, 30_000);

    it('el índice único impide dos intentos vivos para el mismo número o documento', async () => {
        const doc = await nuevoDocumento();
        const insert = (documento: string, numero: number) => m.db.query(
            `insert into fiscal_rail_comprobantes (org_id, documento_id, rail, entorno, serie, tipo, numero, estado, solicitud)
             values ($1, $2, 'arca', 'homologacion', '99', '1', $3, 'pendiente', '{}')`, [ORG, documento, numero]);
        await insert(doc, 1);
        await expect(insert(await nuevoDocumento(), 1)).rejects.toThrow(/duplicate|unique/i);
        await expect(insert(doc, 2)).rejects.toThrow(/duplicate|unique/i);
        await m.db.query("update fiscal_rail_comprobantes set estado = 'descartado' where serie = '99'");
    });
});

describe('inmutabilidad (trigger)', () => {
    it('un comprobante autorizado no se edita ni se borra; los estados finales no cambian', async () => {
        const [a] = (await m.db.query("select id from fiscal_rail_comprobantes where estado = 'autorizado' limit 1")).rows;
        await expect(m.db.query("update fiscal_rail_comprobantes set autorizacion = '1' where id = $1", [a.id])).rejects.toThrow(/definitivo/);
        await expect(m.db.query('update fiscal_rail_comprobantes set numero = numero + 100 where id = $1', [a.id])).rejects.toThrow(/identidad/);
        await expect(m.db.query('delete from fiscal_rail_comprobantes where id = $1', [a.id])).rejects.toThrow(/no se borra/);
        const [r] = (await m.db.query("select id from fiscal_rail_comprobantes where estado = 'rechazado' limit 1")).rows;
        await expect(m.db.query("update fiscal_rail_comprobantes set estado = 'autorizado' where id = $1", [r.id])).rejects.toThrow(/finales/);
    });
});

describe('aislamiento (RLS con el rol de aplicación)', () => {
    it('una organización no ve los comprobantes, credenciales ni tickets de otra', async () => {
        const contar = (org: string, tabla: string) => m.db.transaction(async (t: any) => {
            await t.query('set local role cord_app');
            await t.query("select set_config('app.org_id', $1, true)", [org]);
            return Number((await t.query(`select count(*)::int as n from ${tabla}`)).rows[0].n);
        });
        for (const tabla of ['fiscal_rail_comprobantes', 'fiscal_rail_credenciales', 'fiscal_rail_accesos', 'fiscal_rail_ajustes']) {
            expect(await contar(ORG, tabla), tabla).toBeGreaterThan(0);
            expect(await contar(ORG2, tabla), tabla).toBe(0);
        }
        // El barrido del cron solo responde en el carril de sistema.
        const doc = await nuevoDocumento();
        await m.db.query(`insert into fiscal_rail_comprobantes (org_id, documento_id, rail, entorno, serie, tipo, numero, estado, solicitud, created_at)
            values ($1, $2, 'arca', 'homologacion', '98', '1', 1, 'pendiente', '{}', now() - interval '1 hour')`, [ORG, doc]);
        const barrido = (scope: string | null) => m.db.transaction(async (t: any) => {
            await t.query('set local role cord_app');
            if (scope) await t.query("select set_config('app.scope', $1, true)", [scope]);
            return (await t.query("select cord_fiscal_rail_orgs_por_resolver('arca', 0) as org_id")).rows.map((r: any) => r.org_id);
        });
        expect(await barrido(null)).toEqual([]);
        expect(await barrido('system')).toEqual([ORG]);
        await m.db.query("update fiscal_rail_comprobantes set estado = 'descartado' where serie = '98'");
    });
});
