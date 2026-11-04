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
const { ScanResultCard } = await server.ssrLoadModule(
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
