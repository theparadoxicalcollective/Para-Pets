import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, X, ChevronDown, ChevronUp, Swords, Image, Coins, Package } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";
import coinIconImg from "@assets/icon_coin.png";

interface ShopItemOption {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
}

interface DropData {
  id: string;
  dropRate: number;
  shopItem: { id: string; name: string; type: string; imageUrl: string | null } | null;
}

interface EnemyData {
  id: string;
  locationId: string;
  name: string;
  imageUrl: string | null;
  isBoss: boolean;
  coinReward: number;
  sortOrder: number;
  drops: DropData[];
}

interface ExploreAdminPanelProps {
  locationId: string;
  accent: string;
  onClose: () => void;
  onBgUpload: (imageData: string) => void;
  bgUploading: boolean;
}

export default function ExploreAdminPanel({ locationId, accent, onClose, onBgUpload, bgUploading }: ExploreAdminPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedEnemy, setExpandedEnemy] = useState<string | null>(null);
  const [showAddEnemy, setShowAddEnemy] = useState(false);
  const [newEnemyName, setNewEnemyName] = useState("");
  const [newEnemyImage, setNewEnemyImage] = useState<string | null>(null);
  const [newEnemyCoinReward, setNewEnemyCoinReward] = useState("");
  const [newEnemyIsBoss, setNewEnemyIsBoss] = useState(false);
  const [showDropPicker, setShowDropPicker] = useState<string | null>(null);
  const [dropRate, setDropRate] = useState("10");
  const [selectedDropItem, setSelectedDropItem] = useState<string>("");
  const [dropSearch, setDropSearch] = useState("");
  const [editingEnemy, setEditingEnemy] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCoinReward, setEditCoinReward] = useState("");
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editIsBoss, setEditIsBoss] = useState(false);

  const { data: enemies = [], isLoading } = useQuery<EnemyData[]>({
    queryKey: ["/api/location", locationId, "enemies"],
    queryFn: async () => {
      const res = await fetch(`/api/location/${locationId}/enemies`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: allShopItems = [] } = useQuery<ShopItemOption[]>({
    queryKey: ["/api/admin/shop-items-all"],
  });

  const addEnemyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/location/${locationId}/enemy`, {
        name: newEnemyName.trim(),
        imageData: newEnemyImage,
        coinReward: parseInt(newEnemyCoinReward) || 0,
        isBoss: newEnemyIsBoss,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", locationId, "enemies"] });
      setShowAddEnemy(false);
      setNewEnemyName("");
      setNewEnemyImage(null);
      setNewEnemyCoinReward("");
      setNewEnemyIsBoss(false);
      toast({ title: "Enemy Added" });
    },
    onError: () => toast({ title: "Failed to add enemy", variant: "destructive" }),
  });

  const updateEnemyMutation = useMutation({
    mutationFn: async ({ enemyId, data }: { enemyId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/enemy/${enemyId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", locationId, "enemies"] });
      setEditingEnemy(null);
      toast({ title: "Enemy Updated" });
    },
    onError: () => toast({ title: "Failed to update enemy", variant: "destructive" }),
  });

  const deleteEnemyMutation = useMutation({
    mutationFn: async (enemyId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/enemy/${enemyId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", locationId, "enemies"] });
      toast({ title: "Enemy Removed" });
    },
    onError: () => toast({ title: "Failed to remove enemy", variant: "destructive" }),
  });

  const addDropMutation = useMutation({
    mutationFn: async ({ enemyId, shopItemId, dropRate }: { enemyId: string; shopItemId: string; dropRate: number }) => {
      const res = await apiRequest("POST", `/api/admin/enemy/${enemyId}/drop`, { shopItemId, dropRate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", locationId, "enemies"] });
      setShowDropPicker(null);
      setSelectedDropItem("");
      setDropRate("10");
      setDropSearch("");
      toast({ title: "Drop Added" });
    },
    onError: () => toast({ title: "Failed to add drop", variant: "destructive" }),
  });

  const deleteDropMutation = useMutation({
    mutationFn: async (dropId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/drop/${dropId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", locationId, "enemies"] });
      toast({ title: "Drop Removed" });
    },
    onError: () => toast({ title: "Failed to remove drop", variant: "destructive" }),
  });

  const inputStyle = { background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" };

  const filteredItems = dropSearch
    ? allShopItems.filter(i => i.name.toLowerCase().includes(dropSearch.toLowerCase()))
    : allShopItems;

  const startEdit = (enemy: EnemyData) => {
    setEditingEnemy(enemy.id);
    setEditName(enemy.name);
    setEditCoinReward(String(enemy.coinReward));
    setEditIsBoss(enemy.isBoss);
    setEditImage(null);
  };

  const saveEdit = (enemyId: string) => {
    const data: any = { name: editName.trim(), coinReward: parseInt(editCoinReward) || 0, isBoss: editIsBoss };
    if (editImage) data.imageData = editImage;
    updateEnemyMutation.mutate({ enemyId, data });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-[92%] max-w-md rounded-lg overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 100%)",
          border: `1px solid ${accent}55`,
          boxShadow: `0 0 40px ${accent}25`,
          maxHeight: "85vh",
        }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent, textShadow: `0 0 10px ${accent}40` }}>
            Explore Zone Setup
          </h3>
          <button
            data-testid="button-close-explore-admin"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4 space-y-4" style={{ maxHeight: "calc(85vh - 60px)" }}>
          <div
            className="rounded-lg p-3"
            style={{ background: `${accent}10`, border: `1px solid ${accent}25` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Image className="w-4 h-4" style={{ color: accent }} />
              <h4 className="font-fantasy text-xs tracking-wider" style={{ color: accent }}>Background</h4>
            </div>
            <label
              data-testid="button-upload-bg"
              className="block w-full py-2 rounded-md font-fantasy text-[10px] tracking-wider text-center transition-transform active:scale-95"
              style={{
                background: `${accent}20`,
                border: `1px dashed ${accent}50`,
                color: `${accent}cc`,
                cursor: bgUploading ? "wait" : "pointer",
              }}
            >
              {bgUploading ? "Uploading..." : "Upload Background Image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="hidden"
                disabled={bgUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const dataUrl = await readFileAsDataUrl(file);
                    onBgUpload(dataUrl);
                  }
                }}
              />
            </label>
          </div>

          <div
            className="rounded-lg p-3"
            style={{ background: `${accent}10`, border: `1px solid ${accent}25` }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Swords className="w-4 h-4" style={{ color: accent }} />
                <h4 className="font-fantasy text-xs tracking-wider" style={{ color: accent }}>Enemies ({enemies.length})</h4>
              </div>
              <button
                data-testid="button-add-enemy"
                onClick={() => setShowAddEnemy(true)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${accent}30`, border: `1px solid ${accent}50`, cursor: "pointer", color: accent }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {isLoading ? (
              <p className="font-fantasy text-[10px] tracking-wider animate-pulse text-center py-2" style={{ color: `${accent}88` }}>Loading...</p>
            ) : enemies.length === 0 ? (
              <p className="font-fantasy text-[10px] tracking-wider text-center py-2" style={{ color: `${accent}66` }}>No enemies added yet</p>
            ) : (
              <div className="space-y-2">
                {enemies.map((enemy) => (
                  <div
                    key={enemy.id}
                    data-testid={`card-enemy-${enemy.id}`}
                    className="rounded-md overflow-hidden"
                    style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${accent}20` }}
                  >
                    <div
                      className="flex items-center gap-2 p-2 cursor-pointer"
                      onClick={() => setExpandedEnemy(expandedEnemy === enemy.id ? null : enemy.id)}
                    >
                      {enemy.imageUrl ? (
                        <img src={enemy.imageUrl} alt="" className="w-10 h-10 rounded-md object-contain" style={{ border: `1px solid ${accent}30` }} />
                      ) : (
                        <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
                          <Swords className="w-5 h-5" style={{ color: `${accent}60` }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-fantasy text-[11px] tracking-wider truncate" style={{ color: `${accent}dd` }}>
                          {enemy.name}
                          {enemy.isBoss && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[7px] font-bold tracking-widest" style={{ background: "rgba(220,38,38,0.3)", border: "1px solid rgba(220,38,38,0.5)", color: "#ff6666" }}>BOSS</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <img src={coinIconImg} alt="" className="w-3 h-3" />
                            <span className="font-fantasy text-[9px]" style={{ color: "#f0c040" }}>{enemy.coinReward}</span>
                          </div>
                          <span className="font-fantasy text-[9px]" style={{ color: `${accent}66` }}>{enemy.drops.length} drop{enemy.drops.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          data-testid={`button-delete-enemy-${enemy.id}`}
                          onClick={(e) => { e.stopPropagation(); deleteEnemyMutation.mutate(enemy.id); }}
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", cursor: "pointer" }}
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                        {expandedEnemy === enemy.id ? (
                          <ChevronUp className="w-4 h-4" style={{ color: `${accent}88` }} />
                        ) : (
                          <ChevronDown className="w-4 h-4" style={{ color: `${accent}88` }} />
                        )}
                      </div>
                    </div>

                    {expandedEnemy === enemy.id && (
                      <div className="border-t px-2 pb-2 pt-2 space-y-2" style={{ borderColor: `${accent}20` }}>
                        {editingEnemy === enemy.id ? (
                          <div className="space-y-2">
                            <input
                              data-testid="input-edit-enemy-name"
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full px-2 py-1.5 rounded-md font-sans text-xs outline-none"
                              style={inputStyle}
                              placeholder="Enemy name"
                            />
                            <div className="flex items-center gap-2">
                              <img src={coinIconImg} alt="" className="w-4 h-4" />
                              <input
                                data-testid="input-edit-enemy-coins"
                                type="number"
                                value={editCoinReward}
                                onChange={(e) => setEditCoinReward(e.target.value)}
                                className="flex-1 px-2 py-1.5 rounded-md font-sans text-xs outline-none"
                                style={inputStyle}
                                placeholder="Coin reward"
                                min="0"
                              />
                            </div>
                            <div
                              data-testid="toggle-edit-boss"
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                              style={{ background: editIsBoss ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.03)", border: editIsBoss ? "1px solid rgba(220,38,38,0.4)" : `1px solid ${accent}20` }}
                              onClick={() => setEditIsBoss(!editIsBoss)}
                            >
                              <div className="w-4 h-4 rounded-sm flex items-center justify-center" style={{ background: editIsBoss ? "rgba(220,38,38,0.6)" : "transparent", border: editIsBoss ? "1px solid #ff6666" : `1px solid ${accent}40` }}>
                                {editIsBoss && <span className="text-white text-[8px] font-bold">&#10003;</span>}
                              </div>
                              <span className="font-fantasy text-[9px] tracking-wider" style={{ color: editIsBoss ? "#ff6666" : `${accent}88` }}>Boss Enemy (up to 5 levels above pet)</span>
                            </div>
                            <label
                              className="block w-full py-1.5 rounded-md font-fantasy text-[9px] tracking-wider text-center"
                              style={{ background: `${accent}15`, border: `1px dashed ${accent}40`, color: `${accent}aa`, cursor: "pointer" }}
                            >
                              {editImage ? "Image selected ✓" : "Change Image (optional)"}
                              <input
                                type="file"
                                accept="image/png,image/gif,image/jpeg"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const dataUrl = await readFileAsDataUrl(file);
                                    setEditImage(dataUrl);
                                  }
                                }}
                              />
                            </label>
                            <div className="flex gap-2">
                              <button
                                data-testid="button-cancel-edit-enemy"
                                onClick={() => setEditingEnemy(null)}
                                className="flex-1 py-1.5 rounded-md font-fantasy text-[9px] tracking-wider"
                                style={{ background: "rgba(100,100,100,0.2)", border: "1px solid rgba(100,100,100,0.3)", color: "#aaa", cursor: "pointer" }}
                              >
                                Cancel
                              </button>
                              <button
                                data-testid="button-save-edit-enemy"
                                onClick={() => saveEdit(enemy.id)}
                                disabled={updateEnemyMutation.isPending}
                                className="flex-1 py-1.5 rounded-md font-fantasy text-[9px] tracking-wider"
                                style={{ background: `${accent}30`, border: `1px solid ${accent}50`, color: accent, cursor: "pointer" }}
                              >
                                {updateEnemyMutation.isPending ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            data-testid={`button-edit-enemy-${enemy.id}`}
                            onClick={() => startEdit(enemy)}
                            className="w-full py-1 rounded-md font-fantasy text-[9px] tracking-wider"
                            style={{ background: `${accent}15`, border: `1px solid ${accent}30`, color: `${accent}aa`, cursor: "pointer" }}
                          >
                            Edit Details
                          </button>
                        )}

                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-fantasy text-[9px] tracking-wider" style={{ color: `${accent}88` }}>Item Drops</span>
                            <button
                              data-testid={`button-add-drop-${enemy.id}`}
                              onClick={() => setShowDropPicker(enemy.id)}
                              className="px-2 py-0.5 rounded-md font-fantasy text-[8px] tracking-wider"
                              style={{ background: `${accent}20`, border: `1px solid ${accent}40`, color: accent, cursor: "pointer" }}
                            >
                              + Add Drop
                            </button>
                          </div>

                          {enemy.drops.length === 0 ? (
                            <p className="font-fantasy text-[9px] tracking-wider text-center py-1" style={{ color: `${accent}44` }}>No drops configured</p>
                          ) : (
                            <div className="space-y-1">
                              {enemy.drops.map((drop) => (
                                <div
                                  key={drop.id}
                                  data-testid={`card-drop-${drop.id}`}
                                  className="flex items-center gap-2 px-2 py-1 rounded-md"
                                  style={{ background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.15)" }}
                                >
                                  {drop.shopItem?.imageUrl ? (
                                    <img src={drop.shopItem.imageUrl} alt="" className="w-6 h-6 object-contain rounded-sm" />
                                  ) : (
                                    <Package className="w-4 h-4" style={{ color: `${accent}66` }} />
                                  )}
                                  <span className="flex-1 font-fantasy text-[9px] tracking-wider truncate" style={{ color: "#e0d0f0" }}>
                                    {drop.shopItem?.name || "Unknown"}
                                  </span>
                                  <span className="font-fantasy text-[9px] font-bold" style={{ color: "#f0c040" }}>
                                    {drop.dropRate}%
                                  </span>
                                  <button
                                    data-testid={`button-delete-drop-${drop.id}`}
                                    onClick={() => deleteDropMutation.mutate(drop.id)}
                                    className="w-5 h-5 rounded-full flex items-center justify-center ml-1"
                                    style={{ background: "rgba(220,38,38,0.2)", cursor: "pointer" }}
                                  >
                                    <X className="w-3 h-3 text-red-400" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddEnemy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowAddEnemy(false)} />
          <div
            className="relative z-10 w-[85%] max-w-sm rounded-lg p-4"
            style={{
              background: "linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 100%)",
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-fantasy text-xs tracking-widest" style={{ color: accent }}>Add Enemy</h4>
              <button
                data-testid="button-close-add-enemy"
                onClick={() => setShowAddEnemy(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="font-fantasy text-[9px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Name *</label>
                <input
                  data-testid="input-enemy-name"
                  type="text"
                  value={newEnemyName}
                  onChange={(e) => setNewEnemyName(e.target.value)}
                  placeholder="e.g. Shadow Wolf"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="font-fantasy text-[9px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Image (PNG/GIF)</label>
                <input
                  data-testid="input-enemy-image"
                  type="file"
                  accept="image/png,image/gif,image/jpeg"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setNewEnemyImage(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
                {newEnemyImage && (
                  <div className="mt-2 flex justify-center">
                    <img src={newEnemyImage} alt="Preview" className="w-16 h-16 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                  </div>
                )}
              </div>
              <div>
                <label className="font-fantasy text-[9px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>
                  <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> Coin Reward</span>
                </label>
                <div className="flex items-center gap-2">
                  <img src={coinIconImg} alt="" className="w-4 h-4" />
                  <input
                    data-testid="input-enemy-coin-reward"
                    type="number"
                    value={newEnemyCoinReward}
                    onChange={(e) => setNewEnemyCoinReward(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="flex-1 px-3 py-2 rounded-md font-sans text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div
                data-testid="toggle-add-boss"
                className="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer"
                style={{ background: newEnemyIsBoss ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.03)", border: newEnemyIsBoss ? "1px solid rgba(220,38,38,0.4)" : `1px solid ${accent}20` }}
                onClick={() => setNewEnemyIsBoss(!newEnemyIsBoss)}
              >
                <div className="w-5 h-5 rounded-sm flex items-center justify-center" style={{ background: newEnemyIsBoss ? "rgba(220,38,38,0.6)" : "transparent", border: newEnemyIsBoss ? "1px solid #ff6666" : `1px solid ${accent}40` }}>
                  {newEnemyIsBoss && <span className="text-white text-[10px] font-bold">&#10003;</span>}
                </div>
                <div>
                  <span className="font-fantasy text-[10px] tracking-wider block" style={{ color: newEnemyIsBoss ? "#ff6666" : `${accent}bb` }}>Boss Enemy</span>
                  <span className="font-fantasy text-[8px] tracking-wider" style={{ color: `${accent}66` }}>Can be up to 5 levels above pet (regular: 2)</span>
                </div>
              </div>
              <button
                data-testid="button-submit-add-enemy"
                onClick={() => {
                  if (!newEnemyName.trim()) {
                    toast({ title: "Name required", variant: "destructive" });
                    return;
                  }
                  addEnemyMutation.mutate();
                }}
                disabled={addEnemyMutation.isPending}
                className="w-full py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${accent}50 0%, ${accent}25 100%)`,
                  border: `1px solid ${accent}70`,
                  color: accent,
                  cursor: "pointer",
                }}
              >
                {addEnemyMutation.isPending ? "Adding..." : "Add Enemy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDropPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70" onClick={() => { setShowDropPicker(null); setSelectedDropItem(""); setDropSearch(""); }} />
          <div
            className="relative z-10 w-[85%] max-w-sm rounded-lg p-4"
            style={{
              background: "linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 100%)",
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
              maxHeight: "70vh",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-fantasy text-xs tracking-widest" style={{ color: accent }}>Add Item Drop</h4>
              <button
                data-testid="button-close-drop-picker"
                onClick={() => { setShowDropPicker(null); setSelectedDropItem(""); setDropSearch(""); }}
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="font-fantasy text-[9px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Drop Rate (%)</label>
                <input
                  data-testid="input-drop-rate"
                  type="number"
                  value={dropRate}
                  onChange={(e) => setDropRate(e.target.value)}
                  min="1"
                  max="100"
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="font-fantasy text-[9px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Search Items</label>
                <input
                  data-testid="input-drop-search"
                  type="text"
                  value={dropSearch}
                  onChange={(e) => setDropSearch(e.target.value)}
                  placeholder="Search items..."
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div className="overflow-y-auto space-y-1" style={{ maxHeight: "30vh" }}>
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    data-testid={`drop-item-option-${item.id}`}
                    onClick={() => setSelectedDropItem(item.id)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
                    style={{
                      background: selectedDropItem === item.id ? `${accent}30` : "rgba(255,255,255,0.03)",
                      border: selectedDropItem === item.id ? `1px solid ${accent}60` : "1px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-7 h-7 object-contain rounded-sm" />
                    ) : (
                      <Package className="w-5 h-5" style={{ color: `${accent}66` }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-fantasy text-[10px] tracking-wider truncate" style={{ color: "#e0d0f0" }}>{item.name}</p>
                      <p className="font-fantasy text-[8px]" style={{ color: `${accent}66` }}>{item.type}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                data-testid="button-submit-add-drop"
                onClick={() => {
                  if (!selectedDropItem || !showDropPicker) return;
                  addDropMutation.mutate({
                    enemyId: showDropPicker,
                    shopItemId: selectedDropItem,
                    dropRate: Math.max(1, Math.min(100, parseInt(dropRate) || 10)),
                  });
                }}
                disabled={!selectedDropItem || addDropMutation.isPending}
                className="w-full py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${accent}50 0%, ${accent}25 100%)`,
                  border: `1px solid ${accent}70`,
                  color: accent,
                  cursor: "pointer",
                }}
              >
                {addDropMutation.isPending ? "Adding..." : "Add Drop"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
