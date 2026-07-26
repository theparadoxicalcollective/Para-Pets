# Repository and Asset Hygiene Audit

> **Audit date:** 2026-07-26  
> **Scope:** all 1,505 files tracked at commit `bc9659e`; working-tree and Git-object history are outside scope.  
> **Method:** `git ls-files`, filesystem byte counts, SHA-256 comparisons, Git LFS metadata, exact path/basename reference searches, static local-import resolution, and secret-pattern scanning. No database or network connection was made. No asset, code, configuration, database, LFS, or deployment file was modified.

## Executive summary

- **Confirmed:** materialized tracked working-tree content is approximately **1.6 GiB**; `attached_assets/` accounts for **1.5 GiB across 1,099 audited assets**. In addition, the checked-out LFS pointer `ziMQ9a1L` declares an unavailable **808.6 MiB** logical object, so a fully materialized checkout would be roughly **2.4 GiB** before filesystem/Git overhead.
- **Confirmed:** 357 attached assets have no exact tracked-text reference; absence of a literal reference does **not** prove runtime non-use (database-generated paths and dynamic lookup remain possible).
- **Confirmed:** 213 attached files occur in 96 byte-identical SHA-256 duplicate groups.
- **Confirmed:** 20 files are in upload/screenshot/pasted-prompt or recording staging categories.
- **Confirmed:** 0 case-only tracked-path collision group(s); 0 unresolved local import/reference candidate(s) from the static scan.

## 1. Largest tracked files and folders

Approximate filesystem sizes (not packed Git-history size).

| Largest files | Size |
|---|---:|
| `attached_assets/AAC47494-B2BD-4B73-B01A-769E2C589AD7_1783460456416.png` | 19.4 MiB |
| `attached_assets/AAC47494-B2BD-4B73-B01A-769E2C589AD7_1783461445112.png` | 19.4 MiB |
| `attached_assets/BFBD86D5-7E52-470D-949E-AC6D2FF39A5D_1783425029013.png` | 19.3 MiB |
| `attached_assets/DB776142-DA82-45B4-8946-17C57A14FA10_1773753084762.png` | 18.2 MiB |
| `attached_assets/9AD71EA4-A07D-4D8F-A82B-B2D001890360_1774818275441.png` | 16.5 MiB |
| `attached_assets/bg_swamp_critters.png` | 16.5 MiB |
| `attached_assets/C98FF13A-0E53-4BA8-9036-24139DA75818_1783394294636.png` | 14.3 MiB |
| `attached_assets/B914BFEB-E34D-46B1-B1D9-944E58F993A4_1773680571450.png` | 13.8 MiB |
| `attached_assets/ScreenRecording_03-30-2026_11-49-44_AM_1_1774889437100.mov` | 12.9 MiB |
| `attached_assets/731E39C0-FA17-469A-BD4E-7DCAF0456B7A_1783402475912.png` | 11.3 MiB |
| `attached_assets/IMG_2542_1773716328050.png` | 8.8 MiB |
| `attached_assets/IMG_2543_1773718133318.png` | 8.4 MiB |
| `attached_assets/IMG_5322_1781707837903.png` | 8.4 MiB |
| `attached_assets/IMG_5324_1781708897207.png` | 8.4 MiB |
| `attached_assets/Photoroom_20260707_20149_PM_1783460456415.png` | 8.3 MiB |
| `attached_assets/Photoroom_20260707_20149_PM_1783461445112.png` | 8.3 MiB |
| `attached_assets/IMG_5325_1781709803135.png` | 7.6 MiB |
| `attached_assets/IMG_5346_1781719826455.png` | 7.6 MiB |
| `attached_assets/IMG_3030_1774876682518.png` | 7.1 MiB |
| `attached_assets/D651F5A0-5A0C-42EE-9EA0-EF743D851787_1774795658329.jpeg` | 7.0 MiB |
| `attached_assets/bg_welcome_center.jpeg` | 7.0 MiB |
| `attached_assets/IMG_6872_1783621831062.png` | 6.7 MiB |
| `attached_assets/IMG_6880_1783636894557.png` | 6.2 MiB |
| `attached_assets/bg_swamp_map.png` | 6.0 MiB |
| `attached_assets/IMG_6868_1783469036165.png` | 5.2 MiB |
| `attached_assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783809194294.png` | 4.6 MiB |
| `attached_assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png` | 4.6 MiB |
| `client/src/assets/raid_bg.png` | 4.6 MiB |
| `attached_assets/Photoroom_20260410_83311_PM_1775871223547.png` | 4.0 MiB |
| `attached_assets/icon_world_chat_new.png` | 4.0 MiB |

| Largest folders | Aggregate size |
|---|---:|
| `attached_assets/` | 1.5 GiB |
| `attached_assets/generated_images/` | 243.3 MiB |
| `client/` | 40.9 MiB |
| `client/src/` | 31.2 MiB |
| `artifacts/` | 9.8 MiB |
| `artifacts/mockup-sandbox/` | 9.8 MiB |
| `client/public/` | 9.7 MiB |
| `.canvas/` | 4.7 MiB |
| `.canvas/assets/` | 4.7 MiB |
| `attached_assets/uploads/` | 4.3 MiB |
| `attached_assets/worlds/` | 2.2 MiB |
| `server/` | 967.7 KiB |
| `screenshots/` | 693.7 KiB |
| `attached_assets/screenshots/` | 421.8 KiB |
| `server/startup/` | 175.8 KiB |
| `test/` | 157.7 KiB |
| `docs/` | 132.0 KiB |
| `server/routes/` | 107.7 KiB |

## 2. Special-purpose and hygiene-sensitive tracked files

### Archives

Confirmed by filename extension.

- None found.

### SQL exports and database backups

Confirmed by filename/path convention. LFS patterns for absent historical files are covered below.

- None found.

### Patch files

- `pvp_diff.patch` (68.9 KiB)

### Temporary copies and version copies

Suspected based on naming; manual verification is required.

- `.canvas/assets/logo_parapets_new_preview.png` (946.4 KiB)
- `.canvas/assets/logo_parapets_new_preview2.png` (815.8 KiB)
- `attached_assets/Pasted-Add-a-new-explore-location-to-the-Elysian-Bayou-world-c_1784693531786.txt` (4.9 KiB)
- `attached_assets/Pasted-I-need-you-to-add-a-new-ParaPets-mini-game-to-my-existi_1783460461021.txt` (2.4 KiB)
- `attached_assets/admin_icon_rewards_new.png` (1.5 MiB)
- `attached_assets/generated_images/nav_icon_active_pet_new.png` (551.3 KiB)
- `attached_assets/generated_images/nav_icon_map_new.png` (1.5 MiB)
- `attached_assets/icon_badges_new.png` (1.4 MiB)
- `attached_assets/icon_home_new.png` (1.5 MiB)
- `attached_assets/icon_map_new.png` (1.3 MiB)
- `attached_assets/icon_pvp_new.png` (1.4 MiB)
- `attached_assets/icon_world_chat_new.png` (4.0 MiB)
- `attached_assets/scroll_open_new.png` (1.3 MiB)
- `client/src/assets/icon_world_chat_new.png` (4.0 MiB)
- `new_version.tsx` (64.9 KiB)
- `old_version.tsx` (49.0 KiB)

### Mockup sandbox

Confirmed tracked mockup sandbox inventory.

- `artifacts/mockup-sandbox/.replit-artifact/artifact.toml` (389.0 B)
- `artifacts/mockup-sandbox/components.json` (426.0 B)
- `artifacts/mockup-sandbox/index.html` (4.1 KiB)
- `artifacts/mockup-sandbox/mockupPreviewPlugin.ts` (5.4 KiB)
- `artifacts/mockup-sandbox/package-lock.json` (188.1 KiB)
- `artifacts/mockup-sandbox/package.json` (2.6 KiB)
- `artifacts/mockup-sandbox/public/ads/ad1-grove.html` (5.7 KiB)
- `artifacts/mockup-sandbox/public/ads/ad2-volcanic.html` (6.1 KiB)
- `artifacts/mockup-sandbox/public/ads/ad3-swamp.html` (6.3 KiB)
- `artifacts/mockup-sandbox/public/ads/images/acc_magic_crown.png` (769.0 KiB)
- `artifacts/mockup-sandbox/public/ads/images/accessory_volcanic_sword.png` (538.1 KiB)
- `artifacts/mockup-sandbox/public/ads/images/betta_celestial.png` (1.1 MiB)
- `artifacts/mockup-sandbox/public/ads/images/betta_crimson.png` (1.1 MiB)
- `artifacts/mockup-sandbox/public/ads/images/betta_galaxy.png` (1.4 MiB)
- `artifacts/mockup-sandbox/public/ads/images/bg_bayous_heart.png` (1.6 MiB)
- `artifacts/mockup-sandbox/public/ads/images/bg_enchanted_grove_map.png` (1.9 MiB)
- `artifacts/mockup-sandbox/public/ads/images/bg_volcanic_map_v2.jpeg` (332.1 KiB)
- `artifacts/mockup-sandbox/public/ads/images/logo_parapets_v4.png` (840.7 KiB)
- `artifacts/mockup-sandbox/public/favicon.svg` (163.0 B)
- `artifacts/mockup-sandbox/src/.generated/mockup-components.ts` (171.0 B)
- `artifacts/mockup-sandbox/src/App.tsx` (3.6 KiB)
- `artifacts/mockup-sandbox/src/components/ui/accordion.tsx` (2.0 KiB)
- `artifacts/mockup-sandbox/src/components/ui/alert-dialog.tsx` (4.3 KiB)
- `artifacts/mockup-sandbox/src/components/ui/alert.tsx` (1.6 KiB)
- `artifacts/mockup-sandbox/src/components/ui/aspect-ratio.tsx` (140.0 B)
- `artifacts/mockup-sandbox/src/components/ui/avatar.tsx` (1.4 KiB)
- `artifacts/mockup-sandbox/src/components/ui/badge.tsx` (1.5 KiB)
- `artifacts/mockup-sandbox/src/components/ui/breadcrumb.tsx` (2.6 KiB)
- `artifacts/mockup-sandbox/src/components/ui/button-group.tsx` (2.2 KiB)
- `artifacts/mockup-sandbox/src/components/ui/button.tsx` (2.3 KiB)
- `artifacts/mockup-sandbox/src/components/ui/calendar.tsx` (7.4 KiB)
- `artifacts/mockup-sandbox/src/components/ui/card.tsx` (1.8 KiB)
- `artifacts/mockup-sandbox/src/components/ui/carousel.tsx` (6.1 KiB)
- `artifacts/mockup-sandbox/src/components/ui/chart.tsx` (10.5 KiB)
- `artifacts/mockup-sandbox/src/components/ui/checkbox.tsx` (1.0 KiB)
- `artifacts/mockup-sandbox/src/components/ui/collapsible.tsx` (329.0 B)
- `artifacts/mockup-sandbox/src/components/ui/command.tsx` (4.8 KiB)
- `artifacts/mockup-sandbox/src/components/ui/context-menu.tsx` (7.2 KiB)
- `artifacts/mockup-sandbox/src/components/ui/dialog.tsx` (3.6 KiB)
- `artifacts/mockup-sandbox/src/components/ui/drawer.tsx` (2.9 KiB)
- `artifacts/mockup-sandbox/src/components/ui/dropdown-menu.tsx` (7.4 KiB)
- `artifacts/mockup-sandbox/src/components/ui/empty.tsx` (2.3 KiB)
- `artifacts/mockup-sandbox/src/components/ui/field.tsx` (5.9 KiB)
- `artifacts/mockup-sandbox/src/components/ui/form.tsx` (4.1 KiB)
- `artifacts/mockup-sandbox/src/components/ui/hover-card.tsx` (1.2 KiB)
- `artifacts/mockup-sandbox/src/components/ui/input-group.tsx` (4.9 KiB)
- `artifacts/mockup-sandbox/src/components/ui/input-otp.tsx` (2.1 KiB)
- `artifacts/mockup-sandbox/src/components/ui/input.tsx` (768.0 B)
- `artifacts/mockup-sandbox/src/components/ui/item.tsx` (4.4 KiB)
- `artifacts/mockup-sandbox/src/components/ui/kbd.tsx` (862.0 B)
- `artifacts/mockup-sandbox/src/components/ui/label.tsx` (724.0 B)
- `artifacts/mockup-sandbox/src/components/ui/menubar.tsx` (8.4 KiB)
- `artifacts/mockup-sandbox/src/components/ui/navigation-menu.tsx` (5.0 KiB)
- `artifacts/mockup-sandbox/src/components/ui/pagination.tsx` (2.7 KiB)
- `artifacts/mockup-sandbox/src/components/ui/popover.tsx` (1.3 KiB)
- `artifacts/mockup-sandbox/src/components/ui/progress.tsx` (792.0 B)
- `artifacts/mockup-sandbox/src/components/ui/radio-group.tsx` (1.4 KiB)
- `artifacts/mockup-sandbox/src/components/ui/resizable.tsx` (1.7 KiB)
- `artifacts/mockup-sandbox/src/components/ui/scroll-area.tsx` (1.6 KiB)
- `artifacts/mockup-sandbox/src/components/ui/select.tsx` (5.6 KiB)
- `artifacts/mockup-sandbox/src/components/ui/separator.tsx` (756.0 B)
- `artifacts/mockup-sandbox/src/components/ui/sheet.tsx` (4.2 KiB)
- `artifacts/mockup-sandbox/src/components/ui/sidebar.tsx` (21.3 KiB)
- `artifacts/mockup-sandbox/src/components/ui/skeleton.tsx` (266.0 B)
- `artifacts/mockup-sandbox/src/components/ui/slider.tsx` (1.0 KiB)
- `artifacts/mockup-sandbox/src/components/ui/sonner.tsx` (894.0 B)
- `artifacts/mockup-sandbox/src/components/ui/spinner.tsx` (331.0 B)
- `artifacts/mockup-sandbox/src/components/ui/switch.tsx` (1.1 KiB)
- `artifacts/mockup-sandbox/src/components/ui/table.tsx` (2.8 KiB)
- `artifacts/mockup-sandbox/src/components/ui/tabs.tsx` (1.8 KiB)
- `artifacts/mockup-sandbox/src/components/ui/textarea.tsx` (649.0 B)
- `artifacts/mockup-sandbox/src/components/ui/toast.tsx` (4.7 KiB)
- `artifacts/mockup-sandbox/src/components/ui/toaster.tsx` (772.0 B)
- `artifacts/mockup-sandbox/src/components/ui/toggle-group.tsx` (1.7 KiB)
- `artifacts/mockup-sandbox/src/components/ui/toggle.tsx` (1.5 KiB)
- `artifacts/mockup-sandbox/src/components/ui/tooltip.tsx` (1.2 KiB)
- `artifacts/mockup-sandbox/src/hooks/use-mobile.tsx` (565.0 B)
- `artifacts/mockup-sandbox/src/hooks/use-toast.ts` (3.7 KiB)
- `artifacts/mockup-sandbox/src/index.css` (4.9 KiB)
- `artifacts/mockup-sandbox/src/lib/utils.ts` (166.0 B)
- `artifacts/mockup-sandbox/src/main.tsx` (157.0 B)
- `artifacts/mockup-sandbox/tsconfig.json` (537.0 B)
- `artifacts/mockup-sandbox/vite.config.ts` (1.6 KiB)
- `attached_assets/screenshots/04380d3b-f3f5-4699-a9be-ec71209f7dd3-00-3d1yitevk0i7y_riker_replit_dev_mockup_ads_ad1-grove.png` (113.5 KiB)
- `attached_assets/screenshots/04380d3b-f3f5-4699-a9be-ec71209f7dd3-00-3d1yitevk0i7y_riker_replit_dev_mockup_ads_ad2-volcanic.png` (116.9 KiB)
- `attached_assets/screenshots/04380d3b-f3f5-4699-a9be-ec71209f7dd3-00-3d1yitevk0i7y_riker_replit_dev_mockup_ads_ad3-swamp.png` (191.4 KiB)

### Screenshots and screen recordings

- `attached_assets/Pasted-I-compared-screenshots-and-this-does-not-look-like-only_1775422124746.txt` (2.2 KiB)
- `attached_assets/ScreenRecording_03-30-2026_11-49-44_AM_1_1774889437100.mov` (12.9 MiB)
- `attached_assets/screenshots/04380d3b-f3f5-4699-a9be-ec71209f7dd3-00-3d1yitevk0i7y_riker_replit_dev_mockup_ads_ad1-grove.png` (113.5 KiB)
- `attached_assets/screenshots/04380d3b-f3f5-4699-a9be-ec71209f7dd3-00-3d1yitevk0i7y_riker_replit_dev_mockup_ads_ad2-volcanic.png` (116.9 KiB)
- `attached_assets/screenshots/04380d3b-f3f5-4699-a9be-ec71209f7dd3-00-3d1yitevk0i7y_riker_replit_dev_mockup_ads_ad3-swamp.png` (191.4 KiB)
- `screenshots/auth_page.jpg` (101.8 KiB)
- `screenshots/floating_nav_after_login.jpg` (101.8 KiB)
- `screenshots/floating_nav_home_logged.jpg` (101.9 KiB)
- `screenshots/floating_nav_homepage.jpg` (101.9 KiB)
- `screenshots/floating_nav_locked.jpg` (102.1 KiB)
- `screenshots/floating_nav_test_user.jpg` (101.6 KiB)
- `screenshots/founders_font_check.jpg` (82.7 KiB)

### Oddly named root files

Suspected hygiene issues based on opaque or version-like names.

- `new_version.tsx` (64.9 KiB)
- `old_version.tsx` (49.0 KiB)
- `survey.cjs` (2.0 KiB)
- `ziMQ9a1L` (134.0 B)

## 3. Git LFS

| LFS rule | Currently tracked path? | LFS object listed? | Necessity assessment |
|---|---|---|---|
| `parapets_export.sql` | No | No | Rule appears historical/stale because no currently tracked path matches exactly; retain until history/restore needs are checked. |
| `parapets_backup.zip` | No | No | Rule appears historical/stale because no currently tracked path matches exactly; retain until history/restore needs are checked. |
| `parapets_prod_backup.txt` | No | No | Rule appears historical/stale because no currently tracked path matches exactly; retain until history/restore needs are checked. |
| `parapets_prod_export.sql.gz` | No | No | Rule appears historical/stale because no currently tracked path matches exactly; retain until history/restore needs are checked. |
| `ziMQ9a1L` | Yes | Yes | Manual verification required; opaque filename and no literal production reference found. |

**Confirmed:** only `ziMQ9a1L` is currently reported by `git lfs ls-files`. The checkout contains a 134-byte pointer declaring an 847,857,412-byte (808.6 MiB) object; the payload is not available locally, so its format and contents were not inspected. **Suspected:** the opaque name makes its purpose and necessity impossible to establish from source references; do not remove it until an owner verifies provenance, restore, and retention requirements. LFS is suitable for necessary large versioned artifacts, but Git is not preferred long-term backup storage.

## 4. `attached_assets/` classification

Classification precedence is temporary/staging → production literal reference → seed/config/documentation literal reference → no literal reference. “Apparently unreferenced” is a suspected finding, not proof of safe deletion. The complete inventory follows.

### Referenced By Production Code (505)

- `attached_assets/49FB9020-1DB5-487E-9B92-EC15E9240ABD_1781303869686.png` (2.8 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/64255BCE-2B6A-4A95-8654-145262B126FA_1781352994250.png` (2.3 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/6CD8FBAA-D30B-4D07-BBD7-493429B3C8C2_1783646983253.png` (2.9 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/731E39C0-FA17-469A-BD4E-7DCAF0456B7A_1783402475912.png` (11.3 MiB) — refs: `client/src/pages/AquariumPage.tsx`
- `attached_assets/BFBD86D5-7E52-470D-949E-AC6D2FF39A5D_1783425029013.png` (19.3 MiB) — refs: `client/src/components/PvpMatchmakingOverlay.tsx`, `client/src/pages/PvpArenaPage.tsx`, `client/src/pages/PvpBattlePage.tsx`
- `attached_assets/C98FF13A-0E53-4BA8-9036-24139DA75818_1783394294636.png` (14.3 MiB) — refs: `client/src/pages/AquariumPage.tsx`
- `attached_assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png` (4.6 MiB) — refs: `client/src/pages/RaidBattlePage.tsx`, `client/src/pages/RaidLeaderboardPage.tsx`, `client/src/pages/RaidPage.tsx`
- `attached_assets/IMG_3026_1774876682518.jpeg` (380.8 KiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/IMG_3028_1774876682518.jpeg` (496.1 KiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/IMG_3029_1774876682518.png` (2.3 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/IMG_3030_1774876682518.png` (7.1 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/IMG_3031_1774876682518.jpeg` (337.7 KiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/IMG_3032_1774876682518.jpeg` (449.2 KiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/IMG_3035_1774876682518.jpeg` (365.6 KiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/IMG_5734_1783098320823.jpeg` (581.4 KiB) — refs: `client/src/pages/PetHousePage.tsx`
- `attached_assets/IMG_6427_1774545779530.png` (2.1 MiB) — refs: `client/src/components/FloatingNav.tsx`
- `attached_assets/IMG_6459_1774675340089.jpeg` (1.2 MiB) — refs: `client/src/pages/PetWorldPage.tsx`
- `attached_assets/IMG_6872_1783621831062.png` (6.7 MiB) — refs: `client/src/pages/WorldPage.tsx`
- `attached_assets/IMG_6880_1783638836962.jpeg` (843.7 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260317_35839_PM_1773781228635.png` (2.2 MiB) — refs: `client/src/pages/FishingPage.tsx`
- `attached_assets/Photoroom_20260324_65241_AM_1774353229077.png` (3.7 MiB) — refs: `client/src/pages/FishingPage.tsx`
- `attached_assets/Photoroom_20260331_20947_PM_1774984267132.png` (2.2 MiB) — refs: `client/src/pages/HomePage.tsx`, `client/src/pages/RaidBattlePage.tsx`, `client/src/pages/RaidPage.tsx`
- `attached_assets/Photoroom_20260415_83701_PM_1776304592941.png` (895.3 KiB) — refs: `client/src/components/DailyClaimCard.tsx`, `client/src/pages/PvpArenaPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260502_90936_AM_1777731667331.png` (2.6 MiB) — refs: `client/src/pages/FoundersPage.tsx`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/Photoroom_20260611_74428_AM_1781181905848.png` (1.7 MiB) — refs: `client/src/pages/HomePage.tsx`, `client/src/pages/PetHousePage.tsx`
- `attached_assets/Photoroom_20260616_70844_PM_1781655109379.png` (1.9 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`, `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/Photoroom_20260616_71053_PM_1781655109379.png` (1.9 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`, `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/Photoroom_20260616_71127_PM_1781655109379.png` (2.1 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`, `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/Photoroom_20260616_95112_PM_1781667768792.png` (548.4 KiB) — refs: `client/src/components/BeginJourneyOverlay.tsx`, `client/src/components/FloatingNav.tsx`, `client/src/pages/HomePage.tsx`, `client/src/pages/PetHousePage.tsx`, `client/src/pages/PetWorldPage.tsx` …
- `attached_assets/Photoroom_20260617_64201_AM_1781696551801.png` (1.1 MiB) — refs: `client/src/pages/CoinShopPage.tsx`
- `attached_assets/Photoroom_20260619_64226_PM_1781913135212.png` (2.7 MiB) — refs: `client/src/pages/FoundersPage.tsx`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/Photoroom_20260622_114621_AM_1782146930993.png` (968.0 KiB) — refs: `client/src/components/FloatingNav.tsx`
- `attached_assets/Photoroom_20260623_111411_AM_1782231282456.png` (1.5 MiB) — refs: `client/src/pages/FishingPage.tsx`
- `attached_assets/Photoroom_20260629_101811_PM_1782789946363.png` (2.3 MiB) — refs: `client/src/pages/CoinShopPage.tsx`
- `attached_assets/Photoroom_20260629_101901_PM_1782789946363.png` (2.7 MiB) — refs: `client/src/pages/CoinShopPage.tsx`
- `attached_assets/Photoroom_20260629_102009_PM_1782789946363.png` (2.6 MiB) — refs: `client/src/pages/CoinShopPage.tsx`
- `attached_assets/Photoroom_20260629_102055_PM_1782789968022.png` (2.9 MiB) — refs: `client/src/pages/CoinShopPage.tsx`
- `attached_assets/Photoroom_20260629_102138_PM_1782789980383.png` (2.9 MiB) — refs: `client/src/pages/CoinShopPage.tsx`
- `attached_assets/Photoroom_20260629_102249_PM_1782789946363.png` (2.9 MiB) — refs: `client/src/pages/CoinShopPage.tsx`
- `attached_assets/Photoroom_20260702_82333_PM_1783041830710.png` (872.3 KiB) — refs: `client/src/components/BattleArena.tsx`
- `attached_assets/Photoroom_20260702_83143_PM_1783042315810.png` (797.0 KiB) — refs: `client/src/components/BattleArena.tsx`
- `attached_assets/Photoroom_20260703_72612_AM_1783081617614.png` (1.7 MiB) — refs: `client/src/pages/PetHousePage.tsx`
- `attached_assets/Photoroom_20260704_100308_PM_1783220772468.png` (1.3 MiB) — refs: `server/routes.ts`
- `attached_assets/Photoroom_20260704_100600_PM_1783220772468.png` (1.4 MiB) — refs: `server/routes.ts`
- `attached_assets/Photoroom_20260704_95312_PM_1783220772468.png` (1.4 MiB) — refs: `server/routes.ts`
- `attached_assets/Photoroom_20260705_103527_PM_1783308939570.png` (676.6 KiB) — refs: `client/src/components/BattleArena.tsx`, `client/src/components/ElysianClearingCombat.tsx`
- `attached_assets/Photoroom_20260705_103527_PM_1783426783499.png` (676.6 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`, `client/src/pages/PvpBattlePage.tsx`
- `attached_assets/Photoroom_20260705_105636_PM_1783310667789.png` (1.5 MiB) — refs: `client/src/components/BattleArena.tsx`, `client/src/components/UserProfilePanel.tsx`, `client/src/pages/AuthPage.tsx`
- `attached_assets/Photoroom_20260705_110030_PM_1783310667789.png` (2.9 MiB) — refs: `client/src/components/BattleArena.tsx`
- `attached_assets/Photoroom_20260705_50251_PM_1783290164113.png` (353.7 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`, `docs/murk-cave-verification.md`, `test/caveAssets.test.ts`
- `attached_assets/Photoroom_20260705_50328_PM_1783290164113.png` (378.6 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`, `docs/murk-cave-verification.md`, `test/caveAssets.test.ts`
- `attached_assets/Photoroom_20260705_50445_PM_1783290164113.png` (347.5 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`, `docs/murk-cave-verification.md`, `test/caveAssets.test.ts`
- `attached_assets/Photoroom_20260705_50531_PM_1783290164113.png` (361.8 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`, `docs/murk-cave-verification.md`, `test/caveAssets.test.ts`
- `attached_assets/Photoroom_20260705_50615_PM_1783290164113.png` (358.2 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`, `docs/murk-cave-verification.md`, `test/caveAssets.test.ts`
- `attached_assets/Photoroom_20260705_51533_PM_1783290164113.png` (544.3 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260705_51608_PM_1783290164113.png` (549.9 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260705_51705_PM_1783290164113.png` (564.3 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260705_52038_PM_1783290164113.png` (500.7 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260705_52123_PM_1783290164113.png` (517.6 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260705_62527_PM_1783294222590.png` (665.9 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260705_62625_PM_1783294222590.png` (710.1 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260705_62657_PM_1783294222590.png` (590.9 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260705_62752_PM_1783294222590.png` (1.1 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260705_62913_PM_1783294222589.png` (531.1 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260705_91052_PM_1783304106219.png` (617.6 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260705_91130_PM_1783304106219.png` (594.8 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260705_91200_PM_1783304106219.png` (587.3 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260705_91232_PM_1783304106219.png` (568.2 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260705_91357_PM_1783304106219.png` (534.6 KiB) — refs: `client/src/components/world/WorldCaveOverlay.tsx`
- `attached_assets/Photoroom_20260706_104316_PM_1783395823714.png` (911.7 KiB) — refs: `client/src/pages/AquariumPage.tsx`
- `attached_assets/Photoroom_20260706_94656_PM_1783394294636.png` (1.0 MiB) — refs: `client/src/pages/AquariumPage.tsx`
- `attached_assets/Photoroom_20260706_95641_PM_1783394294636.png` (1.3 MiB) — refs: `client/src/pages/AquariumPage.tsx`
- `attached_assets/Photoroom_20260707_102745_PM_1783481611016.png` (1.5 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260707_102936_PM_1783481611016.png` (1.5 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260707_11349_PM_1783458650009.png` (247.9 KiB) — refs: `server/routes.ts`
- `attached_assets/Photoroom_20260707_11428_PM_1783458650009.png` (343.6 KiB) — refs: `server/routes.ts`
- `attached_assets/Photoroom_20260707_11506_PM_1783458650009.png` (373.2 KiB) — refs: `server/routes.ts`
- `attached_assets/Photoroom_20260707_11559_PM_1783458650009.png` (372.2 KiB) — refs: `server/routes.ts`
- `attached_assets/Photoroom_20260707_11649_PM_1783458650009.png` (372.3 KiB) — refs: `server/routes.ts`
- `attached_assets/Photoroom_20260707_11800_PM_1783458650009.png` (370.9 KiB) — refs: `server/routes.ts`
- `attached_assets/Photoroom_20260707_20149_PM_1783461445112.png` (8.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260707_64358_AM_1783425094349.png` (1.9 MiB) — refs: `client/src/pages/PvpArenaPage.tsx`, `client/src/pages/RaidLeaderboardPage.tsx`
- `attached_assets/Photoroom_20260707_64611_AM_1783425205559.png` (1.8 MiB) — refs: `client/src/pages/PvpArenaPage.tsx`
- `attached_assets/Photoroom_20260707_64701_AM_1783425136780.png` (445.4 KiB) — refs: `client/src/pages/PvpArenaPage.tsx`, `client/src/pages/RaidLeaderboardPage.tsx`
- `attached_assets/Photoroom_20260707_64734_AM_1783425136780.png` (296.5 KiB) — refs: `client/src/pages/PvpArenaPage.tsx`, `client/src/pages/RaidLeaderboardPage.tsx`
- `attached_assets/Photoroom_20260707_64923_AM_1783425136780.png` (495.1 KiB) — refs: `client/src/pages/PvpArenaPage.tsx`, `client/src/pages/RaidLeaderboardPage.tsx`
- `attached_assets/Photoroom_20260707_92022_PM_1783477769862.png` (301.0 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260707_92153_PM_1783477769862.png` (312.4 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260707_92309_PM_1783477809830.png` (523.4 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260707_94648_PM_1783478966948.png` (1.4 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260707_94710_PM_1783478966948.png` (1.3 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260707_95354_PM_1783479266963.png` (2.3 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260708_100323_PM_1783566697221.png` (2.2 MiB) — refs: `client/src/pages/ForumPage.tsx`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/Photoroom_20260708_101925_PM_1783567178576.png` (2.1 MiB) — refs: `client/src/pages/ForumPage.tsx`
- `attached_assets/Photoroom_20260708_111738_PM_1783570684580.png` (1.8 MiB) — refs: `client/src/pages/HomePage.tsx`
- `attached_assets/Photoroom_20260708_113712_AM_1783534774669.png` (2.2 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260708_34404_PM_1783543636588.png` (1.6 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260708_34527_PM_1783543636588.png` (1.1 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260708_40336_PM_1783544889601.png` (2.1 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260708_40401_PM_1783544889601.png` (2.4 MiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/Photoroom_20260708_51809_PM_1783549272918.png` (824.2 KiB) — refs: `client/src/components/DailyClaimCard.tsx`, `client/src/components/TopBar.tsx`, `client/src/components/WelcomeGiftScreen.tsx`
- `attached_assets/Photoroom_20260708_52007_PM_1783549272918.png` (919.3 KiB) — refs: `client/src/components/DailyClaimCard.tsx`, `client/src/components/RewardClaimModal.tsx`
- `attached_assets/Photoroom_20260709_102133_AM_1783610567237.png` (660.4 KiB) — refs: `client/src/components/TopBar.tsx`
- `attached_assets/Photoroom_20260709_24152_PM_1783626130265.png` (682.3 KiB) — refs: `client/src/components/TopBar.tsx`
- `attached_assets/Photoroom_20260709_53223_PM_1783636894557.png` (1.7 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260709_53253_PM_1783636894557.png` (1.7 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260709_53451_PM_1783636894557.png` (2.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260709_61016_PM_1783638836962.png` (1.8 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/Photoroom_20260709_92006_AM_1783607153082.png` (1.0 MiB) — refs: `client/src/components/TopBar.tsx`
- `attached_assets/Photoroom_20260709_92122_AM_1783607153082.png` (791.2 KiB) — refs: `client/src/components/TopBar.tsx`
- `attached_assets/Photoroom_20260711_31007_PM_1783820810778.png` (489.6 KiB) — refs: `client/src/pages/HomePage.tsx`, `client/src/pages/RaidBattlePage.tsx`, `client/src/pages/RaidPage.tsx`
- `attached_assets/Photoroom_20260711_52200_PM_1783810844517.png` (2.2 MiB) — refs: `client/src/pages/MapPage.tsx`
- `attached_assets/Photoroom_20260711_90748_PM_1783822223263.png` (1.5 MiB) — refs: `client/src/pages/RaidBattlePage.tsx`, `client/src/pages/RaidLeaderboardPage.tsx`, `client/src/pages/RaidPage.tsx`
- `attached_assets/Photoroom_20260711_90837_PM_1783822223263.png` (1.6 MiB) — refs: `client/src/pages/RaidPage.tsx`
- `attached_assets/Photoroom_20260714_43330_PM_1784076584992.png` (2.1 MiB) — refs: `client/src/components/DailyClaimCard.tsx`, `client/src/pages/RaidPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/acc_gem_amulet.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetInventory.tsx`
- `attached_assets/acc_haunted_1.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/acc_haunted_2.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/acc_haunted_3.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/acc_haunted_4.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/acc_haunted_5.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/acc_haunted_6.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_swamp_amulet.png` (435.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_swamp_armor.png` (1021.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_swamp_bow.png` (449.9 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_swamp_shield.png` (819.1 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_swamp_staff.png` (402.3 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_swamp_sword.png` (506.6 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_volcanic_amulet.png` (531.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_volcanic_armor.png` (933.0 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_volcanic_bow.png` (543.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_volcanic_shield.png` (710.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_volcanic_staff.png` (373.1 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/accessory_volcanic_sword.png` (538.1 KiB) — refs: `.agents/agent_assets_metadata.toml`, `artifacts/mockup-sandbox/public/ads/ad2-volcanic.html`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/admin_icon_badges.png` (1.3 MiB) — refs: `client/src/pages/AdminPage.tsx`
- `attached_assets/admin_icon_house_bundle.png` (1.5 MiB) — refs: `client/src/pages/AdminPage.tsx`
- `attached_assets/admin_icon_items.png` (1.4 MiB) — refs: `client/src/pages/AdminPage.tsx`
- `attached_assets/admin_icon_maintenance.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/AdminPage.tsx`
- `attached_assets/admin_icon_members.png` (1.2 MiB) — refs: `client/src/pages/AdminPage.tsx`
- `attached_assets/admin_icon_messages.png` (1.2 MiB) — refs: `client/src/pages/AdminPage.tsx`
- `attached_assets/admin_icon_pets.png` (1.4 MiB) — refs: `client/src/pages/AdminPage.tsx`
- `attached_assets/admin_icon_purchases.png` (1.2 MiB) — refs: `client/src/pages/AdminPage.tsx`
- `attached_assets/admin_icon_rewards_new.png` (1.5 MiB) — refs: `client/src/pages/AdminPage.tsx`
- `attached_assets/admin_icon_veridian_watcher_transparent.png` (1.3 MiB) — refs: `client/src/pages/AdminPage.tsx`
- `attached_assets/bait_ghost_shrimp.png` (578.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bait_hex_lure.png` (661.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bait_swamp_crawler.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_aquarium.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/AquariumPage.tsx`
- `attached_assets/bg_bayous_heart.webp` (116.6 KiB) — refs: `.agents/memory/worldpage-style-injection.md`, `client/src/components/WorldLoadingScreen.tsx`, `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_cauldrons_creep.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_cauldrons_creep_v2.png` (2.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_cauldrons_creep_v2.webp` (177.2 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_central_market.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_desert_map.png` (1.7 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/bg_desert_map.webp` (161.5 KiB) — refs: `client/src/pages/WorldPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_desert_td.webp` (237.3 KiB) — refs: `server/routes.ts`
- `attached_assets/bg_enchanted_grove_map.png` (1.9 MiB) — refs: `artifacts/mockup-sandbox/public/ads/ad1-grove.html`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/bg_enchanted_grove_map.webp` (217.3 KiB) — refs: `client/src/pages/WorldPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_enchanted_grove_td.webp` (273.0 KiB) — refs: `server/routes.ts`
- `attached_assets/bg_fishing_volcanic.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_haunted_menagerie_v2.png` (2.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_haunted_menagerie_v2.webp` (180.9 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_haunted_pet_shop.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_haunted_pond.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_haunted_woods_td.webp` (165.9 KiB) — refs: `server/routes.ts`
- `attached_assets/bg_haunted_woods_v2.png` (2.4 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/bg_haunted_woods_v2.webp` (192.0 KiB) — refs: `client/src/components/WorldLoadingScreen.tsx`
- `attached_assets/bg_home_v2.png` (1.4 MiB) — refs: `client/src/App.tsx`, `client/src/components/PetEquipAccessoriesPage.tsx`, `client/src/pages/AdminPage.tsx`, `client/src/pages/BadgePage.tsx`, `client/src/pages/HomePage.tsx` …
- `attached_assets/bg_island_map.png` (1.9 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/bg_island_map.webp` (209.6 KiB) — refs: `client/src/pages/WorldPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_island_td.webp` (220.0 KiB) — refs: `server/routes.ts`
- `attached_assets/bg_lava_crawl.webp` (553.7 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/bg_lava_fortress_volcanic.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_login.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/AuthPage.tsx`, `client/src/pages/ResetPasswordPage.tsx`
- `attached_assets/bg_market_cellar.webp` (157.3 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_mire_bazaar.webp` (154.8 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_mossy_cauldron.webp` (89.2 KiB) — refs: `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_murk_cave.webp` (80.9 KiB) — refs: `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_myst_pond.webp` (77.0 KiB) — refs: `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_shop_bayou.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_shop_bookshop_volcanic.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_shop_fishing.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_shop_food_swamp.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_shop_food_volcanic.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_shop_forge_fang_volcanic.png` (1.7 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_shop_mystical.png` (2.3 MiB) — refs: `client/src/components/world/WorldShopOverlay.tsx`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_shop_volcanic.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_shop_volcanic_pets.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `test/worldShopOverlay.test.ts`
- `attached_assets/bg_sky_realm_map.png` (1.6 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/bg_sky_realm_map.webp` (123.4 KiB) — refs: `client/src/pages/WorldPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_sky_realm_td.webp` (183.0 KiB) — refs: `server/routes.ts`
- `attached_assets/bg_snowy_mountain_map.png` (2.0 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/bg_snowy_mountain_map.webp` (220.1 KiB) — refs: `client/src/pages/WorldPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_snowy_mountain_td.webp` (245.1 KiB) — refs: `server/routes.ts`
- `attached_assets/bg_soggy_hook_v1.webp` (212.6 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_spectral_grove.png` (2.2 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_spectral_grove.webp` (162.2 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_swamp_critters.webp` (266.7 KiB) — refs: `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_swamp_map.png` (6.0 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/bg_swamp_map_v6.jpeg` (1.5 MiB) — refs: `client/src/pages/WorldPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_swamp_v5.webp` (164.9 KiB) — refs: `server/routes.ts`
- `attached_assets/bg_thicket.webp` (115.1 KiB) — refs: `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_tome_toad.webp` (193.0 KiB) — refs: `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_volcanic_map_v4.webp` (348.5 KiB) — refs: `client/src/components/WorldLoadingScreen.tsx`, `client/src/pages/ParaPetsHubPage.tsx`, `client/src/pages/WorldPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_welcome_center.webp` (572.0 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_well_of_fortune.webp` (170.2 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_willowmere_cottage.webp` (84.6 KiB) — refs: `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bg_world_map.png` (880.6 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/bobber_volcanic.png` (870.3 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/FishingPage.tsx`
- `attached_assets/book_bulwark_of_the_mountain.png` (837.6 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/book_ember_codex_strength.png` (794.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/book_heart_of_magma_tome.png` (941.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/book_magma_heart_manuscript.png` (857.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/book_obsidian_bulwark_codex.png` (831.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/book_phoenix_apex_compendium.png` (814.2 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/book_pyromancer_battle_grimoire.png` (846.2 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/book_titans_volcanic_aegis.png` (785.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/book_tome_of_lava_hide.png` (715.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/broken_rod.svg` (2.9 KiB) — refs: `client/src/pages/FishingPage.tsx`
- `attached_assets/btn_create_v2.png` (1.1 MiB) — refs: `client/src/pages/AuthPage.tsx`
- `attached_assets/btn_signin_v2.png` (1007.4 KiB) — refs: `client/src/pages/AuthPage.tsx`
- `attached_assets/edible_brimstone_pepper.png` (435.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/edible_cinder_crisps.png` (938.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/edible_ember_berry_tart.png` (698.9 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/edible_lava_egg.png` (636.2 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/edible_magma_skewer.png` (601.6 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/edible_obsidian_glazed_ham.png` (916.9 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/edible_phoenix_feast_platter.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/edible_roasted_drake_wing.png` (855.9 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/edible_sulfur_mushroom_stew.png` (718.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/edible_volcanic_bone_broth.png` (715.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/enemy_bog_toad.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/enemy_elder_treant.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/enemy_mud_lurker.png` (1.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/enemy_wisp.png` (1.0 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_ash_bream.png` (549.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_barrel.png` (1006.0 KiB) — refs: `client/src/pages/SellFishPage.tsx`, `client/src/pages/WorldPage.tsx`
- `attached_assets/fish_basalt_char.png` (501.4 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_brimstone_tetra.png` (717.1 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_caldera_crusher.png` (834.0 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_cinder_guppy.png` (588.2 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_cinder_sprat.png` (388.4 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_dragon.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/seedSampleTemplates.ts`
- `attached_assets/fish_ember_carp.png` (708.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_glowtail_sardine.png` (275.0 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_ironscale_trench.png` (702.1 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_lavafin_koi.png` (845.6 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_lord_inferno.png` (1009.6 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_magma_bass.png` (609.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_magma_minnow.png` (429.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_obsidian_pike.png` (987.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_phoenix_lungfish.png` (903.6 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_pumice_loach.png` (465.3 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_pyroclast_piranha.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_smoldering_catfish.png` (468.2 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_soot_tadpole.png` (434.0 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_sulfur_eel.png` (584.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fish_volcanic_anglerfish.png` (577.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/fishing_bg_portrait.png` (1.3 MiB) — refs: `client/src/pages/FishingPage.tsx`
- `attached_assets/generated_images/bg_central_market.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`, `test/worldShopOverlay.test.ts`
- `attached_assets/generated_images/enemy_bayou_wraith.png` (721.7 KiB) — refs: `client/src/lib/elysianClearingCombatConfig.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_bog_serpent_queen.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_cave_wisp.png` (579.4 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_hex_frog.png` (952.9 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t10_ancient_bayou_god.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t10_bayou_nightmare.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t10_grand_voodoo_shaman.png` (963.1 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t10_hex_abomination.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t10_swamp_colossus.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t1_boglet.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t1_murk_newt.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t1_puddle_grub.png` (1.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t1_slime_duchess.png` (1.6 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t1_swamp_wraith.png` (1.7 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t2_bog_basilisk.png` (1.6 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t2_cave_leech.png` (1.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t2_hex_toad.png` (1.6 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t2_mire_moth.png` (1.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t2_thornback_salamander.png` (1.6 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t3_cavern_hydra.png` (1.6 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t3_gloomfin.png` (1.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t3_murk_shade.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t3_rotwood_stalker.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t3_wail_eel.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t4_abyss_sprite.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t4_crystal_gorgon.png` (1.6 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t4_dread_lamprey.png` (1.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t4_murk_titan.png` (1.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t4_venom_crawler.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t5_ancient_lurker.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t5_deep_sovereign.png` (1.8 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t5_soul_drifter.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t5_umbra_wisp.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t5_void_hatchling.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t6_bayou_overlord.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t6_bog_revenant.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t6_murk_phantom.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t6_serpent_warden.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t6_swamp_specter.png` (854.3 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t7_crystal_colossus.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t7_crystal_wraith.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t7_frost_specter.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t7_glacier_sentinel.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t7_shard_imp.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t8_baron_nightfall.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t8_cursed_effigy.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t8_hex_revenant.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t8_voodoo_husk.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t8_voodoo_shaman.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t9_bayou_hex_warlord.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t9_bog_devourer.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t9_murk_crusher.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t9_primordial_murk.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/enemy_t9_swamp_ravager.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/feed_button_icon.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/PetHousePage.tsx`
- `attached_assets/generated_images/fishing_fish_icon.png` (735.2 KiB) — refs: `client/src/pages/FishingPage.tsx`
- `attached_assets/generated_images/founders_bg.png` (1.5 MiB) — refs: `client/src/pages/FoundersPage.tsx`
- `attached_assets/generated_images/gift_bayou_moon_crystal.png` (1.1 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/gift_gator_tooth_charm.png` (1.1 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/gift_icon_forest.png` (2.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/FriendProfileModal.tsx`, `client/src/components/GiftClaimModal.tsx`, `client/src/components/SendGiftModal.tsx`
- `attached_assets/generated_images/gift_murky_marsh_pearl.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/gift_swamp_wisp_lantern.png` (1.1 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/gift_voodoo_moss_locket.png` (1.2 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/gift_witchs_cursed_bloom.png` (1.2 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/generated_images/hub_para_pet_transparent.png` (859.9 KiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/generated_images/icon_battle_trophy.png` (821.3 KiB) — refs: `client/src/pages/PvpArenaPage.tsx`, `client/src/pages/PvpBattlePage.tsx`, `new_version.tsx`, `old_version.tsx`, `pvp_diff.patch`
- `attached_assets/generated_images/icon_coin_bag.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/TopBar.tsx`
- `attached_assets/generated_images/icon_egg_magic.png` (1013.6 KiB) — refs: `client/src/components/PetInventory.tsx`, `client/src/components/WelcomeGiftScreen.tsx`, `client/src/pages/HomePage.tsx`, `client/src/pages/MarketPage.tsx`
- `attached_assets/generated_images/icon_fish_common.png` (784.0 KiB) — refs: `client/src/components/FishingAdminPanel.tsx`, `client/src/pages/SellFishPage.tsx`, `client/src/pages/WorldPage.tsx`
- `attached_assets/generated_images/icon_fish_rod.png` (463.9 KiB) — refs: `client/src/components/FishingAdminPanel.tsx`, `client/src/pages/SellFishPage.tsx`
- `attached_assets/generated_images/icon_fishing_volcanic.png` (914.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldLocations.tsx`
- `attached_assets/generated_images/icon_gem_crystal.png` (992.4 KiB) — refs: `client/src/components/PetDetailPage.tsx`, `client/src/components/PetEquipAccessoriesPage.tsx`
- `attached_assets/generated_images/icon_main_nav.png` (1.1 MiB) — refs: `client/src/components/FloatingNav.tsx`
- `attached_assets/generated_images/icon_pet_placeholder.png` (842.6 KiB) — refs: `client/src/components/BattleArena.tsx`, `client/src/components/PetDetailPage.tsx`, `client/src/components/PetInventory.tsx`, `client/src/components/PetPowerUpModal.tsx`, `client/src/components/PlayerDetailPanel.tsx` …
- `attached_assets/generated_images/icon_powerup_bag.png` (937.1 KiB) — refs: `client/src/components/PetInventory.tsx`, `client/src/components/PetPowerUpModal.tsx`, `client/src/components/PowerUpOverlay.tsx`, `client/src/components/WelcomeGiftScreen.tsx`, `client/src/pages/MarketPage.tsx`
- `attached_assets/generated_images/icon_stat_atk.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetDetailPage.tsx`, `client/src/components/PetInventory.tsx`
- `attached_assets/generated_images/icon_stat_def.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetDetailPage.tsx`, `client/src/components/PetInventory.tsx`
- `attached_assets/generated_images/icon_stat_hp.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetDetailPage.tsx`, `client/src/components/PetInventory.tsx`
- `attached_assets/generated_images/icon_tut_accessory.png` (1.4 MiB) — refs: `client/src/components/PetDetailPage.tsx`
- `attached_assets/generated_images/icon_tut_levelup.png` (1.4 MiB) — refs: `client/src/components/PetDetailPage.tsx`
- `attached_assets/generated_images/icon_tut_lvlitem.png` (1.7 MiB) — refs: `client/src/components/PetDetailPage.tsx`
- `attached_assets/generated_images/icon_tut_nickname.png` (1.5 MiB) — refs: `client/src/components/PetDetailPage.tsx`
- `attached_assets/generated_images/icon_tut_powerup.png` (1.7 MiB) — refs: `client/src/components/PetDetailPage.tsx`
- `attached_assets/generated_images/icon_tut_rarity.png` (1.6 MiB) — refs: `client/src/components/PetDetailPage.tsx`
- `attached_assets/generated_images/icon_tut_stats.png` (1.6 MiB) — refs: `client/src/components/PetDetailPage.tsx`
- `attached_assets/generated_images/joystick_base.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/PetWorldPage.tsx`
- `attached_assets/generated_images/joystick_thumb_v3.png` (1.2 MiB) — refs: `client/src/pages/PetWorldPage.tsx`
- `attached_assets/generated_images/nav_icon_active_pet_new.png` (551.3 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/FloatingNav.tsx`
- `attached_assets/generated_images/nav_icon_badges.png` (716.4 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/FloatingNav.tsx`, `client/src/pages/HomePage.tsx`
- `attached_assets/generated_images/nav_icon_home.png` (853.5 KiB) — refs: `client/src/components/FloatingNav.tsx`, `client/src/components/FriendProfileModal.tsx`
- `attached_assets/generated_images/nav_icon_map.png` (1.1 MiB) — refs: `client/src/components/FloatingNav.tsx`, `client/src/pages/HomePage.tsx`
- `attached_assets/generated_images/nav_icon_map_new.png` (1.5 MiB) — refs: `client/src/pages/HomePage.tsx`
- `attached_assets/generated_images/nav_icon_map_nobg.png` (1.1 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/generated_images/nav_icon_map_v3.png` (570.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/FloatingNav.tsx`
- `attached_assets/generated_images/nav_icon_market.png` (1.1 MiB) — refs: `client/src/components/FloatingNav.tsx`
- `attached_assets/generated_images/nav_icon_pets.png` (1.3 MiB) — refs: `client/src/components/FloatingNav.tsx`, `client/src/pages/HomePage.tsx`
- `attached_assets/generated_images/nav_icon_pvp.png` (1.0 MiB) — refs: `client/src/components/FloatingNav.tsx`, `client/src/pages/HomePage.tsx`, `client/src/pages/PvpArenaPage.tsx`
- `attached_assets/generated_images/npc_lava_hook_shopkeeper.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `test/worldShopOverlay.test.ts`
- `attached_assets/generated_images/pet_card_frame.png` (988.2 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetInventory.tsx`
- `attached_assets/generated_images/pet_card_texture.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetInventory.tsx`
- `attached_assets/generated_images/pet_inventory_bg.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetInventory.tsx`
- `attached_assets/generated_images/pet_inventory_divider.png` (408.1 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetInventory.tsx`
- `attached_assets/generated_images/powerup_forest_bg.png` (1.5 MiB) — refs: `client/src/components/PetInventory.tsx`, `client/src/components/PetPowerUpModal.tsx`
- `attached_assets/generated_images/pvp_battle_sword.png` (942.0 KiB) — refs: `client/src/components/PvpMatchmakingOverlay.tsx`, `client/src/pages/PvpArenaPage.tsx`
- `attached_assets/generated_images/veridian_watcher_avatar.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/WorldChatPanel.tsx`, `client/src/pages/HomePage.tsx`
- `attached_assets/generated_images/welcome_dev_notice_bg.png` (1.6 MiB) — refs: `client/src/components/DevelopmentNoticeScreen.tsx`
- `attached_assets/germ_slime.png` (725.2 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/seedSampleTemplates.ts`
- `attached_assets/gift_bayou_moon_crystal.png` (1.2 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_gator_tooth_charm.png` (1.2 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_1.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_10.png` (854.8 KiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_11.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_12.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_13.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_14.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_15.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_2.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_3.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_4.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_5.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_6.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_7.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_8.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_haunted_9.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_murky_marsh_pearl.png` (1.6 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_swamp_wisp_lantern.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_voodoo_moss_locket.png` (1.4 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/gift_witchs_cursed_bloom.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/hs_icon_browser.png` (1.4 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hs_icon_check.png` (1.4 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hs_icon_globe.png` (1.5 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hs_icon_menu.png` (987.5 KiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hs_icon_phone.png` (1.5 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hs_icon_plus.png` (1.1 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hs_icon_share.png` (1.3 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hub_eggs.png` (1.1 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hub_hero_banner.png` (1.3 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hub_podium.png` (1.5 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hub_rank_crowns.png` (1.2 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/hub_rune_circle.png` (1.2 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_accessory_shop_volcanic.png` (1.1 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_badges_new.png` (1.4 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_bag.png` (1.3 MiB) — refs: `client/src/components/FloatingNav.tsx`, `client/src/components/PetInventory.tsx`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_battle_block.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/BattleArena.tsx`
- `attached_assets/icon_battle_counter.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/BattleArena.tsx`
- `attached_assets/icon_battle_crossed_swords.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/BattleArena.tsx`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_battle_hitmark.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/BattleArena.tsx`
- `attached_assets/icon_battle_rage.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/BattleArena.tsx`
- `attached_assets/icon_battle_warning.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/BattleArena.tsx`
- `attached_assets/icon_bayous_heart_original.png` (102.1 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_bookshop_volcanic.png` (1.3 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_cauldrons_creep.png` (1.8 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_coin.png` (1.4 MiB) — refs: `client/src/components/BattleArena.tsx`, `client/src/components/DailyClaimCard.tsx`, `client/src/components/ExploreAdminPanel.tsx`, `client/src/components/FloatingNav.tsx`, `client/src/components/FriendProfileModal.tsx` …
- `attached_assets/icon_cooking_forge_volcanic.png` (776.6 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_decor_inventory.png` (1.5 MiB) — refs: `client/src/pages/PetHousePage.tsx`
- `attached_assets/icon_fish_inventory.png` (1.6 MiB) — refs: `client/src/pages/AquariumPage.tsx`, `client/src/pages/FishingPage.tsx`, `client/src/pages/MarketPage.tsx`
- `attached_assets/icon_fishbowl.png` (1.4 MiB) — refs: `client/src/components/FloatingNav.tsx`
- `attached_assets/icon_fishing_bait.png` (912.8 KiB) — refs: `client/src/components/FishingAdminPanel.tsx`, `client/src/pages/FishingPage.tsx`
- `attached_assets/icon_fishing_pole.png` (939.2 KiB) — refs: `client/src/pages/FishingPage.tsx`, `client/src/pages/ParaPetsHubPage.tsx`, `client/src/pages/WorldPage.tsx`
- `attached_assets/icon_fishing_shack.png` (2.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_fishing_shop_volcanic.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_fishing_volcanic.png` (914.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldLocations.tsx`
- `attached_assets/icon_food_shop_swamp.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_food_shop_volcanic.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_friends_inventory.png` (896.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_globe_world.png` (1.2 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_globe_world.webp` (60.6 KiB) — refs: `client/src/components/FloatingNav.tsx`
- `attached_assets/icon_haunted_pet_shop.png` (1.9 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_haunted_pond.png` (1.6 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_home_inventory.png` (1.2 MiB) — refs: `client/src/pages/PetHousePage.tsx`
- `attached_assets/icon_home_new.png` (1.5 MiB) — refs: `client/src/pages/MarketPage.tsx`
- `attached_assets/icon_kc_central_market.png` (552.0 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_kc_welcome_center.png` (129.9 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_kc_well_of_fortune.png` (116.2 KiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_lava_fortress_volcanic.png` (1.0 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_map_new.png` (1.3 MiB) — refs: `client/src/pages/HomePage.tsx`
- `attached_assets/icon_market.png` (1.4 MiB) — refs: `client/src/components/FloatingNav.tsx`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_mire_bazaar.png` (1.6 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_mixing_tree_cauldron.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_mossy_cauldron.png` (1.2 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_murk_cave.png` (2.1 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_myst_pond_v2.png` (71.7 KiB) — refs: `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_pet_house.png` (1.5 MiB) — refs: `client/src/components/PlayerDetailPanel.tsx`, `client/src/pages/ParaPetsHubPage.tsx`, `client/src/pages/PetWorldPage.tsx`
- `attached_assets/icon_pet_inventory.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/PetHousePage.tsx`
- `attached_assets/icon_pet_shop_volcanic.png` (1.7 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_pets.png` (1.3 MiB) — refs: `client/src/components/FloatingNav.tsx`, `client/src/pages/AdminPage.tsx`, `client/src/pages/HomePage.tsx`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_pvp_new.png` (1.4 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_quest_v5.png` (1.4 MiB) — refs: `client/src/pages/AdminPage.tsx`, `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/icon_spectral_grove.png` (1.7 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_swamp_critters.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_thicket.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_tome_toad.png` (1.5 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/icon_willowmere_cottage.png` (1.1 MiB) — refs: `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/item_crystal_charm.png` (730.3 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetInventory.tsx`
- `attached_assets/lava_crawl_btn_back.webp` (65.7 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_crawl_btn_leaderboard.webp` (67.8 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_crawl_btn_play.webp` (56.2 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_crawl_gem.webp` (15.7 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_crawl_lb_btn_back.webp` (27.1 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_crawl_lb_btn_play.webp` (26.9 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_crawl_lb_frame.webp` (64.4 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_crawl_title.webp` (139.2 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_ground_cap.webp` (45.3 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_ground_tile.webp` (319.4 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_pillar.webp` (120.2 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_slab_1.webp` (23.9 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_slab_2.webp` (28.4 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_slab_3.webp` (20.5 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/lava_texture.webp` (239.0 KiB) — refs: `client/src/pages/LavaCrawlPage.tsx`
- `attached_assets/loading_orb.webp` (83.9 KiB) — refs: `client/src/components/LoadingScreen.tsx`
- `attached_assets/logo_parapets.png` (1.1 MiB) — refs: `client/index.html`, `client/public/manifest.json`, `client/public/robots.txt`, `client/src/pages/ParaPetsHubPage.tsx`, `client/src/pages/ResetPasswordPage.tsx` …
- `attached_assets/maintenance_scene.png` (1.6 MiB) — refs: `client/src/pages/MaintenancePage.tsx`
- `attached_assets/molten_block_I.webp` (328.3 KiB) — refs: `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/molten_block_J.webp` (156.9 KiB) — refs: `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/molten_block_L.webp` (174.8 KiB) — refs: `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/molten_block_O.webp` (314.6 KiB) — refs: `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/molten_block_S.webp` (176.3 KiB) — refs: `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/molten_block_T.webp` (141.7 KiB) — refs: `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/molten_block_Z.webp` (144.2 KiB) — refs: `client/src/pages/MoltenBlocksPage.tsx`
- `attached_assets/mood_face_content.png` (867.5 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/PetHousePage.tsx`
- `attached_assets/mood_face_happy.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/PetHousePage.tsx`
- `attached_assets/mood_face_hungry.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/PetHousePage.tsx`
- `attached_assets/mood_face_sad.png` (991.7 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/PetHousePage.tsx`
- `attached_assets/nav_icon_map_nobg.png` (1.6 MiB) — refs: `client/src/pages/ParaPetsHubPage.tsx`
- `attached_assets/npc_lava_hook_shopkeeper.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `test/worldShopOverlay.test.ts`
- `attached_assets/potion_health.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/PetInventory.tsx`
- `attached_assets/price_tag.png` (555.2 KiB) — refs: `client/src/pages/PetWorldPage.tsx`
- `attached_assets/shop_desert.png` (1.8 MiB) — refs: `client/src/pages/WorldPage.tsx`
- `attached_assets/shop_enchanted_grove_v2.png` (1.9 MiB) — refs: `client/src/pages/WorldPage.tsx`
- `attached_assets/shop_frostpeak.png` (1.4 MiB) — refs: `client/src/pages/WorldPage.tsx`
- `attached_assets/shop_haunted_woods.png` (1.3 MiB) — refs: `client/src/pages/WorldPage.tsx`
- `attached_assets/shop_island.png` (1.9 MiB) — refs: `client/src/pages/WorldPage.tsx`
- `attached_assets/shop_sky_realm.png` (1.5 MiB) — refs: `client/src/pages/WorldPage.tsx`
- `attached_assets/shop_swamp.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/WorldPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`
- `attached_assets/shop_volcanic.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/components/world/WorldShopOverlay.tsx`, `client/src/pages/MoltenBlocksPage.tsx`, `client/src/pages/WorldPage.tsx`, `server/startup/backfills/runNonCriticalStartup.ts` …
- `attached_assets/world_desert_v3.png` (1.4 MiB) — refs: `client/src/pages/MapPage.tsx`
- `attached_assets/world_enchanted_grove_v2.png` (1.7 MiB) — refs: `client/src/pages/MapPage.tsx`
- `attached_assets/world_frostpeak_v2.png` (1.4 MiB) — refs: `client/src/pages/MapPage.tsx`
- `attached_assets/world_haunted_woods_v3.png` (1.5 MiB) — refs: `client/src/pages/MapPage.tsx`
- `attached_assets/world_lost_island.png` (1.6 MiB) — refs: `client/src/pages/MapPage.tsx`
- `attached_assets/world_sky_realm_v3.png` (1.4 MiB) — refs: `client/src/pages/MapPage.tsx`
- `attached_assets/world_swamp_v5.png` (756.1 KiB) — refs: `.agents/agent_assets_metadata.toml`, `client/src/pages/MapPage.tsx`
- `attached_assets/world_volcanic_v3.png` (1.2 MiB) — refs: `client/src/pages/MapPage.tsx`
- `attached_assets/worlds/elysian-bayou/elysian-bayou-clearing/background.jpg` (441.7 KiB) — refs: `attached_assets/Pasted-Add-a-new-explore-location-to-the-Elysian-Bayou-world-c_1784693531786.txt`, `client/src/pages/ElysianBayouClearingPage.tsx`
- `attached_assets/worlds/elysian-bayou/elysian-bayou-clearing/icon.png` (1.7 MiB) — refs: `.agents/agent_assets_metadata.toml`, `.replit`, `attached_assets/Pasted-Add-a-new-explore-location-to-the-Elysian-Bayou-world-c_1784693531786.txt`, `client/index.html`, `client/public/manifest.json` …

### Referenced By Seeds/Configuration/Documentation Only (217)

- `attached_assets/acc_arcane_glove.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/acc_arcane_ring.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/acc_charm_anklet.png` (943.8 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/acc_dragon_brooch.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/acc_magic_crown.png` (769.0 KiB) — refs: `.agents/agent_assets_metadata.toml`, `artifacts/mockup-sandbox/public/ads/ad1-grove.html`
- `attached_assets/acc_moon_earrings.png` (859.1 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/acc_rune_buckle.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/acc_vine_bracelet.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/acc_wizard_pin.png` (570.7 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/admin_icon_chat_filter.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/admin_icon_enemies.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/admin_icon_fishing.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/admin_icon_veridian_watcher.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/admin_pole.png` (939.2 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/betta_celestial.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `artifacts/mockup-sandbox/public/ads/ad1-grove.html`
- `attached_assets/betta_crimson.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`, `artifacts/mockup-sandbox/public/ads/ad2-volcanic.html`
- `attached_assets/betta_frost.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/betta_galaxy.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`, `artifacts/mockup-sandbox/public/ads/ad3-swamp.html`
- `attached_assets/betta_gold.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/betta_jade.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/betta_sapphire.png` (1.7 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/betta_shadow.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/betta_sunset.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/betta_venom.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/bg_bayous_heart.png` (1.6 MiB) — refs: `artifacts/mockup-sandbox/public/ads/ad3-swamp.html`
- `attached_assets/bg_desktop_backdrop.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/bg_fishing_shack.png` (2.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/bg_soul_pond.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/bg_swamp_critters.png` (16.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_aegis_manuscript.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_battlemage_codex.png` (996.2 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_chronicle_of_ages.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_ember_rune_journal.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_grimoire_of_iron_ward.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_lifebloom_compendium.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_shadowbound_lexicon.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_swamp_witch_spellbook.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_tome_of_vitality.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/book_war_grimoire.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/cave_enter_t10.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/cave_enter_t6.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/cave_enter_t7.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/cave_enter_t8.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/cave_enter_t9.png` (1018.6 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/coin_pack_1000_v2.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/coin_pack_1000_v3.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/coin_pack_2500_v2.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/coin_pack_2500_v3.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/coin_pack_7500_v2.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/coin_pack_7500_v3.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/daily_login_chest_icon.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/daily_login_claimed_icon.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/daily_login_rainforest_banner.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_bloodMoon.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_celestial.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_crystal.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_deepSea.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_frost.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_golden.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_koi.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_lava.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_nature.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_phantom.png` (864.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_rainbow.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_storm.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_toxic.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/fish_water.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/a_cute_chibi_fantasy_3ecc.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/badge_admin.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/badge_moderator.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/cute_chibi_fluffy_round_a229.png` (778.8 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/dessert_world_background.png` (2.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_ancient_cave_creature_3e5a.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_ancient_cave_creature_45eb.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_ancient_cave_creature_90e4.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_ancient_cave_mini_9351.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_bayou_boss_an_e1b1.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_bayou_cave_creature_05ed.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_bayou_creature_a_54e0.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_bayou_mini_boss_1491.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_boss_a_9651.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_boss_a_9821.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_boss_a_ec30.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_creature_a_399f.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_creature_a_6312.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_creature_a_9fd1.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_creature_a_a852.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_creature_a_ede0.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_creature_a_ef91.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_creature_an_8f5c.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_mini_boss_0399.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_mini_boss_82f1.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_cave_mini_boss_aab1.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_deep_cave_creature_5e4a.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_deep_cave_creature_6eaf.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_deep_cave_creature_a50a.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/fantasy_final_boss_the_1eb7.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/feeding_page_bg.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/generated_image.png` (861.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/horizontal_wide_banner_for_f3f1.png` (840.6 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/icon_skull_defeat.png` (1.1 MiB) — refs: `new_version.tsx`, `old_version.tsx`, `pvp_diff.patch`
- `attached_assets/generated_images/joystick_thumb.png` (730.2 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/nav_icon_friends.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/nav_icon_map_v2.png` (638.7 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/nav_icon_world_chat.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/pet_card_divider.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/pvp_leaderboard_panel_bg.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/pvp_platinum_trophy.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/pvp_ruins_battlefield_bg.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`, `new_version.tsx`, `old_version.tsx`
- `attached_assets/generated_images/wide_horizontal_banner_for_f3b2.png` (948.7 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/wide_horizontal_banner_illustration_665c.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/wide_horizontal_game_banner_65f1.png` (872.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/wide_horizontal_kawaii_fantasy_afc1.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/generated_images/wide_horizontal_promotional_banner_3013.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/germ_blob.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/germ_crown.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/germ_fuzzy.png` (707.5 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/germ_jelly.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/germ_mossy.png` (784.0 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/germ_prickle.png` (679.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/germ_spiky.png` (831.7 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/germ_wiggly.png` (736.4 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/germ_zappy.png` (853.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_dragons_tongue.png` (778.1 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_firebloom.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_frost_fern.png` (929.5 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_moonleaf.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_shadow_thistle.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_shimmer_moss.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_spiritbloom.png` (647.6 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_starwort.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_sunpetal.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/herb_swamp_sage.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/hub_chest_opened.png` (1.4 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/icon_battle_skill.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/icon_inworld_paw.png` (834.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/icon_online_orb.png` (783.2 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/item_arcane_feather.png` (810.1 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/item_bog_amber.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/item_dragon_scale.png` (800.6 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/item_glow_mushroom.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/item_golden_acorn.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/item_hex_doll.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/item_moonpetal.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/item_runestone.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/item_spirit_wisp.png` (998.5 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/joystick_base_vines.png` (750.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/joystick_thumb_vines.png` (707.5 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/molten_block_I.png` (2.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/molten_block_J.png` (1.7 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/molten_block_L.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/molten_block_O.png` (2.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/molten_block_S.png` (1.7 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/molten_block_T.png` (1.7 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/molten_block_Z.png` (1.6 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_arcane.png` (558.6 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_blossom.png` (607.2 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_celestial.png` (1021.6 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_dragonbone.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_ice.png` (982.5 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_jeweled.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_nature.png` (938.1 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_spirit.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_storm.png` (660.2 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pole_swamp.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_curse.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_dream.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_earth.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_energy.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_fire.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_forest.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_frost.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_healing.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_invisibility.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_lightning.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_love.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_luck.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_mana.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_nature.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_ocean.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_poison.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_rainbow.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_shadow.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_speed.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_spirit.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_starlight.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_storm.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_strength.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/potion_swamp.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pw_ground_layer.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/pw_ground_preview.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/rod_bamboo.png` (1004.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/rod_mossy.png` (925.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/rod_oak.png` (614.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/rod_swamp2.png` (617.4 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/rod_willow.png` (993.0 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_axolotl.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_eel.png` (1.7 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_jellyfish.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_lobster.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_manta.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_nautilus.png` (1.0 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_octopus.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_seahorse.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_serpent.png` (1.8 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/sea_turtle.png` (1.3 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_arcane_sword.png` (1.2 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_crystal_spear.png` (937.5 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_crystal_staff.png` (969.5 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_fire_hammer.png` (925.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_moon_bow.png` (497.8 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_nature_shield.png` (1.5 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_shadow_dagger.png` (686.9 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_spell_wand.png` (1016.8 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_spirit_scythe.png` (982.4 KiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/weapon_storm_axe.png` (1.1 MiB) — refs: `.agents/agent_assets_metadata.toml`
- `attached_assets/world_swamp_v4.png` (830.3 KiB) — refs: `.agents/agent_assets_metadata.toml`

### Apparently Unreferenced (357)

- `attached_assets/28F4B5DB-5242-454B-BCA3-223CF7D9A82E_1783625818565.png` (1.3 MiB)
- `attached_assets/2F36B2AF-8B72-447E-B0C6-7665A510C7AD_1781967212205.png` (2.5 MiB)
- `attached_assets/310B7DC6-36B8-425F-91D3-610286777071_1781967212205.png` (2.2 MiB)
- `attached_assets/3570A100-E614-4859-B2FE-E1CBA195E3F3_1783471115461.png` (2.0 MiB)
- `attached_assets/3F06C346-6A2F-4619-A316-5D6BC5DF9923_1782174396892.jpeg` (1.8 MiB)
- `attached_assets/4E7A4774-0472-4384-8F79-FD00A26622D7_1773677388395.jpeg` (1020.8 KiB)
- `attached_assets/4E7A4774-0472-4384-8F79-FD00A26622D7_1773694628042.jpeg` (1020.8 KiB)
- `attached_assets/624E9C6A-C19B-4F23-B51C-C1DBDCED8073_1781971277636.png` (2.4 MiB)
- `attached_assets/66A982C2-2B49-4DE0-8EE6-79C542E3351B_1781303706759.png` (2.9 MiB)
- `attached_assets/6A646DC3-3D6D-4453-B8D6-E838E1A7055C_1784693527050.png` (1.7 MiB)
- `attached_assets/7D6E04B4-CD26-478A-9D79-DA7F5C466D91_1773675435607.png` (3.0 MiB)
- `attached_assets/7D6E04B4-CD26-478A-9D79-DA7F5C466D91_1773675767965.png` (3.0 MiB)
- `attached_assets/802D8A64-1219-44FB-9236-BA5264CE7066_1777757807875.jpeg` (1.5 MiB)
- `attached_assets/802D8A64-1219-44FB-9236-BA5264CE7066_1777807375036.jpeg` (1.5 MiB)
- `attached_assets/86B445BC-A94D-4DBB-9341-4FA870C335C1_1781967212205.png` (2.4 MiB)
- `attached_assets/9AD71EA4-A07D-4D8F-A82B-B2D001890360_1774818275441.png` (16.5 MiB)
- `attached_assets/AAC47494-B2BD-4B73-B01A-769E2C589AD7_1783460456416.png` (19.4 MiB)
- `attached_assets/AAC47494-B2BD-4B73-B01A-769E2C589AD7_1783461445112.png` (19.4 MiB)
- `attached_assets/ADC7176E-7F09-4D44-90E5-13A4ADF22BCE_1781967212205.png` (2.4 MiB)
- `attached_assets/AE6B62BB-AAF5-4C26-A5C8-77F4673DAF8C_1774902093524.png` (1.8 MiB)
- `attached_assets/AE6B62BB-AAF5-4C26-A5C8-77F4673DAF8C_1774902802594.png` (1.8 MiB)
- `attached_assets/AE6B62BB-AAF5-4C26-A5C8-77F4673DAF8C_1774904593039.png` (1.8 MiB)
- `attached_assets/B914BFEB-E34D-46B1-B1D9-944E58F993A4_1773680571450.png` (13.8 MiB)
- `attached_assets/Bw2oFWFOIqupAAAAAElFTkSuQmCC_1774405481932.png` (1.4 MiB)
- `attached_assets/CA27FB53-CED2-4A42-BF1B-FE725FFEDAC5_1781833011623.png` (2.2 MiB)
- `attached_assets/CEE434EF-D93D-4785-9BBF-A58019A0711F_1774405900881.png` (2.7 MiB)
- `attached_assets/D50DDF64-43C0-4497-A12A-BAEFD051D456_1784693527050.jpeg` (441.7 KiB)
- `attached_assets/D651F5A0-5A0C-42EE-9EA0-EF743D851787_1774795658329.jpeg` (7.0 MiB)
- `attached_assets/D87F3084-04E2-4486-8E61-93E4BC32728F_1773675435607.jpeg` (964.5 KiB)
- `attached_assets/D87F3084-04E2-4486-8E61-93E4BC32728F_1773675767966.jpeg` (964.5 KiB)
- `attached_assets/DB776142-DA82-45B4-8946-17C57A14FA10_1773753084762.png` (18.2 MiB)
- `attached_assets/E1B71BA1-EAAA-4E62-9596-72A3B30D368B_1781303706759.png` (2.4 MiB)
- `attached_assets/E3532706-8FDD-42D5-9F33-012954AB1DBB_1773749971489.png` (2.0 MiB)
- `attached_assets/E88CFEB0-99C9-4B2B-A6E0-80B22F411B2A_1774581172721.png` (2.6 MiB)
- `attached_assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783809194294.png` (4.6 MiB)
- `attached_assets/IMG_2180_1772678395536.jpeg` (347.3 KiB)
- `attached_assets/IMG_2181_1772678395536.jpeg` (390.8 KiB)
- `attached_assets/IMG_2216_1772848986461.png` (2.8 MiB)
- `attached_assets/IMG_2368_1773444713773.jpeg` (387.7 KiB)
- `attached_assets/IMG_2378_1773500661440.jpeg` (247.5 KiB)
- `attached_assets/IMG_2379_1773505022317.png` (1.6 MiB)
- `attached_assets/IMG_2434_1773584354962.jpeg` (432.8 KiB)
- `attached_assets/IMG_2493_1773627173953.png` (1.5 MiB)
- `attached_assets/IMG_2498_1773675435607.jpeg` (128.9 KiB)
- `attached_assets/IMG_2520_1773686930981.jpeg` (102.9 KiB)
- `attached_assets/IMG_2535_1773703722720.jpeg` (130.9 KiB)
- `attached_assets/IMG_2535_1773705636876.jpeg` (130.9 KiB)
- `attached_assets/IMG_2535_1773707033973.jpeg` (130.9 KiB)
- `attached_assets/IMG_2537_1773706934125.png` (2.9 MiB)
- `attached_assets/IMG_2538_1773707705666.png` (2.9 MiB)
- `attached_assets/IMG_2541_1773714263236.jpeg` (56.2 KiB)
- `attached_assets/IMG_2542_1773716328050.png` (8.8 MiB)
- `attached_assets/IMG_2543_1773718133318.png` (8.4 MiB)
- `attached_assets/IMG_2544_1773748626384.jpeg` (205.1 KiB)
- `attached_assets/IMG_2545_1773748637153.png` (2.4 MiB)
- `attached_assets/IMG_2597_1773793917714.jpeg` (203.9 KiB)
- `attached_assets/IMG_2630_1774009418664.jpeg` (185.8 KiB)
- `attached_assets/IMG_2631_1774009418664.jpeg` (188.3 KiB)
- `attached_assets/IMG_2632_1774009418664.jpeg` (46.4 KiB)
- `attached_assets/IMG_2640_1774055718346.jpeg` (283.2 KiB)
- `attached_assets/IMG_2854_1774401747296.png` (1.6 MiB)
- `attached_assets/IMG_2854_1774402855464.png` (1.6 MiB)
- `attached_assets/IMG_2854_1774470942301.png` (1.6 MiB)
- `attached_assets/IMG_2855_1774403746417.jpeg` (181.8 KiB)
- `attached_assets/IMG_2855_1774403903544.jpeg` (181.8 KiB)
- `attached_assets/IMG_2901_1774491787471.png` (3.8 MiB)
- `attached_assets/IMG_2905_1774533442697.png` (2.9 MiB)
- `attached_assets/IMG_2906_1774533442697.png` (2.9 MiB)
- `attached_assets/IMG_2945_1774566338633.png` (2.1 MiB)
- `attached_assets/IMG_2966_1774642421371.png` (1.3 MiB)
- `attached_assets/IMG_2995_1774711153949.png` (2.2 MiB)
- `attached_assets/IMG_3009_1774798440170.png` (1.8 MiB)
- `attached_assets/IMG_3086_1775060052896.png` (174.0 KiB)
- `attached_assets/IMG_3100_1775160316669.png` (1.7 MiB)
- `attached_assets/IMG_3832_1776886841954.png` (1.0 MiB)
- `attached_assets/IMG_3835_1776901546226.png` (84.8 KiB)
- `attached_assets/IMG_3837_1776919129930.png` (1.4 MiB)
- `attached_assets/IMG_3837_1776919186751.png` (1.4 MiB)
- `attached_assets/IMG_3837_1776919256157.png` (1.4 MiB)
- `attached_assets/IMG_3840_1776948285622.png` (1.8 MiB)
- `attached_assets/IMG_3841_1776955895893.png` (264.7 KiB)
- `attached_assets/IMG_4234_1777760404667.jpeg` (332.1 KiB)
- `attached_assets/IMG_4234_1777807375036.jpeg` (332.1 KiB)
- `attached_assets/IMG_5152_1781222655438.jpeg` (187.9 KiB)
- `attached_assets/IMG_5189_1781301250208.png` (3.0 MiB)
- `attached_assets/IMG_5318_1781700983351.png` (2.3 MiB)
- `attached_assets/IMG_5321_1781705765315.png` (2.1 MiB)
- `attached_assets/IMG_5322_1781707837903.png` (8.4 MiB)
- `attached_assets/IMG_5324_1781708897207.png` (8.4 MiB)
- `attached_assets/IMG_5325_1781709803135.png` (7.6 MiB)
- `attached_assets/IMG_5346_1781719826455.png` (7.6 MiB)
- `attached_assets/IMG_5384_1781907068472.jpeg` (169.9 KiB)
- `attached_assets/IMG_5408_1781968866908.jpeg` (219.9 KiB)
- `attached_assets/IMG_5616_1783553258029.jpeg` (410.2 KiB)
- `attached_assets/IMG_5616_1783553548054.jpeg` (410.2 KiB)
- `attached_assets/IMG_5777_1783281650360.jpeg` (183.8 KiB)
- `attached_assets/IMG_5830_1783356163538.jpeg` (60.6 KiB)
- `attached_assets/IMG_5843_1783395698901.png` (1.0 MiB)
- `attached_assets/IMG_5845_1783401168447.jpeg` (211.6 KiB)
- `attached_assets/IMG_5886_1783463548716.jpeg` (64.8 KiB)
- `attached_assets/IMG_5988_1783615815550.jpeg` (112.8 KiB)
- `attached_assets/IMG_5989_1783616981582.png` (2.3 MiB)
- `attached_assets/IMG_6027_1783639233620.jpeg` (180.2 KiB)
- `attached_assets/IMG_6054_1772082997464.jpeg` (675.0 KiB)
- `attached_assets/IMG_6088_1783823337434.jpeg` (348.9 KiB)
- `attached_assets/IMG_6160_1784136660895.jpeg` (384.6 KiB)
- `attached_assets/IMG_6163_1784152610047.jpeg` (55.8 KiB)
- `attached_assets/IMG_6361_1773698062274.png` (71.7 KiB)
- `attached_assets/IMG_6459_1774673194843.jpeg` (1.1 MiB)
- `attached_assets/IMG_6459_1774821902996.jpeg` (1.1 MiB)
- `attached_assets/IMG_6459_1774822089433.jpeg` (794.8 KiB)
- `attached_assets/IMG_6868_1783469036165.png` (5.2 MiB)
- `attached_assets/IMG_6880_1783636894557.png` (6.2 MiB)
- `attached_assets/Photoroom_20260314_91245_PM_1773585803512.png` (874.8 KiB)
- `attached_assets/Photoroom_20260314_91324_PM_1773585803512.png` (900.2 KiB)
- `attached_assets/Photoroom_20260314_91408_PM_1773585803512.png` (986.2 KiB)
- `attached_assets/Photoroom_20260316_113835_AM_1773679127298.png` (793.4 KiB)
- `attached_assets/Photoroom_20260316_113835_AM_1773681536632.png` (793.4 KiB)
- `attached_assets/Photoroom_20260316_11414_PM_1773684880684.png` (861.5 KiB)
- `attached_assets/Photoroom_20260316_11414_PM_1773684928081.png` (861.5 KiB)
- `attached_assets/Photoroom_20260316_11414_PM_1773685125690.png` (861.5 KiB)
- `attached_assets/Photoroom_20260316_115858_AM_1773680628748.png` (1.3 MiB)
- `attached_assets/Photoroom_20260316_123150_PM_1773682337835.png` (817.2 KiB)
- `attached_assets/Photoroom_20260316_123150_PM_1773685834420.png` (817.2 KiB)
- `attached_assets/Photoroom_20260316_14518_PM_1773686742791.png` (869.9 KiB)
- `attached_assets/Photoroom_20260316_14913_PM_1773686987595.png` (729.4 KiB)
- `attached_assets/Photoroom_20260316_22943_PM_1773689397710.png` (1.4 MiB)
- `attached_assets/Photoroom_20260316_25401_PM_1773690868885.png` (1.6 MiB)
- `attached_assets/Photoroom_20260316_31456_PM_1773692146191.png` (1.6 MiB)
- `attached_assets/Photoroom_20260316_31456_PM_1774386477740.png` (1.6 MiB)
- `attached_assets/Photoroom_20260316_32650_PM_1773692835383.png` (1.5 MiB)
- `attached_assets/Photoroom_20260316_32650_PM_1774386477740.png` (1.5 MiB)
- `attached_assets/Photoroom_20260316_33618_PM_1773693412573.png` (1.5 MiB)
- `attached_assets/Photoroom_20260316_33618_PM_1774386477740.png` (1.5 MiB)
- `attached_assets/Photoroom_20260316_35608_PM_1773694675193.png` (2.5 MiB)
- `attached_assets/Photoroom_20260316_35608_PM_1774386477740.png` (2.5 MiB)
- `attached_assets/Photoroom_20260316_81653_PM_1773710267368.png` (2.1 MiB)
- `attached_assets/Photoroom_20260323_111343_PM_1774385779726.png` (3.4 MiB)
- `attached_assets/Photoroom_20260324_41736_PM_1774387278351.png` (3.8 MiB)
- `attached_assets/Photoroom_20260330_90703_AM_1774879776264.png` (2.6 MiB)
- `attached_assets/Photoroom_20260330_90732_AM_1774879776264.png` (1.5 MiB)
- `attached_assets/Photoroom_20260331_55839_PM_1774997941486.png` (2.5 MiB)
- `attached_assets/Photoroom_20260410_83311_PM_1775871223547.png` (4.0 MiB)
- `attached_assets/Photoroom_20260422_14619_PM_1776883671627.png` (2.9 MiB)
- `attached_assets/Photoroom_20260422_24309_PM_1776887015425.png` (1.6 MiB)
- `attached_assets/Photoroom_20260502_115639_PM_1777784698006.png` (1.5 MiB)
- `attached_assets/Photoroom_20260502_115749_PM_1777784698006.png` (1.4 MiB)
- `attached_assets/Photoroom_20260502_115824_PM_1777784698006.png` (1.3 MiB)
- `attached_assets/Photoroom_20260502_115949_PM_1777784698006.png` (1.3 MiB)
- `attached_assets/Photoroom_20260502_60733_PM_1777763279694.png` (1.5 MiB)
- `attached_assets/Photoroom_20260502_61721_PM_1777763868131.png` (1.7 MiB)
- `attached_assets/Photoroom_20260502_71053_PM_1777767098824.png` (1.4 MiB)
- `attached_assets/Photoroom_20260502_71747_PM_1777767506358.png` (1.5 MiB)
- `attached_assets/Photoroom_20260502_93621_PM_1777775797733.png` (1.4 MiB)
- `attached_assets/Photoroom_20260503_120122_AM_1777784698006.png` (1.4 MiB)
- `attached_assets/Photoroom_20260503_120218_AM_1777784698006.png` (1.3 MiB)
- `attached_assets/Photoroom_20260503_120311_AM_1777784698006.png` (1.4 MiB)
- `attached_assets/Photoroom_20260503_50631_AM_1777802809096.png` (1.5 MiB)
- `attached_assets/Photoroom_20260611_153942_1781210877737.png` (1.9 MiB)
- `attached_assets/Photoroom_20260612_71032_AM_1781266768890.png` (776.6 KiB)
- `attached_assets/Photoroom_20260612_71032_AM_1782174446613.png` (776.6 KiB)
- `attached_assets/Photoroom_20260616_95112_PM_1781664700243.png` (548.4 KiB)
- `attached_assets/Photoroom_20260619_102350_PM_1781958712787.png` (1.7 MiB)
- `attached_assets/Photoroom_20260619_102423_PM_1781958712787.png` (1.8 MiB)
- `attached_assets/Photoroom_20260619_64226_PM_1781912579832.png` (2.7 MiB)
- `attached_assets/Photoroom_20260620_72658_AM_1781958712787.png` (1.6 MiB)
- `attached_assets/Photoroom_20260620_73016_AM_1781958712787.png` (1.9 MiB)
- `attached_assets/Photoroom_20260627_105408_PM_1782618878541.png` (3.2 MiB)
- `attached_assets/Photoroom_20260627_80228_PM_1782609630018.png` (169.2 KiB)
- `attached_assets/Photoroom_20260627_80324_PM_1782609630018.png` (310.5 KiB)
- `attached_assets/Photoroom_20260627_80436_PM_1782609630018.png` (131.8 KiB)
- `attached_assets/Photoroom_20260627_80657_PM_1782609630018.png` (200.9 KiB)
- `attached_assets/Photoroom_20260627_80751_PM_1782609630018.png` (237.7 KiB)
- `attached_assets/Photoroom_20260627_80926_PM_1782609630018.png` (200.0 KiB)
- `attached_assets/Photoroom_20260627_81107_PM_1782609630018.png` (230.7 KiB)
- `attached_assets/Photoroom_20260627_81225_PM_1782609630018.png` (183.5 KiB)
- `attached_assets/Photoroom_20260627_81324_PM_1782609630018.png` (144.4 KiB)
- `attached_assets/Photoroom_20260627_81404_PM_1782609630018.png` (383.5 KiB)
- `attached_assets/Photoroom_20260627_85235_PM_1782612638904.png` (1.1 MiB)
- `attached_assets/Photoroom_20260627_85235_PM_1782646273333.png` (1.1 MiB)
- `attached_assets/Photoroom_20260627_85321_PM_1782611950574.png` (1.4 MiB)
- `attached_assets/Photoroom_20260627_85321_PM_1782612036277.png` (1.4 MiB)
- `attached_assets/Photoroom_20260627_90020_PM_1782612036277.png` (1.1 MiB)
- `attached_assets/Photoroom_20260627_90501_PM_1782612324470.png` (2.0 MiB)
- `attached_assets/Photoroom_20260628_85836_PM_1782698330725.png` (1.7 MiB)
- `attached_assets/Photoroom_20260629_102055_PM_1782789946363.png` (2.9 MiB)
- `attached_assets/Photoroom_20260629_102138_PM_1782789946363.png` (2.9 MiB)
- `attached_assets/Photoroom_20260630_11339_AM_1782800031071.png` (736.3 KiB)
- `attached_assets/Photoroom_20260702_82212_PM_1783041767483.png` (879.2 KiB)
- `attached_assets/Photoroom_20260705_105636_PM_1783310210932.png` (1.5 MiB)
- `attached_assets/Photoroom_20260705_105636_PM_1783310645607.png` (1.5 MiB)
- `attached_assets/Photoroom_20260705_110030_PM_1783310446388.png` (2.9 MiB)
- `attached_assets/Photoroom_20260705_110030_PM_1783310645607.png` (2.9 MiB)
- `attached_assets/Photoroom_20260705_24702_PM_1783280910219.png` (1.1 MiB)
- `attached_assets/Photoroom_20260706_94656_PM_1783392699281.png` (1.0 MiB)
- `attached_assets/Photoroom_20260706_95641_PM_1783393037658.png` (1.3 MiB)
- `attached_assets/Photoroom_20260707_11349_PM_1783457062042.png` (247.9 KiB)
- `attached_assets/Photoroom_20260707_11428_PM_1783457062042.png` (343.6 KiB)
- `attached_assets/Photoroom_20260707_11506_PM_1783457062042.png` (373.2 KiB)
- `attached_assets/Photoroom_20260707_11559_PM_1783457542959.png` (372.2 KiB)
- `attached_assets/Photoroom_20260707_11649_PM_1783457542959.png` (372.3 KiB)
- `attached_assets/Photoroom_20260707_11800_PM_1783457542959.png` (370.9 KiB)
- `attached_assets/Photoroom_20260707_20149_PM_1783460456415.png` (8.3 MiB)
- `attached_assets/Photoroom_20260707_55240_PM_1783466979177.png` (1.9 MiB)
- `attached_assets/Photoroom_20260707_55332_PM_1783466979177.png` (797.3 KiB)
- `attached_assets/Photoroom_20260707_55415_PM_1783466979177.png` (804.4 KiB)
- `attached_assets/Photoroom_20260707_55458_PM_1783466979177.png` (780.0 KiB)
- `attached_assets/Photoroom_20260707_73008_PM_1783471168366.png` (1.9 MiB)
- `attached_assets/Photoroom_20260707_73215_PM_1783471071874.png` (207.6 KiB)
- `attached_assets/Photoroom_20260707_73622_PM_1783471071874.png` (371.1 KiB)
- `attached_assets/Photoroom_20260707_73659_PM_1783471071874.png` (300.8 KiB)
- `attached_assets/Photoroom_20260707_75952_PM_1783472510093.png` (1.1 MiB)
- `attached_assets/Photoroom_20260707_80012_PM_1783472562776.png` (1.7 MiB)
- `attached_assets/Photoroom_20260707_84137_PM_1783474998953.png` (3.3 MiB)
- `attached_assets/Photoroom_20260707_84249_PM_1783474998953.png` (504.5 KiB)
- `attached_assets/Photoroom_20260708_100323_PM_1783566367603.png` (2.2 MiB)
- `attached_assets/Photoroom_20260708_100657_PM_1783566697221.png` (780.5 KiB)
- `attached_assets/Photoroom_20260708_100733_PM_1783566697221.png` (796.8 KiB)
- `attached_assets/Photoroom_20260708_100822_PM_1783566697221.png` (811.2 KiB)
- `attached_assets/Photoroom_20260708_101327_AM_1783523780337.png` (2.5 MiB)
- `attached_assets/Photoroom_20260708_101327_AM_1783524265850.png` (2.5 MiB)
- `attached_assets/Photoroom_20260708_101327_AM_1783525175807.png` (2.5 MiB)
- `attached_assets/Photoroom_20260708_101400_AM_1783523780337.png` (1.2 MiB)
- `attached_assets/Photoroom_20260708_101400_AM_1783524265850.png` (1.2 MiB)
- `attached_assets/Photoroom_20260708_101400_AM_1783525175807.png` (1.2 MiB)
- `attached_assets/Photoroom_20260708_101432_AM_1783523780337.png` (1.2 MiB)
- `attached_assets/Photoroom_20260708_101432_AM_1783524265850.png` (1.2 MiB)
- `attached_assets/Photoroom_20260708_101432_AM_1783525175807.png` (1.2 MiB)
- `attached_assets/Photoroom_20260708_102248_AM_1783524265850.png` (915.7 KiB)
- `attached_assets/Photoroom_20260708_102248_AM_1783525175807.png` (915.7 KiB)
- `attached_assets/Photoroom_20260709_101357_AM_1783610567237.png` (1.4 MiB)
- `attached_assets/Photoroom_20260709_23343_PM_1783625763829.png` (682.8 KiB)
- `attached_assets/Photoroom_20260709_23958_PM_1783626016795.png` (1.9 MiB)
- `attached_assets/Photoroom_20260709_23958_PM_1783626130265.png` (1.9 MiB)
- `attached_assets/Photoroom_20260709_53434_PM_1783636894557.png` (1.9 MiB)
- `attached_assets/Photoroom_20260711_52200_PM_1783809194294.png` (2.2 MiB)
- `attached_assets/Photoroom_20260714_43330_PM_1784066809027.png` (2.1 MiB)
- `attached_assets/Photoroom_20260714_43330_PM_1784068203758.png` (2.1 MiB)
- `attached_assets/admin_icon_rewards.png` (1.7 MiB)
- `attached_assets/admin_icon_welcome.png` (1.3 MiB)
- `attached_assets/bg_desert_td.png` (2.1 MiB)
- `attached_assets/bg_desktop_backdrop.webp` (128.9 KiB)
- `attached_assets/bg_enchanted_grove_td.png` (2.1 MiB)
- `attached_assets/bg_fishing_shack.webp` (128.9 KiB)
- `attached_assets/bg_haunted_woods_map.png` (1.9 MiB)
- `attached_assets/bg_haunted_woods_map.webp` (203.3 KiB)
- `attached_assets/bg_haunted_woods_td.png` (1.8 MiB)
- `attached_assets/bg_island_td.png` (2.0 MiB)
- `attached_assets/bg_market_cellar.png` (1.7 MiB)
- `attached_assets/bg_mire_bazaar.png` (1.6 MiB)
- `attached_assets/bg_mosswood_lodge.png` (1.4 MiB)
- `attached_assets/bg_mossy_cauldron.png` (1.4 MiB)
- `attached_assets/bg_murk_cave.png` (1.2 MiB)
- `attached_assets/bg_myst_pond.png` (1.3 MiB)
- `attached_assets/bg_shop_mystical.webp` (154.0 KiB)
- `attached_assets/bg_sky_realm_td.png` (1.9 MiB)
- `attached_assets/bg_snowy_mountain_td.png` (2.1 MiB)
- `attached_assets/bg_soggy_hook_v1.png` (2.6 MiB)
- `attached_assets/bg_soul_pond_v2.png` (2.5 MiB)
- `attached_assets/bg_soul_pond_v2.webp` (206.7 KiB)
- `attached_assets/bg_swamp_map.webp` (346.5 KiB)
- `attached_assets/bg_swamp_v5.png` (1.8 MiB)
- `attached_assets/bg_thicket.png` (1.5 MiB)
- `attached_assets/bg_tome_toad.png` (2.4 MiB)
- `attached_assets/bg_welcome_center.jpeg` (7.0 MiB)
- `attached_assets/bg_well_of_fortune.png` (1.8 MiB)
- `attached_assets/bg_willowmere_cottage.png` (1.3 MiB)
- `attached_assets/coin_pack_100.png` (1.4 MiB)
- `attached_assets/coin_pack_1000.png` (1.6 MiB)
- `attached_assets/coin_pack_10000.png` (1.9 MiB)
- `attached_assets/coin_pack_2500.png` (1.9 MiB)
- `attached_assets/coin_pack_500.png` (1.4 MiB)
- `attached_assets/coin_pack_5000.png` (1.9 MiB)
- `attached_assets/fishing_bobber.png` (448.3 KiB)
- `attached_assets/food_bayou_jambalaya.png` (1.2 MiB)
- `attached_assets/food_bayou_moonshine_elixir.png` (1014.1 KiB)
- `attached_assets/food_cypress_dew_fizz.png` (557.6 KiB)
- `attached_assets/food_firefly_honey_tart.png` (962.0 KiB)
- `attached_assets/food_gator_poboy.png` (970.8 KiB)
- `attached_assets/food_moss_smoked_catfish.png` (842.2 KiB)
- `attached_assets/food_murky_mushroom_gumbo.png` (982.9 KiB)
- `attached_assets/food_spanish_moss_pudding.png` (908.6 KiB)
- `attached_assets/food_swamp_witchs_brew.png` (827.2 KiB)
- `attached_assets/food_swampfire_crawfish_boil.png` (1.6 MiB)
- `attached_assets/frame_profile.png` (1.6 MiB)
- `attached_assets/frame_profile_thin.png` (1.5 MiB)
- `attached_assets/friends_icon.png` (1.1 MiB)
- `attached_assets/generated_images/gift_bayou_moon_crystal_nobg.png` (1.2 MiB)
- `attached_assets/generated_images/gift_gator_tooth_charm_nobg.png` (1.2 MiB)
- `attached_assets/generated_images/gift_icon_forest_nobg.png` (1.3 MiB)
- `attached_assets/generated_images/gift_murky_marsh_pearl_nobg.png` (1.6 MiB)
- `attached_assets/generated_images/gift_swamp_wisp_lantern_nobg.png` (1.3 MiB)
- `attached_assets/generated_images/gift_voodoo_moss_locket_nobg.png` (1.4 MiB)
- `attached_assets/generated_images/gift_witchs_cursed_bloom_nobg.png` (1.3 MiB)
- `attached_assets/generated_images/house_cottage.png` (1.1 MiB)
- `attached_assets/generated_images/house_mushroom.png` (994.1 KiB)
- `attached_assets/generated_images/house_ruined_tower.png` (1.1 MiB)
- `attached_assets/generated_images/house_treehouse.png` (1.1 MiB)
- `attached_assets/generated_images/house_wizard_tower.png` (1.1 MiB)
- `attached_assets/generated_images/icon_gift_treasure.png` (1.0 MiB)
- `attached_assets/generated_images/joystick_thumb_v2.png` (1.1 MiB)
- `attached_assets/generated_images/keepers_shop_building.png` (1.7 MiB)
- `attached_assets/generated_images/keepers_shop_v2.png` (1.6 MiB)
- `attached_assets/generated_images/keepers_shop_v3.png` (1.6 MiB)
- `attached_assets/generated_images/keepers_shop_v4.png` (1.7 MiB)
- `attached_assets/generated_images/keepers_shop_v5.png` (1.6 MiB)
- `attached_assets/generated_images/keepers_shop_v6.png` (1.5 MiB)
- `attached_assets/generated_images/keepers_shop_v7.png` (1.5 MiB)
- `attached_assets/generated_images/keepers_shop_v8.png` (1.8 MiB)
- `attached_assets/generated_images/keepers_shop_v9.png` (1.8 MiB)
- `attached_assets/generated_images/nav_icon_badges_nobg.png` (752.3 KiB)
- `attached_assets/generated_images/nav_icon_home_nobg.png` (853.5 KiB)
- `attached_assets/generated_images/nav_icon_market_nobg.png` (1.1 MiB)
- `attached_assets/generated_images/nav_icon_market_v2.png` (1.1 MiB)
- `attached_assets/generated_images/nav_icon_pethouse.png` (1.0 MiB)
- `attached_assets/generated_images/nav_icon_pethouse_nobg.png` (1.0 MiB)
- `attached_assets/generated_images/nav_icon_pets_nobg.png` (1.3 MiB)
- `attached_assets/generated_images/nav_icon_pvp_nobg.png` (1.0 MiB)
- `attached_assets/generated_images/nav_icon_quest.png` (907.8 KiB)
- `attached_assets/generated_images/nav_icon_quest_nobg.png` (1.3 MiB)
- `attached_assets/generated_images/nav_icon_quest_v2.png` (1.5 MiB)
- `attached_assets/generated_images/nav_icon_quest_v3.png` (1.2 MiB)
- `attached_assets/generated_images/pet_world_bg.png` (1.9 MiB)
- `attached_assets/generated_images/pvp_arena_forest_bg.png` (1.4 MiB)
- `attached_assets/hub_leaderboard_banner.png` (1.4 MiB)
- `attached_assets/hub_legend_banner.png` (1.2 MiB)
- `attached_assets/hub_mascot.png` (631.1 KiB)
- `attached_assets/icon_attack_sword.png` (1.3 MiB)
- `attached_assets/icon_badges.svg` (2.5 KiB)
- `attached_assets/icon_cauldrons_creep.webp` (73.8 KiB)
- `attached_assets/icon_coin.webp` (182.4 KiB)
- `attached_assets/icon_fishbowl_nobg.png` (1.4 MiB)
- `attached_assets/icon_forest_home.png` (1.6 MiB)
- `attached_assets/icon_haunted_pet_shop.webp` (67.9 KiB)
- `attached_assets/icon_haunted_pond.webp` (67.5 KiB)
- `attached_assets/icon_mosswood_lodge.png` (1.2 MiB)
- `attached_assets/icon_spectral_grove.webp` (66.0 KiB)
- `attached_assets/icon_tome_toad_orig.png` (861.5 KiB)
- `attached_assets/icon_tome_toad_v2.png` (1.7 MiB)
- `attached_assets/icon_world_chat_new.png` (4.0 MiB)
- `attached_assets/image_1782240298358.jpg` (3.8 MiB)
- `attached_assets/inside_room_bg.png` (181.8 KiB)
- `attached_assets/item_moonpetal (copy).png` (1.3 MiB)
- `attached_assets/lava_fortress_nobg.png` (1.0 MiB)
- `attached_assets/lava_ground.webp` (120.1 KiB)
- `attached_assets/lava_ground_strip.webp` (69.8 KiB)
- `attached_assets/parchment_bg.png` (1.2 MiB)
- `attached_assets/pethouse_floor.png` (1.8 MiB)
- `attached_assets/pond_overlay.png` (1.6 MiB)
- `attached_assets/profile_frame.png` (593.2 KiB)
- `attached_assets/pw_midforest_layer.png` (905.2 KiB)
- `attached_assets/pw_sky_layer.png` (1.2 MiB)
- `attached_assets/scroll_open.png` (1.4 MiB)
- `attached_assets/scroll_open_new.png` (1.3 MiB)
- `attached_assets/scroll_quest_log.png` (1.4 MiB)
- `attached_assets/scroll_rolled.png` (1.3 MiB)
- `attached_assets/world_swamp_v3.png` (1.5 MiB)

### Temporary/Staging (20)

- `attached_assets/Pasted--Required-App-Fixes-Feature-Updates-Please-implement-th_1772089075045.txt` (3.2 KiB)
- `attached_assets/Pasted-Add-a-new-explore-location-to-the-Elysian-Bayou-world-c_1784693531786.txt` (4.9 KiB)
- `attached_assets/Pasted-Build-a-simple-reusable-fishing-minigame-for-my-game-IM_1774120901465.txt` (4.9 KiB)
- `attached_assets/Pasted-I-compared-screenshots-and-this-does-not-look-like-only_1775422124746.txt` (2.2 KiB)
- `attached_assets/Pasted-I-need-you-to-add-a-new-ParaPets-mini-game-to-my-existi_1783460461021.txt` (2.4 KiB)
- `attached_assets/Pasted-I-need-you-to-add-the-first-uploaded-icon-to-the-Volcan_1783461434150.txt` (2.4 KiB)
- `attached_assets/Pasted-I-need-you-to-add-the-first-uploaded-icon-to-the-Volcan_1783461459565.txt` (2.4 KiB)
- `attached_assets/Pasted-I-need-you-to-investigate-and-fully-fix-an-asset-backgr_1775417058567.txt` (3.1 KiB)
- `attached_assets/Pasted-I-want-to-change-my-current-slash-battle-system-so-it-f_1773956972221.txt` (2.1 KiB)
- `attached_assets/Pasted-I-want-to-change-my-current-slash-battle-system-so-it-f_1773957026824.txt` (2.5 KiB)
- `attached_assets/Pasted-Please-rebalance-my-world-battle-system-using-this-exac_1776311737878.txt` (2.0 KiB)
- `attached_assets/Pasted-The-fishing-is-getting-better-but-seems-a-bit-glitchy-I_1773978113076.txt` (4.4 KiB)
- `attached_assets/Pasted-Update-my-fishing-system-to-use-a-real-time-tension-ree_1773950993179.txt` (2.2 KiB)
- `attached_assets/Pasted-Updates-and-fixes-Admin-updates-I-want-to-make-an-admin_1772254132043.txt` (4.0 KiB)
- `attached_assets/ScreenRecording_03-30-2026_11-49-44_AM_1_1774889437100.mov` (12.9 MiB)
- `attached_assets/screenshots/04380d3b-f3f5-4699-a9be-ec71209f7dd3-00-3d1yitevk0i7y_riker_replit_dev_mockup_ads_ad1-grove.png` (113.5 KiB)
- `attached_assets/screenshots/04380d3b-f3f5-4699-a9be-ec71209f7dd3-00-3d1yitevk0i7y_riker_replit_dev_mockup_ads_ad2-volcanic.png` (116.9 KiB)
- `attached_assets/screenshots/04380d3b-f3f5-4699-a9be-ec71209f7dd3-00-3d1yitevk0i7y_riker_replit_dev_mockup_ads_ad3-swamp.png` (191.4 KiB)
- `attached_assets/uploads/2988F05E-8A00-48E6-AF6D-9DD78A6C33B1.png` (1.4 MiB)
- `attached_assets/uploads/ElysianClearingBackground.jpeg` (2.9 MiB)

### Possible duplicates (96 confirmed byte-identical groups)

These are confirmed byte-for-byte duplicates, which is stronger than filename similarity. Similar-looking but non-identical artwork was not automatically asserted as duplicate.

- **Group 1** (19.4 MiB each): `attached_assets/AAC47494-B2BD-4B73-B01A-769E2C589AD7_1783460456416.png`, `attached_assets/AAC47494-B2BD-4B73-B01A-769E2C589AD7_1783461445112.png`
- **Group 2** (16.5 MiB each): `attached_assets/9AD71EA4-A07D-4D8F-A82B-B2D001890360_1774818275441.png`, `attached_assets/bg_swamp_critters.png`
- **Group 3** (8.3 MiB each): `attached_assets/Photoroom_20260707_20149_PM_1783460456415.png`, `attached_assets/Photoroom_20260707_20149_PM_1783461445112.png`
- **Group 4** (7.0 MiB each): `attached_assets/D651F5A0-5A0C-42EE-9EA0-EF743D851787_1774795658329.jpeg`, `attached_assets/bg_welcome_center.jpeg`
- **Group 5** (4.6 MiB each): `attached_assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783809194294.png`, `attached_assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png`
- **Group 6** (2.9 MiB each): `attached_assets/Photoroom_20260705_110030_PM_1783310446388.png`, `attached_assets/Photoroom_20260705_110030_PM_1783310645607.png`, `attached_assets/Photoroom_20260705_110030_PM_1783310667789.png`
- **Group 7** (4.0 MiB each): `attached_assets/Photoroom_20260410_83311_PM_1775871223547.png`, `attached_assets/icon_world_chat_new.png`
- **Group 8** (2.5 MiB each): `attached_assets/Photoroom_20260316_35608_PM_1773694675193.png`, `attached_assets/Photoroom_20260316_35608_PM_1774386477740.png`, `attached_assets/icon_fishing_shack.png`
- **Group 9** (2.5 MiB each): `attached_assets/Photoroom_20260708_101327_AM_1783523780337.png`, `attached_assets/Photoroom_20260708_101327_AM_1783524265850.png`, `attached_assets/Photoroom_20260708_101327_AM_1783525175807.png`
- **Group 10** (1.6 MiB each): `attached_assets/IMG_2854_1774401747296.png`, `attached_assets/IMG_2854_1774402855464.png`, `attached_assets/IMG_2854_1774470942301.png`, `attached_assets/bg_bayous_heart.png`
- **Group 11** (2.1 MiB each): `attached_assets/Photoroom_20260714_43330_PM_1784066809027.png`, `attached_assets/Photoroom_20260714_43330_PM_1784068203758.png`, `attached_assets/Photoroom_20260714_43330_PM_1784076584992.png`
- **Group 12** (3.0 MiB each): `attached_assets/7D6E04B4-CD26-478A-9D79-DA7F5C466D91_1773675435607.png`, `attached_assets/7D6E04B4-CD26-478A-9D79-DA7F5C466D91_1773675767965.png`
- **Group 13** (2.9 MiB each): `attached_assets/Photoroom_20260629_102138_PM_1782789946363.png`, `attached_assets/Photoroom_20260629_102138_PM_1782789980383.png`
- **Group 14** (2.9 MiB each): `attached_assets/Photoroom_20260629_102055_PM_1782789946363.png`, `attached_assets/Photoroom_20260629_102055_PM_1782789968022.png`
- **Group 15** (2.7 MiB each): `attached_assets/Photoroom_20260619_64226_PM_1781912579832.png`, `attached_assets/Photoroom_20260619_64226_PM_1781913135212.png`
- **Group 16** (1.8 MiB each): `attached_assets/AE6B62BB-AAF5-4C26-A5C8-77F4673DAF8C_1774902093524.png`, `attached_assets/AE6B62BB-AAF5-4C26-A5C8-77F4673DAF8C_1774902802594.png`, `attached_assets/AE6B62BB-AAF5-4C26-A5C8-77F4673DAF8C_1774904593039.png`
- **Group 17** (2.6 MiB each): `attached_assets/E88CFEB0-99C9-4B2B-A6E0-80B22F411B2A_1774581172721.png`, `attached_assets/bg_soggy_hook_v1.png`
- **Group 18** (2.5 MiB each): `attached_assets/2F36B2AF-8B72-447E-B0C6-7665A510C7AD_1781967212205.png`, `attached_assets/bg_soul_pond_v2.png`
- **Group 19** (2.5 MiB each): `attached_assets/Photoroom_20260331_55839_PM_1774997941486.png`, `attached_assets/generated_images/gift_icon_forest.png`
- **Group 20** (2.4 MiB each): `attached_assets/IMG_2545_1773748637153.png`, `attached_assets/bg_tome_toad.png`
- **Group 21** (1.6 MiB each): `attached_assets/Photoroom_20260316_31456_PM_1773692146191.png`, `attached_assets/Photoroom_20260316_31456_PM_1774386477740.png`, `attached_assets/icon_mire_bazaar.png`
- **Group 22** (2.4 MiB each): `attached_assets/624E9C6A-C19B-4F23-B51C-C1DBDCED8073_1781971277636.png`, `attached_assets/bg_haunted_woods_v2.png`
- **Group 23** (2.4 MiB each): `attached_assets/ADC7176E-7F09-4D44-90E5-13A4ADF22BCE_1781967212205.png`, `attached_assets/bg_cauldrons_creep_v2.png`
- **Group 24** (2.4 MiB each): `attached_assets/86B445BC-A94D-4DBB-9341-4FA870C335C1_1781967212205.png`, `attached_assets/bg_haunted_menagerie_v2.png`
- **Group 25** (1.5 MiB each): `attached_assets/802D8A64-1219-44FB-9236-BA5264CE7066_1777757807875.jpeg`, `attached_assets/802D8A64-1219-44FB-9236-BA5264CE7066_1777807375036.jpeg`, `attached_assets/bg_swamp_map_v6.jpeg`
- **Group 26** (2.2 MiB each): `attached_assets/Photoroom_20260708_100323_PM_1783566367603.png`, `attached_assets/Photoroom_20260708_100323_PM_1783566697221.png`
- **Group 27** (2.2 MiB each): `attached_assets/310B7DC6-36B8-425F-91D3-610286777071_1781967212205.png`, `attached_assets/bg_spectral_grove.png`
- **Group 28** (1.5 MiB each): `attached_assets/Photoroom_20260705_105636_PM_1783310210932.png`, `attached_assets/Photoroom_20260705_105636_PM_1783310645607.png`, `attached_assets/Photoroom_20260705_105636_PM_1783310667789.png`
- **Group 29** (1.5 MiB each): `attached_assets/Photoroom_20260316_33618_PM_1773693412573.png`, `attached_assets/Photoroom_20260316_33618_PM_1774386477740.png`, `attached_assets/icon_swamp_critters.png`
- **Group 30** (1.5 MiB each): `attached_assets/Photoroom_20260316_32650_PM_1773692835383.png`, `attached_assets/Photoroom_20260316_32650_PM_1774386477740.png`, `attached_assets/icon_tome_toad.png`
- **Group 31** (2.2 MiB each): `attached_assets/Photoroom_20260711_52200_PM_1783809194294.png`, `attached_assets/Photoroom_20260711_52200_PM_1783810844517.png`
- **Group 32** (2.1 MiB each): `attached_assets/Photoroom_20260316_81653_PM_1773710267368.png`, `attached_assets/icon_murk_cave.png`
- **Group 33** (1.4 MiB each): `attached_assets/IMG_3837_1776919129930.png`, `attached_assets/IMG_3837_1776919186751.png`, `attached_assets/IMG_3837_1776919256157.png`
- **Group 34** (2.0 MiB each): `attached_assets/E3532706-8FDD-42D5-9F33-012954AB1DBB_1773749971489.png`, `attached_assets/bg_fishing_shack.png`
- **Group 35** (1.9 MiB each): `attached_assets/Photoroom_20260709_23958_PM_1783626016795.png`, `attached_assets/Photoroom_20260709_23958_PM_1783626130265.png`
- **Group 36** (1.9 MiB each): `attached_assets/Photoroom_20260620_73016_AM_1781958712787.png`, `attached_assets/icon_haunted_pet_shop.png`
- **Group 37** (1.8 MiB each): `attached_assets/Photoroom_20260619_102423_PM_1781958712787.png`, `attached_assets/icon_cauldrons_creep.png`
- **Group 38** (1.8 MiB each): `attached_assets/IMG_3009_1774798440170.png`, `attached_assets/bg_well_of_fortune.png`
- **Group 39** (1.7 MiB each): `attached_assets/6A646DC3-3D6D-4453-B8D6-E838E1A7055C_1784693527050.png`, `attached_assets/worlds/elysian-bayou/elysian-bayou-clearing/icon.png`
- **Group 40** (1.2 MiB each): `attached_assets/Photoroom_20260708_101432_AM_1783523780337.png`, `attached_assets/Photoroom_20260708_101432_AM_1783524265850.png`, `attached_assets/Photoroom_20260708_101432_AM_1783525175807.png`
- **Group 41** (1.2 MiB each): `attached_assets/Photoroom_20260708_101400_AM_1783523780337.png`, `attached_assets/Photoroom_20260708_101400_AM_1783524265850.png`, `attached_assets/Photoroom_20260708_101400_AM_1783525175807.png`
- **Group 42** (1.1 MiB each): `attached_assets/generated_images/nav_icon_market.png`, `attached_assets/generated_images/nav_icon_market_nobg.png`, `attached_assets/generated_images/nav_icon_market_v2.png`
- **Group 43** (1.7 MiB each): `attached_assets/Photoroom_20260619_102350_PM_1781958712787.png`, `attached_assets/icon_spectral_grove.png`
- **Group 44** (1.7 MiB each): `attached_assets/IMG_3100_1775160316669.png`, `attached_assets/bg_market_cellar.png`
- **Group 45** (861.5 KiB each): `attached_assets/Photoroom_20260316_11414_PM_1773684880684.png`, `attached_assets/Photoroom_20260316_11414_PM_1773684928081.png`, `attached_assets/Photoroom_20260316_11414_PM_1773685125690.png`, `attached_assets/icon_tome_toad_orig.png`
- **Group 46** (1.7 MiB each): `attached_assets/Photoroom_20260502_61721_PM_1777763868131.png`, `attached_assets/icon_pet_shop_volcanic.png`
- **Group 47** (1.6 MiB each): `attached_assets/IMG_2379_1773505022317.png`, `attached_assets/bg_mire_bazaar.png`
- **Group 48** (1.6 MiB each): `attached_assets/generated_images/npc_lava_hook_shopkeeper.png`, `attached_assets/npc_lava_hook_shopkeeper.png`
- **Group 49** (1.6 MiB each): `attached_assets/generated_images/gift_murky_marsh_pearl_nobg.png`, `attached_assets/gift_murky_marsh_pearl.png`
- **Group 50** (1.6 MiB each): `attached_assets/Photoroom_20260620_72658_AM_1781958712787.png`, `attached_assets/icon_haunted_pond.png`
- **Group 51** (1.5 MiB each): `attached_assets/Photoroom_20260503_50631_AM_1777802809096.png`, `attached_assets/icon_food_shop_swamp.png`
- **Group 52** (1.5 MiB each): `attached_assets/Photoroom_20260502_60733_PM_1777763279694.png`, `attached_assets/icon_fishing_shop_volcanic.png`
- **Group 53** (1.5 MiB each): `attached_assets/bg_central_market.png`, `attached_assets/generated_images/bg_central_market.png`
- **Group 54** (1.5 MiB each): `attached_assets/pw_ground_layer.png`, `attached_assets/pw_ground_preview.png`
- **Group 55** (1.4 MiB each): `attached_assets/Photoroom_20260627_85321_PM_1782611950574.png`, `attached_assets/Photoroom_20260627_85321_PM_1782612036277.png`
- **Group 56** (1.4 MiB each): `attached_assets/generated_images/gift_voodoo_moss_locket_nobg.png`, `attached_assets/gift_voodoo_moss_locket.png`
- **Group 57** (1.4 MiB each): `attached_assets/Photoroom_20260709_101357_AM_1783610567237.png`, `attached_assets/icon_coin.png`
- **Group 58** (1.3 MiB each): `attached_assets/generated_images/gift_witchs_cursed_bloom_nobg.png`, `attached_assets/gift_witchs_cursed_bloom.png`
- **Group 59** (1.3 MiB each): `attached_assets/bg_myst_pond.png`, `attached_assets/fishing_bg_portrait.png`
- **Group 60** (1.3 MiB each): `attached_assets/item_moonpetal (copy).png`, `attached_assets/item_moonpetal.png`
- **Group 61** (1.3 MiB each): `attached_assets/Photoroom_20260706_95641_PM_1783393037658.png`, `attached_assets/Photoroom_20260706_95641_PM_1783394294636.png`
- **Group 62** (1.3 MiB each): `attached_assets/sea_jellyfish.png`, `attached_assets/sea_seahorse.png`
- **Group 63** (1.3 MiB each): `attached_assets/generated_images/gift_swamp_wisp_lantern_nobg.png`, `attached_assets/gift_swamp_wisp_lantern.png`
- **Group 64** (1.2 MiB each): `attached_assets/generated_images/gift_bayou_moon_crystal_nobg.png`, `attached_assets/gift_bayou_moon_crystal.png`
- **Group 65** (1.2 MiB each): `attached_assets/generated_images/gift_gator_tooth_charm_nobg.png`, `attached_assets/gift_gator_tooth_charm.png`
- **Group 66** (1.1 MiB each): `attached_assets/Photoroom_20260705_24702_PM_1783280910219.png`, `attached_assets/logo_parapets.png`
- **Group 67** (776.6 KiB each): `attached_assets/Photoroom_20260612_71032_AM_1781266768890.png`, `attached_assets/Photoroom_20260612_71032_AM_1782174446613.png`, `attached_assets/icon_cooking_forge_volcanic.png`
- **Group 68** (1.1 MiB each): `attached_assets/generated_images/nav_icon_map.png`, `attached_assets/generated_images/nav_icon_map_nobg.png`
- **Group 69** (1.1 MiB each): `attached_assets/IMG_6459_1774673194843.jpeg`, `attached_assets/IMG_6459_1774821902996.jpeg`
- **Group 70** (1.1 MiB each): `attached_assets/Photoroom_20260627_85235_PM_1782612638904.png`, `attached_assets/Photoroom_20260627_85235_PM_1782646273333.png`
- **Group 71** (1.0 MiB each): `attached_assets/generated_images/nav_icon_pethouse.png`, `attached_assets/generated_images/nav_icon_pethouse_nobg.png`
- **Group 72** (1.0 MiB each): `attached_assets/icon_lava_fortress_volcanic.png`, `attached_assets/lava_fortress_nobg.png`
- **Group 73** (1.0 MiB each): `attached_assets/Photoroom_20260706_94656_PM_1783392699281.png`, `attached_assets/Photoroom_20260706_94656_PM_1783394294636.png`
- **Group 74** (1020.8 KiB each): `attached_assets/4E7A4774-0472-4384-8F79-FD00A26622D7_1773677388395.jpeg`, `attached_assets/4E7A4774-0472-4384-8F79-FD00A26622D7_1773694628042.jpeg`
- **Group 75** (964.5 KiB each): `attached_assets/D87F3084-04E2-4486-8E61-93E4BC32728F_1773675435607.jpeg`, `attached_assets/D87F3084-04E2-4486-8E61-93E4BC32728F_1773675767966.jpeg`
- **Group 76** (939.2 KiB each): `attached_assets/admin_pole.png`, `attached_assets/icon_fishing_pole.png`
- **Group 77** (915.7 KiB each): `attached_assets/Photoroom_20260708_102248_AM_1783524265850.png`, `attached_assets/Photoroom_20260708_102248_AM_1783525175807.png`
- **Group 78** (914.5 KiB each): `attached_assets/generated_images/icon_fishing_volcanic.png`, `attached_assets/icon_fishing_volcanic.png`
- **Group 79** (853.5 KiB each): `attached_assets/generated_images/nav_icon_home.png`, `attached_assets/generated_images/nav_icon_home_nobg.png`
- **Group 80** (817.2 KiB each): `attached_assets/Photoroom_20260316_123150_PM_1773682337835.png`, `attached_assets/Photoroom_20260316_123150_PM_1773685834420.png`
- **Group 81** (793.4 KiB each): `attached_assets/Photoroom_20260316_113835_AM_1773679127298.png`, `attached_assets/Photoroom_20260316_113835_AM_1773681536632.png`
- **Group 82** (676.6 KiB each): `attached_assets/Photoroom_20260705_103527_PM_1783308939570.png`, `attached_assets/Photoroom_20260705_103527_PM_1783426783499.png`
- **Group 83** (548.4 KiB each): `attached_assets/Photoroom_20260616_95112_PM_1781664700243.png`, `attached_assets/Photoroom_20260616_95112_PM_1781667768792.png`
- **Group 84** (441.7 KiB each): `attached_assets/D50DDF64-43C0-4497-A12A-BAEFD051D456_1784693527050.jpeg`, `attached_assets/worlds/elysian-bayou/elysian-bayou-clearing/background.jpg`
- **Group 85** (410.2 KiB each): `attached_assets/IMG_5616_1783553258029.jpeg`, `attached_assets/IMG_5616_1783553548054.jpeg`
- **Group 86** (373.2 KiB each): `attached_assets/Photoroom_20260707_11506_PM_1783457062042.png`, `attached_assets/Photoroom_20260707_11506_PM_1783458650009.png`
- **Group 87** (372.3 KiB each): `attached_assets/Photoroom_20260707_11649_PM_1783457542959.png`, `attached_assets/Photoroom_20260707_11649_PM_1783458650009.png`
- **Group 88** (372.2 KiB each): `attached_assets/Photoroom_20260707_11559_PM_1783457542959.png`, `attached_assets/Photoroom_20260707_11559_PM_1783458650009.png`
- **Group 89** (370.9 KiB each): `attached_assets/Photoroom_20260707_11800_PM_1783457542959.png`, `attached_assets/Photoroom_20260707_11800_PM_1783458650009.png`
- **Group 90** (343.6 KiB each): `attached_assets/Photoroom_20260707_11428_PM_1783457062042.png`, `attached_assets/Photoroom_20260707_11428_PM_1783458650009.png`
- **Group 91** (332.1 KiB each): `attached_assets/IMG_4234_1777760404667.jpeg`, `attached_assets/IMG_4234_1777807375036.jpeg`
- **Group 92** (181.8 KiB each): `attached_assets/IMG_2855_1774403746417.jpeg`, `attached_assets/IMG_2855_1774403903544.jpeg`, `attached_assets/inside_room_bg.png`
- **Group 93** (247.9 KiB each): `attached_assets/Photoroom_20260707_11349_PM_1783457062042.png`, `attached_assets/Photoroom_20260707_11349_PM_1783458650009.png`
- **Group 94** (130.9 KiB each): `attached_assets/IMG_2535_1773703722720.jpeg`, `attached_assets/IMG_2535_1773705636876.jpeg`, `attached_assets/IMG_2535_1773707033973.jpeg`
- **Group 95** (71.7 KiB each): `attached_assets/IMG_6361_1773698062274.png`, `attached_assets/icon_myst_pond_v2.png`
- **Group 96** (2.4 KiB each): `attached_assets/Pasted-I-need-you-to-add-the-first-uploaded-icon-to-the-Volcan_1783461434150.txt`, `attached_assets/Pasted-I-need-you-to-add-the-first-uploaded-icon-to-the-Volcan_1783461459565.txt`

## 5. Production/configuration references to `attached_assets/uploads/`

- **Confirmed:** no production-code or configuration reference was found. The only literal occurrences are policy/documentation text within `attached_assets/uploads/README.md` itself.

## 6. Duplicate filenames differing only by case

- **Confirmed:** none in the tracked path set.

## 7. Broken or missing local asset imports

- **Confirmed within scan limits:** no missing literal `@assets`, relative, or `/attached_assets` imports/references were found in production source. Type checking and the production build provide additional resolution checks.

## 8. Potential secrets, personal information, or production data

No secret values are reproduced. A stricter literal scan found **no confirmed embedded PostgreSQL URL, email address, bcrypt hash, private key, or credential-like quoted assignment** in the tracked materialized text. The following paths nevertheless handle, describe, or request sensitive values/data and therefore warrant review; identifiers and environment-variable reads are not themselves credentials.

| File(s) | Secret/data type | Finding status |
|---|---|---|
| `.agents/memory/MEMORY.md`, `MASTER_GAME_DOCUMENT.txt`, `docs/CODEBASE_MAP.md`, `docs/PURCHASE_MILESTONE_AUDIT.md`, `replit.md` | Railway/database URL names and production-data operational guidance | **Confirmed references; no literal URL found.** Documentation may expose operational details, not a credential value. |
| `drizzle.config.ts`, `server/db.ts`, `server/startup/backfills/runNonCriticalStartup.ts`, `server/stripeClient.ts` | Database connection URLs sourced from environment variables | **Confirmed code paths; no literal URL found.** Must retain as runtime configuration consumers. |
| `scripts/dump-railway-prod.ts`, `survey.cjs` | Production database access/export capability and potential production-data handling | **Confirmed capability; no embedded URL or exported rows found.** Restrict execution and review whether these utilities belong in the repository. |
| `server/stripeClient.ts` | Stripe secret/token handling | **Confirmed environment/runtime secret handling; no literal token found.** Must retain if the payment integration remains active. |
| `server/index.ts`, `server/routes.ts`, `server/routes/account.routes.ts`, `server/seedPvpBots.ts`, `server/seedSampleTemplates.ts` | Password or password-hash processing/seed logic | **Confirmed code/schema behavior; no literal bcrypt hash found.** Seed credentials require manual review even when generated or placeholder-only. |
| `MASTER_GAME_DOCUMENT.txt` | Descriptions of database URLs, authentication/password behavior, and player data | **Confirmed descriptive content; no literal credential or email found.** Review before public distribution. |
| LFS object `ziMQ9a1L` | Unknown 808.6 MiB content | **Uninspected/suspected risk.** The payload was unavailable; its opaque name and historical backup-related neighboring LFS rules require an authorized content/retention review. |
| Historical LFS rules for `parapets_export.sql`, `parapets_backup.zip`, `parapets_prod_backup.txt`, `parapets_prod_export.sql.gz` | Database exports/backups and likely production data | **Confirmed rules, absent current paths.** Current tracked files do not contain these exports, but Git/LFS history may; history was intentionally outside this audit. |

**Confirmed limitation:** this was a path, regex, and materialized-content audit, not entropy-based secret validation or a Git-history/LFS-object scan. If an authorized reviewer confirms a value is live, rotate it and follow incident procedures; deleting only the current-tree occurrence would be insufficient.

## 9. Recommendations

### Safe cleanup candidates
- After a separate, owner-approved change: stale exact LFS attribute entries whose paths are absent, provided history/restore workflows do not depend on them.
- Generated screenshots and the mockup sandbox are strong cleanup candidates **only after** confirming they are not acceptance evidence or active design artifacts.
- Pasted prompt text and staged upload files are strong candidates after provenance/usage review. None should be treated as safe merely because the literal-reference scan found nothing.

### Requires manual verification
- Every “apparently unreferenced” asset: check database rows, runtime-generated filenames, CMS/admin content, deployment volumes, and product/design ownership.
- Every duplicate group: select a canonical file and verify pixel/color/profile/metadata requirements and all database references before consolidation.
- `new_version.tsx`, `old_version.tsx`, `pvp_diff.patch`, the mockup sandbox, screenshots, screen recording, and opaque `ziMQ9a1L`.
- All pattern-flagged sensitive files; determine whether hits are examples/schema identifiers versus actual data, and rotate confirmed live secrets.

### Must retain
- Assets with confirmed production-code references until a tested replacement updates every consumer.
- Seed/config/documentation-referenced assets until owners establish whether reproducibility or historical documentation requires them.
- Backup/export artifacts subject to legal, disaster-recovery, or audit retention requirements; relocate rather than delete when Git is inappropriate.
- `.gitattributes` until LFS history and clone behavior have been tested on a disposable clone.

### Candidates for future external/object storage
- Large production media, especially multi-megabyte backgrounds and recordings, if delivery can move behind versioned object storage/CDN URLs.
- Required database exports/backups in encrypted, access-controlled backup storage with lifecycle/retention policy—not normal Git history.
- Design source material, mockups, screenshots, and staging uploads in a design/DAM system when they are not build inputs.

## 10. Proposed phased cleanup plan and rollback

1. **Freeze and baseline.** Tag the audited commit; export this inventory (paths, sizes, SHA-256 groups); identify asset, database, security, and design owners. Rollback: return to the tag—no content changes occur in this phase.
2. **Validate references.** Query only approved non-production snapshots/exports or owner-provided inventories for database/CMS paths; exercise representative builds and routes; classify each suspected item. Rollback: preserve the baseline manifest and make no deletions.
3. **Quarantine in a focused PR.** Move owner-approved candidates to a versioned external quarantine or dedicated branch; do not rewrite history. Keep a path mapping and checksums. Rollback: revert the single PR or restore checksum-matched objects to original paths.
4. **Consolidate duplicates incrementally.** One asset family per PR; update code/config/non-production seed references, run typecheck/tests/build, and visually verify affected routes. Rollback: revert that family’s PR and restore original paths.
5. **Externalize large retained artifacts.** Upload to access-controlled, versioned object storage; verify checksums, permissions, caching, backup, and deploy behavior before changing references. Rollback: retain old Git objects/references for at least one release window and support a configuration switch back.
6. **Retire and optionally rewrite history.** Delete quarantine only after the agreed retention window. Consider history rewriting solely as a separately approved repository-administration project with collaborator coordination and fresh-clone validation. Rollback: preserve a protected pre-rewrite mirror/tag and documented recovery procedure.

## Audit limitations

- Literal reference matching can miss database-driven, concatenated, remotely configured, or case-transformed paths and can overcount prose references.
- Folder sizes represent the checked-out tracked files, not compressed packfiles or historical blobs.
- “Necessary” is a product/retention decision; this report distinguishes confirmed technical facts from suspected cleanup opportunities and does not authorize deletion.
