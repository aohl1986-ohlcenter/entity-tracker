/**
 * Sperrlisten-Parser über ~/career-ops/akquise/leads-tracker.md.
 *
 * Der Tracker ist ein von Hand gepflegtes Arbeitsdokument. Markdown als
 * Datenquelle ist brüchig — das ist bewusst in Kauf genommen: eine zweite,
 * maschinelle Datenhaltung würde vom Tracker abdriften, und ein Parser, der
 * bei Formatänderung LAUT fehlschlägt, ist sicherer als zwei Wahrheiten.
 *
 * Gelesen werden:
 *   ## Sperrliste (kein Kontakt mehr)      → harte Sperre
 *   ## Nicht angeschrieben — …             → bewusst ausgelassen, ebenfalls Sperre
 */

/** Findet Domains in einer Tabellenzelle, auch wenn Klartext drumherum steht. */
const DOMAIN_REGEX = /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})\b/gi;

export class SperrlistenFehler extends Error {}

function extrahiereDomains(zelle: string): string[] {
  const ohneMarkup = zelle.replace(/~~/g, "").replace(/\*\*/g, "").replace(/`/g, "");
  const treffer = ohneMarkup.match(DOMAIN_REGEX) ?? [];
  return treffer.map((d) => d.replace(/^www\./, "").toLowerCase());
}

/**
 * Parst den Tracker-Markdown zu einer Map Domain → Grund.
 *
 * Wirft, wenn der Sperrlisten-Abschnitt fehlt: Ein stillschweigend leeres
 * Ergebnis wäre gefährlicher als ein Abbruch, weil der Gate dann alles
 * durchwinkt.
 */
export function parseSperrliste(markdown: string): Map<string, string> {
  const zeilen = markdown.split("\n");
  const gesperrt = new Map<string, string>();

  let sperrlisteGesehen = false;
  let inAbschnitt = false;
  let abschnittsName = "";

  for (const zeile of zeilen) {
    const ueberschrift = zeile.match(/^##\s+(.*)$/);
    if (ueberschrift) {
      const titel = ueberschrift[1].trim();
      const istSperrliste = /^Sperrliste/i.test(titel);
      const istNichtAngeschrieben = /^Nicht angeschrieben/i.test(titel);
      if (istSperrliste) sperrlisteGesehen = true;
      inAbschnitt = istSperrliste || istNichtAngeschrieben;
      abschnittsName = titel;
      continue;
    }
    if (!inAbschnitt) continue;

    // Tabellenzeile? (Kopf- und Trennzeilen überspringen)
    if (!zeile.trimStart().startsWith("|")) continue;
    const zellen = zeile.split("|").map((z) => z.trim());
    if (zellen.length < 3) continue;
    const erste = zellen[1] ?? "";
    if (/^-+$/.test(erste.replace(/:/g, "")) || /^domain$/i.test(erste)) continue;

    const grund = (zellen[2] ?? "").replace(/\*\*/g, "").trim() || abschnittsName;
    for (const domain of extrahiereDomains(erste)) {
      if (!gesperrt.has(domain)) gesperrt.set(domain, grund);
    }
  }

  if (!sperrlisteGesehen) {
    throw new SperrlistenFehler(
      'Abschnitt "## Sperrliste" im Tracker nicht gefunden — Format geändert? ' +
        "Der Gate bricht bewusst ab, statt ohne Sperrliste weiterzulaufen.",
    );
  }

  return gesperrt;
}
