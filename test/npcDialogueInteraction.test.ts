import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const overlayPath = path.join(process.cwd(), "client/src/components/WorldNpcPlacementOverlay.tsx");
const source = fs.readFileSync(overlayPath, "utf8");

test("player NPC dialogue keeps its dedicated talk hitbox", () => {
  assert.match(source, /const canUsePlayerTalkHitbox = authResolved && !isAdmin/);
  assert.match(source, /data-testid={`button-talk-npc-\$\{loc\.id\}`}/);
  assert.match(source, /speakNpcMessage\(loc\.id, metadata\.messages\)/);
});

test("admins can trigger configured non-quest NPC dialogue without replacing the placement hotspot", () => {
  assert.match(source, /document\.addEventListener\("click", onAdminNpcClick, true\)/);
  assert.match(source, /admin-location-hotspot-/);
  assert.match(source, /getNpcQuestAssociations\(loc\.name, loc\.worldId\)\.length > 0/);
  assert.match(source, /metadata\.messages\.length === 0/);
  assert.match(source, /speakNpcMessage\(loc\.id, metadata\.messages\)/);
});

test("dragging an admin NPC does not also trigger dialogue", () => {
  assert.match(source, /lastDraggedNpcRef\.current = \{ locationId: drag\.locationId, at: Date\.now\(\) \}/);
  assert.match(source, /Date\.now\(\) - lastDrag\.at < 400/);
});
