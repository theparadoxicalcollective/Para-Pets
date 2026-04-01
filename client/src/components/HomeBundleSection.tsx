import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2, X, ChevronLeft, Plus, Minus, FlipHorizontal, Image, Copy } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface HomeDecorItem {
  id: string; name: string; imageUrl: string | null; price: number; createdAt: string;
}
interface HouseBundle {
  id: string; name: string; shopImageUrl: string | null; bgImageUrl: string | null; price: number; createdAt: string;
  giftNotificationX?: number; giftNotificationY?: number;
}
interface HouseBundleBuilding {
  id: string; bundleId: string; name: string; imageUrl: string;
  posX: number; posY: number; width: number; flippedX: boolean;
  interiorImageUrl: string | null; size: string;
  leaveButtonX: number; leaveButtonY: number;
  createdAt: string;
}

const BUILDING_SIZES = [
  { value: "small",  label: "Small",  caption: "2 pets · 3 items" },
  { value: "medium", label: "Medium", caption: "4 pets · 6 items" },
  { value: "large",  label: "Large",  caption: "6 pets · 9 items" },
] as const;

// ─── Constants ────────────────────────────────────────────────────────────────
const GOLD = "#ffd700";
const GOLD_DIM = "rgba(255,215,0,0.12)";
const GOLD_BORDER = "rgba(255,215,0,0.2)";
const BG_CARD = "rgba(255,215,0,0.04)";
const BUILDING_REF_H = 900;

// ─── AdminInteriorPreview — full-screen pannable preview used by admin ────────
// Shows a draggable "Leave" button so the admin can position it over the background.
function AdminInteriorPreview({
  url, buildingId, initialLeaveX = 0.92, initialLeaveY = 0.06, onClose, onSaveLeavePos,
}: {
  url: string;
  buildingId: string;
  initialLeaveX?: number;
  initialLeaveY?: number;
  onClose: () => void;
  onSaveLeavePos: (x: number, y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panX, setPanX] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const aspectRef = useRef(16 / 9);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);

  // Leave button drag state
  const leaveXRef = useRef(initialLeaveX);
  const leaveYRef = useRef(initialLeaveY);
  const [leaveX, setLeaveX] = useState(initialLeaveX);
  const [leaveY, setLeaveY] = useState(initialLeaveY);
  const leaveDragRef = useRef<{ startX: number; startY: number; startLX: number; startLY: number; pid: number } | null>(null);
  const [isDraggingLeave, setIsDraggingLeave] = useState(false);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalHeight > 0) {
        const a = img.naturalWidth / img.naturalHeight;
        aspectRef.current = a;
        setAspect(a);
      }
    };
    img.src = url;
  }, [url]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const recalc = () => {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      const imgW = h * aspectRef.current;
      setPanX(Math.max(Math.min(0, w - imgW), (w - imgW) / 2));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [aspect]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (leaveDragRef.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    const imgW = h * aspectRef.current;
    const min = Math.min(0, w - imgW);
    setPanX(Math.min(0, Math.max(min, drag.startPanX + (e.clientX - drag.startX))));
  }, []);

  const onPointerUp = useCallback(() => { panStartRef.current = null; }, []);

  const onLeaveBtnDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    panStartRef.current = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    leaveDragRef.current = { startX: e.clientX, startY: e.clientY, startLX: leaveXRef.current, startLY: leaveYRef.current, pid: e.pointerId };
    setIsDraggingLeave(true);
  }, []);

  const onLeaveBtnMove = useCallback((e: React.PointerEvent) => {
    const drag = leaveDragRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const newX = Math.max(0.05, Math.min(0.95, drag.startLX + (e.clientX - drag.startX) / rect.width));
    const newY = Math.max(0.02, Math.min(0.95, drag.startLY + (e.clientY - drag.startY) / rect.height));
    leaveXRef.current = newX;
    leaveYRef.current = newY;
    setLeaveX(newX);
    setLeaveY(newY);
  }, []);

  const onLeaveBtnUp = useCallback((e: React.PointerEvent) => {
    if (leaveDragRef.current && leaveDragRef.current.pid === e.pointerId) {
      leaveDragRef.current = null;
      setIsDraggingLeave(false);
      onSaveLeavePos(leaveXRef.current, leaveYRef.current);
    }
  }, [onSaveLeavePos]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0"
      style={{ zIndex: 100, background: "#000", overflow: "hidden", touchAction: "none", maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img
        src={url}
        alt="Building background preview"
        draggable={false}
        style={{ position: "absolute", top: 0, left: `${panX}px`, height: "100%", width: "auto", maxWidth: "none" }}
      />

      {/* Admin close button — top-left X */}
      <button
        data-testid="button-close-interior-preview"
        onClick={onClose}
        onPointerDown={e => e.stopPropagation()}
        className="absolute top-4 left-4 w-10 h-10 rounded-full flex items-center justify-center font-bold text-base"
        style={{ zIndex: 20, background: "rgba(0,0,0,0.7)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
      >
        ✕
      </button>

      {/* Hint label — top-right */}
      <div
        className="absolute top-4 right-4 rounded-xl px-3 py-1.5"
        style={{ zIndex: 20, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,215,0,0.3)", pointerEvents: "none" }}
      >
        <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "rgba(255,215,0,0.85)" }}>
          Drag Outside to reposition
        </p>
      </div>

      {/* Draggable Leave button — player-facing */}
      <button
        data-testid="button-leave-draggable"
        style={{
          position: "absolute",
          left: `${leaveX * 100}%`,
          top: `${leaveY * 100}%`,
          transform: "translate(-50%, -50%)",
          zIndex: 20,
          touchAction: "none",
          cursor: isDraggingLeave ? "grabbing" : "grab",
          background: "rgba(0,0,0,0.32)",
          color: "rgba(255,255,255,0.7)",
          border: isDraggingLeave ? "2px solid rgba(255,215,0,0.85)" : "1px solid rgba(255,255,255,0.18)",
          borderRadius: 9999,
          padding: "8px 18px",
          fontFamily: "Cinzel, serif",
          fontWeight: "bold",
          fontSize: 12,
          letterSpacing: "0.12em",
          boxShadow: isDraggingLeave ? "0 0 16px rgba(255,215,0,0.45)" : "none",
          transition: isDraggingLeave ? "none" : "box-shadow 0.15s",
        }}
        onPointerDown={onLeaveBtnDown}
        onPointerMove={onLeaveBtnMove}
        onPointerUp={onLeaveBtnUp}
        onPointerCancel={onLeaveBtnUp}
      >
        Outside
      </button>
    </div>
  );
}

// ─── BundleBgEditor (full-screen background + building editor) ────────────────
function BundleBgEditor({ bundle, onClose, onBgUpdated }: { bundle: HouseBundle; onClose: () => void; onBgUpdated?: (url: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Local background URL — updated immediately on upload ──
  const [localBgUrl, setLocalBgUrl] = useState<string | null>(bundle.bgImageUrl);
  const [bgUploading, setBgUploading] = useState(false);

  // ── Background pan state (identical to PetHousePage) ──
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);
  const [panX, setPanX] = useState(0);
  const [bgAspect, setBgAspect] = useState(16 / 9);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const imgWidthRef = useRef(0);
  const containerHRef = useRef(0);
  const panXRef = useRef(0);
  useEffect(() => { imgWidthRef.current = imgWidth; }, [imgWidth]);
  useEffect(() => { containerHRef.current = containerH; }, [containerH]);
  useEffect(() => { panXRef.current = panX; }, [panX]);

  // ── Building editor state ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topmostId, setTopmostId] = useState<string | null>(null);
  const [localPos, setLocalPos] = useState<Record<string, { x: number; y: number }>>({});
  const buildingDragRef = useRef<{
    id: string; startX: number; startY: number;
    origX: number; origY: number; pid: number;
  } | null>(null);
  const buildingDidDrag = useRef(false);
  const isPanningRef = useRef(false);

  // ── Building bg upload state ──
  const [buildingBgUploading, setBuildingBgUploading] = useState<string | null>(null);
  const [previewBuilding, setPreviewBuilding] = useState<{ url: string; buildingId: string; leaveButtonX: number; leaveButtonY: number } | null>(null);

  // ── Gift notification position ──
  const giftXRef = useRef(bundle.giftNotificationX ?? 0.05);
  const giftYRef = useRef(bundle.giftNotificationY ?? 0.85);
  const [giftX, setGiftX] = useState(bundle.giftNotificationX ?? 0.05);
  const [giftY, setGiftY] = useState(bundle.giftNotificationY ?? 0.85);
  const giftDragRef = useRef<{ startX: number; startY: number; startGX: number; startGY: number; pid: number } | null>(null);
  const [isDraggingGift, setIsDraggingGift] = useState(false);

  const onGiftBtnDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    buildingDragRef.current = null;
    isPanningRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    giftDragRef.current = { startX: e.clientX, startY: e.clientY, startGX: giftXRef.current, startGY: giftYRef.current, pid: e.pointerId };
    setIsDraggingGift(true);
  }, []);

  const onGiftBtnMove = useCallback((e: React.PointerEvent) => {
    const drag = giftDragRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    const iw = imgWidthRef.current || w;
    // X is fraction of image width, Y is fraction of container height
    const newGX = Math.max(0, Math.min(1, drag.startGX + (e.clientX - drag.startX) / iw));
    const newGY = Math.max(0, Math.min(1, drag.startGY + (e.clientY - drag.startY) / h));
    giftXRef.current = newGX;
    giftYRef.current = newGY;
    setGiftX(newGX);
    setGiftY(newGY);
  }, []);

  const onGiftBtnUp = useCallback(async (e: React.PointerEvent) => {
    if (giftDragRef.current && giftDragRef.current.pid === e.pointerId) {
      giftDragRef.current = null;
      setIsDraggingGift(false);
      try {
        await apiRequest("PATCH", `/api/admin/house-bundles/${bundle.id}`, {
          giftNotificationX: giftXRef.current,
          giftNotificationY: giftYRef.current,
        });
        qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      } catch {
        toast({ title: "Failed to save position", variant: "destructive" });
      }
    }
  }, [bundle.id, qc, toast]);

  // ── Add building form ──
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newImage, setNewImage] = useState<string | null>(null);
  const [newSize, setNewSize] = useState<"small" | "medium" | "large">("medium");
  const addImgRef = useRef<HTMLInputElement>(null);

  // ── Fetch buildings ──
  const bgUrl = localBgUrl ?? bundle.shopImageUrl;

  // ── Immediate background upload (same pattern as Keeper's Central) ──
  const handleBgFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBgUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const updated = await apiRequest("PATCH", `/api/admin/house-bundles/${bundle.id}`, { bgImageData: dataUrl }) as HouseBundle;
      setLocalBgUrl(updated.bgImageUrl);
      if (updated.bgImageUrl) onBgUpdated?.(updated.bgImageUrl);
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setBgUploading(false);
    }
  }, [bundle.id, onBgUpdated, qc, toast]);

  const { data: buildings = [], refetch } = useQuery<HouseBundleBuilding[]>({
    queryKey: ["/api/admin/house-bundles", bundle.id, "buildings"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/house-bundles/${bundle.id}/buildings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 0,
  });

  // ── Background image aspect ratio ──
  useEffect(() => {
    if (!bgUrl) return;
    const img = new window.Image();
    img.onload = () => { if (img.naturalHeight > 0) setBgAspect(img.naturalWidth / img.naturalHeight); };
    img.src = bgUrl;
  }, [bgUrl]);

  // ── Container resize — height-fit + center (identical to PetHousePage) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const recalc = () => {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      const imgW = h * bgAspect;
      setContainerH(h);
      setImgWidth(imgW);
      // Center the image regardless of whether it's wider or narrower than the screen.
      // PetHousePage formula: Math.max(Math.min(0, w-imgW), (w-imgW)/2)
      //   Wide  (imgW > w): min = w-imgW (neg), center = (w-imgW)/2 (less neg) → center ✓
      //   Narrow(imgW < w): min = 0 (capped),  center = (w-imgW)/2 (pos)       → center ✓
      setPanX(Math.max(Math.min(0, w - imgW), (w - imgW) / 2));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [bgAspect]);

  // ── Mutations ──
  const patchBuilding = useMutation({
    mutationFn: async (data: { id: string; posX?: number; posY?: number; width?: number; flippedX?: boolean }) => {
      const { id, ...rest } = data;
      return apiRequest("PATCH", `/api/admin/house-bundle-buildings/${id}`, rest);
    },
    onSuccess: () => refetch(),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBuilding = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/house-bundle-buildings/${id}`),
    onSuccess: () => { setSelectedId(null); setLocalPos({}); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addBuilding = useMutation({
    mutationFn: async () => {
      if (!newName.trim() || !newImage) throw new Error("Name and image required");
      return apiRequest("POST", `/api/admin/house-bundles/${bundle.id}/buildings`, {
        name: newName.trim(), imageData: newImage, size: newSize,
      });
    },
    onSuccess: () => { setShowAddForm(false); setNewName(""); setNewImage(null); setNewSize("medium"); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const duplicateBuilding = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/house-bundle-buildings/${id}/duplicate`),
    onSuccess: () => refetch(),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleBuildingBgUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, buildingId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBuildingBgUploading(buildingId);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await apiRequest("PATCH", `/api/admin/house-bundle-buildings/${buildingId}`, { interiorImageData: dataUrl });
      const updated = await res.json() as HouseBundleBuilding;
      await refetch();
      if (updated.interiorImageUrl) setPreviewBuilding({ url: updated.interiorImageUrl, buildingId, leaveButtonX: updated.leaveButtonX ?? 0.92, leaveButtonY: updated.leaveButtonY ?? 0.06 });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setBuildingBgUploading(null);
    }
  }, [refetch, toast]);


  // ── Background pan handlers ──
  const handleContainerPointerDown = useCallback((e: React.PointerEvent) => {
    if (buildingDragRef.current) return;
    isPanningRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX]);

  const handleContainerPointerMove = useCallback((e: React.PointerEvent) => {
    if (buildingDragRef.current) return;
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 3) isPanningRef.current = true;
    const containerW = container.offsetWidth;
    const imgW = containerHRef.current * bgAspect;
    // Match recalc: center is the anchor for both wide (negative) and narrow (positive) images.
    const center = (containerW - imgW) / 2;
    const panMin = Math.min(center, containerW - imgW); // wide→ left-edge, narrow→ center
    const panMax = Math.max(center, 0);                 // wide→ 0,          narrow→ center
    setPanX(Math.max(panMin, Math.min(panMax, drag.startPanX + dx)));
  }, [bgAspect]);

  const handleContainerPointerUp = useCallback(() => {
    panStartRef.current = null;
    isPanningRef.current = false;
  }, []);

  // ── Building drag handlers ──
  const handleBuildingPointerDown = useCallback((e: React.PointerEvent, b: HouseBundleBuilding) => {
    e.stopPropagation();
    buildingDidDrag.current = false;
    setTopmostId(b.id);
    if (selectedId !== b.id) return; // first tap = select only
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const cur = localPos[b.id] ?? { x: b.posX, y: b.posY };
    buildingDragRef.current = { id: b.id, startX: e.clientX, startY: e.clientY, origX: cur.x, origY: cur.y, pid: e.pointerId };
  }, [selectedId, localPos]);

  const handleBuildingPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = buildingDragRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) buildingDidDrag.current = true;
    const newX = Math.max(0, Math.min(100, drag.origX + (dx / imgWidthRef.current) * 100));
    const newY = Math.max(0, Math.min(100, drag.origY + (dy / containerHRef.current) * 100));
    setLocalPos(prev => ({ ...prev, [drag.id]: { x: newX, y: newY } }));
  }, []);

  const handleBuildingPointerUp = useCallback((e: React.PointerEvent, b: HouseBundleBuilding) => {
    e.stopPropagation();
    const drag = buildingDragRef.current;
    if (drag && drag.pid === e.pointerId) {
      buildingDragRef.current = null;
      if (buildingDidDrag.current) {
        const pos = localPos[drag.id] ?? { x: b.posX, y: b.posY };
        patchBuilding.mutate({ id: drag.id, posX: pos.x, posY: pos.y });
      } else {
        setSelectedId(prev => prev === b.id ? null : b.id);
      }
      buildingDidDrag.current = false;
    } else {
      setSelectedId(prev => prev === b.id ? null : b.id);
    }
  }, [localPos, patchBuilding]);

  return (
    <div
      className="fixed inset-0 z-[60]"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, touchAction: "none", userSelect: "none" }}
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onPointerCancel={handleContainerPointerUp}
      onClick={() => setSelectedId(null)}
    >
      {/* Background — clipped separately so buildings can overflow the screen edge */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {bgUrl ? (
          <img
            src={bgUrl} alt="" draggable={false}
            style={{ position: "absolute", top: 0, left: `${panX}px`, height: "100%", width: "auto", maxWidth: "none" }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: "#0d1a0a" }} />
        )}
        {/* Ambient gradient */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 18%, transparent 72%, rgba(0,0,0,0.45) 100%)" }} />
      </div>

      {/* Buildings layer — NOT inside overflow:hidden so buildings near edges are never clipped */}
      {imgWidth > 0 && buildings.length > 0 && (
        <div className="absolute" style={{ top: 0, left: `${panX}px`, width: imgWidth, height: "100%", zIndex: 4, pointerEvents: "none" }}>
          {buildings.map(b => {
            const pos = localPos[b.id] ?? { x: b.posX, y: b.posY };
            const displayW = Math.round((b.width ?? 120) * (containerH || BUILDING_REF_H) / BUILDING_REF_H);
            const isSelected = selectedId === b.id;
            return (
              <div
                key={b.id}
                data-testid={`building-${b.id}`}
                className="absolute flex flex-col items-center gap-0.5"
                style={{
                  left: `${pos.x}%`, top: `${pos.y}%`,
                  transform: "translate(-50%, -100%)",
                  zIndex: topmostId === b.id ? 25 : isSelected ? 15 : 4,
                  cursor: isSelected ? "grab" : "pointer",
                  touchAction: "none",
                  pointerEvents: "auto",
                  minWidth: displayW,
                }}
                onPointerDown={e => handleBuildingPointerDown(e, b)}
                onPointerMove={e => { e.stopPropagation(); handleBuildingPointerMove(e); }}
                onPointerUp={e => handleBuildingPointerUp(e, b)}
                onPointerCancel={() => { buildingDragRef.current = null; buildingDidDrag.current = false; }}
                onClick={e => e.stopPropagation()}
              >
                {/* Selection highlight */}
                {isSelected && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      inset: -6, borderRadius: 8,
                      outline: "2.5px solid rgba(255,215,0,0.85)",
                      outlineOffset: 2,
                      boxShadow: "0 0 16px rgba(255,215,0,0.3)",
                    }}
                  />
                )}

                {/* 4-corner control buttons + duplicate + interior door */}
                {isSelected && (
                  <>
                    {/* Delete — top-left */}
                    <button
                      data-testid={`button-delete-building-${b.id}`}
                      onPointerDown={e => e.stopPropagation()}
                      onPointerUp={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); deleteBuilding.mutate(b.id); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ top: -16, left: -16, background: "rgba(220,38,38,0.95)", border: "2px solid rgba(255,100,100,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                    </button>
                    {/* Duplicate — top-center */}
                    <button
                      data-testid={`button-duplicate-building-${b.id}`}
                      onPointerDown={e => e.stopPropagation()}
                      onPointerUp={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); duplicateBuilding.mutate(b.id); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ top: -16, left: "50%", transform: "translateX(-50%)", background: "rgba(100,30,180,0.95)", border: "2px solid rgba(180,100,255,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                    >
                      <Copy className="w-3.5 h-3.5 text-white" />
                    </button>
                    {/* Flip — top-right */}
                    <button
                      data-testid={`button-flip-building-${b.id}`}
                      onPointerDown={e => e.stopPropagation()}
                      onPointerUp={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); patchBuilding.mutate({ id: b.id, flippedX: !b.flippedX }); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ top: -16, right: -16, background: "rgba(0,80,180,0.95)", border: "2px solid rgba(100,180,255,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                    >
                      <FlipHorizontal className="w-3.5 h-3.5 text-white" />
                    </button>
                    {/* Shrink — bottom-left */}
                    <button
                      data-testid={`button-shrink-building-${b.id}`}
                      onPointerDown={e => e.stopPropagation()}
                      onPointerUp={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); patchBuilding.mutate({ id: b.id, width: Math.max(20, b.width - 20) }); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ bottom: -20, left: -16, background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                    >
                      <Minus className="w-3.5 h-3.5 text-white" />
                    </button>
                    {/* Grow — bottom-right */}
                    <button
                      data-testid={`button-grow-building-${b.id}`}
                      onPointerDown={e => e.stopPropagation()}
                      onPointerUp={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); patchBuilding.mutate({ id: b.id, width: Math.min(400, b.width + 20) }); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ bottom: -20, right: -16, background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                    >
                      <Plus className="w-3.5 h-3.5 text-white" />
                    </button>
                    {/* Size label — center-bottom */}
                    <div
                      className="absolute z-30 flex items-center justify-center"
                      style={{ bottom: -32, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,200,50,0.4)", borderRadius: 5, padding: "1px 7px", pointerEvents: "none" }}
                    >
                      <span className="font-fantasy text-[9px] text-yellow-300">{b.width}px</span>
                    </div>
                  </>
                )}


                {/* Building image */}
                <img
                  src={b.imageUrl} alt={b.name} draggable={false}
                  style={{
                    width: displayW, height: displayW, objectFit: "contain",
                    filter: "drop-shadow(0 0 10px rgba(255,210,80,0.3)) drop-shadow(0 3px 6px rgba(0,0,0,0.55))",
                    transform: b.flippedX ? "scaleX(-1)" : undefined,
                    pointerEvents: "none",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Draggable gift notification ! button ── */}
      {localBgUrl && imgWidth > 0 && (
        <button
          data-testid="button-gift-notification-drag"
          style={{
            position: "absolute",
            left: panX + giftX * imgWidth,
            top: giftY * containerH,
            transform: "translate(-50%, -50%)",
            zIndex: 30,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "radial-gradient(circle, #22c55e 60%, #15803d 100%)",
            border: isDraggingGift ? "2.5px solid #ffd700" : "2.5px solid #4ade80",
            boxShadow: isDraggingGift ? "0 0 16px rgba(255,215,0,0.6)" : "0 0 14px rgba(74,222,128,0.7)",
            cursor: isDraggingGift ? "grabbing" : "grab",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            touchAction: "none",
          }}
          onPointerDown={onGiftBtnDown}
          onPointerMove={onGiftBtnMove}
          onPointerUp={onGiftBtnUp}
          onPointerCancel={onGiftBtnUp}
        >
          <span style={{ fontSize: 16, fontWeight: "bold", color: "#fff", lineHeight: 1, pointerEvents: "none" }}>!</span>
        </button>
      )}

      {/* ── Back button ── */}
      <button
        data-testid="button-close-bg-editor"
        onClick={e => { e.stopPropagation(); onClose(); }}
        onPointerDown={e => e.stopPropagation()}
        className="absolute top-14 left-4 flex items-center gap-2 px-3 py-2 rounded-full font-fantasy text-[11px]"
        style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,215,0,0.3)", color: GOLD, cursor: "pointer", zIndex: 30 }}
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      {/* ── Upload Background button — top-right, exact same pattern as Keeper's Central ── */}
      <label
        data-testid="label-upload-bg"
        className="absolute top-14 right-4 flex items-center gap-1.5 px-3 py-2 rounded-full font-fantasy text-[11px]"
        style={{ background: "rgba(0,0,0,0.65)", border: `1px solid ${bgUploading ? "rgba(255,215,0,0.7)" : "rgba(255,215,0,0.3)"}`, color: bgUploading ? GOLD : "rgba(255,215,0,0.65)", cursor: bgUploading ? "wait" : "pointer", zIndex: 30 }}
        onPointerDown={e => e.stopPropagation()}
      >
        <Image className="w-4 h-4" />
        {bgUploading ? "Uploading…" : bgUrl ? "Change BG" : "Upload BG"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif"
          className="hidden"
          disabled={bgUploading}
          onChange={handleBgFileChange}
        />
      </label>

      {/* ── Hint ── */}
      {selectedId === null && buildings.length > 0 && (
        <div
          className="absolute top-14 left-0 right-0 flex justify-center pointer-events-none"
          style={{ zIndex: 10 }}
        >
          <p className="font-fantasy text-[9px] px-3 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.5)", color: "rgba(255,215,0,0.5)" }}>
            Tap a building · drag to move · Set BG to add interior
          </p>
        </div>
      )}

      {/* ── Bottom bar ── */}
      <div
        className="absolute bottom-0 left-0 right-0 flex gap-3 px-4"
        style={{ zIndex: 30, paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)", paddingTop: 12, background: "linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)" }}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {selectedId ? (() => {
          const selBuilding = buildings.find(b => b.id === selectedId);
          const hasInterior = !!selBuilding?.interiorImageUrl;
          return (
            <>
              {/* Set BG — same label pattern as the working "Change BG" button */}
              <label
                data-testid="label-set-building-bg"
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl font-fantasy text-sm tracking-widest"
                style={{
                  background: buildingBgUploading ? "rgba(255,215,0,0.2)" : GOLD_DIM,
                  border: `1px solid ${buildingBgUploading ? "rgba(255,215,0,0.7)" : "rgba(255,215,0,0.4)"}`,
                  color: buildingBgUploading ? GOLD : "rgba(255,215,0,0.8)",
                  cursor: buildingBgUploading ? "wait" : "pointer",
                }}
                onPointerDown={e => e.stopPropagation()}
              >
                <Image className="w-4 h-4" />
                {buildingBgUploading ? "Uploading…" : hasInterior ? "Change BG" : "Set BG"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!!buildingBgUploading}
                  onChange={e => handleBuildingBgUpload(e, selectedId)}
                />
              </label>
              {/* Preview — only when building has a background */}
              {hasInterior && (
                <button
                  data-testid="button-preview-building-bg"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); if (selBuilding?.interiorImageUrl) setPreviewBuilding({ url: selBuilding.interiorImageUrl, buildingId: selBuilding.id, leaveButtonX: selBuilding.leaveButtonX ?? 0.92, leaveButtonY: selBuilding.leaveButtonY ?? 0.06 }); }}
                  className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-widest"
                  style={{ background: "rgba(30,50,120,0.3)", border: "1px solid rgba(100,150,255,0.4)", color: "rgba(150,200,255,0.9)", cursor: "pointer" }}
                >
                  Preview
                </button>
              )}
              {/* Done */}
              <button
                data-testid="button-done-building"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setSelectedId(null); }}
                className="py-3 px-4 rounded-xl font-fantasy text-sm tracking-widest"
                style={{ background: "rgba(100,200,100,0.15)", border: "1px solid rgba(100,200,100,0.4)", color: "#86efac", cursor: "pointer" }}
              >
                Done
              </button>
            </>
          );
        })() : (
          <>
            <button
              data-testid="button-add-building"
              onClick={() => setShowAddForm(true)}
              className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
              style={{ background: GOLD_DIM, border: "1px solid rgba(255,215,0,0.4)", color: GOLD, cursor: "pointer" }}
            >
              + Add Building
            </button>
            <button
              data-testid="button-save-bundle-editor"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
              style={{ background: "rgba(100,200,100,0.15)", border: "1px solid rgba(100,200,100,0.4)", color: "#86efac", cursor: "pointer" }}
            >
              Save Bundle ✓
            </button>
          </>
        )}
      </div>

      {/* ── Add Building form ── */}
      {showAddForm && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
          onPointerDown={e => e.stopPropagation()}
        >
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowAddForm(false)} />
          <div className="relative w-full rounded-t-2xl flex flex-col" style={{ backgroundColor: "#0d0a04", border: `1px solid ${GOLD_BORDER}`, maxHeight: "75dvh" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}>
              <p className="font-fantasy text-sm tracking-widest" style={{ color: GOLD }}>Add Building</p>
              <button onClick={() => setShowAddForm(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
              {/* Image upload — label style matching ExploreAdminPanel */}
              {newImage ? (
                <div className="relative w-full h-36 rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD_BORDER}` }}>
                  <img src={newImage} alt="preview" className="w-full h-full object-contain" style={{ background: "rgba(0,0,0,0.3)" }} />
                  <button
                    data-testid="button-clear-building-image"
                    onClick={() => setNewImage(null)}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,100,100,0.5)", color: "#f87171", cursor: "pointer" }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label
                  data-testid="button-upload-building-image"
                  className="block w-full py-3 rounded-xl font-fantasy text-[10px] tracking-wider text-center transition-transform active:scale-95"
                  style={{ background: GOLD_DIM, border: `1px dashed rgba(255,215,0,0.4)`, color: `rgba(255,215,0,0.8)`, cursor: "pointer" }}
                >
                  <Image className="w-4 h-4 inline mr-2 mb-0.5" />
                  Upload Building Image (PNG)
                  <input
                    ref={addImgRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (file) { const d = await readFileAsDataUrl(file); setNewImage(d); }
                      e.target.value = "";
                    }}
                  />
                </label>
              )}

              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Building Name</p>
                <input
                  data-testid="input-building-name"
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Blacksmith's Forge"
                  className="w-full rounded-xl px-3 py-2.5 font-fantasy text-[11px]"
                  style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, outline: "none" }}
                />
              </div>

              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Building Size</p>
                <div className="grid grid-cols-3 gap-2">
                  {BUILDING_SIZES.map(s => (
                    <button
                      key={s.value}
                      data-testid={`button-size-${s.value}`}
                      type="button"
                      onClick={() => setNewSize(s.value)}
                      className="py-2.5 rounded-xl flex flex-col items-center gap-0.5 transition-transform active:scale-95"
                      style={{
                        background: newSize === s.value ? "rgba(255,215,0,0.18)" : GOLD_DIM,
                        border: `1px solid ${newSize === s.value ? "rgba(255,215,0,0.55)" : GOLD_BORDER}`,
                        color: newSize === s.value ? GOLD : "rgba(255,215,0,0.55)",
                        cursor: "pointer",
                      }}
                    >
                      <span className="font-fantasy text-[11px] tracking-wider">{s.label}</span>
                      <span className="font-fantasy text-[8px] opacity-70">{s.caption}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                data-testid="button-confirm-add-building"
                onClick={() => addBuilding.mutate()}
                disabled={addBuilding.isPending || !newName.trim() || !newImage}
                className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
                style={{
                  background: (newName.trim() && newImage) ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.05)",
                  border: `1px solid ${(newName.trim() && newImage) ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`,
                  color: (newName.trim() && newImage) ? GOLD : "rgba(255,215,0,0.3)",
                  cursor: (newName.trim() && newImage) ? "pointer" : "not-allowed",
                }}
              >
                {addBuilding.isPending ? "Adding..." : "Add Building"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin interior preview (full-screen panning with draggable Leave button) ── */}
      {previewBuilding && (
        <AdminInteriorPreview
          url={previewBuilding.url}
          buildingId={previewBuilding.buildingId}
          initialLeaveX={previewBuilding.leaveButtonX}
          initialLeaveY={previewBuilding.leaveButtonY}
          onClose={() => setPreviewBuilding(null)}
          onSaveLeavePos={(x, y) => {
            apiRequest("PATCH", `/api/admin/house-bundle-buildings/${previewBuilding.buildingId}`, { leaveButtonX: x, leaveButtonY: y })
              .catch(() => {});
            setPreviewBuilding(prev => prev ? { ...prev, leaveButtonX: x, leaveButtonY: y } : null);
          }}
        />
      )}
    </div>
  );
}

// ─── Decor sub-tab ─────────────────────────────────────────────────────────────
function DecorSubTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useQuery<HomeDecorItem[]>({ queryKey: ["/api/admin/home-decor"], staleTime: 0 });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      return apiRequest("POST", "/api/admin/home-decor", { name: name.trim(), price: price.trim() ? parseInt(price, 10) : 0, imageData: imageData ?? undefined });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/home-decor"] });
      toast({ title: "Decor item created!" });
      setShowForm(false); setName(""); setPrice(""); setImageData(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/home-decor/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/home-decor"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-fantasy text-[10px]" style={{ color: "rgba(255,215,0,0.5)" }}>{isLoading ? "Loading..." : `${items.length} item${items.length !== 1 ? "s" : ""}`}</p>
        <button data-testid="button-add-decor" onClick={() => setShowForm(true)} className="px-4 py-1.5 rounded-full font-fantasy text-[10px] tracking-wide" style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}>+ Add Decor</button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24"><p className="font-fantasy text-xs animate-pulse" style={{ color: "rgba(255,215,0,0.4)" }}>Loading...</p></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32"><p className="font-fantasy text-xs" style={{ color: "rgba(255,215,0,0.3)" }}>No decor items yet</p></div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(item => (
            <div key={item.id} data-testid={`row-decor-${item.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: BG_CARD, border: `1px solid ${GOLD_BORDER}` }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ background: "rgba(255,215,0,0.08)", border: `1.5px solid ${GOLD_BORDER}` }}>
                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" /> : <span className="font-fantasy text-lg" style={{ color: GOLD }}>🏺</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-fantasy text-[11px] tracking-wide truncate" style={{ color: GOLD }}>{item.name}</p>
                <p className="font-fantasy text-[9px]" style={{ color: "rgba(255,215,0,0.4)" }}>{item.price.toLocaleString()} coins</p>
              </div>
              <button data-testid={`button-delete-decor-${item.id}`} onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(200,50,50,0.15)", border: "1px solid rgba(200,50,50,0.3)", cursor: "pointer" }}>
                <Trash2 className="w-3.5 h-3.5" style={{ color: "#f87171" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="relative w-full rounded-t-2xl flex flex-col" style={{ backgroundColor: "#0d0a04", border: `1px solid ${GOLD_BORDER}`, maxHeight: "85dvh" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}>
              <p className="font-fantasy text-sm tracking-widest" style={{ color: GOLD }}>Add Decor Item</p>
              <button data-testid="button-close-decor-form" onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
              {imageData ? (
                <div className="relative w-full h-28 rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD_BORDER}` }}>
                  <img src={imageData} alt="preview" className="w-full h-full object-contain" style={{ background: "rgba(0,0,0,0.3)" }} />
                  <button onClick={() => setImageData(null)} className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,100,100,0.5)", color: "#f87171", cursor: "pointer" }}><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <label data-testid="button-upload-decor-image" className="block w-full py-3 rounded-xl font-fantasy text-[10px] tracking-wider text-center" style={{ background: GOLD_DIM, border: `1px dashed rgba(255,215,0,0.4)`, color: `rgba(255,215,0,0.8)`, cursor: "pointer" }}>
                  <Upload className="w-4 h-4 inline mr-2 mb-0.5" />Upload Decor Image (PNG/JPEG, max 15MB)
                  <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { const d = await readFileAsDataUrl(f); setImageData(d); } e.target.value = ""; }} />
                </label>
              )}
              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Decor Name</p>
                <input data-testid="input-decor-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wooden Stool" className="w-full rounded-xl px-3 py-2.5 font-fantasy text-[11px]" style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, outline: "none" }} />
              </div>
              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Price (coins)</p>
                <input data-testid="input-decor-price" type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" className="w-full rounded-xl px-3 py-2.5 font-fantasy text-[11px]" style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, outline: "none" }} />
              </div>
              <button data-testid="button-save-decor" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !name.trim()} className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95" style={{ background: name.trim() ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.05)", border: `1px solid ${name.trim() ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`, color: name.trim() ? GOLD : "rgba(255,215,0,0.3)", cursor: name.trim() ? "pointer" : "not-allowed" }}>
                {createMutation.isPending ? "Saving..." : "Save Decor Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bundles sub-tab ──────────────────────────────────────────────────────────
function BundlesSubTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editingBundle, setEditingBundle] = useState<HouseBundle | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showBgEditor, setShowBgEditor] = useState(false);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [shopImagePreview, setShopImagePreview] = useState<string | null>(null);
  const [bgImagePreview, setBgImagePreview] = useState<string | null>(null);

  // For create form — held in state until POST
  const [createShopImageData, setCreateShopImageData] = useState<string | null>(null);
  const [createBgImageData, setCreateBgImageData] = useState<string | null>(null);

  const [shopUploading, setShopUploading] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);

  const { data: bundles = [], isLoading } = useQuery<HouseBundle[]>({
    queryKey: ["/api/admin/house-bundles"], staleTime: 0,
  });

  const openEdit = (bundle: HouseBundle) => {
    setEditingBundle(bundle);
    setName(bundle.name);
    setPrice(String(bundle.price));
    setShopImagePreview(bundle.shopImageUrl);
    setBgImagePreview(bundle.bgImageUrl);
    setCreateShopImageData(null);
    setCreateBgImageData(null);
    setShowCreateForm(false);
  };

  const openCreate = () => {
    setEditingBundle(null);
    setName(""); setPrice("");
    setShopImagePreview(null); setBgImagePreview(null);
    setCreateShopImageData(null); setCreateBgImageData(null);
    setShowCreateForm(true);
  };

  const closeForm = () => {
    setEditingBundle(null); setShowCreateForm(false); setShowBgEditor(false);
  };

  // ── Immediate upload for existing bundle (matches ExploreAdminPanel pattern) ──
  const uploadBgImmediate = async (file: File, bundleId: string) => {
    setBgUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await apiRequest("PATCH", `/api/admin/house-bundles/${bundleId}`, { bgImageData: dataUrl });
      const updated: HouseBundle = await res.json();
      setBgImagePreview(updated.bgImageUrl);
      setEditingBundle(updated);
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Background uploaded!" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBgUploading(false);
    }
  };

  const uploadShopImmediate = async (file: File, bundleId: string) => {
    setShopUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await apiRequest("PATCH", `/api/admin/house-bundles/${bundleId}`, { shopImageData: dataUrl });
      const updated: HouseBundle = await res.json();
      setShopImagePreview(updated.shopImageUrl);
      setEditingBundle(updated);
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Thumbnail uploaded!" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setShopUploading(false);
    }
  };

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      return apiRequest("POST", "/api/admin/house-bundles", {
        name: name.trim(),
        price: price.trim() ? parseInt(price, 10) : 0,
        shopImageData: createShopImageData ?? undefined,
        bgImageData: createBgImageData ?? undefined,
      });
    },
    onSuccess: async res => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Home bundle created!" });
      try {
        const newBundle: HouseBundle = await res.json();
        setEditingBundle(newBundle);
        setShopImagePreview(newBundle.shopImageUrl);
        setBgImagePreview(newBundle.bgImageUrl);
        setCreateShopImageData(null); setCreateBgImageData(null);
        setShowCreateForm(false);
      } catch { closeForm(); }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveDetailsMutation = useMutation({
    mutationFn: async () => {
      if (!editingBundle || !name.trim()) throw new Error("Name is required");
      return apiRequest("PATCH", `/api/admin/house-bundles/${editingBundle.id}`, {
        name: name.trim(),
        price: price.trim() ? parseInt(price, 10) : 0,
      });
    },
    onSuccess: async res => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Details saved!" });
      try { const u: HouseBundle = await res.json(); setEditingBundle(u); } catch {}
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/house-bundles/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] }); toast({ title: "Deleted" }); closeForm(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const grantEveryoneMutation = useMutation({
    mutationFn: async (bundleId: string) => {
      const res = await apiRequest("POST", `/api/admin/house-bundles/${bundleId}/grant-everyone`, {});
      return res.json() as Promise<{ granted: number; activated: number; alreadyOwned: number; total: number }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Granted to all players!",
        description: `${data.granted} new grants · ${data.activated} activated · ${data.alreadyOwned} already had it (${data.total} total players)`,
      });
    },
    onError: (e: any) => toast({ title: "Grant failed", description: e.message, variant: "destructive" }),
  });

  const hasBg = !!(bgImagePreview ?? editingBundle?.bgImageUrl);
  const isEditing = !!editingBundle;
  const showForm = isEditing || showCreateForm;

  // ── Background editor ──
  if (showBgEditor && editingBundle) {
    return <BundleBgEditor bundle={{ ...editingBundle, bgImageUrl: bgImagePreview ?? editingBundle.bgImageUrl }} onClose={() => setShowBgEditor(false)} onBgUpdated={url => setBgImagePreview(url)} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-fantasy text-[10px]" style={{ color: "rgba(255,215,0,0.5)" }}>{isLoading ? "Loading..." : `${bundles.length} bundle${bundles.length !== 1 ? "s" : ""}`}</p>
        <button data-testid="button-add-home-bundle" onClick={openCreate} className="px-4 py-1.5 rounded-full font-fantasy text-[10px] tracking-wide" style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}>+ Add Home Bundle</button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24"><p className="font-fantasy text-xs animate-pulse" style={{ color: "rgba(255,215,0,0.4)" }}>Loading...</p></div>
      ) : bundles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32"><p className="font-fantasy text-xs" style={{ color: "rgba(255,215,0,0.3)" }}>No home bundles yet</p></div>
      ) : (
        <div className="flex flex-col gap-2">
          {bundles.map(bundle => (
            <button
              key={bundle.id}
              data-testid={`row-bundle-${bundle.id}`}
              onClick={() => openEdit(bundle)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 w-full text-left"
              style={{ background: editingBundle?.id === bundle.id ? "rgba(255,215,0,0.1)" : BG_CARD, border: `1px solid ${editingBundle?.id === bundle.id ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`, cursor: "pointer" }}
            >
              <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ background: "rgba(255,215,0,0.08)", border: `1.5px solid ${GOLD_BORDER}` }}>
                {bundle.shopImageUrl ? <img src={bundle.shopImageUrl} alt={bundle.name} className="w-full h-full object-contain" /> : <span className="font-fantasy text-lg">🏡</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-fantasy text-[11px] tracking-wide truncate" style={{ color: GOLD }}>{bundle.name}</p>
                <p className="font-fantasy text-[9px]" style={{ color: "rgba(255,215,0,0.4)" }}>{bundle.price.toLocaleString()} coins{bundle.bgImageUrl ? " · has background" : ""}</p>
              </div>
              <span className="font-fantasy text-[9px] shrink-0" style={{ color: "rgba(255,215,0,0.4)" }}>Edit →</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Bundle form (create or edit) ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={closeForm} />
          <div className="relative w-full rounded-t-2xl flex flex-col" style={{ backgroundColor: "#0d0a04", border: `1px solid ${GOLD_BORDER}`, maxHeight: "92dvh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}>
              <p className="font-fantasy text-sm tracking-widest" style={{ color: GOLD }}>{isEditing ? editingBundle!.name : "Add Home Bundle"}</p>
              <div className="flex items-center gap-2">
                {isEditing && (
                  <button data-testid={`button-delete-bundle-${editingBundle!.id}`} onClick={() => deleteMutation.mutate(editingBundle!.id)} disabled={deleteMutation.isPending} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(200,50,50,0.15)", border: "1px solid rgba(200,50,50,0.3)", cursor: "pointer" }}>
                    <Trash2 className="w-3.5 h-3.5" style={{ color: "#f87171" }} />
                  </button>
                )}
                <button data-testid="button-close-bundle-form" onClick={closeForm} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
              {/* Shop thumbnail — immediate upload if editing, stored if creating */}
              <div>
                <p className="font-fantasy text-[10px] mb-2" style={{ color: GOLD }}>Shop / Inventory Thumbnail</p>
                {shopImagePreview ? (
                  <div className="relative w-full h-28 rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD_BORDER}` }}>
                    <img src={shopImagePreview} alt="shop thumbnail" className="w-full h-full object-contain" style={{ background: "rgba(0,0,0,0.3)" }} />
                    <label
                      data-testid="button-replace-shop-image"
                      className="absolute bottom-2 right-2 px-3 py-1 rounded-full font-fantasy text-[9px] tracking-wide"
                      style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,215,0,0.4)", color: GOLD, cursor: shopUploading ? "wait" : "pointer" }}
                    >
                      {shopUploading ? "Uploading..." : "Replace"}
                      <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={shopUploading}
                        onChange={async e => {
                          const f = e.target.files?.[0]; if (!f) return; e.target.value = "";
                          if (isEditing) { await uploadShopImmediate(f, editingBundle!.id); }
                          else { const d = await readFileAsDataUrl(f); setCreateShopImageData(d); setShopImagePreview(d); }
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <label
                    data-testid="button-upload-shop-image"
                    className="block w-full py-3 rounded-xl font-fantasy text-[10px] tracking-wider text-center"
                    style={{ background: GOLD_DIM, border: `1px dashed rgba(255,215,0,0.4)`, color: `rgba(255,215,0,0.8)`, cursor: shopUploading ? "wait" : "pointer" }}
                  >
                    <Upload className="w-4 h-4 inline mr-2 mb-0.5" />
                    {shopUploading ? "Uploading..." : "Upload Shop Thumbnail (max 15MB)"}
                    <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={shopUploading}
                      onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return; e.target.value = "";
                        if (isEditing) { await uploadShopImmediate(f, editingBundle!.id); }
                        else { const d = await readFileAsDataUrl(f); setCreateShopImageData(d); setShopImagePreview(d); }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Background image — immediate upload if editing */}
              <div>
                <p className="font-fantasy text-[10px] mb-2" style={{ color: GOLD }}>Background Image — shown in Pet House</p>
                {bgImagePreview ? (
                  <div className="relative w-full h-28 rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD_BORDER}` }}>
                    <img src={bgImagePreview} alt="background" className="w-full h-full object-cover" />
                    <label
                      data-testid="button-replace-bg-image"
                      className="absolute bottom-2 right-2 px-3 py-1 rounded-full font-fantasy text-[9px] tracking-wide"
                      style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,215,0,0.4)", color: GOLD, cursor: bgUploading ? "wait" : "pointer" }}
                    >
                      {bgUploading ? "Uploading..." : "Replace"}
                      <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={bgUploading}
                        onChange={async e => {
                          const f = e.target.files?.[0]; if (!f) return; e.target.value = "";
                          if (isEditing) { await uploadBgImmediate(f, editingBundle!.id); }
                          else { const d = await readFileAsDataUrl(f); setCreateBgImageData(d); setBgImagePreview(d); }
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <label
                    data-testid="button-upload-bg-image"
                    className="block w-full py-3 rounded-xl font-fantasy text-[10px] tracking-wider text-center"
                    style={{ background: GOLD_DIM, border: `1px dashed rgba(255,215,0,0.4)`, color: `rgba(255,215,0,0.8)`, cursor: bgUploading ? "wait" : "pointer" }}
                  >
                    <Image className="w-4 h-4 inline mr-2 mb-0.5" />
                    {bgUploading ? "Uploading..." : "Upload Background Image (max 15MB)"}
                    <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={bgUploading}
                      onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return; e.target.value = "";
                        if (isEditing) { await uploadBgImmediate(f, editingBundle!.id); }
                        else { const d = await readFileAsDataUrl(f); setCreateBgImageData(d); setBgImagePreview(d); }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Name */}
              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Bundle Name</p>
                <input data-testid="input-bundle-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cozy Cottage" className="w-full rounded-xl px-3 py-2.5 font-fantasy text-[11px]" style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, outline: "none" }} />
              </div>

              {/* Price */}
              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Price (coins)</p>
                <input data-testid="input-bundle-price" type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" className="w-full rounded-xl px-3 py-2.5 font-fantasy text-[11px]" style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, outline: "none" }} />
              </div>

              {/* Save details / Create */}
              {isEditing ? (
                <button
                  data-testid="button-save-bundle-details"
                  onClick={() => saveDetailsMutation.mutate()}
                  disabled={saveDetailsMutation.isPending || !name.trim()}
                  className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
                  style={{ background: name.trim() ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.05)", border: `1px solid ${name.trim() ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`, color: name.trim() ? GOLD : "rgba(255,215,0,0.3)", cursor: name.trim() ? "pointer" : "not-allowed" }}
                >
                  {saveDetailsMutation.isPending ? "Saving..." : "Save Name & Price"}
                </button>
              ) : (
                <button
                  data-testid="button-save-bundle"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !name.trim()}
                  className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
                  style={{ background: name.trim() ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.05)", border: `1px solid ${name.trim() ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`, color: name.trim() ? GOLD : "rgba(255,215,0,0.3)", cursor: name.trim() ? "pointer" : "not-allowed" }}
                >
                  {createMutation.isPending ? "Creating..." : "Create Home Bundle"}
                </button>
              )}

              {/* Continue to Edit (background editor) */}
              {isEditing && (
                <button
                  data-testid="button-continue-to-edit"
                  onClick={() => setShowBgEditor(true)}
                  disabled={!hasBg}
                  className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
                  style={{
                    background: hasBg ? "rgba(100,180,100,0.15)" : "rgba(100,180,100,0.04)",
                    border: `1px solid ${hasBg ? "rgba(100,200,100,0.4)" : "rgba(100,200,100,0.1)"}`,
                    color: hasBg ? "#86efac" : "rgba(134,239,172,0.3)",
                    cursor: hasBg ? "pointer" : "not-allowed",
                  }}
                >
                  {hasBg ? "Continue to Edit →" : "Upload a background to continue"}
                </button>
              )}

              {/* Grant to All Players */}
              {isEditing && (
                <div style={{ borderTop: `1px solid ${GOLD_BORDER}`, paddingTop: 12, marginTop: 4 }}>
                  <p className="font-fantasy text-[9px] mb-2 text-center" style={{ color: "rgba(255,215,0,0.4)" }}>
                    Admin Actions
                  </p>
                  <button
                    data-testid="button-grant-bundle-everyone"
                    onClick={() => grantEveryoneMutation.mutate(editingBundle!.id)}
                    disabled={grantEveryoneMutation.isPending}
                    className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
                    style={{
                      background: "rgba(80,140,255,0.12)",
                      border: "1px solid rgba(80,140,255,0.35)",
                      color: grantEveryoneMutation.isPending ? "rgba(150,190,255,0.5)" : "rgba(150,190,255,0.9)",
                      cursor: grantEveryoneMutation.isPending ? "wait" : "pointer",
                    }}
                  >
                    {grantEveryoneMutation.isPending ? "Granting…" : "Grant to All Players"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────
export default function HomeBundleSection() {
  const [tab, setTab] = useState<"decor" | "bundles">("decor");
  const TABS = [{ key: "decor" as const, label: "Decor" }, { key: "bundles" as const, label: "Home Bundles" }];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD_BORDER}` }}>
        {TABS.map(t => (
          <button
            key={t.key}
            data-testid={`tab-home-bundle-${t.key}`}
            onClick={() => setTab(t.key)}
            className="flex-1 py-2.5 font-fantasy text-[11px] tracking-wide transition-all"
            style={{
              background: tab === t.key ? "rgba(255,215,0,0.15)" : "transparent",
              borderRight: t.key === "decor" ? `1px solid ${GOLD_BORDER}` : undefined,
              color: tab === t.key ? GOLD : "rgba(255,215,0,0.4)",
              cursor: "pointer",
            }}
          >{t.label}</button>
        ))}
      </div>
      {tab === "decor" && <DecorSubTab />}
      {tab === "bundles" && <BundlesSubTab />}
    </div>
  );
}
