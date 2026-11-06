# Garden feature — Para Pets

**Status:** PR #997 (Admin foundation) and PR #998 (server transactions) were merged.
PR 3 implements the actual player Garden inside Pet Park. Do not mark this
feature resolved from a merged PR alone: physical iOS/Android/tablet
interaction checks, real inventory behavior and visual review still matter.

## User-facing behavior and authoritative server rules

1. Admin adds a Garden Plot via the current Pet Park Paint Terrain editor.
   The plot uses the same 150-world-unit 2:1 isometric snapping and relative
   coordinates as the current paths. The art is anchored at bottom-center so
   its visible base sits over the plot center despite transparent padding.
2. Admin defines Hoe, Scythe, Watering Pail (100 drops) and crops. A crop has
   separate seed packet (shop/market), planted, seedling, partial, grown,
   picked, and fruit (bag/market) artwork. Each of the first four stages
   has a configurable 1–1000 water-drop requirement.
3. An **admin-tagged Water Source** is an otherwise normal uploaded Pet Park
   decoration. New decor can be flagged during creation, and existing decor
   can be toggled in its usual selection editor; copies preserve the tag.
   Unmarked decorations, effects, terrain and buildings must not refill items.
4. **Refillable** is a separate admin setting stored on catalog items.
   Garden equipment and ordinary Admin Items can be labeled refillable.
   A disabled pail still holds 100 drops but cannot use Water Source refills.
   Non-water-bearing items do not automatically gain capacity. Merely toggling a property
   NEVER changes an owner's remaining water.
5. Player taps a plot to open the radial garden menu. Hoe prepares dark soil;
   a seed picker shows the player's owned/unlisted packets. Plant consumes
   exactly one packet. Watering adds one drop to the current stage and removes
   one drop from the chosen owner's pail. Growth is never client-authorized.
6. **Refill operation** in PR 2 must check, in a single server transaction:
   signed-in owner, actual owned/unlisted pail, `isRefillable` true,
   `gardenWaterLeft` in 0–99, target `pet_park_scene_items` record with
   `kind='decor'` and `is_water_source=true`, as well as the current park
   access policy. The server restores exactly 100 drops; never grants another
   pail or alters `quantity`, pet XP, or park reward ledgers. Clients may
   suggest a nearby station but server must validate that location/interaction
   consistently with the player scene and ensure repeated requests cannot
   create additional resources. Pails at 100 drops should not trigger a refill.
7. Grown-stage watering reaches harvest-ready state; Scythe harvest credits
   the owner's fruit inventory in a transaction. Yield is server-drawn:
   75% ×1, 20% ×2, 5% ×3. Harvest cannot be repeated during the 30-second
   `picked` cooldown; after it expires the plot returns to empty soil.
8. Harvested fruit is not purchasable by spoofing a shop item ID and
   uses the existing player-market listing / inventory transaction flow.
   Catalog seeds and harvests must remain correctly typed in Bag / Market.
9. Each player's crop state is per **(user, plot)**. No global crop resets and
   no shared water charges; all mutations use a serialized per-player/plot
   transaction with row locks and conditional inventory updates.
10. PC game pages remain locked. Preserve the existing park camera, scene
    depth, admin placement coordinates, mobile touch interaction, and scenes
    in existing ground themes; no legacy 390×844 reference stage.

## Delivery and acceptance

- **PR #997:** schema + additive pre-route migration, shared policies,
  Admin Garden controls and stage assets, new Paint Terrain Garden Plot,
  Water Source decoration toggle and Refillable watering-pail setting.
  Does not enable player actions.
- **PR #998 (merged):** Authenticated GET `/api/pet-park/garden` for
  private per-player plot states and ready crop artwork, and POST
  `/api/pet-park/garden/plots/:plotId/{hoe,plant,water,harvest}`.
  Each POST accepts only `{requestId: crypto.randomUUID(), inventoryId}`.
  `requestId` must be reused on a retry of the **same** operation; generate a
  new one for each intentional touch/drop. The server owns stage transitions,
  and a committed receipt replays the original result without repeated
  inventory changes. Receipts are pruned per-owner at later Hoe operations
  after seven days. This PR also narrows Water Source refills to actual
  refillable Watering Pails, preserves separate 100-drop pail inventory rows
  regardless of refill flag, and avoids touching listed market stacks.
  The real-Postgres regression suite exercises state transitions, idempotency,
  owner separation, concurrency, and harvest rewards. PR 2 does **not** expose
  the new controls to players yet.
- **PR 3 (this branch):** Player plot diamond hit targets and accessible
  four-direction radial action menu; owned/unlisted Seed Pack and tool picker
  using current Bag inventory; state-aware growth artwork and exact
  water-drop progress from the server; dark-brown tilled soil; picked fruit
  award with 30-second server cooldown; reuse of already-implemented Water
  Source refill dialog; phone/tablet browser smoke. The first dirt-path brown
  replaces the sand-colored untitled soil; every snapped tile retains all four
  individually visible edges, and tilled earth gains subtle dark furrows
  and flecks.
  Other players' outdoor pets, mini pets, rarity stars and hit areas now share
  one world-unit zoom transform (rather than mixing pre-scaled child
  dimensions with the camera scale). The Pet Park camera, scene model,
  persisted admin placements, existing terrain brush, and the PC Coming
  Soon restriction remain unchanged. No additional garden currency,
  inventory ledger, global crop state or 390×844 stage is introduced.
  PR 3 UI is disabled for admin preview and for players unable to enter the park.

### Regression matrix

- Empty/tilled/seedling/partial/grown/ready/picked stage correctness;
  stages need exact drops, no skips, and 100-drop consumption across reloads.
- Two concurrent harvests never give two rewards; double taps and mobile
  retries cannot double-consume seeds, water, or items.
- Refillable true vs false; Water Source true vs false; non-decor cannot be
  tagged; no permission to alter other players' pails or garden plots.
- Existing saved decor has false default and is not changed by migration;
  duplicating a tagged decoration retains the label.
- Existing park ground themes, paths, sleep animation, pet overlap handling,
  buildings, admin gestures and inventory/market transactions are unaffected.
- Retry response shape: `{ plot, replayed, remainingQuantity? , waterLeft?, reward? }`.
  `plot` contains `plotItemId, phase, cropId, waterApplied, harvestReady,
  pickedUntil`. GET returns `{ serverNow, plots, crops }`. A 409 means an
  already-completed or currently unavailable action, not permission to
  reapply a water drop. Refill remains on the existing Water Source endpoint.
- Exactly one unit of a Seed Pack is deducted from the unlisted inventory
  row; garden fruits join an unlisted stack or create a new row. The
  `garden_fruit` direct-shop purchase ban remains server-side.
- No legacy 390×844 rendering stage, alternate movement system, UI modal,
  or desktop gameplay gate change is part of the server transaction PR.
- Automated typecheck, Node tests, production build, and phone/tablet
  browser checks must be green on the eventual merged commit. Physical
  iOS Safari, Android, tablet visual/touch QA must be reported separately.

### PR 3 final real-device acceptance checks (not satisfied by CI alone)

- On a real iPhone, Android phone and tablet: tap the middle and each
  exposed edge of a snapped Garden Plot; dragging/pinching outside the
  diamond still pans/zooms the same Pet Park. A crop image must not steal
  hit-testing from the diamond or another player's pet.
- Observe the same two adjacent Garden Plot tiles before/after Hoe:
  four edges stay visible, untilled soil matches dirt path but is smoother
  with darker patches; tilled soil is visibly deeper brown with soft
  furrows and specks. Crop artwork stays centered above its own soil at
  every zoom level without visual clipping, blurring or occlusion errors.
- Complete Hoe → Seed Pack → configured water drops in all four phases →
  Scythe → Bag fruit → 30-second rest → Hoe again. Switching devices,
  opening/closing the menu and reloading must retain the authoritative
  plot state and pail charges; each press deducts exactly one drop.
- A pail at 0 must not water. Tapping a labeled Water Source must refill
  only eligible pails to 100, never an arbitrary flagged item. The server
  validates ownership; no plant/harvest on another player's plot state.
- Verify an actual other-player pet and its rarity stars grow when
  zooming in and shrink when zooming out at the same ratio as nearby
  buildings and terrain (both pinch directions), without breaking
  owner-only pet dragging, inspection, avatar overlays, mini pets or depth.
- Verify PC still displays Coming Soon without exposing gameplay.
- CI typecheck, integration tests, production build, and phone/tablet
  scripted browser smoke must all pass. If production smoke and
  physical-device testing disagree, keep the feature open for correction.
