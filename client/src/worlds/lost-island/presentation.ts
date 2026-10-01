import shopIsland from "@assets/shop_island.png";
import { WORLD_IDS } from "@shared/worlds/worldRegistry";

export const LOST_ISLAND_PRESENTATION = {
  worldId: WORLD_IDS.lostIsland,
  shopIcon: shopIsland,
  accent: "#20b2aa",
  bgGradient:
    "linear-gradient(180deg, rgba(5,30,30,0.7) 0%, rgba(10,60,60,0.3) 50%, rgba(5,15,15,0.7) 100%)",
} as const;
