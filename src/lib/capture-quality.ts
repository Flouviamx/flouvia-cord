// Compuertas de calidad de la foto del documento, calculadas en el navegador.
//
// ── Principio rector: la compuerta ACONSEJA, casi nunca bloquea ──────────────
//
// Un falso rechazo deja a un negocio sin poder cobrar. Una foto regular que el
// proveedor acepta vale infinitamente más que una buena que Cord rechazó por un
// umbral mal calibrado. Por eso sólo dos cosas bloquean duro, y las dos tienen
// la propiedad de que aceptarlas es un fracaso GARANTIZADO, no probable:
//
//   · escala de grises — el proveedor la auto-rechaza, así que dejarla pasar no
//     le ahorra nada al usuario: le cuesta un ciclo de rechazo de días;
//   · resolución bajo el piso — por debajo de eso el documento no se puede leer.
//
// Todo lo demás (nitidez, exposición, reflejos) devuelve un AVISO con un consejo
// concreto, y el usuario puede continuar de todas formas.
//
// ── Sobre los umbrales ──────────────────────────────────────────────────────
//
// Los números de abajo son un punto de partida, NO están calibrados: no existe
// un dataset de fotos de documentos etiquetadas. Por eso cada captura manda sus
// métricas a `connect_kyc_evidencia`, donde el webhook escribe después el
// veredicto real del proveedor. Con unas centenas de capturas hay un dataset
// propio —"nitidez X → el proveedor dijo ilegible"— y estos números se ajustan
// con evidencia. Hasta entonces, sólo avisan.

export const UMBRALES = {
    /** Varianza del laplaciano sobre la ROI normalizada a 800 px de lado largo. */
    nitidezBuena: 120,
    nitidezDudosa: 60,
    /** Mediana del histograma de luminancia (0-255). */
    brilloMin: 60,
    /** Fracción de píxeles casi negros que delata subexposición. */
    oscuroMax: 0.5,
    /** Fracción de píxeles recortados en alto que delata sobreexposición. */
    quemadoMax: 0.15,
    /** p95 − p5: por debajo de esto la foto no tiene contraste utilizable. */
    contrasteMin: 60,
    /** Croma p95: por debajo, la imagen no tiene color. */
    cromaGris: 10,
    /** Lado largo del documento, en píxeles. */
    ladoObjetivo: 1000,
    ladoMinimo: 600,
} as const;

export interface MetricasCaptura {
    /** Varianza del laplaciano. Más alto = más nítido. */
    nitidez: number;
    /** Mediana de luminancia (0-255). */
    brillo: number;
    /** p95 − p5 de luminancia. */
    contraste: number;
    /** Fracción de píxeles con los tres canales recortados. */
    reflejo: number;
    /** p95 de croma. Cerca de 0 = sin color. */
    croma: number;
    /** Lado largo de la región analizada, en píxeles de la imagen original. */
    ladoLargo: number;
    /** Fracción de píxeles muy oscuros. */
    oscuro: number;
}

export type Severidad = 'ok' | 'aviso' | 'bloqueo';

export interface Veredicto {
    severidad: Severidad;
    /** Clave del problema, para traducir en la UI. `null` si todo bien. */
    motivo: string | null;
}

/**
 * Calcula todas las métricas en UNA sola pasada sobre los píxeles.
 *
 * `datos` es RGBA como lo devuelve `getImageData`. La región debe venir ya
 * re-muestreada a ~800 px de lado largo: la varianza del laplaciano depende de
 * la escala, así que la misma foto a 4000 y a 1280 px daría valores
 * incomparables. Sin esa normalización ningún umbral significa nada entre
 * dispositivos.
 */
export function medir(datos: Uint8ClampedArray, ancho: number, alto: number, ladoLargoOriginal: number): MetricasCaptura {
    const n = ancho * alto;
    if (n === 0 || datos.length < n * 4) {
        return { nitidez: 0, brillo: 0, contraste: 0, reflejo: 0, croma: 0, ladoLargo: ladoLargoOriginal, oscuro: 1 };
    }

    // Luminancia entera: (77R + 150G + 29B) >> 8. Evita flotantes en el bucle
    // caliente, que en un teléfono de gama media sí se nota.
    const luma = new Uint8Array(n);
    const histograma = new Uint32Array(256);
    let recortados = 0;
    const cromas = new Uint8Array(n);

    for (let i = 0, p = 0; i < n; i++, p += 4) {
        const r = datos[p], g = datos[p + 1], b = datos[p + 2];
        const y = (77 * r + 150 * g + 29 * b) >> 8;
        luma[i] = y;
        histograma[y]++;
        // Reflejo especular: los TRES canales saturados. El papel blanco es
        // brillante pero rara vez satura los tres; el brillo especular sí.
        if (r >= 250 && g >= 250 && b >= 250) recortados++;
        const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
        cromas[i] = max - min;
    }

    // Varianza del laplaciano de 4 vecinos sobre la luminancia.
    let suma = 0, sumaCuadrados = 0, cuenta = 0;
    for (let y = 1; y < alto - 1; y++) {
        for (let x = 1; x < ancho - 1; x++) {
            const i = y * ancho + x;
            const lap = luma[i - 1] + luma[i + 1] + luma[i - ancho] + luma[i + ancho] - 4 * luma[i];
            suma += lap;
            sumaCuadrados += lap * lap;
            cuenta++;
        }
    }
    const media = cuenta ? suma / cuenta : 0;
    const nitidez = cuenta ? Math.max(0, sumaCuadrados / cuenta - media * media) : 0;

    const percentil = (frac: number): number => {
        const objetivo = n * frac;
        let acumulado = 0;
        for (let v = 0; v < 256; v++) {
            acumulado += histograma[v];
            if (acumulado >= objetivo) return v;
        }
        return 255;
    };
    const p5 = percentil(0.05);
    const p50 = percentil(0.5);
    const p95 = percentil(0.95);

    let oscuros = 0;
    for (let v = 0; v < 32; v++) oscuros += histograma[v];

    // p95 de croma sin ordenar todo el arreglo: histograma de 256 bins.
    const histCroma = new Uint32Array(256);
    for (let i = 0; i < n; i++) histCroma[cromas[i]]++;
    let acc = 0, cromaP95 = 0;
    const objetivoCroma = n * 0.95;
    for (let v = 0; v < 256; v++) {
        acc += histCroma[v];
        if (acc >= objetivoCroma) { cromaP95 = v; break; }
    }

    return {
        nitidez: Math.round(nitidez * 100) / 100,
        brillo: p50,
        contraste: p95 - p5,
        reflejo: Math.round((recortados / n) * 10000) / 10000,
        croma: cromaP95,
        ladoLargo: ladoLargoOriginal,
        oscuro: Math.round((oscuros / n) * 10000) / 10000,
    };
}

/**
 * Traduce las métricas a un veredicto.
 *
 * `esIdentidad` decide la severidad: un comprobante de domicilio escaneado en
 * blanco y negro es perfectamente válido para el proveedor; una identificación
 * con foto en blanco y negro, no.
 */
export function evaluar(m: MetricasCaptura, esIdentidad: boolean): Veredicto {
    // ── Bloqueos ────────────────────────────────────────────────────────────
    if (m.ladoLargo < UMBRALES.ladoMinimo) {
        return { severidad: 'bloqueo', motivo: 'resolucion' };
    }
    if (esIdentidad && m.croma < UMBRALES.cromaGris) {
        return { severidad: 'bloqueo', motivo: 'grises' };
    }

    // ── Avisos, del problema más determinante al menos ──────────────────────
    //
    // El orden importa: una foto oscura suele salir además borrosa, y decirle a
    // alguien "está movida" cuando el problema real es que no hay luz lo manda a
    // repetir el gesto equivocado.
    if (m.brillo < UMBRALES.brilloMin || m.oscuro > UMBRALES.oscuroMax) {
        return { severidad: 'aviso', motivo: 'oscura' };
    }
    // El recorte en alto manda sobre la media: un pasaporte beige claro tiene
    // `brillo` alto de forma legítima, y usar la media como señal primaria de
    // sobreexposición fabrica falsos rechazos.
    if (m.reflejo > UMBRALES.quemadoMax) {
        return { severidad: 'aviso', motivo: 'quemada' };
    }
    if (m.reflejo > 0.015) {
        return { severidad: 'aviso', motivo: 'reflejo' };
    }
    if (m.contraste < UMBRALES.contrasteMin) {
        return { severidad: 'aviso', motivo: 'contraste' };
    }
    if (m.nitidez < UMBRALES.nitidezDudosa) {
        return { severidad: 'aviso', motivo: 'borrosa' };
    }
    if (m.nitidez < UMBRALES.nitidezBuena || m.ladoLargo < UMBRALES.ladoObjetivo) {
        return { severidad: 'aviso', motivo: 'mejorable' };
    }
    return { severidad: 'ok', motivo: null };
}

/** Consejo accionable por motivo. Dice qué HACER, no qué está mal. */
export function consejo(motivo: string, locale: 'es' | 'en' = 'es'): string {
    const textos: Record<string, { es: string; en: string }> = {
        resolucion: {
            es: 'La foto tiene muy poca resolución. Acércate al documento, o usa “Elegir foto” para tomarla con la app de cámara.',
            en: 'The photo resolution is too low. Move closer to the document, or use “Choose a photo” to take it with the camera app.',
        },
        grises: {
            es: 'La foto está en blanco y negro y el documento debe ir a color. Vuelve a tomarla con la cámara a color.',
            en: 'The photo is black and white; the document must be in colour. Take it again in colour.',
        },
        oscura: {
            es: 'Está muy oscuro. Acércate a una ventana o enciende la luz.',
            en: "It's too dark. Move near a window or turn on a light.",
        },
        quemada: {
            es: 'Le pega demasiada luz. Aléjate de la lámpara o del sol directo.',
            en: 'Too much light. Move away from the lamp or direct sunlight.',
        },
        reflejo: {
            es: 'Hay un reflejo sobre el documento. Inclínalo un poco para quitarlo.',
            en: "There's a glare on the document. Tilt it slightly to remove it.",
        },
        contraste: {
            es: 'El documento se confunde con el fondo. Ponlo sobre una superficie de otro color.',
            en: 'The document blends into the background. Place it on a differently coloured surface.',
        },
        borrosa: {
            es: 'La foto salió movida. Apoya el documento en una superficie plana y espera a que enfoque.',
            en: 'The photo came out blurry. Rest the document on a flat surface and wait for it to focus.',
        },
        mejorable: {
            es: 'La foto se puede leer, pero mejoraría si te acercas y esperas a que enfoque.',
            en: "The photo is readable, but it would improve if you move closer and let it focus.",
        },
    };
    return textos[motivo]?.[locale] ?? '';
}
