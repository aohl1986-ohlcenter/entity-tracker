import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // Defense-in-Depth zusätzlich zur Middleware

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-brand-gold">
            Operator-Bereich
          </div>
          <h1 className="mt-0.5 text-xl font-bold text-white">Kundenverwaltung</h1>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/admin"
            className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-white/5 hover:text-brand-gold transition"
          >
            Kunden
          </Link>
          <Link
            href="/admin/usage"
            className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-white/5 hover:text-brand-gold transition"
          >
            API-Auslastung
          </Link>
          <a
            href="/admin/logout"
            className="rounded-md px-2.5 py-1.5 text-[12px] text-slate-400 hover:bg-white/5 hover:text-white transition"
          >
            Abmelden
          </a>
        </nav>
      </div>
      {children}
    </div>
  );
}
