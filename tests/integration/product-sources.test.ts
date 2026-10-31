import { test } from "node:test";
import assert from "node:assert/strict";
import { productSources } from "../../src/server/providers/product-sources.ts";
import type { Product } from "../../src/shared/scan.ts";

const product: Product = {
  id: "selected-laptop",
  brand: "Apple",
  model: "MacBook Pro 16-inch M2 Pro 2023",
  variant: "Silver",
  label: "Laptop",
  identification: "user_selected",
  confidence: 0.45,
  box: { x: 0, y: 0, width: 1, height: 1 },
  shelfPriceMinor: null,
  shelfCurrency: null,
};
const source = (
  title: string,
  url = "https://shop.example.com/product/laptop",
) => ({ title, url, snippet: "" });

test("related MacBook pages can omit qualifiers but cannot claim a price or exact model", () => {
  for (const title of [
    "Apple MacBook Pro 16-inch M2 Pro 2023",
    'Apple MacBook Pro 16.2" M2 Pro',
    "Apple MacBook Pro M2 Pro laptop",
    "Apple MacBook Pro 16-inch laptop",
    "Apple MacBook Pro 2023 laptop",
    "Apple MacBook Pro 16 laptop",
  ])
    assert.deepEqual(
      productSources([source(title)], product),
      [{ title, url: "https://shop.example.com/product/laptop" }],
      title,
    );
});
test("missing identity and explicit conflicting MacBook qualifiers cannot become related pages", () => {
  for (const title of [
    "Apple MacBook Pro laptop",
    "MacBook Pro 16-inch M2 Pro 2023",
    "Apple MacBook Air 16-inch M2 Pro 2023",
    "Apple MacBook Pro 14-inch M2 Pro 2023",
    "Apple MacBook Pro 14 M2 Pro 2023",
    "Apple MacBook Pro 16-inch M1 Pro 2023",
    "Apple MacBook Pro 16-inch M2 Max 2023",
    "Apple MacBook Pro 16-inch M2 Pro 2021",
    "Apple MacBook Pro 14-inch or 16-inch M2 Pro 2023",
  ])
    assert.deepEqual(productSources([source(title)], product), [], title);
});
test("source links exclude editorial, search, unsafe and accessory pages", () => {
  const title = "Apple MacBook Pro 16-inch M2 Pro 2023";
  for (const url of [
    "http://shop.example.com/product/laptop",
    "https://localhost/item",
    "https://shop.example.com/search?q=macbook",
    "https://shop.example.com/category/macbooks",
    "https://shop.example.com/reviews/macbook",
    "https://www.reddit.com/r/macbook/comments/123",
    "https://www.youtube.com/watch?v=123",
    "https://shop.example.com/article/macbook",
    "https://shop.example.com/product/macbook-review",
    "https://www.facebook.com/marketplace/search?query=macbook",
    "https://support.apple.com/en-us/111838",
  ])
    assert.deepEqual(productSources([source(title, url)], product), [], url);
  for (const suffix of [
    "replacement battery",
    "charger",
    "case",
    "bundle",
    "review",
    "buying guide",
    "comparison",
    "Technical Specifications",
    "tech specs",
  ])
    assert.deepEqual(
      productSources([source(`${title} ${suffix}`)], product),
      [],
      suffix,
    );
});
test("only native titles can establish source relevance and other models remain strict", () => {
  assert.deepEqual(
    productSources(
      [
        {
          ...source("Laptop sale"),
          snippet: "Apple MacBook Pro 16-inch M2 Pro 2023",
        },
      ],
      product,
    ),
    [],
  );
  const headphones = { ...product, brand: "Sony", model: "WH-1000XM5" };
  assert.equal(
    productSources([source("Sony WH-1000XM5 headphones")], headphones).length,
    1,
  );
  assert.deepEqual(
    productSources([source("Sony WH-1000XM4 headphones")], headphones),
    [],
  );
});
test("retrieved product links are deduplicated and bounded to three", () => {
  const title = "Apple MacBook Pro 16-inch M2 Pro 2023";
  const sources = [
    source(title),
    source(title),
    ...[1, 2, 3, 4].map((i) =>
      source(title, `https://shop.example.com/product/${i}`),
    ),
  ];
  assert.deepEqual(
    productSources(sources, product).map((s) => s.url),
    [
      "https://shop.example.com/product/laptop",
      "https://shop.example.com/product/1",
      "https://shop.example.com/product/2",
    ],
  );
});

test("US product links exclude foreign storefronts and tracking duplicates", () => {
  const monitor = { ...product, brand: "ARZOPA", model: "A1S" };
  const title = "ARZOPA A1S Portable Monitor";
  const sources = [
    source(title, "https://www.amazon.co.uk/dp/B123456789"),
    source(title, "https://www.arzopa.com/en-ca/products/a1s"),
    source(
      title,
      "https://www.arzopa.com/collections/all/products/a1s?utm_source=search",
    ),
    source(title, "https://www.arzopa.com/products/a1s?utm_source=another"),
    source(title, "https://www.arzopa.com/products/a1s?variant=gray"),
  ];
  assert.deepEqual(
    productSources(sources, monitor, "US").map((s) => s.url),
    [
      "https://www.arzopa.com/products/a1s",
      "https://www.arzopa.com/products/a1s?variant=gray",
    ],
  );
});

test("reviewed manufacturer hosts establish brand when native titles omit it", () => {
  const headphones = {
    ...product,
    brand: "Bose",
    model: "QuietComfort",
    variant: "Black",
  };
  const title = "Shop QuietComfort Noise Cancelling Headphones";
  assert.equal(
    productSources(
      [source(title, "https://www.bose.com/p/headphones/quietcomfort/QC.html")],
      headphones,
      "US",
    ).length,
    1,
  );
  assert.deepEqual(
    productSources(
      [source(title, "https://bose.attacker.com/p/quietcomfort")],
      headphones,
      "US",
    ),
    [],
  );
});
