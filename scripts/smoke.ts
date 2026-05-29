import "./_env";
import { fetchSerp } from "../lib/serper";
import { askGroundedGemini } from "../lib/gemini";

async function main() {
  console.log("1) Serper smoke test…");
  const serp = await fetchSerp({ query: "Jens Langkammer", num: 5 });
  console.log(`   Got ${serp.organic?.length ?? 0} organic results`);
  console.log("   Top:", (serp.organic ?? []).slice(0, 3).map((r) => `${r.position}. ${r.link}`));

  console.log("\n2) Gemini smoke test (grounded)…");
  const g = await askGroundedGemini("Wer ist Jens Langkammer? Antworte kurz mit Quellen.");
  console.log(`   Got ${g.citations.length} citations`);
  console.log("   Text:", g.text.slice(0, 200) + (g.text.length > 200 ? "…" : ""));
  console.log(
    "   Citations:",
    g.citations.slice(0, 5).map((c) => ({ resolvedUrl: c.resolvedUrl, title: c.title })),
  );
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
