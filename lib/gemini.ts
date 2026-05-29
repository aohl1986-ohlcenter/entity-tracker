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

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function askGroundedGemini(
  query: string,
  opts: { model?: string; systemPrompt?: string } = {},
): Promise<GeminiGroundedResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
  };
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  let lastErr: Error | null = null;
  let json: any = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
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
    // Retry on 429 / 5xx; bail on 4xx auth errors
    if (![429, 500, 502, 503, 504].includes(res.status)) throw lastErr;
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

  return { text, citations, raw: json };
}
