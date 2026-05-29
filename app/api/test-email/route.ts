import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const to = process.env.ALERT_EMAIL_TO;
  if (!to) {
    return NextResponse.json({ ok: false, error: "ALERT_EMAIL_TO not set" }, { status: 400 });
  }
  try {
    const result = await sendEmail({
      to,
      subject: "[Tracker] Resend-Smoke-Test (Pragma-Code × Langkammer)",
      html: `<!doctype html><html><body style="margin:0;padding:0;background:#0f1430;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
        <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#ffc829;font-weight:600;">Pragma-Code · Entity Tracker</div>
          <h1 style="margin:8px 0 4px;color:#fff;font-size:22px;">Resend-Integration aktiv ✓</h1>
          <p style="margin:8px 0 24px;color:#94a3b8;font-size:14px;">
            Wenn du diese Mail liest, läuft die Alert-Pipeline für tracker.pragma-code.de korrekt.
            Echte Displacement-Alerts gehen ab jetzt automatisch nach jedem Cron-Run (06:00 UTC) an
            <strong>${escapeHtml(to)}</strong>.
          </p>
          <a href="https://tracker.pragma-code.de" style="display:inline-block;background:#ffc829;color:#0f1430;padding:10px 16px;border-radius:6px;font-weight:600;text-decoration:none;font-size:13px;">Zum Dashboard</a>
        </div>
      </body></html>`,
    });
    return NextResponse.json({ ok: true, sent: !!result, id: result?.id ?? null, to });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
