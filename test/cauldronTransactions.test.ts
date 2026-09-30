import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("server/cauldron/transactions.ts", "utf8");

function functionBody(name: string, nextName?: string): string {
  const start = service.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = nextName ? service.indexOf(`export async function ${nextName}`, start) : service.length;
  return service.slice(start, end >= 0 ? end : service.length);
}

test("all value-moving Cauldron operations run inside database transactions", () => {
  assert.equal(service.split("db.transaction(async (tx)").length - 1, 3);
  for (const name of ["addCauldronIngredient", "clearCauldronContents", "brewCauldron"]) {
    assert.match(functionBody(
      name,
      name === "addCauldronIngredient"
        ? "clearCauldronContents"
        : name === "clearCauldronContents"
          ? "brewCauldron"
          : undefined,
    ), /db\.transaction\(async \(tx\)/);
  }
});

test("add, clear, and brew serialize per player before moving value", () => {
  assert.match(service, /pg_advisory_xact_lock\(hashtext/);
  for (const body of [
    functionBody("addCauldronIngredient", "clearCauldronContents"),
    functionBody("clearCauldronContents", "brewCauldron"),
    functionBody("brewCauldron"),
  ]) {
    assert.match(body, /await lockPlayerCauldron\(tx,/);
  }
});

test("adding an ingredient consumes inventory and records Cauldron contents in one boundary", () => {
  const add = functionBody("addCauldronIngredient", "clearCauldronContents");
  assert.match(add, /FOR UPDATE OF ui/);
  assert.match(add, /tryConsumeOneFromInventory\(tx, input\.userId, input\.inventoryId\)/);
  assert.match(add, /await writeContents\(tx, input\.userId, contents\)/);
  assert.ok(
    add.indexOf("tryConsumeOneFromInventory") < add.indexOf("writeContents"),
    "inventory must be consumed before the Cauldron is credited inside the same transaction",
  );
});

test("clearing returns every ingredient before atomically emptying the Cauldron", () => {
  const clear = functionBody("clearCauldronContents", "brewCauldron");
  assert.match(clear, /SET quantity = quantity \+ \$\{entry\.quantity\}/);
  assert.match(clear, /INSERT INTO user_inventory \(user_id, shop_item_id, quantity\)/);
  assert.match(clear, /await writeContents\(tx, userId, \[\]\)/);
  assert.ok(
    clear.indexOf("SET quantity = quantity +") < clear.lastIndexOf("writeContents"),
    "returned inventory must be written before the Cauldron is cleared",
  );
});

test("brew debit, result award, and Cauldron clear share one transaction", () => {
  const brew = functionBody("brewCauldron");
  assert.match(brew, /UPDATE users[\s\S]*?SET coins = coins - \$\{BREW_COST\}/);
  assert.match(brew, /WHERE id = \$\{userId\} AND coins >= \$\{BREW_COST\}/);
  assert.match(brew, /SET quantity = quantity \+ 1/);
  assert.match(brew, /INSERT INTO user_inventory \(user_id, shop_item_id, quantity\)/);
  assert.match(brew, /await writeContents\(tx, userId, \[\]\)/);

  const debit = brew.indexOf("SET coins = coins -");
  const award = Math.max(brew.indexOf("SET quantity = quantity + 1"), brew.indexOf("INSERT INTO user_inventory"));
  const clear = brew.lastIndexOf("writeContents");
  assert.ok(debit >= 0 && award > debit && clear > award, "brew writes must stay debit -> award -> clear");
});

test("brew validates recipe and unlock state before charging coins", () => {
  const brew = functionBody("brewCauldron");
  const recipe = brew.indexOf("FROM mixing_tree_recipes");
  const unlock = brew.indexOf("FROM player_unlocked_recipes");
  const debit = brew.indexOf("SET coins = coins -");
  assert.ok(recipe >= 0 && unlock > recipe && debit > unlock);
});

test("transaction service does not escape to non-transactional storage writes", () => {
  assert.doesNotMatch(service, /storage\./);
  assert.doesNotMatch(service, /database\.execute/);
  assert.match(service, /tryConsumeOneFromInventory\(tx,/);
});
