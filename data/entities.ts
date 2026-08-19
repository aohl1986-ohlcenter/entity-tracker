import type { SeedKeyword, SeedTarget } from "./types";
import * as demo from "./demo";
import * as alexander from "./alexander";

export type CitationPrompt = { engine: "gemini"; query: string; topic: string };
export type WantedLink = { label: string; pattern: string };

export type SeedEntityBundle = {
  entity: { slug: string; name: string };
  keywords: SeedKeyword[];
  targets: SeedTarget[];
  citationPrompts: CitationPrompt[];
  wantedLinks: WantedLink[];
};

/**
 * Bootstrap-Fixtures für eine frische DB (scripts/seed.ts + migrate-to-saas.ts).
 * Seit der SaaS-Migration werden Kunden im Admin (/admin) angelegt und
 * gepflegt — NICHT mehr hier. Laufzeit-Code liest ausschließlich aus der DB.
 */
export const SEED_ENTITIES: SeedEntityBundle[] = [
  {
    entity: demo.ENTITY,
    keywords: demo.KEYWORDS,
    targets: demo.TARGETS,
    citationPrompts: demo.AI_CITATION_PROMPTS,
    wantedLinks: demo.WANTED_LINKS,
  },
  {
    entity: alexander.ENTITY,
    keywords: alexander.KEYWORDS,
    targets: alexander.TARGETS,
    citationPrompts: alexander.AI_CITATION_PROMPTS,
    wantedLinks: [],
  },
];

