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

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    // --- lo minimo para que salga la tarjeta ---
    name: z.string(),
    tagline: z.string(),            // una linea, que se lee bajo el nombre
    stack: z.array(z.string()).default([]),

    // --- estado: cambia el color del badge ---
    //   'shipped'  = terminado y funcionando
    //   'building' = en construccion ahora mismo
    //   'learning' = ejercicio de aprendizaje, sin pretensiones
    status: z.enum(['shipped', 'building', 'learning']).default('building'),

    // --- enlaces (opcionales) ---
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),

    // --- opcionales ---
    date: z.date().optional(),
    highlights: z.array(z.string()).default([]),  // 2-4 bullets de que resolviste
    featured: z.boolean().default(false),         // sale primero
    draft: z.boolean().default(false),            // no se publica
  }),
});

export const collections = { writeups, projects };
