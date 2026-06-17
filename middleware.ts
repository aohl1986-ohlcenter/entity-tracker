import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";

export const config = {
  matcher: [
    "/((?!api/|_next|favicon\\.ico|apple-touch-icon\\.png|brand|robots\\.txt|sitemap\\.xml).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Öffentliche Auth-Routen
  if (pathname === "/login" || pathname === "/logout") {
    return NextResponse.next();
  }

  // Keine Auth konfiguriert → offener Dev-Modus
  if (!process.env.AUTH_ENTITIES) return NextResponse.next();

  const slug = await verifyToken(req.cookies.get(COOKIE_NAME)?.value);
  if (slug) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
