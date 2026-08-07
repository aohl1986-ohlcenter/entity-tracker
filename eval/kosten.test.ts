/**
 * Prüft die Kostenrechnung (lib/kosten.ts).
 *
 * Warum das Tests braucht: aus diesen Zahlen wird die Marge pro Mandant
 * abgeleitet. Ein Vorzeichen-, Faktor- oder Zeitscheibenfehler fällt im Betrieb
 * nicht auf — er sieht nur nach einer etwas anderen Marge aus. Deshalb sind die
 * Erwartungswerte hier von Hand nachgerechnet und nicht aus dem Code gezogen.
 *
 * Zwei Eigenschaften sind wichtiger als alle Einzelbeträge:
 *  1. Eine rückwirkend eingefügte Preiszeile darf einen alten Monat nicht
 *     verändern (sonst wackeln abgeschlossene Berichte).
 *  2. Fehlende Token-Zahlen führen zu „unbekannt", nie zu einer Schätzung.
 *
 * Gerechnet wird gegen eval/fixtures/preise-test.ts, NICHT gegen die echte
 * Preistabelle — sonst würde das Pflegen eines Anbieterpreises hier Tests
 * umwerfen. Kein DB-, kein Netzzugriff.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NANO,
  berechneKosten,
  fasseZusammen,
  findeKurs,
  findePreis,
  letzteMonate,
  monatUtc,
  tagUtc,
  usdNachEur,
  type VerdichtbareZeile,
} from "../lib/kosten";
import { TEST_KURSE, TEST_PREISE } from "./fixtures/preise-test";

describe("findePreis — Zeitscheiben und Modell-Auflösung", () => {
  it("nimmt die zum Zeitpunkt jüngste gültige Zeile", () => {
    const p = findePreis("testllm", "modell-a", "2026-06-15", TEST_PREISE);
    assert.equal(p?.gueltigAb, "2026-01-01");
    assert.equal(p?.inputProMioUsd, 2);
  });

  it("ignoriert Zeilen, die erst später gelten", () => {
    const p = findePreis("testllm", "modell-a", "2025-07-01", TEST_PREISE);
    assert.equal(
      p?.gueltigAb,
      "2025-01-01",
      "Die Zeile ab 2026-01-01 darf für ein Datum in 2025 nicht greifen.",
    );
  });

  it("gilt exakt ab dem gueltigAb-Tag (inklusive)", () => {
    const p = findePreis("testllm", "modell-a", "2026-01-01", TEST_PREISE);
    assert.equal(p?.gueltigAb, "2026-01-01");
  });

  it("zieht den Modell-Treffer dem engine-weiten Fallback vor, auch wenn der jünger ist", () => {
    // Fallback gilt ab 2025-06-01, die Modellzeile schon ab 2025-01-01.
    const p = findePreis("testllm", "modell-a", "2025-08-01", TEST_PREISE);
    assert.equal(p?.modell, "modell-a");
    assert.equal(p?.inputProMioUsd, 1);
  });

  it("fällt für ein unbekanntes Modell auf die engine-weite Zeile zurück", () => {
    const p = findePreis("testllm", "modell-unbekannt", "2025-08-01", TEST_PREISE);
    assert.equal(p?.modell, null);
    assert.equal(p?.inputProMioUsd, 5);
  });

  it("liefert null für eine unbekannte Engine", () => {
    assert.equal(findePreis("gibtesnicht", null, "2026-01-01", TEST_PREISE), null);
  });

  it("liefert null, wenn das Datum vor jeder Preiszeile liegt", () => {
    assert.equal(findePreis("testllm", "modell-a", "2024-12-31", TEST_PREISE), null);
  });
});

describe("berechneKosten — Token-Modus", () => {
  it("rechnet Input und Output getrennt ab", () => {
    // 1.000.000 In × $1/Mio + 100.000 Out × $10/Mio = $1 + $1 = $2
    const k = berechneKosten(
      {
        engine: "testllm",
        modell: "modell-a",
        datum: "2025-03-01",
        tokensIn: 1_000_000,
        tokensOut: 100_000,
      },
      TEST_PREISE,
    );
    assert.equal(k.costModell, "token");
    assert.equal(k.costNanoUsd, 2 * NANO);
    assert.equal(k.preisStand, "2025-01-01");
  });

  it("friert den Preisstand ein, sodass eine spätere Zeile alte Läufe nicht verändert", () => {
    const alt = berechneKosten(
      {
        engine: "testllm",
        modell: "modell-a",
        datum: "2025-03-01",
        tokensIn: 1_000_000,
        tokensOut: 0,
      },
      TEST_PREISE,
    );
    const neu = berechneKosten(
      {
        engine: "testllm",
        modell: "modell-a",
        datum: "2026-03-01",
        tokensIn: 1_000_000,
        tokensOut: 0,
      },
      TEST_PREISE,
    );
    assert.equal(alt.costNanoUsd, 1 * NANO, "Alter Monat rechnet mit dem alten Preis.");
    assert.equal(neu.costNanoUsd, 2 * NANO, "Neuer Monat rechnet mit dem neuen Preis.");
    assert.notEqual(alt.preisStand, neu.preisStand);
  });

  it("behandelt eine fehlende Teilangabe als 0, nicht als unbekannt", () => {
    // tokensOut null, tokensIn vorhanden: die vorhandene Zahl wird abgerechnet.
    const k = berechneKosten(
      {
        engine: "testllm",
        modell: "modell-a",
        datum: "2025-03-01",
        tokensIn: 500_000,
        tokensOut: null,
      },
      TEST_PREISE,
    );
    assert.equal(k.costModell, "token");
    assert.equal(k.costNanoUsd, 0.5 * NANO);
  });

  it("führt fehlende Token-Zahlen als unbekannt und schätzt NICHT", () => {
    const k = berechneKosten(
      {
        engine: "testllm",
        modell: "modell-a",
        datum: "2025-03-01",
        tokensIn: null,
        tokensOut: null,
      },
      TEST_PREISE,
    );
    assert.equal(k.costModell, "unbekannt");
    assert.equal(k.costNanoUsd, 0, "0 heißt hier „nicht bezifferbar“, nicht „gratis“.");
  });

  it("rundet auf ganze Nano-USD", () => {
    // 1 Token × $1/Mio = 0,000001 USD = 1000 Nano — glatt, kein Rundungsrest.
    const k = berechneKosten(
      { engine: "testllm", modell: "modell-a", datum: "2025-03-01", tokensIn: 1, tokensOut: 0 },
      TEST_PREISE,
    );
    assert.equal(k.costNanoUsd, 1000);
    assert.ok(Number.isInteger(k.costNanoUsd));
  });
});

describe("berechneKosten — Call-Modus", () => {
  it("rechnet pro Aufruf ab", () => {
    const k = berechneKosten(
      { engine: "testsuche", modell: null, datum: "2026-01-01", tokensIn: null, tokensOut: null },
      TEST_PREISE,
    );
    assert.equal(k.costModell, "call");
    assert.equal(k.costNanoUsd, 0.002 * NANO);
  });

  it("skaliert mit der Anzahl der Aufrufe", () => {
    const k = berechneKosten(
      {
        engine: "testsuche",
        modell: null,
        datum: "2026-01-01",
        tokensIn: null,
        tokensOut: null,
        calls: 50,
      },
      TEST_PREISE,
    );
    assert.equal(k.costNanoUsd, 0.1 * NANO);
  });

  it("unterscheidet Free-Tier (echte 0) von nicht bezifferbar", () => {
    const gratis = berechneKosten(
      { engine: "testgratis", modell: null, datum: "2026-01-01", tokensIn: null, tokensOut: null },
      TEST_PREISE,
    );
    assert.equal(gratis.costNanoUsd, 0);
    assert.equal(
      gratis.costModell,
      "call",
      "Ein hinterlegter Nullpreis ist eine Aussage und muss von „unbekannt“ unterscheidbar bleiben.",
    );
  });

  it("liefert unbekannt ohne hinterlegten Preis", () => {
    const k = berechneKosten(
      { engine: "gibtesnicht", modell: null, datum: "2026-01-01", tokensIn: 10, tokensOut: 10 },
      TEST_PREISE,
    );
    assert.equal(k.costModell, "unbekannt");
    assert.equal(k.preisStand, null);
  });
});

describe("Währungsumrechnung", () => {
  it("nimmt den zum Zeitpunkt gültigen Kurs", () => {
    assert.equal(findeKurs("2025-06-01", TEST_KURSE)?.kurs, 0.9);
    assert.equal(findeKurs("2026-06-01", TEST_KURSE)?.kurs, 0.8);
  });

  it("rechnet Nano-USD in EUR um", () => {
    assert.equal(usdNachEur(10 * NANO, "2025-06-01", TEST_KURSE), 9);
    assert.equal(usdNachEur(10 * NANO, "2026-06-01", TEST_KURSE), 8);
  });

  it("liefert null, wenn für das Datum kein Kurs hinterlegt ist", () => {
    assert.equal(usdNachEur(10 * NANO, "2024-01-01", TEST_KURSE), null);
  });
});

describe("fasseZusammen — Monatsverdichtung", () => {
  const basis = (ü: Partial<VerdichtbareZeile> = {}): VerdichtbareZeile => ({
    entityId: 1,
    month: "2026-08",
    engine: "testllm",
    model: "modell-a",
    ok: 1,
    tokensIn: 100,
    tokensOut: 200,
    costNanoUsd: 1000,
    costModell: "token",
    ...ü,
  });

  it("gruppiert nach Monat, Mandant, Engine und Modell", () => {
    const v = fasseZusammen([basis(), basis(), basis({ engine: "testsuche", model: null })]);
    assert.equal(v.length, 2);
    const llm = v.find((x) => x.engine === "testllm")!;
    assert.equal(llm.calls, 2);
    assert.equal(llm.tokensIn, 200);
    assert.equal(llm.costNanoUsd, 2000);
  });

  it("bildet null-Modelle auf den Leerstring ab", () => {
    const [v] = fasseZusammen([basis({ engine: "testsuche", model: null })]);
    assert.equal(v.model, "", "NULL würde im Unique-Index von llm_cost_monthly nicht deduplizieren.");
  });

  it("trennt Erfolge von Fehlern, zählt aber die Kosten beider", () => {
    const v = fasseZusammen([basis(), basis({ ok: 0, costNanoUsd: 500 })])[0];
    assert.equal(v.calls, 1);
    assert.equal(v.failures, 1);
    assert.equal(
      v.costNanoUsd,
      1500,
      "Ein Abbruch nach dem Token-Verbrauch kostet trotzdem Geld.",
    );
  });

  it("behandelt fehlende Tokens als 0 und zählt sie separat als nicht bezifferbar", () => {
    const v = fasseZusammen([
      basis(),
      basis({ tokensIn: null, tokensOut: null, costNanoUsd: 0, costModell: "unbekannt" }),
    ])[0];
    assert.equal(v.tokensIn, 100);
    assert.equal(v.unbekannteKosten, 1);
    assert.equal(v.calls, 2, "Der Aufruf hat stattgefunden, auch wenn sein Preis unklar ist.");
  });

  it("trennt Mandanten", () => {
    const v = fasseZusammen([basis({ entityId: 1 }), basis({ entityId: 2 })]);
    assert.equal(v.length, 2);
  });

  it("liefert für eine leere Eingabe eine leere Liste", () => {
    assert.deepEqual(fasseZusammen([]), []);
  });
});

describe("Datums-Hilfen", () => {
  it("bildet Tag und Monat in UTC ab", () => {
    const d = new Date("2026-08-06T23:30:00Z");
    assert.equal(tagUtc(d), "2026-08-06");
    assert.equal(monatUtc(d), "2026-08");
  });

  it("zählt Monate über die Jahresgrenze rückwärts", () => {
    assert.deepEqual(letzteMonate(3, new Date("2026-01-15T12:00:00Z")), [
      "2026-01",
      "2025-12",
      "2025-11",
    ]);
  });

  it("verrutscht nicht an Monatsenden", () => {
    // Naives setMonth(-1) auf dem 31. würde hier auf den 3. März springen.
    assert.deepEqual(letzteMonate(2, new Date("2026-03-31T12:00:00Z")), ["2026-03", "2026-02"]);
  });
});
