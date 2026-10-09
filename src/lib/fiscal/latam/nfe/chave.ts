// Chave de acceso de la NF-e (44 posiciones) y su dígito verificador.
//
// Composición [MOC 2.2.6, tabla 2-3]: cUF (2) + AAMM de emisión (4) + CNPJ del
// emisor (14) + modelo (2) + serie (3) + número (9) + tpEmis (1) + código
// numérico cNF (8) + DV (1).
//
// DV [MOC 2.2.6.2; NTC 2025.001 §5]: módulo 11 con pesos 2 a 9 de derecha a
// izquierda sobre las 43 posiciones; cada carácter vale su código ASCII menos
// 48 (así un dígito vale lo de siempre y una letra del CNPJ alfanumérico entra
// en la misma cuenta). Resto 0 o 1 → DV 0; si no, 11 − resto.
//
// cNF [AI B03-10, rechazo 897]: ocho dígitos aleatorios que no pueden repetir
// el número de la nota ni ser una secuencia trivial; Cord lo genera con el
// generador criptográfico y descarta los casos prohibidos.
//
// Puro: lo cargan los scripts con Node plano.

import { randomInt } from 'node:crypto';
import { MODELO_NFE } from './constantes.ts';

/** Patrón de la chave en el XSD (TChNFe, PL_010): CNPJ alfanumérico en las posiciones 7 a 18. */
export const PATRON_CHAVE = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;

/** DV módulo 11 de las 43 primeras posiciones [NTC 2025.001 §5]. */
export function dvChave(base43: string): string {
    if (!/^[0-9A-Z]{43}$/.test(base43)) throw new Error('chave: base inválida');
    let soma = 0;
    let peso = 2;
    for (let i = base43.length - 1; i >= 0; i--) {
        soma += (base43.charCodeAt(i) - 48) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? '0' : String(11 - resto);
}

/** ¿Es una chave de NF-e bien formada y con su DV correcto? */
export function chaveValida(chave: unknown): chave is string {
    return typeof chave === 'string' && PATRON_CHAVE.test(chave) && chave.slice(20, 22) === MODELO_NFE
        && dvChave(chave.slice(0, 43)) === chave[43];
}

export interface PartesChave {
    cUF: string;
    /** AAMM de la emisión (hora de Brasilia). */
    aamm: string;
    cnpj: string;
    serie: number;
    numero: number;
    tpEmis: string;
    cNF: string;
}

export function montarChave(p: PartesChave): string {
    const base = p.cUF + p.aamm + p.cnpj.padStart(14, '0') + MODELO_NFE
        + String(p.serie).padStart(3, '0') + String(p.numero).padStart(9, '0') + p.tpEmis + p.cNF;
    if (base.length !== 43) throw new Error('chave: composición inválida');
    return base + dvChave(base);
}

export function partesDaChave(chave: string): PartesChave & { dv: string } {
    return {
        cUF: chave.slice(0, 2),
        aamm: chave.slice(2, 6),
        cnpj: chave.slice(6, 20),
        serie: Number(chave.slice(22, 25)),
        numero: Number(chave.slice(25, 34)),
        tpEmis: chave.slice(34, 35),
        cNF: chave.slice(35, 43),
        dv: chave.slice(43),
    };
}

/**
 * cNF inadmisibles [AI B03-10, NT 2019.001]: los ocho dígitos repetidos y las
 * diez secuencias ascendentes que lista la regla, además de cNF = nNF.
 */
export const CNF_PROHIBIDOS: readonly string[] = [
    '00000000', '11111111', '22222222', '33333333', '44444444', '55555555', '66666666', '77777777', '88888888', '99999999',
    '12345678', '23456789', '34567890', '45678901', '56789012', '67890123', '78901234', '89012345', '90123456', '01234567',
];

export function cnfProhibido(cNF: string, numero: number): boolean {
    if (!/^[0-9]{8}$/.test(cNF)) return true;
    if (Number(cNF) === numero) return true;
    return CNF_PROHIBIDOS.includes(cNF);
}

/** Código numérico aleatorio válido para la nota `numero`. */
export function gerarCnf(numero: number): string {
    for (;;) {
        const c = String(randomInt(0, 100_000_000)).padStart(8, '0');
        if (!cnfProhibido(c, numero)) return c;
    }
}

/** La chave impresa en el DANFE: once bloques de cuatro [AII 3.4.2]. */
export const chaveEmBlocos = (chave: string) => chave.replace(/(.{4})(?=.)/g, '$1 ');
