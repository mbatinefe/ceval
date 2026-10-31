import { metaKey } from "./config.ts";
import type {
  Market,
  Product,
  ProductSource,
  Mode,
} from "../../shared/scan.ts";
import { recognitionPrompt, priceSearchPrompt } from "./prompts.ts";
import { retrievedPageOffers } from "./product-pages.ts";
import { ScanError } from "../scan/errors.ts";
import { citedOffers, type AnswerBlock } from "./citations.ts";
import { metaChargeMicros, type UsageReporter } from "./usage.ts";
import { matchesModel, variantConflicts } from "./product-identity.ts";
import { productSources, sourceUrl } from "./product-sources.ts";
import {
  record,
  text,
  parseProducts,
  validateOffers,
  type Source,
} from "../scan/validation.ts";
const MODEL = "muse-spark-1.3";
const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["integer", "null"] };
const fraction = { type: "number", minimum: 0, maximum: 1 };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const productSchema = object({
  brand: string,
  model: string,
  variant: string,
  label: string,
  confidence: fraction,
  box: object({
    x: { ...fraction, description: "Left edge as a fraction of image width." },
    y: { ...fraction, description: "Top edge as a fraction of image height." },
    width: { ...fraction, description: "Box width divided by image width." },
    height: { ...fraction, description: "Box height divided by image height." },
  }),
  shelfPriceMinor: nullableNumber,
  shelfCurrency: nullableString,
  candidates: {
    type: "array",
    maxItems: 5,
    items: object({
      brand: string,
      model: string,
      variant: string,
      reason: string,
    }),
  },
});
async function meta(
  env: Env,
  input: unknown,
  schema: unknown,
  search: Market | null,
  signal?: AbortSignal,
  onUsage?: UsageReporter,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let disconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  const onDisconnect = () => {
    // waitUntil allows 30 seconds after disconnect; leave time to settle D1 usage.
    disconnectTimeout = setTimeout(() => controller.abort(), 25000);
  };
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onDisconnect, { once: true });
  try {
    const response = await fetch("https://api.meta.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${metaKey(env)}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        store: false,
        max_output_tokens: search ? 2400 : 3200,
        reasoning: { effort: "low" },
        input,
        ...(!search
          ? {
              text: {
                format: {
                  type: "json_schema",
                  name: "products",
                  strict: true,
                  schema,
                },
              },
            }
          : {}),
        ...(search
          ? {
              tools: [
                {
                  type: "web_search",
                  search_context_size: "medium",
                  user_location: { type: "approximate", country: search },
                },
              ],
              max_tool_calls: 2,
              include: ["web_search_call.results"],
            }
          : {}),
      }),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("empty");
    const decoder = new TextDecoder();
    let body = "",
      size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512000) {
        await reader.cancel();
        throw new Error("oversized");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    let result: Record<string, unknown> = {};
    try {
      result = record(JSON.parse(body));
    } catch {
      if (response.ok) throw new Error("unreadable response");
    }
    // Terminal usage remains billable even when generation or parsing fails.
    if (
      ["completed", "incomplete", "failed"].includes(String(result.status)) &&
      onUsage
    ) {
      const charge = metaChargeMicros(result);
      if (charge !== null) await onUsage(charge);
    }
    if (!response.ok) {
      if (response.status === 429)
        throw new ScanError(
          "provider_rate_limited",
          "The analysis service is busy. Try again in a minute.",
          503,
        );
      throw new ScanError(
        "provider_error",
        "Analysis is temporarily unavailable. Please try again later.",
        502,
      );
    }
    if (result.status === "incomplete")
      throw new ScanError(
        "analysis_incomplete",
        search
          ? "The price search did not finish. Try again in a minute."
          : "The frame analysis did not finish. Try a clearer view in a minute.",
        502,
      );
    if (result.status !== "completed" || !Array.isArray(result.output))
      throw new Error("incomplete");
    let content = "";
    const blocks: AnswerBlock[] = [];
    const sources: Source[] = [];
    let searched = false;
    for (const item of result.output) {
      const part = record(item);
      if (part.type === "web_search_call" && part.status === "completed") {
        searched = true;
        if (Array.isArray(part.results))
          for (const entry of part.results) {
            const source = record(entry);
            if (source.type === "text_result")
              sources.push({
                url: text(source.url, 2048),
                title: text(source.title, 300),
                snippet: text(source.snippet, 6000),
              });
          }
      }
      if (
        part.type === "message" &&
        part.phase !== "commentary" &&
        Array.isArray(part.content)
      )
        for (const block of part.content) {
          const b = record(block);
          if (b.type === "output_text") {
            const value = text(b.text, 40000);
            content += value;
            blocks.push({
              text: typeof b.text === "string" ? b.text.slice(0, 40000) : "",
              annotations: Array.isArray(b.annotations) ? b.annotations : [],
            });
          }
        }
    }
    if (!content && !(search && searched && sources.length))
      throw new Error("empty answer");
    return {
      data: search ? null : JSON.parse(content),
      content,
      blocks,
      sources,
      searched,
    };
  } catch (error) {
    if (error instanceof ScanError) throw error;
    if (controller.signal.aborted)
      throw new ScanError(
        "analysis_timeout",
        "Analysis stopped or took too long. Try a clearer frame.",
        504,
      );
    throw new ScanError(
      "provider_error",
      "Analysis returned an unreadable result. Please try again.",
      502,
    );
  } finally {
    clearTimeout(timeout);
    if (disconnectTimeout !== undefined) clearTimeout(disconnectTimeout);
    signal?.removeEventListener("abort", onDisconnect);
  }
}
export async function recognizeFrame(
  env: Env,
  frame: string,
  market: Market,
  signal?: AbortSignal,
  onUsage?: UsageReporter,
) {
  const prompt = recognitionPrompt(market);
  const result = await meta(
    env,
    [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: frame },
        ],
      },
    ],
    object({ products: { type: "array", maxItems: 3, items: productSchema } }),
    null,
    signal,
    onUsage,
  );
  return parseProducts(result.data);
}
export async function searchOffers(
  env: Env,
  product: Product,
  mode: Mode,
  market: Market,
  signal?: AbortSignal,
  onUsage?: UsageReporter,
  onSources?: (sources: ProductSource[]) => void,
) {
  const query = priceSearchPrompt(product, mode, market);
  const result = await meta(env, query, null, market, signal, onUsage);
  if (!result.searched) return [];
  const sources = productSources(result.sources, product, market);
  onSources?.(sources);
  const candidates: unknown[] = [];
  for (const document of [
    result.content,
    ...result.blocks.flatMap((block) => block.text.split("\n")),
  ]) {
    try {
      const parsed = JSON.parse(document);
      if (Array.isArray(parsed?.offers)) candidates.push(...parsed.offers);
      else if (parsed && typeof parsed === "object" && parsed.url)
        candidates.push(parsed);
    } catch {
      /* Skip commentary and malformed records. */
    }
  }
  const direct = validateOffers(
    { offers: candidates },
    result.sources,
    product,
    market,
    mode,
  );
  const cited = citedOffers(
    result.blocks,
    result.sources,
    product,
    market,
    mode,
  );
  const checked = new Set<string>();
  const pages = await retrievedPageOffers(
    sources,
    product,
    market,
    mode,
    signal,
    (urls) => {
      for (const url of urls) checked.add(sourceUrl(url, market) ?? url);
    },
  );
  // Readable merchant data takes precedence, including unavailable or conflicting variants.
  const remaining = [...direct, ...cited].filter((o) => {
    const url = sourceUrl(o.url, market);
    return (
      url !== null &&
      !checked.has(url) &&
      matchesModel(o.evidence, product.model) &&
      !variantConflicts(o.evidence, product.variant)
    );
  });
  return [...pages, ...remaining]
    .filter(
      (offer, index, offers) =>
        offers.findIndex(
          (o) => sourceUrl(o.url, market) === sourceUrl(offer.url, market),
        ) === index,
    )
    .sort((a, b) => a.priceMinor - b.priceMinor)
    .slice(0, 5);
}
