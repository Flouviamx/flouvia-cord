import { createHash } from 'node:crypto';
import { LEGAL_IDENTITY } from './legal-identity.ts';
import { LEGAL_PROVIDERS, LEGAL_PROVIDER_ROLE_LABELS } from './legal-providers.ts';

// Published documents are immutable snapshots, not live templates. Updating an
// identity/provider input must initiate a reviewed publication, not silently edit
// a document already associated with acceptance evidence.
export function legalPublicationInputsHash(docId: 'terms' | 'privacy', locale: 'es-MX' | 'en-US'): string {
  const lang = locale === 'en-US' ? 'en' : 'es';
  const inputs = docId === 'terms'
    ? { operatorName: LEGAL_IDENTITY.operatorLegalName }
    : {
      operatorName: LEGAL_IDENTITY.operatorLegalName,
      privacyEmail: LEGAL_IDENTITY.privacyContactEmail || 'legal@flouvia.com',
      legalDomicile: LEGAL_IDENTITY.legalDomicile,
      providers: LEGAL_PROVIDERS.map((provider) => ({
        name: provider.name,
        role: LEGAL_PROVIDER_ROLE_LABELS[provider.role][lang],
        purpose: provider.purpose[lang],
        condition: provider.condition[lang],
      })),
    };
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}
