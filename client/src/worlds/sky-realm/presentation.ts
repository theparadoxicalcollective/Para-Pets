import shopSkyRealm from "@assets/shop_sky_realm.png";
import { WORLD_IDS } from "@shared/worlds/worldRegistry";

export const SKY_REALM_PRESENTATION = {
  worldId: WORLD_IDS.skyRealm,
  shopIcon: shopSkyRealm,
  accent: "#ffd700",
  bgGradient:
    "linear-gradient(180deg, rgba(40,30,10,0.7) 0%, rgba(80,60,20,0.3) 50%, rgba(20,15,5,0.7) 100%)",
} as const;
