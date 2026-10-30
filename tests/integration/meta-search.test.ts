import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recognizeFrame,
  searchOffers,
} from "../../src/server/providers/meta.ts";
import type { Product } from "../../src/shared/scan.ts";

const product: Product = {
  id: "selected-laptop",
  brand: "Apple",
  model: "MacBook Pro 16-inch (M1 Pro, 2021)",
  variant: "Silver",
  label: "Laptop",
  identification: "user_selected",
  confidence: 0.45,
  box: { x: 0, y: 0, width: 1, height: 1 },
  shelfPriceMinor: null,
  shelfCurrency: null,
};

test("recognition requests one concrete model per selectable candidate", async (t) => {
  let prompt = "";
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      prompt = request.input[0].content[0].text;
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"products":[]}' }],
          },
        ],
      });
    },
  );
  await recognizeFrame({ META_API_KEY: "test-key" } as Env, "test-frame", "US");
  assert.match(prompt, /each candidate.*one concrete model/i);
  assert.match(prompt, /never combine.*slash/i);
  assert.match(prompt, /separate ranked candidates/i);
});

test("one metered search can return public marketplace evidence after selecting a model", async (t) => {
  let calls = 0;
  let request: Record<string, unknown> = {};
  const charges: number[] = [];
  const url = "https://www.ebay.com/itm/1234567890";
  const line = JSON.stringify({
    url,
    priceMinor: 89900,
    currency: "USD",
    kind: "asking",
    supportingText:
      'Apple 2021 MacBook Pro 16" M1 Pro Silver used laptop USD $899.00.',
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      calls++;
      request = JSON.parse(String(init.body));
      return Response.json({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 100 },
        output: [
          {
            type: "web_search_call",
            status: "completed",
            action: {
              type: "search",
              queries: ["Apple MacBook Pro 16 M1 Pro 2021 used"],
            },
            results: [
              {
                type: "text_result",
                url,
                title: 'Apple 2021 MacBook Pro 16" M1 Pro Silver used laptop',
                snippet: "",
              },
            ],
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: line,
                annotations: [
                  {
                    type: "url_citation",
                    url,
                    start_index: 0,
                    end_index: Array.from(line).length,
                  },
                ],
              },
            ],
          },
        ],
      });
    },
  );
  const found = await searchOffers(
    { META_API_KEY: "test-key" } as Env,
    product,
    "buy",
    "US",
    undefined,
    async (charge) => {
      charges.push(charge);
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(charges, [3050]);
  assert.equal(request.max_tool_calls, 2);
  assert.equal(request.model, "muse-spark-1.3");
  assert.deepEqual(request.tools, [
    {
      type: "web_search",
      search_context_size: "low",
      user_location: { type: "approximate", country: "US" },
    },
  ]);
  assert.match(String(request.input), /public marketplace/i);
  assert.match(String(request.input), /refurbished/i);
  assert.equal(found[0]?.priceMinor, 89900);
  assert.equal(found[0]?.kind, "asking");
  assert.equal(found[0]?.match, "possible");
  assert.equal(found[0]?.evidenceType, "cited_summary");
});
