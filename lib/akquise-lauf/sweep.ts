/**
 * Der Sweep als aufrufbare Funktion — KI-Sichtbarkeits-Check für Branche + Region.
 *
 * Stellt typische Kundenfragen an die Engine und protokolliert, WELCHE Firmen
 * zitiert werden. Wer nicht auftaucht, ist ein Lead.
 *
 * Schreibt NIE in eine Datenbank. Die Artefakte liegen unter ~/career-ops/akquise/,
 * bewusst außerhalb des (öffentlichen) Repos.
 *
 * Keys werden nur aus `process.env` gelesen — wer sie dorthin bringt, entscheidet
 * der Aufrufer (CLI: scripts/_env; MCP-Server: der Allowlist-Loader).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { askGroundedBedrock } from "../bedrock";
import { akquiseOrdner, heute, hostOf, slugOf } from "../akquise/hosts";
import { istPortal } from "../akquise/portale";
import type { Kandidat, ProtokollEintrag, SweepDatei } from "../akquise/typen";
import { AblaufFehler } from "./fehler";

export type SweepOptionen = {
  branche: string;
  region: string;
  extraPrompts?: string[];
  melde?: (text: string) => void;
};

export type SweepErgebnis = {
  sweep: SweepDatei;
  /** Prompts, deren Antwort ungegroundet war — die Kandidaten daraus sind unsicher. */
  ungegroundet: string[];
  jsonPfad: string;
  mdPfad: string;
};

/** Die vier Standardfragen. Extras werden angehängt, nicht ersetzt. */
export function baueSweepPrompts(branche: string, region: string, extra: string[] = []): string[] {
  return [
    `Wer ist der beste ${branche} in ${region}?`,
    `Welchen ${branche} in ${region} kannst du empfehlen?`,
    `${branche} ${region} — welche Betriebe sind besonders zu empfehlen?`,
    `Ich brauche einen zuverlässigen ${branche} in ${region}. Wen empfiehlst du?`,
    ...extra,
  ];
}

export async function laufeSweep(opt: SweepOptionen): Promise<SweepErgebnis> {
  const { branche, region } = opt;
  const melde = opt.melde ?? (() => {});

  if (!process.env.BEDROCK_API_KEY) {
    throw new AblaufFehler("BEDROCK_API_KEY fehlt — der Sweep braucht die Engine-Keys.");
  }
  if (!process.env.SERPER_API_KEY) {
    throw new AblaufFehler("SERPER_API_KEY fehlt — ohne Grounding wäre der Sweep wertlos.");
  }

  const prompts = baueSweepPrompts(branche, region, opt.extraPrompts ?? []);
  const kandidaten = new Map<string, Kandidat>();
  const protokoll: ProtokollEintrag[] = [];
  const ungegroundet: string[] = [];

  for (const [i, prompt] of prompts.entries()) {
    melde(`   [${i + 1}/${prompts.length}] ${prompt.slice(0, 60)}…`);
    try {
      const res = await askGroundedBedrock(prompt);
      const quellen: string[] = [];

      for (const c of res.citations) {
        const url = c.resolvedUrl || c.uri;
        const host = hostOf(url);
        if (!host) continue;
        quellen.push(url);
        if (istPortal(host)) continue;

        const vorhanden = kandidaten.get(host);
        if (vorhanden) {
          vorhanden.nennungen += 1;
          if (!vorhanden.prompts.includes(prompt)) vorhanden.prompts.push(prompt);
        } else {
          kandidaten.set(host, { host, nennungen: 1, prompts: [prompt], titel: c.title ?? "" });
        }
      }

      // grounding mitschreiben: erst dadurch ist offline prüfbar, ob die
      // zitierten URLs überhaupt aus den gelieferten Quellen stammen (R7).
      protokoll.push({ prompt, antwort: res.text, quellen, grounding: res.grounding });
      if (!res.grounding.ok) ungegroundet.push(prompt);
      melde(`       ✓ ${res.citations.length} Quellen${res.grounding.ok ? "" : "  ⚠️ UNGEGROUNDET"}`);
    } catch (err) {
      const meldung = (err as Error).message;
      melde(`       ✗ Fehler: ${meldung}`);
      protokoll.push({
        prompt,
        antwort: `FEHLER: ${meldung}`,
        quellen: [],
        grounding: { ok: false, fehler: meldung, links: [] },
      });
      ungegroundet.push(prompt);
    }
    // freundlich zur API
    await new Promise((r) => setTimeout(r, 1500));
  }

  const sortiert = [...kandidaten.values()].sort((a, b) => b.nennungen - a.nennungen);
  const datum = heute();
  const slug = slugOf(branche, region);
  const ordner = akquiseOrdner();
  mkdirSync(ordner, { recursive: true });

  const sweep: SweepDatei = {
    branche,
    region,
    datum,
    prompts,
    kandidaten: sortiert,
    protokoll,
  };

  const jsonPfad = `${ordner}/${slug}-${datum}.json`;
  const mdPfad = `${ordner}/${slug}-${datum}.md`;
  writeFileSync(jsonPfad, JSON.stringify(sweep, null, 2));

  const md = [
    `# KI-Sichtbarkeit: ${branche} in ${region}`,
    ``,
    `**Erhoben:** ${datum} · **Engine:** Bedrock (grounded) · **${prompts.length} Prompts**`,
    ``,
    `## Wer wird von der KI genannt?`,
    ``,
    `| # | Domain | Nennungen | von ${prompts.length} Prompts |`,
    `|---|--------|-----------|------|`,
    ...sortiert.map((k, i) => `| ${i + 1} | ${k.host} | ${k.nennungen} | ${k.prompts.length} |`),
    ``,
    `## Antworten im Wortlaut`,
    ``,
    ...protokoll.flatMap((p) => [`### ${p.prompt}`, ``, p.antwort, ``, `---`, ``]),
  ].join("\n");

  writeFileSync(mdPfad, md);

  return { sweep, ungegroundet, jsonPfad, mdPfad };
}
