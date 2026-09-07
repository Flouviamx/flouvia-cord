import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { redactAnalyticsUrl, ANALYTICS_PRIVATE_ROUTE_RULES } from '../src/lib/privacy-safe-analytics';

describe('Vercel Analytics path redaction', () => {
  it('redacts business identifiers and drops query strings', () => {
    expect(redactAnalyticsUrl('https://cordhq.app/app/clientes/6d2af137-8b55-4b19-92be-f876cc4dc9a1?email=person@example.com'))
      .toBe('https://cordhq.app/app/clientes/[id]');
    expect(redactAnalyticsUrl('/app/cobros/disputas/dp_very_sensitive_reference?return=/app'))
      .toBe('https://cordhq.app/app/cobros/disputas/[id]');
  });

  it('redacts bearer-token routes', () => {
    expect(redactAnalyticsUrl('/verificar-identidad/abcdefghijklmnopqrstuvwxyz123456'))
      .toBe('https://cordhq.app/verificar-identidad/[token]');
    expect(redactAnalyticsUrl('/q/demo')).toBe('https://cordhq.app/q/[token]');
  });

  it('keeps editorial slugs while removing attribution parameters', () => {
    expect(redactAnalyticsUrl('/blog/guia-cfdi?utm_source=test'))
      .toBe('https://cordhq.app/blog/guia-cfdi');
  });
});

// El `<script is:inline>` de src/components/CordAnalytics.astro no puede importar
// módulos, así que replica redactAnalyticsUrl() como `cordScrubUrl` para el
// before_send de PostHog. Un `<script is:inline>` que raspa distinto del helper
// es una fuga esperando a ocurrir: aquí se extrae ESA función, se evalúa y se
// afirma que coincide con el helper canónico.
function extractCordScrubUrl(): (raw: string) => string {
  const src = readFileSync(new URL('../src/components/CordAnalytics.astro', import.meta.url), 'utf8');
  const m = src.match(/function cordScrubUrl\(raw\) \{[\s\S]*?\n {2}\}/);
  if (!m) throw new Error('no se encontró cordScrubUrl en CordAnalytics.astro');
  // eslint-disable-next-line no-new-func
  const factory = new Function('analyticsRouteRules', 'location', `${m[0]}; return cordScrubUrl;`);
  return factory(ANALYTICS_PRIVATE_ROUTE_RULES, { origin: 'https://cordhq.app' });
}

describe('PostHog before_send URL scrub — paridad con redactAnalyticsUrl', () => {
  const CASES = [
    'https://cordhq.app/q/f44a54fdb4ac4511d27aca8d2432c007',
    'https://cordhq.app/i/ypuui7ni4mssyedayjbheet9euz9rjwg/pay',
    'https://cordhq.app/app/cotizaciones/5a4ae419-12cc-44ed-87af-78abe6d33fbc?tab=x',
    'https://cordhq.app/app/productos/90e8a4d5-7971-4ba8-8c1a-769e48f30014',
    'https://cordhq.app/unirse/abcdefghijklmnopqrstuvwxyz012345',
    'https://cordhq.app/precios?utm_source=ph#top',
    'https://cordhq.app/blog/guia-cfdi',
  ];

  it('CordAnalytics.astro coincide con el helper', () => {
    const scrub = extractCordScrubUrl();
    for (const url of CASES) {
      expect(scrub(url), url).toBe(redactAnalyticsUrl(url));
    }
  });
});

