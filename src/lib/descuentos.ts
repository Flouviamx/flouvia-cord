// Descuento de DOCUMENTO: el contrato puro (sin base de datos), compartido por
// el servidor y los editores del navegador.
//
// Un descuento se aplica a la venta completa, antes de impuestos, y lo reparte
// el motor (`calculateDocumentTotals`, opción `descuento`) entre las líneas en
// proporción a su importe bruto. Aquí viven tres cosas que no son aritmética:
//
//   - la DEFINICIÓN que se guarda con el documento (`DescuentoDef`) para
//     reabrir un borrador, recalcular una aprobación parcial o facturar una
//     cotización con el mismo descuento;
//   - la lectura del body HTTP (`leerDescuentoBody`): `descuento: {tipo, valor}`
//     o `cupon: 'CODIGO'`. Nunca un importe: el monto lo calcula el motor en
//     servidor;
//   - la etiqueta que imprimen las superficies ("Descuento (BIENVENIDA10)").
//
// El cupón (tabla `cupones`) se resuelve y se redime en src/lib/cupones.ts.

import type { DescuentoInput } from '../../packages/elements/src/engine';

export type TipoDescuento = 'porcentaje' | 'monto';

/** Definición de un descuento tal como se guarda en el documento. */
export interface DescuentoDef {
    tipo: TipoDescuento;
    /** Porcentaje en puntos (10 = 10 %) o monto en la divisa del documento. */
    valor: number;
    /** Código del cupón del que salió, si salió de uno. */
    codigo?: string;
    cupon_id?: string;
    /**
     * Solo factura: el monto se expresó sobre precios con impuesto incluido.
     * El borrador guarda sus precios ya sin impuesto, así que al reabrirlo ese
     * monto se convierte a su equivalente antes de impuestos.
     */
    iva_incluido?: boolean;
}

/** Lo que el navegador o la API piden; el servidor lo valida y lo resuelve. */
export interface DescuentoSolicitud {
    /** Descuento manual. `null` = sin descuento manual. */
    manual: { tipo: TipoDescuento; valor: number } | null;
    /** Código de cupón, ya normalizado. Si viene, manda sobre el manual. */
    cupon: string | null;
}

export const CODIGO_CUPON_RE = /^[A-Z0-9_-]{3,32}$/;
/** Techo defensivo de un monto: nada legítimo se acerca y evita overflow en minor units. */
export const MONTO_MAXIMO = 1e12;

/** Mayúsculas, sin espacios. `null` si no tiene la forma de un código. */
export function normalizarCodigo(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const codigo = value.trim().toUpperCase();
    return CODIGO_CUPON_RE.test(codigo) ? codigo : null;
}

/**
 * Lee el descuento del body: `descuento: { tipo, valor }` o `cupon: 'CODIGO'`.
 *
 * - Ninguna de las dos llaves → `{ presente: false }`: quien edita sin mandar
 *   el descuento (una acción de la API que solo cambia líneas) lo conserva.
 * - `descuento: null`, valor 0 o `cupon: ''` → presente y sin descuento.
 */
export function leerDescuentoBody(body: Record<string, unknown> | null | undefined):
    | { presente: false }
    | { presente: true; solicitud: DescuentoSolicitud }
    | { error: string } {
    if (!body || typeof body !== 'object') return { presente: false };
    const tieneManual = Object.prototype.hasOwnProperty.call(body, 'descuento');
    const tieneCupon = Object.prototype.hasOwnProperty.call(body, 'cupon');
    if (!tieneManual && !tieneCupon) return { presente: false };

    let cupon: string | null = null;
    if (tieneCupon && body.cupon !== null && body.cupon !== undefined && String(body.cupon).trim() !== '') {
        cupon = normalizarCodigo(body.cupon);
        if (!cupon) return { error: 'El código del cupón no es válido: usa de 3 a 32 letras, números, guion o guion bajo.' };
    }

    let manual: DescuentoSolicitud['manual'] = null;
    const raw = tieneManual ? body.descuento : null;
    if (raw !== null && raw !== undefined) {
        if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'El descuento debe ser { tipo, valor }.' };
        const tipo = (raw as any).tipo;
        const valor = Number((raw as any).valor);
        if (tipo !== 'porcentaje' && tipo !== 'monto') return { error: "El tipo de descuento debe ser 'porcentaje' o 'monto'." };
        if (!Number.isFinite(valor) || valor < 0) return { error: 'El descuento debe ser un número positivo.' };
        if (tipo === 'porcentaje' && valor > 100) return { error: 'Un descuento no puede pasar del 100 %.' };
        if (tipo === 'monto' && valor > MONTO_MAXIMO) return { error: 'El monto del descuento no es válido.' };
        if (valor > 0) manual = { tipo, valor: tipo === 'porcentaje' ? Math.round(valor * 10000) / 10000 : valor };
    }
    return { presente: true, solicitud: { manual, cupon } };
}

/** Lee una definición guardada (jsonb). Lo que no tiene forma de descuento es "sin descuento". */
export function descuentoDesdeJson(value: unknown): DescuentoDef | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    const tipo = v.tipo === 'porcentaje' || v.tipo === 'monto' ? v.tipo : null;
    const valor = Number(v.valor);
    if (!tipo || !Number.isFinite(valor) || valor <= 0 || (tipo === 'porcentaje' && valor > 100)) return null;
    const def: DescuentoDef = { tipo, valor };
    const codigo = normalizarCodigo(v.codigo);
    if (codigo) def.codigo = codigo;
    if (typeof v.cupon_id === 'string' && /^[0-9a-f-]{36}$/i.test(v.cupon_id)) def.cupon_id = v.cupon_id;
    if (v.iva_incluido === true) def.iva_incluido = true;
    return def;
}

/** Lo que recibe el motor: solo tipo y valor. */
export function descuentoParaMotor(def: DescuentoDef | null | undefined): DescuentoInput | null {
    return def ? { tipo: def.tipo, valor: def.valor } : null;
}

/**
 * Etiqueta del renglón de descuento: "Descuento (BIENVENIDA10)",
 * "Descuento (10 %)" o "Descuento". La misma en el resumen del editor, el
 * link público, el detalle y el PDF.
 */
export function etiquetaDescuento(def: Pick<DescuentoDef, 'tipo' | 'valor' | 'codigo'> | null | undefined, locale: string): string {
    const en = String(locale || '').toLowerCase().startsWith('en');
    const base = en ? 'Discount' : 'Descuento';
    if (!def) return base;
    if (def.codigo) return `${base} (${def.codigo})`;
    if (def.tipo === 'porcentaje') {
        const pct = new Intl.NumberFormat(en ? 'en-US' : 'es-MX', { maximumFractionDigits: 2 }).format(def.valor);
        return `${base} (${pct}${en ? '%' : ' %'})`;
    }
    return base;
}
