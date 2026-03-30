import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Upload, Plus, ChevronLeft, FlipHorizontal, ZoomIn, ZoomOut, Save, Settings, ImageIcon, X } from "lucide-react";

// Reference canvas height — must match PetHousePage.tsx
const BUILDING_REF_H = 900;

interface HouseBundle {
  id: string;
  name: string;
  shopImageUrl: string | null;
  bgImageUrl: string | null;
  price: number;
  createdAt: string;
}

interface HouseBundleBuilding {
  id: string;
  bundleId: string;
  name: string;
  imageUrl: string;
  posX: number;
  posY: number;
  width: number;
  flippedX: boolean;
  interiorImageUrl: string | null;
}

interface HomeDecorItem {
  id: string;
  name: string;
  imageUrl: string | null;
  price: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ImageUploadField({
  label, value, onChange, accept = "image/png,image/jpeg", helpText,
}: {
  label: string; value: string; onChange: (b64: string) => void;
  accept?: string; helpText?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>{label}</label>
      {helpText && <p className="text-xs" style={{ color: "rgba(165,243,252,0.5)" }}>{helpText}</p>}
      <button type="button" onClick={() => ref.current?.click()}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all self-start"
        style={{ background: "rgba(34,211,238,0.1)", border: "1.5px solid rgba(34,211,238,0.3)", color: "#a5f3fc" }}
      >
        <Upload size={14} />
        {value ? "Change image" : "Upload image"}
      </button>
      {value && (
        <img src={value} alt="preview" className="rounded-xl mt-1 object-contain"
          style={{ maxHeight: 100, maxWidth: "100%", border: "1px solid rgba(34,211,238,0.2)" }} />
      )}
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; onChange(await fileToBase64(f)); e.target.value = ""; }} />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(8,38,50,0.7) 0%, rgba(12,58,75,0.7) 100%)",
  border: "1.5px solid rgba(34,211,238,0.3)",
};
const inputStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.4)", border: "1px solid rgba(34,211,238,0.3)", color: "#e0f7fa",
};
const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg, #22d3ee, #0891b2)", color: "#0f172a",
};

// ── Add Decor Form (unchanged) ─────────────────────────────────────────────────
function AddDecorForm({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageData, setImageData] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/home-decor", { name, price: parseInt(price) || 0, imageData: imageData || undefined });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/home-decor"] }); toast({ title: "Decor item added!" }); onBack(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold self-start" style={{ color: "#a5f3fc" }}>
        <ChevronLeft size={14} /> Back
      </button>
      <h3 className="font-fantasy font-bold text-base" style={{ color: "#a5f3fc" }}>Add Home Decor Item</h3>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>Name</label>
        <input data-testid="input-decor-name" value={name} onChange={(e) => setName(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm" style={inputStyle} placeholder="e.g. Mossy Lantern" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>Price (coins)</label>
        <input data-testid="input-decor-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm" style={inputStyle} placeholder="0" />
      </div>
      <ImageUploadField label="Decor Image" value={imageData} onChange={setImageData} accept="image/png,image/gif" helpText="PNG or GIF, up to 15MB" />
      <button data-testid="button-save-decor" onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}
        className="rounded-xl px-4 py-2 font-fantasy font-bold text-sm transition-all disabled:opacity-40" style={primaryBtn}>
        {mutation.isPending ? "Saving..." : "Save Decor Item"}
      </button>
    </div>
  );
}

// ── Bundle Editor ──────────────────────────────────────────────────────────────
// Full-screen editor rendered via portal on document.body (escapes phone frame).
// Uses the same rendering model as PetHousePage for the background and buildings:
//   - Background <img> fills container height, width is natural (height: 100%, width: auto)
//   - Buildings in a matching-width container at left: panX
//   - Building size = storedW * containerH / BUILDING_REF_H  (FIXED px, same everywhere)
//   - Horizontal pan via left: panX (drag left/right to scroll)
function BundleEditor({ initialBundle, onBack }: { initialBundle: HouseBundle | null; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [bundle, setBundle]             = useState<HouseBundle | null>(initialBundle);
  const [formName, setFormName]         = useState(initialBundle?.name ?? "");
  const [formPrice, setFormPrice]       = useState(String(initialBundle?.price ?? "0"));
  const [formShopImage, setFormShopImage] = useState("");
  const [formBgImage, setFormBgImage]   = useState("");
  const [showSettings, setShowSettings] = useState(!initialBundle?.bgImageUrl);

  const [addingBuilding, setAddingBuilding]       = useState(false);
  const [newBuildingName, setNewBuildingName]     = useState("");
  const [newBuildingImageData, setNewBuildingImageData] = useState("");
  const [selectedId, setSelectedId]               = useState<string | null>(null);
  const [draggingId, setDraggingId]               = useState<string | null>(null);
  const [moveOrder, setMoveOrder]                 = useState<string[]>([]);
  const [livePos, setLivePos]                     = useState<Record<string, { x: number; y: number }>>({});
  const [liveSize, setLiveSize]                   = useState<Record<string, number>>({});
  const [liveFlip, setLiveFlip]                   = useState<Record<string, boolean>>({});

  const [panX, setPanX]         = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [bgAspect, setBgAspect] = useState(16 / 9);

  const containerRef           = useRef<HTMLDivElement>(null);
  const buildingsRef           = useRef<HTMLDivElement>(null);
  const panStartRef            = useRef<{ startX: number; startPanX: number } | null>(null);
  const draggingBuildingRef    = useRef<string | null>(null);
  const dragCandidateRef       = useRef<string | null>(null);
  const tapCandidateRef        = useRef<string | null>(null);
  const pointerDownPosRef      = useRef<{ x: number; y: number } | null>(null);
  const pointerDownHitBuilding = useRef<string | null>(null);
  const dragOffsetRef          = useRef({ x: 0, y: 0 });
  const interiorFileRef        = useRef<HTMLInputElement>(null);
  const interiorBuildingIdRef  = useRef<string | null>(null);

  const { data: buildings = [], refetch: refetchBuildings } = useQuery<HouseBundleBuilding[]>({
    queryKey: ["/api/admin/house-bundles", bundle?.id, "buildings"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/house-bundles/${bundle!.id}/buildings`, { credentials: "include" });
      return res.json();
    },
    enabled: !!bundle?.id,
  });

  const activeBgUrl = formBgImage || bundle?.bgImageUrl;
  useEffect(() => {
    if (!activeBgUrl) return;
    const img = new window.Image();
    img.onload = () => { if (img.naturalHeight > 0) setBgAspect(img.naturalWidth / img.naturalHeight); };
    img.src = activeBgUrl;
  }, [activeBgUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const recalc = () => {
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const iw = h * bgAspect;
      setContainerH(h);
      setImgWidth(iw);
      setPanX(Math.max(Math.min(0, w - iw), -(iw - w) / 2));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bgAspect]);

  const clampPan = useCallback((val: number) => {
    const el = containerRef.current;
    if (!el) return val;
    const w = el.offsetWidth;
    const iw = el.offsetHeight * bgAspect;
    const min = Math.min(0, w - iw);
    return Math.min(0, Math.max(min, val));
  }, [bgAspect]);

  const savePosQuiet = useCallback(async (id: string, px: number, py: number) => {
    try { await apiRequest("PATCH", `/api/admin/house-bundle-buildings/${id}`, { posX: px, posY: py }); }
    catch (err: any) { toast({ title: "Position save failed", description: err.message, variant: "destructive" }); }
  }, [toast]);

  const patchBuilding = useCallback(async (id: string, patch: Record<string, any>) => {
    await apiRequest("PATCH", `/api/admin/house-bundle-buildings/${id}`, patch);
    refetchBuildings();
  }, [refetchBuildings]);

  const addBuildingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/house-bundles/${bundle!.id}/buildings`, {
        name: newBuildingName, imageData: newBuildingImageData,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchBuildings(); setAddingBuilding(false); setNewBuildingName(""); setNewBuildingImageData("");
      toast({ title: "Building added!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBuildingMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/house-bundle-buildings/${id}`); },
    onSuccess: () => { refetchBuildings(); setSelectedId(null); toast({ title: "Building removed" }); },
  });

  const saveBundleMutation = useMutation({
    mutationFn: async () => {
      if (!bundle) {
        // Creation mode
        if (!formName.trim()) throw new Error("Please enter a bundle name");
        const res = await apiRequest("POST", "/api/admin/house-bundles", {
          name: formName.trim(), price: parseInt(formPrice) || 0,
          shopImageData: formShopImage || undefined, bgImageData: formBgImage || undefined,
        });
        return { created: true, bundle: await res.json() };
      }
      // Edit mode — save all field changes
      await apiRequest("PATCH", `/api/admin/house-bundles/${bundle.id}`, {
        name: formName.trim() || bundle.name,
        price: parseInt(formPrice) || bundle.price,
        shopImageData: formShopImage || undefined,
        bgImageData: formBgImage || undefined,
      });
      return { created: false };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      if (result.created) {
        // Just created — switch to edit mode so admin can add buildings
        setBundle(result.bundle);
        setFormBgImage("");
        setFormShopImage("");
        setShowSettings(false);
        toast({ title: "Bundle created — now add buildings!" });
      } else {
        toast({ title: "Bundle saved!" });
        // onBack called by the button's own onSuccess callback
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const findBuildingAtPoint = useCallback((clientX: number, clientY: number): string | null => {
    const bDiv = buildingsRef.current;
    if (!bDiv) return null;
    const rect = bDiv.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const priority = [
      ...buildings.filter(b => !moveOrder.includes(b.id)),
      ...moveOrder.map(id => buildings.find(b => b.id === id)!).filter(Boolean),
    ].reverse();
    const cH = containerH || rect.height;
    for (const b of priority) {
      const lp = livePos[b.id];
      const px = lp ? lp.x : b.posX;
      const py = lp ? lp.y : b.posY;
      const sw = liveSize[b.id] ?? b.width ?? 80;
      const dw = Math.round(sw * cH / BUILDING_REF_H);
      const ax = rect.left + (px / 100) * rect.width;
      const ay = rect.top  + (py / 100) * rect.height;
      const pad = 10;
      if (clientX >= ax - dw / 2 - pad && clientX <= ax + dw / 2 + pad &&
          clientY >= ay - dw - pad     && clientY <= ay + pad) {
        return b.id;
      }
    }
    return null;
  }, [buildings, livePos, liveSize, moveOrder, containerH]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (showSettings || addingBuilding) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    tapCandidateRef.current = null;
    dragCandidateRef.current = null;
    const buildingId = findBuildingAtPoint(e.clientX, e.clientY);
    pointerDownHitBuilding.current = buildingId;
    if (buildingId) {
      tapCandidateRef.current = buildingId;
      if (selectedId === buildingId) {
        dragCandidateRef.current = buildingId;
        const bDiv = buildingsRef.current;
        if (bDiv) {
          const rect = bDiv.getBoundingClientRect();
          const lp = livePos[buildingId];
          const bld = buildings.find(b => b.id === buildingId);
          const cx = rect.left + ((lp ? lp.x : (bld?.posX ?? 50)) / 100) * rect.width;
          const cy = rect.top  + ((lp ? lp.y : (bld?.posY ?? 80)) / 100) * rect.height;
          dragOffsetRef.current = { x: e.clientX - cx, y: e.clientY - cy };
        } else {
          dragOffsetRef.current = { x: 0, y: 0 };
        }
      }
    } else {
      panStartRef.current = { startX: e.clientX, startPanX: panX };
    }
  }, [livePos, buildings, selectedId, findBuildingAtPoint, showSettings, addingBuilding, panX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const down = pointerDownPosRef.current;
    const moved = down ? Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) : 0;
    if (moved > 6) {
      tapCandidateRef.current = null;
      if (dragCandidateRef.current && !draggingBuildingRef.current) {
        draggingBuildingRef.current = dragCandidateRef.current;
        setDraggingId(dragCandidateRef.current);
        dragCandidateRef.current = null;
      }
    }
    if (draggingBuildingRef.current) {
      const bDiv = buildingsRef.current;
      if (!bDiv) return;
      const rect = bDiv.getBoundingClientRect();
      const rawX = e.clientX - dragOffsetRef.current.x - rect.left;
      const rawY = e.clientY - dragOffsetRef.current.y - rect.top;
      const px = Math.max(0, Math.min(100, (rawX / rect.width)  * 100));
      const py = Math.max(0, Math.min(100, (rawY / rect.height) * 100));
      setLivePos((prev) => ({ ...prev, [draggingBuildingRef.current!]: { x: px, y: py } }));
    } else if (panStartRef.current) {
      const dx = e.clientX - panStartRef.current.startX;
      setPanX(clampPan(panStartRef.current.startPanX + dx));
    }
  }, [clampPan]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragCandidateRef.current = null;
    panStartRef.current = null;
    if (draggingBuildingRef.current) {
      const id = draggingBuildingRef.current;
      const pos = livePos[id];
      if (pos) savePosQuiet(id, pos.x, pos.y);
      setMoveOrder((prev) => [...prev.filter((x) => x !== id), id]);
      draggingBuildingRef.current = null;
      setDraggingId(null);
    } else if (tapCandidateRef.current) {
      const id = tapCandidateRef.current;
      setSelectedId((prev) => prev === id ? null : id);
      tapCandidateRef.current = null;
    } else {
      const down = pointerDownPosRef.current;
      if (!down) return;
      const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
      if (moved < 8 && !pointerDownHitBuilding.current) setSelectedId(null);
    }
    pointerDownPosRef.current = null;
    pointerDownHitBuilding.current = null;
  }, [livePos, savePosQuiet]);

  const handleSizeChange = useCallback((b: HouseBundleBuilding, delta: number) => {
    const current = liveSize[b.id] ?? b.width ?? 80;
    const next = Math.max(20, Math.min(500, current + delta));
    setLiveSize((prev) => ({ ...prev, [b.id]: next }));
    patchBuilding(b.id, { width: next });
  }, [liveSize, patchBuilding]);

  const handleFlip = useCallback((b: HouseBundleBuilding) => {
    const current = liveFlip[b.id] !== undefined ? liveFlip[b.id] : (b.flippedX ?? false);
    const next = !current;
    setLiveFlip((prev) => ({ ...prev, [b.id]: next }));
    patchBuilding(b.id, { flippedX: next });
  }, [liveFlip, patchBuilding]);

  const handleInteriorUpload = useCallback((buildingId: string) => {
    interiorBuildingIdRef.current = buildingId;
    interiorFileRef.current?.click();
  }, []);

  const handleInteriorFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !interiorBuildingIdRef.current) return;
    try {
      const b64 = await fileToBase64(file);
      await patchBuilding(interiorBuildingIdRef.current, { interiorImageData: b64 });
      toast({ title: "Building background saved!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    interiorBuildingIdRef.current = null;
    e.target.value = "";
  }, [patchBuilding, toast]);

  if (showSettings) {
    return createPortal(
      <div className="select-none" style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(6,18,30,1)", touchAction: "none",
        display: "flex", flexDirection: "column",
      }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{
          background: "rgba(4,14,26,0.97)",
          borderBottom: "1.5px solid rgba(34,211,238,0.25)",
        }}>
          <button data-testid="button-back-bundle-editor"
            onClick={onBack}
            className="flex items-center gap-1 rounded-2xl px-3 py-2 text-xs font-bold transition-all"
            style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)", color: "#a5f3fc" }}>
            <ChevronLeft size={14} /> Back
          </button>
          <span className="flex-1 text-center text-sm font-bold font-fantasy truncate" style={{ color: "#e0f7fa" }}>
            {bundle ? "Edit Bundle Details" : "New House Bundle"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-4 max-w-md mx-auto">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>Bundle Name *</label>
              <input data-testid="input-bundle-name" value={formName} onChange={(e) => setFormName(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={inputStyle} placeholder="e.g. Mossy Forest Home" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>Price (coins)</label>
              <input data-testid="input-bundle-price" type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={inputStyle} placeholder="0" />
            </div>
            <ImageUploadField label="Shop Image (used in store)" value={formShopImage}
              onChange={setFormShopImage} accept="image/png,image/jpeg"
              helpText={bundle?.shopImageUrl ? "Current image saved — upload to replace" : "Shown in the shop"} />
            <ImageUploadField label="Background Image *" value={formBgImage}
              onChange={setFormBgImage} accept="image/png,image/jpeg"
              helpText={bundle?.bgImageUrl ? "Current BG saved — upload to replace" : "The panoramic pet house background (wide landscape works best)"} />

            <button data-testid="button-save-bundle-settings"
              onClick={() => saveBundleMutation.mutate(undefined, {
                onSuccess: () => setShowSettings(false),
              })}
              disabled={!formName.trim() || saveBundleMutation.isPending}
              className="rounded-2xl px-4 py-3 font-bold text-sm transition-all disabled:opacity-40 mt-2"
              style={primaryBtn}>
              {saveBundleMutation.isPending ? "Saving..." : (bundle ? "Save & Continue to Edit" : "Create Bundle & Continue →")}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="select-none" style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(6,18,30,1)", touchAction: "none",
    }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div ref={containerRef} style={{
        position: "absolute", left: 0, right: 0,
        top: 48, bottom: 56,
        overflow: "hidden",
      }}>
        {activeBgUrl ? (
          <img src={activeBgUrl} alt="background" draggable={false}
            style={{
              position: "absolute",
              height: "100%", width: "auto",
              left: panX, top: 0,
              pointerEvents: "none", userSelect: "none",
            }}
          />
        ) : (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(15,35,50,1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <p className="text-sm" style={{ color: "rgba(165,243,252,0.3)" }}>No background — go back to upload one</p>
          </div>
        )}
      </div>

      <div ref={buildingsRef} style={{
        position: "absolute",
        left: panX, top: 48,
        width: imgWidth, height: `calc(100% - ${48 + 56}px)`,
        pointerEvents: "none",
      }}>
          {buildings.map((b) => {
            const lp        = livePos[b.id];
            const posXVal   = lp ? lp.x : b.posX;
            const posYVal   = lp ? lp.y : b.posY;
            const storedW   = liveSize[b.id] ?? b.width ?? 80;
            const displayW  = Math.round(storedW * containerH / BUILDING_REF_H);
            const flip      = liveFlip[b.id] !== undefined ? liveFlip[b.id] : (b.flippedX ?? false);
            const isSelected = selectedId === b.id;
            const isDragging = draggingId === b.id;
            const moveRank   = moveOrder.indexOf(b.id);
            const hasInterior = !!b.interiorImageUrl;

            return (
              <div key={b.id} data-testid={`building-${b.id}`}
                style={{
                  position: "absolute",
                  left: `${posXVal}%`, top: `${posYVal}%`,
                  transform: "translate(-50%, -100%)",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  userSelect: "none", pointerEvents: "none",
                  zIndex: isDragging ? 100 : moveRank >= 0 ? 20 + moveRank + (isSelected ? 50 : 0) : (isSelected ? 25 : 5),
                }}
              >
                {isSelected && (
                  <div
                    style={{
                      pointerEvents: "auto", display: "flex", alignItems: "center",
                      gap: 3, marginBottom: 6, borderRadius: "1rem", padding: "4px 8px",
                      background: "rgba(0,0,0,0.9)", border: "1px solid rgba(34,211,238,0.4)",
                      whiteSpace: "nowrap",
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                  >
                    <button data-testid={`button-size-down-${b.id}`}
                      onClick={(e) => { e.stopPropagation(); handleSizeChange(b, -20); }}
                      style={{ background: "rgba(34,211,238,0.15)", color: "#a5f3fc", borderRadius: "0.6rem", padding: "5px", display: "flex" }}
                      title="Decrease size"><ZoomOut size={12} /></button>
                    <span style={{ color: "#e0f7fa", minWidth: 26, textAlign: "center", fontSize: 11, fontWeight: "bold" }}>
                      {storedW}
                    </span>
                    <button data-testid={`button-size-up-${b.id}`}
                      onClick={(e) => { e.stopPropagation(); handleSizeChange(b, 20); }}
                      style={{ background: "rgba(34,211,238,0.15)", color: "#a5f3fc", borderRadius: "0.6rem", padding: "5px", display: "flex" }}
                      title="Increase size"><ZoomIn size={12} /></button>

                    <div style={{ width: 1, height: 14, background: "rgba(34,211,238,0.25)", margin: "0 2px" }} />

                    <button data-testid={`button-flip-${b.id}`}
                      onClick={(e) => { e.stopPropagation(); handleFlip(b); }}
                      style={{ background: flip ? "rgba(34,211,238,0.35)" : "rgba(34,211,238,0.15)", color: "#a5f3fc", borderRadius: "0.6rem", padding: "5px", display: "flex" }}
                      title="Flip horizontal"><FlipHorizontal size={12} /></button>

                    <div style={{ width: 1, height: 14, background: "rgba(34,211,238,0.25)", margin: "0 2px" }} />

                    <button data-testid={`button-interior-${b.id}`}
                      onClick={(e) => { e.stopPropagation(); handleInteriorUpload(b.id); }}
                      style={{ background: hasInterior ? "rgba(168,85,247,0.35)" : "rgba(168,85,247,0.15)", color: "#d8b4fe", borderRadius: "0.6rem", padding: "5px", display: "flex" }}
                      title={hasInterior ? "Change building background" : "Add building background (opens when player taps)"}>
                      <ImageIcon size={12} /></button>
                    {hasInterior && (
                      <button data-testid={`button-clear-interior-${b.id}`}
                        onClick={(e) => { e.stopPropagation(); patchBuilding(b.id, { clearInterior: true }); }}
                        style={{ background: "rgba(220,38,38,0.2)", color: "#fca5a5", borderRadius: "0.6rem", padding: "5px", display: "flex" }}
                        title="Remove building background"><X size={10} /></button>
                    )}

                    <div style={{ width: 1, height: 14, background: "rgba(34,211,238,0.25)", margin: "0 2px" }} />

                    <button data-testid={`button-delete-building-${b.id}`}
                      onClick={(e) => { e.stopPropagation(); deleteBuildingMutation.mutate(b.id); }}
                      style={{ background: "rgba(220,50,50,0.25)", color: "#f87171", borderRadius: "0.6rem", padding: "5px", display: "flex" }}
                      title="Delete building"><Trash2 size={12} /></button>
                  </div>
                )}

                <img src={b.imageUrl} alt={b.name} draggable={false}
                  style={{
                    width: displayW, height: displayW, objectFit: "contain", display: "block",
                    filter: `drop-shadow(0 4px 14px rgba(0,0,0,0.85))${isSelected ? " drop-shadow(0 0 8px rgba(34,211,238,0.8))" : ""}`,
                    transform: flip ? "scaleX(-1)" : undefined,
                    transition: isDragging ? "none" : "width 0.15s, height 0.15s",
                    cursor: isDragging ? "grabbing" : (isSelected ? "grab" : "pointer"),
                  }}
                />
                <span style={{
                  marginTop: 3, padding: "1px 8px", borderRadius: 999, fontSize: 10, fontWeight: "bold",
                  background: "rgba(0,0,0,0.7)", color: isSelected ? "#22d3ee" : "#a5f3fc",
                  whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4,
                }}>
                  {b.name}
                  {hasInterior && <span style={{ fontSize: 9, color: "#d8b4fe" }}>◈</span>}
                </span>
              </div>
            );
          })}
      </div>

      <input ref={interiorFileRef} type="file" accept="image/png,image/jpeg" className="hidden"
        onChange={handleInteriorFileChange} />

      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3"
        style={{
          zIndex: 220, height: 48,
          background: "rgba(6,18,30,0.97)",
          borderBottom: "1px solid rgba(34,211,238,0.2)",
        }}
      >
        <button data-testid="button-back-bundle-editor"
          onClick={onBack}
          className="flex items-center gap-1 rounded-2xl px-3 py-2 text-xs font-bold transition-all"
          style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)", color: "#a5f3fc" }}>
          <ChevronLeft size={14} /> Back
        </button>
        <span className="flex-1 text-center text-sm font-bold font-fantasy truncate" style={{ color: "#e0f7fa" }}>
          {bundle ? bundle.name : (formName || "New Bundle")}
        </span>
        <button data-testid="button-settings-bundle"
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1 rounded-2xl px-3 py-2 text-xs font-bold transition-all"
          style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)", color: "#a5f3fc" }}>
          <Settings size={14} />
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-4"
        style={{
          zIndex: 220, height: 56,
          background: "rgba(6,18,30,0.97)",
          borderTop: "1px solid rgba(34,211,238,0.2)",
        }}
      >
        {bundle && (
          <button data-testid="button-add-building"
            onClick={() => setAddingBuilding(true)}
            className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all"
            style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.35)", color: "#a5f3fc" }}>
            <Plus size={14} /> Add Building
          </button>
        )}
        <div className="flex-1" />
        <button data-testid="button-save-bundle"
          onClick={() => {
            if (bundle) {
              saveBundleMutation.mutate(undefined, { onSuccess: onBack });
            } else {
              setShowSettings(true);
            }
          }}
          disabled={saveBundleMutation.isPending}
          className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all disabled:opacity-50"
          style={primaryBtn}>
          <Save size={14} />
          {saveBundleMutation.isPending ? "Saving..." : "Save Bundle"}
        </button>
      </div>

      {addingBuilding && bundle && (
        <div className="absolute inset-0 flex items-end" style={{ zIndex: 230, background: "rgba(0,0,0,0.65)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setAddingBuilding(false); }}>
          <div className="w-full rounded-t-3xl p-5 flex flex-col gap-3"
            style={{ background: "rgba(6,22,38,0.99)", border: "1px solid rgba(34,211,238,0.25)", borderBottom: "none" }}>
            <div className="flex items-center justify-between">
              <h4 className="font-fantasy font-bold text-sm" style={{ color: "#a5f3fc" }}>Add Building</h4>
              <button onClick={() => setAddingBuilding(false)} style={{ color: "rgba(165,243,252,0.5)" }}><X size={16} /></button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>Building Name</label>
              <input data-testid="input-building-name" value={newBuildingName} onChange={(e) => setNewBuildingName(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={inputStyle} placeholder="e.g. Mossy Cottage" />
            </div>
            <ImageUploadField label="Building Image" value={newBuildingImageData}
              onChange={setNewBuildingImageData} accept="image/png" helpText="PNG recommended (transparent bg)" />
            <button data-testid="button-confirm-add-building"
              onClick={() => addBuildingMutation.mutate()}
              disabled={!newBuildingName || !newBuildingImageData || addBuildingMutation.isPending}
              className="rounded-2xl px-4 py-2.5 font-bold text-sm transition-all disabled:opacity-40"
              style={primaryBtn}>
              {addBuildingMutation.isPending ? "Adding..." : "Add Building"}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Main HouseBundleAdminPanel ─────────────────────────────────────────────────
export default function HouseBundleAdminPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "addDecor" | "bundleEditor">("list");
  const [editingBundle, setEditingBundle] = useState<HouseBundle | null>(null);

  const { data: bundles = [] } = useQuery<HouseBundle[]>({
    queryKey: ["/api/admin/house-bundles"],
    queryFn: async () => { const r = await fetch("/api/admin/house-bundles", { credentials: "include" }); return r.json(); },
  });

  const { data: decor = [] } = useQuery<HomeDecorItem[]>({
    queryKey: ["/api/admin/home-decor"],
    queryFn: async () => { const r = await fetch("/api/admin/home-decor", { credentials: "include" }); return r.json(); },
  });

  const deleteBundleMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/house-bundles/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] }); toast({ title: "Bundle deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteDecorMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/home-decor/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/home-decor"] }); toast({ title: "Decor deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (view === "addDecor") return <AddDecorForm onBack={() => setView("list")} />;
  if (view === "bundleEditor") {
    return (
      <BundleEditor
        initialBundle={editingBundle}
        onBack={() => {
          qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
          setView("list");
          setEditingBundle(null);
        }}
      />
    );
  }

  // ── List view ──
  return (
    <div className="flex flex-col gap-5">

      {/* ── House Bundles section ── */}
      <div className="flex flex-col gap-3 rounded-2xl overflow-hidden" style={panelStyle}>
        <div className="flex items-center justify-between px-4 pt-3">
          <h3 className="font-fantasy font-bold text-sm" style={{ color: "#a5f3fc" }}>House Bundles</h3>
          <button data-testid="button-create-bundle"
            onClick={() => { setEditingBundle(null); setView("bundleEditor"); }}
            className="flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-bold transition-all"
            style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.35)", color: "#a5f3fc" }}>
            <Plus size={13} /> Add Bundle
          </button>
        </div>

        {bundles.length === 0 ? (
          <p className="text-xs px-4 pb-3" style={{ color: "rgba(165,243,252,0.4)" }}>No bundles yet. Click Add Bundle to create one.</p>
        ) : (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {bundles.map((b) => (
              <div key={b.id} data-testid={`bundle-card-${b.id}`}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(34,211,238,0.15)" }}>
                {b.shopImageUrl && (
                  <img src={b.shopImageUrl} alt={b.name} className="rounded-xl object-cover flex-shrink-0"
                    style={{ width: 44, height: 44 }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs truncate" style={{ color: "#e0f7fa" }}>{b.name}</p>
                  <p className="text-xs" style={{ color: "rgba(165,243,252,0.5)" }}>
                    {b.price.toLocaleString()} coins
                    {b.bgImageUrl ? " · has background" : " · no background"}
                  </p>
                </div>
                <button data-testid={`button-edit-bundle-${b.id}`}
                  onClick={() => { setEditingBundle(b); setView("bundleEditor"); }}
                  className="rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex-shrink-0"
                  style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)", color: "#a5f3fc" }}>
                  Edit
                </button>
                <button data-testid={`button-delete-bundle-${b.id}`}
                  onClick={() => { if (confirm(`Delete "${b.name}"?`)) deleteBundleMutation.mutate(b.id); }}
                  className="rounded-xl p-1.5 transition-all flex-shrink-0"
                  style={{ background: "rgba(220,50,50,0.15)", color: "#f87171" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Home Decor section ── */}
      <div className="flex flex-col gap-3 rounded-2xl overflow-hidden" style={panelStyle}>
        <div className="flex items-center justify-between px-4 pt-3">
          <h3 className="font-fantasy font-bold text-sm" style={{ color: "#a5f3fc" }}>Home Decor Items</h3>
          <button data-testid="button-add-decor"
            onClick={() => setView("addDecor")}
            className="flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-bold transition-all"
            style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.35)", color: "#a5f3fc" }}>
            <Plus size={13} /> Add Decor
          </button>
        </div>

        {decor.length === 0 ? (
          <p className="text-xs px-4 pb-3" style={{ color: "rgba(165,243,252,0.4)" }}>No decor items yet.</p>
        ) : (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {decor.map((d) => (
              <div key={d.id} data-testid={`decor-card-${d.id}`}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(34,211,238,0.15)" }}>
                {d.imageUrl && (
                  <img src={d.imageUrl} alt={d.name} className="rounded-xl object-contain flex-shrink-0"
                    style={{ width: 40, height: 40 }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs truncate" style={{ color: "#e0f7fa" }}>{d.name}</p>
                  <p className="text-xs" style={{ color: "rgba(165,243,252,0.5)" }}>{d.price.toLocaleString()} coins</p>
                </div>
                <button data-testid={`button-delete-decor-${d.id}`}
                  onClick={() => { if (confirm(`Delete "${d.name}"?`)) deleteDecorMutation.mutate(d.id); }}
                  className="rounded-xl p-1.5 transition-all flex-shrink-0"
                  style={{ background: "rgba(220,50,50,0.15)", color: "#f87171" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
