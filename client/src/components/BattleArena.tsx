import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { playHit, playBlock, playPlayerHurt, playDefeat, playBattleVictory, playPowerUp, playChime } from "@/lib/sounds";
import { Swords, Star, Coins, X, ChevronRight, ArrowLeft, Heart, HelpCircle, Droplets } from "lucide-react";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import blockIconPng from "@assets/icon_battle_block.png";
import warningRunePng from "@assets/icon_battle_warning.png";
import rageFlamePng from "@assets/icon_battle_rage.png";
import counterLightningPng from "@assets/icon_battle_counter.png";
import crossedSwordsPng from "@assets/icon_battle_crossed_swords.png";
import hitMarkPng from "@assets/icon_battle_hitmark.png";
import PetAnimator from "./PetAnimator";

export interface EquippedPet {
  inventoryId: string;
  name: string;
  petNickname?: string | null;
  imageUrl?: string | null;
  hatchedImageUrl?: string | null;
  petLevel?: number | null;
  petAtk?: number | null;
  petDef?: number | null;
  petHealth?: number | null;
  petTemplateId?: string | null;
  specialSkill?: string | null;
  specialSkillType?: string | null;
  skillDamagePercent?: number | null;
  skillHealPercent?: number | null;
  skillType?: string | null;
  skillAffects?: string | null;
  rarity?: number | null;
}

interface BoltProjectile {
  id: number;
  fromX: number; fromY: number;
  toX: number; toY: number;
  startTime: number;
  duration: number;
  petTargetIdx: number;
  isBossSpecial: boolean;
}

interface AutoOrb {
  id: number;
  fromX: number; fromY: number;
  toX: number; toY: number;
  startTime: number;
  duration: number;
  petIdx: number;
}

const PET_SPRITE_SIZE = 230;

function getPetPos(idx: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 22, y: 64 };
  if (total === 2) return [{ x: 26, y: 64 }, { x: 62, y: 64 }][idx] ?? { x: 26, y: 64 };
  return [{ x: 16, y: 64 }, { x: 44, y: 64 }, { x: 72, y: 64 }][idx] ?? { x: 22, y: 64 };
}

interface EncounterEnemy {
  enemyId: string;
  name: string;
  imageUrl: string | null;
  isBoss: boolean;
  bossSpecialAttack?: string | null;
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
  specialSkillType: string | null;
  skillDamagePercent: number | null;
  skillHealPercent: number | null;
  skillType: string | null;
  skillAffects: string | null;
  rarity: number | null;
}

export interface BattlePotionSlot {
  shopItemId: string;
  inventoryIds: string[];
  name: string;
  imageUrl: string | null;
  healthRestored: number | null;
  manaRestored: number | null;
  petsRevived: number | null;
}

interface BattleArenaProps {
  locationId: string;
  locationName: string;
  bgUrl: string | null;
  accent: string;
  onClose: () => void;
  onBattleEnd: () => void;
  battlePotionSlots?: (BattlePotionSlot | null)[];
  equippedPets?: (EquippedPet | null)[];
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

type BattlePhase = "loading" | "intro" | "battle" | "victory" | "waveComplete" | "defeat";

function buildSlashPath(pts: { x: number; y: number }[]): string {
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

// ─────────────────────────────────────────────────────────────────────────────
// End-of-battle summary: centered pets with animated XP progression bars.
// Shown only at victory/defeat — NOT between waves — so the player sees a
// single clean reward screen at the end.
// ─────────────────────────────────────────────────────────────────────────────
interface PetRewardEntry {
  inventoryId: string;
  name: string;
  imageUrl: string | null;
  petTemplateId: string | null;
  startLevel: number;
  startPoints: number;
  endLevel: number;
  endPoints: number;
  pointsNeeded: number;
  levelsGained: number;
  totalXp: number;
}

function pointsForLevel(level: number): number {
  return Math.floor(100 + level * 30 + level * level * 5);
}

function PetXpBar({ entry, accent }: { entry: PetRewardEntry; accent: string }) {
  // Animate the bar through each level segment in sequence so multi-level
  // gains show distinct fills + flashes.
  const [displayLevel, setDisplayLevel] = useState(entry.startLevel);
  const [fromPct, setFromPct] = useState(0);
  const [toPct, setToPct] = useState(0);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const totalSteps = entry.levelsGained + 1; // segments to animate
    const baseDur = totalSteps > 1 ? 380 : 1200;

    const startNeeded = pointsForLevel(entry.startLevel);
    const startStartPct = startNeeded > 0 ? Math.min(100, (entry.startPoints / startNeeded) * 100) : 0;

    if (entry.levelsGained === 0) {
      const endNeeded = entry.pointsNeeded || 1;
      const endPct = Math.min(100, (entry.endPoints / endNeeded) * 100);
      setDisplayLevel(entry.startLevel);
      setFromPct(startStartPct);
      // next tick — let the from value settle before kicking off the fill
      requestAnimationFrame(() => { if (!cancelled) setToPct(endPct); });
      return () => { cancelled = true; };
    }

    // Sequence: fill from start% → 100% on starting level, then 0% → 100%
    // for each intermediate level, then 0% → endPct on final level.
    const run = async () => {
      // First segment: starting level → 100%
      setDisplayLevel(entry.startLevel);
      setFromPct(startStartPct);
      requestAnimationFrame(() => { if (!cancelled) setToPct(100); });
      await new Promise(r => setTimeout(r, baseDur));
      if (cancelled) return;
      setFlash(f => f + 1);

      // Intermediate full levels
      for (let i = 1; i < entry.levelsGained; i++) {
        setDisplayLevel(entry.startLevel + i);
        setFromPct(0);
        setToPct(0);
        await new Promise(r => requestAnimationFrame(() => r(null)));
        if (cancelled) return;
        setToPct(100);
        await new Promise(r => setTimeout(r, baseDur));
        if (cancelled) return;
        setFlash(f => f + 1);
      }

      // Final segment: end level → endPct
      const endNeeded = entry.pointsNeeded || 1;
      const endPct = Math.min(100, (entry.endPoints / endNeeded) * 100);
      setDisplayLevel(entry.endLevel);
      setFromPct(0);
      setToPct(0);
      await new Promise(r => requestAnimationFrame(() => r(null)));
      if (cancelled) return;
      setToPct(endPct);
    };
    run();
    return () => { cancelled = true; };
  }, [entry.inventoryId]);

  const dur = entry.levelsGained > 0 ? 380 : 1200;
  const pct = toPct;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative" style={{ width: 88, height: 88, animation: "petBobIdle 2.4s ease-in-out infinite" }}>
        {entry.imageUrl ? (
          <img src={entry.imageUrl} alt={entry.name}
            className="w-full h-full object-contain"
            style={{ filter: `drop-shadow(0 4px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 12px ${accent}55)` }}
          />
        ) : (
          <img src={petPawIcon} alt={entry.name} className="w-full h-full object-contain opacity-70" />
        )}
        {flash > 0 && (
          <div key={flash}
            className="absolute left-1/2 top-1/2 font-black text-yellow-300 pointer-events-none"
            style={{
              fontSize: 16,
              textShadow: "0 0 10px rgba(253,224,71,0.9), 0 2px 4px rgba(0,0,0,0.8)",
              animation: "xpLevelUpBurst 0.9s ease-out forwards",
            }}
          >
            ✦ LEVEL UP ✦
          </div>
        )}
      </div>
      <div className="text-white font-bold text-sm mt-1 truncate max-w-[140px] text-center" data-testid={`text-summary-pet-name-${entry.inventoryId}`}>
        {entry.name}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: accent }}>
        Lv.{displayLevel}
        {entry.levelsGained > 0 && displayLevel === entry.endLevel && entry.endLevel !== entry.startLevel && (
          <span className="text-green-400 ml-1">(+{entry.levelsGained})</span>
        )}
      </div>
      <div className="relative w-full max-w-[180px] h-2.5 mt-1.5 rounded-full overflow-hidden border border-white/15 bg-black/60">
        <div
          key={`${entry.inventoryId}-${displayLevel}-${fromPct}`}
          style={{
            ["--xp-from" as any]: `${fromPct}%`,
            ["--xp-to" as any]: `${pct}%`,
            width: `${pct}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${accent}, #fde68a)`,
            boxShadow: `0 0 8px ${accent}aa`,
            transition: `width ${dur}ms ease-out`,
          }}
        />
        {/* Shine sweep */}
        <div className="absolute inset-y-0 w-1/3 pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
            animation: "xpBarShine 1.6s ease-in-out infinite",
          }}
        />
      </div>
      <div className="text-[10px] text-gray-400 mt-1">+{entry.totalXp} XP</div>
    </div>
  );
}

interface BattleEndSummaryProps {
  phase: "victory" | "defeat";
  accent: string;
  enemyName: string;
  allEnemiesCount: number;
  petRewards: PetRewardEntry[];
  totalCoins: number;
  totalItems: any[];
  errored: boolean;
  calculating: boolean;
  onClose: () => void;
}

function BattleEndSummary({ phase, accent, enemyName, allEnemiesCount, petRewards, totalCoins, totalItems, errored, calculating, onClose }: BattleEndSummaryProps) {
  const isVictory = phase === "victory";
  const borderCol = isVictory ? accent + "60" : "rgba(239,68,68,0.5)";
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6 overflow-y-auto">
      <div className="bg-gray-900/95 rounded-2xl border p-5 mx-2 w-full max-w-md"
        style={{
          borderColor: borderCol,
          animation: isVictory ? "victoryPulse 2s ease-in-out infinite" : undefined,
        }}
        data-testid={isVictory ? "modal-victory" : "modal-defeat"}>
        <div className="text-center">
          <div className="text-3xl font-black mb-1" style={{ color: isVictory ? accent : "#ef4444" }}>
            {isVictory ? "VICTORY!" : "DEFEATED"}
          </div>
          <div className="text-gray-400 text-sm mb-4">
            {isVictory
              ? (allEnemiesCount > 1 ? `All ${allEnemiesCount} enemies defeated!` : `You defeated ${enemyName}!`)
              : "Your party has fallen..."}
          </div>

          {calculating ? (
            <div className="text-gray-400 animate-pulse py-6">Calculating rewards...</div>
          ) : errored && petRewards.length === 0 ? (
            <div className="text-red-400 text-sm py-4">Failed to load rewards. Your battle still counts.</div>
          ) : petRewards.length === 0 ? (
            <div className="text-gray-500 text-xs py-4">No rewards earned this time.</div>
          ) : (
            <>
              <div className={`grid gap-3 mb-4 ${petRewards.length === 1 ? "grid-cols-1 justify-items-center" : petRewards.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {petRewards.map(p => (
                  <PetXpBar key={p.inventoryId} entry={p} accent={accent} />
                ))}
              </div>

              {(totalCoins > 0 || totalItems.length > 0) && (
                <div className="bg-black/40 rounded-xl p-3 mb-3 space-y-2">
                  {totalCoins > 0 && (
                    <div className="flex items-center justify-center gap-2 text-amber-400 text-sm">
                      <Coins className="w-4 h-4" /><span className="font-bold">+{totalCoins} Coins</span>
                    </div>
                  )}
                  {totalItems.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-gray-400 text-[10px] uppercase tracking-wide">Items Found</div>
                      {totalItems.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-center gap-2">
                          {item.imageUrl && <img src={item.imageUrl} alt="" className="w-5 h-5 object-contain" />}
                          <span className="text-white text-xs font-medium">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <button onClick={onClose}
            className="mt-2 w-full py-3 rounded-xl font-bold text-white transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: isVictory ? accent : "#dc2626" }}
            data-testid={isVictory ? "button-battle-continue" : "button-battle-retreat"}>
            {isVictory ? "Continue" : "Retreat"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BattleArena({ locationId, locationName, bgUrl, accent, onClose, onBattleEnd, battlePotionSlots = [], equippedPets = [] }: BattleArenaProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Core phase / wave state ──────────────────────────────────────────────
  const [phase, setPhase] = useState<BattlePhase>("loading");
  const [allEnemies, setAllEnemies] = useState<EncounterEnemy[]>([]);
  const [waveIndex, setWaveIndex] = useState(0);
  const [enemy, setEnemy] = useState<EncounterEnemy | null>(null);
  const [pet, setPet] = useState<EncounterPet | null>(null);
  const [enemyHp, setEnemyHp] = useState(0);
  const [enemyMaxHp, setEnemyMaxHp] = useState(0);
  const [petHp, setPetHp] = useState(0);
  const [petMaxHp, setPetMaxHp] = useState(0);
  const [victoryData, setVictoryData] = useState<any>(null);
  const [totalRewards, setTotalRewards] = useState<{ lvlPoints: number; coins: number; items: any[]; levelsGained: number }>({ lvlPoints: 0, coins: 0, items: [], levelsGained: 0 });
  // Per-pet level/XP snapshot used by the end-of-battle progression bars.
  // Keyed by inventoryId. We snapshot starting state on the first defeat
  // response and keep updating end state as more enemies fall.
  interface PetReward {
    inventoryId: string;
    name: string;
    imageUrl: string | null;
    petTemplateId: string | null;
    startLevel: number;
    startPoints: number;
    endLevel: number;
    endPoints: number;
    pointsNeeded: number;
    levelsGained: number;
    totalXp: number;
  }
  const [petRewards, setPetRewards] = useState<Record<string, PetReward>>({});

  // ── Enemy movement ───────────────────────────────────────────────────────
  const [enemyPos, setEnemyPos] = useState({ x: 50, y: 22 });
  const enemyPosRef = useRef({ x: 50, y: 22 });
  const enemyOscRef = useRef(0);
  const isBossRef = useRef(false);

  // ── Multi-pet state ───────────────────────────────────────────────────────
  const [extraPetHps, setExtraPetHps] = useState<[number, number]>([0, 0]);
  const [extraPetMaxHps, setExtraPetMaxHps] = useState<[number, number]>([0, 0]);
  const extraPetHpsRef = useRef<[number, number]>([0, 0]);
  const equippedExtraPetsRef = useRef<[EquippedPet | null, EquippedPet | null]>([null, null]);
  const equippedPetsCountRef = useRef(1);
  const extraPetManas = useRef<[number, number]>([0, 0]);
  const extraAutoTimers = useRef<[number, number]>([0, 0]);

  // ── Boss special attack ───────────────────────────────────────────────────
  const bossSpecialAttackRef = useRef<string | null>(null);
  const nextBossSpecialRef = useRef(0);
  const [boltProjectiles, setBoltProjectiles] = useState<BoltProjectile[]>([]);
  const [autoOrbs, setAutoOrbs] = useState<AutoOrb[]>([]);
  const [bossSlashActive, setBossSlashActive] = useState(false);
  const boltIdRef = useRef(0);
  const orbIdRef = useRef(0);

  // ── Hold-block state ──────────────────────────────────────────────────────
  const blockHeldRef = useRef(false);
  const [blockHeld, setBlockHeld] = useState(false);
  const blockHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Charge / parry system ────────────────────────────────────────────────
  const [enemyCharging, setEnemyCharging] = useState(false);
  const [parryWindowOpen, setParryWindowOpen] = useState(false);
  const [parryResult, setParryResult] = useState<"success" | "fail" | null>(null);
  const [counterActive, setCounterActive] = useState(false);
  const [counterHitsLeft, setCounterHitsLeft] = useState(0);
  const enemyChargingRef = useRef(false);
  const chargeStartRef = useRef(0);
  const chargeDurationRef = useRef(1400);
  const parryWindowOpenRef = useRef(false);
  const counterActiveRef = useRef(false);
  const counterHitsLeftRef = useRef(0);
  const nextChargeTimeRef = useRef(0);

  // ── Charge target / return ────────────────────────────────────────────────
  const chargeTargetIdxRef = useRef(0);
  const chargeHomePosRef = useRef({ x: 50, y: 18 });
  const chargeReturningRef = useRef(false);
  const chargeReturnStartRef = useRef(0);
  const chargeReturnFromRef = useRef({ x: 50, y: 18 });

  // ── Boss rage ────────────────────────────────────────────────────────────
  const [bossRage, setBossRage] = useState(false);
  const bossRageRef = useRef(false);

  // ── Hit / visual effects ─────────────────────────────────────────────────
  const [slashEffects, setSlashEffects] = useState<SlashEffect[]>([]);
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);
  const [petHit, setPetHit] = useState(false);
  const [enemyHit, setEnemyHit] = useState(false);
  const [shakeScreen, setShakeScreen] = useState(false);
  const [bossShockwave, setBossShockwave] = useState<{ id: number; x: number; y: number } | null>(null);
  const [comboCount, setComboCount] = useState(0);
  const [lastHitTime, setLastHitTime] = useState(0);

  // ── Swipe trail ──────────────────────────────────────────────────────────
  const [slashTrail, setSlashTrail] = useState<{ x: number; y: number }[]>([]);
  const [trailFading, setTrailFading] = useState(false);
  const [sparkParticles, setSparkParticles] = useState<SparkParticle[]>([]);
  const [petHitParticles, setPetHitParticles] = useState<SparkParticle[]>([]);
  const swipePathRef = useRef<{ x: number; y: number }[]>([]);
  const lastSwipePointRef = useRef<{ x: number; y: number } | null>(null);
  const hitEnemiesRef = useRef<Set<string>>(new Set());
  const isSlashingRef = useRef(false);

  // ── Mana & special skill ─────────────────────────────────────────────────
  const [mana, setMana] = useState(0);
  const manaRef = useRef(0);
  const manaTickRef = useRef(0);
  const [skillCooldown, setSkillCooldown] = useState(false);
  const [skillEffect, setSkillEffect] = useState<string | null>(null);
  const [poisonActive, setPoisonActive] = useState(false);
  const poisonTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const counterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_MANA = 100;
  const handleEnemyDeathRef = useRef<() => void>(() => {});
  const runPetSkillRef = useRef<(casterIdx: 0 | 1 | 2, source: { specialSkill?: string | null; specialSkillType?: string | null; skillDamagePercent?: number | null; skillHealPercent?: number | null; skillType?: string | null; skillAffects?: string | null; rarity?: number | null; petAtk?: number | null; }, atkOverride?: number) => void>(() => {});
  const applyDamageToEnemyRef = useRef<(amt: number, x: number, y: number, isCrit?: boolean) => void>(() => {});

  // ── Potion slots ─────────────────────────────────────────────────────────
  const [activeSlots, setActiveSlots] = useState<(BattlePotionSlot & { remaining: string[] })[]>([]);
  const activeSlotsRef = useRef<(BattlePotionSlot & { remaining: string[] })[]>([]);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("battleTutorialSeen"));

  // ── Core refs ────────────────────────────────────────────────────────────
  const arenaRef = useRef<HTMLDivElement>(null);
  const slashIdRef = useRef(0);
  const dmgIdRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const battleActiveRef = useRef(false);
  const petStatsRef = useRef<{ atk: number; def: number; maxHp: number }>({ atk: 50, def: 50, maxHp: 100 });
  const enemyStatsRef = useRef({ atk: 20, def: 10 });
  const enemyHpRef = useRef(0);
  const petHpRef = useRef(0);
  const enemyMaxHpRef = useRef(0);
  const difficultyRef = useRef(0.5);

  // ── Inventory ────────────────────────────────────────────────────────────
  const { data: inventory = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"] });

  // ── Encounter init ───────────────────────────────────────────────────────
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

        // Initialize extra pets (slots 1 and 2 from equippedPets)
        const extraSlots: [EquippedPet | null, EquippedPet | null] = [
          (equippedPets[1] ?? null) as EquippedPet | null,
          (equippedPets[2] ?? null) as EquippedPet | null,
        ];
        equippedExtraPetsRef.current = extraSlots;
        const totalPets = 1 + extraSlots.filter(Boolean).length;
        equippedPetsCountRef.current = totalPets;

        const initExtraHps: [number, number] = [0, 0];
        const initExtraMaxHps: [number, number] = [0, 0];
        for (let i = 0; i < 2; i++) {
          const ep = extraSlots[i];
          if (ep) {
            const hp = Math.max(50, Math.floor((ep.petHealth ?? 80) * 1.0));
            initExtraHps[i] = hp;
            initExtraMaxHps[i] = hp;
          }
        }
        extraPetHpsRef.current = initExtraHps;
        setExtraPetHps(initExtraHps);
        setExtraPetMaxHps(initExtraMaxHps);
        extraPetManas.current = [0, 0];
        extraAutoTimers.current = [Date.now() + 4000, Date.now() + 5000];

        const slots = battlePotionSlots
          .filter((s): s is BattlePotionSlot => s !== null && s !== undefined)
          .map(s => ({ ...s, remaining: [...s.inventoryIds] }));
        activeSlotsRef.current = slots;
        setActiveSlots(slots);
        startWave(data.encounters[0], 0);
      } catch {
        toast({ title: "Error", description: "Failed to start battle", variant: "destructive" });
        onClose();
      }
    };
    fetchEncounter();
  }, [locationId]);

  // ── startWave ────────────────────────────────────────────────────────────
  const startWave = useCallback((enc: EncounterEnemy, idx: number) => {
    setEnemy(enc);
    setWaveIndex(idx);
    setEnemyHp(enc.hp);
    setEnemyMaxHp(enc.hp);
    enemyHpRef.current = enc.hp;
    enemyMaxHpRef.current = enc.hp;
    enemyStatsRef.current = { atk: enc.atk, def: enc.def };
    isBossRef.current = enc.isBoss;
    bossSpecialAttackRef.current = enc.isBoss ? (enc.bossSpecialAttack ?? null) : null;
    setVictoryData(null);
    setComboCount(0);
    setLastHitTime(0);
    setSlashEffects([]);
    setDamageNumbers([]);
    setBoltProjectiles([]);
    setAutoOrbs([]);
    setBossSlashActive(false);
    manaRef.current = 0;
    setMana(0);
    setSkillCooldown(false);
    setSkillEffect(null);
    setPoisonActive(false);
    setBossRage(false);
    bossRageRef.current = false;
    setCounterActive(false);
    setCounterHitsLeft(0);
    counterActiveRef.current = false;
    counterHitsLeftRef.current = 0;
    setEnemyCharging(false);
    enemyChargingRef.current = false;
    chargeReturningRef.current = false;
    setParryWindowOpen(false);
    parryWindowOpenRef.current = false;
    setParryResult(null);
    if (poisonTimerRef.current) { clearInterval(poisonTimerRef.current); poisonTimerRef.current = null; }
    difficultyRef.current = 0.3 + Math.random() * 0.7;
    chargeDurationRef.current = enc.isBoss ? 1000 : 1300;
    enemyOscRef.current = Math.random() * Math.PI * 2;
    // Bosses anchor dead-center at the top of the arena so they feel massive
    // and dramatic; regular enemies still spawn with a bit of randomness.
    const startX = enc.isBoss ? 50 : 45 + Math.random() * 20;
    const startY = enc.isBoss ? 20 : 16 + Math.random() * 6;
    enemyPosRef.current = { x: startX, y: startY };
    setEnemyPos({ x: startX, y: startY });
    chargeHomePosRef.current = { x: startX, y: startY };
    setPhase("intro");
  }, []);

  // ── Intro → battle transition ────────────────────────────────────────────
  useEffect(() => {
    if (phase === "intro") {
      const timer = setTimeout(() => {
        setPhase("battle");
        battleActiveRef.current = true;
        nextChargeTimeRef.current = Date.now() + 3500;
        manaTickRef.current = 0;
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const defeatMutation = useMutation({
    mutationFn: async ({ enemyId, enemyLevel }: { enemyId: string; enemyLevel: number }) => {
      const extraPetInventoryIds = equippedExtraPetsRef.current
        .filter(Boolean)
        .map(ep => ep!.inventoryId);
      const res = await apiRequest("POST", `/api/explore/defeat/${enemyId}`, { enemyLevel, extraPetInventoryIds });
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

      // Accumulate per-pet rewards. We keep the FIRST snapshot's
      // start state and roll the end state forward on each victory.
      setPetRewards(prev => {
        const next = { ...prev };
        // Active pet
        if (pet) {
          const existing = next[pet.inventoryId];
          if (!existing) {
            next[pet.inventoryId] = {
              inventoryId: pet.inventoryId,
              name: (pet as any).petNickname || pet.name || "Your pet",
              imageUrl: pet.imageUrl ?? null,
              petTemplateId: pet.petTemplateId ?? null,
              startLevel: data.prevLevel ?? pet.level ?? 1,
              startPoints: data.prevLevelPoints ?? 0,
              endLevel: data.newLevel ?? data.prevLevel ?? pet.level ?? 1,
              endPoints: data.newLevelPoints ?? 0,
              pointsNeeded: data.pointsNeeded ?? 1,
              levelsGained: data.levelsGained || 0,
              totalXp: data.lvlPointsEarned || 0,
            };
          } else {
            existing.endLevel = data.newLevel ?? existing.endLevel;
            existing.endPoints = data.newLevelPoints ?? existing.endPoints;
            existing.pointsNeeded = data.pointsNeeded ?? existing.pointsNeeded;
            existing.levelsGained += data.levelsGained || 0;
            existing.totalXp += data.lvlPointsEarned || 0;
          }
        }
        // Extras
        if (Array.isArray(data.extraPetResults)) {
          data.extraPetResults.forEach((r: any) => {
            const existing = next[r.inventoryId];
            // Find slot to recover image
            const slot = equippedExtraPetsRef.current.find(ep => ep && ep.inventoryId === r.inventoryId) || null;
            if (!existing) {
              next[r.inventoryId] = {
                inventoryId: r.inventoryId,
                name: r.petName || slot?.petNickname || slot?.name || "Pet",
                imageUrl: slot?.hatchedImageUrl ?? slot?.imageUrl ?? null,
                petTemplateId: r.petTemplateId ?? slot?.petTemplateId ?? null,
                startLevel: r.prevLevel ?? slot?.petLevel ?? 1,
                startPoints: r.prevLevelPoints ?? 0,
                endLevel: r.newLevel ?? r.prevLevel ?? slot?.petLevel ?? 1,
                endPoints: r.newLevelPoints ?? 0,
                pointsNeeded: r.pointsNeeded ?? 1,
                levelsGained: r.levelsGained || 0,
                totalXp: r.lvlPointsEarned || 0,
              };
            } else {
              existing.endLevel = r.newLevel ?? existing.endLevel;
              existing.endPoints = r.newLevelPoints ?? existing.endPoints;
              existing.pointsNeeded = r.pointsNeeded ?? existing.pointsNeeded;
              existing.levelsGained += r.levelsGained || 0;
              existing.totalXp += r.lvlPointsEarned || 0;
            }
          });
        }
        return next;
      });

      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: () => {
      setVictoryData({ error: true, lvlPointsEarned: 0, coinsAwarded: 0, droppedItems: [], levelsGained: 0 });
    },
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not use potion", variant: "destructive" });
    },
  });

  // ── Animation loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "battle") return;

    const checkAllDead = () => {
      const activeAlive = petHpRef.current > 0;
      const extra1Alive = equippedExtraPetsRef.current[0] !== null && extraPetHpsRef.current[0] > 0;
      const extra2Alive = equippedExtraPetsRef.current[1] !== null && extraPetHpsRef.current[1] > 0;
      if (!activeAlive && !extra1Alive && !extra2Alive) {
        battleActiveRef.current = false;
        setPhase("defeat");
        return true;
      }
      return false;
    };

    const applyDmgToPet = (targetIdx: number, dmg: number, isBlocked: boolean) => {
      const total = equippedPetsCountRef.current;
      const pos = getPetPos(targetIdx, total);
      const finalDmg = isBlocked ? Math.max(2, Math.floor(dmg * 0.25)) : dmg;
      if (isBlocked) {
        setParryResult("success");
        playBlock();
        setTimeout(() => setParryResult(null), 600);
      }
      if (targetIdx === 0) {
        petHpRef.current = Math.max(0, petHpRef.current - finalDmg);
        setPetHp(petHpRef.current);
      } else {
        const newHps = [...extraPetHpsRef.current] as [number, number];
        newHps[targetIdx - 1] = Math.max(0, newHps[targetIdx - 1] - finalDmg);
        extraPetHpsRef.current = newHps;
        setExtraPetHps(newHps);
      }
      setPetHit(true);
      setShakeScreen(true);
      if (!isBlocked) {
        setParryResult("fail");
        playPlayerHurt();
      }
      setTimeout(() => { setPetHit(false); setShakeScreen(false); if (!isBlocked) setParryResult(null); }, 600);
      manaRef.current = Math.min(MAX_MANA, manaRef.current + 14);
      setMana(Math.floor(manaRef.current));
      const pColors = ["#c084fc", "#a855f7", "#818cf8", "#f472b6", "#60a5fa"];
      const newP: SparkParticle[] = Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
        const spd = 1.4 + Math.random() * 2.2;
        return { id: slashIdRef.current++, x: pos.x + (Math.random() * 8 - 4), y: pos.y + (Math.random() * 8 - 4), dx: Math.cos(angle) * spd, dy: Math.sin(angle) * spd, color: pColors[Math.floor(Math.random() * pColors.length)] };
      });
      setPetHitParticles(prev => [...prev, ...newP]);
      const pids = new Set(newP.map(p => p.id));
      setTimeout(() => setPetHitParticles(prev => prev.filter(p => !pids.has(p.id))), 520);
      const nd: DamageNumber = { id: dmgIdRef.current++, x: pos.x + (Math.random() * 16 - 8), y: pos.y - 12, value: finalDmg };
      setDamageNumbers(prev => [...prev, nd]);
      setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== nd.id)), 1000);
    };

    const fireBossSpecial = (now: number) => {
      const specialType = bossSpecialAttackRef.current;
      if (!specialType) return;
      const total = equippedPetsCountRef.current;
      if (specialType === "bolt") {
        for (let pi = 0; pi < total; pi++) {
          const targetPos = getPetPos(pi, total);
          const delay = pi * 300;
          setTimeout(() => {
            if (!battleActiveRef.current) return;
            const bid = boltIdRef.current++;
            const dur = 800;
            const fromX = enemyPosRef.current.x;
            const fromY = enemyPosRef.current.y;
            setBoltProjectiles(prev => [...prev, { id: bid, fromX, fromY, toX: targetPos.x, toY: targetPos.y, startTime: Date.now(), duration: dur, petTargetIdx: pi, isBossSpecial: true }]);
            setTimeout(() => {
              if (!battleActiveRef.current) return;
              setBoltProjectiles(prev => prev.filter(b => b.id !== bid));
              const rawDmg = Math.max(12, Math.floor(enemyStatsRef.current.atk * 0.75 + Math.random() * 6));
              applyDmgToPet(pi, rawDmg, blockHeldRef.current);
              checkAllDead();
            }, dur);
          }, delay);
        }
      } else if (specialType === "slash") {
        setBossSlashActive(true);
        setTimeout(() => {
          if (!battleActiveRef.current) return;
          const rawDmg = Math.max(14, Math.floor(enemyStatsRef.current.atk * 0.9 + Math.random() * 8));
          const isBlocked = blockHeldRef.current;
          for (let pi = 0; pi < total; pi++) {
            applyDmgToPet(pi, rawDmg, isBlocked);
          }
          setBossSlashActive(false);
          checkAllDead();
        }, 650);
      }
      const nextInterval = bossRageRef.current ? 5000 + Math.random() * 2000 : 9000 + Math.random() * 4000;
      nextBossSpecialRef.current = now + nextInterval;
    };

    const animate = () => {
      if (!battleActiveRef.current) return;
      const now = Date.now();

      // ── Enemy movement (float or charge) ─────────────────────────────
      if (!enemyChargingRef.current && !chargeReturningRef.current) {
        // Sinusoidal float
        enemyOscRef.current += 0.016;
        const osc = enemyOscRef.current;
        let newX: number, newY: number;
        if (isBossRef.current) {
          // Bosses stay anchored dead-center at the top with only a tiny
          // idle hover so they feel imposing rather than bouncy.
          newX = 50;
          newY = chargeHomePosRef.current.y + Math.sin(osc * 0.35) * 1.2;
        } else {
          newX = 50 + Math.sin(osc * 0.55) * 18 + Math.sin(osc * 1.1) * 8;
          newY = 19 + Math.sin(osc * 0.7) * 6 + Math.cos(osc * 0.35) * 3;
        }
        const ex = Math.max(10, Math.min(90, newX));
        const ey = Math.max(8, Math.min(28, newY));
        enemyPosRef.current = { x: ex, y: ey };
        setEnemyPos({ x: ex, y: ey });
      } else if (enemyChargingRef.current) {
        // Lerp toward target pet
        const elapsed = now - chargeStartRef.current;
        const total = equippedPetsCountRef.current;
        const targetPos = getPetPos(chargeTargetIdxRef.current, total);
        const progress = Math.min(1, elapsed / chargeDurationRef.current);
        const ease = progress * progress * progress; // ease-in cubic
        const ex = chargeHomePosRef.current.x + (targetPos.x - chargeHomePosRef.current.x) * ease;
        const ey = chargeHomePosRef.current.y + (targetPos.y - chargeHomePosRef.current.y) * ease;
        enemyPosRef.current = { x: ex, y: ey };
        setEnemyPos({ x: ex, y: ey });

        if (progress >= 1) {
          // Impact!
          enemyChargingRef.current = false;
          setEnemyCharging(false);
          parryWindowOpenRef.current = false;
          setParryWindowOpen(false);
          chargeReturningRef.current = true;
          chargeReturnStartRef.current = now;
          chargeReturnFromRef.current = { x: ex, y: ey };

          const rawDmg = Math.max(8, enemyStatsRef.current.atk - (petStatsRef.current.def * 0.45));
          const dmg = Math.max(1, Math.floor(rawDmg + Math.random() * 8 - 4));
          applyDmgToPet(chargeTargetIdxRef.current, dmg, blockHeldRef.current);
          if (!checkAllDead()) {
            const diff = difficultyRef.current;
            const isRage = bossRageRef.current;
            const baseInterval = isBossRef.current
              ? (isRage ? 1400 + Math.random() * 800 : 2800 + Math.random() * 1200)
              : 2400 + Math.random() * 2000 - diff * 800;
            nextChargeTimeRef.current = now + Math.max(1000, baseInterval);
          }
        }
      } else if (chargeReturningRef.current) {
        // Return to home position
        const elapsed = now - chargeReturnStartRef.current;
        const returnDur = 550;
        const progress = Math.min(1, elapsed / returnDur);
        const ease = 1 - (1 - progress) * (1 - progress) * (1 - progress); // ease-out cubic
        const ex = chargeReturnFromRef.current.x + (chargeHomePosRef.current.x - chargeReturnFromRef.current.x) * ease;
        const ey = chargeReturnFromRef.current.y + (chargeHomePosRef.current.y - chargeReturnFromRef.current.y) * ease;
        enemyPosRef.current = { x: ex, y: ey };
        setEnemyPos({ x: ex, y: ey });
        if (progress >= 1) {
          chargeReturningRef.current = false;
          // Update home position with small drift
          const nx = 40 + Math.random() * 25;
          const ny = 14 + Math.random() * 8;
          chargeHomePosRef.current = { x: nx, y: ny };
        }
      }

      // ── Charge initiation ─────────────────────────────────────────────
      if (!enemyChargingRef.current && !chargeReturningRef.current && nextChargeTimeRef.current > 0 && now >= nextChargeTimeRef.current) {
        // Pick a random alive pet to target
        const total = equippedPetsCountRef.current;
        const aliveIdxs: number[] = [];
        if (petHpRef.current > 0) aliveIdxs.push(0);
        for (let i = 0; i < 2; i++) {
          if (equippedExtraPetsRef.current[i] && extraPetHpsRef.current[i] > 0) aliveIdxs.push(i + 1);
        }
        if (aliveIdxs.length > 0) {
          chargeTargetIdxRef.current = aliveIdxs[Math.floor(Math.random() * aliveIdxs.length)];
          chargeHomePosRef.current = { ...enemyPosRef.current };
          enemyChargingRef.current = true;
          chargeStartRef.current = now;
          parryWindowOpenRef.current = false;
          setEnemyCharging(true);
          setParryWindowOpen(false);
        }
      }

      // ── Boss special attack ────────────────────────────────────────────
      if (isBossRef.current && bossSpecialAttackRef.current && !enemyChargingRef.current && !chargeReturningRef.current && nextBossSpecialRef.current > 0 && now >= nextBossSpecialRef.current) {
        fireBossSpecial(now);
      }

      // ── Boss rage at 50% HP ───────────────────────────────────────────
      if (isBossRef.current && !bossRageRef.current && enemyHpRef.current > 0 && enemyHpRef.current <= enemyMaxHpRef.current * 0.5) {
        bossRageRef.current = true;
        setBossRage(true);
        playPlayerHurt();
        chargeDurationRef.current = 900;
      }

      // ── Extra pet auto-attacks ─────────────────────────────────────────
      const total = equippedPetsCountRef.current;
      for (let i = 0; i < 2; i++) {
        const ep = equippedExtraPetsRef.current[i];
        if (!ep || extraPetHpsRef.current[i] <= 0) continue;
        if (now >= extraAutoTimers.current[i]) {
          const petIdx = i + 1;
          const fromPos = getPetPos(petIdx, total);
          const toPos = { x: enemyPosRef.current.x, y: enemyPosRef.current.y };
          const orbId = orbIdRef.current++;
          const orbDur = 400 + Math.random() * 200;
          setAutoOrbs(prev => [...prev, { id: orbId, fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y, startTime: now, duration: orbDur, petIdx }]);
          setTimeout(() => {
            setAutoOrbs(prev => prev.filter(o => o.id !== orbId));
            if (!battleActiveRef.current) return;
            const petAtk = Math.max(10, ep.petAtk ?? 15);
            const rawDmg = Math.max(10, petAtk - enemyStatsRef.current.def * 0.4);
            const dmg = Math.max(1, Math.floor(rawDmg + Math.random() * 6 - 3));
            enemyHpRef.current = Math.max(0, enemyHpRef.current - dmg);
            setEnemyHp(enemyHpRef.current);
            const nd: DamageNumber = { id: dmgIdRef.current++, x: toPos.x + (Math.random() * 12 - 6), y: toPos.y - 8, value: dmg };
            setDamageNumbers(prev => [...prev, nd]);
            setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== nd.id)), 900);
            setEnemyHit(true);
            setTimeout(() => setEnemyHit(false), 250);
            if (enemyHpRef.current <= 0) handleEnemyDeathRef.current();
          }, orbDur);

          // Mana for extra pet (auto-fire skill when full)
          extraPetManas.current[i] = Math.min(MAX_MANA, extraPetManas.current[i] + 22);
          if (extraPetManas.current[i] >= MAX_MANA) {
            extraPetManas.current[i] = 0;
            const casterIdx = (i + 1) as 1 | 2;
            // Honors the extra pet's actual special skill (Lazer/Bubble/Heal/Revive/etc.)
            // — heals route to allies, damage routes to enemy. If the pet has no
            // skill assigned we fall back to a basic damage hit so the mana isn't wasted.
            const skill = ep.skillType || ep.specialSkillType || ep.specialSkill;
            setTimeout(() => {
              if (!battleActiveRef.current) return;
              if (skill) {
                runPetSkillRef.current(casterIdx, {
                  specialSkill: ep.specialSkill ?? null,
                  specialSkillType: ep.specialSkillType ?? null,
                  skillDamagePercent: ep.skillDamagePercent ?? null,
                  skillHealPercent: ep.skillHealPercent ?? null,
                  skillType: ep.skillType ?? null,
                  skillAffects: ep.skillAffects ?? null,
                  rarity: ep.rarity ?? null,
                  petAtk: ep.petAtk ?? 15,
                });
              } else {
                const skillDmg = Math.max(15, Math.floor((ep.petAtk ?? 15) * 1.6));
                applyDamageToEnemyRef.current(skillDmg, enemyPosRef.current.x + (Math.random() * 14 - 7), enemyPosRef.current.y);
              }
            }, orbDur + 100);
          }

          const nextAutoMs = 1500 + Math.random() * 1000;
          extraAutoTimers.current[i] = now + nextAutoMs;
        }
      }

      // ── Passive mana trickle ──────────────────────────────────────────
      manaTickRef.current++;
      if (manaTickRef.current >= 120) {
        manaTickRef.current = 0;
        manaRef.current = Math.min(MAX_MANA, manaRef.current + 1);
        setMana(Math.floor(manaRef.current));
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    // Init boss special timer
    if (bossSpecialAttackRef.current) {
      nextBossSpecialRef.current = Date.now() + 8000;
    } else {
      nextBossSpecialRef.current = 0;
    }

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase]);

  // ── Battle outcome sounds ────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "victory") playBattleVictory();
    else if (phase === "defeat") playDefeat();
  }, [phase]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (counterTimerRef.current) clearTimeout(counterTimerRef.current);
      if (poisonTimerRef.current) clearInterval(poisonTimerRef.current);
    };
  }, []);

  // ── Swipe helpers ────────────────────────────────────────────────────────
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

  const checkSegmentHit = useCallback((ax: number, ay: number, bx: number, by: number) => {
    if (!battleActiveRef.current || !enemy) return;
    if (hitEnemiesRef.current.has(enemy.enemyId)) return;

    const totalPathLen = swipePathRef.current.reduce((acc, p, i) => {
      if (i === 0) return 0;
      const prev = swipePathRef.current[i - 1];
      return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
    }, 0);
    if (totalPathLen < 4) return;

    const ePos = enemyPosRef.current;
    const dist = segmentPointDist(ax, ay, bx, by, ePos.x, ePos.y);
    const hitRadius = enemy.isBoss ? 24 : 17;
    if (dist >= hitRadius) return;

    hitEnemiesRef.current.add(enemy.enemyId);
    playHit();

    const now = Date.now();
    let combo = comboCount;
    if (now - lastHitTime < 1400) combo += 1; else combo = 1;
    setComboCount(combo);
    setLastHitTime(now);

    const comboMult = 1 + Math.min(combo * 0.12, 0.6);
    const isCrit = Math.random() < 0.15;
    const critMult = isCrit ? 1.9 : 1;
    const wasCounter = counterActiveRef.current;
    const counterMult = wasCounter ? 2.0 : 1.0;
    // DamageToEnemy = max(10, PetATK - (EnemyDEF * 0.55))
    const rawDmg = Math.max(10, petStatsRef.current.atk - (enemyStatsRef.current.def * 0.55));
    const dmg = Math.max(1, Math.floor((rawDmg + Math.floor(Math.random() * 10) - 4) * comboMult * critMult * counterMult));

    const isBossHit = !!enemy.isBoss;

    enemyHpRef.current = Math.max(0, enemyHpRef.current - dmg);
    setEnemyHp(enemyHpRef.current);
    setEnemyHit(true);
    setTimeout(() => setEnemyHit(false), isBossHit ? 360 : 220);

    // Boss hit: screen shake + shockwave ring
    if (isBossHit) {
      setShakeScreen(true);
      setTimeout(() => setShakeScreen(false), 280);
      const swId = slashIdRef.current++;
      setBossShockwave({ id: swId, x: ePos.x, y: ePos.y });
      setTimeout(() => setBossShockwave(prev => prev?.id === swId ? null : prev), 500);
    }

    // Mana on hit
    const manaGain = isCrit ? 22 : (combo >= 3 ? 18 : 13);
    manaRef.current = Math.min(MAX_MANA, manaRef.current + manaGain);
    setMana(manaRef.current);

    // Decrement counter hits
    if (wasCounter) {
      counterHitsLeftRef.current = Math.max(0, counterHitsLeftRef.current - 1);
      setCounterHitsLeft(counterHitsLeftRef.current);
      if (counterHitsLeftRef.current <= 0) {
        counterActiveRef.current = false;
        setCounterActive(false);
      }
    }

    // Slash mark
    const markId = slashIdRef.current++;
    setSlashEffects(prev => [...prev, { id: markId, x: ePos.x, y: ePos.y }]);
    setTimeout(() => setSlashEffects(prev => prev.filter(s => s.id !== markId)), 500);

    // Sparks — more for bosses, golden during counter
    const sparkColor = wasCounter ? "#fde68a" : isCrit ? "#fbbf24" : accent;
    const sparkCount = isBossHit ? 18 : 11;
    const newSparks: SparkParticle[] = Array.from({ length: sparkCount }, (_, i) => {
      const angle = (i / sparkCount) * Math.PI * 2 + Math.random() * 0.4;
      const speed = isBossHit ? (2.8 + Math.random() * 4.2) : (2.0 + Math.random() * 3.2);
      return { id: slashIdRef.current++, x: ePos.x, y: ePos.y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, color: sparkColor };
    });
    setSparkParticles(prev => [...prev, ...newSparks]);
    const sparkIds = new Set(newSparks.map(s => s.id));
    setTimeout(() => setSparkParticles(prev => prev.filter(s => !sparkIds.has(s.id))), isBossHit ? 600 : 480);

    // Damage number
    const dmgNum: DamageNumber = { id: dmgIdRef.current++, x: ePos.x + (Math.random() * 12 - 6), y: ePos.y - 6, value: dmg, isCrit };
    setDamageNumbers(prev => [...prev, dmgNum]);
    setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== dmgNum.id)), isCrit ? 1400 : 900);

    if (enemyHpRef.current <= 0) {
      if (battleActiveRef.current) {
        battleActiveRef.current = false;
        defeatMutation.mutate({ enemyId: enemy.enemyId, enemyLevel: enemy.level });
        const hasMore = waveIndex + 1 < allEnemies.length;
        setPhase(hasMore ? "waveComplete" : "victory");
      }
    }
  }, [enemy, comboCount, lastHitTime, defeatMutation, waveIndex, allEnemies.length, accent]);

  // ── Swipe handlers ───────────────────────────────────────────────────────
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
    if (Math.hypot(pos.x - last.x, pos.y - last.y) < 0.5) return;
    swipePathRef.current.push(pos);
    // Keep a shorter trail so the slash feels snappy instead of a long streak
    if (swipePathRef.current.length > 4) swipePathRef.current = swipePathRef.current.slice(-4);
    lastSwipePointRef.current = pos;
    setSlashTrail([...swipePathRef.current]);
    const path = swipePathRef.current;
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      checkSegmentHit(prev.x, prev.y, pos.x, pos.y);
    }
    checkSegmentHit(pos.x, pos.y, pos.x, pos.y);
  }, [checkSegmentHit]);

  const handleSlashEnd = useCallback((_e: React.PointerEvent) => {
    if (!isSlashingRef.current) return;
    isSlashingRef.current = false;
    if (swipePathRef.current.length >= 2) setTrailFading(true);
    setTimeout(() => { setSlashTrail([]); setTrailFading(false); }, 320);
    swipePathRef.current = [];
    lastSwipePointRef.current = null;
  }, []);

  // ── Hold-block functions ──────────────────────────────────────────────────
  // No cooldown: players hold the button (up to 5s), release, and can re-hold
  // immediately to block again.
  const startBlock = useCallback(() => {
    if (!battleActiveRef.current) return;
    blockHeldRef.current = true;
    setBlockHeld(true);
    if (blockHoldTimerRef.current) clearTimeout(blockHoldTimerRef.current);
    blockHoldTimerRef.current = setTimeout(() => {
      endBlock();
    }, 5000);
  }, []);

  const endBlock = useCallback(() => {
    if (!blockHeldRef.current) return;
    blockHeldRef.current = false;
    setBlockHeld(false);
    if (blockHoldTimerRef.current) { clearTimeout(blockHoldTimerRef.current); blockHoldTimerRef.current = null; }
  }, []);

  // ── Skill execution helpers ──────────────────────────────────────────────
  // These keep damage/heal targeting strictly correct:
  //   • Damage NEVER touches an ally pet.
  //   • Heal NEVER touches the enemy.
  //   • Skills with both a damage% AND a heal% configured will do both
  //     (drain-style), but with separate code paths per target type.

  const showFloatingNumber = useCallback((x: number, y: number, value: number, isHeal: boolean, isCrit = false) => {
    const nd: DamageNumber = { id: dmgIdRef.current++, x, y: y - 10, value, isHeal, isCrit };
    setDamageNumbers(prev => [...prev, nd]);
    setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== nd.id)), 1100);
  }, []);

  const applyDamageToEnemy = useCallback((amt: number, x: number, y: number, isCrit = false) => {
    if (amt <= 0) return;
    enemyHpRef.current = Math.max(0, enemyHpRef.current - amt);
    setEnemyHp(enemyHpRef.current);
    setEnemyHit(true);
    setTimeout(() => setEnemyHit(false), 250);
    showFloatingNumber(x + (Math.random() * 8 - 4), y - 4, amt, false, isCrit);
    if (enemyHpRef.current <= 0) handleEnemyDeathRef.current();
  }, [showFloatingNumber]);

  // Heal a single ally by index (0=active, 1/2=extra). Skips fainted pets
  // (you cannot heal a 0-HP pet — that requires Revive).
  const healAlly = useCallback((allyIdx: 0 | 1 | 2, amt: number) => {
    if (amt <= 0) return;
    if (allyIdx === 0) {
      if (petHpRef.current <= 0) return;
      const max = petStatsRef.current.maxHp;
      petHpRef.current = Math.min(max, petHpRef.current + amt);
      setPetHp(petHpRef.current);
      const pos = getPetPos(0, equippedPetsCountRef.current);
      showFloatingNumber(pos.x, pos.y - 4, amt, true);
    } else {
      const i = allyIdx - 1;
      if (extraPetHpsRef.current[i] <= 0) return;
      const ep = equippedExtraPetsRef.current[i];
      if (!ep) return;
      const max = ep.petHealth ?? petStatsRef.current.maxHp;
      const newHps = [...extraPetHpsRef.current] as [number, number];
      newHps[i] = Math.min(max, newHps[i] + amt);
      extraPetHpsRef.current = newHps;
      setExtraPetHps(newHps);
      const pos = getPetPos(allyIdx, equippedPetsCountRef.current);
      showFloatingNumber(pos.x, pos.y - 4, amt, true);
    }
  }, [showFloatingNumber]);

  const healWholeParty = useCallback((amt: number) => {
    healAlly(0, amt);
    for (let i = 0; i < 2; i++) {
      if (equippedExtraPetsRef.current[i]) healAlly((i + 1) as 1 | 2, amt);
    }
  }, [healAlly]);

  const reviveFaintedExtras = useCallback((amt: number) => {
    if (amt <= 0) return;
    const newHps = [...extraPetHpsRef.current] as [number, number];
    let any = false;
    for (let i = 0; i < 2; i++) {
      const ep = equippedExtraPetsRef.current[i];
      if (!ep || newHps[i] > 0) continue;
      const max = ep.petHealth ?? petStatsRef.current.maxHp;
      newHps[i] = Math.min(max, amt);
      any = true;
      const pos = getPetPos(i + 1, equippedPetsCountRef.current);
      showFloatingNumber(pos.x, pos.y - 4, amt, true);
    }
    if (any) {
      extraPetHpsRef.current = newHps;
      setExtraPetHps(newHps);
    }
  }, [showFloatingNumber]);

  // Master skill executor — caster can be active (0) or any extra (1/2).
  // Each skill type declares whether it has a damage and/or heal component;
  // the routing is enforced here so allies are never accidentally damaged.
  // ── Pet special-skill executor ────────────────────────────────────────────
  // Routes the cast based on the admin-configured Skill Type + Affects:
  //   • damage  → enemy / enemy_party (damage to enemy only)
  //   • heal    → self / party (heal allies only)
  //   • revive  → revive fainted ally pets
  //   • poison  → damage-over-time on the enemy (turn count scales with rarity)
  // Style (Lazer/Bubble/etc.) is purely the cosmetic visual — it never affects
  // who gets hit. Pets created before this system fall back to legacy style
  // names so they keep working unchanged.
  const runPetSkill = useCallback((casterIdx: 0 | 1 | 2, source: { specialSkill?: string | null; specialSkillType?: string | null; skillDamagePercent?: number | null; skillHealPercent?: number | null; skillType?: string | null; skillAffects?: string | null; rarity?: number | null; petAtk?: number | null; }, atkOverride?: number) => {
    if (!battleActiveRef.current) return;
    const style = source.specialSkillType || source.specialSkill || "";
    const atk = Math.max(1, atkOverride ?? source.petAtk ?? petStatsRef.current.atk);

    // ── Resolve Skill Type + Affects (with legacy-style fallback) ──────────
    type SkillType = "damage" | "heal" | "revive" | "poison";
    type SkillAffects = "self" | "party" | "enemy" | "enemy_party";
    const LEGACY_FALLBACK: Record<string, { type: SkillType; affects: SkillAffects; pct: number }> = {
      "Heal Self":    { type: "heal",   affects: "self",         pct: 50 },
      "Heal Party":   { type: "heal",   affects: "party",        pct: 50 },
      "Revive Party": { type: "revive", affects: "party",        pct: 0  },
      "Poison":       { type: "poison", affects: "enemy",        pct: 14 },
    };
    const fallback = LEGACY_FALLBACK[style];
    const skillType = (source.skillType as SkillType | null) ?? fallback?.type ?? "damage";
    const skillAffects = (source.skillAffects as SkillAffects | null) ??
      fallback?.affects ??
      (skillType === "heal" || skillType === "revive" ? "self" : "enemy");

    // The single percent input the admin filled in (interpreted by skillType).
    // For damage/poison we read skillDamagePercent; for heal we read skillHealPercent.
    const rawPct =
      skillType === "heal" ? source.skillHealPercent :
      skillType === "revive" ? null :
      source.skillDamagePercent;
    const pct = (rawPct !== null && rawPct !== undefined && rawPct > 0)
      ? rawPct / 100
      : (fallback ? fallback.pct / 100 : (skillType === "heal" ? 0.5 : skillType === "poison" ? 0.14 : 1.5));

    if (!style && !source.skillType) return; // nothing to cast

    // Visual flourish (active pet only triggers the fullscreen overlay/sound).
    if (casterIdx === 0 && style) {
      setSkillEffect(style);
      playPowerUp();
      setTimeout(() => setSkillEffect(null), 3000);
    }

    // ── DAMAGE → enemy only ────────────────────────────────────────────────
    if (skillType === "damage") {
      const ePos = enemyPosRef.current;
      if (skillAffects === "enemy_party") {
        // Spread the damage across multiple hits to feel like a multi-target attack.
        [0, 1, 2].forEach((i) => {
          setTimeout(() => {
            if (!battleActiveRef.current) return;
            const dmg = Math.floor(atk * pct + Math.random() * 10);
            applyDamageToEnemy(dmg, ePos.x + (i - 1) * 8, ePos.y);
          }, i * 350);
        });
      } else {
        const dmg = Math.max(1, Math.floor(atk * pct));
        applyDamageToEnemy(dmg, ePos.x, ePos.y, true);
      }
      return;
    }

    // ── POISON → damage over time on the enemy ─────────────────────────────
    if (skillType === "poison") {
      if (poisonActive) return;
      const rarity = Math.max(1, Math.min(5, source.rarity ?? 1));
      const totalTicks = rarity >= 5 ? 5 : rarity === 4 ? 4 : 3; // 3-star and below = 3
      const tickDmg = Math.max(1, Math.floor(atk * pct));
      setPoisonActive(true);
      let ticks = 0;
      const timer = setInterval(() => {
        if (!battleActiveRef.current) { clearInterval(timer); setPoisonActive(false); return; }
        ticks++;
        applyDamageToEnemy(tickDmg, enemyPosRef.current.x, enemyPosRef.current.y);
        if (ticks >= totalTicks || enemyHpRef.current <= 0) {
          clearInterval(timer);
          setPoisonActive(false);
          poisonTimerRef.current = null;
        }
      }, 900);
      poisonTimerRef.current = timer;
      return;
    }

    // ── HEAL → allies only ─────────────────────────────────────────────────
    if (skillType === "heal") {
      const healAmt = Math.max(1, Math.floor(atk * pct));
      if (skillAffects === "party") healWholeParty(healAmt);
      else healAlly(casterIdx, healAmt);
      return;
    }

    // ── REVIVE → bring back fainted allies ─────────────────────────────────
    if (skillType === "revive") {
      // Revives at a fraction of caster ATK so the amount is meaningful.
      const reviveHp = Math.max(1, Math.floor(atk * 0.4));
      reviveFaintedExtras(reviveHp);
      if (skillAffects === "party") healWholeParty(Math.floor(reviveHp * 0.5));
      return;
    }
  }, [applyDamageToEnemy, healAlly, healWholeParty, reviveFaintedExtras, poisonActive]);

  // ── Special skill (active pet, mana-driven) ──────────────────────────────
  const useSpecialSkill = useCallback(() => {
    if (!battleActiveRef.current || manaRef.current < MAX_MANA || skillCooldown) return;
    const skill = (pet as any)?.skillType || (pet as any)?.specialSkillType || pet?.specialSkill;
    if (!skill) return;

    manaRef.current = 0;
    setMana(0);
    setSkillCooldown(true);
    setTimeout(() => setSkillCooldown(false), 3000);

    runPetSkill(0, {
      specialSkill: pet?.specialSkill ?? null,
      specialSkillType: pet?.specialSkillType ?? null,
      skillDamagePercent: pet?.skillDamagePercent ?? null,
      skillHealPercent: pet?.skillHealPercent ?? null,
      skillType: (pet as any)?.skillType ?? null,
      skillAffects: (pet as any)?.skillAffects ?? null,
      rarity: pet?.rarity ?? null,
      petAtk: petStatsRef.current.atk,
    }, petStatsRef.current.atk);
  }, [pet?.specialSkillType, pet?.specialSkill, pet?.skillDamagePercent, pet?.skillHealPercent, (pet as any)?.skillType, (pet as any)?.skillAffects, pet?.rarity, skillCooldown, runPetSkill]);

  // Keep refs fresh so the rAF animate loop (captured in a long-lived useEffect)
  // always calls the current versions of these callbacks.
  useEffect(() => { runPetSkillRef.current = runPetSkill; }, [runPetSkill]);
  useEffect(() => { applyDamageToEnemyRef.current = applyDamageToEnemy; }, [applyDamageToEnemy]);

  // ── Rarity color for pet skill glow ──────────────────────────────────────
  const RARITY_COLORS = ["", "#a0a0b0", "#4ade80", "#60a5fa", "#c084fc", "#f0c040"];
  const rarityColor = RARITY_COLORS[Math.min(5, Math.max(1, pet?.rarity ?? 1))] ?? "#a78bfa";
  const PET_X = getPetPos(0, equippedPetsCountRef.current).x;
  const PET_Y = getPetPos(0, equippedPetsCountRef.current).y;

  // ── Pet click: block takes priority over skill ────────────────────────────
  const handlePetClick = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (!battleActiveRef.current) return;
    if (manaRef.current >= MAX_MANA && !skillCooldown && pet?.specialSkill) {
      useSpecialSkill();
    }
  }, [useSpecialSkill, skillCooldown, pet?.specialSkill]);

  // ── Potion usage ─────────────────────────────────────────────────────────
  const usePotion = useCallback((slotIndex: number) => {
    const slot = activeSlotsRef.current[slotIndex];
    if (!slot || slot.remaining.length === 0) return;
    if (!battleActiveRef.current) return;
    const inventoryId = slot.remaining[0];
    const isHeal = (slot.healthRestored ?? 0) > 0;
    const isMana = (slot.manaRestored ?? 0) > 0;
    const isRevive = (slot.petsRevived ?? 0) > 0;
    // Guard: don't consume heal potion if active pet is already full
    if (isHeal && !isRevive && petHpRef.current >= petStatsRef.current.maxHp) return;
    if (isMana && manaRef.current >= MAX_MANA) return;
    // Guard: don't consume revive potion if no party members are fainted
    if (isRevive && !isHeal) {
      const hasFainted = extraPetHpsRef.current.some((hp, i) => equippedExtraPetsRef.current[i] && hp <= 0);
      if (!hasFainted) return;
    }
    if (isHeal) {
      const healAmt = slot.healthRestored!;
      petHpRef.current = Math.min(petStatsRef.current.maxHp, petHpRef.current + healAmt);
      setPetHp(petHpRef.current);
      playChime();
      const nd: DamageNumber = { id: dmgIdRef.current++, x: PET_X, y: PET_Y - 14, value: healAmt, isHeal: true };
      setDamageNumbers(prev => [...prev, nd]);
      setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== nd.id)), 1200);
    }
    if (isMana) {
      manaRef.current = Math.min(MAX_MANA, manaRef.current + slot.manaRestored!);
      setMana(Math.floor(manaRef.current));
    }
    if (isRevive) {
      const reviveCount = slot.petsRevived!;
      const newExtraHps = [...extraPetHpsRef.current] as [number, number];
      let revived = 0;
      for (let i = 0; i < 2 && revived < reviveCount; i++) {
        const ep = equippedExtraPetsRef.current[i];
        if (!ep || newExtraHps[i] > 0) continue;
        const epMaxHp = (ep as any).petMaxHp ?? petStatsRef.current.maxHp;
        newExtraHps[i] = Math.max(1, Math.floor(epMaxHp * 0.3));
        revived++;
        const epos = getPetPos(i + 1, equippedPetsCountRef.current);
        const rnd: DamageNumber = { id: dmgIdRef.current++, x: epos.x, y: epos.y - 14, value: newExtraHps[i], isHeal: true };
        setDamageNumbers(prev => [...prev, rnd]);
        setTimeout(() => setDamageNumbers(prev => prev.filter(d => d.id !== rnd.id)), 1400);
      }
      if (revived > 0) {
        extraPetHpsRef.current = newExtraHps;
        setExtraPetHps(newExtraHps);
        playChime();
      }
    }
    const updated = activeSlotsRef.current.map((s, i) =>
      i === slotIndex ? { ...s, remaining: s.remaining.slice(1) } : s
    );
    activeSlotsRef.current = updated;
    setActiveSlots([...updated]);
    potionMutation.mutate({ inventoryId, petInventoryId: pet?.inventoryId ?? "" });
  }, [pet?.inventoryId]);

  // ── Misc ─────────────────────────────────────────────────────────────────
  const handleAdvance = useCallback(() => {
    const nextIdx = waveIndex + 1;
    if (nextIdx < allEnemies.length) startWave(allEnemies[nextIdx], nextIdx);
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

  // ── Loading state ─────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
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
          0% { transform: translate(-50%,-50%) translateY(0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translateY(-60px) scale(1.3); opacity: 0; }
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
          50% { transform: scale(1.04); }
        }
        @keyframes screenShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        @keyframes enemyHitFlash {
          0%   { filter: brightness(1); transform: translate(-50%,-50%) scale(1); }
          20%  { filter: brightness(3) saturate(0); transform: translate(-50%,-50%) scale(1.08); }
          50%  { filter: brightness(1.6); transform: translate(-50%,-50%) scale(0.95); }
          100% { filter: brightness(1); transform: translate(-50%,-50%) scale(1); }
        }
        @keyframes bossHitStagger {
          0%   { filter: brightness(1);   transform: translate(-50%,-50%) translateX(0)     scale(1);    }
          12%  { filter: brightness(5) saturate(0); transform: translate(-50%,-50%) translateX(-14px) scale(1.03); }
          30%  { filter: brightness(2.5); transform: translate(-50%,-50%) translateX(10px)  scale(0.97); }
          50%  { filter: brightness(1.8); transform: translate(-50%,-50%) translateX(-6px)  scale(1.01); }
          70%  { filter: brightness(1.3); transform: translate(-50%,-50%) translateX(4px)   scale(1);    }
          85%  { filter: brightness(1.1); transform: translate(-50%,-50%) translateX(-2px)  scale(1);    }
          100% { filter: brightness(1);   transform: translate(-50%,-50%) translateX(0)     scale(1);    }
        }
        @keyframes bossImpactRing {
          0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 1;   }
          60%  { opacity: 0.6; }
          100% { transform: translate(-50%,-50%) scale(3.2); opacity: 0;   }
        }
        @keyframes petHitBounce {
          0%   { transform: translate(-50%,-50%) translateY(0) scaleX(1) scaleY(1); filter: brightness(1); }
          15%  { transform: translate(-50%,-50%) translateY(-16px) scaleX(0.9) scaleY(1.12); filter: brightness(2.4) saturate(0.2); }
          35%  { transform: translate(-50%,-50%) translateY(5px) scaleX(1.1) scaleY(0.9); filter: brightness(1.4); }
          60%  { transform: translate(-50%,-50%) translateY(-5px) scaleX(0.97) scaleY(1.04); }
          100% { transform: translate(-50%,-50%) translateY(0) scaleX(1) scaleY(1); filter: brightness(1); }
        }
        @keyframes tensionPulse {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 1; }
        }
        @keyframes poisonPulse {
          0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.6; }
          50%  { transform: translate(-50%,-50%) scale(1.22); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1);   opacity: 0.6; }
        }
        @keyframes healBurst {
          0%   { transform: translate(-50%,-50%) scale(0.4); opacity: 1; }
          60%  { transform: translate(-50%,-50%) scale(1.3); opacity: 0.7; }
          100% { transform: translate(-50%,-50%) scale(1.8); opacity: 0; }
        }
        @keyframes skillOrbFly0 {
          0%   { transform: translate(-50%,-50%) translateY(0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translateY(-90px) scale(0.6); opacity: 0; }
        }
        @keyframes skillOrbFly1 {
          0%   { transform: translate(-50%,-50%) translateY(0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translateY(-120px) scale(0.6); opacity: 0; }
        }
        @keyframes skillOrbFly2 {
          0%   { transform: translate(-50%,-50%) translateY(0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translateY(-100px) scale(0.6); opacity: 0; }
        }
        @keyframes comboText {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.25); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rewardSlide {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes xpBarFill {
          from { width: var(--xp-from, 0%); }
          to   { width: var(--xp-to, 0%); }
        }
        @keyframes xpBarShine {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(220%); }
        }
        @keyframes xpLevelUpBurst {
          0%   { transform: translate(-50%,-50%) scale(0.4); opacity: 0; }
          40%  { transform: translate(-50%,-50%) scale(1.15); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1); opacity: 0; }
        }
        @keyframes petBobIdle {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-6px); }
        }
        @keyframes laserPulse {
          0%   { opacity: 0.8; }
          100% { opacity: 1;   }
        }
        @keyframes skillFadeOut {
          0%, 80% { opacity: 1; }
          100%    { opacity: 0; }
        }
        @keyframes lazerOrbRide {
          0%   { top: var(--lz-from-y, 80%); opacity: 0; transform: translate(-50%,-50%) scale(0.6); }
          15%  { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          85%  { opacity: 1; }
          100% { top: var(--lz-to-y, 20%); opacity: 0; transform: translate(-50%,-50%) scale(1.1); }
        }
        @keyframes bubbleFly {
          0%   { opacity: 0; left: var(--bub-from-x, 50%); top: var(--bub-from-y, 80%); transform: translate(-50%,-50%) scale(0.6); }
          15%  { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          90%  { opacity: 1; }
          100% { opacity: 0; left: var(--bub-to-x, 50%); top: var(--bub-to-y, 20%); transform: translate(-50%,-50%) scale(0.5); }
        }
        @keyframes surroundLightPulse {
          0%   { opacity: 0.7; transform: translate(-50%,-50%) scale(0.95); }
          100% { opacity: 1;   transform: translate(-50%,-50%) scale(1.1); }
        }
        @keyframes surroundOrbit {
          0%   { transform: translate(-50%,-50%) rotate(var(--sl-angle,0deg)) translateX(46px) rotate(calc(-1 * var(--sl-angle,0deg))); }
          100% { transform: translate(-50%,-50%) rotate(calc(var(--sl-angle,0deg) + 360deg)) translateX(46px) rotate(calc(-1 * (var(--sl-angle,0deg) + 360deg))); }
        }
        @keyframes largeOrbGrow {
          0%   { width: 24px;  height: 24px;  opacity: 0; }
          15%  { opacity: 1; }
          70%  { width: 160px; height: 160px; opacity: 0.95; }
          100% { width: 220px; height: 220px; opacity: 0; }
        }
        @keyframes missileStreak {
          0%   { opacity: 0; left: var(--ms-from-x, 50%); top: var(--ms-from-y, 80%); transform: translate(-50%,-50%) rotate(0deg) scale(0.8); }
          10%  { opacity: 1; transform: translate(-50%,-50%) rotate(0deg) scale(1); }
          100% { opacity: 0; left: var(--ms-to-x, 50%); top: var(--ms-to-y, 20%); transform: translate(-50%,-50%) rotate(8deg) scale(1.1); }
        }
        @keyframes manaGlow {
          0%   { filter: drop-shadow(0 0 10px rgba(167,139,250,0.7)); }
          50%  { filter: drop-shadow(0 0 22px rgba(167,139,250,1.0)); }
          100% { filter: drop-shadow(0 0 10px rgba(167,139,250,0.7)); }
        }
        @keyframes blockReadyPulse {
          0%,100% { filter: drop-shadow(0 0 16px rgba(239,68,68,0.85)) brightness(1);   }
          50%     { filter: drop-shadow(0 0 34px rgba(239,68,68,1.0))  brightness(1.08); }
        }
        @keyframes skillReadyGlow {
          0%,100% { opacity: 0.7; transform: translate(-50%,-50%) scale(1);    }
          50%     { opacity: 1;   transform: translate(-50%,-50%) scale(1.12); }
        }
        @keyframes manaAura {
          0%   { transform: translate(-50%,-50%) scale(1);    opacity: 0.25; }
          50%  { transform: translate(-50%,-50%) scale(1.18); opacity: 0.5; }
          100% { transform: translate(-50%,-50%) scale(1);    opacity: 0.25; }
        }
        @keyframes petRarityGlow {
          0%,100% { filter: drop-shadow(0 0 12px var(--rarity-glow, #a78bfa)) drop-shadow(0 0 4px var(--rarity-glow, #a78bfa)); }
          50%     { filter: drop-shadow(0 0 28px var(--rarity-glow, #a78bfa)) drop-shadow(0 0 10px var(--rarity-glow, #a78bfa)) brightness(1.1); }
        }
        @keyframes chargeRingPulse {
          0%   { transform: translate(-50%,-50%) scale(1);    opacity: 0.5; box-shadow: 0 0 0 0 rgba(255,60,60,0.6); }
          50%  { transform: translate(-50%,-50%) scale(1.12); opacity: 0.9; box-shadow: 0 0 0 12px rgba(255,60,60,0.0); }
          100% { transform: translate(-50%,-50%) scale(1);    opacity: 0.5; box-shadow: 0 0 0 0 rgba(255,60,60,0.6); }
        }
        @keyframes chargeBarFill {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes parrySuccessFlash {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.5); }
          30%  { opacity: 1; transform: translate(-50%,-50%) scale(1.2); }
          70%  { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(0.9); }
        }
        @keyframes parryFailFlash {
          0%   { opacity: 0; }
          20%  { opacity: 0.8; }
          80%  { opacity: 0.6; }
          100% { opacity: 0; }
        }
        @keyframes counterGlow {
          0%   { transform: translate(-50%,-50%) scale(1);    opacity: 0.35; border-color: rgba(253,230,138,0.7); }
          50%  { transform: translate(-50%,-50%) scale(1.12); opacity: 0.65; border-color: rgba(253,230,138,1); }
          100% { transform: translate(-50%,-50%) scale(1);    opacity: 0.35; border-color: rgba(253,230,138,0.7); }
        }
        @keyframes parryButtonPulse {
          0%   { box-shadow: 0 0 0 0 rgba(74,222,128,0.7); transform: scale(1); }
          50%  { box-shadow: 0 0 0 10px rgba(74,222,128,0.0); transform: scale(1.06); }
          100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.7); transform: scale(1); }
        }
        @keyframes rageFlash {
          0%   { opacity: 0; }
          30%  { opacity: 0.25; }
          100% { opacity: 0; }
        }
        @keyframes ragePulse {
          0%,100% { filter: drop-shadow(0 0 22px rgba(255,40,40,0.85)); }
          50%      { filter: drop-shadow(0 0 42px rgba(255,100,20,1)); }
        }
        @keyframes bossAuraPulse {
          0%,100% { opacity: 0.75; transform: translate(-50%, -50%) scale(1); }
          50%     { opacity: 1;    transform: translate(-50%, -50%) scale(1.08); }
        }
        @keyframes bossFloat {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(-7px); }
          100% { transform: translateY(0px); }
        }
        @keyframes enemyBounce {
          0%, 100% { transform: translate(-50%,-50%) scaleY(1) scaleX(1); }
          50%       { transform: translate(-50%,-50%) scaleY(0.95) scaleX(1.05); }
        }
      `}</style>

      <div
        ref={arenaRef}
        className="relative w-full h-full"
        style={{ animation: shakeScreen ? "screenShake 0.15s ease-in-out" : undefined, touchAction: "none" }}
        onPointerDown={phase === "battle" ? handleSlashStart : undefined}
        onPointerMove={phase === "battle" ? handleSlashMove : undefined}
        onPointerUp={phase === "battle" ? handleSlashEnd : undefined}
        onPointerCancel={phase === "battle" ? handleSlashEnd : undefined}
      >
        {/* Background */}
        <div className="absolute inset-0">
          {bgUrl ? (
            <img src={bgUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/65" />
        </div>

        {/* Boss rage red tint */}
        {bossRage && phase === "battle" && (
          <div className="absolute inset-0 pointer-events-none z-5"
            style={{ background: "radial-gradient(ellipse at 50% 20%, rgba(255,30,30,0.15) 0%, transparent 65%)", animation: "tensionPulse 1.2s ease-in-out infinite" }} />
        )}

        {/* ── INTRO ───────────────────────────────────────────────────── */}
        {phase === "intro" && enemy && pet && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-30">
            <div style={{ animation: "introSlide 0.7s ease-out" }} className="flex flex-col items-center">
              {enemy.imageUrl && (
                <img
                  src={enemy.imageUrl}
                  alt={enemy.name}
                  style={{ width: enemy.isBoss ? 156 : 108, height: enemy.isBoss ? 156 : 108 }}
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
            <div style={{ animation: "petIntro 0.7s ease-out 0.25s both" }} className="flex flex-col items-center">
              <div className="w-36 flex items-center justify-center" style={{ aspectRatio: "1/1" }}>
                {pet.petTemplateId ? (
                  <PetAnimator petTemplateId={pet.petTemplateId} mode="idle" view="front" size={200} className="w-full h-full" />
                ) : pet.imageUrl ? (
                  <img src={pet.imageUrl} alt={pet.name} className="w-full object-contain drop-shadow-lg" style={{ maxHeight: "144px" }} />
                ) : (
                  <img src={petPawIcon} alt="" style={{ width: 72, height: 72, objectFit: "contain" }} />
                )}
              </div>
              <div className="mt-2 px-4 py-2 bg-black/70 rounded-lg" style={{ borderColor: accent + "80", borderWidth: 1 }}>
                <span className="font-bold text-lg" style={{ color: accent }}>{pet.name}</span>
                <span className="text-gray-400 text-sm ml-2">Lv.{pet.level}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── BATTLE UI ────────────────────────────────────────────────── */}
        {(phase === "battle" || phase === "victory" || phase === "waveComplete" || phase === "defeat") && enemy && pet && (
          <>
            {/* Top HUD */}
            <div className="absolute top-0 left-0 right-0 z-20 px-3 pb-2" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    {enemy.isBoss && <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">BOSS</span>}
                    {bossRage && <span className="text-[10px] bg-orange-600 text-white px-1.5 py-0.5 rounded-full font-bold" style={{ animation: "tensionPulse 0.6s ease-in-out infinite" }}>RAGE</span>}
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
                  <div className="text-gray-400 text-[10px] mt-0.5">{enemyHp} / {enemyMaxHp}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowTutorial(true)}
                    className="p-1.5 bg-black/50 rounded-full"
                    data-testid="button-battle-help"
                    style={{ border: `1px solid ${accent}40`, color: `${accent}cc` }}
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleReturnToWorld}
                    className="p-1.5 bg-black/50 rounded-full"
                    data-testid="button-flee-battle"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Enemy sprite ───────────────────────────────────────── */}
            {phase === "battle" && (
              <div
                className="absolute z-10 pointer-events-none"
                style={{
                  left: `${enemyPos.x}%`,
                  top: `${enemyPos.y}%`,
                  transform: "translate(-50%, -50%)",
                  animation: enemyHit
                    ? (enemy.isBoss ? "bossHitStagger 0.36s ease-out" : "enemyHitFlash 0.22s ease-in-out")
                    : enemy.isBoss
                      ? "bossFloat 3s ease-in-out infinite"
                      : "enemyBounce 0.7s ease-in-out infinite",
                }}
              >
                {/* Charge ring around enemy */}
                {enemyCharging && (
                  <div style={{
                    position: "absolute",
                    left: "50%", top: "50%",
                    width: enemy.isBoss ? 200 : 120,
                    height: enemy.isBoss ? 200 : 120,
                    borderRadius: "50%",
                    border: "3px solid rgba(255,60,60,0.85)",
                    boxShadow: "0 0 20px rgba(255,40,40,0.7), 0 0 8px rgba(255,40,40,0.5)",
                    animation: "chargeRingPulse 0.55s ease-in-out infinite",
                  }} />
                )}

                {/* Charge fill bar below enemy */}
                {enemyCharging && (
                  <div style={{
                    position: "absolute",
                    bottom: enemy.isBoss ? -36 : -22,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: enemy.isBoss ? 90 : 64,
                    height: 4,
                    background: "rgba(0,0,0,0.5)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      background: "linear-gradient(90deg, #ff4444, #ff8800)",
                      borderRadius: 3,
                      animation: `chargeBarFill ${chargeDurationRef.current}ms linear forwards`,
                    }} />
                  </div>
                )}

                {/* Charging label */}
                {enemyCharging && (
                  <div style={{
                    position: "absolute",
                    top: enemy.isBoss ? -48 : -32,
                    left: "50%",
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    fontFamily: "Lora, serif",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#ff4444",
                    textShadow: "0 0 10px rgba(255,60,60,0.9), 0 1px 0 #000",
                    letterSpacing: "0.12em",
                    animation: "tensionPulse 0.4s ease-in-out infinite",
                  }}>
                    <img src={warningRunePng} alt="" style={{ width: 13, height: 13, objectFit: "contain", verticalAlign: "middle", marginRight: 4, display: "inline-block" }} />
                    INCOMING!
                  </div>
                )}

                {/* Boss rage glow overlay */}
                {enemy.isBoss && bossRage && (
                  <div style={{
                    position: "absolute",
                    left: "50%", top: "50%",
                    width: 180, height: 180,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(255,40,0,0.2) 0%, transparent 70%)",
                    transform: "translate(-50%, -50%)",
                    animation: "tensionPulse 0.8s ease-in-out infinite",
                    pointerEvents: "none",
                  }} />
                )}

                {/* Counter window aura on enemy (golden) */}
                {counterActive && (
                  <div style={{
                    position: "absolute",
                    left: "50%", top: "50%",
                    width: enemy.isBoss ? 180 : 110,
                    height: enemy.isBoss ? 180 : 110,
                    borderRadius: "50%",
                    border: "2.5px solid rgba(253,230,138,0.8)",
                    boxShadow: "0 0 24px rgba(253,230,138,0.7), 0 0 8px rgba(253,230,138,0.5)",
                    animation: "counterGlow 0.6s ease-in-out infinite",
                  }} />
                )}

                {/* Boss radial aura — dark red/orange halo for dramatic weight */}
                {enemy.isBoss && (
                  <div style={{
                    position: "absolute",
                    left: "50%", top: "50%",
                    width: 320, height: 320,
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    background: bossRage
                      ? "radial-gradient(circle, rgba(255,60,20,0.45) 0%, rgba(200,20,0,0.22) 35%, transparent 70%)"
                      : "radial-gradient(circle, rgba(160,20,20,0.38) 0%, rgba(90,10,10,0.18) 40%, transparent 72%)",
                    filter: "blur(2px)",
                    animation: "bossAuraPulse 2.8s ease-in-out infinite",
                    pointerEvents: "none",
                    zIndex: -1,
                  }} />
                )}

                {enemy.imageUrl ? (
                  <img
                    src={enemy.imageUrl}
                    alt={enemy.name}
                    style={{
                      width: enemy.isBoss ? 230 : 120,
                      height: enemy.isBoss ? 230 : 120,
                      display: "block",
                      filter: bossRage && enemy.isBoss
                        ? "drop-shadow(0 0 18px rgba(255,40,40,0.9))"
                        : enemy.isBoss
                          ? "drop-shadow(0 0 14px rgba(255,80,80,0.7))"
                          : undefined,
                      animation: bossRage && enemy.isBoss ? "ragePulse 1.4s ease-in-out infinite" : undefined,
                    }}
                    className="object-contain"
                  />
                ) : (
                  <div
                    className="flex items-center justify-center bg-red-900/50 border-2 border-red-500 rounded-full"
                    style={{ width: enemy.isBoss ? 230 : 120, height: enemy.isBoss ? 230 : 120 }}
                  >
                    <Swords style={{ width: enemy.isBoss ? 80 : 44, height: enemy.isBoss ? 80 : 44, color: "#f87171" }} />
                  </div>
                )}

                {enemy.isBoss && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-widest whitespace-nowrap"
                    style={{
                      color: bossRage ? "#ff8820" : "#ff4444",
                      textShadow: bossRage ? "0 0 14px rgba(255,140,20,0.9)" : "0 0 10px rgba(255,0,0,0.8)",
                      animation: bossRage ? "tensionPulse 0.5s ease-in-out infinite" : undefined,
                    }}>
                    <img src={bossRage ? rageFlamePng : warningRunePng} alt="" style={{ width: 13, height: 13, objectFit: "contain", verticalAlign: "middle", marginRight: 4, display: "inline-block" }} />
                    {bossRage ? "RAGE" : "BOSS"}
                    <img src={bossRage ? rageFlamePng : warningRunePng} alt="" style={{ width: 13, height: 13, objectFit: "contain", verticalAlign: "middle", marginLeft: 4, display: "inline-block" }} />
                  </div>
                )}
              </div>
            )}

            {/* ── Extra pet sprites (slots 1 & 2) ──────────────────────── */}
            {([0, 1] as const).map((si) => {
              const ep = equippedExtraPetsRef.current[si];
              if (!ep) return null;
              const pidx = si + 1;
              const total = equippedPetsCountRef.current;
              const epos = getPetPos(pidx, total);
              const eHp = extraPetHps[si];
              const eMaxHp = extraPetMaxHps[si];
              const isDead = eHp <= 0;
              const epName = (ep as any).petNickname || ep.name || "Pet";
              const epRarity = Math.max(0, Math.min(5, (ep as any).rarity || 0));
              return (
                <div key={`extra-pet-${si}`} className="absolute z-10 flex flex-col items-center" style={{ left: `${epos.x}%`, top: `${epos.y}%`, transform: "translate(-50%,-50%)", filter: isDead ? "grayscale(1) opacity(0.35)" : undefined }}>
                  {(ep as any).petTemplateId ? (
                    <PetAnimator petTemplateId={(ep as any).petTemplateId} mode="idle" view="front" size={PET_SPRITE_SIZE} />
                  ) : (ep.hatchedImageUrl || ep.imageUrl) ? (
                    <img src={(ep.hatchedImageUrl || ep.imageUrl)!} alt={ep.name} className="object-contain" style={{ width: PET_SPRITE_SIZE, height: PET_SPRITE_SIZE }} />
                  ) : (
                    <img src={petPawIcon} alt="" style={{ width: PET_SPRITE_SIZE * 0.5, height: PET_SPRITE_SIZE * 0.5, objectFit: "contain" }} />
                  )}
                  {/* HP bar for extra pet */}
                  <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ width: 92, background: "rgba(0,0,0,0.5)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, (eHp / Math.max(1, eMaxHp)) * 100)}%`, background: eHp / Math.max(1, eMaxHp) > 0.5 ? "#4ade80" : eHp / Math.max(1, eMaxHp) > 0.2 ? "#facc15" : "#ef4444" }} />
                  </div>
                  {/* Name */}
                  <div className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide whitespace-nowrap"
                    style={{ color: "#fff", background: "rgba(0,0,0,0.55)", textShadow: "0 0 6px rgba(0,0,0,0.9)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {epName}
                  </div>
                  {/* Stars */}
                  {epRarity > 0 && (
                    <div className="flex items-center gap-[1px] mt-0.5" style={{ filter: "drop-shadow(0 0 3px rgba(0,0,0,0.9))" }}>
                      {Array.from({ length: epRarity }).map((_, k) => (
                        <Star key={k} style={{ width: 10, height: 10, color: "#fbbf24", fill: "#fbbf24" }} />
                      ))}
                    </div>
                  )}
                  {isDead && (
                    <div className="text-[9px] font-black text-red-400" style={{ textShadow: "0 0 6px rgba(239,68,68,0.8)" }}>FAINTED</div>
                  )}
                </div>
              );
            })}

            {/* ── Pet sprite (active, slot 0) ─────────────────────────── */}
            <div
              className="absolute z-10"
              style={{
                left: `${PET_X}%`,
                top: `${PET_Y}%`,
                transform: "translate(-50%, -50%)",
                animation: petHit ? "petHitBounce 0.42s ease-out" : undefined,
                filter: petHit
                  ? "drop-shadow(0 0 14px rgba(239,68,68,0.9))"
                  : petHp <= 0
                    ? "grayscale(1) opacity(0.35)"
                    : undefined,
                pointerEvents: (phase === "battle" && (mana >= MAX_MANA && !skillCooldown && !!pet.specialSkill) && petHp > 0) ? "auto" : "none",
                cursor: (mana >= MAX_MANA && !skillCooldown && !!pet.specialSkill && petHp > 0) ? "pointer" : "default",
                ["--rarity-glow" as any]: rarityColor,
              }}
              onPointerDown={handlePetClick}
              data-testid="pet-battle-sprite"
            >
              {/* Counter window golden ring */}
              {counterActive && (
                <div style={{
                  position: "absolute", left: "50%", top: "50%",
                  width: 210, height: 210, borderRadius: "50%",
                  border: "2.5px solid rgba(253,230,138,0.9)",
                  boxShadow: "0 0 28px rgba(253,230,138,0.8), 0 0 10px rgba(251,191,36,0.6)",
                  animation: "counterGlow 0.55s ease-in-out infinite",
                }} />
              )}
              {pet.petTemplateId ? (
                <PetAnimator
                  petTemplateId={pet.petTemplateId}
                  mode="idle"
                  view="front"
                  size={PET_SPRITE_SIZE}
                  style={mana >= MAX_MANA && !skillCooldown && !!pet.specialSkill ? { animation: "petRarityGlow 1s ease-in-out infinite" } : undefined}
                />
              ) : pet.imageUrl ? (
                <img
                  src={pet.imageUrl}
                  alt={pet.name}
                  className="object-contain drop-shadow-lg"
                  style={{ width: PET_SPRITE_SIZE, height: PET_SPRITE_SIZE, animation: mana >= MAX_MANA && !skillCooldown && !!pet.specialSkill ? "petRarityGlow 1s ease-in-out infinite" : undefined }}
                />
              ) : (
                <img src={petPawIcon} alt="" style={{ width: PET_SPRITE_SIZE * 0.5, height: PET_SPRITE_SIZE * 0.5, objectFit: "contain" }} />
              )}

              {/* Active pet HP + mana + name + stars (matches extras) */}
              <div className="absolute flex flex-col items-center" style={{ left: "50%", top: "100%", transform: "translate(-50%, 4px)", pointerEvents: "none", width: 92 }}>
                {/* HP bar */}
                <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 92, background: "rgba(0,0,0,0.5)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, (petHp / Math.max(1, petMaxHp)) * 100)}%`, background: hpBarColor(petHp, petMaxHp), boxShadow: `0 0 6px ${hpBarColor(petHp, petMaxHp)}80` }} />
                </div>
                {/* Mana bar (only if pet has a skill) */}
                {pet.specialSkill && (
                  <div className="h-1.5 rounded-full overflow-hidden mt-0.5" style={{ width: 92, background: "rgba(0,0,0,0.5)" }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${(mana / MAX_MANA) * 100}%`,
                      background: mana >= MAX_MANA ? "linear-gradient(90deg, #7c3aed, #a78bfa, #c4b5fd)" : "linear-gradient(90deg, #4c1d95, #7c3aed)",
                      boxShadow: mana >= MAX_MANA ? "0 0 8px rgba(167,139,250,0.9)" : undefined,
                    }} />
                  </div>
                )}
                {/* Name */}
                <div className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide whitespace-nowrap"
                  style={{ color: "#fff", background: "rgba(0,0,0,0.55)", textShadow: "0 0 6px rgba(0,0,0,0.9)", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {(pet as any).petNickname || pet.name}
                </div>
                {((pet as any).rarity || 0) > 0 && (
                  <div className="flex items-center gap-[1px] mt-0.5" style={{ filter: "drop-shadow(0 0 3px rgba(0,0,0,0.9))" }}>
                    {Array.from({ length: Math.min(5, Math.max(0, (pet as any).rarity || 0)) }).map((_, k) => (
                      <Star key={k} style={{ width: 10, height: 10, color: "#fbbf24", fill: "#fbbf24" }} />
                    ))}
                  </div>
                )}
              </div>

              {/* Counter hits badge */}
              {counterActive && counterHitsLeft > 0 && (
                <div style={{
                  position: "absolute",
                  top: -10,
                  right: -6,
                  background: "linear-gradient(135deg, #f59e0b, #fde68a)",
                  color: "#78350f",
                  fontWeight: 900,
                  fontSize: 10,
                  borderRadius: 8,
                  padding: "2px 6px",
                  boxShadow: "0 0 10px rgba(253,230,138,0.8)",
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap",
                }}>
                  <img src={counterLightningPng} alt="" style={{ width: 12, height: 12, objectFit: "contain", verticalAlign: "middle", marginRight: 3, display: "inline-block" }} />
                  ×{counterHitsLeft} 2×
                </div>
              )}

            </div>

            {/* ── Block & Skill buttons on the right ─────────────────── */}
            {phase === "battle" && (
              <div className="absolute z-20 flex flex-col gap-4"
                style={{ right: "4%", top: "52%", transform: "translateY(-50%)", pointerEvents: "auto" }}>

                {/* Block button — hold to shield (no cooldown, 5s max per hold) */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    data-testid="button-battle-block"
                    onPointerDown={(e) => { e.stopPropagation(); startBlock(); }}
                    onPointerUp={() => endBlock()}
                    onPointerLeave={() => endBlock()}
                    className="relative rounded-2xl flex items-center justify-center transition-all active:scale-90"
                    style={{
                      width: 64, height: 64,
                      background: blockHeld
                        ? "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)"
                        : "linear-gradient(135deg, rgba(30,58,138,0.55) 0%, rgba(37,99,235,0.35) 100%)",
                      border: blockHeld
                        ? "2.5px solid rgba(147,197,253,1)"
                        : "2px solid rgba(96,165,250,0.55)",
                      boxShadow: blockHeld
                        ? "0 0 22px rgba(96,165,250,0.85), 0 0 10px rgba(147,197,253,0.6), 0 2px 8px rgba(0,0,0,0.6)"
                        : "0 0 12px rgba(96,165,250,0.45), 0 2px 8px rgba(0,0,0,0.55)",
                      opacity: 1,
                      animation: blockHeld ? "blockReadyPulse 0.55s ease-in-out infinite" : undefined,
                    }}
                  >
                    <img src={blockIconPng} alt="Block" style={{ width: 40, height: 40, objectFit: "contain" }} />
                    {blockHeld && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full"
                        style={{ background: "#60a5fa", boxShadow: "0 0 8px rgba(96,165,250,0.9)" }} />
                    )}
                  </button>
                  <span className="font-fantasy text-[9px] tracking-widest"
                    style={{ color: blockHeld ? "#93c5fd" : "#60a5fa", textShadow: blockHeld ? "0 0 8px rgba(147,197,253,0.9)" : "0 0 6px rgba(96,165,250,0.5)" }}>
                    BLOCK
                  </span>
                </div>

              </div>
            )}

            {/* Block result flash */}
            {parryResult === "success" && (
              <div className="absolute inset-0 pointer-events-none z-40 flex items-center justify-center">
                <div style={{
                  fontFamily: "Lora, serif",
                  fontSize: 28,
                  fontWeight: 900,
                  color: "#4ade80",
                  textShadow: "0 0 28px rgba(74,222,128,0.9), 0 0 12px rgba(74,222,128,0.6), 0 2px 0 #000",
                  letterSpacing: "0.16em",
                  animation: "parrySuccessFlash 0.9s ease-out forwards",
                }}>BLOCK!</div>
              </div>
            )}
            {parryResult === "fail" && (
              <div className="absolute inset-0 pointer-events-none z-5"
                style={{ background: "rgba(239,68,68,0.14)", animation: "parryFailFlash 0.6s ease-out forwards" }} />
            )}

            {/* Swipe hint */}
            {phase === "battle" && !enemyCharging && (
              <div className="absolute z-10 pointer-events-none"
                style={{ bottom: "22%", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
                <div className="text-white/22 text-[10px] font-medium animate-pulse tracking-widest text-center">
                  Swipe through the enemy · hold BLOCK · tap your glowing pet to cast its skill
                </div>
              </div>
            )}

            {/* ── Bottom Toolbar ────────────────────────────────────────── */}
            <div className="absolute bottom-0 left-0 right-0 z-20"
              style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 70%, transparent 100%)", padding: "10px 14px 12px" }}>

              {/* Potion slots */}
              <div className="flex gap-2 items-center justify-start">
                {Array.from({ length: 5 }, (_, i) => {
                  const slot = activeSlots[i];
                  const qty = slot?.remaining.length ?? 0;
                  const isEmpty = !slot || qty === 0;
                  const isHeal = slot && (slot.healthRestored ?? 0) > 0;
                  const isMana = slot && (slot.manaRestored ?? 0) > 0;
                  const isRevive = slot && (slot.petsRevived ?? 0) > 0;
                  return (
                    <button
                      key={i}
                      data-testid={`button-potion-slot-${i}`}
                      onPointerDown={(e) => { e.stopPropagation(); usePotion(i); }}
                      disabled={isEmpty || phase !== "battle"}
                      className="relative flex items-center justify-center rounded-full border transition-all active:scale-90"
                      style={{
                        width: 44, height: 44,
                        background: isEmpty ? "rgba(0,0,0,0.4)" : isRevive ? "rgba(120,60,0,0.5)" : isMana ? "rgba(76,29,149,0.5)" : "rgba(20,80,30,0.5)",
                        borderColor: isEmpty ? "rgba(255,255,255,0.1)" : isRevive ? "rgba(251,191,36,0.6)" : isMana ? "rgba(167,139,250,0.5)" : "rgba(34,197,94,0.45)",
                        boxShadow: isEmpty ? undefined : isRevive ? "0 0 8px rgba(251,191,36,0.4)" : isMana ? "0 0 8px rgba(124,58,237,0.4)" : "0 0 8px rgba(34,197,94,0.3)",
                        opacity: isEmpty ? 0.35 : 1,
                        cursor: isEmpty ? "not-allowed" : "pointer",
                      }}
                    >
                      {isEmpty ? (
                        <span className="text-white/20 text-lg">+</span>
                      ) : slot.imageUrl ? (
                        <img src={slot.imageUrl} alt={slot.name} className="w-7 h-7 object-contain" />
                      ) : isRevive ? (
                        <span className="text-lg">✨</span>
                      ) : isHeal ? (
                        <Heart className="w-5 h-5 fill-red-400/40" style={{ color: "#f87171" }} />
                      ) : (
                        <Droplets className="w-5 h-5" style={{ color: "#a78bfa" }} />
                      )}
                      {!isEmpty && qty > 0 && (
                        <div className="absolute -bottom-0.5 -right-0.5 rounded-full text-[8px] font-bold px-1 min-w-[14px] text-center leading-none py-0.5"
                          style={{ background: isMana ? "#7c3aed" : "#16a34a", color: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                          {qty}
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Combo counter pill (right side) */}
                {comboCount > 1 && phase === "battle" && (
                  <div
                    className="ml-auto font-black text-sm"
                    style={{ color: "#fbbf24", textShadow: "0 0 10px rgba(251,191,36,0.8), 0 1px 0 #000", animation: "comboText 0.3s ease-out", whiteSpace: "nowrap" }}
                    data-testid="text-combo-count"
                  >
                    {comboCount}× COMBO
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Swipe trail SVG ─────────────────────────────────────────── */}
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
            <path d={buildSlashPath(slashTrail)} stroke={counterActive ? "#fde68a" : accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
              fill="none" opacity={trailFading ? 0 : 0.35} filter="url(#slashGlow)"
              style={{ transition: trailFading ? "opacity 0.32s ease-out" : undefined }} />
            <path d={buildSlashPath(slashTrail)} stroke={counterActive ? "#fde68a" : accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              fill="none" opacity={trailFading ? 0 : 0.95}
              style={{ transition: trailFading ? "opacity 0.32s ease-out" : undefined }} />
            <path d={buildSlashPath(slashTrail)} stroke="white" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round"
              fill="none" opacity={trailFading ? 0 : 0.65}
              style={{ transition: trailFading ? "opacity 0.32s ease-out" : undefined }} />
          </svg>
        )}

        {/* Enemy hit spark particles */}
        {sparkParticles.map(spark => (
          <div key={spark.id} className="absolute pointer-events-none rounded-full z-35"
            style={{
              left: `${spark.x}%`, top: `${spark.y}%`, width: 6, height: 6, marginLeft: -3, marginTop: -3,
              background: spark.color, boxShadow: `0 0 8px ${spark.color}, 0 0 3px white`,
              animation: "sparkFly 0.45s ease-out forwards",
              ["--spark-dx" as any]: `${spark.dx * 13}px`, ["--spark-dy" as any]: `${spark.dy * 13}px`,
            }} />
        ))}

        {/* Pet hit particles */}
        {petHitParticles.map(spark => (
          <div key={spark.id} className="absolute pointer-events-none rounded-full z-35"
            style={{
              left: `${spark.x}%`, top: `${spark.y}%`, width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5,
              background: spark.color, boxShadow: `0 0 10px ${spark.color}, 0 0 4px white`,
              animation: "sparkFly 0.5s ease-out forwards",
              ["--spark-dx" as any]: `${spark.dx * 14}px`, ["--spark-dy" as any]: `${spark.dy * 14}px`,
            }} />
        ))}

        {/* Boss slash overlay */}
        {bossSlashActive && (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
            style={{ background: "rgba(220,38,38,0.18)", animation: "parryFailFlash 0.65s ease-out forwards" }}>
            <img src={crossedSwordsPng} alt="" style={{ width: 100, height: 100, objectFit: "contain", filter: "drop-shadow(0 0 28px rgba(220,38,38,0.95)) drop-shadow(0 0 10px rgba(255,80,80,0.7))", opacity: 0.9 }} />
          </div>
        )}

        {/* Bolt projectiles (auto-attack and boss special) */}
        {boltProjectiles.map(bolt => {
          const elapsed = Date.now() - bolt.startTime;
          const progress = Math.min(1, elapsed / bolt.duration);
          const currentX = bolt.fromX + (bolt.toX - bolt.fromX) * progress;
          const currentY = bolt.fromY + (bolt.toY - bolt.fromY) * progress;
          return (
            <div key={bolt.id} className="absolute z-30 pointer-events-none"
              style={{ left: `${currentX}%`, top: `${currentY}%`, transform: "translate(-50%, -50%)" }}>
              <div style={{
                width: bolt.isBossSpecial ? 18 : 11, height: bolt.isBossSpecial ? 18 : 11, borderRadius: "50%",
                background: bolt.isBossSpecial ? "radial-gradient(circle, #ff8800, #ff2200)" : "radial-gradient(circle, #88aaff, #4466ff)",
                boxShadow: bolt.isBossSpecial ? "0 0 16px #ff6600, 0 0 6px white" : "0 0 10px #88aaff, 0 0 4px white",
              }} />
            </div>
          );
        })}

        {/* Auto-attack orbs from extra pets */}
        {autoOrbs.map(orb => {
          const elapsed = Date.now() - orb.startTime;
          const progress = Math.min(1, elapsed / orb.duration);
          const currentX = orb.fromX + (orb.toX - orb.fromX) * progress;
          const currentY = orb.fromY + (orb.toY - orb.fromY) * progress;
          const colors = ["#88ffaa", "#ffaa88"];
          const color = colors[(orb.petIdx - 1) % colors.length];
          return (
            <div key={orb.id} className="absolute z-28 pointer-events-none"
              style={{ left: `${currentX}%`, top: `${currentY}%`, transform: "translate(-50%, -50%)" }}>
              <div style={{
                width: 9, height: 9, borderRadius: "50%",
                background: `radial-gradient(circle, ${color}, ${color}88)`,
                boxShadow: `0 0 9px ${color}`,
                opacity: 1 - progress * 0.3,
              }} />
            </div>
          );
        })}

        {/* Boss impact shockwave ring */}
        {bossShockwave && (
          <div key={bossShockwave.id} className="absolute z-25 pointer-events-none"
            style={{ left: `${bossShockwave.x}%`, top: `${bossShockwave.y}%` }}>
            <div style={{
              position: "absolute",
              width: 90, height: 90,
              borderRadius: "50%",
              border: "3px solid rgba(255,200,80,0.9)",
              boxShadow: "0 0 20px rgba(255,180,50,0.8), inset 0 0 12px rgba(255,220,100,0.4)",
              animation: "bossImpactRing 0.5s ease-out forwards",
            }} />
          </div>
        )}

        {/* Slash hit marks on enemy */}
        {slashEffects.map(slash => (
          <div key={slash.id} className="absolute z-30 pointer-events-none"
            style={{ left: `${slash.x}%`, top: `${slash.y}%`, transform: "translate(-50%, -50%)" }}>
            <img src={hitMarkPng} alt="" style={{ animation: "slashMarkAnim 0.45s ease-out forwards", width: 44, height: 44, objectFit: "contain", filter: `drop-shadow(0 0 10px ${counterActive ? "#fde68a" : accent}) drop-shadow(0 0 4px white)` }} />
            <div className="absolute inset-0 w-14 h-14 -m-3 rounded-full" style={{ animation: "slashRingAnim 0.4s ease-out forwards", border: `2px solid ${counterActive ? "#fde68a" : accent}`, boxShadow: `0 0 12px ${counterActive ? "#fde68a" : accent}` }} />
          </div>
        ))}

        {/* Damage numbers */}
        {damageNumbers.map(dmg => (
          <div key={dmg.id} className="absolute z-40 pointer-events-none font-black"
            style={{
              left: `${dmg.x}%`, top: `${dmg.y}%`,
              animation: "dmgFloat 0.85s ease-out forwards",
              fontSize: dmg.isCrit ? "28px" : dmg.isHeal ? "24px" : "22px",
              color: dmg.isHeal ? "#22c55e" : dmg.isCrit ? "#fbbf24" : "#ef4444",
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}
            data-testid="text-damage-number">
            {dmg.isCrit && "💥"}
            {dmg.isHeal && "+"}
            {dmg.value}
          </div>
        ))}

        {/* ── Special skill visuals (3-second showcases) ───────────────── */}
        {/* Lazer: rarity-colored beam from active pet to the enemy.
            Higher-rarity pets get extra light orbs riding the beam. */}
        {skillEffect === "Lazer" && enemyPos.y < PET_Y && (() => {
          const orbCount = Math.min(8, 1 + (pet?.rarity ?? 1)); // 2..6 orbs
          const beamRgb = rarityColor;
          return (
            <>
              <div className="absolute pointer-events-none z-36" style={{
                left: `${PET_X}%`, bottom: `${100 - PET_Y}%`, transform: "translateX(-50%)", width: 8,
                height: `${PET_Y - enemyPos.y}%`,
                background: `linear-gradient(0deg, ${beamRgb} 0%, ${beamRgb}cc 60%, transparent 100%)`,
                boxShadow: `0 0 18px ${beamRgb}, 0 0 6px white`, borderRadius: 4,
                animation: "laserPulse 0.12s ease-in-out infinite alternate, skillFadeOut 3s ease-out forwards",
              }} />
              {Array.from({ length: orbCount }).map((_, i) => (
                <div key={`lzo-${i}`} className="absolute pointer-events-none z-37" style={{
                  left: `${PET_X}%`, top: `${PET_Y}%`,
                  transform: "translate(-50%,-50%)",
                  width: 10, height: 10, borderRadius: "50%",
                  background: `radial-gradient(circle, white 0%, ${beamRgb} 60%, transparent 100%)`,
                  boxShadow: `0 0 12px ${beamRgb}`,
                  // CSS vars consumed by the keyframes below to ride the beam.
                  ["--lz-from-y" as any]: `${PET_Y}%`,
                  ["--lz-to-y" as any]: `${enemyPos.y}%`,
                  animation: `lazerOrbRide 1.4s ${i * 0.18}s linear infinite`,
                  opacity: 0.95,
                }} />
              ))}
            </>
          );
        })()}

        {/* Bubble: stream of rarity-colored orbs flying from caster to enemy. */}
        {skillEffect === "Bubble" && (() => {
          const tint = rarityColor;
          const count = 5 + Math.min(4, (pet?.rarity ?? 1)); // 6..9 orbs
          return Array.from({ length: count }).map((_, i) => (
            <div key={`bub-${i}`} className="absolute pointer-events-none z-36" style={{
              left: `${PET_X}%`, top: `${PET_Y}%`, transform: "translate(-50%,-50%)",
              width: 22, height: 22, borderRadius: "50%",
              background: `radial-gradient(circle at 35% 30%, white, ${tint})`,
              border: `1.5px solid ${tint}`,
              boxShadow: `0 0 14px ${tint}`,
              ["--bub-from-x" as any]: `${PET_X}%`,
              ["--bub-from-y" as any]: `${PET_Y}%`,
              ["--bub-to-x" as any]: `${enemyPos.x}%`,
              ["--bub-to-y" as any]: `${enemyPos.y}%`,
              animation: `bubbleFly 1.1s ${i * 0.16}s ease-out forwards`,
              opacity: 0,
            }} />
          ));
        })()}

        {/* Surrounding Light: green light + orbs wrap the caster (self only). */}
        {skillEffect === "Surrounding Light" && (
          <>
            <div className="absolute pointer-events-none z-36" style={{
              left: `${PET_X}%`, top: `${PET_Y}%`, transform: "translate(-50%,-50%)",
              width: 140, height: 140, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(74,222,128,0.55) 0%, rgba(34,197,94,0.25) 50%, transparent 75%)",
              boxShadow: "0 0 40px rgba(74,222,128,0.7), 0 0 80px rgba(34,197,94,0.5)",
              animation: "surroundLightPulse 1.2s ease-in-out infinite alternate, skillFadeOut 3s ease-out forwards",
            }} />
            {[0,1,2,3,4,5,6,7].map((i) => (
              <div key={`sl-${i}`} className="absolute pointer-events-none z-37" style={{
                left: `${PET_X}%`, top: `${PET_Y}%`, transform: "translate(-50%,-50%)",
                width: 12, height: 12, borderRadius: "50%",
                background: "radial-gradient(circle, #ecfccb 0%, #22c55e 60%, transparent 100%)",
                boxShadow: "0 0 10px #4ade80",
                ["--sl-angle" as any]: `${i * 45}deg`,
                animation: `surroundOrbit 2.4s ${i * 0.05}s linear infinite, skillFadeOut 3s ease-out forwards`,
              }} />
            ))}
          </>
        )}

        {/* Large Orb: small green/blue orb centered on the target pet (caster
            for healing) that grows to engulf the pet, then fades. */}
        {skillEffect === "Large Orb" && (
          <div className="absolute pointer-events-none z-36" style={{
            left: `${PET_X}%`, top: `${PET_Y}%`, transform: "translate(-50%,-50%)",
            width: 30, height: 30, borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, rgba(220,255,235,0.95) 0%, rgba(74,222,128,0.85) 35%, rgba(56,189,248,0.55) 70%, transparent 100%)",
            border: "2px solid rgba(190,255,220,0.9)",
            boxShadow: "0 0 32px rgba(74,222,128,0.8), 0 0 60px rgba(56,189,248,0.5)",
            animation: "largeOrbGrow 2.6s ease-out forwards",
          }} />
        )}

        {/* Missile: a flurry of glowing red lines streaking from caster to enemy. */}
        {skillEffect === "Missile" && (() => {
          const count = 8;
          return Array.from({ length: count }).map((_, i) => {
            const dx = (i - (count - 1) / 2) * 1.6; // small spread
            return (
              <div key={`ms-${i}`} className="absolute pointer-events-none z-36" style={{
                left: `${PET_X + dx}%`, top: `${PET_Y}%`, transform: "translate(-50%,-50%) rotate(0deg)",
                width: 4, height: 22, borderRadius: 2,
                background: "linear-gradient(180deg, rgba(255,200,200,1) 0%, rgba(248,113,113,0.95) 40%, rgba(220,38,38,0.6) 100%)",
                boxShadow: "0 0 12px rgba(248,113,113,1), 0 0 4px white",
                ["--ms-from-x" as any]: `${PET_X + dx}%`,
                ["--ms-from-y" as any]: `${PET_Y}%`,
                ["--ms-to-x" as any]: `${enemyPos.x + dx * 0.4}%`,
                ["--ms-to-y" as any]: `${enemyPos.y}%`,
                animation: `missileStreak 0.95s ${i * 0.10}s ease-in forwards`,
                opacity: 0,
              }} />
            );
          });
        })()}

        {poisonActive && (
          <div className="absolute pointer-events-none z-26" style={{
            left: `${enemyPos.x}%`, top: `${enemyPos.y}%`, transform: "translate(-50%,-50%)",
            width: 80, height: 80, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 70%)",
            boxShadow: "0 0 24px rgba(34,197,94,0.4)", animation: "poisonPulse 0.9s ease-in-out infinite",
          }} />
        )}

        {/* Legacy heal styles still render the old burst */}
        {(skillEffect === "Heal Self" || skillEffect === "Heal Party") && (
          <div className="absolute pointer-events-none z-36" style={{
            left: `${PET_X}%`, top: `${PET_Y}%`, transform: "translate(-50%,-50%)",
            width: 120, height: 120, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34,197,94,0.5) 0%, transparent 65%)",
            boxShadow: "0 0 32px rgba(34,197,94,0.6)", animation: "healBurst 0.9s ease-out forwards",
          }} />
        )}

        {/* ── Wave complete overlay (no rewards shown until end of battle) ── */}
        {phase === "waveComplete" && enemy && pet && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
            <div className="bg-gray-900/95 rounded-2xl border p-5 mx-4 max-w-sm w-full" style={{ borderColor: accent + "60" }} data-testid="modal-wave-complete">
              <div className="text-center">
                <div className="text-xl font-black mb-1" style={{ color: accent }}>Enemy Defeated!</div>
                <div className="text-gray-400 text-sm mb-3">{enemy.name} has been vanquished!</div>
                <div className="bg-black/40 rounded-xl p-3 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-xs">{pet.name}'s HP</span>
                    <span className="text-xs font-bold" style={{ color: hpBarColor(petHp, petMaxHp) }}>{petHp} / {petMaxHp}</span>
                  </div>
                  <div className="h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(petHp / petMaxHp) * 100}%`, backgroundColor: hpBarColor(petHp, petMaxHp) }} />
                  </div>
                </div>
                <div className="text-gray-500 text-xs mb-3">
                  {waveIndex + 1 < allEnemies.length
                    ? `${allEnemies.length - waveIndex - 1} more ${allEnemies.length - waveIndex - 1 === 1 ? "enemy" : "enemies"} ahead...`
                    : "All enemies defeated!"}
                </div>
                <div className="flex gap-3">
                  <button data-testid="button-return-to-world" onClick={handleReturnToWorld}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm text-gray-300 bg-gray-700/50 border border-gray-600/50 transition-all active:scale-95 flex items-center justify-center gap-1.5">
                    <ArrowLeft className="w-4 h-4" />Return
                  </button>
                  {waveIndex + 1 < allEnemies.length && (
                    <button data-testid="button-advance-wave" onClick={handleAdvance}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: accent }}>
                      Advance<ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── End-of-battle summary (victory or defeat) ───────────────── */}
        {(phase === "victory" || phase === "defeat") && (
          <BattleEndSummary
            phase={phase}
            accent={accent}
            enemyName={enemy?.name ?? ""}
            allEnemiesCount={allEnemies.length}
            petRewards={Object.values(petRewards)}
            totalCoins={totalRewards.coins}
            totalItems={totalRewards.items}
            errored={defeatMutation.isError}
            calculating={defeatMutation.isPending && Object.keys(petRewards).length === 0}
            onClose={handleReturnToWorld}
          />
        )}

        {/* ── Tutorial ─────────────────────────────────────────────────── */}
        {showTutorial && (
          <div className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }}>
            <div className="flex flex-col gap-5 rounded-2xl px-7 py-7 mx-5 w-full"
              style={{
                background: "linear-gradient(145deg, rgba(8,4,18,0.98) 0%, rgba(20,6,6,0.98) 100%)",
                border: `1.5px solid ${accent}45`,
                boxShadow: `0 8px 48px rgba(0,0,0,0.85), 0 0 32px ${accent}12`,
                maxWidth: 340,
              }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${accent}22`, border: `1.5px solid ${accent}55` }}>
                  <Swords className="w-5 h-5" style={{ color: accent }} />
                </div>
                <p className="font-fantasy text-lg tracking-widest font-semibold" style={{ color: accent }}>How to Battle</p>
              </div>
              <div className="flex flex-col gap-4">
                {[
                  { num: "1", title: "Swipe to Attack", desc: "Drag your finger through the enemy to slash it. Chain swipes within 1.4 seconds to build a combo for bonus damage." },
                  { num: "2", title: "Block Incoming Attacks", desc: "When the enemy glows red and charges, a green BLOCK button appears. Tap it before the bar fills to reduce the damage. Higher DEF absorbs more!" },
                  { num: "3", title: "Counter Window", desc: "A successful BLOCK stuns the enemy briefly. Your next 2 swipes deal double damage — make them count!" },
                  { num: "4", title: "Potions & Special", desc: "Tap potion slots to heal mid-battle. When your mana bar fills, your pet glows — tap it to unleash its Special skill." },
                ].map(({ num, title, desc }) => (
                  <div key={num} className="flex gap-3 items-start">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-fantasy mt-0.5"
                      style={{ background: `${accent}22`, border: `1px solid ${accent}55`, color: accent }}>
                      {num}
                    </div>
                    <div>
                      <p className="font-fantasy text-sm font-semibold tracking-wide mb-0.5" style={{ color: accent }}>{title}</p>
                      <p className="font-fantasy text-xs tracking-wide leading-relaxed" style={{ color: `${accent}99` }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                data-testid="button-battle-tutorial-close"
                onClick={() => { localStorage.setItem("battleTutorialSeen", "1"); setShowTutorial(false); }}
                className="font-fantasy text-sm tracking-[0.15em] px-6 py-2.5 rounded-xl transition-transform active:scale-95 self-center mt-1"
                style={{
                  background: `linear-gradient(135deg, rgba(10,4,20,0.9) 0%, rgba(24,8,8,0.9) 100%)`,
                  border: `1.5px solid ${accent}60`,
                  color: accent,
                  boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 16px ${accent}20`,
                }}>
                Ready — let's fight!
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
