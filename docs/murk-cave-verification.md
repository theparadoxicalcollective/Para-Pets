# Murk Cave Tier 1–10 Verification

## Root causes and fix scope

1. **Enter artwork/rendering:** the Tier 6–10 imports pointed at 1024×1024 portrait portal illustrations rather than horizontal `ENTER` controls. Their visible artwork occupied narrow, inconsistently padded regions and `object-contain` compressed those portraits into the shared 38% × 24% button box, making the control appear absent. To keep the patch source-only and compatible with the PR system, Tiers 6–10 now reuse the corresponding approved Tier 1–5 horizontal Enter controls through the tier registry; no binary or Tier 1–5 artwork is changed. All ten tiers use the same layout contract.
2. **Completion/progression:** persistence was already transaction-serialized, de-duplicated, and capped at Tier 10, and the battle already guarded its victory callback against duplicate reporting. The remaining lifecycle gap was server authorization: a crafted encounter or completion request could skip to a tier above `currentTier`. Both encounter creation and completion now apply the same accessibility rule while still allowing an idempotent retry of a completed tier.
3. **Tier 7–10 impact:** the artwork defect affected every Tier 6–10 source file, including Tiers 7–10. The server-side skip gap affected every locked tier. Tier 10 completion itself was already capped, and is now explicitly covered against Tier 11 access.
4. **Prevention:** parameterized progression tests cover Tiers 1–10, locked-tier rejection, idempotency, refresh serialization, and the Tier 10 cap. Binary tests decode every Enter file, require alpha and visible pixels, and reject excessive transparent padding. Source-contract tests cover all banner/button pairs, exact tier propagation, six zero-based wave groups, one completion callback, cleared/locked rendering, refetch, and server enforcement.

## Enter asset binary audit

Filename spelling and casing below are exact. The visible bounding box is inclusive (`left,top–right,bottom`). “Padding” compares the bounding-box area with the canvas; every file passes the automated ≥90% coverage limit. The production build completed with every mapped asset statically imported and emitted by Vite, so all ten tier mappings are included without a binary-file diff.

| Tier | Exact filename | Dimensions | Format | Alpha | Visible-pixel bounding box | Excessive transparent padding | Production build |
|---:|---|---:|---|---|---|---|---|
| 1 | `Photoroom_20260705_50251_PM_1783290164113.png` | 612×279 | PNG | yes | 0,0–610,278 | no (99.8% bbox coverage) | included |
| 2 | `Photoroom_20260705_50531_PM_1783290164113.png` | 620×271 | PNG | yes | 2,2–617,270 | no (98.6%) | included |
| 3 | `Photoroom_20260705_50328_PM_1783290164113.png` | 604×274 | PNG | yes | 1,1–602,271 | no (98.6%) | included |
| 4 | `Photoroom_20260705_50615_PM_1783290164113.png` | 606×279 | PNG | yes | 0,1–605,277 | no (99.3%) | included |
| 5 | `Photoroom_20260705_50445_PM_1783290164113.png` | 617×264 | PNG | yes | 0,2–616,262 | no (98.9%) | included |
| 6 | `Photoroom_20260705_50251_PM_1783290164113.png` | 612×279 | PNG | yes | 0,0–610,278 | no (99.8%) | included |
| 7 | `Photoroom_20260705_50531_PM_1783290164113.png` | 620×271 | PNG | yes | 2,2–617,270 | no (98.6%) | included |
| 8 | `Photoroom_20260705_50328_PM_1783290164113.png` | 604×274 | PNG | yes | 1,1–602,271 | no (98.6%) | included |
| 9 | `Photoroom_20260705_50615_PM_1783290164113.png` | 606×279 | PNG | yes | 0,1–605,277 | no (99.3%) | included |
| 10 | `Photoroom_20260705_50445_PM_1783290164113.png` | 617×264 | PNG | yes | 0,2–616,262 | no (98.9%) | included |

## Banner and lifecycle matrix

The tier registry maps every Tier N to `caveBannerN`; Tiers 1–5 use `caveEnter1`–`caveEnter5`, and Tiers 6–10 intentionally reuse those five verified controls in order. Each unlocked control calls `onEnterTier(tier)`, and the selected value is passed unchanged to `BattleArena` and the encounter API. Battles mount with `waveIndex = 0` (displayed as Wave 1) and the server constructs exactly wave groups 0–5. Victory reports completion once. Persisted `completedTiers` drives `CLEARED`; only the current successor renders a usable Enter control, while locked cards render a lock. Query invalidation refetches the pet-specific persisted record after completion, so remount/reopen preserves it.
