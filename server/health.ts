import type { Express } from "express";

/** Register the database-free liveness endpoint used by Railway. */
export function registerHealthRoute(app: Express): void {
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
}
