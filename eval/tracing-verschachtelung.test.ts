/**
 * Prüft die Verschachtelung im Tracing: der von Bedrock intern ausgelöste
 * Serper-Abruf muss als eigener Vorgang unter seinem Bedrock-Vorgang hängen,
 * und die Ergebnis-Verknüpfung darf dabei nicht am falschen Vorgang landen.
 *
 * Warum das heikel ist: `verknuepfeErgebnis` hängt am zuletzt VERFOLGTEN
 * Vorgang. Würde `verfolgeGroundingSerp` diesen Zeiger mitverschieben, liefe
 * die aiCitationId auf den SERP-Vorgang statt auf den Engine-Aufruf — und die
 * Frage „welcher Lauf hat dieses Citation-Ergebnis erzeugt“ wäre still falsch
 * beantwortet. Genau dieser Fehler fällt im Betrieb nicht auf.
 *
 * lib/tracing.ts importiert lib/db, das ohne DATABASE_URL beim Laden wirft.
 * Deshalb: DATABASE_URL auf einen Platzhalter setzen, `fetch` stubben und das
 * Modul erst danach dynamisch laden. Es geht dadurch KEIN Netzverkehr und kein
 * DB-Zugriff raus — alle Schreibversuche laufen ins gestubbte fetch und werden
 * vom best-effort-try/catch des Tracings geschluckt, wie im Betrieb auch.
 *
 * Geprüft wird die Puffer-Logik, nicht das SQL. Dass die Zeilen so auch in der
 * DB landen, ist durch die echten Läufe gegen die Produktiv-DB belegt.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "postgresql://platzhalter:platzhalter@localhost/platzhalter";

let echterFetch: typeof globalThis.fetch;

before(() => {
  echterFetch = globalThis.fetch;
  // Jeder DB-Schreibversuch scheitert hier bewusst — das Tracing muss das
  // aushalten, ohne den Lauf zu beeinflussen.
  globalThis.fetch = (async () => {
    throw new Error("kein Netz im Test");
  }) as typeof globalThis.fetch;
});

after(() => {
  globalThis.fetch = echterFetch;
});

/** Erst nach dem Stubben laden, sonst wirft lib/db beim Import. */
async function ladeTracing() {
  return import("../lib/tracing");
}

type Zeile = {
  seq: number;
  parentSeq: number | null;
  engine: string;
  operation: string;
  aiCitationId: number | null;
  anlass: string;
  ok: number;
};

/** Der Puffer ist intern; für die Prüfung reicht der strukturelle Zugriff. */
function puffer(ctx: unknown): Zeile[] {
  return (ctx as { puffer: Zeile[] }).puffer;
}

describe("Tracing — Bedrock-Grounding als Kindvorgang", () => {
  it("hängt den Grounding-SERP an den Bedrock-Vorgang", async () => {
    const { starteLauf, verfolge, verfolgeGroundingSerp } = await ladeTracing();
    const lauf = await starteLauf(1, "check_citations");

    await verfolge(
      lauf,
      { engine: "bedrock", operation: "citation_prompt", anlass: "wer ist X" },
      async () => ({ messung: { modell: "amazon.nova-lite-v1:0", verbrauch: { tokensIn: 10, tokensOut: 20, quelle: "api" as const }, dauerMs: 5 } }),
      (r) => r.messung,
    );
    verfolgeGroundingSerp(lauf, "wer ist X", { ok: true, dauerMs: 42 });

    const p = puffer(lauf);
    assert.equal(p.length, 2);
    assert.equal(p[0].engine, "bedrock");
    assert.equal(p[0].parentSeq, null);
    assert.equal(p[1].engine, "serper");
    assert.equal(p[1].operation, "grounding_serp");
    assert.equal(
      p[1].parentSeq,
      p[0].seq,
      "Der SERP-Abruf muss an seinem Bedrock-Vorgang hängen, sonst zählt er als eigenständiger Abruf.",
    );
  });

  it("verknüpft das Citation-Ergebnis mit dem Engine-Aufruf, nicht mit dem SERP", async () => {
    const { starteLauf, verfolge, verfolgeGroundingSerp, verknuepfeErgebnis } = await ladeTracing();
    const lauf = await starteLauf(1, "check_citations");

    await verfolge(
      lauf,
      { engine: "bedrock", operation: "citation_prompt", anlass: "wer ist X" },
      async () => ({ messung: { modell: "m", verbrauch: { tokensIn: 1, tokensOut: 1, quelle: "api" as const }, dauerMs: 1 } }),
      (r) => r.messung,
    );
    // Reihenfolge wie in lib/jobs.ts: erst verknüpfen, dann den SERP nachtragen.
    verknuepfeErgebnis(lauf, { aiCitationId: 999 });
    verfolgeGroundingSerp(lauf, "wer ist X", { ok: true, dauerMs: 10 });

    const p = puffer(lauf);
    assert.equal(p[0].aiCitationId, 999, "Die Citation gehört an den Bedrock-Vorgang.");
    assert.equal(p[1].aiCitationId, null, "Der SERP-Vorgang hat kein Citation-Ergebnis.");
  });

  it("verschiebt den Verknüpfungs-Zeiger nicht, wenn der SERP zuerst nachgetragen wird", async () => {
    const { starteLauf, verfolge, verfolgeGroundingSerp, verknuepfeErgebnis } = await ladeTracing();
    const lauf = await starteLauf(1, "check_citations");

    await verfolge(
      lauf,
      { engine: "bedrock", operation: "citation_prompt", anlass: "wer ist X" },
      async () => ({ messung: { modell: "m", verbrauch: { tokensIn: 1, tokensOut: 1, quelle: "api" as const }, dauerMs: 1 } }),
      (r) => r.messung,
    );
    // Umgekehrte Reihenfolge: auch so darf die Citation nicht am SERP landen.
    verfolgeGroundingSerp(lauf, "wer ist X", { ok: true, dauerMs: 10 });
    verknuepfeErgebnis(lauf, { aiCitationId: 777 });

    const p = puffer(lauf);
    assert.equal(
      p[0].aiCitationId,
      777,
      "verfolgeGroundingSerp darf ctx.letzte nicht überschreiben — sonst hinge die Citation am SERP.",
    );
    assert.equal(p[1].aiCitationId, null);
  });

  it("zählt den Grounding-SERP als eigenen Aufruf in der Lauf-Summe", async () => {
    const { starteLauf, verfolge, verfolgeGroundingSerp } = await ladeTracing();
    const lauf = await starteLauf(1, "check_citations");

    await verfolge(
      lauf,
      { engine: "bedrock", operation: "citation_prompt", anlass: "q" },
      async () => ({ messung: { modell: "m", verbrauch: { tokensIn: 1, tokensOut: 1, quelle: "api" as const }, dauerMs: 1 } }),
      (r) => r.messung,
    );
    verfolgeGroundingSerp(lauf, "q", { ok: true, dauerMs: 10 });

    assert.equal(lauf.calls, 2, "Ein Bedrock-Prompt verursacht zwei abrechenbare Aufrufe.");
    assert.equal(lauf.failures, 0);
  });

  it("führt einen gescheiterten Grounding-SERP als Fehler, nicht als Erfolg", async () => {
    const { starteLauf, verfolge, verfolgeGroundingSerp } = await ladeTracing();
    const lauf = await starteLauf(1, "check_citations");

    await verfolge(
      lauf,
      { engine: "bedrock", operation: "citation_prompt", anlass: "q" },
      async () => ({ messung: { modell: "m", verbrauch: { tokensIn: 1, tokensOut: 1, quelle: "api" as const }, dauerMs: 1 } }),
      (r) => r.messung,
    );
    verfolgeGroundingSerp(lauf, "q", { ok: false, fehler: "Serper 500", dauerMs: 3 });

    assert.equal(lauf.failures, 1);
    assert.equal(puffer(lauf)[1].ok, 0);
  });
});

describe("Tracing — best effort", () => {
  it("lässt einen Lauf nicht scheitern, wenn die DB nicht erreichbar ist", async () => {
    const { starteLauf, verfolge, beendeLauf } = await ladeTracing();
    // starteLauf/beendeLauf schreiben hier ins gestubbte, werfende fetch.
    const lauf = await starteLauf(1, "check_citations");
    assert.equal(lauf.runRowId, null, "Der fehlgeschlagene Insert wird geschluckt.");

    const wert = await verfolge(
      lauf,
      { engine: "tavily", operation: "citation_prompt", anlass: "q" },
      async () => "ergebnis",
    );
    assert.equal(wert, "ergebnis", "Das Ergebnis kommt unverändert durch.");
    await beendeLauf(lauf, true); // darf nicht werfen
  });

  it("reicht den Originalfehler eines Aufrufs unverändert weiter", async () => {
    const { starteLauf, verfolge } = await ladeTracing();
    const lauf = await starteLauf(1, "check_citations");

    await assert.rejects(
      () =>
        verfolge(lauf, { engine: "brave", operation: "citation_prompt", anlass: "q" }, async () => {
          throw new Error("Brave 429: rate limited");
        }),
      /Brave 429/,
      "Das Tracing muss durchsichtig sein und darf den Fehler nicht ersetzen.",
    );
    assert.equal(lauf.failures, 1);
    assert.equal(puffer(lauf)[0].ok, 0);
  });
});
