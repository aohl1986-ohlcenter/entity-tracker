/**
 * Golden-Set: Die sechs realen Fälle aus den Läufen im Juli/August 2026.
 *
 * Ein Fall kommt hier NIE als neuer Testcode dazu, sondern als Eintrag in
 * golden/faelle.json.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pruefeOffline } from "../lib/akquise/regeln";
import { baueKontext, EVAL_DIR } from "./hilfen";
import type { RegelId } from "../lib/akquise/typen";

type Fall = {
  id: string;
  beschreibung: string;
  sweep: string;
  leads: string;
  erwarteteBlocker?: RegelId[];
  erwarteteWarnungen?: RegelId[];
  verboteneBlocker?: RegelId[];
  mussBetreffen?: string[];
};

const { faelle } = JSON.parse(
  readFileSync(join(EVAL_DIR, "golden", "faelle.json"), "utf8"),
) as { faelle: Fall[] };

describe("Golden Set — reale Produktionsfehler", () => {
  for (const fall of faelle) {
    it(`${fall.id}: ${fall.beschreibung.slice(0, 80)}…`, () => {
      const verstoesse = pruefeOffline(baueKontext(fall.sweep, fall.leads));
      const blocker = verstoesse.filter((v) => v.schwere === "blocker").map((v) => v.id);
      const warnungen = verstoesse.filter((v) => v.schwere === "warnung").map((v) => v.id);
      const betroffen = verstoesse.flatMap((v) => v.betroffen);

      for (const id of fall.erwarteteBlocker ?? []) {
        assert.ok(blocker.includes(id), `${fall.id}: Blocker ${id} fehlt. Gefunden: ${blocker.join(", ") || "keine"}`);
      }
      for (const id of fall.erwarteteWarnungen ?? []) {
        assert.ok(
          warnungen.includes(id),
          `${fall.id}: Warnung ${id} fehlt. Gefunden: ${warnungen.join(", ") || "keine"}`,
        );
      }
      for (const id of fall.verboteneBlocker ?? []) {
        assert.ok(!blocker.includes(id), `${fall.id}: Blocker ${id} darf NICHT anschlagen (Fehlalarm).`);
      }
      for (const host of fall.mussBetreffen ?? []) {
        assert.ok(
          betroffen.includes(host),
          `${fall.id}: „${host}" wurde nicht als betroffen gemeldet. Gemeldet: ${betroffen.slice(0, 10).join(", ")}`,
        );
      }
    });
  }
});
