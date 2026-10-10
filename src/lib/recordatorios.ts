// Calendario de recordatorios de factura: reglas puras, sin base de datos ni
// contexto de request. Lo usan el cron (src/pages/api/cron/recordatorios.ts),
// la API que guarda el calendario (src/pages/api/org/recordatorios.ts) y la
// pantalla de Ajustes › Recordatorios, también en el navegador para la vista
// previa en vivo. Por eso no importa nada.
//
// Una ETAPA son días respecto al vencimiento: negativa = antes, 0 = el día que
// vence, positiva = después. El signo es parte de su identidad: la dedup de
// `documento_recordatorios` es (documento_id, etapa).

/** Días ANTES del vencimiento que se pueden elegir. */
export const DIAS_ANTES = [14, 7, 3, 1] as const;
/** Días DESPUÉS del vencimiento que se pueden elegir. */
export const DIAS_DESPUES = [1, 3, 7, 14, 30, 60, 90] as const;

/** Vocabulario cerrado: lo único que la pantalla ofrece y la API acepta. */
export const ETAPAS_PERMITIDAS: readonly number[] = [
    ...DIAS_ANTES.map((d) => -d),
    0,
    ...DIAS_DESPUES,
].sort((a, b) => a - b);

/**
 * El calendario de siempre, y el default de `orgs.recordatorio_etapas`
 * (db/schema.sql): una cuenta que nunca lo tocó no cambia de comportamiento.
 */
export const ETAPAS_DEFAULT: readonly number[] = [-7, -1, 3, 7, 14, 30];

/**
 * Tope de etapas por factura. Ocho ya es un correo cada pocos días durante
 * tres meses; más que eso deja de ser un recordatorio y se vuelve el motivo
 * de que el cliente marque el remitente como spam.
 */
export const MAX_ETAPAS = 8;

/** Lo que el cron evalúa: una etapa guardada fuera de aquí no se manda nunca. */
export const VENTANA = { min: -30, max: 120 } as const;

export type ErrorEtapas = 'formato' | 'fuera_de_menu' | 'vacio' | 'demasiadas';

/**
 * Valida lo que manda la pantalla (o quien llame a la API): una lista de
 * enteros del vocabulario cerrado, sin repetir, de 1 a MAX_ETAPAS. Acepta un
 * arreglo o una cadena separada por comas (el campo oculto del formulario).
 * Devuelve la lista ordenada; nunca corrige en silencio un valor inválido.
 *
 * `conservar` son las etapas que la organización YA tiene guardadas: una que
 * quedó fuera del menú se puede mantener (un set recortado no reescribe un
 * dato vivo, regla 28), pero no se puede agregar una nueva fuera de él.
 */
export function validarEtapas(input: unknown, conservar: readonly number[] = []): { ok: true; etapas: number[] } | { ok: false; error: ErrorEtapas } {
    let crudos: unknown[];
    if (Array.isArray(input)) crudos = input;
    else if (typeof input === 'string') crudos = input.trim() === '' ? [] : input.split(',');
    else return { ok: false, error: 'formato' };
    if (crudos.length > ETAPAS_PERMITIDAS.length) return { ok: false, error: 'demasiadas' };

    const set = new Set<number>();
    for (const v of crudos) {
        const texto = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : null;
        if (texto === null || !/^-?\d+$/.test(texto)) return { ok: false, error: 'formato' };
        const n = Number(texto);
        const guardada = conservar.includes(n) && n >= VENTANA.min && n <= VENTANA.max;
        if (!ETAPAS_PERMITIDAS.includes(n) && !guardada) return { ok: false, error: 'fuera_de_menu' };
        set.add(n === 0 ? 0 : n); // -0 → 0
    }
    if (set.size === 0) return { ok: false, error: 'vacio' };
    if (set.size > MAX_ETAPAS) return { ok: false, error: 'demasiadas' };
    return { ok: true, etapas: [...set].sort((a, b) => a - b) };
}

/**
 * Lo que está GUARDADO, tal como lo lee el cron. No se recorta al vocabulario
 * de la pantalla: un dato vivo no se reescribe porque el menú cambió (regla 28).
 * Solo se descarta lo que el cron no puede evaluar (no entero o fuera de la
 * ventana). Sin columna (null) = el calendario de siempre.
 */
export function etapasGuardadas(valor: unknown): number[] {
    if (!Array.isArray(valor)) return [...ETAPAS_DEFAULT];
    const set = new Set<number>();
    for (const v of valor) {
        const n = Number(v);
        if (Number.isInteger(n) && n >= VENTANA.min && n <= VENTANA.max) set.add(n === 0 ? 0 : n);
    }
    return [...set].sort((a, b) => a - b);
}

/**
 * La etapa que toca HOY, o null.
 *
 * - La MAYOR etapa ya alcanzada y no enviada: una factura que entra tarde (o
 *   que vuelve de una pausa) recibe solo la más reciente, no la escalera de
 *   golpe.
 * - Nunca una etapa ANTERIOR a otra ya enviada. Es lo que hace seguro cambiar
 *   el calendario: agregar "14 días antes" cuando ya salió el de 7 días antes
 *   no manda un aviso atrasado, y una etapa ya enviada no se repite (eso lo
 *   garantiza además la unicidad de `documento_recordatorios`).
 *
 * `diasVencida` = día civil de hoy menos el vencimiento (positivo = vencida).
 */
export function etapaQueToca(etapas: readonly number[], diasVencida: number, enviadas: Iterable<number>): number | null {
    const yaEnviadas = new Set<number>([...enviadas].map(Number));
    const alcanzadas = etapas
        .filter((e) => diasVencida >= e && !yaEnviadas.has(e))
        .sort((a, b) => b - a);
    const etapa = alcanzadas[0];
    if (etapa === undefined) return null;
    if (yaEnviadas.size && etapa < Math.max(...yaEnviadas)) return null;
    return etapa;
}

/** Qué correo corresponde según dónde está HOY la factura, no la etapa. */
export function momentoDelAviso(diasVencida: number): 'antes' | 'hoy' | 'vencida' {
    return diasVencida > 0 ? 'vencida' : diasVencida === 0 ? 'hoy' : 'antes';
}

/**
 * Texto de la línea de tiempo de la factura. Se guarda en español, como el
 * resto de `eventos.detalle`, y se traduce al pintar
 * (src/lib/fiscal/timeline-detail.ts).
 */
export function detalleEventoEtapa(etapa: number): string {
    if (etapa === 0) return 'Aviso de vencimiento (vence hoy)';
    const n = Math.abs(etapa);
    const dias = n === 1 ? 'día' : 'días';
    return etapa > 0 ? `Recordatorio de cobro (${n} ${dias} vencida)` : `Aviso de vencimiento (${n} ${dias} antes)`;
}

/** Textos de la vista previa, en el idioma de la cuenta (src/i18n/app.ts). */
export interface TextosCalendario {
    /** "{dias} días antes" */
    antes: string;
    /** "{dias} día antes" — cuando el último número de la lista es 1. */
    antesUno: string;
    /** "el día del vencimiento" */
    hoy: string;
    /** "{dias} días después" */
    despues: string;
    /** "{dias} día después" */
    despuesUno: string;
}

/**
 * "7 y 1 día antes; el día del vencimiento; 3, 7, 14 y 30 días después".
 * La unidad concuerda con el número que la precede ("7 y 1 día antes").
 */
export function describirEtapas(etapas: readonly number[], textos: TextosCalendario, locale: 'es' | 'en'): string {
    const lista = (nums: number[]) => {
        const partes = nums.map(String);
        try {
            return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(partes);
        } catch {
            return partes.join(', ');
        }
    };
    const antes = etapas.filter((e) => e < 0).map((e) => -e).sort((a, b) => b - a);
    const despues = etapas.filter((e) => e > 0).sort((a, b) => a - b);
    const grupos: string[] = [];
    if (antes.length) grupos.push((antes[antes.length - 1] === 1 ? textos.antesUno : textos.antes).replace('{dias}', lista(antes)));
    if (etapas.includes(0)) grupos.push(textos.hoy);
    if (despues.length) grupos.push((despues[despues.length - 1] === 1 ? textos.despuesUno : textos.despues).replace('{dias}', lista(despues)));
    return grupos.join('; ');
}
