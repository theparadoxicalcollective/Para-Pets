import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import {
  BEAU_PRIZE_WHEEL_LOSS_SLOT,
  BEAU_PRIZE_WHEEL_PAID_COST,
  BEAU_PRIZE_WHEEL_PRIZE_SLOTS,
  BEAU_PRIZE_WHEEL_SLOT_COUNT,
  DEFAULT_BEAU_WHEEL_LAYOUT,
  beauWheelLayoutFrom,
  type BeauWheelLayout,
  type BeauPrizeConfig,
  type BeauPrizeKind,
  type BeauPrizeView,
} from "@shared/beauPrizeWheel";

type Executor = { execute(statement: any): Promise<{ rows: any[] }> };
type WheelDatabase = Pick<typeof db, "transaction">;

interface BeauCatalogItem {
  id: string;
  name: string;
  type: string;
  image_url: string | null;
  egg_image_url: string | null;
  rarity: number | null;
  star_rarity: number | null;
}

const SETTING_KEY = "beau_prize_wheel_prizes_v1";
const LAYOUT_SETTING_KEY = "beau_prize_wheel_layout_v1";
const MAX_CURRENCY_REWARD = 1_000_000;
const MAX_EXP_REWARD = 100_000;
const COIN_IMAGE = "/world-assets/icon_coin.png";
const ESSENCE_IMAGE = "/world-assets/Photoroom_20260709_23958_PM_1783626016795.png";
const LOSS_IMAGE = "/world-assets/Photoroom_20260705_103527_PM_1783426783499.png";
const SKULL_BONUS_AMOUNT = 100;

export class BeauPrizeWheelError extends Error {
  constructor(
    public code: "invalid_request" | "not_configured" | "insufficient_coins" | "active_pet_required" | "player_not_found",
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function gameDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function requireAmount(value: unknown, max: number): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > max) {
    throw new BeauPrizeWheelError("invalid_request", 400, "Prize amount must be a positive whole number.");
  }
  return amount;
}

export function parseBeauPrizeDraft(value: unknown, slot: number): BeauPrizeConfig {
  if (!Number.isInteger(slot) || slot < 0 || slot >= BEAU_PRIZE_WHEEL_PRIZE_SLOTS) {
    throw new BeauPrizeWheelError("invalid_request", 400, "Choose one of Beau's seven prize sections.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BeauPrizeWheelError("invalid_request", 400, "Choose a prize for this wheel section.");
  }
  const row = value as any;
  const kind = String(row.kind ?? "") as BeauPrizeKind;
  if (!["coins", "essence", "exp", "item", "egg"].includes(kind)) {
    throw new BeauPrizeWheelError("invalid_request", 400, "Choose coins, essence, EXP, an item, or a pet egg.");
  }
  if (kind === "coins" || kind === "essence") {
    return { slot, kind, amount: requireAmount(row.amount, MAX_CURRENCY_REWARD) };
  }
  if (kind === "exp") {
    return { slot, kind, amount: requireAmount(row.amount, MAX_EXP_REWARD) };
  }
  const shopItemId = typeof row.shopItemId === "string" ? row.shopItemId.trim() : "";
  if (!shopItemId || shopItemId.length > 100) {
    throw new BeauPrizeWheelError("invalid_request", 400, "Choose a valid catalog prize.");
  }
  return { slot, kind, shopItemId };
}

export function parseBeauWheelLayout(value: unknown): BeauWheelLayout {
  const layout = beauWheelLayoutFrom(value);
  if (!layout) throw new BeauPrizeWheelError("invalid_request", 400, "Keep the prize wheel within Beau's artwork.");
  return layout;
}

async function readBeauWheelLayout(executor: Executor): Promise<BeauWheelLayout> {
  const result = await executor.execute(sql`SELECT value FROM game_settings WHERE key = ${LAYOUT_SETTING_KEY} LIMIT 1`);
  if (!result.rows[0]) return DEFAULT_BEAU_WHEEL_LAYOUT;
  try {
    return parseBeauWheelLayout(JSON.parse(String((result.rows[0] as any).value)));
  } catch {
    return DEFAULT_BEAU_WHEEL_LAYOUT;
  }
}

export async function saveBeauWheelLayout(value: unknown): Promise<BeauWheelLayout> {
  const layout = parseBeauWheelLayout(value);
  await db.execute(sql`
    INSERT INTO game_settings (key, value) VALUES (${LAYOUT_SETTING_KEY}, ${JSON.stringify(layout)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `);
  return layout;
}

function parseStoredPrize(value: unknown, slot: number): BeauPrizeConfig | null {
  try {
    return parseBeauPrizeDraft(value, slot);
  } catch {
    return null;
  }
}

async function readStoredSlots(executor: Executor): Promise<Array<BeauPrizeConfig | null>> {
  const result = await executor.execute(sql`
    SELECT value FROM game_settings WHERE key = ${SETTING_KEY} LIMIT 1
  `);
  if (!result.rows[0]) return Array.from({ length: BEAU_PRIZE_WHEEL_PRIZE_SLOTS }, () => null);
  try {
    const parsed = JSON.parse(String((result.rows[0] as any).value));
    if (!Array.isArray(parsed)) throw new Error("invalid wheel config");
    return Array.from({ length: BEAU_PRIZE_WHEEL_PRIZE_SLOTS }, (_, slot) => parseStoredPrize(parsed[slot], slot));
  } catch {
    return Array.from({ length: BEAU_PRIZE_WHEEL_PRIZE_SLOTS }, () => null);
  }
}

function currencyView(config: BeauPrizeConfig): BeauPrizeView {
  const amount = Number(config.amount ?? 0);
  if (config.kind === "coins") {
    return { slot: config.slot, configured: true, kind: config.kind, label: amount.toLocaleString() + " Coins", imageUrl: COIN_IMAGE, amount, shopItemId: null };
  }
  if (config.kind === "essence") {
    return { slot: config.slot, configured: true, kind: config.kind, label: amount.toLocaleString() + " Essence", imageUrl: ESSENCE_IMAGE, amount, shopItemId: null };
  }
  return { slot: config.slot, configured: true, kind: config.kind, label: amount.toLocaleString() + " EXP", imageUrl: null, amount, shopItemId: null };
}

interface ResolvedWheel {
  configs: Array<BeauPrizeConfig | null>;
  slots: BeauPrizeView[];
  ready: boolean;
  requiresActivePet: boolean;
}

async function readBeauPrizeCatalog(executor: Executor): Promise<{ items: BeauCatalogItem[]; eggs: BeauCatalogItem[] }> {
  const result = await executor.execute(sql`
    SELECT id, name, type, image_url, egg_image_url, rarity, star_rarity
    FROM shop_items
    WHERE type <> 'npc'
      AND (type <> 'pet' OR COALESCE(egg_image_url, '') <> '')
    ORDER BY name, id
  `);
  const rows = result.rows as BeauCatalogItem[];
  return {
    items: rows.filter(item => item.type !== "pet"),
    eggs: rows.filter(item => item.type === "pet"),
  };
}

async function resolveWheel(executor: Executor): Promise<ResolvedWheel> {
  const [stored, options] = await Promise.all([
    readStoredSlots(executor),
    readBeauPrizeCatalog(executor),
  ]);
  const items = new Map(options.items.map(item => [item.id, item] as const));
  const eggs = new Map(options.eggs.map(item => [item.id, item] as const));
  const configs: Array<BeauPrizeConfig | null> = [];
  const slots: BeauPrizeView[] = [];

  for (let slot = 0; slot < BEAU_PRIZE_WHEEL_PRIZE_SLOTS; slot++) {
    const config = stored[slot];
    if (!config) {
      configs.push(null);
      slots.push({ slot, configured: false, kind: null, label: "Set Prize", imageUrl: null, amount: null, shopItemId: null });
      continue;
    }
    if (config.kind === "coins" || config.kind === "essence" || config.kind === "exp") {
      configs.push(config);
      slots.push(currencyView(config));
      continue;
    }
    const item = (config.kind === "egg" ? eggs : items).get(String(config.shopItemId));
    if (!item) {
      configs.push(null);
      slots.push({ slot, configured: false, kind: null, label: "Prize unavailable", imageUrl: null, amount: null, shopItemId: null });
      continue;
    }
    configs.push(config);
    slots.push({
      slot,
      configured: true,
      kind: config.kind,
      label: item.name,
      imageUrl: config.kind === "egg" ? item.egg_image_url : item.image_url,
      amount: 1,
      shopItemId: item.id,
    });
  }

  slots.push({
    slot: BEAU_PRIZE_WHEEL_LOSS_SLOT,
    configured: true,
    kind: "loss",
    label: "Skull Bonus",
    imageUrl: LOSS_IMAGE,
    amount: null,
    shopItemId: null,
  });

  return {
    configs,
    slots,
    ready: configs.length === BEAU_PRIZE_WHEEL_PRIZE_SLOTS && configs.every(Boolean),
    // The fixed skull section always grants 100 EXP to the active pet.
    requiresActivePet: true,
  };
}

export async function getBeauPrizeOptions(executor: Executor = db as unknown as Executor) {
  const options = await readBeauPrizeCatalog(executor);
  const mapItem = (item: BeauCatalogItem, egg: boolean) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    imageUrl: egg ? item.egg_image_url : item.image_url,
    rarity: Number(item.star_rarity ?? item.rarity ?? 1),
  });
  return {
    items: options.items.map(item => mapItem(item, false)),
    eggs: options.eggs.map(item => mapItem(item, true)),
  };
}

async function validateCatalogPrize(executor: Executor, config: BeauPrizeConfig): Promise<void> {
  if (config.kind !== "item" && config.kind !== "egg") return;
  const options = await readBeauPrizeCatalog(executor);
  const allowed = config.kind === "egg" ? options.eggs : options.items;
  if (!allowed.some(item => item.id === config.shopItemId)) {
    throw new BeauPrizeWheelError("invalid_request", 400, "That prize is no longer available. Choose another one.");
  }
}

export async function saveBeauPrizeSlot(slot: number, input: unknown): Promise<void> {
  const config = parseBeauPrizeDraft(input, slot);
  await db.transaction(async tx => {
    const executor = tx as unknown as Executor;
    await validateCatalogPrize(executor, config);
    const stored = await readStoredSlots(executor);
    stored[slot] = config;
    await executor.execute(sql`
      INSERT INTO game_settings (key, value)
      VALUES (${SETTING_KEY}, ${JSON.stringify(stored)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);
  });
}

export async function clearBeauPrizeSlot(slot: number): Promise<void> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= BEAU_PRIZE_WHEEL_PRIZE_SLOTS) {
    throw new BeauPrizeWheelError("invalid_request", 400, "Choose one of Beau's seven prize sections.");
  }
  await db.transaction(async tx => {
    const executor = tx as unknown as Executor;
    const stored = await readStoredSlots(executor);
    stored[slot] = null;
    await executor.execute(sql`
      INSERT INTO game_settings (key, value)
      VALUES (${SETTING_KEY}, ${JSON.stringify(stored)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);
  });
}

async function activePetStatus(executor: Executor, userId: string) {
  const result = await executor.execute(sql`
    SELECT u.active_pet_id,
           ui.is_hatched,
           COALESCE(NULLIF(ui.pet_nickname, ''), si.name) AS pet_name
    FROM users u
    LEFT JOIN user_inventory ui ON ui.id = u.active_pet_id AND ui.user_id = u.id
    LEFT JOIN shop_items si ON si.id = ui.shop_item_id
    WHERE u.id = ${userId}
    LIMIT 1
  `);
  const row = result.rows[0] as any;
  return {
    activePetReady: Boolean(row?.active_pet_id && row?.is_hatched === true),
    activePetName: row?.pet_name ? String(row.pet_name) : null,
  };
}

export async function getBeauPrizeWheelState(userId: string) {
  const [wheel, userResult, spinResult, pet, layout] = await Promise.all([
    resolveWheel(db as unknown as Executor),
    db.execute(sql`SELECT coins, essence FROM users WHERE id = ${userId} LIMIT 1`),
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM beau_prize_wheel_spins
      WHERE user_id = ${userId} AND spin_day = ${gameDate()}::date
    `),
    activePetStatus(db as unknown as Executor, userId),
    readBeauWheelLayout(db as unknown as Executor),
  ]);
  const user = userResult.rows[0] as any;
  if (!user) throw new BeauPrizeWheelError("player_not_found", 404, "Player not found.");
  const alreadySpunToday = Number((spinResult.rows[0] as any)?.count ?? 0) > 0;
  return {
    ready: wheel.ready,
    slots: wheel.slots,
    layout,
    requiresActivePet: wheel.requiresActivePet,
    ...pet,
    balances: { coins: Number(user.coins ?? 0), essence: Number(user.essence ?? 0) },
    freeSpinAvailable: !alreadySpunToday,
    nextSpinCost: alreadySpunToday ? BEAU_PRIZE_WHEEL_PAID_COST : 0,
  };
}

function xpForLevel(level: number): number {
  return Math.floor(100 + level * 30 + level * level * 5);
}

function applyPetXp(currentLevel: number, currentPoints: number, pointsToAdd: number) {
  let totalPoints = currentPoints + pointsToAdd;
  let newLevel = currentLevel;
  while (newLevel < 100) {
    const needed = xpForLevel(newLevel);
    if (totalPoints < needed) break;
    totalPoints -= needed;
    newLevel++;
  }
  if (newLevel >= 100) totalPoints = 0;
  return { newLevel, newPoints: totalPoints };
}

async function grantInventoryPrize(executor: Executor, userId: string, config: BeauPrizeConfig): Promise<void> {
  const result = await executor.execute(sql`
    SELECT id, name, type, image_url, egg_image_url, fishing_type, pole_max_uses
    FROM shop_items
    WHERE id = ${config.shopItemId}
    LIMIT 1
  `);
  const item = result.rows[0] as any;
  if (!item) throw new BeauPrizeWheelError("not_configured", 409, "One of Beau's prizes is no longer available.");

  if (config.kind === "egg") {
    if (item.type !== "pet" || !item.egg_image_url) throw new BeauPrizeWheelError("not_configured", 409, "One of Beau's egg prizes is no longer available.");
    await executor.execute(sql`
      INSERT INTO user_inventory (user_id, shop_item_id, quantity, is_hatched, hatch_started_at)
      VALUES (${userId}, ${item.id}, 1, false, NOW())
    `);
    return;
  }

  if (item.type === "pet") throw new BeauPrizeWheelError("not_configured", 409, "Pet prizes must be configured as eggs.");
  const isDurablePole = item.type === "fishing" && item.fishing_type === "pole";
  if (isDurablePole) {
    const uses = Number(item.pole_max_uses);
    await executor.execute(sql`
      INSERT INTO user_inventory (user_id, shop_item_id, quantity, pole_uses_left)
      VALUES (${userId}, ${item.id}, 1, ${Number.isFinite(uses) && uses > 0 ? uses : null})
    `);
    return;
  }

  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId})::int, hashtext(${String(item.id)})::int)`);
  const updated = await executor.execute(sql`
    UPDATE user_inventory
    SET quantity = COALESCE(quantity, 0) + 1
    WHERE id = (
      SELECT id FROM user_inventory
      WHERE user_id = ${userId} AND shop_item_id = ${item.id}
      ORDER BY acquired_at ASC NULLS FIRST
      LIMIT 1
    )
    RETURNING id
  `);
  if (!updated.rows[0]) {
    await executor.execute(sql`
      INSERT INTO user_inventory (user_id, shop_item_id, quantity)
      VALUES (${userId}, ${item.id}, 1)
    `);
  }
}

async function grantReward(executor: Executor, userId: string, config: BeauPrizeConfig, view: BeauPrizeView) {
  if (config.kind === "coins") {
    const amount = Number(config.amount);
    await executor.execute(sql`
      UPDATE users
      SET coins = coins + ${amount},
          total_coins_earned = total_coins_earned + ${amount}
      WHERE id = ${userId}
    `);
    return { ...view, message: "Beau paid out " + amount.toLocaleString() + " coins!" };
  }
  if (config.kind === "essence") {
    const amount = Number(config.amount);
    await executor.execute(sql`
      UPDATE users SET essence = COALESCE(essence, 0) + ${amount}
      WHERE id = ${userId}
    `);
    return { ...view, message: "You won " + amount.toLocaleString() + " essence!" };
  }
  if (config.kind === "exp") {
    const amount = Number(config.amount);
    const petResult = await executor.execute(sql`
      SELECT ui.id, ui.pet_level, ui.pet_level_points,
             COALESCE(NULLIF(ui.pet_nickname, ''), si.name) AS pet_name
      FROM users u
      JOIN user_inventory ui ON ui.id = u.active_pet_id AND ui.user_id = u.id
      JOIN shop_items si ON si.id = ui.shop_item_id
      WHERE u.id = ${userId} AND ui.is_hatched = true
      FOR UPDATE
    `);
    const pet = petResult.rows[0] as any;
    if (!pet) throw new BeauPrizeWheelError("active_pet_required", 409, "Set a hatched pet as active before spinning Beau's wheel because every spin can land on the 100 EXP skull bonus.");
    const previousLevel = Number(pet.pet_level ?? 1);
    const next = applyPetXp(previousLevel, Number(pet.pet_level_points ?? 0), amount);
    await executor.execute(sql`
      UPDATE user_inventory
      SET pet_level = ${next.newLevel}, pet_level_points = ${next.newPoints}
      WHERE id = ${pet.id} AND user_id = ${userId}
    `);
    return {
      ...view,
      petName: String(pet.pet_name ?? "Active Pet"),
      newLevel: next.newLevel,
      levelsGained: Math.max(0, next.newLevel - previousLevel),
      message: String(pet.pet_name ?? "Your active pet") + " gained " + amount.toLocaleString() + " EXP!",
    };
  }

  await grantInventoryPrize(executor, userId, config);
  return {
    ...view,
    message: config.kind === "egg" ? "You won a " + view.label + " egg!" : "You won " + view.label + "!",
  };
}

async function grantSkullBonus(executor: Executor, userId: string, slotIndex: number) {
  await executor.execute(sql`
    UPDATE users
    SET coins = coins + ${SKULL_BONUS_AMOUNT},
        essence = COALESCE(essence, 0) + ${SKULL_BONUS_AMOUNT},
        total_coins_earned = total_coins_earned + ${SKULL_BONUS_AMOUNT}
    WHERE id = ${userId}
  `);

  const skullView: BeauPrizeView = {
    slot: slotIndex,
    configured: true,
    kind: "loss",
    label: "Skull Bonus",
    imageUrl: LOSS_IMAGE,
    amount: null,
    shopItemId: null,
  };
  const petReward = await grantReward(
    executor,
    userId,
    { slot: slotIndex, kind: "exp", amount: SKULL_BONUS_AMOUNT },
    skullView,
  );
  const petName = "petName" in petReward && petReward.petName
    ? String(petReward.petName)
    : "your active pet";
  return {
    ...petReward,
    bonusCoins: SKULL_BONUS_AMOUNT,
    bonusEssence: SKULL_BONUS_AMOUNT,
    bonusExp: SKULL_BONUS_AMOUNT,
    message: `Skull bonus! +${SKULL_BONUS_AMOUNT} coins, +${SKULL_BONUS_AMOUNT} essence, and ${petName} gained ${SKULL_BONUS_AMOUNT} EXP!`,
  };
}

function validActionId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function spinBeauPrizeWheel(
  userId: string,
  actionId: unknown,
  database: WheelDatabase = db,
  randomInt: (max: number) => number = crypto.randomInt,
) {
  if (!validActionId(actionId)) {
    throw new BeauPrizeWheelError("invalid_request", 400, "Invalid spin request.");
  }
  const day = gameDate();

  return database.transaction(async tx => {
    const executor = tx as unknown as Executor;
    const existingResult = await executor.execute(sql`
      SELECT user_id, response
      FROM beau_prize_wheel_spins
      WHERE action_id = ${actionId}::uuid
      LIMIT 1
    `);
    const existing = existingResult.rows[0] as any;
    if (existing) {
      if (String(existing.user_id) !== userId) throw new BeauPrizeWheelError("invalid_request", 409, "Spin request already belongs to another player.");
      return typeof existing.response === "string" ? JSON.parse(existing.response) : existing.response;
    }

    const userResult = await executor.execute(sql`
      SELECT id, coins, essence, active_pet_id
      FROM users
      WHERE id = ${userId}
      FOR UPDATE
    `);
    const user = userResult.rows[0] as any;
    if (!user) throw new BeauPrizeWheelError("player_not_found", 404, "Player not found.");

    const wheel = await resolveWheel(executor);
    if (!wheel.ready) throw new BeauPrizeWheelError("not_configured", 409, "Beau's wheel is not ready yet.");

    if (wheel.requiresActivePet) {
      const pet = await activePetStatus(executor, userId);
      if (!pet.activePetReady) {
        throw new BeauPrizeWheelError("active_pet_required", 409, "Set a hatched pet as active before spinning Beau's wheel while EXP is a possible prize.");
      }
    }

    const todayResult = await executor.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM beau_prize_wheel_spins
      WHERE user_id = ${userId} AND spin_day = ${day}::date
    `);
    const wasFree = Number((todayResult.rows[0] as any)?.count ?? 0) === 0;
    const cost = wasFree ? 0 : BEAU_PRIZE_WHEEL_PAID_COST;
    if (Number(user.coins ?? 0) < cost) {
      throw new BeauPrizeWheelError("insufficient_coins", 409, "You need " + BEAU_PRIZE_WHEEL_PAID_COST.toLocaleString() + " coins for another spin.");
    }
    if (cost > 0) {
      await executor.execute(sql`UPDATE users SET coins = coins - ${cost} WHERE id = ${userId}`);
    }

    const slotIndex = randomInt(BEAU_PRIZE_WHEEL_SLOT_COUNT);
    let reward: any;
    if (slotIndex === BEAU_PRIZE_WHEEL_LOSS_SLOT) {
      reward = await grantSkullBonus(executor, userId, slotIndex);
    } else {
      const config = wheel.configs[slotIndex];
      const view = wheel.slots[slotIndex];
      if (!config || !view?.configured) throw new BeauPrizeWheelError("not_configured", 409, "Beau's wheel configuration changed. Please reopen it.");
      reward = await grantReward(executor, userId, config, view);
    }

    const balancesResult = await executor.execute(sql`
      SELECT coins, essence FROM users WHERE id = ${userId} LIMIT 1
    `);
    const balancesRow = balancesResult.rows[0] as any;
    const response = {
      slotIndex,
      wasFree,
      cost,
      reward,
      balances: {
        coins: Number(balancesRow?.coins ?? 0),
        essence: Number(balancesRow?.essence ?? 0),
      },
      freeSpinAvailable: false,
      nextSpinCost: BEAU_PRIZE_WHEEL_PAID_COST,
    };

    await executor.execute(sql`
      INSERT INTO beau_prize_wheel_spins
        (action_id, user_id, spin_day, was_free, coin_cost, slot_index, reward, response)
      VALUES
        (${actionId}::uuid, ${userId}, ${day}::date, ${wasFree}, ${cost}, ${slotIndex}, ${JSON.stringify(reward)}::jsonb, ${JSON.stringify(response)}::jsonb)
    `);

    return response;
  });
}
