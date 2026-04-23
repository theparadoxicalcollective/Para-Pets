import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { setNavHidden } from "@/lib/navVisibility";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import battleTrophyIcon from "@assets/generated_images/icon_battle_trophy.png";
import pvpTicketImg from "@assets/Photoroom_20260415_83701_PM_1776304592941.png";
import pvpNavIcon from "@assets/generated_images/nav_icon_pvp.png";
import { ArrowLeft, Users, Check, Heart, Droplets } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import PvpBattlePage from "./PvpBattlePage";
import PvpMatchmakingOverlay from "@/components/PvpMatchmakingOverlay";
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
// Tier helpers retained from the previous leaderboard styling — currently
// unused by the simplified list, but kept here so we can re-introduce
// rank tiers later without recomputing thresholds.
type Tier = "gold" | "silver" | "bronze" | "off";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const [tab, setTab] = useState<"lobby" | "group" | "matchmaking" | "battle">("lobby");
  const [battleOpponent, setBattleOpponent] = useState<Opponent | null>(null);
  const [battleToken, setBattleToken] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [groupSaved, setGroupSaved] = useState(false);

  // Hide the floating main-nav while the arena is mounted — includes
  // matchmaking and the live battle. Restored on unmount.
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, []);

  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: leaderboardData } = useQuery<LeaderboardResponse>({ queryKey: ["/api/pvp/leaderboard"] });
  const leaderboard = leaderboardData?.top ?? [];
  const myLb = leaderboardData?.me ?? null;
  const { data: ticketsData, refetch: refetchTickets } = useQuery<{ count: number }>({
    queryKey: ["/api/pvp/tickets"],
    // Refetch whenever the arena mounts or the window regains focus so
    // freshly-bought tickets show up in the header without a reload.
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const { data: battleGroup } = useQuery<any>({ queryKey: ["/api/pvp/battle-group"] });
  // Opponents are always loaded so matchmaking can kick off immediately
  // when the player hits BEGIN BATTLE (no waiting for a second request).
  const { data: opponents = [] } = useQuery<Opponent[]>({ queryKey: ["/api/pvp/opponents"] });
  // Inventory drives both the pet picker and the potion picker on the
  // single-page lobby, so it's loaded eagerly now (was only loaded for the
  // old "group" tab).
  const { data: inventory = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"] });

  // Client-side fallback ticket count: sum of every inventory stack whose
  // backing shop item is flagged as a PvP ticket. If the dedicated
  // /api/pvp/tickets endpoint ever lags behind inventory (e.g. right after
  // a purchase), we still show the right number. We take the MAX of the
  // two so we never under-report tickets the player actually owns.
  const inventoryTicketCount = (inventory as any[])
    .filter((i: any) => i?.specialType === "pvp_ticket")
    .reduce((sum: number, i: any) => sum + (Number(i.quantity) || 1), 0);
  const ticketCount = Math.max(ticketsData?.count ?? 0, inventoryTicketCount);

  // Local potion selection — picked here on the lobby and forwarded into
  // the battle screen. Five slots max, mirrors the PvE battle prep flow.
  // Potion picks live only on the client — restored from localStorage so
  // they survive navigating away from the arena and back.
  const POTION_LS_KEY = "pvp:selectedPotionIds";
  const [selectedPotionIds, setSelectedPotionIds] = useState<string[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(POTION_LS_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 5).filter((x: any) => typeof x === "string") : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(POTION_LS_KEY, JSON.stringify(selectedPotionIds)); } catch {}
  }, [selectedPotionIds]);

  // Which inventory picker is open (if any). Tapping an empty slot opens
  // the corresponding picker; tapping a tile inside the picker fills the
  // first empty slot of that type and closes the sheet.
  const [pickerOpen, setPickerOpen] = useState<null | "pet" | "potion">(null);

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

  // Sync saved group into local selection — only on the first load so we
  // don't clobber edits the user is making while typing.
  const hydratedFromServer = useRef(false);
  // Tracks whether the user has touched the slot row since mount. We use this
  // so a late-arriving /api/pvp/battle-group response can't clobber edits the
  // user has already made (race spotted in code review).
  const hasUserEdited = useRef(false);
  useEffect(() => {
    if (!hydratedFromServer.current && battleGroup?.petInventoryIds && !hasUserEdited.current) {
      setSelectedPetIds(battleGroup.petInventoryIds);
      hydratedFromServer.current = true;
    } else if (!hydratedFromServer.current && battleGroup !== undefined) {
      // Query resolved (even if empty) — mark hydrated so autosave can run.
      hydratedFromServer.current = true;
    }
  }, [battleGroup]);

  // Monotonic save sequence so out-of-order POST responses can't overwrite a
  // newer team. We bump on mutate and only treat the most recent send as
  // authoritative when invalidating cached queries.
  const saveSeq = useRef(0);
  const lastSentSeq = useRef(0);

  const saveBattleGroup = useMutation({
    mutationFn: async (ids?: string[]) => {
      const payload = ids ?? selectedPetIds;
      const seq = ++saveSeq.current;
      lastSentSeq.current = seq;
      const res = await apiRequest("POST", "/api/pvp/battle-group", { petInventoryIds: payload });
      const json = await res.json();
      return { json, seq };
    },
    onSuccess: ({ seq }) => {
      // Only treat the most recent send as authoritative — this guards
      // against an older POST resolving after a newer one and overwriting
      // the cached team.
      if (seq !== lastSentSeq.current) return;
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/battle-group"] });
    },
  });

  // Auto-persist pet selection (debounced) so the player's team sticks
  // around when they leave the arena. Battles aren't live, so the saved
  // group is what defends them against incoming challengers too.
  useEffect(() => {
    if (!hydratedFromServer.current) return;
    const serverIds: string[] = battleGroup?.petInventoryIds ?? [];
    const same = serverIds.length === selectedPetIds.length && serverIds.every((id, i) => id === selectedPetIds[i]);
    if (same) return;
    const t = setTimeout(() => {
      saveBattleGroup.mutate(selectedPetIds);
      setGroupSaved(true);
      setTimeout(() => setGroupSaved(false), 1200);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPetIds]);

  const hatchedPets = (inventory as any[]).filter(
    (inv: any) => inv.type === "pet" && inv.isHatched
  );

  // Battle-usable potions: anything in inventory typed as "potion" that
  // actually does something useful in combat (heals HP/mana or revives).
  const battlePotions = (inventory as any[]).filter(
    (i: any) => i.type === "potion" && (((i.healthRestored ?? 0) > 0) || ((i.manaRestored ?? 0) > 0) || ((i.petsRevived ?? 0) > 0))
  );

  // Group identical potions into stacks of up to 50 for the picker UI.
  // Each row in `inventory` is a single potion (one use), so 200 healing
  // potions = 200 inventory rows. Showing them individually clutters the
  // picker; instead we group by shopItemId (or by name fallback for
  // legacy rows without a shop_item_id) and cap every visible stack at
  // POTION_STACK_SIZE. A type with 137 potions would render as 3 stacks
  // (50 / 50 / 37). Tapping a stack equips the next un-selected id.
  const POTION_STACK_SIZE = 50;
  const potionStacks = ((): Array<{
    key: string; rep: any; ids: string[]; count: number;
  }> => {
    const groups = new Map<string, { rep: any; ids: string[] }>();
    for (const p of battlePotions) {
      const key = p.shopItemId || `name:${p.name}`;
      const g = groups.get(key) || { rep: p, ids: [] };
      g.ids.push(p.inventoryId || p.id);
      groups.set(key, g);
    }
    const out: Array<{ key: string; rep: any; ids: string[]; count: number }> = [];
    for (const [key, { rep, ids }] of groups) {
      // Slice the flat id list into chunks of POTION_STACK_SIZE so very
      // large bags still display as multiple full stacks instead of one
      // giant pile.
      for (let i = 0; i < ids.length; i += POTION_STACK_SIZE) {
        const chunk = ids.slice(i, i + POTION_STACK_SIZE);
        out.push({ key: `${key}#${i / POTION_STACK_SIZE}`, rep, ids: chunk, count: chunk.length });
      }
    }
    return out;
  })();

  const togglePet = (invId: string) => {
    hasUserEdited.current = true;
    setSelectedPetIds(prev =>
      prev.includes(invId) ? prev.filter(id => id !== invId) : prev.length < 5 ? [...prev, invId] : prev
    );
  };

  const togglePotion = (invId: string) => {
    setSelectedPotionIds(prev =>
      prev.includes(invId) ? prev.filter(id => id !== invId) : prev.length < 5 ? [...prev, invId] : prev
    );
  };

  if (tab === "battle" && battleOpponent && battleToken) {
    return (
      <PvpBattlePage
        opponent={battleOpponent}
        myPetIds={selectedPetIds.length > 0 ? selectedPetIds : battleGroup?.petInventoryIds ?? []}
        potionInventoryIds={selectedPotionIds}
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

  const myBp = myLb?.entry.battlePoints ?? 0;
  const myRank = myLb?.rank ?? null;

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
          filter: "brightness(0.7) saturate(1.05)",
        }}
      />
      {/* Subtle vignette only — keep the ruins battlefield clearly visible. */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,8,15,0.25) 0%, rgba(5,8,15,0.15) 45%, rgba(5,8,15,0.55) 100%)" }} />

      {/* ── Simplified Header ───────────────────────────────────────
           Layout (left → right):
             • Close button
             • Profile pic
             • Username + Battle Points (replaces coin balance — coins
               are visible elsewhere in the app and BP is the metric
               that matters in PvP)
             • PvP ticket chip pinned to the right so the player can
               always see how many matches they have left at a glance. */}
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
          <div className="text-amber-300 text-[10px] tracking-wider font-bold" data-testid="text-header-bp">{Math.max(0, myBp)} BP</div>
        </div>
        {/* PvP ticket chip — moved up here from the row below so it's
            the most prominent control in the header. */}
        <div
          className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-md"
          data-testid="pvp-ticket-count"
          style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.32)" }}
        >
          <img src={pvpTicketImg} alt="PvP ticket" style={{ width: 24, height: 24, objectFit: "contain" }} />
          <span className="text-[13px] font-black text-amber-200" style={{ textShadow: "0 0 8px rgba(251,191,36,0.4)" }}>×{ticketCount}</span>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">

        {/* ── Centered "PvP Arena" title. Tickets used to live on the
             left of this row but moved into the header above for better
             visibility. ── */}
        <div className="relative shrink-0 pt-3 pb-1.5 px-4">
          <div
            className="text-center text-2xl font-black tracking-[0.18em] text-white"
            style={{ textShadow: "0 0 28px rgba(167,139,250,0.55), 0 2px 4px rgba(0,0,0,0.6)" }}
            data-testid="text-pvp-arena-title"
          >
            PvP Arena
          </div>
        </div>

        {/* ── Single-page loadout: leaderboard on top, pet/potion picker
             pinned near the bottom so the Begin Battle button always
             sits within thumb reach. flex-col + mt-auto on the prep
             card pushes the team-select row toward the bottom edge of
             the scroll area. ── */}
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3 flex flex-col gap-3">
          {/* ── Leaderboard (basic clean list) ──────────────────────
               Previous version had an ornate ruins frame, platinum
               trophies on the top 3, and per-tier coloured chips —
               which combined into visual noise that obscured the
               actual ranking data. This is a stripped-down panel:
               numbered rows, avatar, username, W/L, BP. The current
               player's row is highlighted in purple. ── */}
          <div
            className="mx-auto rounded-2xl"
            style={{
              maxWidth: 360,
              background: "linear-gradient(180deg, rgba(20,10,40,0.82) 0%, rgba(10,6,22,0.86) 100%)",
              border: "1px solid rgba(167,139,250,0.22)",
              boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
            }}
          >
            <div className="px-3 pt-3 pb-1 flex items-center justify-between">
              <div
                className="text-[14px] font-black tracking-[0.18em] text-white/90"
                data-testid="text-leaderboard-title"
              >
                LEADERBOARD
              </div>
              <div className="text-[9px] tracking-[0.2em] text-white/35">RANK · BP</div>
            </div>
            <div className="px-3 pb-3">
              {leaderboard.length === 0 ? (
                <div className="text-center text-white/40 text-[11px] py-4" data-testid="text-leaderboard-empty">
                  No matches played yet
                </div>
              ) : (
                <div className="flex flex-col">
                  {leaderboard.slice(0, 25).map((entry, i) => {
                    const rank = i + 1;
                    const isMe = entry.userId === me?.id;
                    return (
                      <div
                        key={entry.userId}
                        data-testid={`row-leaderboard-${rank}`}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-md"
                        style={{
                          background: isMe ? "rgba(124,58,237,0.22)" : "transparent",
                          borderBottom: i === Math.min(24, leaderboard.length - 1) ? "none" : "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <div className="w-6 text-right text-white/55 text-[12px] font-bold tabular-nums shrink-0">
                          {rank}
                        </div>
                        {entry.profileImage
                          ? <img src={entry.profileImage} className="w-7 h-7 rounded-full object-cover border border-white/10 shrink-0" />
                          : <div className="w-7 h-7 rounded-full bg-purple-900/40 border border-purple-400/15 flex items-center justify-center shrink-0">
                              <img src={petPawIcon} alt="" style={{ width: 16, height: 16, objectFit: "contain", opacity: 0.5 }} />
                            </div>}
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <div className="text-white/95 text-[12px] font-semibold truncate">{entry.username}</div>
                          <RoleBadge isAdmin={entry.isAdmin} isModerator={entry.isModerator} />
                        </div>
                        <div className="text-white/35 text-[10px] tabular-nums shrink-0">{entry.wins}W · {entry.losses}L</div>
                        <div className="text-amber-300 text-[12px] font-black tabular-nums shrink-0 w-12 text-right">
                          {Math.max(0, entry.battlePoints)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Player's own placement row — pinned below the list so
                  they can always see where they stand even when not in
                  the top 25. */}
              {myRank ? (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-md"
                    data-testid="row-my-placement"
                    style={{
                      background: "rgba(124,58,237,0.22)",
                      border: "1px solid rgba(167,139,250,0.45)",
                    }}
                  >
                    <div className="w-6 text-right text-white/85 text-[12px] font-bold tabular-nums shrink-0">
                      {myRank}
                    </div>
                    {me?.profileImage
                      ? <img src={me.profileImage} className="w-7 h-7 rounded-full object-cover border border-white/15 shrink-0" />
                      : <div className="w-7 h-7 rounded-full bg-purple-900/40 border border-purple-400/15 flex items-center justify-center shrink-0">
                          <img src={petPawIcon} alt="" style={{ width: 16, height: 16, objectFit: "contain", opacity: 0.5 }} />
                        </div>}
                    <div className="flex-1 min-w-0 text-white/95 text-[12px] font-semibold truncate">
                      {me?.username ?? "You"} <span className="text-white/40 font-normal">(you)</span>
                    </div>
                    <div className="text-white/45 text-[10px] tabular-nums shrink-0">{myLb?.entry.wins ?? 0}W · {myLb?.entry.losses ?? 0}L</div>
                    <div className="text-amber-300 text-[12px] font-black tabular-nums shrink-0 w-12 text-right">
                      {Math.max(0, myBp)}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Prepare for Battle: 5 pet slots + 5 potion slots ──────
               mt-auto pushes this card toward the bottom of the scroll
               area so the leaderboard above gets more breathing room
               and BEGIN BATTLE sits just above the thumb. ── */}
          <div
            className="rounded-2xl p-3 mx-auto mt-auto w-full"
            style={{
              maxWidth: 360,
              background: "linear-gradient(180deg, rgba(20,10,40,0.78) 0%, rgba(10,6,22,0.82) 100%)",
              border: "1px solid rgba(167,139,250,0.22)",
              boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
            }}
          >
            <div className="text-center mb-3">
              <div
                className="text-[15px] font-black tracking-[0.18em]"
                style={{
                  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                  color: "#fde68a",
                  textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                }}
                data-testid="text-prepare-for-battle"
              >
                PREPARE FOR BATTLE
              </div>
            </div>

            {/* Pets */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Users size={13} className="text-purple-300" />
                <span className="text-[10px] tracking-[0.18em] font-bold text-purple-200">PETS</span>
              </div>
              <span className="text-[10px] text-white/40" data-testid="text-pets-selected-count">{selectedPetIds.length}/5</span>
            </div>
            <div className="flex gap-2 justify-between mb-4">
              {Array.from({ length: 5 }, (_, i) => {
                const invId = selectedPetIds[i];
                const inv = invId ? hatchedPets.find((p: any) => (p.inventoryId || p.id) === invId) : null;
                return (
                  <button
                    key={i}
                    data-testid={`div-pet-slot-${i}`}
                    onClick={() => inv ? togglePet(invId) : setPickerOpen("pet")}
                    className="relative flex-1 rounded-xl flex items-center justify-center transition-all active:scale-95"
                    style={{
                      aspectRatio: "1 / 1",
                      background: inv ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${inv ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.10)"}`,
                      boxShadow: inv ? "0 0 10px rgba(124,58,237,0.25)" : undefined,
                    }}
                  >
                    {inv ? (
                      // Render at full slot size. PetAnimator without
                      // `fillContainer` only fills ~30% of its size box
                      // (the sprite frame has a lot of empty padding for
                      // squish/jump animations), which made pets look
                      // tiny and made the idle squish look like a
                      // glitch. fillContainer scales the inner canvas
                      // so the visible sprite fills the slot exactly.
                      <div className="w-full h-full p-1 flex items-center justify-center">
                        {inv.petTemplateId
                          ? <PetAnimator petTemplateId={inv.petTemplateId} mode="idle" view="front" size={88} fillContainer className="w-full h-full" />
                          : inv.imageUrl
                            ? <img src={inv.imageUrl} className="w-full h-full object-contain" />
                            : <img src={petPawIcon} alt="" className="w-full h-full object-contain" style={{ opacity: 0.7 }} />}
                      </div>
                    ) : (
                      <span className="text-2xl text-white/30 font-light">+</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Potions */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Droplets size={13} className="text-emerald-300" />
                <span className="text-[10px] tracking-[0.18em] font-bold text-emerald-200">POTIONS</span>
              </div>
              <span className="text-[10px] text-white/40" data-testid="text-potions-selected-count">{selectedPotionIds.length}/5</span>
            </div>
            <div className="flex gap-2 justify-between">
              {Array.from({ length: 5 }, (_, i) => {
                const invId = selectedPotionIds[i];
                const inv = invId ? battlePotions.find((p: any) => (p.inventoryId || p.id) === invId) : null;
                const isMana = inv && (inv.manaRestored ?? 0) > 0;
                return (
                  <button
                    key={i}
                    data-testid={`div-potion-slot-${i}`}
                    onClick={() => inv ? togglePotion(invId) : setPickerOpen("potion")}
                    className="relative flex-1 rounded-xl flex items-center justify-center transition-all active:scale-95"
                    style={{
                      aspectRatio: "1 / 1",
                      background: inv ? (isMana ? "rgba(124,58,237,0.22)" : "rgba(34,197,94,0.18)") : "rgba(255,255,255,0.04)",
                      border: `1px solid ${inv ? (isMana ? "rgba(167,139,250,0.55)" : "rgba(34,197,94,0.5)") : "rgba(255,255,255,0.10)"}`,
                    }}
                  >
                    {inv ? (
                      inv.imageUrl
                        ? <img src={inv.imageUrl} className="w-12 h-12 object-contain" />
                        : isMana
                          ? <Droplets className="w-7 h-7" style={{ color: "#a78bfa" }} />
                          : <Heart className="w-7 h-7" style={{ color: "#f87171", fill: "rgba(248,113,113,0.3)" }} />
                    ) : (
                      <span className="text-2xl text-white/30 font-light">+</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Sticky "Begin Battle" button ── */}
        <div className="shrink-0 px-4 pb-safe pb-5 pt-3" style={{ background: "linear-gradient(0deg, rgba(5,8,15,0.95) 0%, rgba(5,8,15,0.6) 100%)", borderTop: "1px solid rgba(167,139,250,0.08)" }}>
          <button
            data-testid="button-begin-battle"
            onClick={async () => {
              const hasPets = selectedPetIds.length > 0 || (battleGroup?.petInventoryIds?.length ?? 0) > 0;
              if (!hasPets) {
                toast({
                  title: "Pick at least one pet",
                  description: "Select pets above to send into battle.",
                  variant: "destructive",
                });
                return;
              }
              // Make sure the server's ticket count is current before spending.
              await refetchTickets().catch(() => {});
              if (ticketCount <= 0) {
                toast({
                  title: "Out of PvP tickets",
                  description: "You need a PvP Ticket to enter the Veridia Arena. Visit the shop to grab more!",
                  variant: "destructive",
                });
                return;
              }
              // Lock in the current team as the player's saved battle group.
              if (selectedPetIds.length > 0) saveBattleGroup.mutate(selectedPetIds);
              // Spend the ticket NOW (on "Begin Battle"), before matchmaking.
              try {
                const started = await startBattle.mutateAsync();
                setBattleToken(started.battleToken);
              } catch (err: any) {
                toast({
                  title: "Out of PvP tickets",
                  description: "Couldn't start the match. Try again once you have a PvP Ticket.",
                  variant: "destructive",
                });
                queryClient.invalidateQueries({ queryKey: ["/api/pvp/tickets"] });
                return;
              }
              setTab("matchmaking");
            }}
            className="w-full flex items-center justify-center gap-3 rounded-xl py-3.5 transition-all active:scale-95"
            style={{
              background: "linear-gradient(180deg, rgba(30,22,55,0.92) 0%, rgba(18,12,32,0.95) 100%)",
              border: "1px solid rgba(167,139,250,0.35)",
            }}
          >
            <img src={pvpNavIcon} alt="" className="w-8 h-8 object-contain" />
            <span className="text-[13px] tracking-[0.22em] font-bold text-amber-100" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}>BEGIN BATTLE</span>
          </button>
        </div>
      </div>

      {/* ── Inventory picker sheet (pets or potions) ────────────────── */}
      {pickerOpen && (
        <div
          className="absolute inset-0 z-30 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
          onClick={() => setPickerOpen(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm mx-auto rounded-t-3xl"
            style={{
              background: "linear-gradient(180deg, #15102a 0%, #0a0814 100%)",
              border: "1px solid rgba(167,139,250,0.25)",
              borderBottom: "none",
              maxHeight: "82vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-white/5">
              <div className="text-[12px] font-bold tracking-[0.2em] text-amber-100">
                {pickerOpen === "pet" ? "CHOOSE A PET" : "CHOOSE A POTION"}
              </div>
              <button
                data-testid="button-close-picker"
                onClick={() => setPickerOpen(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20"
              >
                <span className="text-white/70 text-sm">×</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {pickerOpen === "pet" ? (
                hatchedPets.length === 0 ? (
                  <div className="text-center py-10 text-white/40 text-[11px]">No hatched pets — visit your nursery!</div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {hatchedPets.map((inv: any) => {
                      const invId = inv.inventoryId || inv.id;
                      const selected = selectedPetIds.includes(invId);
                      const full = !selected && selectedPetIds.length >= 5;
                      return (
                        <button
                          key={invId}
                          data-testid={`button-pet-select-${invId}`}
                          disabled={full}
                          onClick={() => { togglePet(invId); if (!selected) setPickerOpen(null); }}
                          className="relative rounded-xl p-2 flex flex-col items-center gap-1 transition-all active:scale-95"
                          style={{
                            background: selected
                              ? "linear-gradient(135deg, rgba(124,58,237,0.32), rgba(167,139,250,0.10))"
                              : "rgba(255,255,255,0.04)",
                            border: `1px solid ${selected ? "rgba(167,139,250,0.6)" : "rgba(255,255,255,0.08)"}`,
                            opacity: full ? 0.4 : 1,
                          }}
                        >
                          {selected && (
                            <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                              <Check size={9} className="text-white" />
                            </div>
                          )}
                          <div className="w-20 h-20 flex items-center justify-center">
                            {inv.petTemplateId
                              ? <PetAnimator petTemplateId={inv.petTemplateId} mode="idle" view="front" size={80} fillContainer className="w-full h-full" />
                              : inv.imageUrl
                              ? <img src={inv.imageUrl} className="w-full h-full object-contain" />
                              : <img src={petPawIcon} alt="" className="w-14 h-14 object-contain" />}
                          </div>
                          <div className="text-white/85 text-[10px] truncate w-full text-center font-medium">{inv.petNickname || inv.name}</div>
                          <div className="text-white/40 text-[8px]">Lv {inv.petLevel || 1}</div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                potionStacks.length === 0 ? (
                  <div className="text-center py-10 text-white/40 text-[11px]">No battle potions in your bag.</div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {potionStacks.map((stack) => {
                      const inv = stack.rep;
                      const isMana = (inv.manaRestored ?? 0) > 0;
                      // How many of THIS stack the player has currently
                      // equipped, so the picker can show e.g. "×48"
                      // (50 in stack − 2 already in slots) and disable
                      // the stack once it's empty or the loadout is full.
                      const equippedFromStack = stack.ids.filter(id => selectedPotionIds.includes(id)).length;
                      const remaining = stack.count - equippedFromStack;
                      const loadoutFull = selectedPotionIds.length >= 5;
                      const disabled = remaining <= 0 || loadoutFull;
                      const partiallySelected = equippedFromStack > 0;
                      return (
                        <button
                          key={stack.key}
                          data-testid={`button-potion-stack-${stack.key}`}
                          disabled={disabled}
                          onClick={() => {
                            // Equip the next un-selected potion from this
                            // stack and immediately close the picker so
                            // the player can see the slot fill in.
                            const nextId = stack.ids.find(id => !selectedPotionIds.includes(id));
                            if (!nextId) return;
                            togglePotion(nextId);
                            setPickerOpen(null);
                          }}
                          className="relative rounded-xl p-2 flex flex-col items-center gap-1 transition-all active:scale-95"
                          style={{
                            background: partiallySelected
                              ? (isMana
                                  ? "linear-gradient(135deg, rgba(124,58,237,0.32), rgba(167,139,250,0.10))"
                                  : "linear-gradient(135deg, rgba(34,197,94,0.32), rgba(74,222,128,0.10))")
                              : "rgba(255,255,255,0.04)",
                            border: `1px solid ${partiallySelected ? (isMana ? "rgba(167,139,250,0.6)" : "rgba(34,197,94,0.6)") : "rgba(255,255,255,0.08)"}`,
                            opacity: disabled ? 0.4 : 1,
                          }}
                        >
                          {/* Stack count badge — shows how many are still
                              available in this stack (after equipping). */}
                          <div
                            className="absolute top-1 right-1 min-w-[22px] h-[18px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-black tabular-nums shrink-0"
                            data-testid={`text-potion-stack-count-${stack.key}`}
                            style={{
                              background: "rgba(0,0,0,0.7)",
                              border: `1px solid ${isMana ? "rgba(167,139,250,0.5)" : "rgba(34,197,94,0.5)"}`,
                              color: isMana ? "#c4b5fd" : "#86efac",
                            }}
                          >
                            ×{remaining}
                          </div>
                          <div className="w-14 h-14 flex items-center justify-center">
                            {inv.imageUrl
                              ? <img src={inv.imageUrl} className="w-12 h-12 object-contain" />
                              : isMana
                                ? <Droplets className="w-9 h-9" style={{ color: "#a78bfa" }} />
                                : <Heart className="w-9 h-9" style={{ color: "#f87171", fill: "rgba(248,113,113,0.3)" }} />}
                          </div>
                          <div className="text-white/85 text-[10px] truncate w-full text-center font-medium">{inv.name}</div>
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
                      <div className="w-20 h-20 flex items-center justify-center">
                        {inv.petTemplateId
                          ? <PetAnimator petTemplateId={inv.petTemplateId} mode="idle" view="front" size={80} fillContainer className="w-full h-full" />
                          : inv.imageUrl
                          ? <img src={inv.imageUrl} className="w-full h-full object-contain" />
                          : <img src={petPawIcon} alt="" className="w-14 h-14 object-contain" />}
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
              onClick={() => saveBattleGroup.mutate(selectedPetIds)}
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

      {/* ── Matchmaking overlay ─────────────────────────────────────
           Appears after the player taps BEGIN BATTLE. The overlay
           runs its own search animation, picks the fairest opponent
           from the already-loaded list, shows a "match found" flash,
           and then hands control back to us so we can mount the
           battle page. ── */}
      {tab === "matchmaking" && (
        <PvpMatchmakingOverlay
          me={me}
          myBp={myBp}
          opponents={opponents as Opponent[]}
          onCancel={() => {
            // Player bailed out before we locked a match. The ticket
            // has already been spent — that's intentional (same as any
            // arcade coin) — but we still return to the lobby cleanly.
            setTab("lobby");
            setBattleToken(null);
          }}
          onMatchConfirmed={(opp) => {
            setBattleOpponent(opp);
            setTab("battle");
          }}
        />
      )}

      {/* ── Opponents List (legacy manual picker, kept for admins) ─── */}
      {(tab as string) === "opponents" && (
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
