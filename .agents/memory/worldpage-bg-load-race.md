---
name: WorldPage bg-load premature worldBgLoaded
description: Worlds with a staticWorld config entry (e.g. volcanic) show the loading spinner twice because world.bg is null before worldApiData loads, causing a premature worldBgLoaded=true.
---

## The rule
In `WorldPage.tsx`, the bg-load `useEffect` must check `if (staticWorld && !worldApiData) return;` **before** the `if (!world.bg)` null-bg short-circuit.

**Why:** `world` is constructed as:
```js
const world = staticWorld ? { ...staticWorld, bg: worldApiData?.bgUrl ?? null } : ...
```
For any world that has a `staticWorld` config entry, `world` is non-null even before `worldApiData` loads — but `world.bg` is `null` (since `worldApiData?.bgUrl` is `undefined`). The old code treated `world.bg === null` as "this world has no background; mark loaded immediately". This caused the full crash sequence:

1. WorldPage mounts; `worldApiData` still fetching → `world.bg = null`
2. bg-load effect: `!world.bg` → `setWorldBgLoaded(true)` prematurely
3. `onContentReady` fires → WorldLoadingScreen dismisses
4. WorldPage is now visible, but the background image is absent ("partially loaded" look)
5. `worldApiData` arrives with a real `bgUrl` → `world.bg` changes null → URL
6. bg-load effect re-runs: `lastLoadedBgRef.current = ""` (never set for null-bg), so `isVersionRefresh = false` → `setWorldBgLoaded(false)`
7. WorldPage's internal spinner shows again (the "loading screen twice" bug)
8. Image loads → `worldBgLoaded = true` → world finally shows with background

**How to apply:**
- The guard line is `if (staticWorld && !worldApiData) return;` added after `if (!world) return;`.
- Add `!!worldApiData` to the effect's dependency array: `[worldId, world?.bg, !!worldApiData]` so the effect re-runs the moment `worldApiData` resolves.
- Do NOT add this guard for API-only worlds (no `staticWorld` entry) — for those, `world` is null until `worldApiData` loads, and the existing `if (!world) return` already handles it.
- `staticWorld` is `WORLD_CONFIG[worldId]` and is stable for a given worldId; no need to include it in deps.
