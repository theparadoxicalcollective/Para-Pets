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
      .pup-evolution-skin .pupevo-slot { width:clamp(52px,14vw,76px) !important; height:clamp(52px,14vw,76px) !important; pointer-events:auto !important; cursor:pointer; }
      /* Slot 1 starts at bottom-left, then progression travels clockwise. */
      .pup-evolution-skin .pupevo-slot:nth-of-type(1){left:20% !important;top:50% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(2){left:12% !important;top:31% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(3){left:34% !important;top:16% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(4){left:66% !important;top:16% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(5){left:88% !important;top:31% !important}
      .pup-evolution-skin .pupevo-slot:nth-of-type(6){left:80% !important;top:50% !important}
      .pup-evolution-skin .pupevo-slot:not(.locked)>img,
      .pup-evolution-skin .pupevo-fill img { content:var(--pup-evo-unlocked) !important; filter:drop-shadow(0 0 1px #baffd7) drop-shadow(0 0 3px rgba(75,238,157,.72)) !important; }
      .pup-evolution-skin .pupevo-slot.current>img { filter:drop-shadow(0 0 1px #d4ffe8) drop-shadow(0 0 5px rgba(83,255,176,.92)) !important; }
      .pup-evolution-skin .pupevo-slot.locked>img { content:var(--pup-evo-locked) !important; filter:drop-shadow(0 0 1px rgba(152,240,201,.72)) drop-shadow(0 0 3px rgba(54,189,130,.52)) !important; opacity:1 !important; }
      .pup-evolution-skin .pupevo-slot.locked .pupevo-lock-badge { display:none !important; }
      @media(max-width:430px){
        .pup-evolution-skin .pupevo-slot { width:54px !important; height:54px !important; }
      }
    `}</style>
    <PowerUpEvolutionPanel enabled={enabled} fallbackRarity={fallbackRarity} />
  </div>;
}
