import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHmac, createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import worker from "../../src/server/index.ts";

const origin = "https://ceval.example";
const secret = "scanning-test-only-secret-over-32-characters";
let mf: Miniflare;
let env: Env;
let calls: Record<string, unknown>[];
let provider: (body: Record<string, unknown>) => Promise<Response>;
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
) {
  return worker.fetch(
    new Request(origin + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        "CF-Connecting-IP": "192.0.2.12",
        ...(user ? { Cookie: cookie(user) } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
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
      return provider(body);
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
    "SELECT SUM(amount) AS n FROM scan_spend",
  ).first<{ n: number }>();
  assert.equal(spend?.n, 550);
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
test("recognition refreshes old cached results that predate visual suggestions", async () => {
  const legacyKey = createHash("sha256").update(`US:${frame}`).digest("hex");
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
  const data = await env.DB.prepare("SELECT data FROM scan_products WHERE id=?")
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
  env.SCAN_DAILY_BUDGET_MICROS = "50000";
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
    env.SCAN_DAILY_BUDGET_MICROS = "10000000";
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
