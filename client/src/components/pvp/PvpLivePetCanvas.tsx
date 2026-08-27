import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import PetAnimatorCanvas from "@/components/PetAnimatorCanvas";

interface TemplateData {
  parts: Array<{ id: string; imageUrl: string }>;
}

interface PvpLivePetCanvasProps {
  petTemplateId: string;
  fallbackImageUrl: string | null;
  size: number;
  isPlayer: boolean;
  isHit: boolean;
  isSkillReady: boolean;
  crowded?: boolean;
}

/**
 * Live PvP sprite using the existing one-canvas-per-pet renderer.
 *
 * This deliberately does not use the DOM-part PetAnimator: a 5v5 battle can
 * otherwise promote dozens of transparent PNG parts to separate iOS GPU
 * textures. PetAnimatorCanvas composites those same template parts into one
 * small canvas per pet while preserving the normal idle breathing, ears,
 * tails, wings, hair and blink motion.
 *
 * Battle movement remains owned by PvpBattlePage's outer wrapper. This inner
 * wrapper only carries the current hit/skill presentation so the canvas's own
 * idle RAF never fights the arena's charge/lunge position RAF.
 */
function PvpLivePetCanvasInner({
  petTemplateId,
  fallbackImageUrl,
  size,
  isPlayer,
  isHit,
  isSkillReady,
  crowded = false,
}: PvpLivePetCanvasProps) {
  const { data: templateData, isError } = useQuery<TemplateData>({
    queryKey: ["/api/pet-template-parts", petTemplateId],
    queryFn: async () => {
      const response = await fetch(`/api/pet-template-parts/${petTemplateId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load PvP pet template");
      return response.json();
    },
    staleTime: Infinity,
  });

  const hasLiveParts = !!templateData?.parts?.length && !isError;
  const animation = isHit
    ? "pSquish 0.32s ease-out"
    : isSkillReady
      ? "skillGlowImg 1.2s ease-in-out infinite"
      : undefined;
  const filter = isPlayer
    ? "drop-shadow(0 0 10px rgba(74,222,128,0.5))"
    : "drop-shadow(0 0 10px rgba(239,68,68,0.45))";

  return (
    <div
      className="pointer-events-none"
      style={{
        width: size,
        height: size,
        position: "relative",
        animation,
        transformOrigin: "50% 100%",
        filter,
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {hasLiveParts ? (
        <PetAnimatorCanvas
          petTemplateId={petTemplateId}
          size={size}
          fitVisible
          fps={crowded ? 24 : 30}
        />
      ) : fallbackImageUrl ? (
        <img
          src={fallbackImageUrl}
          alt=""
          draggable={false}
          style={{ width: size, height: size, objectFit: "contain" }}
        />
      ) : null}
    </div>
  );
}

export const PvpLivePetCanvas = memo(PvpLivePetCanvasInner);

/**
 * Warm the template query + part-image browser cache during the three-second
 * PvP countdown. The canvases are tiny, capped at 15 fps, and one-per-template
 * rather than one-per-battle-slot, so the warm-up is cheap. When FIGHT begins,
 * the visible canvases can draw immediately instead of briefly appearing blank
 * while an opponent's part images load for the first time.
 */
export function PvpPetCanvasPrewarm({ templateIds }: { templateIds: string[] }) {
  const uniqueTemplateIds = Array.from(new Set(templateIds.filter(Boolean)));
  if (uniqueTemplateIds.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        width: 1,
        height: 1,
        overflow: "hidden",
        opacity: 0,
        left: -9999,
        top: -9999,
      }}
    >
      {uniqueTemplateIds.map((petTemplateId) => (
        <PetAnimatorCanvas
          key={petTemplateId}
          petTemplateId={petTemplateId}
          size={32}
          fitVisible
          fps={15}
        />
      ))}
    </div>
  );
}
