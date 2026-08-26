import PowerUpEvolutionPanel from "@/components/powerup/PowerUpEvolutionPanel";

interface EvolutionPanelProps {
  enabled: boolean;
  fallbackRarity: number;
  layout?: "panel" | "orbit";
}

/**
 * Backward-compatible entry point for the Power Up evolution feature.
 * The actual Power Up implementation now lives in PowerUpEvolutionPanel and
 * uses only the PUP evolution artwork uploaded for that page.
 */
export default function EvolutionPanel({ enabled, fallbackRarity }: EvolutionPanelProps) {
  return <PowerUpEvolutionPanel enabled={enabled} fallbackRarity={fallbackRarity} />;
}
