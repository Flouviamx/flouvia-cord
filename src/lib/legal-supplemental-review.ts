import { z } from 'zod';

// Editorial milestone, not a publication allowlist. Releasing any of these
// proposals requires an explicit review of this guard and the public bundle.
export const REVIEWED_SUPPLEMENTAL_DOC_IDS = [
  'payments-terms', 'invoicing-terms', 'kyc-aml-policy', 'dispute-evidence-notice',
  'collections-notice', 'ai-disclosure', 'acceptable-use-policy',
  'dpa', 'subprocessors', 'cookies-policy', 'retention-policy', 'sla',
] as const;

export const legalSupplementalReviewSchema = z.object({
  editorialStage: z.literal('technical-draft'),
  publicationStatus: z.literal('draft'),
  sourceKind: z.literal('markdown'),
  supersedes: z.null(),
  requiresAction: z.literal(false),
  action: z.literal('none'),
  acceptanceScope: z.literal('none'),
  artifactSha256: z.literal('0'.repeat(64)),
  releaseBlockers: z.array(z.string().min(1)).min(1),
});

export function isReviewedSupplementalDocument(docId: string): boolean {
  return REVIEWED_SUPPLEMENTAL_DOC_IDS.some((id) => id === docId);
}
