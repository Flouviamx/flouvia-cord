// One-time, lossless extraction of the phase-4 legal artifacts. Run only against
// the pre-migration build. Refuses to overwrite an already extracted source.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIGNUP_LEGAL_BUNDLES } from '../src/lib/legal-corpus.ts';
import { restoreLegacyLegalHtml } from '../src/lib/legal-publication.ts';
import { legalPublicationInputsHash } from '../src/lib/legal-publication-inputs.ts';

const root = join(import.meta.dirname, '..');
const updates = [];
for (const bundle of Object.values(SIGNUP_LEGAL_BUNDLES)) {
  for (const document of [bundle.terms, bundle.privacy]) {
    const path = join(root, 'src/content/legal', document.locale, `${document.docId}.md`);
    const source = readFileSync(path, 'utf8');
    assert.match(source, /^sourceKind: legacy-astro$/m, `${path}: already migrated`);
    const built = readFileSync(join(root, '.vercel/output/static', document.href, 'index.html'), 'utf8');
    const main = built.match(/<main class="legal-page js-anim"[^>]*>[\s\S]*?<\/main>/)?.[0];
    assert.ok(main, `${document.href}: missing legal main`);
    assert.equal(createHash('sha256').update(main).digest('hex'), document.artifactSha256);
    const scopes = [...new Set(main.match(/data-astro-cid-[a-z0-9]+/g))];
    assert.equal(scopes.length, 1);
    const scope = scopes[0];
    const body = main.replaceAll(` ${scope}`, '').replaceAll('><', '>\n<');
    assert.equal(restoreLegacyLegalHtml(body, scope), main, 'Extraction must be byte-for-byte reversible');
    const frontmatter = source.split('\n---\n')[0]
      .replace('sourceKind: legacy-astro', `sourceKind: html-snapshot\nlegacyScope: ${scope}\nsourceInputsSha256: "${legalPublicationInputsHash(document.docId, document.locale)}"`)
      .replace(/^sourceOfTruth: .+$/m, `sourceOfTruth: src/content/legal/${document.locale}/${document.docId}.md`);
    updates.push([path, `${frontmatter}\n---\n\n${body}\n`]);
  }
}
// All four sources and round trips must pass before touching any file.
for (const [path, source] of updates) writeFileSync(path, source);

for (const [page, docId] of [['terminos', 'terms'], ['privacidad', 'privacy']]) {
  const path = join(root, 'src/pages', `${page}.astro`);
  let source = readFileSync(path, 'utf8');
  source = source.replace(/^import \{.*\} from '\.\.\/lib\/legal-(identity|providers)';\n/gm, '')
    .replace(/^const (operatorName|privacyEmail|l) = .*;\n/gm, '')
    .replace('getLangFromUrl, publicPath, useTranslations', 'getLangFromUrl');
  source = source.replace("export const prerender = true;", `import { getEntry } from 'astro:content';\nimport { signupLegalBundle } from '../lib/legal-corpus';\nimport { publishedLegalHtml } from '../lib/legal-publication';\n\nexport const prerender = true;`);
  source = source.replace("const isEn = lang === 'en';", `const isEn = lang === 'en';\nconst variant = signupLegalBundle(isEn ? 'en-US' : 'es-MX').${docId};\nconst entry = await getEntry('legal', \`\${variant.locale.toLowerCase()}/\${variant.docId}\`);\nconst legalHtml = publishedLegalHtml(entry, variant);`);
  source = source.replace(/<main class="legal-page js-anim"[\s\S]*?<\/main>/, '<Fragment set:html={legalHtml} />');
  writeFileSync(path, source);
}
process.stdout.write('Extracted four complete legal variants; styles, scripts, versions and hashes preserved.\n');
