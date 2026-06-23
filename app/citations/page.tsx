import { db } from "@/lib/db";
import { entities, aiCitations } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { getSessionSlug } from "@/lib/session";

export const dynamic = "force-dynamic";

const CLS_TONE: Record<string, string> = {
  owned: "bg-brand-emerald/15 text-brand-emerald ring-brand-emerald/30",
  authority: "bg-brand-sky/15 text-brand-sky ring-brand-sky/30",
  displacement: "bg-displacement/15 text-displacement ring-displacement/30",
  neutral: "bg-white/5 text-slate-400 ring-white/10",
};

const ENGINE_TONE: Record<string, string> = {
  gemini: "bg-brand-gold/15 text-brand-gold ring-brand-gold/30",
  tavily: "bg-brand-sky/15 text-brand-sky ring-brand-sky/30",
  brave: "bg-displacement/15 text-displacement ring-displacement/30",
  bedrock: "bg-brand-emerald/15 text-brand-emerald ring-brand-emerald/30",
};

export default async function CitationsPage() {
  const slug = await getSessionSlug();
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) {
    return <p className="text-slate-400">Entity {slug} fehlt — bitte seed laufen lassen.</p>;
  }

  const rows = await db
    .select()
    .from(aiCitations)
    .where(eq(aiCitations.entityId, entity.id))
    .orderBy(desc(aiCitations.fetchedAt))
    .limit(50);

  const totals = rows.reduce(
    (a, r) => ({
      owned: a.owned + r.ownedHits,
      authority: a.authority + r.authorityHits,
      citations: a.citations + r.totalCitations,
    }),
    { owned: 0, authority: 0, citations: 0 },
  );

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="text-[11px] uppercase tracking-[0.2em] text-brand-gold">
          AI Search Readiness
        </div>
        <h1 className="mt-1 text-3xl font-bold text-white">AI Citations</h1>
        <p className="mt-2 text-sm text-slate-400">
          Wie oft zitieren KI-Suchen (Gemini Grounded via Vertex AI, Tavily, Brave, Bedrock) die
          Ziel-URLs als Primärquelle für definierte Themen.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3 max-w-md">
          <Stat label="Owned" value={totals.owned} tone="emerald" />
          <Stat label="Authority" value={totals.authority} tone="sky" />
          <Stat label="Quellen total" value={totals.citations} tone="neutral" />
        </div>
      </section>

      {rows.length === 0 && (
        <div className="card p-6 text-slate-400">
          Noch keine Daten. Führe <code className="text-brand-emerald">npm run fetch:citations</code>{" "}
          aus.
        </div>
      )}

      <div className="space-y-4">
        {rows.map((row) => (
          <article key={row.id} className="card p-5">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-white">{row.query}</h2>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span
                  className={`pill ring-1 ${
                    ENGINE_TONE[row.engine] ?? "bg-white/5 text-slate-400 ring-white/10"
                  }`}
                >
                  {row.engine}
                </span>
                <span>{new Date(row.fetchedAt).toLocaleString("de-DE")}</span>
              </div>
            </header>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
              <span>
                <span className="font-semibold text-white">{row.totalCitations}</span> Quellen
              </span>
              <span className="text-owned">
                {row.ownedHits} owned
              </span>
              <span className="text-authority">
                {row.authorityHits} authority
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {row.citedUrls.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className={`pill ring-1 ${CLS_TONE[c.classification]}`}>
                    {c.classification}
                  </span>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-slate-200 hover:text-brand-emerald"
                  >
                    {c.title ?? c.url}
                  </a>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
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
  tone: "emerald" | "sky" | "neutral";
}) {
  const toneClass = {
    emerald: "text-brand-emerald",
    sky: "text-brand-sky",
    neutral: "text-white",
  }[tone];
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
