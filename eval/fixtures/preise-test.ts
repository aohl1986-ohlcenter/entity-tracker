// Feste Preistabelle für eval/kosten.test.ts.
//
// Bewusst NICHT die echte Tabelle aus data/preise-llm.ts: sobald dort ein
// Anbieterpreis gepflegt wird, würden Tests brechen, die mit der Preisänderung
// nichts zu tun haben. Geprüft wird die Rechenlogik, nicht der Tagespreis.
//
// Die Zahlen sind absichtlich glatt, damit die Erwartungswerte in den Tests
// von Hand nachrechenbar sind.

import type { PreisZeile, KursZeile } from "../../data/preise-llm";

const QUELLE = "https://beispiel.test/preise";
const GEPRUEFT = "2026-01-01";

export const TEST_PREISE: PreisZeile[] = [
  // Token-Modell mit zwei Zeitscheiben — Kern der Versionierungs-Tests.
  {
    engine: "testllm",
    modell: "modell-a",
    gueltigAb: "2025-01-01",
    modus: "token",
    inputProMioUsd: 1,
    outputProMioUsd: 10,
    quelle: QUELLE,
    geprueftAm: GEPRUEFT,
  },
  {
    engine: "testllm",
    modell: "modell-a",
    gueltigAb: "2026-01-01",
    modus: "token",
    inputProMioUsd: 2,
    outputProMioUsd: 20,
    quelle: QUELLE,
    geprueftAm: GEPRUEFT,
  },
  // Zeile aus der Zukunft — darf für frühere Daten nie greifen.
  {
    engine: "testllm",
    modell: "modell-a",
    gueltigAb: "2027-01-01",
    modus: "token",
    inputProMioUsd: 99,
    outputProMioUsd: 990,
    quelle: QUELLE,
    geprueftAm: GEPRUEFT,
  },
  // Engine-weiter Fallback: gilt für jedes Modell dieser Engine ohne eigene Zeile.
  {
    engine: "testllm",
    modell: null,
    gueltigAb: "2025-06-01",
    modus: "token",
    inputProMioUsd: 5,
    outputProMioUsd: 50,
    quelle: QUELLE,
    geprueftAm: GEPRUEFT,
  },
  // Call-Modell (Such-API ohne Tokens).
  {
    engine: "testsuche",
    modell: null,
    gueltigAb: "2025-01-01",
    modus: "call",
    proCallUsd: 0.002,
    quelle: QUELLE,
    geprueftAm: GEPRUEFT,
  },
  // Free-Tier als ausdrückliche Null — nicht als fehlende Zeile.
  {
    engine: "testgratis",
    modell: null,
    gueltigAb: "2025-01-01",
    modus: "call",
    proCallUsd: 0,
    quelle: QUELLE,
    geprueftAm: GEPRUEFT,
    notiz: "Free-Tier",
  },
];

export const TEST_KURSE: KursZeile[] = [
  { gueltigAb: "2025-01-01", kurs: 0.9, quelle: QUELLE, geprueftAm: GEPRUEFT },
  { gueltigAb: "2026-01-01", kurs: 0.8, quelle: QUELLE, geprueftAm: GEPRUEFT },
];
