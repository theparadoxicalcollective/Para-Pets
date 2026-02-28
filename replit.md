# Para Pets - Fantasy Pet Adventure Game

## Overview
Para Pets is a mobile-first fantasy game web app where players collect, raise, and battle magical pets. The app is designed with a medieval fantasy aesthetic (max 768px width for tablet support, centered on desktop with dark sides).

## Architecture
- **Frontend**: React + Vite + TypeScript + TailwindCSS + wouter routing
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon via Replit) with Drizzle ORM
- **Auth**: Passport.js (local strategy, accepts username or email) + express-session + connect-pg-simple
- **Image Processing**: Sharp (server-side)
  - Profile images: resize to 500x500 JPEG, stored as base64 data URI in database
  - Shop item images: resize to max 2000x2000 (fit inside, no enlargement), supports PNG and animated GIF, stored as base64 data URI in database

## Pages
1. **Auth Page** (`/auth`) - Login / Sign Up with fantasy UI, crystal pill buttons, show/hide password toggle
2. **Home Page** (`/`) - Main game screen with active pet display, quest scroll overlay, bottom nav bar (Quest scroll, Globe/Map, Battle, Pets)
3. **Map Page** (`/map`) - Parchment-style world map with 8 3D-illustrated world icons in a 2-column grid
4. **World Page** (`/world/:worldId`) - Individual world page with world-specific shop (buy items with coins)
5. **Admin Page** (`/admin`) - Admin-only realm administration with ranked leaderboard, ban/unban, give coins
6. **Coin Shop** (`/coins`) - Purchase coins with Stripe ($1=100 coins, max $100/purchase, $500/day limit)

## Shared Components
- **TopBar** - Profile pic (thin frame), player name, coin display (with coin icon), home icon (hidden on homepage via hideHome prop) — shown on all game pages
- **UserProfilePanel** - Slide-up overlay for profile settings, username change, admin panel link, logout
- **PetInventory** - Full-screen overlay opened by pets nav icon; shows owned pets with select/deselect toggle; bag sub-view for items/accessories/potions

## Admin Account
- Email: paradox.esctacyartistry@gmail.com is auto-promoted to admin on startup and at registration
- Admin can access Realm Administration from profile panel
- Admin can banish/unbanish users and give/remove coins
- Admin can add/edit/delete shop items per world (name, price, type dropdown: pet/item/accessory/potion, image upload PNG/GIF)

## Database Schema
- `users` table: id, username, email, password (bcrypt), profileImage (base64 data URI), coins, isAdmin, isBanned, activePetId, lastUsernameChange, lastProfilePicChange, createdAt
- `shop_items` table: id, name, price, type, worldId, imageUrl (base64 data URI, PNG only), rarity (1-5 stars, nullable), hatchTime (hours, nullable), eggImageUrl (base64, PNG/GIF, nullable), hatchedImageUrl (base64, PNG/GIF, nullable), statBoostType (health/atk/def/lvl, nullable), statBoostAmount (integer, nullable), createdAt
- `user_inventory` table: id, userId, shopItemId, acquiredAt, hatchStartedAt (timestamp, nullable), isHatched (boolean, default false), petHealth (int, default 1000), petAtk (int, default 50), petDef (int, default 50), petLevel (int, default 0), itemsUsedThisLevel (int, default 0)
- `reward_bundles` table: id, name, coinAmount, createdAt
- `reward_bundle_items` table: id, bundleId, shopItemId
- `user_rewards` table: id, userId, bundleId, claimed (boolean), createdAt
- `session` table: managed by connect-pg-simple (created manually in async startup)

## API Endpoints
### Auth
- `POST /api/auth/register` - Create account (optional profile image, starts with 100 coins)
- `POST /api/auth/login` - Login (username or email)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### User
- `PATCH /api/user/username` - Update username (monthly limit)
- `PATCH /api/user/profile-image` - Update profile picture (no cooldown)
- `PATCH /api/user/active-pet` - Set or clear active pet (toggle)

### Inventory & Pets
- `GET /api/inventory` - Get current user's inventory with item details (includes rarity, hatchTime, hatch status, pet stats)
- `POST /api/shop/:worldId/buy/:itemId` - Purchase item from shop (deducts coins, starts hatch timer for pets)
- `POST /api/pet/:inventoryId/hatch-check` - Check if egg is ready to hatch, auto-marks as hatched
- `POST /api/pet/:inventoryId/power-up` - Apply item to pet (validates rarity limits, LVL items bypass cap)
- `POST /api/pet/:inventoryId/reset-stats` - Reset pet stats to base values for 300 coins

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/ban/:userId` - Banish a user
- `POST /api/admin/unban/:userId` - Unbanish a user
- `POST /api/admin/coins/:userId` - Add/remove coins
- `GET /api/admin/shop-items-all` - Get all shop items across worlds (for reward bundles)
- `POST /api/admin/reward-bundle` - Create and send reward bundle to users

### Rewards
- `GET /api/rewards/pending` - Get current user's unclaimed rewards with bundle details
- `POST /api/rewards/:rewardId/claim` - Claim a reward (atomic, prevents double-claim)

### Shop
- `GET /api/shop/:worldId` - Get shop items for a world
- `POST /api/admin/shop` - Create shop item with optional imageData (admin only)
- `PATCH /api/admin/shop/:itemId` - Update shop item with optional imageData (admin only)
- `DELETE /api/admin/shop/:itemId` - Delete shop item (admin only)

### Coin Purchase (Stripe)
- `GET /api/coins/packs` - Get available coin packs with daily spending info
- `POST /api/coins/checkout` - Create Stripe checkout session for a coin pack
- `POST /api/coins/verify` - Verify and credit coins after successful Stripe payment
- `GET /api/stripe/publishable-key` - Get Stripe publishable key for frontend

## World Locations (8 worlds)
Frostpeak, Sky Realm, The Lost Island, Volcanic Isle, Enchanted Grove, Scorched Desert, The Swamp, Haunted Woods
- Each world has its own page, background, shop icon, and shop inventory
- Shop items are per-world (worldId links items to their world)

## Pet System
- Pets are shop items with type "pet" that users purchase from world shops
- Pet inventory shows only owned pets; bag sub-view shows items/accessories/potions
- Users can select one active pet to display on homepage (toggle on/off)
- Active pet persists in database (activePetId on users table)
- Only one pet active at a time; clicking same pet deselects it

### Hatching System
- Pets have a rarity (1-5 stars) and hatch time (hours)
- Purchasing a pet starts the hatch timer (hatchStartedAt = now)
- Before hatching: egg image shown with animated progress bar
- After hatch timer completes: tap egg to hatch, reveals hatched pet image
- Fresh hatched pets start with: 1000 HP, 50 ATK, 50 DEF, Level 0

### Pet Stats & Power-Ups
- Items with statBoostType (health/atk/def/lvl) can be used on hatched pets
- Items per level limited by rarity: 1★=3, 2★=4, 3★=5, 4★=6, 5★=7 items
- LVL items bypass the per-level cap and reset itemsUsedThisLevel to 0
- Max level: 100
- Stat reset: 300 coins, resets all stats to base values with confirmation warning

### Reward Bundle System
- Admin creates bundles with a name, optional coins, and optional shop items
- Can target all non-admin users or select specific users
- Recipients see a magical gift icon (🎁) bouncing next to their username in the TopBar
- Gift icon shows count badge for pending rewards
- Clicking gift opens RewardClaimModal showing all pending bundles with previews
- Claiming a bundle atomically marks it claimed (preventing double-claims), adds coins, and adds items to inventory
- Pets received via bundles auto-start hatch timer

### Admin Shop Form
- Pet type: shows rarity dropdown (1-5★), hatch time input, egg image upload, hatched pet image upload
- Item type: shows stat boost type dropdown (health/atk/def/lvl) and boost amount input
- Shop image: PNG only; Egg/Hatched images: PNG or animated GIF
- Shop displays egg image for pets, rarity stars, hatch time, and boost amounts for items

### Components
- **PetDetailPage** (`client/src/components/PetDetailPage.tsx`) - Full pet stats overlay with power-up and reset functionality
- **PetInventory** (`client/src/components/PetInventory.tsx`) - Shows eggs with progress bars, hatched pets with stats, bag items with boost badges
- **HomePage** pet display - Active pet shows egg+hatch bar or hatched pet with HP/LV bars

## Image Storage (Persistence Fix)
- ALL images stored as base64 data URIs directly in the PostgreSQL database
- No filesystem storage — images persist across republishes
- Profile images: JPEG, 500x500
- Shop item images: PNG or animated GIF, max 1000x1000 (fit inside)

## Art Assets
- World map icons v2: 3D illustrated floating islands (world_*_v2.png)
- Nav bar icons: quest scroll, globe (map), battle swords, pets egg
- Profile frame: thin elegant golden filigree (frame_profile_thin.png)
- Shop icons: unique per world (ice shop, sky shop, volcanic forge, etc.)
- Gold coin icon, bag icon for inventory
- Parchment map background, ornate unrolled scroll for quest log

## Design Tokens
- Fantasy fonts: Cinzel (heading), Cinzel Decorative (logo)
- Fantasy colors: Gold (#d4a017, #f0c040), Wood (#5c3a1e, #8b5e3c), Forest (#1a4a2e), Teal (#7fffd4)
- Button images contain their own text — no overlaid text spans
- Responsive icon sizes: 3 breakpoints (phone base, 480px+, 640px+)

## Key Notes
- Login accepts username OR email (passport strategy)
- `apiRequest` returns Response object — call `.json()` on it
- Mobile-first 768px max width; desktop centered with #0a0a0a sides
- connect-pg-simple must use `createTableIfMissing: false`; session table created manually via pool.query
- No 7-day cooldown on profile picture changes
- No automated/video testing during development
- Stripe integration: stripe + stripe-replit-sync packages, webhook route registered BEFORE express.json(), coin_purchases table tracks spending limits
- Coin packs: 100/$1, 500/$5, 1000/$10, 2500/$25, 5000/$50, 10000/$100; daily limit $500
