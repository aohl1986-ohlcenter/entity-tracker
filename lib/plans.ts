// Paket-Definitionen — Single Source of Truth für Limits + Feature-Gates.
// Entspricht den Paketen auf pragma-code.de/ki-sichtbarkeits-monitoring.
// Abrechnung läuft manuell (Rechnung) — priceEur ist reine Anzeige.

export type PlanId = "radar" | "insights" | "suite";
export type TenantStatus = "active" | "paused" | "cancelled";

export type PlanDef = {
  id: PlanId;
  label: string;
  priceEur: number;
  maxKeywords: number;
  /** Verdrängungs-Analyse (Alerts + Dashboard-Spalte) */
  displacementAnalysis: boolean;
  /** Wunschlink-Abdeckung (Dashboard-KPI + Digest-Block) */
  wantedLinkCoverage: boolean;
  /** GEO-Empfehlungen-Sektion (Operator-gepflegter Text) */
  geoRecommendations: boolean;
  /** Hands-on-Services — nur Label, wird manuell erbracht */
  handsOnServices: boolean;
};

export const PLANS: Record<PlanId, PlanDef> = {
  radar: {
    id: "radar",
    label: "Radar",
    priceEur: 149,
    maxKeywords: 10,
    displacementAnalysis: false,
    wantedLinkCoverage: false,
    geoRecommendations: false,
    handsOnServices: false,
  },
  insights: {
    id: "insights",
    label: "Radar + Insights",
    priceEur: 299,
    maxKeywords: 25,
    displacementAnalysis: true,
    wantedLinkCoverage: true,
    geoRecommendations: true,
    handsOnServices: false,
  },
  suite: {
    id: "suite",
    label: "Visibility Suite",
    priceEur: 590,
    maxKeywords: 25,
    displacementAnalysis: true,
    wantedLinkCoverage: true,
    geoRecommendations: true,
    handsOnServices: true,
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export const TENANT_STATUSES: TenantStatus[] = ["active", "paused", "cancelled"];

export const STATUS_LABELS: Record<TenantStatus, string> = {
  active: "Aktiv",
  paused: "Pausiert",
  cancelled: "Gekündigt",
};

/** Safe Lookup — unbekannte Werte fallen auf "radar" (kleinstes Paket) zurück. */
export function planFor(plan: string | null | undefined): PlanDef {
  return PLANS[(plan ?? "") as PlanId] ?? PLANS.radar;
}
