import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldShowToastToPlayer, toast } from "../client/src/hooks/use-toast";
import { queryClient } from "../client/src/lib/queryClient";

const read = (path: string) => readFileSync(path, "utf8");

test("generic raw Failed popups are admin-only; useful errors still reach regular players", () => {
  assert.equal(shouldShowToastToPlayer("Failed", "destructive", false), false);
  assert.equal(shouldShowToastToPlayer("Failed", "destructive", true), true);
  assert.equal(shouldShowToastToPlayer("Failed", "default", false), true);
  assert.equal(shouldShowToastToPlayer("Failed to equip", "destructive", false), true);
  assert.equal(shouldShowToastToPlayer("Could not unlock adornment slot", "destructive", false), true);
  assert.equal(shouldShowToastToPlayer("Must hatch Egg first", undefined, false), true);
  assert.equal(shouldShowToastToPlayer("Insufficient coins", "destructive", false), true);
});

test("suppressed player diagnostic creates no flash or blocking toast surface", () => {
  const key = ["/api/auth/me"];
  const previous = queryClient.getQueryData(key);
  try {
    queryClient.setQueryData(key, { id: "player", isAdmin: false });
    // A server error may contain a raw HTTP status and JSON: it must never
    // reach showFlash/document or the toast queue for a regular player.
    assert.doesNotThrow(() => {
      const notification = toast({
        title: "Failed",
        description: '409: {"message":"This pet\'s evolution track is already complete"}',
        variant: "destructive",
      });
      notification.dismiss();
      notification.update({ description: "ignored" });
    });
  } finally {
    if (previous === undefined) queryClient.removeQueries({ queryKey: key, exact: true });
    else queryClient.setQueryData(key, previous);
  }
});

test("routine pet and closet confirmations stop obscuring artwork but data refresh remains", () => {
  const inventory = read("client/src/components/PetInventory.tsx");
  const costumes = read("client/src/components/PetCostumeEquipmentSection.tsx");
  const accessories = read("client/src/components/PetEquipAccessoriesPage.tsx");
  const hook = read("client/src/hooks/use-toast.ts");
  const toaster = read("client/src/components/ui/toaster.tsx");

  assert.doesNotMatch(inventory, /title: data\.activePetId \? "Pet Selected"/);
  assert.match(inventory, /onUserUpdate\(\{ activePetId: data\.activePetId \?\? null \}\)/);
  assert.match(inventory, /setQueryData\(\["\/api\/auth\/me"\]/);

  assert.doesNotMatch(costumes, /Adornment equipped!|Adornment slot unlocked for this pet!/);
  assert.match(costumes, /setUnlockSlot\(null\)/);
  assert.match(costumes, /refresh\(\)/);
  assert.match(costumes, /queryClient\.setQueryData<CostumeResponse>/);

  assert.doesNotMatch(accessories, /title: "Slot unlocked!"/);
  assert.match(accessories, /setUnlockConfirm\(false\)/);
  assert.match(accessories, /refreshAccessories\(\)/);

  // Keep the shared viewport-aligned host and the route-specific warnings.
  assert.match(toaster, /<ViewportModalPortal blocking=\{false\}>/);
  assert.match(hook, /if \(!shouldShowToastToPlayer\(props\.title, props\.variant, isAdmin\)\)/);
  assert.match(costumes, /Could not unlock adornment slot/);
  assert.match(accessories, /Could not unlock/);
});
