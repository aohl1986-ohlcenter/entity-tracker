import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type DayRow = { day: string; engine: string; calls: number; failures: number };
type TenantRow = {
  name: string;
  slug: string;
  engine: string;
  calls: number;
  failures: number;
};
type ExpectedRow = { name: string; slug: string; kw: number; prompts: number };

export default async function UsagePage() {
  const [daily, perTenant, expected] = await Promise.all([
    db.execute(sql`
      select day, engine, sum(calls)::int as calls, sum(failures)::int as failures
      from api_usage
      where day >= to_char(now() - interval '30 days', 'YYYY-MM-DD')
      group by day, engine
      order by day desc, engine
    `),
    db.execute(sql`
      select e.name, e.slug, u.engine, sum(u.calls)::int as calls, sum(u.failures)::int as failures
      from api_usage u join entities e on e.id = u.entity_id
      where u.day >= to_char(now() - interval '30 days', 'YYYY-MM-DD')
      group by e.name, e.slug, u.engine
      order by e.name, u.engine
    `),
    db.execute(sql`
      select e.name, e.slug,
        coalesce((select count(*)::int from keywords k where k.entity_id = e.id and k.active = 1), 0) as kw,
        coalesce((select count(*)::int from citation_prompts p where p.entity_id = e.id and p.active = 1), 0) as prompts
      from entities e where e.status = 'active' order by e.name
    `),
  ]);

  const dayRows = daily.rows as unknown as DayRow[];
  const tenantRows = perTenant.rows as unknown as TenantRow[];
  const expectedRows = expected.rows as unknown as ExpectedRow[];

  // Tage × Engines pivotieren
  const engines = [...new Set(dayRows.map((r) => r.engine))].sort();
  const days = [...new Set(dayRows.map((r) => r.day))];
  const byDay = new Map<string, Map<string, DayRow>>();
  for (const r of dayRows) {
    if (!byDay.has(r.day)) byDay.set(r.day, new Map());
    byDay.get(r.day)!.set(r.engine, r);
  }

  return (
    <div className="space-y-8">
      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Erwartete Calls pro Tag (aktive Kunden)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2">Kunde</th>
              <th className="px-3 py-2">Serper (Keywords)</th>
              <th className="px-3 py-2">KI-Engines (Prompts × 4)</th>
            </tr>
          </thead>
          <tbody>
            {expectedRows.map((r) => (
              <tr key={r.slug} className="border-b border-white/5">
                <td className="px-3 py-2 text-white">{r.name}</td>
                <td className="px-3 py-2 text-slate-300">{r.kw}</td>
                <td className="px-3 py-2 text-slate-300">{r.prompts * 4}</td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2 font-semibold text-brand-gold">Σ täglich</td>
              <td className="px-3 py-2 font-semibold text-brand-gold">
                {expectedRows.reduce((a, r) => a + r.kw, 0)}
              </td>
              <td className="px-3 py-2 font-semibold text-brand-gold">
                {expectedRows.reduce((a, r) => a + r.prompts * 4, 0)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-[12px] text-slate-500">
          Kapazität Free-Tier: Tavily 1.000/Monat · Brave ~1.000/Monat · Serper Einmal-Credits.
          Vor Kunde Nr. 3 auf bezahlte Tarife wechseln (Serper ~0,30$/1k Abfragen).
        </p>
      </section>

      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Gemessene Calls (letzte 30 Tage)</h3>
        {days.length === 0 ? (
          <p className="text-sm text-slate-400">
            Noch keine Messdaten — erscheinen ab dem nächsten täglichen Lauf.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Tag</th>
                {engines.map((e) => (
                  <th key={e} className="px-3 py-2">
                    {e}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d} className="border-b border-white/5">
                  <td className="px-3 py-2 text-white">{d}</td>
                  {engines.map((e) => {
                    const r = byDay.get(d)?.get(e);
                    return (
                      <td key={e} className="px-3 py-2 text-slate-300">
                        {r ? (
                          <>
                            {r.calls}
                            {r.failures > 0 && (
                              <span className="text-displacement"> ({r.failures}✗)</span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Pro Kunde (30-Tage-Summe)</h3>
        {tenantRows.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Messdaten.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Engine</th>
                <th className="px-3 py-2">Calls</th>
                <th className="px-3 py-2">Fehler</th>
              </tr>
            </thead>
            <tbody>
              {tenantRows.map((r, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="px-3 py-2 text-white">{r.name}</td>
                  <td className="px-3 py-2 text-slate-400">{r.engine}</td>
                  <td className="px-3 py-2 text-slate-300">{r.calls}</td>
                  <td className={`px-3 py-2 ${r.failures > 0 ? "text-displacement" : "text-slate-500"}`}>
                    {r.failures}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
