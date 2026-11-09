# Avatar 12C/12 — staged stability and Home migration audit

**Baseline:** Avatar 12A #1042 and 12B #1043 merged on November 9, 2026.  
**Current PR:** #1044, staged compatibility patch; **not** a complete removal or physical-device signoff.

## Investigation, attempted cleanup, and rollback

Avatar 10 already switched Home's visible actor to the owned player avatar; `AVATAR_10_HOME_CUTOVER = true` gates an old pet scene. The legacy Home component still has pet-specific gesture/egg/power-up hooks, modal handlers, image sizing and effects that should ultimately be retired. However, **many historical tests still assert their presence in Home's exact source text**. An initial 1,700-line removal in this PR caused **86 failing assertions across 55 existing test files** in the `npm test` workflow (superseded CI run #42680458543). Most were tests expecting Home pet buttons, egg gestures, old rarity stars, pet-position geometry and modal hooks that are not the intended post-Avatar-10 active interface.

**Safety choice:** The entire broad removal was **reverted** on this PR, rather than deleting, skipping or rewriting dozens of tests without tracing the actual owner for their behavior. The failure count describes legacy source-test dependencies, **not proof of 86 real-device gameplay failures**. The old Home subtree remains behind its original disabled cutover gate until an individual test migration and physical-device evaluation can justify removal.

## What this PR actually changes

1. When `HomePage` receives a different authenticated `user.id`, avoid painting the old account's transient Home state while `currentUser` synchronizes and reset account-local UI (profile, support and World Chat).
2. Prevent a stale featured-pet ID from being used by an old `?action=powerup` or `?questHint=feed/powerup` redirect while the authenticated account is changing; preserve the existing pet-ID routes and Bag fallback.
3. Keep all existing active-pet compatibility JSX, component imports, tests, background coordinates, live HUD/stars/team, inventory, pet services and database behavior unchanged.
4. Record test migration requirements, genuine device QA gates, and the deferred visual alignment plan.

## Test migration map — future small PRs

| Legacy Home test group | Intended live owner / behavior to verify |
| --- | --- |
| Home egg tap/potion/drag/reveal assertions | Bag/inventory egg route, hatching and potion application and actual inventory state |
| Home Pet Menu buttons, clickable stars, active-pet name/XP and power-up sheet | PetInventory Pet Menu and pet-ID-scoped Pet Care / Level Up / Power Up / Closet; Home's **player** level and five elevation stars separately |
| Pet-stage anchor, placement, effects, mini-pet renderer and backdrop tests | Pet Care / Level Up / Closet / Power Up scene and actual Home avatar platform; avoid altering admin pet placement |
| Home old tutorial spotlight and daily quest paths | Current quest guide navigation to owned-pet action route, new-player onboarding and NPC handoffs |
| Petting rewards and gesture lifecycle | Current Pet Care gesture and server reward flow (not a resurrected Home pet) |
| Pet-coupled modal, tablet/safe-area, overlay and low-memory tests | Account Home avatar HUD/profile/support, dedicated pet routes, viewport portals, Safari lifecycle and touch UI |

**Migration rule:** For every old assertion, inspect the current live feature's code and replace the check with a meaningful current contract or an actual behavioral test; don't globally remove tests to manufacture green CI. Only after test coverage has transitioned should a limited Home-only deletion be proposed.

## Preserved boundaries

- Account-scoped `playerAvatarQueryKey(userId)` in Home, player wardrobe, Clearing and Lava Crawl.
- Real account level/stars/XP, five saved pets for PvP/Raids, no pet-rarity-to-player-star conversion.
- Existing forest `NewActivePetBG.png`, `1475/2160` intrinsic platform landmark, viewport background cover, mobile HUD position and admin placements.
- Existing owned-pet records, egg hatching, pet levels, care/evolution and Murk Cave three-pet session compatibility.
- Admin-only World Editor drafts, current combat pets in Clearing, Lava saved character, desktop Coming Soon lock and Seer Elevation interaction deferred.

## CI / release gates

- Run application and test typechecks, full tests, production build and browser fixtures on the **last PR commit**, not a superseded attempt.
- Source-level unit tests plus browser fixtures are automated checks only. They are not substitutes for deployed Safari/Android hardware testing.
- Before declaring Avatar 12/12 complete: inspect new account avatar save/return, outfit refresh and sign-in/out; player XP/stars, team, profile, chat and support; inventory Pet Menu, eggs, power-up, care, evolution and mini pets; onboarding/daily quests; Clearing walk/combat, Murk Cave, PvP/Raid, Lava Crawl and low-memory Safari.
- Test small and large iPhones, Android phones, iPads and Android tablets; confirm desktop gameplay remains locked.

## Separate visual pass after stability

Use device screenshots to fix the Home avatar against stone platform, five curved stars, level/XP/name panel, team row, wardrobe category circles and clothing fit, and Clearing/Lava movement overlays. Do not conflate appearance alignment with compatibility cleanup; preserve all admin-authored placements until specific visual changes are approved.
