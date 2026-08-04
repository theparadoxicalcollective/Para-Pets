import type { CSSProperties } from "react";
import { Plus, X } from "lucide-react";
import { CLEARING_PORTAL_PARTICLES } from "@/components/clearing/ClearingShopPortal";

type ResourceTheme={id:"amber"|"green"|"blue";label:string;rgb:string;colors:[string,string,string]};

export const CLEARING_RESOURCE_PLACEHOLDERS:ResourceTheme[]=[
  {id:"amber",label:"Amber / Gold",rgb:"251,191,36",colors:["#fde68a","#fbbf24","#f59e0b"]},
  {id:"green",label:"Green",rgb:"74,222,128",colors:["#bbf7d0","#4ade80","#a3e635"]},
  {id:"blue",label:"Blue",rgb:"96,165,250",colors:["#bfdbfe","#60a5fa","#22d3ee"]},
];

function ResourcePortalPlaceholder({theme}:{theme:ResourceTheme}){
  return <div data-testid={`clearing-resource-placeholder-${theme.id}`} role="img" aria-label={`${theme.label} resource portal placeholder`} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-1 pb-2 pt-1">
    <div aria-hidden className="clearing-resource-portal relative h-[92px] w-[76px] overflow-visible" style={{"--resource-rgb":theme.rgb} as CSSProperties}>
      <span className="clearing-resource-glow"/>
      <span className="clearing-resource-ring"/>
      <span className="clearing-resource-motes">{CLEARING_PORTAL_PARTICLES.slice(0,12).map((particle,index)=><b key={index} data-star={particle.star||undefined} style={{left:`${particle.x}%`,bottom:`${particle.y}%`,width:particle.size,height:particle.size,animationDelay:`-${particle.delay}s`,background:theme.colors[index%theme.colors.length],color:theme.colors[index%theme.colors.length],"--resource-rise":`${Math.round(particle.rise*.72)}px`} as CSSProperties}/>)}</span>
    </div>
    <span className="text-center text-[10px] font-black uppercase tracking-wide text-amber-50">{theme.label}</span>
  </div>;
}

export default function ClearingAdminResourcePanel({open,onOpenChange,hidden=false}:{open:boolean;onOpenChange:(open:boolean)=>void;hidden?:boolean}){
  return <>
    {!hidden&&<button type="button" data-interactive data-testid="button-add-clearing-resource" className="absolute left-3 top-1/2 pointer-events-auto mt-12 -translate-y-1/2 rounded-full border border-sky-300/60 bg-emerald-950/90 px-3 py-2 text-[11px] font-bold text-sky-100 shadow-lg" style={{zIndex:24}} onClick={()=>onOpenChange(true)}><span className="flex items-center gap-1"><Plus size={13} aria-hidden/>Add resource</span></button>}
    {open&&<div data-interactive role="dialog" aria-modal="true" aria-labelledby="clearing-resource-panel-title" data-testid="clearing-admin-resource-panel" className="absolute inset-0 pointer-events-auto flex items-center justify-center bg-black/70 p-4" style={{zIndex:35}} onPointerDown={event=>event.stopPropagation()}>
      <div className="w-full max-w-sm rounded-2xl border-2 border-amber-400/70 bg-emerald-950 p-4 text-amber-50 shadow-2xl">
        <div className="flex items-center justify-between gap-3"><div><h2 id="clearing-resource-panel-title" className="font-serif text-xl font-black text-amber-200">Add resource</h2><p className="text-xs text-emerald-100/75">Admin placeholders for future Clearing resources.</p></div><button type="button" data-testid="button-close-clearing-resource-panel" aria-label="Close resource placeholders" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-300/70 bg-red-950/80" onClick={()=>onOpenChange(false)}><X size={18}/></button></div>
        <div className="mt-4 grid grid-cols-3 gap-2">{CLEARING_RESOURCE_PLACEHOLDERS.map(theme=><ResourcePortalPlaceholder key={theme.id} theme={theme}/>)}</div>
        <p className="mt-3 text-center text-[11px] text-emerald-100/70">Visual placeholders only — they do not open or activate anything yet.</p>
      </div>
      <style>{`.clearing-resource-portal{isolation:isolate}.clearing-resource-glow{position:absolute;inset:12% 11% 7%;border-radius:50% 50% 42% 42%;background:radial-gradient(ellipse at 50% 72%,rgba(var(--resource-rgb),.28),rgba(var(--resource-rgb),.08) 48%,transparent 76%);filter:blur(5px)}.clearing-resource-ring{position:absolute;inset:18% 17% 10%;border:1px solid rgba(var(--resource-rgb),.62);border-radius:50% 50% 43% 43%;box-shadow:inset 0 0 12px rgba(var(--resource-rgb),.2),0 0 11px rgba(var(--resource-rgb),.26)}.clearing-resource-motes{position:absolute;inset:0}.clearing-resource-motes b{position:absolute;border-radius:50%;box-shadow:0 0 5px currentColor,0 0 9px currentColor;animation:clearing-resource-rise 3.2s ease-in-out infinite}.clearing-resource-motes b[data-star]{border-radius:0;clip-path:polygon(50% 0,61% 38%,100% 50%,61% 62%,50% 100%,39% 62%,0 50%,39% 38%);animation-name:clearing-resource-twinkle}@keyframes clearing-resource-rise{0%{opacity:0;transform:translateY(5px) scale(.55)}30%{opacity:.9}76%{opacity:.5}100%{opacity:0;transform:translateY(calc(-1 * var(--resource-rise))) scale(1.05)}}@keyframes clearing-resource-twinkle{0%,20%,100%{opacity:.12;transform:translateY(0) scale(.45) rotate(0)}45%{opacity:1;transform:translateY(calc(-.45 * var(--resource-rise))) scale(1.2) rotate(18deg)}75%{opacity:.25;transform:translateY(calc(-1 * var(--resource-rise))) scale(.65) rotate(36deg)}}@media(prefers-reduced-motion:reduce){.clearing-resource-motes b{animation:none;opacity:.7;transform:translateY(-13px)}}`}</style>
    </div>}
  </>;
}
