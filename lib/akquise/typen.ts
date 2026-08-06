/**
 * Gemeinsame Typen der Akquise-Pipeline.
 *
 * Diese Datei ist der Vertrag zwischen sweep → leads → auswertung → gate.
 * Vorher casteten alle drei Skripte das Ergebnis von `JSON.parse` frei Hand,
 * was bei fehlenden Feldern zu Laufzeitfehlern führte.
 */

/** Ergebnis des Groundings: welche Quellen hat das Modell tatsächlich bekommen? */
export type Grounding = {
  ok: boolean;
  /** Fehlermeldung, falls der SERP-Abruf fehlschlug (Antwort ist dann ungegroundet). */
  fehler?: string;
  /** Die URLs, die dem Modell im Prompt vorlagen. */
  links: string[];
};

export type Kandidat = {
  host: string;
  nennungen: number;
  prompts: string[];
  titel: string;
};

export type ProtokollEintrag = {
  prompt: string;
  antwort: string;
  quellen: string[];
  /** Optional: fehlt in Sweeps, die vor der Grounding-Erweiterung entstanden. */
  grounding?: Grounding;
};

export type SweepDatei = {
  branche: string;
  region: string;
  datum: string;
  prompts: string[];
  kandidaten: Kandidat[];
  protokoll: ProtokollEintrag[];
};

export type MarktTreffer = {
  host: string;
  titel: string;
  positionen: number[];
};

export type LeadsDatei = {
  branche: string;
  region: string;
  datum: string;
  /** Die Google-Suchbegriffe — Voraussetzung für R2 (Prompt/Markt-Mismatch). */
  suchen: string[];
  marktGroesse: number;
  leads: MarktTreffer[];
  sichtbar: (MarktTreffer & { nennungen: number })[];
};

export type RegelId =
  | "R0_SCHEMA"
  | "R1_MARKT_UNTERFASSUNG"
  | "R2_PROMPT_MARKT_MISMATCH"
  | "R3_PORTAL_LECKAGE"
  | "R4_ALIAS_DOMAIN"
  | "R5_SPERRLISTE"
  | "R6_KATEGORIE"
  | "R7_GROUNDING"
  | "R8_ZAHLEN"
  | "R9_WERBEWIDERSPRUCH";

export type Regelverstoss = {
  id: RegelId;
  schwere: "blocker" | "warnung";
  /** Betroffene Hosts oder Suchbegriffe — leer, wenn die Regel global gilt. */
  betroffen: string[];
  /** Deutsche Klartextmeldung, direkt im Gate-Report zitierfähig. */
  meldung: string;
};

/** Alles, was die Offline-Regeln zum Prüfen brauchen. */
export type Pruefkontext = {
  sweep: SweepDatei;
  leads: LeadsDatei;
  /** Domain → Grund. Aus leads-tracker.md geparst. */
  sperrliste: Map<string, string>;
};
