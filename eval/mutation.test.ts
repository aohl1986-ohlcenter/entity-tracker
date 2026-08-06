/**
 * Mutationsprobe — der wichtigste Test der Suite.
 *
 * Das Golden Set beweist nur, dass die Regeln bei echten Fehlern anschlagen.
 * Es beweist NICHT, dass sie scharf sind: Eine Regel, die immer feuert, wäre
 * dort grün. Hier wird ein sauberer Lauf gezielt kaputtgemacht und geprüft,
 * dass GENAU die zugehörige Regel anschlägt — und keine andere.
 *
 * Die Basis ist bewusst SYNTHETISCH und nicht einer der echten Läufe: Ein
 * historisches Artefakt bringt eigene Altlasten mit (der Dachdecker-Sweep
 * enthält z. B. my-hammer.de in den Kandidaten), und dann misst man die
 * Mutation nicht mehr isoliert.
 *
 * Deckt außerdem die zwei Regeln ab, für die es kein Artefakt mehr gibt:
 * R1 (das fehlerhafte Immobilien-JSON wurde überschrieben) und R7 (alle
 * vorhandenen Sweeps entstanden vor der Grounding-Erweiterung).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pruefeOffline } from "../lib/akquise/regeln";
import { baueKontext, kopie, ladeSperrliste } from "./hilfen";
import type { LeadsDatei, Pruefkontext, RegelId, SweepDatei } from "../lib/akquise/typen";

const QUELLE = "https://echte-quelle.de/seite";

const SAUBERER_SWEEP: SweepDatei = {
  branche: "Dachdecker",
  region: "Osnabrück",
  datum: "2026-08-05",
  prompts: ["Welchen Dachdecker in Osnabrück kannst du empfehlen?"],
  kandidaten: [
    { host: "bauer-os.de", nennungen: 4, prompts: ["p"], titel: "Bauer Bedachungen" },
    { host: "dachdecker-volmer.de", nennungen: 2, prompts: ["p"], titel: "Volmer" },
  ],
  protokoll: [
    {
      prompt: "Welchen Dachdecker in Osnabrück kannst du empfehlen?",
      antwort: "…",
      quellen: [QUELLE],
      grounding: { ok: true, links: [QUELLE] },
    },
  ],
};

const SAUBERE_LEADS: LeadsDatei = {
  branche: "Dachdecker",
  region: "Osnabrück",
  datum: "2026-08-05",
  suchen: ["Dachdecker Osnabrück", "Dachdeckerei Osnabrück"],
  marktGroesse: 3,
  leads: [{ host: "kaschtan-bedachungen.de", titel: "Kaschtan GmbH", positionen: [2] }],
  sichtbar: [
    { host: "bauer-os.de", titel: "Bauer", positionen: [1], nennungen: 4 },
    { host: "dachdecker-volmer.de", titel: "Volmer", positionen: [3], nennungen: 2 },
  ],
};

function basis(): Pruefkontext {
  return {
    sweep: kopie(SAUBERER_SWEEP),
    leads: kopie(SAUBERE_LEADS),
    sperrliste: ladeSperrliste(),
  };
}

/** Signatur aus Regel UND Schweregrad — eine Verschärfung ist auch eine Änderung. */
function signaturen(k: Pruefkontext): string[] {
  return [...new Set(pruefeOffline(k).map((v) => `${v.id}:${v.schwere}`))].sort();
}

const GRUNDRAUSCHEN = signaturen(basis());

function pruefeMutation(
  name: string,
  mutiere: (k: Pruefkontext) => void,
  erwartet: RegelId,
  schwere: "blocker" | "warnung" = "blocker",
) {
  it(name, () => {
    const k = basis();
    mutiere(k);
    const neu = signaturen(k).filter((s) => !GRUNDRAUSCHEN.includes(s));
    assert.deepEqual(
      neu,
      [`${erwartet}:${schwere}`],
      `Erwartet genau ${erwartet}:${schwere}, bekommen: ${neu.join(", ") || "keinen neuen Verstoß"}`,
    );
  });
}

describe("Mutationsprobe — jede Regel schlägt genau bei ihrem Fehler an", () => {
  it("die unveränderte Basis ist vollständig sauber", () => {
    assert.deepEqual(
      pruefeOffline(basis()),
      [],
      "Ohne saubere Basis misst keine der folgenden Mutationen etwas Aussagekräftiges.",
    );
  });

  pruefeMutation(
    "R1: Markt auf ein Drittel schrumpfen → Unterfassung",
    (k) => {
      k.leads.marktGroesse = 1;
    },
    "R1_MARKT_UNTERFASSUNG",
  );

  pruefeMutation(
    "R2: fachfremder Suchbegriff → Prompt/Markt-Mismatch",
    (k) => {
      k.leads.suchen.push("Kieferorthopäde Osnabrück");
    },
    "R2_PROMPT_MARKT_MISMATCH",
  );

  pruefeMutation(
    "R3: Portal in die Lead-Liste schmuggeln → Leckage",
    (k) => {
      k.leads.leads.push({ host: "gelbeseiten.de", titel: "Branchenbuch", positionen: [1] });
    },
    "R3_PORTAL_LECKAGE",
  );

  pruefeMutation(
    "R4: Zweitdomain eines zitierten Betreibers → Alias",
    (k) => {
      k.sweep.kandidaten.push({ host: "dachdecker-struebbe.de", nennungen: 2, prompts: ["p"], titel: "" });
      k.leads.leads.push({ host: "dachdeckerei-struebbe.de", titel: "Strübbe", positionen: [4] });
      k.leads.marktGroesse += 1;
    },
    "R4_ALIAS_DOMAIN",
  );

  pruefeMutation(
    "R5: gesperrte Domain als Lead → Sperrliste",
    (k) => {
      k.leads.leads.push({ host: "zahnarztpraxis-beispiel.example", titel: "", positionen: [1] });
      k.leads.marktGroesse += 1;
    },
    "R5_SPERRLISTE",
  );

  pruefeMutation(
    "R7: Prompt ohne Grounding → ungegroundete Antwort",
    (k) => {
      k.sweep.protokoll[0].grounding = { ok: false, fehler: "SERP-Timeout", links: [] };
    },
    "R7_GROUNDING",
  );

  pruefeMutation(
    "R7: erfundene URL, deren Domain als Nennung zählt → blockiert",
    (k) => {
      // bauer-os.de steht in kandidaten — die erfundene Quelle hat also gewirkt
      k.sweep.protokoll[0].quellen = ["https://bauer-os.de/erfundene-seite"];
    },
    "R7_GROUNDING",
    "blocker",
  );

  pruefeMutation(
    "R7: erfundene URL ohne Wirkung aufs Ergebnis → nur Warnung",
    (k) => {
      // Diese Domain taucht in keiner Kandidatenliste auf, der Befund bleibt korrekt
      k.sweep.protokoll[0].quellen = ["https://irgendein-portal.de/liste"];
    },
    "R7_GROUNDING",
    "warnung",
  );

  pruefeMutation(
    "R8: NaN in einer Kennzahl → ungültige Zahl",
    (k) => {
      k.sweep.kandidaten[0].nennungen = NaN;
    },
    "R8_ZAHLEN",
  );

  it("R6 schlägt bei fachfremdem Lead-Titel an — und blockiert NIE", () => {
    const k = baueKontext("immobilienmakler-osnabrueck", "immobilienmakler-osnabrueck");
    const treffer = pruefeOffline(k).filter((v) => v.id === "R6_KATEGORIE");
    assert.ok(treffer.length > 0, "R6 hätte anschlagen müssen");
    assert.equal(
      treffer[0].schwere,
      "warnung",
      "R6 darf nie blockieren — ein Makler, der auch verwaltet, ist ein legitimer Lead.",
    );
  });
});
