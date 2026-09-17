import { QueryClient, QueryFunction } from "@tanstack/react-query";

export async function fetchAuthenticatedUser(signal?: AbortSignal): Promise<any | null> {
  const response = await fetch("/api/auth/me", { credentials: "include", signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Authentication validation failed (${response.status})`);
  return response.json();
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export const ACTIVE_PET_UPDATE_CONFIRMED_EVENT = "para_active_pet_update_confirmed";

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);

  // Publish an acknowledgement only after the server has accepted the active-pet
  // update. Keep the auth cache in sync first so Begin Journey can safely move
  // to its next screen without outrunning PetInventory's mutation onSuccess.
  if (
    typeof window !== "undefined" &&
    method.toUpperCase() === "PATCH" &&
    url === "/api/user/active-pet" &&
    data &&
    typeof data === "object" &&
    "activePetId" in data
  ) {
    const requestedActivePetId = (data as { activePetId?: unknown }).activePetId;
    const activePetId = typeof requestedActivePetId === "string" ? requestedActivePetId : null;
    queryClient.setQueryData(["/api/auth/me"], (current: any) =>
      current ? { ...current, activePetId } : current
    );
    window.dispatchEvent(new CustomEvent(ACTIVE_PET_UPDATE_CONFIRMED_EVENT, {
      detail: { activePetId },
    }));
  }

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      signal,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Read the current session through React Query so startup helpers and global
 * bridges share one in-flight request instead of each calling /api/auth/me.
 */
export function fetchAuthenticatedUserCached(staleTime = 5_000): Promise<any | null> {
  return queryClient.fetchQuery({
    queryKey: ["/api/auth/me"],
    queryFn: ({ signal }) => fetchAuthenticatedUser(signal),
    staleTime,
  });
}

// Mutable player-owned state must not inherit the app-wide `staleTime: Infinity`
// policy. These query prefixes are shared by Home, Pet Inventory, The Closet,
// Market and upgrade flows, so a stale cache here can make one screen disagree
// with another even after the server mutation succeeded. Keep static authored
// content long-lived, but make ownership/auth state periodically re-validatable.
const MUTABLE_PLAYER_STATE_STALE_MS = 15_000;
const mutablePlayerQueryPrefixes = [
  ["/api/auth/me"],
  ["/api/inventory"],
  ["/api/user/equipped-accessory-ids"],
] as const;

for (const queryKey of mutablePlayerQueryPrefixes) {
  queryClient.setQueryDefaults(queryKey, {
    staleTime: MUTABLE_PLAYER_STATE_STALE_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/**
 * One shared invalidation boundary for mutations that change player ownership.
 * Feature code can call this instead of remembering several independent cache
 * keys. The refetch remains scoped to the three mutable player-state families.
 */
export async function invalidatePlayerOwnershipState(): Promise<void> {
  await Promise.all(
    mutablePlayerQueryPrefixes.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: [...queryKey] })
    )
  );
}
