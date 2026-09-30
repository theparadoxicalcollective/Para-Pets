import type { Express, Request, RequestHandler, Response } from "express";

export interface PvpRouteDependencies {
  storage: typeof import("../storage").storage;
  isAuthenticated: RequestHandler;
  publicAccount: (user: any) => any;
  maybeAwardBrawlerBadges: (userId: string, totalWins: number) => Promise<void>;
}

/**
 * PvP Arena routes extracted from the legacy route registry without changing
 * endpoint URLs, auth rules, scoring, ticket economy, matchmaking, mood effects,
 * battle-group behavior, leaderboard responses, or anti-exploit safeguards.
 */
export function registerPvpRoutes(
  app: Express,
  {
    storage,
    isAuthenticated,
    publicAccount,
    maybeAwardBrawlerBadges,
  }: PvpRouteDependencies,
): void {
  // ── PvP Arena Routes ─────────────────────────────────────────────────────
  // Generate an AI opponent based on the player's current pet level
  app.get("/api/pvp/opponent", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const inventory = await storage.getUserInventory(user.id);
      const shopItemsData = await storage.getShopItemsByWorld(user.worldId || "murk_cave");
      const activePet = inventory
        .map((inv: any) => {
          const shopItem = shopItemsData.find((s: any) => s.id === inv.shopItemId);
          return shopItem ? { ...shopItem, ...inv, shopItemId: inv.shopItemId } : null;
        })
        .filter(Boolean)
        .find((inv: any) => inv.id === user.activePetId && inv.isHatched);

      const playerLevel = activePet?.petLevel || 1;
      const playerAtk = activePet?.petAtk || 50;
      const playerDef = activePet?.petDef || 50;
      const playerHp = activePet?.petHealth || 1000;

      // Opponent is slightly above/below player level
      const levelOffset = Math.floor(Math.random() * 5) - 2;
      const opponentLevel = Math.max(1, playerLevel + levelOffset);
      const scaleFactor = 0.85 + Math.random() * 0.35;
      const skills = ["Lazer", "Bubble", "Heal Self", "Poison", null, null];
      const skill = skills[Math.floor(Math.random() * skills.length)];

      // Pick a random enemy image from the database as avatar
      const allEnemies = await storage.getLocationEnemies("a1b2c3d4-0001-4000-8000-000000000001").catch(() => []);
      const randomEnemy = allEnemies[Math.floor(Math.random() * allEnemies.length)];

      const opponentNames = [
        "Shadow Keeper", "Storm Warden", "Void Stalker", "Crystal Hunter",
        "Ember Wolf", "Tide Walker", "Iron Fang", "Moon Shade", "Ash Drake",
        "Venom Wisp", "Frost Rune", "Chaos Sprite",
      ];
      const name = opponentNames[Math.floor(Math.random() * opponentNames.length)];

      return res.json({
        name,
        imageUrl: randomEnemy?.imageUrl || null,
        level: opponentLevel,
        hp: Math.floor(playerHp * scaleFactor),
        atk: Math.floor(playerAtk * scaleFactor),
        def: Math.floor(playerDef * scaleFactor * 0.7),
        specialSkill: skill,
      });
    } catch (err) {
      console.error("PvP opponent error:", err);
      return res.status(500).json({ message: "Failed to generate opponent" });
    }
  });

  // Record PvP battle result and award coins + battle points
  app.post("/api/pvp/result", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { opponentName, opponentImageUrl, opponentLevel, opponentSkill, result, opponentUserId, battleToken } = req.body;
      if (!["win", "loss"].includes(result)) return res.status(400).json({ message: "Invalid result" });

      // Server-side ticket gating: /api/pvp/result is only accepted with a
      // valid one-time battle token issued by /api/pvp/start (which already
      // spent the ticket). This stops a client from calling /result directly
      // to farm BP/coins without paying. The token is consumed on use.
      const tokenOk = await storage.consumePvpBattleToken(user.id, String(battleToken || ""));
      if (!tokenOk) {
        return res.status(403).json({ message: "Missing or invalid battle token" });
      }

      // Coin reward is driven by opponent level. The client used to send
      // this directly which let a modified client inflate payouts —
      // instead we derive it from the opponent's *saved* battle group
      // (highest pet level on their roster) and only fall back to the
      // client value as a sanity-capped backup. Clamped to [1, 50].
      let lvl = 1;
      if (opponentUserId && opponentUserId !== user.id) {
        try {
          const oppGroupForLvl = await storage.getBattleGroup(String(opponentUserId));
          const oppPetIds: string[] = oppGroupForLvl?.petInventoryIds ?? [];
          if (oppPetIds.length) {
            const oppInv = await storage.getUserInventory(String(opponentUserId));
            const lvls = oppInv
              .filter((it: any) => oppPetIds.includes(it.id))
              .map((it: any) => it.petLevel ?? 1);
            if (lvls.length) lvl = Math.max(...lvls);
          }
        } catch {
          // ignore — fall back to client value below
        }
      }
      if (lvl <= 1) lvl = Math.max(1, Math.min(50, Number(opponentLevel) || 1));
      lvl = Math.max(1, Math.min(50, lvl));
      const WIN_COINS = 15 + Math.floor(lvl * 2);

      // ── Difficulty → BP table ───────────────────────────────────
      // Winners earn BP based on how tough their opponent was, computed
      // server-side from the saved attack-power totals so a client can't
      // claim "hard" for an "easy" fight.
      //
      //   easy     (player ≥ ~1.25× opponent power) → +4
      //   balanced (anywhere in between)            → +9
      //   hard     (player ≤ ~0.80× opponent power) → +12
      //
      // Losers get 0 BP (no negative scoring). The opponent who *won by
      // default* (because the attacker lost) gets a flat +5 BP credited
      // to their own ledger via a synthetic pvp_battles row, so the
      // leaderboard reflects passive defensive wins too.
      let difficulty: "easy" | "balanced" | "hard" = "balanced";
      try {
        const myGroup = await storage.getBattleGroup(user.id);
        const myPower = myGroup?.attackPower ?? 0;
        const oppGroup = opponentUserId ? await storage.getBattleGroup(String(opponentUserId)) : null;
        const oppPower = oppGroup?.attackPower ?? 0;
        if (oppPower > 0 && myPower > 0) {
          if (myPower >= oppPower * 1.25) difficulty = "easy";
          else if (myPower <= oppPower * 0.8) difficulty = "hard";
          else difficulty = "balanced";
        }
      } catch {
        // fall through with "balanced" — safe default
      }
      const winBp = difficulty === "easy" ? 4 : difficulty === "hard" ? 12 : 9;

      // Coin rewards have been removed from PvP — battle points are now
      // the sole win currency. We still compute WIN_COINS above so the
      // existing pvp_battles row schema stays satisfied and any analytics
      // that referenced opponentLevel-driven payouts keep working, but we
      // explicitly zero out the actual coin grant here.
      void WIN_COINS;
      const coinsEarned = 0;
      const battlePointsDelta = result === "win" ? winBp : 0;

      // Credit the defender +5 BP if the attacker lost. This is a synthetic
      // pvp_battles row attributed to the opponent so it shows up on the
      // leaderboard the same way as any other win. We deliberately do NOT
      // grant coins or trigger mood penalties on this side — it's a passive
      // defensive credit.
      //
      // Authz/integrity: refuse to credit the *attacker* themselves (self-BP
      // farm) and require the opponent to be a real user with a saved
      // battle group. Without this, a modified client could submit
      // {result:"loss", opponentUserId:<self>} per ticket to net +5 BP.
      if (result === "loss" && opponentUserId && String(opponentUserId) !== String(user.id)) {
        try {
          const oppUser = await storage.getUser(String(opponentUserId));
          const oppGrp = await storage.getBattleGroup(String(opponentUserId));
          if (oppUser && oppGrp && (oppGrp.petInventoryIds?.length ?? 0) > 0) {
            await storage.createPvpBattle({
              userId: String(opponentUserId),
              opponentName: user.username || "Challenger",
              opponentImageUrl: null,
              opponentLevel: lvl,
              opponentSkill: null,
              result: "win",
              coinsEarned: 0,
              battlePointsDelta: 5,
            });
          }
        } catch (e) {
          console.warn("PvP defender BP credit failed:", e);
        }
      }

      // PvP loss → bruise the active pet's mood (drops mood by 12, caps it
      // at BATTLE_DEFEAT_MOOD_CAP for the next BATTLE_DEFEAT_RECENT_MINUTES
      // via applyPetTimeDecay).
      if (result === "loss") {
        try {
          const fullUser = await storage.getUser(user.id);
          const activeId = fullUser?.activePetId;
          if (activeId) {
            const activePet = await storage.getInventoryItemById(activeId);
            if (activePet && activePet.userId === user.id) {
              const newMood = Math.max(0, (activePet.petMood ?? 100) - 3);
              await storage.updateInventoryItem(activeId, {
                petMood: newMood,
                lastBattleDefeatAt: new Date(),
                petStatsUpdatedAt: new Date(),
              } as any);
            }
          }
        } catch (e) {
          console.warn("PvP loss mood penalty failed:", e);
        }
      }

      const battle = await storage.createPvpBattle({
        userId: user.id,
        opponentName,
        opponentImageUrl: opponentImageUrl || null,
        opponentLevel: lvl,
        opponentSkill: opponentSkill || null,
        result,
        coinsEarned,
        battlePointsDelta,
      });

      // Award brawler badges on PvP wins (fire-and-forget — never block the response)
      if (result === "win") {
        storage.countPvpWins(user.id)
          .then((totalWins) => maybeAwardBrawlerBadges(user.id, totalWins))
          .catch(() => {});
      }

      return res.json({ battle, coinsEarned, battlePointsDelta });
    } catch (err) {
      console.error("PvP result error:", err);
      return res.status(500).json({ message: "Failed to record result" });
    }
  });

  // Spend one PvP ticket and "lock in" a battle attempt. Called by the
  // client right before launching the battle screen so we charge the player
  // win or lose. Returns 402 if the player has no tickets so the client can
  // show a friendly "out of tickets" message.
  app.post("/api/pvp/start", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      // Atomic spend-ticket + issue-token. If anything inside the
      // transaction fails (e.g. battle-token table missing on a fresh
      // deploy), the whole thing rolls back so the player keeps their
      // ticket. This is the bug we hit when the player saw "couldn't
      // start the match" but the ticket was still consumed.
      const result = await storage.startPvpBattleAtomic(user.id);
      if (!result.ok) {
        return res.status(402).json({ message: "No PvP tickets", ticketsRemaining: 0 });
      }
      return res.json({ ticketsRemaining: result.ticketsRemaining, battleToken: result.token });
    } catch (err) {
      console.error("PvP start error:", err);
      return res.status(500).json({ message: "Failed to start battle" });
    }
  });

  // Current player's PvP ticket count (sum of inventory stacks).
  app.get("/api/pvp/tickets", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const count = await storage.getPvpTicketCount(user.id);
      return res.json({ count });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  // ── PvP Ticket Shop ──────────────────────────────────────────────────
  // Buy PvP tickets in bundles using in-game coins. The price map is
  // server-authoritative so the client cannot fake a cheaper bundle by
  // posting a different price. Coins are deducted atomically (same
  // pattern as the regular shop buy endpoint) so a race with another
  // request can never overdraw the player's balance.
  const PVP_TICKET_BUNDLES: Record<string, { tickets: number; cost: number }> = {
    "1":  { tickets: 1,  cost: 50 },
    "3":  { tickets: 3,  cost: 250 },
    "6":  { tickets: 6,  cost: 500 },
    "15": { tickets: 15, cost: 1250 },
  };

  app.get("/api/pvp/tickets/bundles", isAuthenticated, async (_req: Request, res: Response) => {
    return res.json({
      bundles: Object.entries(PVP_TICKET_BUNDLES).map(([id, b]) => ({ id, tickets: b.tickets, cost: b.cost })),
    });
  });

  app.post("/api/pvp/tickets/buy", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const bundleId = String(req.body?.bundleId ?? "");
      const bundle = PVP_TICKET_BUNDLES[bundleId];
      if (!bundle) {
        return res.status(400).json({ message: "Invalid bundle" });
      }

      // PvP ticket shop item UUID, seeded in server/index.ts.
      // Resolved by id (rather than scanning a world's items) so the
      // lookup is a single index hit and stays correct even if the
      // ticket is later moved between worlds.
      const PVP_TICKET_ID = "a1b2c3d4-9001-4000-8000-000000000099";
      const ticketItem = await storage.getShopItem(PVP_TICKET_ID);
      if (!ticketItem || ticketItem.specialType !== "pvp_ticket") {
        return res.status(500).json({ message: "Ticket item not configured" });
      }

      // Single transactional call: deducts coins AND credits tickets in
      // one DB transaction with a SQL-side atomic increment, so the
      // player can never be charged without receiving the tickets and
      // two concurrent purchases can never lose-update each other's
      // ticket increment. Returns null only if the player can't afford
      // the bundle (the coin deduct's `coins >= cost` guard fails).
      // Cap: players may hold at most 100 PvP tickets at once.
      // Players who already have >100 (pre-cap legacy balance) keep
      // their existing count but cannot purchase more until they drop
      // below 100. Checked here so the limit is server-authoritative
      // and cannot be bypassed by a modified client.
      const PVP_TICKET_CAP = 100;
      const currentTicketCount = await storage.getPvpTicketCount(user.id);
      if (currentTicketCount >= PVP_TICKET_CAP) {
        return res.status(400).json({ message: "You've reached the 100 PvP ticket limit. Use your tickets in battle to free up space." });
      }
      if (currentTicketCount + bundle.tickets > PVP_TICKET_CAP) {
        return res.status(400).json({ message: `That bundle would exceed the 100 ticket limit. You have ${currentTicketCount} tickets — try a smaller bundle.` });
      }

      const result = await storage.purchasePvpTicketBundleAtomic(
        user.id,
        ticketItem.id,
        bundle.cost,
        bundle.tickets,
      );
      if (!result) {
        return res.status(400).json({ message: "Not enough coins" });
      }

      const safeUser = publicAccount(result.user);
      return res.json({
        user: safeUser,
        ticketsAdded: bundle.tickets,
        ticketsRemaining: result.ticketsRemaining,
        cost: bundle.cost,
      });
    } catch (err) {
      console.error("PvP ticket buy error:", err);
      return res.status(500).json({ message: "Failed to buy tickets" });
    }
  });

  // Get battle history for the logged-in user
  app.get("/api/pvp/history", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const battles = await storage.getPvpBattlesByUser(user.id, 30);
      return res.json(battles);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  // Global PvP leaderboard. Returns the top 50 ranked players AND the
  // requesting user's own rank/entry so the client can show their position
  // even when they're outside the top 50. Players past rank 50 are still
  // tracked in pvp_battles — they just don't render on the public board.
  app.get("/api/pvp/leaderboard", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const all = await storage.getPvpLeaderboardFull();
      // Send the top 100 so the client can render a dropdown view of the
      // full top-100 board while still defaulting to top-10. The "me"
      // block always reports the player's full rank across the entire
      // ranked pool — even when they're outside the top 100.
      const top = all.slice(0, 100);
      const myIdx = all.findIndex((e) => e.userId === user.id);
      let me: any = null;
      if (myIdx >= 0) {
        me = { rank: myIdx + 1, entry: all[myIdx], inTop: myIdx < 100, hidden: false };
      } else {
        // User is excluded from the public board (admin / moderator /
        // reserved alias). They still get to see THEIR OWN tracked
        // BP / W / L — we just report rank as null so the Rank panel
        // can render "N/A" instead of a number.
        const stats = await storage.getUserPvpStats(user.id);
        // Pull their own saved battle group so the hidden Rank-panel
        // entry can mirror the leaderboard rows (which now show ATK
        // alongside BP). Falls back to 0 when the user hasn't built a
        // group yet.
        const ownGroup = await storage.getBattleGroup(user.id);
        me = {
          rank: null,
          entry: {
            userId: user.id,
            username: user.username || "You",
            profileImage: user.profileImage ?? null,
            battlePoints: stats.battlePoints,
            wins: stats.wins,
            losses: stats.losses,
            attackPower: ownGroup?.attackPower ?? 0,
            isAdmin: !!user.isAdmin,
            isModerator: !!user.isModerator,
            isBot: false,
          },
          inTop: false,
          hidden: true,
        };
      }
      return res.json({ top, me, totalRanked: all.length });
    } catch (err) {
      console.error("PvP leaderboard error:", err);
      return res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // Get current user's battle group
  app.get("/api/pvp/battle-group", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const group = await storage.getBattleGroup(user.id);
      return res.json(group ?? { petInventoryIds: [] });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch battle group" });
    }
  });

  // Save current user's battle group (up to 5 pets)
  app.post("/api/pvp/battle-group", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { petInventoryIds } = req.body;
      if (!Array.isArray(petInventoryIds)) return res.status(400).json({ message: "petInventoryIds must be an array" });
      const ids = petInventoryIds.slice(0, 5);
      const group = await storage.upsertBattleGroup(user.id, ids);
      return res.json(group);
    } catch (err) {
      return res.status(500).json({ message: "Failed to save battle group" });
    }
  });

  // Get all players who have battle groups set up (for opponent selection)
  app.get("/api/pvp/opponents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const all = await storage.getAllBattleGroupsWithUsers();
      // Exclude current user, bots, and groups without pets.
      const others = all.filter((g: any) => g.userId !== user.id && !g.isBot && g.petInventoryIds?.length > 0);

      // Matchmaking: match real players by ATK band.
      // ±35% first; widen to ±60% if empty; fall back to all players.
      const myGroup = await storage.getBattleGroup(user.id);
      const myPower: number = myGroup?.attackPower ?? 0;

      const inBand = (pool: any[], band: number) => {
        if (myPower <= 0) return pool.slice();
        const lo = myPower * (1 - band);
        const hi = myPower * (1 + band);
        return pool.filter((g: any) => {
          const p = g.attackPower ?? 0;
          return p >= lo && p <= hi;
        });
      };

      let matched: any[] = inBand(others, 0.35);
      if (matched.length === 0) matched = inBand(others, 0.60);
      if (matched.length === 0) matched = others.slice();
      return res.json(matched);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch opponents" });
    }
  });

  // Get a specific user's full inventory with pet details (for building opponent battle group)
  app.get("/api/pvp/opponent-pets/:userId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params as Record<string, string>;
      const group = await storage.getBattleGroup(userId);
      if (!group) return res.json([]);

      const invItems = await storage.getUserInventoryWithItems(userId);
      const petIds = group.petInventoryIds || [];

      const pets = petIds.map((invId: string) => {
        const row = invItems.find((r: any) => r.inventory.id === invId);
        if (!row) return null;
        return { ...row.inventory, ...row.shopItem, shopItem: row.shopItem, inventoryId: row.inventory.id };
      }).filter(Boolean);

      return res.json(pets);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch opponent pets" });
    }
  });


}
