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
  specialSkill: string | null;
  skillDamagePercent: number | null;
}

export interface BattlePotionSlot {
  shopItemId: string;
  inventoryIds: string[];
  name: string;
  imageUrl: string | null;
  healthRestored: number | null;
  manaRestored: number | null;
}

interface BattleArenaProps {
  locationId: string;
  locationName: string;
  bgUrl: string | null;
  accent: string;
  onClose: () => void;
  onBattleEnd: () => void;
  battlePotionSlots?: BattlePotionSlot[];
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

interface BossOrb {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
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

export default function BattleArena({ locationId, locationName, bgUrl, accent, onClose, onBattleEnd, battlePotionSlots = [] }: BattleArenaProps) {
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

  // Pet dragging
  const [petPos, setPetPos] = useState({ x: 50, y: 76 });
  const petPosRef = useRef({ x: 50, y: 76 });
  const petDraggingRef = useRef(false);
  const [petHitParticles, setPetHitParticles] = useState<SparkParticle[]>([]);

  // Boss special attacks
  const [bossOrbs, setBossOrbs] = useState<BossOrb[]>([]);
  const bossOrbsRef = useRef<BossOrb[]>([]);
  const [bossEnlarged, setBossEnlarged] = useState(false);
  const [bossBurstActive, setBossBurstActive] = useState(false);
  const bossAttackModeRef = useRef<"rain" | "burst" | "focused">("rain");
  const nextBossAttackRef = useRef(0);
  const bossOrbIdRef = useRef(1000);
  const orbSpawnTimerRef = useRef(0);
  const orbSpawnEndRef = useRef(0);
  const bossOscTimeRef = useRef(0);
  const lastBossHitTimeRef = useRef(0);
  // Consecutive boss hits in the current hold gesture (for break-free mechanic)
  const consecutiveBossHitsRef = useRef(0);
  // Boss immune until this timestamp after breaking free
  const bossImmuneUntilRef = useRef(0);
  const [breakFreeEffect, setBreakFreeEffect] = useState(false);
  // Displayed streak count while wailing on the boss
  const [bossHitStreak, setBossHitStreak] = useState(0);

  // Mana & special skill
  const [mana, setMana] = useState(0);
  const manaRef = useRef(0);
  const manaTickRef = useRef(0);
  const [skillCooldown, setSkillCooldown] = useState(false);
  const [skillEffect, setSkillEffect] = useState<string | null>(null);
  const [poisonActive, setPoisonActive] = useState(false);
  const poisonTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_MANA = 100;
  const handleEnemyDeathRef = useRef<() => void>(() => {});

  // Battle potion slots (5 slots max, with consumable inventory IDs)
  const [activeSlots, setActiveSlots] = useState<(BattlePotionSlot & { remaining: string[] })[]>([]);
  const activeSlotsRef = useRef<(BattlePotionSlot & { remaining: string[] })[]>([]);

  // Track enemy max HP (for Poison % calculation)
  const enemyMaxHpRef = useRef(0);

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
  // Cooldown so enemy can't deal damage on every frame (prevents instant-kill on overlap)
  const lastCollisionDmgRef = useRef(0);

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
        petStatsRef.current = { atk: data.pet.atk, def: data.pet.def, maxHp: data.pet.hp };
        // Initialise battle potion slots from pre-battle loadout (filter null entries)
        const slots = battlePotionSlots
          .filter((s): s is BattlePotionSlot => s !== null && s !== undefined)
          .map(s => ({ ...s, remaining: [...s.inventoryIds] }));
        activeSlotsRef.current = slots;
        setActiveSlots(slots);
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
    enemyMaxHpRef.current = enc.hp;
    enemyStatsRef.current = { atk: enc.atk, def: enc.def };
    setVictoryData(null);
    setComboCount(0);
    setLastHitTime(0);
    setSlashEffects([]);
    setDamageNumbers([]);
    // Reset mana, skill state, and poison between waves
    manaRef.current = 0;
    setMana(0);
    setSkillCooldown(false);
    setSkillEffect(null);
    setPoisonActive(false);
    if (poisonTimerRef.current) { clearInterval(poisonTimerRef.current); poisonTimerRef.current = null; }

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
        // Reset pet position + boss state
        const initPet = { x: 50, y: 76 };
        petPosRef.current = initPet;
        setPetPos(initPet);
        petDraggingRef.current = false;
        bossAttackModeRef.current = "rain";
        nextBossAttackRef.current = 0;
        bossOscTimeRef.current = 0;
        bossOrbsRef.current = [];
        setBossOrbs([]);
        setBossEnlarged(false);
        setBossBurstActive(false);
        lastBossHitTimeRef.current = 0;
        lastCollisionDmgRef.current = 0;
        consecutiveBossHitsRef.current = 0;
        bossImmuneUntilRef.current = 0;
        setBossHitStreak(0);
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

  // Keep a stable ref to the "enemy just died" handler so skills can call it
  useEffect(() => {
    handleEnemyDeathRef.current = () => {
      if (!enemy) return;
      battleActiveRef.current = false;
      defeatMutation.mutate({ enemyId: enemy.enemyId, enemyLevel: enemy.level });
      const hasMore = waveIndex + 1 < allEnemies.length;
      setPhase(hasMore ? "waveComplete" : "victory");
    };
  }, [enemy, waveIndex, allEnemies, defeatMutation]);

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
    const petDist = Math.hypot(pos.x - petPosRef.current.x, pos.y - petPosRef.current.y);
    if (petDist < 13) {
      // ── Always bounce the pet away from the enemy so it can't be camped ──
      if (!petDraggingRef.current) {
        const dx = petPosRef.current.x - pos.x;
        const dy = petPosRef.current.y - pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const bounceX = Math.max(8, Math.min(92, petPosRef.current.x + (dx / d) * 14));
        const bounceY = Math.max(52, Math.min(92, petPosRef.current.y + (dy / d) * 14));
        petPosRef.current = { x: bounceX, y: bounceY };
        setPetPos({ x: bounceX, y: bounceY });
      }

      // ── Damage cooldown: only hit once every 700 ms ──────────────────────
      const now = Date.now();
      if (now - lastCollisionDmgRef.current < 700) return;
      lastCollisionDmgRef.current = now;

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
      // Mana gain on being hit
      if (pet?.specialSkill) {
        manaRef.current = Math.min(MAX_MANA, manaRef.current + 12);
        setMana(Math.floor(manaRef.current));
      }

      // Hit particles burst on pet
      const particleColors = ["#c084fc", "#a855f7", "#818cf8", "#f472b6", "#60a5fa"];
      const newPetParticles: SparkParticle[] = Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
        const speed = 1.4 + Math.random() * 2.2;
        return {
          id: slashIdRef.current++,
          x: petPosRef.current.x + (Math.random() * 6 - 3),
          y: petPosRef.current.y + (Math.random() * 6 - 3),
          dx: Math.cos(angle) * speed,
          dy: Math.sin(angle) * speed,
          color: particleColors[Math.floor(Math.random() * particleColors.length)],
        };
      });
      setPetHitParticles(prev => [...prev, ...newPetParticles]);
      const pids = new Set(newPetParticles.map(p => p.id));
      setTimeout(() => setPetHitParticles(prev => prev.filter(p => !pids.has(p.id))), 520);

      const newDmg: DamageNumber = {
        id: dmgIdRef.current++,
        x: petPosRef.current.x + (Math.random() * 14 - 7),
        y: petPosRef.current.y - 8,
        value: dmg,
        isCrit,
      };
      setDamageNumbers(prev => [...prev, newDmg]);
      setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== newDmg.id)), isCrit ? 1500 : 1000);

      // Bounce the enemy back too
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
      const now = Date.now();
      const petX = petPosRef.current.x;
      const petY = petPosRef.current.y;
      const pos = { ...enemyPosRef.current };

      if (enemy?.isBoss) {
        // ── Boss: floats at the top, oscillates side-to-side, fires particles ──
        bossOscTimeRef.current += 0.018;
        pos.x = 50 + Math.sin(bossOscTimeRef.current * 0.55) * 26;
        pos.y = 12;
        pos.vx = 0;
        pos.vy = 0;

        // Initialise first scheduled attack on battle start
        if (nextBossAttackRef.current === 0) {
          nextBossAttackRef.current = now + 8000 + Math.random() * 4000;
          orbSpawnTimerRef.current = now + 700;
        }

        // Rain mode: continuously fire 1 particle toward pet
        // Focused mode: rapid-fire tight cluster toward pet
        if (bossAttackModeRef.current !== "burst" && now > orbSpawnTimerRef.current) {
          const isFocused = bossAttackModeRef.current === "focused";
          orbSpawnTimerRef.current = now + (isFocused ? 180 : 680);
          const count = isFocused ? 3 : 1;
          const newOrbs: BossOrb[] = [];
          for (let i = 0; i < count; i++) {
            const spread = isFocused ? 0.3 : 1.1;
            const baseAngle = Math.atan2(petY - pos.y, petX - pos.x);
            const angle = baseAngle + (Math.random() - 0.5) * spread;
            const speed = isFocused ? (2.2 + Math.random() * 1.0) : (0.8 + Math.random() * 0.65);
            newOrbs.push({
              id: bossOrbIdRef.current++,
              x: pos.x + (Math.random() - 0.5) * 10,
              y: pos.y + 7,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
            });
          }
          bossOrbsRef.current = [...bossOrbsRef.current, ...newOrbs];
          setBossOrbs([...bossOrbsRef.current]);
        }

        // Trigger a burst or focused-stream attack periodically
        if (bossAttackModeRef.current === "rain" && now > nextBossAttackRef.current) {
          const mode = Math.random() < 0.5 ? "burst" : "focused";
          bossAttackModeRef.current = mode;
          if (mode === "burst") {
            setBossEnlarged(true);
            setBossBurstActive(true);
            // Fire a ring of 14 particles outward in all directions
            const burstOrbs: BossOrb[] = Array.from({ length: 14 }, (_, i) => {
              const angle = (i / 14) * Math.PI * 2;
              const speed = 1.3 + Math.random() * 0.9;
              return { id: bossOrbIdRef.current++, x: pos.x, y: pos.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
            });
            bossOrbsRef.current = [...bossOrbsRef.current, ...burstOrbs];
            setBossOrbs([...bossOrbsRef.current]);
            setTimeout(() => {
              if (!battleActiveRef.current) return;
              bossAttackModeRef.current = "rain";
              setBossEnlarged(false);
              setBossBurstActive(false);
              nextBossAttackRef.current = Date.now() + 9000 + Math.random() * 5000;
            }, 1000);
          } else {
            // Focused rapid-fire stream for 2.5s
            orbSpawnTimerRef.current = 0;
            orbSpawnEndRef.current = now + 2500;
          }
        }

        // End focused mode, return to rain
        if (bossAttackModeRef.current === "focused" && now > orbSpawnEndRef.current) {
          bossAttackModeRef.current = "rain";
          nextBossAttackRef.current = Date.now() + 8000 + Math.random() * 5000;
        }

      } else {
        // ── Regular enemy: bounce off walls, home toward pet, periodic lunge ──
        const speed = 0.4 + diff * 0.5;
        pos.x += pos.vx * speed;
        pos.y += pos.vy * speed;

        if (pos.x < 10 || pos.x > 90) {
          pos.vx = -pos.vx * (0.8 + Math.random() * 0.15);
          pos.x = Math.max(10, Math.min(90, pos.x));
          pos.vy += (Math.random() - 0.5) * 0.3;
        }
        if (pos.y < 5 || pos.y > 82) {
          pos.vy = -pos.vy * (0.8 + Math.random() * 0.15);
          pos.y = Math.max(5, Math.min(82, pos.y));
          pos.vx += (Math.random() - 0.5) * 0.3;
        }

        // Gentle homing toward pet
        const homeDx = petX - pos.x;
        const homeDy = petY - pos.y;
        const homeDist = Math.hypot(homeDx, homeDy) || 1;
        if (homeDist > 18) {
          pos.vx += (homeDx / homeDist) * 0.055;
          pos.vy += (homeDy / homeDist) * 0.055;
        }
        const maxV = 2.2 + diff * 0.6;
        const vMag = Math.hypot(pos.vx, pos.vy) || 1;
        if (vMag > maxV) { pos.vx = (pos.vx / vMag) * maxV; pos.vy = (pos.vy / vMag) * maxV; }

        // Periodic lunge toward pet
        const attackInterval = 6000 - diff * 3000;
        if (now - lastEnemyAttackRef.current > attackInterval) {
          lastEnemyAttackRef.current = now;
          const dx = petX - pos.x;
          const dy = petY - pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            pos.vx = (dx / dist) * (1.5 + diff * 1.5);
            pos.vy = (dy / dist) * (1.5 + diff * 1.5);
          }
        }
        const maxSpeed = 1.5 + diff * 2;
        const spd = Math.sqrt(pos.vx * pos.vx + pos.vy * pos.vy);
        if (spd > maxSpeed) { pos.vx = (pos.vx / spd) * maxSpeed; pos.vy = (pos.vy / spd) * maxSpeed; }
      }

      // ── Particle movement + collision (boss only) ──
      if (bossOrbsRef.current.length > 0) {
        const updated: BossOrb[] = [];
        let orbHit = false;
        for (const orb of bossOrbsRef.current) {
          const nx = orb.x + orb.vx;
          const ny = orb.y + orb.vy;
          const dist = Math.hypot(nx - petX, ny - petY);
          if (dist < 10) {
            const rawDmg = enemyStatsRef.current.atk * 0.7;
            const dmg = Math.max(1, Math.floor(rawDmg + Math.random() * 4));
            petHpRef.current = Math.max(0, petHpRef.current - dmg);
            setPetHp(petHpRef.current);
            setPetHit(true);
            setTimeout(() => setPetHit(false), 250);
            const newDmg: DamageNumber = { id: dmgIdRef.current++, x: petX, y: petY - 8, value: dmg, isCrit: false };
            setDamageNumbers(prev => [...prev, newDmg]);
            setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== newDmg.id)), 800);
            orbHit = true;
            if (petHpRef.current <= 0) { battleActiveRef.current = false; setPhase("defeat"); }
          } else if (nx >= -5 && nx <= 105 && ny >= -5 && ny <= 105) {
            updated.push({ ...orb, x: nx, y: ny });
          }
        }
        if (orbHit || updated.length !== bossOrbsRef.current.length) {
          bossOrbsRef.current = updated;
          setBossOrbs([...updated]);
        } else {
          bossOrbsRef.current = updated;
        }
      }

      enemyPosRef.current = pos;
      setEnemyPos({ ...pos });

      // Passive mana gain: +1 every ~2 seconds (120 frames at 60fps)
      if (pet?.specialSkill) {
        manaTickRef.current++;
        if (manaTickRef.current >= 120) {
          manaTickRef.current = 0;
          manaRef.current = Math.min(MAX_MANA, manaRef.current + 1);
          setMana(Math.floor(manaRef.current));
        }
      }

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

    const now = Date.now();

    // Both boss and regular enemies: one hit per swipe gesture
    if (hitEnemiesRef.current.has(enemy.enemyId)) return;
    // Boss: skip if immune after breaking free
    if (enemy.isBoss && now < bossImmuneUntilRef.current) return;

    // Minimum swipe path before any hit can register (prevents single-point taps)
    // Boss has a huge hit radius so only need a tiny movement — regular enemies need more
    const totalPathLen = swipePathRef.current.reduce((acc, p, i) => {
      if (i === 0) return 0;
      const prev = swipePathRef.current[i - 1];
      return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
    }, 0);
    const minPathLen = enemy.isBoss ? 1.5 : 5;
    if (totalPathLen < minPathLen) return;

    const ePos = enemyPosRef.current;
    const dist = segmentPointDist(ax, ay, bx, by, ePos.x, ePos.y);
    const hitRadius = enemy.isBoss ? 24 : 16;
    if (dist >= hitRadius) return;

    // Register hit — enemy can only be struck once per swipe (non-boss)
    hitEnemiesRef.current.add(enemy.enemyId);

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

    // Fill mana on hit
    const manaGain = isCrit ? 22 : (combo >= 3 ? 18 : 13);
    manaRef.current = Math.min(MAX_MANA, manaRef.current + manaGain);
    setMana(manaRef.current);

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

    // ── Boss consecutive hit tracking & break-free ────────────────────────
    if (enemy.isBoss) {
      // Expire streak if the combo window has lapsed (same 1.4s window as combo counter)
      if (now - lastHitTime > 1400) {
        consecutiveBossHitsRef.current = 0;
      }
      consecutiveBossHitsRef.current += 1;
      setBossHitStreak(consecutiveBossHitsRef.current);
      if (consecutiveBossHitsRef.current >= 6) {
        // Boss breaks free — violent knockback + brief immunity
        consecutiveBossHitsRef.current = 0;
        setBossHitStreak(0);
        bossImmuneUntilRef.current = now + 1400;
        // Burst away from the center of the arena (unpredictable escape)
        const escapeAngle = Math.random() * Math.PI * 2;
        enemyPosRef.current = {
          x: Math.max(15, Math.min(85, ePos.x)),
          y: Math.max(8, Math.min(50, ePos.y)),
          vx: Math.cos(escapeAngle) * 5,
          vy: Math.sin(escapeAngle) * 4 - 2,
        };
        setEnemyPos({ ...enemyPosRef.current });
        setBreakFreeEffect(true);
        setTimeout(() => setBreakFreeEffect(false), 900);
      } else {
        // Normal boss knockback
        const sdx = bx - ax, sdy = by - ay;
        const sLen = Math.hypot(sdx, sdy) || 1;
        enemyPosRef.current = { ...ePos, vx: (sdx / sLen) * 2.5, vy: (sdy / sLen) * 2.5 };
        setEnemyPos({ ...enemyPosRef.current });
      }
    } else {
      // Regular enemy knockback
      const sdx = bx - ax, sdy = by - ay;
      const sLen = Math.hypot(sdx, sdy) || 1;
      enemyPosRef.current = {
        ...ePos,
        vx: (sdx / sLen) * 3 + (Math.random() - 0.5),
        vy: (sdy / sLen) * 3 + (Math.random() - 0.5),
      };
    }

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
    // Reset 300ms cooldown so every new swipe can immediately land its first hit
    lastBossHitTimeRef.current = 0;
    // Don't reset streak here — combo persists across swipes if within the time window
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
    // Keep only the last 6 points — short blade flash, not a persistent drawn line
    if (swipePathRef.current.length > 6) {
      swipePathRef.current = swipePathRef.current.slice(-6);
    }
    lastSwipePointRef.current = pos;
    setSlashTrail([...swipePathRef.current]);

    // Segment hit check — tests the latest path segment against the enemy
    const path = swipePathRef.current;
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      checkSegmentHit(prev.x, prev.y, pos.x, pos.y);
    }

    // Proximity hit check — also test the current finger position directly
    // This ensures boss hits register even during slow back-and-forth passes
    checkSegmentHit(pos.x, pos.y, pos.x, pos.y);
  }, [checkSegmentHit]);

  // ── Pet drag handlers ────────────────────────────────────────────────────
  const handlePetPointerDown = useCallback((e: React.PointerEvent) => {
    if (!battleActiveRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    petDraggingRef.current = true;
  }, []);

  const handlePetPointerMove = useCallback((e: React.PointerEvent) => {
    if (!petDraggingRef.current || !arenaRef.current) return;
    e.stopPropagation();
    const arena = arenaRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(92, ((e.clientX - arena.left) / arena.width) * 100));
    const y = Math.max(52, Math.min(92, ((e.clientY - arena.top) / arena.height) * 100));
    petPosRef.current = { x, y };
    setPetPos({ x, y });
  }, []);

  const handlePetPointerUp = useCallback((e: React.PointerEvent) => {
    if (!petDraggingRef.current) return;
    e.stopPropagation();
    petDraggingRef.current = false;
  }, []);

  // ── Special skill ────────────────────────────────────────────────────────
  const useSpecialSkill = useCallback(() => {
    if (!battleActiveRef.current || manaRef.current < MAX_MANA || skillCooldown) return;
    const skill = pet?.specialSkill;
    if (!skill) return;

    manaRef.current = 0;
    setMana(0);
    setSkillCooldown(true);
    setSkillEffect(skill);
    setTimeout(() => setSkillEffect(null), 1200);
    setTimeout(() => setSkillCooldown(false), 3000);

    const pct = (pet as any)?.skillDamagePercent ?? null;

    if (skill === "Lazer") {
      const ePos = enemyPosRef.current;
      const mult = pct !== null ? pct / 100 : 2.5;
      const dmg = Math.floor(petStatsRef.current.atk * mult);
      enemyHpRef.current = Math.max(0, enemyHpRef.current - dmg);
      setEnemyHp(enemyHpRef.current);
      setEnemyHit(true);
      setTimeout(() => setEnemyHit(false), 400);
      const nd: DamageNumber = { id: dmgIdRef.current++, x: ePos.x, y: ePos.y - 12, value: dmg, isCrit: true };
      setDamageNumbers(prev => [...prev, nd]);
      setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== nd.id)), 1400);
      if (enemyHpRef.current <= 0) handleEnemyDeathRef.current();

    } else if (skill === "Bubble") {
      const ePos = enemyPosRef.current;
      const mult = pct !== null ? pct / 100 : 0.9;
      [0, 1, 2].forEach((i) => {
        setTimeout(() => {
          if (!battleActiveRef.current) return;
          const dmg = Math.floor(petStatsRef.current.atk * mult + Math.random() * 10);
          enemyHpRef.current = Math.max(0, enemyHpRef.current - dmg);
          setEnemyHp(enemyHpRef.current);
          setEnemyHit(true);
          setTimeout(() => setEnemyHit(false), 180);
          const nd: DamageNumber = { id: dmgIdRef.current++, x: ePos.x + (i - 1) * 8, y: ePos.y - 14, value: dmg };
          setDamageNumbers(prev => [...prev, nd]);
          setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== nd.id)), 1000);
          if (enemyHpRef.current <= 0) handleEnemyDeathRef.current();
        }, i * 350);
      });

    } else if (skill === "Heal Self" || skill === "Heal Party") {
      const maxHp = (petStatsRef.current as any).maxHp || petMaxHp;
      const healPct = pct !== null ? pct / 100 : 0.3;
      const healAmt = Math.floor(maxHp * healPct);
      petHpRef.current = Math.min(maxHp, petHpRef.current + healAmt);
      setPetHp(petHpRef.current);
      const nd: DamageNumber = { id: dmgIdRef.current++, x: petPosRef.current.x, y: petPosRef.current.y - 14, value: healAmt, isHeal: true };
      setDamageNumbers(prev => [...prev, nd]);
      setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== nd.id)), 1200);

    } else if (skill === "Poison") {
      if (poisonActive) return;
      setPoisonActive(true);
      let ticks = 0;
      // Poison: pct% of enemy MAX HP per tick, 5 ticks. Default 5%.
      const poisonPct = pct !== null ? pct / 100 : 0.05;
      const enemyMaxHp = enemyMaxHpRef.current || 200;
      const tickDmg = Math.max(1, Math.floor(enemyMaxHp * poisonPct));
      const timer = setInterval(() => {
        if (!battleActiveRef.current) { clearInterval(timer); setPoisonActive(false); return; }
        ticks++;
        enemyHpRef.current = Math.max(0, enemyHpRef.current - tickDmg);
        setEnemyHp(enemyHpRef.current);
        const ePos = enemyPosRef.current;
        const nd: DamageNumber = { id: dmgIdRef.current++, x: ePos.x + (Math.random() * 14 - 7), y: ePos.y - 10, value: tickDmg };
        setDamageNumbers(prev => [...prev, nd]);
        setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== nd.id)), 900);
        if (ticks >= 5 || enemyHpRef.current <= 0) {
          clearInterval(timer);
          setPoisonActive(false);
          poisonTimerRef.current = null;
          if (enemyHpRef.current <= 0) handleEnemyDeathRef.current();
        }
      }, 900);
      poisonTimerRef.current = timer;
    }
  }, [pet?.specialSkill, skillCooldown, petMaxHp]);

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

  // ── Use a battle potion slot ──────────────────────────────────────────────
  const usePotion = useCallback((slotIndex: number) => {
    const slot = activeSlotsRef.current[slotIndex];
    if (!slot || slot.remaining.length === 0) return;
    if (!battleActiveRef.current) return;

    const inventoryId = slot.remaining[0];
    const isHealPotion = (slot.healthRestored ?? 0) > 0;
    const isManaPotion = (slot.manaRestored ?? 0) > 0;

    if (isHealPotion && petHpRef.current >= (petStatsRef.current as any).maxHp) return; // already full
    if (isManaPotion && manaRef.current >= MAX_MANA) return; // already full mana

    // Apply locally
    if (isHealPotion) {
      const maxHp = (petStatsRef.current as any).maxHp || petMaxHp;
      const healAmt = slot.healthRestored!;
      petHpRef.current = Math.min(maxHp, petHpRef.current + healAmt);
      setPetHp(petHpRef.current);
      const nd: DamageNumber = { id: dmgIdRef.current++, x: petPosRef.current.x, y: petPosRef.current.y - 14, value: healAmt, isHeal: true };
      setDamageNumbers(prev => [...prev, nd]);
      setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== nd.id)), 1200);
    }
    if (isManaPotion) {
      const manaAmt = slot.manaRestored!;
      manaRef.current = Math.min(MAX_MANA, manaRef.current + manaAmt);
      setMana(Math.floor(manaRef.current));
    }

    // Consume from slot
    const updated = activeSlotsRef.current.map((s, i) =>
      i === slotIndex ? { ...s, remaining: s.remaining.slice(1) } : s
    );
    activeSlotsRef.current = updated;
    setActiveSlots([...updated]);

    // Consume from server inventory
    potionMutation.mutate({ inventoryId, petInventoryId: pet?.inventoryId ?? "" });
  }, [petMaxHp, pet?.inventoryId]);

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
          0%   { transform: translate(-50%, -50%) translateY(0px) scaleX(1) scaleY(1); filter: brightness(1); }
          15%  { transform: translate(-50%, -50%) translateY(-14px) scaleX(0.92) scaleY(1.1); filter: brightness(2.2) saturate(0.2); }
          35%  { transform: translate(-50%, -50%) translateY(4px) scaleX(1.08) scaleY(0.92); filter: brightness(1.4); }
          55%  { transform: translate(-50%, -50%) translateY(-6px) scaleX(0.96) scaleY(1.05); filter: brightness(1.1); }
          75%  { transform: translate(-50%, -50%) translateY(2px) scaleX(1.02) scaleY(0.98); filter: brightness(1); }
          100% { transform: translate(-50%, -50%) translateY(0px) scaleX(1) scaleY(1); filter: brightness(1); }
        }
        @keyframes orbFloat {
          0%   { transform: translate(-50%, -50%) translateY(0px) scale(1); }
          100% { transform: translate(-50%, -50%) translateY(-5px) scale(1.08); }
        }
        @keyframes laserPulse {
          0%   { opacity: 0.8; box-shadow: 0 0 18px rgba(255,50,50,0.8), 0 0 6px white; }
          100% { opacity: 1;   box-shadow: 0 0 32px rgba(255,100,50,1),  0 0 12px white; }
        }
        @keyframes tensionPulse {
          0%   { opacity: 0.6; }
          50%  { opacity: 1; }
          100% { opacity: 0.6; }
        }
        @keyframes poisonPulse {
          0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.6; }
          50%  { transform: translate(-50%,-50%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1);   opacity: 0.6; }
        }
        @keyframes healBurst {
          0%   { transform: translate(-50%,-50%) scale(0.4); opacity: 1; }
          60%  { transform: translate(-50%,-50%) scale(1.3); opacity: 0.7; }
          100% { transform: translate(-50%,-50%) scale(1.8); opacity: 0; }
        }
        @keyframes skillOrbFly0 {
          0%   { transform: translate(-50%,-50%) translateY(0)  scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translateY(-90px) scale(0.6); opacity: 0; }
        }
        @keyframes skillOrbFly1 {
          0%   { transform: translate(-50%,-50%) translateY(0)  scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translateY(-120px) scale(0.6); opacity: 0; }
        }
        @keyframes skillOrbFly2 {
          0%   { transform: translate(-50%,-50%) translateY(0)  scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translateY(-100px) scale(0.6); opacity: 0; }
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
        @keyframes bossFloat {
          0%   { transform: translate(-50%, -50%) translateY(0px) scale(1); }
          50%  { transform: translate(-50%, -50%) translateY(-8px) scale(1.02); }
          100% { transform: translate(-50%, -50%) translateY(0px) scale(1); }
        }
        @keyframes bossGlowPulse {
          0%   { filter: drop-shadow(0 0 18px rgba(255,40,40,0.85)) drop-shadow(0 0 40px rgba(200,0,0,0.4)); }
          50%  { filter: drop-shadow(0 0 32px rgba(255,80,40,1)) drop-shadow(0 0 60px rgba(255,40,0,0.6)); }
          100% { filter: drop-shadow(0 0 18px rgba(255,40,40,0.85)) drop-shadow(0 0 40px rgba(200,0,0,0.4)); }
        }
        @keyframes bossBurstGlow {
          0%   { filter: drop-shadow(0 0 40px rgba(255,120,40,1)) drop-shadow(0 0 80px rgba(255,60,0,0.8)); }
          50%  { filter: drop-shadow(0 0 60px rgba(255,200,60,1)) drop-shadow(0 0 100px rgba(255,140,0,0.9)); }
          100% { filter: drop-shadow(0 0 40px rgba(255,120,40,1)) drop-shadow(0 0 80px rgba(255,60,0,0.8)); }
        }
        @keyframes bossParticle {
          0%   { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
          70%  { opacity: 0.85; }
          100% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
        }
        @keyframes bossAuraPulse {
          0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.18; }
          50%  { transform: translate(-50%,-50%) scale(1.25); opacity: 0.35; }
          100% { transform: translate(-50%,-50%) scale(1);   opacity: 0.18; }
        }
        @keyframes focusedStreamWarn {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        @keyframes manaGlow {
          0%   { filter: drop-shadow(0 0 10px rgba(167,139,250,0.7)) drop-shadow(0 0 4px rgba(124,58,237,0.5)); }
          50%  { filter: drop-shadow(0 0 22px rgba(167,139,250,1.0)) drop-shadow(0 0 10px rgba(124,58,237,0.8)); }
          100% { filter: drop-shadow(0 0 10px rgba(167,139,250,0.7)) drop-shadow(0 0 4px rgba(124,58,237,0.5)); }
        }
        @keyframes manaAura {
          0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.25; }
          50%  { transform: translate(-50%,-50%) scale(1.18); opacity: 0.5; }
          100% { transform: translate(-50%,-50%) scale(1);   opacity: 0.25; }
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
              <div className="w-40 flex items-center justify-center" style={{ aspectRatio: "1/1" }}>
                {pet.petTemplateId ? (
                  <PetAnimator petTemplateId={pet.petTemplateId} mode="idle" view="front" size={220} className="w-full h-full" style={{ aspectRatio: "1/1" }} />
                ) : pet.imageUrl ? (
                  <img src={pet.imageUrl} alt={pet.name} className="w-full object-contain drop-shadow-lg" style={{ maxHeight: "160px" }} />
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
            <div className="absolute top-0 left-0 right-0 z-20 px-3 pb-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
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

            {/* ── Bottom Toolbar ── */}
            <div className="absolute bottom-0 left-0 right-0 z-20"
              style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 70%, transparent 100%)", padding: "10px 12px 12px" }}>

              {/* Row 1: Name + Level + Skill button */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold drop-shadow-lg truncate" style={{ color: accent }}>{pet.name}</span>
                  <span className="text-gray-400 text-xs">Lv.{pet.level}</span>
                </div>
                {pet.specialSkill && phase === "battle" && (
                  <button
                    data-testid="button-use-skill"
                    onClick={useSpecialSkill}
                    disabled={mana < MAX_MANA || skillCooldown}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all"
                    style={{
                      background: mana >= MAX_MANA && !skillCooldown
                        ? "linear-gradient(135deg, #4c1d95, #7c3aed)"
                        : "rgba(0,0,0,0.5)",
                      borderColor: mana >= MAX_MANA && !skillCooldown ? "#a78bfa" : "rgba(255,255,255,0.1)",
                      boxShadow: mana >= MAX_MANA && !skillCooldown ? "0 0 16px rgba(167,139,250,0.7)" : undefined,
                      opacity: skillCooldown ? 0.5 : 1,
                      animation: mana >= MAX_MANA && !skillCooldown ? "tensionPulse 0.7s ease-in-out infinite" : undefined,
                      cursor: mana >= MAX_MANA && !skillCooldown ? "pointer" : "not-allowed",
                    }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>
                      {pet.specialSkill === "Lazer" ? "⚡" :
                       pet.specialSkill === "Bubble" ? "🫧" :
                       pet.specialSkill === "Heal Self" || pet.specialSkill === "Heal Party" ? "💚" :
                       pet.specialSkill === "Poison" ? "☠️" : "✨"}
                    </span>
                    <span className="text-[9px] font-fantasy tracking-wider"
                      style={{ color: mana >= MAX_MANA && !skillCooldown ? "#e9d5ff" : "#6b7280" }}>
                      {skillCooldown ? "CD" : mana >= MAX_MANA ? "READY!" : pet.specialSkill.split(" ")[0].toUpperCase()}
                    </span>
                  </button>
                )}
              </div>

              {/* Row 2: HP bar */}
              <div className="mb-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] font-fantasy tracking-widest text-gray-400">HP</span>
                  <span className="text-[9px] font-bold" style={{ color: hpBarColor(petHp, petMaxHp) }}>{petHp} / {petMaxHp}</span>
                </div>
                <div className="h-3 bg-black/60 rounded-full overflow-hidden border border-white/15">
                  <div className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${Math.max(0, (petHp / petMaxHp) * 100)}%`,
                      backgroundColor: hpBarColor(petHp, petMaxHp),
                      boxShadow: `0 0 8px ${hpBarColor(petHp, petMaxHp)}80`,
                    }} />
                </div>
              </div>

              {/* Row 3: Mana bar (only if pet has a skill) */}
              {pet.specialSkill && (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-fantasy tracking-widest" style={{ color: "#a78bfa" }}>MANA</span>
                    <span className="text-[9px] text-white/40">{mana} / {MAX_MANA}</span>
                  </div>
                  <div className="h-2 bg-black/60 rounded-full overflow-hidden border border-purple-900/50">
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${(mana / MAX_MANA) * 100}%`,
                        background: mana >= MAX_MANA
                          ? "linear-gradient(90deg, #7c3aed, #a78bfa, #c4b5fd)"
                          : "linear-gradient(90deg, #4c1d95, #7c3aed)",
                        boxShadow: mana >= MAX_MANA ? "0 0 10px rgba(167,139,250,0.8)" : undefined,
                        animation: mana >= MAX_MANA ? "tensionPulse 0.8s ease-in-out infinite" : undefined,
                      }} />
                  </div>
                </div>
              )}

              {/* Row 4: 5 Potion slots */}
              <div className="flex gap-2 justify-start items-center">
                {Array.from({ length: 5 }, (_, i) => {
                  const slot = activeSlots[i];
                  const qty = slot?.remaining.length ?? 0;
                  const isEmpty = !slot || qty === 0;
                  const isHeal = slot && (slot.healthRestored ?? 0) > 0;
                  const isMana = slot && (slot.manaRestored ?? 0) > 0;
                  return (
                    <button
                      key={i}
                      data-testid={`button-potion-slot-${i}`}
                      onClick={() => usePotion(i)}
                      disabled={isEmpty}
                      className="relative flex items-center justify-center rounded-full border transition-all active:scale-90"
                      style={{
                        width: 44, height: 44,
                        background: isEmpty
                          ? "rgba(0,0,0,0.4)"
                          : isMana
                            ? "rgba(76,29,149,0.5)"
                            : "rgba(20,80,30,0.5)",
                        borderColor: isEmpty
                          ? "rgba(255,255,255,0.1)"
                          : isMana
                            ? "rgba(167,139,250,0.5)"
                            : "rgba(34,197,94,0.45)",
                        boxShadow: isEmpty ? undefined : isMana
                          ? "0 0 8px rgba(124,58,237,0.4)"
                          : "0 0 8px rgba(34,197,94,0.3)",
                        opacity: isEmpty ? 0.35 : 1,
                        cursor: isEmpty ? "not-allowed" : "pointer",
                      }}
                    >
                      {isEmpty ? (
                        <span className="text-white/20 text-lg">+</span>
                      ) : slot.imageUrl ? (
                        <img src={slot.imageUrl} alt={slot.name} className="w-7 h-7 object-contain" />
                      ) : (
                        <span className="text-lg">{isHeal ? "❤️" : isMana ? "💧" : "🧪"}</span>
                      )}
                      {!isEmpty && qty > 0 && (
                        <div className="absolute -bottom-0.5 -right-0.5 rounded-full text-[8px] font-bold px-1 min-w-[14px] text-center leading-none py-0.5"
                          style={{
                            background: isMana ? "#7c3aed" : "#16a34a",
                            color: "white",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                          }}>
                          {qty}
                        </div>
                      )}
                    </button>
                  );
                })}
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
                className="absolute z-10"
                style={{
                  left: `${enemyPos.x}%`,
                  top: `${enemyPos.y}%`,
                  pointerEvents: "none",
                  animation: enemy.isBoss
                    ? "bossFloat 2.8s ease-in-out infinite"
                    : enemyHit
                      ? "hitFlash 0.2s ease-in-out"
                      : "enemyBounce 0.6s ease-in-out infinite",
                  transform: enemy.isBoss
                    ? `translate(-50%, -50%) scale(${bossEnlarged ? 1.5 : 1})`
                    : "translate(-50%, -50%)",
                  transition: enemy.isBoss ? "transform 0.4s ease-out" : undefined,
                }}
              >
                {/* Boss pulsing aura underneath */}
                {enemy.isBoss && (
                  <div style={{
                    position: "absolute",
                    left: "50%", top: "50%",
                    width: bossEnlarged ? 220 : 180,
                    height: bossEnlarged ? 220 : 180,
                    borderRadius: "50%",
                    background: bossBurstActive
                      ? "radial-gradient(circle, rgba(255,140,40,0.35) 0%, rgba(255,60,0,0.18) 50%, transparent 75%)"
                      : "radial-gradient(circle, rgba(255,40,40,0.22) 0%, rgba(180,0,0,0.10) 55%, transparent 78%)",
                    animation: "bossAuraPulse 1.8s ease-in-out infinite",
                    transition: "width 0.4s, height 0.4s, background 0.3s",
                    pointerEvents: "none",
                  }} />
                )}

                {enemy.imageUrl ? (
                  <img
                    src={enemy.imageUrl}
                    alt={enemy.name}
                    style={{
                      width: enemy.isBoss ? 148 : 80,
                      height: enemy.isBoss ? 148 : 80,
                      animation: enemy.isBoss
                        ? (bossBurstActive ? "bossBurstGlow 0.4s ease-in-out infinite" : "bossGlowPulse 1.8s ease-in-out infinite")
                        : (enemyHit ? "hitFlash 0.2s ease-in-out" : undefined),
                    }}
                    className="object-contain"
                  />
                ) : (
                  <div
                    className={`${enemy.isBoss ? "w-36 h-36" : "w-20 h-20"} bg-red-900/50 rounded-full flex items-center justify-center border-2 border-red-500`}
                    style={enemy.isBoss ? {
                      boxShadow: bossBurstActive
                        ? "0 0 50px rgba(255,140,40,0.9), 0 0 20px rgba(255,80,0,0.7)"
                        : "0 0 32px rgba(255,0,0,0.7), 0 0 12px rgba(200,0,0,0.5)",
                      animation: "bossAuraPulse 1.8s ease-in-out infinite",
                    } : {}}
                  >
                    <Swords className={enemy.isBoss ? "w-14 h-14 text-red-400" : "w-8 h-8 text-red-400"} />
                  </div>
                )}

                {enemy.isBoss && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-widest whitespace-nowrap"
                    style={{
                      color: bossBurstActive ? "#ffaa40" : "#ff4444",
                      textShadow: bossBurstActive
                        ? "0 0 14px rgba(255,160,40,0.9), 0 0 6px rgba(255,100,0,0.7)"
                        : "0 0 10px rgba(255,0,0,0.8)",
                      animation: bossBurstActive ? "tensionPulse 0.35s ease-in-out infinite" : undefined,
                    }}>
                    {bossBurstActive ? "💥 BURST! 💥" : "⚠ BOSS ⚠"}
                  </div>
                )}

                {enemy.isBoss && bossHitStreak > 0 && !breakFreeEffect && (
                  <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex gap-1 items-center">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="rounded-full"
                        style={{
                          width: 7, height: 7,
                          background: i < bossHitStreak ? "#ff4444" : "rgba(255,255,255,0.2)",
                          boxShadow: i < bossHitStreak ? "0 0 6px rgba(255,60,60,0.9)" : undefined,
                          transition: "background 0.1s, box-shadow 0.1s",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pet — visual + centered drag handle */}
            <div
              className="absolute z-10"
              style={{
                left: `${petPos.x}%`,
                top: `${petPos.y}%`,
                transform: "translate(-50%, -50%)",
                animation: petHit ? "petHitBounce 0.4s ease-out" : undefined,
                filter: petHit
                  ? "drop-shadow(0 0 14px rgba(239,68,68,0.9))"
                  : (mana >= MAX_MANA && !skillCooldown && pet.specialSkill)
                    ? undefined
                    : undefined,
                transition: petDraggingRef.current ? undefined : "left 0.08s, top 0.08s",
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              {/* Mana-ready aura ring around pet */}
              {mana >= MAX_MANA && !skillCooldown && pet.specialSkill && (
                <div style={{
                  position: "absolute",
                  left: "50%", top: "50%",
                  width: 230, height: 230,
                  borderRadius: "50%",
                  border: "2.5px solid rgba(167,139,250,0.75)",
                  boxShadow: "0 0 20px rgba(124,58,237,0.6), inset 0 0 20px rgba(167,139,250,0.15)",
                  animation: "manaAura 1s ease-in-out infinite",
                  pointerEvents: "none",
                }} />
              )}
              {pet.petTemplateId ? (
                <PetAnimator
                  petTemplateId={pet.petTemplateId}
                  mode="idle"
                  view="front"
                  size={220}
                  style={mana >= MAX_MANA && !skillCooldown ? { animation: "manaGlow 1s ease-in-out infinite" } : undefined}
                />
              ) : pet.imageUrl ? (
                <img
                  src={pet.imageUrl}
                  alt={pet.name}
                  className="object-contain drop-shadow-lg"
                  style={{
                    width: 220, height: 220,
                    animation: mana >= MAX_MANA && !skillCooldown ? "manaGlow 1s ease-in-out infinite" : undefined,
                  }}
                />
              ) : (
                <span className="text-6xl" style={{ animation: mana >= MAX_MANA && !skillCooldown ? "manaGlow 1s ease-in-out infinite" : undefined }}>🐾</span>
              )}

              {/* Small centered grab zone — requires a direct tap to drag */}
              {phase === "battle" && (
                <div
                  data-testid="pet-grab-handle"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    border: "2px dashed rgba(255,255,255,0.25)",
                    background: "rgba(255,255,255,0.04)",
                    cursor: petDraggingRef.current ? "grabbing" : "grab",
                    touchAction: "none",
                    pointerEvents: "auto",
                    zIndex: 10,
                  }}
                  onPointerDown={handlePetPointerDown}
                  onPointerMove={handlePetPointerMove}
                  onPointerUp={handlePetPointerUp}
                  onPointerCancel={handlePetPointerUp}
                />
              )}
            </div>

            {phase === "battle" && (
              <div className="absolute inset-0 z-15 pointer-events-none">
                <div className="absolute bottom-36 left-1/2 -translate-x-1/2 text-white/25 text-[10px] font-medium animate-pulse tracking-widest text-center whitespace-nowrap">
                  Slash enemy · Tap pet center to drag
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

        {/* Spark particles on hit (enemy) */}
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

        {/* Pet hit particles */}
        {petHitParticles.map(spark => (
          <div
            key={spark.id}
            className="absolute pointer-events-none rounded-full z-35"
            style={{
              left: `${spark.x}%`,
              top: `${spark.y}%`,
              width: 7,
              height: 7,
              marginLeft: -3.5,
              marginTop: -3.5,
              background: spark.color,
              boxShadow: `0 0 10px ${spark.color}, 0 0 4px white`,
              animation: "sparkFly 0.5s ease-out forwards",
              ["--spark-dx" as any]: `${spark.dx * 14}px`,
              ["--spark-dy" as any]: `${spark.dy * 14}px`,
            }}
          />
        ))}

        {/* Boss energy particles */}
        {bossOrbs.map(orb => (
          <div
            key={orb.id}
            className="absolute pointer-events-none z-25"
            style={{
              left: `${orb.x}%`,
              top: `${orb.y}%`,
              transform: "translate(-50%, -50%)",
              width: bossBurstActive ? 18 : 14,
              height: bossBurstActive ? 18 : 14,
              borderRadius: "50%",
              background: bossBurstActive
                ? "radial-gradient(circle at 35% 30%, rgba(255,220,60,0.98), rgba(255,140,20,0.7) 55%, rgba(255,60,0,0.2))"
                : "radial-gradient(circle at 35% 30%, rgba(255,160,60,0.98), rgba(255,80,20,0.7) 55%, rgba(200,30,0,0.2))",
              border: bossBurstActive ? "1.5px solid rgba(255,220,60,0.9)" : "1.5px solid rgba(255,120,40,0.8)",
              boxShadow: bossBurstActive
                ? "0 0 16px rgba(255,200,40,0.8), 0 0 6px rgba(255,120,0,0.6)"
                : "0 0 10px rgba(255,100,20,0.7), 0 0 4px rgba(255,60,0,0.5)",
            }}
          />
        ))}

        {/* Boss focused-stream warning */}
        {enemy?.isBoss && bossAttackModeRef.current === "focused" && (
          <div
            className="absolute inset-0 z-40 pointer-events-none flex items-start justify-center"
            style={{ paddingTop: "22%" }}
          >
            <div style={{
              fontFamily: "Cinzel, serif",
              fontSize: 12,
              fontWeight: 700,
              color: "#ff6a20",
              textShadow: "0 0 16px rgba(255,100,20,0.9), 0 0 6px rgba(255,60,0,0.7)",
              letterSpacing: "0.15em",
              animation: "focusedStreamWarn 0.45s ease-in-out infinite",
            }}>⚡ FOCUSED ASSAULT ⚡</div>
          </div>
        )}

        {/* Boss break-free flash */}
        {breakFreeEffect && (
          <div
            className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center"
            style={{ background: "rgba(255,60,60,0.12)" }}
          >
            <div style={{
              fontFamily: "Cinzel, serif",
              fontSize: 18,
              fontWeight: 900,
              color: "#ff2222",
              textShadow: "0 0 24px #ff0000, 0 0 10px rgba(255,80,80,0.9), 0 2px 0 #000",
              letterSpacing: "0.18em",
              animation: "tensionPulse 0.25s ease-in-out infinite",
            }}>💥 BREAKS FREE! 💥</div>
          </div>
        )}

        {/* ── Pet special skill visuals ── */}
        {/* Lazer: beam from pet up to enemy */}
        {skillEffect === "Lazer" && enemyPos.y < petPos.y && (
          <div className="absolute pointer-events-none z-36" style={{
            left: `${petPos.x}%`,
            bottom: `${100 - petPos.y}%`,
            transform: "translateX(-50%)",
            width: 6,
            height: `${petPos.y - enemyPos.y}%`,
            background: "linear-gradient(0deg, rgba(250,204,21,0.9) 0%, rgba(251,191,36,0.6) 60%, rgba(253,224,71,0.2) 100%)",
            boxShadow: "0 0 16px rgba(250,204,21,0.9), 0 0 6px white",
            borderRadius: 4,
            animation: "laserPulse 0.12s ease-in-out infinite alternate",
          }} />
        )}
        {/* Bubble: 3 floating orbs traveling from pet to enemy */}
        {skillEffect === "Bubble" && [0, 1, 2].map((i) => (
          <div key={i} className="absolute pointer-events-none z-36" style={{
            left: `${petPos.x + (i - 1) * 5}%`,
            top: `${petPos.y - i * 12}%`,
            transform: "translate(-50%, -50%)",
            width: 18, height: 18,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, rgba(200,240,255,0.95), rgba(100,200,255,0.3))",
            border: "1.5px solid rgba(160,220,255,0.9)",
            boxShadow: "0 0 10px rgba(100,200,255,0.7)",
            animation: `skillOrbFly${i} 0.6s ease-out forwards`,
          }} />
        ))}
        {/* Poison: green shimmer on enemy */}
        {poisonActive && (
          <div className="absolute pointer-events-none z-26" style={{
            left: `${enemyPos.x}%`,
            top: `${enemyPos.y}%`,
            transform: "translate(-50%, -50%)",
            width: 80, height: 80,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 70%)",
            boxShadow: "0 0 24px rgba(34,197,94,0.4)",
            animation: "poisonPulse 0.9s ease-in-out infinite",
          }} />
        )}
        {/* Heal: green burst around pet */}
        {(skillEffect === "Heal Self" || skillEffect === "Heal Party") && (
          <div className="absolute pointer-events-none z-36" style={{
            left: `${petPos.x}%`,
            top: `${petPos.y}%`,
            transform: "translate(-50%, -50%)",
            width: 120, height: 120,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34,197,94,0.5) 0%, transparent 65%)",
            boxShadow: "0 0 32px rgba(34,197,94,0.6)",
            animation: "healBurst 0.9s ease-out forwards",
          }} />
        )}

        {/* Boss burst screen flash */}
        {bossBurstActive && (
          <div
            className="absolute inset-0 pointer-events-none z-5"
            style={{
              background: "radial-gradient(ellipse at 50% 15%, rgba(255,120,30,0.18) 0%, transparent 55%)",
              animation: "bossAuraPulse 0.4s ease-in-out infinite",
            }}
          />
        )}

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

                  {activeSlots.some(s => s && s.remaining.length > 0) && (
                    <div className="mt-3 text-gray-500 text-[10px] text-center tracking-wide">
                      Use potions from the battle toolbar
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
