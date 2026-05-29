import { db } from "./db";
import {
  alerts,
  entities,
  keywords,
  serpResults,
  serpSnapshots,
  type Entity,
  type Keyword,
} from "./schema";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { sendEmail } from "./resend";

const DEDUP_WINDOW_DAYS = 7;
const TOP_THRESHOLD = 3;

export type DisplacementHit = {
  keyword: string;
  position: number;
  url: string;
  domain: string;
  matchedLabel: string | null;
};

/** Detect new displacement hits in Top-N for a snapshot. Returns hits worth alerting on. */
export async function detectDisplacementForSnapshot(
  entity: Entity,
  keyword: Keyword,
  snapshotId: number,
): Promise<DisplacementHit[]> {
  const rows = await db
    .select()
    .from(serpResults)
    .where(
      and(
        eq(serpResults.snapshotId, snapshotId),
        eq(serpResults.classification, "displacement"),
      ),
    );
  const top = rows.filter((r) => r.position <= TOP_THRESHOLD);
  if (top.length === 0) return [];

  const cutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const dedupKeys = top.map((r) => buildDedupKey(keyword.id, r.url));
  const recent = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.entityId, entity.id),
        inArray(alerts.dedupKey, dedupKeys),
        gte(alerts.createdAt, cutoff),
      ),
    );
  const seen = new Set(recent.map((a) => a.dedupKey));

  return top
    .filter((r) => !seen.has(buildDedupKey(keyword.id, r.url)))
    .map((r) => ({
      keyword: keyword.query,
      position: r.position,
      url: r.url,
      domain: r.domain,
      matchedLabel: r.matchedLabel ?? null,
    }));
}

function buildDedupKey(keywordId: number, url: string): string {
  return `disp:${keywordId}:${url}`;
}

export type CollectedAlert = {
  keywordId: number;
  hits: DisplacementHit[];
};

/** Persist new alerts and send a single digest email per entity per cron run. */
export async function persistAndDispatchAlerts(
  entity: Entity,
  collected: CollectedAlert[],
): Promise<{ persisted: number; emailed: boolean; reason?: string }> {
  const flat = collected.flatMap((c) =>
    c.hits.map((h) => ({ keywordId: c.keywordId, hit: h })),
  );
  if (flat.length === 0) return { persisted: 0, emailed: false, reason: "no-new-hits" };

  const worst = flat.reduce((a, b) => (a.hit.position < b.hit.position ? a : b));
  const subject = `[Tracker] ${flat.length} neue Displacement-Treffer Top ${TOP_THRESHOLD} (${entity.name})`;
  const severity = worst.hit.position === 1 ? "critical" : worst.hit.position === 2 ? "high" : "warning";

  const persistRows = flat.map((f) => ({
    entityId: entity.id,
    type: "displacement_top3",
    severity,
    dedupKey: buildDedupKey(f.keywordId, f.hit.url),
    subject,
    payload: {
      keyword: f.hit.keyword,
      position: f.hit.position,
      url: f.hit.url,
      domain: f.hit.domain,
      matchedLabel: f.hit.matchedLabel,
    },
    emailSent: 0,
  }));
  const inserted = await db.insert(alerts).values(persistRows).returning({ id: alerts.id });

  const to = process.env.ALERT_EMAIL_TO;
  if (!to) {
    return { persisted: inserted.length, emailed: false, reason: "no-recipient" };
  }

  const html = renderDigestHtml(entity, flat);
  try {
    const sent = await sendEmail({ to, subject, html });
    if (sent) {
      await db
        .update(alerts)
        .set({ emailSent: 1 })
        .where(inArray(alerts.id, inserted.map((i) => i.id)));
      return { persisted: inserted.length, emailed: true };
    }
    return { persisted: inserted.length, emailed: false, reason: "resend-key-missing" };
  } catch (err) {
    console.error("[alerts] email dispatch failed:", err);
    return {
      persisted: inserted.length,
      emailed: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function renderDigestHtml(
  entity: Entity,
  flat: { keywordId: number; hit: DisplacementHit }[],
): string {
  const dashboardUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://tracker.pragma-code.de";

  const rows = flat
    .sort((a, b) => a.hit.position - b.hit.position)
    .map(
      (f) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #1f2550;font-weight:600;color:#ff6b6b;">#${f.hit.position}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #1f2550;color:#fff;">${escape(f.hit.keyword)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #1f2550;color:#94a3b8;">${escape(f.hit.domain)}${
          f.hit.matchedLabel ? ` · ${escape(f.hit.matchedLabel)}` : ""
        }</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#0f1430;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#ffc829;font-weight:600;">Pragma-Code · Entity Tracker</div>
    <h1 style="margin:8px 0 4px;color:#fff;font-size:22px;">Neue Displacement-Treffer in Top ${TOP_THRESHOLD}</h1>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;">${escape(entity.name)} · ${flat.length} ${flat.length === 1 ? "Treffer" : "Treffer"} seit dem letzten Check.</p>

    <table style="width:100%;border-collapse:collapse;background:#171c3e;border:1px solid #1f2550;border-radius:8px;overflow:hidden;font-size:14px;">
      <thead><tr style="background:#1f2550;color:#94a3b8;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">
        <th style="padding:10px 14px;">Pos</th><th style="padding:10px 14px;">Keyword</th><th style="padding:10px 14px;">Domain</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="margin-top:24px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#ffc829;color:#0f1430;padding:10px 16px;border-radius:6px;font-weight:600;text-decoration:none;font-size:13px;">Im Dashboard ansehen</a>
    </div>

    <p style="margin-top:32px;color:#64748b;font-size:12px;">Du erhältst diese Mail, weil ein Authority‑Verdrängungskandidat in den Top ${TOP_THRESHOLD} für ein getracktes Keyword aufgetaucht ist. Dedup‑Fenster: ${DEDUP_WINDOW_DAYS} Tage.</p>
  </div>
  </body></html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
