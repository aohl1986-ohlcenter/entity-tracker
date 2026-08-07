/**
 * Prüft, was lib/bedrock.ts für das Kosten-Tracing zurückmeldet.
 *
 * Warum das hier steht und nicht als Live-Lauf: Bedrock ist mangels
 * BEDROCK_API_KEY nicht in Betrieb, und der Pfad wäre sonst ungeprüft ins
 * Produktivsystem gegangen. `fetch` wird deshalb gestubbt — damit ist die
 * Antwort-Auswertung vollständig testbar, ohne Key, ohne Netz, ohne DB
 * (lib/bedrock.ts importiert nur ./serper und ./engine-messung; genau das
 * sichert eval/isolation.test.ts zu).
 *
 * Zwei Dinge sind wichtig:
 *  1. Bedrock ist NICHT nativ gegroundet — es löst pro Aufruf einen eigenen,
 *     kostenpflichtigen Serper-Abruf aus. Ohne `grounding.dauerMs` wäre der
 *     als Kostenposten unsichtbar.
 *  2. Die Token-Zahlen stecken in `usage` der Converse-Antwort und wurden
 *     bisher zusammen mit `raw` weggeworfen.
 *
 * Was das hier NICHT abdeckt: ob die echte Bedrock-API die Felder wirklich so
 * benennt. Die Fixture bildet die dokumentierte Converse-Antwort nach; ein
 * echter Lauf muss das bestätigen, sobald ein Key vorliegt.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { askGroundedBedrock } from "../lib/bedrock";

/** Nachbau einer Bedrock-Converse-Antwort. */
function converseAntwort(text: string, usage?: Record<string, number>) {
  return {
    output: { message: { content: [{ text }] } },
    ...(usage ? { usage } : {}),
  };
}

/** Nachbau einer Serper-Antwort. */
function serperAntwort(links: string[]) {
  return {
    organic: links.map((link, i) => ({
      position: i + 1,
      title: `Titel ${i + 1}`,
      link,
      snippet: "…",
    })),
  };
}

type Antwort = { ok: boolean; koerper: unknown; verzoegerungMs?: number };

let echterFetch: typeof globalThis.fetch;
let plan: Antwort[];
let aufrufe: string[];

function stubFetch() {
  globalThis.fetch = (async (url: string | URL | Request) => {
    aufrufe.push(String(url));
    const a = plan.shift();
    if (!a) throw new Error(`Unerwarteter fetch: ${String(url)}`);
    if (a.verzoegerungMs) await new Promise((r) => setTimeout(r, a.verzoegerungMs));
    return {
      ok: a.ok,
      status: a.ok ? 200 : 500,
      json: async () => a.koerper,
      text: async () => JSON.stringify(a.koerper),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
}

before(() => {
  echterFetch = globalThis.fetch;
  process.env.BEDROCK_API_KEY = "test-key";
  process.env.SERPER_API_KEY = "test-key";
});

after(() => {
  globalThis.fetch = echterFetch;
});

beforeEach(() => {
  plan = [];
  aufrufe = [];
  stubFetch();
});

describe("askGroundedBedrock — Messwerte fürs Tracing", () => {
  it("liest die Token-Zahlen aus usage statt sie mit raw wegzuwerfen", async () => {
    plan = [
      { ok: true, koerper: serperAntwort(["https://a.test"]) },
      {
        ok: true,
        koerper: converseAntwort("Quellen:\nhttps://a.test", {
          inputTokens: 1234,
          outputTokens: 567,
          totalTokens: 1801,
        }),
      },
    ];

    const r = await askGroundedBedrock("testfrage");

    assert.equal(r.messung.verbrauch.tokensIn, 1234);
    assert.equal(r.messung.verbrauch.tokensOut, 567);
    assert.equal(r.messung.verbrauch.quelle, "api");
  });

  it("meldet das tatsächlich benutzte Modell", async () => {
    plan = [
      { ok: true, koerper: serperAntwort([]) },
      { ok: true, koerper: converseAntwort("", { inputTokens: 1, outputTokens: 1 }) },
    ];

    const r = await askGroundedBedrock("testfrage", { model: "amazon.nova-pro-v1:0" });

    assert.equal(
      r.messung.modell,
      "amazon.nova-pro-v1:0",
      "Ohne das richtige Modell greift in lib/kosten.ts die falsche Preiszeile.",
    );
  });

  it("führt fehlende usage-Angaben als null statt als 0", async () => {
    plan = [
      { ok: true, koerper: serperAntwort(["https://a.test"]) },
      { ok: true, koerper: converseAntwort("https://a.test") }, // kein usage-Feld
    ];

    const r = await askGroundedBedrock("testfrage");

    assert.equal(
      r.messung.verbrauch.tokensIn,
      null,
      "0 würde „kostenlos“ bedeuten; null heißt „nicht geliefert“ und führt zu costModell „unbekannt“.",
    );
    assert.equal(r.messung.verbrauch.tokensOut, null);
  });
});

describe("askGroundedBedrock — der eigene Serper-Abruf fürs Grounding", () => {
  it("löst tatsächlich einen zweiten, kostenpflichtigen Abruf aus", async () => {
    plan = [
      { ok: true, koerper: serperAntwort(["https://a.test"]) },
      { ok: true, koerper: converseAntwort("https://a.test", { inputTokens: 1, outputTokens: 1 }) },
    ];

    await askGroundedBedrock("testfrage");

    assert.equal(aufrufe.length, 2, "Ein Bedrock-Aufruf kostet zwei API-Aufrufe.");
    assert.match(aufrufe[0], /serper\.dev/);
    assert.match(aufrufe[1], /bedrock-runtime/);
  });

  it("meldet die Dauer des Grounding-Abrufs, damit er als Kostenposten sichtbar wird", async () => {
    plan = [
      { ok: true, koerper: serperAntwort(["https://a.test"]), verzoegerungMs: 30 },
      { ok: true, koerper: converseAntwort("https://a.test", { inputTokens: 1, outputTokens: 1 }) },
    ];

    const r = await askGroundedBedrock("testfrage");

    assert.ok(
      r.grounding.dauerMs >= 25,
      `dauerMs sollte die ~30ms des SERP-Abrufs abbilden, war ${r.grounding.dauerMs}.`,
    );
  });

  it("trennt die Modell-Dauer von der SERP-Dauer", async () => {
    plan = [
      { ok: true, koerper: serperAntwort(["https://a.test"]), verzoegerungMs: 60 },
      {
        ok: true,
        koerper: converseAntwort("https://a.test", { inputTokens: 1, outputTokens: 1 }),
      },
    ];

    const r = await askGroundedBedrock("testfrage");

    assert.ok(
      r.messung.dauerMs < r.grounding.dauerMs,
      `messung.dauerMs (${r.messung.dauerMs}) darf die SERP-Zeit (${r.grounding.dauerMs}) nicht ` +
        `mitzählen — sonst wird die Latenz der Engine doppelt ausgewiesen.`,
    );
  });

  it("meldet einen gescheiterten Grounding-Abruf, statt ihn zu verschlucken", async () => {
    plan = [
      { ok: false, koerper: { error: "kaputt" } },
      { ok: true, koerper: converseAntwort("", { inputTokens: 1, outputTokens: 1 }) },
    ];

    const r = await askGroundedBedrock("testfrage");

    assert.equal(r.grounding.ok, false);
    assert.ok(r.grounding.fehler, "Der Fehlertext muss durchgereicht werden.");
    assert.equal(typeof r.grounding.dauerMs, "number", "Auch ein Fehlversuch hat eine Dauer.");
  });

  it("liefert die Grounding-Links, gegen die Citations geprüft werden", async () => {
    plan = [
      { ok: true, koerper: serperAntwort(["https://a.test", "https://b.test"]) },
      {
        ok: true,
        koerper: converseAntwort("Siehe https://a.test", { inputTokens: 1, outputTokens: 1 }),
      },
    ];

    const r = await askGroundedBedrock("testfrage");

    assert.deepEqual(r.grounding.links, ["https://a.test", "https://b.test"]);
    assert.deepEqual(
      r.citations.map((c) => c.resolvedUrl),
      ["https://a.test"],
      "Citations kommen per Regex aus dem Antworttext — erst der Abgleich mit grounding.links " +
        "macht eine erfundene URL sichtbar.",
    );
  });
});
