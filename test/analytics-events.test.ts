import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ANALYTICS_EVENTS,
  ANALYTICS_VERSION,
  AUTO_PROPS,
  EVENT_NAMES,
  ONBOARDING_CASOS_USO,
  ONBOARDING_INDUSTRIAS,
  ONBOARDING_PUESTOS,
  ONBOARDING_TAMANOS,
  SETUP_GROUPS,
  SETUP_TASKS,
  isEventName,
} from '../src/lib/analytics-events';

// El catálogo es la fuente de verdad de la analítica. Estas pruebas cubren lo
// que ni el compilador ni `scripts/analytics-contract-check.mjs` ven: que los
// enums duplicados sigan iguales a su origen, y que ninguna entrada esté mal
// formada de una manera que el `satisfies` no atrapa.

describe('catálogo de eventos — integridad', () => {
  const RAILS = new Set(['quote', 'invoice', 'billing', 'auth', 'team', 'adoption', 'docs']);

  it('todo evento tiene rail válido, descripción y since coherente', () => {
    for (const [name, spec] of Object.entries(ANALYTICS_EVENTS)) {
      expect(RAILS.has(spec.rail), `${name}: rail`).toBe(true);
      expect(spec.description.trim().length, `${name}: descripción vacía`).toBeGreaterThan(10);
      expect(spec.since, `${name}: since`).toBeLessThanOrEqual(ANALYTICS_VERSION);
      expect(['server', 'client'], `${name}: surface`).toContain(spec.surface);
      expect(['org', 'user'], `${name}: scope`).toContain(spec.scope);
    }
  });

  it('required y optional nunca comparten una clave', () => {
    for (const [name, spec] of Object.entries(ANALYTICS_EVENTS)) {
      const overlap = Object.keys(spec.required).filter((k) => k in spec.optional);
      expect(overlap, `${name}: claves en required y optional`).toEqual([]);
    }
  });

  it('un evento de ingreso SIEMPRE declara clave de idempotencia', () => {
    for (const [name, spec] of Object.entries(ANALYTICS_EVENTS)) {
      if (spec.revenue) {
        expect(spec.insertIdFrom, `${name}: revenue sin insertIdFrom`).not.toBeNull();
      }
    }
  });

  it('insertIdFrom apunta a una propiedad declarada del evento', () => {
    for (const [name, spec] of Object.entries(ANALYTICS_EVENTS)) {
      if (spec.insertIdFrom) {
        const declared = spec.insertIdFrom in spec.required || spec.insertIdFrom in spec.optional;
        expect(declared, `${name}: insertIdFrom "${spec.insertIdFrom}" no está en required/optional`).toBe(true);
      }
    }
  });

  it('ningún evento declara una AUTO_PROP como propiedad propia', () => {
    for (const [name, spec] of Object.entries(ANALYTICS_EVENTS)) {
      for (const auto of AUTO_PROPS) {
        expect(auto in spec.required, `${name}: required incluye AUTO_PROP ${auto}`).toBe(false);
        expect(auto in spec.optional, `${name}: optional incluye AUTO_PROP ${auto}`).toBe(false);
      }
    }
  });

  it('las tuplas de enum no están vacías', () => {
    for (const [name, spec] of Object.entries(ANALYTICS_EVENTS)) {
      for (const [key, type] of Object.entries({ ...spec.required, ...spec.optional })) {
        if (Array.isArray(type)) {
          expect(type.length, `${name}.${key}: enum vacío`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('isEventName reconoce el catálogo y rechaza lo demás', () => {
    for (const name of EVENT_NAMES) expect(isEventName(name)).toBe(true);
    expect(isEventName('quote_aproved')).toBe(false);
    expect(isEventName('')).toBe(false);
  });
});

describe('enums duplicados — paridad con su origen', () => {
  // `src/pages/api/onboarding/complete.ts` redeclara estas listas como allowlist
  // del schema Zod. Si divergen, el evento onboarding_completed empezaría a
  // reportar valores que el endpoint rechaza (o al revés).
  const onboarding = readFileSync(
    new URL('../src/pages/api/onboarding/complete.ts', import.meta.url), 'utf8',
  );

  function tupleFromSource(name: string): string[] {
    const m = onboarding.match(new RegExp(`const ${name} = \\[([^\\]]+)\\] as const`));
    if (!m) throw new Error(`no se encontró ${name} en onboarding/complete.ts`);
    return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }

  it('PUESTOS', () => expect([...ONBOARDING_PUESTOS]).toEqual(tupleFromSource('PUESTOS')));
  it('INDUSTRIAS', () => expect([...ONBOARDING_INDUSTRIAS]).toEqual(tupleFromSource('INDUSTRIAS')));
  it('TAMANOS', () => expect([...ONBOARDING_TAMANOS]).toEqual(tupleFromSource('TAMANOS')));
  it('CASOS_USO', () => expect([...ONBOARDING_CASOS_USO]).toEqual(tupleFromSource('CASOS_USO')));
});

describe('enums de la guía de configuración', () => {
  // Deben coincidir con getSetupProgress() en src/lib/queries.ts.
  it('grupos y tareas esperados', () => {
    expect([...SETUP_GROUPS]).toEqual(['negocio', 'catalogo', 'venta', 'dinero', 'equipo']);
    expect([...SETUP_TASKS]).toEqual([
      'marca', 'fiscal', 'documento', 'productos', 'clientes',
      'cotizacion', 'enviar', 'online_cobros', 'cobro', 'equipo',
    ]);
  });
});
