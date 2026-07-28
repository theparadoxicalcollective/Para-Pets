import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { ELYSIAN_CLEARING_COMBAT, applyClearingHit, createClearingSession, removeClearingSession, respawnClearingEnemy, scaleClearingEnemy, updateClearingPosition } from "../elysianClearingCombat";
import { calculateClearingStats, ensureClearingStarterWeapon } from "../clearingEquipment";
import { claimClearingRewardChest, ClearingChestError, createClearingRewardChest, getClearingRewardChests } from "../clearingRewardChests";

export function registerElysianClearingCombatRoutes(app: Express, deps: { db: any; storage: any; isAuthenticated: RequestHandler }) {
  const { db, storage, isAuthenticated } = deps;

  app.post("/api/explore/elysian-clearing/session", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    try {
      const inventory = await storage.getUserInventory(user.id);
      const pet = inventory.find((item: any) => item.id === user.activePetId && item.isHatched);
      if (!pet) return res.status(400).json({ code: "CLEARING_ACTIVE_PET_REQUIRED", message: "Choose a hatched active pet before entering the Clearing" });
      let loadout;
      try { loadout = await ensureClearingStarterWeapon(db, user.id); }
      catch (error: any) {
        const migrationFailure = ["42P01", "42703", "42830"].includes(error?.code);
        console.error("Clearing starter weapon preparation failed", { userId: user.id, code: error?.code ?? "unknown", message: error instanceof Error ? error.message : String(error) });
        return res.status(500).json({ code: migrationFailure ? "CLEARING_MIGRATION_REQUIRED" : "CLEARING_STARTER_WEAPON_FAILED", message: "Unable to prepare Clearing equipment" });
      }
      const effective = calculateClearingStats({ hp: pet.petHealth || 1000, atk: pet.petAtk || 50, def: pet.petDef || 50 }, loadout.totals);
      const stats = { level: pet.petLevel || 1, ...effective, rarity: pet.rarity };
      const session = createClearingSession(user.id, pet.id, stats);
      const chests=await getClearingRewardChests(db,{userId:user.id,sessionId:session.id,clearingId:ELYSIAN_CLEARING_COMBAT.locationId});
      return res.json({ sessionId: session.id, loadout,
        pet: { inventoryId: pet.id, maxHealth: stats.hp, attack: scaleClearingEnemy(stats).petDamage, defense: stats.def },
        enemies: session.enemies.map(({ lastHitAt: _lastHitAt, ...enemy }) => enemy), chests });
    } catch (error: any) {
      console.error("Clearing session creation failed", { userId: user.id, code: error?.code ?? "unknown", message: error instanceof Error ? error.message : String(error) });
      return res.status(503).json({ code: "CLEARING_TEMPORARILY_UNAVAILABLE", message: "The Clearing is temporarily unavailable" });
    }
  });

  app.post("/api/explore/elysian-clearing/attack", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const { sessionId, enemyInstanceId, targetPosition } = req.body ?? {};
    if (typeof sessionId !== "string" || typeof enemyInstanceId !== "string") return res.status(400).json({ message: "Invalid combat request" });
    const inventory = await storage.getUserInventory(user.id);
    const pet = inventory.find((item: any) => item.id === user.activePetId && item.isHatched);
    if (!pet) return res.status(400).json({ message: "An active hatched pet is required" });
    const result = applyClearingHit({ sessionId, instanceId: enemyInstanceId, userId: user.id, petId: pet.id, enemyPosition:targetPosition });
    if (result.status === "invalid") return res.status(409).json({ message: "Combat session expired" });
    if (result.status === "cooldown") return res.status(429).json({ message: "Attack is cooling down" });
    if (result.status === "range") return res.status(409).json({ message: "Target is out of range" });
    if (result.status === "defeated") return res.status(409).json({ message: "Enemy already defeated" });
    if (result.status === "hit") return res.json({ defeated: false, health: result.enemy.health, maxHealth: result.enemy.maxHealth });

    const claimKey = `elysian-clearing-defeat:${user.id}:${enemyInstanceId}`;
    const reward = await db.transaction(async (tx: any) => {
      const inserted = await tx.execute(sql`INSERT INTO game_settings (key, value) VALUES (${claimKey}, ${new Date().toISOString()}) ON CONFLICT (key) DO NOTHING RETURNING key`);
      if (!inserted.rows.length) return null;
      const current = await tx.execute(sql`SELECT xp_boost_until, xp_boost_pct FROM user_inventory WHERE id = ${pet.id} AND user_id = ${user.id} FOR UPDATE`);
      if (!current.rows.length) throw new Error("Active pet disappeared during reward grant");
      const row = current.rows[0] as any;
      const boostedExp = row.xp_boost_until && new Date(row.xp_boost_until).getTime() > Date.now()
        ? Math.round(ELYSIAN_CLEARING_COMBAT.expReward * (1 + Number(row.xp_boost_pct || 0) / 100)) : ELYSIAN_CLEARING_COMBAT.expReward;
      const chest=await createClearingRewardChest(tx,{userId:user.id,sessionId,clearingId:ELYSIAN_CLEARING_COMBAT.locationId,enemyId:enemyInstanceId,petInventoryId:pet.id,exp:boostedExp,worldX:result.enemy.x,worldY:result.enemy.y});
      return { chest };
    });
    if (!reward) return res.status(409).json({ message: "Reward already claimed" });
    const nextEnemy = respawnClearingEnemy(sessionId, enemyInstanceId);
    return res.json({ defeated: true, health: 0, maxHealth: result.enemy.maxHealth, chest:reward.chest, nextEnemy: nextEnemy && { instanceId: nextEnemy.instanceId, health: nextEnemy.health } });
  });

  app.get("/api/explore/elysian-clearing/chests/:sessionId",isAuthenticated,async(req,res)=>res.json(await getClearingRewardChests(db,{userId:(req.user as any).id,sessionId:req.params.sessionId as string,clearingId:ELYSIAN_CLEARING_COMBAT.locationId})));
  app.post("/api/explore/elysian-clearing/chests/:chestId/claim",isAuthenticated,async(req,res)=>{try{return res.json(await claimClearingRewardChest(db,{userId:(req.user as any).id,chestId:req.params.chestId as string}));}catch(error){if(error instanceof ClearingChestError)return res.status(error.code==="not_found"?404:409).json({code:error.code,message:error.message});throw error;}});

  app.post("/api/explore/elysian-clearing/position",isAuthenticated,(req,res)=>{
    const {sessionId,x,y}=req.body??{};
    if(typeof sessionId!=="string"||typeof x!=="number"||typeof y!=="number")return res.status(400).json({message:"Invalid Clearing position"});
    const accepted=updateClearingPosition({sessionId,userId:(req.user as any).id,x,y});
    return accepted?res.json(accepted):res.status(409).json({message:"Clearing position was rejected"});
  });

  app.delete("/api/explore/elysian-clearing/session/:sessionId", isAuthenticated, (req, res) => {
    removeClearingSession(req.params.sessionId as string, (req.user as any).id);
    return res.status(204).end();
  });
}
