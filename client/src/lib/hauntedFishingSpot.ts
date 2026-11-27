import { HAUNTED_WOODS_WORLD_ID, HAUNTED_WOODS_FISHING_SPOTS } from "@shared/worlds/hauntedWoods";

type FishingSpot = { id: string; name: string; bgUrl: string | null };

/** Use the original authoritative pond record (and its stocked fish), not a
 * synthetic location or a legacy-map redirect. Fallback only to the other
 * canonical Haunted Woods pond when the first is missing or invalid. */
export async function readHauntedFishingSpot(signal: AbortSignal, request: typeof fetch = fetch): Promise<FishingSpot> {
  for (const { id } of HAUNTED_WOODS_FISHING_SPOTS) {
    const res = await request(`/api/location/${id}`, { credentials: "include", signal, cache: "no-cache" });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error("The fishing spot could not be loaded.");
    const spot = await res.json();
    if (spot?.id === id && spot.worldId === HAUNTED_WOODS_WORLD_ID &&
        spot.type === "fishing" && spot.isShop === false &&
        typeof spot.name === "string" && spot.name.trim()) {
      return { id, name: spot.name, bgUrl: typeof spot.bgUrl === "string" ? spot.bgUrl : null };
    }
  }
  throw new Error("No Haunted Woods fishing spot is available.");
}
