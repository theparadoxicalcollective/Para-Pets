import { useState, useRef, useEffect } from "react";
import { Sparkles, Wind, Pencil } from "lucide-react";
import { fireLevelUp } from "@/lib/levelUpEvents";
import { playPowerUp, playSpeedUp } from "@/lib/sounds";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PowerUpOverlay, { PowerUpEffectType } from "@/components/PowerUpOverlay";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import gemCrystalIcon from "@assets/generated_images/icon_gem_crystal.png";
import powerupBagIcon from "@assets/generated_images/icon_powerup_bag.png";
import statHpIcon from "@assets/generated_images/icon_stat_hp.png";
import statAtkIcon from "@assets/generated_images/icon_stat_atk.png";
import statDefIcon from "@assets/generated_images/icon_stat_def.png";
import profileFrameImg from "@assets/frame_profile.png";
import tutIconRarity from "@assets/generated_images/icon_tut_rarity.png";
import tutIconLevelup from "@assets/generated_images/icon_tut_levelup.png";
import tutIconStats from "@assets/generated_images/icon_tut_stats.png";
import tutIconPowerup from "@assets/generated_images/icon_tut_powerup.png";
import tutIconLvlitem from "@assets/generated_images/icon_tut_lvlitem.png";
import tutIconAccessory from "@assets/generated_images/icon_tut_accessory.png";
import tutIconNickname from "@assets/generated_images/icon_tut_nickname.png";

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
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
}

interface EquippedAccessory {
  id: string;
  slot: number;
  accessoryInventoryId: string;
  name: string;
  imageUrl: string | null;
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
}

interface PetDetailPageProps {
  pet: PetData;
  onClose: () => void;
  onUpdate: () => void;
  userCoins: number;
  onUserUpdate: (user: any) => void;
}

// Unified warm gold palette across all rarities — intensity increases with rarity
const RARITY: Record<number, { label: string; primary: string; glow: string; heroBg: string; dim: string }> = {
  1: { label: "Common",    primary: "#a89878", glow: "rgba(168,152,120,0.45)", heroBg: "rgba(38,26,8,0.45)",  dim: "rgba(168,152,120,0.15)" },
  2: { label: "Uncommon",  primary: "#c8a84b", glow: "rgba(200,168,75,0.50)",  heroBg: "rgba(48,34,5,0.48)",  dim: "rgba(200,168,75,0.16)"  },
  3: { label: "Rare",      primary: "#ddb840", glow: "rgba(221,184,64,0.55)",  heroBg: "rgba(54,38,5,0.52)",  dim: "rgba(221,184,64,0.17)"  },
  4: { label: "Epic",      primary: "#f0c040", glow: "rgba(240,192,64,0.60)",  heroBg: "rgba(60,44,5,0.55)",  dim: "rgba(240,192,64,0.20)"  },
  5: { label: "Legendary", primary: "#ffd700", glow: "rgba(255,215,0,0.68)",   heroBg: "rgba(68,50,5,0.60)",  dim: "rgba(255,215,0,0.22)"   },
};

export default function PetDetailPage({ pet, onClose, onUpdate, userCoins, onUserUpdate }: PetDetailPageProps) {
  const [confirmItem, setConfirmItem] = useState<BagItem | null>(null);
  const pendingUseItemRef = useRef<any | null>(null);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [successBoostLabel, setSuccessBoostLabel] = useState("");
  const [successAnimType, setSuccessAnimType] = useState<PowerUpEffectType>("stat");
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(pet.petNickname || "");
  const [showAccessoryPicker, setShowAccessoryPicker] = useState(false);
  const [accessoryFlash, setAccessoryFlash] = useState<"equip" | "unequip" | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("petDetailTutorialSeen"));
  const [flipAnim, setFlipAnim] = useState<"idle" | "forward" | "back">("idle");
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const handlePortraitClick = () => {
    if (!pet.eggImageUrl || flipAnim !== "idle") return;
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    setFlipAnim("forward");
    flipTimerRef.current = setTimeout(() => {
      setFlipAnim("back");
      flipTimerRef.current = setTimeout(() => setFlipAnim("idle"), 900);
    }, 900 + 2800);
  };
  useEffect(() => () => { if (flipTimerRef.current) clearTimeout(flipTimerRef.current); }, []);

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

  const { data: equippedAccessories = [] } = useQuery<EquippedAccessory[]>({
    queryKey: ["/api/pet", pet.inventoryId, "accessories"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pet/${pet.inventoryId}/accessories`);
      return res.json();
    },
    staleTime: 0,
  });

  const equipMutation = useMutation({
    mutationFn: async (accessoryInventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/equip`, { accessoryInventoryId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet", pet.inventoryId, "accessories"] });
      setAccessoryFlash("equip");
      setTimeout(() => setAccessoryFlash(null), 700);
      setShowAccessoryPicker(false);
      onUpdate();
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not equip accessory", variant: "destructive" });
    },
  });

  const unequipMutation = useMutation({
    mutationFn: async (accessoryInventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/unequip`, { accessoryInventoryId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet", pet.inventoryId, "accessories"] });
      setAccessoryFlash("unequip");
      setTimeout(() => setAccessoryFlash(null), 600);
      onUpdate();
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not unequip accessory", variant: "destructive" });
    },
  });

  const usableItems = inventory.filter(
    (item) => (item.type === "item" || item.type === "power_up") && item.statBoostType
  );

  const specialItems = inventory.filter(
    (item) => item.type === "special" && item.specialType
  );

  const rarity = pet.rarity || 1;
  // 1-2 star pets: 2 slots/level; 3-5 star pets: 3 slots/level
  const maxItemsPerLevel = rarity <= 2 ? 2 : 3;
  const totalUsed = Math.max(0, pet.itemsUsedThisLevel);
  const totalAllowances = pet.petLevel * maxItemsPerLevel;
  const itemsRemaining = totalAllowances - totalUsed;
  const showRemainingCount = itemsRemaining < 26;

  const powerUpMutation = useMutation({
    mutationFn: async (itemInventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/power-up`, { itemInventoryId });
      return res.json();
    },
    onSuccess: (data) => {
      playPowerUp();
      const item = pendingUseItemRef.current ?? confirmItem;
      pendingUseItemRef.current = null;
      const boostLabel = item
        ? `+${item.statBoostAmount || "?"} ${item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : "Lvl pts"}`
        : "Power Up!";
      setConfirmItem(null);
      setSuccessBoostLabel(boostLabel);
      setSuccessAnimType("stat");
      setShowSuccessAnim(true);
      if (data?.petLevel && data.petLevel > pet.petLevel) {
        fireLevelUp(data.petLevel, pet.petNickname || pet.name, pet.petTemplateId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      onUpdate();
    },
    onError: (err: any) => {
      pendingUseItemRef.current = null;
      setConfirmItem(null);
      toast({ title: "Failed", description: err?.message || "Could not power up", variant: "destructive" });
    },
  });

  const useSpecialMutation = useMutation({
    mutationFn: async (itemInventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/use-special`, { itemInventoryId });
      return res.json();
    },
    onSuccess: (data) => {
      const item = pendingUseItemRef.current ?? confirmItem;
      pendingUseItemRef.current = null;
      const isHatchTime = item?.specialType === "hatch_time";
      if (isHatchTime) playSpeedUp(); else playPowerUp();
      const label = isHatchTime
        ? `-${item?.specialAmount || "?"} min`
        : `+${item?.specialAmount || "?"} LVL pts`;
      const effectType: PowerUpEffectType = isHatchTime ? "hatch" : "level";
      setConfirmItem(null);
      setSuccessBoostLabel(label);
      setSuccessAnimType(effectType);
      setShowSuccessAnim(true);
      if (data?.petLevel && data.petLevel > pet.petLevel) {
        fireLevelUp(data.petLevel, pet.petNickname || pet.name, pet.petTemplateId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      onUpdate();
    },
    onError: (err: any) => {
      pendingUseItemRef.current = null;
      setConfirmItem(null);
      toast({ title: "Failed", description: err?.message || "Could not use special item", variant: "destructive" });
    },
  });

  const petImage = pet.hatchedImageUrl || pet.imageUrl;
  const rc = RARITY[Math.min(5, Math.max(1, rarity))] || RARITY[1];

  // XP progress
  const needed = Math.floor(100 + pet.petLevel * 30 + pet.petLevel * pet.petLevel * 5);
  const current = pet.petLevelPoints || 0;
  const xpPct = Math.min(100, (current / needed) * 100);

  // Particle positions (stable, not random on render)
  const particles = [
    { left: "12%", delay: "0s",    dur: "2.8s" },
    { left: "28%", delay: "0.6s",  dur: "3.2s" },
    { left: "48%", delay: "1.1s",  dur: "2.5s" },
    { left: "66%", delay: "0.3s",  dur: "3.6s" },
    { left: "82%", delay: "0.9s",  dur: "2.9s" },
    { left: "94%", delay: "1.5s",  dur: "3.1s" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full sm:w-[92%] sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-y-auto animate-slide-up"
        style={{
          background: "linear-gradient(160deg, rgba(16,8,2,0.99) 0%, rgba(28,16,6,0.99) 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderBottom: "none",
          boxShadow: `0 -4px 60px rgba(0,0,0,0.9), 0 0 80px ${rc.glow.replace("0.55", "0.12")}`,
          maxHeight: "90vh",
        }}
      >
        {/* ── Portrait + name (open, no box header) ──────────────── */}
        <div
          className="relative flex flex-col items-center"
          style={{
            paddingTop: 50,
            paddingBottom: 10,
            background: `radial-gradient(ellipse 140% 180% at 50% -20%, ${rc.heroBg} 0%, transparent 62%)`,
          }}
        >
          {/* Shimmer bar at very top */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, transparent, ${rc.primary}, transparent)`,
            animation: "shimmerBar 3s ease-in-out infinite",
          }} />

          {/* Floating particles */}
          {particles.map((p, i) => (
            <div key={i} style={{
              position: "absolute",
              top: 50,
              left: p.left,
              width: i % 2 === 0 ? 3 : 2,
              height: i % 2 === 0 ? 3 : 2,
              borderRadius: "50%",
              background: rc.primary,
              boxShadow: `0 0 6px ${rc.glow}`,
              animation: `heroParticle ${p.dur} ease-in-out infinite`,
              animationDelay: p.delay,
              opacity: 0,
            }} />
          ))}

          {/* Soft radial glow behind portrait */}
          <div style={{
            position: "absolute",
            left: "50%", top: 50,
            transform: "translateX(-50%)",
            width: 220, height: 220,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${rc.glow.replace("0.55", "0.30")} 0%, transparent 70%)`,
            animation: "glowPulse 3s ease-in-out infinite",
            pointerEvents: "none",
          }} />

          {/* Pet portrait (coin-flip card) */}
          <div
            style={{
              width: 180, height: 180,
              cursor: pet.eggImageUrl ? "pointer" : "default",
              position: "relative",
              zIndex: 1,
              flexShrink: 0,
            }}
            onClick={handlePortraitClick}
            data-testid="img-pet-detail"
          >
            {/* Float layer */}
            <div style={{ width: "100%", height: "100%", animation: "portraitFloat 4s ease-in-out infinite" }}>
              {/* Perspective container */}
              <div style={{ width: "100%", height: "100%", perspective: "700px" }}>
                {/* Flipper */}
                <div style={{
                  width: "100%",
                  height: "100%",
                  transformStyle: "preserve-3d",
                  animation: flipAnim === "forward"
                    ? "coinFlipForward 0.9s ease-in-out forwards"
                    : flipAnim === "back"
                    ? "coinFlipBack 0.9s ease-in-out forwards"
                    : "none",
                  transform: flipAnim === "idle" ? "rotateY(0deg)" : undefined,
                }}>
                  {/* Front face: pet */}
                  <div style={{
                    position: "absolute", inset: 0,
                    borderRadius: "50%",
                    overflow: "hidden",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    border: `2.5px solid ${rc.primary}`,
                    boxShadow: `0 0 0 4px ${rc.dim}, 0 0 30px ${rc.glow}`,
                    background: "rgba(8,4,2,0.18)",
                  }}>
                    {petImage ? (
                      <img
                        src={petImage}
                        alt={pet.name}
                        className="w-full h-full object-contain"
                        style={{ filter: `drop-shadow(0 0 8px ${rc.glow}) drop-shadow(0 0 20px ${rc.glow.replace("0.55", "0.28")})` }}
                      />
                    ) : (
                      <img src={petPawIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.6 }} />
                    )}
                  </div>
                  {/* Back face: egg */}
                  <div style={{
                    position: "absolute", inset: 0,
                    borderRadius: "50%",
                    overflow: "hidden",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    border: `2.5px solid ${rc.primary}`,
                    boxShadow: `0 0 0 4px ${rc.dim}, 0 0 32px ${rc.glow}`,
                    background: "rgba(8,4,0,0.22)",
                  }}>
                    {pet.eggImageUrl ? (
                      <img
                        src={pet.eggImageUrl}
                        alt="Egg"
                        className="w-full h-full object-contain"
                        style={{ filter: `drop-shadow(0 0 8px ${rc.glow}) drop-shadow(0 0 20px ${rc.glow.replace("0.55", "0.28")})` }}
                      />
                    ) : (
                      <img src={petPawIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.35 }} />
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* Portrait frame overlay — sits on top of the flip, doesn't flip */}
            <img
              src={profileFrameImg}
              alt=""
              style={{
                position: "absolute",
                inset: -14,
                width: "calc(100% + 28px)",
                height: "calc(100% + 28px)",
                objectFit: "contain",
                pointerEvents: "none",
                zIndex: 3,
                filter: `drop-shadow(0 0 10px ${rc.glow})`,
              }}
            />
            {/* Tap hint */}
            {pet.eggImageUrl && flipAnim === "idle" && (
              <div style={{
                position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)",
                fontSize: 8, fontFamily: "Lora, serif", letterSpacing: "0.08em",
                color: rc.primary + "80",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                zIndex: 4,
              }}>tap to reveal</div>
            )}
          </div>

          {/* Name + stars + nickname — flows directly below portrait */}
          <div className="flex flex-col items-center mt-4 px-4 w-full">
            <h3
              className="font-fantasy text-base tracking-widest font-bold"
              style={{ color: rc.primary, textShadow: `0 0 12px ${rc.glow}` }}
              data-testid="text-pet-detail-name"
            >
              {pet.petNickname || pet.name}
            </h3>
            {pet.petNickname && (
              <p className="font-fantasy text-[#7a6a50] text-[9px] tracking-wider -mt-0.5" data-testid="text-pet-species">{pet.name}</p>
            )}
            {rarity > 0 && (
              <div className="flex items-center gap-0.5 mt-0.5" data-testid="stars-pet-detail">
                {Array.from({ length: rarity }).map((_, i) => (
                  <span key={i} style={{ color: rc.primary, textShadow: `0 0 6px ${rc.glow}`, fontSize: 12 }}>★</span>
                ))}
                {Array.from({ length: 5 - rarity }).map((_, i) => (
                  <span key={i} style={{ color: "rgba(255,255,255,0.08)", fontSize: 12 }}>★</span>
                ))}
              </div>
            )}

            {/* Nickname editing */}
            {editingNickname ? (
              <div className="flex items-center gap-1.5 mt-1.5">
                <input
                  data-testid="input-pet-nickname"
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value.slice(0, 20))}
                  placeholder="Name your pet..."
                  autoFocus
                  className="px-2 py-0.5 rounded-md font-fantasy text-[10px] outline-none w-28 text-center"
                  style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
                  onKeyDown={(e) => { if (e.key === "Enter") nicknameMutation.mutate(nicknameInput); }}
                />
                <button
                  data-testid="button-save-nickname"
                  onClick={() => nicknameMutation.mutate(nicknameInput)}
                  disabled={nicknameMutation.isPending}
                  className="px-2 py-0.5 rounded-md font-fantasy text-[8px] tracking-wider"
                  style={{ background: `linear-gradient(135deg, ${rc.primary}33, ${rc.primary}11)`, border: `1px solid ${rc.primary}55`, color: rc.primary, cursor: "pointer" }}
                >
                  {nicknameMutation.isPending ? "..." : "Save"}
                </button>
                <button
                  data-testid="button-cancel-nickname"
                  onClick={() => { setEditingNickname(false); setNicknameInput(pet.petNickname || ""); }}
                  className="px-2 py-0.5 rounded-md font-fantasy text-[8px] tracking-wider"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", color: "#6a5840", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                data-testid="button-edit-nickname"
                onClick={() => { setEditingNickname(true); setNicknameInput(pet.petNickname || ""); }}
                className="mt-1 px-2.5 py-0.5 rounded-full font-fantasy text-[8px] tracking-wider transition-opacity hover:opacity-80"
                style={{ background: rc.dim, border: `1px solid ${rc.primary}33`, color: rc.primary, cursor: "pointer" }}
              >
                <span className="flex items-center gap-1">
                  <Pencil size={8} />
                  {pet.petNickname ? "Rename" : "Give a Name"}
                </span>
              </button>
            )}
          </div>

          {/* Rarity badge – top left */}
          <div
            className="absolute font-fantasy tracking-widest"
            style={{
              top: 12, left: 12,
              fontSize: 8, fontWeight: 700,
              color: rc.primary,
              background: rc.dim,
              border: `1px solid ${rc.primary}55`,
              borderRadius: 20,
              padding: "2px 7px",
              letterSpacing: "0.12em",
              textShadow: `0 0 8px ${rc.glow}`,
            }}
          >
            {rc.label.toUpperCase()}
          </div>

          {/* Help + Close buttons */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            <button
              data-testid="button-pet-detail-help"
              onClick={() => setShowTutorial(true)}
              className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px]"
              style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${rc.primary}55`, color: rc.primary, cursor: "pointer", fontFamily: "Lora, serif" }}
            >
              ?
            </button>
            <button
              data-testid="button-close-pet-detail"
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs"
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

        </div>

        <div className="px-4 pb-5 space-y-3 mt-1">

          {/* ── Level progression ──────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(0,0,0,0.40)", border: `1px solid ${rc.primary}28` }}
          >
            <div className="flex items-center gap-3 px-3 pt-3 pb-2">
              {/* Level medallion */}
              <div
                className="flex-shrink-0 flex flex-col items-center justify-center rounded-full"
                style={{
                  width: 54, height: 54,
                  background: `radial-gradient(circle at 35% 35%, ${rc.primary}44, rgba(0,0,0,0.7))`,
                  border: `2px solid ${rc.primary}88`,
                  boxShadow: `0 0 16px ${rc.glow}, inset 0 0 10px rgba(0,0,0,0.5)`,
                }}
              >
                <span className="font-fantasy text-[8px] tracking-widest" style={{ color: rc.primary + "aa", lineHeight: 1 }}>LVL</span>
                <span
                  className="font-fantasy font-bold leading-none"
                  style={{ color: rc.primary, textShadow: `0 0 14px ${rc.glow}`, fontSize: pet.petLevel >= 100 ? 16 : 22 }}
                  data-testid="text-pet-level"
                >
                  {pet.petLevel}
                </span>
              </div>
              {/* XP bar area */}
              <div className="flex-1 min-w-0">
                {pet.petLevel < 100 ? (
                  <>
                    <div className="flex justify-between mb-1">
                      <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>EXPERIENCE</span>
                      <span className="font-fantasy text-[9px]" style={{ color: rc.primary + "cc" }} data-testid="text-level-points">
                        {current.toLocaleString()} / {needed.toLocaleString()}
                      </span>
                    </div>
                    <div className="relative w-full rounded-full overflow-hidden" style={{ height: 8, background: "rgba(0,0,0,0.55)", border: `1px solid ${rc.primary}18` }}>
                      <div
                        data-testid="bar-level-progress"
                        style={{
                          width: `${Math.max(xpPct > 0 ? 2 : 0, xpPct)}%`,
                          background: `linear-gradient(90deg, ${rc.primary}88, ${rc.primary})`,
                          height: "100%",
                          borderRadius: 4,
                          transition: "width 0.6s ease",
                          boxShadow: xpPct > 0 ? `0 0 10px ${rc.glow}` : "none",
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-fantasy text-xs tracking-widest px-3 py-1 rounded-full" style={{ background: rc.dim, color: rc.primary, border: `1px solid ${rc.primary}55` }}>
                      ✦ MAX LEVEL ✦
                    </span>
                  </div>
                )}
                {/* Power-up slots */}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="font-fantasy text-[8px] tracking-widest" style={{ color: "rgba(255,255,255,0.22)" }}>POWER-UP SLOTS</span>
                  <span className="font-fantasy text-[8px]" style={{ color: rc.primary + "99" }} data-testid="text-items-used">
                    {showRemainingCount ? `${itemsRemaining} remaining` : "✦ unlimited"}
                  </span>
                </div>
                <div className="w-full rounded-full overflow-hidden mt-0.5" style={{ height: 4, background: "rgba(0,0,0,0.5)" }}>
                  <div style={{
                    width: totalAllowances > 0 ? `${Math.min(100, (totalUsed / totalAllowances) * 100)}%` : "0%",
                    background: `linear-gradient(90deg, ${rc.primary}66, ${rc.primary})`,
                    height: "100%",
                    borderRadius: 4,
                    transition: "width 0.5s ease",
                    boxShadow: `0 0 5px ${rc.glow}`,
                  }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Combat stats — three glowing plates ──────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${rc.primary}44)` }} />
              <span className="font-fantasy text-[9px] tracking-widest" style={{ color: rc.primary + "88" }}>COMBAT STATS</span>
              <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${rc.primary}44, transparent)` }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* HP plate */}
              <div
                className="rounded-xl flex flex-col items-center py-3 gap-1"
                style={{
                  background: "linear-gradient(160deg, rgba(34,80,40,0.55) 0%, rgba(10,30,14,0.6) 100%)",
                  border: "1px solid rgba(134,201,138,0.35)",
                  boxShadow: "0 0 18px rgba(74,222,128,0.10)",
                }}
                data-testid="bar-pet-health"
              >
                <img src={statHpIcon} alt="HP" style={{ width: 28, height: 28, objectFit: "contain", filter: "drop-shadow(0 0 6px rgba(74,222,128,0.6))" }} />
                <span className="font-fantasy font-bold" style={{ color: "#86c98a", fontSize: 20, lineHeight: 1, textShadow: "0 0 12px rgba(74,222,128,0.5)" }}>{pet.petHealth}</span>
                <span className="font-fantasy text-[8px] tracking-widest" style={{ color: "rgba(134,201,138,0.6)" }}>HP</span>
              </div>
              {/* ATK plate */}
              <div
                className="rounded-xl flex flex-col items-center py-3 gap-1"
                style={{
                  background: "linear-gradient(160deg, rgba(90,40,20,0.55) 0%, rgba(35,10,5,0.6) 100%)",
                  border: "1px solid rgba(212,149,106,0.35)",
                  boxShadow: "0 0 18px rgba(248,113,113,0.10)",
                }}
                data-testid="bar-pet-atk"
              >
                <img src={statAtkIcon} alt="ATK" style={{ width: 28, height: 28, objectFit: "contain", filter: "drop-shadow(0 0 6px rgba(248,113,113,0.6))" }} />
                <span className="font-fantasy font-bold" style={{ color: "#d4956a", fontSize: 20, lineHeight: 1, textShadow: "0 0 12px rgba(248,113,113,0.5)" }}>{pet.petAtk}</span>
                <span className="font-fantasy text-[8px] tracking-widest" style={{ color: "rgba(212,149,106,0.6)" }}>ATK</span>
              </div>
              {/* DEF plate */}
              <div
                className="rounded-xl flex flex-col items-center py-3 gap-1"
                style={{
                  background: "linear-gradient(160deg, rgba(20,48,80,0.55) 0%, rgba(5,18,35,0.6) 100%)",
                  border: "1px solid rgba(143,196,176,0.35)",
                  boxShadow: "0 0 18px rgba(96,165,250,0.10)",
                }}
                data-testid="bar-pet-def"
              >
                <img src={statDefIcon} alt="DEF" style={{ width: 28, height: 28, objectFit: "contain", filter: "drop-shadow(0 0 6px rgba(96,165,250,0.6))" }} />
                <span className="font-fantasy font-bold" style={{ color: "#8fc4b0", fontSize: 20, lineHeight: 1, textShadow: "0 0 12px rgba(96,165,250,0.5)" }}>{pet.petDef}</span>
                <span className="font-fantasy text-[8px] tracking-widest" style={{ color: "rgba(143,196,176,0.6)" }}>DEF</span>
              </div>
            </div>
          </div>

          {/* ── Accessories ─────────────────────────────────────── */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${rc.primary}22` }}
            data-testid="section-accessories"
          >
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <span className="font-fantasy text-[10px] tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>ACCESSORIES</span>
                <span
                  className="font-fantasy text-[9px] tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: rc.dim, color: rc.primary, border: `1px solid ${rc.primary}33` }}
                >
                  {equippedAccessories.length} / 3
                </span>
              </div>
              {accessoryFlash && (
                <div
                  className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center"
                  style={{ animation: accessoryFlash === "equip" ? "accEquipFlash 0.7s ease-out forwards" : "accUnequipFlash 0.6s ease-out forwards" }}
                >
                  {accessoryFlash === "equip"
                    ? <Sparkles style={{ width: 32, height: 32, color: rc.primary, filter: `drop-shadow(0 0 8px ${rc.glow})` }} />
                    : <Wind style={{ width: 32, height: 32, color: "#94a3b8", filter: "drop-shadow(0 0 6px rgba(148,163,184,0.7))" }} />}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((slot) => {
                  const acc = equippedAccessories.find((e) => e.slot === slot);
                  return acc ? (
                    <button
                      key={slot}
                      data-testid={`button-unequip-slot-${slot}`}
                      onClick={() => unequipMutation.mutate(acc.accessoryInventoryId)}
                      disabled={unequipMutation.isPending}
                      className="w-full rounded-xl p-2 flex flex-col items-center gap-1 transition-transform active:scale-95 disabled:opacity-60"
                      style={{
                        background: "rgba(30,15,5,0.8)",
                        border: `1px solid ${rc.primary}55`,
                        boxShadow: `0 0 10px ${rc.dim}`,
                        cursor: "pointer",
                        minHeight: 82,
                      }}
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.35)" }}>
                        {acc.imageUrl ? <img src={acc.imageUrl} alt={acc.name} className="w-full h-full object-contain" /> : <img src={gemCrystalIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />}
                      </div>
                      <span className="font-fantasy text-[7px] tracking-wider text-center truncate w-full" style={{ color: rc.primary }}>{acc.name}</span>
                      <div className="flex flex-col items-center">
                        {(acc.atkBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#f87171" }}>+{acc.atkBoost} ATK</span>}
                        {(acc.defBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#60a5fa" }}>+{acc.defBoost} DEF</span>}
                        {(acc.healthBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#4ade80" }}>+{acc.healthBoost} HP</span>}
                      </div>
                      <span className="font-fantasy text-[5px] tracking-wider" style={{ color: "rgba(255,100,100,0.6)" }}>TAP TO REMOVE</span>
                    </button>
                  ) : (
                    <button
                      key={slot}
                      data-testid={`button-equip-slot-${slot}`}
                      onClick={() => setShowAccessoryPicker(true)}
                      className="w-full rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 hover:border-opacity-40"
                      style={{
                        background: "rgba(0,0,0,0.15)",
                        border: `1px dashed ${rc.primary}22`,
                        cursor: "pointer",
                        minHeight: 82,
                      }}
                    >
                      <span className="text-xl" style={{ color: `${rc.primary}33` }}>+</span>
                      <span className="font-fantasy text-[7px] tracking-wider" style={{ color: `${rc.primary}33` }}>EMPTY</span>
                    </button>
                  );
                })}
              </div>
              {showAccessoryPicker && (
                <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${rc.primary}18` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-fantasy text-[10px] tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>SELECT ACCESSORY</span>
                    <button
                      onClick={() => setShowAccessoryPicker(false)}
                      className="font-fantasy text-[9px]"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#6a5840" }}
                    >
                      Cancel
                    </button>
                  </div>
                  {(() => {
                    const equippedIds = equippedAccessories.map((e) => e.accessoryInventoryId);
                    const available = inventory.filter((i) => i.type === "accessory" && !equippedIds.includes(i.inventoryId));
                    return available.length === 0 ? (
                      <p className="font-fantasy text-[#6a5840] text-xs text-center py-3">No accessories in your bag</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {available.map((item) => (
                          <button
                            key={item.inventoryId}
                            data-testid={`button-pick-accessory-${item.inventoryId}`}
                            onClick={() => equipMutation.mutate(item.inventoryId)}
                            disabled={equipMutation.isPending}
                            className="rounded-xl p-2 flex flex-col items-center gap-1 transition-transform active:scale-95 disabled:opacity-40"
                            style={{ background: "rgba(30,15,5,0.8)", border: `1px solid ${rc.primary}33`, cursor: "pointer" }}
                          >
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                              {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" /> : <img src={gemCrystalIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />}
                            </div>
                            <span className="font-fantasy text-[7px] tracking-wider text-center truncate w-full" style={{ color: rc.primary }}>{item.name}</span>
                            <div className="flex flex-col items-center">
                              {(item.atkBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#f87171" }}>+{item.atkBoost} ATK</span>}
                              {(item.defBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#60a5fa" }}>+{item.defBoost} DEF</span>}
                              {(item.healthBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#4ade80" }}>+{item.healthBoost} HP</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── Confirm use item ────────────────────────────────────── */}
        {confirmItem && (() => {
          const isSpecial = confirmItem.type === "special";
          const isPending = isSpecial ? useSpecialMutation.isPending : powerUpMutation.isPending;
          const effectLabel = isSpecial
            ? (confirmItem.specialType === "hatch_time" ? `-${confirmItem.specialAmount || "?"}min hatch time` : `+${confirmItem.specialAmount || "?"} LVL pts`)
            : `+${confirmItem.statBoostAmount || "?"} ${confirmItem.statBoostType === "health" ? "HP" : confirmItem.statBoostType === "atk" ? "ATK" : confirmItem.statBoostType === "def" ? "DEF" : "Lvl pts"}`;
          const effectColor = isSpecial ? "#f0c040" : (confirmItem.statBoostType === "health" ? "#4ade80" : confirmItem.statBoostType === "atk" ? "#f87171" : confirmItem.statBoostType === "def" ? "#60a5fa" : "#c084fc");
          const effectBg = isSpecial ? "rgba(240,192,64,0.2)" : (confirmItem.statBoostType === "health" ? "rgba(74,222,128,0.2)" : confirmItem.statBoostType === "atk" ? "rgba(248,113,113,0.2)" : confirmItem.statBoostType === "def" ? "rgba(96,165,250,0.2)" : "rgba(192,132,252,0.2)");
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
              <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmItem(null)} />
              <div
                className="relative w-[80%] max-w-xs rounded-2xl p-5 animate-slide-up"
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
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.3)" }}>
                    {confirmItem.imageUrl ? (
                      <img src={confirmItem.imageUrl} alt={confirmItem.name} className="w-full h-full object-contain" />
                    ) : isSpecial ? (
                      <Sparkles className="w-7 h-7" style={{ color: "#f0c040" }} />
                    ) : (
                      <img src={powerupBagIcon} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
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
                    className="flex-1 py-2 rounded-xl font-fantasy text-xs tracking-wider"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#ccc", cursor: "pointer" }}
                    data-testid="button-cancel-use-item"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => isSpecial ? useSpecialMutation.mutate(confirmItem.inventoryId) : powerUpMutation.mutate(confirmItem.inventoryId)}
                    disabled={isPending}
                    className="flex-1 py-2 rounded-xl font-fantasy text-xs tracking-wider disabled:opacity-50"
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

      </div>

      <style>{`
        @keyframes heroParticle {
          0%   { transform: translateY(0px)   scale(1);   opacity: 0; }
          15%  { opacity: 0.8; }
          80%  { transform: translateY(-80px) scale(0.5); opacity: 0.4; }
          100% { transform: translateY(-100px) scale(0.2); opacity: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 1;   transform: translate(-50%, -50%) scale(1.15); }
        }
        @keyframes portraitFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes coinFlipForward {
          0%   { transform: rotateY(0deg); }
          100% { transform: rotateY(540deg); }
        }
        @keyframes coinFlipBack {
          0%   { transform: rotateY(540deg); }
          100% { transform: rotateY(1080deg); }
        }
        @keyframes shimmerBar {
          0%   { opacity: 0.4; background-position: -200% center; }
          50%  { opacity: 1; }
          100% { opacity: 0.4; background-position: 200% center; }
        }
        @keyframes powerUpFlash {
          0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; }
        }
        @keyframes powerUpRise {
          0%   { transform: translateY(20px) scale(0.8); opacity: 0; }
          15%  { transform: translateY(0px) scale(1.3); opacity: 1; }
          40%  { transform: translateY(-8px) scale(1.05); opacity: 1; }
          100% { transform: translateY(-35px) scale(0.9); opacity: 0; }
        }
        @keyframes powerUpSpin {
          0%   { transform: rotate(0deg) scale(0.3); }
          40%  { transform: rotate(200deg) scale(1.4); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes powerUpPulse {
          0%   { opacity: 0; transform: scale(0.5); }
          30%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.5); }
        }
        @keyframes powerUpParticle {
          0%   { opacity: 1; transform: rotate(var(--angle, 0deg)) translateY(-10px) scale(1); }
          100% { opacity: 0; transform: rotate(var(--angle, 0deg)) translateY(-60px) scale(0.3); }
        }
        @keyframes accEquipFlash {
          0%   { opacity: 0; transform: scale(0.3); }
          25%  { opacity: 1; transform: scale(1.5); }
          70%  { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(0.9); }
        }
        @keyframes accUnequipFlash {
          0%   { opacity: 1; transform: scale(1); }
          40%  { opacity: 0.7; transform: scale(1.3); }
          100% { opacity: 0; transform: scale(1.6); }
        }
      `}</style>

      {/* ── Tutorial modal ─────────────────────────────────────────── */}
      {showTutorial && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { localStorage.setItem("petDetailTutorialSeen", "1"); setShowTutorial(false); }} />
          <div
            className="relative w-full sm:w-[92%] sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-y-auto animate-slide-up"
            style={{
              background: "linear-gradient(160deg, rgba(14,7,2,0.99) 0%, rgba(26,14,5,0.99) 100%)",
              border: `1px solid ${rc.primary}33`,
              borderBottom: "none",
              boxShadow: `0 -4px 60px rgba(0,0,0,0.9), 0 0 40px ${rc.dim}`,
              maxHeight: "82vh",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 pt-5 pb-3"
              style={{ borderBottom: `1px solid ${rc.primary}18` }}
            >
              <div>
                <p className="font-fantasy text-[9px] tracking-widest mb-0.5" style={{ color: `${rc.primary}88` }}>PET DETAILS</p>
                <p className="font-fantasy text-base font-bold tracking-wider" style={{ color: rc.primary }}>How It Works</p>
              </div>
              <button
                data-testid="button-pet-tutorial-close"
                onClick={() => { localStorage.setItem("petDetailTutorialSeen", "1"); setShowTutorial(false); }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Cards */}
            <div className="px-4 py-4 space-y-3">
              {[
                {
                  iconImg: tutIconRarity,
                  iconColor: rc.primary,
                  title: "Rarity & Stars",
                  desc: `Stars (1–5) show your pet's rarity tier. Higher rarity = more power-up slots per level, so rare pets grow faster with items.`,
                },
                {
                  iconImg: tutIconLevelup,
                  iconColor: "#f0c040",
                  title: "Level & XP",
                  desc: "Your pet gains XP automatically through battles. Watch the bar fill — when it's full your pet levels up and grows stronger.",
                },
                {
                  iconImg: tutIconStats,
                  iconColor: "#4ade80",
                  title: "HP / ATK / DEF",
                  desc: "HP is health in battle. ATK determines how hard you hit enemies. DEF reduces incoming damage — especially important for blocking.",
                },
                {
                  iconImg: tutIconPowerup,
                  iconColor: "#c084fc",
                  title: "Power Up",
                  desc: "Feed your pet items from your bag to permanently boost HP, ATK, or DEF. Each level has a limited number of slots based on rarity.",
                },
                {
                  iconImg: tutIconLvlitem,
                  iconColor: "#60a5fa",
                  title: "LVL Up Items",
                  desc: "Special level-up items inject XP directly into the bar. Great for pushing past a level quickly without waiting for battles.",
                },
                {
                  iconImg: tutIconAccessory,
                  iconColor: "#f0c040",
                  title: "Accessories",
                  desc: "Equip up to 3 accessories for passive stat bonuses. Tap a filled slot to remove it. Accessories stack on top of your base stats.",
                },
                {
                  iconImg: tutIconNickname,
                  iconColor: rc.primary,
                  title: "Nickname",
                  desc: "Give your pet a personal name that shows in battle and the pet house. Species name stays visible underneath as a reference.",
                },
              ].map(({ iconImg, iconColor, title, desc }) => (
                <div
                  key={title}
                  className="flex gap-3 items-start rounded-xl p-3"
                  style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden"
                    style={{ background: `${iconColor}12`, border: `1px solid ${iconColor}33` }}
                  >
                    <img src={iconImg} alt={title} className="w-full h-full object-contain p-0.5" />
                  </div>
                  <div>
                    <p className="font-fantasy text-[11px] font-semibold tracking-wide mb-0.5" style={{ color: iconColor }}>{title}</p>
                    <p className="font-fantasy text-[10px] leading-relaxed tracking-wide" style={{ color: "rgba(200,180,150,0.7)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 pb-5">
              <button
                data-testid="button-pet-tutorial-got-it"
                onClick={() => { localStorage.setItem("petDetailTutorialSeen", "1"); setShowTutorial(false); }}
                className="w-full py-3 rounded-xl font-fantasy text-xs tracking-widest transition-transform active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${rc.primary}28 0%, ${rc.primary}12 100%)`,
                  border: `1px solid ${rc.primary}44`,
                  color: rc.primary,
                  cursor: "pointer",
                  boxShadow: `0 0 20px ${rc.dim}`,
                }}
              >
                Got It!
              </button>
            </div>
          </div>
        </div>
      )}

      <PowerUpOverlay
        visible={showSuccessAnim}
        effectType={successAnimType}
        label={successBoostLabel}
        onDone={() => setShowSuccessAnim(false)}
      />

    </div>
  );
}

