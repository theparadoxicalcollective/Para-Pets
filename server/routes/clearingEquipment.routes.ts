import type { Express, RequestHandler } from "express";
import { z } from "zod";
import type { ClearingEquipmentSlot } from "@shared/clearingEquipment";
import { ClearingEquipmentError, equipClearingItem, getClearingInventory, getClearingLoadout, sellClearingEquipment, unequipClearingItem } from "../clearingEquipment";
import { calculateClearingStats } from "../clearingEquipment";
import { ClearingDropError, collectClearingDrop, getActiveClearingDrops } from "../clearingLoot";
import { ELYSIAN_CLEARING_COMBAT, getClearingSession } from "../elysianClearingCombat";
import { ClearingCurrencyError, collectCurrencyDrop, getCurrencyDrops } from "../clearingCurrency";

const equipSchema = z.object({ inventoryId: z.string().min(1) }).strict();
const unequipSchema = z.object({ slot: z.enum(["helmet", "weapon", "armor", "boots", "charm"]) }).strict();

export function registerClearingEquipmentRoutes(app: Express, deps: { db: any; storage:any; isAuthenticated: RequestHandler }): void {
  const { db, storage, isAuthenticated } = deps;
  const respondError = (res: any, error: unknown) => {
    if (error instanceof ClearingEquipmentError) return res.status(error.code === "not_found" ? 404 : 400).json({ message: error.message });
    console.error("Clearing equipment error:", error);
    return res.status(500).json({ message: "Clearing equipment operation failed" });
  };

  app.get("/api/clearing/inventory", isAuthenticated, async (req, res) => {
    try { return res.json(await getClearingInventory(db, (req.user as any).id)); }
    catch (error) { return respondError(res, error); }
  });

  app.get("/api/clearing/loadout", isAuthenticated, async (req, res) => {
    try { const user=req.user as any;const loadout=await getClearingLoadout(db,user.id);const inventory=await storage.getUserInventory(user.id);const pet=inventory.find((item:any)=>item.id===user.activePetId&&item.isHatched);return res.json({...loadout,effectiveStats:pet?calculateClearingStats({hp:pet.petHealth||1000,atk:pet.petAtk||50,def:pet.petDef||50},loadout.totals):null}); }
    catch (error) { return respondError(res, error); }
  });

  app.post("/api/clearing/loadout/equip", isAuthenticated, async (req, res) => {
    const parsed = equipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A valid inventory ID is required" });
    try { return res.json(await equipClearingItem(db, (req.user as any).id, parsed.data.inventoryId)); }
    catch (error) { return respondError(res, error); }
  });

  app.post("/api/clearing/loadout/unequip", isAuthenticated, async (req, res) => {
    const parsed = unequipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Clearing slot must be helmet, weapon, armor, boots, or charm" });
    try { return res.json(await unequipClearingItem(db, (req.user as any).id, parsed.data.slot as ClearingEquipmentSlot)); }
    catch (error) { return respondError(res, error); }
  });

  app.post("/api/clearing/inventory/sell",isAuthenticated,async(req,res)=>{const parsed=z.object({inventoryIds:z.array(z.string().min(1)).min(1).max(200)}).strict().safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"Select valid equipment IDs"});try{return res.json(await sellClearingEquipment(db,(req.user as any).id,parsed.data.inventoryIds));}catch(error){return respondError(res,error);}});

  app.get("/api/clearing/currency-drops",isAuthenticated,async(req,res)=>{const sessionId=typeof req.query.sessionId==="string"?req.query.sessionId:"",session=getClearingSession(sessionId);if(!session||session.userId!==(req.user as any).id)return res.status(404).json({message:"Clearing session was not found"});return res.json(await getCurrencyDrops(db,{userId:(req.user as any).id,sessionId,clearingId:ELYSIAN_CLEARING_COMBAT.locationId}));});
  app.post("/api/clearing/currency-drops/:dropId/collect",isAuthenticated,async(req,res)=>{const parsed=z.object({sessionId:z.string().min(1)}).strict().safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"Invalid pickup request"});const userId=(req.user as any).id,session=getClearingSession(parsed.data.sessionId);if(!session||session.userId!==userId)return res.status(409).json({message:"Clearing session expired"});try{return res.json(await collectCurrencyDrop(db,{userId,sessionId:session.id,clearingId:ELYSIAN_CLEARING_COMBAT.locationId,dropId:req.params.dropId as string,playerX:session.position.x,playerY:session.position.y,worldPixels:{width:1000,height:1000}}));}catch(error){if(error instanceof ClearingCurrencyError)return res.status(error.code==="not_found"?404:error.code==="distance"?422:409).json({message:error.message});return respondError(res,error);}});

  app.get("/api/clearing/drops",isAuthenticated,async(req,res)=>{
    const sessionId=typeof req.query.sessionId==="string"?req.query.sessionId:"";
    const session=getClearingSession(sessionId);if(!session||session.userId!==(req.user as any).id)return res.status(404).json({message:"Clearing session was not found"});
    return res.json(await getActiveClearingDrops(db,{userId:(req.user as any).id,sessionId,clearingId:ELYSIAN_CLEARING_COMBAT.locationId}));
  });

  app.post("/api/clearing/drops/:dropId/collect",isAuthenticated,async(req,res)=>{
    const parsed=z.object({sessionId:z.string().min(1)}).strict().safeParse(req.body);if(!parsed.success||typeof req.params.dropId!=="string")return res.status(400).json({message:"Invalid Clearing collection request"});
    const userId=(req.user as any).id,session=getClearingSession(parsed.data.sessionId);if(!session||session.userId!==userId)return res.status(409).json({message:"Clearing session expired"});
    try{return res.json(await collectClearingDrop(db,{userId,sessionId:session.id,clearingId:ELYSIAN_CLEARING_COMBAT.locationId,dropId:req.params.dropId,playerX:session.position.x,playerY:session.position.y,worldPixels:{width:1000,height:1000}}));}
    catch(error){if(error instanceof ClearingDropError)return res.status(error.code==="not_found"?404:error.code==="distance"?422:409).json({message:error.message,code:error.code});return respondError(res,error);}
  });
}
