import type { Express } from "express";

type VeridianWatcherQuoteStorage = Pick<typeof import("../storage").storage,
  | "getVWQuotes"
  | "addVWQuote"
  | "deleteVWQuote"
>;

export interface VeridianWatcherQuoteRouteDependencies {
  storage: VeridianWatcherQuoteStorage;
}

/**
 * Veridian Watcher quote administration.
 *
 * This module intentionally preserves the legacy permission behavior exactly:
 * the handlers inspect req.user directly rather than adding a new auth
 * middleware boundary as part of this refactor.
 */
export function registerVeridianWatcherQuoteRoutes(
  app: Express,
  { storage }: VeridianWatcherQuoteRouteDependencies,
): void {
  app.get("/api/admin/vw-quotes", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.isAdmin && !user?.isModerator) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const quotes = await storage.getVWQuotes();
      return res.json(quotes);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/vw-quotes", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.isAdmin && !user?.isModerator) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { message } = req.body;
      if (!message?.trim()) {
        return res.status(400).json({ message: "Message is required" });
      }
      const quote = await storage.addVWQuote(message.trim(), user.username);
      return res.json(quote);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/vw-quotes/:id", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.isAdmin && !user?.isModerator) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteVWQuote(req.params.id);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
