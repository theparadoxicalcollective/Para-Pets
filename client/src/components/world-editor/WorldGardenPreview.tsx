import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PetParkGardenMenu, { type GardenOwnedItem } from "@/components/PetParkGardenMenu";
import PetParkWaterRefillPopup from "@/components/PetParkWaterRefillPopup";
import PetParkCropArtwork from "@/components/PetParkCropArtwork";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import { gardenCropProgress, gardenItemNeedsRefill, type GardenPlayerState } from "@shared/garden";
import type { WorldScenePlacement } from "@shared/worlds/worldSceneContent";
import { parkDepthIndex } from "@/lib/petParkDepth";

type Props = {
  worldId: string;
  placements: readonly WorldScenePlacement[];
  viewportWidth: number;
  viewportHeight: number;
  sceneWidth: number;
  sceneHeight: number;
  worldHeight: number;
  scale: number;
  panX: number;
  panY: number;
  onExit: () => void;
};

export default function WorldGardenPreview(props: Props) {
  const {
    worldId, placements, viewportWidth, viewportHeight, sceneWidth, sceneHeight,
    worldHeight, scale, panX, panY, onExit,
  } = props;
  const cache = useQueryClient();
  const [plotId, setPlotId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [wateringId, setWateringId] = useState<string | null>(null);
  const url = `/api/admin/world-editor/${worldId}`;
  const gardenKey = [url + "/garden"];
  const { data: garden, isLoading, isError } = useQuery<GardenPlayerState>({
    queryKey: gardenKey,
    queryFn: async () => {
      const response = await fetch(url + "/garden", { credentials: "include" });
      if (!response.ok) throw new Error("World garden is unavailable");
      return response.json();
    },
    refetchInterval: plotId ? 5_000 : 30_000,
  });
  const { data: inventory = [], isFetching: inventoryLoading } = useQuery<GardenOwnedItem[]>({
    queryKey: ["/api/inventory"],
  });
  useEffect(() => { setPlotId(null); setSourceId(null); setWateringId(null); }, [worldId]);

  const selectedPlot = garden?.plots.find(plot => plot.plotItemId === plotId);
  const pails = inventory.filter(item => item.type === "garden_tool" && item.specialType === "watering_pail");
  const eligiblePails = pails.filter(item => gardenItemNeedsRefill(item));
  const invalidate = () => {
    void cache.invalidateQueries({ queryKey: gardenKey });
    void cache.invalidateQueries({ queryKey: ["/api/inventory"] });
    void cache.invalidateQueries({ queryKey: ["/api/pet-park/garden"] });
  };
  const anchor = selectedPlot ? (() => {
    const plotX = panX + selectedPlot.xPct * sceneWidth;
    const plotY = panY + selectedPlot.yPct * sceneHeight;
    const side: "right" | "left" = plotX + 158 <= viewportWidth ? "right" : "left";
    return {
      plotX, plotY, side,
      x: Math.max(6, Math.min(Math.max(6, viewportWidth - 131), side === "right" ? plotX + 42 : plotX - 167)),
      y: Math.max(48, Math.min(Math.max(48, viewportHeight - 224), plotY - 97)),
    };
  })() : null;

  const waterSources = placements.filter(item =>
    (item.kind === "decor" && item.isWaterSource) ||
    (item.kind === "terrain" && item.effectType === "water_path"));
  const visible = (x: number, y: number, margin: number) =>
    x >= -margin && x <= viewportWidth + margin && y >= -margin && y <= viewportHeight + margin;

  return <>
    <div aria-label="World garden preview" data-testid="world-garden-preview"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0"
        style={{ width: sceneWidth, height: sceneHeight, transform: `translate(${panX}px, ${panY}px)` }}>
        {garden?.plots.filter(plot => plot.phase !== "empty" && plot.phase !== "picked").map(plot => {
          const width = plot.size * scale;
          if (!visible(panX + plot.xPct * sceneWidth, panY + plot.yPct * sceneHeight, width)) return null;
          return <div key={plot.plotItemId + "-soil"} className="pointer-events-none absolute"
            style={{
              left: plot.xPct * sceneWidth, top: plot.yPct * sceneHeight,
              width, height: width / 2, transform: "translate(-50%, -50%)", zIndex: 2,
            }}>
            <PetParkTerrainDetail type="garden_plot" tilled />
          </div>;
        })}
        {garden?.plots.map(plot => {
          const imageCrop = garden.crops.find(crop => crop.id === plot.cropId);
          const stage = plot.phase;
          const image = stage !== "empty" && stage !== "tilled" && stage !== "picked"
            ? imageCrop?.images[stage]
            : stage === "picked" ? imageCrop?.images.picked : null;
          if (!image || !visible(panX + plot.xPct * sceneWidth, panY + plot.yPct * sceneHeight, plot.size * scale))
            return null;
          return <PetParkCropArtwork key={plot.plotItemId + ":" + stage}
            image={image} xPct={plot.xPct} yPct={plot.yPct}
            size={plot.size} scale={scale}
            placement={imageCrop?.stagePlacements?.[stage as "planted" | "seedling" | "partial" | "grown" | "picked"]}
            zIndex={parkDepthIndex({ kind: "item", yPct: plot.yPct, worldHeight, size: plot.size })}
            progress={gardenCropProgress(plot, imageCrop)} showWaterProgress={wateringId === plot.plotItemId} />;
        })}
        {garden?.plots.map(plot => {
          const sizePx = plot.size * scale;
          const x = panX + plot.xPct * sceneWidth, y = panY + plot.yPct * sceneHeight;
          if (!visible(x, y, sizePx)) return null;
          return <button key={plot.plotItemId} type="button"
            data-testid={`world-garden-plot-${plot.plotItemId}`}
            aria-label="Open Garden Plot"
            className="pointer-events-auto absolute touch-manipulation"
            style={{
              left: plot.xPct * sceneWidth, top: plot.yPct * sceneHeight,
              width: sizePx, height: sizePx / 2, transform: "translate(-50%, -50%)",
              clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
              zIndex: 9000,
            }}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => { event.stopPropagation(); setSourceId(null); setPlotId(plot.plotItemId); }} />;
        })}
        {waterSources.map(source => {
          const sizePx = source.size * scale;
          if (!visible(panX + source.xPct * sceneWidth, panY + source.yPct * sceneHeight, sizePx)) return null;
          return <button key={source.id} type="button" aria-label="Refill watering pail"
            data-testid={`world-water-source-${source.id}`}
            className="pointer-events-auto absolute touch-manipulation rounded-md"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => { event.stopPropagation(); setPlotId(null); setSourceId(source.id); }}
            style={{
              left: source.xPct * sceneWidth, top: source.yPct * sceneHeight,
              width: sizePx, height: source.kind === "terrain" ? sizePx / 2 : sizePx,
              transform: "translate(-50%, -50%)",
              clipPath: source.kind === "terrain" ?
                "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" : undefined,
              zIndex: 10000,
            }} />;
        })}
      </div>
    </div>
    <div className="pointer-events-none absolute left-3 right-3 top-[78px] z-30 flex justify-center">
      <div className="pointer-events-auto max-w-sm rounded-xl border border-[#c7a65b]/85 bg-[#123022]/95 px-3 py-2 text-center text-[#f7dfa4] shadow-xl">
        <p className="text-[11px] font-semibold">Private Garden Preview</p>
        <p className="mt-1 text-[10px]">
          Uses your real shared seeds, tools, water and inventory. No public world changes.
        </p>
        <button type="button" data-testid="world-garden-preview-done"
          className="mt-2 rounded-md border border-[#d1b777] bg-[#31543b] px-4 py-2 text-xs font-semibold"
          onClick={() => { setPlotId(null); setSourceId(null); onExit(); }}>
          Return to World Editor
        </button>
      </div>
    </div>
    {isError && <div role="alert" className="pointer-events-none absolute inset-x-3 top-[175px] z-30 text-center text-xs text-red-200">
      Unable to load this world's garden. Gardening is disabled.
    </div>}
    {plotId && (selectedPlot && anchor ? <PetParkGardenMenu
      key={selectedPlot.plotItemId} plot={selectedPlot}
      anchor={anchor} crops={garden?.crops ?? []} inventory={inventory}
      inventoryLoading={inventoryLoading}
      actionUrlPrefix={url + "/garden"}
      onClose={() => setPlotId(null)} onChanged={invalidate}
      onWateringState={setWateringId} /> :
      <ViewportModalPortal blocking={false}>
        <div className="pointer-events-none absolute inset-x-3 top-[30%] z-[76] flex justify-center">
          <div role="status" className="pointer-events-auto rounded-lg border border-[#c9a65e] bg-[#143925] p-3 text-xs text-[#f4dda6]">
            {isLoading ? "Checking garden plot…" : "Garden plot is unavailable."}
            <button className="ml-2 underline" onClick={() => setPlotId(null)}>Close</button>
          </div>
        </div>
      </ViewportModalPortal>)}
    {sourceId && <ViewportModalPortal>
      <PetParkWaterRefillPopup key={sourceId} sourceId={sourceId}
        refillPathPrefix={url + "/water-sources"}
        pails={pails} eligiblePails={eligiblePails}
        inventoryLoading={inventoryLoading} reduceMotion={false}
        onClose={() => setSourceId(null)} onRefilled={invalidate} />
    </ViewportModalPortal>}
  </>;
}
