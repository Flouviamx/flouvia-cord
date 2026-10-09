// A quién pertenece un certificado ICP-Brasil (e-CNPJ o e-CPF).
//
// El Sistema Nacional NFS-e identifica al titular por la extensión
// subjectAltName/otherName que la ICP-Brasil define para cada tipo de
// certificado, y rechaza el que no la trae [ANEXO_I, RN_RECEPCAO_DPS E1209;
// RN DPS_NFS-e E0716]:
//   - 2.16.76.1.3.3: CNPJ de la persona jurídica titular (14 posiciones).
//   - 2.16.76.1.3.1: datos de la persona física: fecha de nacimiento (8) +
//     CPF (11) + … — el CPF son las posiciones 9 a 19.
//
// El framework (latam/certificado.ts) ya leyó y validó el par; aquí solo se
// decide el titular para compararlo con el CNPJ/CPF del negocio.
//
// Puro (node-forge): lo cargan los scripts con Node plano.

import forge from 'node-forge';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { RailDatosError } from '../errores.ts';

export const OID_ICP_CNPJ = '2.16.76.1.3.3';
export const OID_ICP_PF = '2.16.76.1.3.1';

export interface TitularCertificado {
    tipo: 'cnpj' | 'cpf';
    /** CNPJ (14) o CPF (11), sin puntuación. */
    numero: string;
}

const OID_SAN = '2.5.29.17';

/** Bytes de un valor ASN.1 primitivo o del primer primitivo anidado. */
function bytesDe(node: forge.asn1.Asn1): string {
    if (typeof node.value === 'string') return node.value;
    for (const hijo of node.value) {
        const v = bytesDe(hijo);
        if (v) return v;
    }
    return '';
}

/** Pares (OID, valor) de los otherName del subjectAltName. */
export function otherNames(certPem: string): { oid: string; valor: string }[] {
    const cert = forge.pki.certificateFromPem(certPem);
    const ext = cert.extensions.find((e: { id?: string }) => e.id === OID_SAN) as { value?: string } | undefined;
    if (!ext?.value) return [];
    let san: forge.asn1.Asn1;
    try {
        san = forge.asn1.fromDer(forge.util.createBuffer(ext.value));
    } catch {
        return [];
    }
    const out: { oid: string; valor: string }[] = [];
    for (const gn of Array.isArray(san.value) ? san.value : []) {
        // GeneralName otherName: [0] IMPLICIT SEQUENCE { type-id OID, value [0] EXPLICIT ANY }.
        if (gn.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || gn.type !== 0 || !Array.isArray(gn.value)) continue;
        const [oidNode, valorNode] = gn.value;
        if (!oidNode || oidNode.type !== forge.asn1.Type.OID || typeof oidNode.value !== 'string') continue;
        const oid = forge.asn1.derToOid(oidNode.value);
        const valor = valorNode ? forge.util.decodeUtf8(bytesDe(valorNode)) : '';
        out.push({ oid, valor });
    }
    return out;
}

/**
 * Titular del certificado según la ICP-Brasil. Lanza RailDatosError (apto
 * para el usuario) si no es un certificado ICP-Brasil de CNPJ o CPF.
 */
export function titularDoCertificado(certPem: string): TitularCertificado {
    const nomes = otherNames(certPem);
    const cnpj = nomes.find((n) => n.oid === OID_ICP_CNPJ)?.valor.replace(/[^0-9A-Z]/gi, '').toUpperCase();
    if (cnpj && /^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return { tipo: 'cnpj', numero: cnpj };
    const pf = nomes.find((n) => n.oid === OID_ICP_PF)?.valor.replace(/\s/g, '');
    const cpf = pf && pf.length >= 19 ? pf.slice(8, 19) : '';
    if (/^\d{11}$/.test(cpf) && !/^0{11}$/.test(cpf)) return { tipo: 'cpf', numero: cpf };
    throw new RailDatosError('Este certificado no identifica un CNPJ ni un CPF de la ICP-Brasil. Usa el certificado digital e-CNPJ (o e-CPF) de tu negocio, tipo A1.');
}

/**
 * ¿El certificado puede firmar por este negocio? Un e-CNPJ de la matriz firma
 * por sus filiales (mismo CNPJ raíz, 8 primeras posiciones); un e-CPF, solo
 * por ese CPF.
 */
export function certificadoCobreDocumento(titular: TitularCertificado, documento: string): boolean {
    const doc = String(documento ?? '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
    if (titular.tipo === 'cpf') return doc === titular.numero;
    return doc.length === 14 && doc.slice(0, 8) === titular.numero.slice(0, 8);
}
