import { useQuery } from "@tanstack/react-query";

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
  mode: "idle" | "walk";
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
  front_arms: "petIdleLeftArm",
  back_arms: "petIdleRightArm",
  front_legs: "petIdleLeftLeg",
  back_legs: "petIdleRightLeg",
  wings: "petIdleLeftWing",
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
  front_arms: "petWalkLeftArm",
  back_arms: "petWalkRightArm",
  front_legs: "petWalkLeftLeg",
  back_legs: "petWalkRightLeg",
  wings: "petWalkLeftWing",
};

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
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(0.95); }
  }
  @keyframes petIdleMouthClosed {
    0%, 100% { opacity: 1; }
  }
  @keyframes petIdleHead {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-1px); }
  }
  @keyframes petIdleLeftEar {
    0%, 100% { transform: rotate(0deg); }
    40% { transform: rotate(-2deg); }
    70% { transform: rotate(1deg); }
  }
  @keyframes petIdleRightEar {
    0%, 100% { transform: rotate(0deg); }
    40% { transform: rotate(2deg); }
    70% { transform: rotate(-1deg); }
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
    40% { transform: rotate(-5deg); }
    70% { transform: rotate(2.5deg); }
  }
  @keyframes petIdleRightWing {
    0%, 100% { transform: rotate(0deg); }
    40% { transform: rotate(5deg); }
    70% { transform: rotate(-2.5deg); }
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
    0%, 100% { transform: scaleY(1); }
    30% { transform: scaleY(0.9); }
    60% { transform: scaleY(1.05); }
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
    25% { transform: rotate(-4deg); }
    75% { transform: rotate(3deg); }
  }
  @keyframes petWalkRightEar {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(4deg); }
    75% { transform: rotate(-3deg); }
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
    25% { transform: rotate(-8deg); }
    75% { transform: rotate(6deg); }
  }
  @keyframes petWalkRightWing {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(8deg); }
    75% { transform: rotate(-6deg); }
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
`;

function getPartDuration(partType: string, mode: "idle" | "walk"): string {
  if (mode === "idle") {
    const durations: Record<string, string> = {
      eyes: "4s", eyes_closed: "4s", mouth: "5s", mouth_closed: "5s",
      head: "3s", left_ear: "3.5s", right_ear: "3.5s",
      left_arm: "3.5s", right_arm: "3.5s",
      body: "4s",
      left_wing: "3.5s", right_wing: "3.5s",
      left_leg: "4s", right_leg: "4s",
      tail: "2.5s",
      front_arms: "3.5s", back_arms: "3.5s", front_legs: "4s", back_legs: "4s", wings: "3.5s",
    };
    return durations[partType] || "3s";
  }
  return "0.6s";
}

export default function PetAnimator({ petTemplateId, mode, view = "front", size = 200, className = "", style: externalStyle }: PetAnimatorProps) {
  const { data: templateData } = useQuery<{ parts: PetPart[] }>({
    queryKey: ["/api/pet-template-parts", petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!petTemplateId,
    staleTime: 300000,
  });

  const LAYER_ORDER: Record<string, number> = {
    tail: 1,
    left_leg: 2,
    right_leg: 2,
    back_legs: 2,
    left_wing: 3,
    right_wing: 3,
    wings: 3,
    body: 4,
    left_arm: 5,
    right_arm: 5,
    front_arms: 5,
    back_arms: 5,
    front_legs: 2,
    left_ear: 6,
    right_ear: 6,
    head: 7,
    mouth: 8,
    mouth_closed: 8,
    eyes: 9,
    eyes_closed: 9,
  };

  const allParts = templateData?.parts || [];
  const viewParts = allParts.filter(p => p.view === view).sort((a, b) => {
    const aLayer = LAYER_ORDER[a.partType] ?? a.zIndex;
    const bLayer = LAYER_ORDER[b.partType] ?? b.zIndex;
    return aLayer - bLayer;
  });

  if (viewParts.length === 0) return null;

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative", overflow: "visible", ...externalStyle }}
      data-testid="pet-animator"
    >
      <style>{ANIMATION_STYLES}</style>
      {viewParts.map((part) => {
        const leftPct = (part.posX / CANVAS_SIZE) * 100;
        const topPct = (part.posY / CANVAS_SIZE) * 100;
        const widthPct = (part.width / CANVAS_SIZE) * 100;
        const heightPct = (part.height / CANVAS_SIZE) * 100;

        const layerZ = LAYER_ORDER[part.partType] ?? part.zIndex;

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

        const animations = mode === "idle" ? IDLE_ANIMATIONS : WALK_ANIMATIONS;
        const animName = animations[part.partType] || animations.body;

        if (!animName) return null;

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
              animation: `${animName} ${duration} ease-in-out infinite`,
              imageRendering: "auto",
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
}
