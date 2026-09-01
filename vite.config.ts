import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { execFileSync } from "node:child_process";

const buildId = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || (() => {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return "development"; }
})();

const CANONICAL_WORLD_MAP_PNGS: Record<string, string> = {
  swamp: "attached_assets/uploads/ElysianBayouMap.png",
  volcanic: "attached_assets/uploads/EmbercraftPeakMap.png",
  haunted_woods: "attached_assets/uploads/ShadowfenMap.png",
};

function readPngMapHeight(assetPath: string): number {
  const absolutePath = path.resolve(import.meta.dirname, assetPath);
  const fd = fs.openSync(absolutePath, "r");
  try {
    const header = Buffer.alloc(24);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    if (bytesRead < 24 || header.toString("ascii", 1, 4) !== "PNG") {
      throw new Error(`Expected PNG world map asset: ${assetPath}`);
    }
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    if (!width || !height) throw new Error(`Invalid PNG dimensions for ${assetPath}`);
    return Math.round(1080 * height / width);
  } finally {
    fs.closeSync(fd);
  }
}

const CANONICAL_WORLD_MAP_HEIGHTS = Object.fromEntries(
  Object.entries(CANONICAL_WORLD_MAP_PNGS).map(([worldId, assetPath]) => [
    worldId,
    readPngMapHeight(assetPath),
  ]),
) as Record<string, number>;

/**
 * WorldPage is a large legacy page whose hotspot coordinate system depends on
 * MAP_W=1080 plus a fixed design-space height. The three new canonical maps
 * are taller PNGs than the art they replace. Reading their IHDR dimensions at
 * build/dev startup keeps the map canvas at the exact native aspect ratio,
 * preventing background-size: cover from cropping the artwork while keeping
 * hotspot positions percentage-based across devices.
 */
function canonicalWorldMapHeightPlugin(): Plugin {
  return {
    name: "canonical-world-map-native-heights",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.split("?")[0].replace(/\\/g, "/");
      if (!normalizedId.endsWith("/client/src/pages/WorldPage.tsx")) return null;

      const blockPattern = /(const WORLD_FIXED_MAP_H:\s*Record<string,\s*number>\s*=\s*\{)([\s\S]*?)(\n\};)/;
      const match = blockPattern.exec(code);
      if (!match) throw new Error("Could not locate WORLD_FIXED_MAP_H in WorldPage.tsx");

      let body = match[2];
      for (const [worldId, mapHeight] of Object.entries(CANONICAL_WORLD_MAP_HEIGHTS)) {
        const linePattern = new RegExp(`(^\\s*${worldId}:\\s*)\\d+`, "m");
        if (!linePattern.test(body)) {
          throw new Error(`Could not locate ${worldId} in WORLD_FIXED_MAP_H`);
        }
        body = body.replace(linePattern, `$1${mapHeight}`);
      }

      const start = match.index;
      const end = start + match[0].length;
      return {
        code: code.slice(0, start) + match[1] + body + match[3] + code.slice(end),
        map: null,
      };
    },
  };
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    canonicalWorldMapHeightPlugin(),
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
