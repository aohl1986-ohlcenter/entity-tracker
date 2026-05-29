import "./_env";
import { db } from "../lib/db";
import { entities, alerts } from "../lib/schema";
import { eq } from "drizzle-orm";

async function main() {
  const entity = (
    await db
      .select()
      .from(entities)
      .where(eq(entities.slug, process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer"))
      .limit(1)
  )[0];
  if (!entity) throw new Error("entity not found");

  const before = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(eq(alerts.entityId, entity.id));
  console.log(`Found ${before.length} existing alert(s); clearing to allow re-alert.`);

  if (before.length > 0) {
    await db.delete(alerts).where(eq(alerts.entityId, entity.id));
  }
  console.log("Done. Trigger the cron now to force a fresh alert + email dispatch.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
