import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, X, Sparkles, MoonStar } from "lucide-react";
import fallbackHomePreview from "@assets/bg_home_v2.png";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
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
  onSave: (size: number, homeEffect: HomeCatalogEffect | null) => void;
  saving: boolean;
}) {
  const [size, setSize] = useState(Math.max(60, Math.min(500, item.homeSceneSize || 250)));
  const [homeEffect, setHomeEffect] = useState<HomeCatalogEffect | null>(item.homeEffect ?? null);
  const [effectGhost, setEffectGhost] = useState<{ x: number; y: number } | null>(null);
  const [dropReady, setDropReady] = useState(false);
  const effectTargetRef = useRef<HTMLDivElement>(null);
  const effectDragRef = useRef<{ pid: number } | null>(null);

  useEffect(() => {
    setSize(Math.max(60, Math.min(500, item.homeSceneSize || 250)));
    setHomeEffect(item.homeEffect ?? null);
    setEffectGhost(null);
    setDropReady(false);
    effectDragRef.current = null;
  }, [item.id, item.homeSceneSize, item.homeEffect]);

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
  const availableEffect: HomeCatalogEffect = itemLabel === "Object" ? "lamp_light" : "sleep";
  const availableEffectLabel = itemLabel === "Object" ? "Lamp Light" : "Sleep Spot";

  const changeSize = (next: number) => {
    setSize(Math.max(60, Math.min(500, Math.round(next))));
  };

  const pointInsideTarget = (clientX: number, clientY: number) => {
    const rect = effectTargetRef.current?.getBoundingClientRect();
    return !!rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const beginEffectDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    effectDragRef.current = { pid: event.pointerId };
    setEffectGhost({ x: event.clientX, y: event.clientY });
    setDropReady(pointInsideTarget(event.clientX, event.clientY));
  };

  const moveEffectDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = effectDragRef.current;
    if (!drag || drag.pid !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setEffectGhost({ x: event.clientX, y: event.clientY });
    setDropReady(pointInsideTarget(event.clientX, event.clientY));
  };

  const endEffectDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = effectDragRef.current;
    effectDragRef.current = null;
    if (drag?.pid === event.pointerId && event.type === "pointerup" && pointInsideTarget(event.clientX, event.clientY)) {
      setHomeEffect(availableEffect);
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
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(10,12,8,0.96)", borderBottom: "1px solid rgba(255,215,0,0.24)" }}
      >
        <div>
          <p className="font-fantasy text-[9px] tracking-widest uppercase" style={{ color: "rgba(255,215,0,0.55)" }}>
            Fall Home size preview
          </p>
          <p className="font-fantasy text-sm tracking-wide" style={{ color: "#ffd700" }}>
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
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
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
              {availableEffectLabel} attached
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
        className="px-4 pt-4 pb-5 flex flex-col gap-3"
        style={{ background: "rgba(10,12,8,0.98)", borderTop: "1px solid rgba(255,215,0,0.22)" }}
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
                  ? "Drag Lamp Light onto the object. A player tap turns that placed lamp on or off; dragging still moves it."
                  : "Drag Sleep Spot onto the decor. Players activate it by dragging a pet onto that decor."}
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

          <button
            type="button"
            data-testid={itemLabel === "Object" ? "effect-chip-lamp-light" : "effect-chip-sleep-spot"}
            onPointerDown={beginEffectDrag}
            onPointerMove={moveEffectDrag}
            onPointerUp={endEffectDrag}
            onPointerCancel={endEffectDrag}
            onLostPointerCapture={endEffectDrag}
            onClick={() => setHomeEffect(availableEffect)}
            className="w-full rounded-xl px-3 py-2.5 flex items-center justify-center gap-2 font-fantasy text-[10px]"
            style={{
              background: homeEffect === availableEffect ? "rgba(255,215,0,.16)" : "rgba(255,255,255,.035)",
              border: `1px solid ${homeEffect === availableEffect ? "rgba(255,215,0,.5)" : "rgba(255,215,0,.2)"}`,
              color: "#ffe98f",
              touchAction: "none",
              cursor: "grab",
            }}
          >
            {itemLabel === "Object" ? <Sparkles className="w-4 h-4" /> : <MoonStar className="w-4 h-4" />}
            {availableEffectLabel}
            <span style={{ color: "rgba(255,255,255,.32)", fontSize: 8 }}>drag onto preview</span>
          </button>
        </div>

        <button
          type="button"
          data-testid="button-save-home-scene-size"
          onClick={() => onSave(size, homeEffect)}
          disabled={saving}
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
          {availableEffectLabel}
        </div>
      )}
    </div>
  );
}
