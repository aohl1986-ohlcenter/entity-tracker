// Admin-Session für den Operator-Bereich /admin. Node-Runtime (Server
// Components + Server Actions). Middleware prüft das Cookie zusätzlich
// Edge-seitig — das hier ist Defense-in-Depth.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, timingSafeEqual } from "node:crypto";
import { ADMIN_COOKIE_NAME, verifyAdminToken, signAdmin } from "./auth";

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminToken(token);
}

/** Für Layouts/Actions: wirft per Redirect raus, wenn kein Admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Constant-time-Vergleich gegen ADMIN_PASSWORD (sha256 gegen Längen-Leak). */
export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(password).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Setzt das Admin-Cookie (nach erfolgreichem Login). */
export async function setAdminCookie(): Promise<void> {
  const token = await signAdmin();
  (await cookies()).set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 Tage — kürzer als Kunden-Session
  });
}

export async function clearAdminCookie(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE_NAME);
}
