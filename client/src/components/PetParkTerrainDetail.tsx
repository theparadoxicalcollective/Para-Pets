import type { ParkTerrainDetailType } from "@shared/petParkTerrainDetails";

/**
 * A soft-edged, image-free terrain stamp in the existing 2.5D park scene.
 * The parent owns normalized placement, scaling, editing and stacking.
 */
export default function PetParkTerrainDetail({ type }: { type: ParkTerrainDetailType }) {
  const base = "pointer-events-none absolute inset-0 overflow-hidden rounded-[50%]";
  // The brush preview shows an opaque isometric dirt tile. Once saved,
  // adjoining tiles merge into one textured path in PetParkTerrain's canvas.
  if (type === "dirt_path") return <div aria-hidden="true"
    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3%]"
    style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", backgroundColor: "#624832", backgroundImage: [
      "radial-gradient(ellipse at 22% 34%, rgba(171,132,88,.13), transparent 33%)",
      "radial-gradient(ellipse at 78% 66%, rgba(64,45,30,.15), transparent 40%)",
    ].join(",") }} />;
  // Brush ghosts use the same 2:1 footprint as the saved union canvas. Only
  // the preview is a DOM stamp; saved material uses one seamless canvas.
  if (type === "garden_plot") return <div aria-hidden="true"
    className="pointer-events-none absolute inset-0 overflow-hidden"
    style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
      background: "radial-gradient(ellipse at 52% 45%, #957a55 7%, #786444 62%, #536044 93%)",
      filter: "drop-shadow(0 1px 2px rgba(0,0,0,.2))" }}>
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 240 120" preserveAspectRatio="none">
      <path d="M4 58 L120 3 L236 58 L121 117 Z" fill="none" stroke="#9a8550" strokeWidth="5" strokeOpacity=".7"/>
      <path d="M22 61 Q74 36 114 24 Q170 36 216 61 M31 71 Q94 45 132 40 Q184 52 205 66 M48 83 Q98 61 150 56 Q177 63 194 70"
        fill="none" stroke="#261e17" strokeOpacity=".3" strokeWidth="3" strokeLinecap="round"/>
      <path d="M71 55l4 2M114 82l6-2M155 54l5 1M103 38l3-2M138 72l3 2M83 67l3-1"
        fill="none" stroke="#b49a6c" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </div>;
  if (type === "stone_path") return <div aria-hidden="true"
    className="pointer-events-none absolute inset-0 overflow-hidden"
    style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", background: "#747671" }}>
    <svg viewBox="0 0 240 120" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      <path d="M4 50 L60 12 L116 45 L52 91 Z M118 25 L177 17 L235 58 L172 92 Z M75 72 L129 51 L172 94 L117 116 Z"
        fill="#9c9b8c" fillOpacity=".45" stroke="#3f4e4b" strokeOpacity=".45" strokeWidth="2" />
      <path d="M31 49 L56 37 M144 50 L173 58 M90 93 L116 84" stroke="#d0cbb6" strokeWidth="1.7" strokeOpacity=".5" />
    </svg>
  </div>;
  if (type === "water_path") return <div aria-hidden="true"
    className="pointer-events-none absolute inset-0 overflow-hidden"
    style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
      background: "linear-gradient(160deg,#256575,#2a8590 55%,#174b61)" }}>
    <svg viewBox="0 0 240 120" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      <path d="M24 62 Q65 48 104 56 T199 54 M62 83 Q120 68 174 84 M97 33 Q124 29 160 35"
        stroke="#c0ebe4" strokeOpacity=".48" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M47 68 Q86 62 118 69 T214 69" stroke="#143f57" strokeOpacity=".35" strokeWidth="6" fill="none" />
    </svg>
  </div>;
  if (type === "stone_patch") return <div aria-hidden="true" className={base}>
    <div className="absolute inset-[6%] rounded-[50%]" style={{ background: "radial-gradient(ellipse,rgba(74,96,61,.22),transparent 70%)" }} />
    <svg viewBox="0 0 240 125" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none">
      {[[53,59,25,13],[101,42,22,12],[141,80,27,14],[187,50,21,11],[105,97,14,7]].map(([x,y,rx,ry],i) =>
        <g key={i}><ellipse cx={x} cy={y+5} rx={rx+4} ry={ry+2} fill="#27382b" opacity=".24"/>
          <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={i%2 ? "#8a8d78" : "#a09e87"}/>
          <path d={`M${x-rx*0.65} ${y-2} Q${x} ${y-ry*1.2} ${x+rx*0.58} ${y-ry*0.32}`} stroke="#d2cdb3" strokeWidth="2" opacity=".65"/></g>)}
    </svg>
  </div>;
  if (type === "wildflowers") return <div aria-hidden="true" className={base}>
    <div className="absolute inset-0 rounded-[50%]" style={{ background: "radial-gradient(ellipse,rgba(84,133,65,.32),transparent 75%)" }} />
    <svg viewBox="0 0 240 125" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      {[[35,60],[61,30],[89,77],[125,40],[148,91],[187,55],[215,85],[116,104],[167,26],[60,99]].map(([x,y],i)=>
        <g key={i}><path d={`M${x} ${y+10} q-2 -12 3 -18`} stroke="#385b37" strokeWidth="2" fill="none"/>
          {[0,72,144,216,288].map(deg=><ellipse key={deg} cx={x} cy={y-4} rx="3.1" ry="6"
            transform={`rotate(${deg} ${x} ${y})`} fill={i%3===0?"#edd7ae":i%3===1?"#e3bd84":"#dbbdcc"} opacity=".9"/>)}
          <circle cx={x} cy={y} r="2.5" fill="#bd9b49"/></g>)}
    </svg>
  </div>;
  return <div aria-hidden="true" className={base}
    style={{ background: "radial-gradient(ellipse,rgba(47,100,49,.32),rgba(70,125,54,.11) 55%,transparent 78%)" }}>
    <svg viewBox="0 0 240 125" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      {[[37,80],[65,47],[92,83],[119,35],[150,74],[178,48],[202,93],[119,101],[69,106]].map(([x,y],i)=>
        <g key={i} stroke={i%2?"#9ab66b":"#3b703e"} fill="none" strokeWidth="3" strokeLinecap="round" opacity=".72">
          <path d={`M${x} ${y+9} Q${x-12} ${y-4} ${x-7} ${y-13} M${x} ${y+9} Q${x+7} ${y-7} ${x+12} ${y-10} M${x} ${y+9} Q${x+1} ${y-3} ${x} ${y-17}`}/>
        </g>)}
    </svg>
  </div>;
}
