import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/((?!api/|_next|favicon\\.ico|apple-touch-icon\\.png|brand|robots\\.txt|sitemap\\.xml).*)",
  ],
};

export function middleware(req: NextRequest) {
  const user = process.env.SITE_USERNAME;
  const pass = process.env.SITE_PASSWORD;

  // No credentials configured → site is open (dev / local).
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = atob(encoded);
        const sep = decoded.indexOf(":");
        const u = decoded.slice(0, sep);
        const p = decoded.slice(sep + 1);
        if (u === user && p === pass) return NextResponse.next();
      } catch {
        /* fall through to 401 */
      }
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Pragma-Code Tracker", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
