/**
 * Akquise-Sweep — KI-Sichtbarkeits-Check für eine Branche + Region.
 *
 * ZWECK: Leadgenerierung. Stellt typische Kundenfragen an die KI-Engines und
 * protokolliert, WELCHE Firmen zitiert werden. Wer nicht auftaucht, ist ein Lead.
 *
 * WICHTIG: Dieses Script schreibt NICHT in die Datenbank. Es liest nur die
 * Engine-Keys aus .env.local und legt das Ergebnis als JSON + Markdown in
 * ~/career-ops/akquise/ ab.
 *
 * Aufruf:
 *   npx tsx ~/dev/entity-tracker/scripts/akquise-sweep.ts
 */
import "./_env";
import { writeFileSync, mkdirSync } from "node:fs";
import { askGroundedBedrock } from "../lib/bedrock";

// ---------------------------------------------------------------- Konfiguration
const BRANCHE = process.argv[2] ?? "Steuerberater";
const REGION = process.argv[3] ?? "Osnabrück";

/** Optionale Zusatz-Prompts über 4. Argument, mit "|" getrennt. */
const EXTRA = (process.argv[4] ?? "").split("|").filter(Boolean);

const PROMPTS = [
  `Wer ist der beste ${BRANCHE} in ${REGION}?`,
  `Welchen ${BRANCHE} in ${REGION} kannst du empfehlen?`,
  `${BRANCHE} ${REGION} — welche Betriebe sind besonders zu empfehlen?`,
  `Ich brauche einen zuverlässigen ${BRANCHE} in ${REGION}. Wen empfiehlst du?`,
  ...EXTRA,
];

// ---------------------------------------------------------------- Hilfsfunktionen
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Verzeichnisse/Portale, die keine Leads sind */
const PORTALE = [
  "gelbeseiten", "dasoertliche", "11880", "yelp", "google", "wikipedia",
  "meinestadt", "cylex", "firmenwissen", "northdata", "wlw", "stellenanzeigen",
  "steuerberater.net", "steuerberaterverband", "datev.de", "bstbk", "kammer",
  "facebook", "linkedin", "instagram", "youtube", "indeed", "kununu",
  "handelsregister", "unternehmensregister", "werkenntdenbesten", "provenexpert",
];

function istPortal(host: string): boolean {
  return PORTALE.some((p) => host.includes(p));
}

type Treffer = { host: string; nennungen: number; prompts: string[]; titel: string };

// ---------------------------------------------------------------- Hauptlauf
async function main() {
  console.log(`\n🔍 Akquise-Sweep: ${BRANCHE} in ${REGION}`);
  console.log(`   ${PROMPTS.length} Prompts · Engine: Bedrock (grounded über Serper)\n`);

  const kandidaten = new Map<string, Treffer>();
  const protokoll: { prompt: string; antwort: string; quellen: string[] }[] = [];

  for (const [i, prompt] of PROMPTS.entries()) {
    process.stdout.write(`   [${i + 1}/${PROMPTS.length}] ${prompt.slice(0, 60)}… `);
    try {
      const res = await askGroundedBedrock(prompt);
      const quellen: string[] = [];

      for (const c of res.citations) {
        const url = c.resolvedUrl || c.uri;
        const host = hostOf(url);
        if (!host) continue;
        quellen.push(url);
        if (istPortal(host)) continue;

        const vorhanden = kandidaten.get(host);
        if (vorhanden) {
          vorhanden.nennungen += 1;
          if (!vorhanden.prompts.includes(prompt)) vorhanden.prompts.push(prompt);
        } else {
          kandidaten.set(host, {
            host,
            nennungen: 1,
            prompts: [prompt],
            titel: c.title ?? "",
          });
        }
      }

      protokoll.push({ prompt, antwort: res.text, quellen });
      console.log(`✓ ${res.citations.length} Quellen`);
    } catch (err) {
      console.log(`✗ Fehler: ${(err as Error).message}`);
      protokoll.push({ prompt, antwort: `FEHLER: ${(err as Error).message}`, quellen: [] });
    }
    // freundlich zur API
    await new Promise((r) => setTimeout(r, 1500));
  }

  // ------------------------------------------------------------ Auswertung
  const sortiert = [...kandidaten.values()].sort((a, b) => b.nennungen - a.nennungen);
  const datum = new Date().toISOString().slice(0, 10);
  const slug = `${BRANCHE}-${REGION}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const ordner = `${process.env.HOME}/career-ops/akquise`;
  mkdirSync(ordner, { recursive: true });

  writeFileSync(
    `${ordner}/${slug}-${datum}.json`,
    JSON.stringify({ branche: BRANCHE, region: REGION, datum, prompts: PROMPTS, kandidaten: sortiert, protokoll }, null, 2),
  );

  const md = [
    `# KI-Sichtbarkeit: ${BRANCHE} in ${REGION}`,
    ``,
    `**Erhoben:** ${datum} · **Engine:** Bedrock (grounded) · **${PROMPTS.length} Prompts**`,
    ``,
    `## Wer wird von der KI genannt?`,
    ``,
    `| # | Domain | Nennungen | von ${PROMPTS.length} Prompts |`,
    `|---|--------|-----------|------|`,
    ...sortiert.map((k, i) => `| ${i + 1} | ${k.host} | ${k.nennungen} | ${k.prompts.length} |`),
    ``,
    `## Antworten im Wortlaut`,
    ``,
    ...protokoll.flatMap((p) => [`### ${p.prompt}`, ``, p.antwort, ``, `---`, ``]),
  ].join("\n");

  writeFileSync(`${ordner}/${slug}-${datum}.md`, md);

  console.log(`\n📊 ${sortiert.length} Firmen-Domains von der KI genannt:\n`);
  sortiert.slice(0, 15).forEach((k, i) =>
    console.log(`   ${String(i + 1).padStart(2)}. ${k.host.padEnd(38)} ${k.nennungen}× (${k.prompts.length}/${PROMPTS.length} Prompts)`),
  );
  console.log(`\n💾 ${ordner}/${slug}-${datum}.md\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
