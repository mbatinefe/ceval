import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recognizeFrame,
  searchOffers,
} from "../../src/server/providers/meta.ts";
import type { Product, ProductSource } from "../../src/shared/scan.ts";

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
      if (!_url.includes("api.meta.ai"))
        return new Response("blocked", { status: 403 });
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
      search_context_size: "medium",
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
test("an empty price result reports only retrieved product links from the same metered search", async (t) => {
  const url = "https://shop.example.com/product/macbook";
  const title = 'Apple MacBook Pro 16.2" M1 Pro laptop';
  let calls = 0;
  let sources: ProductSource[] = [];
  const charges: number[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      calls++;
      assert.equal(JSON.parse(String(init.body)).max_tool_calls, 2);
      return Response.json({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 100 },
        output: [
          {
            type: "web_search_call",
            status: "completed",
            action: { type: "search", queries: ["MacBook Pro M1 Pro"] },
            results: [{ type: "text_result", url, title, snippet: "" }],
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '{"offers":[],"sources":[{"url":"https://invented.example.com/product/laptop","title":"Apple MacBook Pro M1 Pro"}]}',
              },
            ],
          },
        ],
      });
    },
  );
  const offers = await searchOffers(
    { META_API_KEY: "test-key" } as Env,
    product,
    "buy",
    "US",
    undefined,
    async (charge) => {
      charges.push(charge);
    },
    (found) => {
      sources = found;
    },
  );
  assert.deepEqual(offers, []);
  assert.deepEqual(sources, [{ title, url }]);
  assert.deepEqual(charges, [3050]);
  assert.equal(calls, 1);
});
test("uncompleted searches and generated citations cannot manufacture product links", async (t) => {
  let sources: ProductSource[] = [];
  const url = "https://shop.example.com/product/macbook";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 100 },
      output: [
        {
          type: "web_search_call",
          status: "failed",
          results: [
            {
              type: "text_result",
              url,
              title: "Apple MacBook Pro M1 Pro",
              snippet: "",
            },
          ],
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"offers":[]}',
              annotations: [
                {
                  type: "url_citation",
                  url,
                  title: "Apple MacBook Pro M1 Pro",
                  start_index: 0,
                  end_index: 13,
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  assert.deepEqual(
    await searchOffers(
      { META_API_KEY: "test-key" } as Env,
      product,
      "buy",
      "US",
      undefined,
      undefined,
      (found) => {
        sources = found;
      },
    ),
    [],
  );
  assert.deepEqual(sources, []);
});

test("a search without snippets or a final answer verifies a real merchant price with one Meta charge", async (t) => {
  const monitor: Product = {
    ...product,
    brand: "ARZOPA",
    model: "A1S",
    variant: "Gray",
  };
  const url = "https://www.arzopa.com/collections/all/products/a1s";
  const calls: string[] = [],
    charges: number[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    calls.push(String(input));
    if (String(input).includes("api.meta.ai"))
      return Response.json({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 100 },
        output: [
          {
            type: "web_search_call",
            status: "completed",
            action: { type: "search", queries: ["ARZOPA A1S US"] },
            results: [
              {
                type: "text_result",
                url,
                title: "ARZOPA A1S Gray portable monitor",
                snippet: "",
              },
            ],
          },
        ],
      });
    assert.equal(String(input), "https://www.arzopa.com/products/a1s");
    return new Response(
      '<script type="application/ld+json">' +
        JSON.stringify({
          "@type": "Product",
          name: "ARZOPA A1S Gray portable monitor",
          brand: "ARZOPA",
          color: "Gray",
          offers: {
            "@type": "Offer",
            price: "69.99",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
          },
        }) +
        "</script>",
      { headers: { "content-type": "text/html" } },
    );
  });
  const found = await searchOffers(
    { META_API_KEY: "test-key" } as Env,
    monitor,
    "buy",
    "US",
    undefined,
    async (charge) => {
      charges.push(charge);
    },
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(charges, [3050]);
  assert.equal(found[0]?.priceMinor, 6999);
  assert.equal(found[0]?.evidenceType, "product_page");
  assert.equal(found[0]?.match, "possible");
});

test("a model's unsupported price cannot survive a blocked merchant page", async (t) => {
  const monitor: Product = {
    ...product,
    brand: "ARZOPA",
    model: "A1S",
    variant: "Gray",
  };
  const url = "https://www.arzopa.com/products/a1s";
  let sources: ProductSource[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    if (!String(input).includes("api.meta.ai"))
      return new Response("blocked", { status: 403 });
    return Response.json({
      status: "completed",
      output: [
        {
          type: "web_search_call",
          status: "completed",
          results: [
            { type: "text_result", url, title: "ARZOPA A1S Gray", snippet: "" },
          ],
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                url,
                priceMinor: 1999,
                currency: "USD",
                kind: "retail",
                supportingText: "ARZOPA A1S Gray new USD 19.99",
              }),
              annotations: [],
            },
          ],
        },
      ],
    });
  });
  const found = await searchOffers(
    { META_API_KEY: "test-key" } as Env,
    monitor,
    "buy",
    "US",
    undefined,
    undefined,
    (result) => {
      sources = result;
    },
  );
  assert.deepEqual(found, []);
  assert.equal(sources[0]?.url, url);
});

test("merchant stock overrides an optimistic native-cited model summary", async (t) => {
  const monitor = {
    ...product,
    brand: "ARZOPA",
    model: "A1S",
    variant: "Black",
  };
  const url = "https://www.arzopa.com/products/a1s";
  const line = JSON.stringify({
    url,
    priceMinor: 6999,
    currency: "USD",
    kind: "retail",
    supportingText: "ARZOPA A1S Black new In Stock for USD 69.99",
  });
  t.mock.method(globalThis, "fetch", async (input: string) => {
    if (String(input).includes("api.meta.ai"))
      return Response.json({
        status: "completed",
        output: [
          {
            type: "web_search_call",
            status: "completed",
            results: [
              {
                type: "text_result",
                url,
                title: "ARZOPA A1S monitor",
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
    return new Response(
      '<script type="application/ld+json">' +
        JSON.stringify({
          "@type": "Product",
          name: "ARZOPA A1S Black",
          brand: "ARZOPA",
          color: "Black",
          offers: {
            "@type": "Offer",
            price: "69.99",
            priceCurrency: "USD",
            availability: "https://schema.org/OutOfStock",
          },
        }) +
        "</script>",
      { headers: { "content-type": "text/html" } },
    );
  });
  assert.deepEqual(
    await searchOffers(
      { META_API_KEY: "test-key" } as Env,
      monitor,
      "buy",
      "US",
    ),
    [],
  );
});
