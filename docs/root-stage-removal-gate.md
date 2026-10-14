# Root stage removal gate (after PR #810)

## Confirmed from current code
- `AppRouter` renders gameplay pages through viewport `StagePageSurface` and isolated routes through `Switch`.
- `usesDeviceGameplaySurface()` owns all explicitly rendered gameplay routes, including `/visit/:userId`.
- `shouldUseDocumentLayout()` owns the isolated document routes: auth, reset-password, privacy, hub, forum, founders, admin.
- `GameStage` in `client/src/App.tsx` **still contains** a third branch that scales `game-stage-content` using `layout.scale`, and conditionally creates stage-owned backdrop/page/scene portals.
- `readStageViewportLayout()` still asks for legacy portrait fitting for unknown or malformed routes. These are not confirmed live gameplay consumers. Removing this fallback requires replacing the route policy and legacy tests, not just deleting markup.

## Required order
1. Add route ownership regression gate for every explicit gameplay and document route (this PR). Keep unknown routes distinct; do not silently classify malformed paths as gameplay.
2. Update the root viewport controller's unknown-route fallback to use native dimensions, preserving authenticated redirect and loading/error flows. Update obsolete 390×844 portrait-reference tests to assert the new root contract; retain any independently required authored-world tests.
3. Remove the now-unreachable scaled branch from `GameStage` and simplify its scene/HUD markup, retaining IDs and portal ownership required by current pages.
4. Audit `stage.ts`, `stageViewport.ts`, `tabletStageShell.css`, `getStageSurface`, `getStagePortalTarget`, `clientToStage`, `DESIGN_W/H`, and every caller before deleting helpers. Some constants may still represent asset/world dimensions rather than a root constraint.
5. Run CI and manual iOS Safari/PWA, Android Chrome/PWA, tablet, and desktop tests: account entry, admin placements, pet scene/level/closet, home visits and camera pan, maps, NPC quests, overlays, popups, and touch gestures.

## Safety contract
Never rewrite stored admin oval placements, decor coordinates, world camera geometry, or authored artwork positions as a side effect of removing the root stage. UI overlays should use viewport coordinates; scene objects should use their existing scene/camera transforms. CI cannot verify rendered placement on real devices.
