import type { Market, ModelCandidate } from "./scan.ts";
export type VisualCandidate = {
  id: string;
  title: string;
  url: string;
  source: string;
  thumbnail?: string;
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
  productId: string;
  market: Market;
  candidates: VisualCandidate[];
  checkedAt: number;
  expiresAt: number;
  ranking: "meta" | "unavailable" | "no_matches";
};
export const visualCandidateKey = (id: string) => `visual:${id}`;
