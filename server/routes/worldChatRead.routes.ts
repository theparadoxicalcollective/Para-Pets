import type { Express, RequestHandler } from "express";

type WorldChatReadStorage = Pick<
  typeof import("../storage").storage,
  "getWorldChatMessages"
>;

export interface WorldChatReadRouteDependencies {
  storage: WorldChatReadStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Authenticated world-chat history read route.
 *
 * This intentionally owns only the existing read endpoint. Chat filtering,
 * message creation, cleanup jobs, and Watcher behavior remain elsewhere.
 */
export function registerWorldChatReadRoute(
  app: Express,
  { storage, isAuthenticated }: WorldChatReadRouteDependencies,
): void {
  app.get("/api/world-chat", isAuthenticated, async (_req, res) => {
    try {
      const messages = await storage.getWorldChatMessages();
      return res.json(messages);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
