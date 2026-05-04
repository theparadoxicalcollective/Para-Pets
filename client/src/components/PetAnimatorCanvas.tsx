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

import { memo, useEffect, useRef } from "react";
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
  // ── Front-facing-only accessories that sit BEHIND the body silhouette
  //    (capes, satchels). Same z=3 + role as back_accessory_1/2 — kept
  //    in lockstep with PetAnimator's LAYER_ORDER so the canvas + img
  //    renderers stack identically.
  front_left_accessory: 3, front_right_accessory: 3,
  // ── Front-side accessories / front wings (in front of body) ───────────
  front_wing_2: 6, front_wing: 6,
  front_accessory_2: 6, front_accessory_1: 6,
  // ── Front-side limbs ──────────────────────────────────────────────────
  front_leg: 7, right_arm: 7,
  front_arm: 8, left_arm: 8, front_shoulder: 8,
  // ── Face / head ───────────────────────────────────────────────────────
  right_ear: 9, left_ear: 9,
  // Second ear pair on Head 1 — same z-band as the primary ears.
  // Mirrors PetAnimator's LAYER_ORDER.
  right_ear_2: 9, left_ear_2: 9,
  // Neck — sits one tick below the head (z=10) and above body / arms /
  // shoulders / accessories. Mirrors PetAnimator's LAYER_ORDER so the
  // canvas + img renderers stack the neck identically.
  neck: 9,
  head: 10,
  accessory_2: 11, accessory_1: 11,
  mouth: 12,
  mouth_closed: 13,
  eyes_closed: 14,
  eyes: 15,
  hair_right: 16,
  hair_left: 17,
  hair_center: 18,
  above_head: 19,
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
  "hair_left", "hair_right", "hair_center", "accessory_1", "accessory_2", "above_head",
  // Second pair of ears on Head 1 — must ride the head-bob wrapper
  // alongside the primary ears (same rule as in PetAnimator's
  // FACE_PART_TYPES). Out-of-phase swing comes from a slightly
  // different period (3.1 s vs 3.5 s) below.
  "left_ear_2", "right_ear_2",
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

// Body breath helper — used by every part that the img-renderer maps
// to `petIdleBody`: body itself, all four shoulder variants, back_arm
// (side-facing), and front/back accessories. Same 4.5 s period and
// ±1.2 % / ±2.2 % asymmetric scale as the body so the whole "back of
// the pet" group inhales/exhales as one unit. Halved from the previous
// ±2.4 % / ±4.6 % so the torso reads as gentle breathing rather than
// an obvious swell. Mirrors PetAnimator.tsx IDLE_ANIMATIONS.
function bodyBreath(sec: number): AnimResult {
  const w = (1 + sinWave(sec, 4.5)) * 0.5; // 0..1 sine
  return { op: 1, rot: 0, sx: 1 + w * 0.012, sy: 1 + w * 0.022 };
}

function evalAnim(partType: string, sec: number, blinkOff: number): AnimResult {
  // Strip multi-head prefix so h2_/h3_ duplicates pick up the same
  // animation as the base part (h2_left_wing flaps like left_wing,
  // h3_back_arm breathes like back_arm, etc.). Mirrors lookupAnim()
  // in the img renderer.
  const base = partType.startsWith("h2_") || partType.startsWith("h3_") ? partType.slice(3) : partType;
  switch (base) {
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
    case "left_ear": case "hair_left":
      return { op: 1, rot: -sinWave(sec, 3.5) * 2 * D2R };
    case "right_ear": case "hair_right":
      return { op: 1, rot:  sinWave(sec, 3.5) * 2 * D2R };
    // Center hair — rides the head-group bob applied externally (headBobPx
    // in the draw loop). Any additional per-part motion (formerly bodyBreath
    // = scale from the body's feet anchor) compounds with that bob and pushes
    // the hair above the head on every up-stroke. Return identity so the
    // wrapper's translateY is the ONLY force acting on this part.
    case "hair_center":
      return { op: 1, rot: 0 };
    // Second ear pair on Head 1 — same ±2° mirrored swing as the
    // primary ears, but on a 3.1 s period so it continuously drifts
    // in and out of phase with the 3.5 s primary pair. Mirrors the
    // img-renderer's IDLE_ANIMATIONS + getPartDuration entries.
    case "left_ear_2":
      return { op: 1, rot: -sinWave(sec, 3.1) * 2 * D2R };
    case "right_ear_2":
      return { op: 1, rot:  sinWave(sec, 3.1) * 2 * D2R };

    // Front-facing arms now breathe with the body (bodyBreath) so the
    // shoulder stays glued to the chest during inhale/exhale. Previously
    // they used an independent ±2° rotation which left the arm stationary
    // while the body scaled upward — creating a visible gap at the
    // shoulder. Mirrors the img-renderer's IDLE_ANIMATIONS change where
    // left_arm/right_arm now map to petIdleBody instead of
    // petIdleLeftArm/petIdleRightArm.
    case "left_arm":
    case "right_arm":
      return bodyBreath(sec);

    // Side-facing limbs — ALL ride the body breath so the side-
    // profile pet inflates and deflates as ONE silhouette. Earlier
    // front_arm had its own ±3° rotation, the legs translated 1.5 px,
    // and only back_arm rode the body breath — so the front arm
    // visibly desynced from the chest, the front leg ticked on its
    // own beat, and the back arm appeared static next to a moving
    // front arm. Mirrors the img-renderer's IDLE_ANIMATIONS where
    // front_arm/back_arm/front_leg/back_leg are all mapped to
    // petIdleBody. The transformOriginOverride logic in the img
    // renderer makes them scale around the body's foot anchor;
    // canvas already scales each part around its own pivot which is
    // typically the shoulder/hip, giving the same visual "rises with
    // the chest" effect.
    case "front_arm": case "back_arm":
      return bodyBreath(sec);
    case "front_leg":
    case "back_leg":
      // Side-facing legs are kept static — they do not scale with the body
      // so feet stay planted on the ground during idle breathing.
      return { op: 1, rot: 0 };

    // Shoulders breathe with the body so the whole torso group expands
    // and contracts together. Mirrors the img-renderer's IDLE_ANIMATIONS
    // mapping to petIdleBody.
    case "left_shoulder": case "right_shoulder":
    case "front_shoulder": case "back_shoulder":
      return bodyBreath(sec);

    // All six accessory part types share a tiny independent rotation
    // sway (±0.4° at 4 s, mirrors petIdleAccessorySway in the img
    // renderer). Independent of body breath — the user's request was
    // "have any accessories sway slightly", not lockstep-with-body.
    // Amplitude is small enough that even behind-body accessories
    // (back_accessory_*, front_left/right_accessory) don't visibly
    // drift off the body silhouette.
    case "front_accessory_1": case "front_accessory_2":
    case "back_accessory_1": case "back_accessory_2":
    case "front_left_accessory": case "front_right_accessory":
      return { op: 1, rot: sinWave(sec, 4) * 0.4 * D2R };

    // Wings — gentle ±3° sine flap at 4 s + a small ty oscillation so the
    // wings read as flapping (lifting through the rotation) instead of
    // pivoting in place like windshield wipers. Mirrors the img-
    // renderer's petIdleLeftWing / petIdleRightWing keyframes which use
    // the same translateY(±2 px) + rotate(±3 deg) pair. Rotations are
    // mirrored between left/right; the lift is shared so paired wings
    // bob up and down together.
    // The vertical lift was previously ±2 px which combined with the
    // ±3° rotation made wings visibly "lift off" the body during idle.
    // Reduced to ±0.6 px so the wings still have a subtle glide that
    // sells the rotation as a flap, without the wings ever appearing to
    // detach from the body silhouette. Mirrors the img renderer's
    // matching ±5 % → ±1.5 % reduction on petIdleLeftWing/RightWing.
    case "left_wing": case "front_wing":
    case "wing_set2_left": case "front_wing_2":
    case "head_wing_left":
      return { op: 1, rot: -sinWave(sec, 4) * 3 * D2R, ty: -sinWave(sec, 4) * 0.6 };
    case "right_wing": case "back_wing":
    case "wing_set2_right": case "back_wing_2":
    case "head_wing_right":
      return { op: 1, rot:  sinWave(sec, 4) * 3 * D2R, ty: -sinWave(sec, 4) * 0.6 };

    // Tails — angular swivel from the body-attachment end (right edge
    // of the alpha bbox). Pivot is now the RIGHT edge so the base stays
    // planted while the tip arcs up and down. Amplitudes are large
    // enough (±10-12°) to read as a clear swivel, not horizontal shimmer.
    // Per-slot durations and directions deliberately differ so multi-
    // tailed pets don't move in lockstep. Mirrors petIdleTail/2/3:
    //   • tail   (slot 1): 4.5 s, ±12° — primary visible wag.
    //   • tail_2 (slot 2): 3.7 s, ±10° — drifts out of phase.
    //   • tail_3 (slot 3): 4.1 s, ∓10° (mirrored) — fan open/closed.
    case "tail":
      // Swivel from the right-edge base (body attachment). Large angle
      // (±12°) so the motion reads clearly as an angular tail swivel
      // rather than subtle horizontal shimmer. Matches the CSS renderer's
      // petIdleTail keyframe (rotation only, right-edge pivot).
      return { op: 1, rot: sinWave(sec, 4.5) * 12 * D2R };
    case "tail_2":
      // Slot 2: slightly smaller arc (±10°), different period so
      // multi-tailed pets drift in and out of phase.
      return { op: 1, rot: sinWave(sec, 3.7) * 10 * D2R };
    case "tail_3":
      // Slot 3: mirrored direction so a three-tail fan fans open/closed.
      return { op: 1, rot: -sinWave(sec, 4.1) * 10 * D2R };

    // Body — breathing. Vertical scale grows / shrinks ~3.8 % at peak,
    // horizontal ~2.0 %. Pivots from part center so the breath reads as
    // expansion rather than translation. (Trimmed from 4.6 / 2.8 % so
    // the body and head bob read at parity — see bodyBreath comment.)
    case "body":
      return bodyBreath(sec);

    // Neck — rides the body breath alongside shoulders and back_arm so
    // the chest-to-head silhouette inflates and exhales as one unit.
    // Mirrors PetAnimator's IDLE_ANIMATIONS where neck → petIdleBody.
    case "neck":
      return bodyBreath(sec);

    // Head — gentle vertical bob. ty is now ZERO here because the
    // head bob amplitude is PER-PET (computed from the body's
    // alpha-trimmed visible height — see headBobAmpRef in
    // PetAnimatorCanvasInner). The actual bob is applied externally
    // in the draw loop using that ref so every head-group part
    // (head, eyes, mouth, ears) receives the same amplitude. This
    // matches the img renderer's petIdleHead var(--pet-head-bob)
    // approach and fixes the small-body-pet bug where a fixed
    // amplitude looked huge on pets like The Paradox while looking
    // right on big-body pets — same fix, same formula, both
    // renderers stay in sync. The translation is applied to every
    // HEAD_GROUP_PARTS member at draw time so the eyes and mouth
    // stay glued to the skull.
    case "head":
      return { op: 1, rot: 0, ty: 0 };

    // Above-head accessory (crowns / halos / horns / hats). Previously
    // -7 px (and the img renderer was -15 % of the part height) which
    // lifted tall accessories visibly off the skull and read as
    // "wobbling violently" instead of "floating gently". Reduced to
    // -2.5 px so the float is just enough to read on top of the head
    // bob without ever visibly separating from the head. Mirrors the
    // img renderer's matching -15 % → -5 % reduction on
    // petAboveHeadBounce.
    case "above_head":
      return { op: 1, rot: 0, ty: -((1 + sinWave(sec, 4)) * 0.5) * 2.5 };

    default: return { op: 1, rot: 0 };
  }
}

interface Props {
  petTemplateId: string;
  size: number;
  fillContainer?: boolean;
  /** When true, the union alpha-bbox of all visible parts is scaled +
   *  centered to fill the canvas (with a small margin so wing rotations
   *  don't clip). Eliminates the "invisible square padding" that comes
   *  from each part's transparent margins + the canvas's 1000-unit
   *  layout area never being fully populated by any single template.
   *  Caller-driven so PvE callers (BattleArena, PetEquip) can keep the
   *  legacy padded layout untouched while PvP opts in. */
  fitVisible?: boolean;
  /** Target frame rate. Default 30 keeps the conservative budget that
   *  PvE arenas were designed against. PvP opts in to 60 for a more
   *  responsive feel during swipes & charge animations — the smaller
   *  PvP sprite sizes (74–168 px) keep total per-frame cost under
   *  budget even at 60 fps with 5 pets on screen. */
  fps?: number;
  /** Buffer-resolution multiplier on top of `size * dpr`. Default 1
   *  (the current behaviour). Pass 1.5–2 to supersample — useful in
   *  PvP where the displayed sprite is small (74–168 CSS px) and the
   *  source PNG parts have to be downsampled hard to fit. With
   *  `bufferScale = 1.5` the buffer becomes 234×234 for a 78 px pet at
   *  DPR 2 (instead of 156×156), giving the GPU more source pixels to
   *  sample from and the result composites onto the page through the
   *  browser's hardware bilinear scaler — same crispness boost as a
   *  3× retina screen would give us, without the 9× per-frame cost. */
  bufferScale?: number;
  className?: string;
  style?: React.CSSProperties;
}

function PetAnimatorCanvasInner({ petTemplateId, size, fillContainer = false, fitVisible = false, fps = 30, bufferScale = 1, className = "", style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const t0Ref     = useRef(0);
  const blinkRef  = useRef(Math.random() * 4);
  const partsRef  = useRef<{ part: PetPart; img: HTMLImageElement }[]>([]);
  const readyRef  = useRef(false);
  // World-space (1000-unit) point the body's breathe-scale pivots around.
  // Stored in a ref so the RAF draw loop (which only depends on
  // canvasPx/fillContainer/fitVisible/fps and never re-runs on
  // templateData changes) can read the latest value every frame without
  // restarting the loop.
  const bodyAnchorRef = useRef<{ x: number; y: number } | null>(null);
  // Stored in a ref so the RAF draw loop can read it without restarting.
  const resolvedViewRef = useRef<string>("front");
  // Per-pet head-bob amplitude in canvas logical px (the value that
  // multiplies the sin wave in the draw loop). Computed from the
  // body's ALPHA-TRIMMED visible height so the head's lift always
  // leads the body's top edge by ~0.6 % of the canvas, no matter how
  // big or small the body is. Mirrors the img-renderer's
  // --pet-head-bob CSS variable approach (see PetAnimator.tsx). The
  // 4× factor at the end converts the % value into the canvas's
  // logical-px scale (the same calibration the rest of evalAnim uses
  // for percent → canvas units).
  const headBobAmpRef = useRef<number>(10); // default ≈ -2.5 % × 4

  // Cap DPR at 2 — battle-arena renders 3 of these at once and 3× DPR (iPhone)
  // turns each frame into ~9× the work of a logical-pixel canvas, dropping the
  // whole battle to single-digit FPS. 2× still looks crisp on retina.
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  // Apply optional buffer-scale supersampling. Capped at 3× total
  // (DPR 2 × bufferScale 1.5) so we never exceed ~9 MB of canvas RAM
  // per pet even at the largest PvP sprite size of 168 px.
  const canvasPx = Math.round(size * dpr * Math.min(Math.max(bufferScale, 1), 1.5));

  const { data: templateData } = useQuery<{ parts: PetPart[]; facing: string; canFly?: boolean }>({
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
    const canFly = !!templateData.canFly;
    const frontCount = allParts.filter(p => p.view === "front").length;
    const backCount  = allParts.filter(p => p.view === "back").length;
    const resolvedView = facing === "back" ? "back"
      : (frontCount === 0 && backCount > 0) ? "back" : "front";
    resolvedViewRef.current = resolvedView;

    // SECONDARY head-group parts (h2_/h3_-prefixed) ALWAYS drop into a
    // z slot just below body (z=5 in LAYER_ORDER) so multi-head pets
    // render their side heads BEHIND the body silhouette. The base
    // offset (4) keeps them above legs/tails/wings (z=1–3); the per-part
    // add (LAYER_ORDER[basePt] * 0.001) preserves the natural face
    // stack order WITHIN the secondary head group so the eyes still
    // draw above the head etc. Mirrors the img-renderer's
    // headWrapperZ = bodyCompressedZ - 1 logic. Formerly a per-pet
    // override (Cerberus) — promoted to a built-in default so any
    // multi-head pet gets the correct depth without per-pet tweaks.
    const isSecondaryHeadGroupPart = (pt: string): boolean =>
      (pt.startsWith("h2_") || pt.startsWith("h3_")) && isHeadGroupPart(pt);
    const effectivePartZ = (part: PetPart): number => {
      if (isSecondaryHeadGroupPart(part.partType)) {
        const basePt = part.partType.replace(/^h[23]_/, "");
        const subZ = LAYER_ORDER[basePt] ?? 10;
        return 4 + subZ * 0.001;
      }
      return LAYER_ORDER[part.partType] ?? part.zIndex;
    };

    const viewParts = allParts
      .filter(p => p.view === resolvedView)
      .sort((a, b) => effectivePartZ(a) - effectivePartZ(b));

    if (!viewParts.length) return;

    // Compute the body's world-space breathe anchor — same formula the img
    // renderer uses (PetAnimator.tsx ≈ L1208–1218). Non-flying pets anchor
    // at the body's bottom-center (feet) so the head rises UPWARD with the
    // breath; flying pets anchor at the body's pivot (alpha-bbox-corrected)
    // so the head rises around the hover pivot. Stored once per templateData
    // load so the RAF loop doesn't recompute it every frame.
    const bodyPart = viewParts.find(p => p.partType === "body");
    // Recompute the body anchor from the latest available alpha bounds.
    // For flying pets the anchor depends on the body's alpha-trimmed
    // bounding box, which is only available AFTER getAlphaBounds() has
    // finished decoding and scanning the body image — on cold cache
    // that's an async event that lands ~100–500 ms after the part
    // entries are created. We call this once eagerly (so non-flying
    // pets get their anchor immediately, and flying pets that already
    // have the bounds cached from a previous render skip the wait),
    // then again from the body image's onload once getAlphaBounds
    // resolves, so canFly + override + cold cache renders correctly
    // instead of permanently using FULL_BOUNDS.
    const recomputeBodyDerived = () => {
      if (!bodyPart) {
        bodyAnchorRef.current = null;
        headBobAmpRef.current = 10; // safe fallback ≈ fixed 2.5 %
        return;
      }
      // Body anchor — feet for non-flying pets, alpha-corrected pivot
      // for flying pets. Same formula as the img renderer.
      if (!canFly) {
        bodyAnchorRef.current = {
          x: bodyPart.posX + bodyPart.width * 0.5,
          y: bodyPart.posY + bodyPart.height * 1.0,
        };
      } else {
        const bodyAbForAnchor = getAlphaBoundsSync(bodyPart.imageUrl) ?? FULL_BOUNDS;
        const bpxFrac = (bodyPart.pivotX ?? 50) / 100;
        const bpyFrac = (bodyPart.pivotY ?? 50) / 100;
        const bodyOriginXFrac = bodyAbForAnchor.left + bodyAbForAnchor.width * bpxFrac;
        const bodyOriginYFrac = bodyAbForAnchor.top + bodyAbForAnchor.height * bpyFrac;
        bodyAnchorRef.current = {
          x: bodyPart.posX + bodyPart.width * bodyOriginXFrac,
          y: bodyPart.posY + bodyPart.height * bodyOriginYFrac,
        };
      }
      // Per-pet head-bob amplitude. Same formula as the img renderer's
      // headBobCssPct: head's lift TRACKS the body's actual top rise
      // (no lead) so the head can never visibly fly above the body
      // silhouette regardless of pet size.
      //   bodyTopRise % = (visibleBodyHeight / CANVAS_SIZE) × 4.6
      //                   ── because petIdleBody scales scale(1, 1.046)
      //   headBobPct    = bodyTopRisePct       (no lead — head matches body)
      //   clamp         = [1.0 %, 2.4 %]
      //   ampLogical    = clamped × 4          (the % → logical-px factor)
      const bodyAb = getAlphaBoundsSync(bodyPart.imageUrl) ?? FULL_BOUNDS;
      const visibleBodyHeight = bodyPart.height * bodyAb.height;
      const bodyTopRisePct = (visibleBodyHeight / CANVAS_SIZE) * 2.2;
      const clamped = Math.min(1.2, Math.max(0.5, bodyTopRisePct));
      headBobAmpRef.current = clamped * 4;
    };
    recomputeBodyDerived();

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
        const boundsPromise = getAlphaBounds(entry.part.imageUrl, entry.img);
        // Once the BODY image's alpha-trimmed bounds resolve we
        // recompute every body-derived value:
        //   • body anchor (only matters for flying pets — non-flying
        //     anchor is just the geometric feet, no alpha needed)
        //   • head-bob amplitude (matters for ALL pets since the
        //     amplitude scales with the visible body height)
        // Cold-cache renders briefly use FULL_BOUNDS as a fallback,
        // then snap to the correct values within ~100–500 ms once
        // the alpha scan finishes. Same RAF loop reads the latest
        // ref values every frame so no animation restart is needed.
        if (bodyPart && entry.part.id === bodyPart.id) {
          void boundsPromise.then(() => {
            if (cancelled) return;
            recomputeBodyDerived();
          });
        }
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
    // Frame-rate throttle. Default is 30 fps — historically chosen
    // because 60 fps with 3 pets on screen was saturating the iOS GPU.
    // Callers (notably PvP) can opt back into 60 fps via the `fps`
    // prop now that the per-pet draw cost has dropped substantially
    // (DPR cap at 2, image-smoothing at "medium", alpha-bounds
    // caching). At small PvP sprite sizes (74–168 px) the GPU has
    // plenty of headroom for 60 fps × 5 pets, and the responsiveness
    // boost during swipes / charge animations is dramatic.
    let lastDraw = 0;
    const FRAME_MS = 1000 / Math.max(15, Math.min(fps, 60));

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (!readyRef.current) return;
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;

      const sec = (now - t0Ref.current) / 1000;
      const parts = partsRef.current;
      const isLarge = parts.some(({ part: p }) => p.width >= 500 || p.height >= 500);
      const partScale = isLarge ? 0.3 : 1;

      // canvasPx = size * dpr — the actual pixel buffer dimensions.
      // fitVisible forces full-canvas drawing because the whole point of
      // fit-mode is to make the visible pet fill the wrapper; leaving
      // the legacy 30 % centered draw region would constrain the fit-
      // scaled pet to a tiny inner box and the user would still see a
      // huge transparent square around it (the original complaint).
      const fillFull = fillContainer || fitVisible;
      const drawSpan = fillFull ? canvasPx : canvasPx * partScale;
      const offset   = fillFull ? 0 : (canvasPx - drawSpan) / 2;

      ctx.clearRect(0, 0, canvasPx, canvasPx);
      ctx.imageSmoothingEnabled = true;
      // Pixel-quality dial. We tried "low" (looked fuzzy in PvP with 5
      // pets at small sizes) and "high" (sharp but caused GPU stutter
      // on older iPhones running iOS Safari, which renders the high
      // setting via a multi-tap downsampler that's quite expensive at
      // DPR=2/3). "medium" lands in the sweet spot — visibly sharper
      // than "low" while staying within budget even on iPhone X-class
      // hardware. Spec: bilinear-with-prefilter ≈ trilinear, well-
      // supported since iOS 10.1.
      ctx.imageSmoothingQuality = "medium";

      // Fit-to-visible-bbox: compute the union of every part's alpha-
      // tight rect (in 1000-unit logical coords), then scale + recenter
      // so the visible pet fills the canvas. Recomputed per frame so
      // the bbox tightens automatically as alpha-bounds resolve from
      // their async scan. Cheap (~10 parts × constant arithmetic).
      // ANIM_ONLY_PARTS (eyes_closed, mouth, etc) are excluded so
      // blink/expression overlays don't expand the bbox during their
      // frames-with-opacity-0. A 0.94 margin leaves ~3 % headroom on
      // each side so the wings' ±5° flap doesn't clip at the edge.
      let fitScale = 1;
      let fitCx    = CANVAS_SIZE / 2; // bbox center in 1000-unit space
      let fitCy    = CANVAS_SIZE / 2;
      if (fitVisible && parts.length > 0) {
        let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
        for (const { part } of parts) {
          // Strip h2_/h3_ prefix so multi-head templates' duplicate
          // expression-overlay parts (h2_eyes_closed, h3_mouth, etc.)
          // get excluded from the bbox union the same way the base
          // eyes_closed / mouth do — otherwise their padded image
          // rectangle would inflate the bbox even though they're
          // invisible during their opacity-0 frames, dragging the fit
          // center off the actual visible silhouette on multi-head
          // pets (the architect flagged this as the one real
          // correctness gap in the fit-bbox math).
          const baseType = part.partType.replace(/^h[23]_/, "");
          if (ANIM_ONLY_PARTS.has(baseType)) continue;
          const ab = getAlphaBoundsSync(part.imageUrl) ?? FULL_BOUNDS;
          const vL = part.posX + part.width  * ab.left;
          const vT = part.posY + part.height * ab.top;
          const vR = part.posX + part.width  * (ab.left + ab.width);
          const vB = part.posY + part.height * (ab.top  + ab.height);
          if (vL < minL) minL = vL;
          if (vT < minT) minT = vT;
          if (vR > maxR) maxR = vR;
          if (vB > maxB) maxB = vB;
        }
        if (isFinite(minL)) {
          const bboxW = maxR - minL;
          const bboxH = maxB - minT;
          fitCx = (minL + maxR) / 2;
          fitCy = (minT + maxB) / 2;
          const span = Math.max(bboxW, bboxH);
          // Tightened from 0.94 → 0.99 (1 % total, 0.5 % per side) so
          // the visible silhouette fills almost the entire wrapper —
          // which is what the user means by "no invisible padding"
          // around their pets in PvP. Wings flap by ±5 % of their own
          // box, which itself is a fraction of the canvas, so the peak
          // overshoot is ≪ 0.5 % and any clipping is invisible.
          if (span > 0) fitScale = (CANVAS_SIZE * 0.99) / span;
        }
      }

      // Compute the head bob ONCE per frame so every head-group part
      // (head, eyes, mouth, ears) shares the same vertical offset and
      // the face stays anchored to the skull as it floats. The
      // amplitude is PER-PET (read from headBobAmpRef) so small-body
      // pets like The Paradox don't get the head launched off the
      // body — see the headBobAmpRef comment / recomputeBodyDerived
      // for the formula. evalAnim("head") now returns ty=0 because
      // the bob is applied externally here; the head itself picks
      // up headBobPx in the part loop below alongside the face parts.
      //
      // Period 4.5 s — phase-locked to the body breath rhythm so the
      // primary head lifts on the body's inhale and settles on the
      // exhale. Mirrors the img-renderer's headSyncBreath override
      // which forces the primary head's natural 3 s petIdleHead
      // animation onto the 4.5 s body cadence in idle mode.
      const headBob = -((1 + sinWave(sec, 4.5)) * 0.5) * headBobAmpRef.current;
      // Convert "CSS px @ requested size" to canvas-buffer px. drawSpan
      // is ALREADY in buffer px (= canvasPx = size·dpr after rounding),
      // so the ratio drawSpan/size already includes the dpr factor —
      // multiplying by dpr again would double-scale the motion. Apply
      // the fit-scale so the head bob shrinks/grows in lockstep with
      // the visible pet (otherwise a 1.2× fit would make the bob 1.2×
      // smaller relative to the pet — visible drift on tall sprites).
      const headBobPx = headBob * (drawSpan / size) * fitScale;

      // SECONDARY heads (h2_/h3_-prefixed head-group parts) ALWAYS use
      // a richer combined motion (sway + small drift + rotation) instead
      // of riding the standard vertical bob. h2 and h3 each get a
      // DISTINCT motion personality so the two side heads on multi-head
      // pets like the Cerberus Serpent read as individual characters
      // rather than mirrored copies of one shape.
      //
      // Mirrors the img-renderer's petIdleHeadSway / petIdleHeadSwayAlt
      // keyframes — each keyframe combines translate(X, Y) and rotate.
      // Calibration: factor 4 matches the existing headBob convention
      // (headBobAmpRef = clamped × 4), so % values stay numerically
      // consistent with the head bob inside the canvas renderer. This
      // is intentionally a smaller absolute amplitude than the literal
      // CSS-% math would give (which would be ×10 for CANVAS_SIZE=1000),
      // because the canvas pet has been visually calibrated against the
      // factor-4 head bob for many iterations — switching to ×10 here
      // would make the sway 2.5× larger than the head bob and break
      // the established visual balance. Both renderers display the
      // SAME pet visually; relative ratios within each renderer matter
      // more than literal cross-renderer pixel parity.
      //
      // So: petIdleHead's translateY(-2.4%) maps to canvas amplitude
      // 9.6 logical units (= 2.4 × 4), and translate(±0.5%) maps to
      // ±2.0 logical units, translate(±0.4%) → ±1.6 units, etc.
      //
      // Different periods (3.2 s for h2, 4.1 s for h3) plus larger
      // phase offsets (0.4 / 1.4 s) keep the two heads continuously
      // drifting in and out of phase so they never lock to the same
      // beat. sinWave returns -1..+1 directly so the motions are
      // symmetric around 0, just like the alternate-direction CSS
      // keyframes in the img renderer.
      const PCT_TO_LOGICAL = 4 * (drawSpan / size) * fitScale;
      const swayMotionFor = (pt: string): { dx: number; dy: number; rot: number } => {
        if (pt.startsWith("h3_")) {
          // h3_head: sway right→left, lift slightly + tilt — the
          // "alert glance" character. Mirrors petIdleHeadSwayAlt.
          //   translateX  +0.5% → -0.5%  (mean 0,  amp 0.5%)
          //   translateY  +0.3% → -0.4%  (mean -0.05%, amp 0.35%)
          //   rotate      +1.2° → -1.2°  (mean 0,  amp 1.2°)
          const t = sinWave(sec + 1.4, 4.1);
          return {
            dx: -t * 0.5 * PCT_TO_LOGICAL,
            dy: -t * 0.35 * PCT_TO_LOGICAL - 0.05 * PCT_TO_LOGICAL,
            rot: -t * 1.2 * D2R,
          };
        }
        if (pt.startsWith("h2_")) {
          // h2_head: sway left→right, slight nod down — the "shy lean"
          // character. Mirrors petIdleHeadSway.
          //   translateX  -0.5% → +0.5%  (mean 0,  amp 0.5%)
          //   translateY  -0.2% → +0.3%  (mean 0.05%, amp 0.25%)
          //   rotate      -0.9° → +0.9°  (mean 0,  amp 0.9°)
          const t = sinWave(sec + 0.4, 3.2);
          return {
            dx: t * 0.5 * PCT_TO_LOGICAL,
            dy: t * 0.25 * PCT_TO_LOGICAL + 0.05 * PCT_TO_LOGICAL,
            rot: t * 0.9 * D2R,
          };
        }
        return { dx: 0, dy: 0, rot: 0 };
      };
      const isSecondaryHeadGroupPartLocal = (pt: string): boolean =>
        (pt.startsWith("h2_") || pt.startsWith("h3_")) && isHeadGroupPart(pt);
      // Canvas-centre pivot for the secondary head wrapper rotation —
      // matches the img-renderer's wrapper transform-origin (50% 50%
      // of the canvas) so a small wrapper rotation makes each head
      // arc through space around the centre rather than spinning in
      // place. drawSpan is in buffer px; offset adds the centred
      // padding when fillContainer is off.
      const wrapperCx = offset + drawSpan / 2;
      const wrapperCy = offset + drawSpan / 2;

      for (const { part, img } of parts) {
        // Heads route through evalAnim("head") above; for individual
        // head-group parts we still call evalAnim so eyes blink and
        // ears sway, then layer the shared head bob on top.
        const anim = evalAnim(part.partType, sec, blinkRef.current);
        const rot = anim.rot;
        const op = anim.op;
        if (ANIM_ONLY_PARTS.has(part.partType) && op <= 0) continue;

        // Apply fit-to-bbox transform in logical (1000-unit) space:
        // scale around the visible bbox center so it lands at the
        // canvas center, then convert to buffer px via drawSpan. When
        // fitVisible is off, fitScale=1 and fitCx=fitCy=CANVAS_SIZE/2,
        // which is the identity transform — same output as before.
        const lLogical = (part.posX - fitCx) * fitScale + CANVAS_SIZE / 2;
        const tLogical = (part.posY - fitCy) * fitScale + CANVAS_SIZE / 2;
        const wLogical = part.width  * fitScale;
        const hLogical = part.height * fitScale;
        const left = offset + (lLogical / CANVAS_SIZE) * drawSpan;
        const top  = offset + (tLogical / CANVAS_SIZE) * drawSpan;
        const w    = (wLogical / CANVAS_SIZE) * drawSpan;
        const h    = (hLogical / CANVAS_SIZE) * drawSpan;
        // Re-map the artist's pivot percentage onto the actual visible
        // pixels of the part image (alpha bbox) instead of the full
        // padded image. This keeps tails / wings rotating around their
        // real anchor (the base of the tail, the shoulder of the wing)
        // even when the source PNG has lots of transparent space
        // around the artwork. Falls back to the full bbox until the
        // async alpha scan finishes.
        const ab = getAlphaBoundsSync(part.imageUrl) ?? FULL_BOUNDS;
        const isTailPart = part.partType === "tail" || part.partType === "tail_2" || part.partType === "tail_3";
        // Tails swivel from their BASE — where the tail connects to the
        // pet body. The correct X edge depends on the pet's facing direction:
        //   • "front" (pet faces right): body is to the right of the tail
        //     image, so root is at the RIGHT edge → pxPct = 1.0.
        //   • "back"  (pet faces left):  body is to the left of the tail
        //     image, so root is at the LEFT edge → pxPct = 0.0.
        // Y stays at 1.0 (bottom of alpha-bbox) so the base stays planted.
        const tailFacingRight = resolvedViewRef.current !== "back";
        const pxPct = isTailPart ? (tailFacingRight ? 1.0 : 0.0) : (part.pivotX ?? 50) / 100;
        const pyPct = isTailPart ? 1.0 : (part.pivotY ?? 50) / 100;
        const px = left + w * (ab.left + ab.width  * pxPct);
        const py = top  + h * (ab.top  + ab.height * pyPct);

        // Per-part vertical offset (head bob OR above-head float OR
        // the part's own ty if it has one). Same CSS-px → buffer-px
        // conversion as headBobPx above; do NOT multiply by dpr. Also
        // multiplied by fitScale so anim motion stays proportional to
        // the visibly-rendered pet (when fitVisible enlarges the pet).
        //
        // SECONDARY heads (h2_/h3_-prefixed) ALWAYS use the combined
        // sway motion (dx + dy + wrapper rotation) INSTEAD of bobbing
        // vertically. We zero out both the natural ty (returned by
        // evalAnim for "h2_head"/"h3_head") AND the shared headBob so
        // they don't double-up bob+sway. The wrapper rotation is
        // applied around the canvas centre below so all parts of the
        // same secondary head group stay glued and arc together.
        const isSecondaryHeadHere = isSecondaryHeadGroupPartLocal(part.partType);
        let dx = 0;
        let dy = 0;
        let wrapperRot = 0;
        // Side-facing head nod: a small rotation applied in addition to
        // the vertical headBobPx so the head appears to breathe rather than
        // just slide up and down. Only the "head" part rotates — eyes and
        // ears ride the wrapper dy already and don't need their own rotation.
        // Mirrors PetAnimator.tsx's petIdleHeadSide keyframe (0.7°).
        let headNodRot = 0;
        if (isSecondaryHeadHere) {
          const m = swayMotionFor(part.partType);
          dx = m.dx;
          dy = m.dy;
          wrapperRot = m.rot;
        } else {
          dy = anim.ty ? anim.ty * (drawSpan / size) * fitScale : 0;
          if (isHeadGroupPart(part.partType) && part.partType !== "h2_head" && part.partType !== "h3_head") {
            // Apply the per-pet head bob to every PRIMARY head-group
            // part — including "head" itself. evalAnim("head") now
            // returns ty=0 (the bob is computed externally above with
            // the per-pet amplitude), so this is no longer a double-
            // bob — the head and face parts all share exactly one
            // headBobPx contribution and stay glued together as the
            // skull floats.
            dy += headBobPx;
            if (resolvedViewRef.current === "back" && part.partType === "head") {
              headNodRot = sinWave(sec, 4.5) * 0.7 * D2R;
            }
          }
        }

        const sx = anim.sx ?? 1;
        const sy = anim.sy ?? 1;
        const hasScale = sx !== 1 || sy !== 1;
        const hasTransform = (rot + headNodRot) !== 0 || dx !== 0 || dy !== 0 || hasScale || wrapperRot !== 0;

        ctx.save();
        ctx.globalAlpha = op;
        if (hasTransform) {
          // For secondary heads, apply the wrapper rotation FIRST
          // (around the canvas centre = same pivot the img-renderer's
          // wrapper rotates around) so every h2_/h3_ part of the same
          // head group rotates as one coherent unit. Then apply the
          // per-part transform on top.
          if (wrapperRot !== 0) {
            ctx.translate(wrapperCx, wrapperCy);
            ctx.rotate(wrapperRot);
            ctx.translate(-wrapperCx, -wrapperCy);
          }
          // Apply transforms around the pivot so rotation/scale don't
          // drift the part across the canvas. dx/dy are the sway
          // translations (secondary heads) or vertical bob /
          // above-head float / part-specific ty.
          ctx.translate(px + dx, py + dy);
          if ((rot + headNodRot) !== 0) ctx.rotate(rot + headNodRot);
          if (hasScale) ctx.scale(sx, sy);
          ctx.translate(-px, -py);
        }
        try { ctx.drawImage(img, left, top, w, h); } catch { /* image not ready */ }
        ctx.restore();
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
    // `fps` is intentionally in the deps so a runtime fps change
    // (e.g. PvE → PvP transition reusing the same canvas instance)
    // tears down the RAF loop and recomputes FRAME_MS instead of
    // staying stuck at the original throttle.
  }, [canvasPx, fillContainer, fitVisible, fps]);

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

// Memoize so a parent's per-frame setState (e.g. PvP's 60 Hz position
// updates via setPets) doesn't re-render every pet sprite each frame.
// PetAnimatorCanvas owns its own RAF + canvas draw loop, so a skipped
// React render does NOT pause the visible animation — it only avoids
// reconciliation cost. The win on the PvP arena (4 pets × 60 Hz) is
// significant.
//
// IMPORTANT: default shallow comparison is used, which means callers
// MUST pass stable references for `style`, `className`, etc. — if you
// build a new object literal in JSX (e.g. `style={{ filter: "..." }}`)
// the memo is defeated for that callsite. Hoist static styles to a
// module-level const, or memoize dynamic ones. Existing consumers
// (BattleArena.tsx, PetEquipAccessoriesPage.tsx, PvpBattlePage.tsx)
// follow this rule.
const PetAnimatorCanvas = memo(PetAnimatorCanvasInner);
export default PetAnimatorCanvas;
