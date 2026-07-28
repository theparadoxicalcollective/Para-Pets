import { sql } from "drizzle-orm";
import { clearingRarities, effectiveClearingRarity, type ClearingRarity } from "@shared/clearingConfig";

export async function getClearingConfig(db:any, worldId:string) {
  const [world,drops,enemies]=await Promise.all([
    db.execute(sql`SELECT id,name FROM worlds WHERE id=${worldId}`),
    db.execute(sql`SELECT d.id,d.world_id,d.shop_item_id,d.rarity,s.name,s.image_url,s.type,s.world_id AS item_world_id,s.star_rarity,s.clearing_slot,s.atk_boost,s.def_boost,s.health_boost FROM clearing_world_drops d JOIN shop_items s ON s.id=d.shop_item_id WHERE d.world_id=${worldId} ORDER BY s.name`),
    db.execute(sql`SELECT a.id,a.world_id,a.enemy_id,a.is_boss,a.sort_order,e.name,e.image_url FROM clearing_world_enemies a JOIN enemies e ON e.id=a.enemy_id WHERE a.world_id=${worldId} ORDER BY a.sort_order,e.name`),
  ]);
  return {world:world.rows[0]??null,drops:drops.rows.map((r:any)=>({...r,effective_rarity:effectiveClearingRarity(r.rarity,Number(r.star_rarity||0))})),enemies:enemies.rows,missingEnemies:enemies.rows.length===0,hasBossWithoutRare:enemies.rows.some((e:any)=>e.is_boss)&&!drops.rows.some((d:any)=>effectiveClearingRarity(d.rarity,Number(d.star_rarity||0))==="rare")};
}

export async function assertWorld(db:any,id:string){const r=await db.execute(sql`SELECT id FROM worlds WHERE id=${id}`);if(!r.rows.length)throw new Error("Unknown world");}
export function assertRarity(v:unknown):asserts v is ClearingRarity{if(!clearingRarities.includes(v as ClearingRarity))throw new Error("Invalid rarity");}

export async function assertRareInvariant(db:any,worldId:string,excludingDropId?:string,newRarity?:ClearingRarity){
  const boss=await db.execute(sql`SELECT 1 FROM clearing_world_enemies WHERE world_id=${worldId} AND is_boss=true LIMIT 1`);if(!boss.rows.length)return;
  const rare=await db.execute(sql`SELECT d.id FROM clearing_world_drops d JOIN shop_items s ON s.id=d.shop_item_id WHERE d.world_id=${worldId} AND d.id<>COALESCE(${excludingDropId??null},'') AND (s.star_rarity>=3 OR d.rarity='rare') LIMIT 1`);
  if(!rare.rows.length&&newRarity!=="rare")throw new Error("Boss Clearings require at least one effective Rare drop");
}
