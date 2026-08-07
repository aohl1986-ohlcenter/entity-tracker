// Preistabelle für die API-Kostenrechnung — reine Daten, keine Logik.
// Die Rechnung dazu steht in lib/kosten.ts, die Tests in eval/kosten.test.ts.
//
// ── Versionierung (wichtig) ────────────────────────────────────────────────
// Preiszeilen werden NIE bearbeitet, sondern angehängt. Jede Zeile gilt ab
// `gueltigAb` bis zur nächsten Zeile derselben Engine+Modell-Kombination.
// Ändert ein Anbieter seine Preise, kommt eine neue Zeile mit dem Datum der
// Änderung dazu — dadurch kann ein bereits abgeschlossener Monatsbericht nicht
// rückwirkend kippen. Zusätzlich friert jede `llm_calls`-Zeile in `preisStand`
// das `gueltigAb` der tatsächlich angewandten Zeile ein.
//
// ── Free-Tier ──────────────────────────────────────────────────────────────
// Die heute genutzten Tarife sind teilweise kostenlos. Das wird ehrlich als
// Preis 0 mit Notiz abgebildet, nicht weggelassen: 0 € ist eine Aussage, eine
// fehlende Zeile wäre keine. Der Wechsel auf einen bezahlten Tarif ist dann
// genau eine angehängte Zeile mit dem Umstellungsdatum.

export type PreisModus = "token" | "call";

export type PreisZeile = {
  /** Engine-Name wie in lib/jobs.ts: bedrock | gemini | tavily | brave | serper */
  engine: string;
  /** Konkretes Modell, oder null = gilt engine-weit (Such-APIs ohne Modell). */
  modell: string | null;
  /** YYYY-MM-DD, inklusive. Gilt bis zur nächsten Zeile derselben Kombination. */
  gueltigAb: string;
  modus: PreisModus;
  /** Nur bei modus "token". */
  inputProMioUsd?: number;
  outputProMioUsd?: number;
  /** Nur bei modus "call". */
  proCallUsd?: number;
  /** Beleg-URL des Anbieters — jede Zahl hier muss dort nachschlagbar sein. */
  quelle: string;
  /** Wann der Wert zuletzt gegen die Quelle geprüft wurde (YYYY-MM-DD). */
  geprueftAm: string;
  notiz?: string;
};

export const PREISE: PreisZeile[] = [
  // ── Bedrock / Amazon Nova Lite ───────────────────────────────────────────
  // On-Demand, us-east-1: $0.00006 / 1k Input, $0.00024 / 1k Output.
  {
    engine: "bedrock",
    modell: "amazon.nova-lite-v1:0",
    gueltigAb: "2025-01-01",
    modus: "token",
    inputProMioUsd: 0.06,
    outputProMioUsd: 0.24,
    quelle: "https://aws.amazon.com/bedrock/pricing/",
    geprueftAm: "2026-08-06",
    notiz: "On-Demand. Batch wäre 50% günstiger, nutzen wir nicht.",
  },

  // ── Gemini ───────────────────────────────────────────────────────────────
  // Aktuell läuft der AI-Studio-Free-Tier (GEMINI_API_KEY ohne Billing).
  // Beim Wechsel auf den bezahlten Tarif: neue Zeile mit dem Umstellungsdatum
  // und inputProMioUsd 0.30 / outputProMioUsd 2.50 anhängen, diese hier stehen
  // lassen.
  {
    engine: "gemini",
    modell: "gemini-2.5-flash",
    gueltigAb: "2025-01-01",
    modus: "token",
    inputProMioUsd: 0,
    outputProMioUsd: 0,
    quelle: "https://ai.google.dev/gemini-api/docs/pricing",
    geprueftAm: "2026-08-06",
    notiz:
      "Free-Tier (AI Studio, ohne Billing) — kostenlos bei begrenzter Rate. " +
      "Bezahlt wären es $0.30/Mio Input und $2.50/Mio Output.",
  },

  // ── Tavily ───────────────────────────────────────────────────────────────
  // 1.000 Credits/Monat gratis, danach $0.008/Credit. Eine Basic-Suche = 1 Credit.
  // Solange wir unter 1.000/Monat bleiben, ist der Grenzpreis 0 — der wird hier
  // NICHT angesetzt, weil das die Kosten beim Überschreiten schlagartig falsch
  // machen würde. Angesetzt ist der Pay-as-you-go-Preis: lieber leicht zu
  // pessimistisch als eine Marge, die beim dritten Kunden umkippt.
  {
    engine: "tavily",
    modell: null,
    gueltigAb: "2025-01-01",
    modus: "call",
    proCallUsd: 0.008,
    quelle: "https://www.tavily.com/pricing",
    geprueftAm: "2026-08-06",
    notiz: "Pay-as-you-go $0.008/Credit; erste 1.000 Credits/Monat sind frei.",
  },

  // ── Brave ────────────────────────────────────────────────────────────────
  // Search-Plan $5 / 1.000 Requests, $5 Freiguthaben pro Monat.
  {
    engine: "brave",
    modell: null,
    gueltigAb: "2025-01-01",
    modus: "call",
    proCallUsd: 0.005,
    quelle: "https://brave.com/search/api/",
    geprueftAm: "2026-08-06",
    notiz: "Search-Plan $5/1.000 Requests; $5 Freiguthaben/Monat.",
  },

  // ── Serper ───────────────────────────────────────────────────────────────
  // Einstiegspaket $50 / 50.000 Credits = $0.001 pro Abruf. Bei num<=10 kostet
  // ein Abruf 1 Credit — lib/serper.ts nutzt num=10 als Default, wir bleiben
  // also im 1-Credit-Fall. Höhere Volumenpakete gehen bis $0.30/1.000 runter;
  // gerechnet wird mit dem Paket, das wir tatsächlich kaufen.
  {
    engine: "serper",
    modell: null,
    gueltigAb: "2025-01-01",
    modus: "call",
    proCallUsd: 0.001,
    quelle: "https://serper.dev/",
    geprueftAm: "2026-08-06",
    notiz:
      "Einstiegspaket $50/50k Credits. num<=10 = 1 Credit; ab 11 Ergebnissen " +
      "wären es 2 Credits — lib/serper.ts fragt 10 ab.",
  },
];

/**
 * USD→EUR-Kurse, ebenfalls versioniert.
 *
 * Die Anbieter rechnen in USD ab, die Pakete (lib/plans.ts) stehen in EUR.
 * Ein fester, datierter Kurs pro Zeitscheibe hält alte Monatsberichte stabil —
 * ein Live-Kurs würde sie bei jedem Seitenaufruf leicht verändern.
 */
export type KursZeile = { gueltigAb: string; kurs: number; quelle: string; geprueftAm: string };

export const USD_EUR: KursZeile[] = [
  {
    gueltigAb: "2025-01-01",
    kurs: 0.8664,
    quelle: "https://api.frankfurter.dev/v1/latest?from=USD&to=EUR",
    geprueftAm: "2026-08-06",
  },
];
