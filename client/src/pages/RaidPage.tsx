import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, Droplets, Heart, Check } from "lucide-react";
import type { BattlePotionSlot } from "@/components/BattleArena";
import raidBg from "@assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png";
import raidIconImg from "@assets/Photoroom_20260711_52200_PM_1783810844517.png";
import raidCloseImg from "@assets/Photoroom_20260711_90748_PM_1783822223263.png";
import raidLeaderboardImg from "@assets/Photoroom_20260711_90837_PM_1783822223263.png";
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
  const [showBossModal, setShowBossModal] = useState(false);
  const { data: raidStatusData, isLoading: raidStatusLoading } = useQuery<{ raidVisible: boolean }>({
    queryKey: ["/api/raid-status"],
    staleTime: 10 * 1000,
    enabled: isAdmin,
  });
  const raidOn = raidStatusData?.raidVisible === true;
  const { data: raidBossData, refetch: refetchRaidBoss } = useQuery<{ templateId: string | null; rarity: number | null; name: string | null; hp: number; maxHp: number }>({
    queryKey: ["/api/raid-boss"],
    staleTime: 10 * 1000,
    enabled: isAdmin,
  });
  const { data: templatesList = [] } = useQuery<{ id: string; name: string; rarity: number }[]>({
    queryKey: ["/api/admin/templates-list"],
    enabled: isAdmin && showBossModal,
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
  const setBossMutation = useMutation({
    mutationFn: async (templateId: string | null) => {
      const res = await apiRequest("POST", "/api/admin/raid-boss", { templateId });
      return res.json();
    },
    onSuccess: () => { refetchRaidBoss(); setShowBossModal(false); toast({ title: "Raid Boss updated" }); },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  // HP controls local state
  const [localHp, setLocalHp] = useState("");
  const [localMax, setLocalMax] = useState("");
  const [hpSaving, setHpSaving] = useState(false);
  useEffect(() => {
    if (raidBossData) {
      setLocalHp(String(raidBossData.hp ?? 0));
      setLocalMax(String(raidBossData.maxHp ?? 10000));
    }
  }, [raidBossData?.hp, raidBossData?.maxHp]);
  const saveHp = async () => {
    setHpSaving(true);
    try {
      const res = await apiRequest("POST", "/api/admin/raid-boss-hp", { hp: parseInt(localHp, 10) || 0, maxHp: parseInt(localMax, 10) || 1 });
      if (!res.ok) throw new Error("Failed");
      refetchRaidBoss();
      toast({ title: "Raid Boss HP updated" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setHpSaving(false); }
  };
  const hpPct = Math.max(0, Math.min(100, (parseInt(localHp, 10) || 0) / Math.max(1, parseInt(localMax, 10) || 1) * 100));

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

      {/* Close button — comfortably below the top */}
      <button
        data-testid="button-close-raid"
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          top: 56,
          right: 16,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          zIndex: 10,
          width: 52,
          height: 52,
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
          padding: "60px 16px 32px",
          gap: 20,
        }}
      >
        {/* Header — icon + title */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 16 }}>
          <img
            src={raidIconImg}
            alt="Raid"
            style={{
              width: 110,
              height: 110,
              objectFit: "contain",
              filter: "drop-shadow(0 0 24px rgba(251,191,36,0.75)) drop-shadow(0 0 8px rgba(0,0,0,0.8))",
            }}
          />
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontFamily: "Lora, serif",
                fontSize: 10,
                letterSpacing: "0.35em",
                color: "#7a4520",
                textTransform: "uppercase",
                margin: "0 0 4px",
              }}
            >
              World Event
            </p>
            <h1
              style={{
                fontFamily: "Lora, serif",
                fontSize: 34,
                color: "#f0c040",
                letterSpacing: "0.12em",
                margin: 0,
                textShadow: "0 0 30px rgba(240,100,20,0.8), 0 0 8px rgba(0,0,0,1)",
              }}
            >
              RAID
            </h1>
          </div>
        </div>

        {/* ── Admin controls (only visible to admins) ─────────────── */}
        {isAdmin && (
          <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Label */}
            <p style={{ fontFamily: "Lora, serif", fontSize: 10, letterSpacing: "0.3em", color: "#f87171", textTransform: "uppercase", textAlign: "center", margin: 0 }}>Admin Controls</p>

            {/* Toggle + Boss row */}
            <div style={{ borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, background: raidOn ? "linear-gradient(145deg, rgba(30,10,8,0.92) 0%, rgba(50,18,8,0.92) 100%)" : "linear-gradient(145deg, rgba(10,8,20,0.92) 0%, rgba(16,10,30,0.92) 100%)", border: raidOn ? "1px solid rgba(240,120,40,0.4)" : "1px solid rgba(120,80,40,0.25)", transition: "all 0.4s ease" }}>
              {/* Toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <p style={{ fontFamily: "Lora, serif", fontSize: 13, color: raidOn ? "#f97316" : "#a89878", margin: 0 }}>Raid Icon</p>
                  <p style={{ fontFamily: "Lora, serif", fontSize: 10, color: raidOn ? "#7a3010" : "#3a2a18", margin: "2px 0 0" }}>
                    {raidStatusLoading ? "Checking…" : raidOn ? "Visible to players" : "Hidden from players"}
                  </p>
                </div>
                <button
                  data-testid="button-toggle-raid"
                  onClick={() => raidToggleMutation.mutate(!raidOn)}
                  disabled={raidStatusLoading || raidToggleMutation.isPending}
                  style={{ position: "relative", flexShrink: 0, width: 52, height: 28, borderRadius: 14, background: raidOn ? "linear-gradient(135deg, #7a2808, #c0391b)" : "linear-gradient(135deg, #2a1a08, #5a3010)", border: raidOn ? "1px solid rgba(240,120,40,0.5)" : "1px solid rgba(120,80,40,0.3)", boxShadow: raidOn ? "0 0 10px rgba(240,80,20,0.3)" : "none", cursor: (raidStatusLoading || raidToggleMutation.isPending) ? "not-allowed" : "pointer", transition: "all 0.3s ease", opacity: (raidStatusLoading || raidToggleMutation.isPending) ? 0.5 : 1 }}
                >
                  <div style={{ position: "absolute", top: 3, left: raidOn ? 26 : 3, width: 20, height: 20, borderRadius: "50%", background: "white", boxShadow: "0 2px 4px rgba(0,0,0,0.4)", transition: "left 0.3s ease" }} />
                </button>
              </div>

              {/* Raid Boss row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTop: "1px solid rgba(240,120,40,0.15)" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#a89878", margin: 0 }}>Raid Boss</p>
                  {raidBossData?.templateId ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <p style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#f0c040", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{raidBossData.name ?? "Unknown"}</p>
                      <span style={{ fontFamily: "Lora, serif", fontSize: 10, color: "#f0c040", flexShrink: 0 }}>{"★".repeat(raidBossData.rarity ?? 1)}{"☆".repeat(Math.max(0, 5 - (raidBossData.rarity ?? 1)))}</span>
                    </div>
                  ) : (
                    <p style={{ fontFamily: "Lora, serif", fontSize: 10, color: "#3a2a18", margin: "2px 0 0" }}>No boss set</p>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {raidBossData?.templateId && (
                    <button data-testid="button-clear-raid-boss" onClick={() => setBossMutation.mutate(null)} disabled={setBossMutation.isPending} style={{ background: "rgba(180,40,20,0.25)", border: "1px solid rgba(240,80,40,0.3)", borderRadius: 8, color: "#f87171", fontFamily: "Lora, serif", fontSize: 11, padding: "4px 10px", cursor: "pointer" }}>Clear</button>
                  )}
                  <button data-testid="button-set-raid-boss" onClick={() => setShowBossModal(true)} disabled={setBossMutation.isPending} style={{ background: "linear-gradient(135deg, rgba(180,100,20,0.5), rgba(240,160,40,0.3))", border: "1px solid rgba(240,160,40,0.5)", borderRadius: 8, color: "#f0c040", fontFamily: "Lora, serif", fontSize: 15, fontWeight: "bold", padding: "3px 12px", cursor: "pointer" }}>+</button>
                </div>
              </div>
            </div>

            {/* HP controls — only shown when a boss is set */}
            {raidBossData?.templateId && (
              <div style={{ borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, background: "linear-gradient(145deg, rgba(30,8,8,0.92) 0%, rgba(50,12,12,0.92) 100%)", border: "1px solid rgba(220,60,40,0.3)" }}>
                <p style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#f87171", margin: 0 }}>Boss HP</p>
                <div style={{ height: 6, borderRadius: 4, background: "rgba(0,0,0,0.5)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${hpPct}%`, background: "linear-gradient(90deg, #8b0000, #e74c3c)", borderRadius: 4, transition: "width 0.3s" }} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                    <label style={{ fontFamily: "Lora, serif", fontSize: 10, color: "#a89878" }}>Current HP</label>
                    <input type="number" min={0} value={localHp} onChange={(e) => setLocalHp(e.target.value)} style={{ borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: "Lora, serif", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(220,60,40,0.3)", color: "#f0c040", outline: "none", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                    <label style={{ fontFamily: "Lora, serif", fontSize: 10, color: "#a89878" }}>Max HP</label>
                    <input type="number" min={1} value={localMax} onChange={(e) => setLocalMax(e.target.value)} style={{ borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: "Lora, serif", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(220,60,40,0.3)", color: "#f0c040", outline: "none", width: "100%" }} />
                  </div>
                  <button onClick={saveHp} disabled={hpSaving} style={{ background: "linear-gradient(135deg, #7a1a08, #c0391b)", border: "1px solid rgba(240,80,40,0.5)", borderRadius: 8, color: "#fff", fontFamily: "Lora, serif", fontSize: 11, padding: "6px 14px", cursor: hpSaving ? "not-allowed" : "pointer", opacity: hpSaving ? 0.6 : 1, flexShrink: 0 }}>{hpSaving ? "…" : "Save"}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Boss picker modal */}
        {isAdmin && showBossModal && (
          <div onClick={() => setShowBossModal(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ borderRadius: 16, display: "flex", flexDirection: "column", background: "linear-gradient(160deg, rgba(10,4,20,0.98) 0%, rgba(20,8,35,0.98) 100%)", border: "1px solid rgba(240,160,40,0.35)", boxShadow: "0 0 40px rgba(200,120,20,0.15)", width: "min(92vw, 380px)", maxHeight: "70vh", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(240,160,40,0.2)" }}>
                <p style={{ fontFamily: "Lora, serif", fontSize: 13, color: "#f0c040", margin: 0, letterSpacing: "0.1em" }}>Choose Raid Boss</p>
                <button onClick={() => setShowBossModal(false)} style={{ background: "none", border: "none", color: "#a89878", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}>✕</button>
              </div>
              <div style={{ overflowY: "auto", flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {templatesList.length === 0 ? (
                  <p style={{ fontFamily: "Lora, serif", fontSize: 12, color: "#4a3a28", textAlign: "center", padding: "24px 0" }}>Loading…</p>
                ) : templatesList.map((t) => (
                  <button key={t.id} data-testid={`button-pick-boss-${t.id}`} onClick={() => setBossMutation.mutate(t.id)} disabled={setBossMutation.isPending} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", borderRadius: 10, padding: "10px 12px", textAlign: "left", background: raidBossData?.templateId === t.id ? "linear-gradient(135deg, rgba(180,120,20,0.4), rgba(240,160,40,0.2))" : "rgba(255,255,255,0.03)", border: raidBossData?.templateId === t.id ? "1px solid rgba(240,160,40,0.5)" : "1px solid rgba(255,255,255,0.06)", cursor: "pointer", transition: "all 0.15s ease" }}>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 12, color: raidBossData?.templateId === t.id ? "#f0c040" : "#c8b090" }}>{t.name}</span>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#f0c040", flexShrink: 0 }}>{"★".repeat(t.rarity ?? 1)}{"☆".repeat(Math.max(0, 5 - (t.rarity ?? 1)))}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard button */}
        <button
          data-testid="button-raid-leaderboard"
          onClick={() => {/* leaderboard panel — future */ }}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <img
            src={raidLeaderboardImg}
            alt="Leaderboard"
            style={{
              width: 200,
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
            background: "linear-gradient(180deg, rgba(20,6,6,0.88) 0%, rgba(10,4,4,0.92) 100%)",
            border: "1px solid rgba(240,80,40,0.22)",
            borderRadius: 20,
            padding: 14,
            boxShadow: "0 6px 22px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div
              style={{
                fontFamily: "Lora, serif",
                fontSize: 13,
                letterSpacing: "0.18em",
                color: "#f0c040",
                textShadow: "0 1px 2px rgba(0,0,0,0.85)",
              }}
              data-testid="text-prepare-for-raid"
            >
              PREPARE FOR RAID
            </div>
          </div>

          {/* ── Pets ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={13} style={{ color: "#fca5a5" }} />
              <span style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: "bold", color: "#fca5a5", fontFamily: "Lora, serif" }}>RAID PARTY</span>
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
              <Droplets size={13} style={{ color: "#fca5a5" }} />
              <span style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: "bold", color: "#fca5a5", fontFamily: "Lora, serif" }}>POTIONS</span>
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
