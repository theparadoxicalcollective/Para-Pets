import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { db as database } from "../db";
import type { IStorage } from "../storage";
import { CLIENT_ERROR_LIMIT, getClientErrorCount } from "../clientErrorStore";

export interface MaintenanceRouteDependencies {
  db: typeof database;
  storage: IStorage;
  isAdmin: RequestHandler;
}

export function registerMaintenanceRoutes(
  app: Express,
  { db, storage, isAdmin }: MaintenanceRouteDependencies,
): void {
  // In-memory cache so every client poll doesn't hit Railway Postgres.
  // Maintenance mode rarely changes, so 60s staleness is fine.
  let maintenanceCache: { value: boolean; at: number } | null = null;

  app.get("/api/maintenance-status", async (_req, res) => {
    try {
      const now = Date.now();
      if (maintenanceCache && now - maintenanceCache.at < 60_000) {
        return res.json({ maintenance: maintenanceCache.value });
      }
      const val = await storage.getGameSetting("maintenance_mode");
      maintenanceCache = { value: val === "true", at: now };
      return res.json({ maintenance: maintenanceCache.value });
    } catch {
      return res.json({ maintenance: false });
    }
  });

  app.post("/api/admin/maintenance", isAdmin, async (req, res) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      await storage.setGameSetting("maintenance_mode", enabled ? "true" : "false");
      maintenanceCache = null;
      return res.json({ maintenance: enabled });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Read directly from storage so the admin sees the authoritative state, even
  // when the public status cache has not refreshed yet.
  app.get("/api/admin/maintenance/diagnostics", isAdmin, async (_req, res) => {
    try {
      const [maintenance] = await Promise.all([
        storage.getGameSetting("maintenance_mode"),
        db.execute(sql`SELECT 1`),
      ]);
      return res.json({
        maintenance: maintenance === "true",
        database: "online",
        uptimeSeconds: Math.floor(process.uptime()),
        serverTime: new Date().toISOString(),
        clientErrors: getClientErrorCount(),
        clientErrorLimit: CLIENT_ERROR_LIMIT,
      });
    } catch (err) {
      console.error("Maintenance diagnostics error:", err);
      return res.status(503).json({ message: "Maintenance diagnostics are unavailable" });
    }
  });

  app.post("/api/admin/cleanup-orphans", isAdmin, async (_req, res) => {
    try {
      const steps: string[] = [];
      const run = async (label: string, q: string) => {
        const r = await db.execute(sql.raw(q));
        const count = (r as any).rowCount ?? 0;
        if (count > 0) steps.push(`${label}: ${count} row(s) removed`);
      };

      // house bundles
      await run("user_house_bundles orphans",       "DELETE FROM user_house_bundles WHERE bundle_id NOT IN (SELECT id FROM house_bundles)");
      await run("location_house_bundles orphans",   "DELETE FROM location_house_bundles WHERE bundle_id NOT IN (SELECT id FROM house_bundles)");
      await run("location_house_bundles loc miss",  "DELETE FROM location_house_bundles WHERE location_id NOT IN (SELECT id FROM world_locations)");
      await run("house_bundle_buildings orphans",   "DELETE FROM house_bundle_buildings WHERE bundle_id NOT IN (SELECT id FROM house_bundles)");

      // shop items / inventory
      await run("user_inventory orphans",           "DELETE FROM user_inventory WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("pet_equipped_accessories pet miss","DELETE FROM pet_equipped_accessories WHERE pet_inventory_id NOT IN (SELECT id FROM user_inventory)");
      await run("pet_equipped_accessories acc miss","DELETE FROM pet_equipped_accessories WHERE accessory_inventory_id NOT IN (SELECT id FROM user_inventory)");
      await run("pet_house_positions orphans",      "DELETE FROM pet_house_positions WHERE inventory_id NOT IN (SELECT id FROM user_inventory)");
      await run("player_market_listings item miss", "DELETE FROM player_market_listings WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("player_market_listings inv miss",  "DELETE FROM player_market_listings WHERE inventory_id NOT IN (SELECT id FROM user_inventory)");

      // fishing
      await run("pond_fish item miss",              "DELETE FROM pond_fish WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("pond_fish location miss",          "DELETE FROM pond_fish WHERE location_id NOT IN (SELECT id FROM world_locations)");
      await run("fish_template_parts orphans",      "DELETE FROM fish_template_parts WHERE fish_item_id NOT IN (SELECT id FROM shop_items)");
      await run("player_fish_inventory orphans",    "DELETE FROM player_fish_inventory WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("player_fish_catch_log orphans",    "DELETE FROM player_fish_catch_log WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("fishing equipment pole miss",      "UPDATE player_fishing_equipment SET pole_inventory_id = NULL WHERE pole_inventory_id IS NOT NULL AND pole_inventory_id NOT IN (SELECT id FROM user_inventory)");
      await run("fishing equipment bait miss",      "UPDATE player_fishing_equipment SET bait_inventory_id = NULL WHERE bait_inventory_id IS NOT NULL AND bait_inventory_id NOT IN (SELECT id FROM user_inventory)");

      // enemies
      await run("enemy_drops enemy miss",           "DELETE FROM enemy_drops WHERE enemy_id NOT IN (SELECT id FROM enemies)");
      await run("enemy_drops item miss",            "DELETE FROM enemy_drops WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("enemy_parts orphans",              "DELETE FROM enemy_parts WHERE enemy_id NOT IN (SELECT id FROM enemies)");
      await run("keepers_central_enemies orphans",  "DELETE FROM keepers_central_enemies WHERE enemy_id NOT IN (SELECT id FROM enemies)");

      // badges
      await run("user_badges orphans",              "DELETE FROM user_badges WHERE badge_id NOT IN (SELECT id FROM badges)");
      await run("badge_reward_claims orphans",      "DELETE FROM badge_reward_claims WHERE badge_id NOT IN (SELECT id FROM badges)");

      // home decor
      await run("location_home_decor decor miss",  "DELETE FROM location_home_decor WHERE decor_id NOT IN (SELECT id FROM home_decor_items)");
      await run("location_home_decor loc miss",    "DELETE FROM location_home_decor WHERE location_id NOT IN (SELECT id FROM world_locations)");

      // pet templates
      await run("pet_template_parts orphans",       "DELETE FROM pet_template_parts WHERE template_id NOT IN (SELECT id FROM pet_templates)");

      // world/location fk nullification (don't delete, just detach)
      await run("shop_items missing petTemplateId", "UPDATE shop_items SET pet_template_id = NULL WHERE pet_template_id IS NOT NULL AND pet_template_id NOT IN (SELECT id FROM pet_templates)");
      await run("shop_items missing worldId",       "UPDATE shop_items SET world_id = NULL WHERE world_id IS NOT NULL AND world_id NOT IN (SELECT id FROM worlds)");
      await run("shop_items missing locationId",    "UPDATE shop_items SET location_id = NULL WHERE location_id IS NOT NULL AND location_id NOT IN (SELECT id FROM world_locations)");

      const totalRows = steps.reduce((sum, s) => {
        const m = s.match(/(\d+) row/);
        return sum + (m ? parseInt(m[1]) : 0);
      }, 0);
      const summary = steps.length > 0 ? steps.join("\n") : "No orphans found — database is clean.";
      return res.json({ ok: true, summary, cleaned: steps.length, totalRows, ranAt: new Date().toISOString() });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
