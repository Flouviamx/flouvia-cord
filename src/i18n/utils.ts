// src/i18n/utils.ts
import { ui, defaultLang } from './ui';

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in ui) return lang as keyof typeof ui;
  return defaultLang;
}

export function useTranslations(lang: keyof typeof ui) {
  return function t(key: keyof typeof ui[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  };
}

// Devuelve {esUrl, enUrl} equivalentes a la ruta actual, conservando el resto
// del path. Español = sin prefijo (/), inglés = /en/...  (mismo patrón flouvia).
export function altLangUrls(url: URL) {
  const pathname = url.pathname;
  const lang = getLangFromUrl(url);
  const esUrl = lang === 'en' ? pathname.replace(/^\/en/, '') || '/' : pathname;
  const enUrl = lang === 'es' ? '/en' + pathname : pathname;
  return { esUrl, enUrl, lang };
}
