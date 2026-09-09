import { z } from 'zod';

// A proposal is not a publishable variant. Neither a date nor a hash can be
// assigned here, and the public legal renderer must never consume this schema.
export const legalRevisionSchema = z.object({
  docId: z.enum(['terms', 'privacy']),
  locale: z.enum(['es-MX', 'en-US']),
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/),
  basedOnVersion: z.string(),
  basedOnArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  publicationStatus: z.literal('draft'),
  reviewStatus: z.literal('technical-draft'),
  effectiveDate: z.null(),
  artifactSha256: z.null(),
  requiresAction: z.literal(false),
  action: z.literal('none'),
  sourceOfTruth: z.string(),
  releaseBlockers: z.array(z.string()).min(1),
  changedSections: z.array(z.string()).min(1),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
