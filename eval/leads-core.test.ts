/**
 * Die Diff-Logik — inklusive des NaN-Falls, der früher „NaN %" in den
 * Kundenbericht schrieb.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { berechneLeads, sichtbarkeitsQuote, zitierteNichtPortale } from "../lib/akquise/leads-core";
import type { SweepDatei } from "../lib/akquise/typen";

const sweep: SweepDatei = {
  branche: "Dachdecker",
  region: "Osnabrück",
  datum: "2026-08-05",
  prompts: ["Wer ist der beste Dachdecker in Osnabrück?"],
  kandidaten: [
    { host: "betrieb-004.example", nennungen: 4, prompts: ["p"], titel: "Bauer" },
    { host: "my-hammer.de", nennungen: 2, prompts: ["p"], titel: "Portal" },
  ],
  protokoll: [],
};

describe("berechneLeads", () => {
  it("trennt Leads von bereits sichtbaren Betrieben", () => {
    const e = berechneLeads(
      sweep,
      [
        { host: "betrieb-004.example", titel: "Bauer", positionen: [1] },
        { host: "betrieb-001.example", titel: "Kaschtan", positionen: [2, 5] },
      ],
      ["Dachdecker Osnabrück"],
    );
    assert.deepEqual(e.leads.map((l) => l.host), ["betrieb-001.example"]);
    assert.deepEqual(e.sichtbar.map((s) => s.host), ["betrieb-004.example"]);
    assert.equal(e.sichtbar[0].nennungen, 4);
  });

  it("lässt ein durchgerutschtes Portal nie als Lead durch", () => {
    const e = berechneLeads(
      sweep,
      [{ host: "doctolib.de", titel: "Portal", positionen: [1] }],
      ["Dachdecker Osnabrück"],
    );
    assert.equal(e.leads.length, 0);
    assert.equal(e.marktGroesse, 0);
  });

  it("übernimmt die Suchbegriffe ins Artefakt (Voraussetzung für R2)", () => {
    const e = berechneLeads(sweep, [], ["a", "b"]);
    assert.deepEqual(e.suchen, ["a", "b"]);
  });
});

describe("sichtbarkeitsQuote", () => {
  it("liefert null statt NaN bei leerem Markt", () => {
    const e = berechneLeads(sweep, [], ["x"]);
    assert.equal(sichtbarkeitsQuote(e), null);
  });

  it("rechnet korrekt", () => {
    const e = berechneLeads(
      sweep,
      [
        { host: "betrieb-004.example", titel: "", positionen: [1] },
        { host: "neu.de", titel: "", positionen: [2] },
      ],
      ["x"],
    );
    assert.equal(sichtbarkeitsQuote(e), 50);
  });
});

describe("zitierteNichtPortale", () => {
  it("zählt Portale nicht als Firmen mit", () => {
    assert.deepEqual(zitierteNichtPortale(sweep), ["betrieb-004.example"]);
  });
});
