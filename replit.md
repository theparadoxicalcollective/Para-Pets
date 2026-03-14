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
- **Admin Tools**: Comprehensive features for user management, shop item creation/editing, reward bundle distribution, and world/location configuration.
- **Stripe Integration**: Secure payment processing for coin purchases with daily spending limits.

## External Dependencies
- **Database**: PostgreSQL (via Neon)
- **ORM**: Drizzle ORM
- **Authentication**: Passport.js, express-session, connect-pg-simple
- **Payment Processing**: Stripe (stripe, stripe-replit-sync packages)
- **Image Manipulation**: Sharp library