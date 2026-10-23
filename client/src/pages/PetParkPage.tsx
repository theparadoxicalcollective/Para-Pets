import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import PetParkAdminPanel from "@/components/PetParkAdminPanel";
import { ParkEffectVisual, type ParkWaterEffect } from "@/components/ParkEffectVisual";
import { parkPetActivity } from "@/lib/petParkActivity";
import { arrangeParkVisitors, isParkPetNearViewport } from "@/lib/petParkPopulation";
import { parkCameraGeometry, parkClampCamera, parkImageAspect, PARK_FALLBACK_ASPECT } from "@/lib/petParkCamera";
import { HOME_TOUCH_SURFACE_STYLE, homeCameraPointerDelta, observeHomeViewport, safeSetPointerCapture } from "@/lib/homeCrossDevice";

type ParkItem = { id: string; kind: "decor" | "sleep_spot" | "effect"; effectType?: ParkWaterEffect | null; imageUrl: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };
type ParkDeposit = { id: string; slotNumber: number; petInventoryId: string; petName: string; petTemplateId: string; petNickname: string | null; petLevel: number; checkpointAt: string; pausedAt: string | null; pausedDurationMs: number };
type SharedParkPet = { petInventoryId: string; petTemplateId: string; petName: string; petNickname: string | null; petLevel: number; ownerName: string; ownerId: string; depositedAt: string };
type ParkScene = { sharedPets?: SharedParkPet[]; enabledForPlayers: boolean; preview?: boolean; canEditPark?: boolean; backgroundUrl: string | null; items: ParkItem[]; deposits: ParkDeposit[]; unlockedSlots: number; rates?: { coinsPerHour: number; essencePerHour: number; petXpPerHour: number } };
type InventoryPet = { inventoryId: string; shopItemId: string; name: string; petNickname?: string | null; isHatched: boolean; isListed?: boolean; type?: string };

export default function PetParkPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const viewport = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [backgroundAspect, setBackgroundAspect] = useState(PARK_FALLBACK_ASPECT);
  const [selectedPet, setSelectedPet] = useState("");
  const [inspectedPet, setInspectedPet] = useState<SharedParkPet | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editorMode, setEditorMode] = useState<"scene" | "effects">("scene");
  const { data: scene, isLoading } = useQuery<ParkScene>({ queryKey: ["/api/pet-park/scene"], refetchInterval: 30_000 });
  const { data: inventory = [] } = useQuery<InventoryPet[]>({ queryKey: ["/api/inventory"], enabled: !!scene?.enabledForPlayers });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize(previous => previous.width === element.clientWidth && previous.height === element.clientHeight
          ? previous : { width: element.clientWidth, height: element.clientHeight });
      }
    };
    // Reuse Pet House's resize, orientation and VisualViewport handling.
    return observeHomeViewport(element, measure, "artwork-scene");
  }, []);

  useEffect(() => {
    let active = true;
    const url = scene?.backgroundUrl;
    if (!url) { setBackgroundAspect(PARK_FALLBACK_ASPECT); return; }
    const image = new Image();
    image.onload = () => { if (active) setBackgroundAspect(parkImageAspect(image.naturalWidth, image.naturalHeight)); };
    image.onerror = () => { if (active) setBackgroundAspect(PARK_FALLBACK_ASPECT); };
    image.src = url;
    return () => { active = false; };
  }, [scene?.backgroundUrl]);

  // Camera uses the image's actual proportions. All scene placements remain
  // normalized 0–1 coordinates, independent of phone/tablet/desktop pixels.
  const geometry = parkCameraGeometry(viewportSize.width, viewportSize.height, backgroundAspect);
  const { scale, sceneWidth, sceneHeight } = geometry;
  const camera = parkClampCamera(pan ?? { x: -geometry.limitX / 2, y: -geometry.limitY / 2 }, geometry);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] }); qc.invalidateQueries({ queryKey: ["/api/pet-park/status"] }); };
  const action = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: object }) => {
      const res = await apiRequest("POST", path, body ?? {});
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Pet Park updated" }); setSelectedPet(""); },
    onError: (error: Error) => toast({ title: "Pet Park action failed", description: error.message, variant: "destructive" }),
  });

  const deposits = scene?.deposits ?? [];
  const parkPositions = useMemo(() => arrangeParkVisitors(scene?.sharedPets ?? [], scene?.items ?? []), [scene?.sharedPets, scene?.items]);
  const occupied = new Set(deposits.map(d => d.petInventoryId));
  const availablePets = inventory.filter(p => p.isHatched && !p.isListed && !occupied.has(p.inventoryId) && (p.type == null || p.type === "pet"));

  return <div className="absolute inset-0 overflow-hidden bg-[#13291e] text-amber-100" data-testid="pet-park-page">
    <style>{`
      @keyframes petParkWander {
        0%, 18%, 100% { transform: translate(0, 0); }
        42% { transform: translate(var(--pet-drift-x), var(--pet-drift-y)); }
        72% { transform: translate(-8px, 0); }
      }
      @keyframes petParkRest {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(3px); }
      }
      @keyframes petParkIdle {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }
      .pet-park-wander { animation: petParkWander 12s ease-in-out infinite; }
      .pet-park-rest { animation: petParkRest 10s ease-in-out infinite; }
      .pet-park-idle { animation: petParkIdle 9s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .pet-park-wander, .pet-park-rest, .pet-park-idle { animation: none !important; }
      }
    `}</style>
    <div ref={viewport} className="absolute inset-0 overflow-hidden" style={HOME_TOUCH_SURFACE_STYLE}
      onPointerDown={e => {
        if (!e.isPrimary || (e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
        pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, panX: camera.x, panY: camera.y, moved: false };
        safeSetPointerCapture(e.currentTarget, e.pointerId);
      }}
      onPointerMove={e => {
        const drag = pointer.current;
        if (!drag || drag.id !== e.pointerId) return;
        const delta = homeCameraPointerDelta(e.clientX - drag.x, e.clientY - drag.y, viewport.current);
        if (Math.hypot(delta.x, delta.y) > 7) drag.moved = true;
        if (!drag.moved) return;
        setPan(parkClampCamera({ x: drag.panX + delta.x, y: drag.panY + delta.y }, geometry));
      }}
      onPointerUp={e => { if (pointer.current?.id === e.pointerId) pointer.current = null; }}
      onPointerCancel={e => { if (pointer.current?.id === e.pointerId) pointer.current = null; }}
      onLostPointerCapture={e => { if (pointer.current?.id === e.pointerId) pointer.current = null; }}>
      {scene && <div className="absolute top-0 left-0 pointer-events-none"
        style={{ width: sceneWidth, height: sceneHeight, transform: `translate(${camera.x}px, ${camera.y}px)`, backgroundImage: scene.backgroundUrl ? `url("${scene.backgroundUrl}")` : undefined, backgroundSize: "100% 100%" }}>
        {scene.items.map(item => <div key={item.id} className="absolute pointer-events-none"
          style={{ left: `${item.xPct * 100}%`, top: `${item.yPct * 100}%`, width: item.size * scale, height: item.size * scale, transform: `translate(-50%, -50%) ${item.flipped ? "scaleX(-1)" : ""}`, zIndex: item.layer + 10001 }}>
          {item.kind === "effect" && item.effectType ? <ParkEffectVisual type={item.effectType} reducedMotion={reduceMotion} /> : item.imageUrl ? <img alt="" src={item.imageUrl} draggable={false} className="w-full h-full object-contain" /> :
            <div className="w-full h-full rounded-full border border-amber-300/60 bg-amber-900/20" />}
        </div>)}
        {(scene.sharedPets ?? []).map((pet, index) => {
          const position = parkPositions.get(pet.petInventoryId);
          if (!position || !isParkPetNearViewport(position, sceneWidth, sceneHeight, camera.x, camera.y, viewportSize.width, viewportSize.height)) return null;
          const activity = parkPetActivity(pet.petInventoryId);
          const isMine = deposits.some(d => d.petInventoryId === pet.petInventoryId);
          return <div key={pet.petInventoryId} className="absolute"
            style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`,
              transform: "translate(-50%, -75%)", width: 140 * scale, height: 165 * scale, zIndex: 11000 + index }}>
            <div className={`pointer-events-none h-[80%] ${reduceMotion ? "" : activity.kind === "wander" ? "pet-park-wander" : activity.kind === "rest" ? "pet-park-rest" : "pet-park-idle"}`}
              style={{ animationDelay: `${activity.delaySeconds}s`, animationDuration: `${activity.durationSeconds}s`,
                ["--pet-drift-x" as string]: `${activity.driftX}px`, ["--pet-drift-y" as string]: `${activity.driftY}px` }}>
              <PetAnimator petTemplateId={pet.petTemplateId} petInventoryId={pet.petInventoryId}
                costumeAccess={isMine ? "owner" : "public"} mode={reduceMotion ? "static" : activity.kind === "rest" ? "sleep" : "idle"} size={140 * scale} fillContainer />
            </div>
            <button type="button" className="pointer-events-auto absolute bottom-0 left-1/2 -translate-x-1/2 rounded bg-black/65 px-2 py-1 text-[11px] whitespace-nowrap text-amber-100"
              onClick={() => setInspectedPet(pet)}>{pet.petNickname || pet.petName}</button>
          </div>;
        })}
      </div>}
    </div>

    {scene?.enabledForPlayers && <div className="absolute right-3 top-16 z-20 rounded bg-black/70 px-3 py-1 text-xs">
      {(scene.sharedPets ?? []).length} pets visiting
    </div>}
    {inspectedPet && <div className="absolute left-1/2 top-1/3 z-30 w-[min(85%,300px)] -translate-x-1/2 rounded-xl border border-amber-500 bg-[#152d23] p-4 text-center shadow-xl">
      <h2 className="font-semibold text-amber-300">{inspectedPet.petNickname || inspectedPet.petName}</h2>
      <p className="mt-2 text-sm">Level {inspectedPet.petLevel} · Keeper: {inspectedPet.ownerName}</p>
      <button type="button" className="mt-3 rounded bg-amber-800 px-4 py-2" onClick={() => setInspectedPet(null)}>Close</button>
    </div>}
    <div className="absolute top-0 left-0 right-0 z-20 p-3 pt-[max(12px,env(safe-area-inset-top))] pointer-events-none">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => navigate("/")} className="pointer-events-auto rounded-lg bg-black/75 px-3 py-2">← Back</button>
        <h1 className="rounded-lg bg-black/70 px-4 py-2 text-lg font-semibold text-amber-300">Pet Park</h1>
        {scene?.canEditPark ? <div className="pointer-events-auto flex gap-1"><button type="button" onClick={() => { setEditorMode("effects"); setShowEditor(true); }} className="rounded-lg bg-teal-800 px-2 py-2 text-xs">Add Effects</button><button type="button" onClick={() => { setEditorMode("scene"); setShowEditor(true); }} className="rounded-lg bg-amber-800 px-2 py-2 text-xs">Edit Park</button></div> : <span className="w-12" />}
      </div>
    </div>

    {scene?.canEditPark && showEditor && <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-[#0b2119] px-3 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]">
      <div className="sticky top-0 z-10 mb-3 flex justify-end bg-[#0b2119] py-2">
        <button type="button" className="rounded bg-amber-800 px-4 py-2" onClick={() => {
          setShowEditor(false);
          qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
        }}>Close editor & refresh park</button>
      </div>
      <PetParkAdminPanel initialMode={editorMode} />
    </div>}

    {isLoading ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">Loading Pet Park…</div> :
      !scene?.enabledForPlayers && !scene?.canEditPark ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-6 pointer-events-none">
        <div className="rounded-xl border border-amber-500/50 bg-[#152d23] p-6 text-center shadow-xl">
          <h2 className="text-xl font-semibold text-amber-300">Pet Park — Under Construction</h2>
          <p className="mt-3 text-sm">The park is being prepared. Your pets and coins are safe.</p>

        </div>
      </div> : !scene?.enabledForPlayers ? <div className="pointer-events-none absolute bottom-4 left-3 right-3 z-10 flex justify-center"><span className="rounded-lg bg-black/70 px-3 py-2 text-xs text-amber-200">Admin preview · Park closed to players</span></div> : <div className="absolute bottom-0 left-0 right-0 z-20 max-h-[42%] overflow-y-auto rounded-t-xl border-t border-amber-500/40 bg-black/80 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <p className="mb-2 text-xs text-amber-200/80">Drag the park in any direction to explore. Rewards accumulate for up to 24 hours. Collect anytime without removing your pet.</p>
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => {
            const slot = index + 1;
            const pet = deposits.find(d => d.slotNumber === slot);
            const unlocked = slot <= scene.unlockedSlots;
            return <div key={slot} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-700/50 p-2 text-sm">
              <span className="font-semibold">Spot {slot}</span>
              {pet ? <>
                <span className="flex-1">{pet.petNickname || pet.petName} · Lv {pet.petLevel}</span>
                <button type="button" disabled={action.isPending} className="rounded bg-emerald-800 px-3 py-2"
                  onClick={() => action.mutate({ path: `/api/pet-park/deposits/${pet.id}/claim` })}>Collect rewards</button>
                <button type="button" disabled={action.isPending} className="rounded bg-amber-800 px-3 py-2"
                  onClick={() => action.mutate({ path: `/api/pet-park/deposits/${pet.id}/withdraw` })}>Retrieve</button>
              </> : !unlocked ? <button type="button" disabled={action.isPending} className="rounded bg-amber-800 px-3 py-2"
                onClick={() => action.mutate({ path: "/api/pet-park/slots/unlock", body: { slot } })}>
                Unlock · {slot === 2 ? "2,500" : "5,000"} coins
              </button> : <>
                <select aria-label={`Choose pet for spot ${slot}`} className="min-w-0 flex-1 rounded bg-slate-900 p-2" value={selectedPet}
                  onChange={e => setSelectedPet(e.target.value)}>
                  <option value="">Choose a pet</option>
                  {availablePets.map(p => <option key={p.inventoryId} value={p.inventoryId}>{p.petNickname || p.name || p.shopItemId}</option>)}
                </select>
                <button type="button" disabled={!selectedPet || action.isPending} className="rounded bg-amber-800 px-3 py-2 disabled:opacity-50"
                  onClick={() => action.mutate({ path: "/api/pet-park/deposits", body: { petInventoryId: selectedPet, slotNumber: slot } })}>Deposit</button>
              </>}
            </div>;
          })}
        </div>
      </div>}
  </div>;
}
