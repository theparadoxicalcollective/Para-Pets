import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";

type ParkItem = { id: string; kind: "decor" | "sleep_spot"; imageUrl: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };
type ParkDeposit = { id: string; slotNumber: number; petInventoryId: string; petName: string; petTemplateId: string; petNickname: string | null; petLevel: number };
type ParkScene = { enabledForPlayers: boolean; preview?: boolean; backgroundUrl: string | null; items: ParkItem[]; deposits: ParkDeposit[]; unlockedSlots: number };
type InventoryPet = { id: string; shopItemId: string; name: string; petNickname?: string | null; isHatched: boolean; isListed?: boolean; type?: string };

const SCENE_W = 1100;
const SCENE_H = 1700;
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }

export default function PetParkPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const viewport = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 390, height: 750 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedPet, setSelectedPet] = useState("");
  const { data: scene, isLoading } = useQuery<ParkScene>({ queryKey: ["/api/pet-park/scene"] });
  const { data: inventory = [] } = useQuery<InventoryPet[]>({ queryKey: ["/api/inventory"], enabled: !!scene?.enabledForPlayers });

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewportSize({ width: rect.width, height: rect.height });
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  const scale = Math.max(viewportSize.width / SCENE_W, viewportSize.height / SCENE_H);
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
  const occupied = new Set(deposits.map(d => d.petInventoryId));
  const availablePets = inventory.filter(p => p.isHatched && !p.isListed && !occupied.has(p.id) && (p.type == null || p.type === "pet"));

  return <div className="absolute inset-0 overflow-hidden bg-[#13291e] text-amber-100" data-testid="pet-park-page">
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
      {scene?.backgroundUrl && <div className="absolute top-0 left-0 pointer-events-none"
        style={{ width: sceneWidth, height: sceneHeight, transform: `translate(${camera.x}px, ${camera.y}px)`, backgroundImage: `url("${scene.backgroundUrl}")`, backgroundSize: "100% 100%" }}>
        {scene.items.map(item => <div key={item.id} className="absolute pointer-events-none"
          style={{ left: `${item.xPct * 100}%`, top: `${item.yPct * 100}%`, width: item.size * scale, height: item.size * scale, transform: `translate(-50%, -50%) ${item.flipped ? "scaleX(-1)" : ""}`, zIndex: item.layer + 10001 }}>
          {item.imageUrl ? <img alt="" src={item.imageUrl} draggable={false} className="w-full h-full object-contain" /> :
            <div className="w-full h-full rounded-full border border-amber-300/60 bg-amber-900/20" />}
        </div>)}
        {deposits.map((pet, index) => {
          const spots = scene.items.filter(item => item.kind === "sleep_spot");
          const spot = spots[index % Math.max(1, spots.length)];
          const x = spot?.xPct ?? 0.25 + index * 0.25;
          const y = spot?.yPct ?? 0.6;
          return <div key={pet.id} className="absolute pointer-events-none" style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: "translate(-50%, -75%)", width: 180 * scale, height: 180 * scale, zIndex: 11000 + index }}>
            <PetAnimator petTemplateId={pet.petTemplateId} inventoryId={pet.petInventoryId} />
          </div>;
        })}
      </div>}
    </div>

    <div className="absolute top-0 left-0 right-0 z-20 p-3 pt-[max(12px,env(safe-area-inset-top))] pointer-events-none">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => navigate("/")} className="pointer-events-auto rounded-lg bg-black/75 px-3 py-2">← Back</button>
        <h1 className="rounded-lg bg-black/70 px-4 py-2 text-lg font-semibold text-amber-300">Pet Park</h1>
        <span className="w-12" />
      </div>
    </div>

    {isLoading ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">Loading Pet Park…</div> :
      !scene?.enabledForPlayers ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-6">
        <div className="rounded-xl border border-amber-500/50 bg-[#152d23] p-6 text-center shadow-xl">
          <h2 className="text-xl font-semibold text-amber-300">Pet Park — Under Construction</h2>
          <p className="mt-3 text-sm">The park is being prepared. Your pets and coins are safe.</p>
          {scene?.preview && <p className="mt-3 text-sm text-amber-300">Admin preview: drag the background to inspect the draft scene.</p>}
        </div>
      </div> : <div className="absolute bottom-0 left-0 right-0 z-20 max-h-[42%] overflow-y-auto rounded-t-xl border-t border-amber-500/40 bg-black/80 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <p className="mb-2 text-xs text-amber-200/80">Drag the park in any direction to explore. Pet Park earnings are not active yet.</p>
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => {
            const slot = index + 1;
            const pet = deposits.find(d => d.slotNumber === slot);
            const unlocked = slot <= scene.unlockedSlots;
            return <div key={slot} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-700/50 p-2 text-sm">
              <span className="font-semibold">Spot {slot}</span>
              {pet ? <>
                <span className="flex-1">{pet.petNickname || pet.petName} · Lv {pet.petLevel}</span>
                <button type="button" disabled={action.isPending} className="rounded bg-amber-800 px-3 py-2"
                  onClick={() => action.mutate({ path: `/api/pet-park/deposits/${pet.id}/withdraw` })}>Retrieve</button>
              </> : !unlocked ? <button type="button" disabled={action.isPending} className="rounded bg-amber-800 px-3 py-2"
                onClick={() => action.mutate({ path: "/api/pet-park/slots/unlock", body: { slot } })}>
                Unlock · {slot === 2 ? "2,500" : "5,000"} coins
              </button> : <>
                <select aria-label={`Choose pet for spot ${slot}`} className="min-w-0 flex-1 rounded bg-slate-900 p-2" value={selectedPet}
                  onChange={e => setSelectedPet(e.target.value)}>
                  <option value="">Choose a pet</option>
                  {availablePets.map(p => <option key={p.id} value={p.id}>{p.petNickname || p.name || p.shopItemId}</option>)}
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
