// Cadena de certificación de PRUEBA para el riel DIAN: raíz autofirmada →
// entidad subordinada → titular, con los usos de llave que exige la política
// de firma (firma digital y no repudio). La usan scripts/dian-check.mjs y las
// pruebas (test/dian-*.test.ts). Ningún documento firmado con ella es válido
// ante la DIAN: la raíz no está avalada por la ONAC.
import { generateKeyPairSync } from 'node:crypto';
import forge from 'node-forge';

function llave() {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const key = forge.pki.privateKeyFromPem(keyPem);
    return { key, pub: forge.pki.setRsaPublicKey(key.n, key.e), keyPem };
}

function certificado({ serial, sujeto, emisor, pub, firmante, ca }) {
    const c = forge.pki.createCertificate();
    c.publicKey = pub;
    c.serialNumber = serial;
    c.validity.notBefore = new Date(Date.now() - 86_400_000);
    c.validity.notAfter = new Date(Date.now() + 2 * 365 * 86_400_000);
    c.setSubject(sujeto);
    c.setIssuer(emisor);
    c.setExtensions(ca
        ? [{ name: 'basicConstraints', cA: true, critical: true }, { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }]
        : [{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyEncipherment: true, critical: true }]);
    c.sign(firmante, forge.md.sha256.create());
    return c;
}

/**
 * { cadena: [titular, subordinada, raíz] en PEM, llavePem, p12(password) }.
 * `nit`: va en el serialNumber del sujeto, como lo hacen las entidades
 * certificadoras colombianas.
 */
export function cadenaDePrueba(nit = '900373076') {
    const raiz = llave();
    const sub = llave();
    const titular = llave();
    const nRaiz = [{ name: 'countryName', value: 'CO' }, { name: 'organizationName', value: 'Cord Pruebas' }, { name: 'commonName', value: 'Raiz de pruebas Cord' }];
    const nSub = [{ name: 'countryName', value: 'CO' }, { name: 'organizationName', value: 'Cord Pruebas' }, { name: 'commonName', value: 'Subordinada de pruebas Cord' }, { type: '1.2.840.113549.1.9.1', value: 'pruebas@cord.test', valueTagClass: forge.asn1.Type.IA5STRING }];
    const nTit = [{ name: 'countryName', value: 'CO' }, { name: 'organizationName', value: 'Negocio de Prueba S.A.S.' }, { name: 'commonName', value: 'Negocio de Prueba S.A.S.' }, { type: '2.5.4.5', value: nit }];
    const cRaiz = certificado({ serial: '01', sujeto: nRaiz, emisor: nRaiz, pub: raiz.pub, firmante: raiz.key, ca: true });
    const cSub = certificado({ serial: '02', sujeto: nSub, emisor: nRaiz, pub: sub.pub, firmante: raiz.key, ca: true });
    const cTit = certificado({ serial: '6c0b0762626da0e2', sujeto: nTit, emisor: nSub, pub: titular.pub, firmante: sub.key, ca: false });
    const cadena = [cTit, cSub, cRaiz].map((c) => forge.pki.certificateToPem(c));
    const p12 = (password, conCadena = true) => Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(
        titular.key, conCadena ? [cTit, cSub, cRaiz] : [cTit], password, { algorithm: '3des' },
    )).getBytes(), 'binary');
    return { cadena, llavePem: titular.keyPem, p12 };
}
