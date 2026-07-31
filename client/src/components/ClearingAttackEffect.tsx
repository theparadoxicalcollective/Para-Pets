import { useEffect, useState } from "react";
import { Sword, Sparkles } from "lucide-react";
import type { ClearingInventoryItem } from "@shared/clearingEquipment";
import { resolveClearingAttackStyle } from "@shared/clearingCombat";
import { worldYToDepth } from "@/lib/clearingWorldPresentation";
import { weaponAttackTransform, type ClearingAttackPhase, weaponRarityFilter } from "@/lib/clearingWeaponVisuals";

export default function ClearingAttackEffect({ weapon, phase, angleRadians, targetDistance, x, y, sizePixels, playerY }: {
  weapon: ClearingInventoryItem | null; phase: ClearingAttackPhase;
  angleRadians: number; targetDistance: number; x: number; y: number; sizePixels: number; playerY: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [weapon?.imageUrl]);
  useEffect(() => { if (import.meta.env.DEV && weapon) console.debug("Clearing equipped weapon reached attack renderer", { inventoryId:weapon.inventoryId, shopItemId:weapon.shopItemId, stableKey:weapon.stableKey, name:weapon.name, imageUrl:weapon.imageUrl, stars:weapon.stars, attackStyle:weapon.attackStyle, attackBonus:weapon.atkBonus }); }, [weapon]);
  const style = resolveClearingAttackStyle(weapon ? { attackStyle: weapon.attackStyle, name: weapon.name } : undefined);
  const size = `${Math.max(28, Math.min(42, sizePixels))}px`;
  const showRealWeapon = Boolean(weapon?.imageUrl) && !imageFailed;
  return <div data-testid="clearing-equipped-weapon-pointer" data-phase={phase} data-attack-style={style}
    className="absolute pointer-events-none overflow-visible clearing-player-weapon-foreground"
    style={{ left:`${x*100}%`, top:`${y*100}%`, width:size, height:size, zIndex:worldYToDepth(playerY, 3), transform:`rotate(${angleRadians}rad)` }}>
    <div className="relative h-full w-full" style={{transform:weaponAttackTransform(phase)}}>
    {showRealWeapon ? <img data-testid="clearing-equipped-weapon-image" src={weapon!.imageUrl!} alt="" draggable={false}
      className="h-full w-full object-contain"
      style={{ filter:weaponRarityFilter(weapon?.stars ?? 1) }}
      onError={() => { if (import.meta.env.DEV) console.warn("Clearing equipped weapon image failed to load", { imageUrl:weapon?.imageUrl, shopItemId:weapon?.shopItemId }); setImageFailed(true); }}/>
      : style==="staff_orb"?<Sparkles data-testid="clearing-staff-fallback" aria-hidden className="h-full w-full text-cyan-200" style={{filter:weaponRarityFilter(weapon?.stars ?? 1)}}/>:<Sword data-testid="clearing-weapon-fallback" aria-hidden className="h-full w-full text-amber-100" style={{ filter:weaponRarityFilter(weapon?.stars ?? 1) }}/>}
    {style==="sword_slash"&&phase==="impact"&&<span data-testid="clearing-sword-slash" className="absolute -inset-2 rounded-[50%] border-t-[3px] border-amber-100 opacity-90" style={{filter:`drop-shadow(0 0 ${3+Math.min(5,weapon?.stars??1)}px #fbbf24)`}}/>}
    {style==="staff_orb"&&phase==="impact"&&<span data-testid="clearing-staff-orb" className="absolute top-1/2 h-3 w-3 rounded-full bg-cyan-100 shadow-[0_0_10px_4px_#67e8f9] animate-clearing-orb-target" style={{"--clearing-projectile-distance":`${Math.max(0,targetDistance)}px`} as React.CSSProperties}/>}
    {style==="default_melee"&&phase==="impact"&&!showRealWeapon&&<span data-testid="clearing-default-impact" className="absolute inset-2 rounded-full border-2 border-white/70"/>}
    </div><style>{`@keyframes clearing-orb-target{to{transform:translateX(var(--clearing-projectile-distance));opacity:0}}.animate-clearing-orb-target{animation:clearing-orb-target 240ms linear forwards}@media(prefers-reduced-motion:reduce){.animate-clearing-orb-target{animation-duration:1ms}}`}</style>
  </div>;
}
