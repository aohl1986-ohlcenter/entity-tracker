/**
 * Portal-Erkennung — die einzige Fassung in der Codebase.
 *
 * Vorher: zwei divergierende Listen (sweep 26 / leads 43 Einträge) und ein
 * Substring-Match `host.includes(p)`, der z. B. `kammermeier-steuer.de` über den
 * Eintrag "kammer" fälschlich als Portal aussortierte.
 */
import rohdaten from "./portale.json";
import { istOderUnter, labels } from "./hosts";

export type PortalRegel =
  | { art: "suffix"; wert: string }
  | { art: "label"; wert: string };

function ladeRegeln(): PortalRegel[] {
  const roh = (rohdaten as { regeln: unknown[] }).regeln;
  const regeln: PortalRegel[] = [];
  for (const eintrag of roh) {
    if (!eintrag || typeof eintrag !== "object") continue;
    const e = eintrag as Record<string, unknown>;
    // Gruppen-Kommentare (`_gruppe`) übersprigen
    if (typeof e.art !== "string" || typeof e.wert !== "string") continue;
    if (e.art !== "suffix" && e.art !== "label") {
      throw new Error(`portale.json: unbekannte Regelart "${e.art}"`);
    }
    regeln.push({ art: e.art, wert: e.wert.toLowerCase() });
  }
  return regeln;
}

export const PORTAL_REGELN: PortalRegel[] = ladeRegeln();

/**
 * Ist dieser Host ein Verzeichnis/Portal — also kein anschreibbarer Betrieb?
 *
 * `suffix` matcht die Domain selbst und alle Subdomains.
 * `label` matcht nur ein vollständiges Host-Label, nie einen Substring.
 */
export function istPortal(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  if (!h) return false;

  for (const regel of PORTAL_REGELN) {
    if (regel.art === "suffix") {
      if (istOderUnter(h, regel.wert)) return true;
    } else {
      if (labels(h).includes(regel.wert)) return true;
    }
  }
  return false;
}

/** Welche Regel hat gegriffen? Für erklärbare Gate-Meldungen. */
export function portalGrund(host: string): string | null {
  const h = host.replace(/^www\./, "").toLowerCase();
  for (const regel of PORTAL_REGELN) {
    const treffer =
      regel.art === "suffix" ? istOderUnter(h, regel.wert) : labels(h).includes(regel.wert);
    if (treffer) return `${regel.art}:${regel.wert}`;
  }
  return null;
}
