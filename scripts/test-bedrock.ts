import "./_env";
import { fetchSerp } from "../lib/serper";

async function askGroundedBedrock(query: string) {
  const apiKey = process.env.BEDROCK_API_KEY;
  if (!apiKey) throw new Error("BEDROCK_API_KEY is not set");
  const model = process.env.BEDROCK_MODEL ?? "amazon.nova-lite-v1:0";
  const region = process.env.BEDROCK_REGION ?? "us-east-1";

  // Clean query for Google Search: remove trailing meta-questions
  const cleanQuery = query.replace(/(Nenne|Bitte|Quellen|mit|vollständigen|URLs|am|Ende).*$/gi, "").trim();

  // 1) Fetch search results
  console.log(`Fetching search results for: "${cleanQuery}"...`);
  const serp = await fetchSerp({ query: cleanQuery, num: 10 });
  const results = serp.organic ?? [];
  console.log(`Found ${results.length} search results.`);
  const formattedResults = results.map(r => `Title: ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}\n`).join("\n");

  // 2) Formulate prompt
  const prompt = `Du bist ein präziser Recherche-Assistent. Dir werden Suchergebnisse für die folgende Anfrage bereitgestellt:
Anfrage: "${query}"

Suchergebnisse:
${formattedResults}

Bitte beantworte die Anfrage präzise basierend auf diesen Suchergebnissen. 
WICHTIG: Du MUSST am Ende deiner Antwort alle in deiner Antwort verwendeten Quellen/Links als Liste auflisten (in eckigen Klammern [1], [2], etc. und mit der exakten URL). 
Beispiel-Format am Ende:
Quellen:
[1] https://example.com/seite1
[2] https://example.com/seite2`;

  // 3) Call Bedrock Converse API
  console.log(`Calling Bedrock Converse API with model ${model} in region ${region}...`);
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${model}/converse`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: [{ text: prompt }]
        }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bedrock error ${res.status}: ${text}`);
  }

  const json: any = await res.json();
  const textContent = json.output?.message?.content?.[0]?.text ?? "";

  // 4) Extract URLs from the response
  const urlRegex = /https?:\/\/[^\s)\],]+/g;
  const urlsFound = textContent.match(urlRegex) ?? [];
  const uniqueUrls = [...new Set(urlsFound)];

  // Match titles from search results if possible
  const citations = uniqueUrls.map(url => {
    const matchedResult = results.find(r => r.link === url);
    return {
      uri: url,
      resolvedUrl: url,
      title: matchedResult?.title ?? ""
    };
  });

  return { text: textContent, citations };
}

async function main() {
  const query = "Wer ist Jens Langkammer?";
  const result = await askGroundedBedrock(query);
  console.log("=== Text response ===");
  console.log(result.text);
  console.log("=== Citations ===");
  console.log(JSON.stringify(result.citations, null, 2));
}

main().catch(console.error);
