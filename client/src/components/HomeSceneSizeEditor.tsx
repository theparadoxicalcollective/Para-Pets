import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, X, Sparkles, MoonStar, MousePointerClick, Upload } from "lucide-react";
import fallbackHomePreview from "@assets/bg_home_v2.png";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import { readFileAsDataUrl } from "@/lib/utils";
import { HomeInteriorEffectsLayer } from "@/components/HomeInteriorEffect";
import type { HomeCatalogEffect, HouseInteriorEffect } from "@shared/housing";

interface PreviewBundle {
  id: string;
  name: string;
  bgImageUrl: string | null;
}

interface PreviewBuilding {
  id: string;
  interiorImageUrl: string | null;
}

export interface HomeSceneSizeEditorItem {
  id: string;
  name: string;
  imageUrl: string | null;
  homeSceneSize: number;
  homeEffect?: HomeCatalogEffect | null;
  homeTapImageUrl?: string | null;
  homeEffectX?: number;
  homeEffectY?: number;
  homeEffectSize?: number;
}

export function HomeSceneSizeEditor({
  item,
  itemLabel,
  onClose,
  onSave,
  saving,
}: {
  item: HomeSceneSizeEditorItem;
  itemLabel: "Decor" | "Object";
  onClose: () => void;
  onSave: (
    size: number,
    homeEffect: HomeCatalogEffect | null,
    homeTapImageData?: string | null,
    effectTransform?: { x: number; y: number; size: number },
  ) => void;
  saving: boolean;
}) {
  const [size, setSize] = useState(Math.max(60, Math.min(500, item.homeSceneSize || 250)));
  const [homeEffect, setHomeEffect] = useState<HomeCatalogEffect | null>(item.homeEffect ?? null);
  const [effectTransform, setEffectTransform] = useState({
    x: Number.isFinite(item.homeEffectX) ? Number(item.homeEffectX) : 0.5,
    y: Number.isFinite(item.homeEffectY) ? Number(item.homeEffectY) : 0.5,
    size: Number.isFinite(item.homeEffectSize) ? Number(item.homeEffectSize) : 40,
  });
  const [effectEditMode, setEffectEditMode] = useState(false);
  const [tapImageData, setTapImageData] = useState<string | null>(null);
  const [previewTapActive, setPreviewTapActive] = useState(false);
  const [effectGhost, setEffectGhost] = useState<{ x: number; y: number; effect: HomeCatalogEffect } | null>(null);
  const [dropReady, setDropReady] = useState(false);
  const effectTargetRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewDims, setPreviewDims] = useState({ width: 0, height: 0 });
  const effectDragRef = useRef<{ pid: number; startX: number; startY: number; moved: boolean; effect: HomeCatalogEffect } | null>(null);
  const positionedEffectDragRef = useRef<{ pid: number; startX: number; startY: number; startEffectX: number; startEffectY: number } | null>(null);
  const effectSuppressClickRef = useRef(false);

  useEffect(() => {
    setSize(Math.max(60, Math.min(500, item.homeSceneSize || 250)));
    setHomeEffect(item.homeEffect ?? null);
    setEffectTransform({
      x: Number.isFinite(item.homeEffectX) ? Number(item.homeEffectX) : 0.5,
      y: Number.isFinite(item.homeEffectY) ? Number(item.homeEffectY) : 0.5,
      size: Number.isFinite(item.homeEffectSize) ? Number(item.homeEffectSize) : 40,
    });
    setEffectEditMode(false);
    setTapImageData(null);
    setPreviewTapActive(false);
    setEffectGhost(null);
    setDropReady(false);
    effectDragRef.current = null;
  }, [item.id, item.homeSceneSize, item.homeEffect, item.homeTapImageUrl, item.homeEffectX, item.homeEffectY, item.homeEffectSize]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const recalc = () => setPreviewDims({ width: preview.clientWidth, height: preview.clientHeight });
    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  const { data: bundles = [] } = useQuery<PreviewBundle[]>({
    queryKey: ["/api/admin/house-bundles"],
    staleTime: 0,
  });
  const fallBundle = bundles.find(bundle => /fall/i.test(bundle.name)) ?? null;

  const { data: fallBuildings = [] } = useQuery<PreviewBuilding[]>({
    queryKey: ["/api/admin/house-bundles", fallBundle?.id ?? "", "buildings", "size-preview"],
    queryFn: async () => {
      if (!fallBundle) return [];
      const res = await fetch(`/api/admin/house-bundles/${fallBundle.id}/buildings`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!fallBundle,
    staleTime: 0,
  });

  const previewBackground =
    fallBuildings.find(building => !!building.interiorImageUrl)?.interiorImageUrl
    ?? fallBundle?.bgImageUrl
    ?? fallbackHomePreview;

  const previewY = 0.72;
  const displaySize = size;
  const effectiveTapImage = tapImageData ?? item.homeTapImageUrl ?? null;
  const displayedItemImage = homeEffect === "tap" && previewTapActive && effectiveTapImage
    ? effectiveTapImage
    : item.imageUrl;
  const effectOptions: { effect: HomeCatalogEffect; label: string; description: string }[] = itemLabel === "Object"
    ? [
        { effect: "lamp_light", label: "Lamp Light", description: "Tap the placed Object to turn its attached lamp glow on or off." },
        { effect: "tap", label: "Tap Image", description: "Tap the placed Object to swap between its normal image and an alternate image." },
      ]
    : [
        { effect: "sleep", label: "Sleep Spot", description: "Drag a pet onto the Decor to activate its sleep spot." },
        { effect: "lamp_light", label: "Lamp Light", description: "Tap the placed Decor to turn its attached lamp glow on or off." },
      ];
  const selectedEffectLabel = effectOptions.find(option => option.effect === homeEffect)?.label ?? null;

  const spatialEffectType = homeEffect === "lamp_light" ? "lamp_light" : homeEffect === "sleep" ? "sleep" : null;
  const previewEffect: HouseInteriorEffect[] = spatialEffectType && previewDims.width > 0 && previewDims.height > 0
    ? [{
        id: "home-item-editor-effect",
        type: spatialEffectType,
        x: Math.max(0, Math.min(1, (previewDims.width / 2 + (effectTransform.x - 0.5) * size) / previewDims.width)),
        y: Math.max(0, Math.min(1, (previewY * previewDims.height + (effectTransform.y - 0.5) * size) / previewDims.height)),
        size: Math.max(4, Math.min(40, (size * effectTransform.size / 100 / previewDims.height) * 100)),
      }]
    : [];

  const changeSize = (next: number) => {
    setSize(Math.max(60, Math.min(500, Math.round(next))));
  };

  const pointInsideTarget = (clientX: number, clientY: number) => {
    const rect = effectTargetRef.current?.getBoundingClientRect();
    return !!rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const beginEffectDrag = (event: ReactPointerEvent<HTMLButtonElement>, effect: HomeCatalogEffect) => {
    event.preventDefault();
    event.stopPropagation();
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    effectDragRef.current = { pid: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, effect };
    setEffectGhost({ x: event.clientX, y: event.clientY, effect });
    setDropReady(pointInsideTarget(event.clientX, event.clientY));
  };

  const moveEffectDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = effectDragRef.current;
    if (!drag || drag.pid !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moved = true;
    setEffectGhost({ x: event.clientX, y: event.clientY, effect: drag.effect });
    setDropReady(pointInsideTarget(event.clientX, event.clientY));
  };

  const endEffectDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = effectDragRef.current;
    effectDragRef.current = null;
    if (drag?.pid === event.pointerId && event.type === "pointerup" && pointInsideTarget(event.clientX, event.clientY)) {
      setHomeEffect(drag.effect);
      setPreviewTapActive(false);
      if (drag.effect === "lamp_light" || drag.effect === "sleep") setEffectEditMode(true);
    }
    if (drag?.moved) {
      effectSuppressClickRef.current = true;
      window.setTimeout(() => { effectSuppressClickRef.current = false; }, 0);
    }
    setEffectGhost(null);
    setDropReady(false);
  };

  const onPositionedEffectDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    positionedEffectDragRef.current = {
      pid: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startEffectX: effectTransform.x,
      startEffectY: effectTransform.y,
    };
  };

  const onPositionedEffectMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = positionedEffectDragRef.current;
    if (!drag || drag.pid !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const itemSize = Math.max(1, size);
    setEffectTransform(current => ({
      ...current,
      x: Math.max(-0.5, Math.min(1.5, drag.startEffectX + (event.clientX - drag.startX) / itemSize)),
      y: Math.max(-0.5, Math.min(1.5, drag.startEffectY + (event.clientY - drag.startY) / itemSize)),
    }));
  };

  const onPositionedEffectUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (positionedEffectDragRef.current?.pid === event.pointerId) positionedEffectDragRef.current = null;
  };

  const onPositionedEffectCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const drag = positionedEffectDragRef.current;
    if (!drag || drag.pid !== event.pointerId) return;
    positionedEffectDragRef.current = null;
    setEffectTransform(current => ({ ...current, x: drag.startEffectX, y: drag.startEffectY }));
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col"
      style={{ maxWidth: 768, margin: "0 auto", left: 0, right: 0, background: "#07090f" }}
      data-testid="home-scene-size-editor"
    >
      <div
        className="flex items-center justify-between px-4 pb-3"
        style={{
          paddingTop: "max(16px, calc(env(safe-area-inset-top, 0px) + 12px))",
          background: "rgba(7,10,6,0.985)",
          borderBottom: "1px solid rgba(255,215,0,0.34)",
          boxShadow: "0 8px 22px rgba(0,0,0,0.34)",
        }}
      >
        <div>
          <p className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "rgba(255,225,95,0.82)", textShadow: "0 1px 5px rgba(0,0,0,0.95)" }}>
            Fall Home size preview
          </p>
          <p className="font-fantasy text-base tracking-wide" style={{ color: "#ffe34f", textShadow: "0 1px 7px rgba(0,0,0,0.95)" }}>
            {item.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff" }}
          aria-label="Close size editor"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={previewRef} className="relative flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        <img
          src={previewBackground}
          alt="Fall Home interior preview"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.22))" }} />
        <div
          className="absolute left-0 right-0 border-t border-dashed"
          style={{ top: `${previewY * 100}%`, borderColor: "rgba(255,215,0,0.22)" }}
        />
        <div
          ref={effectTargetRef}
          data-testid="home-scene-effect-drop-target"
          data-home-effect={homeEffect ?? undefined}
          className="absolute flex items-center justify-center"
          style={{
            left: "50%",
            top: `${previewY * 100}%`,
            width: displaySize,
            height: displaySize,
            transform: "translate(-50%, -50%)",
            borderRadius: 18,
            outline: dropReady ? "3px solid rgba(255,215,0,.95)" : homeEffect ? "1.5px dashed rgba(255,215,0,.58)" : "none",
            outlineOffset: 7,
            boxShadow: dropReady ? "0 0 28px rgba(255,215,0,.55)" : "none",
            transition: "outline 120ms ease, box-shadow 120ms ease",
          }}
        >
          {displayedItemImage ? (
            <img
              src={displayedItemImage}
              alt={item.name}
              className="relative w-full h-full object-contain pointer-events-none"
              draggable={false}
              style={{ filter: "drop-shadow(0 5px 12px rgba(0,0,0,0.55))" }}
            />
          ) : (
            <div
              className="relative w-full h-full rounded-xl flex items-center justify-center font-fantasy"
              style={{ background: "rgba(0,0,0,0.45)", border: "1px dashed rgba(255,215,0,0.5)", color: "#ffd700" }}
            >
              {itemLabel}
            </div>
          )}
          {homeEffect && (
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-1 font-fantasy text-[8px] whitespace-nowrap"
              style={{ bottom: -30, background: "rgba(5,10,6,.9)", border: "1px solid rgba(255,215,0,.42)", color: "#ffe98f" }}
            >
              {selectedEffectLabel} attached
            </div>
          )}
        </div>

        {previewEffect.length > 0 && (
          <HomeInteriorEffectsLayer
            effects={previewEffect}
            panX={0}
            imgWidth={previewDims.width}
            sceneHeight={previewDims.height}
            selectedId={effectEditMode ? "home-item-editor-effect" : null}
            interactive={effectEditMode}
            onEffectPointerDown={effectEditMode ? onPositionedEffectDown : undefined}
            onEffectPointerMove={effectEditMode ? onPositionedEffectMove : undefined}
            onEffectPointerUp={effectEditMode ? onPositionedEffectUp : undefined}
            onEffectPointerCancel={effectEditMode ? onPositionedEffectCancel : undefined}
            zIndex={18}
          />
        )}

        <div
          className="absolute left-3 bottom-3 rounded-lg px-2 py-1 font-fantasy text-[8px]"
          style={{ background: "rgba(0,0,0,0.62)", color: "rgba(255,255,255,0.72)" }}
        >
          Admin starting size preview
        </div>
      </div>

      {!effectEditMode && <div
        className="px-4 pt-4 pb-5 flex flex-col gap-3 overflow-y-auto"
        style={{ background: "rgba(10,12,8,0.98)", borderTop: "1px solid rgba(255,215,0,0.22)", maxHeight: "52dvh" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-fantasy text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>{itemLabel} base size</p>
            <p className="font-fantasy text-lg" style={{ color: "#ffd700" }}>{size}px</p>
          </div>
          <p className="font-fantasy text-[9px] text-right max-w-[190px]" style={{ color: "rgba(255,255,255,0.38)" }}>
            Players start at this size. They can make it smaller, or increase it up to 10px above this Admin size.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="button-home-scene-size-minus"
            onClick={() => changeSize(size - 10)}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,215,0,0.10)", border: "1px solid rgba(255,215,0,0.28)", color: "#ffd700" }}
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            data-testid="input-home-scene-size"
            type="range"
            min={60}
            max={500}
            step={5}
            value={size}
            onChange={event => changeSize(Number(event.target.value))}
            className="flex-1"
          />
          <button
            type="button"
            data-testid="button-home-scene-size-plus"
            onClick={() => changeSize(size + 10)}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,215,0,0.10)", border: "1px solid rgba(255,215,0,0.28)", color: "#ffd700" }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div
          className="rounded-xl p-3"
          style={{ background: "rgba(255,215,0,.045)", border: "1px solid rgba(255,215,0,.16)" }}
          data-testid="home-item-effect-menu"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "#ffd700" }}>{itemLabel} Effect</p>
              <p className="font-fantasy text-[8px] mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,.42)" }}>
                {itemLabel === "Object"
                  ? "Choose Lamp Light or Tap Image. A normal player tap activates the saved Object effect while dragging still moves the item."
                  : "Choose Sleep Spot or Lamp Light. Sleep Spot activates when a pet is dragged onto the Decor; Lamp Light toggles with a normal tap."}
              </p>
            </div>
            {homeEffect && (
              <button
                type="button"
                data-testid="button-clear-home-item-effect"
                onClick={() => { setHomeEffect(null); setEffectEditMode(false); }}
                className="rounded-full px-2.5 py-1.5 font-fantasy text-[8px]"
                style={{ background: "rgba(145,25,25,.28)", border: "1px solid rgba(255,100,100,.32)", color: "#ffabab" }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {effectOptions.map(option => (
              <button
                key={option.effect}
                type="button"
                data-testid={option.effect === "lamp_light" ? "effect-chip-lamp-light" : option.effect === "tap" ? "effect-chip-tap-image" : "effect-chip-sleep-spot"}
                onPointerDown={event => beginEffectDrag(event, option.effect)}
                onPointerMove={moveEffectDrag}
                onPointerUp={endEffectDrag}
                onPointerCancel={endEffectDrag}
                onLostPointerCapture={endEffectDrag}
                onClick={() => {
                  if (effectSuppressClickRef.current) return;
                  setHomeEffect(option.effect);
                  setPreviewTapActive(false);
                  if (option.effect === "lamp_light" || option.effect === "sleep") setEffectEditMode(true);
                }}
                className="w-full rounded-xl px-3 py-2.5 flex items-center justify-center gap-2 font-fantasy text-[10px]"
                style={{
                  background: homeEffect === option.effect ? "rgba(255,215,0,.16)" : "rgba(255,255,255,.035)",
                  border: `1px solid ${homeEffect === option.effect ? "rgba(255,215,0,.5)" : "rgba(255,215,0,.2)"}`,
                  color: "#ffe98f",
                  touchAction: "none",
                  cursor: "grab",
                }}
                title={option.description}
              >
                {option.effect === "lamp_light" ? <Sparkles className="w-4 h-4" /> : option.effect === "tap" ? <MousePointerClick className="w-4 h-4" /> : <MoonStar className="w-4 h-4" />}
                {option.label}
                <span style={{ color: "rgba(255,255,255,.32)", fontSize: 8 }}>drag onto preview</span>
              </button>
            ))}
          </div>

          {spatialEffectType && homeEffect && (
            <button
              type="button"
              data-testid="button-position-home-item-effect"
              onClick={() => setEffectEditMode(true)}
              className="w-full mt-2 rounded-xl px-3 py-2 font-fantasy text-[9px]"
              style={{ background: "rgba(80,150,80,.12)", border: "1px solid rgba(120,220,120,.28)", color: "#b7f5bd" }}
            >
              Position / Resize {selectedEffectLabel}
            </button>
          )}

          {itemLabel === "Object" && homeEffect === "tap" && (
            <div
              className="mt-3 rounded-xl p-3"
              data-testid="tap-image-upload-panel"
              style={{ background: "rgba(0,0,0,.2)", border: "1px solid rgba(255,215,0,.16)" }}
            >
              <p className="font-fantasy text-[9px]" style={{ color: "#ffe98f" }}>Alternate Tap Image</p>
              <p className="font-fantasy text-[8px] mt-1 mb-2 leading-relaxed" style={{ color: "rgba(255,255,255,.4)" }}>
                This replaces the normal Object artwork while that placed copy is tapped on. Tap it again to return to the normal image.
              </p>
              {effectiveTapImage ? (
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,215,0,.25)" }}>
                    <img src={effectiveTapImage} alt="Tap state preview" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <label
                      data-testid="button-replace-tap-image"
                      className="rounded-xl px-3 py-2 text-center font-fantasy text-[8px]"
                      style={{ border: "1px solid rgba(255,215,0,.3)", background: "rgba(255,215,0,.08)", color: "#ffe98f", cursor: "pointer" }}
                    >
                      <Upload className="w-3.5 h-3.5 inline mr-1.5" />Replace Image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif"
                        className="hidden"
                        onChange={async event => {
                          const file = event.target.files?.[0];
                          if (file) setTapImageData(await readFileAsDataUrl(file));
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      data-testid="button-preview-tap-state"
                      onClick={() => setPreviewTapActive(current => !current)}
                      className="rounded-xl px-3 py-2 font-fantasy text-[8px]"
                      style={{ border: "1px solid rgba(255,215,0,.3)", background: previewTapActive ? "rgba(255,215,0,.15)" : "rgba(255,255,255,.035)", color: "#ffe98f" }}
                    >
                      {previewTapActive ? "Show Normal Image" : "Preview Tapped Image"}
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  data-testid="button-upload-tap-image"
                  className="block w-full rounded-xl px-3 py-3 text-center font-fantasy text-[9px]"
                  style={{ border: "1px dashed rgba(255,215,0,.38)", background: "rgba(255,215,0,.06)", color: "#ffe98f", cursor: "pointer" }}
                >
                  <Upload className="w-4 h-4 inline mr-2" />Upload Tap Image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    className="hidden"
                    onChange={async event => {
                      const file = event.target.files?.[0];
                      if (file) setTapImageData(await readFileAsDataUrl(file));
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
              {!effectiveTapImage && (
                <p className="font-fantasy text-[8px] mt-2" style={{ color: "#ffb2a7" }}>
                  A Tap Image is required before this effect can be saved.
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          data-testid="button-save-home-scene-size"
          onClick={() => onSave(
            size,
            homeEffect,
            homeEffect === "tap" ? tapImageData : null,
            { x: effectTransform.x, y: effectTransform.y, size: effectTransform.size },
          )}
          disabled={saving || (homeEffect === "tap" && !effectiveTapImage)}
          className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest disabled:opacity-50"
          style={{ background: "rgba(255,215,0,0.16)", border: "1px solid rgba(255,215,0,0.42)", color: "#ffd700" }}
        >
          {saving ? "Saving..." : `Save ${itemLabel} Settings`}
        </button>
      </div>}

      {effectEditMode && spatialEffectType && (
        <div
          data-testid="home-item-effect-position-controls"
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-2xl px-3 py-2"
          style={{
            zIndex: 60,
            bottom: "max(18px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
            background: "rgba(5,9,6,.94)",
            border: "1px solid rgba(255,215,0,.46)",
            boxShadow: "0 10px 28px rgba(0,0,0,.68)",
          }}
          onPointerDown={event => event.stopPropagation()}
        >
          <span className="font-fantasy text-[9px] max-w-[82px]" style={{ color: "#ffe98f" }}>{selectedEffectLabel}</span>
          <button
            type="button"
            aria-label="Make attached effect smaller"
            onClick={() => setEffectTransform(current => ({ ...current, size: Math.max(10, current.size - 10) }))}
            className="w-9 h-9 rounded-full"
            style={{ background: "rgba(255,215,0,.1)", border: "1px solid rgba(255,215,0,.34)", color: "#ffd700" }}
          ><Minus className="w-4 h-4 mx-auto" /></button>
          <button
            type="button"
            aria-label="Make attached effect larger"
            onClick={() => setEffectTransform(current => ({ ...current, size: Math.min(220, current.size + 10) }))}
            className="w-9 h-9 rounded-full"
            style={{ background: "rgba(255,215,0,.1)", border: "1px solid rgba(255,215,0,.34)", color: "#ffd700" }}
          ><Plus className="w-4 h-4 mx-auto" /></button>
          <button
            type="button"
            data-testid="button-done-positioning-home-effect"
            onClick={() => setEffectEditMode(false)}
            className="rounded-full px-4 h-9 font-fantasy text-[9px]"
            style={{ background: "rgba(80,150,80,.18)", border: "1px solid rgba(120,220,120,.35)", color: "#b7f5bd" }}
          >Done</button>
        </div>
      )}

      {effectGhost && (
        <div
          aria-hidden
          className="fixed pointer-events-none rounded-full px-3 py-2 font-fantasy text-[9px]"
          style={{
            zIndex: 9999,
            left: effectGhost.x,
            top: effectGhost.y,
            transform: "translate(-50%, -50%)",
            background: "rgba(7,12,7,.94)",
            border: "1px solid rgba(255,215,0,.58)",
            color: "#ffe98f",
            boxShadow: "0 0 18px rgba(255,215,0,.32)",
          }}
        >
          {effectOptions.find(option => option.effect === effectGhost.effect)?.label ?? "Effect"}
        </div>
      )}
    </div>
  );
}
