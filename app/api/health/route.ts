import { NextResponse } from "next/server";
import { getDataFreshness } from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Schwelle: täglicher Collect (06:00 UTC) + Puffer. Älter ⇒ etwas stimmt nicht.
const STALE_HOURS = 30;

/**
 * Öffentlicher Heartbeat für externes Uptime-Monitoring (z. B. UptimeRobot,
 * cron-job.org). Liefert 200 bei frischen Daten, 503 wenn der jüngste Snapshot
 * zu alt ist (Cron läuft nicht / DB-Problem). Bewusst minimale, nicht sensible
 * Infos — kein Auth, damit Monitore einfach pingen können.
 */
export async function GET() {
  try {
    const { latestSnapshotAt, ageHours } = await getDataFreshness();
    const stale = ageHours === null || ageHours > STALE_HOURS;
    return NextResponse.json(
      {
        ok: !stale,
        status: stale ? "stale" : "fresh",
        latestSnapshotAt,
        ageHours,
        staleThresholdHours: STALE_HOURS,
      },
      { status: stale ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, status: "error", error: err instanceof Error ? err.message : String(err) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
