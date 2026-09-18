import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx|css)$/.test(name) ? [path] : [];
  });
}

test("client imports prefer an existing WebP sibling over PNG or JPEG", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles("client/src")) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/@assets\/([^"'\`)]+\.(?:png|jpe?g))/gi)) {
      const relativeAsset = match[1];
      const original = join("attached_assets", relativeAsset);
      const webp = original.replace(/\.(?:png|jpe?g)$/i, ".webp");
      if (existsSync(original) && existsSync(webp)) {
        offenders.push(`${relative("client/src", file)} imports ${relativeAsset}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
