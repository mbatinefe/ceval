export function isLocalEnvironment(env: {
  APP_ENVIRONMENT?: unknown;
  BETTER_AUTH_URL?: unknown;
}): boolean {
  if (
    env.APP_ENVIRONMENT !== "local" ||
    typeof env.BETTER_AUTH_URL !== "string"
  )
    return false;
  try {
    const url = new URL(env.BETTER_AUTH_URL);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
