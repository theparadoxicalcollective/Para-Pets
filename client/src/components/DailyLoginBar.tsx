import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { X, Search, Plus } from "lucide-react";

import rainforestBanner from "@assets/daily_login_rainforest_banner.png";
import claimedIcon      from "@assets/daily_login_claimed_icon.png";
import coinIconImg      from "@assets/icon_coin.png";
import coinPack100      from "@assets/coin_pack_100.png";
import coinPack500      from "@assets/coin_pack_500.png";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DayReward {
  day_number: number;
  coin_amount: number;
  items: { id: string; name: string; imageUrl: string | null; type: string; quantity: number }[];
}

interface LoginStatus {
  totalClaims: number;
  currentCycle: number;
  nextDay: number;
  canClaim: boolean;
  lastClaimedAt: string | null;
  nextClaimAt: string | null;
  claimedDaysInCycle: number[];
}

interface ShopItem {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
  rarity: number | null;
  price: number;
}

// ── Item type tabs ────────────────────────────────────────────────────────────
const ITEM_TABS = [
  { key: "all",       label: "All"      },
  { key: "pet",       label: "Pets"     },
  { key: "fishing",   label: "Fishing"  },
  { key: "heal",      label: "Healing"  },
  { key: "decor",     label: "Décor"    },
  { key: "other",     label: "Other"    },
];

function matchTab(type: string, tab: string): boolean {
  if (tab === "all") return true;
  if (tab === "pet") return type === "pet";
  if (tab === "fishing") return ["bait", "fishing_pole", "fish"].includes(type);
  if (tab === "heal") return ["heal", "stat_boost", "potion", "revive"].includes(type);
  if (tab === "decor") return ["decoration", "house_bundle"].includes(type);
  return !["pet", "bait", "fishing_pole", "fish", "heal", "stat_boost", "potion", "revive", "decoration", "house_bundle"].includes(type);
}

// ── Countdown label ───────────────────────────────────────────────────────────
// nextClaimAt is the server-computed timestamp at which the next claim unlocks,
// so no client-side timezone arithmetic is needed.
function useCountdown(nextClaimAt: string | null): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!nextClaimAt) { setLabel(""); return; }
    const target = new Date(nextClaimAt).getTime();
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) { setLabel(""); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLabel(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextClaimAt]);
  return label;
}

// ── Claim success burst ───────────────────────────────────────────────────────
function ClaimBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1600); return () => clearTimeout(t); }, [onDone]);
  return (
    <div
      className="fixed inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 99999 }}
    >
      <div style={{
        background: "radial-gradient(ellipse at center, rgba(80,220,120,0.35) 0%, transparent 70%)",
        width: 320, height: 320, borderRadius: "50%",
        animation: "burst-expand 1.4s ease-out forwards",
        position: "absolute",
      }} />
      <img src={coinPack500} alt="" style={{
        width: 100, height: 100, objectFit: "contain",
        animation: "burst-pop 1.4s ease-out forwards",
        filter: "drop-shadow(0 0 30px rgba(80,220,120,0.8))",
        position: "relative",
      }} />
    </div>
  );
}

// ── Admin day editor modal ────────────────────────────────────────────────────
function AdminDayEditor({
  day, reward, onClose,
}: {
  day: number;
  reward: DayReward;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [coinAmount, setCoinAmount] = useState(String(reward.coin_amount));
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  const { data: allItems = [] } = useQuery<ShopItem[]>({
    queryKey: ["/api/admin/shop-items-all"],
  });

  const saveCoinsMut = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/daily-login/${day}`, { coinAmount: parseInt(coinAmount) || 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/daily-login/config"] });
      toast({ title: "Coins saved!" });
    },
  });

  const addItemMut = useMutation({
    mutationFn: (shopItemId: string) =>
      apiRequest("POST", `/api/admin/daily-login/${day}/items`, { shopItemId, quantity: qty }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/daily-login/config"] }),
  });

  const removeItemMut = useMutation({
    mutationFn: (shopItemId: string) =>
      apiRequest("DELETE", `/api/admin/daily-login/${day}/items/${shopItemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/daily-login/config"] }),
  });

  const filtered = allItems.filter(it =>
    matchTab(it.type, tab) &&
    (!search || it.name.toLowerCase().includes(search.toLowerCase()))
  );

  const existingIds = new Set(reward.items.map(i => i.id));

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 99998, background: "rgba(4,8,12,0.88)", backdropFilter: "blur(10px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col"
        style={{
          maxHeight: "88vh",
          background: "linear-gradient(160deg, #060d0a 0%, #030a06 100%)",
          border: "1px solid rgba(80,180,100,0.25)",
          borderBottom: "none",
          boxShadow: "0 -8px 60px rgba(0,0,0,0.8), 0 0 40px rgba(40,160,80,0.1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(80,180,100,0.12)" }}>
          <div>
            <p className="font-fantasy text-xs tracking-widest" style={{ color: "#4a8a60" }}>EDITING</p>
            <h3 className="font-fantasy text-base tracking-wider" style={{ color: "#7fbfb0" }}>
              Day {day} Rewards
            </h3>
          </div>
          <button onClick={onClose} data-testid="button-close-day-editor"
            className="rounded-full p-2 transition-all active:scale-90"
            style={{ background: "rgba(80,180,100,0.1)", color: "#4a8a60" }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: "none" }}>
          {/* Coins section */}
          <div>
            <p className="font-fantasy text-[10px] tracking-widest uppercase mb-2" style={{ color: "#4a8a60" }}>
              Coin Reward
            </p>
            <div className="flex gap-2 items-center">
              <img src={coinIconImg} alt="coins" style={{ width: 20, height: 20, objectFit: "contain" }} />
              <input
                type="number"
                value={coinAmount}
                onChange={e => setCoinAmount(e.target.value)}
                min={0}
                data-testid={`input-coin-amount-day-${day}`}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{
                  background: "rgba(80,180,100,0.08)",
                  border: "1px solid rgba(80,180,100,0.2)",
                  color: "#f0c040",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={() => saveCoinsMut.mutate()}
                disabled={saveCoinsMut.isPending}
                data-testid={`button-save-coins-day-${day}`}
                className="rounded-xl px-4 py-2.5 font-fantasy text-xs tracking-wider transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, rgba(240,192,64,0.25) 0%, rgba(180,130,20,0.2) 100%)",
                  border: "1px solid rgba(240,192,64,0.4)",
                  color: "#f0c040",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>

          {/* Current items */}
          {reward.items.length > 0 && (
            <div>
              <p className="font-fantasy text-[10px] tracking-widest uppercase mb-2" style={{ color: "#4a8a60" }}>
                Current Items
              </p>
              <div className="flex flex-wrap gap-2">
                {reward.items.map(item => (
                  <div key={item.id} className="flex items-center gap-1.5 rounded-xl px-2 py-1.5"
                    style={{ background: "rgba(80,180,100,0.08)", border: "1px solid rgba(80,180,100,0.18)" }}>
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt={item.name}
                        style={{ width: 22, height: 22, objectFit: "contain" }} />
                    )}
                    <span className="font-fantasy text-[10px]" style={{ color: "#7fbfb0" }}>
                      {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ""}
                    </span>
                    <button
                      onClick={() => removeItemMut.mutate(item.id)}
                      data-testid={`button-remove-item-${item.id}`}
                      className="ml-0.5 rounded-full transition-all active:scale-90"
                      style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: 2 }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quantity picker */}
          <div className="flex items-center gap-3">
            <p className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "#4a8a60" }}>
              Qty to add:
            </p>
            <input
              type="number"
              value={qty}
              onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              data-testid="input-item-quantity"
              className="w-16 rounded-xl px-3 py-1.5 text-xs outline-none text-center"
              style={{
                background: "rgba(80,180,100,0.08)",
                border: "1px solid rgba(80,180,100,0.2)",
                color: "#c8d8b0",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Type tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {ITEM_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                data-testid={`tab-${t.key}`}
                className="flex-shrink-0 rounded-xl px-3 py-1.5 font-fantasy text-[10px] tracking-wider transition-all"
                style={{
                  background: tab === t.key ? "rgba(80,180,100,0.2)" : "rgba(80,180,100,0.05)",
                  border: `1px solid ${tab === t.key ? "rgba(80,180,100,0.45)" : "rgba(80,180,100,0.1)"}`,
                  color: tab === t.key ? "#7fbfb0" : "#3a6050",
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "#3a6050" }} />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-item-search"
              className="w-full rounded-xl pl-8 pr-4 py-2.5 text-xs outline-none"
              style={{
                background: "rgba(80,180,100,0.06)",
                border: "1px solid rgba(80,180,100,0.15)",
                color: "#c8d8b0",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Item grid */}
          <div className="grid grid-cols-2 gap-2 pb-4">
            {filtered.slice(0, 60).map(item => {
              const alreadyAdded = existingIds.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => { if (!alreadyAdded) addItemMut.mutate(item.id); }}
                  disabled={alreadyAdded || addItemMut.isPending}
                  data-testid={`item-picker-${item.id}`}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-all active:scale-95"
                  style={{
                    background: alreadyAdded ? "rgba(80,180,100,0.14)" : "rgba(80,180,100,0.05)",
                    border: `1px solid ${alreadyAdded ? "rgba(80,180,100,0.4)" : "rgba(80,180,100,0.1)"}`,
                    cursor: alreadyAdded ? "default" : "pointer",
                  }}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name}
                      style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(80,180,100,0.1)", flexShrink: 0 }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-fantasy text-[10px] leading-tight truncate"
                      style={{ color: alreadyAdded ? "#7fbfb0" : "#5a8870" }}>
                      {item.name}
                    </p>
                    <p className="font-fantasy text-[9px]" style={{ color: "#2a5040" }}>
                      {item.type}
                    </p>
                  </div>
                  {alreadyAdded && (
                    <span style={{ color: "#4ade80", fontSize: 13 }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main DailyLoginBar ────────────────────────────────────────────────────────
export default function DailyLoginBar({
  user,
  onSignInRequest,
}: {
  user: { id: string; isAdmin?: boolean } | null | undefined;
  onSignInRequest?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editDay, setEditDay] = useState<number | null>(null);
  const [showBurst, setShowBurst] = useState(false);

  const { data: rewards = [] } = useQuery<DayReward[]>({
    queryKey: ["/api/daily-login/config"],
    staleTime: 30_000,
  });

  const { data: status } = useQuery<LoginStatus>({
    queryKey: ["/api/daily-login/status"],
    enabled: !!user && !user.isAdmin,
    retry: false,
  });

  const claimMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/daily-login/claim"),
    onSuccess: async (res) => {
      const data = await res.json();
      await qc.invalidateQueries({ queryKey: ["/api/daily-login/status"] });
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setShowBurst(true);
      toast({
        title: `Day ${data.day} Reward Claimed! 🌿`,
        description: [
          data.coinAmount > 0 ? `+${data.coinAmount} coins` : "",
          data.items?.length > 0 ? `${data.items.length} item(s) added to your bag` : "",
        ].filter(Boolean).join(" · "),
      });
    },
    onError: (err: any) => {
      const msg = err?.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      toast({
        title: "Cannot Claim",
        description: parsed.message || "Come back in 24 hours!",
        variant: "destructive",
      });
    },
  });

  const countdown = useCountdown(status?.nextClaimAt ?? null);
  const isAdmin = user?.isAdmin;

  const getDayState = (dayNum: number): "claimed" | "current" | "locked" => {
    if (!user || isAdmin) return "locked";
    if (status?.claimedDaysInCycle?.includes(dayNum)) return "claimed";
    if (status?.nextDay === dayNum) return "current";
    return "locked";
  };

  const editReward = rewards.find(r => r.day_number === editDay);

  return (
    <>
      {/* Burst animation overlay */}
      {showBurst && <ClaimBurst onDone={() => setShowBurst(false)} />}

      {/* Admin editor modal */}
      {editDay !== null && editReward && (
        <AdminDayEditor
          day={editDay}
          reward={editReward}
          onClose={() => setEditDay(null)}
        />
      )}

      <style>{`
        @keyframes burst-expand {
          from { transform: scale(0); opacity: 1; }
          to   { transform: scale(3); opacity: 0; }
        }
        @keyframes burst-pop {
          0%   { transform: scale(0.4) translateY(20px); opacity: 0; }
          40%  { transform: scale(1.3) translateY(-10px); opacity: 1; }
          70%  { transform: scale(0.95) translateY(0); opacity: 1; }
          100% { transform: scale(0) translateY(-30px); opacity: 0; }
        }
        @keyframes daily-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(80,220,120,0.5), 0 0 20px rgba(80,220,120,0.25); }
          50%       { box-shadow: 0 0 0 6px rgba(80,220,120,0), 0 0 30px rgba(80,220,120,0.4); }
        }
        @keyframes daily-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <div
        data-testid="daily-login-bar"
        className="mx-auto w-full max-w-3xl mb-6"
        style={{ padding: "0 0" }}
      >
        {/* Rainforest banner header */}
        <div className="relative w-full overflow-hidden" style={{ borderRadius: "20px 20px 0 0", height: 72 }}>
          <img
            src={rainforestBanner}
            alt="Daily Login"
            className="w-full h-full object-cover"
            style={{ objectPosition: "center 60%", filter: "brightness(0.75) saturate(1.3)" }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "linear-gradient(to bottom, rgba(4,12,8,0.5) 0%, rgba(4,12,8,0.3) 100%)" }}>
            <p className="font-fantasy text-xs tracking-[0.3em] uppercase"
              style={{ color: "#4ade80", textShadow: "0 0 12px rgba(74,222,128,0.6)" }}>
              Daily Login Rewards
            </p>
            <p className="font-fantasy text-[10px] tracking-widest mt-0.5"
              style={{ color: "rgba(200,230,210,0.6)" }}>
              {isAdmin
                ? "Configure rewards for each day"
                : !user
                ? "Sign in to claim daily rewards"
                : status?.canClaim
                ? `Day ${status.nextDay} is ready to claim!`
                : countdown
                ? `Next reward in ${countdown}`
                : "You've completed a full week!"}
            </p>
          </div>
        </div>

        {/* Day cards row */}
        <div
          style={{
            background: "linear-gradient(180deg, rgba(8,20,12,0.96) 0%, rgba(4,12,8,0.98) 100%)",
            border: "1px solid rgba(80,180,100,0.18)",
            borderTop: "none",
            borderRadius: "0 0 20px 20px",
            padding: "14px 8px 16px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 5,
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            {(rewards.length > 0 ? rewards : Array.from({ length: 7 }, (_, i) => ({ day_number: i + 1, coin_amount: 0, items: [] }))).map(reward => {
              const dayState = getDayState(reward.day_number);
              const isClaimed = dayState === "claimed";
              const isCurrent = dayState === "current";
              const isLocked = dayState === "locked";

              const borderColor = isClaimed
                ? "rgba(74,222,128,0.5)"
                : isCurrent
                ? "rgba(80,220,120,0.7)"
                : "rgba(80,180,100,0.12)";

              const bg = isClaimed
                ? "linear-gradient(160deg, rgba(10,40,18,0.95) 0%, rgba(6,28,12,0.95) 100%)"
                : isCurrent
                ? "linear-gradient(160deg, rgba(15,50,22,0.98) 0%, rgba(8,35,14,0.98) 100%)"
                : "linear-gradient(160deg, rgba(6,16,10,0.9) 0%, rgba(4,10,6,0.9) 100%)";

              return (
                <div
                  key={reward.day_number}
                  data-testid={`day-card-${reward.day_number}`}
                  className="flex flex-col items-center relative"
                  style={{
                    minHeight: 108,
                    borderRadius: 16,
                    background: bg,
                    border: `1.5px solid ${borderColor}`,
                    boxShadow: isCurrent
                      ? "0 0 0 0 rgba(80,220,120,0.5), 0 0 20px rgba(80,220,120,0.25)"
                      : "none",
                    animation: isCurrent ? "daily-pulse 2.2s ease-in-out infinite" : "none",
                    transition: "all 0.2s ease",
                    padding: "10px 6px 10px",
                    opacity: isLocked && !isAdmin ? 0.65 : 1,
                  }}
                >
                  {/* Day label */}
                  <p
                    className="font-fantasy tracking-wider text-center"
                    style={{
                      fontSize: 9,
                      color: isCurrent ? "#4ade80" : isClaimed ? "#22c55e" : "#2a5040",
                      letterSpacing: "0.15em",
                    }}
                  >
                    DAY {reward.day_number}
                  </p>

                  {/* Icon area */}
                  <div className="flex items-center justify-center my-1.5" style={{ height: 38 }}>
                    {isClaimed ? (
                      <img src={claimedIcon} alt="Claimed"
                        style={{ width: 36, height: 36, objectFit: "contain",
                          filter: "drop-shadow(0 0 8px rgba(74,222,128,0.5))" }} />
                    ) : (
                      reward.items.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-0.5" style={{ maxWidth: 66 }}>
                          {reward.items.slice(0, 4).map(item => (
                            <img key={item.id} src={item.imageUrl || chestIcon} alt={item.name}
                              style={{
                                width: reward.items.length === 1 ? 32 : 18,
                                height: reward.items.length === 1 ? 32 : 18,
                                objectFit: "contain",
                                filter: isLocked && !isAdmin ? "grayscale(0.7)" : "none",
                              }} />
                          ))}
                        </div>
                      ) : (
                        <img
                          src={reward.coin_amount >= 500 ? coinPack500 : coinPack100}
                          alt="Coins"
                          style={{
                            width: 32, height: 32, objectFit: "contain",
                            filter: isLocked && !isAdmin
                              ? "grayscale(0.7) brightness(0.6)"
                              : "drop-shadow(0 0 8px rgba(240,192,64,0.4))",
                          }}
                        />
                      )
                    )}
                  </div>

                  {/* Coin amount */}
                  {reward.coin_amount > 0 && (
                    <div className="flex items-center gap-0.5 justify-center mb-1.5">
                      <img src={coinIconImg} alt="coins"
                        style={{ width: 10, height: 10, objectFit: "contain" }} />
                      <span className="font-fantasy" style={{ fontSize: 9, color: "#f0c040" }}>
                        {reward.coin_amount}
                      </span>
                    </div>
                  )}

                  {/* Action / status */}
                  {isAdmin ? (
                    <button
                      onClick={() => setEditDay(reward.day_number)}
                      data-testid={`button-edit-day-${reward.day_number}`}
                      className="w-full flex items-center justify-center gap-1 rounded-xl transition-all active:scale-90"
                      style={{
                        marginTop: "auto",
                        padding: "5px 4px",
                        background: "rgba(80,180,100,0.12)",
                        border: "1px solid rgba(80,180,100,0.25)",
                        cursor: "pointer",
                        color: "#4a8a60",
                      }}
                    >
                      <Plus size={11} />
                      <span className="font-fantasy" style={{ fontSize: 8 }}>Edit</span>
                    </button>
                  ) : isClaimed ? (
                    <div className="flex items-center justify-center gap-0.5 mt-auto">
                      <span style={{ fontSize: 8, color: "#4ade80", fontFamily: "inherit" }}>✓ Done</span>
                    </div>
                  ) : isCurrent && status?.canClaim ? (
                    <button
                      onClick={() => claimMut.mutate()}
                      disabled={claimMut.isPending}
                      data-testid={`button-claim-day-${reward.day_number}`}
                      className="w-full rounded-xl font-fantasy tracking-wider transition-all active:scale-90"
                      style={{
                        marginTop: "auto",
                        padding: "5px 4px",
                        fontSize: 9,
                        background: "linear-gradient(135deg, rgba(74,222,128,0.3) 0%, rgba(34,197,94,0.2) 100%)",
                        border: "1px solid rgba(74,222,128,0.5)",
                        color: "#4ade80",
                        cursor: "pointer",
                        textShadow: "0 0 8px rgba(74,222,128,0.4)",
                      }}
                    >
                      {claimMut.isPending ? "..." : "CLAIM"}
                    </button>
                  ) : isCurrent && countdown ? (
                    <div className="flex flex-col items-center justify-center mt-auto gap-0.5">
                      <span style={{ fontSize: 7, color: "#4a7060", fontFamily: "inherit", letterSpacing: "0.05em" }}>Next in</span>
                      <span style={{ fontSize: 7, color: "#5a9070", fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.02em", lineHeight: 1.2 }}>{countdown}</span>
                    </div>
                  ) : !user ? (
                    <button
                      onClick={onSignInRequest}
                      data-testid={`button-signin-day-${reward.day_number}`}
                      className="w-full rounded-xl font-fantasy tracking-wider transition-all active:scale-90"
                      style={{
                        marginTop: "auto",
                        padding: "5px 4px",
                        fontSize: 8,
                        background: "rgba(80,180,100,0.06)",
                        border: "1px solid rgba(80,180,100,0.15)",
                        color: "#2a5040",
                        cursor: "pointer",
                      }}
                    >
                      Sign In
                    </button>
                  ) : (
                    <div style={{ height: 24 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
