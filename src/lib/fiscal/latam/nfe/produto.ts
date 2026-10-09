// Datos de NF-e de un producto del catálogo (`productos.nfe`) y del cliente
// (`clientes.nfe`): lo que la NF-e necesita y Cord no tenía. Se capturan solo
// cuando el riel está activo (regla 15) y se CONGELAN en la línea del
// documento al guardar el borrador (`FiscalLineItem.nfe`): editar el catálogo
// después no cambia una nota ya numerada.
//
// Aquí solo se valida la FORMA; qué combinaciones se pueden emitir lo decide
// el armado (nfe.ts), que conoce el régimen del emisor y el destino.
//
// Puro: lo cargan las acciones del catálogo, la UI y los scripts.

import { CFOP_INTERNO, CSOSN, CST_PIS_COFINS, CCLASSTRIB_SOPORTADAS, NCM_COMBUSTIVEL, ORIGEM, esUf, type Uf } from './constantes.ts';
import { municipio } from '../nfse/municipios.ts';

export interface PisCofinsNfe {
    cst: string;
    /** Porcentaje (1.65, 7.6), solo con CST 01 o 02. */
    aliquota?: number | null;
}

/** Lo que el producto declara para la NF-e, ya normalizado. */
export interface ProdutoNfe {
    /** NCM, 8 dígitos [AI I05]. */
    ncm: string;
    /** CEST, 7 dígitos, si el producto lo tiene [AI I05c]. */
    cest?: string | null;
    /** CFOP de la venta dentro del estado (5101 producción propia, 5102 reventa). */
    cfop: string;
    /** Origen de la mercancía [Torig]. */
    origem: string;
    /** Unidad comercial y tributable (uCom = uTrib), 1 a 6 caracteres. */
    unidade: string;
    /** GTIN (EAN) con dígito verificador válido; vacío = "SEM GTIN". */
    gtin?: string | null;
    /** CSOSN, si el emisor está en el Simples Nacional. */
    csosn?: string | null;
    /** Alícuota interna del ICMS (%), si el emisor está en el Régimen Normal. */
    aliquotaIcms?: number | null;
    /** Fondo de Combate a la Pobreza (%), si el producto lo tiene en la UF. */
    aliquotaFcp?: number | null;
    /**
     * Alícuota del IPI (%), si el producto lo paga (Régimen Normal). Es el
     * único impuesto de la NF-e que se SUMA al precio: el impuesto de la línea
     * en Cord debe ser exactamente esta tasa. ICMS, PIS y COFINS van incluidos.
     */
    aliquotaIpi?: number | null;
    /** Clasificación tributaria del IBS/CBS (Régimen Normal). */
    cClassTrib?: string | null;
    /** Código del producto (cProd): el SKU del catálogo. Lo congela el borrador. */
    codigo?: string | null;
    /** PIS/COFINS propios del producto; ausente = los de Ajustes. */
    pis?: PisCofinsNfe | null;
    cofins?: PisCofinsNfe | null;
}

/** Datos del cliente para la NF-e (`clientes.nfe`). */
export interface ClienteNfe {
    /** Número del domicilio (nro); "S/N" si no tiene. */
    numero: string;
    bairro: string;
    /** Municipio, código IBGE de 7 dígitos; la UF sale de él. */
    municipio: string;
    /** Indicador de IE [AI E16a]: 1 contribuyente, 2 contribuyente exento, 9 no contribuyente. */
    indIEDest: '1' | '2' | '9';
    /** Inscrição Estadual (solo dígitos), con indIEDest = 1. */
    ie?: string | null;
    /** Compra para consumo propio (indFinal = 1). Siempre cierto para un no contribuyente. */
    consumidorFinal: boolean;
}

const limpio = (v: unknown) => String(v ?? '').trim();
const digitos = (v: unknown) => limpio(v).replace(/[.\-\s/]/g, '');

/** Dígito verificador GS1 (módulo 10, pesos 3 y 1 desde la derecha) [AI I03-10, rechazo 611]. */
export function gtinValido(gtin: string): boolean {
    if (!/^([0-9]{8}|[0-9]{12,14})$/.test(gtin)) return false;
    let soma = 0;
    for (let i = gtin.length - 2, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) soma += Number(gtin[i]) * peso;
    return (10 - (soma % 10)) % 10 === Number(gtin[gtin.length - 1]);
}

const pct = (v: unknown, max = 100): number | null | 'invalido' => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > max) return 'invalido';
    // TDec_0302a04: hasta cuatro decimales.
    return Math.round(n * 10000) / 10000;
};

function pisCofins(raw: unknown, nome: string): { ok: true; valor: PisCofinsNfe | null } | { ok: false; error: string } {
    if (!raw || typeof raw !== 'object') return { ok: true, valor: null };
    const r = raw as Record<string, unknown>;
    const cst = limpio(r.cst);
    if (!cst) return { ok: true, valor: null };
    const def = CST_PIS_COFINS.find((c) => c.id === cst);
    if (!def) return { ok: false, error: `El CST del ${nome} no es uno de los que Cord declara.` };
    if (def.grupo !== 'Aliq') return { ok: true, valor: { cst } };
    const a = pct(r.aliquota);
    if (a === 'invalido' || a === null || a <= 0) return { ok: false, error: `Indica la alícuota del ${nome} (en %) para el CST ${cst}.` };
    return { ok: true, valor: { cst, aliquota: a } };
}

/**
 * Normaliza los datos de NF-e que manda el formulario del producto. Vacío =
 * el producto no se vende con NF-e (null).
 */
export function produtoNfeDe(raw: unknown): { ok: true; valor: ProdutoNfe | null } | { ok: false; error: string } {
    if (raw === null || raw === undefined || raw === '') return { ok: true, valor: null };
    if (typeof raw !== 'object') return { ok: false, error: 'Datos de NF-e inválidos.' };
    const r = raw as Record<string, unknown>;
    const ncm = digitos(r.ncm);
    const vacio = !ncm && !limpio(r.cfop) && !limpio(r.cest) && !limpio(r.gtin) && !limpio(r.csosn) && !limpio(r.cClassTrib);
    if (vacio) return { ok: true, valor: null };
    if (!/^[0-9]{8}$/.test(ncm)) return { ok: false, error: 'El NCM del producto debe tener 8 dígitos.' };
    if (NCM_COMBUSTIVEL.test(ncm)) return { ok: false, error: 'Cord todavía no emite NF-e de combustibles ni lubricantes (exigen datos de la ANP y tributación monofásica).' };
    const cest = digitos(r.cest);
    if (cest && !/^[0-9]{7}$/.test(cest)) return { ok: false, error: 'El CEST debe tener 7 dígitos.' };
    const cfop = digitos(r.cfop) || '5102';
    if (!(CFOP_INTERNO as readonly string[]).includes(cfop)) return { ok: false, error: 'Cord emite la venta de producción propia (5101) o de mercancía de terceros (5102).' };
    const origem = limpio(r.origem) || '0';
    if (!ORIGEM.some((o) => o.id === origem)) return { ok: false, error: 'El origen de la mercancía no es válido.' };
    const unidade = limpio(r.unidade).toUpperCase();
    if (!/^[ -ÿ]{1,6}$/.test(unidade) || unidade !== unidade.trim()) return { ok: false, error: 'La unidad de la NF-e (UN, KG, CX…) debe tener de 1 a 6 caracteres.' };
    const gtin = digitos(r.gtin);
    if (gtin && !gtinValido(gtin)) return { ok: false, error: 'El GTIN (código de barras) no es válido: revisa el dígito verificador.' };
    const csosn = limpio(r.csosn);
    if (csosn && !CSOSN.some((c) => c.id === csosn)) return { ok: false, error: 'Ese CSOSN no es uno de los que Cord declara (sustitución tributaria y el 900 no se emiten).' };
    const aliquotaIcms = pct(r.aliquotaIcms);
    if (aliquotaIcms === 'invalido') return { ok: false, error: 'La alícuota del ICMS no es válida.' };
    const aliquotaFcp = pct(r.aliquotaFcp, 4);
    if (aliquotaFcp === 'invalido' || aliquotaFcp === 0) return { ok: false, error: 'El FCP debe ser un porcentaje mayor a 0 y de hasta 4 %.' };
    const aliquotaIpi = pct(r.aliquotaIpi);
    if (aliquotaIpi === 'invalido' || aliquotaIpi === 0) return { ok: false, error: 'La alícuota del IPI debe ser un porcentaje mayor a 0 (déjala vacía si el producto no paga IPI).' };
    const cClassTrib = limpio(r.cClassTrib);
    if (cClassTrib && !CCLASSTRIB_SOPORTADAS.some((c) => c.id === cClassTrib)) return { ok: false, error: 'Esa clasificación del IBS/CBS no es una de las que Cord declara.' };
    const pis = pisCofins(r.pis, 'PIS');
    if (!pis.ok) return pis;
    const cofins = pisCofins(r.cofins, 'COFINS');
    if (!cofins.ok) return cofins;
    return {
        ok: true,
        valor: {
            ncm,
            ...(cest ? { cest } : {}),
            cfop,
            origem,
            unidade,
            ...(gtin ? { gtin } : {}),
            ...(csosn ? { csosn } : {}),
            ...(aliquotaIcms !== null ? { aliquotaIcms } : {}),
            ...(aliquotaFcp !== null ? { aliquotaFcp } : {}),
            ...(aliquotaIpi !== null ? { aliquotaIpi } : {}),
            ...(cClassTrib ? { cClassTrib } : {}),
            ...(pis.valor ? { pis: pis.valor } : {}),
            ...(cofins.valor ? { cofins: cofins.valor } : {}),
        },
    };
}

/** Normaliza los datos de NF-e del cliente. Vacío = null. */
export function clienteNfeDe(raw: unknown): { ok: true; valor: ClienteNfe | null } | { ok: false; error: string } {
    if (raw === null || raw === undefined || raw === '') return { ok: true, valor: null };
    if (typeof raw !== 'object') return { ok: false, error: 'Datos de NF-e del cliente inválidos.' };
    const r = raw as Record<string, unknown>;
    const numero = limpio(r.numero);
    const bairro = limpio(r.bairro);
    const mun = digitos(r.municipio);
    const ind = limpio(r.indIEDest);
    if (!numero && !bairro && !mun && !ind && !limpio(r.ie)) return { ok: true, valor: null };
    if (!numero || numero.length > 60) return { ok: false, error: 'Indica el número del domicilio del cliente (o S/N).' };
    if (bairro.length < 2 || bairro.length > 60) return { ok: false, error: 'Indica el barrio (bairro) del cliente.' };
    if (!municipio(mun)) return { ok: false, error: 'El municipio del cliente no está en la tabla del IBGE.' };
    if (!['1', '2', '9'].includes(ind)) return { ok: false, error: 'Indica si el cliente es contribuyente del ICMS.' };
    const ie = digitos(r.ie);
    if (ind === '1' && !/^[0-9]{2,14}$/.test(ie)) return { ok: false, error: 'Indica la Inscrição Estadual del cliente (solo dígitos).' };
    return {
        ok: true,
        valor: {
            numero: numero.toUpperCase() === 'SN' ? 'S/N' : numero,
            bairro,
            municipio: mun,
            indIEDest: ind as ClienteNfe['indIEDest'],
            ...(ind === '1' ? { ie } : {}),
            consumidorFinal: ind === '9' ? true : r.consumidorFinal === true || r.consumidorFinal === 'true' || r.consumidorFinal === 'on',
        },
    };
}

/** UF del municipio de un cliente (para la UI y el armado). */
export function ufDoMunicipio(cMun: string): Uf | null {
    const m = municipio(cMun);
    return m && esUf(m.uf) ? m.uf : null;
}
