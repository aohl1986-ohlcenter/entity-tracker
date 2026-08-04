/**
 * Akquise-Leads — gleicht den KI-Sichtbarkeits-Sweep gegen den realen Markt ab.
 *
 * Holt über Serper eine breite Liste tatsächlich existierender Anbieter und
 * markiert, wer von der KI NICHT genannt wird. Das sind die Leads.
 * Schreibt NICHT in die Datenbank.
 *
 * Aufruf: npx tsx ~/dev/entity-tracker/scripts/akquise-leads.ts
 */
import "./_env";
import { readFileSync, writeFileSync } from "node:fs";
import { fetchSerp } from "../lib/serper";

const BRANCHE = process.argv[2] ?? "Steuerberater";
const REGION = process.argv[3] ?? "Osnabrück";
const DATUM = new Date().toISOString().slice(0, 10);
const ORDNER = `${process.env.HOME}/career-ops/akquise`;
const SLUG = `${BRANCHE}-${REGION}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Optionale Zusatz-Suchen über 4. Argument, mit "|" getrennt. */
const EXTRA = (process.argv[4] ?? "").split("|").filter(Boolean);

const SUCHEN = [
  `${BRANCHE} ${REGION}`,
  `${BRANCHE} ${REGION} Firma`,
  ...EXTRA,
];

const PORTALE = [
  "gelbeseiten", "dasoertliche", "11880", "yelp", "google", "wikipedia",
  "meinestadt", "cylex", "firmenwissen", "northdata", "wlw", "stellenanzeigen",
  "steuerberater.net", "steuerberaterverband", "datev.de", "bstbk", "kammer",
  "facebook", "linkedin", "instagram", "youtube", "indeed", "kununu", "xing",
  "handelsregister", "unternehmensregister", "werkenntdenbesten", "provenexpert",
  "trustlocal", "anwalt.de", "jobs", "wikiwand", "focus.de", "handelsblatt",
  "juraforum", "fachanwalt.de", "advocado", "rechtsanwalt.com", "stepstone",
  "dastelefonbuch", "anwaltauskunft", "123recht", "kanzleien.de",
];

const host = (u: string) => {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
};
const istPortal = (h: string) => PORTALE.some((p) => h.includes(p));

async function main() {
  // 1) Wer wurde von der KI zitiert?
  const sweep = JSON.parse(readFileSync(`${ORDNER}/${SLUG}-${DATUM}.json`, "utf8"));
  const zitiert = new Map<string, number>(
    sweep.kandidaten.map((k: { host: string; nennungen: number }) => [k.host, k.nennungen]),
  );
  console.log(`\n📖 Sweep geladen: ${zitiert.size} Domains werden von der KI genannt\n`);

  // 2) Wer existiert real?
  const markt = new Map<string, { host: string; titel: string; positionen: number[] }>();
  for (const q of SUCHEN) {
    process.stdout.write(`   Suche „${q}" … `);
    const serp = await fetchSerp({ query: q, num: 20 });
    let neu = 0;
    for (const r of serp.organic ?? []) {
      const h = host(r.link);
      if (!h || istPortal(h)) continue;
      const v = markt.get(h);
      if (v) v.positionen.push(r.position ?? 0);
      else { markt.set(h, { host: h, titel: r.title ?? h, positionen: [r.position ?? 0] }); neu++; }
    }
    console.log(`${neu} neue Domains`);
    await new Promise((r) => setTimeout(r, 800));
  }

  // 3) Abgleich
  const leads = [...markt.values()]
    .filter((m) => !zitiert.has(m.host))
    .sort((a, b) => b.positionen.length - a.positionen.length);
  const sichtbar = [...markt.values()].filter((m) => zitiert.has(m.host));

  const md = [
    `# Akquise-Leads: ${BRANCHE} in ${REGION}`,
    ``,
    `**Erhoben:** ${DATUM} · **Methode:** ${sweep.prompts.length} KI-Prompts (Bedrock grounded) gegen ${SUCHEN.length} Google-Suchen abgeglichen.`,
    ``,
    `## Kurzfassung`,
    ``,
    `- **${markt.size}** Betriebe im Markt gefunden`,
    `- **${sichtbar.length}** davon werden von der KI genannt (${Math.round((sichtbar.length / markt.size) * 100)} %)`,
    `- **${leads.length}** sind bei Google sichtbar, aber in KI-Antworten **unsichtbar** → Leads`,
    ``,
    `## 🎯 Leads — bei Google da, in der KI nicht`,
    ``,
    `| # | Domain | Google-Treffer | Titel |`,
    `|---|--------|----------------|-------|`,
    ...leads.map((l, i) => `| ${i + 1} | ${l.host} | ${l.positionen.length} | ${l.titel.slice(0, 60)} |`),
    ``,
    `## ✅ Bereits KI-sichtbar (Wettbewerbs-Argument)`,
    ``,
    `| Domain | KI-Nennungen |`,
    `|--------|--------------|`,
    ...sichtbar
      .sort((a, b) => (zitiert.get(b.host) ?? 0) - (zitiert.get(a.host) ?? 0))
      .map((s) => `| ${s.host} | ${zitiert.get(s.host)}× |`),
    ``,
  ].join("\n");

  writeFileSync(`${ORDNER}/${SLUG}-leads-${DATUM}.md`, md);

  console.log(`\n📊 Markt: ${markt.size} Betriebe · KI-sichtbar: ${sichtbar.length} · LEADS: ${leads.length}\n`);
  leads.slice(0, 20).forEach((l, i) =>
    console.log(`   ${String(i + 1).padStart(2)}. ${l.host}`),
  );
  console.log(`\n💾 ${ORDNER}/${SLUG}-leads-${DATUM}.md\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
