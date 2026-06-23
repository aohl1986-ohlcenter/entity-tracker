import { fetchSerp, type SerperOrganicResult } from "./serper";

export type BedrockGroundedResponse = {
  text: string;
  citations: { uri: string; resolvedUrl: string; title?: string }[];
  raw: unknown;
};

export async function askGroundedBedrock(
  query: string,
  opts: { model?: string; region?: string } = {},
): Promise<BedrockGroundedResponse> {
  const apiKey = process.env.BEDROCK_API_KEY;
  if (!apiKey) throw new Error("BEDROCK_API_KEY is not set");

  const model = opts.model ?? process.env.BEDROCK_MODEL ?? "amazon.nova-lite-v1:0";
  const region = opts.region ?? process.env.BEDROCK_REGION ?? "us-east-1";

  const cleanQuery = query.trim();

  // 1) Fetch search results
  let serpResultsText = "";
  let results: SerperOrganicResult[] = [];
  try {
    const serp = await fetchSerp({ query: cleanQuery, num: 10 });
    results = serp.organic ?? [];
    serpResultsText = results
      .map((r, idx) => `[Result ${idx + 1}]\nTitle: ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}\n`)
      .join("\n");
  } catch (err) {
    console.error("Bedrock Search Grounding failed to fetch SERP:", err);
  }

  // 2) Formulate prompt
  const systemPrompt = `Du bist ein präziser Recherche-Assistent. Dir werden Suchergebnisse für die folgende Anfrage bereitgestellt:
Anfrage: "${query}"

Suchergebnisse:
${serpResultsText || "Keine Websuch-Ergebnisse verfügbar."}

Bitte beantworte die Anfrage präzise basierend auf diesen Suchergebnissen. 
WICHTIG: Du MUSST am Ende deiner Antwort alle in deiner Antwort verwendeten Quellen/Links als Liste auflisten (in eckigen Klammern [1], [2], etc. und mit der exakten URL). 
Beispiel-Format am Ende:
Quellen:
[1] https://example.com/seite1
[2] https://example.com/seite2`;

  // 3) Call Bedrock Converse API
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${model}/converse`;

  let lastErr: Error | null = null;
  let json: any = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [{ text: systemPrompt }],
          },
        ],
      }),
      cache: "no-store",
    });

    if (res.ok) {
      json = await res.json();
      lastErr = null;
      break;
    }

    const text = await res.text().catch(() => "");
    lastErr = new Error(`Bedrock ${res.status}: ${text.slice(0, 400)}`);
    // Retry on 429 / 5xx; bail on 4xx auth errors
    if (![429, 500, 502, 503, 504].includes(res.status)) throw lastErr;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
  }

  if (lastErr || !json) throw lastErr ?? new Error("Bedrock: no response");

  const textContent: string = json.output?.message?.content?.[0]?.text ?? "";

  // 4) Extract URLs from the response text
  const urlRegex = /https?:\/\/[^\s)\],]+/g;
  const urlsFound = textContent.match(urlRegex) ?? [];
  const uniqueUrls = [...new Set(urlsFound)];

  // Match titles from search results if possible
  const citations = uniqueUrls.map((url) => {
    const matchedResult = results.find((r) => r.link === url);
    return {
      uri: url,
      resolvedUrl: url,
      title: matchedResult?.title ?? undefined,
    };
  });

  return { text: textContent, citations, raw: json };
}
