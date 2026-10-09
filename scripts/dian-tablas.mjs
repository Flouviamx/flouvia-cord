// Lectura de las tablas oficiales de la DIAN vendorizadas en
// scripts/fixtures/dian/tablas/ (Caja de herramientas de la factura
// electrónica de venta, versión 1.9 — "Caja-de-herramientas-FE_V19_v2026.zip",
// carpeta "Anexo Tecnico/Tablas Referenciadas"). Son los .xlsx tal cual los
// publica la DIAN; aquí solo se leen.
//
// Dos usos:
//   - scripts/dian-check.mjs compara las constantes de
//     src/lib/fiscal/latam/dian/ contra estas tablas (un código mal copiado
//     es un rechazo de la DIAN en producción);
//   - `node scripts/dian-tablas.mjs municipios` imprime el módulo
//     src/lib/fiscal/latam/dian/municipios.ts (DIVIPOLA según la DIAN), que se
//     genera desde la tabla 13.4.3 y nunca se edita a mano.
//
// Lector mínimo de .xlsx (zip + XML de SpreadsheetML) con fflate, que ya es
// dependencia del proyecto: solo valores, sin estilos ni fórmulas.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const TABLAS = fileURLToPath(new URL('./fixtures/dian/tablas/', import.meta.url));

const desescapar = (s) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

/** Filas de la primera hoja como arreglos de celdas (texto), en orden de columna. */
export function leerXlsx(nombre) {
    const zip = unzipSync(readFileSync(TABLAS + nombre));
    const compartidas = [];
    if (zip['xl/sharedStrings.xml']) {
        const ss = strFromU8(zip['xl/sharedStrings.xml']);
        for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
            compartidas.push(desescapar([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
        }
    }
    const hoja = strFromU8(zip['xl/worksheets/sheet1.xml']);
    const columna = (letras) => letras.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    // Las tablas no empiezan en la columna A: se cuenta desde la primera del rango.
    const desde = columna(/<dimension ref="([A-Z]+)\d+/.exec(hoja)?.[1] ?? 'A');
    const filas = [];
    // Las filas vacías vienen como <row …/>: se descartan antes de buscar celdas.
    for (const fila of hoja.replace(/<row[^>]*\/>/g, '').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
        const celdas = [];
        for (const c of fila[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const col = columna(c[1]) - desde;
            if (col < 0) continue;
            const tipo = /t="([^"]+)"/.exec(c[2])?.[1];
            const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] ?? '')?.[1];
            const inline = /<is>([\s\S]*?)<\/is>/.exec(c[3] ?? '')?.[1];
            let valor = '';
            if (tipo === 's' && v !== undefined) valor = compartidas[Number(v)] ?? '';
            else if (tipo === 'inlineStr' && inline) valor = desescapar([...inline.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
            else if (v !== undefined) valor = desescapar(v);
            celdas[col] = valor.trim();
        }
        filas.push(Array.from(celdas, (x) => x ?? ''));
    }
    return filas;
}

/** Pares código → texto de una tabla de dos columnas (salta encabezado y notas). */
export function tablaCodigos(nombre, { codigo = 0, texto = 1, patron = /^[0-9A-Z-]+$/ } = {}) {
    const out = new Map();
    for (const fila of leerXlsx(nombre)) {
        const c = String(fila[codigo] ?? '').trim();
        if (!c || !patron.test(c)) continue;
        out.set(c, String(fila[texto] ?? '').trim());
    }
    return out;
}

/**
 * Tabla 13.4.3 (Municipios, cbc:CityName): dos bloques de columnas lado a
 * lado — Código Departamento | Código Municipio | Nombre Departamento |
 * Nombre Municipio — que aquí se aplanan.
 */
export function municipiosOficiales() {
    const out = [];
    for (const fila of leerXlsx('13.4.3-municipios.xlsx')) {
        for (let base = 0; base + 3 < fila.length; base += 4) {
            const [dep, mun, nomDep, nomMun] = fila.slice(base, base + 4).map((x) => String(x ?? '').trim());
            // Excel guarda como número los códigos de Antioquia y Atlántico:
            // "5001" es 05001 y "8" es 08. Se restituye el cero a la izquierda.
            if (/^\d{4,5}$/.test(mun) && /^\d{1,2}$/.test(dep)) {
                const codigo = mun.padStart(5, '0');
                const departamento = dep.padStart(2, '0');
                if (!codigo.startsWith(departamento)) throw new Error(`13.4.3: el municipio ${codigo} no pertenece al departamento ${departamento}`);
                // La tabla oficial repite VENECIA (05861), la segunda vez con el
                // departamento mal escrito ("Antioquía"): gana la primera aparición.
                if (out.some((m) => m.codigo === codigo)) continue;
                out.push({ codigo, departamento, nombreDepartamento: nomDep, nombre: nomMun });
            }
        }
    }
    return out.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Tabla 13.4.2 (Departamentos, cbc:CountrySubentity/Code): dos bloques lado a lado. */
export function departamentosOficiales() {
    const out = [];
    for (const fila of leerXlsx('13.4.2-departamentos.xlsx')) {
        for (let base = 0; base + 1 < fila.length; base += 3) {
            const [cod, nombre] = fila.slice(base, base + 2).map((x) => String(x ?? '').trim());
            if (/^\d{1,2}$/.test(cod) && nombre) out.push({ codigo: cod.padStart(2, '0'), nombre });
        }
    }
    return out.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// ── Generador de municipios.ts ───────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv[2] === 'municipios') {
    const deps = departamentosOficiales();
    const muns = municipiosOficiales();
    const lineas = [
        '// GENERADO por `node scripts/dian-tablas.mjs municipios` desde la tabla 13.4.3',
        '// (Municipios, cbc:CityName) y 13.4.2 (Departamentos, cbc:CountrySubentity) de la',
        '// Caja de herramientas de la factura electrónica de venta v1.9 de la DIAN',
        '// (scripts/fixtures/dian/tablas/). No se edita a mano: scripts/dian-check.mjs',
        '// lo compara contra el .xlsx oficial.',
        '//',
        '// La dirección del EMISOR en la factura electrónica exige el código del',
        '// municipio, su nombre, el departamento y su código tal como están en estas',
        '// listas (reglas FAJ09–FAJ12 y FAJ29–FAJ32 del Anexo Técnico 1.9).',
        '',
        '/** Código DANE de 2 dígitos → nombre del departamento (tabla 13.4.2). */',
        'export const DEPARTAMENTOS: Readonly<Record<string, string>> = {',
        ...deps.map((d) => `    '${d.codigo}': ${JSON.stringify(d.nombre)},`),
        '};',
        '',
        '/**',
        ' * Código de municipio (5 dígitos; los 2 primeros son el departamento) →',
        ' * nombre del municipio tal como lo escribe la tabla 13.4.3.',
        ' */',
        'export const MUNICIPIOS: Readonly<Record<string, string>> = {',
        ...muns.map((m) => `    '${m.codigo}': ${JSON.stringify(m.nombre)},`),
        '};',
        '',
    ];
    process.stdout.write(lineas.join('\n'));
}
