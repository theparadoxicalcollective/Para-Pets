import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetParkTerrain from "@/components/PetParkTerrain";
import { parkCameraGeometry, parkClampCamera, parkClampZoom, parkZoomAnchorPan } from "@/lib/petParkCamera";
import { PET_PARK_GROUND_THEMES, PET_PARK_MAX_GROUND_LEVEL } from "@shared/petParkGround";
import { getWorldDefinition } from "@shared/worlds/worldRegistry";
import {
  defaultWorldSceneDraft, isEditableWorldSceneId,
  type WorldSceneDraft, type WorldSceneDraftSettings,
} from "@shared/worlds/worldSceneDraft";

/**
 * Independent admin World Editor foundation.
 * Uses the existing low-level terrain visualization, NOT the Pet Park editor,
 * park routes, pet population, deposits, building occupancy or reward systems.
 * Scene objects, painting and interiors are deliberately reserved for PR 2.
 */
export default function WorldSceneEditorPage({ worldId }: { worldId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const cache = useQueryClient();
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [edited, setEdited] = useState<WorldSceneDraftSettings | null>(null);
  const known = isEditableWorldSceneId(worldId);
  const world = getWorldDefinition(worldId);
  const queryKey = ["/api/admin/world-editor", worldId, "draft"];

  const draft = useQuery<WorldSceneDraft>({
    queryKey,
    enabled: known,
    queryFn: async () => {
      const response = await fetch(`/api/admin/world-editor/${worldId}/draft`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load the private world draft");
      return response.json();
    },
    refetchOnMount: true,
  });
  const initial = known ? defaultWorldSceneDraft(worldId) : null;
  const settings = edited ?? draft.data ?? initial;
  const groundLevel = settings?.groundLevel ?? 1;
  const groundTheme = settings?.groundTheme ?? "grass";

  useEffect(() => {
    setEdited(null);
    setPan(null);
    setZoom(1);
  }, [worldId]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [known, draft.isLoading]);

  const camera = parkCameraGeometry(size.width, size.height, groundLevel, zoom);
  const initialPan = { x: -camera.limitX / 2, y: -camera.limitY / 2 };
  const actualPan = parkClampCamera(pan ?? initialPan, camera);

  const save = useMutation({
    mutationFn: async (payload: WorldSceneDraftSettings) => {
      const response = await apiRequest("PUT", `/api/admin/world-editor/${worldId}/draft`, payload);
      return response.json() as Promise<WorldSceneDraft>;
    },
    onSuccess: (result) => {
      cache.setQueryData(queryKey, result);
      setEdited(null);
      toast({ title: "World draft saved", description: "Players still use the original world." });
    },
    onError: (error: Error) => toast({
      title: "Unable to save draft", description: error.message, variant: "destructive",
    }),
  });

  const changeLevel = (next: number) => {
    if (next < 1 || next > PET_PARK_MAX_GROUND_LEVEL || !settings) return;
    setEdited({ groundLevel: next, groundTheme });
    setPan(null);
  };

  const changeZoom = (amount: number) => {
    const next = parkClampZoom(Math.round((zoom + amount) * 100) / 100);
    const nextCamera = parkCameraGeometry(size.width, size.height, groundLevel, next);
    const nextPan = parkZoomAnchorPan(actualPan, camera.scale, nextCamera.scale,
      { x: size.width / 2, y: size.height / 2 }, nextCamera);
    setPan(nextPan);
    setZoom(next);
  };

  if (!world || !initial) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#101b16] text-[#e8d8ac]">
        <button type="button" onClick={() => navigate("/map")}>Unknown world — return to map</button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#101b16] text-[#f3e5c5]" data-testid="world-scene-editor">
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden"
        style={{ touchAction: "none", cursor: drag.current ? "grabbing" : "grab" }}
        data-testid="world-scene-draft-viewport"
        onPointerDown={(event) => {
          if (event.button !== 0 && event.pointerType === "mouse") return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
            panX: actualPan.x, panY: actualPan.y };
        }}
        onPointerMove={(event) => {
          if (!drag.current || drag.current.id !== event.pointerId) return;
          setPan(parkClampCamera({
            x: drag.current.panX + event.clientX - drag.current.x,
            y: drag.current.panY + event.clientY - drag.current.y,
          }, camera));
        }}
        onPointerUp={(event) => {
          if (drag.current?.id === event.pointerId) drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <PetParkTerrain
          groundTheme={groundTheme}
          viewportWidth={size.width}
          viewportHeight={size.height}
          worldWidth={camera.worldWidth}
          worldHeight={camera.worldHeight}
          scale={camera.scale}
          panX={actualPan.x}
          panY={actualPan.y}
        />
      </div>

      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-3 py-3"
        style={{ background: "linear-gradient(180deg, rgba(10,25,18,.97), rgba(10,25,18,.7))",
          borderBottom: "1px solid rgba(211,174,86,.45)" }}>
        <button type="button" onClick={() => navigate("/map")}
          className="rounded-lg border border-[#9b8246] px-3 py-2 text-xs font-semibold"
          data-testid="button-world-draft-back">Back</button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold tracking-wide">{world.defaultName} — New World Edit</h1>
          <p className="text-[10px] text-[#d5c58e]">Admin-only draft · Original world stays live</p>
        </div>
      </header>

      <section className="absolute z-20 bottom-3 inset-x-3 mx-auto max-w-md rounded-xl border border-[#846b32] p-3 shadow-xl"
        style={{ background: "rgba(13,31,22,.96)" }} aria-label="Draft world settings">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-xs font-semibold tracking-wide">World Terrain</h2>
          <span className="text-[10px] text-[#d5c58e]">
            {draft.data?.hasSavedDraft ? "Saved draft" : "New draft"}
          </span>
        </div>
        {draft.isLoading ? <p className="text-xs">Loading private draft...</p> :
          draft.isError ? <p role="alert" className="text-xs text-[#ffc5ac]">Could not load draft. Changes are disabled.</p> : (
          <>
            <label htmlFor="world-draft-ground-theme" className="block text-[11px] mb-1">Ground theme</label>
            <select
              id="world-draft-ground-theme"
              value={groundTheme}
              data-testid="select-world-draft-ground-theme"
              onChange={(event) => setEdited({ groundLevel,
                groundTheme: event.target.value as WorldSceneDraftSettings["groundTheme"] })}
              className="w-full rounded-md border border-[#846b32] bg-[#193026] px-2 py-2 text-xs mb-2"
            >
              {PET_PARK_GROUND_THEMES.map(theme =>
                <option key={theme.type} value={theme.type}>{theme.label}</option>)}
            </select>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex-1 text-[11px]">Ground size: {groundLevel} / {PET_PARK_MAX_GROUND_LEVEL}</span>
              <button type="button" className="rounded-md border border-[#846b32] px-3 py-1.5 text-sm"
                disabled={groundLevel <= 1} onClick={() => changeLevel(groundLevel - 1)}
                aria-label="Shrink draft ground">−</button>
              <button type="button" className="rounded-md border border-[#846b32] px-3 py-1.5 text-sm"
                disabled={groundLevel >= PET_PARK_MAX_GROUND_LEVEL}
                onClick={() => changeLevel(groundLevel + 1)} aria-label="Expand draft ground">+</button>
            </div>
            <button type="button" disabled={!edited || save.isPending}
              data-testid="button-save-world-draft"
              className="w-full rounded-md border border-[#d3ae56] bg-[#355239] p-2 text-xs font-semibold disabled:opacity-50"
              onClick={() => save.mutate({ groundLevel, groundTheme })}>
              {save.isPending ? "Saving..." : "Save World Draft"}
            </button>
          </>
        )}
        <p className="mt-2 text-center text-[10px] text-[#c7b98d]">
          Terrain preview and private settings only in PR 1. Decorations, buildings and gardening follow.
        </p>
      </section>

      <div className="absolute z-10 right-3 top-20 flex flex-col gap-1">
        <button type="button" className="w-9 h-9 rounded-md border border-[#a48d58] bg-[#14271d] text-lg"
          onClick={() => changeZoom(0.15)} aria-label="Zoom in">+</button>
        <button type="button" className="w-9 h-9 rounded-md border border-[#a48d58] bg-[#14271d] text-lg"
          onClick={() => changeZoom(-0.15)} aria-label="Zoom out">−</button>
      </div>
    </div>
  );
}
