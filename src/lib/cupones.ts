// Cupones: códigos de descuento reutilizables que administra el negocio.
//
// Ciclo de vida (contrato completo en docs/estado/cobros-facturacion.md):
//
//   aplicar   el editor (o la API) manda `cupon: 'CODIGO'`; aquí se valida
//             —activo, vigencia en la zona horaria de la organización, divisa
//             de un cupón de monto, usos globales y por cliente— y se resuelve
//             a la definición `{tipo, valor, codigo, cupon_id}` que se guarda
//             con el documento. El navegador nunca manda el importe.
//   redimir   cuando el documento se vuelve vinculante: la factura al emitirse
//             o la cotización al aprobarse. `cord_cupon_redimir` lo hace
//             atómico (bloquea la fila del cupón): si los usos se agotaron
//             entre el borrador y la emisión, la emisión falla con un motivo.
//             La factura que nace de una cotización reusa su redención.
//   liberar   anular la factura (o rechazar la cotización) devuelve el uso.
//
// La vigencia y `activo` se revisan al APLICAR, no al redimir: un documento
// armado mientras el cupón era válido se respeta. El tope de usos sí se revisa
// en los dos momentos, porque es el presupuesto del cupón.

import { sql, withOrgTx } from './db';
import { currencyDecimals, normalizeCurrency } from './currency';
import { isISODate } from './rango';
import {
    MONTO_MAXIMO,
    normalizarCodigo,
    type DescuentoDef,
    type DescuentoSolicitud,
    type TipoDescuento,
} from './descuentos';

export type MotivoCupon =
    | 'no_existe' | 'inactivo' | 'aun_no_vigente' | 'vencido'
    | 'moneda' | 'agotado' | 'agotado_cliente' | 'requiere_cliente';

/** Mensaje para el vendedor. El editor muestra su propia traducción por `code`. */
export const MENSAJE_CUPON: Record<MotivoCupon, string> = {
    no_existe: 'Ese cupón no existe.',
    inactivo: 'Ese cupón está desactivado.',
    aun_no_vigente: 'Ese cupón todavía no está vigente.',
    vencido: 'Ese cupón ya venció.',
    moneda: 'Ese cupón es de otra divisa que la del documento.',
    agotado: 'Ese cupón ya no tiene usos disponibles.',
    agotado_cliente: 'Este cliente ya usó todas las veces que le permite ese cupón.',
    requiere_cliente: 'Ese cupón está limitado por cliente: elige un cliente primero.',
};

export interface Cupon {
    id: string;
    codigo: string;
    nombre: string | null;
    tipo: TipoDescuento;
    valor: number;
    moneda: string | null;
    vigente_desde: string | null;
    vigente_hasta: string | null;
    max_usos: number | null;
    max_usos_por_cliente: number | null;
    usos: number;
    activo: boolean;
}

export class DescuentoError extends Error {
    status: number;
    code: string;
    constructor(message: string, code: string, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

const fecha = (v: unknown): string | null => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).slice(0, 10);
    return isISODate(s) ? s : null;
};
const entero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function cuponDesdeFila(r: any): Cupon {
    return {
        id: String(r.id),
        codigo: String(r.codigo),
        nombre: r.nombre ? String(r.nombre) : null,
        tipo: r.tipo === 'monto' ? 'monto' : 'porcentaje',
        valor: Number(r.valor) || 0,
        moneda: r.moneda ? String(r.moneda) : null,
        vigente_desde: fecha(r.vigente_desde),
        vigente_hasta: fecha(r.vigente_hasta),
        max_usos: entero(r.max_usos),
        max_usos_por_cliente: entero(r.max_usos_por_cliente),
        usos: Number(r.usos) || 0,
        activo: r.activo !== false,
    };
}

/** Día civil (YYYY-MM-DD) en la zona de la organización (regla 24). */
export function hoyEnZona(zona: string | null | undefined, ahora: Date = new Date()): string {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: zona || 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(ahora);
    } catch {
        return ahora.toISOString().slice(0, 10);
    }
}

/**
 * ¿Se puede APLICAR este cupón a este documento? Función pura: la consulta la
 * hace `resolverDescuento`. `yaRedimido` = el documento ya tiene su uso
 * registrado (un reintento de emisión), así que no compite por otro.
 */
export function evaluarCupon(
    cupon: Cupon | null,
    ctx: { moneda: string; clienteId: string | null; hoy: string; usosCliente: number; yaRedimido: boolean },
): { ok: true } | { ok: false; motivo: MotivoCupon } {
    if (!cupon) return { ok: false, motivo: 'no_existe' };
    if (!cupon.activo) return { ok: false, motivo: 'inactivo' };
    if (cupon.vigente_desde && ctx.hoy < cupon.vigente_desde) return { ok: false, motivo: 'aun_no_vigente' };
    if (cupon.vigente_hasta && ctx.hoy > cupon.vigente_hasta) return { ok: false, motivo: 'vencido' };
    if (cupon.tipo === 'monto' && normalizeCurrency(cupon.moneda, '') !== normalizeCurrency(ctx.moneda, '')) {
        return { ok: false, motivo: 'moneda' };
    }
    if (ctx.yaRedimido) return { ok: true };
    if (cupon.max_usos !== null && cupon.usos >= cupon.max_usos) return { ok: false, motivo: 'agotado' };
    if (cupon.max_usos_por_cliente !== null) {
        if (!ctx.clienteId) return { ok: false, motivo: 'requiere_cliente' };
        if (ctx.usosCliente >= cupon.max_usos_por_cliente) return { ok: false, motivo: 'agotado_cliente' };
    }
    return { ok: true };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: unknown) => (typeof v === 'string' && UUID_RE.test(v) ? v : null);

/**
 * Busca y valida un cupón por código para un documento concreto. Lo comparten
 * `resolverDescuento` y el endpoint de validación del editor.
 */
export async function validarCupon(
    orgId: string,
    codigo: string,
    ctx: { moneda: string; clienteId?: string | null; cotizacionId?: string | null; documentoId?: string | null },
): Promise<{ ok: true; cupon: Cupon } | { ok: false; motivo: MotivoCupon }> {
    const normal = normalizarCodigo(codigo);
    if (!normal) return { ok: false, motivo: 'no_existe' };
    const clienteId = uuidOrNull(ctx.clienteId);
    const cotizacionId = uuidOrNull(ctx.cotizacionId);
    const documentoId = uuidOrNull(ctx.documentoId);
    const [filas, org, usos] = await withOrgTx(orgId,
        sql`select * from cupones where org_id = ${orgId} and codigo = ${normal} limit 1`,
        sql`select zona_horaria from orgs where id = ${orgId}`,
        sql`select
              count(*) filter (where ${clienteId}::uuid is not null and r.cliente_id = ${clienteId}::uuid
                and not (${documentoId}::uuid is not null and r.documento_id is not distinct from ${documentoId}::uuid)
                and not (${cotizacionId}::uuid is not null and r.cotizacion_id is not distinct from ${cotizacionId}::uuid))::int as del_cliente,
              bool_or((${documentoId}::uuid is not null and r.documento_id = ${documentoId}::uuid)
                   or (${cotizacionId}::uuid is not null and r.cotizacion_id = ${cotizacionId}::uuid)) as ya_redimido
            from cupon_redenciones r
            join cupones c on c.id = r.cupon_id
           where r.org_id = ${orgId} and c.org_id = ${orgId} and c.codigo = ${normal}`);
    const cupon = filas[0] ? cuponDesdeFila(filas[0]) : null;
    const veredicto = evaluarCupon(cupon, {
        moneda: ctx.moneda,
        clienteId,
        hoy: hoyEnZona(org[0]?.zona_horaria as string | undefined),
        usosCliente: Number(usos[0]?.del_cliente) || 0,
        yaRedimido: usos[0]?.ya_redimido === true,
    });
    return veredicto.ok && cupon ? { ok: true, cupon } : { ok: false, motivo: (veredicto as { motivo: MotivoCupon }).motivo };
}

/**
 * De la solicitud (manual o cupón) a la definición que se guarda. El cupón
 * manda sobre el manual. Lanza `DescuentoError` con un mensaje para el vendedor.
 */
export async function resolverDescuento(
    orgId: string,
    solicitud: DescuentoSolicitud,
    ctx: { moneda: string; clienteId?: string | null; cotizacionId?: string | null; documentoId?: string | null; ivaIncluido?: boolean },
): Promise<DescuentoDef | null> {
    const ivaIncluido = ctx.ivaIncluido ? { iva_incluido: true as const } : {};
    if (solicitud.cupon) {
        const r = await validarCupon(orgId, solicitud.cupon, ctx);
        if (!r.ok) throw new DescuentoError(MENSAJE_CUPON[r.motivo], `coupon_${r.motivo}`, r.motivo === 'no_existe' ? 404 : 409);
        return {
            tipo: r.cupon.tipo,
            valor: r.cupon.valor,
            codigo: r.cupon.codigo,
            cupon_id: r.cupon.id,
            ...(r.cupon.tipo === 'monto' ? ivaIncluido : {}),
        };
    }
    const manual = solicitud.manual;
    if (!manual) return null;
    if (manual.tipo === 'monto') {
        const decimals = currencyDecimals(normalizeCurrency(ctx.moneda));
        const f = 10 ** decimals;
        const valor = Math.round((manual.valor + Number.EPSILON) * f) / f;
        return valor > 0 ? { tipo: 'monto', valor, ...ivaIncluido } : null;
    }
    return { tipo: 'porcentaje', valor: manual.valor };
}

export type ResultadoRedencion = 'ok' | 'agotado' | 'agotado_cliente' | 'no_existe';

/**
 * Registra el uso del cupón de un documento que se vuelve vinculante. Sin
 * cupón no hace nada y responde 'ok'.
 */
export async function redimirCupon(
    orgId: string,
    def: DescuentoDef | null | undefined,
    doc: { clienteId?: string | null; cotizacionId?: string | null; documentoId?: string | null; monto: number; moneda: string },
): Promise<ResultadoRedencion> {
    if (!def?.cupon_id) return 'ok';
    const [rows] = await withOrgTx(orgId, sql`
        select cord_cupon_redimir(${orgId}::uuid, ${def.cupon_id}::uuid, ${uuidOrNull(doc.clienteId)}::uuid,
               ${uuidOrNull(doc.cotizacionId)}::uuid, ${uuidOrNull(doc.documentoId)}::uuid,
               ${Number(doc.monto) || 0}::numeric, ${normalizeCurrency(doc.moneda)}) as r`);
    const r = String(rows[0]?.r || 'no_existe');
    return (['ok', 'agotado', 'agotado_cliente', 'no_existe'] as const).includes(r as ResultadoRedencion)
        ? r as ResultadoRedencion : 'no_existe';
}

/** Devuelve los usos de un documento anulado o rechazado. Idempotente. */
export async function liberarCupon(orgId: string, doc: { cotizacionId?: string | null; documentoId?: string | null }): Promise<number> {
    const cotizacionId = uuidOrNull(doc.cotizacionId);
    const documentoId = uuidOrNull(doc.documentoId);
    if (!cotizacionId && !documentoId) return 0;
    const [rows] = await withOrgTx(orgId, sql`
        select cord_cupon_liberar(${orgId}::uuid, ${cotizacionId}::uuid, ${documentoId}::uuid) as n`);
    return Number(rows[0]?.n) || 0;
}

// ── Administración (Ajustes › Cupones) ──────────────────────────────────────

export interface CuponInput {
    codigo: string;
    nombre: string | null;
    tipo: TipoDescuento;
    valor: number;
    moneda: string | null;
    vigente_desde: string | null;
    vigente_hasta: string | null;
    max_usos: number | null;
    max_usos_por_cliente: number | null;
    activo: boolean;
}

/**
 * Valida el alta o la edición de un cupón. `monedas` = las que la organización
 * puede ofrecer (regla 28): un cupón de monto en una divisa en la que el
 * negocio no cotiza no se podría aplicar nunca.
 */
export function validarCuponInput(body: Record<string, any>, monedas: string[]):
    | { ok: true; value: CuponInput }
    | { ok: false; error: string } {
    const codigo = normalizarCodigo(body.codigo);
    if (!codigo) return { ok: false, error: 'El código debe tener de 3 a 32 letras, números, guion o guion bajo.' };
    const nombre = typeof body.nombre === 'string' && body.nombre.trim() ? body.nombre.trim().replace(/\s+/g, ' ').slice(0, 80) : null;
    const tipo = body.tipo === 'monto' ? 'monto' : body.tipo === 'porcentaje' ? 'porcentaje' : null;
    if (!tipo) return { ok: false, error: 'Elige si el cupón es un porcentaje o un monto.' };
    let valor = Number(body.valor);
    if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'El valor del cupón debe ser mayor que cero.' };
    let moneda: string | null = null;
    if (tipo === 'porcentaje') {
        if (valor > 100) return { ok: false, error: 'Un cupón no puede descontar más del 100 %.' };
        valor = Math.round(valor * 10000) / 10000;
    } else {
        moneda = normalizeCurrency(body.moneda, '');
        if (!moneda || !monedas.includes(moneda)) return { ok: false, error: 'Elige la divisa del cupón.' };
        if (valor > MONTO_MAXIMO) return { ok: false, error: 'El monto del cupón no es válido.' };
        const f = 10 ** currencyDecimals(moneda);
        valor = Math.round((valor + Number.EPSILON) * f) / f;
        if (!(valor > 0)) return { ok: false, error: 'El valor del cupón debe ser mayor que cero.' };
    }
    const desde = body.vigente_desde ? String(body.vigente_desde) : null;
    const hasta = body.vigente_hasta ? String(body.vigente_hasta) : null;
    if (desde && !isISODate(desde)) return { ok: false, error: 'La fecha de inicio no es válida.' };
    if (hasta && !isISODate(hasta)) return { ok: false, error: 'La fecha de fin no es válida.' };
    if (desde && hasta && hasta < desde) return { ok: false, error: 'La vigencia termina antes de empezar.' };
    const tope = (v: unknown, nombreCampo: string): number | null | string => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 1_000_000) return `${nombreCampo} debe ser un número entero de 1 en adelante.`;
        return n;
    };
    const maxUsos = tope(body.max_usos, 'El límite de usos');
    if (typeof maxUsos === 'string') return { ok: false, error: maxUsos };
    const maxCliente = tope(body.max_usos_por_cliente, 'El límite por cliente');
    if (typeof maxCliente === 'string') return { ok: false, error: maxCliente };
    return {
        ok: true,
        value: {
            codigo, nombre, tipo, valor, moneda,
            vigente_desde: desde, vigente_hasta: hasta,
            max_usos: maxUsos, max_usos_por_cliente: maxCliente,
            activo: body.activo !== false,
        },
    };
}

export async function listarCupones(orgId: string): Promise<Cupon[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select * from cupones where org_id = ${orgId} order by activo desc, created_at desc limit 500`);
    return rows.map(cuponDesdeFila);
}
