import { createHash } from 'node:crypto';
import type { SignupLegalDocument } from './legal-corpus';
import { legalPublicationInputsHash } from './legal-publication-inputs.ts';

export type PublishedLegalEntry = {
  body?: string;
  data: {
    docId: string;
    version: string;
    locale: string;
    jurisdiction: string;
    publicationStatus: string;
    sourceKind: string;
    artifactRoute: string;
    artifactSha256: string;
    action: string;
    legacyScope?: string;
    sourceInputsSha256?: string;
  };
};

/** Only the four already-published artifacts use this lossless migration format.
 * Newlines separate HTML tokens for editing; they are not contractual whitespace.
 * Preserve the original Astro scope and serialization, including comments: existing
 * acceptance records hash the complete main, not just the text. Never use this on
 * user input, generated drafts, or unreviewed Markdown.
 */
export function restoreLegacyLegalHtml(body: string, scope: string): string {
  if (!/^data-astro-cid-[a-z0-9]+$/.test(scope)) {
    throw new Error('Invalid legacy legal presentation scope');
  }
  const html = body.trim().replace(/>\n</g, '><');
  if (!html.startsWith('<main class="legal-page js-anim">') || !html.endsWith('</main>')) {
    throw new Error('Legal snapshot must contain exactly the published main');
  }
  return html.replace(/<[a-z][^>]*>/g, (tag) => `${tag.slice(0, -1)} ${scope}>`);
}

export function publishedLegalHtml(entry: PublishedLegalEntry | undefined, expected: SignupLegalDocument): string {
  if (!entry || entry.data.publicationStatus !== 'published') {
    throw new Error(`Legal variant is not published: ${expected.locale}/${expected.docId}`);
  }
  const data = entry.data;
  for (const field of ['docId', 'version', 'locale', 'jurisdiction', 'action', 'artifactSha256'] as const) {
    if (data[field] !== expected[field]) throw new Error(`Legal variant mismatch: ${field}`);
  }
  if (data.artifactRoute !== expected.href || data.sourceKind !== 'html-snapshot' || !data.legacyScope) {
    throw new Error('Legal variant route or source format mismatch');
  }
  if (data.sourceInputsSha256 !== legalPublicationInputsHash(expected.docId, expected.locale)) {
    throw new Error('Legal identity/provider inputs changed. Review and publish a new version before building.');
  }
  const html = restoreLegacyLegalHtml(entry.body || '', data.legacyScope);
  if (createHash('sha256').update(html).digest('hex') !== expected.artifactSha256) {
    throw new Error(`Legal artifact changed: ${expected.href}. Publish a new reviewed version; never replace an accepted hash.`);
  }
  return html;
}
