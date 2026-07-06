import type { SeedKeyword, SeedTarget } from "./beispiel";
import * as beispiel from "./beispiel";
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
    entity: beispiel.ENTITY,
    keywords: beispiel.KEYWORDS,
    targets: beispiel.TARGETS,
    citationPrompts: beispiel.AI_CITATION_PROMPTS,
    wantedLinks: beispiel.WANTED_LINKS,
  },
  {
    entity: alexander.ENTITY,
    keywords: alexander.KEYWORDS,
    targets: alexander.TARGETS,
    citationPrompts: alexander.AI_CITATION_PROMPTS,
    wantedLinks: [],
  },
];

