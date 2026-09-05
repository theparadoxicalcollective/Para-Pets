import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { MiniPetAnimation, MiniPetPartType } from "@shared/miniPet";

export interface EquippedMiniPet {
  inventoryId: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  rarity: number;
  atkBoost: number;
  healthBoost: number;
  defBoost: number;
  animationStyle: MiniPetAnimation;
  parts: Array<{ id: string; partType: MiniPetPartType; imageUrl: string }>;
}

interface Props {
  petInventoryId: string;
  className?: string;
  style?: React.CSSProperties;
}

// Lower entries draw first. Wings/tail sit behind the body, ears sit behind the
// head, and eyes are always the final face layer.
const ORDER: MiniPetPartType[] = ["tail", "left_wing", "right_wing", "body", "left_ear", "right_ear", "head", "eyes"];

export default function MiniPetRenderer({ petInventoryId, className = "", style }: Props) {
  // The hidden anchor identifies the dedicated Active Pet Mini Pet host. On the
  // Active Pet page we portal the companion into display-active-pet itself so
  // its placement is relative to the pet artwork area, not the taller page/stage
  // container. Closet/admin Mini Pet renderers remain in-place.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [activePetStage, setActivePetStage] = useState<HTMLElement | null>(null);

  const { data } = useQuery<{ equipped: EquippedMiniPet | null }>({
    queryKey: ["/api/pet", petInventoryId, "mini-pet"],
    queryFn: async () => (await apiRequest("GET", `/api/pet/${petInventoryId}/mini-pet`)).json(),
    enabled: !!petInventoryId,
    // An equip/unequip happens on the Closet page and this renderer can remain
    // mounted behind it. Always treat the equipped-companion lookup as live
    // state so returning to the Active Pet page cannot reuse a stale `null`.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      setActivePetStage(null);
      return;
    }

    const activeHost = anchor.closest<HTMLElement>("[data-testid=\"active-pet-mini-pet-overlay\"]");
    if (!activeHost) {
      setActivePetStage(null);
      return;
    }

    // Anchor directly to the Active Pet artwork container. The previous parent-hop
    // approach landed in a much taller stage on some phone layouts, which pushed
    // the Mini Pet down near the bottom navigation. display-active-pet is the
    // stable, relative container that actually owns the main pet artwork.
    const stage = activeHost.closest<HTMLElement>("[data-testid=\"display-active-pet\"]");
    setActivePetStage(stage);
  }, [petInventoryId]);

  const pet = data?.equipped;
  const anchor = <span ref={anchorRef} aria-hidden style={{ display: "none" }} />;
  if (!pet) return anchor;

  const parts = [...(pet.parts ?? [])].sort((a, b) => ORDER.indexOf(a.partType) - ORDER.indexOf(b.partType));
  // Mini Pets are not required to use every supported layer. Some designs may
  // only need a head/body/eyes while others use ears, tail and wings too. As
  // soon as an admin authors at least one layered part, render the authored
  // layer set exactly as-is. The complete preview image remains the fallback
  // only for Mini Pets that have no authored parts at all.
  const useLayeredParts = parts.length > 0;

  const visual = (
    <div
      className={className}
      data-testid="equipped-mini-pet"
      data-mini-pet-render-mode={useLayeredParts ? "layers" : "preview"}
      aria-label={pet.name}
      style={{ position: "relative", width: "100%", height: "100%", pointerEvents: "none", ...style }}
    >
      <style>{MINI_PET_MOTION}</style>
      <div className={pet.animationStyle === "float" ? "mini-pet-float" : "mini-pet-breath"} style={{ position: "absolute", inset: 0, transformOrigin: "center bottom" }}>
        {useLayeredParts ? parts.map(part => (
          <img key={part.id} src={part.imageUrl} alt="" draggable={false} data-mini-pet-part={part.partType}
            className={part.partType.includes("wing") ? "mini-pet-wing" : part.partType === "tail" ? "mini-pet-tail" : part.partType.includes("ear") ? "mini-pet-ear" : ""}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", transformOrigin: "center bottom", filter: "drop-shadow(0 4px 7px rgba(0,0,0,.5))" }} />
        )) : pet.imageUrl ? (
          <img
            src={pet.imageUrl}
            alt=""
            draggable={false}
            data-mini-pet-preview
            style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 4px 7px rgba(0,0,0,.5))" }}
          />
        ) : null}
      </div>
    </div>
  );

  if (activePetStage) {
    return (
      <>
        {anchor}
        {createPortal(
          <div
            data-testid="active-pet-mini-pet-stage-layer"
            aria-hidden="true"
            style={{
              position: "absolute",
              // Sit partially over the main pet's lower-left side so the Mini Pet
              // reads as a companion. Percentages keep the relationship stable
              // across phone widths without changing the main pet placement.
              left: "9%",
              top: "58%",
              width: "25%",
              aspectRatio: "1",
              zIndex: 560,
              pointerEvents: "none",
            }}
          >
            {visual}
          </div>,
          activePetStage,
        )}
      </>
    );
  }

  return (
    <>
      {anchor}
      {visual}
    </>
  );
}

const MINI_PET_MOTION = `
@keyframes miniPetBreath { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-.7%) scale(1.006,1.012)} }
@keyframes miniPetFloat { 0%,100%{transform:translateY(1%)} 50%{transform:translateY(-3%)} }
@keyframes miniPetWing { 0%,100%{rotate:-1deg} 50%{rotate:1.5deg} }
@keyframes miniPetTail { 0%,100%{rotate:-.8deg} 50%{rotate:1deg} }
@keyframes miniPetEar { 0%,88%,100%{rotate:0deg} 94%{rotate:.8deg} }
.mini-pet-breath{animation:miniPetBreath 4.8s ease-in-out infinite}
.mini-pet-float{animation:miniPetFloat 4.4s ease-in-out infinite}
.mini-pet-wing{animation:miniPetWing 4.2s ease-in-out infinite}
.mini-pet-tail{animation:miniPetTail 5.1s ease-in-out infinite}
.mini-pet-ear{animation:miniPetEar 5.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.mini-pet-breath,.mini-pet-float,.mini-pet-wing,.mini-pet-tail,.mini-pet-ear{animation:none!important}}
`;
