/**
 * Die Lead-Ermittlung als aufrufbare Funktion.
 *
 * Gleicht den KI-Sichtbarkeits-Sweep gegen den realen Markt ab: Serper liefert
 * die tatsächlich existierenden Anbieter, die Diff-Logik markiert, wer von der
 * KI NICHT genannt wird. Das sind die Leads.
 *
 * Schreibt NIE in eine Datenbank. Die Diff-Logik selbst liegt rein in
 * lib/akquise/leads-core.ts; hier bleiben nur I/O und die Serper-Aufrufe.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fetchSerp } from "../serper";
import { akquiseOrdner, heute, hostOf, slugOf } from "../akquise/hosts";
import { istPortal } from "../akquise/portale";
import { berechneLeads, sichtbarkeitsQuote } from "../akquise/leads-core";
import { parseSweep } from "../akquise/schema";
import type { LeadsDatei, MarktTreffer } from "../akquise/typen";
import { AblaufFehler } from "./fehler";

export type LeadsOptionen = {
  branche: string;
  region: string;
  extraSuchen?: string[];
  datum?: string;
  melde?: (text: string) => void;
};

export type LeadsErgebnis = {
  leads: LeadsDatei;
  /** Anteil der KI-sichtbaren Betriebe in Prozent, oder null bei leerem Markt. */
  quote: number | null;
  jsonPfad: string;
  mdPfad: string;
};

export async function laufeLeads(opt: LeadsOptionen): Promise<LeadsErgebnis> {
  const { branche, region } = opt;
  const datum = opt.datum ?? heute();
  const melde = opt.melde ?? (() => {});

  if (!process.env.SERPER_API_KEY) {
    throw new AblaufFehler("SERPER_API_KEY fehlt — ohne Suche gibt es keinen Marktabgleich.");
  }

  const ordner = akquiseOrdner();
  const slug = slugOf(branche, region);
  const suchen = [`${branche} ${region}`, `${branche} ${region} Firma`, ...(opt.extraSuchen ?? [])];

  // 1) Wer wurde von der KI zitiert?
  const sweepPfad = `${ordner}/${slug}-${datum}.json`;
  if (!existsSync(sweepPfad)) {
    throw new AblaufFehler(`Sweep fehlt: ${sweepPfad} — erst den Sweep laufen lassen.`);
  }
  const sweep = parseSweep(JSON.parse(readFileSync(sweepPfad, "utf8")), sweepPfad);
  melde(`📖 Sweep geladen: ${sweep.kandidaten.length} Domains werden von der KI genannt`);

  // 2) Wer existiert real?
  const markt = new Map<string, MarktTreffer>();
  for (const q of suchen) {
    const serp = await fetchSerp({ query: q, num: 20 });
    let neu = 0;
    for (const r of serp.organic ?? []) {
      const h = hostOf(r.link);
      if (!h || istPortal(h)) continue;
      const v = markt.get(h);
      if (v) v.positionen.push(r.position ?? 0);
      else {
        markt.set(h, { host: h, titel: r.title ?? "", positionen: [r.position ?? 0] });
        neu++;
      }
    }
    melde(`   Suche „${q}" … ${neu} neue Domains`);
    await new Promise((r) => setTimeout(r, 800));
  }

  // 3) Abgleich — reine Logik, siehe lib/akquise/leads-core.ts
  const ergebnis = berechneLeads(sweep, [...markt.values()], suchen);
  const quote = sichtbarkeitsQuote(ergebnis);

  // 4) Artefakte schreiben — JSON zuerst, das ist die Schnittstelle zum Gate
  const jsonPfad = `${ordner}/${slug}-leads-${datum}.json`;
  const mdPfad = `${ordner}/${slug}-leads-${datum}.md`;
  writeFileSync(jsonPfad, JSON.stringify(ergebnis, null, 2));

  const md = [
    `# Akquise-Leads: ${branche} in ${region}`,
    ``,
    `**Erhoben:** ${datum} · **Methode:** ${sweep.prompts.length} KI-Prompts (Bedrock grounded) gegen ${suchen.length} Google-Suchen abgeglichen.`,
    ``,
    `## Kurzfassung`,
    ``,
    `- **${ergebnis.marktGroesse}** Betriebe im Markt gefunden`,
    `- **${ergebnis.sichtbar.length}** davon werden von der KI genannt${quote === null ? "" : ` (${quote} %)`}`,
    `- **${ergebnis.leads.length}** sind bei Google sichtbar, aber in KI-Antworten **unsichtbar** → Leads`,
    ``,
    `## 🎯 Leads — bei Google da, in der KI nicht`,
    ``,
    `| # | Domain | Google-Treffer | Titel |`,
    `|---|--------|----------------|-------|`,
    ...ergebnis.leads.map(
      (l, i) => `| ${i + 1} | ${l.host} | ${l.positionen.length} | ${l.titel.slice(0, 60)} |`,
    ),
    ``,
    `## ✅ Bereits KI-sichtbar (Wettbewerbs-Argument)`,
    ``,
    `| Domain | KI-Nennungen |`,
    `|--------|--------------|`,
    ...ergebnis.sichtbar.map((s) => `| ${s.host} | ${s.nennungen}× |`),
    ``,
    `---`,
    ``,
    `> ⚠️ Vor dem Anschreiben prüfen: \`npm run akquise:gate -- "${branche}" "${region}" ${datum} --online\``,
    ``,
  ].join("\n");

  writeFileSync(mdPfad, md);

  return { leads: ergebnis, quote, jsonPfad, mdPfad };
}
