/**
 * Gemini AI Studio API — Grounded Search
 *
 * Uses the free-tier generativelanguage.googleapis.com endpoint with a simple
 * API key (no GCP billing required). Google Search grounding is included.
 *
 * Migrated from Vertex AI (aiplatform.googleapis.com) on 2026-08-01 to avoid
 * the billing requirement on project gen-lang-client-0257507719.
 *
 * Env vars:
 *   GEMINI_API_KEY  — API key from https://aistudio.google.com/apikey
 *   GEMINI_MODEL    — model name (default: gemini-3.5-flash-lite)
 */

import { zahlOderNull, type Messung } from "./engine-messung";

export type GroundingChunk = { web?: { uri: string; title?: string } };

export type GeminiGroundedResponse = {
  text: string;
  citations: { uri: string; resolvedUrl: string; title?: string }[];
  raw: unknown;
  /** Additiv für das Kosten-Tracing (lib/tracing.ts) — bestehende Aufrufer sind nicht betroffen. */
  messung: Messung;
};

async function resolveRedirect(url: string): Promise<string> {
  // Grounding citations may come as Google redirect URLs
  if (
    !url.includes("vertexaisearch.cloud.google.com") &&
    !url.includes("google.com/url")
  )
    return url;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.url || url;
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

// gemini-2.5-flash ist das jüngste Modell, das Google-Search-Grounding im
// Free Tier verlässlich bedient. Die 3.x-flash-lite-Reihe lief in den Tests
// (04.08.2026) durchgängig in 429 — ohne Grounding sind die Antworten für
// einen Citation-Tracker wertlos.
const DEFAULT_MODEL = "gemini-2.5-flash";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export async function askGroundedGemini(
  query: string,
  opts: { model?: string; systemPrompt?: string } = {},
): Promise<GeminiGroundedResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey",
    );
  }

  const model = opts.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const endpoint = `${BASE_URL}/models/${model}:generateContent`;
  const beginn = Date.now();

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

  // Try first with Google Search grounding enabled
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
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
    lastErr = new Error(`Gemini ${res.status}: ${text.slice(0, 400)}`);
    // KEIN Fallback auf einen ungegroundeten Call: eine Antwort ohne
    // Google-Search-Grounding enthält keine Citations und ist frei
    // halluziniert. Für den Citation-Tracker würde sie als "0 Citations"
    // persistiert und die AI-Visibility fälschlich nach unten ziehen —
    // ein sauberer Fehler (→ Ops-Alarm) ist hier das ehrlichere Ergebnis.
    if (![429, 500, 502, 503, 504].includes(res.status)) {
      throw lastErr;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
  }

  if (lastErr || !json) throw lastErr ?? new Error("Gemini: no response");

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

  // usageMetadata liefert die Token-Zahlen; thoughtsTokenCount (Denk-Tokens)
  // wird von Google zum Output gerechnet und deshalb hier addiert.
  const usage = json.usageMetadata ?? {};
  const tokensOut =
    (zahlOderNull(usage.candidatesTokenCount) ?? 0) +
    (zahlOderNull(usage.thoughtsTokenCount) ?? 0);

  return {
    text,
    citations,
    raw: json,
    messung: {
      modell: model,
      verbrauch: {
        tokensIn: zahlOderNull(usage.promptTokenCount),
        tokensOut: zahlOderNull(usage.candidatesTokenCount) === null ? null : tokensOut,
        quelle: "api",
      },
      dauerMs: Date.now() - beginn,
    },
  };
}
