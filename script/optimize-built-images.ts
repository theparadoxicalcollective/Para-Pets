import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_MIN_BYTES = 1_500_000;
const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".mjs", ".json"]);

export interface BuiltImageOptimizationOptions {
  publicDir?: string;
  minBytes?: number;
  minimumSavingsRatio?: number;
  log?: (message: string) => void;
}

export interface BuiltImageOptimizationResult {
  optimized: number;
  skipped: number;
  originalBytes: number;
  optimizedBytes: number;
  replacements: Map<string, string>;
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

/**
 * Converts only large, static 8-bit PNGs emitted by Vite to lossless WebP.
 *
 * The source PNG remains in dist as a safety fallback. We only rewrite built
 * JS/CSS/HTML references when the WebP is smaller, and we never resize,
 * crop, recompress lossily, or change source artwork. This keeps rendered
 * dimensions, alpha, placement and decoded pixels unchanged while reducing
 * the bytes players download.
 */
export async function optimizeBuiltPngAssets(
  options: BuiltImageOptimizationOptions = {},
): Promise<BuiltImageOptimizationResult> {
  const publicDir = options.publicDir ?? path.resolve("dist/public");
  const assetsDir = path.join(publicDir, "assets");
  const minBytes = options.minBytes ?? DEFAULT_MIN_BYTES;
  const minimumSavingsRatio = options.minimumSavingsRatio ?? 0.02;
  const log = options.log ?? console.log;

  let files: string[];
  try {
    files = await walkFiles(assetsDir);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return {
        optimized: 0,
        skipped: 0,
        originalBytes: 0,
        optimizedBytes: 0,
        replacements: new Map(),
      };
    }
    throw error;
  }

  const replacements = new Map<string, string>();
  let optimized = 0;
  let skipped = 0;
  let originalBytes = 0;
  let optimizedBytes = 0;

  // Process sequentially to avoid large concurrent Sharp buffers on Railway.
  for (const filePath of files) {
    if (path.extname(filePath).toLowerCase() !== ".png") continue;
    const fileStat = await stat(filePath);
    if (fileStat.size < minBytes) continue;

    const image = sharp(filePath, { animated: true, failOn: "none" });
    const metadata = await image.metadata();

    // APNG and >8-bit PNGs are intentionally left alone. Converting those can
    // alter animation or pixel depth, which conflicts with the no-look-change
    // guarantee for this optimization pass.
    if ((metadata.pages ?? 1) > 1 || (metadata.depth && metadata.depth !== "uchar")) {
      skipped += 1;
      continue;
    }

    const outputPath = filePath.slice(0, -4) + ".webp";
    const output = await sharp(filePath, { failOn: "none" })
      .keepMetadata()
      .webp({ lossless: true, effort: 6 })
      .toBuffer();

    const savingsRatio = 1 - output.byteLength / fileStat.size;
    if (savingsRatio < minimumSavingsRatio) {
      skipped += 1;
      continue;
    }

    await writeFile(outputPath, output);
    const from = path.basename(filePath);
    const to = path.basename(outputPath);
    replacements.set(from, to);
    optimized += 1;
    originalBytes += fileStat.size;
    optimizedBytes += output.byteLength;
  }

  if (replacements.size > 0) {
    const builtFiles = await walkFiles(publicDir);
    for (const filePath of builtFiles) {
      if (!TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue;
      let text = await readFile(filePath, "utf8");
      let changed = false;
      for (const [from, to] of replacements) {
        if (!text.includes(from)) continue;
        text = text.split(from).join(to);
        changed = true;
      }
      if (changed) await writeFile(filePath, text, "utf8");
    }
  }

  if (optimized > 0) {
    const savedMb = (originalBytes - optimizedBytes) / 1024 / 1024;
    log(`[images] lossless WebP: ${optimized} large PNG(s), ${savedMb.toFixed(1)} MB less player download weight`);
  } else {
    log("[images] no large PNGs benefited from lossless WebP conversion");
  }

  return { optimized, skipped, originalBytes, optimizedBytes, replacements };
}
