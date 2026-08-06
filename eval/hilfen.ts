/**
 * Gemeinsame Helfer der Regressionssuite.
 *
 * Kein `_env`-Import, kein DB-Zugriff — siehe isolation.test.ts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseLeads, parseSweep } from "../lib/akquise/schema";
import { parseSperrliste } from "../lib/akquise/sperrliste";
import type { Pruefkontext } from "../lib/akquise/typen";

export const EVAL_DIR = dirname(fileURLToPath(import.meta.url));

export function ladeFixture(art: "sweeps" | "leads", id: string): unknown {
  return JSON.parse(readFileSync(join(EVAL_DIR, "fixtures", art, `${id}.json`), "utf8"));
}

export function ladeSperrliste(): Map<string, string> {
  return parseSperrliste(readFileSync(join(EVAL_DIR, "fixtures", "tracker.md"), "utf8"));
}

export function baueKontext(sweepId: string, leadsId: string): Pruefkontext {
  return {
    sweep: parseSweep(ladeFixture("sweeps", sweepId), sweepId),
    leads: parseLeads(ladeFixture("leads", leadsId), leadsId),
    sperrliste: ladeSperrliste(),
  };
}

/** Tiefe Kopie, damit Mutationstests die Fixtures nicht gegenseitig verfälschen. */
export function kopie<T>(wert: T): T {
  return JSON.parse(JSON.stringify(wert)) as T;
}
