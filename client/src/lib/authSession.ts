import type { QueryClient } from "@tanstack/react-query";
import { queryClient } from "./queryClient";

/**
 * Queries below are authored/public game data and are safe to keep when the
 * authenticated player changes. Player-owned queries (inventory, friends,
 * quests, currencies, equipped items, etc.) are always discarded so one
 * account can never briefly see another account's cached state.
 */
function isSessionIndependentQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  if (typeof root !== "string") return false;
  return root === "/api/maintenance-status"
    || root === "/api/worlds"
    || root === "/api/world"
    || root === "/api/pet-template-parts";
}

/**
 * Replace the authenticated player without tearing down static game caches.
 * Cancelling first prevents in-flight requests from the previous account from
 * repopulating player-owned cache entries after the switch.
 */
export async function replaceAuthSession(user: unknown, client: QueryClient = queryClient): Promise<void> {
  await client.cancelQueries();
  client.removeQueries({
    predicate: query => {
      if (query.queryKey[0] === "/api/auth/me") return false;
      return !isSessionIndependentQuery(query.queryKey);
    },
  });
  client.setQueryData(["/api/auth/me"], user);
}
