import { redirect } from "next/navigation";
import { checkAdminPassword, setAdminCookie } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

async function adminLogin(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!checkAdminPassword(password)) redirect("/admin/login?error=1");
  await setAdminCookie();
  redirect("/admin");
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <form action={adminLogin} className="card p-8 w-full max-w-sm space-y-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-brand-gold">
            Operator-Bereich
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">Admin-Login</h1>
          <p className="mt-2 text-sm text-slate-400">
            Kundenverwaltung, Pakete &amp; API-Auslastung.
          </p>
        </div>
        <input
          type="password"
          name="password"
          autoFocus
          required
          placeholder="Admin-Passwort"
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-brand-gold/50 focus:outline-none"
        />
        {sp?.error === "1" && <p className="text-sm text-displacement">Falsches Passwort.</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-brand-gold px-4 py-2.5 font-semibold text-brand-navy transition hover:opacity-90"
        >
          Einloggen
        </button>
      </form>
    </div>
  );
}
