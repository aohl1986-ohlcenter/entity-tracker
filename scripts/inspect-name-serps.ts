import "./_env";
import { db } from "../lib/db";
import { entities, keywords, serpSnapshots, serpResults } from "../lib/schema";
import { and, desc, eq } from "drizzle-orm";

async function main() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) throw new Error("entity not found");

  const kws = await db
    .select()
    .from(keywords)
    .where(and(eq(keywords.entityId, entity.id), eq(keywords.cluster, "name")));

  for (const kw of kws) {
    const snap = (
      await db
        .select()
        .from(serpSnapshots)
        .where(eq(serpSnapshots.keywordId, kw.id))
        .orderBy(desc(serpSnapshots.fetchedAt))
        .limit(1)
    )[0];
    if (!snap) {
      console.log(`\n### ${kw.query} — keine Daten`);
      continue;
    }
    const rows = await db
      .select()
      .from(serpResults)
      .where(eq(serpResults.snapshotId, snap.id))
      .orderBy(serpResults.position);

    console.log(`\n### "${kw.query}"  (Score ${snap.dominationScore}, ${snap.fetchedAt.toISOString().slice(0, 10)})`);
    for (const r of rows) {
      const flag =
        r.classification === "owned" ? "✅ OWNED" :
        r.classification === "authority" ? "🟦 AUTH " :
        r.classification === "displacement" ? "🟥 DISP " : "·· neut ";
      const li = r.url.includes("linkedin.com") ? " [LinkedIn]" : "";
      console.log(`  #${String(r.position).padStart(2)} ${flag} ${r.domain}${li}`);
      console.log(`        ${(r.title ?? "").slice(0, 80)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
