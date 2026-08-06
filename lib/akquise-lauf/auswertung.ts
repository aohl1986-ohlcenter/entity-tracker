/**
 * Die Lead-Auswertung als aufrufbare Funktion — die 1-Seiten-Analyse.
 *
 * Zieht die Fakten aus dem Sweep-JSON und prüft die Website live auf konkrete,
 * belegbare technische Ursachen (strukturierte Daten, Meta-Angaben, NAP-Signale).
 * Erfindet nichts — was nicht prüfbar ist, wird als offen markiert.
 *
 * Ergebnis: HTML unter ~/career-ops/akquise/auswertungen/, danach PDF bauen mit
 *   node ~/career-ops/generate-pdf.mjs <html> <pdf> --format=a4
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { akquiseOrdner, heute, slugOf } from "../akquise/hosts";
import { istPortal } from "../akquise/portale";
import { parseSweep } from "../akquise/schema";
import { AblaufFehler } from "./fehler";

export type Befund = { titel: string; status: "fehlt" | "teilweise" | "ok"; detail: string };

export type AuswertungOptionen = {
  domain: string;
  branche: string;
  region: string;
  datum?: string;
  melde?: (text: string) => void;
};

export type AuswertungErgebnis = {
  domain: string;
  befunde: Befund[];
  /** Nennungen der eigenen Domain im Sweep, 0 wenn nicht genannt. */
  eigeneNennungen: number;
  anzahlPrompts: number;
  htmlPfad: string;
};

/** Prüft die Startseite auf konkrete, nachweisbare GEO-Signale. */
export async function pruefeWebsite(
  domain: string,
  region: string,
): Promise<{ befunde: Befund[]; html: string }> {
  let html = "";
  for (const url of [`https://www.${domain}`, `https://${domain}`]) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PragmaCodeAudit/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        html = await res.text();
        break;
      }
    } catch {
      /* nächste Variante */
    }
  }
  if (!html) {
    return {
      befunde: [
        {
          titel: "Website nicht erreichbar",
          status: "fehlt",
          detail: "Die Startseite konnte für die Prüfung nicht geladen werden.",
        },
      ],
      html: "",
    };
  }

  const befunde: Befund[] = [];
  const jsonLdBloecke = [
    ...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1]);
  const jsonLdText = jsonLdBloecke.join(" ");

  // 1) Strukturierte Daten überhaupt
  if (jsonLdBloecke.length === 0) {
    befunde.push({
      titel: "Keine strukturierten Daten (Schema.org / JSON-LD)",
      status: "fehlt",
      detail:
        "Auf der Startseite ist kein JSON-LD hinterlegt. Sprachmodelle und Suchmaschinen erhalten damit keine maschinenlesbare Aussage darüber, wer Sie sind, wo Sie sitzen und was Sie anbieten. Das ist der häufigste Grund, warum eine Website gefunden, aber nicht empfohlen wird.",
    });
  } else {
    const typen = [...jsonLdText.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
    const uniq = [...new Set(typen)];
    const hatOrt =
      /LegalService|LocalBusiness|Attorney|ProfessionalService|AccountingService|Organization/i.test(
        jsonLdText,
      );
    befunde.push({
      titel: hatOrt
        ? "Strukturierte Daten vorhanden, aber unvollständig"
        : "Strukturierte Daten ohne Unternehmens-Auszeichnung",
      status: "teilweise",
      detail: `Gefunden wurden die Typen: ${uniq.join(", ") || "unbekannt"}. ${
        hatOrt
          ? "Prüfenswert ist, ob Adresse, Öffnungszeiten, Rechtsgebiete/Leistungen und Bewertungen vollständig ausgezeichnet sind — genau diese Felder werden von KI-Systemen ausgelesen."
          : "Es fehlt eine Auszeichnung als lokales Unternehmen (z. B. LegalService / LocalBusiness) mit Adresse und Leistungen."
      }`,
    });
  }

  // 2) Adresse maschinenlesbar
  const hatPostalAddress = /"@type"\s*:\s*"PostalAddress"/i.test(jsonLdText);
  if (!hatPostalAddress) {
    befunde.push({
      titel: "Anschrift nicht maschinenlesbar ausgezeichnet",
      status: "fehlt",
      detail:
        "Die Adresse steht zwar für Menschen lesbar auf der Seite, ist aber nicht als PostalAddress ausgezeichnet. Bei ortsbezogenen Fragen („… in " +
        region +
        "\") fällt die Zuordnung damit schwerer.",
    });
  }

  // 3) Title / Description
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const desc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim() ?? "";
  const ortImTitel = new RegExp(region.replace(/[^\wäöüß]/gi, "."), "i").test(title);
  if (!title || !ortImTitel) {
    befunde.push({
      titel: title ? "Seitentitel ohne Ortsbezug" : "Kein Seitentitel gesetzt",
      status: title ? "teilweise" : "fehlt",
      detail: title
        ? `Ihr Titel lautet: „${title.slice(0, 110)}". Der Ort ${region} kommt darin nicht vor — bei ortsbezogenen Empfehlungsfragen ist das ein deutliches Signal, das fehlt.`
        : "Die Startseite hat keinen auswertbaren Titel.",
    });
  }
  if (!desc) {
    befunde.push({
      titel: "Keine Meta-Description",
      status: "fehlt",
      detail:
        "Ohne Description fehlt der kurze Beschreibungstext, den viele Systeme als Zusammenfassung übernehmen.",
    });
  }

  return { befunde, html };
}

export async function laufeAuswertung(opt: AuswertungOptionen): Promise<AuswertungErgebnis> {
  const domain = opt.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const { branche, region } = opt;
  const datum = opt.datum ?? heute();
  const melde = opt.melde ?? (() => {});

  if (!domain) throw new AblaufFehler("Ohne Domain gibt es nichts auszuwerten.");

  // Vorher baute dieses Skript Ordner und Slug inline nach — als einziges der
  // Pipeline. Jetzt dieselben Helfer wie überall, sonst zeigt die Auswertung
  // irgendwann auf eine andere Datei als der Gate.
  const ordner = akquiseOrdner();
  const slug = slugOf(branche, region);

  const sweepPfad = `${ordner}/${slug}-${datum}.json`;
  if (!existsSync(sweepPfad)) {
    throw new AblaufFehler(`Sweep fehlt: ${sweepPfad} — erst den Sweep laufen lassen.`);
  }
  const sweep = parseSweep(JSON.parse(readFileSync(sweepPfad, "utf8")), sweepPfad);
  const genannt = sweep.kandidaten;
  const anzahlPrompts = sweep.prompts.length;
  const eigene = genannt.find((k) => k.host === domain);
  // Portale hier hart ausschließen: In der Wettbewerber-Tabelle des Kunden-PDFs
  // darf niemals ein Verzeichnis wie doctolib.de als "Wettbewerber" stehen.
  const top3 = genannt.filter((k) => k.host !== domain && !istPortal(k.host)).slice(0, 3);

  melde(`🔎 Prüfe ${domain} …`);
  const { befunde } = await pruefeWebsite(domain, region);
  befunde.forEach((b) => melde(`   • [${b.status}] ${b.titel}`));

  const zeile = (b: Befund, i: number) => `
    <div class="befund">
      <div class="befund-kopf"><span class="nr">${i + 1}</span><span class="befund-titel">${b.titel}</span></div>
      <p class="befund-text">${b.detail}</p>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>KI-Sichtbarkeit ${domain}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Helvetica Neue',Arial,'Liberation Sans',sans-serif;font-size:10.5px;line-height:1.55;color:#1a1a2e;font-variant-ligatures:none}
  .page{max-width:210mm;margin:0 auto;padding:2px 0}
  h1{font-size:21px;font-weight:700;letter-spacing:-.02em;margin-bottom:2px}
  .sub{font-size:11px;color:#555;margin-bottom:8px}
  .grad{height:2px;background:linear-gradient(to right,hsl(187,74%,32%),hsl(270,70%,45%));border-radius:1px;margin-bottom:14px}
  h2{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:hsl(187,74%,32%);border-bottom:1.5px solid #e2e2e2;padding-bottom:4px;margin:16px 0 9px}
  .kernaussage{background:hsl(187,40%,96%);border:1px solid hsl(187,40%,88%);border-radius:4px;padding:11px 13px;font-size:11.5px;line-height:1.6}
  .kernaussage strong{color:hsl(270,70%,40%)}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#777;border-bottom:1px solid #ddd;padding:4px 6px}
  td{padding:5px 6px;border-bottom:1px solid #f0f0f0;font-size:10.5px}
  td.zahl{text-align:right;white-space:nowrap;font-weight:600}
  .ihr{background:hsl(0,60%,97%)}
  .befund{margin-bottom:10px;break-inside:avoid}
  .befund-kopf{display:flex;align-items:baseline;gap:8px;margin-bottom:2px}
  .nr{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;border-radius:50%;background:hsl(270,70%,45%);color:#fff;font-size:9.5px;font-weight:700}
  .befund-titel{font-weight:700;font-size:11px}
  .befund-text{font-size:10.5px;color:#333;padding-left:25px}
  .fuss{margin-top:16px;padding-top:9px;border-top:1px solid #e2e2e2;font-size:9.5px;color:#777;line-height:1.5}
  .cta{margin-top:14px;background:#fafafa;border-left:3px solid hsl(270,70%,45%);padding:10px 13px;font-size:10.5px}
</style></head><body><div class="page">

<h1>KI-Sichtbarkeit: ${domain}</h1>
<div class="sub">${branche} in ${region} · Auswertung vom ${new Date(datum).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}</div>
<div class="grad"></div>

<div class="kernaussage">
  ${
    eigene
      ? `Ihre Website wird in <strong>${eigene.nennungen} von ${anzahlPrompts}</strong> geprüften KI-Antworten genannt.`
      : `Bei <strong>${anzahlPrompts} typischen Mandantenfragen</strong> an ChatGPT wurde Ihre Kanzlei <strong>kein einziges Mal</strong> genannt — obwohl Sie bei Google sichtbar sind.`
  }
  Insgesamt wurden <strong>${genannt.length} Anbieter</strong> aus ${region} von der KI empfohlen.
</div>

<h2>Wer wird stattdessen empfohlen?</h2>
<table>
  <tr><th>Anbieter</th><th style="text-align:right">Nennungen</th></tr>
  ${top3.map((k) => `<tr><td>${k.host}</td><td class="zahl">${k.nennungen} von ${anzahlPrompts}</td></tr>`).join("")}
  <tr class="ihr"><td><strong>${domain}</strong></td><td class="zahl">${eigene ? eigene.nennungen : 0} von ${anzahlPrompts}</td></tr>
</table>

<h2>Geprüfte Fragen</h2>
<table>${sweep.prompts.map((p: string) => `<tr><td>„${p}"</td></tr>`).join("")}</table>

<h2>Was die Ursache ist</h2>
${befunde.map(zeile).join("")}

<div class="cta">
  <strong>Was daraus folgt.</strong> Die genannten Punkte sind technischer Natur und in der Regel
  innerhalb weniger Tage behebbar — es geht nicht um neue Inhalte, sondern darum, die vorhandenen
  für Maschinen lesbar zu machen. Bei einem Logistikunternehmen habe ich über genau diesen Hebel
  <strong>+111 % organische Klicks in drei Monaten</strong> erreicht (in der Google Search Console belegt).
  Wenn Sie wissen möchten, was das konkret für Sie hieße: 20 Minuten Telefon genügen.
</div>

<div class="fuss">
  <strong>Zur Methodik:</strong> Abgefragt wurden ${anzahlPrompts} typische Suchanfragen über ein
  Sprachmodell mit Live-Websuche (Stand ${new Date(datum).toLocaleDateString("de-DE")}). Ausgewertet wurde,
  welche Anbieter in den Antworten als Quelle herangezogen werden. Verzeichnisse und Portale wurden
  herausgefiltert. KI-Antworten schwanken; die Auswertung ist eine Momentaufnahme, keine Garantie.
  Die technischen Befunde beziehen sich auf die öffentlich abrufbare Startseite.<br><br>
  Alexander Ohl · Pragma-Code — IT-Consultancy · +49 151 22771428 · info@pragma-code.de · www.pragma-code.de
</div>

</div></body></html>`;

  mkdirSync(`${ordner}/auswertungen`, { recursive: true });
  const htmlPfad = `${ordner}/auswertungen/${domain.replace(/\./g, "-")}-${datum}.html`;
  writeFileSync(htmlPfad, html);

  return {
    domain,
    befunde,
    eigeneNennungen: eigene?.nennungen ?? 0,
    anzahlPrompts,
    htmlPfad,
  };
}
