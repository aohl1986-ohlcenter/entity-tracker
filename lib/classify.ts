import type { TargetUrl } from "./schema";

export type Classification = "owned" | "authority" | "displacement" | "neutral";

export type Classified = {
  classification: Classification;
  matchedLabel: string | null;
};

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function normalize(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, ""))
      .toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\/+$/, "");
  return new RegExp("^" + escaped + "(/|$)");
}

/** Prüft, ob eine URL ein Glob-Pattern (gleiche Logik wie Targets) trifft. */
export function matchesPattern(url: string, pattern: string): boolean {
  return patternToRegex(pattern).test(normalize(url));
}

export function classifyUrl(url: string, targets: TargetUrl[]): Classified {
  const norm = normalize(url);
  const order: Classification[] = ["owned", "authority", "displacement"];
  for (const category of order) {
    for (const t of targets.filter((t) => t.category === category)) {
      if (patternToRegex(t.pattern).test(norm)) {
        return { classification: category, matchedLabel: t.label };
      }
    }
  }
  return { classification: "neutral", matchedLabel: null };
}
