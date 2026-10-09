// src/lib/deposit-control.ts
// Cord decide CUÁNDO sale el dinero de una cuenta conectada mientras haya
// riesgo que cubrir (decisiones de oct 2026, ver docs/estado/cobros-facturacion.md).
//
// Con cuentas Custom la plataforma responde por el saldo negativo de cada
// negocio, y en México y Brasil Stripe ni siquiera puede cobrarle al banco del
// negocio para recuperarlo. Dos situaciones ponen la cuenta bajo control de Cord:
//
//   - **Periodo de prueba** de una cuenta nueva: depósitos con 7 días de margen y
//     un 10% de lo cobrado con tarjeta en reserva durante 90 días. SPEI y OXXO no
//     se reservan: no tienen contracargos.
//   - **Congelamiento** después de un "No fui yo" (src/lib/money-hold.ts): no
//     sale ningún depósito hasta que Ops lo revisa con el dueño.
//
// La espera de 72 horas tras cambiar la cuenta bancaria casi nunca necesita
// control: la cuenta nueva se agrega sin ser la predeterminada y los depósitos
// siguen llegando a la anterior hasta que entra en vigor. La excepción es la
// PRIMERA cuenta de una cuenta que ya cobró: Stripe hace predeterminada a la
// primera de cada divisa, así que ahí la espera son depósitos manuales.
//
// Bajo control, la cuenta queda en depósitos manuales en Stripe y el cron diario
// (`/api/cron/depositos`) crea los depósitos que tocan. Sin control, la cuenta
// vuelve a la frecuencia que el negocio eligió. Brasil queda fuera: ahí Stripe
// solo permite depósitos diarios automáticos y ya retiene 30 días las tarjetas.
//
// La reserva NO usa el API de reservas de Stripe: está en vista previa y exige
// Radar. Se construye con depósitos manuales, que es un API estable.

import { sql, withOrgTx } from './db';
import { stripe } from './billing';
import { log } from './log';

export const PRUEBA_DIAS = 60;
export const RESERVA_BPS = 1000; // 10%
export const RESERVA_VENTANA_DIAS = 90;
export const RETRASO_DIAS = 7;
export const TASA_DISPUTAS_MAX_BPS = 75; // 0.75%, el umbral que Stripe llama excesivo

/** Países donde Stripe permite depósitos manuales para una cuenta Custom. */
export function controlaDepositos(country: string): boolean {
    return String(country || '').toUpperCase() !== 'BR';
}

/**
 * Países donde Stripe puede cobrarle al banco del negocio un saldo negativo
 * (`debit_negative_balances`). México y Brasil NO: ahí la reserva es la única
 * protección.
 */
export function cobraSaldoNegativoAlBanco(country: string): boolean {
    return ['US', 'CA', 'GB', 'ES', 'DE', 'FR'].includes(String(country || '').toUpperCase());
}

/** Lo que se puede depositar hoy, en unidades mínimas. Nunca negativo. */
export function montoDepositable(input: { disponible: number; reserva: number; recientes: number }): number {
    const n = Math.floor(input.disponible) - Math.ceil(input.reserva) - Math.ceil(input.recientes);
    return n > 0 ? n : 0;
}

/** Reserva requerida: 10% de lo cobrado con tarjeta (neto de reembolsos) en la ventana. */
export function reservaRequerida(cobradoConTarjeta: number): number {
    return Math.ceil(Math.max(0, cobradoConTarjeta) * RESERVA_BPS / 10_000);
}

export interface MetricasRiesgo {
    diasEnPrueba: number;
    cobrosExitosos: number;
    pagadoresDistintos: number;
    disputasAbiertasOPerdidas: number;
    disputas90: number;
    cobros90: number;
    requisitosPendientes: number;
    depositosExitososDestinoActual: number;
    diasDesdeUltimoCambioDeDestino: number | null;
    saldoNegativo: boolean;
    depositoFallido7: boolean;
    reembolsado30: number;
    cobrado30: number;
}

const tasaBps = (num: number, den: number) => (den > 0 ? Math.round(num * 10_000 / den) : 0);

/**
 * ¿La cuenta ya puede salir del periodo de prueba? Todos los criterios, y se
 * dice cuáles faltan para mostrarlo en Ajustes.
 */
export function evaluarSalida(m: MetricasRiesgo): { sale: boolean; faltan: string[] } {
    const faltan: string[] = [];
    if (m.diasEnPrueba < PRUEBA_DIAS) faltan.push('dias');
    if (m.cobrosExitosos < 10) faltan.push('cobros');
    if (m.pagadoresDistintos < 3) faltan.push('pagadores');
    if (m.disputasAbiertasOPerdidas > 0) faltan.push('disputas_abiertas');
    if (tasaBps(m.disputas90, m.cobros90) >= TASA_DISPUTAS_MAX_BPS) faltan.push('tasa_disputas');
    if (m.requisitosPendientes > 0) faltan.push('requisitos');
    if (m.depositosExitososDestinoActual < 2) faltan.push('depositos');
    if (m.diasDesdeUltimoCambioDeDestino != null && m.diasDesdeUltimoCambioDeDestino < 14) faltan.push('cambio_reciente');
    if (m.saldoNegativo) faltan.push('saldo_negativo');
    return { sale: faltan.length === 0, faltan };
}

/**
 * ¿Una cuenta fuera de prueba tiene que volver a ella? Solo señales fuertes,
 * con un mínimo de muestra para que dos cobros no decidan nada.
 */
export function motivoReingreso(m: MetricasRiesgo): string | null {
    if (m.saldoNegativo) return 'saldo_negativo';
    if (m.depositoFallido7) return 'deposito_fallido';
    if (m.disputas90 >= 2 && tasaBps(m.disputas90, m.cobros90) > TASA_DISPUTAS_MAX_BPS) return 'tasa_disputas';
    if (m.cobrado30 > 0 && m.reembolsado30 * 10 > m.cobrado30 && m.cobros90 >= 10) return 'reembolsos';
    return null;
}

// ── Stripe ───────────────────────────────────────────────────────────────────

export interface FrecuenciaPreferida {
    interval: 'daily' | 'weekly' | 'monthly';
    delay_days?: number | 'minimum';
    weekly_anchor?: string;
    monthly_anchor?: number;
}

/** Cord toma los depósitos: la cuenta pasa a manual. Idempotente. */
export async function tomarControl(accountId: string): Promise<void> {
    await stripe(`/v1/accounts/${encodeURIComponent(accountId)}`, {
        'settings[payouts][schedule][interval]': 'manual',
    }, 'POST');
}

/** Cord devuelve los depósitos a la frecuencia del negocio. */
export async function devolverControl(accountId: string, preferida: FrecuenciaPreferida | null): Promise<void> {
    const p: FrecuenciaPreferida = preferida && ['daily', 'weekly', 'monthly'].includes(preferida.interval)
        ? preferida
        : { interval: 'daily', delay_days: 'minimum' };
    const fields: Record<string, string> = {
        'settings[payouts][schedule][interval]': p.interval,
        'settings[payouts][schedule][delay_days]': String(p.delay_days ?? 'minimum'),
    };
    if (p.interval === 'weekly' && p.weekly_anchor) fields['settings[payouts][schedule][weekly_anchor]'] = p.weekly_anchor;
    if (p.interval === 'monthly' && p.monthly_anchor) fields['settings[payouts][schedule][monthly_anchor]'] = String(p.monthly_anchor);
    await stripe(`/v1/accounts/${encodeURIComponent(accountId)}`, fields, 'POST');
}

/** Recorre todas las páginas de una lista de Stripe en la cuenta conectada. */
async function listarTodo(path: string, params: Record<string, string>, accountId: string, tope = 2000): Promise<any[]> {
    const out: any[] = [];
    let starting: string | null = null;
    for (;;) {
        const page = await stripe(path, { ...params, limit: '100', ...(starting ? { starting_after: starting } : {}) }, 'GET', { stripeAccount: accountId });
        const data: any[] = Array.isArray(page?.data) ? page.data : [];
        out.push(...data);
        if (!page?.has_more || !data.length || out.length >= tope) break;
        starting = String(data[data.length - 1].id);
    }
    return out;
}

export interface FotoDeCuenta {
    /** Por divisa, en unidades mínimas. */
    disponible: Record<string, number>;
    pendienteNegativo: boolean;
    /** Tarjeta neta de reembolsos en la ventana de reserva, por divisa. */
    tarjetaVentana: Record<string, number>;
    /** Ya disponible pero cobrado hace menos de RETRASO_DIAS, por divisa. */
    recientesDisponibles: Record<string, number>;
    cobros90: number;
    cobrosExitosos: number;
    pagadoresDistintos: number;
    cobrado30: number;
    reembolsado30: number;
}

const sumar = (m: Record<string, number>, k: string, v: number) => { m[k] = (m[k] ?? 0) + v; };

/** Lee de Stripe lo necesario para decidir depósitos y riesgo de una cuenta. */
export async function fotografiarCuenta(accountId: string, ahora = Date.now()): Promise<FotoDeCuenta> {
    const balance = await stripe('/v1/balance', undefined, 'GET', { stripeAccount: accountId });
    const disponible: Record<string, number> = {};
    let pendienteNegativo = false;
    for (const b of balance?.available ?? []) sumar(disponible, String(b.currency).toUpperCase(), Number(b.amount) || 0);
    for (const b of [...(balance?.available ?? []), ...(balance?.pending ?? [])]) if (Number(b.amount) < 0) pendienteNegativo = true;

    const desde90 = Math.floor((ahora - RESERVA_VENTANA_DIAS * 86_400_000) / 1000);
    const desde30 = ahora - 30 * 86_400_000;
    const cargos = await listarTodo('/v1/charges', { 'created[gte]': String(desde90) }, accountId);
    const tarjetaVentana: Record<string, number> = {};
    const pagadores = new Set<string>();
    let cobros90 = 0; let cobrosExitosos = 0; let cobrado30 = 0; let reembolsado30 = 0;
    for (const c of cargos) {
        if (c?.status !== 'succeeded' || !c?.paid) continue;
        cobros90++;
        cobrosExitosos++;
        const quien = String(c?.customer || c?.billing_details?.email || c?.receipt_email || c?.payment_method || '');
        if (quien) pagadores.add(quien);
        const neto = (Number(c.amount) || 0) - (Number(c.amount_refunded) || 0);
        if (c?.payment_method_details?.type === 'card') sumar(tarjetaVentana, String(c.currency).toUpperCase(), Math.max(0, neto));
        if (Number(c.created) * 1000 >= desde30) {
            cobrado30 += Number(c.amount) || 0;
            reembolsado30 += Number(c.amount_refunded) || 0;
        }
    }

    const desde7 = Math.floor((ahora - RETRASO_DIAS * 86_400_000) / 1000);
    const movimientos = await listarTodo('/v1/balance_transactions', { 'created[gte]': String(desde7) }, accountId);
    const recientesDisponibles: Record<string, number> = {};
    for (const t of movimientos) {
        if (!['charge', 'payment'].includes(String(t?.type))) continue;
        if (Number(t?.available_on) * 1000 > ahora) continue; // aún no disponible: no está en `disponible`
        sumar(recientesDisponibles, String(t.currency).toUpperCase(), Math.max(0, Number(t.net) || 0));
    }

    return {
        disponible, pendienteNegativo, tarjetaVentana, recientesDisponibles,
        cobros90, cobrosExitosos, pagadoresDistintos: pagadores.size, cobrado30, reembolsado30,
    };
}

/**
 * Crea el depósito del día por divisa. La llave de idempotencia es por cuenta,
 * divisa y día: dos corridas del cron el mismo día no depositan dos veces (si la
 * segunda calcula otro monto, Stripe rechaza la llave y se toma como hecho).
 */
export async function depositarLoQueToca(
    accountId: string,
    foto: FotoDeCuenta,
    opts: { reservar: boolean; dia: string },
): Promise<Array<{ moneda: string; monto: number; payoutId: string | null }>> {
    const hechos: Array<{ moneda: string; monto: number; payoutId: string | null }> = [];
    for (const [moneda, disponible] of Object.entries(foto.disponible)) {
        const monto = montoDepositable({
            disponible,
            reserva: opts.reservar ? reservaRequerida(foto.tarjetaVentana[moneda] ?? 0) : 0,
            recientes: foto.recientesDisponibles[moneda] ?? 0,
        });
        if (monto <= 0) continue;
        try {
            const payout = await stripe('/v1/payouts', {
                amount: String(monto),
                currency: moneda.toLowerCase(),
                'metadata[cord_control]': opts.reservar ? 'periodo_de_prueba' : 'control',
            }, 'POST', { stripeAccount: accountId, idempotencyKey: `cord-deposito-${accountId}-${moneda}-${opts.dia}` });
            hechos.push({ moneda, monto, payoutId: payout?.id ? String(payout.id) : null });
        } catch (err: any) {
            // Llave ya usada hoy con otro monto: el depósito del día ya salió.
            if (err?.type === 'idempotency_error') continue;
            throw err;
        }
    }
    return hechos;
}

// ── Lectura local ────────────────────────────────────────────────────────────

/** Señales locales de riesgo: disputas, depósitos y cambios de destino. */
export async function metricasLocales(orgId: string): Promise<{
    disputasAbiertasOPerdidas: number; disputas90: number; depositosExitososDestinoActual: number;
    diasDesdeUltimoCambioDeDestino: number | null; depositoFallido7: boolean; requisitosPendientes: number;
}> {
    const [[d], [p], [c], [o]] = await withOrgTx(orgId,
        sql`select count(*) filter (where status in ('needs_response','warning_needs_response','under_review','warning_under_review','lost'))::int as abiertas,
                   count(*) filter (where created_at > now() - interval '90 days')::int as d90
              from cobro_disputas where org_id = ${orgId}`,
        sql`select count(*) filter (where status = 'paid' and created_at > coalesce(
                     (select max(efectivo_desde) from destino_dinero_cambios
                       where org_id = ${orgId} and tipo = 'banco' and estado in ('vigente','liberado')), 'epoch'))::int as exitosos,
                   bool_or(status = 'failed' and updated_at > now() - interval '7 days') as fallido
              from payouts where org_id = ${orgId}`,
        sql`select extract(epoch from (now() - max(creado_at))) / 86400 as dias
              from destino_dinero_cambios where org_id = ${orgId}`,
        sql`select stripe_requirements from orgs where id = ${orgId}`,
    );
    let req: any = o?.stripe_requirements;
    if (typeof req === 'string') { try { req = JSON.parse(req); } catch { req = {}; } }
    const lista = (v: unknown) => (Array.isArray(v) ? v : []);
    return {
        disputasAbiertasOPerdidas: Number(d?.abiertas) || 0,
        disputas90: Number(d?.d90) || 0,
        depositosExitososDestinoActual: Number(p?.exitosos) || 0,
        diasDesdeUltimoCambioDeDestino: c?.dias == null ? null : Number(c.dias),
        depositoFallido7: !!p?.fallido,
        requisitosPendientes: new Set([...lista(req?.currently_due), ...lista(req?.past_due)]).size,
    };
}

export function registrarError(orgId: string, err: unknown): void {
    log.error('control de depósitos', { route: 'deposit-control', orgId, err });
}

// ── Orquestación por cuenta ──────────────────────────────────────────────────

interface EstadoControl {
    pagos_control: string;
    pagos_prueba_desde: string | null;
    depositos_congelados_at: string | null;
    /** Primera cuenta bancaria de una cuenta que ya cobró, todavía en espera. */
    espera_primera_cuenta: boolean;
    depositos_controlados: boolean;
    deposito_preferido: FrecuenciaPreferida | string | null;
    debito_negativo_configurado: boolean;
}

async function leerEstado(orgId: string): Promise<EstadoControl | null> {
    const [[o]] = await withOrgTx(orgId, sql`
        select pagos_control, pagos_prueba_desde, depositos_congelados_at,
               depositos_controlados, deposito_preferido, debito_negativo_configurado,
               exists (select 1 from destino_dinero_cambios d
                        where d.org_id = o.id and d.tipo = 'banco' and d.estado = 'en_espera'
                          and coalesce(d.antes->>'external_account_id', '') = '') as espera_primera_cuenta
          from orgs o where o.id = ${orgId}`);
    return (o as EstadoControl) ?? null;
}

const preferidaDe = (v: EstadoControl['deposito_preferido']): FrecuenciaPreferida | null => {
    if (!v) return null;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return v;
};

/** ¿Cord tiene que tener los depósitos de esta cuenta ahora mismo? */
export function requiereControl(e: Pick<EstadoControl, 'pagos_control' | 'depositos_congelados_at' | 'espera_primera_cuenta'>): boolean {
    return e.pagos_control === 'prueba' || !!e.depositos_congelados_at || !!e.espera_primera_cuenta;
}

/**
 * Lleva la frecuencia de Stripe al estado que toca: manual mientras Cord tiene
 * el control, la del negocio cuando lo suelta. Idempotente; se llama tras
 * cualquier cambio de estado y en el cron diario.
 */
export async function sincronizarControl(orgId: string, accountId: string, country: string): Promise<'controlada' | 'libre' | 'sin_cambio' | 'no_aplica'> {
    if (!controlaDepositos(country)) return 'no_aplica';
    const e = await leerEstado(orgId);
    if (!e) return 'no_aplica';
    const quiere = requiereControl(e);
    if (quiere) {
        // Se reafirma aunque el registro diga que ya está controlada: una
        // escritura concurrente de la frecuencia (Ajustes) pudo dejar Stripe en
        // automático después de que Cord tomó el control. Es una llamada
        // idempotente por cuenta controlada y por corrida.
        await tomarControl(accountId);
        if (e.depositos_controlados) return 'sin_cambio';
        await withOrgTx(orgId, sql`update orgs set depositos_controlados = true where id = ${orgId}`);
        return 'controlada';
    }
    if (!quiere && e.depositos_controlados) {
        await devolverControl(accountId, preferidaDe(e.deposito_preferido));
        await withOrgTx(orgId, sql`update orgs set depositos_controlados = false where id = ${orgId}`);
        return 'libre';
    }
    return 'sin_cambio';
}

export interface ResultadoCuenta {
    estado: 'prueba' | 'normal';
    salioDePrueba?: boolean;
    reingreso?: string | null;
    faltan?: string[];
    depositos?: Array<{ moneda: string; monto: number; payoutId: string | null }>;
    control?: string;
}

/**
 * El trabajo diario de una cuenta: cobro automático de saldos negativos donde
 * existe, salida o reingreso al periodo de prueba, la frecuencia en Stripe y,
 * bajo prueba, el depósito del día con su reserva.
 */
export async function procesarCuenta(orgId: string, accountId: string, country: string, dia: string): Promise<ResultadoCuenta> {
    const e = await leerEstado(orgId);
    if (!e) return { estado: 'normal' };

    if (cobraSaldoNegativoAlBanco(country) && !e.debito_negativo_configurado) {
        await stripe(`/v1/accounts/${encodeURIComponent(accountId)}`, { 'settings[payouts][debit_negative_balances]': 'true' }, 'POST');
        await withOrgTx(orgId, sql`update orgs set debito_negativo_configurado = true where id = ${orgId}`);
    }
    if (!controlaDepositos(country)) return { estado: e.pagos_control === 'prueba' ? 'prueba' : 'normal', control: 'no_aplica' };

    const local = await metricasLocales(orgId);
    const foto = await fotografiarCuenta(accountId);
    const m: MetricasRiesgo = {
        diasEnPrueba: e.pagos_prueba_desde ? (Date.now() - new Date(e.pagos_prueba_desde).getTime()) / 86_400_000 : 0,
        cobrosExitosos: foto.cobrosExitosos,
        pagadoresDistintos: foto.pagadoresDistintos,
        disputasAbiertasOPerdidas: local.disputasAbiertasOPerdidas,
        disputas90: local.disputas90,
        cobros90: foto.cobros90,
        requisitosPendientes: local.requisitosPendientes,
        depositosExitososDestinoActual: local.depositosExitososDestinoActual,
        diasDesdeUltimoCambioDeDestino: local.diasDesdeUltimoCambioDeDestino,
        saldoNegativo: foto.pendienteNegativo,
        depositoFallido7: local.depositoFallido7,
        reembolsado30: foto.reembolsado30,
        cobrado30: foto.cobrado30,
    };

    const resultado: ResultadoCuenta = { estado: e.pagos_control === 'prueba' ? 'prueba' : 'normal' };
    if (resultado.estado === 'prueba') {
        const { sale, faltan } = evaluarSalida(m);
        resultado.faltan = faltan;
        if (sale) {
            await withOrgTx(orgId, sql`
                update orgs set pagos_control = 'normal', pagos_prueba_motivo = null where id = ${orgId} and pagos_control = 'prueba'`);
            resultado.estado = 'normal';
            resultado.salioDePrueba = true;
        }
    } else {
        const motivo = motivoReingreso(m);
        if (motivo) {
            await withOrgTx(orgId, sql`
                update orgs set pagos_control = 'prueba', pagos_prueba_desde = now(), pagos_prueba_motivo = ${motivo}
                 where id = ${orgId} and pagos_control = 'normal'`);
            resultado.estado = 'prueba';
            resultado.reingreso = motivo;
        }
    }

    resultado.control = await sincronizarControl(orgId, accountId, country);

    // Bajo prueba, sin congelamiento ni primera cuenta en espera: el depósito
    // del día con su reserva.
    const despues = await leerEstado(orgId);
    if (despues && despues.pagos_control === 'prueba' && !despues.depositos_congelados_at && !despues.espera_primera_cuenta) {
        resultado.depositos = await depositarLoQueToca(accountId, foto, { reservar: true, dia });
    }
    await withOrgTx(orgId, sql`update orgs set depositos_revisados_at = now() where id = ${orgId}`);
    return resultado;
}
