// Impuestos COMPUESTOS: una tasa de la línea que en realidad son dos impuestos.
//
// En Canadá, Quebec, Columbia Británica, Saskatchewan y Manitoba cobran su
// impuesto provincial (QST, PST, RST) JUNTO al 5% federal de GST, no en su
// lugar. Una venta en Montreal lleva GST 5% + QST 9.975% sobre la misma base, y
// la factura tiene que mostrar los dos importes por separado: el cliente
// recupera cada uno ante una autoridad distinta (la CRA y Revenu Québec).
//
// La línea conserva UNA tasa (14.975%): el motor, el redondeo por línea y todos
// los rieles siguen igual. Lo que cambia es la PRESENTACIÓN del desglose: un
// renglón de 14.975% se dibuja como dos, GST y QST. El federal se calcula sobre
// la base y el provincial se queda con el resto, así que los dos suman
// exactamente lo que el documento ya cobró — un desglose que no cuadra con su
// propio total sería peor que no desglosar.
//
// Sin imports a propósito: lo cargan los editores en el navegador, el PDF en
// servidor y los checks con el runtime de Node.

export interface TaxComponent {
    /** Nombre corto del impuesto: 'GST', 'QST', 'HST'… */
    nombre: string;
    /** Porcentaje 0–100. */
    tasa: number;
}

export interface TaxComponentAmount extends TaxComponent {
    impuesto: number;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

// Nombres en francés: la otra lengua oficial, y la del documento en Quebec.
const NOMBRES: Record<string, { en: string; fr: string }> = {
    GST: { en: 'GST', fr: 'TPS' },
    HST: { en: 'HST', fr: 'TVH' },
    QST: { en: 'QST', fr: 'TVQ' },
    PST: { en: 'PST', fr: 'TVP' },
    RST: { en: 'RST', fr: 'TVD' },
};
const nombre = (clave: string, lang?: string) => (lang === 'fr' ? NOMBRES[clave].fr : NOMBRES[clave].en);

const GST = 5;

/**
 * Los impuestos que componen una tasa, o `null` si el país no los compone.
 *
 * `ratePct` en porcentaje (14.975, no 0.14975). `region` es la provincia del
 * EMISOR: decide cómo se llama el 7% provincial, que en Manitoba es RST y en
 * Columbia Británica PST — la misma tasa con dos nombres. Sin provincia se usa
 * PST, que es como se le conoce en general.
 *
 * Para Canadá también nombra las tasas simples (GST 5%, HST 13%): el renglón
 * dice qué impuesto es, no "GST/HST 13%".
 */
export function taxComponents(
    country: string,
    ratePct: number,
    opts: { region?: string | null; lang?: string } = {},
): TaxComponent[] | null {
    if (String(country || '').toUpperCase() !== 'CA') return null;
    const rate = Number(ratePct);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const { lang } = opts;
    const region = String(opts.region || '').toUpperCase();

    if (near(rate, GST)) return [{ nombre: nombre('GST', lang), tasa: GST }];
    if (near(rate, 13) || near(rate, 14) || near(rate, 15)) return [{ nombre: nombre('HST', lang), tasa: rate }];
    if (near(rate, GST + 9.975)) return [{ nombre: nombre('GST', lang), tasa: GST }, { nombre: nombre('QST', lang), tasa: 9.975 }];
    if (near(rate, GST + 7)) {
        const manitoba = region === 'MB' || region === 'MANITOBA';
        return [{ nombre: nombre('GST', lang), tasa: GST }, { nombre: nombre(manitoba ? 'RST' : 'PST', lang), tasa: 7 }];
    }
    if (near(rate, GST + 6)) return [{ nombre: nombre('GST', lang), tasa: GST }, { nombre: nombre('PST', lang), tasa: 6 }];
    return null;
}

const redondear = (n: number, decimals: number) => {
    const f = 10 ** decimals;
    return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
};

/**
 * Reparte el impuesto de un renglón del desglose entre sus componentes.
 *
 * Cada componente salvo el último se calcula sobre la base (redondeado a la
 * divisa); el último se queda con la diferencia, de modo que la suma es
 * EXACTAMENTE `impuesto`. Con un solo componente devuelve el renglón tal cual,
 * ya con su nombre. `null` = el país no compone sus tasas.
 */
export function splitTaxBucket(
    country: string,
    ratePct: number,
    base: number,
    impuesto: number,
    opts: { region?: string | null; lang?: string; decimals?: number } = {},
): TaxComponentAmount[] | null {
    const componentes = taxComponents(country, ratePct, opts);
    if (!componentes) return null;
    if (componentes.length === 1) return [{ ...componentes[0], impuesto }];
    const decimals = opts.decimals ?? 2;
    let asignado = 0;
    return componentes.map((c, i) => {
        if (i === componentes.length - 1) return { ...c, impuesto: redondear(impuesto - asignado, decimals) };
        const parte = redondear(base * c.tasa / 100, decimals);
        asignado += parte;
        return { ...c, impuesto: parte };
    });
}

/** '5%' · '9.975%' — sin ceros de relleno. */
export const fmtTaxPct = (tasa: number) => `${Math.round(tasa * 1000) / 1000}%`;

/**
 * Renglones de impuesto de un documento a partir de sus líneas, ya separados
 * por impuesto. `null` = el país no compone sus tasas y el llamador conserva su
 * desglose de siempre. `taxRate` es la tasa congelada del concepto (fracción);
 * sin ella se deriva de los importes.
 */
export function taxDisplayRows(
    lines: { subtotal: number; impuesto: number; taxRate?: number | null }[],
    country: string,
    opts: { region?: string | null; lang?: string; decimals?: number } = {},
): TaxComponentAmount[] | null {
    if (!taxComponents(country, 5, opts)) return null;
    const buckets = new Map<number, { base: number; impuesto: number }>();
    for (const l of lines) {
        const sub = Number(l.subtotal) || 0;
        const imp = Number(l.impuesto) || 0;
        const fraccion = Number(l.taxRate) || (sub ? imp / sub : 0);
        const tasa = Math.round(fraccion * 1e6) / 1e4; // porcentaje con 4 decimales
        const acc = buckets.get(tasa) ?? { base: 0, impuesto: 0 };
        acc.base += sub; acc.impuesto += imp;
        buckets.set(tasa, acc);
    }
    const filas: TaxComponentAmount[] = [];
    for (const [tasa, v] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
        if (!(Math.abs(v.impuesto) > 0)) continue;
        const partes = splitTaxBucket(country, tasa, v.base, v.impuesto, opts);
        if (partes) filas.push(...partes);
        else filas.push({ nombre: '', tasa, impuesto: v.impuesto });
    }
    // El mismo impuesto en dos renglones (GST del 5% solo y GST del 14.975%)
    // se suma: el cliente recupera "el GST", no "el GST de cada tasa".
    const porNombre = new Map<string, TaxComponentAmount>();
    for (const f of filas) {
        const clave = `${f.nombre}|${f.tasa}`;
        const prev = porNombre.get(clave);
        if (prev) prev.impuesto = Math.round((prev.impuesto + f.impuesto) * 1e6) / 1e6;
        else porNombre.set(clave, { ...f });
    }
    return [...porNombre.values()];
}

/**
 * Etiquetas del desglose por tasa del motor (`porTasa`, tasa en fracción): un
 * renglón por impuesto en Canadá, y "<etiqueta del país> <tasa>%" en el resto.
 * Es el constructor ÚNICO para el SSR del link público y para su parche en
 * vivo: si cada camino armara sus etiquetas, el primer cambio de revisión
 * reescribiría "GST 5% / QST 9.975%" como "GST/HST 14.975%".
 */
export function taxBreakdownRows(
    porTasa: { tasa: number; base: number; impuesto: number }[],
    opts: { country: string; region?: string | null; lang?: string; decimals?: number; taxLabel?: string },
): { tasa: number; label: string; impuesto: number }[] {
    const filas: { tasa: number; label: string; impuesto: number }[] = [];
    for (const t of porTasa) {
        if (!(Math.abs(t.impuesto) > 0)) continue;
        const partes = splitTaxBucket(opts.country, t.tasa * 100, t.base, t.impuesto, opts);
        if (partes) {
            for (const p of partes) filas.push({ tasa: t.tasa, label: `${p.nombre} ${fmtTaxPct(p.tasa)}`, impuesto: p.impuesto });
        } else {
            // Sin `taxLabel` (el parche en vivo no conoce el idioma de quien
            // lee) la etiqueta queda vacía y la arma el navegador con la suya.
            const label = opts.taxLabel ? `${opts.taxLabel} ${Math.round(t.tasa * 10000) / 100}%` : '';
            filas.push({ tasa: t.tasa, label, impuesto: t.impuesto });
        }
    }
    return filas;
}

/**
 * La opción que corresponde a un concepto: por tasa Y causa de exención. Dos
 * perfiles al 0 % ("Exento" y "Exportación (art. 21)") comparten tasa, y elegir
 * por tasa sola devolvía siempre el mismo — el concepto perdía su causa en el
 * siguiente redibujado. -1 = ninguna.
 */
export function taxOptionIndex(
    options: { rate: number; exemptionReason?: string | null }[],
    rate: number,
    exemptionReason?: string | null,
): number {
    const causa = exemptionReason || null;
    const exacta = options.findIndex((o) => Math.abs(o.rate - rate) < 1e-9 && (o.exemptionReason || null) === causa);
    if (exacta >= 0) return exacta;
    return options.findIndex((o) => Math.abs(o.rate - rate) < 1e-9);
}
