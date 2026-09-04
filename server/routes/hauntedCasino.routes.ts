import type { Express, RequestHandler, Response } from "express";
import { db } from "../db";
import { getSlotPrizeOptions, saveSlotPrizeSelection, SlotPrizeValidationError } from "../hauntedSlotPrizes";
import {
  HauntedCasinoError,
  getHauntedCasinoHotspots,
  getHauntedSlotState,
  saveHauntedCasinoHotspots,
  spinHauntedSlots,
} from "../hauntedCasino";
import {
  HauntedBingoError,
  callHauntedBingoBall,
  getHauntedBingoState,
  markHauntedBingoCell,
  startHauntedBingoRound,
} from "../hauntedBingo";

function sendBingoError(res: Response, error: unknown, operation: string) {
  if (error instanceof HauntedBingoError) {
    return res.status(error.status).json({ errorCode: error.code, message: error.message });
  }
  console.error(`[haunted-casino] Bingo ${operation} failed`, error);
  return res.status(500).json({ message: "Haunted Bingo stumbled safely. Please try again." });
}

export function registerHauntedCasinoRoutes(
  app: Express,
  { isAuthenticated }: { isAuthenticated: RequestHandler },
): void {
  app.get("/api/haunted-casino/config", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      return res.json({
        hotspots: await getHauntedCasinoHotspots(),
        isAdmin: Boolean(user?.isAdmin),
      });
    } catch (error) {
      console.error("[haunted-casino] config failed", error);
      return res.status(500).json({ message: "The casino floor could not be loaded" });
    }
  });

  app.put("/api/admin/haunted-casino/hotspots", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden" });
      return res.json({ hotspots: await saveHauntedCasinoHotspots(req.body?.hotspots) });
    } catch (error) {
      console.error("[haunted-casino] hotspot save failed", error);
      return res.status(500).json({ message: "Casino hotspot layout could not be saved" });
    }
  });

  app.get("/api/admin/haunted-casino/prizes", isAuthenticated, async (req, res) => {
    if (!(req.user as any)?.isAdmin) return res.status(403).json({ message: "Forbidden" });
    try {
      return res.json(await getSlotPrizeOptions(db));
    } catch (error) {
      console.error("[haunted-casino] prize options failed", error);
      return res.status(500).json({ message: "Prize options could not be loaded" });
    }
  });

  app.put("/api/admin/haunted-casino/prizes/:kind", isAuthenticated, async (req, res) => {
    if (!(req.user as any)?.isAdmin) return res.status(403).json({ message: "Forbidden" });
    const kind = req.params.kind;
    if (kind !== "items" && kind !== "eggs") return res.status(400).json({ message: "Choose items or eggs" });
    try {
      await saveSlotPrizeSelection(db, kind, req.body?.ids);
      return res.json({ saved: true });
    } catch (error) {
      if (error instanceof SlotPrizeValidationError) return res.status(400).json({ message: error.message });
      console.error("[haunted-casino] prize save failed", error);
      return res.status(500).json({ message: "Prize selection could not be saved" });
    }
  });

  app.get("/api/haunted-casino/bingo", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      return res.json(await getHauntedBingoState(user.id));
    } catch (error) {
      return sendBingoError(res, error, "state");
    }
  });

  app.post("/api/haunted-casino/bingo/start", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      return res.json(await startHauntedBingoRound(user.id));
    } catch (error) {
      return sendBingoError(res, error, "start");
    }
  });

  app.post("/api/haunted-casino/bingo/:roundId/call", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      return res.json(await callHauntedBingoBall(user.id, req.params.roundId as string));
    } catch (error) {
      return sendBingoError(res, error, "call");
    }
  });

  app.put("/api/haunted-casino/bingo/:roundId/mark", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      return res.json(await markHauntedBingoCell(
        user.id,
        req.params.roundId as string,
        req.body?.row,
        req.body?.column,
        req.body?.marked,
      ));
    } catch (error) {
      return sendBingoError(res, error, "mark");
    }
  });

  app.get("/api/haunted-casino/slots", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      return res.json(await getHauntedSlotState(user.id));
    } catch (error) {
      if (error instanceof HauntedCasinoError) {
        return res.status(error.status).json({ errorCode: error.code, message: error.message });
      }
      console.error("[haunted-casino] slot state failed", error);
      return res.status(500).json({ message: "Slaughter Slots could not be loaded" });
    }
  });

  app.post("/api/haunted-casino/slots/spin", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      return res.json(await spinHauntedSlots(user.id, req.body?.bet));
    } catch (error) {
      if (error instanceof HauntedCasinoError) {
        return res.status(error.status).json({ errorCode: error.code, message: error.message });
      }
      console.error("[haunted-casino] spin failed", error);
      return res.status(500).json({ message: "The reels jammed safely. Please try again." });
    }
  });
}
