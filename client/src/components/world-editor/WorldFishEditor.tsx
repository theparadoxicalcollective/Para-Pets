import { useRef, useState, type PointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import {
  containsSwimPoint, swimAreaBounds, SWIM_AREA_LIMIT, SWIM_FISH_LIMIT, SWIM_FISH_PER_AREA,
  type SwimPoint, type WorldFishCatalogEntry, type WorldSwimArea, type WorldSwimScene,
} from "@shared/worlds/worldSwimAreas";

type Props = {
  worldId: string; worldName: string; buildingId: string | null; groundLevel: number;
  areas: WorldSwimArea[]; width: number; height: number; panX: number; panY: number;
  viewportWidth: number; viewportHeight: number; onSaved: (scene: WorldSwimScene) => void; onClose: () => void;
};
const button = "min-h-10 rounded-lg border border-[#b99a4c]/75 bg-[#214532] px-2 py-1.5 text-xs font-semibold text-[#f5d890] disabled:opacity-40";
const accents: Record<string, string> = {
  swamp: "#6bc7a9", haunted_woods: "#a7a1e9", volcanic: "#f0a176", snowy_mountain: "#b5def1",
  sky_realm: "#a6d4ee", island: "#73d8d0", desert: "#e9c477", enchanted_grove: "#b0dc88",
};
export default function WorldFishEditor(p: Props) {
  const [mode, setMode] = useState<"area" | "fish">("area");
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedFish, setSelectedFish] = useState<WorldFishCatalogEntry | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [drawing, setDrawing] = useState<{start: SwimPoint; end: SwimPoint} | null>(null);
  const [ghost, setGhost] = useState<{fish: WorldFishCatalogEntry; x: number; y: number} | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{pointer: number; start: SwimPoint} | null>(null);
  const fishDrag = useRef<{pointer: number; x: number; y: number; fish: WorldFishCatalogEntry} | null>(null);
  const saving = useRef(false);
  const catalog = useQuery<{fish: WorldFishCatalogEntry[]; more: boolean}>({
    queryKey: ["/api/admin/world-editor", p.worldId, "fish-catalog", page],
    enabled: mode === "fish",
    queryFn: async () => (await apiRequest("GET", `/api/admin/world-editor/${p.worldId}/fish-catalog?page=${page}`)).json(),
    staleTime: 60_000,
  });
  const areas = p.areas.filter(a => a.buildingId === p.buildingId);
  const selection = areas.find(a => a.id === selectedArea);
  const totalFish = p.areas.reduce((n, a) => n + a.fish.length, 0);
  const accent = accents[p.worldId] ?? "#e6c572";
  const position = (clientX: number, clientY: number): SwimPoint => {
    const r = root.current!.getBoundingClientRect();
    return {x: ((clientX - r.left) * p.viewportWidth / Math.max(1, r.width) - p.panX) / p.width,
      y: ((clientY - r.top) * p.viewportHeight / Math.max(1, r.height) - p.panY) / p.height};
  };
  const clamp = (q: SwimPoint): SwimPoint => ({x: Math.max(0, Math.min(1, q.x)), y: Math.max(0, Math.min(1, q.y))});
  const areaAt = (q: SwimPoint) => [...areas].reverse().find(a => containsSwimPoint(swimAreaBounds(a, p.groundLevel), q));
  const preview = drawing && {x: Math.min(drawing.start.x, drawing.end.x), y: Math.min(drawing.start.y, drawing.end.y),
    width: Math.abs(drawing.start.x - drawing.end.x), height: Math.abs(drawing.start.y - drawing.end.y)};
  const box = (b: {x: number; y: number; width: number; height: number}) => ({
    left: p.panX + b.x * p.width, top: p.panY + b.y * p.height, width: b.width * p.width, height: b.height * p.height,
    borderColor: accent,
  });
  const save = async (next: WorldSwimArea[], success: string) => {
    if (saving.current) return;
    setBusy(true); saving.current = true; setMessage("");
    try {
      const r = await apiRequest("PUT", `/api/admin/world-editor/${p.worldId}/swim-areas`, {areas: next});
      p.onSaved(await r.json()); setMessage(success);
    } catch { setMessage("Could not save. Please try again."); }
    finally { saving.current = false; setBusy(false); }
  };
  const addFish = (fish: WorldFishCatalogEntry, q: SwimPoint) => {
    const a = areaAt(q);
    if (!a) { setMessage("Drop the fish inside a marked swim area."); return; }
    if (a.fish.length >= SWIM_FISH_PER_AREA || totalFish >= SWIM_FISH_LIMIT) {
      setMessage("Fish limit reached. Remove a fish before adding another."); return;
    }
    const b = swimAreaBounds(a, p.groundLevel);
    const point = clamp({x: (q.x - b.x) / b.width, y: (q.y - b.y) / b.height});
    setSelectedArea(a.id); setConfirmRemove(false);
    void save(p.areas.map(item => item.id === a.id ? {...item, fish: [...item.fish, {...point, id: crypto.randomUUID(), fishId: fish.id}]} : item),
      `${fish.name} added!`);
  };
  const start = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (busy || !e.isPrimary || e.button !== 0 || drag.current) return;
    const q = position(e.clientX, e.clientY);
    if (mode === "fish") {
      if (selectedFish) addFish(selectedFish, q);
      else { setSelectedArea(areaAt(q)?.id ?? null); setConfirmRemove(false); }
      return;
    }
    if (p.areas.length >= SWIM_AREA_LIMIT) { setMessage("Swim area limit reached."); return; }
    const start = clamp(q);
    drag.current = {pointer: e.pointerId, start};
    setDrawing({start, end: start});
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== e.pointerId) return;
    setDrawing({start: drag.current.start, end: clamp(position(e.clientX, e.clientY))});
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.pointer !== e.pointerId) return;
    drag.current = null; setDrawing(null);
    const q = clamp(position(e.clientX, e.clientY));
    const b = {x: Math.min(d.start.x, q.x), y: Math.min(d.start.y, q.y),
      width: Math.abs(d.start.x - q.x), height: Math.abs(d.start.y - q.y)};
    if (b.width < .005 || b.height < .005 || b.width * p.width < 24 || b.height * p.height < 24) {
      setSelectedArea(areaAt(q)?.id ?? null); setMessage("Drag from one corner to another to create a swim area."); return;
    }
    const a: WorldSwimArea = {...b, id: crypto.randomUUID(), buildingId: p.buildingId, groundLevel: p.groundLevel, fish: []};
    setSelectedArea(a.id); setMode("fish"); setSelectedFish(null);
    void save([...p.areas, a], "Swim area created. Choose a fish!");
  };
  const fishStart = (e: PointerEvent<HTMLButtonElement>, fish: WorldFishCatalogEntry) => {
    if (!e.isPrimary || e.button !== 0 || busy) return;
    fishDrag.current = {pointer: e.pointerId, x: e.clientX, y: e.clientY, fish};
    setSelectedFish(fish);
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  };
  const fishMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = fishDrag.current;
    if (d?.pointer !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return;
    const r = root.current!.getBoundingClientRect();
    setGhost({fish: d.fish, x: (e.clientX - r.left) * p.viewportWidth / r.width, y: (e.clientY - r.top) * p.viewportHeight / r.height});
  };
  const fishEnd = (e: PointerEvent<HTMLButtonElement>) => {
    const d = fishDrag.current;
    if (d?.pointer !== e.pointerId) return;
    fishDrag.current = null; setGhost(null);
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) { setMessage("Tap a swim area or drag the fish onto it."); return; }
    const r = panel.current?.getBoundingClientRect();
    if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    addFish(d.fish, position(e.clientX, e.clientY));
  };
  return <div ref={root} data-testid="world-fish-editor" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
    <div data-testid="world-fish-surface" className="pointer-events-auto absolute inset-0 touch-none"
      style={{cursor: mode === "area" ? "crosshair" : "default"}}
      onPointerDown={start} onPointerMove={move} onPointerUp={end}
      onPointerCancel={() => {drag.current = null; setDrawing(null);}}>
      {areas.map(a => <div key={a.id} data-testid="world-fish-area-outline"
        className="pointer-events-none absolute rounded-md border-2 border-dashed bg-[#72d6c0]/10"
        style={{...box(swimAreaBounds(a, p.groundLevel)), borderStyle: a.id === selectedArea ? "solid" : "dashed"}}>
        <span className="absolute left-0 top-0 rounded-br bg-[#10291d]/90 px-1 text-[10px]" style={{color: accent}}>{a.fish.length} fish</span>
      </div>)}
      {preview && <div className="pointer-events-none absolute rounded-md border-2 border-dashed bg-[#72d6c0]/20" style={box(preview)} />}
    </div>
    <section ref={panel} className="pointer-events-auto absolute inset-x-3 bottom-3 mx-auto max-w-lg rounded-xl border bg-[#10291d]/95 p-2 text-[#f4d999] shadow-xl"
      style={{borderColor: accent, bottom: "max(12px, env(safe-area-inset-bottom, 0px))"}}
      onPointerDown={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><strong className="block text-sm" style={{color: accent}}>Fish &amp; Swim Areas</strong>
          <span className="block truncate text-[11px]">{p.worldName} · {p.buildingId ? "Inside this building" : "Outdoors"}</span></div>
        <button type="button" className={button} disabled={busy} onClick={p.onClose}>Done</button>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <button type="button" className={button} aria-pressed={mode === "area"} style={mode === "area" ? {borderColor: accent, background: "#385745"} : {}} disabled={busy}
          onClick={() => {setMode("area"); setSelectedFish(null); setMessage("");}}>Create Swim Area</button>
        <button type="button" className={button} aria-pressed={mode === "fish"} style={mode === "fish" ? {borderColor: accent, background: "#385745"} : {}} disabled={busy}
          onClick={() => {setMode("fish"); setMessage("");}}>Add Fish</button>
      </div>
      <p className="mt-1 text-xs leading-snug">{mode === "area" ? "Drag across the water to mark an invisible swim area. Done to move the view."
        : "Drag a fish into an outlined area, or select a fish and tap the area."}</p>
      {mode === "fish" && <div className="mt-1">
        {catalog.isLoading ? <p className="text-xs">Loading fish…</p> : catalog.isError ?
          <button type="button" className={button} onClick={() => void catalog.refetch()}>Retry fish list</button> :
          <div className="grid grid-cols-3 gap-1">
            {catalog.data?.fish.map(f => <button key={f.id} type="button" aria-label={`Select ${f.name}`} aria-pressed={selectedFish?.id === f.id}
              className="flex min-w-0 touch-none flex-col items-center rounded-md border bg-[#193c2c] p-1 text-center text-[10px] leading-tight"
              style={{borderColor: selectedFish?.id === f.id ? accent : "#b99a4c55"}} disabled={busy}
              onPointerDown={e => fishStart(e, f)} onPointerMove={fishMove} onPointerUp={fishEnd}
              onPointerCancel={() => {fishDrag.current = null; setGhost(null);}}
              onClick={e => {if (e.detail === 0) setSelectedFish(f);}}>
              {f.imageUrl && <img src={f.imageUrl} alt="" draggable={false} className="h-9 w-full select-none object-contain" />}
              <span className="block w-full truncate">{f.name}</span>
              <span className="block text-[#e6cd86]">{f.starRarity ?? 1}★ · {f.facingDirection === "left" ? "Left" : "Right"}{f.fishSwimZone === "bottom" ? " · Bottom" : ""}</span>
            </button>)}
            {catalog.data?.fish.length === 0 && <p className="col-span-3 text-xs">No fish in the catalogue.</p>}
          </div>}
        <div className="mt-1 flex items-center justify-between gap-1">
          <button type="button" className={button} disabled={!page || busy} onClick={() => setPage(n => n - 1)}>Previous</button>
          <button type="button" className={button} disabled={!selectedFish} onClick={() => setSelectedFish(null)}>Select area</button>
          <button type="button" className={button} disabled={!catalog.data?.more || busy} onClick={() => setPage(n => n + 1)}>Next</button>
        </div>
      </div>}
      {selection && !selectedFish && <div className="mt-1 flex items-center gap-1 text-[11px]">
        <span className="flex-1">{selection.fish.length} fish in selected area</span>
        {selection.fish.length > 0 && <button className={button} type="button" disabled={busy} onClick={() => void save(p.areas.map(a => a.id === selection.id ? {...a, fish: a.fish.slice(0, -1)} : a), "Last fish removed.")}>Undo fish</button>}
        <button className={button} type="button" disabled={busy} onClick={() => {
          if (!confirmRemove && selection.fish.length) {setConfirmRemove(true); return;}
          setConfirmRemove(false); setSelectedArea(null);
          void save(p.areas.filter(a => a.id !== selection.id), "Swim area removed.");
        }}>{confirmRemove ? "Remove all?" : "Remove area"}</button>
      </div>}
      {(busy || message) && <p role="status" className="mt-1 text-xs" style={{color: accent}}>{busy ? "Saving…" : message}</p>}
    </section>
    {ghost?.fish.imageUrl && <img src={ghost.fish.imageUrl} alt="" draggable={false}
      className="pointer-events-none absolute z-10 h-16 w-16 object-contain opacity-90"
      style={{left: ghost.x - 32, top: ghost.y - 32}} />}
  </div>;
}
