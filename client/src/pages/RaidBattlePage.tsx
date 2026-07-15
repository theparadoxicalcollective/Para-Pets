import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BattlePotionSlot } from "@/components/BattleArena";
import raidBg        from "@assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png";
import raidCloseImg  from "@assets/Photoroom_20260711_90748_PM_1783822223263.png";
import starImg       from "@assets/Photoroom_20260331_20947_PM_1774984267132.png";
import raidHpFrameImg from "@assets/Photoroom_20260711_31007_PM_1783820810778.png";

// ── One-time keyframe injection (module-level flag prevents iOS duplicates) ───
let _stylesInjected = false;
function ensureStyles() {
  if (_stylesInjected || typeof document === "undefined") return;
  _stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes raidLunge   { 0%,100%{transform:translateY(0) scale(1)} 45%{transform:translateY(-32px) scale(1.12)} }
    @keyframes raidHurt    { 0%,100%{opacity:1;filter:none} 50%{opacity:0.18;filter:brightness(5)} }
    @keyframes bossHurt    { 0%,100%{filter:none} 50%{filter:brightness(2.6) hue-rotate(200deg)} }
    @keyframes bossAtk     { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.1) translateY(30px)} }
    @keyframes raidFloat   { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(-58px)} }
    @keyframes dropGlow    { 0%,100%{box-shadow:0 0 8px rgba(74,222,128,0.5)} 50%{box-shadow:0 0 22px rgba(74,222,128,0.95)} }
    @keyframes petBounce   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
    @keyframes bossIdle    { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-14px) scale(1.02)} }
  `;
  document.head.appendChild(s);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const POTION_LS_KEY    = "raid:potionSlots:v1";
const RAID_PETS_LS_KEY = "raid:petIds:v1";
const MIN_POTION_DRAG  = 12;
const BOSS_ATK_PCT     = 0.20;

let _uid = 0; const nextUid = () => `rb${_uid++}`;
let _fid = 0; const nextFid = () => ++_fid;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Types ─────────────────────────────────────────────────────────────────────
interface RaidPet {
  uid: string; invId: string; name: string;
  templateId: string | null; imageUrl: string | null;
  maxHp: number; hp: number; atk: number; isDead: boolean;
}
interface FloatNum { id: number; x: number; y: number; value: number; isHeal?: boolean; }
interface DraggingPotion {
  slotIndex: number; pointerId: number;
  arenaX: number; arenaY: number;
  screenX: number; screenY: number;
  startX: number; startY: number;
}
type SlotState = BattlePotionSlot & { remaining: number };

function hpColor(pct: number) {
  if (pct > 0.5) return "#4ade80";
  if (pct > 0.25) return "#facc15";
  return "#f87171";
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RaidBattlePage() {
  ensureStyles();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: inventory = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"] });
  const { data: raidBoss } = useQuery<{
    templateId: string | null; rarity: number | null;
    name: string | null; hp: number; maxHp: number;
  }>({ queryKey: ["/api/raid-boss"] });

  // ── Phase ──
  const [phase, setPhase]               = useState<"loading"|"countdown"|"battle"|"result">("loading");
  const [countdown, setCountdown]       = useState(3);
  const [battleResult, setBattleResult] = useState<"defeated"|"complete"|null>(null);
  const [totalDamage, setTotalDamage]   = useState(0);
  const [roundNum, setRoundNum]         = useState(0);

  // ── Pets ──
  const [myPets, setMyPets] = useState<RaidPet[]>([]);
  const petsRef             = useRef<RaidPet[]>([]);

  // ── Damage tracking ──
  const totalDmgRef = useRef(0);

  // ── Boss HP display (real server HP minus damage dealt so far) ──
  const serverBossHpRef    = useRef(0);
  const serverBossMaxHpRef = useRef(1);

  // ── Animation flags ──
  const [attackingPetUid, setAttackingPetUid] = useState<string|null>(null);
  const [hurtPetUid, setHurtPetUid]           = useState<string|null>(null);
  const [bossAttacking, setBossAttacking]     = useState(false);
  const [bossHurt, setBossHurt]               = useState(false);

  // displayed boss HP for the bar (server HP - local damage dealt)
  const [displayBossHp, setDisplayBossHp] = useState(0);

  // ── Float numbers ──
  const [floatNums, setFloatNums] = useState<FloatNum[]>([]);
  const spawnFloat = useCallback((x: number, y: number, value: number, isHeal?: boolean) => {
    const id = nextFid();
    setFloatNums(p => [...p, { id, x, y, value, isHeal }]);
    setTimeout(() => setFloatNums(p => p.filter(f => f.id !== id)), 1300);
  }, []);
  const spawnFloatRef = useRef(spawnFloat);
  useEffect(() => { spawnFloatRef.current = spawnFloat; }, [spawnFloat]);

  // ── Init-once guard — prevents re-running init if raidBoss/inventory refetches ──
  const initDoneRef = useRef(false);

  // ── Battle control ──
  const battleActiveRef = useRef(false);

  // ── Potion DnD ──
  const [slotsRemaining, setSlotsRemaining] = useState<SlotState[]>([]);
  const slotsRef  = useRef<SlotState[]>([]);
  const [draggingPotion, setDraggingPotion] = useState<DraggingPotion|null>(null);
  const dragRef   = useRef<DraggingPotion|null>(null);
  const [hoveredAllyUid, setHoveredAllyUid] = useState<string|null>(null);
  const arenaRef  = useRef<HTMLDivElement>(null);

  // ── Server mutations ──
  const dealDamageMutation = useMutation({
    mutationFn: async (damage: number) => {
      const res = await apiRequest("POST", "/api/raid/deal-damage", { damage });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/raid-boss"] });
      queryClient.invalidateQueries({ queryKey: ["/api/raid/leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: (err: any) => {
      toast({
        title: "Damage not recorded",
        description: err?.message ?? "Failed to save battle result. Please try again.",
        variant: "destructive",
      });
    },
  });

  const usePotionMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("POST", "/api/explore/use-potion", { inventoryId });
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }),
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Guard: only ever run init once per mount. Prevents inventory/raidBoss
    // refetches from resetting the battle mid-countdown.
    if (initDoneRef.current) return;

    // Validate the battle session written by RaidPage right before navigating here.
    // We intentionally do NOT use raidBoss.hp from the TanStack cache — that cache
    // can show hp=0 from a previous battle (staleTime:Infinity means it never
    // auto-refreshes) and would cause an instant bad redirect even when the boss
    // is alive on the server.
    const sessionHp    = parseInt(localStorage.getItem("raid_session_boss_hp")     || "0", 10);
    const sessionMaxHp = parseInt(localStorage.getItem("raid_session_boss_max_hp") || "0", 10) || sessionHp;
    if (sessionHp <= 0) {
      // No valid session — user navigated here directly or the session is stale.
      navigate("/raid");
      return;
    }

    // Wait for inventory to load (raidBoss can be undefined during cache refresh — that's fine).
    if (!(inventory as any[]).length) return;

    const petIds: string[] = (() => {
      try { return JSON.parse(localStorage.getItem(RAID_PETS_LS_KEY) || "[]").filter(Boolean); }
      catch { return []; }
    })();
    const hatched = (inventory as any[]).filter(i => i.type === "pet" && i.isHatched);
    const selected: any[] = petIds.length > 0
      ? petIds.map(id => hatched.find((p: any) => (p.inventoryId || p.id) === id)).filter(Boolean)
      : hatched.slice(0, 3);

    if (!selected.length) { navigate("/raid"); return; }

    initDoneRef.current = true;

    const pets: RaidPet[] = selected.map((p: any) => ({
      uid: nextUid(), invId: p.inventoryId || p.id,
      name: p.name || "Pet", templateId: p.petTemplateId ?? null,
      imageUrl: p.hatchedImageUrl || p.imageUrl || null,
      maxHp: p.petHealth ?? 100, hp: p.petHealth ?? 100,
      atk: p.petAtk ?? 50, isDead: false,
    }));
    petsRef.current = pets;
    setMyPets(pets);

    // Use the server-confirmed HP from the session rather than the stale cache.
    serverBossHpRef.current    = sessionHp;
    serverBossMaxHpRef.current = sessionMaxHp;
    totalDmgRef.current = 0;
    setDisplayBossHp(sessionHp);

    // Clear session keys so they can't be accidentally reused across reloads.
    localStorage.removeItem("raid_session_boss_hp");
    localStorage.removeItem("raid_session_boss_max_hp");

    // Load potions
    const slots: BattlePotionSlot[] = (() => {
      try { return JSON.parse(localStorage.getItem(POTION_LS_KEY) || "[]").filter(Boolean); }
      catch { return []; }
    })();
    const slotStates = slots.map(s => ({ ...s, remaining: s.qty }));
    slotsRef.current = slotStates;
    setSlotsRemaining(slotStates);

    setPhase("countdown");
  }, [raidBoss, inventory, navigate]);

  // ── Countdown ──
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) { setPhase("battle"); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Battle loop — ends only when all pets are defeated ────────────────────
  useEffect(() => {
    if (phase !== "battle" || battleActiveRef.current) return;
    battleActiveRef.current = true;

    const rarity  = raidBoss?.rarity ?? 1;
    const bossDef = rarity * 20;

    const runBattle = async () => {
      let round = 0;

      while (battleActiveRef.current) {
        const alivePets = petsRef.current.filter(p => !p.isDead);
        if (!alivePets.length) break;

        round++;
        setRoundNum(round);

        // ── Each alive pet attacks the boss ──
        for (const pet of alivePets) {
          if (!battleActiveRef.current) break;

          setAttackingPetUid(pet.uid);
          await sleep(360);
          setAttackingPetUid(null);

          const dmg = Math.max(1, pet.atk - Math.floor(bossDef * 0.15));
          totalDmgRef.current += dmg;
          setTotalDamage(totalDmgRef.current);

          // Update displayed boss HP (server HP minus all damage dealt so far)
          const newDisplay = Math.max(0, serverBossHpRef.current - totalDmgRef.current);
          setDisplayBossHp(newDisplay);

          setBossHurt(true);
          spawnFloatRef.current(50, 30, dmg);
          setTimeout(() => setBossHurt(false), 320);
          await sleep(280);

          if (!battleActiveRef.current) break;
        }

        if (!battleActiveRef.current) break;

        await sleep(380);

        // ── Boss attacks a random alive pet ──
        const stillAlive = petsRef.current.filter(p => !p.isDead);
        if (!stillAlive.length) break;

        const target    = stillAlive[Math.floor(Math.random() * stillAlive.length)];
        const targetIdx = petsRef.current.findIndex(p => p.uid === target.uid);

        setBossAttacking(true);
        await sleep(520);
        setBossAttacking(false);

        const bossDmg = Math.max(1, Math.floor(target.maxHp * BOSS_ATK_PCT));
        const updated = petsRef.current.map(p =>
          p.uid !== target.uid ? p
            : { ...p, hp: Math.max(0, p.hp - bossDmg), isDead: p.hp - bossDmg <= 0 }
        );
        petsRef.current = updated;
        setMyPets([...updated]);
        setHurtPetUid(target.uid);
        spawnFloatRef.current(((targetIdx + 0.5) / petsRef.current.length) * 100, 68, bossDmg);
        setTimeout(() => setHurtPetUid(null), 360);
        await sleep(480);

        // Check if all pets dead
        if (petsRef.current.every(p => p.isDead)) break;
      }

      if (!battleActiveRef.current) return;
      battleActiveRef.current = false;

      const allDead = petsRef.current.every(p => p.isDead);
      setBattleResult(allDead ? "defeated" : "complete");
      setPhase("result");

      if (totalDmgRef.current > 0) dealDamageMutation.mutate(totalDmgRef.current);
    };

    runBattle();
    return () => { battleActiveRef.current = false; };
  }, [phase]); // eslint-disable-line

  // ── Potion helpers ────────────────────────────────────────────────────────
  const getArenaPos = useCallback((sx: number, sy: number) => {
    const el = arenaRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    return { x: ((sx - r.left) / r.width) * 100, y: ((sy - r.top) / r.height) * 100 };
  }, []);

  const petHitTest = useCallback((arenaX: number, arenaY: number) => {
    const ps = petsRef.current;
    return ps.find((_, i) => {
      const petX = ((i + 0.5) / ps.length) * 100;
      return Math.hypot(arenaX - petX, arenaY - 76) < 16;
    }) ?? null;
  }, []);

  const consumePotion = useCallback((slotIndex: number, targetUid: string | null) => {
    const slot = slotsRef.current[slotIndex];
    if (!slot || slot.remaining <= 0) return;
    const heal    = (slot.healthRestored ?? 0) || 0;
    const revives = (slot.petsRevived   ?? 0)  || 0;
    const ps      = petsRef.current;
    const droppedOn    = targetUid ? ps.find(p => p.uid === targetUid) : null;
    const aliveTarget  = (droppedOn && !droppedOn.isDead ? droppedOn : null) ?? ps.find(p => !p.isDead);
    const reviveTarget = (droppedOn && droppedOn.isDead  ? droppedOn : null) ?? ps.find(p => p.isDead);

    const canHeal   = heal > 0    && !!aliveTarget  && aliveTarget.hp < aliveTarget.maxHp;
    const canRevive = revives > 0 && !!reviveTarget;
    if (!canHeal && !canRevive) return;

    const nextPets = ps.map(p => {
      if (canHeal   && p.uid === aliveTarget?.uid)  return { ...p, hp: Math.min(p.maxHp, p.hp + heal) };
      if (canRevive && p.uid === reviveTarget?.uid) return { ...p, hp: Math.max(1, Math.floor(p.maxHp * 0.5)), isDead: false };
      return p;
    });
    petsRef.current = nextPets;
    setMyPets([...nextPets]);

    if (canHeal && aliveTarget) {
      const idx = ps.findIndex(p => p.uid === aliveTarget.uid);
      spawnFloatRef.current(((idx + 0.5) / ps.length) * 100, 64, heal, true);
    }

    const nextSlots = slotsRef.current.map((s, i) =>
      i === slotIndex ? { ...s, remaining: Math.max(0, s.remaining - 1) } : s
    );
    slotsRef.current = nextSlots;
    setSlotsRemaining(nextSlots);
    usePotionMutation.mutate(slot.inventoryId);
  }, []);

  const beginPotionDrag = useCallback((slotIndex: number, e: React.PointerEvent) => {
    const slot = slotsRef.current[slotIndex];
    if (!slot || slot.remaining <= 0) return;
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ap = getArenaPos(e.clientX, e.clientY);
    const next: DraggingPotion = {
      slotIndex, pointerId: e.pointerId,
      arenaX: ap.x, arenaY: ap.y,
      screenX: e.clientX, screenY: e.clientY,
      startX: e.clientX, startY: e.clientY,
    };
    dragRef.current = next;
    setDraggingPotion(next);
  }, [getArenaPos]);

  const movePotionDrag = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const ap = getArenaPos(e.clientX, e.clientY);
    setHoveredAllyUid(petHitTest(ap.x, ap.y)?.uid ?? null);
    const next = { ...dragRef.current, screenX: e.clientX, screenY: e.clientY, arenaX: ap.x, arenaY: ap.y };
    dragRef.current = next;
    setDraggingPotion(next);
  }, [getArenaPos, petHitTest]);

  const endPotionDrag = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const drag = dragRef.current;
    dragRef.current = null; setDraggingPotion(null); setHoveredAllyUid(null);
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < MIN_POTION_DRAG) return;
    const ap = getArenaPos(e.clientX, e.clientY);
    const target = petHitTest(ap.x, ap.y);
    if (target) consumePotion(drag.slotIndex, target.uid);
  }, [getArenaPos, petHitTest, consumePotion]);

  const cancelPotionDrag = useCallback(() => {
    dragRef.current = null; setDraggingPotion(null); setHoveredAllyUid(null);
  }, []);

  useEffect(() => {
    if (!draggingPotion) return;
    const up = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      dragRef.current = null; setDraggingPotion(null); setHoveredAllyUid(null);
      if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < MIN_POTION_DRAG) return;
      const ap = getArenaPos(ev.clientX, ev.clientY);
      const target = petHitTest(ap.x, ap.y);
      if (target) consumePotion(d.slotIndex, target.uid);
    };
    const cancel = (ev: PointerEvent) => {
      if (dragRef.current?.pointerId === ev.pointerId) cancelPotionDrag();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
  }, [draggingPotion, getArenaPos, petHitTest, consumePotion, cancelPotionDrag]);

  const handleClose = () => {
    battleActiveRef.current = false;
    navigate("/raid");
  };

  // ── Derived display values ────────────────────────────────────────────────
  const rarity   = raidBoss?.rarity ?? 0;
  const bossName = raidBoss?.name   ?? "Raid Boss";
  const serverMaxHp   = serverBossMaxHpRef.current || raidBoss?.maxHp || 1;
  const bossBarPct    = Math.max(0, Math.min(1, displayBossHp / serverMaxHp));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={arenaRef} style={{ position: "absolute", inset: 0, background: "#08040c", overflow: "hidden" }}>
      {/* Background */}
      <img src={raidBg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(4,2,10,0.62)", pointerEvents: "none" }} />

      {/* Close button */}
      <button data-testid="button-close-raid-battle" onClick={handleClose}
        style={{ position: "absolute", top: 60, right: 14, zIndex: 20, background: "none", border: "none", padding: 0, cursor: "pointer", width: 40, height: 40 }}>
        <img src={raidCloseImg} alt="Close" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }} draggable={false} />
      </button>

      {/* Round counter */}
      {(phase === "battle" || phase === "result") && (
        <div style={{ position: "absolute", top: 66, left: 16, zIndex: 20, fontFamily: "Lora, serif", fontSize: 11, color: "rgba(240,192,40,0.8)", letterSpacing: "0.18em" }}>
          ROUND {roundNum}
        </div>
      )}

      {/* ── Countdown overlay ── */}
      {phase === "countdown" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: "Lora, serif", fontSize: 96, fontWeight: "bold", color: "#f0c040", textShadow: "0 0 40px rgba(240,160,20,0.8), 0 4px 24px rgba(0,0,0,1)" }}>
            {countdown > 0 ? countdown : "GO!"}
          </div>
        </div>
      )}

      {/* ── Main battle layout ── */}
      {(phase === "battle" || phase === "result") && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>

          {/* ── BOSS section ── */}
          <div style={{ paddingTop: 54, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>

            {/* Rarity stars — curved arc */}
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
              {Array.from({ length: 5 }).map((_, i) => {
                const arcY = [9, 4, 0, 4, 9][i];
                return (
                  <img key={i} src={starImg} alt="" width={26} height={26}
                    style={{ transform: `translateY(${arcY}px)`, opacity: i < rarity ? 1 : 0.14, filter: i < rarity ? "drop-shadow(0 0 6px rgba(240,80,40,0.9))" : "grayscale(1)" }} />
                );
              })}
            </div>

            {/* Boss name */}
            <div style={{ fontFamily: "Lora, serif", fontSize: 13, color: "#f0c040", letterSpacing: "0.14em", textShadow: "0 0 12px rgba(240,160,20,0.5)" }}>
              {bossName}
            </div>

            {/* ── HP bar with frame (same style as RaidPage) ── */}
            <div style={{ position: "relative", width: 240, height: "auto" }}>
              {/* Fill bar behind frame */}
              <div style={{
                position: "absolute",
                top: "33%", left: "8%",
                width: `${bossBarPct * 84}%`,
                height: "46%",
                background: "linear-gradient(90deg, #8b1a00 0%, #d63010 60%, #ff6030 100%)",
                borderRadius: 3,
                maxWidth: "84%",
                transition: "width 0.4s ease",
              }} />
              {/* Frame overlay */}
              <img src={raidHpFrameImg} alt="HP" style={{ width: "100%", height: "auto", display: "block", position: "relative", zIndex: 1, pointerEvents: "none" }} draggable={false} />
              {/* HP text — sit inside the fill band */}
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                paddingTop: "2%",
                zIndex: 2, fontFamily: "Lora, serif", fontSize: 10, color: "#fff",
                textShadow: "0 1px 4px rgba(0,0,0,0.9)", letterSpacing: "0.04em",
              }}>
                {displayBossHp.toLocaleString()} / {serverMaxHp.toLocaleString()}
              </div>
            </div>

            {/* Boss sprite */}
            <div style={{
              width: 260, height: 260,
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: bossHurt ? "bossHurt 0.35s ease" : bossAttacking ? "bossAtk 0.55s ease" : "bossIdle 2.4s ease-in-out infinite",
              transformOrigin: "center bottom",
            }}>
              {raidBoss?.templateId ? (
                <img
                  src={`/api/pet-template-image/${raidBoss.templateId}/front`}
                  alt={bossName}
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
                />
              ) : (
                <div style={{ fontSize: 80 }}>👹</div>
              )}
            </div>
          </div>

          {/* spacer */}
          <div style={{ flex: 1 }} />

          {/* ── PLAYER PETS row ── */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, paddingBottom: 8, width: "100%", paddingLeft: 8, paddingRight: 8 }}>
            {myPets.map((pet, i) => {
              const petHpPct    = pet.maxHp > 0 ? pet.hp / pet.maxHp : 0;
              const isAttacking = attackingPetUid === pet.uid;
              const isHurt      = hurtPetUid === pet.uid;
              const isHovered   = hoveredAllyUid === pet.uid;
              return (
                <div key={pet.uid} data-testid={`pet-slot-${i}`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1, maxWidth: 100, opacity: pet.isDead ? 0.35 : 1 }}>

                  {/* Pet sprite */}
                  <div style={{
                    position: "relative",
                    width: 80, height: 80, borderRadius: 12,
                    border: `2px solid ${isHovered ? "rgba(74,222,128,0.9)" : "rgba(255,255,255,0.08)"}`,
                    background: "rgba(0,0,0,0.3)", overflow: "hidden",
                    animation: isAttacking ? "raidLunge 0.52s ease" : isHurt ? "raidHurt 0.4s ease" : "none",
                    boxShadow: isHovered ? "0 0 18px rgba(74,222,128,0.55)" : "none",
                    transition: "box-shadow 0.15s",
                  }}>
                    {(() => {
                      const src = pet.imageUrl || (pet.templateId ? `/api/pet-template-image/${pet.templateId}/front` : null);
                      return src ? (
                        <img src={src} alt={pet.name} draggable={false}
                          style={{
                            width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none",
                            animation: isAttacking || isHurt ? "none" : "petBounce 1.4s ease-in-out infinite",
                          }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, animation: isAttacking || isHurt ? "none" : "petBounce 1.4s ease-in-out infinite" }}>🐾</div>
                      );
                    })()}
                    {pet.isDead && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>💀</div>
                    )}
                  </div>

                  {/* Pet name */}
                  <div style={{ fontFamily: "Lora, serif", fontSize: 9, color: "rgba(255,255,255,0.65)", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pet.name}
                  </div>

                  {/* Pet HP bar */}
                  <div style={{ width: "100%", height: 6, borderRadius: 3, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${petHpPct * 100}%`, background: hpColor(petHpPct), borderRadius: 3, transition: "width 0.35s ease" }} />
                  </div>
                  <div style={{ fontFamily: "Lora, serif", fontSize: 8, color: "rgba(255,255,255,0.45)" }}>
                    {pet.hp} / {pet.maxHp}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Potion bar ── */}
          {slotsRemaining.some(s => s.remaining > 0) && (
            <div style={{ display: "flex", gap: 8, paddingBottom: 20, paddingTop: 4 }}>
              {slotsRemaining.map((slot, i) => {
                if (slot.remaining <= 0) return null;
                const isMana   = (slot.manaRestored ?? 0) > 0;
                const isRevive = (slot.petsRevived  ?? 0) > 0;
                const isDragged = draggingPotion?.slotIndex === i;
                return (
                  <div key={`slot-${i}-${slot.shopItemId}`}
                    data-testid={`raid-potion-slot-${i}`}
                    onPointerDown={e => beginPotionDrag(i, e)}
                    onPointerMove={movePotionDrag}
                    onPointerUp={endPotionDrag}
                    onPointerCancel={cancelPotionDrag}
                    onLostPointerCapture={cancelPotionDrag}
                    style={{
                      position: "relative", width: 48, height: 48, borderRadius: 10,
                      cursor: "grab", touchAction: "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isRevive ? "rgba(251,191,36,0.18)" : isMana ? "rgba(20,80,40,0.30)" : "rgba(34,197,94,0.20)",
                      border: `1px solid ${isRevive ? "rgba(251,191,36,0.55)" : isMana ? "rgba(74,222,128,0.55)" : "rgba(34,197,94,0.55)"}`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                      opacity: isDragged ? 0.3 : 1,
                      animation: isDragged ? "none" : "dropGlow 2s ease-in-out infinite",
                    }}
                  >
                    {slot.imageUrl
                      ? <img src={slot.imageUrl} alt={slot.name} style={{ width: 32, height: 32, objectFit: "contain", pointerEvents: "none" }} draggable={false} />
                      : <span style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>{isRevive ? "R" : isMana ? "M" : "H"}</span>}
                    <div style={{
                      position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%",
                      background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "Lora, serif", fontSize: 9, fontWeight: "bold", color: "#fff",
                    }}>
                      {slot.remaining}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Float numbers ── */}
      {floatNums.map(f => (
        <div key={f.id} style={{
          position: "absolute",
          left: `${f.x}%`, top: `${f.y}%`,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none", zIndex: 25,
          fontFamily: "Lora, serif", fontSize: 18, fontWeight: "900",
          color: f.isHeal ? "#4ade80" : "#f87171",
          textShadow: "0 2px 8px rgba(0,0,0,0.9)",
          animation: "raidFloat 1.3s ease forwards",
        }}>
          {f.isHeal ? "+" : "-"}{f.value.toLocaleString()}
        </div>
      ))}

      {/* ── Ghost potion while dragging ── */}
      {draggingPotion && (() => {
        const slot = slotsRemaining[draggingPotion.slotIndex];
        if (!slot) return null;
        return createPortal(
          <div className="fixed z-50 pointer-events-none" style={{ left: draggingPotion.screenX, top: draggingPotion.screenY, transform: "translate(-50%,-50%)" }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(34,197,94,0.22)", border: "2px solid rgba(74,222,128,0.9)", boxShadow: "0 6px 20px rgba(0,0,0,0.6), 0 0 20px rgba(74,222,128,0.5)" }}>
              {slot.imageUrl ? <img src={slot.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: "contain" }} /> : <span style={{ color: "#fff", fontWeight: "bold" }}>P</span>}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── Result overlay ── */}
      {phase === "result" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(4,2,10,0.82)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <div style={{
            fontFamily: "Lora, serif", fontSize: 30, fontWeight: "bold", letterSpacing: "0.2em",
            color: battleResult === "defeated" ? "#f87171" : "#f0c040",
            textShadow: `0 0 30px ${battleResult === "defeated" ? "rgba(248,113,113,0.7)" : "rgba(240,192,40,0.8)"}`,
          }}>
            {battleResult === "defeated" ? "DEFEATED" : "BATTLE COMPLETE"}
          </div>

          <div style={{ fontFamily: "Lora, serif", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
            Damage dealt to the Raid Boss
          </div>

          <div style={{ fontFamily: "Lora, serif", fontSize: 42, fontWeight: "900", color: "#f87171", textShadow: "0 0 20px rgba(248,113,113,0.6)" }}>
            {totalDamage.toLocaleString()}
          </div>

          {dealDamageMutation.isPending && (
            <div style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.15em" }}>
              Recording damage…
            </div>
          )}

          <button data-testid="button-raid-battle-return" onClick={handleClose}
            style={{ marginTop: 8, padding: "10px 36px", borderRadius: 12, background: "linear-gradient(135deg, #5a1a0a, #c03018)", border: "1px solid rgba(240,100,40,0.7)", color: "#fff", fontFamily: "Lora, serif", fontSize: 14, fontWeight: "bold", cursor: "pointer", letterSpacing: "0.12em", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
            Return to Raid
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {phase === "loading" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: "Lora, serif", fontSize: 14, color: "rgba(255,255,255,0.4)", letterSpacing: "0.2em" }}>
            Preparing battle…
          </div>
        </div>
      )}
    </div>
  );
}
