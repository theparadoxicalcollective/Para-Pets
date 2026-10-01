import type { Express, RequestHandler } from "express";

type WatcherShoutoutPreferenceStorage = Pick<typeof import("../storage").storage,
  | "getUser"
  | "setWatcherShoutoutsEnabled"
>;

export interface WatcherShoutoutPreferenceRouteDependencies {
  storage: WatcherShoutoutPreferenceStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Player preference for Veridian Watcher shoutouts.
 *
 * Preserves the existing authenticated GET/POST API contract, default value,
 * validation, user scoping, storage calls, and error messages.
 */
export function registerWatcherShoutoutPreferenceRoutes(
  app: Express,
  { storage, isAuthenticated }: WatcherShoutoutPreferenceRouteDependencies,
): void {
  app.get("/api/user/watcher-shoutouts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const fresh = await storage.getUser(user.id);
      return res.json({ enabled: fresh?.watcherShoutoutsEnabled ?? true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to get preference" });
    }
  });

  app.post("/api/user/watcher-shoutouts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }
      await storage.setWatcherShoutoutsEnabled(user.id, enabled);
      return res.json({ enabled });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update preference" });
    }
  });
}
