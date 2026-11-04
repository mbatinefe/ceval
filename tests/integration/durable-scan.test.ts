import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  Miniflare,
  convertV4MiniflareOptions,
  kCurrentWorker,
} from "miniflare";

const origin = "https://ceval.example";
const secret = "durable-scan-test-secret-over-32-characters";
let mf: Miniflare;
let directory: string;
let frame: string;
let calls = 0;
let productId: string;
const product = {
  brand: "Sony",
  model: "WH-1000XM5",
  variant: "Black",
  confidence: 0.95,
  label: "Sony headphones",
  box: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 },
  shelfPriceMinor: 29999,
  shelfCurrency: "USD",
};
const cookie = (user: string) => {
  const token = `${user}-runtime-session`;
  return `__Secure-ceval.session_token=${encodeURIComponent(token + "." + createHmac("sha256", secret).update(token).digest("base64"))}`;
};
function request(
  path: string,
  body?: unknown,
  user: string | null = "shopper",
  requestOrigin = origin,
) {
  return mf.dispatchFetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: requestOrigin,
      "Content-Type": "application/json",
      ...(user ? { Cookie: cookie(user) } : {}),
    },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "ceval-durable-scan-"));
  const entry = join(directory, "entry.ts");
  await writeFile(
    entry,
    `import app from ${JSON.stringify(resolve("src/server/worker.ts"))};
import {DurableObject} from 'cloudflare:workers';
export { ScanProcessor } from ${JSON.stringify(resolve("src/server/worker.ts"))};
export class CancellationProbe extends DurableObject {
  async fetch(request) {
    if(new URL(request.url).pathname==='/state') return Response.json(await this.ctx.storage.get('state') || null);
    const task=(async()=>{ await new Promise(resolve=>setTimeout(resolve,500)); const state={aborted:request.signal.aborted,account:request.headers.get('X-Ceval-Account')}; await this.ctx.storage.put('state',state); return Response.json(state); })();
    this.ctx.waitUntil(task); return task;
  }
}
export default { async fetch(request, env, ctx) {
  const path=new URL(request.url).pathname;
  if(path==='/__test/mismatch') return env.SCANS.getByName('other').fetch(new Request(request,{headers:{'X-Ceval-Account':'shopper'}}));
  if(path==='/__test/cancel-state') return env.CANCEL_PROBE.getByName('shopper').fetch('https://probe.invalid/state');
  if(path==='/__test/gateway') return app.fetch(new Request(new URL('/api/scan/capabilities',request.url),request),{...env,SCANS:env.CANCEL_PROBE},ctx);
  if(path==='/__test/cancel') {
    const controller=new AbortController();
    const incoming=new Request(new URL('/__test/gateway',request.url),{headers:request.headers,signal:controller.signal});
    const timer=setTimeout(()=>controller.abort(),150);
    const task=env.SELF.fetch(incoming);ctx.waitUntil(task.catch(()=>{}));
    try { return await task; } catch { return new Response('canceled',{status:503}); } finally { clearTimeout(timer); }
  }
  return app.fetch(request,env,ctx);
} };`,
  );
  await writeFile(
    join(directory, "wrangler.json"),
    JSON.stringify({
      name: "ceval-durable-test",
      main: entry,
      compatibility_date: "2026-10-29",
      compatibility_flags: ["nodejs_compat", "enable_request_signal"],
      durable_objects: {
        bindings: [
          { name: "SCANS", class_name: "ScanProcessor" },
          { name: "CANCEL_PROBE", class_name: "CancellationProbe" },
        ],
      },
      migrations: [
        {
          tag: "v1",
          new_sqlite_classes: ["ScanProcessor", "CancellationProbe"],
        },
      ],
    }),
  );
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "deploy",
      "--dry-run",
      "--config",
      join(directory, "wrangler.json"),
      "--outdir",
      join(directory, "bundle"),
    ],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: join(directory, "build.log"),
        WRANGLER_SEND_METRICS: "false",
      },
    },
  );
  mf = new Miniflare(
    await convertV4MiniflareOptions({
      modules: true,
      script: await readFile(join(directory, "bundle/entry.js"), "utf8"),
      compatibilityDate: "2026-10-29",
      compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
      d1Databases: ["DB"],
      serviceBindings: { SELF: kCurrentWorker },
      durableObjects: {
        SCANS: { className: "ScanProcessor", useSQLite: true },
        CANCEL_PROBE: { className: "CancellationProbe", useSQLite: true },
      },
      bindings: {
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: secret,
        APP_ENVIRONMENT: "staging",
        META_API_KEY: "test-only-provider",
        SCAN_ENABLED: "true",
        SCAN_TOTAL_BUDGET_MICROS: "100000000",
      },
      outboundService: async (incoming) => {
        assert.equal(incoming.url, "https://api.meta.ai/v1/responses");
        calls++;
        const body = await incoming.json();
        const search = Boolean(body.tools);
        return Response.json({
          status: "completed",
          output: [
            ...(search
              ? [
                  {
                    type: "web_search_call",
                    status: "completed",
                    action: { type: "search", query: "Sony headphones" },
                    results: [],
                  },
                ]
              : []),
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(
                    search ? { offers: [] } : { products: [product] },
                  ),
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 100 },
        });
      },
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
        .filter((s) => s.trim())
        .map((s) => db.prepare(s)),
    );
  }
  for (const id of ["shopper", "other"]) {
    const now = Date.now();
    await db
      .prepare(
        "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)",
      )
      .bind(id, "Shopper", `${id}@example.com`, now, now)
      .run();
    await db
      .prepare(
        "INSERT INTO session (id,expiresAt,token,createdAt,updatedAt,userId) VALUES (?,?,?,?,?,?)",
      )
      .bind(id, now + 3600000, `${id}-runtime-session`, now, now, id)
      .run();
  }
  frame =
    "data:image/jpeg;base64," +
    (await readFile("tests/fixtures/frame.jpg")).toString("base64");
});
after(async () => {
  await mf?.dispose();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("real Durable Object forwarding preserves scan results, idempotency and usage settlement", async () => {
  const body = {
    frame,
    market: "US",
    requestId: crypto.randomUUID(),
    userId: "other",
  };
  const first = await request("/api/scan/recognize", body);
  assert.equal(first.status, 200, await first.clone().text());
  const found = await first.json();
  productId = found.products[0].id;
  const repeat = await request("/api/scan/recognize", body);
  assert.equal(repeat.status, 200);
  assert.deepEqual(await repeat.json(), found);
  assert.equal(calls, 1);
  const db = await mf.getD1Database("DB");
  const charge = await db
    .prepare("SELECT user_id,status,amount FROM scan_spend")
    .first();
  assert.deepEqual(charge, {
    user_id: "shopper",
    status: "estimated",
    amount: 550,
  });
});

test("real processor rejects malformed and oversized bodies without paid calls", async () => {
  const before = calls;
  for (const [body, status] of [
    ["{broken", 400],
    ["[]", 400],
    [JSON.stringify({ padding: "x".repeat(280001) }), 413],
  ] as const) {
    const result = await request("/api/scan/recognize", body);
    assert.equal(result.status, status, await result.clone().text());
  }
  assert.equal(calls, before);
});

test("real gateway and processor enforce sessions, origins and actor ownership", async () => {
  const before = calls;
  assert.equal((await request("/api/scan/recognize", {}, null)).status, 401);
  assert.equal(
    (
      await request(
        "/api/scan/recognize",
        {},
        "shopper",
        "https://foreign.example",
      )
    ).status,
    403,
  );
  assert.equal((await request("/__test/mismatch")).status, 403);
  assert.equal(
    (
      await request(
        "/api/scan/compare",
        { productId, market: "US", mode: "buy" },
        "other",
      )
    ).status,
    404,
  );
  assert.equal(calls, before);
});

test("buy and resale modes survive the real Durable Object boundary", async () => {
  for (const mode of ["buy", "resale"]) {
    const result = await request("/api/scan/compare", {
      productId,
      market: "US",
      mode,
    });
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal((await result.json()).mode, mode);
  }
});

test("gateway cancellation reaches the Durable Object while accepted background work finishes", async () => {
  const result = await request("/__test/cancel");
  assert.equal(result.status, 503);
  let observed: { aborted: boolean; account: string } | null = null;
  for (let attempt = 0; attempt < 30 && !observed; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    observed = await (await request("/__test/cancel-state")).json();
  }
  assert.deepEqual(observed, { aborted: true, account: "shopper" });
});
