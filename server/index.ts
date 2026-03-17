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
import { pool } from "./db";
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);

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
    // Always refresh General Shop name, background and icon from assets
    await storage.updateWorldLocation(SHOP_ID, { name: "General Shop" } as any);
    const mireBazaarBg = loadAssetBase64("bg_mire_bazaar.png");
    if (mireBazaarBg) {
      await storage.updateWorldLocation(SHOP_ID, { bgUrl: mireBazaarBg } as any);
      console.log("General Shop background refreshed.");
    }
    const mireBazaarIcon = loadAssetBase64("icon_mire_bazaar.png");
    if (mireBazaarIcon) {
      await storage.updateWorldLocation(SHOP_ID, { iconUrl: mireBazaarIcon, iconSize: 350 } as any);
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
        bgFile: "bg_fishing_shack.png",
        posX: 75,
        posY: 58,
        glowColor: "#3dc7c0",
        sortOrder: 10,
        isShop: true,
      },
    ];

    const deletedRaw = await storage.getGameSetting("deleted_seed_location_ids");
    const deletedSeedIds: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];

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
        const updates: any = {
          name: loc.name,
          description: loc.description,
          glowColor: loc.glowColor,
          isShop: (loc as any).isShop ?? false,
          ...(( loc as any).type ? { type: (loc as any).type } : {}),
        };
        if (iconData) updates.iconUrl = iconData;
        if (bgData) updates.bgUrl = bgData;
        if (!existing.iconSize || existing.iconSize < 300) updates.iconSize = 350;
        await storage.updateWorldLocation(loc.id, updates);
        console.log(`${loc.name} refreshed.`);
      }
    }
  } catch (err) {
    console.error("Swamp location migration error (non-fatal):", err);
  }

  // Ensure admin always has an unbreakable test fishing pole
  try {
    const ADMIN_POLE_ID = "00000000-0000-0000-0000-admin0000pole";
    const adminRow = await pool.query(`SELECT id, username FROM users WHERE is_admin = true ORDER BY created_at ASC LIMIT 1`);
    const adminUser = adminRow.rows[0];
    if (adminUser) {
      const poleImg = loadAssetBase64("icon_fishing_pole.png");
      await pool.query(
        `INSERT INTO shop_items (id, name, price, type, world_id, fishing_type, pole_max_uses, image_url, rarity)
         VALUES ($1, 'Admin Test Pole', 0, 'fishing', 'swamp', 'pole', NULL, $2, 5)
         ON CONFLICT (id) DO NOTHING`,
        [ADMIN_POLE_ID, poleImg ?? ""]
      );
      const existing = await pool.query(
        `SELECT id FROM user_inventory WHERE user_id = $1 AND shop_item_id = $2 LIMIT 1`,
        [adminUser.id, ADMIN_POLE_ID]
      );
      if (existing.rowCount === 0) {
        await pool.query(
          `INSERT INTO user_inventory (user_id, shop_item_id, pole_uses_left) VALUES ($1, $2, NULL)`,
          [adminUser.id, ADMIN_POLE_ID]
        );
      }
      console.log(`Admin Test Pole ensured for ${adminUser.username}.`);
    }
  } catch (err) {
    console.error("Admin pole seed error (non-fatal):", err);
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
  httpServer.listen(
    { port, host: "0.0.0.0", reusePort: true },
    () => { log(`serving on port ${port}`); }
  );
})();
