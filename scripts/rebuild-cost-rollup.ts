// Baut die Monatsverdichtung `llm_cost_monthly` aus den Einzelvorgängen neu.
//
// Warum es das gibt: neon-http kennt keine Transaktionen, das Rollup wird beim
// Laufende also getrennt von den Einzelzeilen fortgeschrieben. Damit aus dieser
// „doppelten Wahrheit" kein blindes Vertrauen wird, ist das Rollup jederzeit
// aus llm_calls reproduzierbar — und damit auch prüfbar.
//
//   npx tsx scripts/rebuild-cost-rollup.ts 2026-08          # neu schreiben
//   npx tsx scripts/rebuild-cost-rollup.ts 2026-08 --pruefe # nur vergleichen
//
// ACHTUNG: Ohne --pruefe wird der Monat in der PRODUKTIV-DB überschrieben.
// Nur für Monate sinnvoll, deren Einzelvorgänge noch nicht der 90-Tage-
// Retention (lib/prune.ts) zum Opfer gefallen sind — sonst wäre das Ergebnis
// unvollständig. Das Skript bricht deshalb ab, wenn es für den Monat keine
// Einzelvorgänge findet, aber Rollup-Zeilen existieren.

import "./_env";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { llmCalls, llmCostMonthly } from "../lib/schema";
import { fasseZusammen, formatiereUsdAusNano, type CostModell } from "../lib/kosten";

const monat = process.argv[2];
const nurPruefen = process.argv.includes("--pruefe");

if (!monat || !/^\d{4}-\d{2}$/.test(monat)) {
  console.error("Aufruf: tsx scripts/rebuild-cost-rollup.ts <YYYY-MM> [--pruefe]");
  process.exit(1);
}

async function main() {
  const zeilen = await db
    .select({
      entityId: llmCalls.entityId,
      month: llmCalls.month,
      engine: llmCalls.engine,
      model: llmCalls.model,
      ok: llmCalls.ok,
      tokensIn: llmCalls.tokensIn,
      tokensOut: llmCalls.tokensOut,
      costNanoUsd: llmCalls.costNanoUsd,
      costModell: llmCalls.costModell,
    })
    .from(llmCalls)
    .where(eq(llmCalls.month, monat));

  const bestand = await db
    .select()
    .from(llmCostMonthly)
    .where(eq(llmCostMonthly.month, monat));

  if (zeilen.length === 0 && bestand.length > 0) {
    console.error(
      `Abbruch: für ${monat} gibt es ${bestand.length} Rollup-Zeilen, aber keine ` +
        `Einzelvorgänge mehr (Retention). Ein Neuaufbau würde die Zahlen auf 0 setzen.`,
    );
    process.exit(1);
  }

  const neu = fasseZusammen(
    zeilen.map((z) => ({ ...z, costModell: z.costModell as CostModell })),
  );

  // Vergleich gegen den Bestand — das ist der eigentliche Nutzen.
  const schluessel = (v: { entityId: number; engine: string; model: string }) =>
    `${v.entityId}|${v.engine}|${v.model}`;
  const alt = new Map(bestand.map((b) => [schluessel(b), b]));
  let abweichungen = 0;

  for (const v of neu) {
    const b = alt.get(schluessel(v));
    if (!b) {
      console.log(`+ neu: ${v.engine}/${v.model || "—"} Entity ${v.entityId}`);
      abweichungen++;
      continue;
    }
    if (b.calls !== v.calls || b.failures !== v.failures || b.costNanoUsd !== v.costNanoUsd) {
      console.log(
        `~ Abweichung ${v.engine}/${v.model || "—"} Entity ${v.entityId}: ` +
          `Rollup ${b.calls}/${b.failures} ${formatiereUsdAusNano(b.costNanoUsd)} ` +
          `↔ berechnet ${v.calls}/${v.failures} ${formatiereUsdAusNano(v.costNanoUsd)}`,
      );
      abweichungen++;
    }
    alt.delete(schluessel(v));
  }
  for (const übrig of alt.values()) {
    console.log(`- nur im Rollup: ${übrig.engine}/${übrig.model || "—"} Entity ${übrig.entityId}`);
    abweichungen++;
  }

  console.log(
    `\n${monat}: ${zeilen.length} Einzelvorgänge → ${neu.length} Rollup-Zeilen, ` +
      `${abweichungen} Abweichung(en) zum Bestand.`,
  );

  if (nurPruefen) {
    console.log("--pruefe: nichts geschrieben.");
    process.exit(abweichungen === 0 ? 0 : 1);
  }

  for (const v of neu) {
    await db
      .insert(llmCostMonthly)
      .values({ ...v, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [
          llmCostMonthly.month,
          llmCostMonthly.entityId,
          llmCostMonthly.engine,
          llmCostMonthly.model,
        ],
        // Setzen, nicht addieren: das hier ist der Neuaufbau, nicht das Fortschreiben.
        set: {
          calls: v.calls,
          failures: v.failures,
          tokensIn: v.tokensIn,
          tokensOut: v.tokensOut,
          costNanoUsd: v.costNanoUsd,
          unbekannteKosten: v.unbekannteKosten,
          updatedAt: new Date(),
        },
      });
  }

  // Zeilen, die es nur noch im Rollup gibt, auf 0 setzen statt löschen —
  // ein verschwundener Posten wäre schwerer zu bemerken als eine Null.
  for (const übrig of alt.values()) {
    await db
      .update(llmCostMonthly)
      .set({ calls: 0, failures: 0, tokensIn: 0, tokensOut: 0, costNanoUsd: 0, updatedAt: new Date() })
      .where(and(eq(llmCostMonthly.id, übrig.id)));
  }

  console.log(`${monat} neu geschrieben.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
