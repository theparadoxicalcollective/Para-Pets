import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import coinIconImg from "@assets/icon_coin.png";

interface PetData {
  inventoryId: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  eggImageUrl: string | null;
  hatchedImageUrl: string | null;
  petTemplateId: string | null;
  petNickname: string | null;
  rarity: number | null;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petLevel: number;
  petLevelPoints: number;
  itemsUsedThisLevel: number;
  isHatched: boolean;
}

interface BagItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  statBoostType: string | null;
  statBoostAmount: number | null;
  specialType: string | null;
  specialAmount: number | null;
}

interface PetDetailPageProps {
  pet: PetData;
  onClose: () => void;
  onUpdate: () => void;
  userCoins: number;
  onUserUpdate: (user: any) => void;
}

export default function PetDetailPage({ pet, onClose, onUpdate, userCoins, onUserUpdate }: PetDetailPageProps) {
  const [showPowerUp, setShowPowerUp] = useState(false);
  const [showLvlUp, setShowLvlUp] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [confirmItem, setConfirmItem] = useState<BagItem | null>(null);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [successBoostLabel, setSuccessBoostLabel] = useState("");
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(pet.petNickname || "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const nicknameMutation = useMutation({
    mutationFn: async (nickname: string) => {
      const res = await apiRequest("PATCH", `/api/inventory/${pet.inventoryId}/nickname`, { nickname });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      onUpdate();
      setEditingNickname(false);
      toast({ title: "Named!", description: "Your pet has a new name" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update name", variant: "destructive" });
    },
  });

  const { data: inventory = [] } = useQuery<BagItem[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const usableItems = inventory.filter(
    (item) => item.type === "item" && item.statBoostType
  );

  const specialItems = inventory.filter(
    (item) => item.type === "special" && item.specialType
  );

  const rarity = pet.rarity || 1;
  const maxItemsPerLevel = rarity + 2;
  const itemsRemaining = maxItemsPerLevel - pet.itemsUsedThisLevel;

  const powerUpMutation = useMutation({
    mutationFn: async (itemInventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/power-up`, { itemInventoryId });
      return res.json();
    },
    onSuccess: () => {
      const item = confirmItem;
      const boostLabel = item
        ? `+${item.statBoostAmount || "?"} ${item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : "LVL"}`
        : "Power Up!";
      setSuccessBoostLabel(boostLabel);
      setShowSuccessAnim(true);
      setConfirmItem(null);
      setShowPowerUp(false);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      onUpdate();
      setTimeout(() => setShowSuccessAnim(false), 2000);
    },
    onError: (err: any) => {
      setConfirmItem(null);
      toast({ title: "Failed", description: err?.message || "Could not power up", variant: "destructive" });
    },
  });

  const useSpecialMutation = useMutation({
    mutationFn: async (itemInventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/use-special`, { itemInventoryId });
      return res.json();
    },
    onSuccess: () => {
      const item = confirmItem;
      const label = item?.specialType === "hatch_time"
        ? `-${item.specialAmount || "?"} min hatch`
        : `+${item?.specialAmount || "?"} LVL pts`;
      setSuccessBoostLabel(label);
      setShowSuccessAnim(true);
      setConfirmItem(null);
      setShowPowerUp(false);
      setShowLvlUp(false);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      onUpdate();
      setTimeout(() => setShowSuccessAnim(false), 2000);
    },
    onError: (err: any) => {
      setConfirmItem(null);
      toast({ title: "Failed", description: err?.message || "Could not use special item", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/reset-stats`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      if (data.user) onUserUpdate(data.user);
      onUpdate();
      toast({ title: "Stats Reset", description: "Pet stats have been reset to base values" });
      setShowResetConfirm(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not reset stats", variant: "destructive" });
    },
  });

  const petImage = pet.hatchedImageUrl || pet.imageUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[90%] max-w-sm rounded-lg overflow-y-auto animate-slide-up"
        style={{
          background: "linear-gradient(135deg, rgba(20,10,3,0.98) 0%, rgba(45,25,8,0.98) 100%)",
          border: "1px solid rgba(212,160,23,0.5)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.8), 0 0 60px rgba(212,160,23,0.1)",
          maxHeight: "85vh",
        }}
      >
        <button
          data-testid="button-close-pet-detail"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
        >
          X
        </button>

        <div className="p-5">
          <div className="flex flex-col items-center mb-2 relative">
            <div
              className="w-36 h-36 rounded-xl flex items-center justify-center overflow-hidden mb-1"
              style={{
                background: "radial-gradient(ellipse at center, rgba(45,122,79,0.25) 0%, rgba(10,40,20,0.5) 100%)",
                border: "2px solid rgba(127,255,212,0.3)",
                boxShadow: "0 0 30px rgba(45,122,79,0.3)",
              }}
              data-testid="img-pet-detail"
            >
              {petImage ? (
                <img src={petImage} alt={pet.name} className="w-full h-full object-contain" />
              ) : (
                <span className="text-5xl">🐾</span>
              )}
            </div>

            {showSuccessAnim && (
              <div
                className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
                style={{ animation: "powerUpFlash 2s ease-out forwards" }}
              >
                <div
                  className="flex flex-col items-center"
                  style={{ animation: "powerUpRise 2s ease-out forwards" }}
                >
                  <div
                    className="text-4xl mb-1"
                    style={{ animation: "powerUpSpin 0.6s ease-out", filter: "drop-shadow(0 0 20px rgba(127,255,212,0.8))" }}
                  >
                    ⚡
                  </div>
                  <span
                    className="font-fantasy text-lg font-bold tracking-wider"
                    style={{
                      color: "#7fffd4",
                      textShadow: "0 0 20px rgba(127,255,212,0.8), 0 0 40px rgba(127,255,212,0.4)",
                    }}
                    data-testid="text-power-up-success"
                  >
                    {successBoostLabel}
                  </span>
                </div>
              </div>
            )}

            {pet.eggImageUrl && (
              <div
                className="w-8 h-8 rounded-md overflow-hidden -mt-6 ml-24 relative z-10"
                style={{ border: "1px solid rgba(212,160,23,0.4)", background: "rgba(0,0,0,0.5)" }}
                data-testid="img-pet-egg-thumb"
              >
                <img src={pet.eggImageUrl} alt="Egg" className="w-full h-full object-contain" />
              </div>
            )}

            <h3
              className="font-fantasy text-[#f0c040] text-lg tracking-widest font-semibold mt-1"
              style={{ textShadow: "0 0 10px rgba(240,192,64,0.3)" }}
              data-testid="text-pet-detail-name"
            >
              {pet.petNickname || pet.name}
            </h3>
            {pet.petNickname && (
              <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider" data-testid="text-pet-species">{pet.name}</p>
            )}
            {editingNickname ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  data-testid="input-pet-nickname"
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value.slice(0, 20))}
                  placeholder="Name your pet..."
                  autoFocus
                  className="px-2 py-1 rounded-md font-fantasy text-xs outline-none w-32 text-center"
                  style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
                  onKeyDown={(e) => { if (e.key === "Enter") nicknameMutation.mutate(nicknameInput); }}
                />
                <button
                  data-testid="button-save-nickname"
                  onClick={() => nicknameMutation.mutate(nicknameInput)}
                  disabled={nicknameMutation.isPending}
                  className="px-2 py-1 rounded-md font-fantasy text-[9px] tracking-wider"
                  style={{ background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)", border: "1px solid rgba(127,255,212,0.4)", color: "#7fffd4", cursor: "pointer" }}
                >
                  {nicknameMutation.isPending ? "..." : "Save"}
                </button>
                <button
                  data-testid="button-cancel-nickname"
                  onClick={() => { setEditingNickname(false); setNicknameInput(pet.petNickname || ""); }}
                  className="px-2 py-1 rounded-md font-fantasy text-[9px] tracking-wider"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.2)", color: "#a89878", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                data-testid="button-edit-nickname"
                onClick={() => { setEditingNickname(true); setNicknameInput(pet.petNickname || ""); }}
                className="mt-1 px-3 py-1 rounded-md font-fantasy text-[9px] tracking-wider"
                style={{ background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.25)", color: "#f0c040", cursor: "pointer" }}
              >
                {pet.petNickname ? "Rename" : "Name Your Pet"}
              </button>
            )}

            {rarity > 0 && (
              <div className="flex items-center gap-0.5 mt-1" data-testid="stars-pet-detail">
                {Array.from({ length: rarity }).map((_, i) => (
                  <span key={i} className="text-sm" style={{ color: "#f0c040", textShadow: "0 0 6px rgba(240,192,64,0.6)" }}>★</span>
                ))}
                {Array.from({ length: 5 - rarity }).map((_, i) => (
                  <span key={i} className="text-sm" style={{ color: "#3a2a1a" }}>★</span>
                ))}
              </div>
            )}
          </div>

          <div
            className="rounded-lg p-4 mb-3"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.2)" }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-fantasy text-[#a89878] text-xs tracking-wider">LEVEL</span>
              <span className="font-fantasy text-[#f0c040] text-lg font-bold" data-testid="text-pet-level">{pet.petLevel}</span>
            </div>
            {pet.petLevel < 100 && (() => {
              const needed = 50 + (pet.petLevel * 10);
              const current = pet.petLevelPoints || 0;
              const pct = Math.min(100, (current / needed) * 100);
              return (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-fantasy text-[#a89878] text-[10px] tracking-wider">NEXT LEVEL</span>
                    <span className="font-fantasy text-[#f0c040] text-[10px] font-bold" data-testid="text-level-points">
                      {current} / {needed} pts
                    </span>
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.5)", height: "10px", border: "1px solid rgba(240,192,64,0.2)" }}>
                    <div
                      data-testid="bar-level-progress"
                      style={{
                        width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`,
                        background: "linear-gradient(90deg, #d4a017, #f0c040, #ffd700)",
                        height: "100%",
                        borderRadius: "4px",
                        transition: "width 0.5s ease",
                        boxShadow: pct > 0 ? "0 0 8px rgba(240,192,64,0.5), inset 0 1px 0 rgba(255,255,255,0.3)" : "none",
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            <StatBar label="HP" value={pet.petHealth} displayValue={pet.petHealth.toLocaleString()} color="#4ade80" testId="bar-pet-health" />
            <StatBar label="ATK" value={pet.petAtk} displayValue={pet.petAtk.toLocaleString()} color="#f87171" testId="bar-pet-atk" />
            <StatBar label="DEF" value={pet.petDef} displayValue={pet.petDef.toLocaleString()} color="#60a5fa" testId="bar-pet-def" />

            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(212,160,23,0.15)" }}>
              <div className="flex items-center justify-between">
                <span className="font-fantasy text-[#6a5840] text-[10px] tracking-wider">ITEMS THIS LEVEL</span>
                <span className="font-fantasy text-[#a89878] text-[10px]" data-testid="text-items-used">
                  {pet.itemsUsedThisLevel} / {maxItemsPerLevel}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full mt-1" style={{ background: "rgba(0,0,0,0.4)" }}>
                <div style={{
                  width: `${Math.min(100, (pet.itemsUsedThisLevel / maxItemsPerLevel) * 100)}%`,
                  background: "linear-gradient(90deg, #c084fc, #c084fc88)",
                  height: "6px",
                  borderRadius: "4px",
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-2">
            <button
              data-testid="button-power-up"
              onClick={() => { setShowPowerUp(true); setShowLvlUp(false); }}
              disabled={pet.petLevel >= 100}
              className="flex-1 py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                border: "1px solid rgba(127,255,212,0.4)",
                color: "#7fffd4",
                cursor: pet.petLevel >= 100 ? "not-allowed" : "pointer",
              }}
            >
              {pet.petLevel >= 100 ? "MAX" : "Power Up"}
            </button>
            <button
              data-testid="button-lvl-up"
              onClick={() => { setShowLvlUp(true); setShowPowerUp(false); }}
              disabled={pet.petLevel >= 100}
              className="flex-1 py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, rgba(240,192,64,0.3) 0%, rgba(180,140,30,0.3) 100%)",
                border: "1px solid rgba(240,192,64,0.4)",
                color: "#f0c040",
                cursor: pet.petLevel >= 100 ? "not-allowed" : "pointer",
              }}
            >
              {pet.petLevel >= 100 ? "MAX" : "LVL Up"}
            </button>
          </div>
          <div className="mb-3">
            <button
              data-testid="button-reset-stats"
              onClick={() => setShowResetConfirm(true)}
              className="w-full py-2 rounded-md font-fantasy text-[10px] tracking-wider transition-transform active:scale-95"
              style={{
                background: "linear-gradient(135deg, rgba(139,0,0,0.4) 0%, rgba(80,0,0,0.4) 100%)",
                border: "1px solid rgba(200,50,50,0.3)",
                color: "#ff9999",
                cursor: "pointer",
              }}
            >
              Reset Stats
            </button>
          </div>
        </div>

        {showPowerUp && (
          <div className="p-5 pt-0">
            <div
              className="rounded-lg p-4"
              style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(127,255,212,0.2)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-fantasy text-[#7fffd4] text-xs tracking-wider">SELECT ITEM</h4>
                <button
                  onClick={() => setShowPowerUp(false)}
                  className="font-fantasy text-[#a89878] text-[10px] tracking-wider"
                  style={{ cursor: "pointer", background: "none", border: "none" }}
                >
                  Cancel
                </button>
              </div>
              {usableItems.length === 0 ? (
                <p className="font-fantasy text-[#a89878] text-xs text-center py-4">
                  No power-up items in your bag
                </p>
              ) : (
                <>
                  <p className="font-fantasy text-[#a89878] text-[9px] tracking-wider mb-1">POWER-UP ITEMS ({itemsRemaining} uses left)</p>
                  {itemsRemaining <= 0 && (
                    <p className="font-fantasy text-[#ff9999] text-[8px] text-center mb-2">
                      Limit reached this level. Level up first!
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {usableItems.map((item) => (
                      <button
                        key={item.inventoryId}
                        data-testid={`button-use-item-${item.inventoryId}`}
                        onClick={() => setConfirmItem(item)}
                        disabled={powerUpMutation.isPending || (item.statBoostType !== "lvl" && itemsRemaining <= 0)}
                        className="rounded-md p-2 flex flex-col items-center gap-1 transition-transform active:scale-95 disabled:opacity-40"
                        style={{
                          background: "rgba(30,15,5,0.8)",
                          border: "1px solid rgba(212,160,23,0.3)",
                          cursor: powerUpMutation.isPending ? "wait" : "pointer",
                        }}
                      >
                        <div className="w-10 h-10 rounded flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-lg">📦</span>
                          )}
                        </div>
                        <span className="font-fantasy text-[#f0c040] text-[8px] tracking-wider text-center truncate w-full">{item.name}</span>
                        <span
                          className="font-fantasy text-[7px] tracking-wider px-1.5 py-0.5 rounded-full"
                          style={{
                            background: item.statBoostType === "health" ? "rgba(74,222,128,0.15)" : item.statBoostType === "atk" ? "rgba(248,113,113,0.15)" : item.statBoostType === "def" ? "rgba(96,165,250,0.15)" : "rgba(192,132,252,0.15)",
                            color: item.statBoostType === "health" ? "#4ade80" : item.statBoostType === "atk" ? "#f87171" : item.statBoostType === "def" ? "#60a5fa" : "#c084fc",
                          }}
                        >
                          +{item.statBoostAmount || "?"} {item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : "LVL"}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {showLvlUp && (
          <div className="p-5 pt-0">
            <div
              className="rounded-lg p-4"
              style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(240,192,64,0.3)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-fantasy text-[#f0c040] text-xs tracking-wider">LVL UP ITEMS</h4>
                <button
                  onClick={() => setShowLvlUp(false)}
                  className="font-fantasy text-[#a89878] text-[10px] tracking-wider"
                  style={{ cursor: "pointer", background: "none", border: "none" }}
                >
                  Cancel
                </button>
              </div>
              {(() => {
                const needed = 50 + (pet.petLevel * 10);
                const current = pet.petLevelPoints || 0;
                const pct = Math.min(100, (current / needed) * 100);
                return (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-fantasy text-[#a89878] text-[10px] tracking-wider">PROGRESS TO NEXT LEVEL</span>
                  <span className="font-fantasy text-[#f0c040] text-[10px] font-bold">{current} / {needed} pts</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.5)", height: "10px", border: "1px solid rgba(240,192,64,0.2)" }}>
                  <div style={{
                    width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`,
                    background: "linear-gradient(90deg, #d4a017, #f0c040, #ffd700)",
                    height: "100%",
                    borderRadius: "4px",
                    transition: "width 0.5s ease",
                    boxShadow: pct > 0 ? "0 0 8px rgba(240,192,64,0.5), inset 0 1px 0 rgba(255,255,255,0.3)" : "none",
                  }} />
                </div>
              </div>
                );
              })()}
              {specialItems.filter(i => i.specialType === "level").length === 0 ? (
                <p className="font-fantasy text-[#a89878] text-xs text-center py-4">
                  No LVL items in your bag
                </p>
              ) : (
                <>
                  <p className="font-fantasy text-[#a89878] text-[9px] tracking-wider mb-1">No use limit — use as many as you want!</p>
                  <div className="grid grid-cols-3 gap-2">
                    {specialItems.filter(i => i.specialType === "level").map((item) => (
                      <button
                        key={item.inventoryId}
                        data-testid={`button-use-lvl-${item.inventoryId}`}
                        onClick={() => setConfirmItem(item)}
                        disabled={useSpecialMutation.isPending}
                        className="rounded-md p-2 flex flex-col items-center gap-1 transition-transform active:scale-95 disabled:opacity-40"
                        style={{
                          background: "rgba(30,15,5,0.8)",
                          border: "1px solid rgba(240,192,64,0.3)",
                          cursor: useSpecialMutation.isPending ? "wait" : "pointer",
                        }}
                      >
                        <div className="w-10 h-10 rounded flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-lg">⚡</span>
                          )}
                        </div>
                        <span className="font-fantasy text-[#f0c040] text-[8px] tracking-wider text-center truncate w-full">{item.name}</span>
                        <span
                          className="font-fantasy text-[7px] tracking-wider px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(240,192,64,0.15)", color: "#f0c040" }}
                        >
                          +{item.specialAmount || "?"} LVL pts
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {confirmItem && (() => {
          const isSpecial = confirmItem.type === "special";
          const isPending = isSpecial ? useSpecialMutation.isPending : powerUpMutation.isPending;
          const effectLabel = isSpecial
            ? (confirmItem.specialType === "hatch_time" ? `-${confirmItem.specialAmount || "?"}min hatch time` : `+${confirmItem.specialAmount || "?"} LVL pts`)
            : `+${confirmItem.statBoostAmount || "?"} ${confirmItem.statBoostType === "health" ? "HP" : confirmItem.statBoostType === "atk" ? "ATK" : confirmItem.statBoostType === "def" ? "DEF" : "LVL"}`;
          const effectColor = isSpecial ? "#f0c040" : (confirmItem.statBoostType === "health" ? "#4ade80" : confirmItem.statBoostType === "atk" ? "#f87171" : confirmItem.statBoostType === "def" ? "#60a5fa" : "#c084fc");
          const effectBg = isSpecial ? "rgba(240,192,64,0.2)" : (confirmItem.statBoostType === "health" ? "rgba(74,222,128,0.2)" : confirmItem.statBoostType === "atk" ? "rgba(248,113,113,0.2)" : confirmItem.statBoostType === "def" ? "rgba(96,165,250,0.2)" : "rgba(192,132,252,0.2)");
          return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmItem(null)} />
            <div
              className="relative w-[80%] max-w-xs rounded-lg p-5 animate-slide-up"
              style={{
                background: "linear-gradient(135deg, rgba(10,40,25,0.97) 0%, rgba(20,60,35,0.97) 100%)",
                border: "1px solid rgba(127,255,212,0.5)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.8), 0 0 30px rgba(127,255,212,0.15)",
              }}
            >
              <h4 className="font-fantasy text-[#7fffd4] text-sm tracking-wider text-center mb-3" data-testid="text-confirm-use-title">
                {isSpecial ? "Use Special Item?" : "Use Item?"}
              </h4>
              <div className="flex flex-col items-center gap-2 mb-4">
                <div className="w-14 h-14 rounded-md flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.3)" }}>
                  {confirmItem.imageUrl ? (
                    <img src={confirmItem.imageUrl} alt={confirmItem.name} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-2xl">{isSpecial ? "✨" : "📦"}</span>
                  )}
                </div>
                <p className="font-fantasy text-[#f0c040] text-xs font-semibold">{confirmItem.name}</p>
                <span
                  className="font-fantasy text-xs tracking-wider px-3 py-1 rounded-full"
                  style={{ background: effectBg, color: effectColor, border: `1px solid ${effectColor}44` }}
                >
                  {effectLabel}
                </span>
                {isSpecial && (
                  <p className="font-fantasy text-[#f0c040] text-[9px] text-center">
                    Does NOT count toward power-up limit
                  </p>
                )}
                <p className="font-fantasy text-[#a89878] text-[10px] text-center">
                  This item will be consumed and cannot be undone.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmItem(null)}
                  className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#ccc", cursor: "pointer" }}
                  data-testid="button-cancel-use-item"
                >
                  Cancel
                </button>
                <button
                  onClick={() => isSpecial ? useSpecialMutation.mutate(confirmItem.inventoryId) : powerUpMutation.mutate(confirmItem.inventoryId)}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                    border: "1px solid rgba(127,255,212,0.5)",
                    color: "#7fffd4",
                    cursor: "pointer",
                    boxShadow: "0 0 15px rgba(127,255,212,0.2)",
                  }}
                  data-testid="button-confirm-use-item"
                >
                  {isPending ? "Using..." : "Use Item"}
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {showResetConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowResetConfirm(false)} />
            <div
              className="relative w-[80%] max-w-xs rounded-lg p-5 animate-slide-up"
              style={{
                background: "linear-gradient(135deg, rgba(60,10,10,0.97) 0%, rgba(30,5,5,0.97) 100%)",
                border: "1px solid rgba(200,50,50,0.5)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
              }}
            >
              <h4 className="font-fantasy text-[#ff6666] text-sm tracking-wider text-center mb-3" data-testid="text-reset-warning-title">
                ⚠ RESET STATS ⚠
              </h4>
              <p className="font-fantasy text-[#ffaaaa] text-xs text-center leading-relaxed mb-2">
                This will reset ALL of {pet.name}'s stats to base values:
              </p>
              <div className="text-center mb-3 space-y-1">
                <p className="font-fantasy text-[#ff9999] text-[10px]">HP → 1,000 | ATK → 50 | DEF → 50</p>
                <p className="font-fantasy text-[#ff9999] text-[10px]">Level → 0 | Items Used → 0</p>
              </div>
              <div className="flex items-center justify-center gap-1 mb-4">
                <span className="font-fantasy text-[#ffaaaa] text-xs">Cost:</span>
                <img src={coinIconImg} alt="" className="w-4 h-4" />
                <span className="font-fantasy text-[#f0c040] text-sm font-bold">300</span>
              </div>
              {userCoins < 300 && (
                <p className="font-fantasy text-[#ff6666] text-[10px] text-center mb-3">
                  Not enough coins! You have {userCoins}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#ccc", cursor: "pointer" }}
                  data-testid="button-cancel-reset"
                >
                  Cancel
                </button>
                <button
                  onClick={() => resetMutation.mutate()}
                  disabled={resetMutation.isPending || userCoins < 300}
                  className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #8b0000 0%, #500000 100%)", border: "1px solid rgba(200,50,50,0.5)", color: "#ff6666", cursor: userCoins < 300 ? "not-allowed" : "pointer" }}
                  data-testid="button-confirm-reset"
                >
                  {resetMutation.isPending ? "Resetting..." : "RESET"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes powerUpFlash {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes powerUpRise {
          0% { transform: translateY(20px) scale(0.8); opacity: 0; }
          20% { transform: translateY(0px) scale(1.2); opacity: 1; }
          50% { transform: translateY(-10px) scale(1); opacity: 1; }
          100% { transform: translateY(-30px) scale(0.9); opacity: 0; }
        }
        @keyframes powerUpSpin {
          0% { transform: rotate(0deg) scale(0.5); }
          50% { transform: rotate(180deg) scale(1.3); }
          100% { transform: rotate(360deg) scale(1); }
        }
      `}</style>
    </div>
  );
}

function StatBar({ label, value, displayValue, color, testId }: { label: string; value: number; displayValue: string; color: string; testId: string }) {
  const maxDisplay = Math.max(value, label === "HP" ? 5000 : 500);
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="font-fantasy text-[10px] tracking-wider" style={{ color }}>{label}</span>
        <span className="font-fantasy text-[#e0d0b0] text-[10px]" data-testid={testId}>{displayValue}</span>
      </div>
      <div className="w-full h-2 rounded-full" style={{ background: "rgba(0,0,0,0.4)" }}>
        <div
          style={{
            width: `${Math.min(100, (value / maxDisplay) * 100)}%`,
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
            height: "100%",
            borderRadius: "4px",
            transition: "width 0.5s ease",
            boxShadow: `0 0 6px ${color}40`,
          }}
        />
      </div>
    </div>
  );
}
