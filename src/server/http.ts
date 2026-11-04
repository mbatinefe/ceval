import type { ErrorHandler } from "hono";
import { LimitReached } from "./auth/limits.ts";
import { ScanError } from "./scan/errors.ts";

export function isScanPath(path: string): boolean {
  return (
    path.startsWith("/api/scan/") ||
    path === "/api/comparisons" ||
    path.startsWith("/api/comparisons/")
  );
}

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const path = new URL(request.url).pathname;
  const maximum =
    path === "/api/scan/recognize"
      ? 820000
      : path === "/api/scan/visual-matches"
        ? 280000
        : path === "/api/scan/history"
          ? 45000
          : 4096;
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maximum) {
          await reader.cancel();
          throw new ScanError(
            "request_too_large",
            "Request is too large.",
            413,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(data) || "{}");
  } catch {
    throw new ScanError("invalid_json", "Invalid JSON.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new ScanError("invalid_request", "Invalid request.", 400);
  return body as Record<string, unknown>;
}

export const apiErrorHandler: ErrorHandler = (error, c) => {
  if (error instanceof ScanError) {
    if (error.status === 429 || error.status === 409)
      c.header("Retry-After", error.status === 409 ? "3" : "60");
    return c.json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof LimitReached) {
    c.header("Retry-After", String(error.retryAfter));
    return c.json({ error: error.message, retryAfter: error.retryAfter }, 429);
  }
  console.error("request_failed", c.req.method, c.req.path);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
};
