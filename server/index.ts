import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";

import { createServer } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { WebhookHandlers } from "./webhookHandlers";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import { registerHealthRoute } from "./health";
import { runStartup } from "./startup/runStartup";
import { registerBuildInfoRoute } from "./buildInfo";

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
registerHealthRoute(app);
registerBuildInfoRoute(app);

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

// Thumbnail middleware — /world-assets/<file>?w=N serves a Sharp-resized WebP.
// Cached in /tmp/world-thumbs so the resize only runs once per image+width.
// Falls through to the express.static handler for requests without ?w=.
app.get("/world-assets/:filename", async (req: Request, res: Response, next: NextFunction) => {
  const { w } = req.query;
  if (!w) return next();
  const width = parseInt(String(w), 10);
  if (isNaN(width) || width < 10 || width > 3000) return next();
  const rawFilename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filename = decodeURIComponent(rawFilename).replace(/\.\./g, "");
  const srcPath = path.join(process.cwd(), "attached_assets", filename);
  if (!fs.existsSync(srcPath)) return next();
  const cacheDir = "/tmp/world-thumbs";
  const safeBase = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cacheFile = path.join(cacheDir, `${safeBase}_${width}w.webp`);
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    if (!fs.existsSync(cacheFile)) {
      await sharp(srcPath).resize(width, null, { withoutEnlargement: true }).webp({ quality: 82 }).toFile(cacheFile);
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    return res.sendFile(cacheFile);
  } catch (err) {
    console.error("world-assets thumb error:", err);
    return next();
  }
});

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
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

void runStartup({ app, httpServer, log });
