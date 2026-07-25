import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import BattleArena, {
  type BattlePotionSlot,
  type EquippedPet,
} from "@/components/BattleArena";
import caveBanner1 from "@assets/Photoroom_20260705_51533_PM_1783290164113.png";
import caveBanner2 from "@assets/Photoroom_20260705_51608_PM_1783290164113.png";
import caveBanner3 from "@assets/Photoroom_20260705_51705_PM_1783290164113.png";
import caveBanner4 from "@assets/Photoroom_20260705_52038_PM_1783290164113.png";
import caveBanner5 from "@assets/Photoroom_20260705_52123_PM_1783290164113.png";
import caveBanner6 from "@assets/Photoroom_20260705_91052_PM_1783304106219.png";
import caveBanner7 from "@assets/Photoroom_20260705_91130_PM_1783304106219.png";
import caveBanner8 from "@assets/Photoroom_20260705_91200_PM_1783304106219.png";
import caveBanner9 from "@assets/Photoroom_20260705_91232_PM_1783304106219.png";
import caveBanner10 from "@assets/Photoroom_20260705_91357_PM_1783304106219.png";
import caveEnter1 from "@assets/Photoroom_20260705_50251_PM_1783290164113.png";
import caveEnter2 from "@assets/Photoroom_20260705_50531_PM_1783290164113.png";
import caveEnter3 from "@assets/Photoroom_20260705_50328_PM_1783290164113.png";
import caveEnter4 from "@assets/Photoroom_20260705_50615_PM_1783290164113.png";
import caveEnter5 from "@assets/Photoroom_20260705_50445_PM_1783290164113.png";

export const CAVE_TIERS = [
  { tier: 1, banner: caveBanner1, enterBtn: caveEnter1 },
  { tier: 2, banner: caveBanner2, enterBtn: caveEnter2 },
  { tier: 3, banner: caveBanner3, enterBtn: caveEnter3 },
  { tier: 4, banner: caveBanner4, enterBtn: caveEnter4 },
  { tier: 5, banner: caveBanner5, enterBtn: caveEnter5 },
  { tier: 6, banner: caveBanner6, enterBtn: caveEnter1 },
  { tier: 7, banner: caveBanner7, enterBtn: caveEnter2 },
  { tier: 8, banner: caveBanner8, enterBtn: caveEnter3 },
  { tier: 9, banner: caveBanner9, enterBtn: caveEnter4 },
  { tier: 10, banner: caveBanner10, enterBtn: caveEnter5 },
] as const;

export const CAVE_ENTER_LAYOUT = {
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  height: "85%",
  width: "auto",
  aspectRatio: "2.35 / 1",
  maxWidth: "90%",
} as const;

export function isCaveTierUnlocked(tier: number, currentTier: number, completedTiers: number[]) {
  return !completedTiers.includes(tier)
    && (tier === 1 || completedTiers.includes(tier - 1) || currentTier >= tier);
}

export interface WorldCaveOverlayProps {
  mode: "entry" | "battle";
  activePetId: string | null;
  locationId: string;
  locationName: string;
  backgroundUrl: string | null;
  accent: string;
  caveTier: number;
  potionSlots: (BattlePotionSlot | null)[];
  activePet: EquippedPet | null;
  onEnterTier: (tier: number) => void;
  onCloseEntry: () => void;
  onExitBattle: () => void;
  onBattleEnd: () => void;
  onCaveTierComplete: () => Promise<void>;
}

export default function WorldCaveOverlay(props: WorldCaveOverlayProps) {
  const { data: progress } = useQuery<{ currentTier: number; completedTiers: number[] }>({
    queryKey: ["/api/cave/progress", props.activePetId],
    enabled: props.mode === "entry" && !!props.activePetId,
  });

  if (props.mode === "battle") {
    return (
      <div className="absolute inset-0 z-50">
        <BattleArena
          locationId={props.locationId}
          locationName={props.locationName}
          bgUrl={props.backgroundUrl}
          accent={props.accent}
          battlePotionSlots={props.potionSlots}
          equippedPets={[props.activePet, null, null]}
          isCave
          caveTier={props.caveTier}
          onCaveTierComplete={props.onCaveTierComplete}
          onClose={props.onExitBattle}
          onBattleEnd={props.onBattleEnd}
        />
      </div>
    );
  }

  const completedTiers = progress?.completedTiers ?? [];
  const currentTier = progress?.currentTier ?? 1;
  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: "linear-gradient(180deg,#080810 0%,#0f0f1e 100%)" }}>
      <div className="flex items-center justify-between px-5 pt-8 pb-3 flex-shrink-0">
        <div>
          <div className="font-fantasy text-2xl text-white tracking-wide" style={{ textShadow: "0 0 24px rgba(168,85,247,0.9)" }}>⚔ Murk Cave</div>
          <div className="text-gray-400 text-xs mt-0.5">Choose a tier · 6 waves per run</div>
        </div>
        <button onClick={props.onCloseEntry} data-testid="button-cave-close" className="p-2 rounded-full bg-white/10 active:scale-90 transition-transform">
          <X className="w-5 h-5 text-gray-300" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-8 space-y-4 pt-1">
        {CAVE_TIERS.map(({ tier, banner, enterBtn }) => {
          const completed = completedTiers.includes(tier);
          const unlocked = isCaveTierUnlocked(tier, currentTier, completedTiers);
          return (
            <div key={tier} className="relative w-full rounded-xl overflow-hidden">
              <img src={banner} alt={`Tier ${tier}`} className="w-full h-auto block" style={{ filter: unlocked ? "none" : "grayscale(0.6) brightness(0.4)" }} />
              {completed && <div className="absolute top-2 right-2 flex items-center gap-1 px-3 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ background: "rgba(0,0,0,0.75)", color: "#4ade80", border: "1px solid #4ade8066" }}>✓ CLEARED</div>}
              {!unlocked && <div className="absolute inset-0 flex items-center justify-center"><span className="text-4xl drop-shadow-lg">🔒</span></div>}
              {unlocked && (
                <button data-testid={`button-cave-enter-tier-${tier}`} onClick={() => props.onEnterTier(tier)} className="absolute active:scale-95 transition-transform" style={{ ...CAVE_ENTER_LAYOUT, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  <img src={enterBtn} alt="Enter" className="block w-full h-full object-contain object-center" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
