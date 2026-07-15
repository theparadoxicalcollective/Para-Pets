import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import raidBg from "@assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png";
import raidCloseImg from "@assets/Photoroom_20260711_90748_PM_1783822223263.png";
import pvpLeaderboardBg from "@assets/Photoroom_20260707_64358_AM_1783425094349.png";
import rank1Icon from "@assets/Photoroom_20260707_64701_AM_1783425136780.png";
import rank2Icon from "@assets/Photoroom_20260707_64734_AM_1783425136780.png";
import rank3Icon from "@assets/Photoroom_20260707_64923_AM_1783425136780.png";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import coinIconImg from "@assets/icon_coin.png";

interface RaidLeaderboardEntry {
  userId: string;
  username: string;
  profileImage: string | null;
  totalDamage: number;
}

interface RaidRewardItem {
  shopItemId: string;
  name: string;
  imageUrl: string | null;
}

interface RaidRewardTier {
  key: string;
  label: string;
  rankFrom: number;
  rankTo: number | null;
  coins: number;
  items: RaidRewardItem[];
}

const TIER_VISUALS: Record<string, { color: string; glow: string; bg: string; border: string }> = {
  t1: { color: "#f0c040", glow: "rgba(240,192,64,0.5)",  bg: "rgba(80,58,4,0.55)",   border: "rgba(240,192,64,0.5)"  },
  t2: { color: "#c8d4e8", glow: "rgba(200,212,232,0.4)", bg: "rgba(32,42,60,0.55)",  border: "rgba(180,200,232,0.4)" },
  t3: { color: "#d88c50", glow: "rgba(216,140,80,0.4)",  bg: "rgba(64,32,12,0.55)",  border: "rgba(205,127,50,0.45)" },
  t4: { color: "#7eacd4", glow: "rgba(126,172,212,0.35)",bg: "rgba(18,32,52,0.55)",  border: "rgba(100,150,200,0.4)" },
  t5: { color: "#98c0a0", glow: "rgba(152,192,160,0.35)",bg: "rgba(14,40,20,0.55)",  border: "rgba(100,170,110,0.4)" },
  t6: { color: "#b8a0cc", glow: "rgba(184,160,204,0.35)",bg: "rgba(36,16,52,0.55)",  border: "rgba(160,120,200,0.4)" },
  t7: { color: "#90a8b8", glow: "rgba(144,168,184,0.3)", bg: "rgba(18,28,38,0.55)",  border: "rgba(100,140,170,0.35)"},
};

const GOLD_DIVIDER = (
  <div style={{
    height: 1,
    background: "linear-gradient(90deg, transparent, rgba(240,192,64,0.7) 20%, rgba(240,192,64,0.9) 50%, rgba(240,192,64,0.7) 80%, transparent)",
    margin: "0 0",
  }} />
);

export default function RaidLeaderboardPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: meData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const isAdmin = meData?.isAdmin === true;

  const { data: lbData, isLoading: lbLoading } = useQuery<{ top: RaidLeaderboardEntry[] }>({
    queryKey: ["/api/raid/leaderboard"],
    staleTime: 0,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });

  const { data: rewardsData } = useQuery<{ tiers: RaidRewardTier[] }>({
    queryKey: ["/api/raid/rewards"],
    staleTime: 30_000,
  });

  const { data: shopItems = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/shop-items-all"],
    enabled: isAdmin,
    staleTime: Infinity,
  });

  const entries = lbData?.top ?? [];
  const savedTiers: RaidRewardTier[] = rewardsData?.tiers ?? [];

  // ── Admin draft state ──────────────────────────────────────────────────────
  const [draftTiers, setDraftTiers] = useState<RaidRewardTier[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState<{ tierIdx: number; slotIdx: number } | null>(null);
  const [shopSearch, setShopSearch] = useState("");

  const activeTiers: RaidRewardTier[] = draftTiers ?? savedTiers;
  const isDirty = draftTiers !== null;

  const initDraft = () => {
    if (!draftTiers && savedTiers.length > 0) setDraftTiers(JSON.parse(JSON.stringify(savedTiers)));
  };

  const saveRewardsMutation = useMutation({
    mutationFn: async (tiers: RaidRewardTier[]) =>
      apiRequest("POST", "/api/admin/raid-rewards", { tiers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/raid/rewards"] });
      setDraftTiers(null);
      toast({ title: "Raid rewards saved!" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const setTierCoins = (tIdx: number, val: number) => {
    initDraft();
    setDraftTiers(prev => {
      const next = JSON.parse(JSON.stringify(prev ?? savedTiers)) as RaidRewardTier[];
      next[tIdx].coins = val;
      return next;
    });
  };

  const removeItem = (tIdx: number, sIdx: number) => {
    initDraft();
    setDraftTiers(prev => {
      const next = JSON.parse(JSON.stringify(prev ?? savedTiers)) as RaidRewardTier[];
      next[tIdx].items.splice(sIdx, 1);
      return next;
    });
  };

  const pickItem = (shopItem: any) => {
    if (!pickerOpen) return;
    const { tierIdx, slotIdx } = pickerOpen;
    initDraft();
    setDraftTiers(prev => {
      const next = JSON.parse(JSON.stringify(prev ?? savedTiers)) as RaidRewardTier[];
      const tier = next[tierIdx];
      const entry: RaidRewardItem = {
        shopItemId: shopItem.id,
        name: shopItem.name,
        imageUrl: shopItem.imageUrl ?? shopItem.hatchedImageUrl ?? shopItem.eggImageUrl ?? null,
      };
      if (slotIdx < tier.items.length) tier.items[slotIdx] = entry;
      else tier.items.push(entry);
      return next;
    });
    setPickerOpen(null);
    setShopSearch("");
  };

  const hasAnyRewards = savedTiers.some(t => t.coins > 0 || t.items.length > 0);

  const filteredShop = useMemo(() =>
    shopItems.filter((s: any) =>
      !shopSearch || s.name.toLowerCase().includes(shopSearch.toLowerCase())
    ), [shopItems, shopSearch]);

  // ── Item picker overlay ────────────────────────────────────────────────────
  const pickerOverlay = pickerOpen && (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(4,2,10,0.92)",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 14px 10px",
        borderBottom: "1px solid rgba(240,192,64,0.2)",
      }}>
        <input
          autoFocus
          placeholder="Search items…"
          value={shopSearch}
          onChange={e => setShopSearch(e.target.value)}
          style={{
            flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13,
            fontFamily: "Lora, serif", outline: "none",
          }}
        />
        <button
          onClick={() => { setPickerOpen(null); setShopSearch(""); }}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer", padding: "0 4px" }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {filteredShop.map((item: any) => {
          const img = item.imageUrl ?? item.hatchedImageUrl ?? item.eggImageUrl ?? null;
          return (
            <button
              key={item.id}
              onClick={() => pickItem(item)}
              style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, padding: "8px 4px 6px", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}
            >
              {img
                ? <img src={img} style={{ width: 48, height: 48, objectFit: "contain" }} draggable={false} />
                : <div style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3 }}>
                    <img src={petPawIcon} style={{ width: 28, height: 28, objectFit: "contain" }} draggable={false} />
                  </div>
              }
              <span style={{
                fontSize: 9, color: "rgba(255,255,255,0.75)", fontFamily: "Lora, serif",
                textAlign: "center", lineHeight: 1.2, maxWidth: "100%",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", width: "100%",
              }}>
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Tier card ──────────────────────────────────────────────────────────────
  const renderTier = (tier: RaidRewardTier, tIdx: number) => {
    const v = TIER_VISUALS[tier.key] ?? TIER_VISUALS["t7"];
    const rankLabel = tier.rankTo ? `#${tier.rankFrom}–${tier.rankTo}` : `#${tier.rankFrom}+`;
    const coinsVal = tier.coins;
    const hasContent = coinsVal > 0 || tier.items.length > 0;

    return (
      <div key={tier.key} style={{ background: v.bg, border: `1px solid ${v.border}`, borderRadius: 12, padding: "12px 14px", boxShadow: `0 0 18px ${v.glow}` }}>

        {/* Tier header */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Lora, serif", fontSize: 13, fontWeight: 900, color: v.color, letterSpacing: "0.10em", lineHeight: 1 }}>
              {tier.label.toUpperCase()}
            </div>
            <div style={{ fontFamily: "Lora, serif", fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: "0.14em", marginTop: 1 }}>
              RANK {rankLabel}
            </div>
          </div>
          {isAdmin && isDirty && (
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "Lora, serif" }}>editing</div>
          )}
        </div>

        {/* Item slots row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 8 }}>
          {Array.from({ length: 4 }, (_, sIdx) => {
            const item = tier.items[sIdx] ?? null;
            return (
              <div
                key={sIdx}
                style={{
                  aspectRatio: "1/1", borderRadius: 8, position: "relative",
                  background: item ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
                  border: item
                    ? `1px solid ${v.border}`
                    : "1px dashed rgba(255,255,255,0.14)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: isAdmin ? "pointer" : "default",
                  overflow: "visible",
                }}
                onClick={() => {
                  if (!isAdmin) return;
                  if (!item) setPickerOpen({ tierIdx: tIdx, slotIdx: sIdx });
                }}
              >
                {item ? (
                  <>
                    {item.imageUrl
                      ? <img src={item.imageUrl} style={{ width: "90%", height: "90%", objectFit: "contain" }} draggable={false} />
                      : <img src={petPawIcon} style={{ width: "60%", height: "60%", objectFit: "contain", opacity: 0.4 }} draggable={false} />
                    }
                    {isAdmin && (
                      <button
                        onPointerDown={e => { e.stopPropagation(); removeItem(tIdx, sIdx); }}
                        style={{
                          position: "absolute", top: -5, right: -5,
                          width: 16, height: 16, borderRadius: "50%",
                          background: "rgba(180,30,10,0.9)",
                          border: "1px solid rgba(255,100,60,0.6)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", padding: 0, fontSize: 8, color: "#fff",
                          fontWeight: "bold", zIndex: 5,
                        }}
                      >✕</button>
                    )}
                    <div style={{
                      position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
                      fontSize: 8, color: "rgba(255,255,255,0.55)", fontFamily: "Lora, serif",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      maxWidth: 52, textAlign: "center",
                    }}>
                      {item.name}
                    </div>
                  </>
                ) : (
                  isAdmin
                    ? <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)", fontWeight: 300 }}>+</span>
                    : <span style={{ fontSize: 13, color: "rgba(255,255,255,0.12)" }}>—</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Coin section */}
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
          <img src={coinIconImg} alt="" style={{ width: 18, height: 18, objectFit: "contain" }} draggable={false} />
          {isAdmin ? (
            <input
              type="number"
              min={0}
              value={coinsVal === 0 ? "" : coinsVal}
              placeholder="0"
              onChange={e => {
                initDraft();
                setTierCoins(tIdx, Math.max(0, parseInt(e.target.value) || 0));
              }}
              style={{
                width: 100, background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6,
                padding: "5px 9px", color: "#f0c040", fontSize: 13,
                fontFamily: "Lora, serif", outline: "none",
              }}
            />
          ) : (
            <span style={{ fontFamily: "Lora, serif", fontSize: 13, fontWeight: "bold", color: coinsVal > 0 ? "#f0c040" : "rgba(255,255,255,0.25)" }}>
              {coinsVal > 0 ? coinsVal.toLocaleString() : "—"}
            </span>
          )}
          <span style={{ fontFamily: "Lora, serif", fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em" }}>COINS</span>
        </div>

        {!isAdmin && !hasContent && (
          <div style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 6 }}>
            Rewards TBA
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "#08040c", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Background */}
      <img src={raidBg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(4,2,8,0.58)", pointerEvents: "none" }} />

      {/* Close button */}
      <button
        data-testid="button-close-raid-leaderboard"
        onClick={() => navigate("/raid")}
        style={{ position: "absolute", top: 60, right: 14, background: "none", border: "none", padding: 0, cursor: "pointer", zIndex: 10, width: 40, height: 40 }}
      >
        <img src={raidCloseImg} alt="Close" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }} draggable={false} />
      </button>

      {/* Item picker overlay */}
      {pickerOverlay}

      {/* Scrollable page content */}
      <div
        style={{
          position: "relative", zIndex: 5, flex: 1, overflowY: "auto",
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 56, paddingBottom: 40, paddingLeft: 16, paddingRight: 16,
        }}
      >
        {/* ── Leaderboard frame ──────────────────────────────────────────── */}
        <div style={{ width: "100%", maxWidth: 360, position: "relative" }}>
          <img
            src={pvpLeaderboardBg}
            alt=""
            style={{ width: "100%", height: "auto", display: "block", userSelect: "none", pointerEvents: "none" }}
            draggable={false}
          />

          <div
            style={{
              position: "absolute", top: "17%", left: "8%", right: "8%", bottom: "8%",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Column header — no PLAYER text, DAMAGE in gold */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "0 8px 6px",
                borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 2,
              }}
              data-testid="row-raid-leaderboard-header"
            >
              <div style={{ width: 22, flexShrink: 0 }} />
              <div style={{ width: 26, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }} />
              <div style={{ flexShrink: 0, width: 54, textAlign: "right", fontSize: 8, letterSpacing: "0.16em", fontWeight: "bold", color: "#f0c040", fontFamily: "Lora, serif" }}>
                DAMAGE
              </div>
            </div>

            {/* Scrollable list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {lbLoading ? (
                <div style={{ fontFamily: "Lora, serif", fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "28px 0" }}>
                  Loading…
                </div>
              ) : entries.length === 0 ? (
                <div style={{ fontFamily: "Lora, serif", fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "28px 0" }} data-testid="text-raid-leaderboard-empty">
                  No raid data yet
                </div>
              ) : (
                entries.map((entry, i) => {
                  const rank = i + 1;
                  const isLast = i === entries.length - 1;
                  return (
                    <div
                      key={entry.userId}
                      data-testid={`row-raid-leaderboard-${rank}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "5px 8px",
                        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div style={{ width: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {rank === 1 ? (
                          <img src={rank1Icon} alt="1st" style={{ width: 22, height: 22, objectFit: "contain" }} draggable={false} />
                        ) : rank === 2 ? (
                          <img src={rank2Icon} alt="2nd" style={{ width: 22, height: 22, objectFit: "contain" }} draggable={false} />
                        ) : rank === 3 ? (
                          <img src={rank3Icon} alt="3rd" style={{ width: 22, height: 22, objectFit: "contain" }} draggable={false} />
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: "bold", color: "rgba(255,255,255,0.45)", fontFamily: "Lora, serif" }}>{rank}</span>
                        )}
                      </div>

                      {entry.profileImage ? (
                        <img src={entry.profileImage} style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(80,20,10,0.5)", border: "1px solid rgba(220,60,20,0.2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <img src={petPawIcon} alt="" style={{ width: 14, height: 14, objectFit: "contain", opacity: 0.45 }} />
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.92)", fontFamily: "Lora, serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.username}
                      </div>

                      <div style={{ flexShrink: 0, width: 54, fontSize: 12, fontWeight: "900", color: "#f0c040", fontFamily: "Lora, serif", textAlign: "right" }}>
                        {entry.totalDamage.toLocaleString()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Raid Rewards section ────────────────────────────────────────── */}
        {(isAdmin || hasAnyRewards) && (
          <div style={{ width: "100%", maxWidth: 360, marginTop: 24 }}>

            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: "Lora, serif", fontSize: 14, fontWeight: 900, color: "#f0c040", letterSpacing: "0.16em" }}>
                RAID REWARDS
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 8 }}>
                  {isDirty && (
                    <button
                      onClick={() => setDraftTiers(null)}
                      style={{
                        background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 7, padding: "5px 12px", cursor: "pointer",
                        fontFamily: "Lora, serif", fontSize: 11, color: "rgba(255,255,255,0.5)",
                      }}
                    >
                      Discard
                    </button>
                  )}
                  <button
                    onClick={() => isDirty && saveRewardsMutation.mutate(activeTiers)}
                    disabled={!isDirty || saveRewardsMutation.isPending}
                    style={{
                      background: isDirty ? "rgba(240,192,64,0.18)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${isDirty ? "rgba(240,192,64,0.55)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 7, padding: "5px 14px", cursor: isDirty ? "pointer" : "default",
                      fontFamily: "Lora, serif", fontSize: 11, fontWeight: "bold",
                      color: isDirty ? "#f0c040" : "rgba(255,255,255,0.3)",
                      opacity: saveRewardsMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    {saveRewardsMutation.isPending ? "Saving…" : "Save Rewards"}
                  </button>
                </div>
              )}
            </div>

            {/* Tier list with gold dividers */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {activeTiers.map((tier, tIdx) => (
                <div key={tier.key}>
                  {tIdx > 0 && <div style={{ marginBottom: 10, marginTop: 10 }}>{GOLD_DIVIDER}</div>}
                  <div style={{ marginBottom: tIdx < activeTiers.length - 1 ? 0 : 0 }}>
                    {renderTier(tier, tIdx)}
                  </div>
                </div>
              ))}
            </div>

            {isAdmin && (
              <div style={{
                marginTop: 12, fontFamily: "Lora, serif", fontSize: 10,
                color: "rgba(255,255,255,0.25)", textAlign: "center", letterSpacing: "0.10em",
              }}>
                Admin only — tap + to add items, set coins, then Save Rewards
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
