// Sales tax de EE. UU. por la dirección del cliente — la mitad PURA.
//
// En Estados Unidos el impuesto al consumo no es una tasa nacional ni estatal:
// es la suma de la del estado, la del condado, la de la ciudad y la de los
// distritos especiales del DOMICILIO del comprador (o del vendedor, en los
// estados de origen). Una tabla de 51 tasas estatales (`US_STATE_TAX`) no
// alcanza: un negocio en Los Ángeles cobraba 7.25 % donde la ley pide ~9.5 %.
// Con la preferencia `orgs.us_tax_auto` encendida, la tasa de cada línea sale
// de un cálculo real por dirección, hecho en la cuenta de cobros del negocio
// (src/lib/us-tax/calculo.ts).
//
// Este archivo no toca red ni base: tipos, validación de direcciones, la
// conversión de la respuesta del proveedor al snapshot de Cord y los mensajes
// de fallo cerrado. Lo cargan el servidor, las pruebas y el check de
// `security:us-tax`.
//
// Reconciliación con el motor único (regla 23). La tasa que se congela en la
// línea es la tasa EFECTIVA del cálculo: impuesto ÷ base, con la precisión
// completa. Con ella, `calculateDocumentTotals()` —el mismo motor de siempre,
// con su redondeo por línea— reproduce al centavo el impuesto que el
// proveedor calculó para esa línea, también con precio con impuesto incluido
// (base = bruto − impuesto, tasa = impuesto ÷ base). Así el total que el
// documento cobra y el que se reporta a la autoridad son el mismo número, sin
// un segundo motor. Las tasas LEGALES (estado 6 %, condado 0.25 %…) viajan en
// el desglose por jurisdicción, que es lo que se imprime.

import { US_STATES, isUsState } from '../countries.ts';

export type UsTaxNivel = 'state' | 'county' | 'city' | 'district' | 'country';

/** Un impuesto de una jurisdicción sobre UNA línea. */
export interface UsTaxComponente {
    /** Jurisdicción ya legible: "California", "Los Angeles County", "Seattle". */
    nombre: string;
    nivel: UsTaxNivel;
    /** Porcentaje 0–100 (6, 0.25), como lo publica la jurisdicción. */
    tasa: number;
    /** Importe de esta jurisdicción en la línea, en la divisa (no en centavos). */
    impuesto: number;
}

/**
 * Por qué una línea calculada lleva 0 %: no es un error, es un dato que el
 * documento dice. `sin_registro` = el negocio no recauda en ese estado;
 * `exento` = cliente con certificado; `no_gravable` = el estado no grava ese
 * tipo de venta.
 */
export type UsTaxMotivo = 'sin_registro' | 'exento' | 'no_gravable';

/** Desglose congelado en la línea (`cotizacion_items.tax_breakdown`, `taxBreakdown`). */
export interface UsTaxDesglose {
    v: 1;
    /** Estado del destino (dos letras) y su nombre, para las notas del documento. */
    estado: string;
    estadoNombre: string;
    motivo: UsTaxMotivo | null;
    componentes: UsTaxComponente[];
    /** Número de certificado de exención, si `motivo = 'exento'`. */
    certificado?: string | null;
}

/** Una línea del cálculo guardado (`us_tax_calculos.lineas`). */
export interface UsTaxLinea {
    /** Referencia única en el cálculo: `L<índice>`. */
    ref: string;
    /** Importe enviado, en unidades mínimas (con impuesto si `incluido`). */
    monto: number;
    /** Impuesto calculado, en unidades mínimas. */
    impuesto: number;
    /** Tasa EFECTIVA, fracción con precisión completa: impuesto ÷ base. */
    tasa: number;
    desglose: UsTaxDesglose | null;
}

export interface UsAddress {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string;
    postal_code: string;
}

/**
 * Clasificación de lo que vende el negocio (código de producto del
 * proveedor). Lista CERRADA y corta a propósito: son los cuatro que el
 * proveedor documenta como generales y que cubren a casi cualquier negocio
 * que cotiza. Un código fuera de esta lista no se acepta (el proveedor
 * rechazaría uno inexistente con un error que no le dice nada al dueño).
 */
export const US_TAX_CODES: { code: string; es: string; en: string }[] = [
    { code: 'txcd_20030000', es: 'Servicios en general', en: 'General services' },
    { code: 'txcd_99999999', es: 'Bienes físicos en general', en: 'General tangible goods' },
    { code: 'txcd_10103001', es: 'Software como servicio (uso empresarial)', en: 'Software as a service (business use)' },
    { code: 'txcd_10000000', es: 'Servicios digitales en general', en: 'General electronically supplied services' },
];
export const US_TAX_DEFAULT_CODE = 'txcd_20030000';
export const isUsTaxCode = (code: unknown): code is string =>
    typeof code === 'string' && US_TAX_CODES.some((c) => c.code === code);

/** El proveedor admite hasta 100 conceptos por cálculo. */
export const US_TAX_MAX_LINEAS = 100;

/**
 * Un cálculo guardado se reusa al guardar el documento solo si es reciente:
 * las tasas cambian al inicio de cada trimestre y una vista previa de ayer no
 * prueba la de hoy. El proveedor lo deja usar 90 días para registrar la
 * transacción; para fijar la tasa de un documento nuevo, Cord pide un día.
 */
export const US_TAX_REUSO_MS = 24 * 60 * 60 * 1000;

/**
 * Tope de cálculos NUEVOS por documento y por día, en la vista previa del
 * editor. El proveedor cobra USD 0.05 por cálculo pasados los 10 que incluye
 * cada venta registrada (se reembolsan a fin de mes, sin acumularse), y un
 * editor abierto pide uno nuevo cada vez que cambia un importe. 20 cubre armar
 * a mano un documento de 15–20 conceptos; pasado eso el editor dice que
 * guardes (el guardado reusa el último cálculo, o hace el suyo) y el peor caso
 * de un documento que nunca se vende queda en USD 1.00 al día. El documento lo
 * nombra el editor (`cotizacion:<id>`, `documento:<id>` o `borrador:<id>` por
 * sesión de un documento nuevo): no es una credencial, solo un contador, y lo
 * que no se le puede creer lo acota el tope por organización.
 */
export const US_TAX_CALCULOS_DOCUMENTO_DIA = 20;

/**
 * Tope de cálculos nuevos por organización y por día, en cualquier camino
 * (editor, guardado, API, conciliación). Se suma a los 30 por minuto y 300 por
 * hora que ya existían: con solo esos, una organización podía pedir 7,200 al
 * día (USD 360). 500 al día es ~25 documentos editados a mano o ~150 creados
 * por API con su conciliación, y acota el peor caso a USD 25 al día.
 */
export const US_TAX_CALCULOS_ORG_DIA = 500;

/**
 * ¿Le cuesta a Cord registrar esta venta? El proveedor cobra la transacción
 * solo en estados donde el negocio está registrado para recaudar: una venta
 * cuyas líneas son todas 0 % "sin obligación de recaudar" (`sin_registro`) se
 * registra igual para la declaración, pero no consume cuota. Una línea
 * gravada, exenta por certificado o no gravable en un estado registrado sí.
 */
export function usTaxVentaCobrable(lineas: Pick<UsTaxLinea, 'desglose'>[]): boolean {
    return lineas.some((l) => !!l.desglose && l.desglose.motivo !== 'sin_registro');
}

const DOC_CLAVE_RE =/^(cotizacion|documento|borrador):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** La clave de documento que manda el editor, o null si no es una de las tres formas. */
export function usTaxDocumentoClave(raw: unknown): string | null {
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return DOC_CLAVE_RE.test(s) ? s : null;
}

const ZIP_RE = /^\d{5}(-\d{4})?$/;

const texto = (v: unknown, max = 200): string | null => {
    const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    return s ? s.slice(0, max) : null;
};

/** Normaliza una dirección capturada; `null` si no es de EE. UU. reconocible. */
export function normalizeUsAddress(raw: unknown): UsAddress | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const state = String(r.state ?? r.region ?? '').trim().toUpperCase();
    const zip = String(r.postal_code ?? r.cp ?? '').trim();
    return {
        line1: texto(r.line1),
        line2: texto(r.line2),
        city: texto(r.city ?? r.ciudad, 100),
        state,
        postal_code: zip,
    };
}

export type UsAddressFaltante = 'line1' | 'city' | 'state' | 'postal_code';

/**
 * Qué le falta a una dirección para calcular. El domicilio del NEGOCIO va
 * completo (`completa`): es su lugar de negocio ante el estado y el proveedor
 * lo ubica a nivel de calle. Del cliente bastan estado y ZIP de 5 dígitos —
 * con calle y ciudad el cálculo es más preciso, y se mandan si están—: el ZIP
 * solo se calcula en su centroide, que es lo que el proveedor documenta.
 */
export function usAddressFaltante(addr: UsAddress | null, completa = false): UsAddressFaltante | null {
    if (!addr || !isUsState(addr.state)) return 'state';
    if (!ZIP_RE.test(addr.postal_code)) return 'postal_code';
    if (completa && !addr.line1) return 'line1';
    if (completa && !addr.city) return 'city';
    return null;
}

export function usStateName(code: string): string {
    const c = String(code || '').toUpperCase();
    return US_STATES.find((s) => s.code === c)?.name ?? c;
}

/**
 * ¿Aplica el cálculo por dirección a este documento? Solo para un negocio de
 * EE. UU. con la preferencia encendida y un cliente en EE. UU. (un cliente
 * sin país guardado hereda el del negocio, igual que en sus facturas).
 */
export function usTaxApplies(input: { orgCountry: string; auto: boolean; clienteCountry?: string | null }): boolean {
    if (String(input.orgCountry || '').toUpperCase() !== 'US' || !input.auto) return false;
    const pais = String(input.clienteCountry || input.orgCountry).toUpperCase();
    return pais === 'US';
}

/**
 * Tasa efectiva de una línea: el impuesto sobre la base imponible. Con precio
 * con impuesto incluido la base es el bruto menos el impuesto. Precisión
 * completa — redondearla haría que el motor no reprodujera el centavo.
 */
export function effectiveRate(montoMinor: number, impuestoMinor: number, incluido: boolean): number {
    const base = incluido ? montoMinor - impuestoMinor : montoMinor;
    if (!(base > 0) || !(impuestoMinor > 0)) return 0;
    return impuestoMinor / base;
}

/** "LOS ANGELES" → "Los Angeles". Respeta lo que ya viene con mayúsculas y minúsculas. */
function titulo(s: string): string {
    const limpio = String(s || '').trim().replace(/\s+/g, ' ');
    if (!limpio) return '';
    if (limpio !== limpio.toUpperCase()) return limpio;
    return limpio.toLowerCase().replace(/(^|[\s\-/'(])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** El nombre impreso de una jurisdicción: "Los Angeles County", "Seattle". */
export function jurisdictionName(displayName: string, nivel: UsTaxNivel): string {
    const nombre = titulo(displayName);
    if (nivel === 'county' && !/\b(county|parish|borough|municipality)\b/i.test(nombre)) return `${nombre} County`;
    return nombre;
}

const NIVELES = new Set<UsTaxNivel>(['state', 'county', 'city', 'district', 'country']);

/**
 * Convierte el desglose por jurisdicción de una línea del proveedor al de
 * Cord. Solo las jurisdicciones que de verdad gravaron (`tax_rate_details` no
 * nulo y tasa > 0) son componentes; el motivo de un 0 % se conserva aparte.
 */
export function desgloseFromStripe(
    breakdown: any[] | null | undefined,
    ctx: { estado: string; decimals: number; certificado?: string | null },
): UsTaxDesglose {
    const f = 10 ** ctx.decimals;
    const componentes: UsTaxComponente[] = [];
    const razones = new Set<string>();
    for (const b of Array.isArray(breakdown) ? breakdown : []) {
        razones.add(String(b?.taxability_reason || ''));
        const tasa = Number(b?.tax_rate_details?.percentage_decimal);
        if (!b?.tax_rate_details || !(tasa > 0)) continue;
        const nivel = NIVELES.has(b?.jurisdiction?.level) ? b.jurisdiction.level as UsTaxNivel : 'district';
        componentes.push({
            nombre: jurisdictionName(String(b?.jurisdiction?.display_name || ''), nivel),
            nivel,
            tasa,
            impuesto: Math.round(Number(b?.amount) || 0) / f,
        });
    }
    const gravo = componentes.some((c) => c.impuesto > 0);
    let motivo: UsTaxMotivo | null = null;
    if (!gravo) {
        if (razones.has('customer_exempt')) motivo = 'exento';
        else if (razones.has('not_collecting')) motivo = 'sin_registro';
        else motivo = 'no_gravable';
    }
    return {
        v: 1,
        estado: ctx.estado,
        estadoNombre: usStateName(ctx.estado),
        motivo,
        componentes: gravo ? componentes : [],
        ...(motivo === 'exento' && ctx.certificado ? { certificado: ctx.certificado } : {}),
    };
}

/**
 * Las líneas del cálculo, en el orden del documento. `enviadas[i]` es el
 * índice de la línea del proveedor que corresponde a la línea `i` del
 * documento, o -1 si no se mandó (importe 0: el proveedor exige importes
 * positivos, y una línea en 0 no causa impuesto).
 */
export function lineasFromStripe(
    stripeLines: any[],
    montos: number[],
    ctx: { estado: string; decimals: number; incluido: boolean; certificado?: string | null },
): UsTaxLinea[] {
    const porRef = new Map<string, any>();
    for (const l of stripeLines) porRef.set(String(l?.reference), l);
    return montos.map((monto, i) => {
        const ref = `L${i}`;
        const l = porRef.get(ref);
        if (!l) return { ref, monto, impuesto: 0, tasa: 0, desglose: null };
        const impuesto = Math.round(Number(l.amount_tax) || 0);
        return {
            ref,
            monto,
            impuesto,
            tasa: effectiveRate(monto, impuesto, ctx.incluido),
            desglose: desgloseFromStripe(l.tax_breakdown, ctx),
        };
    });
}

/**
 * Lo que identifica un cálculo: si cualquier dato cambia, la tasa guardada ya
 * no prueba nada para este documento. Texto canónico; el sha256 lo saca quien
 * tiene `node:crypto`.
 */
export function huellaTexto(input: {
    currency: string;
    destino: UsAddress;
    exento: boolean;
    incluido: boolean;
    taxCode: string;
    montos: number[];
}): string {
    const d = input.destino;
    return JSON.stringify([
        'us-tax/v1',
        input.currency.toUpperCase(),
        [d.line1 || '', d.line2 || '', d.city || '', d.state, d.postal_code],
        input.exento ? 1 : 0,
        input.incluido ? 1 : 0,
        input.taxCode,
        input.montos,
    ]);
}

// ── Fallo cerrado ───────────────────────────────────────────────────────────
// Regla 22 aplicada al sales tax: una tasa que no se puede demostrar no se
// inventa. Cada motivo dice EXACTAMENTE qué falta, en el vocabulario del dueño
// del negocio (regla 14: nunca el nombre del proveedor ni de una variable).

export type UsTaxErrorCode =
    | 'cuenta_cobros' | 'origen_incompleto' | 'sin_registros' | 'configuracion_pendiente'
    | 'direccion_cliente' | 'direccion_invalida' | 'certificado' | 'demasiadas_lineas'
    | 'registro_desincronizado' | 'calculo_vencido' | 'limite' | 'no_disponible' | 'plan'
    | 'limite_documento' | 'limite_dia' | 'cuota' | 'cuota_techo';

const MENSAJES: Record<UsTaxErrorCode, { es: string; en: string; status: number }> = {
    cuenta_cobros: {
        es: 'El cálculo automático del sales tax usa la cuenta de cobros de tu negocio. Actívala en Ajustes › Cobros.',
        en: 'Automatic sales tax uses your business payments account. Set it up in Settings › Payments.',
        status: 409,
    },
    origen_incompleto: {
        es: 'Falta el domicilio completo de tu negocio (calle, ciudad, estado y ZIP) en Ajustes › Impuestos para calcular el sales tax por dirección.',
        en: 'Your business address (street, city, state and ZIP) is missing in Settings › Taxes, so sales tax cannot be calculated by address.',
        status: 409,
    },
    sin_registros: {
        es: 'Agrega en Ajustes › Impuestos al menos un estado donde tu negocio recauda sales tax.',
        en: 'Add at least one state where your business collects sales tax in Settings › Taxes.',
        status: 409,
    },
    configuracion_pendiente: {
        es: 'El cálculo automático del sales tax todavía no está listo: revisa el domicilio y los estados en Ajustes › Impuestos.',
        en: 'Automatic sales tax is not ready yet: review your address and states in Settings › Taxes.',
        status: 409,
    },
    direccion_cliente: {
        es: 'Para calcular el sales tax, la dirección del cliente necesita su estado y un ZIP de EE. UU. de 5 dígitos.',
        en: "To calculate sales tax, the client's address needs its state and a 5-digit US ZIP code.",
        status: 422,
    },
    direccion_invalida: {
        es: 'No pudimos ubicar la dirección del cliente para calcular el sales tax. Revisa la calle, la ciudad, el estado y el ZIP.',
        en: "We could not locate the client's address to calculate sales tax. Check the street, city, state and ZIP.",
        status: 422,
    },
    certificado: {
        es: 'El cliente está marcado como exento, pero no tiene número de certificado de exención. Agrégalo en su ficha.',
        en: 'The client is marked tax-exempt but has no exemption certificate number. Add it to the client profile.',
        status: 422,
    },
    demasiadas_lineas: {
        es: 'El cálculo automático del sales tax admite hasta 100 conceptos por documento.',
        en: 'Automatic sales tax supports up to 100 line items per document.',
        status: 422,
    },
    registro_desincronizado: {
        es: 'Uno de tus estados registrados no está activo en el cálculo automático. Vuelve a guardar los estados en Ajustes › Impuestos.',
        en: 'One of your registered states is not active in automatic calculation. Save your states again in Settings › Taxes.',
        status: 409,
    },
    calculo_vencido: {
        es: 'El cálculo del sales tax de este documento ya no es válido. Guárdalo de nuevo para recalcularlo.',
        en: 'The sales tax calculation for this document is no longer valid. Save it again to recalculate.',
        status: 409,
    },
    limite: {
        es: 'Demasiados cálculos de sales tax en poco tiempo. Espera un minuto e intenta de nuevo.',
        en: 'Too many sales tax calculations in a short time. Wait a minute and try again.',
        status: 429,
    },
    no_disponible: {
        es: 'El cálculo automático del sales tax no está disponible en este momento. Intenta de nuevo en unos minutos; no se usó ninguna tasa estimada.',
        en: 'Automatic sales tax is not available right now. Try again in a few minutes; no estimated rate was used.',
        status: 503,
    },
    plan: {
        es: 'El cálculo automático del sales tax por dirección está disponible desde el plan Starter.',
        en: 'Automatic sales tax by address is available from the Starter plan.',
        status: 402,
    },
    limite_documento: {
        es: 'Este documento llegó a los {n} cálculos de sales tax de hoy. Guárdalo para fijar su impuesto; mañana puedes volver a recalcularlo.',
        en: 'This document reached today’s {n} sales tax calculations. Save it to lock in its tax; you can recalculate it again tomorrow.',
        status: 429,
    },
    limite_dia: {
        es: 'Tu negocio llegó a los {n} cálculos de sales tax de hoy. Se renuevan en 24 horas; mientras tanto, captura la tasa a mano.',
        en: 'Your business reached today’s {n} sales tax calculations. They renew in 24 hours; until then, enter the rate manually.',
        status: 429,
    },
    // La cuota incluida del plan, sin cobro de excedente disponible: se dice
    // ANTES de guardar el documento, para que el negocio decida.
    cuota: {
        es: 'Llegaste a las {n} facturas con sales tax automático de tu plan este mes. Mejora tu plan o captura la tasa a mano (apaga el cálculo automático en Ajustes › Impuestos).',
        en: 'You reached the {n} invoices with automatic sales tax included in your plan this month. Upgrade your plan or enter the rate manually (turn off automatic calculation in Settings › Taxes).',
        status: 402,
    },
    // Con excedente cobrable: el techo de seguridad (10× lo incluido).
    cuota_techo: {
        es: 'Tu negocio tuvo un uso excepcionalmente alto de sales tax automático este mes. Escríbenos para desbloquearlo; mientras tanto, captura la tasa a mano.',
        en: 'Your business had unusually high automatic sales tax usage this month. Contact us to unlock it; until then, enter the rate manually.',
        status: 429,
    },
};

type MensajeVars = Record<string, string | number>;
const conVars = (texto: string, vars?: MensajeVars) =>
    vars ? texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : texto;

export class UsTaxError extends Error {
    code: UsTaxErrorCode;
    status: number;
    constructor(code: UsTaxErrorCode, locale: string = 'es', cause?: unknown, vars?: MensajeVars) {
        const m = MENSAJES[code];
        super(conVars(String(locale).startsWith('en') ? m.en : m.es, vars));
        this.name = 'UsTaxError';
        this.code = code;
        this.status = m.status;
        if (cause) this.cause = cause;
    }
}

export function usTaxMessage(code: UsTaxErrorCode, locale: string = 'es', vars?: MensajeVars): string {
    const m = MENSAJES[code];
    return conVars(String(locale).startsWith('en') ? m.en : m.es, vars);
}

/**
 * Traduce un error del proveedor a un motivo de Cord. Nunca devuelve su
 * mensaje: solo el código que el dueño del negocio puede accionar.
 */
export function usTaxErrorFromProvider(error: any): UsTaxErrorCode {
    const code = String(error?.code || '');
    const param = String(error?.param || '');
    const status = Number(error?.stripeStatus) || 0;
    if (code === 'customer_tax_location_invalid' || param.startsWith('customer_details[address]')) return 'direccion_invalida';
    if (code === 'tax_id_invalid') return 'direccion_invalida';
    if (code === 'rate_limit' || status === 429) return 'limite';
    if (status >= 500 || !status) return 'no_disponible';
    // Una solicitud que el proveedor rechaza por la configuración de la cuenta
    // (domicilio, clasificación, activación) no se arregla reintentando: se
    // dice que falta configurar. Una llave inválida (401) es problema de Cord,
    // no del negocio: se trata como no disponible.
    if (status === 400 || status === 402 || status === 403 || status === 404) return 'configuracion_pendiente';
    return 'no_disponible';
}
