import { GIFEncoder, quantize, applyPalette } from "gifenc";

/* ─────────────────────────────────────────────────────────────────────────── *
 *  Pet GIF renderer — deterministic, pure-canvas, no html-to-image.
 *
 *  iOS Safari can't reliably rasterise the live DOM into a canvas (SVG
 *  foreign-object capture frequently fails or returns blank frames), which
 *  is what produced the "discontinued"-style errors users saw when trying
 *  to save GIFs from the Test Animator on their phones.
 *
 *  This module renders each frame from scratch using `ctx.drawImage` calls
 *  on an offscreen <canvas>, then encodes the frame stack with `gifenc`.
 *  All animation math lives here — it mirrors the visual feel of the live
 *  PetAnimator but doesn't depend on any DOM CSS animations being captured.
 *
 *  Output: transparent animated GIF, well under 20 MB at 400×400 / ~18 fps.
 * ─────────────────────────────────────────────────────────────────────────── */

interface PetPart {
  id: string;
  templateId: string;
  partType: string;
  view: string;
  imageUrl: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  zIndex: number;
  pivotX: number;
  pivotY: number;
}

export type GifAnimation = "idle" | "petting" | "sleep";

export interface RenderPetGifOpts {
  parts: PetPart[];
  view: "front" | "back";
  animation: GifAnimation;
  /** Template facing — same value as pet_templates.facing.
   *  "left" or "right" = side-facing KC pet (front_arm + front_leg over head).
   *  Anything else (including undefined) = front-facing (left_arm + right_arm over head). */
  facing?: string;
  outputSize?: number;
  durationMs?: number;
  fps?: number;
  onProgress?: (frame: number, totalFrames: number) => void;
}

export interface CaptureResult {
  blob: Blob;
  frameCount: number;
  capturedMs: number;
}

const CANVAS_SIZE = 1000;

// Mirrors PetAnimator's LAYER_ORDER so the saved GIF matches the live preview
// (back layers first, eyes on top).
const LAYER_ORDER: Record<string, number> = {
  tail: 1, right_leg: 2, left_leg: 2, back_wing: 2,
  back_leg: 3, right_wing: 3, back_arm: 4, left_wing: 4,
  body: 5, front_wing: 6, right_arm: 7, front_leg: 7,
  left_arm: 8, front_arm: 8, right_ear: 9, left_ear: 9,
  // Second ear pair on Head 1 — same z-band as the primary ears.
  right_ear_2: 9, left_ear_2: 9,
  // Neck — sits in front of body (5) but BEHIND the arms (right_arm=7,
  // left_arm=8) so the arms always overlap the neck base. Mirrors
  // PetAnimator's LAYER_ORDER.
  neck: 6,
  head: 10, mouth: 12, mouth_closed: 13, eyes_closed: 14, eyes: 15,
};

const FACE_PART_TYPES = new Set([
  "eyes", "eyes_closed", "left_ear", "right_ear", "mouth", "mouth_closed",
  "hair_left", "hair_right", "accessory_1", "accessory_2",
  // Second ear pair on Head 1 — must group with the head wrapper.
  "left_ear_2", "right_ear_2",
]);

const ANIM_ONLY_PARTS = new Set([
  "eyes_closed", "mouth",
  "h2_eyes_closed", "h2_mouth",
  "h3_eyes_closed", "h3_mouth",
]);

function basePartType(pt: string): string {
  return pt.replace(/^h[23]_/, "");
}

function isHeadPartType(pt: string): boolean {
  return pt === "head" || pt === "h2_head" || pt === "h3_head";
}

function isFacePart(partType: string): boolean {
  // The head itself is its own anchor — never group it as a face part.
  if (isHeadPartType(partType)) return false;
  if (FACE_PART_TYPES.has(partType)) return true;
  const m = partType.match(/^h[23]_(.+)$/);
  return !!m && FACE_PART_TYPES.has(m[1]);
}

function isEyePartType(partType: string): boolean {
  const b = basePartType(partType);
  return b === "eyes" || b === "eyes_closed";
}

function isMouthPartType(partType: string): boolean {
  const b = basePartType(partType);
  return b === "mouth" || b === "mouth_closed";
}

// Map side-facing limb names onto their front-facing siblings so the same
// animation curves apply.
function canonicalPartType(pt: string): string {
  const base = basePartType(pt);
  if (base === "front_arm") return "left_arm";
  if (base === "back_arm") return "right_arm";
  if (base === "front_leg") return "left_leg";
  if (base === "back_leg") return "right_leg";
  if (base === "front_wing" || base === "back_wing" ||
      base === "front_wing_2" || base === "back_wing_2") return "right_wing";
  if (base === "wing_set2_left") return "left_wing";
  if (base === "wing_set2_right") return "right_wing";
  if (base === "hair_left") return "left_ear";
  if (base === "hair_right") return "right_ear";
  // Second ear pair on Head 1 — canonicalize to the primary ear so the
  // GIF export reuses the same mirrored rotation curve. Out-of-phase
  // drift between the two pairs comes from per-part-id phase delay
  // (see partPhase below), which differs by part.id, so the second
  // pair naturally beats slightly out of sync with the first in the
  // exported GIF.
  if (base === "left_ear_2") return "left_ear";
  if (base === "right_ear_2") return "right_ear";
  // Neck rides the body breath in the GIF — canonicalize to "body" so
  // the export uses the same scale curve as the body. Mirrors
  // PetAnimator's IDLE_ANIMATIONS where neck → petIdleBody.
  if (base === "neck") return "body";
  if (base === "back_hair") return "tail";
  if (base === "tail_2" || base === "tail_3") return "tail";
  if (base === "left_shoulder" || base === "right_shoulder" ||
      base === "front_shoulder" || base === "back_shoulder" ||
      base === "front_accessory_1" || base === "front_accessory_2" ||
      base === "back_accessory_1" || base === "back_accessory_2") return "body";
  // Head-attached accessories (hats, bows, etc.) wiggle with ear motion
  // during petting / sleep so they don't appear locked in place.
  if (base === "accessory_1") return "left_ear";
  if (base === "accessory_2") return "right_ear";
  return base;
}

function overlapArea(a: PetPart, b: PetPart): number {
  const xO = Math.max(0, Math.min(a.posX + a.width, b.posX + b.width) - Math.max(a.posX, b.posX));
  const yO = Math.max(0, Math.min(a.posY + a.height, b.posY + b.height) - Math.max(a.posY, b.posY));
  return xO * yO;
}

function centerOf(p: PetPart) { return { x: p.posX + p.width / 2, y: p.posY + p.height / 2 }; }
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildHeadGroups(parts: PetPart[]): { head: PetPart; faceParts: PetPart[] }[] {
  // Treat the primary head AND prefixed h2_head / h3_head as separate head
  // anchors so multi-headed templates each get their own group + wrapper.
  const headParts = parts.filter(p => isHeadPartType(p.partType));
  if (headParts.length === 0) return [];
  const groups = headParts.map(h => ({ head: h, faceParts: [] as PetPart[] }));
  const faceParts = parts.filter(p => isFacePart(p.partType));
  for (const fp of faceParts) {
    let bestOverlap = 0; let bestIdx = -1;
    for (let i = 0; i < headParts.length; i++) {
      const a = overlapArea(fp, headParts[i]);
      if (a > bestOverlap) { bestOverlap = a; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      groups[bestIdx].faceParts.push(fp);
    } else {
      const c = centerOf(fp);
      let minD = Infinity, minI = 0;
      for (let i = 0; i < headParts.length; i++) {
        const d = dist(c, centerOf(headParts[i]));
        if (d < minD) { minD = d; minI = i; }
      }
      groups[minI].faceParts.push(fp);
    }
  }
  return groups;
}

/* ── Animation sampling ───────────────────────────────────────────────────── */

interface Xform {
  tx: number; ty: number;
  rotate: number;
  scaleX: number; scaleY: number;
  opacity: number;
}
const NEUTRAL: Xform = { tx: 0, ty: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 };

// Bell-curve from 0→1→0 over t∈[0,1], peaks at t=0.5. Mirrors the
// "0% → 50% peak → 100%" CSS keyframe shape.
function bobCos(t: number): number { return (1 - Math.cos(2 * Math.PI * t)) / 2; }
// Pure sine for left-right rotations: 0 at 0/0.5/1, +1 at 0.25, -1 at 0.75.
function sineWave(t: number): number { return Math.sin(2 * Math.PI * t); }

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function partPhase(partId: string): number {
  // 0..0.375 phase offset (matches PetAnimator's 0–1.5s spread on a ~4s cycle).
  return ((hashStr(partId) % 1500) / 1000) / 4;
}

function sampleBodyPartTransform(part: PetPart, animation: GifAnimation, t: number): Xform {
  const pt = canonicalPartType(part.partType);

  if (animation === "sleep") {
    if (pt === "body") {
      const b = bobCos(t);
      return { tx: 0, ty: -1.1 * b, rotate: 0, scaleX: 1 + 0.030 * b, scaleY: 1 + 0.055 * b, opacity: 1 };
    }
    if (pt === "left_ear")  return { ...NEUTRAL, rotate: -1 * bobCos(t) };
    if (pt === "right_ear") return { ...NEUTRAL, rotate:  1 * bobCos(t) };
    if (pt === "tail")      return { ...NEUTRAL, ty: -0.8 * bobCos(t), rotate: 1.2 * sineWave(t) };
    return NEUTRAL;
  }

  if (animation === "petting") {
    if (pt === "body") {
      const b = bobCos(t);
      return { tx: 0, ty: 0, rotate: 0, scaleX: 1 + 0.045 * b, scaleY: 1 + 0.080 * b, opacity: 1 };
    }
    if (pt === "left_ear")   return { ...NEUTRAL, rotate: -3 * bobCos(t) };
    if (pt === "right_ear")  return { ...NEUTRAL, rotate:  3 * bobCos(t) };
    if (pt === "left_arm")   return { ...NEUTRAL, rotate:  6 * bobCos(t) };
    if (pt === "right_arm")  return { ...NEUTRAL, rotate: -6 * bobCos(t) };
    if (pt === "left_wing")  return { ...NEUTRAL, rotate: -7 * bobCos(t) };
    if (pt === "right_wing") return { ...NEUTRAL, rotate:  7 * bobCos(t) };
    if (pt === "tail")       return { ...NEUTRAL, ty: -1 * bobCos(t), rotate: 3 * sineWave(t) };
    return NEUTRAL;
  }

  // idle (default)
  if (pt === "body") {
    const b = bobCos(t);
    return { tx: 0, ty: 0, rotate: 0, scaleX: 1 + 0.022 * b, scaleY: 1 + 0.040 * b, opacity: 1 };
  }
  if (pt === "left_ear")   return { ...NEUTRAL, rotate: -2 * sineWave(t) };
  if (pt === "right_ear")  return { ...NEUTRAL, rotate:  2 * sineWave(t) };
  // Arms: very subtle rotation (±1.5°) synced to body breath scale.
  // Reduced from ±3.5°/±3.0° to match the calmer CSS keyframe amplitude.
  if (pt === "left_arm") {
    const b = sineWave(t);
    return { tx: 0, ty: 0, rotate: 1.5 * b, scaleX: 1 + 0.006 * (b + 1), scaleY: 1 + 0.011 * (b + 1), opacity: 1 };
  }
  if (pt === "right_arm") {
    const b = sineWave(t);
    return { tx: 0, ty: 0, rotate: -1.5 * b, scaleX: 1 + 0.006 * (b + 1), scaleY: 1 + 0.011 * (b + 1), opacity: 1 };
  }
  if (pt === "left_wing")  return { ...NEUTRAL, rotate: -5 * sineWave(t) };
  if (pt === "right_wing") return { ...NEUTRAL, rotate:  5 * sineWave(t) };
  if (pt === "left_leg")   return { ...NEUTRAL, ty:  1.5 * bobCos(t) };
  if (pt === "right_leg")  return { ...NEUTRAL, ty:  1.5 * bobCos(t) };
  if (pt === "tail")       return { ...NEUTRAL, ty: -0.5 * bobCos(t), rotate: 1.2 * sineWave(t) };
  return NEUTRAL;
}

function sampleHeadGroupTransform(animation: GifAnimation, t: number, groupIdx: number): Xform {
  // Stagger multiple heads so they don't bob in lockstep
  const offsets = [0, 0.18, 0.36];
  const off = offsets[Math.min(groupIdx, offsets.length - 1)];
  const lt = ((t + off) % 1 + 1) % 1;

  if (animation === "sleep")   return { tx: 0, ty: -1.9 * bobCos(lt), rotate: -0.6 * sineWave(lt), scaleX: 1, scaleY: 1, opacity: 1 };
  if (animation === "petting") return { tx: 0, ty: -5.0 * bobCos(lt), rotate:  1.0 * sineWave(lt), scaleX: 1, scaleY: 1, opacity: 1 };
  return                              { tx: 0, ty: -3.6 * bobCos(lt), rotate:  0.8 * sineWave(lt * 0.5), scaleX: 1, scaleY: 1, opacity: 1 };
}

function sampleEyeOpacity(part: PetPart, animation: GifAnimation, blinkT: number): number {
  const isClosed = basePartType(part.partType) === "eyes_closed";
  // Petting + sleep: eyes pinned closed.
  if (animation === "petting" || animation === "sleep") return isClosed ? 1 : 0;
  // Idle: short blink at the end of the cycle.
  const closed = blinkT > 0.92 && blinkT < 0.97;
  return isClosed ? (closed ? 1 : 0) : (closed ? 0 : 1);
}

function sampleMouthOpacity(part: PetPart): number {
  const isOpen = basePartType(part.partType) === "mouth";
  return isOpen ? 0 : 1;
}

/* ── Image loading ────────────────────────────────────────────────────────── */

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // All part images come from same-origin /api/media/* (or data: URLs),
    // so the canvas is never tainted and we don't need crossOrigin.
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/* ── Particle overlays (hearts for petting, Z's for sleep) ────────────────── */

function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  const topY = cy - r * 0.4;
  ctx.moveTo(cx, cy + r * 0.95);
  ctx.bezierCurveTo(cx - r * 1.2, cy + r * 0.1, cx - r * 1.0, topY - r * 0.45, cx, cy - r * 0.05);
  ctx.bezierCurveTo(cx + r * 1.0, topY - r * 0.45, cx + r * 1.2, cy + r * 0.1, cx, cy + r * 0.95);
  ctx.closePath();
  ctx.fillStyle = "#ff6b8a";
  ctx.shadowColor = "rgba(255,107,138,0.55)";
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#cc3956";
  ctx.stroke();
  ctx.restore();
}

function drawHearts(ctx: CanvasRenderingContext2D, cycleT: number, size: number) {
  // 5 hearts staggered through the cycle (user requested "more hearts").
  for (let i = 0; i < 5; i++) {
    const phase = (cycleT + i / 5) % 1;
    const fadeIn = Math.min(1, phase / 0.12);
    const fadeOut = phase > 0.7 ? Math.max(0, 1 - (phase - 0.7) / 0.3) : 1;
    const alpha = fadeIn * fadeOut;
    if (alpha <= 0.02) continue;
    const colJitter = Math.sin(phase * Math.PI * 2 + i * 1.7) * 6;
    const x = size * (0.36 + 0.07 * i) + colJitter;
    const y = size * (0.58 - phase * 0.46);
    const r = size * 0.038 * (0.85 + 0.4 * Math.sin(phase * Math.PI));
    drawHeart(ctx, x, y, r, alpha);
  }
}

function drawZs(ctx: CanvasRenderingContext2D, cycleT: number, size: number) {
  for (let i = 0; i < 2; i++) {
    const phase = (cycleT + i / 2) % 1;
    const fadeIn = Math.min(1, phase / 0.12);
    const fadeOut = phase > 0.75 ? Math.max(0, 1 - (phase - 0.75) / 0.25) : 1;
    const alpha = 0.95 * fadeIn * fadeOut;
    if (alpha <= 0.02) continue;
    const x = size * (0.62 + 0.07 * i) + phase * size * 0.10;
    const y = size * (0.34 - phase * 0.30);
    const fontSize = Math.round(size * (0.06 + phase * 0.03));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${fontSize}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#7fbfb0";
    ctx.shadowColor = "rgba(127,191,176,0.55)";
    ctx.shadowBlur = 8;
    ctx.fillText("z", x, y);
    ctx.restore();
  }
}

/* ── Drawing ──────────────────────────────────────────────────────────────── */

function drawPart(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  part: PetPart,
  xform: Xform,
  outputSize: number,
) {
  if (xform.opacity <= 0) return;
  const px = (part.posX / CANVAS_SIZE) * outputSize;
  const py = (part.posY / CANVAS_SIZE) * outputSize;
  const pw = (part.width / CANVAS_SIZE) * outputSize;
  const ph = (part.height / CANVAS_SIZE) * outputSize;
  const pivotX = part.pivotX ?? 50;
  const pivotY = part.pivotY ?? 50;
  const pivotPx = px + (pivotX / 100) * pw;
  const pivotPy = py + (pivotY / 100) * ph;

  ctx.save();
  ctx.globalAlpha = xform.opacity;
  ctx.translate(pivotPx + xform.tx, pivotPy + xform.ty);
  ctx.rotate((xform.rotate * Math.PI) / 180);
  ctx.scale(xform.scaleX, xform.scaleY);
  ctx.translate(-pivotPx, -pivotPy);
  ctx.drawImage(img, px, py, pw, ph);
  ctx.restore();
}

/* ── Public renderer ──────────────────────────────────────────────────────── */

export async function renderPetGif(opts: RenderPetGifOpts): Promise<CaptureResult> {
  const outputSize = opts.outputSize ?? 400;
  const durationMs = opts.durationMs ?? 4000;
  const fps = opts.fps ?? 18;
  const totalFrames = Math.max(8, Math.round((durationMs / 1000) * fps));
  const delay = Math.round(1000 / fps);
  const startedAt = performance.now();

  // Resolve which view to draw, falling back to whatever has parts.
  const requestedView = opts.view;
  const frontCount = opts.parts.filter(p => p.view === "front").length;
  const backCount = opts.parts.filter(p => p.view === "back").length;
  const resolvedView: "front" | "back" =
    (requestedView === "front" && frontCount === 0 && backCount > 0) ? "back" :
    (requestedView === "back"  && backCount === 0 && frontCount > 0) ? "front" :
    requestedView;

  // Facing-aware over-head arm/leg types (mirrors PetAnimator.tsx).
  const gifFacing = opts.facing ?? "front";
  const gifIsSideFacing = gifFacing === "left" || gifFacing === "right";
  const overHeadPartTypes: ReadonlySet<string> = gifIsSideFacing
    ? new Set(["front_arm", "front_leg"])
    : new Set(["left_arm", "right_arm"]);

  const viewParts = opts.parts
    .filter(p => p.view === resolvedView)
    .sort((a, b) => {
      const getZ = (pt: string, fallback: number) =>
        overHeadPartTypes.has(basePartType(pt)) ? 20 : (LAYER_ORDER[basePartType(pt)] ?? fallback);
      return getZ(a.partType, a.zIndex) - getZ(b.partType, b.zIndex);
    });

  if (viewParts.length === 0) {
    throw new Error("This pet has no parts for the selected view yet.");
  }

  // Pre-load every part image. Failures are skipped (frame still renders
  // without that part) so a single broken upload can't kill the whole GIF.
  const partImages = new Map<string, HTMLImageElement>();
  await Promise.all(viewParts.map(async (p) => {
    try { partImages.set(p.id, await loadImage(p.imageUrl)); }
    catch (err) { console.warn("[petGif] missing part image", p.partType, err); }
  }));

  if (partImages.size === 0) {
    throw new Error("None of this pet's part images could be loaded.");
  }

  const headGroups = buildHeadGroups(viewParts);
  const headGroupPartIds = new Set(headGroups.flatMap(g => [g.head.id, ...g.faceParts.map(p => p.id)]));
  const allBodyParts = viewParts.filter(p => !headGroupPartIds.has(p.id));
  // Split into parts that draw under the head and parts that draw over it.
  const overHeadBodyParts = allBodyParts.filter(p => overHeadPartTypes.has(p.partType));
  const bodyParts = allBodyParts.filter(p => !overHeadPartTypes.has(p.partType));

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable on this device.");

  const gif = GIFEncoder();
  // Stable per-pet blink offset so blinks don't always land on the same frame.
  const baseBlinkOffset = ((hashStr(viewParts[0].id) % 4000) / 4000);

  for (let f = 0; f < totalFrames; f++) {
    const cycleT = f / totalFrames;

    ctx.clearRect(0, 0, outputSize, outputSize);

    // Body parts (non-head-group) — drawn first
    for (const part of bodyParts) {
      if (ANIM_ONLY_PARTS.has(part.partType)) continue;
      const img = partImages.get(part.id);
      if (!img) continue;
      const phase = partPhase(part.id);
      const localT = ((cycleT + phase) % 1 + 1) % 1;
      const xform = sampleBodyPartTransform(part, opts.animation, localT);
      drawPart(ctx, img, part, xform, outputSize);
    }

    // Head groups — wrapper transform applied around canvas centre, then
    // each part drawn in layer order with its own per-part transform.
    for (let gi = 0; gi < headGroups.length; gi++) {
      const grp = headGroups[gi];
      const groupX = sampleHeadGroupTransform(opts.animation, cycleT, gi);

      ctx.save();
      const cx = outputSize / 2, cy = outputSize / 2;
      ctx.translate(cx + groupX.tx, cy + groupX.ty);
      ctx.rotate((groupX.rotate * Math.PI) / 180);
      ctx.scale(groupX.scaleX, groupX.scaleY);
      ctx.translate(-cx, -cy);

      const allGroupParts = [grp.head, ...grp.faceParts].sort((a, b) => {
        const aL = LAYER_ORDER[basePartType(a.partType)] ?? a.zIndex;
        const bL = LAYER_ORDER[basePartType(b.partType)] ?? b.zIndex;
        return aL - bL;
      });

      // Per-group blink phase so multiple heads blink at slightly different times.
      const groupBlinkT = ((cycleT + baseBlinkOffset + gi * 0.4) % 1 + 1) % 1;

      for (const part of allGroupParts) {
        const img = partImages.get(part.id);
        if (!img) continue;

        if (isEyePartType(part.partType)) {
          const op = sampleEyeOpacity(part, opts.animation, groupBlinkT);
          if (op === 0) continue;
          drawPart(ctx, img, part, { ...NEUTRAL, opacity: op }, outputSize);
          continue;
        }
        if (isMouthPartType(part.partType)) {
          const op = sampleMouthOpacity(part);
          if (op === 0) continue;
          drawPart(ctx, img, part, { ...NEUTRAL, opacity: op }, outputSize);
          continue;
        }
        if (ANIM_ONLY_PARTS.has(part.partType)) continue;

        // head itself rides only the wrapper (no extra per-part transform)
        if (isHeadPartType(part.partType)) {
          drawPart(ctx, img, part, NEUTRAL, outputSize);
          continue;
        }

        // Other face parts (ears, hair, accessories) animate with the same
        // body-part sampler so they sway / wiggle alongside the wrapper bob.
        const phase = partPhase(part.id);
        const localT = ((cycleT + phase) % 1 + 1) % 1;
        const xform = sampleBodyPartTransform(part, opts.animation, localT);
        drawPart(ctx, img, part, xform, outputSize);
      }

      ctx.restore();
    }

    // Over-head arm/leg parts — drawn after all head groups so they
    // layer on top of the head in the final GIF, matching the live renderer.
    for (const part of overHeadBodyParts) {
      if (ANIM_ONLY_PARTS.has(part.partType)) continue;
      const img = partImages.get(part.id);
      if (!img) continue;
      const phase = partPhase(part.id);
      const localT = ((cycleT + phase) % 1 + 1) % 1;
      const xform = sampleBodyPartTransform(part, opts.animation, localT);
      drawPart(ctx, img, part, xform, outputSize);
    }

    // Particle overlays
    if (opts.animation === "petting") drawHearts(ctx, cycleT, outputSize);
    else if (opts.animation === "sleep") drawZs(ctx, cycleT, outputSize);

    // Encode this frame. rgba4444 + one-bit alpha + dispose=2 keeps the
    // transparent background transparent on every loop iteration.
    const id = ctx.getImageData(0, 0, outputSize, outputSize);
    const palette = quantize(id.data, 256, {
      format: "rgba4444",
      oneBitAlpha: true,
      clearAlpha: true,
      clearAlphaThreshold: 128,
    });
    const indexed = applyPalette(id.data, palette, "rgba4444");
    const transparentIndex = palette.findIndex(c => c.length >= 4 && c[3] === 0);
    const hasTransparent = transparentIndex >= 0;
    gif.writeFrame(indexed, outputSize, outputSize, {
      palette,
      delay,
      transparent: hasTransparent,
      transparentIndex: hasTransparent ? transparentIndex : 0,
      dispose: 2,
    });

    opts.onProgress?.(f + 1, totalFrames);
    // Yield occasionally so the encoding doesn't lock the UI thread.
    if ((f & 3) === 3) await new Promise(r => setTimeout(r, 0));
  }

  gif.finish();
  return {
    blob: new Blob([gif.bytes()], { type: "image/gif" }),
    frameCount: totalFrames,
    capturedMs: Math.round(performance.now() - startedAt),
  };
}

/** Trigger a browser download of an in-memory blob. Works on iOS Safari
 *  via the standard <a download> + click pattern (no Web Share API needed). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
