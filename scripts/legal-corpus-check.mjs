import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIGNUP_LEGAL_BUNDLES } from '../src/lib/legal-corpus.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticRoot = existsSync(join(root, '.vercel/output/static'))
  ? join(root, '.vercel/output/static')
  : join(root, 'dist/client');

function renderedMain(route) {
  const path = join(staticRoot, route.replace(/^\//, ''), 'index.html');
  assert.ok(existsSync(path), `falta el artefacto legal ${path}; ejecuta npm run build primero`);
  const html = readFileSync(path, 'utf8');
  const match = html.match(/<main class="legal-page js-anim"[^>]*>[\s\S]*?<\/main>/);
  assert.ok(match, `${route} no contiene el <main> legal esperado`);
  return match[0];
}

function frontmatterValue(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, 'm'));
  return match?.[1]?.trim() || null;
}

const seenHashes = new Set();
const schema = readFileSync(join(root, 'db/schema.sql'), 'utf8');

for (const bundle of Object.values(SIGNUP_LEGAL_BUNDLES)) {
  assert.equal(bundle.terms.action, 'accepted', `${bundle.locale}: términos deben aceptarse`);
  assert.equal(bundle.privacy.action, 'acknowledged', `${bundle.locale}: privacidad debe reconocerse`);

  for (const document of [bundle.terms, bundle.privacy]) {
    assert.match(document.artifactSha256, /^[a-f0-9]{64}$/);
    assert.notEqual(document.artifactSha256, '0'.repeat(64), `${document.href}: hash provisional`);

    const actualHash = createHash('sha256').update(renderedMain(document.href)).digest('hex');
    assert.equal(actualHash, document.artifactSha256,
      `${document.href}: el contenido cambió; publica una versión nueva y actualiza el catálogo`);
    assert.ok(!seenHashes.has(actualHash), `${document.href}: dos variantes comparten el mismo artefacto`);
    seenHashes.add(actualHash);

    const manifestPath = join(root, 'src/content/legal', document.locale, `${document.docId}.md`);
    const manifest = readFileSync(manifestPath, 'utf8');
    assert.equal(frontmatterValue(manifest, 'version'), document.version, `${manifestPath}: version`);
    assert.equal(frontmatterValue(manifest, 'locale'), document.locale, `${manifestPath}: locale`);
    assert.equal(frontmatterValue(manifest, 'artifactRoute'), document.href, `${manifestPath}: route`);
    assert.equal(frontmatterValue(manifest, 'artifactSha256'), document.artifactSha256, `${manifestPath}: hash`);
    assert.equal(frontmatterValue(manifest, 'action'), document.action, `${manifestPath}: action`);
    assert.equal(frontmatterValue(manifest, 'sourceKind'), 'html-snapshot', `${manifestPath}: source format`);
    assert.equal(frontmatterValue(manifest, 'sourceOfTruth'), `src/content/legal/${document.locale}/${document.docId}.md`, `${manifestPath}: source of truth`);

    // set:html does not inherit a new Astro scope. The legacy scope in the
    // snapshot must still have a stylesheet linked by its actual public route.
    const routeHtml = readFileSync(join(staticRoot, document.href, 'index.html'), 'utf8');
    const styles = [...routeHtml.matchAll(/href="(\/_astro\/[^"?#]+\.css)"/g)]
      .map((match) => readFileSync(join(staticRoot, match[1]), 'utf8')).join('\n');
    assert.ok(styles.includes(`.legal-page[${frontmatterValue(manifest, 'legacyScope')}]`), `${document.href}: missing legacy legal stylesheet`);

    assert.ok(schema.includes(document.artifactSha256), `${document.href}: el hash falta en db/schema.sql`);
  }
}

assert.equal(seenHashes.size, 4, 'el bundle inicial debe tener cuatro variantes inequívocas');
assert.match(schema, /alter table legal_acceptances force row level security/i);
assert.match(schema, /cord_register_password_user/);
assert.match(schema, /cord_register_oauth_user_with_legal_intent/);

process.stdout.write('legal-corpus-check: 4 variantes publicadas y verificadas\n');
