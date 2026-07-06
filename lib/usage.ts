// API-Nutzungs-Metering pro Tag/Tenant/Engine (Admin → API-Auslastung).
// Best-effort: Metering darf NIE einen Collect-Lauf scheitern lassen.

import { sql } from "drizzle-orm";
import { db } from "./db";
import { apiUsage } from "./schema";

export async function recordUsage(
  entityId: number,
  engine: string,
  counts: { calls?: number; failures?: number },
): Promise<void> {
  const calls = counts.calls ?? 0;
  const failures = counts.failures ?? 0;
  if (calls === 0 && failures === 0) return;
  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  try {
    await db
      .insert(apiUsage)
      .values({ day, entityId, engine, calls, failures })
      .onConflictDoUpdate({
        target: [apiUsage.day, apiUsage.entityId, apiUsage.engine],
        set: {
          calls: sql`${apiUsage.calls} + ${calls}`,
          failures: sql`${apiUsage.failures} + ${failures}`,
        },
      });
  } catch (err) {
    console.error("[usage] metering failed:", err);
  }
}
