// Registro de lo que Cord TRANSMITIÓ al proveedor por cada documento de KYC.
//
// Cord recolecta el KYC en su propia interfaz, así que responde de qué envió,
// cuándo y desde dónde. La sesión de captura se borra a los minutos y el espejo
// de personas es reconstruible: sin esta tabla no quedaba ningún rastro
// defendible de una verificación, más allá de una línea suelta en `audit_log`.
//
// Doble propósito, y el segundo importa tanto como el primero:
//
//   1. **Cumplimiento.** Qué se envió, por quién y desde qué IP.
//   2. **Calibración.** `metricas` guarda lo que Cord midió de la foto; el
//      webhook escribe después el veredicto real del proveedor en la misma fila.
//      Ese par —"nitidez X → el proveedor dijo ilegible"— es el único dataset
//      con el que los umbrales de captura se pueden ajustar con evidencia. Sin
//      él, cada umbral es una corazonada permanente.

import { sql, withOrgTx, withSystemTx } from './db';

/**
 * Retención: 5 años desde el envío.
 *
 * Es el horizonte AML habitual —LFPIORPI en México, las directivas AMLD en la
 * Unión Europea— para conservar la evidencia de identificación del cliente. Es
 * una constante nombrada y no un `interval` suelto en una consulta porque es una
 * decisión de política, no un detalle de implementación: cambiarla debe ser
 * deliberado y quedar en el diff.
 */
export const RETENCION_ANIOS = 5;

export type AlcanceKyc = 'persona' | 'individual' | 'company' | 'cuenta';
export type OrigenKyc = 'captura_movil' | 'escritorio';

export interface RegistroKyc {
    orgId: string;
    stripeAccountId: string;
    personaId?: string | null;
    stripePersonId?: string | null;
    alcance: AlcanceKyc;
    parte: string;
    proposito: string;
    tipoDocumento?: string | null;
    sha256: string;
    bytes: number;
    mime: string;
    ancho?: number | null;
    alto?: number | null;
    /** Números medidos en el cliente. Nunca píxeles ni recortes. */
    metricas?: Record<string, unknown>;
    origen: OrigenKyc;
    captureSessionId?: string | null;
    emitidoPor?: string | null;
    subidoPor?: string | null;
    ip?: string | null;
    userAgent?: string | null;
}

/**
 * Deja constancia de un documento enviado.
 *
 * Nunca lanza: la evidencia no puede tumbar una subida que el proveedor ya
 * aceptó. Un fallo aquí es un hueco en el registro, no un documento perdido —
 * y el mismo criterio que ya usa `logAudit`.
 */
export async function registrarEnvioKyc(r: RegistroKyc): Promise<string | null> {
    try {
        const [rows] = await withOrgTx(r.orgId, sql`
            insert into connect_kyc_evidencia (
                org_id, stripe_account_id, persona_id, stripe_person_id, alcance,
                parte, proposito, tipo_documento,
                sha256, bytes, mime, ancho, alto, metricas,
                origen, capture_session_id, emitido_por, subido_por, ip, user_agent
            ) values (
                ${r.orgId}, ${r.stripeAccountId}, ${r.personaId ?? null}, ${r.stripePersonId ?? null}, ${r.alcance},
                ${r.parte}, ${r.proposito}, ${r.tipoDocumento ?? null},
                ${r.sha256}, ${r.bytes}, ${r.mime}, ${r.ancho ?? null}, ${r.alto ?? null},
                ${JSON.stringify(r.metricas ?? {})},
                ${r.origen}, ${r.captureSessionId ?? null}, ${r.emitidoPor ?? null},
                ${r.subidoPor ?? null}, ${r.ip ?? null}, ${(r.userAgent ?? '').slice(0, 400) || null}
            )
            returning id`);
        return (rows[0]?.id as string) ?? null;
    } catch {
        return null;
    }
}

/**
 * Cierra las filas abiertas de una persona con el veredicto del proveedor.
 *
 * Corre desde el webhook, que es cross-org: usa el carril de sistema. Se cierran
 * TODAS las abiertas de esa persona, no sólo la última, porque un rechazo del
 * documento invalida el frente y el reverso a la vez.
 */
export async function cerrarVeredictoKyc(
    stripePersonId: string,
    veredicto: { estado: 'verificado' | 'rechazado' | 'pendiente'; codigo?: string | null; detalle?: string | null },
): Promise<void> {
    if (!stripePersonId) return;
    try {
        await withSystemTx(sql`
            update connect_kyc_evidencia
               set estado            = ${veredicto.estado},
                   codigo_proveedor  = ${veredicto.codigo ?? null},
                   detalle_proveedor = ${(veredicto.detalle ?? '').slice(0, 500) || null},
                   resuelto_at       = now()
             where stripe_person_id = ${stripePersonId}
               and estado in ('enviado', 'pendiente')`);
    } catch {
        // El veredicto vuelve a llegar en el siguiente `account.updated`.
    }
}

/**
 * ¿Estos bytes exactos ya se enviaron por esta organización?
 *
 * El proveedor auto-rechaza un reenvío idéntico, así que volver a mandarlo quema
 * el intento y devuelve un rechazo que el usuario no entiende. La búsqueda va
 * SIEMPRE acotada a la organización: un índice global sería un oráculo
 * cross-tenant.
 */
export async function yaEnviado(orgId: string, sha256: string): Promise<boolean> {
    try {
        const [rows] = await withOrgTx(orgId, sql`
            select 1 from connect_kyc_evidencia
             where org_id = ${orgId} and sha256 = ${sha256}
             limit 1`);
        return rows.length > 0;
    } catch {
        // Ante la duda se DEJA pasar: bloquear una subida legítima por un fallo
        // de lectura deja a un negocio sin poder cobrar, que es mucho peor que
        // gastar un intento.
        return false;
    }
}
