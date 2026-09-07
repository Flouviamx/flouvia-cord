export type AnalyticsRouteRule = {
  prefix: string;
  replacement: string;
};

// Solo rutas cuyo segmento dinámico puede ser un identificador de negocio,
// una credencial portadora o una referencia interna. Slugs editoriales no se
// redactan: no contienen datos de cuenta y siguen siendo útiles en analítica.
export const ANALYTICS_PRIVATE_ROUTE_RULES: readonly AnalyticsRouteRule[] = [
  { prefix: '/app/clientes/', replacement: '/app/clientes/[id]' },
  { prefix: '/app/cotizaciones/', replacement: '/app/cotizaciones/[id]' },
  { prefix: '/app/facturas/', replacement: '/app/facturas/[id]' },
  { prefix: '/app/productos/', replacement: '/app/productos/[id]' },
  { prefix: '/app/cobros/disputas/', replacement: '/app/cobros/disputas/[id]' },
  { prefix: '/app/ajustes/sso/', replacement: '/app/ajustes/sso/[id]' },
  { prefix: '/q/', replacement: '/q/[token]' },
  { prefix: '/i/', replacement: '/i/[token]' },
  { prefix: '/embed/', replacement: '/embed/[token]' },
  { prefix: '/unirse/', replacement: '/unirse/[token]' },
  { prefix: '/verificar-identidad/', replacement: '/verificar-identidad/[token]' },
] as const;

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;
const HIGH_ENTROPY_SEGMENT = /\/[A-Za-z0-9_-]{32,}(?=\/|$)/g;

export function redactAnalyticsUrl(
  rawUrl: string,
  origin = 'https://cordhq.app',
  rules: readonly AnalyticsRouteRule[] = ANALYTICS_PRIVATE_ROUTE_RULES,
): string {
  const parsed = new URL(rawUrl, origin);
  const matched = rules.find((rule) => parsed.pathname.startsWith(rule.prefix));
  if (matched) {
    parsed.pathname = matched.replacement;
  } else {
    parsed.pathname = parsed.pathname
      .replace(UUID_SEGMENT, '/[id]')
      .replace(HIGH_ENTROPY_SEGMENT, '/[token]');
  }

  // Las búsquedas de la app pueden contener nombres, correos o referencias. La
  // analítica contractual necesita la ruta agregada, no el query string.
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

