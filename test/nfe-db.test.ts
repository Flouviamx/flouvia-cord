// NF-e modelo 55 contra Postgres real (PGlite) con las secciones "Rieles
// fiscales de LatAm" y "NF-e" de db/schema.sql tal cual, y una SEFAZ simulada
// (scripts/lib/nfe-simulada.mjs, cuyos retornos valida scripts/nfe-check.mjs
// contra los XSD oficiales): autorización síncrona y asíncrona, rechazo con
// reutilización del número, denegación, respuesta perdida y su recuperación
// por consulta de la chave, número tomado por otra chave (539), contingencia
// SVC, cancelación, Carta de Correção, inutilização, el outbox del cron, el
// certificado de la NFS-e reutilizado, numeración concurrente y RLS.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import forge from 'node-forge';
import { sefazSimulada } from '../scripts/lib/nfe-simulada.mjs';

const m = vi.hoisted(() => ({ db: null as any, finalize: vi.fn(), sefaz: null as any }));

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
vi.mock('../src/lib/fiscal/latam/nfe/soap', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/lib/fiscal/latam/nfe/soap')>();
    return { ...real, chamarSefaz: (...args: unknown[]) => m.sefaz(...args) };
});

const ORG = '00000000-0000-4000-8000-0000000000d1';
const ORG2 = '00000000-0000-4000-8000-0000000000d2';
const CNPJ = '16727230000197';
const CNPJ_CLIENTE = '11222333000181';
const CLIENTE = '00000000-0000-4000-8000-00000000c11e';
const CLIENTE_OUTRO_UF = '00000000-0000-4000-8000-00000000c12e';
const PRODUTO = '00000000-0000-4000-8000-0000000000a1';
const SERVICO = '00000000-0000-4000-8000-0000000000a2';

process.env.NFE_ENABLED = 'true';
process.env.NFE_ENTORNO = 'homologacion';
process.env.NFSE_ENABLED = 'true';
process.env.NFSE_ENTORNO = 'homologacion';
delete process.env.NFE_RESP_TEC_CNPJ;

const { BrazilNfeProvider } = await import('../src/lib/fiscal/providers/BrazilNfeProvider');
const { NfeTransporteError } = await import('../src/lib/fiscal/latam/nfe/soap');
const { parsearCertificado } = await import('../src/lib/fiscal/latam/certificado');
const { guardarCredencial, guardarAjustes } = await import('../src/lib/fiscal/latam/credenciales');
const { estadoNfe } = await import('../src/lib/fiscal/latam/nfe/estado');
const { railListo } = await import('../src/lib/fiscal/latam/estado');
const { orgsConPendientes, resolverPendientesDeOrg } = await import('../src/lib/fiscal/latam/resolucion');
const { representacionDe } = await import('../src/lib/fiscal/latam/representacion');
const { cancelarNfe, registrarCce, inutilizarFaixa, numerosSemUso, eventosDaNota } = await import('../src/lib/fiscal/latam/nfe/eventos');
const { conDatosNfe, tipoDocumentoBrasil, MSG_MIXTA } = await import('../src/lib/fiscal/latam/nfe/enrutamiento');
const { FiscalFactory } = await import('../src/lib/fiscal/FiscalFactory');
const { createInvoicePdf } = await import('../src/lib/fiscal/invoice-pdf');
const provider = new BrazilNfeProvider();

// ── Certificado ICP-Brasil simulado (otherName 2.16.76.1.3.3 = CNPJ) ─────────
function certificado(cnpj: string) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '0d';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: `EMPRESA:${cnpj}` }]);
    cert.setIssuer([{ name: 'commonName', value: 'AC Teste' }]);
    const asn1 = forge.asn1;
    const otherName = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('2.16.76.1.3.3').getBytes()),
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, cnpj)]),
    ]);
    cert.setExtensions([{ id: '2.5.29.17', value: asn1.toDer(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [otherName])).getBytes() }]);
    cert.sign(key, forge.md.sha256.create());
    return { certPem: forge.pki.certificateToPem(cert), keyPem };
}

// ── SEFAZ simulada ───────────────────────────────────────────────────────────
type Plano = { tipo?: 'ok' | 'perdida' | 'sin_conexion' | 'paralisado' | 'async'; forzado?: { cStat: string; xMotivo?: string } };
let sim = sefazSimulada();
const sefaz = {
    plan: [] as Plano[],
    status: {} as Record<string, string>,
    consultaCaida: false,
    /** La próxima inutilização llega a la SEFAZ pero su respuesta se pierde. */
    inutPerdida: false,
    llamadas: [] as { autorizador: string; servico: string; mensagem: string }[],
};

async function fakeSefaz(_entorno: string, autorizador: string, servico: string, mensagem: string, credencial: { certPem: string }) {
    expect(credencial.certPem).toMatch(/BEGIN CERTIFICATE/);
    sefaz.llamadas.push({ autorizador, servico, mensagem });
    const ok = (resultado: string) => ({ status: 200, resultado, cuerpo: resultado });
    switch (servico) {
        case 'NFeAutorizacao': {
            const p = sefaz.plan.shift() ?? {};
            if (p.tipo === 'sin_conexion') throw new NfeTransporteError('ECONNREFUSED', false);
            if (p.tipo === 'paralisado') return ok(sim.autorizacao(mensagem, { lote: ['108', 'Serviço Paralisado Momentaneamente (curto prazo)'] }));
            const r = sim.autorizacao(mensagem, { forzado: p.forzado, async: p.tipo === 'async' });
            if (p.tipo === 'perdida') throw new NfeTransporteError('socket hang up', true);
            return ok(r);
        }
        case 'NFeRetAutorizacao': return ok(sim.consReci(mensagem));
        case 'NfeConsultaProtocolo':
            if (sefaz.consultaCaida) throw new NfeTransporteError('timeout', true);
            return ok(sim.consulta(mensagem));
        case 'NfeStatusServico': return ok(sim.status(mensagem, sefaz.status[autorizador] ?? '107'));
        case 'RecepcaoEvento': return ok(sim.evento(mensagem));
        case 'NfeInutilizacao': {
            const r = sim.inutilizacao(mensagem);
            if (sefaz.inutPerdida) { sefaz.inutPerdida = false; throw new NfeTransporteError('socket hang up', true); }
            return ok(r);
        }
        default: throw new Error(`servicio no simulado: ${servico}`);
    }
}
/** Contenido de las páginas del PDF, descomprimido (los streams van con FlateDecode). */
function textoDoPdf(pdf: Buffer): string {
    const s = pdf.toString('latin1');
    let out = '';
    for (const mm of s.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        try { out += inflateSync(Buffer.from(mm[1], 'latin1')).toString('latin1'); } catch { out += mm[1]; }
    }
    return out;
}
const autorizaciones = () => sefaz.llamadas.filter((l) => l.servico === 'NFeAutorizacao');
const tag = (xml: string, nome: string) => new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml)?.[1] ?? '';

// ── Base ─────────────────────────────────────────────────────────────────────
function seccion(desde: string, hasta: string): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf(desde);
    const fin = schema.indexOf(hasta, inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(inicio);
    return schema.slice(inicio, fin);
}

const AJUSTES = {
    serie: 1, crt: 3, ie: '123456789012', logradouro: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', municipio: '3550308',
    cep: '01310100', telefone: '1133334444', natOp: 'Venda de mercadoria', indPres: '2', modFrete: '9',
    pis: { cst: '01', aliquota: 1.65 }, cofins: { cst: '01', aliquota: 7.6 }, infCpl: 'Pedido de venda via Cord',
};
const PRODUTO_NFE = { ncm: '73181500', cfop: '5102', origem: '0', unidade: 'UN', aliquotaIcms: 18, aliquotaIpi: 5, cClassTrib: '000001', codigo: 'PAR-M8' };
const CLIENTE_NFE = { numero: '45', bairro: 'Itaim Bibi', municipio: '3550308', indIEDest: '1', ie: '987654321', consumidorFinal: false };

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create role cord_app;
        create table orgs(id uuid primary key, country_code text, rfc text, fiscal_metadata jsonb);
        create table clientes(id uuid primary key, org_id uuid not null references orgs(id) on delete cascade,
            empresa text, rfc text, email text, telefono text, country_code text, direccion_line1 text, direccion_line2 text, cp_fiscal text);
        create table productos(id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, sku text, nombre text);
        create table documentos_fiscales(
            id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, cliente_id uuid,
            credit_note_of uuid, service_date date, service_date_end date, due_date date, status text not null default 'error',
            provider_document_id text, provider_data jsonb, updated_at timestamptz);
        create table impuestos(id uuid primary key, org_id uuid not null references orgs(id) on delete cascade,
            nombre text not null, tasa numeric not null, kind text not null default 'consumo', activo boolean not null default true);
        insert into orgs values ('${ORG}', 'BR', null, '{"tax_id":"16.727.230/0001-97"}'), ('${ORG2}', 'BR', null, '{}');
        grant select, insert, update, delete on all tables in schema public to cord_app;`);
    await m.db.exec(seccion('-- ── Rieles fiscales de LatAm', '-- END rieles-latam'));
    await m.db.exec(seccion('-- ── NF-e modelo 55', '-- END nfe'));
    await m.db.exec(`
        insert into clientes values
          ('${CLIENTE}', '${ORG}', 'Cliente Comprador Ltda', '11.222.333/0001-81', 'compras@cliente.com.br', '+55 11 98888-7777', 'BR', 'Rua das Flores', 'Sala 2', '04538-133'),
          ('${CLIENTE_OUTRO_UF}', '${ORG}', 'Cliente Carioca Ltda', '04.252.011/0001-10', null, null, 'BR', 'Rua do Ouvidor', null, '20040-030');
        update clientes set nfe = '${JSON.stringify(CLIENTE_NFE)}' where id = '${CLIENTE}';
        update clientes set nfe = '${JSON.stringify({ ...CLIENTE_NFE, municipio: '3304557', ie: '86123456' })}' where id = '${CLIENTE_OUTRO_UF}';
        insert into productos (id, org_id, sku, nombre, nfe) values
          ('${PRODUTO}', '${ORG}', 'PAR-M8', 'Parafuso', '${JSON.stringify(PRODUTO_NFE)}'),
          ('${SERVICO}', '${ORG}', null, 'Instalação', null);`);
    // El certificado subido para la NFS-e (mismo CNPJ) sirve a la NF-e.
    const { certPem, keyPem } = certificado(CNPJ);
    await guardarCredencial(ORG, 'nfse', 'homologacion', parsearCertificado({ certificado: certPem, llave: keyPem }), { identificador: CNPJ, nombreArchivo: 'empresa.pfx', subidoPor: null });
    await guardarAjustes(ORG, 'nfe', AJUSTES);
}, 30_000);

afterAll(async () => {
    await m.db?.close();
});

beforeEach(() => {
    m.sefaz = vi.fn(fakeSefaz);
    sefaz.plan = [];
    sefaz.status = {};
    sefaz.consultaCaida = false;
    sefaz.llamadas = [];
    m.finalize.mockReset();
});

let seq = 0;
async function nuevoDocumento(opts: { org?: string; cliente?: string } = {}) {
    const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
    await m.db.query('insert into documentos_fiscales (id, org_id, cliente_id) values ($1, $2, $3)', [id, opts.org ?? ORG, opts.cliente ?? CLIENTE]);
    return id;
}

/** Documento de 3 parafusos a R$ 33,33 con R$ 10 de descuento y IPI 5 %: total R$ 94,50. */
function request(documentId: string, over: Record<string, unknown> = {}) {
    return {
        documentId, invoiceNumber: `FAC-${seq}`, idempotencyKey: `k-${documentId}`, orgId: ORG, quoteId: documentId,
        countryCode: 'BR', documentType: 'nfe_invoice',
        issuer: { legalName: 'Loja Exemplo Comércio de Peças Ltda', taxId: '16.727.230/0001-97', address: { countryCode: 'BR' } },
        recipient: { legalName: 'Cliente Comprador Ltda', taxId: '11.222.333/0001-81', address: { countryCode: 'BR' } },
        lines: [{ description: 'Parafuso sextavado M8', quantity: 3, unitPrice: 30, taxRate: 0.05, subtotal: 90, taxAmount: 4.5, total: 94.5, discount: 10, nfe: PRODUTO_NFE }],
        totals: { subtotal: 90, taxes: 4.5, total: 94.5, currency: 'BRL', discountTotal: 10 },
        issuedAt: new Date().toISOString(), ...over,
    } as any;
}

const intentos = async (doc: string) => (await m.db.query(
    'select id, estado, serie, tipo, numero, autorizacion, error_codigo, error_mensaje, respuesta, solicitud from fiscal_rail_comprobantes where documento_id = $1 order by created_at, numero', [doc])).rows;
const envejecer = () => m.db.exec(`alter table fiscal_rail_comprobantes disable trigger trg_fiscal_rail_comprobante_inmutable;
    update fiscal_rail_comprobantes set created_at = now() - interval '20 minutes', enviado_at = now() - interval '20 minutes' where estado in ('pendiente', 'incierto');
    alter table fiscal_rail_comprobantes enable trigger trg_fiscal_rail_comprobante_inmutable;`);

// ── Pruebas ──────────────────────────────────────────────────────────────────
describe('estado del riel', () => {
    it('reutiliza el certificado de la NFS-e del mismo CNPJ y dice qué falta en códigos', async () => {
        const e = await estadoNfe(ORG);
        expect(e).toMatchObject({ habilitado: true, entorno: 'homologacion', faltantes: [], listo: true, origenCredencial: 'nfse', contingencia: null });
        expect(e.municipio).toEqual({ codigo: '3550308', uf: 'SP', nome: 'São Paulo' });
        expect(JSON.stringify(e)).not.toMatch(/BEGIN|PRIVATE/);
        expect((await estadoNfe(ORG2)).faltantes).toEqual(['documento', 'serie', 'crt', 'ie', 'endereco', 'municipio', 'cep', 'pis_cofins', 'certificado']);
        expect(await railListo(ORG, 'nfe')).toBe(true);
    });

    it('el responsable técnico es obligatorio en los estados que lo exigen', async () => {
        await guardarAjustes(ORG2, 'nfe', { ...AJUSTES, municipio: '4106902' });
        expect((await estadoNfe(ORG2)).faltantes).toContain('responsavel_tecnico');
    });

    it('FiscalFactory: nfe_* va a la NF-e y lo demás de Brasil a la NFS-e', () => {
        expect(FiscalFactory.getProvider('BR', 'nfe_invoice').constructor.name).toBe('BrazilNfeProvider');
        expect(FiscalFactory.getProvider('BR', 'nfse_invoice').constructor.name).toBe('BrazilNfseProvider');
        expect(FiscalFactory.getProvider('BR').constructor.name).toBe('BrazilNfseProvider');
    });

    it('con el riel apagado un documento nfe_* no degrada en silencio', async () => {
        process.env.NFE_ENABLED = 'false';
        try {
            expect(await railListo(ORG, 'nfe')).toBe(false);
            await expect(provider.issueDocument(request(await nuevoDocumento()))).rejects.toThrow(/no está activa/);
            expect(sefaz.llamadas).toHaveLength(0);
        } finally {
            process.env.NFE_ENABLED = 'true';
        }
    });
});

describe('enrutamiento NFS-e / NF-e', () => {
    it('congela los datos del producto en la línea y elige el documento por los conceptos', async () => {
        const base = { description: 'x', quantity: 1, unitPrice: 10, taxRate: 0, subtotal: 10, taxAmount: 0, total: 10 };
        const lines = await conDatosNfe(ORG, 'BR', [PRODUTO, SERVICO, null], [base, base, base]);
        expect(lines[0].nfe).toMatchObject({ ncm: '73181500', cfop: '5102', codigo: 'PAR-M8' });
        expect(lines[1].nfe).toBeUndefined();
        expect(await tipoDocumentoBrasil(ORG, 'nfse_invoice', [lines[0]])).toEqual({ ok: true, docType: 'nfe_invoice' });
        expect(await tipoDocumentoBrasil(ORG, 'nfse_invoice', lines)).toEqual({ ok: false, error: MSG_MIXTA });
        expect(await tipoDocumentoBrasil(ORG, 'nfse_invoice', [lines[1]])).toEqual({ ok: true, docType: 'proforma' });
        expect((await tipoDocumentoBrasil(ORG, 'nfse_invoice', [lines[1]], 'fiscal')).ok).toBe(false);
        expect(await tipoDocumentoBrasil(ORG, 'commercial_invoice', lines)).toEqual({ ok: true, docType: 'commercial_invoice' });
        // Sin la NF-e encendida nada cambia: ni las líneas ni el tipo.
        process.env.NFE_ENABLED = 'false';
        try {
            expect((await conDatosNfe(ORG, 'BR', [PRODUTO], [base]))[0].nfe).toBeUndefined();
            expect(await tipoDocumentoBrasil(ORG, 'nfse_invoice', [lines[0]])).toEqual({ ok: true, docType: 'nfse_invoice' });
        } finally {
            process.env.NFE_ENABLED = 'true';
        }
    });
});

describe('emisión', () => {
    it('NF-e autorizada: chave, protocolo, nfeProc, DANFE y replay idempotente', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(r.provider).toBe('nfe');
        expect(r.fiscalId).toMatch(/^35\d{4}16727230000197550010000000011\d{9}$/);
        expect(r.invoiceNumber).toBe('H-NFE-1-1');
        expect(r.rawProviderData).toMatchObject({ regulatory_status: 'nfe', livemode: false, simulado: true });
        const rep = representacionDe(r.rawProviderData)!;
        expect(rep.titulo).toBe('DANFE');
        expect(rep.prueba).toBe(true);
        expect(rep.danfe?.chave).toBe(r.fiscalId);
        expect(rep.danfe?.totais).toMatchObject({ vProd: '100.00', vDesc: '10.00', vIPI: '4.50', vNF: '94.50' });

        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'autorizado', serie: '1', tipo: 'NFE', numero: 1, autorizacion: r.fiscalId });
        expect(i.respuesta.prot).toMatchObject({ cStat: '100', chNFe: r.fiscalId });
        expect(i.respuesta.nfeProc).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?><nfeProc xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe" versao="4\.00"><NFe /);
        expect(i.respuesta.nfeProc).toContain('<protNFe versao="4.00">');

        // Lo que viajó: lote síncrono de una nota, homologación, totales al centavo.
        const env = autorizaciones()[0];
        expect(env.autorizador).toBe('SP');
        expect(tag(env.mensagem, 'indSinc')).toBe('1');
        expect(env.mensagem).toContain('<dest><CNPJ>11222333000181</CNPJ><xNome>NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</xNome>');
        expect([tag(env.mensagem, 'vProd'), tag(env.mensagem, 'vDesc'), tag(env.mensagem, 'vIPI'), tag(env.mensagem, 'vNF')]).toEqual(['100.00', '10.00', '4.50', '94.50']);
        expect(env.mensagem).toContain('<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>');

        // El PDF del documento es el DANFE.
        const pdf = createInvoicePdf({ autoridad: rep } as any);
        expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
        const texto = textoDoPdf(pdf);
        expect(texto).toContain('(DANFE) Tj');
        expect(texto).toContain('(SEM VALOR FISCAL) Tj');
        expect(texto).toContain(`(${r.fiscalId!.replace(/(.{4})(?=.)/g, '$1 ')}) Tj`);

        const replay = await provider.issueDocument(request(doc));
        expect(replay.fiscalId).toBe(r.fiscalId);
        expect(autorizaciones()).toHaveLength(1);
    });

    it('rechazo: el borrador queda descartable y el número se REUTILIZA (sin huecos)', async () => {
        const doc = await nuevoDocumento();
        sefaz.plan = [{ forzado: { cStat: '778', xMotivo: 'Rejeição: Informado NCM inexistente[nItem:1]' } }];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(`err_br_${doc}`);
        expect(r.error).toMatch(/NCM/);
        expect(r.error).not.toMatch(/Rejeição/);
        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'rechazado', error_codigo: '778', numero: 2 });

        const otro = await nuevoDocumento();
        expect((await provider.issueDocument(request(otro))).success).toBe(true);
        expect((await intentos(otro))[0].numero).toBe(2);
    });

    it('lote rechazado (servicio parado) sin SVC: nada se emite y el documento queda libre', async () => {
        sefaz.plan = [{ tipo: 'paralisado' }];
        sefaz.status['SVC-AN'] = '114';
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/contingencia no está habilitada/);
        expect((await intentos(doc))[0].estado).toBe('descartado');
        expect((await estadoNfe(ORG)).contingencia).toBeNull();
    });

    it('respuesta perdida tras autorizar: se CONSULTA la chave y se recupera sin reenviar', async () => {
        const doc = await nuevoDocumento();
        sefaz.plan = [{ tipo: 'perdida' }];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(autorizaciones()).toHaveLength(1);
        expect(sefaz.llamadas.some((l) => l.servico === 'NfeConsultaProtocolo')).toBe(true);
        expect((await intentos(doc))[0].respuesta.recuperado).toBe(true);
    });

    it('respuesta perdida sin registro: incierto hasta que el cron lo descarta pasado el margen', async () => {
        const doc = await nuevoDocumento();
        sefaz.plan = [{ tipo: 'perdida', forzado: { cStat: '999' } }];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.rawProviderData).toMatchObject({ delivery_uncertain: true });
        expect((await intentos(doc))[0].estado).toBe('incierto');

        // Otro documento de la serie no se numera mientras éste esté colgado.
        const otro = await nuevoDocumento();
        const bloqueado = await provider.issueDocument(request(otro));
        expect(bloqueado.success).toBe(false);
        expect(bloqueado.error).toMatch(/esperando la confirmación/);

        await envejecer();
        expect(await orgsConPendientes('nfe')).toContain(ORG);
        const res = await resolverPendientesDeOrg(ORG, 'nfe');
        expect(res).toMatchObject({ descartados: 1, autorizados: 0 });
        const [i] = await intentos(doc);
        expect(i.estado).toBe('descartado');
        const [[d]] = [(await m.db.query('select provider_data from documentos_fiscales where id = $1', [doc])).rows];
        expect(d.provider_data.error).toMatch(/no registró/);
    });

    it('cron: un intento incierto que la SEFAZ sí autorizó termina la emisión', async () => {
        const doc = await nuevoDocumento();
        sefaz.plan = [{ tipo: 'perdida' }];
        sefaz.consultaCaida = true;
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect((await intentos(doc))[0].estado).toBe('incierto');
        sefaz.consultaCaida = false;
        await envejecer();
        const res = await resolverPendientesDeOrg(ORG, 'nfe');
        expect(res.autorizados).toBe(1);
        expect(m.finalize).toHaveBeenCalledWith(ORG, doc);
        expect((await provider.issueDocument(request(doc))).success).toBe(true);
    });

    it('539: el número lo tiene otra chave → se consume y se emite con el siguiente', async () => {
        const doc = await nuevoDocumento();
        // Otra NF-e (de otro sistema del contribuyente) ya usa el próximo número.
        const proximo = Number((await m.db.query(`select max(numero) as n from fiscal_rail_comprobantes where rail = 'nfe' and estado = 'autorizado'`)).rows[0].n) + 1;
        sim.estado.porNumero.set(`${CNPJ}|1|${proximo}`, '35261016727230000197550010000000991000000013');
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        const filas = await intentos(doc);
        expect(filas.map((f: any) => [f.estado, f.numero])).toEqual([['rechazado', proximo], ['autorizado', proximo + 1]]);
        expect(filas[0].respuesta).toMatchObject({ conflicto: true, cStat: '539' });
    });

    it('uso denegado: el número queda consumido y no se reutiliza', async () => {
        const doc = await nuevoDocumento();
        sefaz.plan = [{ forzado: { cStat: '302', xMotivo: 'Uso Denegado: Irregularidade fiscal do destinatário' } }];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/denegó/);
        const [i] = await intentos(doc);
        expect(i.respuesta.denegada).toBe(true);
        const otro = await nuevoDocumento();
        expect((await provider.issueDocument(request(otro))).success).toBe(true);
        expect((await intentos(otro))[0].numero).toBe(i.numero + 1);
    });

    it('lote asíncrono (103): guarda el recibo y lo consulta', async () => {
        const doc = await nuevoDocumento();
        sefaz.plan = [{ tipo: 'async' }];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(sefaz.llamadas.some((l) => l.servico === 'NFeRetAutorizacao')).toBe(true);
        expect((await intentos(doc))[0].respuesta.nRec).toMatch(/^\d{15}$/);
    }, 15_000);

    it('falla cerrado ANTES de numerar: venta interestatal en el Régimen Normal y mezcla con servicios', async () => {
        const antes = sefaz.llamadas.length;
        const inter = await provider.issueDocument(request(await nuevoDocumento({ cliente: CLIENTE_OUTRO_UF })));
        expect(inter.success).toBe(false);
        expect(inter.error).toMatch(/entre estados en el Régimen Normal/);
        const sinDatos = await provider.issueDocument(request(await nuevoDocumento(), {
            lines: [{ description: 'Instalação', quantity: 1, unitPrice: 94.5, taxRate: 0, subtotal: 94.5, taxAmount: 0, total: 94.5 }],
            totals: { subtotal: 94.5, taxes: 0, total: 94.5, currency: 'BRL' },
        }));
        expect(sinDatos.error).toMatch(/no es un producto del catálogo con datos de NF-e/);
        const usd = await provider.issueDocument(request(await nuevoDocumento(), { totals: { subtotal: 90, taxes: 4.5, total: 94.5, currency: 'USD', discountTotal: 10 } }));
        expect(usd.error).toMatch(/reales/);
        const icmsComoImposto = await provider.issueDocument(request(await nuevoDocumento(), {
            lines: [{ ...request('x').lines[0], taxRate: 0.18, taxAmount: 16.2, total: 106.2 }],
            totals: { subtotal: 90, taxes: 16.2, total: 106.2, currency: 'BRL', discountTotal: 10 },
        }));
        expect(icmsComoImposto.error).toMatch(/único impuesto que se suma al precio es el IPI/);
        expect(sefaz.llamadas.length).toBe(antes);
    });

    it('Simples Nacional entre estados: CSOSN, CFOP 6.xxx y sin IBS/CBS', async () => {
        await guardarAjustes(ORG, 'nfe', { ...AJUSTES, crt: 1, pis: { cst: '99' }, cofins: { cst: '99' } });
        try {
            const doc = await nuevoDocumento({ cliente: CLIENTE_OUTRO_UF });
            const linea = { description: 'Parafuso', quantity: 2, unitPrice: 50, taxRate: 0, subtotal: 100, taxAmount: 0, total: 100, nfe: { ...PRODUTO_NFE, csosn: '102', aliquotaIpi: undefined } };
            const r = await provider.issueDocument(request(doc, { lines: [linea], totals: { subtotal: 100, taxes: 0, total: 100, currency: 'BRL' } }));
            expect(r.success).toBe(true);
            const xml = autorizaciones().at(-1)!.mensagem;
            expect(xml).toContain('<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>');
            expect(tag(xml, 'CFOP')).toBe('6102');
            expect(tag(xml, 'idDest')).toBe('2');
            expect(tag(xml, 'CRT')).toBe('1');
            expect(xml).not.toContain('<IBSCBS>');
            expect(xml).toContain('<PISOutr><CST>99</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr>');
        } finally {
            await guardarAjustes(ORG, 'nfe', AJUSTES);
        }
    });

    it('numeración concurrente: dos documentos a la vez, dos números distintos', async () => {
        const [a, b] = [await nuevoDocumento(), await nuevoDocumento()];
        const [ra, rb] = await Promise.all([provider.issueDocument(request(a)), provider.issueDocument(request(b))]);
        expect(ra.success && rb.success).toBe(true);
        const na = (await intentos(a))[0].numero;
        const nb = (await intentos(b))[0].numero;
        expect(na).not.toBe(nb);
    }, 30_000);
});

describe('contingencia SVC', () => {
    it('sin conexión con la SEFAZ: abre la SVC, emite con tpEmis 6 y la cierra cuando la SEFAZ vuelve', async () => {
        const doc = await nuevoDocumento();
        sefaz.plan = [{ tipo: 'sin_conexion' }];
        sefaz.status.SP = '108';
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(r.fiscalId![34]).toBe('6');
        const filas = await intentos(doc);
        expect(filas.map((f: any) => f.estado)).toEqual(['descartado', 'autorizado']);
        expect(filas[0].numero).toBe(filas[1].numero);
        const env = autorizaciones().at(-1)!;
        expect(env.autorizador).toBe('SVC-AN');
        expect(tag(env.mensagem, 'tpEmis')).toBe('6');
        expect(tag(env.mensagem, 'xJust')).toMatch(/Contingencia/);
        expect(tag(env.mensagem, 'dhCont')).toMatch(/-03:00$/);
        expect((await estadoNfe(ORG)).contingencia?.svc).toBe('SVC-AN');
        const rep = representacionDe(r.rawProviderData)!;
        expect(rep.danfe?.infCpl.join(' ')).toMatch(/CONTINGÊNCIA SVC-AN/);

        // La SEFAZ normal vuelve: la siguiente verificación cierra la contingencia.
        await m.db.exec(`update nfe_contingencias set verificada_at = now() - interval '1 hour'`);
        sefaz.status.SP = '107';
        const otro = await nuevoDocumento();
        const r2 = await provider.issueDocument(request(otro));
        expect(r2.fiscalId![34]).toBe('1');
        expect((await estadoNfe(ORG)).contingencia).toBeNull();
    });
});

describe('eventos', () => {
    async function autorizada() {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        const [i] = (await m.db.query(`select * from fiscal_rail_comprobantes where documento_id = $1 and estado = 'autorizado'`, [doc])).rows;
        const { intentoPorId } = await import('../src/lib/fiscal/latam/comprobantes');
        return { doc, intento: (await intentoPorId(ORG, i.id))!, chave: r.fiscalId! };
    }

    it('cancelación dentro de las 24 horas, idempotente, y fuera de plazo se rechaza sin enviar', async () => {
        const { intento, chave } = await autorizada();
        const r = await provider.cancelDocument(intento.id, { orgId: ORG, reason: 'Pedido cancelado pelo cliente antes do envio' });
        expect(r).toMatchObject({ success: true, status: 'accepted' });
        const ev = sefaz.llamadas.find((l) => l.servico === 'RecepcaoEvento')!;
        expect(ev.mensagem).toContain(`<infEvento Id="ID110111${chave}01">`);
        expect(tag(ev.mensagem, 'xJust')).toBe('Pedido cancelado pelo cliente antes do envio');
        expect(await cancelarNfe(ORG, intento)).toMatchObject({ estado: 'registrado', datos: { ya_registrado: true } });
        const [e] = (await m.db.query(`select estado, n_prot, proc_xml from nfe_eventos where chave = $1`, [chave])).rows;
        expect(e.estado).toBe('registrado');
        expect(e.proc_xml).toContain('<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento');
        // Lo registrado es definitivo.
        await expect(m.db.query(`update nfe_eventos set n_prot = 'x' where chave = $1`, [chave])).rejects.toThrow(/definitivo/);

        const vieja = await autorizada();
        const fuera = { ...vieja.intento, respuesta: { ...vieja.intento.respuesta, prot: { ...(vieja.intento.respuesta as any).prot, dhRecbto: '2026-01-01T10:00:00-03:00' } } };
        const antes = sefaz.llamadas.length;
        const rr = await cancelarNfe(ORG, fuera as any);
        expect(rr.estado).toBe('rechazado');
        expect(rr.mensaje).toMatch(/24 horas/);
        expect(sefaz.llamadas.length).toBe(antes);
    });

    it('Carta de Correção: secuencias 1 y 2, y no después de cancelada', async () => {
        const { intento, chave } = await autorizada();
        expect(await registrarCce(ORG, intento, 'Corrigir o complemento do endereço de entrega: Sala 2')).toMatchObject({ estado: 'registrado' });
        expect(await registrarCce(ORG, intento, 'Corrigir o e-mail de contato do destinatário')).toMatchObject({ estado: 'registrado' });
        const eventos = await eventosDaNota(ORG, chave);
        expect(eventos.map((e) => [e.tpEvento, e.nSeq, e.estado])).toEqual([['110110', 1, 'registrado'], ['110110', 2, 'registrado']]);
        const cce = sefaz.llamadas.filter((l) => l.servico === 'RecepcaoEvento').at(-1)!;
        expect(cce.autorizador).toBe('SP');
        expect(tag(cce.mensagem, 'xCondUso')).toMatch(/^A Carta de Correcao e disciplinada/);
        expect(await registrarCce(ORG, intento, 'corto')).toMatchObject({ estado: 'rechazado' });
        await cancelarNfe(ORG, intento, 'Venda desfeita a pedido do cliente');
        expect((await registrarCce(ORG, intento, 'Corrigir o bairro do destinatário para Itaim')).mensaje).toMatch(/cancelada/);
    });

    it('inutilização: solo números sin usar, y la numeración salta el rango', async () => {
        const huecos = await numerosSemUso(ORG, 'homologacion', 1);
        expect(Array.isArray(huecos)).toBe(true);
        const ultimo = Number((await m.db.query(`select max(numero) as n from fiscal_rail_comprobantes where rail = 'nfe'`)).rows[0].n);
        const usado = await inutilizarFaixa(ORG, 'homologacion', CNPJ, { serie: 1, inicio: 1, fim: 1, justificativa: 'Numero pulado por falha de sistema' });
        expect(usado.estado).toBe('rechazada');
        const r = await inutilizarFaixa(ORG, 'homologacion', CNPJ, { serie: 1, inicio: ultimo + 1, fim: ultimo + 3, justificativa: 'Numeracao reservada e nao utilizada' });
        expect(r).toMatchObject({ estado: 'homologada' });
        const inut = sefaz.llamadas.find((l) => l.servico === 'NfeInutilizacao')!;
        expect(inut.mensagem).toMatch(new RegExp(`<infInut Id="ID3526${CNPJ}55001${String(ultimo + 1).padStart(9, '0')}${String(ultimo + 3).padStart(9, '0')}">`));
        const doc = await nuevoDocumento();
        await provider.issueDocument(request(doc));
        expect((await intentos(doc))[0].numero).toBe(ultimo + 4);
    });

    it('inutilização sin respuesta: el mismo rango se reenvía igual y la SEFAZ confirma que ya llegó', async () => {
        const ultimo = Number((await m.db.query(`select max(numero) as n from fiscal_rail_comprobantes where rail = 'nfe'`)).rows[0].n);
        const faixa = { serie: 1, inicio: ultimo + 1, fim: ultimo + 2, justificativa: 'Numeracao reservada e nao utilizada' };
        sefaz.inutPerdida = true;
        expect(await inutilizarFaixa(ORG, 'homologacion', CNPJ, faixa)).toMatchObject({ estado: 'incierta' });
        // Un rango que se cruza con el incierto no se pide.
        expect(await inutilizarFaixa(ORG, 'homologacion', CNPJ, { ...faixa, fim: ultimo + 5 })).toMatchObject({ estado: 'rechazada' });
        const antes = sefaz.llamadas.filter((l) => l.servico === 'NfeInutilizacao');
        expect(await inutilizarFaixa(ORG, 'homologacion', CNPJ, { ...faixa, justificativa: 'Outra justificativa qualquer aqui' })).toMatchObject({ estado: 'homologada' });
        const despues = sefaz.llamadas.filter((l) => l.servico === 'NfeInutilizacao');
        expect(despues.length).toBe(antes.length + 1);
        expect(despues.at(-1)!.mensagem).toBe(antes.at(-1)!.mensagem);
        const filas = (await m.db.query(`select estado, respuesta from nfe_inutilizacoes where n_ini = $1 and n_fin = $2`, [ultimo + 1, ultimo + 2])).rows;
        expect(filas).toHaveLength(1);
        expect(filas[0]).toMatchObject({ estado: 'homologada', respuesta: { cStat: '563', recuperado: true } });
        // Y ya no se vuelve a enviar.
        expect(await inutilizarFaixa(ORG, 'homologacion', CNPJ, faixa)).toMatchObject({ estado: 'rechazada' });
    });
});

describe('aislamiento', () => {
    it('otra organización no ve intentos, eventos ni contingencias ajenos (RLS)', async () => {
        await m.db.exec(`set role cord_app; select set_config('app.org_id', '${ORG2}', false);`);
        try {
            expect((await m.db.query('select count(*)::int as n from fiscal_rail_comprobantes')).rows[0].n).toBe(0);
            expect((await m.db.query('select count(*)::int as n from nfe_eventos')).rows[0].n).toBe(0);
            expect((await m.db.query('select count(*)::int as n from nfe_contingencias')).rows[0].n).toBe(0);
            expect((await m.db.query('select count(*)::int as n from nfe_inutilizacoes')).rows[0].n).toBe(0);
        } finally {
            await m.db.exec(`reset role; select set_config('app.org_id', '', false);`);
        }
    });
});
