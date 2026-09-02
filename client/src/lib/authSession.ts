import type { QueryClient } from "@tanstack/react-query";
import { queryClient } from "./queryClient";

/** Retain the mounted auth query, but discard results/cache from the old session. */
export async function replaceAuthSession(user: unknown, client: QueryClient = queryClient): Promise<void> {
  await client.cancelQueries();
  client.removeQueries({ predicate: query => query.queryKey[0] !== "/api/auth/me" });
  client.setQueryData(["/api/auth/me"], user);
}
