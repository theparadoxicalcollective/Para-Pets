export const CLEARING_DEATH_EFFECT_SAFETY_MS = 80;

export function scheduleClearingDeathEffectRemoval(effectId:string,durationMs:number,remove:(effectId:string)=>void,setTimer:typeof setTimeout=setTimeout) {
  return setTimer(() => remove(effectId), Math.max(0, durationMs) + CLEARING_DEATH_EFFECT_SAFETY_MS);
}
