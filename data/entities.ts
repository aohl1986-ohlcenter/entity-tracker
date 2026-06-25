import type { SeedKeyword, SeedTarget } from "./langkammer";
import * as langkammer from "./langkammer";
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

/** Alle getrackten Entities. Neue Entity = hier einen Eintrag ergänzen. */
export const SEED_ENTITIES: SeedEntityBundle[] = [
  {
    entity: langkammer.ENTITY,
    keywords: langkammer.KEYWORDS,
    targets: langkammer.TARGETS,
    citationPrompts: langkammer.AI_CITATION_PROMPTS,
    wantedLinks: langkammer.WANTED_LINKS,
  },
  {
    entity: alexander.ENTITY,
    keywords: alexander.KEYWORDS,
    targets: alexander.TARGETS,
    citationPrompts: alexander.AI_CITATION_PROMPTS,
    wantedLinks: [],
  },
];

export function citationPromptsForSlug(slug: string): CitationPrompt[] {
  return SEED_ENTITIES.find((e) => e.entity.slug === slug)?.citationPrompts ?? [];
}

export function wantedLinksForSlug(slug: string): WantedLink[] {
  return SEED_ENTITIES.find((e) => e.entity.slug === slug)?.wantedLinks ?? [];
}
