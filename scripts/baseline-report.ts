import "./_env";
import { db } from "../lib/db";
import { entities, keywords, serpSnapshots, serpResults } from "../lib/schema";
import { desc, eq } from "drizzle-orm";

async function main() {
  const entity = (
    await db
      .select()
      .from(entities)
      .where(eq(entities.slug, "jens-langkammer"))
      .limit(1)
  )[0];
  if (!entity) return;

  const kws = await db.select().from(keywords).where(eq(keywords.entityId, entity.id));

  console.log("BASELINE REPORT — Jens Langkammer\n" + "=".repeat(60));

  const allResults: { keyword: string; cluster: string; score: number; rows: any[] }[] = [];
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
    const rows = await db
      .select()
      .from(serpResults)
      .where(eq(serpResults.snapshotId, snap.id))
      .orderBy(serpResults.position);
    allResults.push({ keyword: kw.query, cluster: kw.cluster, score: snap.dominationScore, rows });
  }

  for (const cluster of ["name", "name_topic", "topic"]) {
    const inCluster = allResults.filter((r) => r.cluster === cluster);
    if (!inCluster.length) continue;
    const avg = Math.round(inCluster.reduce((a, r) => a + r.score, 0) / inCluster.length);
    console.log(`\n── ${cluster.toUpperCase()} (Ø ${avg}/100) ──`);
    for (const r of inCluster) {
      console.log(`  [${String(r.score).padStart(3)}] ${r.keyword}`);
    }
  }

  console.log("\n── DISPLACEMENT in Top 10 ──");
  for (const r of allResults) {
    const displ = r.rows.filter((row: any) => row.classification === "displacement");
    if (!displ.length) continue;
    console.log(`  ${r.keyword}:`);
    for (const d of displ) {
      console.log(`    #${d.position} ${d.domain} (${d.matchedLabel})`);
    }
  }

  console.log("\n── OWNED + AUTHORITY in Top 10 ──");
  for (const r of allResults) {
    const wins = r.rows.filter((row: any) =>
      row.classification === "owned" || row.classification === "authority",
    );
    if (!wins.length) continue;
    console.log(`  ${r.keyword}:`);
    for (const w of wins) {
      console.log(`    #${w.position} [${w.classification}] ${w.matchedLabel ?? w.domain}`);
    }
  }

  console.log("\n── Keywords mit Score 0 (kein owned/authority Treffer) ──");
  const zeros = allResults.filter((r) => r.score === 0);
  for (const r of zeros) console.log(`  ${r.keyword}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
