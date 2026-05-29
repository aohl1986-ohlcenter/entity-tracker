import type { Classification } from "./classify";

export type ScoreInput = {
  classification: Classification;
  position: number;
}[];

export type Counts = {
  owned: number;
  authority: number;
  displacement: number;
  neutral: number;
};

export function countByClass(results: ScoreInput, topN = 10): Counts {
  const top = results.filter((r) => r.position <= topN);
  return {
    owned: top.filter((r) => r.classification === "owned").length,
    authority: top.filter((r) => r.classification === "authority").length,
    displacement: top.filter((r) => r.classification === "displacement").length,
    neutral: top.filter((r) => r.classification === "neutral").length,
  };
}

/**
 * SERP Domination Score: share of top-10 controlled by owned+authority,
 * with a position-weighted bonus (top spots count more).
 */
export function dominationScore(results: ScoreInput, topN = 10): number {
  let raw = 0;
  let max = 0;
  for (let pos = 1; pos <= topN; pos++) {
    const weight = topN - pos + 1;
    max += weight;
    const r = results.find((x) => x.position === pos);
    if (!r) continue;
    if (r.classification === "owned" || r.classification === "authority") raw += weight;
    if (r.classification === "displacement") raw -= weight * 0.5;
  }
  return Math.max(0, Math.round((raw / max) * 100));
}
