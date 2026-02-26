# Para Pets - Fantasy Pet Adventure Game

## Overview
Para Pets is a mobile-first fantasy game web app where players collect, raise, and battle magical pets. The app is designed with a medieval fantasy aesthetic (max 480px width, centered on desktop with dark sides).

## Architecture
- **Frontend**: React + Vite + TypeScript + TailwindCSS + wouter routing
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon via Replit) with Drizzle ORM
- **Auth**: Passport.js (local strategy, accepts username or email) + express-session + connect-pg-simple
- **Image Processing**: Sharp (server-side resize to 500x500)

## Pages
1. **Auth Page** (`/auth`) - Login / Sign Up with fantasy UI, crystal pill buttons, show/hide password toggle
2. **Home Page** (`/`) - Main game screen with pet platform, rolled scroll quest log, bottom nav bar
3. **Map Page** (`/map`) - World map with 8 clickable locations, each opens to a full-screen area background
4. **Admin Page** (`/admin`) - Admin-only realm administration with member list, ban/unban, give coins

## Shared Components
- **TopBar** - Profile pic (framed), player name, coin display, shop icon, home icon — shown on all game pages
- **UserProfilePanel** - Slide-up overlay for profile settings, username change, admin panel link, logout
- **NavIcon** - Bottom navigation bar icons with tap feedback

## Admin Account
- Email: paradox.esctacyartistry@gmail.com is auto-promoted to admin on startup
- Admin can access Realm Administration from profile panel
- Admin can banish/unbanish users and give/remove coins

## Database Schema
- `users` table: id, username, email, password (bcrypt), profileImage, coins, isAdmin, isBanned, lastUsernameChange, lastProfilePicChange, createdAt
- `session` table: managed by connect-pg-simple

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

## Map Locations
Haunted Woods, The Swamp, Scorched Desert, Treasure Isle, Volcanic Isle, Sky Realm, Frostpeak, Enchanted Grove

## Design Tokens
- Fantasy fonts: Cinzel (heading), Cinzel Decorative (logo)
- Fantasy colors: Gold (#d4a017, #f0c040), Wood (#5c3a1e, #8b5e3c), Forest (#1a4a2e), Teal (#7fffd4)
- Button images contain their own text — no overlaid text spans

## Key Notes
- Login accepts username OR email (passport strategy)
- `apiRequest` returns Response object — call `.json()` on it
- Mobile-first 480px max width; desktop centered with #0a0a0a sides
- Profile frame image has been processed for true center transparency
