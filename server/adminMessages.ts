import type { RequestHandler } from "express";

/** Restrict message deletion to the player whose username owns the message. */
export function deleteOwnedAdminMessage(
  deleteForUsername: (id: string, username: string) => Promise<boolean>,
): RequestHandler {
  return async (req, res) => {
    try {
      const username = (req.user as { username: string }).username;
      const deleted = await deleteForUsername(req.params.id as string, username);
      if (!deleted) return res.status(404).json({ message: "Message not found" });
      return res.json({ message: "Deleted" });
    } catch {
      return res.status(500).json({ message: "Failed to delete message" });
    }
  };
}
