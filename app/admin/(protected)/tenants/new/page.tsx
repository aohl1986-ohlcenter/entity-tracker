import Link from "next/link";
import { createTenant } from "@/app/admin/actions";
import { PLANS, PLAN_IDS, TENANT_STATUSES, STATUS_LABELS } from "@/lib/plans";

export const dynamic = "force-dynamic";

const ERROR_TEXT: Record<string, string> = {
  name: "Bitte einen Namen angeben.",
  slug: "Slug ungültig: nur Kleinbuchstaben, Ziffern, Bindestriche (oder reserviert).",
  "slug-taken": "Dieser Slug ist bereits vergeben.",
  plan: "Ungültiges Paket.",
  status: "Ungültiger Status.",
};

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-white placeholder:text-slate-500 focus:border-brand-gold/50 focus:outline-none";

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const error = sp?.error ? (ERROR_TEXT[sp.error] ?? "Eingabe ungültig.") : null;

  return (
    <div className="max-w-xl space-y-6">
      <Link href="/admin" className="text-sm text-slate-400 hover:text-brand-gold">
        ← Zurück zur Übersicht
      </Link>
      <form action={createTenant} className="card space-y-5 p-6">
        <h2 className="text-lg font-bold text-white">Neuen Kunden anlegen</h2>
        {error && <p className="text-sm text-displacement">{error}</p>}
        <div className="grid grid-cols-2 gap-4">
          <label className="col-span-2 space-y-1.5 text-sm text-slate-300">
            <span>Name (Person/Marke) *</span>
            <input name="name" required placeholder="Max Mustermann" className={inputCls} />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Slug (URL-Kennung) *</span>
            <input
              name="slug"
              required
              pattern="[a-z0-9][a-z0-9-]*"
              placeholder="max-mustermann"
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Firma</span>
            <input name="company" placeholder="optional" className={inputCls} />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Paket</span>
            <select name="plan" defaultValue="radar" className={inputCls}>
              {PLAN_IDS.map((id) => (
                <option key={id} value={id}>
                  {PLANS[id].label} · {PLANS[id].priceEur}€/M · {PLANS[id].maxKeywords} KW
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>Status</span>
            <select name="status" defaultValue="active" className={inputCls}>
              {TENANT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 space-y-1.5 text-sm text-slate-300">
            <span>Report-E-Mails (kommasepariert)</span>
            <input name="reportEmails" placeholder="kunde@firma.de" className={inputCls} />
          </label>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy transition hover:opacity-90"
        >
          Anlegen
        </button>
        <p className="text-[12px] text-slate-500">
          Nach dem Anlegen: Keywords, Ziel-URLs, Prompts und Zugangs-Passwort auf der Detailseite
          pflegen.
        </p>
      </form>
    </div>
  );
}
