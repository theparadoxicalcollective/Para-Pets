import type { Express, RequestHandler } from "express";
import { and, asc, eq, ilike, inArray, isNotNull, ne } from "drizzle-orm";
import { gameSettings, shopItems, worldScenePlacements } from "@shared/schema";
import { isEditableWorldSceneId } from "@shared/worlds/worldSceneDraft";
import { readSwimAreas, swimAreaKey, validSwimAreas, type WorldSwimArea, type WorldSwimScene } from "@shared/worlds/worldSwimAreas";
import type { db as database } from "../db";

type Store = typeof database;
const catalogFields = { id: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl, facingDirection: shopItems.facingDirection };
const fishFilter = () => and(eq(shopItems.type, "fishing"), eq(shopItems.fishingType, "fish"), isNotNull(shopItems.imageUrl), ne(shopItems.imageUrl, ""));
const fishIds = (areas: WorldSwimArea[]) => [...new Set(areas.flatMap(a => a.fish.map(f => f.fishId)))];
async function referencedFish(db: Store, areas: WorldSwimArea[]) {
  const ids = fishIds(areas);
  return ids.length ? db.select(catalogFields).from(shopItems).where(and(fishFilter(), inArray(shopItems.id, ids))) : [];
}
export async function loadWorldSwimScene(db: Store, worldId: string, placements: {id: string; kind: string}[]): Promise<WorldSwimScene> {
  const [row] = await db.select({ value: gameSettings.value }).from(gameSettings).where(eq(gameSettings.key, swimAreaKey(worldId))).limit(1);
  const buildingIds = new Set(placements.filter(p => p.kind === "building").map(p => p.id));
  const areas = readSwimAreas(row?.value).filter(a => !a.buildingId || buildingIds.has(a.buildingId));
  const swimFish = await referencedFish(db, areas);
  const available = new Set(swimFish.map(f => f.id));
  return { swimAreas: areas.map(a => ({ ...a, fish: a.fish.filter(f => available.has(f.fishId)) })), swimFish };
}
export function registerWorldSwimAreasRoutes(app: Express, {db, isAdmin}: { db: Store; isAdmin: RequestHandler }) {
  app.get("/api/admin/world-editor/:worldId/fish-catalog", isAdmin, async (req, res) => {
    if (typeof req.params.worldId !== "string" || !isEditableWorldSceneId(req.params.worldId)) return res.status(404).json({message: "Unknown world"});
    const page = Number(req.query.page ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000) return res.status(400).json({message: "Invalid page"});
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";
    try {
      const fish = await db.select(catalogFields).from(shopItems)
        .where(and(fishFilter(), search ? ilike(shopItems.name, `%${search}%`) : undefined))
        .orderBy(asc(shopItems.name), asc(shopItems.id)).limit(7).offset(page * 6);
      return res.json({fish: fish.slice(0, 6), more: fish.length > 6});
    } catch (error) {
      console.error("[world-fish] catalog", error);
      return res.status(500).json({message: "Could not load fish"});
    }
  });
  app.put("/api/admin/world-editor/:worldId/swim-areas", isAdmin, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isEditableWorldSceneId(worldId)) return res.status(404).json({message: "Unknown world"});
    if (!validSwimAreas(req.body?.areas)) return res.status(400).json({message: "Invalid swim areas or fish limit exceeded"});
    // Only persist explicitly supported layout fields, not catalog artwork or arbitrary client data.
    const areas: WorldSwimArea[] = req.body.areas.map(({id, buildingId, groundLevel, x, y, width, height, fish}: WorldSwimArea) =>
      ({id, buildingId, groundLevel, x, y, width, height, fish: fish.map(({id, fishId, x, y}) => ({id, fishId, x, y}))}));
    try {
      const buildings = [...new Set(areas.flatMap(a => a.buildingId ? [a.buildingId] : []))];
      if (buildings.length) {
        const rows = await db.select({id: worldScenePlacements.id}).from(worldScenePlacements)
          .where(and(eq(worldScenePlacements.worldId, worldId), eq(worldScenePlacements.kind, "building"), inArray(worldScenePlacements.id, buildings)));
        if (rows.length !== buildings.length) return res.status(400).json({message: "Unknown building in this world"});
      }
      const swimFish = await referencedFish(db, areas);
      if (swimFish.length !== fishIds(areas).length) return res.status(400).json({message: "Unknown or unavailable fish"});
      const value = JSON.stringify(areas);
      await db.insert(gameSettings).values({key: swimAreaKey(worldId), value})
        .onConflictDoUpdate({target: gameSettings.key, set: {value}});
      return res.json({swimAreas: areas, swimFish});
    } catch (error) {
      console.error("[world-fish] save", error);
      return res.status(500).json({message: "Could not save swim areas"});
    }
  });
}
