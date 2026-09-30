import type { Express, Request, RequestHandler, Response } from "express";

export interface FriendsRouteDependencies {
  storage: typeof import("../storage").storage;
  isAuthenticated: RequestHandler;
}

/**
 * Friends and notifications routes extracted from the legacy route registry
 * without changing endpoint URLs, limits, notification behavior, response
 * shapes, or authentication rules.
 */
export function registerFriendsRoutes(
  app: Express,
  { storage, isAuthenticated }: FriendsRouteDependencies,
): void {
  // ── Friends ────────────────────────────────────────────────────────────────

  app.post("/api/friends/request/:targetUserId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const requesterId = (req.user as any).id;
      const { targetUserId } = req.params as Record<string, string>;
      if (requesterId === targetUserId) return res.status(400).json({ message: "Cannot friend yourself" });
      const outgoingCount = await storage.getOutgoingPendingRequestCount(requesterId);
      if (outgoingCount >= 25) return res.status(400).json({ message: "You have reached the limit of 25 unanswered friend requests. Wait for some to be accepted before sending more." });
      const result = await storage.sendFriendRequest(requesterId, targetUserId);
      // Notify the recipient about the new friend request
      const requester = await storage.getUser(requesterId);
      if (requester) {
        await storage.createNotification(
          targetUserId,
          "friend_request",
          `${requester.username} sent you a friend request!`
        );
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: "Failed to send friend request" });
    }
  });

  app.get("/api/friends/requests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const requests = await storage.getPendingFriendRequests(userId);
      return res.json(requests);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get friend requests" });
    }
  });

  app.get("/api/friends/requests/count", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const count = await storage.getPendingFriendRequestCount(userId);
      return res.json({ count });
    } catch (err) {
      return res.status(500).json({ message: "Failed to get request count" });
    }
  });

  app.post("/api/friends/accept/:requestId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { requestId } = req.params as Record<string, string>;

      // Enforce 100-friend cap for the receiver before accepting
      const receiverFriends = await storage.getFriends(userId);
      if (receiverFriends.length >= 100) {
        return res.status(400).json({ message: "You have reached the 100-friend limit" });
      }

      const result = await storage.acceptFriendRequest(requestId, userId);
      if (!result) return res.status(404).json({ message: "Request not found" });

      // Also enforce cap for the requester
      const requesterFriends = await storage.getFriends(result.requesterId);
      if (requesterFriends.length > 100) {
        // Undo
        await storage.removeFriendOrRequest(userId, result.requesterId);
        return res.status(400).json({ message: "The other player has reached the 100-friend limit" });
      }
      const accepter = await storage.getUser(userId);
      if (accepter) {
        await storage.createNotification(
          result.requesterId,
          "friend_accepted",
          `${accepter.username} accepted your friend request!`
        );
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: "Failed to accept friend request" });
    }
  });

  app.get("/api/notifications/unread", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const notifs = await storage.getUnreadNotifications(userId);
      return res.json(notifs);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.post("/api/notifications/mark-read", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      await storage.markNotificationsRead(userId);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to mark notifications read" });
    }
  });

  app.delete("/api/friends/:otherId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { otherId } = req.params as Record<string, string>;
      await storage.removeFriendOrRequest(userId, otherId);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to remove friend" });
    }
  });

  app.get("/api/friends", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const friends = await storage.getFriends(userId);
      return res.json(friends);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get friends" });
    }
  });

  app.get("/api/friends/status/:otherId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { otherId } = req.params as Record<string, string>;
      const friendship = await storage.getFriendshipStatus(userId, otherId);
      return res.json({ friendship });
    } catch (err) {
      return res.status(500).json({ message: "Failed to get friendship status" });
    }
  });


}
