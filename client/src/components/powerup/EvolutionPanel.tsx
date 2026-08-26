import type { CSSProperties } from "react";
import PowerUpEvolutionPanel from "@/components/powerup/PowerUpEvolutionPanel";
import evolutionUnlocked from "@assets/ui/power-up/evolution-icon-unlocked.png";
import evolutionLocked from "@assets/ui/power-up/evolution-icon-locked.png";

interface EvolutionPanelProps {
  enabled: boolean;
  fallbackRarity: number;
  layout?: "panel" | "orbit";
}

/**
 * Power Up-only presentation wrapper. The evolution progression/feeding logic
 * remains in PowerUpEvolutionPanel; this layer applies the final PUP artwork.
 */
export default function EvolutionPanel({ enabled, fallbackRarity }: EvolutionPanelProps) {
  const style = {
    "--pup-evo-unlocked": `url("${evolutionUnlocked}")`,
    "--pup-evo-locked": `url("${evolutionLocked}")`,
  } as CSSProperties;

  return <div className="pup-evolution-skin" style={style}>
    <style>{`
      .pup-evolution-skin { position:absolute; inset:0; z-index:8; pointer-events:none; }
      .pup-evolution-skin > .pupevo-orbit { inset:0 !important; }
      .pup-evolution-skin .pupevo-slot { width:clamp(66px,18vw,96px) !important; height:clamp(66px,18vw,96px) !important; pointer-events:auto !important; cursor:pointer; }
      /* Slot 1 starts at bottom-left, then progression travels clockwise. */
      .pup-evolution-skin .pupevo-slot:nth-of-type(1){left:24% !important;top:56% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(2){left:12% !important;top:39% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(3){left:29% !important;top:18% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(4){left:71% !important;top:18% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(5){left:88% !important;top:39% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(6){left:76% !important;top:56% !important}
      .pup-evolution-skin .pupevo-slot:not(.locked)>img,
      .pup-evolution-skin .pupevo-fill img { content:var(--pup-evo-unlocked) !important; filter:drop-shadow(0 0 1px #baffd7) drop-shadow(0 0 3px rgba(75,238,157,.72)) !important; }
      .pup-evolution-skin .pupevo-slot.current>img { filter:drop-shadow(0 0 1px #d4ffe8) drop-shadow(0 0 5px rgba(83,255,176,.92)) !important; }
      .pup-evolution-skin .pupevo-slot.locked>img { content:var(--pup-evo-locked) !important; filter:drop-shadow(0 0 1px rgba(152,240,201,.72)) drop-shadow(0 0 3px rgba(54,189,130,.52)) !important; opacity:1 !important; }
      .pup-evolution-skin .pupevo-slot.locked .pupevo-lock-badge { display:none !important; }
      @media(max-width:430px){
        .pup-evolution-skin .pupevo-slot { width:70px !important; height:70px !important; }
      }
    `}</style>
    <PowerUpEvolutionPanel enabled={enabled} fallbackRarity={fallbackRarity} />
  </div>;
}
