import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  searchCandidates,
  candidateFromPage,
  candidatePhoto,
} from "../../src/server/providers/product-media.ts";
const url = "https://www.arzopa.com/products/a1s";
const base = () =>
  searchCandidates([{ url, title: "ARZOPA A1S Portable Monitor" }], "US")[0];
afterEach(() => mock.restoreAll());
test("duplicate Amazon tracking links become one listing while distinct ASINs survive", () => {
  const rows = searchCandidates(
    [
      {
        url: "https://www.amazon.com/Monitor/dp/B093GCL18V/ref=abc?tag=affiliate&th=1",
        title: "ARZOPA A1S",
      },
      {
        url: "https://www.amazon.com/dp/B093GCL18V/ref=xyz",
        title: "ARZOPA A1S",
      },
      { url: "https://www.amazon.com/dp/B0CH9XW8RK", title: "ARZOPA A1" },
      { url, title: "ARZOPA A1S" },
    ],
    "US",
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].url, url);
  assert.equal(rows.filter((row) => row.url.includes("B093GCL18V")).length, 1);
  assert.equal(
    rows.find((row) => row.url.includes("B093GCL18V"))?.url,
    "https://www.amazon.com/dp/B093GCL18V",
  );
});
test("official product Open Graph media is available when JSON-LD is absent", () => {
  const candidate = {
    ...base(),
    url: "https://www.bose.com/p/headphones/quietcomfort/QC.html",
    title: "Bose QuietComfort",
  };
  const result = candidateFromPage(
    candidate,
    `<meta property="og:type" content="website"><meta property="og:title" content="Bose QuietComfort Headphones"><meta property="og:image" content="https://assets.bosecreative.com/transform/photo.jpg?format=avif">`,
    candidate.url,
  );
  assert.ok(result.thumbnail?.startsWith("https://assets.bosecreative.com/"));
  assert.equal(new URL(result.thumbnail!).searchParams.get("format"), "jpg");
  assert.equal(result.title, "Bose QuietComfort Headphones");
});
test("a ProductGroup provides family photos without attaching an arbitrary variant", () => {
  const result = candidateFromPage(
    base(),
    `<script type="application/ld+json">${JSON.stringify({
      "@type": "ProductGroup",
      name: "ARZOPA A1S Monitor",
      image: "https://cdn.shopify.com/family.jpg",
      hasVariant: [
        {
          "@type": "Product",
          name: "A1S Red",
          image: "https://cdn.shopify.com/red.jpg",
        },
        {
          "@type": "Product",
          name: "A1S Blue",
          image: "https://cdn.shopify.com/blue.jpg",
        },
      ],
    })}</script>`,
    url,
  );
  assert.match(result.thumbnail || "", /family.jpg/);
  assert.equal(result.title, "ARZOPA A1S Monitor");
  assert.equal(result.identity, undefined);
});
test("photo retrieval tries a second source image when the first is unavailable", async () => {
  const candidate = candidateFromPage(
    base(),
    `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "ARZOPA A1S", image: ["https://cdn.shopify.com/broken.jpg", "https://cdn.shopify.com/working.jpg"] })}</script>`,
    url,
  );
  mock.method(globalThis, "fetch", async (input: string | URL) =>
    String(input).includes("working")
      ? new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { "Content-Type": "image/jpeg" },
        })
      : new Response("", { status: 404 }),
  );
  assert.equal(
    await candidatePhoto(candidate),
    "data:image/jpeg;base64,/9j/2Q==",
  );
  assert.match(candidate.thumbnail || "", /working.jpg/);
});

test("Meta catalog evidence expands to distinct real product pages without following off-site links", async () => {
  const { discoverProductsFromPhoto } =
    await import("../../src/server/providers/meta.ts");
  const requests: string[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL) => {
    const address = String(input);
    requests.push(address);
    if (address === "https://api.meta.ai/v1/responses")
      return Response.json({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 100 },
        output: [
          {
            type: "web_search_call",
            status: "completed",
            action: { type: "search", query: "portable monitors" },
            results: [
              {
                type: "text_result",
                title: "ARZOPA portable monitors",
                url: "https://www.arzopa.com/collections/portable-monitors",
                snippet: "",
              },
              {
                type: "text_result",
                title: "ARZOPA A1S monitor",
                url,
                snippet: "",
              },
            ],
          },
          {
            type: "message",
            content: [{ type: "output_text", text: "Related models." }],
          },
        ],
      });
    if (address.includes("/collections/"))
      return new Response(
        `<header><a href="/products/digital-frame">ARZOPA frame</a></header><main><a href="/products/a1">ARZOPA A1 portable monitor</a><a href="/products/z1c">ARZOPA Z1C portable monitor</a><a href="https://127.0.0.1/private">monitor</a><a href="https://evil.example/products/x">monitor</a></main>`,
        { headers: { "content-type": "text/html" } },
      );
    return new Response(
      `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: address.endsWith("/a1") ? "ARZOPA A1" : address.endsWith("/z1c") ? "ARZOPA Z1C" : "ARZOPA A1S", image: "https://cdn.shopify.com/photo.jpg" })}</script>`,
      { headers: { "content-type": "text/html" } },
    );
  });
  const result = await discoverProductsFromPhoto(
    { META_API_KEY: "test-only" } as unknown as Env,
    "data:image/jpeg;base64,/9j/2Q==",
    {
      brand: "AZOPA",
      model: "",
      label: "Portable monitor",
      confidence: 0.3,
    } as any,
    "US",
  );
  assert.deepEqual(result.map((c) => c.title).sort(), [
    "ARZOPA A1",
    "ARZOPA A1S",
    "ARZOPA Z1C",
  ]);
  assert.ok(
    requests.every(
      (url) =>
        url.startsWith("https://www.arzopa.com/") ||
        url === "https://api.meta.ai/v1/responses",
    ),
  );
  assert.ok(!requests.some((url) => url.includes("digital-frame")));
});

test("visual ranking groups the same model but preserves different generations and colors", async () => {
  const { applyVisualRanking } =
    await import("../../src/server/providers/visual-ranking.ts");
  const candidates = searchCandidates(
    [
      {
        url: "https://www.bose.com/p/quietcomfort",
        title: "Bose QuietComfort Black",
      },
      {
        url: "https://www.amazon.com/dp/B000000001",
        title: "Bose QuietComfort Black",
      },
      {
        url: "https://www.bose.com/p/quietcomfort-2",
        title: "Bose QuietComfort 2nd Gen Black",
      },
      {
        url: "https://www.bose.com/p/quietcomfort-white",
        title: "Bose QuietComfort White",
      },
    ],
    "US",
  );
  const ranked = applyVisualRanking(candidates, {
    matches: candidates.map((c) => ({
      id: c.id,
      assessment: "similar",
      brand: "Bose",
      model: c.title.includes("2nd") ? "QuietComfort 2nd Gen" : "QuietComfort",
      variant: c.title.includes("White") ? "White" : "Black",
      features: ["shape"],
    })),
  });
  assert.equal(ranked.length, 3);
  assert.ok(ranked.some((c) => c.identity?.model === "QuietComfort 2nd Gen"));
  assert.ok(ranked.some((c) => c.identity?.variant === "White"));
});

test("verified manufacturer storefronts are eligible and site logos are not product photos", () => {
  const rows = searchCandidates(
    [
      {
        url: "https://www.logi.com/en-us/shop/p/mx-master-3s.910-007500",
        title: "Logitech MX Master 3S",
      },
      {
        url: "https://www.samsung.com/us/jbl-harman-kardon/portable-speakers/jbl-flip-6/",
        title: "JBL Flip 6",
      },
    ],
    "US",
  );
  assert.equal(rows.length, 2);
  const result = candidateFromPage(
    base(),
    '<meta property="og:title" content="ARZOPA A1S"><meta property="og:image" content="https://resource.logitech.com/content/homepage/logitech-global-og-image.png">',
    url,
  );
  assert.equal(result.thumbnail, undefined);
});

test("completed search evidence remains usable when Meta stops before writing its final answer", async () => {
  const { discoverProductsFromPhoto } =
    await import("../../src/server/providers/meta.ts");
  mock.method(globalThis, "fetch", async (input: string | URL) =>
    String(input) === "https://api.meta.ai/v1/responses"
      ? Response.json({
          status: "incomplete",
          usage: { input_tokens: 100, output_tokens: 2400 },
          output: [
            {
              type: "web_search_call",
              status: "completed",
              action: { type: "search", query: "ARZOPA models" },
              results: [
                { type: "text_result", url, title: "ARZOPA A1S", snippet: "" },
              ],
            },
          ],
        })
      : new Response(
          `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "ARZOPA A1S", image: "https://cdn.shopify.com/a.jpg" })}</script>`,
          { headers: { "content-type": "text/html" } },
        ),
  );
  const result = await discoverProductsFromPhoto(
    { META_API_KEY: "test-only" } as unknown as Env,
    "data:image/jpeg;base64,/9j/2Q==",
    { brand: "", model: "", label: "Portable monitor", confidence: 0.3 } as any,
    "US",
  );
  assert.equal(result[0].title, "ARZOPA A1S");
  assert.ok(result[0].thumbnail);
});

test("duplicate structured nodes for the same product keep their shared family photo", () => {
  const html = [
    {
      "@type": "ProductGroup",
      "@id": "/products/a1s#product",
      name: "ARZOPA A1S Monitor",
      brand: { name: "ARZOPA" },
    },
    {
      "@type": "Product",
      "@id": "/products/a1s#product",
      name: "ARZOPA A1S Monitor",
      image: "https://cdn.shopify.com/a1s.jpg",
    },
  ]
    .map(
      (node) =>
        `<script type="application/ld+json">${JSON.stringify(node)}</script>`,
    )
    .join("");
  const result = candidateFromPage(base(), html, url);
  assert.match(result.thumbnail || "", /a1s.jpg/);
  assert.equal(result.title, "ARZOPA A1S Monitor");
  const conflicting = html.replace(
    '"name":"ARZOPA A1S Monitor","image"',
    '"name":"ARZOPA Z1C Monitor","image"',
  );
  assert.equal(
    candidateFromPage(base(), conflicting, url).thumbnail,
    undefined,
  );
});

test("review tracking does not duplicate a product and retailer search pages are excluded", () => {
  const rows = searchCandidates(
    [
      {
        url: "https://www.bose.com/p/headphones/QC.html?bvrrp=one&bvstate=two&mc=email",
        title: "Bose QuietComfort",
      },
      {
        url: "https://www.bose.com/p/headphones/QC.html",
        title: "Bose QuietComfort",
      },
      { url: "https://www.bose.com/c/headphones", title: "Headphones" },
      {
        url: "https://www.target.com/s/nintendo+switch",
        title: "Nintendo Switch",
      },
    ],
    "US",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, "https://www.bose.com/p/headphones/QC.html");
});

test("US image matches exclude regional and education-only Apple storefronts", () => {
  const rows = searchCandidates(
    [
      "/ie-edu/shop/buy-airpods/airpods-max",
      "/us-edu/shop/buy-airpods/airpods-max",
      "/ie/shop/buy-airpods/airpods-max",
      "/nl/shop/buy-airpods/airpods-max",
      "/shop/buy-airpods/airpods-max",
    ].map((path) => ({
      url: "https://www.apple.com" + path,
      title: "AirPods Max",
    })),
    "US",
  );
  assert.deepEqual(
    rows.map((row) => row.url),
    ["https://www.apple.com/shop/buy-airpods/airpods-max"],
  );
});

test("Apple's own hardware storefront supplies the brand when its page title omits it", () => {
  const candidate = {
    ...base(),
    url: "https://www.apple.com/shop/buy-airpods/airpods-max-2",
    title: "AirPods Max 2",
  };
  const result = candidateFromPage(
    candidate,
    '<meta property="og:title" content="AirPods Max 2"><meta property="og:image" content="https://store.storeimages.cdn-apple.com/product.jpg">',
    candidate.url,
  );
  assert.equal(result.title, "Apple AirPods Max 2");
  const thirdParty = candidateFromPage(
    { ...candidate, url: "https://www.apple.com/shop/product/accessory" },
    '<meta property="og:title" content="Accessory">',
    "https://www.apple.com/shop/product/accessory",
  );
  assert.equal(thirdParty.title, "Accessory");
});

test("a slow catalog leaves time to retrieve independent product photos", async () => {
  const { retrieveCandidatePhotos } =
    await import("../../src/server/providers/product-media.ts");
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  mock.method(AbortSignal, "timeout", (ms: number) =>
    nativeTimeout(ms === 14000 ? 100 : 15),
  );
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("/collections/"))
        return await new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("catalog timed out")),
            { once: true },
          ),
        );
      return new Response(
        '<script type="application/ld+json">{"@type":"Product","name":"ARZOPA A1S","image":"https://cdn.shopify.com/a1s.jpg"}</script>',
        { headers: { "content-type": "text/html" } },
      );
    },
  );
  const rows = await retrieveCandidatePhotos([base()], "US", undefined, {
    category: "portable monitor",
    sources: [
      {
        url: "https://www.arzopa.com/collections/portable-monitors",
        title: "Portable monitors",
      },
    ],
  });
  assert.ok(rows[0].thumbnail);
});

test("short model cards preserve refurbishment and used-condition evidence", async () => {
  const { visualListingCondition } =
    await import("../../src/shared/visual-search.ts");
  assert.equal(
    visualListingCondition({
      ...base(),
      title: "Apple AirPods Max Refurbished",
    }),
    "Refurbished",
  );
  assert.equal(
    visualListingCondition({
      ...base(),
      price: {
        priceMinor: 10000,
        currency: "USD",
        evidenceType: "product_page",
        kind: "retail",
        condition: "used",
      },
    }),
    "Used",
  );
  assert.equal(
    visualListingCondition({
      ...base(),
      title: "Apple AirPods Max (Open Box)",
    }),
    "Open box",
  );
});

test("nested merchant search, question and news pages cannot crowd out product listings", () => {
  const rows = searchCandidates(
    [
      {
        url: "https://www.bestbuy.com/site/searchpage.jsp?id=pcat",
        title: "Nintendo Switch",
      },
      {
        url: "https://www.bestbuy.com/site/questions/speaker/6356535/question/1",
        title: "Instructions",
      },
      {
        url: "https://www.nintendo.com/us/whatsnew/holiday-offers",
        title: "Nintendo Switch offers",
      },
      {
        url: "https://www.target.com/p/nintendo-switch/-/A-83887639?clkid=tracking&afid=partner&cpng=campaign&lnm=link",
        title: "Nintendo Switch OLED",
      },
    ],
    "US",
  );
  assert.deepEqual(
    rows.map((c) => c.url),
    ["https://www.target.com/p/nintendo-switch/-/A-83887639"],
  );
});
