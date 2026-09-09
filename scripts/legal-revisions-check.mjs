import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { legalRevisionSchema } from '../src/lib/legal-revision-schema.ts';
import { SIGNUP_LEGAL_BUNDLES } from '../src/lib/legal-corpus.ts';

const root = join(import.meta.dirname, '..');
const base = join(root, 'src/content/legal-revisions');
const revisions = new Map();
for (const locale of readdirSync(base)) {
  assert.ok(Object.hasOwn(SIGNUP_LEGAL_BUNDLES, locale), `Unsupported revision locale: ${locale}`);
  for (const file of readdirSync(join(base, locale))) {
    assert.ok(file.endsWith('.md'), `Unexpected revision file: ${file}`);
    const path = `src/content/legal-revisions/${locale}/${file}`;
    const source = readFileSync(join(root, path), 'utf8');
    const [header, ...parts] = source.split('\n---\n');
    const body = parts.join('\n---\n');
    // Restricted flat frontmatter. Astro's YAML loader independently validates
    // this collection at build; this check also works after an editorial-only edit.
    const fields = Object.fromEntries([...header.matchAll(/^(\w+): (.*)$/gm)].map(([, key, raw]) => {
      let value = raw;
      try { value = JSON.parse(raw); } catch { /* YAML plain scalar */ }
      if (raw.startsWith('[') && typeof value === 'string') value = raw.slice(1, -1).split(',').map((v) => v.trim());
      return [key, value];
    }));
    const data = legalRevisionSchema.parse(fields);
    assert.equal(data.locale, locale);
    assert.equal(file, `${data.docId}-${data.version}.md`);
    assert.equal(data.sourceOfTruth, path);
    const published = SIGNUP_LEGAL_BUNDLES[locale][data.docId];
    assert.equal(data.basedOnVersion, published.version);
    assert.equal(data.basedOnArtifactSha256, published.artifactSha256);
    assert.notEqual(data.version, published.version);
    const original = readFileSync(join(root, 'src/content/legal', locale, `${data.docId}.md`), 'utf8');
    const ids = (html) => [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(ids(body), ids(original), `${path}: anchor drift`);
    assert.equal(new Set(ids(body)).size, ids(body).length);
    for (const [, anchor] of body.matchAll(/href="#([^"]+)"/g)) assert.ok(ids(body).includes(anchor));
    for (const section of data.changedSections) assert.ok(section === 'introduction' || ids(body).includes(section));
    assert.ok(body.includes(locale === 'es-MX' ? 'BORRADOR TÉCNICO' : 'TECHNICAL DRAFT'));
    const key = `${data.docId}/${data.version}`;
    const pair = revisions.get(key) || new Map();
    assert.ok(!pair.has(locale), 'Duplicate revision locale');
    pair.set(locale, data.changedSections);
    revisions.set(key, pair);
  }
}
for (const [key, pair] of revisions) {
  assert.equal(pair.size, 2, `${key}: incomplete ES/EN pair`);
  assert.deepEqual(pair.get('es-MX'), pair.get('en-US'), `${key}: section review mismatch`);
}
assert.ok(revisions.size >= 2, 'Missing terms/privacy proposals');
process.stdout.write(`legal-revisions-check: ${revisions.size * 2} propuestas aisladas, sin vigencia, hash de publicación ni acción de aceptación\n`);
if (process.argv.includes('--strict')) {
  process.stderr.write('Revisiones bloqueadas: requieren revisión jurídica, evidencia operativa y autorización de publicación.\n');
  process.exitCode = 1;
}
