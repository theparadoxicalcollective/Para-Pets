# Para Pets server startup cleanup baseline

This document records the current behavior that must remain unchanged while `server/index.ts` is gradually reorganized.

## Safety rules

- Keep all existing API paths unchanged.
- Do not modify player data, balances, inventory, pets, rewards, purchases, quests, PvP, raids, or world progress during structural cleanup.
- Move one responsibility at a time.
- Run the TypeScript check and production build after every extraction.
- Review the branch diff before merging.
- Manually test the exact feature affected by each extraction.

## Current startup responsibilities

`server/index.ts` currently owns or configures:

1. Express application creation.
2. Trust-proxy and ETag behavior.
3. Response compression.
4. Login and registration rate limiting.
5. General API rate limiting.
6. Railway/load-balancer health checks.
7. HTTP server creation.
8. PostgreSQL-backed sessions.
9. Passport local authentication.
10. Stripe webhook parsing and handling.
11. JSON and URL-encoded request parsing.
12. World-asset thumbnail generation with Sharp.
13. Static world-asset serving and cache headers.
14. API request logging.
15. Route registration.
16. Error handling.
17. Vite development setup or production static serving.
18. HTTP listener startup.
19. Runtime schema changes, migrations, backfills, and seed operations.

## Existing rate-limit behavior to preserve

### Login and registration

- Applies to `/api/auth/login` and `/api/auth/register`.
- Window: 15 minutes.
- Maximum: 15 requests per window.
- Uses standard rate-limit headers.
- Does not use legacy headers.
- Error message: `Too many login attempts, please try again later.`

### General API

- Applies to `/api`.
- Window: 1 minute.
- Maximum: 600 requests per window.
- Uses standard rate-limit headers.
- Does not use legacy headers.
- Error message: `Too many requests, please slow down.`
- Explicitly skips `POST /api/auth/logout` so logout cannot be blocked.

## Existing session behavior to preserve

- Uses `connect-pg-simple` with the shared PostgreSQL pool.
- Session table name: `session`.
- Creates the session table if missing.
- Production startup must fail when `SESSION_SECRET` is missing.
- Development may use the existing development-only fallback secret.
- `resave` is false.
- `saveUninitialized` is false.
- Production cookies are secure and use `SameSite=None`.
- Development cookies use `SameSite=Lax`.
- Session lifetime is 30 days.

## Existing authentication behavior to preserve

- Login first searches by username.
- When the supplied login contains `@`, it may search by email.
- Invalid usernames and passwords return the same generic message.
- Banned users remain blocked unless a timed ban has expired.
- Expired timed bans are removed during login.
- Passwords are verified with bcrypt.
- Passport serializes the user ID.
- Passport deserializes by loading the user from storage.

## Existing Stripe webhook behavior to preserve

- `/api/stripe/webhook` must remain registered before `express.json()`.
- The webhook body must remain a raw `Buffer`.
- Requests without `stripe-signature` return HTTP 400.
- Webhook processing continues through `WebhookHandlers.processWebhook`.

## First extraction sequence

1. Extract rate-limit construction and registration.
2. Extract session middleware configuration.
3. Extract Passport configuration.
4. Extract Stripe webhook registration.
5. Extract world-asset middleware.
6. Move runtime database setup into a clearly named startup-migrations module without changing query order or behavior.

## Manual checks before merging the first code extraction

- Registering a test account still works.
- Logging in by username still works.
- Logging in by email still works.
- Logging out still works even after many API requests.
- A normal gameplay burst does not trigger the general limiter.
- `/health` returns HTTP 200 without requiring authentication.
- Stripe webhook parsing still receives a raw body.
- World images still load normally.
- Requested resized world images still return WebP output.

## Notable follow-up risk

The startup file currently performs a large number of schema changes, data backfills, seed operations, and one-time mutations. These should eventually be separated from ordinary server startup, but they must not be reordered or rewritten until each operation has been cataloged and classified as schema-only, repeatable seed, backfill, or destructive/data-changing work.
