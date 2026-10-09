// Ajustes del riel NFS-e por organización (`fiscal_rail_ajustes.ajustes`) y lo
// que falta para emitir. Cada campo es un dato que el negocio ya tiene en su
// inscripción municipal o en su opción por el Simples Nacional: Cord no
// deduce ninguno, porque un dato fiscal inventado se rechaza en la Sefin en el
// mejor caso, y en el peor se declara mal.
//
// Puro: lo cargan la UI, el endpoint, el proveedor y los scripts.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import {
    ALIQUOTA_ISS_MAX, OP_SIMPLES, REG_AP_SIMPLES, REG_ESPECIAL, SERIE_MAX, SERIE_MIN, NUMERO_DPS_MAX,
    type OpSimples, type RegApSimples, type RegEspecial,
} from './constantes.ts';
import { municipio } from './municipios.ts';
import { servicoNacional } from './servicos.ts';

export interface AjustesNfse {
    /** Código IBGE (7) del municipio del establecimiento: cLocEmi y lugar de prestación. */
    municipio?: string;
    /** Inscripción municipal, si el municipio la registró en el cadastro nacional (E0116/E0120). */
    inscricaoMunicipal?: string;
    /** Serie de la DPS, exclusiva de Cord (1 a 49999). */
    serie?: string;
    /** Primer número de DPS de la serie (si ya se usó en otro sistema). */
    numeroInicial?: number;
    opSimpNac?: OpSimples;
    regApTribSN?: RegApSimples;
    regEspTrib?: RegEspecial;
    /** Código de tributación nacional (cTribNac), lista nacional de servicios. */
    servico?: string;
    /** Código de tributación municipal (cTribMun), 3 dígitos, si el municipio lo usa. */
    servicoMunicipal?: string;
    /** % aproximado de tributos del Simples Nacional (pTotTribSN). Obligatorio para ME/EPP (E0712). */
    aliquotaSimples?: number;
    /** Perfil de retención (Ajustes › Impuestos) que representa el ISS retenido por el tomador. */
    retencaoIssId?: string;
}

/** Lo que falta para emitir, como código: la pantalla lo traduce (es/en). */
export type FaltanteNfse =
    | 'documento' | 'municipio' | 'serie' | 'regime' | 'regime_sn' | 'aliquota_simples' | 'servico'
    | 'certificado' | 'certificado_vencido' | 'certificado_documento';

export const FALTANTE_ES: Record<FaltanteNfse, string> = {
    documento: 'CNPJ (o CPF) del negocio',
    municipio: 'municipio del establecimiento (código IBGE)',
    serie: 'serie de la DPS',
    regime: 'situación ante el Simples Nacional',
    regime_sn: 'régimen de apuración del Simples Nacional',
    aliquota_simples: 'porcentaje de tributos del Simples Nacional',
    servico: 'código del servicio (lista nacional)',
    certificado: 'certificado digital ICP-Brasil',
    certificado_vencido: 'certificado digital vigente',
    certificado_documento: 'certificado a nombre del CNPJ del negocio',
};

export const FALTANTE_EN: Record<FaltanteNfse, string> = {
    documento: 'your business CNPJ (or CPF)',
    municipio: 'the municipality of your establishment (IBGE code)',
    serie: 'the DPS series',
    regime: 'your Simples Nacional status',
    regime_sn: 'your Simples Nacional assessment regime',
    aliquota_simples: 'your Simples Nacional tax percentage',
    servico: 'the service code (national list)',
    certificado: 'the ICP-Brasil digital certificate',
    certificado_vencido: 'a valid digital certificate',
    certificado_documento: 'a certificate issued to your business CNPJ',
};

const enteroEn = (v: unknown, ids: readonly number[]) => (ids.includes(Number(v)) ? Number(v) : undefined);

export function serieValida(v: unknown): string | null {
    const s = String(v ?? '').trim();
    if (!/^\d{1,5}$/.test(s)) return null;
    const n = Number(s);
    return n >= SERIE_MIN && n <= SERIE_MAX ? String(n) : null;
}

/** Servicio de la lista nacional que Cord puede declarar: incidencia en el establecimiento y sin grupo obra/evento. */
export function servicoSuportado(codigo: unknown): boolean {
    const s = servicoNacional(codigo);
    return !!s && s.incidencia === 'EP' && !s.grupo;
}

export function faltantesAjustes(a: Partial<AjustesNfse>): FaltanteNfse[] {
    const faltan: FaltanteNfse[] = [];
    if (!municipio(a.municipio)) faltan.push('municipio');
    if (!serieValida(a.serie)) faltan.push('serie');
    const op = enteroEn(a.opSimpNac, OP_SIMPLES.map((o) => o.id));
    if (!op) faltan.push('regime');
    if (op === 3) {
        if (!enteroEn(a.regApTribSN, REG_AP_SIMPLES.map((o) => o.id))) faltan.push('regime_sn');
        const p = Number(a.aliquotaSimples);
        if (!(p > 0 && p < 100)) faltan.push('aliquota_simples');
    }
    if (!servicoSuportado(a.servico)) faltan.push('servico');
    return faltan;
}

/**
 * Valida y normaliza un cambio de ajustes que llega del navegador. Devuelve
 * los ajustes nuevos o un mensaje apto para el usuario.
 */
export function aplicarCambio(actuales: Partial<AjustesNfse>, body: Record<string, unknown>): { ok: true; ajustes: AjustesNfse } | { ok: false; error: string } {
    const n: AjustesNfse = { ...actuales };
    const tiene = (k: string) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;
    const vacio = (v: unknown) => v === null || String(v).trim() === '';

    if (tiene('municipio')) {
        if (vacio(body.municipio)) delete n.municipio;
        else {
            const m = municipio(body.municipio);
            if (!m) return { ok: false, error: 'El código IBGE del municipio no existe. Son 7 dígitos; por ejemplo, 3550308 es São Paulo.' };
            n.municipio = m.codigo;
        }
    }
    if (tiene('inscricao_municipal')) {
        const im = String(body.inscricao_municipal ?? '').trim();
        if (!im) delete n.inscricaoMunicipal;
        else if (im.length > 15 || !/^[0-9A-Za-z./-]+$/.test(im)) return { ok: false, error: 'La inscripción municipal admite hasta 15 caracteres, sin espacios.' };
        else n.inscricaoMunicipal = im.replace(/[./-]/g, '');
    }
    if (tiene('serie')) {
        if (vacio(body.serie)) delete n.serie;
        else {
            const s = serieValida(body.serie);
            if (!s) return { ok: false, error: `La serie de la DPS debe ser un número entre ${SERIE_MIN} y ${SERIE_MAX} (el rango de los sistemas propios del contribuyente).` };
            n.serie = s;
        }
    }
    if (tiene('numero_inicial')) {
        if (vacio(body.numero_inicial)) delete n.numeroInicial;
        else {
            const v = Number(body.numero_inicial);
            if (!Number.isInteger(v) || v < 1 || v > NUMERO_DPS_MAX) return { ok: false, error: 'El número inicial de la DPS debe ser un entero positivo.' };
            n.numeroInicial = v;
        }
    }
    if (tiene('op_simples')) {
        const v = enteroEn(body.op_simples, OP_SIMPLES.map((o) => o.id));
        if (!v) return { ok: false, error: 'Situación ante el Simples Nacional inválida.' };
        n.opSimpNac = v as OpSimples;
    }
    if (tiene('reg_ap_simples')) {
        if (vacio(body.reg_ap_simples)) delete n.regApTribSN;
        else {
            const v = enteroEn(body.reg_ap_simples, REG_AP_SIMPLES.map((o) => o.id));
            if (!v) return { ok: false, error: 'Régimen de apuración del Simples Nacional inválido.' };
            n.regApTribSN = v as RegApSimples;
        }
    }
    if (tiene('reg_especial')) {
        const v = Number(body.reg_especial);
        if (!REG_ESPECIAL.some((r) => r.id === v)) return { ok: false, error: 'Régimen especial de tributación inválido.' };
        n.regEspTrib = v as RegEspecial;
    }
    if (tiene('servico')) {
        if (vacio(body.servico)) delete n.servico;
        else {
            const codigo = String(body.servico).replace(/\D/g, '');
            if (!servicoNacional(codigo)) return { ok: false, error: 'El código del servicio no está en la lista nacional.' };
            if (!servicoSuportado(codigo)) return { ok: false, error: 'Ese servicio tributa donde se presta (o exige datos de obra o evento) y Cord todavía no lo declara. Elige otro código o emite esa nota en el emisor nacional.' };
            n.servico = codigo;
        }
    }
    if (tiene('servico_municipal')) {
        const v = String(body.servico_municipal ?? '').trim();
        if (!v) delete n.servicoMunicipal;
        else if (!/^\d{3}$/.test(v) || v === '000') return { ok: false, error: 'El código de tributación municipal tiene 3 dígitos (distinto de 000).' };
        else n.servicoMunicipal = v;
    }
    if (tiene('aliquota_simples')) {
        if (vacio(body.aliquota_simples)) delete n.aliquotaSimples;
        else {
            const v = Number(String(body.aliquota_simples).replace(',', '.'));
            if (!(v > 0 && v < 100)) return { ok: false, error: 'El porcentaje de tributos del Simples Nacional debe estar entre 0 y 100.' };
            n.aliquotaSimples = Math.round(v * 100) / 100;
        }
    }
    if (tiene('retencao_iss_id')) {
        const v = String(body.retencao_iss_id ?? '').trim();
        if (!v) delete n.retencaoIssId;
        else if (!/^[0-9a-f-]{36}$/i.test(v)) return { ok: false, error: 'Perfil de retención inválido.' };
        else n.retencaoIssId = v;
    }
    // Coherencia entre campos [ANEXO_I E0162, E0174, E0175].
    if (n.opSimpNac !== 3) delete n.regApTribSN;
    if (n.opSimpNac !== 3) delete n.aliquotaSimples;
    if (n.regEspTrib === undefined) n.regEspTrib = 0;
    if (n.opSimpNac === 2 && n.regEspTrib !== 0) return { ok: false, error: 'Un MEI no declara régimen especial de tributación.' };
    if (n.opSimpNac === 3 && n.regApTribSN === 1 && n.regEspTrib !== 0) {
        return { ok: false, error: 'Con todos los tributos apurados por el Simples Nacional no se declara régimen especial de tributación.' };
    }
    if (n.retencaoIssId && (n.opSimpNac === 2 || (n.regEspTrib ?? 0) !== 0)) {
        return { ok: false, error: 'El ISS no se retiene a un MEI ni a quien tiene régimen especial de tributación: quita la retención del ISS.' };
    }
    return { ok: true, ajustes: n };
}

/** Alícuota de ISS válida para la DPS (pAliq): mayor que 0 y hasta 5 % [ANEXO_I E0595]. */
export function aliquotaIssValida(pct: number): boolean {
    return pct > 0 && pct <= ALIQUOTA_ISS_MAX + 1e-9;
}
