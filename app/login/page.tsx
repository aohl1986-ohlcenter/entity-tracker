import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_NAME, resolvePassword, signSlug } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const slug = resolvePassword(password);
  if (!slug) redirect("/login?error=1");

  const token = await signSlug(slug);
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; switch?: string }>;
}) {
  const sp = await searchParams;
  const isError = sp?.error === "1";
  const isSwitch = sp?.switch === "1";

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <form action={login} className="card p-8 w-full max-w-sm space-y-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-brand-gold">
            Entity Authority Tracker
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">
            {isSwitch ? "Bereich wechseln" : "Anmelden"}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Das Passwort bestimmt, welcher Tracker-Bereich angezeigt wird.
          </p>
        </div>
        <input
          type="password"
          name="password"
          autoFocus
          required
          placeholder="Passwort"
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-brand-gold/50 focus:outline-none"
        />
        {isError && <p className="text-sm text-displacement">Falsches Passwort.</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-brand-gold px-4 py-2.5 font-semibold text-brand-navy transition hover:opacity-90"
        >
          {isSwitch ? "Wechseln" : "Einloggen"}
        </button>
      </form>
    </div>
  );
}
