import { worldYToDepth } from "@/lib/clearingWorldPresentation";

export const CLEARING_PORTAL_PARTICLES=[
  {x:12,delay:0,size:4,rise:44},{x:23,delay:.8,size:3,rise:51},{x:35,delay:1.45,size:5,rise:47},
  {x:47,delay:.35,size:3,rise:54},{x:58,delay:1.1,size:4,rise:46},{x:69,delay:.15,size:3,rise:50},
  {x:79,delay:1.65,size:5,rise:45},{x:89,delay:.65,size:3,rise:52},
] as const;

export default function ClearingShopPortal({x,y,width,editing=false,disabledPreview=false,onPointerDown}:{x:number;y:number;width:number;editing?:boolean;disabledPreview?:boolean;onPointerDown?:(event:React.PointerEvent<HTMLDivElement>)=>void}){
  return <div data-testid="clearing-shop-portal" data-interactive={editing||undefined} onPointerDown={editing?onPointerDown:undefined} className={`clearing-shop-portal absolute overflow-visible ${editing?"is-editing pointer-events-auto":"pointer-events-none"}`} style={{left:`${x*100}%`,top:`${y*100}%`,width,height:88,transform:"translate(-50%,-73px)",zIndex:worldYToDepth(y,0),touchAction:"none"}}>
    <span className="portal-shadow"/><span className="portal-rim"><i/></span>
    {CLEARING_PORTAL_PARTICLES.map((particle,index)=><b key={index} style={{left:`${particle.x}%`,width:particle.size,height:particle.size,animationDelay:`-${particle.delay}s`,"--portal-rise":`${particle.rise}px`} as React.CSSProperties}/>)}
    {disabledPreview&&<span className="portal-disabled-badge">Disabled preview</span>}
    <style>{`.clearing-shop-portal{filter:drop-shadow(0 0 12px rgba(132,255,99,.58))}.portal-shadow{position:absolute;z-index:-1;left:5%;right:5%;bottom:2px;height:17px;border-radius:50%;background:rgba(0,0,0,.68);filter:blur(6px)}.portal-rim{position:absolute;left:0;right:0;bottom:8px;height:36px;border-radius:50%;background:radial-gradient(ellipse,#032e22 31%,#075e42 42%,#20e58b 54%,rgba(163,255,92,.7) 64%,rgba(132,255,99,.2) 72%,transparent 76%);box-shadow:inset 0 0 9px rgba(8,255,158,.9),0 0 16px rgba(132,255,99,.78)}.portal-rim i{position:absolute;inset:15% 8%;border:2px solid rgba(190,255,167,.82);border-left-color:rgba(32,229,139,.25);border-radius:50%;animation:clearing-portal-spin 7s linear infinite}.clearing-shop-portal b{position:absolute;bottom:34px;border-radius:50%;background:#d9ffc8;box-shadow:0 0 5px #fff,0 0 10px #58f59f;animation:clearing-portal-rise 2.25s ease-in infinite}.portal-disabled-badge{position:absolute;left:50%;bottom:0;transform:translate(-50%,100%);white-space:nowrap;border:1px solid rgba(253,230,138,.7);border-radius:999px;background:rgba(2,44,34,.94);padding:1px 6px;font-size:9px;font-weight:800;color:#fef3c7}.clearing-shop-portal.is-editing .portal-rim{outline:2px dashed rgba(253,230,138,.95);outline-offset:4px;cursor:grab}.clearing-shop-portal.is-editing:active .portal-rim{cursor:grabbing}@keyframes clearing-portal-spin{to{transform:rotate(360deg)}}@keyframes clearing-portal-rise{0%{opacity:0;transform:translateY(3px) scale(.55)}30%{opacity:1}100%{opacity:0;transform:translateY(calc(-1 * var(--portal-rise))) scale(1.15)}}@media(prefers-reduced-motion:reduce){.portal-rim i,.clearing-shop-portal b{animation:none}.clearing-shop-portal b{opacity:.72;transform:translateY(-24px)}}`}</style>
  </div>;
}
