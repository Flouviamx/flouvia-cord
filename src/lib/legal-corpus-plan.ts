// Editorial scope, NOT an offer of services, a country compliance determination,
// a published route list, or a contract-acceptance bundle.
export const LEGAL_TARGET_LOCALES = ['es-MX', 'en-US', 'pt-BR'] as const;
export const LEGAL_TARGET_COUNTRIES = ['MX', 'US', 'CA', 'BR', 'ES', 'GB', 'DE', 'FR', 'CO', 'AR', 'CL', 'PE'] as const;

export const LEGAL_CORPUS_PLAN = [
  { docId: 'terms', dependsOn: [] },
  { docId: 'privacy', dependsOn: [] },
  { docId: 'payments-terms', dependsOn: ['terms'] },
  { docId: 'invoicing-terms', dependsOn: ['terms'] },
  { docId: 'kyc-aml-policy', dependsOn: ['payments-terms', 'privacy'] },
  { docId: 'collections-notice', dependsOn: ['terms', 'privacy'] },
  { docId: 'ai-disclosure', dependsOn: ['privacy', 'collections-notice'] },
  { docId: 'dispute-evidence-notice', dependsOn: ['payments-terms', 'privacy'] },
  { docId: 'acceptable-use-policy', dependsOn: ['terms'] },
  { docId: 'dpa', dependsOn: ['terms', 'privacy', 'subprocessors', 'retention-policy'] },
  { docId: 'subprocessors', dependsOn: ['privacy'] },
  { docId: 'us-state-privacy-annex', dependsOn: ['privacy', 'retention-policy'] },
  { docId: 'cookies-policy', dependsOn: ['privacy'] },
  { docId: 'retention-policy', dependsOn: ['privacy'] },
  { docId: 'sla', dependsOn: ['terms'] },
  ...LEGAL_TARGET_COUNTRIES.map((country) => ({
    docId: `country-${country.toLowerCase()}`,
    dependsOn: ['terms', 'privacy', 'payments-terms', 'invoicing-terms', 'collections-notice'],
  })),
] as const;
