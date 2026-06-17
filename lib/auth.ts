// Edge-safe Auth-Kern: HMAC-signiertes Session-Cookie pro Entity.
// Bewusst KEINE Node-only-Imports (kein next/headers, kein Buffer) — diese
// Datei wird auch vom Edge-Middleware importiert. Crypto via Web Crypto.

export const COOKIE_NAME = "et_session";

const encoder = new TextEncoder();

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

/**
 * slug -> password aus Env AUTH_ENTITIES.
 * Format: `slug:passwort,slug:passwort` (quote-frei, robust über alle Env-Loader).
 * JSON wird als Fallback ebenfalls akzeptiert.
 */
function entityPasswordMap(): Record<string, string> {
  const raw = process.env.AUTH_ENTITIES?.trim();
  if (!raw) return {};
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  }
  const map: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const i = pair.indexOf(":");
    if (i <= 0) continue;
    const slug = pair.slice(0, i).trim();
    const pw = pair.slice(i + 1).trim();
    if (slug && pw) map[slug] = pw;
  }
  return map;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(sig));
}

/** Signiertes Token `slug.hmac`. */
export async function signSlug(slug: string): Promise<string> {
  return `${slug}.${await sign(slug)}`;
}

/** Gibt den Slug zurück, wenn Signatur gültig UND Slug eine bekannte Entity ist. */
export async function verifyToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const slug = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = await sign(slug);
  } catch {
    return null;
  }
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  if (!(slug in entityPasswordMap())) return null;
  return slug;
}

/** Passwort → Entity-Slug (oder null). Trennung entsteht daraus, wer welches Passwort kennt. */
export function resolvePassword(password: string): string | null {
  for (const [slug, pw] of Object.entries(entityPasswordMap())) {
    if (pw === password) return slug;
  }
  return null;
}

/** Ob überhaupt eine Auth konfiguriert ist (sonst offener Dev-Modus). */
export function authConfigured(): boolean {
  return Object.keys(entityPasswordMap()).length > 0;
}
