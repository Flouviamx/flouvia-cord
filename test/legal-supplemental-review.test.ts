import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { legalSupplementalReviewSchema, REVIEWED_SUPPLEMENTAL_DOC_IDS } from '../src/lib/legal-supplemental-review';
import { LEGAL_CORPUS_PLAN } from '../src/lib/legal-corpus-plan';
import { computeFee, FEE_TERMS_VERSION } from '../src/lib/fees';
import { LEGAL_PROVIDERS } from '../src/lib/legal-providers';

// These controlled frontmatters use JSON-compatible values or plain scalars.
// Astro independently parses YAML and validates the full collection on build.
function read(locale: string, docId: string) {
  const path = `src/content/legal/${locale}/${docId}.md`;
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const [header, ...parts] = source.split('\n---\n');
  const data = Object.fromEntries([...header.matchAll(/^(\w+): (.*)$/gm)].map(([, key, raw]) => {
    let value: unknown = raw;
    try { value = JSON.parse(raw); } catch { /* plain YAML scalar */ }
    return [key, value];
  }));
  return { data, body: parts.join('\n---\n'), path };
}

describe('phase 5 supplemental proposals', () => {
  for (const locale of ['es-MX', 'en-US']) {
    for (const docId of REVIEWED_SUPPLEMENTAL_DOC_IDS) {
      it(`${locale}/${docId} is an unpublishable standalone technical draft with source provenance`, () => {
        const { data, body, path } = read(locale, docId);
        expect(legalSupplementalReviewSchema.safeParse(data).success).toBe(true);
        expect(data.sourceOfTruth).toBe(path);
        expect(data.locale).toBe(locale);
        expect(data.docId).toBe(docId);
        expect(data.dependsOn).toEqual(LEGAL_CORPUS_PLAN.find((entry) => entry.docId === docId)?.dependsOn);
        expect((data.sourceSections as string[]).length).toBeGreaterThan(0);
        for (const ref of data.sourceSections as string[]) {
          const [, id, version, anchor] = ref.match(/^([a-z-]+)@([0-9.-]+)#([a-z-]+)$/)!;
          const original = read(locale, id);
          expect(original.data.version).toBe(version);
          expect(original.body).toContain(`id="${anchor}"`);
        }
        expect(body).toContain(locale === 'es-MX' ? 'BORRADOR TÉCNICO' : 'TECHNICAL DRAFT');
        expect([...body.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(body).not.toMatch(/Material fuente extraído|Extracted source material/);
        const evidenceLinks = [...body.matchAll(/\]\(([^)]+\/revisiones-legales\/(?:2026-08-30-payments|2026-09-01-automation|2026-09-01-data-governance)\.md)\)/g)];
        expect(evidenceLinks.length).toBeGreaterThan(0);
        for (const [, target] of evidenceLinks) {
          expect(existsSync(new URL(target, new URL(`../${path}`, import.meta.url)))).toBe(true);
        }
      });
    }
  }

  it.each([
    ['publicationStatus', 'published'], ['publicationStatus', 'retired'],
    ['editorialStage', 'approved'], ['editorialStage', undefined],
    ['artifactSha256', 'a'.repeat(64)], ['requiresAction', true],
    ['action', 'accepted'], ['action', 'acknowledged'],
    ['acceptanceScope', 'organization'], ['supersedes', '2026-08-11'],
    ['releaseBlockers', []], ['sourceKind', 'html-snapshot'],
  ])('rejects accidental activation: %s = %s', (key, value) => {
    const { data } = read('es-MX', 'payments-terms');
    expect(legalSupplementalReviewSchema.safeParse({ ...data, [key]: value }).success).toBe(false);
  });

  it('keeps fee provenance, currency limits and inherited recovery period in both languages', () => {
    expect(computeFee({ amountCents: 10_000_000, metodo: 'spei', moneda: 'MXN' }).blendedTotalCents).toBe(58_812);
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'payments-terms');
      for (const value of [FEE_TERMS_VERSION, '4%', '0.4%', '588.12', 'USD', 'EUR', 'GBP', 'CAD', 'BRL']) expect(body).toContain(value);
      expect(body).toContain(locale === 'es-MX' ? 'cinco días hábiles' : 'five business days');
      expect(body).toContain(locale === 'es-MX' ? 'devolución manual pendiente' : 'pending manual refund');
      expect(body).toContain(locale === 'es-MX' ? 'El interés moratorio automático está deshabilitado' : 'Automatic late interest is disabled');
    }
  });

  it('discloses unresolved fiscal states, not a guarantee of acceptance', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'invoicing-terms');
      expect(body).toContain('authority_submission');
      expect(body).toContain('REP');
      expect(body).toContain(locale === 'es-MX' ? 'procesamiento programado diario' : 'daily scheduled processing');
      expect(body).toContain(locale === 'es-MX' ? 'todas las tasas y retenciones' : 'all configured line-item tax rates and withholdings');
      expect(body).toContain(locale === 'es-MX' ? 'folio sustituto' : 'replacement UUID');
    }
  });

  it('keeps person-specific consent and best-effort retention limitations explicit', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'kyc-aml-policy');
      expect(body).toContain(locale === 'es-MX' ? 'de cada persona identificada' : 'by every identified person');
      expect(body).toContain(locale === 'es-MX' ? 'mejor esfuerzo' : 'best effort');
      expect(body).toContain(locale === 'es-MX' ? 'cinco años' : 'five years');
      expect(body).toContain(locale === 'es-MX' ? 'preservando la orientación' : 'preserving technical orientation');
    }
  });

  it('distinguishes file transfer from final submission and discloses the full IP', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'dispute-evidence-notice');
      expect(body).toContain(locale === 'es-MX' ? 'IP completa' : 'full approval IP');
      expect(body).toContain(locale === 'es-MX' ? 'antes de presentar la respuesta final' : 'before the final response is submitted');
      expect(body).toContain(locale === 'es-MX' ? 'No se adjunta automáticamente el hilo completo' : 'The entire conversation thread is not automatically attached');
      expect(body).toContain(locale === 'es-MX' ? 'no acredita el consentimiento del comprador' : 'does not establish consent by the buyer');
    }
  });

  it('does not present stop requests or inbound collection replies as automatic', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'collections-notice');
      expect(body).toContain(locale === 'es-MX' ? 'solicitud, no una baja instantánea' : 'request, not an instant Cord-enforced unsubscribe');
      expect(body).toContain(locale === 'es-MX' ? 'recepción automática de respuestas' : 'Automated inbound replies');
      expect(body).toContain(locale === 'es-MX' ? 'no está demostrado' : 'does not demonstrate');
      expect(body).toContain(locale === 'es-MX' ? 'interés moratorio automático permanece deshabilitado' : 'Automatic late interest remains disabled');
    }
  });

  it('discloses AI inputs, automatic mode and unconfirmed MCP effects', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'ai-disclosure');
      expect(body).toContain('Anthropic');
      expect(body).toContain('MCP');
      expect(body).toContain('["*"]');
      expect(body).toContain(locale === 'es-MX' ? 'sin confirmación humana por llamada' : 'without per-call human confirmation');
      expect(body).toContain(locale === 'es-MX' ? 'modo automático' : 'automatic mode');
      expect(body).toContain(locale === 'es-MX' ? 'marca técnica universal' : 'universal technical mark');
    }
  });

  it('does not invent universal abuse detection, dedicated infrastructure or organization enforcement', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'acceptable-use-policy');
      expect(body).toContain(locale === 'es-MX' ? 'No existe un motor general' : 'No general engine');
      expect(body).toContain(locale === 'es-MX' ? 'suspensión manual de usuarios' : 'manual Ops suspension of users');
      expect(body).toContain(locale === 'es-MX' ? 'promesa heredada de migración a infraestructura dedicada' : 'inherited promise to migrate a high-usage account to dedicated infrastructure');
      expect(body).not.toMatch(/reportaremos dichas actividades|will report such activities/);
    }
  });

  it('keeps the DPA unexecuted and discloses security, export, and deletion gaps', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'dpa');
      expect(body).toContain(locale === 'es-MX' ? 'no publicado, ofrecido, aceptado ni en vigor' : 'not published, offered, accepted, or effective');
      expect(body).toContain('RLS');
      expect(body).toContain('1,000');
      expect(body).toContain('on delete cascade');
      expect(body).toContain(locale === 'es-MX' ? 'nueve entradas' : 'nine inventory entries');
    }
  });

  it('keeps provider roles separate and every inventoried provider visible', () => {
    expect(LEGAL_PROVIDERS.filter((provider) => provider.role === 'subprocessor')).toHaveLength(8);
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'subprocessors');
      for (const provider of LEGAL_PROVIDERS) {
        if (provider.id === 'customer-integrations') continue;
        expect(body).toContain(provider.name.split(' (')[0].split(',')[0]);
      }
      expect(body).toContain(locale === 'es-MX' ? 'Nueve entradas' : 'Nine entries');
      expect(body).toContain(locale === 'es-MX' ? 'no dispone hoy de una suscripción pública' : 'no public subscription');
    }
  });

  it('records real cookie controls without treating cookieless analytics as automatically exempt', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'cookies-policy');
      for (const value of ['cord_session', 'cord_cookie_consent', 'Domain=.cordhq.app', '6 months']) {
        expect(body).toContain(locale === 'es-MX' && value === '6 months' ? '6 meses' : value);
      }
      expect(body).toContain('opt_out_capturing_by_default');
      expect(body).toContain(locale === 'es-MX' ? 'no decide por sí solo su régimen' : 'not automatically outside applicable rules');
      expect(body).toContain(locale === 'es-MX' ? 'no depende de la cookie' : 'does not depend on the browser cookie');
    }
  });

  it('does not present partial export or conflicting KYC retention as complete', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'retention-policy');
      for (const value of ['30 days', '90 days', '1,000', 'on delete cascade', 'legal_acceptances']) {
        const localized = locale === 'es-MX' && value === '30 days' ? '30 días'
          : locale === 'es-MX' && value === '90 days' ? '90 días' : value;
        expect(body).toContain(localized);
      }
      expect(body).toContain(locale === 'es-MX' ? 'no debe presentarse como' : 'must not be presented as');
      expect(body).toContain(locale === 'es-MX' ? 'no queda evidencia durable' : 'no durable database evidence');
    }
  });

  it('keeps daily status samples separate from a contractual SLA', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const { body } = read(locale, 'sla');
      expect(body).toContain('10:00 UTC');
      expect(body).toContain(locale === 'es-MX' ? '26 horas' : '26 hours');
      expect(body).toContain(locale === 'es-MX' ? '90 días' : '90 days');
      expect(body).toContain('99.9%');
      expect(body).toContain('RTO/RPO');
      expect(body).toContain(locale === 'es-MX' ? 'no es monitoreo continuo' : 'not continuous monitoring');
    }
  });
});
