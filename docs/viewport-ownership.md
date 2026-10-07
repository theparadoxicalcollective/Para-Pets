# Viewport ownership contract

Para Pets keeps **390 × 844 (iPhone 12)** as the authored/admin coordinate reference. Larger devices may expose more camera area, but must not rewrite saved coordinates.

Use exactly one owner for each visual responsibility:

| Owner | Use for | Input |
| --- | --- | --- |
| Backdrop | scenery behind canonical gameplay | none |
| Page | normal authenticated route presentation | route-owned |
| Scene | worlds/maps that need a larger interactive camera | optional |
| HUD | persistent controls/action wheels | controls only |
| Modal | blocking dialogs/temporary full-screen subpages | blocking |

## Rules

1. Do not solve screen transitions with CSS selectors that hide a previous screen. The newer screen must own the correct layer.
2. Do not portal one screen's background and foreground to different owners unless the split is intentional. A blocking screen such as Aquarium should own its complete visible presentation together.
3. Do not use `document.body` for normal gameplay UI. It is reserved for truly global browser-viewport UI such as the startup LoadingScreen.
4. Do not widen the 390×844 authored coordinate plane just to fill a tablet. Use Backdrop or Scene ownership for additional visible area.
5. Native phone fallback must remain inline when an expanded viewport host does not exist.
6. Admin-authored positions, fish percentages, NPC/world positions, quest targets, and pet placement remain expressed in their existing canonical coordinate systems.

When adding a new screen, choose its owner first. Avoid page-specific z-index escalation; shared ordering lives in `lib/viewportOwnership.ts`.
