import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Swords, Star, Coins, X, ChevronRight, ArrowLeft, Heart } from "lucide-react";
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
  backImageUrl: string | null;
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

  const animFrameRef = useRef<number>(0);
  const arenaRef = useRef<HTMLDivElement>(null);
  const slashIdRef = useRef(0);
  const dmgIdRef = useRef(0);
  const battleActiveRef = useRef(false);
  const enemyPosRef = useRef(enemyPos);
  const enemyHpRef = useRef(0);
  const petHpRef = useRef(0);
  const lastEnemyAttackRef = useRef(0);
  const petStatsRef = useRef({ atk: 50, def: 50 });
  const enemyStatsRef = useRef({ atk: 20, def: 10 });
  const enemyDifficultyRef = useRef(0.5);

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
      const rawDmg = enemyStatsRef.current.atk - Math.floor(petStatsRef.current.def * 0.3);
      const dmg = Math.max(1, rawDmg + Math.floor(Math.random() * 6) - 3);
      petHpRef.current = Math.max(0, petHpRef.current - dmg);
      setPetHp(petHpRef.current);
      setPetHit(true);
      setShakeScreen(true);
      setTimeout(() => { setPetHit(false); setShakeScreen(false); }, 300);

      const newDmg: DamageNumber = {
        id: dmgIdRef.current++,
        x: 50 + (Math.random() * 20 - 10),
        y: 75,
        value: dmg,
      };
      setDamageNumbers(prev => [...prev, newDmg]);
      setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== newDmg.id)), 1000);

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

  const handleAttack = useCallback((clientX: number, clientY: number) => {
    if (!battleActiveRef.current || !arenaRef.current || !enemy) return;

    const rect = arenaRef.current.getBoundingClientRect();
    const tapX = ((clientX - rect.left) / rect.width) * 100;
    const tapY = ((clientY - rect.top) / rect.height) * 100;

    const slash: SlashEffect = { id: slashIdRef.current++, x: tapX, y: tapY };
    setSlashEffects(prev => [...prev, slash]);
    setTimeout(() => setSlashEffects(prev => prev.filter(s => s.id !== slash.id)), 500);

    const ePos = enemyPosRef.current;
    const dx = tapX - ePos.x;
    const dy = tapY - ePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hitRadius = 18;

    if (dist < hitRadius) {
      const now = Date.now();
      let combo = comboCount;
      if (now - lastHitTime < 1200) {
        combo += 1;
      } else {
        combo = 1;
      }
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
      setTimeout(() => setEnemyHit(false), 200);

      const knockX = (dx / dist) * -2;
      const knockY = (dy / dist) * -2;
      enemyPosRef.current = {
        ...enemyPosRef.current,
        vx: knockX + (Math.random() - 0.5),
        vy: knockY + (Math.random() - 0.5),
      };

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
    }
  }, [enemy, comboCount, lastHitTime, defeatMutation, waveIndex, allEnemies.length]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    handleAttack(e.clientX, e.clientY);
  }, [handleAttack]);

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
        @keyframes tapHitAnim {
          0% { transform: scale(0.3); opacity: 1; }
          40% { transform: scale(1.2); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes tapRing {
          0% { transform: scale(0.5); opacity: 0.8; border-width: 3px; }
          100% { transform: scale(2); opacity: 0; border-width: 1px; }
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
        onPointerDown={phase === "battle" ? handlePointerDown : undefined}
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
                <img src={enemy.imageUrl} alt={enemy.name} className="w-28 h-28 object-contain drop-shadow-lg" />
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
              <div className="w-24 h-24 flex items-center justify-center">
                {pet.petTemplateId ? (
                  <PetAnimator petTemplateId={pet.petTemplateId} mode="idle" view="front" size={200} className="w-full h-full" />
                ) : pet.imageUrl ? (
                  <img src={pet.imageUrl} alt={pet.name} className="w-full h-full object-contain" />
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
                <button
                  onClick={handleReturnToWorld}
                  className="p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                  data-testid="button-flee-battle"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
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
                    className="w-20 h-20 object-contain drop-shadow-[0_0_12px_rgba(255,0,0,0.5)]"
                  />
                ) : (
                  <div className="w-20 h-20 bg-red-900/50 rounded-full flex items-center justify-center border-2 border-red-500">
                    <Swords className="w-8 h-8 text-red-400" />
                  </div>
                )}
              </div>
            )}

            <div
              className="absolute bottom-16 left-1/2 z-10"
              style={{
                transform: "translateX(-50%)",
                animation: petHit ? "hitFlash 0.35s ease-in-out" : undefined,
              }}
            >
              <div className="w-32 h-32 flex items-center justify-center">
                {pet.backImageUrl ? (
                  <img src={pet.backImageUrl} alt={pet.name} className="w-full h-full object-contain drop-shadow-lg" />
                ) : pet.petTemplateId ? (
                  <PetAnimator
                    petTemplateId={pet.petTemplateId}
                    mode="idle"
                    view="front"
                    size={300}
                    className="w-full h-full"
                  />
                ) : pet.imageUrl ? (
                  <img src={pet.imageUrl} alt={pet.name} className="w-full h-full object-contain drop-shadow-lg" />
                ) : (
                  <span className="text-6xl">🐾</span>
                )}
              </div>
            </div>

            {phase === "battle" && (
              <div className="absolute inset-0 z-15 pointer-events-none">
                <div className="absolute bottom-36 left-1/2 -translate-x-1/2 text-white/30 text-xs font-medium animate-pulse">
                  TAP to attack!
                </div>
              </div>
            )}
          </>
        )}

        {slashEffects.map(slash => (
          <div
            key={slash.id}
            className="absolute z-30 pointer-events-none"
            style={{
              left: `${slash.x}%`,
              top: `${slash.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              className="w-10 h-10 rounded-full"
              style={{
                animation: "tapHitAnim 0.35s ease-out forwards",
                background: `radial-gradient(circle, white 0%, ${accent} 40%, transparent 70%)`,
              }}
            />
            <div
              className="absolute inset-0 w-12 h-12 -m-1 rounded-full"
              style={{
                animation: "tapRing 0.4s ease-out forwards",
                border: `2px solid ${accent}`,
              }}
            />
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
