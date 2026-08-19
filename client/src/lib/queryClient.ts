import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
  // update. Begin Journey uses this to advance its Select Egg step from the
  // authoritative mutation success instead of waiting on a second cache/render hop.
  if (
    typeof window !== "undefined" &&
    method.toUpperCase() === "PATCH" &&
    url === "/api/user/active-pet" &&
    data &&
    typeof data === "object" &&
    "activePetId" in data
  ) {
    const activePetId = (data as { activePetId?: unknown }).activePetId;
    window.dispatchEvent(new CustomEvent(ACTIVE_PET_UPDATE_CONFIRMED_EVENT, {
      detail: { activePetId: typeof activePetId === "string" ? activePetId : null },
    }));
  }

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
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
