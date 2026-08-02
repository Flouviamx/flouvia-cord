// src/lib/escape.ts — escape de HTML para contenido dinámico inyectado por JS
// (innerHTML) con datos que pueden venir de otro usuario/tenant (nombres de
// producto/cliente en Cmd+K, términos de búsqueda, notificaciones...). El
// proyecto históricamente solo escapaba `<` en un par de sitios — esto cubre
// las 5 entidades HTML relevantes.
export function escapeHtml(input: unknown): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
