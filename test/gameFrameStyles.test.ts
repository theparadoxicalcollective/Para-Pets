import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { transformFrameSource } from "../script/gameFrameSource";
const { frameStylesheet, frameUnits } = createRequire(import.meta.url)("../script/gameFrameCss.cjs");

test("viewport dimensions resolve through frame variables with ordinary viewport fallbacks", () => {
  assert.equal(frameUnits("100dvh"), "calc(100 * var(--vh, 1vh))");
  assert.equal(frameUnits("50vw"), "calc(50 * var(--vw, 1vw))");
  assert.equal(frameUnits("url(/images/100vh.png)"), "url(/images/100vh.png)");
  assert.match(frameStylesheet(":root{--vh:1vh}.panel{height:100dvh}"), /--vh:1vh/);
});

test("desktop breakpoints cannot rearrange descendants of the phone canvas", () => {
  const css = frameStylesheet("@media (min-width:640px){.grid{grid-template-columns:repeat(3,1fr)}}");
  assert.match(css, /@media \(max-width: 0px\)/);
  assert.match(css, /:where\(#game-stage \*\)/);
  assert.match(css, /:where\(:not\(#game-stage, #game-stage \*\)\)/);
  assert.match(css, /@media \(min-width:640px\)/);
});

test("phone CSS remains active in the canvas on wide screens and pseudo elements stay valid", () => {
  const css = frameStylesheet("@media (max-width:767px){.card::before{width:80vw}}");
  assert.match(css, /@media \(min-width: 0px\)/);
  assert.match(css, /:where\(#game-stage \*\)::before/);
});

test("motion preferences and keyframe selectors retain their meaning", () => {
  const css = frameStylesheet("@media (prefers-reduced-motion:reduce){.pet{animation:none}} @keyframes a{0%{top:20vh}}");
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /0%:where/);
});

test("inline style conversion leaves classes, URLs, and JavaScript screen detection alone", () => {
  const source = 'const media = window.matchMedia("(max-width: 100vw)"); const el=<div className="h-[100dvh]" style={{height:"100dvh",background:"url(/100vh.png)"}} />;';
  const out = transformFrameSource(source, "example.tsx");
  assert.match(out, /className="h-\[100dvh\]"/);
  assert.match(out, /matchMedia\("\(max-width: 100vw\)"\)/);
  assert.match(out, /height:"calc\(100 \* var\(--vh, 1vh\)\)"/);
  assert.match(out, /url\(\/100vh.png\)/);
});
