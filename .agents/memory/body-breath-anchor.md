---
name: Body-breath transform-origin anchor
description: How body-attached parts (shoulders, neck, flippers...) stay glued to the body during scale-breath cycles across idle/petting/sleep.
---

# Body-breath transform-origin anchor

In `client/src/components/PetAnimator.tsx`, any part that "breathes with the
body" (scales) must scale around the SAME world point as the body, or it drifts
off the torso. The body anchors at the feet (`50% 100%`) for ground pets and at
its hover pivot for flying pets.

The mechanism: `bodyAnchorWorldX/Y` is computed once from the body part, then
`renderPartImg` converts it into each dependent part's own local %-of-box and
applies it as `transform-origin` — but ONLY when `isBodyBreathAnim(animName)` is
true. The same predicate also phase-locks those parts to `bodyBreathDelay`.

**Rule:** if you add a NEW keyframe that scales a body-attached part, add it to
`isBodyBreathAnim` too, or it will scale around its own bbox center and detach.

**Why:** breathing exists in three modes with three different scale keyframes —
idle (`petIdleBody` + arm/flipper variants), petting (`petPettingBody`), sleep
(`petSleepBody`). They are easy to add to the animation maps but easy to forget
in `isBodyBreathAnim`; petting/sleep were initially missed, so shoulders swelled
off the body only while being petted / sleeping.

**How to apply:** the body part itself is excluded from the origin override
(`part.partType !== "body"`) because it carries its own `"50% 100%"`
transformOriginOverride from the render loop — so adding a body scale keyframe to
`isBodyBreathAnim` only re-anchors the dependent parts, never double-applies to
the body. Rotation-only sways (`petIdleSideShoulder`, `petIdleAccessorySway`)
intentionally stay OUT — they don't scale, so they don't need the anchor.
