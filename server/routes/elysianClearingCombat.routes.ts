import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { ELYSIAN_CLEARING_COMBAT, applyClearingHit, createClearingSession, removeClearingSession, respawnClearingEnemy, scaleClearingEnemy } from "../elysianClearingCombat";
import { calculateClearingStats, getClearingLoadout } from "../clearingEquipment";

export function registerElysianClearingCombatRoutes(app: Express, deps: { db: any; storage: any; isAuthenticated: RequestHandler }) {
  const { db, storage, isAuthenticated } = deps;

  app.post("/api/explore/elysian-clearing/session", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const inventory = await storage.getUserInventory(user.id);
    const pet = inventory.find((item: any) => item.id === user.activePetId && item.isHatched);
    if (!pet) return res.status(400).json({ message: "An active hatched pet is required" });
    const loadout = await getClearingLoadout(db, user.id);
    const effective = calculateClearingStats({ hp: pet.petHealth || 1000, atk: pet.petAtk || 50, def: pet.petDef || 50 }, loadout.totals);
    const stats = { level: pet.petLevel || 1, ...effective, rarity: pet.rarity };
    const session = createClearingSession(user.id, pet.id, stats);
    return res.json({
      sessionId: session.id,
      pet: { inventoryId: pet.id, maxHealth: stats.hp, attack: scaleClearingEnemy(stats).petDamage, defense: stats.def },
      enemies: session.enemies.map(({ lastHitAt: _lastHitAt, ...enemy }) => enemy),
    });
  });

  app.post("/api/explore/elysian-clearing/attack", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const { sessionId, enemyInstanceId } = req.body ?? {};
    if (typeof sessionId !== "string" || typeof enemyInstanceId !== "string") return res.status(400).json({ message: "Invalid combat request" });
    const inventory = await storage.getUserInventory(user.id);
    const pet = inventory.find((item: any) => item.id === user.activePetId && item.isHatched);
    if (!pet) return res.status(400).json({ message: "An active hatched pet is required" });
    const result = applyClearingHit({ sessionId, instanceId: enemyInstanceId, userId: user.id, petId: pet.id });
    if (result.status === "invalid") return res.status(409).json({ message: "Combat session expired" });
    if (result.status === "cooldown") return res.status(429).json({ message: "Attack is cooling down" });
    if (result.status === "defeated") return res.status(409).json({ message: "Enemy already defeated" });
    if (result.status === "hit") return res.json({ defeated: false, health: result.enemy.health, maxHealth: result.enemy.maxHealth });

    const claimKey = `elysian-clearing-defeat:${user.id}:${enemyInstanceId}`;
    const coinReward = ELYSIAN_CLEARING_COMBAT.coinMin + Math.floor(Math.random() * (ELYSIAN_CLEARING_COMBAT.coinMax - ELYSIAN_CLEARING_COMBAT.coinMin + 1));
    const reward = await db.transaction(async (tx: any) => {
      const inserted = await tx.execute(sql`INSERT INTO game_settings (key, value) VALUES (${claimKey}, ${new Date().toISOString()}) ON CONFLICT (key) DO NOTHING RETURNING key`);
      if (!inserted.rows.length) return null;
      const current = await tx.execute(sql`SELECT pet_level, pet_level_points, xp_boost_until, xp_boost_pct FROM user_inventory WHERE id = ${pet.id} AND user_id = ${user.id} FOR UPDATE`);
      if (!current.rows.length) throw new Error("Active pet disappeared during reward grant");
      const row = current.rows[0] as any;
      const boostedExp = row.xp_boost_until && new Date(row.xp_boost_until).getTime() > Date.now()
        ? Math.round(ELYSIAN_CLEARING_COMBAT.expReward * (1 + Number(row.xp_boost_pct || 0) / 100)) : ELYSIAN_CLEARING_COMBAT.expReward;
      let level = Number(row.pet_level || 1); let points = Number(row.pet_level_points || 0) + boostedExp;
      while (level < 100) { const needed = Math.floor(100 + level * 30 + level * level * 5); if (points < needed) break; points -= needed; level++; }
      if (level >= 100) { level = 100; points = 0; }
      await tx.execute(sql`UPDATE user_inventory SET pet_level = ${level}, pet_level_points = ${points} WHERE id = ${pet.id} AND user_id = ${user.id}`);
      const updated = await tx.execute(sql`UPDATE users SET coins = coins + ${coinReward}, total_coins_earned = total_coins_earned + ${coinReward} WHERE id = ${user.id} RETURNING coins`);
      return { coins: coinReward, exp: boostedExp, balance: Number((updated.rows[0] as any).coins), level, levelPoints: points };
    });
    if (!reward) return res.status(409).json({ message: "Reward already claimed" });
    const nextEnemy = respawnClearingEnemy(sessionId, enemyInstanceId);
    return res.json({ defeated: true, health: 0, maxHealth: result.enemy.maxHealth, reward, nextEnemy: nextEnemy && { instanceId: nextEnemy.instanceId, health: nextEnemy.health } });
  });

  app.delete("/api/explore/elysian-clearing/session/:sessionId", isAuthenticated, (req, res) => {
    removeClearingSession(req.params.sessionId as string, (req.user as any).id);
    return res.status(204).end();
  });
}
