import type { Comparison, Market, Mode, Product } from "../../shared/scan.ts";
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
