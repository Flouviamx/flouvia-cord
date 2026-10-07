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
//
// Correcciones (subsanación). Un registro ya firmado no se edita nunca (regla
// 29): se corrige con OTRO registro de la misma factura que lo referencia en
// `subsana_de` y declara la operativa (Subsanacion / RechazoPrevio /
// SinRegistroPrevio, anexo §6 de "Validaciones y errores"). Por eso la
// unicidad por factura ya no es `unique(documento_id, tipo)` sino un índice
// parcial sobre los registros ORIGINALES (`subsana_de is null`), y cada
// registro admite como mucho una corrección directa.

import { sql, withOrgTx } from '../../db';
import {
    huellaAlta, huellaAnulacion, fechaHoraHusoAEAT,
    type HuellaAltaInput, type HuellaAnulacionInput,
} from './huella';
import type { DesgloseLinea, DestinatarioXml } from './desglose';
import type { IdFacturaAEAT } from './registro';
import {
    identidadSifParaOrg, numeroInstalacionPorOrg, requireSifIdentity,
    type SistemaInformaticoIdentity,
} from './sif';

/**
 * Campos del registro de ALTA que NO entran en el hash de la huella (ver
 * huella.ts) pero SÍ son parte del XML `RegistroFacturacionAltaType` que se
 * remite a la AEAT — se persisten junto con la huella para que el envío
 * (verifactu/aeat.ts) reconstruya el XML exacto sin volver a calcular nada
 * contra el estado ACTUAL del documento, que pudo cambiar desde entonces.
 */
export interface AltaRegistroXmlExtra {
    nombreRazonEmisor: string;
    descripcionOperacion: string;
    destinatario: DestinatarioXml | null;
    desglose: DesgloseLinea[];
    sistemaInformatico: SistemaInformaticoIdentity;
    tipoRectificativa?: 'S' | 'I';
    facturasRectificadas?: IdFacturaAEAT[];
    facturaSinIdentifDestinatarioArt61d?: 'S' | 'N';
    macrodato?: 'S' | 'N';
    subsanacion?: 'S' | 'N';
    rechazoPrevio?: 'S' | 'N' | 'X';
    /** Entorno de la AEAT de este registro. Ausente en registros anteriores a este campo. */
    entorno?: 'pruebas' | 'produccion';
    /** Instante (ISO) de expedición con el que se calculó la fecha del registro. */
    emitidaAt?: string;
    divisaDocumento?: { currency: string; aEur: number };
}

/** Igual que arriba, para el registro de ANULACIÓN. */
export interface AnulacionRegistroXmlExtra {
    sistemaInformatico: SistemaInformaticoIdentity;
    /** Razón social del obligado: la Cabecera del envío la necesita y la anulación no la lleva en su XML. */
    nombreRazonEmisor?: string;
    sinRegistroPrevio?: 'S' | 'N';
    rechazoPrevio?: 'S' | 'N';
    entorno?: 'pruebas' | 'produccion';
}

/** Metadatos de corrección: columnas consultables además del payload firmado. */
export interface CorreccionRegistro {
    /** id del registro (de la misma factura y tipo) que este corrige. */
    subsanaDe: string;
    subsanacion: boolean;
    rechazoPrevio: 'S' | 'X' | null;
    sinRegistroPrevio: boolean;
}

export type EnvioEstado = 'pendiente' | 'aceptado' | 'aceptado_con_errores' | 'rechazado' | 'bloqueado';

export interface ChainedRegistro {
    id: string;
    seq: number;
    huella: string;
    huellaAnterior: string;
    fechaHoraHusoGenRegistro: string;
    payload: Record<string, unknown>;
    envioEstado: EnvioEstado;
}

const MAX_ATTEMPTS = 10;

function toChained(row: Record<string, any>): ChainedRegistro {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return {
        id: String(row.id),
        seq: Number(row.seq),
        huella: String(row.huella),
        huellaAnterior: String(row.huella_anterior ?? ''),
        fechaHoraHusoGenRegistro: String(payload.fechaHoraHusoGenRegistro ?? ''),
        payload,
        envioEstado: String(row.envio_estado || 'pendiente') as EnvioEstado,
    };
}

async function lastLink(orgId: string): Promise<{ seq: number; huella: string }> {
    const [rows] = await withOrgTx(orgId, sql`
        select seq, huella from verifactu_registros
         where org_id = ${orgId}
         order by seq desc
         limit 1`);
    const row = rows[0];
    return row ? { seq: Number(row.seq), huella: String(row.huella) } : { seq: 0, huella: '' };
}

/** Registro ORIGINAL (no corrección) de una factura, si ya existe. */
export async function registroOriginal(
    orgId: string, documentoId: string, tipo: 'alta' | 'anulacion',
): Promise<ChainedRegistro | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select id, seq, huella, huella_anterior, payload, envio_estado from verifactu_registros
         where org_id = ${orgId} and documento_id = ${documentoId} and tipo = ${tipo}
           and subsana_de is null
         limit 1`);
    return rows[0] ? toChained(rows[0]) : null;
}

/** Corrección directa ya creada para un registro, si existe. */
export async function correccionDe(orgId: string, subsanaDe: string): Promise<ChainedRegistro | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select id, seq, huella, huella_anterior, payload, envio_estado from verifactu_registros
         where org_id = ${orgId} and subsana_de = ${subsanaDe}
         limit 1`);
    return rows[0] ? toChained(rows[0]) : null;
}

export interface RegistroHistorial {
    id: string;
    seq: number;
    tipo: 'alta' | 'anulacion';
    envioEstado: EnvioEstado;
    subsanaDe: string | null;
    payload: Record<string, any>;
}

/** Todos los registros de una factura (altas, anulaciones y sus correcciones), en orden de cadena. */
export async function historialDocumento(orgId: string, documentoId: string): Promise<RegistroHistorial[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select id, seq, tipo, envio_estado, subsana_de, payload from verifactu_registros
         where org_id = ${orgId} and documento_id = ${documentoId}
         order by seq asc`);
    return rows.map((r) => ({
        id: String(r.id),
        seq: Number(r.seq),
        tipo: r.tipo === 'anulacion' ? 'anulacion' : 'alta',
        envioEstado: String(r.envio_estado || 'pendiente') as EnvioEstado,
        subsanaDe: r.subsana_de ? String(r.subsana_de) : null,
        payload: (r.payload ?? {}) as Record<string, any>,
    }));
}

async function insertLink(
    orgId: string,
    documentoId: string,
    tipo: 'alta' | 'anulacion',
    correccion: CorreccionRegistro | null,
    computeHuella: (huellaAnterior: string, fechaHoraHusoGenRegistro: string) => string,
    payloadFor: (fields: { seq: number; huellaAnterior: string; huella: string; fechaHoraHusoGenRegistro: string }) => Record<string, unknown>,
): Promise<ChainedRegistro> {
    // Replay idempotente: una factura ya encadenada no se vuelve a encadenar, y
    // una corrección ya creada no se duplica. Se devuelve el registro GUARDADO:
    // su fecha, su huella y su importe son los que la AEAT recibirá.
    const existing = correccion
        ? await correccionDe(orgId, correccion.subsanaDe)
        : await registroOriginal(orgId, documentoId, tipo);
    if (existing) return existing;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const { seq: lastSeq, huella: huellaAnterior } = await lastLink(orgId);
        const seq = lastSeq + 1;
        const fechaHoraHusoGenRegistro = fechaHoraHusoAEAT(new Date());
        const huella = computeHuella(huellaAnterior, fechaHoraHusoGenRegistro);
        const payload = payloadFor({ seq, huellaAnterior, huella, fechaHoraHusoGenRegistro });
        // `on conflict do nothing` SIN columna: cubre tanto `unique(org_id, seq)`
        // (otra emisión tomó el eslabón) como los índices parciales de factura
        // original y de corrección (otra petición encadenó ESTE mismo registro).
        const [rows] = await withOrgTx(orgId, sql`
            insert into verifactu_registros
                   (org_id, documento_id, tipo, seq, huella_anterior, huella, payload, generado_at,
                    subsana_de, subsanacion, rechazo_previo, sin_registro_previo)
            values (${orgId}, ${documentoId}, ${tipo}, ${seq}, ${huellaAnterior}, ${huella},
                    ${JSON.stringify(payload)}::jsonb, now(),
                    ${correccion?.subsanaDe ?? null}, ${correccion?.subsanacion ?? false},
                    ${correccion?.rechazoPrevio ?? null}, ${correccion?.sinRegistroPrevio ?? false})
            on conflict do nothing
            returning id, seq`);
        if (rows[0]) {
            return {
                id: String(rows[0].id), seq, huella, huellaAnterior, fechaHoraHusoGenRegistro, payload,
                envioEstado: 'pendiente',
            };
        }
        const raced = correccion
            ? await correccionDe(orgId, correccion.subsanaDe)
            : await registroOriginal(orgId, documentoId, tipo);
        if (raced) return raced;
        // Otra emisión de la org tomó este `seq` primero: reintenta con el
        // eslabón que dejó escrito, en vez de fallar la factura por contención.
        // Con espera creciente y aleatoria: sin ella, una ráfaga de emisiones
        // simultáneas (la API en paralelo) volvía a chocar en el mismo `seq` y
        // agotaba los intentos.
        await new Promise((resolve) => setTimeout(resolve, Math.min(400, 15 * 2 ** attempt) * (0.5 + Math.random())));
    }
    throw new Error(
        'No se pudo encadenar el registro Verifactu: demasiada contención en la secuencia de la organización.',
    );
}

export async function appendVerifactuAlta(
    orgId: string,
    documentoId: string,
    input: Omit<HuellaAltaInput, 'huellaAnterior' | 'fechaHoraHusoGenRegistro'> & AltaRegistroXmlExtra,
    correccion: CorreccionRegistro | null = null,
): Promise<ChainedRegistro> {
    return insertLink(
        orgId, documentoId, 'alta', correccion,
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
    correccion: CorreccionRegistro | null = null,
): Promise<ChainedRegistro> {
    return insertLink(
        orgId, documentoId, 'anulacion', correccion,
        (huellaAnterior, fechaHoraHusoGenRegistro) => huellaAnulacion({
            ...input, huellaAnterior: huellaAnterior || null, fechaHoraHusoGenRegistro,
        }),
        ({ seq, huellaAnterior, huella, fechaHoraHusoGenRegistro }) => ({
            ...input, huellaAnterior, huella, fechaHoraHusoGenRegistro, seq,
        }),
    );
}

/**
 * Identidad completa del SIF para los registros de ESTA organización.
 *
 * - NumeroInstalacion: el que ya usa la cadena de la org (continuidad: cambiarlo
 *   a mitad de cadena declararía un sistema distinto con una cadena ajena), o
 *   uno propio derivado de su id si todavía no tiene registros.
 * - IndicadorMultiplesOT: "S" si el dueño de la org lleva más de una
 *   facturación con Verifactu en Cord (FAQ desarrolladores §4: se calcula por
 *   usuario del SaaS, no a nivel global). Lo resuelve una función `security
 *   definer` estrecha porque las otras organizaciones del dueño no son
 *   visibles bajo el carril de esta (regla 30).
 *
 * Lanza `SifNotConfiguredError` (mensaje apto para el usuario) si la identidad
 * del productor no está configurada.
 */
export async function sifIdentityForOrg(orgId: string): Promise<SistemaInformaticoIdentity> {
    const base = requireSifIdentity();
    const [lastRows, multiRows] = await withOrgTx(orgId,
        sql`select payload #>> '{sistemaInformatico,numeroInstalacion}' as numero
              from verifactu_registros
             where org_id = ${orgId}
             order by seq desc
             limit 1`,
        sql`select cord_verifactu_multiples_ot(${orgId}::uuid) as multiples`,
    );
    const numeroInstalacion = String(lastRows[0]?.numero || '') || numeroInstalacionPorOrg(base.prefijoInstalacion, orgId);
    return identidadSifParaOrg(base, { numeroInstalacion, multiplesOT: multiRows[0]?.multiples === true });
}

/** Registra un evento del SIF (RD 1007/2023): arranque, incidencia, exportación… */
export async function logVerifactuEvento(
    orgId: string, tipo: string, detalle: Record<string, unknown> = {},
): Promise<void> {
    await withOrgTx(orgId, sql`
        insert into verifactu_eventos (org_id, tipo, detalle)
        values (${orgId}, ${tipo}, ${JSON.stringify(detalle)}::jsonb)`);
}

/**
 * La organización tiene registros de facturación que la ley obliga a
 * conservar. `verifactu_registros` es append-only también frente al borrado
 * en cascada de la organización (el trigger lo bloquea): quien borra una org
 * debe preguntarlo ANTES de efectos irreversibles como cancelar la suscripción.
 */
export async function orgTieneRegistrosVerifactu(orgId: string): Promise<boolean> {
    const [rows] = await withOrgTx(orgId, sql`
        select exists (select 1 from verifactu_registros where org_id = ${orgId}) as tiene`);
    return rows[0]?.tiene === true;
}

/** Mensaje para el usuario cuando una org con registros Verifactu no se puede borrar (regla 14). */
export const VERIFACTU_CONSERVACION_MSG =
    'Esta organización tiene registros de facturación Verifactu que la ley obliga a conservar, así que no se puede eliminar. Escríbenos a soporte@flouvia.com para darla de baja sin borrar esos registros.';
