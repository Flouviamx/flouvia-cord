import { describe, expect, it } from 'vitest';
import {
    createConfirmationToken,
    hashConfirmationToken,
    isConfirmationToken,
    normalizeBlogLocale,
} from '../src/lib/blog-newsletter';

describe('blog newsletter confirmation tokens', () => {
    it('creates URL-safe random tokens and stores only their SHA-256 hash', () => {
        const first = createConfirmationToken();
        const second = createConfirmationToken();

        expect(isConfirmationToken(first.token)).toBe(true);
        expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
        expect(first.hash).toBe(hashConfirmationToken(first.token));
        expect(second.token).not.toBe(first.token);
        expect(first.hash).not.toContain(first.token);
    });

    it('rejects malformed confirmation tokens', () => {
        expect(isConfirmationToken('')).toBe(false);
        expect(isConfirmationToken('a'.repeat(42))).toBe(false);
        expect(isConfirmationToken(`${'a'.repeat(42)}!`)).toBe(false);
    });
});

describe('blog newsletter locale', () => {
    it('accepts English explicitly and defaults every other value to Spanish', () => {
        expect(normalizeBlogLocale('en')).toBe('en');
        expect(normalizeBlogLocale('es')).toBe('es');
        expect(normalizeBlogLocale('fr')).toBe('es');
        expect(normalizeBlogLocale(undefined)).toBe('es');
    });
});
