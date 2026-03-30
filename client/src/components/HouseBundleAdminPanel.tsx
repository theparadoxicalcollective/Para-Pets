import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Upload, Plus, ChevronLeft } from "lucide-react";

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
  label,
  value,
  onChange,
  accept = "image/png,image/jpeg",
  helpText,
}: {
  label: string;
  value: string;
  onChange: (b64: string) => void;
  accept?: string;
  helpText?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>{label}</label>
      {helpText && <p className="text-xs" style={{ color: "rgba(165,243,252,0.5)" }}>{helpText}</p>}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all self-start"
        style={{
          background: "rgba(34,211,238,0.1)",
          border: "1.5px solid rgba(34,211,238,0.3)",
          color: "#a5f3fc",
        }}
      >
        <Upload size={14} />
        {value ? "Change image" : "Upload image"}
      </button>
      {value && (
        <img
          src={value}
          alt="preview"
          className="rounded-xl mt-1 object-contain"
          style={{ maxHeight: 120, maxWidth: "100%", border: "1px solid rgba(34,211,238,0.2)" }}
        />
      )}
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const b64 = await fileToBase64(f);
          onChange(b64);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(8,38,50,0.7) 0%, rgba(12,58,75,0.7) 100%)",
  border: "1.5px solid rgba(34,211,238,0.3)",
};

const inputStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.4)",
  border: "1px solid rgba(34,211,238,0.3)",
  color: "#e0f7fa",
};

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg, #22d3ee, #0891b2)",
  color: "#0f172a",
};

function AddDecorForm({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageData, setImageData] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/home-decor", {
        name,
        price: parseInt(price) || 0,
        imageData: imageData || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/home-decor"] });
      toast({ title: "Decor item added!" });
      onBack();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-semibold self-start"
        style={{ color: "#a5f3fc" }}
      >
        <ChevronLeft size={14} /> Back
      </button>
      <h3 className="font-fantasy font-bold text-base" style={{ color: "#a5f3fc" }}>Add Home Decor Item</h3>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>Name</label>
        <input
          data-testid="input-decor-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm"
          style={inputStyle}
          placeholder="e.g. Mossy Lantern"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>Price (coins)</label>
        <input
          data-testid="input-decor-price"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm"
          style={inputStyle}
          placeholder="0"
        />
      </div>

      <ImageUploadField
        label="Decor Image"
        value={imageData}
        onChange={setImageData}
        accept="image/png,image/gif"
        helpText="PNG or GIF, up to 15MB"
      />

      <button
        data-testid="button-save-decor"
        onClick={() => mutation.mutate()}
        disabled={!name || mutation.isPending}
        className="rounded-xl px-4 py-2 font-fantasy font-bold text-sm transition-all disabled:opacity-40"
        style={primaryBtn}
      >
        {mutation.isPending ? "Saving..." : "Save Decor Item"}
      </button>
    </div>
  );
}

function AddBundleForm({ onCreated }: { onCreated: (bundle: HouseBundle) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [shopImageData, setShopImageData] = useState("");
  const [bgImageData, setBgImageData] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/house-bundles", {
        name,
        price: parseInt(price) || 0,
        shopImageData: shopImageData || undefined,
        bgImageData: bgImageData || undefined,
      });
      return res.json();
    },
    onSuccess: (bundle) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Bundle created — now place buildings!" });
      onCreated(bundle);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-fantasy font-bold text-base" style={{ color: "#a5f3fc" }}>Add House Bundle</h3>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>Bundle Name</label>
        <input
          data-testid="input-bundle-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm"
          style={inputStyle}
          placeholder="e.g. Mossy Forest Home"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: "#a5f3fc" }}>Price (coins)</label>
        <input
          data-testid="input-bundle-price"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm"
          style={inputStyle}
          placeholder="0"
        />
      </div>

      <ImageUploadField
        label="Shop Image"
        value={shopImageData}
        onChange={setShopImageData}
        accept="image/png,image/jpeg"
        helpText="Shown in the shop — JPEG or PNG"
      />

      <ImageUploadField
        label="Background Image"
        value={bgImageData}
        onChange={setBgImageData}
        accept="image/png,image/jpeg"
        helpText="The Pet House background players will see — JPEG or PNG"
      />

      <button
        data-testid="button-continue-to-edit"
        onClick={() => mutation.mutate()}
        disabled={!name || mutation.isPending}
        className="rounded-xl px-4 py-2 font-fantasy font-bold text-sm transition-all disabled:opacity-40"
        style={primaryBtn}
      >
        {mutation.isPending ? "Creating..." : "Continue to Edit →"}
      </button>
    </div>
  );
}

function BundleEditor({ bundle, onBack }: { bundle: HouseBundle; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: buildings = [], refetch: refetchBuildings } = useQuery<HouseBundleBuilding[]>({
    queryKey: ["/api/admin/house-bundles", bundle.id, "buildings"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/house-bundles/${bundle.id}/buildings`, { credentials: "include" });
      return res.json();
    },
  });

  const [addingBuilding, setAddingBuilding] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState("");
  const [newBuildingImageData, setNewBuildingImageData] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [livePos, setLivePos] = useState<{ [id: string]: { x: number; y: number } }>({});
  const [panX, setPanX] = useState(0);
  const [imgAspect, setImgAspect] = useState(16 / 9);
  const [canvasPxW, setCanvasPxW] = useState(0);

  const bgRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef<{ startX: number; startPanX: number } | null>(null);
  const draggingBuildingRef = useRef<string | null>(null);

  // Load the image to get its natural aspect ratio
  useEffect(() => {
    if (!bundle.bgImageUrl) return;
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalHeight > 0) setImgAspect(img.naturalWidth / img.naturalHeight);
    };
    img.src = bundle.bgImageUrl;
  }, [bundle.bgImageUrl]);

  // Compute canvas pixel width whenever imgAspect or viewport size changes
  useEffect(() => {
    const update = () => {
      if (!viewportRef.current) return;
      const vpH = viewportRef.current.offsetHeight;
      const vpW = viewportRef.current.offsetWidth;
      setCanvasPxW(Math.max(vpW, Math.round(vpH * imgAspect)));
    };
    update();
    const ro = new ResizeObserver(update);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [imgAspect]);

  // Reset pan when switching bundles
  useEffect(() => { setPanX(0); }, [bundle.id]);

  const clampPan = (val: number) => {
    const vpW = viewportRef.current?.offsetWidth ?? 400;
    const min = -(canvasPxW - vpW);
    return Math.min(0, Math.max(min < 0 ? min : 0, val));
  };

  const addBuildingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/house-bundles/${bundle.id}/buildings`, {
        name: newBuildingName,
        imageData: newBuildingImageData,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchBuildings();
      setAddingBuilding(false);
      setNewBuildingName("");
      setNewBuildingImageData("");
      toast({ title: "Building added!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const moveBuildingMutation = useMutation({
    mutationFn: async ({ id, posX, posY }: { id: string; posX: number; posY: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/house-bundle-buildings/${id}`, { posX, posY });
      return res.json();
    },
    onSuccess: () => refetchBuildings(),
  });

  const deleteBuildingMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/house-bundle-buildings/${id}`);
    },
    onSuccess: () => {
      refetchBuildings();
      toast({ title: "Building removed" });
    },
  });

  const handleViewportPointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (draggingBuildingRef.current) {
      // Building drag was started — handle offset
      const bgRect = bgRef.current?.getBoundingClientRect();
      if (!bgRect) return;
      const buildingEl = (e.target as HTMLElement).closest("[data-building]") as HTMLElement | null;
      if (buildingEl) {
        const elRect = buildingEl.getBoundingClientRect();
        dragOffsetRef.current = {
          x: e.clientX - elRect.left - elRect.width / 2,
          y: e.clientY - elRect.top - elRect.height / 2,
        };
      } else {
        dragOffsetRef.current = { x: 0, y: 0 };
      }
    } else {
      // Background pan
      panStartRef.current = { startX: e.clientX, startPanX: panX };
    }
  }, [panX]);

  const handleViewportPointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingBuildingRef.current) {
      const bgRect = bgRef.current?.getBoundingClientRect();
      if (!bgRect) return;
      const rawX = e.clientX - dragOffsetRef.current.x - bgRect.left;
      const rawY = e.clientY - dragOffsetRef.current.y - bgRect.top;
      const posX = Math.max(0, Math.min(100, (rawX / bgRect.width) * 100));
      const posY = Math.max(0, Math.min(100, (rawY / bgRect.height) * 100));
      setLivePos((prev) => ({ ...prev, [draggingBuildingRef.current!]: { x: posX, y: posY } }));
    } else if (panStartRef.current) {
      setPanX(clampPan(panStartRef.current.startPanX + (e.clientX - panStartRef.current.startX)));
    }
  }, [imgAspect, canvasPxW]);

  const handleViewportPointerUp = useCallback(() => {
    if (draggingBuildingRef.current) {
      const id = draggingBuildingRef.current;
      const pos = livePos[id];
      if (pos) moveBuildingMutation.mutate({ id, posX: pos.x, posY: pos.y });
      draggingBuildingRef.current = null;
      setDraggingId(null);
    }
    panStartRef.current = null;
  }, [livePos, moveBuildingMutation]);

  const handleBuildingPointerDown = useCallback((e: React.PointerEvent, building: HouseBundleBuilding) => {
    draggingBuildingRef.current = building.id;
    setDraggingId(building.id);
    const bgRect = bgRef.current?.getBoundingClientRect();
    const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (bgRect) {
      dragOffsetRef.current = {
        x: e.clientX - elRect.left - elRect.width / 2,
        y: e.clientY - elRect.top - elRect.height / 2,
      };
    }
  }, []);

  const saveBundleMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/admin/house-bundles/${bundle.id}`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Bundle saved!" });
      onBack();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canvasW = `${imgAspect * 100}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-semibold"
          style={{ color: "#a5f3fc" }}
        >
          <ChevronLeft size={14} /> Back
        </button>
        <h3 className="font-fantasy font-bold text-base flex-1 truncate" style={{ color: "#a5f3fc" }}>
          {bundle.name}
        </h3>
      </div>

      <p className="text-xs" style={{ color: "rgba(165,243,252,0.6)" }}>
        {bundle.bgImageUrl
          ? "Drag the background to explore it. Drag buildings to reposition them."
          : "Add buildings and drag them to position them on your background."}
      </p>

      {/* Panoramic viewport — fills screen height, clips overflow */}
      <div
        ref={viewportRef}
        className="relative overflow-hidden select-none rounded-2xl"
        style={{
          width: "100%",
          height: "calc(var(--fh, 844px) - 200px)",
          border: "1.5px solid rgba(34,211,238,0.3)",
          background: "rgba(20,40,55,0.9)",
          cursor: draggingId ? "grabbing" : (bundle.bgImageUrl ? "grab" : "default"),
          touchAction: "none",
        }}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
      >
        {/* Inner canvas — actual image width, translated for panning */}
        <div
          ref={bgRef}
          className="absolute top-0 h-full"
          style={{
            left: `${panX}px`,
            width: canvasPxW > 0 ? `${canvasPxW}px` : "100%",
            minWidth: "100%",
            backgroundImage: bundle.bgImageUrl ? `url(${bundle.bgImageUrl})` : undefined,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
        >
          {!bundle.bgImageUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs" style={{ color: "rgba(165,243,252,0.4)" }}>No background uploaded</p>
            </div>
          )}

          {buildings.map((b) => {
            const live = livePos[b.id];
            const x = live ? live.x : b.posX;
            const y = live ? live.y : b.posY;
            return (
              <div
                key={b.id}
                data-testid={`building-${b.id}`}
                data-building="true"
                className="absolute flex flex-col items-center gap-0.5"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: "translate(-50%, -100%)",
                  cursor: "grab",
                  userSelect: "none",
                  zIndex: draggingId === b.id ? 20 : 10,
                }}
                onPointerDown={(e) => handleBuildingPointerDown(e, b)}
              >
                <img
                  src={b.imageUrl}
                  alt={b.name}
                  draggable={false}
                  style={{ width: 80, height: 80, objectFit: "contain", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.7))" }}
                />
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: "rgba(0,0,0,0.7)", color: "#a5f3fc", whiteSpace: "nowrap" }}
                >
                  {b.name}
                </span>
                <button
                  data-testid={`button-delete-building-${b.id}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); deleteBuildingMutation.mutate(b.id); }}
                  className="mt-0.5 rounded-full p-0.5"
                  style={{ background: "rgba(220,50,50,0.8)", color: "white" }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Pan hint — only shown when image is wider than viewport */}
        {bundle.bgImageUrl && imgAspect > 1.2 && (
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs pointer-events-none"
            style={{ background: "rgba(0,0,0,0.55)", color: "rgba(165,243,252,0.7)", whiteSpace: "nowrap" }}
          >
            ← drag to explore →
          </div>
        )}
      </div>

      {/* Add building form */}
      {addingBuilding ? (
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={panelStyle}>
          <h4 className="text-xs font-bold" style={{ color: "#a5f3fc" }}>New Building</h4>
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: "rgba(165,243,252,0.7)" }}>Building Name</label>
            <input
              data-testid="input-building-name"
              value={newBuildingName}
              onChange={(e) => setNewBuildingName(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm"
              style={inputStyle}
              placeholder="e.g. Main Hall"
            />
          </div>
          <ImageUploadField
            label="Building Image"
            value={newBuildingImageData}
            onChange={setNewBuildingImageData}
            accept="image/png,image/jpeg"
            helpText="PNG or JPEG"
          />
          <div className="flex gap-2">
            <button
              data-testid="button-confirm-add-building"
              onClick={() => addBuildingMutation.mutate()}
              disabled={!newBuildingName || !newBuildingImageData || addBuildingMutation.isPending}
              className="flex-1 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40"
              style={primaryBtn}
            >
              {addBuildingMutation.isPending ? "Adding..." : "Add Building"}
            </button>
            <button
              onClick={() => { setAddingBuilding(false); setNewBuildingName(""); setNewBuildingImageData(""); }}
              className="rounded-xl px-3 py-2 text-xs font-bold"
              style={{ background: "rgba(255,255,255,0.08)", color: "#a5f3fc" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          data-testid="button-add-building"
          onClick={() => setAddingBuilding(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold self-start"
          style={{ background: "rgba(34,211,238,0.12)", border: "1.5px solid rgba(34,211,238,0.3)", color: "#a5f3fc" }}
        >
          <Plus size={14} /> Add Building
        </button>
      )}

      {/* Building list */}
      {buildings.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: "rgba(165,243,252,0.6)" }}>Buildings ({buildings.length})</p>
          {buildings.map((b) => (
            <div key={b.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(34,211,238,0.15)" }}>
              <img src={b.imageUrl} alt={b.name} style={{ width: 36, height: 36, objectFit: "contain" }} />
              <span className="flex-1 text-sm font-semibold" style={{ color: "#e0f7fa" }}>{b.name}</span>
              <span className="text-xs" style={{ color: "rgba(165,243,252,0.5)" }}>({Math.round(b.posX)}%, {Math.round(b.posY)}%)</span>
              <button
                onClick={() => deleteBuildingMutation.mutate(b.id)}
                className="p-1 rounded-lg"
                style={{ background: "rgba(220,50,50,0.2)", color: "#f87171" }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Save Bundle */}
      <div className="flex justify-end mt-2">
        <button
          data-testid="button-save-bundle"
          onClick={() => saveBundleMutation.mutate()}
          disabled={saveBundleMutation.isPending}
          className="flex items-center gap-2 rounded-xl px-5 py-2 font-fantasy font-bold text-sm disabled:opacity-40"
          style={primaryBtn}
        >
          {saveBundleMutation.isPending ? "Saving..." : "Save Bundle"}
        </button>
      </div>
    </div>
  );
}

export default function HouseBundleAdminPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<"list" | "add-bundle" | "bundle-editor" | "add-decor">("list");
  const [editingBundle, setEditingBundle] = useState<HouseBundle | null>(null);

  const { data: bundles = [], isLoading: bundlesLoading } = useQuery<HouseBundle[]>({
    queryKey: ["/api/admin/house-bundles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/house-bundles", { credentials: "include" });
      return res.json();
    },
  });

  const { data: decorItems = [], isLoading: decorLoading } = useQuery<HomeDecorItem[]>({
    queryKey: ["/api/admin/home-decor"],
    queryFn: async () => {
      const res = await fetch("/api/admin/home-decor", { credentials: "include" });
      return res.json();
    },
  });

  const deleteBundleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/house-bundles/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Bundle deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteDecorMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/home-decor/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/home-decor"] });
      toast({ title: "Decor item deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (view === "add-bundle") {
    return (
      <div className="rounded-2xl p-5" style={panelStyle}>
        <AddBundleForm
          onCreated={(bundle) => {
            setEditingBundle(bundle);
            setView("bundle-editor");
          }}
        />
      </div>
    );
  }

  if (view === "bundle-editor" && editingBundle) {
    return (
      <div className="rounded-2xl p-5" style={panelStyle}>
        <BundleEditor
          bundle={editingBundle}
          onBack={() => {
            setEditingBundle(null);
            setView("list");
          }}
        />
      </div>
    );
  }

  if (view === "add-decor") {
    return (
      <div className="rounded-2xl p-5" style={panelStyle}>
        <AddDecorForm onBack={() => setView("list")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          data-testid="button-add-house-bundle"
          onClick={() => setView("add-bundle")}
          className="flex items-center gap-2 rounded-xl px-4 py-2 font-fantasy font-bold text-sm"
          style={primaryBtn}
        >
          <Plus size={15} /> Add House Bundle
        </button>
        <button
          data-testid="button-add-home-decor"
          onClick={() => setView("add-decor")}
          className="flex items-center gap-2 rounded-xl px-4 py-2 font-fantasy font-bold text-sm"
          style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", color: "white" }}
        >
          <Plus size={15} /> Add Home Decor
        </button>
      </div>

      {/* House Bundles list */}
      <div className="flex flex-col gap-3">
        <h3 className="font-fantasy font-bold text-sm tracking-widest" style={{ color: "#a5f3fc" }}>
          House Bundles {bundles.length > 0 && `(${bundles.length})`}
        </h3>
        {bundlesLoading ? (
          <p className="text-xs" style={{ color: "rgba(165,243,252,0.5)" }}>Loading...</p>
        ) : bundles.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={panelStyle}>
            <p className="text-xs" style={{ color: "rgba(165,243,252,0.5)" }}>No bundles yet. Click "Add House Bundle" to create one.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {bundles.map((bundle) => (
              <div
                key={bundle.id}
                data-testid={`bundle-card-${bundle.id}`}
                className="rounded-2xl p-4 flex gap-4 items-start"
                style={panelStyle}
              >
                {bundle.shopImageUrl && (
                  <img src={bundle.shopImageUrl} alt={bundle.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 12, flexShrink: 0 }} />
                )}
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="font-fantasy font-bold text-sm" style={{ color: "#e0f7fa" }}>{bundle.name}</span>
                  <span className="text-xs" style={{ color: "rgba(165,243,252,0.6)" }}>{bundle.price} coins</span>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    data-testid={`button-edit-bundle-${bundle.id}`}
                    onClick={() => { setEditingBundle(bundle); setView("bundle-editor"); }}
                    className="rounded-xl px-3 py-1.5 text-xs font-bold"
                    style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)", color: "#a5f3fc" }}
                  >
                    Edit
                  </button>
                  <button
                    data-testid={`button-delete-bundle-${bundle.id}`}
                    onClick={() => deleteBundleMutation.mutate(bundle.id)}
                    className="rounded-xl p-1.5"
                    style={{ background: "rgba(220,50,50,0.2)", color: "#f87171" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Home Decor list */}
      <div className="flex flex-col gap-3">
        <h3 className="font-fantasy font-bold text-sm tracking-widest" style={{ color: "#c4b5fd" }}>
          Home Decor Items {decorItems.length > 0 && `(${decorItems.length})`}
        </h3>
        {decorLoading ? (
          <p className="text-xs" style={{ color: "rgba(196,181,253,0.5)" }}>Loading...</p>
        ) : decorItems.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ ...panelStyle, border: "1.5px solid rgba(168,85,247,0.3)" }}>
            <p className="text-xs" style={{ color: "rgba(196,181,253,0.5)" }}>No decor items yet. Click "Add Home Decor" to create one.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {decorItems.map((item) => (
              <div
                key={item.id}
                data-testid={`decor-card-${item.id}`}
                className="rounded-2xl p-3 flex gap-3 items-center"
                style={{ ...panelStyle, border: "1.5px solid rgba(168,85,247,0.25)" }}
              >
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.name} style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 10, flexShrink: 0 }} />
                )}
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="font-bold text-sm" style={{ color: "#e0f7fa" }}>{item.name}</span>
                  <span className="text-xs" style={{ color: "rgba(196,181,253,0.7)" }}>{item.price} coins</span>
                </div>
                <button
                  data-testid={`button-delete-decor-${item.id}`}
                  onClick={() => deleteDecorMutation.mutate(item.id)}
                  className="rounded-xl p-1.5 flex-shrink-0"
                  style={{ background: "rgba(220,50,50,0.2)", color: "#f87171" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
