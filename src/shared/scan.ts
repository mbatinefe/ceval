export const markets = {
  US: { name: "United States", currency: "USD" },
  GB: { name: "United Kingdom", currency: "GBP" },
  TR: { name: "Türkiye", currency: "TRY" },
} as const;
export type Market = keyof typeof markets;
export type Mode = "buy" | "resale";
export type Box = { x: number; y: number; width: number; height: number };
export type ModelCandidate = {
  brand: string;
  model: string;
  variant: string;
  reason: string;
};
export const modelCandidateKey = (candidate: ModelCandidate) =>
  JSON.stringify([candidate.brand, candidate.model, candidate.variant]);
export type Product = {
  id: string;
  brand: string;
  model: string;
  variant: string;
  label: string;
  confidence: number;
  box: Box;
  shelfPriceMinor: number | null;
  shelfCurrency: string | null;
  candidates?: ModelCandidate[];
  identification?: "user_selected";
  previousProductId?: string;
};
export type Offer = {
  title: string;
  url: string;
  priceMinor: number;
  currency: string;
  condition: "new" | "used" | "refurbished" | "unknown";
  kind: "retail" | "asking" | "sold";
  match: "exact" | "possible";
  evidence: string;
  evidenceType?: "cited_summary" | "product_page";
};
export type ProductSource = { title: string; url: string };
export type Comparison = {
  id: string;
  product: Product;
  mode: Mode;
  market: Market;
  offers: Offer[];
  sources?: ProductSource[];
  checkedAt: number;
  expiresAt: number;
  status: "found" | "no_evidence";
  saved?: boolean;
};
export type ScanCapabilities = {
  trial: boolean;
  trialAccess?: {
    durationSeconds: number;
    startedAt: number | null;
    expiresAt: number | null;
    remainingSeconds: number;
    serverNow: number;
  };
  analysisAvailable: boolean;
  visualSearchAvailable?: boolean;
  reason: string | null;
  maxFrameBytes: number;
  maxVideoBytes: number;
  maxVideoSeconds: number;
};
