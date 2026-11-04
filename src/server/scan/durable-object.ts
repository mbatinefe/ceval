import { DurableObject } from "cloudflare:workers";
import { runScanRequest } from "./processor.ts";

export class ScanProcessor extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get("X-Ceval-Account");
    // Only the authenticated gateway selects the account and object name.
    if (!userId || !this.ctx.id.equals(this.env.SCANS.idFromName(userId)))
      return Response.json({ error: "Account mismatch." }, { status: 403 });
    const task = runScanRequest(this.env, userId, request, this.ctx);
    this.ctx.waitUntil(
      task.then(
        () => undefined,
        () => undefined,
      ),
    );
    return task;
  }
}
