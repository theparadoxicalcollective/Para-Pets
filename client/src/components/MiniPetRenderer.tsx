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
// head, and the open/closed eye frames are the final face layers.
const ORDER: MiniPetPartType[] = ["tail", "left_wing", "right_wing", "body", "left_ear", "right_ear", "head", "eyes", "closed_eyes", "head_accessory"];

function motionClassForPart(partType: MiniPetPartType, hasBlinkPair: boolean): string {
  switch (partType) {
    case "left_wing": return "mini-pet-wing mini-pet-wing-left";
    case "right_wing": return "mini-pet-wing mini-pet-wing-right";
    case "left_ear": return "mini-pet-ear mini-pet-ear-left";
    case "right_ear": return "mini-pet-ear mini-pet-ear-right";
    case "tail": return "mini-pet-tail";
    case "eyes": return hasBlinkPair ? "mini-pet-eyes mini-pet-eyes-open" : "mini-pet-eyes mini-pet-eyes-fallback";
    case "closed_eyes": return "mini-pet-eyes mini-pet-eyes-closed";
    case "head_accessory": return "mini-pet-head-accessory";
    default: return "";
  }
}

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
  const hasBlinkPair = parts.some(part => part.partType === "eyes")
    && parts.some(part => part.partType === "closed_eyes");
  // Closed Eyes is optional. It only renders when an open Eyes layer exists too;
  // otherwise the existing eyes-only blink remains the safe fallback.
  const renderParts = parts.filter(part => part.partType !== "closed_eyes" || hasBlinkPair);
  // Mini Pets are not required to use every supported layer. Some designs may
  // only need a head/body/eyes while others use ears, tail and wings too. As
  // soon as an admin authors at least one usable layered part, render the
  // authored layer set. The complete preview image remains the fallback only
  // when there are no usable authored parts.
  const useLayeredParts = renderParts.length > 0;

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
        {useLayeredParts ? renderParts.map(part => (
          <img
            key={part.id}
            src={part.imageUrl}
            alt=""
            draggable={false}
            data-mini-pet-part={part.partType}
            className={motionClassForPart(part.partType, hasBlinkPair)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transformOrigin: "center center",
              filter: "drop-shadow(0 4px 7px rgba(0,0,0,.5))",
            }}
          />
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
              // reads as a companion. Keep the proven anchor from the placement
              // fix and only increase the companion slightly.
              left: "9%",
              top: "58%",
              width: "28%",
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
/* The Active Pet companion is intentionally above the pet artwork. Hide that
   portaled layer whenever the pet action ring or Closet is open so it can never
   bleed over full-screen menus/drawers. The Mini Pet rendered inside the Closet
   itself is not targeted by this selector. */
body:has([data-testid="backdrop-action-menu"]) [data-testid="active-pet-mini-pet-stage-layer"],
body:has([data-testid="button-close-equip-accessories"]) [data-testid="active-pet-mini-pet-stage-layer"]{
  display:none!important;
}

@keyframes miniPetBreath {
  0%,100%{transform:translateY(0) scale(1)}
  50%{transform:translateY(-.7%) scale(1.006,1.012)}
}
@keyframes miniPetFloat {
  0%,100%{transform:translateY(4%)}
  50%{transform:translateY(-9%)}
}
@keyframes miniPetWingLeft {
  0%,100%{transform:rotate(-1.2deg)}
  50%{transform:rotate(2.4deg)}
}
@keyframes miniPetWingRight {
  0%,100%{transform:rotate(1.2deg)}
  50%{transform:rotate(-2.4deg)}
}
@keyframes miniPetTail {
  0%,100%{transform:rotate(-.8deg)}
  50%{transform:rotate(1deg)}
}
@keyframes miniPetEarLeft {
  0%,88%,100%{transform:rotate(0deg)}
  94%{transform:rotate(1deg)}
}
@keyframes miniPetEarRight {
  0%,88%,100%{transform:rotate(0deg)}
  94%{transform:rotate(-1deg)}
}
@keyframes miniPetBlinkFallback {
  0%,44%,48%,100%{opacity:1}
  45%,47%{opacity:.04}
}
@keyframes miniPetBlinkOpen {
  0%,44%,48%,100%{opacity:1}
  45%,47%{opacity:0}
}
@keyframes miniPetBlinkClosed {
  0%,44%,48%,100%{opacity:0}
  45%,47%{opacity:1}
}
@keyframes miniPetHeadAccessoryBob {
  0%,100%{transform:translateY(.35%)}
  50%{transform:translateY(-1.65%)}
}

.mini-pet-breath{animation:miniPetBreath 4.8s ease-in-out infinite}
/* A larger vertical travel, different duration, and negative phase offset keep
   floating Mini Pets visibly independent from the active pet's idle motion. */
.mini-pet-float{animation:miniPetFloat 5.2s ease-in-out infinite -1.35s}
.mini-pet-wing-left{animation:miniPetWingLeft 4.2s ease-in-out infinite}
.mini-pet-wing-right{animation:miniPetWingRight 4.2s ease-in-out infinite}
.mini-pet-tail{animation:miniPetTail 5.1s ease-in-out infinite}
.mini-pet-ear-left{animation:miniPetEarLeft 5.6s ease-in-out infinite}
.mini-pet-ear-right{animation:miniPetEarRight 5.6s ease-in-out infinite}
.mini-pet-eyes-fallback{opacity:1;animation:miniPetBlinkFallback 5.4s steps(1,end) infinite}
.mini-pet-eyes-open{opacity:1;animation:miniPetBlinkOpen 5.4s steps(1,end) infinite}
.mini-pet-eyes-closed{opacity:0;animation:miniPetBlinkClosed 5.4s steps(1,end) infinite}
/* Deliberately uses a different duration and phase from both the 4.8s breath
   and 5.2s float cycles, giving hats/accessories a gentle independent settle. */
.mini-pet-head-accessory{animation:miniPetHeadAccessoryBob 4.35s ease-in-out infinite -.72s;will-change:transform}
.mini-pet-wing{transform-origin:50% 55%!important;will-change:transform}
.mini-pet-ear{transform-origin:50% 45%!important;will-change:transform}
.mini-pet-tail{transform-origin:50% 62%!important;will-change:transform}
.mini-pet-eyes{will-change:opacity}

@media (prefers-reduced-motion: reduce){
  .mini-pet-breath,.mini-pet-float,.mini-pet-wing-left,.mini-pet-wing-right,.mini-pet-tail,.mini-pet-ear-left,.mini-pet-ear-right,.mini-pet-eyes,.mini-pet-head-accessory{animation:none!important}
}
`;
