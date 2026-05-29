import "./globals.css";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Entity Authority Tracker · Pragma-Code",
  description:
    "SERP-Domination & AI-Citation-Tracking für Personal-Branding-SEO. Powered by Pragma-Code.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <header className="border-b border-white/10 bg-brand-navy/80 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/brand/pragma-code-icon-circle.webp"
                alt="Pragma-Code"
                width={36}
                height={36}
                className="rounded-full ring-1 ring-white/10"
                priority
              />
              <div className="leading-tight">
                <div className="text-[15px] font-semibold tracking-tight text-white">
                  Entity Authority Tracker
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-brand-emerald/90">
                  Pragma-Code
                </div>
              </div>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/">Overview</NavLink>
              <NavLink href="/citations">AI Citations</NavLink>
              <a
                href="https://www.pragma-code.de/"
                target="_blank"
                rel="noreferrer"
                className="ml-3 hidden sm:inline-flex items-center gap-1 rounded-md border border-brand-emerald/30 bg-brand-emerald/10 px-3 py-1.5 text-[12px] font-medium text-brand-emerald hover:bg-brand-emerald/15"
              >
                pragma-code.de ↗
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-10 text-[12px] text-slate-400 flex items-center justify-between border-t border-white/5 mt-12">
          <div className="flex items-center gap-2">
            <Image
              src="/brand/pragma-code-icon-circle.webp"
              alt=""
              width={18}
              height={18}
              className="rounded-full opacity-80"
            />
            <span>© Pragma-Code · Entity Authority Tracker</span>
          </div>
          <span>
            Tracking by{" "}
            <a
              href="https://www.pragma-code.de/"
              target="_blank"
              rel="noreferrer"
              className="text-brand-emerald hover:underline"
            >
              pragma-code.de
            </a>
          </span>
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-white/5 hover:text-white"
    >
      {children}
    </Link>
  );
}
