# Avatar 12C/12 — Home legacy cleanup and release gate

**Code scope:** `client/src/pages/HomePage.tsx` and tests/documentation.  
**Baseline:** merged Avatar 12A #1042 and 12B #1043, November 9, 2026.  
**Release state:** code proposed in a separate PR; CI/browser runs and physical-device evidence must be recorded separately. This document is **not** a claim of production stability.

## Investigation and disposition

| Area | Finding in merged Home code | 12C decision |
| --- | --- | --- |
| Home actor | `AVATAR_10_HOME_CUTOVER = true` rendered the new account avatar; the disabled JSX still contained a complete egg/pet actor, old five-rarity stars, pet menu, petting and particle portal | Remove unreachable Home-only subtree; retain `HomeAvatarStage` and the same artwork-cover/platform geometry |
| Unused effects and requests | Removed Home pet subtree still initialized pet placement hooks, observers, timers, petting requests, hatch/potion and power-up mutations | Retire those Home-only effects and handlers so they cannot mount or poll; do **not** remove shared server routes or pet components |
| Pets and eggs | Inventory provides pet-ID-scoped Pet Menu and dedicated care, Level Up, Power Up and Closet pages; hatch workflows are inventory-based | Preserve `activePetId` for legacy featured-companion/quest compatibility and leave all pet inventory, evolution, hatching and Murk Cave systems alone |
| Quest links | `?action=powerup`, `?questHint=powerup`, `?questHint=feed` still arrive at Home | Preserve owned-pet redirect to `/pet-power-up/:id?from=quest` and `/pet-care/:id?from=quest`, fallback to Bag without an active pet |
| Account identity | Previously `currentUser` was synchronized after render, leaving a possible brief account-switch frame | Derive the immediate Home display identity from incoming `user.id`; clear profile/chat/support local states on account switch |
| HUD and artwork | XP/stars, five-Pet PvP/Raid team, profile, support, World Chat and forest background are independently live | Preserve existing components, click targets, viewport portals, original artwork dimensions/projection and styling; no alignment changes here |
| Other gameplay | Clearing walks with a saved avatar but uses a pet for combat; Lava Crawl uses saved avatar; world drafts remain admin-only | Do not change shared avatar renderer, combat services, PvP/Raid balancing, pet park, publishing, Seer, or desktop lock |

## Automated regression contract

- Keep account-scoped `playerAvatarQueryKey(userId)` through Home, wardrobe and walking.
- Keep Home HUD using `/api/player/progression` and the same server-saved five-pet team; do not derive player level or stars from pet rarity.
- Keep the original forest `NewActivePetBG.png`, center/platform landmark `1475/2160`, `background-size: cover`, viewport portal and short-screen clearance.
- Ensure Home no longer includes legacy `AVATAR_10_HOME_CUTOVER`, active pet rendering, old petting/hatching mutations or Power Up modal/quest spotlight.
- Retain the real profile, support, World Chat, Home→Avatar button, and legacy quest redirects.
- Re-run `npm run check`, `npm run check:tests`, `npm test`, production build and Home/viewport/tutorial browser smoke on the final PR head. Passing these is automated verification, not device or production verification.

## Pending physical-device signoff

Before claiming Avatar 12/12 fully stable, inspect on a small iPhone, a larger iPhone, Android phone, iPad and Android tablet, including returning from background in Safari:

1. New account → Design Character → first save → Home; existing account wardrobe/equipment, refresh, account switch and failed avatar requests.
2. Home avatar platform, stars/XP/team, profile, world chat and support touch targets; keyboard, safe-area and landscape restriction as applicable.
3. Owned-pet Pet Menu, egg hatch/potions, Pet Care, Level Up, Power Up, Closet, evolution, mini pets, Pet Park and active/featured companion.
4. First-time tutorial, daily/story quest redirects, Clearing walking joystick and combat, Murk Cave, PvP/Raids and Lava Crawl.
5. Image crispness, low-memory behavior, no duplicate actors/overlays, no blocked touches, no unwanted desktop gameplay.

## Next independent visual pass

After stability signoff, tune avatar/stone-platform alignment, player name/XP and five curved stars, roster slots, wardrobe circles, layer fitting and clearing/Lava motion overlays with device screenshots. Keep admin-authored object/world positions unchanged unless the visual issue specifically requires an approved adjustment; avoid mixing visual layout changes into 12C.
