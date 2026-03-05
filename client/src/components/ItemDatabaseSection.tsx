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
  healthRestored: number | null;
  manaRestored: number | null;
  petsRevived: number | null;
  atkBoost: number | null;
  defBoost: number | null;
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

const ITEM_TYPES = ["pet", "item", "accessory", "potion"];

export default function ItemDatabaseSection() {
  const [editingItem, setEditingItem] = useState<ShopItemFull | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterWorld, setFilterWorld] = useState<string>("all");
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

  const filtered = allItems.filter(item => {
    if (filterWorld !== "all" && item.worldId !== filterWorld) return false;
    if (filterType !== "all" && item.type !== filterType) return false;
    return true;
  });

  const worldName = (id: string) => WORLD_OPTIONS.find(w => w.id === id)?.name || id;

  return (
    <div className="space-y-3">
      <button
        data-testid="button-add-new-item"
        onClick={() => { setEditingItem(null); setShowForm(true); }}
        className="w-full py-2.5 rounded-lg font-fantasy text-sm tracking-wider flex items-center justify-center gap-2 transition-transform active:scale-98"
        style={{
          background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
          border: "1px solid rgba(127,255,212,0.4)",
          color: "#7fffd4",
          cursor: "pointer",
        }}
      >
        <span className="text-xl leading-none">+</span> Add New Item
      </button>

      <div className="flex gap-2">
        <select
          data-testid="select-filter-world"
          value={filterWorld}
          onChange={(e) => setFilterWorld(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-md font-fantasy text-[10px] outline-none"
          style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
        >
          <option value="all">All Worlds</option>
          {WORLD_OPTIONS.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <select
          data-testid="select-filter-type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-md font-fantasy text-[10px] outline-none"
          style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
        >
          <option value="all">All Types</option>
          {ITEM_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      <p className="font-fantasy text-[#6a5840] text-[10px] tracking-wider text-center">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""} in database
      </p>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Loading items...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="font-fantasy text-[#a89878] text-sm tracking-wider">No items found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
            return (
              <div
                key={item.id}
                data-testid={`card-db-item-${item.id}`}
                className="rounded-lg overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(50,30,10,0.85) 100%)",
                  border: "1px solid rgba(212,160,23,0.3)",
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
                        className="font-fantasy text-[8px] tracking-wider px-1.5 py-0.5 rounded-full capitalize"
                        style={{ background: "rgba(127,255,212,0.1)", color: "#7fbfb0", border: "1px solid rgba(127,255,212,0.2)" }}
                      >
                        {item.type}
                      </span>
                      <span className="font-fantasy text-[#6a5840] text-[8px]">{worldName(item.worldId)}</span>
                      <span className="font-fantasy text-[#f0c040] text-[8px]">{item.price} coins</span>
                    </div>
                    {item.type === "item" && item.statBoostType && (
                      <span className="font-fantasy text-[#a89878] text-[7px]">
                        +{item.statBoostAmount} {item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : "LVL"}
                      </span>
                    )}
                    {item.type === "potion" && (
                      <span className="font-fantasy text-[#a89878] text-[7px]">
                        {item.healthRestored ? `+${item.healthRestored} HP` : ""}{item.manaRestored ? ` +${item.manaRestored} MP` : ""}{item.petsRevived ? ` Revive ${item.petsRevived}` : ""}
                      </span>
                    )}
                    {item.type === "accessory" && (
                      <span className="font-fantasy text-[#a89878] text-[7px]">
                        {item.atkBoost ? `+${item.atkBoost} ATK` : ""}{item.defBoost ? ` +${item.defBoost} DEF` : ""}
                      </span>
                    )}
                    {item.type === "pet" && item.specialSkill && (
                      <span className="font-fantasy text-[#c084fc] text-[7px]">Skill: {item.specialSkill}</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      data-testid={`button-edit-db-item-${item.id}`}
                      onClick={() => { setEditingItem(item); setShowForm(true); }}
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
          })}
        </div>
      )}

      {showForm && (
        <AdminItemForm
          item={editingItem}
          onClose={() => { setShowForm(false); setEditingItem(null); }}
          onSuccess={() => {
            setShowForm(false);
            setEditingItem(null);
            queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
            WORLD_OPTIONS.forEach(w => {
              queryClient.invalidateQueries({ queryKey: ["/api/shop", w.id] });
            });
          }}
        />
      )}
    </div>
  );
}

function AdminItemForm({ item, onClose, onSuccess }: { item: ShopItemFull | null; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price?.toString() || "");
  const [type, setType] = useState(item?.type || "item");
  const [worldId, setWorldId] = useState(item?.worldId || WORLD_OPTIONS[0].id);
  const [rarity, setRarity] = useState(item?.rarity?.toString() || "1");
  const [hatchTime, setHatchTime] = useState(item?.hatchTime?.toString() || "1");
  const [specialSkill, setSpecialSkill] = useState(item?.specialSkill || "");
  const [petTemplateId, setPetTemplateId] = useState(item?.petTemplateId || "");

  const { data: petTemplates = [] } = useQuery<PetTemplateOption[]>({
    queryKey: ["/api/admin/pet-templates"],
    enabled: type === "pet",
  });
  const [statBoostType, setStatBoostType] = useState(item?.statBoostType || "health");
  const [statBoostAmount, setStatBoostAmount] = useState(item?.statBoostAmount?.toString() || "10");
  const [healthRestored, setHealthRestored] = useState(item?.healthRestored?.toString() || "");
  const [manaRestored, setManaRestored] = useState(item?.manaRestored?.toString() || "");
  const [petsRevived, setPetsRevived] = useState(item?.petsRevived?.toString() || "");
  const [atkBoost, setAtkBoost] = useState(item?.atkBoost?.toString() || "");
  const [defBoost, setDefBoost] = useState(item?.defBoost?.toString() || "");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(item?.imageUrl || null);
  const [eggImageData, setEggImageData] = useState<string | null>(null);
  const [eggImagePreview, setEggImagePreview] = useState<string | null>(item?.eggImageUrl || null);
  const [hatchedImageData, setHatchedImageData] = useState<string | null>(null);
  const [hatchedImagePreview, setHatchedImagePreview] = useState<string | null>(item?.hatchedImageUrl || null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!name.trim() || !price.trim()) {
      toast({ title: "Missing fields", description: "Name and price are required", variant: "destructive" });
      return;
    }
    const priceNum = parseInt(price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast({ title: "Invalid price", description: "Price must be a positive number", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = { name: name.trim(), price: priceNum, type, worldId };
      if (imageData) payload.imageData = imageData;

      if (type === "pet") {
        payload.rarity = parseInt(rarity);
        payload.hatchTime = parseInt(hatchTime);
        payload.specialSkill = specialSkill.trim() || null;
        payload.petTemplateId = petTemplateId || null;
        if (eggImageData) payload.eggImageData = eggImageData;
        if (hatchedImageData) payload.hatchedImageData = hatchedImageData;
      } else {
        payload.rarity = null;
        payload.hatchTime = null;
        payload.eggImageUrl = null;
        payload.hatchedImageUrl = null;
        payload.specialSkill = null;
        payload.petTemplateId = null;
      }

      if (type === "item") {
        payload.statBoostType = statBoostType;
        payload.statBoostAmount = parseInt(statBoostAmount) || 10;
      } else {
        payload.statBoostType = null;
        payload.statBoostAmount = null;
      }

      if (type === "potion") {
        payload.healthRestored = parseInt(healthRestored) || null;
        payload.manaRestored = parseInt(manaRestored) || null;
        payload.petsRevived = parseInt(petsRevived) || null;
      } else {
        payload.healthRestored = null;
        payload.manaRestored = null;
        payload.petsRevived = null;
      }

      if (type === "accessory") {
        payload.atkBoost = parseInt(atkBoost) || null;
        payload.defBoost = parseInt(defBoost) || null;
      } else {
        payload.atkBoost = null;
        payload.defBoost = null;
      }

      if (item) {
        await apiRequest("PATCH", `/api/admin/shop/${item.id}`, payload);
        toast({ title: "Updated", description: "Item updated successfully" });
      } else {
        await apiRequest("POST", "/api/admin/shop", payload);
        toast({ title: "Created", description: "Item added to game" });
      }
      onSuccess();
    } catch {
      toast({ title: "Failed", description: "Could not save item", variant: "destructive" });
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
          background: "linear-gradient(135deg, rgba(30,15,5,0.97) 0%, rgba(60,35,10,0.97) 100%)",
          border: "1px solid rgba(212,160,23,0.5)",
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

        <h3 className="font-fantasy text-[#f0c040] text-center text-base tracking-widest mb-4">
          {item ? "Edit Item" : "Add Item"}
        </h3>

        <div className="space-y-3">
          <ImageUpload
            label="Shop Image (PNG)"
            preview={imagePreview}
            onSelect={(d) => { setImageData(d); setImagePreview(d); }}
            onRemove={() => { setImageData(null); setImagePreview(null); }}
            inputId="admin-shop-item-img"
          />

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">{type === "pet" ? "Species" : "Name"}</label>
            <input data-testid="input-item-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "pet" ? "Species name" : "Item name"} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Price</label>
            <input data-testid="input-item-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Type</label>
            <select data-testid="select-item-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle}>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">World</label>
            <select data-testid="select-item-world" value={worldId} onChange={(e) => setWorldId(e.target.value)} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle}>
              {WORLD_OPTIONS.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {type === "pet" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Rarity</label>
                <select data-testid="select-rarity" value={rarity} onChange={(e) => setRarity(e.target.value)} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle}>
                  {[1,2,3,4,5].map((r) => (
                    <option key={r} value={r}>{"★".repeat(r)} ({r} Star{r > 1 ? "s" : ""})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Hatch Time (hours)</label>
                <input data-testid="input-hatch-time" type="number" value={hatchTime} onChange={(e) => setHatchTime(e.target.value)} placeholder="1" min="1" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Special Skill</label>
                <input data-testid="input-special-skill" type="text" value={specialSkill} onChange={(e) => setSpecialSkill(e.target.value)} placeholder="e.g. Fire Breath, Heal Aura..." className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Unique ability for this pet</p>
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

          {type === "item" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Stat Boost Type</label>
                <select data-testid="select-stat-boost" value={statBoostType} onChange={(e) => setStatBoostType(e.target.value)} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle}>
                  <option value="health">Health (+HP)</option>
                  <option value="atk">Attack (+ATK)</option>
                  <option value="def">Defense (+DEF)</option>
                  <option value="lvl">Level (+LVL)</option>
                </select>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">
                  {statBoostType === "health" ? "HP Added" : statBoostType === "atk" ? "ATK Added" : statBoostType === "def" ? "DEF Added" : "Levels Added"}
                </label>
                <input data-testid="input-stat-boost-amount" type="number" value={statBoostAmount} onChange={(e) => setStatBoostAmount(e.target.value)} placeholder="10" min="1" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Consumable - disappears after use on a pet</p>
              </div>
            </>
          )}

          {type === "potion" && (
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
              <p className="font-fantasy text-[#ff9999] text-[8px] tracking-wider text-center">Potions are consumables - battle use only, not for power-ups</p>
            </>
          )}

          {type === "accessory" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">ATK Boost (when equipped)</label>
                <input data-testid="input-atk-boost" type="number" value={atkBoost} onChange={(e) => setAtkBoost(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">DEF Boost (when equipped)</label>
                <input data-testid="input-def-boost" type="number" value={defBoost} onChange={(e) => setDefBoost(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
              </div>
              <p className="font-fantasy text-[#7fbfb0] text-[8px] tracking-wider text-center">Accessories are equippable - stats added when worn, removed when unequipped. Not consumed.</p>
            </>
          )}

          <button
            data-testid="button-submit-item"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-98 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)", border: "1px solid rgba(127,255,212,0.4)", color: "#7fffd4", cursor: "pointer" }}
          >
            {submitting ? "Saving..." : item ? "Update Item" : "Add to Game"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageUpload({ label, preview, onSelect, onRemove, inputId, allowGif = false }: { label: string; preview: string | null; onSelect: (data: string) => void; onRemove: () => void; inputId: string; allowGif?: boolean }) {
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

export function ItemPickerModal({ items, onSelect, onClose }: { items: ShopItemFull[]; onSelect: (item: ShopItemFull) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[85%] max-w-sm rounded-lg p-4 animate-slide-up"
        style={{
          background: "linear-gradient(135deg, rgba(20,10,3,0.98) 0%, rgba(45,25,8,0.98) 100%)",
          border: "1px solid rgba(192,132,252,0.5)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
          maxHeight: "70vh",
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
        <input
          data-testid="input-item-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full px-3 py-2 rounded-md font-sans text-xs outline-none mb-3"
          style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
        />
        <div className="overflow-y-auto space-y-1.5" style={{ maxHeight: "45vh" }}>
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
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.2)", cursor: "pointer" }}
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
                    <p className="font-fantasy text-[#6a5840] text-[8px] capitalize">{item.type}</p>
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
