import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Swords, Star, Coins, X, ChevronRight, ArrowLeft, Heart, HelpCircle } from "lucide-react";
import PetAnimator from "./PetAnimator";


interface EncounterEnemy {
  enemyId: string;
  name: string;
  imageUrl: string | null;
  isBoss: boolean;
  level: number;
  hp: number;
  atk: number;
  def: number;
  coinReward: number;
  drops: any[];
}

interface EncounterPet {
  inventoryId: string;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  petTemplateId: string | null;
  imageUrl: string | null;
}

interface BattleArenaProps {
  locationId: string;
  locationName: string;
  bgUrl: string | null;
  accent: string;
  onClose: () => void;
  onBattleEnd: () => void;
}

interface EnemyPosition {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface SlashEffect {
  id: number;
  x: number;
  y: number;
}

interface SparkParticle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
}

interface DamageNumber {
  id: number;
  x: number;
  y: number;
  value: number;
  isHeal?: boolean;
  isCrit?: boolean;
}

interface InventoryPotion {
  inventoryId: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  healthRestored: number;
}

type BattlePhase = "loading" | "intro" | "battle" | "victory" | "waveComplete" | "defeat";

function buildSlashPath(pts: {x: number; y: number}[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x},${p2.y}`;
  }
  return d;
}

export default function BattleArena({ locationId, locationName, bgUrl, accent, onClose, onBattleEnd }: BattleArenaProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<BattlePhase>("loading");
  const [allEnemies, setAllEnemies] = useState<EncounterEnemy[]>([]);
  const [waveIndex, setWaveIndex] = useState(0);
  const [enemy, setEnemy] = useState<EncounterEnemy | null>(null);
  const [pet, setPet] = useState<EncounterPet | null>(null);
  const [enemyHp, setEnemyHp] = useState(0);
  const [enemyMaxHp, setEnemyMaxHp] = useState(0);
  const [petHp, setPetHp] = useState(0);
  const [petMaxHp, setPetMaxHp] = useState(0);
  const [enemyPos, setEnemyPos] = useState<EnemyPosition>({ x: 50, y: 25, vx: 2, vy: 1.5 });
  const [slashEffects, setSlashEffects] = useState<SlashEffect[]>([]);
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);
  const [petHit, setPetHit] = useState(false);
  const [enemyHit, setEnemyHit] = useState(false);
  const [shakeScreen, setShakeScreen] = useState(false);
  const [victoryData, setVictoryData] = useState<any>(null);
  const [comboCount, setComboCount] = useState(0);
  const [lastHitTime, setLastHitTime] = useState(0);
  const [totalRewards, setTotalRewards] = useState<{ lvlPoints: number; coins: number; items: any[]; levelsGained: number }>({ lvlPoints: 0, coins: 0, items: [], levelsGained: 0 });

  const [slashTrail, setSlashTrail] = useState<{x: number; y: number}[]>([]);
  const [trailFading, setTrailFading] = useState(false);
  const [sparkParticles, setSparkParticles] = useState<SparkParticle[]>([]);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("battleTutorialSeen"));

  const animFrameRef = useRef<number>(0);
  const arenaRef = useRef<HTMLDivElement>(null);
  const slashIdRef = useRef(0);
  const dmgIdRef = useRef(0);
  const swipePathRef = useRef<{x: number; y: number}[]>([]);
  const lastSwipePointRef = useRef<{x: number; y: number} | null>(null);
  const hitEnemiesRef = useRef<Set<string>>(new Set());
  const isSlashingRef = useRef(false);
  const battleActiveRef = useRef(false);
  const enemyPosRef = useRef(enemyPos);
  const enemyHpRef = useRef(0);
  const petHpRef = useRef(0);
  const lastEnemyAttackRef = useRef(0);
  const petStatsRef = useRef({ atk: 50, def: 50 });
  const enemyStatsRef = useRef({ atk: 20, def: 10 });
  const enemyDifficultyRef = useRef(0.5);
  const enemyHitCountRef = useRef(0);

  const { data: inventory = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"] });

  const potions: InventoryPotion[] = inventory
    .filter((item: any) => item.type === "potion" && item.healthRestored && item.healthRestored > 0)
    .map((item: any) => ({
      inventoryId: item.inventoryId,
      shopItemId: item.shopItemId,
      name: item.name,
      imageUrl: item.imageUrl,
      healthRestored: item.healthRestored,
    }));

  useEffect(() => {
    const fetchEncounter = async () => {
      try {
        const res = await apiRequest("POST", `/api/explore/${locationId}/encounter`);
        const data = await res.json();
        if (!data.encounters || data.encounters.length === 0) {
          toast({ title: "No enemies found", description: "This area seems peaceful..." });
          onClose();
          return;
        }
        setAllEnemies(data.encounters);
        setPet(data.pet);
        setPetHp(data.pet.hp);
        setPetMaxHp(data.pet.hp);
        petHpRef.current = data.pet.hp;
        petStatsRef.current = { atk: data.pet.atk, def: data.pet.def };
        startWave(data.encounters[0], 0);
      } catch (err) {
        toast({ title: "Error", description: "Failed to start battle", variant: "destructive" });
        onClose();
      }
    };
    fetchEncounter();
  }, [locationId]);

  const startWave = useCallback((enc: EncounterEnemy, idx: number) => {
    setEnemy(enc);
    setWaveIndex(idx);
    setEnemyHp(enc.hp);
    setEnemyMaxHp(enc.hp);
    enemyHpRef.current = enc.hp;
    enemyStatsRef.current = { atk: enc.atk, def: enc.def };
    setVictoryData(null);
    setComboCount(0);
    setLastHitTime(0);
    setSlashEffects([]);
    setDamageNumbers([]);

    const difficulty = 0.3 + Math.random() * 0.7;
    enemyDifficultyRef.current = difficulty;
    enemyHitCountRef.current = 0;

    setPhase("intro");
  }, []);

  useEffect(() => {
    if (phase === "intro") {
      const timer = setTimeout(() => {
        setPhase("battle");
        battleActiveRef.current = true;
        lastEnemyAttackRef.current = Date.now();
        const diff = enemyDifficultyRef.current;
        const baseSpeed = 0.5 + diff * 0.6;
        setEnemyPos({
          x: 50,
          y: 20,
          vx: (Math.random() > 0.5 ? 1 : -1) * (baseSpeed + Math.random() * 0.3),
          vy: (Math.random() > 0.5 ? 1 : -1) * (baseSpeed * 0.5 + Math.random() * 0.2),
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const defeatMutation = useMutation({
    mutationFn: async ({ enemyId, enemyLevel }: { enemyId: string; enemyLevel: number }) => {
      const res = await apiRequest("POST", `/api/explore/defeat/${enemyId}`, { enemyLevel });
      return res.json();
    },
    onSuccess: (data) => {
      setVictoryData(data);
      setTotalRewards(prev => ({
        lvlPoints: prev.lvlPoints + (data.lvlPointsEarned || 0),
        coins: prev.coins + (data.coinsAwarded || 0),
        items: [...prev.items, ...(data.droppedItems || [])],
        levelsGained: prev.levelsGained + (data.levelsGained || 0),
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: () => {
      setVictoryData({ error: true, lvlPointsEarned: 0, coinsAwarded: 0, droppedItems: [], levelsGained: 0 });
    },
  });

  const potionMutation = useMutation({
    mutationFn: async ({ inventoryId, petInventoryId }: { inventoryId: string; petInventoryId: string }) => {
      const res = await apiRequest("POST", "/api/explore/use-potion", { inventoryId, petInventoryId });
      return res.json();
    },
    onSuccess: (data) => {
      const healAmount = data.healAmount || 0;
      const newHp = Math.min(petMaxHp, petHp + healAmount);
      setPetHp(newHp);
      petHpRef.current = newHp;
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: `Used ${data.potionName}`, description: `Restored ${healAmount} HP` });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not use potion", variant: "destructive" });
    },
  });

  const checkCollision = useCallback(() => {
    if (!battleActiveRef.current) return;
    const pos = enemyPosRef.current;
    if (pos.y > 55) {
      enemyHitCountRef.current += 1;
      const hitCount = enemyHitCountRef.current;
      const isCrit = hitCount > 0 && hitCount % 6 === 0;

      let dmg: number;
      if (isCrit) {
        dmg = Math.max(1, petStatsRef.current.atk + 100 - petStatsRef.current.def);
      } else {
        const rawDmg = enemyStatsRef.current.atk - Math.floor(petStatsRef.current.def * 0.1);
        dmg = Math.max(1, rawDmg + Math.floor(Math.random() * 10) - 3);
      }

      petHpRef.current = Math.max(0, petHpRef.current - dmg);
      setPetHp(petHpRef.current);
      setPetHit(true);
      setShakeScreen(true);
      setTimeout(() => { setPetHit(false); setShakeScreen(false); }, isCrit ? 500 : 300);

      const newDmg: DamageNumber = {
        id: dmgIdRef.current++,
        x: 50 + (Math.random() * 20 - 10),
        y: 75,
        value: dmg,
        isCrit,
      };
      setDamageNumbers(prev => [...prev, newDmg]);
      setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== newDmg.id)), isCrit ? 1500 : 1000);

      enemyPosRef.current = { ...pos, vy: -Math.abs(pos.vy) * 0.9, vx: pos.vx * 0.7 };
      setEnemyPos({ ...enemyPosRef.current });

      if (petHpRef.current <= 0) {
        battleActiveRef.current = false;
        setPhase("defeat");
      }
    }
  }, []);

  useEffect(() => {
    if (phase !== "battle") return;

    const animate = () => {
      if (!battleActiveRef.current) return;

      const diff = enemyDifficultyRef.current;
      const pos = { ...enemyPosRef.current };
      const speed = 0.4 + diff * 0.5;
      pos.x += pos.vx * speed;
      pos.y += pos.vy * speed;

      if (pos.x < 10 || pos.x > 90) {
        pos.vx = -pos.vx * (0.8 + Math.random() * 0.15);
        pos.x = Math.max(10, Math.min(90, pos.x));
        pos.vy += (Math.random() - 0.5) * 0.3;
      }
      if (pos.y < 5 || pos.y > 60) {
        pos.vy = -pos.vy * (0.8 + Math.random() * 0.15);
        pos.y = Math.max(5, Math.min(60, pos.y));
        pos.vx += (Math.random() - 0.5) * 0.3;
      }

      const now = Date.now();
      const attackInterval = 6000 - diff * 3000;
      if (now - lastEnemyAttackRef.current > attackInterval) {
        lastEnemyAttackRef.current = now;
        const petY = 70;
        const petX = 50;
        const dx = petX - pos.x;
        const dy = petY - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          const lungeSpeed = 1.5 + diff * 1.5;
          pos.vx = (dx / dist) * lungeSpeed;
          pos.vy = (dy / dist) * lungeSpeed;
        }
      }

      const maxSpeed = 1.5 + diff * 2;
      const spd = Math.sqrt(pos.vx * pos.vx + pos.vy * pos.vy);
      if (spd > maxSpeed) {
        pos.vx = (pos.vx / spd) * maxSpeed;
        pos.vy = (pos.vy / spd) * maxSpeed;
      }

      enemyPosRef.current = pos;
      setEnemyPos({ ...pos });

      checkCollision();
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, checkCollision]);

  // Returns distance from point P to segment AB
  const segmentPointDist = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  const getArenaPos = (clientX: number, clientY: number) => {
    const rect = arenaRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  // Per-segment hit check called in real-time during finger drag
  const checkSegmentHit = useCallback((ax: number, ay: number, bx: number, by: number) => {
    if (!battleActiveRef.current || !enemy) return;

    // Skip if this enemy was already hit during this swipe
    if (hitEnemiesRef.current.has(enemy.enemyId)) return;

    // Minimum swipe path before any hit can register (prevents accidental taps)
    const totalPathLen = swipePathRef.current.reduce((acc, p, i) => {
      if (i === 0) return 0;
      const prev = swipePathRef.current[i - 1];
      return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
    }, 0);
    if (totalPathLen < 5) return;

    const ePos = enemyPosRef.current;
    const dist = segmentPointDist(ax, ay, bx, by, ePos.x, ePos.y);
    const hitRadius = enemy.isBoss ? 22 : 16;
    if (dist >= hitRadius) return;

    // Register hit — enemy can only be struck once per swipe
    hitEnemiesRef.current.add(enemy.enemyId);

    const now = Date.now();
    let combo = comboCount;
    if (now - lastHitTime < 1400) combo += 1; else combo = 1;
    setComboCount(combo);
    setLastHitTime(now);

    const comboMult = 1 + Math.min(combo * 0.1, 0.5);
    const isCrit = Math.random() < 0.15;
    const critMult = isCrit ? 1.8 : 1;
    const rawDmg = petStatsRef.current.atk - Math.floor(enemyStatsRef.current.def * 0.3);
    const dmg = Math.max(1, Math.floor((rawDmg + Math.floor(Math.random() * 8) - 4) * comboMult * critMult));

    enemyHpRef.current = Math.max(0, enemyHpRef.current - dmg);
    setEnemyHp(enemyHpRef.current);
    setEnemyHit(true);
    setShakeScreen(true);
    setTimeout(() => { setEnemyHit(false); setShakeScreen(false); }, 200);

    // Slash mark at enemy position
    const markId = slashIdRef.current++;
    const slashMark: SlashEffect = { id: markId, x: ePos.x, y: ePos.y };
    setSlashEffects(prev => [...prev, slashMark]);
    setTimeout(() => setSlashEffects(prev => prev.filter(s => s.id !== markId)), 500);

    // Spark burst — 8 particles radiating outward from hit point
    const sparkColor = isCrit ? "#fbbf24" : accent;
    const newSparks: SparkParticle[] = Array.from({ length: 10 }, (_, i) => {
      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.8 + Math.random() * 2.8;
      return {
        id: slashIdRef.current++,
        x: ePos.x,
        y: ePos.y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        color: sparkColor,
      };
    });
    setSparkParticles(prev => [...prev, ...newSparks]);
    const sparkIds = new Set(newSparks.map(s => s.id));
    setTimeout(() => setSparkParticles(prev => prev.filter(s => !sparkIds.has(s.id))), 480);

    // Knockback in the slash direction
    const sdx = bx - ax, sdy = by - ay;
    const sLen = Math.hypot(sdx, sdy) || 1;
    enemyPosRef.current = {
      ...ePos,
      vx: (sdx / sLen) * 3 + (Math.random() - 0.5),
      vy: (sdy / sLen) * 3 + (Math.random() - 0.5),
    };

    // Damage number
    const dmgNum: DamageNumber = {
      id: dmgIdRef.current++,
      x: ePos.x + (Math.random() * 10 - 5),
      y: ePos.y - 5,
      value: dmg,
      isCrit,
    };
    setDamageNumbers(prev => [...prev, dmgNum]);
    setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== dmgNum.id)), 1000);

    if (enemyHpRef.current <= 0) {
      battleActiveRef.current = false;
      defeatMutation.mutate({ enemyId: enemy.enemyId, enemyLevel: enemy.level });
      const hasMore = waveIndex + 1 < allEnemies.length;
      setPhase(hasMore ? "waveComplete" : "victory");
    }
  }, [enemy, comboCount, lastHitTime, defeatMutation, waveIndex, allEnemies.length, accent]);

  const handleSlashStart = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pos = getArenaPos(e.clientX, e.clientY);
    swipePathRef.current = [pos];
    lastSwipePointRef.current = pos;
    hitEnemiesRef.current = new Set();
    isSlashingRef.current = true;
    setTrailFading(false);
    setSlashTrail([pos]);
  }, []);

  const handleSlashMove = useCallback((e: React.PointerEvent) => {
    if (!isSlashingRef.current || !lastSwipePointRef.current) return;
    const pos = getArenaPos(e.clientX, e.clientY);
    const last = lastSwipePointRef.current;
    const dist = Math.hypot(pos.x - last.x, pos.y - last.y);

    // Throttle: only add a point when finger has moved enough (prevents jitter noise)
    if (dist < 0.6) return;

    swipePathRef.current.push(pos);
    lastSwipePointRef.current = pos;
    setSlashTrail([...swipePathRef.current]);

    // Real-time hit detection on this new segment
    const path = swipePathRef.current;
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      checkSegmentHit(prev.x, prev.y, pos.x, pos.y);
    }
  }, [checkSegmentHit]);

  const handleSlashEnd = useCallback((_e: React.PointerEvent) => {
    if (!isSlashingRef.current) return;
    isSlashingRef.current = false;
    // Fade then clear
    if (swipePathRef.current.length >= 2) {
      setTrailFading(true);
    }
    setTimeout(() => {
      setSlashTrail([]);
      setTrailFading(false);
    }, 320);
    swipePathRef.current = [];
    lastSwipePointRef.current = null;
  }, []);

  const handleAdvance = useCallback(() => {
    const nextIdx = waveIndex + 1;
    if (nextIdx < allEnemies.length) {
      startWave(allEnemies[nextIdx], nextIdx);
    }
  }, [waveIndex, allEnemies, startWave]);

  const handleReturnToWorld = useCallback(() => {
    onBattleEnd();
    onClose();
  }, [onBattleEnd, onClose]);

  const hpBarColor = (current: number, max: number) => {
    const pct = max > 0 ? current / max : 0;
    if (pct > 0.5) return "#22c55e";
    if (pct > 0.25) return "#eab308";
    return "#ef4444";
  };

  if (phase === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
        <div className="flex flex-col items-center gap-4">
          <Swords className="w-12 h-12 animate-pulse" style={{ color: accent }} />
          <p className="text-white text-lg font-bold animate-pulse">Preparing battle...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
    >
      <style>{`
        @keyframes slashMarkAnim {
          0%   { transform: scale(0.4) rotate(-20deg); opacity: 1; }
          50%  { transform: scale(1.3) rotate(8deg);  opacity: 0.9; }
          100% { transform: scale(1.8) rotate(15deg); opacity: 0; }
        }
        @keyframes slashRingAnim {
          0%   { transform: scale(0.5); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes sparkFly {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          60%  { opacity: 0.8; }
          100% { transform: translate(var(--spark-dx), var(--spark-dy)) scale(0.2); opacity: 0; }
        }
        @keyframes dmgFloat {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-60px) scale(1.3); opacity: 0; }
        }
        @keyframes enemyBounce {
          0%, 100% { transform: scaleY(1) scaleX(1); }
          50% { transform: scaleY(0.95) scaleX(1.05); }
        }
        @keyframes introSlide {
          0% { transform: translateY(-100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes petIntro {
          0% { transform: translateY(100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes victoryPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes screenShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        @keyframes hitFlash {
          0% { filter: brightness(1); transform: translateY(0px); }
          20% { filter: brightness(2.5) saturate(0); transform: translateY(4px); }
          40% { filter: brightness(1.8) saturate(0.5); transform: translateY(-3px); }
          60% { filter: brightness(1.3); transform: translateY(2px); }
          100% { filter: brightness(1); transform: translateY(0px); }
        }
        @keyframes petHitBounce {
          0%   { transform: translateX(-50%) translateY(0px) scaleX(1) scaleY(1); filter: brightness(1); }
          15%  { transform: translateX(-50%) translateY(-14px) scaleX(0.92) scaleY(1.1); filter: brightness(2.2) saturate(0.2); }
          35%  { transform: translateX(-50%) translateY(4px) scaleX(1.08) scaleY(0.92); filter: brightness(1.4); }
          55%  { transform: translateX(-50%) translateY(-6px) scaleX(0.96) scaleY(1.05); filter: brightness(1.1); }
          75%  { transform: translateX(-50%) translateY(2px) scaleX(1.02) scaleY(0.98); filter: brightness(1); }
          100% { transform: translateX(-50%) translateY(0px) scaleX(1) scaleY(1); filter: brightness(1); }
        }
        @keyframes comboText {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rewardSlide {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes healPulse {
          0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
          70% { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
      `}</style>

      <div
        ref={arenaRef}
        className="relative w-full h-full"
        style={{ animation: shakeScreen ? "screenShake 0.15s ease-in-out" : undefined }}
        onPointerDown={phase === "battle" ? handleSlashStart : undefined}
        onPointerMove={phase === "battle" ? handleSlashMove : undefined}
        onPointerUp={phase === "battle" ? handleSlashEnd : undefined}
        onPointerCancel={phase === "battle" ? handleSlashEnd : undefined}
      >
        <div className="absolute inset-0">
          {bgUrl ? (
            <img src={bgUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
        </div>

        {phase === "intro" && enemy && pet && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-30">
            <div style={{ animation: "introSlide 0.8s ease-out" }} className="flex flex-col items-center">
              {enemy.imageUrl && (
                <img
                  src={enemy.imageUrl}
                  alt={enemy.name}
                  style={{ width: enemy.isBoss ? 160 : 112, height: enemy.isBoss ? 160 : 112 }}
                  className={`object-contain ${enemy.isBoss ? "drop-shadow-[0_0_24px_rgba(255,0,0,0.9)]" : "drop-shadow-lg"}`}
                />
              )}
              <div className="mt-2 px-4 py-2 bg-black/70 rounded-lg border border-red-500/50">
                <span className="text-red-400 font-bold text-lg">{enemy.name}</span>
                {enemy.isBoss && <span className="ml-2 text-xs bg-red-600 text-white px-2 py-0.5 rounded-full">BOSS</span>}
                <span className="text-gray-400 text-sm ml-2">Lv.{enemy.level}</span>
              </div>
              {allEnemies.length > 1 && (
                <div className="mt-1 text-gray-500 text-xs">Wave {waveIndex + 1} of {allEnemies.length}</div>
              )}
            </div>
            <div className="text-white text-2xl font-bold animate-pulse">VS</div>
            <div style={{ animation: "petIntro 0.8s ease-out 0.3s both" }} className="flex flex-col items-center">
              <div className="w-28 flex items-center justify-center" style={{ aspectRatio: "1/1" }}>
                {pet.petTemplateId ? (
                  <PetAnimator petTemplateId={pet.petTemplateId} mode="idle" view="front" size={200} className="w-full h-full" style={{ aspectRatio: "1/1" }} />
                ) : pet.imageUrl ? (
                  <img src={pet.imageUrl} alt={pet.name} className="w-full object-contain drop-shadow-lg" style={{ maxHeight: "112px" }} />
                ) : (
                  <span className="text-5xl">🐾</span>
                )}
              </div>
              <div className="mt-2 px-4 py-2 bg-black/70 rounded-lg" style={{ borderColor: accent + "80", borderWidth: 1 }}>
                <span className="font-bold text-lg" style={{ color: accent }}>{pet.name}</span>
                <span className="text-gray-400 text-sm ml-2">Lv.{pet.level}</span>
              </div>
            </div>
          </div>
        )}

        {(phase === "battle" || phase === "victory" || phase === "waveComplete" || phase === "defeat") && enemy && pet && (
          <>
            <div className="absolute top-0 left-0 right-0 z-20 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-1">
                    {enemy.isBoss && <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">BOSS</span>}
                    <span className="text-white text-sm font-bold drop-shadow-lg truncate">{enemy.name}</span>
                    <span className="text-gray-300 text-xs">Lv.{enemy.level}</span>
                    {allEnemies.length > 1 && <span className="text-gray-500 text-[10px]">({waveIndex + 1}/{allEnemies.length})</span>}
                  </div>
                  <div className="h-3 bg-black/60 rounded-full overflow-hidden border border-white/20">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.max(0, (enemyHp / enemyMaxHp) * 100)}%`,
                        backgroundColor: hpBarColor(enemyHp, enemyMaxHp),
                        boxShadow: `0 0 8px ${hpBarColor(enemyHp, enemyMaxHp)}80`,
                      }}
                    />
                  </div>
                  <div className="text-gray-300 text-[10px] mt-0.5">{enemyHp} / {enemyMaxHp}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowTutorial(true)}
                    className="p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                    data-testid="button-battle-help"
                    style={{ border: `1px solid ${accent}40`, color: `${accent}cc` }}
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleReturnToWorld}
                    className="p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                    data-testid="button-flee-battle"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-20 p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-sm font-bold drop-shadow-lg truncate" style={{ color: accent }}>{pet.name}</span>
                    <span className="text-gray-300 text-xs">Lv.{pet.level}</span>
                  </div>
                  <div className="h-3 bg-black/60 rounded-full overflow-hidden border border-white/20">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.max(0, (petHp / petMaxHp) * 100)}%`,
                        backgroundColor: hpBarColor(petHp, petMaxHp),
                        boxShadow: `0 0 8px ${hpBarColor(petHp, petMaxHp)}80`,
                      }}
                    />
                  </div>
                  <div className="text-gray-300 text-[10px] mt-0.5">{petHp} / {petMaxHp}</div>
                </div>
              </div>
              {comboCount > 1 && phase === "battle" && (
                <div
                  className="absolute -top-8 right-4 text-yellow-400 font-black text-lg drop-shadow-lg"
                  style={{ animation: "comboText 0.3s ease-out" }}
                  data-testid="text-combo-count"
                >
                  {comboCount}x COMBO!
                </div>
              )}
            </div>

            {phase === "battle" && (
              <div
                className="absolute z-10 transition-none"
                style={{
                  left: `${enemyPos.x}%`,
                  top: `${enemyPos.y}%`,
                  transform: `translate(-50%, -50%)`,
                  animation: enemyHit
                    ? "hitFlash 0.2s ease-in-out"
                    : "enemyBounce 0.6s ease-in-out infinite",
                  pointerEvents: "none",
                }}
              >
                {enemy.imageUrl ? (
                  <img
                    src={enemy.imageUrl}
                    alt={enemy.name}
                    style={{ width: enemy.isBoss ? 148 : 80, height: enemy.isBoss ? 148 : 80 }}
                    className={`object-contain ${enemy.isBoss
                      ? "drop-shadow-[0_0_24px_rgba(255,0,0,0.9)]"
                      : "drop-shadow-[0_0_12px_rgba(255,0,0,0.5)]"}`}
                  />
                ) : (
                  <div
                    className={`${enemy.isBoss ? "w-36 h-36" : "w-20 h-20"} bg-red-900/50 rounded-full flex items-center justify-center border-2 border-red-500`}
                    style={enemy.isBoss ? { boxShadow: "0 0 32px rgba(255,0,0,0.7)" } : {}}
                  >
                    <Swords className={enemy.isBoss ? "w-14 h-14 text-red-400" : "w-8 h-8 text-red-400"} />
                  </div>
                )}
                {enemy.isBoss && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-widest text-red-400 whitespace-nowrap"
                    style={{ textShadow: "0 0 8px rgba(255,0,0,0.8)" }}>
                    ⚠ BOSS ⚠
                  </div>
                )}
              </div>
            )}

            <div
              className="absolute bottom-16 left-1/2 z-10"
              style={{
                transform: petHit ? undefined : "translateX(-50%)",
                animation: petHit ? "petHitBounce 0.4s ease-out" : undefined,
              }}
            >
              {pet.petTemplateId ? (
                <PetAnimator
                  petTemplateId={pet.petTemplateId}
                  mode="idle"
                  view="front"
                  size={160}
                />
              ) : pet.imageUrl ? (
                <img
                  src={pet.imageUrl}
                  alt={pet.name}
                  className="object-contain drop-shadow-lg"
                  style={{ width: 160, height: 160 }}
                />
              ) : (
                <span className="text-6xl">🐾</span>
              )}
            </div>

            {phase === "battle" && (
              <div className="absolute inset-0 z-15 pointer-events-none">
                <div className="absolute bottom-36 left-1/2 -translate-x-1/2 text-white/30 text-xs font-medium animate-pulse tracking-wider">
                  SLASH across the enemy!
                </div>
              </div>
            )}
          </>
        )}

        {/* Finger-traced slash trail — smooth Catmull-Rom curve through all drag points */}
        {slashTrail.length >= 2 && (
          <svg
            className="absolute inset-0 pointer-events-none z-30"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ width: "100%", height: "100%", overflow: "visible" }}
          >
            <defs>
              <filter id="slashGlow">
                <feGaussianBlur stdDeviation="1.8" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* Wide glow halo */}
            <path
              d={buildSlashPath(slashTrail)}
              stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
              fill="none"
              opacity={trailFading ? 0 : 0.35}
              filter="url(#slashGlow)"
              style={{ transition: trailFading ? "opacity 0.32s ease-out" : undefined }}
            />
            {/* Core colored blade */}
            <path
              d={buildSlashPath(slashTrail)}
              stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              fill="none"
              opacity={trailFading ? 0 : 0.95}
              style={{ transition: trailFading ? "opacity 0.32s ease-out" : undefined }}
            />
            {/* White edge highlight */}
            <path
              d={buildSlashPath(slashTrail)}
              stroke="white" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round"
              fill="none"
              opacity={trailFading ? 0 : 0.6}
              style={{ transition: trailFading ? "opacity 0.32s ease-out" : undefined }}
            />
          </svg>
        )}

        {/* Spark particles on hit */}
        {sparkParticles.map(spark => (
          <div
            key={spark.id}
            className="absolute pointer-events-none rounded-full z-35"
            style={{
              left: `${spark.x}%`,
              top: `${spark.y}%`,
              width: 6,
              height: 6,
              marginLeft: -3,
              marginTop: -3,
              background: spark.color,
              boxShadow: `0 0 8px ${spark.color}, 0 0 3px white`,
              animation: "sparkFly 0.45s ease-out forwards",
              ["--spark-dx" as any]: `${spark.dx * 12}px`,
              ["--spark-dy" as any]: `${spark.dy * 12}px`,
            }}
          />
        ))}

        {/* Slash hit marks on enemy */}
        {slashEffects.map(slash => (
          <div
            key={slash.id}
            className="absolute z-30 pointer-events-none"
            style={{ left: `${slash.x}%`, top: `${slash.y}%`, transform: "translate(-50%, -50%)" }}
          >
            {/* X slash marks */}
            <div style={{
              animation: "slashMarkAnim 0.45s ease-out forwards",
              fontSize: 38,
              lineHeight: 1,
              color: accent,
              textShadow: `0 0 18px ${accent}, 0 0 8px white`,
              fontWeight: 900,
            }}>✕</div>
            {/* Expanding ring */}
            <div className="absolute inset-0 w-14 h-14 -m-3 rounded-full" style={{
              animation: "slashRingAnim 0.4s ease-out forwards",
              border: `2px solid ${accent}`,
              boxShadow: `0 0 12px ${accent}`,
            }} />
          </div>
        ))}

        {damageNumbers.map(dmg => (
          <div
            key={dmg.id}
            className="absolute z-40 pointer-events-none font-black"
            style={{
              left: `${dmg.x}%`,
              top: `${dmg.y}%`,
              transform: "translate(-50%, -50%)",
              animation: "dmgFloat 0.8s ease-out forwards",
              fontSize: dmg.isCrit ? "28px" : dmg.isHeal ? "24px" : "22px",
              color: dmg.isHeal ? "#22c55e" : dmg.isCrit ? "#fbbf24" : "#ef4444",
              textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5)",
            }}
            data-testid="text-damage-number"
          >
            {dmg.isCrit && "💥"}
            {dmg.isHeal && "+"}
            {dmg.value}
          </div>
        ))}

        {phase === "waveComplete" && enemy && pet && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
            <div
              className="bg-gray-900/95 rounded-2xl border p-5 mx-4 max-w-sm w-full max-h-[85vh] overflow-y-auto"
              style={{ borderColor: accent + "60" }}
              data-testid="modal-wave-complete"
            >
              <div className="text-center">
                <div className="text-xl font-black mb-1" style={{ color: accent }}>Enemy Defeated!</div>
                <div className="text-gray-400 text-sm mb-3">{enemy.name} has been vanquished!</div>

                {victoryData && !victoryData.error && (
                  <div className="space-y-2 mb-4">
                    {victoryData.lvlPointsEarned > 0 && (
                      <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm">
                        <Star className="w-4 h-4" />
                        <span className="font-bold">+{victoryData.lvlPointsEarned} Level Points</span>
                      </div>
                    )}
                    {victoryData.levelsGained > 0 && (
                      <div className="text-green-400 font-bold animate-pulse">Level Up! → Lv.{victoryData.newLevel}</div>
                    )}
                    {victoryData.coinsAwarded > 0 && (
                      <div className="flex items-center justify-center gap-2 text-amber-400 text-sm">
                        <Coins className="w-4 h-4" />
                        <span className="font-bold">+{victoryData.coinsAwarded} Coins</span>
                      </div>
                    )}
                    {victoryData.droppedItems?.length > 0 && (
                      <div className="space-y-1">
                        {victoryData.droppedItems.map((item: any, i: number) => (
                          <div key={i} className="flex items-center justify-center gap-2">
                            {item.imageUrl && <img src={item.imageUrl} alt="" className="w-5 h-5 object-contain" />}
                            <span className="text-white text-xs font-medium">{item.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-black/40 rounded-xl p-3 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-xs">{pet.name}'s HP</span>
                    <span className="text-xs font-bold" style={{ color: hpBarColor(petHp, petMaxHp) }}>{petHp} / {petMaxHp}</span>
                  </div>
                  <div className="h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(petHp / petMaxHp) * 100}%`, backgroundColor: hpBarColor(petHp, petMaxHp) }} />
                  </div>

                  {potions.length > 0 && (
                    <div className="mt-3">
                      <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1.5">Use Potion</div>
                      <div className="space-y-1.5">
                        {potions.map((potion) => (
                          <button
                            key={potion.inventoryId}
                            data-testid={`button-use-potion-${potion.inventoryId}`}
                            disabled={potionMutation.isPending || petHp >= petMaxHp}
                            onClick={() => potionMutation.mutate({ inventoryId: potion.inventoryId, petInventoryId: pet.inventoryId })}
                            className="w-full flex items-center gap-2 p-2 rounded-lg bg-green-900/30 border border-green-700/40 hover:bg-green-800/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ animation: "healPulse 2s infinite" }}
                          >
                            {potion.imageUrl ? (
                              <img src={potion.imageUrl} alt="" className="w-7 h-7 object-contain" />
                            ) : (
                              <Heart className="w-5 h-5 text-green-400" />
                            )}
                            <div className="flex-1 text-left">
                              <div className="text-white text-xs font-medium">{potion.name}</div>
                              <div className="text-green-400 text-[10px]">+{potion.healthRestored} HP</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-gray-500 text-xs mb-3">
                  {waveIndex + 1 < allEnemies.length
                    ? `${allEnemies.length - waveIndex - 1} more ${allEnemies.length - waveIndex - 1 === 1 ? "enemy" : "enemies"} ahead...`
                    : "All enemies defeated!"}
                </div>

                <div className="flex gap-3">
                  <button
                    data-testid="button-return-to-world"
                    onClick={handleReturnToWorld}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm text-gray-300 bg-gray-700/50 border border-gray-600/50 hover:bg-gray-600/50 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Return
                  </button>
                  {waveIndex + 1 < allEnemies.length && (
                    <button
                      data-testid="button-advance-wave"
                      onClick={handleAdvance}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: accent }}
                    >
                      Advance
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {phase === "victory" && enemy && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
            <div
              className="bg-gray-900/95 rounded-2xl border p-6 mx-6 max-w-sm w-full"
              style={{ borderColor: accent + "60", animation: "victoryPulse 2s ease-in-out infinite" }}
              data-testid="modal-victory"
            >
              <div className="text-center">
                <div className="text-3xl font-black mb-1" style={{ color: accent }}>VICTORY!</div>
                <div className="text-gray-400 text-sm mb-4">
                  {allEnemies.length > 1 ? `All ${allEnemies.length} enemies defeated!` : `You defeated ${enemy.name}!`}
                </div>

                {(victoryData || totalRewards.lvlPoints > 0) ? (
                  <div className="space-y-3">
                    {(totalRewards.lvlPoints > 0 || victoryData?.lvlPointsEarned > 0) && (
                      <div className="flex items-center justify-center gap-2 text-yellow-400" style={{ animation: "rewardSlide 0.5s ease-out" }}>
                        <Star className="w-5 h-5" />
                        <span className="font-bold">+{allEnemies.length > 1 ? totalRewards.lvlPoints : victoryData?.lvlPointsEarned} Level Points</span>
                      </div>
                    )}
                    {(totalRewards.levelsGained > 0 || victoryData?.levelsGained > 0) && (
                      <div className="text-green-400 font-bold text-lg animate-pulse" style={{ animation: "rewardSlide 0.6s ease-out" }}>
                        Level Up! → Lv.{victoryData?.newLevel}
                      </div>
                    )}
                    {(totalRewards.coins > 0 || victoryData?.coinsAwarded > 0) && (
                      <div className="flex items-center justify-center gap-2 text-amber-400" style={{ animation: "rewardSlide 0.7s ease-out" }}>
                        <Coins className="w-5 h-5" />
                        <span className="font-bold">+{allEnemies.length > 1 ? totalRewards.coins : victoryData?.coinsAwarded} Coins</span>
                      </div>
                    )}
                    {((allEnemies.length > 1 ? totalRewards.items : victoryData?.droppedItems) || []).length > 0 && (
                      <div className="space-y-1" style={{ animation: "rewardSlide 0.8s ease-out" }}>
                        <div className="text-gray-400 text-xs uppercase tracking-wide">Items Found</div>
                        {(allEnemies.length > 1 ? totalRewards.items : victoryData?.droppedItems || []).map((item: any, i: number) => (
                          <div key={i} className="flex items-center justify-center gap-2">
                            {item.imageUrl && <img src={item.imageUrl} alt="" className="w-6 h-6 object-contain" />}
                            <span className="text-white text-sm font-medium">{item.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : defeatMutation.isError ? (
                  <div className="text-red-400 text-sm">Failed to process rewards. Your victory still counts!</div>
                ) : (
                  <div className="text-gray-400 animate-pulse">Calculating rewards...</div>
                )}

                <button
                  onClick={handleReturnToWorld}
                  className="mt-6 w-full py-3 rounded-xl font-bold text-white transition-all hover:scale-105 active:scale-95"
                  style={{ backgroundColor: accent }}
                  data-testid="button-battle-continue"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Battle tutorial modal */}
        {showTutorial && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }}
          >
            <div
              className="flex flex-col gap-5 rounded-2xl px-7 py-7 mx-5 w-full"
              style={{
                background: "linear-gradient(145deg, rgba(8,4,18,0.98) 0%, rgba(20,6,6,0.98) 100%)",
                border: `1.5px solid ${accent}45`,
                boxShadow: `0 8px 48px rgba(0,0,0,0.85), 0 0 32px ${accent}12`,
                maxWidth: 340,
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${accent}22`, border: `1.5px solid ${accent}55` }}
                >
                  <Swords className="w-5 h-5" style={{ color: accent }} />
                </div>
                <p className="font-fantasy text-lg tracking-widest font-semibold" style={{ color: accent, textShadow: `0 0 14px ${accent}55` }}>
                  How to Battle
                </p>
              </div>

              {/* Steps */}
              <div className="flex flex-col gap-4">
                {[
                  {
                    num: "1",
                    title: "Swipe to Slash",
                    desc: "Drag your finger across the screen — your blade follows the exact path. Short taps do nothing, so commit to a full swipe.",
                  },
                  {
                    num: "2",
                    title: "Cut Through the Enemy",
                    desc: "Your slash hits when it crosses the enemy. One clean swipe lands one hit — the blade doesn't multi-hit on the same pass.",
                  },
                  {
                    num: "3",
                    title: "Build Combos",
                    desc: "Hit the enemy within 1.4 seconds of your last strike to stack a combo. Higher combos deal bonus damage.",
                  },
                  {
                    num: "4",
                    title: "Dodge & Survive",
                    desc: "When the enemy lunges at your pet, it takes damage. Watch the HP bars — if your pet falls, the battle is lost.",
                  },
                ].map(({ num, title, desc }) => (
                  <div key={num} className="flex gap-3 items-start">
                    <div
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-fantasy mt-0.5"
                      style={{ background: `${accent}22`, border: `1px solid ${accent}55`, color: accent }}
                    >
                      {num}
                    </div>
                    <div>
                      <p className="font-fantasy text-sm font-semibold tracking-wide mb-0.5" style={{ color: accent }}>{title}</p>
                      <p className="font-fantasy text-xs tracking-wide leading-relaxed" style={{ color: `${accent}99` }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Close button */}
              <button
                data-testid="button-battle-tutorial-close"
                onClick={() => {
                  localStorage.setItem("battleTutorialSeen", "1");
                  setShowTutorial(false);
                }}
                className="font-fantasy text-sm tracking-[0.15em] px-6 py-2.5 rounded-xl transition-transform active:scale-95 self-center mt-1"
                style={{
                  background: `linear-gradient(135deg, rgba(10,4,20,0.9) 0%, rgba(24,8,8,0.9) 100%)`,
                  border: `1.5px solid ${accent}60`,
                  color: accent,
                  boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 16px ${accent}20`,
                }}
              >
                Ready — let's fight!
              </button>
            </div>
          </div>
        )}

        {phase === "defeat" && pet && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70">
            <div
              className="bg-gray-900/95 rounded-2xl border border-red-500/40 p-6 mx-6 max-w-sm w-full"
              data-testid="modal-defeat"
            >
              <div className="text-center">
                <div className="text-3xl font-black text-red-500 mb-1">DEFEATED</div>
                <div className="text-gray-400 text-sm mb-2">{pet.name} couldn't hold on...</div>

                {totalRewards.lvlPoints > 0 || totalRewards.coins > 0 || totalRewards.items.length > 0 ? (
                  <div className="bg-black/30 rounded-lg p-3 mb-4 space-y-1">
                    <div className="text-gray-500 text-[10px] uppercase tracking-wide">Rewards earned before defeat</div>
                    {totalRewards.lvlPoints > 0 && (
                      <div className="flex items-center justify-center gap-1.5 text-yellow-400 text-sm">
                        <Star className="w-3.5 h-3.5" />
                        <span>+{totalRewards.lvlPoints} Level Points</span>
                      </div>
                    )}
                    {totalRewards.coins > 0 && (
                      <div className="flex items-center justify-center gap-1.5 text-amber-400 text-sm">
                        <Coins className="w-3.5 h-3.5" />
                        <span>+{totalRewards.coins} Coins</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-500 text-xs mb-4">No rewards earned this time.</div>
                )}

                <button
                  onClick={handleReturnToWorld}
                  className="w-full py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-all hover:scale-105 active:scale-95"
                  data-testid="button-battle-retreat"
                >
                  Retreat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
