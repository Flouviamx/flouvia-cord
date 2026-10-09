// Constructor de XML que escribe directamente en FORMA CANÓNICA (Canonical XML
// 1.0, http://www.w3.org/TR/2001/REC-xml-c14n-20010315), que es el algoritmo
// con el que la DIAN verifica la firma de cada documento [AT 10.7].
//
// Por qué escribir en forma canónica en vez de canonicalizar después: la
// firma XAdES cubre el documento entero (transformación enveloped), el
// KeyInfo y las SignedProperties, y cada uno se resume DESPUÉS de
// canonicalizarlo. Si el documento ya se emite así —atributos en el orden de
// C14N, etiquetas vacías como par inicio/fin, escapes de C14N, sin
// declaraciones de namespace repetidas en los hijos— la forma canónica del
// documento es el propio texto, sin un segundo serializador que pueda
// divergir. Los subárboles firmados se resuelven aparte (firma.ts) porque en
// C14N inclusiva heredan los namespaces de sus ancestros.
//
// scripts/dian-check.mjs comprueba esta propiedad contra una implementación
// independiente (libxml2: xmllint --c14n) y verifica la firma con el
// validador XMLDSig del JDK.
//
// Puro, sin dependencias.

export type Hijo = Nodo | string | number | null | undefined | false | Hijo[];

export interface Nodo {
    /** Nombre calificado (prefijo:local o local). */
    n: string;
    /** Atributos, incluidas las declaraciones de namespace (xmlns, xmlns:p). */
    a: Record<string, string>;
    c: (Nodo | Texto)[];
}

interface Texto {
    t: string;
    /** Se escribe como sección CDATA en el documento (en la forma canónica, como texto escapado). */
    cdata?: boolean;
}

// Caracteres que XML 1.0 no admite: romperían el documento entero.
const XML_INVALIDO = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

export const limpiar = (s: unknown) => String(s ?? '').replace(XML_INVALIDO, '');

/** Escape de texto de C14N: &, <, > y el retorno de carro. */
export const escTexto = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');

/** Escape de valor de atributo de C14N: &, <, ", tabulador, salto de línea y retorno. */
export const escAtributo = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');

function aplanar(hijos: Hijo[], out: (Nodo | Texto)[]): void {
    for (const h of hijos) {
        if (h === null || h === undefined || h === false) continue;
        if (Array.isArray(h)) aplanar(h, out);
        else if (typeof h === 'object') out.push(h);
        else out.push({ t: limpiar(h) });
    }
}

/**
 * Elemento. Un atributo `undefined`/`null` no se escribe (los opcionales del
 * Anexo no se informan vacíos); '' sí, porque es un valor (URI="" de la
 * referencia al documento). Los hijos `null`/`false` se omiten.
 */
export function E(nombre: string, atributos?: Record<string, string | number | null | undefined> | null, ...hijos: Hijo[]): Nodo {
    const a: Record<string, string> = {};
    for (const [k, v] of Object.entries(atributos ?? {})) {
        if (v === undefined || v === null) continue;
        a[k] = limpiar(v);
    }
    const c: (Nodo | Texto)[] = [];
    aplanar(hijos, c);
    return { n: nombre, a, c };
}

/** Texto que el documento entrega como CDATA (AttachedDocument). */
export function cdata(texto: string): Texto {
    return { t: limpiar(texto), cdata: true };
}

/** Elemento opcional: sin valor, no existe. */
export function opcional(nombre: string, valor: string | number | null | undefined, atributos?: Record<string, string | number | null | undefined>): Nodo | null {
    if (valor === undefined || valor === null || valor === '') return null;
    return E(nombre, atributos, String(valor));
}

/**
 * Orden de C14N: primero las declaraciones de namespace (la por defecto
 * antes que las con prefijo, estas por prefijo), luego los atributos por
 * (URI de su namespace, nombre local). Un atributo sin prefijo no tiene
 * namespace y va antes que cualquiera con prefijo.
 */
function ordenar(a: Record<string, string>, uris: Record<string, string>): [string, string][] {
    const decl = Object.entries(a).filter(([k]) => k === 'xmlns' || k.startsWith('xmlns:'))
        .sort(([x], [y]) => (x === 'xmlns' ? -1 : y === 'xmlns' ? 1 : x < y ? -1 : x > y ? 1 : 0));
    const clave = (k: string): [string, string] => {
        const i = k.indexOf(':');
        if (i < 0) return ['', k];
        const prefijo = k.slice(0, i);
        const uri = prefijo === 'xml' ? 'http://www.w3.org/XML/1998/namespace' : uris[prefijo];
        if (uri === undefined) throw new Error(`xml: prefijo sin declarar en atributo ${k}`);
        return [uri, k.slice(i + 1)];
    };
    const resto = Object.entries(a).filter(([k]) => k !== 'xmlns' && !k.startsWith('xmlns:'))
        .sort(([x], [y]) => {
            const [ux, lx] = clave(x);
            const [uy, ly] = clave(y);
            return ux !== uy ? (ux < uy ? -1 : 1) : lx < ly ? -1 : lx > ly ? 1 : 0;
        });
    return [...decl, ...resto];
}

export interface OpcionesSerializar {
    /** Namespaces ya declarados por los ancestros (prefijo → URI; '' = por defecto). */
    enAmbito?: Record<string, string>;
    /** Escribir las secciones CDATA como CDATA (documento) o como texto escapado (forma canónica). */
    cdata?: boolean;
}

/**
 * Serializa en forma canónica. Una declaración de namespace que repite la de
 * un ancestro se omite (C14N no la emite), así el texto coincide con la forma
 * canónica aunque un constructor la haya repetido.
 */
export function serializar(nodo: Nodo, opts: OpcionesSerializar = {}): string {
    const partes: string[] = [];
    const visitar = (n: Nodo, ambito: Record<string, string>) => {
        const propio = { ...ambito };
        const atributos: Record<string, string> = {};
        for (const [k, v] of Object.entries(n.a)) {
            if (k === 'xmlns' || k.startsWith('xmlns:')) {
                const prefijo = k === 'xmlns' ? '' : k.slice(6);
                if (ambito[prefijo] === v) continue;
                propio[prefijo] = v;
            }
            atributos[k] = v;
        }
        const uris = Object.fromEntries(Object.entries(propio).filter(([p]) => p !== ''));
        partes.push('<', n.n);
        for (const [k, v] of ordenar(atributos, uris)) partes.push(' ', k, '="', escAtributo(v), '"');
        partes.push('>');
        for (const h of n.c) {
            if ('n' in h) visitar(h, propio);
            else if (h.cdata && opts.cdata) partes.push('<![CDATA[', h.t.replace(/]]>/g, ']]]]><![CDATA[>'), ']]>');
            else partes.push(escTexto(h.t));
        }
        partes.push('</', n.n, '>');
    };
    visitar(nodo, opts.enAmbito ?? {});
    return partes.join('');
}

/** Documento completo: declaración XML + raíz. La forma canónica es la raíz (C14N omite la declaración). */
export function documento(raiz: Nodo, opts: { cdata?: boolean } = {}): string {
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' + serializar(raiz, { cdata: opts.cdata });
}

/**
 * Busca, en el texto serializado, el primer elemento con ese nombre
 * calificado y devuelve su posición [inicio, fin) — para firmar subárboles
 * del texto ya emitido sin reparsear.
 */
export function rango(xml: string, nombre: string, desde = 0): [number, number] {
    const apertura = xml.indexOf(`<${nombre}`, desde);
    if (apertura < 0) throw new Error(`xml: no se encontró <${nombre}>`);
    const cierre = `</${nombre}>`;
    // Los elementos firmados (KeyInfo, SignedProperties, SignedInfo) no se anidan a sí mismos.
    const fin = xml.indexOf(cierre, apertura);
    if (fin < 0) throw new Error(`xml: <${nombre}> sin cierre`);
    return [apertura, fin + cierre.length];
}
