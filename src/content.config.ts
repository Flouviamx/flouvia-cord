import { z, defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { legalRevisionSchema } from './lib/legal-revision-schema';
import { isReviewedSupplementalDocument, legalSupplementalReviewSchema } from './lib/legal-supplemental-review';

const supportCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/support" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    order: z.number().optional(),
  }),
});

const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    category: z.string(),
    date: z.string(),
    publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    readTime: z.string(),
    img: z.string(),
    authorName: z.string().optional(),
    authorRole: z.string().optional(),
    authorAvatar: z.string().optional(),
    reviewedBy: z.string().max(120).optional(),
    reviewedByRole: z.string().max(120).optional(),
    keywords: z.array(z.string().max(80)).optional(),
    faq: z.array(z.object({
      question: z.string().max(180),
      answer: z.string().max(900),
    })).max(12).optional(),
    sources: z.array(z.object({
      name: z.string().max(180),
      url: z.string().url(),
    })).max(20).optional(),
    featured: z.boolean().optional(),
  }),
});

const devBlogCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/dev-blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.string(),
    type: z.enum(['BLOG', 'DOCS', 'VIDEO', 'EVENT']),
    topic: z.string(),
    authors: z.array(z.string()).optional(),
    readTime: z.string().optional(),
    featured: z.boolean().optional(),
  }),
});

const docsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    order: z.number().optional(),
    // Fecha editorial real. Si falta, el layout omite dateModified en vez de
    // fingir que el artículo cambió cada vez que se construye el sitio.
    lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    // Metadatos editoriales visibles y reutilizables en JSON-LD. Son opcionales
    // durante la migración, pero obligatorios para guías regulatorias y de pagos.
    reviewedBy: z.string().max(120).optional(),
    appliesToMarkets: z.array(z.enum([
      'MX', 'US', 'CA', 'BR', 'ES', 'GB', 'DE', 'FR', 'CO', 'AR', 'CL', 'PE'
    ])).optional(),
    availablePlans: z.array(z.enum([
      'Free', 'Starter', 'Pro', 'Scale', 'Developer'
    ])).optional(),
    prerequisites: z.array(z.string().max(160)).optional(),
  }),
});

// Corpus legal: texto publicado por variante y borradores no enrutados.
// html-snapshot conserva los cuatro artefactos aceptados antes de la extracción.
// Las rutas públicas exigen coincidencia con el bundle, no solo "published".
const legalCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/legal" }),
  schema: z.object({
    docId: z.string().regex(/^[a-z][a-z0-9-]*$/),
    version: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    supersedes: z.string().nullable(),
    locale: z.enum(['es-MX', 'en-US', 'pt-BR']),
    jurisdiction: z.string().min(2).max(32),
    appliesToCountries: z.array(z.enum([
      'MX', 'US', 'CA', 'BR', 'ES', 'GB', 'DE', 'FR', 'CO', 'AR', 'CL', 'PE'
    ])).min(1),
    requiresAction: z.boolean(),
    action: z.enum(['accepted', 'acknowledged', 'none']),
    acceptanceScope: z.enum(['personal', 'organization', 'none']),
    publicationStatus: z.enum(['draft', 'published', 'retired']),
    sourceKind: z.enum(['html-snapshot', 'markdown']),
    editorialStage: z.literal('technical-draft').optional(),
    legacyScope: z.string().regex(/^data-astro-cid-[a-z0-9]+$/).optional(),
    sourceInputsSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    dependsOn: z.array(z.string()).default([]),
    sourceSections: z.array(z.string()).default([]),
    releaseBlockers: z.array(z.string()).default([]),
    sourceOfTruth: z.string().min(1),
    artifactRoute: z.string().startsWith('/'),
    artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    lastReviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reviewedBy: z.string().min(1).max(120),
  }).superRefine((data, ctx) => {
    if (!data.editorialStage && !isReviewedSupplementalDocument(data.docId)) return;
    const review = legalSupplementalReviewSchema.safeParse(data);
    if (!review.success) {
      for (const issue of review.error.issues) {
        ctx.addIssue({ code: 'custom', path: issue.path, message: `Unreleased legal proposal: ${issue.message}` });
      }
    }
  }),
});

// Proposed replacements live outside the published corpus. Literal constraints
// make an accidental frontmatter flip fail the build; no page consumes this collection.
const legalRevisionsCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal-revisions' }),
  schema: legalRevisionSchema,
});

export const collections = {
  'support': supportCollection,
  'blog': blogCollection,
  'devBlog': devBlogCollection,
  'docs': docsCollection,
  'legal': legalCollection,
  'legalRevisions': legalRevisionsCollection,
};
