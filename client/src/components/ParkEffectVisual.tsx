import { HomeOutdoorEffectVisual } from "@/components/HomeInteriorEffect";
import { isParkOutdoorEffect, type ParkEffectType } from "@shared/petParkEffects";
export type { ParkWaterEffect } from "@shared/petParkEffects";
export function ParkEffectVisual({ type, reducedMotion = false }: { type: ParkEffectType; reducedMotion?: boolean }) {
  if (isParkOutdoorEffect(type)) return <HomeOutdoorEffectVisual type={type} reducedMotion={reducedMotion} />;
  return <div aria-hidden="true" className={`park-water-effect park-water-effect--${type} ${reducedMotion ? "park-water-effect--still" : ""}`}>
    <style>{`
      .park-water-effect { width: 100%; height: 100%; position: relative; overflow: hidden; pointer-events: none; isolation: isolate; }
      /* Distinct white, smoke-like plumes instead of a single faint blurred disc.
         Four soft layered gradients give each wisp body even on bright artwork. */
      .park-water-effect--waterfall_mist {
        border-radius: 45% 45% 50% 50%;
        background: radial-gradient(ellipse at 50% 79%, rgba(255,255,255,.62) 0%, rgba(255,255,255,.34) 34%, rgba(255,255,255,.10) 61%, transparent 82%);
      }
      .park-water-mist-plume {
        position: absolute;
        display: block;
        width: 79%;
        height: 70%;
        left: 11%;
        bottom: -7%;
        border-radius: 48%;
        pointer-events: none;
        opacity: .76;
        background:
          radial-gradient(ellipse at 29% 62%, rgba(255,255,255,.88) 0%, rgba(255,255,255,.55) 25%, transparent 65%),
          radial-gradient(ellipse at 68% 42%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.42) 30%, transparent 69%),
          radial-gradient(ellipse at 49% 77%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.32) 37%, transparent 72%);
        filter: blur(3.5px);
        animation: parkMistBillow 6.6s ease-in-out infinite alternate;
      }
      .park-water-mist-plume:nth-child(1) { left: -8%; bottom: -11%; width: 82%; animation-duration: 6.2s; animation-delay: -2s; }
      .park-water-mist-plume:nth-child(2) { left: 26%; bottom: -8%; width: 88%; animation-duration: 7.4s; animation-delay: -4.8s; }
      .park-water-mist-plume:nth-child(3) { left: 6%; bottom: 11%; width: 71%; height: 58%; animation-duration: 8.3s; animation-delay: -5.9s; opacity: .64; }
      .park-water-mist-plume:nth-child(4) { left: 34%; bottom: 15%; width: 72%; height: 60%; animation-duration: 7.1s; animation-delay: -1.4s; opacity: .64; }
      .park-water-effect--water_ripple:before,.park-water-effect--water_ripple:after { content:""; position:absolute; inset:25% 10%; border: 3px solid rgba(232,252,255,.7); border-radius:50%; box-shadow: 0 0 9px rgba(179,247,255,.5), inset 0 0 8px rgba(255,255,255,.3); animation: parkRipple 4.5s ease-out infinite; }
      .park-water-effect--water_ripple:after { animation-delay:-2.25s; }
      .park-water-effect--water_shimmer { border-radius: 50%; background: radial-gradient(ellipse, rgba(237,255,255,.17), transparent 72%); }
      .park-water-effect--water_shimmer:before { content:""; position:absolute; inset:0; background: repeating-linear-gradient(164deg, transparent 0 12%, rgba(235,255,255,.42) 15%, transparent 19% 31%); filter:blur(3px); animation:parkShimmer 5.5s ease-in-out infinite alternate; }
      @keyframes parkMistBillow {
        0% { transform: translate3d(-11%, 12%, 0) scale(.86, .83) rotate(-4deg); opacity: .44; }
        46% { transform: translate3d(4%, -3%, 0) scale(1.08, .95) rotate(3deg); opacity: .86; }
        100% { transform: translate3d(13%, -18%, 0) scale(1.18, 1.12) rotate(7deg); opacity: .61; }
      }
      @keyframes parkRipple { 0% {transform:scale(.22);opacity:0} 25% {opacity:.8} 100% {transform:scale(1.4);opacity:0} }
      @keyframes parkShimmer { from {transform:translateX(-10%);opacity:.22} to {transform:translateX(10%);opacity:.75} }
      .park-water-effect--still .park-water-mist-plume,
      .park-water-effect--still:before,.park-water-effect--still:after { animation:none !important; }
      @media (prefers-reduced-motion: reduce) {
        .park-water-effect:before,.park-water-effect:after,.park-water-mist-plume { animation:none !important; }
      }
    `}</style>
    {type === "waterfall_mist" && Array.from({ length: 4 }, (_, index) => <span key={index} className="park-water-mist-plume" />)}
  </div>;
}
