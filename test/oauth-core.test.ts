import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
    buildRedirect, clientSecretMatches, isValidCodeChallenge, isValidRedirectUri, newAccessToken, newAuthCode,
    newRefreshToken, parseScope, pickReturnTo, readClientCredentials, redirectAllowed, sha256Hex, tokenDisplay, verifyPkce,
} from '../src/lib/oauth-core';

describe('oauth-core', () => {
    it('emite tokens con prefijo propio y sin repetirse', () => {
        expect(newAccessToken()).toMatch(/^cord_at_[a-f0-9]{48}$/);
        expect(newRefreshToken()).toMatch(/^cord_rt_[a-f0-9]{64}$/);
        expect(newAuthCode()).toMatch(/^cord_ac_[a-f0-9]{64}$/);
        expect(newAccessToken()).not.toBe(newAccessToken());
    });

    it('la vista del token no revela el cuerpo', () => {
        const t = newAccessToken();
        const d = tokenDisplay(t);
        expect(d.prefix).toBe(t.slice(0, 16));
        expect(d.last4).toBe(t.slice(-4));
        expect(d.prefix.length + d.last4.length).toBeLessThan(t.length / 2);
    });

    it('scope: mínimo por defecto, write incluye read, lo desconocido se rechaza', () => {
        expect(parseScope(undefined)).toBe('read');
        expect(parseScope('')).toBe('read');
        expect(parseScope('read')).toBe('read');
        expect(parseScope('write')).toBe('write');
        expect(parseScope('read write')).toBe('write');
        expect(parseScope('read,write')).toBe('write');
        expect(parseScope('admin')).toBeNull();
        expect(parseScope('read admin')).toBeNull();
    });

    it('redirect: coincidencia exacta, ni prefijo ni comodín', () => {
        const reg = ['https://zapier.com/dashboard/auth/oauth/return/App246344CLIAPI/'];
        expect(redirectAllowed(reg, reg[0])).toBe(true);
        expect(redirectAllowed(reg, reg[0] + 'x')).toBe(false);
        expect(redirectAllowed(reg, 'https://zapier.com/dashboard/auth/oauth/return/')).toBe(false);
        expect(redirectAllowed(reg, 'https://evil.com/?u=' + reg[0])).toBe(false);
        expect(redirectAllowed(reg, null)).toBe(false);
        expect(redirectAllowed(reg, 'x'.repeat(3000))).toBe(false);
    });

    it('un redirect registrable es https o http hacia la propia máquina', () => {
        expect(isValidRedirectUri('https://zapier.com/cb')).toBe(true);
        expect(isValidRedirectUri('http://localhost:3000/cb')).toBe(true);
        expect(isValidRedirectUri('http://evil.com/cb')).toBe(false);
        expect(isValidRedirectUri('https://zapier.com/cb#frag')).toBe(false);
        expect(isValidRedirectUri('javascript:alert(1)')).toBe(false);
        expect(isValidRedirectUri('no es url')).toBe(false);
    });

    it('PKCE S256: vector del RFC 7636 y rechazo de lo demás', () => {
        const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
        const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
        expect(verifyPkce(verifier, challenge)).toBe(true);
        expect(verifyPkce(verifier + 'a', challenge)).toBe(false);
        expect(verifyPkce('corto', challenge)).toBe(false);
        expect(verifyPkce(null, challenge)).toBe(false);
        expect(verifyPkce(challenge, challenge)).toBe(false);
        expect(isValidCodeChallenge(challenge)).toBe(true);
        expect(isValidCodeChallenge('abc')).toBe(false);
        expect(isValidCodeChallenge(createHash('sha256').update('x').digest('hex'))).toBe(false);
    });

    it('el secreto del cliente se compara por hash', () => {
        const hash = sha256Hex('s3cret');
        expect(clientSecretMatches('s3cret', hash)).toBe(true);
        expect(clientSecretMatches('s3cret ', hash)).toBe(false);
        expect(clientSecretMatches('', hash)).toBe(false);
        expect(clientSecretMatches(null, hash)).toBe(false);
    });

    it('lee las credenciales del header Basic o del cuerpo', () => {
        const basic = 'Basic ' + Buffer.from('cid:sec%3Aret').toString('base64');
        expect(readClientCredentials(basic, new URLSearchParams())).toEqual({ clientId: 'cid', clientSecret: 'sec:ret' });
        const body = new URLSearchParams({ client_id: 'a', client_secret: 'b' });
        expect(readClientCredentials(null, body)).toEqual({ clientId: 'a', clientSecret: 'b' });
        expect(readClientCredentials('Basic %%%', new URLSearchParams())).toEqual({ clientId: null, clientSecret: null });
    });

    it('arma el redirect conservando la query existente y omitiendo vacíos', () => {
        const u = buildRedirect('https://a.com/cb?x=1', { code: 'c', state: null });
        expect(u).toBe('https://a.com/cb?x=1&code=c');
    });

    it('regreso por zona: solo a direcciones registradas de la misma app', () => {
        const reg = ['https://www.make.com/oauth/cb/app', 'https://us2.make.com/oauth/cb/app', 'https://eu1.make.com/oauth/cb/app'];
        const www = reg[0];
        expect(pickReturnTo(reg, www, null, 'https://us2.make.com/')).toBe('https://us2.make.com/oauth/cb/app');
        expect(pickReturnTo(reg, www, null, 'https://eu1.make.com/organization/1/scenarios')).toBe('https://eu1.make.com/oauth/cb/app');
        expect(pickReturnTo(reg, www, null, 'https://eu9.make.com/')).toBe(www);
        expect(pickReturnTo(reg, www, null, 'https://evil.test/')).toBe(www);
        expect(pickReturnTo(reg, www, null, 'no es url')).toBe(www);
        expect(pickReturnTo(reg, www, null, null)).toBe(www);
        expect(pickReturnTo(reg, www, 'https://eu1.make.com/oauth/cb/app', null)).toBe('https://eu1.make.com/oauth/cb/app');
        expect(pickReturnTo(reg, www, 'https://evil.test/oauth/cb/app', 'https://us2.make.com/')).toBe('https://us2.make.com/oauth/cb/app');
        const zap = ['https://zapier.com/dashboard/auth/oauth/return/App246344CLIAPI/'];
        expect(pickReturnTo(zap, zap[0], null, 'https://zapier.com/editor/1')).toBe(zap[0]);
    });
});
