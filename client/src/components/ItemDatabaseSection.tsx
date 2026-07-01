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
  skillHealPercent?: number | null;
  skillType?: string | null;
  skillAffects?: string | null;
  specialSkillType?: string | null;
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
  giftPoints?: number | null;
  facingDirection?: string | null;
  createdAt: string;
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

const NON_PET_TYPES = ["power_up", "accessory", "potion", "special", "decor", "edibles", "fishing", "gift", "ingredient", "recipe"];

function formatTypeName(type: string): string {
  if (type === "power_up") return "Power Up";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export const ITEM_CATEGORIES = [
  { key: "pets",        label: "Pets",        color: "#ffb347" },
  { key: "potions",     label: "Potions",     color: "#a78bfa" },
  { key: "specials",    label: "Specials",    color: "#34d399" },
  { key: "edibles",     label: "Edibles",     color: "#f87171" },
  { key: "gifts",       label: "Gifts",       color: "#ec4899" },
  { key: "poles",       label: "Poles",       color: "#60a5fa" },
  { key: "fish",        label: "Fish",        color: "#22d3ee" },
  { key: "bait",        label: "Bait",        color: "#86efac" },
  { key: "accessories", label: "Accessories", color: "#f9a8d4" },
  { key: "power_ups",   label: "Power Ups",   color: "#fde68a" },
  { key: "decor",       label: "Decor",       color: "#d9f99d" },
  { key: "ingredients", label: "Ingredients", color: "#fbbf24" },
  { key: "recipes",     label: "Recipes",     color: "#fde68a" },
] as const;

export type ItemCategoryKey = typeof ITEM_CATEGORIES[number]["key"];

export function getItemEffectText(item: ShopItemFull): string | null {
  if (item.type === "potion") {
    const parts: string[] = [];
    if (item.healthRestored) parts.push(`+${item.healthRestored} HP`);
    if (item.manaRestored) parts.push(`+${item.manaRestored} MP`);
    if (item.petsRevived) parts.push(`Revive ${item.petsRevived}`);
    return parts.join(" · ") || null;
  }
  if (item.type === "accessory") {
    const parts: string[] = [];
    if (item.atkBoost) parts.push(`+${item.atkBoost} ATK`);
    if (item.defBoost) parts.push(`+${item.defBoost} DEF`);
    if (item.healthBoost) parts.push(`+${item.healthBoost} HP`);
    return parts.join(" · ") || null;
  }
  if (item.type === "power_up" || item.type === "item") {
    if (item.statBoostType && item.statBoostAmount) {
      const label = item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : item.statBoostType.toUpperCase();
      return `+${item.statBoostAmount} ${label}`;
    }
    return null;
  }
  if (item.type === "edibles") {
    return item.statBoostAmount ? `+${item.statBoostAmount} Feed pts` : null;
  }
  if (item.type === "gift") {
    const gp = (item as any).giftPoints;
    return gp ? `+${gp} Loyalty pts` : "Gift";
  }
  if (item.type === "fishing") {
    if (item.fishingType === "fish") {
      const rarities = ["Common","Uncommon","Rare","Epic","Legendary"];
      return `${"★".repeat(item.starRarity ?? 1)} ${rarities[(item.starRarity ?? 1) - 1] ?? ""}`;
    }
    if (item.fishingType === "pole") return item.poleMaxUses ? `${item.poleMaxUses} uses` : "Unlimited uses";
    if (item.fishingType === "bait") return item.rarityBoostPercent ? `+${item.rarityBoostPercent}% on ${"★".repeat(item.baitRarityBoostStar ?? 3)}` : "Bait";
  }
  if (item.type === "special") {
    if (item.specialType === "hatch_time") return item.specialAmount ? `−${item.specialAmount}% hatch time` : "Reduces hatch time";
    return item.specialType ?? null;
  }
  if (item.type === "pet") {
    if (item.specialSkill) return `Skill: ${item.specialSkill}`;
    if (item.starRarity) return `${"★".repeat(item.starRarity)} Rarity`;
    return null;
  }
  return null;
}

export function getItemCategory(item: ShopItemFull): ItemCategoryKey {
  if (item.type === "pet") return "pets";
  if (item.type === "potion") return "potions";
  if (item.type === "special") return "specials";
  if (item.type === "edibles") return "edibles";
  if (item.type === "gift") return "gifts";
  if (item.type === "fishing") {
    if (item.fishingType === "pole") return "poles";
    if (item.fishingType === "bait") return "bait";
    return "fish";
  }
  if (item.type === "accessory") return "accessories";
  if (item.type === "power_up" || item.type === "item") return "power_ups";
  if (item.type === "decor") return "decor";
  if (item.type === "ingredient") return "ingredients";
  if (item.type === "recipe") return "recipes";
  return "power_ups";
}

export default function ItemDatabaseSection({
  mode,
  onOpenParts,
}: {
  mode?: "items-only" | "pets-only";
  onOpenParts?: (templateId: string) => void;
} = {}) {
  const lockedSection = mode === "pets-only" ? "pets" : mode === "items-only" ? "items" : null;
  const [subSection, setSubSection] = useState<"items" | "pets">(lockedSection ?? "items");
  const [editingItem, setEditingItem] = useState<ShopItemFull | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allItems = [], isLoading } = useQuery<ShopItemFull[]>({
    queryKey: ["/api/admin/shop-items-all"],
    staleTime: 0,
  });

  const handleOpenPartsForItem = async (item: ShopItemFull) => {
    if (!onOpenParts) return;
    if (item.petTemplateId) {
      onOpenParts(item.petTemplateId);
      return;
    }
    try {
      const createRes = await apiRequest("POST", "/api/admin/pet-templates", {
        name: item.name || "Pet Template",
      });
      const template = await createRes.json();
      await apiRequest("PATCH", `/api/admin/shop/${item.id}`, {
        petTemplateId: template.id,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      onOpenParts(template.id);
    } catch (err) {
      toast({ title: "Failed", description: "Could not open parts editor", variant: "destructive" });
    }
  };

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

  const sectionItems = allItems.filter(item => {
    if (subSection === "pets") return item.type === "pet";
    // items-only or default: exclude pets; also exclude fishing when in items-only mode
    if (item.type === "pet") return false;
    if (mode === "items-only" && item.type === "fishing") return false;
    return true;
  });

  const filtered = sectionItems.filter(item => {
    if (filterType === "all") return true;
    const cat = getItemCategory(item);
    return cat === filterType;
  });

  const isPetSection = subSection === "pets";

  return (
    <div className="space-y-3">
      {/* Sub-section toggle */}
      {!lockedSection && (
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
      )}

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
        <div
          className="flex gap-1.5 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
          data-testid="row-filter-tabs"
        >
          {[{ key: "all", label: "All", color: "#f0c040" }, ...ITEM_CATEGORIES.filter(c => c.key !== "pets")].map(c => {
            const active = filterType === c.key;
            return (
              <button
                key={c.key}
                data-testid={`tab-filter-${c.key}`}
                onClick={() => setFilterType(c.key)}
                className="flex-shrink-0 px-3 py-1 rounded-full font-fantasy text-[10px] tracking-wider transition-all"
                style={{
                  background: active
                    ? `linear-gradient(135deg, ${c.color}30 0%, ${c.color}18 100%)`
                    : "rgba(0,0,0,0.25)",
                  border: active
                    ? `1px solid ${c.color}80`
                    : "1px solid rgba(212,160,23,0.2)",
                  color: active ? c.color : "rgba(168,152,120,0.85)",
                  cursor: "pointer",
                  boxShadow: active ? `0 0 8px ${c.color}30` : "none",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </button>
            );
          })}
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
            const catOrder = ITEM_CATEGORIES.map(c => c.key);
            const sorted = [...filtered].sort((a, b) => {
              const aCat = getItemCategory(a);
              const bCat = getItemCategory(b);
              const ai = catOrder.indexOf(aCat);
              const bi = catOrder.indexOf(bCat);
              if (ai !== bi) return ai - bi;
              return a.name.localeCompare(b.name);
            });

            const showTypeHeaders = !isPetSection && filterType === "all";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const elements: any[] = [];
            let lastCat = "";

            sorted.forEach(item => {
              const cat = getItemCategory(item);
              const catMeta = ITEM_CATEGORIES.find(c => c.key === cat);
              if (showTypeHeaders && cat !== lastCat) {
                lastCat = cat;
                elements.push(
                  <div
                    key={`header-${cat}`}
                    className="pt-1 pb-0.5 px-1"
                  >
                    <p
                      className="font-fantasy text-[9px] tracking-widest uppercase"
                      style={{ color: catMeta?.color ?? "rgba(212,160,23,0.55)" }}
                    >
                      {catMeta?.label ?? cat}
                    </p>
                  </div>
                );
              }

              const primaryImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
              const fallbackImg = item.type === "pet" && item.eggImageUrl ? (item.imageUrl ?? undefined) : undefined;
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
                      {primaryImg ? (
                        <img
                          src={primaryImg}
                          alt=""
                          className="w-full h-full object-contain"
                          onError={fallbackImg ? (e) => { (e.target as HTMLImageElement).src = fallbackImg; } : undefined}
                        />
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
                          +{item.statBoostAmount} {item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : item.statBoostType === "lvl" ? "Feed pts" : "Lvl pts"}
                        </span>
                      )}
                      {item.type === "edibles" && item.statBoostAmount && (
                        <span className="font-fantasy text-[#86efac] text-[7px]">+{item.statBoostAmount} Feed pts when fed</span>
                      )}
                      {item.type === "gift" && (
                        <span className="font-fantasy text-[#ec4899] text-[7px]">
                          {item.giftPoints ? `+${item.giftPoints} Loyalty pts` : "Gift"}
                        </span>
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
                      {isPetSection && onOpenParts && (
                        <button
                          data-testid={`button-parts-db-item-${item.id}`}
                          onClick={() => handleOpenPartsForItem(item)}
                          title="Edit animation parts"
                          className="px-2 py-1 rounded font-fantasy text-[8px] tracking-wider"
                          style={{
                            background: "linear-gradient(135deg, rgba(94,234,212,0.22) 0%, rgba(45,212,191,0.16) 100%)",
                            border: "1px solid rgba(94,234,212,0.45)",
                            color: "#5eead4",
                            cursor: "pointer",
                          }}
                        >
                          ✦ Parts
                        </button>
                      )}
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
          onOpenParts={handleOpenPartsForItem}
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
  onOpenParts,
}: {
  item: ShopItemFull | null;
  petOnly: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenParts?: (item: ShopItemFull) => void;
}) {
  const defaultType = petOnly ? "pet" : (item?.type !== "pet" ? (item?.type || "power_up") : "power_up");
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price?.toString() || "");
  const [type, setType] = useState(defaultType);
  const [edibleLvlPoints, setEdibleLvlPoints] = useState(item?.statBoostAmount?.toString() || "5");
  const [giftPoints, setGiftPoints] = useState((item as any)?.giftPoints?.toString() || "100");
  const [fishingType, setFishingType] = useState(item?.fishingType || "fish");
  const [starRarity, setStarRarity] = useState(item?.starRarity?.toString() || "1");
  const [baitCatchBoost, setBaitCatchBoost] = useState(item?.baitCatchBoost?.toString() || "");
  const [rarityBoostPercent, setRarityBoostPercent] = useState(item?.rarityBoostPercent?.toString() || "0");
  const [baitRarityBoostStar, setBaitRarityBoostStar] = useState(item?.baitRarityBoostStar?.toString() || "3");
  const [poleMaxUses, setPoleMaxUses] = useState(item?.poleMaxUses?.toString() || "");
  const [rarity, setRarity] = useState(item?.rarity?.toString() || "1");
  const [hatchTime, setHatchTime] = useState(item?.hatchTime?.toString() || "1");
  const [specialSkill, setSpecialSkill] = useState(item?.specialSkill || "");
  const [specialSkillType, setSpecialSkillType] = useState((item as any)?.specialSkillType || "");
  const [skillDamagePercent, setSkillDamagePercent] = useState(item?.skillDamagePercent?.toString() || "");
  const [skillHealPercent, setSkillHealPercent] = useState((item as any)?.skillHealPercent?.toString() || "");
  const [skillType, setSkillType] = useState<string>((item as any)?.skillType || "");
  const [skillAffects, setSkillAffects] = useState<string>((item as any)?.skillAffects || "");
  const [facingDirection, setFacingDirection] = useState<string>((item as any)?.facingDirection || "");

  // Affects options are filtered by skill type so the admin can't pick a
  // nonsensical pairing (e.g. a damage skill that "affects self").
  const affectsOptionsByType: Record<string, { value: string; label: string }[]> = {
    damage: [
      { value: "enemy",       label: "Enemy (single target)" },
      { value: "enemy_party", label: "Enemy Party (all enemies)" },
    ],
    poison: [
      { value: "enemy",       label: "Enemy (single target)" },
      { value: "enemy_party", label: "Enemy Party (all enemies)" },
    ],
    stun: [
      { value: "enemy",       label: "Enemy (single target)" },
      { value: "enemy_party", label: "Enemy Party (all enemies)" },
    ],
    heal: [
      { value: "self",  label: "Self (caster only)" },
      { value: "party", label: "Party (all allies)" },
    ],
    revive: [
      { value: "self",  label: "Self (caster only)" },
      { value: "party", label: "Party (all allies)" },
    ],
  };
  const affectsOptions = affectsOptionsByType[skillType] || [];

  // When the admin changes Skill Type, snap Affects to a sensible default
  // and clear any percent that no longer applies to the new type.
  const handleSkillTypeChange = (next: string) => {
    setSkillType(next);
    const defaults: Record<string, string> = {
      damage: "enemy",
      poison: "enemy",
      stun:   "enemy",
      heal:   "self",
      revive: "self",
    };
    setSkillAffects(defaults[next] || "");
    if (next !== "heal") setSkillHealPercent("");
    if (next !== "damage" && next !== "poison") setSkillDamagePercent("");
  };
  const petTemplateId = item?.petTemplateId || "";
  const [statBoostType, setStatBoostType] = useState(item?.statBoostType || "health");
  const [statBoostAmount, setStatBoostAmount] = useState(item?.statBoostAmount?.toString() || "10");
  const [healthRestored, setHealthRestored] = useState(item?.healthRestored?.toString() || "");
  const [manaRestored, setManaRestored] = useState(item?.manaRestored?.toString() || "");
  const [petsRevived, setPetsRevived] = useState(item?.petsRevived?.toString() || "");
  const [petsHealed, setPetsHealed] = useState((item as any)?.petsHealed?.toString() || "");
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
        payload.specialSkillType = specialSkillType.trim() || null;
        payload.skillType = skillType || null;
        payload.skillAffects = skillAffects || null;
        // Damage/Heal percent inputs are interpreted by skillType so admins
        // only ever fill in the one that matches what they picked.
        payload.skillDamagePercent =
          (skillType === "damage" || skillType === "poison") && skillDamagePercent.trim()
            ? parseFloat(skillDamagePercent) : null;
        payload.skillHealPercent =
          skillType === "heal" && skillHealPercent.trim()
            ? parseFloat(skillHealPercent) : null;
        payload.petTemplateId = petTemplateId || null;
        payload.facingDirection = facingDirection || null;
        if (eggImageData) payload.eggImageData = eggImageData;
        // Pets don't have a separate shop image — use the egg image for both.
        if (eggImageData) payload.imageData = eggImageData;
        if (hatchedImageData) payload.hatchedImageData = hatchedImageData;
        payload.statBoostType = null;
        payload.statBoostAmount = null;
        payload.healthRestored = null;
        payload.manaRestored = null;
        payload.petsRevived = null;
        payload.petsHealed = null;
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

        if (effectiveType === "gift") {
          payload.giftPoints = Math.max(0, parseInt(giftPoints) || 0);
        } else {
          payload.giftPoints = null;
        }

        if (effectiveType === "potion") {
          payload.healthRestored = parseInt(healthRestored) || null;
          payload.manaRestored = parseInt(manaRestored) || null;
          payload.petsRevived = parseInt(petsRevived) || null;
          payload.petsHealed = parseInt(petsHealed) || null;
        } else {
          payload.healthRestored = null;
          payload.manaRestored = null;
          payload.petsRevived = null;
          payload.petsHealed = null;
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
          maxHeight: "calc(85*var(--vh))",
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

        <h3 className="font-fantasy text-center text-base tracking-widest mb-2" style={{ color: accentColor }}>
          {item ? (petOnly ? "Edit Pet" : "Edit Item") : (petOnly ? "Add Pet" : "Add Item")}
        </h3>

        {petOnly && onOpenParts && (
          <div className="flex justify-center mb-4">
            <button
              data-testid="button-open-pet-parts"
              type="button"
              disabled={!item}
              onClick={() => {
                if (item) onOpenParts(item);
              }}
              title={!item ? "Save the pet first to attach parts" : "Open the parts editor"}
              className="font-fantasy text-[11px] tracking-wider px-4 py-1.5 rounded-md disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, rgba(94,234,212,0.22) 0%, rgba(45,212,191,0.16) 100%)",
                border: "1px solid rgba(94,234,212,0.5)",
                color: "#5eead4",
                cursor: !item ? "not-allowed" : "pointer",
              }}
            >
              ✦ Parts
            </button>
          </div>
        )}

        <div className="space-y-3">
          {!petOnly && (
            <ImageUpload
              label="Shop Image (PNG)"
              preview={imagePreview}
              onSelect={(d) => { setImageData(d); setImagePreview(d); }}
              onRemove={() => { setImageData(null); setImagePreview(null); }}
              inputId="admin-shop-item-img"
            />
          )}

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
              {/* ── Skill section divider ───────────────────────────────────── */}
              <div className="col-span-full mt-2">
                <div className="border-t border-[#a89878]/30 mb-2" />
                <div className="font-fantasy text-[#d4c2a0] text-xs tracking-widest uppercase mb-2">Skill</div>
              </div>
              <div className="col-span-full">
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Skill Name</label>
                <input
                  data-testid="input-special-skill"
                  type="text"
                  value={specialSkill}
                  onChange={(e) => setSpecialSkill(e.target.value)}
                  placeholder="Display name shown to players..."
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              {/* Skill Type — what the skill DOES (drives the targeting/effect). */}
              <div className="col-span-full">
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Skill Type</label>
                <select
                  data-testid="select-skill-type"
                  value={skillType}
                  onChange={(e) => handleSkillTypeChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="">— None —</option>
                  <option value="damage">Damage — one big attack on the target</option>
                  <option value="heal">Heal — restore HP to the target</option>
                  <option value="revive">Revive — bring fainted allies back</option>
                  <option value="poison">Poison — damage over time (3/4/5 turns by rarity)</option>
                  <option value="stun">Stun — enemy can't attack for 5 turns</option>
                </select>
              </div>

              {/* Skill Style — purely the visual look. */}
              <div className="col-span-full">
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Skill Style</label>
                <select
                  data-testid="select-special-skill-type"
                  value={specialSkillType}
                  onChange={(e) => setSpecialSkillType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="">— None —</option>
                  <option value="Lazer">Lazer</option>
                  <option value="Bubble">Bubble</option>
                  <option value="Surrounding Light">Surrounding Light</option>
                  <option value="Large Orb">Large Orb</option>
                  <option value="Missile">Missile</option>
                </select>
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">
                  Visual only — what the skill looks like when cast.
                </p>
              </div>

              {/* Affects — who the Skill Type targets. */}
              <div className="col-span-full">
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Affects</label>
                <select
                  data-testid="select-skill-affects"
                  value={skillAffects}
                  onChange={(e) => setSkillAffects(e.target.value)}
                  disabled={!skillType}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm outline-none disabled:opacity-50"
                  style={inputStyle}
                >
                  {!skillType && <option value="">Pick a Skill Type first…</option>}
                  {skillType && <option value="">— Choose a target —</option>}
                  {affectsOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Conditional ATK% input — only shown for the types that need a number. */}
              {skillType === "damage" && (
                <div className="col-span-full">
                  <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Attack Power %</label>
                  <input
                    data-testid="input-skill-damage-percent"
                    type="number"
                    value={skillDamagePercent}
                    onChange={(e) => setSkillDamagePercent(e.target.value)}
                    placeholder="e.g. 250 (= 2.5× ATK added to the attack)"
                    min="0"
                    step="0.5"
                    className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                    style={inputStyle}
                  />
                  <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">
                    Percent of the pet's ATK added on top of the regular attack power.
                  </p>
                </div>
              )}
              {skillType === "heal" && (
                <div className="col-span-full">
                  <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Heal Power %</label>
                  <input
                    data-testid="input-skill-heal-percent"
                    type="number"
                    value={skillHealPercent}
                    onChange={(e) => setSkillHealPercent(e.target.value)}
                    placeholder="e.g. 50 (= 50% of ATK restored to allies)"
                    min="0"
                    step="0.5"
                    className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                    style={inputStyle}
                  />
                  <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">
                    Percent of the pet's ATK used to restore HP.
                  </p>
                </div>
              )}
              {skillType === "poison" && (
                <div className="col-span-full">
                  <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Poison Power % (per turn)</label>
                  <input
                    data-testid="input-skill-damage-percent"
                    type="number"
                    value={skillDamagePercent}
                    onChange={(e) => setSkillDamagePercent(e.target.value)}
                    placeholder="e.g. 14 (= 14% of ATK each tick)"
                    min="0"
                    step="0.5"
                    className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                    style={inputStyle}
                  />
                  <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">
                    Percent of ATK applied each turn. Lasts 3 turns (≤3★), 4 turns (4★), or 5 turns (5★).
                  </p>
                </div>
              )}
              {/* ── Facing direction ────────────────────────────────────── */}
              <div className="col-span-full mt-2">
                <div className="border-t border-[#a89878]/30 mb-2" />
                <div className="font-fantasy text-[#d4c2a0] text-xs tracking-widest uppercase mb-2">KC World Facing</div>
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mb-2">
                  Which direction the pet sprite naturally faces — used on Keeper's Central to flip the sprite correctly when walking.
                </p>
                <div className="flex gap-2">
                  {[
                    { value: "",      label: "Not set" },
                    { value: "left",  label: "◀ Faces Left" },
                    { value: "right", label: "Faces Right ▶" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      data-testid={`button-facing-${value || "unset"}`}
                      type="button"
                      onClick={() => setFacingDirection(value)}
                      className="flex-1 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider"
                      style={{
                        background: facingDirection === value
                          ? "linear-gradient(135deg, rgba(255,179,71,0.35) 0%, rgba(255,140,0,0.25) 100%)"
                          : "rgba(242,232,208,0.08)",
                        border: facingDirection === value
                          ? "1px solid rgba(255,179,71,0.7)"
                          : "1px solid rgba(138,120,88,0.3)",
                        color: facingDirection === value ? "#ffb347" : "#a89878",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">+Feed Points when fed</label>
                <input
                  data-testid="input-edible-feed-points"
                  type="number"
                  value={edibleLvlPoints}
                  onChange={(e) => setEdibleLvlPoints(e.target.value)}
                  placeholder="5"
                  min="1"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Feed points added to a pet when this edible is fed to them</p>
              </div>
              <p className="font-fantasy text-[#86efac] text-[8px] tracking-wider text-center">Edibles can be fed to pets from the Pet House page</p>
            </>
          )}

          {!petOnly && effectiveType === "gift" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">+Loyalty Points when gifted</label>
                <input
                  data-testid="input-gift-points"
                  type="number"
                  value={giftPoints}
                  onChange={(e) => setGiftPoints(e.target.value)}
                  placeholder="100"
                  min="1"
                  max="1000"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Loyalty points added to a pet's bar when this gift is given (cap 1000)</p>
              </div>
              <p className="font-fantasy text-[#ec4899] text-[8px] tracking-wider text-center">Gifts can only be given on the Pet Care page — they're consumed on use</p>
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
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Pets Healed</label>
                <input data-testid="input-pets-healed" type="number" value={petsHealed} onChange={(e) => setPetsHealed(e.target.value)} placeholder="1" min="1" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">How many alive pets receive the heal (default 1)</p>
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
  const [activeCategory, setActiveCategory] = useState<"all" | ItemCategoryKey>("all");

  const ALL_TABS = [{ key: "all" as const, label: "All", color: "#a89878" }, ...ITEM_CATEGORIES];

  const matchesSearch = (item: ShopItemFull) =>
    !search || item.name.toLowerCase().includes(search.toLowerCase());

  const matchesCategory = (item: ShopItemFull) =>
    activeCategory === "all" || getItemCategory(item) === activeCategory;

  const filtered = items.filter(item => matchesSearch(item) && matchesCategory(item));

  const catOrder = ITEM_CATEGORIES.map(c => c.key);
  const sorted = [...filtered].sort((a, b) => {
    const aCat = getItemCategory(a);
    const bCat = getItemCategory(b);
    const ai = catOrder.indexOf(aCat);
    const bi = catOrder.indexOf(bCat);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  const showHeaders = activeCategory === "all";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[90%] max-w-sm rounded-lg p-4 animate-slide-up"
        style={{
          background: "linear-gradient(135deg, rgba(20,10,3,0.98) 0%, rgba(45,25,8,0.98) 100%)",
          border: "1px solid rgba(192,132,252,0.5)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
          maxHeight: "calc(80*var(--vh))",
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

        {/* Category chips — 2 rows of scrollable chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          {ALL_TABS.map(tab => {
            const isActive = activeCategory === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveCategory(tab.key as typeof activeCategory)}
                className="px-2 py-0.5 rounded-full font-fantasy text-[8px] tracking-wider transition-all"
                style={{
                  background: isActive ? `${tab.color}22` : "rgba(0,0,0,0.25)",
                  border: isActive ? `1px solid ${tab.color}88` : "1px solid rgba(212,160,23,0.12)",
                  color: isActive ? tab.color : "#6a5840",
                  cursor: "pointer",
                  fontWeight: isActive ? "bold" : "normal",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <input
          data-testid="input-item-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full px-3 py-2 rounded-md font-sans text-xs outline-none mb-2"
          style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
        />

        <div className="overflow-y-auto flex-1 space-y-1">
          {sorted.length === 0 ? (
            <p className="font-fantasy text-[#a89878] text-xs text-center py-4">No items found</p>
          ) : (() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const elements: any[] = [];
            let lastCat = "";
            sorted.forEach(item => {
              const cat = getItemCategory(item);
              const catMeta = ITEM_CATEGORIES.find(c => c.key === cat);
              if (showHeaders && cat !== lastCat) {
                lastCat = cat;
                elements.push(
                  <p
                    key={`hdr-${cat}`}
                    className="font-fantasy text-[8px] tracking-widest uppercase pt-2 pb-0.5 px-1"
                    style={{ color: catMeta?.color ?? "#a89878" }}
                  >
                    {catMeta?.label ?? cat}
                  </p>
                );
              }
              const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
              const displayFallback = item.type === "pet" && item.eggImageUrl ? (item.imageUrl ?? undefined) : undefined;
              const catColor = catMeta?.color ?? "#f0c040";
              const effectText = getItemEffectText(item);
              elements.push(
                <button
                  key={item.id}
                  data-testid={`button-pick-item-${item.id}`}
                  onClick={() => onSelect(item)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-all active:scale-95"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: `1px solid ${catColor}22`,
                    cursor: "pointer",
                  }}
                >
                  <div className="w-8 h-8 rounded flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "rgba(0,0,0,0.3)" }}>
                    {displayImg
                      ? <img src={displayImg} alt="" className="w-full h-full object-contain" onError={displayFallback ? (e) => { (e.target as HTMLImageElement).src = displayFallback; } : undefined} />
                      : <span className="text-lg">{item.type === "pet" ? "🥚" : "📦"}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-fantasy text-[10px] truncate" style={{ color: catColor }}>{item.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-fantasy text-[8px]" style={{ color: `${catColor}70` }}>{catMeta?.label ?? item.type}</p>
                      {effectText && (
                        <p className="font-fantasy text-[8px]" style={{ color: `${catColor}cc` }}>· {effectText}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            });
            return elements;
          })()}
        </div>
      </div>
    </div>
  );
}
