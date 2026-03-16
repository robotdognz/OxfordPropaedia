import { z, defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';

// --- Shared sub-schemas ---

const outlineItemSchema: z.ZodType<OutlineItem> = z.object({
  level: z.string(),
  levelType: z.enum(['major', 'numeric', 'lowercase', 'roman']),
  text: z.string(),
  children: z.lazy(() => outlineItemSchema.array()).default([]),
});

type OutlineItem = {
  level: string;
  levelType: 'major' | 'numeric' | 'lowercase' | 'roman';
  text: string;
  children: OutlineItem[];
};

const crossReferenceSchema = z.object({
  fromPath: z.string(),
  targetSection: z.string(),
  targetPath: z.string().optional(),
});

const vsiMappingEntrySchema = z.object({
  vsiTitle: z.string(),
  vsiAuthor: z.string(),
  rationaleAI: z.string(),
  relevantPathsAI: z.array(z.string()).optional(),
});

const wikiMappingEntrySchema = z.object({
  articleTitle: z.string(),
  rationaleAI: z.string().optional(),
  relevantPathsAI: z.array(z.string()).optional(),
});

// --- Collection schemas ---

const partsCollection = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/parts' }),
  schema: z.object({
    partNumber: z.number().int().min(1).max(10),
    title: z.string(),
    subtitle: z.string().optional(),
    color: z.string(),
    headnote: z.array(z.string()).default([]),
    divisions: z.array(z.string()),
  }),
});

const divisionsCollection = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/divisions' }),
  schema: z.object({
    divisionId: z.string(),
    partNumber: z.number().int().min(1).max(10),
    romanNumeral: z.string(),
    title: z.string(),
    headnote: z.array(z.string()).default([]),
    sections: z.array(z.string()),
  }),
});

const sectionsCollection = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/sections' }),
  schema: z.object({
    sectionCode: z.string(),
    sectionCodeDisplay: z.string(),
    partNumber: z.number().int().min(1).max(10),
    divisionId: z.string(),
    title: z.string(),
    outline: z.array(outlineItemSchema),
    crossReferences: z.array(crossReferenceSchema).default([]),
    macropaediaReferences: z.array(z.string()).default([]),
  }),
});

const essaysCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/essays' }),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    partNumber: z.number().int().min(0).max(10),
  }),
});

const vsiCatalogCollection = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/vsi' }),
  schema: z.object({
    titles: z.array(z.object({
      title: z.string(),
      author: z.string(),
      number: z.number().int().optional(),
      subject: z.string().optional(),
      subjects: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional(),
      abstract: z.string().optional(),
      publicationYear: z.number().int().optional(),
      publicationDate: z.string().optional(),
      edition: z.number().int().optional(),
      approximateNumber: z.boolean().optional(),
    })),
  }),
});

const vsiMappingsCollection = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/vsi-mappings' }),
  schema: z.object({
    _curatedBy: z.string().optional(),
    sectionCode: z.string(),
    mappings: z.array(vsiMappingEntrySchema),
  }),
});

const wikiMappingsCollection = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/wiki-mappings' }),
  schema: z.object({
    _curatedBy: z.string().optional(),
    sectionCode: z.string(),
    mappings: z.array(wikiMappingEntrySchema),
  }),
});

export const collections = {
  parts: partsCollection,
  divisions: divisionsCollection,
  sections: sectionsCollection,
  essays: essaysCollection,
  vsi: vsiCatalogCollection,
  'wiki-mappings': wikiMappingsCollection,
  'vsi-mappings': vsiMappingsCollection,
};
