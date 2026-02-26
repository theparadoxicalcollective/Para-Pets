# Para Pets - Fantasy Pet Adventure Game

## Overview
Para Pets is a mobile-first fantasy game web app where players collect, raise, and battle magical pets. The app is designed with a medieval fantasy aesthetic (max 768px width for tablet support, centered on desktop with dark sides).

## Architecture
- **Frontend**: React + Vite + TypeScript + TailwindCSS + wouter routing
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon via Replit) with Drizzle ORM
- **Auth**: Passport.js (local strategy, accepts username or email) + express-session + connect-pg-simple
- **Image Processing**: Sharp (server-side resize to 500x500)

## Pages
1. **Auth Page** (`/auth`) - Login / Sign Up with fantasy UI, crystal pill buttons, show/hide password toggle
2. **Home Page** (`/`) - Main game screen with pet platform, quest scroll overlay, bottom nav bar (Quest scroll, Map, Battle, Pets)
3. **Map Page** (`/map`) - Parchment-style world map with 8 clickable painted world icons
4. **World Page** (`/world/:worldId`) - Individual world page with world-specific shop icon, expandable for future content
5. **Admin Page** (`/admin`) - Admin-only realm administration with ranked leaderboard, ban/unban, give coins

## Shared Components
- **TopBar** - Profile pic (framed), player name, coin display (with coin icon), home icon — shown on all game pages; icons have dark backing for visibility on all backgrounds
- **UserProfilePanel** - Slide-up overlay for profile settings, username change, admin panel link, logout

## Admin Account
- Email: paradox.esctacyartistry@gmail.com is auto-promoted to admin on startup and at registration
- Admin can access Realm Administration from profile panel
- Admin can banish/unbanish users and give/remove coins
- Admin can add/edit/delete shop items per world (name, price, type dropdown: pet/item/accessory/potion)

## Database Schema
- `users` table: id, username, email, password (bcrypt), profileImage, coins, isAdmin, isBanned, lastUsernameChange, lastProfilePicChange, createdAt
- `shop_items` table: id, name, price, type, worldId, imageUrl, createdAt
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

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/ban/:userId` - Banish a user
- `POST /api/admin/unban/:userId` - Unbanish a user
- `POST /api/admin/coins/:userId` - Add/remove coins

### Shop
- `GET /api/shop/:worldId` - Get shop items for a world
- `POST /api/admin/shop` - Create shop item (admin only)
- `PATCH /api/admin/shop/:itemId` - Update shop item (admin only)
- `DELETE /api/admin/shop/:itemId` - Delete shop item (admin only)

## World Locations (8 worlds)
Frostpeak, Sky Realm, Treasure Isle, Volcanic Isle, Enchanted Grove, Scorched Desert, The Swamp, Haunted Woods
- Each world has its own page, background, shop icon, and shop inventory
- Shop items are per-world (worldId links items to their world)

## Art Assets
- World map icons: painted watercolor-style floating islands on parchment
- Nav bar icons: fantasy style matching magical egg icon (quest scroll, map, battle, pets)
- Shop icons: unique per world (ice shop, sky shop, volcanic forge, etc.)
- Gold coin icon with transparent background for currency display
- Parchment map background, new ornate unrolled scroll for quest log

## Design Tokens
- Fantasy fonts: Cinzel (heading), Cinzel Decorative (logo)
- Fantasy colors: Gold (#d4a017, #f0c040), Wood (#5c3a1e, #8b5e3c), Forest (#1a4a2e), Teal (#7fffd4)
- Button images contain their own text — no overlaid text spans
- Responsive icon sizes: 3 breakpoints (phone base, 480px+, 640px+)

## Key Notes
- Login accepts username OR email (passport strategy)
- `apiRequest` returns Response object — call `.json()` on it
- Mobile-first 768px max width; desktop centered with #0a0a0a sides
- Profile frame image has been processed for true center transparency
- connect-pg-simple must use `createTableIfMissing: false`; session table created manually via pool.query
- No 7-day cooldown on profile picture changes
- No automated/video testing during development
