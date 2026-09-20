import type { Express, Request, Response } from "express";
import { requireAuthenticated } from "../auth";
import {
  BeauPrizeWheelError,
  clearBeauPrizeSlot,
  getBeauPrizeOptions,
  getBeauPrizeWheelState,
  saveBeauPrizeSlot,
  saveBeauWheelLayout,
  spinBeauPrizeWheel,
} from "../beauPrizeWheel";

function sendError(res: Response, error: unknown, operation: string) {
  if (error instanceof BeauPrizeWheelError) {
    return res.status(error.status).json({ errorCode: error.code, message: error.message });
  }
  console.error("[beau-prize-wheel] " + operation + " failed", error);
  return res.status(500).json({ message: "Beau's prize wheel stumbled safely. Please try again." });
}

function adminUser(req: Request): boolean {
  return Boolean((req.user as any)?.isAdmin);
}

function parseSlot(value: string): number {
  const slot = Number(value);
  return Number.isInteger(slot) ? slot : -1;
}

export function registerBeauPrizeWheelRoutes(app: Express): void {
  app.get("/api/beau-prize-wheel", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      return res.json({
        ...(await getBeauPrizeWheelState(user.id)),
        isAdmin: Boolean(user?.isAdmin),
      });
    } catch (error) {
      return sendError(res, error, "state");
    }
  });

  app.get("/api/admin/beau-prize-wheel/options", requireAuthenticated, async (req: Request, res: Response) => {
    if (!adminUser(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      return res.json(await getBeauPrizeOptions());
    } catch (error) {
      return sendError(res, error, "options");
    }
  });

  app.put("/api/admin/beau-prize-wheel/layout", requireAuthenticated, async (req: Request, res: Response) => {
    if (!adminUser(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      return res.json({ layout: await saveBeauWheelLayout(req.body) });
    } catch (error) {
      return sendError(res, error, "save wheel placement");
    }
  });

  app.put("/api/admin/beau-prize-wheel/slots/:slot", requireAuthenticated, async (req: Request, res: Response) => {
    if (!adminUser(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const user = req.user as any;
      await saveBeauPrizeSlot(parseSlot(String(req.params.slot)), req.body);
      return res.json({
        ...(await getBeauPrizeWheelState(user.id)),
        isAdmin: true,
      });
    } catch (error) {
      return sendError(res, error, "save prize");
    }
  });

  app.delete("/api/admin/beau-prize-wheel/slots/:slot", requireAuthenticated, async (req: Request, res: Response) => {
    if (!adminUser(req)) return res.status(403).json({ message: "Forbidden" });
    try {
      const user = req.user as any;
      await clearBeauPrizeSlot(parseSlot(String(req.params.slot)));
      return res.json({
        ...(await getBeauPrizeWheelState(user.id)),
        isAdmin: true,
      });
    } catch (error) {
      return sendError(res, error, "clear prize");
    }
  });

  app.post("/api/beau-prize-wheel/spin", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      return res.json(await spinBeauPrizeWheel(user.id, req.body?.actionId));
    } catch (error) {
      return sendError(res, error, "spin");
    }
  });
}
