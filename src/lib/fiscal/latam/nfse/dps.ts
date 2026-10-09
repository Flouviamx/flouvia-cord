// Traducción de un documento de Cord a la DPS (Declaração de Prestação de
// Serviço) del Sistema Nacional NFS-e, leiaute 1.01.
//
// Las decisiones salen del ANEXO_I (leiaute y reglas de negocio de la
// DPS/NFS-e, v1.01-20260209); las referencias [Ennnn] son los códigos de
// rechazo que cada regla evita disparar:
//
//   - Un solo servicio por DPS (cServ): todos los conceptos del documento se
//     declaran con el código de tributación nacional configurado, y su
//     descripción los enumera. Solo servicios cuya incidencia es el
//     establecimiento del prestador y que no exigen datos de obra o evento
//     (MUN.INCID_INFO.SERV.): el lugar de prestación es el municipio del
//     negocio.
//   - El ISS va "por dentro" del precio: la NFS-e no tiene impuesto que se
//     sume al valor del servicio, así que un concepto con impuesto agregado no
//     se envía.
//   - Descuento de documento = desconto incondicionado: vServ es el valor
//     bruto (subtotal neto + descuento) y vDescIncond el descuento; la base del
//     ISSQN que calcula la Sefin es vServ - vDescIncond, igual al subtotal de
//     Cord [E0427, E0431].
//   - Retención: solo el ISS retenido por el tomador, cuando el documento lleva
//     el perfil de retención que el negocio marcó como ISS. Retenciones
//     federales (IRRF, CSLL, PIS/COFINS, INSS) no se declaran todavía: se
//     rechaza antes de enviar. Nunca a un MEI ni con régimen especial
//     [E0583, E0588].
//   - pAliq solo cuando la regla la exige y Cord tiene el dato real: optante
//     ME/EPP con todo por el Simples y ISS retenido [E0621]; en los demás casos
//     la alícuota la pone el municipio desde su parametrización [E0617, E0625,
//     E0635] y Cord no la informa.
//   - totTrib (Lei 12.741/2012): ME/EPP declara el % del Simples (pTotTribSN)
//     porque indTotTrib le está vedado [E0712]; los demás indican que no
//     informan valores estimados (indTotTrib = 0, Decreto 8.264/2014).
//   - El prestador emisor NO informa nombre ni dirección [E0121]; la
//     inscripción municipal va solo si el negocio la configuró [E0116/E0120].
//   - El grupo IBSCBS no se envía: facultativo en 2026 (NT 004 §1.1).
//   - Sin exportación ni moneda extranjera: el tomador es brasileño (CNPJ/CPF)
//     o no se identifica, y los valores van en reales.
//
// Lo que no se puede armar bien NO se manda: RailDatosError con un mensaje
// para el dueño del negocio. Puro: scripts/nfse-check.mjs lo prueba con Node
// plano.

import type { FiscalLineItem, FiscalRetencion, FiscalTotals } from '../../index';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { RailDatosError } from '../errores.ts';
import type { EntornoRail } from '../rieles.ts';
import { validateTaxId } from '../../../../../packages/elements/src/fiscal/tax-id.ts';
import {
    NS_NFSE, NUMERO_DPS_MAX, RET_ISSQN, TIPO_AMBIENTE, TRIB_ISSQN_TRIBUTAVEL, VERSAO_APLICATIVO, VERSAO_LEIAUTE,
    type OpSimples, type RegApSimples, type RegEspecial,
} from './constantes.ts';
import { aliquotaIssValida, serieValida, servicoSuportado } from './ajustes.ts';
import { municipio } from './municipios.ts';
import { servicoNacional } from './servicos.ts';
import { assinar, el, grupo, limpar } from './xml.ts';

export interface DocumentoFederal {
    tipo: 'CNPJ' | 'CPF';
    numero: string;
}

/** Lo que se declara en la DPS. Se persiste tal cual en `fiscal_rail_comprobantes.solicitud`. */
export interface SolicitudNfse {
    versao: string;
    /** Id de la DPS: "DPS" + cLocEmi + tpInsc + inscripción (14) + serie (5) + nDPS (15). Vacío hasta numerar. */
    id: string;
    tpAmb: 1 | 2;
    dhEmi: string;
    serie: string;
    /** Número de la DPS (texto, sin ceros a la izquierda). Vacío hasta numerar. */
    nDPS: string;
    dCompet: string;
    cLocEmi: string;
    prest: DocumentoFederal & { im?: string; opSimpNac: OpSimples; regApTribSN?: RegApSimples; regEspTrib: RegEspecial };
    toma?: DocumentoFederal & { nome: string; email?: string };
    serv: { cLocPrestacao: string; cTribNac: string; cTribMun?: string; xDescServ: string };
    valores: {
        vServ: string;
        vDescIncond?: string;
        tribISSQN: number;
        tpRetISSQN: number;
        pAliq?: string;
        totTrib: { indTotTrib: '0' } | { pTotTribSN: string };
    };
    /** Lo que Cord espera ver en la NFS-e generada (para reconocerla y para avisar diferencias). */
    esperado: { vLiq: string; issRetido?: string };
    /** XML firmado que viajó a la Sefin (lo agrega `comXmlAssinado`). */
    xml?: string;
}

export interface EntradaDps {
    entorno: EntornoRail;
    /** CNPJ o CPF del negocio (Ajustes › Datos fiscales). */
    documentoEmisor: string;
    inscricaoMunicipal?: string | null;
    municipio: string;
    serie: string;
    opSimpNac: OpSimples;
    regApTribSN?: RegApSimples | null;
    regEspTrib?: RegEspecial | null;
    servico: string;
    servicoMunicipal?: string | null;
    /** % del Simples (pTotTribSN), para ME/EPP. */
    aliquotaSimples?: number | null;
    /** Perfil de retención que representa el ISS retenido, con su nombre y tasa (fracción) vigentes. */
    retencaoIss?: { nome: string; tasa: number } | null;
    receptor: { taxId?: string | null; nome?: string | null; pais?: string | null; email?: string | null };
    lineas: FiscalLineItem[];
    totales: FiscalTotals;
    /** Fecha de la prestación (aaaa-mm-dd): competência de la NFS-e. Sin ella, el día de emisión. */
    competencia?: string | null;
    /** Instante de emisión de la DPS. */
    instante: Date;
}

// ── Importes ─────────────────────────────────────────────────────────────────

export const centavos = (v: unknown) => {
    const n = Number(v) || 0;
    return Math.round((n + Math.sign(n) * Number.EPSILON) * 100);
};
/** TSDec15V2: "0" | "0.dd" | "[1-9]…(.dd)". toFixed(2) siempre cumple. */
export const valor = (c: number) => (c / 100).toFixed(2);
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ── Fechas ───────────────────────────────────────────────────────────────────

/**
 * dhEmi en hora de Brasilia (-03:00, sin horario de verano desde 2019).
 * TSDateTimeUTC exige el desplazamiento explícito: "Z" no está en el patrón.
 */
export function dataHoraBrasilia(instante: Date): string {
    const local = new Date(instante.getTime() - 3 * 3600_000);
    return `${local.toISOString().slice(0, 19)}-03:00`;
}

const fechaValida = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return false;
    const d = new Date(`${iso}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};

// ── Partes ───────────────────────────────────────────────────────────────────

/** CNPJ o CPF válido (dígitos verificadores), sin puntuación; o null. */
export function documentoFederal(value: unknown): DocumentoFederal | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const v = validateTaxId('BR', raw);
    if (!v.ok) return null;
    if (v.kind === 'cnpj') return { tipo: 'CNPJ', numero: v.normalized };
    if (v.kind === 'cpf') return { tipo: 'CPF', numero: v.normalized };
    return null;
}

/** Id de la DPS [ANEXO_I infDPS/Id, E0004]. */
export function idDps(cLocEmi: string, prest: DocumentoFederal, serie: string, nDPS: string): string {
    const tpInsc = prest.tipo === 'CPF' ? '1' : '2';
    return `DPS${cLocEmi}${tpInsc}${prest.numero.padStart(14, '0')}${serie.padStart(5, '0')}${nDPS.padStart(15, '0')}`;
}

/** Correo apto para TSEmail (texto Latin-1 de 1 a 80, sin espacios en los bordes). */
function emailValido(v: unknown): string | undefined {
    const e = String(v ?? '').trim();
    return e.length <= 80 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && /^[ -ÿ]+$/.test(e) ? e : undefined;
}

/** Texto para un campo TSNomeRazaoSocial (1 a 300). */
function nomeValido(v: unknown): string {
    return limpar(v).replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** xDescServ (TSDesc2000): los conceptos del documento, con cantidad y precio unitario. */
export function descricaoServico(lineas: FiscalLineItem[]): string {
    const partes = lineas.map((l) => {
        const desc = limpar(l.description).replace(/\s+/g, ' ').trim() || 'Serviço';
        const qtd = Number(l.quantity) || 0;
        return lineas.length === 1 && qtd === 1 ? desc : `${desc} (${String(qtd).replace('.', ',')} x R$ ${brl(Number(l.unitPrice) || 0)})`;
    });
    const texto = partes.join('; ');
    return texto.length <= 2000 ? texto : `${texto.slice(0, 1997).trimEnd()}...`;
}

// ── Armado ───────────────────────────────────────────────────────────────────

/**
 * Arma la DPS sin número (id y nDPS vacíos): `conNumero()` los asigna dentro
 * del lease de la serie.
 */
export function armarDps(e: EntradaDps): SolicitudNfse {
    const prest = documentoFederal(e.documentoEmisor);
    if (!prest) throw new RailDatosError('El CNPJ (o CPF) de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.');
    const mun = municipio(e.municipio);
    if (!mun) throw new RailDatosError('El municipio configurado para la NFS-e no existe en la tabla del IBGE. Revísalo en Ajustes › Datos fiscales.');
    const serie = serieValida(e.serie);
    if (!serie) throw new RailDatosError('La serie de la DPS no es válida. Revísala en Ajustes › Datos fiscales.');
    const servico = servicoNacional(e.servico);
    if (!servico) throw new RailDatosError('El código del servicio no está en la lista nacional. Revísalo en Ajustes › Datos fiscales.');
    if (!servicoSuportado(servico.codigo)) {
        throw new RailDatosError('El código de servicio configurado tributa donde se presta (o exige datos de obra o evento), y Cord todavía no lo declara.');
    }
    const op = e.opSimpNac;
    const regEsp = (e.regEspTrib ?? 0) as RegEspecial;
    if (![1, 2, 3].includes(op)) throw new RailDatosError('Indica tu situación ante el Simples Nacional en Ajustes › Datos fiscales.');
    let regAp: RegApSimples | undefined;
    if (op === 3) {
        if (![1, 2, 3].includes(Number(e.regApTribSN))) throw new RailDatosError('Indica tu régimen de apuración del Simples Nacional en Ajustes › Datos fiscales.');
        regAp = Number(e.regApTribSN) as RegApSimples;
        if (!(Number(e.aliquotaSimples) > 0 && Number(e.aliquotaSimples) < 100)) {
            throw new RailDatosError('Indica el porcentaje aproximado de tributos del Simples Nacional en Ajustes › Datos fiscales.');
        }
    }
    if (op === 2 && regEsp !== 0) throw new RailDatosError('Un MEI no declara régimen especial de tributación.');
    if (op === 3 && regAp === 1 && regEsp !== 0) throw new RailDatosError('Con todos los tributos por el Simples Nacional no se declara régimen especial.');

    const currency = String(e.totales.currency || '').toUpperCase();
    if (currency !== 'BRL') throw new RailDatosError(`La NFS-e se emite en reales. Emite este documento en BRL (está en ${currency || 'otra moneda'}).`);
    if (!e.lineas.length) throw new RailDatosError('La NFS-e necesita al menos un concepto.');

    // ── Valores ──
    let neto = 0;
    let desconto = 0;
    for (const l of e.lineas) {
        if (centavos(l.taxAmount) !== 0 || (Number(l.taxRate) || 0) !== 0) {
            throw new RailDatosError('En la NFS-e el ISS va incluido en el precio del servicio: ningún concepto puede llevar impuesto agregado. Usa "Isento" (0 %) en los conceptos y vuelve a emitir.');
        }
        const base = centavos(l.subtotal);
        if (base < 0) throw new RailDatosError('Un concepto tiene un importe negativo.');
        let d = 0;
        if (l.discount !== undefined && l.discount !== null) {
            d = centavos(l.discount);
            if (!Number.isFinite(Number(l.discount)) || d < 0) throw new RailDatosError('El descuento de un concepto no es válido.');
        }
        neto += base;
        desconto += d;
    }
    const vServ = neto + desconto;
    if (!(vServ > 0)) throw new RailDatosError('El valor del servicio debe ser mayor a cero.');
    if (desconto >= vServ) throw new RailDatosError('El descuento no puede cubrir todo el valor del servicio.');
    if (centavos(e.totales.taxes) !== 0) {
        throw new RailDatosError('En la NFS-e el ISS va incluido en el precio del servicio: el documento no puede llevar impuestos agregados.');
    }
    if (centavos(e.totales.subtotal) !== neto) throw new RailDatosError('Los importes del documento no cuadran entre sí. Vuelve a guardarlo antes de emitir.');
    if (e.totales.discountTotal !== undefined && e.totales.discountTotal !== null && centavos(e.totales.discountTotal) !== desconto) {
        throw new RailDatosError('El descuento del documento no cuadra con el de sus conceptos. Vuelve a guardarlo antes de emitir.');
    }

    // ── Retención del ISS ──
    const retenciones = (e.totales.retenciones ?? []).filter((r) => centavos(r.monto) !== 0);
    let issRetido = 0;
    let retido = false;
    if (retenciones.length || centavos(e.totales.retencionTotal) !== 0) {
        const iss = e.retencaoIss;
        const esIss = (r: FiscalRetencion) => !!iss && r.nombre === iss.nome && Math.abs(Number(r.tasa) - iss.tasa) < 1e-9;
        if (retenciones.length !== 1 || !esIss(retenciones[0])) {
            throw new RailDatosError('Cord todavía no declara retenciones federales (IRRF, CSLL, PIS/COFINS, INSS) en la NFS-e: solo el ISS retenido por el tomador, con el perfil de retención marcado como ISS en Ajustes › Datos fiscales. Quita las demás retenciones del documento.');
        }
        const r = retenciones[0];
        if ((r.baseTipo ?? 'subtotal') !== 'subtotal') throw new RailDatosError('La retención del ISS se calcula sobre el valor del servicio. Revisa el perfil de retención.');
        if (op === 2) throw new RailDatosError('El ISS de un MEI no se retiene: quita la retención del documento.');
        if (regEsp !== 0) throw new RailDatosError('El ISS no se retiene con régimen especial de tributación: quita la retención del documento.');
        issRetido = centavos(r.monto);
        if (Math.abs(issRetido - Math.round(neto * Number(r.tasa))) > 1) {
            throw new RailDatosError('La retención del ISS no corresponde al valor del servicio. Vuelve a guardar el documento antes de emitir.');
        }
        if (centavos(e.totales.retencionTotal) !== issRetido) throw new RailDatosError('Las retenciones del documento no cuadran. Vuelve a guardarlo antes de emitir.');
        retido = true;
    }
    if (centavos(e.totales.total) !== neto - issRetido) throw new RailDatosError('El total del documento no cuadra con sus conceptos. Vuelve a guardarlo antes de emitir.');

    let pAliq: string | undefined;
    if (retido && op === 3 && regAp === 1) {
        // [E0621] ME/EPP con ISS por el Simples y retención: la alícuota la
        // informa el emisor. Es la tasa de la retención que el documento aplica.
        const pct = Math.round(Number(e.retencaoIss!.tasa) * 10000) / 100;
        if (!aliquotaIssValida(pct)) throw new RailDatosError('La alícuota del ISS retenido debe ser mayor a 0 % y de hasta 5 %. Revisa el perfil de retención.');
        pAliq = pct.toFixed(2);
    }

    // ── Tomador ──
    const pais = String(e.receptor.pais || 'BR').toUpperCase();
    if (pais !== 'BR') throw new RailDatosError('La NFS-e de exportación (cliente fuera de Brasil) todavía no la emite Cord.');
    let toma: SolicitudNfse['toma'];
    const taxId = String(e.receptor.taxId ?? '').trim();
    if (taxId) {
        const doc = documentoFederal(taxId);
        if (!doc) throw new RailDatosError(`El CNPJ/CPF del cliente (${taxId}) no es válido. Corrígelo en la ficha del cliente.`);
        if (doc.numero === prest.numero) throw new RailDatosError('El cliente no puede tener el mismo CNPJ/CPF que tu negocio.');
        const nome = nomeValido(e.receptor.nome);
        if (!nome) throw new RailDatosError('El cliente necesita un nombre o razón social.');
        toma = { ...doc, nome, ...(emailValido(e.receptor.email) ? { email: emailValido(e.receptor.email) } : {}) };
    } else if (retido) {
        throw new RailDatosError('Para retener el ISS el tomador debe estar identificado: agrega el CNPJ o CPF del cliente.');
    }

    // ── Fechas ──
    const dhEmi = dataHoraBrasilia(e.instante);
    const hoje = dhEmi.slice(0, 10);
    const competencia = e.competencia ? String(e.competencia).slice(0, 10) : hoje;
    if (!fechaValida(competencia)) throw new RailDatosError('La fecha de prestación del servicio no es válida.');
    // [E0015] la competência no puede ser posterior a la emisión.
    if (competencia > hoje) throw new RailDatosError('La fecha de prestación del servicio no puede ser posterior a la emisión de la NFS-e.');

    return {
        versao: VERSAO_LEIAUTE,
        id: '',
        tpAmb: TIPO_AMBIENTE[e.entorno],
        dhEmi,
        serie,
        nDPS: '',
        dCompet: competencia,
        cLocEmi: mun.codigo,
        prest: {
            ...prest,
            ...(e.inscricaoMunicipal ? { im: String(e.inscricaoMunicipal) } : {}),
            opSimpNac: op,
            ...(regAp ? { regApTribSN: regAp } : {}),
            regEspTrib: regEsp,
        },
        ...(toma ? { toma } : {}),
        serv: {
            cLocPrestacao: mun.codigo,
            cTribNac: servico.codigo,
            ...(e.servicoMunicipal ? { cTribMun: String(e.servicoMunicipal) } : {}),
            xDescServ: descricaoServico(e.lineas),
        },
        valores: {
            vServ: valor(vServ),
            ...(desconto > 0 ? { vDescIncond: valor(desconto) } : {}),
            tribISSQN: TRIB_ISSQN_TRIBUTAVEL,
            tpRetISSQN: retido ? RET_ISSQN.retidoTomador : RET_ISSQN.naoRetido,
            ...(pAliq ? { pAliq } : {}),
            totTrib: op === 3 ? { pTotTribSN: Number(e.aliquotaSimples).toFixed(2) } : { indTotTrib: '0' },
        },
        esperado: { vLiq: valor(neto - issRetido), ...(retido ? { issRetido: valor(issRetido) } : {}) },
    };
}

/** La misma solicitud con su número y su Id. */
export function conNumero(s: SolicitudNfse, numero: number): SolicitudNfse {
    if (!Number.isInteger(numero) || numero < 1 || numero > NUMERO_DPS_MAX) throw new RailDatosError('Número de DPS fuera de rango.');
    const nDPS = String(numero);
    return { ...s, nDPS, id: idDps(s.cLocEmi, s.prest, s.serie, nDPS) };
}

// ── XML ──────────────────────────────────────────────────────────────────────

function documentoXml(d: DocumentoFederal): string {
    return el(d.tipo, d.numero);
}

/** La DPS sin firma, en el orden de las <xs:sequence> de TCDPS/TCInfDPS. */
export function xmlDps(s: SolicitudNfse): string {
    if (!s.id || !s.nDPS) throw new Error('nfse: la DPS no tiene número');
    const p = s.prest;
    const prest = grupo('prest',
        documentoXml(p),
        el('IM', p.im),
        grupo('regTrib', el('opSimpNac', p.opSimpNac), el('regApTribSN', p.regApTribSN), el('regEspTrib', p.regEspTrib)),
    );
    const toma = s.toma ? grupo('toma', documentoXml(s.toma), el('xNome', s.toma.nome), el('email', s.toma.email)) : '';
    const serv = grupo('serv',
        grupo('locPrest', el('cLocPrestacao', s.serv.cLocPrestacao)),
        grupo('cServ', el('cTribNac', s.serv.cTribNac), el('cTribMun', s.serv.cTribMun), el('xDescServ', s.serv.xDescServ)),
    );
    const v = s.valores;
    const totTrib = 'pTotTribSN' in v.totTrib ? el('pTotTribSN', v.totTrib.pTotTribSN) : el('indTotTrib', v.totTrib.indTotTrib);
    const valores = grupo('valores',
        grupo('vServPrest', el('vServ', v.vServ)),
        v.vDescIncond ? grupo('vDescCondIncond', el('vDescIncond', v.vDescIncond)) : '',
        grupo('trib',
            grupo('tribMun', el('tribISSQN', v.tribISSQN), el('tpRetISSQN', v.tpRetISSQN), el('pAliq', v.pAliq)),
            grupo('totTrib', totTrib),
        ),
    );
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<DPS xmlns="${NS_NFSE}" versao="${s.versao}">`
        + `<infDPS Id="${s.id}">`
        + el('tpAmb', s.tpAmb)
        + el('dhEmi', s.dhEmi)
        + el('verAplic', VERSAO_APLICATIVO)
        + el('serie', s.serie)
        + el('nDPS', s.nDPS)
        + el('dCompet', s.dCompet)
        + el('tpEmit', 1)
        + el('cLocEmi', s.cLocEmi)
        + prest
        + toma
        + serv
        + valores
        + '</infDPS>'
        + '</DPS>';
}

/** DPS firmada con el certificado del emisor [E0714–E0718]. */
export function dpsAssinada(s: SolicitudNfse, certPem: string, keyPem: string): string {
    return assinar(xmlDps(s), { raiz: 'DPS', tag: 'infDPS', id: s.id, ns: NS_NFSE, certPem, keyPem });
}

/** La solicitud con el XML firmado que se va a enviar (lo que se persiste). */
export function comXmlAssinado(s: SolicitudNfse, certPem: string, keyPem: string): SolicitudNfse {
    return { ...s, xml: dpsAssinada(s, certPem, keyPem) };
}

/**
 * Número de documento en Cord: el número de la NFS-e que asignó la Sefin, con
 * la marca H- en homologación para que una nota de prueba no se confunda ni
 * choque con una real en el índice único de documentos_fiscales.
 */
export function numeroDocumento(nNFSe: string, homologacion: boolean): string {
    return `${homologacion ? 'H-' : ''}NFSE-${String(nNFSe).replace(/^0+(?=\d)/, '')}`;
}
