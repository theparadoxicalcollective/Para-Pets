import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, Sword, Users, Trophy, Check, X } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import PvpBattlePage from "./PvpBattlePage";
import forestBgImg from "@assets/generated_images/pvp_arena_forest_bg.png";
import swordImg from "@assets/generated_images/pvp_battle_sword.png";

interface LeaderboardEntry {
  userId: string;
  username: string;
  profileImage: string | null;
  battlePoints: number;
  wins: number;
  losses: number;
}

interface Opponent {
  userId: string;
  username: string;
  profileImage: string | null;
  petInventoryIds: string[];
}

export default function PvpArenaPage({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"lobby" | "group" | "opponents" | "battle">("lobby");
  const [battleOpponent, setBattleOpponent] = useState<Opponent | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [groupSaved, setGroupSaved] = useState(false);

  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: leaderboard = [] } = useQuery<LeaderboardEntry[]>({ queryKey: ["/api/pvp/leaderboard"] });
  const { data: battleGroup } = useQuery<any>({ queryKey: ["/api/pvp/battle-group"] });
  const { data: opponents = [] } = useQuery<Opponent[]>({ queryKey: ["/api/pvp/opponents"], enabled: tab === "opponents" });
  const { data: inventory = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"], enabled: tab === "group" });

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

  if (tab === "battle" && battleOpponent) {
    return (
      <PvpBattlePage
        opponent={battleOpponent}
        myPetIds={selectedPetIds.length > 0 ? selectedPetIds : battleGroup?.petInventoryIds ?? []}
        onClose={(result) => {
          setTab("lobby");
          setBattleOpponent(null);
          if (result) {
            queryClient.invalidateQueries({ queryKey: ["/api/pvp/leaderboard"] });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          }
        }}
      />
    );
  }

  const activePet = me?.activePet;
  const myBp = (leaderboard as LeaderboardEntry[]).find((r) => r.userId === me?.id)?.battlePoints ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ fontFamily: "Cinzel, serif" }}
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
      <div className="relative z-10 flex items-center gap-3 px-4 pt-safe pt-3 pb-2.5 shrink-0" style={{ background: "rgba(5,8,15,0.7)", borderBottom: "1px solid rgba(167,139,250,0.12)" }}>
        <button onClick={onClose} data-testid="button-close-pvp" className="w-10 h-10 flex items-center justify-center rounded-lg text-white/50 hover:text-white/80 transition-colors shrink-0 active:scale-90" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ArrowLeft size={20} />
        </button>
        {/* Profile pic */}
        {me?.profileImage
          ? <img src={me.profileImage} className="w-9 h-9 rounded-full border border-purple-400/40 object-cover shrink-0" />
          : <div className="w-9 h-9 rounded-full border border-purple-400/30 bg-purple-900/50 flex items-center justify-center text-sm shrink-0">👤</div>}
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

        {/* ── ARENA title ── */}
        <div className="text-center pt-4 pb-2 shrink-0">
          <div className="text-[10px] tracking-[0.4em] text-purple-400/70 mb-0.5">WELCOME TO THE</div>
          <div className="text-2xl font-black tracking-[0.2em] text-white" style={{ textShadow: "0 0 30px rgba(167,139,250,0.6)" }}>⚔ PvP ARENA ⚔</div>
          {myBp > 0 && <div className="text-yellow-400/80 text-[10px] tracking-wider mt-1">Your battle points: {myBp}</div>}
        </div>

        {/* ── Leaderboard ── */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={13} className="text-yellow-400" />
            <span className="text-[10px] tracking-[0.3em] text-yellow-400/80">BATTLE LEADERBOARD</span>
          </div>

          {(leaderboard as LeaderboardEntry[]).length === 0 ? (
            <div className="text-center py-12 text-white/20 text-xs tracking-widest">
              <div className="text-4xl mb-3">🏆</div>
              No battles recorded yet.<br />Be the first to fight!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {(leaderboard as LeaderboardEntry[]).map((entry, i) => (
                <div
                  key={entry.userId}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{
                    background: i === 0
                      ? "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(253,224,71,0.05))"
                      : i === 1
                      ? "linear-gradient(135deg, rgba(156,163,175,0.12), rgba(107,114,128,0.05))"
                      : i === 2
                      ? "linear-gradient(135deg, rgba(180,83,9,0.12), rgba(120,53,15,0.05))"
                      : "rgba(255,255,255,0.03)",
                    border: `1px solid ${i === 0 ? "rgba(251,191,36,0.2)" : i === 1 ? "rgba(156,163,175,0.15)" : i === 2 ? "rgba(180,83,9,0.15)" : "rgba(255,255,255,0.05)"}`,
                  }}
                >
                  <span className="text-sm font-black w-5 text-center" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "#6b7280" }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                  </span>
                  {entry.profileImage
                    ? <img src={entry.profileImage} className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-purple-900/50 border border-purple-400/20 flex items-center justify-center text-xs shrink-0">👤</div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-white/90 text-xs font-bold truncate">{entry.username}</div>
                    <div className="text-white/30 text-[9px]">{entry.wins}W · {entry.losses}L</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-yellow-400 text-sm font-black">{Math.max(0, entry.battlePoints)}</div>
                    <div className="text-yellow-400/40 text-[8px] tracking-wider">PTS</div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-white/8 shrink-0">
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
                          : <span className="text-3xl">🐾</span>}
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
          <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-white/8 shrink-0">
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
                    onClick={() => {
                      if (!selectedPetIds.length && !battleGroup?.petInventoryIds?.length) {
                        toast({ title: "Set up your Battle Group first!", variant: "destructive" });
                        setTab("group");
                        return;
                      }
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
                      : <div className="w-12 h-12 rounded-full bg-red-900/40 border border-red-500/20 flex items-center justify-center text-lg shrink-0">👤</div>}
                    <div className="flex-1 text-left">
                      <div className="text-white/90 text-sm font-bold">{opp.username}</div>
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
