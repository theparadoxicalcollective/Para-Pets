import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { playHit, playPlayerHurt, playBattleVictory, playDefeat } from "@/lib/sounds";
import { ArrowLeft, X } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import battleTrophyIcon from "@assets/generated_images/icon_battle_trophy.png";
import skullDefeatIcon from "@assets/generated_images/icon_skull_defeat.png";
import forestBgImg from "@assets/generated_images/pvp_arena_forest_bg.png";

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
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  specialSkill: string | null;
  specialSkillType: string | null;
  skillDamagePercent: number | null;
  skillHealPercent: number | null;
  isPlayer: boolean;
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
  onClose,
}: {
  opponent: Opponent;
  myPetIds: string[];
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
        result: data.result,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCoinsEarned(data.coinsEarned ?? 0);
      setBpEarned(data.battlePointsDelta ?? 0);
    },
  });

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
        maxHp: invItem.petHealth || 800, hp: invItem.petHealth || 800,
        atk: invItem.petAtk || 50, def: invItem.petDef || 30,
        specialSkill: invItem.specialSkill ?? null,
        specialSkillType: (invItem as any).specialSkillType ?? null,
        skillDamagePercent: (invItem as any).skillDamagePercent ?? null,
        skillHealPercent: (invItem as any).skillHealPercent ?? null,
        isPlayer: true,
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
      maxHp: p.petHealth || 800, hp: p.petHealth || 800,
      atk: p.petAtk || 50, def: p.petDef || 30,
      specialSkill: p.specialSkill ?? null,
      specialSkillType: p.specialSkillType ?? null,
      skillDamagePercent: p.skillDamagePercent ?? null,
      skillHealPercent: p.skillHealPercent ?? null,
      isPlayer: false,
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

    if (skill === "Lazer" && target) {
      const mult = attacker.skillDamagePercent ? attacker.skillDamagePercent / 100 : 2.5;
      const dmg = Math.max(1, Math.floor(attacker.atk * mult));
      target.hp = Math.max(0, target.hp - dmg);
      spawnFloatNum(target.x, target.y - 10, dmg, false, true);
      spawnSparks(target.x, target.y, ["#fbbf24", "#f59e0b", "#fde68a"]);
      flashHit(target.uid);
      if (target.hp <= 0 && !target.isDead) doKo(target);

    } else if (skill === "Bubble") {
      const mult = attacker.skillDamagePercent ? attacker.skillDamagePercent / 100 : 0.85;
      const enemies = attacker.isPlayer ? oppAlive : myAlive;
      enemies.forEach(t => {
        const dmg = Math.max(1, Math.floor(attacker.atk * mult));
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

      for (const pet of alive) {
        if (pet.isDead) continue;

        if (!pet.isPlayer) {
          // AI movement: wander toward nearest player pet
          const nearest = myAlive.reduce((best: BattlePet | null, p) =>
            !best || Math.hypot(p.x - pet.x, p.y - pet.y) < Math.hypot(best.x - pet.x, best.y - pet.y) ? p : best, null);
          if (nearest) {
            const dx = nearest.x - pet.x, dy = nearest.y - pet.y;
            const dist = Math.hypot(dx, dy) || 1;
            pet.vx = pet.vx * 0.88 + (dx / dist) * 0.55 * 0.12;
            pet.vy = pet.vy * 0.88 + (dy / dist) * 0.55 * 0.12;
          }
          pet.x += pet.vx;
          pet.y += pet.vy;
          if (pet.x < 5) { pet.vx = Math.abs(pet.vx); pet.x = 5; }
          if (pet.x > 95) { pet.vx = -Math.abs(pet.vx); pet.x = 95; }
          if (pet.y < 4) { pet.vy = Math.abs(pet.vy); pet.y = 4; }
          if (pet.y > 56) { pet.vy = -Math.abs(pet.vy) * 0.6; pet.y = 56; }

          // Collision damage on player pets
          for (const myPet of myAlive) {
            if (myPet.isDead) continue;
            const dist = Math.hypot(pet.x - myPet.x, pet.y - myPet.y);
            if (dist < 14) {
              const dmg = dealDamage(pet, myPet);
              spawnFloatNum(myPet.x, myPet.y - 10, dmg);
              spawnSparks(myPet.x, myPet.y, ["#c084fc", "#818cf8", "#f472b6"]);
              flashHit(myPet.uid);
              const dx2 = myPet.x - pet.x || 1, dy2 = myPet.y - pet.y || 1;
              const d = Math.hypot(dx2, dy2);
              pet.vx = -(dx2 / d) * 1.4; pet.vy = -(dy2 / d) * 1.4;
              if (myPet.hp <= 0 && !myPet.isDead) doKo(myPet);
            }
          }

          // AI skill: auto-trigger when mana full
          if (pet.mana >= MAX_MANA && (now - (lastAiSkillTime.current[pet.uid] || 0)) > 5000) {
            lastAiSkillTime.current[pet.uid] = now;
            const sk = effectiveSkillType(pet);
            if (sk) {
              const mode = skillMode(sk);
              if (mode === "needs-enemy") {
                const target = myAlive[Math.floor(Math.random() * myAlive.length)];
                if (target) fireSkill(pet, sk, target);
              } else {
                fireSkill(pet, sk, null);
              }
            } else {
              pet.mana = 0;
            }
          }
        } else {
          // Player pets: passive mana gain over time
          pet.mana = Math.min(MAX_MANA, pet.mana + 0.06);
        }

        // Player pet bounds
        if (pet.isPlayer) {
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

    // ─ Check if tapping a regular player pet to drag ─
    const tappedPet = myAlive.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 12);
    if (tappedPet) {
      selectedPetUidRef.current = tappedPet.uid;
      isDraggingRef.current = true;
      return;
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ fontFamily: "Lora, serif" }}>
      <style>{`
        @keyframes koSpin { 0%{transform:translate(-50%,-50%) scale(1) rotate(0deg);opacity:1} 100%{transform:translate(-50%,-50%) scale(0.3) rotate(720deg);opacity:0} }
        @keyframes bSpark { to { transform: translate(calc(var(--dx)*14px), calc(var(--dy)*14px)); opacity:0; } }
        @keyframes bFloat { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-38px)} }
        @keyframes bIdle { 0%,100%{transform:translate(-50%,-50%)} 50%{transform:translate(-50%,calc(-50% - 4px))} }
        @keyframes bResultIn { 0%{transform:scale(0.85) translateY(18px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes bHit { 0%{filter:brightness(1)} 25%{filter:brightness(3.5) saturate(0)} 100%{filter:brightness(1)} }
        @keyframes skillGlow { 0%,100%{box-shadow:0 0 12px 4px rgba(167,139,250,0.6), 0 0 24px 8px rgba(124,58,237,0.35)} 50%{box-shadow:0 0 20px 8px rgba(196,181,253,0.85), 0 0 38px 14px rgba(167,139,250,0.55)} }
        @keyframes targetPulse { 0%,100%{opacity:0.55} 50%{opacity:1} }
      `}</style>

      {/* Forest background */}
      <div className="absolute inset-0" style={{ backgroundImage: `url(${forestBgImg})`, backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.35)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(5,8,15,.4) 0%,rgba(5,8,15,.65) 100%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 pb-2.5 shrink-0" style={{ background: "rgba(5,8,15,0.72)", borderBottom: "1px solid rgba(167,139,250,0.1)", paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
        <button onClick={() => onClose(null)} data-testid="button-close-battle" className="w-10 h-10 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 transition-colors active:scale-90 shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 text-center text-sm tracking-[0.2em] text-red-300 font-bold">vs {opponent.username}</div>
        {!pendingSkill
          ? <div className="text-white/20 text-[9px] tracking-widest">SWIPE TO ATTACK</div>
          : <button onClick={() => { setPendingSkill(null); pendingSkillRef.current = null; }} className="flex items-center gap-1 text-white/40 text-[9px]">
              <X size={12} /> CANCEL
            </button>}
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

          {/* Pets */}
          {pets.filter(p => !p.isDead).map(pet => {
            const isSkillReady = pet.isPlayer && pet.mana >= MAX_MANA && !!pet.specialSkill;
            const isPendingSource = pendingSkill?.petUid === pet.uid;
            const isEnemyTarget = pendingSkill?.mode === "needs-enemy" && !pet.isPlayer;
            const size = pet.isPlayer ? 80 : 64;

            return (
              <div
                key={pet.uid}
                className="absolute pointer-events-none"
                style={{
                  left: `${pet.x}%`, top: `${pet.y}%`,
                  transform: `translate(-50%,-50%)${pet.isPlayer ? "" : " scaleX(-1)"}`,
                  animation: hitFlash[pet.uid] ? "bHit 0.22s ease-out" : "bIdle 1.4s ease-in-out infinite",
                  zIndex: pet.isPlayer ? 15 : 12,
                }}
              >
                {/* HP bar */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-14 pointer-events-none">
                  <div className="h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
                    <div className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(0, (pet.hp / pet.maxHp) * 100)}%`, background: hpColor(pet.hp / pet.maxHp) }} />
                  </div>
                  <div className="text-[7px] text-white/40 text-center truncate mt-0.5">{pet.name}</div>
                </div>

                {/* Mana bar (player pets only) */}
                {pet.isPlayer && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-14">
                    <div className="h-1 bg-black/50 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-200" style={{ width: `${(pet.mana / MAX_MANA) * 100}%`, background: pet.mana >= MAX_MANA ? "#c084fc" : "#7c3aed" }} />
                    </div>
                  </div>
                )}

                {/* Skill ready label */}
                {isSkillReady && !isPendingSource && (
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] text-purple-200 font-bold tracking-wider animate-pulse">
                    ✦ {pet.specialSkill}
                  </div>
                )}

                {/* Pending source label */}
                {isPendingSource && (
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] text-yellow-300 font-bold tracking-wider">
                    READY →
                  </div>
                )}

                {/* Pet image with glow */}
                <div
                  style={{
                    borderRadius: "50%",
                    animation: isSkillReady ? "skillGlow 1.2s ease-in-out infinite" : undefined,
                    outline: isPendingSource ? "2px solid rgba(250,204,21,0.8)" : undefined,
                    outlineOffset: 3,
                  }}
                >
                  {pet.petTemplateId
                    ? <PetAnimator petTemplateId={pet.petTemplateId} mode="idle" view="front" size={size} />
                    : pet.imageUrl
                    ? <img src={pet.imageUrl} style={{ width: size, height: size, objectFit: "contain", filter: pet.isPlayer ? "drop-shadow(0 0 10px rgba(167,139,250,0.5))" : "drop-shadow(0 0 10px rgba(239,68,68,0.45))" }} />
                    : <div style={{ width: size, height: size, background: pet.isPlayer ? "rgba(100,60,200,0.3)" : "rgba(200,60,60,0.3)", borderRadius: "50%", border: `2px solid ${pet.isPlayer ? "rgba(167,139,250,0.5)" : "rgba(239,68,68,0.5)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}><img src={petPawIcon} alt="" style={{ width: size * 0.65, height: size * 0.65, objectFit: "contain" }} /></div>}
                </div>

                {/* Enemy target indicator */}
                {isEnemyTarget && !pet.isDead && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] text-red-300 font-bold whitespace-nowrap animate-pulse">TAP</div>
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

          {/* Hint (only when not in skill mode) */}
          {phase === "battle" && !pendingSkill && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/12 text-[9px] tracking-widest pointer-events-none animate-pulse whitespace-nowrap">
              Swipe enemies · Tap pet to move · Tap glowing pet to use skill
            </div>
          )}

          {/* Result overlay */}
          {phase === "result" && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4" style={{ background: "rgba(5,8,15,0.88)", animation: "bResultIn 0.5s ease-out" }}>
              <div>{resultOutcome === "win" ? <img src={battleTrophyIcon} alt="" style={{ width: 72, height: 72, objectFit: "contain" }} /> : <img src={skullDefeatIcon} alt="" style={{ width: 72, height: 72, objectFit: "contain" }} />}</div>
              <div className="text-2xl font-black tracking-[0.15em]" style={{ color: resultOutcome === "win" ? "#fbbf24" : "#f87171", textShadow: `0 0 30px ${resultOutcome === "win" ? "rgba(251,191,36,0.6)" : "rgba(248,113,113,0.6)"}` }}>
                {resultOutcome === "win" ? "VICTORY!" : "DEFEAT"}
              </div>
              {coinsEarned > 0 && <div className="text-yellow-300 text-sm tracking-wider">+{coinsEarned} coins earned!</div>}
              {bpEarned !== 0 && (
                <div className={`text-sm tracking-wider ${bpEarned > 0 ? "text-purple-300" : "text-red-400"}`}>
                  {bpEarned > 0 ? "+" : ""}{bpEarned} battle points
                </div>
              )}
              <button onClick={() => onClose(resultOutcome)} className="mt-2 px-6 py-2.5 rounded-xl text-xs tracking-widest text-white/60 border border-white/15 hover:bg-white/5">
                BACK TO LOBBY
              </button>
            </div>
          )}
        </div>
      )}

      {/* Player HP bars */}
      <div className="relative z-10 shrink-0 px-3 pb-safe pb-3 pt-2" style={{ background: "rgba(10,3,20,0.82)", borderTop: "1px solid rgba(167,139,250,0.08)" }}>
        <div className="flex items-center gap-3 flex-wrap">
          {playerPets.map(p => (
            <div key={p.uid} className="flex items-center gap-1.5">
              <div className="text-[8px] text-purple-300/60 truncate max-w-[38px]">{p.name}</div>
              <div className="flex flex-col gap-0.5">
                <div className="h-2 w-12 bg-black/60 rounded-full overflow-hidden border border-purple-900/30">
                  <div className="h-full rounded-full transition-all duration-150" style={{ width: `${(p.hp / p.maxHp) * 100}%`, background: hpColor(p.hp / p.maxHp) }} />
                </div>
                {p.specialSkill && (
                  <div className="h-1 w-12 bg-black/50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-200" style={{ width: `${(p.mana / MAX_MANA) * 100}%`, background: p.mana >= MAX_MANA ? "#c084fc" : "#4c1d95" }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
