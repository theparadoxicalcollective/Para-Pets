import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootEntry = readFileSync("client/src/RootEntry.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const queryClient = readFileSync("client/src/lib/queryClient.ts", "utf8");
const worldNpc = readFileSync("client/src/components/WorldNpcPlacementOverlay.tsx", "utf8");
const npcDialogue = readFileSync("client/src/components/NpcQuestAwareDialogueBridge.tsx", "utf8");
const tabSync = readFileSync("client/src/lib/tabSync.ts", "utf8");

test("startup auth consumers share the React Query request", () => {
  assert.match(queryClient, /fetchAuthenticatedUserCached/);
  assert.match(rootEntry, /fetchAuthenticatedUser\(signal\)/);
  assert.match(app, /fetchAuthenticatedUser\(signal\)/);
  assert.match(worldNpc, /fetchAuthenticatedUserCached\(\)/);
  assert.match(npcDialogue, /fetchAuthenticatedUserCached\(\)/);
  assert.doesNotMatch(worldNpc, /fetch\("\/api\/auth\/me"/);
  assert.doesNotMatch(npcDialogue, /fetch\("\/api\/auth\/me"/);
});

test("tab synchronization releases its query-cache subscription", () => {
  assert.match(tabSync, /unsubscribeFromQueryCache = queryClient\.getQueryCache\(\)\.subscribe/);
  assert.match(tabSync, /unsubscribeFromQueryCache\?\.\(\)/);
  assert.match(tabSync, /unsubscribeFromQueryCache = null/);
});
