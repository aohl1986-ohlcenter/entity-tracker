/**
 * Schema-Validierung: kaputte Artefakte müssen mit PFADGENAUER Meldung
 * abbrechen, nicht mit „undefined is not a function" tief im Skript.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLeads, parseSweep, SchemaFehler } from "../lib/akquise/schema";
import { ladeFixture } from "./hilfen";

const GUELTIG = () => ladeFixture("sweeps", "dachdecker-osnabrueck") as Record<string, unknown>;

describe("parseSweep", () => {
  it("akzeptiert ein echtes Artefakt", () => {
    const s = parseSweep(GUELTIG());
    assert.ok(s.kandidaten.length > 0);
    assert.ok(s.protokoll.length > 0);
  });

  it("nennt den exakten Pfad des Fehlers", () => {
    const kaputt = GUELTIG();
    (kaputt.kandidaten as Record<string, unknown>[])[2].nennungen = "drei";
    assert.throws(
      () => parseSweep(kaputt, "test"),
      (e: unknown) => e instanceof SchemaFehler && e.pfad === "test.kandidaten[2].nennungen",
    );
  });

  it("lehnt NaN als Zahl ab", () => {
    const kaputt = GUELTIG();
    (kaputt.kandidaten as Record<string, unknown>[])[0].nennungen = NaN;
    assert.throws(() => parseSweep(kaputt), SchemaFehler);
  });

  it("akzeptiert Altbestand ohne grounding-Feld", () => {
    const s = parseSweep(GUELTIG());
    assert.equal(s.protokoll[0].grounding, undefined);
  });

  it("liest grounding, wenn vorhanden", () => {
    const mit = GUELTIG();
    (mit.protokoll as Record<string, unknown>[])[0].grounding = { ok: true, links: ["https://a.de"] };
    const s = parseSweep(mit);
    assert.deepEqual(s.protokoll[0].grounding, { ok: true, fehler: undefined, links: ["https://a.de"] });
  });
});

describe("parseLeads", () => {
  it("akzeptiert ein echtes Artefakt", () => {
    const l = parseLeads(ladeFixture("leads", "dachdecker-osnabrueck"));
    assert.ok(l.suchen.length > 0);
    assert.equal(typeof l.marktGroesse, "number");
  });

  it("verlangt suchen[] — ohne sie ist R2 nicht prüfbar", () => {
    const kaputt = ladeFixture("leads", "dachdecker-osnabrueck") as Record<string, unknown>;
    delete kaputt.suchen;
    assert.throws(() => parseLeads(kaputt, "test"), SchemaFehler);
  });
});
