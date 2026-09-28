// Qué ve el negocio en su hoja. Es el contrato central de la integración y vive
// aparte de los proveedores porque Google Sheets y Excel reciben exactamente la
// misma tabla; lo único que cambia entre ellos es cómo se escribe.
//
// Tres decisiones que no son de estilo:
//
//  - **Los importes viajan como NÚMERO, no como texto con símbolo.** Una hoja
//    existe para sumar, filtrar y graficar: "$1,234.50" es una cadena que no
//    suma. La divisa va en su propia columna, que además es la única forma
//    honesta de presentar un negocio que cotiza en dos monedas (regla 21) —
//    pegarle el símbolo al número escondería que la columna mezcla pesos y
//    dólares, y un SUM daría un total que no existe.
//  - **La fecha va como YYYY-MM-DD en la zona horaria de la organización**
//    (regla 24). Es el único formato que ordena bien como texto y que las dos
//    hojas reconocen como fecha sin importar el idioma del archivo.
//  - **El folio es la llave y vive en la columna A.** Así se vuelve a encontrar
//    la fila aunque la persona reordene, filtre o inserte columnas a la derecha.

export type Pestana = 'cotizaciones' | 'facturas';

export const CABECERAS: Record<Pestana, readonly string[]> = {
    cotizaciones: ['folio', 'cliente', 'estado', 'creada', 'vence', 'divisa', 'subtotal', 'descuento', 'impuestos', 'total', 'cobrado', 'link'],
    facturas: ['folio', 'cliente', 'estado', 'estado_fiscal', 'creada', 'vence', 'divisa', 'total', 'pagado', 'saldo', 'link'],
};

export type Celda = string | number;

/** Fecha en la zona de la organización. `en-CA` da YYYY-MM-DD sin armarlo a mano. */
export function fechaEnZona(valor: unknown, zona: string): string {
    if (!valor) return '';
    const d = valor instanceof Date ? valor : new Date(String(valor));
    if (Number.isNaN(d.getTime())) return '';
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch {
        // Una zona inválida guardada en la organización no puede dejar la fila sin fecha.
        return d.toISOString().slice(0, 10);
    }
}

/** Un importe siempre es número. Lo que no se puede leer entra como 0, no como texto. */
export function monto(valor: unknown): number {
    const n = Number(valor);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const texto = (valor: unknown, max = 200): string =>
    valor === null || valor === undefined ? '' : String(valor).slice(0, max);

export interface FilaCotizacion {
    folio?: unknown;
    cliente?: unknown;
    status?: unknown;
    created_at?: unknown;
    vigencia?: unknown;
    base_currency?: unknown;
    subtotal?: unknown;
    descuento?: unknown;
    iva?: unknown;
    total?: unknown;
    cobrado?: unknown;
    public_token?: unknown;
}

export interface FilaFactura {
    invoice_number?: unknown;
    cliente?: unknown;
    lifecycle?: unknown;
    status?: unknown;
    created_at?: unknown;
    due_date?: unknown;
    currency?: unknown;
    total?: unknown;
    amount_paid?: unknown;
    amount_remaining?: unknown;
    public_token?: unknown;
}

export function filaCotizacion(q: FilaCotizacion, zona: string, origen: string): Celda[] {
    return [
        texto(q.folio, 40),
        texto(q.cliente),
        texto(q.status, 30),
        fechaEnZona(q.created_at, zona),
        fechaEnZona(q.vigencia, zona),
        texto(q.base_currency, 3).toUpperCase(),
        monto(q.subtotal),
        monto(q.descuento),
        monto(q.iva),
        monto(q.total),
        monto(q.cobrado),
        q.public_token ? `${origen}/q/${texto(q.public_token, 64)}` : '',
    ];
}

export function filaFactura(f: FilaFactura, zona: string, origen: string): Celda[] {
    return [
        texto(f.invoice_number, 40),
        texto(f.cliente),
        texto(f.lifecycle, 30),
        texto(f.status, 30),
        fechaEnZona(f.created_at, zona),
        fechaEnZona(f.due_date, zona),
        texto(f.currency, 3).toUpperCase(),
        monto(f.total),
        monto(f.amount_paid),
        monto(f.amount_remaining),
        f.public_token ? `${origen}/i/${texto(f.public_token, 64)}` : '',
    ];
}

/**
 * De índice de columna a letra de hoja (0 → A, 26 → AA). Las dos APIs hablan en
 * rangos A1, así que el rango se calcula con el largo real de la cabecera en vez
 * de fijar una letra que se rompe al agregar una columna.
 */
export function columnaA1(indice: number): string {
    let n = indice + 1;
    let out = '';
    while (n > 0) {
        const resto = (n - 1) % 26;
        out = String.fromCharCode(65 + resto) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out;
}

/** Rango A1 de una fila completa de la pestaña, p. ej. `Cotizaciones!A7:L7`. */
export function rangoFila(hoja: string, pestana: Pestana, fila: number): string {
    return `${hoja}!A${fila}:${columnaA1(CABECERAS[pestana].length - 1)}${fila}`;
}
