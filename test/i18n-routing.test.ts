import { describe, expect, it } from 'vitest';
import {
  canonicalPathForInvalidEnglishRoute,
  preferredPublicLang,
  publicPath,
} from '../src/i18n/utils';

describe('preferredPublicLang', () => {
  it('uses the browser preference weights for Spanish and English', () => {
    expect(preferredPublicLang('en-US,en;q=0.9,es;q=0.8')).toBe('en');
    expect(preferredPublicLang('fr-FR,es-MX;q=0.9,en;q=0.8')).toBe('es');
  });

  it('falls back safely for unsupported or absent language headers', () => {
    expect(preferredPublicLang('fr-FR,fr;q=0.9')).toBe('en');
    expect(preferredPublicLang('*')).toBe('es');
    expect(preferredPublicLang(null)).toBe('es');
  });
});

describe('publicPath', () => {
  it('localizes only routes that have a real English page', () => {
    expect(publicPath('/', 'en')).toBe('/en');
    expect(publicPath('/precios', 'en')).toBe('/en/precios');
    expect(publicPath('/producto/editor?plan=pro', 'en')).toBe('/en/producto/editor?plan=pro');
    expect(publicPath('/soporte/categoria/pagos', 'en')).toBe('/en/support/category/pagos');
  });

  it('keeps app, auth, public-token, and untranslated routes global', () => {
    expect(publicPath('/app', 'en')).toBe('/app');
    expect(publicPath('/sign-in', 'en')).toBe('/sign-in');
    expect(publicPath('/q/demo', 'en')).toBe('/q/demo');
    expect(publicPath('/casos-de-uso/agencias', 'en')).toBe('/casos-de-uso/agencias');
  });

  it('normalizes the old registro alias to the real signup route', () => {
    expect(publicPath('/registro', 'es')).toBe('/sign-up');
    expect(publicPath('/registro', 'en')).toBe('/sign-up');
  });
});

describe('canonicalPathForInvalidEnglishRoute', () => {
  it('recovers old links that incorrectly prefixed global routes with /en', () => {
    expect(canonicalPathForInvalidEnglishRoute('/en/app/cotizaciones')).toBe('/app/cotizaciones');
    expect(canonicalPathForInvalidEnglishRoute('/en/sign-in')).toBe('/sign-in');
    expect(canonicalPathForInvalidEnglishRoute('/en/registro')).toBe('/sign-up');
    expect(canonicalPathForInvalidEnglishRoute('/en/q/demo')).toBe('/q/demo');
    expect(canonicalPathForInvalidEnglishRoute('/en/casos-de-uso/agencias')).toBe('/casos-de-uso/agencias');
  });

  it('does not rewrite real English pages', () => {
    expect(canonicalPathForInvalidEnglishRoute('/en/precios')).toBeNull();
    expect(canonicalPathForInvalidEnglishRoute('/en/producto/editor')).toBeNull();
    expect(canonicalPathForInvalidEnglishRoute('/en/support')).toBeNull();
  });
});
