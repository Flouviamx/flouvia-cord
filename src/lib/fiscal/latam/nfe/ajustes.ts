// Ajustes de la NF-e por organización (`fiscal_rail_ajustes` con rail = 'nfe')
// y lo que falta para emitir. Son datos de la inscripción estadual y del
// régimen del negocio: Cord no deduce ninguno (un dato fiscal inventado se
// rechaza en la SEFAZ en el mejor caso y en el peor se declara mal).
//
// Puro: lo cargan la UI, el endpoint, el proveedor y los scripts.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { CRT, IND_PRES, MOD_FRETE, NUMERO_MAX, SERIE_MAX, SERIE_MIN, type Crt } from './constantes.ts';
import { municipio } from '../nfse/municipios.ts';
import type { PisCofinsNfe } from './produto.ts';
import { CST_PIS_COFINS } from './constantes.ts';

export interface AjustesNfe {
    /** Serie de la NF-e exclusiva de Cord (0 a 889). */
    serie?: number;
    /** Primer número de la serie, si ya se usó en otro emisor. */
    numeroInicial?: number;
    crt?: Crt;
    /** Inscrição Estadual del establecimiento (solo dígitos). */
    ie?: string;
    /** Inscrição Municipal y CNAE (opcionales, van juntos en la NF-e). */
    im?: string;
    cnae?: string;
    nomeFantasia?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    /** Código IBGE del municipio del establecimiento (la UF sale de él). */
    municipio?: string;
    cep?: string;
    telefone?: string;
    /** Naturaleza de la operación (natOp). */
    natOp?: string;
    indPres?: string;
    modFrete?: string;
    /** PIS/COFINS por defecto (cada producto puede declarar los suyos). */
    pis?: PisCofinsNfe;
    cofins?: PisCofinsNfe;
    /** Excluir el ICMS destacado de la base del PIS/COFINS (CST 01 y 02). */
    pisCofinsSemIcms?: boolean;
    /** % de crédito de ICMS que el Simples permite transferir (CSOSN 101). */
    pCredSN?: number;
    /** Información complementaria fija (infCpl): leyendas que el régimen del negocio exige. */
    infCpl?: string;
}

export type FaltanteNfe =
    | 'documento' | 'serie' | 'crt' | 'ie' | 'endereco' | 'municipio' | 'cep' | 'pis_cofins'
    | 'certificado' | 'certificado_vencido' | 'certificado_documento' | 'responsavel_tecnico';

export const FALTANTE_ES: Record<FaltanteNfe, string> = {
    documento: 'CNPJ del negocio',
    serie: 'serie de la NF-e',
    crt: 'régimen tributario (Simples Nacional o Régimen Normal)',
    ie: 'Inscrição Estadual',
    endereco: 'dirección del establecimiento (calle, número y barrio)',
    municipio: 'municipio del establecimiento (código IBGE)',
    cep: 'CEP del establecimiento',
    pis_cofins: 'CST del PIS y del COFINS',
    certificado: 'certificado digital ICP-Brasil',
    certificado_vencido: 'certificado digital vigente',
    certificado_documento: 'certificado a nombre del CNPJ del negocio',
    responsavel_tecnico: 'la SEFAZ de tu estado exige datos que Cord todavía no tiene: escríbenos a soporte@flouvia.com',
};

export const FALTANTE_EN: Record<FaltanteNfe, string> = {
    documento: 'your business CNPJ',
    serie: 'the NF-e series',
    crt: 'your tax regime (Simples Nacional or Regime Normal)',
    ie: 'the Inscrição Estadual',
    endereco: 'the establishment address (street, number and district)',
    municipio: 'the municipality of your establishment (IBGE code)',
    cep: 'the establishment CEP',
    pis_cofins: 'the PIS and COFINS CST',
    certificado: 'the ICP-Brasil digital certificate',
    certificado_vencido: 'a valid digital certificate',
    certificado_documento: 'a certificate issued to your business CNPJ',
    responsavel_tecnico: 'your state tax authority requires details Cord does not have yet: write to soporte@flouvia.com',
};

export const NATOP_PADRAO = 'Venda de mercadoria';

export function serieNfeValida(v: unknown): number | null {
    const s = String(v ?? '').trim();
    if (!/^\d{1,3}$/.test(s)) return null;
    const n = Number(s);
    return n >= SERIE_MIN && n <= SERIE_MAX ? n : null;
}

const texto = (v: unknown, min: number, max: number): string | null => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    return s.length >= min && s.length <= max && /^[ -ÿ]+$/.test(s) ? s : null;
};

function pisCofinsValido(p: PisCofinsNfe | undefined): boolean {
    if (!p) return false;
    const def = CST_PIS_COFINS.find((c) => c.id === p.cst);
    if (!def) return false;
    return def.grupo !== 'Aliq' || Number(p.aliquota) > 0;
}

export function faltantesAjustes(a: Partial<AjustesNfe>): FaltanteNfe[] {
    const faltan: FaltanteNfe[] = [];
    if (serieNfeValida(a.serie) === null) faltan.push('serie');
    if (!CRT.some((c) => c.id === a.crt)) faltan.push('crt');
    if (!/^[0-9]{2,14}$/.test(String(a.ie ?? ''))) faltan.push('ie');
    if (!a.logradouro || !a.numero || !a.bairro) faltan.push('endereco');
    if (!municipio(a.municipio)) faltan.push('municipio');
    if (!/^[0-9]{8}$/.test(String(a.cep ?? ''))) faltan.push('cep');
    if (!pisCofinsValido(a.pis) || !pisCofinsValido(a.cofins)) faltan.push('pis_cofins');
    return faltan;
}

/**
 * Valida y normaliza un cambio de ajustes que llega del navegador. Devuelve
 * los ajustes nuevos o un mensaje apto para el usuario.
 */
export function aplicarCambio(actuales: Partial<AjustesNfe>, body: Record<string, unknown>): { ok: true; ajustes: AjustesNfe } | { ok: false; error: string } {
    const n: AjustesNfe = { ...actuales };
    const tiene = (k: string) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;
    const vacio = (v: unknown) => v === null || String(v).trim() === '';
    const digitos = (v: unknown) => String(v ?? '').replace(/[.\-\s/()]/g, '');

    if (tiene('serie')) {
        if (vacio(body.serie)) delete n.serie;
        else {
            const s = serieNfeValida(body.serie);
            if (s === null) return { ok: false, error: `La serie de la NF-e debe ser un número entre ${SERIE_MIN} y ${SERIE_MAX}.` };
            n.serie = s;
        }
    }
    if (tiene('numero_inicial')) {
        if (vacio(body.numero_inicial)) delete n.numeroInicial;
        else {
            const v = Number(body.numero_inicial);
            if (!Number.isInteger(v) || v < 1 || v > NUMERO_MAX) return { ok: false, error: 'El número inicial de la NF-e debe ser un entero entre 1 y 999.999.999.' };
            n.numeroInicial = v;
        }
    }
    if (tiene('crt')) {
        const v = Number(body.crt);
        if (!CRT.some((c) => c.id === v)) return { ok: false, error: 'Régimen tributario inválido.' };
        n.crt = v as Crt;
    }
    if (tiene('ie')) {
        const v = digitos(body.ie);
        if (!v) delete n.ie;
        else if (!/^[0-9]{2,14}$/.test(v)) return { ok: false, error: 'La Inscrição Estadual tiene de 2 a 14 dígitos.' };
        else n.ie = v;
    }
    if (tiene('im')) {
        const v = String(body.im ?? '').trim();
        if (!v) delete n.im;
        else if (v.length > 15 || !/^[0-9A-Za-z./-]+$/.test(v)) return { ok: false, error: 'La inscripción municipal admite hasta 15 caracteres, sin espacios.' };
        else n.im = v.replace(/[./-]/g, '');
    }
    if (tiene('cnae')) {
        const v = digitos(body.cnae);
        if (!v) delete n.cnae;
        else if (!/^[0-9]{7}$/.test(v)) return { ok: false, error: 'El CNAE tiene 7 dígitos.' };
        else n.cnae = v;
    }
    const campos: [string, keyof AjustesNfe, number, number, string][] = [
        ['nome_fantasia', 'nomeFantasia', 1, 60, 'El nombre de fantasía admite hasta 60 caracteres.'],
        ['logradouro', 'logradouro', 2, 60, 'La calle (logradouro) debe tener de 2 a 60 caracteres.'],
        ['numero', 'numero', 1, 60, 'El número del domicilio admite hasta 60 caracteres (o S/N).'],
        ['complemento', 'complemento', 1, 60, 'El complemento admite hasta 60 caracteres.'],
        ['bairro', 'bairro', 2, 60, 'El barrio (bairro) debe tener de 2 a 60 caracteres.'],
        ['nat_op', 'natOp', 1, 60, 'La naturaleza de la operación admite hasta 60 caracteres.'],
        ['inf_cpl', 'infCpl', 1, 2000, 'La información complementaria admite hasta 2000 caracteres.'],
    ];
    for (const [k, campo, min, max, error] of campos) {
        if (!tiene(k)) continue;
        if (vacio(body[k])) { delete n[campo]; continue; }
        const v = texto(body[k], min, max);
        if (!v) return { ok: false, error };
        (n as Record<string, unknown>)[campo] = v;
    }
    if (tiene('municipio')) {
        if (vacio(body.municipio)) delete n.municipio;
        else {
            const m = municipio(body.municipio);
            if (!m) return { ok: false, error: 'El código IBGE del municipio no existe. Son 7 dígitos; por ejemplo, 3550308 es São Paulo.' };
            n.municipio = m.codigo;
        }
    }
    if (tiene('cep')) {
        const v = digitos(body.cep);
        if (!v) delete n.cep;
        else if (!/^[0-9]{8}$/.test(v)) return { ok: false, error: 'El CEP tiene 8 dígitos.' };
        else n.cep = v;
    }
    if (tiene('telefone')) {
        const v = digitos(body.telefone).replace(/^\+?55(?=\d{10,11}$)/, '');
        if (!v) delete n.telefone;
        else if (!/^[0-9]{6,14}$/.test(v)) return { ok: false, error: 'El teléfono admite de 6 a 14 dígitos (con DDD).' };
        else n.telefone = v;
    }
    if (tiene('ind_pres')) {
        const v = String(body.ind_pres ?? '');
        if (!IND_PRES.some((p) => p.id === v)) return { ok: false, error: 'Indica cómo se hace la venta (presencial, por internet…).' };
        n.indPres = v;
    }
    if (tiene('mod_frete')) {
        const v = String(body.mod_frete ?? '');
        if (!MOD_FRETE.some((p) => p.id === v)) return { ok: false, error: 'Modalidad del flete inválida.' };
        n.modFrete = v;
    }
    for (const [k, campo, nome] of [['pis', 'pis', 'PIS'], ['cofins', 'cofins', 'COFINS']] as const) {
        const cst = body[`${k}_cst`];
        if (cst === undefined) continue;
        if (vacio(cst)) { delete n[campo]; continue; }
        const def = CST_PIS_COFINS.find((c) => c.id === String(cst));
        if (!def) return { ok: false, error: `El CST del ${nome} no es uno de los que Cord declara.` };
        if (def.grupo === 'Aliq') {
            const a = Number(String(body[`${k}_aliquota`] ?? '').replace(',', '.'));
            if (!(a > 0 && a <= 100)) return { ok: false, error: `Indica la alícuota del ${nome} (en %) para el CST ${def.id}.` };
            n[campo] = { cst: def.id, aliquota: Math.round(a * 10000) / 10000 };
        } else n[campo] = { cst: def.id };
    }
    if (tiene('pis_cofins_sem_icms')) n.pisCofinsSemIcms = body.pis_cofins_sem_icms === true || body.pis_cofins_sem_icms === 'true';
    if (tiene('p_cred_sn')) {
        if (vacio(body.p_cred_sn)) delete n.pCredSN;
        else {
            const v = Number(String(body.p_cred_sn).replace(',', '.'));
            if (!(v > 0 && v < 100)) return { ok: false, error: 'El porcentaje de crédito del Simples Nacional debe estar entre 0 y 100.' };
            n.pCredSN = Math.round(v * 10000) / 10000;
        }
    }
    if (n.crt !== 1) delete n.pCredSN;
    // [XSD TNFe/emit]: el CNAE solo existe junto a la inscripción municipal.
    if (n.cnae && !n.im) return { ok: false, error: 'El CNAE va junto a la inscripción municipal: indica también la inscripción municipal.' };
    if (!n.natOp) n.natOp = NATOP_PADRAO;
    if (!n.indPres) n.indPres = '9';
    if (!n.modFrete) n.modFrete = '9';
    return { ok: true, ajustes: n };
}
