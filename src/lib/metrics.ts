import type { QuoteStatus } from './mock';

/**
 * Canon de estados para métricas comerciales.
 *
 * Base temporal de cada concepto:
 * - Salió: cohorte por `created_at`. Es toda cotización que dejó de ser borrador,
 *   aunque después haya sido rechazada o vencida.
 * - Ganada: cohorte por `approved_at` cuando existe; `created_at` es el fallback
 *   para registros legacy que ya estaban ganados antes de guardar esa marca.
 * - Abierta: foto al momento de consulta. No debe mezclarse con una cohorte
 *   histórica sin etiquetarla como snapshot.
 * - Por cobrar: foto al momento de consulta. La fecha pactada parte de
 *   `coalesce(approved_at, created_at)` más los términos efectivos del cliente.
 * - Perdida: cohorte por `created_at`; hoy `rejected_at` y `expired_at` no existen
 *   como columnas canónicas.
 */
export const STATUS_SALIO = [
    'sent', 'viewed', 'approved', 'paid', 'invoiced', 'rejected', 'expired',
] as const satisfies readonly QuoteStatus[];

export const STATUS_GANADA = [
    'approved', 'paid', 'invoiced',
] as const satisfies readonly QuoteStatus[];

export const STATUS_ABIERTA = [
    'sent', 'viewed',
] as const satisfies readonly QuoteStatus[];

export const STATUS_POR_COBRAR = [
    'approved', 'invoiced',
] as const satisfies readonly QuoteStatus[];

export const STATUS_PERDIDA = [
    'rejected', 'expired',
] as const satisfies readonly QuoteStatus[];

/**
 * SOLO DOCUMENTACION. Nunca interpolar esta constante dentro de un tagged
 * template de Neon: `${SQL_COBRADO}` se enviaria como un parametro ($1), no
 * como SQL ejecutable. La condicion debe escribirse inline en cada consulta.
 */
export const SQL_COBRADO = "status = 'paid' or paid_at is not null";
