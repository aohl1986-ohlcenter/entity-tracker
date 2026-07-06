// Fresh-DB-Bootstrap aus data/*.ts — NICHT für laufende Systeme gedacht:
// Tenant-Config wird seit der SaaS-Migration im Admin (/admin) gepflegt,
// dieser Seed würde sie nicht überschreiben (nur onConflictDoNothing),
// ist aber trotzdem hinter SEED_ALLOW=1 gegated, um Versehen zu vermeiden.
// Lauf: SEED_ALLOW=1 npx tsx scripts/seed.ts

import "./_env";
import { db } from "../lib/db";
import { entities, keywords, targetUrls } from "../lib/schema";
import { SEED_ENTITIES } from "../data/entities";
import { eq } from "drizzle-orm";

async function main() {
  if (process.env.SEED_ALLOW !== "1") {
    console.error(
      "seed.ts ist ein Fresh-DB-Bootstrap. Tenant-Config wird im Admin gepflegt.\n" +
        "Wenn du wirklich seeden willst: SEED_ALLOW=1 npx tsx scripts/seed.ts",
    );
    process.exit(1);
  }

  for (const bundle of SEED_ENTITIES) {
    const { entity: seed, keywords: KEYWORDS, targets: TARGETS } = bundle;
    console.log(`Seeding entity ${seed.slug}…`);

    let entity = (
      await db.select().from(entities).where(eq(entities.slug, seed.slug)).limit(1)
    )[0];
    if (!entity) {
      [entity] = await db.insert(entities).values(seed).returning();
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

    // Kein delete mehr — idempotente Inserts via unique(entity_id, pattern).
    for (const t of TARGETS) {
      await db
        .insert(targetUrls)
        .values({
          entityId: entity.id,
          pattern: t.pattern,
          label: t.label,
          category: t.category,
          topics: t.topics ?? [],
        })
        .onConflictDoNothing();
    }
    console.log(`  upserted ${TARGETS.length} target URLs`);
  }

  console.log("Done. Hinweis: Prompts/Wunschlinks/Pläne via scripts/migrate-to-saas.ts bzw. Admin.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
