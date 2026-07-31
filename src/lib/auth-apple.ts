// Genera el client_secret de Apple: un JWT firmado con la private key P8
// Apple no tiene client_secret permanente — hay que generarlo en cada solicitud.
// Docs: https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens

import { createSign } from 'node:crypto';

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
