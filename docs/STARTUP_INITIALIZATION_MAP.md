# Server startup initialization map

This map documents the organizational extraction from the former `server/index.ts` startup IIFE. Execution remains serial within each boundary; SQL text, one-time keys, error handling, and the relative order of individual operations are retained.

| Previous location in `server/index.ts` | New boundary | Order | Criticality | Concurrency | Rollback risk |
|---|---|---:|---|---|---|
| Session and `media_blobs` table preparation, early route-required columns, and `molten_blocks_drop_items` preparation (former lines 270–328) | `server/startup/migrations/runEssentialBoot.ts` | 1 | Essential boot preparation; awaited before routes and readiness | Runs per instance using existing idempotent SQL | Low: organizational move only; revert imports/orchestrator |
| `registerRoutes` (former line 330) | `server/startup/runStartup.ts` | 2 | Essential | Per instance | Low |
| Error middleware (former lines 332–339) | `server/startup/runStartup.ts` | 3 | Essential | Per instance | Low |
| Production static serving or development Vite setup (former lines 341–346) | `server/startup/runStartup.ts` | 4 | Essential | Per instance | Low |
| HTTP listener (former lines 348–349) | `server/startup/runStartup.ts` | 5 | Readiness boundary | Per instance | Low |
| Remaining schema/table/index migrations and one-time migration tracker | `server/startup/backfills/runNonCriticalStartup.ts` (migration boundary) | 6a | Noncritical background, unchanged serial position | One Railway instance via nonblocking PostgreSQL advisory lock | Low: SQL is unchanged; lock is session-scoped |
| Existing data repairs, badge/history backfills, and media-blob conversion | `server/startup/backfills/runNonCriticalStartup.ts` (backfill boundary) | 6b, interleaved exactly as before | Noncritical background | Same advisory-lock session | Low: existing idempotency/error handling retained |
| Existing ticket, item, world, location, fish, food, accessory, badge, and sample-template seeds | `server/startup/backfills/runNonCriticalStartup.ts` (seed boundary) | 6c, interleaved exactly as before | Noncritical background | Same advisory-lock session | Low: content and one-time keys unchanged |
| Existing world/location icon and background refresh passes | `server/startup/backfills/runNonCriticalStartup.ts` (asset-sync boundary) | 6d, interleaved exactly as before | Noncritical background | Same advisory-lock session | Low: asset names, URLs, and refresh precedence unchanged |

## Ordering and readiness contract

`server/startup/startupContract.ts` records the externally important phase order. Essential boot preparation is awaited before route registration. Route registration, error middleware, static/Vite setup, and the listener retain their former sequence. Only after the listener starts is the unchanged noncritical sequence launched in the background.

The noncritical runner deliberately remains one serial function because migrations, backfills, seeds, and asset refreshes are historically interleaved and later refresh passes intentionally override earlier seed values. Splitting those statements into independently scheduled jobs would risk changing live content or startup ordering.

## Advisory-lock behavior

The background sequence uses `pg_try_advisory_lock`, so a second instance never waits for a lock and cannot be permanently blocked. The lock belongs to one checked-out PostgreSQL session. A `finally` block explicitly unlocks and releases the connection; PostgreSQL also releases the lock automatically if the connection is lost. An instance that does not acquire the lock skips the background sequence because another instance is already performing it.
