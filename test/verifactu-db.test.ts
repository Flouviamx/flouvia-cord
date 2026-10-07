// Verifactu contra Postgres real (PGlite) con la sección de Verifactu de
// db/schema.sql tal cual: cadena, correcciones, append-only, conservación al
// borrar la organización y el outbox de envío (lease, control de flujo,
// aislamiento de SoapFault, emparejado de respuestas). La AEAT es lo único
// simulado.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({ db: null as any, aeat: vi.fn(), programar: vi.fn() }));

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
vi.mock('../src/lib/crypto-secret', () => ({ decryptSecret: (v: unknown) => (v ? String(v) : null) }));
vi.mock('../src/lib/fiscal/verifactu/cert', async (orig) => ({
    ...(await orig<any>()),
    credencialesTls: () => ({ key: 'llave', cert: 'cert' }),
}));
vi.mock('../src/lib/fiscal/verifactu/aeat', async (orig) => ({ ...(await orig<any>()), submitToAeat: m.aeat }));
// El envío inmediato tras emitir corre en segundo plano en producción; aquí se
// observa que se programó y el envío se ejerce llamando submitPendingForOrg.
vi.mock('../src/lib/fiscal/verifactu/submit', async (orig) => ({ ...(await orig<any>()), programarEnvioInmediato: m.programar }));

const ORG = '00000000-0000-4000-8000-0000000000a1';
const ORG2 = '00000000-0000-4000-8000-0000000000a2';
const OWNER = '00000000-0000-4000-8000-0000000000f1';
const ISSUER = { legalName: 'ACME Consultoría SL', taxId: 'ESB12345674', address: { countryCode: 'ES' } };
const CLIENTE = { legalName: 'Cliente SA', taxId: 'A58818501', address: { countryCode: 'ES' } };
let docSeq = 0;

const { SpainVerifactuProvider } = await import('../src/lib/fiscal/providers/SpainVerifactuProvider');
const { submitPendingForOrg } = await import('../src/lib/fiscal/verifactu/submit');
const { crearSubsanacionVerifactu, reactivarAltaVerifactu } = await import('../src/lib/fiscal/verifactu/correcciones');
const { orgTieneRegistrosVerifactu } = await import('../src/lib/fiscal/verifactu/chain');
const { AeatFaultError } = await import('../src/lib/fiscal/verifactu/aeat');
const provider = new SpainVerifactuProvider();

function seccionVerifactu(): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- ── Verifactu: cadena de registros de facturación (España)');
    const fin = schema.indexOf('-- Carril de OPS', inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(inicio);
    return schema.slice(inicio, schema.lastIndexOf('\n-- ═', fin));
}

beforeAll(async () => {
    Object.assign(process.env, {
        VERIFACTU_AEAT_ENABLED: 'true',
        VERIFACTU_SIF_NIF: 'Q2826000H',
        VERIFACTU_SIF_NOMBRE: 'Flouvia Software',
        VERIFACTU_SIF_ID: 'CD',
    });
    delete process.env.VERIFACTU_AEAT_SANDBOX;
    m.db = new PGlite();
    await m.db.exec(`
        create table users(id uuid primary key);
        create table orgs(
            id uuid primary key, owner_id uuid references users(id), sandbox_of uuid, is_demo boolean not null default false,
            nombre text, razon_social text, rfc text, fiscal_metadata jsonb, country_code text);
        create table documentos_fiscales(
            id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, credit_note_of uuid,
            invoice_number text, issued_at timestamptz, issuer_snapshot jsonb, recipient_snapshot jsonb,
            line_items_snapshot jsonb, currency text, ledger_currency text, fx_rate numeric, subtotal numeric,
            tax_total numeric, total numeric, provider_data jsonb, updated_at timestamptz);
        insert into users values ('${OWNER}');
        insert into orgs (id, owner_id, nombre, country_code) values ('${ORG}', '${OWNER}', 'ACME', 'ES'), ('${ORG2}', '${OWNER}', 'ACME 2', 'ES');`);
    await m.db.exec(seccionVerifactu());
    await m.db.exec(`update orgs set verifactu_modo = 'verifactu', verifactu_cert_enc = 'p12', verifactu_cert_pass_enc = 'pass',
                     verifactu_cert_caduca = now() + interval '1 year', verifactu_cert_subido_at = now() where id = '${ORG}'`);
}, 20000);

afterAll(async () => { await m.db?.close(); });

beforeEach(async () => {
    m.aeat.mockReset();
    m.programar.mockReset();
    await m.db.exec(`update verifactu_envio_estado set proximo_envio_at = null, lease_hasta = null, lease_token = null, lote_maximo = 1000`);
});

const lineas = (base: number, rate = 0.21) => [{
    description: 'Consultoría', quantity: 1, unitPrice: base, taxRate: rate, subtotal: base,
    taxAmount: Math.round(base * rate * 100) / 100, total: base + Math.round(base * rate * 100) / 100,
}];

async function nuevoDocumento(extra: Record<string, unknown> = {}): Promise<string> {
    const id = `00000000-0000-4000-9000-${String(++docSeq).padStart(12, '0')}`;
    await m.db.query(
        `insert into documentos_fiscales (id, org_id, credit_note_of, invoice_number, issued_at, issuer_snapshot, recipient_snapshot,
            line_items_snapshot, currency, subtotal, tax_total, total)
         values ($1, $2, $3, $4, now(), $5, $6, $7, 'EUR', 100, 21, 121)`,
        [id, extra.org ?? ORG, extra.creditNoteOf ?? null, extra.numero ?? `F2026-${String(docSeq).padStart(6, '0')}`,
            JSON.stringify(ISSUER), JSON.stringify(extra.receptor ?? CLIENTE), JSON.stringify(lineas(100))],
    );
    return id;
}

function request(documentId: string, over: Record<string, unknown> = {}) {
    return {
        documentId, invoiceNumber: `F2026-${documentId.slice(-6)}`, idempotencyKey: `k-${documentId}`, orgId: ORG, quoteId: documentId,
        countryCode: 'ES', documentType: 'verifactu_invoice', issuer: ISSUER, recipient: CLIENTE, lines: lineas(100),
        totals: { subtotal: 100, taxes: 21, total: 106, currency: 'EUR', retenciones: [{ nombre: 'IRPF', tipo: 'ret_isr', tasa: 0.15, base: 100, monto: 15 }], retencionTotal: 15 },
        issuedAt: '2026-10-07T10:00:00.000Z', ...over,
    } as any;
}

const registros = async (doc: string) => (await m.db.query(
    'select id, tipo, seq, envio_estado, subsana_de, subsanacion, rechazo_previo, sin_registro_previo, payload from verifactu_registros where documento_id = $1 order by seq', [doc])).rows;

function respuestaAeat(lineas: Array<{ num: string; op?: 'Alta' | 'Anulacion'; estado: string; codigo?: number; dup?: string }>, espera = 120) {
    return {
        estadoEnvio: 'Correcto', csv: 'CSV1', tiempoEsperaEnvio: espera, raw: {},
        lineas: lineas.map((l) => ({
            idEmisorFactura: 'B12345674', numSerieFactura: l.num, fechaExpedicionFactura: '07-10-2026',
            tipoOperacion: l.op ?? 'Alta', estado: l.estado, codigoError: l.codigo,
            ...(l.dup ? { registroDuplicado: { estado: l.dup } } : {}),
        })),
    };
}

describe('emisión: registro, interruptor y QR', () => {
    it('ImporteTotal sin IRPF, NIF normalizado, QR del entorno de pruebas y envío inmediato programado', async () => {
        const doc = await nuevoDocumento();
        const res = await provider.issueDocument(request(doc));
        const v = (res.rawProviderData as any).verifactu;
        expect(v.importeTotal).toBe('121.00');
        expect(v.qrUrl).toBe(`https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345674&numserie=F2026-${doc.slice(-6)}&fecha=07-10-2026&importe=121.00`);
        expect(v.entorno).toBe('pruebas');
        const [r] = await registros(doc);
        expect(r.payload.idEmisorFactura).toBe('B12345674');
        expect(r.payload.sistemaInformatico).toMatchObject({ nif: 'Q2826000H', idSistemaInformatico: 'CD', numeroInstalacion: `CORD-${ORG}` });
        expect(m.programar).toHaveBeenCalledWith(ORG);
    });

    it('un reintento devuelve el registro GUARDADO (fecha e importe del QR no cambian)', async () => {
        const doc = await nuevoDocumento();
        const first = await provider.issueDocument(request(doc));
        const again = await provider.issueDocument(request(doc, { issuedAt: '2026-10-09T10:00:00.000Z', totals: { subtotal: 1, taxes: 0, total: 1, currency: 'EUR' } }));
        expect((again.rawProviderData as any).verifactu.qrUrl).toBe((first.rawProviderData as any).verifactu.qrUrl);
        expect((again.rawProviderData as any).verifactu.fechaExpedicion).toBe('07-10-2026');
        expect(await registros(doc)).toHaveLength(1);
    });

    it('con el envío apagado no se encadena nada ni se imprime QR', async () => {
        process.env.VERIFACTU_AEAT_ENABLED = 'false';
        try {
            const doc = await nuevoDocumento();
            const res = await provider.issueDocument(request(doc, { documentType: 'commercial_like' }));
            expect(res.rawProviderData).toMatchObject({ regulatory_status: 'commercial_only' });
            expect((res.rawProviderData as any).verifactu).toBeUndefined();
            await expect(provider.issueDocument(request(doc))).rejects.toThrow(/no está activo/);
            expect(await registros(doc)).toHaveLength(0);
        } finally {
            process.env.VERIFACTU_AEAT_ENABLED = 'true';
        }
    });

    it('cliente sin NIF → F2; dato inválido falla ANTES de encadenar y sin nombrar variables', async () => {
        const doc = await nuevoDocumento({ receptor: { legalName: 'Particular', address: { countryCode: 'ES' } } });
        await provider.issueDocument(request(doc, { recipient: { legalName: 'Particular', address: { countryCode: 'ES' } } }));
        const [r] = await registros(doc);
        expect(r.payload).toMatchObject({ tipoFactura: 'F2', facturaSinIdentifDestinatarioArt61d: 'S', destinatario: null });

        const malo = await nuevoDocumento();
        await expect(provider.issueDocument(request(malo, { recipient: { ...CLIENTE, taxId: '12345' } }))).rejects.toThrow(/NIF del cliente/);
        expect(await registros(malo)).toHaveLength(0);

        const sinSif = await nuevoDocumento({ org: ORG });
        const saved = process.env.VERIFACTU_SIF_ID;
        process.env.VERIFACTU_SIF_ID = 'X';
        try {
            const error = await provider.issueDocument(request(sinSif)).catch((e) => e);
            expect(error.message).toMatch(/no está disponible/);
            expect(error.message).not.toMatch(/VERIFACTU_/);
        } finally { process.env.VERIFACTU_SIF_ID = saved; }
    });

    it('nota de crédito → R1 por diferencias, negativa y con la factura rectificada', async () => {
        const original = await nuevoDocumento({ numero: 'F2026-900001' });
        await provider.issueDocument(request(original, { invoiceNumber: 'F2026-900001', issuedAt: '2026-10-01T10:00:00.000Z' }));
        const nota = await nuevoDocumento({ creditNoteOf: original, numero: 'NC-F2026-000001' });
        await provider.issueDocument(request(nota, {
            invoiceNumber: 'NC-F2026-000001', documentType: 'verifactu_credit_note', lines: lineas(50),
            totals: { subtotal: 50, taxes: 10.5, total: 60.5, currency: 'EUR' },
        }));
        const [r] = await registros(nota);
        expect(r.payload).toMatchObject({
            tipoFactura: 'R1', tipoRectificativa: 'I', importeTotal: '-60.50', cuotaTotal: '-10.50',
            facturasRectificadas: [{ idEmisorFactura: 'B12345674', numSerieFactura: 'F2026-900001', fechaExpedicionFactura: '01-10-2026' }],
        });
    });

    it('IndicadorMultiplesOT: N con una sola facturación del dueño, S en cuanto tiene dos', async () => {
        const doc = await nuevoDocumento();
        await provider.issueDocument(request(doc));
        expect((await registros(doc))[0].payload.sistemaInformatico.indicadorMultiplesOT).toBe('N');
        await m.db.exec(`update orgs set verifactu_cert_subido_at = now() where id = '${ORG2}'`);
        const doc2 = await nuevoDocumento();
        await provider.issueDocument(request(doc2));
        expect((await registros(doc2))[0].payload.sistemaInformatico.indicadorMultiplesOT).toBe('S');
        await m.db.exec(`update orgs set verifactu_cert_subido_at = null where id = '${ORG2}'`);
    });
});

describe('anulación y subsanación', () => {
    it('alta rechazada → anulación SIN REGISTRO PREVIO; alta aceptada → anulación normal; idempotente', async () => {
        const rech = await nuevoDocumento();
        await provider.issueDocument(request(rech));
        await m.db.query(`update verifactu_registros set envio_estado = 'rechazado' where documento_id = $1`, [rech]);
        const res = await provider.cancelDocument(rech, { orgId: ORG });
        expect(res).toMatchObject({ success: true, rawProviderData: { verifactu_anulacion: { sinRegistroPrevio: true } } });
        const again = await provider.cancelDocument(rech, { orgId: ORG });
        expect((again.rawProviderData as any).verifactu_anulacion.seq).toBe((res.rawProviderData as any).verifactu_anulacion.seq);

        const ok = await nuevoDocumento();
        await provider.issueDocument(request(ok));
        await m.db.query(`update verifactu_registros set envio_estado = 'aceptado' where documento_id = $1`, [ok]);
        await provider.cancelDocument(ok, { orgId: ORG });
        const anul = (await registros(ok)).find((r: any) => r.tipo === 'anulacion');
        expect(anul.payload.sinRegistroPrevio).toBeUndefined();
        expect(anul.payload.nombreRazonEmisor).toBe(ISSUER.legalName);

        const sinAlta = await nuevoDocumento();
        expect(await provider.cancelDocument(sinAlta, { orgId: ORG })).toMatchObject({ success: false, error: expect.stringMatching(/no tiene registro de alta/) });
    });

    it('subsanación de un alta rechazada: Subsanacion S + RechazoPrevio X, una sola por registro', async () => {
        const doc = await nuevoDocumento();
        await provider.issueDocument(request(doc));
        const [orig] = await registros(doc);
        await expect(crearSubsanacionVerifactu(ORG, orig.id)).rejects.toThrow(/todavía no tiene respuesta/);
        await m.db.query(`update verifactu_registros set envio_estado = 'rechazado' where id = $1`, [orig.id]);
        const sub = await crearSubsanacionVerifactu(ORG, orig.id);
        const again = await crearSubsanacionVerifactu(ORG, orig.id);
        expect(again.id).toBe(sub.id);
        const rows = await registros(doc);
        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({ subsana_de: orig.id, subsanacion: true, rechazo_previo: 'X' });
        expect(rows[1].payload).toMatchObject({ subsanacion: 'S', rechazoPrevio: 'X', numSerieFactura: orig.payload.numSerieFactura });

        // La nueva aceptada y luego corregida otra vez: ALTA DE SUBSANACIÓN sin RechazoPrevio.
        await m.db.query(`update verifactu_registros set envio_estado = 'aceptado_con_errores' where id = $1`, [sub.id]);
        expect((await crearSubsanacionVerifactu(ORG, orig.id)).id).toBe(sub.id);
        const sub2 = await crearSubsanacionVerifactu(ORG, sub.id);
        expect((sub2.payload as any).rechazoPrevio).toBeUndefined();
        expect((sub2.payload as any).subsanacion).toBe('S');
    });

    it('reactivar: la anulación encadenada de una factura que siguió viva se compensa con un alta de subsanación', async () => {
        const doc = await nuevoDocumento();
        await provider.issueDocument(request(doc));
        await m.db.query(`update verifactu_registros set envio_estado = 'aceptado' where documento_id = $1`, [doc]);
        await provider.cancelDocument(doc, { orgId: ORG });
        const [alta] = await registros(doc);
        await expect(crearSubsanacionVerifactu(ORG, alta.id)).rejects.toThrow(/anulada/);
        await reactivarAltaVerifactu(ORG, doc);
        const rows = await registros(doc);
        expect(rows.map((r: any) => r.tipo)).toEqual(['alta', 'anulacion', 'alta']);
        expect(rows[2]).toMatchObject({ subsana_de: alta.id, subsanacion: true, rechazo_previo: null });
        expect(rows[2].payload.subsanacion).toBe('S');
        // Reactivada, anularla otra vez encadena una anulación NUEVA (no un replay).
        await provider.cancelDocument(doc, { orgId: ORG });
        const despues = await registros(doc);
        expect(despues.map((r: any) => r.tipo)).toEqual(['alta', 'anulacion', 'alta', 'anulacion']);
        expect(despues[3]).toMatchObject({ subsana_de: rows[1].id, subsanacion: false });
        expect(despues[3].payload.rechazoPrevio).toBeUndefined();
    });

    it('append-only: ni editar lo firmado, ni duplicar el original, ni borrar la organización', async () => {
        const doc = await nuevoDocumento();
        await provider.issueDocument(request(doc));
        const [r] = await registros(doc);
        await expect(m.db.query(`update verifactu_registros set payload = '{}'::jsonb where id = $1`, [r.id])).rejects.toThrow(/append-only/);
        await expect(m.db.query(`update verifactu_registros set rechazo_previo = 'X' where id = $1`, [r.id])).rejects.toThrow(/append-only/);
        await expect(m.db.query(`insert into verifactu_registros (org_id, documento_id, tipo, seq, huella, payload) values ($1, $2, 'alta', 9999, $3, '{}')`,
            [ORG, doc, 'A'.repeat(64)])).rejects.toThrow(/uq_verifactu_registros_original/);
        expect(await orgTieneRegistrosVerifactu(ORG)).toBe(true);
        await expect(m.db.query(`delete from orgs where id = $1`, [ORG])).rejects.toThrow(/obliga a conservar/);
        // Cambiar solo el estado de ENVÍO sí se permite.
        await m.db.query(`update verifactu_registros set envio_estado = 'aceptado' where id = $1`, [r.id]);
    });
});

describe('outbox de envío', () => {
    async function limpiarPendientes() {
        await m.db.exec(`update verifactu_registros set envio_estado = 'aceptado' where envio_estado = 'pendiente'`);
    }

    it('cabecera desde el registro, duplicado 3000 = aceptado, sin línea = sigue pendiente, TiempoEsperaEnvio y lease liberado', async () => {
        await limpiarPendientes();
        await m.db.exec(`update orgs set rfc = null where id = '${ORG}'`); // el NIF vive en fiscal_metadata, no en rfc
        const a = await nuevoDocumento(); await provider.issueDocument(request(a));
        const b = await nuevoDocumento(); await provider.issueDocument(request(b));
        const c = await nuevoDocumento(); await provider.issueDocument(request(c));
        const num = (doc: string) => `F2026-${doc.slice(-6)}`;
        m.aeat.mockResolvedValueOnce(respuestaAeat([
            { num: num(a), estado: 'Incorrecto', codigo: 3000, dup: 'Correcta' },
            { num: num(b), estado: 'AceptadoConErrores', codigo: 2005 },
        ], 120));
        const res = await submitPendingForOrg(ORG, { deadline: Date.now() + 60_000 });
        expect(m.aeat).toHaveBeenCalledTimes(1);
        const [emisor, lote, opts] = m.aeat.mock.calls[0];
        expect(emisor).toEqual({ nif: 'B12345674', nombreRazon: ISSUER.legalName });
        expect(lote).toHaveLength(3);
        expect(opts.entorno).toBe('pruebas');
        expect(res).toMatchObject({ enviados: 3, aceptados: 1, aceptadosConErrores: 1, sinRespuesta: 1, quedanPendientes: true });
        expect((await registros(a))[0].envio_estado).toBe('aceptado');
        expect((await registros(b))[0].envio_estado).toBe('aceptado_con_errores');
        expect((await registros(c))[0].envio_estado).toBe('pendiente');
        const estado = (await m.db.query(`select tiempo_espera_s, lease_token, proximo_envio_at > now() + interval '100 seconds' as espera from verifactu_envio_estado where org_id = $1`, [ORG])).rows[0];
        expect(estado).toMatchObject({ tiempo_espera_s: 120, lease_token: null, espera: true });

        // Control de flujo: antes de TiempoEsperaEnvio no se vuelve a enviar.
        const otra = await submitPendingForOrg(ORG, { deadline: Date.now() + 60_000 });
        expect(otra.omitido).toBe('sin_pendientes_en_espera_o_en_curso');
        expect(m.aeat).toHaveBeenCalledTimes(1);
    });

    it('un lease vigente impide un segundo envío simultáneo', async () => {
        await limpiarPendientes();
        const d = await nuevoDocumento(); await provider.issueDocument(request(d));
        await m.db.query(`update verifactu_envio_estado set lease_hasta = now() + interval '5 minutes', lease_token = 'otro' where org_id = $1`, [ORG]);
        const res = await submitPendingForOrg(ORG, { deadline: Date.now() + 60_000 });
        expect(res.omitido).toBeDefined();
        expect(m.aeat).not.toHaveBeenCalled();
    });

    it('SoapFault aislable: se parte el lote y el culpable termina aparcado sin bloquear la cola', async () => {
        await limpiarPendientes();
        const a = await nuevoDocumento(); await provider.issueDocument(request(a));
        const b = await nuevoDocumento(); await provider.issueDocument(request(b));
        const fault = new AeatFaultError('Client', 'Codigo[4102].El XML no cumple el esquema.');
        m.aeat.mockRejectedValueOnce(fault);
        await submitPendingForOrg(ORG, { deadline: Date.now() + 60_000 });
        expect((await m.db.query(`select lote_maximo from verifactu_envio_estado where org_id = $1`, [ORG])).rows[0].lote_maximo).toBe(1);
        expect((await registros(a))[0].envio_estado).toBe('pendiente');

        await m.db.exec(`update verifactu_envio_estado set proximo_envio_at = null`);
        m.aeat.mockRejectedValueOnce(fault);
        const res = await submitPendingForOrg(ORG, { deadline: Date.now() + 60_000 });
        expect(m.aeat.mock.calls[1][1]).toHaveLength(1);
        expect(res.bloqueados).toBe(1);
        expect((await registros(a))[0].envio_estado).toBe('bloqueado');

        await m.db.exec(`update verifactu_envio_estado set proximo_envio_at = null`);
        m.aeat.mockResolvedValueOnce(respuestaAeat([{ num: `F2026-${b.slice(-6)}`, estado: 'Correcto' }]));
        await submitPendingForOrg(ORG, { deadline: Date.now() + 60_000 });
        expect((await registros(b))[0].envio_estado).toBe('aceptado');
    });

    it('fallo de cabecera o certificado: no se aparca ningún registro', async () => {
        await limpiarPendientes();
        const a = await nuevoDocumento(); await provider.issueDocument(request(a));
        m.aeat.mockRejectedValueOnce(new AeatFaultError('Client', 'Codigo[4112].El titular del certificado debe ser Obligado Emisión.'));
        const res = await submitPendingForOrg(ORG, { deadline: Date.now() + 60_000 });
        expect(res.error).toMatch(/4112/);
        expect((await registros(a))[0].envio_estado).toBe('pendiente');
    });

    it('un registro heredado que rompe el esquema se aparca sin mandarlo', async () => {
        await limpiarPendientes();
        const a = await nuevoDocumento(); await provider.issueDocument(request(a));
        const [r] = await registros(a);
        // Simula un registro encadenado antes de la validación (NIF con prefijo ES).
        await m.db.query(`alter table verifactu_registros disable trigger trg_verifactu_registro_inmutable`);
        await m.db.query(`update verifactu_registros set payload = jsonb_set(payload, '{idEmisorFactura}', '"ESB12345674"') where id = $1`, [r.id]);
        await m.db.query(`alter table verifactu_registros enable trigger trg_verifactu_registro_inmutable`);
        const res = await submitPendingForOrg(ORG, { deadline: Date.now() + 60_000 });
        expect(res.bloqueados).toBe(1);
        expect(m.aeat).not.toHaveBeenCalled();
        expect((await registros(a))[0].envio_estado).toBe('bloqueado');
    });

    it('con el envío apagado no se toca la red', async () => {
        process.env.VERIFACTU_AEAT_ENABLED = 'false';
        try {
            expect((await submitPendingForOrg(ORG)).omitido).toBe('envio_deshabilitado');
            expect(m.aeat).not.toHaveBeenCalled();
        } finally { process.env.VERIFACTU_AEAT_ENABLED = 'true'; }
    });
});
