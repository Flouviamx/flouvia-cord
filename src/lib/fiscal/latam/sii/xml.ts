// Árbol XML mínimo del DTE con DOS serializaciones del mismo árbol:
//
//   - `archivo`: lo que viaja al SII y al receptor (escape con las cinco
//     entidades predefinidas, instructivo técnico Anexo 2, A.2.4);
//   - `c14n`: Canonical XML 1.0 inclusivo (W3C REC-xml-c14n-20010315), el que
//     exige la firma del DTE y del envío (xmldsignature_v10.xsd fija ese
//     algoritmo). Se calcula sobre el árbol —no sobre el texto ya escrito—,
//     así que el digest de la firma corresponde exactamente a lo que se
//     escribe en el archivo.
//
// Un texto puede traer su representación `cruda` (la del CAF tal como lo
// entregó el SII): el archivo la reproduce byte a byte y la canonicalización
// usa el valor decodificado. "El CAF se incluye tal como fue entregado por el
// SII, sin ningún tipo de modificaciones" (instructivo, Anexo 2, A.2.4).
//
// Puro: sin dependencias, lo cargan los scripts de contrato con Node plano.

import { escC14nAtributo, escC14nTexto, escXml } from './texto.ts';

export interface Texto {
    t: string;
    /** Representación exacta en el archivo (texto ya escapado), si difiere del escape estándar. */
    crudo?: string;
}

export interface Nodo {
    n: string;
    /** Atributos en el orden en que se escriben en el archivo; las declaraciones xmlns también van aquí. */
    a?: [string, string][];
    c?: Array<Nodo | Texto>;
}

export const esNodo = (x: Nodo | Texto): x is Nodo => typeof (x as Nodo).n === 'string';

/** Elemento con hijos; un string es un texto. Se omiten los hijos nulos o vacíos. */
export function el(n: string, a: [string, string][] | null, ...hijos: Array<Nodo | Texto | string | number | null | undefined | false>): Nodo {
    const c: Array<Nodo | Texto> = [];
    for (const h of hijos) {
        if (h === null || h === undefined || h === false || h === '') continue;
        c.push(typeof h === 'string' || typeof h === 'number' ? { t: String(h) } : h);
    }
    return { n, ...(a && a.length ? { a } : {}), ...(c.length ? { c } : {}) };
}

/** Elemento opcional: sin valor no se escribe (minOccurs="0"), nunca como etiqueta vacía. */
export function opt(n: string, valor: string | number | null | undefined): Nodo | null {
    if (valor === null || valor === undefined || valor === '') return null;
    return el(n, null, String(valor));
}

/**
 * Agrega saltos de línea entre elementos (instructivo, Anexo 3, A 3.1: "se
 * debe insertar saltos de línea al final de cada tag"). Los saltos son nodos
 * de texto del árbol: la firma los cubre igual que el archivo los escribe.
 */
export function formatear(nodo: Nodo): Nodo {
    const hijos = nodo.c ?? [];
    if (!hijos.some(esNodo)) return nodo;
    const c: Array<Nodo | Texto> = [];
    for (const h of hijos) {
        if (!esNodo(h)) {
            if (h.t.trim()) c.push(h); // los espacios previos se reemplazan
            continue;
        }
        c.push({ t: '\n' }, formatear(h));
    }
    c.push({ t: '\n' });
    return { ...nodo, c };
}

/** Quita los textos que son solo espacios entre elementos (lo "aplanado" del timbre). */
export function aplanar(nodo: Nodo): Nodo {
    const hijos = nodo.c ?? [];
    if (!hijos.some(esNodo)) return nodo;
    return { ...nodo, c: hijos.filter((h) => esNodo(h) || h.t.trim() !== '').map((h) => (esNodo(h) ? aplanar(h) : h)) };
}

const escAtrArchivo = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Serialización del archivo. */
export function serializar(nodo: Nodo): string {
    const attrs = (nodo.a ?? []).map(([k, v]) => ` ${k}="${escAtrArchivo(v)}"`).join('');
    const hijos = (nodo.c ?? []).map((h) => (esNodo(h) ? serializar(h) : (h.crudo ?? escXml(h.t)))).join('');
    return `<${nodo.n}${attrs}>${hijos}</${nodo.n}>`;
}

type Ns = Record<string, string>;

const prefijoDe = (nombre: string) => (nombre.includes(':') ? nombre.slice(0, nombre.indexOf(':')) : '');
const localDe = (nombre: string) => (nombre.includes(':') ? nombre.slice(nombre.indexOf(':') + 1) : nombre);

function declaraciones(nodo: Nodo): Ns {
    const out: Ns = {};
    for (const [k, v] of nodo.a ?? []) {
        if (k === 'xmlns') out[''] = v;
        else if (k.startsWith('xmlns:')) out[k.slice(6)] = v;
    }
    return out;
}

/**
 * Canonical XML 1.0 (inclusivo, sin comentarios) del elemento `nodo` como
 * subconjunto del documento. `contexto` son los espacios de nombres en ámbito
 * declarados por sus ancestros: el ápice los renderiza todos (C14N §2.4,
 * "namespace nodes … in scope"), y cada descendiente solo los que cambian
 * respecto de su ancestro ya renderizado.
 */
export function c14n(nodo: Nodo, contexto: Ns = {}): string {
    return canon(nodo, { ...contexto, ...declaraciones(nodo) }, {}, true);
}

function canon(nodo: Nodo, enAmbito: Ns, renderizado: Ns, apice: boolean): string {
    const propias = declaraciones(nodo);
    const ambito = apice ? enAmbito : { ...enAmbito, ...propias };
    // Declaraciones que este elemento debe emitir: las del ámbito cuyo valor
    // difiere del último renderizado. xmlns="" solo si un ancestro renderizó
    // un predeterminado no vacío.
    const ns: [string, string][] = [];
    for (const [p, uri] of Object.entries(ambito)) {
        if (p === 'xml') continue;
        if (p === '' && uri === '' && !renderizado['']) continue;
        if (renderizado[p] === uri) continue;
        ns.push([p, uri]);
    }
    ns.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    const nuevoRenderizado = { ...renderizado };
    for (const [p, uri] of ns) nuevoRenderizado[p] = uri;

    const attrs = (nodo.a ?? [])
        .filter(([k]) => k !== 'xmlns' && !k.startsWith('xmlns:'))
        .map(([k, v]) => {
            const p = prefijoDe(k);
            const uri = p ? ambito[p] : '';
            if (p && uri === undefined) throw new Error(`c14n: prefijo sin declarar en el atributo ${k}`);
            return { k, v, uri: uri ?? '', local: localDe(k) };
        })
        .sort((x, y) => (x.uri < y.uri ? -1 : x.uri > y.uri ? 1 : x.local < y.local ? -1 : x.local > y.local ? 1 : 0));

    const nsTxt = ns.map(([p, uri]) => ` ${p ? `xmlns:${p}` : 'xmlns'}="${escC14nAtributo(uri)}"`).join('');
    const atTxt = attrs.map(({ k, v }) => ` ${k}="${escC14nAtributo(v)}"`).join('');
    const hijos = (nodo.c ?? []).map((h) => (esNodo(h) ? canon(h, ambito, nuevoRenderizado, false) : escC14nTexto(h.t))).join('');
    return `<${nodo.n}${nsTxt}${atTxt}>${hijos}</${nodo.n}>`;
}

/** Primer descendiente (o el propio nodo) con ese nombre. */
export function buscar(nodo: Nodo, nombre: string): Nodo | null {
    if (nodo.n === nombre) return nodo;
    for (const h of nodo.c ?? []) {
        if (!esNodo(h)) continue;
        const r = buscar(h, nombre);
        if (r) return r;
    }
    return null;
}

/** Texto (decodificado) de un elemento hoja. */
export function textoDe(nodo: Nodo | null | undefined): string {
    return (nodo?.c ?? []).filter((h): h is Texto => !esNodo(h)).map((h) => h.t).join('');
}

// ── Lectura de un fragmento (el CAF) ─────────────────────────────────────────

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodificar(crudo: string): string {
    return crudo.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
        if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
        if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
        return ENTIDADES[e];
    });
}

/**
 * Lee XML "de datos" (elementos, atributos, texto; sin DTD ni CDATA) y
 * conserva la representación cruda de cada texto. Basta para el archivo de
 * autorización de folios del SII. Lanza ante cualquier construcción que no
 * reconoce: un CAF que no se lee bien no se usa.
 */
export function parsearFragmento(xml: string): Nodo {
    let i = 0;
    const src = xml.replace(/^﻿/, '');
    const pila: Nodo[] = [];
    let raiz: Nodo | null = null;
    while (i < src.length) {
        if (src.startsWith('<?', i)) {
            const fin = src.indexOf('?>', i);
            if (fin < 0) throw new Error('XML: instrucción sin cerrar');
            i = fin + 2;
            continue;
        }
        if (src.startsWith('<!--', i)) {
            const fin = src.indexOf('-->', i);
            if (fin < 0) throw new Error('XML: comentario sin cerrar');
            i = fin + 3;
            continue;
        }
        if (src.startsWith('<!', i)) throw new Error('XML: DTD o CDATA no admitidos');
        if (src.startsWith('</', i)) {
            const fin = src.indexOf('>', i);
            const nombre = src.slice(i + 2, fin).trim();
            const abierto = pila.pop();
            if (!abierto || abierto.n !== nombre) throw new Error(`XML: cierre inesperado </${nombre}>`);
            i = fin + 1;
            if (!pila.length) raiz = abierto;
            continue;
        }
        if (src[i] === '<') {
            const fin = src.indexOf('>', i);
            if (fin < 0) throw new Error('XML: etiqueta sin cerrar');
            let cuerpo = src.slice(i + 1, fin);
            const vacio = cuerpo.endsWith('/');
            if (vacio) cuerpo = cuerpo.slice(0, -1);
            const m = /^([A-Za-z_][\w.:-]*)([\s\S]*)$/.exec(cuerpo.trim());
            if (!m) throw new Error('XML: etiqueta ilegible');
            const a: [string, string][] = [];
            const re = /([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
            let resto = m[2];
            let am: RegExpExecArray | null;
            while ((am = re.exec(m[2]))) a.push([am[1], decodificar(am[3] ?? am[4] ?? '')]);
            resto = resto.replace(re, '').trim();
            if (resto) throw new Error('XML: atributo ilegible');
            const nodo: Nodo = { n: m[1], ...(a.length ? { a } : {}) };
            if (pila.length) {
                const padre = pila[pila.length - 1];
                (padre.c ??= []).push(nodo);
            }
            if (vacio) { if (!pila.length) raiz = nodo; } else pila.push(nodo);
            i = fin + 1;
            continue;
        }
        const fin = src.indexOf('<', i);
        const crudo = src.slice(i, fin < 0 ? src.length : fin);
        if (pila.length) {
            const padre = pila[pila.length - 1];
            const t = decodificar(crudo);
            (padre.c ??= []).push(crudo === escXml(t) ? { t } : { t, crudo });
        } else if (crudo.trim()) {
            throw new Error('XML: texto fuera del elemento raíz');
        }
        i = fin < 0 ? src.length : fin;
    }
    if (pila.length || !raiz) throw new Error('XML: documento incompleto');
    return raiz;
}
