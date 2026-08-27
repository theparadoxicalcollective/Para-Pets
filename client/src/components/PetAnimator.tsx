import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PetAnimatorCore from "@/components/PetAnimatorCore";
import { apiRequest } from "@/lib/queryClient";
import { getCostumeCanvasPosition } from "@/lib/costumePlacement";
import { getEffectivePetLayer } from "@/lib/petPartConfig";
import { FULL_BOUNDS, getAlphaBoundsSync } from "@/lib/alphaBounds";
import { alphaAdjustedPivot } from "@/lib/petAnimationConfig";
import { getWingReplacementPartTypes, type CostumePlacement } from "@shared/costumeFeature";

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

interface TemplateData {
  parts: PetPart[];
  facing: string;
  canFly?: boolean;
  idleStyle?: string | null;
}

interface EquippedCostume {
  id: string;
  slot: number;
  copyIndex: number;
  costumeInventoryId: string;
  name: string;
  imageUrl: string | null;
  placements: CostumePlacement[];
}

interface CostumeResponse {
  equipped: EquippedCostume[];
  extraSlots: number;
}

export interface PetAnimatorProps {
  petTemplateId: string;
  mode: "idle" | "walk" | "zoom" | "house" | "static" | "sleep" | "petting";
  view?: "front" | "back";
  size?: number;
  fillContainer?: boolean;
  fitVisible?: boolean;
  expression?: "neutral" | "happy" | "petted";
  className?: string;
  style?: React.CSSProperties;
  performanceStatic?: boolean;
  /** Explicit owned-pet inventory id. Required whenever equipped costumes should render. */
  petInventoryId?: string;
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

function anchorAnimation(part: PetPart, mode: PetAnimatorProps["mode"], resolvedView: "front" | "back", idleStyle: string | null) {
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
  if (mode === "idle" && (base === "front_leg" || base === "back_leg")) return null;
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

function CostumeLayer({
  depth, costumes, viewParts, mode, resolvedView, facing, canFly, idleStyle, bodyDelay, headBob, motionElapsedSeconds,
}: {
  depth: "front" | "back";
  costumes: EquippedCostume[];
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
    const placements = costume.placements.filter(item => item.view === costumeView && item.depth === depth);
    if (!costume.imageUrl || placements.length === 0) return null;

    return <>{placements.map((placement) => {
      const anchor = sortedParts.find(part => part.partType === placement.anchorPart);
      if (!anchor || anchor.width <= 0 || anchor.height <= 0) return null;
      const position = getCostumeCanvasPosition(anchor, placement);
      if (!position) return null;

      const animName = anchorAnimation(anchor, mode, resolvedView, idleStyle);
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
            animation: animName ? buildAnimation(animName, duration, partDelay) : undefined,
            willChange: animName ? "transform" : undefined,
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <img
            src={costume.imageUrl ?? undefined}
            alt=""
            draggable={false}
            data-testid={`costume-piece-${costume.id}-${placementInstance}`}
            style={{
              position: "absolute",
              left: `${localLeft}%`,
              top: `${localTop}%`,
              width: `${localWidth}%`,
              height: `${localHeight}%`,
              objectFit: "contain",
              transform: `rotate(${placement.rotation ?? 0}deg) scaleX(${placement.flipX ? -1 : 1})`,
              transformOrigin: `${placement.pivotX}% ${placement.pivotY}%`,
              pointerEvents: "none",
            }}
          />
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
    const animName = anchorAnimation(part, mode, resolvedView, idleStyle);
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
  mode,
  view = "front",
  size = 200,
  fillContainer = false,
  fitVisible = false,
  expression = "neutral",
  className = "",
  style,
  performanceStatic = false,
  petInventoryId,
}: PetAnimatorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [measuredSize, setMeasuredSize] = useState(size);
  const motionEpochRef = useRef<{ templateId: string; startedAt: number } | null>(null);

  useLayoutEffect(() => {
    if (!(fillContainer || fitVisible)) return;
    const node = wrapperRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const next = Math.min(rect.width, rect.height);
      if (next > 0) setMeasuredSize(prev => Math.abs(prev - next) > 0.5 ? next : prev);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fillContainer, fitVisible]);

  const resolvedPetInventoryId = petInventoryId ?? null;

  const { data: templateData } = useQuery<TemplateData>({
    queryKey: ["/api/pet-template-parts", petTemplateId],
    queryFn: async () => {
      const response = await fetch(`/api/pet-template-parts/${petTemplateId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load pet template");
      return response.json();
    },
    enabled: !!petTemplateId,
    staleTime: Infinity,
  });

  const { data: costumeData } = useQuery<CostumeResponse>({
    queryKey: ["/api/pet", resolvedPetInventoryId, "costumes"],
    queryFn: async () => (await apiRequest("GET", `/api/pet/${resolvedPetInventoryId}/costumes`)).json(),
    enabled: !!resolvedPetInventoryId,
    staleTime: 0,
  });

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

  const allParts = templateData?.parts ?? [];
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
  const equipped = costumeData?.equipped ?? [];
  const hiddenWingPartTypes = useMemo(() => {
    const hidden = new Set<string>();
    const costumeView = resolvedView === "back" ? "side" : "front";
    for (const costume of equipped) {
      for (const placement of costume.placements) {
        if (placement.view !== costumeView) continue;
        for (const partType of getWingReplacementPartTypes(placement.anchorPart)) hidden.add(partType);
      }
    }
    return hidden;
  }, [costumeData?.equipped, resolvedView]);
  const renderCostumes = !!resolvedPetInventoryId && equipped.length > 0 && viewParts.length > 0;
  const hasAboveHead = viewParts.some(part => basePartType(part.partType) === "above_head");

  const costumeLayer = (depth: "front" | "back") => (
    <div
      aria-hidden
      data-testid={`pet-animator-costumes-${depth}`}
      style={{ position: "absolute", inset: 0, zIndex: depth === "front" ? 2 : 0, pointerEvents: "none", overflow: "visible" }}
    >
      <div style={{ position: "absolute", top: innerOffset, left: innerOffset, width: innerSize, height: innerSize, transform: `scale(${partScale})`, transformOrigin: "center center" }}>
        <CostumeLayer
          depth={depth}
          costumes={equipped}
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
  );

  return (
    <div
      ref={wrapperRef}
      className={className}
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
        <PetAnimatorCore
          petTemplateId={petTemplateId}
          mode={mode}
          view={view}
          size={size}
          fillContainer={fillContainer}
          fitVisible={fitVisible}
          expression={expression}
          performanceStatic={performanceStatic}
          hiddenPartTypes={hiddenWingPartTypes}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <style data-testid="pet-animation-seam-guard">{PET_ATTACHMENT_SEAM_GUARD}</style>
      {renderCostumes && costumeLayer("front")}
      {renderCostumes && hasAboveHead && (
        <div
          aria-hidden
          data-testid="pet-animator-above-head-top"
          style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", overflow: "visible" }}
        >
          <div style={{ position: "absolute", top: innerOffset, left: innerOffset, width: innerSize, height: innerSize, transform: `scale(${partScale})`, transformOrigin: "center center" }}>
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
