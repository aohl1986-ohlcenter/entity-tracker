import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, ADMIN_COOKIE_NAME, verifyToken, verifyAdminToken } from "@/lib/auth";

export const config = {
  matcher: [
    "/((?!api/|_next|favicon\\.ico|apple-touch-icon\\.png|brand|robots\\.txt|sitemap\\.xml).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Kein AUTH_SECRET → offener Dev-Modus (lokal ohne Env).
  if (!process.env.AUTH_SECRET) return NextResponse.next();

  // ── Admin-Bereich: eigenes Cookie, eigener Login ──
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname.startsWith("/admin")) {
    const ok = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE_NAME)?.value);
    if (ok) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── Kunden-Bereich ──
  if (pathname === "/login" || pathname === "/logout") {
    return NextResponse.next();
  }

  const slug = await verifyToken(req.cookies.get(COOKIE_NAME)?.value);
  if (slug) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
