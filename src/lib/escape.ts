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

/**
 * JSON listo para ir DENTRO de un `<script type="application/json">` (o de
 * `ld+json`) vía `set:html`.
 *
 * `set:html` emite el valor crudo y `JSON.stringify` no escapa `<`: un nombre
 * de impuesto, de producto o la descripción de una línea con `</script>`
 * cerraba el bloque y lo que seguía se interpretaba como HTML de la página —
 * en el editor, en la sesión de quien lo abriera; en el link público, frente
 * al cliente final. Se escapan `<`, `>` y `&` como secuencias `\u00XX` (el
 * JSON resultante es idéntico al parsearlo) y los separadores U+2028/U+2029,
 * que algunos motores tratan como fin de línea dentro de un script.
 */
export function jsonForScript(value: unknown): string {
    return JSON.stringify(value ?? null)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
