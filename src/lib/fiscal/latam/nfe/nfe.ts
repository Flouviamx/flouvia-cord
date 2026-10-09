// Traducción de un documento de Cord a la NF-e modelo 55, leiaute 4.00 con la
// Reforma Tributaria (PL_010f). Las referencias [AI Xnn-nn] son reglas del
// MOC 7.0 Anexo I y [NT…] de las notas técnicas vigentes (constantes.ts lista
// las fuentes); cada una evita disparar un rechazo concreto de la SEFAZ.
//
// Alcance (lo demás falla cerrado, ANTES de numerar):
//   - Venta de mercancía (finNFe 1, tpNF 1) en reales a un destinatario
//     brasileño identificado por CNPJ o CPF, con su dirección y su indicador
//     de IE (clientes.nfe). Sin exportación (idDest 3).
//   - Simples Nacional / MEI (CRT 1 y 4): CSOSN 101, 102, 103, 300 y 400,
//     dentro del estado y entre estados.
//   - Régimen Normal (CRT 3): ICMS propio CST 00 solo dentro del estado (la
//     alícuota interestatal es otra tabla que Cord no tiene), IPI, PIS/COFINS
//     e IBS/CBS (obligatorio desde 03/08/2026 [NT2025.002 UB12-10]).
//   - Sin sustitución tributaria, sin DIFAL a no contribuyente (grupo
//     ICMSUFDest [AI NA01-20]), sin combustibles, sin retenciones.
//
// Aritmética (al centavo con la de Cord):
//   - vProd = importe BRUTO del concepto (base neta + descuento repartido) y
//     vDesc = el descuento de documento repartido a la línea [AI I17].
//   - ICMS, PIS, COFINS, IBS y CBS van "por dentro": no cambian el total.
//   - El único impuesto que se suma es el IPI, y por eso el impuesto de la
//     línea en Cord debe ser exactamente la alícuota de IPI que declara el
//     producto: vNF = vProd − vDesc + vIPI = total de Cord [AI W16-10].
//   - IBS y CBS no se suman al vNF en 2026 [NT2025.002 VB01-10 exc. 1].
//
// El XML se escribe directamente en la forma canónica de C14N 1.0 (como la
// NFS-e, ../nfse/xml.ts): el resumen que se firma es exactamente lo que viaja.
// Puro: scripts/nfe-check.mjs lo valida contra los XSD oficiales.

import { createHash } from 'node:crypto';
import type { FiscalLineItem, FiscalTotals } from '../../index';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { RailDatosError, RailNoDisponibleError } from '../errores.ts';
import type { EntornoRail } from '../rieles.ts';
import { centavos, dataHoraBrasilia, documentoFederal } from '../nfse/dps.ts';
import { municipio } from '../nfse/municipios.ts';
import { assinar, el, escAtributo, grupo, limpar } from '../nfse/xml.ts';
import type { AjustesNfe } from './ajustes.ts';
import { NATOP_PADRAO, serieNfeValida } from './ajustes.ts';
import { gerarCnf, montarChave } from './chave.ts';
import {
    AUTORIZADOR_UF, CCLASSTRIB_SOPORTADAS, CFOP_INTERESTADUAL, CRT, CSOSN, CST_PIS_COFINS, DEST_HOMOLOGACAO,
    IBSCBS_2026, IBSCBS_OBRIGATORIO_SIMPLES, IND_PRES, IPI_CENQ_OUTROS, IPI_CST_TRIBUTADA, MOD_FRETE, MODELO_NFE,
    NCM_COMBUSTIVEL, NS_NFE, NUMERO_MAX, TIPO_AMBIENTE, TP_EMIS, TPAG_POSTERIOR, UF_EXIGE_CSRT, UF_EXIGE_RESP_TEC,
    UF_SEM_ISENTO_IE, VERSAO_APLICATIVO, VERSAO_NFE, codigoUf, esUf,
    type Autorizador, type Crt, type TpEmis, type Uf,
} from './constantes.ts';
import type { ClienteNfe, PisCofinsNfe, ProdutoNfe } from './produto.ts';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface EnderecoNfe {
    xLgr: string;
    nro: string;
    xCpl?: string;
    xBairro: string;
    cMun: string;
    xMun: string;
    UF: Uf;
    CEP?: string;
    fone?: string;
}

export type IcmsItem =
    | { grupo: 'ICMS00'; orig: string; CST: '00'; modBC: '3'; vBC: string; pICMS: string; vICMS: string; pFCP?: string; vFCP?: string }
    | { grupo: 'ICMSSN101'; orig: string; CSOSN: '101'; pCredSN: string; vCredICMSSN: string }
    | { grupo: 'ICMSSN102'; orig: string; CSOSN: string };

export interface PisCofinsItem {
    grupo: 'Aliq' | 'NT' | 'Outr';
    CST: string;
    vBC?: string;
    p?: string;
    v?: string;
}

export interface ItemNfe {
    nItem: number;
    prod: {
        cProd: string; cEAN: string; xProd: string; NCM: string; CEST?: string; CFOP: string;
        uCom: string; qCom: string; vUnCom: string; vProd: string; vDesc?: string;
    };
    icms: IcmsItem;
    ipi?: { cEnq: string; CST: string; vBC: string; pIPI: string; vIPI: string };
    pis: PisCofinsItem;
    cofins: PisCofinsItem;
    ibscbs?: {
        CST: string; cClassTrib: string; vBC: string;
        pIBSUF: string; vIBSUF: string; pIBSMun: string; vIBSMun: string; vIBS: string; pCBS: string; vCBS: string;
    };
    vItem: string;
}

export interface TotaisNfe {
    vBC: string; vICMS: string; vFCP: string; vProd: string; vDesc: string; vIPI: string; vPIS: string; vCOFINS: string; vNF: string;
    ibscbs?: { vBCIBSCBS: string; vIBSUF: string; vIBSMun: string; vIBS: string; vCBS: string };
}

export interface RespTecNfe {
    CNPJ: string;
    xContato: string;
    email: string;
    fone: string;
    idCSRT?: string;
    hashCSRT?: string;
}

/** Lo que se envía a la SEFAZ (se persiste en `fiscal_rail_comprobantes.solicitud`). */
export interface SolicitudNfe {
    versao: string;
    tpAmb: 1 | 2;
    uf: Uf;
    cUF: string;
    autorizador: Autorizador;
    serie: number;
    /** Asignados por `conNumero` dentro del lease de la serie. */
    nNF: number | null;
    cNF: string | null;
    chave: string | null;
    tpEmis: TpEmis;
    dhEmi: string;
    dhCont?: string;
    xJust?: string;
    natOp: string;
    idDest: '1' | '2';
    cMunFG: string;
    indFinal: '0' | '1';
    indPres: string;
    indIntermed?: '0';
    emit: { CNPJ: string; xNome: string; xFant?: string; ender: EnderecoNfe; IE: string; IM?: string; CNAE?: string; CRT: Crt };
    dest: { tipo: 'CNPJ' | 'CPF'; numero: string; xNome: string; ender: EnderecoNfe; indIEDest: '1' | '2' | '9'; IE?: string; email?: string };
    itens: ItemNfe[];
    total: TotaisNfe;
    modFrete: string;
    pag: { tPag: string; vPag: string };
    infCpl?: string;
    respTec?: RespTecNfe;
    /** NFe firmada (lo que viaja dentro de enviNFe). */
    xml?: string;
    /** DigestValue de la firma: la SEFAZ lo devuelve en protNFe/digVal. */
    digVal?: string;
    /** Lo que Cord espera que la SEFAZ registre (control al centavo). */
    esperado: { vNF: string };
}

export interface ResponsavelTecnico {
    cnpj: string;
    contato: string;
    email: string;
    fone: string;
    /** CSRT por UF (solo los estados que lo emitieron): id de 2 dígitos y el código secreto. */
    csrt?: Partial<Record<Uf, { id: string; codigo: string }>>;
}

export interface EntradaNfe {
    entorno: EntornoRail;
    cnpjEmissor: string | null | undefined;
    razaoSocial: string;
    ajustes: AjustesNfe;
    receptor: {
        taxId?: string | null;
        nome?: string | null;
        email?: string | null;
        telefone?: string | null;
        pais?: string | null;
        logradouro?: string | null;
        complemento?: string | null;
        cep?: string | null;
        nfe?: ClienteNfe | null;
    };
    lineas: FiscalLineItem[];
    totales: FiscalTotals;
    respTec?: ResponsavelTecnico | null;
    instante: Date;
}

// ── Formato ──────────────────────────────────────────────────────────────────

/**
 * Texto para un TString de la NF-e [XSD tiposBasico: `[!-ÿ]{1}[ -ÿ]{0,}[!-ÿ]{1}`]:
 * solo Latin-1 imprimible, sin saltos de línea ni espacios en los bordes, y
 * acotado al largo del campo.
 */
export function textoNfe(value: unknown, max: number): string {
    const s = limpar(value)
        .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...')
        .replace(/•/g, '-').replace(/€/g, 'EUR')
        .normalize('NFC')
        .replace(/\s+/g, ' ')
        .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '')
        .trim();
    return s.length <= max ? s : s.slice(0, max).trimEnd();
}

/** Centavos → TDec_1302 ("0.00", "12.34"). */
export const v2 = (c: number) => (c / 100).toFixed(2);

/** Porcentaje → TDec_0302a04 (dos a cuatro decimales: "18.00", "1.65", "0.125"). */
export function pctNfe(p: number): string {
    return (Math.round(p * 10000) / 10000).toFixed(4).replace(/0{1,2}$/, '');
}

/** Número con hasta `casas` decimales, sin ceros sobrantes (TDec_1104v, TDec_1110v). */
function decimalVariable(escalado: bigint, casas: number): string {
    const base = 10n ** BigInt(casas);
    const entero = escalado / base;
    const frac = (escalado % base).toString().padStart(casas, '0').replace(/0+$/, '');
    return frac ? `${entero}.${frac}` : `${entero}`;
}

/**
 * Porcentaje (hasta cuatro decimales) de una base en centavos, redondeado al
 * centavo (mitad hacia arriba), en aritmética entera: 1234,5 no se convierte
 * en 1234,4999… por el binario.
 */
export function aplicar(baseC: number, p: number): number {
    const num = BigInt(Math.round(baseC)) * BigInt(Math.round(p * 10000));
    return Number(num >= 0n ? (num * 2n + 1_000_000n) / 2_000_000n : -((-num * 2n + 1_000_000n) / 2_000_000n));
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

function telefone(v: unknown): string | undefined {
    const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, '');
    return /^[0-9]{6,14}$/.test(d) ? d : undefined;
}

// ── Armado ───────────────────────────────────────────────────────────────────

const erro = (m: string) => new RailDatosError(m);

function pisCofinsDe(nome: 'PIS' | 'COFINS', p: PisCofinsNfe | null | undefined, baseC: number): { item: PisCofinsItem; valorC: number } {
    const def = p ? CST_PIS_COFINS.find((c) => c.id === p.cst) : undefined;
    if (!p || !def) throw erro(`Falta el CST del ${nome}: configúralo en Ajustes › Datos fiscales › NF-e o en el producto.`);
    if (def.grupo === 'NT') return { item: { grupo: 'NT', CST: def.id }, valorC: 0 };
    if (def.grupo === 'Outr') return { item: { grupo: 'Outr', CST: def.id, vBC: '0.00', p: '0.00', v: '0.00' }, valorC: 0 };
    const aliquota = Number(p.aliquota);
    if (!(aliquota > 0 && aliquota <= 100)) throw erro(`Falta la alícuota del ${nome} para el CST ${def.id}.`);
    const valorC = aplicar(baseC, aliquota);
    return { item: { grupo: 'Aliq', CST: def.id, vBC: v2(baseC), p: pctNfe(aliquota), v: v2(valorC) }, valorC };
}

/**
 * Arma la NF-e sin número (nNF, cNF y chave vacíos): `conNumero()` los asigna
 * dentro del lease de la serie. Lanza RailDatosError (mensaje para el dueño
 * del negocio) con todo lo que no se puede declarar bien.
 */
export function armarNfe(e: EntradaNfe): SolicitudNfe {
    const a = e.ajustes;
    // ── Emisor ──
    const emissor = documentoFederal(e.cnpjEmissor);
    if (!emissor) throw erro('El CNPJ de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.');
    if (emissor.tipo !== 'CNPJ') throw erro('Cord emite la NF-e de un CNPJ. Un emisor con CPF (productor rural) todavía no.');
    const serie = serieNfeValida(a.serie);
    if (serie === null) throw erro('Configura la serie de la NF-e en Ajustes › Datos fiscales.');
    const crt = a.crt;
    if (!CRT.some((c) => c.id === crt)) throw erro('Indica tu régimen tributario (Simples Nacional o Régimen Normal) en Ajustes › Datos fiscales.');
    const ie = soDigitos(a.ie);
    if (!/^[0-9]{2,14}$/.test(ie)) throw erro('Indica la Inscrição Estadual de tu establecimiento en Ajustes › Datos fiscales.');
    const munEmit = municipio(a.municipio);
    if (!munEmit || !esUf(munEmit.uf)) throw erro('El municipio de tu establecimiento no es válido. Revísalo en Ajustes › Datos fiscales.');
    const uf = munEmit.uf as Uf;
    const xLgrEmit = textoNfe(a.logradouro, 60);
    const nroEmit = textoNfe(a.numero, 60);
    const bairroEmit = textoNfe(a.bairro, 60);
    if (xLgrEmit.length < 2 || !nroEmit || bairroEmit.length < 2) throw erro('Completa la dirección de tu establecimiento (calle, número y barrio) en Ajustes › Datos fiscales.');
    const cepEmit = soDigitos(a.cep);
    if (!/^[0-9]{8}$/.test(cepEmit)) throw erro('Indica el CEP de tu establecimiento en Ajustes › Datos fiscales.');
    const xNomeEmit = textoNfe(e.razaoSocial, 60);
    if (xNomeEmit.length < 2) throw erro('Indica la razón social de tu negocio en Ajustes › Datos fiscales.');

    // ── Fechas ──
    const dhEmi = dataHoraBrasilia(e.instante);
    const dia = dhEmi.slice(0, 10);
    const ano = Number(dhEmi.slice(0, 4));
    const simples = crt === 1 || crt === 4;
    if (simples && dia >= IBSCBS_OBRIGATORIO_SIMPLES) {
        throw new RailNoDisponibleError('Desde el 04/01/2027 la NF-e del Simples Nacional lleva IBS y CBS, y Cord todavía no tiene las reglas publicadas para declararlos. Escríbenos a soporte@flouvia.com.');
    }
    if (!simples && ano !== 2026) {
        throw new RailNoDisponibleError('Cord declara el IBS y la CBS con las alícuotas de prueba de 2026; las de este año todavía no las tiene. Escríbenos a soporte@flouvia.com.');
    }

    // ── Responsable técnico [NT2018.005] ──
    let respTec: ResponsavelTecnico | null = null;
    if (e.respTec && documentoFederal(e.respTec.cnpj)?.tipo === 'CNPJ' && e.respTec.contato && CORREO.test(e.respTec.email) && telefone(e.respTec.fone)) {
        respTec = e.respTec;
    }
    if (!respTec && UF_EXIGE_RESP_TEC.includes(uf)) {
        throw new RailNoDisponibleError('La SEFAZ de tu estado exige registrar al desarrollador del sistema emisor, y Cord todavía no completó ese registro. Escríbenos a soporte@flouvia.com.');
    }
    if (UF_EXIGE_CSRT.includes(uf) && !respTec?.csrt?.[uf]) {
        throw new RailNoDisponibleError('La SEFAZ de tu estado exige el código de seguridad del desarrollador del sistema emisor, y Cord todavía no lo tiene. Escríbenos a soporte@flouvia.com.');
    }

    // ── Destinatario ──
    const r = e.receptor;
    const pais = String(r.pais || 'BR').toUpperCase();
    if (pais !== 'BR') throw erro('La NF-e de exportación (cliente fuera de Brasil) todavía no la emite Cord.');
    const dest = documentoFederal(r.taxId);
    if (!dest) throw erro('La NF-e necesita el CNPJ o CPF del cliente. Agrégalo en la ficha del cliente.');
    if (dest.numero === emissor.numero) throw erro('El cliente no puede tener el mismo CNPJ que tu negocio.');
    const cn = r.nfe;
    if (!cn) throw erro('Completa los datos de NF-e del cliente (número, barrio, municipio e Inscrição Estadual) en su ficha.');
    const munDest = municipio(cn.municipio);
    if (!munDest || !esUf(munDest.uf)) throw erro('El municipio del cliente no es válido. Revísalo en su ficha.');
    const ufDest = munDest.uf as Uf;
    const xLgrDest = textoNfe(r.logradouro, 60);
    if (xLgrDest.length < 2) throw erro('Indica la calle del domicilio del cliente en su ficha.');
    const nroDest = textoNfe(cn.numero, 60);
    const bairroDest = textoNfe(cn.bairro, 60);
    if (!nroDest || bairroDest.length < 2) throw erro('Indica el número y el barrio del domicilio del cliente en su ficha.');
    const cepDest = soDigitos(r.cep);
    const indIEDest = cn.indIEDest;
    const ieDest = indIEDest === '1' ? soDigitos(cn.ie) : '';
    if (indIEDest === '1' && !/^[0-9]{2,14}$/.test(ieDest)) throw erro('Indica la Inscrição Estadual del cliente en su ficha [rechazo 728].');
    const xNomeDest = e.entorno === 'homologacion' ? DEST_HOMOLOGACAO : textoNfe(r.nome, 60);
    if (xNomeDest.length < 2) throw erro('El cliente necesita un nombre o razón social.');
    const email = String(r.email ?? '').trim();

    const idDest: '1' | '2' = ufDest === uf ? '1' : '2';
    // [AI E16a-40] un no contribuyente es siempre consumidor final.
    const indFinal: '0' | '1' = indIEDest === '9' || cn.consumidorFinal ? '1' : '0';
    if (idDest === '2' && indFinal === '1' && indIEDest === '9') {
        throw erro('Una venta a otro estado a un consumidor final no contribuyente exige declarar el diferencial de alícuotas (DIFAL), y Cord todavía no lo declara.');
    }
    if (idDest === '2' && crt === 3) {
        throw erro('Cord todavía no emite NF-e entre estados en el Régimen Normal (alícuota interestatal del ICMS). Emite esta venta desde el emisor de tu estado.');
    }

    // ── Totales del documento ──
    const currency = String(e.totales.currency || '').toUpperCase();
    if (currency !== 'BRL') throw erro(`La NF-e se emite en reales. Emite este documento en BRL (está en ${currency || 'otra moneda'}).`);
    if ((e.totales.retenciones ?? []).some((x) => centavos(x.monto) !== 0) || centavos(e.totales.retencionTotal) !== 0) {
        throw erro('Cord todavía no declara retenciones en la NF-e. Quita las retenciones del documento.');
    }
    if (!e.lineas.length) throw erro('La NF-e necesita al menos un producto.');
    if (e.lineas.length > 990) throw erro('Una NF-e admite hasta 990 productos.');

    // ── Ítems ──
    const itens: ItemNfe[] = [];
    let tProd = 0, tDesc = 0, tBC = 0, tICMS = 0, tFCP = 0, tIPI = 0, tPIS = 0, tCOFINS = 0, tNeto = 0, tImp = 0;
    let tBCIBS = 0, tIBSUF = 0, tCBS = 0;
    let soIsentos = true;
    e.lineas.forEach((l, i) => {
        const n = i + 1;
        const p = l.nfe as ProdutoNfe | undefined;
        if (!p) throw erro(`El concepto ${n} no es un producto del catálogo con datos de NF-e (NCM, CFOP, origen y unidad).`);
        if (!/^[0-9]{8}$/.test(p.ncm) || NCM_COMBUSTIVEL.test(p.ncm)) throw erro(`El NCM del concepto ${n} no se puede emitir.`);
        const qtd = Number(l.quantity);
        const qEsc = Math.round(qtd * 1e4);
        if (!(qtd > 0) || Math.abs(qtd * 1e4 - qEsc) > 1e-6) throw erro(`La cantidad del concepto ${n} debe ser mayor a cero y tener como mucho cuatro decimales.`);
        const neto = centavos(l.subtotal);
        const desc = l.discount !== undefined && l.discount !== null ? centavos(l.discount) : 0;
        if (neto < 0 || desc < 0) throw erro(`El concepto ${n} tiene un importe negativo.`);
        const vProd = neto + desc;
        if (!(vProd > 0) || neto === 0) throw erro(`El concepto ${n} no tiene importe a cobrar.`);
        // vUnCom con hasta 10 decimales: qCom × vUnCom reproduce vProd [AI I11-10, tolerancia 0,01].
        const num = BigInt(vProd) * 100n * 10n ** 10n;
        const den = BigInt(qEsc);
        const vUn = (num * 2n + den) / (2n * den);
        const cfop = idDest === '2' ? CFOP_INTERESTADUAL[p.cfop] : p.cfop;
        if (!cfop) throw erro(`El CFOP del concepto ${n} no se puede emitir.`);
        const xProd = textoNfe(l.description, 120);
        if (!xProd) throw erro(`El concepto ${n} necesita una descripción.`);
        const cProd = textoNfe(p.codigo || `CFOP${p.cfop}-${p.ncm}`, 60);

        // IPI: la única tasa que suma al precio.
        const taxa = Number(l.taxRate) || 0;
        const impC = centavos(l.taxAmount);
        let ipi: ItemNfe['ipi'];
        let vIPI = 0;
        if (taxa > 0 || impC !== 0) {
            const pIpi = Number(p.aliquotaIpi);
            if (simples) throw erro(`En la NF-e del Simples Nacional el impuesto va incluido en el precio: el concepto ${n} no puede llevar impuesto agregado.`);
            if (!(pIpi > 0) || Math.abs(pIpi / 100 - taxa) > 1e-9) {
                throw erro(`En la NF-e el único impuesto que se suma al precio es el IPI: el impuesto del concepto ${n} debe ser la alícuota de IPI de su producto. ICMS, PIS y COFINS van incluidos en el precio.`);
            }
            if (Math.abs(impC - aplicar(neto, pIpi)) > 1) throw erro(`El IPI del concepto ${n} no cuadra con su base. Vuelve a guardar el documento antes de emitir.`);
            vIPI = impC;
            ipi = { cEnq: IPI_CENQ_OUTROS, CST: IPI_CST_TRIBUTADA, vBC: v2(neto), pIPI: pctNfe(pIpi), vIPI: v2(vIPI) };
        }

        // ICMS.
        let icms: IcmsItem;
        let vICMS = 0, vFCP = 0, vBCIcms = 0;
        if (simples) {
            const csosn = String(p.csosn ?? '');
            if (!CSOSN.some((c) => c.id === csosn)) throw erro(`Indica el CSOSN del producto del concepto ${n} (Simples Nacional).`);
            if (!['103', '300', '400'].includes(csosn)) soIsentos = false;
            if (csosn === '101') {
                if (crt !== 1) throw erro(`El CSOSN 101 (con crédito) no aplica al MEI: cambia el CSOSN del concepto ${n}.`);
                // [AI N12a-70] con no contribuyente solo 102, 103, 300, 400 y 500.
                if (indIEDest === '9') throw erro(`Con un cliente no contribuyente el CSOSN 101 no se admite: el concepto ${n} debe ir como 102.`);
                const pCred = Number(a.pCredSN);
                if (!(pCred > 0 && pCred < 100)) throw erro('Indica el porcentaje de crédito del Simples Nacional (CSOSN 101) en Ajustes › Datos fiscales.');
                icms = { grupo: 'ICMSSN101', orig: p.origem, CSOSN: '101', pCredSN: pctNfe(pCred), vCredICMSSN: v2(aplicar(neto, pCred)) };
            } else {
                icms = { grupo: 'ICMSSN102', orig: p.origem, CSOSN: csosn };
            }
        } else {
            soIsentos = false;
            const pIcms = Number(p.aliquotaIcms);
            if (!(pIcms > 0 && pIcms <= 100)) throw erro(`Indica la alícuota del ICMS del producto del concepto ${n} (Régimen Normal).`);
            // Base del ICMS: el valor de la operación; el IPI la integra cuando
            // la mercancía va a consumo final (LC 87/1996, art. 13 § 2º).
            vBCIcms = neto + (indFinal === '1' ? vIPI : 0);
            vICMS = aplicar(vBCIcms, pIcms);
            const pFcp = p.aliquotaFcp ? Number(p.aliquotaFcp) : 0;
            if (pFcp) vFCP = aplicar(vBCIcms, pFcp);
            icms = {
                grupo: 'ICMS00', orig: p.origem, CST: '00', modBC: '3', vBC: v2(vBCIcms), pICMS: pctNfe(pIcms), vICMS: v2(vICMS),
                ...(pFcp ? { pFCP: pctNfe(pFcp), vFCP: v2(vFCP) } : {}),
            };
        }

        // PIS / COFINS (el producto puede traer los suyos).
        const basePc = neto - (a.pisCofinsSemIcms ? vICMS : 0);
        const pis = pisCofinsDe('PIS', p.pis ?? a.pis, basePc);
        const cofins = pisCofinsDe('COFINS', p.cofins ?? a.cofins, basePc);

        // IBS / CBS (Régimen Normal, 2026) [NT2025.002 UB16-10, UB18-10, UB37-10, UB56-10].
        let ibscbs: ItemNfe['ibscbs'];
        if (!simples) {
            const cls = CCLASSTRIB_SOPORTADAS.find((c) => c.id === p.cClassTrib);
            if (!cls) throw erro(`Indica la clasificación tributaria del IBS/CBS (cClassTrib) del producto del concepto ${n}.`);
            const vBC = neto - pis.valorC - cofins.valorC - vICMS - vFCP;
            if (vBC < 0) throw erro(`La base del IBS/CBS del concepto ${n} resultó negativa: revisa las alícuotas del producto.`);
            const vIBSUF = aplicar(vBC, Number(IBSCBS_2026.pIBSUF));
            const vIBSMun = aplicar(vBC, Number(IBSCBS_2026.pIBSMun));
            const vCBS = aplicar(vBC, Number(IBSCBS_2026.pCBS));
            ibscbs = {
                CST: cls.cst, cClassTrib: cls.id, vBC: v2(vBC),
                pIBSUF: IBSCBS_2026.pIBSUF, vIBSUF: v2(vIBSUF), pIBSMun: IBSCBS_2026.pIBSMun, vIBSMun: v2(vIBSMun),
                vIBS: v2(vIBSUF + vIBSMun), pCBS: IBSCBS_2026.pCBS, vCBS: v2(vCBS),
            };
            tBCIBS += vBC; tIBSUF += vIBSUF; tCBS += vCBS;
        }

        itens.push({
            nItem: n,
            prod: {
                cProd, cEAN: p.gtin || 'SEM GTIN', xProd, NCM: p.ncm, ...(p.cest ? { CEST: p.cest } : {}), CFOP: cfop,
                uCom: textoNfe(p.unidade, 6) || 'UN', qCom: decimalVariable(BigInt(qEsc), 4), vUnCom: decimalVariable(vUn, 10),
                vProd: v2(vProd), ...(desc > 0 ? { vDesc: v2(desc) } : {}),
            },
            icms,
            ...(ipi ? { ipi } : {}),
            pis: pis.item,
            cofins: cofins.item,
            ...(ibscbs ? { ibscbs } : {}),
            // [NT2025.002 VB01-10] vProd − vDesc + vIPI (IBS/CBS no suman en 2026).
            vItem: v2(vProd - desc + vIPI),
        });
        tProd += vProd; tDesc += desc; tBC += vBCIcms; tICMS += vICMS; tFCP += vFCP; tIPI += vIPI;
        tPIS += pis.valorC; tCOFINS += cofins.valorC; tNeto += neto; tImp += impC;
    });

    // [AI E16a-30, NT2025.001] UF que no admiten contribuyente exento de IE.
    if (indIEDest === '2' && UF_SEM_ISENTO_IE.includes(ufDest) && !soIsentos) {
        throw erro(`La SEFAZ de ${ufDest} no admite clientes "contribuyente exento de IE" en esta operación. Revisa el indicador de IE del cliente.`);
    }

    // ── Cuadre al centavo con Cord ──
    if (centavos(e.totales.subtotal) !== tNeto) throw erro('Los importes del documento no cuadran entre sí. Vuelve a guardarlo antes de emitir.');
    if (e.totales.discountTotal !== undefined && e.totales.discountTotal !== null && centavos(e.totales.discountTotal) !== tDesc) {
        throw erro('El descuento del documento no cuadra con el de sus conceptos. Vuelve a guardarlo antes de emitir.');
    }
    if (centavos(e.totales.taxes) !== tImp) throw erro('Los impuestos del documento no cuadran con sus conceptos. Vuelve a guardarlo antes de emitir.');
    const vNF = tProd - tDesc + tIPI;
    if (centavos(e.totales.total) !== vNF) throw erro('El total de la NF-e no cuadra con el del documento. Vuelve a guardarlo antes de emitir.');

    const indPres = IND_PRES.some((x) => x.id === a.indPres) ? String(a.indPres) : '9';
    const modFrete = MOD_FRETE.some((x) => x.id === a.modFrete) ? String(a.modFrete) : '9';
    const infCpl = a.infCpl ? textoNfe(a.infCpl, 5000) : '';

    return {
        versao: VERSAO_NFE,
        tpAmb: TIPO_AMBIENTE[e.entorno],
        uf,
        cUF: codigoUf(uf),
        autorizador: AUTORIZADOR_UF[uf],
        serie,
        nNF: null,
        cNF: null,
        chave: null,
        tpEmis: TP_EMIS.normal,
        dhEmi,
        natOp: textoNfe(a.natOp || NATOP_PADRAO, 60),
        idDest,
        cMunFG: munEmit.codigo,
        indFinal,
        indPres,
        // [AI B25c] operación no presencial: sin intermediador (venta propia).
        ...(indPres !== '1' ? { indIntermed: '0' as const } : {}),
        emit: {
            CNPJ: emissor.numero,
            xNome: xNomeEmit,
            ...(a.nomeFantasia ? { xFant: textoNfe(a.nomeFantasia, 60) } : {}),
            ender: {
                xLgr: xLgrEmit, nro: nroEmit, ...(a.complemento ? { xCpl: textoNfe(a.complemento, 60) } : {}), xBairro: bairroEmit,
                cMun: munEmit.codigo, xMun: textoNfe(munEmit.nome, 60), UF: uf, CEP: cepEmit,
                ...(telefone(a.telefone) ? { fone: telefone(a.telefone) } : {}),
            },
            IE: ie,
            ...(a.im ? { IM: textoNfe(a.im, 15) } : {}),
            ...(a.im && a.cnae ? { CNAE: a.cnae } : {}),
            CRT: crt as Crt,
        },
        dest: {
            tipo: dest.tipo,
            numero: dest.numero,
            xNome: xNomeDest,
            ender: {
                xLgr: xLgrDest, nro: nroDest, ...(r.complemento && textoNfe(r.complemento, 60) ? { xCpl: textoNfe(r.complemento, 60) } : {}),
                xBairro: bairroDest, cMun: munDest.codigo, xMun: textoNfe(munDest.nome, 60), UF: ufDest,
                ...(/^[0-9]{8}$/.test(cepDest) ? { CEP: cepDest } : {}),
                ...(telefone(r.telefone) ? { fone: telefone(r.telefone) } : {}),
            },
            indIEDest,
            ...(indIEDest === '1' ? { IE: ieDest } : {}),
            ...(email.length >= 6 && email.length <= 60 && CORREO.test(email) && /^[ -ÿ]+$/.test(email) ? { email } : {}),
        },
        itens,
        total: {
            vBC: v2(tBC), vICMS: v2(tICMS), vFCP: v2(tFCP), vProd: v2(tProd), vDesc: v2(tDesc), vIPI: v2(tIPI),
            vPIS: v2(tPIS), vCOFINS: v2(tCOFINS), vNF: v2(vNF),
            ...(!simples ? { ibscbs: { vBCIBSCBS: v2(tBCIBS), vIBSUF: v2(tIBSUF), vIBSMun: '0.00', vIBS: v2(tIBSUF), vCBS: v2(tCBS) } } : {}),
        },
        modFrete,
        // [NT2025.001 YA03-30] "pagamento posterior": el cobro ocurre después
        // de la emisión, por el link de Cord; vPag va en cero.
        pag: { tPag: TPAG_POSTERIOR, vPag: '0.00' },
        ...(infCpl ? { infCpl } : {}),
        ...(respTec ? {
            respTec: {
                CNPJ: soDigitos(respTec.cnpj), xContato: textoNfe(respTec.contato, 60), email: respTec.email.trim(), fone: telefone(respTec.fone)!,
            },
        } : {}),
        esperado: { vNF: v2(vNF) },
    };
}

/** hashCSRT [NT2018.005 §2.3]: SHA-1 del CSRT concatenado con la chave, en base64. */
export function hashCsrt(csrt: string, chave: string): string {
    return createHash('sha1').update(`${csrt}${chave}`, 'utf8').digest('base64');
}

export interface OpcoesNumero {
    /** Forma de emisión: normal o una de las SVC [AIII]. */
    tpEmis?: TpEmis;
    /** Entrada en contingencia (dhCont) y su motivo, obligatorios con tpEmis 6/7 [AI B28-10]. */
    contingencia?: { dhCont: string; xJust: string } | null;
    /** CSRT del responsable técnico para la UF del emisor. */
    csrt?: { id: string; codigo: string } | null;
    /** cNF fijo (solo pruebas). */
    cNF?: string;
}

/** La misma solicitud con número, código numérico y chave. */
export function conNumero(s: SolicitudNfe, numero: number, o: OpcoesNumero = {}): SolicitudNfe {
    if (!Number.isInteger(numero) || numero < 1 || numero > NUMERO_MAX) throw new RailDatosError('Número de NF-e fuera de rango.');
    const tpEmis = o.tpEmis ?? TP_EMIS.normal;
    if (tpEmis !== TP_EMIS.normal && !o.contingencia) throw new Error('nfe: contingencia sin dhCont/xJust');
    const cNF = o.cNF ?? gerarCnf(numero);
    const aamm = s.dhEmi.slice(2, 4) + s.dhEmi.slice(5, 7);
    const chave = montarChave({ cUF: s.cUF, aamm, cnpj: s.emit.CNPJ, serie: s.serie, numero, tpEmis, cNF });
    const respTec = s.respTec
        ? { ...s.respTec, ...(o.csrt ? { idCSRT: o.csrt.id, hashCSRT: hashCsrt(o.csrt.codigo, chave) } : {}) }
        : undefined;
    return {
        ...s,
        nNF: numero,
        cNF,
        chave,
        tpEmis,
        ...(tpEmis !== TP_EMIS.normal && o.contingencia ? { dhCont: o.contingencia.dhCont, xJust: o.contingencia.xJust } : {}),
        ...(respTec ? { respTec } : {}),
    };
}

// ── XML ──────────────────────────────────────────────────────────────────────

function endereco(nome: 'enderEmit' | 'enderDest', d: EnderecoNfe): string {
    return grupo(nome,
        el('xLgr', d.xLgr), el('nro', d.nro), el('xCpl', d.xCpl), el('xBairro', d.xBairro),
        el('cMun', d.cMun), el('xMun', d.xMun), el('UF', d.UF), el('CEP', d.CEP),
        el('cPais', '1058'), el('xPais', 'Brasil'), el('fone', d.fone),
    );
}

function icmsXml(i: IcmsItem): string {
    if (i.grupo === 'ICMS00') {
        return grupo('ICMS', grupo('ICMS00',
            el('orig', i.orig), el('CST', i.CST), el('modBC', i.modBC), el('vBC', i.vBC), el('pICMS', i.pICMS), el('vICMS', i.vICMS),
            el('pFCP', i.pFCP), el('vFCP', i.vFCP)));
    }
    if (i.grupo === 'ICMSSN101') {
        return grupo('ICMS', grupo('ICMSSN101', el('orig', i.orig), el('CSOSN', i.CSOSN), el('pCredSN', i.pCredSN), el('vCredICMSSN', i.vCredICMSSN)));
    }
    return grupo('ICMS', grupo('ICMSSN102', el('orig', i.orig), el('CSOSN', i.CSOSN)));
}

function pisCofinsXml(nome: 'PIS' | 'COFINS', i: PisCofinsItem): string {
    const g = `${nome}${i.grupo}`;
    if (i.grupo === 'NT') return grupo(nome, grupo(g, el('CST', i.CST)));
    return grupo(nome, grupo(g, el('CST', i.CST), el('vBC', i.vBC), el(`p${nome}`, i.p), el(`v${nome}`, i.v)));
}

function itemXml(i: ItemNfe): string {
    const p = i.prod;
    const prod = grupo('prod',
        el('cProd', p.cProd), el('cEAN', p.cEAN), el('xProd', p.xProd), el('NCM', p.NCM), el('CEST', p.CEST), el('CFOP', p.CFOP),
        el('uCom', p.uCom), el('qCom', p.qCom), el('vUnCom', p.vUnCom), el('vProd', p.vProd),
        el('cEANTrib', p.cEAN), el('uTrib', p.uCom), el('qTrib', p.qCom), el('vUnTrib', p.vUnCom),
        el('vDesc', p.vDesc), el('indTot', '1'),
    );
    const ipi = i.ipi
        ? grupo('IPI', el('cEnq', i.ipi.cEnq), grupo('IPITrib', el('CST', i.ipi.CST), el('vBC', i.ipi.vBC), el('pIPI', i.ipi.pIPI), el('vIPI', i.ipi.vIPI)))
        : '';
    const b = i.ibscbs;
    const ibscbs = b ? grupo('IBSCBS',
        el('CST', b.CST), el('cClassTrib', b.cClassTrib),
        grupo('gIBSCBS',
            el('vBC', b.vBC),
            grupo('gIBSUF', el('pIBSUF', b.pIBSUF), el('vIBSUF', b.vIBSUF)),
            grupo('gIBSMun', el('pIBSMun', b.pIBSMun), el('vIBSMun', b.vIBSMun)),
            el('vIBS', b.vIBS),
            grupo('gCBS', el('pCBS', b.pCBS), el('vCBS', b.vCBS)),
        ),
    ) : '';
    const imposto = grupo('imposto', icmsXml(i.icms), ipi, pisCofinsXml('PIS', i.pis), pisCofinsXml('COFINS', i.cofins), ibscbs);
    return `<det nItem="${i.nItem}">${prod}${imposto}${el('vItem', i.vItem)}</det>`;
}

function totalXml(t: TotaisNfe): string {
    const icmsTot = grupo('ICMSTot',
        el('vBC', t.vBC), el('vICMS', t.vICMS), el('vICMSDeson', '0.00'), el('vFCP', t.vFCP),
        el('vBCST', '0.00'), el('vST', '0.00'), el('vFCPST', '0.00'), el('vFCPSTRet', '0.00'),
        el('vProd', t.vProd), el('vFrete', '0.00'), el('vSeg', '0.00'), el('vDesc', t.vDesc), el('vII', '0.00'),
        el('vIPI', t.vIPI), el('vIPIDevol', '0.00'), el('vPIS', t.vPIS), el('vCOFINS', t.vCOFINS), el('vOutro', '0.00'), el('vNF', t.vNF),
    );
    const b = t.ibscbs;
    const ibscbs = b ? grupo('IBSCBSTot',
        el('vBCIBSCBS', b.vBCIBSCBS),
        grupo('gIBS',
            grupo('gIBSUF', el('vDif', '0.00'), el('vDevTrib', '0.00'), el('vIBSUF', b.vIBSUF)),
            grupo('gIBSMun', el('vDif', '0.00'), el('vDevTrib', '0.00'), el('vIBSMun', b.vIBSMun)),
            el('vIBS', b.vIBS), el('vCredPres', '0.00'), el('vCredPresCondSus', '0.00'),
        ),
        grupo('gCBS', el('vDif', '0.00'), el('vDevTrib', '0.00'), el('vCBS', b.vCBS), el('vCredPres', '0.00'), el('vCredPresCondSus', '0.00')),
    ) : '';
    return grupo('total', icmsTot, ibscbs);
}

/** Id de infNFe [XSD: NFe + chave]. */
export const idNfe = (chave: string) => `NFe${chave}`;
/** Atributos de infNFe que siguen a Id, en orden canónico (I < v). */
const ATRIBUTOS_INFNFE = ` versao="${VERSAO_NFE}"`;

/** La NF-e sin firma, en el orden de las <xs:sequence> de TNFe. */
export function xmlNfe(s: SolicitudNfe): string {
    if (!s.chave || !s.nNF || !s.cNF) throw new Error('nfe: la NF-e no tiene número');
    const ide = grupo('ide',
        el('cUF', s.cUF), el('cNF', s.cNF), el('natOp', s.natOp), el('mod', MODELO_NFE), el('serie', s.serie), el('nNF', s.nNF),
        el('dhEmi', s.dhEmi), el('tpNF', '1'), el('idDest', s.idDest), el('cMunFG', s.cMunFG), el('tpImp', '1'),
        el('tpEmis', s.tpEmis), el('cDV', s.chave.slice(43)), el('tpAmb', s.tpAmb), el('finNFe', '1'), el('indFinal', s.indFinal),
        el('indPres', s.indPres), el('indIntermed', s.indIntermed), el('procEmi', '0'), el('verProc', VERSAO_APLICATIVO),
        el('dhCont', s.dhCont), el('xJust', s.xJust),
    );
    const e = s.emit;
    const emit = grupo('emit',
        el('CNPJ', e.CNPJ), el('xNome', e.xNome), el('xFant', e.xFant), endereco('enderEmit', e.ender),
        el('IE', e.IE), el('IM', e.IM), el('CNAE', e.CNAE), el('CRT', e.CRT),
    );
    const d = s.dest;
    const dest = grupo('dest',
        el(d.tipo, d.numero), el('xNome', d.xNome), endereco('enderDest', d.ender), el('indIEDest', d.indIEDest), el('IE', d.IE), el('email', d.email),
    );
    const rt = s.respTec;
    const respTec = rt ? grupo('infRespTec', el('CNPJ', rt.CNPJ), el('xContato', rt.xContato), el('email', rt.email), el('fone', rt.fone), el('idCSRT', rt.idCSRT), el('hashCSRT', rt.hashCSRT)) : '';
    return `<NFe xmlns="${NS_NFE}">`
        + `<infNFe Id="${escAtributo(idNfe(s.chave))}"${ATRIBUTOS_INFNFE}>`
        + ide + emit + dest
        + s.itens.map(itemXml).join('')
        + totalXml(s.total)
        + grupo('transp', el('modFrete', s.modFrete))
        + grupo('pag', grupo('detPag', el('tPag', s.pag.tPag), el('vPag', s.pag.vPag)))
        + (s.infCpl ? grupo('infAdic', el('infCpl', s.infCpl)) : '')
        + respTec
        + '</infNFe>'
        + '</NFe>';
}

/** La solicitud con la NFe firmada y su DigestValue (lo que se persiste antes de enviar). */
export function comXmlAssinado(s: SolicitudNfe, certPem: string, keyPem: string): SolicitudNfe {
    const xml = assinar(xmlNfe(s), { raiz: 'NFe', tag: 'infNFe', id: idNfe(s.chave!), ns: NS_NFE, atributos: ATRIBUTOS_INFNFE, certPem, keyPem });
    const digVal = /<DigestValue>([^<]+)<\/DigestValue>/.exec(xml)?.[1] ?? '';
    return { ...s, xml, digVal };
}

/**
 * Número de documento en Cord: serie y número de la NF-e, con la marca H- en
 * homologación (una nota de prueba no choca con una real en el índice único
 * de documentos_fiscales).
 */
export function numeroDocumento(serie: number, nNF: number, homologacion: boolean): string {
    return `${homologacion ? 'H-' : ''}NFE-${serie}-${nNF}`;
}
