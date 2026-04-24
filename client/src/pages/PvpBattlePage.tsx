import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { playHit, playPlayerHurt, playBattleVictory, playDefeat } from "@/lib/sounds";
import { ArrowLeft, X } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
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
  /** True only for the player's *active* pet (slot 0). In manual mode this
   *  is the only pet the player drives via swipe — the rest auto-attack. */
  isActive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
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

const MAX_MANA = 100;

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
let _pid = 0;
const nextPid = () => _pid++;

export default function PvpBattlePage({
  opponent,
  myPetIds,
  potionInventoryIds = [],
  battleToken,
  onClose,
}: {
  opponent: Opponent;
  myPetIds: string[];
  /** Inventory ids of potions the player chose on the lobby loadout. The
   * battle screen does not yet consume these — kept for forward-wiring. */
  potionInventoryIds?: string[];
  /** One-time token issued by /api/pvp/start. Required by /api/pvp/result;
   *  without it the server rejects the result with 403. */
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
  const animFrameRef = useRef(0);

  const arenaRef = useRef<HTMLDivElement>(null);
  const selectedPetUidRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
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

  // Skill targeting state
  const [pendingSkill, setPendingSkill] = useState<PendingSkill | null>(null);
  const pendingSkillRef = useRef<PendingSkill | null>(null);

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
        // Pass the opponent userId so the server can:
        //   1) compare battle-power for difficulty-based BP scoring, and
        //   2) credit +5 defensive BP when the attacker (this client) loses.
        opponentUserId: opponent.userId,
        result: data.result,
        battleToken,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCoinsEarned(data.coinsEarned ?? 0);
      setBpEarned(data.battlePointsDelta ?? 0);
    },
  });

  // Auto vs Manual mode toggle. Manual (default) = active pet drives by
  // swipe; the other slot pets auto-attack and require a tap to special.
  // Auto = every player pet behaves like an enemy AI (move + collide +
  // auto-fire skills when mana fills).
  const [mode, setMode] = useState<"auto" | "manual">("manual");
  const modeRef = useRef<"auto" | "manual">("manual");
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const buildPets = useCallback(() => {
    const inv = myInventory as any[];
    const myPets: BattlePet[] = myPetIds.map((id, i) => {
      const invItem = inv.find((it: any) => (it.inventoryId || it.id) === id);
      if (!invItem) return null;
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
        // First slot is the player's *active* pet — only it is swipe-driven
        // in manual mode. Mirrors the locked-slot rule on the lobby page.
        isActive: i === 0,
        x: 12 + (i % 3) * 28 + Math.random() * 6,
        y: 64 + Math.floor(i / 3) * 15 + Math.random() * 4,
        vx: 0, vy: 0, isDead: false, mana: 0,
      } as BattlePet;
    }).filter(Boolean) as BattlePet[];

    const oppBattlePets: BattlePet[] = (oppPets as any[]).slice(0, 5).map((p: any, i: number) => ({
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
      isActive: false,
      x: 12 + (i % 3) * 28 + Math.random() * 6,
      y: 8 + Math.floor(i / 3) * 14 + Math.random() * 4,
      vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.4 + 0.2,
      isDead: false, mana: 0,
    }));

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
    if (countdown <= 0) { battleActiveRef.current = true; setPhase("battle"); return; }
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

    // Special-skill damage now respects defender DEF, the same way basic
    // collision damage does. Without this, a high-DEF tank would block
    // basic attacks but get one-shot by Lazer — feels broken.
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
    const avgLvl = Math.max(1, petsRef.current.filter(p => !p.isPlayer).length);
    recordResult.mutate({ result: outcome, opponentLevel: avgLvl });
  }, [recordResult]);

  // ── Main battle loop ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== "battle") return;

    const dealDamage = (attacker: BattlePet, target: BattlePet) => {
      const raw = Math.max(1, attacker.atk - Math.floor(target.def * 0.25) + Math.floor(Math.random() * 6) - 3);
      const dmg = Math.max(1, raw);
      target.hp = Math.max(0, target.hp - dmg);
      attacker.mana = Math.min(MAX_MANA, attacker.mana + 14);
      return dmg;
    };

    const animate = () => {
      if (!battleActiveRef.current) return;
      const ps = petsRef.current;
      const alive = ps.filter(p => !p.isDead);
      const myAlive = alive.filter(p => p.isPlayer);
      const oppAlive = alive.filter(p => !p.isPlayer);

      if (myAlive.length === 0) { endBattle("loss"); return; }
      if (oppAlive.length === 0) { endBattle("win"); return; }

      const now = Date.now();

      // ── Per-pet AI driver ─────────────────────────────────────
      // A pet is "AI-controlled" when:
      //   • It's an opponent (always), OR
      //   • It's a player pet AND (mode is "auto", OR it's not the active
      //     pet — non-active player pets always auto-attack so the player
      //     only has to focus on the active swiper.)
      const inAuto = modeRef.current === "auto";
      const isAi = (p: BattlePet) =>
        !p.isPlayer || inAuto || !p.isActive;

      for (const pet of alive) {
        if (pet.isDead) continue;

        if (isAi(pet)) {
          // Pick targets based on team
          const myEnemies = pet.isPlayer ? oppAlive : myAlive;
          const myFriends = pet.isPlayer ? myAlive : oppAlive;

          const nearest = myEnemies.reduce((best: BattlePet | null, p) =>
            !best || Math.hypot(p.x - pet.x, p.y - pet.y) < Math.hypot(best.x - pet.x, best.y - pet.y) ? p : best, null);
          if (nearest) {
            const dx = nearest.x - pet.x, dy = nearest.y - pet.y;
            const dist = Math.hypot(dx, dy) || 1;
            // Heavier damping + smaller steering acceleration so the pets
            // glide smoothly toward each other instead of darting around.
            // Steady-state speed is roughly accel/(1-damping) per frame —
            // ~0.31%/frame ≈ 19% of the arena per second, half of what it
            // used to be. That makes the brawl readable on a small phone.
            pet.vx = pet.vx * 0.92 + (dx / dist) * 0.025;
            pet.vy = pet.vy * 0.92 + (dy / dist) * 0.025;
          }
          pet.x += pet.vx;
          pet.y += pet.vy;
          // Use full arena bounds for AI-controlled pets — non-active
          // player pets need to be able to cross the dividing line to
          // reach the enemies up top.
          if (pet.x < 4) { pet.vx = Math.abs(pet.vx); pet.x = 4; }
          if (pet.x > 96) { pet.vx = -Math.abs(pet.vx); pet.x = 96; }
          if (pet.y < 4) { pet.vy = Math.abs(pet.vy); pet.y = 4; }
          if (pet.y > 94) { pet.vy = -Math.abs(pet.vy); pet.y = 94; }

          // Collision damage on enemies
          for (const enemy of myEnemies) {
            if (enemy.isDead) continue;
            const dist = Math.hypot(pet.x - enemy.x, pet.y - enemy.y);
            if (dist < 14) {
              const dmg = dealDamage(pet, enemy);
              const colors = pet.isPlayer
                ? ["#a78bfa", "#c4b5fd", "#ddd6fe"]
                : ["#c084fc", "#818cf8", "#f472b6"];
              spawnFloatNum(enemy.x, enemy.y - 10, dmg);
              spawnSparks(enemy.x, enemy.y, colors);
              flashHit(enemy.uid);
              const dx2 = enemy.x - pet.x || 1, dy2 = enemy.y - pet.y || 1;
              const d = Math.hypot(dx2, dy2);
              // Softer recoil after a clash so pets don't ping-pong away.
              pet.vx = -(dx2 / d) * 0.65; pet.vy = -(dy2 / d) * 0.65;
              if (enemy.hp <= 0 && !enemy.isDead) doKo(enemy);
            }
          }

          // AI skill: auto-trigger when mana full. We deliberately do NOT
          // auto-fire specials for non-active player pets in MANUAL mode —
          // the spec says specials always require a tap on the glowing
          // pet. Only enemies and full-auto-mode pets self-cast.
          const allowAutoSpecial = !pet.isPlayer || inAuto;
          if (allowAutoSpecial && pet.mana >= MAX_MANA && (now - (lastAiSkillTime.current[pet.uid] || 0)) > 5000) {
            lastAiSkillTime.current[pet.uid] = now;
            const sk = effectiveSkillType(pet);
            if (sk) {
              const sMode = skillMode(sk);
              if (sMode === "needs-enemy") {
                const target = myEnemies[Math.floor(Math.random() * myEnemies.length)];
                if (target) fireSkill(pet, sk, target);
              } else {
                fireSkill(pet, sk, null);
              }
            } else {
              pet.mana = 0;
            }
          }
          // suppress unused-var lint
          void myFriends;
        } else {
          // Active player pet in manual mode: passive mana gain only.
          pet.mana = Math.min(MAX_MANA, pet.mana + 0.06);
          // Stay in the bottom half so the player can find them.
          if (pet.x < 4) pet.x = 4;
          if (pet.x > 96) pet.x = 96;
          if (pet.y < 50) pet.y = 50;
          if (pet.y > 94) pet.y = 94;
        }
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

  // ── Pointer handlers ───────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
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
        // Find which opponent was tapped
        const oppAlive = ps.filter(p => !p.isPlayer && !p.isDead);
        const tapped = oppAlive.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 14);
        if (tapped) {
          fireSkill(skill_pet, effectiveSkillType(skill_pet)!, tapped);
          setPendingSkill(null); pendingSkillRef.current = null;
        } else {
          // Cancel on any other tap
          setPendingSkill(null); pendingSkillRef.current = null;
        }
        return;
      }
      // Should not reach here for "auto" (auto already fired)
      setPendingSkill(null); pendingSkillRef.current = null;
      return;
    }

    // ─ Normal mode: check if tapping a glowing (skill-ready) player pet ─
    const myAlive = ps.filter(p => p.isPlayer && !p.isDead);
    const tappedSkillReady = myAlive.find(p => p.mana >= MAX_MANA && effectiveSkillType(p) && Math.hypot(p.x - pos.x, p.y - pos.y) < 13);
    if (tappedSkillReady) {
      const sk = effectiveSkillType(tappedSkillReady)!;
      const mode = skillMode(sk);
      if (mode === "auto") {
        // Fire immediately
        fireSkill(tappedSkillReady, sk, null);
      } else {
        // Enter targeting mode
        const ps2: PendingSkill = { petUid: tappedSkillReady.uid, mode };
        setPendingSkill(ps2); pendingSkillRef.current = ps2;
      }
      return;
    }

    // ─ Check if tapping the *active* player pet to drag ─
    // Only the active pet (slot 0) is player-driven in manual mode; the
    // other added pets auto-attack and shouldn't be repositioned by the
    // player. In auto mode we lock dragging entirely so the AI can run.
    if (modeRef.current === "manual") {
      const tappedActive = myAlive.find(p => p.isActive && Math.hypot(p.x - pos.x, p.y - pos.y) < 12);
      if (tappedActive) {
        selectedPetUidRef.current = tappedActive.uid;
        isDraggingRef.current = true;
        return;
      }
    }

    // ─ Otherwise start a slash ─
    isSlashingRef.current = true;
    slashPathRef.current = [pos];
    hitSetRef.current = new Set();
    setSlashTrail([pos]);
  }, [getArenaPos, fireSkill]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
    const pos = getArenaPos(e.clientX, e.clientY);

    if (isDraggingRef.current && selectedPetUidRef.current) {
      const pet = petsRef.current.find(p => p.uid === selectedPetUidRef.current);
      if (pet) {
        pet.x = Math.max(4, Math.min(96, pos.x));
        pet.y = Math.max(50, Math.min(94, pos.y));
      }
      return;
    }

    if (!isSlashingRef.current) return;
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
      const t = Math.max(0, Math.min(1, ((opp.x - ax) * dx + (opp.y - ay) * dy) / (len * len)));
      const dist = Math.hypot(ax + t * dx - opp.x, ay + t * dy - opp.y);
      if (dist >= 16) continue;

      hitSetRef.current.add(opp.uid);
      const isCrit = Math.random() < 0.15;
      const myAlive = petsRef.current.filter(p => p.isPlayer && !p.isDead);
      const attacker = myAlive[0];
      if (!attacker) continue;

      const raw = attacker.atk - Math.floor(opp.def * 0.25) + Math.floor(Math.random() * 8) - 4;
      const dmg = Math.max(1, Math.floor(raw * (isCrit ? 1.8 : 1)));
      opp.hp = Math.max(0, opp.hp - dmg);
      attacker.mana = Math.min(MAX_MANA, attacker.mana + 16);

      const colors = isCrit ? ["#fbbf24", "#f59e0b", "#fde68a"] : ["#a78bfa", "#c4b5fd", "#ddd6fe"];
      spawnSparks(opp.x, opp.y, colors);
      spawnFloatNum(opp.x, opp.y - 8, dmg, false, isCrit);
      flashHit(opp.uid);
      playHit();

      const sdx = bx - ax, sdy = by - ay, sl = Math.hypot(sdx, sdy) || 1;
      opp.vx = (sdx / sl) * 3; opp.vy = (sdy / sl) * 3;

      if (opp.hp <= 0 && !opp.isDead) doKo(opp);
    }
  }, [getArenaPos, spawnSparks, spawnFloatNum, flashHit, doKo]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
    selectedPetUidRef.current = null;
    isSlashingRef.current = false;
    hitSetRef.current = new Set();
    setTimeout(() => setSlashTrail([]), 180);
  }, []);

  // ── Derived ────────────────────────────────────────────────────
  const playerPets = pets.filter(p => p.isPlayer);
  const enemyPets = pets.filter(p => !p.isPlayer);

  const pendingPet = pendingSkill ? pets.find(p => p.uid === pendingSkill.petUid) : null;

  // ── Potion usage ─────────────────────────────────────────────
  // The lobby loads potions into `potionInventoryIds`; we keep a
  // local copy here so that consumed bottles can drop out of the bar
  // without refetching the server inventory mid-fight.
  const [potionsRemaining, setPotionsRemaining] = useState<string[]>(potionInventoryIds);
  useEffect(() => { setPotionsRemaining(potionInventoryIds); }, [potionInventoryIds]);

  const usePotionMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("POST", "/api/explore/use-potion", { inventoryId });
      return res.json() as Promise<{ healAmount: number; manaAmount: number; petsRevived: number; potionName: string }>;
    },
    onSettled: () => {
      // Refresh inventory either way so the player's bag is in sync the
      // next time they open the lobby/picker.
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });

  const consumePotion = useCallback((inventoryId: string) => {
    if (!battleActiveRef.current) return;
    const inv = (myInventory as any[]).find((i: any) => (i.inventoryId || i.id) === inventoryId);
    if (!inv) return;
    const heal = inv.healthRestored ?? 0;
    const mana = inv.manaRestored ?? 0;
    const revives = inv.petsRevived ?? 0;
    const ps = petsRef.current;
    const myAlive = ps.filter(p => p.isPlayer && !p.isDead);
    const myDead = ps.filter(p => p.isPlayer && p.isDead);
    const active = myAlive.find(p => p.isActive) ?? myAlive[0];

    // Guards mirror the PvE arena: don't waste a potion that does nothing.
    if (heal > 0 && (!active || active.hp >= active.maxHp)) return;
    if (mana > 0 && (!active || active.mana >= MAX_MANA)) return;
    if (revives > 0 && myDead.length === 0) return;
    if (heal === 0 && mana === 0 && revives === 0) return;

    // Snapshot pre-effect state so we can roll back if the server
    // refuses the consume (e.g. inventory row already deleted).
    const rollback: { uid: string; hp: number; mana: number; isDead: boolean }[] = [];
    const snap = (p: BattlePet) => rollback.push({ uid: p.uid, hp: p.hp, mana: p.mana, isDead: p.isDead });

    if (active && heal > 0) {
      snap(active);
      active.hp = Math.min(active.maxHp, active.hp + heal);
      spawnFloatNum(active.x, active.y - 10, heal, true);
      spawnSparks(active.x, active.y, ["#4ade80", "#86efac", "#bbf7d0"]);
    }
    if (active && mana > 0) {
      // Avoid double-snapshotting active when both heal and mana > 0.
      if (!rollback.some(r => r.uid === active.uid)) snap(active);
      active.mana = Math.min(MAX_MANA, active.mana + mana);
      spawnSparks(active.x, active.y, ["#a78bfa", "#c4b5fd", "#ddd6fe"]);
    }
    if (revives > 0 && myDead.length > 0) {
      const target = myDead[0];
      snap(target);
      target.isDead = false;
      target.hp = Math.max(1, Math.floor(target.maxHp * 0.5));
      petsRef.current = [...petsRef.current];
      setPets([...petsRef.current]);
      spawnFloatNum(target.x, target.y - 10, target.hp, true);
      spawnSparks(target.x, target.y, ["#fbbf24", "#fde68a", "#fef3c7"]);
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
        // Server rejected the consume — restore the bottle to the bar
        // and undo any HP/mana/revive we optimistically applied so the
        // battle state matches reality.
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ fontFamily: "Lora, serif" }}>
      <style>{`
        @keyframes koSpin { 0%{transform:translate(-50%,-50%) scale(1) rotate(0deg);opacity:1} 100%{transform:translate(-50%,-50%) scale(0.3) rotate(720deg);opacity:0} }
        @keyframes bSpark { to { transform: translate(calc(var(--dx)*14px), calc(var(--dy)*14px)); opacity:0; } }
        @keyframes bFloat { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-38px)} }
        @keyframes bIdle { 0%,100%{transform:translate(-50%,-50%)} 50%{transform:translate(-50%,calc(-50% - 4px))} }
        @keyframes bResultIn { 0%{transform:scale(0.85) translateY(18px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
        /* Hit shake + dim — quick "ouch" feedback. Brightens then dips
           below 1 for a short impact frame. Pairs with the X_X eyes
           overlay rendered on hit. */
        @keyframes bHit { 0%{filter:brightness(1)} 18%{filter:brightness(2.4) saturate(0.4)} 60%{filter:brightness(0.6)} 100%{filter:brightness(1)} }
        @keyframes bShake { 0%,100%{margin-left:0} 20%{margin-left:-4px} 40%{margin-left:4px} 60%{margin-left:-3px} 80%{margin-left:2px} }
        @keyframes skillGlow { 0%,100%{box-shadow:0 0 12px 4px rgba(167,139,250,0.6), 0 0 24px 8px rgba(124,58,237,0.35)} 50%{box-shadow:0 0 20px 8px rgba(196,181,253,0.85), 0 0 38px 14px rgba(167,139,250,0.55)} }
        @keyframes targetPulse { 0%,100%{opacity:0.55} 50%{opacity:1} }
        /* Golden-orb burst behind the win text. Multiple offset copies
           give the "rising orbs" feel without spawning a dozen DOM
           nodes per orb. */
        @keyframes bOrb { 0%{transform:translate(0,0) scale(0.6);opacity:0} 30%{opacity:1} 100%{transform:translate(var(--ox,0px),-180px) scale(1.1);opacity:0} }
        @keyframes bWinText { 0%{transform:scale(0.6) rotate(-6deg);opacity:0;letter-spacing:0.05em} 60%{transform:scale(1.12) rotate(2deg);opacity:1} 100%{transform:scale(1) rotate(0deg);opacity:1;letter-spacing:0.18em} }
      `}</style>

      {/* ── Magical rainforest backdrop ─────────────────────────────
          Forest art is the base; we layer a subtle green-tinted glow
          (canopy light) and a stone-arena overlay (twin pillars +
          a dim runic circle on the floor) so the fight reads as
          "ancient ruin in the jungle" instead of just "dark forest". */}
      <div className="absolute inset-0" style={{ backgroundImage: `url(${forestBgImg})`, backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.42) saturate(1.15)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(74,222,128,0.10) 0%, transparent 55%), linear-gradient(180deg,rgba(5,15,8,.35) 0%,rgba(5,8,15,.7) 100%)" }} />
      {/* Stone pillars: simple gradient bars on the left/right edges,
          decorative only — pointer-events:none so they never eat taps. */}
      <div className="absolute inset-y-0 left-0 w-10 pointer-events-none z-[1]" style={{ background: "linear-gradient(90deg, rgba(45,40,35,0.55) 0%, rgba(45,40,35,0.30) 60%, transparent 100%)", borderRight: "1px solid rgba(120,100,80,0.18)" }} />
      <div className="absolute inset-y-0 right-0 w-10 pointer-events-none z-[1]" style={{ background: "linear-gradient(270deg, rgba(45,40,35,0.55) 0%, rgba(45,40,35,0.30) 60%, transparent 100%)", borderLeft: "1px solid rgba(120,100,80,0.18)" }} />
      {/* Runic floor circle anchored to the dividing line — gives the
          arena a "magic combat ring" silhouette without needing art. */}
      <div className="absolute pointer-events-none z-[1]" style={{ left: "50%", top: "50%", width: 320, height: 60, transform: "translate(-50%,-50%)", borderRadius: "50%", border: "1px dashed rgba(167,139,250,0.22)", boxShadow: "inset 0 0 30px rgba(167,139,250,0.10), 0 0 30px rgba(167,139,250,0.10)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 px-3 pb-2 shrink-0" style={{ background: "rgba(5,8,15,0.72)", borderBottom: "1px solid rgba(167,139,250,0.1)", paddingTop: "max(env(safe-area-inset-top, 0px) + 10px, 44px)" }}>
        <button onClick={() => onClose(null)} data-testid="button-close-battle" className="w-9 h-9 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 transition-colors active:scale-90 shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 text-center text-[12px] tracking-[0.2em] text-red-300 font-bold truncate">vs {opponent.username}</div>
        {/* Auto/Manual mode toggle. Manual = swipe-driven active pet,
            others auto-attack. Auto = every player pet runs the same
            AI as enemies. The toggle is live-editable mid-fight so
            the player can flip strategies without losing the round. */}
        <button
          onClick={() => setMode((m) => (m === "auto" ? "manual" : "auto"))}
          data-testid="button-mode-toggle"
          className="px-2.5 py-1 rounded-md text-[10px] font-black tracking-[0.16em] active:scale-95 transition-all shrink-0"
          style={{
            background: mode === "auto" ? "rgba(74,222,128,0.18)" : "rgba(124,58,237,0.18)",
            color: mode === "auto" ? "#86efac" : "#c4b5fd",
            border: `1px solid ${mode === "auto" ? "rgba(74,222,128,0.45)" : "rgba(167,139,250,0.45)"}`,
          }}
        >
          {mode === "auto" ? "AUTO" : "MANUAL"}
        </button>
        {pendingSkill && (
          <button onClick={() => { setPendingSkill(null); pendingSkillRef.current = null; }} className="flex items-center gap-1 text-white/40 text-[9px]">
            <X size={11} /> CANCEL
          </button>
        )}
      </div>

      {/* Opponent HP bars */}
      <div className="relative z-10 shrink-0 px-3 pt-2 pb-1" style={{ background: "rgba(10,3,20,0.7)" }}>
        <div className="flex items-center gap-1.5 flex-wrap min-h-[14px]">
          {enemyPets.map(p => (
            <div key={p.uid} className="flex items-center gap-1">
              <div
                className="h-1.5 w-10 bg-black/60 rounded-full overflow-hidden transition-all"
                style={{
                  border: pendingSkill?.mode === "needs-enemy" ? "1px solid rgba(239,68,68,0.6)" : "1px solid transparent",
                  animation: pendingSkill?.mode === "needs-enemy" ? "targetPulse 0.8s ease-in-out infinite" : undefined,
                }}
              >
                <div className="h-full rounded-full transition-all duration-150" style={{ width: `${(p.hp / p.maxHp) * 100}%`, background: hpColor(p.hp / p.maxHp) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Skill targeting banner */}
      {pendingSkill && pendingPet && (
        <div className="relative z-20 shrink-0 mx-3 mb-1 rounded-lg px-3 py-2 text-center text-[11px] tracking-wider"
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
          <div className="w-12 h-12 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
        </div>
      )}
      {phase === "countdown" && (
        <div className="flex-1 flex items-center justify-center relative z-10">
          <div className="text-6xl font-black text-white" style={{ textShadow: "0 0 40px rgba(167,139,250,0.8)" }}>
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
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(167,139,250,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(167,139,250,0.025) 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

          {/* Dividing line */}
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: "50%", height: 1, background: "linear-gradient(90deg,transparent,rgba(239,68,68,0.28),transparent)" }} />

          {/* Enemy target highlight ring during skill targeting */}
          {pendingSkill?.mode === "needs-enemy" && enemyPets.filter(p => !p.isDead).map(p => (
            <div key={`ring-${p.uid}`} className="absolute pointer-events-none rounded-full"
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)", width: 72, height: 72, border: "2px solid rgba(239,68,68,0.7)", animation: "targetPulse 0.7s ease-in-out infinite", boxShadow: "0 0 12px rgba(239,68,68,0.4)" }} />
          ))}

          {/* Swipe trail */}
          {slashTrail.length >= 2 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
              <polyline points={slashTrail.map(p => `${p.x}%,${p.y}%`).join(" ")} fill="none" stroke="#a78bfa" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.88" style={{ filter: "drop-shadow(0 0 7px #a78bfa)" }} />
            </svg>
          )}

          {/* Pets — new layout:
              ENEMY (top half):  [name]  →  [image]  →  [stars + HP bar]
              ALLY  (bottom):    [name]  →  [image]  →  [stars + HP + mana]
              The active player pet gets a thicker amber outline so the
              swiper is visually distinct from the auto-attacking pack. */}
          {pets.filter(p => !p.isDead).map(pet => {
            const isSkillReady = pet.isPlayer && pet.mana >= MAX_MANA && !!pet.specialSkill;
            const isPendingSource = pendingSkill?.petUid === pet.uid;
            const isEnemyTarget = pendingSkill?.mode === "needs-enemy" && !pet.isPlayer;
            const size = pet.isPlayer ? 112 : 96;
            const isHit = !!hitFlash[pet.uid];

            // Star rarity row: render N stars (capped at 5) for visual
            // pet tier. Falls back gracefully when starRarity is null/0.
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
                {/* Name intentionally hidden in battle — only the HP and
                    mana bars below carry the per-pet info to keep the
                    arena uncluttered. */}

                {/* Pet image with hit/dim states + active-pet outline */}
                <div
                  style={{
                    borderRadius: "50%",
                    transform: pet.isPlayer ? undefined : "scaleX(-1)",
                    animation: isSkillReady ? "skillGlow 1.2s ease-in-out infinite" : isHit ? "bHit 0.32s ease-out" : undefined,
                    outline: isPendingSource
                      ? "2px solid rgba(250,204,21,0.8)"
                      : (pet.isPlayer && pet.isActive)
                        ? "2px solid rgba(251,191,36,0.7)"
                        : undefined,
                    outlineOffset: 3,
                    position: "relative",
                  }}
                >
                  {pet.petTemplateId
                    ? <PetAnimator petTemplateId={pet.petTemplateId} mode="idle" view="front" size={size} />
                    : pet.imageUrl
                    ? <img src={pet.imageUrl} style={{ width: size, height: size, objectFit: "contain", filter: pet.isPlayer ? "drop-shadow(0 0 10px rgba(167,139,250,0.5))" : "drop-shadow(0 0 10px rgba(239,68,68,0.45))" }} />
                    : <div style={{ width: size, height: size, background: pet.isPlayer ? "rgba(100,60,200,0.3)" : "rgba(200,60,60,0.3)", borderRadius: "50%", border: `2px solid ${pet.isPlayer ? "rgba(167,139,250,0.5)" : "rgba(239,68,68,0.5)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}><img src={petPawIcon} alt="" style={{ width: size * 0.65, height: size * 0.65, objectFit: "contain" }} /></div>}
                  {/* X_X eyes overlay during a hit — tiny, plays once per
                      flash. Counter-mirrored for enemies so it stays
                      readable when the pet is flipped. */}
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

                {/* Stats stack below: stars + HP (+ mana for player) */}
                <div className="mt-1 flex flex-col items-center gap-0.5" style={{ width: 60 }}>
                  {stars > 0 && (
                    <div className="text-[7px] leading-none whitespace-nowrap" style={{ color: "#fbbf24", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                      {"★".repeat(stars)}
                    </div>
                  )}
                  <div
                    className="h-1.5 w-full bg-black/70 rounded-full overflow-hidden border border-white/10"
                    style={{
                      borderColor: pendingSkill?.mode === "needs-enemy" && !pet.isPlayer ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.10)",
                      animation: pendingSkill?.mode === "needs-enemy" && !pet.isPlayer ? "targetPulse 0.8s ease-in-out infinite" : undefined,
                    }}
                  >
                    <div className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(0, (pet.hp / pet.maxHp) * 100)}%`, background: hpColor(pet.hp / pet.maxHp) }} />
                  </div>
                  {pet.isPlayer && pet.specialSkill && (
                    <div className="h-1 w-full bg-black/50 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-200" style={{ width: `${(pet.mana / MAX_MANA) * 100}%`, background: pet.mana >= MAX_MANA ? "#c084fc" : "#4c1d95" }} />
                    </div>
                  )}
                </div>

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

                {/* Enemy target indicator */}
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

          {/* ── Potion bar ──────────────────────────────────────
              Tap a bottle to apply its effect to the active pet
              (heal/mana) or revive the first fallen ally. Bottles
              vanish from the bar as soon as they're consumed. */}
          {phase === "battle" && potionsRemaining.length > 0 && (
            <div
              className="absolute z-30 flex gap-1.5 pointer-events-auto"
              style={{ left: 8, bottom: 12 }}
              data-testid="pvp-potion-bar"
            >
              {potionsRemaining.map((invId, i) => {
                const inv = (myInventory as any[]).find((x: any) => (x.inventoryId || x.id) === invId);
                if (!inv) return null;
                const isMana = (inv.manaRestored ?? 0) > 0;
                const isRevive = (inv.petsRevived ?? 0) > 0;
                return (
                  <button
                    key={`${invId}-${i}`}
                    data-testid={`button-pvp-potion-${i}`}
                    onPointerDown={(e) => { e.stopPropagation(); consumePotion(invId); }}
                    className="w-11 h-11 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
                    style={{
                      background: isRevive
                        ? "rgba(251,191,36,0.18)"
                        : isMana
                          ? "rgba(124,58,237,0.22)"
                          : "rgba(34,197,94,0.20)",
                      border: `1px solid ${isRevive ? "rgba(251,191,36,0.55)" : isMana ? "rgba(167,139,250,0.55)" : "rgba(34,197,94,0.55)"}`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                    }}
                  >
                    {inv.imageUrl
                      ? <img src={inv.imageUrl} alt={inv.name} style={{ width: 32, height: 32, objectFit: "contain" }} />
                      : <span className="text-white text-sm font-black">{isRevive ? "R" : isMana ? "M" : "H"}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Hint (only when not in skill mode) */}
          {phase === "battle" && !pendingSkill && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/12 text-[9px] tracking-widest pointer-events-none animate-pulse whitespace-nowrap">
              Swipe enemies · Tap pet to move · Tap glowing pet to use skill
            </div>
          )}

          {/* ── Result overlay ─────────────────────────────────────
              WIN  → golden-orb burst + congrats + +N BP from server
              LOSS → softer red-toned panel + motivational note,
                     deliberately NO "you lost N points" because losses
                     don't deduct anything in PvP. */}
          {phase === "result" && resultOutcome === "win" && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6" style={{ background: "radial-gradient(ellipse at center, rgba(60,30,8,0.85) 0%, rgba(5,4,2,0.95) 80%)", animation: "bResultIn 0.5s ease-out" }}>
              {/* Golden orbs floating up behind the trophy */}
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
