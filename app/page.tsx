import Link from "next/link";
import { db } from "@/lib/db";
import { entities, keywords, serpSnapshots } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function loadOverview(slug: string) {
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) return null;

  const kws = await db.select().from(keywords).where(eq(keywords.entityId, entity.id));

  const latest = await Promise.all(
    kws.map(async (kw) => {
      const snap = (
        await db
          .select()
          .from(serpSnapshots)
          .where(eq(serpSnapshots.keywordId, kw.id))
          .orderBy(desc(serpSnapshots.fetchedAt))
          .limit(1)
      )[0];
      return { keyword: kw, snapshot: snap };
    }),
  );

  const tracked = latest.filter((l) => l.snapshot);
  const avgScore = tracked.length
    ? Math.round(
        tracked.reduce((a, l) => a + (l.snapshot?.dominationScore ?? 0), 0) / tracked.length,
      )
    : 0;
  const totals = tracked.reduce(
    (acc, l) => ({
      owned: acc.owned + (l.snapshot?.ownedCount ?? 0),
      authority: acc.authority + (l.snapshot?.authorityCount ?? 0),
      displacement: acc.displacement + (l.snapshot?.displacementCount ?? 0),
    }),
    { owned: 0, authority: 0, displacement: 0 },
  );

  return { entity, latest, avgScore, totals };
}

function ScoreRing({ score }: { score: number }) {
  const stroke = score >= 80 ? "#10b981" : score >= 50 ? "#ffc829" : "#ff6b6b";
  const dash = Math.max(0, Math.min(100, score));
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeDasharray={`${dash}, 100`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-white">{score}</div>
        <div className="text-[10px] uppercase tracking-widest text-slate-400">/ 100</div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "emerald" | "sky" | "rose";
}) {
  const toneClass = {
    emerald: "text-brand-emerald",
    sky: "text-brand-sky",
    rose: "text-displacement",
  }[tone];
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-brand-emerald/15 text-brand-emerald ring-brand-emerald/30"
      : score >= 50
        ? "bg-brand-gold/15 text-brand-gold ring-brand-gold/30"
        : "bg-displacement/15 text-displacement ring-displacement/30";
  return (
    <span className={`inline-flex min-w-[2.5rem] justify-center rounded-md px-2 py-1 text-sm font-semibold ring-1 ${tone}`}>
      {score}
    </span>
  );
}

const CLUSTER_LABELS: Record<string, string> = {
  name: "Name",
  name_topic: "Name + Thema",
  topic: "Thema (ohne Name)",
};

export default async function Page() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const data = await loadOverview(slug);

  if (!data) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Keine Daten</h1>
        <p className="mt-2 text-sm text-slate-400">
          Lege die Datenbank an mit <code className="text-brand-emerald">npm run db:push</code>, dann
          seed mit <code className="text-brand-emerald">npm run db:seed</code> und triggere{" "}
          <code className="text-brand-emerald">npm run fetch:serps</code>.
        </p>
      </div>
    );
  }

  const { entity, latest, avgScore, totals } = data;
  const byCluster: Record<string, typeof latest> = {};
  for (const l of latest) (byCluster[l.keyword.cluster] ??= []).push(l);

  return (
    <div className="space-y-10">
      <section className="card p-6 flex flex-wrap items-center gap-6 justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-brand-gold">Entity</div>
          <h1 className="mt-1 text-3xl font-bold text-white">{entity.name}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {latest.length} Keywords getrackt · Ziel: 80–90 % SERP-Domination
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3 max-w-md">
            <MiniStat label="Owned" value={totals.owned} tone="emerald" />
            <MiniStat label="Authority" value={totals.authority} tone="sky" />
            <MiniStat label="Displacement" value={totals.displacement} tone="rose" />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <ScoreRing score={avgScore} />
          <div className="mt-2 text-[10px] uppercase tracking-widest text-slate-400">
            Ø Domination Score
          </div>
        </div>
      </section>

      {Object.entries(byCluster).map(([cluster, rows]) => {
        const clusterAvg = rows.length
          ? Math.round(
              rows.reduce((a, r) => a + (r.snapshot?.dominationScore ?? 0), 0) / rows.length,
            )
          : 0;
        return (
          <section key={cluster}>
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                {CLUSTER_LABELS[cluster] ?? cluster}
              </h2>
              <span className="text-[11px] text-slate-500">
                Ø {clusterAvg} · {rows.length} Keywords
              </span>
            </div>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b border-white/5">
                    <th className="px-4 py-3 font-medium text-slate-400">Keyword</th>
                    <th className="px-4 py-3 font-medium text-slate-400">Score</th>
                    <th className="px-4 py-3 font-medium text-owned">Owned</th>
                    <th className="px-4 py-3 font-medium text-authority">Authority</th>
                    <th className="px-4 py-3 font-medium text-displacement">Displacement</th>
                    <th className="px-4 py-3 font-medium text-slate-400">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.keyword.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/keywords/${l.keyword.id}`}
                          className="font-medium text-white hover:text-brand-emerald"
                        >
                          {l.keyword.query}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {l.snapshot ? <ScorePill score={l.snapshot.dominationScore} /> : "—"}
                      </td>
                      <td className="px-4 py-3 text-owned">{l.snapshot?.ownedCount ?? "—"}</td>
                      <td className="px-4 py-3 text-authority">{l.snapshot?.authorityCount ?? "—"}</td>
                      <td className="px-4 py-3 text-displacement">
                        {l.snapshot?.displacementCount ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {l.snapshot
                          ? new Date(l.snapshot.fetchedAt).toLocaleString("de-DE")
                          : "noch nie"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
