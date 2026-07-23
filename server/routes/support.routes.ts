import type { Express, RequestHandler } from "express";
import { deleteOwnedAdminMessage } from "../adminMessages";

type SupportStorage = Pick<typeof import("../storage").storage,
  | "createAdminMessage"
  | "deleteAdminMessageForUsername"
  | "deleteSupportMessage"
  | "getAdminMessagesByUsername"
  | "getAllSupportMessages"
  | "markSupportMessageRead"
>;

export interface SupportRouteDependencies {
  storage: SupportStorage;
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
}

/** Register the adjacent administrator-support and player admin-message routes. */
export function registerSupportRoutes(app: Express, dependencies: SupportRouteDependencies): void {
  const { storage, isAuthenticated, isAdmin } = dependencies;

  app.get("/api/admin/support-messages", isAdmin, async (_req, res) => {
    try {
      const messages = await storage.getAllSupportMessages();
      return res.json(messages);
    } catch (err) {
      console.error("Get support messages error:", err);
      return res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.patch("/api/admin/support-messages/:id/read", isAdmin, async (req, res) => {
    try {
      await storage.markSupportMessageRead((req.params.id as string));
      return res.json({ message: "Marked as read" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update message" });
    }
  });

  app.delete("/api/admin/support-messages/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteSupportMessage((req.params.id as string));
      return res.json({ message: "Message deleted" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete message" });
    }
  });

  app.post("/api/admin/support-messages/:id/respond", isAdmin, async (req, res) => {
    try {
      const { response, username, subject } = req.body;
      if (!response || typeof response !== "string" || !response.trim()) {
        return res.status(400).json({ message: "Response is required" });
      }
      if (!username || typeof username !== "string") {
        return res.status(400).json({ message: "Username is required" });
      }
      const messageSubject = subject ? `Re: ${subject}` : "Message from Admin";
      console.log("[admin-respond] Writing admin message");
      await storage.createAdminMessage(username.trim(), messageSubject, response.trim());
      console.log("[admin-respond] Success — message stored");
      return res.json({ message: "Response sent" });
    } catch (err) {
      console.error("[admin-respond] DB error:", err);
      return res.status(500).json({ message: "Failed to send response" });
    }
  });

  app.get("/api/admin-messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const user = req.user as any;
      console.log("[admin-messages] Fetching messages");
      const msgs = await storage.getAdminMessagesByUsername(user.username);
      console.log(`[admin-messages] Found ${msgs.length} message(s)`);
      return res.json(msgs);
    } catch (err) {
      console.error("[admin-messages] DB error:", err);
      return res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.delete(
    "/api/admin-messages/:id",
    isAuthenticated,
    deleteOwnedAdminMessage(storage.deleteAdminMessageForUsername.bind(storage)),
  );
}
