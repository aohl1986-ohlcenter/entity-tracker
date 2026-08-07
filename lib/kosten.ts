// Kostenrechnung für API-Aufrufe — reine Funktionen.
//
// Bewusst OHNE DB- und env-Zugriff: die Preistabelle wird als Argument
// hereingereicht (Default ist die gepflegte Tabelle aus data/preise-llm.ts),
// damit eval/kosten.test.ts gegen eine feste Fixture-Tabelle prüfen kann und
// nicht bricht, sobald echte Preise gepflegt werden.
//
// Einheit ist durchgehend NANO-USD (1e-9 USD) als Integer — siehe Kommentar
// bei den llm_*-Tabellen in lib/schema.ts.

import { PREISE, USD_EUR, type PreisZeile, type KursZeile } from "../data/preise-llm";

export const NANO = 1_000_000_000;

/** Wie ein Betrag zustande kam. "unbekannt" heißt NICHT "kostenlos". */
export type CostModell = "token" | "call" | "unbekannt";

export type Kosten = {
  costNanoUsd: number;
  costModell: CostModell;
  /** `gueltigAb` der angewandten Preiszeile; null, wenn keine gefunden wurde. */
  preisStand: string | null;
};

/**
 * Findet die zum Zeitpunkt gültige Preiszeile.
 *
 * Regeln:
 * - Nur Zeilen mit `gueltigAb <= datum` — eine künftige Preisänderung darf
 *   heutige Läufe nicht beeinflussen.
 * - Von diesen die jüngste.
 * - Ein Treffer auf das konkrete Modell schlägt den engine-weiten Fallback
 *   (`modell: null`), auch wenn der Fallback jünger ist.
 */
export function findePreis(
  engine: string,
  modell: string | null,
  datum: string,
  preise: PreisZeile[] = PREISE,
): PreisZeile | null {
  const gueltig = preise.filter((p) => p.engine === engine && p.gueltigAb <= datum);
  const jüngste = (kandidaten: PreisZeile[]): PreisZeile | null =>
    kandidaten.reduce<PreisZeile | null>(
      (best, p) => (best === null || p.gueltigAb > best.gueltigAb ? p : best),
      null,
    );

  if (modell !== null) {
    const exakt = jüngste(gueltig.filter((p) => p.modell === modell));
    if (exakt) return exakt;
  }
  return jüngste(gueltig.filter((p) => p.modell === null));
}

export type KostenEingabe = {
  engine: string;
  modell: string | null;
  /** YYYY-MM-DD des Aufrufs — bestimmt, welche Preiszeile greift. */
  datum: string;
  tokensIn: number | null;
  tokensOut: number | null;
  /** Anzahl Aufrufe für den Call-Modus. Default 1. */
  calls?: number;
};

/**
 * Rechnet einen Aufruf in Nano-USD um.
 *
 * Ist kein Preis hinterlegt, oder fehlen im Token-Modus die Token-Zahlen
 * (Brave/Serper liefern keine), ist das Ergebnis `costModell: "unbekannt"` mit
 * Betrag 0. Es wird bewusst NICHT geschätzt — die Auswertung weist solche
 * Aufrufe getrennt als "nicht bezifferbar" aus, statt eine erfundene Zahl in
 * die Marge zu rechnen.
 */
export function berechneKosten(
  eingabe: KostenEingabe,
  preise: PreisZeile[] = PREISE,
): Kosten {
  const { engine, modell, datum, tokensIn, tokensOut } = eingabe;
  const calls = eingabe.calls ?? 1;
  const preis = findePreis(engine, modell, datum, preise);

  if (!preis) return { costNanoUsd: 0, costModell: "unbekannt", preisStand: null };

  if (preis.modus === "call") {
    const proCall = preis.proCallUsd ?? 0;
    return {
      costNanoUsd: Math.round(proCall * NANO * calls),
      costModell: "call",
      preisStand: preis.gueltigAb,
    };
  }

  // Token-Modus: ohne Token-Zahlen keine Rechnung.
  if (tokensIn === null && tokensOut === null) {
    return { costNanoUsd: 0, costModell: "unbekannt", preisStand: preis.gueltigAb };
  }

  const proMio = (n: number | null, satz: number | undefined) =>
    ((n ?? 0) / 1_000_000) * (satz ?? 0) * NANO;

  const roh = proMio(tokensIn, preis.inputProMioUsd) + proMio(tokensOut, preis.outputProMioUsd);
  return {
    costNanoUsd: Math.round(roh),
    costModell: "token",
    preisStand: preis.gueltigAb,
  };
}

/** Zum Zeitpunkt gültiger USD→EUR-Kurs; null, wenn für das Datum keiner hinterlegt ist. */
export function findeKurs(datum: string, kurse: KursZeile[] = USD_EUR): KursZeile | null {
  return kurse
    .filter((k) => k.gueltigAb <= datum)
    .reduce<KursZeile | null>(
      (best, k) => (best === null || k.gueltigAb > best.gueltigAb ? k : best),
      null,
    );
}

/** Nano-USD → EUR (als Fließkommazahl zur Anzeige). null, wenn kein Kurs greift. */
export function usdNachEur(
  costNanoUsd: number,
  datum: string,
  kurse: KursZeile[] = USD_EUR,
): number | null {
  const kurs = findeKurs(datum, kurse);
  if (!kurs) return null;
  return (costNanoUsd / NANO) * kurs.kurs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdichtung
// ─────────────────────────────────────────────────────────────────────────────

export type VerdichtbareZeile = {
  entityId: number;
  month: string;
  engine: string;
  model: string | null;
  ok: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costNanoUsd: number;
  costModell: CostModell;
};

export type Verdichtet = {
  month: string;
  entityId: number;
  engine: string;
  /** "" statt null — passt auf den Unique-Index von llm_cost_monthly. */
  model: string;
  calls: number;
  failures: number;
  tokensIn: number;
  tokensOut: number;
  costNanoUsd: number;
  unbekannteKosten: number;
};

/**
 * Fasst Einzelvorgänge zu Monatszeilen zusammen — dieselbe Rechnung, die der
 * Rollup-Upsert und scripts/rebuild-cost-rollup.ts anwenden, hier als reine
 * Funktion, damit sie ohne DB testbar ist.
 *
 * `calls` zählt erfolgreiche Aufrufe, `failures` die gescheiterten (gleiche
 * Semantik wie api_usage). Kosten fehlgeschlagener Aufrufe werden mitgezählt:
 * ein Abbruch nach dem Token-Verbrauch kostet trotzdem Geld.
 */
export function fasseZusammen(zeilen: VerdichtbareZeile[]): Verdichtet[] {
  const map = new Map<string, Verdichtet>();
  for (const z of zeilen) {
    const model = z.model ?? "";
    const key = `${z.month}|${z.entityId}|${z.engine}|${model}`;
    let v = map.get(key);
    if (!v) {
      v = {
        month: z.month,
        entityId: z.entityId,
        engine: z.engine,
        model,
        calls: 0,
        failures: 0,
        tokensIn: 0,
        tokensOut: 0,
        costNanoUsd: 0,
        unbekannteKosten: 0,
      };
      map.set(key, v);
    }
    if (z.ok === 1) v.calls += 1;
    else v.failures += 1;
    v.tokensIn += z.tokensIn ?? 0;
    v.tokensOut += z.tokensOut ?? 0;
    v.costNanoUsd += z.costNanoUsd;
    if (z.costModell === "unbekannt") v.unbekannteKosten += 1;
  }
  return [...map.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Anzeige
// ─────────────────────────────────────────────────────────────────────────────

/** Kalendertag UTC als YYYY-MM-DD — gleiche Konvention wie lib/usage.ts. */
export function tagUtc(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Monat UTC als YYYY-MM. */
export function monatUtc(d: Date = new Date()): string {
  return d.toISOString().slice(0, 7);
}

/** Die letzten n Monate absteigend, beginnend beim aktuellen. */
export function letzteMonate(n: number, jetzt: Date = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), 1));
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

export function formatiereEur(betrag: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: betrag !== 0 && Math.abs(betrag) < 0.01 ? 4 : 2,
  }).format(betrag);
}

export function formatiereUsdAusNano(costNanoUsd: number): string {
  const usd = costNanoUsd / NANO;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: usd !== 0 && Math.abs(usd) < 0.01 ? 4 : 2,
  }).format(usd);
}
