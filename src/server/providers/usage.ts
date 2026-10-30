export type UsageReporter = (micros: number) => Promise<void>;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function metaChargeMicros(value: unknown): number | null {
  const result = object(value),
    usage = object(result.usage);
  const input = usage.input_tokens,
    output = usage.output_tokens;
  if (
    !Number.isSafeInteger(input) ||
    Number(input) < 0 ||
    !Number.isSafeInteger(output) ||
    Number(output) < 0 ||
    !Array.isArray(result.output)
  )
    return null;
  let queries = 0;
  for (const value of result.output) {
    const item = object(value);
    if (item.type !== "web_search_call") continue;
    const action = object(item.action);
    if (item.status !== "completed") return null;
    if (action.type === "search") {
      if (
        Array.isArray(action.queries) &&
        action.queries.length &&
        action.queries.every((q) => typeof q === "string" && q.trim())
      )
        queries += action.queries.length;
      else if (typeof action.query === "string" && action.query.trim())
        queries++;
      else return null;
    } else if (action.type === "open_page" || action.type === "find_in_page")
      queries++;
    else return null;
  }
  // Standard Muse Spark pricing: https://dev.meta.ai/docs/pricing-rate-limits
  // Use the uncached input rate and also reserve a query fee for page opens/finds.
  const micros = Math.max(
    1,
    Math.ceil(Number(input) * 1.25 + Number(output) * 4.25 + queries * 2500),
  );
  return Number.isSafeInteger(micros) ? micros : null;
}
