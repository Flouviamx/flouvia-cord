import { describe, expect, it } from 'vitest';
import { APP_LOCALES, AUTH_EMAIL_LOCALES, PUBLIC_LOCALES, browserLocales, normalizeLocale, resolveLocale } from '../src/i18n/locales';
import { getLangFromUrl } from '../src/i18n/utils';
import { reqContext, currentAuthEmailLocale, currentLocale, setRequestLocale } from '../src/lib/context';

describe('idiomas por superficie', () => {
    it.each([['pt-BR', 'pt'], ['pt-PT', 'pt'], ['fr-CA', 'fr'], ['de-AT', 'de'], ['ES-mx', 'es'], ['en-GB', 'en']])('normaliza %s a %s', (tag, expected) => {
        expect(normalizeLocale(tag)).toBe(expected);
    });

    it.each(['constructor', '__proto__', 'toString', 'es_MX', '../de', 'jp', '', null])('no confunde %s con un idioma', (tag) => {
        expect(normalizeLocale(tag)).toBeNull();
    });

    it('no usa propiedades del prototipo como rutas traducidas', () => {
        expect(getLangFromUrl(new URL('https://cordhq.app/constructor'))).toBe('es');
    });

    it('respeta pesos, exclusiones y orden estable; rechaza pesos malformados', () => {
        expect(browserLocales('fr-CA;q=0.8,de-DE;q=1,pt;q=0,es;q=0.8')).toEqual(['de', 'fr', 'es']);
        expect(browserLocales('de;q=2,pt;q=0.9oops,fr;q=-1,en;q=0.2;q=0.9,es')).toEqual(['es']);
        expect(browserLocales('de;q=0.1234,pt;Q=0.9,fr;q=wat')).toEqual(['pt']);
    });

    it('mantiene la elección manual aunque el navegador cambie', () => {
        expect(resolveLocale({ available: AUTH_EMAIL_LOCALES, saved: 'pt-BR', browser: 'de,en;q=0.9' })).toBe('pt');
        expect(resolveLocale({ available: AUTH_EMAIL_LOCALES, saved: 'en', browser: 'fr' })).toBe('en');
    });

    it('no habilita traducciones incompletas de landing ni dashboard', () => {
        for (const available of [PUBLIC_LOCALES, APP_LOCALES]) {
            expect(resolveLocale({ available, saved: 'de', browser: 'de-DE,en;q=0.8' })).toBe('en');
        }
        expect(resolveLocale({ available: AUTH_EMAIL_LOCALES, browser: 'de-DE,en;q=0.8' })).toBe('de');
    });

    it('usa fallbacks explícitos y falla con una superficie vacía', () => {
        expect(resolveLocale({ available: AUTH_EMAIL_LOCALES, browser: 'ja-JP' })).toBe('en');
        expect(resolveLocale({ available: AUTH_EMAIL_LOCALES, browser: '*' })).toBe('es');
        expect(resolveLocale({ available: AUTH_EMAIL_LOCALES })).toBe('es');
        expect(() => resolveLocale({ available: [] })).toThrow();
    });

    it('aísla idioma personal del de la org y entre peticiones concurrentes', async () => {
        await Promise.all(['pt', 'fr', 'de'].map((locale) => reqContext.run({ userId: null, authEmailLocale: normalizeLocale(locale)! }, async () => {
            setRequestLocale('en');
            await Promise.resolve();
            expect(currentAuthEmailLocale()).toBe(locale);
            expect(currentLocale()).toBe('en');
        })));
        expect(currentAuthEmailLocale()).toBe('es');
    });
});
