import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import { parkPetActivity } from "@/lib/petParkActivity";
import { arrangeParkVisitors, isParkPetNearViewport } from "@/lib/petParkPopulation";

type ParkItem = { id: string; kind: "decor" | "sleep_spot"; imageUrl: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };
type ParkDeposit = { id: string; slotNumber: number; petInventoryId: string; petName: string; petTemplateId: string; petNickname: string | null; petLevel: number; checkpointAt: string; pausedAt: string | null; pausedDurationMs: number };
type SharedParkPet = { petInventoryId: string; petTemplateId: string; petName: string; petNickname: string | null; petLevel: number; ownerName: string; ownerId: string; depositedAt: string };
type ParkScene = { sharedPets?: SharedParkPet[]; enabledForPlayers: boolean; preview?: boolean; backgroundUrl: string | null; items: ParkItem[]; deposits: ParkDeposit[]; unlockedSlots: number; rates?: { coinsPerHour: number; essencePerHour: number; petXpPerHour: number } };
type InventoryPet = { inventoryId: string; shopItemId: string; name: string; petNickname?: string | null; isHatched: boolean; isListed?: boolean; type?: string };

const SCENE_W = 1100;
const SCENE_H = 1700;
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }
export default function PetParkPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const viewport = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedPet, setSelectedPet] = useState("");
  const [inspectedPet, setInspectedPet] = useState<SharedParkPet | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
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
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewportSize({ width: rect.width, height: rect.height });
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  // Overscan lets players pan both axes on phones, tablets and portrait desktop.
  const scale = Math.max(viewportSize.width / SCENE_W, viewportSize.height / SCENE_H) * 1.18;
  const sceneWidth = SCENE_W * scale;
  const sceneHeight = SCENE_H * scale;
  const limits = { x: Math.max(0, sceneWidth - viewportSize.width), y: Math.max(0, sceneHeight - viewportSize.height) };
  const camera = { x: clamp(pan.x, -limits.x, 0), y: clamp(pan.y, -limits.y, 0) };
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
    <div ref={viewport} className="absolute inset-0 overflow-hidden touch-none"
      onPointerDown={e => {
        if (e.target !== e.currentTarget && (e.target as HTMLElement).closest("button")) return;
        pointer.current = { x: e.clientX, y: e.clientY, panX: camera.x, panY: camera.y };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Safari pointer ownership */ }
      }}
      onPointerMove={e => {
        if (!pointer.current) return;
        setPan({
          x: clamp(pointer.current.panX + e.clientX - pointer.current.x, -limits.x, 0),
          y: clamp(pointer.current.panY + e.clientY - pointer.current.y, -limits.y, 0),
        });
      }}
      onPointerUp={() => { pointer.current = null; }}
      onPointerCancel={() => { pointer.current = null; }}>
      {scene && <div className="absolute top-0 left-0 pointer-events-none"
        style={{ width: sceneWidth, height: sceneHeight, transform: `translate(${camera.x}px, ${camera.y}px)`, backgroundImage: scene.backgroundUrl ? `url("${scene.backgroundUrl}")` : undefined, backgroundSize: "100% 100%" }}>
        {scene.items.map(item => <div key={item.id} className="absolute pointer-events-none"
          style={{ left: `${item.xPct * 100}%`, top: `${item.yPct * 100}%`, width: item.size * scale, height: item.size * scale, transform: `translate(-50%, -50%) ${item.flipped ? "scaleX(-1)" : ""}`, zIndex: item.layer + 10001 }}>
          {item.imageUrl ? <img alt="" src={item.imageUrl} draggable={false} className="w-full h-full object-contain" /> :
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
        <span className="w-12" />
      </div>
    </div>

    {isLoading ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">Loading Pet Park…</div> :
      !scene?.enabledForPlayers ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-6 pointer-events-none">
        <div className="rounded-xl border border-amber-500/50 bg-[#152d23] p-6 text-center shadow-xl">
          <h2 className="text-xl font-semibold text-amber-300">Pet Park — Under Construction</h2>
          <p className="mt-3 text-sm">The park is being prepared. Your pets and coins are safe.</p>
          {scene?.preview && <p className="mt-3 text-sm text-amber-300">Admin preview: drag the background to inspect the draft scene.</p>}
        </div>
      </div> : <div className="absolute bottom-0 left-0 right-0 z-20 max-h-[42%] overflow-y-auto rounded-t-xl border-t border-amber-500/40 bg-black/80 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
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
