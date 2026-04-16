import { defineCollection, z } from 'astro:content';
import { POST_EXCERPT_MAX_LEN, POST_EXCERPT_MIN_LEN } from './lib/post-excerpt-limits';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().min(2),
    excerpt: z.string().min(POST_EXCERPT_MIN_LEN).max(POST_EXCERPT_MAX_LEN),
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
