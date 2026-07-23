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

const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    category: z.string(),
    date: z.string(),
    readTime: z.string(),
    img: z.string(),
    authorName: z.string().optional(),
    authorRole: z.string().optional(),
    authorAvatar: z.string().optional(),
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
  }),
});

export const collections = {
  'support': supportCollection,
  'blog': blogCollection,
  'devBlog': devBlogCollection,
  'docs': docsCollection,
};
