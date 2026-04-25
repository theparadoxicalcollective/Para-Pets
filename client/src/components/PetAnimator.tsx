import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { getAlphaBounds, getAlphaBoundsSync, FULL_BOUNDS } from "@/lib/alphaBounds";
import type { PetAnimationOverrides } from "@shared/schema";

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

interface PetAnimatorProps {
  petTemplateId: string;
  mode: "idle" | "walk" | "zoom" | "house" | "static" | "sleep" | "petting";
  view?: "front" | "back";
  size?: number;
  /** When true, expands the inner canvas so the visual output fills `size` exactly,
   *  compensating for the large-style 0.3× scale factor. Use in pet-house contexts. */
  fillContainer?: boolean;
  /** When true, the union of every visible part's alpha-tight rect is
   *  scaled + centered to fill the wrapper (with ~3 % margin so wing /
   *  above-head animations don't clip). Eliminates the "invisible
   *  square padding" around small templates and the slot-to-slot
   *  asymmetric offset where pets with off-center silhouettes shifted
   *  to the right of their slot in the PvP arena prep grid. Caller
   *  opt-in so existing layouts (HomePage, PetHousePage, BattleArena
   *  prep) keep their current padded composition. */
  fitVisible?: boolean;
  /** Override face parts to show a specific expression. "happy" forces eyes
   *  closed and mouth open (when those parts exist on the template), used
   *  when the pet is being celebrated (clicked / fed on the feeding page). */
  expression?: "neutral" | "happy" | "petted";
  className?: string;
  style?: React.CSSProperties;
}

// Face-part substitutions for non-neutral expressions. Returns the desired
// opacity for a given part, or `null` to mean "use the default".
function expressionOpacity(partType: string, expression: "neutral" | "happy" | "petted"): number | null {
  if (expression === "neutral") return null;
  // Strip head prefix so h2_eyes / h3_eyes are handled the same as eyes.
  const base = partType.replace(/^h[23]_/, "");
  if (expression === "happy") {
    if (base === "eyes" || base === "mouth_closed") return 0;       // hide
    if (base === "eyes_closed" || base === "mouth") return 1;       // force show
    return null;
  }
  // "petted": eyes-closed only (no mouth swap), the pet is contentedly squinting.
  if (expression === "petted") {
    if (base === "eyes") return 0;
    if (base === "eyes_closed") return 1;
    return null;
  }
  return null;
}

const CANVAS_SIZE = 1000;

const IDLE_ANIMATIONS: Record<string, string> = {
  eyes: "petIdleEyes",
  eyes_closed: "petIdleEyesClosed",
  mouth: "petIdleMouth",
  mouth_closed: "petIdleMouthClosed",
  head: "petIdleHead",
  left_ear: "petIdleLeftEar",
  right_ear: "petIdleRightEar",
  left_arm: "petIdleLeftArm",
  right_arm: "petIdleRightArm",
  body: "petIdleBody",
  left_wing: "petIdleLeftWing",
  right_wing: "petIdleRightWing",
  left_leg: "petIdleLeftLeg",
  right_leg: "petIdleRightLeg",
  // Tails move UP with the body's breath (so they read as part of the body).
  // When a pet has multiple tails, tail_2 also drifts a touch left and tail_3
  // a touch right — just enough to fan them apart visually without ever
  // separating from the body silhouette. All three share the body's 4.5 s
  // rhythm (see getPartDuration) so the lift is truly synchronised.
  tail: "petIdleTail",
  tail_2: "petIdleTail2",
  tail_3: "petIdleTail3",
  // Front-facing shoulders breathe with body (they sit ON the body
  // silhouette so they should inflate / deflate together).
  left_shoulder: "petIdleBody",
  right_shoulder: "petIdleBody",
  // Side-view shoulders: the FRONT shoulder gets a tiny independent
  // rotation (petIdleSideShoulder) so it reads with depth — not
  // glued-flat to the body. The BACK shoulder stays on petIdleBody so
  // the body silhouette behind the torso never breaks.
  front_shoulder: "petIdleSideShoulder",
  back_shoulder: "petIdleBody",
  // Front accessories also get a hint of independent motion via the
  // shoulder keyframe so a chest-mounted accessory (medal, harness)
  // doesn't read as locked to the body. Back accessories must stay on
  // petIdleBody so they ride the breath in lockstep with back_arm.
  front_accessory_1: "petIdleSideShoulder",
  front_accessory_2: "petIdleSideShoulder",
  back_accessory_1: "petIdleBody",
  back_accessory_2: "petIdleBody",
  // Hair pieces sway gently like ears
  hair_left: "petIdleLeftEar",
  hair_right: "petIdleRightEar",
  back_hair: "petIdleTail",
  // Above-head accessory (crowns / halos / hats) gets a small extra bounce
  // on top of the head wrapper's bob so it reads as floating / buoyant.
  above_head: "petAboveHeadBounce",
  // Front-facing wing sets
  wing_set2_left: "petIdleLeftWing",
  wing_set2_right: "petIdleRightWing",
  // Side-facing limbs.
  // back_arm shares `petIdleBody` (the breath scale) instead of swinging on
  // its own — that way the back arm rises and falls in perfect sync with
  // back_accessory_1 (which also uses petIdleBody), so quivers, satchels,
  // capes etc. mounted on the back arm don't drift away from the back
  // accessories during idle. Duration is also matched to body (4.5 s) in
  // getPartDuration so the phase locks.
  // front_arm gets its own slightly-larger amplitude keyframe so the
  // forward arm in profile reads with a clearer swing for depth (the
  // shared petIdleLeftArm keyframe is a smaller 5° sweep that's tuned
  // for the front-view left arm).
  front_arm: "petIdleSideFrontArm",
  back_arm: "petIdleBody",
  front_leg: "petIdleLeftLeg",
  back_leg: "petIdleRightLeg",
  // Side-facing wings mirror each other like the ears: the front wing flaps
  // one direction and the back wing flaps the opposite direction so the two
  // never sit perfectly in sync. Applies to both wing-set 1 and wing-set 2.
  front_wing: "petIdleLeftWing",
  front_wing_2: "petIdleLeftWing",
  back_wing: "petIdleRightWing",
  back_wing_2: "petIdleRightWing",
};

// Ground (non-flying) idle: same as the flying idle, but the head bob is
// replaced with a flat (rotation-only) version so the whole pet doesn't read
// as "floating". Body still breathes, ears/limbs/tail still twitch.
const IDLE_ANIMATIONS_GROUND: Record<string, string> = {
  ...IDLE_ANIMATIONS,
  head: "petIdleHeadGround",
};

/** Look up an animation name for a part. Falls back by stripping multi-head
 *  prefixes (h2_, h3_) so duplicate heads pick up the same per-part animations
 *  as Head 1 (e.g. h2_eyes blinks, h2_back_arm swings, etc.). */
function lookupAnim(map: Record<string, string>, partType: string): string | undefined {
  return map[partType] ?? map[partType.replace(/^h[23]_/, "")];
}


const WALK_ANIMATIONS: Record<string, string> = {
  eyes: "petWalkEyes",
  eyes_closed: "petWalkEyesClosed",
  mouth: "petWalkMouth",
  mouth_closed: "petWalkMouthClosed",
  head: "petWalkHead",
  left_ear: "petWalkLeftEar",
  right_ear: "petWalkRightEar",
  left_arm: "petWalkLeftArm",
  right_arm: "petWalkRightArm",
  body: "petWalkBody",
  left_wing: "petWalkLeftWing",
  right_wing: "petWalkRightWing",
  left_leg: "petWalkLeftLeg",
  right_leg: "petWalkRightLeg",
  tail: "petWalkTail",
  front_arm: "petWalkLeftArm",
  back_arm: "petWalkRightArm",
  front_leg: "petWalkLeftLeg",
  back_leg: "petWalkRightLeg",
  front_wing: "petWalkLeftWing",
  back_wing: "petWalkRightWing",
};

const ZOOM_ANIMATIONS: Record<string, string> = {
  ...WALK_ANIMATIONS,
  left_wing: "petZoomLeftWing",
  right_wing: "petZoomRightWing",
  front_wing: "petZoomLeftWing",
  back_wing: "petZoomRightWing",
};

// Petting mode: visibly bouncier than idle so the pet looks happy when
// being petted. Face parts are forced into the petted (eyes-closed) pose
// by the renderer; this map drives body / limb motion only.
const PETTING_ANIMATIONS: Record<string, string> = {
  body: "petPettingBody",
  left_arm: "petPettingLeftArm",
  right_arm: "petPettingRightArm",
  left_ear: "petPettingLeftEar",
  right_ear: "petPettingRightEar",
  left_wing: "petPettingLeftWing",
  right_wing: "petPettingRightWing",
  tail: "petPettingTail",
  tail_2: "petPettingTail",
  tail_3: "petPettingTail",
  // Side-facing equivalents — wings mirror like the ears (front flaps one
  // way, back flaps the opposite way) so they don't beat in lockstep.
  front_arm: "petPettingLeftArm",
  back_arm: "petPettingRightArm",
  front_wing: "petPettingLeftWing",
  back_wing: "petPettingRightWing",
  front_wing_2: "petPettingLeftWing",
  back_wing_2: "petPettingRightWing",
  hair_left: "petPettingLeftEar",
  hair_right: "petPettingRightEar",
  back_hair: "petPettingTail",
  above_head: "petAboveHeadBounce",
  // Shoulders / accessories breathe with the bouncy body
  left_shoulder: "petPettingBody",
  right_shoulder: "petPettingBody",
  front_shoulder: "petPettingBody",
  back_shoulder: "petPettingBody",
  // Head-attached accessories (hats, bows, etc.) wiggle with ear motion
  // so the whole head reads as alive while being petted.
  accessory_1: "petPettingLeftEar",
  accessory_2: "petPettingRightEar",
  h2_accessory_1: "petPettingLeftEar",
  h2_accessory_2: "petPettingRightEar",
  h3_accessory_1: "petPettingLeftEar",
  h3_accessory_2: "petPettingRightEar",
  // Prefixed ear / hair variants for multi-headed templates.
  h2_left_ear: "petPettingLeftEar",
  h2_right_ear: "petPettingRightEar",
  h3_left_ear: "petPettingLeftEar",
  h3_right_ear: "petPettingRightEar",
  h2_hair_left: "petPettingLeftEar",
  h2_hair_right: "petPettingRightEar",
  h3_hair_left: "petPettingLeftEar",
  h3_hair_right: "petPettingRightEar",
};

// Sleep mode: the body breathes more visibly, the head bobs gently, and
// ears / tail / hair sway slowly so the pet still reads as "alive but
// calm" rather than statue-frozen. Face parts (eyes, mouth) stay in the
// petted-style closed-eyes pose, forced by the renderer.
const SLEEP_ANIMATIONS: Record<string, string> = {
  body: "petSleepBody",
  // head is handled by the head-group wrapper (petSleepHead) below.
  left_ear: "petSleepLeftEar",
  right_ear: "petSleepRightEar",
  hair_left: "petSleepLeftEar",
  hair_right: "petSleepRightEar",
  tail: "petSleepTail",
  tail_2: "petSleepTail",
  tail_3: "petSleepTail",
  back_hair: "petSleepTail",
  above_head: "petAboveHeadBounce",
  // Accessories on the head should sway with the gentle ear motion so
  // hats, bows, etc. don't appear locked in place during sleep.
  accessory_1: "petSleepLeftEar",
  accessory_2: "petSleepRightEar",
  h2_accessory_1: "petSleepLeftEar",
  h2_accessory_2: "petSleepRightEar",
  h3_accessory_1: "petSleepLeftEar",
  h3_accessory_2: "petSleepRightEar",
  // Prefixed ear / hair variants for multi-headed templates.
  h2_left_ear: "petSleepLeftEar",
  h2_right_ear: "petSleepRightEar",
  h3_left_ear: "petSleepLeftEar",
  h3_right_ear: "petSleepRightEar",
  h2_hair_left: "petSleepLeftEar",
  h2_hair_right: "petSleepRightEar",
  h3_hair_left: "petSleepLeftEar",
  h3_hair_right: "petSleepRightEar",
};

// House mode: only blink (opacity) and rotation animations — no translateY or scale
// so the whole-body squish applied by the parent can keep feet on the ground.
const HOUSE_ANIMATIONS: Record<string, string> = {
  eyes: "petIdleEyes",
  eyes_closed: "petIdleEyesClosed",
  mouth: "petIdleMouth",
  mouth_closed: "petIdleMouthClosed",
  left_ear: "petIdleLeftEar",
  right_ear: "petIdleRightEar",
  left_arm: "petIdleLeftArm",
  right_arm: "petIdleRightArm",
  left_wing: "petIdleLeftWing",
  right_wing: "petIdleRightWing",
  front_arm: "petIdleLeftArm",
  back_arm: "petIdleRightArm",
  front_wing: "petIdleLeftWing",
  back_wing: "petIdleRightWing",
  tail: "petHouseTail",
  above_head: "petAboveHeadBounce",
  // head, body, legs intentionally omitted — they use translateY/scale
};

// Parts that are hidden by default and only appear during specific animations.
// Includes the per-head duplicates (h2_/h3_) so multi-headed pets blink/talk.
const ANIM_ONLY_PARTS = new Set([
  "eyes_closed", "mouth",
  "h2_eyes_closed", "h2_mouth",
  "h3_eyes_closed", "h3_mouth",
]);

// Face parts that belong to a head group. Anything starting with h2_/h3_ is a
// duplicate head and should be treated as a face part too — the helper below
// (isFacePart) covers those without listing every key.
const FACE_PART_TYPES = new Set([
  "eyes", "eyes_closed", "left_ear", "right_ear", "mouth", "mouth_closed",
  "hair_left", "hair_right", "accessory_1", "accessory_2", "above_head",
]);
const isFacePart = (partType: string): boolean => {
  if (FACE_PART_TYPES.has(partType)) return true;
  // h2_eyes, h3_left_ear, etc. — strip the head prefix and recheck.
  const m = partType.match(/^h[23]_(.+)$/);
  return !!m && FACE_PART_TYPES.has(m[1]);
};
// True for any "eyes" or "eyes_closed" part on any head (1, 2, or 3) — used so
// secondary heads get the same blink timing as the primary head.
const isEyePartType = (partType: string): boolean =>
  partType === "eyes" || partType === "eyes_closed" ||
  partType === "h2_eyes" || partType === "h2_eyes_closed" ||
  partType === "h3_eyes" || partType === "h3_eyes_closed";

const ANIMATION_STYLES = `
  @keyframes petIdleEyes {
    0%, 92%, 100% { opacity: 1; }
    95%, 97% { opacity: 0; }
  }
  @keyframes petIdleEyesClosed {
    0%, 92%, 100% { opacity: 0; }
    95%, 97% { opacity: 1; }
  }
  @keyframes petIdleMouth {
    0%, 100% { opacity: 0; }
  }
  @keyframes petIdleMouthClosed {
    0%, 100% { opacity: 1; }
  }
  /* Per-pet override (idle.mouthBreath): subtle swivel applied to the
     closed-mouth overlay so the jaw appears to drift gently with the
     body's breath, without ever fading in the open-mouth overlay (the
     paired cross-fade produced a visible white-edged ghost where the
     two overlays didn't perfectly align in alpha). Amplitude is much
     smaller than the wing flap (±5°) — only ±0.6° — so it reads as
     "the mouth is alive" without ever looking like the pet is moving
     its head. Phase-locked to bodyBreathDelay + 4.5 s duration. */
  @keyframes petIdleMouthSwivel {
    from { transform: rotate(-0.6deg); }
    to   { transform: rotate(0.6deg); }
  }
  /* ── Idle: 2-keyframe motion designed for animation-direction: alternate.

     Why 2 keyframes (not 5+):
       The previous attempts used 5- or 9-keyframe blocks and tried to make
       the motion smooth by applying cubic-bezier(0.37, 0, 0.63, 1) per
       segment. That bezier has slope=0 at BOTH ends, so the wing literally
       paused for an instant at every keyframe boundary — 4 micro-pauses
       per cycle = the "jolty" feel. No amount of resampling fixes that.

     The fix:
       Define ONLY the two extremes (A → B) and let the renderer drive
       direction:alternate + cubic-bezier(0.45, 0, 0.55, 1) (a close
       cubic approximation of a sine half-wave). The animation now has
       zero-velocity points only at A and B — exactly where a real sine
       wave's peaks would be — and is smooth between them. Same flap
       rhythm, no internal pauses, no piecewise stitching. */
  /* Head bob — uses % of the head wrapper height (100% of the inner pet
     canvas) so the lift scales naturally with the rendered pet size.
     The wrapper sits inside an inner-div that's scaled by partScale
     (0.3 for 1000-px source pets), so an absolute pixel value here gets
     squashed by the same factor on screen. -0.9% on a 1000-unit canvas
     = 9 inner-px = ~2.7 px on screen at typical pet sizes — small
     enough to feel like a breath, big enough to actually be perceived.
     Reduced from -1.5% so the head reads as a calm bob instead of a
     visible nod (especially noticeable on the side-view care/active-pet
     pages where the head is in profile and any vertical motion stands
     out more than on the front-facing arena view). */
  @keyframes petIdleHead {
    from { transform: translateY(0%); }
    to   { transform: translateY(-0.9%); }
  }
  /* Per-pet override (idle.headScalesWithBody): combines the standard
     head bob with the body's breathe scale so the head + every face
     part inflates / deflates in lockstep with the torso. Numbers are
     literally petIdleHead's translateY paired with petIdleBody's
     scale (1.028, 1.05) so a pet that opts into this keyframe reads
     as one continuously-breathing silhouette. The wrapper's
     transform-origin is set to the body anchor at render time so the
     head expands AROUND the body's pivot — producing the visible
     "head rises with the body" effect rather than scaling around the
     canvas centre (which would look detached). */
  @keyframes petIdleHeadBreath {
    from { transform: translateY(0%) scale(1, 1); }
    to   { transform: translateY(-0.9%) scale(1.028, 1.05); }
  }
  @keyframes petIdleLeftEar {
    from { transform: rotate(-2deg); }
    to   { transform: rotate(1deg); }
  }
  @keyframes petIdleRightEar {
    from { transform: rotate(2deg); }
    to   { transform: rotate(-1deg); }
  }
  @keyframes petIdleLeftArm {
    from { transform: rotate(0deg); }
    to   { transform: rotate(5deg); }
  }
  @keyframes petIdleRightArm {
    from { transform: rotate(0deg); }
    to   { transform: rotate(-3.5deg); }
  }
  /* Body breathing — alternates between rest and inhale peak. */
  @keyframes petIdleBody {
    from { transform: scale(1, 1); }
    to   { transform: scale(1.028, 1.05); }
  }
  /* Per-pet override (idle.subtleBreath): same breath rhythm at roughly
     half the inflate amplitude. Used by visually large pets like Crimson
     Dragon where the standard breath reads as a heave (especially when
     headScalesWithBody is also active and the head is riding the body's
     scale). All body-synced parts (back_arm, back_accessory_*, shoulders)
     are routed through this keyframe via idleBodyAnimName below so the
     subtle breath stays consistent across the whole "breathes with body"
     group. */
  @keyframes petIdleBodySubtle {
    from { transform: scale(1, 1); }
    to   { transform: scale(1.014, 1.025); }
  }
  /* Wings — flap motion. The wings travel UP together (matched
     translateY) on the up-stroke and DOWN together on the down-stroke,
     which reads as the bird/dragon pushing air down to hover. A ±5°
     rotation on each wing — mirrored left vs. right — adds the
     wing-tip tilt that sells the flap as flight.
     translateY is expressed in % of the wing element's own height so
     the lift scales with the part. The lift was previously ±5 % which
     made wings visibly "lift off" the body during idle — it read as
     panicked flapping rather than a calm hover. Reduced to ±1.5 % so
     the wings still glide up/down enough to read as alive, but never
     leave the body silhouette. The ±5° rotation does most of the
     "flap" work; the small lift just keeps the rotation from looking
     like a stiff windshield wiper. */
  @keyframes petIdleLeftWing {
    from { transform: translateY(1.5%) rotate(-5deg); }
    to   { transform: translateY(-1.5%) rotate(5deg); }
  }
  @keyframes petIdleRightWing {
    from { transform: translateY(1.5%) rotate(5deg); }
    to   { transform: translateY(-1.5%) rotate(-5deg); }
  }
  @keyframes petIdleLeftLeg {
    from { transform: translateY(0px); }
    to   { transform: translateY(1.5px); }
  }
  @keyframes petIdleRightLeg {
    from { transform: translateY(0px); }
    to   { transform: translateY(1.5px); }
  }
  /* Tails. Single-tail pets just lift gently with the body breath. Multi-
     tail pets (tail_2 / tail_3) additionally fan a hair left/right so the
     tails don't perfectly overlap. Amplitudes are deliberately tiny
     (≤ 1.5 px) so the tail base never separates from the body silhouette. */
  @keyframes petIdleTail {
    from { transform: translateY(0px); }
    to   { transform: translateY(-1.5px); }
  }
  @keyframes petIdleTail2 {
    from { transform: translate(0px, 0px); }
    to   { transform: translate(-1.5px, -1.5px); }
  }
  @keyframes petIdleTail3 {
    from { transform: translate(0px, 0px); }
    to   { transform: translate(1.5px, -1.5px); }
  }
  /* Ground head: small left/right tilt instead of upward bob. Reduced
     from ±0.6deg → ±0.4deg so the head reads as a barely-there sway
     instead of an active head-shake — matches the calmer petIdleHead
     amplitude above. */
  @keyframes petIdleHeadGround {
    from { transform: rotate(-0.4deg); }
    to   { transform: rotate(0.4deg); }
  }

  @keyframes petWalkEyes {
    0%, 85%, 100% { opacity: 1; }
    90%, 95% { opacity: 0; }
  }
  @keyframes petWalkEyesClosed {
    0%, 85%, 100% { opacity: 0; }
    90%, 95% { opacity: 1; }
  }
  @keyframes petWalkMouth {
    0%, 100% { opacity: 0; }
  }
  @keyframes petWalkMouthClosed {
    0%, 100% { opacity: 1; }
  }
  @keyframes petWalkHead {
    0%, 100% { transform: translateY(0px); }
    25% { transform: translateY(-1.5px); }
    75% { transform: translateY(-1.5px); }
  }
  @keyframes petWalkLeftEar {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-2deg); }
    75% { transform: rotate(1.5deg); }
  }
  @keyframes petWalkRightEar {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(2deg); }
    75% { transform: rotate(-1.5deg); }
  }
  @keyframes petWalkLeftArm {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-12deg); }
    75% { transform: rotate(12deg); }
  }
  @keyframes petWalkRightArm {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(12deg); }
    75% { transform: rotate(-12deg); }
  }
  @keyframes petWalkBody {
    0%, 100% { transform: translateY(0px); }
    25% { transform: translateY(-4px); }
    75% { transform: translateY(-4px); }
  }
  @keyframes petWalkLeftWing {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-5deg); }
    75% { transform: rotate(4deg); }
  }
  @keyframes petWalkRightWing {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(5deg); }
    75% { transform: rotate(-4deg); }
  }
  @keyframes petWalkLeftLeg {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(15deg); }
    75% { transform: rotate(-15deg); }
  }
  @keyframes petWalkRightLeg {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-15deg); }
    75% { transform: rotate(15deg); }
  }
  @keyframes petWalkTail {
    0%, 100% { transform: translateY(0px); }
    25% { transform: translateY(-1.5px); }
    50% { transform: translateY(0px); }
    75% { transform: translateY(-1px); }
  }
  @keyframes petZoomLeftWing {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-22deg); }
    75% { transform: rotate(18deg); }
  }
  @keyframes petZoomRightWing {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(22deg); }
    75% { transform: rotate(-18deg); }
  }
  @keyframes petHouseTail {
    0%, 100% { transform: rotate(0deg); }
    35% { transform: rotate(-1.5deg); }
    70% { transform: rotate(1deg); }
  }

  /* ── Sleep mode: slow, deep breathing + subtle limb sway so the pet
        clearly looks asleep but still alive (not statue-frozen). ─────── */
  @keyframes petSleepBody {
    0%, 100% { transform: scale(1, 1)         translateY(0px); }
    50%      { transform: scale(1.030, 1.055) translateY(-1.1px); }
  }
  @keyframes petSleepHead {
    0%, 100% { transform: translateY(0px)   rotate(0deg); }
    50%      { transform: translateY(-1.9px) rotate(-0.6deg); }
  }
  @keyframes petSleepLeftEar {
    0%, 100% { transform: rotate(0deg); }
    50%      { transform: rotate(-1deg); }
  }
  @keyframes petSleepRightEar {
    0%, 100% { transform: rotate(0deg); }
    50%      { transform: rotate(1deg); }
  }
  @keyframes petSleepTail {
    0%, 100% { transform: translateY(0px)   rotate(0deg); }
    50%      { transform: translateY(-0.8px) rotate(1.2deg); }
  }

  /* ── Petting mode: a soft, smooth wiggle while the pet is being petted.
        Amplitudes are deliberately small (the previous version read as
        "dramatic / choppy") and every keyframe has 25% / 75% intermediate
        steps so the sine ease can blend smoothly through the cycle without
        stop-and-go inflections. Paired with the closed-eyes "petted" face
        expression and floating heart particles. */
  @keyframes petPettingBody {
    0%, 100% { transform: scale(1, 1); }
    25%      { transform: scale(1.010, 1.018); }
    50%      { transform: scale(1.018, 1.034); }
    75%      { transform: scale(1.010, 1.018); }
  }
  @keyframes petPettingHead {
    0%, 100% { transform: translateY(0px); }
    25%      { transform: translateY(-0.7px); }
    50%      { transform: translateY(-1.6px); }
    75%      { transform: translateY(-0.7px); }
  }
  @keyframes petPettingLeftArm {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(1.2deg); }
    50%      { transform: rotate(2.4deg); }
    75%      { transform: rotate(1.2deg); }
  }
  @keyframes petPettingRightArm {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(-1.2deg); }
    50%      { transform: rotate(-2.4deg); }
    75%      { transform: rotate(-1.2deg); }
  }
  @keyframes petPettingLeftEar {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(-0.8deg); }
    50%      { transform: rotate(-1.5deg); }
    75%      { transform: rotate(-0.8deg); }
  }
  @keyframes petPettingRightEar {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(0.8deg); }
    50%      { transform: rotate(1.5deg); }
    75%      { transform: rotate(0.8deg); }
  }
  @keyframes petPettingLeftWing {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(-1.5deg); }
    50%      { transform: rotate(-3deg); }
    75%      { transform: rotate(-1.5deg); }
  }
  @keyframes petPettingRightWing {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(1.5deg); }
    50%      { transform: rotate(3deg); }
    75%      { transform: rotate(1.5deg); }
  }
  /* Tail: rotation only (no translateY) so it stays anchored to the body. */
  @keyframes petPettingTail {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(-2deg); }
    75%      { transform: rotate(2deg); }
  }
  /* Above Head: a clearly-visible floating bob on top of the head wrapper's
     own motion, so crowns / halos / hats / wisps read as lazily buoyant
     rather than glued to the skull. The previous 1.5 px peak was so
     subtle it looked perfectly stationary on screen — bumped to ~5 px
     and sampled at four points so the cubic-bezier ease produces a clean
     sine float instead of a two-keyframe pulse. The cycle is offset from
     the head bob (which is 3 s) by using a 4 s duration in
     getPartDuration so the two never sync up and the accessory always
     looks like it's lagging behind the head, the way a real floating
     object would. */
  /* Above-head accessory float. % of the part's own height instead of
     pixels — pure-px (-7 px) was getting squashed by the same 0.3×
     inner-div scale that flattens the wing translate. The amplitude
     ladder has come down twice now: -15% → -5% (stopped tall
     accessories from wobbling off the head) and now -5% → -3% (the
     side-view care + active-pet pages still showed the crown/hat
     visibly lifting too high above the skull on each breath). At -3%
     the float reads as a faint buoyancy that follows the head bob
     instead of an independent hop. */
  @keyframes petAboveHeadBounce {
    from { transform: translateY(0%); }
    to   { transform: translateY(-3%); }
  }
  /* Side-view front shoulder — a small independent rotation so the
     forward shoulder reads with a subtle depth cue instead of just
     scaling with the body. Back shoulders stay on petIdleBody so the
     silhouette behind the body never breaks. */
  @keyframes petIdleSideShoulder {
    from { transform: rotate(0deg); }
    to   { transform: rotate(1.8deg); }
  }
  /* Side-view front arm — slightly larger amplitude than petIdleLeftArm
     (which is also used for the front-view left arm) so the front arm
     in profile reads with a clearer "swing" / depth cue. */
  @keyframes petIdleSideFrontArm {
    from { transform: rotate(0deg); }
    to   { transform: rotate(7deg); }
  }

`;

function getPartDuration(partType: string, mode: "idle" | "walk" | "zoom" | "house" | "static" | "sleep" | "petting"): string {
  // Normalize prefixed head variants (h2_back_arm, h3_accessory_1, etc.) to
  // their base type so duration lookups match the same key as the un-prefixed
  // version. The animation NAME is already prefix-stripped in lookupAnim
  // (line ~132), so without this normalization a prefixed body-synced part
  // would correctly use the petIdleBody keyframe but with the WRONG duration
  // (3 s default instead of 4.5 s body period) — same shared delay + faster
  // cycle = visible drift on multi-headed pets within a few seconds. None
  // of the duration maps below contain h2_/h3_ entries, so stripping the
  // prefix here is always safe.
  const baseType = partType.replace(/^h[23]_/, "");
  if (mode === "sleep") {
    // Slow, calm breathing for the sleep export. Body / head are the only
    // moving parts in sleep mode; everything else is frozen.
    if (partType === "head" || partType.startsWith("h2_") || partType.startsWith("h3_")) return "5s";
    if (partType === "body") return "5.5s";
    return "5s";
  }
  if (mode === "house") {
    const durations: Record<string, string> = {
      eyes: "4s", eyes_closed: "4s", mouth: "5s", mouth_closed: "5s",
      left_ear: "3.5s", right_ear: "3.5s",
      left_arm: "3.5s", right_arm: "3.5s",
      left_wing: "3.5s", right_wing: "3.5s",
      tail: "4s",
      front_arm: "3.5s", back_arm: "3.5s",
      front_wing: "3.5s", back_wing: "3.5s",
    };
    return durations[baseType] || "3.5s";
  }
  if (mode === "idle") {
    const durations: Record<string, string> = {
      eyes: "4s", eyes_closed: "4s", mouth: "5s", mouth_closed: "5s",
      head: "3s", left_ear: "3.5s", right_ear: "3.5s",
      left_arm: "3.5s", right_arm: "3.5s",
      // Body breathing slowed to 4.5 s — combined with the new 9-keyframe
      // sine, this reads as deep relaxed breathing instead of a quick puff.
      body: "4.5s",
      // Wings slowed to 4 s. The old 3.5 s + 4-keyframe pattern read as a
      // stuttered 3-frame flap; with the new 9-keyframe sine we want a
      // longer cycle so each phase has enough time to glide.
      left_wing: "4s", right_wing: "4s",
      left_leg: "4s", right_leg: "4s",
      // Tails ride the body breath, so all three tail variants lock to the
      // body's 4.5 s rhythm. back_arm matches body too so it stays synced
      // with back_accessory_1 (also on petIdleBody / 4.5 s).
      tail: "4.5s", tail_2: "4.5s", tail_3: "4.5s",
      front_arm: "3.5s", back_arm: "4.5s",
      front_leg: "4s", back_leg: "4s",
      front_wing: "4s", back_wing: "4s",
      // Every part that's mapped to `petIdleBody` MUST share the body's
      // 4.5 s period — otherwise even with a shared bodyBreathDelay the
      // shorter-cycle parts visibly drift out of phase within a few
      // seconds. back_shoulder + back_accessory_1/2 + the front-view
      // shoulders are all on petIdleBody (see ANIMS) so they all need
      // 4.5 s here. The SIDE-VIEW front_shoulder + front_accessory_1/2
      // moved off petIdleBody onto petIdleSideShoulder — they get a
      // 4 s cycle so they drift slightly out of phase with the body
      // for the depth cue.
      back_shoulder: "4.5s", front_shoulder: "4s",
      left_shoulder: "4.5s", right_shoulder: "4.5s",
      back_accessory_1: "4.5s", back_accessory_2: "4.5s",
      front_accessory_1: "4s", front_accessory_2: "4s",
      // Above-head accessory floats on its own slow cycle, deliberately
      // out of phase with the head bob (3 s) so crowns / halos read as
      // a separate floating object rather than rigidly attached.
      above_head: "4s",
    };
    return durations[baseType] || "3s";
  }
  if (mode === "petting") {
    // Slow, smooth wiggle. Previous 1.4s + low-keyframe-count animations
    // looked choppy on the Pet Care and Active Pet pages — bumping every
    // moving part to ~2.4s gives the sine ease enough time to blend
    // through each phase so the motion reads as a soft, continuous purr
    // instead of a snappy bounce.
    const durations: Record<string, string> = {
      head: "2.4s", body: "2.4s",
      left_arm: "2.4s", right_arm: "2.4s",
      left_ear: "2.4s", right_ear: "2.4s",
      left_wing: "2.4s", right_wing: "2.4s",
      tail: "2.6s",
      front_arm: "2.4s", back_arm: "2.4s",
      front_wing: "2.4s", back_wing: "2.4s",
    };
    return durations[baseType] || "2.4s";
  }
  if (mode === "zoom") {
    const isWing = ["left_wing", "right_wing", "front_wing", "back_wing"].includes(partType);
    return isWing ? "0.45s" : "0.6s";
  }
  return "0.6s";
}

// Set of @keyframes that are 2-keyframe (from/to) and intended to be
// driven with `animation-direction: alternate` + a true sine ease.
// See the long comment above `petIdleHead` in ANIMATION_STYLES for the
// "why" — the short version is: 5+ keyframes ease'd per-segment causes
// a momentary pause at every keyframe boundary (slope=0 endpoints), so
// wings, ears, tails etc. felt jolty. Two extremes + alternate fixes it.
const ALTERNATE_MOTION_ANIMS = new Set<string>([
  "petIdleHead", "petIdleHeadGround",
  "petIdleLeftEar", "petIdleRightEar",
  "petIdleLeftArm", "petIdleRightArm",
  "petIdleBody",
  // Per-pet override (idle.subtleBreath): same 2-keyframe shape as
  // petIdleBody, just with a smaller scale target. Must alternate so it
  // shares the body's sine ping-pong rhythm — without this it would
  // snap back to 1.0 every cycle while every other body-synced part
  // (which keeps using petIdleBody's alternate behaviour via this set)
  // smoothly ping-pongs, producing a visible "tic" at the loop reset.
  "petIdleBodySubtle",
  "petIdleLeftWing", "petIdleRightWing",
  "petIdleLeftLeg", "petIdleRightLeg",
  "petIdleTail", "petIdleTail2", "petIdleTail3",
  "petAboveHeadBounce",
  // Side-view depth keyframes — also 2-keyframe from/to motions, so they
  // must alternate (ping-pong) instead of snapping back to 0 each cycle.
  "petIdleSideShoulder", "petIdleSideFrontArm",
  // Per-pet override head-breath. Must alternate (sine ping-pong) so it
  // shares the SAME rhythm profile as petIdleBody — otherwise the head
  // would inflate then snap back to 1.0 each cycle while the body keeps
  // breathing smoothly, producing a visible "pop" at every loop reset.
  "petIdleHeadBreath",
  // Per-pet override mouth-swivel. Alternates so the closed-mouth
  // overlay sweeps gently from −0.6° → +0.6° → −0.6° in lock-step with
  // the body's breath (the half-period of the alternate matches the
  // body's inhale / exhale).
  "petIdleMouthSwivel",
]);

// Build the CSS `animation` shorthand for a given keyframe name. For the
// new 2-keyframe motion set, halve the duration (so one alternate-cycle
// = forward + reverse keeps the same flap rhythm as the old full cycle)
// and apply the sine bezier + alternate direction. Everything else
// (blink opacity bursts, walk/zoom/sleep/petting multi-keyframe motions)
// keeps the existing behavior.
function buildAnimationCss(animName: string, duration: string, delay: string): string {
  if (!ALTERNATE_MOTION_ANIMS.has(animName)) {
    return `${animName} ${duration} cubic-bezier(0.37, 0, 0.63, 1) ${delay} infinite`;
  }
  const m = duration.match(/^([\d.]+)(s|ms)$/);
  const halved = m ? `${parseFloat(m[1]) / 2}${m[2]}` : duration;
  // cubic-bezier(0.45, 0, 0.55, 1) is the closest cubic approximation of a
  // sine half-wave — slope 0 at both ends, max in the middle, mirrored
  // perfectly by `alternate`. Together they produce a true sine motion.
  return `${animName} ${halved} cubic-bezier(0.45, 0, 0.55, 1) ${delay} infinite alternate`;
}

// Layer order: lower number = rendered behind, higher number = rendered in front.
// Covers both front-facing (left_/right_) and side-facing (front_/back_) parts.
// IMPORTANT: every body-layer part type the editor exposes MUST appear here so
// the renderer doesn't fall back to the per-part DB z-index (which is on a
// totally different scale, e.g. 35–58, and would render on top of the head
// wrapper — see headGroups below, which forces the head/face wrapper to a
// fixed z-index in the parent stacking context).
const LAYER_ORDER: Record<string, number> = {
  // ── Back-most: head wings (sit way behind everything), tails, back hair ──
  head_wing_left: 1,
  head_wing_right: 1,
  tail: 1,
  tail_2: 1,
  tail_3: 1,
  back_hair: 1,
  // ── Wings (back-layer in side view, body wings on front view) ──────────
  back_wing: 2,
  back_wing_2: 2,
  right_wing: 2,
  left_wing: 2,
  wing_set2_left: 2,
  wing_set2_right: 2,
  // ── Back-side limbs / accessories (behind body) ────────────────────────
  back_leg: 3,
  right_leg: 3,
  left_leg: 3,
  back_accessory_2: 3,
  back_accessory_1: 3,
  back_arm: 4,
  back_shoulder: 4,
  // ── Body ───────────────────────────────────────────────────────────────
  body: 5,
  // ── Front-side accessories / front wings (in front of body) ────────────
  front_wing_2: 6,
  front_wing: 6,
  front_accessory_2: 6,
  front_accessory_1: 6,
  // ── Front-side limbs ───────────────────────────────────────────────────
  front_leg: 7,
  right_arm: 7,
  front_arm: 8,
  left_arm: 8,
  front_shoulder: 8,
  // ── Face / head (most live inside the head-group wrapper at z=9) ───────
  right_ear: 9,
  left_ear: 9,
  head: 10,
  // Head-anchored accessories (hats, bows, glasses) sit just above the head
  // but under the mouth / eyes / hair so the face still reads cleanly.
  accessory_2: 11,
  accessory_1: 11,
  mouth: 12,
  mouth_closed: 13,
  eyes_closed: 14,
  eyes: 15,
  hair_right: 16,
  hair_left: 17,
  above_head: 18,
};

// Stagger offsets for duplicate same-type non-head parts
const DUP_STAGGER_OFFSETS = [0, 0.4, 0.75, 1.1, 1.4];

// Stagger offsets (in seconds) for multiple head groups
const HEAD_GROUP_STAGGER = [0, 0.55, 1.1, 1.65];

// Blink cycle offset per head group so they blink at different times
const HEAD_BLINK_OFFSETS = [0, 1.6, 3.0, 0.8];

/** Compute the overlap area between two axis-aligned bounding boxes. Returns 0 if they don't overlap. */
function overlapArea(a: PetPart, b: PetPart): number {
  const xOverlap = Math.max(0, Math.min(a.posX + a.width, b.posX + b.width) - Math.max(a.posX, b.posX));
  const yOverlap = Math.max(0, Math.min(a.posY + a.height, b.posY + b.height) - Math.max(a.posY, b.posY));
  return xOverlap * yOverlap;
}

function centerOf(p: PetPart) {
  return { x: p.posX + p.width / 2, y: p.posY + p.height / 2 };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Group face parts with their head by overlap. If a face part overlaps a head,
 *  it goes to the head it overlaps most. If it overlaps none, fall back to
 *  nearest center distance. */
function isHeadPartType(pt: string): boolean {
  return pt === "head" || pt === "h2_head" || pt === "h3_head";
}

function buildHeadGroups(parts: PetPart[]): { head: PetPart; faceParts: PetPart[] }[] {
  // Treat the primary head AND prefixed h2_head / h3_head as separate head
  // anchors so multi-headed templates each get their own group + wrapper.
  const headParts = parts.filter(p => isHeadPartType(p.partType));
  if (headParts.length === 0) return [];

  const groups = headParts.map(h => ({ head: h, faceParts: [] as PetPart[] }));
  const faceParts = parts.filter(p => isFacePart(p.partType));

  for (const fp of faceParts) {
    // First try overlap-based assignment
    let bestOverlap = 0;
    let bestIdx = -1;
    for (let i = 0; i < headParts.length; i++) {
      const area = overlapArea(fp, headParts[i]);
      if (area > bestOverlap) { bestOverlap = area; bestIdx = i; }
    }

    if (bestIdx >= 0) {
      // Overlaps at least one head — assign to the most-overlapping one
      groups[bestIdx].faceParts.push(fp);
    } else {
      // No overlap — fall back to nearest center distance
      const c = centerOf(fp);
      let minDist = Infinity;
      let minIdx = 0;
      for (let i = 0; i < headParts.length; i++) {
        const d = dist(c, centerOf(headParts[i]));
        if (d < minDist) { minDist = d; minIdx = i; }
      }
      groups[minIdx].faceParts.push(fp);
    }
  }

  return groups;
}

export default function PetAnimator({ petTemplateId, mode, view = "front", size = 200, fillContainer = false, fitVisible = false, expression = "neutral", className = "", style: externalStyle }: PetAnimatorProps) {
  // Stable random blink offset per instance — spreads eye animations across the
  // full 4 s blink cycle so pets don't all blink at the same time.
  const blinkOffset = useRef(`-${(Math.random() * 4).toFixed(2)}s`);

  // When fillContainer is true we let the parent control our footprint and
  // dynamically measure the actual rendered size, so the pet stays centred
  // and properly scaled inside arena slots that aren't exactly `size` px.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [measuredSize, setMeasuredSize] = useState<number>(size);
  // Synchronously seed measuredSize from the container BEFORE paint so the
  // first render isn't off-center. Without this, the initial render uses
  // the `size` prop (e.g. 72) and then ResizeObserver fires after paint
  // and bumps it to the actual slot dimensions, producing the visible
  // "pet is offset on first PvP entry" jump. Using useLayoutEffect means
  // the measurement and the corresponding state update happen before the
  // browser paints the first frame.
  useLayoutEffect(() => {
    if (!fillContainer) return;
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.min(rect.width, rect.height);
    if (s > 0) setMeasuredSize((prev) => (Math.abs(prev - s) > 0.5 ? s : prev));
  }, [fillContainer]);
  useEffect(() => {
    if (!fillContainer) return;
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      const s = Math.min(w, h);
      if (s > 0) setMeasuredSize((prev) => (Math.abs(prev - s) > 0.5 ? s : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillContainer]);

  const { data: templateData } = useQuery<{ parts: PetPart[]; facing: string; canFly?: boolean; animationOverrides?: PetAnimationOverrides }>({
    queryKey: ["/api/pet-template-parts", petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!petTemplateId,
    staleTime: Infinity,
  });

  const allParts = templateData?.parts || [];

  // Alpha-bounds scan: walk every part image once, compute the tightest
  // non-transparent rectangle, and force a re-render when the scan
  // finishes so the new transform-origin (derived from the visible
  // pixels rather than the padded PNG bounding box) takes effect.
  // Results are cached globally by URL so subsequent pets that share
  // any of the same part images get the corrected pivot for free.
  const [, bumpAlphaVersion] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!allParts.length) return;
    let cancelled = false;
    let pending = 0;
    for (const p of allParts) {
      if (!p.imageUrl) continue;
      if (getAlphaBoundsSync(p.imageUrl)) continue; // already cached
      pending++;
      void getAlphaBounds(p.imageUrl).then(() => {
        if (cancelled) return;
        // Coalesce re-renders: only bump once when all pending scans
        // finish, so a 12-part pet doesn't trigger 12 sequential
        // re-renders during initial page load.
        if (--pending === 0) bumpAlphaVersion();
      });
    }
    return () => { cancelled = true; };
  }, [allParts]);
  // Flying pets keep the original head-bob idle so they look like they're
  // hovering. Ground pets switch to the head-tilt-only variant so they
  // don't read as "floating off the ground".
  const canFly = !!templateData?.canFly;
  const idleAnimMap = canFly ? IDLE_ANIMATIONS : IDLE_ANIMATIONS_GROUND;
  // Per-pet animation overrides — defaults to {} for any pet without
  // tweaks, so every field below falls back to the global default. New
  // pets get `{}` automatically (DB column default) so they animate
  // exactly like before; specific pets (e.g. Crimson Dragon) opt into
  // tweaks via direct DB updates.
  const animOverrides = templateData?.animationOverrides ?? {};
  const idleHeadScalesWithBody = !!animOverrides.idle?.headScalesWithBody;
  const idleMouthBreath = !!animOverrides.idle?.mouthBreath;
  const idleSubtleBreath = !!animOverrides.idle?.subtleBreath;
  // Clamp the back-offset into the body's 4.5 s breath cycle. Anything
  // larger just wraps and reads as a smaller offset; anything <= 0 is
  // treated as "no offset" and back parts ride the body in lockstep
  // (the existing default).
  const rawBackOffset = animOverrides.idle?.backOffsetSec ?? 0;
  const idleBackOffsetSec = rawBackOffset > 0 ? Math.min(rawBackOffset, 4.5) : 0;
  // Body-synced parts (body, shoulders, back_arm, back_accessory_*) all
  // pick up this animation name in idle mode. Per-pet `subtleBreath`
  // override swaps in the smaller-amplitude keyframe so the WHOLE
  // breathing group stays consistent.
  const idleBodyAnimName = idleSubtleBreath ? "petIdleBodySubtle" : "petIdleBody";
  // Set of animation names that count as "the body's breath keyframe"
  // for delay-sync, transform-origin sync, and the alternate-motion
  // ease — both the standard and the subtle override variant qualify.
  const isBodyBreathAnim = (name: string | null | undefined) =>
    name === "petIdleBody" || name === "petIdleBodySubtle";
  // Back-arm + back-accessory parts share a SECOND delay (offset from
  // bodyBreathDelay by idleBackOffsetSec) so they remain in sync with
  // each other but slightly out of sync with the body. See the
  // `backBreathDelay` derivation below renderPartImg.
  const BACK_OFFSET_PARTS = new Set(["back_arm", "back_accessory_1", "back_accessory_2"]);

  // Determine which view to render:
  // 1. If template is explicitly saved as side-facing ("back"), always use "back"
  // 2. If no front parts exist but back parts do (parts uploaded in side mode
  //    before the template was assembled/saved), fall back to "back"
  // 3. Otherwise honour the `view` prop (defaults to "front")
  const facing = templateData?.facing ?? "front";
  const frontCount = allParts.filter(p => p.view === "front").length;
  const backCount = allParts.filter(p => p.view === "back").length;
  const resolvedView =
    facing === "back" ? "back" :
    (frontCount === 0 && backCount > 0) ? "back" :
    view;

  const viewParts = allParts.filter(p => p.view === resolvedView).sort((a, b) => {
    const aLayer = LAYER_ORDER[a.partType] ?? a.zIndex;
    const bLayer = LAYER_ORDER[b.partType] ?? b.zIndex;
    return aLayer - bLayer;
  });

  if (viewParts.length === 0) return null;

  // Large-style parts (1000x1000) fill the full canvas — scale them down visually
  // so they match the old 300x300 in-game footprint (30% of the container).
  const isLargeStyle = viewParts.some(p => p.width >= 500 || p.height >= 500);
  const partScale = isLargeStyle ? 0.3 : 1;

  // When fillContainer=true, expand the inner parts canvas so that after
  // scale(partScale) it fills `size` exactly.
  // e.g. large-style (scale 0.3): inner = size/0.3, scale(0.3) → visual = size ✓
  // When fillContainer=false (default), use the old behaviour where large-style
  // pets appear at 30% of the container — matching how PetWorldPage and PvpArena
  // were designed.
  // fitVisible implies fillContainer behaviour: there's no point fit-
  // packing the bbox to 94 % of the inner canvas if the inner canvas is
  // only being shown at 30 % of the wrapper (i.e. legacy non-fill
  // mode), because the visible pet would still occupy <30 % of the
  // wrapper and the user would still see the "invisible square" of
  // empty space around it. So when fitVisible is on we use the same
  // inner-size expansion as fillContainer.
  const fillFull = fillContainer || fitVisible;
  const effectiveSize = fillFull ? measuredSize : size;
  const innerSize = fillFull ? effectiveSize / partScale : size;
  const innerOffset = fillFull ? -((innerSize - effectiveSize) / 2) : 0;

  // Fit-to-visible-bbox: union of every visible part's alpha-tight rect
  // in 1000-unit logical coords, converted to inner-div CSS pixels and
  // packed with a 0.94 margin so wing flap (±5°) and above-head bounce
  // (-15 %) don't clip. Recomputed on each render so the bbox tightens
  // as alpha-bounds resolve from the async scan in the loadAlphaBounds
  // effect (line ~930). When fitVisible is off, fitTransform is just
  // `scale(${partScale})` — identical to the previous code path.
  let fitTransform = `scale(${partScale})`;
  if (fitVisible) {
    let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
    for (const part of viewParts) {
      // Strip h2_/h3_ multi-head prefix so duplicate expression-overlay
      // parts (h2_eyes_closed, h3_mouth) get excluded from the bbox
      // union the same way the base eyes_closed / mouth do — otherwise
      // their padded image rect would inflate the bbox on multi-head
      // pets even though they're hidden during their opacity-0 frames.
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
      const span  = Math.max(bboxW, bboxH);
      if (span > 0) {
        // bbox center in inner-div CSS pixels (innerSize spans the
        // 0..1000 logical range).
        const bboxCenterPx = ((minL + maxR) / 2) * (innerSize / CANVAS_SIZE);
        const bboxCenterPy = ((minT + maxB) / 2) * (innerSize / CANVAS_SIZE);
        const tx = innerSize / 2 - bboxCenterPx;
        const ty = innerSize / 2 - bboxCenterPy;
        // Tightened from 0.94 → 0.99 (1 % total, 0.5 % per side) so
        // the visible silhouette fills almost the entire wrapper —
        // matches the canvas renderer and removes the "invisible
        // padding" the user complained about in PvP. Wing flap is
        // ±5 % of the wing's own box (a fraction of the full canvas)
        // so the peak overshoot stays well under the 0.5 % margin.
        const fitScale = (CANVAS_SIZE * 0.99) / span;
        // Order matters: translate moves the bbox center to the inner
        // div's center FIRST, then scaling around the (now-centered)
        // origin keeps it centered. CSS applies right-to-left, so the
        // string reads scale ∘ scale ∘ translate.
        fitTransform = `scale(${partScale}) scale(${fitScale.toFixed(4)}) translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
      }
    }
  }

  // Build head groups (each head gets its own associated face parts by proximity)
  const headGroups = buildHeadGroups(viewParts);
  const headGroupPartIds = new Set(headGroups.flatMap(g => [g.head.id, ...g.faceParts.map(p => p.id)]));

  // Non-head-group body parts
  const bodyParts = viewParts.filter(p => !headGroupPartIds.has(p.id));

  // Track per-type index for duplicate same-type parts (for staggering)
  const typeCountMap = new Map<string, number>();
  const typeIndexMap = new Map<string, number>();
  for (const part of bodyParts) {
    const idx = typeCountMap.get(part.partType) ?? 0;
    typeIndexMap.set(part.id, idx);
    typeCountMap.set(part.partType, idx + 1);
  }

  // Compress each body part's raw zIndex into a 1..8 range so they all sit
  // BELOW the head wrapper (hardcoded zIndex=9) while preserving the admin's
  // intended back-to-front ordering from the editor. This is more accurate
  // than a hardcoded LAYER_ORDER table because it respects per-pet z-index
  // tweaks (e.g. The Paradox has back_hair at z=35 with wings at z=14-15,
  // meaning back_hair should render IN FRONT of the wings — a relationship
  // a fixed table can't capture).
  const sortedBodyByZ = [...bodyParts].sort((a, b) => a.zIndex - b.zIndex);
  const compressedZ = new Map<string, number>();
  sortedBodyByZ.forEach((part, idx) => {
    compressedZ.set(part.id, Math.min(idx + 1, 8));
  });

  // Wing-pair sync: paired wings use mirrored keyframes (e.g. front_wing
  // tilts up while back_wing tilts down) but each part normally gets its
  // own hash-based phase offset so different pets don't tick in lockstep.
  // For mirrored pairs we want BOTH halves to tick on the same beat so the
  // wings flap as a coordinated pair instead of drifting apart. Compute
  // one shared delay per pair (using the alphabetically-first member's id
  // as the seed so the result is still stable per pet) and assign it to
  // both members. Applies only to the first instance of each type — extra
  // duplicates fall through to the normal stagger.
  // Each entry is [partA, partB, setIndex]. setIndex groups pairs into
  // wing SETS so we can guarantee a visible offset BETWEEN sets while
  // keeping the two halves of any single pair perfectly mirrored:
  //   • set 0 → wing set 1 (back/front_wing  + left/right_wing)
  //   • set 1 → wing set 2 (back/front_wing_2 + wing_set2_left/right)
  //   • set 2 → head wings (head_wing_left/right)
  const WING_PAIRS: Array<[string, string, number]> = [
    ["back_wing",       "front_wing",       0],
    ["back_wing_2",     "front_wing_2",     1],
    ["left_wing",       "right_wing",       0],
    ["wing_set2_left",  "wing_set2_right",  1],
    ["head_wing_left",  "head_wing_right",  2],
  ];
  // Per-set base offset (seconds). The hash variation is added on top so
  // pets-in-the-wild aren't all marching on the same global beat, but the
  // per-set base guarantees set 2 / head wings can never coincidentally
  // land on the same point in the cycle as set 1 — they're forced ~half
  // a cycle apart from each other.
  const WING_SET_OFFSET = [0, 0.9, 1.8];
  const wingPairDelay = new Map<string, string>();
  for (const [a, b, setIdx] of WING_PAIRS) {
    const partA = bodyParts.find(p => p.partType === a && (typeIndexMap.get(p.id) ?? 0) === 0);
    const partB = bodyParts.find(p => p.partType === b && (typeIndexMap.get(p.id) ?? 0) === 0);
    if (!partA || !partB) continue;
    const seedId = partA.id < partB.id ? partA.id : partB.id;
    let h = 0;
    for (let i = 0; i < seedId.length; i++) h = (h * 31 + seedId.charCodeAt(i)) >>> 0;
    // Hash gives 0–1.5 s of stable pet-specific variation; per-set offset
    // pushes set 2 and head wings onto a clearly different beat than set 1.
    const totalSec = ((h % 1500) / 1000) + (WING_SET_OFFSET[setIdx] ?? 0);
    const delay = `-${totalSec.toFixed(2)}s`;
    wingPairDelay.set(partA.id, delay);
    wingPairDelay.set(partB.id, delay);
  }

  // ── Body-breath phase-lock ────────────────────────────────────────────────
  // Every part that's mapped to `petIdleBody` (the breath scale) must share
  // ONE delay so they inhale and exhale together. Without this, each part
  // would still pick up the per-part stable hash delay inside renderPartImg
  // and they'd all sit at different points in the cycle — which is exactly
  // why the back arm wasn't visibly moving in time with back_accessory_1
  // even though both shared the same keyframe. We seed the shared delay off
  // the body part's id so it stays stable per-pet but identical across the
  // whole "breathes with body" group: body, back_shoulder, left/right
  // (front-view) shoulders, back_arm, back_accessory_1/2. The side-view
  // front_shoulder + front_accessory_1/2 moved to petIdleSideShoulder for
  // an independent depth cue, so they no longer share this delay.
  let bodyBreathDelay: string | undefined;
  // Sibling delay for back_arm + back_accessory_1/2 when the per-pet
  // override `idle.backOffsetSec` is active. Stays undefined for pets
  // without the override so back parts continue to ride bodyBreathDelay
  // exactly. Computed below alongside bodyBreathDelay so they share the
  // same source phase.
  let backBreathDelay: string | undefined;
  // World-space anchor (in canvas units) where the body's breathe scale
  // pivots — every body-synced part (back_arm, back_accessory_1/2,
  // shoulders) needs to scale around THIS exact point so their inflate
  // / deflate stays glued to the body silhouette. Without this, each
  // part scales around its own bbox center and visibly drifts apart
  // from the body and from each other on the side-view care + active-
  // pet pages.
  let bodyAnchorWorldX: number | undefined;
  let bodyAnchorWorldY: number | undefined;
  const bodyPartForBreath = bodyParts.find(p => p.partType === "body");
  if (bodyPartForBreath) {
    let h = 0;
    for (let i = 0; i < bodyPartForBreath.id.length; i++) {
      h = (h * 31 + bodyPartForBreath.id.charCodeAt(i)) >>> 0;
    }
    const bodyBreathOffsetSec = (h % 1500) / 1000;
    bodyBreathDelay = `-${bodyBreathOffsetSec.toFixed(2)}s`;
    if (idleBackOffsetSec > 0) {
      // Wrap into 0..4.5 (the body breath cycle) so the offset always
      // reads as a small phase shift no matter how big the override
      // value is. Negative CSS animation-delay keeps the same convention
      // as bodyBreathDelay.
      const backOffsetMod = (bodyBreathOffsetSec + idleBackOffsetSec) % 4.5;
      backBreathDelay = `-${backOffsetMod.toFixed(2)}s`;
    }
    // Mirror the body part's own transform-origin choice (see the
    // bodyOrigin computation in the part-render loop and the override
    // logic in renderPartImg below): non-flying pets anchor at "50%
    // 100%" (feet) so the body inflates UPWARD; flying pets use the
    // pivot-based origin computed off the alpha bbox so the body
    // inflates around its hover pivot.
    if (!canFly) {
      bodyAnchorWorldX = bodyPartForBreath.posX + bodyPartForBreath.width * 0.5;
      bodyAnchorWorldY = bodyPartForBreath.posY + bodyPartForBreath.height * 1.0;
    } else {
      const bodyAb = getAlphaBoundsSync(bodyPartForBreath.imageUrl) ?? FULL_BOUNDS;
      const bpxFrac = (bodyPartForBreath.pivotX ?? 50) / 100;
      const bpyFrac = (bodyPartForBreath.pivotY ?? 50) / 100;
      const bodyOriginXFrac = bodyAb.left + bodyAb.width * bpxFrac;
      const bodyOriginYFrac = bodyAb.top + bodyAb.height * bpyFrac;
      bodyAnchorWorldX = bodyPartForBreath.posX + bodyPartForBreath.width * bodyOriginXFrac;
      bodyAnchorWorldY = bodyPartForBreath.posY + bodyPartForBreath.height * bodyOriginYFrac;
    }
  }

  // Helper: render a single part image with given animation (or none).
  // `transformOriginOverride` lets callers override the part's pivot-based
  // transform-origin — used for the body part on ground pets so the breathe
  // scale anchors at the feet (50% 100%) instead of the body's center pivot,
  // which would make large pets appear to swell up off the ground.
  const renderPartImg = (
    part: PetPart,
    animName: string | null,
    extraOpacity?: number,
    delayOverride?: string,
    transformOriginOverride?: string,
    zOverride?: number,
    durationOverride?: string,
  ) => {
    const leftPct = (part.posX / CANVAS_SIZE) * 100;
    const topPct = (part.posY / CANVAS_SIZE) * 100;
    const widthPct = (part.width / CANVAS_SIZE) * 100;
    const heightPct = (part.height / CANVAS_SIZE) * 100;
    const layerZ = zOverride ?? LAYER_ORDER[part.partType] ?? part.zIndex;
    const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
    const isEyePart = isEyePartType(part.partType);
    // For non-eye parts, derive a small stable per-part phase offset from
    // the part's id hash so different parts of the SAME pet (and the same
    // part across different pet instances) never sit perfectly in sync.
    // When everything cycles in lockstep, the eye has a moment where all
    // parts return to neutral simultaneously and the pet appears to
    // "stop" before moving again — that's the stop-and-go feeling. A
    // 0–1.5s spread keeps things continuously in motion without making
    // any single part feel laggy.
    let computedDelay = delayOverride !== undefined
      ? delayOverride
      : (isEyePart ? blinkOffset.current : "0s");
    if (delayOverride === undefined && !isEyePart) {
      // Parts on the body-breath animation phase-lock to ONE shared delay
      // (computed above off the body part's id) so the whole "breathes with
      // body" group — body, shoulders, back_arm, back/front accessories —
      // inhales and exhales together. Everything else gets the usual per-
      // part stable hash so different parts of the same pet don't all sit
      // in lockstep (which would create a visible "stop" at every cycle
      // boundary).
      if (isBodyBreathAnim(animName) && bodyBreathDelay !== undefined) {
        // Per-pet `idle.backOffsetSec` override: back_arm + back_accessory_*
        // share their own (slightly shifted) delay so they remain in sync
        // with each other but a beat off the body. Every other body-synced
        // part keeps the canonical bodyBreathDelay.
        computedDelay = (backBreathDelay !== undefined && BACK_OFFSET_PARTS.has(part.partType))
          ? backBreathDelay
          : bodyBreathDelay;
      } else {
        let h = 0;
        for (let i = 0; i < part.id.length; i++) h = (h * 31 + part.id.charCodeAt(i)) >>> 0;
        computedDelay = `-${((h % 1500) / 1000).toFixed(2)}s`;
      }
    }
    const delay = computedDelay;
    const duration = durationOverride ?? getPartDuration(part.partType, mode);
    // Re-map the artist's pivot percentage onto the visible pixels of
    // the part image (alpha bbox) instead of the full padded PNG.
    // CSS `transform-origin` is expressed as a percentage of the
    // element box, so we convert: pivot 50/100 (artist saying "base of
    // tail") becomes e.g. 50/82 if there's 18 % transparent padding
    // below the visible tail. Falls back to the raw pivot until the
    // async alpha scan resolves and the parent re-renders.
    const ab = getAlphaBoundsSync(part.imageUrl) ?? FULL_BOUNDS;
    const pxPct = (part.pivotX ?? 50) / 100;
    const pyPct = (part.pivotY ?? 50) / 100;
    const originX = (ab.left + ab.width  * pxPct) * 100;
    const originY = (ab.top  + ab.height * pyPct) * 100;
    // Body-breath origin sync — every part on the petIdleBody keyframe
    // (back_arm, back_accessory_1/2, back/front-view shoulders) MUST
    // scale around the SAME WORLD POINT as the body itself, otherwise
    // each part scales around its own bbox center, so the body inflates
    // upward while a back accessory inflates sideways and they visibly
    // drift apart on the side-view care + active-pet pages.
    //
    // Earlier fix used a flat "50% 100%" override on every body-synced
    // part — but "50% 100%" is each part's OWN bottom-center, which is
    // a different world point for every part (back_arm's bottom is up
    // by the shoulder, back_accessory's bottom is mid-torso, body's
    // bottom is at the feet). So they STILL scaled out of sync.
    //
    // Real fix: compute the body's world anchor once (above, where
    // bodyAnchorWorldX/Y are derived) and convert it into each part's
    // own local %-of-box for transform-origin. Now every body-synced
    // part inflates / deflates around the body's pivot — perfect lock.
    let resolvedOrigin = transformOriginOverride;
    if (
      resolvedOrigin === undefined &&
      isBodyBreathAnim(animName) &&
      bodyAnchorWorldX !== undefined &&
      bodyAnchorWorldY !== undefined &&
      part.partType !== "body" &&
      part.width > 0 &&
      part.height > 0
    ) {
      const localXPct = ((bodyAnchorWorldX - part.posX) / part.width) * 100;
      const localYPct = ((bodyAnchorWorldY - part.posY) / part.height) * 100;
      resolvedOrigin = `${localXPct.toFixed(2)}% ${localYPct.toFixed(2)}%`;
    }
    return (
      <img
        key={part.id}
        src={part.imageUrl}
        alt={part.partType}
        draggable={false}
        style={{
          position: "absolute",
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          zIndex: layerZ,
          transformOrigin: resolvedOrigin ?? `${originX.toFixed(2)}% ${originY.toFixed(2)}%`,
          // Animation shorthand picked by buildAnimationCss: 2-keyframe
          // motion (wings, ears, tail, body, etc.) gets `alternate` +
          // sine bezier so it's a true sine wave with no internal
          // pauses. Multi-keyframe animations (blink opacity bursts,
          // walk/zoom/sleep/petting motions) keep the existing form.
          animation: animName ? buildAnimationCss(animName, duration, delay) : undefined,
          // Promote animated parts onto their own GPU compositor layer.
          // Without this hint browsers can fall back to per-frame paints
          // for transformed images, which subpixel-snaps and causes
          // visible micro-stutter on top of the keyframe issues we just
          // fixed.
          willChange: animName ? "transform" : undefined,
          opacity: extraOpacity !== undefined ? extraOpacity : (isAnimOnly ? 0 : 1),
          imageRendering: "auto",
          pointerEvents: "none",
        }}
      />
    );
  };

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        width: fillContainer ? "100%" : size,
        height: fillContainer ? "100%" : size,
        position: "relative",
        overflow: "visible",
        ...externalStyle,
      }}
      data-testid="pet-animator"
    >
      <style>{ANIMATION_STYLES}</style>
      <div style={{ position: "absolute", top: innerOffset, left: innerOffset, width: innerSize, height: innerSize, transform: fitTransform, transformOrigin: "center center" }}>

        {/* Body parts (back_full, limbs, wings, tail, body) */}
        {bodyParts.map((part) => {
          const partZ = compressedZ.get(part.id);
          if (part.partType === "back_full") {
            const leftPct = (part.posX / CANVAS_SIZE) * 100;
            const topPct = (part.posY / CANVAS_SIZE) * 100;
            const widthPct = (part.width / CANVAS_SIZE) * 100;
            const heightPct = (part.height / CANVAS_SIZE) * 100;
            const layerZ = partZ ?? LAYER_ORDER[part.partType] ?? part.zIndex;
            return (
              <img key={part.id} src={part.imageUrl} alt={part.partType} draggable={false}
                style={{ position: "absolute", left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%`, zIndex: layerZ, imageRendering: "auto", pointerEvents: "none" }}
              />
            );
          }

          // Stagger duplicate same-type parts so they don't move in perfect sync
          const typeIdx = typeIndexMap.get(part.id) ?? 0;
          const dupDelay = typeIdx > 0 ? `${DUP_STAGGER_OFFSETS[Math.min(typeIdx, DUP_STAGGER_OFFSETS.length - 1)]}s` : "0s";
          // For paired wings, use the shared pair delay so the two halves
          // tick on the same beat (mirrored flap). Falls back to dup
          // stagger for extra duplicates, otherwise to the per-part hash.
          const pairDelay = wingPairDelay.get(part.id);
          const wingDelay: string | undefined = pairDelay ?? (typeIdx > 0 ? dupDelay : undefined);

          // Anchor the body's breathe scale at the feet (50% 100%) for
          // non-flying pets so larger ground pets don't appear to swell up
          // off the ground. Flying pets keep the default pivot-based origin
          // so they continue to read as hovering. Applies to idle, sleep,
          // and petting modes (all of which scale the body).
          const bodyOrigin = (part.partType === "body" && !canFly) ? "50% 100%" : undefined;

          if (mode === "static") {
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (isAnimOnly) return null;
            return renderPartImg(part, null, undefined, undefined, undefined, partZ);
          }
          if (mode === "house") {
            const animName = lookupAnim(HOUSE_ANIMATIONS, part.partType);
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (!animName) {
              if (isAnimOnly) return null;
              return renderPartImg(part, null, undefined, undefined, undefined, partZ);
            }
            return renderPartImg(part, animName, undefined, wingDelay, undefined, partZ);
          }
          if (mode === "sleep") {
            // In sleep mode the body breathes and ears / tail / hair sway
            // gently — see SLEEP_ANIMATIONS. Hide animation-only parts
            // (mouth open) so the pet's mouth stays closed while sleeping.
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (isAnimOnly) return null;
            const animName = lookupAnim(SLEEP_ANIMATIONS, part.partType);
            return renderPartImg(part, animName ?? null, undefined, wingDelay, bodyOrigin, partZ);
          }
          if (mode === "petting") {
            // Bouncy "happy being petted" body / limb motion.
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (isAnimOnly) return null;
            const animName = lookupAnim(PETTING_ANIMATIONS, part.partType);
            return renderPartImg(part, animName ?? null, undefined, wingDelay, bodyOrigin, partZ);
          }
          const anims = mode === "idle" ? idleAnimMap : mode === "zoom" ? ZOOM_ANIMATIONS : WALK_ANIMATIONS;
          const rawAnimName = lookupAnim(anims, part.partType) || anims.body;
          if (!rawAnimName) return null;
          // Per-pet `idle.subtleBreath` override swaps the body breath
          // keyframe for the smaller-amplitude variant on every body-
          // synced part (body, shoulders, back_arm, back_accessory_*)
          // so the WHOLE breathing group reads as the same calmer
          // breath instead of just the body.
          const animName = (mode === "idle" && rawAnimName === "petIdleBody")
            ? idleBodyAnimName
            : rawAnimName;
          // Only the idle body keyframe scales — walk/zoom body uses
          // translateY only, so the anchor override is harmless either way.
          return renderPartImg(part, animName, undefined, wingDelay, bodyOrigin, partZ);
        })}

        {/* Head groups — each head gets its own wrapper with associated face parts */}
        {headGroups.map((group, groupIdx) => {
          const anims = mode === "idle" ? idleAnimMap : mode === "zoom" ? ZOOM_ANIMATIONS : WALK_ANIMATIONS;
          // Each head group has a staggered start so multiple heads bob at different times
          const groupDelay = HEAD_GROUP_STAGGER[Math.min(groupIdx, HEAD_GROUP_STAGGER.length - 1)];
          // Sleep mode uses the gentle petSleepHead bob, petting uses the
          // bouncier petPettingHead. Otherwise use the active mode's head
          // animation (skipped for house/static).
          const wrapperAnim =
            mode === "sleep" ? "petSleepHead" :
            mode === "petting" ? "petPettingHead" :
            // In idle, ALL heads use the upward-translation petIdleHead
            // (even on ground pets — the small lift reads as following the
            // body's breath, not as floating, because the body is also
            // visibly inflating upward at the same moment).
            // Per-pet override `idle.headScalesWithBody` swaps in
            // petIdleHeadBreath so the head also inflates / deflates
            // with the body's breath. Anchored at the body pivot below
            // so the scale reads as "head rises with torso" rather than
            // detaching from it.
            mode === "idle" ? (idleHeadScalesWithBody ? "petIdleHeadBreath" : "petIdleHead") :
            (mode !== "house" && mode !== "static") ? anims["head"] :
            undefined;
          // Head wrapper transform-origin. Default leaves it at the
          // wrapper's centre (50% 50% of the canvas) which is fine for
          // pure translateY animations like petIdleHead. When the
          // headScalesWithBody override is active we MUST anchor the
          // wrapper at the body's pivot so the scale grows / shrinks
          // around the same world point the body itself does — without
          // this, the head wrapper would scale around the canvas centre
          // and the head would visibly slide off the body during inhale.
          const wrapperOrigin: string | undefined =
            mode === "idle" && idleHeadScalesWithBody &&
            bodyAnchorWorldX !== undefined && bodyAnchorWorldY !== undefined
              ? `${((bodyAnchorWorldX / CANVAS_SIZE) * 100).toFixed(2)}% ${((bodyAnchorWorldY / CANVAS_SIZE) * 100).toFixed(2)}%`
              : undefined;
          // In idle mode, override the head's natural 3 s rhythm so it
          // matches the body's 4.5 s breath — and lock its phase to
          // bodyBreathDelay so every head lifts on the body's inhale and
          // settles on the exhale. Other modes keep the per-head-group
          // stagger so multi-head pets don't all bob in lockstep.
          const headSyncBreath = mode === "idle" && bodyBreathDelay !== undefined;
          const wrapperDuration = headSyncBreath ? "4.5s" : getPartDuration("head", mode);
          const wrapperDelay: string = (headSyncBreath && bodyBreathDelay)
            ? bodyBreathDelay
            : `${groupDelay}s`;
          // In sleep AND petting modes, force the face into a calm closed-eye
          // expression (same opacity overrides as the existing "petted" expression).
          const effectiveExpression: typeof expression =
            (mode === "sleep" || mode === "petting") ? "petted" : expression;

          // Per-group blink offset: combines the global random offset with a per-group phase
          const blinkBase = parseFloat(blinkOffset.current.replace("s", "")) || 0;
          const groupBlinkOffset = `${(blinkBase - HEAD_BLINK_OFFSETS[Math.min(groupIdx, HEAD_BLINK_OFFSETS.length - 1)]).toFixed(2)}s`;

          const allGroupParts = [group.head, ...group.faceParts];

          return (
            <div
              key={`head-group-${groupIdx}`}
              style={{
                position: "absolute",
                left: 0, top: 0,
                width: "100%", height: "100%",
                animation: wrapperAnim ? buildAnimationCss(wrapperAnim, wrapperDuration, wrapperDelay) : undefined,
                transformOrigin: wrapperOrigin,
                willChange: wrapperAnim ? "transform" : undefined,
                zIndex: 9,
                pointerEvents: "none",
              }}
            >
              {allGroupParts.map((part) => {
                const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
                const isEyePart = isEyePartType(part.partType);
                // When in a non-neutral expression (or sleep mode), freeze
                // the face into the desired pose by killing the blink/mouth
                // animations and forcing the right opacity. Eyes_closed +
                // mouth (open) are pinned visible; eyes + mouth_closed are
                // pinned hidden.
                const exprOp = expressionOpacity(part.partType, effectiveExpression);
                if (exprOp !== null) {
                  if (exprOp === 0) return null;
                  return renderPartImg(part, null, 1);
                }

                if (mode === "static") {
                  if (isAnimOnly) return null;
                  return renderPartImg(part, null);
                }
                if (mode === "sleep") {
                  // Sleep: head itself rides the wrapper bob; ears / hair
                  // pick up their gentle SLEEP_ANIMATIONS sway so the head
                  // group reads as "alive but resting" instead of frozen.
                  if (isAnimOnly) return null;
                  if (isHeadPartType(part.partType)) return renderPartImg(part, null);
                  const animName = lookupAnim(SLEEP_ANIMATIONS, part.partType);
                  return renderPartImg(part, animName ?? null, undefined, `${groupDelay}s`);
                }
                if (mode === "petting") {
                  // Petting: head itself rides the bouncy wrapper; ears /
                  // hair / accessories animate via PETTING_ANIMATIONS so
                  // the whole head visibly wiggles.
                  if (isAnimOnly) return null;
                  if (isHeadPartType(part.partType)) return renderPartImg(part, null);
                  const animName = lookupAnim(PETTING_ANIMATIONS, part.partType);
                  return renderPartImg(part, animName ?? null, undefined, `${groupDelay}s`);
                }
                if (mode === "house") {
                  const animName = lookupAnim(HOUSE_ANIMATIONS, part.partType);
                  if (!animName) {
                    if (isAnimOnly) return null;
                    return renderPartImg(part, null);
                  }
                  const delay = isEyePart ? groupBlinkOffset : `${groupDelay}s`;
                  return renderPartImg(part, animName, undefined, delay);
                }
                // Per-pet mouth-breath override (idle only, neutral
                // expression only). Replaces the prior paired cross-fade
                // (which produced a visible white-edged ghost where the
                // open and closed overlays didn't align in alpha) with a
                // tiny swivel applied to the closed-mouth overlay only.
                // The open-mouth overlay is left at its default (hidden
                // via petIdleMouth's opacity:0 keyframe) so it never
                // fades in. Phase-locked to bodyBreathDelay + 4.5 s.
                //
                // Strict gates:
                //   - mode === "idle": IDLE-only; walk / zoom / sleep /
                //     petting / house / static keep default mouth behavior.
                //   - effectiveExpression === "neutral": happy / petted
                //     poses ignore the swivel (happy pins the open mouth
                //     visible; petted hides both — neither should sway).
                const baseType = part.partType.replace(/^h[23]_/, "");
                if (
                  mode === "idle" &&
                  effectiveExpression === "neutral" &&
                  idleMouthBreath &&
                  bodyBreathDelay !== undefined &&
                  baseType === "mouth_closed"
                ) {
                  return renderPartImg(part, "petIdleMouthSwivel", undefined, bodyBreathDelay, undefined, undefined, "4.5s");
                }
                // Head itself has no per-part animation (wrapper handles the bobbing)
                const partAnimName = isHeadPartType(part.partType) ? null : (lookupAnim(anims, part.partType) ?? null);
                const delay = isEyePart ? groupBlinkOffset : `${groupDelay}s`;
                return renderPartImg(part, partAnimName, undefined, delay);
              })}
            </div>
          );
        })}

      </div>
    </div>
  );
}
