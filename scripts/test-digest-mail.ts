import "./_env";
import { db } from "../lib/db";
import { entities } from "../lib/schema";
import { eq } from "drizzle-orm";
import { emailCombinedDigest, type GenericAlert } from "../lib/alerts";

async function main() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error(`Entity ${slug} not found`);

  const mock: GenericAlert[] = [
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
    {
      type: "displacement_top3",
      severity: "high",
      dedupKey: "disp:test:1",
      subject: 'Displacement Top 3: yasni.de @ #2 für "Jens Langkammer"',
      payload: {
        keyword: "Jens Langkammer",
        domain: "yasni.de",
        position: 2,
        url: "https://yasni.de/jens+langkammer/check+person",
        matchedLabel: "Yasni",
      },
    },
    {
      type: "score_drop",
      severity: "warning",
      dedupKey: "score_drop:test:1",
      subject: 'Score-Drop 72 → 54 (-18) für "Jens Langkammer PwC"',
      payload: {
        keyword: "Jens Langkammer PwC",
        currentScore: 54,
        avgPrev: 72,
        drop: 18,
        lookbackDays: 7,
      },
    },
    {
      type: "citation_loss",
      severity: "high",
      dedupKey: "cit_loss:test:1",
      subject: "Citation-Loss (gemini): Strategy&: Future of Grocery",
      payload: {
        engine: "gemini",
        url: "https://strategyand.pwc.com/de/en/industries/consumer-markets/future-of-grocery-shopping.html",
        title: "Strategy&: Future of Grocery",
        classification: "authority",
        previousHits: 3,
        totalPrevRuns: 3,
      },
    },
    {
      type: "authority_candidate",
      severity: "info",
      dedupKey: "auth_candidate:test:1",
      subject: "Neue Authority-Kandidatin: mckinsey.com (4× in Top 5, best #2)",
      payload: {
        domain: "mckinsey.com",
        hits: 4,
        bestPosition: 2,
        lookbackDays: 7,
        samples: [
          { url: "https://mckinsey.com/...", title: "State of Grocery 2026", position: 2 },
        ],
      },
    },
  ];

  const r = await emailCombinedDigest(entity, mock);
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
