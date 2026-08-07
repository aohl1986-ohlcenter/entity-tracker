// Pro-Lauf-Tracing für LLM- und SERP-Aufrufe.
//
// Grundregel, wie bei lib/usage.ts: Metering darf NIE einen Lauf scheitern
// lassen. Jeder DB-Zugriff hier steckt in try/catch und schreibt im Fehlerfall
// nur auf die Konsole. Der Fehler des getracten Aufrufs selbst wird unverändert
// weitergereicht — `verfolge` ist durchsichtig.
//
// Hot Path: Trace-Zeilen werden im Lauf-Kontext gepuffert und als Batch
// geschrieben, nicht einzeln. Bei ~40 Aufrufen pro Mandant und Tag spart das
// gegenüber einem HTTP-Roundtrip pro Aufruf den größten Teil des Overheads,
// ohne dass ein Absturz mehr als die letzten paar Zeilen kostet.

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { llmCalls, llmCostMonthly, llmRuns } from "./schema";
import { berechneKosten, fasseZusammen, monatUtc, tagUtc, type CostModell } from "./kosten";
import type { Messung } from "./engine-messung";

/** Nach so vielen gepufferten Zeilen wird zwischendurch geschrieben. */
const FLUSH_SCHWELLE = 25;

export type LaufArt = "fetch_serps" | "check_citations";
export type Operation = "serp_keyword" | "citation_prompt" | "grounding_serp";

type PufferZeile = {
  runId: string;
  seq: number;
  parentSeq: number | null;
  entityId: number;
  engine: string;
  model: string | null;
  operation: Operation;
  anlass: string;
  startedAt: Date;
  day: string;
  month: string;
  latencyMs: number;
  ok: number;
  fehler: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokenQuelle: string;
  costNanoUsd: number;
  costModell: CostModell;
  preisStand: string | null;
  aiCitationId: number | null;
  serpSnapshotId: number | null;
};

export type LaufKontext = {
  runId: string;
  entityId: number;
  art: LaufArt;
  /** DB-ID der llm_runs-Zeile; null, wenn das Anlegen scheiterte. */
  runRowId: number | null;
  puffer: PufferZeile[];
  /** Bereits geschriebene Zeilen — für die Verdichtung am Laufende. */
  geschrieben: PufferZeile[];
  /** Zähler für `seq`. */
  naechsteSeq: number;
  /**
   * Die zuletzt von `verfolge` erzeugte Zeile — stabile Referenz für
   * `verknuepfeErgebnis`, unabhängig vom Puffer-Zustand.
   */
  letzte: PufferZeile | null;
  calls: number;
  failures: number;
  costNanoUsd: number;
};

/** Sortierbare, kollisionsarme Lauf-ID: Zeitpräfix + UUID-Kürzel. */
export function neueLaufId(): string {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export async function starteLauf(entityId: number, art: LaufArt): Promise<LaufKontext> {
  const runId = neueLaufId();
  let runRowId: number | null = null;
  try {
    const eingefuegt = await db
      .insert(llmRuns)
      .values({ runId, entityId, art })
      .returning({ id: llmRuns.id });
    runRowId = eingefuegt[0]?.id ?? null;
  } catch (err) {
    console.error("[tracing] Lauf konnte nicht angelegt werden:", err);
  }
  return {
    runId,
    entityId,
    art,
    runRowId,
    puffer: [],
    geschrieben: [],
    naechsteSeq: 1,
    letzte: null,
    calls: 0,
    failures: 0,
    costNanoUsd: 0,
  };
}

export type VorgangMeta = {
  engine: string;
  operation: Operation;
  /** Keyword bzw. Prompt-Query — die Kostenursache. */
  anlass: string;
  parentSeq?: number | null;
  /** Nur nötig, wenn das Modell nicht aus der Messung kommt. */
  modell?: string | null;
};

/**
 * Führt `fn` aus, misst sie und puffert eine Trace-Zeile.
 *
 * `messungAus` zieht Modell/Tokens/Dauer aus dem Ergebnis (die Engine-Wrapper
 * liefern das als `messung`). Fehlt es, wird die Wanduhr-Dauer hier gemessen
 * und der Verbrauch als "nicht_verfuegbar" geführt.
 *
 * Wirft `fn`, wird eine Zeile mit ok=0 und Fehlertext gepuffert und der
 * Originalfehler weitergeworfen.
 */
export async function verfolge<T>(
  ctx: LaufKontext,
  meta: VorgangMeta,
  fn: () => Promise<T>,
  messungAus?: (ergebnis: T) => Messung,
): Promise<T> {
  // Flush VOR dem neuen Vorgang, nicht danach: sonst könnte die eben erzeugte
  // Zeile geschrieben sein, bevor der Aufrufer sein Ergebnis verknüpfen kann.
  await vielleichtSchreiben(ctx);

  const beginn = Date.now();
  const startedAt = new Date();
  try {
    const ergebnis = await fn();
    const messung = messungAus?.(ergebnis);
    ctx.letzte = lege(ctx, meta, {
      startedAt,
      latencyMs: messung?.dauerMs ?? Date.now() - beginn,
      ok: 1,
      fehler: null,
      modell: messung?.modell ?? meta.modell ?? null,
      tokensIn: messung?.verbrauch.tokensIn ?? null,
      tokensOut: messung?.verbrauch.tokensOut ?? null,
      tokenQuelle: messung?.verbrauch.quelle ?? "nicht_verfuegbar",
    });
    return ergebnis;
  } catch (err) {
    ctx.letzte = lege(ctx, meta, {
      startedAt,
      latencyMs: Date.now() - beginn,
      ok: 0,
      fehler: err instanceof Error ? err.message : String(err),
      modell: meta.modell ?? null,
      tokensIn: null,
      tokensOut: null,
      tokenQuelle: "nicht_verfuegbar",
    });
    throw err; // durchsichtig — das Tracing verschluckt nichts
  }
}

/**
 * Trägt den von Bedrock intern ausgelösten Serper-Abruf als eigenen Vorgang
 * nach. Er kostet echtes Geld und wäre sonst unsichtbar.
 *
 * Ändert `ctx.letzte` bewusst NICHT — der Bedrock-Vorgang bleibt der, an den
 * der Aufrufer sein Citation-Ergebnis hängt.
 */
export function verfolgeGroundingSerp(
  ctx: LaufKontext,
  anlass: string,
  grounding: { ok: boolean; fehler?: string; dauerMs: number },
): void {
  lege(
    ctx,
    {
      engine: "serper",
      operation: "grounding_serp",
      anlass,
      parentSeq: ctx.letzte?.seq ?? null,
    },
    {
      startedAt: new Date(),
      latencyMs: grounding.dauerMs,
      ok: grounding.ok ? 1 : 0,
      fehler: grounding.fehler ?? null,
      modell: null,
      tokensIn: null,
      tokensOut: null,
      tokenQuelle: "nicht_verfuegbar",
    },
  );
}

type Messwerte = {
  startedAt: Date;
  latencyMs: number;
  ok: number;
  fehler: string | null;
  modell: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokenQuelle: string;
};

function lege(ctx: LaufKontext, meta: VorgangMeta, m: Messwerte): PufferZeile {
  const day = tagUtc(m.startedAt);
  const kosten = berechneKosten({
    engine: meta.engine,
    modell: m.modell,
    datum: day,
    tokensIn: m.tokensIn,
    tokensOut: m.tokensOut,
  });

  const zeile: PufferZeile = {
    runId: ctx.runId,
    seq: ctx.naechsteSeq++,
    parentSeq: meta.parentSeq ?? null,
    entityId: ctx.entityId,
    engine: meta.engine,
    model: m.modell,
    operation: meta.operation,
    // Anlass hart begrenzen: eine überlange Query soll den Trace nicht aufblähen.
    anlass: meta.anlass.slice(0, 500),
    startedAt: m.startedAt,
    day,
    month: monatUtc(m.startedAt),
    latencyMs: m.latencyMs,
    ok: m.ok,
    fehler: m.fehler === null ? null : m.fehler.slice(0, 1000),
    tokensIn: m.tokensIn,
    tokensOut: m.tokensOut,
    tokenQuelle: m.tokenQuelle,
    costNanoUsd: kosten.costNanoUsd,
    costModell: kosten.costModell,
    preisStand: kosten.preisStand,
    aiCitationId: null,
    serpSnapshotId: null,
  };

  ctx.puffer.push(zeile);
  if (m.ok === 1) ctx.calls += 1;
  else ctx.failures += 1;
  ctx.costNanoUsd += kosten.costNanoUsd;
  return zeile;
}

/**
 * Verknüpft den zuletzt verfolgten Vorgang mit seinem Ergebnis
 * (Ergebnis → Lauf). Direkt nach dem Insert des Ergebnisses aufrufen.
 */
export function verknuepfeErgebnis(
  ctx: LaufKontext,
  bezug: { aiCitationId?: number; serpSnapshotId?: number },
): void {
  const zeile = ctx.letzte;
  if (!zeile) return;
  if (bezug.aiCitationId !== undefined) zeile.aiCitationId = bezug.aiCitationId;
  if (bezug.serpSnapshotId !== undefined) zeile.serpSnapshotId = bezug.serpSnapshotId;
}

async function vielleichtSchreiben(ctx: LaufKontext): Promise<void> {
  if (ctx.puffer.length >= FLUSH_SCHWELLE) await schreibePuffer(ctx);
}

async function schreibePuffer(ctx: LaufKontext): Promise<void> {
  if (ctx.puffer.length === 0) return;
  const zeilen = ctx.puffer;
  ctx.puffer = [];
  try {
    await db.insert(llmCalls).values(zeilen);
    ctx.geschrieben.push(...zeilen);
  } catch (err) {
    console.error("[tracing] Trace-Zeilen konnten nicht geschrieben werden:", err);
  }
}

/**
 * Schließt den Lauf ab: Restpuffer schreiben, Monatsverdichtung fortschreiben,
 * llm_runs-Zeile abschließen.
 *
 * neon-http kennt keine Transaktionen — die drei Schritte sind daher nicht
 * atomar. Deshalb ist das Rollup jederzeit aus llm_calls neu berechenbar:
 * scripts/rebuild-cost-rollup.ts.
 */
export async function beendeLauf(ctx: LaufKontext, ok: boolean): Promise<void> {
  await schreibePuffer(ctx);
  await schreibeRollup(ctx);

  if (ctx.runRowId === null) return;
  try {
    await db
      .update(llmRuns)
      .set({
        finishedAt: new Date(),
        ok: ok ? 1 : 0,
        calls: ctx.calls,
        failures: ctx.failures,
        costNanoUsd: ctx.costNanoUsd,
      })
      .where(eq(llmRuns.id, ctx.runRowId));
  } catch (err) {
    console.error("[tracing] Lauf konnte nicht abgeschlossen werden:", err);
  }
}

async function schreibeRollup(ctx: LaufKontext): Promise<void> {
  const verdichtet = fasseZusammen(ctx.geschrieben);
  for (const v of verdichtet) {
    try {
      await db
        .insert(llmCostMonthly)
        .values({ ...v, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [
            llmCostMonthly.month,
            llmCostMonthly.entityId,
            llmCostMonthly.engine,
            llmCostMonthly.model,
          ],
          set: {
            calls: sql`${llmCostMonthly.calls} + ${v.calls}`,
            failures: sql`${llmCostMonthly.failures} + ${v.failures}`,
            tokensIn: sql`${llmCostMonthly.tokensIn} + ${v.tokensIn}`,
            tokensOut: sql`${llmCostMonthly.tokensOut} + ${v.tokensOut}`,
            costNanoUsd: sql`${llmCostMonthly.costNanoUsd} + ${v.costNanoUsd}`,
            unbekannteKosten: sql`${llmCostMonthly.unbekannteKosten} + ${v.unbekannteKosten}`,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.error("[tracing] Rollup fehlgeschlagen:", err);
    }
  }
}
