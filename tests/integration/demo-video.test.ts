import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import worker from "../../src/server/index.ts";
import demoManifest from "../../public/demo/manifest.json" with { type: "json" };

const origin = "https://ceval.example";
const video = "/demo/walkthroughs/electronics-walkthrough.mp4";
let mf: Miniflare;

before(async () => {
  const source = stripTypeScriptTypes(
    await readFile("src/server/media/demo-video.ts", "utf8"),
  );
  mf = new Miniflare(
    await convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-10-29",
      script:
        source +
        `
        let stats;
        const assets = {
          async fetch(request) {
            const query = new URL(request.url).searchParams;
            const total = query.has("large") ? 32 * 1024 * 1024 : 16;
            stats = { pulls: 0, cancelled: false, method: request.method,
              range: request.headers.get("Range"), ifRange: request.headers.get("If-Range") };
            const headers = new Headers({
              "Content-Length": String(total), "Content-Type": "video/mp4",
              ETag: '"demo-v1"', "Last-Modified": "Wed, 28 Oct 2026 12:00:00 GMT",
              Date: "Fri, 30 Oct 2026 12:00:00 GMT",
            });
            if (query.has("weak")) headers.set("ETag", 'W/"demo-v1"');
            if (query.has("recent")) headers.set("Date", "Wed, 28 Oct 2026 12:00:10 GMT");
            if (query.has("unknown")) headers.delete("Content-Length");
            if (request.headers.get("If-None-Match") === '"demo-v1"')
              return new Response(null, {status: 304, headers});
            if (query.has("missing")) return new Response("Missing", {status: 404});
            if (request.method === "HEAD") return new Response(null, {headers});
            let offset = 0;
            const body = new ReadableStream({
              pull(controller) {
                stats.pulls++;
                if (offset >= (query.has("truncated") ? 4 : total)) {
                  controller.close(); return;
                }
                const length = Math.min(total - offset, query.has("large") ? 1024 : 4);
                const bytes = new Uint8Array(length);
                for (let i = 0; i < length; i++) bytes[i] = (offset + i) % 256;
                offset += length;
                controller.enqueue(bytes);
              },
              cancel() { stats.cancelled = true; }
            }, {highWaterMark: 0});
            return new Response(body, {headers});
          }
        };
        export default {
          async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === "/test-stats") return Response.json(stats);
            if (url.pathname === "/test-truncated") {
              const response = await serveDemoVideo(new Request(
                url.origin + "${video}?truncated", {headers: {Range: "bytes=0-10"}}
              ), assets);
              try {
                await response.arrayBuffer();
                return Response.json({status: response.status, failed: false});
              } catch {
                return Response.json({status: response.status, failed: true});
              }
            }
            if (url.pathname === "/test-cancel") {
              const response = await serveDemoVideo(new Request(
                url.origin + "${video}?large", {headers: {Range: "bytes=0-1000000"}}
              ), assets);
              const reader = response.body.getReader();
              await reader.read();
              await reader.cancel("Playback stopped");
              await scheduler.wait(0);
              return Response.json(stats);
            }
            return serveDemoVideo(request, assets);
          }
        }
      `,
    }),
  );
});

after(async () => mf?.dispose());

const request = (headers: HeadersInit = {}, query = "", method = "GET") =>
  mf.dispatchFetch(origin + video + query, { method, headers });

test("a Safari two-byte probe receives exactly two bytes with range headers", async () => {
  const response = await request({ Range: "bytes=0-1" });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 0-1/16");
  assert.equal(response.headers.get("Content-Length"), "2");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.equal(response.headers.get("Content-Type"), "video/mp4");
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array([0, 1]),
  );
});

test("closed, open-ended, suffix, and clipped ranges preserve the source bytes", async () => {
  for (const [range, contentRange, bytes] of [
    ["bytes=3-6", "bytes 3-6/16", [3, 4, 5, 6]],
    ["bytes=13-", "bytes 13-15/16", [13, 14, 15]],
    ["bytes=-3", "bytes 13-15/16", [13, 14, 15]],
    ["bytes=14-99999999999999999999", "bytes 14-15/16", [14, 15]],
    [
      "bytes=-99999999999999999999",
      "bytes 0-15/16",
      Array.from({ length: 16 }, (_, i) => i),
    ],
  ] as const) {
    const response = await request({ Range: range });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get("Content-Range"), contentRange);
    assert.equal(response.headers.get("Content-Length"), String(bytes.length));
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], bytes);
  }
});

test("unsatisfiable ranges return an empty 416 with the full representation size", async () => {
  for (const range of [
    "bytes=16-",
    "bytes=8-7",
    "bytes=-0",
    "bytes=99999999999999999999-",
  ]) {
    const response = await request({ Range: range });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get("Content-Range"), "bytes */16");
    assert.equal((await response.arrayBuffer()).byteLength, 0);
    const stats = await (await mf.dispatchFetch(origin + "/test-stats")).json();
    assert.equal(stats.cancelled, true);
    assert.equal(stats.pulls, 0);
  }
});

test("malformed, unknown-unit, and multipart ranges safely use a full response", async () => {
  for (const range of [
    "bytes=",
    "items=0-1",
    "bytes=a-b",
    "bytes=0-1,4-5",
    "bytes=1.5-2",
    "bytes=--1",
  ]) {
    const response = await request({ Range: range });
    assert.equal(response.status, 200, range);
    assert.equal(response.headers.get("Content-Range"), null);
    assert.deepEqual(
      [...new Uint8Array(await response.arrayBuffer())],
      Array.from({ length: 16 }, (_, i) => i),
    );
  }
});

test("HEAD ignores Range and returns full metadata without reading the video", async () => {
  const response = await request({ Range: "bytes=0-1" }, "", "HEAD");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Length"), "16");
  assert.equal(response.headers.get("Content-Range"), null);
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.equal((await response.arrayBuffer()).byteLength, 0);
  const stats = await (await mf.dispatchFetch(origin + "/test-stats")).json();
  assert.equal(stats.method, "HEAD");
  assert.equal(stats.range, null);
  assert.equal(stats.pulls, 0);
});

test("If-Range permits only the same strong ETag or an exact strong modification date", async () => {
  for (const [validator, query, status] of [
    ['"demo-v1"', "", 206],
    ['"old"', "", 200],
    ['W/"demo-v1"', "", 200],
    ['"demo-v1"', "?weak", 200],
    ["Wed, 28 Oct 2026 12:00:00 GMT", "", 206],
    ["Fri, 30 Oct 2026 12:00:00 GMT", "", 200],
    ["Wed, 28 Oct 2026 12:00:00 GMT", "?recent", 200],
    ["invalid", "", 200],
  ] as const) {
    const response = await request(
      { Range: "bytes=0-1", "If-Range": validator },
      query,
    );
    assert.equal(response.status, status, validator + query);
    assert.equal(
      (await response.arrayBuffer()).byteLength,
      status === 206 ? 2 : 16,
    );
  }
});

test("conditional not-modified responses and asset errors are not turned into ranges", async () => {
  const unchanged = await request({
    Range: "bytes=0-1",
    "If-None-Match": '"demo-v1"',
  });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("ETag"), '"demo-v1"');
  assert.equal(unchanged.headers.get("Content-Range"), null);
  assert.equal((await unchanged.arrayBuffer()).byteLength, 0);
  const missing = await request({ Range: "bytes=0-1" }, "?missing");
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "Missing");
});

test("unknown representation length safely falls back to streaming the full file", async () => {
  const response = await request({ Range: "bytes=0-1" }, "?unknown");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Range"), null);
  assert.equal(response.headers.get("Accept-Ranges"), "none");
  assert.equal((await response.arrayBuffer()).byteLength, 16);
});

test("a short range cancels the remaining asset without buffering the full file", async () => {
  const response = await request({ Range: "bytes=0-1" }, "?large");
  assert.equal(response.status, 206);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 1]);
  const stats = await (await mf.dispatchFetch(origin + "/test-stats")).json();
  assert.equal(stats.cancelled, true);
  assert.equal(stats.pulls, 1);
  assert.equal(stats.range, null);
  assert.equal(stats.ifRange, null);
});

test("consumer cancellation propagates to the source video stream", async () => {
  const stats = await (await mf.dispatchFetch(origin + "/test-cancel")).json();
  assert.equal(stats.cancelled, true);
  assert.ok(stats.pulls < 10, `read ${stats.pulls} chunks after cancellation`);
});

test("a truncated upstream body errors rather than silently returning a short range", async () => {
  const result = await (
    await mf.dispatchFetch(origin + "/test-truncated")
  ).json();
  assert.equal(result.status, 206);
  assert.equal(result.failed, true);
});

test("only the two public demo video paths bypass application authentication", async () => {
  const env = {
    APP_ENVIRONMENT: "staging",
    ASSETS: {
      fetch: async () =>
        new Response(new Uint8Array([0, 1]), {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": "2",
            ETag: '"fixture"',
          },
        }),
    },
  } as unknown as Env;
  for (const path of [video, "/demo/walkthroughs/secondhand-walkthrough.mp4"]) {
    const response = await worker.fetch(new Request(origin + path), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=3600");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(response.headers.get("ETag"), '"fixture"');
    await response.arrayBuffer();
  }
  const unexpected = await worker.fetch(
    new Request(origin + "/demo/private.mp4"),
    env,
  );
  assert.equal(unexpected.status, 404);
  assert.equal(unexpected.headers.get("Cache-Control"), "no-store");
  const privateApi = await worker.fetch(
    new Request(origin + "/api/finds"),
    env,
  );
  assert.equal(privateApi.status, 401);
  assert.equal(privateApi.headers.get("Cache-Control"), "no-store");
});

test("demo videos reject mutations instead of forwarding them to assets", async () => {
  const response = await request({}, "", "POST");
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, HEAD");
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test("both packaged walkthroughs serve exact seek bytes through the real assets binding", async () => {
  const mediaWorker = new Miniflare(
    await convertV4MiniflareOptions({
      name: "demo-video-assets-test",
      modules: true,
      compatibilityDate: "2026-10-29",
      script:
        stripTypeScriptTypes(
          await readFile("src/server/media/demo-video.ts", "utf8"),
        ) +
        `\nconst clips = ${JSON.stringify(demoManifest.clips)};
        export default { async fetch(request, env) {
          const clip = clips.find(item => item.video === new URL(request.url).pathname);
          return serveDemoVideo(request, env.ASSETS, clip?.byteLength);
        } };`,
      assets: {
        directory: "public",
        binding: "ASSETS",
        run_worker_first: true,
        routerConfig: { has_user_worker: true },
      },
    }),
  );
  try {
    for (const name of ["electronics", "secondhand"]) {
      const path = `/demo/walkthroughs/${name}-walkthrough.mp4`;
      const bytes = await readFile("public" + path);
      assert.equal(
        demoManifest.clips.find((clip) => clip.video === path)?.byteLength,
        bytes.length,
      );
      for (const [range, start, end] of [
        ["bytes=0-1", 0, 2],
        ["bytes=100000-100031", 100000, 100032],
        ["bytes=-32", bytes.length - 32, bytes.length],
      ] as const) {
        const response = await mediaWorker.dispatchFetch(origin + path, {
          headers: { Range: range },
        });
        const body = new Uint8Array(await response.arrayBuffer());
        assert.equal(
          response.status,
          206,
          name + range + ": " + JSON.stringify([...response.headers]),
        );
        assert.equal(
          response.headers.get("Content-Length"),
          String(end - start),
        );
        assert.equal(
          response.headers.get("Content-Range"),
          `bytes ${start}-${end - 1}/${bytes.length}`,
        );
        assert.deepEqual(body, new Uint8Array(bytes.subarray(start, end)));
      }
      const head = await mediaWorker.dispatchFetch(origin + path, {
        method: "HEAD",
      });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get("Content-Length"), String(bytes.length));
      assert.equal(head.headers.get("Accept-Ranges"), "bytes");
      assert.equal(head.headers.get("Content-Type"), "video/mp4");
    }
  } finally {
    await mediaWorker.dispose();
  }
});
