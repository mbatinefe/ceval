export const markets = {
  US: { name: "United States", currency: "USD" },
  GB: { name: "United Kingdom", currency: "GBP" },
  TR: { name: "Türkiye", currency: "TRY" },
} as const;
export type Market = keyof typeof markets;
export type Mode = "buy" | "resale";
export type Box = { x: number; y: number; width: number; height: number };
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
  evidenceType?: "cited_summary";
};
export type Comparison = {
  id: string;
  product: Product;
  mode: Mode;
  market: Market;
  offers: Offer[];
  checkedAt: number;
  expiresAt: number;
  status: "found" | "no_evidence";
  saved?: boolean;
};
export type ScanCapabilities = {
  analysisAvailable: boolean;
  reason: string | null;
  maxFrameBytes: number;
  maxVideoBytes: number;
  maxVideoSeconds: number;
};
