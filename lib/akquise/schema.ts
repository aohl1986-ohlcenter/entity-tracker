/**
 * Handgeschriebene Schema-Validierung für die Akquise-Artefakte.
 *
 * Bewusst kein zod: Das Repo hat bisher keine Runtime-Validierungs-Dependency,
 * und für genau zwei Schemata lohnt sich keine. Die Signaturen sind so gewählt,
 * dass ein späterer Wechsel auf zod ein Ein-Datei-Austausch wäre.
 *
 * Fehler nennen den exakten Pfad, damit ein kaputtes Artefakt in Sekunden
 * lokalisierbar ist statt über einen `undefined is not a function`-Stacktrace.
 */
import type { Grounding, Kandidat, LeadsDatei, MarktTreffer, ProtokollEintrag, SweepDatei } from "./typen";

export class SchemaFehler extends Error {
  constructor(public pfad: string, public erwartet: string, public bekommen: unknown) {
    super(`${pfad}: erwartet ${erwartet}, bekommen ${beschreibe(bekommen)}`);
    this.name = "SchemaFehler";
  }
}

function beschreibe(wert: unknown): string {
  if (wert === null) return "null";
  if (Array.isArray(wert)) return `Array(${wert.length})`;
  return typeof wert;
}

function obj(wert: unknown, pfad: string): Record<string, unknown> {
  if (typeof wert !== "object" || wert === null || Array.isArray(wert)) {
    throw new SchemaFehler(pfad, "ein Objekt", wert);
  }
  return wert as Record<string, unknown>;
}

function str(wert: unknown, pfad: string): string {
  if (typeof wert !== "string") throw new SchemaFehler(pfad, "einen String", wert);
  return wert;
}

function num(wert: unknown, pfad: string): number {
  if (typeof wert !== "number" || !Number.isFinite(wert)) {
    throw new SchemaFehler(pfad, "eine endliche Zahl", wert);
  }
  return wert;
}

function arr(wert: unknown, pfad: string): unknown[] {
  if (!Array.isArray(wert)) throw new SchemaFehler(pfad, "ein Array", wert);
  return wert;
}

function strArr(wert: unknown, pfad: string): string[] {
  return arr(wert, pfad).map((x, i) => str(x, `${pfad}[${i}]`));
}

function parseGrounding(wert: unknown, pfad: string): Grounding {
  const g = obj(wert, pfad);
  if (typeof g.ok !== "boolean") throw new SchemaFehler(`${pfad}.ok`, "einen Boolean", g.ok);
  return {
    ok: g.ok,
    fehler: g.fehler === undefined ? undefined : str(g.fehler, `${pfad}.fehler`),
    links: strArr(g.links ?? [], `${pfad}.links`),
  };
}

function parseKandidat(wert: unknown, pfad: string): Kandidat {
  const k = obj(wert, pfad);
  return {
    host: str(k.host, `${pfad}.host`),
    nennungen: num(k.nennungen, `${pfad}.nennungen`),
    prompts: strArr(k.prompts, `${pfad}.prompts`),
    titel: typeof k.titel === "string" ? k.titel : "",
  };
}

function parseProtokoll(wert: unknown, pfad: string): ProtokollEintrag {
  const p = obj(wert, pfad);
  return {
    prompt: str(p.prompt, `${pfad}.prompt`),
    antwort: str(p.antwort, `${pfad}.antwort`),
    quellen: strArr(p.quellen, `${pfad}.quellen`),
    grounding: p.grounding === undefined ? undefined : parseGrounding(p.grounding, `${pfad}.grounding`),
  };
}

function parseMarktTreffer(wert: unknown, pfad: string): MarktTreffer {
  const m = obj(wert, pfad);
  return {
    host: str(m.host, `${pfad}.host`),
    titel: typeof m.titel === "string" ? m.titel : "",
    positionen: arr(m.positionen, `${pfad}.positionen`).map((x, i) => num(x, `${pfad}.positionen[${i}]`)),
  };
}

export function parseSweep(wert: unknown, quelle = "sweep"): SweepDatei {
  const s = obj(wert, quelle);
  return {
    branche: str(s.branche, `${quelle}.branche`),
    region: str(s.region, `${quelle}.region`),
    datum: str(s.datum, `${quelle}.datum`),
    prompts: strArr(s.prompts, `${quelle}.prompts`),
    kandidaten: arr(s.kandidaten, `${quelle}.kandidaten`).map((k, i) =>
      parseKandidat(k, `${quelle}.kandidaten[${i}]`),
    ),
    protokoll: arr(s.protokoll, `${quelle}.protokoll`).map((p, i) =>
      parseProtokoll(p, `${quelle}.protokoll[${i}]`),
    ),
  };
}

export function parseLeads(wert: unknown, quelle = "leads"): LeadsDatei {
  const l = obj(wert, quelle);
  return {
    branche: str(l.branche, `${quelle}.branche`),
    region: str(l.region, `${quelle}.region`),
    datum: str(l.datum, `${quelle}.datum`),
    suchen: strArr(l.suchen, `${quelle}.suchen`),
    marktGroesse: num(l.marktGroesse, `${quelle}.marktGroesse`),
    leads: arr(l.leads, `${quelle}.leads`).map((m, i) => parseMarktTreffer(m, `${quelle}.leads[${i}]`)),
    sichtbar: arr(l.sichtbar, `${quelle}.sichtbar`).map((m, i) => {
      const basis = parseMarktTreffer(m, `${quelle}.sichtbar[${i}]`);
      const roh = obj(m, `${quelle}.sichtbar[${i}]`);
      return { ...basis, nennungen: num(roh.nennungen, `${quelle}.sichtbar[${i}].nennungen`) };
    }),
  };
}
