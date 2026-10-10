// src/i18n/utils.ts
import { ui, defaultLang } from './ui';
import { PUBLIC_LOCALES, resolveLocale } from './locales';

export type PublicLang = keyof typeof ui;

const TRANSLATED_PUBLIC_ROUTES = [
  '/',
  '/blog',
  '/build',
  '/como-funciona',
  '/comparar/facturacion',
  '/contacto/ventas',
  '/desarrolladores',
  '/elements',
  '/integraciones',
  '/precios',
  '/privacidad',
  '/producto',
  '/roadmap',
  '/soluciones/empresas',
  '/soluciones/startups',
  '/terminos',
] as const;

const GLOBAL_ROUTE_PREFIXES = [
  '/app',
  '/billing',
  '/embed',
  '/forgot-password',
  '/i',
  '/onboarding',
  '/q',
  '/reset-password',
  '/sign-in',
  '/sign-up',
  '/unirse',
  '/verificar-identidad',
  '/verify-2fa',
  '/verify-email',
] as const;

function routeMatches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function splitPathSuffix(path: string): { pathname: string; suffix: string } {
  const suffixAt = path.search(/[?#]/);
  if (suffixAt === -1) return { pathname: path || '/', suffix: '' };
  return {
    pathname: path.slice(0, suffixAt) || '/',
    suffix: path.slice(suffixAt),
  };
}

export type PublicAlternates = { es?: string; en?: string };

const ES_ONLY_PREFIXES = ['/casos-de-uso'] as const;

export function cleanPathname(pathname: string): string {
  const path = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : '/';
}

export function publicAlternates(url: URL): PublicAlternates | null {
  const { esUrl, enUrl } = altLangUrls(url);
  if (GLOBAL_ROUTE_PREFIXES.some((route) => routeMatches(esUrl, route))) return null;
  if (ES_ONLY_PREFIXES.some((route) => routeMatches(esUrl, route))) return { es: esUrl };
  return { es: esUrl, en: enUrl };
}

export function languageSwitchTargets(url: URL, alternates: PublicAlternates | null | undefined) {
  const fallback = altLangUrls(url);
  if (!alternates) return fallback;
  const section = `/${(alternates.es ?? fallback.esUrl).split('/')[1] ?? ''}`;
  const enSection = section !== '/' && TRANSLATED_PUBLIC_ROUTES.some((route) => route === section) ? `/en${section}` : '/en';
  return {
    esUrl: alternates.es ?? '/',
    enUrl: alternates.en ?? enSection,
    lang: fallback.lang,
  };
}

export function getLangFromUrl(url: URL): PublicLang {
  const [, lang] = url.pathname.split('/');
  if (Object.hasOwn(ui, lang)) return lang as keyof typeof ui;
  return defaultLang;
}

/**
 * Elige entre los dos idiomas que Cord realmente sirve usando Accept-Language.
 * Respeta pesos q= y, si el dispositivo no declara español ni inglés, usa
 * inglés como fallback internacional. Un header vacío conserva español para
 * crawlers y clientes que no expresan preferencia.
 */
export function preferredPublicLang(header: string | null | undefined): PublicLang {
  return resolveLocale({ available: PUBLIC_LOCALES, browser: header });
}

/**
 * Construye links de la landing sin inventar rutas /en que no existen.
 * La aplicación, auth, links públicos y casos de uso comparten una sola URL;
 * solo las familias incluidas en TRANSLATED_PUBLIC_ROUTES reciben /en.
 */
export function publicPath(path: string, lang: PublicLang): string {
  const { pathname: rawPathname, suffix } = splitPathSuffix(path);
  const pathname = rawPathname === '/registro' ? '/sign-up' : rawPathname;

  if (lang === defaultLang) return `${pathname}${suffix}`;
  if (pathname === '/soporte' || pathname.startsWith('/soporte/')) {
    return `${pathname.replace(/^\/soporte/, '/en/support').replace('/categoria/', '/category/')}${suffix}`;
  }
  if (GLOBAL_ROUTE_PREFIXES.some((route) => routeMatches(pathname, route))) {
    return `${pathname}${suffix}`;
  }
  if (TRANSLATED_PUBLIC_ROUTES.some((route) => routeMatches(pathname, route))) {
    return `/en${pathname === '/' ? '' : pathname}${suffix}`;
  }
  return `${pathname}${suffix}`;
}

/**
 * Recupera URLs antiguas generadas por el helper que prefijaba absolutamente
 * todo con /en. Devuelve null cuando la ruta /en sí es una traducción real.
 */
export function canonicalPathForInvalidEnglishRoute(pathname: string): string | null {
  if (!pathname.startsWith('/en/')) return null;
  const unprefixed = pathname.slice(3) || '/';

  if (unprefixed === '/registro') return '/sign-up';
  if (GLOBAL_ROUTE_PREFIXES.some((route) => routeMatches(unprefixed, route))) return unprefixed;
  if (routeMatches(unprefixed, '/casos-de-uso')) return unprefixed;
  return null;
}

export function languagePreferenceUrl(path: string, lang: PublicLang): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}lang=${lang}`;
}

export function useTranslations(lang: keyof typeof ui) {
  return function t(key: keyof typeof ui[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  };
}

// Devuelve {esUrl, enUrl} equivalentes a la ruta actual, conservando el resto
// del path. Español = sin prefijo (/), inglés = /en/...  (mismo patrón flouvia).
export function altLangUrls(url: URL) {
  let pathname = cleanPathname(url.pathname);
  const lang = getLangFromUrl(url);
  
  let esUrl = lang === 'en' ? pathname.replace(/^\/en/, '') || '/' : pathname;
  let enUrl = lang === 'es' ? (pathname === '/' ? '/en' : '/en' + pathname) : pathname;

  // Fix support center routes mapping
  if (esUrl.startsWith('/support')) {
    esUrl = esUrl.replace('/support', '/soporte');
    esUrl = esUrl.replace('/category/', '/categoria/');
  }
  if (enUrl.includes('/en/soporte')) {
    enUrl = enUrl.replace('/en/soporte', '/en/support');
    enUrl = enUrl.replace('/categoria/', '/category/');
  }

  return { esUrl, enUrl, lang };
}
