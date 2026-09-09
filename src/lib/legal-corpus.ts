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

const TERMS_VERSION = '2026-08-11';
const PRIVACY_VERSION = '2026-08-29';

export const SIGNUP_LEGAL_BUNDLES: Record<LegalLocale, SignupLegalBundle> = {
  'es-MX': {
    id: `signup-terms-${TERMS_VERSION}-privacy-${PRIVACY_VERSION}-es-MX`,
    locale: 'es-MX',
    terms: {
      docId: 'terms', version: TERMS_VERSION, locale: 'es-MX', jurisdiction: 'GLOBAL',
      action: 'accepted', href: '/terminos',
      artifactSha256: 'caca9992c20c9db7f6270285c57808f9a249d15579a03497b99bc621590db369',
    },
    privacy: {
      docId: 'privacy', version: PRIVACY_VERSION, locale: 'es-MX', jurisdiction: 'GLOBAL',
      action: 'acknowledged', href: '/privacidad',
      artifactSha256: '469dd0c23ed4626059b8869951d8bf8842cfc7e1dc0122b3c1da4652bae6dbf4',
    },
  },
  'en-US': {
    id: `signup-terms-${TERMS_VERSION}-privacy-${PRIVACY_VERSION}-en-US`,
    locale: 'en-US',
    terms: {
      docId: 'terms', version: TERMS_VERSION, locale: 'en-US', jurisdiction: 'GLOBAL',
      action: 'accepted', href: '/en/terminos',
      artifactSha256: '891f4c861dae2d5fcbf93737cb93e8470582b430c01de4ee33220a5e29c18fd7',
    },
    privacy: {
      docId: 'privacy', version: PRIVACY_VERSION, locale: 'en-US', jurisdiction: 'GLOBAL',
      action: 'acknowledged', href: '/en/privacidad',
      artifactSha256: '4f10b3260909d902e7aaacf2ef40c05a000a4ed4a9154176b19050a3e0b9bb10',
    },
  },
};

export function isLegalLocale(value: unknown): value is LegalLocale {
  return typeof value === 'string' && LEGAL_LOCALES.includes(value as LegalLocale);
}

export function signupLegalBundle(locale: LegalLocale): SignupLegalBundle {
  return SIGNUP_LEGAL_BUNDLES[locale];
}
