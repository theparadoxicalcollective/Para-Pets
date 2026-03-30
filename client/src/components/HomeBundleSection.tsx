import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Upload, X, ChevronLeft } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";

interface HomeDecorItem {
  id: string;
  name: string;
  imageUrl: string | null;
  price: number;
  createdAt: string;
}

interface HouseBundle {
  id: string;
  name: string;
  shopImageUrl: string | null;
  bgImageUrl: string | null;
  price: number;
  createdAt: string;
}

const GOLD = "#ffd700";
const GOLD_DIM = "rgba(255,215,0,0.12)";
const GOLD_BORDER = "rgba(255,215,0,0.2)";
const BG_CARD = "rgba(255,215,0,0.04)";

function FileUploadBox({
  preview,
  onFile,
  onClear,
  label,
  testId,
}: {
  preview: string | null;
  onFile: (data: string) => void;
  onClear: () => void;
  label: string;
  testId: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await readFileAsDataUrl(file);
    onFile(data);
    e.target.value = "";
  };
  return (
    <div>
      <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>{label}</p>
      {preview ? (
        <div className="relative w-full h-28 rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD_BORDER}` }}>
          <img src={preview} alt="preview" className="w-full h-full object-contain" style={{ background: "rgba(0,0,0,0.3)" }} />
          <button
            data-testid={`${testId}-clear`}
            onClick={onClear}
            className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,100,100,0.5)", color: "#f87171", cursor: "pointer" }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          data-testid={`${testId}-upload`}
          onClick={() => ref.current?.click()}
          className="w-full h-28 rounded-xl flex flex-col items-center justify-center gap-2"
          style={{ background: GOLD_DIM, border: `1.5px dashed ${GOLD_BORDER}`, cursor: "pointer" }}
        >
          <Upload className="w-5 h-5" style={{ color: GOLD }} />
          <p className="font-fantasy text-[10px]" style={{ color: "rgba(255,215,0,0.6)" }}>Click to upload (max 15MB)</p>
        </button>
      )}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={handleChange} data-testid={testId} />
    </div>
  );
}

function BundleBgEditor({ bundle, onClose }: { bundle: HouseBundle; onClose: () => void }) {
  const bgUrl = bundle.bgImageUrl ?? bundle.shopImageUrl;
  const [panX, setPanX] = useState(0);
  const [bgAspect, setBgAspect] = useState(16 / 9);
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);
  const [imgWidth, setImgWidth] = useState(0);

  useEffect(() => {
    if (!bgUrl) return;
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalHeight > 0) setBgAspect(img.naturalWidth / img.naturalHeight);
    };
    img.src = bgUrl;
  }, [bgUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const recalc = () => {
      const containerW = container.offsetWidth;
      const h = container.offsetHeight;
      const imgW = h * bgAspect;
      setImgWidth(imgW);
      setPanX(Math.max(Math.min(0, containerW - imgW), -(imgW - containerW) / 2));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [bgAspect]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const containerW = container.offsetWidth;
    const h = container.offsetHeight;
    const imgW = h * bgAspect;
    const min = Math.min(0, containerW - imgW);
    setPanX(Math.min(0, Math.max(min, drag.startPanX + (e.clientX - drag.startX))));
  }, [bgAspect]);

  const handlePointerUp = useCallback(() => {
    panStartRef.current = null;
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-hidden"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, touchAction: "none", userSelect: "none" }}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {bgUrl ? (
        <img
          src={bgUrl}
          alt="background"
          draggable={false}
          style={{
            position: "absolute",
            top: 0,
            left: `${panX}px`,
            height: "100%",
            width: `${imgWidth}px`,
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "#0d1a0a" }} />
      )}

      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.4) 100%)" }} />

      <button
        data-testid="button-close-bg-editor"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-4 left-4 flex items-center gap-2 px-3 py-2 rounded-full font-fantasy text-[11px]"
        style={{
          background: "rgba(0,0,0,0.65)",
          border: "1px solid rgba(255,215,0,0.3)",
          color: GOLD,
          cursor: "pointer",
          zIndex: 10,
          paddingTop: "env(safe-area-inset-top, 16px)",
        }}
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <div
        className="absolute bottom-0 left-0 right-0 px-4 py-4 flex flex-col items-center gap-2"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="font-fantasy text-xs tracking-widest" style={{ color: "rgba(255,215,0,0.7)", textShadow: "0 0 12px rgba(0,0,0,0.8)" }}>
          {bundle.name}
        </p>
        <p className="font-fantasy text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          Drag left/right to preview background
        </p>
      </div>
    </div>
  );
}

function DecorSubTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery<HomeDecorItem[]>({
    queryKey: ["/api/admin/home-decor"],
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      return apiRequest("POST", "/api/admin/home-decor", {
        name: name.trim(),
        price: price.trim() ? parseInt(price.trim(), 10) : 0,
        imageData: imageData ?? undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/home-decor"] });
      toast({ title: "Decor item created!" });
      setShowForm(false);
      setName("");
      setPrice("");
      setImageData(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/home-decor/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/home-decor"] });
      toast({ title: "Deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-fantasy text-[10px]" style={{ color: "rgba(255,215,0,0.5)" }}>
          {isLoading ? "Loading..." : `${items.length} item${items.length !== 1 ? "s" : ""}`}
        </p>
        <button
          data-testid="button-add-decor"
          onClick={() => setShowForm(true)}
          className="px-4 py-1.5 rounded-full font-fantasy text-[10px] tracking-wide"
          style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}
        >+ Add Decor</button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <p className="font-fantasy text-xs animate-pulse" style={{ color: "rgba(255,215,0,0.4)" }}>Loading...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2">
          <p className="font-fantasy text-xs" style={{ color: "rgba(255,215,0,0.3)" }}>No decor items yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(item => (
            <div
              key={item.id}
              data-testid={`row-decor-${item.id}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: BG_CARD, border: `1px solid ${GOLD_BORDER}` }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                style={{ background: "rgba(255,215,0,0.08)", border: `1.5px solid ${GOLD_BORDER}` }}
              >
                {item.imageUrl
                  ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                  : <span className="font-fantasy text-lg" style={{ color: GOLD }}>🏺</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-fantasy text-[11px] tracking-wide truncate" style={{ color: GOLD }}>{item.name}</p>
                <p className="font-fantasy text-[9px]" style={{ color: "rgba(255,215,0,0.4)" }}>{item.price.toLocaleString()} coins</p>
              </div>
              <button
                data-testid={`button-delete-decor-${item.id}`}
                onClick={() => deleteMutation.mutate(item.id)}
                disabled={deleteMutation.isPending}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(200,50,50,0.15)", border: "1px solid rgba(200,50,50,0.3)", cursor: "pointer" }}
              >
                <Trash2 className="w-3.5 h-3.5" style={{ color: "#f87171" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <div
            className="relative w-full rounded-t-2xl overflow-hidden flex flex-col"
            style={{ backgroundColor: "#0d0a04", border: `1px solid ${GOLD_BORDER}`, maxHeight: "85dvh" }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}>
              <p className="font-fantasy text-sm tracking-widest" style={{ color: GOLD }}>Add Decor Item</p>
              <button
                data-testid="button-close-decor-form"
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
              <FileUploadBox
                preview={imageData}
                onFile={setImageData}
                onClear={() => setImageData(null)}
                label="Decor Image (PNG/JPEG, max 15MB)"
                testId="input-decor-image"
              />
              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Decor Name</p>
                <input
                  data-testid="input-decor-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Wooden Stool"
                  className="w-full rounded-xl px-3 py-2.5 font-fantasy text-[11px]"
                  style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, outline: "none" }}
                />
              </div>
              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Price (coins)</p>
                <input
                  data-testid="input-decor-price"
                  type="number"
                  min="0"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl px-3 py-2.5 font-fantasy text-[11px]"
                  style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, outline: "none" }}
                />
              </div>
              <button
                data-testid="button-save-decor"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !name.trim()}
                className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
                style={{
                  background: name.trim() ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.05)",
                  border: `1px solid ${name.trim() ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`,
                  color: name.trim() ? GOLD : "rgba(255,215,0,0.3)",
                  cursor: name.trim() ? "pointer" : "not-allowed",
                }}
              >
                {createMutation.isPending ? "Saving..." : "Save Decor Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BundlesSubTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editingBundle, setEditingBundle] = useState<HouseBundle | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showBgEditor, setShowBgEditor] = useState(false);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [shopImageData, setShopImageData] = useState<string | null>(null);
  const [bgImageData, setBgImageData] = useState<string | null>(null);
  const [shopImagePreview, setShopImagePreview] = useState<string | null>(null);
  const [bgImagePreview, setBgImagePreview] = useState<string | null>(null);

  const { data: bundles = [], isLoading } = useQuery<HouseBundle[]>({
    queryKey: ["/api/admin/house-bundles"],
    staleTime: 0,
  });

  const openEdit = (bundle: HouseBundle) => {
    setEditingBundle(bundle);
    setName(bundle.name);
    setPrice(String(bundle.price));
    setShopImagePreview(bundle.shopImageUrl);
    setBgImagePreview(bundle.bgImageUrl);
    setShopImageData(null);
    setBgImageData(null);
    setShowCreateForm(false);
  };

  const openCreate = () => {
    setEditingBundle(null);
    setName("");
    setPrice("");
    setShopImagePreview(null);
    setBgImagePreview(null);
    setShopImageData(null);
    setBgImageData(null);
    setShowCreateForm(true);
  };

  const closeForm = () => {
    setEditingBundle(null);
    setShowCreateForm(false);
    setShowBgEditor(false);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      return apiRequest("POST", "/api/admin/house-bundles", {
        name: name.trim(),
        price: price.trim() ? parseInt(price.trim(), 10) : 0,
        shopImageData: shopImageData ?? undefined,
        bgImageData: bgImageData ?? undefined,
      });
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Home bundle created!" });
      res.json().then((newBundle: HouseBundle) => {
        setEditingBundle(newBundle);
        setBgImagePreview(newBundle.bgImageUrl ?? bgImagePreview);
        setShopImagePreview(newBundle.shopImageUrl ?? shopImagePreview);
        setShopImageData(null);
        setBgImageData(null);
        setShowCreateForm(false);
      }).catch(() => closeForm());
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingBundle) return;
      if (!name.trim()) throw new Error("Name is required");
      return apiRequest("PATCH", `/api/admin/house-bundles/${editingBundle.id}`, {
        name: name.trim(),
        price: price.trim() ? parseInt(price.trim(), 10) : 0,
        shopImageData: shopImageData ?? undefined,
        bgImageData: bgImageData ?? undefined,
      });
    },
    onSuccess: async (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Bundle updated!" });
      try {
        const updated: HouseBundle = await res.json();
        setEditingBundle(updated);
        setBgImagePreview(updated.bgImageUrl ?? bgImagePreview);
        setShopImagePreview(updated.shopImageUrl ?? shopImagePreview);
        setShopImageData(null);
        setBgImageData(null);
      } catch {}
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/house-bundles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Deleted" });
      closeForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const currentBgUrl = bgImagePreview ?? editingBundle?.bgImageUrl ?? null;
  const hasBg = !!currentBgUrl;
  const isEditing = !!editingBundle;
  const showForm = isEditing || showCreateForm;

  const handleSave = () => {
    if (isEditing) updateMutation.mutate();
    else createMutation.mutate();
  };
  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (showBgEditor && editingBundle) {
    const liveBundle: HouseBundle = {
      ...editingBundle,
      bgImageUrl: currentBgUrl,
      shopImageUrl: shopImagePreview ?? editingBundle.shopImageUrl,
    };
    return <BundleBgEditor bundle={liveBundle} onClose={() => setShowBgEditor(false)} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-fantasy text-[10px]" style={{ color: "rgba(255,215,0,0.5)" }}>
          {isLoading ? "Loading..." : `${bundles.length} bundle${bundles.length !== 1 ? "s" : ""}`}
        </p>
        <button
          data-testid="button-add-home-bundle"
          onClick={openCreate}
          className="px-4 py-1.5 rounded-full font-fantasy text-[10px] tracking-wide"
          style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}
        >+ Add Home Bundle</button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <p className="font-fantasy text-xs animate-pulse" style={{ color: "rgba(255,215,0,0.4)" }}>Loading...</p>
        </div>
      ) : bundles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2">
          <p className="font-fantasy text-xs" style={{ color: "rgba(255,215,0,0.3)" }}>No home bundles yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bundles.map(bundle => (
            <button
              key={bundle.id}
              data-testid={`row-bundle-${bundle.id}`}
              onClick={() => openEdit(bundle)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 w-full text-left"
              style={{
                background: editingBundle?.id === bundle.id ? "rgba(255,215,0,0.1)" : BG_CARD,
                border: `1px solid ${editingBundle?.id === bundle.id ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`,
                cursor: "pointer",
              }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                style={{ background: "rgba(255,215,0,0.08)", border: `1.5px solid ${GOLD_BORDER}` }}
              >
                {bundle.shopImageUrl
                  ? <img src={bundle.shopImageUrl} alt={bundle.name} className="w-full h-full object-contain" />
                  : <span className="font-fantasy text-lg">🏡</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-fantasy text-[11px] tracking-wide truncate" style={{ color: GOLD }}>{bundle.name}</p>
                <p className="font-fantasy text-[9px]" style={{ color: "rgba(255,215,0,0.4)" }}>
                  {bundle.price.toLocaleString()} coins{bundle.bgImageUrl ? " · has background" : ""}
                </p>
              </div>
              <span className="font-fantasy text-[9px] shrink-0" style={{ color: "rgba(255,215,0,0.4)" }}>Edit →</span>
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={closeForm} />
          <div
            className="relative w-full rounded-t-2xl flex flex-col"
            style={{ backgroundColor: "#0d0a04", border: `1px solid ${GOLD_BORDER}`, maxHeight: "92dvh" }}
          >
            <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}>
              <p className="font-fantasy text-sm tracking-widest" style={{ color: GOLD }}>
                {isEditing ? editingBundle!.name : "Add Home Bundle"}
              </p>
              <div className="flex items-center gap-2">
                {isEditing && (
                  <button
                    data-testid={`button-delete-bundle-${editingBundle!.id}`}
                    onClick={() => deleteMutation.mutate(editingBundle!.id)}
                    disabled={deleteMutation.isPending}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(200,50,50,0.15)", border: "1px solid rgba(200,50,50,0.3)", cursor: "pointer" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: "#f87171" }} />
                  </button>
                )}
                <button
                  data-testid="button-close-bundle-form"
                  onClick={closeForm}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
              <FileUploadBox
                preview={shopImagePreview}
                onFile={(d) => { setShopImageData(d); setShopImagePreview(d); }}
                onClear={() => { setShopImageData(null); setShopImagePreview(null); }}
                label="Shop / Inventory Thumbnail (max 15MB)"
                testId="input-bundle-shop-image"
              />

              <FileUploadBox
                preview={bgImagePreview}
                onFile={(d) => { setBgImageData(d); setBgImagePreview(d); }}
                onClear={() => { setBgImageData(null); setBgImagePreview(isEditing ? editingBundle!.bgImageUrl : null); }}
                label="Background Image — shown in Pet House (max 15MB)"
                testId="input-bundle-bg-image"
              />

              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Bundle Name</p>
                <input
                  data-testid="input-bundle-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Cozy Cottage"
                  className="w-full rounded-xl px-3 py-2.5 font-fantasy text-[11px]"
                  style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, outline: "none" }}
                />
              </div>

              <div>
                <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>Price (coins)</p>
                <input
                  data-testid="input-bundle-price"
                  type="number"
                  min="0"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl px-3 py-2.5 font-fantasy text-[11px]"
                  style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, outline: "none" }}
                />
              </div>

              <button
                data-testid="button-save-bundle"
                onClick={handleSave}
                disabled={isSaving || !name.trim()}
                className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
                style={{
                  background: name.trim() ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.05)",
                  border: `1px solid ${name.trim() ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`,
                  color: name.trim() ? GOLD : "rgba(255,215,0,0.3)",
                  cursor: name.trim() ? "pointer" : "not-allowed",
                }}
              >
                {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Save Home Bundle"}
              </button>

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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomeBundleSection() {
  const [tab, setTab] = useState<"decor" | "bundles">("decor");

  const TABS = [
    { key: "decor" as const, label: "Decor" },
    { key: "bundles" as const, label: "Home Bundles" },
  ];

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
