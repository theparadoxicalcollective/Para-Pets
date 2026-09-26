import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { db as database } from "../db";

interface ForumRouteDependencies {
  db: typeof database;
  isAuthenticated: RequestHandler;
}

export function registerForumRoutes(app: Express, { db, isAuthenticated }: ForumRouteDependencies): void {
  // ── Forum routes ────────────────────────────────────────────────────────────

  app.get("/api/forum/posts", async (req, res) => {
    try {
      const userId = (req.user as any)?.id ?? null;
      const rows = await db.execute(sql`
        SELECT fp.id, fp.title, fp.body, fp.image_url, fp.is_pinned, fp.is_read_only,
               fp.created_at, fp.updated_at,
               fp.author_id, u.username AS author_name, u.profile_image AS author_avatar,
               (SELECT COUNT(*)::int FROM forum_comments fc WHERE fc.post_id = fp.id) AS comment_count,
               (SELECT COUNT(*)::int FROM forum_post_likes fpl WHERE fpl.post_id = fp.id) AS like_count,
               CASE WHEN ${userId}::text IS NOT NULL AND EXISTS (
                 SELECT 1 FROM forum_post_likes WHERE post_id = fp.id AND user_id = ${userId}
               ) THEN true ELSE false END AS user_liked
        FROM forum_posts fp
        LEFT JOIN users u ON fp.author_id = u.id
        ORDER BY fp.is_pinned DESC, fp.created_at DESC
      `);
      return res.json(rows.rows);
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.get("/api/forum/posts/:id/comments", async (req, res) => {
    try {
      const userId = (req.user as any)?.id ?? null;
      const postId = req.params.id;
      const rows = await db.execute(sql`
        SELECT fc.id, fc.body, fc.created_at, fc.author_id,
               u.username AS author_name, u.profile_image AS author_avatar,
               (SELECT COUNT(*)::int FROM forum_comment_likes fcl WHERE fcl.comment_id = fc.id) AS like_count,
               CASE WHEN ${userId}::text IS NOT NULL AND EXISTS (
                 SELECT 1 FROM forum_comment_likes WHERE comment_id = fc.id AND user_id = ${userId}
               ) THEN true ELSE false END AS user_liked,
               (SELECT COUNT(*)::int FROM forum_comments r WHERE r.parent_comment_id = fc.id) AS reply_count
        FROM forum_comments fc
        JOIN users u ON fc.author_id = u.id
        WHERE fc.post_id = ${postId}
          AND fc.parent_comment_id IS NULL
        ORDER BY fc.created_at ASC
      `);
      const userHasCommented = userId
        ? (await db.execute(sql`
            SELECT 1 FROM forum_comments
            WHERE post_id = ${postId} AND author_id = ${userId} AND parent_comment_id IS NULL
            LIMIT 1
          `)).rows.length > 0
        : false;
      return res.json({ comments: rows.rows, userHasCommented });
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.post("/api/forum/posts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const { title, body = "", image_url = null, is_pinned = false } = req.body;
      if (!title?.trim()) return res.status(400).json({ message: "Title required" });
      const rows = await db.execute(sql`
        INSERT INTO forum_posts (title, body, image_url, is_pinned, author_id)
        VALUES (${title.trim()}, ${body.trim()}, ${image_url}, ${is_pinned}, ${user.id})
        RETURNING id, title, body, image_url, is_pinned, created_at
      `);
      return res.json(rows.rows[0]);
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/forum/posts/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const { title, body, image_url, is_pinned, is_read_only } = req.body;
      await db.execute(sql`
        UPDATE forum_posts
        SET title        = COALESCE(${title        ?? null}, title),
            body         = COALESCE(${body         ?? null}, body),
            image_url    = COALESCE(${image_url    ?? null}, image_url),
            is_pinned    = COALESCE(${is_pinned    ?? null}, is_pinned),
            is_read_only = COALESCE(${is_read_only ?? null}, is_read_only),
            updated_at   = now()
        WHERE id = ${req.params.id}
      `);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/forum/posts/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      await db.execute(sql`DELETE FROM forum_posts WHERE id = ${req.params.id}`);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.post("/api/forum/posts/:id/comments", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const postId = req.params.id;
      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ message: "Comment body required" });
      // Check read-only
      const postRows = await db.execute(sql`SELECT is_read_only FROM forum_posts WHERE id = ${postId}`);
      if ((postRows.rows[0] as any)?.is_read_only) {
        return res.status(403).json({ message: "This post is read only" });
      }
      // Enforce one top-level comment per player per post
      const existing = await db.execute(sql`
        SELECT 1 FROM forum_comments
        WHERE post_id = ${postId} AND author_id = ${user.id} AND parent_comment_id IS NULL
        LIMIT 1
      `);
      if (existing.rows.length > 0) {
        return res.status(409).json({ message: "You've already commented on this post. Click Reply on your comment to continue the discussion." });
      }
      // Banned words filter
      const filterWords = await db.execute(sql`SELECT word FROM chat_filter_words`);
      let filtered = body.trim().slice(0, 1000);
      for (const row of filterWords.rows as { word: string }[]) {
        const re = new RegExp(`\\b${row.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
        filtered = filtered.replace(re, "***");
      }
      const rows = await db.execute(sql`
        INSERT INTO forum_comments (post_id, author_id, body, parent_comment_id)
        VALUES (${postId}, ${user.id}, ${filtered}, NULL)
        RETURNING id, body, created_at, author_id
      `);
      const comment = rows.rows[0] as any;
      return res.json({ ...comment, author_name: user.username, author_avatar: (user as any).profileImage ?? null });
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  // Replies to a specific top-level comment
  app.get("/api/forum/comments/:id/replies", async (req, res) => {
    try {
      const userId = (req.user as any)?.id ?? null;
      const commentId = req.params.id;
      const rows = await db.execute(sql`
        SELECT fc.id, fc.body, fc.created_at, fc.author_id,
               u.username AS author_name, u.profile_image AS author_avatar,
               (SELECT COUNT(*)::int FROM forum_comment_likes fcl WHERE fcl.comment_id = fc.id) AS like_count,
               CASE WHEN ${userId}::text IS NOT NULL AND EXISTS (
                 SELECT 1 FROM forum_comment_likes WHERE comment_id = fc.id AND user_id = ${userId}
               ) THEN true ELSE false END AS user_liked,
               0 AS reply_count
        FROM forum_comments fc
        JOIN users u ON fc.author_id = u.id
        WHERE fc.parent_comment_id = ${commentId}
        ORDER BY fc.created_at ASC
      `);
      return res.json(rows.rows);
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.post("/api/forum/comments/:id/replies", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const parentCommentId = req.params.id;
      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ message: "Reply body required" });
      // Find parent comment + check post read-only
      const parentRows = await db.execute(sql`
        SELECT fc.post_id, fp.is_read_only
        FROM forum_comments fc
        JOIN forum_posts fp ON fp.id = fc.post_id
        WHERE fc.id = ${parentCommentId}
      `);
      if (parentRows.rows.length === 0) return res.status(404).json({ message: "Comment not found" });
      const parent = parentRows.rows[0] as any;
      if (parent.is_read_only) return res.status(403).json({ message: "This post is read only" });
      // Banned words filter
      const filterWords = await db.execute(sql`SELECT word FROM chat_filter_words`);
      let filtered = body.trim().slice(0, 500);
      for (const row of filterWords.rows as { word: string }[]) {
        const re = new RegExp(`\\b${row.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
        filtered = filtered.replace(re, "***");
      }
      const rows = await db.execute(sql`
        INSERT INTO forum_comments (post_id, author_id, body, parent_comment_id)
        VALUES (${parent.post_id}, ${user.id}, ${filtered}, ${parentCommentId})
        RETURNING id, body, created_at, author_id
      `);
      const reply = rows.rows[0] as any;
      return res.json({ ...reply, author_name: user.username, author_avatar: (user as any).profileImage ?? null, like_count: 0, user_liked: false, reply_count: 0 });
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/forum/comments/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.isAdmin) {
        await db.execute(sql`DELETE FROM forum_comments WHERE id = ${req.params.id}`);
      } else {
        await db.execute(sql`DELETE FROM forum_comments WHERE id = ${req.params.id} AND author_id = ${user.id}`);
      }
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.post("/api/forum/posts/:id/like", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const postId = req.params.id;
      const existing = await db.execute(sql`SELECT 1 FROM forum_post_likes WHERE post_id = ${postId} AND user_id = ${userId}`);
      if (existing.rows.length > 0) {
        await db.execute(sql`DELETE FROM forum_post_likes WHERE post_id = ${postId} AND user_id = ${userId}`);
        return res.json({ liked: false });
      } else {
        await db.execute(sql`INSERT INTO forum_post_likes (post_id, user_id) VALUES (${postId}, ${userId}) ON CONFLICT DO NOTHING`);
        return res.json({ liked: true });
      }
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.post("/api/forum/comments/:id/like", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const commentId = req.params.id;
      const existing = await db.execute(sql`SELECT 1 FROM forum_comment_likes WHERE comment_id = ${commentId} AND user_id = ${userId}`);
      if (existing.rows.length > 0) {
        await db.execute(sql`DELETE FROM forum_comment_likes WHERE comment_id = ${commentId} AND user_id = ${userId}`);
        return res.json({ liked: false });
      } else {
        await db.execute(sql`INSERT INTO forum_comment_likes (comment_id, user_id) VALUES (${commentId}, ${userId}) ON CONFLICT DO NOTHING`);
        return res.json({ liked: true });
      }
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

}
