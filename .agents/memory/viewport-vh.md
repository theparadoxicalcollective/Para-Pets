---
name: Viewport height CSS variable (--vh)
description: --vh is used in 20+ places but was never set — only --fh was. Fixes required for iOS Safari.
---

## The rule
Always set both `--fh` **and** `--vh` in `App.tsx`. They must be updated together on every `resize` event.

```typescript
const update = () => {
  const h = window.innerHeight;
  document.documentElement.style.setProperty("--fh", `${h}px`);
  document.documentElement.style.setProperty("--vh", `${h * 0.01}px`);
};
```

`--fh` = full viewport height in px (used for `h-screen-frame`).  
`--vh` = 1/100th of viewport height, so `calc(85 * var(--vh))` = 85% of real viewport.

**Why:** The app uses `--vh` in 20+ places (shop modal max-heights, WorldLoadingScreen ember keyframe `translateY(calc(-75*var(--vh)))`). Without it, all those `calc()` expressions are invalid CSS. On desktop Chrome this is silently ignored; on iOS Safari the ember animation is visually broken (embers don't float upward) and modal heights overflow.

**How to apply:** If adding any new height-constrained overlay or animation that needs viewport-relative sizing, use `var(--vh)` for the unit. Never hardcode `vh` units directly — iOS Safari's address bar causes `100vh` to exceed the visible area; `--vh` is computed from `window.innerHeight` which already accounts for this.

**Discovery:** Volcanic world loading screen looked "glitchy" on iOS. Root cause: `wls-ember` keyframe used `translateY(calc(-75*var(--vh)))` but `--vh` was undefined → transform invalid → embers appeared stationary at bottom.
