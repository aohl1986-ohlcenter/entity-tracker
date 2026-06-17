import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifyToken } from "./auth";

/** Liest + verifiziert das Session-Cookie (für Server Components). Kein Redirect. */
export async function getSessionSlugSafe(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return verifyToken(token);
}

/** Wie oben, aber leitet zu /login um, wenn keine gültige Session. */
export async function getSessionSlug(): Promise<string> {
  const slug = await getSessionSlugSafe();
  if (!slug) redirect("/login");
  return slug;
}
