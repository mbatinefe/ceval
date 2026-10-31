import type { Market } from "../../shared/scan.ts";
import type { VisualSearch } from "../../shared/visual-search.ts";
import type { FoundProduct } from "./continuity.ts";
export function visualResultMatches(
  row: FoundProduct,
  result: VisualSearch,
  market: Market,
) {
  return row.product.id === result.productId && result.market === market;
}
export function visualSearchNeeded(
  row: FoundProduct,
  market: Market,
  available: boolean,
) {
  const uncertain =
    !row.product.brand ||
    !row.product.model ||
    (row.product.confidence < 0.85 &&
      row.product.identification !== "user_selected");
  return (
    available &&
    uncertain &&
    Boolean(row.thumbnail) &&
    !row.selecting &&
    !row.visualSearching &&
    !row.visualError &&
    !(
      row.visualSearch &&
      visualResultMatches(row, row.visualSearch, market) &&
      row.visualSearch.expiresAt > Date.now()
    )
  );
}
