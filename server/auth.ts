import type { NextFunction, Request, Response } from "express";
import { storage } from "./storage";

type AuthStorage = Pick<typeof storage, "getUser" | "unbanUser">;

export function createAuthMiddleware(authStorage: AuthStorage) {
  /** Require an active, non-banned session for player-owned routes. */
  async function requireAuthenticated(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as { id: string; isBanned?: boolean; banUntil?: Date | null };
    if (!user.isBanned) return next();
    if (user.banUntil && new Date(user.banUntil) <= new Date()) {
      await authStorage.unbanUser(user.id);
      user.isBanned = false;
      return next();
    }
    req.logout(() => {});
    return res.status(403).json({ message: "This account has been banished from the realm" });
  }

  /** Require a current, verified administrator account for privileged routes. */
  async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = await authStorage.getUser((req.user as { id: string }).id);
    if (!user || !user.isAdmin || !user.emailVerified) {
      return res.status(403).json({ message: "Verified administrator access required" });
    }
    if (user.isBanned) return res.status(403).json({ message: "This account has been banished from the realm" });
    req.user = user;
    return next();
  }

  return { requireAuthenticated, requireAdmin };
}

export const { requireAuthenticated, requireAdmin } = createAuthMiddleware(storage);
