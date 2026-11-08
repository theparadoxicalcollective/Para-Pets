import * as React from "react";
import { HomeOutdoorEffectVisual } from "@/components/HomeInteriorEffect";
import { isParkOutdoorEffect, parkLightColor, type ParkEffectType } from "@shared/petParkEffects";
export type { ParkWaterEffect } from "@shared/petParkEffects";

const MIST_CSS = [
  ".park-mist { position:relative; width:100%; height:100%; pointer-events:none; overflow:visible; }",
  ".park-mist svg { display:block; width:100%; height:100%; overflow:visible; }",
  ".park-mist-cloud { transform-box:fill-box; transform-origin:center; animation:parkMistSpread 7s ease-in-out infinite alternate; }",
  ".park-mist-cloud--back { animation-duration:8.6s; animation-delay:-3s; }",
  ".park-mist-cloud--front { animation-duration:6.8s; animation-delay:-2s; }",
  ".park-mist-cloud--side { animation-duration:9.2s; animation-delay:-5s; }",
  "@keyframes parkMistSpread { from { transform:translate3d(-5px,2px,0) scale(.94); opacity:.62; } to { transform:translate3d(8px,-5px,0) scale(1.08); opacity:.95; } }",
  ".park-mist--still .park-mist-cloud { animation:none !important; opacity:.78; }",
  "@media (prefers-reduced-motion: reduce) { .park-mist-cloud { animation:none !important; opacity:.78; } }",
].join("\n");

function ParkWaterfallMist({ reducedMotion }: { reducedMotion: boolean }) {
  const id = React.useId().replace(/:/g, "-");
  const mist = id + "-mist";
  const shade = id + "-shade";
  const blur = id + "-soften";
  return <div aria-hidden="true" className={"park-mist park-water-effect--waterfall_mist" + (reducedMotion ? " park-mist--still" : "")}>
    <style>{MIST_CSS}</style>
    <svg viewBox="0 0 240 180" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {/* Aqua shadows give white vapor definition even against white waterfall foam. */}
        <radialGradient id={shade}>
          <stop offset="0%" stopColor="#247987" stopOpacity=".52" />
          <stop offset="48%" stopColor="#54a6aa" stopOpacity=".22" />
          <stop offset="100%" stopColor="#6eaca8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={mist}>
          <stop offset="0%" stopColor="#f6fffc" stopOpacity=".94" />
          <stop offset="46%" stopColor="#dbf7f4" stopOpacity=".48" />
          <stop offset="100%" stopColor="#e7f5f2" stopOpacity="0" />
        </radialGradient>
        <filter id={blur} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <g filter={"url(#" + blur + ")"}>
        <g className="park-mist-cloud park-mist-cloud--back">
          <path d="M22 131 Q40 109 62 116 Q76 91 101 105 Q125 91 145 114 Q174 97 197 122 Q217 126 229 142 Q195 154 155 145 Q130 154 104 145 Q76 156 49 144 Z" fill={"url(#" + shade + ")"} />
          <path d="M27 125 Q51 103 71 115 Q92 96 113 111 Q143 97 161 118 Q190 110 216 137 Q177 147 145 137 Q114 147 88 135 Q57 145 27 125 Z" fill={"url(#" + mist + ")"} />
        </g>
        <g className="park-mist-cloud park-mist-cloud--side">
          <path d="M3 144 Q21 121 42 129 Q62 109 78 126 Q94 122 111 144 Q91 160 68 151 Q34 166 3 144 Z M132 143 Q153 114 172 125 Q191 112 208 128 Q224 128 239 148 Q216 164 184 150 Q159 166 132 143 Z" fill={"url(#" + shade + ")"} />
          <path d="M8 139 Q25 122 44 131 Q58 118 73 131 Q89 126 101 143 Q76 155 54 144 Q31 156 8 139 Z M140 141 Q158 122 175 132 Q193 119 205 134 Q225 133 237 148 Q214 156 192 146 Q169 157 140 141 Z" fill={"url(#" + mist + ")"} />
        </g>
        <g className="park-mist-cloud park-mist-cloud--front">
          <path d="M5 157 Q26 140 51 145 Q74 124 92 138 Q120 119 145 138 Q175 124 194 144 Q216 140 238 158 Q217 176 180 164 Q147 178 116 164 Q83 178 61 166 Q25 174 5 157 Z" fill={"url(#" + shade + ")"} />
          <path d="M11 153 Q35 140 57 148 Q77 132 95 145 Q119 130 144 144 Q172 134 194 149 Q213 146 232 157 Q207 168 178 158 Q148 167 117 157 Q91 168 64 158 Q33 169 11 153 Z" fill={"url(#" + mist + ")"} />
        </g>
      </g>
    </svg>
  </div>;
}

const WATER_CSS = [
  ".park-water-effect { width:100%; height:100%; position:relative; overflow:hidden; pointer-events:none; isolation:isolate; }",
  ".park-water-effect--water_ripple:before,.park-water-effect--water_ripple:after { content:\"\"; position:absolute; inset:25% 10%; border:3px solid rgba(232,252,255,.7); border-radius:47% 53% 44% 56% / 54% 45% 55% 46%; box-shadow:0 0 0 1px rgba(21,107,124,.45),0 0 9px rgba(179,247,255,.5),inset 0 0 8px rgba(45,123,139,.3); animation:parkRipple 4.5s ease-out infinite; }",
  ".park-water-effect--water_ripple:after { animation-delay:-2.25s; }",
  "@keyframes parkRipple { 0% { transform:scale(.22); opacity:0; } 25% { opacity:.8; } 100% { transform:scale(1.4); opacity:0; } }",
  // One discreet droplet, no heavy rain or splash. A long idle phase keeps
  // waterfalls, fireplaces and character art visually dominant.
  ".park-water-effect--water_drop { overflow:visible; }",
  '.park-water-effect--water_drop:before { content:""; position:absolute; left:50%; top:23%; width:7px; height:10px; border-radius:55% 55% 55% 5%; background:linear-gradient(135deg,rgba(245,255,255,.85),rgba(122,205,220,.52) 65%,rgba(90,170,190,.15)); box-shadow:0 0 4px rgba(213,247,251,.25); opacity:0; transform:translate3d(-50%,-12px,0) rotate(-45deg); animation:parkSingleDrop 7.2s ease-in infinite; }',
  "@keyframes parkSingleDrop { 0%,22% { opacity:0; transform:translate3d(-50%,-12px,0) rotate(-45deg) scale(.75); } 29% { opacity:.58; } 61% { opacity:.52; transform:translate3d(-50%,16px,0) rotate(-45deg) scale(1); } 69%,100% { opacity:0; transform:translate3d(-50%,23px,0) rotate(-45deg) scale(.85); } }",
  ".park-water-effect--still:before,.park-water-effect--still:after { animation:none !important; }",
  "@media (prefers-reduced-motion: reduce) { .park-water-effect:before,.park-water-effect:after { animation:none !important; } }",
].join("\n");

// SVG is deliberately confined to each already-placeable effect item. Paths have
// irregular spacing and alpha-faded edges; only group transforms/opacity animate.
const WATER_ART_CSS = [
  ".park-water-art { position:relative; width:100%; height:100%; pointer-events:none; isolation:isolate; overflow:visible; }",
  ".park-water-art svg { display:block; width:100%; height:100%; overflow:visible; }",
  ".park-water-art--flow { overflow:hidden; }",
  ".park-water-art--flow svg { width:72%; margin:0 auto; }",
  ".park-surface-caustic { transform-box:fill-box; transform-origin:center; animation:parkSurfaceDrift 6.4s ease-in-out infinite alternate; }",
  ".park-surface-caustic--far { animation-duration:8.7s; animation-delay:-3.6s; }",
  "@keyframes parkSurfaceDrift { from { transform:translate3d(-6px,3px,0) scale(.97); opacity:.55; } to { transform:translate3d(7px,-3px,0) scale(1.03); opacity:.95; } }",
  ".park-flow-stream { transform-box:fill-box; animation:parkFlowFall 2.2s linear infinite; }",
  ".park-flow-stream--far { animation-duration:3.1s; animation-delay:-1.5s; }",
  "@keyframes parkFlowFall { 0% { transform:translate3d(0,-16px,0); opacity:.24; } 28% { opacity:.92; } 78% { opacity:.84; } 100% { transform:translate3d(0,27px,0); opacity:.18; } }",
  ".park-water-effect--still .park-surface-caustic,.park-water-effect--still .park-flow-stream { animation:none !important; opacity:.8; }",
  "@media (prefers-reduced-motion: reduce) { .park-surface-caustic,.park-flow-stream { animation:none !important; opacity:.8; } }",
].join("\n");

function ParkWaterShimmer({ reducedMotion }: { reducedMotion: boolean }) {
  const id = React.useId().replace(/:/g, "-");
  const edge = id + "-surface-edge";
  const mask = id + "-surface-mask";
  return <div aria-hidden="true" className={"park-water-effect park-water-art park-water-effect--water_shimmer" + (reducedMotion ? " park-water-effect--still" : "")}>
    <style>{WATER_ART_CSS}</style>
    <svg viewBox="0 0 240 160" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id={edge} cx="50%" cy="52%" r="68%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="62%" stopColor="white" stopOpacity=".94" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="160">
          <rect width="240" height="160" fill={"url(#" + edge + ")"} />
        </mask>
      </defs>
      <g mask={"url(#" + mask + ")"} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* The staggered dark/cool traces give the glints depth on pale art. */}
        <g className="park-surface-caustic park-surface-caustic--far">
          <path d="M15 51 Q43 40 70 51 T127 48 M149 57 Q172 48 195 56 T234 53 M26 103 Q55 91 88 103 T144 99 M155 119 Q184 108 216 115" stroke="#1c7a88" strokeOpacity=".5" strokeWidth="5" />
          <path d="M19 49 Q42 40 65 49 T117 47 M155 54 Q177 47 196 54 T229 52 M31 101 Q57 93 83 101 T140 97 M158 117 Q186 109 211 114" stroke="#b5ffff" strokeOpacity=".84" strokeWidth="2" />
          <path d="M55 71 Q77 62 99 72 M137 85 Q162 77 187 84 M48 131 Q70 124 89 130" stroke="#76e5e4" strokeOpacity=".72" strokeWidth="2.8" />
        </g>
        <g className="park-surface-caustic park-surface-caustic--near">
          <path d="M37 29 Q59 22 81 30 M105 35 Q124 28 148 36 M176 36 Q194 33 206 38 M17 83 Q40 75 57 81 M82 89 Q113 80 142 90 T196 89 M103 136 Q125 129 149 137" stroke="#287789" strokeOpacity=".55" strokeWidth="4" />
          <path d="M40 27 Q59 22 77 28 M108 33 Q128 27 146 34 M179 34 Q194 31 204 36 M20 81 Q38 75 54 79 M87 87 Q113 80 138 88 T192 87 M107 134 Q129 128 144 135" stroke="#e1ffff" strokeOpacity=".91" strokeWidth="1.9" />
          <path d="M24 119 Q43 115 58 120 M151 70 Q171 63 192 70 M74 113 Q90 107 109 112" stroke="#51d2d7" strokeOpacity=".78" strokeWidth="3" />
        </g>
      </g>
    </svg>
  </div>;
}

function ParkVerticalWaterFlow({ reducedMotion }: { reducedMotion: boolean }) {
  const id = React.useId().replace(/:/g, "-");
  const edge = id + "-flow-edge";
  const mask = id + "-flow-mask";
  return <div aria-hidden="true" className={"park-water-effect park-water-art park-water-art--flow park-water-effect--water_flow" + (reducedMotion ? " park-water-effect--still" : "")}>
    <style>{WATER_ART_CSS}</style>
    <svg viewBox="0 0 160 240" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id={edge} cx="50%" cy="48%" r="68%">
          <stop offset="0%" stopColor="white" stopOpacity=".99" />
          <stop offset="53%" stopColor="white" stopOpacity=".91" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="240">
          <rect width="160" height="240" fill={"url(#" + edge + ")"} />
        </mask>
      </defs>
      <g mask={"url(#" + mask + ")"} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <g className="park-flow-stream park-flow-stream--far">
          <path d="M19 -8 Q12 29 22 61 T22 123 Q17 171 28 242 M51 -10 Q58 37 50 77 T55 155 Q49 193 57 243 M98 -12 Q90 36 102 79 T102 159 Q94 204 101 245 M144 -5 Q136 41 144 83 T137 162 Q148 210 139 244" stroke="#287d8a" strokeOpacity=".52" strokeWidth="7" />
          <path d="M21 -7 Q15 32 24 63 T24 126 Q20 172 29 241 M53 -10 Q60 39 52 80 T57 155 Q51 193 59 244 M100 -11 Q93 37 104 79 T103 161 Q97 205 103 244 M146 -5 Q138 41 146 85 T139 165 Q149 207 141 242" stroke="#c0ffff" strokeOpacity=".8" strokeWidth="2.3" />
        </g>
        <g className="park-flow-stream park-flow-stream--near">
          <path d="M37 1 Q44 39 36 72 T42 142 Q37 190 43 244 M74 -9 Q66 40 76 82 T72 161 Q78 204 72 246 M120 -5 Q111 35 122 75 T116 156 Q122 198 117 247" stroke="#1f7181" strokeOpacity=".6" strokeWidth="6" />
          <path d="M39 0 Q46 38 38 71 T44 139 Q39 192 45 243 M76 -9 Q69 40 78 83 T74 159 Q80 204 74 247 M122 -4 Q113 35 124 77 T118 156 Q124 198 119 244" stroke="#e6ffff" strokeOpacity=".9" strokeWidth="2.4" />
          <path d="M30 34 Q33 50 30 69 M64 97 Q69 117 65 131 M89 22 Q94 44 91 56 M107 164 Q103 184 108 201 M132 96 Q127 115 131 135" stroke="#70eaeb" strokeOpacity=".7" strokeWidth="2" />
        </g>
      </g>
    </svg>
  </div>;
}


// Deterministic flutter paths with staggered speeds and offsets. Unlike large
// lamp masks, these stay lightweight and illuminate only tiny local halos.
const FIREFLY_PARTICLES = [
  [13,36,0,7.3,-1.2],[31,18,1,9.2,-4.7],[50,41,2,6.8,-3.4],
  [76,20,3,8.5,-5.8],[86,64,0,9.8,-2.9],[61,78,1,7.7,-6.2],
  [26,69,2,9.5,-1.8],[45,91,3,8.3,-4.1],[69,49,0,10.1,-7.0],
] as const;
const FIREFLY_CSS = `
.park-fireflies { position:relative;width:100%;height:100%;overflow:visible;pointer-events:none; }
.park-firefly-anchor { position:absolute;width:clamp(9px,16%,30px);aspect-ratio:1;transform:translate(-50%,-50%);pointer-events:none; }
.park-firefly-drift { display:block;position:relative;width:100%;height:100%;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate; }
.park-firefly-halo { position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(255,247,199,.10) 0%,rgba(255,243,167,.048) 37%,rgba(255,238,159,.012) 70%,transparent 100%);mix-blend-mode:screen; }
.park-firefly-core { position:absolute;left:50%;top:50%;width:13%;height:13%;min-width:1.7px;min-height:1.7px;transform:translate(-50%,-50%);border-radius:50%;background:#ffe990;box-shadow:0 0 3px 1px rgba(255,229,108,.50),0 0 7px 2px rgba(254,223,98,.14);animation:parkFireflyTwinkle 3.2s ease-in-out infinite alternate; }
@keyframes parkFireflyFlutter0 { 0%{transform:translate3d(-48%,-15%,0)}25%{transform:translate3d(57%,-73%,0)}52%{transform:translate3d(88%,34%,0)}79%{transform:translate3d(-39%,62%,0)}100%{transform:translate3d(17%,-36%,0)} }
@keyframes parkFireflyFlutter1 { 0%{transform:translate3d(24%,50%,0)}22%{transform:translate3d(-84%,5%,0)}57%{transform:translate3d(-45%,-80%,0)}83%{transform:translate3d(73%,-19%,0)}100%{transform:translate3d(10%,76%,0)} }
@keyframes parkFireflyFlutter2 { 0%{transform:translate3d(65%,-39%,0)}33%{transform:translate3d(-34%,-70%,0)}59%{transform:translate3d(-90%,21%,0)}84%{transform:translate3d(44%,58%,0)}100%{transform:translate3d(-17%,-18%,0)} }
@keyframes parkFireflyFlutter3 { 0%{transform:translate3d(-27%,71%,0)}31%{transform:translate3d(91%,22%,0)}55%{transform:translate3d(35%,-86%,0)}76%{transform:translate3d(-67%,-33%,0)}100%{transform:translate3d(22%,44%,0)} }
@keyframes parkFireflyTwinkle { from{opacity:.54;transform:translate(-50%,-50%) scale(.82)}to{opacity:1;transform:translate(-50%,-50%) scale(1.18)} }
.park-fireflies--still .park-firefly-drift,.park-fireflies--still .park-firefly-core { animation:none !important; }
@media (prefers-reduced-motion:reduce){.park-firefly-drift,.park-firefly-core {animation:none !important;}}
`;
function ParkFireflies({ reducedMotion, fireflyStrength }: { reducedMotion: boolean; fireflyStrength: number }) {
  const running = fireflyStrength > 0 && !reducedMotion;
  return <div aria-hidden="true" data-testid="park-fireflies" className={"park-fireflies" + (reducedMotion ? " park-fireflies--still" : "")}>
    <style>{FIREFLY_CSS}</style>
    {FIREFLY_PARTICLES.map(([x, y, path, duration, delay], index) => <span key={index}
      className="park-firefly-anchor" style={{ left: x + "%", top: y + "%" }}>
      <span className="park-firefly-drift" style={{
        animationName: "parkFireflyFlutter" + path, animationDuration: duration + "s",
        animationDelay: delay + "s", animationPlayState: running ? "running" : "paused",
      }}>
        <span className="park-firefly-halo"/>
        <span className="park-firefly-core" style={{ animationDelay: delay * .65 + "s",
          animationPlayState: running ? "running" : "paused" }}/>
      </span>
    </span>)}
  </div>;
}

export function ParkEffectVisual({ type, reducedMotion = false, adminPreview = false, color, fireflyStrength = 1 }: { type: ParkEffectType; reducedMotion?: boolean; adminPreview?: boolean; color?: string; fireflyStrength?: number }) {
  if (type === "fireflies") return <ParkFireflies reducedMotion={reducedMotion} fireflyStrength={fireflyStrength} />;
  if (type === "colored_light") return <HomeOutdoorEffectVisual type="lamp_light"
    reducedMotion={reducedMotion} adminPreview={adminPreview}
    warmSceneLamp orbColor={parkLightColor(color)} />;
  if (isParkOutdoorEffect(type)) return <HomeOutdoorEffectVisual type={type} reducedMotion={reducedMotion} adminPreview={adminPreview} warmSceneLamp orbColor={type === "lamp_light" && color ? parkLightColor(color) : undefined} />;
  if (type === "waterfall_mist") return <ParkWaterfallMist reducedMotion={reducedMotion} />;
  if (type === "water_shimmer") return <ParkWaterShimmer reducedMotion={reducedMotion} />;
  if (type === "water_flow") return <ParkVerticalWaterFlow reducedMotion={reducedMotion} />;
  return <div aria-hidden="true" className={"park-water-effect park-water-effect--" + type + (reducedMotion ? " park-water-effect--still" : "")}>
    <style>{WATER_CSS}</style>
  </div>;
}
