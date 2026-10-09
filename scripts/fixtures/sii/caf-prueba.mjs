// Archivo de autorización de folios (CAF) DE PRUEBA, con la estructura del
// Anexo 1 del instructivo técnico del SII: llaves RSA de 512 bits y exponente
// 3 como las del ejemplo oficial F60T33, y una <FRMA> firmada con una llave
// "del SII" de prueba (la real no se publica). Sirve a scripts/sii-check.mjs y
// a las pruebas; nunca a una emisión real.
import { createSign, generateKeyPairSync } from 'node:crypto';

export function llavesCaf() {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 512, publicExponent: 3 });
    const jwk = publicKey.export({ format: 'jwk' });
    return {
        privadaPem: privateKey.export({ type: 'pkcs1', format: 'pem' }),
        publicaPem: publicKey.export({ type: 'spki', format: 'pem' }),
        m: Buffer.from(jwk.n, 'base64url').toString('base64'),
        e: Buffer.from(jwk.e, 'base64url').toString('base64'),
    };
}

/** CAF de prueba. `llaveSii` (opcional) firma <DA> como lo haría el SII. */
export function cafDePrueba({ rut = '76123456-0', razonSocial = 'EMPRESA DE PRUEBA SPA', tipo = 33, desde = 1, hasta = 50, fecha = '2026-10-01', idk = 100, llaves = llavesCaf(), llaveSii } = {}) {
    const da = `<DA><RE>${rut}</RE><RS>${razonSocial}</RS><TD>${tipo}</TD><RNG><D>${desde}</D><H>${hasta}</H></RNG><FA>${fecha}</FA>`
        + `<RSAPK><M>${llaves.m}</M><E>${llaves.e}</E></RSAPK><IDK>${idk}</IDK></DA>`;
    const sii = llaveSii ?? generateKeyPairSync('rsa', { modulusLength: 512, publicExponent: 3 }).privateKey;
    const frma = createSign('RSA-SHA1').update(Buffer.from(da, 'latin1')).sign(sii).toString('base64');
    const xml = '<?xml version="1.0"?>\n<AUTORIZACION>\n<CAF version="1.0">\n'
        + da.replace(/></g, '>\n<')
        + `\n<FRMA algoritmo="SHA1withRSA">${frma}</FRMA>\n</CAF>\n`
        + `<RSASK>${llaves.privadaPem.trim()}</RSASK>\n<RSAPUBK>${llaves.publicaPem.trim()}</RSAPUBK>\n</AUTORIZACION>\n`;
    return { xml, llaves, bytes: Buffer.from(xml, 'latin1') };
}
