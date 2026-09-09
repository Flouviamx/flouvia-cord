import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SIGNUP_LEGAL_BUNDLES, type SignupLegalDocument } from '../src/lib/legal-corpus';
import { LEGAL_CORPUS_PLAN, LEGAL_TARGET_COUNTRIES } from '../src/lib/legal-corpus-plan';
import { publishedLegalHtml, restoreLegacyLegalHtml, type PublishedLegalEntry } from '../src/lib/legal-publication';
import { SUPPORTED_COUNTRIES } from '../src/lib/countries';

function readEntry(document: SignupLegalDocument) {
  const source = readFileSync(new URL(`../src/content/legal/${document.locale}/${document.docId}.md`, import.meta.url), 'utf8');
  const [header, ...body] = source.split('\n---\n');
  const data = Object.fromEntries([...header.matchAll(/^(\w+): (.*)$/gm)]
    .map(([, key, value]) => [key, value.replace(/^"(.*)"$/, '$1')]));
  return { data: data as PublishedLegalEntry['data'], body: body.join('\n---\n') };
}

const variants = Object.values(SIGNUP_LEGAL_BUNDLES).flatMap((bundle) => [bundle.terms, bundle.privacy]);
describe('lossless legal corpus extraction', () => {
  it.each(variants)('$locale/$docId keeps the exact accepted artifact and every TOC destination', (document) => {
    const entry = readEntry(document);
    const html = publishedLegalHtml(entry, document);
    expect(createHash('sha256').update(html).digest('hex')).toBe(document.artifactSha256);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) expect(ids).toContain(anchor);
    expect([...html.matchAll(/<h2 id=/g)]).toHaveLength(document.docId === 'terms' ? 17 : 14);
    if (document.docId === 'terms') expect(ids).toContain('cord-pagos');
    if (document.docId === 'privacy') expect(ids).toContain('cc-reopen');
    expect(entry.body).not.toContain('isEn ?');
    expect(entry.body).not.toContain('data-astro-cid-');
  });

  it('fails closed on an absent, draft, wrong-language, or changed artifact', () => {
    const document = variants[0];
    const entry = readEntry(document);
    expect(() => publishedLegalHtml(undefined, document)).toThrow('not published');
    expect(() => publishedLegalHtml({ ...entry, data: { ...entry.data, publicationStatus: 'draft' } }, document)).toThrow('not published');
    expect(() => publishedLegalHtml({ ...entry, data: { ...entry.data, locale: 'pt-BR' } }, document)).toThrow('mismatch');
    expect(() => publishedLegalHtml({ ...entry, body: entry.body.replace('CORD', 'CHANGED') }, document)).toThrow('artifact changed');
    expect(() => publishedLegalHtml({ ...entry, data: { ...entry.data, sourceInputsSha256: '0'.repeat(64) } }, document)).toThrow('inputs changed');
  });

  it('does not accept a wrong route or arbitrary HTML as a signed publication', () => {
    const document = variants[0];
    const entry = readEntry(document);
    expect(() => publishedLegalHtml({ ...entry, data: { ...entry.data, artifactRoute: '/draft' } }, document)).toThrow('mismatch');
    expect(() => restoreLegacyLegalHtml('<p>draft</p>', 'data-astro-cid-example')).toThrow('published main');
    expect(() => restoreLegacyLegalHtml(entry.body, 'onclick=alert(1)')).toThrow('scope');
    expect(() => publishedLegalHtml({ ...entry, body: entry.body.replace('</main>', '<script>alert(1)</script></main>') }, document)).toThrow('artifact changed');
  });

  it('keeps draft planning independent from the two published signup languages', () => {
    expect(Object.keys(SIGNUP_LEGAL_BUNDLES)).toEqual(['es-MX', 'en-US']);
    expect(LEGAL_TARGET_COUNTRIES).toEqual(SUPPORTED_COUNTRIES);
    const ids = LEGAL_CORPUS_PLAN.map((entry) => entry.docId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of LEGAL_CORPUS_PLAN) {
      for (const dependency of entry.dependsOn) expect(ids).toContain(dependency);
    }
    expect(ids.filter((id) => id.startsWith('country-'))).toHaveLength(12);
  });
});
