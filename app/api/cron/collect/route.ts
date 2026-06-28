import { NextResponse } from "next/server";
import { runDailyCollectionForAllEntities } from "@/lib/jobs";
import { sendOpsCrashAlert } from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const report = await runDailyCollectionForAllEntities();
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    // Kompletter Abbruch → Ops-Crash-Mail (best effort), trotzdem 500 zurück,
    // damit auch Vercels Cron-Fehlermeldung greift.
    await sendOpsCrashAlert(err, "Daily Collect").catch(() => {});
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
