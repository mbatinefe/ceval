import type { Comparison, Market, Mode, Product } from "../../shared/scan.ts";
import type { FoundProduct } from "./continuity.ts";
import { offerSummary } from "./presentation.ts";
export function findActionRow(
  rows: FoundProduct[],
  productId: string,
  rowId?: string,
) {
  const matches = rows.filter(
    (row) => row.product.id === productId && (!rowId || row.rowId === rowId),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function comparisonNeeded(row: FoundProduct) {
  return (
    !!row.product.brand &&
    !!row.product.model &&
    (row.product.confidence >= 0.85 ||
      row.product.identification === "user_selected") &&
    !row.searching &&
    !row.selecting &&
    !row.error &&
    (!row.comparison || row.comparison.expiresAt <= Date.now())
  );
}
export function interruptFinds(rows: FoundProduct[]): FoundProduct[] {
  return rows.map((row) => ({
    ...row,
    ...(row.searching
      ? {
          error: "Price comparison paused. Retry when you’re ready.",
          errorCode: "interrupted",
          retryable: true,
        }
      : row.selecting
        ? {
            error: "Model selection paused. Choose a model to continue.",
            errorCode: "interrupted",
            retryable: false,
          }
        : {}),
    searching: false,
    selecting: false,
  }));
}
export function completionMessage(
  rows: FoundProduct[],
  reason: "video" | "error",
  draining: boolean,
) {
  if (draining) return "Finishing your remaining comparisons…";
  const prefix = reason === "video" ? "Video complete." : "Scanning paused.";
  if (!rows.length) return `${prefix} No products identified yet.`;
  const completed = rows.filter(
    (row) =>
      offerSummary(row.comparison) &&
      !row.error &&
      !row.searching &&
      !row.selecting,
  ).length;
  const needsAttention = rows.length - completed;
  const prices = completed
    ? `${completed} find${completed === 1 ? "" : "s"} with prices.`
    : "No prices found yet.";
  return `${prefix} ${prices}${needsAttention ? ` ${needsAttention} find${needsAttention === 1 ? " needs" : "s need"} attention.` : ""}`;
}
export function isAllowanceError(code?: string) {
  return [
    "allowance_exhausted",
    "daily_budget_exhausted",
    "total_budget_exhausted",
    "account_allowance_exhausted",
  ].includes(code || "");
}
export function recognitionRetryAt(
  error: unknown,
  attempts: number,
  now: number,
): number | null {
  if (attempts > 0 || !error || typeof error !== "object") return null;
  const details = error as { code?: string; status?: number };
  if (isAllowanceError(details.code)) return null;
  return error instanceof TypeError ||
    (details.status !== undefined && details.status >= 500)
    ? now + 12000
    : null;
}
export function comparisonKey(
  product: Product,
  mode: Mode,
  market: Market,
): string {
  return JSON.stringify([
    product.id,
    mode,
    market,
    product.shelfPriceMinor,
    product.shelfCurrency,
    product.brand,
    product.model,
    product.variant,
  ]);
}
export function cachedComparison(
  cache: Map<string, Comparison>,
  product: Product,
  mode: Mode,
  market: Market,
): Comparison | undefined {
  const result = cache.get(comparisonKey(product, mode, market));
  return result && result.expiresAt > Date.now() ? result : undefined;
}
export async function playCurrent(
  play: () => Promise<void>,
  isCurrent: () => boolean,
): Promise<boolean> {
  try {
    await play();
    return isCurrent();
  } catch (error) {
    if (!isCurrent()) return false;
    throw error;
  }
}

export function cacheMatchingComparison(
  cache: Map<string, Comparison>,
  product: Product,
  mode: Mode,
  market: Market,
  comparison: Comparison,
): boolean {
  const key = comparisonKey(product, mode, market);
  if (
    key !==
    comparisonKey(comparison.product, comparison.mode, comparison.market)
  )
    return false;
  cache.set(key, comparison);
  return true;
}
