import { useEffect, useRef } from "react";
import type { ParkGroundTheme } from "@shared/petParkGround";
import { PARK_GROUND_PALETTES, type ParkGroundPalette } from "@/lib/petParkGroundPalette";
import {
  parkTerrainCellWindow, parkTerrainNoise, parkVisibleTerrainBounds,
  parkTerrainPreviewCoversViewport, parkTerrainPreviewTransform, type ParkTerrainViewport,
} from "@/lib/petParkTerrain";

export type ParkDirtPatch = { xPct: number; yPct: number; size: number };

// Use the same normalized item coordinates and 2.5D ground footprint as the editor.
export function dirtPatchWorldRect(patch: ParkDirtPatch, width: number, height: number) {
  return {
    x: patch.xPct * width - patch.size / 2,
    y: patch.yPct * height - patch.size / 4,
    width: patch.size,
    height: patch.size / 2,
  };
}

export type DirtExposedEdge = {
  ax: number; ay: number; bx: number; by: number;
  cx: number; cy: number; size: number;
  inwardX: number; inwardY: number;
};

/** A shared diamond side has two owners and must never fade. Calculate in
 * world space so zoom/pan, newly painted strokes and existing stamps agree.
 * Offscreen neighbors count too, preventing seams at the viewport boundary.
 */
export function exposedDirtEdges(
  stamps: readonly ParkDirtPatch[],
  worldWidth: number,
  worldHeight: number,
  visible?: { left: number; top: number; right: number; bottom: number },
): DirtExposedEdge[] {
  const edges = new Map<string, { edge: DirtExposedEdge; count: number }>();
  const tilesByCell = new Map<string, Array<{ cx: number; cy: number; halfW: number; halfH: number }>>();
  const cellSize = 200;
  const cellKey = (x: number, y: number) => x + ":" + y;
  const seen = new Set<string>();
  const quantize = (value: number) => Math.round(value * 1000);
  for (const stamp of stamps) {
    if (!(Number.isFinite(stamp.xPct) && Number.isFinite(stamp.yPct) &&
          Number.isFinite(stamp.size) && stamp.size > 0)) continue;
    const cx = stamp.xPct * worldWidth;
    const cy = stamp.yPct * worldHeight;
    const halfW = stamp.size / 2, halfH = stamp.size / 4;
    const tileKey = [quantize(cx), quantize(cy), quantize(stamp.size)].join(":");
    if (seen.has(tileKey)) continue;
    seen.add(tileKey);
    const tile = { cx, cy, halfW, halfH };
    // A sparse world-space lookup keeps exposed-edge tests local even after
    // administrators paint hundreds of strokes across expanded park ground.
    for (let cellY = Math.floor((cy - halfH) / cellSize); cellY <= Math.floor((cy + halfH) / cellSize); cellY++) {
      for (let cellX = Math.floor((cx - halfW) / cellSize); cellX <= Math.floor((cx + halfW) / cellSize); cellX++) {
        const key = cellKey(cellX, cellY);
        const bin = tilesByCell.get(key);
        if (bin) bin.push(tile); else tilesByCell.set(key, [tile]);
      }
    }
    const points = [
      [cx, cy - halfH], [cx + halfW, cy],
      [cx, cy + halfH], [cx - halfW, cy],
    ];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = points[i], [bx, by] = points[(i + 1) % 4];
      const a = quantize(ax) + ":" + quantize(ay);
      const b = quantize(bx) + ":" + quantize(by);
      const key = a < b ? a + "|" + b : b + "|" + a;
      const previous = edges.get(key);
      if (previous) previous.count += 1;
      else {
        const midpointX = (ax + bx) / 2, midpointY = (ay + by) / 2;
        const inwardX = cx - midpointX, inwardY = cy - midpointY;
        const normalLength = Math.hypot(inwardX, inwardY) || 1;
        edges.set(key, { edge: { ax, ay, bx, by, cx, cy, size: stamp.size,
          inwardX: inwardX / normalLength, inwardY: inwardY / normalLength }, count: 1 });
      }
    }
  }
  const exposed: DirtExposedEdge[] = [];
  for (const { edge, count } of edges.values()) {
    if (count !== 1) continue;
    const { ax, ay, bx, by, cx, cy, size } = edge;
    if (visible && (Math.max(ax, bx) < visible.left - 16 || Math.min(ax, bx) > visible.right + 16 ||
        Math.max(ay, by) < visible.top - 16 || Math.min(ay, by) > visible.bottom + 16)) continue;
    const { inwardX, inwardY } = edge;
    // A legacy offset stamp can overlap only *part* of a diamond side.
    // Sample short spans and fade its exposed pieces; a full shared side
    // above has already been removed from consideration.
    const segments = 6;
    let openedAt = -1;
    for (let span = 0; span <= segments; span++) {
      let covered = span === segments;
      if (!covered) {
        const t = (span + 0.5) / segments;
        const outerX = ax + (bx - ax) * t - inwardX * 2;
        const outerY = ay + (by - ay) * t - inwardY * 2;
        const candidates = tilesByCell.get(cellKey(Math.floor(outerX / cellSize), Math.floor(outerY / cellSize))) ?? [];
        covered = candidates.some(tile => {
          if (tile.cx === cx && tile.cy === cy && tile.halfW * 2 === size) return false;
          return Math.abs(outerX - tile.cx) / tile.halfW +
            Math.abs(outerY - tile.cy) / tile.halfH < 1 - 1e-5;
        });
      }
      if (!covered && openedAt === -1) openedAt = span;
      if (covered && openedAt !== -1) {
        const t0 = openedAt / segments, t1 = span / segments;
        exposed.push({
          ...edge,
          ax: ax + (bx - ax) * t0, ay: ay + (by - ay) * t0,
          bx: ax + (bx - ax) * t1, by: ay + (by - ay) * t1,
        });
        openedAt = -1;
      }
    }
  }
  return exposed;
}

/**
 * One camera-aligned visual canvas; there is no second game stage or placement
 * surface. Viewport-sized backing pixels avoid enormous canvases on level 4.
 * Organic washes and restrained 2:1 diamond highlights create a painterly,
 * isometric-inspired ground, not a new projection of gameplay coordinates.
 */
export default function PetParkTerrain(view: ParkTerrainViewport & {
  groundTheme?: ParkGroundTheme;
  /** Optional world-only appearance override; omitted for all Pet Park scenes. */
  groundPalette?: ParkGroundPalette;
  dirtPatches?: readonly ParkDirtPatch[];
  stonePatches?: readonly ParkDirtPatch[];
  waterPatches?: readonly ParkDirtPatch[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Camera movement used to re-run all watercolor and connected-path loops
  // on *every pinch frame*. Keep the last raster and reproject it with a cheap
  // GPU transform during gestures; repaint at full resolution once the camera
  // settles. The modest overscan keeps the viewport covered while moving.
  const painted = useRef<null | {
    view: ParkTerrainViewport & { groundTheme?: ParkGroundTheme; groundPalette?: ParkGroundPalette;
      dirtPatches?: readonly ParkDirtPatch[]; stonePatches?: readonly ParkDirtPatch[];
      waterPatches?: readonly ParkDirtPatch[] };
    marginX: number; marginY: number;
  }>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view.viewportWidth < 2 || view.viewportHeight < 2) return;
    const marginX = view.viewportWidth * 0.18;
    const marginY = view.viewportHeight * 0.18;
    const expanded: typeof view = {
      ...view,
      viewportWidth: view.viewportWidth + 2 * marginX,
      viewportHeight: view.viewportHeight + 2 * marginY,
      panX: view.panX + marginX,
      panY: view.panY + marginY,
    };
    let frame: number | undefined;
    let timer: number | undefined;
    const paint = () => {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      // Keep raster size bounded on large tablets and high-DPI phones.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.ceil(expanded.viewportWidth * ratio));
      const height = Math.max(1, Math.ceil(expanded.viewportHeight * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      canvas.style.left = -marginX + "px";
      canvas.style.top = -marginY + "px";
      canvas.style.width = expanded.viewportWidth + "px";
      canvas.style.height = expanded.viewportHeight + "px";
      canvas.style.transform = "";
      canvas.dataset.parkCameraPreview = "false";
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintTerrain(ctx, expanded);
      const theme = view.groundTheme ?? "grass";
      if (view.dirtPatches?.length) paintDirtPaths(ctx, expanded, view.dirtPatches, theme, view.groundPalette);
      if (view.stonePatches?.length) paintConnectedPaths(ctx, expanded, view.stonePatches, "stone_path", theme, view.groundPalette);
      if (view.waterPatches?.length) paintConnectedPaths(ctx, expanded, view.waterPatches, "water_path", theme, view.groundPalette);
      painted.current = { view, marginX, marginY };
    };
    const previous = painted.current;
    const staticChanged = !previous ||
      previous.view.viewportWidth !== view.viewportWidth ||
      previous.view.viewportHeight !== view.viewportHeight ||
      previous.view.worldWidth !== view.worldWidth ||
      previous.view.worldHeight !== view.worldHeight ||
      previous.view.groundTheme !== view.groundTheme ||
      previous.view.groundPalette !== view.groundPalette ||
      previous.view.dirtPatches !== view.dirtPatches ||
      previous.view.stonePatches !== view.stonePatches ||
      previous.view.waterPatches !== view.waterPatches;
    if (staticChanged) {
      // Persisted art / map geometry changes always draw immediately.
      frame = window.requestAnimationFrame(paint);
    } else {
      const { ratio, dx, dy } = parkTerrainPreviewTransform(
        previous.view, view, previous.marginX, previous.marginY);
      if (!parkTerrainPreviewCoversViewport(previous.view, view,
        view.viewportWidth, view.viewportHeight, previous.marginX, previous.marginY)) {
        // Overscan was exhausted by a long/fast pan (or zoom-out). The
        // old bitmap would leave an obvious rectangular green/dark gap.
        // Immediately repaint camera-visible world art instead of waiting
        // for the 110ms idle debounce, which is continuously reset by drag.
        paint();
      } else if (Math.abs(dx) < .1 && Math.abs(dy) < .1 && Math.abs(ratio - 1) < .0001) {
        canvas.style.transform = "";
        canvas.dataset.parkCameraPreview = "false";
      } else {
        canvas.style.transformOrigin = "0 0";
        canvas.style.transform = `translate(${dx}px, ${dy}px) scale(${ratio})`;
        canvas.dataset.parkCameraPreview = "true";
        // Cancel/restart as new camera frames arrive. One accurate raster
        // rebuild at rest instead of dozens of heavy canvas repaints.
        timer = window.setTimeout(() => {
          frame = window.requestAnimationFrame(paint);
        }, 110);
      }
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [view.viewportWidth, view.viewportHeight, view.worldWidth, view.worldHeight,
      view.scale, view.panX, view.panY, view.dirtPatches, view.stonePatches,
      view.waterPatches, view.groundTheme, view.groundPalette]);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="pet-park-painterly-terrain"
    className="pointer-events-none absolute" style={{ backgroundColor: (view.groundPalette ?? PARK_GROUND_PALETTES[view.groundTheme ?? "grass"]).base }} />;
}

function paintTerrain(ctx: CanvasRenderingContext2D, view: ParkTerrainViewport & {
  groundTheme?: ParkGroundTheme; groundPalette?: ParkGroundPalette;
}) {
  const palette = view.groundPalette ?? PARK_GROUND_PALETTES[view.groundTheme ?? "grass"];
  const bounds = parkVisibleTerrainBounds(view);
  ctx.clearRect(0, 0, view.viewportWidth, view.viewportHeight);
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, view.viewportWidth, view.viewportHeight);
  if (bounds.left >= bounds.right || bounds.top >= bounds.bottom) return;

  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.scale, view.scale);
  ctx.beginPath();
  ctx.rect(0, 0, view.worldWidth, view.worldHeight);
  ctx.clip();

  const eachCell = (stepX: number, stepY: number, pad: number, visit: (x: number, y: number) => void) => {
    const window = parkTerrainCellWindow(bounds, stepX, stepY, pad);
    for (let y = window.minY; y <= window.maxY; y++) {
      for (let x = window.minX; x <= window.maxX; x++) visit(x, y);
    }
  };

  // World-anchored watercolor washes: soft irregular scales instead of the
  // previous four repeating CSS gradient tiles and their visible pattern.
  eachCell(380, 330, 2, (x, y) => {
    const cx = (x + 0.22 + parkTerrainNoise(x, y, 1) * 0.55) * 380;
    const cy = (y + 0.19 + parkTerrainNoise(x, y, 2) * 0.58) * 330;
    const rx = 180 + parkTerrainNoise(x, y, 3) * 170;
    const ry = 95 + parkTerrainNoise(x, y, 4) * 120;
    const warm = parkTerrainNoise(x, y, 5) > 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35 + parkTerrainNoise(x, y, 6) * 0.45);
    ctx.scale(rx, ry);
    const wash = ctx.createRadialGradient(0, 0, 0.06, 0, 0, 1);
    wash.addColorStop(0, warm ? palette.washLight : palette.washDark);
    wash.addColorStop(0.55, warm ? palette.washLightMid : palette.washDarkMid);
    wash.addColorStop(1, `rgba(${palette.rgb.join(",")},0)`);
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // An occasional softened 2:1 diagonal facet suggests an angled ground plane
  // without drawing a continuous checkerboard or imposing an isometric grid.
  eachCell(144, 36, 2, (col, row) => {
    const rand = parkTerrainNoise(col, row, 11);
    if (rand < 0.77) return;
    const cx = (col + ((row & 1) ? 0.5 : 0)) * 144;
    const cy = row * 36;
    ctx.fillStyle = rand > 0.91 ? palette.facetLight : palette.facetDark;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 36);
    ctx.lineTo(cx + 72, cy);
    ctx.lineTo(cx, cy + 36);
    ctx.lineTo(cx - 72, cy);
    ctx.closePath();
    ctx.fill();
  });

  // Brush-shaped grass patches and diagonal dabs use distinct coordinates
  // for every world cell; zooming and expanding never reseed the terrain.
  eachCell(120, 112, 1, (col, row) => {
    const seed = parkTerrainNoise(col, row, 12);
    const x = (col + 0.1 + parkTerrainNoise(col, row, 13) * 0.8) * 120;
    const y = (row + 0.1 + parkTerrainNoise(col, row, 14) * 0.8) * 112;
    const length = 15 + seed * 27;
    ctx.fillStyle = seed > 0.55 ? palette.patchLight : palette.patchDark;
    ctx.beginPath();
    ctx.ellipse(x, y, length, 5 + seed * 6, -0.45, 0, Math.PI * 2);
    ctx.fill();
  });

  // Fine grass is made of short angled strokes, not repeated square textures.
  eachCell(55, 57, 1, (col, row) => {
    const seed = parkTerrainNoise(col, row, 21);
    if (seed < 0.23) return;
    const x = (col + 0.1 + parkTerrainNoise(col, row, 22) * 0.8) * 55;
    const y = (row + 0.1 + parkTerrainNoise(col, row, 23) * 0.8) * 57;
    const length = 3 + parkTerrainNoise(col, row, 24) * 7;
    ctx.lineCap = "round";
    ctx.lineWidth = 1.1 + seed * 0.8;
    ctx.strokeStyle = seed > 0.52 ? palette.strokeLight : palette.strokeDark;
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 2);
    ctx.quadraticCurveTo(x - 1, y - length * 0.5, x + 3, y - length);
    ctx.moveTo(x + 1, y + 2);
    ctx.quadraticCurveTo(x + 4, y - length * 0.3, x + 8, y - length * 0.7);
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * Dirt stamps form ONE path in the existing viewport canvas. Their rectangles
 * are filled once and the world-space grain is clipped to their union. Painting
 * the old translucent DOM stamps separately caused the stacked oval artifacts.
 * No new stage, stored stroke format, asset URL or hit-testing layer is needed.
 */
export function paintDirtPaths(ctx: CanvasRenderingContext2D, view: ParkTerrainViewport,
  stamps: readonly ParkDirtPatch[], groundTheme: ParkGroundTheme = "grass", groundPalette?: ParkGroundPalette) {
  return paintConnectedPaths(ctx, view, stamps, "dirt_path", groundTheme, groundPalette);
}

export type ParkConnectedPathKind = "dirt_path" | "stone_path" | "water_path";
/** Unified path fill, clipping, world grain, and exposed-edge feathering.
 * All materials use the identical 2:1 snapped diamond union, never separate
 * translucent DOM tiles or an additional map interaction layer. */
export function paintConnectedPaths(ctx: CanvasRenderingContext2D, view: ParkTerrainViewport,
  stamps: readonly ParkDirtPatch[], kind: ParkConnectedPathKind, groundTheme: ParkGroundTheme = "grass", groundPalette?: ParkGroundPalette) {
  const visible = parkVisibleTerrainBounds(view);
  if (visible.left >= visible.right || visible.top >= visible.bottom) return;

  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.scale, view.scale);
  ctx.beginPath();
  ctx.rect(0, 0, view.worldWidth, view.worldHeight);
  ctx.clip();

  ctx.beginPath();
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  let count = 0;
  for (const patch of stamps) {
    if (!Number.isFinite(patch.size) || patch.size <= 0) continue;
    const rect = dirtPatchWorldRect(patch, view.worldWidth, view.worldHeight);
    if (rect.x > visible.right || rect.x + rect.width < visible.left ||
        rect.y > visible.bottom || rect.y + rect.height < visible.top) continue;
    ctx.moveTo(rect.x + rect.width / 2, rect.y);
    ctx.lineTo(rect.x + rect.width, rect.y + rect.height / 2);
    ctx.lineTo(rect.x + rect.width / 2, rect.y + rect.height);
    ctx.lineTo(rect.x, rect.y + rect.height / 2);
    ctx.closePath();
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
    count++;
  }
  if (!count) { ctx.restore(); return; }

  // One opaque, softly shadowed fill means overlapping tiles are seamless.
  // Adjacent stamps can overlap freely without dark or bright rings.
  ctx.fillStyle = kind === "dirt_path" ? "#624832" : kind === "stone_path" ? "#747671" : "#286d78";
  ctx.shadowColor = kind === "water_path" ? "rgba(16,66,68,.36)" : "rgba(32, 36, 21, .33)";
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();

  // Grain is sampled in WORLD space; panning, zooming and expanding ground
  // never change the texture's origin or reveal per-stamp seams.
  const grainBounds = {
    left: Math.max(visible.left, left), top: Math.max(visible.top, top),
    right: Math.min(visible.right, right), bottom: Math.min(visible.bottom, bottom),
  };
  const cellSize = kind === "water_path" ? 24 : kind === "stone_path" ? 34 : 29;
  const rowSize = kind === "water_path" ? 19 : kind === "stone_path" ? 30 : 25;
  const grain = parkTerrainCellWindow(grainBounds, cellSize, rowSize, 1);
  for (let row = grain.minY; row <= grain.maxY; row++) {
    for (let col = grain.minX; col <= grain.maxX; col++) {
      const tone = parkTerrainNoise(col, row, 41);
      if (tone < (kind === "dirt_path" ? 0.18 : 0.11)) continue;
      const x = (col + 0.15 + parkTerrainNoise(col, row, 42) * 0.7) * cellSize;
      const y = (row + 0.12 + parkTerrainNoise(col, row, 43) * 0.7) * rowSize;
      const size = 2 + parkTerrainNoise(col, row, 44) * 9;
      if (kind === "dirt_path") {
        ctx.fillStyle = tone > 0.59 ? "rgba(171, 132, 88, .18)" : "rgba(37, 27, 21, .20)";
        ctx.beginPath();
        ctx.ellipse(x, y, size, Math.max(1, size * 0.33), -0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === "stone_path") {
        // Irregular weathered slate, rounded corners, mineral flecks and
        // hairline grout; all marks are globally anchored across tile seams.
        const radius = 5 + tone * 10;
        ctx.fillStyle = tone > .58 ? "rgba(204,203,186,.20)" : "rgba(36,47,50,.21)";
        ctx.beginPath();
        ctx.moveTo(x - radius, y - radius * .32);
        ctx.lineTo(x - radius * .15, y - radius * .65);
        ctx.lineTo(x + radius, y - radius * .35);
        ctx.lineTo(x + radius * .76, y + radius * .55);
        ctx.lineTo(x - radius * .68, y + radius * .65);
        ctx.closePath();
        ctx.fill();
        if (tone > .70) {
          ctx.strokeStyle = "rgba(40,50,48,.24)";
          ctx.lineWidth = .7;
          ctx.beginPath();
          ctx.moveTo(x - radius * .63, y + radius * .38);
          ctx.lineTo(x + radius * .65, y - radius * .15);
          ctx.stroke();
        }
      } else {
        // Deep teal pools with directional caustic streaks. Short, uneven
        // highlights read as rippling still water without any per-frame loop.
        const rx = 8 + tone * 13;
        ctx.fillStyle = tone > .64 ? "rgba(193,237,226,.25)" : "rgba(14,64,82,.27)";
        ctx.beginPath();
        ctx.ellipse(x, y, rx, .8 + tone * 2.2, -.16 + tone * .25, 0, Math.PI * 2);
        ctx.fill();
        if (tone > .78) {
          ctx.strokeStyle = "rgba(233,251,231,.29)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - rx * .7, y - 3);
          ctx.lineTo(x + rx * .45, y - 5);
          ctx.stroke();
        }
      }
    }
  }
  // Narrow, uneven watercolor feathering on the union's EXPOSED edges.
  // The grass is already on this one opaque scene canvas, so a translucent
  // grass tint blends the outer few pixels without extra stages or any
  // per-tile alpha (which would create seams at adjoining diamonds).
  // All randomness is world-anchored: dragging or zooming never reshuffles it.
  const ground = groundPalette ?? PARK_GROUND_PALETTES[groundTheme];
  for (const edge of exposedDirtEdges(stamps, view.worldWidth, view.worldHeight, visible)) {
    const dx = edge.bx - edge.ax, dy = edge.by - edge.ay;
    const segmentCount = Math.max(2, Math.ceil(Math.hypot(dx, dy) / 24));
    const seedX = Math.round(edge.ax * 5), seedY = Math.round(edge.ay * 5);
    const jitterAt = (i: number) => (parkTerrainNoise(seedX + i, seedY, 47) - 0.5) * 2.5;
    for (let i = 0; i < segmentCount; i++) {
      const t0 = i / segmentCount, t1 = (i + 1) / segmentCount;
      const jitter0 = jitterAt(i), jitter1 = jitterAt(i + 1);
      const x0 = edge.ax + dx * t0 - edge.inwardX * jitter0;
      const y0 = edge.ay + dy * t0 - edge.inwardY * jitter0;
      const x1 = edge.ax + dx * t1 - edge.inwardX * jitter1;
      const y1 = edge.ay + dy * t1 - edge.inwardY * jitter1;
      const variation = parkTerrainNoise(seedX + i, seedY, 49);
      const width = Math.min(8, edge.size * 0.055) * (0.65 + variation * 0.35);
      const alpha = (0.50 + parkTerrainNoise(seedX + i, seedY, 51) * 0.19).toFixed(3);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const gradient = ctx.createLinearGradient(mx, my, mx + edge.inwardX * width, my + edge.inwardY * width);
      gradient.addColorStop(0, `rgba(${ground.rgb.join(",")},${alpha})`);
      gradient.addColorStop(0.46, `rgba(${ground.rgb.join(",")},.20)`);
      gradient.addColorStop(1, `rgba(${ground.rgb.join(",")},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 + edge.inwardX * width, y1 + edge.inwardY * width);
      ctx.lineTo(x0 + edge.inwardX * width, y0 + edge.inwardY * width);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
