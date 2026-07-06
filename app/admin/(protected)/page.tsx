import Link from "next/link";
import { db } from "@/lib/db";
import { entities } from "@/lib/schema";
import { sql } from "drizzle-orm";
import { planFor, STATUS_LABELS, type TenantStatus } from "@/lib/plans";

export const dynamic = "force-dynamic";

type TenantRow = {
  id: number;
  slug: string;
  name: string;
  plan: string;
  status: string;
  reportEmails: string[];
  hasPassword: boolean;
  activeKeywords: number;
  lastSnapshot: string | null;
};

async function loadTenants(): Promise<TenantRow[]> {
  const rows = await db.execute(sql`
    select e.id, e.slug, e.name, e.plan, e.status, e.report_emails,
           (e.password_hash is not null) as has_password,
           coalesce((select count(*)::int from keywords k
                     where k.entity_id = e.id and k.active = 1), 0) as active_keywords,
           (select max(s.fetched_at) from serp_snapshots s
            join keywords k on k.id = s.keyword_id
            where k.entity_id = e.id) as last_snapshot
    from entities e
    order by e.name
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as number,
    slug: r.slug as string,
    name: r.name as string,
    plan: r.plan as string,
    status: r.status as string,
    reportEmails: (r.report_emails as string[]) ?? [],
    hasPassword: Boolean(r.has_password),
    activeKeywords: r.active_keywords as number,
    lastSnapshot: r.last_snapshot ? String(r.last_snapshot) : null,
  }));
}

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const sp = await searchParams;
  const tenants = await loadTenants();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-400">
          {tenants.length} Kunde{tenants.length !== 1 ? "n" : ""} · Pakete: Radar 149€ ·
          Radar&nbsp;+&nbsp;Insights 299€ · Visibility Suite 590€
        </p>
        <Link
          href="/admin/tenants/new"
          className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy transition hover:opacity-90"
        >
          + Kunde anlegen
        </Link>
      </div>

      {sp?.deleted === "1" && (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-300">
          Kunde gelöscht.
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Paket</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Keywords</th>
              <th className="px-4 py-3">Report-Mails</th>
              <th className="px-4 py-3">Login</th>
              <th className="px-4 py-3">Letzter Snapshot</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const plan = planFor(t.plan);
              const overLimit = t.activeKeywords > plan.maxKeywords;
              return (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/tenants/${t.id}`} className="font-semibold text-white hover:text-brand-gold">
                      {t.name}
                    </Link>
                    <div className="text-[11px] text-slate-500">{t.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="pill bg-brand-gold/15 text-brand-gold ring-1 ring-brand-gold/30">
                      {plan.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        t.status === "active"
                          ? "text-emerald-400"
                          : t.status === "paused"
                            ? "text-amber-400"
                            : "text-slate-500"
                      }
                    >
                      {STATUS_LABELS[t.status as TenantStatus] ?? t.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 ${overLimit ? "font-semibold text-displacement" : "text-slate-300"}`}>
                    {t.activeKeywords} / {plan.maxKeywords}
                    {overLimit && " ⚠"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {t.reportEmails.length > 0 ? t.reportEmails.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">{t.hasPassword ? "✓" : "—"}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {t.lastSnapshot ? new Date(t.lastSnapshot).toLocaleString("de-DE") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
