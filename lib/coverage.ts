import { db } from "./db";
import { keywords, serpSnapshots, serpResults } from "./schema";
import { and, desc, eq, lte } from "drizzle-orm";
import { wantedLinksForSlug } from "../data/entities";
import { matchesPattern } from "./classify";

export type WantedCoverage = {
  total: number;
  covered: number;
  prevCovered: number | null; // Abdeckung vor ~7 Tagen (null = keine History)
  items: { label: string; covered: boolean }[];
};

/** Sammelt alle Top-10-URLs der Namens-Keywords (optional bis zu einem Stichtag). */
async function rankingUrlsForNameKeywords(entityId: number, before?: Date): Promise<Set<string>> {
  const nameKws = await db
    .select({ id: keywords.id })
    .from(keywords)
    .where(and(eq(keywords.entityId, entityId), eq(keywords.cluster, "name")));

  const urls = new Set<string>();
  for (const kw of nameKws) {
    const snap = (
      await db
        .select({ id: serpSnapshots.id })
        .from(serpSnapshots)
        .where(
          before
            ? and(eq(serpSnapshots.keywordId, kw.id), lte(serpSnapshots.fetchedAt, before))
            : eq(serpSnapshots.keywordId, kw.id),
        )
        .orderBy(desc(serpSnapshots.fetchedAt))
        .limit(1)
    )[0];
    if (!snap) continue;
    const rows = await db
      .select({ url: serpResults.url, position: serpResults.position })
      .from(serpResults)
      .where(eq(serpResults.snapshotId, snap.id));
    for (const r of rows) if (r.position <= 10) urls.add(r.url);
  }
  return urls;
}

/**
 * Wunschlink-Abdeckung: Wie viele von Jens' Ziel-Publikationen ranken aktuell
 * in den Top 10 der Namens-Keywords — plus der Vergleichswert von vor ~7 Tagen.
 * Gibt null zurück, wenn die Entity keine Wunschliste hat (z. B. Alexander).
 */
export async function computeWantedCoverage(
  entityId: number,
  slug: string,
): Promise<WantedCoverage | null> {
  const wanted = wantedLinksForSlug(slug);
  if (wanted.length === 0) return null;

  const currentUrls = await rankingUrlsForNameKeywords(entityId);
  const items = wanted.map((w) => ({
    label: w.label,
    covered: [...currentUrls].some((u) => matchesPattern(u, w.pattern)),
  }));
  const covered = items.filter((i) => i.covered).length;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const prevUrls = await rankingUrlsForNameKeywords(entityId, weekAgo);
  const prevCovered =
    prevUrls.size > 0
      ? wanted.filter((w) => [...prevUrls].some((u) => matchesPattern(u, w.pattern))).length
      : null;

  return { total: wanted.length, covered, prevCovered, items };
}
