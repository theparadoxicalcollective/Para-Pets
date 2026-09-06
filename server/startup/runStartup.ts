import type { Express, NextFunction, Request, Response } from "express";
import type { Server } from "http";
import { registerRoutes } from "../routes";
import { registerDailyClaimRoutes } from "../routes/dailyClaim.routes";
import { registerClientDiagnosticsRoutes } from "../routes/clientDiagnostics.routes";
import { registerGinnyQuestRoutes } from "../routes/ginnyQuest.routes";
import { serveStatic } from "../static";
import { pool } from "../db";
import { reconcileCanonicalWorldMaps } from "../worlds/canonicalWorldMaps";
import { reconcileHauntedWoodsWorld } from "../worlds/hauntedWoods";
import { runEssentialBoot } from "./migrations/runEssentialBoot";
import { ensureHauntedBingoSchema } from "./migrations/ensureHauntedBingo";
import { ensureGinnyQuestSchema } from "./migrations/ensureGinnyQuest";
import { repairAccessoryEquipmentIntegrity } from "./migrations/repairAccessoryEquipmentIntegrity";
import { runNonCriticalStartup } from "./backfills/runNonCriticalStartup";
import { tagSquirrelFoxAnimationProfile } from "./backfills/tagSquirrelFoxAnimationProfile";
import { withStartupAdvisoryLock } from "./advisoryLock";

interface StartupDependencies {
  app: Express;
  httpServer: Server;
  log: (message: string, source?: string) => void;
}

async function runBackgroundInitialization(): Promise<void> {
  try {
    await runNonCriticalStartup();
    // Runs after the legacy non-critical migrations so pet_templates.idle_style
    // is guaranteed to exist. The update is idempotent and only targets the
    // Forest Squirrel Fox template, leaving every other pet profile untouched.
    await tagSquirrelFoxAnimationProfile();
  } finally {
    // Keep both focused reconciliations independent: even if the Haunted Woods
    // location repair hits an unrelated data problem, the requested canonical
    // world-map backgrounds still receive the final word for this boot.
    try {
      // The legacy backfill understands older Haunted Woods databases. The
      // focused reconciliation runs afterward so canonical world locations and
      // source-controlled assets win without replacing admin placement values.
      await reconcileHauntedWoodsWorld();
    } finally {
      // Apply the current source-controlled world-map art after every legacy
      // background backfill. This updates only the world background URLs; the
      // world IDs, locations, hotspot placement, and destination behavior remain
      // untouched. Volcanic keeps its existing one-shot/admin-safe semantics.
      await reconcileCanonicalWorldMaps();
    }
  }
}

export async function runStartup({ app, httpServer, log }: StartupDependencies): Promise<void> {
  await runEssentialBoot();
  await ensureHauntedBingoSchema();
  await ensureGinnyQuestSchema();

  // Accessory ownership/equipment is persisted player state and must be valid
  // before any inventory or Closet route can answer. Older versions allowed
  // stacked accessory rows and duplicate equipment references, so repair and
  // constrain that state synchronously before registering routes.
  await repairAccessoryEquipmentIntegrity();

  // Register focused infrastructure routes before the legacy route monolith.
  // Diagnostics must exist in production even if the failing feature is owned
  // by a later route module, and it intentionally accepts both authenticated
  // and unauthenticated browser failures.
  registerClientDiagnosticsRoutes(app);

  // Register focused quest/claim implementations before the legacy route
  // monolith. Ginny's quest owns its dedicated endpoints and remains isolated
  // from the daily-quest reset/progress system.
  registerDailyClaimRoutes(app);
  registerGinnyQuestRoutes(app);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") serveStatic(app);
  else {
    const { setupVite } = await import("../vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => { log(`serving on port ${port}`); });

  void withStartupAdvisoryLock(pool, runBackgroundInitialization)
    .then((ran) => { if (!ran) console.log("Background initialization is already running on another instance; skipping this boot."); })
    .catch((err) => console.error("Background init error:", err));
}
