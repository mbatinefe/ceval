import { containsIdentity, containsModel } from "../scan/validation.ts";

const normalize = (value: string) =>
  value
    .replace(/[™®©]/g, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\bgrey\b/g, "gray");

/** Require the requested model and reject explicit additional generations or tiers. */
export function matchesModel(value: string, model: string): boolean {
  const name = normalize(value),
    expected = normalize(model);
  if (!containsModel(name, expected)) return false;
  const generations = (text: string) =>
    [...text.matchAll(/\b(\d+)(?:st|nd|rd|th)?\s*gen(?:eration)?\b/g)].map(
      (m) => m[1],
    );
  const expectedGenerations = generations(expected);
  if (generations(name).some((g) => !expectedGenerations.includes(g)))
    return false;
  const tokens = expected.match(/[\p{L}\p{N}]+/gu);
  if (!tokens) return false;
  const match = new RegExp(
    `(?<![\\p{L}\\p{N}])${tokens.join("[\\s\\p{Pd}(),]*")}(?![\\p{L}\\p{N}])`,
    "u",
  ).exec(name);
  if (!match) return true; // containsModel already checked reordered, fully specified identities.
  const tail = name
    .slice(match.index + match[0].length)
    .replace(/^[\s\p{Pd}(:,]+/u, "");
  if (/^(?:pro|ultra|plus|lite|mini|ii|iii|iv)\b/.test(tail)) return false;
  if (
    /^\d+(?:\.\d+)?(?:st|nd|rd|th)?\b/.test(tail) &&
    !/^\d+(?:\.\d+)?\s*(?:[- ]?inch|["″]|hz\b|gb\b|tb\b|usd\b|gbp\b|try\b)/.test(
      tail,
    )
  )
    return false;
  return true;
}

/** Missing attributes remain uncertain; explicit incompatible attributes are excluded. */
export function variantConflicts(value: string, variant: string): boolean {
  const actual = normalize(value),
    expected = normalize(variant);
  const colors =
    /\b(?:black|white|gray|silver|blue|red|green|pink|purple|yellow|orange|gold|beige|midnight|starlight)\b/g;
  const expectedColors = new Set(expected.match(colors) ?? []);
  if (
    expectedColors.size &&
    (actual.match(colors) ?? []).some((c) => !expectedColors.has(c))
  )
    return true;
  const capacities = (text: string) =>
    [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(gb|tb)\b/g)].map(
      (m) => `${m[1]}${m[2]}`,
    );
  const expectedCapacities = capacities(expected);
  if (
    expectedCapacities.length &&
    capacities(actual).some((c) => !expectedCapacities.includes(c))
  )
    return true;
  return false;
}

export function containsVariant(value: string, variant: string): boolean {
  return containsIdentity(normalize(value), normalize(variant));
}
