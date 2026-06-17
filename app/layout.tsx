import "./globals.css";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { entities } from "@/lib/schema";
import { getSessionSlugSafe } from "@/lib/session";

export const metadata: Metadata = {
  title: "Entity Authority Tracker · Pragma-Code",
  description:
    "SERP-Domination & AI-Citation-Tracking für Personal-Branding-SEO. Powered by Pragma-Code.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const slug = await getSessionSlugSafe();
  let entityName: string | null = null;
  if (slug) {
    const all = await db.select({ slug: entities.slug, name: entities.name }).from(entities);
    entityName = all.find((e) => e.slug === slug)?.name ?? slug;
  }

  return (
    <html lang="de">
      <body>
        <header className="border-b border-white/10 bg-brand-navy/85 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-4 group">
              <Image
                src="/brand/pragma-code-logo-dark.webp"
                alt="Pragma-Code"
                width={150}
                height={56}
                className="h-10 w-auto"
                priority
              />
              <span className="hidden md:flex h-7 w-px bg-white/15" aria-hidden />
              <div className="hidden md:block leading-tight">
                <div className="text-[14px] font-semibold tracking-tight text-white">
                  Entity Authority Tracker
                </div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-brand-gold/90">
                  Personal-Branding SEO
                </div>
              </div>
            </Link>
            {slug && (
              <nav className="flex items-center gap-1 text-sm">
                <NavLink href="/">Overview</NavLink>
                <NavLink href="/citations">AI Citations</NavLink>
                <NavLink href="/alerts">Alerts</NavLink>
                <EntitySwitcher name={entityName ?? slug} />
              </nav>
            )}
          </div>
        </header>
        {slug && <CoProjectBanner entityName={entityName ?? slug} />}
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="mx-auto mt-16 max-w-6xl border-t border-white/5 px-6 py-8 text-[12px] text-slate-400 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/pragma-code-icon-circle.webp"
              alt=""
              width={22}
              height={22}
              className="rounded-full opacity-90"
            />
            <span>© Pragma-Code · Entity Authority Tracker</span>
          </div>
          <span>
            Tracking by{" "}
            <a
              href="https://www.pragma-code.de/"
              target="_blank"
              rel="noreferrer"
              className="text-brand-gold hover:underline"
            >
              pragma-code.de
            </a>
          </span>
        </footer>
      </body>
    </html>
  );
}

function EntitySwitcher({ name }: { name: string }) {
  return (
    <div className="ml-3 flex items-center gap-2">
      <span className="pill bg-brand-gold/15 text-brand-gold ring-1 ring-brand-gold/30">
        {name}
      </span>
      <Link
        href="/login?switch=1"
        className="rounded-md px-2.5 py-1.5 text-[12px] text-slate-300 hover:bg-white/5 hover:text-brand-gold transition"
      >
        Wechseln
      </Link>
      <a
        href="/logout"
        className="rounded-md px-2.5 py-1.5 text-[12px] text-slate-400 hover:bg-white/5 hover:text-white transition"
      >
        Abmelden
      </a>
    </div>
  );
}

function CoProjectBanner({ entityName }: { entityName: string }) {
  return (
    <div className="border-b border-white/5 bg-brand-navy-2/40">
      <div className="mx-auto max-w-6xl px-6 py-2.5 flex items-center gap-3 text-[12px] text-slate-300">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(255,200,41,0.7)]"
        />
        <span className="font-semibold uppercase tracking-[0.18em] text-brand-gold text-[10px]">
          Co-Projekt
        </span>
        <span className="text-slate-400">·</span>
        <span>
          Pragma-Code <span className="text-slate-500">×</span> {entityName} · Live-Cockpit für die
          90-Tage-Authority-Roadmap
        </span>
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-white/5 hover:text-brand-gold transition"
    >
      {children}
    </Link>
  );
}
