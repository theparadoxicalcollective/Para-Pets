import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, Droplets, Heart, Check } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import type { BattlePotionSlot } from "@/components/BattleArena";
import raidBg from "@assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png";

import starImg from "@assets/Photoroom_20260331_20947_PM_1774984267132.png";
import raidCloseImg from "@assets/Photoroom_20260711_90748_PM_1783822223263.png";
import raidLeaderboardImg from "@assets/Photoroom_20260711_90837_PM_1783822223263.png";
import raidHpFrameImg from "@assets/Photoroom_20260711_31007_PM_1783820810778.png";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";

const POTION_LS_KEY = "raid:potionSlots:v1";
const RAID_PETS_LS_KEY = "raid:petIds:v1";
const POTION_STACK_SIZE = 50;

export default function RaidPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: inventory = [], isSuccess: inventoryReady } = useQuery<any[]>({ queryKey: ["/api/inventory"] });

  const activePetId: string | null = me?.activePetId ?? null;
  const isAdmin: boolean = me?.isAdmin === true;

  // ── Admin: raid state ─────────────────────────────────────────────
  // bossPickStep: null = closed, "pick" = choose template, "hp" = enter HP
  const [bossPickStep, setBossPickStep] = useState<null | "pick" | "hp">(null);
  const [pendingBossId, setPendingBossId] = useState<string | null>(null);
  const [pendingBossName, setPendingBossName] = useState<string>("");
  const [draftHp, setDraftHp] = useState("10000");
  const [draftMaxHp, setDraftMaxHp] = useState("10000");
  const [bossModalSaving, setBossModalSaving] = useState(false);

  const { data: raidStatusData, isLoading: raidStatusLoading } = useQuery<{ raidVisible: boolean }>({
    queryKey: ["/api/raid-status"],
    staleTime: 10 * 1000,
    enabled: isAdmin,
  });
  const raidOn = raidStatusData?.raidVisible === true;
  const { data: raidBossData, refetch: refetchRaidBoss } = useQuery<{ templateId: string | null; rarity: number | null; name: string | null; hp: number; maxHp: number }>({
    queryKey: ["/api/raid-boss"],
    staleTime: 10 * 1000,
  });
  const { data: templatesList = [] } = useQuery<{ id: string; name: string; rarity: number }[]>({
    queryKey: ["/api/admin/templates-list"],
    enabled: isAdmin && bossPickStep === "pick",
    staleTime: 60 * 1000,
  });

  const raidToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/admin/raid-toggle", { enabled });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/raid-status"], { raidVisible: data.raidVisible });
      toast({ title: data.raidVisible ? "Raid icon ON" : "Raid icon OFF" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const clearBossMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/raid-boss", { templateId: null });
      return res.json();
    },
    onSuccess: () => { refetchRaidBoss(); toast({ title: "Raid Boss cleared" }); },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const saveBossAndHp = async () => {
    if (!pendingBossId) return;
    setBossModalSaving(true);
    try {
      const r1 = await apiRequest("POST", "/api/admin/raid-boss", { templateId: pendingBossId });
      if (!r1.ok) throw new Error("Failed to set boss");
      const hp = parseInt(draftHp, 10) || 1;
      const maxHp = parseInt(draftMaxHp, 10) || 1;
      const r2 = await apiRequest("POST", "/api/admin/raid-boss-hp", { hp, maxHp });
      if (!r2.ok) throw new Error("Failed to set HP");
      refetchRaidBoss();
      setBossPickStep(null);
      setPendingBossId(null);
      toast({ title: `${pendingBossName} set as Raid Boss` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBossModalSaving(false); }
  };

  // ── Pet slots ─────────────────────────────────────────────────────
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RAID_PETS_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 5);
      }
    } catch {}
    return [];
  });
  useEffect(() => {
    try { localStorage.setItem(RAID_PETS_LS_KEY, JSON.stringify(selectedPetIds)); } catch {}
  }, [selectedPetIds]);

  const hatchedPets = (inventory as any[]).filter((inv: any) => inv.type === "pet" && inv.isHatched);

  // Seed slot 0 with active pet
  useEffect(() => {
    if (!activePetId) return;
    setSelectedPetIds(prev => {
      if (prev[0] === activePetId) return prev;
      const rest = prev.filter(id => id !== activePetId);
      return [activePetId, ...rest].slice(0, 5);
    });
  }, [activePetId]);

  const togglePet = (invId: string) => {
    if (activePetId && invId === activePetId) return;
    setSelectedPetIds(prev => {
      if (prev.includes(invId)) return prev.filter(id => id !== invId);
      const validSet = new Set(hatchedPets.map((p: any) => p.inventoryId || p.id));
      const clean = prev.filter(id => id === activePetId || validSet.has(id));
      if (clean.length >= 5) return prev;
      return [...clean, invId];
    });
  };

  const equippedCount = selectedPetIds.filter(id =>
    id === activePetId || hatchedPets.some((p: any) => (p.inventoryId || p.id) === id)
  ).length;

  // ── Potion slots ──────────────────────────────────────────────────
  const [selectedPotionSlots, setSelectedPotionSlots] = useState<(BattlePotionSlot | null)[]>(() => {
    const isValidSlot = (s: any): s is BattlePotionSlot => {
      if (!s || typeof s !== "object") return false;
      if (typeof s.shopItemId !== "string") return false;
      if (typeof s.inventoryId !== "string" || s.inventoryId.length === 0) return false;
      if (typeof s.qty !== "number" || !Number.isFinite(s.qty) || s.qty <= 0) return false;
      if (typeof s.name !== "string") return false;
      return true;
    };
    try {
      const raw = localStorage.getItem(POTION_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 5) {
          return parsed.map((s: any) => (isValidSlot(s) ? s : null));
        }
      }
    } catch {}
    return [null, null, null, null, null];
  });
  useEffect(() => {
    try { localStorage.setItem(POTION_LS_KEY, JSON.stringify(selectedPotionSlots)); } catch {}
  }, [selectedPotionSlots]);

  // Auto-clamp slots when inventory changes
  useEffect(() => {
    if (!inventoryReady || !Array.isArray(inventory)) return;
    const liveQty = new Map<string, number>();
    for (const i of inventory as any[]) {
      if (i && i.type === "potion") {
        liveQty.set(i.inventoryId || i.id, Math.max(0, i.quantity ?? 1));
      }
    }
    setSelectedPotionSlots(prev => {
      let changed = false;
      const next = prev.map(slot => {
        if (!slot) return slot;
        const live = liveQty.get(slot.inventoryId);
        if (live === undefined || live <= 0) { changed = true; return null; }
        const clamped = Math.min(live, POTION_STACK_SIZE);
        if (clamped === slot.qty) return slot;
        changed = true;
        return { ...slot, qty: clamped };
      });
      return changed ? next : prev;
    });
  }, [inventory, inventoryReady]);

  const battlePotions = (inventory as any[]).filter(
    (i: any) => i.type === "potion" && (((i.healthRestored ?? 0) > 0) || ((i.manaRestored ?? 0) > 0) || ((i.petsRevived ?? 0) > 0))
  );
  const potionStacks = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const p of battlePotions) {
      const name = p.name || "Unknown Potion";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(p);
    }
    return Array.from(groups.entries()).map(([name, items]) => {
      const rep = items[0];
      const totalQty = items.reduce((sum, i) => sum + (i.quantity ?? 1), 0);
      const inventoryIds = items.map((i: any) => i.inventoryId || i.id);
      return {
        key: name,
        rep,
        inventoryIds,
        firstInventoryId: inventoryIds[0],
        qty: Math.min(POTION_STACK_SIZE, totalQty),
      };
    });
  }, [battlePotions]);

  const removePotionSlot = (idx: number) => {
    setSelectedPotionSlots(prev => {
      if (!prev[idx]) return prev;
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  };
  const equipPotion = (rep: any, inventoryId: string, qty: number) => {
    setSelectedPotionSlots(prev => {
      const emptyIdx = prev.findIndex(s => s === null);
      if (emptyIdx === -1) return prev;
      const equipped = new Set(prev.filter((s): s is BattlePotionSlot => s !== null).map(s => s.inventoryId));
      if (equipped.has(inventoryId)) return prev;
      const next = [...prev];
      next[emptyIdx] = {
        shopItemId: rep.shopItemId || `name:${rep.name}`,
        inventoryId,
        qty: Math.max(1, Math.min(POTION_STACK_SIZE, qty)),
        name: rep.name,
        imageUrl: rep.imageUrl ?? null,
        healthRestored: rep.healthRestored ?? null,
        manaRestored: rep.manaRestored ?? null,
        petsRevived: rep.petsRevived ?? null,
        petsHealed: null,
      };
      return next;
    });
    setPickerOpen(null);
  };

  // ── Picker sheet ──────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState<null | "pet" | "potion">(null);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#08040c",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Background */}
      <img
        src={raidBg}
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
      />
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(4,2,8,0.52)", pointerEvents: "none" }}
      />

      {/* Admin-only visibility toggle — floats left of close button */}
      {isAdmin && (
        <button
          data-testid="button-toggle-raid"
          onClick={() => raidToggleMutation.mutate(!raidOn)}
          disabled={raidStatusLoading || raidToggleMutation.isPending}
          style={{
            position: "absolute",
            top: 64,
            right: 66,
            zIndex: 10,
            width: 46, height: 26, borderRadius: 13,
            background: raidOn ? "linear-gradient(135deg, #7a2808, #c0391b)" : "linear-gradient(135deg, #2a1a08, #5a3010)",
            border: raidOn ? "1px solid rgba(240,120,40,0.6)" : "1px solid rgba(120,80,40,0.4)",
            boxShadow: raidOn ? "0 0 10px rgba(240,80,20,0.4)" : "none",
            cursor: (raidStatusLoading || raidToggleMutation.isPending) ? "not-allowed" : "pointer",
            transition: "all 0.3s ease",
            opacity: (raidStatusLoading || raidToggleMutation.isPending) ? 0.5 : 1,
            padding: 0,
          }}
        >
          <div style={{ position: "absolute", top: 3, left: raidOn ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", boxShadow: "0 2px 4px rgba(0,0,0,0.4)", transition: "left 0.3s ease" }} />
        </button>
      )}

      {/* Close button — smaller, top-right */}
      <button
        data-testid="button-close-raid"
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          top: 60,
          right: 14,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          zIndex: 10,
          width: 40,
          height: 40,
        }}
      >
        <img
          src={raidCloseImg}
          alt="Close"
          style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }}
          draggable={false}
        />
      </button>

      {/* Scrollable body */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 60,
          paddingBottom: 24,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {/* ── Centre area: boss display ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" }}>
          {raidBossData?.templateId ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {/* Stars — above the boss */}
              <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const filled = i < (raidBossData.rarity || 0);
                  return (
                    <img
                      key={i}
                      src={starImg}
                      alt="star"
                      width={40}
                      height={40}
                      style={{
                        opacity: filled ? 1 : 0.15,
                        filter: filled
                          ? "drop-shadow(0 0 5px rgba(240,80,40,0.9)) drop-shadow(0 0 10px rgba(220,40,20,0.6))"
                          : "grayscale(1)",
                      }}
                    />
                  );
                })}
              </div>

              {/* Boss pet — below the stars */}
              <div style={{ position: "relative" }}>
                <div style={{ width: 300, height: 300 }}>
                  <PetAnimator
                    petTemplateId={raidBossData.templateId}
                    mode="idle"
                    size={300}
                    fitVisible
                  />
                </div>
                {/* Admin: clear boss button in corner */}
                {isAdmin && (
                  <button
                    data-testid="button-clear-raid-boss-corner"
                    onClick={() => clearBossMutation.mutate()}
                    disabled={clearBossMutation.isPending}
                    style={{
                      position: "absolute", bottom: 4, right: -10,
                      height: 28, borderRadius: 8,
                      background: "linear-gradient(135deg, #5a0a0a, #a01818)",
                      border: "1px solid rgba(240,80,40,0.7)",
                      boxShadow: "0 0 8px rgba(220,40,20,0.5)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", padding: "0 10px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ color: "#fca5a5", fontSize: 10, fontFamily: "Lora, serif", fontWeight: "bold", letterSpacing: "0.06em" }}>
                      {clearBossMutation.isPending ? "…" : "Clear Boss"}
                    </span>
                  </button>
                )}
              </div>

              {/* Boss name */}
              <p style={{ fontFamily: "Lora, serif", fontSize: 14, color: "#f0c040", margin: 0, letterSpacing: "0.12em", textShadow: "0 0 16px rgba(240,160,20,0.5)" }}>
                {raidBossData.name ?? "Unknown Boss"}
              </p>

              {/* HP bar using the uploaded frame image */}
              <div style={{ position: "relative", width: 240, height: "auto" }}>
                {/* Fill bar rendered behind the frame */}
                <div style={{
                  position: "absolute",
                  top: "27%", left: "8%",
                  width: `${Math.max(0, Math.min(100, raidBossData.maxHp > 0 ? (raidBossData.hp / raidBossData.maxHp) * 100 : 0))}%`,
                  height: "46%",
                  background: "linear-gradient(90deg, #8b1a00 0%, #d63010 60%, #ff6030 100%)",
                  borderRadius: 3,
                  maxWidth: "84%",
                  transition: "width 0.5s ease",
                }} />
                <img
                  src={raidHpFrameImg}
                  alt="HP"
                  style={{ width: "100%", height: "auto", display: "block", position: "relative", zIndex: 1, pointerEvents: "none" }}
                  draggable={false}
                />
                {/* HP text */}
                <div style={{
                  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 2, fontFamily: "Lora, serif", fontSize: 11, color: "#fff",
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)", letterSpacing: "0.05em",
                }}>
                  {raidBossData.hp.toLocaleString()} / {raidBossData.maxHp.toLocaleString()}
                </div>
              </div>

            </div>
          ) : isAdmin ? (
            /* Admin, no boss set — big + centred */
            <button
              data-testid="button-set-raid-boss"
              onClick={() => setBossPickStep("pick")}
              style={{
                width: 90, height: 90, minWidth: 90, minHeight: 90,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #5a0a0a 0%, #a01818 50%, #c0391b 100%)",
                border: "2px solid rgba(240,100,40,0.7)",
                boxShadow: "0 0 30px rgba(220,60,20,0.6), 0 4px 16px rgba(0,0,0,0.7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", padding: 0, flexShrink: 0,
              }}
            >
              <span style={{ color: "#fff", fontSize: 40, lineHeight: 1, fontWeight: "bold", display: "block", marginTop: -2 }}>+</span>
            </button>
          ) : null}
        </div>

        {/* ── Boss picker 2-step modal ─────────────────────────────── */}
        {isAdmin && bossPickStep !== null && (
          <div
            onClick={() => setBossPickStep(null)}
            style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ borderRadius: 20, display: "flex", flexDirection: "column", background: "linear-gradient(160deg, rgba(10,4,20,0.98) 0%, rgba(22,8,36,0.98) 100%)", border: "1px solid rgba(240,160,40,0.35)", boxShadow: "0 0 50px rgba(200,120,20,0.2)", width: "min(92vw, 380px)", maxHeight: "75vh", overflow: "hidden" }}
            >
              {/* Modal header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid rgba(240,160,40,0.2)" }}>
                <p style={{ fontFamily: "Lora, serif", fontSize: 13, color: "#f0c040", margin: 0, letterSpacing: "0.1em" }}>
                  {bossPickStep === "pick" ? "Choose Raid Boss" : `Set HP for ${pendingBossName}`}
                </p>
                <button
                  onClick={() => setBossPickStep(null)}
                  style={{ background: "none", border: "none", color: "#a89878", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0 }}
                >✕</button>
              </div>

              {/* Step 1: pet list */}
              {bossPickStep === "pick" && (
                <div style={{ overflowY: "auto", flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {templatesList.length === 0 ? (
                    <p style={{ fontFamily: "Lora, serif", fontSize: 12, color: "#4a3a28", textAlign: "center", padding: "32px 0" }}>Loading…</p>
                  ) : templatesList.map((t) => (
                    <button
                      key={t.id}
                      data-testid={`button-pick-boss-${t.id}`}
                      onClick={() => {
                        setPendingBossId(t.id);
                        setPendingBossName(t.name);
                        setDraftHp("10000");
                        setDraftMaxHp("10000");
                        setBossPickStep("hp");
                      }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", borderRadius: 10, padding: "12px 14px", textAlign: "left", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer", transition: "background 0.15s ease" }}
                    >
                      <span style={{ fontFamily: "Lora, serif", fontSize: 13, color: "#c8b090" }}>{t.name}</span>
                      <span style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#f0c040", flexShrink: 0 }}>{(() => { const r = Math.min(5, Math.max(1, t.rarity || 1)); return "★".repeat(r) + "☆".repeat(5 - r); })()}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2: HP inputs */}
              {bossPickStep === "hp" && (
                <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 18 }}>
                  <p style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#a89878", margin: 0, textAlign: "center" }}>
                    Set the boss HP pool for this raid event
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#a89878" }}>Max HP</label>
                      <input
                        type="number" min={1} value={draftMaxHp}
                        onChange={(e) => { setDraftMaxHp(e.target.value); setDraftHp(e.target.value); }}
                        style={{ borderRadius: 10, padding: "10px 12px", fontSize: 15, fontFamily: "Lora, serif", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(240,160,40,0.35)", color: "#f0c040", outline: "none", width: "100%" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#a89878" }}>Starting HP <span style={{ color: "#5a4020", fontSize: 10 }}>(defaults to Max HP)</span></label>
                      <input
                        type="number" min={0} value={draftHp}
                        onChange={(e) => setDraftHp(e.target.value)}
                        style={{ borderRadius: 10, padding: "10px 12px", fontSize: 15, fontFamily: "Lora, serif", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(220,60,40,0.3)", color: "#f0c040", outline: "none", width: "100%" }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => setBossPickStep("pick")}
                      style={{ flex: 1, borderRadius: 10, padding: "11px 0", fontFamily: "Lora, serif", fontSize: 12, color: "#a89878", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
                    >← Back</button>
                    <button
                      data-testid="button-confirm-boss-hp"
                      onClick={saveBossAndHp}
                      disabled={bossModalSaving}
                      style={{ flex: 2, borderRadius: 10, padding: "11px 0", fontFamily: "Lora, serif", fontSize: 13, color: "#fff", background: bossModalSaving ? "rgba(120,40,20,0.5)" : "linear-gradient(135deg, #7a1a08, #c0391b)", border: "1px solid rgba(240,80,40,0.5)", cursor: bossModalSaving ? "not-allowed" : "pointer", fontWeight: "bold", letterSpacing: "0.05em" }}
                    >{bossModalSaving ? "Saving…" : "Set as Raid Boss"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Gold divider */}
        <div style={{
          width: "85%", maxWidth: 320, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(240,192,40,0.5) 30%, rgba(240,192,40,0.7) 50%, rgba(240,192,40,0.5) 70%, transparent)",
          margin: "4px 0 16px",
          flexShrink: 0,
        }} />

        {/* Leaderboard button */}
        <button
          data-testid="button-raid-leaderboard"
          onClick={() => navigate("/raid/leaderboard")}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <img
            src={raidLeaderboardImg}
            alt="Leaderboard"
            style={{
              width: 120,
              height: "auto",
              objectFit: "contain",
              filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.6))",
            }}
            draggable={false}
          />
        </button>

        {/* ── Prepare for Raid card ───────────────────────────────── */}
        <div
          style={{
            width: "100%",
            maxWidth: 360,
            marginTop: 12,
            background: "linear-gradient(180deg, rgba(6,18,8,0.93) 0%, rgba(4,14,6,0.96) 100%)",
            border: "1px solid rgba(80,160,60,0.32)",
            borderRadius: 20,
            padding: 14,
            boxShadow: "0 6px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(240,192,40,0.07)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div
              style={{
                fontFamily: "Lora, serif",
                fontSize: 13,
                letterSpacing: "0.18em",
                color: "#f0c040",
                textShadow: "0 0 12px rgba(240,160,20,0.45), 0 1px 2px rgba(0,0,0,0.85)",
              }}
              data-testid="text-prepare-for-raid"
            >
              PREPARE FOR RAID
            </div>
          </div>

          {/* ── Pets ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={13} style={{ color: "#86efac" }} />
              <span style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: "bold", color: "#86efac", fontFamily: "Lora, serif" }}>RAID PARTY</span>
            </div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }} data-testid="text-raid-pets-count">{equippedCount}/5</span>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 18 }}
            data-testid="raid-pet-slots"
          >
            {Array.from({ length: 5 }, (_, i) => {
              const invId = selectedPetIds[i];
              const inv = invId ? hatchedPets.find((p: any) => (p.inventoryId || p.id) === invId) : null;
              const isActiveSlot = i === 0;
              const isActivePetHere = isActiveSlot && !!activePetId && invId === activePetId;
              return (
                <button
                  key={i}
                  data-testid={`div-raid-pet-slot-${i}`}
                  onClick={() => {
                    if (isActivePetHere) return;
                    if (inv) togglePet(invId);
                    else setPickerOpen("pet");
                  }}
                  className="relative rounded-xl flex items-center justify-center transition-all active:scale-95 min-w-0"
                  style={{
                    aspectRatio: "1 / 1",
                    background: isActivePetHere
                      ? "rgba(251,191,36,0.16)"
                      : inv
                        ? "rgba(80,20,10,0.38)"
                        : "rgba(255,255,255,0.04)",
                    border: isActivePetHere
                      ? "2px solid rgba(251,191,36,0.85)"
                      : `1px solid ${inv ? "rgba(240,80,40,0.5)" : "rgba(255,255,255,0.10)"}`,
                    boxShadow: isActivePetHere
                      ? "0 0 14px rgba(251,191,36,0.55), inset 0 0 10px rgba(251,191,36,0.15)"
                      : inv
                        ? "0 0 10px rgba(240,80,40,0.18)"
                        : undefined,
                    cursor: "pointer",
                  }}
                >
                  {inv ? (
                    <div style={{ width: "100%", height: "100%", padding: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {(inv.hatchedImageUrl || inv.imageUrl)
                        ? <img src={inv.hatchedImageUrl || inv.imageUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
                        : <img src={petPawIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.7 }} draggable={false} />}
                    </div>
                  ) : (
                    <span style={{ fontSize: 20, color: "rgba(255,255,255,0.25)", fontWeight: 300 }}>+</span>
                  )}
                  {isActivePetHere && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: -6,
                        left: "50%",
                        transform: "translateX(-50%)",
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontSize: 7,
                        fontWeight: 900,
                        letterSpacing: "0.18em",
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        background: "rgba(120,75,8,0.95)",
                        color: "#fde68a",
                        border: "1px solid rgba(251,191,36,0.7)",
                        fontFamily: "Lora, serif",
                      }}
                    >
                      ACTIVE
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Potions ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Droplets size={13} style={{ color: "#86efac" }} />
              <span style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: "bold", color: "#86efac", fontFamily: "Lora, serif" }}>POTIONS</span>
            </div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }} data-testid="text-raid-potions-count">{selectedPotionSlots.filter(Boolean).length}/5</span>
          </div>
          <p style={{ fontFamily: "Lora, serif", fontSize: 9, color: "rgba(240,160,40,0.55)", letterSpacing: "0.08em", margin: "0 0 8px", textAlign: "center" }}>
            Drag a potion onto the raid boss during battle to use it
          </p>
          <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
            {Array.from({ length: 5 }, (_, i) => {
              const slot = selectedPotionSlots[i];
              const qty = slot?.qty ?? 0;
              const isEmpty = !slot || qty === 0;
              const isMana = slot && (slot.manaRestored ?? 0) > 0;
              const isRevive = slot && (slot.petsRevived ?? 0) > 0;
              return (
                <button
                  key={i}
                  data-testid={`div-raid-potion-slot-${i}`}
                  onClick={() => isEmpty ? setPickerOpen("potion") : removePotionSlot(i)}
                  className="relative rounded-xl flex items-center justify-center transition-all active:scale-95"
                  style={{
                    flex: 1,
                    aspectRatio: "1 / 1",
                    background: isEmpty
                      ? "rgba(255,255,255,0.04)"
                      : isRevive
                        ? "rgba(251,191,36,0.20)"
                        : isMana
                          ? "rgba(20,80,40,0.30)"
                          : "rgba(240,80,40,0.18)",
                    border: `1px solid ${isEmpty
                      ? "rgba(255,255,255,0.10)"
                      : isRevive
                        ? "rgba(251,191,36,0.55)"
                        : isMana
                          ? "rgba(74,222,128,0.55)"
                          : "rgba(240,80,40,0.5)"}`,
                    cursor: "pointer",
                  }}
                >
                  {isEmpty ? (
                    <span style={{ fontSize: 20, color: "rgba(255,255,255,0.25)", fontWeight: 300 }}>+</span>
                  ) : (
                    <>
                      {slot.imageUrl
                        ? <img src={slot.imageUrl} style={{ width: 36, height: 36, objectFit: "contain" }} />
                        : isRevive
                          ? <span style={{ fontSize: 20 }}>✨</span>
                          : isMana
                            ? <Droplets style={{ width: 22, height: 22, color: "#4ade80" }} />
                            : <Heart style={{ width: 22, height: 22, color: "#f87171", fill: "rgba(248,113,113,0.3)" }} />}
                      <div
                        data-testid={`text-raid-potion-slot-qty-${i}`}
                        style={{
                          position: "absolute",
                          bottom: -4,
                          right: -4,
                          minWidth: 20,
                          height: 18,
                          padding: "0 5px",
                          borderRadius: 9,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 900,
                          background: "rgba(0,0,0,0.85)",
                          border: `1px solid ${isRevive ? "rgba(251,191,36,0.55)" : isMana ? "rgba(74,222,128,0.55)" : "rgba(240,80,40,0.55)"}`,
                          color: isRevive ? "#fde68a" : isMana ? "#86efac" : "#fca5a5",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                        }}
                      >
                        ×{qty}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Inventory picker bottom sheet ────────────────────────── */}
      {pickerOpen && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(3px)",
          }}
          onClick={() => setPickerOpen(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "linear-gradient(180deg, #140808 0%, #0a0404 100%)",
              border: "1px solid rgba(240,80,40,0.22)",
              borderBottom: "none",
              borderRadius: "24px 24px 0 0",
              maxHeight: "calc(82 * var(--fh, 1vh))",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 20px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: "bold", letterSpacing: "0.2em", color: "#fde68a", fontFamily: "Lora, serif" }}>
                {pickerOpen === "pet" ? "CHOOSE A PET" : "CHOOSE A POTION"}
              </div>
              <button
                data-testid="button-close-raid-picker"
                onClick={() => setPickerOpen(null)}
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255,255,255,0.10)",
                  border: "none",
                  color: "rgba(255,255,255,0.65)",
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {pickerOpen === "pet" ? (
                hatchedPets.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Lora, serif" }}>
                    No hatched pets — visit your nursery!
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {hatchedPets.map((inv: any) => {
                      const invId = inv.inventoryId || inv.id;
                      const selected = selectedPetIds.includes(invId);
                      const full = !selected && equippedCount >= 5;
                      return (
                        <button
                          key={invId}
                          data-testid={`button-raid-pet-select-${invId}`}
                          disabled={full}
                          onClick={() => { togglePet(invId); if (!selected) setPickerOpen(null); }}
                          className="relative rounded-xl transition-all active:scale-95"
                          style={{
                            padding: 8,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                            background: selected
                              ? "linear-gradient(135deg, rgba(80,20,10,0.50), rgba(240,80,40,0.14))"
                              : "rgba(255,255,255,0.04)",
                            border: `1px solid ${selected ? "rgba(240,80,40,0.55)" : "rgba(255,255,255,0.08)"}`,
                            opacity: full ? 0.4 : 1,
                            cursor: full ? "not-allowed" : "pointer",
                          }}
                        >
                          {selected && (
                            <div style={{
                              position: "absolute", top: 6, right: 6,
                              width: 16, height: 16, borderRadius: "50%",
                              background: "#c0391b",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <Check size={9} style={{ color: "white" }} />
                            </div>
                          )}
                          <div style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {(inv.hatchedImageUrl || inv.imageUrl)
                              ? <img src={inv.hatchedImageUrl || inv.imageUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
                              : <img src={petPawIcon} alt="" style={{ width: 48, height: 48, objectFit: "contain" }} draggable={false} />}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 10, textAlign: "center", fontFamily: "Lora, serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                            {inv.petNickname || inv.name}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 8 }}>Lv {inv.petLevel || 1}</div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                potionStacks.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Lora, serif" }}>
                    No battle potions in your bag.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {potionStacks.map((stack) => {
                      const inv = stack.rep;
                      const isMana = (inv.manaRestored ?? 0) > 0;
                      const isRevive = (inv.petsRevived ?? 0) > 0;
                      const equippedIds = new Set(
                        selectedPotionSlots.filter((s): s is BattlePotionSlot => s !== null).map(s => s.inventoryId),
                      );
                      const isEquipped = stack.inventoryIds.some((id: string) => equippedIds.has(id));
                      const loadoutFull = selectedPotionSlots.every(s => s !== null);
                      const disabled = isEquipped || loadoutFull;
                      return (
                        <button
                          key={stack.key}
                          data-testid={`button-raid-potion-stack-${stack.key}`}
                          disabled={disabled}
                          onClick={() => equipPotion(stack.rep, stack.firstInventoryId, stack.qty)}
                          className="relative rounded-xl transition-all active:scale-95"
                          style={{
                            padding: 8,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                            background: isEquipped
                              ? (isMana
                                  ? "linear-gradient(135deg, rgba(20,80,40,0.40), rgba(74,222,128,0.12))"
                                  : isRevive
                                    ? "linear-gradient(135deg, rgba(120,75,8,0.32), rgba(251,191,36,0.10))"
                                    : "linear-gradient(135deg, rgba(80,20,10,0.40), rgba(240,80,40,0.12))")
                              : "rgba(255,255,255,0.04)",
                            border: `1px solid ${isEquipped
                              ? (isMana ? "rgba(74,222,128,0.60)" : isRevive ? "rgba(251,191,36,0.6)" : "rgba(240,80,40,0.6)")
                              : "rgba(255,255,255,0.08)"}`,
                            opacity: disabled ? 0.4 : 1,
                            cursor: disabled ? "not-allowed" : "pointer",
                          }}
                        >
                          <div
                            data-testid={`text-raid-potion-stack-count-${stack.key}`}
                            style={{
                              position: "absolute", top: 4, right: 4,
                              minWidth: 22, height: 18, padding: "0 5px",
                              borderRadius: 9,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 900,
                              background: "rgba(0,0,0,0.7)",
                              border: `1px solid ${isMana ? "rgba(74,222,128,0.50)" : isRevive ? "rgba(251,191,36,0.5)" : "rgba(240,80,40,0.5)"}`,
                              color: isMana ? "#86efac" : isRevive ? "#fde68a" : "#fca5a5",
                            }}
                          >
                            ×{isEquipped ? 0 : stack.qty}
                          </div>
                          <div style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {inv.imageUrl
                              ? <img src={inv.imageUrl} style={{ width: 44, height: 44, objectFit: "contain" }} />
                              : isMana
                                ? <Droplets style={{ width: 28, height: 28, color: "#4ade80" }} />
                                : isRevive
                                  ? <span style={{ fontSize: 24 }}>✨</span>
                                  : <Heart style={{ width: 28, height: 28, color: "#f87171", fill: "rgba(248,113,113,0.3)" }} />}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 10, textAlign: "center", fontFamily: "Lora, serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                            {inv.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
