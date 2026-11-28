import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sceneIdleAnimation, type SceneMiniPet, type MiniPetAnimation, type MiniPetPartType } from "@shared/miniPet";

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
  access?: "owner" | "public";
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// Lower entries draw first. Wings/tail sit behind the body, ears sit behind the
// head, and the open/closed eye frames are the final face layers.
const ORDER: MiniPetPartType[] = ["tail", "left_wing", "right_wing", "body", "left_ear", "right_ear", "head", "eyes", "closed_eyes", "head_accessory"];

function motionClassForPart(partType: MiniPetPartType, hasBlinkPair: boolean, animated: boolean): string {
  if (!animated) return "";
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

export default function MiniPetRenderer({ petInventoryId, access = "owner", animated = true, className = "", style }: Props) {
  // The hidden anchor identifies the dedicated Active Pet Mini Pet host. On the
  // Active Pet page we portal the companion into display-active-pet itself so
  // its placement is relative to the pet artwork area, not the taller page/stage
  // container. Closet/admin Mini Pet renderers remain in-place.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [activePetStage, setActivePetStage] = useState<HTMLElement | null>(null);

  const { data } = useQuery<{ equipped: EquippedMiniPet | null }>({
    queryKey: ["/api/pet", petInventoryId, "mini-pet", access],
    queryFn: async () => (await apiRequest("GET", `/api/pet/${petInventoryId}/mini-pet${access === "public" ? "/public" : ""}`)).json(),
    enabled: !!petInventoryId,
    // An equip/unequip happens on the Closet page and this renderer can remain
    // mounted behind it. Always treat the equipped-companion lookup as live
    // state so returning to the Active Pet page cannot reuse a stale `null`.
    staleTime: animated ? 0 : 60_000,
    refetchOnMount: animated ? "always" : true,
    refetchOnWindowFocus: animated,
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

  const visual = <MiniPetArtwork pet={pet} animated={animated} className={className} style={style} />;

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
              // fix and place the slightly larger companion four percentage points lower.
              left: "9%",
              top: "62%",
              width: "31%",
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

/** Shared layer ordering and blink artwork for equipped and scenery Mini Pets. */
export function MiniPetArtwork({ pet, animated = true, className = "", style, scene = false, idleAnimation, placementId = "" }: {
  pet: SceneMiniPet; animated?: boolean; className?: string; style?: React.CSSProperties;
  scene?: boolean; idleAnimation?: MiniPetAnimation | null; placementId?: string;
}) {
  // Stable phase variation without timers or per-frame React state.
  const phase = `-${[...placementId].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 100, 0) / 10}s`;
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

  const ArtworkContainer = scene ? "span" : "div";
  return (
    <ArtworkContainer
      className={className}
      data-testid={scene ? "scene-mini-pet" : "equipped-mini-pet"}
      data-mini-pet-render-mode={useLayeredParts ? "layers" : "preview"}
      data-mini-pet-motion={animated ? "animated" : "static"}
      aria-label={pet.name}
      style={{ display: scene ? "block" : undefined, position: "relative", width: "100%", height: "100%", pointerEvents: "none", ...style }}
    >
      {!scene && <style>{MINI_PET_MOTION}</style>}
      <ArtworkContainer className={animated ? (scene ? (sceneIdleAnimation(idleAnimation, pet.animationStyle) === "float" ? "scene-mini-pet-float" : "scene-mini-pet-bounce") : (pet.animationStyle === "float" ? "mini-pet-float" : "mini-pet-breath")) : ""} style={{ position: "absolute", inset: 0, transformOrigin: "center bottom", animationDelay: scene && animated ? phase : undefined }}>
        {useLayeredParts ? renderParts.map(part => (
          <img
            key={part.id}
            src={part.imageUrl}
            alt=""
            draggable={false}
            data-mini-pet-part={part.partType}
            className={motionClassForPart(part.partType, hasBlinkPair, animated && (!scene || part.partType === "eyes" || part.partType === "closed_eyes"))}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transformOrigin: "center center",
              filter: scene ? undefined : "drop-shadow(0 4px 7px rgba(0,0,0,.5))",
              animationDelay: scene && animated ? phase : undefined,
              opacity: !animated && part.partType === "closed_eyes" ? 0 : undefined,
            }}
          />
        )) : pet.imageUrl ? (
          <img
            src={pet.imageUrl}
            alt=""
            draggable={false}
            data-mini-pet-preview
            style={{ width: "100%", height: "100%", objectFit: "contain", filter: scene ? undefined : "drop-shadow(0 4px 7px rgba(0,0,0,.5))" }}
          />
        ) : null}
      </ArtworkContainer>
    </ArtworkContainer>
  );
}

export function SceneCharacterMotionStyles() {
  return <style>{MINI_PET_MOTION + SCENE_CHARACTER_MOTION}</style>;
}
export function sceneNpcIdleClass(animation: unknown, animated = true): string {
  return !animated ? "" : sceneIdleAnimation(animation) === "float" ? "scene-npc-float" : "scene-npc-breath";
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

const SCENE_CHARACTER_MOTION = `
/* Move only the visual inside its unchanged placement/quest target. The
   intentional short loop stays within ~12% of the artwork width, with pauses. */
@keyframes sceneMiniPetBounce {
  0%, 12%, 100% { transform: translate(0,0) scale(1); }
  20% { transform: translate(4%,1%) scale(1.035,.96); }
  29% { transform: translate(10%,-5%) scale(.99,1.025); }
  40%, 53% { transform: translate(12%,0) scale(1); }
  62% { transform: translate(6%,1%) scale(1.035,.96); }
  72% { transform: translate(-5%,-4%) scale(.99,1.025); }
  83%, 90% { transform: translate(-10%,0) scale(1); }
}
@keyframes sceneMiniPetFloat {
  0%, 100% { transform: translate(0,0) scale(1); }
  23% { transform: translate(11%,-7%) scale(.99,1.02); }
  47% { transform: translate(6%,-1%) scale(1.015,.99); }
  73% { transform: translate(-11%,-6%) scale(.99,1.02); }
}
@keyframes sceneNpcBreath {
  0%,100% { transform:scale(1); }
  50% { transform:scale(1.009,1.018); }
}
@keyframes sceneNpcFloat {
  0%,100% { transform:translateY(0); }
  50% { transform:translateY(-5%); }
}
.scene-mini-pet-bounce { animation:sceneMiniPetBounce 13s ease-in-out infinite; }
.scene-mini-pet-float { animation:sceneMiniPetFloat 14s ease-in-out infinite; }
.scene-npc-breath { animation:sceneNpcBreath 4.8s ease-in-out infinite; transform-origin:center bottom; }
.scene-npc-float { animation:sceneNpcFloat 5.8s ease-in-out infinite; transform-origin:center bottom; }

@media (prefers-reduced-motion: reduce){
  .scene-mini-pet-bounce,.scene-mini-pet-float,.scene-npc-breath,.scene-npc-float{animation:none!important}
}
`;
