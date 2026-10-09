// Código de barras CODE-128 de la chave de acceso en el DANFE.
//
// [MOC Anexo II §2] CODE-128C (pares de dígitos), con dígito verificador
// módulo 103 sobre la suma ponderada que incluye el carácter de inicio.
// [NTC 2025.001 §6] Con CNPJ alfanumérico la chave tiene letras: el modelo
// híbrido empieza en C y alterna a A (código 101) para lo que no es un par de
// dígitos, y vuelve a C (código 99) ante cuatro o más dígitos seguidos.
//
// Los anchos de barra son la tabla estándar de la simbología (ISO/IEC 15417,
// la que el NTC remite en su §6). scripts/nfe-check.mjs comprueba el ejemplo
// del Anexo II (09758364 → DV 48 y la secuencia de anchos impresa en el
// manual) y el del NTC (5225AB83 → DV 30), y decodifica el resultado con un
// lector independiente.
//
// Puro.

/** Anchos (barra, espacio, barra…) de los valores 0 a 106 (106 = STOP, 7 elementos). */
export const PATRONES: readonly string[] = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

export const START_A = 103;
export const START_C = 105;
export const CODE_A = 101;
export const CODE_C = 99;
export const STOP = 106;

const esDigito = (c: string) => c >= '0' && c <= '9';

/** Valor de un carácter en el conjunto A (ASCII 32–95 → 0–63; 0–31 → 64–95). */
function valorA(c: string): number {
    const code = c.charCodeAt(0);
    if (code >= 32 && code <= 95) return code - 32;
    if (code >= 0 && code < 32) return code + 64;
    throw new Error(`code128: carácter fuera del conjunto A: ${c}`);
}

/**
 * Valores de los símbolos de datos (sin inicio, verificador ni parada) según
 * las reglas del NTC 2025.001 §6, empezando en C.
 */
export function simbolosDados(texto: string): number[] {
    const out: number[] = [];
    let modo: 'A' | 'C' = 'C';
    let i = 0;
    const digitosDesde = (k: number) => { let n = 0; while (k + n < texto.length && esDigito(texto[k + n])) n++; return n; };
    while (i < texto.length) {
        if (modo === 'C') {
            const n = digitosDesde(i);
            if (n >= 2) {
                out.push(Number(texto.slice(i, i + 2)));
                i += 2;
                continue;
            }
            // Un dígito suelto (impar antes de una letra o al final) o una letra: a A.
            out.push(CODE_A);
            modo = 'A';
            continue;
        }
        const n = digitosDesde(i);
        if (n >= 4) {
            // Par: a C antes del primer dígito. Impar: el primero queda en A.
            if (n % 2 === 1) { out.push(valorA(texto[i])); i += 1; }
            out.push(CODE_C);
            modo = 'C';
            continue;
        }
        out.push(valorA(texto[i]));
        i += 1;
    }
    return out;
}

/** Dígito verificador módulo 103 (el inicio pesa 1, el primer dato también) [Anexo II §2.1]. */
export function digitoVerificador(inicio: number, dados: number[]): number {
    let soma = inicio;
    dados.forEach((v, k) => { soma += v * (k + 1); });
    return soma % 103;
}

export interface Code128 {
    /** Valores de todos los símbolos: inicio, datos, verificador, parada. */
    simbolos: number[];
    /** Anchos de barra y espacio, alternados empezando por barra. */
    anchos: number[];
    /** Módulos totales (sin la zona de silencio). */
    modulos: number;
}

export function code128(texto: string): Code128 {
    if (!texto || !/^[0-9A-Z]+$/.test(texto)) throw new Error('code128: solo dígitos y letras mayúsculas');
    const dados = simbolosDados(texto);
    const dv = digitoVerificador(START_C, dados);
    const simbolos = [START_C, ...dados, dv, STOP];
    const anchos = simbolos.flatMap((v) => PATRONES[v].split('').map(Number));
    return { simbolos, anchos, modulos: anchos.reduce((a, b) => a + b, 0) };
}
