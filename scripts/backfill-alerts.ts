import "./_env";
import { db } from "../lib/db";
import { entities, keywords, serpSnapshots } from "../lib/schema";
import { desc, eq } from "drizzle-orm";
import { detectDisplacementForSnapshot, persistAndDispatchAlerts, type CollectedAlert } from "../lib/alerts";

async function main() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error(`Entity ${slug} not found`);

  const kws = await db.select().from(keywords).where(eq(keywords.entityId, entity.id));
  const collected: CollectedAlert[] = [];

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
    const hits = await detectDisplacementForSnapshot(entity, kw, snap.id);
    if (hits.length > 0) {
      console.log(`  ${kw.query}: ${hits.length} hit(s)`);
      for (const h of hits) console.log(`     #${h.position} ${h.domain} (${h.matchedLabel})`);
      collected.push({ keywordId: kw.id, hits });
    }
  }

  const result = await persistAndDispatchAlerts(entity, collected);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
