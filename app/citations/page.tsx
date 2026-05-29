import { db } from "@/lib/db";
import { entities, aiCitations } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CLS_TONE: Record<string, string> = {
  owned: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  authority: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  displacement: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export default async function CitationsPage() {
  const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
  )[0];
  if (!entity) {
    return <p className="text-slate-500">Entity {slug} fehlt — bitte seed laufen lassen.</p>;
  }

  const rows = await db
    .select()
    .from(aiCitations)
    .where(eq(aiCitations.entityId, entity.id))
    .orderBy(desc(aiCitations.fetchedAt))
    .limit(50);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">AI Search Readiness</h1>
        <p className="text-slate-500 text-sm">
          Wie oft zitiert die KI (Gemini, grounded) die Ziel-URLs als Quelle.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-slate-500">
          Noch keine Daten. Führe <code>npm run fetch:citations</code> aus.
        </p>
      )}

      <div className="space-y-6">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-lg border border-slate-200 dark:border-slate-800 p-4"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{row.query}</h2>
              <div className="text-xs text-slate-500">
                {row.engine} · {new Date(row.fetchedAt).toLocaleString("de-DE")}
              </div>
            </header>
            <div className="mt-2 text-xs text-slate-500">
              {row.totalCitations} Quellen · {row.ownedHits} owned · {row.authorityHits} authority
            </div>
            <ul className="mt-3 space-y-1.5">
              {row.citedUrls.map((c, i) => (
                <li key={i} className="flex gap-2 items-baseline text-sm">
                  <span
                    className={`text-xs font-semibold rounded px-1.5 py-0.5 ${CLS_TONE[c.classification]}`}
                  >
                    {c.classification}
                  </span>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:underline"
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
