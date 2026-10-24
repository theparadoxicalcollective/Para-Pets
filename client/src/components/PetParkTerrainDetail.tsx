import type { ParkTerrainDetailType } from "@shared/petParkTerrainDetails";

/**
 * A soft-edged, image-free terrain stamp in the existing 2.5D park scene.
 * The parent owns normalized placement, scaling, editing and stacking.
 */
export default function PetParkTerrainDetail({ type }: { type: ParkTerrainDetailType }) {
  const base = "pointer-events-none absolute inset-0 overflow-hidden rounded-[50%]";
  if (type === "dirt_path") return <div aria-hidden="true" className={base}
    style={{ background: [
      "radial-gradient(ellipse at 52% 50%, rgba(122,91,58,.76) 0%, rgba(152,118,77,.77) 47%, rgba(159,130,88,.37) 72%, rgba(157,132,93,0) 100%)",
      "radial-gradient(ellipse at 24% 34%, rgba(211,184,126,.34) 0%, transparent 43%)",
    ].join(",") }} />;
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
