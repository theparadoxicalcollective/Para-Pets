/**
 * PetAnimatorCanvas
 *
 * Memory-safe alternative to PetAnimator for use inside building interiors.
 *
 * Why this exists:
 *   PetAnimator renders each pet part as a separate <img> element in the DOM.
 *   On iOS, every DOM <img> becomes a persistent GPU texture at its SOURCE
 *   resolution — not its display size. A 1000×1000 part image = 4 MB of GPU
 *   memory regardless of whether it's shown at 10px or 1000px.
 *   With 10–15 parts per pet and a large interior background already loaded,
 *   this pushes iOS over its GPU memory limit → tab crash.
 *
 *   This component renders all parts onto a SINGLE <canvas> element instead.
 *   GPU memory = canvas.width × canvas.height × 4 bytes = ~130 KB for a
 *   180×180 interior pet. Part images are held in system memory (CPU-accessible
 *   RAM), which iOS handles far more gracefully than GPU VRAM.
 *
 * Animations supported (house mode):
 *   eyes blink, ears wiggle, arms sway, wings flap, tail wag.
 *   Driven by a requestAnimationFrame loop → evaluated frame-by-frame.
 *
 * Usage: drop-in for <PetAnimator mode="house" fillContainer> in interiors.
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

interface PetPart {
  id: string; templateId: string; partType: string; view: string; imageUrl: string;
  posX: number; posY: number; width: number; height: number; zIndex: number;
  pivotX: number; pivotY: number;
}

// Same constants as PetAnimator
const CANVAS_SIZE = 1000;
const ANIM_ONLY_PARTS = new Set(["eyes_closed", "mouth"]);
const LAYER_ORDER: Record<string, number> = {
  tail: 1, right_leg: 2, left_leg: 2, back_wing: 2, back_leg: 3, right_wing: 3,
  back_arm: 4, left_wing: 4, body: 5, front_wing: 6, right_arm: 7, front_leg: 7,
  left_arm: 8, front_arm: 8, right_ear: 9, left_ear: 9, head: 10,
  mouth: 12, mouth_closed: 13, eyes_closed: 14, eyes: 15,
};

// ── Animation evaluator ───────────────────────────────────────────────────────
// Returns opacity (0–1) and rotation (radians) for each part at a given time.
// Mirrors the CSS keyframe animations in PetAnimator's HOUSE_ANIMATIONS.
function kfi(kfs: [number, number][], t: number): number {
  if (t <= kfs[0][0]) return kfs[0][1];
  if (t >= kfs[kfs.length - 1][0]) return kfs[kfs.length - 1][1];
  for (let i = 0; i < kfs.length - 1; i++) {
    const [p0, v0] = kfs[i], [p1, v1] = kfs[i + 1];
    if (t >= p0 && t <= p1) return v0 + (v1 - v0) * ((t - p0) / (p1 - p0));
  }
  return kfs[kfs.length - 1][1];
}
const D2R = Math.PI / 180;

function evalAnim(partType: string, sec: number, blinkOff: number): { op: number; rot: number } {
  switch (partType) {
    case "eyes": {
      const t = ((sec + blinkOff) % 4) / 4;
      return { op: kfi([[0,1],[0.92,1],[0.95,0],[0.97,0],[1,1]], t), rot: 0 };
    }
    case "eyes_closed": {
      const t = ((sec + blinkOff) % 4) / 4;
      return { op: kfi([[0,0],[0.92,0],[0.95,1],[0.97,1],[1,0]], t), rot: 0 };
    }
    case "mouth":        return { op: 0, rot: 0 };
    case "mouth_closed": return { op: 1, rot: 0 };
    case "left_ear": {
      const t = (sec % 3.5) / 3.5;
      return { op: 1, rot: kfi([[0,0],[0.4,-1],[0.7,0.5],[1,0]], t) * D2R };
    }
    case "right_ear": {
      const t = (sec % 3.5) / 3.5;
      return { op: 1, rot: kfi([[0,0],[0.4,1],[0.7,-0.5],[1,0]], t) * D2R };
    }
    case "left_arm": case "front_arm": {
      const t = (sec % 3.5) / 3.5;
      return { op: 1, rot: kfi([[0,0],[0.5,3],[1,0]], t) * D2R };
    }
    case "right_arm": case "back_arm": {
      const t = (sec % 3.5) / 3.5;
      return { op: 1, rot: kfi([[0,0],[0.5,-2],[1,0]], t) * D2R };
    }
    case "left_wing": case "front_wing": {
      const t = (sec % 3.5) / 3.5;
      return { op: 1, rot: kfi([[0,0],[0.4,-3],[0.7,1.5],[1,0]], t) * D2R };
    }
    case "right_wing": case "back_wing": {
      const t = (sec % 3.5) / 3.5;
      return { op: 1, rot: kfi([[0,0],[0.4,3],[0.7,-1.5],[1,0]], t) * D2R };
    }
    case "tail": {
      const t = (sec % 4) / 4;
      return { op: 1, rot: kfi([[0,0],[0.35,-1.5],[0.7,1],[1,0]], t) * D2R };
    }
    default: return { op: 1, rot: 0 };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  petTemplateId: string;
  size: number;           // display size in px (canvas will be size×size)
  fillContainer?: boolean; // same semantics as PetAnimator
  className?: string;
  style?: React.CSSProperties;
}

export default function PetAnimatorCanvas({ petTemplateId, size, fillContainer = false, className = "", style }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef(0);
  const t0Ref      = useRef(0);
  const blinkRef   = useRef(Math.random() * 4);
  // System-memory images — NOT in the DOM, so they do NOT become GPU textures
  const partsRef   = useRef<{ part: PetPart; img: HTMLImageElement }[]>([]);
  const readyRef   = useRef(false);

  const { data: templateData } = useQuery<{ parts: PetPart[]; facing: string }>({
    queryKey: ["/api/pet-template-parts", petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!petTemplateId,
    staleTime: Infinity,
  });

  // Load part images into system memory (never inserted into the DOM)
  useEffect(() => {
    if (!templateData?.parts?.length) return;
    readyRef.current = false;
    partsRef.current = [];

    const allParts = templateData.parts;
    const facing = templateData.facing ?? "front";
    const frontCount = allParts.filter(p => p.view === "front").length;
    const backCount  = allParts.filter(p => p.view === "back").length;
    const resolvedView = facing === "back" ? "back"
      : (frontCount === 0 && backCount > 0) ? "back" : "front";

    const viewParts = allParts
      .filter(p => p.view === resolvedView)
      .sort((a, b) => (LAYER_ORDER[a.partType] ?? a.zIndex) - (LAYER_ORDER[b.partType] ?? b.zIndex));

    if (!viewParts.length) return;

    const entries = viewParts.map(part => ({ part, img: new Image() }));
    let loaded = 0;
    const onDone = () => {
      if (++loaded === entries.length) {
        partsRef.current = entries;
        readyRef.current = true;
      }
    };
    entries.forEach(e => { e.img.onload = onDone; e.img.onerror = onDone; e.img.src = e.part.imageUrl; });

    return () => { readyRef.current = false; partsRef.current = []; };
  }, [templateData]);

  // Canvas animation loop
  // The canvas GPU texture is size×size — tiny, regardless of source image resolution.
  // All part images are drawn from system memory via drawImage().
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    t0Ref.current = performance.now();

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (!readyRef.current) return;

      const sec = (now - t0Ref.current) / 1000;
      const parts = partsRef.current;
      const isLarge = parts.some(({ part: p }) => p.width >= 500 || p.height >= 500);
      const partScale = isLarge ? 0.3 : 1;
      // Map pet part positions to canvas pixel space.
      // For fillContainer: parts span the full size.
      // For non-fillContainer with large-style pets: parts span partScale * size, centered.
      // Math derivation — for fillContainer=true:
      //   canvasPx = (partCoord / CANVAS_SIZE) * size  (direct scale)
      // For fillContainer=false, large-style:
      //   CSS PetAnimator: scale(0.3) centered → canvasPx = 0.3 * partCoord * (size/CANVAS_SIZE)
      //   = (partCoord / CANVAS_SIZE) * (size * partScale) + centerOffset
      const drawSpan = fillContainer ? size : size * partScale;
      const offset   = fillContainer ? 0 : (size - drawSpan) / 2;

      ctx.clearRect(0, 0, size, size);

      for (const { part, img } of parts) {
        const { op, rot } = evalAnim(part.partType, sec, blinkRef.current);
        if (ANIM_ONLY_PARTS.has(part.partType) && op <= 0) continue;

        const left = offset + (part.posX / CANVAS_SIZE) * drawSpan;
        const top  = offset + (part.posY / CANVAS_SIZE) * drawSpan;
        const w    = (part.width  / CANVAS_SIZE) * drawSpan;
        const h    = (part.height / CANVAS_SIZE) * drawSpan;
        const px   = left + w * ((part.pivotX ?? 50) / 100);
        const py   = top  + h * ((part.pivotY ?? 50) / 100);

        ctx.save();
        ctx.globalAlpha = op;
        if (rot !== 0) { ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py); }
        try { ctx.drawImage(img, left, top, w, h); } catch { /* image not ready yet */ }
        ctx.restore();
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, fillContainer]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, imageRendering: "auto", ...style }}
    />
  );
}
