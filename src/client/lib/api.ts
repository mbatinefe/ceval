export class ApiError extends Error {
  status: number;
  retryAfter: number;
  constructor(message: string, status: number, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const retryAfter = Number(response.headers.get("retry-after")) || 0;
    const message =
      response.status === 429
        ? "A few too many tries. Please wait before trying again."
        : response.status >= 500
          ? "We couldn’t complete that just now. Please try again shortly."
          : result?.error ||
            result?.message ||
            "We couldn’t complete that. Please try again.";
    throw new ApiError(message, response.status, retryAfter);
  }
  return result as T;
}
