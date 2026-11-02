import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHmac, createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import worker from "../../src/server/index.ts";
import { reserveScan, settleScan } from "../../src/server/scan/budget.ts";

const origin = "https://ceval.example";
const secret = "scanning-test-only-secret-over-32-characters";
let mf: Miniflare;
let env: Env;
let calls: Record<string, unknown>[];
let backgroundWork: Promise<unknown>[];
let provider: (
  body: Record<string, unknown>,
  signal?: AbortSignal | null,
) => Promise<Response>;
const product = {
  brand: "Sony",
  model: "WH-1000XM5",
  variant: "Black",
  confidence: 0.95,
  label: "Sony WH-1000XM5 Black",
  box: { x: 0.1, y: 0.1, width: 0.3, height: 0.5 },
  shelfPriceMinor: 29999,
  shelfCurrency: "USD",
};
let frame: string;
const cookie = (id = "shopper") => {
  const token = `${id}-test-session`;
  return `__Secure-ceval.session_token=${encodeURIComponent(token + "." + createHmac("sha256", secret).update(token).digest("base64"))}`;
};
function response(data: unknown, output: unknown[] = []) {
  return Response.json({
    id: "resp_test",
    status: "completed",
    output: [
      ...output,
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: JSON.stringify(data), annotations: [] },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 100 },
  });
}
function request(
  path: string,
  body?: unknown,
  user: string | null = "shopper",
  method?: string,
  requestOrigin = origin,
  signal?: AbortSignal,
) {
  return worker.fetch(
    new Request(origin + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      signal,
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        "CF-Connecting-IP": "192.0.2.12",
        ...(user ? { Cookie: cookie(user) } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
    {
      waitUntil(promise) {
        backgroundWork.push(promise);
      },
      passThroughOnException() {},
      props: {},
    },
  );
}
const recognize = (requestId = crypto.randomUUID()) =>
  request("/api/scan/recognize", { frame, market: "US", requestId });
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
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`db/d1/migrations/${file}`, "utf8");
    await db.batch(
      sql
        .split(";")
        .filter((x) => x.trim())
        .map((x) => db.prepare(x)),
    );
  }
  frame =
    "data:image/jpeg;base64," +
    (await readFile("tests/fixtures/frame.jpg")).toString("base64");
  env = {
    DB: db,
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: secret,
    APP_ENVIRONMENT: "staging",
    META_API_KEY: "test-provider-key",
    SCAN_ENABLED: "true",
    SCAN_DAILY_BUDGET_MICROS: "10000000",
    SCAN_TOTAL_BUDGET_MICROS: "100000000",
    ASSETS: { fetch: async () => new Response("page") },
  } as unknown as Env;
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "https://api.meta.ai/v1/responses");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer test-provider-key",
      );
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return provider(body, init?.signal);
    },
  );
});
after(async () => {
  mock.restoreAll();
  await mf?.dispose();
});
beforeEach(async () => {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'",
  ).all<{ name: string }>();
  for (const name of [
    "scan_requests",
    "scan_saves",
    "scan_comparisons",
    "scan_products",
    "scan_jobs",
    "scan_spend",
    "session",
    "saved_finds",
    "account",
    "user",
    "app_limits",
  ]) {
    if (tables.results.some((x) => x.name === name))
      await env.DB.prepare(`DELETE FROM ${name}`).run();
  }
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
        `${id}-test-session`,
        Date.now(),
        Date.now(),
        id,
      )
      .run();
  }
  calls = [];
  backgroundWork = [];
  env.META_API_KEY = "test-provider-key";
  env.SCAN_ENABLED = "true";
  provider = async () => response({ products: [product] });
});
test("scan routes require a verified session and exact mutation origin", async () => {
  assert.equal(
    (
      await request(
        "/api/scan/recognize",
        { frame, market: "US", requestId: crypto.randomUUID() },
        null,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/api/scan/recognize",
        {},
        "shopper",
        "POST",
        "https://foreign.example",
      )
    ).status,
    403,
  );
  assert.equal(calls.length, 0);
});
test("missing credentials are explicit and never spend an allowance", async () => {
  env.META_API_KEY = "";
  const result = await recognize();
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, "provider_unavailable");
  assert.equal(calls.length, 0);
  const caps = await request("/api/scan/capabilities");
  assert.equal((await caps.json()).analysisAvailable, false);
});
test("invalid frame contents and invalid market never reach the provider", async () => {
  for (const body of [
    { frame: "data:image/jpeg;base64,SGVsbG8=", market: "US" },
    { frame, market: "ZZ" },
  ]) {
    assert.equal(
      (
        await request("/api/scan/recognize", {
          ...body,
          requestId: crypto.randomUUID(),
        })
      ).status,
      400,
    );
  }
  assert.equal(calls.length, 0);
});
test("recognition requests fractional coordinates and rejects a different scale", async () => {
  provider = async (body) => {
    const format = (body.text as { format: { schema: any } }).format;
    const coordinates =
      format.schema.properties.products.items.properties.box.properties;
    for (const name of ["x", "y", "width", "height"]) {
      assert.equal(coordinates[name].minimum, 0);
      assert.equal(coordinates[name].maximum, 1);
    }
    return response({
      products: [
        { ...product, box: { x: 51, y: 68, width: 894, height: 644 } },
      ],
    });
  };
  const result = await recognize();
  assert.equal(result.status, 502);
  assert.equal((await result.json()).code, "invalid_data");
  assert.equal(
    (
      await env.DB.prepare("SELECT COUNT(*) AS n FROM scan_products").first<{
        n: number;
      }>()
    )?.n,
    0,
  );
});
test("recognition stores owner-scoped products and reuses identical frames", async () => {
  const first = await recognize();
  assert.equal(first.status, 200, await first.clone().text());
  const data = await first.json();
  assert.equal(data.products[0].model, "WH-1000XM5");
  assert.ok(data.products[0].id);
  const again = await recognize();
  assert.equal(again.status, 200);
  assert.equal(calls.length, 1);
  const input = JSON.stringify(calls[0].input);
  assert.ok(input.includes("input_image"));
  assert.ok(input.includes(frame));
  assert.equal(calls[0].store, false);
  assert.equal(
    (
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM scan_products WHERE user_id='shopper'",
      ).first<{ n: number }>()
    )?.n,
    1,
  );
});
test("concurrent requests for the same frame cause at most one paid call", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  provider = async () => {
    await gate;
    return response({ products: [product] });
  };
  const first = recognize();
  for (let i = 0; i < 100 && !calls.length; i++)
    await new Promise((r) => setTimeout(r, 10));
  const second = await recognize();
  release();
  assert.equal((await first).status, 200);
  assert.equal(second.status, 409);
  assert.equal(calls.length, 1);
});
test("cross-owner product IDs cannot trigger price searches", async () => {
  const data = await (await recognize()).json();
  const result = await request(
    "/api/scan/compare",
    { productId: data.products[0].id, mode: "buy", market: "US" },
    "other",
  );
  assert.equal(result.status, 404);
  assert.equal(calls.length, 1);
});
for (const [field, value] of [
  ["brand", "SONY"],
  ["model", "wh-1000xm5"],
  ["variant", "black"],
  ["shelfPriceMinor", 24999],
  ["shelfPriceMinor", null],
  ["shelfCurrency", "GBP"],
] as const)
  test(`a later ${field}=${value} sighting cannot change an earlier queued comparison snapshot`, async () => {
    const first = await recognize();
    assert.equal(first.status, 200);
    const original = (await first.json()).products[0];
    provider = async () =>
      response({ products: [{ ...product, [field]: value }] });
    const bytes = Buffer.from(frame.slice(23), "base64");
    bytes[25] ^= 1;
    const later = await request("/api/scan/recognize", {
      frame: "data:image/jpeg;base64," + bytes.toString("base64"),
      market: "US",
      requestId: crypto.randomUUID(),
    });
    assert.equal(later.status, 200);
    const latest = (await later.json()).products[0];
    provider = async () => offerResponse();
    for (const expected of [original, latest]) {
      const compared = await request("/api/scan/compare", {
        productId: expected.id,
        mode: "buy",
        market: "US",
      });
      assert.equal(compared.status, 200);
      assert.deepEqual((await compared.json()).product, expected);
    }
    assert.notEqual(latest.id, original.id);
    assert.equal(latest[field], value);
    assert.equal(calls.length, 4);
  });
test("unchanged comparison fields reuse a product snapshot only within its owning account", async () => {
  const first = await recognize();
  assert.equal(first.status, 200);
  const original = (await first.json()).products[0];
  provider = async () =>
    response({
      products: [
        {
          ...product,
          label: "Sony wireless headphones",
          box: { ...product.box, x: 0.2 },
        },
      ],
    });
  const bytes = Buffer.from(frame.slice(23), "base64");
  bytes[25] ^= 1;
  const body = {
    frame: "data:image/jpeg;base64," + bytes.toString("base64"),
    market: "US",
    requestId: crypto.randomUUID(),
  };
  const again = await request("/api/scan/recognize", body);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).products[0].id, original.id);
  const other = await request("/api/scan/recognize", body, "other");
  assert.equal(other.status, 200);
  const otherProduct = (await other.json()).products[0];
  assert.notEqual(otherProduct.id, original.id);
  const forbidden = await request("/api/scan/compare", {
    productId: otherProduct.id,
    mode: "buy",
    market: "US",
  });
  assert.equal(forbidden.status, 404);
  assert.equal(calls.length, 3);
});
test("provider errors never expose upstream secrets and remain reserved", async () => {
  provider = async () =>
    new Response("test-provider-key internal diagnostics", { status: 401 });
  const result = await recognize();
  assert.equal(result.status, 502);
  assert.ok(!(await result.text()).includes("test-provider-key"));
  assert.equal(calls.length, 1);
  const spend = await env.DB.prepare(
    "SELECT SUM(amount) AS n FROM scan_spend WHERE scope='total'",
  ).first<{ n: number }>();
  assert.ok(spend!.n > 0);
});
test("a completed recognition settles its reservation against reported usage", async () => {
  assert.equal((await recognize()).status, 200);
  const spend = await env.DB.prepare(
    "SELECT s.amount,s.reserved_amount,s.status,s.settled_at,j.status AS job_status FROM scan_spend s JOIN scan_jobs j ON j.id=s.job_id",
  ).first<{
    amount: number;
    reserved_amount: number;
    status: string;
    settled_at: number;
    job_status: string;
  }>();
  assert.equal(spend?.amount, 550);
  assert.equal(spend?.reserved_amount, 50000);
  assert.equal(spend?.status, "estimated");
  assert.equal(spend?.job_status, "done");
  assert.ok(spend.settled_at > 0);
});
for (const outcome of ["success", "failure"] as const)
  test(`reservation cleanup failure preserves the provider ${outcome}`, async (t) => {
    const db = env.DB;
    env.DB = new Proxy(db, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => {
            if (
              sql.startsWith(
                "UPDATE scan_spend SET status='unresolved' WHERE id=",
              )
            )
              throw new Error("simulated cleanup failure");
            return db.prepare(sql);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    t.after(() => {
      env.DB = db;
    });
    const warning = t.mock.method(console, "warn", () => {});
    if (outcome === "failure")
      provider = async () =>
        new Response("private diagnostics", { status: 429 });
    const result = await recognize();
    assert.equal(result.status, outcome === "success" ? 200 : 503);
    if (outcome === "failure")
      assert.equal((await result.json()).code, "provider_rate_limited");
    const spend = await env.DB.prepare(
      "SELECT amount,status FROM scan_spend",
    ).first<{ amount: number; status: string }>();
    assert.equal(spend?.amount, outcome === "success" ? 550 : 50000);
    assert.equal(
      spend?.status,
      outcome === "success" ? "estimated" : "pending",
    );
    assert.equal(warning.mock.callCount(), 1);
    assert.deepEqual(warning.mock.calls[0].arguments, [
      "Scan reservation status update failed.",
    ]);
  });
for (const kind of ["recognize", "compare"] as const)
  test(`disconnecting after paid ${kind} begins keeps its usage settlement alive`, async () => {
    const productId = kind === "compare" ? await identified() : null;
    backgroundWork = [];
    const client = new AbortController();
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    provider = async (_body, signal) => {
      started();
      await gate;
      signal?.throwIfAborted();
      return kind === "recognize"
        ? response({ products: [product] })
        : response({ offers: [] }, [
            {
              type: "web_search_call",
              status: "completed",
              action: { type: "search", query: "Sony WH-1000XM5 price" },
              results: [],
            },
          ]);
    };
    const pending = request(
      `/api/scan/${kind}`,
      kind === "recognize"
        ? { frame, market: "US", requestId: crypto.randomUUID() }
        : { productId, mode: "buy", market: "US" },
      "shopper",
      undefined,
      origin,
      client.signal,
    );
    await ready;
    client.abort();
    release();
    assert.equal((await pending).status, 200);
    assert.ok(
      backgroundWork.length > 0,
      "the Worker retains the accepted scan until settlement finishes",
    );
    await Promise.all(backgroundWork);
    const spend = await env.DB.prepare(
      "SELECT amount FROM scan_spend WHERE kind=?",
    )
      .bind(kind)
      .first<{ amount: number }>();
    assert.equal(spend?.amount, kind === "recognize" ? 550 : 3050);
  });
test("an incomplete billed search settles usage without storing a partial answer", async () => {
  const productId = await identified();
  provider = async () =>
    Response.json({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      usage: { input_tokens: 100, output_tokens: 100 },
      output: [
        {
          type: "web_search_call",
          status: "completed",
          action: { type: "search", queries: ["Sony WH-1000XM5 price"] },
        },
      ],
    });
  const result = await request("/api/scan/compare", {
    productId,
    mode: "buy",
    market: "US",
  });
  assert.equal(result.status, 502);
  assert.equal((await result.json()).code, "analysis_incomplete");
  const spend = await env.DB.prepare(
    "SELECT amount FROM scan_spend WHERE kind='compare'",
  ).first<{ amount: number }>();
  assert.equal(spend?.amount, 3050);
  const comparisons = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scan_comparisons",
  ).first<{ n: number }>();
  assert.equal(comparisons?.n, 0);
});
test("a terminal HTTP failure with complete usage settles before returning a safe error", async () => {
  provider = async () =>
    Response.json(
      {
        status: "failed",
        error: { message: "test-provider-key private diagnostics" },
        usage: { input_tokens: 100, output_tokens: 100 },
        output: [],
      },
      { status: 502 },
    );
  const result = await recognize();
  assert.equal(result.status, 502);
  assert.ok(!(await result.text()).includes("test-provider-key"));
  const spend = await env.DB.prepare("SELECT amount FROM scan_spend").first<{
    amount: number;
  }>();
  assert.equal(spend?.amount, 550);
});
test("a failed search with unknown tool billing keeps the full reservation", async () => {
  const productId = await identified();
  provider = async () =>
    Response.json({
      status: "failed",
      usage: { input_tokens: 100, output_tokens: 100 },
      output: [{ type: "web_search_call", status: "failed" }],
    });
  const result = await request("/api/scan/compare", {
    productId,
    mode: "buy",
    market: "US",
  });
  assert.equal(result.status, 502);
  const spend = await env.DB.prepare(
    "SELECT s.amount,s.status,s.settled_at,j.status AS job_status FROM scan_spend s JOIN scan_jobs j ON j.id=s.job_id WHERE s.kind='compare'",
  ).first<{
    amount: number;
    status: string;
    settled_at: number | null;
    job_status: string;
  }>();
  assert.equal(spend?.amount, 2000000);
  assert.equal(spend?.status, "unresolved");
  assert.equal(spend?.settled_at, null);
  assert.equal(spend?.job_status, "error");
});
test("nonterminal usage cannot reduce a reservation before billing is final", async () => {
  provider = async () =>
    Response.json({
      status: "in_progress",
      usage: { input_tokens: 100, output_tokens: 100 },
      output: [],
    });
  assert.equal((await recognize()).status, 502);
  const spend = await env.DB.prepare("SELECT amount FROM scan_spend").first<{
    amount: number;
  }>();
  assert.equal(spend?.amount, 50000);
});
test("invalid generated JSON still settles valid terminal billing usage", async () => {
  provider = async () => {
    const result = await response({}).json();
    result.output[0].content[0].text = "{broken json";
    return Response.json(result);
  };
  assert.equal((await recognize()).status, 502);
  const spend = await env.DB.prepare("SELECT amount FROM scan_spend").first<{
    amount: number;
  }>();
  assert.equal(spend?.amount, 550);
});
test("provider throttling keeps its specific safe error during the retry cooldown", async () => {
  provider = async () =>
    new Response("test-provider-key internal diagnostics", { status: 429 });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await recognize();
    assert.equal(result.status, 503);
    const error = await result.json();
    assert.equal(error.code, "provider_rate_limited");
    assert.ok(!error.error.includes("test-provider-key"));
  }
  assert.equal(calls.length, 1);
});
test("a preflight budget denial does not cache a failed job or spend another reservation", async () => {
  env.SCAN_TOTAL_BUDGET_MICROS = "1";
  try {
    const blocked = await recognize();
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).code, "total_budget_exhausted");
    const jobs = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM scan_jobs",
    ).first<{ n: number }>();
    const spend = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM scan_spend",
    ).first<{ n: number }>();
    assert.equal(jobs?.n, 0);
    assert.equal(spend?.n, 0);
    env.SCAN_TOTAL_BUDGET_MICROS = "100000000";
    assert.equal((await recognize()).status, 200);
    assert.equal(calls.length, 1);
  } finally {
    env.SCAN_TOTAL_BUDGET_MICROS = "100000000";
  }
});
for (const [kind, formerLimit] of [
  ["recognize", 120],
  ["compare", 30],
] as const) {
  test(`daily ${kind} counts no longer block a funded account`, async () => {
    await env.DB.prepare(
      `WITH RECURSIVE counts(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM counts WHERE n<?)
      INSERT INTO scan_spend (id,user_id,kind,amount,created_at) SELECT 'earlier-'||n,'shopper',?,1,? FROM counts`,
    )
      .bind(formerLimit + 1, kind, Date.now())
      .run();
    const first = await reserveScan(env, "shopper", kind);
    await settleScan(env, first, 1);
    assert.ok((await reserveScan(env, "shopper", kind)).id);
    assert.ok((await reserveScan(env, "other", kind)).id);
  });
}
test("spending beyond the former daily ceiling remains available below the total budget", async () => {
  await env.DB.prepare(
    "INSERT INTO scan_spend (id,user_id,kind,amount,created_at) VALUES ('used','other','compare',15000000,?)",
  )
    .bind(Date.now())
    .run();
  assert.equal(
    (await reserveScan(env, "shopper", "compare")).reserved,
    2000000,
  );
});
test("an exhausted total budget cannot be bypassed by a new day", async () => {
  await env.DB.prepare(
    "INSERT INTO scan_spend (id,user_id,kind,amount,created_at) VALUES ('old','other','compare',100000000,?)",
  )
    .bind(Date.now() - 2 * 86400000)
    .run();
  await assert.rejects(reserveScan(env, "shopper", "recognize"), {
    code: "total_budget_exhausted",
  });
});
test("the 100-dollar total ceiling remains atomic and cannot be configured higher", async () => {
  await env.DB.prepare(
    "INSERT INTO scan_spend (id,user_id,kind,amount,created_at) VALUES ('used','other','compare',99950000,?)",
  )
    .bind(Date.now())
    .run();
  const results = await Promise.allSettled([
    reserveScan(env, "shopper", "recognize"),
    reserveScan(env, "other", "recognize"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected?.reason.code, "total_budget_exhausted");
  const spend = await env.DB.prepare(
    "SELECT SUM(amount) AS amount FROM scan_spend",
  ).first<{ amount: number }>();
  assert.equal(spend?.amount, 100000000);
  try {
    for (const value of ["100000001", "0", "invalid", "1.5"]) {
      env.SCAN_TOTAL_BUDGET_MICROS = value;
      await assert.rejects(reserveScan(env, "shopper", "recognize"), {
        code: "analysis_disabled",
      });
    }
  } finally {
    env.SCAN_TOTAL_BUDGET_MICROS = "100000000";
  }
});
test("a price reservation leaves room for a frame at the total ceiling", async () => {
  await env.DB.prepare(
    "INSERT INTO scan_spend (id,user_id,kind,amount,created_at) VALUES ('used','other','compare',97960000,?)",
  )
    .bind(Date.now())
    .run();
  await assert.rejects(reserveScan(env, "shopper", "compare"), {
    code: "total_budget_exhausted",
  });
  assert.equal(
    (await reserveScan(env, "shopper", "recognize")).reserved,
    50000,
  );
});
test("a lower configured total ceiling also preserves the next frame", async () => {
  env.SCAN_TOTAL_BUDGET_MICROS = "3000000";
  try {
    await env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,created_at) VALUES ('old','other','compare',960000,?)",
    )
      .bind(Date.now() - 2 * 86400000)
      .run();
    await assert.rejects(reserveScan(env, "shopper", "compare"), {
      code: "total_budget_exhausted",
    });
    assert.equal(
      (await reserveScan(env, "shopper", "recognize")).reserved,
      50000,
    );
  } finally {
    env.SCAN_TOTAL_BUDGET_MICROS = "100000000";
  }
});
test("concurrent price reservations atomically preserve a full recognition slot", async () => {
  await env.DB.prepare(
    "INSERT INTO scan_spend (id,user_id,kind,amount,created_at) VALUES ('used','other','compare',95960000,?)",
  )
    .bind(Date.now())
    .run();
  const prices = await Promise.allSettled([
    reserveScan(env, "shopper", "compare"),
    reserveScan(env, "other", "compare"),
  ]);
  assert.equal(
    prices.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    (await reserveScan(env, "shopper", "recognize")).reserved,
    50000,
  );
  const spent = await env.DB.prepare(
    "SELECT SUM(amount) AS amount FROM scan_spend",
  ).first<{ amount: number }>();
  assert.equal(
    spent?.amount,
    98010000,
    "the frame margin is not a provider charge",
  );
});
async function identified() {
  const r = await recognize();
  assert.equal(r.status, 200);
  return (await r.json()).products[0].id as string;
}
const candidate = {
  brand: "Sony",
  model: "WH-1000XM5",
  variant: "Black",
  reason: "Check the headband and ear-cup hinge shape.",
};
const candidateKey = JSON.stringify([
  candidate.brand,
  candidate.model,
  candidate.variant,
]);
async function uncertain() {
  provider = async () =>
    response({
      products: [
        {
          ...product,
          model: "",
          label: "Sony over-ear headphones",
          confidence: 0.55,
          candidates: [candidate, { ...candidate, model: "WH-1000XM4" }],
        },
      ],
    });
  return identified();
}
test("two uncertain objects in one frame keep independent model-choice snapshots", async () => {
  const unknown = {
    ...product,
    model: "",
    label: "Black over-ear headphones",
    confidence: 0.5,
  };
  provider = async () =>
    response({
      products: [
        {
          ...unknown,
          box: { x: 0, y: 0, width: 0.4, height: 0.5 },
          candidates: [candidate],
        },
        {
          ...unknown,
          box: { x: 0.5, y: 0, width: 0.4, height: 0.5 },
          candidates: [{ ...candidate, model: "WH-CH720N" }],
        },
      ],
    });
  const result = await recognize();
  const { products } = await result.json();
  assert.equal(products.length, 2);
  assert.notEqual(products[0].id, products[1].id);
  const selected = await request("/api/scan/select-model", {
    productId: products[0].id,
    candidateKey,
    market: "US",
  });
  assert.equal(selected.status, 200);
  assert.equal((await selected.json()).product.model, candidate.model);
});
test("a later uncertain sighting cannot overwrite an earlier model-choice snapshot", async () => {
  const firstId = await uncertain();
  provider = async () =>
    response({
      products: [
        {
          ...product,
          model: "",
          label: "Sony over-ear headphones",
          confidence: 0.55,
          candidates: [{ ...candidate, model: "WH-CH720N" }],
        },
      ],
    });
  const bytes = Buffer.from(frame.slice(23), "base64");
  bytes[25] ^= 1;
  const later = await request("/api/scan/recognize", {
    frame: "data:image/jpeg;base64," + bytes.toString("base64"),
    market: "US",
    requestId: crypto.randomUUID(),
  });
  assert.equal(later.status, 200);
  assert.notEqual((await later.json()).products[0].id, firstId);
  const selected = await request("/api/scan/select-model", {
    productId: firstId,
    candidateKey,
    market: "US",
  });
  assert.equal(selected.status, 200);
});
test("uncertain models require selection before price search and preserve its provenance", async () => {
  const productId = await uncertain();
  assert.equal(
    (
      await request("/api/scan/compare", {
        productId,
        mode: "buy",
        market: "US",
      })
    ).status,
    422,
  );
  const selection = await request("/api/scan/select-model", {
    productId,
    candidateKey,
    market: "US",
  });
  assert.equal(selection.status, 200, await selection.clone().text());
  const { product: selected } = await selection.json();
  assert.equal(selected.model, "WH-1000XM5");
  assert.equal(selected.identification, "user_selected");
  assert.equal(selected.confidence, 0.55);
  assert.notEqual(selected.id, productId);
  assert.equal(calls.length, 1, "choosing a model is not a paid provider call");
  const repeat = await request("/api/scan/select-model", {
    productId,
    candidateKey,
    market: "US",
  });
  assert.equal((await repeat.json()).product.id, selected.id);
  provider = async () => offerResponse();
  const comparison = await request("/api/scan/compare", {
    productId: selected.id,
    mode: "buy",
    market: "US",
  });
  assert.equal(comparison.status, 200);
  assert.equal(
    (await comparison.json()).product.identification,
    "user_selected",
  );
});
for (const prefix of ["", "visual-models-v2:"])
  test(`recognition refreshes cached ${prefix || "unversioned"} results that predate stable snapshots`, async () => {
    const legacyKey = createHash("sha256")
      .update(`${prefix}US:${frame}`)
      .digest("hex");
    await env.DB.prepare(
      "INSERT INTO scan_jobs (id,user_id,kind,request_key,status,result,expires_at,created_at) VALUES (?,?,? ,?,'done',?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        "shopper",
        "recognize",
        legacyKey,
        JSON.stringify({
          products: [{ ...product, id: "legacy", model: "", confidence: 0.5 }],
          analyzedAt: Date.now(),
        }),
        Date.now() + 180000,
        Date.now(),
      )
      .run();
    const productId = await uncertain();
    assert.notEqual(productId, "legacy");
    assert.equal(calls.length, 1);
    const data = await env.DB.prepare(
      "SELECT data FROM scan_products WHERE id=?",
    )
      .bind(productId)
      .first<{ data: string }>();
    assert.equal(JSON.parse(data!.data).candidates.length, 2);
  });
test("model selection rejects another owner's product and unstored candidate", async () => {
  const productId = await uncertain();
  assert.equal(
    (
      await request(
        "/api/scan/select-model",
        { productId, candidateKey, market: "US" },
        "other",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/api/scan/select-model", {
        productId,
        candidateKey: JSON.stringify(["Apple", "MacBook Pro", ""]),
        market: "US",
      })
    ).status,
    409,
  );
  await env.DB.prepare("UPDATE scan_products SET updated_at=? WHERE id=?")
    .bind(Date.now() - 86400001, productId)
    .run();
  assert.equal(
    (
      await request("/api/scan/select-model", {
        productId,
        candidateKey,
        market: "US",
      })
    ).status,
    422,
  );
  assert.equal(calls.length, 1);
});
test("different model choices cannot reuse each other's comparison", async () => {
  const productId = await uncertain();
  const selected = [];
  for (const model of ["WH-1000XM5", "WH-1000XM4"]) {
    const result = await request("/api/scan/select-model", {
      productId,
      candidateKey: JSON.stringify(["Sony", model, "Black"]),
      market: "US",
    });
    assert.equal(result.status, 200);
    selected.push((await result.json()).product);
  }
  assert.notEqual(selected[0].id, selected[1].id);
  provider = async () => offerResponse();
  const comparisons = [];
  for (const p of selected)
    comparisons.push(
      await (
        await request("/api/scan/compare", {
          productId: p.id,
          mode: "buy",
          market: "US",
        })
      ).json(),
    );
  assert.notEqual(comparisons[0].id, comparisons[1].id);
  assert.equal(comparisons[0].offers.length, 1);
  assert.equal(comparisons[1].offers.length, 0);
});
function offerResponse(
  snippet = "Sony WH-1000XM5 Black brand new USD $249.99",
  kind = "retail",
) {
  return response(
    {
      offers: [
        {
          url: "https://shop.example.com/headphones",
          priceMinor: 24999,
          currency: "USD",
          kind,
        },
      ],
    },
    [
      {
        type: "web_search_call",
        status: "completed",
        results: [
          {
            type: "text_result",
            title: "Sony WH-1000XM5 Black",
            url: "https://shop.example.com/headphones",
            snippet,
          },
        ],
      },
    ],
  );
}
for (const phase of [undefined, "final_answer"]) {
  test(`price search ignores progress messages before the final result (${phase ?? "unmarked"})`, async () => {
    const productId = await identified();
    provider = async () => {
      const result = await offerResponse().json();
      const progress = {
        type: "message",
        role: "assistant",
        phase: "commentary",
        content: [{ type: "output_text", text: "Searching current prices." }],
      };
      result.output.at(-1).phase = phase;
      result.output.splice(0, 0, progress);
      result.output.splice(2, 0, progress);
      return Response.json(result);
    };
    const result = await request("/api/scan/compare", {
      productId,
      mode: "buy",
      market: "US",
    });
    assert.equal(result.status, 200, await result.clone().text());
    const comparison = await result.json();
    assert.equal(comparison.offers.length, 1);
    assert.equal(comparison.offers[0].priceMinor, 24999);
    assert.equal(
      comparison.offers[0].url,
      "https://shop.example.com/headphones",
    );
  });
}
test("only sourced prices survive and saved comparisons are owner-scoped", async () => {
  const productId = await identified();
  provider = async () => offerResponse();
  const body = { productId, mode: "buy", market: "US" };
  const r = await request("/api/scan/compare", body);
  assert.equal(r.status, 200, await r.clone().text());
  const comparison = await r.json();
  assert.equal(comparison.offers.length, 1);
  assert.equal(comparison.offers[0].priceMinor, 24999);
  assert.equal(comparison.offers[0].match, "exact");
  assert.equal(comparison.sources, undefined);
  assert.equal(calls[1].max_tool_calls, 2);
  assert.equal((await request("/api/scan/compare", body)).status, 200);
  assert.equal(calls.length, 2);
  assert.equal(
    (
      await request(
        "/api/comparisons",
        { comparisonId: comparison.id },
        "other",
      )
    ).status,
    404,
  );
  assert.equal(
    (await request("/api/comparisons", { comparisonId: comparison.id })).status,
    200,
  );
  assert.equal(
    (await request("/api/comparisons", { comparisonId: comparison.id })).status,
    200,
  );
  assert.equal(
    (await (await request("/api/comparisons")).json()).comparisons.length,
    1,
  );
  assert.equal(
    (await (await request("/api/comparisons", undefined, "other")).json())
      .comparisons.length,
    0,
  );
  await request(`/api/comparisons/${comparison.id}`, {}, "other", "DELETE");
  assert.equal(
    (await (await request("/api/comparisons")).json()).comparisons.length,
    1,
  );
  await request(`/api/comparisons/${comparison.id}`, {}, "shopper", "DELETE");
  assert.equal(
    (await (await request("/api/comparisons")).json()).comparisons.length,
    0,
  );
});
test("an unsupported price or skipped web search cannot become a comparison offer", async () => {
  const productId = await identified();
  provider = async () => offerResponse("Sony WH-1000XM5 Black USD $329.99");
  const r = await request("/api/scan/compare", {
    productId,
    mode: "buy",
    market: "US",
  });
  assert.equal((await r.json()).offers.length, 0);
  provider = async () =>
    response({
      offers: [
        {
          url: "https://shop.example.com/headphones",
          priceMinor: 24999,
          currency: "USD",
          kind: "asking",
        },
      ],
    });
  const resale = await request("/api/scan/compare", {
    productId,
    mode: "resale",
    market: "US",
  });
  assert.equal((await resale.json()).offers.length, 0);
});
test("retailer links without source text cannot substantiate a generated price", async () => {
  const productId = await identified();
  provider = async () => offerResponse("");
  const result = await request("/api/scan/compare", {
    productId,
    mode: "buy",
    market: "US",
  });
  assert.equal(result.status, 200);
  const comparison = await result.json();
  assert.equal(comparison.status, "no_evidence");
  assert.deepEqual(comparison.offers, []);
});
test("unpriced native product links are persisted and old empty-price caches refresh", async () => {
  const productId = await identified();
  const legacyKey = createHash("sha256")
    .update(
      JSON.stringify([
        "public-offers-v2",
        productId,
        "buy",
        "US",
        product.shelfPriceMinor,
        product.shelfCurrency,
      ]),
    )
    .digest("hex");
  await env.DB.prepare(
    "INSERT INTO scan_jobs (id,user_id,kind,request_key,status,result,expires_at,created_at) VALUES (?,?,?,?,'done',?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      "shopper",
      "compare",
      legacyKey,
      JSON.stringify({ id: "legacy-empty", offers: [], status: "no_evidence" }),
      Date.now() + 900000,
      Date.now(),
    )
    .run();
  provider = async () => offerResponse("");
  const body = { productId, mode: "buy", market: "US" };
  const comparison = await (await request("/api/scan/compare", body)).json();
  const sources = [
    {
      title: "Sony WH-1000XM5 Black",
      url: "https://shop.example.com/headphones",
    },
  ];
  assert.notEqual(comparison.id, "legacy-empty");
  assert.equal(comparison.status, "no_evidence");
  assert.deepEqual(comparison.offers, []);
  assert.deepEqual(comparison.sources, sources);
  const stored = await env.DB.prepare(
    "SELECT data FROM scan_comparisons WHERE id=? AND user_id=?",
  )
    .bind(comparison.id, "shopper")
    .first<{ data: string }>();
  assert.deepEqual(JSON.parse(stored!.data).sources, sources);
  const cached = await (await request("/api/scan/compare", body)).json();
  assert.equal(cached.id, comparison.id);
  assert.deepEqual(cached.sources, sources);
  assert.equal(calls.length, 2);
});
test("Meta price records with native citations work without strict JSON output", async () => {
  const productId = await identified();
  provider = async () => {
    const result = await offerResponse("").json();
    const url = "https://shop.example.com/headphones";
    const text = JSON.stringify({
      url,
      priceMinor: 24999,
      currency: "USD",
      kind: "retail",
      supportingText: "Sony WH-1000XM5 Black costs USD $249.99.",
    });
    result.output.at(-1).content = [
      {
        type: "output_text",
        text,
        annotations: [
          { type: "url_citation", url, start_index: 0, end_index: text.length },
        ],
      },
    ];
    return Response.json(result);
  };
  const response = await request("/api/scan/compare", {
    productId,
    mode: "buy",
    market: "US",
  });
  assert.equal(response.status, 200, await response.clone().text());
  const comparison = await response.json();
  assert.equal(comparison.offers[0].priceMinor, 24999);
  assert.equal(comparison.offers[0].evidenceType, "cited_summary");
  assert.equal(calls[1].text, undefined);
});
test("per-line price records retain independent source-text validation when snippets are present", async () => {
  const productId = await identified();
  provider = async () => {
    const result = await offerResponse().json();
    const content = result.output.at(-1).content[0];
    content.text = JSON.stringify(JSON.parse(content.text).offers[0]);
    return Response.json(result);
  };
  const response = await request("/api/scan/compare", {
    productId,
    mode: "buy",
    market: "US",
  });
  const comparison = await response.json();
  assert.equal(response.status, 200);
  assert.equal(comparison.offers[0]?.priceMinor, 24999);
  assert.equal(comparison.offers[0]?.evidenceType, undefined);
});
test("separate output text blocks retain their independently sourced offers", async () => {
  const productId = await identified();
  provider = async () => {
    const result = await offerResponse().json();
    const original = JSON.parse(result.output.at(-1).content[0].text).offers[0];
    const second = { ...original, url: "https://shop.example.com/second" };
    result.output[0].results.push({
      ...result.output[0].results[0],
      url: second.url,
    });
    result.output.at(-1).content = [original, second].map((row) => ({
      type: "output_text",
      text: JSON.stringify(row),
      annotations: [],
    }));
    return Response.json(result);
  };
  const result = await request("/api/scan/compare", {
    productId,
    mode: "buy",
    market: "US",
  });
  assert.equal((await result.json()).offers.length, 2);
});
test("resale asking prices are not promoted to completed sales", async () => {
  const productId = await identified();
  provider = async () =>
    offerResponse("Sony WH-1000XM5 Black used asking USD $249.99", "sold");
  const r = await request("/api/scan/compare", {
    productId,
    mode: "resale",
    market: "US",
  });
  assert.equal((await r.json()).offers[0].kind, "asking");
});
test("conditional prices cannot be presented as full item offers", async () => {
  const productId = await identified();
  provider = async () =>
    offerResponse(
      "Sony WH-1000XM5 Black brand new USD $249.99 per month financing",
    );
  const r = await request("/api/scan/compare", {
    productId,
    mode: "buy",
    market: "US",
  });
  assert.equal((await r.json()).offers.length, 0);
});
test("a sold-out retail page is not a completed resale transaction", async () => {
  const productId = await identified();
  provider = async () =>
    offerResponse("Sony WH-1000XM5 Black sold out USD $249.99", "sold");
  const r = await request("/api/scan/compare", {
    productId,
    mode: "resale",
    market: "US",
  });
  assert.equal((await r.json()).offers.length, 0);
});
test("atomic reservations cap concurrent distinct paid requests", async () => {
  env.SCAN_TOTAL_BUDGET_MICROS = "50000";
  try {
    const results = await Promise.all([
      request("/api/scan/recognize", {
        frame,
        market: "US",
        requestId: crypto.randomUUID(),
      }),
      request("/api/scan/recognize", {
        frame,
        market: "GB",
        requestId: crypto.randomUUID(),
      }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 429]);
    assert.equal(calls.length, 1);
  } finally {
    env.SCAN_TOTAL_BUDGET_MICROS = "100000000";
  }
});
test("a reused request ID cannot charge for a different frame or market", async () => {
  const id = crypto.randomUUID();
  assert.equal((await recognize(id)).status, 200);
  const r = await request("/api/scan/recognize", {
    frame,
    market: "GB",
    requestId: id,
  });
  assert.equal(r.status, 409);
  assert.equal(calls.length, 1);
});

test("simultaneous frames identifying the same product return one usable ID", async () => {
  const bytes = Buffer.from(frame.slice(23), "base64");
  bytes[25] ^= 1;
  const alternate = "data:image/jpeg;base64," + bytes.toString("base64");
  const outputs = await Promise.all([
    recognize(),
    request("/api/scan/recognize", {
      frame: alternate,
      market: "US",
      requestId: crypto.randomUUID(),
    }),
  ]);
  const values = await Promise.all(outputs.map((r) => r.json()));
  assert.ok(values[0].products && values[1].products);
  assert.equal(values[0].products[0].id, values[1].products[0].id);
  provider = async () => offerResponse();
  for (const result of values)
    assert.equal(
      (
        await request("/api/scan/compare", {
          productId: result.products[0].id,
          mode: "buy",
          market: "US",
        })
      ).status,
      200,
    );
});

test("recognition compares only recent owned reference photos and does not inherit their identity", async () => {
  const initial = await (await recognize()).json();
  const previousId = initial.products[0].id;
  const saved = await request("/api/scan/history", {
    id: crypto.randomUUID(),
    productId: previousId,
    source: "camera",
    mode: "buy",
    thumbnail: frame,
  });
  assert.equal(saved.status, 200);
  provider = async () =>
    response({
      products: [
        { ...product, model: "", confidence: 0.4, previousReferenceIndex: 0 },
      ],
    });
  const run = (
    user = "shopper",
    ids = [previousId],
    requestId = crypto.randomUUID(),
  ) =>
    request(
      "/api/scan/recognize",
      { frame, market: "US", previousProductIds: ids, requestId },
      user,
    );
  const receipt = crypto.randomUUID();
  const found = await (await run("shopper", [previousId], receipt)).json();
  const input = (
    calls.at(-1)!.input as { content: { type: string; image_url?: string }[] }[]
  )[0].content;
  assert.equal(input.filter((p) => p.type === "input_image").length, 2);
  assert.equal(found.products[0].previousProductId, previousId);
  assert.equal(found.products[0].model, "");
  assert.equal(found.products[0].confidence, 0.4);
  assert.notEqual(found.products[0].id, previousId);
  assert.equal((await run("shopper", [], receipt)).status, 409);
  const foreign = await (await run("other")).json();
  assert.equal(foreign.products[0].previousProductId, undefined);
  const foreignInput = (
    calls.at(-1)!.input as { content: { type: string }[] }[]
  )[0].content;
  assert.equal(foreignInput.filter((p) => p.type === "input_image").length, 1);
});

test("recognition bounds reference inputs before contacting the provider", async () => {
  for (const previousProductIds of [
    ["not-an-id"],
    Array.from({ length: 4 }, () => crypto.randomUUID()),
    "invalid",
  ]) {
    assert.equal(
      (
        await request("/api/scan/recognize", {
          frame,
          market: "US",
          requestId: crypto.randomUUID(),
          previousProductIds,
        })
      ).status,
      400,
    );
  }
  assert.equal(calls.length, 0);
});
