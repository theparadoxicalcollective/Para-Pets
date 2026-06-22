---
name: World backgrounds are force-overwritten on every server startup
description: Why admin-uploaded world map backgrounds revert to old art after a restart, and the correct way to change a world background.
---

On every server boot, `server/index.ts` runs a `WORLD_BG_ASSETS` loop that calls
`storage.updateWorld(worldId, { bgUrl })` for EVERY world, UNCONDITIONALLY, pointing
`bgUrl` at a hardcoded `attached_assets/<file>` served via `/world-assets/<file>?v=<mtime>`.

**Why:** This is intentional self-healing — it guarantees `worlds.bgUrl` is always a small
versioned static URL (never a giant base64 blob that bloats API responses). The same pattern
exists for location backgrounds (`LOC_BG_ALWAYS_REFRESH`).

**Consequence (the gotcha):** Any background an admin uploads through the UI is written to the DB,
but the next restart CLOBBERS it back to the hardcoded file. So "I uploaded a new world background
and it reverted to the old one after a while" = this loop, not a caching bug.

**How to change a world background correctly:** add/replace the asset file in `attached_assets/`
and update that world's entry in the `WORLD_BG_ASSETS` map in `server/index.ts`. Also update, to
keep them consistent: the loading-screen import in `client/src/components/WorldLoadingScreen.tsx`
(themed worlds only), the hub preview import in `client/src/pages/ParaPetsHubPage.tsx`, and the
`WORLD_FIXED_MAP_H[worldId]` value in `client/src/pages/WorldPage.tsx` =
`round(MAP_W(1080) * imgHeight / imgWidth)` so the map isn't stretched to the wrong aspect ratio.

**If the user wants admin uploads to persist instead:** add a guard in the startup loop to skip
worlds whose bgUrl is admin-managed (a design change — confirm with the user first).
