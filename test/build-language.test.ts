import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUILD_EN, buildText } from '../src/i18n/build';

describe('Build shared translations', () => {
  it('keeps Spanish and English copy together', () => {
    expect(buildText('es')('Tu marca en la próxima etapa de Cord.')).toBe('Tu marca en la próxima etapa de Cord.');
    expect(buildText('en')('Tu marca en la próxima etapa de Cord.')).toBe('Your brand. Cord’s next chapter.');
    expect(buildText('en')('Posiciones e historial.')).toBe('Spots and history.');
  });
  it('has translations for every explicit source-copy lookup in the shared page', () => {
    const page = readFileSync(new URL('../src/components/build/BuildPage.astro', import.meta.url), 'utf8');
    for (const match of page.matchAll(/\bt\((?:"([^"]+)"|'([^']+)')\)/g)) {
      const key = match[1] || match[2];
      expect(BUILD_EN[key], key).toBeTruthy();
    }
  });
  it('distinguishes pending refunds from completed refunds in both languages', () => {
    expect(buildText('en')('Oferta superada · reembolso en proceso')).toBe('Outbid · refund in progress');
    expect(buildText('en')('Oferta superada · reembolso procesado')).toBe('Outbid · refund processed');
  });
});
