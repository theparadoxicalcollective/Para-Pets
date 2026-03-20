import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trophy, Sword, Shield, Zap, Clock } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";

interface PvpOpponent {
  name: string;
  imageUrl: string | null;
  level: number;
  hp: number;
  atk: number;
  def: number;
  specialSkill: string | null;
}

interface ActivePet {
  inventoryId: string;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  petTemplateId: string | null;
  imageUrl: string | null;
  specialSkill: string | null;
}

interface EnemyPos { x: number; y: number; vx: number; vy: number; }
interface SparkParticle { id: number; x: number; y: number; dx: number; dy: number; color: string; }
interface FloatingNum { id: number; x: number; y: number; value: number; isHeal?: boolean; isCrit?: boolean; }

type Phase = "loading" | "matchmaking" | "countdown" | "battle" | "victory" | "defeat";

const ACCENT = "#a78bfa";
const MAX_MANA = 100;
const AI_ATTACK_INTERVAL = 4800;

function hpColor(hp: number, max: number) {
  const pct = hp / max;
  if (pct > 0.5) return "#4ade80";
  if (pct > 0.25) return "#facc15";
  return "#f87171";
}

function skillEmoji(skill: string | null) {
  if (!skill) return "✨";
  if (skill === "Lazer") return "⚡";
  if (skill === "Bubble") return "🫧";
  if (skill === "Heal Self" || skill === "Heal Party") return "💚";
  if (skill === "Poison") return "☠️";
  return "✨";
}

export default function PvpArenaPage({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Core state ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("loading");
  const [playerPet, setPlayerPet] = useState<ActivePet | null>(null);
  const [opponent, setOpponent] = useState<PvpOpponent | null>(null);
  const [countdown, setCountdown] = useState(3);

  // HP
  const [playerHp, setPlayerHp] = useState(0);
  const [opponentHp, setOpponentHp] = useState(0);
  const playerHpRef = useRef(0);
  const opponentHpRef = useRef(0);
  const playerMaxHp = useRef(0);
  const opponentMaxHp = useRef(0);

  // Mana
  const [playerMana, setPlayerMana] = useState(0);
  const playerManaRef = useRef(0);
  const [opponentMana, setOpponentMana] = useState(0);
  const opponentManaRef = useRef(0);
  const [skillCooldown, setSkillCooldown] = useState(false);
  const [poisonActive, setPoisonActive] = useState(false);
  const poisonTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Opponent position (moves around arena)
  const [oppPos, setOppPos] = useState<EnemyPos>({ x: 50, y: 22, vx: 0.7, vy: 0.4 });
  const oppPosRef = useRef<EnemyPos>({ x: 50, y: 22, vx: 0.7, vy: 0.4 });
  const animFrameRef = useRef<number>(0);
  const battleActiveRef = useRef(false);

  // Player pet position (draggable)
  const [petPos, setPetPos] = useState({ x: 50, y: 76 });
  const petPosRef = useRef({ x: 50, y: 76 });
  const petDraggingRef = useRef(false);
  const petFrozenRef = useRef(false);

  // Swipe
  const arenaRef = useRef<HTMLDivElement>(null);
  const isSlashingRef = useRef(false);
  const swipePathRef = useRef<{x: number; y: number}[]>([]);
  const hitRegisteredRef = useRef(false);
  const lastAiAttackRef = useRef(0);
  const idRef = useRef(0);

  // Visuals
  const [slashTrail, setSlashTrail] = useState<{x: number; y: number}[]>([]);
  const [sparks, setSparks] = useState<SparkParticle[]>([]);
  const [petHitSparks, setPetHitSparks] = useState<SparkParticle[]>([]);
  const [floatNums, setFloatNums] = useState<FloatingNum[]>([]);
  const [playerHit, setPlayerHit] = useState(false);
  const [oppHit, setOppHit] = useState(false);
  const [skillEffect, setSkillEffect] = useState<string | null>(null);
  const [comboCount, setComboCount] = useState(0);
  const lastHitTimeRef = useRef(0);

  // Stats refs
  const playerAtkRef = useRef(50);
  const playerDefRef = useRef(50);
  const oppAtkRef = useRef(40);
  const oppDefRef = useRef(30);

  // Result mutation
  const resultMutation = useMutation({
    mutationFn: async (data: { opponentName: string; opponentImageUrl: string | null; opponentLevel: number; opponentSkill: string | null; result: "win" | "loss" }) => {
      const res = await apiRequest("POST", "/api/pvp/result", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.coinsEarned > 0) {
        toast({ title: `+${data.coinsEarned} coins earned!`, description: "PvP victory reward" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  // ── Load data ─────────────────────────────────────────────────────────
  const { data: meData } = useQuery<any>({ queryKey: ["/api/auth/me"] });

  useEffect(() => {
    if (!meData) return;
    const fetchOpponent = async () => {
      try {
        const res = await apiRequest("GET", "/api/pvp/opponent");
        const opp: PvpOpponent = await res.json();
        setOpponent(opp);

        // Build player pet from meData
        const pet: ActivePet = {
          inventoryId: "pvp-player",
          name: meData.activePet?.name || meData.activePet?.petNickname || "Your Pet",
          level: meData.activePet?.petLevel || 1,
          hp: meData.activePet?.petHealth || 1000,
          atk: meData.activePet?.petAtk || 50,
          def: meData.activePet?.petDef || 50,
          petTemplateId: meData.activePet?.petTemplateId || null,
          imageUrl: meData.activePet?.imageUrl || null,
          specialSkill: meData.activePet?.specialSkill || null,
        };
        setPlayerPet(pet);
        setPhase("matchmaking");
      } catch {
        toast({ title: "Could not find an opponent", variant: "destructive" });
      }
    };
    if (phase === "loading") fetchOpponent();
  }, [meData, phase]);

  // ── Countdown → Battle ────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "matchmaking" && playerPet && opponent) {
      // Short delay then countdown
      const t = setTimeout(() => setPhase("countdown"), 600);
      return () => clearTimeout(t);
    }
  }, [phase, playerPet, opponent]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      initBattle();
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  const initBattle = useCallback(() => {
    if (!playerPet || !opponent) return;
    playerHpRef.current = playerPet.hp;
    opponentHpRef.current = opponent.hp;
    playerMaxHp.current = playerPet.hp;
    opponentMaxHp.current = opponent.hp;
    setPlayerHp(playerPet.hp);
    setOpponentHp(opponent.hp);
    playerManaRef.current = 0;
    opponentManaRef.current = 0;
    setPlayerMana(0);
    setOpponentMana(0);
    playerAtkRef.current = playerPet.atk;
    playerDefRef.current = playerPet.def;
    oppAtkRef.current = opponent.atk;
    oppDefRef.current = opponent.def;
    const initPet = { x: 50, y: 76 };
    petPosRef.current = initPet;
    setPetPos(initPet);
    petFrozenRef.current = false;
    battleActiveRef.current = true;
    lastAiAttackRef.current = Date.now() + 2000;
    const basePos = { x: 50, y: 22, vx: 0.8, vy: 0.5 };
    oppPosRef.current = basePos;
    setOppPos(basePos);
    setPhase("battle");
  }, [playerPet, opponent]);

  // ── Arena animation loop ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "battle") return;

    const animate = () => {
      if (!battleActiveRef.current) return;
      const pos = { ...oppPosRef.current };
      pos.x += pos.vx;
      pos.y += pos.vy;

      // Bounce off walls
      if (pos.x < 8 || pos.x > 92) { pos.vx *= -1; pos.x = Math.max(8, Math.min(92, pos.x)); }
      if (pos.y < 5 || pos.y > 55) { pos.vy *= -1; pos.y = Math.max(5, Math.min(55, pos.y)); }
      pos.vx += (Math.random() - 0.5) * 0.15;
      pos.vy += (Math.random() - 0.5) * 0.15;

      // Clamp speed
      const spd = Math.hypot(pos.vx, pos.vy);
      const maxSpd = 1.2;
      if (spd > maxSpd) { pos.vx = (pos.vx / spd) * maxSpd; pos.vy = (pos.vy / spd) * maxSpd; }

      oppPosRef.current = pos;
      setOppPos({ ...pos });

      // ── Collision: opponent reaches pet ──
      const petDist = Math.hypot(pos.x - petPosRef.current.x, pos.y - petPosRef.current.y);
      if (petDist < 15 && !petFrozenRef.current) {
        const rawDmg = oppAtkRef.current - Math.floor(playerDefRef.current * 0.15);
        const dmg = Math.max(1, rawDmg + Math.floor(Math.random() * 6) - 3);
        playerHpRef.current = Math.max(0, playerHpRef.current - dmg);
        setPlayerHp(playerHpRef.current);
        setPlayerHit(true);
        setTimeout(() => setPlayerHit(false), 300);

        // Burst sparks on player pet
        const pColors = ["#c084fc", "#818cf8", "#f472b6"];
        const ps: SparkParticle[] = Array.from({ length: 6 }, (_, i) => {
          const angle = (i / 6) * Math.PI * 2;
          return { id: idRef.current++, x: petPosRef.current.x, y: petPosRef.current.y, dx: Math.cos(angle) * (1.5 + Math.random() * 2), dy: Math.sin(angle) * (1.5 + Math.random() * 2), color: pColors[i % pColors.length] };
        });
        setPetHitSparks(prev => [...prev, ...ps]);
        const pids = new Set(ps.map(p => p.id));
        setTimeout(() => setPetHitSparks(prev => prev.filter(p => !pids.has(p.id))), 480);

        const fn: FloatingNum = { id: idRef.current++, x: petPosRef.current.x, y: petPosRef.current.y - 10, value: dmg };
        setFloatNums(prev => [...prev, fn]);
        setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), 900);

        // Bounce opponent back
        oppPosRef.current = { ...pos, vy: -Math.abs(pos.vy) * 0.8, vx: pos.vx * 0.6 };

        // AI mana gain on hit
        opponentManaRef.current = Math.min(MAX_MANA, opponentManaRef.current + 20);
        setOpponentMana(opponentManaRef.current);

        if (playerHpRef.current <= 0) {
          battleActiveRef.current = false;
          endBattle("loss");
          return;
        }
      }

      // ── AI special skill auto-use ──
      if (opponentManaRef.current >= MAX_MANA && opponent?.specialSkill) {
        opponentManaRef.current = 0;
        setOpponentMana(0);
        aiUseSkill(opponent.specialSkill);
      }

      // ── AI lunge attack (periodic) ──
      const now = Date.now();
      if (now - lastAiAttackRef.current > AI_ATTACK_INTERVAL) {
        lastAiAttackRef.current = now;
        const dx = petPosRef.current.x - pos.x;
        const dy = petPosRef.current.y - pos.y;
        const dist = Math.hypot(dx, dy) || 1;
        const lungeSpeed = 1.2 + Math.random() * 0.4;
        oppPosRef.current = { ...oppPosRef.current, vx: (dx / dist) * lungeSpeed, vy: (dy / dist) * lungeSpeed };
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, opponent]);

  // ── AI special skill handler ──────────────────────────────────────────
  const aiUseSkill = useCallback((skill: string) => {
    if (!battleActiveRef.current) return;
    if (skill === "Lazer" || skill === "Bubble") {
      const baseDmg = Math.floor(oppAtkRef.current * (skill === "Lazer" ? 1.8 : 0.7));
      const ticks = skill === "Bubble" ? 2 : 1;
      for (let i = 0; i < ticks; i++) {
        setTimeout(() => {
          if (!battleActiveRef.current) return;
          const dmg = Math.max(1, baseDmg + Math.floor(Math.random() * 8) - 4);
          playerHpRef.current = Math.max(0, playerHpRef.current - dmg);
          setPlayerHp(playerHpRef.current);
          setPlayerHit(true);
          setTimeout(() => setPlayerHit(false), 250);
          const fn: FloatingNum = { id: idRef.current++, x: petPosRef.current.x, y: petPosRef.current.y - 12, value: dmg };
          setFloatNums(prev => [...prev, fn]);
          setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), 900);
          if (playerHpRef.current <= 0) { battleActiveRef.current = false; endBattle("loss"); }
        }, i * 300);
      }
    } else if (skill === "Heal Self") {
      const healAmt = Math.floor(opponentMaxHp.current * 0.2);
      opponentHpRef.current = Math.min(opponentMaxHp.current, opponentHpRef.current + healAmt);
      setOpponentHp(opponentHpRef.current);
      const fn: FloatingNum = { id: idRef.current++, x: oppPosRef.current.x, y: oppPosRef.current.y - 12, value: healAmt, isHeal: true };
      setFloatNums(prev => [...prev, fn]);
      setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), 1000);
    } else if (skill === "Poison") {
      let ticks = 0;
      const tickDmg = Math.floor(oppAtkRef.current * 0.15);
      const t = setInterval(() => {
        if (!battleActiveRef.current) { clearInterval(t); return; }
        ticks++;
        playerHpRef.current = Math.max(0, playerHpRef.current - tickDmg);
        setPlayerHp(playerHpRef.current);
        if (ticks >= 5 || playerHpRef.current <= 0) {
          clearInterval(t);
          if (playerHpRef.current <= 0) { battleActiveRef.current = false; endBattle("loss"); }
        }
      }, 900);
    }
  }, []);

  // ── End battle ────────────────────────────────────────────────────────
  const endBattle = useCallback((result: "win" | "loss") => {
    if (!opponent) return;
    battleActiveRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
    if (poisonTimerRef.current) { clearInterval(poisonTimerRef.current); poisonTimerRef.current = null; }
    setPhase(result === "win" ? "victory" : "defeat");
    resultMutation.mutate({
      opponentName: opponent.name,
      opponentImageUrl: opponent.imageUrl,
      opponentLevel: opponent.level,
      opponentSkill: opponent.specialSkill,
      result,
    });
  }, [opponent, resultMutation]);

  // ── Player swipe attack ───────────────────────────────────────────────
  const getArenaPos = useCallback((cx: number, cy: number) => {
    if (!arenaRef.current) return { x: 50, y: 50 };
    const rect = arenaRef.current.getBoundingClientRect();
    return {
      x: ((cx - rect.left) / rect.width) * 100,
      y: ((cy - rect.top) / rect.height) * 100,
    };
  }, []);

  const handleSlashStart = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current || petDraggingRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pos = getArenaPos(e.clientX, e.clientY);
    swipePathRef.current = [pos];
    isSlashingRef.current = true;
    hitRegisteredRef.current = false;
    setSlashTrail([pos]);
  }, [getArenaPos]);

  const handleSlashMove = useCallback((e: React.PointerEvent) => {
    if (!isSlashingRef.current || petDraggingRef.current) return;
    const pos = getArenaPos(e.clientX, e.clientY);
    const prev = swipePathRef.current[swipePathRef.current.length - 1];
    swipePathRef.current.push(pos);
    if (swipePathRef.current.length > 18) swipePathRef.current.shift();
    setSlashTrail([...swipePathRef.current]);

    if (!battleActiveRef.current || !prev) return;

    // Check if swipe intersects opponent
    const opp = oppPosRef.current;
    const ax = prev.x, ay = prev.y, bx = pos.x, by = pos.y;
    const cx = opp.x, cy = opp.y;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / (len * len)));
    const dist = Math.hypot(ax + t * dx - cx, ay + t * dy - cy);

    const pathLen = swipePathRef.current.reduce((acc, p, i) => {
      if (i === 0) return 0;
      const pp = swipePathRef.current[i - 1];
      return acc + Math.hypot(p.x - pp.x, p.y - pp.y);
    }, 0);
    if (pathLen < 5 || dist >= 18 || hitRegisteredRef.current) return;
    hitRegisteredRef.current = true;

    const now = Date.now();
    const combo = (now - lastHitTimeRef.current < 1400) ? comboCount + 1 : 1;
    setComboCount(combo);
    lastHitTimeRef.current = now;
    const comboMult = 1 + Math.min(combo * 0.1, 0.5);
    const isCrit = Math.random() < 0.15;
    const rawDmg = playerAtkRef.current - Math.floor(oppDefRef.current * 0.3);
    const dmg = Math.max(1, Math.floor((rawDmg + Math.floor(Math.random() * 8) - 4) * comboMult * (isCrit ? 1.8 : 1)));

    opponentHpRef.current = Math.max(0, opponentHpRef.current - dmg);
    setOpponentHp(opponentHpRef.current);
    setOppHit(true);
    setTimeout(() => setOppHit(false), 180);

    // Mana gain on hit
    const manaGain = isCrit ? 22 : (combo >= 3 ? 18 : 13);
    playerManaRef.current = Math.min(MAX_MANA, playerManaRef.current + manaGain);
    setPlayerMana(playerManaRef.current);

    // Sparks
    const sparkColors = isCrit ? ["#fbbf24", "#f59e0b", "#fde68a"] : [ACCENT, "#c4b5fd", "#ddd6fe"];
    const newSparks: SparkParticle[] = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      return { id: idRef.current++, x: opp.x, y: opp.y, dx: Math.cos(angle) * (2 + Math.random() * 2), dy: Math.sin(angle) * (2 + Math.random() * 2), color: sparkColors[i % sparkColors.length] };
    });
    setSparks(prev => [...prev, ...newSparks]);
    const sids = new Set(newSparks.map(s => s.id));
    setTimeout(() => setSparks(prev => prev.filter(s => !sids.has(s.id))), 440);

    // Knockback
    const sdx = bx - ax, sdy = by - ay;
    const sl = Math.hypot(sdx, sdy) || 1;
    oppPosRef.current = { ...opp, vx: (sdx / sl) * 2.5, vy: (sdy / sl) * 2.5 };

    const fn: FloatingNum = { id: idRef.current++, x: opp.x, y: opp.y - 8, value: dmg, isCrit };
    setFloatNums(prev => [...prev, fn]);
    setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), isCrit ? 1400 : 900);

    if (opponentHpRef.current <= 0) endBattle("win");
  }, [comboCount, getArenaPos, endBattle]);

  const handleSlashEnd = useCallback(() => {
    isSlashingRef.current = false;
    hitRegisteredRef.current = false;
    setTimeout(() => setSlashTrail([]), 200);
  }, []);

  // ── Pet drag ────────────────────────────────────────────────────────────
  const handlePetDown = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current || petFrozenRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    petDraggingRef.current = true;
  }, []);

  const handlePetMove = useCallback((e: React.PointerEvent) => {
    if (!petDraggingRef.current || !arenaRef.current) return;
    e.stopPropagation();
    const rect = arenaRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(52, Math.min(92, ((e.clientY - rect.top) / rect.height) * 100));
    petPosRef.current = { x, y };
    setPetPos({ x, y });
  }, []);

  const handlePetUp = useCallback((e: React.PointerEvent) => {
    if (!petDraggingRef.current) return;
    e.stopPropagation();
    petDraggingRef.current = false;
  }, []);

  // ── Player special skill ────────────────────────────────────────────────
  const usePlayerSkill = useCallback(() => {
    if (!battleActiveRef.current || playerManaRef.current < MAX_MANA || skillCooldown || !playerPet?.specialSkill) return;
    const skill = playerPet.specialSkill;
    playerManaRef.current = 0;
    setPlayerMana(0);
    setSkillCooldown(true);
    setSkillEffect(skill);
    setTimeout(() => setSkillEffect(null), 1200);
    setTimeout(() => setSkillCooldown(false), 3000);

    if (skill === "Lazer") {
      const dmg = Math.floor(playerAtkRef.current * 2.5);
      opponentHpRef.current = Math.max(0, opponentHpRef.current - dmg);
      setOpponentHp(opponentHpRef.current);
      setOppHit(true);
      setTimeout(() => setOppHit(false), 400);
      const fn: FloatingNum = { id: idRef.current++, x: oppPosRef.current.x, y: oppPosRef.current.y - 12, value: dmg, isCrit: true };
      setFloatNums(prev => [...prev, fn]);
      setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), 1400);
      if (opponentHpRef.current <= 0) endBattle("win");

    } else if (skill === "Bubble") {
      [0, 1, 2].forEach((i) => {
        setTimeout(() => {
          if (!battleActiveRef.current) return;
          const dmg = Math.floor(playerAtkRef.current * 0.9 + Math.random() * 10);
          opponentHpRef.current = Math.max(0, opponentHpRef.current - dmg);
          setOpponentHp(opponentHpRef.current);
          setOppHit(true);
          setTimeout(() => setOppHit(false), 180);
          const fn: FloatingNum = { id: idRef.current++, x: oppPosRef.current.x, y: oppPosRef.current.y - 10, value: dmg };
          setFloatNums(prev => [...prev, fn]);
          setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), 900);
          if (opponentHpRef.current <= 0) endBattle("win");
        }, i * 350);
      });

    } else if (skill === "Heal Self" || skill === "Heal Party") {
      const healAmt = Math.floor(playerMaxHp.current * 0.3);
      playerHpRef.current = Math.min(playerMaxHp.current, playerHpRef.current + healAmt);
      setPlayerHp(playerHpRef.current);
      const fn: FloatingNum = { id: idRef.current++, x: petPosRef.current.x, y: petPosRef.current.y - 14, value: healAmt, isHeal: true };
      setFloatNums(prev => [...prev, fn]);
      setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), 1200);

    } else if (skill === "Poison") {
      if (poisonActive) return;
      setPoisonActive(true);
      let ticks = 0;
      const tickDmg = Math.floor(playerAtkRef.current * 0.18);
      const t = setInterval(() => {
        if (!battleActiveRef.current) { clearInterval(t); setPoisonActive(false); return; }
        ticks++;
        opponentHpRef.current = Math.max(0, opponentHpRef.current - tickDmg);
        setOpponentHp(opponentHpRef.current);
        const fn: FloatingNum = { id: idRef.current++, x: oppPosRef.current.x, y: oppPosRef.current.y - 10, value: tickDmg };
        setFloatNums(prev => [...prev, fn]);
        setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), 900);
        if (ticks >= 6 || opponentHpRef.current <= 0) {
          clearInterval(t);
          setPoisonActive(false);
          poisonTimerRef.current = null;
          if (opponentHpRef.current <= 0) endBattle("win");
        }
      }, 900);
      poisonTimerRef.current = t;
    }
  }, [playerPet?.specialSkill, skillCooldown, poisonActive, endBattle]);

  // ── History & Leaderboard ─────────────────────────────────────────────
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const { data: history } = useQuery<any[]>({ queryKey: ["/api/pvp/history"], enabled: phase === "victory" || phase === "defeat" });
  const { data: leaderboard } = useQuery<any[]>({ queryKey: ["/api/pvp/leaderboard"], enabled: showLeaderboard });

  // ── Render ─────────────────────────────────────────────────────────────
  const pHpPct = Math.max(0, (playerHp / (playerMaxHp.current || 1)) * 100);
  const oHpPct = Math.max(0, (opponentHp / (opponentMaxHp.current || 1)) * 100);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#05080f", fontFamily: "Cinzel, serif" }}>
      <style>{`
        @keyframes pvpHitFlash { 0%{filter:brightness(1)} 30%{filter:brightness(2.8) saturate(0)} 100%{filter:brightness(1)} }
        @keyframes pvpSpark { to { transform: translate(calc(var(--dx)*14px), calc(var(--dy)*14px)); opacity: 0; } }
        @keyframes pvpFloat { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-38px)} }
        @keyframes pvpCombo { 0%{transform:scale(0.6);opacity:0} 60%{transform:scale(1.2)} 100%{transform:scale(1);opacity:1} }
        @keyframes pvpIdle { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-5px)} }
        @keyframes pvpHealBurst { 0%{transform:translate(-50%,-50%) scale(0.3);opacity:1} 100%{transform:translate(-50%,-50%) scale(2);opacity:0} }
        @keyframes pvpPoisonPulse { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.5} 50%{transform:translate(-50%,-50%) scale(1.3);opacity:1} }
        @keyframes pvpSlash { 0%{opacity:0.9} 100%{opacity:0} }
        @keyframes pvpResultIn { 0%{transform:scale(0.8) translateY(20px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-safe pt-3 pb-2 z-10 shrink-0" style={{ background: "rgba(5,8,15,0.95)", borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
        <button onClick={onClose} className="flex items-center gap-1.5 text-white/60 hover:text-white/90 transition-colors">
          <ArrowLeft size={18} />
          <span className="text-xs tracking-widest">EXIT</span>
        </button>
        <div className="text-sm tracking-[0.2em] text-purple-300 font-bold">⚔ PvP ARENA ⚔</div>
        <button onClick={() => setShowLeaderboard(l => !l)} className="text-white/50 hover:text-yellow-400 transition-colors">
          <Trophy size={18} />
        </button>
      </div>

      {/* ── Leaderboard overlay ─────────────────────────────────────────── */}
      {showLeaderboard && (
        <div className="absolute inset-0 z-60 flex flex-col" style={{ background: "rgba(5,8,15,0.97)", paddingTop: 60 }}>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-yellow-400 text-sm tracking-widest">🏆 LEADERBOARD</span>
            <button onClick={() => setShowLeaderboard(false)} className="text-white/40 hover:text-white/80 text-xs">CLOSE</button>
          </div>
          <div className="overflow-y-auto flex-1 px-4 pb-8">
            {!leaderboard ? (
              <div className="text-center text-white/30 text-xs mt-8">Loading...</div>
            ) : leaderboard.length === 0 ? (
              <div className="text-center text-white/30 text-xs mt-8">No battles recorded yet</div>
            ) : leaderboard.map((row, i) => (
              <div key={row.userId} className="flex items-center gap-3 py-2.5 border-b border-white/5">
                <span className="text-white/40 text-xs w-5 text-center">{i + 1}</span>
                <span className="flex-1 text-white/80 text-sm truncate">{row.username}</span>
                <span className="text-green-400 text-xs">{row.wins}W</span>
                <span className="text-red-400 text-xs">{row.losses}L</span>
                <span className="text-yellow-400 text-xs">{row.coins}✦</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Loading / Matchmaking ────────────────────────────────────────── */}
      {(phase === "loading" || phase === "matchmaking") && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="w-14 h-14 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
          <div className="text-white/40 text-xs tracking-widest">FINDING OPPONENT...</div>
        </div>
      )}

      {/* ── Countdown ────────────────────────────────────────────────────── */}
      {phase === "countdown" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div className="flex gap-12 items-end">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-purple-900/40 border border-purple-400/30 flex items-center justify-center mb-2" style={{ animation: "pvpIdle 1.5s ease-in-out infinite" }}>
                {playerPet?.petTemplateId
                  ? <PetAnimator petTemplateId={playerPet.petTemplateId} mode="idle" view="front" size={72} />
                  : playerPet?.imageUrl
                  ? <img src={playerPet.imageUrl} className="w-16 h-16 object-contain" />
                  : <span className="text-3xl">🐾</span>}
              </div>
              <div className="text-purple-300 text-[10px] tracking-widest">{playerPet?.name}</div>
              <div className="text-white/30 text-[9px]">Lv.{playerPet?.level}</div>
            </div>
            <div className="text-4xl font-black text-red-500 mb-6" style={{ animation: "pvpCombo 0.5s ease-out" }}>VS</div>
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-red-900/40 border border-red-500/30 flex items-center justify-center mb-2" style={{ animation: "pvpIdle 1.5s ease-in-out infinite 0.5s" }}>
                {opponent?.imageUrl
                  ? <img src={opponent.imageUrl} className="w-16 h-16 object-contain" />
                  : <span className="text-3xl">👾</span>}
              </div>
              <div className="text-red-300 text-[10px] tracking-widest">{opponent?.name}</div>
              <div className="text-white/30 text-[9px]">Lv.{opponent?.level}</div>
            </div>
          </div>
          <div className="text-6xl font-black text-white" style={{ animation: "pvpCombo 0.4s ease-out", textShadow: "0 0 40px rgba(167,139,250,0.8)" }}>
            {countdown > 0 ? countdown : "FIGHT!"}
          </div>
        </div>
      )}

      {/* ── Battle ────────────────────────────────────────────────────────── */}
      {(phase === "battle") && playerPet && opponent && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Opponent HP bar */}
          <div className="px-4 pt-3 pb-2 shrink-0" style={{ background: "rgba(10,5,20,0.8)" }}>
            <div className="flex items-center gap-2 mb-1">
              {opponent.imageUrl
                ? <img src={opponent.imageUrl} className="w-8 h-8 object-contain rounded-full border border-red-500/40" />
                : <div className="w-8 h-8 rounded-full bg-red-900/60 border border-red-500/40 flex items-center justify-center text-sm">👾</div>}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-red-300 text-[11px] tracking-wider font-bold">{opponent.name}</span>
                  <span className="text-white/30 text-[9px]">Lv.{opponent.level}</span>
                </div>
                <div className="h-2.5 bg-black/60 rounded-full overflow-hidden border border-red-900/60">
                  <div className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${oHpPct}%`, background: `linear-gradient(90deg, ${hpColor(opponentHp, opponentMaxHp.current)}, ${hpColor(opponentHp, opponentMaxHp.current)}aa)`, boxShadow: `0 0 6px ${hpColor(opponentHp, opponentMaxHp.current)}80` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-white/30">{opponentHp} / {opponentMaxHp.current}</span>
                  {opponent.specialSkill && (
                    <div className="flex items-center gap-1">
                      <div className="h-1.5 w-16 bg-black/40 rounded-full overflow-hidden border border-red-900/30">
                        <div className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${(opponentMana / MAX_MANA) * 100}%`, background: "linear-gradient(90deg, #7f1d1d, #ef4444)" }} />
                      </div>
                      <span className="text-[7px]">{skillEmoji(opponent.specialSkill)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Arena */}
          <div
            ref={arenaRef}
            className="flex-1 relative overflow-hidden select-none"
            style={{ background: "radial-gradient(ellipse at 50% 30%, #0d0620 0%, #05080f 70%)", touchAction: "none", cursor: "crosshair" }}
            onPointerDown={handleSlashStart}
            onPointerMove={handleSlashMove}
            onPointerUp={handleSlashEnd}
            onPointerCancel={handleSlashEnd}
          >
            {/* Arena grid lines */}
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(167,139,250,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.04) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

            {/* Swipe trail */}
            {slashTrail.length >= 2 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
                <polyline
                  points={slashTrail.map(p => `${p.x}%,${p.y}%`).join(" ")}
                  fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  opacity="0.8" style={{ filter: `drop-shadow(0 0 6px ${ACCENT})` }}
                />
              </svg>
            )}

            {/* Opponent */}
            <div className="absolute z-10 pointer-events-none"
              style={{
                left: `${oppPos.x}%`, top: `${oppPos.y}%`,
                transform: `translate(-50%, -50%) scaleX(-1)`,
                animation: oppHit ? "pvpHitFlash 0.2s" : "pvpIdle 0.8s ease-in-out infinite",
              }}>
              {opponent.imageUrl
                ? <img src={opponent.imageUrl} style={{ width: 76, height: 76, objectFit: "contain", filter: "drop-shadow(0 0 14px rgba(239,68,68,0.6))" }} />
                : <div className="w-16 h-16 bg-red-900/40 rounded-full border-2 border-red-500 flex items-center justify-center"><span className="text-3xl">👾</span></div>}
            </div>

            {/* Poison ring on opponent */}
            {poisonActive && (
              <div className="absolute pointer-events-none z-11" style={{ left: `${oppPos.x}%`, top: `${oppPos.y}%`, transform: "translate(-50%,-50%)", width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 70%)", boxShadow: "0 0 24px rgba(34,197,94,0.4)", animation: "pvpPoisonPulse 0.9s ease-in-out infinite" }} />
            )}

            {/* Skill effect visuals */}
            {skillEffect === "Lazer" && oppPos.y < petPos.y && (
              <div className="absolute pointer-events-none z-36" style={{ left: `${petPos.x}%`, top: `${oppPos.y}%`, transform: "translateX(-50%)", width: 6, height: `${petPos.y - oppPos.y}%`, background: "linear-gradient(0deg, rgba(250,204,21,0.9), rgba(253,224,71,0.2))", boxShadow: "0 0 16px rgba(250,204,21,0.9), 0 0 6px white", borderRadius: 4 }} />
            )}
            {skillEffect === "Heal Self" || skillEffect === "Heal Party" ? (
              <div className="absolute pointer-events-none z-36" style={{ left: `${petPos.x}%`, top: `${petPos.y}%`, transform: "translate(-50%,-50%)", width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,197,94,0.5) 0%, transparent 65%)", animation: "pvpHealBurst 0.9s ease-out forwards" }} />
            ) : null}

            {/* Player pet — draggable */}
            <div
              className="absolute z-10"
              style={{
                left: `${petPos.x}%`, top: `${petPos.y}%`,
                transform: "translate(-50%, -50%)",
                animation: playerHit ? undefined : "pvpIdle 1.2s ease-in-out infinite",
                filter: playerHit ? "drop-shadow(0 0 14px rgba(239,68,68,0.9))" : undefined,
                touchAction: "none", userSelect: "none", cursor: "grab",
              }}
              onPointerDown={handlePetDown}
              onPointerMove={handlePetMove}
              onPointerUp={handlePetUp}
              onPointerCancel={handlePetUp}
            >
              {playerPet.petTemplateId
                ? <PetAnimator petTemplateId={playerPet.petTemplateId} mode="idle" view="front" size={130} />
                : playerPet.imageUrl
                ? <img src={playerPet.imageUrl} style={{ width: 130, height: 130, objectFit: "contain", filter: "drop-shadow(0 0 14px rgba(167,139,250,0.5))" }} />
                : <span className="text-5xl">🐾</span>}
            </div>

            {/* Hit sparks (on opponent) */}
            {sparks.map(s => (
              <div key={s.id} className="absolute pointer-events-none rounded-full z-35"
                style={{ left: `${s.x}%`, top: `${s.y}%`, width: 6, height: 6, marginLeft: -3, marginTop: -3, background: s.color, boxShadow: `0 0 8px ${s.color}`, animation: "pvpSpark 0.44s ease-out forwards", ["--dx" as any]: s.dx, ["--dy" as any]: s.dy }} />
            ))}
            {/* Hit sparks (on pet) */}
            {petHitSparks.map(s => (
              <div key={s.id} className="absolute pointer-events-none rounded-full z-35"
                style={{ left: `${s.x}%`, top: `${s.y}%`, width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, background: s.color, boxShadow: `0 0 10px ${s.color}`, animation: "pvpSpark 0.48s ease-out forwards", ["--dx" as any]: s.dx, ["--dy" as any]: s.dy }} />
            ))}

            {/* Floating damage numbers */}
            {floatNums.map(fn => (
              <div key={fn.id} className="absolute pointer-events-none z-40 font-black select-none"
                style={{
                  left: `${fn.x}%`, top: `${fn.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontSize: fn.isCrit ? 26 : fn.isHeal ? 22 : 18,
                  color: fn.isHeal ? "#4ade80" : fn.isCrit ? "#fbbf24" : "#f87171",
                  textShadow: fn.isHeal ? "0 0 12px #22c55e" : fn.isCrit ? "0 0 12px #f59e0b" : "0 0 8px rgba(239,68,68,0.8)",
                  animation: "pvpFloat 0.9s ease-out forwards",
                  fontFamily: "Cinzel, serif",
                }}>
                {fn.isHeal ? "+" : ""}{fn.value}{fn.isCrit ? "!" : ""}
              </div>
            ))}

            {/* Combo counter */}
            {comboCount > 1 && (
              <div className="absolute top-4 right-4 z-40 text-yellow-400 font-black text-lg pointer-events-none" style={{ animation: "pvpCombo 0.3s ease-out", textShadow: "0 0 12px rgba(250,204,21,0.8)", fontFamily: "Cinzel, serif" }}>
                {comboCount}x COMBO!
              </div>
            )}

            {/* Swipe hint */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none text-white/20 text-[10px] tracking-widest text-center whitespace-nowrap animate-pulse">
              Slash foe · Drag pet to dodge
            </div>
          </div>

          {/* Player HUD */}
          <div className="px-4 pt-2 pb-3 shrink-0" style={{ background: "rgba(10,5,20,0.9)", borderTop: "1px solid rgba(167,139,250,0.1)" }}>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-purple-300 text-xs font-bold tracking-wider truncate">{playerPet.name}</span>
                  <span className="text-white/30 text-[9px]">Lv.{playerPet.level}</span>
                </div>
                <div className="h-3 bg-black/60 rounded-full overflow-hidden border border-purple-900/40">
                  <div className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${pHpPct}%`, background: `linear-gradient(90deg, ${hpColor(playerHp, playerMaxHp.current)}, ${hpColor(playerHp, playerMaxHp.current)}aa)`, boxShadow: `0 0 8px ${hpColor(playerHp, playerMaxHp.current)}80` }} />
                </div>
                <div className="text-[9px] text-white/30 mt-0.5">{playerHp} / {playerMaxHp.current}</div>

                {/* Mana bar */}
                {playerPet.specialSkill && (
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] tracking-widest" style={{ color: "#a78bfa" }}>MANA</span>
                      <span className="text-[8px] text-white/30">{playerMana}/{MAX_MANA}</span>
                    </div>
                    <div className="h-2 bg-black/60 rounded-full overflow-hidden border border-purple-900/40">
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${(playerMana / MAX_MANA) * 100}%`,
                          background: playerMana >= MAX_MANA
                            ? "linear-gradient(90deg, #7c3aed, #a78bfa, #c4b5fd)"
                            : "linear-gradient(90deg, #4c1d95, #7c3aed)",
                          boxShadow: playerMana >= MAX_MANA ? "0 0 10px rgba(167,139,250,0.8)" : undefined,
                        }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Skill button */}
              {playerPet.specialSkill && (
                <button
                  data-testid="button-pvp-skill"
                  onClick={usePlayerSkill}
                  disabled={playerMana < MAX_MANA || skillCooldown}
                  className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl border transition-all"
                  style={{
                    width: 54, height: 54,
                    background: playerMana >= MAX_MANA && !skillCooldown ? "linear-gradient(135deg, #4c1d95, #7c3aed)" : "rgba(0,0,0,0.5)",
                    borderColor: playerMana >= MAX_MANA && !skillCooldown ? "#a78bfa" : "rgba(255,255,255,0.1)",
                    boxShadow: playerMana >= MAX_MANA && !skillCooldown ? "0 0 18px rgba(167,139,250,0.7)" : undefined,
                    opacity: skillCooldown ? 0.5 : 1,
                    cursor: playerMana >= MAX_MANA && !skillCooldown ? "pointer" : "not-allowed",
                  }}>
                  <span style={{ fontSize: 20 }}>{skillEmoji(playerPet.specialSkill)}</span>
                  <span className="text-[7px] tracking-wider mt-0.5" style={{ color: playerMana >= MAX_MANA && !skillCooldown ? "#e9d5ff" : "#6b7280" }}>
                    {skillCooldown ? "CD" : playerMana >= MAX_MANA ? "READY!" : playerPet.specialSkill.split(" ")[0].slice(0, 5).toUpperCase()}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Victory / Defeat ─────────────────────────────────────────────── */}
      {(phase === "victory" || phase === "defeat") && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6" style={{ animation: "pvpResultIn 0.4s ease-out" }}>
          <div className="text-6xl">{phase === "victory" ? "🏆" : "💀"}</div>
          <div style={{ fontFamily: "Cinzel, serif", fontSize: 28, fontWeight: 900, letterSpacing: "0.15em", color: phase === "victory" ? "#fbbf24" : "#f87171", textShadow: `0 0 32px ${phase === "victory" ? "rgba(251,191,36,0.6)" : "rgba(248,113,113,0.6)"}` }}>
            {phase === "victory" ? "VICTORY!" : "DEFEAT"}
          </div>
          {phase === "victory" && resultMutation.data?.coinsEarned > 0 && (
            <div className="text-yellow-300 text-sm tracking-wider">+{resultMutation.data.coinsEarned} coins earned!</div>
          )}

          {/* Battle history */}
          {history && history.length > 0 && (
            <div className="w-full max-w-xs rounded-xl overflow-hidden border border-white/10" style={{ background: "rgba(10,5,20,0.9)" }}>
              <div className="px-4 py-2 border-b border-white/10 text-[10px] tracking-widest text-white/40">RECENT BATTLES</div>
              {history.slice(0, 5).map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
                  <span className={`text-xs font-bold w-8 ${b.result === "win" ? "text-green-400" : "text-red-400"}`}>{b.result === "win" ? "WIN" : "LOSS"}</span>
                  <span className="flex-1 text-white/60 text-xs truncate">vs {b.opponentName}</span>
                  <span className="text-[9px] text-white/30">Lv.{b.opponentLevel}</span>
                  {b.coinsEarned > 0 && <span className="text-yellow-400 text-[9px]">+{b.coinsEarned}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-xs tracking-widest text-white/60 border border-white/15 hover:bg-white/5 transition-all">
              EXIT
            </button>
            <button onClick={() => { setPhase("loading"); setCountdown(3); setComboCount(0); setPoisonActive(false); }} className="px-6 py-2.5 rounded-xl text-xs tracking-widest font-bold transition-all"
              style={{ background: "linear-gradient(135deg, #4c1d95, #7c3aed)", color: "#e9d5ff", boxShadow: "0 0 16px rgba(124,58,237,0.5)" }}>
              REMATCH
            </button>
            <button onClick={() => setShowLeaderboard(true)} className="px-6 py-2.5 rounded-xl text-xs tracking-widest transition-all border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10">
              🏆 RANKS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
