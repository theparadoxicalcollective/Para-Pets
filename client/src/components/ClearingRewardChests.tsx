import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import type { ClearingChestEquipmentReward, ClearingRewardChest } from "@shared/clearingEquipment";
import { currencyAssets } from "@/lib/currencyAssets";
import { layoutClearingChests, worldYToDepth } from "@/lib/clearingWorldPresentation";
import closedChestUrl from "@assets/generated_images/icon_gift_treasure.png";
import openedChestUrl from "@assets/hub_chest_opened.png";
import expUrl from "@assets/logo_parapets.png";

export type ClearingChestPresentationState = "closed" | "opening" | "opened";
export function chestSparkleTier(rarity:number){return rarity>=5?"legendary":rarity>=4?"epic":rarity>=3?"rare":"none";}
export function chestImageForState(state: ClearingChestPresentationState){return state === "closed" ? closedChestUrl : openedChestUrl;}

export function ClearingChestLayer({chests,openingChestId,openedChestId,onOpen}:{chests:ClearingRewardChest[];openingChestId:string|null;openedChestId:string|null;onOpen:(chest:ClearingRewardChest,control:HTMLButtonElement)=>void}){
  const positioned=useMemo(()=>layoutClearingChests(chests.map(chest=>({...chest,x:chest.worldX,y:chest.worldY}))),[chests]);
  return <>{positioned.map(chest=>{const opening=openingChestId===chest.chestId,opened=openedChestId===chest.chestId,tier=chestSparkleTier(chest.highestEquipmentRarity);return <button key={chest.chestId} type="button" data-interactive data-testid="clearing-reward-chest" data-state={opening?"opening":opened?"opened":"closed"} aria-label={opening?"Opening treasure chest":"Open treasure chest"} disabled={opening}
    onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onOpen(chest,event.currentTarget)}}
    className="group absolute flex h-14 w-14 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-wait"
    style={{left:`${chest.x*100}%`,top:`${chest.y*100}%`,transform:"translate(-50%,-72%)",zIndex:worldYToDepth(chest.y)}}>
      <span aria-hidden className="clearing-chest-shadow"/>
      {tier!=="none"&&<span aria-hidden className={`clearing-chest-sparkles clearing-chest-sparkles-${tier}`}><i/><i/><i/></span>}
      <img src={chestImageForState(opening?"opening":opened?"opened":"closed")} alt="" className={`h-12 w-12 object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,.65)] transition-transform group-hover:scale-105 group-active:scale-90 ${opening?"animate-clearing-chest-open":""}`} draggable={false}/>
  </button>})}</>;
}

function RewardImage({src,alt,className}:{src:string|null;alt:string;className:string}){
  const [failed,setFailed]=useState(false);
  return failed||!src?<span role="img" aria-label={`${alt} artwork unavailable`} className={`${className} flex items-center justify-center rounded-lg bg-black/25 text-2xl`}>🎁</span>:<img src={src} alt={alt} className={`${className} object-contain`} onError={()=>setFailed(true)}/>;
}

function ItemDetails({item,onBack}:{item:ClearingChestEquipmentReward;onBack:()=>void}){
  const effects=[item.atkBonus>0&&`Attack +${item.atkBonus}`,item.defBonus>0&&`Defense +${item.defBonus}`,item.hpBonus>0&&`Health +${item.hpBonus}`].filter(Boolean);
  return <div data-testid="clearing-item-detail" className="flex min-h-0 flex-1 flex-col items-center text-center">
    <button type="button" onClick={onBack} className="mb-2 flex min-h-11 items-center gap-1 self-start rounded-lg px-2 text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-200"><ArrowLeft size={20}/> Back to rewards</button>
    <RewardImage src={item.imageUrl} alt={item.name} className="h-36 w-36 shrink-0"/>
    <h3 className="mt-2 text-xl font-black text-amber-100">{item.name}</h3>
    {item.stars>0&&<div aria-label={`${item.stars} star rarity`} className="text-lg text-amber-300">{"★".repeat(item.stars)}</div>}
    <p className="mt-1 capitalize text-emerald-100">{item.slot}</p>
    <div className="mt-3 w-full rounded-xl border border-amber-500/30 bg-black/20 p-3">
      {effects.length?effects.map(effect=><p key={String(effect)} className="font-bold text-amber-100">{effect}</p>):<p className="text-emerald-100">This item equips in the {item.slot} slot.</p>}
      <p className="mt-2 text-sm text-emerald-100">Equip this item to apply the listed bonuses in Clearing combat.</p>
    </div>
  </div>;
}

export function ClearingChestModal({chest,claiming,error,onClose,onClaim,restoreFocus}:{chest:ClearingRewardChest|null;claiming:boolean;error:string|null;onClose:()=>void;onClaim:()=>void;restoreFocus?:HTMLElement|null}){
  const [detail,setDetail]=useState<ClearingChestEquipmentReward|null>(null);const dialogRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!chest){setDetail(null);return;}const previous=document.body.style.overflow;document.body.style.overflow="hidden";requestAnimationFrame(()=>dialogRef.current?.querySelector<HTMLElement>("button")?.focus());const key=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!claiming)(detail?setDetail(null):onClose());if(event.key==="Tab"&&dialogRef.current){const focusable=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')];if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};document.addEventListener("keydown",key);return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",key);restoreFocus?.focus();};},[chest,claiming,detail,onClose,restoreFocus]);
  if(!chest)return null;const r=chest.rewards;
  const modal=<div data-interactive role="presentation" className="fixed inset-0 flex items-center justify-center bg-black/70" style={{zIndex:4000,padding:"max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))"}} onPointerDown={event=>event.stopPropagation()}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="clearing-chest-title" className="relative flex w-[min(calc(100vw-24px),28rem)] max-w-full flex-col overflow-hidden rounded-2xl border-2 border-amber-400/80 bg-emerald-950 p-4 text-amber-50 shadow-2xl" style={{maxHeight:"calc(100dvh - max(24px, env(safe-area-inset-top)) - max(24px, env(safe-area-inset-bottom)))"}}>
      <button type="button" aria-label="Close rewards" disabled={claiming} onClick={detail?()=>setDetail(null):onClose} className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-amber-200 disabled:opacity-50"><X/></button>
      <h2 id="clearing-chest-title" className="shrink-0 pr-11 text-center text-xl font-black text-amber-200">{detail?"Item Details":"Treasure Rewards"}</h2>
      {detail?<ItemDetails item={detail} onBack={()=>setDetail(null)}/>:<>
        <div data-testid="clearing-chest-reward-list" className="my-3 grid min-h-0 grid-cols-2 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-3">
          {r.exp>0&&<div className="clearing-reward-tile"><RewardImage src={expUrl} alt="Experience" className="h-14 w-14"/><b>{r.exp} EXP</b></div>}
          {r.coins>0&&<div className="clearing-reward-tile"><RewardImage src={currencyAssets.coin} alt="Coins" className="h-14 w-14"/><b>{r.coins}</b></div>}
          {r.essence>0&&<div className="clearing-reward-tile"><RewardImage src={currencyAssets.essenceToken} alt="Essence" className="h-14 w-14"/><b>{r.essence}</b></div>}
          {r.equipment.map((item,index)=><button type="button" aria-label={`Inspect ${item.name}`} key={`${item.shopItemId}-${index}`} onClick={()=>setDetail(item)} className="clearing-reward-tile relative min-h-[112px] border-violet-400/50 focus-visible:ring-2 focus-visible:ring-amber-200"><RewardImage src={item.imageUrl} alt={item.name} className="h-20 w-20"/>{item.stars>0&&<span aria-label={`${item.stars} star rarity`} className="absolute bottom-1 text-sm text-amber-300">{"★".repeat(item.stars)}</span>}</button>)}
        </div>
        {error&&<p role="alert" className="mb-2 text-center text-sm text-red-300">{error} Please try again.</p>}
        <button type="button" data-testid="button-clearing-collect-all" disabled={claiming} onClick={onClaim} className="min-h-12 w-full shrink-0 rounded-xl bg-amber-400 px-5 py-3 text-lg font-black text-emerald-950 shadow active:scale-[.98] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-white">{claiming?"Collecting…":"Collect All"}</button>
      </>}
    </div>
  </div>;
  return createPortal(modal,document.body);
}
