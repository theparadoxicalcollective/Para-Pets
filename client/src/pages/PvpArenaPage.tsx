import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import battleTrophyIcon from "@assets/generated_images/icon_battle_trophy.png";
import platinumTrophyImg from "@assets/generated_images/pvp_platinum_trophy.png";
import leaderboardPanelImg from "@assets/generated_images/pvp_leaderboard_panel_bg.png";
import pvpTicketImg from "@assets/Photoroom_20260415_83701_PM_1776304592941.png";
import { ArrowLeft, Users, Check } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import PvpBattlePage from "./PvpBattlePage";
import forestBgImg from "@assets/generated_images/pvp_ruins_battlefield_bg.png";
import swordImg from "@assets/generated_images/pvp_battle_sword.png";
import RoleBadge from "@/components/RoleBadge";

interface LeaderboardEntry {
  userId: string;
  username: string;
  profileImage: string | null;
  battlePoints: number;
  wins: number;
  losses: number;
  isAdmin?: boolean;
  isModerator?: boolean;
}

interface LeaderboardResponse {
  top: LeaderboardEntry[];
  me: { rank: number; entry: LeaderboardEntry; inTop: boolean } | null;
  totalRanked: number;
}

// Battle-points rank tiers, per game spec:
//   1–10  → Gold
//   11–25 → Silver
//   26–50 → Bronze
//   51+   → tracked but hidden from the public board
type Tier = "gold" | "silver" | "bronze" | "off";
function tierForRank(rank: number): Tier {
  if (rank <= 10) return "gold";
  if (rank <= 25) return "silver";
  if (rank <= 50) return "bronze";
  return "off";
}
const TIER_STYLE: Record<Tier, { label: string; ring: string; chip: string; text: string; rowBg: string; rowBorder: string }> = {
  gold:   { label: "GOLD",   ring: "rgba(251,191,36,0.55)",  chip: "rgba(251,191,36,0.22)", text: "#fbbf24", rowBg: "linear-gradient(135deg, rgba(251,191,36,0.16), rgba(180,130,20,0.05))", rowBorder: "rgba(251,191,36,0.3)" },
  silver: { label: "SILVER", ring: "rgba(203,213,225,0.55)", chip: "rgba(203,213,225,0.18)", text: "#cbd5e1", rowBg: "linear-gradient(135deg, rgba(203,213,225,0.13), rgba(120,130,140,0.04))", rowBorder: "rgba(203,213,225,0.25)" },
  bronze: { label: "BRONZE", ring: "rgba(217,119,6,0.55)",   chip: "rgba(217,119,6,0.18)",  text: "#d97706", rowBg: "linear-gradient(135deg, rgba(217,119,6,0.13), rgba(120,53,15,0.04))",  rowBorder: "rgba(217,119,6,0.28)" },
  off:    { label: "—",       ring: "rgba(107,114,128,0.4)",  chip: "rgba(107,114,128,0.15)", text: "#9ca3af", rowBg: "rgba(255,255,255,0.03)", rowBorder: "rgba(255,255,255,0.06)" },
};

interface Opponent {
  userId: string;
  username: string;
  profileImage: string | null;
  petInventoryIds: string[];
  isAdmin?: boolean;
  isModerator?: boolean;
}

export default function PvpArenaPage({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"lobby" | "group" | "opponents" | "battle">("lobby");
  const [battleOpponent, setBattleOpponent] = useState<Opponent | null>(null);
  const [battleToken, setBattleToken] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [groupSaved, setGroupSaved] = useState(false);

  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: leaderboardData } = useQuery<LeaderboardResponse>({ queryKey: ["/api/pvp/leaderboard"] });
  const leaderboard = leaderboardData?.top ?? [];
  const myLb = leaderboardData?.me ?? null;
  const { data: ticketsData } = useQuery<{ count: number }>({ queryKey: ["/api/pvp/tickets"] });
  const ticketCount = ticketsData?.count ?? 0;
  const { data: battleGroup } = useQuery<any>({ queryKey: ["/api/pvp/battle-group"] });
  const { data: opponents = [] } = useQuery<Opponent[]>({ queryKey: ["/api/pvp/opponents"], enabled: tab === "opponents" });
  const { data: inventory = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"], enabled: tab === "group" });

  // Spend a ticket BEFORE the battle screen mounts. We do it here (not inside
  // PvpBattlePage) so a player who's out of tickets gets a friendly toast
  // instead of being dropped into a battle they can't actually pay for.
  const startBattle = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pvp/start", {});
      return res.json() as Promise<{ ticketsRemaining: number; battleToken: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });

  // Sync saved group into local selection
  useEffect(() => {
    if (battleGroup?.petInventoryIds) setSelectedPetIds(battleGroup.petInventoryIds);
  }, [battleGroup]);

  const saveBattleGroup = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pvp/battle-group", { petInventoryIds: selectedPetIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/battle-group"] });
      setGroupSaved(true);
      toast({ title: "Battle Group saved!" });
      setTimeout(() => setGroupSaved(false), 2000);
    },
  });

  const hatchedPets = (inventory as any[]).filter(
    (inv: any) => inv.type === "pet" && inv.isHatched
  );

  const togglePet = (invId: string) => {
    setSelectedPetIds(prev =>
      prev.includes(invId) ? prev.filter(id => id !== invId) : prev.length < 5 ? [...prev, invId] : prev
    );
  };

  if (tab === "battle" && battleOpponent && battleToken) {
    return (
      <PvpBattlePage
        opponent={battleOpponent}
        myPetIds={selectedPetIds.length > 0 ? selectedPetIds : battleGroup?.petInventoryIds ?? []}
        battleToken={battleToken}
        onClose={(result) => {
          setTab("lobby");
          setBattleOpponent(null);
          setBattleToken(null);
          if (result) {
            queryClient.invalidateQueries({ queryKey: ["/api/pvp/leaderboard"] });
            queryClient.invalidateQueries({ queryKey: ["/api/pvp/tickets"] });
            queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          }
        }}
      />
    );
  }

  const activePet = me?.activePet;
  const myBp = myLb?.entry.battlePoints ?? 0;
  const myRank = myLb?.rank ?? null;
  const myTier: Tier = myRank ? tierForRank(myRank) : "off";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ fontFamily: "Lora, serif" }}
    >
      {/* Forest background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${forestBgImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          filter: "brightness(0.45)",
        }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,8,15,0.55) 0%, rgba(5,8,15,0.75) 60%, rgba(5,8,15,0.95) 100%)" }} />

      {/* ── Simplified Header ─────────────────────────────────────── */}
      <div className="relative z-10 flex items-center gap-3 px-4 pb-2.5 shrink-0" style={{ background: "rgba(5,8,15,0.7)", borderBottom: "1px solid rgba(167,139,250,0.12)", paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
        <button onClick={onClose} data-testid="button-close-pvp" className="w-10 h-10 flex items-center justify-center rounded-lg text-white/50 hover:text-white/80 transition-colors shrink-0 active:scale-90" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ArrowLeft size={20} />
        </button>
        {/* Profile pic */}
        {me?.profileImage
          ? <img src={me.profileImage} className="w-9 h-9 rounded-full border border-purple-400/40 object-cover shrink-0" />
          : <div className="w-9 h-9 rounded-full border border-purple-400/30 bg-purple-900/50 flex items-center justify-center shrink-0">
              <img src={petPawIcon} alt="" style={{ width: 20, height: 20, objectFit: "contain", opacity: 0.5 }} />
            </div>}
        <div className="flex-1 min-w-0">
          <div className="text-white/90 text-sm font-bold truncate">{me?.username ?? "—"}</div>
          <div className="text-yellow-400 text-[10px] tracking-wider">{me?.coins ?? 0} ✦</div>
        </div>
        {/* Active pet mini icon */}
        <div className="w-10 h-10 shrink-0">
          {activePet?.petTemplateId
            ? <PetAnimator petTemplateId={activePet.petTemplateId} mode="idle" view="front" size={40} />
            : activePet?.imageUrl
            ? <img src={activePet.imageUrl} className="w-10 h-10 object-contain" />
            : null}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">

        {/* ── Title row: ticket count (left) + centered "PvP Arena" title.
             The title is centered using absolute positioning so the ticket
             chip on the left can't push it off-center. ── */}
        <div className="relative shrink-0 pt-3 pb-1.5 px-4">
          <div className="flex items-center gap-1.5" data-testid="pvp-ticket-count">
            <img src={pvpTicketImg} alt="PvP ticket" style={{ width: 26, height: 26, objectFit: "contain" }} />
            <span className="text-[12px] font-bold text-amber-200" style={{ textShadow: "0 0 8px rgba(251,191,36,0.4)" }}>×{ticketCount}</span>
          </div>
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-2xl font-black tracking-[0.18em] text-white pointer-events-none"
            style={{ textShadow: "0 0 28px rgba(167,139,250,0.55), 0 2px 4px rgba(0,0,0,0.6)" }}
            data-testid="text-pvp-arena-title"
          >
            PvP Arena
          </div>
        </div>

        {/* ── "Veridian Leaders" leaderboard, framed by the ruins panel ── */}
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3">
          <div className="relative mx-auto" style={{ maxWidth: 360 }}>
            {/* Ornate ruins frame as the panel background. Using object-fit
                contain via background-size so the frame keeps its aspect
                ratio while the inner content drives the box height. */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${leaderboardPanelImg})`,
                backgroundSize: "100% 100%",
                backgroundRepeat: "no-repeat",
                filter: "drop-shadow(0 6px 22px rgba(0,0,0,0.55))",
              }}
            />
            {/* Inner content sits inside the frame's hollow area. The frame
                art has a thick decorative border, so we pad the content
                generously so rows don't overlap the carved stone. */}
            <div className="relative px-7 pt-[68px] pb-[68px]">
              <div className="text-center mb-3">
                <div
                  className="text-[18px] font-black tracking-[0.18em] text-amber-100"
                  style={{ fontFamily: "Cinzel, fantasy, serif", textShadow: "0 0 16px rgba(167,139,250,0.55), 0 2px 3px rgba(0,0,0,0.7)" }}
                  data-testid="text-leaderboard-title"
                >
                  Veridian Leaders
                </div>
              </div>

              {leaderboard.length === 0 ? (
                <div className="text-center py-10 text-white/30 text-xs tracking-widest">
                  <div className="mb-3"><img src={battleTrophyIcon} alt="" style={{ width: 48, height: 48, objectFit: "contain", margin: "0 auto" }} /></div>
                  No battles recorded yet.<br />Be the first to fight!
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {leaderboard.map((entry, i) => {
                    const rank = i + 1;
                    const tier = tierForRank(rank);
                    const style = TIER_STYLE[tier];
                    const isTop3 = rank <= 3;
                    const isMe = entry.userId === me?.id;
                    return (
                      <div
                        key={entry.userId}
                        data-testid={`row-leaderboard-${rank}`}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
                        style={{
                          background: isMe
                            ? "linear-gradient(135deg, rgba(124,58,237,0.28), rgba(167,139,250,0.08))"
                            : style.rowBg,
                          border: `1px solid ${isMe ? "rgba(167,139,250,0.55)" : style.rowBorder}`,
                          boxShadow: isMe ? "0 0 12px rgba(124,58,237,0.25)" : undefined,
                        }}
                      >
                        {/* Top-3: platinum trophy icon overlaid with the rank
                            number. Otherwise a simple tier-coloured rank chip. */}
                        {isTop3 ? (
                          <div className="relative shrink-0" style={{ width: 32, height: 32 }}>
                            <img src={platinumTrophyImg} alt="" style={{ width: 32, height: 32, objectFit: "contain", filter: "drop-shadow(0 0 6px rgba(167,139,250,0.5))" }} />
                            <div
                              className="absolute inset-0 flex items-center justify-center font-black text-[11px]"
                              style={{ color: "#fff", textShadow: "0 0 4px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8)" }}
                            >
                              {rank}
                            </div>
                          </div>
                        ) : (
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-black text-[10px]"
                            style={{ background: style.chip, border: `1px solid ${style.ring}`, color: style.text }}
                          >
                            {rank}
                          </div>
                        )}
                        {entry.profileImage
                          ? <img src={entry.profileImage} className="w-7 h-7 rounded-full object-cover border border-white/15 shrink-0" />
                          : <div className="w-7 h-7 rounded-full bg-purple-900/50 border border-purple-400/20 flex items-center justify-center shrink-0">
                              <img src={petPawIcon} alt="" style={{ width: 16, height: 16, objectFit: "contain", opacity: 0.5 }} />
                            </div>}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className="text-white/95 text-[12px] font-bold truncate">{entry.username}</div>
                            <RoleBadge isAdmin={entry.isAdmin} isModerator={entry.isModerator} />
                            <div
                              className="text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded shrink-0"
                              style={{ color: style.text, background: style.chip, border: `1px solid ${style.ring}` }}
                            >
                              {style.label}
                            </div>
                          </div>
                          <div className="text-white/35 text-[9px]">{entry.wins}W · {entry.losses}L</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-amber-300 text-[14px] font-black leading-none">{Math.max(0, entry.battlePoints)}</div>
                          <div className="text-amber-300/45 text-[8px] tracking-wider">BP</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* "Your placement" row — always visible. Shows the player's
                  global rank even when they're past the top 50. If they
                  haven't fought yet, prompt them to start. */}
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="text-[9px] tracking-[0.25em] text-white/40 mb-1.5 text-center">YOUR PLACEMENT</div>
                {myRank ? (
                  <div
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
                    data-testid="row-my-placement"
                    style={{
                      background: "linear-gradient(135deg, rgba(124,58,237,0.22), rgba(167,139,250,0.05))",
                      border: "1px solid rgba(167,139,250,0.45)",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-black text-[10px]"
                      style={{ background: TIER_STYLE[myTier].chip, border: `1px solid ${TIER_STYLE[myTier].ring}`, color: TIER_STYLE[myTier].text }}
                    >
                      #{myRank}
                    </div>
                    {me?.profileImage
                      ? <img src={me.profileImage} className="w-7 h-7 rounded-full object-cover border border-white/15 shrink-0" />
                      : <div className="w-7 h-7 rounded-full bg-purple-900/50 border border-purple-400/20 flex items-center justify-center shrink-0">
                          <img src={petPawIcon} alt="" style={{ width: 16, height: 16, objectFit: "contain", opacity: 0.5 }} />
                        </div>}
                    <div className="flex-1 min-w-0">
                      <div className="text-white/95 text-[12px] font-bold truncate">{me?.username ?? "You"}</div>
                      <div className="text-white/40 text-[9px]">
                        {myTier === "off" ? "Unranked tier" : `${TIER_STYLE[myTier].label} tier`} · {myLb?.entry.wins ?? 0}W · {myLb?.entry.losses ?? 0}L
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-amber-300 text-[14px] font-black leading-none">{Math.max(0, myBp)}</div>
                      <div className="text-amber-300/45 text-[8px] tracking-wider">BP</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-3 text-white/40 text-[11px]">
                    You haven't fought yet — win a battle to get on the board!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom Buttons ── */}
        <div className="shrink-0 px-4 pb-safe pb-5 pt-3 flex gap-3" style={{ background: "linear-gradient(0deg, rgba(5,8,15,0.95) 0%, rgba(5,8,15,0.6) 100%)", borderTop: "1px solid rgba(167,139,250,0.08)" }}>
          {/* Battle Group button */}
          <button
            data-testid="button-pvp-battle-group"
            onClick={() => setTab("group")}
            className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-3 transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, rgba(20,10,40,0.9), rgba(40,20,70,0.9))",
              border: `1px solid ${battleGroup?.petInventoryIds?.length > 0 ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.1)"}`,
              boxShadow: battleGroup?.petInventoryIds?.length > 0 ? "0 0 16px rgba(124,58,237,0.3)" : undefined,
            }}
          >
            <Users size={20} className="text-purple-300" />
            <span className="text-[10px] tracking-widest text-purple-200">BATTLE GROUP</span>
            {battleGroup?.petInventoryIds?.length > 0 && (
              <span className="text-[8px] text-purple-400/60">{battleGroup.petInventoryIds.length}/5 pets</span>
            )}
          </button>

          {/* Battle button with sword image */}
          <button
            data-testid="button-pvp-battle"
            onClick={() => setTab("opponents")}
            className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-3 transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, rgba(60,10,10,0.9), rgba(100,20,20,0.9))",
              border: "1px solid rgba(239,68,68,0.35)",
              boxShadow: "0 0 16px rgba(239,68,68,0.2)",
            }}
          >
            <img src={swordImg} alt="Battle" className="w-6 h-6 object-contain" />
            <span className="text-[10px] tracking-widest text-red-300">BATTLE</span>
          </button>
        </div>
      </div>

      {/* ── Battle Group Modal ────────────────────────────────────── */}
      {tab === "group" && (
        <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "rgba(5,8,15,0.97)" }}>
          <div className="flex items-center gap-3 px-4 pb-3 border-b border-white/8 shrink-0" style={{ paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
            <button onClick={() => setTab("lobby")} className="w-10 h-10 flex items-center justify-center rounded-lg text-white/50 hover:text-white/80 active:scale-90 shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 text-sm tracking-[0.2em] text-purple-300 font-bold">BATTLE GROUP</div>
            <div className="text-white/30 text-[10px]">{selectedPetIds.length}/5 selected</div>
          </div>
          <div className="text-white/30 text-[10px] tracking-wider px-4 py-2 shrink-0">
            Select up to 5 hatched pets to fight for you
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {hatchedPets.length === 0 ? (
              <div className="text-center py-16 text-white/20 text-xs">No hatched pets found</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {hatchedPets.map((inv: any) => {
                  const invId = inv.inventoryId || inv.id;
                  const selected = selectedPetIds.includes(invId);
                  return (
                    <button
                      key={invId}
                      data-testid={`button-pet-select-${invId}`}
                      onClick={() => togglePet(invId)}
                      className="rounded-xl p-3 flex flex-col items-center gap-2 transition-all active:scale-95 relative"
                      style={{
                        background: selected ? "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(167,139,250,0.1))" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${selected ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.08)"}`,
                        boxShadow: selected ? "0 0 12px rgba(124,58,237,0.25)" : undefined,
                      }}
                    >
                      {selected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                          <Check size={10} className="text-white" />
                        </div>
                      )}
                      <div className="w-16 h-16 flex items-center justify-center">
                        {inv.petTemplateId
                          ? <PetAnimator petTemplateId={inv.petTemplateId} mode="idle" view="front" size={60} />
                          : inv.imageUrl
                          ? <img src={inv.imageUrl} className="w-14 h-14 object-contain" />
                          : <img src={petPawIcon} alt="" style={{ width: 44, height: 44, objectFit: "contain" }} />}
                      </div>
                      <div className="text-center">
                        <div className="text-white/80 text-[11px] font-bold truncate w-full">{inv.petNickname || inv.name}</div>
                        <div className="text-white/30 text-[9px]">Lv.{inv.petLevel || 1}</div>
                        <div className="text-white/20 text-[8px]">ATK {inv.petAtk || 50} · DEF {inv.petDef || 50}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="shrink-0 px-4 pb-safe pb-5 pt-3">
            <button
              data-testid="button-save-battle-group"
              onClick={() => saveBattleGroup.mutate()}
              disabled={saveBattleGroup.isPending}
              className="w-full py-3 rounded-xl font-bold text-sm tracking-widest transition-all active:scale-95"
              style={{
                background: groupSaved
                  ? "linear-gradient(135deg, #15803d, #166534)"
                  : "linear-gradient(135deg, #4c1d95, #7c3aed)",
                color: "#e9d5ff",
                boxShadow: "0 0 18px rgba(124,58,237,0.4)",
              }}
            >
              {groupSaved ? "✓ SAVED!" : saveBattleGroup.isPending ? "SAVING..." : "SAVE GROUP"}
            </button>
          </div>
        </div>
      )}

      {/* ── Opponents List ────────────────────────────────────────── */}
      {tab === "opponents" && (
        <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "rgba(5,8,15,0.97)" }}>
          <div className="flex items-center gap-3 px-4 pb-3 border-b border-white/8 shrink-0" style={{ paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
            <button onClick={() => setTab("lobby")} className="w-10 h-10 flex items-center justify-center rounded-lg text-white/50 hover:text-white/80 active:scale-90 shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 text-sm tracking-[0.2em] text-red-300 font-bold">CHOOSE OPPONENT</div>
          </div>
          <div className="text-white/30 text-[10px] tracking-wider px-4 py-2 shrink-0">
            Select a player to battle. Fight is simulated — you control your pets live!
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {(opponents as Opponent[]).length === 0 ? (
              <div className="text-center py-16 text-white/20 text-xs">
                <div className="text-4xl mb-3">👾</div>
                No opponents available yet.<br />Ask others to set up their Battle Group!
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {(opponents as Opponent[]).map((opp) => (
                  <button
                    key={opp.userId}
                    data-testid={`button-challenge-${opp.userId}`}
                    onClick={async () => {
                      if (!selectedPetIds.length && !battleGroup?.petInventoryIds?.length) {
                        toast({ title: "Set up your Battle Group first!", variant: "destructive" });
                        setTab("group");
                        return;
                      }
                      if (ticketCount <= 0) {
                        toast({ title: "Out of PvP tickets", description: "Earn or buy tickets to enter the arena.", variant: "destructive" });
                        return;
                      }
                      // Spend the ticket BEFORE entering the battle screen.
                      // If the server rejects (e.g. raced down to 0), bail
                      // out so we don't show a paid-for battle the player
                      // can't actually start.
                      let started: { ticketsRemaining: number; battleToken: string };
                      try {
                        started = await startBattle.mutateAsync();
                      } catch (err: any) {
                        toast({ title: "Out of PvP tickets", description: "Earn or buy tickets to enter the arena.", variant: "destructive" });
                        queryClient.invalidateQueries({ queryKey: ["/api/pvp/tickets"] });
                        return;
                      }
                      setBattleToken(started.battleToken);
                      setBattleOpponent(opp);
                      setTab("battle");
                    }}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all active:scale-98"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(239,68,68,0.2)",
                    }}
                  >
                    {opp.profileImage
                      ? <img src={opp.profileImage} className="w-12 h-12 rounded-full object-cover border border-red-500/30 shrink-0" />
                      : <div className="w-12 h-12 rounded-full bg-red-900/40 border border-red-500/20 flex items-center justify-center shrink-0">
                          <img src={petPawIcon} alt="" style={{ width: 26, height: 26, objectFit: "contain", opacity: 0.5 }} />
                        </div>}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <div className="text-white/90 text-sm font-bold">{opp.username}</div>
                        <RoleBadge isAdmin={opp.isAdmin} isModerator={opp.isModerator} />
                      </div>
                      <div className="text-white/30 text-[9px]">{opp.petInventoryIds.length} pets in group</div>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 shrink-0" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
                      <img src={swordImg} alt="" className="w-4 h-4 object-contain" />
                      <span className="text-red-300 text-[11px] font-bold">FIGHT</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
