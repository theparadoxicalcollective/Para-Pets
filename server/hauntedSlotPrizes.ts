import { sql } from "drizzle-orm";
import type { HauntedSlotItemCategory, HauntedSlotPrizePreview } from "@shared/hauntedCasino";

export type SlotPrizeKind = "items" | "eggs";
const SETTING_KEYS = {
  items: "haunted_slots_item_prizes_v1",
  eggs: "haunted_slots_egg_prizes_v1",
} as const;

export interface CasinoPrizeItem {
  id: string;
  name: string;
  type: string;
  image_url: string | null;
  egg_image_url: string | null;
  price: number;
  rarity: number | null;
  star_rarity: number | null;
  fishing_type: string | null;
}

export class SlotPrizeValidationError extends Error {}

export function parseSlotPrizeIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 500 || value.some(id => typeof id !== "string" || !id.trim() || id.length > 100)) {
    throw new SlotPrizeValidationError("Choose up to 500 valid prizes.");
  }
  return [...new Set(value)];
}

async function readPrizeSelection(executor: any, kind: SlotPrizeKind): Promise<string[] | null> {
  const result = await executor.execute(sql`SELECT value FROM game_settings WHERE key = ${SETTING_KEYS[kind]} LIMIT 1`);
  if (!result.rows.length) return null;
  try {
    return parseSlotPrizeIds(JSON.parse(String(result.rows[0].value)));
  } catch {
    // A corrupt selection must never enable unselected catalog prizes.
    return [];
  }
}

async function readPrizeOptions(executor: any, selection?: { itemIds: string[] | null; eggIds: string[] }): Promise<CasinoPrizeItem[]> {
  const result = await executor.execute(sql`
    SELECT id, name, type, image_url, egg_image_url, price, rarity, star_rarity, fishing_type
    FROM shop_items
    WHERE ((type = 'pet' AND egg_image_url IS NOT NULL AND egg_image_url <> '')
      OR (type <> 'pet' AND pet_template_id IS NULL AND egg_image_url IS NULL AND hatch_time IS NULL
        AND image_url IS NOT NULL AND lower(name) NOT LIKE '%ticket%'
        AND NOT (type = 'fishing' AND COALESCE(fishing_type, '') <> 'fish')))
      ${selection ? sql`AND ((type = 'pet' AND id = ANY(${sql.param(selection.eggIds)}::text[]))
        OR (type <> 'pet' AND ${selection.itemIds === null ? sql`price > 0` : sql`id = ANY(${sql.param(selection.itemIds)}::text[])`}))` : sql``}
    ORDER BY name, id
  `);
  return result.rows as CasinoPrizeItem[];
}

export async function getSlotPrizeOptions(executor: any) {
  const [options, itemIds, eggIds] = await Promise.all([
    readPrizeOptions(executor), readPrizeSelection(executor, "items"), readPrizeSelection(executor, "eggs"),
  ]);
  const items = options.filter(item => item.type !== "pet");
  const eggs = options.filter(item => item.type === "pet");
  // Preserve the previous item pool until an admin explicitly saves a selection.
  const selectedItemIds = itemIds ?? items.filter(item => Number(item.price) > 0).map(item => item.id);
  return { items, eggs, selectedItemIds, selectedEggIds: eggIds ?? [] };
}

export async function getSlotPrizeCatalog(executor: any): Promise<Record<HauntedSlotItemCategory, CasinoPrizeItem[]>> {
  const [itemIds, eggIds] = await Promise.all([readPrizeSelection(executor, "items"), readPrizeSelection(executor, "eggs")]);
  const options = await readPrizeOptions(executor, { itemIds, eggIds: eggIds ?? [] });
  return {
    edible: options.filter(item => item.type === "edibles"),
    loot: options.filter(item => item.type !== "pet" && item.type !== "edibles"),
    egg: options.filter(item => item.type === "pet"),
  };
}

export function slotPrizePreviews(catalog: Record<HauntedSlotItemCategory, CasinoPrizeItem[]>): HauntedSlotPrizePreview[] {
  return (["edible", "loot", "egg"] as const).flatMap(category =>
    catalog[category].map(item => ({
      id: item.id,
      name: item.name,
      imageUrl: category === "egg" ? item.egg_image_url : item.image_url,
      category,
    })),
  );
}

export async function saveSlotPrizeSelection(executor: any, kind: SlotPrizeKind, value: unknown): Promise<void> {
  const ids = parseSlotPrizeIds(value);
  const options = await readPrizeOptions(executor);
  const allowed = new Set(options.filter(item => (kind === "eggs") === (item.type === "pet")).map(item => item.id));
  if (ids.some(id => !allowed.has(id))) throw new SlotPrizeValidationError("One or more prizes are no longer available. Reload the prize list.");
  await executor.execute(sql`
    INSERT INTO game_settings (key, value) VALUES (${SETTING_KEYS[kind]}, ${JSON.stringify(ids)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `);
}

export async function grantSlotEgg(tx: any, userId: string, item: CasinoPrizeItem): Promise<void> {
  if (item.type !== "pet" || !item.egg_image_url) throw new Error("Invalid slot egg prize");
  // Separate, unhatched inventory rows, matching the normal rewarded egg flow.
  await tx.execute(sql`
    INSERT INTO user_inventory (user_id, shop_item_id, quantity, is_hatched, hatch_started_at)
    VALUES (${userId}, ${item.id}, 1, false, NOW())
  `);
}
