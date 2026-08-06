/**
 * Der Diff-Kern der Lead-Ermittlung — rein, ohne fetch/fs/process.argv.
 *
 * Dadurch ist die eigentliche Logik offline testbar und `akquise-leads.ts`
 * schrumpft auf I/O plus Serper-Aufrufe.
 */
import { istPortal } from "./portale";
import type { LeadsDatei, MarktTreffer, SweepDatei } from "./typen";

/**
 * Gleicht den realen Markt gegen die von der KI zitierten Hosts ab.
 * Leads = existiert bei Google, wird aber in keiner KI-Antwort genannt.
 *
 * Portale werden hier NICHT mehr gefiltert — das erledigt der Aufrufer bereits
 * beim Einsammeln. Die Funktion prüft es defensiv trotzdem, damit ein
 * durchgerutschtes Portal nie als Lead herauskommt.
 */
export function berechneLeads(
  sweep: SweepDatei,
  markt: MarktTreffer[],
  suchen: string[],
): LeadsDatei {
  const zitiert = new Map<string, number>(sweep.kandidaten.map((k) => [k.host, k.nennungen]));
  const echterMarkt = markt.filter((m) => m.host && !istPortal(m.host));

  const leads = echterMarkt
    .filter((m) => !zitiert.has(m.host))
    .sort((a, b) => b.positionen.length - a.positionen.length);

  const sichtbar = echterMarkt
    .filter((m) => zitiert.has(m.host))
    .map((m) => ({ ...m, nennungen: zitiert.get(m.host) ?? 0 }))
    .sort((a, b) => b.nennungen - a.nennungen);

  return {
    branche: sweep.branche,
    region: sweep.region,
    datum: sweep.datum,
    suchen,
    marktGroesse: echterMarkt.length,
    leads,
    sichtbar,
  };
}

/**
 * Sichtbarkeitsquote in Prozent.
 *
 * Gibt `null` statt `NaN` zurück, wenn der Markt leer ist — der alte Code
 * schrieb in dem Fall „NaN %" in den Kundenbericht.
 */
export function sichtbarkeitsQuote(leads: LeadsDatei): number | null {
  if (leads.marktGroesse === 0) return null;
  return Math.round((leads.sichtbar.length / leads.marktGroesse) * 100);
}

/** Zitierte Hosts, die keine Portale sind — Bezugsgröße für R1. */
export function zitierteNichtPortale(sweep: SweepDatei): string[] {
  return sweep.kandidaten.map((k) => k.host).filter((h) => h && !istPortal(h));
}
