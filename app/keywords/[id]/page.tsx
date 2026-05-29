import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { keywords, serpSnapshots, serpResults } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CLS_TONE: Record<string, string> = {
  owned: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  authority: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  displacement: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
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
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← zurück
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{kw.query}</h1>
        <p className="text-slate-500 text-sm">
          Cluster: {kw.cluster} · {kw.locale.toUpperCase()} / {kw.location} · {kw.device}
        </p>
      </div>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">
          Aktuelle SERP (Top 10)
        </h2>
        {!latest && <p className="text-slate-500">Noch kein Snapshot.</p>}
        {latest && (
          <ol className="space-y-2">
            {results.map((r) => (
              <li
                key={r.id}
                className="flex gap-3 rounded-md border border-slate-200 dark:border-slate-800 p-3"
              >
                <div className="text-slate-500 w-6 text-right">{r.position}.</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span
                      className={`text-xs font-semibold rounded px-1.5 py-0.5 ${CLS_TONE[r.classification]}`}
                    >
                      {r.classification}
                      {r.matchedLabel ? ` · ${r.matchedLabel}` : ""}
                    </span>
                    <span className="text-slate-500 text-xs">{r.domain}</span>
                  </div>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-1 font-medium hover:underline truncate"
                  >
                    {r.title ?? r.url}
                  </a>
                  {r.snippet && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{r.snippet}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">
          Historie (letzte 30 Snapshots)
        </h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium text-owned">Owned</th>
                <th className="px-3 py-2 font-medium text-authority">Authority</th>
                <th className="px-3 py-2 font-medium text-displacement">Displacement</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-3 py-2">{new Date(s.fetchedAt).toLocaleString("de-DE")}</td>
                  <td className="px-3 py-2 font-semibold">{s.dominationScore}</td>
                  <td className="px-3 py-2 text-owned">{s.ownedCount}</td>
                  <td className="px-3 py-2 text-authority">{s.authorityCount}</td>
                  <td className="px-3 py-2 text-displacement">{s.displacementCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
