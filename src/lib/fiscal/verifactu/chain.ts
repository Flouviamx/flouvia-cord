// Persistencia de la cadena de registros Verifactu — el puente entre el
// algoritmo puro de huella.ts y `verifactu_registros`.
//
// El driver de Neon que usa este repo (`neon()` HTTP, ver src/lib/db.ts) no
// sostiene una transacción interactiva entre dos llamadas: cada `withOrgTx`
// es su propio roundtrip HTTP con su propia transacción de Postgres, así que
// un `pg_advisory_xact_lock` tomado en una llamada YA se liberó cuando la
// siguiente llamada empieza — no serializaría nada. La serialización real la
// da `unique (org_id, seq)`: dos emisiones concurrentes de la misma org
// compiten por el mismo `seq`, Postgres deja pasar una sola, y la otra
// reintenta leyendo el eslabón que sí quedó escrito.

import { sql, withOrgTx } from '../../db';
import {
    huellaAlta, huellaAnulacion, fechaHoraHusoAEAT,
    type HuellaAltaInput, type HuellaAnulacionInput,
} from './huella';
import type { DesgloseLinea, DestinatarioXml } from './desglose';
import type { SistemaInformaticoIdentity } from './sif';

/**
 * Campos del registro de ALTA que NO entran en el hash de la huella (ver
 * huella.ts) pero SÍ son parte del XML `RegistroFacturacionAltaType` que se
 * remite a la AEAT — se persisten junto con la huella para que el envío
 * (verifactu/aeat.ts) reconstruya el XML exacto sin volver a calcular nada
 * contra el estado ACTUAL de la cotización, que pudo cambiar desde entonces.
 */
export interface AltaRegistroXmlExtra {
    nombreRazonEmisor: string;
    descripcionOperacion: string;
    destinatario: DestinatarioXml | null;
    desglose: DesgloseLinea[];
    sistemaInformatico: SistemaInformaticoIdentity;
}

/** Igual que arriba, para el registro de ANULACIÓN — más corto (sin desglose ni destinatario). */
export interface AnulacionRegistroXmlExtra {
    sistemaInformatico: SistemaInformaticoIdentity;
}

export interface ChainedRegistro {
    seq: number;
    huella: string;
    huellaAnterior: string;
    fechaHoraHusoGenRegistro: string;
    payload: Record<string, unknown>;
}

const MAX_ATTEMPTS = 8;

async function lastLink(orgId: string): Promise<{ seq: number; huella: string }> {
    const [rows] = await withOrgTx(orgId, sql`
        select seq, huella from verifactu_registros
         where org_id = ${orgId}
         order by seq desc
         limit 1`);
    const row = rows[0];
    return row ? { seq: Number(row.seq), huella: String(row.huella) } : { seq: 0, huella: '' };
}

async function existingLink(
    orgId: string, documentoId: string, tipo: 'alta' | 'anulacion',
): Promise<ChainedRegistro | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select seq, huella, huella_anterior, payload from verifactu_registros
         where org_id = ${orgId} and documento_id = ${documentoId} and tipo = ${tipo}
         limit 1`);
    const row = rows[0];
    if (!row) return null;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return {
        seq: Number(row.seq),
        huella: String(row.huella),
        huellaAnterior: String(row.huella_anterior ?? ''),
        fechaHoraHusoGenRegistro: String(payload.fechaHoraHusoGenRegistro ?? ''),
        payload,
    };
}

async function insertLink(
    orgId: string,
    documentoId: string,
    tipo: 'alta' | 'anulacion',
    computeHuella: (huellaAnterior: string, fechaHoraHusoGenRegistro: string) => string,
    payloadFor: (fields: { seq: number; huellaAnterior: string; huella: string; fechaHoraHusoGenRegistro: string }) => Record<string, unknown>,
): Promise<ChainedRegistro> {
    // Replay idempotente: una factura ya encadenada no se vuelve a encadenar
    // (el unique(documento_id, tipo) lo impediría de todas formas con un error
    // de base de datos menos legible que este).
    const already = await existingLink(orgId, documentoId, tipo);
    if (already) return already;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const { seq: lastSeq, huella: huellaAnterior } = await lastLink(orgId);
        const seq = lastSeq + 1;
        const fechaHoraHusoGenRegistro = fechaHoraHusoAEAT(new Date());
        const huella = computeHuella(huellaAnterior, fechaHoraHusoGenRegistro);
        const payload = payloadFor({ seq, huellaAnterior, huella, fechaHoraHusoGenRegistro });
        const [rows] = await withOrgTx(orgId, sql`
            insert into verifactu_registros
                   (org_id, documento_id, tipo, seq, huella_anterior, huella, payload, generado_at)
            values (${orgId}, ${documentoId}, ${tipo}, ${seq}, ${huellaAnterior}, ${huella},
                    ${JSON.stringify(payload)}::jsonb, now())
            on conflict (org_id, seq) do nothing
            returning seq`);
        if (rows[0]) return { seq, huella, huellaAnterior, fechaHoraHusoGenRegistro, payload };
        // Otra emisión concurrente tomó este `seq` primero: reintenta con el
        // eslabón que dejó escrito, en vez de fallar la factura por contención.
    }
    throw new Error(
        'No se pudo encadenar el registro Verifactu: demasiada contención en la secuencia de la organización.',
    );
}

export async function appendVerifactuAlta(
    orgId: string,
    documentoId: string,
    input: Omit<HuellaAltaInput, 'huellaAnterior' | 'fechaHoraHusoGenRegistro'> & AltaRegistroXmlExtra,
): Promise<ChainedRegistro> {
    return insertLink(
        orgId, documentoId, 'alta',
        (huellaAnterior, fechaHoraHusoGenRegistro) => huellaAlta({
            ...input, huellaAnterior: huellaAnterior || null, fechaHoraHusoGenRegistro,
        }),
        ({ seq, huellaAnterior, huella, fechaHoraHusoGenRegistro }) => ({
            ...input, huellaAnterior, huella, fechaHoraHusoGenRegistro, seq,
        }),
    );
}

export async function appendVerifactuAnulacion(
    orgId: string,
    documentoId: string,
    input: Omit<HuellaAnulacionInput, 'huellaAnterior' | 'fechaHoraHusoGenRegistro'> & AnulacionRegistroXmlExtra,
): Promise<ChainedRegistro> {
    return insertLink(
        orgId, documentoId, 'anulacion',
        (huellaAnterior, fechaHoraHusoGenRegistro) => huellaAnulacion({
            ...input, huellaAnterior: huellaAnterior || null, fechaHoraHusoGenRegistro,
        }),
        ({ seq, huellaAnterior, huella, fechaHoraHusoGenRegistro }) => ({
            ...input, huellaAnterior, huella, fechaHoraHusoGenRegistro, seq,
        }),
    );
}

/** Registra un evento del SIF (RD 1007/2023): arranque, incidencia, exportación… */
export async function logVerifactuEvento(
    orgId: string, tipo: string, detalle: Record<string, unknown> = {},
): Promise<void> {
    await withOrgTx(orgId, sql`
        insert into verifactu_eventos (org_id, tipo, detalle)
        values (${orgId}, ${tipo}, ${JSON.stringify(detalle)}::jsonb)`);
}
