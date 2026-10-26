import { useEffect, useRef, useState } from "react";
import grassTileUrl from "@assets/uploads/GrassTile.png";
import {
  parkTerrainCellWindow, parkTerrainNoise, parkVisibleTerrainBounds,
  type ParkTerrainViewport, type ParkTerrainBounds,
} from "@/lib/petParkTerrain";

export type ParkGrassMode = "tile" | "procedural";

/**
 * One camera-aligned visual canvas; there is no second game stage or placement
 * surface. Viewport-sized backing pixels avoid enormous canvases on level 4.
 * Organic washes and restrained 2:1 diamond highlights create a painterly,
 * isometric-inspired ground, not a new projection of gameplay coordinates.
 */
export default function PetParkTerrain(view: ParkTerrainViewport & { grassMode?: ParkGrassMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grassImage, setGrassImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => setGrassImage(image);
    image.onerror = () => setGrassImage(null);
    image.src = grassTileUrl;
    return () => { image.onload = null; image.onerror = null; };
  }, []);

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
      if (view.grassMode !== "procedural" && grassImage) {
        paintGrassTile(ctx, view, grassImage);
      } else {
        // The original remains an exact comparison mode and a safe load fallback.
        paintTerrain(ctx, view);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view.viewportWidth, view.viewportHeight, view.worldWidth, view.worldHeight, view.scale, view.panX, view.panY, view.grassMode, grassImage]);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="pet-park-painterly-terrain"
    className="pointer-events-none absolute inset-0 h-full w-full" style={{ backgroundColor: "#6d8754" }} />;
}

// Fixed world-space footprint; camera movement, zoom, and ground expansion never
// reset the tile origin or change its scale relative to park objects.
const GRASS_TILE_WORLD_SIZE = 512;

function paintGrassTile(ctx: CanvasRenderingContext2D, view: ParkTerrainViewport, image: HTMLImageElement) {
  const bounds = parkVisibleTerrainBounds(view);
  ctx.fillStyle = "#244421";
  ctx.fillRect(0, 0, view.viewportWidth, view.viewportHeight);
  if (bounds.left >= bounds.right || bounds.top >= bounds.bottom) return;

  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.scale, view.scale);
  ctx.beginPath();
  ctx.rect(0, 0, view.worldWidth, view.worldHeight);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Draw only tiles intersecting the viewport; no enormous world-size bitmap.
  const visible = parkTerrainCellWindow(bounds, GRASS_TILE_WORLD_SIZE, GRASS_TILE_WORLD_SIZE, 0);
  for (let y = visible.minY; y <= visible.maxY; y++) {
    for (let x = visible.minX; x <= visible.maxX; x++) {
      ctx.drawImage(image, x * GRASS_TILE_WORLD_SIZE, y * GRASS_TILE_WORLD_SIZE, GRASS_TILE_WORLD_SIZE, GRASS_TILE_WORLD_SIZE);
    }
  }
  ctx.restore();
}

function paintTerrain(ctx: CanvasRenderingContext2D, view: ParkTerrainViewport) {
  const bounds = parkVisibleTerrainBounds(view);
  ctx.clearRect(0, 0, view.viewportWidth, view.viewportHeight);
  ctx.fillStyle = "#6d8754";
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
    wash.addColorStop(0, warm ? "rgba(205,195,117,.20)" : "rgba(34,77,44,.23)");
    wash.addColorStop(0.55, warm ? "rgba(202,196,121,.085)" : "rgba(45,91,50,.09)");
    wash.addColorStop(1, "rgba(95,128,76,0)");
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
    ctx.fillStyle = rand > 0.91 ? "rgba(230,221,153,.027)" : "rgba(29,69,39,.03)";
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
    ctx.fillStyle = seed > 0.55 ? "rgba(195,201,129,.09)" : "rgba(36,76,47,.12)";
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
    ctx.strokeStyle = seed > 0.52 ? "rgba(209,215,147,.38)" : "rgba(35,76,40,.33)";
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 2);
    ctx.quadraticCurveTo(x - 1, y - length * 0.5, x + 3, y - length);
    ctx.moveTo(x + 1, y + 2);
    ctx.quadraticCurveTo(x + 4, y - length * 0.3, x + 8, y - length * 0.7);
    ctx.stroke();
  });

  ctx.restore();
}
