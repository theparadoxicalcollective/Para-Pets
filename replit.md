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
  - Shop item images: resize to max 1000x1000 (fit inside, no enlargement), supports PNG and animated GIF, stored as base64 data URI in database

## Pages
1. **Auth Page** (`/auth`) - Login / Sign Up with fantasy UI, crystal pill buttons, show/hide password toggle
2. **Home Page** (`/`) - Main game screen with active pet display, quest scroll overlay, bottom nav bar (Quest scroll, Globe/Map, Battle, Pets)
3. **Map Page** (`/map`) - Parchment-style world map with 8 3D-illustrated world icons in a 2-column grid
4. **World Page** (`/world/:worldId`) - Individual world page with world-specific shop (buy items with coins)
5. **Admin Page** (`/admin`) - Admin-only realm administration with ranked leaderboard, ban/unban, give coins

## Shared Components
- **TopBar** - Profile pic (thin frame), player name, coin display (with coin icon), home icon — shown on all game pages
- **UserProfilePanel** - Slide-up overlay for profile settings, username change, admin panel link, logout
- **PetInventory** - Full-screen overlay opened by pets nav icon; shows owned pets with select/deselect toggle; bag sub-view for items/accessories/potions

## Admin Account
- Email: paradox.esctacyartistry@gmail.com is auto-promoted to admin on startup and at registration
- Admin can access Realm Administration from profile panel
- Admin can banish/unbanish users and give/remove coins
- Admin can add/edit/delete shop items per world (name, price, type dropdown: pet/item/accessory/potion, image upload PNG/GIF)

## Database Schema
- `users` table: id, username, email, password (bcrypt), profileImage (base64 data URI), coins, isAdmin, isBanned, activePetId, lastUsernameChange, lastProfilePicChange, createdAt
- `shop_items` table: id, name, price, type, worldId, imageUrl (base64 data URI), createdAt
- `user_inventory` table: id, userId, shopItemId, acquiredAt
- `session` table: managed by connect-pg-simple (created manually in async startup)

## API Endpoints
### Auth
- `POST /api/auth/register` - Create account (optional profile image)
- `POST /api/auth/login` - Login (username or email)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### User
- `PATCH /api/user/username` - Update username (monthly limit)
- `PATCH /api/user/profile-image` - Update profile picture (no cooldown)
- `PATCH /api/user/active-pet` - Set or clear active pet (toggle)

### Inventory
- `GET /api/inventory` - Get current user's inventory with item details
- `POST /api/shop/:worldId/buy/:itemId` - Purchase item from shop (deducts coins)

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/ban/:userId` - Banish a user
- `POST /api/admin/unban/:userId` - Unbanish a user
- `POST /api/admin/coins/:userId` - Add/remove coins

### Shop
- `GET /api/shop/:worldId` - Get shop items for a world
- `POST /api/admin/shop` - Create shop item with optional imageData (admin only)
- `PATCH /api/admin/shop/:itemId` - Update shop item with optional imageData (admin only)
- `DELETE /api/admin/shop/:itemId` - Delete shop item (admin only)

## World Locations (8 worlds)
Frostpeak, Sky Realm, Treasure Isle, Volcanic Isle, Enchanted Grove, Scorched Desert, The Swamp, Haunted Woods
- Each world has its own page, background, shop icon, and shop inventory
- Shop items are per-world (worldId links items to their world)

## Pet System
- Pets are shop items with type "pet" that users purchase from world shops
- Pet inventory shows only owned pets; bag sub-view shows items/accessories/potions
- Users can select one active pet to display on homepage (toggle on/off)
- Active pet persists in database (activePetId on users table)
- Only one pet active at a time; clicking same pet deselects it

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
