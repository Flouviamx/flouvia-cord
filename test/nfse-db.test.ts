// NFS-e de Padrão Nacional contra Postgres real (PGlite) con la sección
// "Rieles fiscales de LatAm" de db/schema.sql tal cual, y una Sefin Nacional
// simulada que habla el contrato del Swagger (JSON + XML GZip/base64) y
// devuelve NFS-e con el leiaute real (scripts/lib/nfse-simulada.mjs, validado
// contra los XSD oficiales por scripts/nfse-check.mjs): generación, rechazo,
// respuesta perdida y su recuperación por consulta de la DPS, número tomado
// por otro sistema (E0014), certificado rechazado, el outbox del cron,
// cancelación (evento e101101) idempotente, numeración concurrente y RLS.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPairSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import forge from 'node-forge';
import { nfseSimulada } from '../scripts/lib/nfse-simulada.mjs';

const m = vi.hoisted(() => ({ db: null as any, finalize: vi.fn(), sefin: null as any }));

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
vi.mock('../src/lib/fiscal/latam/nfse/sefin', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/lib/fiscal/latam/nfse/sefin')>();
    return { ...real, chamarSefin: (...args: unknown[]) => m.sefin(...args) };
});

const ORG = '00000000-0000-4000-8000-0000000000c1';
const ORG2 = '00000000-0000-4000-8000-0000000000c2';
const CNPJ = '16727230000197';
const CNPJ_TOMADOR = '11222333000181';
const PERFIL_ISS = '00000000-0000-4000-8000-00000000155a';

process.env.NFSE_ENABLED = 'true';
process.env.NFSE_ENTORNO = 'homologacion';

const { BrazilNfseProvider } = await import('../src/lib/fiscal/providers/BrazilNfseProvider');
const { NfseTransporteError } = await import('../src/lib/fiscal/latam/nfse/sefin');
const { parsearCertificado } = await import('../src/lib/fiscal/latam/certificado');
const { guardarCredencial, guardarAjustes } = await import('../src/lib/fiscal/latam/credenciales');
const { estadoNfse } = await import('../src/lib/fiscal/latam/nfse/estado');
const { railListo } = await import('../src/lib/fiscal/latam/estado');
const { orgsConPendientes, resolverPendientesDeOrg } = await import('../src/lib/fiscal/latam/resolucion');
const { representacionDe } = await import('../src/lib/fiscal/latam/representacion');
const provider = new BrazilNfseProvider();

// ── Certificados (ICP-Brasil simulado) ───────────────────────────────────────
function certificado(cnpj: string) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '0c';
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
const MUNICIPIO = certificado('46395000000139');

// ── Sefin Nacional simulada ──────────────────────────────────────────────────
type Comportamiento = 'ok' | 'rechazo' | 'perdida' | 'caida' | 'erro500' | 'cert';
const sefin = {
    plan: [] as Comportamiento[],
    planEvento: [] as ('ok' | 'prazo' | 'caida')[],
    aliquota: 5,
    nNFSe: 0,
    porDps: new Map<string, { chave: string; xml: string }>(),
    porChave: new Map<string, string>(),
    eventos: new Set<string>(),
    llamadas: [] as { metodo: string; caminho: string; xml?: string }[],
};
const header = { tipoAmbiente: 2, versaoAplicativo: 'SefinNac_simulada', dataHoraProcessamento: '2026-10-09T12:00:05-03:00' };
const gz = (xml: string) => gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
const ungz = (b64: string) => gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
const tag = (xml: string, nome: string) => new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml)?.[1] ?? '';

function gerar(dpsXml: string) {
    const n = nfseSimulada(dpsXml, { nNFSe: ++sefin.nNFSe, aliquota: sefin.aliquota, certPem: MUNICIPIO.certPem, keyPem: MUNICIPIO.keyPem });
    sefin.porDps.set(n.id, { chave: n.chave, xml: n.xml });
    sefin.porChave.set(n.chave, n.xml);
    return n;
}

async function fakeSefin(_entorno: string, credencial: { certPem: string }, metodo: string, caminho: string, corpo?: Record<string, string>) {
    expect(credencial.certPem).toMatch(/BEGIN CERTIFICATE/);
    if (metodo === 'POST' && caminho === '/nfse') {
        const xml = ungz(corpo!.dpsXmlGZipB64);
        sefin.llamadas.push({ metodo, caminho, xml });
        expect(xml).toMatch(/<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/);
        const id = /<infDPS Id="([^"]+)"/.exec(xml)![1];
        const plan = sefin.plan.shift() ?? 'ok';
        if (plan === 'caida') throw new NfseTransporteError('socket hang up');
        if (plan === 'erro500') return { status: 500, json: { ...header, erros: [{ codigo: 'E9999', descricao: 'Falha no processamento' }] } };
        if (plan === 'cert') return { status: 403, json: { ...header, erros: [{ codigo: 'E1205', descricao: 'Certificado de Transmissão - Erro Cadeira de Certificação' }] } };
        if (sefin.porDps.has(id)) {
            return { status: 400, json: { ...header, idDPS: id, erros: [{ codigo: 'E0014', descricao: 'Conjunto de Série, Número... já existe' }] } };
        }
        if (plan === 'rechazo') {
            return { status: 400, json: { ...header, idDPS: id, erros: [{ codigo: 'E0116', descricao: 'A IM deve ser informada...' }] } };
        }
        const n = gerar(xml);
        if (plan === 'perdida') throw new NfseTransporteError('socket hang up');
        return { status: 201, json: { ...header, idDps: id, chaveAcesso: n.chave, nfseXmlGZipB64: gz(n.xml), alertas: [] } };
    }
    sefin.llamadas.push({ metodo, caminho });
    let mm = /^\/dps\/(DPS\d{42})$/.exec(caminho);
    if (mm && metodo === 'GET') {
        const n = sefin.porDps.get(mm[1]);
        return n ? { status: 200, json: { ...header, idDps: mm[1], chaveAcesso: n.chave } } : { status: 404, json: { ...header, erro: { codigo: 'E404', descricao: 'Não foi gerada' } } };
    }
    if (mm && metodo === 'HEAD') return { status: sefin.porDps.has(mm[1]) ? 200 : 404, json: null };
    mm = /^\/nfse\/(\d{50})$/.exec(caminho);
    if (mm && metodo === 'GET') {
        const xml = sefin.porChave.get(mm[1]);
        return xml ? { status: 200, json: { ...header, chaveAcesso: mm[1], nfseXmlGZipB64: gz(xml) } } : { status: 404, json: { ...header, erro: { codigo: 'E404' } } };
    }
    mm = /^\/nfse\/(\d{50})\/eventos\/101101\/1$/.exec(caminho);
    if (mm && metodo === 'GET') return { status: sefin.eventos.has(mm[1]) ? 200 : 404, json: null };
    mm = /^\/nfse\/(\d{50})\/eventos$/.exec(caminho);
    if (mm && metodo === 'POST') {
        const xml = ungz(corpo!.pedidoRegistroEventoXmlGZipB64);
        sefin.llamadas.at(-1)!.xml = xml;
        expect(xml).toContain(`<infPedReg Id="PRE${mm[1]}101101">`);
        expect(xml).toContain('<xDesc>Cancelamento de NFS-e</xDesc>');
        expect(xml).toMatch(/<Signature xmlns=/);
        const plan = sefin.planEvento.shift() ?? 'ok';
        if (plan === 'caida') throw new NfseTransporteError('timeout');
        if (plan === 'prazo') return { status: 400, json: { ...header, erro: { codigo: 'E0822', descricao: 'O prazo para o cancelamento expirou' } } };
        if (sefin.eventos.has(mm[1])) return { status: 400, json: { ...header, erro: { codigo: 'E0840' } } };
        sefin.eventos.add(mm[1]);
        return { status: 201, json: { ...header, eventoXmlGZipB64: gz('<evento/>') } };
    }
    throw new Error(`operación no simulada: ${metodo} ${caminho}`);
}
const posts = () => sefin.llamadas.filter((l) => l.metodo === 'POST' && l.caminho === '/nfse');

// ── Base ─────────────────────────────────────────────────────────────────────
function seccionLatam(): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- ── Rieles fiscales de LatAm');
    const fin = schema.indexOf('-- END rieles-latam', inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(inicio);
    return schema.slice(inicio, fin);
}

const AJUSTES = { municipio: '3550308', serie: '900', opSimpNac: 1, regEspTrib: 0, servico: '010101', retencaoIssId: PERFIL_ISS };

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
        create table impuestos(id uuid primary key, org_id uuid not null references orgs(id) on delete cascade,
            nombre text not null, tasa numeric not null, kind text not null default 'consumo', activo boolean not null default true);
        insert into orgs values ('${ORG}', 'BR', null, '{"tax_id":"16.727.230/0001-97"}'), ('${ORG2}', 'BR', null, '{}');
        insert into impuestos values ('${PERFIL_ISS}', '${ORG}', 'ISS retido 5%', 5, 'retencion', true);
        grant select, insert, update, delete on all tables in schema public to cord_app;`);
    await m.db.exec(seccionLatam());
    const { certPem, keyPem } = certificado(CNPJ);
    const parsed = parsearCertificado({ certificado: certPem, llave: keyPem });
    await guardarCredencial(ORG, 'nfse', 'homologacion', parsed, { identificador: CNPJ, nombreArchivo: 'empresa.pfx', subidoPor: null });
    await guardarAjustes(ORG, 'nfse', AJUSTES);
}, 30_000);

afterAll(async () => {
    await m.db?.close();
});

beforeEach(() => {
    m.sefin = vi.fn(fakeSefin);
    sefin.plan = [];
    sefin.planEvento = [];
    sefin.aliquota = 5;
    sefin.llamadas = [];
    m.finalize.mockReset();
});

let seq = 0;
async function nuevoDocumento(opts: { org?: string; serviceDate?: string | null } = {}) {
    const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
    await m.db.query('insert into documentos_fiscales (id, org_id, service_date) values ($1, $2, $3)', [id, opts.org ?? ORG, opts.serviceDate ?? null]);
    return id;
}

function request(documentId: string, over: Record<string, unknown> = {}) {
    const base = (over.base as number) ?? 1000;
    return {
        documentId, invoiceNumber: `FAC-${seq}`, idempotencyKey: `k-${documentId}`, orgId: ORG, quoteId: documentId,
        countryCode: 'BR', documentType: 'nfse_invoice',
        issuer: { legalName: 'Empresa de Teste Ltda', taxId: '16.727.230/0001-97', address: { countryCode: 'BR' } },
        recipient: { legalName: 'Cliente Ltda', taxId: '11.222.333/0001-81', email: 'financeiro@cliente.com.br', address: { countryCode: 'BR' } },
        lines: [{ description: 'Desenvolvimento de software', quantity: 1, unitPrice: base, taxRate: 0, subtotal: base, taxAmount: 0, total: base }],
        totals: { subtotal: base, taxes: 0, total: base, currency: 'BRL' },
        issuedAt: new Date().toISOString(), ...over,
    } as any;
}

const intentos = async (doc: string) => (await m.db.query(
    'select id, estado, serie, tipo, numero, autorizacion, observaciones, error_codigo, error_mensaje, respuesta from fiscal_rail_comprobantes where documento_id = $1 order by created_at, numero', [doc])).rows;
const envejecer = () => m.db.exec(`alter table fiscal_rail_comprobantes disable trigger trg_fiscal_rail_comprobante_inmutable;
    update fiscal_rail_comprobantes set created_at = now() - interval '20 minutes', enviado_at = now() - interval '20 minutes' where estado in ('pendiente', 'incierto');
    alter table fiscal_rail_comprobantes enable trigger trg_fiscal_rail_comprobante_inmutable;`);

// ── Pruebas ──────────────────────────────────────────────────────────────────
describe('estado del riel', () => {
    it('dice qué falta en vocabulario de códigos y solo está listo con todo', async () => {
        expect((await estadoNfse(ORG2)).faltantes).toEqual(['documento', 'municipio', 'serie', 'regime', 'servico', 'certificado']);
        expect(await railListo(ORG2, 'nfse')).toBe(false);
        const e = await estadoNfse(ORG);
        expect(e).toMatchObject({ habilitado: true, entorno: 'homologacion', faltantes: [], listo: true, documento: { tipo: 'CNPJ', numero: CNPJ } });
        expect(e.municipio).toEqual({ codigo: '3550308', uf: 'SP', nome: 'São Paulo' });
        expect(e.retencoes).toEqual([{ id: PERFIL_ISS, nome: 'ISS retido 5%', tasa: 5 }]);
        expect(JSON.stringify(e)).not.toMatch(/BEGIN|PRIVATE/);
    });

    it('con el riel apagado nada está listo y un documento nfse_* no degrada en silencio', async () => {
        process.env.NFSE_ENABLED = 'false';
        try {
            expect(await railListo(ORG, 'nfse')).toBe(false);
            const doc = await nuevoDocumento();
            await expect(provider.issueDocument(request(doc))).rejects.toThrow(/no está activa/);
            const comercial = await provider.issueDocument(request(doc, { documentType: 'commercial_invoice' }));
            expect(comercial.rawProviderData?.regulatory_status).toBe('commercial_only');
            expect(sefin.llamadas).toHaveLength(0);
        } finally {
            process.env.NFSE_ENABLED = 'true';
        }
    });
});

describe('emisión', () => {
    it('NFS-e generada: chave, número de la Sefin, QR de la consulta pública y replay idempotente', async () => {
        const doc = await nuevoDocumento({ serviceDate: '2026-10-01' });
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(r.provider).toBe('nfse');
        expect(r.fiscalId).toMatch(/^\d{50}$/);
        expect(r.invoiceNumber).toBe(`H-NFSE-${sefin.nNFSe}`);
        expect(r.rawProviderData).toMatchObject({ regulatory_status: 'nfse', livemode: false, simulado: true });
        const rep = representacionDe(r.rawProviderData)!;
        expect(rep.qrUrl).toBe(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${r.fiscalId}`);
        expect(rep.prueba).toBe(true);
        expect(rep.filas.find((f) => f.k === 'Número da NFS-e')?.v).toBe(String(sefin.nNFSe));
        expect(rep.filas.find((f) => f.k === 'Base de cálculo do ISSQN')?.v).toBe('R$ 1.000,00');

        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'autorizado', serie: '900', tipo: 'DPS', numero: 1, autorizacion: r.fiscalId });
        expect(i.respuesta.nfse.chave).toBe(r.fiscalId);
        expect(i.respuesta.xml).toContain('<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"');

        // Lo que viajó: DPS de homologación, prestador sin nombre, tomador con CNPJ.
        const dps = posts()[0].xml!;
        expect([tag(dps, 'tpAmb'), tag(dps, 'serie'), tag(dps, 'nDPS'), tag(dps, 'dCompet'), tag(dps, 'cTribNac'), tag(dps, 'tpRetISSQN')]).toEqual(['2', '900', '1', '2026-10-01', '010101', '1']);
        expect(dps).toContain(`<prest><CNPJ>${CNPJ}</CNPJ><regTrib>`);
        expect(dps).toContain(`<toma><CNPJ>${CNPJ_TOMADOR}</CNPJ><xNome>Cliente Ltda</xNome><email>financeiro@cliente.com.br</email></toma>`);

        const replay = await provider.issueDocument(request(doc));
        expect(replay.fiscalId).toBe(r.fiscalId);
        expect(replay.invoiceNumber).toBe(r.invoiceNumber);
        expect(posts()).toHaveLength(1);
    });

    it('rechazo: mensaje traducido, el borrador queda descartable y el número de DPS no se reutiliza', async () => {
        const doc = await nuevoDocumento();
        sefin.plan = ['rechazo'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(`err_br_${doc}`);
        expect(r.rawProviderData?.delivery_uncertain).toBeUndefined();
        expect(r.error).toMatch(/inscripción municipal/);
        expect(r.error).not.toMatch(/A IM deve/);
        const [i] = await intentos(doc);
        expect(i).toMatchObject({ estado: 'rechazado', error_codigo: 'E0116' });

        const otro = await nuevoDocumento();
        expect((await provider.issueDocument(request(otro))).success).toBe(true);
        expect((await intentos(otro))[0].numero).toBe(i.numero + 1);
    });

    it('ISS retenido por el tomador: tpRetISSQN 2 y valor líquido = total del documento', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc, {
            totals: { subtotal: 1000, taxes: 0, total: 950, currency: 'BRL', retenciones: [{ nombre: 'ISS retido 5%', tipo: 'ret_iva', tasa: 0.05, base: 1000, monto: 50, baseTipo: 'subtotal' }], retencionTotal: 50 },
        }));
        expect(r.success).toBe(true);
        expect(tag(posts().at(-1)!.xml!, 'tpRetISSQN')).toBe('2');
        // No optante: la alícuota la pone el municipio, Cord no la informa.
        expect(tag(posts().at(-1)!.xml!, 'pAliq')).toBe('');
        expect((r.rawProviderData as any).latam.comprobante).toMatchObject({ iss_retido: true, valor_liquido: '950.00' });
        expect((r.rawProviderData as any).latam.observaciones).toEqual([]);

        // El municipio aplicó otra alícuota: la NFS-e queda generada y se avisa la diferencia.
        sefin.aliquota = 3;
        const doc2 = await nuevoDocumento();
        const r2 = await provider.issueDocument(request(doc2, {
            totals: { subtotal: 1000, taxes: 0, total: 950, currency: 'BRL', retenciones: [{ nombre: 'ISS retido 5%', tipo: 'ret_iva', tasa: 0.05, base: 1000, monto: 50, baseTipo: 'subtotal' }], retencionTotal: 50 },
        }));
        expect(r2.success).toBe(true);
        expect((r2.rawProviderData as any).latam.observaciones[0].mensaje).toMatch(/valor líquido de la NFS-e \(R\$ 970\.00\) difiere/);
    });

    it('error de datos ANTES de enviar: no toca la Sefin y explica qué corregir', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc, {
            lines: [{ description: 'Serviço', quantity: 1, unitPrice: 1000, taxRate: 0.05, subtotal: 1000, taxAmount: 50, total: 1050 }],
            totals: { subtotal: 1000, taxes: 50, total: 1050, currency: 'BRL' },
        }));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/ISS va incluido en el precio/);
        expect(sefin.llamadas).toHaveLength(0);
        expect(await intentos(doc)).toHaveLength(0);
    });

    it('la NFS-e no tiene nota de crédito: se rechaza sin hablar con la Sefin', async () => {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc, { documentType: 'nfse_credit_note' }));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/no tiene nota de crédito/);
        expect(sefin.llamadas).toHaveLength(0);
    });

    it('certificado rechazado por la Sefin (403): rechazo sin consumir nada y la credencial queda marcada', async () => {
        const doc = await nuevoDocumento();
        sefin.plan = ['cert'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/certificado digital/);
        const [cred] = (await m.db.query("select verificacion_error from fiscal_rail_credenciales where rail = 'nfse'")).rows;
        expect(cred.verificacion_error).toMatch(/certificado digital/);
        await m.db.query("update fiscal_rail_credenciales set verificacion_error = null where rail = 'nfse'");
    });
});

describe('respuestas perdidas: se consulta la DPS, nunca se reenvía', () => {
    it('la respuesta se perdió pero la Sefin generó la NFS-e: la consulta inmediata la recupera', async () => {
        const doc = await nuevoDocumento();
        sefin.plan = ['perdida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        expect(posts()).toHaveLength(1);
        expect(sefin.llamadas.some((l) => l.caminho.startsWith('/dps/'))).toBe(true);
        const [i] = await intentos(doc);
        expect(i.estado).toBe('autorizado');
        expect(i.respuesta.recuperado).toBe(true);
    });

    it('sin respuesta y sin NFS-e: queda incierto, bloquea la serie y el reintento no reenvía', async () => {
        const doc = await nuevoDocumento();
        sefin.plan = ['caida'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.documentId).toBe(doc);
        expect(r.rawProviderData).toMatchObject({ delivery_uncertain: true, retry_safe: true });
        expect((await intentos(doc))[0].estado).toBe('incierto');

        const otra = await provider.issueDocument(request(await nuevoDocumento()));
        expect(otra.success).toBe(false);
        expect(otra.error).toMatch(/esperando la confirmación/);

        const enviados = posts().length;
        const again = await provider.issueDocument(request(doc));
        expect(again.rawProviderData?.delivery_uncertain).toBe(true);
        expect(posts()).toHaveLength(enviados);
    });

    it('el cron descarta lo que la Sefin no generó y libera el documento; autoriza lo que sí', async () => {
        await envejecer();
        const [incierto] = (await m.db.query("select documento_id from fiscal_rail_comprobantes where estado = 'incierto' and rail = 'nfse'")).rows;
        await m.db.query("update documentos_fiscales set provider_document_id = id::text, provider_data = '{\"delivery_uncertain\":true,\"retry_safe\":true}' where id = $1", [incierto.documento_id]);
        expect(await orgsConPendientes('nfse')).toEqual([ORG]);
        const r = await resolverPendientesDeOrg(ORG, 'nfse');
        expect(r).toMatchObject({ revisados: 1, descartados: 1, autorizados: 0 });
        const [doc] = (await m.db.query('select provider_document_id, provider_data from documentos_fiscales where id = $1', [incierto.documento_id])).rows;
        expect(doc.provider_document_id).toBe(`err_nfse_${incierto.documento_id}`);
        expect(doc.provider_data.delivery_uncertain).toBeUndefined();
        expect(doc.provider_data.error).toMatch(/no generó/);
        expect(m.finalize).not.toHaveBeenCalled();

        // Una que la Sefin SÍ generó (la respuesta se perdió y la consulta inmediata también falló).
        const otro = await nuevoDocumento();
        sefin.plan = ['perdida'];
        m.sefin = vi.fn(async (...args: any[]) => {
            if (String(args[3]).startsWith('/dps/')) throw new NfseTransporteError('timeout');
            return (fakeSefin as any)(...args);
        });
        const pendiente = await provider.issueDocument(request(otro));
        expect(pendiente.rawProviderData?.delivery_uncertain).toBe(true);
        m.sefin = vi.fn(fakeSefin);
        await envejecer();
        const r2 = await resolverPendientesDeOrg(ORG, 'nfse');
        expect(r2).toMatchObject({ autorizados: 1 });
        expect(m.finalize).toHaveBeenCalledWith(ORG, otro);
        expect((await intentos(otro))[0].estado).toBe('autorizado');
        expect(await orgsConPendientes('nfse')).toEqual([]);
    });

    it('error interno de la Sefin (500): incierto, sin reenviar', async () => {
        const doc = await nuevoDocumento();
        sefin.plan = ['erro500'];
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(false);
        expect(r.rawProviderData?.delivery_uncertain).toBe(true);
        expect((await intentos(doc))[0].estado).toBe('incierto');
        await envejecer();
        expect(await resolverPendientesDeOrg(ORG, 'nfse')).toMatchObject({ descartados: 1 });
    });

    it('E0014: la serie y el número ya los usó otro sistema → se descarta y se emite con el siguiente', async () => {
        // Otro sistema del contribuyente generó una NFS-e con el próximo número de la serie.
        const [{ n }] = (await m.db.query("select max(numero)::int as n from fiscal_rail_comprobantes where rail = 'nfse' and serie = '900'")).rows;
        const proximo = n + 1;
        const ajena = (await import('../src/lib/fiscal/latam/nfse/dps')).conNumero(
            (await import('../src/lib/fiscal/latam/nfse/dps')).armarDps({
                entorno: 'homologacion', documentoEmisor: CNPJ, municipio: '3550308', serie: '900', opSimpNac: 1, servico: '010101',
                receptor: { taxId: '', pais: 'BR' }, instante: new Date(),
                lineas: [{ description: 'Outro sistema', quantity: 1, unitPrice: 77, taxRate: 0, subtotal: 77, taxAmount: 0, total: 77 }],
                totales: { subtotal: 77, taxes: 0, total: 77, currency: 'BRL' },
            }), proximo);
        const { xmlDps } = await import('../src/lib/fiscal/latam/nfse/dps');
        gerar(xmlDps(ajena));

        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        const todos = await intentos(doc);
        expect(todos.map((i: any) => [i.estado, i.numero])).toEqual([['descartado', proximo], ['autorizado', proximo + 1]]);
        expect(todos[0].respuesta.conflicto).toBe(true);
    });
});

describe('cancelación (evento e101101)', () => {
    async function emitida() {
        const doc = await nuevoDocumento();
        const r = await provider.issueDocument(request(doc));
        expect(r.success).toBe(true);
        return r;
    }

    it('cancela ante la Sefin y una segunda anulación no pide otro evento', async () => {
        const r = await emitida();
        const c = await provider.cancelDocument(r.documentId, { orgId: ORG, reason: 'Serviço cobrado em duplicidade por engano' });
        expect(c).toMatchObject({ success: true, status: 'accepted' });
        const evento = sefin.llamadas.find((l) => l.caminho.endsWith('/eventos') && l.metodo === 'POST')!;
        expect(evento.xml).toContain(`<CNPJAutor>${CNPJ}</CNPJAutor><chNFSe>${r.fiscalId}</chNFSe>`);
        expect(evento.xml).toContain('<cMotivo>9</cMotivo><xMotivo>Serviço cobrado em duplicidade por engano</xMotivo>');

        const eventosAntes = sefin.llamadas.filter((l) => l.metodo === 'POST' && l.caminho.endsWith('/eventos')).length;
        const otra = await provider.cancelDocument(r.documentId, { orgId: ORG });
        expect(otra).toMatchObject({ success: true, status: 'accepted', rawProviderData: { nfse: { ya_registrado: true } } });
        expect(sefin.llamadas.filter((l) => l.metodo === 'POST' && l.caminho.endsWith('/eventos'))).toHaveLength(eventosAntes);
    });

    it('fuera de plazo del municipio: rechazada con el motivo; sin respuesta: incierta', async () => {
        const r = await emitida();
        sefin.planEvento = ['prazo'];
        const c = await provider.cancelDocument(r.documentId, { orgId: ORG });
        expect(c).toMatchObject({ success: false, status: 'rejected' });
        expect(c.error).toMatch(/plazo/);
        sefin.planEvento = ['caida'];
        const d = await provider.cancelDocument(r.documentId, { orgId: ORG });
        expect(d).toMatchObject({ success: false, status: 'unknown' });
    });
});

describe('numeración e idempotencia', () => {
    it('emisiones concurrentes de la misma serie toman números consecutivos', async () => {
        const docs = await Promise.all([nuevoDocumento(), nuevoDocumento(), nuevoDocumento()]);
        const rs = await Promise.all(docs.map((d) => provider.issueDocument(request(d))));
        expect(rs.every((r) => r.success)).toBe(true);
        const numeros = (await Promise.all(docs.map(async (d) => (await intentos(d))[0].numero))).sort((a, b) => a - b);
        expect(numeros[1]).toBe(numeros[0] + 1);
        expect(numeros[2]).toBe(numeros[0] + 2);
        expect(new Set(rs.map((r) => r.fiscalId)).size).toBe(3);
    }, 30_000);

    it('dos emisiones simultáneas del MISMO documento generan una sola NFS-e', async () => {
        const doc = await nuevoDocumento();
        const enviados = posts().length;
        const [a, b] = await Promise.all([provider.issueDocument(request(doc)), provider.issueDocument(request(doc))]);
        expect(a.success && b.success).toBe(true);
        expect(a.fiscalId).toBe(b.fiscalId);
        expect(posts()).toHaveLength(enviados + 1);
    }, 30_000);

    it('el número inicial configurado se respeta si es mayor', async () => {
        await guardarAjustes(ORG, 'nfse', { ...AJUSTES, serie: '901', numeroInicial: 500 });
        try {
            const doc = await nuevoDocumento();
            expect((await provider.issueDocument(request(doc))).success).toBe(true);
            expect((await intentos(doc))[0]).toMatchObject({ serie: '901', numero: 500 });
        } finally {
            await guardarAjustes(ORG, 'nfse', AJUSTES);
        }
    });
});

describe('aislamiento (RLS con el rol de aplicación)', () => {
    it('una organización no ve las NFS-e, credenciales ni ajustes de otra', async () => {
        const contar = (org: string, tabla: string) => m.db.transaction(async (t: any) => {
            await t.query('set local role cord_app');
            await t.query("select set_config('app.org_id', $1, true)", [org]);
            return Number((await t.query(`select count(*)::int as n from ${tabla} where rail = 'nfse'`)).rows[0].n);
        });
        for (const tabla of ['fiscal_rail_comprobantes', 'fiscal_rail_credenciales', 'fiscal_rail_ajustes', 'fiscal_rail_secuencias']) {
            expect(await contar(ORG, tabla), tabla).toBeGreaterThan(0);
            expect(await contar(ORG2, tabla), tabla).toBe(0);
        }
    });
});
