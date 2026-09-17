import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fromRoot = (...segments: string[]) => path.join(repoRoot, ...segments);

test("the optional desktop Hub companion is completely removed", () => {
  const app = readFileSync(fromRoot("client", "src", "App.tsx"), "utf8");
  const stageCss = readFileSync(fromRoot("client", "src", "tabletStageShell.css"), "utf8");

  assert.doesNotMatch(app, /desktop-hub-companion/);
  assert.doesNotMatch(app, /desktopCompanion/);
  assert.doesNotMatch(app, /title="Para Pets Hub"/);
  assert.doesNotMatch(stageCss, /desktop-hub-companion/);
  assert.equal(existsSync(fromRoot("client", "src", "lib", "desktopCompanion.ts")), false);
});

test("the normal Hub route, artwork button, and themed scrollbar remain", () => {
  const app = readFileSync(fromRoot("client", "src", "App.tsx"), "utf8");
  const auth = readFileSync(fromRoot("client", "src", "pages", "AuthPage.tsx"), "utf8");
  const hub = readFileSync(fromRoot("client", "src", "pages", "ParaPetsHubPage.tsx"), "utf8");
  const indexCss = readFileSync(fromRoot("client", "src", "index.css"), "utf8");

  assert.match(app, /<Route path="\/hub"><ParaPetsHubPage \/><\/Route>/);
  assert.match(auth, /onActivate=\{\(\) => setLocation\("\/hub"\)\}/);
  assert.match(hub, /para-pets-hub-scrollbar fixed inset-0 overflow-y-auto/);
  assert.match(indexCss, /\.para-pets-hub-scrollbar::\-webkit-scrollbar-thumb/);
  assert.match(indexCss, /scrollbar-color: #a88432 #07150f/);
});

test("sign-in landing spacing and Hub button use the refined proportions", () => {
  const css = readFileSync(fromRoot("client", "src", "pages", "authPage.css"), "utf8");

  assert.match(css, /margin-top: clamp\(26px, calc\(4\.2 \* var\(--vh\)\), 40px\)/);
  assert.match(css, /width: min\(64%, 240px\)/);
  assert.match(css, /margin-top: clamp\(8px, calc\(1\.4 \* var\(--vh\)\), 14px\)/);
});


test("the Hub introduces the game and optional purchases before Realm Benefactors", () => {
  const hub = readFileSync(fromRoot("client", "src", "pages", "ParaPetsHubPage.tsx"), "utf8");

  const aboutUsage = hub.lastIndexOf("<AboutSection />");
  const benefactorsUsage = hub.lastIndexOf("<ContributionLeaderboard");

  assert.ok(aboutUsage >= 0, "About the Game section should render on the Hub");
  assert.ok(benefactorsUsage > aboutUsage, "About the Game should appear before Realm Benefactors");
  assert.match(hub, />\s*About the Game\s*</);
  assert.match(hub, />\s*Optional In-Game Purchases\s*</);
  assert.match(hub, /You can enjoy Para Pets without paying/);
  assert.match(hub, /secure\s+Stripe checkout/);
  assert.match(hub, /there are no physical goods or shipping/);
  assert.match(hub, /data-testid="link-about-coin-shop"/);
});


test("signed-out visitors can browse coin packs but checkout still requires authentication", () => {
  const app = readFileSync(fromRoot("client", "src", "App.tsx"), "utf8");
  const coinShop = readFileSync(fromRoot("client", "src", "pages", "CoinShopPage.tsx"), "utf8");
  const routes = readFileSync(fromRoot("server", "routes.ts"), "utf8");

  assert.match(app, /<Route path="\/coins"><CoinShopPage user=\{user \?\? null\} \/><\/Route>/);
  assert.match(coinShop, /user: CoinShopUser \| null/);
  assert.match(coinShop, /if \(!user\) \{\s*navigate\("\/auth"\);\s*return;/);
  assert.match(coinShop, /Sign In to Purchase/);
  assert.match(coinShop, /queryKey: \["\/api\/coins\/packs", user\?\.id \?\? "guest"\]/);
  assert.match(coinShop, /: `\$\$\{pack\.priceUsd\}`/);
  assert.match(routes, /app\.get\("\/api\/coins\/packs", async \(req, res\) =>/);
  assert.match(routes, /app\.post\("\/api\/coins\/checkout", isAuthenticated/);
});


test("Daily Rewards stays visible to guests and Redeem Code replaces Founder's Wall", () => {
  const hub = readFileSync(fromRoot("client", "src", "pages", "ParaPetsHubPage.tsx"), "utf8");
  const daily = readFileSync(fromRoot("client", "src", "components", "DailyClaimCard.tsx"), "utf8");

  const dailyUsage = hub.lastIndexOf("<DailyClaimCard");
  const noticeUsage = hub.lastIndexOf("<NoticeCarousel");
  const benefactorsUsage = hub.lastIndexOf("<ContributionLeaderboard");
  const redeemUsage = hub.lastIndexOf("<RedeemCodeCard");
  const guardiansUsage = hub.lastIndexOf("Game Guardians");

  assert.ok(dailyUsage >= 0 && dailyUsage < noticeUsage, "Daily Rewards should occupy the former top redeem-code position");
  assert.ok(redeemUsage > benefactorsUsage && redeemUsage < guardiansUsage, "Redeem Code should occupy the former Founder's Wall position");
  assert.doesNotMatch(hub, /link-founders|paradoxStatue|Founder's Wall/);
  assert.match(hub, /onSignInRequest=\{\(\) => setShowSignIn\(true\)\}/);
  assert.match(daily, /data-testid="button-daily-sign-in"/);
  assert.match(daily, /dailyStatusKey = \["\/api\/daily-claim\/status", user\?\.id \?\? "guest"\]/);
  assert.match(daily, /setQueryData<ClaimStatus>\(dailyStatusKey/);
  assert.doesNotMatch(daily, /if \(!user\) return null/);
});
