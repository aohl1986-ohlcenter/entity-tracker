/**
 * Der Gate als aufrufbare Funktion — die Freigabe vor dem Anschreiben.
 *
 * Hier steht die Entscheidung, nicht ihre Darstellung: kein console.log, kein
 * process.exit. Die CLI (scripts/akquise-gate.ts) übersetzt das Ergebnis in
 * ihre Exit-Codes, der MCP-Server in eine Fehlerantwort. Dadurch ist dieselbe
 * Entscheidung an beiden Enden identisch — und offline testbar.
 *
 * KEIN Import von `_env`, `lib/db` oder drizzle: der Gate darf nie in die Nähe
 * der Produktionsdatenbank kommen (eval/isolation.test.ts sichert das zu).
 * Keys braucht er offline ohnehin nicht.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { akquiseOrdner, heute, slugOf } from "../akquise/hosts";
import { parseLeads, parseSweep } from "../akquise/schema";
import { pruefeOffline } from "../akquise/regeln";
import { pruefeWerbewiderspruch } from "../akquise/impressum";
import { parseSperrliste } from "../akquise/sperrliste";
import type { Regelverstoss } from "../akquise/typen";
import { AblaufFehler } from "./fehler";

export type GateStatus = "freigegeben" | "blockiert" | "warnungen-offen";

export type GateErgebnis = {
  status: GateStatus;
  branche: string;
  region: string;
  datum: string;
  online: boolean;
  blocker: Regelverstoss[];
  warnungen: Regelverstoss[];
  kennzahlen: { prompts: number; marktGroesse: number; leads: number };
  /** Pfad des abgelegten Gate-Reports. */
  reportPfad: string;
};

export type GateOptionen = {
  branche: string;
  region: string;
  datum?: string;
  online?: boolean;
  warnungenAkzeptiert?: boolean;
  /** Fortschrittsmeldungen der Online-Prüfung — die CLI schreibt sie auf die Konsole. */
  melde?: (text: string) => void;
};

function lies(pfad: string): unknown {
  if (!existsSync(pfad)) throw new AblaufFehler(`Datei fehlt: ${pfad}`);
  return JSON.parse(readFileSync(pfad, "utf8"));
}

/**
 * Prüft einen Artefaktsatz gegen alle Regeln und legt den Gate-Report ab.
 *
 * Wirft `AblaufFehler` (fehlende Datei, fehlender Tracker) oder `SchemaFehler`
 * (kaputte Artefakte) — beides sind technische Fehler, keine Ablehnungen.
 */
export async function laufeGate(opt: GateOptionen): Promise<GateErgebnis> {
  const branche = opt.branche;
  const region = opt.region;
  const datum = opt.datum ?? heute();
  const online = opt.online ?? false;
  const melde = opt.melde ?? (() => {});

  const ordner = akquiseOrdner();
  const slug = slugOf(branche, region);

  const sweepPfad = `${ordner}/${slug}-${datum}.json`;
  const leadsPfad = `${ordner}/${slug}-leads-${datum}.json`;
  const trackerPfad = `${ordner}/leads-tracker.md`;

  const sweep = parseSweep(lies(sweepPfad), sweepPfad);
  const leads = parseLeads(lies(leadsPfad), leadsPfad);

  if (!existsSync(trackerPfad)) {
    throw new AblaufFehler(`Tracker fehlt: ${trackerPfad} — ohne Sperrliste wird nicht freigegeben.`);
  }
  const sperrliste = parseSperrliste(readFileSync(trackerPfad, "utf8"));

  // Datum aus dem Dateinamen muss zum Inhalt passen (R0, Dateisystem-Teil)
  const verstoesse: Regelverstoss[] = [];
  if (sweep.datum !== datum) {
    verstoesse.push({
      id: "R0_SCHEMA",
      schwere: "blocker",
      betroffen: [],
      meldung: `Dateiname sagt ${datum}, Inhalt sagt ${sweep.datum}.`,
    });
  }

  verstoesse.push(...pruefeOffline({ sweep, leads, sperrliste }));

  if (online) {
    melde(`🌐 Online-Prüfung für ${leads.leads.length} Leads …`);
    for (const lead of leads.leads) {
      const ergebnis = await pruefeWerbewiderspruch(lead.host);
      if (ergebnis.verstoss) verstoesse.push(ergebnis.verstoss);
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  const blocker = verstoesse.filter((v) => v.schwere === "blocker");
  const warnungen = verstoesse.filter((v) => v.schwere === "warnung");

  const reportPfad = `${ordner}/${slug}-gate-${datum}.json`;
  writeFileSync(
    reportPfad,
    JSON.stringify({ branche, region, datum, online, blocker, warnungen }, null, 2),
  );

  const status: GateStatus =
    blocker.length > 0
      ? "blockiert"
      : warnungen.length > 0 && !opt.warnungenAkzeptiert
        ? "warnungen-offen"
        : "freigegeben";

  return {
    status,
    branche,
    region,
    datum,
    online,
    blocker,
    warnungen,
    kennzahlen: {
      prompts: sweep.prompts.length,
      marktGroesse: leads.marktGroesse,
      leads: leads.leads.length,
    },
    reportPfad,
  };
}
