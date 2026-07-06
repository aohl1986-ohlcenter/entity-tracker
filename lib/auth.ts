// Edge-safe Auth-Kern: HMAC-signiertes Session-Cookie pro Entity + Admin.
// Bewusst KEINE Node-only-Imports (kein next/headers, kein Buffer, kein
// node:crypto/scrypt — Passwort-Hashing lebt in lib/password.ts) — diese
// Datei wird auch vom Edge-Middleware importiert. Crypto via Web Crypto.

export const COOKIE_NAME = "et_session";
export const ADMIN_COOKIE_NAME = "et_admin";

/** Payload des Admin-Tokens — als Slug reserviert (siehe RESERVED_SLUGS). */
const ADMIN_PAYLOAD = "__admin__";

/** Slugs, die nie als Tenant-Slug vergeben werden dürfen (Routen + intern). */
export const RESERVED_SLUGS = new Set([
  "admin",
  "login",
  "logout",
  "api",
  "alerts",
  "citations",
  "keywords",
  ADMIN_PAYLOAD,
]);

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isValidTenantSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

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

/**
 * Gibt den Slug zurück, wenn die Signatur gültig ist (reine HMAC-Prüfung —
 * Edge-tauglich, kein DB-Zugriff). Ob die Entity existiert und aktiv ist,
 * prüft lib/session.ts getSessionSlug (Node-Runtime, DB verfügbar).
 */
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
  if (slug === ADMIN_PAYLOAD) return null; // Admin-Token gilt nicht als Kunden-Session
  return slug;
}

/** Signiertes Admin-Token (Payload konstant, gleicher AUTH_SECRET). */
export async function signAdmin(): Promise<string> {
  return `${ADMIN_PAYLOAD}.${await sign(ADMIN_PAYLOAD)}`;
}

/** True, wenn das Token ein gültiges Admin-Token ist. Edge-safe. */
export async function verifyAdminToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  if (token.slice(0, dot) !== ADMIN_PAYLOAD) return false;
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = await sign(ADMIN_PAYLOAD);
  } catch {
    return false;
  }
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Legacy: Passwort → Entity-Slug aus AUTH_ENTITIES-Env.
 * @deprecated Passwörter leben seit der SaaS-Migration als scrypt-Hash in der
 * DB (entities.passwordHash). Bleibt eine Release lang als Login-Fallback.
 */
export function resolvePassword(password: string): string | null {
  for (const [slug, pw] of Object.entries(entityPasswordMap())) {
    if (pw === password) return slug;
  }
  return null;
}
