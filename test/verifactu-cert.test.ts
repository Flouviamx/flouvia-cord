// Certificado de Verifactu: los .p12 reales que rompían el envío.
//   - cadena con la CA antes que el certificado del titular;
//   - llave sin cifrar (keyBag);
//   - PKCS#12 "legacy" (RC2-40) que node-forge abre pero el TLS de Node
//     (OpenSSL 3) rechaza con "Unsupported PKCS12 PFX data";
//   - un archivo con millones de iteraciones (CPU) se rechaza antes de descifrar.
import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { credencialesTls, InvalidCertificateError, iteracionesPkcs12, parsePkcs12 } from '../src/lib/fiscal/verifactu/cert';

function keyPair() {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const priv = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }).toString());
    const pub = forge.pki.setRsaPublicKey((priv as forge.pki.rsa.PrivateKey).n, (priv as forge.pki.rsa.PrivateKey).e);
    return { priv, pub };
}

function certificado(subject: forge.pki.CertificateField[], pub: forge.pki.PublicKey, signer: forge.pki.PrivateKey, notAfter: Date, issuer = subject) {
    const cert = forge.pki.createCertificate();
    cert.publicKey = pub;
    cert.serialNumber = String(Math.floor(Math.random() * 1e9));
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = notAfter;
    cert.setSubject(subject);
    cert.setIssuer(issuer);
    cert.sign(signer as forge.pki.rsa.PrivateKey, forge.md.sha256.create());
    return cert;
}

const titular = keyPair();
const ca = keyPair();
const caSubject = [{ name: 'commonName', value: 'AC Pruebas' }];
const caCert = certificado(caSubject, ca.pub, ca.priv, new Date(Date.now() + 5 * 365 * 86_400_000));
const leafNotAfter = new Date(Date.now() + 200 * 86_400_000);
const leafCert = certificado([
    { name: 'commonName', value: 'ACME SL - B12345674' },
    { type: '2.5.4.5', value: 'IDCES-12345678Z' },
    { type: '2.5.4.97', value: 'VATES-B12345674' },
], titular.pub, ca.priv, leafNotAfter, caSubject);

function p12(options: { password: string | null; algorithm?: 'aes256' | '3des'; certs?: forge.pki.Certificate[]; count?: number }): Buffer {
    const asn1 = forge.pkcs12.toPkcs12Asn1(titular.priv, options.certs ?? [caCert, leafCert], options.password as string, {
        algorithm: options.algorithm ?? 'aes256', count: options.count ?? 2048, generateLocalKeyId: true,
    } as any);
    return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

let openssl = true;
try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); } catch { openssl = false; }

/** .p12 fabricado por el `openssl` del sistema (exportadores reales), o null si no se puede. */
function opensslP12(extra: string[]): Buffer | null {
    const dir = mkdtempSync(join(tmpdir(), 'verifactu-p12-'));
    try {
        writeFileSync(join(dir, 'k.pem'), forge.pki.privateKeyToPem(titular.priv));
        writeFileSync(join(dir, 'c.pem'), forge.pki.certificateToPem(leafCert) + forge.pki.certificateToPem(caCert));
        execFileSync('openssl', ['pkcs12', '-export', ...extra, '-in', join(dir, 'c.pem'), '-inkey', join(dir, 'k.pem'),
            '-out', join(dir, 'out.p12'), '-passout', 'pass:secreta'], { stdio: 'pipe' });
        return readFileSync(join(dir, 'out.p12'));
    } catch {
        return null;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('parsePkcs12', () => {
    it('elige el certificado de la LLAVE aunque la CA venga primero, y lee los NIF del titular', () => {
        const parsed = parsePkcs12(p12({ password: 'secreta' }), 'secreta');
        expect(Math.abs(parsed.expiresAt.getTime() - leafNotAfter.getTime())).toBeLessThan(1000);
        expect(parsed.subjectCN).toBe('ACME SL - B12345674');
        expect(parsed.nifs.sort()).toEqual(['12345678Z', 'B12345674']);
    });

    it('contraseña incorrecta → mensaje para el usuario, no el error de forge', () => {
        expect(() => parsePkcs12(p12({ password: 'secreta' }), 'otra')).toThrow(InvalidCertificateError);
        expect(() => parsePkcs12(p12({ password: 'secreta' }), 'otra')).toThrow(/contraseña/);
    });

    it.skipIf(!openssl)('admite la llave sin cifrar (keyBag) con el MAC protegido por contraseña', () => {
        const bytes = opensslP12(['-keypbe', 'NONE', '-certpbe', 'NONE']);
        if (!bytes) return;
        const parsed = parsePkcs12(bytes, 'secreta');
        expect(parsed.nifs).toContain('B12345674');
    });

    it('un .p12 con la llave pero sin su certificado se rechaza', () => {
        expect(() => parsePkcs12(p12({ password: 'secreta', certs: [caCert] }), 'secreta')).toThrow(/corresponde a su llave/);
    });

    it('cuenta las iteraciones visibles y rechaza un archivo hecho para gastar CPU', () => {
        expect(iteracionesPkcs12(p12({ password: 'secreta' }).toString('binary'))).toContain(2048);
        const a = forge.asn1;
        const seq = (...v: forge.asn1.Asn1[]) => a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, v);
        const octet = (bytes: string) => a.create(a.Class.UNIVERSAL, a.Type.OCTETSTRING, false, bytes);
        const int = (n: number) => a.create(a.Class.UNIVERSAL, a.Type.INTEGER, false, a.integerToDer(n).getBytes());
        const pfx = seq(
            int(3),
            seq(a.create(a.Class.UNIVERSAL, a.Type.OID, false, a.oidToDer(forge.pki.oids.data).getBytes()),
                a.create(a.Class.CONTEXT_SPECIFIC, 0, true, [octet(a.toDer(seq()).getBytes())])),
            seq(seq(seq(a.create(a.Class.UNIVERSAL, a.Type.OID, false, a.oidToDer(forge.pki.oids.sha1).getBytes()), a.create(a.Class.UNIVERSAL, a.Type.NULL, false, '')), octet('x'.repeat(20))),
                octet('salt'), int(5_000_000)),
        );
        const der = Buffer.from(a.toDer(pfx).getBytes(), 'binary');
        const start = Date.now();
        expect(() => parsePkcs12(der, 'secreta')).toThrow(/protección de contraseña/);
        expect(Date.now() - start).toBeLessThan(1000);
    });
});

describe('credencialesTls', () => {
    it('un PKCS#12 moderno se usa tal cual (pfx)', () => {
        const creds = credencialesTls(p12({ password: 'secreta' }), 'secreta');
        expect('pfx' in creds).toBe(true);
    });

    it.skipIf(!openssl)('un PKCS#12 legacy (RC2-40) que OpenSSL 3 rechaza se convierte a PEM en memoria', () => {
        const bytes = opensslP12(['-legacy']);
        if (!bytes) return; // OpenSSL sin proveedor legacy: no hay cómo fabricar el archivo aquí.
        const parsed = parsePkcs12(bytes, 'secreta');
        expect(parsed.nifs).toContain('B12345674');
        // Node ≥ 17 trae OpenSSL 3 sin el proveedor legacy: el pfx no carga y
        // las credenciales salen en PEM (llave + cadena, titular primero).
        const creds = credencialesTls(bytes, 'secreta') as { key: string; cert: string };
        expect(creds.key).toMatch(/BEGIN RSA PRIVATE KEY/);
        expect(creds.cert.indexOf(forge.pki.certificateToPem(leafCert).trim())).toBe(0);
    });
});
