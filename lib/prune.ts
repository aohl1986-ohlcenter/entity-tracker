import { db } from "./db";
import { serpSnapshots } from "./schema";
import { and, lt, sql } from "drizzle-orm";

export const DEFAULT_RETENTION_DAYS = 90;

/**
 * Leert die `raw`-Spalte (volle Serper-Antwort) alter SERP-Snapshots, um den
 * Neon-Storage nicht unbegrenzt wachsen zu lassen. `raw` wird nur beim Schreiben
 * archiviert und von keiner Auswertung gelesen — die Kennzahlen (Score, Counts)
 * und die geparsten `serp_results` bleiben vollständig erhalten.
 *
 * Die Spalte ist NOT NULL, daher setzen wir statt NULL einen Marker
 * `{ pruned: <ISO> }` — der dient zugleich als Idempotenz-Filter, damit bereits
 * gekürzte Zeilen nicht täglich erneut angefasst werden.
 */
export async function pruneOldSnapshotRaw(
  retentionDays = DEFAULT_RETENTION_DAYS,
): Promise<{ pruned: number; retentionDays: number; cutoff: string }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const updated = await db
    .update(serpSnapshots)
    .set({ raw: { pruned: new Date().toISOString() } })
    .where(
      and(
        lt(serpSnapshots.fetchedAt, cutoff),
        sql`(${serpSnapshots.raw} ->> 'pruned') IS NULL`,
      ),
    )
    .returning({ id: serpSnapshots.id });

  return { pruned: updated.length, retentionDays, cutoff: cutoff.toISOString() };
}
