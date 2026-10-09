// RUT del titular de un certificado digital chileno.
//
// Las entidades certificadoras acreditadas en Chile lo publican en la
// extensión subjectAltName como otherName con el OID 1.3.6.1.4.1.8321.1 y un
// IA5String "NNNNNNNN-D" (ver el certificado del ejemplo oficial F60T33:
// "07880442-4"). Ese RUT es el del firmante (RutEnvia de la carátula y
// rutSender del upload), no el de la empresa.
//
// Puro (node-forge): lo cargan los scripts de contrato con Node plano.

import forge from 'node-forge';
import { rutValido } from './texto.ts';

const OID_RUT = '1.3.6.1.4.1.8321.1';
const OID_SAN = '2.5.29.17';

/** RUT del titular según el certificado, normalizado; null si no lo declara. */
export function rutDelCertificado(certPem: string): string | null {
    let cert: forge.pki.Certificate;
    try {
        cert = forge.pki.certificateFromPem(certPem);
    } catch {
        return null;
    }
    const ext = (cert.extensions as Array<{ id?: string; value?: string }>).find((e) => e.id === OID_SAN);
    if (!ext?.value) return null;
    try {
        const san = forge.asn1.fromDer(ext.value);
        for (const nombre of (san.value as forge.asn1.Asn1[]) ?? []) {
            // otherName: [0] { type-id OID, [0] EXPLICIT value }
            if (nombre.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || nombre.type !== 0) continue;
            const partes = nombre.value as forge.asn1.Asn1[];
            if (!Array.isArray(partes) || partes.length < 2) continue;
            if (forge.asn1.derToOid(partes[0].value as string) !== OID_RUT) continue;
            const envuelto = partes[1].value as forge.asn1.Asn1[];
            const valor = Array.isArray(envuelto) ? envuelto[0]?.value : partes[1].value;
            const rut = rutValido(typeof valor === 'string' ? valor : '');
            if (rut) return rut;
        }
    } catch {
        return null;
    }
    return null;
}
