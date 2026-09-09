import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registerSchema } from '../src/lib/validation';
import { SIGNUP_LEGAL_BUNDLES, signupLegalBundle } from '../src/lib/legal-corpus';

describe('bundle legal de alta', () => {
  it('separa contratación de reconocimiento del aviso', () => {
    for (const bundle of Object.values(SIGNUP_LEGAL_BUNDLES)) {
      expect(bundle.terms.action).toBe('accepted');
      expect(bundle.privacy.action).toBe('acknowledged');
      expect(bundle.terms.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(bundle.privacy.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(bundle.terms.artifactSha256).not.toBe(bundle.privacy.artifactSha256);
    }
  });

  it('no reutiliza un hash entre idiomas', () => {
    const variants = Object.values(SIGNUP_LEGAL_BUNDLES)
      .flatMap((bundle) => [bundle.terms, bundle.privacy]);
    expect(new Set(variants.map((variant) => variant.artifactSha256)).size).toBe(4);
  });

  it('mantiene URLs legales explícitas por idioma', () => {
    expect(signupLegalBundle('es-MX').terms.href).toBe('/terminos');
    expect(signupLegalBundle('en-US').terms.href).toBe('/en/terminos');
    expect(signupLegalBundle('es-MX').privacy.href).toBe('/privacidad');
    expect(signupLegalBundle('en-US').privacy.href).toBe('/en/privacidad');
  });
});

describe('contrato de la API de registro', () => {
  const base = {
    email: 'persona@example.com', password: 'correct-horse-battery-staple',
    firstName: 'Persona', lastName: 'Prueba', legalLocale: 'es-MX' as const,
  };

  it('rechaza el alta si falta cualquiera de los dos actos', () => {
    expect(registerSchema.safeParse({ ...base, termsAccepted: true }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, privacyAcknowledged: true }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, termsAccepted: false, privacyAcknowledged: true }).success).toBe(false);
  });

  it('acepta únicamente ambos actos afirmativos y un locale publicado', () => {
    const valid = { ...base, termsAccepted: true, privacyAcknowledged: true };
    expect(registerSchema.safeParse(valid).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, legalLocale: 'pt-BR' }).success).toBe(false);
  });
});

describe('persistencia de evidencia', () => {
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

  it('incluye la variante y protege el carril de escritura', () => {
    expect(schema).toContain('foreign key (doc_id, version, locale, jurisdiction, artifact_sha256)');
    expect(schema).toMatch(/alter table legal_acceptances force row level security/i);
    expect(schema).toContain('cord_register_password_user');
    expect(schema).toContain('cord_register_oauth_user_with_legal_intent');
  });
});
