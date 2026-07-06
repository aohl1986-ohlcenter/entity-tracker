import { sendEmail } from "./resend";
import { db } from "./db";
import { serpSnapshots } from "./schema";
import { desc } from "drizzle-orm";

export type OpsIssue = {
  severity: "critical" | "warning";
  area: string;
  detail: string;
};

// Fehlertexte, die auf erschöpfte Kontingente / Rate-Limits hindeuten.
const LIMIT_HINTS =
  /credit|quota|limit|exhaust|depleted|insufficient|resource_exhausted|\b402\b|\b429\b|too many request|out of/i;

type CollectionLike = {
  entity: string;
  serps: { processed: number; failed: { keyword: string; error: string }[] };
  citations: { prompts: number; promptCount: number; failed: { query: string; error: string }[] };
};

/** Leitet aus den Collect-Reports betriebliche Probleme ab (Fehlerquote, Limit-Ausschöpfung). */
export function detectOpsIssues(reports: CollectionLike[]): OpsIssue[] {
  const issues: OpsIssue[] = [];

  for (const r of reports) {
    // ── SERP-Abrufe (Serper) ──────────────────────────────────────────────
    const serpTotal = r.serps.processed + r.serps.failed.length;
    if (serpTotal > 0 && r.serps.failed.length > 0) {
      const rate = r.serps.failed.length / serpTotal;
      const sample = r.serps.failed[0]?.error ?? "";
      if (rate >= 0.5) {
        const limit = LIMIT_HINTS.test(sample);
        issues.push({
          severity: rate >= 0.99 ? "critical" : "warning",
          area: `SERP-Abruf · ${r.entity}`,
          detail:
            `${r.serps.failed.length}/${serpTotal} Keyword-Abrufe fehlgeschlagen` +
            (limit ? " — Serper-Kontingent vermutlich ausgeschöpft" : "") +
            `. Beispiel: ${sample.slice(0, 180)}`,
        });
      }
    }

    // ── Citation-Engines ──────────────────────────────────────────────────
    const byEngine: Record<string, { count: number; sample: string }> = {};
    for (const f of r.citations.failed) {
      const eng = f.query.match(/^\[(\w+)\]/)?.[1] ?? "?";
      if (!byEngine[eng]) byEngine[eng] = { count: 0, sample: f.error };
      byEngine[eng].count++;
    }
    const promptCount = r.citations.promptCount || 1;
    for (const [eng, info] of Object.entries(byEngine)) {
      // Eine Engine ist "aus", wenn sie bei ALLEN Prompts gescheitert ist.
      if (info.count >= promptCount) {
        const limit = LIMIT_HINTS.test(info.sample);
        issues.push({
          severity: "warning",
          area: `Citation-Engine ${eng} · ${r.entity}`,
          detail:
            `alle ${info.count} Prompts fehlgeschlagen` +
            (limit ? " — Limit/Quota ausgeschöpft" : "") +
            `. Beispiel: ${info.sample.slice(0, 180)}`,
        });
      }
    }
  }

  return issues;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Verschickt eine Ops-Mail (separat vom inhaltlichen Report). Nur wenn Issues vorliegen. */
export async function sendOpsAlert(
  issues: OpsIssue[],
  context: string,
): Promise<{ emailed: boolean; reason?: string }> {
  if (issues.length === 0) return { emailed: false, reason: "no-issues" };
  const to = process.env.OPS_EMAIL_TO ?? process.env.ALERT_EMAIL_TO;
  if (!to) return { emailed: false, reason: "no-recipient" };

  const crit = issues.some((i) => i.severity === "critical");
  const subject = `[Tracker OPS] ${crit ? "🔴" : "🟠"} ${issues.length} Problem${issues.length > 1 ? "e" : ""} (${context})`;
  const dashboardUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://tracker.pragma-code.de";

  const rows = issues
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #1f2550;color:${i.severity === "critical" ? "#ff6b6b" : "#ffc829"};font-weight:600;white-space:nowrap;">${i.severity === "critical" ? "🔴 kritisch" : "🟠 Warnung"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #1f2550;color:#fff;font-weight:600;">${escape(i.area)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #1f2550;color:#94a3b8;font-size:13px;">${escape(i.detail)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0f1430;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:720px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#ff6b6b;font-weight:600;">Pragma-Code · Entity Tracker · OPS</div>
    <h1 style="margin:8px 0 4px;color:#fff;font-size:22px;">Betriebs-Alarm</h1>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;">${issues.length} Problem(e) beim Lauf „${escape(context)}". Bitte prüfen — Datensammlung könnte unvollständig sein.</p>
    <table style="width:100%;border-collapse:collapse;background:#171c3e;border:1px solid #1f2550;border-radius:8px;overflow:hidden;">
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:24px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#ffc829;color:#0f1430;padding:10px 16px;border-radius:6px;font-weight:600;text-decoration:none;font-size:13px;">Dashboard öffnen</a>
    </div>
    <p style="margin-top:24px;color:#64748b;font-size:11px;line-height:1.6;">Diese Mail kommt nur, wenn der tägliche Lauf Fehler oder ausgeschöpfte Kontingente erkennt. Häufige Ursachen: Serper-Credits leer, Engine-Quota erreicht, DB/Netz-Hänger.</p>
  </div>
  </body></html>`;

  try {
    const sent = await sendEmail({ to, subject, html });
    return sent ? { emailed: true } : { emailed: false, reason: "resend-key-missing" };
  } catch (err) {
    console.error("[ops] alert dispatch failed:", err);
    return { emailed: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Schneller Crash-Alarm, wenn der Collect-Job komplett abbricht. */
export async function sendOpsCrashAlert(error: unknown, context: string): Promise<void> {
  const msg = error instanceof Error ? `${error.message}` : String(error);
  await sendOpsAlert(
    [{ severity: "critical", area: `Job abgebrochen · ${context}`, detail: msg.slice(0, 400) }],
    context,
  ).catch(() => {});
}

/** Heartbeat: Alter des jüngsten SERP-Snapshots (für /api/health + Monitoring). */
export async function getDataFreshness(): Promise<{
  latestSnapshotAt: string | null;
  ageHours: number | null;
}> {
  const row = (
    await db
      .select({ fetchedAt: serpSnapshots.fetchedAt })
      .from(serpSnapshots)
      .orderBy(desc(serpSnapshots.fetchedAt))
      .limit(1)
  )[0];
  if (!row) return { latestSnapshotAt: null, ageHours: null };
  const ageHours = (Date.now() - row.fetchedAt.getTime()) / (1000 * 60 * 60);
  return { latestSnapshotAt: row.fetchedAt.toISOString(), ageHours: Math.round(ageHours * 10) / 10 };
}
