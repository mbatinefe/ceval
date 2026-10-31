import { after, before, beforeEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import worker from "../../src/server/index.ts";
import type { Comparison, Product } from "../../src/shared/scan.ts";

const origin = "https://ceval.example";
const secret = "history-test-only-secret-over-32-characters";
let mf: Miniflare;
let env: Env;
let thumbnail: string;
const product: Product = {
  id: "product-one",
  brand: "Sony",
  model: "",
  variant: "Black",
  label: "Sony headphones",
  confidence: 0.35,
  box: { x: 0.1, y: 0.1, width: 0.3, height: 0.5 },
  shelfPriceMinor: null,
  shelfCurrency: null,
};
const comparison: Comparison = {
  id: "comparison-one",
  product,
  mode: "buy",
  market: "US",
  offers: [],
  checkedAt: 100,
  expiresAt: 200,
  status: "no_evidence",
};
function request(
  path = "/api/scan/history",
  body?: unknown,
  user: string | null = "shopper",
  method?: string,
  requestOrigin = origin,
) {
  const token = `${user}-history-session`;
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return worker.fetch(
    new Request(origin + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        ...(user
          ? {
              Cookie: `__Secure-ceval.session_token=${encodeURIComponent(`${token}.${signature}`)}`,
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
    {
      waitUntil(promise: Promise<unknown>) {
        void promise.catch(() => {});
      },
      passThroughOnException() {},
      props: {},
    },
  );
}
async function seedProduct(value = product, owner = "shopper") {
  await env.DB.prepare(
    "INSERT INTO scan_products (id,user_id,fingerprint,data,updated_at) VALUES (?,?,?,?,?)",
  )
    .bind(value.id, owner, value.id, JSON.stringify(value), Date.now())
    .run();
}
async function seedComparison(value = comparison, owner = "shopper") {
  await env.DB.prepare(
    "INSERT INTO scan_comparisons (id,user_id,data,created_at) VALUES (?,?,?,?)",
  )
    .bind(value.id, owner, JSON.stringify(value), Date.now())
    .run();
}
const payload = (id = crypto.randomUUID()) => ({
  id,
  productId: product.id,
  source: "camera",
  mode: "buy",
  thumbnail,
});
before(async () => {
  mf = new Miniflare(
    await convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-10-29",
      d1Databases: ["DB"],
    }),
  );
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("db/d1/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`db/d1/migrations/${file}`, "utf8");
    await db.batch(
      sql
        .split(";")
        .filter((part) => part.trim())
        .map((part) => db.prepare(part)),
    );
  }
  thumbnail =
    "data:image/jpeg;base64," +
    (await readFile("tests/fixtures/frame.jpg")).toString("base64");
  env = {
    DB: db,
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: secret,
    APP_ENVIRONMENT: "staging",
    SCAN_ENABLED: "true",
    SCAN_TOTAL_BUDGET_MICROS: "100000000",
    META_API_KEY: "test-only",
    SERPAPI_API_KEY: "test-only",
    ASSETS: { fetch: async () => new Response("page") },
  } as unknown as Env;
});
after(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM user").run();
  await env.DB.prepare("DELETE FROM app_limits").run();
  for (const id of ["shopper", "other"]) {
    await env.DB.prepare(
      "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)",
    )
      .bind(id, "Shopper", `${id}@example.com`, Date.now(), Date.now())
      .run();
    await env.DB.prepare(
      "INSERT INTO session (id,expiresAt,token,createdAt,updatedAt,userId) VALUES (?,?,?,?,?,?)",
    )
      .bind(
        id,
        Date.now() + 86400000,
        `${id}-history-session`,
        Date.now(),
        Date.now(),
        id,
      )
      .run();
  }
  mock.restoreAll();
  await env.DB.prepare("DELETE FROM scan_spend").run();
  await seedProduct();
  await seedProduct({ ...product, id: "other-product" }, "other");
  await seedComparison();
  await seedComparison({ ...comparison, id: "other-comparison" }, "other");
});

function mockProviders(
  options: { beforeRank?: () => Promise<void>; partial?: boolean } = {},
) {
  let uploads = 0,
    searches = 0,
    rankings = 0;
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://serpapi.com/image") {
        uploads++;
        return Response.json({ image_id: "test-image" });
      }
      if (url.startsWith("https://serpapi.com/search?")) {
        searches++;
        return Response.json({
          visual_matches: [
            ...(options.partial
              ? [
                  {
                    title: "Sony WH-1000XM4 Black headphones",
                    link: "https://www.sony.com/headphones/missing",
                    thumbnail:
                      "https://encrypted-tbn1.gstatic.com/images?q=unavailable",
                  },
                ]
              : []),
            {
              title: "Sony WH-1000XM5 Black headphones",
              link: "https://www.sony.com/headphones/test",
              thumbnail: "https://encrypted-tbn0.gstatic.com/images?q=test",
              price: { currency: "USD", extracted_value: 199.99 },
            },
          ],
        });
      }
      if (url.startsWith("https://encrypted-tbn0.gstatic.com/"))
        return new Response(
          Uint8Array.from(atob(thumbnail.slice(23)), (c) => c.charCodeAt(0)),
          { headers: { "Content-Type": "image/jpeg" } },
        );
      if (url === "https://api.meta.ai/v1/responses") {
        rankings++;
        await options.beforeRank?.();
        const body = JSON.parse(String(init?.body));
        const parts = body.input[0].content;
        const candidate = JSON.parse(
          parts.find((p: { text?: string }) => p.text?.startsWith('{"id"'))
            .text,
        );
        return Response.json({
          status: "completed",
          usage: { input_tokens: 100, output_tokens: 100 },
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    matches: [
                      {
                        id: candidate.id,
                        assessment: "likely",
                        brand: "Sony",
                        model: "WH-1000XM5",
                        variant: "Black",
                        reason: "Same headband; label unconfirmed.",
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        });
      }
      return new Response("unavailable", { status: 403 });
    },
  );
  return () => ({ uploads, searches, rankings });
}
test("unknown models can search stored photos; results survive reload and duplicate requests are cached", async () => {
  const counts = mockProviders();
  const saved = await (await request(undefined, payload())).json();
  await env.DB.prepare("UPDATE scan_products SET updated_at=1 WHERE id=?")
    .bind(product.id)
    .run();
  const response = await request("/api/scan/visual-matches", {
    productId: product.id,
    market: "US",
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.candidates.length, 1);
  assert.equal(result.ranking, "meta");
  assert.equal(result.candidates[0].identity.model, "WH-1000XM5");
  const repeat = await request("/api/scan/visual-matches", {
    productId: product.id,
    market: "US",
  });
  assert.equal(repeat.status, 200);
  assert.deepEqual(counts(), { uploads: 1, searches: 1, rankings: 1 });
  const history = await (await request()).json();
  assert.equal(
    history.entries[0].visualSearch.candidates[0].id,
    result.candidates[0].id,
  );
  const selection = await request("/api/scan/select-model", {
    productId: product.id,
    market: "US",
    candidateKey: `visual:${result.candidates[0].id}`,
  });
  assert.equal(selection.status, 200);
  assert.equal(
    (await selection.json()).product.identification,
    "user_selected",
  );
  const spend = await env.DB.prepare(
    "SELECT status,amount FROM scan_spend",
  ).all();
  assert.equal(spend.results.length, 1);
  assert.equal(spend.results[0].status, "estimated");
});
test("visual discovery requires authentication, origin and ownership before provider traffic", async () => {
  const counts = mockProviders();
  const body = { productId: "other-product", market: "US", image: thumbnail };
  assert.equal(
    (await request("/api/scan/visual-matches", body, null)).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/api/scan/visual-matches",
        body,
        "shopper",
        "POST",
        "https://wrong.example",
      )
    ).status,
    403,
  );
  assert.equal((await request("/api/scan/visual-matches", body)).status, 404);
  assert.deepEqual(counts(), { uploads: 0, searches: 0, rankings: 0 });
});
test("missing photo or provider does not spend credits or silently use text search", async () => {
  const counts = mockProviders();
  assert.equal(
    (
      await request("/api/scan/visual-matches", {
        productId: product.id,
        market: "US",
      })
    ).status,
    422,
  );
  await request(undefined, payload());
  const copy = Reflect.get(env, "SERPAPI_API_KEY");
  Reflect.deleteProperty(env, "SERPAPI_API_KEY");
  try {
    const response = await request("/api/scan/visual-matches", {
      productId: product.id,
      market: "US",
      image: thumbnail,
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "visual_unavailable");
  } finally {
    Reflect.set(env, "SERPAPI_API_KEY", copy);
  }
  assert.deepEqual(counts(), { uploads: 0, searches: 0, rankings: 0 });
});
test("concurrent discoveries share a product lock and cannot spend twice", async () => {
  const counts = mockProviders();
  await request(undefined, payload());
  const results = await Promise.all([
    request("/api/scan/visual-matches", {
      productId: product.id,
      market: "US",
      image: thumbnail,
    }),
    request("/api/scan/visual-matches", {
      productId: product.id,
      market: "US",
      image: thumbnail,
    }),
  ]);
  assert.ok(results.some((r) => r.status === 200));
  assert.ok(results.every((r) => r.status === 200 || r.status === 409));
  assert.deepEqual(counts(), { uploads: 1, searches: 1, rankings: 1 });
});

test("deleting a find removes candidate history and prevents cached access", async () => {
  mockProviders();
  const saved = await (await request(undefined, payload())).json();
  const response = await request("/api/scan/visual-matches", {
    productId: product.id,
    market: "US",
  });
  assert.equal(response.status, 200);
  await request(`/api/scan/history/${saved.entry.id}`, {}, "shopper", "DELETE");
  const rows = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scan_visual_matches",
  ).first<{ n: number }>();
  assert.equal(rows?.n, 0);
  assert.equal(
    (
      await request("/api/scan/visual-matches", {
        productId: product.id,
        market: "US",
      })
    ).status,
    422,
  );
});
test("an in-flight result cannot recreate matches after its find is deleted", async () => {
  let begin!: () => void, release!: () => void;
  const began = new Promise<void>((resolve) => (begin = resolve)),
    gate = new Promise<void>((resolve) => (release = resolve));
  mockProviders({
    beforeRank: async () => {
      begin();
      await gate;
    },
  });
  const saved = await (await request(undefined, payload())).json();
  const task = request("/api/scan/visual-matches", {
    productId: product.id,
    market: "US",
  });
  await began;
  await request(`/api/scan/history/${saved.entry.id}`, {}, "shopper", "DELETE");
  release();
  const response = await task;
  assert.equal(response.status, 404);
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scan_visual_matches",
  ).first<{ n: number }>();
  assert.equal(row?.n, 0);
});
test("a candidate whose photo failed cannot be endorsed by visual ranking", async () => {
  mockProviders({ partial: true });
  await request(undefined, payload());
  const response = await request("/api/scan/visual-matches", {
    productId: product.id,
    market: "US",
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  const missing = result.candidates.find((c: { url: string }) =>
    c.url.includes("missing"),
  );
  assert.ok(missing);
  assert.equal(missing.assessment, "unreviewed");
  assert.equal(missing.identity, undefined);
  const visible = result.candidates.find(
    (c: { url: string }) => !c.url.includes("missing"),
  );
  assert.equal(visible.assessment, "likely");
});

test("a removed find can be scanned again without an obsolete cache lock", async () => {
  const counts = mockProviders();
  const body = payload();
  await request(undefined, body);
  assert.equal(
    (
      await request("/api/scan/visual-matches", {
        productId: product.id,
        market: "US",
      })
    ).status,
    200,
  );
  await request(`/api/scan/history/${body.id}`, {}, "shopper", "DELETE");
  await request(undefined, payload());
  assert.equal(
    (
      await request("/api/scan/visual-matches", {
        productId: product.id,
        market: "US",
      })
    ).status,
    200,
  );
  assert.equal(counts().searches, 2);
});
