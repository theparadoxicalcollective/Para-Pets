import type { Express, RequestHandler } from "express";
import { z } from "zod";
import type { ClearingEquipmentSlot } from "@shared/clearingEquipment";
import { ClearingEquipmentError, equipClearingItem, getClearingInventory, getClearingLoadout, unequipClearingItem } from "../clearingEquipment";

const equipSchema = z.object({ inventoryId: z.string().min(1) }).strict();
const unequipSchema = z.object({ slot: z.enum(["weapon", "armor", "charm"]) }).strict();

export function registerClearingEquipmentRoutes(app: Express, deps: { db: any; isAuthenticated: RequestHandler }): void {
  const { db, isAuthenticated } = deps;
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
    try { return res.json(await getClearingLoadout(db, (req.user as any).id)); }
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
    if (!parsed.success) return res.status(400).json({ message: "Clearing slot must be weapon, armor, or charm" });
    try { return res.json(await unequipClearingItem(db, (req.user as any).id, parsed.data.slot as ClearingEquipmentSlot)); }
    catch (error) { return respondError(res, error); }
  });
}
