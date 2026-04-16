import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes, backfillAdvancedAcquisitionBadge, backfillCoinPurchaseEarnings, syncTotalCoinsEarnedFloor } from "./routes";
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
import rateLimit from "express-rate-limit";

const app = express();
app.set('trust proxy', 1);
app.disable('etag');

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Brute-force protection: only login + register need strict limits
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later." },
});

// General API — safety net against runaway clients.
// 600/min = 10 req/s: comfortably above normal gameplay bursts (fishing, combat)
// while still catching truly broken clients.
// Logout is explicitly excluded so it can never be blocked.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please slow down." },
  skip: (req) => req.method === "POST" && req.path === "/auth/logout",
});

app.use("/api/auth/login",    loginLimiter);
app.use("/api/auth/register", loginLimiter);
app.use("/api", apiLimiter);
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
        if (user.banUntil && new Date(user.banUntil) <= new Date()) {
          await storage.unbanUser(user.id);
        } else {
          const expiry = user.banUntil ? ` until ${new Date(user.banUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : "";
          return done(null, false, { message: `This account has been banished from the realm${expiry}.` });
        }
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
  maxAge: "7d",
  immutable: false,
  setHeaders(res, filePath) {
    // Allow versioned URLs (?v=...) to be cached aggressively; others use revalidation
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  },
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

  // Create media_blobs before routes register so processWorldImage can use it immediately
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS media_blobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        mime_type text NOT NULL,
        data text NOT NULL,
        created_at timestamp DEFAULT now()
      )
    `);
  } catch (err) {
    console.error("media_blobs table setup error (non-fatal):", err);
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
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_messages (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL,
        subject text NOT NULL,
        message text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log("admin_messages table ready.");
  } catch (err) {
    console.error("admin_messages table setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS veridian_watcher_quotes (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        message text NOT NULL,
        added_by varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log("veridian_watcher_quotes table ready.");
  } catch (err) {
    console.error("veridian_watcher_quotes table setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_filter_words (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        word varchar(100) NOT NULL UNIQUE,
        added_by varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log("chat_filter_words table ready.");
  } catch (err) {
    console.error("chat_filter_words table setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS world_chat_messages (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL,
        username varchar NOT NULL,
        profile_image text,
        message text NOT NULL,
        is_bot boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_world_chat_created ON world_chat_messages(created_at)
    `);
    console.log("world_chat_messages table ready.");
  } catch (err) {
    console.error("world_chat_messages table setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS daily_login_rewards (
        day_number integer PRIMARY KEY CHECK (day_number >= 1 AND day_number <= 7),
        coin_amount integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      INSERT INTO daily_login_rewards (day_number, coin_amount) VALUES
        (1, 25),(2, 50),(3, 75),(4, 100),(5, 150),(6, 200),(7, 500)
      ON CONFLICT (day_number) DO NOTHING
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS daily_login_reward_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        day_number integer NOT NULL REFERENCES daily_login_rewards(day_number) ON DELETE CASCADE,
        shop_item_id varchar NOT NULL,
        quantity integer NOT NULL DEFAULT 1,
        UNIQUE (day_number, shop_item_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS player_daily_login_claims (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL,
        cycle_number integer NOT NULL DEFAULT 0,
        day_number integer NOT NULL,
        claimed_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_player_daily_login_user ON player_daily_login_claims(user_id)
    `);
    console.log("daily_login_rewards tables ready.");
  } catch (err) {
    console.error("daily_login_rewards table setup error (non-fatal):", err);
  }

  try {
    console.log('Initializing Stripe...');
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      await runMigrations({ databaseUrl });
      const stripeSync = await getStripeSync();
      const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
      if (replitDomain) {
        const webhookBaseUrl = `https://${replitDomain}`;
        const webhookResult = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        console.log('Stripe webhook configured:', webhookResult?.webhook?.url || 'ok');
      } else {
        console.log('Stripe webhook configured: ok (external webhook secret in use)');
      }
      stripeSync.syncBackfill()
        .then(() => console.log('Stripe data synced'))
        .catch((err: any) => console.error('Stripe sync error:', err));
    }
  } catch (err) {
    console.error('Stripe init error (non-fatal):', err);
  }

  const DEFAULT_WORLDS = [
    { id: "sky_realm",       name: "Sky Realm",       posX: 3,  posY: 5,  glowColor: "#ffd700" },
    { id: "snowy_mountain",  name: "Frostpeak",        posX: 40, posY: 0,  glowColor: "#88ccff" },
    { id: "enchanted_grove", name: "Enchanted Grove",  posX: 1,  posY: 45, glowColor: "#7fffd4" },
    { id: "island",          name: "Lost Island",      posX: 52, posY: 84, glowColor: "#20b2aa" },
    { id: "volcanic",        name: "Volcanic Isle",    posX: 66, posY: 20, glowColor: "#690300" },
    { id: "desert",          name: "Scorched Desert",  posX: 64, posY: 53, glowColor: "#daa520" },
    { id: "swamp",           name: "Elysian Bayou",    posX: 33, posY: 32, glowColor: "#42531d" },
    { id: "haunted_woods",   name: "Haunted Woods",    posX: 10, posY: 75, glowColor: "#8b008b" },
  ];
  for (const w of DEFAULT_WORLDS) {
    const existing = await storage.getWorld(w.id);
    if (!existing) {
      await storage.createWorld({ ...w, isDefault: true });
    } else {
      await storage.updateWorld(w.id, { name: w.name });
    }
  }

  // Re-apply admin-set world positions over whatever the seed just wrote
  const worldPosSnapshot = await storage.getGameSetting("admin_pos_worlds");
  if (worldPosSnapshot) {
    const snap: Array<{ id: string; posX: number; posY: number }> = JSON.parse(worldPosSnapshot);
    for (const s of snap) {
      const exists = await storage.getWorld(s.id);
      if (exists) await storage.updateWorldPosition(s.id, s.posX, s.posY);
    }
    console.log(`Admin world positions restored (${snap.length} worlds).`);
  }

  function loadAssetBase64(filename: string): string | null {
    const assetPath = path.join(process.cwd(), "attached_assets", filename);
    if (!fs.existsSync(assetPath)) return null;
    const buf = fs.readFileSync(assetPath);
    const ext = filename.split(".").pop()?.toLowerCase();
    const mime = ext === "webp" ? "image/webp" : ext === "jpeg" || ext === "jpg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  // Always refresh all world backgrounds — served as static files under /world-assets/
  const WORLD_BG_ASSETS: Record<string, string> = {
    swamp: "bg_swamp_map.webp",
    snowy_mountain: "bg_snowy_mountain_map.webp",
    sky_realm: "bg_sky_realm_map.webp",
    volcanic: "bg_volcanic_map.webp",
    haunted_woods: "bg_haunted_woods_map.webp",
    enchanted_grove: "bg_enchanted_grove_map.webp",
    island: "bg_island_map.webp",
    desert: "bg_desert_map.webp",
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

  // World icons are served as static bundled assets on the frontend (DEFAULT_ICONS in MapPage.tsx).
  // We intentionally keep worlds.icon_url null so the frontend uses the correct static icons.
  // Only admin-uploaded custom icons are stored in icon_url.

  // Always refresh ALL location backgrounds as versioned static URLs on every restart.
  // This ensures:
  //   1. No location bg_url ever stays as a base64 blob (causes huge API responses).
  //   2. All bg_urls have ?v= cache-busting so browsers reload changed files automatically.
  //   3. Self-healing: any rogue base64 overwrite is corrected on next restart.
  const LOC_BG_ALWAYS_REFRESH: Record<string, string> = {
    "3e20ad30-faff-4643-9e80-5e5f30010738": "bg_thicket.webp",
    "97ff55d1-376b-466a-8fe9-992b09dbaacc": "bg_mire_bazaar.webp",
    "8e211716-0448-496e-8582-6ce1025ac4e4": "bg_bayous_heart.webp",
    "a1b2c3d4-0001-4000-8000-000000000001": "bg_murk_cave.webp",
    "a1b2c3d4-0004-4000-8000-000000000004": "bg_tome_toad.webp",
    "a1b2c3d4-0005-4000-8000-000000000005": "bg_swamp_critters.webp",
    "a1b2c3d4-0006-4000-8000-000000000006": "bg_mossy_cauldron.webp",
    "a1b2c3d4-0008-4000-8000-000000000008": "bg_soggy_hook_v1.webp",
    "a1b2c3d4-0002-4000-8000-000000000002": "bg_willowmere_cottage.webp",
  };
  for (const [locId, bgFile] of Object.entries(LOC_BG_ALWAYS_REFRESH)) {
    try {
      const assetPath = path.join(process.cwd(), "attached_assets", bgFile);
      if (!fs.existsSync(assetPath)) continue;
      const mtime = fs.statSync(assetPath).mtimeMs;
      const v = Math.floor(mtime / 1000);
      const bgUrl = `/world-assets/${bgFile}?v=${v}`;
      await db.execute(sql`UPDATE world_locations SET bg_url = ${bgUrl} WHERE id = ${locId} AND (bg_url IS NULL OR bg_url NOT LIKE ${`/world-assets/${bgFile}?v=${v}`})`);
    } catch (err) {
      console.error(`Location bg refresh error for ${locId} (non-fatal):`, err);
    }
  }
  console.log("Location backgrounds refreshed with versioned static URLs.");

  try {
    const swampLocations = await storage.getWorldLocations("swamp");

    const THICKET_ID = "3e20ad30-faff-4643-9e80-5e5f30010738";
    const thicketLoc = swampLocations.find(l => l.id === THICKET_ID);
    if (thicketLoc && thicketLoc.name === "Testing") {
      console.log("Migrating Testing -> Thicket...");
      const iconData = loadAssetBase64("icon_thicket.png");
      const bgData = loadAssetBase64("bg_thicket.webp");
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

    // Restore admin-created locations wiped during Railway migration (one-time, idempotent)
    const missingLocsRestored = await storage.getGameSetting("missing_locs_restore_v1");
    if (!missingLocsRestored) {
      const allSwampForRestore = await storage.getWorldLocations("swamp");

      const generalShopExists = allSwampForRestore.find((l: any) => l.id === "97ff55d1-376b-466a-8fe9-992b09dbaacc");
      if (!generalShopExists) {
        const generalShopIcon = loadAssetBase64("icon_mire_bazaar.png");
        const generalShopBg = loadAssetBase64("bg_mire_bazaar.webp");
        await storage.createWorldLocation({
          id: "97ff55d1-376b-466a-8fe9-992b09dbaacc",
          worldId: "swamp",
          name: "General Shop",
          description: "A rickety potion shop perched on stilts above the murky swamp waters.",
          type: "shop",
          isShop: true,
          posX: 50,
          posY: 45,
          glowColor: "#c9a030",
          sortOrder: 5,
          iconSize: 350,
          ...(generalShopIcon ? { iconUrl: generalShopIcon } : {}),
          ...(generalShopBg ? { bgUrl: generalShopBg } : {}),
        } as any);
        console.log("General Shop restored (was missing from DB).");
      }

      const bayousHeartExists = allSwampForRestore.find((l: any) => l.id === "8e211716-0448-496e-8582-6ce1025ac4e4");
      if (!bayousHeartExists) {
        const bayousHeartIcon = loadAssetBase64("icon_bayous_heart_original.png");
        const bayousHeartBg = loadAssetBase64("bg_bayous_heart.webp");
        await storage.createWorldLocation({
          id: "8e211716-0448-496e-8582-6ce1025ac4e4",
          worldId: "swamp",
          name: "Bayou's Heart",
          description: "The mystical heart of the bayou, pulsing with ancient power and hidden secrets.",
          type: "quest",
          isShop: false,
          posX: 75,
          posY: 80,
          glowColor: "#e05252",
          sortOrder: 11,
          iconSize: 350,
          ...(bayousHeartIcon ? { iconUrl: bayousHeartIcon } : {}),
          ...(bayousHeartBg ? { bgUrl: bayousHeartBg } : {}),
        } as any);
        console.log("Bayou's Heart restored (was missing from DB).");
      }

      await storage.setGameSetting("missing_locs_restore_v1", "done");
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
    // General Shop bg_url is maintained by the LOC_BG_ALWAYS_REFRESH block above (versioned static URL).
    // Refresh icon from asset (do not overwrite admin-editable name)
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
        bgFile: "bg_murk_cave.webp",
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
        bgFile: "bg_willowmere_cottage.webp",
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
        bgFile: "bg_tome_toad.webp",
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
        bgFile: "bg_swamp_critters.webp",
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
        bgFile: "bg_mossy_cauldron.webp",
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
        bgFile: "bg_myst_pond.webp",
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
        bgFile: "bg_soggy_hook_v1.webp",
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

    const assetRefreshDone = await storage.getGameSetting("location_assets_v1");
    for (const loc of NEW_SWAMP_LOCATIONS) {
      if (deletedSeedIds.includes(loc.id)) continue;
      const existing = swampLocations.find(l => l.id === loc.id);
      if (!existing) {
        const iconData = loadAssetBase64(loc.iconFile);
        const bgData = loadAssetBase64(loc.bgFile);
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
      } else if (!assetRefreshDone) {
        // Only refresh asset files — never overwrite admin-editable fields (name, description, type, isShop, glowColor)
        const iconData = loadAssetBase64(loc.iconFile);
        const bgData = loadAssetBase64(loc.bgFile);
        const updates: any = {};
        if (iconData) updates.iconUrl = iconData;
        if (bgData) updates.bgUrl = bgData;
        if (!existing.iconSize || existing.iconSize < 300) updates.iconSize = 350;
        if (Object.keys(updates).length > 0) {
          await storage.updateWorldLocation(loc.id, updates);
        }
        console.log(`${loc.name} refreshed.`);
      } else {
        console.log(`${loc.name} icon refreshed.`);
      }
    }
    if (!assetRefreshDone) {
      await storage.setGameSetting("location_assets_v1", "done");
    }

    // Re-apply admin-set location positions over whatever the seed just wrote
    const allWorldsForRestore = await storage.getAllWorlds();
    for (const w of allWorldsForRestore) {
      const locSnapshot = await storage.getGameSetting(`admin_pos_locs__${w.id}`);
      if (locSnapshot) {
        const snap: Array<{ id: string; posX: number; posY: number }> = JSON.parse(locSnapshot);
        for (const s of snap) {
          await storage.updateWorldLocation(s.id, { posX: s.posX, posY: s.posY });
        }
        console.log(`Admin location positions for ${w.id} restored (${snap.length} locations).`);
      }
    }

    // One-time: apply the Bayou's Heart background image (admin-created location, not in seed list)
    const bayousHeartBgDone = await storage.getGameSetting("bayous_heart_bg_v1");
    if (!bayousHeartBgDone) {
      const BAYOUS_HEART_ID = "8e211716-0448-496e-8582-6ce1025ac4e4";
      const bayousHeartBgData = loadAssetBase64("bg_bayous_heart.webp");
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

    // Migration: reset Bayou's Heart icon to the correct preview version
    const bayousHeartIconDone = await storage.getGameSetting("bayous_heart_icon_v2");
    if (!bayousHeartIconDone) {
      const BAYOUS_HEART_ID = "8e211716-0448-496e-8582-6ce1025ac4e4";
      const correctIcon = loadAssetBase64("icon_bayous_heart_original.png");
      if (correctIcon) {
        await storage.updateWorldLocation(BAYOUS_HEART_ID, { iconUrl: correctIcon } as any);
        console.log("Bayou's Heart icon reset to correct version.");
      }
      await storage.setGameSetting("bayous_heart_icon_v2", "done");
    }

    // Migration: restore Bayou's Heart icon to original from pre-migration backup
    const bayousHeartIconV3Done = await storage.getGameSetting("bayous_heart_icon_v3");
    if (!bayousHeartIconV3Done) {
      const BAYOUS_HEART_ID = "8e211716-0448-496e-8582-6ce1025ac4e4";
      const originalIcon = loadAssetBase64("icon_bayous_heart_original.png");
      if (originalIcon) {
        await storage.updateWorldLocation(BAYOUS_HEART_ID, { iconUrl: originalIcon } as any);
        console.log("Bayou's Heart icon restored to original pre-migration version.");
      }
      await storage.setGameSetting("bayous_heart_icon_v3", "done");
    }

    // Migration: restore world positions and glow colors from pre-migration production backup
    const worldPositionsDone = await storage.getGameSetting("world_positions_restore_v1");
    if (!worldPositionsDone) {
      const BACKUP_WORLD_DATA = [
        { id: "swamp",           posX: 33, posY: 32, glowColor: "#42531d" },
        { id: "snowy_mountain",  posX: 40, posY: 0,  glowColor: "#88ccff" },
        { id: "sky_realm",       posX: 3,  posY: 5,  glowColor: "#ffd700" },
        { id: "volcanic",        posX: 66, posY: 20, glowColor: "#690300" },
        { id: "haunted_woods",   posX: 10, posY: 75, glowColor: "#8b008b" },
        { id: "enchanted_grove", posX: 1,  posY: 45, glowColor: "#7fffd4" },
        { id: "island",          posX: 52, posY: 84, glowColor: "#20b2aa" },
        { id: "desert",          posX: 64, posY: 53, glowColor: "#daa520" },
      ];
      for (const w of BACKUP_WORLD_DATA) {
        await db.execute(sql`
          UPDATE worlds SET pos_x = ${w.posX}, pos_y = ${w.posY}, glow_color = ${w.glowColor}
          WHERE id = ${w.id}
        `);
      }
      // Save as the admin_pos_worlds snapshot so it persists on future restarts
      const posSnapshot = BACKUP_WORLD_DATA.map(w => ({ id: w.id, posX: w.posX, posY: w.posY }));
      await storage.setGameSetting("admin_pos_worlds", JSON.stringify(posSnapshot));
      await storage.setGameSetting("world_positions_restore_v1", "done");
      console.log("World positions restored from pre-migration backup.");
    }

    // Migration: restore world map background from pre-migration production backup
    const mapBgRestoreDone = await storage.getGameSetting("map_background_restore_v1");
    if (!mapBgRestoreDone) {
      const mapBgFile = path.join(process.cwd(), "attached_assets", "bg_world_map.png");
      if (fs.existsSync(mapBgFile)) {
        const mtime = fs.statSync(mapBgFile).mtimeMs;
        const v = Math.floor(mtime / 1000);
        await storage.setGameSetting("map_background", `/world-assets/bg_world_map.png?v=${v}`);
        console.log("World map background restored from pre-migration backup.");
      }
      await storage.setGameSetting("map_background_restore_v1", "done");
    }

    // Migration: remove The Welcome Shop from Keeper's Central (not in original backup)
    const kcWelcomeShopDone = await storage.getGameSetting("kc_welcome_shop_remove_v1");
    if (!kcWelcomeShopDone) {
      const WELCOME_SHOP_ID = "8a26b535-dded-44b1-b83a-1c2f55d8ac7d";
      await db.execute(sql`DELETE FROM world_locations WHERE id = ${WELCOME_SHOP_ID}`);
      await storage.setGameSetting("kc_welcome_shop_remove_v1", "done");
      console.log("The Welcome Shop removed from Keeper's Central.");
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

    // Restore Cave Wisp if it was lost (murk_cave_enemies_v1 may have run before Cave Wisp was defined)
    const caveWispRestored = await storage.getGameSetting("missing_cave_wisp_v1");
    if (!caveWispRestored) {
      const MURK_CAVE_ID = "a1b2c3d4-0001-4000-8000-000000000001";
      const existing = await storage.getLocationEnemies(MURK_CAVE_ID);
      const hasCaveWisp = existing.some((e: any) => e.name === "Cave Wisp");
      if (!hasCaveWisp) {
        const imgData = loadAssetBase64("generated_images/enemy_cave_wisp.png");
        await storage.createLocationEnemy({
          locationId: MURK_CAVE_ID,
          name: "Cave Wisp",
          imageUrl: imgData,
          isBoss: false,
          coinReward: 2,
        });
        console.log("Cave Wisp added to Murk Cave.");
      }
      await storage.setGameSetting("missing_cave_wisp_v1", "done");
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

    // Mark missing_bait_restore_v1 as done without creating items — production bait items
    // are admin-managed (Moss Grub, Enchanted Lure, Mystic Calling) and should not be overwritten.
    const missingBaitRestored = await storage.getGameSetting("missing_bait_restore_v1");
    if (!missingBaitRestored) {
      await storage.setGameSetting("missing_bait_restore_v1", "done");
    }
  } catch (err) {
    console.error("Bait item seeding error (non-fatal):", err);
  }

  // Cleanup: remove old code-seeded bait items that were replaced by admin-managed ones.
  // Safe no-op on production (these items don't exist there); removes duplicates from dev.
  try {
    const baitCleanupDone = await storage.getGameSetting("bait_cleanup_v1");
    if (!baitCleanupDone) {
      await db.execute(sql`
        DELETE FROM shop_items
        WHERE name IN ('Swamp Crawler', 'Ghost Shrimp Lure', 'Hex Bayou Lure')
          AND fishing_type = 'bait'
      `);
      await storage.setGameSetting("bait_cleanup_v1", "done");
      console.log("Old seeded bait items cleaned up.");
    }
  } catch (err) {
    console.error("Bait cleanup error (non-fatal):", err);
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

  // Migration: convert activePetId from shopItemId to inventoryId
  try {
    const activePetMigrated = await storage.getGameSetting("active_pet_id_to_inventory_id_v1");
    if (!activePetMigrated) {
      const usersWithActivePet = ((await db.execute(sql`
        SELECT id, active_pet_id FROM users WHERE active_pet_id IS NOT NULL
      `)) as any).rows as Array<{ id: string; active_pet_id: string }>;

      let converted = 0;
      let cleared = 0;

      for (const u of usersWithActivePet) {
        const currentId = u.active_pet_id;
        // Check if this ID is already a valid inventory item ID (i.e., already migrated)
        const alreadyInv = ((await db.execute(sql`
          SELECT id FROM user_inventory WHERE id = ${currentId} AND user_id = ${u.id} LIMIT 1
        `)) as any).rows as Array<{ id: string }>;
        if (alreadyInv.length > 0) {
          converted++;
          continue;
        }
        // It's still a shopItemId — find the first inventory item for this user with that shopItemId
        const match = ((await db.execute(sql`
          SELECT id FROM user_inventory
          WHERE user_id = ${u.id}
            AND shop_item_id = ${currentId}
          ORDER BY acquired_at ASC
          LIMIT 1
        `)) as any).rows as Array<{ id: string }>;

        if (match.length > 0) {
          await db.execute(sql`UPDATE users SET active_pet_id = ${match[0].id} WHERE id = ${u.id}`);
          converted++;
        } else {
          await db.execute(sql`UPDATE users SET active_pet_id = NULL WHERE id = ${u.id}`);
          cleared++;
        }
      }

      await storage.setGameSetting("active_pet_id_to_inventory_id_v1", "done");
      console.log(`activePetId migration: ${converted} converted, ${cleared} cleared.`);
    }
  } catch (err) {
    console.error("activePetId migration error (non-fatal):", err);
  }

  // ── Seed door backgrounds from attached assets ──────────────────────────
  // Only SETS backgrounds for known doors — never clears manually-set ones.
  try {
    const doorRows = ((await db.execute(sql`SELECT id, name, bg_url FROM kc_doors WHERE world_id = 'pet_world'`)) as any).rows as any[];
    const DOOR_BG_SEEDS: Array<{ match: string; file: string }> = [
      { match: "welcome",  file: "bg_welcome_center.webp"  },
      { match: "cottage",  file: "bg_welcome_center.webp"  },
      { match: "fortune",  file: "bg_well_of_fortune.webp"  },
      { match: "cellar",   file: "bg_market_cellar.webp"    },
    ];
    for (const seed of DOOR_BG_SEEDS) {
      const door = doorRows.find((d: any) =>
        typeof d.name === "string" && d.name.toLowerCase().includes(seed.match)
      );
      if (!door) continue;
      const assetPath = path.join(process.cwd(), "attached_assets", seed.file);
      if (!fs.existsSync(assetPath)) continue;
      const mtime = fs.statSync(assetPath).mtimeMs;
      const v = Math.floor(mtime / 1000);
      const fileUrl = `/world-assets/${seed.file}?v=${v}`;
      // Always refresh so a new asset file and its version are picked up automatically
      await db.execute(sql`UPDATE kc_doors SET bg_url = ${fileUrl} WHERE id = ${door.id}`);
      console.log(`${door.name} door background seeded (${fileUrl}).`);
    }
  } catch (err) {
    console.error("Door background seed error (non-fatal):", err);
  }

  // Migration: restore Elysian Bayou layout to pre-migration state
  // Removes wrongly-recreated locations, restores 6 original fishing spots,
  // populates pond_fish for all fishing locations, and fixes deleted_seed_location_ids.
  try {
    const bayouLayoutDone = await storage.getGameSetting("bayou_layout_restore_v1");
    if (!bayouLayoutDone) {
      // 1. Remove the 3 seed locations that were admin-deleted before migration
      const wrongIds = [
        "a1b2c3d4-0002-4000-8000-000000000002", // Willowmere
        "a1b2c3d4-0006-4000-8000-000000000006", // The Mossy Cauldron
        "a1b2c3d4-0007-4000-8000-000000000007", // FishingRipples
      ];
      for (const id of wrongIds) {
        await storage.deleteWorldLocation(id);
        console.log(`Bayou restore: removed wrongly-recreated location ${id}`);
      }

      // 2. Restore deleted_seed_location_ids from backup so seeder won't re-create them
      const backupDeletedIds = [
        "a1b2c3d4-0002-4000-8000-000000000002",
        "a1b2c3d4-0003-4000-8000-000000000003",
        "a1b2c3d4-0006-4000-8000-000000000006",
        "a1b2c3d4-0007-4000-8000-000000000007",
        "4f20f0d9-ce58-4352-b336-bbd13953f1d4",
        "a942db14-d495-4da0-a894-c93b25214d42",
        "28ba1fb8-7f06-476f-96e0-3880e8a2a142",
        "38b27978-07f0-4b97-bd15-7bb10ce7b088",
        "b1a64e3b-2ced-4f0c-b426-519f4bc2fc29",
        "2552cd0d-5c4b-495d-9e91-a747d2c77f54",
        "1a9ce75c-3b93-40d0-b0fb-6ecd8d239493",
        "55a321e5-7d86-46ca-a0e2-de872b81bacd",
        "d33f82ed-ed29-4f8a-8f03-eece095f8cd1",
        "0be415d3-e6ef-4e9e-859c-e90d4ddeffc1",
        "21df41d7-13a9-4662-a952-fda47c85f9f2",
        "dfab54ba-b62e-418b-afab-6f0f723842f0",
        "ab548ea4-ce02-435c-9fd3-b1d2ae7fcd95",
        "4582fe67-8f80-4012-8cc0-198eeff572de",
        "957c227c-1dfe-4dd3-8307-2e8adabc8df0",
      ];
      await storage.setGameSetting("deleted_seed_location_ids", JSON.stringify(backupDeletedIds));
      console.log("Bayou restore: deleted_seed_location_ids restored from backup.");

      // 3. Restore the 6 original fishing spot locations (from backup, replaced FishingRipples)
      const pondIcon = loadAssetBase64("icon_myst_pond_v2.png");
      const SWAMP_FISHING_SPOTS = [
        { id: "d0538c24-8700-4f36-b0c8-5f551cd9a78f", posX: 32.53, posY: 43.12, iconSize: 100, sortOrder: 44 },
        { id: "6ec73ccd-4501-49dd-b776-9d249810e541", posX: 38.89, posY: 51.87, iconSize: 120, sortOrder: 47 },
        { id: "9d68bca6-4e79-41a7-b172-a4f48e94bfba", posX: 52.59, posY: 36.10, iconSize: 90,  sortOrder: 51 },
        { id: "4824fc13-bbd4-4024-b1d4-1e5a377a5204", posX: 59.20, posY: 74.88, iconSize: 160, sortOrder: 56 },
        { id: "581b3d74-3e1b-4f08-bf3e-50097e78a87b", posX: 83.78, posY: 66.62, iconSize: 160, sortOrder: 66 },
        { id: "4084917e-8665-4330-8b7c-15cf5db30944", posX: 34.53, posY: 32.14, iconSize: 100, sortOrder: 108 },
      ];
      for (const spot of SWAMP_FISHING_SPOTS) {
        const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${spot.id}`);
        if ((existing as any).rows?.length === 0) {
          await db.execute(sql`
            INSERT INTO world_locations (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url)
            VALUES (
              ${spot.id}, 'swamp', 'Fishing Spot', 'fishing',
              'A mystical fishing spot in the bayou.',
              ${spot.posX}, ${spot.posY}, '#3dc7c0', ${spot.iconSize}, ${spot.sortOrder},
              false, ${pondIcon}
            )
          `);
          console.log(`Bayou restore: created Fishing Spot ${spot.id} at (${spot.posX}, ${spot.posY}) size ${spot.iconSize}`);
        }
      }

      // 4. Populate pond_fish for all fishing locations (6 swamp spots + volcanic)
      const ALL_FISH_IDS = [
        "bf49598e-a4da-4281-b209-5c19538a1a34", // Camouflaged Marshland Fish (1★)
        "fffaec70-88c6-4150-a056-998186cbfc87", // Crystal Koi (1★)
        "4c3006d2-a95f-4764-9864-3223f9b1f56e", // Cursed Koi (1★)
        "cb943744-42de-471d-9d0d-47ee3f725dbc", // Ghast Guppy (1★)
        "f6b76285-501a-454a-b7f6-98d93c9708f8", // Golden Sunfish (1★)
        "ae705fe6-1c59-4109-8abf-5147cf760a62", // Grunge Goldfish (1★)
        "7e84601c-c371-46a5-90be-f5a443e8cb7e", // Pleco (1★)
        "c66f251d-f229-47d2-b5b0-841169e82755", // Rainbow Mahi (1★)
        "eaed34c5-3c13-4dc5-8acd-6691f6f8b5f8", // Spectrum Goldfish (1★)
        "0ae3771e-0a5e-4aa1-8979-0ae56aa17102", // Crystal Crab (2★)
        "f2b2c0bf-aacc-48c9-b175-b774fb6d7e05", // Diamond Carp (2★)
        "c7898ee3-c5b8-4c0b-b126-2f6e4224b7e4", // Electric Rock Fish (2★)
        "8d0299ed-1343-47ec-87e7-7a156f1a6d64", // Mossy Catfish (2★)
        "a923d64b-39fa-4df9-bab5-c9c821969b0c", // Red Mood Koi (2★)
        "6eae0bcd-b35d-4bea-a01e-05e0eb2b026f", // Volcanic Goldfish (2★)
        "c0d614c3-913a-44a3-84d4-94f7168d00a5", // Astral Koi (3★)
        "80744a58-bc93-4672-a261-7c458a5382b1", // Dark Mist Koi (3★)
        "67b02877-4a0d-4c7b-9817-ae2461806b2c", // Dragon Eel (3★)
        "2b52c81b-1683-436c-bbb3-f065edaa9c50", // Gentle Ray (3★)
        "6ff4308b-a48c-49ed-8334-0a88c0925bf6", // Hook Fanged Lantern (3★)
        "23c9cf5f-9ca9-4906-8e81-f704396855c3", // Pink Axolotl (3★)
        "1ea55a62-1e5b-4ea1-bb4e-f23063d6c389", // Deep Sea Guardian (4★)
        "03ff6356-7ff3-406d-b917-24b9b666ad6e", // The Ancient (4★)
        "a27601ef-9186-435b-9e5d-70d92afc2330", // Water Spirit (5★)
      ];
      const ALL_FISHING_LOCATION_IDS = [
        ...SWAMP_FISHING_SPOTS.map(s => s.id),
        "3b3bb453-e012-4ba3-9308-71c1376d84a8", // Volcanic Fishing Spot
      ];
      let pondFishInserted = 0;
      for (const locId of ALL_FISHING_LOCATION_IDS) {
        for (const fishId of ALL_FISH_IDS) {
          const existing = await db.execute(sql`
            SELECT id FROM pond_fish WHERE location_id = ${locId} AND shop_item_id = ${fishId}
          `);
          if ((existing as any).rows?.length === 0) {
            await db.execute(sql`
              INSERT INTO pond_fish (location_id, shop_item_id) VALUES (${locId}, ${fishId})
            `);
            pondFishInserted++;
          }
        }
      }
      console.log(`Bayou restore: inserted ${pondFishInserted} pond_fish rows across ${ALL_FISHING_LOCATION_IDS.length} locations.`);

      await storage.setGameSetting("bayou_layout_restore_v1", "done");
      console.log("Elysian Bayou layout restoration complete.");
    }
  } catch (err) {
    console.error("Bayou layout restore error (non-fatal):", err);
  }

  // Migration: convert world_location bgUrls from inline base64 to static /world-assets/ URLs
  // This reduces the /api/world/:id/locations response from ~36MB to ~1KB for backgrounds
  try {
    const locBgsUrlDone = await storage.getGameSetting("location_bgs_url_v1");
    if (!locBgsUrlDone) {
      const LOCATION_BG_FILES: Record<string, string> = {
        "a1b2c3d4-0001-4000-8000-000000000001": "bg_murk_cave.webp",
        "a1b2c3d4-0004-4000-8000-000000000004": "bg_tome_toad.webp",
        "a1b2c3d4-0005-4000-8000-000000000005": "bg_swamp_critters.webp",
        "a1b2c3d4-0006-4000-8000-000000000006": "bg_mossy_cauldron.webp",
        "a1b2c3d4-0007-4000-8000-000000000007": "bg_myst_pond.webp",
        "a1b2c3d4-0008-4000-8000-000000000008": "bg_soggy_hook_v1.webp",
        "a1b2c3d4-0002-4000-8000-000000000002": "bg_willowmere_cottage.webp",
        "3e20ad30-faff-4643-9e80-5e5f30010738": "bg_thicket.webp",
        "8e211716-0448-496e-8582-6ce1025ac4e4": "bg_bayous_heart.webp",
        "97ff55d1-376b-466a-8fe9-992b09dbaacc": "bg_mire_bazaar.webp",
      };
      for (const [locId, bgFile] of Object.entries(LOCATION_BG_FILES)) {
        const assetPath = path.join(process.cwd(), "attached_assets", bgFile);
        if (!fs.existsSync(assetPath)) { console.log(`location_bgs_url: skipping ${locId}, ${bgFile} not found`); continue; }
        const fileUrl = `/world-assets/${bgFile}`;
        await db.execute(sql`UPDATE world_locations SET bg_url = ${fileUrl} WHERE id = ${locId}`);
        console.log(`location_bgs_url: ${locId} bg_url → ${fileUrl}`);
      }
      await storage.setGameSetting("location_bgs_url_v1", "done");
      console.log("Location bgUrl migration to static files complete.");
    }
  } catch (err) {
    console.error("Location bgUrl migration error (non-fatal):", err);
  }

  // Migration: restore Elysian Bayou non-fishing location positions, sizes, and sort orders
  // These were reset to seeder defaults after Railway migration; backup has the real values
  try {
    const bayouMainLocsDone = await storage.getGameSetting("bayou_main_locs_restore_v1");
    if (!bayouMainLocsDone) {
      const BAYOU_MAIN_LOCS = [
        {
          id: "a1b2c3d4-0001-4000-8000-000000000001",
          posX: 7.4470196, posY: 58.508682,
          iconSize: 350, sortOrder: 138, type: "battle",
        },
        {
          id: "97ff55d1-376b-466a-8fe9-992b09dbaacc",
          posX: -10, posY: 38.554417,
          iconSize: 460, sortOrder: 105, type: "shop",
        },
        {
          id: "a1b2c3d4-0004-4000-8000-000000000004",
          posX: 66.562294, posY: 23.236858,
          iconSize: 490, sortOrder: 112, type: "shop",
        },
        {
          id: "a1b2c3d4-0005-4000-8000-000000000005",
          posX: 38.909138, posY: 13.0801525,
          iconSize: 500, sortOrder: 111, type: "shop",
        },
        {
          id: "a1b2c3d4-0008-4000-8000-000000000008",
          posX: -9.926378, posY: 22.46119,
          iconSize: 500, sortOrder: 139, type: "battle",
        },
        {
          id: "8e211716-0448-496e-8582-6ce1025ac4e4",
          posX: 55.70539, posY: 50.631107,
          iconSize: 460, sortOrder: 131, type: "quest",
        },
      ];
      for (const loc of BAYOU_MAIN_LOCS) {
        await db.execute(sql`
          UPDATE world_locations
          SET pos_x = ${loc.posX}, pos_y = ${loc.posY},
              icon_size = ${loc.iconSize}, sort_order = ${loc.sortOrder},
              type = ${loc.type}
          WHERE id = ${loc.id}
        `);
        console.log(`Bayou restore: updated location ${loc.id} to pos (${loc.posX}, ${loc.posY})`);
      }
      // Save admin position snapshot so the auto-restore mechanism preserves them on future restarts
      const posSnapshot = BAYOU_MAIN_LOCS.map(l => ({ id: l.id, posX: l.posX, posY: l.posY }));
      await storage.setGameSetting("admin_pos_locs__swamp", JSON.stringify(posSnapshot));
      await storage.setGameSetting("bayou_main_locs_restore_v1", "done");
      console.log("Elysian Bayou main location positions restored from backup.");
    }
  } catch (err) {
    console.error("Bayou main locs restore error (non-fatal):", err);
  }

  // Migration: restore Keeper's Central world_locations (map icons) to pre-migration state
  // Restores Well of Fortune, Central Market, and Welcome Center icons missing after migration
  try {
    const kcLayoutDone = await storage.getGameSetting("kc_layout_restore_v1");
    if (!kcLayoutDone) {
      const KC_LOCATIONS = [
        {
          id: "707d872b-0a93-4369-ba8d-3d8b4b4bd09a",
          name: "Well of Fortune",
          type: "shop",
          posX: 66.532616,
          posY: 37.843616,
          iconSize: 170,
          isShop: true,
          glowColor: "#d4a017",
          flipped: false,
          sortOrder: 140,
          iconFile: "icon_kc_well_of_fortune.png",
        },
        {
          id: "4146afef-828a-4bc1-8e1b-015c7073f895",
          name: "Central Market",
          type: "landmark",
          posX: 30.195574,
          posY: 42.409153,
          iconSize: 340,
          isShop: false,
          glowColor: "#d4a017",
          flipped: false,
          sortOrder: 121,
          iconFile: "icon_kc_central_market.png",
        },
        {
          id: "de656c2e-4ada-405a-8cfb-a59c9f6b318b",
          name: "Welcome Center",
          type: "shop",
          posX: 90.58449,
          posY: 43.688786,
          iconSize: 260,
          isShop: true,
          glowColor: "#d4a017",
          flipped: true,
          sortOrder: 125,
          iconFile: "icon_kc_welcome_center.png",
        },
      ];
      for (const loc of KC_LOCATIONS) {
        const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${loc.id}`);
        if ((existing as any).rows?.length > 0) {
          console.log(`KC restore: ${loc.name} already exists, skipping.`);
          continue;
        }
        const iconData = loadAssetBase64(loc.iconFile);
        const iconUrl = iconData ?? null;
        await db.execute(sql`
          INSERT INTO world_locations
            (id, world_id, name, type, icon_url, pos_x, pos_y, icon_size, is_shop, glow_color, flipped, sort_order)
          VALUES
            (${loc.id}, 'pet_world', ${loc.name}, ${loc.type}, ${iconUrl},
             ${loc.posX}, ${loc.posY}, ${loc.iconSize}, ${loc.isShop},
             ${loc.glowColor}, ${loc.flipped}, ${loc.sortOrder})
        `);
        console.log(`KC restore: created ${loc.name} at (${loc.posX}, ${loc.posY}) size ${loc.iconSize}`);
      }
      await storage.setGameSetting("kc_layout_restore_v1", "done");
      console.log("Keeper's Central layout restoration complete.");
    }
  } catch (err) {
    console.error("KC layout restore error (non-fatal):", err);
  }

  // Always refresh known location icons as versioned static URLs — runs AFTER all seeding code
  // so it overrides any loadAssetBase64 calls that re-set base64 icons during startup.
  const LOC_ICON_ALWAYS_REFRESH: Record<string, string> = {
    "3e20ad30-faff-4643-9e80-5e5f30010738": "icon_thicket.png",
    "97ff55d1-376b-466a-8fe9-992b09dbaacc": "icon_mire_bazaar.png",
    "8e211716-0448-496e-8582-6ce1025ac4e4": "icon_bayous_heart_original.png",
    "a1b2c3d4-0001-4000-8000-000000000001": "icon_murk_cave.png",
    "a1b2c3d4-0002-4000-8000-000000000002": "icon_willowmere_cottage.png",
    "a1b2c3d4-0004-4000-8000-000000000004": "icon_tome_toad.png",
    "a1b2c3d4-0005-4000-8000-000000000005": "icon_swamp_critters.png",
    "a1b2c3d4-0006-4000-8000-000000000006": "icon_mossy_cauldron.png",
    "a1b2c3d4-0007-4000-8000-000000000007": "icon_myst_pond_v2.png",
    "a1b2c3d4-0008-4000-8000-000000000008": "icon_fishing_shack.png",
    "4146afef-828a-4bc1-8e1b-015c7073f895": "icon_kc_central_market.png",
    "de656c2e-4ada-405a-8cfb-a59c9f6b318b": "icon_kc_welcome_center.png",
    "707d872b-0a93-4369-ba8d-3d8b4b4bd09a": "icon_kc_well_of_fortune.png",
  };
  for (const [locId, iconFile] of Object.entries(LOC_ICON_ALWAYS_REFRESH)) {
    try {
      const assetPath = path.join(process.cwd(), "attached_assets", iconFile);
      if (!fs.existsSync(assetPath)) continue;
      const mtime = fs.statSync(assetPath).mtimeMs;
      const v = Math.floor(mtime / 1000);
      const iconUrl = `/world-assets/${iconFile}?v=${v}`;
      await db.execute(sql`UPDATE world_locations SET icon_url = ${iconUrl} WHERE id = ${locId}`);
    } catch (err) {
      console.error(`Location icon refresh error for ${locId} (non-fatal):`, err);
    }
  }
  console.log("Location icons refreshed with versioned static URLs.");

  // Migrate all remaining base64 image URLs to media_blobs (idempotent: skips non-base64 values)
  try {
    async function migrateBase64Column(table: string, idCol: string, imgCol: string): Promise<number> {
      const { rows } = await pool.query(
        `SELECT "${idCol}", "${imgCol}" FROM ${table} WHERE "${imgCol}" LIKE 'data:%'`
      );
      for (const row of rows) {
        const dataUrl: string = row[imgCol];
        const mimeMatch = dataUrl.match(/^data:(image\/[\w+.-]+);base64,/);
        if (!mimeMatch) continue;
        const mimeType = mimeMatch[1];
        const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const ins = await pool.query(
          `INSERT INTO media_blobs (mime_type, data) VALUES ($1, $2) RETURNING id`,
          [mimeType, b64]
        );
        const blobId = ins.rows[0].id;
        await pool.query(
          `UPDATE ${table} SET "${imgCol}" = $1 WHERE "${idCol}" = $2`,
          [`/api/media/${blobId}`, row[idCol]]
        );
      }
      return rows.length;
    }

    const tasks: Array<[string, string, string]> = [
      ["shop_items",       "id", "image_url"],
      ["shop_items",       "id", "egg_image_url"],
      ["shop_items",       "id", "hatched_image_url"],
      ["shop_items",       "id", "hookless_image_url"],
      ["badges",           "id", "image_url"],
      ["enemies",          "id", "image_url"],
      ["location_enemies", "id", "image_url"],
      ["house_bundles",    "id", "shop_image_url"],
      ["house_bundles",    "id", "bg_image_url"],
      ["pet_templates",    "id", "sleeping_image_url"],
      ["world_locations",  "id", "icon_url"],
    ];
    let totalMigrated = 0;
    for (const [table, idCol, imgCol] of tasks) {
      const n = await migrateBase64Column(table, idCol, imgCol);
      if (n > 0) console.log(`media_blobs: migrated ${n} rows in ${table}.${imgCol}`);
      totalMigrated += n;
    }
    if (totalMigrated > 0) console.log(`media_blobs migration complete: ${totalMigrated} images converted to URLs.`);
    else console.log("media_blobs migration: no base64 images found (already up to date).");
  } catch (err) {
    console.error("media_blobs migration error (non-fatal):", err);
  }

  console.log("Background initialization complete.");

  // Backfill Advanced Acquisition badge for users who previously bought a $100 pack
  await backfillAdvancedAcquisitionBadge();
  await backfillCoinPurchaseEarnings();
  // Ensure totalCoinsEarned >= current balance for all users (seeds legacy in-game earners)
  await syncTotalCoinsEarnedFloor();
  })().catch(err => console.error("Background init error:", err));
})();
