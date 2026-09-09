import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SIGNUP_LEGAL_BUNDLES } from '../src/lib/legal-corpus.ts';
import { LEGAL_CORPUS_PLAN, LEGAL_TARGET_LOCALES } from '../src/lib/legal-corpus-plan.ts';
import { publishedLegalHtml } from '../src/lib/legal-publication.ts';
import { isReviewedSupplementalDocument, legalSupplementalReviewSchema, REVIEWED_SUPPLEMENTAL_DOC_IDS } from '../src/lib/legal-supplemental-review.ts';

const root = join(import.meta.dirname, '..');
const base = join(root, 'src/content/legal');
const planned = new Map(LEGAL_CORPUS_PLAN.map((entry) => [entry.docId, entry]));
const seen = new Set();
const report = { published: 0, drafts: 0, technicalDrafts: 0, pending: [] };
const reviewSections = new Map();
for (const directory of readdirSync(base, { withFileTypes: true })) {
  assert.ok(directory.isDirectory() && LEGAL_TARGET_LOCALES.includes(directory.name), `Unexpected corpus path: ${directory.name}`);
  assert.ok(readdirSync(join(base, directory.name), { withFileTypes: true }).every((entry) => entry.isFile() && entry.name.endsWith('.md')), 'Legal variants must be direct Markdown files, not nested/untracked sources');
}
// The Content Collection schema handles YAML types; this independent check reads
// only explicitly declared scalar fields to compare sources, bundle and artifacts.
function field(source, key) {
  const header = source.split('\n---\n')[0];
  const value = header.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1];
  return value?.replace(/^"(.*)"$/, '$1');
}
for (const locale of LEGAL_TARGET_LOCALES) {
  const dir = join(base, locale);
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.md')) : [];
  for (const name of files) {
    const source = readFileSync(join(dir, name), 'utf8');
    const docId = field(source, 'docId');
    assert.ok(planned.has(docId), `Unplanned document: ${locale}/${docId}`);
    assert.equal(name, `${docId}.md`);
    assert.equal(field(source, 'locale'), locale);
    assert.equal(field(source, 'sourceOfTruth'), `src/content/legal/${locale}/${name}`);
    const key = `${locale}/${docId}`;
    assert.ok(!seen.has(key), `Duplicate variant: ${key}`);
    seen.add(key);
    const status = field(source, 'publicationStatus');
    if (field(source, 'editorialStage') || isReviewedSupplementalDocument(docId)) {
      const values = Object.fromEntries([
        'editorialStage', 'publicationStatus', 'sourceKind', 'supersedes',
        'requiresAction', 'action', 'acceptanceScope', 'artifactSha256', 'releaseBlockers',
      ].map((key) => {
        const raw = field(source, key);
        return [key, ['supersedes', 'requiresAction', 'releaseBlockers'].includes(key) ? JSON.parse(raw) : raw];
      }));
      legalSupplementalReviewSchema.parse(values);
      const body = source.split('\n---\n').slice(1).join('\n---\n');
      assert.ok(body.includes(locale === 'es-MX' ? 'BORRADOR TÉCNICO' : 'TECHNICAL DRAFT'), `${key}: missing draft warning`);
      assert.ok(!body.includes('Material fuente extraído') && !body.includes('Extracted source material'), `${key}: still an extraction`);
      const sections = [...body.matchAll(/^## (\d+)\. /gm)].map((match) => Number(match[1]));
      assert.deepEqual(sections, [1, 2, 3, 4, 5, 6, 7, 8], `${key}: incomplete or duplicate sections`);
      reviewSections.set(key, sections);
      report.technicalDrafts++;
    }
    if (status === 'published') {
      const expected = SIGNUP_LEGAL_BUNDLES[locale]?.[docId];
      assert.ok(expected, `Not authorized by the published bundle: ${key}`);
      const data = Object.fromEntries(['docId', 'version', 'locale', 'jurisdiction', 'publicationStatus', 'sourceKind', 'artifactRoute', 'artifactSha256', 'action', 'legacyScope', 'sourceInputsSha256'].map((key) => [key, field(source, key)]));
      publishedLegalHtml({ data, body: source.split('\n---\n').slice(1).join('\n---\n') }, expected);
      report.published++;
    } else {
      assert.equal(status, 'draft', `${key}: unexpected status`);
      assert.equal(field(source, 'artifactSha256'), '0'.repeat(64), `${key}: draft must not claim a rendered artifact`);
      assert.ok(field(source, 'releaseBlockers')?.length > 2, `${key}: missing release blockers`);
      const deps = JSON.parse(field(source, 'dependsOn'));
      assert.deepEqual(deps, planned.get(docId).dependsOn, `${key}: dependency drift`);
      for (const ref of JSON.parse(field(source, 'sourceSections') || '[]')) {
        const match = ref.match(/^([a-z-]+)@([0-9.-]+)#([a-z-]+)$/);
        assert.ok(match, `${key}: invalid source reference ${ref}`);
        const original = readFileSync(join(dir, `${match[1]}.md`), 'utf8');
        assert.equal(field(original, 'version'), match[2], `${key}: source version changed; re-review extraction`);
        assert.ok(original.includes(`id="${match[3]}"`), `${key}: missing source anchor`);
      }
      report.drafts++;
    }
  }
  for (const entry of LEGAL_CORPUS_PLAN) {
    if (!seen.has(`${locale}/${entry.docId}`)) report.pending.push(`${locale}/${entry.docId}`);
  }
}
assert.equal(report.published, 4, 'Exactly four reviewed-for-migration legacy variants are public');
for (const docId of REVIEWED_SUPPLEMENTAL_DOC_IDS) {
  assert.ok(reviewSections.has(`es-MX/${docId}`), `${docId}: missing ES technical draft`);
  assert.ok(reviewSections.has(`en-US/${docId}`), `${docId}: missing EN technical draft`);
  assert.deepEqual(reviewSections.get(`es-MX/${docId}`), reviewSections.get(`en-US/${docId}`));
}
// The phase does not introduce a catch-all renderer that could expose a draft by
// slug. New routes/acceptance bundles require an explicit publication change.
assert.ok(!existsSync(join(root, 'src/pages/legal/[...slug].astro')));
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`legal-editorial-check: ${report.published} publicadas, ${report.drafts} borradores (${report.technicalDrafts} redactados técnicamente), ${report.pending.length} variantes pendientes; ningún fallback legal pt-BR\n`);
}
if (process.argv.includes('--strict') && (report.drafts || report.pending.length)) {
  process.stderr.write('Corpus completo bloqueado: faltan redacción/revisión y traducciones aprobadas.\n');
  process.exitCode = 1;
}
