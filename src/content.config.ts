import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const stableId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const chapters = defineCollection({
  loader: glob({
    pattern: '*/chapters/**/*.{md,mdx}',
    base: './src/content/works',
  }),
  schema: z.object({
    id: stableId,
    order: z.number().int(),
    title: z.string().min(1),
    shortTitle: z.string().min(1).optional(),
    part: stableId.nullable().optional(),
    status: z.enum(['draft', 'published', 'archived']),
    description: z.string().min(1).optional(),
    estimatedMinutes: z.number().int().positive().optional(),
  }),
});

export const collections = { chapters };
