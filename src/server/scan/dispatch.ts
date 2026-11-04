import { ScanError } from "./errors.ts";

export async function forwardScanRequest(
  env: Env,
  userId: string,
  request: Request,
  context: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
  if (!env.SCANS)
    throw new ScanError(
      "processor_unavailable",
      "Scanning is temporarily unavailable. Please try again.",
      503,
    );
  const headers = new Headers({ "X-Ceval-Account": userId });
  for (const name of ["Content-Type", "Origin"])
    if (request.headers.has(name))
      headers.set(name, request.headers.get(name)!);
  // Incoming signals are ignored for subrequests; a fresh signal forwards cancellation.
  const forwarded = new Request(request, {
    headers,
    signal: AbortSignal.any([request.signal]),
  });
  const task = env.SCANS.getByName(userId).fetch(forwarded);
  context.waitUntil(
    task.then(
      () => undefined,
      () => undefined,
    ),
  );
  try {
    return await task;
  } catch {
    throw new ScanError(
      "processor_unavailable",
      "Scanning is temporarily unavailable. Please try again.",
      503,
    );
  }
}
