import shopHauntedWoods from "@assets/shop_haunted_woods.png";
import { WORLD_IDS } from "@shared/worlds/worldRegistry";

export const HAUNTED_WOODS_PRESENTATION = {
  worldId: WORLD_IDS.hauntedWoods,
  shopIcon: shopHauntedWoods,
  accent: "#8b008b",
  bgGradient:
    "linear-gradient(180deg, rgba(30,5,30,0.7) 0%, rgba(60,10,60,0.3) 50%, rgba(15,3,15,0.7) 100%)",
} as const;
