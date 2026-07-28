import { useEffect, useState } from "react";
import { Sword } from "lucide-react";
import type { ClearingInventoryItem } from "@shared/clearingEquipment";
import { resolveClearingAttackStyle } from "@shared/clearingCombat";
import { swordTransform, type ClearingAttackPhase, weaponRarityFilter } from "@/lib/clearingWeaponVisuals";

export default function ClearingAttackEffect({ weapon, phase, facingLeft, x, y, petSize }: {
  weapon: ClearingInventoryItem | null; phase: ClearingAttackPhase; facingLeft: boolean;
  x: number; y: number; petSize: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [weapon?.imageUrl]);
  useEffect(() => { if (import.meta.env.DEV && weapon) console.debug("Clearing equipped weapon reached attack renderer", { inventoryId:weapon.inventoryId, shopItemId:weapon.shopItemId, name:weapon.name, imageUrl:weapon.imageUrl, stars:weapon.stars, attackStyle:weapon.attackStyle, attackBonus:weapon.atkBonus }); }, [weapon]);
  if (phase === "idle") return null;
  const style = resolveClearingAttackStyle(weapon ? { attackStyle: weapon.attackStyle, name: weapon.name } : undefined);
  if (import.meta.env.DEV && style !== "sword_slash") console.warn("Clearing attack renderer used safe default visual", { attackStyle: weapon?.attackStyle, shopItemId: weapon?.shopItemId });
  const size = `clamp(44px, ${Math.round(petSize * .82)}px, 92px)`;
  const facing = facingLeft ? "left" : "right";
  const showRealSword = style === "sword_slash" && Boolean(weapon?.imageUrl) && !imageFailed;
  return <div data-testid="clearing-weapon-attack" data-phase={phase} data-facing={facing} data-attack-style={style}
    className="absolute pointer-events-none overflow-visible"
    style={{ left:`${x*100}%`, top:`${y*100}%`, width:size, height:size, zIndex:12, transform:swordTransform(facing, phase) }}>
    {showRealSword ? <img data-testid="clearing-equipped-weapon-image" src={weapon!.imageUrl!} alt="" draggable={false}
      className="h-full w-full object-contain"
      style={{ filter:weaponRarityFilter(weapon?.stars ?? 1) }}
      onError={() => { if (import.meta.env.DEV) console.warn("Clearing equipped weapon image failed to load", { imageUrl:weapon?.imageUrl, shopItemId:weapon?.shopItemId }); setImageFailed(true); }}/>
      : <Sword data-testid="clearing-weapon-fallback" aria-hidden className="h-full w-full text-amber-100" style={{ filter:weaponRarityFilter(weapon?.stars ?? 1) }}/>} 
  </div>;
}
