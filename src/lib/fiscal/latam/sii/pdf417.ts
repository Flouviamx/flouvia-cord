// Codificador PDF417 (ISO/IEC 15438:2001) para el timbre electrónico del DTE.
//
// Reglas del SII para el timbre (instructivo técnico, Anexo 2, A.2.5):
//   - modo de compactación binario (Byte Compaction Mode);
//   - nivel de corrección de errores 5;
//   - X Dim mínimo de 6,7 mils, alto de fila 3:1 respecto del X Dim;
//   - sin "truncated"; zona de silencio de 0,25" alrededor.
// Y del manual de muestras impresas (1.5): mínimo 2 × 5 cm, máximo 4 × 9 cm.
//
// Construcción (ISO/IEC 15438):
//   - palabras de datos: [largo, 901|924, bytes compactados…, relleno 900…];
//     924 si los bytes son múltiplo de 6 (6 bytes → 5 palabras en base 900),
//     901 si no (el resto, una palabra por byte) — §5.4.3;
//   - corrección de errores Reed-Solomon sobre GF(929) con generador
//     Π (x − 3^i), i = 1…2^(nivel+1) — §5.10 y Anexo F;
//   - cada fila: inicio, indicador izquierdo, datos, indicador derecho, fin,
//     con el grupo (cluster) 0/3/6 según fila mod 3 — §5.3 y §5.6.
// scripts/sii-check.mjs verifica la aritmética (síndromes nulos, coeficientes
// del Anexo F) y que la matriz de un timbre real la lee un decodificador
// independiente (vector dorado decodificado con ZXing).
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { PATRONES_PDF417 } from './pdf417-tabla.ts';

const MOD = 929;
const INICIO = 0x1fea8; // 17 módulos
const FIN = 0x3fa29; // 18 módulos

/** Coeficientes a0…a(k−1) del polinomio generador para el nivel dado (sin el término líder 1). */
export function coeficientesGenerador(nivel: number): number[] {
    const k = 2 ** (nivel + 1);
    let poli = [1]; // poli[i] = coeficiente de x^i
    let raiz = 1;
    for (let i = 1; i <= k; i++) {
        raiz = (raiz * 3) % MOD;
        const siguiente = new Array(poli.length + 1).fill(0);
        for (let j = 0; j < poli.length; j++) {
            siguiente[j + 1] = (siguiente[j + 1] + poli[j]) % MOD;
            siguiente[j] = (siguiente[j] + poli[j] * (MOD - raiz)) % MOD;
        }
        poli = siguiente;
    }
    return poli.slice(0, k);
}

/** Palabras de corrección de errores (ISO/IEC 15438, §5.10.2). */
export function correccionErrores(datos: number[], nivel: number): number[] {
    const a = coeficientesGenerador(nivel);
    const k = a.length;
    const e = new Array(k).fill(0);
    for (const d of datos) {
        const t1 = (d + e[k - 1]) % MOD;
        for (let j = k - 1; j >= 1; j--) {
            e[j] = (e[j - 1] + (MOD - (t1 * a[j]) % MOD)) % MOD;
        }
        e[0] = (MOD - (t1 * a[0]) % MOD) % MOD;
    }
    const out: number[] = [];
    for (let j = k - 1; j >= 0; j--) out.push(e[j] !== 0 ? MOD - e[j] : 0);
    return out;
}

/** Evalúa el polinomio de palabras (la primera es el término de mayor grado) en x, módulo 929. */
export function evaluar(palabras: number[], x: number): number {
    let acc = 0;
    for (const p of palabras) acc = (acc * x + p) % MOD;
    return acc;
}

/** Compactación binaria (§5.4.3): latch 924 si los bytes son múltiplo de 6, 901 si no. */
export function compactarBytes(bytes: Uint8Array): number[] {
    const out: number[] = [bytes.length % 6 === 0 ? 924 : 901];
    let i = 0;
    for (; i + 6 <= bytes.length; i += 6) {
        let t = 0n;
        for (let j = 0; j < 6; j++) t = (t << 8n) | BigInt(bytes[i + j]);
        const grupo: number[] = [];
        for (let j = 0; j < 5; j++) {
            grupo.unshift(Number(t % 900n));
            t /= 900n;
        }
        out.push(...grupo);
    }
    for (; i < bytes.length; i++) out.push(bytes[i]);
    return out;
}

export interface SimboloPdf417 {
    /** Una cadena de '0'/'1' por fila; '1' = módulo oscuro. Anchura = 17 × columnas + 69. */
    filas: string[];
    columnas: number;
    nivel: number;
    /** Todas las palabras del símbolo (datos + corrección), para verificación. */
    palabras: number[];
}

/**
 * Codifica `bytes` con `columnas` columnas de datos (1–30). Las filas (3–90)
 * salen del total de palabras. Lanza si no cabe.
 */
export function codificarPdf417(bytes: Uint8Array, columnas: number, nivel = 5): SimboloPdf417 {
    if (!Number.isInteger(columnas) || columnas < 1 || columnas > 30) throw new Error('pdf417: columnas fuera de rango');
    const compactados = compactarBytes(bytes);
    const k = 2 ** (nivel + 1);
    const minimo = 1 + compactados.length + k;
    if (minimo > 928) throw new Error('pdf417: el contenido no cabe en un símbolo');
    const filas = Math.max(3, Math.ceil(minimo / columnas));
    if (filas > 90) throw new Error('pdf417: demasiadas filas para esas columnas');
    const relleno = filas * columnas - minimo;
    const datos = [1 + compactados.length + relleno, ...compactados, ...new Array(relleno).fill(900)];
    const palabras = [...datos, ...correccionErrores(datos, nivel)];

    const patron = (cluster: number, palabra: number, ancho = 17) => (cluster < 0 ? palabra : PATRONES_PDF417[cluster][palabra])
        .toString(2).padStart(ancho, '0');
    const out: string[] = [];
    for (let y = 0; y < filas; y++) {
        const cluster = y % 3;
        const base = 30 * Math.floor(y / 3);
        const izq = cluster === 0 ? base + Math.floor((filas - 1) / 3)
            : cluster === 1 ? base + nivel * 3 + ((filas - 1) % 3)
            : base + (columnas - 1);
        const der = cluster === 0 ? base + (columnas - 1)
            : cluster === 1 ? base + Math.floor((filas - 1) / 3)
            : base + nivel * 3 + ((filas - 1) % 3);
        let fila = INICIO.toString(2).padStart(17, '0') + patron(cluster, izq);
        for (let x = 0; x < columnas; x++) fila += patron(cluster, palabras[y * columnas + x]);
        fila += patron(cluster, der) + FIN.toString(2).padStart(18, '0');
        out.push(fila);
    }
    return { filas: out, columnas, nivel, palabras };
}

export interface MedidasTimbre {
    columnas: number;
    /** Ancho del módulo (X Dim) y alto de fila, en milímetros. */
    moduloMm: number;
    altoFilaMm: number;
}

const MILS_A_MM = 0.0254;

/**
 * Columnas y tamaño de módulo para que el timbre quede dentro de lo que pide el
 * SII: X ≥ 6,7 mils, fila = 3X, entre 2 × 5 cm y 4 × 9 cm, preferentemente no
 * más de 3 cm de alto (instructivo, A.2.5).
 */
export function medidasTimbre(bytes: Uint8Array, nivel = 5): MedidasTimbre {
    const total = 1 + compactarBytes(bytes).length + 2 ** (nivel + 1);
    const xMin = 6.7 * MILS_A_MM;
    let elegido: MedidasTimbre | null = null;
    for (let c = 8; c <= 30; c++) {
        const filas = Math.max(3, Math.ceil(total / c));
        if (filas > 90) continue;
        // El X más grande (≤ 0,25 mm) con el que el símbolo cabe en 9 × 3 cm.
        const x = Math.min(0.25, 90 / (17 * c + 69), 30 / (filas * 3));
        if (x < xMin) continue;
        const ancho = (17 * c + 69) * x;
        const alto = filas * 3 * x;
        if (ancho < 50 || alto < 20) continue;
        if (!elegido || x > elegido.moduloMm) elegido = { columnas: c, moduloMm: x, altoFilaMm: 3 * x };
    }
    if (!elegido) throw new Error('pdf417: el timbre no cabe en las medidas del SII');
    return { ...elegido, moduloMm: Math.floor(elegido.moduloMm * 1000) / 1000, altoFilaMm: Math.floor(elegido.moduloMm * 3000) / 1000 };
}
