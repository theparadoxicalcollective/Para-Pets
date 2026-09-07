import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shared = readFileSync("shared/hauntedCasino.ts", "utf8");
const server = readFileSync("server/hauntedCasino.ts", "utf8");
const polish = readFileSync("client/src/components/world/CasinoMobilePolish.css", "utf8");
const main = readFileSync("client/src/main.tsx", "utf8");

test("Slaughter Slots exposes stakes through 10k but keeps server wallet enforcement", () => {
  assert.match(shared, /HAUNTED_CASINO_BETS\s*=\s*\[[^\]]*5000,\s*10000\]/s);
  assert.match(server, /HAUNTED_CASINO_BETS\.includes\(bet as any\)/);
  assert.match(server, /Number\(user\.coins \?\? 0\) < bet/);
  assert.match(server, /SET coins = coins - \$\{bet\} \+ \$\{reward\.coins\}/);
});

test("Ginny is a rare live-NPC reel symbol with bounded coin rewards", () => {
  assert.match(shared, /\| "ginny"/);
  assert.match(shared, /id: "ginny", weight: 4/);
  assert.match(server, /type = 'npc'[\s\S]*world_id = '__npc_catalog__'[\s\S]*lower\(name\) LIKE 'ginny%'/);
  assert.match(server, /if \(ginnyImageUrl\) available\.add\("ginny"\)/);
  assert.match(server, /const multiplier = 3 \+ randomInt\(4\)/);
  assert.match(server, /coins: bet \* multiplier/);
});

test("configured egg art is shown directly instead of a mystery question mark", () => {
  assert.match(server, /label: eggPreview \? `Pet Egg · \$\{eggPreview\.name\}` : "Pet Egg"/);
  assert.match(server, /imageUrl: eggPreview\?\.egg_image_url \?\? null/);
  assert.match(polish, /span\[aria-hidden="true"\][\s\S]*display: none !important/);
  assert.match(polish, /img\[alt\*="Egg ·"\]/);
});

test("mobile Bingo keeps the rival side rail visible and separates the top controls", () => {
  assert.match(polish, /grid-template-columns: 38% 62%/);
  assert.match(polish, /padding-right: 54px/);
  assert.match(polish, /\.haunted-bingo-rivals[\s\S]*right: 0/);
  assert.match(polish, /\.haunted-bingo-call-zone[\s\S]*left: 0/);
  assert.match(polish, /\.haunted-bingo-cage[\s\S]*width: min\(29vw, 122px\)/);
  assert.match(main, /components\/world\/CasinoMobilePolish\.css/);
});
