import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Upload, X } from "lucide-react";
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
  };
  return (
    <div>
      <p className="font-fantasy text-[10px] mb-1.5" style={{ color: GOLD }}>{label}</p>
      {preview ? (
        <div className="relative w-full h-28 rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD_BORDER}` }}>
          <img src={preview} alt="preview" className="w-full h-full object-contain" />
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
          <p className="font-fantasy text-[10px]" style={{ color: "rgba(255,215,0,0.6)" }}>Click to upload PNG/JPEG (max 15MB)</p>
        </button>
      )}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={handleChange} data-testid={testId} />
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
          style={{ background: "rgba(255,215,0,0.12)", border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}
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
            style={{
              background: "linear-gradient(180deg, #0d0a04 0%, #07050200 100%)",
              backgroundColor: "#0d0a04",
              border: `1px solid ${GOLD_BORDER}`,
              maxHeight: "85dvh",
            }}
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
                style={{ background: name.trim() ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.05)", border: `1px solid ${name.trim() ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`, color: name.trim() ? GOLD : "rgba(255,215,0,0.3)", cursor: name.trim() ? "pointer" : "not-allowed" }}
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
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [shopImageData, setShopImageData] = useState<string | null>(null);

  const { data: bundles = [], isLoading } = useQuery<HouseBundle[]>({
    queryKey: ["/api/admin/house-bundles"],
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      return apiRequest("POST", "/api/admin/house-bundles", {
        name: name.trim(),
        price: price.trim() ? parseInt(price.trim(), 10) : 0,
        shopImageData: shopImageData ?? undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Home bundle created!" });
      setShowForm(false);
      setName("");
      setPrice("");
      setShopImageData(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/house-bundles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/house-bundles"] });
      toast({ title: "Deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-fantasy text-[10px]" style={{ color: "rgba(255,215,0,0.5)" }}>
          {isLoading ? "Loading..." : `${bundles.length} bundle${bundles.length !== 1 ? "s" : ""}`}
        </p>
        <button
          data-testid="button-add-home-bundle"
          onClick={() => setShowForm(true)}
          className="px-4 py-1.5 rounded-full font-fantasy text-[10px] tracking-wide"
          style={{ background: "rgba(255,215,0,0.12)", border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}
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
            <div
              key={bundle.id}
              data-testid={`row-bundle-${bundle.id}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: BG_CARD, border: `1px solid ${GOLD_BORDER}` }}
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
                <p className="font-fantasy text-[9px]" style={{ color: "rgba(255,215,0,0.4)" }}>{bundle.price.toLocaleString()} coins</p>
              </div>
              <button
                data-testid={`button-delete-bundle-${bundle.id}`}
                onClick={() => deleteMutation.mutate(bundle.id)}
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
            style={{
              background: "linear-gradient(180deg, #0d0a04 0%, #07050200 100%)",
              backgroundColor: "#0d0a04",
              border: `1px solid ${GOLD_BORDER}`,
              maxHeight: "85dvh",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD_BORDER}` }}>
              <p className="font-fantasy text-sm tracking-widest" style={{ color: GOLD }}>Add Home Bundle</p>
              <button
                data-testid="button-close-bundle-form"
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`, color: GOLD, cursor: "pointer" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
              <FileUploadBox
                preview={shopImageData}
                onFile={setShopImageData}
                onClear={() => setShopImageData(null)}
                label="Bundle Image (for shop & inventory, max 15MB)"
                testId="input-bundle-image"
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
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !name.trim()}
                className="w-full py-3 rounded-xl font-fantasy text-sm tracking-widest transition-transform active:scale-95"
                style={{ background: name.trim() ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.05)", border: `1px solid ${name.trim() ? "rgba(255,215,0,0.4)" : GOLD_BORDER}`, color: name.trim() ? GOLD : "rgba(255,215,0,0.3)", cursor: name.trim() ? "pointer" : "not-allowed" }}
              >
                {createMutation.isPending ? "Saving..." : "Save Home Bundle"}
              </button>
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
