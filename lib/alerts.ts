import { db } from "./db";
import {
  alerts,
  aiCitations,
  serpResults,
  serpSnapshots,
  targetUrls,
  keywords,
  type Entity,
  type Keyword,
} from "./schema";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { sendEmail } from "./resend";
import { extractDomain } from "./classify";
import { computeWantedCoverage, type WantedCoverage } from "./coverage";
import { planFor } from "./plans";

/**
 * Empfänger der Kunden-Reports: per-Tenant reportEmails; Fallback auf die
 * globale ALERT_EMAIL_TO nur solange ein Tenant noch keine Adresse hat
 * (Übergangsschutz — Ops-Mails laufen separat über OPS_EMAIL_TO).
 */
function recipientsFor(entity: Entity): string | undefined {
  const list = (entity.reportEmails ?? []).filter(Boolean);
  if (list.length > 0) return list.join(",");
  return process.env.ALERT_EMAIL_TO || undefined;
}

const DEDUP_WINDOW_DAYS = 7;
const RANK_DEDUP_DAYS = 3;
const CANDIDATE_DEDUP_DAYS = 14;
const TOP_THRESHOLD = 3;
const TOP_N = 10;
const SCORE_DROP_THRESHOLD = 15;
const SCORE_DROP_LOOKBACK_DAYS = 7;
const CANDIDATE_TOP_N = 5;
const CANDIDATE_MIN_HITS = 3;
const CANDIDATE_LOOKBACK_DAYS = 7;
const CITATION_LOSS_LOOKBACK_RUNS = 3;
const CITATION_LOSS_MIN_HITS = 2;

export type AlertType =
  | "displacement_top3"
  | "rank_drop"
  | "rank_gain"
  | "score_drop"
  | "citation_loss"
  | "authority_candidate";

export type Severity = "critical" | "high" | "warning" | "info";

export type GenericAlert = {
  type: AlertType;
  severity: Severity;
  dedupKey: string;
  subject: string;
  payload: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1) Displacement in Top 3 (vorhandene Logik)
// ─────────────────────────────────────────────────────────────────────────────

export type DisplacementHit = {
  keyword: string;
  position: number;
  url: string;
  domain: string;
  matchedLabel: string | null;
};

export async function detectDisplacementForSnapshot(
  entity: Entity,
  keyword: Keyword,
  snapshotId: number,
): Promise<GenericAlert[]> {
  const rows = await db
    .select()
    .from(serpResults)
    .where(
      and(
        eq(serpResults.snapshotId, snapshotId),
        eq(serpResults.classification, "displacement"),
      ),
    );
  const top = rows.filter((r) => r.position <= TOP_THRESHOLD);
  if (top.length === 0) return [];

  return top.map((r) => {
    const sev: Severity = r.position === 1 ? "critical" : r.position === 2 ? "high" : "warning";
    return {
      type: "displacement_top3",
      severity: sev,
      dedupKey: `disp:${keyword.id}:${r.url}`,
      subject: `Displacement Top ${TOP_THRESHOLD}: ${r.domain} @ #${r.position} für "${keyword.query}"`,
      payload: {
        keyword: keyword.query,
        position: r.position,
        url: r.url,
        domain: r.domain,
        matchedLabel: r.matchedLabel ?? null,
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Rank-Changes (Drops & Gains) für Owned/Authority
// ─────────────────────────────────────────────────────────────────────────────

export async function detectRankChangesForKeyword(
  keyword: Keyword,
  currentSnapshotId: number,
): Promise<GenericAlert[]> {
  // Hole die zwei jüngsten Snapshots: [0] = current, [1] = previous
  const snaps = await db
    .select({ id: serpSnapshots.id })
    .from(serpSnapshots)
    .where(eq(serpSnapshots.keywordId, keyword.id))
    .orderBy(desc(serpSnapshots.fetchedAt))
    .limit(2);
  if (snaps.length < 2) return []; // kein Vorgänger

  const [curr, prev] = snaps;
  const [currRows, prevRows] = await Promise.all([
    db.select().from(serpResults).where(eq(serpResults.snapshotId, curr.id)),
    db.select().from(serpResults).where(eq(serpResults.snapshotId, prev.id)),
  ]);

  const prevByUrl = new Map(prevRows.map((r) => [r.url, r]));
  const currByUrl = new Map(currRows.map((r) => [r.url, r]));
  const out: GenericAlert[] = [];

  // Drops: owned/authority die im prev <=TOP_N waren und jetzt schlechter sind
  for (const p of prevRows) {
    if (p.classification !== "owned" && p.classification !== "authority") continue;
    if (p.position > TOP_N) continue;
    const c = currByUrl.get(p.url);
    const newPos = c?.position ?? null;
    const droppedOut = newPos === null || newPos > TOP_N;
    const droppedFar = newPos !== null && newPos - p.position >= 3;
    if (!droppedOut && !droppedFar) continue;

    let sev: Severity;
    if (p.position <= TOP_THRESHOLD && droppedOut) sev = "critical";
    else if (p.position <= 5 && droppedOut) sev = "high";
    else sev = "warning";

    out.push({
      type: "rank_drop",
      severity: sev,
      dedupKey: `rank_drop:${keyword.id}:${p.url}`,
      subject: `Rank-Drop: ${p.domain} #${p.position} → ${newPos ?? "out"} für "${keyword.query}"`,
      payload: {
        keyword: keyword.query,
        url: p.url,
        domain: p.domain,
        matchedLabel: p.matchedLabel ?? null,
        classification: p.classification,
        prevPosition: p.position,
        newPosition: newPos,
        droppedOut,
      },
    });
  }

  // Gains: owned-URLs die jetzt besser sind (neu in Top10, neu in Top3, oder >=3 besser)
  for (const c of currRows) {
    if (c.classification !== "owned") continue;
    if (c.position > TOP_N) continue;
    const p = prevByUrl.get(c.url);
    const prevPos = p?.position ?? null;
    const newInTop10 = prevPos === null || prevPos > TOP_N;
    const newInTop3 = (prevPos === null || prevPos > TOP_THRESHOLD) && c.position <= TOP_THRESHOLD;
    const jumpedUp = prevPos !== null && prevPos - c.position >= 3;
    if (!newInTop10 && !newInTop3 && !jumpedUp) continue;

    let sev: Severity;
    if (c.position === 1) sev = "critical";
    else if (newInTop3) sev = "high";
    else sev = "info";

    out.push({
      type: "rank_gain",
      severity: sev,
      dedupKey: `rank_gain:${keyword.id}:${c.url}`,
      subject: `Rank-Gain: ${c.domain} ${prevPos ? `#${prevPos} → #${c.position}` : `neu #${c.position}`} für "${keyword.query}"`,
      payload: {
        keyword: keyword.query,
        url: c.url,
        domain: c.domain,
        matchedLabel: c.matchedLabel ?? null,
        classification: c.classification,
        prevPosition: prevPos,
        newPosition: c.position,
      },
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Score-Drop pro Keyword
// ─────────────────────────────────────────────────────────────────────────────

export async function detectScoreDropForKeyword(
  keyword: Keyword,
): Promise<GenericAlert[]> {
  const cutoff = new Date(Date.now() - SCORE_DROP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const snaps = await db
    .select({
      id: serpSnapshots.id,
      score: serpSnapshots.dominationScore,
      fetchedAt: serpSnapshots.fetchedAt,
    })
    .from(serpSnapshots)
    .where(
      and(
        eq(serpSnapshots.keywordId, keyword.id),
        gte(serpSnapshots.fetchedAt, cutoff),
      ),
    )
    .orderBy(desc(serpSnapshots.fetchedAt));
  if (snaps.length < 4) return []; // brauchen genug History

  const [current, ...prev] = snaps;
  const avgPrev = prev.reduce((a, s) => a + s.score, 0) / prev.length;
  const drop = avgPrev - current.score;
  if (drop < SCORE_DROP_THRESHOLD) return [];

  const sev: Severity = drop >= 25 ? "high" : "warning";
  return [
    {
      type: "score_drop",
      severity: sev,
      dedupKey: `score_drop:${keyword.id}`,
      subject: `Score-Drop ${Math.round(avgPrev)} → ${current.score} (-${Math.round(drop)}) für "${keyword.query}"`,
      payload: {
        keyword: keyword.query,
        currentScore: current.score,
        avgPrev: Math.round(avgPrev),
        drop: Math.round(drop),
        lookbackDays: SCORE_DROP_LOOKBACK_DAYS,
      },
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Citation-Loss: Owned/Authority URL fehlt im aktuellen Engine-Run
// ─────────────────────────────────────────────────────────────────────────────

export async function detectCitationLossForEntity(
  entity: Entity,
): Promise<GenericAlert[]> {
  // Pro engine: hole die letzten N runs in zeitlicher Reihenfolge,
  // sammle pro URL die Häufigkeit in den prev runs vs. fehlend im current.
  const recent = await db
    .select()
    .from(aiCitations)
    .where(eq(aiCitations.entityId, entity.id))
    .orderBy(desc(aiCitations.fetchedAt))
    .limit(CITATION_LOSS_LOOKBACK_RUNS * 30);

  if (recent.length === 0) return [];

  const byEngine = new Map<string, typeof recent>();
  for (const row of recent) {
    if (!byEngine.has(row.engine)) byEngine.set(row.engine, []);
    byEngine.get(row.engine)!.push(row);
  }

  const out: GenericAlert[] = [];

  for (const [engine, rows] of byEngine) {
    // Gruppiere die Citation-Runs nach fetchedAt-Tag (jeder Cron-Run schreibt
    // mehrere Prompt-Zeilen kurz hintereinander).
    const byBucket = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.fetchedAt.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      if (!byBucket.has(key)) byBucket.set(key, []);
      byBucket.get(key)!.push(r);
    }
    const buckets = Array.from(byBucket.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, CITATION_LOSS_LOOKBACK_RUNS);
    if (buckets.length < CITATION_LOSS_LOOKBACK_RUNS) continue;

    const [currentBucket, ...prevBuckets] = buckets;
    const currentUrls = new Set<string>();
    for (const r of currentBucket[1]) {
      for (const c of r.citedUrls) currentUrls.add(c.url);
    }

    // Pro URL: Zähl-Anzahl in prev-buckets + halte die Klassifikation fest.
    const prevCounts = new Map<string, { count: number; classification: string; title?: string }>();
    for (const [, prevRows] of prevBuckets) {
      const seenInBucket = new Set<string>();
      for (const r of prevRows) {
        for (const c of r.citedUrls) {
          if (seenInBucket.has(c.url)) continue;
          seenInBucket.add(c.url);
          if (c.classification !== "owned" && c.classification !== "authority") continue;
          const cur = prevCounts.get(c.url) ?? {
            count: 0,
            classification: c.classification,
            title: c.title,
          };
          cur.count += 1;
          prevCounts.set(c.url, cur);
        }
      }
    }

    for (const [url, info] of prevCounts) {
      if (info.count < CITATION_LOSS_MIN_HITS) continue;
      if (currentUrls.has(url)) continue;
      const sev: Severity = info.classification === "owned" ? "high" : "warning";
      out.push({
        type: "citation_loss",
        severity: sev,
        dedupKey: `cit_loss:${engine}:${url}`,
        subject: `Citation-Loss (${engine}): ${info.title ?? url}`,
        payload: {
          engine,
          url,
          title: info.title ?? null,
          classification: info.classification,
          previousHits: info.count,
          totalPrevRuns: prevBuckets.length,
        },
      });
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) New-Authority-Candidates: neutrale Domains in Top5 der letzten 7 Tage
// ─────────────────────────────────────────────────────────────────────────────

export async function detectAuthorityCandidatesForEntity(
  entity: Entity,
): Promise<GenericAlert[]> {
  const cutoff = new Date(Date.now() - CANDIDATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      domain: serpResults.domain,
      url: serpResults.url,
      title: serpResults.title,
      position: serpResults.position,
      classification: serpResults.classification,
    })
    .from(serpResults)
    .innerJoin(serpSnapshots, eq(serpResults.snapshotId, serpSnapshots.id))
    .where(gte(serpSnapshots.fetchedAt, cutoff));

  if (rows.length === 0) return [];

  // Hole alle bekannten Pattern-Stämme (Domain-Vorderteil), damit wir bereits
  // erfasste Domains nicht erneut vorschlagen.
  const knownTargets = await db
    .select({ pattern: targetUrls.pattern })
    .from(targetUrls)
    .where(eq(targetUrls.entityId, entity.id));
  const knownDomains = new Set(
    knownTargets
      .map((t) => t.pattern.split("/")[0].toLowerCase())
      .filter((d) => d.length > 0),
  );

  type CandidateAcc = {
    domain: string;
    hits: number;
    bestPosition: number;
    samples: { url: string; title: string | null; position: number }[];
  };
  const acc = new Map<string, CandidateAcc>();
  for (const r of rows) {
    if (r.classification !== "neutral") continue;
    if (r.position > CANDIDATE_TOP_N) continue;
    if (knownDomains.has(r.domain.toLowerCase())) continue;
    const cur = acc.get(r.domain) ?? {
      domain: r.domain,
      hits: 0,
      bestPosition: r.position,
      samples: [],
    };
    cur.hits += 1;
    cur.bestPosition = Math.min(cur.bestPosition, r.position);
    const alreadyHasUrl = cur.samples.some((s) => s.url === r.url);
    if (!alreadyHasUrl && cur.samples.length < 3) {
      cur.samples.push({ url: r.url, title: r.title ?? null, position: r.position });
    }
    acc.set(r.domain, cur);
  }

  const candidates = Array.from(acc.values()).filter(
    (c) => c.hits >= CANDIDATE_MIN_HITS,
  );

  return candidates.map((c) => ({
    type: "authority_candidate" as const,
    severity: "info" as Severity,
    dedupKey: `auth_candidate:${c.domain}`,
    subject: `Neue Authority-Kandidatin: ${c.domain} (${c.hits}× in Top ${CANDIDATE_TOP_N}, best #${c.bestPosition})`,
    payload: {
      domain: c.domain,
      hits: c.hits,
      bestPosition: c.bestPosition,
      lookbackDays: CANDIDATE_LOOKBACK_DAYS,
      samples: c.samples,
    },
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic Dispatcher: dedup, persist, mail
// ─────────────────────────────────────────────────────────────────────────────

const DEDUP_DAYS_BY_TYPE: Record<AlertType, number> = {
  displacement_top3: DEDUP_WINDOW_DAYS,
  rank_drop: RANK_DEDUP_DAYS,
  rank_gain: RANK_DEDUP_DAYS,
  score_drop: RANK_DEDUP_DAYS,
  citation_loss: DEDUP_WINDOW_DAYS,
  authority_candidate: CANDIDATE_DEDUP_DAYS,
};

export type DispatchResult = {
  persisted: number;
  emailed: boolean;
  reason?: string;
  byType: Record<string, number>;
  /** Frisch persistierte Alerts (für nachgelagertes Mailen) */
  fresh: GenericAlert[];
};

export async function dispatchAlertBatch(
  entity: Entity,
  candidates: GenericAlert[],
  opts: { sendEmail?: boolean } = {},
): Promise<DispatchResult> {
  const sendEmail = opts.sendEmail !== false; // default true
  const byType: Record<string, number> = {};
  if (candidates.length === 0) {
    return { persisted: 0, emailed: false, reason: "no-candidates", byType, fresh: [] };
  }

  // Dedup pro Typ gegen vorhandene Alerts im jeweiligen Window.
  const fresh: GenericAlert[] = [];
  // Gruppiere candidates nach Typ damit wir pro Typ die letzten Dedup-Keys lesen.
  const grouped = new Map<AlertType, GenericAlert[]>();
  for (const c of candidates) {
    if (!grouped.has(c.type)) grouped.set(c.type, []);
    grouped.get(c.type)!.push(c);
  }
  for (const [type, items] of grouped) {
    const windowDays = DEDUP_DAYS_BY_TYPE[type];
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const keys = items.map((i) => i.dedupKey);
    const recent = await db
      .select({ dedupKey: alerts.dedupKey })
      .from(alerts)
      .where(
        and(
          eq(alerts.entityId, entity.id),
          eq(alerts.type, type),
          inArray(alerts.dedupKey, keys),
          gte(alerts.createdAt, cutoff),
        ),
      );
    const seen = new Set(recent.map((r) => r.dedupKey));
    for (const item of items) {
      if (!seen.has(item.dedupKey)) fresh.push(item);
    }
  }

  if (fresh.length === 0) {
    return { persisted: 0, emailed: false, reason: "all-deduped", byType, fresh: [] };
  }

  const persistRows = fresh.map((a) => ({
    entityId: entity.id,
    type: a.type,
    severity: a.severity,
    dedupKey: a.dedupKey,
    subject: a.subject,
    payload: a.payload,
    emailSent: 0,
  }));
  const inserted = await db.insert(alerts).values(persistRows).returning({ id: alerts.id });
  const insertedIds = inserted.map((i) => i.id);

  for (const a of fresh) byType[a.type] = (byType[a.type] ?? 0) + 1;

  if (!sendEmail) {
    return { persisted: inserted.length, emailed: false, reason: "skip-email", byType, fresh };
  }

  const to = recipientsFor(entity);
  if (!to) {
    return { persisted: inserted.length, emailed: false, reason: "no-recipient", byType, fresh };
  }

  try {
    const sent = await mailDigest(entity, fresh, to);
    if (sent) {
      await db
        .update(alerts)
        .set({ emailSent: 1 })
        .where(inArray(alerts.id, insertedIds));
      return { persisted: inserted.length, emailed: true, byType, fresh };
    }
    return { persisted: inserted.length, emailed: false, reason: "resend-key-missing", byType, fresh };
  } catch (err) {
    console.error("[alerts] email dispatch failed:", err);
    return {
      persisted: inserted.length,
      emailed: false,
      reason: err instanceof Error ? err.message : String(err),
      byType,
      fresh,
    };
  }
}

/**
 * Sendet eine kombinierte Digest-Mail über bereits persistierte fresh-Alerts
 * mehrerer Jobs (z. B. SERPs + Citations) und markiert sie als gemailt.
 */
export async function emailCombinedDigest(
  entity: Entity,
  alertsList: GenericAlert[],
): Promise<{ emailed: boolean; reason?: string; byType: Record<string, number> }> {
  const byType: Record<string, number> = {};
  for (const a of alertsList) byType[a.type] = (byType[a.type] ?? 0) + 1;
  if (alertsList.length === 0) return { emailed: false, reason: "no-alerts", byType };

  const to = recipientsFor(entity);
  if (!to) return { emailed: false, reason: "no-recipient", byType };

  try {
    const sent = await mailDigest(entity, alertsList, to);
    if (!sent) return { emailed: false, reason: "resend-key-missing", byType };

    const dedupKeys = alertsList.map((a) => a.dedupKey);
    if (dedupKeys.length > 0) {
      await db
        .update(alerts)
        .set({ emailSent: 1 })
        .where(
          and(
            eq(alerts.entityId, entity.id),
            inArray(alerts.dedupKey, dedupKeys),
          ),
        );
    }
    return { emailed: true, byType };
  } catch (err) {
    console.error("[alerts] combined digest dispatch failed:", err);
    return {
      emailed: false,
      reason: err instanceof Error ? err.message : String(err),
      byType,
    };
  }
}

async function mailDigest(
  entity: Entity,
  alertsList: GenericAlert[],
  to: string,
  opts: {
    periodLabel?: string;
    avgScore?: number;
    nameTopicScore?: number;
    latestAiScore?: number;
    last7Days?: {
      dateStr: string;
      label: string;
      domination: number | null;
      nameTopic: number | null;
      ai: number | null;
    }[];
    coverage?: WantedCoverage | null;
  } = {},
): Promise<boolean> {
  const byType: Record<string, number> = {};
  for (const a of alertsList) byType[a.type] = (byType[a.type] ?? 0) + 1;
  const subject = renderDigestSubject(entity, byType);
  const html = renderDigestHtml(entity, alertsList, byType, opts);
  const sent = await sendEmail({ to, subject, html });
  return !!sent;
}

/**
 * Periodischer Report: bündelt ALLE noch nicht gemailten Alerts (emailSent=0)
 * eines Entities in eine Mail — unabhängig davon, an welchem Tag sie erfasst
 * wurden. So sammelt der Cron täglich, mailt aber nur im gewünschten Rhythmus.
 */
export async function sendPeriodicDigest(
  entity: Entity,
  opts: { periodLabel?: string; safetyDays?: number } = {},
): Promise<{ emailed: boolean; count: number; reason?: string; byType: Record<string, number> }> {
  const safetyDays = opts.safetyDays ?? 30;
  const cutoff = new Date(Date.now() - safetyDays * 24 * 60 * 60 * 1000);
  const pending = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.entityId, entity.id),
        eq(alerts.emailSent, 0),
        gte(alerts.createdAt, cutoff),
      ),
    )
    .orderBy(desc(alerts.createdAt));

  const byType: Record<string, number> = {};
  for (const r of pending) byType[r.type] = (byType[r.type] ?? 0) + 1;

  if (pending.length === 0) {
    return { emailed: false, count: 0, reason: "no-pending", byType };
  }

  const to = recipientsFor(entity);
  if (!to) {
    return { emailed: false, count: pending.length, reason: "no-recipient", byType };
  }

  const list: GenericAlert[] = pending.map((r) => ({
    type: r.type as AlertType,
    severity: r.severity as Severity,
    dedupKey: r.dedupKey,
    subject: r.subject,
    payload: r.payload as Record<string, unknown>,
  }));

  const periodLabel = opts.periodLabel ?? "seit dem letzten Report";

  // Fetch scores and history for the email
  let avgScore = 0;
  let nameTopicScore = 0;
  let latestAiScore = 0;
  let last7Days: { dateStr: string; label: string; domination: number | null; nameTopic: number | null; ai: number | null }[] = [];

  try {
    const kws = await db.select().from(keywords).where(eq(keywords.entityId, entity.id));
    if (kws.length > 0) {
      const kwIds = kws.map((k) => k.id);
      
      // 1. Current averages (Domination and Name + Topic)
      const latestSnaps = await Promise.all(
        kws.map(async (kw) => {
          const snap = (
            await db
              .select({
                dominationScore: serpSnapshots.dominationScore,
              })
              .from(serpSnapshots)
              .where(eq(serpSnapshots.keywordId, kw.id))
              .orderBy(desc(serpSnapshots.fetchedAt))
              .limit(1)
          )[0];
          return { keyword: kw, snapshot: snap };
        }),
      );
      const tracked = latestSnaps.filter((l) => l.snapshot);
      avgScore = tracked.length
        ? Math.round(
            tracked.reduce((a, l) => a + (l.snapshot?.dominationScore ?? 0), 0) / tracked.length,
          )
        : 0;

      const nameTopicTracked = tracked.filter((l) => l.keyword.cluster === "name_topic");
      nameTopicScore = nameTopicTracked.length
        ? Math.round(
            nameTopicTracked.reduce((a, l) => a + (l.snapshot?.dominationScore ?? 0), 0) / nameTopicTracked.length,
          )
        : 0;

      // 2. AI Citations history and latest
      const allCitations = await db
        .select({
          fetchedAt: aiCitations.fetchedAt,
          ownedHits: aiCitations.ownedHits,
          authorityHits: aiCitations.authorityHits,
        })
        .from(aiCitations)
        .where(eq(aiCitations.entityId, entity.id))
        .orderBy(aiCitations.fetchedAt);

      const aiHistoryMap: Record<string, { hits: number; total: number }> = {};
      for (const c of allCitations) {
        const dateStr = c.fetchedAt.toISOString().slice(0, 10);
        if (!aiHistoryMap[dateStr]) {
          aiHistoryMap[dateStr] = { hits: 0, total: 0 };
        }
        const isHit = c.ownedHits > 0 || c.authorityHits > 0;
        if (isHit) aiHistoryMap[dateStr].hits += 1;
        aiHistoryMap[dateStr].total += 1;
      }

      const aiHistory = Object.entries(aiHistoryMap)
        .map(([date, info]) => ({
          date,
          score: Math.round((info.hits / info.total) * 100),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      latestAiScore = aiHistory.length > 0 ? aiHistory[aiHistory.length - 1].score : 0;

      // 3. Historical snapshots for Domination and Name + Topic (last 7 days)
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const historySnaps = await db
        .select({
          dominationScore: serpSnapshots.dominationScore,
          fetchedAt: serpSnapshots.fetchedAt,
          keywordId: serpSnapshots.keywordId,
        })
        .from(serpSnapshots)
        .where(
          and(
            inArray(serpSnapshots.keywordId, kwIds),
            gte(serpSnapshots.fetchedAt, cutoffDate),
          ),
        )
        .orderBy(serpSnapshots.fetchedAt);

      const dominationHistoryMap: Record<string, { sum: number; count: number }> = {};
      const nameTopicHistoryMap: Record<string, { sum: number; count: number }> = {};

      const nameTopicKwIdsSet = new Set(kws.filter((k) => k.cluster === "name_topic").map((k) => k.id));

      for (const s of historySnaps) {
        const dateStr = s.fetchedAt.toISOString().slice(0, 10);
        
        // Domination
        if (!dominationHistoryMap[dateStr]) {
          dominationHistoryMap[dateStr] = { sum: 0, count: 0 };
        }
        dominationHistoryMap[dateStr].sum += s.dominationScore;
        dominationHistoryMap[dateStr].count += 1;

        // Name + Topic
        if (nameTopicKwIdsSet.has(s.keywordId)) {
          if (!nameTopicHistoryMap[dateStr]) {
            nameTopicHistoryMap[dateStr] = { sum: 0, count: 0 };
          }
          nameTopicHistoryMap[dateStr].sum += s.dominationScore;
          nameTopicHistoryMap[dateStr].count += 1;
        }
      }

      const dominationHistory = Object.entries(dominationHistoryMap).map(([date, info]) => ({
        date,
        score: Math.round(info.sum / info.count),
      }));

      const nameTopicHistory = Object.entries(nameTopicHistoryMap).map(([date, info]) => ({
        date,
        score: Math.round(info.sum / info.count),
      }));

      // Generate the last 7 calendar days
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const yyyymmdd = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

        const domVal = dominationHistory.find((h) => h.date === yyyymmdd)?.score ?? null;
        const ntVal = nameTopicHistory.find((h) => h.date === yyyymmdd)?.score ?? null;
        const aiVal = aiHistory.find((h) => h.date === yyyymmdd)?.score ?? null;

        last7Days.push({
          dateStr: yyyymmdd,
          label,
          domination: domVal,
          nameTopic: ntVal,
          ai: aiVal,
        });
      }
    }
  } catch (err) {
    console.error("[alerts] error fetching scores for email digest:", err);
  }

  // Wunschlink-Abdeckung ist ein Insights+/Suite-Feature (lib/plans.ts).
  const coverage = planFor(entity.plan).wantedLinkCoverage
    ? await computeWantedCoverage(entity.id).catch(() => null)
    : null;

  try {
    const sent = await mailDigest(entity, list, to, {
      periodLabel,
      avgScore,
      nameTopicScore,
      latestAiScore,
      last7Days,
      coverage,
    });
    if (!sent) {
      return { emailed: false, count: pending.length, reason: "resend-key-missing", byType };
    }
    await db
      .update(alerts)
      .set({ emailSent: 1 })
      .where(inArray(alerts.id, pending.map((p) => p.id)));
    return { emailed: true, count: pending.length, byType };
  } catch (err) {
    console.error("[alerts] periodic digest dispatch failed:", err);
    return {
      emailed: false,
      count: pending.length,
      reason: err instanceof Error ? err.message : String(err),
      byType,
    };
  }
}

const TYPE_LABEL: Record<AlertType, string> = {
  displacement_top3: "Displacement in Top 3",
  rank_drop: "Ranking-Verlust",
  rank_gain: "Ranking-Gewinn",
  score_drop: "Score-Drop",
  citation_loss: "Citation-Loss",
  authority_candidate: "Authority-Kandidat",
};

type TypeExplanation = { meaning: string; action: string };

const TYPE_EXPLANATION: Record<AlertType, TypeExplanation> = {
  displacement_top3: {
    meaning:
      "Eine unerwünschte Verzeichnis-Domain (Telefonbuch, Yasni, Northdata o. ä.) belegt einen der drei Spitzenplätze für ein getracktes Keyword — sie verdrängt damit eigene oder Authority-Inhalte aus dem sichtbarsten SERP-Bereich.",
    action:
      "Mit besser passenden Owned- oder Authority-Inhalten gegensteuern (neuer LinkedIn-Post zum Thema, Gastbeitrag platzieren, vorhandene Authority-Seite gezielt verlinken).",
  },
  rank_drop: {
    meaning:
      "Eine eigene oder als Authority gepflegte URL ist im Ranking spürbar gefallen oder ganz aus den Top 10 verschwunden. Klassischer Frühwarn-Indikator für Sichtbarkeits-Verlust.",
    action:
      "Erst 1–2 Tage beobachten (oft Tages-Volatilität). Hält der Verlust an: Content prüfen, neue Backlinks setzen, ggf. mit einem aktuellen Post auf der eigenen Domain refreshen.",
  },
  rank_gain: {
    meaning:
      "Eine eigene URL hat Position gewonnen — neue Top-10-Platzierung, Sprung in die Top 3 oder ≥3 Plätze besser. Das ist die Bestätigung, dass eine SEO-Maßnahme greift.",
    action:
      "Den Treiber identifizieren (welcher Post / welche Verlinkung war es) und das Muster wiederholen. Bei Position 1 die URL aktiv halten und mit weiteren Signalen absichern.",
  },
  score_drop: {
    meaning:
      "Der Domination-Score eines Keywords liegt deutlich unter dem 7-Tage-Durchschnitt — d. h. der Anteil von Owned + Authority in den Top 10 ist gesunken bzw. Displacement ist gestiegen.",
    action:
      "Das Keyword im Detail anschauen (Dashboard → /keywords): welche Domains haben deine Slots übernommen? Daraus eine Verdrängungs-Taktik ableiten.",
  },
  citation_loss: {
    meaning:
      "Eine zuvor von einer KI-Engine (Gemini/Tavily/Brave) verlässlich zitierte Owned/Authority-Quelle wird im aktuellen Run nicht mehr genannt. Hat direkten Einfluss auf KI-Sichtbarkeit (AI-Search).",
    action:
      "Erst prüfen, ob die Quelle noch live & gut auffindbar ist. Bei Bedarf den Content aktualisieren, Schema.org-Markup ergänzen oder neue, frische Variante des Themas veröffentlichen.",
  },
  authority_candidate: {
    meaning:
      "Eine bisher nicht klassifizierte Domain taucht regelmäßig in den Top 5 für deine Themen-Keywords auf — sie verdient eine Einordnung (Authority, kooperationsfähig, oder ignorieren).",
    action:
      "Domain kurz prüfen. Wenn relevant: in data/langkammer.ts als `authority` aufnehmen oder einen Pitch / Gastbeitrag dort platzieren.",
  },
};

function renderNarrative(byType: Record<string, number>): {
  headline: string;
  tone: "positive" | "negative" | "neutral" | "mixed";
} {
  const gains = byType.rank_gain ?? 0;
  const losses =
    (byType.rank_drop ?? 0) +
    (byType.displacement_top3 ?? 0) +
    (byType.score_drop ?? 0) +
    (byType.citation_loss ?? 0);
  const candidates = byType.authority_candidate ?? 0;

  if (gains === 0 && losses === 0 && candidates > 0) {
    return {
      headline: `Ruhiger Tag — keine Rank-Bewegungen, aber ${candidates} neue Domain${candidates === 1 ? "" : "s"} zum Einordnen.`,
      tone: "neutral",
    };
  }
  if (gains > 0 && losses === 0) {
    return {
      headline: `Guter Tag — ${gains} Verbesserung${gains === 1 ? "" : "en"} ohne neue Verluste.`,
      tone: "positive",
    };
  }
  if (losses > 0 && gains === 0) {
    return {
      headline: `Achtung — ${losses} Verlust-Signal${losses === 1 ? "" : "e"} und keine Gegenbewegung.`,
      tone: "negative",
    };
  }
  if (gains > 0 && losses > 0) {
    const delta = gains - losses;
    if (delta > 0) {
      return {
        headline: `Netto positiv — ${gains} Gewinne vs. ${losses} Verluste.`,
        tone: "positive",
      };
    }
    if (delta < 0) {
      return {
        headline: `Netto negativ — ${losses} Verluste vs. ${gains} Gewinne.`,
        tone: "negative",
      };
    }
    return {
      headline: `Gemischter Tag — ${gains} Gewinne stehen ${losses} Verlusten gegenüber.`,
      tone: "mixed",
    };
  }
  return { headline: "Tagesübersicht", tone: "neutral" };
}

const TONE_COLOR: Record<"positive" | "negative" | "neutral" | "mixed", string> = {
  positive: "#27c08a",
  negative: "#ff6b6b",
  neutral: "#94a3b8",
  mixed: "#ffc829",
};

function renderDigestSubject(entity: Entity, byType: Record<string, number>): string {
  const parts: string[] = [];
  for (const t of Object.keys(byType) as AlertType[]) {
    parts.push(`${byType[t]} ${TYPE_LABEL[t] ?? t}`);
  }
  return `[Tracker] ${parts.join(" · ")} (${entity.name})`;
}

export function renderDigestHtml(
  entity: Entity,
  alertsList: GenericAlert[],
  byType: Record<string, number>,
  opts: {
    periodLabel?: string;
    avgScore?: number;
    nameTopicScore?: number;
    latestAiScore?: number;
    last7Days?: {
      dateStr: string;
      label: string;
      domination: number | null;
      nameTopic: number | null;
      ai: number | null;
    }[];
    coverage?: WantedCoverage | null;
  } = {},
): string {
  const periodLabel = opts.periodLabel ?? "seit dem letzten Lauf";
  const dashboardUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://tracker.pragma-code.de";

  const narrative = renderNarrative(byType);
  const narrativeColor = TONE_COLOR[narrative.tone];

  const sections = (Object.keys(byType) as AlertType[])
    .map((type) => renderSection(type, alertsList.filter((a) => a.type === type)))
    .join("");

  const scoresSection = opts.avgScore !== undefined ? `
    <div style="margin-bottom:20px;margin-top:20px;">
      <table style="width:100%;border-collapse:collapse;margin:0;padding:0;">
        <tr>
          <!-- Column 1: Domination Score -->
          <td style="width:33.3%;padding:0 6px 0 0;vertical-align:top;">
            <div style="background:#171c3e;border:1px solid #1f2550;border-radius:8px;padding:14px 10px;text-align:center;">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:8px;font-weight:600;white-space:nowrap;">Ø Domination</div>
              <div style="font-size:24px;font-weight:bold;color:#ffc829;margin-bottom:10px;">${opts.avgScore} <span style="font-size:11px;color:#64748b;font-weight:normal;">/ 100</span></div>
              <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;width:80%;margin:0 auto;">
                <div style="height:100%;background:#ffc829;width:${opts.avgScore}%;"></div>
              </div>
            </div>
          </td>
          <!-- Column 2: Name + Topic -->
          <td style="width:33.3%;padding:0 6px;vertical-align:top;">
            <div style="background:#171c3e;border:1px solid #1f2550;border-radius:8px;padding:14px 10px;text-align:center;">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:8px;font-weight:600;white-space:nowrap;">Ø Name + Thema</div>
              <div style="font-size:24px;font-weight:bold;color:#c084fc;margin-bottom:10px;">${opts.nameTopicScore ?? 0} <span style="font-size:11px;color:#64748b;font-weight:normal;">/ 100</span></div>
              <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;width:80%;margin:0 auto;">
                <div style="height:100%;background:#c084fc;width:${opts.nameTopicScore ?? 0}%;"></div>
              </div>
            </div>
          </td>
          <!-- Column 3: AI Visibility -->
          <td style="width:33.3%;padding:0 0 0 6px;vertical-align:top;">
            <div style="background:#171c3e;border:1px solid #1f2550;border-radius:8px;padding:14px 10px;text-align:center;">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:8px;font-weight:600;white-space:nowrap;">Ø AI Visibility</div>
              <div style="font-size:24px;font-weight:bold;color:#7aa7ff;margin-bottom:10px;">${opts.latestAiScore ?? 0} <span style="font-size:11px;color:#64748b;font-weight:normal;">/ 100</span></div>
              <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;width:80%;margin:0 auto;">
                <div style="height:100%;background:#7aa7ff;width:${opts.latestAiScore ?? 0}%;"></div>
              </div>
            </div>
          </td>
        </tr>
      </table>
    </div>
  ` : "";

  const cov = opts.coverage;
  const coverageSection = cov && cov.total > 0 ? (() => {
    const pct = Math.round((cov.covered / cov.total) * 100);
    const delta = cov.prevCovered === null ? null : cov.covered - cov.prevCovered;
    const deltaHtml =
      delta === null
        ? `<span style="color:#64748b;font-size:12px;">Basiswert</span>`
        : `<span style="color:${delta > 0 ? "#27c08a" : delta < 0 ? "#ff6b6b" : "#64748b"};font-size:12px;">${delta > 0 ? "+" + delta : delta} ggü. Vorwoche</span>`;
    const rows = [...cov.items]
      .sort((a, b) => Number(b.covered) - Number(a.covered))
      .map(
        (it) =>
          `<tr><td style="padding:5px 14px;border-bottom:1px solid #1f2550;font-size:13px;color:${it.covered ? "#e2e8f0" : "#64748b"};"><span style="color:${it.covered ? "#27c08a" : "#475569"};">${it.covered ? "&#10003;" : "&#9675;"}</span>&nbsp;&nbsp;${escape(it.label)}</td></tr>`,
      )
      .join("");
    const perKw = cov.perKeyword
      .map(
        (k) =>
          `<span style="display:inline-block;border:1px solid #1f2550;border-radius:5px;padding:3px 8px;margin:2px 4px 2px 0;font-size:12px;color:#94a3b8;">${escape(k.query)} <span style="color:${k.covered > 0 ? "#27c08a" : "#64748b"};font-weight:600;">${k.covered}/${cov.total}</span></span>`,
      )
      .join("");
    return `
    <h2 style="margin:24px 0 8px;color:#fff;font-size:15px;letter-spacing:.04em;font-weight:600;">Wunschlink-Abdeckung</h2>
    <div style="background:#171c3e;border:1px solid #1f2550;border-radius:8px;padding:14px 18px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <div style="color:#fff;font-size:16px;font-weight:600;">${cov.covered} / ${cov.total} Ziel-Publikationen auf Seite 1</div>
        <div style="color:#fff;font-size:18px;font-weight:bold;">${pct}% &nbsp; ${deltaHtml}</div>
      </div>
      <div style="color:#64748b;font-size:11px;margin-top:4px;">über ${cov.nameKeywordCount} Namens-Suchen (Vereinigung der Top 10, nicht von 10 Plätzen)</div>
      <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;margin-top:10px;">
        <div style="height:100%;background:#ffc829;width:${pct}%;"></div>
      </div>
      <div style="margin-top:10px;">${perKw}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#171c3e;border:1px solid #1f2550;border-radius:8px;overflow:hidden;margin-bottom:6px;"><tbody>${rows}</tbody></table>
    <p style="margin:0 0 24px;color:#64748b;font-size:11px;line-height:1.5;">Zählt nur die ${cov.total} Wunsch-Publikationen aus dem Briefing — 0 heißt nicht „nichts rankt". Eigene Profile (Landingpage, LinkedIn etc.) ranken separat und zählen als Owned. Gemessen auf deutschem Google (gl=de).</p>
    ` ;
  })() : "";

  const historySection = opts.last7Days && opts.last7Days.length > 0 ? `
    <h2 style="margin:24px 0 8px;color:#fff;font-size:15px;letter-spacing:.04em;font-weight:600;">Entwicklung der letzten 7 Tage</h2>
    <table style="width:100%;border-collapse:collapse;background:#171c3e;border:1px solid #1f2550;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="border-bottom:1px solid #1f2550;background:#131835;">
          <th style="padding:10px 14px;text-align:left;color:#cbd5e1;font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Datum</th>
          <th style="padding:10px 14px;text-align:left;color:#ffc829;font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Domination</th>
          <th style="padding:10px 14px;text-align:left;color:#c084fc;font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Name + Thema</th>
          <th style="padding:10px 14px;text-align:left;color:#7aa7ff;font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">AI Visibility</th>
        </tr>
      </thead>
      <tbody>
        ${opts.last7Days.map((day) => `
        <tr style="border-bottom:1px solid #1f2550;">
          <td style="padding:10px 14px;color:#94a3b8;font-size:12px;font-weight:600;">${escape(day.label)}</td>
          <td style="padding:10px 14px;font-size:13px;white-space:nowrap;">
            ${day.domination !== null ? `
              <span style="font-weight:600;display:inline-block;width:30px;margin-right:6px;font-family:monospace;color:#fff;">${day.domination}%</span>
              <div style="display:inline-block;width:60px;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;vertical-align:middle;overflow:hidden;">
                <div style="background:#ffc829;height:100%;width:${day.domination}%;border-radius:3px;"></div>
              </div>
            ` : `<span style="color:#64748b;">-</span>`}
          </td>
          <td style="padding:10px 14px;font-size:13px;white-space:nowrap;">
            ${day.nameTopic !== null ? `
              <span style="font-weight:600;display:inline-block;width:30px;margin-right:6px;font-family:monospace;color:#fff;">${day.nameTopic}%</span>
              <div style="display:inline-block;width:60px;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;vertical-align:middle;overflow:hidden;">
                <div style="background:#c084fc;height:100%;width:${day.nameTopic}%;border-radius:3px;"></div>
              </div>
            ` : `<span style="color:#64748b;">-</span>`}
          </td>
          <td style="padding:10px 14px;font-size:13px;white-space:nowrap;">
            ${day.ai !== null ? `
              <span style="font-weight:600;display:inline-block;width:30px;margin-right:6px;font-family:monospace;color:#fff;">${day.ai}%</span>
              <div style="display:inline-block;width:60px;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;vertical-align:middle;overflow:hidden;">
                <div style="background:#7aa7ff;height:100%;width:${day.ai}%;border-radius:3px;"></div>
              </div>
            ` : `<span style="color:#64748b;">-</span>`}
          </td>
        </tr>
        `).join("")}
      </tbody>
    </table>
  ` : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#0f1430;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:680px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#ffc829;font-weight:600;">Pragma-Code · Entity Tracker</div>
    <h1 style="margin:8px 0 4px;color:#fff;font-size:22px;">${escape(entity.name)} · Wochen-Report</h1>
    <p style="margin:0 0 16px;color:#94a3b8;font-size:14px;">${alertsList.length} Ereignisse ${escape(periodLabel)}.</p>

    <div style="background:#171c3e;border:1px solid #1f2550;border-left:4px solid ${narrativeColor};border-radius:8px;padding:14px 18px;margin:0 0 12px;">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">TL;DR</div>
      <div style="color:#fff;font-size:15px;font-weight:600;">${escape(narrative.headline)}</div>
    </div>

    ${scoresSection}

    ${coverageSection}

    ${historySection}

    ${sections}

    <div style="margin-top:24px;">
      <a href="${dashboardUrl}/alerts" style="display:inline-block;background:#ffc829;color:#0f1430;padding:10px 16px;border-radius:6px;font-weight:600;text-decoration:none;font-size:13px;">Im Dashboard ansehen</a>
    </div>
    <p style="margin-top:24px;color:#64748b;font-size:11px;line-height:1.6;">Der Tracker sammelt täglich, dieser Wochen-Report fasst alle Signale der letzten Woche zusammen. Sechs Alert-Typen: Displacement Top 3, Ranking-Verlust/-Gewinn, Score-Drop, Citation-Loss, Authority-Kandidat. Pro Typ unterschiedliches Dedup-Fenster (3–14 Tage).</p>
  </div>
  </body></html>`;
}

function renderSection(type: AlertType, items: GenericAlert[]): string {
  if (items.length === 0) return "";
  const label = TYPE_LABEL[type] ?? type;
  const explanation = TYPE_EXPLANATION[type];
  const rowsHtml = items
    .map((a) => `<tr><td style="padding:8px 14px;border-bottom:1px solid #1f2550;color:#e2e8f0;font-size:13px;">${escape(a.subject)}</td></tr>`)
    .join("");
  const explainBlock = explanation
    ? `<div style="background:#0f1430;border:1px solid #1f2550;border-radius:6px;padding:10px 14px;margin:0 0 8px;color:#94a3b8;font-size:12px;line-height:1.55;">
        <div><strong style="color:#cbd5e1;">Was bedeutet das:</strong> ${escape(explanation.meaning)}</div>
        <div style="margin-top:4px;"><strong style="color:#cbd5e1;">Was tun:</strong> ${escape(explanation.action)}</div>
      </div>`
    : "";
  return `<h2 style="margin:24px 0 8px;color:#fff;font-size:15px;letter-spacing:.04em;">${escape(label)} · ${items.length}</h2>
  ${explainBlock}
  <table style="width:100%;border-collapse:collapse;background:#171c3e;border:1px solid #1f2550;border-radius:8px;overflow:hidden;">
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
