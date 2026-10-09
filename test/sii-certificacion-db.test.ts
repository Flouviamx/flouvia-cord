// Lo que el SII exige para certificar a un emisor, contra Postgres real
// (PGlite) con las secciones del riel de db/schema.sql tal cual y un SII
// simulado en fetch (CrSeed, GetTokenFromSeed, DTEUpload, QueryEstUp y el
// registro de aceptación o reclamo de ws2):
//
//   - nota de débito (DTE 56) en el ciclo de la factura: cargo adicional sobre
//     una factura (CodRef 3) y anulación de una nota de crédito (CodRef 1);
//   - set de pruebas: carga del archivo del SII, un envío con todos los casos
//     en orden y la línea SET/CASO, folios de certificación, veredicto por
//     tipo y muestras impresas;
//   - libros de ventas y de compras del set (IECV): del set aceptado y de los
//     documentos del set de compras con su proveedor, firmados, subidos por el
//     mismo upload y con el estado tal como lo dice el SII;
//   - intercambio: recepción y validación (firma, RUT receptor, repetidos),
//     RespuestaDTE de recepción y de resultado, EnvioRecibos, el registro en
//     el SII, la casilla del correo entrante y el aislamiento por organización.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPairSync, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import forge from 'node-forge';
import { cafDePrueba, llavesCaf } from '../scripts/fixtures/sii/caf-prueba.mjs';

const m = vi.hoisted(() => ({ db: null as any, correos: [] as any[] }));

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
vi.mock('../src/lib/email', () => ({
    sendEmail: vi.fn(async (o: any) => { m.correos.push(o); return { sent: true, to: o.to }; }),
}));

const ORG = '00000000-0000-4000-8000-0000000000d1';
const ORG2 = '00000000-0000-4000-8000-0000000000d2';
const RUT = '76123456-0';
const RUT_FIRMANTE = '11111111-1';
const PROVEEDOR = '96543210-8';

process.env.SII_ENABLED = 'true';
process.env.SII_ENTORNO = 'homologacion';

const { ChileSiiProvider } = await import('../src/lib/fiscal/providers/ChileSiiProvider');
const { createDebitNote } = await import('../src/lib/fiscal/invoices');
const { parsearCertificado } = await import('../src/lib/fiscal/latam/certificado');
const { guardarCredencial, guardarAjustes } = await import('../src/lib/fiscal/latam/credenciales');
const { parsearCaf } = await import('../src/lib/fiscal/latam/sii/caf');
const { guardarCaf } = await import('../src/lib/fiscal/latam/sii/cafs');
const { contextoSii } = await import('../src/lib/fiscal/latam/sii/autorizacion');
const { cargarSet, consultarSet, enviarSet, muestraDeCaso, nuevoIntento, listarSets, exigirCertificacion } = await import('../src/lib/fiscal/latam/sii/certificacion');
const { cargarArchivoSet, consultarLibro, enviarLibro, libroPorId, listarLibros, nuevoIntentoLibro, xmlDelLibro } = await import('../src/lib/fiscal/latam/sii/libros-set');
const { casillaIntercambio, decidirDocumentos, listarRecepciones, orgDeCasilla, recibirEnvio, xmlRespuesta } = await import('../src/lib/fiscal/latam/sii/recepcion');
const { verificarFirmaRecibida } = await import('../src/lib/fiscal/latam/sii/respuesta-intercambio');
const { emitirDocumento } = await import('../src/lib/fiscal/latam/sii/emision');
const { armarEnvio } = await import('../src/lib/fiscal/latam/sii/envio');
const { armarBorrador } = await import('../src/lib/fiscal/latam/sii/dte');
const { fechaChile } = await import('../src/lib/fiscal/latam/sii/texto');
const { buscar, parsearFragmento, textoDe } = await import('../src/lib/fiscal/latam/sii/xml');
const { createInvoicePdf } = await import('../src/lib/fiscal/invoice-pdf');
const provider = new ChileSiiProvider({ esperaVeredictoMs: 30 });
const HOY = fechaChile(new Date());

// ── SII simulado ─────────────────────────────────────────────────────────────
const sii = {
    tokens: 0, tokenValido: '', track: 7000,
    envios: new Map<string, { archivo: string; tipos: Map<string, number> }>(),
    uploads: [] as string[],
    reclamos: [] as { accion: string; folio: string; tipo: string; rut: string; cookie: string }[],
    codReclamo: 0,
    veredicto: 'ok' as 'ok' | 'reparo' | 'rechazo',
    /** ESTADO y GLOSA de QueryEstUp para un libro. */
    estadoLibro: ['EPR', 'Envio Procesado'] as [string, string],
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function respuesta(op: string, interno: string): Response {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">${interno}</SII:RESPUESTA>`;
    return new Response('<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Body>'
        + `<ns1:${op}Response soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:ns1="http://DefaultNamespace"><ns1:${op}Return xsi:type="xsd:string">${esc(xml)}</ns1:${op}Return></ns1:${op}Response>`
        + '</soapenv:Body></soapenv:Envelope>');
}
const param = (body: string, k: string) => new RegExp(`<${k} xsi:type="xsd:string">([^<]*)</${k}>`).exec(body)?.[1] ?? '';

function upload(init: RequestInit): Response {
    const token = /TOKEN=([^;\s]+)/.exec(String((init.headers as Record<string, string>).Cookie ?? ''))?.[1];
    const cuerpo = Buffer.from(init.body as Uint8Array).toString('latin1');
    // El mismo upload recibe el envío de documentos y los libros.
    const cierre = cuerpo.includes('</LibroCompraVenta>') ? '</LibroCompraVenta>' : '</EnvioDTE>';
    const archivo = cuerpo.slice(cuerpo.indexOf('<?xml'), cuerpo.lastIndexOf(cierre) + cierre.length);
    sii.uploads.push(archivo);
    const status = token === sii.tokenValido ? 0 : 5;
    const tipos = new Map<string, number>();
    for (const t of archivo.matchAll(/<TipoDTE>(\d+)<\/TipoDTE>/g)) tipos.set(t[1], (tipos.get(t[1]) ?? 0) + 1);
    const trackId = status === 0 ? String(++sii.track) : null;
    if (trackId) sii.envios.set(trackId, { archivo, tipos });
    return new Response(`<?xml version="1.0"?>\n<RECEPCIONDTE>\n<RUTSENDER>${RUT_FIRMANTE}</RUTSENDER>\n<RUTCOMPANY>${RUT}</RUTCOMPANY>\n<FILE>envio.xml</FILE>\n`
        + `<TIMESTAMP>2026-10-09 12:00:00</TIMESTAMP>\n<STATUS>${status}</STATUS>\n${trackId ? `<TRACKID>${trackId}</TRACKID>\n` : ''}</RECEPCIONDTE>\n`);
}

function estadoEnvio(body: string): Response {
    if (param(body, 'Token') !== sii.tokenValido) return respuesta('getEstUp', '<SII:RESP_HDR><ESTADO>001</ESTADO><GLOSA>TOKEN NO EXISTE</GLOSA></SII:RESP_HDR>');
    const e = sii.envios.get(param(body, 'TrackId'));
    if (!e) return respuesta('getEstUp', '<SII:RESP_HDR><ESTADO>-11</ESTADO></SII:RESP_HDR>');
    if (e.archivo.includes('<LibroCompraVenta')) {
        return respuesta('getEstUp', `<SII:RESP_HDR><TRACKID>${param(body, 'TrackId')}</TRACKID><ESTADO>${sii.estadoLibro[0]}</ESTADO><GLOSA>${sii.estadoLibro[1]}</GLOSA></SII:RESP_HDR>`);
    }
    // Un bloque por tipo de documento dentro del cuerpo (manual de QueryEstUp).
    const bloques = [...e.tipos.entries()].map(([tipo, n], i) => {
        const rep = sii.veredicto === 'reparo' && i === 0 ? 1 : 0;
        const rec = sii.veredicto === 'rechazo' && i === 0 ? 1 : 0;
        return `<TIPO_DOCTO>${tipo}</TIPO_DOCTO><INFORMADOS>${n}</INFORMADOS><ACEPTADOS>${n - rep - rec}</ACEPTADOS><RECHAZADOS>${rec}</RECHAZADOS><REPAROS>${rep}</REPAROS>`;
    }).join('');
    return respuesta('getEstUp', `<SII:RESP_HDR><TRACKID>${param(body, 'TrackId')}</TRACKID><ESTADO>EPR</ESTADO><GLOSA>Envio Procesado</GLOSA></SII:RESP_HDR><SII:RESP_BODY>${bloques}</SII:RESP_BODY>`);
}

function reclamo(init: RequestInit): Response {
    const body = String(init.body);
    const cookie = String((init.headers as Record<string, string>).Cookie ?? '');
    const v = (k: string) => new RegExp(`<${k}>([^<]*)</${k}>`).exec(body)?.[1] ?? '';
    expect(body).toContain('<ws:ingresarAceptacionReclamoDoc>');
    sii.reclamos.push({ accion: v('accionDoc'), folio: v('folio'), tipo: v('tipoDoc'), rut: `${v('rutEmisor')}-${v('dvEmisor')}`, cookie });
    const cod = cookie === `TOKEN=${sii.tokenValido}` ? sii.codReclamo : 14;
    return new Response(`<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:ingresarAceptacionReclamoDocResponse xmlns:ns2="http://ws.registroreclamodte.diii.sdi.sii.cl">`
        + `<return><codResp>${cod}</codResp><descResp>${cod === 0 ? 'Acción Completada OK' : 'Error'}</descResp></return></ns2:ingresarAceptacionReclamoDocResponse></S:Body></S:Envelope>`);
}

async function fakeFetch(url: string, init: RequestInit): Promise<Response> {
    const u = String(url);
    const body = typeof init.body === 'string' ? init.body : '';
    if (u.startsWith('https://ws2.sii.cl/WSREGISTRORECLAMODTECERT/')) return reclamo(init);
    expect(u).toMatch(/^https:\/\/maullin\.sii\.cl\//);
    if (u.includes('CrSeed')) return respuesta('getSeed', '<SII:RESP_BODY><SEMILLA>012345678901</SEMILLA></SII:RESP_BODY><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR>');
    if (u.includes('GetTokenFromSeed')) {
        sii.tokenValido = `TOK${++sii.tokens}`;
        return respuesta('getToken', `<SII:RESP_BODY><TOKEN>${sii.tokenValido}</TOKEN></SII:RESP_BODY><SII:RESP_HDR><ESTADO>00</ESTADO><GLOSA>Token Creado</GLOSA></SII:RESP_HDR>`);
    }
    if (u.includes('DTEUpload')) return upload(init);
    if (u.includes('QueryEstUp')) return estadoEnvio(body);
    if (u.includes('QueryEstDte')) return respuesta('getEstDte', '<SII:RESP_HDR><ESTADO>DOK</ESTADO></SII:RESP_HDR>');
    throw new Error(`servicio no simulado: ${u}`);
}

// ── Base ─────────────────────────────────────────────────────────────────────
function seccion(desde: string, hasta: string): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf(desde);
    const fin = schema.indexOf(hasta, inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(inicio);
    return schema.slice(inicio, fin);
}

function certificado(cn: string) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const key = forge.pki.privateKeyFromPem(keyPem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '0c';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: cn }]);
    cert.setIssuer([{ name: 'commonName', value: 'CA DE PRUEBA' }]);
    cert.sign(key, forge.md.sha256.create());
    return { certPem: forge.pki.certificateToPem(cert), keyPem };
}
const negocio = certificado('FIRMANTE DEL NEGOCIO');
const proveedor = certificado('FIRMANTE DEL PROVEEDOR');

const llaves = llavesCaf();
async function subirCaf(tipo: number, desde: number, hasta: number) {
    const { xml } = cafDePrueba({ rut: RUT, tipo, desde, hasta, fecha: HOY, llaves });
    return guardarCaf(ORG, 'homologacion', parsearCaf(xml, RUT), xml, { nombreArchivo: `caf-${tipo}.xml` });
}
const siguiente = async (tipo: number) => {
    const [{ s }] = (await m.db.query('select min(folio_siguiente) as s from fiscal_sii_cafs where org_id = $1 and tipo_dte = $2 and folio_siguiente <= folio_hasta', [ORG, tipo])).rows;
    return Number(s);
};

const CLIENTES = [
    ['00000000-0000-4000-a000-000000000001', 'Comercial Andes Ltda.', '77777777-7'],
    ['00000000-0000-4000-a000-000000000002', 'Distribuidora Ñuble SpA', '11222333-9'],
    ['00000000-0000-4000-a000-000000000003', 'Servicios Maipo S.A.', '12345678-5'],
    ['00000000-0000-4000-a000-000000000004', 'Ferretería Biobío Ltda.', '22333444-K'],
] as const;

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create role cord_app;
        create table orgs(id uuid primary key, country_code text, rfc text, fiscal_metadata jsonb, razon_social text, nombre text,
                          direccion text, email_contacto text, iva_pct numeric);
        create table clientes(id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, empresa text, contacto text,
                              rfc text, direccion_line1 text, direccion_line2 text, ciudad text, email text);
        create table impuestos(id uuid primary key default gen_random_uuid(), org_id uuid not null, nombre text, tipo text, tasa numeric,
                               kind text, es_default boolean, activo boolean default true, retencion_base text);
        create table documentos_fiscales(
            id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs(id) on delete cascade,
            cotizacion_id uuid, cliente_id uuid, country_code text, document_type text, status text not null default 'pending', provider text,
            currency text, ledger_currency text, fx_rate numeric default 1, ledger_total numeric, subtotal numeric, tax_total numeric, total numeric,
            retencion_total numeric default 0, retenciones_snapshot jsonb, lifecycle text default 'draft', due_date date,
            amount_paid numeric default 0, amount_remaining numeric, public_token text, credit_note_of uuid, notes text, created_by uuid,
            issuer_snapshot jsonb, recipient_snapshot jsonb, line_items_snapshot jsonb, schema_version text, provider_data jsonb,
            updated_at timestamptz, descuento_total numeric default 0, buyer_reference text, purchase_order text, payee_account jsonb,
            service_date date, service_date_end date, provider_document_id text);
        insert into orgs values
            ('${ORG}', 'CL', null, '{"tax_id":"76.123.456-0","legal_name":"Empresa de Prueba SpA"}', null, 'Prueba', 'Av. Providencia 1234', 'contacto@prueba.cl', 19),
            ('${ORG2}', 'CL', null, '{"tax_id":"96.543.210-8","legal_name":"Otra SpA"}', null, 'Otra', 'Calle 1', null, 19);
        insert into impuestos (org_id, nombre, tipo, tasa, kind, es_default) values ('${ORG}', 'IVA 19%', 'iva', 19, 'consumo', true);
        grant select, insert, update, delete on all tables in schema public to cord_app;`);
    await m.db.exec(seccion('-- ── Rieles fiscales de LatAm', '-- END rieles-latam'));
    await m.db.exec(seccion('-- ── Chile: factura electrónica con el SII', '-- END sii'));
    await m.db.exec(seccion('-- ── Chile: nota de débito, set de pruebas e intercambio', '-- END sii-certificacion'));
    await m.db.exec(seccion('-- ── Chile: libros de compras y ventas del set de pruebas', '-- END sii-libros'));
    for (const [id, empresa, rut] of CLIENTES) {
        await m.db.query(`insert into clientes (id, org_id, empresa, rfc, giro, comuna, direccion_line1, ciudad) values ($1, $2, $3, $4, 'Comercio al por mayor', 'Santiago', 'Teatinos 120', 'Santiago')`,
            [id, ORG, empresa, rut]);
    }
    await m.db.query(`insert into clientes (id, org_id, empresa, rfc) values ('00000000-0000-4000-a000-000000000009', $1, 'Sin Giro Ltda.', '13131313-6')`, [ORG]);
    await guardarCredencial(ORG, 'sii', 'homologacion', parsearCertificado({ certificado: negocio.certPem, llave: negocio.keyPem }), { identificador: RUT_FIRMANTE, nombreArchivo: 'firmante.pfx', subidoPor: null });
    await guardarAjustes(ORG, 'sii', {
        giro: 'Servicios de consultoría informática', acteco: [620200], comuna: 'Providencia', ciudad: 'Santiago',
        unidadSii: 'PROVIDENCIA', resoluciones: { homologacion: { numero: 0, fecha: '2026-10-01' } },
    });
    await subirCaf(33, 1, 60);
    await subirCaf(34, 1, 10);
    await subirCaf(56, 1, 10);
    await subirCaf(61, 1, 20);
}, 60_000);

afterAll(async () => {
    vi.unstubAllGlobals();
    await m.db?.close();
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    sii.uploads = [];
    sii.reclamos = [];
    sii.codReclamo = 0;
    sii.veredicto = 'ok';
    sii.estadoLibro = ['EPR', 'Envio Procesado'];
    m.correos = [];
});

const ctx = () => contextoSii(ORG, 'homologacion', RUT);
const emisorBase = { razonSocial: 'Empresa de Prueba SpA', direccion: 'Av. Providencia 1234', ciudad: 'Santiago' };

// ── Nota de débito ───────────────────────────────────────────────────────────
describe('nota de débito (DTE 56) en el ciclo de la factura', () => {
    const issuer = { legalName: 'Empresa de Prueba SpA', taxId: '76.123.456-0', address: { line1: 'Av. Providencia 1234', city: 'Santiago', countryCode: 'CL' } };
    const recipient = { legalName: 'Comercial Andes Ltda.', taxId: '77.777.777-7', address: { line1: 'Teatinos 120', city: 'Santiago', countryCode: 'CL' } };
    const lineas = (neto: number) => [{ description: 'Servicio', quantity: 1, unitPrice: neto, taxRate: 0.19, subtotal: neto, taxAmount: Math.round(neto * 0.19), total: neto + Math.round(neto * 0.19) }];

    async function emitido(tipo: string, neto: number, extra: Record<string, unknown> = {}) {
        const [{ id }] = (await m.db.query(`insert into documentos_fiscales (org_id, cliente_id, country_code, document_type, currency, ledger_currency, subtotal, tax_total, total,
            lifecycle, status, issuer_snapshot, recipient_snapshot, line_items_snapshot, credit_note_of, due_date)
            values ($1, $2, 'CL', $3, 'CLP', 'CLP', $4, $5, $6, 'draft', 'pending', $7, $8, $9, $10, current_date) returning id`,
            [ORG, CLIENTES[0][0], tipo, neto, Math.round(neto * 0.19), neto + Math.round(neto * 0.19), JSON.stringify(issuer), JSON.stringify(recipient), JSON.stringify(lineas(neto)), extra.creditNoteOf ?? null])).rows;
        const r = await provider.issueDocument({
            documentId: id, invoiceNumber: 'X', idempotencyKey: `k-${id}`, orgId: ORG, quoteId: id, countryCode: 'CL', documentType: tipo,
            issuer, recipient, lines: lineas(neto), totals: { subtotal: neto, taxes: Math.round(neto * 0.19), total: neto + Math.round(neto * 0.19), currency: 'CLP' },
            issuedAt: new Date().toISOString(),
        } as any);
        expect(r.success, r.error).toBe(true);
        await m.db.query(`update documentos_fiscales set status = 'issued', lifecycle = 'open' where id = $1`, [id]);
        return { id, r };
    }
    async function emitirNota(id: string) {
        const [d] = (await m.db.query('select * from documentos_fiscales where id = $1', [id])).rows;
        return provider.issueDocument({
            documentId: id, invoiceNumber: 'X', idempotencyKey: `k-${id}`, orgId: ORG, quoteId: id, countryCode: 'CL', documentType: d.document_type,
            issuer, recipient, lines: d.line_items_snapshot,
            totals: { subtotal: Number(d.subtotal), taxes: Number(d.tax_total), total: Number(d.total), currency: 'CLP' },
            issuedAt: new Date().toISOString(),
        } as any);
    }

    it('sobre una factura: cargo adicional con CodRef 3, su receptor y folio del CAF 56', async () => {
        const factura = await emitido('sii_invoice', 100_000);
        const folioFactura = Number(factura.r.fiscalId!.split('/F')[1]);
        const nd = await createDebitNote(ORG, factura.id, { items: [{ descripcion: 'Intereses por mora', precioUnitario: 5_000, taxRate: 0.19 }], motivo: 'Intereses por pago fuera de plazo' });
        expect(nd.ok).toBe(true);
        const [fila] = (await m.db.query('select document_type, nota_debito_de, total, tax_total, lifecycle, line_items_snapshot from documentos_fiscales where id = $1', [nd.documentId])).rows;
        expect(fila).toMatchObject({ document_type: 'sii_debit_note', nota_debito_de: factura.id, lifecycle: 'draft' });
        expect([Number(fila.total), Number(fila.tax_total)]).toEqual([5_950, 950]);
        const folio = await siguiente(56);
        const r = await emitirNota(nd.documentId!);
        expect(r.success, r.error).toBe(true);
        expect(r.invoiceNumber).toBe(`C-ND-${folio}`);
        const xml = sii.uploads.at(-1)!;
        expect(xml).toContain('<TipoDTE>56</TipoDTE>');
        expect(xml).toMatch(/<Referencia>\n<NroLinRef>1<\/NroLinRef>\n<TpoDocRef>33<\/TpoDocRef>\n<FolioRef>(\d+)<\/FolioRef>/);
        expect(xml).toContain(`<FolioRef>${folioFactura}</FolioRef>`);
        expect(xml).toContain('<CodRef>3</CodRef>');
        expect(xml).toContain('<RazonRef>Intereses por pago fuera de plazo</RazonRef>');
        expect(xml).toContain('<RUTRecep>77777777-7</RUTRecep>');
        expect(xml).not.toContain('<FmaPago>');
    });

    it('sobre una nota de crédito: la anula completa con CodRef 1; una segunda no se crea', async () => {
        const factura = await emitido('sii_invoice', 80_000);
        const nc = await emitido('sii_credit_note', 80_000, { creditNoteOf: factura.id });
        const nd = await createDebitNote(ORG, nc.id, { motivo: 'Anula nota de crédito emitida por error' });
        expect(nd.ok).toBe(true);
        const r = await emitirNota(nd.documentId!);
        expect(r.success, r.error).toBe(true);
        const xml = sii.uploads.at(-1)!;
        expect(xml).toContain('<TpoDocRef>61</TpoDocRef>');
        expect(xml).toContain('<CodRef>1</CodRef>');
        expect(xml).toContain(`<MntTotal>${80_000 + 15_200}</MntTotal>`);
        expect((await createDebitNote(ORG, nc.id, {})).ok).toBe(false);
    });

    it('no existe fuera del riel del SII, ni sobre un documento sin emitir', async () => {
        const [{ id }] = (await m.db.query(`insert into documentos_fiscales (org_id, country_code, document_type, currency, total, status, lifecycle)
            values ($1, 'MX', 'cfdi_40', 'MXN', 100, 'issued', 'open') returning id`, [ORG])).rows;
        expect(await createDebitNote(ORG, id, { items: [{ descripcion: 'x', precioUnitario: 1, taxRate: 0.16 }] })).toMatchObject({ ok: false, error: 'Este documento no admite nota de débito.' });
        const [{ id: borrador }] = (await m.db.query(`insert into documentos_fiscales (org_id, country_code, document_type, currency, total, status, lifecycle)
            values ($1, 'CL', 'sii_invoice', 'CLP', 100, 'pending', 'draft') returning id`, [ORG])).rows;
        expect((await createDebitNote(ORG, borrador, { items: [{ descripcion: 'x', precioUnitario: 1, taxRate: 0.19 }] })).ok).toBe(false);
    });

    it('sin el documento original aceptado por el SII no se emite', async () => {
        const [{ id: original }] = (await m.db.query(`insert into documentos_fiscales (org_id, cliente_id, country_code, document_type, currency, total, status, lifecycle)
            values ($1, $2, 'CL', 'sii_invoice', 'CLP', 1190, 'issued', 'open') returning id`, [ORG, CLIENTES[0][0]])).rows;
        const nd = await createDebitNote(ORG, original, { items: [{ descripcion: 'Ajuste', precioUnitario: 1_000, taxRate: 0.19 }] });
        expect(nd.ok).toBe(true);
        const uploads = sii.uploads.length;
        const r = await emitirNota(nd.documentId!);
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/no fue aceptado por el SII: su nota de débito/);
        expect(sii.uploads).toHaveLength(uploads);
    });
});

// ── Set de pruebas ───────────────────────────────────────────────────────────
const SET = [
    'INDICACIONES GENERALES:', '',
    'SET BASICO - NUMERO DE ATENCION: 4352553', '',
    'CASO 4352553-1', '==============', 'DOCUMENTO\tFACTURA ELECTRONICA', '',
    'ITEM\t\t\tCANTIDAD\tPRECIO UNITARIO', 'Cajón AFECTO\t\t    168\t\t   3490', 'Relleno AFECTO\t\t     71\t\t   5813', '', '',
    'CASO 4352553-2', '==============', 'DOCUMENTO\tFACTURA ELECTRONICA', '',
    'ITEM\t\t\tCANTIDAD\tPRECIO UNITARIO\t\tDESCUENTO ITEM', 'Pañuelo AFECTO\t\t    759\t\t   5874\t\t\t     10%', 'ITEM 2 AFECTO\t\t    703\t\t   4925\t\t\t     23%', '', '',
    'CASO 4352553-3', '==============', 'DOCUMENTO\tFACTURA ELECTRONICA', '',
    'ITEM\t\t\tCANTIDAD\tPRECIO UNITARIO', 'Pintura B&W AFECTO\t     63\t\t   6868', 'ITEM 2 AFECTO\t\t    236\t\t   4020', 'ITEM 3 SERVICIO EXENTO\t      1\t\t  35292', '', '',
    'CASO 4352553-4', '==============', 'DOCUMENTO\tFACTURA ELECTRONICA', '',
    'ITEM\t\t\tCANTIDAD\tPRECIO UNITARIO', 'ITEM 1 AFECTO\t\t    414\t\t   5919', 'ITEM 2 AFECTO\t\t    175\t\t   7204', 'ITEM 3 SERVICIO EXENTO\t      2\t\t   6833', '',
    'DESCUENTO GLOBAL ITEMES AFECTOS\t\t     22%', '', '',
    'CASO 4352553-5', '==============', 'DOCUMENTO\t\tNOTA DE CREDITO ELECTRONICA', 'REFERENCIA\t\tFACTURA ELECTRONICA CORRESPONDIENTE A CASO 4352553-1',
    'RAZON REFERENCIA\tCORRIGE GIRO DEL RECEPTOR', '', '',
    'CASO 4352553-6', '==============', 'DOCUMENTO\t\tNOTA DE CREDITO ELECTRONICA', 'REFERENCIA\t\tFACTURA  ELECTRONICA CORRESPONDIENTE A CASO 4352553-2',
    'RAZON REFERENCIA\tDEVOLUCION DE MERCADERIAS', '', 'ITEM\t\t\tCANTIDAD', 'Pañuelo AFECTO\t\t    278', 'ITEM 2 AFECTO\t\t    477', '', '',
    'CASO 4352553-7', '==============', 'DOCUMENTO\t\tNOTA DE CREDITO ELECTRONICA', 'REFERENCIA\t\tFACTURA ELECTRONICA CORRESPONDIENTE A CASO 4352553-3',
    'RAZON REFERENCIA\tANULA FACTURA', '', '',
    'CASO 4352553-8', '==============', 'DOCUMENTO\t\tNOTA DE DEBITO ELECTRONICA', 'REFERENCIA\t\tNOTA DE CREDITO ELECTRONICA CORRESPONDIENTE A CASO 4352553-5',
    'RAZON REFERENCIA\tANULA NOTA DE CREDITO ELECTRONICA',
    '--------------------------------------------------------------------------------',
    'SET LIBRO DE VENTAS - NUMERO DE ATENCION: 4352554', '', 'CONSTRUYA EL LIBRO DE VENTAS CON LOS DOCUMENTOS CON QUE GENERO EL SET BASICO.',
    '--------------------------------------------------------------------------------',
    'SET GUIA DE DESPACHO - NUMERO DE ATENCIÓN: 4352556', '', 'CASO 4352556-1', '==============', 'DOCUMENTO\tGUIA DE DESPACHO', 'MOTIVO:\t\tTRASLADO',
].join('\r\n');
const receptores = Object.fromEntries(['4352553-1', '4352553-2', '4352553-3', '4352553-4'].map((c, i) => [c, CLIENTES[i][0]]));

describe('set de pruebas', () => {
    it('carga el set básico y dice qué trae el archivo que Cord no arma', async () => {
        const r = await cargarSet(ORG, SET, null);
        expect(r.sets.map((s) => [s.numeroAtencion, s.casos.length, s.estado])).toEqual([['4352553', 8, 'cargado']]);
        expect(r.libros.map((l) => [l.operacion, l.numeroAtencion])).toEqual([['VENTA', '4352554']]);
        expect(r.noSoportados.map((n) => [n.numeroAtencion, n.motivo])).toEqual([['4352556', 'guia']]);
        await expect(cargarSet(ORG, SET.replace('Cajón', 'Caj�n'), null)).rejects.toThrow(/ilegibles/);
    });

    it('un caso que no se puede armar no quema folios', async () => {
        const [s] = (await cargarSet(ORG, SET, null)).sets;
        const antes = await siguiente(33);
        await expect(enviarSet(await ctx(), s.id, { ...receptores, '4352553-4': '00000000-0000-4000-a000-000000000009' }, emisorBase)).rejects.toThrow(/giro, dirección y comuna/);
        await expect(enviarSet(await ctx(), s.id, { ...receptores, '4352553-2': CLIENTES[0][0] }, emisorBase)).rejects.toThrow(/RUT distinto/);
        expect(await siguiente(33)).toBe(antes);
        expect(sii.uploads).toHaveLength(0);
        expect((await listarSets(ORG)).find((x) => x.id === s.id)?.estado).toBe('cargado');
    });

    it('un solo envío con los casos en orden, la línea SET/CASO primero y folios de certificación', async () => {
        const [s] = (await cargarSet(ORG, SET, null)).sets;
        const f33 = await siguiente(33);
        const f61 = await siguiente(61);
        const f56 = await siguiente(56);
        const enviado = await enviarSet(await ctx(), s.id, receptores, emisorBase);
        expect(enviado.estado).toBe('enviado');
        expect(enviado.trackId).toBe(String(sii.track));
        expect(sii.uploads).toHaveLength(1);
        const xml = sii.uploads[0];
        expect(xml).toContain('<RutReceptor>60803000-K</RutReceptor>');
        expect(xml).toContain('<NroResol>0</NroResol>');
        expect([...xml.matchAll(/<TipoDTE>(\d+)<\/TipoDTE>/g)].map((x) => x[1])).toEqual(['33', '33', '33', '33', '61', '61', '61', '56']);
        expect([...xml.matchAll(/<SubTotDTE>\n<TpoDTE>(\d+)<\/TpoDTE>\n<NroDTE>(\d+)<\/NroDTE>/g)].map((x) => `${x[1]}:${x[2]}`)).toEqual(['33:4', '56:1', '61:3']);
        // Primera referencia de cada documento: TpoDocRef SET y "CASO n" (instrucciones, I.6).
        const refs = [...xml.matchAll(/<Referencia>\n<NroLinRef>1<\/NroLinRef>\n<TpoDocRef>([^<]+)<\/TpoDocRef>[\s\S]*?<RazonRef>([^<]+)<\/RazonRef>/g)].map((x) => [x[1], x[2]]);
        expect(refs).toEqual(s.casos.map((c) => ['SET', `CASO ${c.numero}`]));
        // Las notas referencian su documento desde la línea 2, con el CodRef del caso.
        expect(xml).toMatch(/<NroLinRef>2<\/NroLinRef>\n<TpoDocRef>33<\/TpoDocRef>\n<FolioRef>\d+<\/FolioRef>\n<FchRef>[^<]+<\/FchRef>\n<CodRef>2<\/CodRef>\n<RazonRef>CORRIGE GIRO DEL RECEPTOR<\/RazonRef>/);
        expect(xml).toMatch(/<CodRef>3<\/CodRef>\n<RazonRef>DEVOLUCION DE MERCADERIAS<\/RazonRef>/);
        expect(xml).toMatch(/<CodRef>1<\/CodRef>\n<RazonRef>ANULA FACTURA<\/RazonRef>/);
        expect(xml).toMatch(/<TpoDocRef>61<\/TpoDocRef>\n<FolioRef>\d+<\/FolioRef>\n<FchRef>[^<]+<\/FchRef>\n<CodRef>1<\/CodRef>/);
        // Glosas exactas, descuento por línea en % y monto, descuento global y exento.
        expect(Buffer.from(xml, 'latin1').toString('latin1')).toContain('<NmbItem>Cajón AFECTO</NmbItem>');
        expect(xml).toContain('<NmbItem>Pintura B&amp;W AFECTO</NmbItem>');
        expect(xml).toContain('<DescuentoPct>10</DescuentoPct>\n<DescuentoMonto>445837</DescuentoMonto>');
        expect(xml).toContain('<DscRcgGlobal>\n<NroLinDR>1</NroLinDR>\n<TpoMov>D</TpoMov>');
        expect(xml).toContain('<MntNeto>2894709</MntNeto>\n<MntExe>13666</MntExe>\n<TasaIVA>19</TasaIVA>\n<IVA>549995</IVA>');
        // Folios consecutivos del CAF de certificación de cada tipo.
        expect(await siguiente(33)).toBe(f33 + 4);
        expect(await siguiente(61)).toBe(f61 + 3);
        expect(await siguiente(56)).toBe(f56 + 1);
        // Un set enviado no se vuelve a enviar: el reintento es una fila nueva.
        await expect(enviarSet(await ctx(), s.id, receptores, emisorBase)).rejects.toThrow(/ya se envió/);

        sii.veredicto = 'ok';
        const aceptado = await consultarSet(await ctx(), s.id);
        expect(aceptado.estado).toBe('aceptado');
        expect(aceptado.respuesta?.porTipo?.map((t) => [t.tipo, t.aceptados])).toEqual([['33', 4], ['61', 3], ['56', 1]]);

        // Muestras impresas: cada caso en su PDF, con copia cedible en las facturas.
        const muestra = muestraDeCaso(aceptado, '4352553-4', 'PROVIDENCIA', { numero: 0, fecha: '2026-10-01' });
        expect(muestra.autoridad.totales).toEqual([
            { k: 'Descuento global 22% (ítems afectos)', v: '-$ 816.457' },
            { k: 'Monto neto', v: '$ 2.894.709' }, { k: 'Monto exento', v: '$ 13.666' }, { k: 'IVA (19%)', v: '$ 549.995' },
        ]);
        expect(muestra.autoridad.prueba).toBeUndefined();
        expect(muestra.autoridad.filas).toEqual(expect.arrayContaining([{ k: 'Set de pruebas', v: 'CASO 4352553-4' }]));
        const pdf = createInvoicePdf({ invoiceNumber: muestra.numero, countryCode: 'CL', currency: 'CLP', ...muestra, copiaCedible: true });
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        const nc = muestraDeCaso(aceptado, '4352553-6', 'PROVIDENCIA', { numero: 0, fecha: '2026-10-01' });
        expect(nc.autoridad.cedible).toBeUndefined();
    });

    it('con reparos o rechazos el set no está aprobado y el reintento usa folios nuevos', async () => {
        const [s] = (await cargarSet(ORG, SET, null)).sets;
        const primero = await enviarSet(await ctx(), s.id, receptores, emisorBase);
        sii.veredicto = 'reparo';
        const conReparos = await consultarSet(await ctx(), s.id);
        expect(conReparos.estado).toBe('reparos');
        expect(conReparos.errorMensaje).toMatch(/sin rechazos ni reparos/);
        const otro = await nuevoIntento(ORG, s.id, null);
        expect(otro.estado).toBe('cargado');
        const segundo = await enviarSet(await ctx(), otro.id, receptores, emisorBase);
        const folios = (x: typeof primero) => x.documentos!.map((d) => `${d.tipo}:${d.folio}`);
        expect(folios(segundo).some((f) => folios(primero).includes(f))).toBe(false);
    });

    it('solo en certificación', () => {
        expect(() => exigirCertificacion({ entorno: 'produccion' })).toThrow(/producción/);
    });
});

// ── Libros de ventas y de compras del set ────────────────────────────────────
describe('libros de ventas y de compras del set (IECV)', () => {
    // El archivo del SII completo (ISO-8859-1, CRLF): set básico, libros, guías, exportación y factura de compra.
    const ARCHIVO = readFileSync(new URL('../scripts/fixtures/sii/set-pruebas-basico.txt', import.meta.url), 'latin1');
    const PERIODO = HOY.slice(0, 7);
    const proveedores = {
        0: { rut: '78885550-8', razonSocial: 'Distribuidora del Sur Ltda.' },
        1: { rut: '96543210-8', razonSocial: 'Proveedor del Sur SpA' },
        2: { rut: '12345678-5', razonSocial: 'Servicios Maipo S.A.' },
        3: { rut: '78885550-8', razonSocial: 'Distribuidora del Sur Ltda.' },
        4: { rut: '11222333-9', razonSocial: null },
        5: { rut: '22333444-K', razonSocial: null },
        6: { rut: '96543210-8', razonSocial: 'Proveedor del Sur SpA' },
    };

    it('el archivo del SII trae los dos libros: el de compras con sus documentos, su IVA y el factor', async () => {
        const r = await cargarArchivoSet(ORG, ARCHIVO, null);
        expect(r.sets.map((s) => s.numeroAtencion)).toEqual(['4352553']);
        expect(r.libros.map((l) => [l.operacion, l.numeroAtencion, l.folioNotificacion, l.estado])).toEqual([['VENTA', '4352554', 1, 'cargado'], ['COMPRA', '4352555', 2, 'cargado']]);
        const compras = r.libros[1];
        expect(compras.filas.map((f) => [f.tpoDoc, f.folio, f.exento, f.afecto, f.tratamiento])).toEqual([
            [30, 234, 0, 21298, { tipo: 'credito' }],
            [33, 32, 8844, 6527, { tipo: 'credito' }],
            [30, 781, 0, 29785, { tipo: 'uso_comun' }],
            [60, 451, 0, 2719, { tipo: 'credito' }],
            [33, 67, 0, 10026, { tipo: 'no_recuperable', codigo: 4 }],
            [46, 9, 0, 9575, { tipo: 'retencion_total' }],
            [60, 211, 0, 4465, { tipo: 'credito' }],
        ]);
        expect(compras.filas.map((f) => f.modifica)).toEqual([null, null, null, 234, null, null, 32]);
        expect(compras.factorProporcionalidad).toBe(0.6);
        expect(r.noSoportados.map((n) => [n.numeroAtencion, n.motivo])).toEqual([['4352556', 'guia'], ['4352557', 'libro_guias'], ['4352558', 'exportacion'], ['4352560', 'compra']]);
        // Una observación que Cord no sabe registrar se rechaza al cargar.
        await expect(cargarArchivoSet(ORG, ARCHIVO.replace('ENTREGA GRATUITA DEL PROVEEDOR', 'COMPRA CON RETENCION PARCIAL DEL IVA'), null)).rejects.toThrow(/no sabe registrar/);
    });

    it('sin el set básico aceptado no se envía ningún libro', async () => {
        const ventas = (await listarLibros(ORG)).find((l) => l.operacion === 'VENTA')!;
        const { rows } = await m.db.query(`update fiscal_sii_sets set estado = 'reparos' where org_id = $1 and estado = 'aceptado' returning id`, [ORG]);
        try {
            await expect(enviarLibro(await ctx(), ventas.id, {})).rejects.toThrow(/aceptado el set básico/);
        } finally {
            for (const r of rows) await m.db.query(`update fiscal_sii_sets set estado = 'aceptado' where id = $1`, [r.id]);
        }
        expect(sii.uploads).toHaveLength(0);
        expect((await libroPorId(ORG, ventas.id))!.estado).toBe('cargado');
    });

    it('libro de ventas: los documentos del set aceptado, firmado y subido; el estado, como lo dice el SII', async () => {
        const [s] = (await cargarSet(ORG, SET, null)).sets;
        await enviarSet(await ctx(), s.id, receptores, emisorBase);
        const aceptado = await consultarSet(await ctx(), s.id);
        expect(aceptado.estado).toBe('aceptado');
        sii.uploads = [];
        const ventas = (await listarLibros(ORG)).find((l) => l.operacion === 'VENTA')!;
        const enviado = await enviarLibro(await ctx(), ventas.id, {});
        expect([enviado.estado, enviado.setId, enviado.periodo, enviado.trackId]).toEqual(['enviado', s.id, PERIODO, String(sii.track)]);
        expect(sii.uploads).toHaveLength(1);
        const xml = sii.uploads[0];
        expect(xml.split('\n')[0]).toBe('<?xml version="1.0" encoding="ISO-8859-1"?>');
        expect(xml.split('\n')[1]).toMatch(/^<LibroCompraVenta xmlns="http:\/\/www\.sii\.cl\/SiiDte" xmlns:xsi="[^"]+" xsi:schemaLocation="http:\/\/www\.sii\.cl\/SiiDte LibroCV_v10\.xsd" version="1\.0">$/);
        // Carátula del set (instrucciones, III.1): ESPECIAL, TOTAL, folio de notificación 1.
        expect(xml).toContain(`<RutEmisorLibro>${RUT}</RutEmisorLibro>\n<RutEnvia>${RUT_FIRMANTE}</RutEnvia>\n<PeriodoTributario>${PERIODO}</PeriodoTributario>\n<FchResol>2026-10-01</FchResol>\n<NroResol>0</NroResol>`);
        expect(xml).toContain('<TipoOperacion>VENTA</TipoOperacion>\n<TipoLibro>ESPECIAL</TipoLibro>\n<TipoEnvio>TOTAL</TipoEnvio>\n<FolioNotificacion>1</FolioNotificacion>');
        // Un detalle por documento del set, en orden; el resumen, por tipo de documento.
        const detalle = [...xml.matchAll(/<Detalle>\n<TpoDoc>(\d+)<\/TpoDoc>\n<NroDoc>(\d+)<\/NroDoc>/g)].map((x) => `${x[1]}:${x[2]}`);
        expect(detalle).toEqual(aceptado.documentos!.map((d) => `${d.tipo}:${d.folio}`));
        expect([...xml.matchAll(/<TotalesPeriodo>\n<TpoDoc>(\d+)<\/TpoDoc>\n<TotDoc>(\d+)<\/TotDoc>/g)].map((x) => `${x[1]}:${x[2]}`)).toEqual(['33:4', '56:1', '61:3']);
        expect(xml).toContain('<TotMntTotal>14273786</TotMntTotal>');
        // La nota de crédito que anula la factura del caso 3 dice qué anula (formato IECV, 2.4, campos 16 y 17).
        const anulada = aceptado.documentos!.find((d) => d.caso === '4352553-3')!;
        expect(xml).toContain(`<TpoDocRef>33</TpoDocRef>\n<FolioDocRef>${anulada.folio}</FolioDocRef>`);
        // Firma del <EnvioLibro> en el contexto del documento, con el certificado del negocio.
        const raiz = parsearFragmento(xml.replace(/^<\?xml[^>]*\?>\n/, ''));
        const firma = (raiz.c ?? []).find((h: any) => h.n === 'Signature') as any;
        expect(verificarFirmaRecibida(buscar(raiz, 'EnvioLibro')!, [raiz], firma, [raiz]).ok).toBe(true);
        expect((await xmlDelLibro(ORG, ventas.id))!.xml.trimEnd()).toBe(xml);
        await expect(enviarLibro(await ctx(), ventas.id, {})).rejects.toThrow(/ya se envió/);
        // Un libro firmado no cambia (trigger).
        await expect(m.db.query(`update fiscal_sii_libros set detalles = '[]'::jsonb where id = $1`, [ventas.id])).rejects.toThrow(/no se modifica/);

        // QueryEstUp: lo que su manual documenta se interpreta; lo demás se guarda tal cual.
        sii.estadoLibro = ['EPR', 'Envio Procesado'];
        expect((await consultarLibro(await ctx(), ventas.id)).estado).toBe('procesado');
        sii.estadoLibro = ['XYZ', 'Glosa que el manual no documenta'];
        const otro = await consultarLibro(await ctx(), ventas.id);
        expect([otro.estado, otro.respuesta]).toEqual(['respondido', { estado: 'XYZ', glosa: 'Glosa que el manual no documenta' }]);
        sii.estadoLibro = ['-11', ''];
        const sinRespuesta = await consultarLibro(await ctx(), ventas.id);
        expect([sinRespuesta.estado, sinRespuesta.errorMensaje]).toEqual(['enviado', 'El SII no pudo responder la consulta (estado -11). Reintenta en unos minutos.']);
        sii.estadoLibro = ['RCT', 'Rechazado por Error en Caratula'];
        const rechazado = await consultarLibro(await ctx(), ventas.id);
        expect(rechazado.estado).toBe('rechazado');
        expect(rechazado.errorMensaje).toMatch(/carátula/);
        const nuevo = await nuevoIntentoLibro(ORG, ventas.id, null);
        expect([nuevo.estado, nuevo.trackId, nuevo.tieneXml]).toEqual(['cargado', null, false]);
    });

    it('libro de compras: los documentos del set con su proveedor, IVA de uso común, no recuperable y retenido', async () => {
        const compras = (await listarLibros(ORG)).find((l) => l.operacion === 'COMPRA')!;
        // Instrucciones del set, IV.3: el emisor de cada documento, con RUT válido.
        await expect(enviarLibro(await ctx(), compras.id, { ...proveedores, 2: { rut: '12345678-9', razonSocial: 'X' } })).rejects.toThrow(/RUT válido/);
        // Formato IECV, 3.4, campo 12: razón social obligatoria en los documentos en papel.
        await expect(enviarLibro(await ctx(), compras.id, { ...proveedores, 0: { rut: '78885550-8', razonSocial: null } })).rejects.toThrow(/razón social/);
        expect(sii.uploads).toHaveLength(0);
        expect((await libroPorId(ORG, compras.id))!.estado).toBe('cargado');

        const enviado = await enviarLibro(await ctx(), compras.id, proveedores);
        expect([enviado.estado, enviado.periodo]).toEqual(['enviado', PERIODO]);
        const xml = sii.uploads[0];
        expect(xml).toContain('<TipoOperacion>COMPRA</TipoOperacion>\n<TipoLibro>ESPECIAL</TipoLibro>\n<TipoEnvio>TOTAL</TipoEnvio>\n<FolioNotificacion>2</FolioNotificacion>');
        expect(xml).toContain(`<PeriodoTributario>${PERIODO}</PeriodoTributario>`);
        expect([...xml.matchAll(/<Detalle>\n<TpoDoc>(\d+)<\/TpoDoc>\n<NroDoc>(\d+)<\/NroDoc>/g)].map((x) => `${x[1]}:${x[2]}`))
            .toEqual(['30:234', '33:32', '30:781', '60:451', '33:67', '46:9', '60:211']);
        expect(xml).toContain('<RUTDoc>78885550-8</RUTDoc>\n<RznSoc>Distribuidora del Sur Ltda.</RznSoc>\n<MntNeto>21298</MntNeto>\n<MntIVA>4047</MntIVA>\n<MntTotal>25345</MntTotal>');
        // IVA de uso común: fuera del IVA recuperable, con el factor y el crédito del período.
        expect(xml).toContain('<MntNeto>29785</MntNeto>\n<MntIVA>0</MntIVA>\n<IVAUsoComun>5659</IVAUsoComun>\n<MntTotal>35444</MntTotal>');
        expect(xml).toContain('<TotOpIVAUsoComun>1</TotOpIVAUsoComun>\n<TotIVAUsoComun>5659</TotIVAUsoComun>\n<FctProp>0.6</FctProp>\n<TotCredIVAUsoComun>3395</TotCredIVAUsoComun>');
        // Entrega gratuita: IVA no recuperable, código 4.
        expect(xml).toContain('<MntNeto>10026</MntNeto>\n<MntIVA>0</MntIVA>\n<IVANoRec>\n<CodIVANoRec>4</CodIVANoRec>\n<MntIVANoRec>1905</MntIVANoRec>\n</IVANoRec>\n<MntTotal>11931</MntTotal>');
        // Retención total del IVA: código 15 a la tasa del impuesto, y el total sin lo retenido.
        expect(xml).toContain('<MntNeto>9575</MntNeto>\n<MntIVA>1819</MntIVA>\n<OtrosImp>\n<CodImp>15</CodImp>\n<TasaImp>19</TasaImp>\n<MntImp>1819</MntImp>\n</OtrosImp>\n<MntTotal>9575</MntTotal>');
        expect(enviado.resumen!.map((t) => [t.tpoDoc, t.totDoc, t.totMntTotal])).toEqual([[30, 2, 60789], [33, 2, 28542], [46, 1, 9575], [60, 2, 8549]]);
        // El intento nuevo conserva los proveedores que el negocio escribió.
        const otro = await nuevoIntentoLibro(ORG, compras.id, null);
        expect([otro.estado, otro.proveedores['5']?.rut]).toEqual(['cargado', '22333444-K']);
        expect((await listarLibros(ORG)).find((l) => l.operacion === 'COMPRA')!.id).toBe(otro.id);
    });
});

// ── Intercambio ──────────────────────────────────────────────────────────────
const cafProveedor = parsearCaf(cafDePrueba({ rut: PROVEEDOR, tipo: 33, desde: 1, hasta: 50, fecha: HOY, llaves: llavesCaf() }).bytes, PROVEEDOR);
const folioProveedor = (n: number) => ({ folio: n, cafXml: cafProveedor.cafXml, llavePrivadaPem: cafProveedor.llavePrivadaPem, tipo: 33 as const, desde: 1, hasta: 50, fechaAutorizacion: HOY });
function dteDelProveedor(folio: number, rutReceptor = RUT) {
    const b = armarBorrador({
        emisor: { rut: PROVEEDOR, razonSocial: 'Proveedor del Sur SpA', giro: 'Venta de insumos', acteco: [469000], direccion: 'Calle 2', comuna: 'Temuco' },
        receptor: { rut: rutReceptor, razonSocial: 'Empresa de Prueba SpA', giro: 'Servicios', direccion: 'Av. Providencia 1234', comuna: 'Providencia' },
        fechaEmision: HOY,
        lineas: [{ description: 'Resmas de papel', quantity: 10, unitPrice: 3_000, taxRate: 0.19, subtotal: 30_000, taxAmount: 5_700, total: 35_700 }] as any,
        totales: { subtotal: 30_000, taxes: 5_700, total: 35_700, currency: 'CLP' },
    });
    return emitirDocumento(b, folioProveedor(folio), proveedor, { rutEmisor: PROVEEDOR, rutEnvia: '9876543-3', resolucion: { numero: 80, fecha: '2014-08-22' } }, new Date());
}
const envioProveedor = (dtes: { tipo: 33; nodo: any }[], rutReceptor = RUT, ahora = new Date()) =>
    Buffer.from(armarEnvio(dtes, { rutEmisor: PROVEEDOR, rutEnvia: '9876543-3', rutReceptor, resolucion: { numero: 80, fecha: '2014-08-22' } }, ahora, proveedor), 'latin1');

/** La firma de una respuesta verifica con el certificado del negocio, en el contexto del documento. */
function firmaRespuesta(xml: string, objetivo: string) {
    const raiz = parsearFragmento(xml.replace(/^<\?xml[^>]*\?>\n/, ''));
    const nodo = buscar(raiz, objetivo)!;
    const firma = (raiz.c ?? []).find((h: any) => h.n === 'Signature') as any;
    return verificarFirmaRecibida(nodo, [raiz], firma, [raiz]).ok
        && textoDe(buscar(firma, 'X509Certificate')).replace(/\s+/g, '') === negocio.certPem.replace(/-----[^-]+-----|\s+/g, '');
}

describe('intercambio: recepción', () => {
    it('acusa recibo de un envío válido, firmado por el negocio, a la casilla del SII en certificación', async () => {
        const d = dteDelProveedor(11);
        const r = await recibirEnvio(ORG, { bytes: envioProveedor([{ tipo: 33, nodo: parsearFragmento(d.dteXml) }]), nombreArchivo: 'EnvioDTE_prov.xml', origen: 'manual' });
        expect(r).toMatchObject({ repetido: false, estado: 0, documentos: 1, respondido: true, enviado: true });
        expect(m.correos).toHaveLength(1);
        expect(m.correos[0]).toMatchObject({ to: 'SII_dte_intercambio@sii.cl', operation: 'sii_intercambio' });
        expect(m.correos[0].attachments).toHaveLength(1);
        const xml = Buffer.from(m.correos[0].attachments[0].content).toString('latin1');
        expect(xml.split('\n')[1]).toMatch(/^<RespuestaDTE xmlns="http:\/\/www\.sii\.cl\/SiiDte" xmlns:xsi="[^"]+" xsi:schemaLocation="http:\/\/www\.sii\.cl\/SiiDte RespuestaEnvioDTE_v10\.xsd" version="1\.0">$/);
        expect(xml).toContain(`<RutResponde>${RUT}</RutResponde>\n<RutRecibe>${PROVEEDOR}</RutRecibe>`);
        expect(xml).toContain('<EstadoRecepEnv>0</EstadoRecepEnv>\n<RecepEnvGlosa>Envío Recibido Conforme</RecepEnvGlosa>');
        expect(xml).toContain('<EstadoRecepDTE>0</EstadoRecepDTE>');
        expect(xml).not.toContain('<ResultadoDTE>');
        expect(firmaRespuesta(xml, 'Resultado')).toBe(true);

        // El mismo archivo otra vez: nada nuevo, nada reenviado.
        const otra = await recibirEnvio(ORG, { bytes: envioProveedor([{ tipo: 33, nodo: parsearFragmento(d.dteXml) }], RUT, new Date(Date.now() + 60_000)), nombreArchivo: 'x.xml', origen: 'correo', remitente: 'dte@proveedor.cl' });
        expect(otra.repetido).toBe(false); // otro sobre (otra firma y hora): otro archivo…
        expect((await listarRecepciones(ORG))[0].documentos[0]).toMatchObject({ estado: 4, glosa: 'DTE No Recibido - DTE Repetido' }); // …pero el mismo DTE
    });

    it('el mismo archivo dos veces no se procesa ni se responde dos veces', async () => {
        const bytes = envioProveedor([{ tipo: 33, nodo: parsearFragmento(dteDelProveedor(12).dteXml) }]);
        await recibirEnvio(ORG, { bytes, nombreArchivo: 'a.xml', origen: 'correo', remitente: 'dte@proveedor.cl' });
        const correos = m.correos.length;
        const r = await recibirEnvio(ORG, { bytes, nombreArchivo: 'a.xml', origen: 'correo', remitente: 'dte@proveedor.cl' });
        expect(r).toMatchObject({ repetido: true, respondido: true });
        expect(m.correos).toHaveLength(correos);
    });

    it('rechaza lo ilegible, lo que no es un envío, la firma alterada y otro receptor', async () => {
        expect((await recibirEnvio(ORG, { bytes: Buffer.from('no es xml <'), nombreArchivo: 'x.xml', origen: 'manual' })).estado).toBe(91);
        expect((await recibirEnvio(ORG, { bytes: Buffer.from('<?xml version="1.0"?><Otra/>'), nombreArchivo: 'x.xml', origen: 'manual' })).estado).toBe(1);
        const valido = envioProveedor([{ tipo: 33, nodo: parsearFragmento(dteDelProveedor(13).dteXml) }]).toString('latin1');
        expect((await recibirEnvio(ORG, { bytes: Buffer.from(valido.replace('<MntTotal>35700</MntTotal>', '<MntTotal>35701</MntTotal>'), 'latin1'), nombreArchivo: 'x.xml', origen: 'manual' })).estado).toBe(2);
        // El DTE alterado DENTRO de un sobre bien firmado: el sobre se recibe, el documento no.
        const alterado = dteDelProveedor(14).dteXml.replace('<MntTotal>35700</MntTotal>', '<MntTotal>35701</MntTotal>');
        const r = await recibirEnvio(ORG, { bytes: envioProveedor([{ tipo: 33, nodo: parsearFragmento(alterado) }]), nombreArchivo: 'x.xml', origen: 'manual' });
        expect(r.estado).toBe(0);
        expect((await listarRecepciones(ORG))[0].documentos[0]).toMatchObject({ estado: 1, glosa: 'DTE No Recibido - Error de Firma' });
        const ajeno = await recibirEnvio(ORG, { bytes: envioProveedor([{ tipo: 33, nodo: parsearFragmento(dteDelProveedor(15, '77777777-7').dteXml) }], '77777777-7'), nombreArchivo: 'x.xml', origen: 'manual' });
        expect(ajeno.estado).toBe(3);
    });
});

describe('intercambio: aceptación, rechazo y registro en el SII', () => {
    async function recibido(folio: number) {
        await recibirEnvio(ORG, { bytes: envioProveedor([{ tipo: 33, nodo: parsearFragmento(dteDelProveedor(folio).dteXml) }]), nombreArchivo: `f${folio}.xml`, origen: 'correo', remitente: 'dte@proveedor.cl' });
        const rec = (await listarRecepciones(ORG))[0];
        return { recepcion: rec.id, dte: rec.documentos[0].id };
    }

    it('aceptar con recinto: resultado, recibo (Ley 19.983) y ACD + ERM en el SII con el token', async () => {
        const { recepcion, dte } = await recibido(21);
        m.correos = [];
        const r = await decidirDocumentos(ORG, recepcion, [{ dteId: dte, resultado: 'aceptado', recinto: 'Bodega central, Providencia' }]);
        expect(r).toMatchObject({ decididos: 1, respuestaEnviada: true, recibosEnviados: true });
        expect(r.registroSii.map((x) => [x.accion, x.registrado])).toEqual([['ACD', true], ['ERM', true]]);
        expect(sii.reclamos.map((x) => [x.accion, x.tipo, x.folio, x.rut])).toEqual([['ACD', '33', '21', PROVEEDOR], ['ERM', '33', '21', PROVEEDOR]]);
        expect(sii.reclamos.every((x) => x.cookie === `TOKEN=${sii.tokenValido}`)).toBe(true);
        // Dos correos, uno por archivo, al SII en certificación.
        expect(m.correos.map((c) => [c.to, c.attachments.length, c.attachments[0].filename.split('_')[0]])).toEqual([
            ['SII_dte_intercambio@sii.cl', 1, 'RespuestaResultado'], ['SII_dte_intercambio@sii.cl', 1, 'EnvioRecibos'],
        ]);
        const resultado = Buffer.from(m.correos[0].attachments[0].content).toString('latin1');
        expect(resultado).toContain('<EstadoDTE>0</EstadoDTE>\n<EstadoDTEGlosa>ACEPTADO OK</EstadoDTEGlosa>');
        expect(resultado).not.toContain('<RecepcionEnvio>');
        expect(firmaRespuesta(resultado, 'Resultado')).toBe(true);
        const recibos = Buffer.from(m.correos[1].attachments[0].content).toString('latin1');
        expect(recibos).toContain('<Recinto>Bodega central, Providencia</Recinto>');
        expect(recibos).toContain(`<RutFirma>${RUT_FIRMANTE}</RutFirma>`);
        expect(recibos).toContain('<Declaracion>El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 de la Ley 19.983, acredita que la entrega de mercaderias o servicio(s) prestado(s) ha(n) sido recibido(s).</Declaracion>');
        expect(firmaRespuesta(recibos, 'SetRecibos')).toBe(true);
        const [fila] = (await m.db.query('select resultado, recibo_at, reclamo_accion, reclamo_codigo from fiscal_sii_dte_recibidos where id = $1', [dte])).rows;
        expect(fila).toMatchObject({ resultado: 'aceptado', reclamo_accion: 'ERM', reclamo_codigo: 0 });
        expect(fila.recibo_at).not.toBeNull();
        // Una decisión no se cambia: ni por la aplicación ni en la base.
        await expect(decidirDocumentos(ORG, recepcion, [{ dteId: dte, resultado: 'rechazado', motivo: 'x' }])).rejects.toThrow(/ya tienen una decisión/);
        await expect(m.db.query(`update fiscal_sii_dte_recibidos set resultado = 'rechazado' where id = $1`, [dte])).rejects.toThrow(/no cambia/);
        await expect(m.db.query(`update fiscal_sii_dte_recibidos set monto_total = 1 where id = $1`, [dte])).rejects.toThrow(/no se modifica/);
        const descarga = await xmlRespuesta(ORG, (await listarRecepciones(ORG))[0].respuestas[0].id);
        expect(descarga?.nombre).toMatch(/^RespuestaRecepcion_\d+\.xml$/);
    });

    it('rechazar exige el motivo, responde RECHAZADO y reclama en el SII (falta total)', async () => {
        const { recepcion, dte } = await recibido(22);
        await expect(decidirDocumentos(ORG, recepcion, [{ dteId: dte, resultado: 'rechazado' }])).rejects.toThrow(/motivo/);
        m.correos = [];
        const r = await decidirDocumentos(ORG, recepcion, [{ dteId: dte, resultado: 'rechazado', motivo: 'Mercadería no recibida', reclamo: 'RFT' }]);
        expect(r.recibosEnviados).toBe(false);
        expect(r.registroSii.map((x) => x.accion)).toEqual(['RFT']);
        const xml = Buffer.from(m.correos[0].attachments[0].content).toString('latin1');
        expect(xml).toContain('<EstadoDTE>2</EstadoDTE>\n<EstadoDTEGlosa>RECHAZADO: Mercadería no recibida</EstadoDTEGlosa>');
    });

    it('el SII se niega pasados los 8 días: queda dicho y la respuesta al emisor igual sale', async () => {
        const { recepcion, dte } = await recibido(23);
        sii.codReclamo = 8;
        const r = await decidirDocumentos(ORG, recepcion, [{ dteId: dte, resultado: 'aceptado' }]);
        expect(r.respuestaEnviada).toBe(true);
        expect(r.registroSii).toEqual([expect.objectContaining({ accion: 'ACD', registrado: false, mensaje: expect.stringMatching(/8 días/) })]);
        expect(r.registroSii[0].mensaje).not.toMatch(/codResp|ACD|SOAP/);
    });
});

describe('casilla de intercambio y aislamiento', () => {
    it('la casilla existe solo con el correo entrante configurado y resuelve su organización', async () => {
        delete process.env.SII_INTERCAMBIO_DOMINIO;
        expect(await casillaIntercambio(ORG)).toBeNull();
        process.env.SII_INTERCAMBIO_DOMINIO = 'dte.cordhq.app';
        process.env.INBOUND_EMAIL_SECRET = 'secreto-de-prueba';
        try {
            const dir = await casillaIntercambio(ORG);
            expect(dir).toMatch(/^dte-[a-f0-9]{30}@dte\.cordhq\.app$/);
            expect(await casillaIntercambio(ORG)).toBe(dir);
            expect(await orgDeCasilla(dir!)).toBe(ORG);
            expect(await orgDeCasilla(dir!.replace('dte.cordhq.app', 'otro.cl'))).toBeNull();
            expect(await orgDeCasilla('dte-000000000000000000000000000000@dte.cordhq.app')).toBeNull();

            // El webhook: sin el secreto no entra; con él, el adjunto se recibe en la organización de la casilla.
            const { POST } = await import('../src/pages/api/webhooks/sii-intercambio');
            const xml = envioProveedor([{ tipo: 33, nodo: parsearFragmento(dteDelProveedor(31).dteXml) }]);
            const cuerpo = JSON.stringify({ to: `Empresa <${dir}>`, from: 'Proveedor <dte@proveedor.cl>', attachments: [{ filename: 'EnvioDTE.xml', content: xml.toString('base64') }] });
            const pedir = (headers: Record<string, string>) => POST({ request: new Request('https://cordhq.app/api/webhooks/sii-intercambio', { method: 'POST', headers, body: cuerpo }) } as any);
            expect((await pedir({ authorization: 'Bearer otro' })).status).toBe(401);
            const ts = String(Math.floor(Date.now() / 1000));
            const firma = createHmac('sha256', 'secreto-de-prueba').update(`${ts}.${cuerpo}`).digest('hex');
            expect((await pedir({ authorization: 'Bearer secreto-de-prueba', 'x-cord-timestamp': ts, 'x-cord-signature': 'sha256=00' })).status).toBe(401);
            const ok = await pedir({ authorization: 'Bearer secreto-de-prueba', 'x-cord-timestamp': ts, 'x-cord-signature': `sha256=${firma}` });
            expect(ok.status).toBe(200);
            expect(await ok.json()).toMatchObject({ ok: true, recibidos: 1, resultados: [{ estado: 0, documentos: 1 }] });
            expect((await listarRecepciones(ORG))[0]).toMatchObject({ origen: 'correo', remitente: 'dte@proveedor.cl' });
        } finally {
            delete process.env.SII_INTERCAMBIO_DOMINIO;
            delete process.env.INBOUND_EMAIL_SECRET;
        }
    });

    it('una organización no ve lo recibido, las respuestas ni los sets de otra (RLS con el rol de aplicación)', async () => {
        const ver = (org: string, tabla: string) => m.db.transaction(async (t: any) => {
            await t.query('set local role cord_app');
            await t.query("select set_config('app.org_id', $1, true)", [org]);
            return Number((await t.query(`select count(*)::int as n from ${tabla}`)).rows[0].n);
        });
        for (const tabla of ['fiscal_sii_recepciones', 'fiscal_sii_dte_recibidos', 'fiscal_sii_respuestas', 'fiscal_sii_sets', 'fiscal_sii_libros']) {
            expect(await ver(ORG, tabla), tabla).toBeGreaterThan(0);
            expect(await ver(ORG2, tabla), tabla).toBe(0);
        }
        const forzadas = (await m.db.query(`select relname from pg_class where relname like 'fiscal_sii_%' and relrowsecurity and relforcerowsecurity order by 1`)).rows.map((r: any) => r.relname);
        expect(forzadas).toEqual(['fiscal_sii_buzones', 'fiscal_sii_cafs', 'fiscal_sii_dte_recibidos', 'fiscal_sii_libros', 'fiscal_sii_recepciones', 'fiscal_sii_respuestas', 'fiscal_sii_sets']);
    });
});

