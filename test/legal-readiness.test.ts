import { describe, expect, it } from 'vitest';
import {
  legalIdentityFromEnv,
  legalIdentityIsPublicationReady,
  missingLegalIdentityFields,
} from '../src/lib/legal-identity';
import { LEGAL_PROVIDERS, legalProvidersByRole } from '../src/lib/legal-providers';

describe('legal publication readiness', () => {
  it('never fills missing identity fields with invented placeholders', () => {
    const identity = legalIdentityFromEnv({});
    expect(identity.operatorLegalName).toBe('Andre Valle Ortega');
    expect(identity.legalDomicile).toBeNull();
    expect(identity.taxId).toBeNull();
    expect(identity.privacyContactEmail).toBeNull();
    expect(legalIdentityIsPublicationReady(identity)).toBe(false);
    expect(missingLegalIdentityFields(identity)).toEqual([
      'legalDomicile',
      'taxId',
      'privacyContactEmail',
      'governingLaw',
      'forum',
    ]);
  });

  it('becomes ready only with all required verified fields', () => {
    const identity = legalIdentityFromEnv({
      LEGAL_OPERATOR_NAME: 'Verified Operator',
      LEGAL_DOMICILE: 'Verified service address',
      LEGAL_TAX_ID: 'Verified tax id',
      LEGAL_PRIVACY_EMAIL: 'privacy@example.com',
      LEGAL_GOVERNING_LAW: 'Verified governing law',
      LEGAL_FORUM: 'Verified forum',
    });
    expect(missingLegalIdentityFields(identity)).toEqual([]);
    expect(legalIdentityIsPublicationReady(identity)).toBe(true);
  });

  it('separates processors, regulated recipients, authorities, and customer-directed integrations', () => {
    expect(new Set(LEGAL_PROVIDERS.map((provider) => provider.id)).size).toBe(LEGAL_PROVIDERS.length);
    expect(legalProvidersByRole('subprocessor').map((provider) => provider.id)).toContain('neon');
    expect(legalProvidersByRole('provider-with-own-duties').map((provider) => provider.id)).toContain('stripe');
    expect(legalProvidersByRole('authority').map((provider) => provider.id)).toContain('tax-authorities');
    expect(legalProvidersByRole('customer-directed').map((provider) => provider.id)).toContain('customer-integrations');
  });
});

