import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fromRoot = (...segments: string[]) => path.join(repoRoot, ...segments);

const artwork = [
  "PawPrintDecorDivider.png",
  "ParaPetsTitleLogo.png",
  "SignInPageBG.png",
  "ParaPetsHubButton.png",
  "CreateAccount.png",
  "SignIn.png",
  "DecorDivider.png",
] as const;

test("sign-in page uses every supplied artwork asset", async () => {
  for (const file of artwork) {
    const assetPath = fromRoot("attached_assets", "uploads", file);
    assert.equal(existsSync(assetPath), true, file);
    const metadata = await sharp(assetPath).metadata();
    assert.ok(metadata.format === "png" || metadata.format === "jpeg", `${file}: ${metadata.format}`);
    assert.ok((metadata.width ?? 0) > 0, file);
    assert.ok((metadata.height ?? 0) > 0, file);
  }

  const authPage = readFileSync(
    fromRoot("client", "src", "pages", "AuthPage.tsx"),
    "utf8",
  );
  for (const file of artwork) assert.match(authPage, new RegExp(file.replace(".", "\\.")));
  assert.doesNotMatch(authPage, /@assets\/bg_login\.png/);
  assert.doesNotMatch(authPage, /@assets\/btn_signin_v2\.png/);
  assert.doesNotMatch(authPage, /@assets\/btn_create_v2\.png/);
});

test("artwork redesign preserves auth actions and adds safe animation", () => {
  const authPage = readFileSync(
    fromRoot("client", "src", "pages", "AuthPage.tsx"),
    "utf8",
  );
  const css = readFileSync(
    fromRoot("client", "src", "pages", "authPage.css"),
    "utf8",
  );

  assert.match(authPage, /testId="button-signin"/);
  assert.match(authPage, /testId="button-create-account"/);
  assert.match(authPage, /testId="link-para-pets-hub"/);
  assert.match(authPage, /onActivate=\{\(\) => setLocation\("\/hub"\)\}/);
  assert.match(authPage, /data-testid="button-submit-signin"/);
  assert.match(authPage, /data-testid="button-submit-register"/);
  assert.match(authPage, /data-testid="button-forgot-password"/);
  assert.match(css, /@keyframes auth-sparkle-burst/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
