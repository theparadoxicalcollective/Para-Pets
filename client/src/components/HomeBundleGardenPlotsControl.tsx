import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Sprout, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import {
  clampHomeGardenPosition, clampHomeGardenSize, HOME_GARDEN_PLOT_DEFAULT_SIZE,
  HOME_GARDEN_PLOT_MAX_PER_BUNDLE, type HomeBundleGardenPlot,
} from "@shared/homeBundleGardenPlots";

/** Admin-only Home Bundle outdoor garden soil placement.
 *
 * This is independent from Decor and Objects: Garden Plots are part of the
 * Home scene rather than inventory entitlements. They use the existing
 * isometric plot artwork and the Home scene's responsive artwork coordinates.
 */
export default function HomeBundleGardenPlotsControl({
  bundleId, panX, imgWidth, sceneHeight,
}: {
  bundleId: string; panX: number; imgWidth: number; sceneHeight: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = ["/api/admin/house-bundles", bundleId, "garden-plots"] as const;
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; xPct: number; yPct: number } | null>(null);
  const dragRef = useRef<{
    id: string; pointerId: number; x: number; y: number; xPct: number; yPct: number;
  } | null>(null);

  const { data: plots = [] } = useQuery<HomeBundleGardenPlot[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/admin/house-bundles/${bundleId}/garden-plots`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to load Home Bundle Garden Plots");
      return response.json();
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/house-bundles/${bundleId}/garden-plots`, {
        xPct: 0.5, yPct: 0.52, size: HOME_GARDEN_PLOT_DEFAULT_SIZE,
      });
      return response.json() as Promise<HomeBundleGardenPlot>;
    },
    onSuccess: plot => {
      void qc.invalidateQueries({ queryKey });
      setSelectedId(plot.id);
      setOpen(false);
    },
    onError: (error: Error) => toast({
      title: "Could not add Garden Plot", description: error.message, variant: "destructive",
    }),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<HomeBundleGardenPlot, "xPct" | "yPct" | "size">> }) => {
      const response = await apiRequest("PATCH", `/api/admin/house-bundle-garden-plots/${id}`, patch);
      return response.json() as Promise<HomeBundleGardenPlot>;
    },
    onSuccess: plot => {
      qc.setQueryData<HomeBundleGardenPlot[]>(queryKey, old => old?.map(p => p.id === plot.id ? plot : p));
    },
    onError: (error: Error) => {
      void qc.invalidateQueries({ queryKey });
      toast({ title: "Garden Plot not saved", description: error.message, variant: "destructive" });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/house-bundle-garden-plots/${id}`),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast({
      title: "Could not remove Garden Plot", description: error.message, variant: "destructive",
    }),
  });

  const onDown = useCallback((event: React.PointerEvent<HTMLDivElement>, plot: HomeBundleGardenPlot) => {
    event.stopPropagation();
    if (imgWidth <= 0 || sceneHeight <= 0) return;
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    setSelectedId(plot.id);
    dragRef.current = {
      id: plot.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      xPct: plot.xPct, yPct: plot.yPct,
    };
  }, [imgWidth, sceneHeight]);
  const positionFor = useCallback((clientX: number, clientY: number) => {
    const drag = dragRef.current!;
    return {
      xPct: clampHomeGardenPosition(drag.xPct + (clientX - drag.x) / imgWidth),
      yPct: clampHomeGardenPosition(drag.yPct + (clientY - drag.y) / sceneHeight),
    };
  }, [imgWidth, sceneHeight]);
  const onMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const drag = dragRef.current;
    setPreview({ id: drag.id, ...positionFor(event.clientX, event.clientY) });
  }, [positionFor]);
  const onUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.stopPropagation();
    const next = positionFor(event.clientX, event.clientY);
    setPreview(null);
    if (next.xPct !== drag.xPct || next.yPct !== drag.yPct)
      update.mutate({ id: drag.id, patch: next });
  }, [positionFor, update]);

  const selected = plots.find(plot => plot.id === selectedId);
  return <>
    {imgWidth > 0 && sceneHeight > 0 && plots.map(plot => {
      const pos = preview?.id === plot.id ? preview : plot;
      const chosen = plot.id === selectedId;
      return <div key={plot.id} data-testid={`home-bundle-garden-plot-${plot.id}`}
        role="button" aria-label="Move Home Bundle Garden Plot"
        className="absolute"
        style={{
          left: panX + pos.xPct * imgWidth, top: pos.yPct * sceneHeight,
          width: plot.size, height: plot.size / 2,
          transform: "translate(-50%, -50%)",
          zIndex: chosen ? 24 : 3,
          outline: chosen ? "2px solid #ffd700" : "1px dashed rgba(255,215,0,.50)",
          outlineOffset: chosen ? 3 : 1,
          touchAction: "none", cursor: "grab",
        }}
        onPointerDown={event => onDown(event, plot)}
        onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={onUp} onLostPointerCapture={onUp}
        onClick={event => event.stopPropagation()}>
        <PetParkTerrainDetail type="garden_plot" />
      </div>;
    })}
    <button type="button" data-testid="button-add-bundle-garden-plot"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setOpen(true); }}
      className="absolute flex min-h-10 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold"
      style={{
        zIndex: 32, top: "max(154px, calc(env(safe-area-inset-top, 0px) + 126px))",
        right: 14, background: "rgba(9,28,17,.94)", color: "#ffe2a0",
        border: "1px solid rgba(255,215,0,.6)",
      }}>
      <Sprout size={17} /> + Garden Plot{plots.length ? ` · ${plots.length}` : ""}
    </button>
    {selected && !open && <div data-testid="home-bundle-garden-plot-controls"
      className="absolute left-1/2 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-2"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      style={{ bottom: "max(145px, calc(env(safe-area-inset-bottom, 0px) + 128px))",
        zIndex: 36, background: "rgba(7,24,13,.95)", border: "1px solid #b69b59", color: "#ffe5aa" }}>
      <strong className="text-xs">Garden Plot</strong>
      <button type="button" aria-label="Decrease Garden Plot size" className="rounded-lg border p-2"
        disabled={update.isPending || selected.size <= 60}
        onClick={() => update.mutate({ id: selected.id, patch: { size: clampHomeGardenSize(selected.size - 20) } })}>
        <Minus size={16} />
      </button>
      <button type="button" aria-label="Increase Garden Plot size" className="rounded-lg border p-2"
        disabled={update.isPending || selected.size >= 500}
        onClick={() => update.mutate({ id: selected.id, patch: { size: clampHomeGardenSize(selected.size + 20) } })}>
        <Plus size={16} />
      </button>
      <button type="button" aria-label="Remove Garden Plot" className="rounded-lg border border-red-400/50 p-2 text-red-200"
        disabled={remove.isPending} onClick={() => remove.mutate(selected.id)}><Trash2 size={16} /></button>
      <button type="button" aria-label="Finish editing Garden Plot"
        className="rounded-lg border p-2" onClick={() => setSelectedId(null)}><X size={16} /></button>
    </div>}
    {open && <div data-testid="home-bundle-garden-plot-dialog"
      className="fixed inset-0 flex items-center justify-center px-4"
      onPointerDown={event => event.stopPropagation()}
      onClick={() => setOpen(false)}
      style={{ zIndex: 225, background: "rgba(0,0,0,.72)" }}>
      <div className="w-full max-w-sm rounded-2xl border p-5 text-[#ffe2a0]"
        onClick={event => event.stopPropagation()}
        style={{ background: "#10291d", borderColor: "#c9a85d" }}>
        <h3 className="mb-2 text-base font-semibold">Add a Garden Plot</h3>
        <p className="mb-4 text-sm leading-relaxed text-[#f4dfad]">
          Add an isometric soil plot to this Home Bundle's outdoor scene.
          Drag to position and use +/− to resize. Garden crops and harvesting
          are managed separately.
        </p>
        <div className="flex gap-2">
          <button type="button" className="min-h-11 flex-1 rounded-lg border px-3 text-sm"
            onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" data-testid="confirm-add-home-garden-plot"
            className="min-h-11 flex-1 rounded-lg border px-3 text-sm font-semibold"
            style={{ background: "#31543b" }}
            disabled={create.isPending || plots.length >= HOME_GARDEN_PLOT_MAX_PER_BUNDLE}
            onClick={() => create.mutate()}>
            {create.isPending ? "Adding…" : "Add Plot"}
          </button>
        </div>
        {plots.length >= HOME_GARDEN_PLOT_MAX_PER_BUNDLE &&
          <p className="mt-3 text-xs">Maximum Garden Plots reached for this Home Bundle.</p>}
      </div>
    </div>}
  </>;
}
