import { campaignImageSources } from "../shared/campaign-listings.ts";
import { productImageHosts } from "./providers/product-media.ts";
import { Hono } from "hono";
import { createAuth, sessionAuth } from "./auth/config.ts";
import { signupStatus, mayAuthenticateEmail } from "./auth/trial.ts";
import { consumeLimit, privateKey, reserveEmail } from "./auth/limits.ts";
import { demoProducts } from "../shared/demo.ts";

import type { Session } from "./types.ts";
import { forwardScanRequest } from "./scan/dispatch.ts";
import { apiErrorHandler, isScanPath, readJsonBody } from "./http.ts";
import { capabilities } from "./scan/service.ts";
import { isDemoVideo, serveDemoVideo } from "./media/demo-video.ts";
import demoManifest from "../../public/demo/manifest.json" with { type: "json" };
type FindRow = {
  id: string;
  productId: string;
  mode: "buy" | "resale";
  createdAt: number;
};
const app = new Hono<{
  Bindings: Env;
  Variables: { body: Record<string, unknown>; session: Session };
}>();
const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${[...productImageHosts].map((host) => `https://${host}`).join(" ")} ${campaignImageSources.join(" ")}; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Content-Security-Policy", csp);
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=()",
  );
  if (c.env.APP_ENVIRONMENT === "staging")
    c.header("X-Robots-Tag", "noindex, nofollow");
  // Only the two public synthetic videos may be cached; account pages stay private.
  if (!isDemoVideo(c.req.path) || ![200, 206, 304].includes(c.res.status))
    c.header(
      "Cache-Control",
      c.req.path.startsWith("/api/scan/history")
        ? "private, no-store"
        : "no-store",
    );
});

for (const clip of demoManifest.clips)
  if (isDemoVideo(clip.video))
    app.all(clip.video, (c) =>
      serveDemoVideo(c.req.raw, c.env.ASSETS, clip.byteLength),
    );

app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD"].includes(c.req.method)) {
    if (c.req.header("Origin") !== c.env.BETTER_AUTH_URL)
      return c.json({ error: "Request origin not allowed." }, 403);
    if (
      !c.req
        .header("Content-Type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      return c.json({ error: "Use a JSON request." }, 415);
    // Scan bodies are bounded and parsed inside the Durable Object.
    if (!isScanPath(c.req.path)) {
      const body = await readJsonBody(c.req.raw);
      c.set("body", body);
      const headers = new Headers(c.req.raw.headers);
      headers.delete("Content-Length");
      c.req.raw = new Request(c.req.url, {
        method: c.req.method,
        headers,
        body: JSON.stringify(body),
        signal: c.req.raw.signal,
      });
    }
  }
  await next();
});

app.get("/api/auth/status", async (c) => c.json(await signupStatus(c.env)));

app.all("/api/auth/*", async (c) => {
  const path = c.req.path.slice("/api/auth".length);
  const allowed =
    (c.req.method === "GET" && path === "/get-session") ||
    (c.req.method === "POST" &&
      [
        "/email-otp/send-verification-otp",
        "/sign-in/email-otp",
        "/sign-out",
      ].includes(path));
  if (!allowed) return c.json({ error: "Not found." }, 404);
  if (
    path === "/email-otp/send-verification-otp" ||
    path === "/sign-in/email-otp"
  ) {
    const body = c.get("body");
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return c.json({ error: "Enter a valid email address." }, 400);
    const ip = c.req.header("CF-Connecting-IP") || "unknown";
    if (path === "/email-otp/send-verification-otp") {
      if (body.type !== "sign-in")
        return c.json({ error: "Invalid code request." }, 400);
      await reserveEmail(c.env, email, ip);
      if (!(await mayAuthenticateEmail(c.env, email)))
        return c.json({ success: true });
    } else {
      if (typeof body.otp !== "string" || !/^\d{6}$/.test(body.otp))
        return c.json({ error: "Enter the six-digit code." }, 400);
      await consumeLimit(
        c.env.DB,
        `verify:${await privateKey(c.env.BETTER_AUTH_SECRET, ip)}`,
        30,
        900,
      );
      if (!(await mayAuthenticateEmail(c.env, email)))
        return c.json(
          { error: "Sign-in could not be completed. Please try again later." },
          400,
        );
    }
    c.req.raw = new Request(c.req.url, {
      method: "POST",
      headers: c.req.raw.headers,
      body: JSON.stringify({
        email,
        ...(path.includes("send-verification")
          ? { type: "sign-in" }
          : { otp: body.otp }),
      }),
    });
  }
  let deliveryFailed = false;
  const response = await createAuth(c.env, () => {
    deliveryFailed = true;
  }).handler(c.req.raw);
  if (deliveryFailed || response.status >= 500)
    return c.json(
      { error: "Sign-in is temporarily unavailable. Please try again later." },
      503,
    );
  return response;
});

app.use("/api/*", async (c, next) => {
  if (!c.req.header("Cookie")) return c.json({ error: "Please sign in." }, 401);
  const result = await sessionAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
  for (const cookie of result.headers.getSetCookie())
    c.header("Set-Cookie", cookie, { append: true });
  const session = result.response;
  if (!session?.user.emailVerified)
    return c.json({ error: "Please sign in." }, 401);
  c.set("session", session);
  await next();
});

app.get("/api/me", (c) => {
  const { user } = c.get("session");
  return c.json({
    user: { id: user.id, email: user.email, name: user.name },
    capabilities: {
      liveScanning: capabilities(c.env).analysisAvailable,
      demo: true,
    },
  });
});
app.get("/api/finds", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, product_id AS productId, mode, created_at AS createdAt FROM saved_finds WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
  )
    .bind(c.get("session").user.id)
    .all<FindRow>();
  return c.json({
    finds: rows.results.map((row) => ({
      ...row,
      product: demoProducts.find((product) => product.id === row.productId),
    })),
  });
});
app.post("/api/finds", async (c) => {
  const { productId, mode } = c.get("body");
  if (
    !demoProducts.some((product) => product.id === productId) ||
    (mode !== "buy" && mode !== "resale")
  )
    return c.json({ error: "Choose a demo product and mode." }, 400);
  await c.env.DB.prepare(
    "INSERT INTO saved_finds (id, user_id, product_id, mode, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, product_id, mode) DO NOTHING",
  )
    .bind(
      crypto.randomUUID(),
      c.get("session").user.id,
      productId,
      mode,
      Date.now(),
    )
    .run();
  return c.json({ saved: true });
});
app.delete("/api/finds/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM saved_finds WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("session").user.id)
    .run();
  return c.json({ deleted: true });
});
app.delete("/api/finds", async (c) => {
  await c.env.DB.prepare("DELETE FROM saved_finds WHERE user_id = ?")
    .bind(c.get("session").user.id)
    .run();
  return c.json({ deleted: true });
});
app.use("/api/*", async (c, next) => {
  if (!isScanPath(c.req.path)) return next();
  return forwardScanRequest(
    c.env,
    c.get("session").user.id,
    c.req.raw,
    c.executionCtx,
  );
});
app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));
app.get("*", async (c) => {
  if (
    !["/", "/signin", "/app", "/app/finds", "/app/account"].includes(c.req.path)
  )
    return c.notFound();
  if (c.req.path.startsWith("/app")) {
    if (!c.req.header("Cookie")) return c.redirect("/signin");
    const result = await sessionAuth(c.env).api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    for (const cookie of result.headers.getSetCookie())
      c.header("Set-Cookie", cookie, { append: true });
    const session = result.response;
    if (!session?.user.emailVerified) return c.redirect("/signin");
  }
  const response = await c.env.ASSETS.fetch(
    new Request(new URL("/index.html", c.req.url)),
  );
  return c.newResponse(response.body, response);
});
app.onError(apiErrorHandler);
export default app;
