import type { Market, Mode, ModelCandidate } from "./scan.ts";
export type VisualCandidate = {
  id: string;
  title: string;
  url: string;
  source: string;
  thumbnail?: string;
  photos?: string[];
  assessment: "likely" | "similar" | "unreviewed";
  reason: string;
  identity?: ModelCandidate;
  price?: {
    priceMinor: number;
    currency: string;
    evidenceType: "search_result" | "product_page";
    kind: "retail" | "asking";
    condition: "new" | "used" | "refurbished" | "unknown";
  };
};
export type VisualSearch = {
  provider: "meta";
  version: 2;
  productId: string;
  market: Market;
  mode?: Mode;
  candidates: VisualCandidate[];
  checkedAt: number;
  expiresAt: number;
  ranking: "meta" | "unavailable" | "no_matches";
};
export const visualCandidateKey = (id: string) => `visual:${id}`;

export function visualSearchForMarket(
  result: VisualSearch | undefined,
  market: Market,
  mode: Mode = "buy",
) {
  return result?.market === market && (result.mode ?? "buy") === mode
    ? result
    : undefined;
}

export function visualListingCondition(candidate: VisualCandidate): string {
  if (/\b(?:refurbished|renewed|reconditioned)\b/i.test(candidate.title))
    return "Refurbished";
  if (/\bopen[ -]box\b/i.test(candidate.title)) return "Open box";
  if (/\b(?:used|pre[ -]?owned)\b/i.test(candidate.title)) return "Used";
  return (
    {
      new: "New",
      used: "Used",
      refurbished: "Refurbished",
      unknown: "",
    } as const
  )[candidate.price?.condition || "unknown"];
}
