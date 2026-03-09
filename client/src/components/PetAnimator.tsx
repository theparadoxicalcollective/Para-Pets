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
  head: "petIdleHead",
  left_ear: "petIdleLeftEar",
  right_ear: "petIdleRightEar",
  eyes: "petIdleEyes",
  eyes_closed: "petIdleEyesClosed",
  body: "petIdleBody",
  tail: "petIdleTail",
  wings: "petIdleWings",
  left_wing: "petIdleLeftWing",
  right_wing: "petIdleRightWing",
  front_arms: "petIdleFrontArms",
  back_arms: "petIdleBackArms",
  front_legs: "petIdleFrontLegs",
  back_legs: "petIdleBackLegs",
};

const WALK_ANIMATIONS: Record<string, string> = {
  head: "petWalkHead",
  left_ear: "petWalkLeftEar",
  right_ear: "petWalkRightEar",
  eyes: "petWalkEyes",
  eyes_closed: "petWalkEyesClosed",
  body: "petWalkBody",
  tail: "petWalkTail",
  wings: "petWalkWings",
  left_wing: "petWalkLeftWing",
  right_wing: "petWalkRightWing",
  front_arms: "petWalkFrontArms",
  back_arms: "petWalkBackArms",
  front_legs: "petWalkFrontLegs",
  back_legs: "petWalkBackLegs",
};

const ANIMATION_STYLES = `
  @keyframes petIdleHead {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-1px); }
  }
  @keyframes petIdleEyes {
    0%, 92%, 100% { opacity: 1; }
    95%, 97% { opacity: 0; }
  }
  @keyframes petIdleEyesClosed {
    0%, 92%, 100% { opacity: 0; }
    95%, 97% { opacity: 1; }
  }
  @keyframes petIdleBody {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.01, 1.02); }
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
  @keyframes petIdleTail {
    0%, 100% { transform: translateY(0px); }
    25% { transform: translateY(-3px); }
    50% { transform: translateY(0px); }
    75% { transform: translateY(-2px); }
  }
  @keyframes petIdleWings {
    0%, 100% { transform: rotateY(0deg) scaleX(1); }
    30% { transform: rotateY(8deg) scaleX(0.92); }
    60% { transform: rotateY(-5deg) scaleX(1.04); }
  }
  @keyframes petIdleFrontLegs {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(1px); }
  }
  @keyframes petIdleBackLegs {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(1px); }
  }
  @keyframes petIdleFrontArms {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(3deg); }
  }
  @keyframes petIdleBackArms {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-2deg); }
  }
  @keyframes petIdleLeftWing {
    0%, 100% { transform: rotateY(0deg) scaleX(1); }
    30% { transform: rotateY(10deg) scaleX(0.9); }
    60% { transform: rotateY(-6deg) scaleX(1.05); }
  }
  @keyframes petIdleRightWing {
    0%, 100% { transform: rotateY(0deg) scaleX(1); }
    30% { transform: rotateY(-10deg) scaleX(0.9); }
    60% { transform: rotateY(6deg) scaleX(1.05); }
  }

  @keyframes petWalkHead {
    0%, 100% { transform: translateY(0px); }
    25% { transform: translateY(-3px); }
    75% { transform: translateY(-3px); }
  }
  @keyframes petWalkEyes {
    0%, 85%, 100% { opacity: 1; }
    90%, 95% { opacity: 0; }
  }
  @keyframes petWalkEyesClosed {
    0%, 85%, 100% { opacity: 0; }
    90%, 95% { opacity: 1; }
  }
  @keyframes petWalkBody {
    0%, 100% { transform: translateY(0px); }
    25% { transform: translateY(-4px); }
    75% { transform: translateY(-4px); }
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
  @keyframes petWalkTail {
    0%, 100% { transform: translateY(0px); }
    25% { transform: translateY(-4px); }
    50% { transform: translateY(0px); }
    75% { transform: translateY(-3px); }
  }
  @keyframes petWalkWings {
    0%, 100% { transform: scaleX(1) translateY(0px); }
    25% { transform: scaleX(0.85) translateY(-6px); }
    50% { transform: scaleX(1.05) translateY(2px); }
    75% { transform: scaleX(0.9) translateY(-4px); }
  }
  @keyframes petWalkFrontLegs {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(15deg); }
    75% { transform: rotate(-15deg); }
  }
  @keyframes petWalkBackLegs {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-15deg); }
    75% { transform: rotate(15deg); }
  }
  @keyframes petWalkFrontArms {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-12deg); }
    75% { transform: rotate(12deg); }
  }
  @keyframes petWalkBackArms {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(12deg); }
    75% { transform: rotate(-12deg); }
  }
  @keyframes petWalkLeftWing {
    0%, 100% { transform: scaleX(1) translateY(0px); }
    25% { transform: scaleX(0.8) translateY(-8px); }
    50% { transform: scaleX(1.1) translateY(3px); }
    75% { transform: scaleX(0.85) translateY(-5px); }
  }
  @keyframes petWalkRightWing {
    0%, 100% { transform: scaleX(1) translateY(0px); }
    25% { transform: scaleX(0.8) translateY(-8px); }
    50% { transform: scaleX(1.1) translateY(3px); }
    75% { transform: scaleX(0.85) translateY(-5px); }
  }
`;

function getPartDuration(partType: string, mode: "idle" | "walk"): string {
  if (mode === "idle") {
    const durations: Record<string, string> = {
      head: "3s", left_ear: "3.5s", right_ear: "3.5s", eyes: "4s", eyes_closed: "4s",
      body: "4s", tail: "2.5s", wings: "2s", left_wing: "2s", right_wing: "2.2s",
      front_legs: "4s", back_legs: "4s", front_arms: "3.5s", back_arms: "3.5s",
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
    back_arms: 1,
    back_legs: 2,
    tail: 3,
    wings: 4,
    left_wing: 4,
    right_wing: 4,
    body: 5,
    front_legs: 6,
    front_arms: 7,
    left_ear: 9,
    right_ear: 9,
    head: 10,
    eyes: 11,
    eyes_closed: 11,
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
