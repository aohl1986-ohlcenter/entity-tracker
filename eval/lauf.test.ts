/**
 * Der Gate-Ablauf als Ganzes — Artefakte, Tracker und Statusentscheidung.
 *
 * Die Regeln selbst sind in regeln.test.ts und im Golden Set abgedeckt. Hier
 * geht es um die Stufe darüber: Findet der Gate seine Dateien, wirft er bei
 * fehlenden statt sie stillschweigend zu übergehen, und wird aus den Verstößen
 * der richtige Status?
 *
 * Dieser Status ist die gemeinsame Entscheidung von CLI (Exit-Codes 0/2/3) und
 * MCP-Server (Fehlerantwort). Wäre er falsch, wäre er an beiden Enden falsch.
 *
 * Die Artefakte sind hier synthetisch, nicht aus fixtures/: die realen Fixtures
 * tragen alle mindestens einen Blocker (das ist ihr Zweck), taugen also nicht,
 * um den Freigabe-Pfad zu prüfen. Alles liegt in einem Temp-HOME — kein Netz,
 * keine echten Daten, auch kein echter Tracker.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { laufeGate } from "../lib/akquise-lauf/gate";
import { AblaufFehler } from "../lib/akquise-lauf/fehler";
import { slugOf } from "../lib/akquise/hosts";
import type { LeadsDatei, SweepDatei } from "../lib/akquise/typen";

const BRANCHE = "Dachdecker";
const REGION = "Musterstadt";
const DATUM = "2026-08-06";

/** Erfundene Domains — keine davon steht in aliase.json oder einer Sperrliste. */
const ZITIERT = Array.from({ length: 10 }, (_, i) => `beispiel-${i + 1}.de`);
const LEAD_HOST = "beispiel-lead.de";

const TRACKER = `# Test-Tracker

## Sperrliste (kein Kontakt mehr)

| Domain | Grund |
|--------|-------|
| gesperrt-beispiel.de | Testeintrag, ausdrücklicher Widerspruch |
`;

let heimat: string;
let ordner: string;
let echtesHome: string | undefined;

function baueSweep(): SweepDatei {
  const prompt = `Wer ist der beste ${BRANCHE} in ${REGION}?`;
  return {
    branche: BRANCHE,
    region: REGION,
    datum: DATUM,
    prompts: [prompt],
    kandidaten: ZITIERT.map((host) => ({ host, nennungen: 1, prompts: [prompt], titel: host })),
    protokoll: [
      {
        prompt,
        antwort: "Testantwort.",
        quellen: ZITIERT.map((h) => `https://${h}/`),
        grounding: { ok: true, links: ZITIERT.map((h) => `https://${h}/`) },
      },
    ],
  };
}

/** marktGroesse steuert R1: 10 → sauber, 8 → Deckung 80 %, also Warnung. */
function baueLeads(marktGroesse: number): LeadsDatei {
  return {
    branche: BRANCHE,
    region: REGION,
    datum: DATUM,
    suchen: [`${BRANCHE} ${REGION}`],
    marktGroesse,
    leads: [{ host: LEAD_HOST, titel: `Dachdeckerei ${REGION}`, positionen: [3] }],
    sichtbar: [],
  };
}

/** Schreibt einen Artefaktsatz unter einem eigenen Slug, damit die Fälle sich nicht stören. */
function legeAn(
  branche: string,
  sweep: SweepDatei = baueSweep(),
  leads: LeadsDatei = baueLeads(10),
  datum = DATUM,
): void {
  const slug = slugOf(branche, REGION);
  writeFileSync(join(ordner, `${slug}-${datum}.json`), JSON.stringify(sweep));
  writeFileSync(join(ordner, `${slug}-leads-${datum}.json`), JSON.stringify(leads));
}

before(() => {
  echtesHome = process.env.HOME;
  heimat = mkdtempSync(join(tmpdir(), "akquise-lauf-"));
  process.env.HOME = heimat;
  ordner = join(heimat, "career-ops", "akquise");
  mkdirSync(ordner, { recursive: true });
  writeFileSync(join(ordner, "leads-tracker.md"), TRACKER);
});

after(() => {
  if (echtesHome === undefined) delete process.env.HOME;
  else process.env.HOME = echtesHome;
  rmSync(heimat, { recursive: true, force: true });
});

describe("laufeGate — Artefakte und Statusentscheidung", () => {
  it("gibt einen sauberen Fall frei", async () => {
    legeAn("SauberA");
    const e = await laufeGate({ branche: "SauberA", region: REGION, datum: DATUM });

    assert.equal(e.status, "freigegeben");
    assert.deepEqual(e.blocker, []);
    assert.deepEqual(e.warnungen, []);
    assert.equal(e.online, false);
    assert.equal(e.kennzahlen.prompts, 1);
    assert.equal(e.kennzahlen.leads, 1);
  });

  it("blockiert, sobald ein Blocker vorliegt", async () => {
    // Ein Portal in der Lead-Liste — Verzeichnisse sind keine anschreibbaren Betriebe.
    const leads = baueLeads(10);
    leads.leads.push({ host: "gelbeseiten.de", titel: "Verzeichnis", positionen: [1] });
    legeAn("PortalB", baueSweep(), leads);

    const e = await laufeGate({ branche: "PortalB", region: REGION, datum: DATUM });
    assert.equal(e.status, "blockiert");
    assert.ok(
      e.blocker.some((b) => b.id === "R3_PORTAL_LECKAGE"),
      `erwartet R3, bekommen: ${e.blocker.map((b) => b.id).join(", ") || "keine"}`,
    );
  });

  it("hält bei bloßen Warnungen an — und lässt sie bewusst akzeptieren", async () => {
    legeAn("WarnungC", baueSweep(), baueLeads(8));

    const offen = await laufeGate({ branche: "WarnungC", region: REGION, datum: DATUM });
    assert.equal(offen.status, "warnungen-offen");
    assert.deepEqual(offen.blocker, []);
    assert.ok(offen.warnungen.length > 0);

    const akzeptiert = await laufeGate({
      branche: "WarnungC",
      region: REGION,
      datum: DATUM,
      warnungenAkzeptiert: true,
    });
    assert.equal(akzeptiert.status, "freigegeben");
    // Die Warnungen verschwinden nicht — sie sind nur nicht mehr aufhaltend.
    assert.equal(akzeptiert.warnungen.length, offen.warnungen.length);
  });

  it("akzeptierte Warnungen heben Blocker NICHT auf", async () => {
    const leads = baueLeads(8);
    leads.leads.push({ host: "gelbeseiten.de", titel: "Verzeichnis", positionen: [1] });
    legeAn("BeidesD", baueSweep(), leads);

    const e = await laufeGate({
      branche: "BeidesD",
      region: REGION,
      datum: DATUM,
      warnungenAkzeptiert: true,
    });
    assert.equal(e.status, "blockiert");
  });

  it("blockiert, wenn das Datum im Dateinamen nicht zum Inhalt passt", async () => {
    const falsch = "2020-01-01";
    legeAn("DatumE", baueSweep(), baueLeads(10), falsch);

    const e = await laufeGate({ branche: "DatumE", region: REGION, datum: falsch });
    assert.equal(e.status, "blockiert");
    assert.ok(e.blocker.some((b) => b.id === "R0_SCHEMA"));
  });

  it("schreibt den Gate-Report neben die Artefakte", async () => {
    legeAn("ReportF");
    const e = await laufeGate({ branche: "ReportF", region: REGION, datum: DATUM });

    assert.ok(e.reportPfad.startsWith(ordner), "Report darf nur im Akquise-Ordner landen");
    const report = JSON.parse(readFileSync(e.reportPfad, "utf8"));
    assert.equal(report.branche, "ReportF");
    assert.equal(report.datum, DATUM);
    assert.deepEqual(report.blocker, []);
  });

  it("wirft AblaufFehler statt den Prozess zu beenden, wenn der Sweep fehlt", async () => {
    await assert.rejects(
      () => laufeGate({ branche: "GibtesnichtG", region: REGION, datum: DATUM }),
      (e: unknown) => e instanceof AblaufFehler && /Datei fehlt/.test((e as Error).message),
    );
  });

  it("wirft AblaufFehler, wenn der Tracker mit der Sperrliste fehlt", async () => {
    legeAn("TrackerH");
    const tracker = join(ordner, "leads-tracker.md");
    const sicherung = join(ordner, "tracker.sicherung");
    copyFileSync(tracker, sicherung);
    rmSync(tracker);
    try {
      await assert.rejects(
        () => laufeGate({ branche: "TrackerH", region: REGION, datum: DATUM }),
        (e: unknown) => e instanceof AblaufFehler && /Tracker fehlt/.test((e as Error).message),
      );
    } finally {
      copyFileSync(sicherung, tracker);
      rmSync(sicherung);
    }
  });
});
