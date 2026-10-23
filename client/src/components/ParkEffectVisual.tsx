import { HomeOutdoorEffectVisual } from "@/components/HomeInteriorEffect";
import { isParkOutdoorEffect, type ParkEffectType } from "@shared/petParkEffects";
export type { ParkWaterEffect } from "@shared/petParkEffects";
export function ParkEffectVisual({ type, reducedMotion = false }: { type: ParkEffectType; reducedMotion?: boolean }) {
  if (isParkOutdoorEffect(type)) return <HomeOutdoorEffectVisual type={type} reducedMotion={reducedMotion} />;
  return <div aria-hidden="true" className={`park-water-effect park-water-effect--${type} ${reducedMotion ? "park-water-effect--still" : ""}`}>
    <style>{`
      .park-water-effect { width: 100%; height: 100%; position: relative; overflow: hidden; pointer-events: none; isolation: isolate; }
      .park-water-effect--waterfall_mist { border-radius: 50%; background: radial-gradient(ellipse at 50% 72%, rgba(255,255,255,.50), rgba(219,247,248,.23) 42%, transparent 75%); filter: blur(3px); }
      .park-water-effect--waterfall_mist:before,.park-water-effect--waterfall_mist:after { content:""; position:absolute; inset: 12% 8%; border-radius: 50%; background: radial-gradient(ellipse, rgba(255,255,255,.5), rgba(242,252,253,.16) 42%, transparent 75%); animation: parkMist 5s ease-in-out infinite alternate; }
      .park-water-effect--waterfall_mist:after { inset: 30% 2% 0; animation-delay: -2.4s; opacity:.7; }
      .park-water-effect--water_ripple:before,.park-water-effect--water_ripple:after { content:""; position:absolute; inset:25% 10%; border: 3px solid rgba(232,252,255,.7); border-radius:50%; box-shadow: 0 0 9px rgba(179,247,255,.5), inset 0 0 8px rgba(255,255,255,.3); animation: parkRipple 4.5s ease-out infinite; }
      .park-water-effect--water_ripple:after { animation-delay:-2.25s; }
      .park-water-effect--water_shimmer { border-radius: 50%; background: radial-gradient(ellipse, rgba(237,255,255,.17), transparent 72%); }
      .park-water-effect--water_shimmer:before { content:""; position:absolute; inset:0; background: repeating-linear-gradient(164deg, transparent 0 12%, rgba(235,255,255,.42) 15%, transparent 19% 31%); filter:blur(3px); animation:parkShimmer 5.5s ease-in-out infinite alternate; }
      @keyframes parkMist { from {transform:translate(-8%,8%) scale(.82);opacity:.35} to {transform:translate(8%,-10%) scale(1.12);opacity:.75} }
      @keyframes parkRipple { 0% {transform:scale(.22);opacity:0} 25% {opacity:.8} 100% {transform:scale(1.4);opacity:0} }
      @keyframes parkShimmer { from {transform:translateX(-10%);opacity:.22} to {transform:translateX(10%);opacity:.75} }
      .park-water-effect--still *, .park-water-effect--still:before,.park-water-effect--still:after { animation:none !important; }
      @media (prefers-reduced-motion: reduce) { .park-water-effect:before,.park-water-effect:after {animation:none !important} }
    `}</style>
  </div>;
}
