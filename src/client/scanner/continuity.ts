import type { Comparison, Market, Mode, Product } from "../../shared/scan.ts";
import type { GrayFrame } from "./tracking.ts";
import { cachedComparison, comparisonKey } from "./state.ts";

export type FoundProduct = {
  rowId?: string;
  product: Product;
  comparison?: Comparison;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  searching?: boolean;
  time: number;
  selecting?: boolean;
  sighting?: { product: Product; at: number; appearance: number[] };
};

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function brand(value: string) {
  return normalize(value).replace(/^logitech g$/, "logitech");
}
function variantsCompatible(a: string, b: string) {
  const left = normalize(a).split(" ").filter(Boolean),
    right = normalize(b).split(" ").filter(Boolean);
  if (!left.length || !right.length) return true;
  const descriptors = new Set([
    "wired",
    "wireless",
    "matte",
    "glossy",
    "finish",
    "color",
    "colour",
  ]);
  const subsetWithDescriptors = (a: string[], b: string[]) =>
    a.every((word) => b.includes(word)) &&
    b
      .filter((word) => !a.includes(word))
      .every((word) => descriptors.has(word));
  return (
    subsetWithDescriptors(left, right) || subsetWithDescriptors(right, left)
  );
}
function exact(product: Product) {
  return (
    !!product.model &&
    (product.identification === "user_selected" ||
      (product.confidence >= 0.85 && !product.candidates?.length))
  );
}
function identities(product: Product) {
  return exact(product) ? [product] : product.candidates || [];
}
function sameModel(
  a: { brand: string; model: string },
  b: { brand: string; model: string },
) {
  return (
    !!brand(a.brand) &&
    brand(a.brand) === brand(b.brand) &&
    !!normalize(a.model) &&
    normalize(a.model).replaceAll(" ", "") ===
      normalize(b.model).replaceAll(" ", "")
  );
}
function candidateOverlap(a: Product, b: Product) {
  return identities(a).some((left) =>
    identities(b).some(
      (right) =>
        sameModel(left, right) &&
        variantsCompatible(left.variant, right.variant),
    ),
  );
}
function familyOverlap(a: Product, b: Product) {
  if (exact(a) || exact(b)) return false;
  const family = (model: string) =>
    normalize(model)
      .split(" ")
      .filter((word) => !/\d/.test(word))
      .slice(0, 2)
      .join(" ");
  return identities(a).some((left) =>
    identities(b).some((right) => {
      const name = family(left.model);
      return (
        brand(left.brand) === brand(right.brand) &&
        name.split(" ").length >= 2 &&
        name === family(right.model) &&
        variantsCompatible(left.variant, right.variant)
      );
    }),
  );
}
function sameUnresolvedDescription(a: Product, b: Product) {
  if (exact(a) || exact(b) || a.candidates?.length || b.candidates?.length)
    return false;
  const label = normalize(a.label);
  const proportions = a.box.width / a.box.height / (b.box.width / b.box.height);
  return (
    label.length > 0 &&
    label === normalize(b.label) &&
    brand(a.brand) === brand(b.brand) &&
    normalize(a.model) === normalize(b.model) &&
    proportions >= 0.8 &&
    proportions <= 1.25
  );
}
function appearance(frame: GrayFrame, product: Product) {
  const result: number[] = [];
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      const px = Math.max(
        0,
        Math.min(
          frame.width - 1,
          Math.floor(
            (product.box.x + (product.box.width * (x + 0.5)) / 12) *
              frame.width,
          ),
        ),
      );
      const py = Math.max(
        0,
        Math.min(
          frame.height - 1,
          Math.floor(
            (product.box.y + (product.box.height * (y + 0.5)) / 12) *
              frame.height,
          ),
        ),
      );
      result.push(frame.pixels[py * frame.width + px]);
    }
  return result;
}
function visualDistance(a: number[], b: number[]) {
  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const left = mean(a),
    right = mean(b);
  if (
    Math.abs(left - right) > 35 ||
    mean(a.map((value) => (value - left) ** 2)) < 150 ||
    mean(b.map((value) => (value - right) ** 2)) < 150
  )
    return Infinity;
  return mean(
    a.map((value, index) => Math.abs(value - left - (b[index] - right))),
  );
}
function matchScore(
  row: FoundProduct,
  incoming: Product,
  visual: number[],
  now: number,
) {
  const old = row.product;
  if (!variantsCompatible(old.variant, incoming.variant)) return 0;
  if (exact(old) && exact(incoming) && !sameModel(old, incoming)) return 0;
  if (old.id === incoming.id && exact(old) && exact(incoming)) return 120;
  if (
    exact(old) &&
    exact(incoming) &&
    sameModel(old, incoming) &&
    normalize(old.variant) === normalize(incoming.variant)
  )
    return 100;
  const sighting = row.sighting;
  if (!sighting) return 0;
  const distance = visualDistance(sighting.appearance, visual);
  const nearby = now >= sighting.at && now - sighting.at <= 20000;
  if (distance > (nearby ? 18 : 8)) return 0;
  const strongUnresolvedMatch =
    distance <= (nearby ? 8 : 4) &&
    sameUnresolvedDescription(sighting.product, incoming);
  if (
    !candidateOverlap(old, incoming) &&
    !candidateOverlap(sighting.product, incoming) &&
    !familyOverlap(sighting.product, incoming) &&
    !strongUnresolvedMatch
  )
    return 0;
  const displacement =
    Math.abs(sighting.product.box.x - incoming.box.x) +
    Math.abs(sighting.product.box.y - incoming.box.y);
  return (
    (strongUnresolvedMatch ? 45 : 60) -
    distance -
    Math.min(10, displacement * 10)
  );
}
function keepSnapshot(row: FoundProduct, incoming: Product) {
  if (row.selecting || row.product.identification === "user_selected")
    return true;
  if (row.product.id === incoming.id) return false;
  if (
    row.product.shelfPriceMinor !== incoming.shelfPriceMinor ||
    row.product.shelfCurrency !== incoming.shelfCurrency
  )
    return false;
  if (exact(row.product) && !exact(incoming)) return true;
  return (
    exact(row.product) &&
    exact(incoming) &&
    sameModel(row.product, incoming) &&
    (normalize(row.product.variant) === normalize(incoming.variant) ||
      !incoming.variant)
  );
}
type SightingContext = {
  time: number;
  now: number;
  frame: GrayFrame;
  mode: Mode;
  market: Market;
  cache: Map<string, Comparison>;
};
export function reconcileSightings(
  existing: FoundProduct[],
  products: Product[],
  context: SightingContext,
) {
  const rows = [...existing],
    sightings: FoundProduct[] = [];
  const appearances = products.map((product) =>
    appearance(context.frame, product),
  );
  const matches = products
    .flatMap((product, p) =>
      existing.map((row, r) => ({
        p,
        r,
        score: matchScore(row, product, appearances[p], context.now),
      })),
    )
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);
  const assigned = new Map<number, number>(),
    claimed = new Set<number>();
  for (const match of matches) {
    if (assigned.has(match.p) || claimed.has(match.r)) continue;
    assigned.set(match.p, match.r);
    claimed.add(match.r);
  }
  products.forEach((incoming, index) => {
    const previousIndex = assigned.get(index);
    const previous =
      previousIndex === undefined ? undefined : existing[previousIndex];
    // Keep the complete server snapshot when retaining a choice or comparison.
    // A local row ID must never become a fabricated API product ID.
    const product =
      previous && keepSnapshot(previous, incoming)
        ? { ...previous.product, box: incoming.box }
        : incoming;
    const compatible =
      previous &&
      comparisonKey(previous.product, context.mode, context.market) ===
        comparisonKey(product, context.mode, context.market);
    const row: FoundProduct = {
      ...(compatible ? previous : {}),
      rowId:
        previous?.rowId ||
        previous?.product.id ||
        `${incoming.id}:${context.now}:${index}`,
      product,
      time: context.time,
      searching: compatible ? previous.searching : false,
      selecting: compatible ? previous.selecting : false,
      comparison:
        compatible &&
        previous.comparison &&
        previous.comparison.expiresAt > Date.now() &&
        comparisonKey(
          previous.comparison.product,
          previous.comparison.mode,
          previous.comparison.market,
        ) === comparisonKey(product, context.mode, context.market)
          ? previous.comparison
          : cachedComparison(
              context.cache,
              product,
              context.mode,
              context.market,
            ),
      sighting: {
        product: incoming,
        at: context.now,
        appearance: appearances[index],
      },
    };
    if (
      product.identification === "user_selected" &&
      incoming.shelfPriceMinor !== null &&
      (product.shelfPriceMinor !== incoming.shelfPriceMinor ||
        product.shelfCurrency !== incoming.shelfCurrency)
    ) {
      row.error =
        "The shelf label changed. This comparison uses the earlier shelf price; start a new scan to compare the new label.";
      row.errorCode = "shelf_changed";
      row.searching = false;
      row.retryable = false;
    } else if (
      row.errorCode === "shelf_changed" &&
      product.shelfPriceMinor === incoming.shelfPriceMinor &&
      product.shelfCurrency === incoming.shelfCurrency
    ) {
      row.error = undefined;
      row.errorCode = undefined;
    }
    if (previousIndex !== undefined) rows[previousIndex] = row;
    else rows.push(row);
    sightings.push(row);
  });
  rows.sort((a, b) => (b.sighting?.at || 0) - (a.sighting?.at || 0));
  return { rows: rows.slice(0, 30), sightings };
}
