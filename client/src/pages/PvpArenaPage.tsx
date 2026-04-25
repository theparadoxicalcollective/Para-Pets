import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { setNavHidden } from "@/lib/navVisibility";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import battleTrophyIcon from "@assets/generated_images/icon_battle_trophy.png";
import pvpTicketImg from "@assets/Photoroom_20260415_83701_PM_1776304592941.png";
import pvpNavIcon from "@assets/generated_images/nav_icon_pvp.png";
import coinIconImg from "@assets/icon_coin.png";
import { ArrowLeft, Users, Check, Heart, Droplets, Trophy, Plus, X } from "lucide-react";
import PvpBattlePage from "./PvpBattlePage";
import type { BattlePotionSlot } from "@/components/BattleArena";
import PvpMatchmakingOverlay from "@/components/PvpMatchmakingOverlay";
import forestBgImg from "@assets/generated_images/pvp_ruins_battlefield_bg.png";
import swordImg from "@assets/generated_images/pvp_battle_sword.png";
import RoleBadge from "@/components/RoleBadge";
import PlayerDetailPanel from "@/components/PlayerDetailPanel";

// Ticket Shop bundles. Mirrors the server-authoritative price map in
// server/routes.ts (POST /api/pvp/tickets/buy). The server rejects any
// bundleId not in this map, so duplicating the table here is purely a
// UX choice — it lets the lobby render the shop without an extra
// round-trip and keeps prices visible at a glance for the player.
// Each entry also carries the visual "tier" used to style the card
// (border, glow, and how many fanned ticket cutouts sit behind the
// main one) so the higher bundles read as more premium at a glance.
const TICKET_BUNDLES: Array<{
  id: string;
  tickets: number;
  cost: number;
  tier: "bronze" | "silver" | "gold" | "purple" | "amber" | "magenta";
}> = [
  { id: "1",   tickets: 1,   cost: 50,   tier: "bronze"  },
  { id: "5",   tickets: 5,   cost: 250,  tier: "silver"  },
  { id: "10",  tickets: 10,  cost: 500,  tier: "gold"    },
  { id: "25",  tickets: 25,  cost: 1250, tier: "purple"  },
  { id: "50",  tickets: 50,  cost: 2500, tier: "amber"   },
  { id: "100", tickets: 100, cost: 5000, tier: "magenta" },
];

// Per-tier visual treatment. Borders/glows escalate so the 100-pack
// doesn't get visually lost next to the 1-pack. `stack` controls how
// many fanned ticket cutouts render behind the main ticket art.
const TIER_VISUALS: Record<string, { border: string; glow: string; chip: string; text: string; stack: number }> = {
  bronze:  { border: "rgba(205,127,50,0.55)",  glow: "0 0 18px rgba(205,127,50,0.30)",  chip: "rgba(205,127,50,0.18)",  text: "#d8a070", stack: 1 },
  silver:  { border: "rgba(203,213,225,0.55)", glow: "0 0 22px rgba(203,213,225,0.30)", chip: "rgba(203,213,225,0.18)", text: "#e2e8f0", stack: 2 },
  gold:    { border: "rgba(251,191,36,0.60)",  glow: "0 0 26px rgba(251,191,36,0.38)",  chip: "rgba(251,191,36,0.22)",  text: "#fbbf24", stack: 2 },
  purple:  { border: "rgba(167,139,250,0.65)", glow: "0 0 30px rgba(167,139,250,0.42)", chip: "rgba(167,139,250,0.22)", text: "#c4b5fd", stack: 3 },
  amber:   { border: "rgba(240,192,64,0.75)",  glow: "0 0 36px rgba(240,192,64,0.50)",  chip: "rgba(240,192,64,0.24)",  text: "#fcd34d", stack: 3 },
  magenta: { border: "rgba(255,80,255,0.80)",  glow: "0 0 44px rgba(255,80,255,0.55)",  chip: "rgba(255,80,255,0.22)",  text: "#f0abfc", stack: 4 },
};

interface LeaderboardEntry {
  userId: string;
  username: string;
  profileImage: string | null;
  battlePoints: number;
  wins: number;
  losses: number;
  // Sum of ATK across every pet the player has equipped in their saved
  // PvP battle group. Surfaced on the leaderboard so players can size
  // each other up at a glance — high BP + low ATK = a clever player on
  // a budget; high ATK + low BP = unrealised potential, etc.
  attackPower: number;
  isAdmin?: boolean;
  isModerator?: boolean;
  isBot?: boolean;
}

interface LeaderboardResponse {
  top: LeaderboardEntry[];
  // `rank` is null for accounts excluded from the public board
  // (admins, moderators, reserved aliases). `hidden` flags those
  // accounts so the Rank panel can show "N/A" instead of "#42".
  me: { rank: number | null; entry: LeaderboardEntry; inTop: boolean; hidden?: boolean } | null;
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
  // Snapshot of the opponent pool taken the moment the player tapped
  // Begin Battle. We hand THIS to the matchmaking overlay so the picker
  // can never disagree with the pre-flight pool check.
  const [matchmakingPool, setMatchmakingPool] = useState<Opponent[]>([]);
  // Centered alert modal — used for the high-stakes "can't begin battle"
  // failures (no pets, no tickets, no opponents). Toasts show as a thin
  // red bar on mobile that the player can easily miss; this modal is
  // unmissable.
  const [alertModal, setAlertModal] = useState<{ title: string; message: string } | null>(null);
  // Ticket Shop overlay. Opened by tapping the ticket chip (or its "+"
  // badge) in the header. While `purchasingBundleId` is non-null the
  // matching card shows a spinner and all cards are disabled so a
  // double-tap can't fire two charges.
  const [showTicketShop, setShowTicketShop] = useState(false);
  const [purchasingBundleId, setPurchasingBundleId] = useState<string | null>(null);
  // Confirmation step — when the player taps a bundle we DON'T charge
  // immediately. We stash the bundle id here so the confirmation overlay
  // can render the price + count and explicitly ask "Buy N tickets for X
  // coins?" before any coins are deducted. This protects against fat-
  // finger taps in a busy header and is also a standard pattern for any
  // hard-currency purchase. Cleared on Cancel or right before the actual
  // mutation fires on Confirm.
  const [pendingConfirmBundleId, setPendingConfirmBundleId] = useState<string | null>(null);
  // Celebration popup shown after a successful ticket purchase. The
  // `key` field is bumped on every win so React remounts the popup and
  // re-runs the entry animation, even when a player buys two bundles
  // back-to-back without the popup fully closing in between.
  const [celebration, setCelebration] = useState<
    { tickets: number; cost: number; key: number } | null
  >(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [groupSaved, setGroupSaved] = useState(false);
  // Tap-to-inspect: clicking any leaderboard row (or your own pinned row)
  // opens the universal PlayerDetailPanel with the same shape used on the
  // hub-page leaderboard. The PvP variant additionally passes pvpStats so
  // the popup gains a Wins / Losses / BP row plus the player's emblems.
  const [selectedPlayer, setSelectedPlayer] = useState<{
    userId: string;
    pvpStats: { wins: number; losses: number; battlePoints: number };
  } | null>(null);

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
  const { data: opponents = [], refetch: refetchOpponents } = useQuery<Opponent[]>({ queryKey: ["/api/pvp/opponents"] });
  // Inventory drives both the pet picker and the potion picker on the
  // single-page lobby, so it's loaded eagerly now (was only loaded for the
  // old "group" tab).
  const { data: inventory = [], isSuccess: inventoryReady } = useQuery<any[]>({ queryKey: ["/api/inventory"] });

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
  // the battle screen. Five SLOT max; each slot is a STACK of up to 50 of
  // one potion type (mirrors world battle prep). Slot positions are
  // stable: equipping a stack always fills the lowest-index empty slot,
  // and the slot persists across battles (used potions just shrink the
  // count via auto-clamping when inventory changes). Restored from
  // localStorage so the loadout survives reloads.
  const POTION_LS_KEY = "pvp:potionSlots:v2";
  const [selectedPotionSlots, setSelectedPotionSlots] = useState<(BattlePotionSlot | null)[]>(() => {
    // Strict v2 schema validator. We can't trust localStorage —
    // older builds, malformed entries, or tampered values would
    // otherwise leak straight into runtime state and crash deeper
    // consumers (BattleArena reads imageUrl, name, healthRestored,
    // etc.). So we explicitly require every field to be the right
    // shape before promoting a slot.
    const isValidSlot = (s: any): s is BattlePotionSlot => {
      if (!s || typeof s !== "object") return false;
      if (typeof s.shopItemId !== "string") return false;
      if (!Array.isArray(s.inventoryIds) || s.inventoryIds.length === 0) return false;
      if (!s.inventoryIds.every((id: unknown) => typeof id === "string" && id.length > 0)) return false;
      if (typeof s.name !== "string") return false;
      if (s.imageUrl != null && typeof s.imageUrl !== "string") return false;
      if (s.healthRestored != null && typeof s.healthRestored !== "number") return false;
      if (s.manaRestored != null && typeof s.manaRestored !== "number") return false;
      if (s.petsRevived != null && typeof s.petsRevived !== "number") return false;
      return true;
    };
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(POTION_LS_KEY) : null;
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

  // Which inventory picker is open (if any). Tapping an empty slot opens
  // the corresponding picker; tapping a tile inside the picker fills the
  // first empty slot of that type and closes the sheet.
  const [pickerOpen, setPickerOpen] = useState<null | "pet" | "potion">(null);

  // Leaderboard expansion: collapsed shows the top-10, expanded reveals
  // the rest (server returns up to 100). Toggled by the chip below the
  // header. Defaults to collapsed so the board doesn't dominate the
  // single-page lobby.
  const [showFullBoard, setShowFullBoard] = useState(false);

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

  // Buy a Ticket Shop bundle. The server holds the authoritative price
  // table (see POST /api/pvp/tickets/buy in server/routes.ts), so the
  // client just sends the bundleId. After a successful purchase we
  // refresh the ticket count, inventory, and the auth/me query so the
  // top-bar coin balance updates everywhere immediately — no flicker.
  const buyTickets = useMutation({
    mutationFn: async (bundleId: string) => {
      const res = await apiRequest("POST", "/api/pvp/tickets/buy", { bundleId });
      return res.json() as Promise<{
        user: any;
        ticketsAdded: number;
        ticketsRemaining: number;
        cost: number;
      }>;
    },
    onSuccess: (data) => {
      // Push the fresh user (with deducted coins) into the cache so the
      // header coin chip and any other consumer of /api/auth/me update
      // synchronously without waiting for a refetch.
      if (data.user) queryClient.setQueryData(["/api/auth/me"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      // Trigger the centered celebration popup. The bumped key forces a
      // remount so the entry animation plays again on rapid back-to-back
      // buys instead of just silently swapping the numbers.
      setCelebration({
        tickets: data.ticketsAdded,
        cost: data.cost,
        key: Date.now(),
      });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to buy tickets";
      const parsed = (() => { try { return JSON.parse(msg.replace(/^\d+:\s*/, "")); } catch { return null; } })();
      toast({
        title: "Purchase failed",
        description: parsed?.message || msg,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setPurchasingBundleId(null);
      // Release the imperative submit lock that confirmPendingPurchase
      // grabs — without this, a player who hits any error and then re-
      // opens the shop would find Confirm permanently disabled.
      confirmSubmitLock.current = false;
    },
  });

  // Tapping a bundle stages it for confirmation — it does NOT charge
  // the player yet. The actual mutation only fires from
  // `confirmPendingPurchase` once the player taps Confirm in the
  // overlay, so any accidental fat-finger tap on a 5,000-coin bundle
  // is recoverable. We still gate against the in-flight flags so a
  // second tap during a still-resolving purchase can't restage.
  const handleBuyBundle = (bundleId: string) => {
    if (purchasingBundleId || buyTickets.isPending || pendingConfirmBundleId) return;
    setPendingConfirmBundleId(bundleId);
  };

  // Imperative submit lock for Confirm. Belt-and-suspenders on top of
  // the React-state gate below: if two click events fire within the
  // same micro-task batch (before React has a chance to re-render with
  // the new `purchasingBundleId`), the ref check rejects the second
  // call synchronously. Cleared in the mutation's `onSettled` via
  // `setPurchasingBundleId(null)` — see below.
  const confirmSubmitLock = useRef(false);

  // Confirm path — flip from "asking" to "buying" and fire the
  // mutation. Triple-gate (ref lock + React state + react-query's
  // own pending flag) so a stuck-key, accessibility tool, or rapid
  // double-tap can't ever queue two charges for the same bundle.
  const confirmPendingPurchase = () => {
    const bundleId = pendingConfirmBundleId;
    if (!bundleId) return;
    if (confirmSubmitLock.current) return;
    if (purchasingBundleId || buyTickets.isPending) return;
    confirmSubmitLock.current = true;
    setPendingConfirmBundleId(null);
    setPurchasingBundleId(bundleId);
    buyTickets.mutate(bundleId);
  };

  // Cancel path — drop the staged bundle without charging. Safe to
  // call any time; the celebration popup is gated on a successful
  // mutation response so it can never appear from a cancel.
  const cancelPendingPurchase = () => {
    if (purchasingBundleId || buyTickets.isPending) return;
    setPendingConfirmBundleId(null);
  };

  // Close the ticket shop on Escape (standard dialog behavior). We
  // refuse to close while a purchase is mid-flight so the user can't
  // accidentally lose visibility of the spinner / outcome toast.
  useEffect(() => {
    if (!showTicketShop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (purchasingBundleId || buyTickets.isPending) return;
      // Esc has a layered behavior: if a confirmation overlay is up,
      // Esc dismisses just the confirm step (returning the player to
      // the shop). Otherwise Esc closes the shop itself. This matches
      // standard nested-dialog behavior and keeps the player from
      // accidentally bailing out of the whole shop when they only
      // wanted to back out of a single bundle.
      if (pendingConfirmBundleId) {
        setPendingConfirmBundleId(null);
      } else {
        setShowTicketShop(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showTicketShop, purchasingBundleId, buyTickets.isPending, pendingConfirmBundleId]);

  // Focus management for the purchase-confirmation dialog. When it
  // opens we move focus to Cancel (safer default than Confirm — a
  // stray Enter shouldn't charge the player), and when it closes we
  // restore focus to whatever element had it before, so keyboard
  // users land back on the bundle button they tapped.
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!pendingConfirmBundleId) return;
    previousFocusRef.current = (document.activeElement as HTMLElement) || null;
    // requestAnimationFrame to ensure the button is mounted before we
    // try to focus it on the first commit.
    const raf = requestAnimationFrame(() => cancelBtnRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      // Only restore if the previously-focused node still lives in the
      // DOM (e.g. the bundle button) — otherwise the browser's default
      // focus-fallback to <body> is fine.
      const prev = previousFocusRef.current;
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [pendingConfirmBundleId]);

  // Auto-dismiss the celebration popup ~2.2s after it appears. We key
  // the timer on `celebration?.key` so a second purchase that re-opens
  // the popup also resets its dismissal clock instead of inheriting
  // the previous one's countdown and disappearing too quickly.
  useEffect(() => {
    if (!celebration) return;
    const t = window.setTimeout(() => setCelebration(null), 2200);
    return () => window.clearTimeout(t);
  }, [celebration?.key]);

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

  // Active pet: the player's currently-equipped pet from the rest of the
  // game. We always seed the first PvP slot with it so the player never
  // shows up to a fight with no active pet, and so the active-pet swap
  // (done from the home/care screens) flows through here automatically.
  const activePetId: string | null = me?.activePetId ?? null;

  // Push the active pet into slot 0 whenever it changes (or on first hydrate).
  // Important: we must NOT run this before the saved battle group has been
  // hydrated, otherwise it sets `hasUserEdited` and the hydration effect
  // refuses to overwrite our seed list with the actually-saved team — which
  // is the bug that made saved pets "vanish" when leaving and re-entering
  // the arena. Wait for hydration to settle, then sync the active pet in.
  useEffect(() => {
    if (!hydratedFromServer.current) return;
    if (!activePetId) return;
    setSelectedPetIds((prev) => {
      // Already there as slot 0 → no-op.
      if (prev[0] === activePetId) return prev;
      // Remove any older copy of the active pet from the slot list, then
      // put it at the front. Cap the resulting list at 5 so the user's
      // hand-picked extras aren't pushed off the end silently.
      const rest = prev.filter((id) => id !== activePetId);
      return [activePetId, ...rest].slice(0, 5);
    });
  }, [activePetId, battleGroup]);

  const togglePet = (invId: string) => {
    // Slot 0 is locked to the active pet — taps on it shouldn't remove it.
    if (activePetId && invId === activePetId) return;
    hasUserEdited.current = true;
    setSelectedPetIds(prev =>
      prev.includes(invId) ? prev.filter(id => id !== invId) : prev.length < 5 ? [...prev, invId] : prev
    );
  };

  // Tap a filled slot → clear that slot. Tap an empty slot → open picker.
  const removePotionSlot = (slotIdx: number) => {
    setSelectedPotionSlots(prev => {
      if (!prev[slotIdx]) return prev;
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
  };

  // Picker → equip up to 50 unequipped ids of this type into the
  // lowest-index empty slot. Auto-closes the picker.
  const equipPotionStackToNextEmpty = (rep: any, allIdsForType: string[]) => {
    setSelectedPotionSlots(prev => {
      const emptyIdx = prev.findIndex(s => s === null);
      if (emptyIdx === -1) return prev;
      const alreadyEquipped = new Set(prev.flatMap(s => s ? s.inventoryIds : []));
      const available = allIdsForType
        .filter(id => !alreadyEquipped.has(id))
        .slice(0, POTION_STACK_SIZE);
      if (available.length === 0) return prev;
      const next = [...prev];
      next[emptyIdx] = {
        shopItemId: rep.shopItemId || `name:${rep.name}`,
        inventoryIds: available,
        name: rep.name,
        imageUrl: rep.imageUrl ?? null,
        healthRestored: rep.healthRestored ?? null,
        manaRestored: rep.manaRestored ?? null,
        petsRevived: rep.petsRevived ?? null,
      };
      return next;
    });
    setPickerOpen(null);
  };

  // Auto-clamp slots when inventory changes — drop ids that no longer
  // exist (consumed in battle, sold, etc.) so the slot count reflects
  // only what's actually usable. If a slot's stack drops to zero it
  // becomes empty and the player can re-fill it. We intentionally
  // also clamp when inventory is an empty array (no potions left)
  // so persisted-from-localStorage stale ids don't keep haunting
  // the loadout — that was the root cause of the "first empty slot
  // gets skipped" bug. Only skip when the query hasn't resolved yet
  // (inventory is not an array at all).
  useEffect(() => {
    // Wait for the first successful inventory load. The default `[]`
    // on the query means we can't distinguish "loading with empty
    // fallback" from "resolved with no potions" using `inventory`
    // alone — without this gate, a cold reload would clamp persisted
    // slots to null before inventory ever arrived.
    if (!inventoryReady || !Array.isArray(inventory)) return;
    const validIds = new Set<string>();
    for (const i of inventory as any[]) {
      if (i && i.type === "potion") validIds.add(i.inventoryId || i.id);
    }
    setSelectedPotionSlots(prev => {
      let changed = false;
      const next = prev.map(slot => {
        if (!slot) return slot;
        const filtered = slot.inventoryIds.filter(id => validIds.has(id));
        if (filtered.length === slot.inventoryIds.length) return slot;
        changed = true;
        if (filtered.length === 0) return null;
        return { ...slot, inventoryIds: filtered };
      });
      return changed ? next : prev;
    });
  }, [inventory, inventoryReady]);

  // Memoize the filtered potion slots so the array's identity only
  // changes when the underlying slots actually change. Without this,
  // every parent rerender would hand a brand-new array to
  // PvpBattlePage, retriggering its `useEffect([potionSlots])` reset
  // and clobbering any optimistic local consumption mid-battle.
  const battlePotionSlotsProp = useMemo(
    () => selectedPotionSlots.filter((s): s is BattlePotionSlot => s !== null),
    [selectedPotionSlots],
  );

  if (tab === "battle" && battleOpponent && battleToken) {
    return (
      <PvpBattlePage
        opponent={battleOpponent}
        myPetIds={selectedPetIds.length > 0 ? selectedPetIds : battleGroup?.petInventoryIds ?? []}
        potionSlots={battlePotionSlotsProp}
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
  const myWins = myLb?.entry.wins ?? 0;
  const myLosses = myLb?.entry.losses ?? 0;
  const hasPlayed = (myWins + myLosses) > 0;
  // Mods / admins are tracked but never ranked — show N/A in the
  // Rank panel and skip the "your placement" row under the board.
  const isHiddenFromBoard = !!myLb?.hidden;

  // Owned emblems will plug in here once the rank-rewards flow exists.
  // For now we render an empty 5-slot row as a visual placeholder so the
  // panel layout is locked in.
  const myEmblems: { id: string; name: string; imageUrl: string }[] = [];

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
      <div className="relative z-10 flex items-center gap-3 pl-4 pr-2 pb-2.5 shrink-0" style={{ background: "rgba(5,8,15,0.7)", borderBottom: "1px solid rgba(167,139,250,0.12)", paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
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
            the most prominent control in the header. Now doubles as
            the entry point to the Ticket Shop: tapping the chip (or
            the "+" badge) opens the buy-with-coins overlay so a
            player who's running low can refill in two taps without
            leaving the arena. */}
        <button
          type="button"
          onClick={() => setShowTicketShop(true)}
          className="relative flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
          data-testid="button-open-ticket-shop"
          aria-label="Open ticket shop"
        >
          <img
            src={pvpTicketImg}
            alt="PvP ticket"
            style={{
              width: 40,
              height: 40,
              objectFit: "contain",
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))",
            }}
          />
          {/* Order: [ticket icon] [×count] [+ badge]. The count sits
              immediately next to its icon so the "you have N tickets"
              read happens in one glance, and the "+" sits on the
              right as the obvious "tap to buy more" affordance.
              Slightly smaller than the old absolute version so it
              doesn't crowd the count. */}
          <span
            className="text-[13px] font-black text-amber-200"
            style={{ textShadow: "0 0 8px rgba(251,191,36,0.4)" }}
            data-testid="text-pvp-ticket-count"
          >
            ×{ticketCount}
          </span>
          <span
            className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg, #fbbf24 0%, #d97706 100%)",
              border: "1px solid rgba(0,0,0,0.5)",
              boxShadow: "0 0 6px rgba(251,191,36,0.6)",
            }}
            aria-hidden
          >
            <Plus size={8} strokeWidth={3.5} color="#1a0e00" />
          </span>
        </button>
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
              <button
                data-testid="button-toggle-leaderboard-size"
                onClick={() => setShowFullBoard(v => !v)}
                className="text-[9px] tracking-[0.18em] font-bold px-2 py-0.5 rounded-md active:scale-95"
                style={{
                  background: "rgba(167,139,250,0.16)",
                  border: "1px solid rgba(167,139,250,0.35)",
                  color: "#c4b5fd",
                }}
              >
                {showFullBoard ? "TOP 10" : "TOP 100"}
              </button>
            </div>
            <div className="px-3 pb-3">
              {leaderboard.length === 0 ? (
                <div className="text-center text-white/40 text-[11px] py-4" data-testid="text-leaderboard-empty">
                  No matches played yet
                </div>
              ) : (
                <div
                  className={`flex flex-col ${showFullBoard ? "overflow-y-auto" : ""}`}
                  style={showFullBoard ? { maxHeight: 380 } : undefined}
                >
                  {/* Column headers — reads as a tiny key so players don't
                      have to guess what each number means. Spacers on the
                      left match the rank+avatar columns of each row so the
                      ATK / BP labels sit directly above their values. */}
                  <div
                    className="flex items-center gap-2.5 px-2 pb-1 mb-0.5 select-none"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                    data-testid="row-leaderboard-header"
                  >
                    <div className="w-6 shrink-0" />
                    <div className="w-7 shrink-0" />
                    <div className="flex-1 min-w-0 text-[8px] tracking-[0.22em] font-bold uppercase text-white/40">
                      Player
                    </div>
                    <div className="w-12 text-right text-[8px] tracking-[0.22em] font-bold uppercase text-rose-300/75">
                      ATK
                    </div>
                    <div className="w-14 text-right text-[8px] tracking-[0.22em] font-bold uppercase text-amber-200/80">
                      BP
                    </div>
                  </div>
                  {(showFullBoard ? leaderboard.slice(0, 100) : leaderboard.slice(0, 10)).map((entry, i) => {
                    const rank = i + 1;
                    const isMe = entry.userId === me?.id;
                    // Top-3 trophy icons: SAME Trophy glyph tinted to
                    // gold / silver / bronze so the podium reads as a
                    // tier of the same award rather than three different
                    // shapes. Matches what players expect from a sports
                    // leaderboard.
                    const trophy = rank === 1
                      ? { color: "#fbbf24", glow: "rgba(251,191,36,0.55)" }
                      : rank === 2
                        ? { color: "#cbd5e1", glow: "rgba(203,213,225,0.5)" }
                        : rank === 3
                          ? { color: "#d97706", glow: "rgba(217,119,6,0.5)" }
                          : null;
                    const lastIdx = (showFullBoard ? Math.min(99, leaderboard.length - 1) : Math.min(9, leaderboard.length - 1));
                    return (
                      <div
                        key={entry.userId}
                        data-testid={`row-leaderboard-${rank}`}
                        role="button"
                        onClick={() => setSelectedPlayer({
                          userId: entry.userId,
                          pvpStats: {
                            wins: entry.wins,
                            losses: entry.losses,
                            battlePoints: entry.battlePoints,
                          },
                        })}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-white/5 active:scale-[0.99]"
                        style={{
                          background: isMe ? "rgba(124,58,237,0.22)" : "transparent",
                          borderBottom: i === lastIdx ? "none" : "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <div className="w-6 flex items-center justify-end shrink-0">
                          {trophy ? (
                            <Trophy
                              size={16}
                              style={{ color: trophy.color, filter: `drop-shadow(0 0 4px ${trophy.glow})` }}
                              data-testid={`icon-trophy-${rank}`}
                            />
                          ) : (
                            <span className="text-white/55 text-[12px] font-bold tabular-nums">{rank}</span>
                          )}
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
                        {/* Total ATK power of the player's equipped PvP
                            group. Sits immediately to the LEFT of BP so
                            both numbers can be scanned together. Red tint
                            so it visually reads as a "weapon stat"
                            distinct from the gold BP score. */}
                        <div
                          className="text-rose-300 text-[12px] font-bold tabular-nums shrink-0 w-12 text-right"
                          data-testid={`text-leaderboard-atk-${rank}`}
                          title="Total ATK of equipped PvP group"
                        >
                          {Math.max(0, entry.attackPower ?? 0)}
                        </div>
                        <div className="text-amber-300 text-[13px] font-black tabular-nums shrink-0 w-14 text-right">
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
              {myRank && !isHiddenFromBoard ? (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-purple-700/30 active:scale-[0.99]"
                    data-testid="row-my-placement"
                    role="button"
                    onClick={() => me?.id && setSelectedPlayer({
                      userId: me.id,
                      pvpStats: {
                        wins: myLb?.entry.wins ?? 0,
                        losses: myLb?.entry.losses ?? 0,
                        battlePoints: myLb?.entry.battlePoints ?? 0,
                      },
                    })}
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
                    {/* ATK + BP — same column layout as the leaderboard
                        rows above so the player's pinned row visually
                        aligns with the list. */}
                    <div
                      className="text-rose-300 text-[12px] font-bold tabular-nums shrink-0 w-12 text-right"
                      data-testid="text-my-placement-atk"
                      title="Total ATK of equipped PvP group"
                    >
                      {Math.max(0, myLb?.entry.attackPower ?? 0)}
                    </div>
                    <div className="text-amber-300 text-[13px] font-black tabular-nums shrink-0 w-14 text-right">
                      {Math.max(0, myBp)}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Rank panel: shows the player's standing at a glance.
               Sits between the leaderboard and the Prepare-for-Battle
               card so it's the first thing the player sees about their
               own performance every time they enter the arena. ── */}
          <div
            className="rounded-2xl p-3 mx-auto w-full"
            style={{
              maxWidth: 360,
              background: "linear-gradient(180deg, rgba(20,10,40,0.78) 0%, rgba(10,6,22,0.82) 100%)",
              border: "1px solid rgba(167,139,250,0.22)",
              boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
            }}
            data-testid="card-rank-panel"
          >
            <div className="text-center mb-2">
              <div
                className="text-[15px] font-black tracking-[0.18em]"
                style={{
                  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                  color: "#fde68a",
                  textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                }}
                data-testid="text-rank-title"
              >
                RANK
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div
                className="rounded-lg py-1.5 flex flex-col items-center justify-center"
                style={{ background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.25)" }}
              >
                <div className="text-[8px] tracking-[0.2em] text-purple-200/70 font-bold">RANK</div>
                <div className="text-white text-[15px] font-black tabular-nums leading-tight" data-testid="text-my-rank">
                  {isHiddenFromBoard ? "N/A" : (hasPlayed && myRank ? `#${myRank}` : "—")}
                </div>
                {isHiddenFromBoard ? (
                  <div className="text-[7px] tracking-wider text-white/35">STAFF</div>
                ) : !hasPlayed ? (
                  <div className="text-[7px] tracking-wider text-white/35">UNRANKED</div>
                ) : null}
              </div>
              <div
                className="rounded-lg py-1.5 flex flex-col items-center justify-center"
                style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.30)" }}
              >
                <div className="text-[8px] tracking-[0.2em] text-amber-200/70 font-bold">BP</div>
                <div className="text-amber-300 text-[15px] font-black tabular-nums leading-tight" data-testid="text-my-bp">
                  {Math.max(0, myBp)}
                </div>
              </div>
              <div
                className="rounded-lg py-1.5 flex flex-col items-center justify-center"
                style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)" }}
              >
                <div className="text-[8px] tracking-[0.2em] text-emerald-200/70 font-bold">W · L</div>
                <div className="text-white text-[13px] font-black tabular-nums leading-tight" data-testid="text-my-wl">
                  <span className="text-emerald-300">{myWins}</span>
                  <span className="text-white/30 mx-0.5">·</span>
                  <span className="text-red-300">{myLosses}</span>
                </div>
              </div>
            </div>

            {/* Emblems row — empty placeholder for now. Wired up to the
                emblems table; the actual award flow is TBD. */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Trophy size={13} className="text-amber-300" />
                <span className="text-[10px] tracking-[0.18em] font-bold text-amber-200">EMBLEMS</span>
              </div>
              <span className="text-[10px] text-white/40" data-testid="text-emblems-count">{myEmblems.length}/5</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5" data-testid="row-my-emblems">
              {Array.from({ length: 5 }, (_, i) => {
                const em = myEmblems[i];
                return (
                  <div
                    key={i}
                    data-testid={`div-emblem-slot-${i}`}
                    className="rounded-lg flex items-center justify-center"
                    style={{
                      aspectRatio: "1 / 1",
                      background: em ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${em ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    {em ? (
                      <img src={em.imageUrl} alt={em.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <span className="text-white/20 text-base">·</span>
                    )}
                  </div>
                );
              })}
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
            {/*
              Grid layout instead of flex — guarantees each of the 5 slots
              gets exactly the same width so nothing slips off the edge of
              a narrower phone screen. Slot 0 is reserved for the player's
              active pet and gets a thicker amber border + "ACTIVE" tag.
            */}
            <div className="grid grid-cols-5 gap-1.5 mb-4" data-testid="pvp-pet-slots">
              {Array.from({ length: 5 }, (_, i) => {
                const invId = selectedPetIds[i];
                const inv = invId ? hatchedPets.find((p: any) => (p.inventoryId || p.id) === invId) : null;
                const isActiveSlot = i === 0;
                const isActivePetHere = isActiveSlot && !!activePetId && invId === activePetId;
                return (
                  <button
                    key={i}
                    data-testid={`div-pet-slot-${i}`}
                    onClick={() => {
                      // Slot 0 is locked to the active pet. Don't let it
                      // un-equip and don't open the picker for it.
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
                          ? "rgba(124,58,237,0.18)"
                          : "rgba(255,255,255,0.04)",
                      border: isActivePetHere
                        ? "2px solid rgba(251,191,36,0.85)"
                        : `1px solid ${inv ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.10)"}`,
                      boxShadow: isActivePetHere
                        ? "0 0 14px rgba(251,191,36,0.55), inset 0 0 10px rgba(251,191,36,0.15)"
                        : inv
                          ? "0 0 10px rgba(124,58,237,0.25)"
                          : undefined,
                    }}
                  >
                    {inv ? (
                      <div className="w-full h-full p-0.5 flex items-center justify-center">
                        {/* Battle-group slot — always uses the still PNG.
                            Was previously a parts-based PetAnimator when
                            petTemplateId existed, but PvP is intentionally
                            still-image-only across the lobby + battle
                            (matches the user's "we don't need the canvas
                            for PvP" decision). */}
                        {(inv.hatchedImageUrl || inv.imageUrl)
                          ? <img src={inv.hatchedImageUrl || inv.imageUrl} className="w-full h-full object-contain" draggable={false} />
                          : <img src={petPawIcon} alt="" className="w-full h-full object-contain" style={{ opacity: 0.7 }} draggable={false} />}
                      </div>
                    ) : (
                      <span className="text-xl text-white/30 font-light">+</span>
                    )}
                    {isActivePetHere && (
                      // Tiny "ACTIVE" tag pinned to the slot's bottom edge
                      // so the player knows this slot is auto-managed.
                      <div
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded text-[7px] font-black tracking-[0.18em] whitespace-nowrap pointer-events-none"
                        style={{
                          background: "rgba(120,75,8,0.95)",
                          color: "#fde68a",
                          border: "1px solid rgba(251,191,36,0.7)",
                          textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                        }}
                      >
                        ACTIVE
                      </div>
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
              <span className="text-[10px] text-white/40" data-testid="text-potions-selected-count">{selectedPotionSlots.filter(Boolean).length}/5</span>
            </div>
            <div className="flex gap-2 justify-between">
              {Array.from({ length: 5 }, (_, i) => {
                const slot = selectedPotionSlots[i];
                const qty = slot?.inventoryIds.length ?? 0;
                const isEmpty = !slot || qty === 0;
                const isMana = slot && (slot.manaRestored ?? 0) > 0;
                const isRevive = slot && (slot.petsRevived ?? 0) > 0;
                return (
                  <button
                    key={i}
                    data-testid={`div-potion-slot-${i}`}
                    onClick={() => isEmpty ? setPickerOpen("potion") : removePotionSlot(i)}
                    className="relative flex-1 rounded-xl flex items-center justify-center transition-all active:scale-95"
                    style={{
                      aspectRatio: "1 / 1",
                      background: isEmpty
                        ? "rgba(255,255,255,0.04)"
                        : isRevive
                          ? "rgba(251,191,36,0.20)"
                          : isMana
                            ? "rgba(124,58,237,0.22)"
                            : "rgba(34,197,94,0.18)",
                      border: `1px solid ${isEmpty
                        ? "rgba(255,255,255,0.10)"
                        : isRevive
                          ? "rgba(251,191,36,0.55)"
                          : isMana
                            ? "rgba(167,139,250,0.55)"
                            : "rgba(34,197,94,0.5)"}`,
                    }}
                  >
                    {isEmpty ? (
                      <span className="text-2xl text-white/30 font-light">+</span>
                    ) : (
                      <>
                        {slot.imageUrl
                          ? <img src={slot.imageUrl} className="w-12 h-12 object-contain" />
                          : isRevive
                            ? <span className="text-2xl">✨</span>
                            : isMana
                              ? <Droplets className="w-7 h-7" style={{ color: "#a78bfa" }} />
                              : <Heart className="w-7 h-7" style={{ color: "#f87171", fill: "rgba(248,113,113,0.3)" }} />}
                        {/* Stack count badge — shows how many of this
                            potion are currently equipped in this slot. */}
                        <div
                          className="absolute -bottom-1 -right-1 min-w-[20px] h-[18px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-black tabular-nums"
                          data-testid={`text-potion-slot-qty-${i}`}
                          style={{
                            background: "rgba(0,0,0,0.85)",
                            border: `1px solid ${isRevive ? "rgba(251,191,36,0.55)" : isMana ? "rgba(167,139,250,0.55)" : "rgba(34,197,94,0.55)"}`,
                            color: isRevive ? "#fde68a" : isMana ? "#c4b5fd" : "#86efac",
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

        {/* ── Sticky "Begin Battle" button ── */}
        <div className="shrink-0 px-4 pb-safe pb-5 pt-3" style={{ background: "linear-gradient(0deg, rgba(5,8,15,0.95) 0%, rgba(5,8,15,0.6) 100%)", borderTop: "1px solid rgba(167,139,250,0.08)" }}>
          <button
            data-testid="button-begin-battle"
            onClick={async () => {
              const hasPets = selectedPetIds.length > 0 || (battleGroup?.petInventoryIds?.length ?? 0) > 0;
              if (!hasPets) {
                setAlertModal({
                  title: "Pick at least one pet",
                  message: "Select pets above to send into battle.",
                });
                return;
              }
              // Make sure the server's ticket count is current before promising
              // the player a battle.
              await refetchTickets().catch(() => {});
              if (ticketCount <= 0) {
                setAlertModal({
                  title: "Out of PvP tickets",
                  message: "You need a PvP Ticket to enter the Veridia Arena. Visit the shop to grab more!",
                });
                return;
              }
              // Pull a fresh opponent list so we don't drop into matchmaking
              // with a stale (or empty) pool — that's the most common cause
              // of the matchmaking overlay silently bouncing back to lobby.
              const fresh = await refetchOpponents().catch(() => null);
              const pool = (fresh?.data as Opponent[] | undefined) ?? (opponents as Opponent[]);
              const usable = (pool ?? []).filter(
                (o) => o.userId !== me?.id && (o.petInventoryIds?.length ?? 0) > 0,
              );
              if (usable.length === 0) {
                setAlertModal({
                  title: "No opponents available",
                  message: "Nobody else has a battle group set up yet. Try again in a little while!",
                });
                return;
              }
              // Hand the *exact* validated pool to the overlay so the
              // picker draws from the same list we just confirmed.
              setMatchmakingPool(usable);
              // Lock in the current team as the player's saved battle group.
              if (selectedPetIds.length > 0) saveBattleGroup.mutate(selectedPetIds);
              // NOTE: We do NOT spend the ticket here. The ticket is
              // consumed inside `onMatchConfirmed` once a real opponent has
              // been locked in — that way cancelling the matchmaking
              // overlay never burns a ticket the player didn't use.
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
                            {(inv.hatchedImageUrl || inv.imageUrl)
                              ? <img src={inv.hatchedImageUrl || inv.imageUrl} className="w-full h-full object-contain" draggable={false} />
                              : <img src={petPawIcon} alt="" className="w-14 h-14 object-contain" draggable={false} />}
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
                      const allEquippedIds = new Set(
                        selectedPotionSlots.flatMap(s => s ? s.inventoryIds : []),
                      );
                      const equippedFromStack = stack.ids.filter(id => allEquippedIds.has(id)).length;
                      const remaining = stack.count - equippedFromStack;
                      const loadoutFull = selectedPotionSlots.every(s => s !== null);
                      const disabled = remaining <= 0 || loadoutFull;
                      const partiallySelected = equippedFromStack > 0;
                      return (
                        <button
                          key={stack.key}
                          data-testid={`button-potion-stack-${stack.key}`}
                          disabled={disabled}
                          onClick={() => {
                            // Equip the entire stack (up to 50 of this
                            // potion type) into the lowest-index empty
                            // slot and close the picker so the player
                            // immediately sees the slot fill in.
                            equipPotionStackToNextEmpty(stack.rep, stack.ids);
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
                        {(inv.hatchedImageUrl || inv.imageUrl)
                          ? <img src={inv.hatchedImageUrl || inv.imageUrl} className="w-full h-full object-contain" draggable={false} />
                          : <img src={petPawIcon} alt="" className="w-14 h-14 object-contain" draggable={false} />}
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
          opponents={matchmakingPool}
          onCancel={() => {
            // Player bailed out before we locked a match. Because we
            // defer ticket spending until `onMatchConfirmed`, no ticket
            // is consumed when the overlay is cancelled.
            setTab("lobby");
            setBattleToken(null);
          }}
          onMatchConfirmed={async (opp) => {
            // Spend the ticket here, the moment we know an opponent has
            // been locked in. If the spend fails (no tickets, network
            // error, etc.) we surface it as a centered modal and bounce
            // back to the lobby instead of starting a free battle.
            try {
              const started = await startBattle.mutateAsync();
              setBattleToken(started.battleToken);
              setBattleOpponent(opp);
              setTab("battle");
            } catch (err: any) {
              setTab("lobby");
              setAlertModal({
                title: "Couldn't start the match",
                message:
                  "Your PvP Ticket couldn't be spent. Please make sure you still have a ticket and try again.",
              });
              queryClient.invalidateQueries({ queryKey: ["/api/pvp/tickets"] });
            }
          }}
        />
      )}

      {/* ── Alert modal (centered, unmissable) ──────────────────────
          Replaces the thin red toast for the high-stakes Begin-Battle
          checks. Tap anywhere outside or the OK button to dismiss. */}
      {/* Tap-to-inspect popup — same shared card used on the hub
          leaderboard and world chat, just with PvP rank stats added. */}
      {selectedPlayer && (
        <PlayerDetailPanel
          userId={selectedPlayer.userId}
          currentUserId={me?.id}
          pvpStats={selectedPlayer.pvpStats}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {alertModal && (
        <div
          className="absolute inset-0 z-[80] flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(4px)" }}
          onClick={() => setAlertModal(null)}
          data-testid="modal-pvp-alert"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl p-6 text-center"
            style={{
              background: "linear-gradient(180deg, #1a1230 0%, #0a0814 100%)",
              border: "1px solid rgba(167,139,250,0.35)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.6), 0 0 28px rgba(167,139,250,0.15)",
            }}
          >
            <div
              className="text-[13px] tracking-[0.22em] font-black mb-3 text-amber-200"
              style={{ textShadow: "0 0 14px rgba(251,191,36,0.35)" }}
              data-testid="text-pvp-alert-title"
            >
              {alertModal.title}
            </div>
            <div
              className="text-white/80 text-[13px] leading-relaxed mb-6"
              data-testid="text-pvp-alert-message"
            >
              {alertModal.message}
            </div>
            <button
              onClick={() => setAlertModal(null)}
              data-testid="button-pvp-alert-dismiss"
              className="w-full rounded-xl py-3 text-amber-100 text-[12px] tracking-[0.22em] font-bold active:scale-95"
              style={{
                background: "linear-gradient(180deg, rgba(60,40,90,0.9) 0%, rgba(30,20,55,0.95) 100%)",
                border: "1px solid rgba(167,139,250,0.45)",
              }}
            >
              GOT IT
            </button>
          </div>
        </div>
      )}

      {/* ── Ticket Shop overlay ──────────────────────────────────────
          Buy more PvP tickets with in-game coins. Six bundles, each
          rendered as a card with a layered ticket cutout (more layers
          = bigger bundle), the ticket count, and the coin price. The
          server validates bundleId against its own price map so the
          client cannot fake a cheaper purchase. */}
      {/* Celebration popup — fires on every successful ticket bundle
          purchase. Sits at z-[95] (above the ticket-shop modal at
          z-[85]) so even mid-shopping it appears front-and-center.
          Auto-dismisses after ~2.2s and is also tap-to-dismiss. The
          local <style> block defines a single keyframe used only by
          this card so we don't have to touch the global stylesheet. */}
      {celebration && (
        <div
          key={celebration.key}
          className="absolute inset-0 z-[95] flex items-center justify-center pointer-events-none"
          data-testid="popup-ticket-purchase-success"
        >
          <style>{`
            @keyframes ticketCelebrationIn {
              0%   { transform: scale(0.6) translateY(20px); opacity: 0; }
              60%  { transform: scale(1.08) translateY(0); opacity: 1; }
              100% { transform: scale(1)    translateY(0); opacity: 1; }
            }
            @keyframes ticketCelebrationGlow {
              0%, 100% { box-shadow: 0 18px 50px rgba(0,0,0,0.7), 0 0 30px rgba(251,191,36,0.45); }
              50%      { box-shadow: 0 18px 50px rgba(0,0,0,0.7), 0 0 55px rgba(251,191,36,0.85); }
            }
          `}</style>
          <div
            onClick={() => setCelebration(null)}
            className="pointer-events-auto cursor-pointer rounded-2xl px-6 py-5 flex flex-col items-center gap-2"
            style={{
              minWidth: 240,
              background: "linear-gradient(180deg, #2a1f4a 0%, #120a26 100%)",
              border: "1px solid rgba(251,191,36,0.55)",
              animation: "ticketCelebrationIn 360ms cubic-bezier(0.18, 1.2, 0.4, 1) both, ticketCelebrationGlow 1.6s ease-in-out infinite",
            }}
          >
            <img
              src={pvpTicketImg}
              alt=""
              style={{
                width: 72,
                height: 72,
                objectFit: "contain",
                filter: "drop-shadow(0 6px 12px rgba(251,191,36,0.55))",
              }}
            />
            <div
              className="text-[26px] font-black tracking-wide text-amber-200 leading-none"
              style={{ textShadow: "0 0 14px rgba(251,191,36,0.65)" }}
              data-testid="text-celebration-tickets"
            >
              +{celebration.tickets} TICKET{celebration.tickets === 1 ? "" : "S"}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <img src={coinIconImg} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
              <span
                className="text-[12px] font-bold text-amber-100/80"
                data-testid="text-celebration-cost"
              >
                {celebration.cost.toLocaleString()} coins spent
              </span>
            </div>
          </div>
        </div>
      )}

      {showTicketShop && (
        <div
          className="absolute inset-0 z-[85] flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(4px)" }}
          onClick={() => {
            // Block backdrop-dismiss while a purchase is in flight or a
            // confirmation is staged — otherwise tapping outside would
            // either lose the in-flight result or silently abandon the
            // staged buy without a clear cancel.
            if (purchasingBundleId || pendingConfirmBundleId) return;
            setShowTicketShop(false);
          }}
          data-testid="modal-ticket-shop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-shop-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col"
            style={{
              maxHeight: "90vh",
              background: "linear-gradient(180deg, #1a1230 0%, #0a0814 100%)",
              border: "1px solid rgba(167,139,250,0.35)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.6), 0 0 28px rgba(167,139,250,0.2)",
            }}
          >
            {/* Header — title, current coin balance, close button */}
            <div
              className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
              style={{ borderColor: "rgba(167,139,250,0.18)" }}
            >
              <img src={pvpTicketImg} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
              <div className="flex-1 min-w-0">
                <div
                  id="ticket-shop-title"
                  className="text-[14px] font-black tracking-[0.18em] text-amber-200"
                  style={{ textShadow: "0 0 10px rgba(251,191,36,0.4)" }}
                  data-testid="text-ticket-shop-title"
                >
                  TICKET SHOP
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <img src={coinIconImg} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
                  <span
                    className="text-[12px] font-bold text-amber-100/90"
                    data-testid="text-ticket-shop-balance"
                  >
                    {(me?.coins ?? 0).toLocaleString()}
                  </span>
                  <span className="text-white/40 text-[10px] ml-1">coins</span>
                </div>
              </div>
              <button
                onClick={() => {
                  if (purchasingBundleId || pendingConfirmBundleId) return;
                  setShowTicketShop(false);
                }}
                disabled={!!purchasingBundleId || !!pendingConfirmBundleId}
                data-testid="button-close-ticket-shop"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white active:scale-90 disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                aria-label="Close ticket shop"
              >
                <X size={16} />
              </button>
            </div>

            {/* Bundle grid */}
            <div className="overflow-y-auto px-3 py-3">
              <div className="grid grid-cols-2 gap-2.5">
                {TICKET_BUNDLES.map((bundle) => {
                  const v = TIER_VISUALS[bundle.tier];
                  const canAfford = (me?.coins ?? 0) >= bundle.cost;
                  const isBuying = purchasingBundleId === bundle.id;
                  // Disable every other bundle once one is staged for
                  // confirmation, so the player commits to a single
                  // choice before being asked. The staged bundle stays
                  // tappable but is a no-op (handleBuyBundle early-
                  // returns) — its visual state is unchanged so it
                  // doesn't look "selected" in a confusing way.
                  const isPendingConfirm = pendingConfirmBundleId === bundle.id;
                  const disabled =
                    !!purchasingBundleId ||
                    (!!pendingConfirmBundleId && !isPendingConfirm) ||
                    !canAfford;
                  // ── Tap-vs-scroll guard ──────────────────────────
                  // Plain onClick on a button inside a vertically-
                  // scrolling shop list fires too easily on mobile —
                  // iOS Safari in particular treats a finger that
                  // moved <10 px as a "click" even if the user was
                  // clearly trying to scroll. We track the pointer-
                  // down position and skip onClick if the finger
                  // travelled >12 px in any direction during the
                  // gesture. 12 px is generous enough to absorb
                  // jitter but tight enough that a real intentional
                  // tap still lands. We also consider the gesture a
                  // scroll if the touch lasts longer than ~700 ms
                  // (slow-drag scrolling). Refs live on the closure
                  // so each bundle button stays self-contained.
                  let downX = 0, downY = 0, downT = 0, moved = false;
                  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
                    downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = false;
                  };
                  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
                    if (moved) return;
                    if (Math.abs(e.clientX - downX) > 12 || Math.abs(e.clientY - downY) > 12) moved = true;
                  };
                  const onClickGuarded: React.MouseEventHandler<HTMLButtonElement> = (e) => {
                    // Block synthetic clicks that follow a scroll-
                    // gesture or a long-press.
                    if (moved || performance.now() - downT > 700) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    handleBuyBundle(bundle.id);
                  };
                  return (
                    <button
                      key={bundle.id}
                      type="button"
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onClick={onClickGuarded}
                      disabled={disabled}
                      data-testid={`button-buy-ticket-bundle-${bundle.id}`}
                      className="relative flex flex-col items-center justify-between rounded-xl px-2 pt-3 pb-2.5 active:scale-[0.97] transition-transform disabled:opacity-50 disabled:active:scale-100"
                      style={{
                        background: "linear-gradient(180deg, rgba(20,14,38,0.95) 0%, rgba(8,6,18,0.95) 100%)",
                        border: `1px solid ${v.border}`,
                        boxShadow: v.glow,
                        minHeight: 168,
                        // Allow vertical scrolling to start from this
                        // button's hit area without the browser
                        // needing to "decide" between tap and pan —
                        // touch-action: pan-y immediately yields the
                        // gesture to the scroll container as soon as
                        // any vertical movement is detected.
                        touchAction: "pan-y",
                      }}
                    >
                      {/* Ticket fan — layered ticket cutouts behind the
                          main one so bigger bundles read as more loot.
                          Each underlying layer is rotated and offset so
                          the stack fans out. */}
                      <div
                        className="relative flex items-center justify-center"
                        style={{ width: 72, height: 64 }}
                      >
                        {Array.from({ length: Math.max(0, v.stack - 1) }).map((_, i) => {
                          const offset = (i + 1);
                          const angle = (i % 2 === 0 ? -1 : 1) * (8 + offset * 4);
                          return (
                            <img
                              key={i}
                              src={pvpTicketImg}
                              alt=""
                              aria-hidden
                              style={{
                                position: "absolute",
                                width: 56,
                                height: 56,
                                objectFit: "contain",
                                transform: `translate(${angle * 0.4}px, ${offset * -2}px) rotate(${angle}deg)`,
                                opacity: 0.55 - i * 0.08,
                                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
                              }}
                            />
                          );
                        })}
                        <img
                          src={pvpTicketImg}
                          alt={`${bundle.tickets} PvP tickets`}
                          style={{
                            position: "relative",
                            zIndex: 1,
                            width: 64,
                            height: 64,
                            objectFit: "contain",
                            filter: `drop-shadow(0 0 10px ${v.border})`,
                          }}
                        />
                      </div>

                      {/* Quantity */}
                      <div
                        className="mt-1 px-2 py-0.5 rounded-md text-[15px] font-black"
                        style={{
                          background: v.chip,
                          color: v.text,
                          textShadow: `0 0 10px ${v.border}`,
                          letterSpacing: "0.04em",
                        }}
                        data-testid={`text-bundle-qty-${bundle.id}`}
                      >
                        ×{bundle.tickets}
                      </div>

                      {/* Price */}
                      <div className="flex items-center gap-1 mt-1.5">
                        <img src={coinIconImg} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
                        <span
                          className={`text-[12px] font-bold ${canAfford ? "text-amber-100" : "text-red-300/80"}`}
                          data-testid={`text-bundle-cost-${bundle.id}`}
                        >
                          {bundle.cost.toLocaleString()}
                        </span>
                      </div>

                      {/* Buying spinner / Not enough overlay */}
                      {isBuying && (
                        <div
                          className="absolute inset-0 rounded-xl flex items-center justify-center"
                          style={{ background: "rgba(10,8,20,0.7)" }}
                        >
                          <div
                            className="w-6 h-6 rounded-full border-2 border-amber-200 border-t-transparent animate-spin"
                            data-testid={`spinner-buy-${bundle.id}`}
                          />
                        </div>
                      )}
                      {!isBuying && !canAfford && !purchasingBundleId && (
                        <div
                          className="absolute bottom-1 left-1 right-1 text-center text-[9px] tracking-[0.15em] font-bold text-red-300/70 uppercase"
                          data-testid={`text-cant-afford-${bundle.id}`}
                        >
                          Not enough
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-center text-[10px] text-white/40 leading-relaxed">
                Tickets stack with what you already own.<br />
                One ticket lets you enter the Veridia Arena.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Purchase Confirmation overlay ──────────────────────────────
          Sits between the shop (z-[85]) and celebration (z-[95]) so it
          renders ON TOP of the shop dialog but never obscures a success
          popup. The mutation does not fire until the player taps
          Confirm here, which gives them an explicit chance to back out
          of any expensive bundle before any coins move. */}
      {(() => {
        if (!pendingConfirmBundleId) return null;
        const bundle = TICKET_BUNDLES.find((b) => b.id === pendingConfirmBundleId);
        if (!bundle) return null;
        const v = TIER_VISUALS[bundle.tier];
        const canAfford = (me?.coins ?? 0) >= bundle.cost;
        return (
          <div
            className="absolute inset-0 z-[90] flex items-center justify-center px-4"
            style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
            onClick={cancelPendingPurchase}
            data-testid="modal-ticket-purchase-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-confirm-title"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                // Minimal focus trap — only two interactive elements
                // live in this dialog (Cancel + Confirm), so we just
                // bounce focus between them on Tab. Keeps keyboard
                // users from tabbing into the shop behind the dialog.
                if (e.key !== "Tab") return;
                const cancel = cancelBtnRef.current;
                const confirm = confirmBtnRef.current;
                if (!cancel || !confirm) return;
                const active = document.activeElement;
                if (e.shiftKey && active === cancel) {
                  e.preventDefault();
                  confirm.focus();
                } else if (!e.shiftKey && active === confirm) {
                  e.preventDefault();
                  cancel.focus();
                }
              }}
              className="w-full max-w-xs rounded-2xl px-5 py-5 flex flex-col items-center gap-3"
              style={{
                background: "linear-gradient(180deg, #1a1230 0%, #0a0814 100%)",
                border: `1px solid ${v.border}`,
                boxShadow: `0 18px 50px rgba(0,0,0,0.7), ${v.glow}`,
              }}
            >
              <div
                id="ticket-confirm-title"
                className="text-[11px] font-black tracking-[0.22em] text-white/60"
                data-testid="text-ticket-confirm-title"
              >
                CONFIRM PURCHASE
              </div>
              <img
                src={pvpTicketImg}
                alt=""
                style={{
                  width: 64,
                  height: 64,
                  objectFit: "contain",
                  filter: `drop-shadow(0 0 12px ${v.border})`,
                }}
              />
              <div
                className="text-[22px] font-black leading-none"
                style={{ color: v.text, textShadow: `0 0 12px ${v.border}` }}
                data-testid="text-confirm-tickets"
              >
                ×{bundle.tickets} TICKET{bundle.tickets === 1 ? "" : "S"}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-white/50 text-[11px] tracking-wider">FOR</span>
                <img src={coinIconImg} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
                <span
                  className={`text-[14px] font-bold ${canAfford ? "text-amber-100" : "text-red-300"}`}
                  data-testid="text-confirm-cost"
                >
                  {bundle.cost.toLocaleString()}
                </span>
                <span className="text-white/50 text-[11px] tracking-wider">COINS</span>
              </div>
              {!canAfford && (
                <div
                  className="text-[10px] font-bold text-red-300/90 tracking-wider uppercase"
                  data-testid="text-confirm-cant-afford"
                >
                  Not enough coins
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 w-full mt-1">
                <button
                  ref={cancelBtnRef}
                  type="button"
                  onClick={cancelPendingPurchase}
                  data-testid="button-cancel-purchase"
                  className="py-2.5 rounded-lg text-[13px] font-bold text-white/80 active:scale-[0.97] transition-transform"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  Cancel
                </button>
                <button
                  ref={confirmBtnRef}
                  type="button"
                  onClick={confirmPendingPurchase}
                  disabled={!canAfford}
                  data-testid="button-confirm-purchase"
                  className="py-2.5 rounded-lg text-[13px] font-black tracking-wide active:scale-[0.97] transition-transform disabled:opacity-50 disabled:active:scale-100"
                  style={{
                    background: canAfford
                      ? "linear-gradient(180deg, #facc15 0%, #d97706 100%)"
                      : "rgba(120,80,20,0.4)",
                    color: canAfford ? "#1a1230" : "rgba(255,255,255,0.5)",
                    border: `1px solid ${canAfford ? "rgba(251,191,36,0.7)" : "rgba(255,255,255,0.1)"}`,
                    boxShadow: canAfford ? "0 4px 14px rgba(251,191,36,0.45)" : "none",
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
