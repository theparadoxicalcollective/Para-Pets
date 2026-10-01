import shopDesert from "@assets/shop_desert.png";
import { WORLD_IDS } from "@shared/worlds/worldRegistry";

export const SCORCHED_DESERT_PRESENTATION = {
  worldId: WORLD_IDS.scorchedDesert,
  shopIcon: shopDesert,
  accent: "#daa520",
  bgGradient:
    "linear-gradient(180deg, rgba(40,25,5,0.7) 0%, rgba(80,50,10,0.3) 50%, rgba(20,12,3,0.7) 100%)",
} as const;
