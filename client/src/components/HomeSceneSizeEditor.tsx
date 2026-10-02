import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, X } from "lucide-react";
import fallbackHomePreview from "@assets/bg_home_v2.png";
import { petHouseDepthSize } from "@/lib/petHouseSizing";

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
  onSave: (size: number) => void;
  saving: boolean;
}) {
  const [size, setSize] = useState(Math.max(60, Math.min(500, item.homeSceneSize || 250)));

  useEffect(() => {
    setSize(Math.max(60, Math.min(500, item.homeSceneSize || 250)));
  }, [item.id, item.homeSceneSize]);

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
  const displaySize = petHouseDepthSize(size, previewY);

  const changeSize = (next: number) => {
    setSize(Math.max(60, Math.min(500, Math.round(next))));
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
          className="absolute flex items-center justify-center pointer-events-none"
          style={{
            left: "50%",
            top: `${previewY * 100}%`,
            width: displaySize,
            height: displaySize,
            transform: "translate(-50%, -50%)",
          }}
        >
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-contain"
              draggable={false}
              style={{ filter: "drop-shadow(0 5px 12px rgba(0,0,0,0.55))" }}
            />
          ) : (
            <div
              className="w-full h-full rounded-xl flex items-center justify-center font-fantasy"
              style={{ background: "rgba(0,0,0,0.45)", border: "1px dashed rgba(255,215,0,0.5)", color: "#ffd700" }}
            >
              {itemLabel}
            </div>
          )}
        </div>
        <div
          className="absolute left-3 bottom-3 rounded-lg px-2 py-1 font-fantasy text-[8px]"
          style={{ background: "rgba(0,0,0,0.62)", color: "rgba(255,255,255,0.72)" }}
        >
          Previewed at normal floor depth
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
            Players cannot resize this. Moving it upward in a home will make it smaller automatically.
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

        <button
          type="button"
          data-testid="button-save-home-scene-size"
          onClick={() => onSave(size)}
          disabled={saving}
          className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest disabled:opacity-50"
          style={{ background: "rgba(255,215,0,0.16)", border: "1px solid rgba(255,215,0,0.42)", color: "#ffd700" }}
        >
          {saving ? "Saving..." : `Save ${itemLabel} Size`}
        </button>
      </div>
    </div>
  );
}
