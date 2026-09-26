import AdornmentArtwork from "./AdornmentArtwork";
import { ADORNMENT_MOTION_CSS, type AdornmentItemEffect } from "@shared/adornmentAnimation";
import { petTemplateQuery, type PetArtworkForm } from "@/lib/petTemplateQuery";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PetAnimatorCore from "@/components/PetAnimatorCore";
import type { PetCanvasLayout } from "@/components/PetAnimatorCore";
import { apiRequest } from "@/lib/queryClient";
import { getCostumeCanvasPosition } from "@/lib/costumePlacement";
import { getEffectivePetLayer } from "@/lib/petPartConfig";
import { FULL_BOUNDS, getAlphaBoundsSync } from "@/lib/alphaBounds";
import { alphaAdjustedPivot } from "@/lib/petAnimationConfig";
import { ADORNMENT_SLOT_MAP, getWingReplacementPartTypes, normalizeCostumePlacements, type CostumePlacement } from "@shared/costumeFeature";
import { normalizePetParts } from "@/lib/petRenderSafety";

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
  rotation: number;
}

interface TemplateData {
  parts: PetPart[];
  facing: string;
  canFly?: boolean;
  idleStyle?: string | null;
}

export interface PetAnimatorPreviewCostume {
  id: string;
  slot: number;
  copyIndex?: number;
  costumeInventoryId?: string;
  name: string;
  imageUrl: string | null;
  adornmentEffect?: AdornmentItemEffect | null;
  hideAboveHeadPart?: boolean;
  placements?: CostumePlacement[] | null;
}

type EquippedCostume = PetAnimatorPreviewCostume;

interface CostumeResponse {
  equipped: EquippedCostume[];
  extraSlots: number;
  isEvolved?: boolean;
}

export interface PetAnimatorProps {
  petTemplateId: string;
  artworkForm?: PetArtworkForm;
  mode: "idle" | "walk" | "zoom" | "house" | "static" | "sleep" | "petting";
  view?: "front" | "back";
  size?: number;
  fillContainer?: boolean;
  fitVisible?: boolean;
  expression?: "neutral" | "happy" | "petted";
  className?: string;
  style?: React.CSSProperties;
  performanceStatic?: boolean;
  /** Preserve animation while avoiding observers/image-analysis work on memory-constrained devices. */
  lowMemory?: boolean;
  /** Explicit pet inventory id. Required whenever equipped costumes should render. */
  petInventoryId?: string;
  /** Public display mode uses the read-only costume endpoint for another player's pet. */
  costumeAccess?: "owner" | "public";
  /**
   * Admin-only/live-preview costume data. When provided, it is rendered instead
   * of fetching equipped player costumes, so the fitter can preview draft motion.
   */
  previewCostumes?: PetAnimatorPreviewCostume[];
}

const CANVAS_SIZE = 1000;
const HEAD_GROUP_DELAYS = [0, 0.55, 1.1, 1.65];

const HEAD_FACE_PARTS = new Set([
  "eyes", "eyes_closed", "left_ear", "right_ear", "left_ear_2", "right_ear_2",
  "mouth", "mouth_closed", "hair_left", "hair_right", "hair_center",
  "accessory_1", "accessory_2", "above_head",
]);

const IDLE_ANIMS: Record<string, string> = {
  neck: "petIdleBody", left_hand: "petIdleBody", right_hand: "petIdleBody",
  left_arm: "petIdleLeftArmBreath", right_arm: "petIdleRightArmBreath", body: "petIdleBody",
  left_wing: "petIdleLeftWing", right_wing: "petIdleRightWing",
  left_ear: "petIdleLeftEar", right_ear: "petIdleRightEar",
  left_ear_2: "petIdleLeftEar", right_ear_2: "petIdleRightEar",
  left_shoulder: "petIdleBody", right_shoulder: "petIdleBody",
  front_shoulder: "petIdleSideShoulder", back_shoulder: "petIdleBody",
  front_accessory_1: "petIdleAccessorySway", front_accessory_2: "petIdleAccessorySway",
  back_accessory_1: "petIdleAccessorySway", back_accessory_2: "petIdleAccessorySway",
  front_left_accessory: "petIdleAccessorySway", front_right_accessory: "petIdleAccessorySway",
  hair_left: "petIdleLeftHair", hair_right: "petIdleRightHair", hair_center: "petIdleBody",
  back_hair: "petIdleBackHair", above_head: "petAboveHeadBounce",
  wing_set2_left: "petIdleLeftWing", wing_set2_right: "petIdleRightWing",
  front_arm: "petIdleFrontArmBreath", back_arm: "petIdleBody",
  flipper_left: "petIdleFlipperLeft", flipper_right: "petIdleFlipperRight", body_2: "petIdleBody",
  front_wing: "petIdleLeftWing", front_wing_2: "petIdleLeftWing",
  back_wing: "petIdleRightWing", back_wing_2: "petIdleRightWing",
  tail: "petIdleTail", tail_2: "petIdleTail2", tail_3: "petIdleTail3",
};

const WALK_ANIMS: Record<string, string> = {
  head: "petWalkHead", left_ear: "petWalkLeftEar", right_ear: "petWalkRightEar",
  left_ear_2: "petWalkLeftEar", right_ear_2: "petWalkRightEar", neck: "petWalkBody",
  left_arm: "petWalkLeftArm", right_arm: "petWalkRightArm", body: "petWalkBody",
  left_wing: "petWalkLeftWing", right_wing: "petWalkRightWing",
  left_leg: "petWalkLeftLeg", right_leg: "petWalkRightLeg", tail: "petWalkTail",
  front_arm: "petWalkLeftArm", back_arm: "petWalkRightArm",
  flipper_left: "petWalkLeftArm", flipper_right: "petWalkRightArm",
  front_leg: "petWalkLeftLeg", back_leg: "petWalkRightLeg",
  front_wing: "petWalkLeftWing", back_wing: "petWalkRightWing",
};

const SLEEP_ANIMS: Record<string, string> = {
  body: "petSleepBody", neck: "petSleepBody", left_ear: "petSleepLeftEar", right_ear: "petSleepRightEar",
  left_ear_2: "petSleepLeftEar", right_ear_2: "petSleepRightEar", hair_left: "petSleepLeftEar",
  hair_right: "petSleepRightEar", hair_center: "petSleepBody", tail: "petSleepTail", tail_2: "petSleepTail",
  tail_3: "petSleepTail", back_hair: "petSleepTail", flipper_left: "petSleepBody", flipper_right: "petSleepBody",
  body_2: "petSleepBody", above_head: "petAboveHeadBounce", accessory_1: "petSleepLeftEar", accessory_2: "petSleepRightEar",
};

const PETTING_ANIMS: Record<string, string> = {
  body: "petPettingBody", neck: "petPettingBody", left_arm: "petPettingLeftArm", right_arm: "petPettingRightArm",
  left_ear: "petPettingLeftEar", right_ear: "petPettingRightEar", left_ear_2: "petPettingLeftEar", right_ear_2: "petPettingRightEar",
  left_wing: "petPettingLeftWing", right_wing: "petPettingRightWing", tail: "petPettingTail", tail_2: "petPettingTail",
  tail_3: "petPettingTail", front_arm: "petPettingLeftArm", back_arm: "petPettingRightArm",
  flipper_left: "petPettingLeftArm", flipper_right: "petPettingRightArm", front_wing: "petPettingLeftWing",
  back_wing: "petPettingRightWing", hair_left: "petPettingLeftEar", hair_right: "petPettingRightEar",
  hair_center: "petPettingBody", back_hair: "petPettingTail", above_head: "petAboveHeadBounce",
  left_shoulder: "petPettingBody", right_shoulder: "petPettingBody", front_shoulder: "petPettingBody", back_shoulder: "petPettingBody",
  accessory_1: "petPettingLeftEar", accessory_2: "petPettingRightEar",
};

const HOUSE_ANIMS: Record<string, string> = {
  left_ear: "petIdleLeftEar", right_ear: "petIdleRightEar", left_ear_2: "petIdleLeftEar", right_ear_2: "petIdleRightEar",
  left_arm: "petIdleLeftArm", right_arm: "petIdleRightArm", left_wing: "petIdleLeftWing", right_wing: "petIdleRightWing",
  front_arm: "petIdleLeftArm", back_arm: "petIdleRightArm", flipper_left: "petIdleLeftArm", flipper_right: "petIdleRightArm",
  front_wing: "petIdleLeftWing", back_wing: "petIdleRightWing", tail: "petHouseTail", above_head: "petAboveHeadBounce",
};

const ALTERNATE_ANIMS = new Set([
  "petIdleHead", "petIdleHeadGround", "petIdleHeadSide", "petIdleHeadSway", "petIdleHeadSwayAlt",
  "petIdleLeftEar", "petIdleRightEar", "petBatLeftEar", "petBatRightEar",
  "petIdleLeftArm", "petIdleRightArm", "petIdleBody", "petIdleLeftWing", "petIdleRightWing",
  "petIdleLeftLeg", "petIdleRightLeg", "petIdleTail", "petIdleTail2", "petIdleTail3",
  "petIdleSideTail", "petIdleSideTail2", "petIdleSideTail3", "petAboveHeadBounce", "petIdleSideShoulder",
  "petIdleAccessorySway", "petIdleLeftArmBreath", "petIdleRightArmBreath", "petIdleFrontArmBreath",
  "petIdleFlipperLeft", "petIdleFlipperRight", "petIdleBackHair", "petIdleBodyMarionette",
  "petIdleLeftArmBreathMarionette", "petIdleRightArmBreathMarionette", "petIdleAccessoryBodyFollow",
  "petAboveHeadBounceMarionette", "petIdleLeftLegMarionette", "petIdleRightLegMarionette",
]);

const PET_ATTACHMENT_SEAM_GUARD = `
@keyframes petIdleHead {
  from { transform: translateY(0%); }
  to { transform: translateY(max(var(--pet-head-bob, -0.8%), -0.8%)); }
}
@keyframes petIdleHeadSide {
  from { transform: translateY(0) rotate(0deg); }
  to { transform: translateY(max(var(--pet-head-bob, -0.8%), -0.8%)) rotate(0.7deg); }
}
`;

// Forest Squirrel Fox has very tall ears and an oversized tail, so the generic
// idle amplitudes read as separation instead of a soft living pose. Keep this
// profile completely opt-in: only templates tagged `idleStyle=squirrel_fox`
// receive the calmer base-pinned mirrored ear sway and slower tail sweep.
const SQUIRREL_FOX_IDLE_GUARD = `
@keyframes petSquirrelFoxLeftEar {
  from { transform: rotate(-0.45deg); }
  to   { transform: rotate(0.45deg); }
}
@keyframes petSquirrelFoxRightEar {
  from { transform: rotate(0.45deg); }
  to   { transform: rotate(-0.45deg); }
}
@keyframes petSquirrelFoxTail {
  from { transform: rotate(-2.5deg); }
  to   { transform: rotate(2.5deg); }
}
.pet-profile-squirrel-fox img[alt="left_ear"],
.pet-profile-squirrel-fox img[alt="left_ear_2"] {
  transform-origin: 50% 100% !important;
  animation: petSquirrelFoxLeftEar 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate !important;
}
.pet-profile-squirrel-fox img[alt="right_ear"],
.pet-profile-squirrel-fox img[alt="right_ear_2"] {
  transform-origin: 50% 100% !important;
  animation: petSquirrelFoxRightEar 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate !important;
}
.pet-profile-squirrel-fox img[alt="tail"],
.pet-profile-squirrel-fox img[alt="tail_2"],
.pet-profile-squirrel-fox img[alt="tail_3"] {
  animation: petSquirrelFoxTail 3.3s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate !important;
}
`;

function basePartType(partType: string) {
  return partType.replace(/^h[23]_/, "");
}

function stableDelay(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `-${((h % 1500) / 1000).toFixed(2)}s`;
}

function syncAnimationDelay(delay: string, elapsedSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return delay;
  const match = delay.trim().match(/^(-?[\d.]+)s$/);
  if (!match) return delay;
  return `${(Number(match[1]) - elapsedSeconds).toFixed(3)}s`;
}

function buildAnimation(animName: string, duration: string, delay: string) {
  if (!ALTERNATE_ANIMS.has(animName)) return `${animName} ${duration} cubic-bezier(0.37, 0, 0.63, 1) ${delay} infinite`;
  const match = duration.match(/^([\d.]+)(s|ms)$/);
  const half = match ? `${parseFloat(match[1]) / 2}${match[2]}` : duration;
  return `${animName} ${half} cubic-bezier(0.45, 0, 0.55, 1) ${delay} infinite alternate`;
}

function getDuration(partType: string, mode: PetAnimatorProps["mode"]) {
  const base = basePartType(partType);
  if (mode === "sleep") return base === "body" ? "5.5s" : "5s";
  if (mode === "petting") {
    if (base === "tail") return "2.6s";
    if (base === "left_ear_2" || base === "right_ear_2") return "2.1s";
    return "2.4s";
  }
  if (mode === "house") {
    const durations: Record<string, string> = { left_ear: "3.5s", right_ear: "3.5s", left_arm: "3.5s", right_arm: "3.5s", left_wing: "3.5s", right_wing: "3.5s", tail: "4s", front_arm: "3.5s", back_arm: "3.5s", front_wing: "3.5s", back_wing: "3.5s" };
    return durations[base] ?? "3.5s";
  }
  if (mode === "idle") {
    const durations: Record<string, string> = {
      head: "3s", left_ear: "5s", right_ear: "5s", left_ear_2: "5.3s", right_ear_2: "5.3s",
      left_arm: "4.5s", right_arm: "4.5s", body: "4.5s", left_wing: "4s", right_wing: "4s",
      left_leg: "4s", right_leg: "4s", tail: "4.5s", tail_2: "3.7s", tail_3: "4.1s", back_hair: "3.5s",
      front_arm: "4.5s", back_arm: "4.5s", flipper_left: "4.5s", flipper_right: "4.5s", body_2: "4.5s",
      front_leg: "4.5s", back_leg: "4.5s", front_wing: "4s", back_wing: "4s", back_shoulder: "4.5s",
      front_shoulder: "4s", left_shoulder: "4.5s", right_shoulder: "4.5s", neck: "4.5s",
      back_accessory_1: "4s", back_accessory_2: "4s", front_accessory_1: "4s", front_accessory_2: "4s",
      front_left_accessory: "4s", front_right_accessory: "4s", above_head: "4s",
    };
    return durations[base] ?? "3s";
  }
  if (mode === "zoom") return ["left_wing", "right_wing", "front_wing", "back_wing"].includes(base) ? "0.45s" : "0.6s";
  return "0.6s";
}

function isBodyBreathAnimation(name: string | null) {
  return name === "petIdleBody" || name === "petIdleLeftArmBreath" || name === "petIdleRightArmBreath" ||
    name === "petIdleFrontArmBreath" || name === "petIdleFlipperLeft" || name === "petIdleFlipperRight" ||
    name === "petIdleBodyMarionette" || name === "petPettingBody" || name === "petSleepBody";
}

function isTailIdleAnimation(name: string | null) {
  return !!name && ["petIdleTail", "petIdleTail2", "petIdleTail3", "petIdleSideTail", "petIdleSideTail2", "petIdleSideTail3"].includes(name);
}

function headGroupType(partType: string): "head" | "h2_head" | "h3_head" | null {
  if (partType === "head" || partType === "h2_head" || partType === "h3_head") return partType;
  const prefix = partType.match(/^(h[23])_(.+)$/);
  const bare = prefix ? prefix[2] : partType;
  if (!HEAD_FACE_PARTS.has(bare)) return null;
  return prefix ? `${prefix[1]}_head` as "h2_head" | "h3_head" : "head";
}

function anchorAnimation(part: PetPart, mode: PetAnimatorProps["mode"], resolvedView: "front" | "back", idleStyle: string | null, canFly: boolean) {
  const base = basePartType(part.partType);
  if (mode === "static") return null;
  if (headGroupType(part.partType) && (base === "head" || base === "hair_center" || base === "eyes" || base === "eyes_closed" || base === "mouth" || base === "mouth_closed")) return null;
  if (mode === "house") return HOUSE_ANIMS[base] ?? null;
  if (mode === "sleep") return SLEEP_ANIMS[base] ?? null;
  if (mode === "petting") return PETTING_ANIMS[base] ?? null;
  if (mode === "walk" || mode === "zoom") {
    const group = headGroupType(part.partType);
    if (group && WALK_ANIMS[base] === undefined) return null;
    const name = WALK_ANIMS[base] ?? WALK_ANIMS.body;
    if (mode === "zoom" && base === "left_wing") return "petZoomLeftWing";
    if (mode === "zoom" && base === "right_wing") return "petZoomRightWing";
    if (mode === "zoom" && base === "front_wing") return "petZoomLeftWing";
    if (mode === "zoom" && base === "back_wing") return "petZoomRightWing";
    return name ?? null;
  }
  if (mode === "idle" && !canFly && ["left_leg", "right_leg", "front_leg", "back_leg"].includes(base)) return null;
  let name = IDLE_ANIMS[base] ?? "petIdleBody";
  if (resolvedView === "back") {
    if (base === "tail") name = "petIdleSideTail";
    if (base === "tail_2") name = "petIdleSideTail2";
    if (base === "tail_3") name = "petIdleSideTail3";
  }
  if (idleStyle === "bat" && (base === "left_ear" || base === "left_ear_2")) name = "petBatLeftEar";
  if (idleStyle === "bat" && (base === "right_ear" || base === "right_ear_2")) name = "petBatRightEar";
  if (idleStyle === "marionette") {
    if (name === "petIdleBody") name = "petIdleBodyMarionette";
    else if (name === "petIdleLeftArmBreath" || name === "petIdleLeftArm") name = "petIdleLeftArmBreathMarionette";
    else if (name === "petIdleRightArmBreath" || name === "petIdleRightArm") name = "petIdleRightArmBreathMarionette";
    else if (name === "petIdleAccessorySway") name = "petIdleAccessoryBodyFollow";
    else if (name === "petAboveHeadBounce") name = "petAboveHeadBounceMarionette";
  }
  return name;
}

function partOrigin(part: PetPart, animName: string | null, bodyPart: PetPart | undefined, canFly: boolean) {
  if (part.partType === "body" && !canFly) return "50% 100%";
  const base = basePartType(part.partType);
  const alpha = getAlphaBoundsSync(part.imageUrl) ?? FULL_BOUNDS;
  if (base === "tail" || base === "tail_2" || base === "tail_3") {
    const bottom = (alpha.top + alpha.height) * 100;
    const x = base === "tail_2" ? (alpha.left + alpha.width / 2) * 100 : base === "tail_3" ? (alpha.left + alpha.width) * 100 : alpha.left * 100;
    return `${x.toFixed(2)}% ${bottom.toFixed(2)}%`;
  }
  if ((animName === "petBatLeftEar" || animName === "petBatRightEar")) {
    return `${((alpha.left + alpha.width * 0.5) * 100).toFixed(2)}% ${((alpha.top + alpha.height) * 100).toFixed(2)}%`;
  }
  if (isBodyBreathAnimation(animName) && bodyPart && part.partType !== "body" && part.width > 0 && part.height > 0) {
    const bodyAlpha = getAlphaBoundsSync(bodyPart.imageUrl) ?? FULL_BOUNDS;
    const bodyPivot = alphaAdjustedPivot(bodyPart.pivotX, bodyPart.pivotY, bodyAlpha, { x: 0.5, y: 0.5 });
    const worldX = canFly ? bodyPart.posX + bodyPart.width * bodyPivot.x : bodyPart.posX + bodyPart.width * 0.5;
    const worldY = canFly ? bodyPart.posY + bodyPart.height * bodyPivot.y : bodyPart.posY + bodyPart.height;
    return `${(((worldX - part.posX) / part.width) * 100).toFixed(2)}% ${(((worldY - part.posY) / part.height) * 100).toFixed(2)}%`;
  }
  const pivot = alphaAdjustedPivot(part.pivotX, part.pivotY, alpha, { x: 0.5, y: 0.5 });
  return `${(pivot.x * 100).toFixed(2)}% ${(pivot.y * 100).toFixed(2)}%`;
}

function getHeadWrapperMotion(groupType: "head" | "h2_head" | "h3_head", mode: PetAnimatorProps["mode"], resolvedView: "front" | "back", bodyDelay: string) {
  let animation: string | null = null;
  let duration = getDuration("head", mode);
  let delay = `${HEAD_GROUP_DELAYS[groupType === "h2_head" ? 1 : groupType === "h3_head" ? 2 : 0]}s`;
  if (mode === "idle") {
    if (groupType === "h2_head") { animation = "petIdleHeadSway"; duration = "3.2s"; delay = "-0.40s"; }
    else if (groupType === "h3_head") { animation = "petIdleHeadSwayAlt"; duration = "4.1s"; delay = "-1.40s"; }
    else { animation = resolvedView === "back" ? "petIdleHeadSide" : "petIdleHead"; duration = "4.5s"; delay = bodyDelay; }
  } else if (mode === "sleep") animation = "petSleepHead";
  else if (mode === "petting") animation = "petPettingHead";
  else if (mode === "walk" || mode === "zoom") animation = "petWalkHead";
  return { animation, duration, delay };
}

function computeHeadBob(bodyPart: PetPart | undefined, canFly: boolean) {
  if (!bodyPart) return "-0.80%";
  const bodyAlpha = getAlphaBoundsSync(bodyPart.imageUrl) ?? FULL_BOUNDS;
  const visibleBodyHeight = bodyPart.height * bodyAlpha.height;
  let topRiseFraction = 1;
  if (canFly) {
    const pivotY = (bodyPart.pivotY ?? 50) / 100;
    const originYFraction = bodyAlpha.top + bodyAlpha.height * pivotY;
    topRiseFraction = Math.max(0, Math.min(1, originYFraction));
  }
  const bodyTopRisePct = (visibleBodyHeight / CANVAS_SIZE) * 2.2 * topRiseFraction;
  const minBob = canFly ? 0.25 : 0.5;
  return `-${Math.min(1.2, Math.max(minBob, bodyTopRisePct)).toFixed(2)}%`;
}

function placementsForArtworkForm(placements: CostumePlacement[], artworkForm: PetArtworkForm, view?: "front" | "side") {
  const inView = (placement: CostumePlacement) => !view || placement.view === view;
  const exact = placements.filter((placement) => (placement.form ?? "base") === artworkForm && inView(placement));
  if (exact.length > 0 || artworkForm === "base") return exact;
  return placements.filter((placement) => (placement.form ?? "base") === "base" && inView(placement));
}

function semanticFollowPartType(costume: EquippedCostume, placement: CostumePlacement): string | null {
  // Explicit Head-layer choices are allowed for any Head adornment effect so
  // duplicate hats/horns/etc. can follow Head 1, 2, or 3 independently.
  if (costume.slot === ADORNMENT_SLOT_MAP.head && placement.followPartIndex) {
    return ["head", "h2_head", "h3_head"][placement.followPartIndex - 1] ?? "head";
  }

  // Preserve the existing Still behavior for placements that do not opt into
  // an explicit semantic layer target.
  if (costume.adornmentEffect !== "still") return null;
  if (costume.slot === ADORNMENT_SLOT_MAP.head) return "head";
  if (costume.slot === ADORNMENT_SLOT_MAP.left_hand) return "left_hand";
  if (costume.slot === ADORNMENT_SLOT_MAP.right_hand) return "right_hand";
  return null;
}

function rebasePlacementToPart(placement: CostumePlacement, target: PetPart, parts: PetPart[]): CostumePlacement {
  const sourceAnchor = placement.anchorPart === "independent"
    ? null
    : parts.find((part) => part.partType === placement.anchorPart) ?? null;
  const current = getCostumeCanvasPosition(sourceAnchor, placement);
  if (!current) return placement;
  const currentPivotX = current.left + placement.width * placement.pivotX / 100;
  const currentPivotY = current.top + placement.height * placement.pivotY / 100;
  const targetPivotX = target.posX + target.width * (target.pivotX ?? 50) / 100;
  const targetPivotY = target.posY + target.height * (target.pivotY ?? 50) / 100;
  return {
    ...placement,
    anchorPart: target.partType,
    posX: currentPivotX - targetPivotX,
    posY: currentPivotY - targetPivotY,
  };
}

function CostumeLayer({
  depth, costumes, viewParts, mode, resolvedView, artworkForm, facing, canFly, idleStyle, bodyDelay, headBob, motionElapsedSeconds,
}: {
  depth: "front" | "back";
  costumes: EquippedCostume[];
  viewParts: PetPart[];
  mode: PetAnimatorProps["mode"];
  resolvedView: "front" | "back";
  artworkForm: PetArtworkForm;
  facing: string;
  canFly: boolean;
  idleStyle: string | null;
  bodyDelay: string;
  headBob: string;
  motionElapsedSeconds: number;
}) {
  const sortedParts = useMemo(() => [...viewParts].sort((a, b) => getEffectivePetLayer(a, facing) - getEffectivePetLayer(b, facing)), [viewParts, facing]);
  const bodyPart = sortedParts.find(part => part.partType === "body");
  const headTypes = sortedParts.filter(part => part.partType === "head" || part.partType === "h2_head" || part.partType === "h3_head").map(part => part.partType);

  const wingDelay = useMemo(() => {
    const result = new Map<string, string>();
    const pairs: Array<[string, string, number]> = [
      ["back_wing", "front_wing", 0], ["back_wing_2", "front_wing_2", 1],
      ["left_wing", "right_wing", 0], ["wing_set2_left", "wing_set2_right", 1],
      ["head_wing_left", "head_wing_right", 2],
    ];
    const offsets = [0, 0.9, 1.8];
    for (const [a, b, setIndex] of pairs) {
      const partA = sortedParts.find(part => part.partType === a);
      const partB = sortedParts.find(part => part.partType === b);
      if (!partA || !partB) continue;
      const seed = partA.id < partB.id ? partA.id : partB.id;
      let h = 0;
      for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
      const delay = `-${(((h % 1500) / 1000) + (offsets[setIndex] ?? 0)).toFixed(2)}s`;
      result.set(partA.id, delay);
      result.set(partB.id, delay);
    }
    return result;
  }, [sortedParts]);

  const renderCostume = (costume: EquippedCostume) => {
    const costumeView = resolvedView === "back" ? "side" : "front";
    const allPlacements = Array.isArray(costume.placements) ? costume.placements : [];
    const viewPlacements = placementsForArtworkForm(allPlacements, artworkForm, costumeView);
    const canonicalPlacements = costume.slot === ADORNMENT_SLOT_MAP.wings
      ? viewPlacements.slice(0, 1)
      : viewPlacements;
    const placements = canonicalPlacements.filter((item) => item.depth === depth);
    if (!costume.imageUrl || placements.length === 0) return null;

    return <>{placements.map((savedPlacement) => {
      const dontMove = savedPlacement.dontMove === true;
      const followPartType = dontMove ? null : semanticFollowPartType(costume, savedPlacement);
      const followPart = followPartType ? sortedParts.find((part) => part.partType === followPartType) : undefined;
      const placement = followPart ? rebasePlacementToPart(savedPlacement, followPart, sortedParts) : savedPlacement;

      if (dontMove) {
        const fixedAnchor = placement.anchorPart === "independent"
          ? null
          : sortedParts.find((part) => part.partType === placement.anchorPart) ?? null;
        const position = getCostumeCanvasPosition(fixedAnchor, placement);
        if (!position) return null;
        return <div
          key={`${costume.id}-${costumeView}-${depth}-${placement.instance ?? 1}-fixed`}
          data-testid={`adornment-fixed-${costume.id}-${placement.instance ?? 1}`}
          style={{
            position: "absolute",
            left: `${position.left / CANVAS_SIZE * 100}%`,
            top: `${position.top / CANVAS_SIZE * 100}%`,
            width: `${placement.width / CANVAS_SIZE * 100}%`,
            height: `${placement.height / CANVAS_SIZE * 100}%`,
            transform: `rotate(${placement.rotation ?? 0}deg) scaleX(${placement.flipX ? -1 : 1})`,
            transformOrigin: `${placement.pivotX}% ${placement.pivotY}%`,
            pointerEvents: "none",
          }}
        >
          <AdornmentArtwork
            src={costume.imageUrl!}
            placement={placement}
            animated={false}
            effect={costume.adornmentEffect}
            wingPair={costume.slot === ADORNMENT_SLOT_MAP.wings}
          />
        </div>;
      }

      if (placement.anchorPart === "independent") {
        const position = getCostumeCanvasPosition(null, placement)!;
        return <div key={`${costume.id}-${costumeView}-${depth}-${placement.instance ?? 1}`}
          data-testid={`adornment-independent-${costume.id}-${placement.instance ?? 1}`}
          style={{ position: "absolute", left: `${position.left / CANVAS_SIZE * 100}%`, top: `${position.top / CANVAS_SIZE * 100}%`,
            width: `${placement.width / CANVAS_SIZE * 100}%`, height: `${placement.height / CANVAS_SIZE * 100}%`,
            transform: `rotate(${placement.rotation ?? 0}deg) scaleX(${placement.flipX ? -1 : 1})`,
            transformOrigin: `${placement.pivotX}% ${placement.pivotY}%`, pointerEvents: "none" }}>
          <AdornmentArtwork src={costume.imageUrl!} placement={placement} animated={mode !== "static"} effect={costume.adornmentEffect} wingPair={costume.slot === ADORNMENT_SLOT_MAP.wings} />
        </div>;
      }
      const anchor = sortedParts.find(part => part.partType === placement.anchorPart);
      if (!anchor || anchor.width <= 0 || anchor.height <= 0) return null;
      const position = getCostumeCanvasPosition(anchor, placement);
      if (!position) return null;

      const animName = anchorAnimation(anchor, mode, resolvedView, idleStyle, canFly);
      const groupType = headGroupType(anchor.partType);
      const groupIndex = Math.max(0, headTypes.indexOf(groupType ?? "head"));
      const groupDelay = `${HEAD_GROUP_DELAYS[Math.min(groupIndex, HEAD_GROUP_DELAYS.length - 1)] ?? 0}s`;
      const basePartDelay = groupType ? groupDelay : (isBodyBreathAnimation(animName) || isTailIdleAnimation(animName) ? bodyDelay : wingDelay.get(anchor.id) ?? stableDelay(anchor.id));
      const partDelay = syncAnimationDelay(basePartDelay, motionElapsedSeconds);
      const duration = getDuration(anchor.partType, mode);
      const origin = partOrigin(anchor, animName, bodyPart, canFly);
      const placementInstance = placement.instance ?? 1;
      const placementKey = `${costume.id}-${costumeView}-${depth}-${placementInstance}`;

      const localLeft = ((position.left - anchor.posX) / anchor.width) * 100;
      const localTop = ((position.top - anchor.posY) / anchor.height) * 100;
      const localWidth = (placement.width / anchor.width) * 100;
      const localHeight = (placement.height / anchor.height) * 100;

      const anchorNode = (
        <div
          data-testid={`costume-anchor-${placement.anchorPart}-${placementInstance}`}
          style={{
            position: "absolute",
            left: `${(anchor.posX / CANVAS_SIZE) * 100}%`,
            top: `${(anchor.posY / CANVAS_SIZE) * 100}%`,
            width: `${(anchor.width / CANVAS_SIZE) * 100}%`,
            height: `${(anchor.height / CANVAS_SIZE) * 100}%`,
            transformOrigin: origin,
            rotate: `${anchor.rotation ?? 0}deg`,
            animation: animName ? buildAnimation(animName, duration, partDelay) : undefined,
            willChange: animName ? "transform" : undefined,
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <div
            data-testid={`costume-piece-${costume.id}-${placementInstance}`}
            style={{
              position: "absolute",
              left: `${localLeft}%`,
              top: `${localTop}%`,
              width: `${localWidth}%`,
              height: `${localHeight}%`,
              transform: `rotate(${placement.rotation ?? 0}deg) scaleX(${placement.flipX ? -1 : 1})`,
              transformOrigin: `${placement.pivotX}% ${placement.pivotY}%`,
              pointerEvents: "none",
            }}
          >
            <AdornmentArtwork
              src={costume.imageUrl!}
              placement={placement}
              animated={mode !== "static"}
              effect={costume.adornmentEffect}
              wingPair={costume.slot === ADORNMENT_SLOT_MAP.wings}
            />
          </div>
        </div>
      );

      if (!groupType) return <div key={placementKey}>{anchorNode}</div>;

      const wrapper = getHeadWrapperMotion(groupType, mode, resolvedView, bodyDelay);
      const wrapperDelay = syncAnimationDelay(wrapper.delay, motionElapsedSeconds);
      return (
        <div
          key={placementKey}
          data-testid={`costume-head-group-${groupType}-${placementInstance}`}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            animation: wrapper.animation ? buildAnimation(wrapper.animation, wrapper.duration, wrapperDelay) : undefined,
            willChange: wrapper.animation ? "transform" : undefined,
            pointerEvents: "none",
            ...(mode === "idle" ? ({ "--pet-head-bob": headBob } as React.CSSProperties) : {}),
          }}
        >
          {anchorNode}
        </div>
      );
    })}</>;
  };

  return <>{costumes.map(renderCostume)}</>;
}

function AboveHeadTopLayer({
  viewParts, mode, resolvedView, facing, canFly, idleStyle, bodyDelay, headBob, motionElapsedSeconds,
}: {
  viewParts: PetPart[];
  mode: PetAnimatorProps["mode"];
  resolvedView: "front" | "back";
  facing: string;
  canFly: boolean;
  idleStyle: string | null;
  bodyDelay: string;
  headBob: string;
  motionElapsedSeconds: number;
}) {
  const sortedParts = useMemo(() => [...viewParts].sort((a, b) => getEffectivePetLayer(a, facing) - getEffectivePetLayer(b, facing)), [viewParts, facing]);
  const bodyPart = sortedParts.find(part => part.partType === "body");
  const headTypes = sortedParts.filter(part => part.partType === "head" || part.partType === "h2_head" || part.partType === "h3_head").map(part => part.partType);
  const aboveHeadParts = sortedParts.filter(part => basePartType(part.partType) === "above_head");

  return <>{aboveHeadParts.map((part) => {
    const groupType = headGroupType(part.partType) ?? "head";
    const groupIndex = Math.max(0, headTypes.indexOf(groupType));
    const groupDelay = `${HEAD_GROUP_DELAYS[Math.min(groupIndex, HEAD_GROUP_DELAYS.length - 1)] ?? 0}s`;
    const animName = anchorAnimation(part, mode, resolvedView, idleStyle, canFly);
    const isMarionetteAboveHead = mode === "idle" && idleStyle === "marionette" && animName === "petAboveHeadBounceMarionette";
    const basePartDelay = isMarionetteAboveHead ? bodyDelay : groupDelay;
    const partDelay = syncAnimationDelay(basePartDelay, motionElapsedSeconds);
    const partDuration = isMarionetteAboveHead ? "4.5s" : getDuration(part.partType, mode);
    const origin = partOrigin(part, animName, bodyPart, canFly);
    const wrapper = getHeadWrapperMotion(groupType, mode, resolvedView, bodyDelay);
    const wrapperDelay = syncAnimationDelay(wrapper.delay, motionElapsedSeconds);

    return (
      <div
        key={`above-head-top-${part.id}`}
        data-testid={`above-head-top-group-${groupType}`}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          animation: wrapper.animation ? buildAnimation(wrapper.animation, wrapper.duration, wrapperDelay) : undefined,
          willChange: wrapper.animation ? "transform" : undefined,
          pointerEvents: "none",
          ...(mode === "idle" ? ({ "--pet-head-bob": headBob } as React.CSSProperties) : {}),
        }}
      >
        <img
          src={part.imageUrl}
          alt={part.partType}
          draggable={false}
          data-testid={`above-head-top-${part.partType}`}
          style={{
            position: "absolute",
            left: `${(part.posX / CANVAS_SIZE) * 100}%`,
            top: `${(part.posY / CANVAS_SIZE) * 100}%`,
            width: `${(part.width / CANVAS_SIZE) * 100}%`,
            height: `${(part.height / CANVAS_SIZE) * 100}%`,
            transformOrigin: origin,
            rotate: `${part.rotation ?? 0}deg`,
            animation: animName ? buildAnimation(animName, partDuration, partDelay) : undefined,
            willChange: animName ? "transform" : undefined,
            imageRendering: "auto",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  })}</>;
}

export default function PetAnimator({
  petTemplateId,
  artworkForm,
  mode,
  view = "front",
  size = 200,
  fillContainer = false,
  fitVisible = false,
  expression = "neutral",
  className = "",
  style,
  performanceStatic = false,
  lowMemory = false,
  petInventoryId,
  costumeAccess = "owner",
  previewCostumes,
}: PetAnimatorProps) {
  const [canvasLayout, setCanvasLayout] = useState<PetCanvasLayout | null>(null);
  const receiveCanvasLayout = useCallback((next: PetCanvasLayout) => {
    setCanvasLayout(current => current?.templateId === next.templateId && current.innerSize === next.innerSize && current.innerOffset === next.innerOffset && current.transform === next.transform ? current : next);
  }, []);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [measuredSize, setMeasuredSize] = useState(size);
  const motionEpochRef = useRef<{ templateId: string; startedAt: number } | null>(null);

  useLayoutEffect(() => {
    if (!(fillContainer || fitVisible)) return;
    const node = wrapperRef.current;
    if (!node) return;
    const measure = () => {
      // clientWidth/clientHeight stay in the stage's logical coordinate space.
      // getBoundingClientRect() includes the tablet/desktop stage transform,
      // which double-counted the stage scale for costume layers while the core
      // pet renderer's ResizeObserver correctly settled on unscaled content-box
      // dimensions. Keeping both renderers on logical dimensions preserves the
      // saved 1000x1000 pet/costume placement contract across device classes.
      const next = Math.min(node.clientWidth, node.clientHeight);
      if (next > 0) setMeasuredSize(prev => Math.abs(prev - next) > 0.5 ? next : prev);
    };
    measure();
    if (lowMemory || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fillContainer, fitVisible, lowMemory]);

  const resolvedPetInventoryId = petInventoryId ?? null;

  const { data: costumeData } = useQuery<CostumeResponse>({
    queryKey: ["/api/pet", resolvedPetInventoryId, "costumes", costumeAccess],
    queryFn: async () => {
      const suffix = costumeAccess === "public" ? "/public" : "";
      return (await apiRequest("GET", `/api/pet/${resolvedPetInventoryId}/costumes${suffix}`)).json();
    },
    enabled: !!resolvedPetInventoryId,
    staleTime: costumeAccess === "public" ? 60_000 : 0,
    refetchOnWindowFocus: false,
  });

  // Owned pets must not render base artwork while their server-owned evolution
  // state is still loading. On memory-constrained mobile browsers that briefly
  // decoded both complete forms before swapping to evolution, which could
  // terminate the page process and create a startup reload loop.
  const artworkDecisionReady = artworkForm !== undefined || !resolvedPetInventoryId || costumeData !== undefined;
  const resolvedArtworkForm: PetArtworkForm = artworkForm ?? (costumeData?.isEvolved ? "evolution" : "base");
  const templateQuery = petTemplateQuery(petTemplateId, resolvedArtworkForm);
  const { data: templateData } = useQuery<TemplateData>({
    ...templateQuery,
    enabled: artworkDecisionReady && templateQuery.enabled,
  });
  const evolvedLowMemory = lowMemory || (artworkForm === undefined && !!costumeData?.isEvolved);

  if (templateData && motionEpochRef.current?.templateId !== petTemplateId) {
    motionEpochRef.current = {
      templateId: petTemplateId,
      startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
  }
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const motionElapsedSeconds = templateData && motionEpochRef.current
    ? Math.max(0, (now - motionEpochRef.current.startedAt) / 1000)
    : 0;

  const allParts = normalizePetParts(templateData?.parts);
  const facing = templateData?.facing ?? "front";
  const frontCount = allParts.filter(part => part.view === "front").length;
  const backCount = allParts.filter(part => part.view === "back").length;
  const resolvedView: "front" | "back" = facing === "back" ? "back" : (frontCount === 0 && backCount > 0) ? "back" : view;
  const viewParts = allParts.filter(part => part.view === resolvedView);
  const bodyPart = viewParts.find(part => part.partType === "body");
  const bodyDelay = bodyPart ? stableDelay(bodyPart.id) : "0s";
  const canFly = !!templateData?.canFly;
  const headBob = computeHeadBob(bodyPart, canFly);

  const isLargeStyle = viewParts.some(part => part.width >= 500 || part.height >= 500);
  const partScale = isLargeStyle ? 0.3 : 1;
  const fillFull = fillContainer || fitVisible;
  const effectiveSize = fillFull ? measuredSize : size;
  const innerSize = fillFull ? effectiveSize / partScale : size;
  const innerOffset = fillFull ? -((innerSize - effectiveSize) / 2) : 0;
  const costumeSource = previewCostumes ?? costumeData?.equipped;
  const equipped = Array.isArray(costumeSource)
    ? costumeSource
        .filter((costume) => costume && typeof costume === "object")
        .map((costume) => ({ ...costume, placements: normalizeCostumePlacements(costume.placements) }))
    : [];
  const hiddenWingPartTypes = useMemo(() => {
    const hidden = new Set<string>();
    const costumeView = resolvedView === "back" ? "side" : "front";
    for (const costume of equipped) {
      const allPlacements = Array.isArray(costume.placements) ? costume.placements : [];
      const placements = placementsForArtworkForm(allPlacements, resolvedArtworkForm, costumeView);
      const hasVisibleWingsAdornment = costume.slot === ADORNMENT_SLOT_MAP.wings
        && placements.length > 0;
      if (hasVisibleWingsAdornment) {
        for (const part of viewParts) if (part.partType.toLowerCase().includes("wing")) hidden.add(part.partType);
      }
      for (const placement of placements) {
        if (!placement || placement.view !== costumeView) continue;
        if (placement.anchorPart === "independent" && placement.replacesWings) {
          for (const part of viewParts) if (part.partType.toLowerCase().includes("wing")) hidden.add(part.partType);
        }
        for (const partType of getWingReplacementPartTypes(placement.anchorPart)) hidden.add(partType);
      }
    }
    return hidden;
  }, [previewCostumes, costumeData?.equipped, resolvedView, resolvedArtworkForm, templateData?.parts]);
  const renderCostumes = (previewCostumes !== undefined || !!resolvedPetInventoryId) && equipped.length > 0 && !!templateData;
  const hasAboveHead = viewParts.some(part => basePartType(part.partType) === "above_head");
  const costumeView = resolvedView === "back" ? "side" : "front";
  const hideAboveHeadPart = equipped.some((costume) => {
    if (costume.slot !== ADORNMENT_SLOT_MAP.head || costume.hideAboveHeadPart !== true || !Array.isArray(costume.placements)) return false;
    return placementsForArtworkForm(costume.placements, resolvedArtworkForm, costumeView).length > 0;
  });
  // Above-head parts are intentionally re-rendered in the z=3 top layer while
  // costumes are visible so crowns/halos/hats stay above front costume pieces.
  // Hide those exact source parts from PetAnimatorCore at the same time.
  // Otherwise the same artwork exists twice and the two copies drift apart
  // after a refetch/re-render restarts the late top-layer animation phase.
  const hiddenCorePartTypes = useMemo(() => {
    const hidden = new Set(hiddenWingPartTypes);
    if (renderCostumes && hasAboveHead) {
      for (const part of viewParts) {
        if (basePartType(part.partType) === "above_head") hidden.add(part.partType);
      }
    }
    return hidden;
  }, [hiddenWingPartTypes, renderCostumes, hasAboveHead, viewParts]);

  // Use the core's measured/visible-fit canvas so independently placed pieces
  // share the pet's position and scale on every screen size.
  const artworkCanvas = canvasLayout?.templateId === petTemplateId
    ? canvasLayout : { innerSize, innerOffset, transform: `scale(${partScale})` };
  const artworkCanvasStyle: React.CSSProperties = { position: "absolute", top: artworkCanvas.innerOffset, left: artworkCanvas.innerOffset,
    width: artworkCanvas.innerSize, height: artworkCanvas.innerSize, transform: artworkCanvas.transform, transformOrigin: "center center" };

  const costumeLayer = (depth: "front" | "back") => (
    <div
      aria-hidden
      data-testid={`pet-animator-costumes-${depth}`}
      style={{ position: "absolute", inset: 0, zIndex: depth === "front" ? 2 : 0, pointerEvents: "none", overflow: "visible" }}
    >
      <div style={artworkCanvasStyle}>
        <CostumeLayer
          depth={depth}
          costumes={equipped}
          viewParts={viewParts}
          mode={performanceStatic ? "static" : mode}
          resolvedView={resolvedView}
          artworkForm={resolvedArtworkForm}
          facing={facing}
          canFly={canFly}
          idleStyle={templateData?.idleStyle ?? null}
          bodyDelay={bodyDelay}
          headBob={headBob}
          motionElapsedSeconds={motionElapsedSeconds}
        />
      </div>
    </div>
  );

  const profileClass = mode === "idle" && templateData?.idleStyle === "squirrel_fox" ? "pet-profile-squirrel-fox" : "";

  return (
    <div
      ref={wrapperRef}
      className={`${className} ${profileClass}`.trim()}
      data-testid="pet-animator-with-costumes"
      style={{
        width: fillContainer ? "100%" : size,
        height: fillContainer ? "100%" : size,
        position: "relative",
        overflow: "visible",
        ...style,
      }}
    >
      {renderCostumes && costumeLayer("back")}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        {artworkDecisionReady ? (
          <PetAnimatorCore
            petTemplateId={petTemplateId}
            artworkForm={resolvedArtworkForm}
            onCanvasLayout={renderCostumes ? receiveCanvasLayout : undefined}
            mode={mode}
            view={view}
            size={size}
            fillContainer={fillContainer}
            fitVisible={fitVisible}
            expression={expression}
            performanceStatic={performanceStatic}
            lowMemory={evolvedLowMemory}
            hiddenPartTypes={hiddenCorePartTypes}
            style={{ width: "100%", height: "100%" }}
          />
        ) : null}
      </div>
      <style data-testid="pet-animation-seam-guard">{`${PET_ATTACHMENT_SEAM_GUARD}\n${SQUIRREL_FOX_IDLE_GUARD}\n${ADORNMENT_MOTION_CSS}`}</style>
      {renderCostumes && costumeLayer("front")}
      {renderCostumes && hasAboveHead && !hideAboveHeadPart && (
        <div
          aria-hidden
          data-testid="pet-animator-above-head-top"
          style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", overflow: "visible" }}
        >
          <div style={artworkCanvasStyle}>
            <AboveHeadTopLayer
              viewParts={viewParts}
              mode={mode}
              resolvedView={resolvedView}
              facing={facing}
              canFly={canFly}
              idleStyle={templateData?.idleStyle ?? null}
              bodyDelay={bodyDelay}
              headBob={headBob}
              motionElapsedSeconds={motionElapsedSeconds}
            />
          </div>
        </div>
      )}
    </div>
  );
}

