import type { Express, RequestHandler } from "express";

type AvatarStorage = Pick<
  typeof import("../storage").storage,
  "getUsersAvatars"
>;

export interface AvatarRouteDependencies {
  storage: AvatarStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Batch avatar retrieval used by leaderboard/chat/profile surfaces.
 *
 * Preserves the existing authentication boundary, string-id filtering,
 * empty-request shortcut, 200-id cap, private cache header, and errors.
 */
export function registerAvatarRoutes(
  app: Express,
  { storage, isAuthenticated }: AvatarRouteDependencies,
): void {
  app.post("/api/users/avatars", isAuthenticated, async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.userIds)
        ? req.body.userIds.filter((x: any) => typeof x === "string")
        : [];
      if (ids.length === 0) return res.json({});

      const capped = ids.slice(0, 200);
      const map = await storage.getUsersAvatars(capped);
      res.set("Cache-Control", "private, max-age=60");
      return res.json(map);
    } catch (err: any) {
      return res.status(500).json({
        message: err.message || "Failed to fetch avatars",
      });
    }
  });
}
