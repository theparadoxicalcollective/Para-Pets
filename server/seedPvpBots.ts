/**
 * PvP Bot seeder.
 *
 * Creates 5 persistent bot opponents so a player can battle right away even
 * when no other humans have set up their team yet. Bots:
 *   - have `isBot=true` so they're excluded from public leaderboards (Hall
 *     of Earnings, Devotion, PvP) but still surface in opponent matchmaking
 *     because matchmaking only filters by attack power, not bot-status.
 *   - own 5 hatched pets each, with stats following the in-game progression
 *     (base 50/50 atk/def, 1000 hp at level 1; per-level growth roughly
 *     mirrors the rate a real player would see by spending 3 power-up slots
 *     per level on a rarity-3+ pet).
 *   - span 5 difficulty tiers so a player encounters varied attack power
 *     across opponent rerolls.
 *
 * The seeder is idempotent: it bails early if 5 or more `isBot` users
 * already exist. To force a re-seed, delete the bot users (and their
 * inventory + battle group rows) first.
 */
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { users, userInventory, shopItems } from "@shared/schema";
import { storage } from "./storage";

type BotTier = {
  username: string;
  // Lower & upper bound for each pet's level. The seeder picks a level in
  // this range per pet so the team has internal variety.
  levelMin: number;
  levelMax: number;
  // Per-level stat gains roughly = how a real player would build this pet:
  //   atk gain  = atk power-up "items" * 10
  //   def gain  = def power-up "items" * 10
  //   hp gain   = health power-up "items" * 100   (Enchanted Berry = +100)
  // The three numbers below should sum to ~3 per level (rarity 3+ slots),
  // matching the in-game cap of 3 stat power-ups per level.
  atkPerLevel: number;
  defPerLevel: number;
  healthPerLevel: number;
};

// Five tiers, low→high. Approximate computed attack power (sum of
// atk + def/2 + level*5 across 5 pets) for the midpoint of each tier:
//   Tier 1 ≈ 600   |   Tier 2 ≈ 1200   |   Tier 3 ≈ 2000
//   Tier 4 ≈ 3000  |   Tier 5 ≈ 4200
const BOT_TIERS: BotTier[] = [
  { username: "Sparrow_Recruit",   levelMin: 3,  levelMax: 6,  atkPerLevel: 1.2, defPerLevel: 1.0, healthPerLevel: 0.8 },
  { username: "Glade_Wanderer",    levelMin: 8,  levelMax: 12, atkPerLevel: 1.3, defPerLevel: 1.0, healthPerLevel: 0.7 },
  { username: "Mossheart_Knight",  levelMin: 14, levelMax: 19, atkPerLevel: 1.4, defPerLevel: 1.0, healthPerLevel: 0.6 },
  { username: "Ember_Stormcaller", levelMin: 22, levelMax: 28, atkPerLevel: 1.5, defPerLevel: 1.0, healthPerLevel: 0.5 },
  { username: "Veridian_Wraith",   levelMin: 32, levelMax: 40, atkPerLevel: 1.5, defPerLevel: 1.1, healthPerLevel: 0.4 },
];

const BOT_PETS_PER_TEAM = 5;

// Cute-but-generic nicknames the seeder cycles through. Keeping them short
// so they fit in the slot tooltip on the arena page.
const PET_NICKNAMES = [
  "Bramble", "Wisp", "Pebble", "Nimbus", "Thorn",
  "Cinder", "Fern", "Echo", "Hazel", "Quill",
  "Onyx", "Sable", "Pip", "Aspen", "Briar",
  "Drift", "Slate", "Vesper", "Wren", "Yarrow",
  "Ash", "Juniper", "Moss", "Reed", "Sage",
];

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickNickname(usedNames: Set<string>): string {
  const pool = PET_NICKNAMES.filter(n => !usedNames.has(n));
  const choice = pool[rand(0, pool.length - 1)] ?? `Pet${rand(100, 999)}`;
  usedNames.add(choice);
  return choice;
}

/**
 * Build a single pet's stat block at a given level. Mirrors the in-game
 * progression: a player who hatched a pet and spent every available slot
 * across the first N levels would land somewhere near these numbers.
 *
 * The base stats (50/50 atk/def, 1000 hp at level 1) match the schema
 * defaults in `userInventory`.
 */
function buildPetStats(tier: BotTier, level: number) {
  const levelGains = level - 1;
  // Spread per-level gains over `levelGains` levels, with a small ±15% jitter
  // so each pet feels hand-built rather than a clone.
  const jitter = (n: number) => Math.max(0, Math.round(n * (0.85 + Math.random() * 0.30)));
  const atk = 50 + jitter(tier.atkPerLevel * 10 * levelGains);
  const def = 50 + jitter(tier.defPerLevel * 10 * levelGains);
  const health = 1000 + jitter(tier.healthPerLevel * 100 * levelGains);
  return { atk, def, health };
}

/**
 * Idempotently create bot users + their pets + their battle groups.
 * Safe to call on every server boot — exits fast if bots already exist.
 */
export async function seedPvpBots(): Promise<void> {
  // Need at least one pet shop item to attach inventory rows to. Bots use
  // whatever the first pet shop item is. If admins haven't created any pets
  // yet, skip silently — bots without a pet template render as a paw icon
  // anyway, but having no shop item to FK against would hard-fail the insert.
  const [petShopItem] = await db
    .select({ id: shopItems.id })
    .from(shopItems)
    .where(eq(shopItems.type, "pet"))
    .limit(1);
  if (!petShopItem) {
    console.log("[seedPvpBots] no pet shop items found; skipping bot seed");
    return;
  }

  // No top-level early-return: we always reconcile each named bot's user
  // row, pets, and battle group so a previous half-failed seed self-heals
  // on the next boot. Each per-tier branch below is cheap if the row
  // already exists (one indexed read).

  const placeholderHash = await bcrypt.hash(
    `bot-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    10,
  );

  for (const tier of BOT_TIERS) {
    // Find or create the bot user. We re-run pet/battle-group setup even
    // when the user already exists so a partially-failed previous seed
    // (e.g. user + pets created but battle group save failed) self-heals
    // on the next boot.
    let [botUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, tier.username), eq(users.isBot, true)))
      .limit(1);

    if (!botUser) {
      [botUser] = await db
        .insert(users)
        .values({
          username: tier.username,
          // Email namespaced under .invalid so it can never collide with a
          // real registration.
          email: `${tier.username.toLowerCase()}@bot.parapets.invalid`,
          password: placeholderHash,
          isBot: true,
          coins: 0,
        })
        .returning({ id: users.id });
    }

    // Find existing pets the previous seed may have created. If we already
    // have BOT_PETS_PER_TEAM, re-use them. Otherwise build a fresh team.
    const existingPets = await db
      .select({ id: userInventory.id })
      .from(userInventory)
      .where(eq(userInventory.userId, botUser.id));

    let petInventoryIds: string[] = existingPets.map(p => p.id);
    if (petInventoryIds.length < BOT_PETS_PER_TEAM) {
      const usedNicks = new Set<string>();
      const need = BOT_PETS_PER_TEAM - petInventoryIds.length;
      for (let i = 0; i < need; i++) {
        const level = rand(tier.levelMin, tier.levelMax);
        const { atk, def, health } = buildPetStats(tier, level);
        const [petRow] = await db
          .insert(userInventory)
          .values({
            userId: botUser.id,
            shopItemId: petShopItem.id,
            isHatched: true,
            petLevel: level,
            petAtk: atk,
            petDef: def,
            petHealth: health,
            petNickname: pickNickname(usedNicks),
          })
          .returning({ id: userInventory.id });
        petInventoryIds.push(petRow.id);
      }
    }

    // Always (re-)upsert the battle group. upsertBattleGroup recomputes
    // attackPower from live pet stats so matchmaking sees the bot at the
    // right tier even if the previous run left things half-saved.
    await storage.upsertBattleGroup(botUser.id, petInventoryIds.slice(0, BOT_PETS_PER_TEAM));
  }

  console.log("[seedPvpBots] done");
}
