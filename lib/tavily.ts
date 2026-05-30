export type TavilyResult = {
  url: string;
  title?: string;
  content?: string;
  score?: number;
};

export type TavilyGroundedResponse = {
  text: string;
  citations: { uri: string; resolvedUrl: string; title?: string }[];
  raw: unknown;
};

const ENDPOINT = "https://api.tavily.com/search";

export async function askGroundedTavily(
  query: string,
  opts: { searchDepth?: "basic" | "advanced"; maxResults?: number } = {},
): Promise<TavilyGroundedResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set");

  const body = {
    api_key: apiKey,
    query,
    search_depth: opts.searchDepth ?? "basic",
    include_answer: true,
    max_results: opts.maxResults ?? 8,
  };

  let lastErr: Error | null = null;
  let json: any = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) {
      json = await res.json();
      lastErr = null;
      break;
    }
    const text = await res.text().catch(() => "");
    lastErr = new Error(`Tavily ${res.status}: ${text.slice(0, 400)}`);
    if (![429, 500, 502, 503, 504].includes(res.status)) throw lastErr;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
  }
  if (lastErr || !json) throw lastErr ?? new Error("Tavily: no response");

  const results: TavilyResult[] = Array.isArray(json.results) ? json.results : [];
  const citations = results
    .filter((r) => typeof r.url === "string" && r.url.length > 0)
    .map((r) => ({ uri: r.url, resolvedUrl: r.url, title: r.title }));

  const text: string = typeof json.answer === "string" ? json.answer : "";
  return { text, citations, raw: json };
}
