// Catálogo público e inmutable del bundle legal exigido al crear una cuenta.
//
// `artifactSha256` identifica exclusivamente el <main class="legal-page"> ya
// renderizado para esa ruta/idioma. No es el hash del archivo Astro compartido:
// dos traducciones del mismo documento deben producir evidencia distinta.
// Los textos completos viven en src/content/legal/<locale>/*.md; las páginas
// solo componen el chrome. El adaptador html-snapshot preserva los bytes legados.
// `npm run security:legal` recalcula los cuatro hashes desde el build y falla si
// alguien cambia el texto sin publicar una versión nueva.

export const LEGAL_LOCALES = ['es-MX', 'en-US'] as const;
export type LegalLocale = typeof LEGAL_LOCALES[number];

export type SignupLegalDocument = {
  docId: 'terms' | 'privacy';
  version: string;
  locale: LegalLocale;
  jurisdiction: 'GLOBAL';
  action: 'accepted' | 'acknowledged';
  href: string;
  artifactSha256: string;
};

export type SignupLegalBundle = {
  id: string;
  locale: LegalLocale;
  terms: SignupLegalDocument;
  privacy: SignupLegalDocument;
};

const TERMS_VERSION = '2026-09-28';
const PRIVACY_VERSION = '2026-09-28';

export const SIGNUP_LEGAL_BUNDLES: Record<LegalLocale, SignupLegalBundle> = {
  'es-MX': {
    id: `signup-terms-${TERMS_VERSION}-privacy-${PRIVACY_VERSION}-es-MX`,
    locale: 'es-MX',
    terms: {
      docId: 'terms', version: TERMS_VERSION, locale: 'es-MX', jurisdiction: 'GLOBAL',
      action: 'accepted', href: '/terminos',
      artifactSha256: 'c4cb2d15e207a20144620f7e3ab28e698b561ab5e65cbe916938caf8ee265260',
    },
    privacy: {
      docId: 'privacy', version: PRIVACY_VERSION, locale: 'es-MX', jurisdiction: 'GLOBAL',
      action: 'acknowledged', href: '/privacidad',
      artifactSha256: '1d4eed2370b940fb289f254ae24e06078dc522da5e0f0bbb05b067e4d85d70e3',
    },
  },
  'en-US': {
    id: `signup-terms-${TERMS_VERSION}-privacy-${PRIVACY_VERSION}-en-US`,
    locale: 'en-US',
    terms: {
      docId: 'terms', version: TERMS_VERSION, locale: 'en-US', jurisdiction: 'GLOBAL',
      action: 'accepted', href: '/en/terminos',
      artifactSha256: 'b01410ff26503b98e6dcba483652b1f47cdd65d0f9795977096f544fae439ddb',
    },
    privacy: {
      docId: 'privacy', version: PRIVACY_VERSION, locale: 'en-US', jurisdiction: 'GLOBAL',
      action: 'acknowledged', href: '/en/privacidad',
      artifactSha256: 'ec1e0d6f448dc1f2f2e125a88ba8d602bc4d4f4ac6260450d46f09ca72afb44d',
    },
  },
};

export function isLegalLocale(value: unknown): value is LegalLocale {
  return typeof value === 'string' && LEGAL_LOCALES.includes(value as LegalLocale);
}

export function signupLegalBundle(locale: LegalLocale): SignupLegalBundle {
  return SIGNUP_LEGAL_BUNDLES[locale];
}
