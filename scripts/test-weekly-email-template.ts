import "./_env";
import { db } from "../lib/db";
import { entities, keywords, serpSnapshots, aiCitations } from "../lib/schema";
import { eq, desc, and, inArray, gte } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { renderDigestHtml, type GenericAlert } from "../lib/alerts";

async function main() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error(`Entity ${slug} not found`);

  console.log(`Calculating scores for ${entity.name}...`);

  // Query scores & history exactly like in sendPeriodicDigest
  let avgScore = 0;
  let nameTopicScore = 0;
  let latestAiScore = 0;
  let last7Days: { dateStr: string; label: string; domination: number | null; nameTopic: number | null; ai: number | null }[] = [];

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

  const mockAlerts: GenericAlert[] = [
    {
      type: "rank_drop",
      severity: "critical",
      dedupKey: "rank_drop:test:1",
      subject: 'Rank-Drop: pwc.de #2 → out für "Jens Langkammer Lieferdienste"',
      payload: {
        keyword: "Jens Langkammer Lieferdienste",
        domain: "pwc.de",
        prevPosition: 2,
        newPosition: null,
        droppedOut: true,
        classification: "authority",
      },
    },
    {
      type: "rank_gain",
      severity: "high",
      dedupKey: "rank_gain:test:1",
      subject: 'Rank-Gain: linkedin.com #7 → #2 für "Jens Langkammer e-Grocery"',
      payload: {
        keyword: "Jens Langkammer e-Grocery",
        domain: "linkedin.com",
        prevPosition: 7,
        newPosition: 2,
        classification: "owned",
      },
    },
  ];

  const byType = {
    rank_drop: 1,
    rank_gain: 1,
  };

  const html = renderDigestHtml(entity, mockAlerts, byType, {
    periodLabel: "in der letzten Woche",
    avgScore,
    nameTopicScore,
    latestAiScore,
    last7Days,
  });

  const outputPath = path.join(__dirname, "test-weekly-email.html");
  fs.writeFileSync(outputPath, html, "utf-8");
  console.log(`Successfully wrote email preview to: ${outputPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
