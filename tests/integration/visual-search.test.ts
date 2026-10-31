import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  searchCandidates,
  candidateFromPage,
  candidateImageUrl,
  candidatePhoto,
} from "../../src/server/providers/product-media.ts";
import { discoverProductsFromPhoto } from "../../src/server/providers/meta.ts";
import { applyVisualRanking } from "../../src/server/providers/visual-ranking.ts";
import type { Market, Product } from "../../src/shared/scan.ts";
const entry = (extra = {}) => ({
  title: "ARZOPA A1S Gray Portable Monitor",
  link: "https://www.arzopa.com/products/a1s",
  ...extra,
});
const parseMatches = (rows: ReturnType<typeof entry>[], market: Market) =>
  searchCandidates(
    rows.map((row) => ({ title: row.title, url: row.link })),
    market,
  );
afterEach(() => mock.restoreAll());
const page = (product: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(product)}</script>`;
test("candidate photos come from fetched Product metadata, never search prose or generated URLs", () => {
  const [source] = parseMatches([entry()], "US");
  assert.equal(source.price, undefined);
  assert.equal(source.identity, undefined);
  assert.equal(source.thumbnail, undefined);
  const result = candidateFromPage(
    source,
    page({
      "@type": "Product",
      name: "A1S Gray Portable Monitor",
      brand: { name: "ARZOPA" },
      image: "https://cdn.shopify.com/s/files/monitor.jpg",
    }),
    source.url,
  );
  assert.equal(result.title, "ARZOPA A1S Gray Portable Monitor");
  assert.equal(
    result.thumbnail,
    "https://cdn.shopify.com/s/files/monitor.jpg?width=480",
  );
  assert.equal(result.identity, undefined);
  assert.equal(result.price, undefined);
});
test("unreviewed hosts, unsafe URLs, and ambiguous multi-product pages cannot supply photos", () => {
  const [source] = parseMatches([entry()], "US");
  for (const value of [
    "https://127.0.0.1/photo",
    "https://cdn.shopify.com.evil.example/photo",
    "http://cdn.shopify.com/photo",
    "https://cdn.shopify.com:444/photo",
    "https://user@cdn.shopify.com/photo",
    "https://random-shop.example/photo",
  ])
    assert.equal(candidateImageUrl(value), null);
  const result = candidateFromPage(
    source,
    page([
      {
        "@type": "Product",
        name: "A1S",
        image: "https://cdn.shopify.com/a.jpg",
      },
      {
        "@type": "Product",
        name: "Z1C",
        image: "https://cdn.shopify.com/z.jpg",
      },
    ]),
    source.url,
  );
  assert.equal(result.thumbnail, undefined);
  assert.equal(
    parseMatches(
      [
        entry({ link: "https://127.0.0.1/internal" }),
        entry({ link: "javascript:alert(1)" }),
      ],
      "US",
    ).length,
    0,
  );
});
test("image fetch rejects redirect destinations and oversized payloads", async () => {
  const [candidate] = parseMatches([entry()], "US");
  candidate.thumbnail = "https://cdn.shopify.com/a.jpg";
  mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    assert.equal(init.redirect, "manual");
    return new Response(new Uint8Array(500001), {
      headers: { "content-type": "image/jpeg" },
    });
  });
  assert.equal(await candidatePhoto(candidate), null);
});
test("Meta discovers from the original photo with native web search and meters the call", async () => {
  const frame =
    "data:image/jpeg;base64," +
    (await readFile("tests/fixtures/frame.jpg")).toString("base64");
  const product = {
    brand: "AZOPA",
    model: "",
    label: "Portable monitor",
    confidence: 0.35,
  } as Product;
  let usage = 0;
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.meta.ai/v1/responses") {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.input[0].content[1].image_url, frame);
        assert.equal(body.tools[0].type, "web_search");
        assert.equal(body.tools[0].user_location.country, "US");
        return Response.json({
          status: "completed",
          usage: { input_tokens: 100, output_tokens: 100 },
          output: [
            {
              type: "web_search_call",
              status: "completed",
              action: { type: "search", query: "ARZOPA portable monitors" },
              results: [
                {
                  type: "text_result",
                  title: entry().title,
                  url: entry().link,
                  snippet: "USD 1 invented price in prose",
                },
              ],
            },
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "Also see https://invented.example/item",
                },
              ],
            },
          ],
        });
      }
      assert.equal(url, entry().link);
      return new Response(
        page({
          "@type": "Product",
          name: entry().title,
          image: "https://cdn.shopify.com/a.jpg",
        }),
        { headers: { "content-type": "text/html" } },
      );
    },
  );
  const result = await discoverProductsFromPhoto(
    { META_API_KEY: "test-only" } as Env,
    frame,
    product,
    "US",
    undefined,
    async (charge) => {
      usage += charge;
    },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].url, entry().link);
  assert.ok(result[0].thumbnail);
  assert.equal(result[0].price, undefined);
  assert.ok(usage > 0);
});
test("discovery provider errors do not expose credentials or response bodies", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "secret-key confidential" }, { status: 429 }),
  );
  await assert.rejects(
    discoverProductsFromPhoto(
      { META_API_KEY: "test-only" } as Env,
      "data:image/jpeg;base64,/9j/2Q==",
      {} as Product,
      "US",
    ),
    (error: Error) =>
      !error.message.includes("secret-key") &&
      /busy|limit/i.test(error.message),
  );
});
test("Meta can only reorder retrieved IDs and derive identities supported by their titles", () => {
  const rows = parseMatches(
    [
      entry(),
      entry({
        title: "Portable monitor",
        link: "https://www.bose.com/p/monitor",
      }),
    ],
    "US",
  );
  const ranked = applyVisualRanking(rows, {
    matches: [
      {
        id: rows[1].id,
        assessment: "likely",
        reason: "Black frame",
        brand: "ARZOPA",
        model: "A1S",
        variant: "Gray",
      },
      { id: "invented", assessment: "likely" },
      {
        id: rows[0].id,
        assessment: "likely",
        reason: "Similar bezel; label is unreadable",
        brand: "ARZOPA",
        model: "A1S",
        variant: "Gray",
        price: 1,
      },
    ],
  });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].identity, undefined);
  assert.equal(ranked[1].identity?.model, "A1S");
  assert.equal(ranked[1].price, undefined);
  assert.equal(ranked[1].assessment, "likely");
});
test("ranking explanations cannot invent confirmations, resale values or destinations", () => {
  const candidates = parseMatches([entry()], "US");
  const [result] = applyVisualRanking(candidates, {
    matches: [
      {
        id: candidates[0].id,
        assessment: "likely",
        brand: "ARZOPA",
        model: "A1S",
        variant: "Gray",
        features: ["bezel", "https://untrusted-shop.com"],
        reason:
          "Exact model confirmed. Resale value $500. Buy at https://untrusted-shop.com",
      },
    ],
  });
  assert.doesNotMatch(result.reason, /confirmed\.|\$500|https:|untrusted-shop/);
  assert.match(result.reason, /bezel/);
  assert.doesNotMatch(result.identity?.reason || "", /\$500|https:/);
});

test("merchant photo fetch identifies Ceval and requests supported image formats", async () => {
  const [candidate] = parseMatches([entry()], "US");
  candidate.thumbnail = "https://cdn.shopify.com/a.jpg";
  mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      return headers.get("User-Agent") === "CevalProductResearch/0.1" &&
        headers.get("Accept")?.includes("image/jpeg")
        ? new Response(new Uint8Array([255, 216, 255, 217]), {
            headers: { "Content-Type": "image/jpeg" },
          })
        : new Response("Forbidden", { status: 403 });
    },
  );
  assert.equal(
    await candidatePhoto(candidate),
    "data:image/jpeg;base64,/9j/2Q==",
  );
});

test("discovery shows product pages instead of home pages, catalogs, FAQs or review articles", () => {
  const rows = searchCandidates(
    [
      {
        title: "ARZOPA news",
        url: "https://technode.global/prnasia/arzopa-launches-calendar",
      },
      {
        title: "ARZOPA video",
        url: "https://www.tiktok.com/@example/video/123",
      },
      {
        title: "ARZOPA review",
        url: "https://www.makeuseof.com/arzopa-portable-monitors",
      },
      {
        title: "ARZOPA homepage",
        url: "https://www.arzopa.com/?srsltid=tracking",
      },
      {
        title: "ARZOPA collection",
        url: "https://www.arzopa.com/collections/portable-monitors",
      },
      { title: "ARZOPA FAQ", url: "https://global.arzopa.com/collections/faq" },
      {
        title: "ARZOPA review",
        url: "https://www.arzopa.com/blogs/guide/best-monitors",
      },
      { title: entry().title, url: entry().link },
    ],
    "US",
  );
  assert.deepEqual(
    rows.map((row) => row.url),
    [entry().link],
  );
});

test("photo retrieval works with Workers redirect modes and rejects redirects without following them", async () => {
  const [candidate] = parseMatches([entry()], "US");
  candidate.thumbnail = "https://cdn.shopify.com/a.jpg";
  let redirect = false;
  mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      if (init?.redirect === "error")
        throw new TypeError("Unsupported redirect mode: error");
      assert.equal(init?.redirect, "manual");
      return redirect
        ? new Response(null, {
            status: 302,
            headers: { Location: "https://127.0.0.1/private" },
          })
        : new Response(new Uint8Array([255, 216, 255, 217]), {
            headers: { "Content-Type": "image/jpeg" },
          });
    },
  );
  assert.equal(
    await candidatePhoto(candidate),
    "data:image/jpeg;base64,/9j/2Q==",
  );
  redirect = true;
  assert.equal(await candidatePhoto(candidate), null);
});
