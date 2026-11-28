import type { WorldSceneContent } from "@shared/worlds/worldSceneContent";
import type { WorldGroundTheme } from "@shared/worlds/worldGroundTheme";

export interface PlayerScene extends WorldSceneContent {
  groundLevel: number;
  groundTheme: WorldGroundTheme;
  linkedPages: Array<{ id: string; worldId: string; name: string; type: string; bgUrl: string | null }>;
  npcs: Array<{ id: string; name: string; imageUrl: string | null; specialSkill: string | null; legacyLocationId: string | null }>;
}

/** Prefetch and render share one cache key; the server still enforces world locks. */
export function playerWorldSceneQuery(worldId: string) {
  return {
    queryKey: ["/api/worlds", worldId, "player-scene"],
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<PlayerScene> => {
      const response = await fetch("/api/worlds/" + encodeURIComponent(worldId) + "/player-scene", {
        credentials: "include", cache: "no-cache", signal,
      });
      if (!response.ok) throw new Error(response.status === 403 ? "Coming Soon" : "Could not load this world.");
      return response.json();
    },
    staleTime: 10_000,
    retry: 1,
  };
}

/** Small overscan starts adjacent images before panning reveals them.
 * Keep legacy quest mounts separate from raster/effect visibility. */
export function playerWorldArtworkVisibility(
  x: number, y: number, width: number, height: number,
  viewport: { width: number; height: number },
) {
  const intersects = (margin: number) => x + width / 2 >= -margin && x - width / 2 <= viewport.width + margin &&
    y + height / 2 >= -margin && y - height / 2 <= viewport.height + margin;
  return { visible: intersects(0), nearby: intersects(120) };
}
