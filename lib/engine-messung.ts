// Messwerte, die jeder Engine-Wrapper zusätzlich zu seinem Ergebnis zurückgibt.
//
// Diese Datei enthält ABSICHTLICH nur Typen und keine Importe. Die Engine-
// Wrapper werden auch von lib/akquise-lauf/* benutzt, das die Produktions-DB
// niemals berühren darf (zugesichert durch eval/isolation.test.ts). Deshalb
// messen die Wrapper nur und schreiben nichts — persistiert wird ausschließlich
// in lib/jobs.ts über lib/tracing.ts.

/** Woher die Token-Zahlen stammen. "nicht_verfuegbar" heißt: die API liefert keine. */
export type TokenQuelle = "api" | "nicht_verfuegbar";

export type Verbrauch = {
  /** null = von der API nicht geliefert. Wird nirgends geschätzt. */
  tokensIn: number | null;
  tokensOut: number | null;
  quelle: TokenQuelle;
};

export type Messung = {
  /** Das tatsächlich benutzte Modell; null bei reinen Such-APIs. */
  modell: string | null;
  verbrauch: Verbrauch;
  /** Wanduhr-Dauer des Aufrufs inklusive Retries. */
  dauerMs: number;
};

/** Für Such-APIs, die keine Token-Zahlen kennen (Serper, Tavily, Brave). */
export const OHNE_TOKENS: Verbrauch = {
  tokensIn: null,
  tokensOut: null,
  quelle: "nicht_verfuegbar",
};

/** Liest eine Zahl defensiv aus einer unbekannten API-Antwort; sonst null. */
export function zahlOderNull(wert: unknown): number | null {
  return typeof wert === "number" && Number.isFinite(wert) ? wert : null;
}
