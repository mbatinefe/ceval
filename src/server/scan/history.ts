import { Hono } from "hono";
import {
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_THUMBNAIL_CHARS,
  type ScanHistoryEntry,
  type ScanHistorySource,
} from "../../shared/history.ts";
import type { Comparison, Market, Mode, Product } from "../../shared/scan.ts";
import type { Session } from "../types.ts";
import { consumeLimit } from "../auth/limits.ts";
import { ScanError } from "./errors.ts";
import { modeOf, validateFrame } from "./validation.ts";

type HistoryRow = {
  id: string;
  product_data: string;
  comparison_data: string | null;
  has_thumbnail: number;
  source: ScanHistorySource;
  market: Market | null;
  mode: Mode;
  created_at: number;
  updated_at: number;
};
const columns =
  "id,product_data,comparison_data,thumbnail IS NOT NULL AS has_thumbnail,source,market,mode,created_at,updated_at";
const invalid = () =>
  new ScanError("invalid_history", "This find could not be remembered.", 400);
function identifier(value: unknown, uuid = false): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 80 ||
    (uuid &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value,
      ))
  )
    throw invalid();
  return value;
}
function thumbnailOf(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > MAX_HISTORY_THUMBNAIL_CHARS)
    throw invalid();
  try {
    return validateFrame(value);
  } catch {
    throw new ScanError(
      "invalid_thumbnail",
      "Use a small JPEG product photo.",
      400,
    );
  }
}
function snapshotKey(product: Product): string {
  // Movement and visual confidence may change without changing this product quote.
  return JSON.stringify([
    product.id,
    product.brand,
    product.model,
    product.variant,
    product.shelfPriceMinor,
    product.shelfCurrency,
    product.identification ?? null,
  ]);
}
function entryOf(row: HistoryRow): ScanHistoryEntry {
  return {
    id: row.id,
    product: JSON.parse(row.product_data) as Product,
    ...(row.comparison_data
      ? { comparison: JSON.parse(row.comparison_data) as Comparison }
      : {}),
    ...(row.has_thumbnail
      ? {
          thumbnailUrl: `/api/scan/history/${encodeURIComponent(row.id)}/image`,
        }
      : {}),
    source: row.source,
    mode: row.mode,
    ...(row.market ? { market: row.market } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const historyRoutes = new Hono<{
  Bindings: Env;
  Variables: { body: Record<string, unknown>; session: Session };
}>();
historyRoutes.get("/scan/history", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ${columns} FROM scan_history WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT ?`,
  )
    .bind(c.get("session").user.id, MAX_HISTORY_ENTRIES)
    .all<HistoryRow>();
  return c.json({ entries: rows.results.map(entryOf) });
});
historyRoutes.get("/scan/history/:id/image", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT thumbnail FROM scan_history WHERE user_id=? AND id=?",
  )
    .bind(c.get("session").user.id, c.req.param("id"))
    .first<{ thumbnail: string | null }>();
  if (!row?.thumbnail)
    throw new ScanError("not_found", "Photo not found.", 404);
  const bytes = Uint8Array.from(atob(row.thumbnail.slice(23)), (char) =>
    char.charCodeAt(0),
  );
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
historyRoutes.post("/scan/history", async (c) => {
  const body = c.get("body"),
    userId = c.get("session").user.id;
  const id = identifier(body.id, true),
    productId = identifier(body.productId);
  const source = body.source;
  const mode = modeOf(body.mode);
  if (source !== "camera" && source !== "video" && source !== "sample")
    throw invalid();
  const thumbnail = thumbnailOf(body.thumbnail);
  const comparisonId =
    body.comparisonId === undefined ? null : identifier(body.comparisonId);
  await consumeLimit(c.env.DB, `history:write:${userId}`, 120, 60);
  const productRow = await c.env.DB.prepare(
    "SELECT data,market FROM scan_products WHERE user_id=? AND id=?",
  )
    .bind(userId, productId)
    .first<{ data: string; market: Market | null }>();
  if (!productRow) throw new ScanError("not_found", "Product not found.", 404);
  const product: Product = JSON.parse(productRow.data);
  let comparisonData: string | null = null;
  let market = productRow.market;
  if (comparisonId) {
    const comparisonRow = await c.env.DB.prepare(
      "SELECT data FROM scan_comparisons WHERE user_id=? AND id=?",
    )
      .bind(userId, comparisonId)
      .first<{ data: string }>();
    if (!comparisonRow)
      throw new ScanError("not_found", "Comparison not found.", 404);
    const comparison: Comparison = JSON.parse(comparisonRow.data);
    if (
      snapshotKey(comparison.product) !== snapshotKey(product) ||
      comparison.mode !== mode
    )
      throw new ScanError(
        "history_conflict",
        "This comparison belongs to a different product snapshot or scan mode.",
        409,
      );
    comparisonData = comparisonRow.data;
    market = comparison.market;
  }
  const now = Date.now();
  const results = await c.env.DB.batch<HistoryRow>([
    // A model correction keeps its stable history id if its target was already seen.
    c.env.DB.prepare(
      "DELETE FROM scan_history WHERE user_id=? AND product_id=? AND source=? AND id!=? AND EXISTS (SELECT 1 FROM scan_history WHERE user_id=? AND id=?)",
    ).bind(userId, productId, source, id, userId, id),
    c.env.DB.prepare(
      `
      INSERT INTO scan_history (user_id,id,product_id,product_data,comparison_data,thumbnail,source,market,mode,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,id) DO UPDATE SET
        product_id=excluded.product_id,
        product_data=excluded.product_data,
        comparison_data=CASE
          WHEN excluded.comparison_data IS NOT NULL THEN excluded.comparison_data
          WHEN scan_history.product_id=excluded.product_id AND scan_history.source=excluded.source AND scan_history.mode=excluded.mode THEN scan_history.comparison_data
          ELSE NULL END,
        thumbnail=CASE WHEN scan_history.source=excluded.source THEN COALESCE(excluded.thumbnail,scan_history.thumbnail) ELSE excluded.thumbnail END,
        market=CASE WHEN excluded.comparison_data IS NOT NULL OR scan_history.product_id!=excluded.product_id OR scan_history.source!=excluded.source THEN excluded.market ELSE COALESCE(scan_history.market,excluded.market) END,
        source=excluded.source,
        mode=excluded.mode,
        updated_at=excluded.updated_at
      ON CONFLICT(user_id,product_id,source) DO UPDATE SET
        product_data=excluded.product_data,
        comparison_data=CASE WHEN excluded.comparison_data IS NOT NULL THEN excluded.comparison_data WHEN scan_history.mode=excluded.mode THEN scan_history.comparison_data ELSE NULL END,
        thumbnail=COALESCE(excluded.thumbnail,scan_history.thumbnail),
        market=CASE WHEN excluded.comparison_data IS NOT NULL THEN excluded.market ELSE COALESCE(scan_history.market,excluded.market) END,
        mode=excluded.mode,
        updated_at=excluded.updated_at
      RETURNING ${columns}
    `,
    ).bind(
      userId,
      id,
      productId,
      productRow.data,
      comparisonData,
      thumbnail,
      source,
      market,
      mode,
      now,
      now,
    ),
    c.env.DB.prepare(
      "DELETE FROM scan_history WHERE user_id=? AND id NOT IN (SELECT id FROM scan_history WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT ?)",
    ).bind(userId, userId, MAX_HISTORY_ENTRIES),
  ]);
  const row = results[1].results[0];
  if (!row)
    throw new ScanError(
      "storage_error",
      "Couldn’t remember this find. Please try again.",
      503,
    );
  return c.json({ entry: entryOf(row) });
});
historyRoutes.delete("/scan/history/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM scan_history WHERE user_id=? AND id=?")
    .bind(c.get("session").user.id, c.req.param("id"))
    .run();
  return c.json({ deleted: true });
});
historyRoutes.delete("/scan/history", async (c) => {
  await c.env.DB.prepare("DELETE FROM scan_history WHERE user_id=?")
    .bind(c.get("session").user.id)
    .run();
  return c.json({ deleted: true });
});
