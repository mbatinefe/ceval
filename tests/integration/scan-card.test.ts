import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
after(() => server.close());
const { ScanResultCard, FindPriceBadge } = await server.ssrLoadModule(
  "/src/client/components/ScanResultCard.tsx",
);
function render(shelfPriceMinor: number | null, shelfCurrency: string | null) {
  return renderToStaticMarkup(
    createElement(ScanResultCard, {
      row: {
        product: {
          id: "item",
          brand: "",
          model: "",
          label: "decorative clock",
          variant: "",
          confidence: 0.4,
          box: { x: 0, y: 0, width: 1, height: 1 },
          shelfPriceMinor,
          shelfCurrency,
        },
        visualSearching: true,
      },
      mode: "buy",
      market: "US",
      onChoose() {},
      onReview() {},
    }),
  );
}
test("a recognized shelf price remains visible while online matching is pending", () => {
  const markup = render(579, "USD");
  assert.match(markup, /Shelf label/);
  assert.match(markup, /\$5\.79/);
  assert.match(markup, /Matching your photo/);
  assert.doesNotMatch(markup, /Lowest new price|below shelf/);
});
test("an unknown shelf price does not display a placeholder amount", () => {
  const markup = render(null, null);
  assert.doesNotMatch(markup, /Shelf label/);
  assert.match(markup, /Matching your photo/);
});

test("collapsed camera prices show the shelf amount before online results exist", () => {
  assert.equal(typeof FindPriceBadge, "function");
  const markup = renderToStaticMarkup(
    createElement(FindPriceBadge, {
      row: { product: { shelfPriceMinor: 4499, shelfCurrency: "USD" } },
      mode: "buy",
      market: "US",
    }),
  );
  assert.match(markup, /\$44\.99/);
  assert.match(markup, /Shelf label/);
});

test("collapsed online prices preserve possible-match qualification over a shelf price", () => {
  const product = { shelfPriceMinor: 4499, shelfCurrency: "USD" };
  const markup = renderToStaticMarkup(
    createElement(FindPriceBadge, {
      row: {
        product,
        comparison: {
          product,
          mode: "buy",
          market: "US",
          checkedAt: Date.now(),
          expiresAt: Date.now() + 60000,
          offers: [
            {
              title: "Shoe",
              url: "https://shop.example/item",
              priceMinor: 3999,
              currency: "USD",
              kind: "retail",
              condition: "new",
              match: "possible",
              evidenceType: "product_page",
            },
          ],
        },
      },
      mode: "buy",
      market: "US",
    }),
  );
  assert.match(markup, /\$39\.99/);
  assert.match(markup, /Possible match/);
  assert.doesNotMatch(markup, /Shelf label|\$44\.99/);
});
test("collapsed prices stay empty when neither an offer nor a shelf currency is known", () => {
  assert.equal(
    renderToStaticMarkup(
      createElement(FindPriceBadge, {
        row: { product: { shelfPriceMinor: 599, shelfCurrency: null } },
        mode: "buy",
        market: "US",
      }),
    ),
    "",
  );
});
