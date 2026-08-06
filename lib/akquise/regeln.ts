/**
 * Die Regeln des Akquise-Gates.
 *
 * Jede Regel ist eine reine Funktion `(kontext) => Regelverstoss[]` — dieselben
 * Funktionen laufen im Gate (gegen echte Artefakte) und in der Regressionssuite
 * (gegen eingefrorene Fixtures). Genau ein Ort pro Regel.
 *
 * Bewusst NICHT geprüft wird der LLM-Output selbst ("wird betrieb-090.example zitiert?").
 * Modellantworten schwanken, SERPs ändern sich täglich — solche Tests wären in
 * zwei Wochen rot ohne Regressionsgrund. Geprüft werden Mengen-Invarianten
 * zwischen Prompt-, Zitat- und Marktmenge; die gelten modellunabhängig.
 */
import aliasDaten from "./aliase.json";
import branchenDaten from "./branchen.json";
import { hostOf, normalisiere } from "./hosts";
import { zitierteNichtPortale } from "./leads-core";
import { istPortal, portalGrund } from "./portale";
import type { Pruefkontext, Regelverstoss } from "./typen";

const ALIASE: Record<string, string> = (aliasDaten as { aliase: Record<string, string> }).aliase;
const SYNONYME: Record<string, string[]> = (branchenDaten as { synonyme: Record<string, string[]> })
  .synonyme;
const AUSSCHLUSS: Record<string, unknown> = (branchenDaten as { ausschluss: Record<string, unknown> })
  .ausschluss;

/**
 * Reduziert ein Wort auf seinen Stamm, damit Flexionen greifen:
 * „kieferorthopaede" → „kieferorthopaed" matcht auch „kieferorthopaedische".
 * Ohne das schlug R2 bei der Suche „Kieferorthopädische Praxis" fälschlich an.
 */
function stamm(wort: string): string {
  const s = wort.replace(/(ische|isch|ungen|ung|en|er|es|in|e)$/u, "");
  return s.length >= 5 ? s : wort;
}

/** Alle Stämme, die einen Suchbegriff als "zur Branche gehörig" ausweisen. */
function brancheTerme(branche: string): string[] {
  const norm = normalisiere(branche);
  const woerter = norm.split(/\s+/).filter((w) => w.length >= 4);
  const alle = [...woerter, ...(SYNONYME[norm] ?? [])];
  return [...new Set(alle.map(stamm))];
}

function ausschlussTokens(branche: string): string[] {
  const wert = AUSSCHLUSS[normalisiere(branche)];
  return Array.isArray(wert) ? (wert as string[]) : [];
}

// ─────────────────────────────────────────────────────────── R0
export function r0Schema(k: Pruefkontext): Regelverstoss[] {
  const v: Regelverstoss[] = [];
  if (k.sweep.datum !== k.leads.datum) {
    v.push({
      id: "R0_SCHEMA",
      schwere: "blocker",
      betroffen: [],
      meldung: `Datums-Mismatch: Sweep ist vom ${k.sweep.datum}, Leads vom ${k.leads.datum}. Die Leads gehören zu einem anderen Lauf.`,
    });
  }
  if (normalisiere(k.sweep.branche) !== normalisiere(k.leads.branche)) {
    v.push({
      id: "R0_SCHEMA",
      schwere: "blocker",
      betroffen: [],
      meldung: `Branchen-Mismatch: Sweep „${k.sweep.branche}", Leads „${k.leads.branche}".`,
    });
  }
  if (k.sweep.prompts.length === 0) {
    v.push({
      id: "R0_SCHEMA",
      schwere: "blocker",
      betroffen: [],
      meldung: "Sweep enthält keine Prompts.",
    });
  }
  return v;
}

// ─────────────────────────────────────────────────────────── R1
export function r1MarktUnterfassung(k: Pruefkontext): Regelverstoss[] {
  const zitiert = zitierteNichtPortale(k.sweep);
  if (k.leads.marktGroesse === 0) {
    return [
      {
        id: "R1_MARKT_UNTERFASSUNG",
        schwere: "blocker",
        betroffen: [],
        meldung: "Die Marktsuche hat null Betriebe gefunden. Ergebnis ist wertlos.",
      },
    ];
  }
  // Deckungsquote statt reinem Vergleich: Dass die KI ein paar Betriebe mehr
  // kennt als die lokale Suche, ist normal (Umland). Der reale Fehlerfall war
  // ein Einbruch auf 13 von 21 = 0,62 — eine Größenordnung, keine Rundungsfrage.
  const deckung = k.leads.marktGroesse / zitiert.length;
  const zahlen =
    `Die KI zitiert ${zitiert.length} Firmen-Domains, die Marktsuche fand ${k.leads.marktGroesse} Betriebe ` +
    `(Deckung ${Math.round(deckung * 100)} %).`;

  if (deckung < 0.8) {
    return [
      {
        id: "R1_MARKT_UNTERFASSUNG",
        schwere: "blocker",
        betroffen: [],
        meldung:
          `${zahlen} Wenn das Modell deutlich mehr Firmen kennt als die Google-Suche, ist nicht der ` +
          `Markt klein, sondern die Erfassung zu eng — Suchbegriffe erweitern (Stadtteile, Umlandorte, ` +
          `Leistungsbegriffe) und neu laufen lassen.`,
      },
    ];
  }
  if (deckung < 0.9) {
    return [
      {
        id: "R1_MARKT_UNTERFASSUNG",
        schwere: "warnung",
        betroffen: [],
        meldung: `${zahlen} Knapp — mit ein bis zwei zusätzlichen Suchbegriffen prüfen, ob Betriebe fehlen.`,
      },
    ];
  }
  return [];
}

// ─────────────────────────────────────────────────────────── R2
export function r2PromptMarktMismatch(k: Pruefkontext): Regelverstoss[] {
  const terme = brancheTerme(k.sweep.branche);
  const promptText = normalisiere(k.sweep.prompts.join(" "));
  const abweichend: string[] = [];

  for (const suche of k.leads.suchen) {
    const s = normalisiere(suche);
    const gedeckt = terme.some((t) => s.includes(t)) || promptText.includes(s.split(/\s+/)[0]);
    if (!gedeckt) abweichend.push(suche);
  }

  if (abweichend.length === 0) return [];
  return [
    {
      id: "R2_PROMPT_MARKT_MISMATCH",
      schwere: "blocker",
      betroffen: abweichend,
      meldung:
        `Die Marktsuche fragt nach etwas anderem als die Prompts. Betroffen: ${abweichend.map((s) => `„${s}"`).join(", ")}. ` +
        `Die Prompts fragten nur nach „${k.sweep.branche}". Betriebe, die nur über diese Suchen gefunden wurden, ` +
        `sind KEINE Leads — sie wurden schlicht nie abgefragt. Entweder Suchbegriffe angleichen oder einen eigenen Sweep fahren.`,
    },
  ];
}

// ─────────────────────────────────────────────────────────── R3
export function r3PortalLeckage(k: Pruefkontext): Regelverstoss[] {
  const v: Regelverstoss[] = [];

  const portaleInLeads = k.leads.leads.filter((l) => istPortal(l.host)).map((l) => l.host);
  if (portaleInLeads.length > 0) {
    v.push({
      id: "R3_PORTAL_LECKAGE",
      schwere: "blocker",
      betroffen: portaleInLeads,
      meldung: `Portale in der Lead-Liste: ${portaleInLeads
        .map((h) => `${h} (${portalGrund(h)})`)
        .join(", ")}. Verzeichnisse sind keine anschreibbaren Betriebe.`,
    });
  }

  const portaleInKandidaten = k.sweep.kandidaten.filter((c) => istPortal(c.host)).map((c) => c.host);
  if (portaleInKandidaten.length > 0) {
    v.push({
      id: "R3_PORTAL_LECKAGE",
      schwere: "blocker",
      betroffen: portaleInKandidaten,
      meldung:
        `Portale in der Kandidatenliste: ${portaleInKandidaten.join(", ")}. ` +
        `Sie verfälschen die Nennungs-Rangliste und die Wettbewerber-Tabelle im Kunden-PDF.`,
    });
  }

  return v;
}

// ─────────────────────────────────────────────────────────── R4
export function r4AliasDomain(k: Pruefkontext): Regelverstoss[] {
  const zitiert = new Set(k.sweep.kandidaten.map((c) => c.host));
  const treffer: string[] = [];
  const details: string[] = [];

  for (const lead of k.leads.leads) {
    const ziel = ALIASE[lead.host];
    if (ziel && zitiert.has(ziel)) {
      treffer.push(lead.host);
      details.push(`${lead.host} → ${ziel} (wird zitiert)`);
    }
  }

  if (treffer.length === 0) return [];
  return [
    {
      id: "R4_ALIAS_DOMAIN",
      schwere: "blocker",
      betroffen: treffer,
      meldung:
        `Zweitdomain desselben Betreibers: ${details.join(", ")}. ` +
        `Ein Anschreiben „Sie werden nicht genannt" wäre sachlich falsch.`,
    },
  ];
}

// ─────────────────────────────────────────────────────────── R5
export function r5Sperrliste(k: Pruefkontext): Regelverstoss[] {
  const treffer: string[] = [];
  const details: string[] = [];

  for (const lead of k.leads.leads) {
    const grund = k.sperrliste.get(lead.host);
    if (grund) {
      treffer.push(lead.host);
      details.push(`${lead.host} (${grund.slice(0, 90)})`);
    }
  }

  if (treffer.length === 0) return [];
  return [
    {
      id: "R5_SPERRLISTE",
      schwere: "blocker",
      betroffen: treffer,
      meldung: `Gesperrte Domains in der Lead-Liste: ${details.join(" · ")}.`,
    },
  ];
}

// ─────────────────────────────────────────────────────────── R6
export function r6Kategorie(k: Pruefkontext): Regelverstoss[] {
  const tokens = ausschlussTokens(k.sweep.branche);
  if (tokens.length === 0) return [];

  const treffer: string[] = [];
  const details: string[] = [];
  for (const lead of k.leads.leads) {
    const text = normalisiere(`${lead.titel} ${lead.host}`);
    const gefunden = tokens.filter((t) => text.includes(t));
    if (gefunden.length > 0) {
      treffer.push(lead.host);
      details.push(`${lead.host} („${gefunden.join("/")}")`);
    }
  }

  if (treffer.length === 0) return [];
  return [
    {
      id: "R6_KATEGORIE",
      schwere: "warnung",
      betroffen: treffer,
      meldung:
        `Möglicherweise anderes Geschäftsmodell: ${details.join(" · ")}. ` +
        `Vor dem Anschreiben prüfen — ein Betrieb, der beides macht, ist ein legitimer Lead.`,
    },
  ];
}

// ─────────────────────────────────────────────────────────── R7
export function r7Grounding(k: Pruefkontext): Regelverstoss[] {
  const v: Regelverstoss[] = [];
  const ohneGrounding = k.sweep.protokoll.filter((p) => p.grounding === undefined);

  if (ohneGrounding.length === k.sweep.protokoll.length && k.sweep.protokoll.length > 0) {
    return [
      {
        id: "R7_GROUNDING",
        schwere: "warnung",
        betroffen: [],
        meldung:
          "Sweep enthält keine Grounding-Daten (entstanden vor der Erweiterung von lib/bedrock.ts). " +
          "Halluzinierte Zitate sind für diesen Lauf nicht ausschließbar. Für neue Läufe gilt das nicht mehr.",
      },
    ];
  }

  const ungegroundet = k.sweep.protokoll
    .filter((p) => p.grounding && !p.grounding.ok)
    .map((p) => p.prompt);
  if (ungegroundet.length > 0) {
    v.push({
      id: "R7_GROUNDING",
      schwere: "blocker",
      betroffen: ungegroundet,
      meldung:
        `${ungegroundet.length} von ${k.sweep.protokoll.length} Prompts liefen OHNE Grounding — ` +
        `das Modell hat frei geantwortet statt aus Suchergebnissen. Diese Antworten sind wertlos.`,
    });
  }

  // Erfundene URLs: Der Schaden entsteht erst, wenn eine davon als Nennung in
  // die Auswertung eingeht. Eine halluzinierte Portal-URL, die ohnehin
  // herausgefiltert wurde, darf keinen ganzen Lauf blockieren — sonst wird der
  // Gate zur Formalie, die man routinemäßig übergeht.
  const kandidatenHosts = new Set(k.sweep.kandidaten.map((c) => c.host));
  const wirksam: string[] = [];
  const folgenlos: string[] = [];

  for (const p of k.sweep.protokoll) {
    if (!p.grounding?.ok) continue;
    const erlaubt = new Set(p.grounding.links);
    for (const quelle of p.quellen) {
      if (erlaubt.has(quelle)) continue;
      const host = hostOf(quelle);
      (host && kandidatenHosts.has(host) ? wirksam : folgenlos).push(quelle);
    }
  }

  if (wirksam.length > 0) {
    v.push({
      id: "R7_GROUNDING",
      schwere: "blocker",
      betroffen: [...new Set(wirksam)],
      meldung:
        `${new Set(wirksam).size} zitierte URLs standen nicht in den gelieferten Quellen — das Modell ` +
        `hat sie erfunden — UND ihre Domains sind als Nennung in die Auswertung eingegangen. ` +
        `Der Befund wäre damit teilweise erfunden.`,
    });
  }
  if (folgenlos.length > 0) {
    v.push({
      id: "R7_GROUNDING",
      schwere: "warnung",
      betroffen: [...new Set(folgenlos)],
      meldung:
        `${new Set(folgenlos).size} zitierte URLs standen nicht in den gelieferten Quellen (erfunden), ` +
        `wirkten sich aber nicht auf das Ergebnis aus — die Domains sind nicht in der Kandidatenliste ` +
        `(z. B. herausgefilterte Portale).`,
    });
  }

  return v;
}

// ─────────────────────────────────────────────────────────── R8
export function r8Zahlen(k: Pruefkontext): Regelverstoss[] {
  const zuPruefen: [string, number][] = [
    ["marktGroesse", k.leads.marktGroesse],
    ["leads", k.leads.leads.length],
    ["sichtbar", k.leads.sichtbar.length],
    ...k.sweep.kandidaten.map((c) => [`nennungen(${c.host})`, c.nennungen] as [string, number]),
  ];
  const kaputt = zuPruefen.filter(([, wert]) => !Number.isFinite(wert)).map(([name]) => name);

  if (kaputt.length === 0) return [];
  return [
    {
      id: "R8_ZAHLEN",
      schwere: "blocker",
      betroffen: kaputt,
      meldung: `Ungültige Kennzahlen (NaN/Infinity): ${kaputt.join(", ")}. Diese Zahlen landen im Kundenbericht.`,
    },
  ];
}

/** Alle netzfreien Regeln in fester Reihenfolge. */
export const OFFLINE_REGELN = [
  r0Schema,
  r1MarktUnterfassung,
  r2PromptMarktMismatch,
  r3PortalLeckage,
  r4AliasDomain,
  r5Sperrliste,
  r6Kategorie,
  r7Grounding,
  r8Zahlen,
] as const;

export function pruefeOffline(k: Pruefkontext): Regelverstoss[] {
  return OFFLINE_REGELN.flatMap((regel) => regel(k));
}
