import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ClearingRewardChest } from "@shared/clearingEquipment";
import { currencyAssets } from "@/lib/currencyAssets";
import { queryClient } from "@/lib/queryClient";
import { worldYToDepth } from "@/lib/clearingWorldPresentation";
import closedChestUrl from "@assets/generated_images/icon_gift_treasure.png";
import openedChestUrl from "@assets/hub_chest_opened.png";

export type ClearingChestPresentationState = "closed" | "opening" | "opened";
export function chestSparkleTier(rarity:number){return rarity>=5?"legendary":rarity>=4?"epic":rarity>=3?"rare":"none";}
export function chestImageForState(state: ClearingChestPresentationState){return state === "closed" ? closedChestUrl : openedChestUrl;}

function RewardImage({src,alt}:{src:string|null;alt:string}){
  const [failed,setFailed]=useState(false);
  return failed||!src?<span role="img" aria-label={`${alt} artwork unavailable`} className="flex h-9 w-9 items-center justify-center text-xl">🎁</span>:<img src={src} alt={alt} className="h-9 w-9 object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,.8)]" onError={()=>setFailed(true)}/>;
}

function ChestRewardArc({chest,error,onRetry,onCollect}:{chest:ClearingRewardChest;error:string|null;onRetry:()=>void;onCollect:()=>void}){
  const rewards=[
    ...(chest.rewards.coins>0?[{key:"coins",name:"Coins",imageUrl:currencyAssets.coin,stars:0}]:[]),
    ...(chest.rewards.essence>0?[{key:"essence",name:"Essence",imageUrl:currencyAssets.essenceToken,stars:0}]:[]),
    ...chest.rewards.items.map((item,index)=>({key:`${item.shopItemId}-${index}`,name:item.name,imageUrl:item.imageUrl,stars:item.starRarity})),
  ];
  const spread=Math.min(140,58+Math.max(0,rewards.length-1)*23);
  return <span data-testid="clearing-chest-reward-arc" className="pointer-events-none absolute left-1/2 top-1/2">
    {rewards.map((reward,index)=>{const angle=rewards.length===1?90:90-spread/2+(spread*index)/(rewards.length-1),radians=angle*Math.PI/180,radius=68+(index%2)*4;return <button type="button" data-interactive aria-label={`Collect ${reward.name}`} onClick={event=>{event.stopPropagation();onCollect()}} key={reward.key} className="clearing-chest-drop pointer-events-auto absolute flex w-14 flex-col items-center text-center" style={{"--drop-x":`${Math.cos(radians)*radius}px`,"--drop-y":`${-Math.sin(radians)*radius}px`,"--drop-delay":`${index*70}ms`} as CSSProperties}>
      <RewardImage src={reward.imageUrl} alt={reward.name}/>
      {reward.stars>0&&<span aria-label={`${reward.stars} star rarity`} className="mt-1 text-[11px] leading-none text-amber-300 drop-shadow-[0_1px_2px_#000]">{"★".repeat(reward.stars)}</span>}
    </button>})}
    {error&&<button type="button" data-interactive data-testid="button-clearing-chest-retry" className="pointer-events-auto absolute left-1/2 top-8 w-40 -translate-x-1/2 rounded-lg border border-red-200/70 bg-emerald-950/95 px-2 py-1 text-[10px] font-bold text-red-100 shadow-xl" onClick={event=>{event.stopPropagation();onRetry()}}>{error} · Tap to retry</button>}
  </span>;
}

type ClearingChestLayerProps={
  chests:ClearingRewardChest[];
  openingChestId:string|null;
  openedChestId:string|null;
  claimError:string|null;
  onOpen:(chest:ClearingRewardChest,control:HTMLButtonElement)=>void;
  onRetry:(chest:ClearingRewardChest)=>void;
  onCollect:(chest:ClearingRewardChest)=>void;
};

export function ClearingChestLayer({chests,openingChestId,openedChestId,claimError}:ClearingChestLayerProps){
  const [localStates,setLocalStates]=useState<Record<string,ClearingChestPresentationState>>({});
  const [localErrors,setLocalErrors]=useState<Record<string,string|null>>({});
  const [hiddenChestIds,setHiddenChestIds]=useState<Set<string>>(()=>new Set());
  const inFlightChestIds=useRef<Set<string>>(new Set());
  const claimedChestIds=useRef<Set<string>>(new Set());
  const timers=useRef<Map<string,ReturnType<typeof setTimeout>>>(new Map());

  useEffect(()=>()=>{for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();},[]);

  const setChestState=(chestId:string,state:ClearingChestPresentationState)=>setLocalStates(current=>({...current,[chestId]:state}));
  const dismissChest=(chestId:string)=>setHiddenChestIds(current=>{const next=new Set(current);next.add(chestId);return next;});
  const schedule=(key:string,callback:()=>void,delay:number)=>{const previous=timers.current.get(key);if(previous)clearTimeout(previous);const timer=setTimeout(()=>{timers.current.delete(key);callback();},delay);timers.current.set(key,timer);};

  const claimChest=async(chest:ClearingRewardChest)=>{
    const chestId=chest.chestId;
    if(inFlightChestIds.current.has(chestId)||claimedChestIds.current.has(chestId)||hiddenChestIds.has(chestId))return;
    inFlightChestIds.current.add(chestId);
    setLocalErrors(current=>({...current,[chestId]:null}));
    setChestState(chestId,"opening");
    schedule(`opening:${chestId}`,()=>setChestState(chestId,"opened"),180);
    try{
      const response=await fetch(`/api/explore/elysian-clearing/chests/${chestId}/claim`,{method:"POST",credentials:"include"});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.message||"Unable to collect rewards");
      claimedChestIds.current.add(chestId);
      setChestState(chestId,"opened");
      await Promise.all([
        queryClient.invalidateQueries({queryKey:["/api/inventory"]}),
        queryClient.invalidateQueries({queryKey:["/api/clearing/inventory"]}),
        queryClient.invalidateQueries({queryKey:["/api/clearing/loadout"]}),
        queryClient.invalidateQueries({queryKey:["/api/auth/me"]}),
      ]);
      schedule(`dismiss:${chestId}`,()=>dismissChest(chestId),3200);
    }catch(error){
      const openingTimer=timers.current.get(`opening:${chestId}`);if(openingTimer)clearTimeout(openingTimer);timers.current.delete(`opening:${chestId}`);
      setChestState(chestId,"closed");
      setLocalErrors(current=>({...current,[chestId]:error instanceof Error?error.message:"Unable to collect rewards"}));
    }finally{
      inFlightChestIds.current.delete(chestId);
    }
  };

  return <>{chests.filter(chest=>!hiddenChestIds.has(chest.chestId)).map(chest=>{const localState=localStates[chest.chestId],opening=localState==="opening"||(!localState&&openingChestId===chest.chestId),opened=localState==="opened"||(!localState&&openedChestId===chest.chestId),state:ClearingChestPresentationState=opening?"opening":opened?"opened":"closed",error=localErrors[chest.chestId]??(opened?claimError:null),tier=chestSparkleTier(chest.highestEquipmentRarity);return <div key={chest.chestId} className="absolute h-11 w-11" style={{left:`${chest.worldX*100}%`,top:`${chest.worldY*100}%`,transform:"translate(-50%,-50%)",zIndex:worldYToDepth(chest.worldY)}}>
    {opened&&<ChestRewardArc chest={chest} error={error} onRetry={()=>void claimChest(chest)} onCollect={()=>dismissChest(chest.chestId)}/>}
    <button type="button" data-interactive data-testid="clearing-reward-chest" data-state={state} aria-label={opening?"Opening treasure chest":opened?"Collect opened treasure chest":"Open and collect treasure chest"} disabled={opening}
    onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();if(opened&&claimedChestIds.current.has(chest.chestId))dismissChest(chest.chestId);else void claimChest(chest)}}
    className="group absolute flex h-11 w-11 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-default"
    >
      <span aria-hidden className="clearing-chest-shadow"/>
      {tier!=="none"&&<span aria-hidden className={`clearing-chest-sparkles clearing-chest-sparkles-${tier}`}><i/><i/><i/></span>}
      <img src={chestImageForState(state)} alt="" className={`relative h-9 w-9 object-contain [filter:drop-shadow(0_4px_4px_rgba(0,0,0,.88))_drop-shadow(0_0_4px_rgba(251,191,36,.72))] transition-transform group-hover:scale-105 group-active:scale-90 ${opening?"animate-clearing-chest-open":""}`} draggable={false}/>
    </button>
  </div>})}</>;
}
