import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  lensMatches,
  parseLensMatches,
  candidateImageUrl,
} from "../../src/server/providers/lens.ts";
import { applyVisualRanking } from "../../src/server/providers/visual-ranking.ts";
const entry = (extra = {}) => ({
  title: "ARZOPA A1S Gray Portable Monitor",
  link: "https://www.arzopa.com/products/a1s",
  thumbnail: "https://encrypted-tbn0.gstatic.com/images?q=tbn:example",
  price: { extracted_value: 69.99, currency: "USD" },
  ...extra,
});
afterEach(() => mock.restoreAll());
test("Lens results preserve source evidence without asserting a model match", () => {
  const rows = parseLensMatches(
    {
      visual_matches: [
        entry(),
        entry(),
        entry({ link: "javascript:alert(1)" }),
        entry({
          link: "https://other-shop.com/item",
          price: { extracted_value: 10, currency: "CAD" },
        }),
      ],
    },
    "US",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].price?.priceMinor, 6999);
  assert.equal(rows[0].price?.evidenceType, "search_result");
  assert.equal(rows[0].assessment, "unreviewed");
  assert.equal(rows[0].identity, undefined);
  assert.equal(rows[1].price, undefined);
});
test("ambiguous dollars, unavailable offers and untrusted image hosts cannot become prices or thumbnails", () => {
  const rows = parseLensMatches(
    {
      visual_matches: [
        entry({
          price: { extracted_value: 69, currency: "$" },
          thumbnail: "https://127.0.0.1/photo",
        }),
        entry({ link: "https://arzopa.com/products/b", in_stock: false }),
      ],
    },
    "US",
  );
  assert.equal(rows[0].price, undefined);
  assert.equal(rows[0].thumbnail, undefined);
  assert.equal(rows[1].price, undefined);
  for (const value of [
    "https://encrypted-tbn0.gstatic.com.evil.example/images?q=a",
    "http://encrypted-tbn0.gstatic.com/images?q=a",
    "https://encrypted-tbn0.gstatic.com:444/images?q=a",
    "https://encrypted-tbn0.gstatic.com/not-images?q=a",
  ])
    assert.equal(candidateImageUrl(value), null);
});
test("Meta can only reorder retrieved IDs and derive identities supported by their titles", () => {
  const rows = parseLensMatches(
    {
      visual_matches: [
        entry(),
        entry({
          title: "Portable monitor",
          link: "https://monitor-shop.com/monitor",
        }),
      ],
    },
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
  assert.equal(ranked[1].price?.priceMinor, 6999);
  assert.equal(ranked[1].assessment, "likely");
});
test("Lens uploads the JPEG directly then searches by image_id with US bias", async () => {
  const frame =
    "data:image/jpeg;base64," +
    (await readFile("tests/fixtures/frame.jpg")).toString("base64");
  let calls = 0;
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL, init?: RequestInit) => {
      calls++;
      const url = new URL(String(input));
      if (calls === 1) {
        assert.equal(url.href, "https://serpapi.com/image");
        assert.equal(init?.method, "POST");
        assert.ok(init?.body instanceof FormData);
        assert.equal(init.body.get("api_key"), "test-only");
        assert.ok(init.body.get("image") instanceof Blob);
        return Response.json({ image_id: "uploaded-image" });
      }
      assert.equal(url.searchParams.get("image_id"), "uploaded-image");
      assert.equal(url.searchParams.get("type"), "visual_matches");
      assert.equal(url.searchParams.get("country"), "us");
      assert.equal(url.searchParams.has("url"), false);
      return Response.json({ visual_matches: [entry()] });
    },
  );
  assert.equal(
    (
      await lensMatches(
        { SERPAPI_API_KEY: "test-only" } as unknown as Env,
        frame,
        "US",
      )
    ).length,
    1,
  );
  assert.equal(calls, 2);
});
test("provider failures do not expose response bodies or credential-bearing URLs", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "secret-key confidential" }, { status: 429 }),
  );
  await assert.rejects(
    lensMatches(
      { SERPAPI_API_KEY: "test-only" } as unknown as Env,
      "data:image/jpeg;base64,/9j/2Q==",
      "US",
    ),
    (error: Error) =>
      !error.message.includes("secret-key") &&
      /busy|limit/i.test(error.message),
  );
});

test("ranking explanations cannot invent confirmations, resale values or destinations", () => {
  const candidates = parseLensMatches({ visual_matches: [entry()] }, "US");
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
