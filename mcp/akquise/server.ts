/**
 * akquise-mcp — die Akquise-Pipeline als MCP-Server.
 *
 * Exponiert die vorhandenen Funktionen aus lib/akquise/ und lib/akquise-lauf/
 * als Tools. Hier steht bewusst keine Fachlogik: was der Server entscheidet,
 * entscheidet auch die CLI, und beides ist unter eval/ getestet.
 *
 * Der Import von `umgebung` steht zuerst und ist nicht optional — er räumt die
 * Prozessumgebung auf, bevor irgendein Modul sie lesen kann.
 */
import { UMGEBUNG, pruefeUmgebung } from "./umgebung";
import { existsSync, statSync } from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { akquiseOrdner, heute, slugOf } from "../../lib/akquise/hosts";
import { laufeSweep } from "../../lib/akquise-lauf/sweep";
import { laufeLeads } from "../../lib/akquise-lauf/leads";
import { laufeGate } from "../../lib/akquise-lauf/gate";
import { laufeAuswertung } from "../../lib/akquise-lauf/auswertung";
import { AblaufFehler } from "../../lib/akquise-lauf/fehler";
import { SchemaFehler } from "../../lib/akquise/schema";
import type { Regelverstoss } from "../../lib/akquise/typen";

type ToolAntwort = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function text(inhalt: string, strukturiert?: Record<string, unknown>): ToolAntwort {
  return { content: [{ type: "text", text: inhalt }], structuredContent: strukturiert };
}

function fehler(inhalt: string): ToolAntwort {
  return { content: [{ type: "text", text: inhalt }], isError: true };
}

/**
 * Einheitliche Fehlerbehandlung: erwartete Fehler (fehlende Artefakte, kaputte
 * Schemata, fehlende Keys) werden als lesbare Tool-Fehler zurückgegeben, nicht
 * als Absturz des Servers.
 */
async function bewache(arbeit: () => Promise<ToolAntwort>): Promise<ToolAntwort> {
  try {
    pruefeUmgebung();
    return await arbeit();
  } catch (e) {
    if (e instanceof AblaufFehler) return fehler(`❌ ${e.message}`);
    if (e instanceof SchemaFehler) return fehler(`❌ Schema-Fehler — ${e.message}`);
    return fehler(`❌ ${(e as Error).message}`);
  }
}

function listeVerstoesse(verstoesse: Regelverstoss[]): string {
  return verstoesse
    .map((v) => {
      const betroffen =
        v.betroffen.length > 0
          ? `\n     Betroffen: ${v.betroffen.slice(0, 12).join(", ")}${v.betroffen.length > 12 ? " …" : ""}`
          : "";
      return `  [${v.id}] ${v.meldung}${betroffen}`;
    })
    .join("\n");
}

const server = new McpServer({ name: "akquise-mcp", version: "0.1.0" });

// ----------------------------------------------------------------- Status
server.registerTool(
  "akquise_status",
  {
    title: "Akquise-Status",
    description:
      "Zeigt, welche Artefakte für Branche + Region + Datum bereits vorliegen (Sweep, Leads, Gate-Report, Sperrlisten-Tracker) und wie alt sie sind. Liest nur, ruft nichts im Netz ab. Gut als erster Schritt, um zu sehen, welcher Pipeline-Schritt als nächstes dran ist.",
    inputSchema: {
      branche: z.string().describe("z. B. „Steuerberater\""),
      region: z.string().describe("z. B. „Musterstadt\""),
      datum: z.string().optional().describe("YYYY-MM-DD, Vorgabe: heute"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ branche, region, datum }) =>
    bewache(async () => {
      const tag = datum ?? heute();
      const ordner = akquiseOrdner();
      const slug = slugOf(branche, region);

      const dateien: Record<string, string> = {
        sweep: `${ordner}/${slug}-${tag}.json`,
        leads: `${ordner}/${slug}-leads-${tag}.json`,
        gate: `${ordner}/${slug}-gate-${tag}.json`,
        tracker: `${ordner}/leads-tracker.md`,
      };

      const stand: Record<string, { vorhanden: boolean; geaendert?: string }> = {};
      const zeilen: string[] = [`📁 ${branche} in ${region} (${tag})`, ""];
      for (const [name, pfad] of Object.entries(dateien)) {
        const da = existsSync(pfad);
        const geaendert = da ? statSync(pfad).mtime.toISOString() : undefined;
        stand[name] = { vorhanden: da, geaendert };
        zeilen.push(`   ${da ? "✓" : "—"} ${name.padEnd(8)} ${pfad}${geaendert ? `  (${geaendert})` : ""}`);
      }

      const naechster = !stand.sweep.vorhanden
        ? "akquise_sweep"
        : !stand.leads.vorhanden
          ? "akquise_leads"
          : "akquise_gate";
      zeilen.push("", `→ Nächster Schritt: ${naechster}`);
      if (!stand.tracker.vorhanden) {
        zeilen.push(
          "⚠️  Der Tracker mit der Sperrliste fehlt — ohne ihn gibt der Gate nichts frei.",
        );
      }

      return text(zeilen.join("\n"), { slug, datum: tag, stand, naechsterSchritt: naechster });
    }),
);

// ----------------------------------------------------------------- Sweep
server.registerTool(
  "akquise_sweep",
  {
    title: "Akquise-Sweep",
    description:
      "Fragt typische Kundenfragen an ein Sprachmodell mit Live-Websuche und protokolliert, welche Firmen zitiert werden. Legt Sweep-JSON + Markdown unter ~/career-ops/akquise/ ab. Braucht BEDROCK_API_KEY und SERPER_API_KEY, dauert einige Sekunden pro Prompt. Ergebnis ist eine Momentaufnahme, keine Freigabe zum Anschreiben.",
    inputSchema: {
      branche: z.string(),
      region: z.string(),
      extraPrompts: z
        .array(z.string())
        .optional()
        .describe("Zusätzliche Fragen; die vier Standardfragen laufen immer mit."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ branche, region, extraPrompts }) =>
    bewache(async () => {
      const { sweep, ungegroundet, jsonPfad, mdPfad } = await laufeSweep({
        branche,
        region,
        extraPrompts,
      });

      const zeilen = [
        `🔍 Sweep: ${branche} in ${region} (${sweep.datum})`,
        `   ${sweep.prompts.length} Prompts · ${sweep.kandidaten.length} Firmen-Domains genannt`,
        "",
        ...sweep.kandidaten
          .slice(0, 15)
          .map(
            (k, i) =>
              `   ${String(i + 1).padStart(2)}. ${k.host} — ${k.nennungen}× (${k.prompts.length}/${sweep.prompts.length} Prompts)`,
          ),
        "",
        `💾 ${jsonPfad}`,
        `   ${mdPfad}`,
      ];
      if (ungegroundet.length > 0) {
        zeilen.push(
          "",
          `⚠️  ${ungegroundet.length} Prompt(e) ohne Grounding — die Kandidaten daraus sind unsicher, der Gate meldet das als R7.`,
        );
      }

      return text(zeilen.join("\n"), {
        datum: sweep.datum,
        prompts: sweep.prompts.length,
        kandidaten: sweep.kandidaten.length,
        ungegroundet,
        jsonPfad,
      });
    }),
);

// ----------------------------------------------------------------- Leads
server.registerTool(
  "akquise_leads",
  {
    title: "Akquise-Leads",
    description:
      "Gleicht einen vorhandenen Sweep gegen den realen Markt ab (Google via Serper) und markiert, wer bei Google sichtbar, in KI-Antworten aber unsichtbar ist. Setzt einen Sweep desselben Datums voraus. Braucht SERPER_API_KEY. WICHTIG: Die Lead-Liste ist KEINE Freigabe zum Anschreiben — dafür muss akquise_gate grün sein.",
    inputSchema: {
      branche: z.string(),
      region: z.string(),
      extraSuchen: z
        .array(z.string())
        .optional()
        .describe("Zusätzliche Google-Suchen; zwei Standardsuchen laufen immer mit."),
      datum: z.string().optional().describe("YYYY-MM-DD, Vorgabe: heute"),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ branche, region, extraSuchen, datum }) =>
    bewache(async () => {
      const { leads, quote, jsonPfad, mdPfad } = await laufeLeads({
        branche,
        region,
        extraSuchen,
        datum,
      });

      const zeilen = [
        `📊 Leads: ${branche} in ${region} (${leads.datum})`,
        `   Markt: ${leads.marktGroesse} Betriebe · KI-sichtbar: ${leads.sichtbar.length}${quote === null ? "" : ` (${quote} %)`} · LEADS: ${leads.leads.length}`,
        "",
        ...leads.leads.slice(0, 20).map((l, i) => `   ${String(i + 1).padStart(2)}. ${l.host}`),
        "",
        `💾 ${jsonPfad}`,
        `   ${mdPfad}`,
        "",
        "⚠️  Noch nicht anschreiben. Erst akquise_gate — solange der nicht freigibt, ist diese Liste nur eine Recherche.",
      ];

      return text(zeilen.join("\n"), {
        datum: leads.datum,
        marktGroesse: leads.marktGroesse,
        sichtbar: leads.sichtbar.length,
        leads: leads.leads.map((l) => l.host),
        quote,
        jsonPfad,
      });
    }),
);

// ----------------------------------------------------------------- Gate
server.registerTool(
  "akquise_gate",
  {
    title: "Akquise-Gate (Freigabe)",
    description:
      "Die verbindliche Freigabe vor dem Anschreiben. Prüft Sweep und Leads gegen alle Regeln (Schema, Marktabdeckung, Portal-Leckage, Alias-Domains, Sperrliste, Grounding, Zahlen) und mit `online` zusätzlich den Werbewiderspruch im Impressum jedes Leads. Blocker bedeuten: NICHT anschreiben. Ein Fehlschlag ist kein technisches Problem, sondern eine Entscheidung — er darf nicht umgangen werden.",
    inputSchema: {
      branche: z.string(),
      region: z.string(),
      datum: z.string().optional().describe("YYYY-MM-DD, Vorgabe: heute"),
      online: z
        .boolean()
        .optional()
        .describe(
          "Impressum jedes Leads auf Werbewiderspruch prüfen. Dauert ~1 s pro Lead, ist vor dem Anschreiben aber Pflicht.",
        ),
      warnungenAkzeptiert: z
        .boolean()
        .optional()
        .describe(
          "Nur setzen, nachdem ein Mensch die Warnungen des vorherigen Laufs gelesen und akzeptiert hat. Nicht automatisch mitschicken.",
        ),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ branche, region, datum, online, warnungenAkzeptiert }) =>
    bewache(async () => {
      const e = await laufeGate({ branche, region, datum, online, warnungenAkzeptiert });

      const kopf =
        `🚦 Akquise-Gate: ${e.branche} in ${e.region} (${e.datum})\n` +
        `   ${e.kennzahlen.prompts} Prompts · ${e.kennzahlen.marktGroesse} Betriebe · ${e.kennzahlen.leads} Leads` +
        `${e.online ? " · Online-Prüfung aktiv" : " · nur Offline-Regeln"}`;

      const strukturiert = {
        status: e.status,
        blocker: e.blocker,
        warnungen: e.warnungen,
        kennzahlen: e.kennzahlen,
        reportPfad: e.reportPfad,
      };

      if (e.status === "blockiert") {
        return {
          ...fehler(
            `⛔ NICHT ANSCHREIBEN — ${e.blocker.length} Blocker.\n\n${kopf}\n\n${listeVerstoesse(e.blocker)}` +
              (e.warnungen.length > 0
                ? `\n\nZusätzlich ${e.warnungen.length} Warnung(en):\n${listeVerstoesse(e.warnungen)}`
                : "") +
              `\n\nDie Blocker müssen behoben werden — sie lassen sich nicht akzeptieren.\n💾 ${e.reportPfad}`,
          ),
          structuredContent: strukturiert,
        };
      }

      if (e.status === "warnungen-offen") {
        return {
          ...fehler(
            `⚠️ NICHT FREIGEGEBEN — ${e.warnungen.length} Warnung(en) offen.\n\n${kopf}\n\n${listeVerstoesse(e.warnungen)}\n\n` +
              "Diese Punkte muss ein Mensch prüfen. Erst danach erneut mit warnungenAkzeptiert: true aufrufen — nicht ungeprüft wiederholen.\n" +
              `💾 ${e.reportPfad}`,
          ),
          structuredContent: strukturiert,
        };
      }

      const hinweis = e.online
        ? ""
        : "\n\nHinweis: ohne `online` wurde der Werbewiderspruch im Impressum nicht geprüft. Vor dem Anschreiben mit online: true wiederholen.";
      return text(
        `✅ Freigegeben.\n\n${kopf}` +
          (e.warnungen.length > 0
            ? `\n\n${e.warnungen.length} akzeptierte Warnung(en):\n${listeVerstoesse(e.warnungen)}`
            : "\n\n   Keine Beanstandungen.") +
          hinweis +
          `\n\n💾 ${e.reportPfad}`,
        strukturiert,
      );
    }),
);

// ----------------------------------------------------------------- Auswertung
server.registerTool(
  "akquise_auswertung",
  {
    title: "Akquise-Auswertung",
    description:
      "Erzeugt die 1-Seiten-Analyse für einen einzelnen Lead: Fakten aus dem Sweep plus eine Live-Prüfung der Startseite auf strukturierte Daten, Anschrift und Meta-Angaben. Ergebnis ist eine HTML-Datei zum Weiterverarbeiten als PDF. Erfindet nichts — nicht Prüfbares wird als offen markiert. Ersetzt den Gate nicht.",
    inputSchema: {
      domain: z.string().describe("Domain des Leads, ohne Protokoll (z. B. „beispiel.de\")"),
      branche: z.string(),
      region: z.string(),
      datum: z.string().optional().describe("YYYY-MM-DD des Sweeps, Vorgabe: heute"),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ domain, branche, region, datum }) =>
    bewache(async () => {
      const e = await laufeAuswertung({ domain, branche, region, datum });

      const zeilen = [
        `🔎 Auswertung: ${e.domain}`,
        `   In ${e.eigeneNennungen} von ${e.anzahlPrompts} KI-Antworten genannt`,
        "",
        ...e.befunde.map((b) => `   • [${b.status}] ${b.titel}`),
        "",
        `💾 ${e.htmlPfad}`,
        `   PDF: node ~/career-ops/generate-pdf.mjs "${e.htmlPfad}" "${e.htmlPfad.replace(/\.html$/, ".pdf")}" --format=a4`,
      ];

      return text(zeilen.join("\n"), {
        domain: e.domain,
        eigeneNennungen: e.eigeneNennungen,
        anzahlPrompts: e.anzahlPrompts,
        befunde: e.befunde,
        htmlPfad: e.htmlPfad,
      });
    }),
);

// ----------------------------------------------------------------- Start
async function main() {
  // Auf stderr, damit stdout dem Protokoll gehört. Nur Namen, nie Werte.
  const fehlend = Object.entries(UMGEBUNG.keys)
    .filter(([, da]) => !da)
    .map(([k]) => k);
  console.error(`akquise-mcp bereit${UMGEBUNG.quelle ? ` (Keys aus ${UMGEBUNG.quelle})` : ""}.`);
  if (UMGEBUNG.entfernt.length > 0) {
    console.error(`  Aus der Umgebung entfernt: ${UMGEBUNG.entfernt.join(", ")}`);
  }
  if (fehlend.length > 0) {
    console.error(
      `  Fehlende Keys: ${fehlend.join(", ")} — akquise_gate und akquise_status laufen trotzdem.`,
    );
  }

  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
