import shopSwamp from "@assets/shop_swamp.png";
import { ELYSIAN_BAYOU_WORLD_ID } from "@shared/worlds/elysianBayou";

export const ELYSIAN_BAYOU_PRESENTATION = {
  worldId: ELYSIAN_BAYOU_WORLD_ID,
  shopIcon: shopSwamp,
  accent: "#5cb87a",
  bgGradient:
    "linear-gradient(180deg, rgba(20,15,35,0.7) 0%, rgba(40,30,70,0.3) 50%, rgba(10,8,18,0.7) 100%)",
} as const;
