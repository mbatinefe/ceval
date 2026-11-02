import type { Product } from "../../shared/scan.ts";
import type { VisualCandidate } from "../../shared/visual-search.ts";
import { containsIdentity, text } from "../scan/validation.ts";
import {
  containsVariant,
  matchesModel,
  variantConflicts,
} from "./product-identity.ts";
import { obj } from "./product-media.ts";
export function compatibleVisualCandidates(
  candidates: VisualCandidate[],
  product: Product,
): VisualCandidate[] {
  if (
    !product.model ||
    !product.brand ||
    (product.confidence < 0.85 && product.identification !== "user_selected")
  )
    return candidates;
  // A readable product name or explicit choice takes precedence over a similar-looking package.
  return candidates.filter(
    (candidate) =>
      matchesModel(candidate.title, product.model) &&
      !variantConflicts(candidate.title, product.variant),
  );
}
export const visualFeatures = [
  "shape",
  "color",
  "bezel",
  "stand",
  "ports",
  "buttons",
  "headband",
  "earcups",
  "logo",
  "pattern",
  "materials",
  "packaging",
] as const;
export function applyVisualRanking(
  candidates: VisualCandidate[],
  value: unknown,
): VisualCandidate[] {
  const raw = obj(value).matches;
  if (!Array.isArray(raw)) throw new Error("Invalid visual ranking");
  const ranked: VisualCandidate[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, 16)) {
    const row = obj(item),
      candidate = candidates.find((c) => c.id === row.id);
    if (!candidate || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    if (row.assessment === "unrelated") continue;
    if (row.assessment !== "likely" && row.assessment !== "similar") continue;
    const brand = text(row.brand, 80),
      model = text(row.model, 100),
      variant = text(row.variant, 100);
    const features = Array.isArray(row.features)
      ? [
          ...new Set(
            row.features.filter(
              (feature): feature is (typeof visualFeatures)[number] =>
                visualFeatures.includes(
                  feature as (typeof visualFeatures)[number],
                ),
            ),
          ),
        ].slice(0, 3)
      : [];
    const reason = features.length
      ? `Similar ${features.join(", ")}. Check the label, size and details.`
      : "Similar visible design. Check the label, size and details.";
    const grounded =
      brand &&
      model &&
      containsIdentity(candidate.title, brand) &&
      matchesModel(candidate.title, model) &&
      !variantConflicts(candidate.title, variant) &&
      (!variant || containsVariant(candidate.title, variant));
    ranked.push({
      ...candidate,
      assessment: row.assessment,
      reason: reason || "Visually similar; check the label to confirm.",
      ...(grounded
        ? {
            identity: {
              brand,
              model,
              variant,
              reason: reason || "Check the model label.",
            },
          }
        : {}),
    });
  }
  const identities = new Set<string>();
  return ranked
    .filter((candidate) => {
      if (!candidate.identity) return true;
      const key = [
        candidate.identity.brand,
        candidate.identity.model,
        candidate.identity.variant,
      ]
        .map((value) =>
          value
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]/gu, " ")
            .replace(/\s+/g, ""),
        )
        .join(":");
      if (identities.has(key)) return false;
      identities.add(key);
      return true;
    })
    .slice(0, 5);
}
