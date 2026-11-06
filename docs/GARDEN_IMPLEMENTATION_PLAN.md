# Garden feature — Para Pets

**Status:** PR #997 is the initial Admin Realm/catalog/plot foundation. Do not
mark the Garden feature resolved until the following server/player PRs and
physical mobile/tablet testing have been completed.

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
- **PR 2:** Authenticated garden state read and idempotent hoe/plant/water/
  refill/harvest API, exact inventory accounting (including stack and market
  listings), fully validated owner and plot, deterministic transaction tests
  and abuse/concurrency scenarios.
- **PR 3:** Player-side park plot hit targets, radial menu, seed picker,
  growth artwork, refill action, fruit award overlay, 30-second reset,
  mobile/tablet browser smoke checks and marketplace/Bag integration QA.

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
- Automated typecheck, Node tests, production build, and phone/tablet
  browser checks must be green on the eventual merged commit. Physical
  iOS Safari, Android, tablet visual/touch QA must be reported separately.
