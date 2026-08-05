// scripts/saml-xsw-check.mjs
// Harness de regresión contra XML Signature Wrapping (XSW) para el motor SAML
// (@node-saml/node-saml). Construye una aserción SAML 2.0 REAL, la firma con
// un keypair RSA desechable (vía xml-crypto, la misma librería que node-saml
// usa por debajo para verificar), y confirma que ~11 mutaciones clásicas de
// ataque son RECHAZADAS por el código real de validación — no una
// reimplementación ni un mock.
//
// Por qué existe: XML-DSig no se puede "probar visualmente" — un verificador
// con un bug sutil de canonicalización acepta firmas válidas Y documentos
// mutados, en silencio. Este script es la única red que detectaría una
// regresión de ese tipo introducida por un `npm update` futuro de node-saml/
// xml-crypto/@xmldom/xmldom.
//
// No depende de la base de datos ni de env vars de Cord — es 100% autónomo,
// corre offline. Genera su propio cert autofirmado desechable con openssl
// (ya viene en cualquier máquina de desarrollo/CI) en un directorio temporal
// que se borra al terminar.
//
//   node scripts/saml-xsw-check.mjs
//   npm run saml:xsw-check

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignedXml } from 'xml-crypto';
import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';

// ── Cert desechable ──────────────────────────────────────────────────────
const workdir = mkdtempSync(join(tmpdir(), 'cord-saml-xsw-'));
const keyPath = join(workdir, 'key.pem');
const certPath = join(workdir, 'cert.pem');
execFileSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048',
  '-keyout', keyPath, '-out', certPath,
  '-days', '1', '-nodes', '-subj', '/CN=cord-saml-xsw-test',
], { stdio: 'pipe' });
const privateKey = readFileSync(keyPath, 'utf8');
const cert = readFileSync(certPath, 'utf8');

// ── Constantes del escenario (mismo shape que un login SP-initiated real) ──
const ISSUER = 'https://test-idp.example.com';
const AUDIENCE = 'https://cordhq.app/api/auth/saml/test-cid/metadata';
const ACS = 'https://cordhq.app/api/auth/saml/test-cid/acs';
const IN_RESPONSE_TO = '_authnreq_test';

const iso = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
const rid = (prefix) => `_${prefix}_${Math.random().toString(16).slice(2)}`;

function freshTimes() {
  const now = new Date();
  return {
    notBefore: iso(new Date(now.getTime() - 60_000)),
    notOnOrAfter: iso(new Date(now.getTime() + 5 * 60_000)),
    issueInstant: iso(now),
  };
}

function buildAssertionInner({ notBefore, notOnOrAfter, assertionId, issueInstant, audience = AUDIENCE, subjectRecipient = ACS, inResponseTo = IN_RESPONSE_TO, nameId = 'user@acme.com' }) {
  return `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" IssueInstant="${issueInstant}" Version="2.0"><saml:Issuer>${ISSUER}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${nameId}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${subjectRecipient}" InResponseTo="${inResponseTo}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}"><saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${issueInstant}" SessionIndex="_session1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement></saml:Assertion>`;
}

// Firma la <Assertion> con enveloped-signature + exclusive-c14n + sha256 —
// el MISMO trío de algoritmos que src/lib/saml.ts exige (want*Signed) y que
// buildSamlInstance() espera poder verificar.
function signAssertionXml(assertionXml) {
  const sig = new SignedXml({
    privateKey, publicCert: cert,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
  });
  sig.computeSignature(assertionXml, {
    // La Signature va inmediatamente después de <Issuer>, como exige el
    // schema de SAML Core (§5.4.2) — no al final del elemento.
    location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: 'after' },
  });
  return sig.getSignedXml();
}

function wrapResponse(assertionXml, { responseId, destination = ACS, inResponseTo = IN_RESPONSE_TO, issueInstant }) {
  return `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="${responseId}" Version="2.0" IssueInstant="${issueInstant}" Destination="${destination}" InResponseTo="${inResponseTo}"><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${ISSUER}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${assertionXml}</samlp:Response>`;
}

function buildBaseline() {
  const t = freshTimes();
  const assertionId = rid('assertion');
  const inner = buildAssertionInner({ ...t, assertionId });
  const signedAssertion = signAssertionXml(inner);
  return wrapResponse(signedAssertion, { responseId: rid('resp'), issueInstant: t.issueInstant });
}

// Cache mínimo que satisface la validación de InResponseTo de node-saml
// (equivalente a lo que PgSamlCacheProvider de src/lib/saml.ts resolvería
// para un AuthnRequest legítimo con este mismo id).
function makeCache() {
  return {
    async saveAsync() { return null; },
    async getAsync(key) { return key === IN_RESPONSE_TO ? new Date(Date.now() - 5000).toISOString() : null; },
    async removeAsync() { return null; },
  };
}

// Misma configuración que buildSamlInstance() arma para el modo 'sp-acs' en
// src/lib/saml.ts (want*Signed:true, validateInResponseTo:always).
function makeSaml() {
  return new SAML({
    idpCert: cert, issuer: AUDIENCE, callbackUrl: ACS, entryPoint: 'https://test-idp.example.com/sso',
    validateInResponseTo: ValidateInResponseTo.always, wantAssertionsSigned: true, wantAuthnResponseSigned: false,
    cacheProvider: makeCache(),
  });
}

async function validate(xml) {
  const b64 = Buffer.from(xml, 'utf8').toString('base64');
  const { profile } = await makeSaml().validatePostResponseAsync({ SAMLResponse: b64 });
  return profile;
}

let pass = 0, fail = 0;
async function expectReject(name, xmlFn) {
  try {
    const profile = await validate(await xmlFn());
    console.log(`✗ FAIL ${name} — la validación ACEPTÓ (nameID=${profile?.nameID}), se esperaba rechazo`);
    fail++;
  } catch (err) {
    console.log(`✓ OK   ${name} — rechazado: ${err.message}`);
    pass++;
  }
}
async function expectAccept(name, xmlFn) {
  try {
    const profile = await validate(await xmlFn());
    console.log(`✓ OK   ${name} — aceptado (nameID=${profile?.nameID})`);
    pass++;
  } catch (err) {
    console.log(`✗ FAIL ${name} — la validación RECHAZÓ inesperadamente: ${err.message}`);
    fail++;
  }
}

async function main() {
  // 0. Sanity: si el baseline SIN mutar no se acepta, el harness mismo está
  //    mal construido — ninguna de las pruebas de abajo sería confiable.
  await expectAccept('0. baseline (sin mutar)', async () => buildBaseline());

  await expectReject('1. firma eliminada por completo', async () => {
    const xml = buildBaseline();
    return xml.replace(/<Signature[^>]*>[\s\S]*?<\/Signature>/, '');
  });

  await expectReject('2. segunda aserción SIN FIRMAR antepuesta', async () => {
    const t = freshTimes();
    const attacker = buildAssertionInner({ ...t, assertionId: rid('evil') });
    const xml = buildBaseline();
    return xml.replace(/(<samlp:Status>[\s\S]*?<\/samlp:Status>)/, `$1${attacker}`);
  });

  await expectReject('3. segunda aserción SIN FIRMAR pospuesta', async () => {
    const t = freshTimes();
    const attacker = buildAssertionInner({ ...t, assertionId: rid('evil') });
    const xml = buildBaseline();
    return xml.replace('</samlp:Response>', `${attacker}</samlp:Response>`);
  });

  await expectReject('4. Audience alterado post-firma', async () => {
    const xml = buildBaseline();
    return xml.replace(`<saml:Audience>${AUDIENCE}</saml:Audience>`, `<saml:Audience>https://evil.example.com</saml:Audience>`);
  });

  // node-saml NO valida el Destination del <Response> por sí solo — es
  // exactamente el hueco que cierra assertDestinationAndRecipient() en
  // src/lib/saml.ts, que corre DESPUÉS de esta validación. Este caso debe
  // seguir "aceptado" aquí — documenta el límite real de la librería, no un
  // bug de este harness.
  await expectAccept('5. Destination del <Response> alterado (cerrado por assertDestinationAndRecipient, no por node-saml)', async () => {
    const xml = buildBaseline();
    return xml.replace(`Destination="${ACS}"`, `Destination="https://evil.example.com/acs"`);
  });

  await expectReject('6. Recipient (SubjectConfirmationData) alterado post-firma', async () => {
    const xml = buildBaseline();
    return xml.replace(`Recipient="${ACS}"`, `Recipient="https://evil.example.com/acs"`);
  });

  await expectReject('7. InResponseTo (SubjectConfirmationData) alterado post-firma', async () => {
    const xml = buildBaseline();
    return xml.replace(`InResponseTo="${IN_RESPONSE_TO}"`, `InResponseTo="_otro_request"`);
  });

  await expectReject('8. Issuer de la Assertion alterado post-firma', async () => {
    const xml = buildBaseline();
    const idx = xml.indexOf('<saml:Assertion');
    return xml.slice(0, idx) + xml.slice(idx).replace(`<saml:Issuer>${ISSUER}</saml:Issuer>`, `<saml:Issuer>https://evil-idp.example.com</saml:Issuer>`);
  });

  await expectReject('9. NotOnOrAfter vencido (aserción legítimamente firmada, ya expirada)', async () => {
    const now = new Date();
    const notBefore = iso(new Date(now.getTime() - 3_600_000));
    const notOnOrAfter = iso(new Date(now.getTime() - 1_800_000)); // venció hace 30 min
    const inner = buildAssertionInner({ notBefore, notOnOrAfter, assertionId: rid('assertion'), issueInstant: iso(now) });
    const signedAssertion = signAssertionXml(inner);
    return wrapResponse(signedAssertion, { responseId: rid('resp'), issueInstant: iso(now) });
  });

  await expectReject('10. la misma aserción firmada duplicada dos veces en el mismo Response', async () => {
    const t = freshTimes();
    const inner = buildAssertionInner({ ...t, assertionId: rid('assertion') });
    const signedAssertion = signAssertionXml(inner);
    const xml = wrapResponse(signedAssertion, { responseId: rid('resp'), issueInstant: t.issueInstant });
    return xml.replace('</samlp:Response>', `${signedAssertion}</samlp:Response>`);
  });

  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  return fail === 0;
}

main()
  .then((ok) => { rmSync(workdir, { recursive: true, force: true }); process.exit(ok ? 0 : 1); })
  .catch((err) => { console.error(err); rmSync(workdir, { recursive: true, force: true }); process.exit(1); });
