import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { claimFirstCardReward, grantBundleCards, parseBundleCards } from "../server/cards";
import { cardAdminValidation, serializeCard } from "../server/routes/cardAdmin.routes";

function fixture() {
  const dialect = new PgDialect();
  let state = { coins: 25, earned: 5, quantity: 2, claimed: false };
  let queue: Promise<unknown> = Promise.resolve();
  let failCredit = false;
  const tx = {
    async execute(query: any) {
      const { sql, params: p } = dialect.sqlToQuery(query);
      if (sql.includes("SELECT id FROM users")) return { rows: p[0] === "player" ? [{ id: "player" }] : [] };
      if (sql.includes("UPDATE user_cards")) {
        assert.match(sql, /quantity > 0 AND first_reward_claimed_at IS NULL/);
        if (p[0] !== "player" || p[1] !== "card" || state.quantity <= 0 || state.claimed) return { rows: [] };
        state.claimed = true;
        return { rows: [{ card_id: "card" }] };
      }
      if (sql.includes("UPDATE users")) {
        assert.match(sql, /total_coins_earned = total_coins_earned \+/);
        assert.equal(p[2], "player");
        if (failCredit) throw new Error("credit failed");
        state.coins += Number(p[0]); state.earned += Number(p[1]);
        return { rows: [{ coins: state.coins }] };
      }
      if (sql.includes("INSERT INTO user_cards")) {
        assert.match(sql, /ON CONFLICT \(user_id, card_id\) DO UPDATE/);
        assert.match(sql, /quantity = user_cards.quantity \+ EXCLUDED.quantity/);
        assert.doesNotMatch(sql, /SET[\s\S]*first_reward_claimed_at/);
        assert.deepEqual(p, ["player", "bundle"]);
        state.quantity += 3;
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const db = {
    transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const result = queue.then(async () => {
        const before = { ...state };
        try { return await fn(tx); } catch (error) { state = before; throw error; }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  return { db: db as any, tx: tx as any, state: () => state, fail: (value: boolean) => { failCredit = value; } };
}

test("first collection pays exactly 100 coins once across concurrent requests", async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 12 }, () => claimFirstCardReward(f.db, "player", "card")));
  assert.equal(results.filter(result => result.claimed).length, 1);
  assert.deepEqual(f.state(), { coins: 125, earned: 105, quantity: 2, claimed: true });
});

test("unowned cards and other users cannot claim a first-card reward", async () => {
  const f = fixture();
  assert.equal((await claimFirstCardReward(f.db, "player", "not-owned")).claimed, false);
  assert.equal((await claimFirstCardReward(f.db, "other-player", "card")).claimed, false);
  f.state().quantity = 0;
  assert.equal((await claimFirstCardReward(f.db, "player", "card")).claimed, false);
  assert.equal(f.state().coins, 25);
});

test("failed coin credit rolls back the claim and a retry succeeds", async () => {
  const f = fixture(); f.fail(true);
  await assert.rejects(claimFirstCardReward(f.db, "player", "card"), /credit failed/);
  assert.equal(f.state().claimed, false);
  assert.equal(f.state().coins, 25);
  f.fail(false);
  assert.equal((await claimFirstCardReward(f.db, "player", "card")).coinsAwarded, 100);
});

test("duplicate card awards stack without unlocking another first-collection reward", async () => {
  const f = fixture();
  await claimFirstCardReward(f.db, "player", "card");
  await f.db.transaction((tx: any) => grantBundleCards(tx, "player", "bundle"));
  assert.equal(f.state().quantity, 5);
  assert.equal((await claimFirstCardReward(f.db, "player", "card")).claimed, false);
  assert.equal(f.state().coins, 125);
});

test("bundle card input combines duplicates and rejects invalid quantities", () => {
  assert.deepEqual(parseBundleCards(undefined), []);
  assert.deepEqual(parseBundleCards([{ cardId: "a", quantity: 2 }, { cardId: "a", quantity: 3 }]), [{ cardId: "a", quantity: 5 }]);
  for (const quantity of [0, -1, 1.5, 1000, "2", NaN]) assert.throws(() => parseBundleCards([{ cardId: "a", quantity }]));
  assert.throws(() => parseBundleCards([{ cardId: "a", quantity: 999 }, { cardId: "a", quantity: 1 }]));
  assert.throws(() => parseBundleCards([{ cardId: "", quantity: 1 }]));
});

test("second descriptions preserve line breaks and old cards fall back to an empty value", () => {
  assert.equal(cardAdminValidation.descriptionText("  Story\n\nMore story  ", 10000), "Story\n\nMore story");
  assert.throws(() => cardAdminValidation.descriptionText("x".repeat(10001), 10000));
  assert.throws(() => cardAdminValidation.descriptionText("x".repeat(601)));
  assert.equal(serializeCard({ id: "old", rarity: 1 }).secondDescription, "");
  assert.equal(serializeCard({ id: "new", rarity: 1, second_description: "Full story" }).secondDescription, "Full story");
});


test("admin reward pickers integrate cards with the normal reward categories", () => {
  const admin = readFileSync("client/src/pages/AdminPage.tsx", "utf8");
  const picker = readFileSync("client/src/components/ItemDatabaseSection.tsx", "utf8");
  const redeemAdmin = readFileSync("client/src/components/RedeemCodeAdminPanel.tsx", "utf8");
  const redeemRoutes = readFileSync("server/routes/redeemCode.routes.ts", "utf8");

  assert.doesNotMatch(admin, /<RewardCardPicker/);
  assert.match(admin, /title="Select Reward"/);
  assert.match(admin, /cards=\{rewardCards\.filter/);
  assert.match(admin, /onSelectCard=\{\(card\) =>/);
  assert.match(admin, /Rewards \(\{selectedItems\.length \+ selectedCards\.length\} types/);

  assert.match(picker, /key: "cards" as const, label: "Cards"/);
  assert.match(picker, /activeCategory.*"cards"/);
  assert.match(picker, /button-pick-card-/);
  assert.match(picker, /Card · \{"★"\.repeat\(card\.rarity\)\}/);

  assert.match(redeemAdmin, /title="Select Code Reward"/);
  assert.match(redeemAdmin, /cards=\{cardCatalog\.filter/);
  assert.match(redeemAdmin, /cards: cards\.map/);
  assert.match(redeemRoutes, /parseBundleCards\(req\.body\?\.cards\)/);
  assert.match(redeemRoutes, /INSERT INTO reward_bundle_cards/);
});
