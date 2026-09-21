import { describe, expect, it } from 'vitest';
import { isAllowedMutationOrigin, isCsrfExemptWrite } from '../src/lib/csrf-policy';

describe('CSRF y endpoints OAuth', () => {
    it('token y revoke son exentos: los llama un servidor sin Origin, con secreto de cliente', () => {
        expect(isCsrfExemptWrite('/api/oauth/token', 'POST')).toBe(true);
        expect(isCsrfExemptWrite('/api/oauth/revoke', 'POST')).toBe(true);
    });

    it('la decisión del consentimiento NO es exenta: es un formulario con sesión', () => {
        expect(isCsrfExemptWrite('/api/oauth/authorize', 'POST')).toBe(false);
        expect(isAllowedMutationOrigin('/api/oauth/authorize', null, 'https://cordhq.app', 'https://cordhq.app')).toBe(false);
        expect(isAllowedMutationOrigin('/api/oauth/authorize', 'https://evil.test', 'https://cordhq.app', 'https://cordhq.app')).toBe(false);
        expect(isAllowedMutationOrigin('/api/oauth/authorize', 'https://cordhq.app', 'https://cordhq.app', 'https://cordhq.app')).toBe(true);
    });
});
