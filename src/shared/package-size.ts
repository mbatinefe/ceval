/** Package quantities must agree before a price can describe the exact pack. */
export function packageSizeConfirmed(
  listing: string,
  identity: string,
): boolean {
  const quantities = (value: string) =>
    new Set(
      [
        ...value
          .toLowerCase()
          .matchAll(
            /\b(\d+(?:\.\d+)?)\s*(capsules?|tablets?|softgels?|gumm(?:y|ies)|count|ct|pieces?|pcs|ml|liters?|g|kg|oz)\b/g,
          ),
      ].map(
        (match) =>
          `${Number(match[1])}:${match[2].replace(/ies$/, "y").replace(/s$/, "")}`,
      ),
    );
  const actual = quantities(listing),
    expected = quantities(identity);
  if (actual.size) return [...actual].every((size) => expected.has(size));
  // A formulation or color alone cannot identify the size of a consumable pack.
  return !/\b(supplements?|vitamins?|multivitamins?|capsules?|tablets?|softgels?|gummies|bottle)\b/i.test(
    identity,
  );
}
