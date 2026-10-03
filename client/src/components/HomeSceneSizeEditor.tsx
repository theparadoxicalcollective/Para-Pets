import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, X, Sparkles, MoonStar, MousePointerClick, Upload } from "lucide-react";
import fallbackHomePreview from "@assets/bg_home_v2.png";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import { readFileAsDataUrl } from "@/lib/utils";
import type { HomeCatalogEffect } from "@shared/housing";

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
  onSave: (size: number, homeEffect: HomeCatalogEffect | null, homeTapImageData?: string | null) => void;
  saving: boolean;
}) {
  const [size, setSize] = useState(Math.max(60, Math.min(500, item.homeSceneSize || 250)));
  const [homeEffect, setHomeEffect] = useState<HomeCatalogEffect | null>(item.homeEffect ?? null);
  const [tapImageData, setTapImageData] = useState<string | null>(null);
  const [previewTapActive, setPreviewTapActive] = useState(false);
  const [effectGhost, setEffectGhost] = useState<{ x: number; y: number; effect: HomeCatalogEffect } | null>(null);
  const [dropReady, setDropReady] = useState(false);
  const effectTargetRef = useRef<HTMLDivElement>(null);
  const effectDragRef = useRef<{ pid: number; startX: number; startY: number; moved: boolean; effect: HomeCatalogEffect } | null>(null);
  const effectSuppressClickRef = useRef(false);

  useEffect(() => {
    setSize(Math.max(60, Math.min(500, item.homeSceneSize || 250)));
    setHomeEffect(item.homeEffect ?? null);
    setTapImageData(null);
    setPreviewTapActive(false);
    setEffectGhost(null);
    setDropReady(false);
    effectDragRef.current = null;
  }, [item.id, item.homeSceneSize, item.homeEffect, item.homeTapImageUrl]);

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
    }
    if (drag?.moved) {
      effectSuppressClickRef.current = true;
      window.setTimeout(() => { effectSuppressClickRef.current = false; }, 0);
    }
    setEffectGhost(null);
    setDropReady(false);
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

      <div className="relative flex-1 overflow-hidden" style={{ minHeight: 0 }}>
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
          {homeEffect === "lamp_light" && (
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                width: "82%",
                height: "105%",
                top: "-20%",
                borderRadius: "48% 48% 58% 58% / 38% 38% 68% 68%",
                background: "radial-gradient(ellipse at 50% 38%, rgba(255,245,190,.38), rgba(255,202,90,.18) 38%, transparent 76%)",
                filter: "blur(5px)",
                mixBlendMode: "screen",
              }}
            />
          )}
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
          {homeEffect === "sleep" && (
            <div
              aria-hidden
              className="absolute right-[12%] top-[10%] font-fantasy"
              style={{ color: "#fff2bf", fontSize: Math.max(18, Math.min(42, size * 0.13)), textShadow: "0 0 8px rgba(255,220,120,.85), 0 2px 4px #000" }}
            >
              Z
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
        <div
          className="absolute left-3 bottom-3 rounded-lg px-2 py-1 font-fantasy text-[8px]"
          style={{ background: "rgba(0,0,0,0.62)", color: "rgba(255,255,255,0.72)" }}
        >
          Admin starting size preview
        </div>
      </div>

      <div
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
                onClick={() => setHomeEffect(null)}
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
          onClick={() => onSave(size, homeEffect, homeEffect === "tap" ? tapImageData : null)}
          disabled={saving || (homeEffect === "tap" && !effectiveTapImage)}
          className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest disabled:opacity-50"
          style={{ background: "rgba(255,215,0,0.16)", border: "1px solid rgba(255,215,0,0.42)", color: "#ffd700" }}
        >
          {saving ? "Saving..." : `Save ${itemLabel} Settings`}
        </button>
      </div>

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
