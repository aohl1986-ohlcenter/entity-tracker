export type BraveWebResult = {
  url: string;
  title?: string;
  description?: string;
};

export type BraveGroundedResponse = {
  text: string;
  citations: { uri: string; resolvedUrl: string; title?: string }[];
  raw: unknown;
};

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export async function askGroundedBrave(
  query: string,
  opts: { count?: number; country?: string; searchLang?: string } = {},
): Promise<BraveGroundedResponse> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) throw new Error("BRAVE_API_KEY is not set");

  const params = new URLSearchParams({
    q: query,
    count: String(opts.count ?? 10),
    country: opts.country ?? "DE",
    search_lang: opts.searchLang ?? "de",
    safesearch: "moderate",
  });

  let lastErr: Error | null = null;
  let json: any = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      cache: "no-store",
    });
    if (res.ok) {
      json = await res.json();
      lastErr = null;
      break;
    }
    const text = await res.text().catch(() => "");
    lastErr = new Error(`Brave ${res.status}: ${text.slice(0, 400)}`);
    if (![429, 500, 502, 503, 504].includes(res.status)) throw lastErr;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
  }
  if (lastErr || !json) throw lastErr ?? new Error("Brave: no response");

  const results: BraveWebResult[] = json?.web?.results ?? [];
  const citations = results
    .filter((r) => typeof r.url === "string" && r.url.length > 0)
    .map((r) => ({ uri: r.url, resolvedUrl: r.url, title: r.title }));

  const text: string =
    typeof json?.summarizer?.summary === "string"
      ? json.summarizer.summary
      : "";

  return { text, citations, raw: json };
}
