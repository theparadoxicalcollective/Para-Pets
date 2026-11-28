import { and, eq, inArray } from "drizzle-orm";
import { miniPetDefinitions, miniPetParts, shopItems } from "@shared/schema";
import { MINI_PET_PART_TYPES, sceneIdleAnimation, type SceneMiniPet, type MiniPetPartType } from "@shared/miniPet";
import type { db as database } from "./db";

/** Load only referenced catalog records, batched once per scene, never inventory. */
export async function loadSceneMiniPets(db: typeof database, ids: (string | null | undefined)[]): Promise<SceneMiniPet[]> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return [];
  const rows = await db.select({
    shopItemId: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl,
    animationStyle: miniPetDefinitions.animationStyle,
  }).from(miniPetDefinitions).innerJoin(shopItems, eq(shopItems.id, miniPetDefinitions.shopItemId))
    .where(and(inArray(shopItems.id, unique), eq(shopItems.type, "mini_pet")));
  if (!rows.length) return [];
  const parts = await db.select().from(miniPetParts).where(inArray(miniPetParts.shopItemId, rows.map(row => row.shopItemId)));
  const byPet = new Map<string, SceneMiniPet["parts"]>();
  for (const part of parts) {
    if (!MINI_PET_PART_TYPES.includes(part.partType as MiniPetPartType)) continue;
    const list = byPet.get(part.shopItemId) ?? [];
    list.push({ id: part.id, partType: part.partType as MiniPetPartType, imageUrl: part.imageUrl });
    byPet.set(part.shopItemId, list);
  }
  return rows.map(row => ({ ...row, animationStyle: sceneIdleAnimation(row.animationStyle), parts: byPet.get(row.shopItemId) ?? [] }))
    .filter(pet => !!pet.imageUrl || pet.parts.some(part => part.partType !== "closed_eyes"));
}
