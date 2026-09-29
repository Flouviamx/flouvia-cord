import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIGNUP_LEGAL_BUNDLES } from '../src/lib/legal-corpus';

// La revisión 2026-08-30.1 se publicó como 2026-09-28. Estas aserciones eran
// de la propuesta y ahora protegen el texto publicado: que no vuelvan las
// afirmaciones retiradas y que se conserven las correcciones.
function body(locale: string, docId: string) {
  const source = readFileSync(new URL(`../src/content/legal/${locale}/${docId}.md`, import.meta.url), 'utf8');
  return source.split('\n---\n').slice(1).join('\n---\n');
}

describe('versión publicada 2026-09-28 de términos y aviso', () => {
  it('el catálogo apunta a la versión nueva', () => {
    for (const locale of ['es-MX', 'en-US'] as const) {
      expect(SIGNUP_LEGAL_BUNDLES[locale].terms.version).toBe('2026-09-28');
      expect(SIGNUP_LEGAL_BUNDLES[locale].privacy.version).toBe('2026-09-28');
    }
  });

  it('no conserva el aviso de borrador ni marcadores de publicación', () => {
    for (const locale of ['es-MX', 'en-US']) {
      for (const docId of ['terms', 'privacy']) {
        const text = body(locale, docId);
        expect(text).not.toMatch(/BORRADOR TÉCNICO|TECHNICAL DRAFT|Propuesta de revisión|Proposed revision/);
        expect(text).not.toMatch(/antes de publicar esta revisión|before publishing this revision/);
      }
    }
  });

  it('mantiene retiradas las afirmaciones sin sustento y las correcciones de fondo', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const terms = body(locale, 'terms');
      const privacy = body(locale, 'privacy');
      expect(terms).not.toMatch(/<strong>(no bloqueará|will not block)<\/strong>/);
      expect(terms).not.toMatch(/CORD (?:no se responsabiliza del tono|is not liable for the tone)/);
      expect(privacy).not.toMatch(/25%|conforme a la normativa de prevención de lavado|as required by anti-money-laundering|corporate consent|consentimiento corporativo/);
      expect(terms).toContain(locale === 'es-MX' ? 'interés moratorio automático está deshabilitado' : 'Automatic late interest is disabled');
      expect(terms).toContain(locale === 'es-MX' ? 'procesamiento programado diario' : 'daily scheduled processing');
      expect(privacy).toContain(locale === 'es-MX' ? 'antes de la presentación final' : 'before the final dispute response');
      expect(privacy).toContain('hashes');
    }
  });

  it('declara el uso limitado de los datos de Google y las integraciones', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const privacy = body(locale, 'privacy');
      const terms = body(locale, 'terms');
      expect(privacy).toContain('api-services-user-data-policy');
      expect(privacy).toMatch(/Uso Limitado|Limited Use/);
      expect(privacy).toContain('QuickBooks');
      expect(terms).toMatch(/Correo enviado desde su cuenta|Email sent from your account/);
    }
  });
});
