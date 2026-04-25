import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { playHit, playPlayerHurt, playBattleVictory, playDefeat } from "@/lib/sounds";
import { ArrowLeft, X } from "lucide-react";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import battleTrophyIcon from "@assets/generated_images/icon_battle_trophy.png";
import skullDefeatIcon from "@assets/generated_images/icon_skull_defeat.png";
import forestBgImg from "@assets/generated_images/pvp_ruins_battlefield_bg.png";

interface Opponent {
  userId: string;
  username: string;
  profileImage: string | null;
  petInventoryIds: string[];
}

interface BattlePet {
  uid: string;
  invId: string;
  name: string;
  imageUrl: string | null;
  petTemplateId: string | null;
  starRarity: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  specialSkill: string | null;
  specialSkillType: string | null;
  skillDamagePercent: number | null;
  skillHealPercent: number | null;
  /** Generic skill router fields (admin-configurable). When present, these
   *  drive the cast routing instead of the legacy hardcoded skill names —
   *  this matches how PvE BattleArena resolves specials. */
  skillType: string | null;       // "damage" | "heal" | "revive" | "poison"
  skillAffects: string | null;    // "self" | "party" | "enemy" | "enemy_party"
  isPlayer: boolean;
  /** Slot index 0..4 — for allies it pins them to a fixed bottom slot;
   *  for enemies it fixes their float anchor across the top. */
  slotIdx: number;
  /** Live render position in arena %. For allies this is constant
   *  (slotX/slotY). For enemies this is recomputed every frame from
   *  baseX/baseY + sine offsets, OR overridden during a charge. */
  x: number;
  y: number;
  /** Enemy float anchor + wave parameters. Allies leave these as 0. */
  baseX: number;
  baseY: number;
  phase: number;
  amp: number;
  speed: number;
  isDead: boolean;
  mana: number;
}

interface FloatNum { id: number; x: number; y: number; value: number; isHeal?: boolean; isCrit?: boolean; }
interface SparkParticle { id: number; x: number; y: number; dx: number; dy: number; color: string; }

type SkillMode = "needs-enemy" | "auto";

interface PendingSkill {
  petUid: string;
  mode: SkillMode;
}

/** One enemy at a time charges down at a chosen ally — mirrors the
 *  Murk-Cave swoop attack. While charging we lerp the enemy's render
 *  position toward the target, deal damage on impact, then lerp back
 *  to its float anchor. Only one Charger may be active at a time so
 *  the screen never feels overwhelmed. */
interface Charger {
  enemyUid: string;
  targetUid: string;
  startMs: number;
  /** Charge-down duration before damage tick. */
  chargeMs: number;
  /** True after damage tick — enemy is returning to its float anchor. */
  returning: boolean;
  returnStartMs: number;
  returnMs: number;
}

interface DraggingPotion {
  invId: string;
  pointerId: number;
  /** Latest pointer position in arena % (for ally hit-test on drop). */
  arenaX: number;
  arenaY: number;
  /** Latest screen position (for the floating ghost icon). */
  screenX: number;
  screenY: number;
}

const MAX_MANA = 100;
/** Combo decays after this many ms with no swipe-hits. */
const COMBO_WINDOW_MS = 1400;
/** How often we try to spawn a new enemy charger when none is active.
 *  Tuned to 1500 ms so the total cycle (charge + return + gap) lands
 *  around 2.4 s — fast enough that enemies clearly read as "fighting
 *  back" but slow enough that the screen doesn't feel chaotic and the
 *  player has time to react with swipes / skills between hits. The
 *  earlier 900 ms cadence felt frantic per playtest feedback. */
// Lowered from 1500 → 700 ms per user feedback that "some enemy pets
// just sit there." With one-charger-at-a-time and a
// 5v5 lineup, a 1.5 s gap between attempts meant each individual
// enemy only got a chance to attack roughly once every ~3 seconds —
// enemies in the back of the rotation looked idle. 700 ms keeps the
// pacing feeling deliberate (enemies still telegraph and dive) while
// pushing the rotation through the lineup fast enough that every
// enemy visibly participates within the first few seconds. Combined
// with the round-robin candidate selection further down (longest-
// waiting enemy preferred), this addresses the "just sitting there"
// complaint without needing a full multi-charger refactor.
const CHARGE_INTERVAL_MS = 700;
/** How fast a charging enemy travels down to its target ally. */
const CHARGE_DIVE_MS = 720;
/** How fast it returns to the swarm after impact. */
const CHARGE_RETURN_MS = 300;
/** Damage % of enemy ATK when a charge lands on an ally. */
const CHARGE_DMG_MULT = 0.85;
// Passive mana constants removed per user feedback ("mana shouldn't
// fill automatically"). Mana now only accrues from giving or
// receiving hits — see SWIPE_MANA_* below for the swipe-side income
// and the +25 (charger) / +10 (target) / +8 (enemy hit by swipe)
// inline credits in the animate loop and handlePointerMove.
/** Mana the slot-0 attacker (the swipe focal pet) gains per landed
 *  swipe-hit. Held at 16 to match the pre-share-distribution rate so
 *  slot-0's special doesn't charge any slower than it did before — we
 *  ADD the party share on top of the existing attacker baseline rather
 *  than splitting it out of slot-0's allotment. */
const SWIPE_MANA_ATTACKER = 16;
/** Mana every OTHER alive ally gains per landed swipe-hit. Smaller
 *  than the attacker share so slot-0 still charges first, but enough
 *  that backup pets reach full mana within ~10 swipes — without this,
 *  party pets behind slot-0 effectively never got to use their
 *  specials, which read as "added pets don't get skills". */
const SWIPE_MANA_PARTY = 6;

function hpColor(pct: number) {
  if (pct > 0.5) return "#4ade80";
  if (pct > 0.25) return "#facc15";
  return "#f87171";
}

/** Pet has SOME castable special — covers admin-defined generic skills
 *  (skillType set) AND legacy named skills (specialSkill/Type set). */
function petHasSkill(pet: { specialSkill?: string | null; specialSkillType?: string | null; skillType?: string | null }): boolean {
  return !!(pet.skillType || pet.specialSkillType || pet.specialSkill);
}

/** Resolve the effective routing for a pet's special. Handles BOTH the new
 *  generic system (skillType + skillAffects, set in Admin) AND the legacy
 *  hardcoded skill-name system. Returns the same shape used by `fireSkill`
 *  so PvP behaves like PvE for the same configured pet. */
function resolveSkillRouting(pet: { specialSkill?: string | null; specialSkillType?: string | null; skillType?: string | null; skillAffects?: string | null }): { type: "damage" | "heal" | "revive" | "poison"; affects: "self" | "party" | "enemy" | "enemy_party" } | null {
  if (!petHasSkill(pet)) return null;
  // Generic system wins when admin set it explicitly.
  if (pet.skillType) {
    const t = pet.skillType as "damage" | "heal" | "revive" | "poison";
    const fallbackAffects = (t === "heal" || t === "revive") ? "self" : "enemy";
    return {
      type: t,
      affects: (pet.skillAffects as any) ?? fallbackAffects,
    };
  }
  // Legacy named skills — keep old behavior so existing pets don't break.
  const name = pet.specialSkillType || pet.specialSkill || "";
  switch (name) {
    case "Lazer":       return { type: "damage", affects: "enemy" };
    case "Bubble":      return { type: "damage", affects: "enemy_party" };
    case "Heal Self":   return { type: "heal",   affects: "self" };
    case "Heal Party":  return { type: "heal",   affects: "party" };
    case "Poison":      return { type: "poison", affects: "enemy" };
    case "Revive Party":return { type: "revive", affects: "party" };
    default:            return { type: "damage", affects: "enemy" };
  }
}

function skillMode(pet: { specialSkill?: string | null; specialSkillType?: string | null; skillType?: string | null; skillAffects?: string | null }): SkillMode {
  const r = resolveSkillRouting(pet);
  if (!r) return "auto";
  // Only single-target enemy casts need the player to pick a target.
  if (r.affects === "enemy") return "needs-enemy";
  return "auto";
}

let _uid = 0;
const nextUid = () => `u${_uid++}`;

export default function PvpBattlePage({
  opponent,
  myPetIds,
  potionInventoryIds = [],
  battleToken,
  onClose,
}: {
  opponent: Opponent;
  myPetIds: string[];
  potionInventoryIds?: string[];
  battleToken: string;
  onClose: (result: "win" | "loss" | null) => void;
}) {
  const [phase, setPhase] = useState<"loading" | "countdown" | "battle" | "result">("loading");
  const [countdown, setCountdown] = useState(3);
  const [resultOutcome, setResultOutcome] = useState<"win" | "loss" | null>(null);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [bpEarned, setBpEarned] = useState(0);

  const [pets, setPets] = useState<BattlePet[]>([]);
  const petsRef = useRef<BattlePet[]>([]);
  const battleActiveRef = useRef(false);
  const battleStartMsRef = useRef(0);
  const animFrameRef = useRef(0);

  const arenaRef = useRef<HTMLDivElement>(null);
  const isSlashingRef = useRef(false);
  const slashPathRef = useRef<{x:number;y:number}[]>([]);
  // DOM refs for the slash trail polylines so the pointer-move handler
  // can mutate the SVG `points` attribute DIRECTLY at finger-move rate
  // (~120 Hz on iOS) without triggering a React re-render of the whole
  // PvP page on every event. Without this the swipe handler called
  // setSlashTrail on every move event, which forced React to reconcile
  // 10+ pet wrappers, hp bars, mana bars, sparks, float numbers — the
  // exact "battle is laggy" symptom.
  const slashOuterRef = useRef<SVGPolylineElement>(null);
  const slashInnerRef = useRef<SVGPolylineElement>(null);
  const showSlashRef = useRef(false);
  const hitSetRef = useRef<Set<string>>(new Set());
  const lastAiSkillTime = useRef<Record<string, number>>({});
  const idRef = useRef(0);

  // ── DOM-direct refs for the per-frame motion / bar fills ────────────
  // The animate() RAF loop used to call `setPets([...ps])` 60 times per
  // second so the bound `style.left/top` and `style.width` on every
  // sprite & bar would re-render. With 8+ pets, plus their child HP/
  // mana bars, plus the (now removed) per-pet animator inside each
  // one, that meant React was reconciling the entire battle subtree
  // 60 fps — which is what made the screen feel "very glitchy".
  //
  // The fix: skip React entirely for things that change every frame.
  // We attach refs to the pet wrapper, the HP-bar inner, and the mana-
  // bar inner, then mutate `style.left/top/width/background` directly
  // inside the RAF loop. Discrete UI states (skill-ready glow, KO,
  // revive, sideCount changes) still need a real React render, so the
  // animate loop also pushes a throttled `setPets` snapshot ~5 Hz —
  // far cheaper than 60 Hz, but plenty often for those low-frequency
  // transitions.
  const petWrapperRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const petHpRefs      = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const petManaRefs    = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const lastSetPetsMsRef = useRef(0);

  // Boolean gate for the swipe trail — actual point list is mutated
  // straight onto the SVG polyline refs (see slashOuter/InnerRef above)
  // so a 60-Hz finger drag doesn't force a React re-render per event.
  const [showSlash, setShowSlash] = useState(false);
  const [floatNums, setFloatNums] = useState<FloatNum[]>([]);
  const [sparks, setSparks] = useState<SparkParticle[]>([]);
  const [hitFlash, setHitFlash] = useState<Record<string, boolean>>({});
  const [koSet, setKoSet] = useState<Set<string>>(new Set());

  // Combo: increments each unique enemy hit within COMBO_WINDOW_MS.
  // The damage multiplier scales 1× → 1.6× by combo 5+. We mirror the
  // count to a ref so the swipe-hit event can read+advance the same
  // value synchronously — using `comboCount` from the closure runs a
  // tick behind the actual count and divorces displayed combo from
  // applied damage.
  const [comboCount, setComboCount] = useState(0);
  const comboCountRef = useRef(0);
  const lastHitTimeRef = useRef(0);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Skill targeting state
  const [pendingSkill, setPendingSkill] = useState<PendingSkill | null>(null);
  const pendingSkillRef = useRef<PendingSkill | null>(null);

  // Active enemy charger (one at a time). Ref because the animate loop
  // mutates it every frame; mirrored to state only for "INCOMING!" UI.
  const chargerRef = useRef<Charger | null>(null);
  const lastChargeAttemptRef = useRef(0);
  // Per-enemy timestamp of the last charge attempt. Used by the
  // candidate-picker in the animate loop to prefer the longest-waiting
  // enemy, so attacks rotate through the whole lineup instead of
  // clustering on one or two pets.
  const enemyLastChargeMsRef = useRef<Record<string, number>>({});
  const [chargerView, setChargerView] = useState<Charger | null>(null);

  // Potion drag state — mirrored to a ref so the animate loop / pointer
  // handlers can read it synchronously.
  const draggingPotionRef = useRef<DraggingPotion | null>(null);
  const [draggingPotion, setDraggingPotion] = useState<DraggingPotion | null>(null);
  const [hoveredAllyUid, setHoveredAllyUid] = useState<string | null>(null);

  const { data: myInventory = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"] });
  const { data: oppPets = [], isLoading: oppLoading } = useQuery<any[]>({
    queryKey: ["/api/pvp/opponent-pets", opponent.userId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pvp/opponent-pets/${opponent.userId}`);
      return res.json();
    },
  });

  const { toast } = useToast();
  const recordResult = useMutation({
    mutationFn: async (data: { result: "win" | "loss"; opponentLevel: number }) => {
      const res = await apiRequest("POST", "/api/pvp/result", {
        opponentName: opponent.username,
        opponentImageUrl: opponent.profileImage,
        opponentLevel: data.opponentLevel,
        opponentUserId: opponent.userId,
        result: data.result,
        battleToken,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCoinsEarned(data.coinsEarned ?? 0);
      setBpEarned(data.battlePointsDelta ?? 0);
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    // Surface failures so wins/losses don't silently disappear into the void
    // (the original "I won but got no BP" bug). The battle UI still shows
    // the victory/defeat overlay, but the toast tells the player rewards
    // didn't post and that they should retry — the server is the source of
    // truth for BP and tickets.
    onError: (err: any) => {
      console.error("[pvp] failed to record battle result", err);
      toast({
        title: "Couldn't record battle result",
        description:
          "Your rewards didn't post — please check your connection and try another match.",
        variant: "destructive",
      });
      // Refresh in case the server actually did succeed before the response
      // failed in transit; this lets the leaderboard / tickets reconcile.
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  // ── Build pets ──────────────────────────────────────────────
  // Allies stand still across the BOTTOM (y=74%). Enemies float across
  // the TOP (y=20%) with per-pet sine offsets so the swarm undulates
  // instead of marching in lock-step. Slot X positions are spread
  // EVENLY based on how many pets are actually on each side — with
  // only 1–3 pets the old 12/31/50/69/88 layout dumped them on the
  // left edge of the arena while the other half showed all 5 slots,
  // which is the "battles look glitchy" feel.
  const slotsXFor = (n: number): number[] => {
    if (n <= 0) return [];
    if (n === 1) return [50];
    if (n === 2) return [35, 65];
    if (n === 3) return [22, 50, 78];
    if (n === 4) return [18, 39, 61, 82];
    return [15, 32, 50, 68, 85]; // 5
  };
  const buildPets = useCallback(() => {
    const inv = myInventory as any[];

    // Resolve actual ally inventory entries first so we can size their
    // slot row to the real count (skips ids we couldn't resolve).
    const myEntries = myPetIds
      .map((id) => ({ id, inv: inv.find((it: any) => (it.inventoryId || it.id) === id) }))
      .filter((e) => !!e.inv);
    const allySlotsX = slotsXFor(myEntries.length);
    const allySlotY = 74;

    const oppEntries = (oppPets as any[]).slice(0, 5);
    const enemySlotsX = slotsXFor(oppEntries.length);
    const enemySlotY = 20;

    const myPets: BattlePet[] = myEntries.map((e, i) => {
      const invItem = e.inv;
      const slotX = allySlotsX[i] ?? 50;
      return {
        uid: nextUid(), invId: e.id,
        name: invItem.petNickname || invItem.name || "Pet",
        // Pets in PvP should render as the hatched creature, not the
        // egg. shop_items stores both URLs; `imageUrl` is the shop /
        // egg art and `hatchedImageUrl` is the actual pet sprite. Fall
        // back to imageUrl only if a pet's hatched art is somehow
        // missing so we never render an empty slot. Use `||` (not
        // `??`) to match the rest of the codebase — an empty-string
        // hatchedImageUrl should fall through, not block fallback.
        imageUrl: (invItem as any).hatchedImageUrl || invItem.imageUrl || null,
        petTemplateId: invItem.petTemplateId ?? null,
        starRarity: invItem.starRarity ?? 1,
        maxHp: invItem.petHealth || 800, hp: invItem.petHealth || 800,
        atk: invItem.petAtk || 50, def: invItem.petDef || 30,
        specialSkill: invItem.specialSkill ?? null,
        specialSkillType: (invItem as any).specialSkillType ?? null,
        skillDamagePercent: (invItem as any).skillDamagePercent ?? null,
        skillHealPercent: (invItem as any).skillHealPercent ?? null,
        skillType: (invItem as any).skillType ?? null,
        skillAffects: (invItem as any).skillAffects ?? null,
        isPlayer: true,
        slotIdx: i,
        x: slotX, y: allySlotY,
        baseX: slotX, baseY: allySlotY,
        phase: 0, amp: 0, speed: 0,
        isDead: false, mana: 0,
      } as BattlePet;
    });

    const oppBattlePets: BattlePet[] = oppEntries.map((p: any, i: number) => {
      const baseX = enemySlotsX[i] ?? 50;
      return {
        uid: nextUid(), invId: p.inventoryId || p.id,
        name: p.petNickname || p.name || "Foe",
        // Same hatched-vs-egg fallback as for the player's own pets
        // — opponents are also hatched creatures and should never
        // show their egg art on the battlefield. Truthy `||` matches
        // the rest of the codebase so an empty-string hatched URL
        // still falls through to the egg art instead of rendering
        // a blank sprite.
        imageUrl: p.hatchedImageUrl || p.imageUrl || null,
        petTemplateId: p.petTemplateId ?? null,
        starRarity: p.starRarity ?? 1,
        maxHp: p.petHealth || 800, hp: p.petHealth || 800,
        atk: p.petAtk || 50, def: p.petDef || 30,
        specialSkill: p.specialSkill ?? null,
        specialSkillType: p.specialSkillType ?? null,
        skillDamagePercent: p.skillDamagePercent ?? null,
        skillHealPercent: p.skillHealPercent ?? null,
        skillType: p.skillType ?? null,
        skillAffects: p.skillAffects ?? null,
        isPlayer: false,
        slotIdx: i,
        x: baseX, y: enemySlotY,
        baseX, baseY: enemySlotY,
        // Stagger the sine so the swarm undulates. Amp scales DOWN as
        // the row gets fuller so neighbors don't overlap on impact —
        // 5 enemies across 12→88 leaves only ~19% per lane.
        phase: i * 1.2,
        amp: oppEntries.length >= 4 ? 2.5 : 4,
        speed: 1.1 + (i % 3) * 0.18,
        isDead: false, mana: 0,
      } as BattlePet;
    });

    if (!myPets.length) return null;
    return [...myPets, ...oppBattlePets];
  }, [myInventory, myPetIds, oppPets]);

  useEffect(() => {
    if (phase !== "loading" || oppLoading) return;
    const built = buildPets();
    if (!built || !built.filter(p => p.isPlayer).length) return;
    petsRef.current = built;
    setPets(built);
    setPhase("countdown");
  }, [phase, oppLoading, buildPets]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      battleActiveRef.current = true;
      battleStartMsRef.current = Date.now();
      setPhase("battle");
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Shared helpers ────────────────────────────────────────────
  const spawnFloatNum = useCallback((x: number, y: number, value: number, isHeal = false, isCrit = false) => {
    const fn: FloatNum = { id: idRef.current++, x, y, value, isHeal, isCrit };
    setFloatNums(prev => [...prev, fn]);
    setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), 950);
  }, []);

  const spawnSparks = useCallback((x: number, y: number, colors: string[]) => {
    const ns: SparkParticle[] = Array.from({ length: 7 }, (_, i) => {
      const angle = (i / 7) * Math.PI * 2;
      return { id: idRef.current++, x, y, dx: Math.cos(angle) * (1.5 + Math.random() * 2), dy: Math.sin(angle) * (1.5 + Math.random() * 2), color: colors[i % colors.length] };
    });
    setSparks(prev => [...prev, ...ns]);
    const ids = new Set(ns.map(s => s.id));
    setTimeout(() => setSparks(prev => prev.filter(s => !ids.has(s.id))), 520);
  }, []);

  const flashHit = useCallback((uid: string) => {
    setHitFlash(prev => ({ ...prev, [uid]: true }));
    setTimeout(() => setHitFlash(prev => ({ ...prev, [uid]: false })), 220);
  }, []);

  const doKo = useCallback((pet: BattlePet) => {
    pet.isDead = true;
    if (pet.isPlayer) playPlayerHurt(); else playHit();
    setKoSet(prev => new Set([...prev, pet.uid]));
    setTimeout(() => {
      petsRef.current = petsRef.current.filter(p => p.uid !== pet.uid);
      setPets([...petsRef.current]);
      setKoSet(prev => { const n = new Set(prev); n.delete(pet.uid); return n; });
    }, 1000);
  }, []);

  // ── Fire a special skill (shared for player & AI) ──────────────
  // Admin-configured pets store their cast routing in skillType +
  // skillAffects (matches PvE BattleArena.runPetSkill). Legacy named
  // skills (Lazer/Bubble/Heal Self/Heal Party/Poison/Revive Party) are
  // mapped to that routing via resolveSkillRouting() so EVERY pet that
  // works in PvE also works here, not just the original 5 names.
  const fireSkill = useCallback((attacker: BattlePet, target: BattlePet | null) => {
    const routing = resolveSkillRouting(attacker);
    if (!routing) { attacker.mana = 0; return; }
    attacker.mana = 0;

    const ps = petsRef.current;
    const myAlive = ps.filter(p => p.isPlayer && !p.isDead);
    const oppAlive = ps.filter(p => !p.isPlayer && !p.isDead);
    const myDead = ps.filter(p => p.isPlayer && p.isDead);
    const oppDead = ps.filter(p => !p.isPlayer && p.isDead);

    const applyDef = (raw: number, def: number) =>
      Math.max(1, Math.floor(raw - def * 0.25));

    // Visual sparks tinted by the skill's COSMETIC name (Lazer = gold,
    // Bubble = blue, ...) when present, else by the skill TYPE.
    const styleName = attacker.specialSkillType || attacker.specialSkill || "";
    const sparksByStyle: Record<string, string[]> = {
      "Lazer":  ["#fbbf24", "#f59e0b", "#fde68a"],
      "Bubble": ["#60a5fa", "#93c5fd", "#bfdbfe"],
      "Poison": ["#a3e635", "#84cc16", "#d9f99d"],
    };
    const colorsForType: Record<string, string[]> = {
      damage: ["#f97316", "#fb923c", "#fdba74"],
      heal:   ["#4ade80", "#86efac", "#bbf7d0"],
      revive: ["#fbbf24", "#fde68a", "#fef3c7"],
      poison: ["#a3e635", "#84cc16", "#d9f99d"],
    };
    const sparkColors = sparksByStyle[styleName] ?? colorsForType[routing.type] ?? ["#fbbf24", "#f59e0b", "#fde68a"];

    // Damage % defaults by type so unconfigured legacy pets still hit
    // for sensible numbers. The admin-set value (when present) wins.
    const dmgPct = (attacker.skillDamagePercent && attacker.skillDamagePercent > 0)
      ? attacker.skillDamagePercent / 100
      : (styleName === "Lazer" ? 2.5 : styleName === "Bubble" ? 0.85 : routing.type === "poison" ? 0.14 : 1.5);
    const healPct = (attacker.skillHealPercent && attacker.skillHealPercent > 0)
      ? attacker.skillHealPercent / 100
      : (routing.affects === "party" ? 0.35 : 0.5);

    // Resolve the actual pets the cast lands on, RELATIVE TO ATTACKER.
    // (AI-cast specials must hit the player's side, not the AI's own.)
    const enemiesOf = (a: BattlePet) => a.isPlayer ? oppAlive : myAlive;
    const alliesOf  = (a: BattlePet) => a.isPlayer ? myAlive  : oppAlive;
    const deadAlliesOf = (a: BattlePet) => a.isPlayer ? myDead : oppDead;

    if (routing.type === "damage") {
      const targets: BattlePet[] = routing.affects === "enemy_party"
        ? enemiesOf(attacker)
        : (target && !target.isDead ? [target] : enemiesOf(attacker).slice(0, 1));
      const isCrit = routing.affects === "enemy"; // single-target cast = "big hit"
      targets.forEach(t => {
        const dmg = applyDef(attacker.atk * dmgPct, t.def);
        t.hp = Math.max(0, t.hp - dmg);
        spawnFloatNum(t.x, t.y - 10, dmg, false, isCrit);
        spawnSparks(t.x, t.y, sparkColors);
        flashHit(t.uid);
        if (t.hp <= 0 && !t.isDead) doKo(t);
      });
      return;
    }

    if (routing.type === "heal") {
      const targets: BattlePet[] = routing.affects === "party"
        ? alliesOf(attacker)
        : [attacker];
      targets.forEach(p => {
        const heal = Math.max(1, Math.floor(attacker.atk * healPct));
        p.hp = Math.min(p.maxHp, p.hp + heal);
        spawnFloatNum(p.x, p.y - 10, heal, true);
        spawnSparks(p.x, p.y, sparkColors);
      });
      return;
    }

    if (routing.type === "revive") {
      const downed = deadAlliesOf(attacker);
      if (downed.length === 0) return;
      const reviveCount = routing.affects === "party" ? downed.length : 1;
      downed.slice(0, reviveCount).forEach(p => {
        p.isDead = false;
        p.hp = Math.max(1, Math.floor(p.maxHp * 0.5));
        spawnFloatNum(p.x, p.y - 10, p.hp, true);
        spawnSparks(p.x, p.y, sparkColors);
      });
      // Force a re-render of the (now-revived) sprites — KO removed them
      // from petsRef.current already, so we have to push them back.
      const revivedUids = new Set(downed.slice(0, reviveCount).map(p => p.uid));
      const inList = new Set(petsRef.current.map(p => p.uid));
      const toReadd = downed.slice(0, reviveCount).filter(p => !inList.has(p.uid));
      if (toReadd.length) {
        petsRef.current = [...petsRef.current, ...toReadd];
      }
      setPets([...petsRef.current]);
      // Eagerly clear KO overlay for the revived ones.
      setKoSet(prev => {
        const n = new Set(prev);
        for (const u of revivedUids) n.delete(u);
        return n;
      });
      return;
    }

    if (routing.type === "poison") {
      // 5 damage-over-time ticks at ~900 ms apart on a single enemy.
      const victim = (routing.affects === "enemy_party")
        ? enemiesOf(attacker)[0]
        : (target && !target.isDead ? target : enemiesOf(attacker)[0]);
      if (!victim) return;
      const tickDmg = Math.max(1, applyDef(attacker.atk * dmgPct, victim.def));
      spawnSparks(victim.x, victim.y, sparkColors);
      let ticks = 0;
      const t = setInterval(() => {
        if (!battleActiveRef.current || victim.isDead) { clearInterval(t); return; }
        ticks++;
        victim.hp = Math.max(0, victim.hp - tickDmg);
        spawnFloatNum(victim.x, victim.y - 6, tickDmg);
        if (ticks >= 5 || victim.hp <= 0) {
          clearInterval(t);
          if (victim.hp <= 0 && !victim.isDead) doKo(victim);
        }
      }, 900);
      return;
    }
  }, [spawnFloatNum, spawnSparks, flashHit, doKo]);

  // ── End battle ─────────────────────────────────────────────────
  // Stored on a ref so the rAF animate loop can call the LATEST version
  // without taking a dependency on `recordResult` (which is a fresh
  // useMutation object every render — taking it as a dep tore down and
  // restarted the animate loop on every state tick, dropping frames and
  // looking like the battle was "stuttering").
  const endBattleRef = useRef<(outcome: "win" | "loss") => void>(() => {});
  endBattleRef.current = (outcome: "win" | "loss") => {
    if (!battleActiveRef.current) return; // idempotent — guard against double-fire
    battleActiveRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
    if (outcome === "win") playBattleVictory(); else playDefeat();
    setResultOutcome(outcome);
    setPhase("result");
    setPendingSkill(null);
    pendingSkillRef.current = null;
    chargerRef.current = null;
    setChargerView(null);
    const enemies = petsRef.current.filter(p => !p.isPlayer);
    const avgHp = enemies.length > 0
      ? enemies.reduce((s, p) => s + p.maxHp, 0) / enemies.length
      : 100;
    const avgLvl = Math.max(1, Math.round(avgHp / 50));
    recordResult.mutate({ result: outcome, opponentLevel: avgLvl });
  };
  const endBattle = useCallback((outcome: "win" | "loss") => endBattleRef.current(outcome), []);

  // ── Main animate loop ──────────────────────────────────────────
  // Murk-Cave-style: enemies float at top with wave motion, allies
  // stand still at the bottom. One enemy at a time charges down to
  // attack a chosen ally, deals damage on impact, then returns.
  useEffect(() => {
    if (phase !== "battle") return;

    const animate = () => {
      if (!battleActiveRef.current) return;
      const now = Date.now();
      const t = (now - battleStartMsRef.current) / 1000;
      const ps = petsRef.current;
      const alive = ps.filter(p => !p.isDead);
      const myAlive = alive.filter(p => p.isPlayer);
      const oppAlive = alive.filter(p => !p.isPlayer);

      if (myAlive.length === 0) { endBattle("loss"); return; }
      if (oppAlive.length === 0) { endBattle("win"); return; }

      // ── Enemy floating + charge animation ───────────────────
      const charger = chargerRef.current;
      for (const e of oppAlive) {
        // If this enemy is the active charger, lerp its position.
        if (charger && charger.enemyUid === e.uid) {
          const target = ps.find(p => p.uid === charger.targetUid);
          if (!target || target.isDead) {
            // Target died mid-charge — snap back.
            chargerRef.current = null;
            setChargerView(null);
          } else if (!charger.returning) {
            const k = Math.min(1, (now - charger.startMs) / charger.chargeMs);
            // Smoothstep ease in-out — accelerates softly off the
            // formation, glides through the middle, then settles
            // smoothly into the target. Replaces the old `k * k`
            // ease-in which made the dive look like a discrete teleport
            // at impact (read by playtesters as "the enemies lag /
            // jump when attacking").
            const eased = k * k * (3 - 2 * k);
            e.x = e.baseX + (target.x - e.baseX) * eased;
            e.y = e.baseY + (target.y - e.baseY) * eased;
            if (k >= 1) {
              // Damage tick
              const raw = Math.max(1, e.atk * CHARGE_DMG_MULT - target.def * 0.25);
              const dmg = Math.max(1, Math.floor(raw + Math.random() * 6 - 3));
              target.hp = Math.max(0, target.hp - dmg);
              spawnFloatNum(target.x, target.y - 10, dmg);
              spawnSparks(target.x, target.y, ["#ef4444", "#f87171", "#fca5a5"]);
              flashHit(target.uid);
              playPlayerHurt();
              e.mana = Math.min(MAX_MANA, e.mana + 25);
              // Hit ally also gains some mana from being hit — per
              // user feedback, mana should ONLY fill from giving or
              // receiving hits (no passive ticks). +10 lets a pet
              // that's getting pummelled charge its special back up
              // for retaliation without feeling like free meter.
              target.mana = Math.min(MAX_MANA, target.mana + 10);
              if (target.hp <= 0 && !target.isDead) doKo(target);
              charger.returning = true;
              charger.returnStartMs = now;
            }
          } else {
            const k = Math.min(1, (now - charger.returnStartMs) / charger.returnMs);
            // Return-anchor uses current float pos so the snap-back blends.
            const floatX = e.baseX + Math.sin(t * e.speed + e.phase) * e.amp;
            const floatY = e.baseY + Math.sin(t * 0.6 + e.phase) * 1.5;
            e.x = e.x + (floatX - e.x) * k;
            e.y = e.y + (floatY - e.y) * k;
            if (k >= 1) {
              chargerRef.current = null;
              setChargerView(null);
            }
          }
        } else {
          // Idle float — sine in X, gentle bob in Y.
          e.x = e.baseX + Math.sin(t * e.speed + e.phase) * e.amp;
          e.y = e.baseY + Math.sin(t * 0.6 + e.phase) * 1.5;
        }

        // Passive enemy mana removed per user feedback ("mana bars
        // shouldn't automatically fill"). Enemies now only build mana
        // from landing a charge (+25 above) or being hit by a swipe
        // (+8 in handlePointerMove). With ~4 landed charges to a
        // special, AI casts are now a meaningful event rather than a
        // background timer.

        // AI special: auto-fire when mana fills. Keeps the screen
        // alive even if no charger has landed yet.
        if (e.mana >= MAX_MANA && (now - (lastAiSkillTime.current[e.uid] || 0)) > 5000) {
          lastAiSkillTime.current[e.uid] = now;
          if (petHasSkill(e)) {
            const sMode = skillMode(e);
            if (sMode === "needs-enemy") {
              const target = myAlive[Math.floor(Math.random() * myAlive.length)];
              if (target) fireSkill(e, target);
            } else {
              fireSkill(e, null);
            }
          } else {
            e.mana = 0;
          }
        }
      }

      // ── Spawn a new charger if none active ─────────────────
      // Prefer the enemy that has been waiting longest (smallest
      // lastChargeMs). With pure random selection we saw the same 1-2
      // enemies attack repeatedly while the rest "just sat there" —
      // tracking per-enemy last-charge time and picking from the two
      // most-stale candidates guarantees every enemy in the lineup
      // gets a turn within a single rotation, while keeping enough
      // randomness that the order isn't completely predictable.
      if (!chargerRef.current && now - lastChargeAttemptRef.current > CHARGE_INTERVAL_MS) {
        lastChargeAttemptRef.current = now;
        const candidates = oppAlive;
        if (candidates.length && myAlive.length) {
          const sorted = [...candidates].sort(
            (a, b) =>
              (enemyLastChargeMsRef.current[a.uid] ?? 0) -
              (enemyLastChargeMsRef.current[b.uid] ?? 0)
          );
          // Pick from the two most-stale (or just the one if 1v?).
          const pickWindow = Math.min(2, sorted.length);
          const enemy = sorted[Math.floor(Math.random() * pickWindow)];
          enemyLastChargeMsRef.current[enemy.uid] = now;
          const target = myAlive[Math.floor(Math.random() * myAlive.length)];
          const next: Charger = {
            enemyUid: enemy.uid,
            targetUid: target.uid,
            startMs: now,
            chargeMs: CHARGE_DIVE_MS,
            returning: false,
            returnStartMs: 0,
            returnMs: CHARGE_RETURN_MS,
          };
          chargerRef.current = next;
          setChargerView(next);
        }
      }

      // ── Allies: gentle bob in place + slow passive mana gain ─
      // Tiny Y-only sine bob (≈ 0.6 % of arena height) so allies feel
      // alive without drifting from their formation slot. Replaces the
      // old `bIdle` CSS keyframe (4 px transform bob on the wrapper):
      // the keyframe was running ON TOP of the float math and at a
      // different period from anything else, which made enemies look
      // jittery and allies look like they were ticking discrete frames.
      // Driving the bob from this single RAF loop keeps every pet on
      // the same time-base.
      // Passive ally mana removed per user feedback. Allies now only
      // build mana from swiping (SWIPE_MANA_ATTACKER / SWIPE_MANA_PARTY,
      // see handlePointerMove) or being hit by an enemy charge (+10
      // above). The bob is purely cosmetic.
      for (const a of myAlive) {
        a.x = a.baseX;
        a.y = a.baseY + Math.sin(t * 1.05 + (a.phase || a.slotIdx)) * 0.6;
      }

      // ── Per-frame DOM-direct sync (avoids React re-render storm) ──
      // `petsRef` already points at the same mutable array, so we don't
      // need to spread on every frame. Push the live `pet.x/y/hp/mana`
      // values straight to the DOM nodes we collected refs for during
      // render. React stays out of the way until the throttled snapshot
      // below fires, which is what keeps PvP from juddering.
      petsRef.current = ps;
      for (const p of ps) {
        const w = petWrapperRefs.current.get(p.uid);
        if (w) {
          w.style.left = `${p.x}%`;
          w.style.top  = `${p.y}%`;
        }
        const hpEl = petHpRefs.current.get(p.uid);
        if (hpEl) {
          const pct = Math.max(0, (p.hp / p.maxHp) * 100);
          hpEl.style.width      = `${pct}%`;
          hpEl.style.background = hpColor(p.hp / p.maxHp);
        }
        const mEl = petManaRefs.current.get(p.uid);
        if (mEl) {
          mEl.style.width      = `${(p.mana / MAX_MANA) * 100}%`;
          mEl.style.background = p.mana >= MAX_MANA ? "#c084fc" : "#4c1d95";
        }
      }
      // Throttled state push so React still fires for the discrete UI
      // states that depend on `pets` (skill-ready outline, "✦ Special"
      // label, sideCount in the slot-size formula, charger z-index).
      // 200 ms = ~5 Hz, way below render-storm threshold but fast
      // enough that the player never notices the delay on those
      // transitions.
      if (now - lastSetPetsMsRef.current > 200) {
        lastSetPetsMsRef.current = now;
        setPets([...ps]);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, endBattle, spawnFloatNum, spawnSparks, flashHit, doKo, fireSkill]);

  // ── Arena position helper ──────────────────────────────────────
  const getArenaPos = useCallback((cx: number, cy: number) => {
    if (!arenaRef.current) return { x: 50, y: 50 };
    const rect = arenaRef.current.getBoundingClientRect();
    return { x: ((cx - rect.left) / rect.width) * 100, y: ((cy - rect.top) / rect.height) * 100 };
  }, []);

  /** Advance the combo counter and return the new value so the caller
   *  can apply the matching multiplier in the same tick. */
  const bumpCombo = useCallback((): number => {
    const now = Date.now();
    const next = (now - lastHitTimeRef.current < COMBO_WINDOW_MS)
      ? comboCountRef.current + 1
      : 1;
    comboCountRef.current = next;
    setComboCount(next);
    lastHitTimeRef.current = now;
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => {
      comboCountRef.current = 0;
      setComboCount(0);
    }, COMBO_WINDOW_MS);
    return next;
  }, []);

  // ── Pointer handlers ───────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
    // While dragging a potion, the chip owns the pointer — ignore arena.
    if (draggingPotionRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pos = getArenaPos(e.clientX, e.clientY);
    const ps = petsRef.current;

    // ─ Skill targeting mode ─
    const ps_ref = pendingSkillRef.current;
    if (ps_ref) {
      const skill_pet = ps.find(p => p.uid === ps_ref.petUid);
      if (!skill_pet) { setPendingSkill(null); pendingSkillRef.current = null; return; }
      if (ps_ref.mode === "needs-enemy") {
        const oppAlive = ps.filter(p => !p.isPlayer && !p.isDead);
        const tapped = oppAlive.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 14);
        if (tapped) {
          fireSkill(skill_pet, tapped);
        }
        setPendingSkill(null); pendingSkillRef.current = null;
        return;
      }
      setPendingSkill(null); pendingSkillRef.current = null;
      return;
    }

    // ─ Tap glowing ally → fire skill ─
    const myAlive = ps.filter(p => p.isPlayer && !p.isDead);
    const tappedSkillReady = myAlive.find(p =>
      p.mana >= MAX_MANA && petHasSkill(p) && Math.hypot(p.x - pos.x, p.y - pos.y) < 13
    );
    if (tappedSkillReady) {
      const mode = skillMode(tappedSkillReady);
      if (mode === "auto") {
        fireSkill(tappedSkillReady, null);
      } else {
        const ps2: PendingSkill = { petUid: tappedSkillReady.uid, mode };
        setPendingSkill(ps2); pendingSkillRef.current = ps2;
      }
      return;
    }

    // ─ Otherwise: start a slash ─
    isSlashingRef.current = true;
    slashPathRef.current = [pos];
    hitSetRef.current = new Set();
    // Push initial point straight to the polyline DOM nodes — they
    // mount the moment showSlash flips true on the next render, so
    // we both flip the gate AND seed the points so the swipe is
    // visible from the very first move event.
    const initial = `${pos.x},${pos.y} ${pos.x},${pos.y}`;
    showSlashRef.current = true;
    setShowSlash(true);
    requestAnimationFrame(() => {
      slashOuterRef.current?.setAttribute("points", initial);
      slashInnerRef.current?.setAttribute("points", initial);
    });
  }, [getArenaPos, fireSkill]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
    if (draggingPotionRef.current) return;
    if (!isSlashingRef.current) return;
    const pos = getArenaPos(e.clientX, e.clientY);
    // Single-segment swipe: render a STRAIGHT line from the original
    // pointer-down to the current finger position (capped in length).
    // Was previously a 6-point trailing polyline that followed the
    // finger's wiggle — that read as a "continuous saber trail" and
    // tended to hit multiple enemies in one drag. Per the user spec
    // the swipe is now a quick diagonal stroke that lands on at most
    // one enemy.
    const start = slashPathRef.current[0];
    if (!start) return;
    // Cap the visible segment so even if the player drags a long way
    // the line stays "swipe-sized". 22 arena-% works out to roughly
    // one pet-width across the lane, which is enough to overlap a
    // single enemy without spanning the whole row.
    const MAX_SWIPE_LEN = 22;
    let endX = pos.x, endY = pos.y;
    const tdx = pos.x - start.x, tdy = pos.y - start.y;
    const tdist = Math.hypot(tdx, tdy);
    if (tdist > MAX_SWIPE_LEN) {
      const s = MAX_SWIPE_LEN / tdist;
      endX = start.x + tdx * s;
      endY = start.y + tdy * s;
    }
    slashPathRef.current = [start, { x: endX, y: endY }];
    // DOM-direct polyline update — bypasses React reconciliation so a
    // dragging finger doesn't tank battle FPS by re-rendering every pet
    // wrapper, hp bar, mana bar, sparks, etc on every pointermove.
    const ptsStr = `${start.x},${start.y} ${endX},${endY}`;
    slashOuterRef.current?.setAttribute("points", ptsStr);
    slashInnerRef.current?.setAttribute("points", ptsStr);

    // One-enemy-per-swipe gate. Once we've registered a hit, no
    // further pointer-move tick will land additional damage even if
    // the line still passes through other enemies.
    if (hitSetRef.current.size >= 1) return;

    const oppAlive = petsRef.current.filter(p => !p.isPlayer && !p.isDead);
    // Run hit detection along the FULL swipe segment (start → end),
    // not just the latest tiny pointermove delta — otherwise a fast
    // diagonal flick would skip past an enemy between samples.
    let bestHit: { opp: typeof oppAlive[number]; dist: number } | null = null;
    for (const opp of oppAlive) {
      if (hitSetRef.current.has(opp.uid)) continue;
      const ax = start.x, ay = start.y, bx = endX, by = endY;
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const tParam = Math.max(0, Math.min(1, ((opp.x - ax) * dx + (opp.y - ay) * dy) / (len * len)));
      const dist = Math.hypot(ax + tParam * dx - opp.x, ay + tParam * dy - opp.y);
      if (dist >= 14) continue;
      // Pick the closest-to-line enemy as THE one this swipe hits —
      // if two enemies overlap the swipe at the same instant the
      // player hit the one they aimed at, not whichever happened to
      // come first in the iteration order.
      if (!bestHit || dist < bestHit.dist) bestHit = { opp, dist };
    }
    if (bestHit) {
      const opp = bestHit.opp;
      hitSetRef.current.add(opp.uid);
      const isCrit = Math.random() < 0.15;
      const myAlive = petsRef.current.filter(p => p.isPlayer && !p.isDead);
      // Slot-0 is the lead attacker for swipe-damage attribution. If
      // they've been KO'd, fall back to whoever's alive. (Was
      // `continue` when this lived inside the per-enemy for-loop;
      // now that we resolve a single best-hit enemy and apply damage
      // outside the loop, the no-attacker case just bails out of the
      // pointer-move callback entirely.)
      const attacker = myAlive.find(p => p.slotIdx === 0) ?? myAlive[0];
      if (!attacker) return;

      const newCombo = bumpCombo();
      const comboMult = 1 + Math.min(newCombo * 0.12, 0.6);
      const raw = attacker.atk - Math.floor(opp.def * 0.25) + Math.floor(Math.random() * 8) - 4;
      const dmg = Math.max(1, Math.floor(raw * (isCrit ? 1.8 : 1) * comboMult));
      opp.hp = Math.max(0, opp.hp - dmg);
      // Distribute swipe-mana across the whole alive party, not just
      // the slot-0 attacker. The attacker still gets the lion's share
      // (they "swing the blade") but every other live ally also banks
      // some so backup pets actually charge their special during a
      // match — without this they'd cap out at the slow passive trickle
      // and never glow / be tappable, which is what the player saw as
      // "added pets don't get their special skills".
      for (const ally of myAlive) {
        const share = ally.uid === attacker.uid ? SWIPE_MANA_ATTACKER : SWIPE_MANA_PARTY;
        ally.mana = Math.min(MAX_MANA, ally.mana + share);
      }
      // Hit enemy gains a small amount of mana from being struck — same
      // "give-or-take a hit" rule we apply to allies. +8 keeps it modest
      // so the player still feels in control while ensuring the enemy
      // line can build special-attack pressure if they're being heavily
      // swiped instead of charging successfully.
      opp.mana = Math.min(MAX_MANA, opp.mana + 8);

      // Red sparks/colors to keep the PvP theme consistent — gold only
      // on a crit so the player can read the special hit at a glance.
      const colors = isCrit ? ["#fbbf24", "#f59e0b", "#fde68a"] : ["#ef4444", "#f87171", "#fca5a5"];
      spawnSparks(opp.x, opp.y, colors);
      spawnFloatNum(opp.x, opp.y - 8, dmg, false, isCrit);
      flashHit(opp.uid);
      playHit();

      if (opp.hp <= 0 && !opp.isDead) doKo(opp);
    }
  }, [getArenaPos, spawnSparks, spawnFloatNum, flashHit, doKo, bumpCombo]);

  const handlePointerUp = useCallback(() => {
    isSlashingRef.current = false;
    hitSetRef.current = new Set();
    setTimeout(() => {
      showSlashRef.current = false;
      setShowSlash(false);
    }, 110);
  }, []);

  // ── Derived ────────────────────────────────────────────────────
  const enemyPets = pets.filter(p => !p.isPlayer);
  const pendingPet = pendingSkill ? pets.find(p => p.uid === pendingSkill.petUid) : null;

  // (incomingTarget / incomingPct derivations removed along with the
  // INCOMING indicator UI — see comment in the JSX block.)

  // ── Potion DnD ─────────────────────────────────────────────
  const [potionsRemaining, setPotionsRemaining] = useState<string[]>(potionInventoryIds);
  useEffect(() => { setPotionsRemaining(potionInventoryIds); }, [potionInventoryIds]);

  const usePotionMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("POST", "/api/explore/use-potion", { inventoryId });
      return res.json() as Promise<{ healAmount: number; manaAmount: number; petsRevived: number; potionName: string }>;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });

  const consumePotion = useCallback((inventoryId: string, targetAllyUid: string | null) => {
    if (!battleActiveRef.current) return;
    const inv = (myInventory as any[]).find((i: any) => (i.inventoryId || i.id) === inventoryId);
    if (!inv) return;
    const heal = inv.healthRestored ?? 0;
    const mana = inv.manaRestored ?? 0;
    const revives = inv.petsRevived ?? 0;
    const ps = petsRef.current;
    const myAlive = ps.filter(p => p.isPlayer && !p.isDead);
    const myDead = ps.filter(p => p.isPlayer && p.isDead);
    // Target precedence: explicit drop target → first alive ally.
    const target = (targetAllyUid && myAlive.find(p => p.uid === targetAllyUid))
      || myAlive.find(p => p.slotIdx === 0)
      || myAlive[0];

    if (heal > 0 && (!target || target.hp >= target.maxHp)) return;
    if (mana > 0 && (!target || target.mana >= MAX_MANA)) return;
    if (revives > 0 && myDead.length === 0) return;
    if (heal === 0 && mana === 0 && revives === 0) return;

    const rollback: { uid: string; hp: number; mana: number; isDead: boolean }[] = [];
    const snap = (p: BattlePet) => rollback.push({ uid: p.uid, hp: p.hp, mana: p.mana, isDead: p.isDead });

    if (target && heal > 0) {
      snap(target);
      target.hp = Math.min(target.maxHp, target.hp + heal);
      spawnFloatNum(target.x, target.y - 10, heal, true);
      spawnSparks(target.x, target.y, ["#4ade80", "#86efac", "#bbf7d0"]);
    }
    if (target && mana > 0) {
      if (!rollback.some(r => r.uid === target.uid)) snap(target);
      target.mana = Math.min(MAX_MANA, target.mana + mana);
      spawnSparks(target.x, target.y, ["#a78bfa", "#c4b5fd", "#ddd6fe"]);
    }
    if (revives > 0 && myDead.length > 0) {
      const reviveTarget = myDead[0];
      snap(reviveTarget);
      reviveTarget.isDead = false;
      reviveTarget.hp = Math.max(1, Math.floor(reviveTarget.maxHp * 0.5));
      petsRef.current = [...petsRef.current];
      setPets([...petsRef.current]);
      spawnFloatNum(reviveTarget.x, reviveTarget.y - 10, reviveTarget.hp, true);
      spawnSparks(reviveTarget.x, reviveTarget.y, ["#fbbf24", "#fde68a", "#fef3c7"]);
    }

    setPotionsRemaining(prev => {
      const idx = prev.indexOf(inventoryId);
      if (idx < 0) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });

    usePotionMutation.mutate(inventoryId, {
      onError: () => {
        setPotionsRemaining(prev => (prev.includes(inventoryId) ? prev : [...prev, inventoryId]));
        for (const r of rollback) {
          const p = petsRef.current.find(x => x.uid === r.uid);
          if (!p) continue;
          p.hp = r.hp;
          p.mana = r.mana;
          if (r.isDead && !p.isDead) p.isDead = true;
        }
        setPets([...petsRef.current]);
      },
    });
  }, [myInventory, spawnFloatNum, spawnSparks, usePotionMutation]);

  // Update hovered ally during a potion drag — used to highlight the
  // would-be target before the player releases.
  const updatePotionHover = useCallback((screenX: number, screenY: number) => {
    const arenaPos = getArenaPos(screenX, screenY);
    const ps = petsRef.current;
    const myAlive = ps.filter(p => p.isPlayer && !p.isDead);
    const target = myAlive.find(a => Math.hypot(a.x - arenaPos.x, a.y - arenaPos.y) < 14);
    setHoveredAllyUid(target?.uid ?? null);
    if (draggingPotionRef.current) {
      const next = { ...draggingPotionRef.current, screenX, screenY, arenaX: arenaPos.x, arenaY: arenaPos.y };
      draggingPotionRef.current = next;
      setDraggingPotion(next);
    }
  }, [getArenaPos]);

  const beginPotionDrag = useCallback((invId: string, e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const arenaPos = getArenaPos(e.clientX, e.clientY);
    const next: DraggingPotion = {
      invId, pointerId: e.pointerId,
      arenaX: arenaPos.x, arenaY: arenaPos.y,
      screenX: e.clientX, screenY: e.clientY,
    };
    draggingPotionRef.current = next;
    setDraggingPotion(next);
  }, [getArenaPos]);

  const movePotionDrag = useCallback((e: React.PointerEvent) => {
    if (!draggingPotionRef.current) return;
    e.stopPropagation();
    updatePotionHover(e.clientX, e.clientY);
  }, [updatePotionHover]);

  const endPotionDrag = useCallback((e: React.PointerEvent) => {
    if (!draggingPotionRef.current) return;
    e.stopPropagation();
    const drag = draggingPotionRef.current;
    draggingPotionRef.current = null;
    setDraggingPotion(null);
    setHoveredAllyUid(null);
    const arenaPos = getArenaPos(e.clientX, e.clientY);
    const ps = petsRef.current;
    const myAlive = ps.filter(p => p.isPlayer && !p.isDead);
    const target = myAlive.find(a => Math.hypot(a.x - arenaPos.x, a.y - arenaPos.y) < 14);
    consumePotion(drag.invId, target?.uid ?? null);
  }, [consumePotion, getArenaPos]);

  /** Cancel an in-progress drag without consuming the potion. Used as a
   *  safety net for `lostpointercapture` / pointercancel paths where
   *  we can't trust we got a real `pointerup`. Without this Safari can
   *  leave the drag ref set, which then blocks the arena slash handler. */
  const cancelPotionDrag = useCallback(() => {
    if (!draggingPotionRef.current) return;
    draggingPotionRef.current = null;
    setDraggingPotion(null);
    setHoveredAllyUid(null);
  }, []);

  // Window-level fallback: if the browser drops the pointerup we'd
  // otherwise get on the chip (iOS sometimes does this when the drag
  // crosses overlay boundaries), this still finishes the consume so
  // the chip doesn't soft-lock the arena. We only listen while a drag
  // is active to avoid spurious resets between fights.
  useEffect(() => {
    if (!draggingPotion) return;
    const handler = (ev: PointerEvent) => {
      const drag = draggingPotionRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;
      draggingPotionRef.current = null;
      setDraggingPotion(null);
      setHoveredAllyUid(null);
      const arenaPos = getArenaPos(ev.clientX, ev.clientY);
      const ps = petsRef.current;
      const myAlive = ps.filter(p => p.isPlayer && !p.isDead);
      const target = myAlive.find(a => Math.hypot(a.x - arenaPos.x, a.y - arenaPos.y) < 14);
      consumePotion(drag.invId, target?.uid ?? null);
    };
    const cancelHandler = (ev: PointerEvent) => {
      const drag = draggingPotionRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;
      cancelPotionDrag();
    };
    window.addEventListener("pointerup", handler);
    window.addEventListener("pointercancel", cancelHandler);
    return () => {
      window.removeEventListener("pointerup", handler);
      window.removeEventListener("pointercancel", cancelHandler);
    };
  }, [draggingPotion, getArenaPos, consumePotion, cancelPotionDrag]);

  // ── PORTAL ESCAPE ─────────────────────────────────────────────────────────
  // The battle UI is portaled to <body> so it ESCAPES the App's phone-frame
  // wrapper, which has `transform: translateZ(0) scale(frameScale)` applied.
  // That transform creates a containing block for `position:fixed` children,
  // which means without the portal our `fixed inset-0` would actually be
  // clipped to the 390×844 phone frame on tablet/desktop AND every animation
  // would be re-rasterized through the scale transform every frame (causing
  // the glitchy/blurry sprite movement the user reported). Portaling moves
  // the battle into <body>, where `fixed inset-0` truly fills the viewport
  // at native resolution with no scale and no clip — the arena gets its own
  // unconstrained page.
  //
  // Body scroll-lock is also applied so iOS Safari can't scroll the underlying
  // page during a battle.
  useEffect(() => {
    const prev = {
      overflow: document.body.style.overflow,
      overscroll: document.body.style.overscrollBehavior,
    };
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.overscrollBehavior = prev.overscroll;
    };
  }, []);

  return createPortal(
    // touchAction: "none" on the outermost battle wrapper kills iOS's
    // edge-swipe-back gesture across the WHOLE PvP page — not just the
    // arena. Without this, a player's swipe-attack that begins inside the
    // first ~20 px of the screen edge can trigger Safari's
    // back-navigation animation before our touchmove blocker on
    // `document` has a chance to preventDefault. The PvP page is a fixed
    // single-screen layout with no scrollable regions, so disabling the
    // browser's native gesture system here is safe.
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 10000, fontFamily: "Lora, serif", touchAction: "none" }}>
      <style>{`
        @keyframes koSpin { 0%{transform:translate(-50%,-50%) scale(1) rotate(0deg);opacity:1} 100%{transform:translate(-50%,-50%) scale(0.3) rotate(720deg);opacity:0} }
        @keyframes bSpark { to { transform: translate(calc(var(--dx)*14px), calc(var(--dy)*14px)); opacity:0; } }
        @keyframes bFloat { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-38px)} }
        @keyframes bIdle { 0%,100%{transform:translate(-50%,-50%)} 50%{transform:translate(-50%,calc(-50% - 4px))} }
        @keyframes bResultIn { 0%{transform:scale(0.85) translateY(18px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes bHit { 0%{filter:brightness(1)} 18%{filter:brightness(2.4) saturate(0.4)} 60%{filter:brightness(0.6)} 100%{filter:brightness(1)} }
        /* Squish-on-hit. Pure CSS transform so the browser composites
           it on the GPU — zero JS / canvas cost. The wrapper already
           applies bHit (brightness flash) on the same trigger; squish
           runs in parallel via the inner img's own animation. The
           sequence reads as: snap-compress (60 % horizontal stretch
           on impact) → over-recover (108 % vertical) → settle. Total
           320 ms matches bHit so both effects start and end together. */
        @keyframes pSquish { 0%{transform:scale(1,1)} 22%{transform:scale(1.18,0.78)} 55%{transform:scale(0.92,1.08)} 80%{transform:scale(1.04,0.97)} 100%{transform:scale(1,1)} }
        /* Defeat tilt — pet rotates and fades out when its hp hits 0.
           Used by the koSpin treatment but also available as a one-shot
           effect on the still-image sprite. */
        @keyframes pDefeat { 0%{transform:rotate(0deg) scale(1);opacity:1;filter:saturate(1)} 100%{transform:rotate(75deg) scale(0.85);opacity:0.35;filter:saturate(0.2) brightness(0.6)} }
        @keyframes bShake { 0%,100%{margin-left:0} 20%{margin-left:-4px} 40%{margin-left:4px} 60%{margin-left:-3px} 80%{margin-left:2px} }
        /* Pet-image glow applied via filter: drop-shadow so it traces
           the actual silhouette of the sprite (rather than a circular
           box-shadow halo around the wrapper, which read as "the pet
           is inside a glowing bubble"). drop-shadow follows the alpha
           edge, so the pet itself appears to emit light. */
        @keyframes skillGlowImg { 0%,100%{filter:drop-shadow(0 0 8px rgba(196,181,253,0.85)) drop-shadow(0 0 16px rgba(167,139,250,0.55))} 50%{filter:drop-shadow(0 0 14px rgba(221,214,254,1)) drop-shadow(0 0 28px rgba(167,139,250,0.85))} }
        @keyframes targetPulse { 0%,100%{opacity:0.55} 50%{opacity:1} }
        @keyframes dropZonePulse { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0.55), 0 0 18px rgba(74,222,128,0.35)} 50%{box-shadow:0 0 0 8px rgba(74,222,128,0.0), 0 0 28px rgba(74,222,128,0.55)} }
        @keyframes bOrb { 0%{transform:translate(0,0) scale(0.6);opacity:0} 30%{opacity:1} 100%{transform:translate(var(--ox,0px),-180px) scale(1.1);opacity:0} }
        @keyframes bWinText { 0%{transform:scale(0.6) rotate(-6deg);opacity:0;letter-spacing:0.05em} 60%{transform:scale(1.12) rotate(2deg);opacity:1} 100%{transform:scale(1) rotate(0deg);opacity:1;letter-spacing:0.18em} }
        @keyframes comboText { 0%{transform:scale(1.4) translateY(-4px);opacity:0} 60%{transform:scale(0.95) translateY(0);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
      `}</style>

      {/* Backdrop */}
      {/* Background image. Brightness was previously 0.42 which crushed the
          forest backdrop into a near-black silhouette — the user couldn't
          tell what biome they were fighting in. Bumped to 0.78 so the
          background reads clearly while still sitting visually behind the
          pets / HUD. Saturation kept at 1.15 for a touch of richness. */}
      <div className="absolute inset-0" style={{ backgroundImage: `url(${forestBgImg})`, backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.78) saturate(1.15)" }} />
      {/* Vignette / red-tint overlay. Bottom darken eased from .7 → .35 and
          top eased from .35 → .15 so the lifted background image isn't
          immediately re-crushed by the overlay. The faint red glow at the
          top stays as a thematic accent. */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(239,68,68,0.08) 0%, transparent 55%), linear-gradient(180deg,rgba(15,5,8,.15) 0%,rgba(5,4,8,.35) 100%)" }} />
      {/* Side-edge frames removed — they read as harsh vertical margins/
          borders against the brighter background and the user explicitly
          asked them gone. The arena now bleeds edge-to-edge. */}
      <div className="absolute pointer-events-none z-[1]" style={{ left: "50%", top: "50%", width: 320, height: 60, transform: "translate(-50%,-50%)", borderRadius: "50%", border: "1px dashed rgba(239,68,68,0.22)", boxShadow: "inset 0 0 30px rgba(239,68,68,0.10), 0 0 30px rgba(239,68,68,0.10)" }} />

      {/* Header — no more AUTO/MANUAL toggle. Pets behave the same way
          every fight: enemies float and charge, allies stand and swipe. */}
      <div className="relative z-10 flex items-center gap-2 px-3 pb-2 shrink-0" style={{ background: "rgba(8,4,5,0.72)", borderBottom: "1px solid rgba(239,68,68,0.10)", paddingTop: "max(env(safe-area-inset-top, 0px) + 10px, 44px)" }}>
        <button onClick={() => onClose(null)} data-testid="button-close-battle" className="w-9 h-9 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 transition-colors active:scale-90 shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 text-center text-[12px] tracking-[0.2em] text-red-300 font-bold truncate">vs {opponent.username}</div>
        {comboCount > 1 && phase === "battle" && (
          <div
            className="px-2 py-0.5 rounded-md text-[11px] font-black tracking-[0.14em]"
            data-testid="text-combo-count"
            style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)", textShadow: "0 0 10px rgba(251,191,36,0.6)", animation: "comboText 0.3s ease-out", whiteSpace: "nowrap" }}
          >
            {comboCount}× COMBO
          </div>
        )}
        {pendingSkill && (
          <button onClick={() => { setPendingSkill(null); pendingSkillRef.current = null; }} className="flex items-center gap-1 text-white/40 text-[9px]">
            <X size={11} /> CANCEL
          </button>
        )}
      </div>

      {/* Skill targeting banner */}
      {pendingSkill && pendingPet && (
        <div className="relative z-20 shrink-0 mx-3 mt-1 mb-1 rounded-lg px-3 py-2 text-center text-[11px] tracking-wider"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(167,139,250,0.2))", border: "1px solid rgba(167,139,250,0.4)" }}>
          <span className="text-purple-200 font-bold">{pendingPet.name}</span>
          <span className="text-white/50"> → </span>
          <span className="text-yellow-300 font-bold">{pendingPet.specialSkill || pendingPet.specialSkillType || "Special"}</span>
          <span className="text-white/40"> · Tap an enemy to target</span>
        </div>
      )}

      {/* Loading / Countdown */}
      {phase === "loading" && (
        <div className="flex-1 flex items-center justify-center relative z-10">
          <div className="w-12 h-12 rounded-full border-2 border-red-500/40 border-t-red-400 animate-spin" />
        </div>
      )}
      {phase === "countdown" && (
        <div className="flex-1 flex items-center justify-center relative z-10">
          <div className="text-6xl font-black text-white" style={{ textShadow: "0 0 40px rgba(239,68,68,0.8)" }}>
            {countdown > 0 ? countdown : "FIGHT!"}
          </div>
        </div>
      )}

      {/* Arena */}
      {(phase === "battle" || phase === "result") && (
        <div
          ref={arenaRef}
          className="flex-1 relative overflow-hidden select-none"
          style={{ touchAction: "none", cursor: pendingSkill?.mode === "needs-enemy" ? "crosshair" : "default" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Grid removed — the 48 px red gridlines read as random clutter
              over the brighter background image. The dividing line below is
              kept since it functionally separates the player and enemy halves
              of the arena. */}

          {/* Dividing line */}
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: "50%", height: 1, background: "linear-gradient(90deg,transparent,rgba(239,68,68,0.32),transparent)" }} />

          {/* Enemy target highlight ring during skill targeting */}
          {pendingSkill?.mode === "needs-enemy" && enemyPets.filter(p => !p.isDead).map(p => (
            <div key={`ring-${p.uid}`} className="absolute pointer-events-none rounded-full"
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)", width: 72, height: 72, border: "2px solid rgba(239,68,68,0.7)", animation: "targetPulse 0.7s ease-in-out infinite", boxShadow: "0 0 12px rgba(239,68,68,0.4)" }} />
          ))}

          {/* RED swipe trail — drives the PvP color theme.
              We use a `viewBox="0 0 100 100"` + `preserveAspectRatio="none"`
              so the polyline points (which are kept in the same 0–100 %
              coordinate space the rest of the arena uses for pet
              positions) map cleanly to the SVG element regardless of
              its rendered pixel size. The previous version put `%`
              suffixes inside the polyline `points` attribute, which is
              NOT valid SVG syntax — Safari and most browsers silently
              dropped the points and rendered nothing, which is why the
              red trail "wasn't showing" on iPhone. */}
          {showSlash && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-30"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Glowing red swipe — drawn as TWO stacked polylines so
                  Safari renders an actual halo: the outer line is a
                  thicker, semi-transparent bloom that survives the SVG
                  drop-shadow being clipped by overflow:hidden parents,
                  and the inner line is the bright core.
                  IMPORTANT: the `points` attribute is mutated in
                  handlePointerMove via slashOuterRef / slashInnerRef
                  instead of being passed as a React prop — that's how
                  this avoids a 60-Hz state churn during a swipe. */}
              <polyline
                ref={slashOuterRef}
                fill="none" stroke="#ff2a3a" strokeLinecap="round" strokeLinejoin="round"
                opacity="0.55"
                vectorEffect="non-scaling-stroke"
                style={{ strokeWidth: 12, filter: "blur(2px)" }}
              />
              <polyline
                ref={slashInnerRef}
                fill="none" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round"
                opacity="1"
                vectorEffect="non-scaling-stroke"
                style={{ strokeWidth: 3.5, filter: "drop-shadow(0 0 6px #ff2a3a) drop-shadow(0 0 12px #ff2a3a)" }}
              />
            </svg>
          )}

          {/* INCOMING indicator removed per user request — the red
              "INCOMING!" label + progress bar above the targeted ally
              read as confusing UI clutter rather than useful gameplay
              info. The charger's own dive animation already telegraphs
              the attack visually. */}

          {/* Pets — sprite size scales DOWN as the row gets fuller so
              edge-slot pets at 12 / 88 % don't clip off the side of the
              arena on a 390-px phone (5 sprites × 180 px = 900 px, way
              wider than the viewport). PvE arena uses 230 px because
              there's only one focal pet; PvP fits up to 5. */}
          {pets.filter(p => !p.isDead).map(pet => {
            const hasSkill = petHasSkill(pet);
            const isSkillReady = pet.isPlayer && pet.mana >= MAX_MANA && hasSkill;
            const isPendingSource = pendingSkill?.petUid === pet.uid;
            const isEnemyTarget = pendingSkill?.mode === "needs-enemy" && !pet.isPlayer;
            const isHoveredDrop = pet.isPlayer && hoveredAllyUid === pet.uid;
            const sideCount = pet.isPlayer
              ? pets.filter(p => p.isPlayer).length
              : pets.filter(p => !p.isPlayer).length;
            // Sized so the FULL pet (including transparent padding around
            // the artwork) reads at roughly the same visual size as the
            // PvE Murk Cave arena — without using a transform-scale wrapper
            // (the old ART_SCALE wrapper was misaligning player sprites
            // and clipping pet parts because the inset:0 was resolving to
            // the wrong containing block).
            //
            // Sizes are now scaled to the actual arena width so a 1 v 1
            // doesn't fill half a phone screen and a 5 v 5 doesn't have
            // sprites overlapping their neighbors. The old fixed ladder
            // (240 → 140) was sized for desktop and read as "way too big"
            // on every mobile device — a 240 px pet on a 414 px iPhone
            // is ~58 % of the viewport, and two of them visibly fight
            // for screen space. The new ladder is roughly 35 % smaller
            // and additionally clamps to the measured arena width so the
            // sprites always fit inside their slot.
            //   1 pet  → 168 / 162 (focal sprite, still large)
            //   2 pets → 132 / 126
            //   3 pets → 110 / 105
            //   4 pets →  92 /  88
            //   5 pets →  78 /  74
            const arenaWNow = arenaRef.current?.clientWidth ?? 380;
            // Reference arena width is 380 (typical phone). Scale the
            // ladder linearly with available width but cap so tablet /
            // desktop don't blow the sprites back up to the old size.
            const sizeScale = Math.min(1.25, Math.max(0.85, arenaWNow / 380));
            const baseAlly  = Math.round((sideCount <= 1 ? 168 : sideCount === 2 ? 132 : sideCount === 3 ? 110 : sideCount === 4 ? 92 : 78) * sizeScale);
            const baseEnemy = Math.round((sideCount <= 1 ? 162 : sideCount === 2 ? 126 : sideCount === 3 ? 105 : sideCount === 4 ? 88 : 74) * sizeScale);
            const size = pet.isPlayer ? baseAlly : baseEnemy;
            const isHit = !!hitFlash[pet.uid];
            const stars = Math.max(0, Math.min(5, Math.floor(pet.starRarity || 0)));
            // Bar width tracks sprite size. Reduced from 0.55 → 0.42
            // because the previous ribbon was wider than most pets'
            // visible silhouette and read as a separate banner.
            const barWidth = Math.round(size * 0.42);
            // The pet <img> is rendered with objectFit: contain at the
            // full wrapper size, so the visible silhouette typically
            // fills ~94 % of the wrapper (the PNG itself usually has a
            // small transparent margin baked in). The wrapper box
            // edges are therefore right
            // up against the visible silhouette, so the bars no longer
            // need a deep inset to reach the pet — they sit at the
            // wrapper edge with a tiny 3 % gap (= half of the 6 %
            // total fit margin) so they don't quite touch the head /
            // feet outline. The previous 18 % inset would now plant
            // the bars INSIDE the pet body, so this needs to be
            // reduced in lockstep with the fit-margin change.
            const barInset = Math.round(size * 0.03);
            // Charging enemies need to render ON TOP of the ally they're
            // diving at — otherwise they slide BEHIND the player sprite,
            // which reads as a "glitch" because the impact spark and X_X
            // flash come from a target the attacker visibly clipped under.
            const isCharging = !pet.isPlayer && chargerView?.enemyUid === pet.uid && !chargerView?.returning;
            const z = pet.isPlayer ? 15 : (isCharging ? 18 : 12);

            return (
              <div
                key={pet.uid}
                ref={(el) => { petWrapperRefs.current.set(pet.uid, el); }}
                className="absolute pointer-events-none"
                style={{
                  left: `${pet.x}%`, top: `${pet.y}%`,
                  // Wrapper is the size of the sprite, centered on the
                  // pet's logical (x, y). Bars are absolutely positioned
                  // INSIDE this box, not in flex flow, so they don't
                  // change the wrapper height (the centering transform
                  // would otherwise drift the sprite off the float
                  // anchor whenever bars appeared/disappeared) and so
                  // they can be inset deep into the visible silhouette.
                  width: size,
                  height: size,
                  transform: "translate(-50%,-50%)",
                  // bIdle keyframe removed — every pet now bobs from the
                  // single animate() RAF loop (allies get a sine Y-bob;
                  // enemies use the existing wave float). Stacking the
                  // CSS keyframe on top of the JS-driven motion was the
                  // root cause of the "pets jolt around" feel.
                  animation: isHit ? "bShake 0.32s ease-in-out" : undefined,
                  zIndex: z,
                }}
              >
                {/* ENEMY HP bar — anchored to the visible head edge
                    (≈ 18 % down from the wrapper's top, where the pet
                    actually starts being drawn) instead of floating up
                    in the transparent padding. Stack grows UPWARD from
                    that anchor (stars on top, bar on bottom). */}
                {!pet.isPlayer && (
                  <div
                    className="absolute flex flex-col items-center gap-0.5"
                    style={{
                      bottom: `calc(100% - ${barInset}px)`,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: barWidth,
                    }}
                  >
                    {stars > 0 && (
                      <div className="text-[7px] leading-none whitespace-nowrap" style={{ color: "#fbbf24", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                        {"★".repeat(stars)}
                      </div>
                    )}
                    <div
                      className="h-1.5 w-full bg-black/70 rounded-full overflow-hidden border"
                      style={{
                        borderColor: pendingSkill?.mode === "needs-enemy" ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.10)",
                        animation: pendingSkill?.mode === "needs-enemy" ? "targetPulse 0.8s ease-in-out infinite" : undefined,
                      }}
                    >
                      <div ref={(el) => { petHpRefs.current.set(pet.uid, el); }} className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(0, (pet.hp / pet.maxHp) * 100)}%`, background: hpColor(pet.hp / pet.maxHp) }} />
                    </div>
                  </div>
                )}

                {/* Sprite — PvP renders pets as plain <img> tags using
                    the shop_item.imageUrl (the full-body PNG admins
                    upload for every pet). No PetAnimatorCanvas, no
                    per-frame redraw loop, no FPS throttle — just the
                    GPU compositing one small image per pet. The
                    canvas approach was originally added to prevent
                    iOS GPU crashes from the part-based <img> renderer
                    (12 textures × N pets), but a SINGLE <img> per pet
                    has none of that risk and runs essentially for
                    free. All "alive" feel comes from CSS effects on
                    impact / charge / defeat instead of idle motion.
                    The enemy gets a horizontal flip via scaleX(-1) so
                    it faces the player. The wrapper is
                    `position: relative` so any absolute children
                    (X_X hit overlay) resolve to THIS box, not to the
                    outer flex column. */}
                <div
                  style={{
                    width: size,
                    height: size,
                    position: "relative",
                    borderRadius: "50%",
                    transform: pet.isPlayer ? undefined : "scaleX(-1)",
                    animation: isHoveredDrop
                      ? "dropZonePulse 0.7s ease-in-out infinite"
                      : isHit
                        ? "bHit 0.32s ease-out"
                        : undefined,
                    outline: isPendingSource
                      ? "2px solid rgba(250,204,21,0.8)"
                      : isHoveredDrop
                        ? "2px solid rgba(74,222,128,0.85)"
                        : undefined,
                    outlineOffset: 3,
                  }}
                >
                  {pet.imageUrl ? (
                    <img
                      src={pet.imageUrl}
                      alt=""
                      // NOTE: deliberately no `crossOrigin` attribute.
                      // The PNG is purely displayed (we never read
                      // pixels via canvas), and adding crossOrigin
                      // would (a) break loading entirely if the
                      // image bucket doesn't return CORS headers,
                      // and (b) force a separate cache entry from
                      // the non-CORS fetches the rest of the app
                      // uses for the same URL — i.e. it would slow
                      // first-load, not speed it up.
                      // Prevent the browser's default tap-highlight /
                      // long-press menu when fingers brush the sprite
                      // during fast swipe play.
                      draggable={false}
                      style={{
                        width: size,
                        height: size,
                        objectFit: "contain",
                        // Squish-on-impact runs in parallel with the
                        // wrapper's bHit brightness flash. transform-
                        // origin: 50% 100% pivots from the feet so the
                        // pet "stomps" downward instead of compressing
                        // through its midline (which reads more like a
                        // hit absorbed in the legs than a body
                        // teleport).
                        // Skill-ready glow lives HERE on the <img> (was
                        // previously on the wrapper as box-shadow, which
                        // produced a circular halo around the bounding
                        // box). drop-shadow on the image traces the
                        // pet's silhouette so the pet itself appears to
                        // glow when its special is ready. Hit squish
                        // takes precedence so the impact feedback isn't
                        // muted by the slow skill pulse.
                        animation: isHit
                          ? "pSquish 0.32s ease-out"
                          : isSkillReady
                            ? "skillGlowImg 1.2s ease-in-out infinite"
                            : undefined,
                        transformOrigin: "50% 100%",
                        // Base team-color drop-shadow. Overridden by the
                        // skillGlowImg keyframe while the pulse runs;
                        // otherwise provides the static purple/red rim.
                        filter: pet.isPlayer
                          ? "drop-shadow(0 0 10px rgba(167,139,250,0.5))"
                          : "drop-shadow(0 0 10px rgba(239,68,68,0.45))",
                        WebkitUserSelect: "none",
                        userSelect: "none",
                        WebkitTouchCallout: "none",
                      }}
                    />
                  ) : (
                    <div style={{ width: size, height: size, background: pet.isPlayer ? "rgba(100,60,200,0.3)" : "rgba(200,60,60,0.3)", borderRadius: "50%", border: `2px solid ${pet.isPlayer ? "rgba(167,139,250,0.5)" : "rgba(239,68,68,0.5)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <img src={petPawIcon} alt="" style={{ width: size * 0.65, height: size * 0.65, objectFit: "contain" }} />
                    </div>
                  )}
                  {isHit && (
                    <div
                      className="absolute inset-0 flex items-center justify-center font-black"
                      style={{
                        transform: pet.isPlayer ? undefined : "scaleX(-1)",
                        color: "#fff",
                        fontSize: size * 0.32,
                        textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(239,68,68,0.7)",
                        letterSpacing: -2,
                        pointerEvents: "none",
                      }}
                    >X_X</div>
                  )}
                </div>

                {/* ALLY HP + mana stack — anchored at the visible feet
                    edge (≈ 18 % up from the wrapper's bottom, mirror of
                    the enemy treatment). Absolute so it doesn't change
                    wrapper height (which would shift the sprite off the
                    JS-driven float anchor). Stack grows DOWNWARD from
                    the anchor (stars first, then HP, then mana). */}
                {pet.isPlayer && (
                  <div
                    className="absolute flex flex-col items-center gap-0.5"
                    style={{
                      top: `calc(100% - ${barInset}px)`,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: barWidth,
                    }}
                  >
                    {stars > 0 && (
                      <div className="text-[7px] leading-none whitespace-nowrap" style={{ color: "#fbbf24", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                        {"★".repeat(stars)}
                      </div>
                    )}
                    <div className="h-1.5 w-full bg-black/70 rounded-full overflow-hidden border border-white/10">
                      <div ref={(el) => { petHpRefs.current.set(pet.uid, el); }} className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(0, (pet.hp / pet.maxHp) * 100)}%`, background: hpColor(pet.hp / pet.maxHp) }} />
                    </div>
                    {hasSkill && (
                      <div className="h-1 w-full bg-black/50 rounded-full overflow-hidden">
                        <div ref={(el) => { petManaRefs.current.set(pet.uid, el); }} className="h-full rounded-full" style={{ width: `${(pet.mana / MAX_MANA) * 100}%`, background: pet.mana >= MAX_MANA ? "#c084fc" : "#4c1d95" }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Skill ready / pending labels */}
                {isSkillReady && !isPendingSource && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] text-purple-200 font-bold tracking-wider animate-pulse">
                    ✦ {pet.specialSkill || pet.specialSkillType || "Special"}
                  </div>
                )}
                {isPendingSource && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] text-yellow-300 font-bold tracking-wider">
                    READY →
                  </div>
                )}
                {isEnemyTarget && !pet.isDead && (
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-red-300 font-bold whitespace-nowrap animate-pulse">TAP</div>
                )}
              </div>
            );
          })}

          {/* KO effects */}
          {[...koSet].map(uid => {
            const pet = pets.find(p => p.uid === uid);
            if (!pet) return null;
            return (
              <div key={uid} className="absolute pointer-events-none z-40" style={{ left: `${pet.x}%`, top: `${pet.y}%`, transform: "translate(-50%,-50%)" }}>
                <img src={skullDefeatIcon} alt="" style={{ width: 48, height: 48, objectFit: "contain", animation: "koSpin 1s ease-in forwards" }} />
              </div>
            );
          })}

          {/* Sparks */}
          {sparks.map(s => (
            <div key={s.id} className="absolute pointer-events-none rounded-full z-30"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: 6, height: 6, marginLeft: -3, marginTop: -3, background: s.color, boxShadow: `0 0 8px ${s.color}`, animation: "bSpark 0.5s ease-out forwards", ["--dx" as any]: s.dx, ["--dy" as any]: s.dy }} />
          ))}

          {/* Float numbers */}
          {floatNums.map(fn => (
            <div key={fn.id} className="absolute pointer-events-none z-40 font-black select-none"
              style={{ left: `${fn.x}%`, top: `${fn.y}%`, transform: "translate(-50%,-50%)", fontSize: fn.isCrit ? 24 : fn.isHeal ? 20 : 17, color: fn.isHeal ? "#4ade80" : fn.isCrit ? "#fbbf24" : "#f87171", textShadow: fn.isHeal ? "0 0 10px #22c55e" : fn.isCrit ? "0 0 10px #f59e0b" : "0 0 8px rgba(239,68,68,0.8)", animation: "bFloat 0.95s ease-out forwards", fontFamily: "Lora, serif" }}>
              {fn.isHeal ? "+" : ""}{fn.value}{fn.isCrit ? "!" : ""}
            </div>
          ))}

          {/* Floating ghost icon while a potion is being dragged.
              Positioned in fixed/screen coords so it tracks the finger
              perfectly even outside the arena bounds. */}
          {draggingPotion && (() => {
            const inv = (myInventory as any[]).find((x: any) => (x.inventoryId || x.id) === draggingPotion.invId);
            return (
              <div
                className="fixed z-50 pointer-events-none"
                style={{
                  left: draggingPotion.screenX,
                  top: draggingPotion.screenY,
                  transform: "translate(-50%,-50%)",
                }}
                data-testid="ghost-potion"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: "rgba(34,197,94,0.20)",
                    border: "2px solid rgba(74,222,128,0.85)",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.6), 0 0 18px rgba(74,222,128,0.45)",
                  }}
                >
                  {inv?.imageUrl
                    ? <img src={inv.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: "contain" }} />
                    : <span className="text-white text-base font-black">P</span>}
                </div>
              </div>
            );
          })()}

          {/* Potion bar — drag a chip onto an ally. The chip captures
              the pointer on press so the parent arena's slash-handler
              never starts. Drop on an ally → consume. */}
          {phase === "battle" && potionsRemaining.length > 0 && (
            <div
              className="absolute z-30 flex gap-1.5 pointer-events-auto left-1/2 -translate-x-1/2"
              style={{ bottom: 32 }}
              data-testid="pvp-potion-bar"
            >
              {potionsRemaining.map((invId, i) => {
                const inv = (myInventory as any[]).find((x: any) => (x.inventoryId || x.id) === invId);
                if (!inv) return null;
                const isMana = (inv.manaRestored ?? 0) > 0;
                const isRevive = (inv.petsRevived ?? 0) > 0;
                const isBeingDragged = draggingPotion?.invId === invId;
                return (
                  <div
                    key={`${invId}-${i}`}
                    data-testid={`button-pvp-potion-${i}`}
                    onPointerDown={(e) => beginPotionDrag(invId, e)}
                    onPointerMove={movePotionDrag}
                    onPointerUp={endPotionDrag}
                    onPointerCancel={() => cancelPotionDrag()}
                    onLostPointerCapture={() => cancelPotionDrag()}
                    className="w-11 h-11 rounded-lg flex items-center justify-center transition-transform"
                    style={{
                      touchAction: "none",
                      background: isRevive
                        ? "rgba(251,191,36,0.18)"
                        : isMana
                          ? "rgba(124,58,237,0.22)"
                          : "rgba(34,197,94,0.20)",
                      border: `1px solid ${isRevive ? "rgba(251,191,36,0.55)" : isMana ? "rgba(167,139,250,0.55)" : "rgba(34,197,94,0.55)"}`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                      opacity: isBeingDragged ? 0.35 : 1,
                      cursor: "grab",
                    }}
                  >
                    {inv.imageUrl
                      ? <img src={inv.imageUrl} alt={inv.name} style={{ width: 32, height: 32, objectFit: "contain", pointerEvents: "none" }} draggable={false} />
                      : <span className="text-white text-sm font-black">{isRevive ? "R" : isMana ? "M" : "H"}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Hint */}
          {phase === "battle" && !pendingSkill && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/12 text-[9px] tracking-widest pointer-events-none animate-pulse whitespace-nowrap">
              Swipe enemies · Tap glowing ally for skill · Drag potion to ally
            </div>
          )}

          {/* Result overlay (unchanged) */}
          {phase === "result" && resultOutcome === "win" && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6" style={{ background: "radial-gradient(ellipse at center, rgba(60,30,8,0.85) 0%, rgba(5,4,2,0.95) 80%)", animation: "bResultIn 0.5s ease-out" }}>
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {Array.from({ length: 14 }).map((_, i) => {
                  const left = 8 + (i * 6.5) % 84;
                  const delay = (i * 0.18) % 2.4;
                  const ox = (i % 2 === 0 ? 1 : -1) * (10 + (i * 3) % 28);
                  return (
                    <div
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left: `${left}%`, bottom: "20%",
                        width: 10 + (i % 4) * 3, height: 10 + (i % 4) * 3,
                        background: "radial-gradient(circle, #fde68a 0%, #f59e0b 60%, transparent 100%)",
                        boxShadow: "0 0 14px rgba(251,191,36,0.7)",
                        animation: `bOrb 2.4s ease-out ${delay}s infinite`,
                        ["--ox" as any]: `${ox}px`,
                      }}
                    />
                  );
                })}
              </div>
              <img src={battleTrophyIcon} alt="" style={{ width: 88, height: 88, objectFit: "contain", filter: "drop-shadow(0 0 24px rgba(251,191,36,0.7))" }} />
              <div
                className="text-4xl font-black tracking-[0.18em]"
                data-testid="text-pvp-victory"
                style={{ color: "#fde68a", textShadow: "0 0 32px rgba(251,191,36,0.8), 0 2px 4px rgba(0,0,0,0.6)", animation: "bWinText 0.7s ease-out forwards", fontFamily: "Cinzel, Lora, serif" }}
              >
                VICTORY!
              </div>
              <div className="text-amber-200/85 text-[12px] tracking-[0.16em] text-center max-w-xs">
                {bpEarned >= 12 ? "A heroic upset! The arena will sing of this fight." :
                 bpEarned >= 9 ? "A worthy win — the arena bows." :
                 "A clean victory. Onward, champion!"}
              </div>
              {bpEarned > 0 && (
                <div className="mt-1 px-4 py-1.5 rounded-full text-[14px] font-black tracking-widest" data-testid="text-pvp-bp-earned"
                  style={{ background: "rgba(251,191,36,0.18)", border: "1px solid rgba(251,191,36,0.55)", color: "#fde68a", textShadow: "0 0 10px rgba(251,191,36,0.5)" }}>
                  +{bpEarned} BP
                </div>
              )}
              {coinsEarned > 0 && <div className="text-yellow-300/80 text-[11px] tracking-wider" data-testid="text-pvp-coins">+{coinsEarned} coins</div>}
              <button onClick={() => onClose(resultOutcome)} data-testid="button-pvp-result-close" className="mt-3 px-7 py-2.5 rounded-xl text-[11px] font-black tracking-[0.2em]"
                style={{ background: "linear-gradient(135deg, #f59e0b, #b45309)", color: "#fff8e1", border: "1px solid rgba(251,191,36,0.7)", boxShadow: "0 4px 18px rgba(251,191,36,0.35)" }}>
                BACK TO LOBBY
              </button>
            </div>
          )}
          {phase === "result" && resultOutcome === "loss" && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6" style={{ background: "radial-gradient(ellipse at center, rgba(40,8,12,0.85) 0%, rgba(4,2,5,0.95) 80%)", animation: "bResultIn 0.5s ease-out" }}>
              <img src={skullDefeatIcon} alt="" style={{ width: 78, height: 78, objectFit: "contain", filter: "drop-shadow(0 0 14px rgba(239,68,68,0.45))" }} />
              <div className="text-3xl font-black tracking-[0.16em]" data-testid="text-pvp-defeat" style={{ color: "#fca5a5", textShadow: "0 0 22px rgba(239,68,68,0.5)" }}>
                DEFEAT
              </div>
              <div className="text-white/70 text-[12px] tracking-[0.14em] text-center max-w-xs">
                A worthy fight. You held the line — train, retool, and return stronger.
              </div>
              <div className="text-white/40 text-[10px] tracking-widest mt-1">No battle points lost.</div>
              <button onClick={() => onClose(resultOutcome)} data-testid="button-pvp-result-close" className="mt-3 px-7 py-2.5 rounded-xl text-[11px] font-black tracking-[0.2em] text-white/85"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(76,29,149,0.4))", border: "1px solid rgba(167,139,250,0.5)" }}>
                BACK TO LOBBY
              </button>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
