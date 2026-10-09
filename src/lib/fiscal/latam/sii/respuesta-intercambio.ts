// Intercambio de DTE entre contribuyentes, del lado del RECEPTOR: leer y
// validar un envío (EnvioDTE) que llegó de un proveedor, y armar las tres
// respuestas que el receptor le devuelve firmadas con su certificado.
//
// Fuentes primarias (www.sii.cl), cotejadas en scripts/sii-check.mjs:
//   - "Formato Mensaje de Respuesta a DTE" v1.0 y RespuestaEnvioDTE_v10.xsd:
//     <RespuestaDTE><Resultado ID><Caratula/> y <RecepcionEnvio> O
//     <ResultadoDTE>…</Resultado><Signature/></RespuestaDTE>. Las dos
//     secciones son EXCLUYENTES ("en una Respuesta sólo se debe incluir sólo
//     una de ellas", instructivo técnico, Anexo 4): el acuse de recibo del
//     envío y la aceptación o rechazo comercial viajan en archivos distintos.
//   - "Formato Recibo Electrónico de las Mercaderías Entregadas o Servicios
//     Prestados" (Ley 19.983) v1.0, Recibos_v10.xsd y EnvioRecibos_v10.xsd:
//     cada <Recibo> lleva su propia firma y el <SetRecibos> otra; la
//     <Declaracion> es el texto FIJO del esquema.
//   - Instructivo técnico, Anexo 4, 4.3: por correo, "con un único archivo
//     adjunto que contenga una Respuesta".
//
// Validación del envío recibido:
//   - legible y sin DTD (parsearFragmento rechaza DTD y CDATA: no hay XXE);
//   - la estructura que el esquema exige y Cord lee (carátula, RUT con dígito
//     verificador, tipo, folio, fecha, montos enteros, timbre, firma). No hay
//     un validador XSD en el servidor: la validación completa contra
//     EnvioDTE_v10.xsd corre en scripts/sii-check.mjs sobre los envíos que
//     arma Cord; aquí se verifica lo que el receptor necesita para responder;
//   - firma XMLDSig del <SetDTE> y de cada <Documento> (RSA-SHA1, digest
//     SHA1, C14N inclusivo, como fija xmldsignature_v10.xsd) con el
//     certificado que viaja en la propia firma. El DTE se acepta firmado
//     suelto (la convención del SII, envio.ts) o en el contexto del sobre.
//     La cadena del certificado no se verifica: es del SII, que también
//     recibe el DTE;
//   - RUT receptor = el del negocio (estado 3) y RUT emisor de cada DTE = el
//     de la carátula (estado 2).
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { createHash, createVerify, X509Certificate } from 'node:crypto';
import {
    DECLARACION_RECIBO, NS_SII_DTE, NS_XSI, SCHEMA_LOCATION_RECIBOS, SCHEMA_LOCATION_RESPUESTA,
} from './constantes.ts';
import { DECLARACION_XML } from './envio.ts';
import { ALG_C14N, ALG_RSA_SHA1, ALG_SHA1, digestSha1, firmar, type ClaveFirma } from './firma.ts';
import { campo, fechaHoraChile, fechaIso, rutValido } from './texto.ts';
import { c14n, el, esNodo, formatear, opt, parsearFragmento, serializar, type Nodo, type Texto } from './xml.ts';

/** Un envío de DTE de más de esto no es un envío real: se rechaza ilegible. */
export const TAMANO_MAXIMO_ENVIO = 5 * 1024 * 1024;

export type EstadoRecepEnv = 0 | 1 | 2 | 3 | 90 | 91 | 99;
export type EstadoRecepDte = 0 | 1 | 2 | 3 | 4 | 99;
export type EstadoResultadoDte = 0 | 1 | 2;

/** Glosas del formato (Formato Mensaje de Respuesta a DTE, RECEPCION ENVÍO, campos 8 y 17). */
export const GLOSA_RECEP_ENV: Readonly<Record<EstadoRecepEnv, string>> = {
    0: 'Envío Recibido Conforme',
    1: 'Envío Rechazado - Error de Schema',
    2: 'Envío Rechazado - Error de Firma',
    3: 'Envío Rechazado - RUT Receptor No Corresponde',
    90: 'Envío Rechazado - Archivo Repetido',
    91: 'Envío Rechazado - Archivo Ilegible',
    99: 'Envío Rechazado - Otros',
};
export const GLOSA_RECEP_DTE: Readonly<Record<EstadoRecepDte, string>> = {
    0: 'DTE Recibido OK',
    1: 'DTE No Recibido - Error de Firma',
    2: 'DTE No Recibido - Error en RUT Emisor',
    3: 'DTE No Recibido - Error en RUT Receptor',
    4: 'DTE No Recibido - DTE Repetido',
    99: 'DTE No Recibido - Otros',
};
/** Glosas del resultado comercial (campo 9: "ACEPTADO OK, o ACEPTADO CON DISCREPANCIAS, o RECHAZADO"). */
export const GLOSA_RESULTADO: Readonly<Record<EstadoResultadoDte, string>> = {
    0: 'ACEPTADO OK',
    1: 'ACEPTADO CON DISCREPANCIAS',
    2: 'RECHAZADO',
};

/** Tipos de DTE que el esquema de respuesta admite (DTEType de SiiTypes_v10.xsd). */
const TIPOS_DTE_ESQUEMA = new Set([29, 30, 32, 33, 34, 35, 38, 39, 40, 41, 43, 45, 46, 48, 50, 52, 55, 56, 60, 61, 101, 102, 103, 104, 105, 106, 108, 109, 110, 111, 112, 901, 902, 903, 904, 905, 906, 907, 909, 910, 911, 914, 918, 919, 920, 921, 922, 924]);

export interface DteRecibido {
    id: string;
    tipo: number;
    folio: number;
    fechaEmision: string;
    rutEmisor: string;
    razonSocialEmisor: string;
    correoEmisor: string | null;
    rutReceptor: string;
    montoTotal: number;
    neto: number | null;
    exento: number | null;
    iva: number | null;
    /** El <DTE> tal como vino dentro del sobre. */
    xml: string;
    estado: EstadoRecepDte;
    glosa: string;
}

export interface EnvioRecibido {
    /** Atributo ID del <SetDTE> (EnvioDTEID). */
    setId: string;
    /** DigestValue de la firma del envío. */
    digest: string | null;
    rutEmisor: string | null;
    rutEnvia: string | null;
    rutReceptor: string | null;
    estado: EstadoRecepEnv;
    glosa: string;
    documentos: DteRecibido[];
    sha256: string;
}

// ── Lectura del árbol ────────────────────────────────────────────────────────

type Ns = Record<string, string>;
const local = (n: string) => (n.includes(':') ? n.slice(n.indexOf(':') + 1) : n);
const hijos = (n: Nodo | null | undefined, nombre?: string): Nodo[] =>
    (n?.c ?? []).filter((h): h is Nodo => esNodo(h) && (!nombre || local(h.n) === nombre));
const hijo = (n: Nodo | null | undefined, nombre: string): Nodo | null => hijos(n, nombre)[0] ?? null;
const textoDe = (n: Nodo | null | undefined): string =>
    (n?.c ?? []).filter((h): h is Texto => !esNodo(h)).map((h) => h.t).join('').trim();
const valor = (n: Nodo | null | undefined, ...ruta: string[]): string => {
    let cur: Nodo | null | undefined = n;
    for (const r of ruta) cur = hijo(cur, r);
    return textoDe(cur);
};
const atributo = (n: Nodo | null | undefined, nombre: string): string => (n?.a ?? []).find(([k]) => k === nombre)?.[1] ?? '';
const entero = (v: string): number | null => (/^\d{1,18}$/.test(v) ? Number(v) : null);

function declaraciones(n: Nodo): Ns {
    const out: Ns = {};
    for (const [k, v] of n.a ?? []) {
        if (k === 'xmlns') out[''] = v;
        else if (k.startsWith('xmlns:')) out[k.slice(6)] = v;
    }
    return out;
}
const ambito = (ancestros: Nodo[]): Ns => ancestros.reduce((ns, a) => ({ ...ns, ...declaraciones(a) }), {} as Ns);

const certPem = (b64: string) => `-----BEGIN CERTIFICATE-----\n${b64.replace(/\s+/g, '').replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END CERTIFICATE-----\n`;

/**
 * Verifica una firma XMLDSig del SII sobre `objetivo` (referenciado por su
 * ID). Prueba el contexto real del documento y el del elemento suelto: la
 * convención del SII firma el DTE suelto y después lo mete en el sobre.
 */
export function verificarFirmaRecibida(objetivo: Nodo, ancestrosObjetivo: Nodo[], firma: Nodo, ancestrosFirma: Nodo[]): { ok: boolean; motivo?: string } {
    const si = hijo(firma, 'SignedInfo');
    if (!si) return { ok: false, motivo: 'firma sin SignedInfo' };
    if (atributo(hijo(si, 'CanonicalizationMethod'), 'Algorithm') !== ALG_C14N) return { ok: false, motivo: 'canonicalización no admitida' };
    if (atributo(hijo(si, 'SignatureMethod'), 'Algorithm') !== ALG_RSA_SHA1) return { ok: false, motivo: 'algoritmo de firma no admitido' };
    const refs = hijos(si, 'Reference');
    const id = atributo(objetivo, 'ID');
    const ref = refs.find((r) => atributo(r, 'URI') === `#${id}`);
    if (!id || !ref || refs.length !== 1) return { ok: false, motivo: 'la firma no referencia el elemento firmado' };
    if (atributo(hijo(ref, 'DigestMethod'), 'Algorithm') !== ALG_SHA1) return { ok: false, motivo: 'digest no admitido' };
    const transforms = hijos(hijo(ref, 'Transforms'), 'Transform').map((t) => atributo(t, 'Algorithm'));
    if (transforms.some((t) => t !== ALG_C14N)) return { ok: false, motivo: 'transformación no admitida' };
    const digest = valor(ref, 'DigestValue').replace(/\s+/g, '');
    const firmaValor = valor(firma, 'SignatureValue').replace(/\s+/g, '');
    const certB64 = valor(hijo(hijo(firma, 'KeyInfo'), 'X509Data'), 'X509Certificate');
    if (!digest || !firmaValor || !certB64) return { ok: false, motivo: 'firma incompleta' };
    let llave;
    try { llave = new X509Certificate(certPem(certB64)).publicKey; } catch { return { ok: false, motivo: 'certificado ilegible' }; }

    const intentos = <T>(fn: () => T): T | null => { try { return fn(); } catch { return null; } };
    const contextosObjetivo = [ambito(ancestrosObjetivo), {}];
    const digestOk = contextosObjetivo.some((ctx) => intentos(() => digestSha1(c14n(objetivo, ctx))) === digest);
    if (!digestOk) return { ok: false, motivo: 'el contenido no coincide con su firma' };
    const contextosSi = [ambito([...ancestrosFirma, firma]), declaraciones(firma)];
    const valorOk = contextosSi.some((ctx) => intentos(() => createVerify('RSA-SHA1').update(c14n(si, ctx), 'utf8')
        .verify(llave, Buffer.from(firmaValor, 'base64'))) === true);
    return valorOk ? { ok: true } : { ok: false, motivo: 'la firma no verifica con su certificado' };
}

/** XML 1.0 normaliza los fines de línea antes de cualquier otra cosa (§2.11). */
const normalizarFinesDeLinea = (t: string) => t.replace(/\r\n?/g, '\n');

function sha256(bytes: Uint8Array | string): string {
    return createHash('sha256').update(typeof bytes === 'string' ? Buffer.from(bytes, 'latin1') : bytes).digest('hex');
}

function rechazado(estado: EstadoRecepEnv, detalle: string | null, base: Partial<EnvioRecibido> & { sha256: string }): EnvioRecibido {
    const glosa = detalle ? `${GLOSA_RECEP_ENV[estado]}: ${detalle}` : GLOSA_RECEP_ENV[estado];
    return {
        setId: '', digest: null, rutEmisor: null, rutEnvia: null, rutReceptor: null, documentos: [],
        ...base, estado, glosa: glosa.slice(0, 256),
    };
}

/** Lee un DTE del sobre. Null si le faltan los datos con los que se responde (va a la glosa del envío). */
function leerDte(dte: Nodo, ancestros: Nodo[], rutEmisorEnvio: string | null, rutNegocio: string): DteRecibido | null {
    const doc = hijo(dte, 'Documento');
    const enc = hijo(doc, 'Encabezado');
    const idDoc = hijo(enc, 'IdDoc');
    const tipo = entero(valor(idDoc, 'TipoDTE'));
    const folio = entero(valor(idDoc, 'Folio'));
    const fecha = fechaIso(valor(idDoc, 'FchEmis'));
    const rutEmisor = rutValido(valor(enc, 'Emisor', 'RUTEmisor'));
    const rutReceptor = rutValido(valor(enc, 'Receptor', 'RUTRecep'));
    const total = entero(valor(enc, 'Totales', 'MntTotal'));
    if (!doc || tipo === null || !TIPOS_DTE_ESQUEMA.has(tipo) || !folio || !fecha || !rutEmisor || !rutReceptor || total === null) return null;
    const opcional = (k: string) => entero(valor(enc, 'Totales', k));
    let estado: EstadoRecepDte = 0;
    let detalle: string | null = null;
    const firma = hijo(dte, 'Signature');
    if (!hijo(doc, 'TED') || !firma || !atributo(doc, 'ID')) {
        estado = 99;
        detalle = 'documento sin timbre o sin firma';
    } else if (!verificarFirmaRecibida(doc, [...ancestros, dte], firma, [...ancestros, dte]).ok) {
        estado = 1;
    } else if (rutEmisorEnvio && rutEmisor !== rutEmisorEnvio) {
        estado = 2;
    } else if (rutReceptor !== rutNegocio) {
        estado = 3;
    }
    const correo = valor(enc, 'Emisor', 'CorreoEmisor');
    return {
        id: atributo(doc, 'ID'),
        tipo, folio, fechaEmision: fecha, rutEmisor,
        razonSocialEmisor: valor(enc, 'Emisor', 'RznSoc').slice(0, 100),
        correoEmisor: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo.slice(0, 80) : null,
        rutReceptor, montoTotal: total,
        neto: opcional('MntNeto'), exento: opcional('MntExe'), iva: opcional('IVA'),
        xml: serializar(dte),
        estado,
        glosa: (detalle ? `${GLOSA_RECEP_DTE[estado]}: ${detalle}` : GLOSA_RECEP_DTE[estado]).slice(0, 256),
    };
}

/**
 * Lee y valida un envío recibido. Nunca lanza: lo que no se puede leer es un
 * estado del formato (91 ilegible, 1 esquema, 2 firma, 3 RUT receptor) con su
 * glosa, y así se responde.
 */
export function leerEnvioRecibido(entrada: Uint8Array | string, rutNegocio: string): EnvioRecibido {
    const bytes = typeof entrada === 'string' ? Buffer.from(entrada, 'latin1') : Buffer.from(entrada);
    const huella = sha256(bytes);
    if (bytes.length > TAMANO_MAXIMO_ENVIO) return rechazado(91, 'el archivo excede el tamaño de un envío', { sha256: huella });
    const declarado = /encoding\s*=\s*["']([^"']+)["']/i.exec(bytes.subarray(0, 200).toString('latin1'))?.[1]?.toLowerCase() ?? '';
    const texto = normalizarFinesDeLinea(/utf-?8/.test(declarado) ? bytes.toString('utf8') : bytes.toString('latin1'));
    let raiz: Nodo;
    try { raiz = parsearFragmento(texto); } catch { return rechazado(91, null, { sha256: huella }); }
    if (local(raiz.n) !== 'EnvioDTE') return rechazado(1, 'el archivo no es un envío de DTE (EnvioDTE)', { sha256: huella });
    const set = hijo(raiz, 'SetDTE');
    const firma = hijo(raiz, 'Signature');
    const caratula = hijo(set, 'Caratula');
    const setId = atributo(set, 'ID').slice(0, 80);
    const digest = valor(hijo(hijo(firma, 'SignedInfo'), 'Reference'), 'DigestValue').replace(/\s+/g, '') || null;
    const rutEmisor = rutValido(valor(caratula, 'RutEmisor'));
    const rutEnvia = rutValido(valor(caratula, 'RutEnvia'));
    const rutReceptor = rutValido(valor(caratula, 'RutReceptor'));
    const base = { sha256: huella, setId, digest, rutEmisor, rutEnvia, rutReceptor };
    const dtes = hijos(set, 'DTE');
    const subtotales = hijos(caratula, 'SubTotDTE');
    if (!set || !setId || !firma || !caratula || !rutEmisor || !rutEnvia || !rutReceptor || !fechaIso(valor(caratula, 'FchResol'))
        || entero(valor(caratula, 'NroResol')) === null || !valor(caratula, 'TmstFirmaEnv') || !subtotales.length || !dtes.length) {
        return rechazado(1, 'falta información obligatoria de la carátula o del envío', base);
    }
    const declarados = subtotales.reduce((s, st) => s + (entero(valor(st, 'NroDTE')) ?? 0), 0);
    if (declarados !== dtes.length) return rechazado(1, 'la carátula no declara la cantidad de documentos que trae', base);
    if (!verificarFirmaRecibida(set, [raiz], firma, [raiz]).ok) return rechazado(2, null, base);

    const documentos: DteRecibido[] = [];
    let ilegibles = 0;
    for (const dte of dtes) {
        const d = leerDte(dte, [raiz, set], rutEmisor, rutNegocio);
        if (d) documentos.push(d); else ilegibles++;
    }
    if (rutReceptor !== rutNegocio) {
        return { ...rechazado(3, null, base), documentos: documentos.map((d) => ({ ...d, estado: 3, glosa: GLOSA_RECEP_DTE[3] })) };
    }
    const glosa = ilegibles
        ? `${GLOSA_RECEP_ENV[0]}. ${ilegibles} documento(s) no se pudieron leer y no se informan.`
        : GLOSA_RECEP_ENV[0];
    return { ...base, estado: 0, glosa, documentos };
}

// ── Respuestas ───────────────────────────────────────────────────────────────

export interface Contacto { nombre?: string | null; fono?: string | null; mail?: string | null }

export interface CaratulaRespuesta {
    /** RUT del negocio, que responde. */
    rutResponde: string;
    /** RUT del emisor del envío o de los documentos. */
    rutRecibe: string;
    idRespuesta: number;
    contacto?: Contacto;
}

const NS_RESPUESTA = { '': NS_SII_DTE, xsi: NS_XSI };

function contactoNodos(c?: Contacto): Array<Nodo | null> {
    const mail = c?.mail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.mail) ? campo(c.mail, 80) : null;
    const fono = c?.fono ? campo(c.fono, 40) : null;
    return [opt('NmbContacto', c?.nombre ? campo(c.nombre, 40) : null), opt('FonoContacto', fono), opt('MailContacto', mail)];
}

/** Sobre <RespuestaDTE> firmado: la firma cubre <Resultado> en el contexto del documento (como el SetDTE). */
function respuestaFirmada(id: string, c: CaratulaRespuesta, nroDetalles: number, detalle: Nodo[], firmadoEn: Date, clave: ClaveFirma): string {
    const caratula = el('Caratula', [['version', '1.0']],
        el('RutResponde', null, c.rutResponde),
        el('RutRecibe', null, c.rutRecibe),
        el('IdRespuesta', null, String(c.idRespuesta)),
        el('NroDetalles', null, String(nroDetalles)),
        ...contactoNodos(c.contacto),
        el('TmstFirmaResp', null, fechaHoraChile(firmadoEn)));
    const resultado = formatear(el('Resultado', [['ID', id]], caratula, ...detalle));
    const firma = firmar(c14n(resultado, NS_RESPUESTA), `#${id}`, clave, NS_RESPUESTA);
    const raiz = formatear(el('RespuestaDTE', [
        ['xmlns', NS_SII_DTE], ['xmlns:xsi', NS_XSI], ['xsi:schemaLocation', SCHEMA_LOCATION_RESPUESTA], ['version', '1.0'],
    ], resultado, firma));
    return `${DECLARACION_XML}\n${serializar(raiz)}\n`;
}

export interface DatosRecepcion {
    nombreArchivo: string;
    recibidoEn: Date;
    codEnvio: number;
    envio: EnvioRecibido;
}

/** Respuesta de recepción del envío (acuse de recibo, sin aceptación comercial). */
export function respuestaRecepcion(c: CaratulaRespuesta, r: DatosRecepcion, firmadoEn: Date, clave: ClaveFirma): string {
    const e = r.envio;
    const docs = e.documentos.map((d) => el('RecepcionDTE', null,
        el('TipoDTE', null, String(d.tipo)),
        el('Folio', null, String(d.folio)),
        el('FchEmis', null, d.fechaEmision),
        el('RUTEmisor', null, d.rutEmisor),
        el('RUTRecep', null, d.rutReceptor),
        el('MntTotal', null, String(d.montoTotal)),
        el('EstadoRecepDTE', null, String(d.estado)),
        el('RecepDTEGlosa', null, campo(d.glosa, 256))));
    const recepcion = el('RecepcionEnvio', null,
        el('NmbEnvio', null, campo(r.nombreArchivo || 'envio.xml', 80)),
        el('FchRecep', null, fechaHoraChile(r.recibidoEn)),
        el('CodEnvio', null, String(r.codEnvio)),
        el('EnvioDTEID', null, campo(e.setId, 80)),
        opt('Digest', e.digest && /^[A-Za-z0-9+/=]+$/.test(e.digest) ? e.digest : null),
        opt('RutEmisor', e.rutEmisor),
        opt('RutReceptor', e.rutReceptor),
        el('EstadoRecepEnv', null, String(e.estado)),
        el('RecepEnvGlosa', null, campo(e.glosa, 256)),
        docs.length ? el('NroDTE', null, String(docs.length)) : null,
        ...docs);
    return respuestaFirmada(`RecepcionEnvio${r.codEnvio}`, c, 1, [recepcion], firmadoEn, clave);
}

export interface ResultadoComercial {
    tipo: number;
    folio: number;
    fechaEmision: string;
    rutEmisor: string;
    rutReceptor: string;
    montoTotal: number;
    codEnvio: number;
    estado: EstadoResultadoDte;
    /** Motivo del rechazo o de la discrepancia (obligatorio en esos casos, Ley 19.983). */
    motivo?: string | null;
}

/** Respuesta de aprobación o rechazo comercial de uno o más DTE. */
export function respuestaResultado(c: CaratulaRespuesta, resultados: ResultadoComercial[], firmadoEn: Date, clave: ClaveFirma): string {
    if (!resultados.length) throw new Error('sii: una respuesta de resultado necesita al menos un documento');
    const nodos = resultados.map((r) => {
        if (r.estado !== 0 && !String(r.motivo ?? '').trim()) throw new Error('sii: un rechazo o una discrepancia necesita su motivo');
        const glosa = r.estado === 0 ? GLOSA_RESULTADO[0] : `${GLOSA_RESULTADO[r.estado]}: ${r.motivo}`;
        return el('ResultadoDTE', null,
            el('TipoDTE', null, String(r.tipo)),
            el('Folio', null, String(r.folio)),
            el('FchEmis', null, r.fechaEmision),
            el('RUTEmisor', null, r.rutEmisor),
            el('RUTRecep', null, r.rutReceptor),
            el('MntTotal', null, String(r.montoTotal)),
            el('CodEnvio', null, String(r.codEnvio)),
            el('EstadoDTE', null, String(r.estado)),
            el('EstadoDTEGlosa', null, campo(glosa, 256)));
    });
    return respuestaFirmada(`ResultadoDTE${c.idRespuesta}`, c, resultados.length, nodos, firmadoEn, clave);
}

export interface ReciboMercaderias {
    tipo: number;
    folio: number;
    fechaEmision: string;
    rutEmisor: string;
    rutReceptor: string;
    montoTotal: number;
    /** Lugar donde se recibieron las mercaderías o se prestó el servicio (≤ 80). */
    recinto: string;
    /** RUT de quien firma el recibo: el titular del certificado. */
    rutFirma: string;
}

/**
 * Envío de recibos de mercaderías o servicios (Ley 19.983): cada <Recibo> se
 * firma suelto —como el DTE (envio.ts)— y el <SetRecibos> en el contexto del
 * sobre. La declaración es el texto fijo del esquema.
 */
export function envioRecibos(c: Omit<CaratulaRespuesta, 'idRespuesta'> & { idEnvio: number }, recibos: ReciboMercaderias[], firmadoEn: Date, clave: ClaveFirma): string {
    if (!recibos.length) throw new Error('sii: un envío de recibos necesita al menos un recibo');
    const tmst = fechaHoraChile(firmadoEn);
    const nodos = recibos.map((r) => {
        const id = `R${r.rutEmisor.replace('-', '')}T${r.tipo}F${r.folio}`;
        const recinto = campo(r.recinto, 80);
        if (!recinto) throw new Error('sii: el recibo necesita el recinto');
        const doc = formatear(el('DocumentoRecibo', [['ID', id]],
            el('TipoDoc', null, String(r.tipo)),
            el('Folio', null, String(r.folio)),
            el('FchEmis', null, r.fechaEmision),
            el('RUTEmisor', null, r.rutEmisor),
            el('RUTRecep', null, r.rutReceptor),
            el('MntTotal', null, String(r.montoTotal)),
            el('Recinto', null, recinto),
            el('RutFirma', null, r.rutFirma),
            el('Declaracion', null, DECLARACION_RECIBO),
            el('TmstFirmaRecibo', null, tmst)));
        const firma = firmar(c14n(doc, {}), `#${id}`, clave, {});
        return formatear(el('Recibo', [['version', '1.0']], doc, firma));
    });
    const setId = `SetRecibos${c.idEnvio}`;
    const caratula = el('Caratula', [['version', '1.0']],
        el('RutResponde', null, c.rutResponde),
        el('RutRecibe', null, c.rutRecibe),
        ...contactoNodos(c.contacto),
        el('TmstFirmaEnv', null, tmst));
    const set = formatear(el('SetRecibos', [['ID', setId]], caratula, ...nodos));
    const firma = firmar(c14n(set, NS_RESPUESTA), `#${setId}`, clave, NS_RESPUESTA);
    const raiz = formatear(el('EnvioRecibos', [
        ['xmlns', NS_SII_DTE], ['xmlns:xsi', NS_XSI], ['xsi:schemaLocation', SCHEMA_LOCATION_RECIBOS], ['version', '1.0'],
    ], set, firma));
    return `${DECLARACION_XML}\n${serializar(raiz)}\n`;
}
