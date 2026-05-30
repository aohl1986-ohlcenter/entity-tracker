import { db } from "@/lib/db";
import { entities, alerts } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const SEV_TONE: Record<string, string> = {
  critical: "bg-displacement/20 text-displacement ring-displacement/40",
  high: "bg-displacement/15 text-displacement ring-displacement/30",
  warning: "bg-brand-gold/15 text-brand-gold ring-brand-gold/30",
  info: "bg-brand-sky/15 text-brand-sky ring-brand-sky/30",
};

const TYPE_TONE: Record<string, string> = {
  displacement_top3: "bg-displacement/15 text-displacement ring-displacement/30",
  rank_drop: "bg-displacement/15 text-displacement ring-displacement/30",
  rank_gain: "bg-brand-emerald/15 text-brand-emerald ring-brand-emerald/30",
  score_drop: "bg-brand-gold/15 text-brand-gold ring-brand-gold/30",
  citation_loss: "bg-brand-gold/15 text-brand-gold ring-brand-gold/30",
  authority_candidate: "bg-brand-sky/15 text-brand-sky ring-brand-sky/30",
};

const TYPE_LABEL: Record<string, string> = {
  displacement_top3: "Displacement Top3",
  rank_drop: "Rank-Drop",
  rank_gain: "Rank-Gain",
  score_drop: "Score-Drop",
  citation_loss: "Citation-Loss",
  authority_candidate: "Authority-Kandidat",
};

type AlertRow = {
  id: number;
  type: string;
  severity: string;
  subject: string;
  payload: Record<string, unknown>;
  emailSent: number;
  createdAt: Date;
  resolvedAt: Date | null;
};

export default async function AlertsPage() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) {
    return <p className="text-slate-400">Entity {slug} fehlt — bitte seed laufen lassen.</p>;
  }

  const rows = (await db
    .select()
    .from(alerts)
    .where(eq(alerts.entityId, entity.id))
    .orderBy(desc(alerts.createdAt))
    .limit(80)) as AlertRow[];

  const emailed = rows.filter((r) => r.emailSent === 1).length;
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + 1;

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-gold">Alerts</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Daily Digest</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sechs Alert-Typen: Displacement Top3, Rank-Drops &amp; -Gains für Owned-URLs,
          Score-Drops je Keyword, Citation-Loss pro Engine, neue Authority-Kandidaten.
          Eine kombinierte Digest-Mail pro Cron-Run.
        </p>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
          <Stat label="Alerts gesamt" value={rows.length} tone="rose" />
          <Stat label="Davon per Mail" value={emailed} tone="emerald" />
          <Stat label="Offen" value={rows.filter((r) => !r.resolvedAt).length} tone="sky" />
        </div>
        {Object.keys(byType).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(byType).map(([t, n]) => (
              <span key={t} className={`pill ring-1 ${TYPE_TONE[t] ?? "bg-white/5 text-slate-300 ring-white/10"}`}>
                {TYPE_LABEL[t] ?? t} · {n}
              </span>
            ))}
          </div>
        )}
      </section>

      {rows.length === 0 && (
        <div className="card p-6 text-slate-400">
          Noch keine Alerts. Cron läuft täglich 06:00 / 06:30 UTC; sobald ein
          Ereignis erkannt wird, landet es hier (und im Posteingang).
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((a) => (
          <AlertItem key={a.id} alert={a} />
        ))}
      </ul>
    </div>
  );
}

function AlertItem({ alert }: { alert: AlertRow }) {
  const p = alert.payload;
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`pill ring-1 ${SEV_TONE[alert.severity] ?? SEV_TONE.warning}`}>
            {alert.severity}
          </span>
          <span className={`pill ring-1 ${TYPE_TONE[alert.type] ?? "bg-white/5 text-slate-300 ring-white/10"}`}>
            {TYPE_LABEL[alert.type] ?? alert.type}
          </span>
        </div>
        <div className="text-[11px] text-slate-500">
          {new Date(alert.createdAt).toLocaleString("de-DE")}
          {alert.emailSent === 1 ? " · 📧 mailed" : " · pending"}
        </div>
      </div>
      <div className="mt-2 text-sm font-medium text-white">{alert.subject}</div>
      <AlertDetails type={alert.type} payload={p} />
    </li>
  );
}

function AlertDetails({ type, payload }: { type: string; payload: Record<string, unknown> }) {
  const p = payload as {
    keyword?: string;
    position?: number;
    prevPosition?: number | null;
    newPosition?: number | null;
    droppedOut?: boolean;
    domain?: string;
    url?: string;
    title?: string | null;
    matchedLabel?: string | null;
    classification?: string;
    currentScore?: number;
    avgPrev?: number;
    drop?: number;
    lookbackDays?: number;
    engine?: string;
    previousHits?: number;
    totalPrevRuns?: number;
    hits?: number;
    bestPosition?: number;
    samples?: { url: string; title: string | null; position: number }[];
  };

  switch (type) {
    case "displacement_top3":
      return (
        <div className="mt-2 text-sm text-slate-300 flex flex-wrap items-center gap-2">
          <span className="text-displacement">#{p.position}</span>
          <span>·</span>
          <span>{p.keyword}</span>
          <span>·</span>
          <span className="text-slate-400">{p.domain}</span>
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto truncate text-[12px] text-slate-500 hover:text-brand-gold max-w-[60%]">
              {p.url}
            </a>
          )}
        </div>
      );
    case "rank_drop":
      return (
        <div className="mt-2 text-sm text-slate-300 flex flex-wrap items-center gap-2">
          <span className="text-displacement">#{p.prevPosition} → {p.newPosition ?? "out"}</span>
          <span>·</span>
          <span>{p.keyword}</span>
          <span>·</span>
          <span className="text-slate-400">{p.domain}</span>
          {p.matchedLabel && <span className="text-slate-500">· {p.matchedLabel}</span>}
        </div>
      );
    case "rank_gain":
      return (
        <div className="mt-2 text-sm text-slate-300 flex flex-wrap items-center gap-2">
          <span className="text-brand-emerald">
            {p.prevPosition ? `#${p.prevPosition} → #${p.newPosition}` : `neu #${p.newPosition}`}
          </span>
          <span>·</span>
          <span>{p.keyword}</span>
          <span>·</span>
          <span className="text-slate-400">{p.domain}</span>
          {p.matchedLabel && <span className="text-slate-500">· {p.matchedLabel}</span>}
        </div>
      );
    case "score_drop":
      return (
        <div className="mt-2 text-sm text-slate-300 flex flex-wrap items-center gap-2">
          <span className="text-brand-gold">
            {p.avgPrev} → {p.currentScore} (−{p.drop})
          </span>
          <span>·</span>
          <span>{p.keyword}</span>
          <span className="text-slate-500">· Ø über {p.lookbackDays} Tage</span>
        </div>
      );
    case "citation_loss":
      return (
        <div className="mt-2 text-sm text-slate-300 flex flex-wrap items-center gap-2">
          <span className="text-brand-gold">{p.engine}</span>
          <span>·</span>
          <span className="text-slate-300">{p.classification}</span>
          <span>·</span>
          <span className="text-slate-400">
            war in {p.previousHits}/{p.totalPrevRuns} vorigen Runs, jetzt nicht mehr
          </span>
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto truncate text-[12px] text-slate-500 hover:text-brand-gold max-w-[60%]">
              {p.title ?? p.url}
            </a>
          )}
        </div>
      );
    case "authority_candidate":
      return (
        <div className="mt-2 text-sm text-slate-300">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-brand-sky">{p.domain}</span>
            <span>·</span>
            <span>{p.hits}× in Top 5</span>
            <span>·</span>
            <span className="text-slate-400">best #{p.bestPosition}</span>
            <span className="text-slate-500">· letzte {p.lookbackDays} Tage</span>
          </div>
          {p.samples && p.samples.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px] text-slate-400">
              {p.samples.map((s, i) => (
                <li key={i} className="truncate">
                  #{s.position} · <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-brand-gold">{s.title ?? s.url}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    default:
      return null;
  }
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
