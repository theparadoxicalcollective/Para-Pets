import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ParkItem = {
  id: string; kind: "decor" | "sleep_spot"; imageUrl: string | null;
  xPct: number; yPct: number; size: number; flipped: boolean; layer: number;
};
type ParkDraft = {
  settings: { enabledForPlayers: boolean; backgroundUrl: string | null };
  items: ParkItem[];
};
async function imageData(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}
export default function PetParkAdminPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ParkDraft>({ queryKey: ["/api/admin/pet-park"] });
  const [selected, setSelected] = useState<string | null>(null);
  const [kind, setKind] = useState<"decor" | "sleep_spot">("decor");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [editing, setEditing] = useState<ParkItem | null>(null);
  const dragStart = useRef<{ x: number; y: number; id: string } | null>(null);
  const scene = useRef<HTMLDivElement>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
  const mutation = useMutation({
    mutationFn: async ({ method, url, body }: { method: "POST" | "PUT" | "PATCH" | "DELETE"; url: string; body?: unknown }) => {
      const response = await apiRequest(method, url, body);
      return response.json();
    },
    onSuccess: () => { refresh(); toast({ title: "Pet Park draft saved" }); },
    onError: (error: Error) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });
  const savePlacement = (item: ParkItem) => mutation.mutate({
    method: "PATCH", url: `/api/admin/pet-park/items/${item.id}`,
    body: { xPct: item.xPct, yPct: item.yPct, size: item.size, flipped: item.flipped, layer: item.layer },
  });
  const current = editing ?? data?.items.find(item => item.id === selected) ?? null;
  const items = data?.items ?? [];

  return (
    <div className="space-y-4 pb-8 text-amber-100" data-testid="pet-park-admin">
      <h2 className="text-xl font-semibold text-amber-300">Pet Park — Scene Editor</h2>
      <p className="text-sm text-amber-100/75">Draft only. Pet Park stays under construction for players until deposits and rewards are ready. Place items by dragging them; use the controls below to fine-tune placement.</p>
      <div className="rounded-lg border border-amber-700/60 bg-black/50 p-3 space-y-3">
        <div className="text-sm">Player access: <strong>{data?.settings.enabledForPlayers ? "Open (check readiness)" : "Closed — Under Construction"}</strong></div>
        <label className="block text-sm font-semibold">Park background image
          <input aria-label="Upload park background" type="file" accept="image/*" className="mt-2 block w-full text-xs" disabled={mutation.isPending}
            onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return;
              try { mutation.mutate({ method: "PUT", url: "/api/admin/pet-park/background", body: { imageData: await imageData(file) } }); }
              catch (error) { toast({ title: String(error), variant: "destructive" }); }
              e.target.value = "";
            }} />
        </label>
      </div>
      {isLoading ? <p>Loading park draft…</p> : (
        <div ref={scene} className="relative w-full aspect-[9/16] max-h-[65vh] overflow-hidden rounded-xl border border-amber-600 bg-emerald-950 touch-none"
          style={{ backgroundImage: data?.settings.backgroundUrl ? `url("${data.settings.backgroundUrl}")` : undefined, backgroundSize: "100% 100%", backgroundPosition: "center" }}
          aria-label="Pet Park scene preview">
          {items.map(item => {
            const shown = editing?.id === item.id ? editing : item;
            return <button key={item.id} type="button" aria-label={`Select ${item.kind}`}
              onPointerDown={e => { dragStart.current = { x: e.clientX, y: e.clientY, id: item.id }; e.currentTarget.setPointerCapture(e.pointerId); setSelected(item.id); setEditing(shown); }}
              onPointerUp={e => {
                const start = dragStart.current; dragStart.current = null;
                if (!start || start.id !== item.id || !scene.current) return;
                const rect = scene.current.getBoundingClientRect();
                const xPct = Math.max(0, Math.min(1, shown.xPct + (e.clientX - start.x) / rect.width));
                const yPct = Math.max(0, Math.min(1, shown.yPct + (e.clientY - start.y) / rect.height));
                if (xPct !== shown.xPct || yPct !== shown.yPct) savePlacement({ ...shown, xPct, yPct });
              }}
              style={{
                position: "absolute", left: `${shown.xPct * 100}%`, top: `${shown.yPct * 100}%`,
                width: `${Math.max(25, shown.size / 2)}px`, height: `${Math.max(25, shown.size / 2)}px`,
                transform: "translate(-50%, -50%)", zIndex: shown.layer + 10001,
                border: selected === item.id ? "2px solid gold" : "1px dashed rgba(255,255,255,.5)",
                borderRadius: 8, background: shown.kind === "sleep_spot" ? "rgba(217,119,6,.45)" : "transparent",
                touchAction: "none",
              }}>
              {shown.imageUrl ? <img src={shown.imageUrl} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" style={{ transform: shown.flipped ? "scaleX(-1)" : undefined }} /> : <span className="text-xs">Rest</span>}
            </button>;
          })}
          {!data?.settings.backgroundUrl && <p className="absolute bottom-2 left-2 text-xs">Upload a background to begin.</p>}
        </div>
      )}
      <div className="rounded-lg border border-amber-700/60 bg-black/50 p-3 space-y-3">
        <h3 className="font-semibold">Add park decoration or rest spot</h3>
        <select aria-label="Scene item type" className="w-full rounded bg-slate-900 p-2" value={kind} onChange={e => setKind(e.target.value as "decor" | "sleep_spot")}>
          <option value="decor">Decoration</option><option value="sleep_spot">Rest spot</option>
        </select>
        <input aria-label="Scene item artwork" type="file" accept="image/*" className="w-full text-xs"
          onChange={async e => {
            const file = e.target.files?.[0]; if (!file) return;
            try { setPendingImage(await imageData(file)); } catch (error) { toast({ title: String(error), variant: "destructive" }); }
            e.target.value = "";
          }} />
        <button type="button" disabled={mutation.isPending || (kind === "decor" && !pendingImage)}
          className="rounded bg-amber-700 px-4 py-2 disabled:opacity-50"
          onClick={() => { mutation.mutate({ method: "POST", url: "/api/admin/pet-park/items", body: { kind, imageData: pendingImage, xPct: 0.5, yPct: 0.5, size: 100, flipped: false, layer: items.length } }); setPendingImage(null); }}>
          Add to park
        </button>
      </div>
      {current && <div className="rounded-lg border border-amber-600 bg-black/60 p-3 space-y-3">
        <h3 className="font-semibold">Selected {current.kind === "decor" ? "decoration" : "rest spot"}</h3>
        {(["xPct", "yPct", "size", "layer"] as const).map(field => <label key={field} className="flex items-center gap-3 text-sm">
          <span className="w-16">{field}</span>
          <input aria-label={field} className="min-w-0 flex-1 rounded bg-slate-900 p-2" type="number"
            min={field === "size" ? 1 : field === "layer" ? -10000 : 0}
            max={field === "size" ? 1000 : field === "layer" ? 10000 : 1}
            step={field === "xPct" || field === "yPct" ? 0.01 : 1}
            value={current[field]} onChange={e => setEditing({ ...current, [field]: Number(e.target.value) })} />
        </label>)}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={current.flipped} onChange={e => setEditing({ ...current, flipped: e.target.checked })} /> Flip horizontally
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={mutation.isPending} className="rounded bg-amber-700 px-4 py-2" onClick={() => { savePlacement(current); setEditing(null); }}>Save placement</button>
          <button type="button" disabled={mutation.isPending} className="rounded bg-red-900 px-4 py-2" onClick={() => {
            if (window.confirm("Remove this park item?")) { mutation.mutate({ method: "DELETE", url: `/api/admin/pet-park/items/${current.id}` }); setSelected(null); setEditing(null); }
          }}>Remove item</button>
        </div>
      </div>}
    </div>
  );
}
