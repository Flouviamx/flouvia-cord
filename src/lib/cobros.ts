// Cobros parciales de una cotización (anticipo / saldo / cuotas).
// Cada fila de cotizacion_cobros es una "rebanada" pagable con su propio
// PaymentIntent de Stripe. Ver db/schema.sql → cotizacion_cobros.
//
// Reglas de dinero:
// - Los montos se derivan en CENTAVOS y el último tramo se calcula POR RESTA
//   (nunca redondeando ambos lados), para que la suma siempre dé el total exacto.
// - La cotización pasa a 'paid' solo cuando no quedan cobros 'pendiente'
//   (el flip atómico vive en el webhook de Stripe).
import { sql } from './db';

export const TERM_DAYS: Record<string, number> = { contado: 0, net30: 30, net60: 60 };

// Fecha de vencimiento canónica de una cotización según sus términos —
// el MISMO cálculo que getCobranza()/cron de intereses/recordatorios:
// coalesce(approved_at, created_at) + días del término.
export function dueDateFor(baseDate: string | Date, terminos: string | null): Date {
    const base = new Date(baseDate);
    const due = new Date(base);
    due.setDate(due.getDate() + (TERM_DAYS[terminos ?? 'contado'] ?? 0));
    return due;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Normaliza una columna `date` leída de Neon a 'YYYY-MM-DD'. ⚠️ El driver
// devuelve DATE como objeto Date (medianoche LOCAL) — `String(v).slice(0,10)`
// da "Sun Jul 12", que comparado lexicográficamente contra un ISO SIEMPRE es
// mayor → bloqueaba todos los pagos (bug jul 2026). Usar SIEMPRE este helper
// para comparar/mostrar fechas de vencimiento leídas de la BD.
export function venceDia(v: unknown): string {
    if (!v) return '';
    if (v instanceof Date) {
        const p = (n: number) => String(n).padStart(2, '0');
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return String(v).slice(0, 10);
}

// Reparte total en anticipo + saldo sin perder centavos.
export function splitAnticipo(total: number, pct: number) {
    const totalCents = Math.round(total * 100);
    const antCents = Math.round((totalCents * pct) / 100);
    return { anticipo: antCents / 100, saldo: (totalCents - antCents) / 100 };
}

// Reparte un saldo en N cuotas iguales; la última absorbe el residuo.
export function splitCuotas(monto: number, n: number): number[] {
    const totalCents = Math.round(monto * 100);
    const base = Math.floor(totalCents / n);
    const cuotas = Array.from({ length: n }, () => base);
    cuotas[n - 1] += totalCents - base * n;
    return cuotas.map((c) => c / 100);
}

// Materializa las filas anticipo + saldo para una cotización con anticipo_pct.
// Idempotente: el unique (cotizacion_id, tipo, numero_cuota) hace que correrla
// dos veces no duplique. No hace nada si la cotización no pide anticipo.
// Llamar DESPUÉS de que el total quede final (p. ej. tras aprobación parcial).
export async function materializeAnticipoCobros(cotizacionId: string) {
    const rows = await sql`
        select c.id, c.org_id, c.total, c.anticipo_pct,
               coalesce(c.terminos, cl.terminos_default) as terminos,
               coalesce(c.approved_at, c.created_at) as base_date
        from cotizaciones c
        left join clientes cl on cl.id = c.cliente_id
        where c.id = ${cotizacionId}`;
    if (!rows.length) return false;
    const c = rows[0];
    const pct = Number(c.anticipo_pct);
    const total = Number(c.total);
    if (!pct || pct <= 0 || pct >= 100 || !(total > 0)) return false;

    const { anticipo, saldo } = splitAnticipo(total, pct);
    const venceSaldo = isoDay(dueDateFor(c.base_date as string, c.terminos as string));

    // ATÓMICO (un solo batch de Neon): si solo se insertara el anticipo y fallara
    // el saldo, el flip del webhook marcaría 'paid' con solo el anticipo cobrado.
    await (sql as any).transaction([
        sql`insert into cotizacion_cobros (org_id, cotizacion_id, tipo, monto, vence)
            values (${c.org_id}, ${cotizacionId}, 'anticipo', ${anticipo}, current_date)
            on conflict (cotizacion_id, tipo, numero_cuota) do nothing`,
        sql`insert into cotizacion_cobros (org_id, cotizacion_id, tipo, monto, vence)
            values (${c.org_id}, ${cotizacionId}, 'saldo', ${saldo}, ${venceSaldo})
            on conflict (cotizacion_id, tipo, numero_cuota) do nothing`,
    ]);
    return true;
}
