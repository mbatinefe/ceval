import { Hono } from "hono";
import { apiErrorHandler, isScanPath, readJsonBody } from "../http.ts";
import { scanRoutes } from "./routes.ts";

type ProcessorEnvironment = Env & { scanUserId: string };
const processor = new Hono<{
  Bindings: ProcessorEnvironment;
  Variables: { body: Record<string, unknown>; userId: string };
}>();
processor.use("*", async (c, next) => {
  c.set("userId", c.env.scanUserId);
  if (!["GET", "HEAD"].includes(c.req.method))
    c.set("body", await readJsonBody(c.req.raw));
  await next();
});
processor.route("/api", scanRoutes);
processor.notFound((c) => c.json({ error: "Not found." }, 404));
processor.onError(apiErrorHandler);

export async function runScanRequest(
  env: Env,
  userId: string,
  request: Request,
  context: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
  if (!userId || userId.length > 128)
    return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!isScanPath(new URL(request.url).pathname))
    return Response.json({ error: "Not found." }, { status: 404 });
  return processor.fetch(
    request,
    { ...env, scanUserId: userId },
    {
      waitUntil: (promise) => context.waitUntil(promise),
      passThroughOnException() {},
      props: {},
    },
  );
}
