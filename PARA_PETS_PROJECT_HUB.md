# Para Pets Project Hub

Last reviewed: July 22, 2026  
Repository: theparadoxicalcollective/Para-Pets  
Status: Living source-of-truth index for the game

## Purpose

This file keeps the identity, direction, major systems, technical architecture, visual rules, and roadmap for Para Pets in one discoverable place. It is intended for the owner, collaborators, developers, and AI assistants.

For exhaustive technical mechanics and database field documentation, also read MASTER_GAME_DOCUMENT.txt. For current safety rules and non-obvious implementation decisions, always read replit.md before changing code.

## Source-of-truth order

When documents disagree, use this order:

1. The owner's newest explicit decision.
2. The live Railway PostgreSQL database for real player data.
3. Current code on the main branch for what is implemented.
4. replit.md for database safety and current implementation guardrails.
5. This project hub for product direction, organization, and cross-system context.
6. MASTER_GAME_DOCUMENT.txt for the detailed technical map as of March 26, 2026.
7. Older prompts, mockups, experiments, and attached assets as historical context only.

A feature appearing in an image, prompt, or planning note does not automatically mean it is implemented. Label work as Implemented, In progress, Planned, or Idea.

## Game identity

Para Pets is a free-to-play, mobile-first fantasy pet adventure game. Players collect and hatch magical creatures, care for and strengthen them, explore themed worlds, fish, battle enemies and other players, participate in community activities, trade items, decorate homes, and build lasting collections.

The main setting is Veridia. The art direction blends magical rainforest, bayou, medieval-fantasy, haunted, volcanic, and whimsical chibi influences. The project is independently owned and intended to grow into a long-term creative business rather than be built for resale.

Primary experience:

- Portrait-oriented mobile web app, with desktop support and wider layouts treated as secondary.
- Collectible pets and eggs with rarity, stats, leveling, skills, accessories, and animated presentation.
- Earn-and-spend economy centered on coins, fishing, battles, quests, shops, player trading, and optional purchases.
- Social and community features including world chat, friends, forums, gifting, founders recognition, leaderboards, and shared rewards.
- Exploration through themed worlds, location icons, shops, fishing areas, combat encounters, and walk-around scenes.
- Mini-games and repeatable challenges that feed rewards back into the main collection and progression loop.

## Player-facing design principles

- The game should feel generous and understandable, not designed so players always lose.
- Fishing is possible without bait. Bait improves catch ease or rarity rather than acting as a universal entry fee.
- Free progression paths should remain available through daily quests, rewards, fishing, combat, and community systems.
- Purchases support development and can provide convenience or special collectibles, but the core game remains free to play.
- Mobile interactions must be large enough to tap, readable, and resilient on different phone heights and widths.
- New systems should connect back to pets, collections, coins, items, social standing, or world exploration.
- Real player progress must never be placed at risk for the sake of a quick schema or deployment change.

## Core gameplay loop

1. Earn coins, items, experience, fish, and collectibles through daily play.
2. Buy or receive eggs, pets, gear, bait, poles, accessories, potions, and home items.
3. Hatch, care for, level, power up, and customize pets.
4. Use pets in world battles, PvP, raids, exploration, and mini-games.
5. Sell, trade, display, equip, collect, or gift earned items.
6. Unlock more worlds, locations, rarities, badges, leaderboard positions, and collection goals.
7. Return for daily quests, login rewards, community activity, rotating rewards, and new content.

## Current application surface confirmed in code

The current route map confirms these player and admin areas exist in the application:

| Area | Current route or surface | Notes |
|---|---|---|
| Home | / | Persistent base layer with main game navigation |
| Authentication | /auth | Registration and login |
| Email verification | Account gate | Required before entering normal game pages |
| World map | /map | Entry point to themed worlds |
| Worlds | /world/:worldId | Data-driven world and location pages |
| Coin shop | /coins | Stripe-backed purchase experience |
| Pet house | /pet-house | Personal home and pet display |
| House visits | /visit/:userId | Visit another player's pet house |
| Badges | /badges | Collection and reward progression |
| Market | /market | Player marketplace |
| PvP | /pvp | Arena and battle flow |
| Pets | /pets | Pet and egg inventory |
| Bag | /bag | General item inventory |
| Accessories | /equip-accessories | Pet equipment |
| Pet care | /pet-care/:id | Individual pet care |
| Friends | /friends | Social connections |
| Forum | /forum | Community discussion |
| Hub | /hub | Para Pets information/community hub |
| Founders | /founders | Supporter recognition |
| Molten Blocks | /games/molten-blocks | Volcanic falling-block mini-game |
| Lava Crawl | /games/lava-crawl | Side-running volcanic mini-game |
| Raid | /raid | Raid preparation/status |
| Raid leaderboard | /raid/leaderboard | Raid rankings |
| Raid battle | /raid/battle | Active raid encounter |
| Elysian Bayou clearing | /explore/elysian-bayou-clearing | Walk-around exploration scene |
| Admin | /admin | Protected game management tools |
| Privacy | /privacy | Privacy policy |
| Maintenance | Global gate | Blocks non-admin players during maintenance |

The route existing proves that a page is integrated, but does not by itself prove that every intended mechanic on that page is complete or balanced.

## Major game systems

### Pets and eggs

Pets are the center of Para Pets. Owned pets can include hatching state, nickname, rarity, health, attack, defense, level, experience, special skill, accessories, active-pet state, and visual template data. Eggs hatch over real time and may be accelerated by special items. Pets are intended to appear throughout the home screen, care pages, houses, worlds, combat, raids, and exploration.

Recognizable pets and eggs may use strong silhouette features such as horns, halos, wings, tails, ears, or color themes. Character anatomy and identifying features must remain consistent across icons, eggs, sprites, ads, and animations.

### Pet care and power progression

Players can level pets, use power-up items, equip accessories, and manage an active pet. Power progression should remain consistent across PvE, PvP, raids, and future modes. Any rebalance must consider existing player investments and live inventory data.

### Worlds and exploration

Worlds are themed regions with their own backgrounds, location icons, shops, enemies, fishing areas, and mini-games. Confirmed world identifiers in current code include volcanic, swamp, haunted_woods, snowy_mountain, sky_realm, island, desert, and enchanted_grove. Elysian Bayou also has a dedicated walk-around clearing route.

New exploration locations should be data-driven and organized as reusable world/location configuration rather than one-off code where possible. The active pet walking around an otherwise mostly open environment is the initial Elysian Bayou clearing behavior; future interactions can be layered onto the same scene.

### Fishing and aquarium

Fishing includes poles, optional bait, rarity weighting, durability, a tension/reeling mini-game, caught-fish inventory, selling, collection, aquarium display, ponds, and leaderboards. Fishing should always retain a free or renewable path. Bait improves results; it should not be required for every cast.

The aquarium is a collection/display destination for fish players choose not to sell. Fishing rewards also support daily quests and the broader coin economy.

### PvE combat

World combat uses a mobile slash interaction with enemy waves, pet stats, mana, skills, parry/counter behavior, drops, coins, and experience. Enemies and drops should be assigned through managed game data. Bosses can use larger hit areas, rage phases, stronger feedback, and special reward tables.

### PvP

PvP lets players use pets against other players or player teams and supports rankings and leaderboard presentation. PvP balance must be handled carefully because it intersects with rarity, paid items, stat investment, accessories, and long-term progression.

### Raids

Raids are a multiplayer/community boss feature with shared progress, individual participation, a boss health state, preparation, battle, leaderboard, and rewards. Current routes include the raid hub, leaderboard, and battle page. The intended experience is that multiple players contribute toward defeating a large boss and receive clearly explained rewards.

### Mini-games

Molten Blocks and Lava Crawl are integrated game routes. Mini-games should use the Para Pets visual language and return useful rewards or leaderboard progress to the main game. Lava Crawl is conceived as a side-running volcanic challenge with lives, jumping, enemies, platforms, and an end goal.

### Economy, shops, and purchases

Coins are the main game currency. Players earn them through fishing, selling, battles, quests, rewards, gifts, and other activities. Shops can sell eggs, pets, fishing gear, bait, accessories, potions, consumables, and home content.

Stripe powers real-money purchases. Purchase rewards, contribution milestones, founder recognition, limited eggs, and community-wide bonuses must be recorded and delivered server-side so refreshes or device changes cannot duplicate or erase rewards.

Historical business milestones should always be stored with dates and should not be treated as current totals without verification.

### Market and gifting

The Mire Bazaar is the player marketplace. Listings, transfers, quantities, pet availability, and coin movement must be validated server-side. Players can also send gifts. Any ownership transfer must be atomic so an item or currency cannot be duplicated or lost.

### Quests, login rewards, badges, and founders

Daily quests and login rewards provide renewable progression. Badges create longer collection goals. The Founders page recognizes people who helped make the game possible and is curated by administrators.

### Community

Current social surfaces include world chat, friends, forum, player profiles, house visits, support messages, gifts, and leaderboards. Chat moderation, bans, support tools, and filtered words are administrator-managed.

### Housing

Players can own and decorate pet-house spaces, place pets and decor, use house bundles and buildings, and visit other players. Placement systems should store positions as proportional values when possible so layouts scale across devices.

### Admin tools

The admin area manages members, coins, rewards, pets, items, fishing content, worlds, locations, enemies, shops, support, art/animation assemblies, and other live content. Admin image upload routes must fail clearly if image processing fails; they must never save a silent null image in place of uploaded art.

## Art and interface direction

Core style:

- Whimsical mobile fantasy with magical rainforest and bayou roots.
- Chibi or softly cartooned creatures with crisp, intentional detail.
- Forest green and gold are the strongest recurring interface colors.
- Red and gold can signal world exploration or danger.
- Blue and gold can be used for close/utility controls.
- Haunted areas may use eerie purple, mist, aged wood, and restrained glow.
- Volcanic areas use lava, dark stone, gold, ember orange, and deep red.

Asset rules:

- Keep standalone icons isolated on transparent or clean plain backgrounds when they will be layered in-game.
- Backgrounds normally contain no text, UI, characters, or accidental focal objects unless requested.
- Avoid unnecessary flowers in raid environments.
- Avoid animals in aquarium backgrounds.
- Avoid unexplained runes, guide lines, or hanging signs.
- Keep gems and ornamental UI elements symmetrical where symmetry is intended.
- Maintain clean hands, arms, legs, wings, horns, halos, and other identifying anatomy.
- Prefer scalable placement and safe margins for different portrait screens.
- Desktop may add side framing, but the core gameplay canvas remains mobile-first.
- Generated or uploaded art should be given descriptive, stable asset names rather than being left as anonymous prompt exports.

## Technical architecture

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Wouter, TanStack Query, Framer Motion, Radix/shadcn UI.
- Backend: Node.js, Express 5, TypeScript.
- Authentication: Passport local strategy with server sessions and PostgreSQL session storage.
- Database: PostgreSQL with Drizzle ORM. Railway is the production source of truth.
- Images: Sharp-based processing plus stored image/media references.
- Payments: Stripe.
- Email: Resend.
- Hosting direction: Railway is the ultimate production host and database keeper; Replit remains part of the development workflow.
- App layout: mobile-first, approximately 768px maximum core width, centered on larger screens.
- Loading: page chunks are lazy-loaded with retry behavior, and visible loading fallbacks prevent the home page from flashing through.

Important code anchors:

| Concern | Primary location |
|---|---|
| Frontend routes and global gates | client/src/App.tsx |
| Server startup and runtime migrations | server/index.ts |
| API routes | server/routes.ts |
| Database access layer | server/storage.ts |
| Drizzle schema and shared types | shared/schema.ts |
| Technical project guidance | replit.md |
| Deep technical game document | MASTER_GAME_DOCUMENT.txt |
| Package/runtime scripts | package.json |

## Production data safety

These rules are mandatory:

- Railway PostgreSQL holds real player data and is the database source of truth.
- Never use drizzle force or accept-data-loss flags against Railway.
- Never bypass a destructive schema warning.
- Never add automated build, deploy, post-merge, or startup behavior that performs destructive database synchronization.
- Runtime-managed tables must be changed only through their established idempotent migration approach.
- Never run DROP TABLE, TRUNCATE, DELETE without a WHERE clause, or destructive column-type changes against Railway without the owner's explicit approval.
- Before approved work that may touch production data, make a fresh Railway SQL dump.
- Never expose database URLs, Stripe secrets, email credentials, password hashes, session data, verification tokens, or other secrets in documentation or commits.
- Never infer the live contents of Railway from local development data.
- Preserve player IDs and ownership relationships during any future platform or engine migration.

The complete, current wording and table list live in replit.md and must be read before database work.

## Current direction and roadmap

### Active/current direction

- Continue organizing the live web app without disrupting existing player progress.
- Expand the world map with clearer, reusable exploration locations.
- Build out Elysian Bayou as a walk-around area beginning with the active pet and a mostly open magical-bayou ground scene.
- Continue developing raids, their shared boss progression, leaderboard, and reward flow.
- Maintain and refine Lava Crawl and Molten Blocks as connected mini-games.
- Keep mobile scaling and portrait presentation consistent across phone sizes and tablets.
- Improve asset naming and organization so later code cleanup or migration is practical.

### Planned

- Additional worlds, locations, shops, fishing spots, enemies, raid bosses, pets, eggs, and home content.
- Better organization of game systems and assets as the project grows.
- More mature community events, rotating rewards, and shared player goals.
- Desktop-specific presentation after the mobile experience is stable.

### Long-term ideas

- A carefully planned Unity rebuild or separate Unity client may be explored later.
- Any Unity work should reuse backend APIs or migrate data by stable IDs; asset file names and URLs do not need to remain identical if references are migrated deliberately.
- Location-aware or augmented-reality play is an idea, not a committed implementation.
- A 3D interpretation may be explored without replacing the existing 2D identity unless the owner explicitly chooses that direction.

## Organization standard for future work

Every meaningful feature should have:

1. A short product description and player benefit.
2. A status label: Idea, Planned, In progress, Implemented, or Retired.
3. Named frontend page/component files.
4. Named server endpoints and storage methods.
5. Named database tables and ownership rules.
6. Required art assets with stable filenames and usage notes.
7. Mobile layout requirements.
8. Economy and reward impact.
9. Admin-management requirements.
10. Verification steps and rollback considerations.

Recommended repository organization:

- Keep permanent project guidance at the repository root or under docs/.
- Keep reusable game art in purpose-named asset folders.
- Keep raw prompts and temporary mockups separate from production assets.
- Do not treat attached_assets prompt text as authoritative after a feature is implemented.
- Add a dated changelog entry to this hub when product direction changes materially.
- Update MASTER_GAME_DOCUMENT.txt when mechanics, formulas, routes, or tables change substantially.

## Documentation map

- PARA_PETS_PROJECT_HUB.md — product identity, design rules, current surface, roadmap, and documentation index.
- MASTER_GAME_DOCUMENT.txt — detailed mechanics, relationships, file structure, and database documentation as of March 26, 2026.
- replit.md — current non-obvious decisions and mandatory production database safety rules.
- .agents/memory/ — focused implementation notes for individual systems; useful context, not the sole source of truth.
- shared/schema.ts — declared database schema and shared types.
- client/src/App.tsx — currently integrated frontend routes.

## Known documentation gap

The repository is large and changes quickly. The March master document should be refreshed against current code before it is treated as an exact inventory of every route, endpoint, table, and formula. This hub records the newer product direction and current route surface, but it does not claim that every planned behavior has already been verified end to end.

## Update log

- July 22, 2026 — Created the project hub. Recorded current product identity, current application routes, new raid and mini-game surfaces, Elysian Bayou walk-around direction, visual standards, technical architecture, database safety rules, roadmap, and maintenance conventions.
