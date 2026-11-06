import * as React from "react";
import { HomeOutdoorEffectVisual } from "@/components/HomeInteriorEffect";
import { isParkOutdoorEffect, type ParkEffectType } from "@shared/petParkEffects";
export type { ParkWaterEffect } from "@shared/petParkEffects";

const MIST_CSS = [
  ".park-mist { position:relative; width:100%; height:100%; pointer-events:none; overflow:visible; }",
  ".park-mist svg { display:block; width:100%; height:100%; overflow:visible; }",
  ".park-mist-cloud { transform-box:fill-box; transform-origin:center; animation:parkMistSpread 7s ease-in-out infinite alternate; }",
  ".park-mist-cloud--back { animation-duration:8.6s; animation-delay:-3s; }",
  ".park-mist-cloud--front { animation-duration:6.8s; animation-delay:-2s; }",
  ".park-mist-cloud--side { animation-duration:9.2s; animation-delay:-5s; }",
  "@keyframes parkMistSpread { from { transform:translate3d(-5px,2px,0) scale(.94); opacity:.36; } to { transform:translate3d(8px,-5px,0) scale(1.1); opacity:.72; } }",
  ".park-mist--still .park-mist-cloud { animation:none !important; opacity:.55; }",
  "@media (prefers-reduced-motion: reduce) { .park-mist-cloud { animation:none !important; opacity:.55; } }",
].join("\n");

function ParkWaterfallMist({ reducedMotion }: { reducedMotion: boolean }) {
  const id = React.useId().replace(/:/g, "-");
  const mist = id + "-mist";
  const blur = id + "-soften";
  return <div aria-hidden="true" className={"park-mist park-water-effect--waterfall_mist" + (reducedMotion ? " park-mist--still" : "")}>
    <style>{MIST_CSS}</style>
    <svg viewBox="0 0 240 180" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id={mist}>
          <stop offset="0%" stopColor="#f4fcfa" stopOpacity=".52" />
          <stop offset="48%" stopColor="#e7f5f2" stopOpacity=".23" />
          <stop offset="100%" stopColor="#e7f5f2" stopOpacity="0" />
        </radialGradient>
        <filter id={blur} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <g filter={"url(#" + blur + ")"}>
        <g className="park-mist-cloud park-mist-cloud--back">
          <ellipse cx="115" cy="120" rx="91" ry="28" fill={"url(#" + mist + ")"} />
          <ellipse cx="93" cy="102" rx="48" ry="31" fill={"url(#" + mist + ")"} />
        </g>
        <g className="park-mist-cloud park-mist-cloud--side">
          <ellipse cx="56" cy="130" rx="58" ry="21" fill={"url(#" + mist + ")"} />
          <ellipse cx="190" cy="124" rx="53" ry="24" fill={"url(#" + mist + ")"} />
        </g>
        <g className="park-mist-cloud park-mist-cloud--front">
          <ellipse cx="118" cy="145" rx="112" ry="22" fill={"url(#" + mist + ")"} />
          <ellipse cx="149" cy="109" rx="52" ry="27" fill={"url(#" + mist + ")"} />
        </g>
      </g>
    </svg>
  </div>;
}

const WATER_CSS = [
  ".park-water-effect { width:100%; height:100%; position:relative; overflow:hidden; pointer-events:none; isolation:isolate; }",
  ".park-water-effect--water_ripple:before,.park-water-effect--water_ripple:after { content:\"\"; position:absolute; inset:25% 10%; border:3px solid rgba(232,252,255,.7); border-radius:50%; box-shadow:0 0 9px rgba(179,247,255,.5),inset 0 0 8px rgba(255,255,255,.3); animation:parkRipple 4.5s ease-out infinite; }",
  ".park-water-effect--water_ripple:after { animation-delay:-2.25s; }",
  ".park-water-effect--water_shimmer { overflow:visible; background:none; }",
  '.park-water-effect--water_shimmer:before,.park-water-effect--water_shimmer:after { content:""; position:absolute; inset:32% 4%; border-radius:42% 58% 55% 45%; background:linear-gradient(166deg,transparent 18%,rgba(212,249,239,.08) 32%,rgba(230,255,248,.24) 43%,transparent 51%,rgba(225,252,242,.12) 67%,transparent 78%); filter:blur(5px); animation:parkShimmer 6.5s ease-in-out infinite alternate; }',
  ".park-water-effect--water_shimmer:after { inset:43% 20% 20% 7%; opacity:.55; animation-duration:8.2s; animation-delay:-3.4s; }",
  "@keyframes parkRipple { 0% { transform:scale(.22); opacity:0; } 25% { opacity:.8; } 100% { transform:scale(1.4); opacity:0; } }",
  "@keyframes parkShimmer { from { transform:translate3d(-7%,1%,0) scale(.97); opacity:.2; } to { transform:translate3d(9%,-2%,0) scale(1.04); opacity:.6; } }",
  // One discreet droplet, no heavy rain or splash. A long idle phase keeps
  // waterfalls, fireplaces and character art visually dominant.
  ".park-water-effect--water_drop { overflow:visible; }",
  '.park-water-effect--water_drop:before { content:""; position:absolute; left:50%; top:23%; width:7px; height:10px; border-radius:55% 55% 55% 5%; background:linear-gradient(135deg,rgba(245,255,255,.85),rgba(122,205,220,.52) 65%,rgba(90,170,190,.15)); box-shadow:0 0 4px rgba(213,247,251,.25); opacity:0; transform:translate3d(-50%,-12px,0) rotate(-45deg); animation:parkSingleDrop 7.2s ease-in infinite; }',
  "@keyframes parkSingleDrop { 0%,22% { opacity:0; transform:translate3d(-50%,-12px,0) rotate(-45deg) scale(.75); } 29% { opacity:.58; } 61% { opacity:.52; transform:translate3d(-50%,16px,0) rotate(-45deg) scale(1); } 69%,100% { opacity:0; transform:translate3d(-50%,23px,0) rotate(-45deg) scale(.85); } }",
  ".park-water-effect--still:before,.park-water-effect--still:after { animation:none !important; }",
  "@media (prefers-reduced-motion: reduce) { .park-water-effect:before,.park-water-effect:after { animation:none !important; } }",
].join("\n");

export function ParkEffectVisual({ type, reducedMotion = false, adminPreview = false }: { type: ParkEffectType; reducedMotion?: boolean; adminPreview?: boolean }) {
  if (isParkOutdoorEffect(type)) return <HomeOutdoorEffectVisual type={type} reducedMotion={reducedMotion} adminPreview={adminPreview} />;
  if (type === "waterfall_mist") return <ParkWaterfallMist reducedMotion={reducedMotion} />;
  return <div aria-hidden="true" className={"park-water-effect park-water-effect--" + type + (reducedMotion ? " park-water-effect--still" : "")}>
    <style>{WATER_CSS}</style>
  </div>;
}
