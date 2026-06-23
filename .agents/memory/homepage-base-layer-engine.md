---
name: HomePage base layer & pet-animation engine
description: Why HomePage must stay mounted under overlays, and how to stop its heavy engine instead of unmounting it.
---

# HomePage base layer & pet-animation engine

HomePage is **statically imported** (not lazy) and rendered as a permanently
mounted base layer in `client/src/App.tsx`. Every other game page (map, bag,
shop, and the `/world/*` pages) renders as an absolute overlay on top of it;
HomePage's own content is hidden behind the overlay via the `isOverlayActive`
prop (`visibility: hidden`).

**Do NOT "fix" things by unmounting HomePage while an overlay/world is open.**
HomePage is a very large tree (PetAnimator canvas + many effects). Unmounting it
on navigation and remounting it on return causes the home screen to rebuild and
render **partially/slowly**, and the synchronous unmount/remount of that huge
tree janks the incoming page too — so *both* worlds and home feel slow and show
partial content. (Tried this; it regressed loading badly.)

**The real cost is the pet-animation engine, not the mount.** `PetAnimator` →
`PetAnimatorCanvas` runs a continuous 60fps `requestAnimationFrame` draw loop
with **no pause-when-hidden**. Left running underneath an open overlay it burns
CPU continuously — the suspected cause of world-entry glitches/crashes and of
slowdowns across the app.

**Correct fix:** keep HomePage mounted, and stop the engine while
`isOverlayActive` — gate the `<PetAnimator>` render with `!isOverlayActive` (a
static pet image is the hidden fallback, so there's no visible change). This
fixes the crash/CPU-contention without the remount/partial-render penalty.

**Why:** keeping the base layer mounted is what makes back-to-home instant and
flash-free (see replit.md). Pausing only the rAF engine gets the CPU win without
giving up that property.
