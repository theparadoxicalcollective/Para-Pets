import type { Express, RequestHandler } from "express";

type PrivacyPolicyStorage = Pick<
  typeof import("../storage").storage,
  "getGameSetting" | "setGameSetting"
>;

export interface PrivacyPolicyRouteDependencies {
  storage: PrivacyPolicyStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Public privacy-policy read and authenticated administrator write routes.
 *
 * Preserves the existing storage key, validation, permission check, responses,
 * status codes, and fixed error messages.
 */
export function registerPrivacyPolicyRoutes(
  app: Express,
  { storage, isAuthenticated }: PrivacyPolicyRouteDependencies,
): void {
  app.get("/api/privacy-policy", async (_req, res) => {
    try {
      const text = await storage.getGameSetting("privacy_policy");
      return res.json({ text: text ?? "" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to load privacy policy" });
    }
  });

  app.post("/api/admin/privacy-policy", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { text } = req.body;
      if (typeof text !== "string") {
        return res.status(400).json({ message: "text required" });
      }
      await storage.setGameSetting("privacy_policy", text);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to save privacy policy" });
    }
  });
}
