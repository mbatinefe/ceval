import { createAuth } from "./auth/config.ts";
export type Session = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>
>;
