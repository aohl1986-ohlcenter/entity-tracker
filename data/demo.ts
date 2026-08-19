/**
 * Demo-Entity für eine frische Datenbank.
 *
 * Frei erfunden — echte Kunden werden im Admin (`/admin`) angelegt, nicht hier.
 * Der Zweck dieser Datei ist zu zeigen, wie ein Keyword-Set und die
 * Ziel-URL-Klassifikation für eine Personen-Entity aussehen; die Kommentare
 * erklären die Muster, weil genau dort die Fallstricke liegen.
 */
import type { SeedKeyword, SeedTarget } from "./types";

export const ENTITY = {
  slug: "demo-entity",
  name: "Dana Beispiel",
};

export const KEYWORDS: SeedKeyword[] = [
  // 1) Reiner Name — misst die Kontrolle über die eigene Namenssuche.
  { query: "Dana Beispiel", cluster: "name" },
  { query: '"Dana Beispiel"', cluster: "name" },
  { query: "Dana Beispiel LinkedIn", cluster: "name" },

  // 2) Name + Fachgebiet — misst, ob die Person mit ihrem Thema verknüpft wird.
  { query: "Dana Beispiel Kreislaufwirtschaft", cluster: "name_topic" },
  { query: "Dana Beispiel Lieferketten", cluster: "name_topic" },
  { query: "Dana Beispiel Vortrag", cluster: "name_topic" },

  // 3) Fachthemen ohne Namen — misst Topic-Authority: Wird die Person auch
  //    gefunden, wenn niemand nach ihr sucht? Das ist der eigentliche Test.
  { query: "Kreislaufwirtschaft Studie Deutschland", cluster: "topic" },
  { query: "Lieferkettengesetz Auswirkungen Mittelstand", cluster: "topic" },
  { query: "Circular Economy Beratung DACH", cluster: "topic" },
];

export const TARGETS: SeedTarget[] = [
  // ─── OWNED (eigene Profile und Beiträge) ──────────────────────────────
  {
    // Exact-Match-Domain, stärkstes Owned-Asset für die Namenssuche.
    // Kein Glob: matcht Root und alle Unterseiten; `www.` wird in
    // normalize() gestrippt, deckt also www und Apex ab.
    pattern: "dana-beispiel.example",
    label: "Eigene Landingpage",
    category: "owned",
  },
  {
    // Führendes * deckt de.linkedin.com und www.linkedin.com ab — Google.de
    // liefert Profile meist als de.linkedin.com, sonst greift owned nicht.
    pattern: "*linkedin.com/in/dana-beispiel",
    label: "LinkedIn Profil",
    category: "owned",
  },
  {
    // Posts über die Activity-ID matchen: trifft beide Google-Formen,
    // /feed/update/urn:li:activity:<id> und /posts/<autor>_…-activity-<id>.
    pattern: "*linkedin.com/*7000000000000000001*",
    label: "LinkedIn Post (Beispiel)",
    category: "owned",
  },

  // ─── AUTHORITY (starke Fremdquellen, die die Entity stützen) ──────────
  {
    pattern: "beispiel-institut.example/publikationen/*",
    label: "Fachinstitut: Publikationen",
    category: "authority",
    topics: ["Kreislaufwirtschaft"],
  },
  {
    pattern: "fachpresse-beispiel.example/*",
    label: "Fachpresse",
    category: "authority",
    topics: ["Lieferketten"],
  },
  {
    pattern: "hochschule-beispiel.example/lehrbeauftragte/*",
    label: "Hochschule: Lehrauftrag",
    category: "authority",
  },

  // ─── DISPLACEMENT (belegt den Platz, den die Entity haben sollte) ─────
  // Zwei typische Fälle: Personenverzeichnisse ohne Eigeninhalt und
  // Namensvettern, die für dieselbe Suche ranken.
  { pattern: "personenverzeichnis-beispiel.example/*", label: "Personenverzeichnis", category: "displacement" },
  { pattern: "branchenbuch-beispiel.example/*", label: "Branchenbuch", category: "displacement" },
  { pattern: "*linkedin.com/in/dana-beispiel-namensvetter", label: "Namensvetter (anderes Profil)", category: "displacement" },
];

export const AI_CITATION_PROMPTS: { engine: "gemini"; query: string; topic: string }[] = [
  {
    engine: "gemini",
    topic: "Kreislaufwirtschaft",
    query:
      "Wer sind die führenden Beraterinnen und Analysten zum Thema Kreislaufwirtschaft in Deutschland? Bitte mit Quellen.",
  },
  {
    engine: "gemini",
    topic: "Lieferketten",
    query:
      "Welche aktuellen Analysen gibt es zu den Auswirkungen des Lieferkettengesetzes auf den Mittelstand? Quellen bitte.",
  },
  {
    // Der direkte Personen-Prompt gehört dazu: Er zeigt, ob das Modell die
    // Entity überhaupt kennt — unabhängig davon, ob es sie im Fachkontext nennt.
    engine: "gemini",
    topic: "Person",
    query: "Wer ist Dana Beispiel und welche Fachthemen vertritt sie? Bitte mit Quellen.",
  },
];

/**
 * Wunschlinks: die konkreten Publikationen, die bei einer Namenssuche auf
 * Seite 1 stehen sollen. Die KPI misst, wie viele davon aktuell in den Top 10
 * der Namens-Keywords ranken — gleiche Glob-Logik wie bei den Targets.
 */
export const WANTED_LINKS: { label: string; pattern: string }[] = [
  { label: "Fachinstitut: Leitstudie", pattern: "beispiel-institut.example/publikationen/leitstudie" },
  { label: "Fachpresse: Interview", pattern: "fachpresse-beispiel.example/interview-dana-beispiel" },
  { label: "LinkedIn Post (Beispiel)", pattern: "*linkedin.com/*7000000000000000001*" },
];
