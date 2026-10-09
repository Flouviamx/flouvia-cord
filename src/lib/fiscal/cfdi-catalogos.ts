// Catálogos del SAT que Cord ofrece en pantalla para el CFDI 4.0, y las reglas
// de la factura global que el propio SAT valida.
//
// Fuentes primarias (verificadas oct 2026):
//   - Anexo 20 (DOF 13-ene-2022), estándar del CFDI 4.0: validaciones de
//     InformacionGlobal (Periodicidad, Meses, Año) y del Receptor genérico.
//   - SAT, "Guía de llenado del CFDI global", versión 4.0.
//   - SAT, "Preguntas frecuentes y escenarios de cancelación 2026" y "Esquema
//     de cancelación de CFDI": motivos 01–04.
//   - Facturapi, referencia de POST /invoices (objeto `global`) y de
//     DELETE /invoices/{id} (`motive`, `substitution`).
//
// Módulo puro y sin imports: lo usan el servidor, los editores y los tests.

/** c_Periodicidad → valor del objeto `global.periodicity` de Facturapi. */
export const PERIODICIDADES = {
    '01': { facturapi: 'day', es: 'Diaria', en: 'Daily' },
    '02': { facturapi: 'week', es: 'Semanal', en: 'Weekly' },
    '03': { facturapi: 'fortnight', es: 'Quincenal', en: 'Fortnightly' },
    '04': { facturapi: 'month', es: 'Mensual', en: 'Monthly' },
    '05': { facturapi: 'two_months', es: 'Bimestral', en: 'Bimonthly' },
} as const;
export type Periodicidad = keyof typeof PERIODICIDADES;

/** c_Meses: 01–12 un mes; 13–18 un bimestre (solo con periodicidad 05). */
export const MESES: Record<string, { es: string; en: string; desde: number; hasta: number }> = {
    '01': { es: 'Enero', en: 'January', desde: 1, hasta: 1 },
    '02': { es: 'Febrero', en: 'February', desde: 2, hasta: 2 },
    '03': { es: 'Marzo', en: 'March', desde: 3, hasta: 3 },
    '04': { es: 'Abril', en: 'April', desde: 4, hasta: 4 },
    '05': { es: 'Mayo', en: 'May', desde: 5, hasta: 5 },
    '06': { es: 'Junio', en: 'June', desde: 6, hasta: 6 },
    '07': { es: 'Julio', en: 'July', desde: 7, hasta: 7 },
    '08': { es: 'Agosto', en: 'August', desde: 8, hasta: 8 },
    '09': { es: 'Septiembre', en: 'September', desde: 9, hasta: 9 },
    '10': { es: 'Octubre', en: 'October', desde: 10, hasta: 10 },
    '11': { es: 'Noviembre', en: 'November', desde: 11, hasta: 11 },
    '12': { es: 'Diciembre', en: 'December', desde: 12, hasta: 12 },
    '13': { es: 'Enero-Febrero', en: 'January-February', desde: 1, hasta: 2 },
    '14': { es: 'Marzo-Abril', en: 'March-April', desde: 3, hasta: 4 },
    '15': { es: 'Mayo-Junio', en: 'May-June', desde: 5, hasta: 6 },
    '16': { es: 'Julio-Agosto', en: 'July-August', desde: 7, hasta: 8 },
    '17': { es: 'Septiembre-Octubre', en: 'September-October', desde: 9, hasta: 10 },
    '18': { es: 'Noviembre-Diciembre', en: 'November-December', desde: 11, hasta: 12 },
};

/** Régimen Incorporación Fiscal: el único que puede declarar periodicidad bimestral (05). */
export const REGIMEN_BIMESTRAL = '621';

export interface GlobalPeriodInput {
    periodicidad: string;
    meses: string;
    anio: number;
    /** Régimen fiscal del EMISOR (c_RegimenFiscal). */
    regimen?: string | null;
    /** Año de la fecha de emisión del comprobante (hora de México). */
    anioEmision: number;
}

/**
 * Reglas del nodo InformacionGlobal que valida el SAT (Anexo 20):
 *   - Periodicidad "05" exige RegimenFiscal "621".
 *   - Con "05", Meses es 13–18; con cualquier otra, 01–12.
 *   - Año = el de la fecha de emisión o el inmediato anterior.
 * Devuelve el error para el negocio, o null.
 */
export function globalPeriodError(p: GlobalPeriodInput): string | null {
    if (!Object.hasOwn(PERIODICIDADES, p.periodicidad)) return 'Elige la periodicidad de la factura global.';
    if (!Object.hasOwn(MESES, p.meses)) return 'Elige el mes o bimestre de la factura global.';
    const bimestral = p.periodicidad === '05';
    if (bimestral && String(p.regimen || '') !== REGIMEN_BIMESTRAL) {
        return 'La periodicidad bimestral solo aplica al régimen de Incorporación Fiscal (621).';
    }
    const n = Number(p.meses);
    if (bimestral && n < 13) return 'Con periodicidad bimestral elige un bimestre (Enero-Febrero, Marzo-Abril…).';
    if (!bimestral && n > 12) return 'Un bimestre solo se declara con periodicidad bimestral; elige un mes.';
    if (!Number.isInteger(p.anio) || (p.anio !== p.anioEmision && p.anio !== p.anioEmision - 1)) {
        return 'El año de la factura global debe ser el año en curso o el anterior.';
    }
    return null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

/**
 * Rango de fechas (ISO, ambos inclusive, en el calendario del negocio) de las
 * ventas que puede documentar una global. Mensual y bimestral cubren el mes o
 * bimestre completo; diaria, semanal y quincenal cubren el tramo que elija el
 * negocio dentro de ese mes (el CFDI solo declara mes y año).
 */
export function globalPeriodRange(
    p: { periodicidad: string; meses: string; anio: number; desde?: string | null; hasta?: string | null },
): { desde: string; hasta: string } | { error: string } {
    const m = MESES[p.meses];
    if (!m) return { error: 'Elige el mes o bimestre de la factura global.' };
    const inicio = `${p.anio}-${pad(m.desde)}-01`;
    const fin = `${p.anio}-${pad(m.hasta)}-${pad(lastDay(p.anio, m.hasta))}`;
    if (p.periodicidad === '04' || p.periodicidad === '05') return { desde: inicio, hasta: fin };
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const desde = p.desde && iso.test(p.desde) ? p.desde : null;
    const hasta = p.hasta && iso.test(p.hasta) ? p.hasta : null;
    if (!desde || !hasta) return { error: 'Indica las fechas de las ventas que cubre la factura global.' };
    if (desde > hasta) return { error: 'El periodo de la factura global termina antes de empezar.' };
    if (desde < inicio || hasta > fin) return { error: 'Las fechas deben caer dentro del mes que declara la factura global.' };
    const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
    if (p.periodicidad === '01' && dias !== 1) return { error: 'Una factura global diaria cubre las ventas de un solo día.' };
    if (p.periodicidad === '02' && dias > 7) return { error: 'Una factura global semanal cubre como máximo siete días.' };
    if (p.periodicidad === '03' && dias > 16) return { error: 'Una factura global quincenal cubre como máximo una quincena.' };
    return { desde, hasta };
}

/** c_FormaPago que una factura pagada puede declarar (sin "99 Por definir", que es de PPD). */
export const FORMAS_PAGO: Record<string, { es: string; en: string }> = {
    '01': { es: 'Efectivo', en: 'Cash' },
    '02': { es: 'Cheque nominativo', en: 'Nominal check' },
    '03': { es: 'Transferencia electrónica de fondos', en: 'Electronic funds transfer' },
    '04': { es: 'Tarjeta de crédito', en: 'Credit card' },
    '05': { es: 'Monedero electrónico', en: 'Electronic wallet' },
    '06': { es: 'Dinero electrónico', en: 'Electronic money' },
    '08': { es: 'Vales de despensa', en: 'Food vouchers' },
    '12': { es: 'Dación en pago', en: 'Payment in kind' },
    '13': { es: 'Pago por subrogación', en: 'Payment by subrogation' },
    '14': { es: 'Pago por consignación', en: 'Payment by consignment' },
    '15': { es: 'Condonación', en: 'Debt forgiveness' },
    '17': { es: 'Compensación', en: 'Offsetting' },
    '23': { es: 'Novación', en: 'Novation' },
    '24': { es: 'Confusión', en: 'Merger of rights' },
    '25': { es: 'Remisión de deuda', en: 'Debt remission' },
    '26': { es: 'Prescripción o caducidad', en: 'Statute of limitations' },
    '27': { es: 'A satisfacción del acreedor', en: 'To the creditor’s satisfaction' },
    '28': { es: 'Tarjeta de débito', en: 'Debit card' },
    '29': { es: 'Tarjeta de servicios', en: 'Service card' },
    '30': { es: 'Aplicación de anticipos', en: 'Application of advances' },
    '31': { es: 'Intermediario pagos', en: 'Payment intermediary' },
};

export function isFormaPago(v: unknown): v is string {
    return typeof v === 'string' && Object.hasOwn(FORMAS_PAGO, v);
}

/** c_UsoCFDI vigente para el CFDI 4.0. */
export const USOS_CFDI: Record<string, { es: string; en: string }> = {
    G01: { es: 'Adquisición de mercancías', en: 'Purchase of goods' },
    G02: { es: 'Devoluciones, descuentos o bonificaciones', en: 'Returns, discounts or rebates' },
    G03: { es: 'Gastos en general', en: 'General expenses' },
    I01: { es: 'Construcciones', en: 'Construction' },
    I02: { es: 'Mobiliario y equipo de oficina por inversiones', en: 'Office furniture and equipment' },
    I03: { es: 'Equipo de transporte', en: 'Transportation equipment' },
    I04: { es: 'Equipo de cómputo y accesorios', en: 'Computer equipment and accessories' },
    I05: { es: 'Dados, troqueles, moldes, matrices y herramental', en: 'Dies, molds and tooling' },
    I06: { es: 'Comunicaciones telefónicas', en: 'Telephone communications' },
    I07: { es: 'Comunicaciones satelitales', en: 'Satellite communications' },
    I08: { es: 'Otra maquinaria y equipo', en: 'Other machinery and equipment' },
    D01: { es: 'Honorarios médicos, dentales y gastos hospitalarios', en: 'Medical, dental and hospital fees' },
    D02: { es: 'Gastos médicos por incapacidad o discapacidad', en: 'Medical expenses for disability' },
    D03: { es: 'Gastos funerales', en: 'Funeral expenses' },
    D04: { es: 'Donativos', en: 'Donations' },
    D05: { es: 'Intereses reales por créditos hipotecarios (casa habitación)', en: 'Real interest on home mortgage loans' },
    D06: { es: 'Aportaciones voluntarias al SAR', en: 'Voluntary retirement contributions (SAR)' },
    D07: { es: 'Primas por seguros de gastos médicos', en: 'Medical insurance premiums' },
    D08: { es: 'Gastos de transportación escolar obligatoria', en: 'Mandatory school transportation' },
    D09: { es: 'Depósitos en cuentas para el ahorro o planes de pensiones', en: 'Savings or pension plan deposits' },
    D10: { es: 'Pagos por servicios educativos (colegiaturas)', en: 'Tuition payments' },
    S01: { es: 'Sin efectos fiscales', en: 'No tax effects' },
    CP01: { es: 'Pagos', en: 'Payments' },
    CN01: { es: 'Nómina', en: 'Payroll' },
};

export function isUsoCfdi(v: unknown): v is string {
    return typeof v === 'string' && Object.hasOwn(USOS_CFDI, v);
}

/**
 * Motivos de cancelación del SAT. `01` solo procede con un comprobante que ya
 * sustituyó al cancelado; `04` solo para una factura global de la que un
 * cliente pidió su factura nominativa.
 */
export const MOTIVOS_CANCELACION = {
    '01': {
        es: 'Comprobante emitido con errores con relación',
        en: 'Issued with errors, with a replacement',
        ayudaEs: 'Hay que corregirla con una factura nueva que la sustituya. Usa “Sustituir CFDI”.',
        ayudaEn: 'It must be corrected with a new invoice that replaces it. Use “Replace CFDI”.',
    },
    '02': {
        es: 'Comprobante emitido con errores sin relación',
        en: 'Issued with errors, without a replacement',
        ayudaEs: 'Tiene un error y no vas a emitir otra en su lugar: por ejemplo, la emitiste dos veces o al cliente equivocado.',
        ayudaEn: 'It has an error and you will not issue another in its place: for example, it was issued twice or to the wrong client.',
    },
    '03': {
        es: 'No se llevó a cabo la operación',
        en: 'The transaction did not take place',
        ayudaEs: 'La venta o el servicio no se concretó.',
        ayudaEn: 'The sale or service did not happen.',
    },
    '04': {
        es: 'Operación nominativa relacionada en una factura global',
        en: 'Named transaction included in a global invoice',
        ayudaEs: 'Un cliente pidió su factura de una venta incluida en esta global: se cancela y se vuelve a emitir sin esa venta.',
        ayudaEn: 'A client asked for an invoice of a sale included in this global invoice: it is cancelled and issued again without that sale.',
    },
} as const;
export type MotivoCancelacion = keyof typeof MOTIVOS_CANCELACION;

export function isMotivoCancelacion(v: unknown): v is MotivoCancelacion {
    return typeof v === 'string' && Object.hasOwn(MOTIVOS_CANCELACION, v);
}

/** Texto que se guarda en `void_reason` y en el historial: código y descripción del SAT. */
export function motivoTexto(code: MotivoCancelacion): string {
    return `${code} · ${MOTIVOS_CANCELACION[code].es}`;
}

/** Nombre del receptor que la regla del SAT reserva a la factura global. */
export const PUBLICO_EN_GENERAL = 'PUBLICO EN GENERAL';
export const RFC_GENERICO_NACIONAL = 'XAXX010101000';

/** ¿Este nombre es "PUBLICO EN GENERAL" (sin acentos ni mayúsculas que importen)? */
export function esNombrePublicoGeneral(nombre: unknown): boolean {
    return String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ') === PUBLICO_EN_GENERAL;
}
