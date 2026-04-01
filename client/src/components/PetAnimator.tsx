import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";

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
  mode: "idle" | "walk" | "zoom" | "house" | "static";
  view?: "front" | "back";
  size?: number;
  /** When true, expands the inner canvas so the visual output fills `size` exactly,
   *  compensating for the large-style 0.3× scale factor. Use in pet-house contexts. */
  fillContainer?: boolean;
  className?: string;
  style?: React.CSSProperties;
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
  front_arm: "petIdleLeftArm",
  back_arm: "petIdleRightArm",
  front_leg: "petIdleLeftLeg",
  back_leg: "petIdleRightLeg",
  front_wing: "petIdleLeftWing",
  back_wing: "petIdleRightWing",
};


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

// Parts that are hidden by default and only appear during specific animations
const ANIM_ONLY_PARTS = new Set(["eyes_closed", "mouth"]);

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
  @keyframes petIdleHead {
    0%, 100% { transform: translateY(0px); }
    25%       { transform: translateY(-3px); }
    50%       { transform: translateY(-5px); }
    75%       { transform: translateY(-3px); }
  }
  @keyframes petIdleLeftEar {
    0%, 100% { transform: rotate(0deg); }
    40% { transform: rotate(-1deg); }
    70% { transform: rotate(0.5deg); }
  }
  @keyframes petIdleRightEar {
    0%, 100% { transform: rotate(0deg); }
    40% { transform: rotate(1deg); }
    70% { transform: rotate(-0.5deg); }
  }
  @keyframes petIdleLeftArm {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(3deg); }
  }
  @keyframes petIdleRightArm {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-2deg); }
  }
  @keyframes petIdleBody {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.01, 1.02); }
  }
  @keyframes petIdleLeftWing {
    0%, 100% { transform: rotate(0deg); }
    40% { transform: rotate(-3deg); }
    70% { transform: rotate(1.5deg); }
  }
  @keyframes petIdleRightWing {
    0%, 100% { transform: rotate(0deg); }
    40% { transform: rotate(3deg); }
    70% { transform: rotate(-1.5deg); }
  }
  @keyframes petIdleLeftLeg {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(1px); }
  }
  @keyframes petIdleRightLeg {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(1px); }
  }
  @keyframes petIdleTail {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-0.5px); }
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
    25% { transform: translateY(-3px); }
    75% { transform: translateY(-3px); }
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

`;

function getPartDuration(partType: string, mode: "idle" | "walk" | "zoom" | "house" | "static"): string {
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
};

export default function PetAnimator({ petTemplateId, mode, view = "front", size = 200, fillContainer = false, className = "", style: externalStyle }: PetAnimatorProps) {
  // Stable random blink offset per instance — spreads eye animations across the
  // full 4 s blink cycle so pets don't all blink at the same time.
  const blinkOffset = useRef(`-${(Math.random() * 4).toFixed(2)}s`);

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

  const allParts = templateData?.parts || [];

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
  const innerSize = fillContainer ? size / partScale : size;
  const innerOffset = fillContainer ? -((innerSize - size) / 2) : 0;

  // Head group: these parts all move together with the head animation
  const HEAD_GROUP = new Set(["head", "left_ear", "right_ear", "eyes", "eyes_closed", "mouth", "mouth_closed"]);
  const bodyParts = viewParts.filter(p => !HEAD_GROUP.has(p.partType));
  const headGroupParts = viewParts.filter(p => HEAD_GROUP.has(p.partType));

  // Helper: render a single part image with given animation (or none)
  const renderPartImg = (part: PetPart, animName: string | null, extraOpacity?: number) => {
    const leftPct = (part.posX / CANVAS_SIZE) * 100;
    const topPct = (part.posY / CANVAS_SIZE) * 100;
    const widthPct = (part.width / CANVAS_SIZE) * 100;
    const heightPct = (part.height / CANVAS_SIZE) * 100;
    const layerZ = LAYER_ORDER[part.partType] ?? part.zIndex;
    const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
    const isEyePart = part.partType === "eyes" || part.partType === "eyes_closed";
    const delay = isEyePart ? blinkOffset.current : "0s";
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
          transformOrigin: `${part.pivotX ?? 50}% ${part.pivotY ?? 50}%`,
          animation: animName ? `${animName} ${duration} ease-in-out ${delay} infinite` : undefined,
          opacity: extraOpacity !== undefined ? extraOpacity : (isAnimOnly ? 0 : 1),
          imageRendering: "auto",
          pointerEvents: "none",
        }}
      />
    );
  };

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative", overflow: "visible", ...externalStyle }}
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
          if (mode === "static") {
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (isAnimOnly) return null;
            return renderPartImg(part, null);
          }
          if (mode === "house") {
            const animName = HOUSE_ANIMATIONS[part.partType];
            const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
            if (!animName) {
              if (isAnimOnly) return null;
              return renderPartImg(part, null);
            }
            return renderPartImg(part, animName);
          }
          const anims = mode === "idle" ? IDLE_ANIMATIONS : mode === "zoom" ? ZOOM_ANIMATIONS : WALK_ANIMATIONS;
          const animName = anims[part.partType] || anims.body;
          if (!animName) return null;
          return renderPartImg(part, animName);
        })}

        {/* Head group — wrapper carries head movement so all face parts move together */}
        {headGroupParts.length > 0 && (() => {
          const anims = mode === "idle" ? IDLE_ANIMATIONS : mode === "zoom" ? ZOOM_ANIMATIONS : WALK_ANIMATIONS;
          // Wrapper gets the head movement animation; house and static modes skip it
          const wrapperAnim = (mode !== "house" && mode !== "static") ? anims["head"] : undefined;
          const wrapperDuration = getPartDuration("head", mode);

          return (
            <div
              key="head-group"
              style={{
                position: "absolute",
                left: 0, top: 0,
                width: "100%", height: "100%",
                animation: wrapperAnim ? `${wrapperAnim} ${wrapperDuration} ease-in-out 0s infinite` : undefined,
                zIndex: 9,
                pointerEvents: "none",
              }}
            >
              {headGroupParts.map((part) => {
                const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);
                if (mode === "static") {
                  if (isAnimOnly) return null;
                  return renderPartImg(part, null);
                }
                if (mode === "house") {
                  const animName = HOUSE_ANIMATIONS[part.partType];
                  if (!animName) {
                    if (isAnimOnly) return null;
                    return renderPartImg(part, null);
                  }
                  return renderPartImg(part, animName);
                }
                // Head itself has no additional per-part animation (wrapper handles movement)
                // Face parts (eyes, mouth, ears) keep their individual opacity/rotation animations
                const isHead = part.partType === "head";
                const partAnimName = isHead ? null : (anims[part.partType] ?? null);
                return renderPartImg(part, partAnimName);
              })}
            </div>
          );
        })()}

      </div>
    </div>
  );
}
