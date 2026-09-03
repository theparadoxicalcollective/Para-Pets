# Raid bosses and independent adornments

## Change a raid boss

Use **Change Boss** beside the active boss, choose a pet template, set Max HP and
Starting HP, and save. There is no need to clear the previous boss first.
Starting HP may be zero; both fields accept whole numbers and Starting HP cannot
exceed Max HP. Saving starts a new raid and resets the raid leaderboard, as the
existing boss-selection flow did.

Selection, HP, attack-default initialization, defeat-lock reset, and leaderboard
reset use one database transaction. A failed replacement leaves the old raid
configuration intact. The admin route validates the request and the template
before writing, and duplicate saves are blocked while a request is pending.
Clearing the boss also clears its HP. The older HP-only endpoint is retained for
compatibility with already-open clients.

Home, raid preparation, and raid battle displays explicitly request evolution
parts. Evolution artwork is selected as a whole, using an available view. If no
usable evolution parts exist, regular parts are returned. Evolution and regular
artwork use separate cache keys; creating, editing, or removing parts invalidates
the server cache. Regular player pets continue requesting regular parts.

## Fit an adornment

New fittings start with an **independent placement** in the same 1000×1000 canvas
as the pet. Drag, resize, rotate, flip, and choose front/behind layering as before.
The fitting does not need a pet part to exist and does not inherit limb movement.

Choose an animation: Still, Breathe, Subtle float, Wings (mirrored pair), Sway,
or Slow rotation. Slow/Normal/Lively adjusts speed. The pivot controls the motion
origin; moving it preserves the artwork's top-left position. **Preview motion**
shows the same artwork component used by players and pauses while dragging.
Reduced-motion preferences and static rendering disable animation.

Selecting **Wings** reveals an optional **Mirrored wing image** upload. Upload the
opposite-facing wing as it should appear, using the same canvas size and padding
as the first wing. The uploaded drawing keeps its orientation while the pair
flaps in sync. Without an upload, the first image is mirrored automatically.
**Remove image** restores that automatic mirror. Adjust the pivot to the wing's
root and optionally enable **Hide the pet's original wings**. The pair does not
consume another visual duplicate or inventory copy.

The upload belongs to the selected pet template, view, and fitted copy. Preview
and replacement stay local until **Save placement**. The admin-only save validates
PNG content and a 20MB limit, then decodes, resizes (at most 2000×2000), and
re-encodes through the existing media pipeline. Only the resulting server media
URL is stored in placement JSON. Saved wing artwork is retained if you temporarily
choose another motion, and is displayed again when you select Wings.

Existing part-attached fittings retain their positions and movement. Choose
**Use independent placement** to convert a fitting, then select its movement and
save. Conversion preserves the position shown in the fitting editor. Front and
side views and each visual copy are still fitted separately. Changes remain local
until **Save placement** is pressed; discarding restores the saved fitting.

Animation options are bounded and validated in the existing placement JSON;
there are no new database tables or schema migrations. Independent fittings can
share the canvas; existing inventory ownership, occupied-slot, and copy-count
checks remain in force. Legacy part-attached fittings still enforce their part
conflict rule.

Player adornments share the renderer's measured canvas transform, including
visible-art fitting, so device scaling applies to the pet and adornments together.
Motion uses CSS rather than per-frame React state or additional network requests.
