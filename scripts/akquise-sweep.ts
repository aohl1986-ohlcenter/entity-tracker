/**
 * Akquise-Sweep — KI-Sichtbarkeits-Check für eine Branche + Region (CLI).
 *
 * ZWECK: Leadgenerierung. Stellt typische Kundenfragen an die KI-Engines und
 * protokolliert, WELCHE Firmen zitiert werden. Wer nicht auftaucht, ist ein Lead.
 *
 * WICHTIG: Dieses Script schreibt NICHT in die Datenbank. Es liest nur die
 * Engine-Keys aus .env.local und legt das Ergebnis als JSON + Markdown in
 * ~/career-ops/akquise/ ab.
 *
 * Der Ablauf selbst liegt in lib/akquise-lauf/sweep.ts — hier bleiben nur
 * Argument-Parsing, Key-Ladung und Konsolenausgabe.
 *
 * Aufruf:
 *   npx tsx ~/dev/entity-tracker/scripts/akquise-sweep.ts <BRANCHE> <REGION> [extraPrompts|mit|pipe]
 */
import "./_env";
import { laufeSweep } from "../lib/akquise-lauf/sweep";
import { AblaufFehler } from "../lib/akquise-lauf/fehler";

const BRANCHE = process.argv[2] ?? "Steuerberater";
const REGION = process.argv[3] ?? "Osnabrück";
/** Optionale Zusatz-Prompts über 4. Argument, mit "|" getrennt. */
const EXTRA = (process.argv[4] ?? "").split("|").filter(Boolean);

async function main() {
  console.log(`\n🔍 Akquise-Sweep: ${BRANCHE} in ${REGION}`);
  console.log(`   Engine: Bedrock (grounded über Serper)\n`);

  const { sweep, jsonPfad, mdPfad } = await laufeSweep({
    branche: BRANCHE,
    region: REGION,
    extraPrompts: EXTRA,
    melde: (text) => console.log(text),
  });

  const sortiert = sweep.kandidaten;
  console.log(`\n📊 ${sortiert.length} Firmen-Domains von der KI genannt:\n`);
  sortiert
    .slice(0, 15)
    .forEach((k, i) =>
      console.log(
        `   ${String(i + 1).padStart(2)}. ${k.host.padEnd(38)} ${k.nennungen}× (${k.prompts.length}/${sweep.prompts.length} Prompts)`,
      ),
    );
  console.log(`\n💾 ${mdPfad}`);
  console.log(`   ${jsonPfad}\n`);
}

main().catch((e) => {
  if (e instanceof AblaufFehler) console.error(`❌ ${e.message}`);
  else console.error(e);
  process.exit(1);
});
