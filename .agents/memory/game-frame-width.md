---
name: Game frame width
description: The real lever for the centered game width; why the 768px overlay caps are inert.
---

# Game frame width

The whole game renders inside `#game-stage`, a fixed design-size frame that is
uniformly scaled with `transform: scale(...)`. The authored width comes from
`client/src/lib/stage.ts`:
- `DESIGN_W = 390` — used on skinny screens (`window.innerWidth < WIDE_BREAKPOINT`, 768), e.g. Google Fold / narrow phones.
- `WIDE_DESIGN_W` — used on screens ≥ 768px (tablets / desktop / landscape).
- `getDesignW()` picks between them; `DESIGN_H = 844` is constant.

**To make the game wider/narrower on non-skinny screens, change `WIDE_DESIGN_W`.**
Leave `DESIGN_W` at 390 so folds/narrow phones stay pixel-faithful.

**Trap:** the ~65 `maxWidth: "768px"` inline styles on fixed overlays across
`client/src` do NOT control the visible width. Because `#game-stage` has a
`transform`, `position: fixed` descendants are contained by the stage (≤ ~470px
wide), so a 768px cap never binds. Editing those has zero visual effect — don't
go there to resize the frame.

**Why:** a request to "make the game a little wider" looks like it should touch
the 768px caps, but the only effective change is `WIDE_DESIGN_W` in stage.ts.
