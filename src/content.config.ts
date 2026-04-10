import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().min(2),
    excerpt: z.string().min(24).max(220),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    section: z.enum(['ai', 'security', 'programming', 'daily', 'tools']),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    coverAlt: z.string().default(''),
    location: z.string().optional(),
    images: z.array(z.object({
      src: z.string(),
      alt: z.string().default('')
    })).default([])
  })
});

export const collections = {
  posts
};
