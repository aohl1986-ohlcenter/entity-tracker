import { db } from "./db";
import { llmCalls, llmRuns, serpSnapshots } from "./schema";
import { and, isNotNull, lt, sql } from "drizzle-orm";

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

/**
 * Löscht alte Einzelvorgänge des LLM-Tracings (`llm_calls`) und die zugehörigen
 * abgeschlossenen Läufe (`llm_runs`).
 *
 * Die Monatszahlen gehen dabei NICHT verloren: sie stehen in
 * `llm_cost_monthly`, das hier bewusst unangetastet bleibt. Verloren geht nur
 * die Detailtiefe (welcher Prompt, welche Latenz) jenseits der Frist — genau
 * der Teil, der über Monate unbegrenzt wachsen würde.
 *
 * Noch laufende Läufe (`finishedAt IS NULL`) werden verschont, damit ein
 * hängengebliebener Lauf nicht mitten im Betrieb unter sich weggeräumt wird.
 */
export async function pruneOldLlmCalls(
  retentionDays = DEFAULT_RETENTION_DAYS,
): Promise<{ calls: number; runs: number; retentionDays: number; cutoff: string }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const geloeschteCalls = await db
    .delete(llmCalls)
    .where(lt(llmCalls.startedAt, cutoff))
    .returning({ id: llmCalls.id });

  const geloeschteRuns = await db
    .delete(llmRuns)
    .where(and(lt(llmRuns.startedAt, cutoff), isNotNull(llmRuns.finishedAt)))
    .returning({ id: llmRuns.id });

  return {
    calls: geloeschteCalls.length,
    runs: geloeschteRuns.length,
    retentionDays,
    cutoff: cutoff.toISOString(),
  };
}
