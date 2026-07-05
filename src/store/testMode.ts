import { atom } from 'nanostores';

// Entorno de PRUEBA (tipo Stripe). La FUENTE DE VERDAD es la cookie
// `cord_test_mode` — el middleware la lee en el servidor y getActiveOrgId()
// resuelve la org SANDBOX espejo (datos 100% aislados). El localStorage se
// mantiene como espejo para los consumidores de cliente (ej. api.astro).
const COOKIE = 'cord_test_mode';

const readCookie = () =>
  typeof document !== 'undefined' &&
  document.cookie.split('; ').some((c) => c === `${COOKIE}=1`);

// Helper para leer el estado inicial (cookie manda; localStorage es fallback)
const getInitialState = () => {
  if (typeof window === 'undefined') return false;
  if (readCookie()) return true;
  // Migración de sesiones viejas: si solo existe el localStorage, NO lo
  // respetamos como "encendido" (el server nunca lo vio) — lo apagamos.
  if (localStorage.getItem(COOKIE) === 'true' && !readCookie()) {
    localStorage.setItem(COOKIE, 'false');
  }
  return false;
};

// Atom principal
export const $isTestMode = atom<boolean>(getInitialState());

// Persistir cookie (server-side truth) + localStorage (espejo cliente)
if (typeof window !== 'undefined') {
  $isTestMode.listen((value) => {
    document.cookie = value
      ? `${COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`
      : `${COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    localStorage.setItem(COOKIE, String(value));
    // Disparar evento para que vanilla JS (ej. api.astro) pueda reaccionar
    window.dispatchEvent(new CustomEvent('cord:test_mode_changed', { detail: { isTestMode: value } }));
  });
}

/**
 * Activa/desactiva el modo de prueba Y navega para que el servidor re-resuelva
 * la org (sandbox ↔ real). Si la página actual es el detalle de una entidad
 * (UUID en la ruta) se va al dashboard — esa entidad no existe en el otro entorno.
 */
export function toggleTestMode(next: boolean) {
  $isTestMode.set(next);
  const path = window.location.pathname;
  const hasEntityId = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(path);
  window.location.assign(hasEntityId || !path.startsWith('/app') ? '/app' : path);
}
