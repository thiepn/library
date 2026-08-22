import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const workSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  slug: id,
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
  type: z.string().min(1),
  language: z.string().min(2),
  contributors: z.array(z.unknown()),
  description: z.string().min(1),
  shortDescription: z.string().min(1),
  status: z.enum(['draft', 'published', 'archived']),
  visibility: z.enum(['public', 'unlisted', 'private']),
  publication: z.object({
    firstPublished: z.union([z.string(), z.date()]),
    lastUpdated: z.union([z.string(), z.date()]),
    edition: z.number().int().positive(),
    editionLabel: z.string().min(1),
    version: z.string().min(1),
    activeRelease: z.string().min(1),
  }),
  cover: z.object({ src: z.string().min(1), alt: z.string().min(1) }),
  classification: z.object({
    subjects: z.array(id),
    tags: z.array(id),
    collections: z.array(id),
  }),
  parts: z.array(z.object({ id, title: z.string().min(1), order: z.number().int() })),
  formats: z.object({
    web: z.object({ enabled: z.boolean() }),
    pdf: z.object({ enabled: z.boolean() }),
    epub: z.object({ enabled: z.boolean() }),
  }),
  relationships: z.object({ relatedWorks: z.array(id), prerequisites: z.array(id) }),
  resources: z.array(z.unknown()),
  rights: z.object({ status: z.string().min(1), notice: z.string().min(1) }),
});

export type WorkManifest = z.infer<typeof workSchema>;
