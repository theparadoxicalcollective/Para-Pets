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

const CANVAS_SIZE = 500;

const IDLE_ANIMATIONS: Record<string, string> = {
  head: "petIdleHead",
  body: "petIdleBody",
  tail: "petIdleTail",
  wings: "petIdleWings",
  legs: "petIdleLegs",
  feet: "petIdleFeet",
  arms: "petIdleArms",
  hands: "petIdleHands",
};

const WALK_ANIMATIONS: Record<string, string> = {
  head: "petWalkHead",
  body: "petWalkBody",
  tail: "petWalkTail",
  wings: "petWalkWings",
  legs: "petWalkLegsLeft",
  feet: "petWalkFeetLeft",
  arms: "petWalkArmsLeft",
  hands: "petWalkHands",
};

const WALK_ANIMATIONS_ALT: Record<string, string> = {
  legs: "petWalkLegsRight",
  feet: "petWalkFeetRight",
  arms: "petWalkArmsRight",
};

const ANIMATION_STYLES = `
  @keyframes petIdleHead {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-4px); }
  }
  @keyframes petIdleBody {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.015, 1.025); }
  }
  @keyframes petIdleTail {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(6deg); }
    75% { transform: rotate(-6deg); }
  }
  @keyframes petIdleWings {
    0%, 100% { transform: rotateY(0deg) scaleX(1); }
    30% { transform: rotateY(8deg) scaleX(0.92); }
    60% { transform: rotateY(-5deg) scaleX(1.04); }
  }
  @keyframes petIdleLegs {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(1px); }
  }
  @keyframes petIdleFeet {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(1px); }
  }
  @keyframes petIdleArms {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(3deg); }
  }
  @keyframes petIdleHands {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-2deg); }
  }

  @keyframes petWalkHead {
    0%, 100% { transform: translateY(0px); }
    25% { transform: translateY(-3px); }
    75% { transform: translateY(-3px); }
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
  @keyframes petWalkLegsLeft {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(15deg); }
    75% { transform: rotate(-15deg); }
  }
  @keyframes petWalkLegsRight {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-15deg); }
    75% { transform: rotate(15deg); }
  }
  @keyframes petWalkFeetLeft {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    25% { transform: translateY(-3px) rotate(8deg); }
    75% { transform: translateY(1px) rotate(-8deg); }
  }
  @keyframes petWalkFeetRight {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    25% { transform: translateY(1px) rotate(-8deg); }
    75% { transform: translateY(-3px) rotate(8deg); }
  }
  @keyframes petWalkArmsLeft {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-12deg); }
    75% { transform: rotate(12deg); }
  }
  @keyframes petWalkArmsRight {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(12deg); }
    75% { transform: rotate(-12deg); }
  }
  @keyframes petWalkHands {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-8deg); }
    75% { transform: rotate(8deg); }
  }
`;

function getPartDuration(partType: string, mode: "idle" | "walk"): string {
  if (mode === "idle") {
    const durations: Record<string, string> = {
      head: "3s", body: "4s", tail: "2.5s", wings: "2s",
      legs: "4s", feet: "4s", arms: "3.5s", hands: "3.5s",
    };
    return durations[partType] || "3s";
  }
  return "0.6s";
}

let partCounter = 0;

function isAlternate(partType: string): boolean {
  return ["legs", "feet", "arms"].includes(partType);
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

  const partsByType: Record<string, PetPart[]> = {};
  for (const p of viewParts) {
    if (!partsByType[p.partType]) partsByType[p.partType] = [];
    partsByType[p.partType].push(p);
  }

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative", overflow: "hidden" }}
      data-testid="pet-animator"
    >
      <style>{ANIMATION_STYLES}</style>
      {viewParts.map((part) => {
        const animations = mode === "idle" ? IDLE_ANIMATIONS : WALK_ANIMATIONS;
        let animName = animations[part.partType] || animations.body;

        if (mode === "walk" && isAlternate(part.partType)) {
          const sameParts = partsByType[part.partType] || [part];
          const idx = sameParts.indexOf(part);
          if (idx % 2 === 1 && WALK_ANIMATIONS_ALT[part.partType]) {
            animName = WALK_ANIMATIONS_ALT[part.partType];
          }
        }

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
