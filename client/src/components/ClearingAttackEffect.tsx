import { useEffect, useState } from "react";
import { Sword, Sparkles } from "lucide-react";
import type { ClearingInventoryItem } from "@shared/clearingEquipment";
import { resolveClearingAttackStyle } from "@shared/clearingCombat";
import { worldYToDepth } from "@/lib/clearingWorldPresentation";
import { CLEARING_SWORD_TIMING, type ClearingAttackPhase, weaponAttackTransform, weaponRarityFilter } from "@/lib/clearingWeaponVisuals";

export default function ClearingAttackEffect({ weapon, phase, angleRadians, targetDistance, x, y, sizePixels, playerY, facingLeft }: {
  weapon: ClearingInventoryItem | null; phase: ClearingAttackPhase;
  angleRadians: number; targetDistance: number; x: number; y: number; sizePixels: number; playerY: number; facingLeft: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [weapon?.imageUrl]);
  useEffect(() => { if (import.meta.env.DEV && weapon) console.debug("Clearing equipped weapon reached attack renderer", { inventoryId:weapon.inventoryId, shopItemId:weapon.shopItemId, stableKey:weapon.stableKey, name:weapon.name, imageUrl:weapon.imageUrl, stars:weapon.stars, attackStyle:weapon.attackStyle, attackBonus:weapon.atkBonus }); }, [weapon]);
  const style = resolveClearingAttackStyle(weapon ? { attackStyle: weapon.attackStyle, name: weapon.name } : undefined);
  const size = `${Math.max(28, Math.min(42, sizePixels))}px`;
  const showRealWeapon = Boolean(weapon?.imageUrl) && !imageFailed;
  const depth = worldYToDepth(playerY, 3);
  const motionDuration = phase === "windup" ? CLEARING_SWORD_TIMING.windupMs : phase === "impact" ? CLEARING_SWORD_TIMING.impactMs : phase === "recovery" ? CLEARING_SWORD_TIMING.recoveryMs : 80;
  return <>
    <div data-testid="clearing-equipped-weapon-pointer" data-phase={phase} data-attack-style={style}
      className="absolute pointer-events-none overflow-visible clearing-player-weapon-foreground"
      style={{left:`${x*100}%`,top:`${y*100}%`,width:size,height:size,zIndex:depth,transform:`translate(-50%, -50%) scaleX(${facingLeft?-1:1})`}}>
      <div data-testid="clearing-equipped-weapon-motion" data-motion-style={style} className="clearing-equipped-weapon-motion relative h-full w-full" style={{transform:weaponAttackTransform(phase,style),transformOrigin:"50% 78%",transition:`transform ${motionDuration}ms cubic-bezier(.2,.72,.25,1)`,willChange:"transform"}}>
        {showRealWeapon?<img data-testid="clearing-equipped-weapon-image" src={weapon!.imageUrl!} alt="" draggable={false} className="h-full w-full object-contain" style={{filter:weaponRarityFilter(weapon?.stars??1)}} onError={()=>{if(import.meta.env.DEV)console.warn("Clearing equipped weapon image failed to load",{imageUrl:weapon?.imageUrl,shopItemId:weapon?.shopItemId});setImageFailed(true);}}/>:style==="staff_orb"?<Sparkles data-testid="clearing-staff-fallback" aria-hidden className="h-full w-full text-cyan-200" style={{filter:weaponRarityFilter(weapon?.stars??1)}}/>:<Sword data-testid="clearing-weapon-fallback" aria-hidden className="h-full w-full text-amber-100" style={{filter:weaponRarityFilter(weapon?.stars??1)}}/>}
      </div>
    </div>
    {phase!=="idle"&&<div data-testid="clearing-attack-vfx" className="absolute pointer-events-none overflow-visible" style={{left:`${x*100}%`,top:`${y*100}%`,width:size,height:size,zIndex:depth+1,transform:`translate(-50%, -50%) rotate(${angleRadians}rad)`}}>
      {style==="sword_slash"&&phase==="impact"&&<span data-testid="clearing-sword-slash" className="absolute -inset-2 rounded-[50%] border-t-[3px] border-amber-100 opacity-90" style={{filter:`drop-shadow(0 0 ${3+Math.min(5,weapon?.stars??1)}px #fbbf24)`}}/>}
      {style==="staff_orb"&&phase==="impact"&&<span data-testid="clearing-staff-orb" className="absolute top-1/2 h-3 w-3 rounded-full bg-cyan-100 shadow-[0_0_10px_4px_#67e8f9] animate-clearing-orb-target" style={{"--clearing-projectile-distance":`${Math.max(0,targetDistance)}px`} as React.CSSProperties}/>}
      {style==="default_melee"&&phase==="impact"&&!showRealWeapon&&<span data-testid="clearing-default-impact" className="absolute inset-2 rounded-full border-2 border-white/70"/>}
    </div>}
    <style>{`@keyframes clearing-orb-target{to{transform:translateX(var(--clearing-projectile-distance));opacity:0}}.animate-clearing-orb-target{animation:clearing-orb-target 240ms linear forwards}div[data-enemy-state]>.clearing-enemy-art.is-moving{transform-origin:50% 100%;animation-name:clearing-enemy-walk-drift-a;animation-duration:760ms;animation-timing-function:cubic-bezier(.42,.08,.58,.92);animation-iteration-count:infinite}div[data-enemy-state]:nth-of-type(3n+2)>.clearing-enemy-art.is-moving{animation-name:clearing-enemy-walk-drift-b;animation-duration:930ms;animation-timing-function:cubic-bezier(.36,.12,.62,.9)}div[data-enemy-state]:nth-of-type(3n)>.clearing-enemy-art.is-moving{animation-name:clearing-enemy-walk-drift-c;animation-duration:1080ms;animation-timing-function:cubic-bezier(.48,.08,.54,.94)}@keyframes clearing-enemy-walk-drift-a{0%,16%,56%,100%{transform:translateY(0) scaleX(1) scaleY(1)}28%{transform:translateY(.65px) scaleX(1.006) scaleY(.985)}40%{transform:translateY(-.3px) scaleX(.998) scaleY(1.004)}72%{transform:translateY(.4px) scaleX(1.003) scaleY(.992)}86%{transform:translateY(-.15px) scaleX(1) scaleY(1.002)}}@keyframes clearing-enemy-walk-drift-b{0%,12%,48%,100%{transform:translateY(0) scaleX(1) scaleY(1)}24%{transform:translateY(.5px) scaleX(1.004) scaleY(.989)}36%{transform:translateY(-.2px) scaleX(.998) scaleY(1.003)}65%{transform:translateY(.7px) scaleX(1.007) scaleY(.984)}82%{transform:translateY(-.25px) scaleX(.999) scaleY(1.004)}}@keyframes clearing-enemy-walk-drift-c{0%,20%,62%,100%{transform:translateY(0) scaleX(1) scaleY(1)}34%{transform:translateY(.45px) scaleX(1.003) scaleY(.991)}47%{transform:translateY(-.15px) scaleX(.999) scaleY(1.002)}76%{transform:translateY(.6px) scaleX(1.005) scaleY(.987)}91%{transform:translateY(-.2px) scaleX(1) scaleY(1.003)}}@media(prefers-reduced-motion:reduce){.animate-clearing-orb-target{animation-duration:1ms}.clearing-equipped-weapon-motion{transition:none!important}div[data-enemy-state]>.clearing-enemy-art.is-moving{animation:none!important}}`}</style>
  </>;
}
