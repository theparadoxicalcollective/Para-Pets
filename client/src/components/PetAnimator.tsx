import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  tail: "petIdleTail",
  tail_2: "petIdleTail",
  tail_3: "petIdleTail",
  // Front-facing shoulders + side-facing shoulders / accessories breathe with body
  left_shoulder: "petIdleBody",
  right_shoulder: "petIdleBody",
  front_shoulder: "petIdleBody",
  back_shoulder: "petIdleBody",
  front_accessory_1: "petIdleBody",
  front_accessory_2: "petIdleBody",
  back_accessory_1: "petIdleBody",
  back_accessory_2: "petIdleBody",
  // Hair pieces sway gently like ears
  hair_left: "petIdleLeftEar",
  hair_right: "petIdleRightEar",
  back_hair: "petIdleTail",
  // Front-facing wing sets
  wing_set2_left: "petIdleLeftWing",
  wing_set2_right: "petIdleRightWing",
  // Side-facing limbs
  front_arm: "petIdleLeftArm",
  back_arm: "petIdleRightArm",
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
  "hair_left", "hair_right", "accessory_1", "accessory_2",
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
  /* ── Idle: bumped amplitudes so the pet feels noticeably more alive
        (head bob ~1.5×, body breathe ~2×, ears/arms/wings ~1.7×). ────── */
  @keyframes petIdleHead {
    0%   { transform: translateY(0px); }
    25%  { transform: translateY(-2.2px); }
    50%  { transform: translateY(-3.6px); }
    75%  { transform: translateY(-2.2px); }
    100% { transform: translateY(0px); }
  }
  @keyframes petIdleLeftEar {
    0%   { transform: rotate(0deg); }
    25%  { transform: rotate(-2deg); }
    50%  { transform: rotate(-0.6deg); }
    75%  { transform: rotate(1deg); }
    100% { transform: rotate(0deg); }
  }
  @keyframes petIdleRightEar {
    0%   { transform: rotate(0deg); }
    25%  { transform: rotate(2deg); }
    50%  { transform: rotate(0.6deg); }
    75%  { transform: rotate(-1deg); }
    100% { transform: rotate(0deg); }
  }
  @keyframes petIdleLeftArm {
    0%   { transform: rotate(0deg); }
    25%  { transform: rotate(2.5deg); }
    50%  { transform: rotate(5deg); }
    75%  { transform: rotate(2.5deg); }
    100% { transform: rotate(0deg); }
  }
  @keyframes petIdleRightArm {
    0%   { transform: rotate(0deg); }
    25%  { transform: rotate(-1.8deg); }
    50%  { transform: rotate(-3.5deg); }
    75%  { transform: rotate(-1.8deg); }
    100% { transform: rotate(0deg); }
  }
  @keyframes petIdleBody {
    0%   { transform: scale(1, 1); }
    25%  { transform: scale(1.012, 1.022); }
    50%  { transform: scale(1.022, 1.04); }
    75%  { transform: scale(1.012, 1.022); }
    100% { transform: scale(1, 1); }
  }
  @keyframes petIdleLeftWing {
    0%   { transform: rotate(0deg); }
    25%  { transform: rotate(-6deg); }
    50%  { transform: rotate(-2deg); }
    75%  { transform: rotate(4deg); }
    100% { transform: rotate(0deg); }
  }
  @keyframes petIdleRightWing {
    0%   { transform: rotate(0deg); }
    25%  { transform: rotate(6deg); }
    50%  { transform: rotate(2deg); }
    75%  { transform: rotate(-4deg); }
    100% { transform: rotate(0deg); }
  }
  @keyframes petIdleLeftLeg {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(1.5px); }
  }
  @keyframes petIdleRightLeg {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(1.5px); }
  }
  /* Tail rotates only — no translateY — so it stays anchored to the body
     instead of drifting up and away from it. The explicit 50% keyframe
     means each quarter-cycle covers exactly the same angular distance,
     so the motion reads as a smooth sine wave instead of the lopsided
     "fast-through-zero" wiggle the previous 4-keyframe version made. */
  @keyframes petIdleTail {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(-1.2deg); }
    50%      { transform: rotate(0deg); }
    75%      { transform: rotate(1.2deg); }
  }
  /* Ground (non-flying) head: a small left/right tilt instead of an upward
     bob, so the pet doesn't read as "floating off the ground". Same 50%
     keyframe smoothing as the tail above. */
  @keyframes petIdleHeadGround {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(-0.6deg); }
    50%      { transform: rotate(0deg); }
    75%      { transform: rotate(0.6deg); }
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

`;

function getPartDuration(partType: string, mode: "idle" | "walk" | "zoom" | "house" | "static" | "sleep" | "petting"): string {
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
    return durations[partType] || "3.5s";
  }
  if (mode === "idle") {
    const durations: Record<string, string> = {
      eyes: "4s", eyes_closed: "4s", mouth: "5s", mouth_closed: "5s",
      head: "3s", left_ear: "3.5s", right_ear: "3.5s",
      left_arm: "3.5s", right_arm: "3.5s",
      body: "4s",
      left_wing: "3.5s", right_wing: "3.5s",
      left_leg: "4s", right_leg: "4s",
      tail: "5s",
      front_arm: "3.5s", back_arm: "3.5s",
      front_leg: "4s", back_leg: "4s",
      front_wing: "3.5s", back_wing: "3.5s",
    };
    return durations[partType] || "3s";
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
    return durations[partType] || "2.4s";
  }
  if (mode === "zoom") {
    const isWing = ["left_wing", "right_wing", "front_wing", "back_wing"].includes(partType);
    return isWing ? "0.45s" : "0.6s";
  }
  return "0.6s";
}

// Layer order: lower number = rendered behind, higher number = rendered in front
// Covers both front-facing (left_/right_) and side-facing (front_/back_) parts
const LAYER_ORDER: Record<string, number> = {
  tail: 1,
  right_leg: 2,
  left_leg: 2,
  back_wing: 2,
  back_leg: 3,
  right_wing: 3,
  back_arm: 4,
  left_wing: 4,
  body: 5,
  front_wing: 6,
  right_arm: 7,
  front_leg: 7,
  left_arm: 8,
  front_arm: 8,
  right_ear: 9,
  left_ear: 9,
  head: 10,
  mouth: 12,
  mouth_closed: 13,
  eyes_closed: 14,
  eyes: 15,
  hair_right: 16,
  hair_left: 17,
  adobe_head: 18,
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

export default function PetAnimator({ petTemplateId, mode, view = "front", size = 200, fillContainer = false, expression = "neutral", className = "", style: externalStyle }: PetAnimatorProps) {
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

  const allParts = templateData?.parts || [];
  // Flying pets keep the original head-bob idle so they look like they're
  // hovering. Ground pets switch to the head-tilt-only variant so they
  // don't read as "floating off the ground".
  const canFly = !!templateData?.canFly;
  const idleAnimMap = canFly ? IDLE_ANIMATIONS : IDLE_ANIMATIONS_GROUND;

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
  const effectiveSize = fillContainer ? measuredSize : size;
  const innerSize = fillContainer ? effectiveSize / partScale : size;
  const innerOffset = fillContainer ? -((innerSize - effectiveSize) / 2) : 0;

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
  ) => {
    const leftPct = (part.posX / CANVAS_SIZE) * 100;
    const topPct = (part.posY / CANVAS_SIZE) * 100;
    const widthPct = (part.width / CANVAS_SIZE) * 100;
    const heightPct = (part.height / CANVAS_SIZE) * 100;
    const layerZ = LAYER_ORDER[part.partType] ?? part.zIndex;
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
      let h = 0;
      for (let i = 0; i < part.id.length; i++) h = (h * 31 + part.id.charCodeAt(i)) >>> 0;
      computedDelay = `-${((h % 1500) / 1000).toFixed(2)}s`;
    }
    const delay = computedDelay;
    const duration = getPartDuration(part.partType, mode);
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
          transformOrigin: transformOriginOverride ?? `${part.pivotX ?? 50}% ${part.pivotY ?? 50}%`,
          // cubic-bezier(0.37, 0, 0.63, 1) is a true sine ease-in-out —
          // smoother and more "alive-feeling" than the default ease-in-out
          // browser curve, which has a sharper inflection that contributes
          // to the perceived stop-and-go.
          animation: animName ? `${animName} ${duration} cubic-bezier(0.37, 0, 0.63, 1) ${delay} infinite` : undefined,
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
      <div style={{ position: "absolute", top: innerOffset, left: innerOffset, width: innerSize, height: innerSize, transform: `scale(${partScale})`, transformOrigin: "center center" }}>

        {/* Body parts (back_full, limbs, wings, tail, body) */}
        {bodyParts.map((part) => {
          if (part.partType === "back_full") {
            const leftPct = (part.posX / CANVAS_SIZE) * 100;
            const topPct = (part.posY / CANVAS_SIZE) * 100;
            const widthPct = (part.width / CANVAS_SIZE) * 100;
            const heightPct = (part.height / CANVAS_SIZE) * 100;
            const layerZ = LAYER_ORDER[part.partType] ?? part.zIndex;
            return (
              <img key={part.id} src={part.imageUrl} alt={part.partType} draggable={false}
                style={{ position: "absolute", left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%`, zIndex: layerZ, imageRendering: "auto", pointerEvents: "none" }}
              />
            );
          }

          // Stagger duplicate same-type parts so they don't move in perfect sync
          const typeIdx = typeIndexMap.get(part.id) ?? 0;
          const dupDelay = typeIdx > 0 ? `${DUP_STAGGER_OFFSETS[Math.min(typeIdx, DUP_STAGGER_OFFSETS.length - 1)]}s` : "0s";

          // Anchor the body's breathe scale at the feet (50% 100%) for
          // non-flying pets so larger ground pets don't appear to swell up
          // off the ground. Flying pets keep the default pivot-based origin
          // so they continue to read as hovering. Applies to idle, sleep,
          // and petting modes (all of which scale the body).
          const bodyOrigin = (part.partType === "body" && !canFly) ? "50% 100%" : undefined;

          if (mode === "static") {
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (isAnimOnly) return null;
            return renderPartImg(part, null);
          }
          if (mode === "house") {
            const animName = lookupAnim(HOUSE_ANIMATIONS, part.partType);
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (!animName) {
              if (isAnimOnly) return null;
              return renderPartImg(part, null);
            }
            return renderPartImg(part, animName, undefined, typeIdx > 0 ? dupDelay : undefined);
          }
          if (mode === "sleep") {
            // In sleep mode the body breathes and ears / tail / hair sway
            // gently — see SLEEP_ANIMATIONS. Hide animation-only parts
            // (mouth open) so the pet's mouth stays closed while sleeping.
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (isAnimOnly) return null;
            const animName = lookupAnim(SLEEP_ANIMATIONS, part.partType);
            return renderPartImg(part, animName ?? null, undefined, typeIdx > 0 ? dupDelay : undefined, bodyOrigin);
          }
          if (mode === "petting") {
            // Bouncy "happy being petted" body / limb motion.
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (isAnimOnly) return null;
            const animName = lookupAnim(PETTING_ANIMATIONS, part.partType);
            return renderPartImg(part, animName ?? null, undefined, typeIdx > 0 ? dupDelay : undefined, bodyOrigin);
          }
          const anims = mode === "idle" ? idleAnimMap : mode === "zoom" ? ZOOM_ANIMATIONS : WALK_ANIMATIONS;
          const animName = lookupAnim(anims, part.partType) || anims.body;
          if (!animName) return null;
          // Only the idle body keyframe scales — walk/zoom body uses
          // translateY only, so the anchor override is harmless either way.
          return renderPartImg(part, animName, undefined, typeIdx > 0 ? dupDelay : undefined, bodyOrigin);
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
            (mode !== "house" && mode !== "static") ? anims["head"] :
            undefined;
          const wrapperDuration = getPartDuration("head", mode);
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
                animation: wrapperAnim ? `${wrapperAnim} ${wrapperDuration} cubic-bezier(0.37, 0, 0.63, 1) ${groupDelay}s infinite` : undefined,
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
