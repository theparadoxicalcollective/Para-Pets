---
name: WorldPage inline style injection crash
description: Inline <style> blocks inside JSX re-inject keyframes into the DOM on every render, causing iOS Safari WebKit OOM crash.
---

## The rule
**Never put `@keyframes` inside inline `<style>` tags in JSX.** All animation keyframes must live in `index.css` (or another static CSS file), not in `<style>{`...`}</style>` blocks inside a React component's render output.

**Why:** On every state change (tap, click, scroll event), React re-renders the component tree. Any `<style>` element inside JSX gets re-injected into the DOM as a new `<style>` node. Browsers — especially iOS Safari's WebKit — do not deduplicate inline `<style>` elements. Over time, dozens then hundreds of identical `@keyframes` rules accumulate in the style engine. iOS Safari has strict per-tab memory limits and will kill the WebKit renderer process with "A problem repeatedly occurred on [URL]" when this memory pressure builds up.

**How to apply:**
- When adding new world animations, put `@keyframes` in `index.css` under the `/* ── WorldPage keyframes ── */` section.
- The one safe exception: a tiny `<style>` with 1-2 *non-keyframe* rules that depend on a runtime JS value (e.g., scrollbar thumb color using `${accent}`). These are harmless because they contain no looping animation definitions.
- Never put `filter: blur(N)` on an **infinitely-animated** element unless N < 2px. Large blur values (14px, 16px) on animated elements force per-frame GPU compositing on iOS and compound the memory pressure.

**Discovery:** parapets.net/world/volcanic showed "A problem repeatedly occurred" on iOS Safari with white/black screen flashes before the crash. WorldPage had 7 inline `<style>` blocks containing ~35 `@keyframes` definitions, all re-injected on every interaction.

**Resolution:** Moved all 35 keyframes to `index.css`. Left only a 1-line scrollbar-color `<style>` that uses `${accent}`. Removed `filter: blur(16px/14px)` from two infinitely-animated lava glow divs in the volcanic fishing shop.
