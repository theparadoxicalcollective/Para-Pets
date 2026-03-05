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
}

interface PetAnimatorProps {
  petTemplateId: string;
  mode: "idle" | "walk";
  view?: "front" | "back";
  size?: number;
  className?: string;
}

const CANVAS_SIZE = 1000;

const IDLE_ANIMATIONS: Record<string, string> = {
  head: "petIdleHead",
  eyes: "petIdleEyes",
  eyes_closed: "petIdleEyesClosed",
  body: "petIdleBody",
  tail: "petIdleTail",
  wings: "petIdleWings",
  front_arms: "petIdleFrontArms",
  back_arms: "petIdleBackArms",
  front_legs: "petIdleFrontLegs",
  back_legs: "petIdleBackLegs",
  hands: "petIdleHands",
  feet: "petIdleFeet",
};

const WALK_ANIMATIONS: Record<string, string> = {
  head: "petWalkHead",
  eyes: "petWalkEyes",
  eyes_closed: "petWalkEyesClosed",
  body: "petWalkBody",
  tail: "petWalkTail",
  wings: "petWalkWings",
  front_arms: "petWalkFrontArms",
  back_arms: "petWalkBackArms",
  front_legs: "petWalkFrontLegs",
  back_legs: "petWalkBackLegs",
  hands: "petWalkHands",
  feet: "petWalkFeet",
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
  @keyframes petIdleTail {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(2deg); }
    75% { transform: rotate(-2deg); }
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
  @keyframes petIdleHands {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-2deg); }
  }
  @keyframes petIdleFeet {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(1px); }
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
  @keyframes petWalkTail {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(10deg); }
    75% { transform: rotate(-10deg); }
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
  @keyframes petWalkHands {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-8deg); }
    75% { transform: rotate(8deg); }
  }
  @keyframes petWalkFeet {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    25% { transform: translateY(-2px) rotate(5deg); }
    75% { transform: translateY(1px) rotate(-5deg); }
  }
`;

function getPartDuration(partType: string, mode: "idle" | "walk"): string {
  if (mode === "idle") {
    const durations: Record<string, string> = {
      head: "3s", eyes: "4s", eyes_closed: "4s", body: "4s", tail: "2.5s", wings: "2s",
      front_legs: "4s", back_legs: "4s", front_arms: "3.5s", back_arms: "3.5s",
      hands: "3.5s", feet: "4s",
    };
    return durations[partType] || "3s";
  }
  return "0.6s";
}

export default function PetAnimator({ petTemplateId, mode, view = "front", size = 200, className = "" }: PetAnimatorProps) {
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

  const allParts = templateData?.parts || [];
  const viewParts = allParts.filter(p => p.view === view).sort((a, b) => a.zIndex - b.zIndex);

  if (viewParts.length === 0) return null;

  const scale = size / CANVAS_SIZE;

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative", overflow: "hidden" }}
      data-testid="pet-animator"
    >
      <style>{ANIMATION_STYLES}</style>
      {viewParts.map((part) => {
        const animations = mode === "idle" ? IDLE_ANIMATIONS : WALK_ANIMATIONS;
        const animName = animations[part.partType] || animations.body;

        if (!animName) return null;

        const duration = getPartDuration(part.partType, mode);
        const originX = part.posX + part.width / 2;
        const originY = part.posY + part.height / 2;

        return (
          <img
            key={part.id}
            src={part.imageUrl}
            alt={part.partType}
            draggable={false}
            style={{
              position: "absolute",
              left: part.posX * scale,
              top: part.posY * scale,
              width: part.width * scale,
              height: part.height * scale,
              zIndex: part.zIndex,
              transformOrigin: `${(originX - part.posX) * scale}px ${(originY - part.posY) * scale}px`,
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
