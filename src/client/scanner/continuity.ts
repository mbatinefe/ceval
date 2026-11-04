import { equivalentPackageVariants } from "../../shared/package-size.ts";
import { MAX_HISTORY_ENTRIES } from "../../shared/history.ts";
import type { VisualSearch } from "../../shared/visual-search.ts";
import type {
  Box,
  Comparison,
  Market,
  Mode,
  Product,
} from "../../shared/scan.ts";
import type { GrayFrame } from "./tracking.ts";
import { frameDifference, trackDetection } from "./tracking.ts";
import { cachedComparison, comparisonKey } from "./state.ts";
import { modelIdentityKey } from "../../shared/model-identity.ts";
import { sameObjectAfterPan } from "./visual-return.ts";

export type FoundProduct = {
  rowId?: string;
  historyId?: string;
  thumbnail?: string;
  product: Product;
  comparison?: Comparison;
  visualSearch?: VisualSearch;
  visualSearching?: boolean;
  visualError?: string;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  searching?: boolean;
  time: number;
  selecting?: boolean;
  sighting?: {
    product: Product;
    at: number;
    appearance: number[];
    frame?: GrayFrame;
  };
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
function normalizedVariant(value: string) {
  const spaced = value.replace(/(\d+)\s*tea\s*bags?\b/gi, "$1 tea bags");
  // Tea cartons repeat the product type beside the count; that is not a new pack.
  return normalize(
    /\d+ tea bags/i.test(spaced)
      ? spaced.replace(/\bpure black tea\b/gi, "")
      : spaced,
  );
}
function variantsCompatible(a: string, b: string) {
  if (equivalentPackageVariants(a, b)) return true;
  const left = normalizedVariant(a).split(" ").filter(Boolean),
    right = normalizedVariant(b).split(" ").filter(Boolean);
  if (!left.length || !right.length) return true;
  const descriptors = new Set([
    "wired",
    "wireless",
    "matte",
    "glossy",
    "finish",
    "color",
    "colour",
    "body",
    "only",
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
    !!modelName(a) &&
    modelName(a) === modelName(b)
  );
}
function modelName(product: { brand: string; model: string }) {
  const name = modelIdentityKey(product.model);
  return brand(product.brand) === "sony"
    ? name.replace(/^(alpha|α)(?=\d)/, "a")
    : name;
}
function sameSonyNumber(a: Product, b: Product) {
  if (brand(a.brand) !== "sony" || brand(b.brand) !== "sony") return false;
  const left = modelName(a),
    right = modelName(b);
  return (
    /^a?\d{4}$/.test(left) &&
    /^a?\d{4}$/.test(right) &&
    left !== right &&
    left.replace(/^a/, "") === right.replace(/^a/, "")
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
  const describe = (product: Product) => {
    const omitted = new Set([
      ...normalize(product.brand).split(" "),
      ...normalize(product.variant).split(" "),
    ]);
    const words = normalize(product.label).split(" ");
    if (words.includes("case")) {
      omitted.add("zip");
      omitted.add("zippered");
    }
    return words
      .filter((word) => !omitted.has(word))
      .sort()
      .join(" ");
  };
  const label = describe(a),
    other = describe(b);
  const left = new Set(label.split(" ").filter(Boolean)),
    right = new Set(other.split(" ").filter(Boolean));
  // A small wording change only admits an image comparison; it cannot merge rows itself.
  const subset = (shorter: Set<string>, longer: Set<string>) =>
    shorter.size >= 5 &&
    longer.size === shorter.size + 1 &&
    [...shorter].every((word) => longer.has(word));
  const descriptionMatches =
    label === other || subset(left, right) || subset(right, left);
  const proportions = a.box.width / a.box.height / (b.box.width / b.box.height);
  return (
    label.length > 0 &&
    descriptionMatches &&
    brand(a.brand) === brand(b.brand) &&
    normalize(a.model) === normalize(b.model) &&
    proportions >= 0.8 &&
    proportions <= 1.25
  );
}
function appearance(frame: GrayFrame, product: Pick<Product, "box">) {
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
function registeredDistance(a: number[], b: number[]) {
  let best = Infinity;
  for (const scale of [0.9, 1, 1.1])
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const left: number[] = [],
          right: number[] = [];
        for (let y = 2; y < 10; y++)
          for (let x = 2; x < 10; x++) {
            const px = 5.5 + (x - 5.5) * scale + dx,
              py = 5.5 + (y - 5.5) * scale + dy;
            if (px < 0 || py < 0 || px >= 11 || py >= 11) continue;
            const lx = Math.floor(px),
              ly = Math.floor(py),
              fx = px - lx,
              fy = py - ly;
            left.push(a[y * 12 + x]);
            right.push(
              b[ly * 12 + lx] * (1 - fx) * (1 - fy) +
                b[ly * 12 + lx + 1] * fx * (1 - fy) +
                b[(ly + 1) * 12 + lx] * (1 - fx) * fy +
                b[(ly + 1) * 12 + lx + 1] * fx * fy,
            );
          }
        if (left.length < 49) continue;
        best = Math.min(
          best,
          visualDistance(left, right) +
            (Math.abs(dx) + Math.abs(dy)) * 0.5 +
            Math.abs(scale - 1) * 5,
        );
      }
  return best;
}
function overlap(a: Box, b: Box) {
  const intersection =
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (
    intersection / (a.width * a.height + b.width * b.height - intersection)
  );
}
function continuousPosition(
  previous: GrayFrame,
  current: GrayFrame,
  before: Box,
  after: Box,
  minimumOverlap: number,
) {
  const original = appearance(previous, { box: before });
  const matchesObject = (position: Box) => {
    if (overlap(position, after) < minimumOverlap) return false;
    const currentCrop = appearance(current, { box: position });
    const limit = minimumOverlap >= 0.7 ? 8 : 18;
    if (visualDistance(original, currentCrop) > limit) return false;
    const exposure =
      original.reduce((sum, value, i) => sum + value - currentCrop[i], 0) /
      original.length;
    let centerDifference = 0;
    for (let y = 3; y < 9; y++)
      for (let x = 3; x < 9; x++)
        centerDifference += Math.abs(
          original[y * 12 + x] - currentCrop[y * 12 + x] - exposure,
        );
    return centerDifference / 36 <= limit;
  };
  const direct = trackDetection(previous, current, before);
  if (direct && matchesObject(direct)) return true;
  if (previous.width !== current.width || previous.height !== current.height)
    return false;
  const dx = Math.round(
    (after.x + after.width / 2 - before.x - before.width / 2) * current.width,
  );
  const dy = Math.round(
    (after.y + after.height / 2 - before.y - before.height / 2) *
      current.height,
  );
  if (
    (!dx && !dy) ||
    Math.abs(dx) > current.width * 0.2 ||
    Math.abs(dy) > current.height * 0.2
  )
    return false;
  // Recenter for a larger pan, then require matching texture, not box location alone.
  const shifted: GrayFrame = {
    ...current,
    pixels: new Uint8Array(current.pixels.length),
  };
  for (let y = 0; y < current.height; y++)
    for (let x = 0; x < current.width; x++) {
      const sx = x + dx,
        sy = y + dy;
      if (sx >= 0 && sy >= 0 && sx < current.width && sy < current.height)
        shifted.pixels[y * current.width + x] =
          current.pixels[sy * current.width + sx];
    }
  const registered = trackDetection(previous, shifted, before);
  return (
    !!registered &&
    matchesObject({
      ...registered,
      x: registered.x + dx / current.width,
      y: registered.y + dy / current.height,
    })
  );
}
function matchScore(
  row: FoundProduct,
  incoming: Product,
  visual: number[],
  now: number,
  frame: GrayFrame,
  uniqueModel: boolean,
) {
  const old = row.product;
  if (!variantsCompatible(old.variant, incoming.variant)) return 0;
  const sonyNumber =
    exact(old) && exact(incoming) && sameSonyNumber(old, incoming);
  const variantMissing =
    exact(old) &&
    exact(incoming) &&
    sameModel(old, incoming) &&
    (!old.variant || !incoming.variant) &&
    old.variant !== incoming.variant;
  if ((sonyNumber || variantMissing) && !uniqueModel) return 0;
  if (exact(old) && exact(incoming) && !sameModel(old, incoming) && !sonyNumber)
    return 0;
  if (old.id === incoming.id && exact(old) && exact(incoming)) return 120;
  if (
    exact(old) &&
    exact(incoming) &&
    sameModel(old, incoming) &&
    (normalizedVariant(old.variant) === normalizedVariant(incoming.variant) ||
      (uniqueModel && !!old.variant && !!incoming.variant))
  )
    return 100;
  const sighting = row.sighting;
  if (!sighting) return 0;
  if (
    incoming.previousProductId &&
    [old.id, sighting.product.id].includes(incoming.previousProductId) &&
    now >= sighting.at &&
    now - sighting.at <= 30000 &&
    (!brand(old.brand) ||
      !brand(incoming.brand) ||
      brand(old.brand) === brand(incoming.brand))
  )
    return 90;
  if (
    variantMissing &&
    sighting.frame &&
    frameDifference(sighting.frame, frame) < 10
  ) {
    const a = sighting.product.box,
      b = incoming.box;
    const intersection =
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(
        0,
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
      );
    const overlap =
      intersection / (a.width * a.height + b.width * b.height - intersection);
    if (overlap >= 0.55) return 85;
  }
  // A user's choice outlasts later visual guesses about the same textured object.
  if (
    old.identification === "user_selected" &&
    !exact(incoming) &&
    (!brand(incoming.brand) || brand(incoming.brand) === brand(old.brand)) &&
    sighting.frame &&
    Number.isFinite(visualDistance(sighting.appearance, sighting.appearance)) &&
    (continuousPosition(
      sighting.frame,
      frame,
      sighting.product.box,
      incoming.box,
      0.8,
    ) ||
      sameObjectAfterPan(
        sighting.frame,
        frame,
        sighting.product.box,
        incoming.box,
      ))
  )
    return 88;
  const nearby = now >= sighting.at && now - sighting.at <= 20000;
  const unresolvedDescription = sameUnresolvedDescription(
    sighting.product,
    incoming,
  );
  const identityEvidence =
    candidateOverlap(old, incoming) ||
    candidateOverlap(sighting.product, incoming) ||
    familyOverlap(sighting.product, incoming) ||
    sonyNumber;
  if (!identityEvidence && !unresolvedDescription) return 0;
  // Detector crops can change while the same textured object stays in view.
  // Match its image features before comparing independently resized crops.
  if (
    sighting.frame &&
    Number.isFinite(visualDistance(sighting.appearance, sighting.appearance))
  ) {
    if (
      continuousPosition(
        sighting.frame,
        frame,
        sighting.product.box,
        incoming.box,
        nearby ? 0.55 : 0.7,
      ) ||
      (unresolvedDescription &&
        sameObjectAfterPan(
          sighting.frame,
          frame,
          sighting.product.box,
          incoming.box,
        ))
    )
      return 78;
  }
  let distance = visualDistance(sighting.appearance, visual);
  if (
    distance > (unresolvedDescription ? (nearby ? 8 : 4) : nearby ? 18 : 8) &&
    sighting.frame &&
    frameDifference(sighting.frame, frame) < 18
  )
    distance = Math.min(
      distance,
      registeredDistance(sighting.appearance, visual),
    );
  if (distance > (nearby ? 18 : 8)) return 0;
  const strongUnresolvedMatch =
    distance <= (nearby ? 8 : 4) && unresolvedDescription;
  if (!identityEvidence && !strongUnresolvedMatch) return 0;
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
  // Physical continuity was established before this choice. Retain the photo's
  // server snapshot while its search is pending, cached, or awaiting a retry.
  if (
    !exact(incoming) &&
    (row.visualSearching || row.visualSearch || row.visualError)
  )
    return true;
  if (exact(row.product) && !exact(incoming)) return true;
  return (
    exact(row.product) &&
    exact(incoming) &&
    (sameModel(row.product, incoming) ||
      (sameSonyNumber(row.product, incoming) &&
        modelName(row.product).startsWith("a"))) &&
    variantsCompatible(row.product.variant, incoming.variant) &&
    (equivalentPackageVariants(row.product.variant, incoming.variant) ||
      normalizedVariant(incoming.variant)
        .split(" ")
        .filter(Boolean)
        .every((word) =>
          normalizedVariant(row.product.variant).split(" ").includes(word),
        ))
  );
}
type SightingContext = {
  time: number;
  now: number;
  frame: GrayFrame;
  mode: Mode;
  market: Market;
  cache: Map<string, Comparison>;
  photos?: Map<string, string>;
};
type ReconciledSightings = { rows: FoundProduct[]; sightings: FoundProduct[] };
function* reconciliationSteps(
  existing: FoundProduct[],
  products: Product[],
  context: SightingContext,
): Generator<void, ReconciledSightings> {
  const rows = [...existing],
    sightings: FoundProduct[] = [];
  const appearances = products.map((product) =>
    appearance(context.frame, product),
  );
  const related = (a: Product, b: Product) =>
    exact(a) &&
    exact(b) &&
    (sameModel(a, b) || sameSonyNumber(a, b)) &&
    variantsCompatible(a.variant, b.variant);
  const matches: { p: number; r: number; score: number }[] = [];
  for (const [p, product] of products.entries()) {
    const uniqueModel =
      existing.filter((other) => related(other.product, product)).length ===
        1 && products.filter((other) => related(other, product)).length === 1;
    for (const [r, row] of existing.entries()) {
      const score = matchScore(
        row,
        product,
        appearances[p],
        context.now,
        context.frame,
        uniqueModel,
      );
      if (score > 0) matches.push({ p, r, score });
      yield;
    }
  }
  matches.sort((a, b) => b.score - a.score);
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
      historyId: previous?.historyId || crypto.randomUUID(),
      thumbnail: previous?.thumbnail || context.photos?.get(incoming.id),
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
        frame: context.frame,
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
  return { rows: rows.slice(0, MAX_HISTORY_ENTRIES), sightings };
}

export function reconcileSightings(
  existing: FoundProduct[],
  products: Product[],
  context: SightingContext,
) {
  const steps = reconciliationSteps(existing, products, context);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

export async function reconcileCurrentSightings(
  getRows: () => FoundProduct[],
  products: Product[],
  context: SightingContext,
  signal: AbortSignal,
  isCurrent: () => boolean,
  publish: (result: ReconciledSightings) => void,
): Promise<ReconciledSightings | null> {
  const active = () => !signal.aborted && isCurrent();
  while (active()) {
    const snapshot = getRows();
    const steps = reconciliationSteps(snapshot, products, context);
    let sliceStarted = performance.now();
    for (;;) {
      if (!active()) return null;
      // A completed search or model choice must survive work done across a yield.
      if (getRows() !== snapshot) break;
      const step = steps.next();
      if (step.done) {
        // Publish in the same turn as the snapshot check, before promise callbacks.
        publish(step.value);
        return step.value;
      }
      if (performance.now() - sliceStarted >= 4) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        sliceStarted = performance.now();
      }
    }
  }
  return null;
}
