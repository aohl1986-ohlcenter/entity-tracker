import Link from "next/link";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { planFor } from "@/lib/plans";
import {
  formatiereEur,
  formatiereUsdAusNano,
  letzteMonate,
  monatUtc,
  usdNachEur,
} from "@/lib/kosten";

export const dynamic = "force-dynamic";

type DayRow = { day: string; engine: string; calls: number; failures: number };
type MargeRow = {
  entity_id: number;
  name: string;
  slug: string;
  plan: string;
  cost_nano_usd: number;
  calls: number;
  failures: number;
  unbekannte: number;
};
type EngineRow = {
  engine: string;
  model: string;
  calls: number;
  failures: number;
  tokens_in: number;
  tokens_out: number;
  cost_nano_usd: number;
  unbekannte: number;
};
type AnlassRow = {
  anlass: string;
  engine: string;
  name: string;
  aufrufe: number;
  cost_nano_usd: number;
};
type RunRow = {
  run_id: string;
  name: string;
  art: string;
  started_at: string;
  finished_at: string | null;
  calls: number;
  failures: number;
  cost_nano_usd: number;
};
type TenantRow = {
  name: string;
  slug: string;
  engine: string;
  calls: number;
  failures: number;
};
type ExpectedRow = { name: string; slug: string; kw: number; prompts: number };

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const { monat: monatParam } = await searchParams;
  const monate = letzteMonate(6);
  const monat = monatParam && monate.includes(monatParam) ? monatParam : monatUtc();
  // Kurse und Preise sind datiert — für die Anzeige eines Monats zählt sein
  // Beginn, damit ein abgeschlossener Monat stabil bleibt.
  const monatsStichtag = `${monat}-01`;

  const [daily, perTenant, expected, marge, proEngine, anlaesse, laeufe] = await Promise.all([
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
    // Marge: alle Mandanten mit Umsatz, auch die ohne gemessene Kosten im Monat
    // (left join) — ein Kunde ohne Messdaten ist ein Befund, keine leere Zeile.
    db.execute(sql`
      select e.id as entity_id, e.name, e.slug, e.plan,
        coalesce(sum(m.cost_nano_usd), 0)::bigint as cost_nano_usd,
        coalesce(sum(m.calls), 0)::int as calls,
        coalesce(sum(m.failures), 0)::int as failures,
        coalesce(sum(m.unbekannte_kosten), 0)::int as unbekannte
      from entities e
      left join llm_cost_monthly m on m.entity_id = e.id and m.month = ${monat}
      where e.status = 'active'
      group by e.id, e.name, e.slug, e.plan
      order by e.name
    `),
    db.execute(sql`
      select engine, model,
        sum(calls)::int as calls, sum(failures)::int as failures,
        sum(tokens_in)::bigint as tokens_in, sum(tokens_out)::bigint as tokens_out,
        sum(cost_nano_usd)::bigint as cost_nano_usd,
        sum(unbekannte_kosten)::int as unbekannte
      from llm_cost_monthly where month = ${monat}
      group by engine, model order by sum(cost_nano_usd) desc, engine
    `),
    db.execute(sql`
      select c.anlass, c.engine, e.name,
        count(*)::int as aufrufe,
        sum(c.cost_nano_usd)::bigint as cost_nano_usd
      from llm_calls c join entities e on e.id = c.entity_id
      where c.month = ${monat}
      group by c.anlass, c.engine, e.name
      order by sum(c.cost_nano_usd) desc, count(*) desc
      limit 10
    `),
    db.execute(sql`
      select r.run_id, e.name, r.art, r.started_at, r.finished_at,
        r.calls, r.failures, r.cost_nano_usd
      from llm_runs r join entities e on e.id = r.entity_id
      order by r.started_at desc limit 10
    `),
  ]);

  const dayRows = daily.rows as unknown as DayRow[];
  const tenantRows = perTenant.rows as unknown as TenantRow[];
  const expectedRows = expected.rows as unknown as ExpectedRow[];
  const margeRows = marge.rows as unknown as MargeRow[];
  const engineRows = proEngine.rows as unknown as EngineRow[];
  const anlassRows = anlaesse.rows as unknown as AnlassRow[];
  const runRows = laeufe.rows as unknown as RunRow[];

  const eur = (nano: number) => usdNachEur(Number(nano), monatsStichtag) ?? 0;
  const summeKosten = margeRows.reduce((a, r) => a + eur(r.cost_nano_usd), 0);
  const summeUmsatz = margeRows.reduce((a, r) => a + planFor(r.plan).priceEur, 0);
  const summeUnbekannt = margeRows.reduce((a, r) => a + r.unbekannte, 0);

  // Gleiche Herleitung wie in lib/jobs.ts: aktiv ist, wofür ein Key gesetzt ist.
  // Vorher stand hier ein hartes „× 4“, das nach jedem Key-Wechsel falsch war.
  const aktiveEngines = (
    [
      ["gemini", process.env.GEMINI_API_KEY],
      ["tavily", process.env.TAVILY_API_KEY],
      ["brave", process.env.BRAVE_API_KEY],
      ["bedrock", process.env.BEDROCK_API_KEY],
    ] as const
  )
    .filter(([, key]) => !!key)
    .map(([name]) => name);

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-white">Marge pro Kunde — {monat}</h3>
          <nav className="flex flex-wrap gap-1 text-[12px]">
            {monate.map((m) => (
              <Link
                key={m}
                href={`/admin/usage?monat=${m}`}
                className={`rounded-md px-2 py-1 transition ${
                  m === monat
                    ? "bg-brand-gold/15 text-brand-gold"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {m}
              </Link>
            ))}
          </nav>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2">Kunde</th>
              <th className="px-3 py-2">Paket</th>
              <th className="px-3 py-2 text-right">Umsatz</th>
              <th className="px-3 py-2 text-right">API-Kosten</th>
              <th className="px-3 py-2 text-right">Marge</th>
              <th className="px-3 py-2 text-right">Marge %</th>
              <th className="px-3 py-2 text-right">Aufrufe</th>
            </tr>
          </thead>
          <tbody>
            {margeRows.map((r) => {
              const plan = planFor(r.plan);
              const kosten = eur(r.cost_nano_usd);
              const margeEur = plan.priceEur - kosten;
              const quote = plan.priceEur > 0 ? (margeEur / plan.priceEur) * 100 : 0;
              return (
                <tr key={r.slug} className="border-b border-white/5">
                  <td className="px-3 py-2 text-white">{r.name}</td>
                  <td className="px-3 py-2 text-slate-400">{plan.label}</td>
                  <td className="px-3 py-2 text-right text-slate-300">
                    {formatiereEur(plan.priceEur)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300">
                    {formatiereEur(kosten)}
                    {r.unbekannte > 0 && (
                      <span
                        className="text-displacement"
                        title={`${r.unbekannte} Aufrufe ohne hinterlegten Preis — nicht in dieser Summe enthalten.`}
                      >
                        {" "}
                        +{r.unbekannte}?
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-white">
                    {formatiereEur(margeEur)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      quote < 80 ? "text-displacement" : "text-slate-300"
                    }`}
                  >
                    {quote.toFixed(1)} %
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400">
                    {r.calls}
                    {r.failures > 0 && <span className="text-displacement"> ({r.failures}✗)</span>}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="px-3 py-2 font-semibold text-brand-gold" colSpan={2}>
                Σ {monat}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-brand-gold">
                {formatiereEur(summeUmsatz)}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-brand-gold">
                {formatiereEur(summeKosten)}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-brand-gold">
                {formatiereEur(summeUmsatz - summeKosten)}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-brand-gold">
                {summeUmsatz > 0
                  ? (((summeUmsatz - summeKosten) / summeUmsatz) * 100).toFixed(1)
                  : "0.0"}{" "}
                %
              </td>
              <td />
            </tr>
          </tbody>
        </table>
        <p className="text-[12px] text-slate-500">
          Kosten aus gemessenen Tokens bzw. Aufrufpreisen (data/preise-llm.ts, versioniert), in EUR
          zum dort hinterlegten Kurs. Umsatz ist der Listenpreis des Pakets — abgerechnet wird
          manuell.
          {summeUnbekannt > 0 && (
            <span className="text-displacement">
              {" "}
              {summeUnbekannt} Aufrufe haben keinen hinterlegten Preis und fehlen in den Summen;
              sie werden bewusst nicht geschätzt.
            </span>
          )}
        </p>
      </section>

      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Kosten nach Engine und Modell — {monat}</h3>
        {engineRows.length === 0 ? (
          <p className="text-sm text-slate-400">
            Noch keine Trace-Daten für diesen Monat — erscheinen ab dem nächsten Lauf.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Engine</th>
                <th className="px-3 py-2">Modell</th>
                <th className="px-3 py-2 text-right">Aufrufe</th>
                <th className="px-3 py-2 text-right">Token ein</th>
                <th className="px-3 py-2 text-right">Token aus</th>
                <th className="px-3 py-2 text-right">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {engineRows.map((r, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="px-3 py-2 text-white">{r.engine}</td>
                  <td className="px-3 py-2 text-slate-400">{r.model || "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-300">
                    {r.calls}
                    {r.failures > 0 && <span className="text-displacement"> ({r.failures}✗)</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400">
                    {Number(r.tokens_in) > 0 ? Number(r.tokens_in).toLocaleString("de-DE") : "n. v."}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400">
                    {Number(r.tokens_out) > 0
                      ? Number(r.tokens_out).toLocaleString("de-DE")
                      : "n. v."}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300">
                    {formatiereUsdAusNano(Number(r.cost_nano_usd))}
                    {r.unbekannte > 0 && (
                      <span className="text-displacement"> ({r.unbekannte} o. Preis)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[12px] text-slate-500">
          „n. v.“ heißt: die API liefert keine Token-Zahlen (Serper, Tavily, Brave). Dort läuft die
          Abrechnung über Aufrufpreise, nicht über eine Schätzung.
        </p>
      </section>

      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Teuerste Anlässe — {monat}</h3>
        {anlassRows.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Trace-Daten für diesen Monat.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Keyword / Prompt</th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Engine</th>
                <th className="px-3 py-2 text-right">Aufrufe</th>
                <th className="px-3 py-2 text-right">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {anlassRows.map((r, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="max-w-md truncate px-3 py-2 text-white" title={r.anlass}>
                    {r.anlass}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{r.name}</td>
                  <td className="px-3 py-2 text-slate-400">{r.engine}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{r.aufrufe}</td>
                  <td className="px-3 py-2 text-right text-slate-300">
                    {formatiereUsdAusNano(Number(r.cost_nano_usd))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[12px] text-slate-500">
          Nur so weit zurück, wie die Einzelvorgänge reichen (90 Tage, lib/prune.ts). Die
          Monatssummen oben bleiben darüber hinaus erhalten.
        </p>
      </section>

      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Letzte Läufe</h3>
        {runRows.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Läufe erfasst.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Start (UTC)</th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Art</th>
                <th className="px-3 py-2 text-right">Aufrufe</th>
                <th className="px-3 py-2 text-right">Dauer</th>
                <th className="px-3 py-2 text-right">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {runRows.map((r) => {
                const dauer = r.finished_at
                  ? Math.round(
                      (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000,
                    )
                  : null;
                return (
                  <tr key={r.run_id} className="border-b border-white/5">
                    <td className="px-3 py-2 text-white">
                      <Link
                        href={`/admin/usage/lauf/${r.run_id}`}
                        className="hover:text-brand-gold transition"
                      >
                        {new Date(r.started_at).toISOString().slice(0, 16).replace("T", " ")}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{r.name}</td>
                    <td className="px-3 py-2 text-slate-400">{r.art}</td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {r.calls}
                      {r.failures > 0 && (
                        <span className="text-displacement"> ({r.failures}✗)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {dauer === null ? "läuft…" : `${dauer} s`}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {formatiereUsdAusNano(Number(r.cost_nano_usd))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Erwartete Calls pro Tag (aktive Kunden)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2">Kunde</th>
              <th className="px-3 py-2">Serper (Keywords)</th>
              <th className="px-3 py-2">
                KI-Engines (Prompts × {aktiveEngines.length || "—"})
              </th>
            </tr>
          </thead>
          <tbody>
            {expectedRows.map((r) => (
              <tr key={r.slug} className="border-b border-white/5">
                <td className="px-3 py-2 text-white">{r.name}</td>
                <td className="px-3 py-2 text-slate-300">{r.kw}</td>
                <td className="px-3 py-2 text-slate-300">
                  {r.prompts * aktiveEngines.length}
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2 font-semibold text-brand-gold">Σ täglich</td>
              <td className="px-3 py-2 font-semibold text-brand-gold">
                {expectedRows.reduce((a, r) => a + r.kw, 0)}
              </td>
              <td className="px-3 py-2 font-semibold text-brand-gold">
                {expectedRows.reduce((a, r) => a + r.prompts * aktiveEngines.length, 0)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-[12px] text-slate-500">
          Aktive KI-Engines: {aktiveEngines.join(", ") || "keine (keine API-Keys gesetzt)"}.
          Bedrock löst pro Aufruf zusätzlich einen Serper-Abruf für sein Grounding aus — der
          erscheint oben als eigener Kostenposten. Tarife und Free-Tier-Grenzen stehen mit Quelle
          in <code className="text-slate-400">data/preise-llm.ts</code>.
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
