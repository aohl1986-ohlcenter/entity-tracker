import Link from "next/link";
import { db } from "@/lib/db";
import { entities, keywords, serpSnapshots, aiCitations } from "@/lib/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getSessionSlug } from "@/lib/session";

export const dynamic = "force-dynamic";

async function loadOverview(slug: string) {
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) return null;

  const kws = await db.select().from(keywords).where(eq(keywords.entityId, entity.id));
  const kwIds = kws.map((k) => k.id);

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

  // Fetch history of domination score
  let history: { date: string; score: number }[] = [];
  if (kwIds.length > 0) {
    const allSnaps = await db
      .select({
        dominationScore: serpSnapshots.dominationScore,
        fetchedAt: serpSnapshots.fetchedAt,
      })
      .from(serpSnapshots)
      .where(inArray(serpSnapshots.keywordId, kwIds))
      .orderBy(serpSnapshots.fetchedAt);

    const historyMap: Record<string, { sum: number; count: number }> = {};
    for (const s of allSnaps) {
      const dateStr = s.fetchedAt.toISOString().slice(0, 10);
      if (!historyMap[dateStr]) {
        historyMap[dateStr] = { sum: 0, count: 0 };
      }
      historyMap[dateStr].sum += s.dominationScore;
      historyMap[dateStr].count += 1;
    }

    history = Object.entries(historyMap)
      .map(([date, info]) => ({
        date,
        score: Math.round(info.sum / info.count),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Fetch AI citations history
  const allCitations = await db
    .select({
      fetchedAt: aiCitations.fetchedAt,
      ownedHits: aiCitations.ownedHits,
      authorityHits: aiCitations.authorityHits,
    })
    .from(aiCitations)
    .where(eq(aiCitations.entityId, entity.id))
    .orderBy(aiCitations.fetchedAt);

  const aiHistoryMap: Record<string, { hits: number; total: number }> = {};
  for (const c of allCitations) {
    const dateStr = c.fetchedAt.toISOString().slice(0, 10);
    if (!aiHistoryMap[dateStr]) {
      aiHistoryMap[dateStr] = { hits: 0, total: 0 };
    }
    const isHit = c.ownedHits > 0 || c.authorityHits > 0;
    if (isHit) aiHistoryMap[dateStr].hits += 1;
    aiHistoryMap[dateStr].total += 1;
  }

  const aiHistory = Object.entries(aiHistoryMap)
    .map(([date, info]) => ({
      date,
      score: Math.round((info.hits / info.total) * 100),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const latestAiScore = aiHistory.length > 0 ? aiHistory[aiHistory.length - 1].score : 0;

  return { entity, latest, avgScore, totals, history, aiHistory, latestAiScore };
}

function ScoreRing({ score, variant = "gold" }: { score: number; variant?: "gold" | "sky" }) {
  let stroke = score >= 80 ? "#10b981" : score >= 50 ? "#ffc829" : "#ff6b6b";
  let glow = score >= 80 ? "rgba(16,185,129,0.35)" : score >= 50 ? "rgba(255,200,41,0.45)" : "rgba(255,107,107,0.35)";

  if (variant === "sky") {
    stroke = score >= 80 ? "#10b981" : score >= 50 ? "#7aa7ff" : "#ff6b6b";
    glow = score >= 80 ? "rgba(16,185,129,0.35)" : score >= 50 ? "rgba(122,167,255,0.45)" : "rgba(255,107,107,0.35)";
  }

  const dash = Math.max(0, Math.min(100, score));
  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 36 36" className="h-28 w-28 -rotate-90">
        <defs>
          <filter id={`ring-glow-${variant}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeDasharray={`${dash}, 100`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-bold text-white">{score}</div>
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

function DominationScoreChart({
  serpData,
  aiData,
}: {
  serpData: { date: string; score: number }[];
  aiData: { date: string; score: number }[];
}) {
  // 1. Get union of all dates, sorted chronologically
  const allDatesSet = new Set<string>();
  for (const d of serpData) allDatesSet.add(d.date);
  for (const d of aiData) allDatesSet.add(d.date);
  const allDates = Array.from(allDatesSet).sort((a, b) => a.localeCompare(b));

  if (allDates.length === 0) return null;

  const width = 800;
  const height = 240;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const N = allDates.length;

  // 2. Map dates to points for both series
  const serpPoints: { x: number; y: number; score: number; date: string }[] = [];
  const aiPoints: { x: number; y: number; score: number; date: string }[] = [];

  allDates.forEach((date, i) => {
    const x = paddingLeft + (N > 1 ? (i / (N - 1)) * chartWidth : chartWidth / 2);
    
    const serpItem = serpData.find((d) => d.date === date);
    if (serpItem) {
      const y = height - paddingBottom - (serpItem.score / 100) * chartHeight;
      serpPoints.push({ x, y, score: serpItem.score, date });
    }

    const aiItem = aiData.find((d) => d.date === date);
    if (aiItem) {
      const y = height - paddingBottom - (aiItem.score / 100) * chartHeight;
      aiPoints.push({ x, y, score: aiItem.score, date });
    }
  });

  // 3. Generate SVG Paths for SERP Domination Score
  let serpPathD = "";
  let serpAreaD = "";
  if (serpPoints.length > 0) {
    serpPathD = `M ${serpPoints[0].x} ${serpPoints[0].y}`;
    for (let i = 1; i < serpPoints.length; i++) {
      serpPathD += ` L ${serpPoints[i].x} ${serpPoints[i].y}`;
    }
    serpAreaD = `${serpPathD} L ${serpPoints[serpPoints.length - 1].x} ${height - paddingBottom} L ${serpPoints[0].x} ${height - paddingBottom} Z`;
  }

  // 4. Generate SVG Paths for AI Visibility Score
  let aiPathD = "";
  let aiAreaD = "";
  if (aiPoints.length > 0) {
    aiPathD = `M ${aiPoints[0].x} ${aiPoints[0].y}`;
    for (let i = 1; i < aiPoints.length; i++) {
      aiPathD += ` L ${aiPoints[i].x} ${aiPoints[i].y}`;
    }
    aiAreaD = `${aiPathD} L ${aiPoints[aiPoints.length - 1].x} ${height - paddingBottom} L ${aiPoints[0].x} ${height - paddingBottom} Z`;
  }

  const labelInterval = Math.max(1, Math.ceil(N / 7));
  const gridLines = [0, 25, 50, 75, 100];

  return (
    <div className="card p-6 relative overflow-hidden">
      <div
        className="absolute inset-0 -z-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(400px 150px at 25% 0%, rgba(255,200,41,0.15), transparent 70%), radial-gradient(400px 150px at 75% 0%, rgba(122,167,255,0.15), transparent 70%)",
        }}
      />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 mb-6">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-gold animate-pulse" />
          Verlauf der Veränderungen des Domination & AI Visibility Scores
        </h3>
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-gold" />
            Domination Score
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-sky" />
            AI Visibility
          </div>
        </div>
      </div>
      <div className="relative z-10 w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
          <defs>
            <linearGradient id="chartGradSerp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffc829" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ffc829" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="chartGradAi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7aa7ff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#7aa7ff" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines & Y labels */}
          {gridLines.map((gl) => {
            const y = height - paddingBottom - (gl / 100) * chartHeight;
            return (
              <g key={gl}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                  strokeDasharray={gl === 0 || gl === 100 ? "0" : "4 4"}
                />
                <text
                  x={paddingLeft - 12}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  className="fill-slate-500 font-mono font-medium"
                >
                  {gl}%
                </text>
              </g>
            );
          })}

          {/* Areas under the paths */}
          {serpAreaD && <path d={serpAreaD} fill="url(#chartGradSerp)" />}
          {aiAreaD && <path d={aiAreaD} fill="url(#chartGradAi)" />}

          {/* Domination Score line */}
          {serpPathD && (
            <path
              d={serpPathD}
              fill="none"
              stroke="#ffc829"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* AI Visibility line */}
          {aiPathD && (
            <path
              d={aiPathD}
              fill="none"
              stroke="#7aa7ff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* SERP Points & hover circles */}
          {serpPoints.map((pt, i) => (
            <g key={`serp-${i}`} className="group cursor-pointer">
              <circle
                cx={pt.x}
                cy={pt.y}
                r="4.5"
                className="fill-brand-gold stroke-slate-950 stroke-2 transition-all duration-200 group-hover:r-6"
              />
              <rect
                x={pt.x - 18}
                y={pt.y - 23}
                width="36"
                height="14"
                rx="3.5"
                className="fill-slate-950/95 stroke-brand-gold/40 stroke-[0.75] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
              />
              <text
                x={pt.x}
                y={pt.y - 12}
                textAnchor="middle"
                fontSize="10"
                className="fill-white font-mono font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
              >
                {pt.score}%
              </text>
            </g>
          ))}

          {/* AI Points & hover circles */}
          {aiPoints.map((pt, i) => (
            <g key={`ai-${i}`} className="group cursor-pointer">
              <circle
                cx={pt.x}
                cy={pt.y}
                r="4.5"
                className="fill-brand-sky stroke-slate-950 stroke-2 transition-all duration-200 group-hover:r-6"
              />
              <rect
                x={pt.x - 18}
                y={pt.y - 23}
                width="36"
                height="14"
                rx="3.5"
                className="fill-slate-950/95 stroke-brand-sky/40 stroke-[0.75] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
              />
              <text
                x={pt.x}
                y={pt.y - 12}
                textAnchor="middle"
                fontSize="10"
                className="fill-white font-mono font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
              >
                {pt.score}%
              </text>
            </g>
          ))}

          {/* X axis labels */}
          {allDates.map((date, i) => {
            const showLabel = i % labelInterval === 0 || i === N - 1;
            if (!showLabel) return null;

            const x = paddingLeft + (N > 1 ? (i / (N - 1)) * chartWidth : chartWidth / 2);
            let formattedDate = date;
            try {
              const d = new Date(date);
              formattedDate = d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
            } catch {}

            return (
              <text
                key={i}
                x={x}
                y={height - 10}
                textAnchor="middle"
                fontSize="9.5"
                className="fill-slate-400 font-medium"
              >
                {formattedDate}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const CLUSTER_LABELS: Record<string, string> = {
  name: "Name",
  name_topic: "Name + Thema",
  topic: "Thema (ohne Name)",
};

export default async function Page() {
  const slug = await getSessionSlug();
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

  const { entity, latest, avgScore, totals, history, aiHistory, latestAiScore } = data;
  const byCluster: Record<string, typeof latest> = {};
  for (const l of latest) (byCluster[l.keyword.cluster] ??= []).push(l);

  return (
    <div className="space-y-10">
      <section className="card relative overflow-hidden p-6 flex flex-wrap items-center gap-6 justify-between">
        <div className="absolute inset-0 -z-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(600px 200px at 0% 0%, rgba(255,200,41,0.18), transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-brand-gold">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-gold" />
            Entity
          </div>
          <h1 className="mt-2 text-3xl font-bold text-white tracking-tight">{entity.name}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {latest.length} Keywords getrackt · Ziel: 80–90 % SERP-Domination
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3 max-w-md">
            <MiniStat label="Owned" value={totals.owned} tone="emerald" />
            <MiniStat label="Authority" value={totals.authority} tone="sky" />
            <MiniStat label="Displacement" value={totals.displacement} tone="rose" />
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-8">
          <div className="flex flex-col items-center">
            <ScoreRing score={avgScore} variant="gold" />
            <div className="mt-3 text-[10px] uppercase tracking-widest text-slate-400">
              Ø Domination
            </div>
          </div>
          <div className="flex flex-col items-center">
            <ScoreRing score={latestAiScore} variant="sky" />
            <div className="mt-3 text-[10px] uppercase tracking-widest text-slate-400">
              Ø AI Visibility
            </div>
          </div>
        </div>
      </section>

      <DominationScoreChart serpData={history} aiData={aiHistory} />

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
