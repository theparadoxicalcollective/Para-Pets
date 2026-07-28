import { resolveClearingAttackStyle } from "@shared/clearingCombat";
import type { ClearingEquipmentSlot } from "@shared/clearingEquipment";

export const CLEARING_POWER_WEIGHTS = { helmet:{atk:.3,def:1.5,hp:.055}, boots:{atk:.5,def:1.2,hp:.045}, weapon:{atk:2,def:.35,hp:.04}, armor:{atk:.35,def:2,hp:.06}, charm:{atk:1,def:1,hp:.05} } as const;
export const CLEARING_STAT_BUDGETS = { 1:[2,18], 2:[8,32], 3:[18,52], 4:[35,80], 5:[58,120] } as const;
export function clearingEquipmentPower(item:{slot:ClearingEquipmentSlot;atkBonus:number;defBonus:number;hpBonus:number}) { const w=CLEARING_POWER_WEIGHTS[item.slot]; return Math.round(item.atkBonus*w.atk+item.defBonus*w.def+item.hpBonus*w.hp); }
export function auditClearingEquipment(items:Array<any>) {
  const names=new Map<string,number>(); for(const item of items) names.set(String(item.name).toLowerCase(),(names.get(String(item.name).toLowerCase())??0)+1);
  return items.map(item=>{const issues:string[]=[];const stars=Number(item.stars??item.starRarity);const slot=item.slot??item.clearingSlot;
    if(!item.imageUrl)issues.push("missing_image"); if(!Number.isInteger(stars)||stars<1||stars>5)issues.push("invalid_rarity");
    if(!["helmet","weapon","armor","boots","charm"].includes(slot))issues.push("missing_slot"); if([item.atkBonus,item.defBonus,item.hpBonus].some(v=>Number(v)<0))issues.push("negative_stat");
    if((names.get(String(item.name).toLowerCase())??0)>1)issues.push("duplicate_name");
    if(slot==="weapon"&&resolveClearingAttackStyle({attackStyle:item.attackStyle,name:item.name})==="basic_melee")issues.push("unresolved_attack_style");
    if(stars>=1&&stars<=5&&["helmet","weapon","armor","boots","charm"].includes(slot)){const power=clearingEquipmentPower({slot,atkBonus:Number(item.atkBonus??0),defBonus:Number(item.defBonus??0),hpBonus:Number(item.hpBonus??0)});const [min,max]=CLEARING_STAT_BUDGETS[stars as keyof typeof CLEARING_STAT_BUDGETS];if(power<min||power>max)issues.push("stat_budget_outlier");}
    return {id:item.id,name:item.name,issues};});
}
