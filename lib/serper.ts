export type SerperOrganicResult = {
  position: number;
  title?: string;
  link: string;
  snippet?: string;
  sitelinks?: { title: string; link: string }[];
};

export type SerperResponse = {
  organic?: SerperOrganicResult[];
  knowledgeGraph?: unknown;
  peopleAlsoAsk?: unknown[];
  relatedSearches?: unknown[];
  searchParameters?: Record<string, unknown>;
};

export type SerperOptions = {
  query: string;
  gl?: string;
  hl?: string;
  location?: string;
  num?: number;
};

const ENDPOINT = "https://google.serper.dev/search";

export async function fetchSerp(opts: SerperOptions): Promise<SerperResponse> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("SERPER_API_KEY is not set");

  const body = {
    q: opts.query,
    gl: opts.gl ?? "de",
    hl: opts.hl ?? "de",
    location: opts.location ?? "Germany",
    num: opts.num ?? 10,
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Serper ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}
