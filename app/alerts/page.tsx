import { db } from "@/lib/db";
import { entities, alerts } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const SEV_TONE: Record<string, string> = {
  critical: "bg-displacement/20 text-displacement ring-displacement/40",
  high: "bg-displacement/15 text-displacement ring-displacement/30",
  warning: "bg-brand-gold/15 text-brand-gold ring-brand-gold/30",
};

export default async function AlertsPage() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) {
    return <p className="text-slate-400">Entity {slug} fehlt — bitte seed laufen lassen.</p>;
  }

  const rows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.entityId, entity.id))
    .orderBy(desc(alerts.createdAt))
    .limit(50);

  const emailed = rows.filter((r) => r.emailSent === 1).length;

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-gold">Alerts</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Displacement Top 3</h1>
        <p className="mt-2 text-sm text-slate-400">
          Authority‑Verdränger, die es in die obersten 3 Suchergebnisse geschafft haben.
          Dedup‑Fenster 7 Tage. Digest‑Mail pro Cron‑Run.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3 max-w-md">
          <Stat label="Alerts gesamt" value={rows.length} tone="rose" />
          <Stat label="Davon per Mail" value={emailed} tone="emerald" />
          <Stat label="Offen" value={rows.filter((r) => !r.resolvedAt).length} tone="sky" />
        </div>
      </section>

      {rows.length === 0 && (
        <div className="card p-6 text-slate-400">
          Noch keine Alerts. Cron läuft täglich um 06:00 UTC; sobald ein neuer
          Displacement‑Treffer in Top 3 erscheint, landet er hier (und in deinem Posteingang).
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((a) => {
          const p = a.payload as {
            keyword?: string;
            position?: number;
            domain?: string;
            url?: string;
            matchedLabel?: string | null;
          };
          return (
            <li key={a.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`pill ring-1 ${SEV_TONE[a.severity] ?? SEV_TONE.warning}`}>
                    {a.severity} · #{p.position ?? "?"}
                  </span>
                  <span className="font-semibold text-white">{p.keyword ?? "(?)"}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {new Date(a.createdAt).toLocaleString("de-DE")}
                  {a.emailSent === 1 ? " · 📧 mailed" : " · pending"}
                </div>
              </div>
              <div className="mt-2 text-sm text-slate-300 flex flex-wrap items-center gap-2">
                <span className="text-displacement">{p.domain ?? ""}</span>
                {p.matchedLabel && <span className="text-slate-500">· {p.matchedLabel}</span>}
              </div>
              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-[12px] text-slate-400 hover:text-brand-gold"
                >
                  {p.url}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "sky" | "rose";
}) {
  const toneClass = {
    emerald: "text-brand-emerald",
    sky: "text-brand-sky",
    rose: "text-displacement",
  }[tone];
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
