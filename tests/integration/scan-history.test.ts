import { after, before, beforeEach, test } from "node:test";
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
  model: "WH-1000XM5",
  variant: "Black",
  label: "Sony headphones",
  confidence: 0.94,
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
  await seedProduct();
  await seedProduct({ ...product, id: "other-product" }, "other");
  await seedComparison();
  await seedComparison({ ...comparison, id: "other-comparison" }, "other");
});

test("history remembers server-owned products without requiring price results", async () => {
  const body = payload();
  const response = await request(undefined, {
    ...body,
    product: { model: "Untrusted model" },
  });
  assert.equal(response.status, 200);
  const { entry } = await response.json();
  assert.equal(entry.id, body.id);
  assert.equal(entry.product.model, "WH-1000XM5");
  assert.equal(entry.comparison, undefined);
  assert.equal(entry.thumbnailUrl, `/api/scan/history/${body.id}/image`);
  assert.ok(entry.createdAt > 0);
  assert.equal(entry.updatedAt, entry.createdAt);
  const listed = await (await request()).json();
  assert.equal(listed.entries.length, 1);
  assert.equal(JSON.stringify(listed).includes("data:image"), false);
  const image = await request(entry.thumbnailUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("Content-Type"), "image/jpeg");
  assert.equal(image.headers.get("Cache-Control"), "private, no-store");
  assert.equal(image.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(
    Buffer.from(await image.arrayBuffer()),
    await readFile("tests/fixtures/frame.jpg"),
  );
});

test("history retains the server shopping market and updates it with a saved comparison", async () => {
  await env.DB.prepare("UPDATE scan_products SET market='TR' WHERE id=?")
    .bind(product.id)
    .run();
  const body = payload();
  const detected = await request(undefined, { ...body, market: "US" });
  assert.equal(detected.status, 200);
  assert.equal((await detected.json()).entry.market, "TR");
  const compared = await request(undefined, {
    ...body,
    comparisonId: comparison.id,
  });
  assert.equal(compared.status, 200);
  assert.equal((await compared.json()).entry.market, "US");
  const repeated = await request(undefined, body);
  assert.equal((await repeated.json()).entry.market, "US");
});

test("unresolved resale finds retain their mode after a saved model choice", async () => {
  const body = { ...payload(), mode: "resale" };
  const remembered = await request(undefined, body);
  assert.equal(remembered.status, 200);
  assert.equal((await remembered.json()).entry.mode, "resale");
  await seedProduct({
    ...product,
    id: "selected-resale-product",
    identification: "user_selected",
  });
  const selected = await request(undefined, {
    ...body,
    productId: "selected-resale-product",
    thumbnail: undefined,
  });
  assert.equal(selected.status, 200);
  const entry = (await selected.json()).entry;
  assert.equal(entry.mode, "resale");
  assert.equal(entry.comparison, undefined);
  assert.equal((await (await request()).json()).entries[0].mode, "resale");
});

test("changing scan mode clears an incompatible comparison on both upsert paths", async () => {
  for (const sameId of [true, false]) {
    await request(undefined, {}, "shopper", "DELETE");
    const body = payload();
    await request(undefined, { ...body, comparisonId: comparison.id });
    const changed = await request(undefined, {
      ...body,
      id: sameId ? body.id : crypto.randomUUID(),
      mode: "resale",
    });
    assert.equal(changed.status, 200);
    const entry = (await changed.json()).entry;
    assert.equal(entry.mode, "resale");
    assert.equal(entry.comparison, undefined);
    assert.equal(entry.id, body.id);
  }
});

test("history rejects missing or invalid mode and comparisons from another mode", async () => {
  for (const mode of [undefined, "trade"]) {
    assert.equal(
      (await request(undefined, { ...payload(), mode })).status,
      400,
    );
  }
  assert.equal(
    (
      await request(undefined, {
        ...payload(),
        mode: "resale",
        comparisonId: comparison.id,
      })
    ).status,
    409,
  );
});

test("history metadata, images and mutations require an owner session and matching origin", async () => {
  const body = payload();
  assert.equal((await request(undefined, body)).status, 200);
  for (const method of ["GET", "POST", "DELETE"]) {
    assert.equal(
      (
        await request(
          undefined,
          method === "GET" ? undefined : body,
          null,
          method,
        )
      ).status,
      401,
    );
  }
  assert.equal(
    (await request(`/api/scan/history/${body.id}/image`, undefined, null))
      .status,
    401,
  );
  assert.equal(
    (await request(`/api/scan/history/${body.id}/image`, undefined, "other"))
      .status,
    404,
  );
  assert.equal(
    (await request(undefined, { ...payload(), productId: "other-product" }))
      .status,
    404,
  );
  assert.deepEqual(
    (await (await request(undefined, undefined, "other")).json()).entries,
    [],
  );
  assert.equal(
    (
      await request(
        undefined,
        payload(),
        "shopper",
        "POST",
        "https://foreign.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(`/api/scan/history/${body.id}`, {}, "other", "DELETE"))
      .status,
    200,
  );
  assert.equal((await (await request()).json()).entries.length, 1);
});

test("history accepts bounded JPEGs and rejects malformed or oversized uploads", async () => {
  for (const invalid of [
    "https://example.com/crop.jpg",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/jpeg;base64,aGVsbG8=",
    thumbnail.slice(0, -4),
    `data:image/jpeg;base64,${"A".repeat(40_000)}`,
  ]) {
    assert.equal(
      (await request(undefined, { ...payload(), thumbnail: invalid })).status,
      400,
    );
  }
  assert.equal(
    (await request(undefined, { ...payload(), id: "not-a-uuid" })).status,
    400,
  );
  assert.equal(
    (await request(undefined, { ...payload(), source: "external" })).status,
    400,
  );
  assert.equal(
    (await request(undefined, { ...payload(), thumbnail: "x".repeat(46_000) }))
      .status,
    413,
  );
  const bytes = await readFile("tests/fixtures/frame.jpg");
  const padded = Buffer.concat([
    bytes.subarray(0, -2),
    Buffer.alloc(28_000),
    bytes.subarray(-2),
  ]);
  const allowed = "data:image/jpeg;base64," + padded.toString("base64");
  assert.ok(allowed.length > 4096 && allowed.length < 40000);
  assert.equal(
    (await request(undefined, { ...payload(), thumbnail: allowed })).status,
    200,
  );
});

test("history merges repeated product sightings and keeps the original canonical id", async () => {
  const body = payload();
  const first = await (
    await request(undefined, { ...body, comparisonId: comparison.id })
  ).json();
  const repeated = await (
    await request(undefined, { ...payload(), thumbnail: undefined })
  ).json();
  assert.equal(repeated.entry.id, body.id);
  assert.equal(repeated.entry.createdAt, first.entry.createdAt);
  assert.equal(repeated.entry.comparison.id, comparison.id);
  assert.equal(repeated.entry.thumbnailUrl, first.entry.thumbnailUrl);
  assert.equal((await request(undefined, body)).status, 200);
  assert.equal((await (await request()).json()).entries.length, 1);
  assert.equal(
    (await request(undefined, { ...payload(), source: "sample" })).status,
    200,
  );
  assert.equal((await (await request()).json()).entries.length, 2);
});

test("model replacement on a stable history id clears obsolete results and keeps the crop", async () => {
  const body = payload();
  await request(undefined, { ...body, comparisonId: comparison.id });
  await seedProduct({
    ...product,
    id: "selected-product",
    model: "WH-1000XM6",
  });
  const changed = await request(undefined, {
    id: body.id,
    productId: "selected-product",
    source: "camera",
    mode: "buy",
  });
  assert.equal(changed.status, 200);
  const { entry } = await changed.json();
  assert.equal(entry.product.model, "WH-1000XM6");
  assert.equal(entry.comparison, undefined);
  assert.equal((await request(entry.thumbnailUrl)).status, 200);
  assert.equal((await (await request()).json()).entries.length, 1);
});

test("history rejects comparisons from another account or product snapshot", async () => {
  assert.equal(
    (
      await request(undefined, {
        ...payload(),
        comparisonId: "other-comparison",
      })
    ).status,
    404,
  );
  await seedComparison({
    ...comparison,
    id: "wrong-product",
    product: { ...product, id: "another-product" },
  });
  await seedComparison({
    ...comparison,
    id: "wrong-shelf",
    product: { ...product, shelfPriceMinor: 50000, shelfCurrency: "USD" },
  });
  for (const id of ["wrong-product", "wrong-shelf"]) {
    assert.equal(
      (await request(undefined, { ...payload(), comparisonId: id })).status,
      409,
    );
  }
  const updated = {
    ...product,
    box: { x: 0.4, y: 0.2, width: 0.3, height: 0.5 },
    confidence: 0.96,
  };
  await env.DB.prepare("UPDATE scan_products SET data=? WHERE id=?")
    .bind(JSON.stringify(updated), product.id)
    .run();
  const allowed = await request(undefined, {
    ...payload(),
    comparisonId: comparison.id,
  });
  assert.equal(
    allowed.status,
    200,
    "Movement does not change a product identity or shelf quote",
  );
});

test("history retains only the latest 100 account entries and prunes their images", async () => {
  const oldestId = crypto.randomUUID();
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: index ? crypto.randomUUID() : oldestId,
    productId: `old-${index}`,
    time: index + 1,
  }));
  await env.DB.batch(
    rows.map((row) =>
      env.DB.prepare(
        "INSERT INTO scan_history (user_id,id,product_id,product_data,thumbnail,source,mode,created_at,updated_at) VALUES (?,?,?,?,?,'camera','buy',?,?)",
      ).bind(
        "shopper",
        row.id,
        row.productId,
        JSON.stringify({ ...product, id: row.productId }),
        thumbnail,
        row.time,
        row.time,
      ),
    ),
  );
  const listed = await (await request()).json();
  assert.equal(listed.entries.length, 100);
  assert.equal(listed.entries[0].product.id, "old-100");
  const other = await request(
    undefined,
    { ...payload(), productId: "other-product" },
    "other",
  );
  assert.equal(other.status, 200);
  assert.equal((await request(undefined, payload())).status, 200);
  assert.equal(
    (
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM scan_history WHERE user_id='shopper'",
      ).first<{ count: number }>()
    )?.count,
    100,
  );
  assert.equal(
    (await request(`/api/scan/history/${oldestId}/image`)).status,
    404,
  );
  assert.equal(
    (await (await request(undefined, undefined, "other")).json()).entries
      .length,
    1,
  );
});

test("deleting history removes photos without deleting saved comparisons or another account", async () => {
  const body = payload();
  await request(undefined, { ...body, comparisonId: comparison.id });
  await request("/api/comparisons", { comparisonId: comparison.id });
  await request(
    undefined,
    { ...payload(), productId: "other-product" },
    "other",
  );
  assert.equal(
    (await request(`/api/scan/history/${body.id}`, {}, "shopper", "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await request(`/api/scan/history/${body.id}/image`)).status,
    404,
  );
  await request(undefined, payload());
  assert.equal((await request(undefined, {}, "shopper", "DELETE")).status, 200);
  assert.deepEqual((await (await request()).json()).entries, []);
  assert.equal(
    (await (await request("/api/comparisons")).json()).comparisons.length,
    1,
  );
  assert.equal(
    (await (await request(undefined, undefined, "other")).json()).entries
      .length,
    1,
  );
  await env.DB.prepare("DELETE FROM user WHERE id='other'").run();
  assert.equal(
    (
      await env.DB.prepare("SELECT COUNT(*) AS count FROM scan_history").first<{
        count: number;
      }>()
    )?.count,
    0,
  );
});
