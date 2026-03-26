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
  mode: "idle" | "walk" | "zoom";
  view?: "front" | "back";
  size?: number;
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
    50% { transform: translateY(-0.4px); }
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
    25% { transform: translateY(-1px); }
    50% { transform: translateY(0px); }
    75% { transform: translateY(-0.5px); }
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
`;

function getPartDuration(partType: string, mode: "idle" | "walk" | "zoom"): string {
  if (mode === "idle") {
    const durations: Record<string, string> = {
      eyes: "4s", eyes_closed: "4s", mouth: "5s", mouth_closed: "5s",
      head: "3s", left_ear: "3.5s", right_ear: "3.5s",
      left_arm: "3.5s", right_arm: "3.5s",
      body: "4s",
      left_wing: "3.5s", right_wing: "3.5s",
      left_leg: "4s", right_leg: "4s",
      tail: "2.5s",
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

export default function PetAnimator({ petTemplateId, mode, view = "front", size = 200, className = "", style: externalStyle }: PetAnimatorProps) {
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

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative", overflow: "visible", ...externalStyle }}
      data-testid="pet-animator"
    >
      <style>{ANIMATION_STYLES}</style>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${partScale})`, transformOrigin: "center center" }}>
      {viewParts.map((part) => {
        const leftPct = (part.posX / CANVAS_SIZE) * 100;
        const topPct = (part.posY / CANVAS_SIZE) * 100;
        const widthPct = (part.width / CANVAS_SIZE) * 100;
        const heightPct = (part.height / CANVAS_SIZE) * 100;

        const layerZ = LAYER_ORDER[part.partType] ?? part.zIndex;
        const isAnimOnly = ANIM_ONLY_PARTS.has(part.partType);

        if (part.partType === "back_full") {
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
                imageRendering: "auto",
                pointerEvents: "none",
              }}
            />
          );
        }

        const animations = mode === "idle" ? IDLE_ANIMATIONS : mode === "zoom" ? ZOOM_ANIMATIONS : WALK_ANIMATIONS;
        const animName = animations[part.partType] || animations.body;

        if (!animName) return null;

        const duration = getPartDuration(part.partType, mode);
        const isEyePart = part.partType === "eyes" || part.partType === "eyes_closed";
        const delay = isEyePart ? blinkOffset.current : "0s";

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
              animation: `${animName} ${duration} ease-in-out ${delay} infinite`,
              opacity: isAnimOnly ? 0 : 1,
              imageRendering: "auto",
              pointerEvents: "none",
            }}
          />
        );
      })}
      </div>
    </div>
  );
}
