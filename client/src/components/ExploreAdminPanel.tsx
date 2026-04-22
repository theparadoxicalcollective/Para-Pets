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
  archetype: string;
  bossSpecialAttack: string | null;
  coinReward: number;
  sortOrder: number;
  drops: DropData[];
}

interface EnemyTemplate {
  id: string;
  name: string;
  imageUrl: string | null;
  isBoss: boolean;
  archetype: string;
}

const BOSS_SPECIAL_ATTACKS = [
  { value: "bolt", label: "⚡ Bolt Volley", desc: "Fires energy bolts that hit ALL pets" },
  { value: "slash", label: "⚔ Fury Slash",  desc: "Sweeping slash that strikes ALL pets" },
] as const;

interface ExploreAdminPanelProps {
  locationId: string;
  locationType?: string;
  accent: string;
  onClose: () => void;
  onBgUpload: (imageData: string) => void;
  bgUploading: boolean;
  inline?: boolean;
}

export default function ExploreAdminPanel({ locationId, locationType, accent, onClose, onBgUpload, bgUploading, inline }: ExploreAdminPanelProps) {
  const isBattle = locationType === "battle";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedEnemy, setExpandedEnemy] = useState<string | null>(null);
  const [showAddEnemy, setShowAddEnemy] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [newEnemyCoinReward, setNewEnemyCoinReward] = useState("");
  const [newEnemyBossSpecialAttack, setNewEnemyBossSpecialAttack] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [showDropPicker, setShowDropPicker] = useState<string | null>(null);
  const [dropRate, setDropRate] = useState("10");
  const [selectedDropItem, setSelectedDropItem] = useState<string>("");
  const [dropSearch, setDropSearch] = useState("");

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

  const { data: enemyTemplates = [] } = useQuery<EnemyTemplate[]>({
    queryKey: ["/api/admin/enemies"],
    enabled: showAddEnemy,
  });

  const selectedTemplate = enemyTemplates.find(t => t.id === selectedTemplateId);

  const filteredTemplates = templateSearch
    ? enemyTemplates.filter(t => t.name.toLowerCase().includes(templateSearch.toLowerCase()))
    : enemyTemplates;

  const addEnemyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/location/${locationId}/enemy`, {
        enemyTemplateId: selectedTemplateId,
        coinReward: parseInt(newEnemyCoinReward) || 0,
        bossSpecialAttack: selectedTemplate?.isBoss ? newEnemyBossSpecialAttack : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", locationId, "enemies"] });
      setShowAddEnemy(false);
      setSelectedTemplateId("");
      setNewEnemyCoinReward("");
      setNewEnemyBossSpecialAttack(null);
      setTemplateSearch("");
      toast({ title: "Enemy Added" });
    },
    onError: () => toast({ title: "Failed to add enemy", variant: "destructive" }),
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

  const bgSection = (
    <div
      className="rounded-lg p-3"
      style={{
        background: isBattle ? "rgba(220,38,38,0.06)" : `${accent}10`,
        border: isBattle ? "1px solid rgba(220,38,38,0.2)" : `1px solid ${accent}25`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Image className="w-4 h-4" style={{ color: isBattle ? "#ef4444" : accent }} />
        <h4 className="font-fantasy text-xs tracking-wider" style={{ color: isBattle ? "#ef4444" : accent }}>Background</h4>
      </div>
      <label
        data-testid="button-upload-bg"
        className="block w-full py-2 rounded-md font-fantasy text-[10px] tracking-wider text-center transition-transform active:scale-95"
        style={{
          background: isBattle ? "rgba(220,38,38,0.12)" : `${accent}20`,
          border: isBattle ? "1px dashed rgba(220,38,38,0.4)" : `1px dashed ${accent}50`,
          color: isBattle ? "rgba(239,68,68,0.9)" : `${accent}cc`,
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
  );

  const enemiesSection = (
    <div
      className="rounded-lg"
      style={{
        background: isBattle ? "rgba(220,38,38,0.05)" : `${accent}10`,
        border: isBattle ? "1px solid rgba(220,38,38,0.25)" : `1px solid ${accent}25`,
        padding: isBattle ? "14px" : "12px",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4" style={{ color: isBattle ? "#ef4444" : accent }} />
          <h4
            className="font-fantasy tracking-wider"
            style={{
              fontSize: isBattle ? "13px" : "12px",
              color: isBattle ? "#ef4444" : accent,
            }}
          >
            Enemies ({enemies.length})
          </h4>
        </div>
        <button
          data-testid="button-add-enemy"
          onClick={() => setShowAddEnemy(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-fantasy text-[10px] tracking-wider transition-transform active:scale-95"
          style={{
            background: isBattle ? "rgba(220,38,38,0.25)" : `${accent}30`,
            border: isBattle ? "1px solid rgba(220,38,38,0.5)" : `1px solid ${accent}50`,
            cursor: "pointer",
            color: isBattle ? "#ff6666" : accent,
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          {isBattle ? "Add Enemy" : ""}
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
              style={{
                background: isBattle ? "rgba(30,4,4,0.6)" : "rgba(0,0,0,0.3)",
                border: isBattle ? "1px solid rgba(220,38,38,0.22)" : `1px solid ${accent}20`,
              }}
            >
              <div
                className="flex items-center gap-3 cursor-pointer"
                style={{ padding: isBattle ? "10px 12px" : "8px" }}
                onClick={() => setExpandedEnemy(expandedEnemy === enemy.id ? null : enemy.id)}
              >
                {enemy.imageUrl ? (
                  <img
                    src={enemy.imageUrl}
                    alt=""
                    className="rounded-md object-contain flex-shrink-0"
                    style={{
                      width: isBattle ? 52 : 40,
                      height: isBattle ? 52 : 40,
                      border: isBattle ? "1px solid rgba(220,38,38,0.3)" : `1px solid ${accent}30`,
                      background: "rgba(0,0,0,0.4)",
                    }}
                  />
                ) : (
                  <div
                    className="rounded-md flex items-center justify-center flex-shrink-0"
                    style={{
                      width: isBattle ? 52 : 40,
                      height: isBattle ? 52 : 40,
                      background: isBattle ? "rgba(220,38,38,0.1)" : `${accent}15`,
                      border: isBattle ? "1px solid rgba(220,38,38,0.3)" : `1px solid ${accent}30`,
                    }}
                  >
                    <Swords className="w-5 h-5" style={{ color: isBattle ? "#ef4444" : `${accent}60` }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className="font-fantasy tracking-wider truncate"
                    style={{
                      fontSize: isBattle ? "12px" : "11px",
                      color: isBattle ? "#fca5a5" : `${accent}dd`,
                    }}
                  >
                    {enemy.name}
                    {enemy.isBoss && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[7px] font-bold tracking-widest" style={{ background: "rgba(220,38,38,0.35)", border: "1px solid rgba(220,38,38,0.55)", color: "#ff6666" }}>BOSS</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1">
                      <img src={coinIconImg} alt="" className="w-3 h-3" />
                      <span className="font-fantasy text-[10px]" style={{ color: "#f0c040" }}>{enemy.coinReward}</span>
                    </div>
                    <span className="font-fantasy text-[9px] px-1 py-0.5 rounded" style={{ background: `${accent}18`, color: `${accent}99`, border: `1px solid ${accent}25` }}>
                      {(enemy.archetype || "balanced")}
                    </span>
                    <span className="font-fantasy text-[9px]" style={{ color: isBattle ? "rgba(220,38,38,0.5)" : `${accent}66` }}>{enemy.drops.length} drop{enemy.drops.length !== 1 ? "s" : ""}</span>
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
                  <p className="font-fantasy text-[8px] tracking-wider text-center" style={{ color: `${accent}55` }}>
                    Enemy stats are managed in the global Enemy Database.
                  </p>

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
  );

  const overlays = (
    <>
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
              <p className="font-fantasy text-[9px] tracking-wider" style={{ color: `${accent}88` }}>
                Pick from the global Enemy Database. Bosses always appear last; other enemies appear at random.
              </p>
              <div>
                <label className="font-fantasy text-[9px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Search</label>
                <input
                  data-testid="input-enemy-template-search"
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search enemies..."
                  className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div className="overflow-y-auto space-y-1" style={{ maxHeight: "32vh" }}>
                {enemyTemplates.length === 0 ? (
                  <p className="font-fantasy text-[10px] tracking-wider text-center py-3" style={{ color: `${accent}66` }}>
                    No enemies in the database yet. Add some in the Enemy Database panel.
                  </p>
                ) : filteredTemplates.length === 0 ? (
                  <p className="font-fantasy text-[10px] tracking-wider text-center py-3" style={{ color: `${accent}66` }}>No matches</p>
                ) : filteredTemplates.map((t) => (
                  <div
                    key={t.id}
                    data-testid={`enemy-template-option-${t.id}`}
                    onClick={() => setSelectedTemplateId(t.id)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
                    style={{
                      background: selectedTemplateId === t.id ? `${accent}30` : "rgba(255,255,255,0.03)",
                      border: selectedTemplateId === t.id ? `1px solid ${accent}60` : "1px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    {t.imageUrl ? (
                      <img src={t.imageUrl} alt="" className="w-8 h-8 object-contain rounded-sm" />
                    ) : (
                      <div className="w-8 h-8 rounded-sm flex items-center justify-center" style={{ background: `${accent}15` }}>
                        <Swords className="w-4 h-4" style={{ color: `${accent}66` }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-fantasy text-[10px] tracking-wider truncate" style={{ color: "#e0d0f0" }}>
                        {t.name}
                        {t.isBoss && (
                          <span className="ml-1.5 px-1 py-0.5 rounded text-[7px] font-bold tracking-widest" style={{ background: "rgba(220,38,38,0.35)", border: "1px solid rgba(220,38,38,0.55)", color: "#ff6666" }}>BOSS</span>
                        )}
                      </p>
                      <p className="font-fantasy text-[8px]" style={{ color: `${accent}66` }}>{t.archetype || "balanced"}</p>
                    </div>
                  </div>
                ))}
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
              {selectedTemplate?.isBoss && (
                <div>
                  <label className="font-fantasy text-[9px] tracking-wider block mb-1" style={{ color: "rgba(220,38,38,0.9)" }}>Boss Special Attack</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      data-testid="boss-special-add-none"
                      type="button"
                      onClick={() => setNewEnemyBossSpecialAttack(null)}
                      className="px-1 py-1.5 rounded-md font-fantasy text-[8px] tracking-wider text-center transition-colors"
                      style={{ background: newEnemyBossSpecialAttack === null ? "rgba(100,100,100,0.4)" : "rgba(255,255,255,0.04)", border: newEnemyBossSpecialAttack === null ? "1px solid rgba(150,150,150,0.6)" : "1px solid rgba(255,255,255,0.1)", color: newEnemyBossSpecialAttack === null ? "#ccc" : "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                      None
                    </button>
                    {BOSS_SPECIAL_ATTACKS.map((s) => (
                      <button
                        key={s.value}
                        data-testid={`boss-special-add-${s.value}`}
                        type="button"
                        onClick={() => setNewEnemyBossSpecialAttack(s.value)}
                        className="px-1 py-1.5 rounded-md font-fantasy text-[8px] tracking-wider text-center transition-colors"
                        style={{ background: newEnemyBossSpecialAttack === s.value ? "rgba(220,38,38,0.3)" : "rgba(255,255,255,0.04)", border: newEnemyBossSpecialAttack === s.value ? "1px solid rgba(220,38,38,0.7)" : "1px solid rgba(220,38,38,0.15)", color: newEnemyBossSpecialAttack === s.value ? "#ff6666" : "rgba(220,38,38,0.6)", cursor: "pointer" }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {newEnemyBossSpecialAttack && (
                    <p className="font-fantasy text-[7px] mt-1" style={{ color: "rgba(220,38,38,0.6)" }}>
                      {BOSS_SPECIAL_ATTACKS.find(s => s.value === newEnemyBossSpecialAttack)?.desc}
                    </p>
                  )}
                </div>
              )}
              <button
                data-testid="button-submit-add-enemy"
                onClick={() => {
                  if (!selectedTemplateId) {
                    toast({ title: "Pick an enemy", variant: "destructive" });
                    return;
                  }
                  addEnemyMutation.mutate();
                }}
                disabled={!selectedTemplateId || addEnemyMutation.isPending}
                className="w-full py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${accent}50 0%, ${accent}25 100%)`,
                  border: `1px solid ${accent}70`,
                  color: accent,
                  cursor: "pointer",
                }}
              >
                {addEnemyMutation.isPending ? "Adding..." : "Assign Enemy"}
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
    </>
  );

  if (inline) {
    return (
      <>
        <div className="overflow-y-auto flex-1 space-y-4" style={{ padding: "0 16px 16px 16px" }}>
          {bgSection}
          {enemiesSection}
        </div>
        {overlays}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 rounded-xl overflow-hidden"
        style={{
          width: isBattle ? "calc(100% - 24px)" : "92%",
          maxWidth: isBattle ? "540px" : "448px",
          background: isBattle
            ? "linear-gradient(160deg, rgba(10,4,4,0.99) 0%, rgba(20,6,6,0.99) 50%, rgba(10,4,4,0.99) 100%)"
            : "linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 100%)",
          border: isBattle ? "1px solid rgba(220,38,38,0.45)" : `1px solid ${accent}55`,
          boxShadow: isBattle ? "0 0 50px rgba(220,38,38,0.2), 0 0 100px rgba(220,38,38,0.08)" : `0 0 40px ${accent}25`,
          maxHeight: "90vh",
        }}
      >
        {isBattle && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(220,38,38,0.08) 0%, transparent 70%)" }} />
        )}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            {isBattle && <Swords className="w-5 h-5" style={{ color: "#ef4444" }} />}
            <h3
              className="font-fantasy tracking-widest"
              style={{
                fontSize: isBattle ? "15px" : "13px",
                color: isBattle ? "#ef4444" : accent,
                textShadow: isBattle ? "0 0 14px rgba(239,68,68,0.5)" : `0 0 10px ${accent}40`,
              }}
            >
              {isBattle ? "Battle Zone Setup" : "Explore Zone Setup"}
            </h3>
          </div>
          <button
            data-testid="button-close-explore-admin"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto pb-4 space-y-4" style={{ maxHeight: "calc(90vh - 64px)", padding: isBattle ? "0 18px 0 18px" : "0 16px 0 16px" }}>
          {bgSection}
          {enemiesSection}
        </div>
      </div>
      {overlays}
    </div>
  );
}
