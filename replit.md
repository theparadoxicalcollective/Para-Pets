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
    - **Admin Page**: Comprehensive tools for realm administration.
    - **Coin Shop**: Integrated Stripe for in-app coin purchases.
    - **Pet House Page**: Enchanted forest room with animated walking/floating pets; drag-to-feed edibles mechanic.
    - **Visit Pet House Page** (`/visit/:userId`): Read-only view of another player's pet house showing their hatched pets with same animations.
    - **PlayerDetailPanel**: Modal overlay showing another player's public profile — username, profile photo, active pet stats (HP/ATK/DEF/Level), accessories inventory, and Visit Pet House button.
    - **PetDetailPage — Accessories Section**: 3-slot accessory grid inside the pet detail panel. Filled slots show item image, name, ATK/DEF boosts, and a "Tap to Remove" label; empty slots show a dashed + button. Tapping an empty slot opens an in-place picker listing unequipped accessories from inventory. Equip/unequip triggers sparkle (✨) or smoke (💨) flash animation. Stats are updated server-side on equip/unequip.
- **Design Tokens**: Utilizes fantasy fonts (Cinzel, Cinzel Decorative) and a defined color palette (Gold, Wood, Forest, Teal).
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

## External Dependencies
- **Database**: PostgreSQL (via Neon)
- **ORM**: Drizzle ORM
- **Authentication**: Passport.js, express-session, connect-pg-simple
- **Payment Processing**: Stripe (stripe, stripe-replit-sync packages)
- **Image Manipulation**: Sharp library