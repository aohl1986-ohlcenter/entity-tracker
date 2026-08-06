/**
 * Akquise-Auswertung — erzeugt die 1-Seiten-Analyse für einen Lead (CLI).
 *
 * Zieht die Fakten aus dem Sweep-JSON und prüft die Website live auf
 * konkrete, belegbare technische Ursachen. Erfindet nichts — was nicht
 * prüfbar ist, wird als offen markiert.
 *
 * Aufruf:
 *   npx tsx akquise-auswertung.ts <domain> <branche> <region> [datum]
 * Beispiel:
 *   npx tsx akquise-auswertung.ts beispiel.de Rechtsanwalt Musterstadt
 *
 * Ergebnis: HTML in ~/career-ops/akquise/auswertungen/, danach PDF bauen mit
 *   node ~/career-ops/generate-pdf.mjs <html> <pdf> --format=a4
 *
 * Der Ablauf liegt in lib/akquise-lauf/auswertung.ts.
 */
import "./_env";
import { laufeAuswertung } from "../lib/akquise-lauf/auswertung";
import { AblaufFehler } from "../lib/akquise-lauf/fehler";
import { heute } from "../lib/akquise/hosts";

const DOMAIN = process.argv[2] ?? "";
const BRANCHE = process.argv[3] ?? "Rechtsanwalt";
const REGION = process.argv[4] ?? "Osnabrück";
const DATUM = process.argv[5] ?? heute();

if (!DOMAIN) {
  console.error("Aufruf: npx tsx akquise-auswertung.ts <domain> <branche> <region> [datum]");
  process.exit(1);
}

async function main() {
  const { htmlPfad } = await laufeAuswertung({
    domain: DOMAIN,
    branche: BRANCHE,
    region: REGION,
    datum: DATUM,
    melde: (text) => console.log(text),
  });

  console.log(`\n💾 ${htmlPfad}`);
  console.log(
    `\n   PDF bauen:\n   node ~/career-ops/generate-pdf.mjs "${htmlPfad}" "${htmlPfad.replace(/\.html$/, ".pdf")}" --format=a4\n`,
  );
}

main().catch((e) => {
  if (e instanceof AblaufFehler) console.error(`❌ ${e.message}`);
  else console.error(e);
  process.exit(1);
});
