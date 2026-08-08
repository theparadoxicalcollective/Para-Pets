import type { CSSProperties } from "react";

export type GameFeedbackKind = "heal" | "special" | "damage" | "reward" | "rare" | "failure";
const colors:Record<GameFeedbackKind,string>={heal:"#86efac",special:"#fde047",damage:"#fb923c",reward:"#fbbf24",rare:"#fef08a",failure:"#fca5a5"};

/** Lightweight semantic burst: short-lived, bounded DOM, and reduced-motion safe. */
export function GameFeedbackEffect({kind,x,y,label,intensity=1,className=""}:{kind:GameFeedbackKind;x:string|number;y:string|number;label?:string;intensity?:number;className?:string}){
  const count=Math.max(2,Math.min(8,Math.round(4*intensity))),style={"--game-feedback-color":colors[kind],left:x,top:y} as CSSProperties;
  return <span aria-hidden={!label} className={`game-feedback-effect game-feedback-${kind} ${className}`} style={style}>{Array.from({length:count},(_,index)=><i key={index} style={{"--spark-index":index} as CSSProperties}/>) }{label&&<b>{label}</b>}</span>;
}
