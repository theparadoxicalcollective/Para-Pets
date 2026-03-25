import { queryClient } from "./queryClient";

const CHANNEL_NAME = "para_pets_sync";
const SYNC_KEYS = [
  "/api/auth/me",
  "/api/inventory",
  "/api/fishing/inventory",
  "/api/rewards/pending",
  "/api/pet-house",
];

let channel: BroadcastChannel | null = null;
let receiving = false;

export function initTabSync() {
  if (typeof BroadcastChannel === "undefined") return;
  if (channel) return;

  channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<{ queryKeys: string[] }>) => {
    if (!event.data?.queryKeys) return;
    receiving = true;
    for (const key of event.data.queryKeys) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
    receiving = false;
  };

  queryClient.getQueryCache().subscribe((cacheEvent) => {
    if (receiving) return;
    if (cacheEvent.type !== "updated") return;
    const action = (cacheEvent as any).action;
    if (action?.type !== "invalidate") return;

    const queryKey = cacheEvent.query.queryKey;
    const keyStr = Array.isArray(queryKey) ? queryKey[0] : queryKey;
    if (typeof keyStr === "string" && SYNC_KEYS.some(k => keyStr.startsWith(k))) {
      channel?.postMessage({ queryKeys: [keyStr] });
    }
  });
}

export function teardownTabSync() {
  channel?.close();
  channel = null;
}
