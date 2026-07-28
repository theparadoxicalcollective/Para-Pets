import { X } from "lucide-react";
import type { ClearingRewardChest } from "@shared/clearingEquipment";
import { currencyAssets } from "@/lib/currencyAssets";
import chestUrl from "@assets/hub_chest_opened.png";
import expUrl from "@assets/logo_parapets.png";

export function chestSparkleTier(rarity:number){return rarity>=5?"legendary":rarity>=4?"epic":rarity>=3?"rare":"none";}

export function ClearingChestLayer({chests,onOpen}:{chests:ClearingRewardChest[];onOpen:(chest:ClearingRewardChest)=>void}){
  return <>{chests.map(chest=>{const tier=chestSparkleTier(chest.highestEquipmentRarity);return <button key={chest.chestId} type="button" data-interactive data-testid="clearing-reward-chest" aria-label="Open treasure chest"
    onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onOpen(chest)}}
    className="group absolute flex h-14 w-14 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
    style={{left:`${chest.worldX*100}%`,top:`${chest.worldY*100}%`,transform:"translate(-50%,-72%)",zIndex:11}}>
      {tier!=="none"&&<span aria-hidden className={`clearing-chest-sparkles clearing-chest-sparkles-${tier}`}><i/><i/><i/></span>}
      <img src={chestUrl} alt="" className="h-12 w-12 object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,.8)] transition-transform group-hover:scale-105 group-active:scale-95" draggable={false}/>
  </button>})}</>;
}

const Reward=({icon,label}:{icon:string;label:string})=><div className="flex min-h-14 items-center gap-3 rounded-xl border border-amber-500/35 bg-emerald-950/65 p-2"><img src={icon} alt="" className="h-9 w-9 shrink-0 object-contain"/><b>{label}</b></div>;

export function ClearingChestModal({chest,claiming,error,onClose,onClaim}:{chest:ClearingRewardChest|null;claiming:boolean;error:string|null;onClose:()=>void;onClaim:()=>void}){
  if(!chest)return null;const r=chest.rewards;
  return <div data-interactive role="dialog" aria-modal="true" aria-labelledby="clearing-chest-title" className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-3 sm:items-center" onPointerDown={event=>event.stopPropagation()}>
    <div className="relative flex max-h-[min(82vh,620px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border-2 border-amber-400 bg-emerald-950 p-4 text-amber-50 shadow-2xl">
      <button type="button" aria-label="Close rewards" onClick={onClose} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-amber-200"><X/></button>
      <h2 id="clearing-chest-title" className="pr-11 text-center text-xl font-black text-amber-200">Chest Rewards</h2>
      <div data-testid="clearing-chest-reward-list" className="my-3 grid min-h-0 gap-2 overflow-y-auto overscroll-contain">
        {r.exp>0&&<Reward icon={expUrl} label={`${r.exp} EXP`}/>} {r.coins>0&&<Reward icon={currencyAssets.coin} label={`${r.coins} Coins`}/>} {r.essence>0&&<Reward icon={currencyAssets.essenceToken} label={`${r.essence} Essence`}/>} 
        {r.equipment.map((item,index)=><div key={`${item.shopItemId}-${index}`} className="flex min-h-16 items-center gap-3 rounded-xl border border-violet-400/50 bg-violet-950/35 p-2"><div className="h-12 w-12 shrink-0">{item.imageUrl&&<img src={item.imageUrl} alt="" className="h-full w-full object-contain"/>}</div><div className="min-w-0"><b className="block truncate">{item.name}</b><span className="text-amber-300">{"★".repeat(item.stars)}</span><span className="ml-2 capitalize text-sm">{item.slot}</span></div></div>)}
      </div>
      {error&&<p role="alert" className="mb-2 text-center text-sm text-red-300">{error}</p>}
      <button type="button" data-testid="button-clearing-collect-all" disabled={claiming} onClick={onClaim} className="min-h-12 w-full rounded-xl bg-amber-400 px-5 py-3 text-lg font-black text-emerald-950 shadow active:scale-[.98] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-white">{claiming?"Collecting…":"Collect All"}</button>
    </div>
  </div>;
}
