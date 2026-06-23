import { execSync } from "child_process";
import { createSign } from "crypto";

export type GroundingChunk = { web?: { uri: string; title?: string } };

export type GeminiGroundedResponse = {
  text: string;
  citations: { uri: string; resolvedUrl: string; title?: string }[];
  raw: unknown;
};

async function resolveRedirect(url: string): Promise<string> {
  if (!url.includes("vertexaisearch.cloud.google.com")) return url;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.url || url;
  } catch {
    return url;
  }
}

/* ---------- Service Account JWT → Access Token ---------- */

interface ServiceAccountKey {
  project_id?: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

async function getAccessTokenFromSA(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: key.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signInput);
  const signature = signer.sign(key.private_key, "base64url");
  const jwt = `${signInput}.${signature}`;

  const res = await fetch(key.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`SA token exchange failed ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/* ---------- Cached token ---------- */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Obtain a fresh access-token for Vertex AI.
 * Priority:
 *  1. VERTEX_ACCESS_TOKEN env var (explicit override)
 *  2. GOOGLE_SA_KEY env var (JSON service account key – used on Vercel)
 *  3. gcloud auth print-access-token (local dev)
 */
async function getAccessToken(): Promise<string> {
  if (process.env.VERTEX_ACCESS_TOKEN) return process.env.VERTEX_ACCESS_TOKEN;

  // Service Account Key (for Vercel / CI)
  if (process.env.GOOGLE_SA_KEY) {
    if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
    const key: ServiceAccountKey = JSON.parse(process.env.GOOGLE_SA_KEY);
    const token = await getAccessTokenFromSA(key);
    cachedToken = { token, expiresAt: Date.now() + 50 * 60 * 1000 }; // 50 min
    return token;
  }

  // Local dev fallback
  try {
    return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
  } catch {
    throw new Error(
      "Cannot obtain Vertex AI access token. Set GOOGLE_SA_KEY or install gcloud CLI.",
    );
  }
}

const DEFAULT_PROJECT = "gen-lang-client-0257507719";
const DEFAULT_REGION = "us-central1";

function getGCPProject(): string {
  if (process.env.VERTEX_PROJECT) return process.env.VERTEX_PROJECT;
  if (process.env.GOOGLE_SA_KEY) {
    try {
      const key = JSON.parse(process.env.GOOGLE_SA_KEY) as ServiceAccountKey;
      if (key.project_id) return key.project_id;
    } catch {}
  }
  try {
    const proj = execSync("gcloud config get-value project 2>/dev/null", { encoding: "utf8" }).trim();
    if (proj && proj !== "(unset)") return proj;
  } catch {}
  return DEFAULT_PROJECT;
}

export async function askGroundedGemini(
  query: string,
  opts: { model?: string; systemPrompt?: string } = {},
): Promise<GeminiGroundedResponse> {
  const project = getGCPProject();
  const region = process.env.VERTEX_REGION ?? DEFAULT_REGION;
  const model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const accessToken = await getAccessToken();

  const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google/models/${model}:generateContent`;

  const defaultSystemPrompt =
    "Du bist ein hilfreicher Recherche-Assistent. Beantworte alle Fragen zu öffentlich bekannten " +
    "Berufspersonen, Experten, Beratern und Autoren anhand öffentlich verfügbarer Informationen " +
    "(Webseiten, LinkedIn, Veröffentlichungen). Gib immer eine ausführliche Antwort mit Quellenangaben.";

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: query }] }],
    tools: [{ googleSearch: {} }],
    systemInstruction: { parts: [{ text: opts.systemPrompt ?? defaultSystemPrompt }] },
  };

  let lastErr: Error | null = null;
  let json: any = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) {
      json = await res.json();
      lastErr = null;
      break;
    }
    const text = await res.text().catch(() => "");
    lastErr = new Error(`Gemini/Vertex ${res.status}: ${text.slice(0, 400)}`);
    // Retry on 429 / 5xx; bail on 4xx auth errors
    if (![429, 500, 502, 503, 504].includes(res.status)) throw lastErr;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
  }
  if (lastErr || !json) throw lastErr ?? new Error("Gemini/Vertex: no response");

  const candidate = json.candidates?.[0];
  const text: string =
    candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("\n") ?? "";
  const chunks: GroundingChunk[] = candidate?.groundingMetadata?.groundingChunks ?? [];
  const webChunks = chunks
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => !!w?.uri);
  const citations = await Promise.all(
    webChunks.map(async (w) => ({
      uri: w.uri,
      resolvedUrl: await resolveRedirect(w.uri),
      title: w.title,
    })),
  );

  return { text, citations, raw: json };
}
