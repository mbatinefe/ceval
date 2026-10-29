// Optional credentials are absent until the operator connects the provider.
export function metaKey(env: Env): string | undefined {
  const value: unknown = Reflect.get(env, "META_API_KEY");
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
