import fs from "node:fs";
import path from "node:path";
import { storage } from "../storage";

type CanonicalWorldMap = {
  worldId: string;
  assetPath: string;
};

// These worlds intentionally use source-controlled canonical map art. They are
// refreshed after the legacy startup backfills so old hardcoded backgrounds
// cannot win again later in the same boot.
//
// ShadowfenMap.png is temporarily reused for worlds whose new 924×1703 artwork
// has not been uploaded yet. This keeps every world on the same fixed-screen
// presentation now; each placeholder entry can be swapped to its final asset
// later without another viewport/layout change.
const ALWAYS_REFRESH_WORLD_MAPS: CanonicalWorldMap[] = [
  { worldId: "haunted_woods", assetPath: "uploads/ShadowfenMap.png" },
  { worldId: "swamp", assetPath: "uploads/ElysianBayouMap.png" },
  { worldId: "snowy_mountain", assetPath: "uploads/ShadowfenMap.png" },
  { worldId: "sky_realm", assetPath: "uploads/ShadowfenMap.png" },
  { worldId: "enchanted_grove", assetPath: "uploads/ShadowfenMap.png" },
  { worldId: "island", assetPath: "uploads/ShadowfenMap.png" },
  { worldId: "desert", assetPath: "uploads/SandspireOasis.png" },
];

// Volcanic has historically allowed an admin-uploaded background to persist.
// Apply the new Embercraft Peak map once, then leave subsequent admin changes
// alone instead of clobbering them on every server restart.
const ONE_SHOT_WORLD_MAPS: Array<CanonicalWorldMap & { settingKey: string }> = [
  {
    worldId: "volcanic",
    assetPath: "uploads/EmbercraftPeakMap.png",
    settingKey: "volcanic_bg_embercraft_peak_2026_08",
  },
];

function versionedWorldAssetUrl(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), "attached_assets", relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Canonical world map asset is missing: ${relativePath}`);
  }
  const version = Math.floor(fs.statSync(absolutePath).mtimeMs / 1000);
  return `/world-assets/${relativePath}?v=${version}`;
}

async function applyWorldMap(worldId: string, assetPath: string): Promise<void> {
  const bgUrl = versionedWorldAssetUrl(assetPath);
  await storage.updateWorld(worldId, { bgUrl } as any);
  console.log(`Canonical ${worldId} world map set to ${assetPath}.`);
}

/**
 * Gives the new source-controlled maps the final word after legacy startup
 * reconciliation without changing world IDs, locations, hotspot placement,
 * location destinations, shops, rewards, or the main world-selection map.
 */
export async function reconcileCanonicalWorldMaps(): Promise<void> {
  for (const map of ALWAYS_REFRESH_WORLD_MAPS) {
    try {
      await applyWorldMap(map.worldId, map.assetPath);
    } catch (error) {
      console.error(`Failed to reconcile ${map.worldId} world map:`, error);
    }
  }

  for (const map of ONE_SHOT_WORLD_MAPS) {
    try {
      const alreadyApplied = await storage.getGameSetting(map.settingKey);
      if (alreadyApplied) continue;
      await applyWorldMap(map.worldId, map.assetPath);
      await storage.setGameSetting(map.settingKey, "done");
    } catch (error) {
      console.error(`Failed to reconcile one-shot ${map.worldId} world map:`, error);
    }
  }
}
