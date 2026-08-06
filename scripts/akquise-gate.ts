/**
 * Akquise-Gate — die Freigabe vor dem Anschreiben.
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
 * BEWUSST KEIN `import "./_env"`: Der Gate braucht offline keine Keys, und
 * _env würde .env.local mit der PRODUKTIONS-DATABASE_URL laden. Der Guard
 * unten bricht ab, falls die Variable trotzdem gesetzt ist.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { akquiseOrdner, heute, slugOf } from "../lib/akquise/hosts";
import { parseLeads, parseSweep, SchemaFehler } from "../lib/akquise/schema";
import { pruefeOffline } from "../lib/akquise/regeln";
import { pruefeWerbewiderspruch } from "../lib/akquise/impressum";
import { parseSperrliste } from "../lib/akquise/sperrliste";
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

const ORDNER = akquiseOrdner();
const SLUG = slugOf(BRANCHE, REGION);
const TRACKER = `${ORDNER}/leads-tracker.md`;

function lies(pfad: string): unknown {
  if (!existsSync(pfad)) {
    console.error(`❌ Datei fehlt: ${pfad}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(pfad, "utf8"));
}

function symbol(v: Regelverstoss): string {
  return v.schwere === "blocker" ? "⛔" : "⚠️ ";
}

async function main() {
  const sweepPfad = `${ORDNER}/${SLUG}-${DATUM}.json`;
  const leadsPfad = `${ORDNER}/${SLUG}-leads-${DATUM}.json`;

  const sweep = parseSweep(lies(sweepPfad), sweepPfad);
  const leads = parseLeads(lies(leadsPfad), leadsPfad);

  if (!existsSync(TRACKER)) {
    console.error(`❌ Tracker fehlt: ${TRACKER} — ohne Sperrliste wird nicht freigegeben.`);
    process.exit(1);
  }
  const sperrliste = parseSperrliste(readFileSync(TRACKER, "utf8"));

  // Datum aus dem Dateinamen muss zum Inhalt passen (R0, Dateisystem-Teil)
  const verstoesse: Regelverstoss[] = [];
  if (sweep.datum !== DATUM) {
    verstoesse.push({
      id: "R0_SCHEMA",
      schwere: "blocker",
      betroffen: [],
      meldung: `Dateiname sagt ${DATUM}, Inhalt sagt ${sweep.datum}.`,
    });
  }

  verstoesse.push(...pruefeOffline({ sweep, leads, sperrliste }));

  if (ONLINE) {
    console.log(`🌐 Online-Prüfung für ${leads.leads.length} Leads …`);
    for (const lead of leads.leads) {
      const ergebnis = await pruefeWerbewiderspruch(lead.host);
      if (ergebnis.verstoss) verstoesse.push(ergebnis.verstoss);
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  const blocker = verstoesse.filter((v) => v.schwere === "blocker");
  const warnungen = verstoesse.filter((v) => v.schwere === "warnung");

  // Report ablegen
  writeFileSync(
    `${ORDNER}/${SLUG}-gate-${DATUM}.json`,
    JSON.stringify(
      { branche: BRANCHE, region: REGION, datum: DATUM, online: ONLINE, blocker, warnungen },
      null,
      2,
    ),
  );

  if (ALS_JSON) {
    console.log(JSON.stringify({ blocker, warnungen }, null, 2));
  } else {
    console.log(`\n🚦 Akquise-Gate: ${BRANCHE} in ${REGION} (${DATUM})`);
    console.log(
      `   ${sweep.prompts.length} Prompts · ${leads.marktGroesse} Betriebe · ${leads.leads.length} Leads` +
        `${ONLINE ? " · Online-Prüfung aktiv" : " · nur Offline-Regeln"}\n`,
    );
    if (verstoesse.length === 0) {
      console.log("   Keine Beanstandungen.\n");
    }
    for (const v of verstoesse) {
      console.log(`${symbol(v)} [${v.id}] ${v.meldung}`);
      if (v.betroffen.length > 0) {
        console.log(`     Betroffen: ${v.betroffen.slice(0, 12).join(", ")}${v.betroffen.length > 12 ? " …" : ""}`);
      }
      console.log("");
    }
  }

  if (blocker.length > 0) {
    console.log(`⛔ ${blocker.length} Blocker — NICHT anschreiben.\n`);
    process.exit(2);
  }
  if (warnungen.length > 0 && !WARNUNGEN_OK) {
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
  } else {
    console.error(e);
  }
  process.exit(1);
});
