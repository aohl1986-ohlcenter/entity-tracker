/**
 * Akquise-Leads — gleicht den KI-Sichtbarkeits-Sweep gegen den realen Markt ab.
 *
 * Holt über Serper eine breite Liste tatsächlich existierender Anbieter und
 * markiert, wer von der KI NICHT genannt wird. Das sind die Leads.
 * Schreibt NICHT in die Datenbank.
 *
 * Aufruf:
 *   npx tsx ~/dev/entity-tracker/scripts/akquise-leads.ts <BRANCHE> <REGION> [extraSuchen|] [datum]
 *
 * Die Diff-Logik liegt in lib/akquise/leads-core.ts (rein, offline testbar);
 * hier bleiben nur I/O und die Serper-Aufrufe.
 */
import "./_env";
import { readFileSync, writeFileSync } from "node:fs";
import { fetchSerp } from "../lib/serper";
import { akquiseOrdner, heute, hostOf, slugOf } from "../lib/akquise/hosts";
import { istPortal } from "../lib/akquise/portale";
import { berechneLeads, sichtbarkeitsQuote } from "../lib/akquise/leads-core";
import { parseSweep } from "../lib/akquise/schema";
import type { MarktTreffer } from "../lib/akquise/typen";

const BRANCHE = process.argv[2] ?? "Steuerberater";
const REGION = process.argv[3] ?? "Osnabrück";
/** Optionale Zusatz-Suchen über 4. Argument, mit "|" getrennt. */
const EXTRA = (process.argv[4] ?? "").split("|").filter(Boolean);
/** Optionales Datum (5. Argument) — vorher war nur der heutige Sweep erreichbar. */
const DATUM = process.argv[5] ?? heute();

const ORDNER = akquiseOrdner();
const SLUG = slugOf(BRANCHE, REGION);

const SUCHEN = [`${BRANCHE} ${REGION}`, `${BRANCHE} ${REGION} Firma`, ...EXTRA];

async function main() {
  // 1) Wer wurde von der KI zitiert?
  const pfad = `${ORDNER}/${SLUG}-${DATUM}.json`;
  const sweep = parseSweep(JSON.parse(readFileSync(pfad, "utf8")), pfad);
  console.log(`\n📖 Sweep geladen: ${sweep.kandidaten.length} Domains werden von der KI genannt\n`);

  // 2) Wer existiert real?
  const markt = new Map<string, MarktTreffer>();
  for (const q of SUCHEN) {
    process.stdout.write(`   Suche „${q}" … `);
    const serp = await fetchSerp({ query: q, num: 20 });
    let neu = 0;
    for (const r of serp.organic ?? []) {
      const h = hostOf(r.link);
      if (!h || istPortal(h)) continue;
      const v = markt.get(h);
      if (v) v.positionen.push(r.position ?? 0);
      else {
        markt.set(h, { host: h, titel: r.title ?? "", positionen: [r.position ?? 0] });
        neu++;
      }
    }
    console.log(`${neu} neue Domains`);
    await new Promise((r) => setTimeout(r, 800));
  }

  // 3) Abgleich — reine Logik, siehe lib/akquise/leads-core.ts
  const ergebnis = berechneLeads(sweep, [...markt.values()], SUCHEN);
  const quote = sichtbarkeitsQuote(ergebnis);

  // 4) Artefakte schreiben — JSON zuerst, das ist die Schnittstelle zum Gate
  writeFileSync(`${ORDNER}/${SLUG}-leads-${DATUM}.json`, JSON.stringify(ergebnis, null, 2));

  const md = [
    `# Akquise-Leads: ${BRANCHE} in ${REGION}`,
    ``,
    `**Erhoben:** ${DATUM} · **Methode:** ${sweep.prompts.length} KI-Prompts (Bedrock grounded) gegen ${SUCHEN.length} Google-Suchen abgeglichen.`,
    ``,
    `## Kurzfassung`,
    ``,
    `- **${ergebnis.marktGroesse}** Betriebe im Markt gefunden`,
    `- **${ergebnis.sichtbar.length}** davon werden von der KI genannt${quote === null ? "" : ` (${quote} %)`}`,
    `- **${ergebnis.leads.length}** sind bei Google sichtbar, aber in KI-Antworten **unsichtbar** → Leads`,
    ``,
    `## 🎯 Leads — bei Google da, in der KI nicht`,
    ``,
    `| # | Domain | Google-Treffer | Titel |`,
    `|---|--------|----------------|-------|`,
    ...ergebnis.leads.map(
      (l, i) => `| ${i + 1} | ${l.host} | ${l.positionen.length} | ${l.titel.slice(0, 60)} |`,
    ),
    ``,
    `## ✅ Bereits KI-sichtbar (Wettbewerbs-Argument)`,
    ``,
    `| Domain | KI-Nennungen |`,
    `|--------|--------------|`,
    ...ergebnis.sichtbar.map((s) => `| ${s.host} | ${s.nennungen}× |`),
    ``,
    `---`,
    ``,
    `> ⚠️ Vor dem Anschreiben prüfen: \`npm run akquise:gate -- "${BRANCHE}" "${REGION}" ${DATUM} --online\``,
    ``,
  ].join("\n");

  writeFileSync(`${ORDNER}/${SLUG}-leads-${DATUM}.md`, md);

  console.log(
    `\n📊 Markt: ${ergebnis.marktGroesse} Betriebe · KI-sichtbar: ${ergebnis.sichtbar.length} · LEADS: ${ergebnis.leads.length}\n`,
  );
  ergebnis.leads.slice(0, 20).forEach((l, i) => console.log(`   ${String(i + 1).padStart(2)}. ${l.host}`));
  console.log(`\n💾 ${ORDNER}/${SLUG}-leads-${DATUM}.md`);
  console.log(`\n⚠️  NICHT anschreiben, bevor der Gate grün ist:`);
  console.log(`   npm run akquise:gate -- "${BRANCHE}" "${REGION}" ${DATUM} --online\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
