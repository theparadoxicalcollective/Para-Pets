import { parseClearingEnemyType } from "@shared/clearingEnemyTypes";
import { addClearingEnemy, changeClearingEnemyType, removeClearingEnemy } from "../clearingEnemyAssignments";
import type {Express,RequestHandler} from "express";import {sql} from "drizzle-orm";import {assertRareInvariant,assertRarity,assertWorld,getClearingConfig} from "../clearingConfig";import {effectiveClearingRarity} from "@shared/clearingConfig";
import{clearingShopItemCreateSchema,clearingShopItemPatchSchema,clearingShopPatchSchema}from"@shared/clearingShop";import{getClearingShop}from"../clearingShop";
const bad=(res:any,e:unknown)=>res.status(400).json({message:e instanceof Error?e.message:"Invalid Clearing configuration"});
export function registerClearingAdminRoutes(app:Express,{db,isAdmin}:{db:any;isAdmin:RequestHandler}){
 app.get("/api/admin/clearing/worlds/:worldId/shop",isAdmin,async(req,res)=>{try{await assertWorld(db,req.params.worldId as string);res.json(await getClearingShop(db,req.params.worldId as string,true))}catch(e){bad(res,e)}});
 app.patch("/api/admin/clearing/worlds/:worldId/shop",isAdmin,async(req,res)=>{try{const worldId=req.params.worldId as string,v=clearingShopPatchSchema.parse(req.body);await assertWorld(db,worldId);await db.execute(sql`INSERT INTO clearing_world_shops(world_id) VALUES(${worldId}) ON CONFLICT(world_id) DO NOTHING`);await db.execute(sql`UPDATE clearing_world_shops SET enabled=COALESCE(${v.enabled??null},enabled),portal_x=COALESCE(${v.portalX??null},portal_x),portal_y=COALESCE(${v.portalY??null},portal_y),portal_width=COALESCE(${v.portalWidth??null},portal_width),interaction_radius_pixels=COALESCE(${v.interactionRadiusPixels??null},interaction_radius_pixels),updated_at=now() WHERE world_id=${worldId}`);res.json(await getClearingShop(db,worldId,true))}catch(e){bad(res,e)}});
 app.post("/api/admin/clearing/worlds/:worldId/shop/items",isAdmin,async(req,res)=>{try{const worldId=req.params.worldId as string,v=clearingShopItemCreateSchema.parse(req.body);await assertWorld(db,worldId);const item=await db.execute(sql`SELECT id FROM shop_items WHERE id=${v.shopItemId}`);if(!item.rows.length)throw new Error("Unknown catalog item");await db.execute(sql`INSERT INTO clearing_world_shop_items(world_id,shop_item_id,essence_price,active,sort_order) VALUES(${worldId},${v.shopItemId},${v.essencePrice},${v.active??true},${v.sortOrder??0})`);res.json(await getClearingShop(db,worldId,true))}catch(e:any){if(e?.code==='23505')return res.status(409).json({message:'Item is already assigned'});bad(res,e)}});
 app.patch("/api/admin/clearing/shop/items/:assignmentId",isAdmin,async(req,res)=>{try{const v=clearingShopItemPatchSchema.parse(req.body),id=req.params.assignmentId as string;const f=await db.execute(sql`UPDATE clearing_world_shop_items SET essence_price=COALESCE(${v.essencePrice??null},essence_price),active=COALESCE(${v.active??null},active),sort_order=COALESCE(${v.sortOrder??null},sort_order) WHERE id=${id} RETURNING world_id`);if(!f.rows.length)return res.status(404).json({message:'Unknown assignment'});res.json(await getClearingShop(db,(f.rows[0]as any).world_id,true))}catch(e){bad(res,e)}});
 app.delete("/api/admin/clearing/shop/items/:assignmentId",isAdmin,async(req,res)=>{const f=await db.execute(sql`DELETE FROM clearing_world_shop_items WHERE id=${req.params.assignmentId as string} RETURNING world_id`);if(!f.rows.length)return res.status(404).json({message:'Unknown assignment'});res.json(await getClearingShop(db,(f.rows[0]as any).world_id,true))});
 app.get("/api/admin/clearing/worlds",isAdmin,async(_q,res)=>res.json((await db.execute(sql`SELECT id,name FROM worlds ORDER BY name`)).rows));
 app.get("/api/admin/clearing/worlds/:worldId",isAdmin,async(req,res)=>{try{await assertWorld(db,(req.params.worldId as string));res.json(await getClearingConfig(db,(req.params.worldId as string)));}catch(e){bad(res,e)}});
 app.post("/api/admin/clearing/worlds/:worldId/drops",isAdmin,async(req,res)=>{try{assertRarity(req.body?.rarity);await assertWorld(db,(req.params.worldId as string));const item=await db.execute(sql`SELECT id,star_rarity FROM shop_items WHERE id=${req.body?.shopItemId}`);if(!item.rows.length)throw new Error("Unknown item");const rarity=effectiveClearingRarity(req.body.rarity,Number((item.rows[0] as any).star_rarity||0));await db.execute(sql`INSERT INTO clearing_world_drops(world_id,shop_item_id,rarity) VALUES(${(req.params.worldId as string)},${req.body.shopItemId},${rarity}) ON CONFLICT(world_id,shop_item_id) DO NOTHING`);res.json(await getClearingConfig(db,(req.params.worldId as string)));}catch(e){bad(res,e)}});
 app.patch("/api/admin/clearing/drops/:id",isAdmin,async(req,res)=>{try{assertRarity(req.body?.rarity);const f=await db.execute(sql`SELECT d.world_id,s.star_rarity FROM clearing_world_drops d JOIN shop_items s ON s.id=d.shop_item_id WHERE d.id=${(req.params.id as string)}`);if(!f.rows.length)throw new Error("Unknown drop");const row=f.rows[0] as any,rarity=effectiveClearingRarity(req.body.rarity,Number(row.star_rarity||0));await assertRareInvariant(db,row.world_id,(req.params.id as string),rarity);await db.execute(sql`UPDATE clearing_world_drops SET rarity=${rarity} WHERE id=${(req.params.id as string)}`);res.json(await getClearingConfig(db,row.world_id));}catch(e){bad(res,e)}});
 app.delete("/api/admin/clearing/drops/:id",isAdmin,async(req,res)=>{try{const f=await db.execute(sql`SELECT world_id FROM clearing_world_drops WHERE id=${(req.params.id as string)}`);if(!f.rows.length)throw new Error("Unknown drop");const world=(f.rows[0] as any).world_id;await assertRareInvariant(db,world,(req.params.id as string));await db.execute(sql`DELETE FROM clearing_world_drops WHERE id=${(req.params.id as string)}`);res.json(await getClearingConfig(db,world));}catch(e){bad(res,e)}});
 app.post("/api/admin/clearing/worlds/:worldId/enemies",isAdmin,async(req,res)=>{
   try {
     const type=parseClearingEnemyType(req.body??{}),worldId=req.params.worldId as string;
     if(typeof req.body?.enemyId!=="string"||!req.body.enemyId)throw new Error("Choose an enemy");
     await addClearingEnemy(db,worldId,req.body.enemyId,type);
     res.json(await getClearingConfig(db,worldId));
   } catch(e){bad(res,e)}
 });
 app.patch("/api/admin/clearing/enemies/:id",isAdmin,async(req,res)=>{
   try {
     const type=parseClearingEnemyType(req.body??{});
     const worldId=await changeClearingEnemyType(db,req.params.id as string,type);
     res.json(await getClearingConfig(db,worldId));
   } catch(e){bad(res,e)}
 });
 app.delete("/api/admin/clearing/enemies/:id",isAdmin,async(req,res)=>{
   try {
     const worldId=await removeClearingEnemy(db,req.params.id as string);
     if(!worldId)return res.status(404).json({message:"Unknown assignment"});
     res.json(await getClearingConfig(db,worldId));
   } catch(e){bad(res,e)}
 });
 app.post("/api/admin/clearing/worlds/:worldId/special-mobs",isAdmin,async(req,res)=>{try{const worldId=req.params.worldId as string;await assertWorld(db,worldId);const pet=await db.execute(sql`SELECT id FROM shop_items WHERE id=${req.body?.petShopItemId} AND type='pet'`);if(!pet.rows.length)throw new Error("Choose a valid pet");await db.execute(sql`INSERT INTO clearing_world_special_mobs(world_id,pet_shop_item_id) VALUES(${worldId},${req.body.petShopItemId}) ON CONFLICT(world_id,pet_shop_item_id) DO NOTHING`);res.json(await getClearingConfig(db,worldId));}catch(e){bad(res,e)}});
 app.delete("/api/admin/clearing/special-mobs/:id",isAdmin,async(req,res)=>{const f=await db.execute(sql`DELETE FROM clearing_world_special_mobs WHERE id=${req.params.id as string} RETURNING world_id`);if(!f.rows.length)return res.status(404).json({message:"Unknown special mob"});res.json(await getClearingConfig(db,(f.rows[0] as any).world_id));});
}
