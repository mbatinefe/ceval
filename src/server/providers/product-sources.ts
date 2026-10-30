import type { Product, ProductSource } from "../../shared/scan.ts";
import { modelIdentityParts } from "../../shared/model-identity.ts";
import {
  containsIdentity,
  containsModel,
  safeUrl,
  text,
  type Source,
} from "../scan/validation.ts";

function relatedMacBook(title: string, identity: string[]): boolean {
  const value = title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:\b(?:usd|gbp|try|tl)\b\s*[$£₺]?|[$£₺])\s*\d[\d.,]*/g, " ")
    .replace(/\b\d[\d.,]*\s*(?:(?:usd|gbp|try|tl)\b|[$£₺])/g, " ")
    .replace(/\b(macbook)[\s\p{Pd}]+(pro|air)\b/gu, "$1 $2")
    .replace(/\b(m\d{1,2})[\s\p{Pd}]*(pro|max|ultra)\b/gu, "$1 $2")
    .replace(
      /\b(\d{1,2}(?:\.\d)?)\s*(?:["″]|[\s\p{Pd}]*inch(?:es)?\b)/gu,
      "$1 inch",
    )
    .replace(/\s+/g, " ");
  const cores = new Set(value.match(/\bmacbook (?:pro|air)\b/g) ?? []);
  if (
    cores.size !== 1 ||
    !cores.has(identity[0]) ||
    /\b(intel|amd|ryzen)\b/.test(value)
  )
    return false;
  const sizes = new Set([
    ...[...value.matchAll(/\b(\d{1,2}(?:\.\d)?) inch\b/g)].map(
      (match) => match[1],
    ),
    ...[
      ...value.matchAll(
        /\bmacbook (?:pro|air) (\d{2}(?:\.\d)?)(?![\p{L}\p{N}.])/gu,
      ),
    ].map((match) => match[1]),
  ]);
  const size = identity[1].replace(" inch", "");
  const allowedSizes = ["16", "16.2"].includes(size) ? ["16", "16.2"] : [size];
  const chips = new Set(
    value.match(/\bm\d{1,2}(?: (?:pro|max|ultra))?\b/g) ?? [],
  );
  const years = new Set(value.match(/\b20\d{2}\b/g) ?? []);
  return (
    [...sizes].every((item) => allowedSizes.includes(item)) &&
    [...chips].every((item) => item === identity[2]) &&
    [...years].every((item) => item === identity[3]) &&
    sizes.size + chips.size + years.size > 0
  );
}

function productPage(url: string, title: string): boolean {
  const parsed = new URL(url);
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname).toLowerCase();
  } catch {
    return false;
  }
  if (
    path === "/" ||
    /(^|\.)(support|docs|help|discussions)\./.test(parsed.hostname) ||
    /(^|\.)(reddit\.com|wikipedia\.org|youtube\.com|youtu\.be|tiktok\.com|quora\.com|medium\.com|cnet\.com|theverge\.com|engadget\.com|techradar\.com|pcmag\.com|macrumors\.com|tomsguide\.com)$/.test(
      parsed.hostname,
    )
  )
    return false;
  if (
    /\b(review|reviews|comparison|versus|news|unboxing|guide|manual|technical specifications|specifications|specs|techspecs|teardown|repair|replacement|accessories|accessory|case|cover|sleeve|earpads|ear pads|screen protector|charger|adapter|cable|battery|bundle|for parts|not working)\b/i.test(
      title,
    )
  )
    return false;
  if (
    /(?:^|[\/_-])(search|s|sch|b|browse|category|categories|collection|collections|reviews?|news|articles?|blogs?|forums?|community|support|manuals?|downloads?|watch|results)(?:[\/_.-]|$)/.test(
      path,
    ) ||
    /\.(pdf|mp4|jpg|png)$/.test(path)
  )
    return false;
  if (
    [...parsed.searchParams.keys()].some((key) =>
      /^(q|query|search|keywords?|k)$/i.test(key),
    )
  )
    return false;
  if (
    /(^|\.)facebook\.com$/.test(parsed.hostname) &&
    !/^\/marketplace\/item\/\d+/.test(path)
  )
    return false;
  return true;
}

export function productSources(
  sources: Source[],
  product: Product,
): ProductSource[] {
  const accepted: ProductSource[] = [];
  const identity = modelIdentityParts(product.model);
  for (const source of sources) {
    const url = safeUrl(source.url),
      title = text(source.title, 300);
    if (
      !url ||
      !containsIdentity(title, product.brand) ||
      !productPage(url, title)
    )
      continue;
    if (
      identity
        ? !relatedMacBook(title, identity)
        : !containsModel(title, product.model)
    )
      continue;
    if (accepted.some((source) => source.url === url)) continue;
    accepted.push({ title, url });
    if (accepted.length === 3) break;
  }
  return accepted;
}
