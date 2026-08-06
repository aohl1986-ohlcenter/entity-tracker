/**
 * Akquise-Leads — gleicht den KI-Sichtbarkeits-Sweep gegen den realen Markt ab (CLI).
 *
 * Holt über Serper eine breite Liste tatsächlich existierender Anbieter und
 * markiert, wer von der KI NICHT genannt wird. Das sind die Leads.
 * Schreibt NICHT in die Datenbank.
 *
 * Aufruf:
 *   npx tsx ~/dev/entity-tracker/scripts/akquise-leads.ts <BRANCHE> <REGION> [extraSuchen|] [datum]
 *
 * Die Diff-Logik liegt in lib/akquise/leads-core.ts (rein, offline testbar),
 * der Ablauf in lib/akquise-lauf/leads.ts; hier bleibt nur die CLI.
 */
import "./_env";
import { laufeLeads } from "../lib/akquise-lauf/leads";
import { AblaufFehler } from "../lib/akquise-lauf/fehler";
import { heute } from "../lib/akquise/hosts";

const BRANCHE = process.argv[2] ?? "Steuerberater";
const REGION = process.argv[3] ?? "Osnabrück";
/** Optionale Zusatz-Suchen über 4. Argument, mit "|" getrennt. */
const EXTRA = (process.argv[4] ?? "").split("|").filter(Boolean);
/** Optionales Datum (5. Argument) — vorher war nur der heutige Sweep erreichbar. */
const DATUM = process.argv[5] ?? heute();

async function main() {
  const { leads, mdPfad } = await laufeLeads({
    branche: BRANCHE,
    region: REGION,
    extraSuchen: EXTRA,
    datum: DATUM,
    melde: (text) => console.log(text),
  });

  console.log(
    `\n📊 Markt: ${leads.marktGroesse} Betriebe · KI-sichtbar: ${leads.sichtbar.length} · LEADS: ${leads.leads.length}\n`,
  );
  leads.leads
    .slice(0, 20)
    .forEach((l, i) => console.log(`   ${String(i + 1).padStart(2)}. ${l.host}`));
  console.log(`\n💾 ${mdPfad}`);
  console.log(`\n⚠️  NICHT anschreiben, bevor der Gate grün ist:`);
  console.log(`   npm run akquise:gate -- "${BRANCHE}" "${REGION}" ${DATUM} --online\n`);
}

main().catch((e) => {
  if (e instanceof AblaufFehler) console.error(`❌ ${e.message}`);
  else console.error(e);
  process.exit(1);
});
