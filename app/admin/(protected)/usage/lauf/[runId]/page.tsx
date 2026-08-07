import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { formatiereUsdAusNano } from "@/lib/kosten";

export const dynamic = "force-dynamic";

type Kopf = {
  run_id: string;
  name: string;
  art: string;
  started_at: string;
  finished_at: string | null;
  ok: number;
  calls: number;
  failures: number;
  cost_nano_usd: number;
};

type Vorgang = {
  seq: number;
  parent_seq: number | null;
  engine: string;
  model: string | null;
  operation: string;
  anlass: string;
  latency_ms: number;
  ok: number;
  fehler: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  token_quelle: string;
  cost_nano_usd: number;
  cost_modell: string;
  preis_stand: string | null;
  ai_citation_id: number | null;
  serp_snapshot_id: number | null;
};

export default async function LaufDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  const [kopfRes, vorgaengeRes] = await Promise.all([
    db.execute(sql`
      select r.run_id, e.name, r.art, r.started_at, r.finished_at,
        r.ok, r.calls, r.failures, r.cost_nano_usd
      from llm_runs r join entities e on e.id = r.entity_id
      where r.run_id = ${runId} limit 1
    `),
    db.execute(sql`
      select seq, parent_seq, engine, model, operation, anlass, latency_ms, ok, fehler,
        tokens_in, tokens_out, token_quelle, cost_nano_usd, cost_modell, preis_stand,
        ai_citation_id, serp_snapshot_id
      from llm_calls where run_id = ${runId} order by seq
    `),
  ]);

  const kopf = (kopfRes.rows as unknown as Kopf[])[0];
  if (!kopf) notFound();
  const vorgaenge = vorgaengeRes.rows as unknown as Vorgang[];

  const dauer = kopf.finished_at
    ? Math.round(
        (new Date(kopf.finished_at).getTime() - new Date(kopf.started_at).getTime()) / 1000,
      )
    : null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/usage" className="text-[12px] text-slate-400 hover:text-brand-gold">
          ← Zurück zur API-Auslastung
        </Link>
      </div>

      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">
          Lauf {kopf.art} — {kopf.name}
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Start (UTC)</dt>
            <dd className="text-white">
              {new Date(kopf.started_at).toISOString().slice(0, 19).replace("T", " ")}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Dauer</dt>
            <dd className="text-white">{dauer === null ? "läuft noch" : `${dauer} s`}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Aufrufe</dt>
            <dd className="text-white">
              {kopf.calls}
              {kopf.failures > 0 && (
                <span className="text-displacement"> ({kopf.failures} Fehler)</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Kosten</dt>
            <dd className="text-white">{formatiereUsdAusNano(Number(kopf.cost_nano_usd))}</dd>
          </div>
        </dl>
        <p className="text-[12px] text-slate-500">
          Lauf-ID <code className="text-slate-400">{kopf.run_id}</code>
        </p>
      </section>

      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Einzelvorgänge</h3>
        {vorgaenge.length === 0 ? (
          <p className="text-sm text-slate-400">
            Keine Einzelvorgänge — entweder ist der Lauf leer geblieben, oder sie sind der
            90-Tage-Retention zum Opfer gefallen (lib/prune.ts).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Engine / Modell</th>
                  <th className="px-3 py-2">Anlass</th>
                  <th className="px-3 py-2 text-right">Latenz</th>
                  <th className="px-3 py-2 text-right">Token</th>
                  <th className="px-3 py-2 text-right">Kosten</th>
                  <th className="px-3 py-2">Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {vorgaenge.map((v) => (
                  <tr key={v.seq} className="border-b border-white/5 align-top">
                    <td className="px-3 py-2 text-slate-500">
                      {/* Eingerückt = von einem anderen Vorgang ausgelöst (Bedrock-Grounding). */}
                      {v.parent_seq !== null ? `↳ ${v.seq}` : v.seq}
                    </td>
                    <td className="px-3 py-2">
                      <span className={v.ok === 1 ? "text-white" : "text-displacement"}>
                        {v.engine}
                      </span>
                      <span className="block text-[11px] text-slate-500">{v.model ?? "—"}</span>
                    </td>
                    <td className="max-w-sm px-3 py-2">
                      <span className="block truncate text-slate-300" title={v.anlass}>
                        {v.anlass}
                      </span>
                      <span className="text-[11px] text-slate-500">{v.operation}</span>
                      {v.fehler && (
                        <span className="block text-[11px] text-displacement">{v.fehler}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-400">{v.latency_ms} ms</td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {v.token_quelle === "api" && v.tokens_in !== null ? (
                        <>
                          {v.tokens_in.toLocaleString("de-DE")} /{" "}
                          {(v.tokens_out ?? 0).toLocaleString("de-DE")}
                        </>
                      ) : (
                        <span title="Diese API liefert keine Token-Zahlen.">n. v.</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {v.cost_modell === "unbekannt" ? (
                        <span className="text-displacement" title="Kein Preis hinterlegt.">
                          nicht bezifferbar
                        </span>
                      ) : (
                        <>
                          {formatiereUsdAusNano(Number(v.cost_nano_usd))}
                          <span className="block text-[11px] text-slate-500">
                            {v.cost_modell}, Preis ab {v.preis_stand}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {v.ai_citation_id !== null && `Citation #${v.ai_citation_id}`}
                      {v.serp_snapshot_id !== null && `Snapshot #${v.serp_snapshot_id}`}
                      {v.ai_citation_id === null && v.serp_snapshot_id === null && "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
