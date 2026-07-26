import type { Express, NextFunction, Request, Response } from "express";
import type { Server } from "http";
import { registerRoutes } from "../routes";
import { serveStatic } from "../static";
import { pool } from "../db";
import { runEssentialBoot } from "./migrations/runEssentialBoot";
import { runNonCriticalStartup } from "./backfills/runNonCriticalStartup";
import { withStartupAdvisoryLock } from "./advisoryLock";

interface StartupDependencies {
  app: Express;
  httpServer: Server;
  log: (message: string, source?: string) => void;
}

export async function runStartup({ app, httpServer, log }: StartupDependencies): Promise<void> {
  await runEssentialBoot();
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

  void withStartupAdvisoryLock(pool, runNonCriticalStartup)
    .then((ran) => { if (!ran) console.log("Background initialization is already running on another instance; skipping this boot."); })
    .catch((err) => console.error("Background init error:", err));
}
