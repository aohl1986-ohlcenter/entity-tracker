import Link from "next/link";
import { db } from "@/lib/db";
import { entities, keywords, serpSnapshots, serpResults } from "@/lib/schema";
import { and, desc, eq, sql } from "drizzle-orm";

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

  return { entity, latest, avgScore };
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
      : score >= 50
        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200";
  return (
    <span className={`inline-flex min-w-[3rem] justify-center rounded-md px-2 py-1 text-sm font-semibold ${tone}`}>
      {score}
    </span>
  );
}

const CLUSTER_LABELS: Record<string, string> = {
  name: "Name",
  name_topic: "Name + Thema",
  topic: "Thema",
};

export default async function Page() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const data = await loadOverview(slug);

  if (!data) {
    return (
      <div className="prose dark:prose-invert">
        <h1>Keine Daten</h1>
        <p>
          Lege die Datenbank an mit <code>npm run db:push</code>, dann seed mit{" "}
          <code>npm run db:seed</code> und triggere{" "}
          <code>npm run fetch:serps</code>.
        </p>
      </div>
    );
  }

  const { entity, latest, avgScore } = data;
  const byCluster: Record<string, typeof latest> = {};
  for (const l of latest) {
    (byCluster[l.keyword.cluster] ??= []).push(l);
  }

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{entity.name}</h1>
          <p className="text-slate-500 text-sm">
            Entity-Tracker · {latest.length} Keywords · Ziel: 80–90 % SERP-Domination
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Ø Domination Score
          </div>
          <div className="mt-1"><ScoreBadge score={avgScore} /></div>
        </div>
      </section>

      {Object.entries(byCluster).map(([cluster, rows]) => (
        <section key={cluster}>
          <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">
            {CLUSTER_LABELS[cluster] ?? cluster}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-900 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Keyword</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium text-owned">Owned</th>
                  <th className="px-3 py-2 font-medium text-authority">Authority</th>
                  <th className="px-3 py-2 font-medium text-displacement">Displacement</th>
                  <th className="px-3 py-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.keyword.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="px-3 py-2">
                      <Link
                        href={`/keywords/${l.keyword.id}`}
                        className="hover:underline font-medium"
                      >
                        {l.keyword.query}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {l.snapshot ? <ScoreBadge score={l.snapshot.dominationScore} /> : "—"}
                    </td>
                    <td className="px-3 py-2 text-owned">{l.snapshot?.ownedCount ?? "—"}</td>
                    <td className="px-3 py-2 text-authority">{l.snapshot?.authorityCount ?? "—"}</td>
                    <td className="px-3 py-2 text-displacement">{l.snapshot?.displacementCount ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-500">
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
      ))}
    </div>
  );
}
