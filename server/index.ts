import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes, backfillAdvancedAcquisitionBadge, backfillCoinPurchaseEarnings, syncTotalCoinsEarnedFloor } from "./routes";
import { seedPvpBots } from "./seedPvpBots";
import { seedSampleTemplates } from "./seedSampleTemplates";
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

// ── Response compression ─────────────────────────────────────────────────────
// Gzips/deflates JSON, HTML, JS, CSS responses. Massively reduces bandwidth
// (typically 5–10× smaller for text). Skips already-compressed binary content
// (images, video) and any response that explicitly opts out via x-no-compression.
app.use(compression({
  threshold: 1024, // skip very small responses where the overhead isn't worth it
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

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

// Lightweight health check for Railway / load balancers — no DB hit, no rate limit.
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

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

// Session secret: required in production, dev-only fallback otherwise.
// Fail fast on prod boot if the env var is missing so deploys never run
// with a hardcoded/guessable secret.
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;
if (isProduction && !sessionSecret) {
  console.error(
    "FATAL: SESSION_SECRET is not set. Refusing to start in production with a default secret."
  );
  process.exit(1);
}
if (!sessionSecret) {
  console.warn(
    "[session] SESSION_SECRET not set — using dev-only fallback. Do NOT use this in production."
  );
}

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      // Auto-create the `session` table on first boot. Required when
      // pointing at a fresh Railway database (or any new Postgres
      // instance) — otherwise the very first request blows up with
      // `relation "session" does not exist` and the app appears to
      // never load. Idempotent on subsequent boots.
      createTableIfMissing: true,
    }),
    secret: sessionSecret || "para-pets-dev-only-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
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

  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS watcher_shoutouts_enabled boolean NOT NULL DEFAULT true`);
  } catch (err) {
    console.error("watcher_shoutouts_enabled migration error (non-fatal):", err);
  }

  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false`);
  } catch (err) {
    console.error("is_bot migration error (non-fatal):", err);
  }

  try {
    await db.execute(sql`ALTER TABLE pvp_battle_groups ADD COLUMN IF NOT EXISTS attack_power integer NOT NULL DEFAULT 0`);
  } catch (err) {
    console.error("pvp_battle_groups.attack_power migration error (non-fatal):", err);
  }

  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS molten_blocks_high_score INTEGER NOT NULL DEFAULT 0`);
  } catch (err) {
    console.error("users.molten_blocks_high_score migration error (non-fatal):", err);
  }

  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS molten_blocks_drop_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_item_id VARCHAR NOT NULL,
      rarity VARCHAR(16) NOT NULL DEFAULT 'common',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`);
  } catch (err) {
    console.error("molten_blocks_drop_items migration error (non-fatal):", err);
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
  // Schema migrations — each in its own try/catch so one failure never blocks others
  const runMigration = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); console.log(`migration ok: ${label}`); }
    catch (err: any) { console.error(`migration FAILED [${label}]:`, err?.message ?? err); }
  };

  await runMigration("shop_items.bait_rarity_boost_star",
    () => db.execute(sql`ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS bait_rarity_boost_star INTEGER`));
  await runMigration("enemies.archetype",
    () => db.execute(sql`ALTER TABLE enemies ADD COLUMN IF NOT EXISTS archetype TEXT NOT NULL DEFAULT 'balanced'`));
  await runMigration("location_enemies.archetype",
    () => db.execute(sql`ALTER TABLE location_enemies ADD COLUMN IF NOT EXISTS archetype TEXT NOT NULL DEFAULT 'balanced'`));
  await runMigration("location_enemies.boss_special_attack",
    () => db.execute(sql`ALTER TABLE location_enemies ADD COLUMN IF NOT EXISTS boss_special_attack TEXT`));
  await runMigration("pet_templates.facing",
    () => db.execute(sql`ALTER TABLE pet_templates ADD COLUMN IF NOT EXISTS facing TEXT DEFAULT 'front'`));
  await runMigration("pet_templates.is_test",
    () => db.execute(sql`ALTER TABLE pet_templates ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false`));
  await runMigration("pet_templates.idle_style",
    () => db.execute(sql`ALTER TABLE pet_templates ADD COLUMN IF NOT EXISTS idle_style TEXT`));
  // One-time seed: tag the Haunted Marionette with its puppet animation style.
  await runMigration("pet_templates.idle_style.marionette",
    () => db.execute(sql`UPDATE pet_templates SET idle_style = 'marionette' WHERE name = 'Haunted Marionette' AND idle_style IS NULL`));
  await runMigration("users.watcher_shoutouts_enabled",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS watcher_shoutouts_enabled boolean NOT NULL DEFAULT true`));
  await runMigration("users.last_watcher_greeted_at",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_watcher_greeted_at timestamp`));
  await runMigration("users.last_petting_reward_at",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_petting_reward_at timestamp`));
  await runMigration("users.petting_rewards_today",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS petting_rewards_today integer NOT NULL DEFAULT 0`));

  // Run-once migration tracker — for migrations that should only execute a
  // single time across all deploys (e.g. data resets), keyed by string id.
  await runMigration("app_migrations table",
    () => db.execute(sql`CREATE TABLE IF NOT EXISTS app_migrations (key TEXT PRIMARY KEY, run_at TIMESTAMP NOT NULL DEFAULT NOW())`));
  const runOnce = async (key: string, fn: () => Promise<unknown>) => {
    try {
      const r: any = await db.execute(sql`SELECT 1 FROM app_migrations WHERE key = ${key}`);
      const rows = r.rows ?? r;
      if (Array.isArray(rows) && rows.length > 0) return;
      await fn();
      await db.execute(sql`INSERT INTO app_migrations (key) VALUES (${key}) ON CONFLICT DO NOTHING`);
      console.log(`one-time migration ok: ${key}`);
    } catch (err: any) {
      console.error(`one-time migration FAILED [${key}]:`, err?.message ?? err);
    }
  };

  // Reset everyone's daily petting-reward clock once so existing players can
  // immediately experience the rebuilt Pet Care coin reward on deploy.
  await runOnce("reset_last_petting_reward_2026_04",
    () => db.execute(sql`UPDATE users SET last_petting_reward_at = NULL`));
  await runMigration("shop_items.skill_type",
    () => db.execute(sql`ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS skill_type TEXT`));
  await runMigration("shop_items.skill_affects",
    () => db.execute(sql`ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS skill_affects TEXT`));
  await runMigration("shop_items.is_sea_animal",
    () => db.execute(sql`ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS is_sea_animal boolean NOT NULL DEFAULT false`));
  await runMigration("user_inventory.pet_feed_points",
    () => db.execute(sql`ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS pet_feed_points INTEGER NOT NULL DEFAULT 0`));
  await runMigration("user_inventory.pet_hunger",
    () => db.execute(sql`ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS pet_hunger INTEGER NOT NULL DEFAULT -1`));
  await runMigration("user_inventory.pet_mood",
    () => db.execute(sql`ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS pet_mood INTEGER NOT NULL DEFAULT 100`));
  await runMigration("user_inventory.pet_stats_updated_at",
    () => db.execute(sql`ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS pet_stats_updated_at TIMESTAMP NOT NULL DEFAULT NOW()`));
  // Per-pet petting reward counters — replaces the old per-user counters so
  // every pet has its own daily allotment of petting coins.
  await runMigration("user_inventory.last_petting_reward_at",
    () => db.execute(sql`ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS last_petting_reward_at TIMESTAMP`));
  await runMigration("user_inventory.petting_rewards_today",
    () => db.execute(sql`ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS petting_rewards_today INTEGER NOT NULL DEFAULT 0`));
  await runMigration("users.accessory_extra_slots",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS accessory_extra_slots INTEGER NOT NULL DEFAULT 0`));
  // One-time reset so the next test from any user immediately demonstrates the
  // new per-pet first-pet-of-the-day +10 coin reward.
  await runOnce("reset_pet_petting_counters_2026_04_per_pet",
    () => db.execute(sql`UPDATE user_inventory SET last_petting_reward_at = NULL, petting_rewards_today = 0`));

  // Drop any pre-existing duplicate (location_id, shop_item_id) rows so we can
  // safely add the unique index below. Keeps the oldest row of each pair.
  await runMigration("pond_fish.dedupe_before_unique", () =>
    db.execute(sql`
      DELETE FROM pond_fish a
      USING pond_fish b
      WHERE a.ctid > b.ctid
        AND a.location_id = b.location_id
        AND a.shop_item_id = b.shop_item_id
    `));
  // Pond membership is logically a set per (location, fish). The unique index
  // makes ON CONFLICT DO NOTHING reliable and prevents races between concurrent
  // admin actions or app instances.
  await runMigration("uq_pond_fish_location_item", () =>
    db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_pond_fish_location_item ON pond_fish (location_id, shop_item_id)`));

  // One-time consolidation: collapse every user's per-row potion inventory
  // into stacks of up to 50. Older builds inserted one row per potion
  // purchased, so a player who bought 46 small health potions had 46
  // separate rows. Going forward the shop endpoint stacks them for new
  // purchases, but we want existing inventories to also benefit so the
  // first new purchase doesn't fill a tiny partial row before spilling
  // into a full stack.
  await runOnce("consolidate_potion_stacks_2026_04", async () => {
    const POTION_STACK_LIMIT = 50;
    // Only target user/item groups whose CURRENT layout is wrong:
    // either there's a stack above the limit OR there's more than one
    // partial stack (i.e. all-but-the-last stack should be at the
    // limit). This way a re-run after a clean migration is a no-op
    // even though `runOnce` already gates re-runs after success — the
    // tighter filter also keeps each iteration cheap if the migration
    // gets re-applied to a different DB by hand.
    const r: any = await db.execute(sql`
      SELECT ui.user_id, ui.shop_item_id
      FROM user_inventory ui
      JOIN shop_items si ON si.id = ui.shop_item_id
      WHERE si.type = 'potion'
      GROUP BY ui.user_id, ui.shop_item_id
      HAVING
        MAX(COALESCE(ui.quantity, 1)) > ${POTION_STACK_LIMIT}
        OR SUM(CASE WHEN COALESCE(ui.quantity, 1) < ${POTION_STACK_LIMIT} THEN 1 ELSE 0 END) > 1
    `);
    const groups: { user_id: string; shop_item_id: string }[] = r.rows ?? r;
    for (const g of groups) {
      // Per-group transaction: if any of the update/delete/insert
      // steps for ONE user/item group fails, that group rolls back as
      // a unit so we never lose qty (e.g. row deleted before the new
      // stack got inserted). Other groups are unaffected.
      await db.transaction(async (tx) => {
        const rows: any = await tx.execute(sql`
          SELECT id, COALESCE(quantity, 1) AS quantity
          FROM user_inventory
          WHERE user_id = ${g.user_id} AND shop_item_id = ${g.shop_item_id}
          ORDER BY acquired_at ASC NULLS FIRST
          FOR UPDATE
        `);
        const list: { id: string; quantity: number }[] = rows.rows ?? rows;
        if (list.length === 0) return;
        // Use ?? rather than || so a legitimate stored `0` stays 0 —
        // otherwise zero-qty husks (which this migration explicitly
        // wants to clean) would each contribute 1 to the rebuild and
        // mint phantom potions.
        const totalQty = list.reduce((acc, x) => acc + Number(x.quantity ?? 1), 0);
        if (totalQty <= 0) {
          // Defensive: clean up any zero-qty husks that may exist.
          await tx.execute(sql`DELETE FROM user_inventory WHERE user_id = ${g.user_id} AND shop_item_id = ${g.shop_item_id}`);
          return;
        }
        const keepId = list[0].id;
        const dropIds = list.slice(1).map(x => x.id);
        // Build the new stack distribution: as many full-50 stacks as
        // fit, then a remainder. The first stack reuses the existing
        // oldest row so any external references to it (none currently,
        // but defensive) stay valid.
        const stackSizes: number[] = [];
        let left = totalQty;
        while (left > 0) {
          const chunk = Math.min(POTION_STACK_LIMIT, left);
          stackSizes.push(chunk);
          left -= chunk;
        }
        await tx.execute(sql`UPDATE user_inventory SET quantity = ${stackSizes[0] ?? 0} WHERE id = ${keepId}`);
        if (dropIds.length > 0) {
          // Drizzle's `sql` template doesn't auto-bind JS arrays to
          // Postgres array params, so use sql.join to expand the list
          // into a real `id IN (...)` clause with one bind per id.
          await tx.execute(sql`DELETE FROM user_inventory WHERE id IN (${sql.join(dropIds.map(id => sql`${id}`), sql`, `)})`);
        }
        for (let i = 1; i < stackSizes.length; i++) {
          await tx.execute(sql`
            INSERT INTO user_inventory (user_id, shop_item_id, quantity)
            VALUES (${g.user_id}, ${g.shop_item_id}, ${stackSizes[i]})
          `);
        }
      });
    }
  });

  // One-time backfill: synchronize each world's fishing-spot stock so every
  // spot in a given world has the same fish list. We pick the spot with the
  // most fish in each world as the source of truth and copy its fish into
  // every other fishing spot in that world. Going forward the
  // addFishToPond / removeFishFromPond storage methods keep things in sync
  // automatically, so this only needs to run once per deploy environment.
  // (Per-pet animation override seeding removed: every pet now uses the
  // global per-part-type animation map in PetAnimator / PetAnimatorCanvas,
  // so admins tweak motion in one place and every pet picks it up.
  // h2_/h3_-prefixed secondary heads always render behind body + sway as
  // a built-in default — that used to be a Cerberus-only override and is
  // now a global rule for any multi-head pet.)

  // Backfill `item_image_url` on player_market_listings for any historical
  // rows that were created before the listing endpoint started copying the
  // shop item's image URL into the row. Without this, a number of legacy
  // listings (Basic Rod, Sturdy Rod, The Hunter, etc.) render as blank
  // squares in the market because the client `<img src={null}>` falls
  // through to nothing. We resolve the image from shop_items joined on
  // shop_item_id; rows with no shop_item_id (or no matching shop item) are
  // left null and the client renders a generic placeholder bag icon.
  await runOnce("backfill_market_item_images_2026_04", async () => {
    await db.execute(sql`
      UPDATE player_market_listings AS m
      SET item_image_url = s.image_url
      FROM shop_items AS s
      WHERE m.shop_item_id = s.id
        AND (m.item_image_url IS NULL OR m.item_image_url = '')
        AND s.image_url IS NOT NULL
        AND s.image_url <> ''
    `);
  });

  await runOnce("sync_pond_fish_per_world_2026_04", async () => {
    const r: any = await db.execute(sql`
      SELECT id, world_id FROM world_locations WHERE type = 'fishing'
    `);
    const rows: { id: string; world_id: string }[] = r.rows ?? r;
    const byWorld = new Map<string, string[]>();
    for (const row of rows) {
      const list = byWorld.get(row.world_id) ?? [];
      list.push(row.id);
      byWorld.set(row.world_id, list);
    }
    for (const [worldId, locIds] of Array.from(byWorld.entries())) {
      if (locIds.length < 2) continue;
      // Find the location with the most fish in this world.
      let bestId = locIds[0];
      let bestCount = -1;
      let bestFish: string[] = [];
      for (const lid of locIds) {
        const fr: any = await db.execute(sql`
          SELECT shop_item_id FROM pond_fish WHERE location_id = ${lid}
        `);
        const frows: { shop_item_id: string }[] = fr.rows ?? fr;
        if (frows.length > bestCount) {
          bestCount = frows.length;
          bestId = lid;
          bestFish = frows.map(f => f.shop_item_id);
        }
      }
      if (bestCount <= 0) continue;
      // Insert each best-fish into every other location, ignoring duplicates.
      for (const lid of locIds) {
        if (lid === bestId) continue;
        for (const sid of bestFish) {
          await db.execute(sql`
            INSERT INTO pond_fish (location_id, shop_item_id)
            SELECT ${lid}, ${sid}
            WHERE NOT EXISTS (
              SELECT 1 FROM pond_fish WHERE location_id = ${lid} AND shop_item_id = ${sid}
            )
          `);
        }
      }
      console.log(`Synced ${bestCount} fish across ${locIds.length} '${worldId}' spots from source ${bestId}.`);
    }
  });

  // ── Performance indexes ────────────────────────────────────────────────────
  // Hot foreign-key + sort columns that were previously sequential-scanned.
  // CREATE INDEX IF NOT EXISTS is idempotent and safe on every restart, so
  // these will auto-apply on Railway with no manual deploy step.
  await runMigration("idx_user_badges_user_id",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges (user_id)`));
  await runMigration("idx_user_badges_badge_id",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges (badge_id)`));
  await runMigration("idx_coin_purchases_user_id",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_coin_purchases_user_id ON coin_purchases (user_id)`));
  // Exactly-once purchase dedup. Both the sync /api/coins/verify route and the
  // async Stripe webhook insert a coin_purchases row keyed by stripe_session_id
  // and rely on a 23505 (unique-violation) to detect the loser of a race. That
  // guard only works if the column is actually unique — this enforces it. Safe
  // and idempotent: verified zero duplicate stripe_session_id rows before adding.
  await runMigration("uq_coin_purchases_stripe_session_id",
    () => db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_coin_purchases_stripe_session_id ON coin_purchases (stripe_session_id)`));
  await runMigration("idx_pet_template_parts_template_id",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pet_template_parts_template_id ON pet_template_parts (template_id)`));
  await runMigration("idx_world_chat_messages_created_at",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_world_chat_messages_created_at ON world_chat_messages (created_at DESC)`));
  await runMigration("idx_user_inventory_user_id",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON user_inventory (user_id)`));
  await runMigration("idx_users_total_coins_earned",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_total_coins_earned ON users (total_coins_earned DESC)`));
  await runMigration("idx_notifications_user_created",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC)`));
  await runMigration("idx_friendships_requester",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id)`));
  await runMigration("idx_friendships_receiver",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON friendships (receiver_id)`));
  await runMigration("idx_player_fish_inventory_user",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_player_fish_inventory_user ON player_fish_inventory (user_id)`));
  await runMigration("idx_player_market_listings_seller",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_player_market_listings_seller ON player_market_listings (seller_id)`));
  await runMigration("idx_placed_home_decor_user",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_placed_home_decor_user ON placed_home_decor (user_id)`));
  await runMigration("idx_world_pet_positions_owner",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_world_pet_positions_owner ON world_pet_positions (owner_user_id)`));
  await runMigration("idx_player_daily_login_claims_user",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_player_daily_login_claims_user ON player_daily_login_claims (user_id)`));
  await runMigration("idx_pvp_battles_user_created",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pvp_battles_user_created ON pvp_battles (user_id, created_at DESC)`));
  await runMigration("users.tutorial_reward_claimed",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_reward_claimed boolean NOT NULL DEFAULT false`));
  await runMigration("users.tutorial_hatch_potions_claimed",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_hatch_potions_claimed boolean NOT NULL DEFAULT false`));
  await runMigration("users.tutorial_quest_completed",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_quest_completed boolean NOT NULL DEFAULT false`));
  await runMigration("users.molten_blocks_high_score",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS molten_blocks_high_score INTEGER NOT NULL DEFAULT 0`));
  await runMigration("idx_users_molten_blocks_high_score",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_molten_blocks_high_score ON users (molten_blocks_high_score DESC)`));
  await runMigration("molten_blocks_drop_items.table",
    () => db.execute(sql`CREATE TABLE IF NOT EXISTS molten_blocks_drop_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_item_id VARCHAR NOT NULL,
      rarity VARCHAR(16) NOT NULL DEFAULT 'common',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`));
  await runMigration("users.signup_referrer",
    () => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_referrer text`));
  await runMigration("player_login_events.table",
    () => db.execute(sql`CREATE TABLE IF NOT EXISTS player_login_events (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL,
      ip_address VARCHAR(100),
      country VARCHAR(100),
      city VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`));
  await runMigration("idx_player_login_events_created",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_player_login_events_created ON player_login_events (created_at DESC)`));
  await runMigration("idx_player_login_events_user",
    () => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_player_login_events_user ON player_login_events (user_id, created_at DESC)`));
  await runMigration("gifts.expires_at",
    () => db.execute(sql`ALTER TABLE gifts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`));

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
      CREATE TABLE IF NOT EXISTS founders (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        added_by varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log("founders table ready.");
  } catch (err) {
    console.error("founders table setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`ALTER TABLE founders ADD COLUMN IF NOT EXISTS tier varchar(12)`);
    console.log("founders.tier column ready.");
  } catch (err) {
    console.error("founders tier migration (non-fatal):", err);
  }

  try {
    await db.execute(sql`ALTER TABLE founders ADD COLUMN IF NOT EXISTS user_id varchar`);
    console.log("founders.user_id column ready.");
  } catch (err) {
    console.error("founders user_id migration (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS purchase_monthly_progress (
        user_id varchar NOT NULL,
        month_year varchar(7) NOT NULL,
        points int NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, month_year)
      )
    `);
    console.log("purchase_monthly_progress table ready.");
  } catch (err) {
    console.error("purchase_monthly_progress setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS purchase_milestone_claims (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL,
        milestone_points int NOT NULL,
        month_year varchar(7) NOT NULL,
        claimed_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (user_id, milestone_points, month_year)
      )
    `);
    console.log("purchase_milestone_claims table ready.");
  } catch (err) {
    console.error("purchase_milestone_claims setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS purchase_milestone_rewards (
        milestone_points int PRIMARY KEY,
        reward_coins int DEFAULT 0,
        reward_item_id varchar,
        reward_item_name varchar,
        reward_item_image_url varchar,
        reward_label varchar(120),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log("purchase_milestone_rewards table ready.");
  } catch (err) {
    console.error("purchase_milestone_rewards setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      ALTER TABLE IF EXISTS purchase_milestone_rewards
        ADD COLUMN IF NOT EXISTS star_rarity int
    `);
    console.log("purchase_milestone_rewards.star_rarity ready.");
  } catch (err) {
    console.error("purchase_milestone_rewards.star_rarity migration error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_contribution_cycles (
        user_id varchar PRIMARY KEY,
        cycle int NOT NULL DEFAULT 1
      )
    `);
    console.log("user_contribution_cycles table ready.");
  } catch (err) {
    console.error("user_contribution_cycles setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mixing_tree_recipes (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        ingredient1_id varchar NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
        ingredient2_id varchar NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
        result_id varchar NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
        result_type text NOT NULL DEFAULT 'item',
        created_at timestamp NOT NULL DEFAULT NOW()
      )
    `);
    console.log("mixing_tree_recipes table ready.");
  } catch (err) {
    console.error("mixing_tree_recipes setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      ALTER TABLE mixing_tree_recipes
        ADD COLUMN IF NOT EXISTS recipe_item_id varchar REFERENCES shop_items(id) ON DELETE SET NULL
    `);
    console.log("mixing_tree_recipes.recipe_item_id ready.");
  } catch (err) {
    console.error("mixing_tree_recipes.recipe_item_id error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      ALTER TABLE mixing_tree_recipes
        ADD COLUMN IF NOT EXISTS ingredient3_id varchar REFERENCES shop_items(id) ON DELETE SET NULL
    `);
    console.log("mixing_tree_recipes.ingredient3_id ready.");
  } catch (err) {
    console.error("mixing_tree_recipes.ingredient3_id error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS player_unlocked_recipes (
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipe_id varchar NOT NULL REFERENCES mixing_tree_recipes(id) ON DELETE CASCADE,
        unlocked_at timestamp NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, recipe_id)
      )
    `);
    console.log("player_unlocked_recipes table ready.");
  } catch (err) {
    console.error("player_unlocked_recipes setup error (non-fatal):", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS daily_quests (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        quest_key text NOT NULL UNIQUE,
        title text NOT NULL,
        description text NOT NULL,
        target_count integer NOT NULL DEFAULT 1,
        coin_reward integer NOT NULL DEFAULT 0,
        reward_item_id varchar,
        is_active boolean NOT NULL DEFAULT true
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_daily_quest_progress (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL,
        quest_key text NOT NULL,
        quest_date text NOT NULL,
        progress integer NOT NULL DEFAULT 0,
        completed boolean NOT NULL DEFAULT false,
        reward_claimed boolean NOT NULL DEFAULT false,
        UNIQUE(user_id, quest_key, quest_date)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_quest_log_state (
        user_id varchar PRIMARY KEY,
        last_opened_date text,
        has_unseen_completion boolean NOT NULL DEFAULT false
      )
    `);
    // Remove deprecated hub-related quests if they still exist
    await db.execute(sql`DELETE FROM user_daily_quest_progress WHERE quest_key IN ('daily_hub', 'visit_hub', 'claim_hub', 'hub_reward', 'claim_hub_reward')`);
    await db.execute(sql`DELETE FROM daily_quests WHERE quest_key IN ('daily_hub', 'visit_hub', 'claim_hub', 'hub_reward', 'claim_hub_reward') OR title ILIKE '%hub page%'`);

    // Add reward_item_quantity column if not present (non-destructive)
    await db.execute(sql`
      ALTER TABLE daily_quests ADD COLUMN IF NOT EXISTS reward_item_quantity integer NOT NULL DEFAULT 1
    `);

    // Seed default quests
    const defaultQuests: { key: string; title: string; desc: string; target: number; coinReward?: number; rewardItemId?: string; rewardItemQty?: number }[] = [
      { key: "feed_pet",          title: "Feed Active Pet",       desc: "Feed your active pet 10 times",  target: 10 },
      { key: "catch_fish",        title: "Gone Fishing",          desc: "Catch 5 fish",                   target: 5  },
      { key: "use_powerup",       title: "Power Up Your Pet",     desc: "Use a power-up on a pet 3 times",target: 3  },
      { key: "play_molten_blocks",title: "Play Molten Blocks",    desc: "Play a Molten Blocks game",      target: 1,  rewardItemId: "a1b2c3d4-9001-4000-8000-000000000099", rewardItemQty: 5 },
      { key: "sell_fish",         title: "Sell Fish",             desc: "Sell 10 fish",                   target: 10, rewardItemId: "7b381092-3b76-4c91-99bc-5a5ba91f52ec" },
    ];
    for (const q of defaultQuests) {
      await db.execute(sql`
        INSERT INTO daily_quests (quest_key, title, description, target_count, coin_reward, reward_item_id, reward_item_quantity)
        VALUES (${q.key}, ${q.title}, ${q.desc}, ${q.target}, ${q.coinReward ?? 0}, ${q.rewardItemId ?? null}, ${q.rewardItemQty ?? 1})
        ON CONFLICT (quest_key) DO NOTHING
      `);
    }
    console.log("daily_quests tables ready.");
  } catch (err) {
    console.error("daily_quests setup error (non-fatal):", err);
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
    // Add is_bot column if it was missing from an older table version
    await db.execute(sql`
      ALTER TABLE world_chat_messages ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false
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

  // ── fishing_leaderboard: per-(user, world) fishing points ───────────────
  // New table starts empty so only catches made from now on count — old fish
  // catching is never retroactively scored. Idempotent; safe on every boot.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fishing_leaderboard (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL,
        world_id varchar NOT NULL,
        points integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (user_id, world_id)
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_fishing_lb_world_points ON fishing_leaderboard(world_id, points DESC)
    `);
    console.log("fishing_leaderboard table ready.");
  } catch (err) {
    console.error("fishing_leaderboard table setup error (non-fatal):", err);
  }

  // ── pvp_battle_tokens: one-time tokens issued by /api/pvp/start ──────────
  // Required so /api/pvp/result can't be replayed without first paying a
  // ticket via /start. Idempotent — safe to run on every boot.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pvp_battle_tokens (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pvp_battle_tokens_user ON pvp_battle_tokens(user_id)
    `);
    console.log("pvp_battle_tokens table ready.");
  } catch (err) {
    console.error("pvp_battle_tokens table setup error (non-fatal):", err);
  }

  // ── Seed: PvP Ticket (Meridia Arena Entry Pass) ───────────────────────────
  try {
    const PVP_TICKET_ID = "a1b2c3d4-9001-4000-8000-000000000099";
    const pvpTicketAsset = path.join(process.cwd(), "attached_assets", "Photoroom_20260415_83701_PM_1776304592941.png");
    const pvpTicketV = fs.existsSync(pvpTicketAsset)
      ? Math.floor(fs.statSync(pvpTicketAsset).mtimeMs / 1000)
      : 0;
    const pvpTicketImageUrl = `/world-assets/Photoroom_20260415_83701_PM_1776304592941.png?v=${pvpTicketV}`;
    await db.execute(sql`
      INSERT INTO shop_items (
        id, name, price, type, world_id, location_id,
        image_url, special_type,
        shop_pos_x, shop_pos_y, shop_width
      ) VALUES (
        ${PVP_TICKET_ID},
        'Veridia Arena Ticket',
        0,
        'special',
        'swamp',
        NULL,
        ${pvpTicketImageUrl},
        'pvp_ticket',
        50, 50, 72
      )
      ON CONFLICT (id) DO UPDATE SET
        name = 'Veridia Arena Ticket',
        image_url = ${pvpTicketImageUrl}
    `);
    console.log("PvP Ticket item seeded.");
  } catch (err) {
    console.error("PvP Ticket seed error (non-fatal):", err);
  }

  // ── Seed: Gift Items ──────────────────────────────────────────────────────
  try {
    const giftDefs = [
      { id: "gift-0001-0000-0000-000000000001", name: "Swamp Wisp Lantern",   file: "gift_swamp_wisp_lantern.png",  price: 50,  giftPoints: 5  },
      { id: "gift-0001-0000-0000-000000000002", name: "Gator Tooth Charm",    file: "gift_gator_tooth_charm.png",   price: 75,  giftPoints: 10 },
      { id: "gift-0001-0000-0000-000000000003", name: "Murky Marsh Pearl",    file: "gift_murky_marsh_pearl.png",   price: 100, giftPoints: 20 },
      { id: "gift-0001-0000-0000-000000000004", name: "Voodoo Moss Locket",   file: "gift_voodoo_moss_locket.png",  price: 150, giftPoints: 35 },
      { id: "gift-0001-0000-0000-000000000005", name: "Bayou Moon Crystal",   file: "gift_bayou_moon_crystal.png",  price: 200, giftPoints: 50 },
      { id: "gift-0001-0000-0000-000000000006", name: "Witch's Cursed Bloom", file: "gift_witchs_cursed_bloom.png", price: 300, giftPoints: 75 },
    ];
    for (const g of giftDefs) {
      const assetPath = path.join(process.cwd(), "attached_assets", g.file);
      const v = fs.existsSync(assetPath) ? Math.floor(fs.statSync(assetPath).mtimeMs / 1000) : 0;
      const imgUrl = `/world-assets/${g.file}?v=${v}`;
      await db.execute(sql`
        INSERT INTO shop_items (
          id, name, price, type, world_id, location_id,
          image_url, gift_points, is_sea_animal,
          shop_pos_x, shop_pos_y, shop_width
        ) VALUES (
          ${g.id}, ${g.name}, ${g.price}, 'gift', 'all', NULL,
          ${imgUrl}, ${g.giftPoints}, false,
          50, 50, 72
        )
        ON CONFLICT (id) DO UPDATE SET
          name       = ${g.name},
          price      = ${g.price},
          image_url  = ${imgUrl},
          gift_points = ${g.giftPoints}
      `);
    }
    console.log("Gift items seeded.");
  } catch (err) {
    console.error("Gift items seed error (non-fatal):", err);
  }

  // ── Seed: Haunted Woods Gift Items ────────────────────────────────────────────
  try {
    const hauntedGiftDefs = [
      { id: "gift-hw01-0000-0000-000000000001", name: "Phantom Petal",     file: "gift_haunted_1.png",  price: 80,  giftPoints: 25 },
      { id: "gift-hw01-0000-0000-000000000002", name: "Skull Candy",       file: "gift_haunted_2.png",  price: 90,  giftPoints: 30 },
      { id: "gift-hw01-0000-0000-000000000003", name: "Witch's Brew Flask", file: "gift_haunted_3.png",  price: 120, giftPoints: 40 },
      { id: "gift-hw01-0000-0000-000000000004", name: "Gloom Mushroom",    file: "gift_haunted_4.png",  price: 60,  giftPoints: 20 },
      { id: "gift-hw01-0000-0000-000000000005", name: "Haunted Acorn",     file: "gift_haunted_5.png",  price: 50,  giftPoints: 15 },
      { id: "gift-hw01-0000-0000-000000000006", name: "Spirit Candle",     file: "gift_haunted_6.png",  price: 100, giftPoints: 35 },
      { id: "gift-hw01-0000-0000-000000000007", name: "Banshee's Tear",    file: "gift_haunted_7.png",  price: 140, giftPoints: 45 },
      { id: "gift-hw01-0000-0000-000000000008", name: "Cursed Berry",      file: "gift_haunted_8.png",  price: 65,  giftPoints: 20 },
      { id: "gift-hw01-0000-0000-000000000009", name: "Moonshroom Spore",  file: "gift_haunted_9.png",  price: 75,  giftPoints: 25 },
      { id: "gift-hw01-0000-0000-000000000010", name: "Shadow Ribbon",     file: "gift_haunted_10.png", price: 95,  giftPoints: 30 },
      { id: "gift-hw01-0000-0000-000000000011", name: "Graveyard Moss",    file: "gift_haunted_11.png", price: 60,  giftPoints: 20 },
      { id: "gift-hw01-0000-0000-000000000012", name: "Raven Feather",     file: "gift_haunted_12.png", price: 110, giftPoints: 35 },
      { id: "gift-hw01-0000-0000-000000000013", name: "Soul Wisp Jar",     file: "gift_haunted_13.png", price: 150, giftPoints: 50 },
      { id: "gift-hw01-0000-0000-000000000014", name: "Cobweb Treat",      file: "gift_haunted_14.png", price: 80,  giftPoints: 25 },
      { id: "gift-hw01-0000-0000-000000000015", name: "Spectral Bone",     file: "gift_haunted_15.png", price: 125, giftPoints: 40 },
    ];
    for (const g of hauntedGiftDefs) {
      const assetPath = path.join(process.cwd(), "attached_assets", g.file);
      const v = fs.existsSync(assetPath) ? Math.floor(fs.statSync(assetPath).mtimeMs / 1000) : 0;
      const imgUrl = v > 0 ? `/world-assets/${g.file}?v=${v}` : null;
      await db.execute(sql`
        INSERT INTO shop_items (
          id, name, price, type, world_id, location_id,
          image_url, gift_points, is_sea_animal, shop_pos_x, shop_pos_y, shop_width
        ) VALUES (
          ${g.id}, ${g.name}, ${g.price}, 'gift', 'haunted_woods', NULL,
          ${imgUrl}, ${g.giftPoints}, false, 50, 50, 72
        )
        ON CONFLICT (id) DO UPDATE SET
          name        = ${g.name},
          price       = ${g.price},
          image_url   = COALESCE(${imgUrl}, shop_items.image_url),
          gift_points = ${g.giftPoints}
      `);
    }
    console.log("Haunted Woods gift items seeded (15).");
  } catch (err) {
    console.error("Haunted Woods gift items seed error (non-fatal):", err);
  }

  // ── Seed: Haunted Woods Accessories ──────────────────────────────────────────
  try {
    const hauntedAccDefs = [
      { id: "acc-hw01-0000-0000-000000000001", name: "Crown of Phantoms",    file: "acc_haunted_1.png", price: 650, atkBoost: 15, defBoost: 0,  healthBoost: 40 },
      { id: "acc-hw01-0000-0000-000000000002", name: "Veil of Shadows",      file: "acc_haunted_2.png", price: 550, atkBoost: 0,  defBoost: 25, healthBoost: 25 },
      { id: "acc-hw01-0000-0000-000000000003", name: "Cursed Collar",        file: "acc_haunted_3.png", price: 600, atkBoost: 30, defBoost: 10, healthBoost: 0  },
      { id: "acc-hw01-0000-0000-000000000004", name: "Phantom Wing Clips",   file: "acc_haunted_4.png", price: 700, atkBoost: 20, defBoost: 20, healthBoost: 0  },
      { id: "acc-hw01-0000-0000-000000000005", name: "Hex Charm Bracelet",   file: "acc_haunted_5.png", price: 750, atkBoost: 15, defBoost: 15, healthBoost: 20 },
      { id: "acc-hw01-0000-0000-000000000006", name: "Specter's Eyepatch",   file: "acc_haunted_6.png", price: 600, atkBoost: 35, defBoost: 0,  healthBoost: 15 },
    ];
    for (const a of hauntedAccDefs) {
      const assetPath = path.join(process.cwd(), "attached_assets", a.file);
      const v = fs.existsSync(assetPath) ? Math.floor(fs.statSync(assetPath).mtimeMs / 1000) : 0;
      const imgUrl = v > 0 ? `/world-assets/${a.file}?v=${v}` : null;
      await db.execute(sql`
        INSERT INTO shop_items (
          id, name, price, type, world_id, location_id,
          image_url, atk_boost, def_boost, health_boost,
          is_sea_animal, shop_pos_x, shop_pos_y, shop_width
        ) VALUES (
          ${a.id}, ${a.name}, ${a.price}, 'accessory', 'haunted_woods', NULL,
          ${imgUrl}, ${a.atkBoost}, ${a.defBoost}, ${a.healthBoost},
          false, 50, 50, 72
        )
        ON CONFLICT (id) DO UPDATE SET
          name         = ${a.name},
          price        = ${a.price},
          image_url    = COALESCE(${imgUrl}, shop_items.image_url),
          atk_boost    = ${a.atkBoost},
          def_boost    = ${a.defBoost},
          health_boost = ${a.healthBoost}
      `);
    }
    console.log("Haunted Woods accessories seeded (6).");
  } catch (err) {
    console.error("Haunted Woods accessories seed error (non-fatal):", err);
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
    swamp: "bg_swamp_map_v6.jpeg",
    snowy_mountain: "bg_snowy_mountain_map.webp",
    sky_realm: "bg_sky_realm_map.webp",
    volcanic: "bg_volcanic_map_v3.jpeg",
    haunted_woods: "bg_haunted_woods_v2.webp",
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
    "c3d4e5f6-0003-4000-8000-000000000003": "bg_shop_forge_fang_volcanic.png",
    "c3d4e5f6-0004-4000-8000-000000000004": "bg_shop_bookshop_volcanic.png",
    "c3d4e5f6-0006-4000-8000-000000000006": "bg_shop_food_volcanic.png",
    "a1b2c3d4-0010-4000-8000-000000000010": "bg_shop_food_swamp.png",
    // Haunted Woods locations
    "e2f3a4b5-0001-4000-8000-000000000001": "bg_spectral_grove.webp",
    "e2f3a4b5-0002-4000-8000-000000000002": "bg_cauldrons_creep_v2.webp",
    "e2f3a4b5-0003-4000-8000-000000000003": "bg_soul_pond_v2.webp",
    "e2f3a4b5-0004-4000-8000-000000000004": "bg_haunted_menagerie_v2.webp",
  };
  for (const [locId, bgFile] of Object.entries(LOC_BG_ALWAYS_REFRESH)) {
    try {
      const assetPath = path.join(process.cwd(), "attached_assets", bgFile);
      if (!fs.existsSync(assetPath)) { console.warn(`LOC_BG_ALWAYS_REFRESH: ${bgFile} not found, skipping ${locId}`); continue; }
      const mtime = fs.statSync(assetPath).mtimeMs;
      const v = Math.floor(mtime / 1000);
      const bgUrl = `/world-assets/${bgFile}?v=${v}`;
      // Unconditional UPDATE — always write the correct versioned URL on every restart.
      // No conditional check: the LIKE pattern with ?v= can silently misbehave in some drivers.
      const result = await db.execute(sql`UPDATE world_locations SET bg_url = ${bgUrl} WHERE id = ${locId}`);
      const affected = (result as any).rowCount ?? (result as any).rows?.length ?? "?";
      console.log(`LOC_BG: ${bgFile} → ${locId} (${affected} row${affected === 1 ? "" : "s"})`);
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
          name: "The Mixing Tree",
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
        console.log("The Mixing Tree restored (was missing from DB).");
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

    // Migration: swap The Mixing Tree icon to the new bayou-themed cauldron
    // artwork (vine-wrapped, mossy, teal wisps). Bumped to v2 to refresh the
    // stored asset whenever the source PNG is regenerated. Position is
    // preserved (admins may have moved it).
    const mixingTreeCauldronDone = await storage.getGameSetting("mixing_tree_cauldron_icon_v2");
    if (!mixingTreeCauldronDone) {
      const MIXING_TREE_ID = "8e211716-0448-496e-8582-6ce1025ac4e4";
      const cauldronIcon = loadAssetBase64("icon_mixing_tree_cauldron.png");
      if (cauldronIcon) {
        await storage.updateWorldLocation(MIXING_TREE_ID, { iconUrl: cauldronIcon } as any);
        console.log("The Mixing Tree icon updated to the bayou-themed cauldron artwork.");
      }
      await storage.setGameSetting("mixing_tree_cauldron_icon_v2", "done");
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
      { match: "central",  file: "bg_central_market.png"    },
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

  // Migration: ensure the Central Market door in Keeper's Central is marked as a shop
  // so the items panel renders and the background uses cover mode (not panoramic scroll).
  try {
    await db.execute(sql`
      UPDATE kc_doors
      SET is_shop = true
      WHERE world_id = 'pet_world'
        AND LOWER(name) LIKE '%central%'
        AND is_shop = false
    `);
  } catch (err) {
    console.error("Central Market door isShop migration error (non-fatal):", err);
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

  // Seed volcanic world locations (pet shop + fishing shack building icon refresh)
  try {
    const VOLCANIC_PET_SHOP_ID = "c3d4e5f6-0001-4000-8000-000000000001";
    const volcanicPetShopDone = await storage.getGameSetting("volcanic_pet_shop_v1");
    if (!volcanicPetShopDone) {
      const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${VOLCANIC_PET_SHOP_ID}`);
      if ((existing as any).rows?.length === 0) {
        const assetPath = path.join(process.cwd(), "attached_assets", "icon_pet_shop_volcanic.png");
        const mtime = fs.existsSync(assetPath) ? fs.statSync(assetPath).mtimeMs : Date.now();
        const iconUrl = `/world-assets/icon_pet_shop_volcanic.png?v=${Math.floor(mtime / 1000)}`;
        const petShopName = "Ember's Menagerie";
        const petShopDesc = "A volcanic pet shop where exotic fire-realm creatures await their new companions.";
        await db.execute(sql`
          INSERT INTO world_locations (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url)
          VALUES (
            ${VOLCANIC_PET_SHOP_ID}, 'volcanic', ${petShopName}, 'shop',
            ${petShopDesc}, 35, 40, '#ff4500', 350, 10, true, ${iconUrl}
          )
        `);
        console.log("Volcanic Pet Shop seeded.");
      }
      await storage.setGameSetting("volcanic_pet_shop_v1", "done");
    }
  } catch (err) {
    console.error("Volcanic pet shop seed error (non-fatal):", err);
  }

  // Seed volcanic fishing shack building as a named shop location icon (refresh always)
  try {
    const VOLCANIC_FISHING_SHOP_ID = "c3d4e5f6-0002-4000-8000-000000000002";
    const volcanicFishingShopDone = await storage.getGameSetting("volcanic_fishing_shack_v1");
    if (!volcanicFishingShopDone) {
      const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${VOLCANIC_FISHING_SHOP_ID}`);
      if ((existing as any).rows?.length === 0) {
        const assetPath = path.join(process.cwd(), "attached_assets", "icon_fishing_shop_volcanic.png");
        const mtime = fs.existsSync(assetPath) ? fs.statSync(assetPath).mtimeMs : Date.now();
        const iconUrl = `/world-assets/icon_fishing_shop_volcanic.png?v=${Math.floor(mtime / 1000)}`;
        const fishingShopName = "The Lava Hook";
        const fishingShopDesc = "A rugged lava-stone fishing shack selling poles, bait, and volcanic fishing gear.";
        await db.execute(sql`
          INSERT INTO world_locations (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url)
          VALUES (
            ${VOLCANIC_FISHING_SHOP_ID}, 'volcanic', ${fishingShopName}, 'fishing',
            ${fishingShopDesc}, 65, 40, '#ff4500', 350, 11, true, ${iconUrl}
          )
        `);
        console.log("Volcanic Fishing Shop seeded.");
      }
      await storage.setGameSetting("volcanic_fishing_shack_v1", "done");
    }
  } catch (err) {
    console.error("Volcanic fishing shack seed error (non-fatal):", err);
  }

  // Seed volcanic accessory shop
  try {
    const VOLCANIC_ACCESSORY_SHOP_ID = "c3d4e5f6-0003-4000-8000-000000000003";
    const volcanicAccessoryShopDone = await storage.getGameSetting("volcanic_accessory_shop_v1");
    if (!volcanicAccessoryShopDone) {
      const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${VOLCANIC_ACCESSORY_SHOP_ID}`);
      if ((existing as any).rows?.length === 0) {
        const assetPath = path.join(process.cwd(), "attached_assets", "icon_accessory_shop_volcanic.png");
        const mtime = fs.existsSync(assetPath) ? fs.statSync(assetPath).mtimeMs : Date.now();
        const iconUrl = `/world-assets/icon_accessory_shop_volcanic.png?v=${Math.floor(mtime / 1000)}`;
        const shopName = "The Forge & Fang";
        const shopDesc = "A volcanic blacksmith shop selling fiery accessories, lava-forged gear, and volcanic adornments.";
        await db.execute(sql`
          INSERT INTO world_locations (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url)
          VALUES (
            ${VOLCANIC_ACCESSORY_SHOP_ID}, 'volcanic', ${shopName}, 'shop',
            ${shopDesc}, 50, 60, '#ff4500', 350, 12, true, ${iconUrl}
          )
        `);
        console.log("Volcanic Accessory Shop seeded.");
      }
      await storage.setGameSetting("volcanic_accessory_shop_v1", "done");
    }
  } catch (err) {
    console.error("Volcanic accessory shop seed error (non-fatal):", err);
  }

  // Seed volcanic edibles (one-shot). Price === feed points (1 coin per 1 feed
  // point). Stored as type='edibles' with stat_boost_amount = feed points so
  // they appear in the admin Item Database edibles tab and are assignable to
  // shops/quests like every other edible. Image URLs use the static
  // /world-assets/ route with mtime-based cache busting.
  try {
    const volcanicEdiblesDone = await storage.getGameSetting("volcanic_edibles_v1");
    if (!volcanicEdiblesDone) {
      const edibles = [
        { name: "Brimstone Pepper",      feed: 3,  file: "edible_brimstone_pepper.png" },
        { name: "Lava Egg",              feed: 6,  file: "edible_lava_egg.png" },
        { name: "Cinder Crisps",         feed: 8,  file: "edible_cinder_crisps.png" },
        { name: "Magma Skewer",          feed: 12, file: "edible_magma_skewer.png" },
        { name: "Ember Berry Tart",      feed: 15, file: "edible_ember_berry_tart.png" },
        { name: "Sulfur Mushroom Stew",  feed: 20, file: "edible_sulfur_mushroom_stew.png" },
        { name: "Roasted Drake Wing",    feed: 28, file: "edible_roasted_drake_wing.png" },
        { name: "Volcanic Bone Broth",   feed: 35, file: "edible_volcanic_bone_broth.png" },
        { name: "Obsidian Glazed Ham",   feed: 45, file: "edible_obsidian_glazed_ham.png" },
        { name: "Phoenix Feast Platter", feed: 60, file: "edible_phoenix_feast_platter.png" },
      ];
      let inserted = 0;
      for (const it of edibles) {
        const assetPath = path.join(process.cwd(), "attached_assets", it.file);
        if (!fs.existsSync(assetPath)) {
          console.warn(`Volcanic edible asset missing, skipping: ${it.file}`);
          continue;
        }
        const v = Math.floor(fs.statSync(assetPath).mtimeMs / 1000);
        const imageUrl = `/world-assets/${it.file}?v=${v}`;
        // Skip if an item with the same name already exists, so manual
        // edits / re-runs are safe.
        const existing = await db.execute(
          sql`SELECT id FROM shop_items WHERE name = ${it.name} AND type = 'edibles' LIMIT 1`
        );
        if ((existing as any).rows?.length) continue;
        await db.execute(sql`
          INSERT INTO shop_items (name, price, type, world_id, image_url, stat_boost_amount)
          VALUES (${it.name}, ${it.feed}, 'edibles', 'volcanic', ${imageUrl}, ${it.feed})
        `);
        inserted++;
      }
      await storage.setGameSetting("volcanic_edibles_v1", "done");
      console.log(`Volcanic edibles seeded (${inserted} new).`);
    }

    // Always refresh image_url for the seeded edibles so a re-exported asset
    // (e.g. background-removed PNG) shows up without a manual DB edit. Uses
    // the file mtime as the ?v= cache-buster, matching how the location
    // backgrounds and icons stay fresh on every restart.
    const edibleFiles = [
      "edible_brimstone_pepper.png", "edible_lava_egg.png", "edible_cinder_crisps.png",
      "edible_magma_skewer.png", "edible_ember_berry_tart.png", "edible_sulfur_mushroom_stew.png",
      "edible_roasted_drake_wing.png", "edible_volcanic_bone_broth.png",
      "edible_obsidian_glazed_ham.png", "edible_phoenix_feast_platter.png",
    ];
    const edibleNameByFile: Record<string, string> = {
      "edible_brimstone_pepper.png": "Brimstone Pepper",
      "edible_lava_egg.png": "Lava Egg",
      "edible_cinder_crisps.png": "Cinder Crisps",
      "edible_magma_skewer.png": "Magma Skewer",
      "edible_ember_berry_tart.png": "Ember Berry Tart",
      "edible_sulfur_mushroom_stew.png": "Sulfur Mushroom Stew",
      "edible_roasted_drake_wing.png": "Roasted Drake Wing",
      "edible_volcanic_bone_broth.png": "Volcanic Bone Broth",
      "edible_obsidian_glazed_ham.png": "Obsidian Glazed Ham",
      "edible_phoenix_feast_platter.png": "Phoenix Feast Platter",
    };
    for (const file of edibleFiles) {
      const assetPath = path.join(process.cwd(), "attached_assets", file);
      if (!fs.existsSync(assetPath)) continue;
      const v = Math.floor(fs.statSync(assetPath).mtimeMs / 1000);
      const url = `/world-assets/${file}?v=${v}`;
      const name = edibleNameByFile[file];
      await db.execute(
        sql`UPDATE shop_items SET image_url = ${url} WHERE name = ${name} AND type = 'edibles'`
      );
    }
  } catch (err) {
    console.error("Volcanic edibles seed error (non-fatal):", err);
  }

  // Seed 15 volcanic-themed fish (one-shot). Stored as type='fishing'
  // fishing_type='fish' with world_id='volcanic' so admins can place them
  // into any volcanic fishing spot from the fish pool. Price is 0 (caught,
  // not bought). Star ratings are pre-rolled 1-5 so they're stable across
  // restarts. Image URLs use the static /world-assets/ route with mtime
  // cache-busting, and are re-bumped every boot below so re-exported PNGs
  // (background-stripped, etc.) show up without a manual DB edit.
  try {
    const volcanicFishDone = await storage.getGameSetting("volcanic_fish_v2");
    const volcanicFish = [
      { name: "Magma Minnow",          stars: 2, file: "fish_magma_minnow.png" },
      { name: "Cinder Guppy",          stars: 3, file: "fish_cinder_guppy.png" },
      { name: "Brimstone Tetra",       stars: 1, file: "fish_brimstone_tetra.png" },
      { name: "Ash Bream",             stars: 2, file: "fish_ash_bream.png" },
      { name: "Sulfur Eel",            stars: 4, file: "fish_sulfur_eel.png" },
      { name: "Obsidian Pike",         stars: 4, file: "fish_obsidian_pike.png" },
      { name: "Ember Carp",            stars: 3, file: "fish_ember_carp.png" },
      { name: "Smoldering Catfish",    stars: 2, file: "fish_smoldering_catfish.png" },
      { name: "Lavafin Koi",           stars: 5, file: "fish_lavafin_koi.png" },
      { name: "Pyroclast Piranha",     stars: 4, file: "fish_pyroclast_piranha.png" },
      { name: "Ironscale Trench Fish", stars: 3, file: "fish_ironscale_trench.png" },
      { name: "Volcanic Anglerfish",   stars: 5, file: "fish_volcanic_anglerfish.png" },
      { name: "Caldera Crusher",       stars: 4, file: "fish_caldera_crusher.png" },
      { name: "Phoenix Lungfish",      stars: 5, file: "fish_phoenix_lungfish.png" },
      { name: "Lord Inferno",          stars: 5, file: "fish_lord_inferno.png" },
      { name: "Cinder Sprat",          stars: 1, file: "fish_cinder_sprat.png" },
      { name: "Soot Tadpole",          stars: 1, file: "fish_soot_tadpole.png" },
      { name: "Pumice Loach",          stars: 2, file: "fish_pumice_loach.png" },
      { name: "Glowtail Sardine",      stars: 2, file: "fish_glowtail_sardine.png" },
      { name: "Magma Bass",            stars: 3, file: "fish_magma_bass.png" },
      { name: "Basalt Char",           stars: 3, file: "fish_basalt_char.png" },
    ];
    if (!volcanicFishDone) {
      let inserted = 0;
      for (const f of volcanicFish) {
        const assetPath = path.join(process.cwd(), "attached_assets", f.file);
        if (!fs.existsSync(assetPath)) {
          console.warn(`Volcanic fish asset missing, skipping: ${f.file}`);
          continue;
        }
        const v = Math.floor(fs.statSync(assetPath).mtimeMs / 1000);
        const imageUrl = `/world-assets/${f.file}?v=${v}`;
        const existing = await db.execute(
          sql`SELECT id FROM shop_items WHERE name = ${f.name} AND type = 'fishing' AND fishing_type = 'fish' LIMIT 1`
        );
        if ((existing as any).rows?.length) continue;
        await db.execute(sql`
          INSERT INTO shop_items (name, price, type, world_id, image_url, fishing_type, star_rarity, facing_direction, fish_swim_zone)
          VALUES (${f.name}, 0, 'fishing', 'volcanic', ${imageUrl}, 'fish', ${f.stars}, 'left', 'middle')
        `);
        inserted++;
      }
      await storage.setGameSetting("volcanic_fish_v2", "done");
      console.log(`Volcanic fish seeded (${inserted} new).`);
    }

    for (const f of volcanicFish) {
      const assetPath = path.join(process.cwd(), "attached_assets", f.file);
      if (!fs.existsSync(assetPath)) continue;
      const v = Math.floor(fs.statSync(assetPath).mtimeMs / 1000);
      const url = `/world-assets/${f.file}?v=${v}`;
      await db.execute(sql`
        UPDATE shop_items
        SET image_url = ${url},
            facing_direction = COALESCE(facing_direction, 'left'),
            fish_swim_zone   = COALESCE(fish_swim_zone, 'middle')
        WHERE name = ${f.name} AND type = 'fishing' AND fishing_type = 'fish'
      `);
    }
  } catch (err) {
    console.error("Volcanic fish seed error (non-fatal):", err);
  }

  try {
    const COIN_PER_STAT = 7;
    const volcanicBooks = [
      { name: "Ember Codex of Strength",      stat: "atk",    amount: 6,  file: "book_ember_codex_strength.png" },
      { name: "Tome of Lava Hide",            stat: "def",    amount: 6,  file: "book_tome_of_lava_hide.png" },
      { name: "Magma Heart Manuscript",       stat: "health", amount: 10, file: "book_magma_heart_manuscript.png" },
      { name: "Pyromancer's Battle Grimoire", stat: "atk",    amount: 10, file: "book_pyromancer_battle_grimoire.png" },
      { name: "Obsidian Bulwark Codex",       stat: "def",    amount: 16,  file: "book_obsidian_bulwark_codex.png" },
      { name: "Phoenix Apex Compendium",      stat: "health", amount: 30,  file: "book_phoenix_apex_compendium.png" },
      { name: "Bulwark of the Mountain",      stat: "def",    amount: 100, file: "book_bulwark_of_the_mountain.png" },
      { name: "Heart of Magma Tome",          stat: "health", amount: 100, file: "book_heart_of_magma_tome.png" },
      { name: "Titan's Volcanic Aegis",       stat: "def",    amount: 300, file: "book_titans_volcanic_aegis.png" },
    ];
    let inserted = 0;
    let updated = 0;
    for (const b of volcanicBooks) {
      const assetPath = path.join(process.cwd(), "attached_assets", b.file);
      if (!fs.existsSync(assetPath)) {
        console.warn(`Volcanic book asset missing, skipping: ${b.file}`);
        continue;
      }
      const v = Math.floor(fs.statSync(assetPath).mtimeMs / 1000);
      const imageUrl = `/world-assets/${b.file}?v=${v}`;
      const price = b.amount * COIN_PER_STAT;
      const existing = await db.execute(
        sql`SELECT id FROM shop_items WHERE name = ${b.name} AND type = 'power_up' LIMIT 1`
      );
      if ((existing as any).rows?.length) {
        await db.execute(sql`
          UPDATE shop_items
          SET price = ${price},
              world_id = 'volcanic',
              image_url = ${imageUrl},
              stat_boost_type = ${b.stat},
              stat_boost_amount = ${b.amount},
              atk_boost = NULL,
              def_boost = NULL,
              health_boost = NULL
          WHERE name = ${b.name} AND type = 'power_up'
        `);
        updated++;
      } else {
        await db.execute(sql`
          INSERT INTO shop_items (name, price, type, world_id, image_url, stat_boost_type, stat_boost_amount)
          VALUES (${b.name}, ${price}, 'power_up', 'volcanic', ${imageUrl}, ${b.stat}, ${b.amount})
        `);
        inserted++;
      }
    }
    if (inserted || updated) {
      console.log(`Volcanic books refreshed (${inserted} new, ${updated} updated).`);
    }
  } catch (err) {
    console.error("Volcanic books seed error (non-fatal):", err);
  }

  // Seed volcanic food shop — uses the same one-shot game_settings flag pattern
  // as the other volcanic shops so it inserts once, then becomes admin-movable
  // (position/size persisted via the standard world_locations PATCH route).
  try {
    const VOLCANIC_FOOD_SHOP_ID = "c3d4e5f6-0006-4000-8000-000000000006";
    const volcanicFoodShopDone = await storage.getGameSetting("volcanic_food_shop_v1");
    if (!volcanicFoodShopDone) {
      const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${VOLCANIC_FOOD_SHOP_ID}`);
      if ((existing as any).rows?.length === 0) {
        const assetPath = path.join(process.cwd(), "attached_assets", "icon_food_shop_volcanic.png");
        const mtime = fs.existsSync(assetPath) ? fs.statSync(assetPath).mtimeMs : Date.now();
        const iconUrl = `/world-assets/icon_food_shop_volcanic.png?v=${Math.floor(mtime / 1000)}`;
        const shopName = "The Cinder Hearth";
        const shopDesc = "A volcanic eatery serving lava-roasted meats, fire-baked breads, and bubbling magma stews.";
        await db.execute(sql`
          INSERT INTO world_locations (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url)
          VALUES (
            ${VOLCANIC_FOOD_SHOP_ID}, 'volcanic', ${shopName}, 'shop',
            ${shopDesc}, 25, 70, '#ff4500', 350, 13, true, ${iconUrl}
          )
        `);
        console.log("Volcanic Food Shop seeded.");
      }
      await storage.setGameSetting("volcanic_food_shop_v1", "done");
    }
  } catch (err) {
    console.error("Volcanic food shop seed error (non-fatal):", err);
  }

  // Seed swamp food shop (Elysian Bayou) — same one-shot pattern.
  try {
    const SWAMP_FOOD_SHOP_ID = "a1b2c3d4-0010-4000-8000-000000000010";
    const swampFoodShopDone = await storage.getGameSetting("swamp_food_shop_v1");
    if (!swampFoodShopDone) {
      const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${SWAMP_FOOD_SHOP_ID}`);
      if ((existing as any).rows?.length === 0) {
        const assetPath = path.join(process.cwd(), "attached_assets", "icon_food_shop_swamp.png");
        const mtime = fs.existsSync(assetPath) ? fs.statSync(assetPath).mtimeMs : Date.now();
        const iconUrl = `/world-assets/icon_food_shop_swamp.png?v=${Math.floor(mtime / 1000)}`;
        const shopName = "Mama Crawdad's Cauldron";
        const shopDesc = "A bayou food stall serving spicy gumbo, fire-roasted crawfish, and willow-wisp brews steaming on the cypress counter.";
        await db.execute(sql`
          INSERT INTO world_locations (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url)
          VALUES (
            ${SWAMP_FOOD_SHOP_ID}, 'swamp', ${shopName}, 'shop',
            ${shopDesc}, 50, 70, '#7fbf6f', 350, 13, true, ${iconUrl}
          )
        `);
        console.log("Swamp Food Shop seeded.");
      }
      await storage.setGameSetting("swamp_food_shop_v1", "done");
    }
  } catch (err) {
    console.error("Swamp food shop seed error (non-fatal):", err);
  }

  // Seed 6 bayou-themed accessory items (one-shot). Pricing: 12 coins per
  // stat point (accessories don't break). Visible to admins to place.
  try {
    const swampAccessoriesDone = await storage.getGameSetting("swamp_accessories_v1");
    const swampAccessories = [
      { name: "Cypress Fang Sword",   file: "accessory_swamp_sword.png",  atk: 150, def: 0,   hp: 0,   price: 1800 },
      { name: "Mosswood Longbow",     file: "accessory_swamp_bow.png",    atk: 150, def: 0,   hp: 0,   price: 1800 },
      { name: "Wisp-Root Staff",      file: "accessory_swamp_staff.png",  atk: 150, def: 0,   hp: 0,   price: 1800 },
      { name: "Gatorhide Cuirass",    file: "accessory_swamp_armor.png",  atk: 0,   def: 100, hp: 0,   price: 1200 },
      { name: "Cypress Bulwark",      file: "accessory_swamp_shield.png", atk: 0,   def: 100, hp: 0,   price: 1200 },
      { name: "Wisplight Amulet",     file: "accessory_swamp_amulet.png", atk: 0,   def: 0,   hp: 150, price: 1800 },
    ];
    if (!swampAccessoriesDone) {
      let inserted = 0;
      for (const it of swampAccessories) {
        const assetPath = path.join(process.cwd(), "attached_assets", it.file);
        if (!fs.existsSync(assetPath)) { console.warn(`Swamp accessory missing, skipping: ${it.file}`); continue; }
        const v = Math.floor(fs.statSync(assetPath).mtimeMs / 1000);
        const imageUrl = `/world-assets/${it.file}?v=${v}`;
        const existing = await db.execute(
          sql`SELECT id FROM shop_items WHERE name = ${it.name} AND type = 'accessory' LIMIT 1`
        );
        if ((existing as any).rows?.length) continue;
        await db.execute(sql`
          INSERT INTO shop_items (name, price, type, world_id, image_url, atk_boost, def_boost, health_boost)
          VALUES (${it.name}, ${it.price}, 'accessory', 'swamp', ${imageUrl},
                  ${it.atk || null}, ${it.def || null}, ${it.hp || null})
        `);
        inserted++;
      }
      await storage.setGameSetting("swamp_accessories_v1", "done");
      console.log(`Swamp accessories seeded (${inserted} new).`);
    }
    // Always refresh image_url so re-exported (background-stripped) PNGs
    // show up without a manual DB edit.
    for (const it of swampAccessories) {
      const assetPath = path.join(process.cwd(), "attached_assets", it.file);
      if (!fs.existsSync(assetPath)) continue;
      const v = Math.floor(fs.statSync(assetPath).mtimeMs / 1000);
      const url = `/world-assets/${it.file}?v=${v}`;
      await db.execute(
        sql`UPDATE shop_items SET image_url = ${url} WHERE name = ${it.name} AND type = 'accessory'`
      );
    }
  } catch (err) {
    console.error("Swamp accessories seed error (non-fatal):", err);
  }

  // Seed 6 volcanic-themed accessory items (one-shot). Pricing: 12 coins
  // per stat point (accessories don't break). Mixed stat profiles.
  try {
    const volcanicAccessoriesDone = await storage.getGameSetting("volcanic_accessories_v1");
    const volcanicAccessories = [
      { name: "Obsidian Drake Greatsword", file: "accessory_volcanic_sword.png",  atk: 200, def: 0,   hp: 0,   price: 2400 },
      { name: "Magma Bolt Crossbow",       file: "accessory_volcanic_bow.png",    atk: 175, def: 0,   hp: 0,   price: 2100 },
      { name: "Phoenix Heart Staff",       file: "accessory_volcanic_staff.png",  atk: 160, def: 0,   hp: 60,  price: 2640 },
      { name: "Drakeplate Cuirass",        file: "accessory_volcanic_armor.png",  atk: 0,   def: 130, hp: 50,  price: 2160 },
      { name: "Cinderforge Bulwark",       file: "accessory_volcanic_shield.png", atk: 0,   def: 120, hp: 0,   price: 1440 },
      { name: "Ember Heart Amulet",        file: "accessory_volcanic_amulet.png", atk: 0,   def: 0,   hp: 200, price: 2400 },
    ];
    if (!volcanicAccessoriesDone) {
      let inserted = 0;
      for (const it of volcanicAccessories) {
        const assetPath = path.join(process.cwd(), "attached_assets", it.file);
        if (!fs.existsSync(assetPath)) { console.warn(`Volcanic accessory missing, skipping: ${it.file}`); continue; }
        const v = Math.floor(fs.statSync(assetPath).mtimeMs / 1000);
        const imageUrl = `/world-assets/${it.file}?v=${v}`;
        const existing = await db.execute(
          sql`SELECT id FROM shop_items WHERE name = ${it.name} AND type = 'accessory' LIMIT 1`
        );
        if ((existing as any).rows?.length) continue;
        await db.execute(sql`
          INSERT INTO shop_items (name, price, type, world_id, image_url, atk_boost, def_boost, health_boost)
          VALUES (${it.name}, ${it.price}, 'accessory', 'volcanic', ${imageUrl},
                  ${it.atk || null}, ${it.def || null}, ${it.hp || null})
        `);
        inserted++;
      }
      await storage.setGameSetting("volcanic_accessories_v1", "done");
      console.log(`Volcanic accessories seeded (${inserted} new).`);
    }
    // Always refresh image_url so re-exported (background-stripped) PNGs
    // show up without a manual DB edit.
    for (const it of volcanicAccessories) {
      const assetPath = path.join(process.cwd(), "attached_assets", it.file);
      if (!fs.existsSync(assetPath)) continue;
      const v = Math.floor(fs.statSync(assetPath).mtimeMs / 1000);
      const url = `/world-assets/${it.file}?v=${v}`;
      await db.execute(
        sql`UPDATE shop_items SET image_url = ${url} WHERE name = ${it.name} AND type = 'accessory'`
      );
    }
  } catch (err) {
    console.error("Volcanic accessories seed error (non-fatal):", err);
  }

  // Seed volcanic bookshop
  try {
    const VOLCANIC_BOOKSHOP_ID = "c3d4e5f6-0004-4000-8000-000000000004";
    const volcanicBookshopDone = await storage.getGameSetting("volcanic_bookshop_v1");
    if (!volcanicBookshopDone) {
      const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${VOLCANIC_BOOKSHOP_ID}`);
      if ((existing as any).rows?.length === 0) {
        const assetPath = path.join(process.cwd(), "attached_assets", "icon_bookshop_volcanic.png");
        const mtime = fs.existsSync(assetPath) ? fs.statSync(assetPath).mtimeMs : Date.now();
        const iconUrl = `/world-assets/icon_bookshop_volcanic.png?v=${Math.floor(mtime / 1000)}`;
        const shopName = "The Pyrenean Press";
        const shopDesc = "A volcanic bookshop stocked with ancient fire-lore tomes, geomancy scrolls, and lava-crystal curiosities.";
        await db.execute(sql`
          INSERT INTO world_locations (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url)
          VALUES (
            ${VOLCANIC_BOOKSHOP_ID}, 'volcanic', ${shopName}, 'shop',
            ${shopDesc}, 25, 60, '#ff4500', 350, 13, true, ${iconUrl}
          )
        `);
        console.log("Volcanic Bookshop seeded.");
      }
      await storage.setGameSetting("volcanic_bookshop_v1", "done");
    }
  } catch (err) {
    console.error("Volcanic bookshop seed error (non-fatal):", err);
  }

  // Seed volcanic lava fortress (non-shop landmark that opens its own scenic view)
  try {
    const VOLCANIC_FORTRESS_ID = "c3d4e5f6-0005-4000-8000-000000000005";
    const volcanicFortressDone = await storage.getGameSetting("volcanic_fortress_v1");
    if (!volcanicFortressDone) {
      const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${VOLCANIC_FORTRESS_ID}`);
      if ((existing as any).rows?.length === 0) {
        const assetPath = path.join(process.cwd(), "attached_assets", "icon_lava_fortress_volcanic.png");
        const mtime = fs.existsSync(assetPath) ? fs.statSync(assetPath).mtimeMs : Date.now();
        const iconUrl = `/world-assets/icon_lava_fortress_volcanic.png?v=${Math.floor(mtime / 1000)}`;
        const fortressName = "The Molten Bastion";
        const fortressDesc = "An ancient fortress carved from obsidian, its halls alive with rivers of glowing lava.";
        await db.execute(sql`
          INSERT INTO world_locations (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url)
          VALUES (
            ${VOLCANIC_FORTRESS_ID}, 'volcanic', ${fortressName}, 'area',
            ${fortressDesc}, 75, 25, '#ff6a00', 350, 14, false, ${iconUrl}
          )
        `);
        console.log("Volcanic Lava Fortress seeded.");
      }
      await storage.setGameSetting("volcanic_fortress_v1", "done");
    }
  } catch (err) {
    console.error("Volcanic fortress seed error (non-fatal):", err);
  }

  // Seed the volcanic Cooking station ("The Ember Kitchen") — a non-shop place
  // that will host the upcoming cooking mini-game. type='area' + is_shop=false so
  // it never opens shop UI; tap behavior is handled in WorldPage.openLocation by
  // its stable ID.
  try {
    const VOLCANIC_COOKING_ID = "c3d4e5f6-0007-4000-8000-000000000007";
    const volcanicCookingDone = await storage.getGameSetting("volcanic_cooking_v1");
    if (!volcanicCookingDone) {
      const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${VOLCANIC_COOKING_ID}`);
      if ((existing as any).rows?.length === 0) {
        const assetPath = path.join(process.cwd(), "attached_assets", "icon_cooking_forge_volcanic.png");
        const mtime = fs.existsSync(assetPath) ? fs.statSync(assetPath).mtimeMs : Date.now();
        const iconUrl = `/world-assets/icon_cooking_forge_volcanic.png?v=${Math.floor(mtime / 1000)}`;
        const cookingName = "The Ember Kitchen";
        const cookingDesc = "A blazing forge-kitchen where molten heat cooks the realm's fiercest feasts.";
        await db.execute(sql`
          INSERT INTO world_locations (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url)
          VALUES (
            ${VOLCANIC_COOKING_ID}, 'volcanic', ${cookingName}, 'area',
            ${cookingDesc}, 38, 60, '#ff6a00', 320, 15, false, ${iconUrl}
          )
        `);
        console.log("Volcanic Cooking station seeded.");
      }
      await storage.setGameSetting("volcanic_cooking_v1", "done");
    }
  } catch (err) {
    console.error("Volcanic cooking seed error (non-fatal):", err);
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
    "c3d4e5f6-0001-4000-8000-000000000001": "icon_pet_shop_volcanic.png",
    "c3d4e5f6-0002-4000-8000-000000000002": "icon_fishing_shop_volcanic.png",
    "c3d4e5f6-0003-4000-8000-000000000003": "icon_accessory_shop_volcanic.png",
    "c3d4e5f6-0004-4000-8000-000000000004": "icon_bookshop_volcanic.png",
    "c3d4e5f6-0005-4000-8000-000000000005": "icon_lava_fortress_volcanic.png",
    "c3d4e5f6-0006-4000-8000-000000000006": "icon_food_shop_volcanic.png",
    "c3d4e5f6-0007-4000-8000-000000000007": "icon_cooking_forge_volcanic.png",
    "a1b2c3d4-0010-4000-8000-000000000010": "icon_food_shop_swamp.png",
    // Haunted Woods — converted to WebP to avoid 2MB base64 blobs in API responses
    "e2f3a4b5-0001-4000-8000-000000000001": "icon_spectral_grove.webp",
    "e2f3a4b5-0002-4000-8000-000000000002": "icon_cauldrons_creep.webp",
    "e2f3a4b5-0003-4000-8000-000000000003": "icon_haunted_pond.webp",
    "e2f3a4b5-0004-4000-8000-000000000004": "icon_haunted_pet_shop.webp",
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

  // Delete any duplicate haunted_woods locations (admin may have accidentally created extras).
  // Keep only the 4 canonical location IDs.
  try {
    const dupeResult = await db.execute(sql`
      DELETE FROM world_locations
      WHERE world_id = 'haunted_woods'
        AND id NOT IN (
          'e2f3a4b5-0001-4000-8000-000000000001',
          'e2f3a4b5-0002-4000-8000-000000000002',
          'e2f3a4b5-0003-4000-8000-000000000003',
          'e2f3a4b5-0004-4000-8000-000000000004'
        )
    `);
    const dupeCount = (dupeResult as any).rowCount ?? 0;
    if (dupeCount > 0) console.log(`Deleted ${dupeCount} duplicate haunted_woods location(s).`);
    else console.log("No duplicate haunted_woods locations found.");
  } catch (err) {
    console.error("Haunted Woods duplicate location cleanup error (non-fatal):", err);
  }


  // Always refresh the volcanic fortress background
  try {
    const fortressBgFile = "bg_lava_fortress_volcanic.png";
    const fortressBgPath = path.join(process.cwd(), "attached_assets", fortressBgFile);
    if (fs.existsSync(fortressBgPath)) {
      const v = Math.floor(fs.statSync(fortressBgPath).mtimeMs / 1000);
      const fortressBgUrl = `/world-assets/${fortressBgFile}?v=${v}`;
      await db.execute(
        sql`UPDATE world_locations SET bg_url = ${fortressBgUrl} WHERE id = 'c3d4e5f6-0005-4000-8000-000000000005'`
      );
      console.log(`Volcanic fortress bg refreshed (${fortressBgUrl}).`);
    }
  } catch (err) {
    console.error("Volcanic fortress bg refresh error (non-fatal):", err);
  }

  // Always refresh the volcanic fishing spot background using raw SQL (runs AFTER all seeding,
  // so the row is guaranteed to exist). Uses sql.raw() to embed the UUID directly — Drizzle's
  // parameterized sql`` template silently returns 0 rows for this auto-generated UUID against
  // the varchar PK column, while raw SQL UPDATE works correctly (confirmed via executeSql).
  try {
    const volcFishBgFile = "bg_fishing_volcanic.png";
    const volcFishBgPath = path.join(process.cwd(), "attached_assets", volcFishBgFile);
    if (fs.existsSync(volcFishBgPath)) {
      const v = Math.floor(fs.statSync(volcFishBgPath).mtimeMs / 1000);
      const volcBgUrl = `/world-assets/${volcFishBgFile}?v=${v}`;
      // Update by world_id+type instead of UUID — avoids parameterization quirks
      // with auto-generated UUIDs that cause db.execute(sql`...`) to silently match 0 rows.
      const result = await db.execute(
        sql`UPDATE world_locations SET bg_url = ${volcBgUrl} WHERE world_id = 'volcanic' AND type = 'fishing' AND is_shop = false`
      );
      const affected = (result as any).count ?? (result as any).rowCount ?? "?";
      console.log(`Volcanic fishing spot bg refreshed (${volcBgUrl}) — ${affected} row(s).`);
    }
  } catch (err) {
    console.error("Volcanic fishing spot bg refresh error (non-fatal):", err);
  }

  // One-time: rename Bayou's Heart → The Mixing Tree
  try {
    const mixingTreeRenameDone = await storage.getGameSetting("mixing_tree_rename_v1");
    if (!mixingTreeRenameDone) {
      const MIXING_TREE_ID = "8e211716-0448-496e-8582-6ce1025ac4e4";
      await db.execute(sql`UPDATE world_locations SET name = 'The Mixing Tree' WHERE id = ${MIXING_TREE_ID} AND name = 'Bayou''s Heart'`);
      await storage.setGameSetting("mixing_tree_rename_v1", "done");
      console.log("Renamed Bayou's Heart → The Mixing Tree.");
    }
  } catch (err) {
    console.error("Mixing Tree rename error (non-fatal):", err);
  }

  // ── Seed Haunted Woods locations ──────────────────────────────────────────
  try {
    const hauntedWoodsLocsDone = await storage.getGameSetting("haunted_woods_locations_v1");
    if (!hauntedWoodsLocsDone) {
      const HAUNTED_LOCS = [
        {
          id: "e2f3a4b5-0001-4000-8000-000000000001",
          name: "The Spectral Grove",
          description: "A sinister haunted casino lurking in the darkest corner of the woods. Ghostly slots and phantom poker await the brave.",
          iconFile: "icon_spectral_grove.png",
          bgFile: null as string | null,
          type: "landmark",
          posX: 70, posY: 25,
          glowColor: "#8b00ff",
          sortOrder: 1,
          isShop: false,
        },
        {
          id: "e2f3a4b5-0002-4000-8000-000000000002",
          name: "The Cauldron's Creep",
          description: "A mysterious apothecary hidden deep in the haunted forest, bubbling with potions, charms, and dark wares.",
          iconFile: "icon_cauldrons_creep.png",
          bgFile: "bg_cauldrons_creep.png" as string | null,
          type: "shop",
          posX: 30, posY: 30,
          glowColor: "#7b2fbe",
          sortOrder: 2,
          isShop: true,
        },
        {
          id: "e2f3a4b5-0003-4000-8000-000000000003",
          name: "Phantom Hollow",
          description: "A haunted pond shrouded in purple mist, its dark waters teeming with spectral fish and ancient creatures.",
          iconFile: "icon_haunted_pond.png",
          bgFile: "bg_haunted_pond.png" as string | null,
          type: "fishing",
          posX: 50, posY: 60,
          glowColor: "#2e8b8b",
          sortOrder: 3,
          isShop: false,
        },
        {
          id: "e2f3a4b5-0004-4000-8000-000000000004",
          name: "The Haunted Menagerie",
          description: "A spooky pet emporium nestled among twisted trees, selling ghostly companions and cursed creatures.",
          iconFile: "icon_haunted_pet_shop.png",
          bgFile: "bg_haunted_pet_shop.png" as string | null,
          type: "shop",
          posX: 20, posY: 70,
          glowColor: "#5c2d91",
          sortOrder: 4,
          isShop: true,
        },
      ];

      for (const loc of HAUNTED_LOCS) {
        const existing = await db.execute(sql`SELECT id FROM world_locations WHERE id = ${loc.id}`);
        if ((existing as any).rows?.length === 0) {
          const iconData = loadAssetBase64(loc.iconFile);
          const bgData = loc.bgFile ? loadAssetBase64(loc.bgFile) : null;
          await db.execute(sql`
            INSERT INTO world_locations
              (id, world_id, name, type, description, pos_x, pos_y, glow_color, icon_size, sort_order, is_shop, icon_url, bg_url)
            VALUES (
              ${loc.id}, 'haunted_woods', ${loc.name}, ${loc.type},
              ${loc.description}, ${loc.posX}, ${loc.posY}, ${loc.glowColor},
              350, ${loc.sortOrder}, ${loc.isShop},
              ${iconData ?? null}, ${bgData ?? null}
            )
          `);
          console.log(`Haunted Woods: ${loc.name} created.`);
        } else {
          console.log(`Haunted Woods: ${loc.name} already exists, skipping.`);
        }
      }
      await storage.setGameSetting("haunted_woods_locations_v1", "done");
      console.log("Haunted Woods locations seeded.");
    }
  } catch (err) {
    console.error("Haunted Woods location seed error (non-fatal):", err);
  }

  // ── Haunted Woods: ensure all 4 locations have the correct dark blue-purple glow color ──
  try {
    await db.execute(sql`
      UPDATE world_locations
      SET glow_color = '#2244cc'
      WHERE world_id = 'haunted_woods'
        AND (glow_color IS NULL OR glow_color != '#2244cc')
    `);
  } catch (err) {
    console.error("Haunted Woods glow color fix error (non-fatal):", err);
  }

  // ── Volcanic: fishing spots get fire red-orange glow ──
  try {
    await db.execute(sql`
      UPDATE world_locations
      SET glow_color = '#f97316'
      WHERE world_id = 'volcanic' AND type = 'fishing' AND is_shop = false
    `);
    console.log("Volcanic fishing spots: glow color set to fire orange.");
  } catch (err) {
    console.error("Volcanic fishing glow fix error (non-fatal):", err);
  }

  // ── Swamp/Bayou: unified dark blue-green glow for all locations ──
  try {
    await db.execute(sql`
      UPDATE world_locations
      SET glow_color = '#0e7490'
      WHERE world_id = 'swamp'
    `);
    console.log("Swamp locations: glow color set to dark blue-green.");
  } catch (err) {
    console.error("Swamp glow fix error (non-fatal):", err);
  }

  // ── Soul Pond: rename Phantom Hollow → Soul Pond, change type to quest, update bg ──
  // Idempotent: runs always but WHERE clause guards against overwriting admin edits
  try {
    const PHANTOM_HOLLOW_ID = "e2f3a4b5-0003-4000-8000-000000000003";
    const bgData = loadAssetBase64("bg_soul_pond.png");
    const result = await db.execute(sql`
      UPDATE world_locations
      SET name        = 'Soul Pond',
          type        = 'fishing',
          is_shop     = false,
          description = 'A haunting body of still water reflecting the pale moon, whispered to harbor spectral fish of legend. Cast your line and see what the dead left behind.',
          bg_url      = COALESCE(${bgData ?? null}, bg_url)
      WHERE id = ${PHANTOM_HOLLOW_ID}
        AND world_id = 'haunted_woods'
    `);
    const affected = (result as any).count ?? (result as any).rowCount ?? 0;
    if (affected > 0) console.log("Soul Pond: location updated.");
    else console.log("Soul Pond: already up to date or not found.");
  } catch (err) {
    console.error("Soul Pond migration error (non-fatal):", err);
  }

  // ── Haunted Woods bg final pass — must run AFTER Soul Pond migration ──
  // LOC_BG_ALWAYS_REFRESH runs early (line ~1167), but Soul Pond migration can
  // overwrite bg_url with base64. This block has the final word every restart.
  try {
    const hwBgFinal: Record<string, string> = {
      "e2f3a4b5-0001-4000-8000-000000000001": "bg_spectral_grove.png",
      "e2f3a4b5-0002-4000-8000-000000000002": "bg_cauldrons_creep_v2.png",
      "e2f3a4b5-0003-4000-8000-000000000003": "bg_soul_pond_v2.png",
      "e2f3a4b5-0004-4000-8000-000000000004": "bg_haunted_menagerie_v2.png",
    };
    for (const [locId, bgFile] of Object.entries(hwBgFinal)) {
      const assetPath = path.join(process.cwd(), "attached_assets", bgFile);
      if (!fs.existsSync(assetPath)) { console.warn(`HW bg final: ${bgFile} not found, skipping ${locId}`); continue; }
      const mtime = fs.statSync(assetPath).mtimeMs;
      const v = Math.floor(mtime / 1000);
      const bgUrl = `/world-assets/${bgFile}?v=${v}`;
      await db.execute(sql`UPDATE world_locations SET bg_url = ${bgUrl} WHERE id = ${locId}`);
      console.log(`HW bg final: set ${bgFile} for ${locId}`);
    }
  } catch (err) {
    console.error("Haunted Woods bg final pass error (non-fatal):", err);
  }

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
      ["shop_items",              "id", "image_url"],
      ["shop_items",              "id", "egg_image_url"],
      ["shop_items",              "id", "hatched_image_url"],
      ["shop_items",              "id", "hookless_image_url"],
      ["badges",                  "id", "image_url"],
      ["enemies",                 "id", "image_url"],
      ["location_enemies",        "id", "image_url"],
      ["house_bundles",           "id", "shop_image_url"],
      ["house_bundles",           "id", "bg_image_url"],
      ["house_bundle_buildings",  "id", "image_url"],
      ["house_bundle_buildings",  "id", "interior_image_url"],
      ["pet_templates",           "id", "sleeping_image_url"],
      ["pet_template_parts",      "id", "image_url"],
      ["fish_template_parts",     "id", "image_url"],
      ["location_objects",        "id", "image_url"],
      ["world_decor_placements",  "id", "image_url"],
      ["world_chat_messages",     "id", "profile_image"],
      ["users",                   "id", "profile_image"],
      ["gifts",                   "id", "item_image_url"],
      ["world_locations",         "id", "icon_url"],
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
  // Seed sample pet templates + a demo admin so /world, the home page,
  // Pet Care, PvP, and the Test Animator all render real pets on a fresh
  // database (no manual admin setup required). Runs BEFORE the bot seeder
  // because the PvP bot seeder needs at least one pet shop item to attach
  // bot inventory rows to. Idempotent on reboot.
  try { await seedSampleTemplates(); }
  catch (err) { console.error("seedSampleTemplates error (non-fatal):", err); }

  // Seed persistent PvP bot opponents so players can battle even when no
  // human has set a battle group yet. Idempotent — bails fast on reboot.
  try { await seedPvpBots(); }
  catch (err) { console.error("seedPvpBots error (non-fatal):", err); }
  })().catch(err => console.error("Background init error:", err));
})();
