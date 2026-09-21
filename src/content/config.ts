import { defineCollection, z } from 'astro:content';

const writeups = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    machine: z.string(),
    platform: z.string().default('HackTheBox'),
    os: z.enum(['Linux', 'Windows', 'Other']).default('Linux'),
    difficulty: z.enum(['Easy', 'Medium', 'Hard', 'Insane', 'Unknown']).default('Unknown'),
    tags: z.array(z.string()).default([]),
    date: z.date().optional(),
    retired: z.boolean().default(true),
    summary: z.string().default(''),
    draft: z.boolean().default(false),
  }),
});

export const collections = { writeups };
