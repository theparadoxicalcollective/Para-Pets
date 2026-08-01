import { useCallback, useEffect, useRef, useState } from "react";
import { CLEARING_SHOP_LIMITS, DEFAULT_CLEARING_SHOP, type ClearingShopConfig } from "@shared/clearingShop";

export type ClearingPortalDraft={x:number;y:number;enabled:boolean};
export const clampClearingPortalDraft=(draft:ClearingPortalDraft):ClearingPortalDraft=>({
  x:Math.max(CLEARING_SHOP_LIMITS.xMin,Math.min(CLEARING_SHOP_LIMITS.xMax,draft.x)),
  y:Math.max(CLEARING_SHOP_LIMITS.yMin,Math.min(CLEARING_SHOP_LIMITS.yMax,draft.y)),
  enabled:draft.enabled,
});
export function clearingPortalPoint(clientX:number,clientY:number,worldRect:Pick<DOMRect,"left"|"top"|"width"|"height">,enabled:boolean){
  return clampClearingPortalDraft({x:(clientX-worldRect.left)/worldRect.width,y:(clientY-worldRect.top)/worldRect.height,enabled});
}
export const clearingPortalConfigDraft=(shop?:ClearingShopConfig|null):ClearingPortalDraft=>({x:shop?.portalX??DEFAULT_CLEARING_SHOP.portalX,y:shop?.portalY??DEFAULT_CLEARING_SHOP.portalY,enabled:shop?.enabled??DEFAULT_CLEARING_SHOP.enabled});

export function useClearingPortalEditor(shop:ClearingShopConfig|undefined,onSaved:()=>Promise<unknown>|unknown,onClosed:()=>void){
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState<ClearingPortalDraft|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
  const cleanupRef=useRef<()=>void>(()=>{}),draggedRef=useRef(false);
  const saved=clearingPortalConfigDraft(shop),current=draft??saved;
  const dirty=Boolean(draft)&&(draft!.x!==saved.x||draft!.y!==saved.y||draft!.enabled!==saved.enabled);
  const begin=useCallback(()=>{cleanupRef.current();setDraft(clearingPortalConfigDraft(shop));setError(null);setEditing(true);},[shop]);
  const close=useCallback(()=>{cleanupRef.current();setDraft(null);setError(null);setEditing(false);onClosed();},[onClosed]);
  const cancel=useCallback(()=>close(),[close]);
  const place=useCallback((clientX:number,clientY:number,element:HTMLElement)=>setDraft(value=>clearingPortalPoint(clientX,clientY,element.getBoundingClientRect(),value?.enabled??current.enabled)),[current.enabled]);
  const drag=useCallback((event:React.PointerEvent<HTMLElement>)=>{
    if(!editing)return;event.preventDefault();event.stopPropagation();cleanupRef.current();
    const target=event.currentTarget,parent=target.parentElement;if(!parent)return;
    const pointerId=event.pointerId,startX=event.clientX,startY=event.clientY,original=current;draggedRef.current=false;
    target.setPointerCapture(pointerId);
    const move=(next:PointerEvent)=>{if(next.pointerId!==pointerId)return;if(!draggedRef.current&&Math.hypot(next.clientX-startX,next.clientY-startY)<5)return;draggedRef.current=true;place(next.clientX,next.clientY,parent)};
    const finish=(restore:boolean)=>(next:PointerEvent)=>{if(next.pointerId!==pointerId)return;if(restore)setDraft(original);if(target.hasPointerCapture(pointerId))target.releasePointerCapture(pointerId);cleanupRef.current();};
    const up=finish(false),cancelled=finish(true);
    cleanupRef.current=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancelled);if(target.hasPointerCapture(pointerId))target.releasePointerCapture(pointerId)};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancelled);
  },[current,editing,place]);
  const tapWorld=useCallback((event:React.PointerEvent<HTMLElement>)=>{if(event.target!==event.currentTarget||draggedRef.current){draggedRef.current=false;return;}event.preventDefault();event.stopPropagation();place(event.clientX,event.clientY,event.currentTarget);},[place]);
  const save=useCallback(async()=>{if(!draft||!dirty||saving)return;setSaving(true);setError(null);try{const response=await fetch("/api/admin/clearing/worlds/swamp/shop",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({portalX:draft.x,portalY:draft.y,enabled:draft.enabled})});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.message||"Portal could not be saved");}await onSaved();close();}catch(reason){setError(reason instanceof Error?reason.message:"Portal could not be saved");}finally{setSaving(false)}},[close,dirty,draft,onSaved,saving]);
  useEffect(()=>()=>cleanupRef.current(),[]);
  return{editing,draft:current,dirty,saving,error,begin,cancel,save,drag,tapWorld,setEnabled:(enabled:boolean)=>setDraft(value=>({...value??current,enabled}))};
}
