/**
 * Host- und Namens-Helfer der Akquise-Pipeline.
 *
 * Vorher lag `hostOf` zweimal im Code (einmal als `function`, einmal als Arrow),
 * die Slug-/Datums-Ableitung sogar dreimal.
 */

/** Zweistufige Suffixe, bei denen die registrierbare Domain drei Labels hat. */
const MEHRTEILIGE_SUFFIXE = [
  "co.uk", "org.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au",
  "co.nz", "com.br", "co.jp", "com.tr",
];

/** Extrahiert den Hostnamen aus einer URL. Leerstring bei ungültiger URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Reduziert einen Host auf die registrierbare Domain.
 *   unternehmen.focus.de → focus.de
 *   www.gelbeseiten.de   → gelbeseiten.de
 *   foo.bar.co.uk        → bar.co.uk
 *
 * Vereinfachte Public-Suffix-Logik: für den DACH-Markt (fast ausschließlich
 * einstufige TLDs) ausreichend, ohne eine PSL-Dependency einzuführen.
 */
export function registrierbareDomain(host: string): string {
  const h = host.replace(/^www\./, "").toLowerCase();
  const teile = h.split(".").filter(Boolean);
  if (teile.length <= 2) return h;

  const letzteZwei = teile.slice(-2).join(".");
  if (MEHRTEILIGE_SUFFIXE.includes(letzteZwei)) {
    return teile.slice(-3).join(".");
  }
  return letzteZwei;
}

/** Ist `host` gleich `domain` oder eine Subdomain davon? */
export function istOderUnter(host: string, domain: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  const d = domain.replace(/^www\./, "").toLowerCase();
  return h === d || h.endsWith("." + d);
}

/** Zerlegt einen Host in seine Labels: `unternehmen.focus.de` → ["unternehmen","focus","de"]. */
export function labels(host: string): string[] {
  return host.replace(/^www\./, "").toLowerCase().split(".").filter(Boolean);
}

/** Dateinamens-Slug, identisch zu dem, was die Skripte bisher inline erzeugten. */
export function slugOf(branche: string, region: string): string {
  return `${branche}-${region}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Heutiges Datum als YYYY-MM-DD. */
export function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Verzeichnis, in dem alle Akquise-Artefakte liegen. */
export function akquiseOrdner(): string {
  return `${process.env.HOME}/career-ops/akquise`;
}

/**
 * Normalisiert deutschen Text für Wortvergleiche:
 * Kleinschreibung, Umlaut-Faltung, ß→ss.
 */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}
