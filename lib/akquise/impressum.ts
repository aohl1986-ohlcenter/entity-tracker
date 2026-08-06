/**
 * Impressum-Prüfung: Untersagt der Betrieb ausdrücklich Werbe-E-Mails?
 *
 * Der Anlass war ein realer Fall: ein Betrieb verbietet unaufgeforderte
 * Werbemails im Impressum. Wer trotzdem schreibt, riskiert eine Abmahnung.
 * In Fixtures und Tests steht dafür die erfundene zahnarztpraxis-beispiel.example
 * — der echte Betrieb wird hier bewusst nicht benannt.
 *
 * FAIL-CLOSED: Ist das Impressum nicht ladbar, gilt das als Blocker. Der
 * Schaden ist asymmetrisch — Abmahnung gegen einen Lead weniger.
 *
 * Antworten werden gecacht: Ein einmal gesehener Netzfall wird damit zu einem
 * Offline-Fall und ist danach ohne erneuten Zugriff prüfbar.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Regelverstoss } from "./typen";

const PFADE = ["/impressum", "/imprint", "/kontakt", "/impressum.html", "/datenschutz"];
const UA = "PragmaCodeAudit/1.0 (+https://www.pragma-code.de)";

/** Phrasen, die einen Werbewiderspruch anzeigen. Auf normalisiertem Text geprüft. */
const WIDERSPRUCH_PHRASEN = [
  // Die Standardformel steht im Passiv — ohne sie hing die Erkennung an Zufall
  "hiermit widersprochen",
  "wird widersprochen",
  "widersprechen wir hiermit",
  "widerspricht hiermit",
  "widerspruch gegen die verwendung",
  "unaufgeforderte zusendung",
  "unaufgefordert zugesandter werb",
  "unverlangt zugesandter werb",
  "nicht angeforderten werbe",
  "werbe-e-mails",
  "werbemails",
  "spam-mails",
  "nicht erwuenscht ist die zusendung",
];

/** Zusätzliche Bedingung: mindestens ein Werbe-Bezug muss vorkommen. */
const WERBE_BEZUG = ["werbung", "werbe", "spam"];

function normalisiereText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ");
}

/**
 * Cache-Ort. Standard bewusst AUSSERHALB des Repos: Es wäre fremdes,
 * urheberrechtlich geschütztes HTML von Dritten, das nichts in der
 * Versionskontrolle verloren hat. Für Testfixtures per Env umstellbar.
 */
function cachePfad(host: string): string {
  const basis =
    process.env.AKQUISE_IMPRESSUM_CACHE ?? `${process.env.HOME}/career-ops/akquise/.impressum-cache`;
  return `${basis}/${host.replace(/[^a-z0-9.-]/gi, "_")}.html`;
}

async function hole(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Lädt das Impressum — aus dem Cache, sonst aus dem Netz (und cacht dann). */
export async function ladeImpressum(host: string): Promise<string | null> {
  const cache = cachePfad(host);
  if (existsSync(cache)) return readFileSync(cache, "utf8");

  for (const praefix of [`https://www.${host}`, `https://${host}`]) {
    for (const pfad of PFADE) {
      const html = await hole(`${praefix}${pfad}`);
      if (html && html.length > 200) {
        mkdirSync(dirname(cache), { recursive: true });
        writeFileSync(cache, html);
        return html;
      }
    }
  }
  return null;
}

export function enthaeltWerbewiderspruch(html: string): boolean {
  const text = normalisiereText(html);
  if (!WERBE_BEZUG.some((w) => text.includes(w))) return false;
  return WIDERSPRUCH_PHRASEN.some((p) => text.includes(p));
}

export async function pruefeWerbewiderspruch(
  host: string,
): Promise<{ verstoss: Regelverstoss | null }> {
  const html = await ladeImpressum(host);

  if (html === null) {
    return {
      verstoss: {
        id: "R9_WERBEWIDERSPRUCH",
        schwere: "blocker",
        betroffen: [host],
        meldung:
          `Impressum von ${host} nicht abrufbar — ein Werbewiderspruch ist damit nicht ausschließbar. ` +
          `Bewusst fail-closed: lieber ein Lead weniger als eine Abmahnung.`,
      },
    };
  }

  if (enthaeltWerbewiderspruch(html)) {
    return {
      verstoss: {
        id: "R9_WERBEWIDERSPRUCH",
        schwere: "blocker",
        betroffen: [host],
        meldung: `${host} untersagt im Impressum ausdrücklich unaufgeforderte Werbe-E-Mails. Nicht anschreiben, in die Sperrliste eintragen.`,
      },
    };
  }

  return { verstoss: null };
}
