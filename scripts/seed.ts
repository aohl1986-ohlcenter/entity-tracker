import "./_env";
import { db } from "../lib/db";
import { entities, keywords, targetUrls } from "../lib/schema";
import { ENTITY, KEYWORDS, TARGETS } from "../data/langkammer";
import { eq } from "drizzle-orm";

async function main() {
  console.log(`Seeding entity ${ENTITY.slug}…`);

  let entity = (
    await db.select().from(entities).where(eq(entities.slug, ENTITY.slug)).limit(1)
  )[0];
  if (!entity) {
    [entity] = await db.insert(entities).values(ENTITY).returning();
    console.log(`  created entity #${entity.id}`);
  } else {
    console.log(`  entity #${entity.id} already exists`);
  }

  for (const kw of KEYWORDS) {
    await db
      .insert(keywords)
      .values({ entityId: entity.id, query: kw.query, cluster: kw.cluster })
      .onConflictDoNothing();
  }
  console.log(`  upserted ${KEYWORDS.length} keywords`);

  await db.delete(targetUrls).where(eq(targetUrls.entityId, entity.id));
  await db.insert(targetUrls).values(
    TARGETS.map((t) => ({
      entityId: entity.id,
      pattern: t.pattern,
      label: t.label,
      category: t.category,
      topics: t.topics ?? [],
    })),
  );
  console.log(`  inserted ${TARGETS.length} target URLs`);

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
