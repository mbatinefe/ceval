import { runScanRequest } from "../../src/server/scan/processor.ts";

export function attachScanProcessor(env: Env) {
  Reflect.set(env, "SCANS", {
    getByName(owner: string) {
      return {
        fetch(request: Request) {
          const userId = request.headers.get("X-Ceval-Account")!;
          if (owner !== userId) throw new Error("Account mismatch");
          return runScanRequest(env, userId, request, { waitUntil() {} });
        },
      };
    },
  });
}
