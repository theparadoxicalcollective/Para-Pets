import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { execFileSync } from "node:child_process";

const buildId = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || (() => {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return "development"; }
})();

const WORLD_MAP_DESIGN_W = 924;
const WORLD_MAP_DESIGN_H = 1703;

/**
 * WorldPage is a large legacy page whose location placement math is already
 * percentage-based, so we can safely standardize its design-space dimensions
 * without rewriting location/destination behavior. Every inside-world map is
 * treated as one fixed 924×1703 portrait composition, matching the new source
 * artwork format and preventing variable per-world canvas widths/heights from
 * reintroducing horizontal overflow.
 */
function fixedWorldMapCanvasPlugin(): Plugin {
  return {
    name: "fixed-world-map-924x1703",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.split("?")[0].replace(/\\/g, "/");
      if (!normalizedId.endsWith("/client/src/pages/WorldPage.tsx")) return null;

      let next = code;
      next = next.replace(/const MAP_W = \d+;/, `const MAP_W = ${WORLD_MAP_DESIGN_W};`);
      next = next.replace(/const MAP_H_DEFAULT = \d+;/, `const MAP_H_DEFAULT = ${WORLD_MAP_DESIGN_H};`);

      const blockPattern = /(const WORLD_FIXED_MAP_H:\s*Record<string,\s*number>\s*=\s*\{)([\s\S]*?)(\n\};)/;
      const match = blockPattern.exec(next);
      if (!match) throw new Error("Could not locate WORLD_FIXED_MAP_H in WorldPage.tsx");

      const body = match[2].replace(/(^\s*[a-z_]+:\s*)\d+/gm, `$1${WORLD_MAP_DESIGN_H}`);
      const start = match.index;
      const end = start + match[0].length;
      next = next.slice(0, start) + match[1] + body + match[3] + next.slice(end);

      return { code: next, map: null };
    },
  };
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    fixedWorldMapCanvasPlugin(),
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@/components/PetAnimator": path.resolve(import.meta.dirname, "client", "src", "components", "PetAnimatorDisplay.tsx"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
