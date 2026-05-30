import "./_env";
import { db } from "../lib/db";
import { entities, keywords, serpSnapshots } from "../lib/schema";
import { desc, eq } from "drizzle-orm";
import {
  detectDisplacementForSnapshot,
  detectRankChangesForKeyword,
  detectScoreDropForKeyword,
  detectCitationLossForEntity,
  detectAuthorityCandidatesForEntity,
  dispatchAlertBatch,
  type GenericAlert,
} from "../lib/alerts";

async function main() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error(`Entity ${slug} not found`);

  const kws = await db.select().from(keywords).where(eq(keywords.entityId, entity.id));
  const collected: GenericAlert[] = [];

  for (const kw of kws) {
    const snap = (
      await db
        .select()
        .from(serpSnapshots)
        .where(eq(serpSnapshots.keywordId, kw.id))
        .orderBy(desc(serpSnapshots.fetchedAt))
        .limit(1)
    )[0];
    if (!snap) continue;
    const displacements = await detectDisplacementForSnapshot(entity, kw, snap.id);
    const rankChanges = await detectRankChangesForKeyword(kw, snap.id);
    const scoreDrop = await detectScoreDropForKeyword(kw);
    if (displacements.length + rankChanges.length + scoreDrop.length > 0) {
      console.log(`  ${kw.query}: ${displacements.length} disp · ${rankChanges.length} rank · ${scoreDrop.length} score`);
    }
    collected.push(...displacements, ...rankChanges, ...scoreDrop);
  }

  const candidates = await detectAuthorityCandidatesForEntity(entity);
  const citationLoss = await detectCitationLossForEntity(entity);
  collected.push(...candidates, ...citationLoss);
  console.log(`Entity-wide: ${candidates.length} authority-candidates, ${citationLoss.length} citation-loss`);

  const result = await dispatchAlertBatch(entity, collected);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
