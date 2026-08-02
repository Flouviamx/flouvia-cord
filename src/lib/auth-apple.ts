// Genera el client_secret de Apple: un JWT firmado con la private key P8
// Apple no tiene client_secret permanente — hay que generarlo en cada solicitud.
// Docs: https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens

import { createSign, webcrypto } from 'node:crypto';

export function createAppleClientSecret(): string {
  const teamId = import.meta.env.APPLE_TEAM_ID;
  const keyId = import.meta.env.APPLE_KEY_ID;
  const clientId = import.meta.env.APPLE_CLIENT_ID;
  const privateKey = import.meta.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!teamId || !keyId || !clientId || !privateKey) {
    throw new Error('Apple OAuth: faltan variables de entorno (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY)');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 180 * 24 * 60 * 60; // 6 meses máximo

  const header = { alg: 'ES256', kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  const sign = createSign('SHA256');
  sign.update(signingInput);
  const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url');

  return `${signingInput}.${signature}`;
}

// ── Verificación REAL del id_token de Apple ─────────────────────────────────
// Reescrito (ago 2026): antes se decodificaba el id_token con un base64
// decode plano y SIN verificar la firma — cualquiera podía forjar un JWT con
// `{"sub":"x","email":"victima@x.com"}` y entrar como esa cuenta. Ahora:
// (1) el `code` se intercambia de verdad con Apple (confirma que la
// autorización fue real, no solo un id_token suelto) y (2) el id_token que
// devuelve el endpoint de Apple se verifica contra las JWKS públicas
// (https://appleid.apple.com/auth/keys) con Web Crypto (RS256).

export class AppleTokenVerificationError extends Error {}

interface AppleJwk { kty: string; kid: string; use: string; alg: string; n: string; e: string }
interface AppleJwksCache { keys: AppleJwk[]; fetchedAt: number }

let jwksCache: AppleJwksCache | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1h — las llaves de Apple rotan con poca frecuencia

async function fetchApplePublicKeys(): Promise<AppleJwk[]> {
  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) throw new AppleTokenVerificationError(`jwks_fetch_failed:${res.status}`);
  const data = (await res.json()) as { keys: AppleJwk[] };
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return jwksCache.keys;
}

async function getApplePublicKeys(forceRefresh = false): Promise<AppleJwk[]> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  return fetchApplePublicKeys();
}

async function importApplePublicKey(jwk: AppleJwk): Promise<webcrypto.CryptoKey> {
  return webcrypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/** Intercambia el `code` de autorización por un id_token FRESCO emitido por el endpoint de Apple (no el del form_post inicial). */
export async function exchangeAppleCode(code: string, redirectUri: string): Promise<string> {
  const clientId = import.meta.env.APPLE_CLIENT_ID;
  const clientSecret = createAppleClientSecret();
  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new AppleTokenVerificationError(`token_exchange_failed:${res.status}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new AppleTokenVerificationError('sin_id_token');
  return data.id_token;
}

export interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  nonce?: string;
}

/** Verifica firma (JWKS/RS256) + iss/aud/exp/nonce de un id_token de Apple. Lanza AppleTokenVerificationError si algo no cuadra. */
export async function verifyAppleIdToken(idToken: string, expectedNonce: string): Promise<AppleIdTokenClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new AppleTokenVerificationError('token_malformado');
  const [headerB64, payloadB64, sigB64] = parts;

  let header: any, payload: any;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new AppleTokenVerificationError('token_malformado');
  }
  if (header.alg !== 'RS256') throw new AppleTokenVerificationError('algoritmo_no_soportado');

  let jwk = (await getApplePublicKeys()).find((k) => k.kid === header.kid);
  if (!jwk) {
    // Apple rota llaves — un solo refresh sin caché antes de rendirse.
    jwk = (await getApplePublicKeys(true)).find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new AppleTokenVerificationError('llave_no_encontrada');

  const key = await importApplePublicKey(jwk);
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = Buffer.from(sigB64, 'base64url');
  const valid = await webcrypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, signingInput);
  if (!valid) throw new AppleTokenVerificationError('firma_invalida');

  const now = Math.floor(Date.now() / 1000);
  const clientId = import.meta.env.APPLE_CLIENT_ID;
  if (payload.iss !== 'https://appleid.apple.com') throw new AppleTokenVerificationError('iss_invalido');
  if (payload.aud !== clientId) throw new AppleTokenVerificationError('aud_invalido');
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new AppleTokenVerificationError('token_expirado');
  if (!payload.nonce || payload.nonce !== expectedNonce) throw new AppleTokenVerificationError('nonce_invalido');
  if (!payload.sub) throw new AppleTokenVerificationError('sub_faltante');

  return payload as AppleIdTokenClaims;
}
