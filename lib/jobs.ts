import { db } from "./db";
import {
  entities,
  keywords,
  targetUrls,
  serpSnapshots,
  serpResults,
  aiCitations,
  citationPrompts,
} from "./schema";
import { and, eq } from "drizzle-orm";
import { fetchSerp } from "./serper";
import { askGroundedGemini } from "./gemini";
import { askGroundedTavily } from "./tavily";
import { askGroundedBrave } from "./brave";
import { askGroundedBedrock } from "./bedrock";
import { classifyUrl, extractDomain } from "./classify";
import { countByClass, dominationScore } from "./score";
import {
  detectDisplacementForSnapshot,
  detectRankChangesForKeyword,
  detectScoreDropForKeyword,
  detectCitationLossForEntity,
  detectAuthorityCandidatesForEntity,
  dispatchAlertBatch,
  emailCombinedDigest,
  sendPeriodicDigest,
  type GenericAlert,
} from "./alerts";
import { pruneOldSnapshotRaw } from "./prune";
import { detectOpsIssues, sendOpsAlert } from "./ops";
import { planFor } from "./plans";
import { recordUsage } from "./usage";

export type FetchSerpsReport = {
  entity: string;
  processed: number;
  failed: { keyword: string; error: string }[];
  avgScore: number;
  alerts: {
    persisted: number;
    emailed: boolean;
    reason?: string;
    byType: Record<string, number>;
  };
};

export async function runFetchSerpsForEntity(
  slug: string,
  opts: { sendEmail?: boolean } = {},
): Promise<FetchSerpsReport & { freshAlerts: GenericAlert[] }> {
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error(`Entity ${slug} not found — run \`npm run db:seed\` first.`);

  const plan = planFor(entity.plan);
  const [allKws, targets] = await Promise.all([
    db
      .select()
      .from(keywords)
      .where(and(eq(keywords.entityId, entity.id), eq(keywords.active, 1)))
      .orderBy(keywords.id),
    db.select().from(targetUrls).where(eq(targetUrls.entityId, entity.id)),
  ]);

  // Safety-Net: Plan-Limit auch hier erzwingen (deterministisch erste N),
  // falls der Admin nach einem Downgrade noch nicht aufgeräumt hat.
  const kws = allKws.slice(0, plan.maxKeywords);
  if (allKws.length > kws.length) {
    console.warn(
      `[jobs] ${slug}: ${allKws.length} aktive Keywords > Plan-Limit ${plan.maxKeywords} — verarbeite nur die ersten ${kws.length}.`,
    );
  }

  const failed: FetchSerpsReport["failed"] = [];
  const scores: number[] = [];
  const collected: GenericAlert[] = [];

  for (const kw of kws) {
    try {
      let serp;
      try {
        serp = await fetchSerp({
          query: kw.query,
          gl: kw.locale,
          hl: kw.locale,
          location: kw.location,
          num: 10,
        });
      } catch (err) {
        await recordUsage(entity.id, "serper", { failures: 1 });
        throw err;
      }
      await recordUsage(entity.id, "serper", { calls: 1 });
      const organic = (serp.organic ?? []).slice(0, 10);
      const classified = organic.map((r) => {
        const c = classifyUrl(r.link, targets);
        return {
          position: r.position,
          url: r.link,
          domain: extractDomain(r.link),
          title: r.title ?? null,
          snippet: r.snippet ?? null,
          classification: c.classification,
          matchedLabel: c.matchedLabel,
        };
      });
      const counts = countByClass(classified, 10);
      const score = dominationScore(classified, 10);
      scores.push(score);

      const [snapshot] = await db
        .insert(serpSnapshots)
        .values({
          keywordId: kw.id,
          dominationScore: score,
          ownedCount: counts.owned,
          authorityCount: counts.authority,
          displacementCount: counts.displacement,
          raw: serp,
        })
        .returning();

      if (classified.length > 0) {
        await db.insert(serpResults).values(
          classified.map((r) => ({
            snapshotId: snapshot.id,
            position: r.position,
            url: r.url,
            domain: r.domain,
            title: r.title,
            snippet: r.snippet,
            classification: r.classification,
            matchedLabel: r.matchedLabel,
          })),
        );

        // Verdrängungs-Analyse ist ein Insights+/Suite-Feature (lib/plans.ts).
        const displacements = plan.displacementAnalysis
          ? await detectDisplacementForSnapshot(entity, kw, snapshot.id)
          : [];
        const rankChanges = await detectRankChangesForKeyword(kw, snapshot.id);
        const scoreDrop = await detectScoreDropForKeyword(kw);
        collected.push(...displacements, ...rankChanges, ...scoreDrop);
      }
    } catch (err) {
      failed.push({
        keyword: kw.query,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  // Entity-weite Detektoren (laufen einmal nach allen Keywords).
  const candidates = await detectAuthorityCandidatesForEntity(entity);
  collected.push(...candidates);

  const alertResult = await dispatchAlertBatch(entity, collected, {
    sendEmail: opts.sendEmail,
  });
  return {
    entity: entity.slug,
    processed: kws.length - failed.length,
    failed,
    avgScore: avg,
    alerts: alertResult,
    freshAlerts: alertResult.fresh,
  };
}

export type CitationReport = {
  entity: string;
  prompts: number;
  /** Anzahl konfigurierter (aktiver) Prompts — für die Ops-Fehlerquote. */
  promptCount: number;
  failed: { query: string; error: string }[];
  totalOwned: number;
  totalAuthority: number;
  alerts: {
    persisted: number;
    emailed: boolean;
    reason?: string;
    byType: Record<string, number>;
  };
};

export async function runCheckCitationsForEntity(
  slug: string,
  opts: { sendEmail?: boolean } = {},
): Promise<CitationReport & { freshAlerts: GenericAlert[] }> {
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error(`Entity ${slug} not found`);
  const targets = await db
    .select()
    .from(targetUrls)
    .where(eq(targetUrls.entityId, entity.id));

  const engines: {
    name: string;
    enabled: boolean;
    ask: (q: string) => Promise<{
      text: string;
      citations: { uri: string; resolvedUrl: string; title?: string }[];
    }>;
  }[] = [
    {
      name: "gemini",
      enabled: true, // Uses Vertex AI with gcloud / VERTEX_ACCESS_TOKEN
      ask: (q: string) => askGroundedGemini(q, {}),
    },
    {
      name: "tavily",
      enabled: !!process.env.TAVILY_API_KEY,
      ask: (q: string) => askGroundedTavily(q, {}),
    },
    {
      name: "brave",
      enabled: !!process.env.BRAVE_API_KEY,
      ask: (q: string) => askGroundedBrave(q, {}),
    },
    {
      name: "bedrock",
      enabled: !!process.env.BEDROCK_API_KEY,
      ask: (q: string) => askGroundedBedrock(q),
    },
  ].filter((e) => e.enabled);

  const prompts = await db
    .select({ query: citationPrompts.query, topic: citationPrompts.topic })
    .from(citationPrompts)
    .where(and(eq(citationPrompts.entityId, entity.id), eq(citationPrompts.active, 1)));

  const failed: CitationReport["failed"] = [];
  let totalOwned = 0;
  let totalAuthority = 0;
  let runs = 0;

  for (const prompt of prompts) {
    for (const engine of engines) {
      try {
        const result = await engine.ask(prompt.query);
        await recordUsage(entity.id, engine.name, { calls: 1 });
        const cited = result.citations.map((c) => {
          const cls = classifyUrl(c.resolvedUrl, targets);
          return {
            url: c.resolvedUrl,
            title: c.title,
            classification: cls.classification,
          };
        });
        const ownedHits = cited.filter((c) => c.classification === "owned").length;
        const authorityHits = cited.filter((c) => c.classification === "authority").length;
        totalOwned += ownedHits;
        totalAuthority += authorityHits;

        await db.insert(aiCitations).values({
          entityId: entity.id,
          engine: engine.name,
          query: prompt.query,
          responseText: result.text,
          citedUrls: cited,
          ownedHits,
          authorityHits,
          totalCitations: cited.length,
        });
        runs++;
      } catch (err) {
        await recordUsage(entity.id, engine.name, { failures: 1 });
        failed.push({
          query: `[${engine.name}] ${prompt.query}`,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const citationLoss = await detectCitationLossForEntity(entity);
  const alertResult = await dispatchAlertBatch(entity, citationLoss, {
    sendEmail: opts.sendEmail,
  });

  return {
    entity: entity.slug,
    prompts: runs,
    promptCount: prompts.length,
    failed,
    totalOwned,
    totalAuthority,
    alerts: alertResult,
    freshAlerts: alertResult.fresh,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Digest: beide Sub-Jobs hintereinander, EINE kombinierte Mail
// ─────────────────────────────────────────────────────────────────────────────

export type DailyDigestReport = {
  entity: string;
  serps: FetchSerpsReport;
  citations: CitationReport;
  combinedAlerts: number;
  digest: {
    emailed: boolean;
    reason?: string;
    byType: Record<string, number>;
  };
};

export async function runDailyDigestForEntity(slug: string): Promise<DailyDigestReport> {
  const serps = await runFetchSerpsForEntity(slug, { sendEmail: false });
  const citations = await runCheckCitationsForEntity(slug, { sendEmail: false });

  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error(`Entity ${slug} not found`);

  const combined: GenericAlert[] = [...serps.freshAlerts, ...citations.freshAlerts];
  const digest = await emailCombinedDigest(entity, combined);

  // Reports ohne freshAlerts zurückgeben (kürzer im JSON-Output)
  const { freshAlerts: _s, ...serpReport } = serps;
  const { freshAlerts: _c, ...citationReport } = citations;
  void _s;
  void _c;

  return {
    entity: entity.slug,
    serps: serpReport,
    citations: citationReport,
    combinedAlerts: combined.length,
    digest,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Täglich sammeln (KEINE Mail) — Alerts werden mit emailSent=0 persistiert
// ─────────────────────────────────────────────────────────────────────────────

export type CollectionReport = {
  entity: string;
  serps: FetchSerpsReport;
  citations: CitationReport;
  persistedAlerts: number;
  prunedRawRows: number;
};

export async function runDailyCollectionForEntity(slug: string): Promise<CollectionReport> {
  const serps = await runFetchSerpsForEntity(slug, { sendEmail: false });
  const citations = await runCheckCitationsForEntity(slug, { sendEmail: false });

  const persisted =
    (serps.alerts?.persisted ?? 0) + (citations.alerts?.persisted ?? 0);

  // Housekeeping: alte Roh-SERP-JSONs leeren (Storage-Schutz). Läuft im
  // täglichen Collect mit, daher kein zusätzlicher Cron nötig.
  const prune = await pruneOldSnapshotRaw();

  const { freshAlerts: _s, ...serpReport } = serps;
  const { freshAlerts: _c, ...citationReport } = citations;
  void _s;
  void _c;

  return {
    entity: slug,
    serps: serpReport,
    citations: citationReport,
    persistedAlerts: persisted,
    prunedRawRows: prune.pruned,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Periodischer Report (z. B. wöchentlich) — bündelt alle noch nicht
// gemailten Alerts in EINE Mail
// ─────────────────────────────────────────────────────────────────────────────

export type SendDigestReport = {
  entity: string;
  emailed: boolean;
  count: number;
  reason?: string;
  byType: Record<string, number>;
};

export async function runSendDigestForEntity(
  slug: string,
  opts: { periodLabel?: string } = {},
): Promise<SendDigestReport> {
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error(`Entity ${slug} not found`);

  const result = await sendPeriodicDigest(entity, {
    periodLabel: opts.periodLabel ?? "in der letzten Woche",
  });
  return { entity: entity.slug, ...result };
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Entity-Wrapper für die Crons — laufen über ALLE Entities in der DB
// ─────────────────────────────────────────────────────────────────────────────

/** Nur aktive Tenants — pausierte/gekündigte werden weder getrackt noch gemailt. */
async function allEntitySlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: entities.slug })
    .from(entities)
    .where(eq(entities.status, "active"));
  return rows.map((r) => r.slug);
}

export async function runDailyCollectionForAllEntities(): Promise<CollectionReport[]> {
  const slugs = await allEntitySlugs();
  const reports: CollectionReport[] = [];
  for (const slug of slugs) {
    reports.push(await runDailyCollectionForEntity(slug));
  }

  // Betriebs-Überwachung: gehäufte Fehler / ausgeschöpfte Limits → Ops-Mail.
  try {
    const issues = detectOpsIssues(reports);
    if (issues.length > 0) await sendOpsAlert(issues, "Daily Collect");
  } catch (err) {
    console.error("[ops] detection failed:", err);
  }

  return reports;
}

export async function runSendDigestForAllEntities(): Promise<SendDigestReport[]> {
  const slugs = await allEntitySlugs();
  const reports: SendDigestReport[] = [];
  for (const slug of slugs) {
    reports.push(await runSendDigestForEntity(slug));
  }
  return reports;
}
