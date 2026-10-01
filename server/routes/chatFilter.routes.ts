import type { Express, RequestHandler } from "express";

type ChatFilterStorage = Pick<typeof import("../storage").storage,
  | "getChatFilterWords"
  | "addChatFilterWord"
  | "deleteChatFilterWord"
>;

export interface ChatFilterRouteDependencies {
  storage: ChatFilterStorage;
  isAuthenticated: RequestHandler;
  baseBadWords: string[];
}

/**
 * Admin/moderator management for custom world-chat filter words.
 *
 * The base filter vocabulary remains owned by the world-chat implementation
 * and is injected here so this extraction does not change filtering behavior.
 */
export function registerChatFilterRoutes(
  app: Express,
  { storage, isAuthenticated, baseBadWords }: ChatFilterRouteDependencies,
): void {
  app.get("/api/admin/chat-filter", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin && !user.isModerator) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const custom = await storage.getChatFilterWords();
      return res.json({ baseWords: baseBadWords, customWords: custom });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/chat-filter", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin && !user.isModerator) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { word } = req.body;
      if (!word || typeof word !== "string" || !word.trim()) {
        return res.status(400).json({ message: "Word required" });
      }
      const row = await storage.addChatFilterWord(word.trim(), user.username);
      return res.json(row);
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ message: "Word already in filter list" });
      }
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/chat-filter/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin && !user.isModerator) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteChatFilterWord(String(req.params.id));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
