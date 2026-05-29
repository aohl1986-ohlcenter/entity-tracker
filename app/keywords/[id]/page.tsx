import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { keywords, serpSnapshots, serpResults } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CLS_TONE: Record<string, string> = {
  owned: "bg-brand-emerald/15 text-brand-emerald ring-brand-emerald/30",
  authority: "bg-brand-sky/15 text-brand-sky ring-brand-sky/30",
  displacement: "bg-displacement/15 text-displacement ring-displacement/30",
  neutral: "bg-white/5 text-slate-400 ring-white/10",
};

export default async function KeywordDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const kwId = Number(id);
  if (!Number.isFinite(kwId)) notFound();

  const kw = (await db.select().from(keywords).where(eq(keywords.id, kwId)).limit(1))[0];
  if (!kw) notFound();

  const snapshots = await db
    .select()
    .from(serpSnapshots)
    .where(eq(serpSnapshots.keywordId, kw.id))
    .orderBy(desc(serpSnapshots.fetchedAt))
    .limit(30);

  const latest = snapshots[0];
  const results = latest
    ? await db
        .select()
        .from(serpResults)
        .where(eq(serpResults.snapshotId, latest.id))
        .orderBy(serpResults.position)
    : [];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-slate-400 hover:text-brand-emerald">
          ← zurück
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-white">{kw.query}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Cluster: {kw.cluster} · {kw.locale.toUpperCase()} / {kw.location} · {kw.device}
          {latest && (
            <>
              {" "}
              · Score{" "}
              <span className="font-semibold text-white">{latest.dominationScore}</span>
            </>
          )}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-[11px] uppercase tracking-[0.2em] text-slate-400">
          Aktuelle SERP (Top 10)
        </h2>
        {!latest && <p className="text-slate-400">Noch kein Snapshot.</p>}
        {latest && (
          <ol className="space-y-2">
            {results.map((r) => (
              <li key={r.id} className="card flex gap-3 p-3">
                <div className="w-7 text-right font-mono text-slate-500">{r.position}.</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`pill ring-1 ${CLS_TONE[r.classification]}`}>
                      {r.classification}
                    </span>
                    {r.matchedLabel && (
                      <span className="text-[11px] text-slate-400">{r.matchedLabel}</span>
                    )}
                    <span className="text-[11px] text-slate-500">{r.domain}</span>
                  </div>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate font-medium text-white hover:text-brand-emerald"
                  >
                    {r.title ?? r.url}
                  </a>
                  {r.snippet && (
                    <p className="mt-1 text-sm text-slate-400 line-clamp-2">{r.snippet}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[11px] uppercase tracking-[0.2em] text-slate-400">
          Historie (letzte 30 Snapshots)
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 font-medium text-slate-400">Datum</th>
                <th className="px-4 py-3 font-medium text-slate-400">Score</th>
                <th className="px-4 py-3 font-medium text-owned">Owned</th>
                <th className="px-4 py-3 font-medium text-authority">Authority</th>
                <th className="px-4 py-3 font-medium text-displacement">Displacement</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-t border-white/5">
                  <td className="px-4 py-3 text-slate-300">
                    {new Date(s.fetchedAt).toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">{s.dominationScore}</td>
                  <td className="px-4 py-3 text-owned">{s.ownedCount}</td>
                  <td className="px-4 py-3 text-authority">{s.authorityCount}</td>
                  <td className="px-4 py-3 text-displacement">{s.displacementCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
