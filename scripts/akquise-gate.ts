/**
 * Akquise-Gate — die Freigabe vor dem Anschreiben (CLI).
 *
 * Aufruf:
 *   npm run akquise:gate -- <BRANCHE> <REGION> [datum] [--online] [--warnungen-akzeptiert] [--json]
 *
 * Exit-Codes (das ist die eigentliche Schnittstelle):
 *   0  freigegeben
 *   1  technischer Fehler (Datei fehlt, Schema kaputt, Umgebung unsauber)
 *   2  mindestens ein Blocker
 *   3  nur Warnungen, ohne --warnungen-akzeptiert
 *
 * Die Entscheidung selbst liegt in lib/akquise-lauf/gate.ts — dieselbe Funktion
 * bedient den MCP-Server, damit beide Wege nicht auseinanderlaufen können.
 *
 * BEWUSST KEIN `import "./_env"`: Der Gate braucht offline keine Keys, und
 * _env würde .env.local mit der PRODUKTIONS-DATABASE_URL laden. Der Guard
 * unten bricht ab, falls die Variable trotzdem gesetzt ist.
 */
import { laufeGate } from "../lib/akquise-lauf/gate";
import { AblaufFehler } from "../lib/akquise-lauf/fehler";
import { SchemaFehler } from "../lib/akquise/schema";
import { heute } from "../lib/akquise/hosts";
import type { Regelverstoss } from "../lib/akquise/typen";

if (process.env.DATABASE_URL) {
  console.error(
    "❌ Der Gate darf nicht mit geladener DATABASE_URL laufen (Gefahr: Produktions-DB).\n" +
      "   Starte ihn ohne .env-Ladung — er braucht offline keine Keys.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

const BRANCHE = positional[0] ?? "Steuerberater";
const REGION = positional[1] ?? "Osnabrück";
const DATUM = positional[2] ?? heute();
const ONLINE = flags.has("--online");
const WARNUNGEN_OK = flags.has("--warnungen-akzeptiert");
const ALS_JSON = flags.has("--json");

function symbol(v: Regelverstoss): string {
  return v.schwere === "blocker" ? "⛔" : "⚠️ ";
}

async function main() {
  const ergebnis = await laufeGate({
    branche: BRANCHE,
    region: REGION,
    datum: DATUM,
    online: ONLINE,
    warnungenAkzeptiert: WARNUNGEN_OK,
    melde: (text) => console.log(text),
  });

  const { blocker, warnungen, kennzahlen } = ergebnis;
  const verstoesse = [...blocker, ...warnungen];

  if (ALS_JSON) {
    console.log(JSON.stringify({ blocker, warnungen }, null, 2));
  } else {
    console.log(`\n🚦 Akquise-Gate: ${BRANCHE} in ${REGION} (${DATUM})`);
    console.log(
      `   ${kennzahlen.prompts} Prompts · ${kennzahlen.marktGroesse} Betriebe · ${kennzahlen.leads} Leads` +
        `${ONLINE ? " · Online-Prüfung aktiv" : " · nur Offline-Regeln"}\n`,
    );
    if (verstoesse.length === 0) {
      console.log("   Keine Beanstandungen.\n");
    }
    for (const v of verstoesse) {
      console.log(`${symbol(v)} [${v.id}] ${v.meldung}`);
      if (v.betroffen.length > 0) {
        console.log(
          `     Betroffen: ${v.betroffen.slice(0, 12).join(", ")}${v.betroffen.length > 12 ? " …" : ""}`,
        );
      }
      console.log("");
    }
  }

  if (ergebnis.status === "blockiert") {
    console.log(`⛔ ${blocker.length} Blocker — NICHT anschreiben.\n`);
    process.exit(2);
  }
  if (ergebnis.status === "warnungen-offen") {
    console.log(
      `⚠️  ${warnungen.length} Warnung(en). Nach manueller Prüfung erneut mit --warnungen-akzeptiert.\n`,
    );
    process.exit(3);
  }
  console.log("✅ Freigegeben.\n");
}

main().catch((e) => {
  if (e instanceof SchemaFehler) {
    console.error(`❌ Schema-Fehler — ${e.message}`);
  } else if (e instanceof AblaufFehler) {
    console.error(`❌ ${e.message}`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
