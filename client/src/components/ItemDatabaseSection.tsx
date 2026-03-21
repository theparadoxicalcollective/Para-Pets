import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readFileAsDataUrl } from "@/lib/utils";

export interface ShopItemFull {
  id: string;
  name: string;
  price: number;
  type: string;
  worldId: string;
  imageUrl: string | null;
  eggImageUrl: string | null;
  hatchedImageUrl: string | null;
  rarity: number | null;
  hatchTime: number | null;
  statBoostType: string | null;
  statBoostAmount: number | null;
  petTemplateId: string | null;
  specialSkill: string | null;
  skillDamagePercent: number | null;
  healthRestored: number | null;
  manaRestored: number | null;
  petsRevived: number | null;
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
  specialType: string | null;
  specialAmount: number | null;
  fishingType: string | null;
  starRarity: number | null;
  baitCatchBoost: number | null;
  rarityBoostPercent: number | null;
  baitRarityBoostStar: number | null;
  poleMaxUses: number | null;
  createdAt: string;
}

interface PetTemplateOption {
  id: string;
  name: string;
  frontAssembled: string | null;
}

export const WORLD_OPTIONS = [
  { id: "enchanted_grove", name: "Enchanted Grove" },
  { id: "snowy_mountain", name: "Frostpeak" },
  { id: "sky_realm", name: "Sky Realm" },
  { id: "island", name: "The Lost Island" },
  { id: "volcanic", name: "Volcanic Isle" },
  { id: "desert", name: "Scorched Desert" },
  { id: "swamp", name: "The Swamp" },
  { id: "haunted_woods", name: "Haunted Woods" },
];

const NON_PET_TYPES = ["power_up", "accessory", "potion", "special", "decor", "edibles", "fishing"];

function formatTypeName(type: string): string {
  if (type === "power_up") return "Power Up";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function ItemDatabaseSection() {
  const [subSection, setSubSection] = useState<"items" | "pets">("items");
  const [editingItem, setEditingItem] = useState<ShopItemFull | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allItems = [], isLoading } = useQuery<ShopItemFull[]>({
    queryKey: ["/api/admin/shop-items-all"],
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/admin/shop/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      toast({ title: "Deleted", description: "Item removed from game" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not delete item", variant: "destructive" });
    },
  });

  const handleOpenForm = (item: ShopItemFull | null = null) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingItem(null);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingItem(null);
    queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    WORLD_OPTIONS.forEach(w => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop", w.id] });
    });
  };

  const sectionItems = allItems.filter(item =>
    subSection === "pets" ? item.type === "pet" : item.type !== "pet"
  );

  const filtered = sectionItems.filter(item => {
    if (filterType !== "all" && item.type !== filterType) return false;
    return true;
  });

  const isPetSection = subSection === "pets";

  return (
    <div className="space-y-3">
      {/* Sub-section toggle */}
      <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(212,160,23,0.3)" }}>
        <button
          data-testid="tab-sub-items"
          onClick={() => { setSubSection("items"); setFilterType("all"); }}
          className="flex-1 py-2 font-fantasy text-[11px] tracking-wider transition-all"
          style={{
            background: !isPetSection
              ? "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)"
              : "rgba(0,0,0,0.25)",
            color: !isPetSection ? "#7fffd4" : "#a89878",
            border: "none",
            cursor: "pointer",
          }}
        >
          Add Item
        </button>
        <button
          data-testid="tab-sub-pets"
          onClick={() => { setSubSection("pets"); setFilterType("all"); }}
          className="flex-1 py-2 font-fantasy text-[11px] tracking-wider transition-all"
          style={{
            background: isPetSection
              ? "linear-gradient(135deg, #8b4513 0%, #5c3a1e 100%)"
              : "rgba(0,0,0,0.25)",
            color: isPetSection ? "#ffb347" : "#a89878",
            border: "none",
            borderLeft: "1px solid rgba(212,160,23,0.3)",
            cursor: "pointer",
          }}
        >
          Add Pet
        </button>
      </div>

      {/* Add button */}
      <button
        data-testid={isPetSection ? "button-add-new-pet" : "button-add-new-item"}
        onClick={() => handleOpenForm(null)}
        className="w-full py-2.5 rounded-lg font-fantasy text-sm tracking-wider flex items-center justify-center gap-2 transition-transform active:scale-98"
        style={{
          background: isPetSection
            ? "linear-gradient(135deg, #8b4513 0%, #5c3a1e 100%)"
            : "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
          border: isPetSection
            ? "1px solid rgba(255,179,71,0.4)"
            : "1px solid rgba(127,255,212,0.4)",
          color: isPetSection ? "#ffb347" : "#7fffd4",
          cursor: "pointer",
        }}
      >
        <span className="text-xl leading-none">+</span>
        {isPetSection ? "Add New Pet" : "Add New Item"}
      </button>

      {/* Type filter — items section only */}
      {!isPetSection && (
        <div className="flex gap-2">
          <select
            data-testid="select-filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-md font-fantasy text-[10px] outline-none"
            style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
          >
            <option value="all">All Types</option>
            {NON_PET_TYPES.map(t => (
              <option key={t} value={t}>{formatTypeName(t)}</option>
            ))}
          </select>
        </div>
      )}

      <p className="font-fantasy text-[#6a5840] text-[10px] tracking-wider text-center">
        {filtered.length} {isPetSection ? "pet" : "item"}{filtered.length !== 1 ? "s" : ""} in database
      </p>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Loading...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="font-fantasy text-[#a89878] text-sm tracking-wider">
            No {isPetSection ? "pets" : "items"} found
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {(() => {
            const sorted = [...filtered].sort((a, b) => {
              if (a.type !== b.type) {
                const typeOrder = isPetSection ? [] : NON_PET_TYPES;
                const ai = typeOrder.indexOf(a.type);
                const bi = typeOrder.indexOf(b.type);
                const aIdx = ai === -1 ? 999 : ai;
                const bIdx = bi === -1 ? 999 : bi;
                if (aIdx !== bIdx) return aIdx - bIdx;
              }
              return a.name.localeCompare(b.name);
            });

            const showTypeHeaders = !isPetSection && filterType === "all";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const elements: any[] = [];
            let lastType = "";

            sorted.forEach(item => {
              if (showTypeHeaders && item.type !== lastType) {
                lastType = item.type;
                elements.push(
                  <div
                    key={`header-${item.type}`}
                    className="pt-1 pb-0.5 px-1"
                  >
                    <p
                      className="font-fantasy text-[9px] tracking-widest uppercase"
                      style={{ color: "rgba(212,160,23,0.55)" }}
                    >
                      {formatTypeName(item.type)}
                    </p>
                  </div>
                );
              }

              const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
              elements.push(
                <div
                  key={item.id}
                  data-testid={`card-db-item-${item.id}`}
                  className="rounded-lg overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(50,30,10,0.85) 100%)",
                    border: item.type === "pet"
                      ? "1px solid rgba(255,179,71,0.3)"
                      : "1px solid rgba(212,160,23,0.3)",
                  }}
                >
                  <div className="flex items-center gap-3 p-3">
                    <div
                      className="w-12 h-12 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.15)" }}
                    >
                      {displayImg ? (
                        <img src={displayImg} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="font-fantasy text-[#5a4a3a] text-lg">?</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-fantasy text-[#f0c040] text-xs font-semibold truncate">{item.name}</p>
                        {item.type === "pet" && item.rarity && (
                          <span className="text-[8px]" style={{ color: "#f0c040" }}>{"★".repeat(item.rarity)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="font-fantasy text-[8px] tracking-wider px-1.5 py-0.5 rounded-full"
                          style={{
                            background: item.type === "pet" ? "rgba(255,179,71,0.12)" : "rgba(127,255,212,0.1)",
                            color: item.type === "pet" ? "#ffb347" : "#7fbfb0",
                            border: item.type === "pet" ? "1px solid rgba(255,179,71,0.25)" : "1px solid rgba(127,255,212,0.2)",
                          }}
                        >
                          {formatTypeName(item.type)}
                        </span>
                        <span className="font-fantasy text-[#f0c040] text-[8px]">{item.price} coins</span>
                      </div>
                      {(item.type === "power_up" || item.type === "item") && item.statBoostType && (
                        <span className="font-fantasy text-[#a89878] text-[7px]">
                          +{item.statBoostAmount} {item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : "LVL"}
                        </span>
                      )}
                      {item.type === "edibles" && item.statBoostAmount && (
                        <span className="font-fantasy text-[#86efac] text-[7px]">+{item.statBoostAmount} LVL pts when fed</span>
                      )}
                      {item.type === "potion" && (
                        <span className="font-fantasy text-[#a89878] text-[7px]">
                          {item.healthRestored ? `+${item.healthRestored} HP` : ""}{item.manaRestored ? ` +${item.manaRestored} MP` : ""}{item.petsRevived ? ` Revive ${item.petsRevived}` : ""}
                        </span>
                      )}
                      {item.type === "accessory" && (
                        <span className="font-fantasy text-[#a89878] text-[7px]">
                          {item.atkBoost ? `+${item.atkBoost} ATK` : ""}{item.defBoost ? ` +${item.defBoost} DEF` : ""}{item.healthBoost ? ` +${item.healthBoost} HP` : ""}
                        </span>
                      )}
                      {item.type === "fishing" && (
                        <span className="font-fantasy text-[#7fd4f0] text-[7px]">
                          {item.fishingType === "fish"
                            ? `${"★".repeat(item.starRarity ?? 1)} Fish (${["Common","Uncommon","Rare","Epic","Legendary"][(item.starRarity ?? 1) - 1]})`
                            : item.fishingType === "pole"
                            ? `Pole${item.poleMaxUses ? ` · ${item.poleMaxUses} uses` : " · Unlimited"}`
                            : item.fishingType === "bait"
                            ? `Bait${item.rarityBoostPercent ? ` · +${item.rarityBoostPercent}% on ${"★".repeat(item.baitRarityBoostStar ?? 3)}` : ""}`
                            : (item.fishingType ?? "fishing")}
                        </span>
                      )}
                      {item.type === "pet" && item.specialSkill && (
                        <span className="font-fantasy text-[#c084fc] text-[7px]">Skill: {item.specialSkill}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        data-testid={`button-edit-db-item-${item.id}`}
                        onClick={() => handleOpenForm(item)}
                        className="px-2 py-1 rounded font-fantasy text-[8px] tracking-wider"
                        style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", border: "1px solid rgba(212,160,23,0.4)", color: "#f0c040", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      <button
                        data-testid={`button-delete-db-item-${item.id}`}
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
              );
            });

            return elements;
          })()}
        </div>
      )}

      {showForm && (
        <AdminItemForm
          item={editingItem}
          petOnly={isPetSection}
          onClose={handleCloseForm}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}

function AdminItemForm({
  item,
  petOnly,
  onClose,
  onSuccess,
}: {
  item: ShopItemFull | null;
  petOnly: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const defaultType = petOnly ? "pet" : (item?.type !== "pet" ? (item?.type || "power_up") : "power_up");
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price?.toString() || "");
  const [type, setType] = useState(defaultType);
  const [edibleLvlPoints, setEdibleLvlPoints] = useState(item?.statBoostAmount?.toString() || "5");
  const [fishingType, setFishingType] = useState(item?.fishingType || "fish");
  const [starRarity, setStarRarity] = useState(item?.starRarity?.toString() || "1");
  const [baitCatchBoost, setBaitCatchBoost] = useState(item?.baitCatchBoost?.toString() || "");
  const [rarityBoostPercent, setRarityBoostPercent] = useState(item?.rarityBoostPercent?.toString() || "0");
  const [baitRarityBoostStar, setBaitRarityBoostStar] = useState(item?.baitRarityBoostStar?.toString() || "3");
  const [poleMaxUses, setPoleMaxUses] = useState(item?.poleMaxUses?.toString() || "");
  const [rarity, setRarity] = useState(item?.rarity?.toString() || "1");
  const [hatchTime, setHatchTime] = useState(item?.hatchTime?.toString() || "1");
  const [specialSkill, setSpecialSkill] = useState(item?.specialSkill || "");
  const [skillDamagePercent, setSkillDamagePercent] = useState(item?.skillDamagePercent?.toString() || "");
  const [petTemplateId, setPetTemplateId] = useState(item?.petTemplateId || "");
  const [statBoostType, setStatBoostType] = useState(item?.statBoostType || "health");
  const [statBoostAmount, setStatBoostAmount] = useState(item?.statBoostAmount?.toString() || "10");
  const [healthRestored, setHealthRestored] = useState(item?.healthRestored?.toString() || "");
  const [manaRestored, setManaRestored] = useState(item?.manaRestored?.toString() || "");
  const [petsRevived, setPetsRevived] = useState(item?.petsRevived?.toString() || "");
  const [atkBoost, setAtkBoost] = useState(item?.atkBoost?.toString() || "");
  const [defBoost, setDefBoost] = useState(item?.defBoost?.toString() || "");
  const [healthBoost, setHealthBoost] = useState(item?.healthBoost?.toString() || "");
  const [specialType, setSpecialType] = useState(item?.specialType || "hatch_time");
  const [specialAmount, setSpecialAmount] = useState(item?.specialAmount?.toString() || "10");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(item?.imageUrl || null);
  const [eggImageData, setEggImageData] = useState<string | null>(null);
  const [eggImagePreview, setEggImagePreview] = useState<string | null>(item?.eggImageUrl || null);
  const [hatchedImageData, setHatchedImageData] = useState<string | null>(null);
  const [hatchedImagePreview, setHatchedImagePreview] = useState<string | null>(item?.hatchedImageUrl || null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const { data: petTemplates = [] } = useQuery<PetTemplateOption[]>({
    queryKey: ["/api/admin/pet-templates"],
    enabled: petOnly || type === "pet",
  });

  const effectiveType = petOnly ? "pet" : type;

  const hasAnyPhoto = !!(imageData || imagePreview || eggImageData || eggImagePreview || hatchedImageData || hatchedImagePreview);

  const handleSubmit = async () => {
    if (!hasAnyPhoto) {
      toast({ title: "Photo required", description: "Upload at least one image to continue", variant: "destructive" });
      return;
    }
    const priceNum = price.trim() ? parseInt(price) : 0;

    setSubmitting(true);
    try {
      const finalName = name.trim() || (petOnly ? "Unnamed Pet" : "Unnamed Item");
      const payload: any = { name: finalName, price: priceNum, type: effectiveType, worldId: "all" };
      if (imageData) payload.imageData = imageData;

      if (effectiveType === "pet") {
        payload.rarity = parseInt(rarity);
        payload.hatchTime = parseInt(hatchTime);
        payload.specialSkill = specialSkill.trim() || null;
        payload.skillDamagePercent = skillDamagePercent.trim() ? parseFloat(skillDamagePercent) : null;
        payload.petTemplateId = petTemplateId || null;
        if (eggImageData) payload.eggImageData = eggImageData;
        if (hatchedImageData) payload.hatchedImageData = hatchedImageData;
        payload.statBoostType = null;
        payload.statBoostAmount = null;
        payload.healthRestored = null;
        payload.manaRestored = null;
        payload.petsRevived = null;
        payload.atkBoost = null;
        payload.defBoost = null;
        payload.specialType = null;
        payload.specialAmount = null;
      } else {
        payload.rarity = null;
        payload.hatchTime = null;
        payload.eggImageUrl = null;
        payload.hatchedImageUrl = null;
        payload.specialSkill = null;
        payload.skillDamagePercent = null;
        payload.petTemplateId = null;

        if (effectiveType === "power_up") {
          payload.statBoostType = statBoostType;
          payload.statBoostAmount = parseInt(statBoostAmount) || 10;
        } else if (effectiveType === "edibles") {
          payload.statBoostType = "lvl";
          payload.statBoostAmount = parseInt(edibleLvlPoints) || 5;
        } else {
          payload.statBoostType = null;
          payload.statBoostAmount = null;
        }

        if (effectiveType === "potion") {
          payload.healthRestored = parseInt(healthRestored) || null;
          payload.manaRestored = parseInt(manaRestored) || null;
          payload.petsRevived = parseInt(petsRevived) || null;
        } else {
          payload.healthRestored = null;
          payload.manaRestored = null;
          payload.petsRevived = null;
        }

        if (effectiveType === "accessory") {
          payload.atkBoost    = parseInt(atkBoost)    || null;
          payload.defBoost    = parseInt(defBoost)    || null;
          payload.healthBoost = parseInt(healthBoost) || null;
        } else {
          payload.atkBoost    = null;
          payload.defBoost    = null;
          payload.healthBoost = null;
        }

        if (effectiveType === "special") {
          payload.specialType = specialType;
          payload.specialAmount = parseInt(specialAmount) || 10;
        } else {
          payload.specialType = null;
          payload.specialAmount = null;
        }

        if (effectiveType === "fishing") {
          payload.fishingType = fishingType;
          if (fishingType === "fish") {
            payload.starRarity = parseInt(starRarity) || 1;
            payload.baitCatchBoost = null;
            payload.rarityBoostPercent = null;
            payload.baitRarityBoostStar = null;
            payload.poleMaxUses = null;
          } else if (fishingType === "bait") {
            payload.starRarity = null;
            payload.baitCatchBoost = null;
            payload.rarityBoostPercent = parseInt(rarityBoostPercent) || 0;
            payload.baitRarityBoostStar = parseInt(baitRarityBoostStar) || null;
            payload.poleMaxUses = null;
          } else if (fishingType === "pole") {
            payload.starRarity = null;
            payload.baitCatchBoost = null;
            payload.rarityBoostPercent = null;
            payload.baitRarityBoostStar = null;
            payload.poleMaxUses = parseInt(poleMaxUses) || null;
          }
        } else {
          payload.fishingType = null;
          payload.starRarity = null;
          payload.baitCatchBoost = null;
          payload.rarityBoostPercent = null;
          payload.baitRarityBoostStar = null;
          payload.poleMaxUses = null;
        }
      }

      if (item) {
        await apiRequest("PATCH", `/api/admin/shop/${item.id}`, payload);
        toast({ title: "Updated", description: `${petOnly ? "Pet" : "Item"} updated successfully` });
      } else {
        await apiRequest("POST", "/api/admin/shop", payload);
        toast({ title: "Created", description: `${petOnly ? "Pet" : "Item"} added to game` });
      }
      onSuccess();
    } catch {
      toast({ title: "Failed", description: "Could not save", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" };
  const accentColor = petOnly ? "#ffb347" : "#7fffd4";
  const accentBg = petOnly
    ? "linear-gradient(135deg, #8b4513 0%, #5c3a1e 100%)"
    : "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)";
  const accentBorder = petOnly ? "rgba(255,179,71,0.4)" : "rgba(127,255,212,0.4)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[90%] max-w-sm rounded-lg p-5 animate-slide-up overflow-y-auto"
        style={{
          background: "linear-gradient(135deg, rgba(30,15,5,0.97) 0%, rgba(60,35,10,0.97) 100%)",
          border: `1px solid ${petOnly ? "rgba(255,179,71,0.5)" : "rgba(212,160,23,0.5)"}`,
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          maxHeight: "85vh",
        }}
      >
        <button
          data-testid="button-close-item-form"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
        >
          X
        </button>

        <h3 className="font-fantasy text-center text-base tracking-widest mb-4" style={{ color: accentColor }}>
          {item ? (petOnly ? "Edit Pet" : "Edit Item") : (petOnly ? "Add Pet" : "Add Item")}
        </h3>

        <div className="space-y-3">
          <ImageUpload
            label={petOnly ? "Shop Image (PNG)" : "Shop Image (PNG)"}
            preview={imagePreview}
            onSelect={(d) => { setImageData(d); setImagePreview(d); }}
            onRemove={() => { setImageData(null); setImagePreview(null); }}
            inputId="admin-shop-item-img"
          />

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">
              {petOnly ? "Species" : "Name"}
            </label>
            <input
              data-testid="input-item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={petOnly ? "Species name" : "Item name"}
              className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Price</label>
            <input
              data-testid="input-item-price"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
              style={inputStyle}
            />
          </div>

          {/* Type selector — only shown in items section */}
          {!petOnly && (
            <div>
              <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Type</label>
              <select
                data-testid="select-item-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                style={inputStyle}
              >
                {NON_PET_TYPES.map((t) => (
                  <option key={t} value={t}>{formatTypeName(t)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Pet-specific fields — always shown in pet section */}
          {petOnly && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Rarity</label>
                <select
                  data-testid="select-rarity"
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                >
                  {[1, 2, 3, 4, 5].map((r) => (
                    <option key={r} value={r}>{"★".repeat(r)} ({r} Star{r > 1 ? "s" : ""})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Hatch Time (hours)</label>
                <input
                  data-testid="input-hatch-time"
                  type="number"
                  value={hatchTime}
                  onChange={(e) => setHatchTime(e.target.value)}
                  placeholder="1"
                  min="1"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Special Skill</label>
                <select
                  data-testid="select-special-skill-type"
                  value={["Lazer","Bubble","Heal Self","Heal Party","Poison"].includes(specialSkill) ? specialSkill : "__custom__"}
                  onChange={(e) => { if (e.target.value !== "__custom__") setSpecialSkill(e.target.value); }}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm outline-none mb-1"
                  style={inputStyle}
                >
                  <option value="__custom__">— Custom / None —</option>
                  <option value="Lazer">Lazer</option>
                  <option value="Bubble">Bubble</option>
                  <option value="Heal Self">Heal Self</option>
                  <option value="Heal Party">Heal Party</option>
                  <option value="Poison">Poison</option>
                </select>
                <input
                  data-testid="input-special-skill"
                  type="text"
                  value={specialSkill}
                  onChange={(e) => setSpecialSkill(e.target.value)}
                  placeholder="Or type a custom skill name..."
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Pick from the list or type a custom skill name</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Skill Damage %</label>
                <input
                  data-testid="input-skill-damage-percent"
                  type="number"
                  value={skillDamagePercent}
                  onChange={(e) => setSkillDamagePercent(e.target.value)}
                  placeholder="e.g. 250 (= 2.5× ATK for Lazer), 30 (= 30% heal), 5 (= 5% poison/tick)"
                  min="0"
                  step="0.5"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">
                  Number stored as %. Lazer/Bubble: % of ATK. Heal: % of maxHP. Poison: % of enemy maxHP per tick.
                </p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Animated Template (Pet DB)</label>
                <select
                  data-testid="select-pet-template"
                  value={petTemplateId}
                  onChange={(e) => setPetTemplateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="">None (static image only)</option>
                  {petTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.frontAssembled ? " ✓" : ""}</option>
                  ))}
                </select>
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Link to a Pet DB template for part-based animation</p>
              </div>
              <ImageUpload
                label="Egg Image (PNG or GIF)"
                preview={eggImagePreview}
                onSelect={(d) => { setEggImageData(d); setEggImagePreview(d); }}
                onRemove={() => { setEggImageData(null); setEggImagePreview(null); }}
                inputId="admin-egg-img"
                allowGif
              />
              <ImageUpload
                label="Hatched Pet Image (PNG or GIF)"
                preview={hatchedImagePreview}
                onSelect={(d) => { setHatchedImageData(d); setHatchedImagePreview(d); }}
                onRemove={() => { setHatchedImageData(null); setHatchedImagePreview(null); }}
                inputId="admin-hatched-img"
                allowGif
              />
            </>
          )}

          {/* Item-type-specific fields */}
          {!petOnly && effectiveType === "power_up" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Stat Boost Type</label>
                <select
                  data-testid="select-stat-boost"
                  value={statBoostType}
                  onChange={(e) => setStatBoostType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="health">Health (+HP)</option>
                  <option value="atk">Attack (+ATK)</option>
                  <option value="def">Defense (+DEF)</option>
                  <option value="lvl">Level (+LVL Points)</option>
                </select>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">
                  {statBoostType === "health" ? "HP Added" : statBoostType === "atk" ? "ATK Added" : statBoostType === "def" ? "DEF Added" : "Levels Added"}
                </label>
                <input
                  data-testid="input-stat-boost-amount"
                  type="number"
                  value={statBoostAmount}
                  onChange={(e) => setStatBoostAmount(e.target.value)}
                  placeholder="10"
                  min="1"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Consumable - disappears after use on a pet</p>
              </div>
            </>
          )}

          {!petOnly && effectiveType === "decor" && (
            <p className="font-fantasy text-[#7fbfb0] text-[8px] tracking-wider text-center">Decor items are purely cosmetic — name and price only</p>
          )}

          {!petOnly && effectiveType === "edibles" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">+LVL Points when fed</label>
                <input
                  data-testid="input-edible-lvl-points"
                  type="number"
                  value={edibleLvlPoints}
                  onChange={(e) => setEdibleLvlPoints(e.target.value)}
                  placeholder="5"
                  min="1"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Level points added to a pet when this edible is fed to them</p>
              </div>
              <p className="font-fantasy text-[#86efac] text-[8px] tracking-wider text-center">Edibles can be fed to pets from the Pet World page</p>
            </>
          )}

          {!petOnly && effectiveType === "potion" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Health Restored</label>
                <input data-testid="input-health-restored" type="number" value={healthRestored} onChange={(e) => setHealthRestored(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">HP healed in battle</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Mana Restored</label>
                <input data-testid="input-mana-restored" type="number" value={manaRestored} onChange={(e) => setManaRestored(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">MP recovered in battle</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Pets Revived</label>
                <input data-testid="input-pets-revived" type="number" value={petsRevived} onChange={(e) => setPetsRevived(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Number of knocked pets revived (highest stats first)</p>
              </div>
              <p className="font-fantasy text-[#ff9999] text-[8px] tracking-wider text-center">Potions are consumables - battle use only</p>
            </>
          )}

          {!petOnly && effectiveType === "accessory" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">ATK Boost (when equipped)</label>
                <input data-testid="input-atk-boost" type="number" value={atkBoost} onChange={(e) => setAtkBoost(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">DEF Boost (when equipped)</label>
                <input data-testid="input-def-boost" type="number" value={defBoost} onChange={(e) => setDefBoost(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Health Boost (when equipped)</label>
                <input data-testid="input-health-boost" type="number" value={healthBoost} onChange={(e) => setHealthBoost(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
              </div>
              <p className="font-fantasy text-[#7fbfb0] text-[8px] tracking-wider text-center">Accessories are equippable — stats added when worn, removed when unequipped.</p>
            </>
          )}

          {!petOnly && effectiveType === "special" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Special Effect</label>
                <select
                  data-testid="select-special-type"
                  value={specialType}
                  onChange={(e) => setSpecialType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="hatch_time">Reduce Hatching Time</option>
                  <option value="level">Level Up Points</option>
                </select>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">
                  {specialType === "hatch_time" ? "Minutes Reduced" : "Level Points Added"}
                </label>
                <input
                  data-testid="input-special-amount"
                  type="number"
                  value={specialAmount}
                  onChange={(e) => setSpecialAmount(e.target.value)}
                  placeholder="10"
                  min="1"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">
                  {specialType === "hatch_time" ? "1 = 1 minute off hatching time" : "1 = 1 level point towards leveling up"}
                </p>
              </div>
              <p className="font-fantasy text-[#f0c040] text-[8px] tracking-wider text-center">Special items do NOT count toward a pet's limited power-up uses</p>
            </>
          )}

          {!petOnly && effectiveType === "fishing" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Fishing Item Type</label>
                <select
                  data-testid="select-fishing-type"
                  value={fishingType}
                  onChange={(e) => setFishingType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="fish">Fish (catchable in ponds)</option>
                  <option value="pole">Fishing Pole</option>
                  <option value="bait">Bait</option>
                </select>
              </div>
              {fishingType === "fish" && (
                <div>
                  <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Star Rarity (1–5)</label>
                  <select
                    data-testid="select-star-rarity"
                    value={starRarity}
                    onChange={(e) => setStarRarity(e.target.value)}
                    className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                    style={inputStyle}
                  >
                    <option value="1">★ (1 Star — Common, 60% weight)</option>
                    <option value="2">★★ (2 Stars — Uncommon, 24% weight)</option>
                    <option value="3">★★★ (3 Stars — Rare, 10% weight)</option>
                    <option value="4">★★★★ (4 Stars — Epic, 4% weight)</option>
                    <option value="5">★★★★★ (5 Stars — Legendary, 2% weight)</option>
                  </select>
                  <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Higher rarity = harder to catch. Weights: 1★ 60%, 2★ 24%, 3★ 10%, 4★ 4%, 5★ 2%</p>
                </div>
              )}
              {fishingType === "bait" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Rarity Boost (%)</label>
                    <input
                      data-testid="input-bait-boost"
                      type="number"
                      value={rarityBoostPercent}
                      onChange={(e) => setRarityBoostPercent(e.target.value)}
                      placeholder="e.g. 40"
                      min="0"
                      max="500"
                      className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Target Star Rarity</label>
                    <select
                      data-testid="select-bait-rarity-star"
                      value={baitRarityBoostStar}
                      onChange={(e) => setBaitRarityBoostStar(e.target.value)}
                      className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                      style={inputStyle}
                    >
                      <option value="2">★★ 2 Stars</option>
                      <option value="3">★★★ 3 Stars</option>
                      <option value="4">★★★★ 4 Stars</option>
                      <option value="5">★★★★★ 5 Stars</option>
                    </select>
                    <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">
                      When this bait is equipped, the selected star rarity fish will appear {rarityBoostPercent || "0"}% more often than other fish.
                    </p>
                  </div>
                </div>
              )}
              {fishingType === "pole" && (
                <div>
                  <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Max Uses (0 = unlimited)</label>
                  <input
                    data-testid="input-pole-max-uses"
                    type="number"
                    value={poleMaxUses}
                    onChange={(e) => setPoleMaxUses(e.target.value)}
                    placeholder="e.g. 50"
                    min="0"
                    className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                    style={inputStyle}
                  />
                  <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">How many catches before this pole breaks. Leave blank for unlimited.</p>
                </div>
              )}
              <p className="font-fantasy text-[#7fd4f0] text-[8px] tracking-wider text-center">
                {fishingType === "fish" ? "Fish are added to pond locations by admins and caught by players." :
                 fishingType === "pole" ? "Poles are sold in shops and equipped by players to go fishing." :
                 "Bait is sold in shops and boosts rare fish catch chance when equipped."}
              </p>
            </>
          )}

          {!hasAnyPhoto && (
            <p className="font-fantasy text-[#a89878] text-[9px] tracking-wider text-center">
              Upload a photo above to enable saving
            </p>
          )}
          <button
            data-testid="button-submit-item"
            onClick={handleSubmit}
            disabled={submitting || !hasAnyPhoto}
            className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-98 disabled:opacity-50"
            style={{ background: accentBg, border: `1px solid ${accentBorder}`, color: accentColor, cursor: hasAnyPhoto ? "pointer" : "not-allowed" }}
          >
            {submitting ? "Saving..." : item ? `Update ${petOnly ? "Pet" : "Item"}` : `Add to Game`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageUpload({
  label,
  preview,
  onSelect,
  onRemove,
  inputId,
  allowGif = false,
}: {
  label: string;
  preview: string | null;
  onSelect: (data: string) => void;
  onRemove: () => void;
  inputId: string;
  allowGif?: boolean;
}) {
  const { toast } = useToast();
  const allowedTypes = allowGif ? ["image/png", "image/gif"] : ["image/png"];
  const acceptStr = allowGif ? "image/png,image/gif" : "image/png";
  const formatLabel = allowGif ? "PNG or GIF" : "PNG only";

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid format", description: formatLabel, variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 20MB", variant: "destructive" });
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    onSelect(dataUrl);
  };

  return (
    <div>
      <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <div
          className="w-16 h-16 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.3)" }}
          onClick={() => (document.getElementById(inputId) as HTMLInputElement)?.click()}
        >
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[#d4a017] text-lg">+</span>
          )}
        </div>
        <input id={inputId} type="file" accept={acceptStr} onChange={handleFile} className="hidden" />
        <div className="flex-1 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => (document.getElementById(inputId) as HTMLInputElement)?.click()}
            className="w-full py-1.5 rounded-md font-fantasy text-[9px] tracking-wider"
            style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", border: "1px solid rgba(212,160,23,0.4)", color: "#f0c040", cursor: "pointer" }}
          >
            {preview ? "Change" : "Upload"}
          </button>
          {preview && (
            <button
              type="button"
              onClick={onRemove}
              className="w-full py-1 rounded-md font-fantasy text-[8px] tracking-wider"
              style={{ background: "rgba(139,0,0,0.3)", border: "1px solid rgba(200,50,50,0.3)", color: "#ff9999", cursor: "pointer" }}
            >
              Remove
            </button>
          )}
          <span className="font-fantasy text-[#6a5840] text-[7px] tracking-wider">{formatLabel} - max 20MB</span>
        </div>
      </div>
    </div>
  );
}

export function ItemPickerModal({
  items,
  onSelect,
  onClose,
}: {
  items: ShopItemFull[];
  onSelect: (item: ShopItemFull) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "items" | "pets">("all");

  const filtered = items.filter(item => {
    const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "pets" && item.type === "pet") ||
      (typeFilter === "items" && item.type !== "pet");
    return matchesSearch && matchesType;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[85%] max-w-sm rounded-lg p-4 animate-slide-up"
        style={{
          background: "linear-gradient(135deg, rgba(20,10,3,0.98) 0%, rgba(45,25,8,0.98) 100%)",
          border: "1px solid rgba(192,132,252,0.5)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
        >
          X
        </button>

        <h4 className="font-fantasy text-[#c084fc] text-xs tracking-wider text-center mb-3">Select Item</h4>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-2">
          {(["all", "items", "pets"] as const).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className="flex-1 py-1 rounded font-fantasy text-[8px] tracking-wider transition-all"
              style={{
                background: typeFilter === f ? "rgba(192,132,252,0.25)" : "rgba(0,0,0,0.2)",
                border: typeFilter === f ? "1px solid rgba(192,132,252,0.5)" : "1px solid rgba(212,160,23,0.15)",
                color: typeFilter === f ? "#c084fc" : "#a89878",
                cursor: "pointer",
              }}
            >
              {f === "all" ? "All" : f === "pets" ? "Pets" : "Items"}
            </button>
          ))}
        </div>

        <input
          data-testid="input-item-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full px-3 py-2 rounded-md font-sans text-xs outline-none mb-3"
          style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
        />

        <div className="overflow-y-auto space-y-1.5 flex-1">
          {filtered.length === 0 ? (
            <p className="font-fantasy text-[#a89878] text-xs text-center py-4">No items found</p>
          ) : (
            filtered.map(item => {
              const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
              return (
                <button
                  key={item.id}
                  data-testid={`button-pick-item-${item.id}`}
                  onClick={() => onSelect(item)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-all"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: item.type === "pet" ? "1px solid rgba(255,179,71,0.2)" : "1px solid rgba(212,160,23,0.2)",
                    cursor: "pointer",
                  }}
                >
                  <div className="w-8 h-8 rounded flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "rgba(0,0,0,0.3)" }}>
                    {displayImg ? (
                      <img src={displayImg} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-lg">{item.type === "pet" ? "🥚" : "📦"}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-fantasy text-[#f0c040] text-[10px] truncate">{item.name}</p>
                    <p
                      className="font-fantasy text-[8px] capitalize"
                      style={{ color: item.type === "pet" ? "#ffb347" : "#6a5840" }}
                    >
                      {item.type}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
