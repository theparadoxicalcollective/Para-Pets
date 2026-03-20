import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
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
  isPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isDead: boolean;
  mana: number;
  koTimer?: number;
}

interface FloatNum { id: number; x: number; y: number; value: number; isHeal?: boolean; isCrit?: boolean; }
interface SparkParticle { id: number; x: number; y: number; dx: number; dy: number; color: string; }

const MAX_MANA = 100;
const HP_BAR_LERP = 0.18;

function hpColor(pct: number) {
  if (pct > 0.5) return "#4ade80";
  if (pct > 0.25) return "#facc15";
  return "#f87171";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<"loading" | "countdown" | "battle" | "result">("loading");
  const [countdown, setCountdown] = useState(3);
  const [resultOutcome, setResultOutcome] = useState<"win" | "loss" | null>(null);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [bpEarned, setBpEarned] = useState(0);

  // Pets state (rendered)
  const [pets, setPets] = useState<BattlePet[]>([]);
  const petsRef = useRef<BattlePet[]>([]);
  const battleActiveRef = useRef(false);
  const animFrameRef = useRef(0);

  // Interaction
  const arenaRef = useRef<HTMLDivElement>(null);
  const selectedPetUidRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const isSlashingRef = useRef(false);
  const slashPathRef = useRef<{x:number;y:number}[]>([]);
  const hitSetRef = useRef<Set<string>>(new Set());
  const lastSkillTime = useRef<Record<string, number>>({});
  const idRef = useRef(0);

  // Visuals
  const [slashTrail, setSlashTrail] = useState<{x:number;y:number}[]>([]);
  const [floatNums, setFloatNums] = useState<FloatNum[]>([]);
  const [sparks, setSparks] = useState<SparkParticle[]>([]);
  const [hitFlash, setHitFlash] = useState<Record<string, boolean>>({});
  const [koSet, setKoSet] = useState<Set<string>>(new Set());

  // Fetch my pets
  const { data: myInventory = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"] });
  // Fetch opponent's pets
  const { data: oppPets = [], isLoading: oppLoading } = useQuery<any[]>({
    queryKey: ["/api/pvp/opponent-pets", opponent.userId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pvp/opponent-pets/${opponent.userId}`);
      return res.json();
    },
  });

  const recordResult = useMutation({
    mutationFn: async (data: { result: "win" | "loss"; opponentLevel: number }) => {
      const avgLvl = Math.max(1, Math.round((oppPets as any[]).reduce((s: number, p: any) => s + (p.petLevel || 1), 0) / Math.max(1, (oppPets as any[]).length)));
      const res = await apiRequest("POST", "/api/pvp/result", {
        opponentName: opponent.username,
        opponentImageUrl: opponent.profileImage,
        opponentLevel: data.opponentLevel || avgLvl,
        result: data.result,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCoinsEarned(data.coinsEarned ?? 0);
      setBpEarned(data.battlePointsDelta ?? 0);
    },
  });

  // Build battle pets from inventory data
  const buildPets = useCallback(() => {
    const inv = myInventory as any[];
    const myPets: BattlePet[] = myPetIds
      .map((id, i) => {
        const invItem = inv.find((it: any) => (it.inventoryId || it.id) === id);
        if (!invItem) return null;
        return {
          uid: nextUid(),
          invId: id,
          name: invItem.petNickname || invItem.name || "Pet",
          imageUrl: invItem.imageUrl ?? null,
          petTemplateId: invItem.petTemplateId ?? null,
          maxHp: invItem.petHealth || 800,
          hp: invItem.petHealth || 800,
          atk: invItem.petAtk || 50,
          def: invItem.petDef || 30,
          specialSkill: invItem.specialSkill ?? null,
          isPlayer: true,
          x: 10 + (i % 3) * 26 + Math.random() * 8,
          y: 65 + Math.floor(i / 3) * 15 + Math.random() * 5,
          vx: 0, vy: 0,
          isDead: false,
          mana: 0,
        } as BattlePet;
      })
      .filter(Boolean) as BattlePet[];

    const oppBattlePets: BattlePet[] = (oppPets as any[])
      .slice(0, 5)
      .map((p: any, i: number) => ({
        uid: nextUid(),
        invId: p.inventoryId || p.id,
        name: p.petNickname || p.name || "Foe",
        imageUrl: p.imageUrl ?? null,
        petTemplateId: p.petTemplateId ?? null,
        maxHp: p.petHealth || 800,
        hp: p.petHealth || 800,
        atk: p.petAtk || 50,
        def: p.petDef || 30,
        specialSkill: p.specialSkill ?? null,
        isPlayer: false,
        x: 10 + (i % 3) * 26 + Math.random() * 8,
        y: 8 + Math.floor(i / 3) * 14 + Math.random() * 4,
        vx: (Math.random() - 0.5) * 0.9,
        vy: (Math.random() - 0.5) * 0.5 + 0.2,
        isDead: false,
        mana: 0,
      }));

    if (myPets.length === 0) return null;
    return [...myPets, ...oppBattlePets];
  }, [myInventory, myPetIds, oppPets]);

  // When data is ready, build and start countdown
  useEffect(() => {
    if (phase !== "loading") return;
    if (oppLoading) return;
    const built = buildPets();
    if (!built || built.filter(p => p.isPlayer).length === 0) return;
    petsRef.current = built;
    setPets(built);
    setPhase("countdown");
  }, [phase, oppLoading, buildPets]);

  // Countdown
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) { battleActiveRef.current = true; setPhase("battle"); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Main battle loop ────────────────────────────────────────────
  const endBattle = useCallback((outcome: "win" | "loss") => {
    battleActiveRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
    setResultOutcome(outcome);
    setPhase("result");
    const avgLvl = Math.max(1, Math.round(petsRef.current.filter(p => !p.isPlayer).reduce((s, p) => s + 1, 0)));
    recordResult.mutate({ result: outcome, opponentLevel: avgLvl });
  }, [recordResult]);

  useEffect(() => {
    if (phase !== "battle") return;

    const dealDamage = (attacker: BattlePet, target: BattlePet, mult = 1.0) => {
      const rawDmg = Math.max(1, attacker.atk - Math.floor(target.def * 0.25) + Math.floor(Math.random() * 6) - 3);
      const dmg = Math.max(1, Math.floor(rawDmg * mult));
      target.hp = Math.max(0, target.hp - dmg);
      // Mana gain for attacker
      attacker.mana = Math.min(MAX_MANA, attacker.mana + 15);
      return dmg;
    };

    const spawnFloatNum = (x: number, y: number, value: number, isHeal = false, isCrit = false) => {
      const fn: FloatNum = { id: idRef.current++, x, y, value, isHeal, isCrit };
      setFloatNums(prev => [...prev, fn]);
      setTimeout(() => setFloatNums(prev => prev.filter(f => f.id !== fn.id)), 900);
    };

    const flashHit = (uid: string) => {
      setHitFlash(prev => ({ ...prev, [uid]: true }));
      setTimeout(() => setHitFlash(prev => ({ ...prev, [uid]: false })), 220);
    };

    const spawnSparks = (x: number, y: number, colors: string[]) => {
      const ns: SparkParticle[] = Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        return { id: idRef.current++, x, y, dx: Math.cos(angle) * (1.5 + Math.random() * 2), dy: Math.sin(angle) * (1.5 + Math.random() * 2), color: colors[i % colors.length] };
      });
      setSparks(prev => [...prev, ...ns]);
      const ids = new Set(ns.map(s => s.id));
      setTimeout(() => setSparks(prev => prev.filter(s => !ids.has(s.id))), 500);
    };

    const doKo = (pet: BattlePet) => {
      pet.isDead = true;
      setKoSet(prev => new Set([...prev, pet.uid]));
      setTimeout(() => {
        petsRef.current = petsRef.current.filter(p => p.uid !== pet.uid);
        setPets([...petsRef.current]);
        setKoSet(prev => { const n = new Set(prev); n.delete(pet.uid); return n; });
      }, 1000);
    };

    const useSpecialSkill = (attacker: BattlePet, targets: BattlePet[]) => {
      if (!attacker.specialSkill || targets.length === 0) return;
      attacker.mana = 0;
      const target = targets[0];
      const skill = attacker.specialSkill;
      if (skill === "Lazer") {
        const dmg = Math.floor(attacker.atk * 2.5);
        target.hp = Math.max(0, target.hp - dmg);
        spawnFloatNum(target.x, target.y - 10, dmg, false, true);
        flashHit(target.uid);
      } else if (skill === "Bubble") {
        targets.slice(0, 3).forEach(t => {
          const dmg = Math.floor(attacker.atk * 0.9);
          t.hp = Math.max(0, t.hp - dmg);
          spawnFloatNum(t.x, t.y - 8, dmg);
          flashHit(t.uid);
        });
      } else if (skill === "Heal Self" || skill === "Heal Party") {
        const healTargets = skill === "Heal Self" ? [attacker] : petsRef.current.filter(p => p.isPlayer === attacker.isPlayer && !p.isDead);
        healTargets.forEach(p => {
          const heal = Math.floor(p.maxHp * 0.25);
          p.hp = Math.min(p.maxHp, p.hp + heal);
          spawnFloatNum(p.x, p.y - 10, heal, true);
        });
      } else if (skill === "Poison") {
        let ticks = 0;
        const t = setInterval(() => {
          if (!battleActiveRef.current) { clearInterval(t); return; }
          ticks++;
          const tickDmg = Math.floor(attacker.atk * 0.15);
          target.hp = Math.max(0, target.hp - tickDmg);
          spawnFloatNum(target.x, target.y - 8, tickDmg);
          if (ticks >= 6 || target.hp <= 0) clearInterval(t);
        }, 900);
      }
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

        const enemies = pet.isPlayer ? oppAlive : myAlive;
        const friends = pet.isPlayer ? myAlive : oppAlive;

        // AI movement for opponent pets
        if (!pet.isPlayer) {
          // Move toward nearest player pet
          const nearest = myAlive.reduce((best: BattlePet | null, p) => {
            if (!best) return p;
            return Math.hypot(p.x - pet.x, p.y - pet.y) < Math.hypot(best.x - pet.x, best.y - pet.y) ? p : best;
          }, null);

          if (nearest) {
            const dx = nearest.x - pet.x;
            const dy = nearest.y - pet.y;
            const dist = Math.hypot(dx, dy) || 1;
            const speed = 0.55;
            pet.vx = pet.vx * 0.85 + (dx / dist) * speed * 0.15;
            pet.vy = pet.vy * 0.85 + (dy / dist) * speed * 0.15;
          }

          pet.x += pet.vx;
          pet.y += pet.vy;

          // Bounds for opp (top 55%)
          if (pet.x < 6) { pet.vx = Math.abs(pet.vx); pet.x = 6; }
          if (pet.x > 94) { pet.vx = -Math.abs(pet.vx); pet.x = 94; }
          if (pet.y < 4) { pet.vy = Math.abs(pet.vy); pet.y = 4; }
          if (pet.y > 56) { pet.vy = -Math.abs(pet.vy) * 0.7; pet.y = 56; }

          // Collision attack
          for (const myPet of myAlive) {
            if (myPet.isDead) continue;
            const dist = Math.hypot(pet.x - myPet.x, pet.y - myPet.y);
            if (dist < 14) {
              const dmg = dealDamage(pet, myPet);
              spawnFloatNum(myPet.x, myPet.y - 10, dmg);
              spawnSparks(myPet.x, myPet.y, ["#c084fc", "#818cf8", "#f472b6"]);
              flashHit(myPet.uid);
              // Bounce back
              const dx = myPet.x - pet.x || 1;
              const dy = myPet.y - pet.y || 1;
              const d = Math.hypot(dx, dy);
              pet.vx = -(dx / d) * 1.5;
              pet.vy = -(dy / d) * 1.5;

              if (myPet.hp <= 0 && !myPet.isDead) doKo(myPet);
            }
          }

          // AI skill
          if (pet.mana >= MAX_MANA && (now - (lastSkillTime.current[pet.uid] || 0)) > 5000) {
            lastSkillTime.current[pet.uid] = now;
            useSpecialSkill(pet, myAlive);
          }
        }

        // Player pet bounds (stay in lower 50%)
        if (pet.isPlayer) {
          if (pet.x < 4) pet.x = 4;
          if (pet.x > 96) pet.x = 96;
          if (pet.y < 50) pet.y = 50;
          if (pet.y > 94) pet.y = 94;

          // Player pet skill (auto-use when mana full)
          if (pet.mana >= MAX_MANA && pet.specialSkill && (now - (lastSkillTime.current[pet.uid] || 0)) > 4000) {
            lastSkillTime.current[pet.uid] = now;
            useSpecialSkill(pet, oppAlive);
          }
        }
      }

      petsRef.current = [...ps];
      setPets([...ps]);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(animFrameRef.current); };
  }, [phase, endBattle]);

  // ── Pointer interactions ────────────────────────────────────────
  const getArenaPos = useCallback((cx: number, cy: number) => {
    if (!arenaRef.current) return { x: 50, y: 50 };
    const rect = arenaRef.current.getBoundingClientRect();
    return { x: ((cx - rect.left) / rect.width) * 100, y: ((cy - rect.top) / rect.height) * 100 };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pos = getArenaPos(e.clientX, e.clientY);

    // Check if tapping a player pet
    const myPets = petsRef.current.filter(p => p.isPlayer && !p.isDead);
    const tapped = myPets.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 12);
    if (tapped) {
      selectedPetUidRef.current = tapped.uid;
      isDraggingRef.current = true;
      return;
    }

    // Otherwise start slash
    isSlashingRef.current = true;
    slashPathRef.current = [pos];
    hitSetRef.current = new Set();
    setSlashTrail([pos]);
  }, [getArenaPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
    const pos = getArenaPos(e.clientX, e.clientY);

    if (isDraggingRef.current && selectedPetUidRef.current) {
      // Drag selected player pet (only in bottom half)
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

    // Check slash against all live opponent pets
    const oppPetsAlive = petsRef.current.filter(p => !p.isPlayer && !p.isDead);
    for (const opp of oppPetsAlive) {
      if (hitSetRef.current.has(opp.uid)) continue;
      const ax = prev.x, ay = prev.y, bx = pos.x, by = pos.y;
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const t = Math.max(0, Math.min(1, ((opp.x - ax) * dx + (opp.y - ay) * dy) / (len * len)));
      const dist = Math.hypot(ax + t * dx - opp.x, ay + t * dy - opp.y);
      if (dist >= 16) continue;

      hitSetRef.current.add(opp.uid);
      const isCrit = Math.random() < 0.15;
      const myPetsAlive = petsRef.current.filter(p => p.isPlayer && !p.isDead);
      const attacker = myPetsAlive[0];
      if (!attacker) continue;

      const rawDmg = attacker.atk - Math.floor(opp.def * 0.25);
      const dmg = Math.max(1, Math.floor((rawDmg + Math.floor(Math.random() * 8) - 4) * (isCrit ? 1.8 : 1)));
      opp.hp = Math.max(0, opp.hp - dmg);
      attacker.mana = Math.min(MAX_MANA, attacker.mana + 14);

      const colors = isCrit ? ["#fbbf24", "#f59e0b", "#fde68a"] : ["#a78bfa", "#c4b5fd", "#ddd6fe"];
      const ns: SparkParticle[] = Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
        return { id: idRef.current++, x: opp.x, y: opp.y, dx: Math.cos(angle) * (2 + Math.random() * 2), dy: Math.sin(angle) * (2 + Math.random() * 2), color: colors[i % colors.length] };
      });
      setSparks(prev2 => [...prev2, ...ns]);
      const sids = new Set(ns.map(s => s.id));
      setTimeout(() => setSparks(prev2 => prev2.filter(s => !sids.has(s.id))), 500);

      const fn: FloatNum = { id: idRef.current++, x: opp.x, y: opp.y - 8, value: dmg, isCrit };
      setFloatNums(prev2 => [...prev2, fn]);
      setTimeout(() => setFloatNums(prev2 => prev2.filter(f => f.id !== fn.id)), 1000);

      // Knockback
      const sdx = bx - ax, sdy = by - ay;
      const sl = Math.hypot(sdx, sdy) || 1;
      opp.vx = (sdx / sl) * 3;
      opp.vy = (sdy / sl) * 3;

      if (opp.hp <= 0 && !opp.isDead) {
        opp.isDead = true;
        setKoSet(prev2 => new Set([...prev2, opp.uid]));
        setTimeout(() => {
          petsRef.current = petsRef.current.filter(p => p.uid !== opp.uid);
          setPets([...petsRef.current]);
          setKoSet(prev2 => { const n = new Set(prev2); n.delete(opp.uid); return n; });
        }, 1000);
      }
    }
  }, [getArenaPos]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
    selectedPetUidRef.current = null;
    isSlashingRef.current = false;
    hitSetRef.current = new Set();
    setTimeout(() => setSlashTrail([]), 180);
  }, []);

  // ── HP display (smooth) ─────────────────────────────────────────
  const myAlive = pets.filter(p => p.isPlayer && !p.isDead);
  const oppAlive = pets.filter(p => !p.isPlayer && !p.isDead);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ fontFamily: "Cinzel, serif" }}>
      <style>{`
        @keyframes koSpin { 0%{transform:translate(-50%,-50%) scale(1) rotate(0deg);opacity:1} 100%{transform:translate(-50%,-50%) scale(0.3) rotate(720deg);opacity:0} }
        @keyframes bSpark { to { transform: translate(calc(var(--dx)*14px), calc(var(--dy)*14px)); opacity:0; } }
        @keyframes bFloat { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-36px)} }
        @keyframes bIdle { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-4px)} }
        @keyframes bResultIn { 0%{transform:scale(0.8) translateY(20px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes bHit { 0%{filter:brightness(1)} 30%{filter:brightness(3) saturate(0)} 100%{filter:brightness(1)} }
      `}</style>

      {/* Forest background */}
      <div className="absolute inset-0" style={{ backgroundImage: `url(${forestBgImg})`, backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.35)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,8,15,0.4) 0%, rgba(5,8,15,0.65) 100%)" }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-safe pt-3 pb-2.5 shrink-0" style={{ background: "rgba(5,8,15,0.7)", borderBottom: "1px solid rgba(167,139,250,0.1)" }}>
        <button onClick={() => onClose(null)} className="text-white/40 hover:text-white/70 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 text-center text-sm tracking-[0.2em] text-red-300 font-bold">vs {opponent.username}</div>
        <div className="text-white/20 text-[9px] tracking-widest">SWIPE TO ATTACK</div>
      </div>

      {/* Opponent HP summary bar */}
      <div className="relative z-10 shrink-0 px-3 pt-2 pb-1" style={{ background: "rgba(10,3,20,0.7)" }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {pets.filter(p => !p.isPlayer).map(p => (
            <div key={p.uid} className="flex items-center gap-1">
              <div className="h-1.5 w-10 bg-black/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-150" style={{ width: `${(p.hp / p.maxHp) * 100}%`, background: hpColor(p.hp / p.maxHp) }} />
              </div>
            </div>
          ))}
          {pets.filter(p => !p.isPlayer).length === 0 && <div className="text-white/20 text-[9px]">All foes defeated</div>}
        </div>
      </div>

      {/* Arena */}
      {phase === "loading" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
        </div>
      )}

      {phase === "countdown" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-6xl font-black text-white" style={{ textShadow: "0 0 40px rgba(167,139,250,0.8)" }}>{countdown > 0 ? countdown : "FIGHT!"}</div>
        </div>
      )}

      {(phase === "battle" || phase === "result") && (
        <div
          ref={arenaRef}
          className="flex-1 relative overflow-hidden select-none"
          style={{ touchAction: "none", cursor: "crosshair" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Arena grid */}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(167,139,250,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.03) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

          {/* Dividing line */}
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: "50%", height: 1, background: "linear-gradient(90deg, transparent, rgba(239,68,68,0.3), transparent)" }} />

          {/* Swipe trail */}
          {slashTrail.length >= 2 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
              <polyline
                points={slashTrail.map(p => `${p.x}%,${p.y}%`).join(" ")}
                fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                opacity="0.85" style={{ filter: "drop-shadow(0 0 6px #a78bfa)" }}
              />
            </svg>
          )}

          {/* Pets */}
          {pets.filter(p => !p.isDead).map(pet => (
            <div
              key={pet.uid}
              className="absolute pointer-events-none"
              style={{
                left: `${pet.x}%`,
                top: `${pet.y}%`,
                transform: `translate(-50%, -50%)${pet.isPlayer ? "" : " scaleX(-1)"}`,
                animation: hitFlash[pet.uid] ? "bHit 0.22s ease-out" : "bIdle 1.2s ease-in-out infinite",
                zIndex: pet.isPlayer ? 15 : 12,
              }}
            >
              {/* HP bar above pet */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-14 pointer-events-none">
                <div className="h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
                  <div className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(0, (pet.hp / pet.maxHp) * 100)}%`, background: hpColor(pet.hp / pet.maxHp) }} />
                </div>
                <div className="text-[7px] text-white/40 text-center truncate mt-0.5">{pet.name}</div>
              </div>

              {/* Mana pip */}
              {pet.mana >= MAX_MANA && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[8px] text-purple-300 animate-pulse">✦</div>
              )}

              {/* Pet image */}
              {pet.petTemplateId
                ? <PetAnimator petTemplateId={pet.petTemplateId} mode="idle" view="front" size={pet.isPlayer ? 80 : 64} />
                : pet.imageUrl
                ? <img src={pet.imageUrl} style={{ width: pet.isPlayer ? 80 : 64, height: pet.isPlayer ? 80 : 64, objectFit: "contain", filter: pet.isPlayer ? "drop-shadow(0 0 10px rgba(167,139,250,0.5))" : "drop-shadow(0 0 10px rgba(239,68,68,0.5))" }} />
                : <div style={{ width: pet.isPlayer ? 72 : 56, height: pet.isPlayer ? 72 : 56, background: pet.isPlayer ? "rgba(100,60,200,0.3)" : "rgba(200,60,60,0.3)", borderRadius: "50%", border: `2px solid ${pet.isPlayer ? "rgba(167,139,250,0.5)" : "rgba(239,68,68,0.5)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🐾</div>}
            </div>
          ))}

          {/* KO effects */}
          {[...koSet].map(uid => {
            const pet = pets.find(p => p.uid === uid);
            if (!pet) return null;
            return (
              <div key={uid} className="absolute pointer-events-none z-40"
                style={{ left: `${pet.x}%`, top: `${pet.y}%`, transform: "translate(-50%,-50%)" }}>
                <div style={{ fontSize: 40, animation: "koSpin 1s ease-in forwards" }}>💀</div>
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
              style={{ left: `${fn.x}%`, top: `${fn.y}%`, transform: "translate(-50%,-50%)", fontSize: fn.isCrit ? 24 : fn.isHeal ? 20 : 17, color: fn.isHeal ? "#4ade80" : fn.isCrit ? "#fbbf24" : "#f87171", textShadow: fn.isHeal ? "0 0 10px #22c55e" : fn.isCrit ? "0 0 10px #f59e0b" : "0 0 8px rgba(239,68,68,0.8)", animation: "bFloat 0.9s ease-out forwards", fontFamily: "Cinzel, serif" }}>
              {fn.isHeal ? "+" : ""}{fn.value}{fn.isCrit ? "!" : ""}
            </div>
          ))}

          {/* Hint */}
          {phase === "battle" && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/15 text-[9px] tracking-widest pointer-events-none animate-pulse whitespace-nowrap">
              Swipe enemies · Tap pet to drag
            </div>
          )}

          {/* Result overlay */}
          {phase === "result" && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4" style={{ background: "rgba(5,8,15,0.88)", animation: "bResultIn 0.5s ease-out" }}>
              <div className="text-5xl">{resultOutcome === "win" ? "🏆" : "💀"}</div>
              <div className="text-2xl font-black tracking-[0.15em]" style={{ color: resultOutcome === "win" ? "#fbbf24" : "#f87171", textShadow: `0 0 30px ${resultOutcome === "win" ? "rgba(251,191,36,0.6)" : "rgba(248,113,113,0.6)"}` }}>
                {resultOutcome === "win" ? "VICTORY!" : "DEFEAT"}
              </div>
              {coinsEarned > 0 && <div className="text-yellow-300 text-sm tracking-wider">+{coinsEarned} coins earned!</div>}
              {bpEarned !== 0 && (
                <div className={`text-sm tracking-wider ${bpEarned > 0 ? "text-purple-300" : "text-red-400"}`}>
                  {bpEarned > 0 ? "+" : ""}{bpEarned} battle points
                </div>
              )}
              <div className="flex gap-3 mt-2">
                <button onClick={() => onClose(resultOutcome)} className="px-6 py-2.5 rounded-xl text-xs tracking-widest text-white/60 border border-white/15 hover:bg-white/5">
                  BACK TO LOBBY
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Player HP summary bar at bottom */}
      <div className="relative z-10 shrink-0 px-3 pb-safe pb-3 pt-2" style={{ background: "rgba(10,3,20,0.8)", borderTop: "1px solid rgba(167,139,250,0.08)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          {pets.filter(p => p.isPlayer).map(p => (
            <div key={p.uid} className="flex items-center gap-1.5">
              <div className="text-[8px] text-purple-300/60 truncate max-w-[40px]">{p.name}</div>
              <div className="h-2 w-14 bg-black/60 rounded-full overflow-hidden border border-purple-900/30">
                <div className="h-full rounded-full transition-all duration-150" style={{ width: `${(p.hp / p.maxHp) * 100}%`, background: hpColor(p.hp / p.maxHp) }} />
              </div>
            </div>
          ))}
          {pets.filter(p => p.isPlayer).length === 0 && phase === "battle" && (
            <div className="text-red-400/50 text-[9px]">All your pets have fallen...</div>
          )}
        </div>
      </div>
    </div>
  );
}
