import { db } from "./db";
import {
  entities,
  keywords,
  targetUrls,
  serpSnapshots,
  serpResults,
  aiCitations,
} from "./schema";
import { eq } from "drizzle-orm";
import { fetchSerp } from "./serper";
import { askGroundedGemini } from "./gemini";
import { askGroundedTavily } from "./tavily";
import { askGroundedBrave } from "./brave";
import { classifyUrl, extractDomain } from "./classify";
import { countByClass, dominationScore } from "./score";
import { AI_CITATION_PROMPTS } from "../data/langkammer";
import {
  detectDisplacementForSnapshot,
  detectRankChangesForKeyword,
  detectScoreDropForKeyword,
  detectCitationLossForEntity,
  detectAuthorityCandidatesForEntity,
  dispatchAlertBatch,
  type GenericAlert,
} from "./alerts";

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

export async function runFetchSerpsForEntity(slug: string): Promise<FetchSerpsReport> {
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error(`Entity ${slug} not found — run \`npm run db:seed\` first.`);

  const [kws, targets] = await Promise.all([
    db.select().from(keywords).where(eq(keywords.entityId, entity.id)),
    db.select().from(targetUrls).where(eq(targetUrls.entityId, entity.id)),
  ]);

  const failed: FetchSerpsReport["failed"] = [];
  const scores: number[] = [];
  const collected: GenericAlert[] = [];

  for (const kw of kws) {
    try {
      const serp = await fetchSerp({
        query: kw.query,
        gl: kw.locale,
        hl: kw.locale,
        location: kw.location,
        num: 10,
      });
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

        const displacements = await detectDisplacementForSnapshot(entity, kw, snapshot.id);
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

  const alertResult = await dispatchAlertBatch(entity, collected);
  return {
    entity: entity.slug,
    processed: kws.length - failed.length,
    failed,
    avgScore: avg,
    alerts: alertResult,
  };
}

export type CitationReport = {
  entity: string;
  prompts: number;
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

export async function runCheckCitationsForEntity(slug: string): Promise<CitationReport> {
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
      enabled: !!process.env.GEMINI_API_KEY,
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
  ].filter((e) => e.enabled);

  const failed: CitationReport["failed"] = [];
  let totalOwned = 0;
  let totalAuthority = 0;
  let runs = 0;

  for (const prompt of AI_CITATION_PROMPTS) {
    for (const engine of engines) {
      try {
        const result = await engine.ask(prompt.query);
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
        failed.push({
          query: `[${engine.name}] ${prompt.query}`,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const citationLoss = await detectCitationLossForEntity(entity);
  const alertResult = await dispatchAlertBatch(entity, citationLoss);

  return {
    entity: entity.slug,
    prompts: runs,
    failed,
    totalOwned,
    totalAuthority,
    alerts: alertResult,
  };
}
