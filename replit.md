# Para Pets - Fantasy Pet Adventure Game

## Overview
Para Pets is a mobile-first fantasy game web app where players collect, raise, and battle magical pets. The app is designed with a medieval fantasy aesthetic.

## Architecture
- **Frontend**: React + Vite + TypeScript + TailwindCSS
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon via Replit) with Drizzle ORM
- **Auth**: Passport.js (local strategy) + express-session + connect-pg-simple
- **Image Processing**: Sharp (server-side resize to 500x500)

## Pages Built
1. **Auth Page** (`/auth`) - Login / Sign Up with:
   - Fantasy game UI (medieval interior background)
   - Para Pets logo, leaf-shaped buttons (Sign In = green leaf, Create Account = orange leaf)
   - Animated loading progress bar (1.5 seconds minimum)
   - Profile picture upload with auto-resize to 500x500px
   - Form validation (username: letters+numbers only, email, password min 6 chars)

2. **Home Page** (`/`) - Main game screen with:
   - Forest fantasy background
   - Top left: Clickable profile portrait with wood frame asset
   - Top center: Username display in fantasy wood style
   - Top right: Pet shop icon + coin counter (placeholder 0)
   - Center: Empty pet platform area ready for future pet animation
   - Bottom: Wood carved navigation bar with 4 icons (Quests, Map, PvP, Pet Inventory)

3. **User Profile Panel** - Slide-up overlay (opened by clicking profile portrait):
   - Change username (once per month limit)
   - Change profile picture (once per week limit)
   - Account info display (email, admin badge if applicable)
   - Logout / "Leave Realm" button
   - X button to close

## Admin Account
- Email: paradox.esctacyartistry@gmail.com
- Password: AdminOnly13
- Username: ParaDoxAdmin
- Auto-seeded on server startup

## Database Schema
- `users` table: id, username, email, password (bcrypt hashed), profileImage (path), coins, isAdmin, lastUsernameChange, lastProfilePicChange, createdAt
- `session` table: managed by connect-pg-simple

## File Storage
- Profile images stored in `uploads/` directory at project root
- Served via Express static middleware at `/uploads/` path
- Auto-resized to 500x500px square crop using Sharp

## API Endpoints
- `POST /api/auth/register` - Create account with optional profile image
- `POST /api/auth/login` - Login with username + password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user (returns null if unauthenticated)
- `PATCH /api/user/username` - Update username (monthly limit)
- `PATCH /api/user/profile-image` - Update profile picture (weekly limit)

## Fantasy Assets Used
- `IMG_6038` - Forest background (Home page)
- `IMG_6042` - Medieval interior background (Auth page)
- `IMG_6039` - Para Pets logo
- `IMG_6041` - Sign In button (green leaf)
- `IMG_6040` - Create Account button (orange leaf)
- `IMG_6048` - Profile portrait frame (wood frame)
- `IMG_6047` - Shop icon (pet shop building)
- `IMG_6049` - Bottom navigation bar (wood plank)
- `IMG_6053` - Quests icon (scroll)
- `IMG_6052` - Map icon (treasure map)
- `IMG_6051` - PvP icon (crossed swords)
- `IMG_6050` - Pet inventory icon (egg with leaf)

## Design Tokens
- Fantasy fonts: Cinzel (heading), Cinzel Decorative (logo), Lora/Playfair Display (body)
- Fantasy colors: Gold (#d4a017, #f0c040), Wood (#5c3a1e, #8b5e3c), Forest (#1a4a2e), Parchment (#f2e8d0), Teal Glow (#7fffd4)

## Future Expansion Ready
- Currency system modular (coins field on user)
- Pet system ready (empty platform in center)
- Quest, Map, PvP, Pet Inventory navigation placeholders
