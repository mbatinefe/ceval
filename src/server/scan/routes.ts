import { discoverVisualMatches } from "./visual-search.ts";
import { Hono } from "hono";
import {
  capabilities,
  recognize,
  compare,
  digest,
  selectModel,
} from "./service.ts";
import { marketOf, modeOf, validateFrame, text } from "./validation.ts";
import type { Comparison } from "../../shared/scan.ts";
import { ScanError } from "./errors.ts";
import { consumeLimit } from "../auth/limits.ts";
import { historyRoutes } from "./history.ts";
import { expiredTrialError, trialAccess } from "../auth/trial.ts";
export const scanRoutes = new Hono<{
  Bindings: Env;
  Variables: { body: Record<string, unknown>; userId: string };
}>();
scanRoutes.route("/", historyRoutes);
scanRoutes.get("/scan/capabilities", async (c) => {
  const access = await trialAccess(c.env, c.get("userId"));
  const expired = access.trial && access.trialAccess.remainingSeconds === 0;
  return c.json({
    ...capabilities(c.env),
    ...access,
    ...(expired
      ? {
          analysisAvailable: false,
          visualSearchAvailable: false,
          reason: expiredTrialError().message,
        }
      : {}),
  });
});
scanRoutes.post("/scan/visual-matches", async (c) => {
  const body = c.get("body"),
    userId = c.get("userId");
  await consumeLimit(c.env.DB, `visual:request:${userId}`, 30, 60);
  const task = discoverVisualMatches(
    c.env,
    userId,
    text(body.productId, 80),
    marketOf(body.market),
    body.image,
    c.req.raw.signal,
    modeOf(body.mode ?? "buy"),
  );
  c.executionCtx.waitUntil(
    task.then(
      () => undefined,
      () => undefined,
    ),
  );
  return c.json(await task);
});
scanRoutes.post("/scan/recognize", async (c) => {
  const body = c.get("body"),
    userId = c.get("userId");
  await consumeLimit(c.env.DB, `scan:request:${userId}`, 30, 60);
  const market = marketOf(body.market);
  let frame: string | string[];
  if (body.frames !== undefined) {
    if (
      body.frame !== undefined ||
      !Array.isArray(body.frames) ||
      body.frames.length < 1 ||
      body.frames.length > 3
    )
      throw new ScanError(
        "invalid_request",
        "Use one to three captured frames.",
        400,
      );
    frame = body.frames.map(validateFrame);
  } else {
    frame = validateFrame(body.frame);
  }
  if (
    typeof body.requestId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(body.requestId)
  )
    throw new ScanError("invalid_request", "Invalid scan request.", 400);
  if (
    body.previousProductIds !== undefined &&
    (!Array.isArray(body.previousProductIds) ||
      body.previousProductIds.length > 3 ||
      body.previousProductIds.some(
        (id) => typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id),
      ))
  )
    throw new ScanError(
      "invalid_request",
      "Invalid recent product references.",
      400,
    );
  const previousProductIds = [
    ...new Set((body.previousProductIds || []) as string[]),
  ];
  const fingerprint = await digest(
    JSON.stringify([market, frame, previousProductIds]),
  );
  await c.env.DB.prepare("DELETE FROM scan_requests WHERE created_at < ?")
    .bind(Date.now() - 86400000)
    .run();
  await c.env.DB.prepare(
    "INSERT INTO scan_requests (user_id,request_id,fingerprint,created_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING",
  )
    .bind(userId, body.requestId, fingerprint, Date.now())
    .run();
  const receipt = await c.env.DB.prepare(
    "SELECT fingerprint FROM scan_requests WHERE user_id=? AND request_id=?",
  )
    .bind(userId, body.requestId)
    .first<{ fingerprint: string }>();
  if (receipt?.fingerprint !== fingerprint)
    throw new ScanError(
      "request_conflict",
      "This request was already used for a different frame.",
      409,
    );
  const task = recognize(
    c.env,
    userId,
    frame,
    market,
    c.req.raw.signal,
    previousProductIds,
  );
  c.executionCtx.waitUntil(
    task.then(
      () => undefined,
      () => undefined,
    ),
  );
  return c.json(await task);
});
scanRoutes.post("/scan/select-model", async (c) => {
  const body = c.get("body"),
    userId = c.get("userId");
  await consumeLimit(c.env.DB, `selection:request:${userId}`, 30, 60);
  return c.json(
    await selectModel(
      c.env,
      userId,
      text(body.productId, 80),
      text(body.candidateKey, 1000),
      marketOf(body.market),
    ),
  );
});
scanRoutes.post("/scan/compare", async (c) => {
  const body = c.get("body"),
    userId = c.get("userId");
  await consumeLimit(c.env.DB, `compare:request:${userId}`, 30, 60);
  const task = compare(
    c.env,
    userId,
    text(body.productId, 80),
    modeOf(body.mode),
    marketOf(body.market),
    c.req.raw.signal,
  );
  c.executionCtx.waitUntil(
    task.then(
      () => undefined,
      () => undefined,
    ),
  );
  return c.json(await task);
});
scanRoutes.get("/comparisons", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT c.data FROM scan_comparisons c JOIN scan_saves s ON s.comparison_id=c.id AND s.user_id=c.user_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 100",
  )
    .bind(c.get("userId"))
    .all<{ data: string }>();
  return c.json({
    comparisons: rows.results.map((row) => ({
      ...(JSON.parse(row.data) as Comparison),
      saved: true,
    })),
  });
});
scanRoutes.post("/comparisons", async (c) => {
  const userId = c.get("userId"),
    id = text(c.get("body").comparisonId, 80);
  const existing = await c.env.DB.prepare(
    "SELECT id FROM scan_comparisons WHERE id=? AND user_id=?",
  )
    .bind(id, userId)
    .first();
  if (!existing) throw new ScanError("not_found", "Comparison not found.", 404);
  const saved = await c.env.DB.prepare(
    "INSERT INTO scan_saves (user_id,comparison_id,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM scan_saves WHERE user_id=?)<100 ON CONFLICT DO NOTHING RETURNING comparison_id",
  )
    .bind(userId, id, Date.now(), userId)
    .first();
  if (!saved) {
    const previous = await c.env.DB.prepare(
      "SELECT comparison_id FROM scan_saves WHERE user_id=? AND comparison_id=?",
    )
      .bind(userId, id)
      .first();
    if (!previous)
      throw new ScanError(
        "saved_limit",
        "Remove a saved find before adding another.",
        429,
      );
  }
  return c.json({ saved: true });
});
scanRoutes.delete("/comparisons/:id", async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM scan_saves WHERE user_id=? AND comparison_id=?",
  )
    .bind(c.get("userId"), c.req.param("id"))
    .run();
  return c.json({ deleted: true });
});
scanRoutes.delete("/comparisons", async (c) => {
  await c.env.DB.prepare("DELETE FROM scan_saves WHERE user_id=?")
    .bind(c.get("userId"))
    .run();
  return c.json({ deleted: true });
});
