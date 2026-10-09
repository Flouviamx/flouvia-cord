// Cadena de certificación del certificado de firma.
//
// La DIAN exige en xades:SigningCertificate AL MENOS TRES grupos Cert: el del
// firmante, el de la entidad certificadora subordinada y el de la raíz, ambas
// avaladas por la ONAC [AT 8.7, reglas DC25, DC37–DC39 y DC44–DC46; AT 10.5.2:
// "con el certificado digital y toda la cadena de certificación (desde el
// certificado raíz)"]. El marco común (latam/certificado.ts) solo devuelve el
// certificado del titular; aquí se reconstruye la cadena con los certificados
// que trae el .p12 o un archivo aparte, verificando cada firma — nunca "los
// que vengan en la bolsa".
//
// Se guarda como un PEM con varios certificados (titular primero) en la misma
// credencial cifrada del marco; firma.ts la separa al firmar.
//
// Puro (node-forge).

import forge from 'node-forge';
import { RailDatosError } from '../errores.ts';

/** Todos los certificados de un .p12/.pfx (sin la llave), en PEM. */
export function certificadosDePkcs12(bytes: Uint8Array, password: string): string[] {
    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
        p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(bytes).toString('binary'))), password);
    } catch {
        throw new RailDatosError('No se pudo abrir el archivo .p12/.pfx. Verifica que la contraseña sea correcta.');
    }
    const bolsa = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    return bolsa.filter((b) => b.cert).map((b) => forge.pki.certificateToPem(b.cert!));
}

/** Certificados de un archivo PEM o DER (uno o varios). */
export function certificadosDeArchivo(contenido: Uint8Array | string): string[] {
    const txt = typeof contenido === 'string' ? contenido : Buffer.from(contenido).toString('utf8');
    const pems = txt.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (pems?.length) return pems;
    try {
        const der = typeof contenido === 'string' ? contenido : Buffer.from(contenido).toString('binary');
        return [forge.pki.certificateToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der))))];
    } catch {
        throw new RailDatosError('No se pudo leer el archivo de la cadena de certificación. Súbelo en formato .pem, .crt o .cer.');
    }
}

/** El nombre distinguido en DER: se compara byte a byte, como lo hace la verificación de la cadena. */
const nombre = (n: forge.pki.Certificate['subject']) => forge.asn1.toDer(forge.pki.distinguishedNameToAsn1(n)).getBytes();

function emitio(emisor: forge.pki.Certificate, hijo: forge.pki.Certificate): boolean {
    if (nombre(emisor.subject) !== nombre(hijo.issuer)) return false;
    try { return emisor.verify(hijo); } catch { return false; }
}

const autofirmado = (c: forge.pki.Certificate) => emitio(c, c);

/**
 * Ordena la cadena desde el certificado del titular hasta la raíz
 * (autofirmada), verificando la firma de cada eslabón. Lanza RailDatosError
 * si no llega a una raíz o si queda con menos de tres certificados.
 */
export function cadenaDesde(titularPem: string, candidatosPem: string[]): string[] {
    const titular = forge.pki.certificateFromPem(titularPem);
    const candidatos: forge.pki.Certificate[] = [];
    for (const pem of candidatosPem) {
        try { candidatos.push(forge.pki.certificateFromPem(pem)); } catch { /* un bloque ilegible no es parte de la cadena */ }
    }
    const cadena = [titular];
    let actual = titular;
    for (let i = 0; i < 8 && !autofirmado(actual); i++) {
        const padre = candidatos.find((c) => !cadena.includes(c) && emitio(c, actual));
        if (!padre) break;
        cadena.push(padre);
        actual = padre;
    }
    if (!autofirmado(actual) || cadena.length < 3) {
        throw new RailDatosError('La DIAN exige el certificado con toda su cadena de certificación (la entidad certificadora intermedia y la raíz). Exporta el .p12 con la cadena completa o sube también el archivo de la cadena que entrega tu entidad certificadora.');
    }
    return cadena.map((c) => forge.pki.certificateToPem(c));
}

/** La credencial guardada: el PEM con la cadena, titular primero. */
export function separarCadena(pem: string): string[] {
    return pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
}

/**
 * Usos de la llave que exige la política de firma [AT 10.14, Regla-2]:
 * firma digital y no repudio. Solo se rechaza si el certificado DECLARA sus
 * usos y no incluye ambos (sin la extensión no se adivina).
 */
export function problemaDeUso(titularPem: string): string | null {
    const c = forge.pki.certificateFromPem(titularPem);
    const ku = c.getExtension('keyUsage') as { digitalSignature?: boolean; nonRepudiation?: boolean } | null;
    if (ku && (!ku.digitalSignature || !ku.nonRepudiation)) {
        return 'Este certificado no está habilitado para firma digital con no repudio, como exige la DIAN. Usa el certificado de firma de factura electrónica que te entregó tu entidad certificadora.';
    }
    const alg = forge.pki.oids[c.siginfo.algorithmOid] ?? c.siginfo.algorithmOid;
    if (!/sha(256|384|512)WithRSAEncryption/.test(String(alg))) {
        return 'Este certificado usa un algoritmo de firma que la DIAN ya no admite (debe ser SHA-256 o superior).';
    }
    return null;
}
