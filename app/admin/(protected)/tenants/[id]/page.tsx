import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { entities, keywords, targetUrls, citationPrompts, wantedLinks } from "@/lib/schema";
import { planFor, PLANS, PLAN_IDS, TENANT_STATUSES, STATUS_LABELS } from "@/lib/plans";
import {
  updateTenant,
  deleteTenant,
  saveGeoNotes,
  addKeyword,
  toggleKeyword,
  deleteKeyword,
  addTarget,
  deleteTarget,
  addPrompt,
  togglePrompt,
  deletePrompt,
  addWantedLink,
  deleteWantedLink,
} from "@/app/admin/actions";
import { PasswordSection } from "./password-section";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-white placeholder:text-slate-500 focus:border-brand-gold/50 focus:outline-none";
const btnGold =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy transition hover:opacity-90";
const btnGhost =
  "rounded-md px-2 py-1 text-[12px] text-slate-400 transition hover:bg-white/5 hover:text-white";

const ERROR_TEXT: Record<string, string> = {
  invalid: "Eingabe ungültig.",
  plan: "Ungültiges Paket.",
  status: "Ungültiger Status.",
  "kw-limit": "Keyword-Limit des Pakets erreicht — erst upgraden oder ein Keyword deaktivieren.",
  confirm: "Löschbestätigung falsch: bitte den exakten Slug eintippen.",
};

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const entity = (await db.select().from(entities).where(eq(entities.id, id)).limit(1))[0];
  if (!entity) notFound();

  const [kws, targets, prompts, wanted] = await Promise.all([
    db.select().from(keywords).where(eq(keywords.entityId, id)).orderBy(keywords.id),
    db.select().from(targetUrls).where(eq(targetUrls.entityId, id)).orderBy(targetUrls.id),
    db.select().from(citationPrompts).where(eq(citationPrompts.entityId, id)).orderBy(citationPrompts.id),
    db.select().from(wantedLinks).where(eq(wantedLinks.entityId, id)).orderBy(wantedLinks.id),
  ]);

  const plan = planFor(entity.plan);
  const activeKw = kws.filter((k) => k.active === 1).length;
  const overLimit = activeKw > plan.maxKeywords;
  const error = sp?.error ? (ERROR_TEXT[sp.error] ?? "Fehler.") : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-slate-400 hover:text-brand-gold">
            ← Übersicht
          </Link>
          <h2 className="mt-1 text-2xl font-bold text-white">{entity.name}</h2>
          <p className="text-sm text-slate-500">
            {entity.slug} · seit {entity.createdAt.toLocaleDateString("de-DE")}
          </p>
        </div>
        <span className="pill bg-brand-gold/15 text-brand-gold ring-1 ring-brand-gold/30">
          {plan.label} · {plan.priceEur}€/M
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-displacement/40 bg-displacement/10 px-4 py-2.5 text-sm text-displacement">
          {error}
        </p>
      )}
      {sp?.saved === "1" && !error && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">
          Gespeichert.
        </p>
      )}
      {overLimit && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          ⚠ {activeKw} aktive Keywords, Paket erlaubt {plan.maxKeywords}. Beim täglichen Lauf werden
          nur die ersten {plan.maxKeywords} verarbeitet — bitte Keywords deaktivieren oder Paket
          upgraden.
        </p>
      )}

      {/* ── Stammdaten ── */}
      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Stammdaten &amp; Paket</h3>
        <form action={updateTenant} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="id" value={entity.id} />
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Name *</span>
            <input name="name" required defaultValue={entity.name} className={inputCls} />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Firma</span>
            <input name="company" defaultValue={entity.company ?? ""} className={inputCls} />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Paket</span>
            <select name="plan" defaultValue={entity.plan} className={inputCls}>
              {PLAN_IDS.map((pid) => (
                <option key={pid} value={pid}>
                  {PLANS[pid].label} · {PLANS[pid].priceEur}€/M · {PLANS[pid].maxKeywords} KW
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Status</span>
            <select name="status" defaultValue={entity.status} className={inputCls}>
              {TENANT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 space-y-1.5 text-sm text-slate-300">
            <span>Report-E-Mails (kommasepariert — Empfänger der Kunden-Reports)</span>
            <input
              name="reportEmails"
              defaultValue={(entity.reportEmails ?? []).join(", ")}
              className={inputCls}
            />
          </label>
          <label className="col-span-2 space-y-1.5 text-sm text-slate-300">
            <span>Interne Notizen</span>
            <input name="notes" defaultValue={entity.notes ?? ""} className={inputCls} />
          </label>
          <div className="col-span-2">
            <button type="submit" className={btnGold}>
              Speichern
            </button>
            <span className="ml-3 text-[12px] text-slate-500">
              Status „Pausiert"/„Gekündigt" stoppt Tracking &amp; Reports sofort.
            </span>
          </div>
        </form>
      </section>

      {/* ── Zugang ── */}
      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">Kunden-Zugang</h3>
        <PasswordSection entityId={entity.id} hasPassword={!!entity.passwordHash} />
        <p className="text-[12px] text-slate-500">
          Dashboard: {process.env.NEXT_PUBLIC_BASE_URL ?? "https://tracker.pragma-code.de"} — das
          Passwort bestimmt den sichtbaren Bereich.
        </p>
      </section>

      {/* ── Keywords ── */}
      <section className="card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">
            Keywords{" "}
            <span className={overLimit ? "text-displacement" : "text-slate-400"}>
              ({activeKw}/{plan.maxKeywords} aktiv)
            </span>
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2">Suchanfrage</th>
              <th className="px-3 py-2">Cluster</th>
              <th className="px-3 py-2">Aktiv</th>
              <th className="px-3 py-2 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {kws.map((k) => (
              <tr key={k.id} className={`border-b border-white/5 ${k.active === 0 ? "opacity-50" : ""}`}>
                <td className="px-3 py-2 text-white">{k.query}</td>
                <td className="px-3 py-2 text-slate-400">{k.cluster}</td>
                <td className="px-3 py-2">{k.active === 1 ? "✓" : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <form action={toggleKeyword} className="inline">
                    <input type="hidden" name="id" value={k.id} />
                    <input type="hidden" name="entityId" value={entity.id} />
                    <button type="submit" className={btnGhost}>
                      {k.active === 1 ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </form>
                  <form action={deleteKeyword} className="inline">
                    <input type="hidden" name="id" value={k.id} />
                    <input type="hidden" name="entityId" value={entity.id} />
                    <button type="submit" className={`${btnGhost} text-displacement/80 hover:text-displacement`}>
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[12px] text-slate-500">
          „Löschen" entfernt auch die gesamte Ranking-Historie des Keywords — für Downgrades besser
          „Deaktivieren".
        </p>
        <form action={addKeyword} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="entityId" value={entity.id} />
          <label className="min-w-64 flex-1 space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">Neue Suchanfrage</span>
            <input name="query" required placeholder="max mustermann berater" className={inputCls} />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">Cluster</span>
            <select name="cluster" defaultValue="name" className={inputCls}>
              <option value="name">name</option>
              <option value="name_topic">name_topic</option>
              <option value="topic">topic</option>
            </select>
          </label>
          <button type="submit" className={btnGold}>
            + Keyword
          </button>
        </form>
      </section>

      {/* ── Ziel-URLs ── */}
      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">
          Ziel-URLs <span className="text-slate-400">({targets.length})</span>
        </h3>
        <p className="text-[12px] text-slate-500">
          Klassifizieren die SERP-Treffer: <span className="text-emerald-400">owned</span> = eigene
          Profile/Seiten, <span className="text-brand-gold">authority</span> = gewünschte
          Fremd-Publikationen, <span className="text-displacement">displacement</span> = Verdränger.
          Glob-Muster mit <code>*</code>, Subdomains brauchen führendes <code>*</code>.
        </p>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {targets.map((t) => (
                <tr key={t.id} className="border-b border-white/5">
                  <td className="px-3 py-1.5">
                    <span
                      className={
                        t.category === "owned"
                          ? "text-emerald-400"
                          : t.category === "authority"
                            ? "text-brand-gold"
                            : "text-displacement"
                      }
                    >
                      {t.category}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-white">{t.label}</td>
                  <td className="px-3 py-1.5 font-mono text-[12px] text-slate-400">{t.pattern}</td>
                  <td className="px-3 py-1.5 text-right">
                    <form action={deleteTarget} className="inline">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="entityId" value={entity.id} />
                      <button type="submit" className={`${btnGhost} text-displacement/80 hover:text-displacement`}>
                        Löschen
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={addTarget} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="entityId" value={entity.id} />
          <label className="min-w-56 flex-1 space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">Muster</span>
            <input name="pattern" required placeholder="*linkedin.com/in/max-mustermann*" className={inputCls} />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">Label</span>
            <input name="label" required placeholder="LinkedIn-Profil" className={inputCls} />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">Kategorie</span>
            <select name="category" defaultValue="owned" className={inputCls}>
              <option value="owned">owned</option>
              <option value="authority">authority</option>
              <option value="displacement">displacement</option>
            </select>
          </label>
          <button type="submit" className={btnGold}>
            + Ziel-URL
          </button>
        </form>
      </section>

      {/* ── Citation-Prompts ── */}
      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">
          AI-Citation-Prompts <span className="text-slate-400">({prompts.filter((p) => p.active === 1).length} aktiv)</span>
        </h3>
        <p className="text-[12px] text-slate-500">
          Jeder aktive Prompt läuft täglich gegen alle konfigurierten KI-Engines (Gemini, Tavily,
          Brave, Bedrock) — mehr Prompts = mehr API-Kosten.
        </p>
        <table className="w-full text-sm">
          <tbody>
            {prompts.map((p) => (
              <tr key={p.id} className={`border-b border-white/5 ${p.active === 0 ? "opacity-50" : ""}`}>
                <td className="px-3 py-2 text-white">{p.query}</td>
                <td className="px-3 py-2 text-slate-400">{p.topic}</td>
                <td className="px-3 py-2">{p.active === 1 ? "✓" : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <form action={togglePrompt} className="inline">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="entityId" value={entity.id} />
                    <button type="submit" className={btnGhost}>
                      {p.active === 1 ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </form>
                  <form action={deletePrompt} className="inline">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="entityId" value={entity.id} />
                    <button type="submit" className={`${btnGhost} text-displacement/80 hover:text-displacement`}>
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addPrompt} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="entityId" value={entity.id} />
          <label className="min-w-64 flex-1 space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">Prompt (Frage an die KI)</span>
            <input name="query" required placeholder="Wer ist Max Mustermann?" className={inputCls} />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">Thema</span>
            <input name="topic" placeholder="person" className={inputCls} />
          </label>
          <button type="submit" className={btnGold}>
            + Prompt
          </button>
        </form>
      </section>

      {/* ── Wunschlinks ── */}
      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">
          Wunschlinks <span className="text-slate-400">({wanted.length})</span>
        </h3>
        <p className="text-[12px] text-slate-500">
          Publikationen, die auf Seite 1 der Namens-Suchen ranken sollen (Wunschlink-Abdeckung).
          Feature der Pakete Radar&nbsp;+&nbsp;Insights und Visibility Suite
          {plan.wantedLinkCoverage ? "" : " — im aktuellen Paket nicht sichtbar"}.
        </p>
        <table className="w-full text-sm">
          <tbody>
            {wanted.map((w) => (
              <tr key={w.id} className="border-b border-white/5">
                <td className="px-3 py-2 text-white">{w.label}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-slate-400">{w.pattern}</td>
                <td className="px-3 py-2 text-right">
                  <form action={deleteWantedLink} className="inline">
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="entityId" value={entity.id} />
                    <button type="submit" className={`${btnGhost} text-displacement/80 hover:text-displacement`}>
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addWantedLink} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="entityId" value={entity.id} />
          <label className="space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">Label</span>
            <input name="label" required placeholder="Handelsblatt-Porträt" className={inputCls} />
          </label>
          <label className="min-w-56 flex-1 space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">URL-Muster</span>
            <input name="pattern" required placeholder="*handelsblatt.com/*mustermann*" className={inputCls} />
          </label>
          <button type="submit" className={btnGold}>
            + Wunschlink
          </button>
        </form>
      </section>

      {/* ── GEO-Empfehlungen ── */}
      <section className="card space-y-4 p-6">
        <h3 className="text-base font-bold text-white">GEO-Empfehlungen (monatliche Auswertung)</h3>
        <p className="text-[12px] text-slate-500">
          Wird dem Kunden im Dashboard angezeigt (nur Insights/Suite). Einfacher Text, Zeilen mit
          „- " werden als Liste gerendert.
        </p>
        <form action={saveGeoNotes} className="space-y-3">
          <input type="hidden" name="id" value={entity.id} />
          <textarea
            name="geoNotes"
            rows={6}
            defaultValue={entity.geoNotes ?? ""}
            placeholder={"Stand Juli 2026:\n- Schema.org-Person-Markup auf der Startseite ergänzen\n- LinkedIn-Posts wöchentlich …"}
            className={`${inputCls} font-mono text-[13px]`}
          />
          <button type="submit" className={btnGold}>
            Empfehlungen speichern
          </button>
        </form>
      </section>

      {/* ── Gefahrenzone ── */}
      <section className="card space-y-4 border-displacement/30 p-6">
        <h3 className="text-base font-bold text-displacement">Kunden löschen</h3>
        <p className="text-[12px] text-slate-500">
          Entfernt den Kunden inkl. aller Keywords, Rankings, Citations und Alerts unwiderruflich.
          Zur Bestätigung den Slug <code className="text-white">{entity.slug}</code> eintippen.
        </p>
        <form action={deleteTenant} className="flex items-end gap-3">
          <input type="hidden" name="id" value={entity.id} />
          <input name="confirmSlug" required placeholder={entity.slug} className={`${inputCls} max-w-60`} />
          <button
            type="submit"
            className="rounded-lg border border-displacement/50 px-4 py-2 text-sm font-semibold text-displacement transition hover:bg-displacement/10"
          >
            Unwiderruflich löschen
          </button>
        </form>
      </section>
    </div>
  );
}
