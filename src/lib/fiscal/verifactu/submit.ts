// Envío asíncrono a la AEAT de los registros Verifactu ya encadenados — el
// outbox de Verifactu, mismo patrón que el outbox de consumo de Stripe
// (billing-reconcile.ts): el registro se genera y encadena de forma SÍNCRONA
// al emitir (SpainVerifactuProvider), y el ENVÍO va por un cron con reintentos
// para no bloquear la emisión de la factura con la latencia/disponibilidad de
// un servicio de terceros.
import { sql, withOrgTx, withSystemTx } from '../../db';
import { decryptSecret } from '../../crypto-secret';
import { submitToAeat, type BatchRegistro, type RegistroIdentity } from './aeat';
import { logVerifactuEvento } from './chain';
import { log } from '../../log';

const AEAT_ENABLED = String(import.meta.env?.VERIFACTU_AEAT_ENABLED ?? process.env.VERIFACTU_AEAT_ENABLED ?? '').toLowerCase() === 'true';
const AEAT_SANDBOX = String(import.meta.env?.VERIFACTU_AEAT_SANDBOX ?? process.env.VERIFACTU_AEAT_SANDBOX ?? 'true').toLowerCase() !== 'false';
// Un envío no puede tardar más que la ventana del propio cron. 100 registros
// por lote: bien por debajo del límite de 1000 del esquema, con margen para
// varias corridas si una org tiene un backlog grande.
const BATCH_SIZE = 100;

export interface SubmitOrgResult {
    orgId: string;
    enviados: number;
    aceptados: number;
    aceptadosConErrores: number;
    rechazados: number;
    error?: string;
}

/** Orgs españolas con Verifactu activado — candidatas a tener envíos pendientes. */
export async function orgsConVerifactuActivo(): Promise<string[]> {
    const [rows] = await withSystemTx(sql`
        select id from orgs
        where verifactu_modo = 'verifactu' and sandbox_of is null and is_demo is not true`);
    return rows.map((r: any) => r.id as string);
}

/**
 * Envía el backlog pendiente de UNA org. Aislado por diseño: el fallo de una
 * org (certificado caducado, red caída) no puede tumbar el envío de las demás
 * — cada una se marca y se reintenta en la corrida siguiente del cron.
 */
export async function submitPendingForOrg(orgId: string): Promise<SubmitOrgResult> {
    const result: SubmitOrgResult = { orgId, enviados: 0, aceptados: 0, aceptadosConErrores: 0, rechazados: 0 };

    const [orgRows] = await withOrgTx(orgId, sql`
        select rfc, razon_social, nombre, verifactu_modo, verifactu_cert_enc, verifactu_cert_pass_enc, verifactu_cert_caduca
          from orgs where id = ${orgId} limit 1`);
    const org = orgRows[0];
    if (!org || org.verifactu_modo !== 'verifactu') return result;

    const [pendingRows] = await withOrgTx(orgId, sql`
        select id, documento_id, tipo, seq, payload
          from verifactu_registros
         where org_id = ${orgId} and envio_estado = 'pendiente'
         order by seq asc
         limit ${BATCH_SIZE}`);
    if (!pendingRows.length) return result;

    if (!AEAT_ENABLED) {
        // Interruptor explícito apagado: se deja el backlog en pendiente y se
        // sale sin tocar la red — así se puede probar el encadenamiento en
        // producción sin remitir nunca contra el servicio real de la AEAT.
        return result;
    }

    const p12b64 = decryptSecret(org.verifactu_cert_enc as string);
    const password = decryptSecret(org.verifactu_cert_pass_enc as string);
    if (!p12b64 || !password) {
        result.error = 'Certificado Verifactu no disponible (no se pudo descifrar).';
        return result;
    }
    if (org.verifactu_cert_caduca && new Date(org.verifactu_cert_caduca as string).getTime() <= Date.now()) {
        result.error = `El certificado Verifactu caducó el ${org.verifactu_cert_caduca}.`;
        return result;
    }

    // Resuelve `previous` para cada fila del lote: la identidad (NIF+serie+
    // fecha) del registro `seq - 1`. Como el lote es contiguo por `seq`, el
    // anterior de la fila N es la fila N-1 dentro del propio lote, EXCEPTO la
    // primera fila del lote, cuyo anterior hay que releerlo aparte (pudo
    // quedar fuera si un lote previo ya se envió).
    const firstSeq = Number(pendingRows[0].seq);
    let priorIdentity: RegistroIdentity | null = null;
    if (firstSeq > 1) {
        const [priorRows] = await withOrgTx(orgId, sql`
            select tipo, payload from verifactu_registros
             where org_id = ${orgId} and seq = ${firstSeq - 1} limit 1`);
        const prior = priorRows[0];
        if (prior) priorIdentity = identityFromPayload(prior.tipo, prior.payload);
    }

    const batch: BatchRegistro[] = [];
    let previous = priorIdentity;
    for (const row of pendingRows) {
        batch.push({ tipo: row.tipo, payload: row.payload, previous });
        previous = identityFromPayload(row.tipo, row.payload);
    }

    const emisor = { nombreRazon: String(org.razon_social || org.nombre || ''), nif: String(org.rfc || '').toUpperCase() };
    let respuesta;
    try {
        respuesta = await submitToAeat(emisor, batch, {
            sandbox: AEAT_SANDBOX,
            p12: Buffer.from(p12b64, 'base64'),
            p12Password: password,
        });
    } catch (error) {
        result.error = error instanceof Error ? error.message : 'fallo desconocido al enviar a la AEAT';
        log.error('verifactu: fallo al enviar a la AEAT', { route: 'verifactu-submit', orgId, err: error });
        return result;
    }

    result.enviados = pendingRows.length;
    const porNumSerie = new Map(respuesta.lineas.map((l) => [l.numSerieFactura, l]));
    for (const row of pendingRows) {
        const numSerie = row.tipo === 'alta' ? row.payload.numSerieFactura : row.payload.numSerieFacturaAnulada;
        const linea = porNumSerie.get(numSerie);
        const estado = linea?.estado === 'Correcto' ? 'aceptado'
            : linea?.estado === 'AceptadoConErrores' ? 'aceptado_con_errores'
            : 'rechazado';
        if (estado === 'aceptado') result.aceptados++;
        else if (estado === 'aceptado_con_errores') result.aceptadosConErrores++;
        else result.rechazados++;
        await withOrgTx(orgId, sql`
            update verifactu_registros
               set envio_estado = ${estado}, envio_at = now(),
                   aeat_respuesta = ${JSON.stringify({ estadoEnvio: respuesta.estadoEnvio, csv: respuesta.csv, linea: linea ?? null })}::jsonb
             where id = ${row.id} and org_id = ${orgId}`);
    }
    if (result.rechazados > 0) {
        await logVerifactuEvento(orgId, 'incidencia', {
            motivo: 'registros rechazados por la AEAT', rechazados: result.rechazados, csv: respuesta.csv,
        });
    }
    return result;
}

function identityFromPayload(tipo: 'alta' | 'anulacion', payload: any): RegistroIdentity {
    return tipo === 'alta'
        ? { idEmisorFactura: payload.idEmisorFactura, numSerieFactura: payload.numSerieFactura, fechaExpedicionFactura: payload.fechaExpedicionFactura }
        : { idEmisorFactura: payload.idEmisorFacturaAnulada, numSerieFactura: payload.numSerieFacturaAnulada, fechaExpedicionFactura: payload.fechaExpedicionFacturaAnulada };
}
