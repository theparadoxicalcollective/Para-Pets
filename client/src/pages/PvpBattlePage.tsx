import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { playHit, playPlayerHurt, playBattleVictory, playDefeat } from "@/lib/sounds";
import { ArrowLeft, X } from "lucide-react";
import PetAnimatorCanvas from "@/components/PetAnimatorCanvas";
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
/** How often we try to spawn a new enemy charger when none is active. */
const CHARGE_INTERVAL_MS = 2800;
/** Damage % of enemy ATK when a charge lands on an ally. */
const CHARGE_DMG_MULT = 0.85;

function hpColor(pct: number) {
  if (pct > 0.5) return "#4ade80";
  if (pct > 0.25) return "#facc15";
  return "#f87171";
}

function skillMode(skill: string | null): SkillMode {
  if (!skill) return "auto";
  if (skill === "Lazer" || skill === "Poison") return "needs-enemy";
  return "auto";
}

function effectiveSkillType(pet: BattlePet): string | null {
  return pet.specialSkillType || pet.specialSkill;
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
  const hitSetRef = useRef<Set<string>>(new Set());
  const lastAiSkillTime = useRef<Record<string, number>>({});
  const idRef = useRef(0);

  const [slashTrail, setSlashTrail] = useState<{x:number;y:number}[]>([]);
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
  });

  // ── Build pets ──────────────────────────────────────────────
  // Allies get fixed slot positions across the BOTTOM (y=72%); they
  // never move. Enemies get a float anchor across the TOP (y=22%) +
  // a per-pet sine offset so the swarm undulates instead of marching
  // in a straight line — that's the Murk-Cave feel.
  const buildPets = useCallback(() => {
    const inv = myInventory as any[];
    const allySlotsX = [12, 31, 50, 69, 88];
    const allySlotY = 72;
    const enemySlotsX = [12, 31, 50, 69, 88];
    const enemySlotY = 22;

    const myPets: BattlePet[] = myPetIds.map((id, i) => {
      const invItem = inv.find((it: any) => (it.inventoryId || it.id) === id);
      if (!invItem) return null;
      const slotX = allySlotsX[i] ?? 50;
      return {
        uid: nextUid(), invId: id,
        name: invItem.petNickname || invItem.name || "Pet",
        imageUrl: invItem.imageUrl ?? null,
        petTemplateId: invItem.petTemplateId ?? null,
        starRarity: invItem.starRarity ?? 1,
        maxHp: invItem.petHealth || 800, hp: invItem.petHealth || 800,
        atk: invItem.petAtk || 50, def: invItem.petDef || 30,
        specialSkill: invItem.specialSkill ?? null,
        specialSkillType: (invItem as any).specialSkillType ?? null,
        skillDamagePercent: (invItem as any).skillDamagePercent ?? null,
        skillHealPercent: (invItem as any).skillHealPercent ?? null,
        isPlayer: true,
        slotIdx: i,
        x: slotX, y: allySlotY,
        baseX: slotX, baseY: allySlotY,
        phase: 0, amp: 0, speed: 0,
        isDead: false, mana: 0,
      } as BattlePet;
    }).filter(Boolean) as BattlePet[];

    const oppBattlePets: BattlePet[] = (oppPets as any[]).slice(0, 5).map((p: any, i: number) => {
      const baseX = enemySlotsX[i] ?? 50;
      return {
        uid: nextUid(), invId: p.inventoryId || p.id,
        name: p.petNickname || p.name || "Foe",
        imageUrl: p.imageUrl ?? null,
        petTemplateId: p.petTemplateId ?? null,
        starRarity: p.starRarity ?? 1,
        maxHp: p.petHealth || 800, hp: p.petHealth || 800,
        atk: p.petAtk || 50, def: p.petDef || 30,
        specialSkill: p.specialSkill ?? null,
        specialSkillType: p.specialSkillType ?? null,
        skillDamagePercent: p.skillDamagePercent ?? null,
        skillHealPercent: p.skillHealPercent ?? null,
        isPlayer: false,
        slotIdx: i,
        x: baseX, y: enemySlotY,
        baseX, baseY: enemySlotY,
        // Stagger the sine so the swarm undulates instead of moving
        // in lock-step.  Amplitude ±4% of arena width keeps each foe
        // inside its own lane so they don't overlap on impact.
        phase: i * 1.2,
        amp: 4,
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
  const fireSkill = useCallback((attacker: BattlePet, skill: string, target: BattlePet | null) => {
    attacker.mana = 0;
    const ps = petsRef.current;
    const myAlive = ps.filter(p => p.isPlayer && !p.isDead);
    const oppAlive = ps.filter(p => !p.isPlayer && !p.isDead);

    const applyDef = (raw: number, def: number) =>
      Math.max(1, Math.floor(raw - def * 0.25));

    if (skill === "Lazer" && target) {
      const mult = attacker.skillDamagePercent ? attacker.skillDamagePercent / 100 : 2.5;
      const dmg = applyDef(attacker.atk * mult, target.def);
      target.hp = Math.max(0, target.hp - dmg);
      spawnFloatNum(target.x, target.y - 10, dmg, false, true);
      spawnSparks(target.x, target.y, ["#fbbf24", "#f59e0b", "#fde68a"]);
      flashHit(target.uid);
      if (target.hp <= 0 && !target.isDead) doKo(target);

    } else if (skill === "Bubble") {
      const mult = attacker.skillDamagePercent ? attacker.skillDamagePercent / 100 : 0.85;
      const enemies = attacker.isPlayer ? oppAlive : myAlive;
      enemies.forEach(t => {
        const dmg = applyDef(attacker.atk * mult, t.def);
        t.hp = Math.max(0, t.hp - dmg);
        spawnFloatNum(t.x, t.y - 8, dmg);
        spawnSparks(t.x, t.y, ["#60a5fa", "#93c5fd", "#bfdbfe"]);
        flashHit(t.uid);
        if (t.hp <= 0 && !t.isDead) doKo(t);
      });

    } else if (skill === "Heal Self") {
      const healMult = attacker.skillHealPercent ? attacker.skillHealPercent / 100 : 0.5;
      const heal = Math.floor(attacker.atk * healMult);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      spawnFloatNum(attacker.x, attacker.y - 10, heal, true);
      spawnSparks(attacker.x, attacker.y, ["#4ade80", "#86efac", "#bbf7d0"]);

    } else if (skill === "Heal Party") {
      const healMult = attacker.skillHealPercent ? attacker.skillHealPercent / 100 : 0.35;
      const allies = attacker.isPlayer ? myAlive : oppAlive;
      allies.forEach(p => {
        const heal = Math.floor(attacker.atk * healMult);
        p.hp = Math.min(p.maxHp, p.hp + heal);
        spawnFloatNum(p.x, p.y - 10, heal, true);
        spawnSparks(p.x, p.y, ["#4ade80", "#86efac", "#bbf7d0"]);
      });

    } else if (skill === "Poison" && target) {
      let ticks = 0;
      const poisonMult = attacker.skillDamagePercent ? attacker.skillDamagePercent / 100 : 0.14;
      const tickDmg = Math.max(1, Math.floor(attacker.atk * poisonMult));
      spawnSparks(target.x, target.y, ["#a3e635", "#84cc16", "#d9f99d"]);
      const t = setInterval(() => {
        if (!battleActiveRef.current) { clearInterval(t); return; }
        ticks++;
        target.hp = Math.max(0, target.hp - tickDmg);
        spawnFloatNum(target.x, target.y - 6, tickDmg);
        if (ticks >= 6 || target.hp <= 0) {
          clearInterval(t);
          if (target.hp <= 0 && !target.isDead) doKo(target);
        }
      }, 900);
    }
  }, [spawnFloatNum, spawnSparks, flashHit, doKo]);

  // ── End battle ─────────────────────────────────────────────────
  const endBattle = useCallback((outcome: "win" | "loss") => {
    battleActiveRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
    if (outcome === "win") playBattleVictory(); else playDefeat();
    setResultOutcome(outcome);
    setPhase("result");
    setPendingSkill(null);
    pendingSkillRef.current = null;
    chargerRef.current = null;
    setChargerView(null);
    const avgLvl = Math.max(1, petsRef.current.filter(p => !p.isPlayer).length);
    recordResult.mutate({ result: outcome, opponentLevel: avgLvl });
  }, [recordResult]);

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
            const eased = k * k; // ease-in: snaps faster as it nears
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
              e.mana = Math.min(MAX_MANA, e.mana + 18);
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

        // AI special: auto-fire when mana fills. Keeps the screen
        // alive even if no charger has landed yet.
        if (e.mana >= MAX_MANA && (now - (lastAiSkillTime.current[e.uid] || 0)) > 5000) {
          lastAiSkillTime.current[e.uid] = now;
          const sk = effectiveSkillType(e);
          if (sk) {
            const sMode = skillMode(sk);
            if (sMode === "needs-enemy") {
              const target = myAlive[Math.floor(Math.random() * myAlive.length)];
              if (target) fireSkill(e, sk, target);
            } else {
              fireSkill(e, sk, null);
            }
          } else {
            e.mana = 0;
          }
        }
      }

      // ── Spawn a new charger if none active ─────────────────
      if (!chargerRef.current && now - lastChargeAttemptRef.current > CHARGE_INTERVAL_MS) {
        lastChargeAttemptRef.current = now;
        const candidates = oppAlive.filter(e => e.uid !== chargerRef.current?.enemyUid);
        if (candidates.length && myAlive.length) {
          const enemy = candidates[Math.floor(Math.random() * candidates.length)];
          const target = myAlive[Math.floor(Math.random() * myAlive.length)];
          const next: Charger = {
            enemyUid: enemy.uid,
            targetUid: target.uid,
            startMs: now,
            chargeMs: 1100,
            returning: false,
            returnStartMs: 0,
            returnMs: 460,
          };
          chargerRef.current = next;
          setChargerView(next);
        }
      }

      // ── Allies: stationary, slow passive mana gain ─────────
      for (const a of myAlive) {
        a.x = a.baseX;
        a.y = a.baseY;
        a.mana = Math.min(MAX_MANA, a.mana + 0.05);
      }

      petsRef.current = [...ps];
      setPets([...ps]);
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
          fireSkill(skill_pet, effectiveSkillType(skill_pet)!, tapped);
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
      p.mana >= MAX_MANA && effectiveSkillType(p) && Math.hypot(p.x - pos.x, p.y - pos.y) < 13
    );
    if (tappedSkillReady) {
      const sk = effectiveSkillType(tappedSkillReady)!;
      const mode = skillMode(sk);
      if (mode === "auto") {
        fireSkill(tappedSkillReady, sk, null);
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
    setSlashTrail([pos]);
  }, [getArenaPos, fireSkill]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
    if (draggingPotionRef.current) return;
    if (!isSlashingRef.current) return;
    const pos = getArenaPos(e.clientX, e.clientY);
    const prev = slashPathRef.current[slashPathRef.current.length - 1];
    slashPathRef.current.push(pos);
    if (slashPathRef.current.length > 22) slashPathRef.current.shift();
    setSlashTrail([...slashPathRef.current]);
    if (!prev) return;

    const oppAlive = petsRef.current.filter(p => !p.isPlayer && !p.isDead);
    for (const opp of oppAlive) {
      if (hitSetRef.current.has(opp.uid)) continue;
      const ax = prev.x, ay = prev.y, bx = pos.x, by = pos.y;
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const tParam = Math.max(0, Math.min(1, ((opp.x - ax) * dx + (opp.y - ay) * dy) / (len * len)));
      const dist = Math.hypot(ax + tParam * dx - opp.x, ay + tParam * dy - opp.y);
      if (dist >= 14) continue;

      hitSetRef.current.add(opp.uid);
      const isCrit = Math.random() < 0.15;
      const myAlive = petsRef.current.filter(p => p.isPlayer && !p.isDead);
      // Slot-0 is the lead attacker for swipe-damage attribution. If
      // they've been KO'd, fall back to whoever's alive.
      const attacker = myAlive.find(p => p.slotIdx === 0) ?? myAlive[0];
      if (!attacker) continue;

      const newCombo = bumpCombo();
      const comboMult = 1 + Math.min(newCombo * 0.12, 0.6);
      const raw = attacker.atk - Math.floor(opp.def * 0.25) + Math.floor(Math.random() * 8) - 4;
      const dmg = Math.max(1, Math.floor(raw * (isCrit ? 1.8 : 1) * comboMult));
      opp.hp = Math.max(0, opp.hp - dmg);
      attacker.mana = Math.min(MAX_MANA, attacker.mana + 16);

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
    setTimeout(() => setSlashTrail([]), 180);
  }, []);

  // ── Derived ────────────────────────────────────────────────────
  const playerPets = pets.filter(p => p.isPlayer);
  const enemyPets = pets.filter(p => !p.isPlayer);
  const pendingPet = pendingSkill ? pets.find(p => p.uid === pendingSkill.petUid) : null;
  void playerPets;

  // Charger UI: who's the targeted ally? (For INCOMING bar.)
  const incomingTarget = chargerView && !chargerView.returning
    ? pets.find(p => p.uid === chargerView.targetUid)
    : null;
  const incomingPct = chargerView && !chargerView.returning
    ? Math.min(1, (Date.now() - chargerView.startMs) / chargerView.chargeMs)
    : 0;

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ fontFamily: "Lora, serif" }}>
      <style>{`
        @keyframes koSpin { 0%{transform:translate(-50%,-50%) scale(1) rotate(0deg);opacity:1} 100%{transform:translate(-50%,-50%) scale(0.3) rotate(720deg);opacity:0} }
        @keyframes bSpark { to { transform: translate(calc(var(--dx)*14px), calc(var(--dy)*14px)); opacity:0; } }
        @keyframes bFloat { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-38px)} }
        @keyframes bIdle { 0%,100%{transform:translate(-50%,-50%)} 50%{transform:translate(-50%,calc(-50% - 4px))} }
        @keyframes bResultIn { 0%{transform:scale(0.85) translateY(18px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes bHit { 0%{filter:brightness(1)} 18%{filter:brightness(2.4) saturate(0.4)} 60%{filter:brightness(0.6)} 100%{filter:brightness(1)} }
        @keyframes bShake { 0%,100%{margin-left:0} 20%{margin-left:-4px} 40%{margin-left:4px} 60%{margin-left:-3px} 80%{margin-left:2px} }
        @keyframes skillGlow { 0%,100%{box-shadow:0 0 12px 4px rgba(167,139,250,0.6), 0 0 24px 8px rgba(124,58,237,0.35)} 50%{box-shadow:0 0 20px 8px rgba(196,181,253,0.85), 0 0 38px 14px rgba(167,139,250,0.55)} }
        @keyframes targetPulse { 0%,100%{opacity:0.55} 50%{opacity:1} }
        @keyframes dropZonePulse { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0.55), 0 0 18px rgba(74,222,128,0.35)} 50%{box-shadow:0 0 0 8px rgba(74,222,128,0.0), 0 0 28px rgba(74,222,128,0.55)} }
        @keyframes incomingBar { 0%{width:0%} 100%{width:100%} }
        @keyframes bOrb { 0%{transform:translate(0,0) scale(0.6);opacity:0} 30%{opacity:1} 100%{transform:translate(var(--ox,0px),-180px) scale(1.1);opacity:0} }
        @keyframes bWinText { 0%{transform:scale(0.6) rotate(-6deg);opacity:0;letter-spacing:0.05em} 60%{transform:scale(1.12) rotate(2deg);opacity:1} 100%{transform:scale(1) rotate(0deg);opacity:1;letter-spacing:0.18em} }
        @keyframes comboText { 0%{transform:scale(1.4) translateY(-4px);opacity:0} 60%{transform:scale(0.95) translateY(0);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
      `}</style>

      {/* Backdrop */}
      <div className="absolute inset-0" style={{ backgroundImage: `url(${forestBgImg})`, backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.42) saturate(1.15)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(239,68,68,0.10) 0%, transparent 55%), linear-gradient(180deg,rgba(15,5,8,.35) 0%,rgba(5,4,8,.7) 100%)" }} />
      <div className="absolute inset-y-0 left-0 w-10 pointer-events-none z-[1]" style={{ background: "linear-gradient(90deg, rgba(45,40,35,0.55) 0%, rgba(45,40,35,0.30) 60%, transparent 100%)", borderRight: "1px solid rgba(120,100,80,0.18)" }} />
      <div className="absolute inset-y-0 right-0 w-10 pointer-events-none z-[1]" style={{ background: "linear-gradient(270deg, rgba(45,40,35,0.55) 0%, rgba(45,40,35,0.30) 60%, transparent 100%)", borderLeft: "1px solid rgba(120,100,80,0.18)" }} />
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
          <span className="text-yellow-300 font-bold">{pendingPet.specialSkill}</span>
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
          {/* Grid */}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(239,68,68,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(239,68,68,0.025) 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

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
          {slashTrail.length >= 2 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-30"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polyline
                points={slashTrail.map(p => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke="#ef4444" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round"
                opacity="0.95"
                vectorEffect="non-scaling-stroke"
                style={{ filter: "drop-shadow(0 0 7px #ef4444)", strokeWidth: 3.5 }}
              />
            </svg>
          )}

          {/* INCOMING bar above the targeted ally */}
          {incomingTarget && (
            <div
              className="absolute pointer-events-none z-30"
              style={{
                left: `${incomingTarget.x}%`,
                top: `${incomingTarget.y - 16}%`,
                transform: "translate(-50%,-50%)",
                width: 72,
              }}
              data-testid={`incoming-${incomingTarget.uid}`}
            >
              <div className="text-center text-[9px] font-black tracking-[0.18em] text-red-300 mb-0.5" style={{ textShadow: "0 0 6px rgba(239,68,68,0.9)" }}>
                INCOMING!
              </div>
              <div className="h-1.5 w-full bg-black/70 rounded-full overflow-hidden border border-red-400/40">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${incomingPct * 100}%`, background: "linear-gradient(90deg, #fca5a5, #ef4444)" }}
                />
              </div>
            </div>
          )}

          {/* Pets */}
          {pets.filter(p => !p.isDead).map(pet => {
            const isSkillReady = pet.isPlayer && pet.mana >= MAX_MANA && !!pet.specialSkill;
            const isPendingSource = pendingSkill?.petUid === pet.uid;
            const isEnemyTarget = pendingSkill?.mode === "needs-enemy" && !pet.isPlayer;
            const isHoveredDrop = pet.isPlayer && hoveredAllyUid === pet.uid;
            const size = pet.isPlayer ? 200 : 180;
            const isHit = !!hitFlash[pet.uid];
            const stars = Math.max(0, Math.min(5, Math.floor(pet.starRarity || 0)));

            return (
              <div
                key={pet.uid}
                className="absolute pointer-events-none flex flex-col items-center"
                style={{
                  left: `${pet.x}%`, top: `${pet.y}%`,
                  transform: "translate(-50%,-50%)",
                  animation: isHit ? "bShake 0.32s ease-in-out" : "bIdle 1.4s ease-in-out infinite",
                  zIndex: pet.isPlayer ? 15 : 12,
                }}
              >
                {/* For ENEMIES the HP bar floats ABOVE the sprite. We
                    render it with absolute positioning relative to this
                    container so it tracks the sprite while the enemy
                    floats and even charges down. */}
                {!pet.isPlayer && (
                  <div className="absolute" style={{ bottom: `calc(100% + 6px)`, left: "50%", transform: "translateX(-50%)", width: 60 }}>
                    <div className="flex flex-col items-center gap-0.5">
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
                        <div className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(0, (pet.hp / pet.maxHp) * 100)}%`, background: hpColor(pet.hp / pet.maxHp) }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Sprite (with hit/dim/glow states). Hovered allies
                    during a potion drag get a green pulsing ring as a
                    drop-zone affordance. */}
                <div
                  style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    transform: pet.isPlayer ? undefined : "scaleX(-1)",
                    animation: isHoveredDrop
                      ? "dropZonePulse 0.7s ease-in-out infinite"
                      : isSkillReady
                        ? "skillGlow 1.2s ease-in-out infinite"
                        : isHit
                          ? "bHit 0.32s ease-out"
                          : undefined,
                    outline: isPendingSource
                      ? "2px solid rgba(250,204,21,0.8)"
                      : isHoveredDrop
                        ? "2px solid rgba(74,222,128,0.85)"
                        : undefined,
                    outlineOffset: 3,
                    position: "relative",
                  }}
                >
                  {pet.petTemplateId
                    ? <PetAnimatorCanvas petTemplateId={pet.petTemplateId} size={size} className="w-full h-full" />
                    : pet.imageUrl
                    ? <img src={pet.imageUrl} style={{ width: size, height: size, objectFit: "contain", filter: pet.isPlayer ? "drop-shadow(0 0 10px rgba(167,139,250,0.5))" : "drop-shadow(0 0 10px rgba(239,68,68,0.45))" }} />
                    : <div style={{ width: size, height: size, background: pet.isPlayer ? "rgba(100,60,200,0.3)" : "rgba(200,60,60,0.3)", borderRadius: "50%", border: `2px solid ${pet.isPlayer ? "rgba(167,139,250,0.5)" : "rgba(239,68,68,0.5)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}><img src={petPawIcon} alt="" style={{ width: size * 0.65, height: size * 0.65, objectFit: "contain" }} /></div>}
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

                {/* For ALLIES the HP + mana stack sits under the sprite. */}
                {pet.isPlayer && (
                  <div className="mt-1 flex flex-col items-center gap-0.5" style={{ width: 60 }}>
                    {stars > 0 && (
                      <div className="text-[7px] leading-none whitespace-nowrap" style={{ color: "#fbbf24", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                        {"★".repeat(stars)}
                      </div>
                    )}
                    <div className="h-1.5 w-full bg-black/70 rounded-full overflow-hidden border border-white/10">
                      <div className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(0, (pet.hp / pet.maxHp) * 100)}%`, background: hpColor(pet.hp / pet.maxHp) }} />
                    </div>
                    {pet.specialSkill && (
                      <div className="h-1 w-full bg-black/50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-200" style={{ width: `${(pet.mana / MAX_MANA) * 100}%`, background: pet.mana >= MAX_MANA ? "#c084fc" : "#4c1d95" }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Skill ready / pending labels */}
                {isSkillReady && !isPendingSource && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] text-purple-200 font-bold tracking-wider animate-pulse">
                    ✦ {pet.specialSkill}
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
    </div>
  );
}
