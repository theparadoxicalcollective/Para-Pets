import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("client/index.html", "utf8");
const manifest = JSON.parse(readFileSync("client/public/manifest.json", "utf8"));
const robots = readFileSync("client/public/robots.txt", "utf8");
const sitemap = readFileSync("client/public/sitemap.xml", "utf8");

test("public Para Pets metadata keeps search copy professional and social copy game-like", () => {
  assert.match(html, /<title>Para Pets \| Fantasy Creature-Collecting RPG<\/title>/);
  assert.match(html, /name="description" content="Para Pets is a free browser-based fantasy creature-collecting RPG\./);
  assert.match(html, /property="og:title" content="Para Pets — Hatch What You Find"/);
  assert.match(html, /The eggs are waiting\. What hatches is only the beginning\./);
  assert.match(html, /name="twitter:card" content="summary"/);
});

test("shared-link previews use the same masked-angel artwork as the installed web app", () => {
  assert.match(html, /property="og:image" content="https:\/\/www\.parapets\.net\/pwa-icon-512\.png"/);
  assert.match(html, /name="twitter:image" content="https:\/\/www\.parapets\.net\/pwa-icon-512\.png"/);
  assert.match(html, /property="og:image:width" content="512"/);
  assert.match(html, /property="og:image:height" content="512"/);
  assert.match(html, /property="og:image:type" content="image\/png"/);
  assert.match(robots, /Allow: \/pwa-icon-512\.png/);
});

test("structured search metadata is game-first and avoids platform-builder branding", () => {
  assert.match(html, /"@type": "VideoGame"/);
  assert.match(html, /"@type": "WebSite"/);
  assert.match(html, /"thumbnailUrl": "https:\/\/www\.parapets\.net\/pwa-icon-512\.png"/);
  assert.match(html, /"publisher": \{/);
  assert.doesNotMatch(html, /Replit/i);
  assert.doesNotMatch(html, /ChatGPT/i);
  assert.doesNotMatch(html, /OpenAI/i);
  assert.equal(manifest.name, "Para Pets");
  assert.match(manifest.description, /fantasy creature-collecting RPG/);
  assert.match(sitemap, /<loc>https:\/\/www\.parapets\.net\/hub<\/loc>[\s\S]*<lastmod>2026-10-03<\/lastmod>/);
});
