/**
 * PetAnimatorCanvas — memory-safe interior pet renderer.
 *
 * Each PetAnimator <img> part becomes a full-source-resolution GPU texture on iOS.
 * 4 pets × 12 parts × ~4 MB each = ~192 MB GPU → crash.
 *
 * This component renders all parts onto ONE <canvas> per pet.
 * GPU cost = (size × dpr)² × 4 bytes ≈ 380 KB (110px, 3× screen).
 * Part images live in system RAM via `new Image()` — never GPU textures.
 *
 * Sharp rendering: canvas backing store = size × devicePixelRatio, displayed
 * at size CSS pixels → identical crispness to a native <img> on retina screens.
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAlphaBounds, getAlphaBoundsSync, FULL_BOUNDS } from "@/lib/alphaBounds";

interface PetPart {
  id: string; templateId: string; partType: string; view: string; imageUrl: string;
  posX: number; posY: number; width: number; height: number; zIndex: number;
  pivotX: number; pivotY: number;
}

const CANVAS_SIZE = 1000;
const ANIM_ONLY_PARTS = new Set(["eyes_closed", "mouth"]);
// Canonical layer order — kept in lockstep with the LAYER_ORDER table in
// PetAnimator.tsx (≈ line 692). The img-renderer (PetAnimator) is the
// reference for visual stacking; this canvas-renderer must match it part
// for part or PvP pets render with limbs / hair / wings on the wrong side
// of the body. New part types added to PetAnimator MUST be mirrored here.
const LAYER_ORDER: Record<string, number> = {
  // ── Tail / hind decorations (deepest back layer) ──────────────────────
  head_wing_left: 1, head_wing_right: 1,
  tail: 1, tail_2: 1, tail_3: 1,
  back_hair: 1,
  // ── Wings (back-layer in side view, body wings on front view) ─────────
  back_wing: 2, back_wing_2: 2,
  right_wing: 2, left_wing: 2,
  wing_set2_left: 2, wing_set2_right: 2,
  // ── Back-side limbs / accessories (behind body) ───────────────────────
  back_leg: 3, right_leg: 3, left_leg: 3,
  back_accessory_2: 3, back_accessory_1: 3,
  back_arm: 4, back_shoulder: 4,
  // ── Body ──────────────────────────────────────────────────────────────
  body: 5,
  // ── Front-side accessories / front wings (in front of body) ───────────
  front_wing_2: 6, front_wing: 6,
  front_accessory_2: 6, front_accessory_1: 6,
  // ── Front-side limbs ──────────────────────────────────────────────────
  front_leg: 7, right_arm: 7,
  front_arm: 8, left_arm: 8, front_shoulder: 8,
  // ── Face / head ───────────────────────────────────────────────────────
  right_ear: 9, left_ear: 9,
  head: 10,
  accessory_2: 11, accessory_1: 11,
  mouth: 12,
  mouth_closed: 13,
  eyes_closed: 14,
  eyes: 15,
  hair_right: 16,
  hair_left: 17,
  above_head: 18,
};

// Parts that should ride along with the head bob (so the whole head reads
// as one floating object instead of the eyes/mouth detaching from the
// skull on every up-stroke). Mirrors the canonical FACE_PART_TYPES + isFacePart()
// rule in PetAnimator.tsx (≈ line 286): a base set of face-anchored part
// types, plus any h2_/h3_-prefixed variant of those base types so multi-head
// pets bob each face as a unit. Also includes "head" itself and the
// prefixed head variants so the head wrapper drives the wrapper transform.
//
// IMPORTANT: keep this list in lockstep with FACE_PART_TYPES in
// PetAnimator.tsx. Adding a part here that the img-renderer does NOT bob
// (or vice-versa) creates "renderer drift" — the same template animates
// differently on the canvas vs the img path. Notably, head_wing_left/right
// are NOT in the canonical face group (they animate independently like
// regular wings) so they MUST stay out of this set.
const FACE_BASE_PARTS = new Set([
  "eyes", "eyes_closed", "left_ear", "right_ear", "mouth", "mouth_closed",
  "hair_left", "hair_right", "accessory_1", "accessory_2", "above_head",
]);
const isHeadGroupPart = (partType: string): boolean => {
  if (partType === "head") return true;
  if (FACE_BASE_PARTS.has(partType)) return true;
  // Strip h2_/h3_ prefix and recheck the base set, so h2_accessory_1,
  // h3_hair_left, h2_above_head, h3_head, etc. all ride their own head's bob.
  const m = partType.match(/^h[23]_(.+)$/);
  if (!m) return false;
  return m[1] === "head" || FACE_BASE_PARTS.has(m[1]);
};

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
// Pure sine wave for buttery-smooth idle motion. `Math.sin(2π·t)` gives
// us the canvas equivalent of the 9-keyframe symmetric sine the img-based
// PetAnimator now uses for wings / body / head — except here we get
// continuous infinite resolution between samples, so the motion never
// "snaps" between keyframes regardless of how slowly the cycle runs.
const sinWave = (sec: number, periodSec: number) =>
  Math.sin((sec / periodSec) * Math.PI * 2);

interface AnimResult {
  op: number;        // opacity multiplier
  rot: number;       // rotation in RADIANS
  ty?: number;       // translateY in CSS px (relative to canvas size)
  sx?: number;       // x-scale (1 = unchanged) — pivot at part center
  sy?: number;       // y-scale
}

function evalAnim(partType: string, sec: number, blinkOff: number): AnimResult {
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

    // Ears — sine sweep at 3.5 s. Subtle ±2°.
    case "left_ear":
      return { op: 1, rot: -sinWave(sec, 3.5) * 2 * D2R };
    case "right_ear":
      return { op: 1, rot:  sinWave(sec, 3.5) * 2 * D2R };

    // Arms — slow gentle sweep.
    case "left_arm": case "front_arm":
      return { op: 1, rot: -sinWave(sec, 3.5) * 3 * D2R };
    case "right_arm": case "back_arm":
      return { op: 1, rot:  sinWave(sec, 3.5) * 2 * D2R };

    // Wings — clean ±5° sine flap at 4 s, matching the img-renderer's
    // 5-keyframe symmetric sweep. Math.sin gives infinite-resolution
    // smoothness so the canvas version never stutters between samples.
    case "left_wing": case "front_wing":
      return { op: 1, rot: -sinWave(sec, 4) * 5 * D2R };
    case "right_wing": case "back_wing":
      return { op: 1, rot:  sinWave(sec, 4) * 5 * D2R };

    // Tail — ±1.2° at 5 s.
    case "tail":
      return { op: 1, rot: sinWave(sec, 5) * 1.2 * D2R };

    // Body — breathing. Vertical scale grows / shrinks ~4.6 % at peak,
    // horizontal ~2.8 %. Pivots from part center so the breath reads as
    // expansion rather than translation.
    case "body": {
      const w = (1 + sinWave(sec, 4.5)) * 0.5; // 0..1 sine
      return { op: 1, rot: 0, sx: 1 + w * 0.028, sy: 1 + w * 0.046 };
    }

    // Head — gentle vertical bob, identical to the img-renderer's
    // petIdleHead (peak −3.6 px scaled to canvas). The translation is
    // applied to every HEAD_GROUP_PARTS member at draw time so the eyes
    // and mouth stay glued to the skull.
    case "head":
      return { op: 1, rot: 0, ty: -((1 + sinWave(sec, 3)) * 0.5) * 3.6 };

    // Above-head accessory (crowns / halos) — bigger, slower float so it
    // reads as a separate buoyant object rather than glued to the head.
    case "above_head":
      return { op: 1, rot: 0, ty: -((1 + sinWave(sec, 4)) * 0.5) * 5 };

    default: return { op: 1, rot: 0 };
  }
}

interface Props {
  petTemplateId: string;
  size: number;
  fillContainer?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function PetAnimatorCanvas({ petTemplateId, size, fillContainer = false, className = "", style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const t0Ref     = useRef(0);
  const blinkRef  = useRef(Math.random() * 4);
  const partsRef  = useRef<{ part: PetPart; img: HTMLImageElement }[]>([]);
  const readyRef  = useRef(false);

  // Cap DPR at 2 — battle-arena renders 3 of these at once and 3× DPR (iPhone)
  // turns each frame into ~9× the work of a logical-pixel canvas, dropping the
  // whole battle to single-digit FPS. 2× still looks crisp on retina.
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const canvasPx = Math.round(size * dpr);

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

    const entries = viewParts.map(part => {
      const img = new Image();
      // Set crossOrigin BEFORE assigning src so the alpha-bounds scan
      // can read pixel data without tainting the canvas. Same-origin
      // images ignore this; cross-origin assets need the server to
      // send Access-Control-Allow-Origin (which our static / object
      // storage routes do).
      img.crossOrigin = "anonymous";
      return { part, img };
    });
    let loaded = 0;
    let cancelled = false;
    const onDone = (entry: { part: PetPart; img: HTMLImageElement }) => {
      if (cancelled) return; // effect was torn down before image finished loading
      // Kick off an alpha-bounds scan as soon as each part image
      // decodes. The scan caches its result, so subsequent renders
      // (and other PetAnimatorCanvas instances showing the same
      // template) all read from cache for free.
      if (entry.img.naturalWidth > 0) {
        void getAlphaBounds(entry.part.imageUrl, entry.img);
      }
      if (++loaded === entries.length) { partsRef.current = entries; readyRef.current = true; }
    };
    entries.forEach(e => { e.img.onload = () => onDone(e); e.img.onerror = () => onDone(e); e.img.src = e.part.imageUrl; });

    return () => {
      cancelled = true;
      // Detach handlers so any late load events for in-flight images
      // can't reach back into the now-stale `entries` closure.
      entries.forEach(e => { e.img.onload = null; e.img.onerror = null; });
      readyRef.current = false;
      partsRef.current = [];
    };
  }, [templateData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    t0Ref.current = performance.now();
    // Throttle to ~30fps. With 3 pets on screen the previous 60fps redraw was
    // saturating the iOS GPU. Pet idle animations look identical at 30fps.
    let lastDraw = 0;
    const FRAME_MS = 1000 / 30;

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (!readyRef.current) return;
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;

      const sec = (now - t0Ref.current) / 1000;
      const parts = partsRef.current;
      const isLarge = parts.some(({ part: p }) => p.width >= 500 || p.height >= 500);
      const partScale = isLarge ? 0.3 : 1;

      // canvasPx = size * dpr — the actual pixel buffer dimensions
      const drawSpan = fillContainer ? canvasPx : canvasPx * partScale;
      const offset   = fillContainer ? 0 : (canvasPx - drawSpan) / 2;

      ctx.clearRect(0, 0, canvasPx, canvasPx);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "low";

      // Compute the head bob ONCE per frame so every head-group part
      // (head, eyes, mouth, ears) shares the same vertical offset and
      // the face stays anchored to the skull as it floats.
      const headBob = evalAnim("head", sec, blinkRef.current).ty ?? 0;
      // Convert "CSS px @ requested size" to canvas-buffer px. drawSpan
      // is ALREADY in buffer px (= canvasPx = size·dpr after rounding),
      // so the ratio drawSpan/size already includes the dpr factor —
      // multiplying by dpr again would double-scale the motion.
      const headBobPx = headBob * (drawSpan / size);

      for (const { part, img } of parts) {
        // Heads route through evalAnim("head") above; for individual
        // head-group parts we still call evalAnim so eyes blink and
        // ears sway, then layer the shared head bob on top.
        const anim = evalAnim(part.partType, sec, blinkRef.current);
        const { op, rot } = anim;
        if (ANIM_ONLY_PARTS.has(part.partType) && op <= 0) continue;

        const left = offset + (part.posX / CANVAS_SIZE) * drawSpan;
        const top  = offset + (part.posY / CANVAS_SIZE) * drawSpan;
        const w    = (part.width  / CANVAS_SIZE) * drawSpan;
        const h    = (part.height / CANVAS_SIZE) * drawSpan;
        // Re-map the artist's pivot percentage onto the actual visible
        // pixels of the part image (alpha bbox) instead of the full
        // padded image. This keeps tails / wings rotating around their
        // real anchor (the base of the tail, the shoulder of the wing)
        // even when the source PNG has lots of transparent space
        // around the artwork. Falls back to the full bbox until the
        // async alpha scan finishes.
        const ab = getAlphaBoundsSync(part.imageUrl) ?? FULL_BOUNDS;
        const pxPct = (part.pivotX ?? 50) / 100;
        const pyPct = (part.pivotY ?? 50) / 100;
        const px = left + w * (ab.left + ab.width  * pxPct);
        const py = top  + h * (ab.top  + ab.height * pyPct);

        // Per-part vertical offset (head bob OR above-head float OR
        // the part's own ty if it has one). Same CSS-px → buffer-px
        // conversion as headBobPx above; do NOT multiply by dpr.
        let dy = anim.ty ? anim.ty * (drawSpan / size) : 0;
        if (isHeadGroupPart(part.partType) && part.partType !== "head" && part.partType !== "h2_head" && part.partType !== "h3_head") {
          // Already-bobbing parts (head itself) shouldn't double-bob.
          dy += headBobPx;
        }

        const sx = anim.sx ?? 1;
        const sy = anim.sy ?? 1;
        const hasScale = sx !== 1 || sy !== 1;
        const hasTransform = rot !== 0 || dy !== 0 || hasScale;

        ctx.save();
        ctx.globalAlpha = op;
        if (hasTransform) {
          // Apply transforms around the pivot so rotation/scale don't
          // drift the part across the canvas.
          ctx.translate(px, py + dy);
          if (rot !== 0) ctx.rotate(rot);
          if (hasScale) ctx.scale(sx, sy);
          ctx.translate(-px, -py);
        }
        try { ctx.drawImage(img, left, top, w, h); } catch { /* image not ready */ }
        ctx.restore();
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [canvasPx, fillContainer]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasPx}
      height={canvasPx}
      className={className}
      style={{ width: size, height: size, ...style }}
    />
  );
}
