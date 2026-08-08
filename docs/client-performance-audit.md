# Client performance and stability pass

## Scope and evidence

This pass intentionally implements only two high-confidence fixes: Raid battle timer ownership and Elysian Clearing position-request backpressure. It does not change combat values, animation timing, rewards, visuals, or cache freshness. Evidence came from a targeted lifecycle/API search (`rg -n "requestAnimationFrame|setInterval|setTimeout|addEventListener|invalidateQueries" client/src`) and the production Vite build report.

## Implemented findings

### Raid battle timers survive navigation

- **What was wrong:** animation-reset timers and asynchronous battle sleeps were created without component-owned cleanup.
- **Why it matters:** navigating away during a battle left callbacks eligible to update an unmounted page and retained battle closures until those timers fired.
- **Change and safety:** one local timer registry now owns only Raid battle effects/sleeps and clears them on unmount. Durations and callback behavior are unchanged while mounted.
- **Expected benefit:** lower retained memory after leaving Raid and no late Raid animation state updates.
- **Risk:** low.

### Clearing position requests can overlap

- **What was wrong:** the 500 ms position interval launched another request even when the previous request was still pending, continued while the page was hidden or gameplay was paused, and restarted if the `worldPixels` object identity changed.
- **Why it matters:** slow mobile connections could accumulate concurrent requests and response work during active gameplay.
- **Change and safety:** the existing 500 ms foreground cadence remains, but a single-flight guard prevents overlap; hidden/paused ticks are skipped; the active request is aborted on cleanup; and scalar dimensions are the effect dependencies. No accepted position, movement timing, or server validation changed.
- **Expected benefit:** at most one pending position update, less background radio/CPU activity, and fewer interval teardowns.
- **Risk:** low.

## Measured asset opportunities (documentation only)

Approximate rendered sizes assume a common 390×844 CSS-pixel phone viewport. Source byte sizes and PNG dimensions were read directly from repository files; Vite's production build independently reported the emitted byte sizes.

| Asset | Source dimensions / size | Where used | Approx. mobile render | Recommendation | Expected benefit |
| --- | ---: | --- | ---: | --- | --- |
| `attached_assets/BFBD86D5-7E52-470D-949E-AC6D2FF39A5D_1783425029013.png` | 2902×4309 / 19.34 MiB | PvP arena, matchmaking, and battle backgrounds | 390×844 cover | Produce an art-reviewed opaque AVIF/WebP derivative around 900×1350, retaining the original | Very high transfer and decode-memory reduction on PvP entry |
| `attached_assets/C98FF13A-0E53-4BA8-9036-24139DA75818_1783394294636.png` | 2618×4774 / 14.29 MiB | Bayou Aquarium background | 390×844 cover | Produce a responsive opaque AVIF/WebP derivative; load only the selected aquarium background | Very high transfer/decode reduction; avoids decoding inactive tanks |
| `attached_assets/731E39C0-FA17-469A-BD4E-7DCAF0456B7A_1783402475912.png` | 2304×4096 / 11.30 MiB | Volcanic Aquarium background | 390×844 cover | Same as Bayou Aquarium; validate visual parity before switching formats | Very high transfer/decode reduction |
| `attached_assets/IMG_3030_1774876682518.png` | 1170×2532 / 7.12 MiB | Para Pets Hub slideshow | about 390×844 | Convert the opaque screenshot to AVIF/WebP and lazy-load non-current slides | High transfer reduction and lower peak slideshow decode memory |
| `attached_assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png` | 1230×1846 / 4.65 MiB | Raid setup, leaderboard, and battle backgrounds | 390×844 cover | Produce an opaque AVIF/WebP derivative near 900×1350 and share preload/cache strategy across Raid routes | High transfer reduction without changing Raid art |
| `attached_assets/uploads/ElysianClearingBackground.jpeg` | 2886×4331 / 2.86 MiB | Elysian Bayou Clearing full-height background | about 563×844 at current aspect | Add a roughly 1125×1688 responsive derivative after art review; preload only on Clearing navigation | Lower decode memory and faster Clearing startup while retaining 2× mobile detail |

## Deferred deeper work

These items need profiling and separate review rather than speculative changes:

1. **BattleArena and PvP timer ownership:** both contain many short-lived effect timers. Move them to a tested shared lifecycle scheduler in a focused follow-up rather than changing the large combat components opportunistically.
2. **Clearing React paint cost:** enemy simulation mutates refs at animation cadence but clones every enemy into React state at 20 fps. Profile a representative low-end phone before considering a canvas/isolated enemy-layer boundary.
3. **Aquarium background loading:** all three tank backgrounds are rendered as image nodes. A focused change should verify switching latency and memory before loading only the active/adjacent tank.
4. **Initial bundle:** the build reports an approximately 754 kB minified entry chunk (about 206 kB gzip) and 722 kB Admin chunk (about 178 kB gzip). Use bundle visualization to identify safe route/library splits; do not add manual chunks blindly.
5. **Asset pipeline:** several emitted images exceed 10 MiB, with the largest measured relevant asset over 20 MiB. Establish visual-regression approval and responsive derivative naming before converting artwork.
