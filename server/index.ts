import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { pool, db } from "./db";
import { sql } from "drizzle-orm";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import fs from "fs";
import path from "path";

const app = express();
app.set('trust proxy', 1);
app.disable('etag');
const httpServer = createServer(app);
const PgSession = connectPgSimple(session);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    passport: { user: string };
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || "para-pets-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      let user = await storage.getUserByUsername(username);
      if (!user && username.includes("@")) {
        user = await storage.getUserByEmail(username);
      }
      if (!user) {
        return done(null, false, { message: "Invalid username or password" });
      }
      if (user.isBanned) {
        return done(null, false, { message: "This account has been banished from the realm" });
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return done(null, false, { message: "Invalid username or password" });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

app.use(passport.initialize());
app.use(passport.session());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use("/world-assets", express.static(path.join(process.cwd(), "attached_assets"), {
  etag: true,
  lastModified: true,
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      ) WITH (OIDS=FALSE);
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
  } catch (err) {
    console.error("Session table setup error (non-fatal):", err);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => { log(`serving on port ${port}`); });

  // All heavy seeding/refresh runs in the background — does NOT block requests
  (async () => {
  // Schema migrations must run first, before any seeding
  try {
    await db.execute(sql`ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS bait_rarity_boost_star INTEGER`);
  } catch (err) {
    console.error("bait_rarity_boost_star migration error (non-fatal):", err);
  }

  try {
    await db.execute(sql`ALTER TABLE pet_templates ADD COLUMN IF NOT EXISTS facing TEXT DEFAULT 'front'`);
  } catch (err) {
    console.error("pet_templates facing migration error (non-fatal):", err);
  }

  try {
    console.log('Initializing Stripe...');
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      await runMigrations({ databaseUrl, schema: 'stripe' });
      const stripeSync = await getStripeSync();
      const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const webhookResult = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      console.log('Stripe webhook configured:', webhookResult?.webhook?.url || 'ok');
      stripeSync.syncBackfill()
        .then(() => console.log('Stripe data synced'))
        .catch((err: any) => console.error('Stripe sync error:', err));
    }
  } catch (err) {
    console.error('Stripe init error (non-fatal):', err);
  }

  const DEFAULT_WORLDS = [
    { id: "sky_realm", name: "Sky Realm", posX: 45, posY: 3, glowColor: "#ffd700" },
    { id: "snowy_mountain", name: "Frostpeak", posX: 5, posY: 15, glowColor: "#88ccff" },
    { id: "enchanted_grove", name: "Enchanted Grove", posX: 60, posY: 18, glowColor: "#7fffd4" },
    { id: "island", name: "Lost Island", posX: 3, posY: 38, glowColor: "#20b2aa" },
    { id: "volcanic", name: "Volcanic Isle", posX: 56, posY: 40, glowColor: "#ff4500" },
    { id: "desert", name: "Scorched Desert", posX: 25, posY: 54, glowColor: "#daa520" },
    { id: "swamp", name: "Elysian Bayou", posX: 62, posY: 62, glowColor: "#9370db" },
    { id: "haunted_woods", name: "Haunted Woods", posX: 15, posY: 74, glowColor: "#8b008b" },
  ];
  for (const w of DEFAULT_WORLDS) {
    const existing = await storage.getWorld(w.id);
    if (!existing) {
      await storage.createWorld({ ...w, isDefault: true });
    } else {
      await storage.updateWorld(w.id, { name: w.name });
    }
  }

  function loadAssetBase64(filename: string): string | null {
    const assetPath = path.join(process.cwd(), "attached_assets", filename);
    if (!fs.existsSync(assetPath)) return null;
    const buf = fs.readFileSync(assetPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  }

  // Always refresh all world backgrounds — served as static files under /world-assets/
  const WORLD_BG_ASSETS: Record<string, string> = {
    swamp: "bg_swamp_map.png",
    snowy_mountain: "bg_snowy_mountain_map.png",
    sky_realm: "bg_sky_realm_map.png",
    volcanic: "bg_volcanic_map.png",
    haunted_woods: "bg_haunted_woods_map.png",
    enchanted_grove: "bg_enchanted_grove_map.png",
    island: "bg_island_map.png",
    desert: "bg_desert_map.png",
  };
  for (const [worldId, filename] of Object.entries(WORLD_BG_ASSETS)) {
    try {
      const assetPath = path.join(process.cwd(), "attached_assets", filename);
      if (fs.existsSync(assetPath)) {
        const mtime = fs.statSync(assetPath).mtimeMs;
        const v = Math.floor(mtime / 1000);
        const bgUrl = `/world-assets/${filename}?v=${v}`;
        await storage.updateWorld(worldId, { bgUrl } as any);
        console.log(`${worldId} background refreshed.`);
      }
    } catch (err) {
      console.error(`Background refresh error for ${worldId} (non-fatal):`, err);
    }
  }

  try {
    const swampLocations = await storage.getWorldLocations("swamp");

    const THICKET_ID = "3e20ad30-faff-4643-9e80-5e5f30010738";
    const thicketLoc = swampLocations.find(l => l.id === THICKET_ID);
    if (thicketLoc && thicketLoc.name === "Testing") {
      console.log("Migrating Testing -> Thicket...");
      const iconData = loadAssetBase64("icon_thicket.png");
      const bgData = loadAssetBase64("bg_thicket.png");
      await storage.updateWorldLocation(THICKET_ID, {
        name: "Thicket",
        description: "A dense cluster of dark, twisted trees deep in the swamp.",
        ...(iconData ? { iconUrl: iconData } : {}),
        ...(bgData ? { bgUrl: bgData } : {}),
      } as any);

      const existingEnemies = await storage.getLocationEnemies(THICKET_ID);
      for (const e of existingEnemies) {
        await storage.deleteLocationEnemy(e.id);
      }

      const enemyData = [
        { name: "Bog Toad", file: "enemy_bog_toad.png", isBoss: false, coinReward: 1 },
        { name: "Mud Lurker", file: "enemy_mud_lurker.png", isBoss: false, coinReward: 1 },
        { name: "Swamp Wisp", file: "enemy_wisp.png", isBoss: false, coinReward: 1 },
        { name: "Elder Treant", file: "enemy_elder_treant.png", isBoss: true, coinReward: 3 },
      ];
      for (const ed of enemyData) {
        const imgData = loadAssetBase64(ed.file);
        await storage.createLocationEnemy({
          locationId: THICKET_ID,
          name: ed.name,
          imageUrl: imgData,
          isBoss: ed.isBoss,
          coinReward: ed.coinReward,
        });
      }
      console.log("Thicket migration complete");
    }

    // Always ensure Thicket is battle type
    if (thicketLoc && thicketLoc.type !== "battle") {
      await storage.updateWorldLocation(THICKET_ID, { type: "battle" } as any);
      console.log("Thicket type set to battle.");
    }
    // Always refresh Thicket icon from file so trimmed version is used
    if (thicketLoc) {
      const thicketIcon = loadAssetBase64("icon_thicket.png");
      if (thicketIcon) {
        await storage.updateWorldLocation(THICKET_ID, { iconUrl: thicketIcon } as any);
        console.log("Thicket icon refreshed.");
      }
    }

    const SHOP_ID = "97ff55d1-376b-466a-8fe9-992b09dbaacc";
    const shopLoc = swampLocations.find(l => l.id === SHOP_ID);
    if (shopLoc && shopLoc.name === "Shop Test") {
      console.log("Migrating Shop Test -> General Shop...");
      const shopIcon = loadAssetBase64("icon_mire_bazaar.png");
      await storage.updateWorldLocation(SHOP_ID, {
        name: "General Shop",
        description: "A rickety potion shop perched on stilts above the murky swamp waters.",
        ...(shopIcon ? { iconUrl: shopIcon } : {}),
      } as any);
      console.log("General Shop migration complete");
    }
    // Refresh General Shop background and icon from assets (do not overwrite admin-editable name)
    const mireBazaarBg = loadAssetBase64("bg_mire_bazaar.png");
    if (mireBazaarBg) {
      await storage.updateWorldLocation(SHOP_ID, { bgUrl: mireBazaarBg } as any);
      console.log("General Shop background refreshed.");
    }
    const mireBazaarIcon = loadAssetBase64("icon_mire_bazaar.png");
    if (mireBazaarIcon) {
      const shopLocFresh = swampLocations.find(l => l.id === SHOP_ID);
      const iconUpdate: any = { iconUrl: mireBazaarIcon };
      if (!shopLocFresh?.iconSize || shopLocFresh.iconSize < 300) iconUpdate.iconSize = 350;
      await storage.updateWorldLocation(SHOP_ID, iconUpdate as any);
      console.log("General Shop icon refreshed.");
    }

    const NEW_SWAMP_LOCATIONS = [
      {
        id: "a1b2c3d4-0001-4000-8000-000000000001",
        name: "Murk Cave",
        description: "A mysterious cavern deep in the swamp, filled with glowing crystals and ancient magic.",
        iconFile: "icon_murk_cave.png",
        bgFile: "bg_murk_cave.png",
        posX: 12,
        posY: 35,
        glowColor: "#7b4fc9",
        sortOrder: 3,
      },
      {
        id: "a1b2c3d4-0002-4000-8000-000000000002",
        name: "Willowmere",
        description: "An ancient magical swamp tree humming with old power, its twisted branches draped in glowing moss.",
        iconFile: "icon_willowmere_cottage.png",
        bgFile: "bg_willowmere_cottage.png",
        posX: 65,
        posY: 22,
        glowColor: "#6aab5e",
        sortOrder: 4,
      },
      {
        id: "a1b2c3d4-0004-4000-8000-000000000004",
        name: "The Tome & Toad",
        description: "A peculiar bookstore floating above the mire, stocked with rare spells and swamp lore.",
        iconFile: "icon_tome_toad.png",
        bgFile: "bg_tome_toad.png",
        posX: 35,
        posY: 48,
        glowColor: "#9b5de5",
        sortOrder: 6,
        isShop: true,
      },
      {
        id: "a1b2c3d4-0005-4000-8000-000000000005",
        name: "Swamp Critters",
        description: "A magical pet emporium brimming with exotic swamp creatures and enchanted companions.",
        iconFile: "icon_swamp_critters.png",
        bgFile: "bg_swamp_critters.png",
        posX: 10,
        posY: 60,
        glowColor: "#3dc7a0",
        sortOrder: 7,
        isShop: true,
      },
      {
        id: "a1b2c3d4-0006-4000-8000-000000000006",
        name: "The Mossy Cauldron",
        description: "A beloved swamp tavern where adventurers gather, warm brews bubble, and tales are told.",
        iconFile: "icon_mossy_cauldron.png",
        bgFile: "bg_mossy_cauldron.png",
        posX: 60,
        posY: 65,
        glowColor: "#c9a84c",
        sortOrder: 8,
      },
      {
        id: "a1b2c3d4-0007-4000-8000-000000000007",
        name: "FishingRipples",
        description: "A shimmering magical pond deep in the swamp, its glowing waters said to hold ancient secrets.",
        iconFile: "icon_myst_pond_v2.png",
        bgFile: "bg_myst_pond.png",
        posX: 38,
        posY: 70,
        glowColor: "#3dc7c0",
        sortOrder: 9,
        type: "fishing",
      },
      {
        id: "a1b2c3d4-0008-4000-8000-000000000008",
        name: "The Soggy Hook",
        description: "A ramshackle fishing shack perched on stilts above the swamp, stocked with rods, bait, and all manner of magical fishing gear.",
        iconFile: "icon_fishing_shack.png",
        bgFile: "bg_soggy_hook_v1.png",
        posX: 75,
        posY: 58,
        glowColor: "#3dc7c0",
        sortOrder: 10,
        isShop: true,
      },
    ];

    const deletedRaw = await storage.getGameSetting("deleted_seed_location_ids");
    const deletedSeedIds: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];

    // One-time migration: fix seed locations whose isShop/type defaults were wrong before this fix
    const isShopMigrationDone = await storage.getGameSetting("seed_isShop_migration_v2");
    if (!isShopMigrationDone) {
      for (const loc of NEW_SWAMP_LOCATIONS) {
        if (deletedSeedIds.includes(loc.id)) continue;
        const existing = swampLocations.find(l => l.id === loc.id);
        if (existing) {
          const patch: any = {};
          if ((loc as any).isShop === true && !existing.isShop) patch.isShop = true;
          if ((loc as any).type && (existing as any).type !== (loc as any).type) patch.type = (loc as any).type;
          if (Object.keys(patch).length > 0) {
            await storage.updateWorldLocation(loc.id, patch);
            console.log(`${loc.name} seed defaults corrected:`, patch);
          }
        }
      }
      await storage.setGameSetting("seed_isShop_migration_v2", "done");
    }

    for (const loc of NEW_SWAMP_LOCATIONS) {
      if (deletedSeedIds.includes(loc.id)) continue;
      const existing = swampLocations.find(l => l.id === loc.id);
      const iconData = loadAssetBase64(loc.iconFile);
      const bgData = loadAssetBase64(loc.bgFile);
      if (!existing) {
        console.log(`Creating new swamp location: ${loc.name}`);
        await storage.createWorldLocation({
          id: loc.id,
          worldId: "swamp",
          name: loc.name,
          type: "none",
          description: loc.description,
          posX: loc.posX,
          posY: loc.posY,
          glowColor: loc.glowColor,
          sortOrder: loc.sortOrder,
          isShop: (loc as any).isShop ?? false,
          iconSize: 350,
          ...(iconData ? { iconUrl: iconData } : {}),
          ...(bgData ? { bgUrl: bgData } : {}),
        } as any);
        console.log(`${loc.name} created.`);
      } else {
        // Only refresh asset files — never overwrite admin-editable fields (name, description, type, isShop, glowColor)
        const updates: any = {};
        if (iconData) updates.iconUrl = iconData;
        if (bgData) updates.bgUrl = bgData;
        if (!existing.iconSize || existing.iconSize < 300) updates.iconSize = 350;
        if (Object.keys(updates).length > 0) {
          await storage.updateWorldLocation(loc.id, updates);
        }
        console.log(`${loc.name} refreshed.`);
      }
    }

    // One-time: apply the Bayou's Heart background image (admin-created location, not in seed list)
    const bayousHeartBgDone = await storage.getGameSetting("bayous_heart_bg_v1");
    if (!bayousHeartBgDone) {
      const BAYOUS_HEART_ID = "8e211716-0448-496e-8582-6ce1025ac4e4";
      const bayousHeartBgData = loadAssetBase64("bg_bayous_heart.png");
      if (bayousHeartBgData) {
        const allSwampLocs = await storage.getWorldLocations("swamp");
        const bayousHeart = allSwampLocs.find((l: any) => l.id === BAYOUS_HEART_ID);
        if (bayousHeart) {
          await storage.updateWorldLocation(BAYOUS_HEART_ID, { bgUrl: bayousHeartBgData });
          console.log("Bayou's Heart background applied.");
        }
      }
      await storage.setGameSetting("bayous_heart_bg_v1", "done");
    }

    // One-time: ensure Bayou's Heart type is "explore" (not "battle")
    const bayousHeartTypeDone = await storage.getGameSetting("bayous_heart_type_explore_v1");
    if (!bayousHeartTypeDone) {
      const BAYOUS_HEART_ID = "8e211716-0448-496e-8582-6ce1025ac4e4";
      const allSwampLocs = await storage.getWorldLocations("swamp");
      const bayousHeart = allSwampLocs.find((l: any) => l.id === BAYOUS_HEART_ID);
      if (bayousHeart && (bayousHeart as any).type !== "explore") {
        await storage.updateWorldLocation(BAYOUS_HEART_ID, { type: "explore" });
        console.log("Bayou's Heart type set to explore.");
      }
      await storage.setGameSetting("bayous_heart_type_explore_v1", "done");
    }

    // One-time: update Bayou's Heart type to "quest"
    const bayousHeartQuestDone = await storage.getGameSetting("bayous_heart_type_quest_v1");
    if (!bayousHeartQuestDone) {
      const BAYOUS_HEART_ID = "8e211716-0448-496e-8582-6ce1025ac4e4";
      const allSwampLocs = await storage.getWorldLocations("swamp");
      const bayousHeart = allSwampLocs.find((l: any) => l.id === BAYOUS_HEART_ID);
      if (bayousHeart && (bayousHeart as any).type !== "quest") {
        await storage.updateWorldLocation(BAYOUS_HEART_ID, { type: "quest" });
        console.log("Bayou's Heart type set to quest.");
      }
      await storage.setGameSetting("bayous_heart_type_quest_v1", "done");
    }

    // Seed Murk Cave enemies (one-time)
    const murkEnemiesDone = await storage.getGameSetting("murk_cave_enemies_v1");
    if (!murkEnemiesDone) {
      const MURK_CAVE_ID = "a1b2c3d4-0001-4000-8000-000000000001";
      const murkEnemyData = [
        { name: "Hex Frog",          file: "generated_images/enemy_hex_frog.png",          isBoss: false, coinReward: 2 },
        { name: "Bayou Wraith",      file: "generated_images/enemy_bayou_wraith.png",       isBoss: false, coinReward: 2 },
        { name: "Cave Wisp",         file: "generated_images/enemy_cave_wisp.png",          isBoss: false, coinReward: 2 },
        { name: "Bog Serpent Queen", file: "generated_images/enemy_bog_serpent_queen.png",  isBoss: true,  coinReward: 5 },
      ];
      for (const ed of murkEnemyData) {
        const imgData = loadAssetBase64(ed.file);
        await storage.createLocationEnemy({
          locationId: MURK_CAVE_ID,
          name: ed.name,
          imageUrl: imgData,
          isBoss: ed.isBoss,
          coinReward: ed.coinReward,
        });
      }
      await storage.setGameSetting("murk_cave_enemies_v1", "done");
      console.log("Murk Cave enemies seeded.");
    }
  } catch (err) {
    console.error("Swamp location migration error (non-fatal):", err);
  }

  // One-time seed: The Soggy Hook bait items
  try {
    const baitSeeded = await storage.getGameSetting("soggy_hook_bait_v2");
    if (!baitSeeded) {
      const baitItems = [
        {
          name: "Swamp Crawler",
          price: 60,
          imageFile: "bait_swamp_crawler.png",
          baitCatchBoost: 0,
          rarityBoostPercent: 25,
        },
        {
          name: "Ghost Shrimp Lure",
          price: 85,
          imageFile: "bait_ghost_shrimp.png",
          baitCatchBoost: 30,
          rarityBoostPercent: 0,
        },
        {
          name: "Hex Bayou Lure",
          price: 150,
          imageFile: "bait_hex_lure.png",
          baitCatchBoost: 20,
          rarityBoostPercent: 35,
        },
      ];
      for (const b of baitItems) {
        const imgData = loadAssetBase64(b.imageFile);
        await storage.createShopItem({
          name: b.name,
          price: b.price,
          type: "fishing",
          fishingType: "bait",
          worldId: "all",
          locationId: null,
          imageUrl: imgData,
          baitCatchBoost: b.baitCatchBoost,
          rarityBoostPercent: b.rarityBoostPercent,
          rarity: null,
          hatchTime: null,
          statBoostType: null,
          statBoostAmount: null,
          eggImageUrl: null,
          hatchedImageUrl: null,
          specialSkill: null,
          healthRestored: null,
          manaRestored: null,
          petsRevived: null,
          atkBoost: null,
          defBoost: null,
        });
        console.log(`Seeded bait item: ${b.name}`);
      }
      await storage.setGameSetting("soggy_hook_bait_v2", "done");
      console.log("Bait items seeded (unassigned).");
    }
  } catch (err) {
    console.error("Bait item seeding error (non-fatal):", err);
  }

  // One-time cleanup: remove the admin test pole if it still exists
  try {
    await storage.deleteShopItem("00000000-0000-0000-0000-admin0000pole");
    console.log("Admin test pole removed.");
  } catch (_) { /* already gone */ }

  // Migration: unassign bait items that were previously hardcoded to the Soggy Hook
  try {
    const baitUnassigned = await storage.getGameSetting("bait_unassign_v1");
    if (!baitUnassigned) {
      await db.execute(sql`
        UPDATE shop_items
        SET location_id = NULL
        WHERE fishing_type = 'bait'
          AND type = 'fishing'
          AND location_id IS NOT NULL
      `);
      await storage.setGameSetting("bait_unassign_v1", "done");
      console.log("Bait items unassigned from fixed locations.");
    }
  } catch (err) {
    console.error("Bait unassign migration error (non-fatal):", err);
  }

  // Migration: add daily_reward_coins column to badges and seed Founder's Badge reward
  try {
    const badgeRewardMigrated = await storage.getGameSetting("badge_daily_reward_coins_v1");
    if (!badgeRewardMigrated) {
      await db.execute(sql`ALTER TABLE badges ADD COLUMN IF NOT EXISTS daily_reward_coins INTEGER`);
      await db.execute(sql`
        UPDATE badges SET daily_reward_coins = 100
        WHERE LOWER(name) LIKE '%founder%' AND daily_reward_coins IS NULL
      `);
      await storage.setGameSetting("badge_daily_reward_coins_v1", "done");
      console.log("Badge daily_reward_coins migration complete.");
    }
  } catch (err) {
    console.error("Badge reward migration error (non-fatal):", err);
  }

  // Migration: update Swamp Crawler bait image — v2 uses regenerated borderless art
  try {
    const swampCrawlerFixed = await storage.getGameSetting("swamp_crawler_bg_removed_v2");
    if (!swampCrawlerFixed) {
      const newImg = loadAssetBase64("bait_swamp_crawler.png");
      if (newImg) {
        await db.execute(sql`
          UPDATE shop_items
          SET image_url = ${newImg}
          WHERE name = 'Swamp Crawler' AND fishing_type = 'bait'
        `);
        console.log("Swamp Crawler bait image updated (borderless v2).");
      }
      await storage.setGameSetting("swamp_crawler_bg_removed_v2", "done");
    }
  } catch (err) {
    console.error("Swamp Crawler image migration error (non-fatal):", err);
  }

  // ── Seed door backgrounds from attached assets ──────────────────────────
  try {
    const doorRows = ((await db.execute(sql`SELECT id, name, bg_url FROM kc_doors WHERE world_id = 'pet_world'`)) as any).rows as any[];
    const DOOR_BG_SEEDS: Array<{ match: string; file: string; mime: string }> = [
      { match: "welcome", file: "bg_welcome_center.jpeg", mime: "image/jpeg" },
    ];
    const seededIds: string[] = [];
    for (const seed of DOOR_BG_SEEDS) {
      const door = doorRows.find((d: any) =>
        typeof d.name === "string" && d.name.toLowerCase().includes(seed.match)
      );
      if (!door) continue;
      const assetPath = path.join(process.cwd(), "attached_assets", seed.file);
      if (!fs.existsSync(assetPath)) continue;
      const buf = fs.readFileSync(assetPath);
      const dataUrl = `data:${seed.mime};base64,${buf.toString("base64")}`;
      await db.execute(sql`UPDATE kc_doors SET bg_url = ${dataUrl} WHERE id = ${door.id}`);
      seededIds.push(door.id);
      console.log(`${door.name} door background seeded.`);
    }
    // Clear any manually-set backgrounds on doors not covered by seeds
    for (const door of doorRows) {
      if (!seededIds.includes(door.id) && door.bg_url) {
        await db.execute(sql`UPDATE kc_doors SET bg_url = NULL WHERE id = ${door.id}`);
        console.log(`${door.name} door background cleared.`);
      }
    }
  } catch (err) {
    console.error("Door background seed error (non-fatal):", err);
  }

  console.log("Background initialization complete.");
  })().catch(err => console.error("Background init error:", err));
})();
