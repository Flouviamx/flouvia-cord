// Claves del SAT para los conceptos de un CFDI 4.0: c_ClaveProdServ (qué se
// vende) y c_ClaveUnidad (en qué unidad).
//
// Antes todo CFDI salía con 01010101 ("No existe en el catálogo") y H87
// (pieza), incluso una hora de consultoría o una licencia anual. Es aceptado
// al timbrar, pero el receptor no puede clasificar el gasto y una auditoría lo
// señala. Ahora cada producto puede llevar sus dos claves; las facturas las
// toman de ahí y, sin clave de unidad explícita, se deduce de la unidad que el
// negocio ya escribió ("hora" → HUR).
//
// Módulo puro y sin imports: lo usan el modal de producto (navegador), las
// acciones y la emisión fiscal (servidor) y los tests.
//
// El catálogo de c_ClaveProdServ tiene más de 50 000 claves: no se embebe. Se
// busca en vivo contra el catálogo del PAC (/api/fiscal/catalogo-sat). El de
// unidades sí cabe en una lista corta con las de uso real en cotizaciones;
// cualquier otra clave válida del SAT se puede escribir a mano.

/** Clave por defecto del SAT cuando no se clasificó el concepto. */
export const DEFAULT_PRODUCT_KEY = '01010101';
/** Clave por defecto de unidad: pieza / elemento. */
export const DEFAULT_UNIT_KEY = 'H87';

/** c_ClaveProdServ: 8 dígitos. */
export function isProductKey(value: unknown): boolean {
    return typeof value === 'string' && /^\d{8}$/.test(value);
}

/** c_ClaveUnidad: de 1 a 3 caracteres alfanuméricos en mayúscula (H87, E48, KGM, A9). */
export function isUnitKey(value: unknown): boolean {
    return typeof value === 'string' && /^[A-Z0-9]{1,3}$/.test(value);
}

export function normalizeProductKey(value: unknown): string | null {
    const v = String(value ?? '').replace(/\s/g, '');
    return v ? v : null;
}

export function normalizeUnitKey(value: unknown): string | null {
    const v = String(value ?? '').trim().toUpperCase();
    return v ? v : null;
}

export interface SatUnit {
    clave: string;
    nombre: string;
}

// Subconjunto de c_ClaveUnidad con las unidades que aparecen en cotizaciones:
// piezas y empaques (Rec. 21 de UN/ECE con prefijo X), masa, volumen, longitud,
// superficie, tiempo y servicios. Nombres tal cual el catálogo del SAT.
export const SAT_UNITS: readonly SatUnit[] = [
    { clave: 'H87', nombre: 'Pieza' },
    { clave: 'E48', nombre: 'Unidad de servicio' },
    { clave: 'ACT', nombre: 'Actividad' },
    { clave: 'E51', nombre: 'Trabajo' },
    { clave: 'C62', nombre: 'Uno' },
    { clave: 'SET', nombre: 'Conjunto' },
    { clave: 'KT', nombre: 'Kit' },
    { clave: 'PR', nombre: 'Par' },
    { clave: 'DZN', nombre: 'Docena' },
    { clave: 'XBX', nombre: 'Caja' },
    { clave: 'XPK', nombre: 'Paquete' },
    { clave: 'XRO', nombre: 'Rollo' },
    { clave: 'XSA', nombre: 'Saco' },
    { clave: 'XPX', nombre: 'Pallet' },
    { clave: 'KGM', nombre: 'Kilogramo' },
    { clave: 'GRM', nombre: 'Gramo' },
    { clave: 'TNE', nombre: 'Tonelada' },
    { clave: 'LBR', nombre: 'Libra' },
    { clave: 'LTR', nombre: 'Litro' },
    { clave: 'MLT', nombre: 'Mililitro' },
    { clave: 'GLL', nombre: 'Galón (EUA)' },
    { clave: 'MTR', nombre: 'Metro' },
    { clave: 'KMT', nombre: 'Kilómetro' },
    { clave: 'FOT', nombre: 'Pie' },
    { clave: 'MTK', nombre: 'Metro cuadrado' },
    { clave: 'MTQ', nombre: 'Metro cúbico' },
    { clave: 'MIN', nombre: 'Minuto' },
    { clave: 'HUR', nombre: 'Hora' },
    { clave: 'DAY', nombre: 'Día' },
    { clave: 'WEE', nombre: 'Semana' },
    { clave: 'MON', nombre: 'Mes' },
    { clave: 'ANN', nombre: 'Año' },
];

// La unidad que el negocio escribe (en español o inglés, las sugerencias del
// modal de producto y sus variantes comunes) → clave del SAT. Lo que no está
// aquí no se adivina: queda la clave por defecto o la que se capture a mano.
const UNIT_WORDS: Record<string, string> = {
    pieza: 'H87', piezas: 'H87', pza: 'H87', pz: 'H87', unidad: 'H87', unit: 'H87', units: 'H87', piece: 'H87', pc: 'H87', pcs: 'H87',
    servicio: 'E48', service: 'E48', proyecto: 'E48', project: 'E48', visita: 'E48', visit: 'E48',
    'sesión': 'E48', sesion: 'E48', session: 'E48', viaje: 'E48', trip: 'E48',
    licencia: 'E48', license: 'E48', usuario: 'E48', user: 'E48', asiento: 'E48', seat: 'E48',
    actividad: 'ACT', activity: 'ACT', trabajo: 'E51', job: 'E51',
    juego: 'SET', set: 'SET', conjunto: 'SET', kit: 'KT',
    par: 'PR', pair: 'PR', docena: 'DZN', dozen: 'DZN',
    caja: 'XBX', box: 'XBX', paquete: 'XPK', pack: 'XPK', package: 'XPK',
    rollo: 'XRO', roll: 'XRO', saco: 'XSA', bulto: 'XSA', bag: 'XSA', sack: 'XSA',
    tarima: 'XPX', pallet: 'XPX', palet: 'XPX',
    kg: 'KGM', kilo: 'KGM', kilogramo: 'KGM', kilogram: 'KGM',
    g: 'GRM', gr: 'GRM', gramo: 'GRM', gram: 'GRM',
    tonelada: 'TNE', ton: 'TNE', t: 'TNE', tonne: 'TNE',
    lb: 'LBR', libra: 'LBR', pound: 'LBR',
    l: 'LTR', lt: 'LTR', litro: 'LTR', liter: 'LTR', litre: 'LTR',
    ml: 'MLT', mililitro: 'MLT', milliliter: 'MLT',
    'galón': 'GLL', galon: 'GLL', gal: 'GLL', gallon: 'GLL',
    m: 'MTR', metro: 'MTR', meter: 'MTR', metre: 'MTR',
    km: 'KMT', 'kilómetro': 'KMT', kilometro: 'KMT', kilometer: 'KMT',
    pie: 'FOT', ft: 'FOT', foot: 'FOT', feet: 'FOT',
    'm²': 'MTK', m2: 'MTK', 'metro cuadrado': 'MTK', 'square meter': 'MTK',
    'm³': 'MTQ', m3: 'MTQ', 'metro cúbico': 'MTQ', 'metro cubico': 'MTQ', 'cubic meter': 'MTQ',
    min: 'MIN', minuto: 'MIN', minute: 'MIN',
    hora: 'HUR', horas: 'HUR', hr: 'HUR', h: 'HUR', hour: 'HUR', hours: 'HUR',
    'día': 'DAY', dia: 'DAY', 'días': 'DAY', dias: 'DAY', day: 'DAY', days: 'DAY',
    semana: 'WEE', week: 'WEE', mes: 'MON', month: 'MON', 'año': 'ANN', anio: 'ANN', year: 'ANN',
};

/** Clave de unidad que corresponde a la unidad escrita por el negocio, o null si no se reconoce. */
export function satUnitForUnit(unidad: unknown): string | null {
    const u = String(unidad ?? '').trim().toLowerCase().replace(/\.$/, '');
    return UNIT_WORDS[u] ?? null;
}

export function satUnitName(clave: unknown): string | null {
    return SAT_UNITS.find((u) => u.clave === clave)?.nombre ?? null;
}

/**
 * Claves SAT de un concepto a partir de su producto. Una clave explícita gana;
 * sin clave de unidad se deduce de la unidad escrita; sin nada, `undefined`
 * (el emisor aplica los defaults del SAT). Nunca devuelve una clave con
 * formato inválido: un dato roto en el catálogo no puede tumbar el timbrado.
 */
export function resolveLineSatKeys(product: {
    claveSat?: unknown; claveUnidadSat?: unknown; unidad?: unknown;
} | null | undefined): { productKey?: string; unitKey?: string } {
    if (!product) return {};
    const productKey = normalizeProductKey(product.claveSat);
    const unitKey = normalizeUnitKey(product.claveUnidadSat) ?? satUnitForUnit(product.unidad);
    return {
        ...(productKey && isProductKey(productKey) ? { productKey } : {}),
        ...(unitKey && isUnitKey(unitKey) ? { unitKey } : {}),
    };
}

/**
 * Claves SAT capturadas en UNA línea (editor, API, cotización). Antes solo un
 * producto del catálogo podía llevarlas: una línea libre —"Consultoría de
 * marzo", "Flete"— se timbraba siempre como 01010101 aunque el negocio supiera
 * su clave. `null` = la línea no trae clave propia. Acepta los nombres del
 * contrato HTTP (`clave_sat`, `clave_unidad_sat`) y los del dominio.
 */
export function lineSatKeysFrom(raw: unknown): { productKey: string | null; unitKey: string | null } {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
        productKey: normalizeProductKey(r.clave_sat ?? r.claveSat ?? r.productKey),
        unitKey: normalizeUnitKey(r.clave_unidad_sat ?? r.claveUnidadSat ?? r.unitKey),
    };
}

/**
 * Error de captura si alguna línea trae una clave con forma inválida. Se
 * rechaza al GUARDAR, con la línea nombrada: descubrirlo al timbrar deja un
 * borrador que no se puede emitir y un mensaje que llega tarde.
 */
export function lineSatKeyError(items: Array<{ descripcion?: unknown; productKey?: unknown; unitKey?: unknown }>): string | null {
    for (const it of items) {
        const nombre = String(it.descripcion || 'Concepto').slice(0, 60);
        if (it.productKey !== null && it.productKey !== undefined && it.productKey !== '' && !isProductKey(it.productKey)) {
            return `La clave de producto o servicio SAT de "${nombre}" debe tener 8 dígitos.`;
        }
        if (it.unitKey !== null && it.unitKey !== undefined && it.unitKey !== '' && !isUnitKey(it.unitKey)) {
            return `La clave de unidad SAT de "${nombre}" no es válida (por ejemplo H87, E48 o HUR).`;
        }
    }
    return null;
}

/**
 * Claves con las que se timbra un concepto: la clave EXPLÍCITA de la línea gana
 * sobre la de su producto, campo por campo; lo que la línea no trae se completa
 * con el producto (y la unidad deducida de su `unidad`). Sin nada, `{}` y el
 * emisor aplica los defaults del SAT. Nunca devuelve una clave inválida.
 */
export function effectiveLineSatKeys(
    line: { productKey?: unknown; unitKey?: unknown } | null | undefined,
    product: Parameters<typeof resolveLineSatKeys>[0],
): { productKey?: string; unitKey?: string } {
    const fromProduct = resolveLineSatKeys(product);
    const productKey = normalizeProductKey(line?.productKey);
    const unitKey = normalizeUnitKey(line?.unitKey);
    return {
        ...fromProduct,
        ...(productKey && isProductKey(productKey) ? { productKey } : {}),
        ...(unitKey && isUnitKey(unitKey) ? { unitKey } : {}),
    };
}
