import * as React from "react";
import { HomeOutdoorEffectVisual } from "@/components/HomeInteriorEffect";
import { isParkOutdoorEffect, type ParkEffectType } from "@shared/petParkEffects";
export type { ParkWaterEffect } from "@shared/petParkEffects";

const MIST_CSS = [
  ".park-mist { position:relative; width:100%; height:100%; pointer-events:none; overflow:visible; }",
  ".park-mist svg { display:block; width:100%; height:100%; overflow:visible; }",
  ".park-mist-wisp { transform-box:fill-box; transform-origin:50% 85%; animation:parkMistDrift 6.2s ease-in-out infinite alternate; }",
  ".park-mist-wisp--left { animation-duration:6.1s; animation-delay:-1.8s; }",
  ".park-mist-wisp--center { animation-duration:8.1s; animation-delay:-4.3s; }",
  ".park-mist-wisp--right { animation-duration:7.4s; animation-delay:-2.7s; }",
  ".park-mist-wisp--outer { animation-duration:9s; animation-delay:-5.6s; }",
  ".park-mist-wisp--drift { animation-duration:7.7s; animation-delay:-3.1s; }",
  "@keyframes parkMistDrift { 0% { transform:translate3d(-4px,5px,0) scale(.96); opacity:.58; } 50% { transform:translate3d(3px,-5px,0) scale(1.03); opacity:.89; } 100% { transform:translate3d(-3px,-15px,0) scale(1.07); opacity:.42; } }",
  ".park-mist--still .park-mist-wisp { animation:none !important; opacity:.74; }",
  "@media (prefers-reduced-motion: reduce) { .park-mist-wisp { animation:none !important; opacity:.74; } }",
].join("\n");

function ParkWaterfallMist({ reducedMotion }: { reducedMotion: boolean }) {
  // Unique IDs prevent multiple waterfall mist objects from sharing SVG filters.
  const id = React.useId().replace(/:/g, "-");
  const smoke = id + "-smoke";
  const haze = id + "-haze";
  const feather = id + "-feather";
  const smokeStroke = "url(#" + smoke + ")";
  return <div aria-hidden="true" className={"park-mist park-water-effect--waterfall_mist" + (reducedMotion ? " park-mist--still" : "")}>
    <style>{MIST_CSS}</style>
    <svg viewBox="0 0 240 180" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={smoke} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".75" />
          <stop offset="42%" stopColor="#f7faf7" stopOpacity=".54" />
          <stop offset="78%" stopColor="#ffffff" stopOpacity=".27" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={haze} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="23%" stopColor="#fff" stopOpacity=".26" />
          <stop offset="65%" stopColor="#fff" stopOpacity=".40" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={feather} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".019 .043" numOctaves="2" seed="11" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="2.1" />
        </filter>
      </defs>
      {/* Small independent columns and curling tendrils: no opaque radial disc. */}
      <g filter={"url(#" + feather + ")"}>
        <g className="park-mist-wisp park-mist-wisp--left">
          <path d="M50 166 C28 151 26 135 48 112 C68 92 82 88 73 67 C67 51 47 53 55 34" stroke={smokeStroke} strokeWidth="31" strokeLinecap="round" fill="none" />
        </g>
        <g className="park-mist-wisp park-mist-wisp--center">
          <path d="M102 174 C88 150 120 137 109 114 C97 92 126 74 116 54 C109 38 101 37 114 21" stroke={smokeStroke} strokeWidth="38" strokeLinecap="round" fill="none" />
        </g>
        <g className="park-mist-wisp park-mist-wisp--right">
          <path d="M155 168 C178 145 151 137 177 108 C194 90 161 78 180 52 C194 37 185 31 191 18" stroke={smokeStroke} strokeWidth="34" strokeLinecap="round" fill="none" />
        </g>
        <g className="park-mist-wisp park-mist-wisp--outer">
          <path d="M210 162 C191 142 214 129 199 106 C191 94 213 83 210 63" stroke={smokeStroke} strokeWidth="22" strokeLinecap="round" fill="none" />
        </g>
        <g className="park-mist-wisp park-mist-wisp--drift">
          <path d="M15 167 C49 154 61 166 86 150 C110 134 130 153 149 143 C178 127 194 145 227 132" stroke={smokeStroke} strokeWidth="15" strokeLinecap="round" fill="none" opacity=".58" />
        </g>
      </g>
      <path d="M14 163 C57 153 83 166 115 158 C158 148 190 158 230 160" stroke={"url(#" + haze + ")"} strokeWidth="19" strokeLinecap="round" fill="none" />
    </svg>
  </div>;
}

const WATER_CSS = [
  ".park-water-effect { width:100%; height:100%; position:relative; overflow:hidden; pointer-events:none; isolation:isolate; }",
  ".park-water-effect--water_ripple:before,.park-water-effect--water_ripple:after { content:\"\"; position:absolute; inset:25% 10%; border:3px solid rgba(232,252,255,.7); border-radius:50%; box-shadow:0 0 9px rgba(179,247,255,.5),inset 0 0 8px rgba(255,255,255,.3); animation:parkRipple 4.5s ease-out infinite; }",
  ".park-water-effect--water_ripple:after { animation-delay:-2.25s; }",
  ".park-water-effect--water_shimmer { border-radius:50%; background:radial-gradient(ellipse,rgba(237,255,255,.17),transparent 72%); }",
  ".park-water-effect--water_shimmer:before { content:\"\"; position:absolute; inset:0; background:repeating-linear-gradient(164deg,transparent 0 12%,rgba(235,255,255,.42) 15%,transparent 19% 31%); filter:blur(3px); animation:parkShimmer 5.5s ease-in-out infinite alternate; }",
  "@keyframes parkRipple { 0% { transform:scale(.22); opacity:0; } 25% { opacity:.8; } 100% { transform:scale(1.4); opacity:0; } }",
  "@keyframes parkShimmer { from { transform:translateX(-10%); opacity:.22; } to { transform:translateX(10%); opacity:.75; } }",
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
