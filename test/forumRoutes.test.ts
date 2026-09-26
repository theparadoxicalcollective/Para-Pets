import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerForumRoutes } from "../server/routes/forum.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };
type Query = { sql: string; params: unknown[] };
const expected = [
  "GET /api/forum/posts",
  "GET /api/forum/posts/:id/comments",
  "POST /api/forum/posts",
  "PATCH /api/forum/posts/:id",
  "DELETE /api/forum/posts/:id",
  "POST /api/forum/posts/:id/comments",
  "GET /api/forum/comments/:id/replies",
  "POST /api/forum/comments/:id/replies",
  "DELETE /api/forum/comments/:id",
  "POST /api/forum/posts/:id/like",
  "POST /api/forum/comments/:id/like",
];

function setup(results: Array<unknown[]> = []) {
  const routes: Route[] = [];
  const queries: Query[] = [];
  const app = Object.fromEntries(["get", "post", "patch", "delete"].map(method => [method,
    (path: string, ...handlers: RequestHandler[]) => routes.push({ method: method.toUpperCase(), path, handlers }),
  ]));
  const isAuthenticated: RequestHandler = (req, res, next) => req.user ? next() : res.status(401).json({ message: "Unauthorized" });
  const db = { execute: async (query: any) => {
    queries.push(query.toQuery({ escapeName: (name: string) => name, escapeParam: (index: number) => `$${index + 1}`, escapeString: (value: string) => value }));
    return { rows: results.shift() ?? [] };
  } };
  registerForumRoutes(app as any, { db, isAuthenticated } as any);
  const route = (method: string, path: string) => {
    const found = routes.find(item => item.method === method && item.path === path);
    assert.ok(found, `${method} ${path} registered`);
    return found;
  };
  return { routes, queries, route, isAuthenticated };
}

async function invoke(route: Route, request: Record<string, unknown>) {
  const response = { statusCode: 200, body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  let index = 0;
  const next = async () => { const handler = route.handlers[index++]; if (handler) await handler(request as any, response as any, next); };
  await next();
  return { status: response.statusCode, body: response.body };
}

test("Forum registers each original endpoint once, in place, with unchanged authentication", () => {
  const { routes, isAuthenticated } = setup();
  assert.deepEqual(routes.map(({ method, path }) => `${method} ${path}`), expected);
  assert.equal(new Set(routes.map(({ method, path }) => `${method} ${path}`)).size, expected.length);
  for (const route of routes) {
    assert.equal(route.handlers.length, route.method === "GET" ? 1 : 2);
    if (route.method !== "GET") assert.equal(route.handlers[0], isAuthenticated);
  }
  const entry = readFileSync("server/routes.ts", "utf8");
  assert.equal((entry.match(/registerForumRoutes\(app, \{ db, isAuthenticated \}\)/g) ?? []).length, 1);
  assert.doesNotMatch(entry, /app\.(?:get|post|patch|delete)\("\/api\/forum\//);
});

test("guest reads keep post, comment, and reply response shapes", async () => {
  const posts = [{ id: "post" }], comments = [{ id: "comment" }], replies = [{ id: "reply" }];
  const { route, queries } = setup([posts, comments, replies]);
  assert.deepEqual(await invoke(route("GET", "/api/forum/posts"), {}), { status: 200, body: posts });
  assert.deepEqual(await invoke(route("GET", "/api/forum/posts/:id/comments"), { params: { id: "post" } }),
    { status: 200, body: { comments, userHasCommented: false } });
  assert.deepEqual(await invoke(route("GET", "/api/forum/comments/:id/replies"), { params: { id: "comment" } }),
    { status: 200, body: replies });
  assert.match(queries[0].sql, /ORDER BY fp\.is_pinned DESC, fp\.created_at DESC/);
  assert.deepEqual(queries[1].params, [null, null, "post"]);
});

test("writes reject guests, and post creation/edit/deletion remain admin only", async () => {
  const { routes, route, queries } = setup();
  for (const item of routes.filter(item => item.method !== "GET")) {
    assert.deepEqual(await invoke(item, { params: { id: "post" }, body: {} }),
      { status: 401, body: { message: "Unauthorized" } });
  }
  const player = { id: "player", isAdmin: false };
  for (const method of ["POST", "PATCH", "DELETE"]) {
    assert.deepEqual(await invoke(route(method, method === "POST" ? "/api/forum/posts" : "/api/forum/posts/:id"),
      { user: player, params: { id: "post" }, body: { title: "Title" } }),
      { status: 403, body: { message: "Admin only" } });
  }
  assert.equal(queries.length, 0);
  const admin = { id: "admin", isAdmin: true };
  assert.deepEqual(await invoke(route("POST", "/api/forum/posts"), { user: admin, body: { title: "   " } }),
    { status: 400, body: { message: "Title required" } });
  assert.deepEqual(await invoke(route("PATCH", "/api/forum/posts/:id"), { user: admin, params: { id: "post" }, body: {} }),
    { status: 200, body: { ok: true } });
  assert.deepEqual(await invoke(route("DELETE", "/api/forum/posts/:id"), { user: admin, params: { id: "post" } }),
    { status: 200, body: { ok: true } });
  assert.match(queries[0].sql, /UPDATE forum_posts/);
  assert.match(queries[1].sql, /DELETE FROM forum_posts/);
});

test("comments preserve read-only, duplicate, word filter, and author response", async () => {
  const player = { id: "player", username: "Para", profileImage: "/avatar.png" };
  const target = "POST" as const, path = "/api/forum/posts/:id/comments";
  assert.deepEqual(await invoke(setup().route(target, path), { user: player, params: { id: "post" }, body: { body: " " } }),
    { status: 400, body: { message: "Comment body required" } });
  assert.deepEqual(await invoke(setup([[{ is_read_only: true }]]).route(target, path), { user: player, params: { id: "post" }, body: { body: "Hi" } }),
    { status: 403, body: { message: "This post is read only" } });
  assert.deepEqual(await invoke(setup([[{ is_read_only: false }], [{ one: 1 }]]).route(target, path), { user: player, params: { id: "post" }, body: { body: "Hi" } }),
    { status: 409, body: { message: "You've already commented on this post. Click Reply on your comment to continue the discussion." } });
  const inserted = { id: "comment", body: "*** is here" };
  const { route, queries } = setup([[{ is_read_only: false }], [], [{ word: "bad" }], [inserted]]);
  assert.deepEqual(await invoke(route(target, path), { user: player, params: { id: "post" }, body: { body: "bad is here" } }),
    { status: 200, body: { ...inserted, author_name: "Para", author_avatar: "/avatar.png" } });
  assert.deepEqual(queries[3].params, ["post", "player", "*** is here"]);
});

test("replies keep missing/read-only handling and comment deletion ownership", async () => {
  const player = { id: "player", username: "Para" };
  const reply = "/api/forum/comments/:id/replies";
  assert.deepEqual(await invoke(setup([[]]).route("POST", reply), { user: player, params: { id: "comment" }, body: { body: "Hi" } }),
    { status: 404, body: { message: "Comment not found" } });
  assert.deepEqual(await invoke(setup([[{ post_id: "post", is_read_only: true }]]).route("POST", reply), { user: player, params: { id: "comment" }, body: { body: "Hi" } }),
    { status: 403, body: { message: "This post is read only" } });
  const { route, queries } = setup([[{ post_id: "post", is_read_only: false }], [{ word: "bad" }], [{ id: "reply", body: "***" }], []]);
  assert.deepEqual(await invoke(route("POST", reply), { user: player, params: { id: "comment" }, body: { body: "bad" } }),
    { status: 200, body: { id: "reply", body: "***", author_name: "Para", author_avatar: null, like_count: 0, user_liked: false, reply_count: 0 } });
  assert.deepEqual(queries[2].params, ["post", "player", "***", "comment"]);
  assert.deepEqual(await invoke(route("DELETE", "/api/forum/comments/:id"), { user: player, params: { id: "reply" } }),
    { status: 200, body: { ok: true } });
  assert.match(queries[3].sql, /AND author_id =/);
});

test("post and comment likes retain add/remove responses and database error status", async () => {
  for (const path of ["/api/forum/posts/:id/like", "/api/forum/comments/:id/like"]) {
    const { route, queries } = setup([[], [], [{ one: 1 }], []]);
    const request = { user: { id: "player" }, params: { id: "item" } };
    assert.deepEqual(await invoke(route("POST", path), request), { status: 200, body: { liked: true } });
    assert.deepEqual(await invoke(route("POST", path), request), { status: 200, body: { liked: false } });
    assert.match(queries[1].sql, /INSERT INTO forum_(?:post|comment)_likes/);
    assert.match(queries[3].sql, /DELETE FROM forum_(?:post|comment)_likes/);
  }
  const { route } = setup();
  assert.deepEqual(await invoke(route("POST", "/api/forum/posts"), { user: { id: "admin", isAdmin: true }, body: { title: "Hello", body: null } }),
    { status: 500, body: { message: "Cannot read properties of null (reading 'trim')" } });
});
