import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { db as database } from "../db";
import type { IStorage } from "../storage";
import { raidBossSelectionSchema, saveRaidBoss } from "../raidBossAdmin";

export interface RaidRouteDependencies {
  db: typeof database;
  storage: IStorage;
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
}

/**
 * Raid routes were moved out of the legacy route registry without changing
 * endpoint URLs, auth rules, response shapes, cache lifetimes, reward logic,
 * ticket handling, or admin behavior.
 */
export function registerRaidRoutes(
  app: Express,
  { db, storage, isAuthenticated, isAdmin }: RaidRouteDependencies,
): void {
  // ── Public: check raid visibility ─────────────────────────────────────────
  let _raidCache: { value: boolean; at: number } | null = null;
  app.get("/api/raid-status", async (_req, res) => {
    try {
      const now = Date.now();
      if (_raidCache && now - _raidCache.at < 60_000) {
        return res.json({ raidVisible: _raidCache.value });
      }
      const val = await storage.getGameSetting("raid_visible");
      _raidCache = { value: val === "true", at: now };
      return res.json({ raidVisible: _raidCache.value });
    } catch {
      return res.json({ raidVisible: false });
    }
  });
  
  // ── Admin: toggle raid visibility ──────────────────────────────────────────
  app.post("/api/admin/raid-toggle", isAdmin, async (req, res) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      await storage.setGameSetting("raid_visible", enabled ? "true" : "false");
      _raidCache = { value: enabled, at: Date.now() };
      return res.json({ raidVisible: enabled });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
  
  // ── Public: get raid boss info ─────────────────────────────────────────────
  let _raidBossVersion = 0;
  let _raidBossCache: { templateId: string | null; rarity: number | null; name: string | null; hatchedImageUrl: string | null; hp: number; maxHp: number; at: number } | null = null;
  
  app.get("/api/raid-boss", async (_req, res) => {
    try {
      const version = _raidBossVersion;
      const now = Date.now();
      if (_raidBossCache && now - _raidBossCache.at < 5_000) {
        return res.json({ templateId: _raidBossCache.templateId, rarity: _raidBossCache.rarity, name: _raidBossCache.name, hatchedImageUrl: _raidBossCache.hatchedImageUrl, hp: _raidBossCache.hp, maxHp: _raidBossCache.maxHp });
      }
      const templateId = await storage.getGameSetting("raid_boss_template_id");
      if (!templateId) {
        if (version === _raidBossVersion) _raidBossCache = { templateId: null, rarity: null, name: null, hatchedImageUrl: null, hp: 0, maxHp: 0, at: now };
        return res.json({ templateId: null, rarity: null, name: null, hatchedImageUrl: null, hp: 0, maxHp: 0 });
      }
      const [template, hpStr, maxHpStr, shopRow] = await Promise.all([
        storage.getPetTemplate(templateId),
        storage.getGameSetting("raid_boss_hp"),
        storage.getGameSetting("raid_boss_max_hp"),
        db.execute(sql`SELECT rarity, hatched_image_url AS "hatchedImageUrl", image_url AS "imageUrl" FROM shop_items WHERE pet_template_id = ${templateId} AND type = 'pet' LIMIT 1`),
      ]);
      const maxHp = maxHpStr ? parseInt(maxHpStr, 10) : 10000;
      const hp = hpStr ? parseInt(hpStr, 10) : maxHp;
      const rarity: number | null = (shopRow.rows[0]?.rarity as number | null) ?? null;
      const hatchedImageUrl: string | null =
        (shopRow.rows[0]?.hatchedImageUrl as string | null)
        ?? (shopRow.rows[0]?.imageUrl as string | null)
        ?? null;
      const result = { templateId, rarity, name: template?.name ?? null, hatchedImageUrl, hp, maxHp };
      if (version === _raidBossVersion) _raidBossCache = { ...result, at: now };
      return res.json(result);
    } catch {
      return res.json({ templateId: null, rarity: null, name: null, hatchedImageUrl: null, hp: 0, maxHp: 0 });
    }
  });
  
  // ── Public: raid leaderboard ──────────────────────────────────────────────
  app.get("/api/raid/leaderboard", async (_req, res) => {
    try {
      const rows: any = await db.execute(sql`
        SELECT u.id AS "userId", u.username,
               u.profile_image AS "profileImage",
               COALESCE(u.raid_total_damage, 0) AS "totalDamage"
        FROM users u
        WHERE COALESCE(u.raid_total_damage, 0) > 0
          AND (u.is_admin IS NULL OR u.is_admin = false)
        ORDER BY COALESCE(u.raid_total_damage, 0) DESC
        LIMIT 10000
      `);
      return res.json({ top: rows.rows ?? rows });
    } catch (err) {
      console.error("Raid leaderboard error:", err);
      return res.json({ top: [] });
    }
  });
  
  // ── Raid: reward tier config ──────────────────────────────────────────────
  const DEFAULT_RAID_TIERS = [
    { key: "t1",  label: "Champion",   rankFrom: 1,   rankTo: 3,    coins: 0, items: [] },
    { key: "t2",  label: "Hero",       rankFrom: 4,   rankTo: 10,   coins: 0, items: [] },
    { key: "t3",  label: "Elite",      rankFrom: 11,  rankTo: 25,   coins: 0, items: [] },
    { key: "t4",  label: "Veteran",    rankFrom: 26,  rankTo: 50,   coins: 0, items: [] },
    { key: "t5",  label: "Warrior",    rankFrom: 51,  rankTo: 100,  coins: 0, items: [] },
    { key: "t6",  label: "Adventurer", rankFrom: 101, rankTo: 500,  coins: 0, items: [] },
    { key: "t7",  label: "Participant",rankFrom: 1000,rankTo: null, coins: 0, items: [] },
  ];
  
  app.get("/api/raid/rewards", async (_req, res) => {
    try {
      const raw = await storage.getGameSetting("raid_rewards");
      if (!raw) return res.json({ tiers: DEFAULT_RAID_TIERS });
      return res.json(JSON.parse(raw));
    } catch (err) {
      return res.json({ tiers: DEFAULT_RAID_TIERS });
    }
  });
  
  app.post("/api/admin/raid-rewards", isAdmin, async (req, res) => {
    try {
      const { tiers } = req.body;
      if (!Array.isArray(tiers)) return res.status(400).json({ message: "Invalid tiers" });
      await storage.setGameSetting("raid_rewards", JSON.stringify({ tiers }));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
  
  // ── Raid: consume 1 ticket and start a battle session ─────────────────────
  const RAID_TICKET_ITEM_ID = "a1b2c3d4-9002-4000-8000-000000000099";
  
  app.post("/api/raid/start-battle", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ message: "Not logged in" });
  
      // ── 1. Verify the raid boss is alive before spending a ticket ──────────
      const bossRow: any = await db.execute(sql`
        SELECT value::INTEGER AS hp FROM game_settings WHERE key = 'raid_boss_hp'
      `);
      const bossHp = ((bossRow.rows ?? bossRow)[0]?.hp ?? 0) as number;
      if (bossHp <= 0) {
        return res.status(400).json({ message: "The Raid Boss has already been defeated!" });
      }
  
      // ── 2. Verify the boss template is actually set ────────────────────────
      const bossTemplateRow: any = await db.execute(sql`
        SELECT value FROM game_settings WHERE key = 'raid_boss_template_id'
      `);
      const bossTemplateId = (bossTemplateRow.rows ?? bossTemplateRow)[0]?.value as string | null;
      if (!bossTemplateId) {
        return res.status(400).json({ message: "No Raid Boss is active right now." });
      }
  
      // ── 3. Also fetch maxHp so the battle page can build the HP bar correctly
      const maxHpRow: any = await db.execute(sql`
        SELECT value::INTEGER AS max_hp FROM game_settings WHERE key = 'raid_boss_max_hp'
      `);
      const bossMaxHp = ((maxHpRow.rows ?? maxHpRow)[0]?.max_hp ?? bossHp) as number;
  
      // ── 4. Deduct 1 ticket atomically — targets a single row by id ──────────
      const result: any = await db.execute(sql`
        UPDATE user_inventory
        SET quantity = quantity - 1
        WHERE id = (
          SELECT id FROM user_inventory
          WHERE user_id = ${userId}
            AND shop_item_id = ${RAID_TICKET_ITEM_ID}
            AND quantity > 0
          ORDER BY id
          LIMIT 1
        )
        RETURNING quantity
      `);
      const rows = result.rows ?? result;
      if (!rows.length) {
        return res.status(400).json({ message: "No raid tickets remaining" });
      }
      const remaining = rows[0].quantity as number;
  
      // Bust the server-side cache so the next GET /api/raid-boss reflects real HP
      _raidBossVersion++;
      _raidBossCache = null;
  
      return res.json({ success: true, remaining, bossHp, bossMaxHp });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
  
  app.post("/api/raid/deal-damage", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ message: "Not logged in" });
  
      const { damage } = req.body as { damage: number };
      if (typeof damage !== "number" || damage <= 0 || damage > 50_000_000) {
        return res.status(400).json({ message: "Invalid damage value" });
      }
      const dmg = Math.round(damage);
  
      // Atomic deduct: PostgreSQL UPDATE returns the new value in a single
      // operation so two players hitting this at the same time can never
      // apply duplicate deductions. GREATEST(0, ...) with INTEGER args
      // ensures HP never goes below 0 (text GREATEST was unreliable when
      // the damage overshot the remaining HP and produced a negative string).
      const result: any = await db.execute(sql`
        UPDATE game_settings
        SET value = GREATEST(0, value::INTEGER - ${dmg})::TEXT
        WHERE key = 'raid_boss_hp'
        RETURNING GREATEST(0, value::INTEGER - ${dmg}) AS hp
      `);
      const newHp = Number((result.rows ?? result)[0]?.hp ?? 0);
  
      // Invalidate the in-process cache so the next GET /api/raid-boss
      // returns the fresh HP from the DB rather than the stale cached value.
      _raidBossVersion++;
      _raidBossCache = null;
  
      // Accumulate this player's contribution on their user row
      await db.execute(sql`
        UPDATE users
        SET raid_total_damage = COALESCE(raid_total_damage, 0) + ${dmg}
        WHERE id = ${userId}
      `);
  
      // ── Boss just died → distribute rewards (fire-and-forget, deduped) ──────
      // Use <= 0 so an overkill hit (where the DB value somehow slips negative)
      // still triggers distribution.
      if (newHp <= 0) {
        (async () => {
          try {
            // 1. Find out which boss was just killed
            const bossRow: any = await db.execute(sql`
              SELECT value FROM game_settings WHERE key = 'raid_boss_template_id'
            `);
            const bossId = ((bossRow.rows ?? bossRow)[0]?.value ?? "") as string;
            if (!bossId) return;
  
            // 2. Atomic dedup — one shared lock key per boss regardless of template
            // reuse. We UPDATE (not INSERT) so this survives across raids: if the
            // row already holds a timestamp from a previous kill, the UPDATE only
            // succeeds for the first concurrent caller because PostgreSQL serialises
            // row-level locks. We compare against a sentinel that is reset when the
            // admin starts a new raid (via /api/admin/raid-boss-hp).
            const lockKey = "raid_defeat_lock_current";
            const defeatedAt = new Date().toISOString();
            const lockResult: any = await db.execute(sql`
              INSERT INTO game_settings (key, value)
              VALUES (${lockKey}, ${defeatedAt})
              ON CONFLICT (key) DO UPDATE
                SET value = ${defeatedAt}
                WHERE game_settings.value = 'pending'
            `);
            const gotLock = ((lockResult.rowCount ?? lockResult.count ?? 0) as number) > 0;
            if (!gotLock) return; // another concurrent request already handling this
  
            // 3. Load reward tier config
            const rewardRaw = await storage.getGameSetting("raid_rewards");
            if (!rewardRaw) { console.log("[Raid] Boss defeated but no reward config set — skipping gifts"); return; }
            const { tiers } = JSON.parse(rewardRaw) as {
              tiers: Array<{
                key: string; label: string; rankFrom: number; rankTo: number | null;
                coins: number; items: Array<{ shopItemId: string; name: string; imageUrl: string | null }>;
              }>;
            };
  
            // 4. Leaderboard snapshot at time of kill
            const lb: any = await db.execute(sql`
              SELECT id
              FROM users
              WHERE COALESCE(raid_total_damage, 0) > 0
                AND (is_admin IS NULL OR is_admin = false)
              ORDER BY COALESCE(raid_total_damage, 0) DESC
            `);
            const players = (lb.rows ?? lb) as Array<{ id: string }>;
            if (!players.length) return;
  
            let gifted = 0;
  
            for (let i = 0; i < players.length; i++) {
              const rank = i + 1;
              const playerId = players[i].id;
  
              const tier = tiers.find(t =>
                rank >= t.rankFrom && (t.rankTo === null || rank <= t.rankTo)
              );
              if (!tier) continue;
              if (tier.coins === 0 && tier.items.length === 0) continue;
  
              const bundleName = `Raid Boss Defeated - ${tier.label} Tier`;
              const bundleMsg  = `Congratulations! You ranked #${rank} and earned ${tier.label} rewards.`;
  
              // Create one reward bundle per player then link them via user_reward
              const bundle = await storage.createRewardBundle(bundleName, tier.coins, bundleMsg);
              for (const item of tier.items) {
                await storage.addRewardBundleItem(bundle.id, item.shopItemId);
              }
              await storage.createUserReward(playerId, bundle.id);
              gifted++;
            }
  
            console.log(`[Raid] Rewards distributed to ${gifted} players for boss ${bossId}`);
          } catch (err) {
            console.error("[Raid] Reward distribution error:", err);
          }
        })();
      }
  
      return res.json({ newBossHp: newHp, damageDealt: dmg });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
  
  // ── Admin: set raid boss ───────────────────────────────────────────────────
  // Attack damage rules (fixed game constants):
  //   normal attack = 20% of target pet's current HP
  //   large  attack = 30% of target pet's current HP
  
  app.post("/api/admin/raid-boss", isAdmin, async (req, res) => {
    try {
      const parsed = raidBossSelectionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      await saveRaidBoss(db, parsed.data);
      _raidBossVersion++;
      _raidBossCache = null;
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(err.status === 404 ? 404 : 500).json({ message: err.status === 404 ? err.message : "Could not save raid boss. Please try again." });
    }
  });
  
  // ── Admin: set raid boss HP ────────────────────────────────────────────────
  app.post("/api/admin/raid-boss-hp", isAdmin, async (req, res) => {
    try {
      const { hp, maxHp } = req.body as { hp?: number; maxHp?: number };
      if (maxHp !== undefined) await storage.setGameSetting("raid_boss_max_hp", String(maxHp));
      if (hp !== undefined) await storage.setGameSetting("raid_boss_hp", String(hp));
  
      // Reset defeat lock to 'pending' so the next kill can distribute rewards,
      // and zero out per-player damage so the leaderboard is per-raid (not cumulative).
      await db.execute(sql`
        INSERT INTO game_settings (key, value) VALUES ('raid_defeat_lock_current', 'pending')
        ON CONFLICT (key) DO UPDATE SET value = 'pending'
      `);
      await db.execute(sql`UPDATE users SET raid_total_damage = 0 WHERE COALESCE(raid_total_damage, 0) > 0`);
  
      _raidBossVersion++;
      _raidBossCache = null;
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
  
  // ── Admin: manually distribute raid rewards (for recovery when auto-distribution failed) ──
  app.post("/api/admin/raid-distribute-rewards", isAdmin, async (req, res) => {
    try {
      const rewardRaw = await storage.getGameSetting("raid_rewards");
      if (!rewardRaw) return res.status(400).json({ message: "No raid_rewards config set" });
      const { tiers } = JSON.parse(rewardRaw) as {
        tiers: Array<{
          key: string; label: string; rankFrom: number; rankTo: number | null;
          coins: number; items: Array<{ shopItemId: string; name: string; imageUrl: string | null }>;
        }>;
      };
  
      const lb: any = await db.execute(sql`
        SELECT id FROM users
        WHERE COALESCE(raid_total_damage, 0) > 0
          AND (is_admin IS NULL OR is_admin = false)
        ORDER BY COALESCE(raid_total_damage, 0) DESC
      `);
      const players = (lb.rows ?? lb) as Array<{ id: string }>;
      if (!players.length) return res.status(400).json({ message: "No players on leaderboard" });
  
      let gifted = 0;
  
      for (let i = 0; i < players.length; i++) {
        const rank = i + 1;
        const playerId = players[i].id;
        const tier = tiers.find(t => rank >= t.rankFrom && (t.rankTo === null || rank <= t.rankTo));
        if (!tier) continue;
        if (tier.coins === 0 && tier.items.length === 0) continue;
  
        const bundleName = `Raid Boss Defeated - ${tier.label} Tier`;
        const bundleMsg  = `Congratulations! You ranked #${rank} and earned ${tier.label} rewards.`;
  
        const bundle = await storage.createRewardBundle(bundleName, tier.coins, bundleMsg);
        for (const item of tier.items) {
          await storage.addRewardBundleItem(bundle.id, item.shopItemId);
        }
        await storage.createUserReward(playerId, bundle.id);
        gifted++;
      }
  
      console.log(`[Raid] Manual reward distribution: ${gifted} players rewarded`);
      return res.json({ success: true, gifted });
    } catch (err: any) {
      console.error("[Raid] Manual distribution error:", err);
      return res.status(500).json({ message: err.message });
    }
  });
  
  // ── Admin: list all templates (id + name + rarity) for pickers ─────────────
  app.get("/api/admin/templates-list", isAdmin, async (_req, res) => {
    try {
      const templates = await storage.getAllPetTemplates();
      // pet_templates has no rarity column — rarity lives on shop_items.
      // Return placeholder 1; the raid-boss GET reads rarity from shop_items directly.
      return res.json(templates.map(t => ({ id: t.id, name: t.name, rarity: 1 })));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
  
  // ── Raid icon position on the world map ────────────────────────────────────
  app.get("/api/raid-icon-position", async (_req, res) => {
    try {
      const raw = await storage.getGameSetting("admin_pos_raid_icon");
      if (raw) {
        const parsed = JSON.parse(raw);
        return res.json({ posX: parsed.posX ?? 48, posY: parsed.posY ?? 5 });
      }
      return res.json({ posX: 48, posY: 5 });
    } catch {
      return res.json({ posX: 48, posY: 5 });
    }
  });
  
  app.patch("/api/admin/raid-icon-position", isAdmin, async (req, res) => {
    try {
      const { posX, posY } = req.body;
      if (typeof posX !== "number" || typeof posY !== "number") {
        return res.status(400).json({ message: "posX and posY are required numbers" });
      }
      const clamped = { posX: Math.max(-10, Math.min(110, Math.round(posX))), posY: Math.max(-10, Math.min(110, Math.round(posY))) };
      await storage.setGameSetting("admin_pos_raid_icon", JSON.stringify(clamped));
      return res.json(clamped);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
  
}
