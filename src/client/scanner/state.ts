import type { Comparison, Market, Mode, Product } from "../../shared/scan.ts";
import type { FoundProduct } from "./continuity.ts";
import { findSummary } from "./presentation.ts";
export class ScanFindCount {
  private seen = new Set<string>();
  private total = 0;
  update(
    rows: readonly {
      historyId?: string;
      rowId?: string;
      product?: { id: string };
    }[],
  ): number {
    if (!rows.length) {
      this.seen.clear();
      this.total = 0;
    }
    for (const row of rows) {
      const aliases = [
        row.historyId && `history:${row.historyId}`,
        row.rowId && `row:${row.rowId}`,
        row.product?.id && `product:${row.product.id}`,
      ].filter((id): id is string => Boolean(id));
      if (aliases.length && !aliases.some((id) => this.seen.has(id)))
        this.total++;
      for (const id of aliases) this.seen.add(id);
    }
    return this.total;
  }
}
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
export function switchComparisonMode(
  rows: FoundProduct[],
  mode: Mode,
  market: Market,
  cache: Map<string, Comparison>,
): FoundProduct[] {
  return rows.map((row) => ({
    ...row,
    comparison: cachedComparison(cache, row.product, mode, market),
    searching: false,
    error: row.errorCode === "shelf_changed" ? row.error : undefined,
    errorCode: row.errorCode === "shelf_changed" ? row.errorCode : undefined,
    retryable: false,
    visualError: undefined,
  }));
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
    visualSearching: false,
    ...(row.visualSearching
      ? { visualError: "Image search paused. Try again when ready." }
      : {}),
  }));
}
export function completionMessage(
  rows: FoundProduct[],
  reason: "video" | "error" | "stopped",
  draining: boolean,
  context?: { mode: Mode; market: Market },
) {
  if (draining)
    return reason === "stopped"
      ? "Scan stopped. Finishing your searches…"
      : "Finishing your remaining comparisons…";
  const prefix =
    reason === "video"
      ? "Video complete."
      : reason === "stopped"
        ? "Scan stopped."
        : "Scanning paused.";
  if (!rows.length) return `${prefix} No products identified yet.`;
  const summary = (row: FoundProduct) =>
    findSummary(
      row,
      context?.mode ?? row.comparison?.mode ?? row.visualSearch?.mode ?? "buy",
      context?.market ??
        row.comparison?.market ??
        row.visualSearch?.market ??
        "US",
    );
  const completedRows = rows.filter(
    (row) => summary(row) && !row.error && !row.searching && !row.selecting,
  );
  const completed = completedRows.length;
  const similar = completedRows.filter(
    (row) => summary(row)?.source === "visual",
  ).length;
  const needsAttention = rows.length - completed;
  const prices = completed
    ? `${completed} find${completed === 1 ? "" : "s"} with prices${similar ? ` (${similar} from similar items)` : ""}.`
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
    ? now + (details.code && details.code !== "request_failed" ? 61000 : 12000)
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
