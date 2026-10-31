import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePageOffers,
  retrievedPageOffers,
} from "../../src/server/providers/product-pages.ts";
import type { Product } from "../../src/shared/scan.ts";

const product: Product = {
  id: "monitor",
  brand: "ARZOPA",
  model: "A1S",
  variant: "Gray",
  label: "Portable monitor",
  confidence: 0.5,
  identification: "user_selected",
  box: { x: 0, y: 0, width: 1, height: 1 },
  shelfPriceMinor: null,
  shelfCurrency: null,
};
const url = "https://www.arzopa.com/products/a1s";
const offer = {
  "@type": "Offer",
  price: "69.99",
  priceCurrency: "USD",
  availability: "https://schema.org/InStock",
  itemCondition: "https://schema.org/NewCondition",
};
const item = {
  "@type": "Product",
  name: "ARZOPA A1S 14-inch monitor - Gray",
  color: "Gray",
  brand: { name: "ARZOPA" },
  offers: offer,
};
const html = (value: unknown) =>
  `<html><script type="application/ld+json">${JSON.stringify(value)}</script></html>`;

test("actual Product variants provide only the matching in-stock price", () => {
  const page = html({
    "@type": "ProductGroup",
    brand: { name: "ARZOPA" },
    hasVariant: [
      { ...item, offers: { ...offer, url: url + "?variant=gray" } },
      {
        ...item,
        name: "ARZOPA A1S Black",
        color: "Black",
        offers: {
          ...offer,
          price: "49.99",
          availability: "https://schema.org/OutOfStock",
          url: url + "?variant=black",
        },
      },
    ],
  });
  const found = parsePageOffers(page, url, product, "US", "buy");
  assert.equal(found.length, 1);
  assert.equal(found[0].priceMinor, 6999);
  assert.equal(found[0].url, url + "?variant=gray");
  assert.equal(found[0].match, "possible");
  assert.equal(found[0].condition, "new");
  assert.equal(found[0].evidenceType, "product_page");
});

test("wrong model, variant, market, unavailable and ambiguous prices stay out", () => {
  const invalid = [
    { ...item, name: "ARZOPA A1M Gray" },
    { ...item, name: "ARZOPA A1S Black", color: "Black" },
    { ...item, offers: { ...offer, priceCurrency: "CAD" } },
    { ...item, offers: { ...offer, priceCurrency: undefined } },
    { ...item, offers: { ...offer, availability: undefined } },
    {
      ...item,
      offers: { ...offer, availability: "https://schema.org/OutOfStock" },
    },
    { ...item, offers: { ...offer, price: "-10" } },
    { ...item, offers: { ...offer, price: "69.991" } },
    { ...item, offers: { ...offer, priceValidUntil: "2001-01-01" } },
    {
      ...item,
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "49.99",
        highPrice: "89.99",
        priceCurrency: "USD",
      },
    },
    {
      ...item,
      offers: [
        { ...offer, price: "49.99" },
        { ...offer, price: "89.99" },
      ],
    },
    { ...item, offers: { ...offer, url: "https://www.amazon.com/dp/other" } },
    { ...item, name: "ARZOPA A1S replacement stand Gray" },
  ];
  for (const value of invalid)
    assert.deepEqual(
      parsePageOffers(html(value), url, product, "US", "buy"),
      [],
      JSON.stringify(value),
    );
  assert.deepEqual(
    parsePageOffers(
      html(item),
      "https://www.arzopa.com/uk/products/a1s",
      product,
      "US",
      "buy",
    ),
    [],
  );
});

test("a redirected newer generation cannot inherit an older model's identity", () => {
  const apple = {
    ...product,
    brand: "Apple",
    model: "AirPods Max",
    variant: "",
  };
  assert.deepEqual(
    parsePageOffers(
      html({ ...item, name: "Apple AirPods Max 2", brand: "Apple" }),
      "https://www.apple.com/shop/buy-airpods/airpods-max-2",
      apple,
      "US",
      "buy",
    ),
    [],
  );
});

test("resale preserves used asking evidence and excludes new retail reference prices", () => {
  assert.deepEqual(
    parsePageOffers(html(item), url, product, "US", "resale"),
    [],
  );
  const [found] = parsePageOffers(
    html({
      ...item,
      offers: { ...offer, itemCondition: "https://schema.org/UsedCondition" },
    }),
    url,
    product,
    "US",
    "resale",
  );
  assert.equal(found.priceMinor, 6999);
  assert.equal(found.kind, "asking");
  assert.equal(found.condition, "used");
});

test("malformed or unrelated page data cannot manufacture an offer", () => {
  for (const body of [
    "",
    '<script type="application/ld+json">invalid</script>',
    html({ "@type": "WebPage", name: item.name, offers: offer }),
    html({ "@type": "ProductGroup", name: item.name, offers: offer }),
  ])
    assert.deepEqual(parsePageOffers(body, url, product, "US", "buy"), []);
});

test("source fetching uses a reviewed HTTPS host and validates every redirect", async (t) => {
  const visited: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string, init: RequestInit) => {
      visited.push(String(input));
      assert.equal(init.redirect, "manual");
      assert.equal(new Headers(init.headers).has("authorization"), false);
      assert.equal(new Headers(init.headers).has("cookie"), false);
      return new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/private" },
      });
    },
  );
  const sources = [
    "http://www.arzopa.com/products/a1s",
    "https://127.0.0.1/product",
    "https://www.arzopa.com.attacker.test/product",
    "https://unreviewed-shop.com/product",
    url,
  ].map((url) => ({ url, title: item.name }));
  assert.deepEqual(
    await retrievedPageOffers(sources, product, "US", "buy"),
    [],
  );
  assert.deepEqual(visited, [url]);
});

test("three product pages are the maximum and a failed page preserves a good result", async (t) => {
  const visited: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    visited.push(String(input));
    if (String(input).endsWith("/one"))
      return new Response("busy", { status: 503 });
    return new Response(html(item), {
      headers: { "content-type": "text/html" },
    });
  });
  const sources = ["one", "two", "three", "four", "five"].map((suffix) => ({
    url: url + "/" + suffix,
    title: item.name,
  }));
  const found = await retrievedPageOffers(sources, product, "US", "buy");
  assert.equal(visited.length, 3);
  assert.equal(found.length, 2);
  assert(found.every((o) => o.priceMinor === 6999));
});

test("oversized page bodies and redirect loops do not become offers", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: string) => {
    calls++;
    if (String(input).endsWith("/large"))
      return new Response(" ".repeat(2_000_001) + html(item), {
        headers: { "content-type": "text/html" },
      });
    return new Response(null, {
      status: 302,
      headers: { Location: url + "/loop" },
    });
  });
  assert.deepEqual(
    await retrievedPageOffers(
      [
        { title: item.name, url: url + "/large" },
        { title: item.name, url: url + "/loop" },
      ],
      product,
      "US",
      "buy",
    ),
    [],
  );
  assert.equal(calls, 4);
});

test("an already cancelled comparison does not fetch merchant pages", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("must not fetch");
  });
  assert.deepEqual(
    await retrievedPageOffers(
      [{ title: item.name, url }],
      product,
      "US",
      "buy",
      AbortSignal.abort(),
    ),
    [],
  );
});

test("real catalog typography and decimal display sizes preserve exact model identity", () => {
  const consoleProduct = {
    ...product,
    brand: "Nintendo",
    model: "Switch OLED",
    variant: "White",
  };
  assert.equal(
    parsePageOffers(
      html({
        "@type": "Product",
        name: "Nintendo Switch™ - OLED Model White set",
        brand: "Nintendo",
        offers: offer,
      }),
      "https://www.nintendo.com/us/store/products/nintendo-switch-oled-model-white-set",
      consoleProduct,
      "US",
      "buy",
    )[0]?.priceMinor,
    6999,
  );
  const monitor = { ...product, model: "Z1C", variant: "Black" };
  assert.equal(
    parsePageOffers(
      html({
        ...item,
        name: 'Arzopa Z1C 16.1" FHD Display - Black',
        color: "Black",
      }),
      url,
      monitor,
      "US",
      "buy",
    )[0]?.priceMinor,
    6999,
  );
});
