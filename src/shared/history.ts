import type { VisualSearch } from "./visual-search.ts";
import type { Comparison, Market, Mode, Product } from "./scan.ts";

export const MAX_HISTORY_THUMBNAIL_CHARS = 40_000;
export const MAX_HISTORY_ENTRIES = 100;
export type ScanHistorySource = "camera" | "video" | "sample";
export type ScanHistoryEntry = {
  id: string;
  product: Product;
  comparison?: Comparison;
  visualSearch?: VisualSearch;
  thumbnailUrl?: string;
  source: ScanHistorySource;
  market?: Market;
  mode: Mode;
  createdAt: number;
  updatedAt: number;
};
export type SaveScanHistory = {
  id: string;
  productId: string;
  comparisonId?: string;
  thumbnail?: string;
  source: ScanHistorySource;
  mode: Mode;
};
