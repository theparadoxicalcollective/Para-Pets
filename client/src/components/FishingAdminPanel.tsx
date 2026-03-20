import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readFileAsDataUrl } from "@/lib/utils";
import fishCommonIcon from "@assets/generated_images/icon_fish_common.png";
import fishRodIcon from "@assets/generated_images/icon_fish_rod.png";
import { Plus, Trash2, ArrowLeft, Save } from "lucide-react";

interface FishingItem {
  id: string;
  name: string;
  price: number;
  type: string;
  fishingType: string | null;
  imageUrl: string | null;
  hooklessImageUrl: string | null;
  starRarity: number | null;
  rareCatchBoostPercent: number | null;
  rarityBoostPercent: number | null;
  poleMaxUses: number | null;
  facingDirection: string | null;
  poleSlowdown3: number | null;
  poleSlowdown4: number | null;
  poleSlowdown5: number | null;
  baitCatchBoost: number | null;
  fishSwimZone: string | null;
  createdAt: string;
}

interface FishPart {
  id: string;
  fishItemId: string;
  partType: string;
  imageUrl: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  zIndex: number;
}

const FISH_PART_TYPES = [
  { key: "body", label: "Body", defaultZ: 1 },
  { key: "eyes", label: "Eyes", defaultZ: 3 },
  { key: "tail", label: "Tail", defaultZ: 2 },
] as const;

const CANVAS_SIZE = 500;

export default function FishingAdminPanel() {
  const [selectedFishId, setSelectedFishId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<FishingItem | null>(null);
  const [filterType, setFilterType] = useState<"all" | "pole" | "bait" | "fish">("all");
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [uploadPartType, setUploadPartType] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ partId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allItems = [], isLoading } = useQuery<FishingItem[], Error, FishingItem[]>({
    queryKey: ["/api/admin/shop-items-all"],
    select: (data) => (data as FishingItem[]).filter((i) => i.type === "fishing"),
  });

  const { data: fishParts = [] } = useQuery<FishPart[]>({
    queryKey: ["/api/admin/fish-parts", selectedFishId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/fish-parts/${selectedFishId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedFishId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/admin/shop/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      toast({ title: "Deleted", description: "Fishing item removed" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not delete item", variant: "destructive" });
    },
  });

  const addPartMutation = useMutation({
    mutationFn: async (data: { fishItemId: string; partType: string; imageData: string; zIndex: number }) => {
      const res = await apiRequest("POST", `/api/admin/fish-parts/${data.fishItemId}`, {
        partType: data.partType,
        imageData: data.imageData,
        zIndex: data.zIndex,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fish-parts", selectedFishId] });
      setUploadPartType(null);
      toast({ title: "Added", description: "Part added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add part", variant: "destructive" });
    },
  });

  const updatePartMutation = useMutation({
    mutationFn: async ({ partId, ...data }: { partId: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/fish-parts/${partId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fish-parts", selectedFishId] });
    },
  });

  const deletePartMutation = useMutation({
    mutationFn: async (partId: string) => {
      await apiRequest("DELETE", `/api/admin/fish-parts/${partId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fish-parts", selectedFishId] });
      setSelectedPartId(null);
      toast({ title: "Removed", description: "Part removed" });
    },
  });

  const handlePointerDown = useCallback((e: React.PointerEvent, part: FishPart) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    didDrag.current = false;
    dragRef.current = { partId: part.id, startX: e.clientX, startY: e.clientY, origX: part.posX, origY: part.posY };
    setSelectedPartId(part.id);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = rect.width / CANVAS_SIZE;
    const dx = (e.clientX - dragRef.current.startX) / scale;
    const dy = (e.clientY - dragRef.current.startY) / scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag.current = true;
    setDragPos({ id: dragRef.current.partId, x: Math.round(dragRef.current.origX + dx), y: Math.round(dragRef.current.origY + dy) });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const d = dragRef.current;
    dragRef.current = null;
    if (didDrag.current && dragPos) {
      updatePartMutation.mutate({ partId: d.partId, posX: dragPos.x, posY: dragPos.y });
    }
    setDragPos(null);
  }, [dragPos, updatePartMutation]);

  const filtered = allItems.filter(i => filterType === "all" || i.fishingType === filterType);
  const selectedFish = selectedFishId ? allItems.find(i => i.id === selectedFishId) : null;
  const selectedPart = fishParts.find(p => p.id === selectedPartId);

  if (selectedFishId && selectedFish) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <button
            data-testid="button-back-to-fish-list"
            onClick={() => { setSelectedFishId(null); setSelectedPartId(null); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)", cursor: "pointer", color: "#60a5fa" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="font-fantasy text-[#60a5fa] text-sm tracking-widest truncate">{selectedFish.name}</h3>
            <p className="font-fantasy text-[8px] tracking-wider" style={{ color: "rgba(96,165,250,0.6)" }}>
              {selectedFish.fishingType === "fish" ? `${"★".repeat(selectedFish.starRarity || 1)} Fish Parts` : selectedFish.fishingType}
            </p>
          </div>
          {selectedFish.imageUrl && (
            <img src={selectedFish.imageUrl} alt="" className="w-10 h-10 object-contain rounded-md" style={{ border: "1px solid rgba(96,165,250,0.2)", background: "rgba(0,0,0,0.3)" }} />
          )}
        </div>

        {selectedFish.fishingType !== "fish" ? (
          <div className="rounded-lg p-4 text-center" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)" }}>
            <p className="font-fantasy text-[#60a5fa] text-[10px] tracking-wider mb-1">
              {selectedFish.fishingType === "pole" ? "Fishing Pole" : "Fishing Bait"}
            </p>
            <p className="font-fantasy text-[#a89878] text-[9px]">
              {selectedFish.fishingType === "pole"
                ? `Rare catch boost: +${selectedFish.rareCatchBoostPercent || 0}%`
                : `Rarity boost: +${selectedFish.rarityBoostPercent || 0}% · Catch boost: +${selectedFish.baitCatchBoost || 0}%`}
            </p>
            <p className="font-fantasy text-[#6a5840] text-[8px] mt-2">Fish parts only apply to fish-type items</p>
          </div>
        ) : (
          <>
            <div
              ref={canvasRef}
              className="relative mx-auto rounded-lg overflow-hidden"
              style={{
                width: "100%",
                maxWidth: "400px",
                aspectRatio: "1",
                background: "radial-gradient(ellipse at 50% 60%, rgba(30,60,100,0.8) 0%, rgba(10,25,50,0.9) 100%)",
                border: "2px solid rgba(96,165,250,0.3)",
                touchAction: "none",
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {fishParts.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="font-fantasy text-[#3a5a80] text-[10px] tracking-wider text-center">
                    Upload parts below<br />to preview fish
                  </p>
                </div>
              )}
              {[...fishParts].sort((a, b) => a.zIndex - b.zIndex).map(part => {
                const pos = dragPos?.id === part.id ? { x: dragPos.x, y: dragPos.y } : { x: part.posX, y: part.posY };
                const isSelected = selectedPartId === part.id;
                return (
                  <div
                    key={part.id}
                    data-testid={`fish-canvas-part-${part.id}`}
                    className="absolute"
                    style={{
                      left: `${(pos.x / CANVAS_SIZE) * 100}%`,
                      top: `${(pos.y / CANVAS_SIZE) * 100}%`,
                      width: `${(part.width / CANVAS_SIZE) * 100}%`,
                      height: `${(part.height / CANVAS_SIZE) * 100}%`,
                      zIndex: part.zIndex + (dragRef.current?.partId === part.id ? 100 : 0),
                      cursor: "grab",
                      outline: isSelected ? "2px solid rgba(96,165,250,0.8)" : "none",
                      outlineOffset: "2px",
                    }}
                    onPointerDown={(e) => handlePointerDown(e, part)}
                    onClick={(e) => { e.stopPropagation(); if (!didDrag.current) setSelectedPartId(part.id); }}
                  >
                    <img src={part.imageUrl} alt={part.partType} className="w-full h-full object-contain pointer-events-none" draggable={false} />
                    {isSelected && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded font-fantasy text-[8px] tracking-wider whitespace-nowrap" style={{ background: "rgba(96,165,250,0.9)", color: "#fff" }}>
                        {part.partType}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-1.5 justify-center">
              {FISH_PART_TYPES.map(pt => {
                const exists = fishParts.some(p => p.partType === pt.key);
                return (
                  <button
                    key={pt.key}
                    data-testid={`button-upload-fish-${pt.key}`}
                    onClick={() => setUploadPartType(pt.key)}
                    className="px-2 py-1 rounded font-fantasy text-[9px] tracking-wider"
                    style={{
                      background: exists ? "rgba(96,165,250,0.15)" : "rgba(96,165,250,0.08)",
                      border: `1px solid ${exists ? "rgba(96,165,250,0.4)" : "rgba(96,165,250,0.2)"}`,
                      color: exists ? "#60a5fa" : "#4a7fa8",
                      cursor: "pointer",
                    }}
                  >
                    {exists ? "✓ " : "+ "}{pt.label}
                  </button>
                );
              })}
            </div>

            {selectedPart && (
              <div className="rounded-lg p-3" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-fantasy text-[#60a5fa] text-xs tracking-wider capitalize">{selectedPart.partType}</span>
                  <button
                    data-testid="button-delete-fish-part"
                    onClick={() => deletePartMutation.mutate(selectedPart.id)}
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(220,38,38,0.3)", cursor: "pointer", color: "#fca5a5" }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="font-fantasy text-[8px] text-[#a89878] block">Width</label>
                    <input type="number" value={selectedPart.width} onChange={(e) => updatePartMutation.mutate({ partId: selectedPart.id, width: Math.max(10, Math.min(500, parseInt(e.target.value) || 10)) })}
                      className="w-full px-2 py-1 rounded text-xs font-mono" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(96,165,250,0.2)", color: "#e8ddd0", outline: "none" }} />
                  </div>
                  <div>
                    <label className="font-fantasy text-[8px] text-[#a89878] block">Height</label>
                    <input type="number" value={selectedPart.height} onChange={(e) => updatePartMutation.mutate({ partId: selectedPart.id, height: Math.max(10, Math.min(500, parseInt(e.target.value) || 10)) })}
                      className="w-full px-2 py-1 rounded text-xs font-mono" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(96,165,250,0.2)", color: "#e8ddd0", outline: "none" }} />
                  </div>
                  <div>
                    <label className="font-fantasy text-[8px] text-[#a89878] block">Layer (Z)</label>
                    <input type="number" value={selectedPart.zIndex} onChange={(e) => updatePartMutation.mutate({ partId: selectedPart.id, zIndex: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) })}
                      className="w-full px-2 py-1 rounded text-xs font-mono" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(96,165,250,0.2)", color: "#e8ddd0", outline: "none" }} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {uploadPartType && selectedFishId && (
          <PartUploadModal
            partType={uploadPartType}
            fishItemId={selectedFishId}
            defaultZ={FISH_PART_TYPES.find(p => p.key === uploadPartType)?.defaultZ ?? 1}
            onClose={() => setUploadPartType(null)}
            onUpload={(fishItemId, partType, imageData, zIndex) => {
              addPartMutation.mutate({ fishItemId, partType, imageData, zIndex });
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        data-testid="button-add-fishing-item"
        onClick={() => { setEditingItem(null); setShowForm(true); }}
        className="w-full py-2.5 rounded-lg font-fantasy text-sm tracking-wider flex items-center justify-center gap-2 transition-transform active:scale-98"
        style={{
          background: "linear-gradient(135deg, #1e3a5f 0%, #0f2440 100%)",
          border: "1px solid rgba(96,165,250,0.4)",
          color: "#60a5fa",
          cursor: "pointer",
        }}
      >
        <span className="text-xl leading-none">+</span> Add Fishing Item
      </button>

      <div className="flex gap-1.5">
        {(["all", "pole", "bait", "fish"] as const).map(f => (
          <button
            key={f}
            data-testid={`button-filter-fish-${f}`}
            onClick={() => setFilterType(f)}
            className="flex-1 py-1 rounded font-fantasy text-[8px] tracking-wider"
            style={{
              background: filterType === f ? "rgba(96,165,250,0.2)" : "rgba(0,0,0,0.2)",
              border: filterType === f ? "1px solid rgba(96,165,250,0.4)" : "1px solid rgba(96,165,250,0.1)",
              color: filterType === f ? "#60a5fa" : "#6a8090",
              cursor: "pointer",
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <p className="font-fantasy text-[#6a5840] text-[10px] tracking-wider text-center">
        {filtered.length} fishing item{filtered.length !== 1 ? "s" : ""}
      </p>

      {isLoading ? (
        <div className="text-center py-8"><p className="font-fantasy text-[#60a5fa] text-sm animate-pulse">Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8"><p className="font-fantasy text-[#6a8090] text-sm tracking-wider">No fishing items found</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div
              key={item.id}
              data-testid={`card-fishing-item-${item.id}`}
              className="rounded-lg overflow-hidden"
              style={{ background: "linear-gradient(135deg, rgba(10,20,40,0.85) 0%, rgba(20,35,65,0.85) 100%)", border: "1px solid rgba(96,165,250,0.25)" }}
            >
              <div className="flex items-center gap-3 p-3">
                <div className="w-12 h-12 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(96,165,250,0.15)" }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                  ) : item.fishingType === "pole" ? (
                    <img src={fishRodIcon} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
                  ) : item.fishingType === "bait" ? (
                    <span className="text-2xl">🪱</span>
                  ) : (
                    <img src={fishCommonIcon} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-fantasy text-[#60a5fa] text-xs font-semibold truncate">{item.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-fantasy text-[8px] px-1.5 py-0.5 rounded-full capitalize" style={{ background: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}>
                      {item.fishingType || "—"}
                    </span>
                    <span className="font-fantasy text-[#f0c040] text-[8px]">{item.price} coins</span>
                  </div>
                  <p className="font-fantasy text-[#6a8090] text-[7px] mt-0.5">
                    {item.fishingType === "fish" && item.starRarity ? `${"★".repeat(item.starRarity)} rarity` : ""}
                    {item.fishingType === "pole" && item.rareCatchBoostPercent ? `+${item.rareCatchBoostPercent}% rare catch` : ""}
                    {item.fishingType === "pole" && item.poleMaxUses != null ? ` · ${item.poleMaxUses} uses` : item.fishingType === "pole" ? " · ∞ uses" : ""}
                    {item.fishingType === "bait" ? [item.rarityBoostPercent ? `+${item.rarityBoostPercent}% rarity` : "", item.baitCatchBoost ? `+${item.baitCatchBoost}% catch` : ""].filter(Boolean).join(" · ") : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {item.fishingType === "fish" && (
                    <button
                      data-testid={`button-parts-${item.id}`}
                      onClick={() => setSelectedFishId(item.id)}
                      className="px-2 py-1 rounded font-fantasy text-[8px] tracking-wider"
                      style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)", color: "#60a5fa", cursor: "pointer" }}
                    >
                      Parts
                    </button>
                  )}
                  <button
                    data-testid={`button-edit-fishing-${item.id}`}
                    onClick={() => { setEditingItem(item); setShowForm(true); }}
                    className="px-2 py-1 rounded font-fantasy text-[8px] tracking-wider"
                    style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", border: "1px solid rgba(212,160,23,0.4)", color: "#f0c040", cursor: "pointer" }}
                  >
                    Edit
                  </button>
                  <button
                    data-testid={`button-delete-fishing-${item.id}`}
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                    className="px-2 py-1 rounded font-fantasy text-[8px] tracking-wider disabled:opacity-50"
                    style={{ background: "rgba(139,0,0,0.4)", border: "1px solid rgba(200,50,50,0.3)", color: "#ff9999", cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <FishingItemForm
          item={editingItem}
          onClose={() => { setShowForm(false); setEditingItem(null); }}
          onSuccess={() => {
            setShowForm(false);
            setEditingItem(null);
            queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
          }}
        />
      )}
    </div>
  );
}

function FishingItemForm({ item, onClose, onSuccess }: { item: FishingItem | null; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price?.toString() || "0");
  const [fishingType, setFishingType] = useState<"pole" | "bait" | "fish">(
    (item?.fishingType as "pole" | "bait" | "fish") || "fish"
  );
  const [starRarity, setStarRarity] = useState(item?.starRarity?.toString() || "1");
  const [rareCatchBoostPercent, setRareCatchBoostPercent] = useState(item?.rareCatchBoostPercent?.toString() || "0");
  const [rarityBoostPercent, setRarityBoostPercent] = useState(item?.rarityBoostPercent?.toString() || "0");
  const [baitCatchBoost, setBaitCatchBoost] = useState(item?.baitCatchBoost?.toString() || "0");
  const [poleMaxUses, setPoleMaxUses] = useState(item?.poleMaxUses?.toString() || "");
  const [poleSlowdown3, setPoleSlowdown3] = useState(item?.poleSlowdown3 != null ? item.poleSlowdown3.toString() : "");
  const [poleSlowdown4, setPoleSlowdown4] = useState(item?.poleSlowdown4 != null ? item.poleSlowdown4.toString() : "");
  const [poleSlowdown5, setPoleSlowdown5] = useState(item?.poleSlowdown5 != null ? item.poleSlowdown5.toString() : "");
  const [fishSwimZone, setFishSwimZone] = useState<"full" | "bottom">((item?.fishSwimZone as "full" | "bottom") || "full");
  const [facingDirection, setFacingDirection] = useState<"right" | "left">(
    (item?.facingDirection as "right" | "left") || "right"
  );
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(item?.imageUrl || null);
  const [hooklessImageData, setHooklessImageData] = useState<string | null>(null);
  const [hooklessImagePreview, setHooklessImagePreview] = useState<string | null>(item?.hooklessImageUrl || null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/gif"].includes(file.type)) {
      toast({ title: "Invalid format", description: "PNG or GIF only", variant: "destructive" });
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setImageData(dataUrl);
    setImagePreview(dataUrl);
  };

  const handleHooklessFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/gif"].includes(file.type)) {
      toast({ title: "Invalid format", description: "PNG or GIF only", variant: "destructive" });
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setHooklessImageData(dataUrl);
    setHooklessImagePreview(dataUrl);
  };

  const handleSubmit = async () => {
    if (!imagePreview) {
      toast({ title: "Image required", description: "Upload an image", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim() || "Unnamed",
        price: parseInt(price) || 0,
        type: "fishing",
        worldId: "all",
        fishingType,
        starRarity: fishingType === "fish" ? parseInt(starRarity) || 1 : null,
        facingDirection: fishingType === "fish" ? facingDirection : null,
        fishSwimZone: fishingType === "fish" ? fishSwimZone : null,
        rareCatchBoostPercent: fishingType === "pole" ? parseInt(rareCatchBoostPercent) || 0 : null,
        rarityBoostPercent: fishingType === "bait" ? parseInt(rarityBoostPercent) || 0 : null,
        baitCatchBoost: fishingType === "bait" ? parseInt(baitCatchBoost) || 0 : null,
        poleMaxUses: fishingType === "pole" && poleMaxUses.trim() !== "" ? parseInt(poleMaxUses) || null : null,
        poleSlowdown3: fishingType === "pole" && poleSlowdown3.trim() !== "" ? parseFloat(poleSlowdown3) : null,
        poleSlowdown4: fishingType === "pole" && poleSlowdown4.trim() !== "" ? parseFloat(poleSlowdown4) : null,
        poleSlowdown5: fishingType === "pole" && poleSlowdown5.trim() !== "" ? parseFloat(poleSlowdown5) : null,
      };
      if (imageData) payload.imageData = imageData;
      if (hooklessImageData) (payload as any).hooklessImageData = hooklessImageData;

      if (item) {
        await apiRequest("PATCH", `/api/admin/shop/${item.id}`, payload);
        toast({ title: "Updated", description: "Fishing item updated" });
      } else {
        await apiRequest("POST", "/api/admin/shop", payload);
        toast({ title: "Created", description: "Fishing item added" });
      }
      onSuccess();
    } catch {
      toast({ title: "Failed", description: "Could not save", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[90%] max-w-sm rounded-lg p-5 animate-slide-up overflow-y-auto"
        style={{
          background: "linear-gradient(135deg, rgba(8,18,40,0.97) 0%, rgba(15,30,60,0.97) 100%)",
          border: "1px solid rgba(96,165,250,0.4)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
          maxHeight: "85vh",
        }}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f2440 100%)", border: "2px solid rgba(96,165,250,0.5)", color: "#60a5fa", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
        >
          X
        </button>

        <h3 className="font-fantasy text-center text-base tracking-widest mb-4 text-[#60a5fa]">
          {item ? "Edit Fishing Item" : "Add Fishing Item"}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Item Image (PNG or GIF)</label>
            <div className="flex items-center gap-2">
              <div className="w-16 h-16 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(96,165,250,0.3)" }} onClick={() => document.getElementById("fishing-img-input")?.click()}>
                {imagePreview ? <img src={imagePreview} alt="" className="w-full h-full object-contain" /> : <img src={fishCommonIcon} alt="" style={{ width: 32, height: 32, objectFit: "contain", opacity: 0.6 }} />}
              </div>
              <input id="fishing-img-input" type="file" accept="image/png,image/gif" onChange={handleFile} className="hidden" />
              <button type="button" onClick={() => document.getElementById("fishing-img-input")?.click()} className="flex-1 py-1.5 rounded-md font-fantasy text-[9px] tracking-wider" style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", border: "1px solid rgba(212,160,23,0.4)", color: "#f0c040", cursor: "pointer" }}>
                {imagePreview ? "Change" : "Upload"}
              </button>
            </div>
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Name</label>
            <input data-testid="input-fishing-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mystic Rod, Glowworm Bait..." className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Price</label>
            <input data-testid="input-fishing-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Fishing Type</label>
            <div className="flex gap-2">
              {(["fish", "pole", "bait"] as const).map(t => (
                <button
                  key={t}
                  data-testid={`button-fishing-type-${t}`}
                  onClick={() => setFishingType(t)}
                  className="flex-1 py-2 rounded-md font-fantasy text-[10px] tracking-wider capitalize"
                  style={{
                    background: fishingType === t ? "rgba(96,165,250,0.25)" : "rgba(0,0,0,0.2)",
                    border: fishingType === t ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(96,165,250,0.15)",
                    color: fishingType === t ? "#60a5fa" : "#6a8090",
                    cursor: "pointer",
                  }}
                >
                  {t === "fish" ? "🐟 Fish" : t === "pole" ? "🎣 Pole" : "🪱 Bait"}
                </button>
              ))}
            </div>
          </div>

          {fishingType === "fish" && (
            <div className="space-y-3">
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Rarity (Stars)</label>
                <select data-testid="select-fish-star-rarity" value={starRarity} onChange={(e) => setStarRarity(e.target.value)} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle}>
                  {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{"★".repeat(r)} ({r} Star{r > 1 ? "s" : ""})</option>)}
                </select>
                <p className="font-fantasy text-[#6a5840] text-[8px] mt-0.5">Higher rarity = less likely to catch. Upload parts after saving to animate the fish.</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Sprite Facing Direction</label>
                <div className="flex gap-2">
                  {(["right", "left"] as const).map(dir => (
                    <button
                      key={dir}
                      data-testid={`button-facing-${dir}`}
                      type="button"
                      onClick={() => setFacingDirection(dir)}
                      className="flex-1 py-2 rounded-md font-fantasy text-[10px] tracking-wider"
                      style={{
                        background: facingDirection === dir ? "rgba(96,165,250,0.25)" : "rgba(0,0,0,0.2)",
                        border: facingDirection === dir ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(96,165,250,0.15)",
                        color: facingDirection === dir ? "#60a5fa" : "#6a8090",
                        cursor: "pointer",
                      }}
                    >
                      {dir === "right" ? "▶ Faces Right" : "◀ Faces Left"}
                    </button>
                  ))}
                </div>
                <p className="font-fantasy text-[#6a5840] text-[8px] mt-0.5">Which way the fish sprite is naturally facing. Fish swim left-to-right in the aquarium — choose the opposite to flip it.</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Aquarium Swim Zone</label>
                <div className="flex gap-2">
                  {(["full", "bottom"] as const).map(zone => (
                    <button
                      key={zone}
                      type="button"
                      data-testid={`button-swim-zone-${zone}`}
                      onClick={() => setFishSwimZone(zone)}
                      className="flex-1 py-2 rounded-md font-fantasy text-[10px] tracking-wider capitalize"
                      style={{
                        background: fishSwimZone === zone ? "rgba(96,165,250,0.25)" : "rgba(0,0,0,0.2)",
                        border: fishSwimZone === zone ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(96,165,250,0.15)",
                        color: fishSwimZone === zone ? "#60a5fa" : "#6a8090",
                        cursor: "pointer",
                      }}
                    >
                      {zone === "full" ? "🌊 Full Page" : "🪨 Bottom"}
                    </button>
                  ))}
                </div>
                <p className="font-fantasy text-[#6a5840] text-[8px] mt-0.5">Full: fish roams entire aquarium. Bottom: fish stays near the floor with a little swim room.</p>
              </div>
            </div>
          )}

          {fishingType === "pole" && (
            <div className="space-y-3">
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Rare Catch Boost (%)</label>
                <input data-testid="input-pole-boost" type="number" value={rareCatchBoostPercent} onChange={(e) => setRareCatchBoostPercent(e.target.value)} placeholder="0" min="0" max="100" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] mt-0.5">Extra % chance to catch 4-5 star rarity fish</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Uses Before Breaking</label>
                <input
                  data-testid="input-pole-max-uses"
                  type="number"
                  value={poleMaxUses}
                  onChange={(e) => setPoleMaxUses(e.target.value)}
                  placeholder="Leave blank for unbreakable"
                  min="1"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
                <p className="font-fantasy text-[#6a5840] text-[8px] mt-0.5">How many fish attempts before this rod breaks. Leave blank for infinite uses.</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Hookless Image (PNG or GIF)</label>
                <div className="flex items-center gap-2">
                  <div
                    className="w-16 h-16 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(96,165,250,0.3)" }}
                    onClick={() => document.getElementById("fishing-hookless-img-input")?.click()}
                  >
                    {hooklessImagePreview
                      ? <img src={hooklessImagePreview} alt="" className="w-full h-full object-contain" />
                      : <img src={fishRodIcon} alt="" style={{ width: 32, height: 32, objectFit: "contain", opacity: 0.4 }} />}
                  </div>
                  <input id="fishing-hookless-img-input" type="file" accept="image/png,image/gif" onChange={handleHooklessFile} className="hidden" />
                  <div className="flex-1 space-y-1">
                    <button
                      type="button"
                      data-testid="button-upload-hookless-image"
                      onClick={() => document.getElementById("fishing-hookless-img-input")?.click()}
                      className="w-full py-1.5 rounded-md font-fantasy text-[9px] tracking-wider"
                      style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", border: "1px solid rgba(212,160,23,0.4)", color: "#f0c040", cursor: "pointer" }}
                    >
                      {hooklessImagePreview ? "Change" : "Upload"}
                    </button>
                    {hooklessImagePreview && (
                      <button
                        type="button"
                        onClick={() => { setHooklessImageData(null); setHooklessImagePreview(null); }}
                        className="w-full py-1 rounded-md font-fantasy text-[8px] tracking-wider"
                        style={{ background: "rgba(180,30,30,0.2)", border: "1px solid rgba(180,30,30,0.4)", color: "#f87171", cursor: "pointer" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <p className="font-fantasy text-[#6a5840] text-[8px] mt-1">Version of the pole without a hook — used on the fishing page while waiting for a bite.</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Fish Slowdown by Rarity (%)</label>
                <p className="font-fantasy text-[#6a5840] text-[8px] mb-2">How much to slow down 3★, 4★ and 5★ fish while reeling. Leave blank to use the default speed. e.g. 30 = 30% slower.</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { label: "3★ Slow %", value: poleSlowdown3, set: setPoleSlowdown3, testId: "input-pole-slowdown-3" },
                    { label: "4★ Slow %", value: poleSlowdown4, set: setPoleSlowdown4, testId: "input-pole-slowdown-4" },
                    { label: "5★ Slow %", value: poleSlowdown5, set: setPoleSlowdown5, testId: "input-pole-slowdown-5" },
                  ] as const).map(({ label, value, set, testId }) => (
                    <div key={testId}>
                      <label className="font-fantasy text-[#a89878] text-[8px] block mb-0.5">{label}</label>
                      <input
                        data-testid={testId}
                        type="number"
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        placeholder="—"
                        min="0"
                        max="90"
                        className="w-full px-2 py-1.5 rounded-md font-sans text-xs outline-none"
                        style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {fishingType === "bait" && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Rarity Boost (%)</label>
                <input data-testid="input-bait-boost" type="number" value={rarityBoostPercent} onChange={(e) => setRarityBoostPercent(e.target.value)} placeholder="0" min="0" max="100" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] mt-0.5">Extra % chance for 3★+ fish to appear when this bait is used</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Catch Boost (%)</label>
                <input data-testid="input-bait-catch-boost" type="number" value={baitCatchBoost} onChange={(e) => setBaitCatchBoost(e.target.value)} placeholder="0" min="0" max="100" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] mt-0.5">% faster reel-in speed — makes the catch bar fill more quickly</p>
              </div>
            </div>
          )}

          <button
            data-testid="button-submit-fishing-item"
            onClick={handleSubmit}
            disabled={submitting || !imagePreview}
            className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-98 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f2440 100%)", border: "1px solid rgba(96,165,250,0.4)", color: "#60a5fa", cursor: imagePreview ? "pointer" : "not-allowed" }}
          >
            <Save className="w-4 h-4 inline mr-1" />
            {submitting ? "Saving..." : item ? "Update Item" : "Add to Game"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PartUploadModal({ partType, fishItemId, defaultZ, onClose, onUpload }: {
  partType: string;
  fishItemId: string;
  defaultZ: number;
  onClose: () => void;
  onUpload: (fishItemId: string, partType: string, imageData: string, zIndex: number) => void;
}) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png") { toast({ title: "PNG only", variant: "destructive" }); return; }
    const dataUrl = await readFileAsDataUrl(file);
    setImageData(dataUrl);
    setPreview(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-[80%] max-w-xs rounded-lg p-4" style={{ background: "rgba(8,18,40,0.97)", border: "1px solid rgba(96,165,250,0.4)" }}>
        <h4 className="font-fantasy text-[#60a5fa] text-xs tracking-wider capitalize text-center mb-3">Upload {partType}</h4>
        {preview && <img src={preview} alt="" className="w-24 h-24 object-contain mx-auto mb-3 rounded-md" style={{ background: "rgba(0,0,0,0.3)" }} />}
        <input type="file" accept="image/png" onChange={handleFile} className="w-full text-xs font-fantasy mb-3" style={{ color: "#60a5fa" }} />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-1.5 rounded font-fantasy text-[9px]" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(96,165,250,0.2)", color: "#6a8090", cursor: "pointer" }}>Cancel</button>
          <button
            onClick={() => { if (imageData) { onUpload(fishItemId, partType, imageData, defaultZ); onClose(); } }}
            disabled={!imageData}
            className="flex-1 py-1.5 rounded font-fantasy text-[9px] disabled:opacity-50"
            style={{ background: "rgba(96,165,250,0.2)", border: "1px solid rgba(96,165,250,0.4)", color: "#60a5fa", cursor: imageData ? "pointer" : "not-allowed" }}
          >
            Add Part
          </button>
        </div>
      </div>
    </div>
  );
}
