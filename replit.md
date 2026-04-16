# Para Pets - Fantasy Pet Adventure Game

## Overview
Para Pets is a mobile-first fantasy web application where players engage in collecting, raising, and battling magical pets within a medieval fantasy setting. The project aims to deliver an immersive game experience with a rich world system, pet mechanics, and administrative tools, targeting a broad audience of casual and dedicated mobile gamers.

## User Preferences
- I prefer simple language.
- I want iterative development.
- Ask before making major changes.

## System Architecture
The application is built as a monolithic web app with a clear separation of concerns between frontend, backend, and database.

### UI/UX Decisions
- **Aesthetic**: Medieval fantasy theme, mobile-first design (max 768px width), centered on desktop with dark sidebars.
- **Components**:
    - **TopBar**: Displays profile, coins, and navigation.
    - **UserProfilePanel**: Slide-up overlay for user settings and admin access.
    - **PetInventory**: Full-screen overlay for managing owned pets and items.
- **Pages**:
    - **Auth Page**: Login/Sign Up with fantasy-themed UI.
    - **Home Page**: Displays active pet, quest scroll, and main navigation.
    - **Map Page**: Interactive parchment-themed world map with 3D world icons and navigation.
    - **World Page**: World-specific shops and exploration mechanics. Shop view uses a full-screen mystical forest background (bg_shop_mystical.png) with items placed as freely-positioned draggable objects on the canvas (admin) or clickable objects (player). Player item detail sheet slides up from bottom with stat descriptions, quantity picker (1–20, pets=1), price button → confirm → buy flow.
    - **Para Pets Hub Page** (`/hub`): Public landing page with a "Hall of Legends" badge leaderboard — players ranked by total badge points, top-3 badge icons shown per row, click-to-expand reveals all badges.
    - **Admin Page**: Comprehensive tools for realm administration.
    - **Coin Shop**: Integrated Stripe for in-app coin purchases.
    - **Pet House Page**: Enchanted forest room with animated walking/floating pets; drag-to-feed edibles mechanic.
    - **Visit Pet House Page** (`/visit/:userId`): Read-only view of another player's pet house showing their hatched pets with same animations.
    - **PlayerDetailPanel**: Modal overlay showing another player's public profile — username, profile photo, active pet stats (HP/ATK/DEF/Level), accessories inventory, and Visit Pet House button.
    - **PetDetailPage — Accessories Section**: 3-slot accessory grid inside the pet detail panel. Filled slots show item image, name, ATK/DEF boosts, and a "Tap to Remove" label; empty slots show a dashed + button. Tapping an empty slot opens an in-place picker listing unequipped accessories from inventory. Equip/unequip triggers sparkle (✨) or smoke (💨) flash animation. Stats are updated server-side on equip/unequip.
- **Design Tokens**: Utilizes fantasy fonts (Lora) and a defined color palette (Gold, Wood, Forest, Teal).
- **Image Handling**: All images are stored as base64 data URIs in the database. Profile images are resized to 500x500 JPEG; shop item images (PNG/GIF) are resized to fit within 2000x2000.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, TailwindCSS, wouter for routing.
- **Backend**: Express.js, TypeScript.
- **Authentication**: Passport.js with local strategy (username or email), `express-session`, and `connect-pg-simple`.
- **Image Processing**: Sharp library for server-side image manipulation.
- **World System**:
    - Features a dynamic world map with draggable, customizable worlds.
    - Worlds contain a horizontally scrollable panoramic canvas (200vw wide) with interactive buildings.
    - Admin controls: free-placement drag (float precision, no grid snap), last-moved building always on top, flip (mirror) buildings left-right, horizontal scroll with background moving together.
    - Exploration mechanics involve pet-scaled enemies, a multi-wave battle system, and potion usage.
- **Pet System**:
    - Pets are shop items with rarity and hatch times.
    - Hatching system with progress bars and egg transformations.
    - Stat-boosting items and a pet leveling system with rarity-based caps.
    - Option to reset pet stats.
- **Reward System**: Admin-created bundles with coins and items, delivered to users via an in-game notification system.
- **Daily Login Rewards**: 7-day rotating reward bar on the Para Pets Hub page. Players claim one reward per day (in order, once every 24 hrs); rewards restart from Day 1 after completing the 7-day cycle. Admin users see an Edit button to configure each day's coin amount and items via a tabbed item-picker modal. Tables: `daily_login_rewards`, `daily_login_reward_items`, `player_daily_login_claims` (Railway-compatible `CREATE TABLE IF NOT EXISTS` in server/index.ts).
- **Gift System**: Players can send coins or inventory items to friends via a SendGiftModal (opened from FriendProfileModal). Pending gifts appear as a pulsing green `!` button on the recipient's Pet House page at an admin-configurable position (draggable in the BundleBgEditor). Accepting opens GiftClaimModal which credits coins/items to the recipient. Database table: `gifts`; API routes: `POST /api/gifts/send`, `GET /api/gifts/pending`, `POST /api/gifts/:id/accept`.

### Feature Specifications
- **User Management**: User registration, login, profile updates, and admin-managed banning/unbanning.
- **Inventory & Shop**: In-game currency-based purchasing, item management, and pet interaction.
- **Admin Tools**: Comprehensive features for user management, shop item creation/editing, reward bundle distribution, world/location configuration, and enemy database management (with animation parts editor).
- **Stripe Integration**: Secure payment processing for coin purchases with daily spending limits.
- **Enemy Database System**:
  - Global enemy database (not location-specific): `enemies` table with name, imageUrl, atk, health, isBoss, and up to 3 specials (boss only)
  - Animation parts editor: `enemy_parts` table for layered animation asset assembly with drag-to-reposition canvas
  - Admin "Enemies" tab in AdminPage.tsx → EnemyDatabasePanel.tsx (CRUD + animation parts canvas editor)
  - API routes: GET/POST/PATCH/DELETE `/api/admin/enemies`, GET/POST/PATCH/DELETE `/api/admin/enemy-parts/:enemyId`
- **Fishing System**:
  - Three fishing item types in the shop: `pole`, `bait`, and `fish` (all under `type="fishing"`)
  - Fish have `starRarity` (1–5); poles have `catchEasePercent` (reduces minigame difficulty for 3★+ fish); bait has `rarityBoostPercent` (direct probability boost to a target star rarity)
  - Fish visual composition via `fish_template_parts` table (body/eyes/tail/fins parts with drag-to-position canvas editor)
  - Pond stocking: admins assign fish items to fishing-type locations via `pond_fish` table
  - Player fishing: `POST /api/fishing/catch` runs weighted random catch with pole/bait boosts applied
  - Player fish inventory: `player_fish_inventory` table; fishing equipment: `player_fishing_equipment` table
  - Admin "Fishing" tab in AdminPage.tsx → FishingAdminPanel.tsx (CRUD + fish parts canvas editor)
  - Fishing pond admin button (🎣) on fishing-type location view in WorldPage.tsx → PondAdminModal
- **Fishing Mini-Game Page** (`FishingPage.tsx`):
  - Opens as a full-screen overlay when clicking a `type="fishing"` location on the world map
  - Background: generated magical swamp pond portrait art (`fishing_bg_portrait.png`) or location's own bgUrl
  - Three equipment slots at bottom: Pole, Bait, Fish Inventory — each opens a picker panel
  - Pole/bait equip/unequip via `POST /api/fishing/equip` and `POST /api/fishing/unequip`
  - Fish inventory panel groups caught fish by species with star rarity display
  - Cast → Waiting → Nibble → Reel mechanic: tap pond to cast (must have pole equipped + fish in pond), then after a random 1.5–4s delay a fish nibbles, tap again to start reeling
  - Reel mechanic: vertical slider bar, player must tap REEL button rapidly to keep green indicator in the green zone; after 4 seconds the result resolves: score 70–100 = catch, 0–30 = miss
  - Catch calls `POST /api/fishing/catch` with a performance score; catch/miss feedback animations
  - Active pet shown via PetAnimator in bottom-left corner
  - Admin "+" button → PondAdminPanel inside the fishing scene (add/remove fish from pond using public route `/api/location/:locationId/pond-fish` for reads, admin route for write/delete)
  - All timer refs tracked and cleared on unmount/reset to prevent stale state updates
  - WorldPage integration: `handleLocationClick` detects `type === "fishing"` → sets `showFishing = true`; rendered as `<FishingPage>` overlay parallel to shop/battle overlays

- **Keeper's Central Invisible Door System** (PetWorldPage.tsx):
  - Admin places invisible trigger zones (doors) on the KC map via the 🚪 toolbar button → "Interior Doors" panel
  - Each door has: `name`, `posX/posY` (% of map), `triggerRadius` (% distance for trigger), `bgUrl` (interior background)
  - Admin can drag door zones on the map, resize radius with −/+ buttons, delete them, or enter the interior
  - Player's pet walks over a trigger zone → door interior opens automatically as a full-screen overlay
  - Interior overlay shows: door background, admin-placed decor items, shop shelf (if any items added via location/door ID)
  - Interior decor items (`kc_door_decor_placements` table): admin uploads images, drags them to position, resizes, flips, deletes
  - Admin adds decor inside the interior via + button → upload form
  - Exit button closes the interior; a 3-second cooldown prevents immediate re-trigger on exit
  - Shop items for a door use the door's ID as `locationId` (reuses existing `/api/location/:id/items` route)
  - Tables: `kc_doors`, `kc_door_decor_placements`; API routes: `/api/world/:worldId/kc-doors`, `/api/admin/kc-doors`, `/api/kc-doors/:doorId/decor`, `/api/admin/kc-door-decor`

- **Battle System Overhaul** (BattleArena.tsx — completed):
  - **Multi-pet support**: Up to 3 pets equipped for battle (WorldPage `battlePets` → `equippedPets` prop). Slot 0 = active pet (player-controlled swipes + skill), slots 1-2 = auto-attack pets. Enemy targets a random alive pet per charge.
  - **Enemy charge animation**: Enemy lerps from float position toward target pet (ease-in cubic), then returns with ease-out. Shows "⚠ INCOMING!" label when charging, "⚠ HOLD BLOCK!" or "🛡 BLOCKING!" hint above targeted active pet.
  - **Hold-block mechanic**: Block button is now hold-to-block (3s max, 2s cooldown). While held → `blockHeldRef = true`; damage reduced 75%. Button glows blue. Old tap-parry window removed entirely.
  - **Auto-attack (slots 2-3)**: Each extra pet fires an orb projectile at the enemy every 3.5–5.5s using their own `petAtk`. Orbs animate via `autoOrbs` state. Extra pet mana builds up and auto-fires skill at full.
  - **Boss special attacks**: `bossSpecialAttack` field in DB (`slash` / `bolt`). Bolt fires projectiles to ALL alive pets (staggered, animated via `boltProjectiles`); Slash shows a red overlay and damages all pets. Block reduces boss special damage by 60%.
  - **Defeat condition**: Battle ends when ALL equipped pets are defeated (active + all extras). Extra pets show HP bars + "FAINTED" label when at 0 HP.
  - `getPetPos(idx, total)` helper function positions pets based on count: 1 pet = center-left, 2 pets = evenly split left half, 3 pets = left/center/right.
  - `EquippedPet` interface exported from BattleArena.tsx; `bossSpecialAttack` field added to `location_enemies` schema and API routes.
  - Admin panel (`ExploreAdminPanel.tsx`): Boss special attack selector (None / ⚡ Bolt Volley / ⚔ Fury Slash) appears in both Add and Edit enemy forms when isBoss is toggled on.

## External Dependencies
- **Database**: PostgreSQL (via Neon)
- **ORM**: Drizzle ORM
- **Authentication**: Passport.js, express-session, connect-pg-simple
- **Payment Processing**: Stripe (stripe, stripe-replit-sync packages)
- **Image Manipulation**: Sharp library