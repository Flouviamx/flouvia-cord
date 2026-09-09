import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { legalRevisionSchema } from '../src/lib/legal-revision-schema';
import { SIGNUP_LEGAL_BUNDLES } from '../src/lib/legal-corpus';
import { publishedLegalHtml, type PublishedLegalEntry } from '../src/lib/legal-publication';

// Fixture reader for these flat frontmatters, not a replacement YAML loader.
function read(path: string) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const [header, ...rest] = source.split('\n---\n');
  const data = Object.fromEntries([...header.matchAll(/^(\w+): (.*)$/gm)].map(([, key, raw]) => {
    let value: unknown = raw;
    try { value = JSON.parse(raw); } catch { /* plain YAML scalar/list of labels */ }
    if (raw.startsWith('[') && typeof value === 'string') value = raw.slice(1, -1).split(',').map((v) => v.trim());
    return [key, value];
  }));
  return { data, body: rest.join('\n---\n') };
}

describe('technical legal revisions are isolated proposals', () => {
  for (const locale of ['es-MX', 'en-US'] as const) {
    for (const docId of ['terms', 'privacy'] as const) {
      it(`${locale}/${docId} preserves its baseline and anchors without becoming a publication`, () => {
        const path = `src/content/legal-revisions/${locale}/${docId}-2026-08-30.1.md`;
        const entry = read(path);
        const data = legalRevisionSchema.parse(entry.data);
        const original = read(`src/content/legal/${locale}/${docId}.md`);
        const published = SIGNUP_LEGAL_BUNDLES[locale][docId];
        expect(data.basedOnArtifactSha256).toBe(published.artifactSha256);
        expect(data.basedOnVersion).toBe(published.version);
        expect(data.version).not.toBe(published.version);
        expect(data.sourceOfTruth).toBe(path);
        const ids = (body: string) => [...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
        expect(ids(entry.body)).toEqual(ids(original.body));
        expect(new Set(ids(entry.body)).size).toBe(ids(entry.body).length);
        for (const [, anchor] of entry.body.matchAll(/href="#([^"]+)"/g)) expect(ids(entry.body)).toContain(anchor);
        expect(entry.body).toContain(locale === 'es-MX' ? 'BORRADOR TÉCNICO' : 'TECHNICAL DRAFT');
        expect(entry.body).not.toBe(original.body);
        expect(legalRevisionSchema.safeParse({ ...data, publicationStatus: 'published' }).success).toBe(false);
        expect(legalRevisionSchema.safeParse({ ...data, effectiveDate: '2026-08-30' }).success).toBe(false);
        expect(legalRevisionSchema.safeParse({ ...data, requiresAction: true }).success).toBe(false);
        expect(legalRevisionSchema.safeParse({ ...data, artifactSha256: published.artifactSha256 }).success).toBe(false);
        expect(legalRevisionSchema.safeParse({ ...data, reviewStatus: 'approved' }).success).toBe(false);
        expect(legalRevisionSchema.safeParse({ ...data, releaseBlockers: [] }).success).toBe(false);
        // Even a caller bypassing the collection types must hit the public guard.
        expect(() => publishedLegalHtml({ data: { ...original.data, publicationStatus: 'draft' } as PublishedLegalEntry['data'], body: entry.body }, published)).toThrow('not published');
      });
    }
  }

  it('covers matching section changes in ES and EN', () => {
    for (const docId of ['terms', 'privacy']) {
      const es = read(`src/content/legal-revisions/es-MX/${docId}-2026-08-30.1.md`);
      const en = read(`src/content/legal-revisions/en-US/${docId}-2026-08-30.1.md`);
      expect(es.data.changedSections).toEqual(en.data.changedSections);
    }
  });

  it('removes the specific unsupported claims rather than merely adding a draft label', () => {
    for (const locale of ['es-MX', 'en-US']) {
      const terms = read(`src/content/legal-revisions/${locale}/terms-2026-08-30.1.md`).body;
      const privacy = read(`src/content/legal-revisions/${locale}/privacy-2026-08-30.1.md`).body;
      expect(terms).not.toMatch(/<strong>(no bloqueará|will not block)<\/strong>/);
      expect(terms).not.toMatch(/CORD (?:no se responsabiliza del tono|is not liable for the tone)/);
      expect(privacy).not.toMatch(/25%|conforme a la normativa de prevención de lavado|as required by anti-money-laundering|corporate consent|consentimiento corporativo/);
      expect(terms).toContain(locale === 'es-MX' ? 'interés moratorio automático está deshabilitado' : 'Automatic late interest is disabled');
      expect(terms).toContain(locale === 'es-MX' ? 'procesamiento programado diario' : 'daily scheduled processing');
      expect(privacy).toContain(locale === 'es-MX' ? 'antes de la presentación final' : 'before the final dispute response');
      expect(privacy).toContain('hashes');
    }
  });
});
