import { useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePetPagePlacement, usePetPresentation } from "@/lib/petPresentation";
import { petTemplateQuery } from "@/lib/petTemplateQuery";
import { getPetPlacementTransform, getPetSpotPosition, getStablePetGroundPoint, PET_SPOT } from "@/lib/petGroundPlacement";
import { normalizePetParts } from "@/lib/petRenderSafety";
import { calculateArtworkTransform, dragArtworkPercentOffset } from "@/lib/artworkViewportTransform";
import type { PetPageKey, PetPagePlacement } from "@shared/petPagePlacement";

/**
 * The original Active Pet oval contract, reused by subpages:
 * the pet's saved presentation locates its authored feet against PET_SPOT,
 * while each page saves only where that SAME spot sits over its background.
 * A movable rectangle is not a second source of pet placement.
 */
export default function PetPageOvalPlacement({
  page, admin, petTemplateId, petInventoryId, children, externallyPositioned = false,
  sceneRef, onPreview,
}: {
  page: PetPageKey;
  admin: boolean;
  petTemplateId?: string | null;
  petInventoryId?: string | null;
  children: ReactNode;
  /** For Power-Up: the orbit, platform, nodes and pet all move as ONE scene. */
  externallyPositioned?: boolean;
  sceneRef?: RefObject<HTMLElement | null>;
  onPreview?: (placement: PetPagePlacement | null) => void;
}) {
  const query = usePetPagePlacement(page);
  const { data: equipped } = useQuery<{ isEvolved?: boolean }>({
    queryKey: ["/api/pet", petInventoryId, "costumes", "owner"],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/pet/${petInventoryId}/costumes`, { credentials: "include", signal });
      if (!response.ok) throw new Error("Could not load pet evolution form");
      return response.json();
    },
    enabled: !!petInventoryId && !!petTemplateId,
    staleTime: 30_000,
  });
  const formReady = !petInventoryId || !!equipped;
  const form = equipped?.isEvolved ? "evolution" : "base";
  const { data: template } = useQuery({
    ...petTemplateQuery(petTemplateId ?? "", form),
    enabled: !!petTemplateId && formReady,
  });
  const view = template?.facing === "back" ||
    (template?.parts?.length && !template.parts.some((p: { view?: string }) => p.view === "front")) ? "back" : "front";
  const presentation = usePetPresentation(petTemplateId ?? "", form, view, !!template && formReady);
  const parts = normalizePetParts(template?.parts).filter(p => p.view === view);
  const ground = getStablePetGroundPoint(parts);
  const [draft, setDraft] = useState<PetPagePlacement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: PetPagePlacement; latest: PetPagePlacement } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const location = draft ?? query.placement;
  // The external Power-Up scene already owns the offset/scale for its node orbit.
  const anchor = externallyPositioned ? { x: 0, y: 0 } : { x: location.x, y: location.y };
  const spot = getPetSpotPosition(anchor);
  const petValue = {
    ...presentation.placement,
    scale: presentation.placement.scale * (externallyPositioned ? 1 : location.scale),
  };
  const petTransform = getPetPlacementTransform(ground, petValue, anchor);

  const update = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    event.stopPropagation();
    const reference = (externallyPositioned && sceneRef?.current) || stage.current;
    const bounds = reference?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    // The oval is saved in artwork percentages, not device pixels. This
    // displayed plane uses the same bounds for artwork and viewport today;
    // the shared converter also supports cropped/letterboxed backgrounds as
    // each page migrates off the legacy stage.
    const size = { width: bounds.width, height: bounds.height };
    const transform = calculateArtworkTransform(size, size);
    const moved = dragArtworkPercentOffset(
      start.start,
      { x: start.x, y: start.y },
      { x: event.clientX, y: event.clientY },
      transform,
    );
    const next = { ...moved, x: +moved.x.toFixed(2), y: +moved.y.toFixed(2) };
    start.latest = next;
    setDraft(next);
    onPreview?.(next);
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    if (cancelled) {
      setDraft(null);
      onPreview?.(null);
      return;
    }
    if (start.latest.x !== start.start.x || start.latest.y !== start.start.y) {
      query.save.mutate(start.latest, {
        onSuccess: () => { setDraft(null); onPreview?.(null); },
      });
    }
  };
  return <div ref={stage} data-testid={`pet-page-oval-${page}`} style={{ position: "relative", width: "100%", height: "100%" }}>
    <div data-testid={`pet-page-grounded-art-${page}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...petTransform, pointerEvents: "none" }}>{children}</div>
    {admin && <div
      role="button" tabIndex={0} aria-label={`Move whole pet on its ${page} ground oval`}
      data-testid={`pet-page-placement-guide-${page}`}
      title="Drag this oval to place the pet"
      onClick={event => event.stopPropagation()}
      onPointerDown={event => {
        event.stopPropagation();
        if (query.isPending || query.isError || query.save.isPending) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: location, latest: location };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={update}
      onPointerUp={event => finish(event)}
      onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={event => finish(event, true)}
      onKeyDown={event => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta || query.isPending || query.isError || query.save.isPending) return;
        event.preventDefault(); event.stopPropagation();
        const next = { ...location, x: Math.max(-100, Math.min(100, location.x + delta[0])), y: Math.max(-100, Math.min(100, location.y + delta[1])) };
        query.save.mutate(next, { onSuccess: () => { setDraft(null); onPreview?.(null); } });
      }}
      style={{
        position: "absolute", left: `${spot.x}%`, top: `${spot.y}%`,
        width: `${PET_SPOT.widthPercent}%`, aspectRatio: "7 / 1",
        transform: "translate(-50%, -50%)", borderRadius: "50%",
        border: "2px dashed #ffe29a", background: "rgba(240,192,64,.18)",
        boxShadow: "0 0 0 1px #201506, 0 0 12px #000",
        cursor: "grab", touchAction: "none", pointerEvents: "auto", zIndex: 20,
      }}
    />}
    {admin && (query.isError || query.save.isError) && <span role="alert" style={{ position: "absolute", top: "97%", left: "5%", color: "#ffe29a", background: "#201506", fontSize: 11, zIndex: 21 }}>Oval position could not be saved</span>}
  </div>;
}
