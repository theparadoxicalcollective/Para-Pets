import { useEffect, useRef } from "react";
import {
  parkTerrainCellWindow, parkTerrainNoise, parkVisibleTerrainBounds,
  type ParkTerrainViewport,
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

/**
 * One camera-aligned visual canvas; there is no second game stage or placement
 * surface. Viewport-sized backing pixels avoid enormous canvases on level 4.
 * Organic washes and restrained 2:1 diamond highlights create a painterly,
 * isometric-inspired ground, not a new projection of gameplay coordinates.
 */
export default function PetParkTerrain(view: ParkTerrainViewport & { dirtPatches?: readonly ParkDirtPatch[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view.viewportWidth < 2 || view.viewportHeight < 2) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    // Avoid 3x-resolution full-screen textures on high-DPI phones.
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.ceil(view.viewportWidth * ratio));
    const height = Math.max(1, Math.ceil(view.viewportHeight * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const frame = window.requestAnimationFrame(() => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintTerrain(ctx, view);
      if (view.dirtPatches?.length) paintDirtPaths(ctx, view, view.dirtPatches);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view.viewportWidth, view.viewportHeight, view.worldWidth, view.worldHeight, view.scale, view.panX, view.panY, view.dirtPatches]);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="pet-park-painterly-terrain"
    className="pointer-events-none absolute inset-0 h-full w-full" style={{ backgroundColor: "#2c4934" }} />;
}

function paintTerrain(ctx: CanvasRenderingContext2D, view: ParkTerrainViewport) {
  const bounds = parkVisibleTerrainBounds(view);
  ctx.clearRect(0, 0, view.viewportWidth, view.viewportHeight);
  ctx.fillStyle = "#2c4934";
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
    wash.addColorStop(0, warm ? "rgba(103,135,81,.15)" : "rgba(15,54,34,.29)");
    wash.addColorStop(0.55, warm ? "rgba(102,137,85,.07)" : "rgba(29,79,48,.15)");
    wash.addColorStop(1, "rgba(49,93,59,0)");
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
    ctx.fillStyle = rand > 0.91 ? "rgba(131,164,102,.023)" : "rgba(12,45,29,.045)";
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
    ctx.fillStyle = seed > 0.55 ? "rgba(122,153,102,.07)" : "rgba(16,53,35,.16)";
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
    ctx.strokeStyle = seed > 0.52 ? "rgba(145,174,119,.28)" : "rgba(17,56,37,.4)";
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
export function paintDirtPaths(ctx: CanvasRenderingContext2D, view: ParkTerrainViewport, stamps: readonly ParkDirtPatch[]) {
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
  ctx.fillStyle = "#624832";
  ctx.shadowColor = "rgba(32, 36, 21, .33)";
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
  const grain = parkTerrainCellWindow(grainBounds, 29, 25, 1);
  for (let row = grain.minY; row <= grain.maxY; row++) {
    for (let col = grain.minX; col <= grain.maxX; col++) {
      const tone = parkTerrainNoise(col, row, 41);
      if (tone < 0.18) continue;
      const x = (col + 0.15 + parkTerrainNoise(col, row, 42) * 0.7) * 29;
      const y = (row + 0.12 + parkTerrainNoise(col, row, 43) * 0.7) * 25;
      const size = 2 + parkTerrainNoise(col, row, 44) * 9;
      ctx.fillStyle = tone > 0.59 ? "rgba(171, 132, 88, .18)" : "rgba(37, 27, 21, .20)";
      ctx.beginPath();
      ctx.ellipse(x, y, size, Math.max(1, size * 0.33), -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
