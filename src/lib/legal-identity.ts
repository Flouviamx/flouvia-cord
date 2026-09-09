// Identidad jurídica única para superficies públicas y documentos contractuales.
//
// Los datos públicos faltantes NO reciben valores de ejemplo. El aviso vigente
// todavía conserva el buzón histórico `legal@flouvia.com`, pero el gate de
// readiness lo considera no verificado hasta que el entorno lo confirme.

export type LegalIdentity = {
  operatorLegalName: string;
  tradeNames: readonly string[];
  serviceDomain: string;
  legalDomicile: string | null;
  taxId: string | null;
  privacyContactEmail: string | null;
  governingLaw: string | null;
  forum: string | null;
  euRepresentative: string | null;
  ukRepresentative: string | null;
};

type LegalIdentityEnv = Record<string, string | undefined>;

const clean = (value: string | undefined): string | null => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

function runtimeEnv(): LegalIdentityEnv {
  const viteEnv = (import.meta as ImportMeta & { env?: LegalIdentityEnv }).env || {};
  return { ...process.env, ...viteEnv };
}

export function legalIdentityFromEnv(env: LegalIdentityEnv = runtimeEnv()): LegalIdentity {
  return {
    // Es el único nombre de contraparte que ya estaba publicado. Cambiarlo
    // requiere evidencia del documento constitutivo/fiscal correspondiente.
    operatorLegalName: clean(env.LEGAL_OPERATOR_NAME) || 'Andre Valle Ortega',
    tradeNames: ['Flouvia', 'CORD'],
    serviceDomain: 'cordhq.app',
    legalDomicile: clean(env.LEGAL_DOMICILE),
    taxId: clean(env.LEGAL_TAX_ID),
    privacyContactEmail: clean(env.LEGAL_PRIVACY_EMAIL),
    governingLaw: clean(env.LEGAL_GOVERNING_LAW),
    forum: clean(env.LEGAL_FORUM),
    euRepresentative: clean(env.LEGAL_EU_REPRESENTATIVE),
    ukRepresentative: clean(env.LEGAL_UK_REPRESENTATIVE),
  };
}

export const LEGAL_IDENTITY = legalIdentityFromEnv();

export const LEGAL_IDENTITY_REQUIRED_FIELDS = [
  'legalDomicile',
  'taxId',
  'privacyContactEmail',
  'governingLaw',
  'forum',
] as const satisfies readonly (keyof LegalIdentity)[];

export function missingLegalIdentityFields(identity: LegalIdentity = LEGAL_IDENTITY): string[] {
  return LEGAL_IDENTITY_REQUIRED_FIELDS.filter((field) => !identity[field]);
}

export function legalIdentityIsPublicationReady(identity: LegalIdentity = LEGAL_IDENTITY): boolean {
  return missingLegalIdentityFields(identity).length === 0;
}

