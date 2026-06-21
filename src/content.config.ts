import { z, defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const supportCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/support" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    order: z.number().optional(),
  }),
});

export const collections = {
  'support': supportCollection,
};
