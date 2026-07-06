import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifyToken } from "./auth";
import { db } from "./db";
import { entities } from "./schema";
import { eq } from "drizzle-orm";

/**
 * Liest + verifiziert das Session-Cookie (für Server Components). Kein Redirect.
 * Prüft zusätzlich gegen die DB: Entity muss existieren und darf nicht
 * gekündigt sein (Middleware macht nur die Edge-HMAC-Prüfung).
 */
export async function getSessionSlugSafe(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const slug = await verifyToken(token);
  if (!slug) return null;
  const entity = (
    await db
      .select({ status: entities.status })
      .from(entities)
      .where(eq(entities.slug, slug))
      .limit(1)
  )[0];
  if (!entity || entity.status === "cancelled") return null;
  return slug;
}

/** Wie oben, aber leitet zu /login um, wenn keine gültige Session. */
export async function getSessionSlug(): Promise<string> {
  const slug = await getSessionSlugSafe();
  if (!slug) redirect("/login");
  return slug;
}
