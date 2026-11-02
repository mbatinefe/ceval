/** Normalize only explicit quantities; missing units or sizes remain unknown. */
function quantities(value: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  const add = (unit: string, amount: number) => {
    const values = result.get(unit) ?? new Set<number>();
    values.add(amount);
    result.set(unit, values);
  };
  for (const match of value
    .toLowerCase()
    .matchAll(
      /\b(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|tea\s*bags?|capsules?|tablets?|softgels?|gumm(?:y|ies)|count|ct|pieces?|pcs|ml|milliliters?|liters?|litres?|l|kg|grams?|g|ounces?|oz|pounds?|lbs?)\b/g,
    )) {
    const amount = Number(match[1]),
      unit = match[2];
    if (/^(?:ml|milliliter)/.test(unit)) add("volume", amount);
    else if (
      /^(?:l|liter|litre)$/.test(unit) ||
      /^(?:liter|litre)s$/.test(unit)
    )
      add("volume", amount * 1000);
    else if (/^(?:fl|fluid)/.test(unit)) add("volume", amount * 29.5735);
    else if (unit === "kg") add("weight", amount * 1000);
    else if (/^(?:g|gram|grams)$/.test(unit)) add("weight", amount);
    else if (/^(?:oz|ounce)/.test(unit)) add("weight", amount * 28.3495);
    else if (/^(?:lb|pound)/.test(unit)) add("weight", amount * 453.592);
    else add("count", amount);
  }
  for (const match of value.matchAll(
    /\b(?:(\d+)\s*[- ]?packs?\b|packs?\s+of\s+(\d+)\b|(\d+)\s*[x×]\s*\d+\s*(?:capsules?|tablets?|softgels?|bottles?|pieces?|pcs|ml|g|oz)\b)/gi,
  ))
    add("pack", Number(match[1] || match[2] || match[3]));
  return result;
}
const equalQuantity = (a: number, b: number, unit: string) =>
  unit === "volume" || unit === "weight"
    ? Math.abs(a - b) <= Math.max(a, b) * 0.01
    : a === b;

export function packageSizeConflicts(
  listing: string,
  identity: string,
): boolean {
  const actual = quantities(listing),
    expected = quantities(identity);
  for (const [unit, values] of actual) {
    const wanted = expected.get(unit);
    if (unit === "pack" && !wanted && [...values].some((n) => n > 1))
      return true;
    if (
      wanted &&
      ![...values].some((a) =>
        [...wanted].some((b) => equalQuantity(a, b, unit)),
      )
    )
      return true;
  }
  return false;
}
/** Both sides must supply the same explicit quantity before claiming the exact pack. */
export function packageSizeConfirmed(
  listing: string,
  identity: string,
): boolean {
  const actual = quantities(listing),
    expected = quantities(identity);
  if (packageSizeConflicts(listing, identity)) return false;
  for (const [unit, values] of actual) {
    const wanted = expected.get(unit);
    if (
      !wanted ||
      ![...values].every((a) =>
        [...wanted].some((b) => equalQuantity(a, b, unit)),
      )
    )
      return false;
  }
  for (const unit of expected.keys()) if (!actual.has(unit)) return false;
  return (
    actual.size > 0 ||
    !/\b(supplements?|vitamins?|multivitamins?|capsules?|tablets?|softgels?|gummies|bottle|shampoo|yogurt|tea\s*bags?)\b/i.test(
      identity,
    )
  );
}
export function isMultipack(value: string): boolean {
  return [...(quantities(value).get("pack") ?? [])].some((n) => n > 1);
}

/** Additional equivalent units do not make a second pack; explicit differences do. */
export function equivalentPackageVariants(a: string, b: string): boolean {
  const left = quantities(a),
    right = quantities(b);
  if (
    !left.size ||
    !right.size ||
    packageSizeConflicts(a, b) ||
    packageSizeConflicts(b, a)
  )
    return false;
  const common = [...left].some(([unit, amounts]) =>
    [...amounts].some((n) =>
      [...(right.get(unit) ?? [])].some((m) => equalQuantity(n, m, unit)),
    ),
  );
  const remainder = (value: string) =>
    value
      .toLowerCase()
      .replace(
        /\b\d+(?:\.\d+)?\s*(?:fl\.?\s*oz|fluid ounces?|tea\s*bags?|capsules?|tablets?|softgels?|gumm(?:y|ies)|count|ct|pieces?|pcs|ml|milliliters?|liters?|litres?|l|kg|grams?|g|ounces?|oz|pounds?|lbs?)\b/g,
        " ",
      )
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return common && remainder(a) === remainder(b);
}
