export function modelIdentityParts(model: string): string[] | null {
  const normalized = model
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(macbook)[\s\p{Pd}]+(pro|air)\b/gu, "$1 $2")
    .replace(/\b(m\d{1,2})[\s\p{Pd}]+(pro|max|ultra)\b/gu, "$1 $2")
    .replace(/\b(\d{1,2}(?:\.\d)?)\s*(?:["″]|[-\s]*inch(?:es)?\b)/g, "$1 inch")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts: string[] = [];
  for (const pattern of [
    /\bmacbook (?:pro|air)\b/g,
    /\b\d{1,2}(?:\.\d)? inch\b/g,
    /\bm\d{1,2}(?: (?:pro|max|ultra))?\b/g,
    /\b20\d{2}\b/g,
  ]) {
    const matches = [...normalized.matchAll(pattern)];
    if (matches.length !== 1) return null;
    parts.push(matches[0][0]);
  }
  let remainder = normalized;
  for (const part of parts) remainder = remainder.replace(part, " ");
  // Extra specifications and combined alternatives must retain their original identity.
  return /[^\s–—-]/.test(remainder) ? null : parts;
}

export function modelIdentityKey(model: string): string {
  return (modelIdentityParts(model)?.join(" ") ?? model)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
