import { Component, memo, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties, ErrorInfo, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Star, X } from "lucide-react";
import { getNextZ } from "@/lib/layerManager";
import PetAnimator from "@/components/PetAnimator";
import type { PetUpgradeModalProps, PowerUpItem } from "@/components/powerup/PowerUpModalTypes";
import bagIcon from "@assets/generated_images/icon_powerup_bag.png";
import petPlaceholder from "@assets/generated_images/icon_pet_placeholder.png";
import forestBg from "@assets/generated_images/powerup_forest_bg.png";

const CSS = String.raw`
.lupage{position:fixed;inset:0;width:100%;max-width:768px;margin:0 auto;overflow:hidden;background:#060a09;color:#fff8d9;isolation:isolate;font-family:Georgia,serif;touch-action:pan-y}.lupage *{box-sizing:border-box}.lupage-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-3;filter:saturate(.92) brightness(.68)}.lupage-shade{position:absolute;inset:0;z-index:-2;background:linear-gradient(rgba(4,10,8,.25),rgba(4,8,7,.08) 42%,rgba(3,6,5,.72));pointer-events:none}.lupage-scroll{height:100%;overflow-y:auto;overflow-x:hidden;padding:max(env(safe-area-inset-top),10px) 12px max(env(safe-area-inset-bottom),18px);scrollbar-width:none;-webkit-overflow-scrolling:touch}.lupage-scroll::-webkit-scrollbar,.lupage-items::-webkit-scrollbar{display:none}
.lupage-head{position:relative;min-height:108px;text-align:center;padding:8px 58px 0}.lupage-title{margin:5px 0 5px;color:#f6d66d;font-size:clamp(34px,10vw,58px);line-height:1;font-weight:800;letter-spacing:.07em;text-shadow:0 2px 2px #261900,0 0 18px rgba(248,211,94,.35)}.lupage-sub{max-width:440px;margin:0 auto;color:#f7e9b6;font-size:clamp(13px,3.5vw,18px);line-height:1.25}.lupage-close{position:absolute;right:2px;top:2px;width:50px;height:50px;border:1px solid #c9a344;border-radius:50%;display:grid;place-items:center;background:#172017e8;color:#ffe386;box-shadow:0 4px 13px #0008}.lupage-rule{width:min(90%,470px);margin:0 auto 8px;padding:8px 14px;border:1px solid #a9873d;border-radius:999px;background:#171910df;color:#ffe58a;text-align:center;font-weight:700}
.lupage-stage{width:100%;max-width:500px;margin:0 auto 8px;display:grid;place-items:center}.lupage-pet-zone{width:min(74vw,350px);height:min(74vw,350px);display:grid;place-items:center;touch-action:pan-y;transition:filter .18s,transform .18s}.lupage-pet-zone.over{filter:drop-shadow(0 0 19px #ffd95f);transform:scale(1.025)}.lupage-pet{width:100%;height:100%;display:grid;place-items:center;pointer-events:none;filter:drop-shadow(0 12px 10px #0009)}.lupage-pet>img{width:100%;height:100%;object-fit:contain}.lupage-pet.bounce{animation:lupageBounce .72s ease-out}.lupage-pet.flash{animation:lupageFlash .58s ease-out}.lupage-placeholder{width:72%!important;height:72%!important;opacity:.7}.lupage-stars{margin:-16px 0 5px;color:#ffd950;font-size:28px;letter-spacing:.12em;text-shadow:0 0 9px rgba(255,217,80,.35)}.lupage-nameplate{width:min(92%,500px);display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 14px;border-top:1px solid #b99747;border-bottom:1px solid #b99747;background:linear-gradient(90deg,transparent,#141a12df 15% 85%,transparent);color:#f7d97b;font-size:clamp(20px,5vw,28px)}.lupage-level{font:700 .64em/1 system-ui,sans-serif;padding:6px 10px;border:1px solid #c9a344;border-radius:999px;color:#ffe58a;background:#201c0c}
.lupage-stats{width:100%;max-width:540px;margin:0 auto 10px;padding:12px 13px;border:1px solid #907336;border-radius:18px;background:linear-gradient(135deg,rgba(24,26,16,.94),rgba(10,12,8,.96));box-shadow:inset 0 0 18px rgba(199,158,61,.1),0 7px 18px #0007}.lupage-stat{display:grid;grid-template-columns:54px minmax(0,1fr) 55px;align-items:center;gap:9px;margin:8px 0;font-family:system-ui,sans-serif}.lupage-stat b{letter-spacing:.04em}.lupage-stat.atk b,.lupage-stat.atk .lupage-value{color:#ff7979}.lupage-stat.def b,.lupage-stat.def .lupage-value{color:#72adff}.lupage-stat.hp b,.lupage-stat.hp .lupage-value{color:#58e891}.lupage-track{height:11px;border:1px solid #5d604b;border-radius:999px;background:#0b0e09;overflow:hidden}.lupage-fill{height:100%;border-radius:inherit}.atk .lupage-fill{background:#ef6464}.def .lupage-fill{background:#5798f2}.hp .lupage-fill{background:#42d77d}.lupage-value{text-align:right;font-size:18px}
.lupage-bag{display:block;width:54px;height:54px;object-fit:contain;margin:5px auto}.lupage-tray{width:100%;max-width:560px;margin:8px auto 0;padding:11px 8px 9px;border:1px solid #a4863d;border-radius:16px;background:rgba(19,21,13,.94);box-shadow:inset 0 0 18px rgba(199,158,61,.09),0 10px 22px #0008}.lupage-items{display:flex;gap:8px;width:100%;overflow-x:auto;overflow-y:hidden;padding:4px 3px 8px;scroll-snap-type:x proximity}.lupage-item{position:relative;flex:0 0 78px;height:82px;border:1px solid #a58a43;border-radius:13px;background:#15170f;display:grid;place-items:center;touch-action:none;user-select:none;scroll-snap-align:center}.lupage-item.disabled{opacity:.42;filter:grayscale(.75)}.lupage-item img{width:60px;height:60px;object-fit:contain;pointer-events:none}.lupage-caption{position:absolute;left:4px;right:4px;top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f3e6b8;font:600 9px/1 system-ui,sans-serif;text-align:center}.lupage-qty{position:absolute;right:3px;bottom:3px;min-width:23px;height:23px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:#101109;border:1px solid #cfad55;color:#fff;font:700 12px/1 system-ui,sans-serif}.lupage-empty{text-align:center;color:#eadfb7;padding:18px 8px}.lupage-hint{text-align:center;color:#f9d778;font-weight:700;letter-spacing:.04em;padding:4px 0 1px}.lupage-buy{display:block;margin:7px auto 0;border:1px solid #cda63e;border-radius:999px;background:#1b2115;color:#ffe68a;padding:10px 18px;font-weight:700}
.lupage-ghost{position:fixed;z-index:10050;width:76px;height:76px;pointer-events:none;transform:translate(-50%,-50%);display:grid;place-items:center;border-radius:50%;background:#292411e8;border:1px solid #e1be54;box-shadow:0 0 20px rgba(225,190,84,.5)}.lupage-ghost img{width:62px;height:62px;object-fit:contain}.lupage-spark{position:fixed;z-index:10049;pointer-events:none;width:8px;height:8px;border-radius:50%;background:#f0c040;box-shadow:0 0 10px #f0c040;animation:lupageSpark .72s ease-out forwards}.lupage-success{position:absolute;inset:0;z-index:10060;display:grid;place-items:center;background:rgba(20,14,0,.74);backdrop-filter:blur(2px)}.lupage-success-card{text-align:center;color:#f0c040;filter:drop-shadow(0 0 24px #f0c040);animation:lupagePop .48s cubic-bezier(.2,1.5,.4,1)}.lupage-success-title{margin-top:8px;font-size:clamp(38px,11vw,68px);font-weight:800;text-shadow:0 0 22px #f0c040}.lupage-success-label{color:white;font:700 18px/1.2 system-ui,sans-serif}
@keyframes lupageBounce{40%{transform:translateY(-14px) scale(1.04)}70%{transform:translateY(3px) scale(.98)}}@keyframes lupageFlash{35%{filter:brightness(2) drop-shadow(0 0 22px #fff)}}@keyframes lupageSpark{to{transform:translate(var(--dx),var(--dy)) scale(.1);opacity:0}}@keyframes lupagePop{from{transform:scale(.45);opacity:0}}
@media(max-width:430px){.lupage-stage{margin-top:2px}.lupage-pet-zone{width:min(78vw,330px);height:min(78vw,330px)}.lupage-stat{grid-template-columns:50px minmax(0,1fr) 48px;gap:7px}.lupage-tray{border-radius:14px}}
`;

function labelFor(item: PowerUpItem) {
  const n = item.type === "special" ? item.specialAmount : item.statBoostAmount;
  if (item.specialType === "hatch_time") return `-${n ?? "?"} min`;
  if (item.statBoostType === "lvl" || item.specialType === "level") return `+${n ?? "?"} LVL pts`;
  return item.name;
}

type StableLevelUpPetProps = {
  petName: string;
  petImage: string | null;
  petTemplateId: string | null;
  petInventoryId: string;
};

interface LevelUpTemplateData {
  parts: Array<{ id: string; imageUrl: string }>;
}

class LevelUpPetErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[PetLevelUpPage:pet-render]", error, info.componentStack);
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; fallback: ReactNode; resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Keep the animated pet isolated from the high-frequency drag state owned by
 * the Level Up page. Template parts are preloaded through the shared query
 * cache while the still composite remains visible; the animator mounts only
 * after a complete parts payload is ready. It then stays mounted while drag
 * coordinates change. Its owner-only costume query is cached inside the memoized renderer.
 */
const StableLevelUpPet = memo(function StableLevelUpPet({
  petName,
  petImage,
  petTemplateId,
  petInventoryId,
}: StableLevelUpPetProps) {
  const { data: templateData, isError } = useQuery<LevelUpTemplateData>({
    queryKey: ["/api/pet-template-parts", petTemplateId],
    queryFn: async () => {
      const response = await fetch(`/api/pet-template-parts/${petTemplateId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load Level Up pet template");
      return response.json();
    },
    enabled: !!petTemplateId,
    staleTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (petTemplateId && templateData?.parts?.length && !isError) {
    return (
      <PetAnimator
        petTemplateId={petTemplateId}
        petInventoryId={petInventoryId}
        mode="idle"
        view="front"
        size={350}
        fillContainer
        className="w-full h-full"
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      />
    );
  }

  if (petImage) {
    return <img src={petImage} alt={petName} draggable={false} decoding="async" data-testid="img-levelup-pet-fallback" />;
  }

  return <img src={petPlaceholder} alt="" className="lupage-placeholder" draggable={false} />;
});

export default function PetLevelUpPage(props: PetUpgradeModalProps) {
  const {
    petName, petInventoryId, petImage, petTemplateId, rarity, petLevel, petAtk, petDef, petHealth,
    itemsRemaining, items, isPending, subtitle, showBuyButton = false,
    successEffect, onUseItem, onSuccessAnimEnd, onClose,
  } = props;
  const [z] = useState(() => getNextZ());
  const zoneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [over, setOver] = useState(false);
  const [petAnim, setPetAnim] = useState<"" | "bounce" | "flash">("");
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number; dx: number; dy: number }[]>([]);
  const sparkId = useRef(0);
  const transientTimers = useRef<number[]>([]);
  const scheduleTransient = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      transientTimers.current = transientTimers.current.filter((id) => id !== timer);
      callback();
    }, delay);
    transientTimers.current.push(timer);
  }, []);

  useEffect(() => () => {
    transientTimers.current.forEach((timer) => window.clearTimeout(timer));
    transientTimers.current = [];
  }, []);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  useEffect(() => {
    if (!successEffect) return;
    const timer = window.setTimeout(onSuccessAnimEnd, 2400);
    return () => window.clearTimeout(timer);
  }, [successEffect, onSuccessAnimEnd]);

  const disabled = useCallback((item: PowerUpItem) => isPending || item.quantity <= 0, [isPending]);
  const pointInZone = useCallback((x: number, y: number) => {
    const r = zoneRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }, []);

  const useItem = useCallback((item: PowerUpItem) => {
    if (disabled(item)) return;
    const r = zoneRef.current?.getBoundingClientRect();
    if (r) {
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      setSparks(Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        return { id: sparkId.current++, x, y, dx: Math.cos(angle) * (55 + Math.random() * 70), dy: Math.sin(angle) * (55 + Math.random() * 70) };
      }));
      scheduleTransient(() => setSparks([]), 760);
    }
    setPetAnim("bounce");
    scheduleTransient(() => setPetAnim("flash"), 260);
    scheduleTransient(() => setPetAnim(""), 850);
    onUseItem(item);
  }, [disabled, onUseItem, scheduleTransient]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>, item: PowerUpItem) => {
    if (disabled(item)) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    const next = { item, x: event.clientX, y: event.clientY };
    dragRef.current = next;
    setDrag(next);
  }, [disabled]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const next = { ...dragRef.current, x: event.clientX, y: event.clientY };
    dragRef.current = next;
    setDrag(next);
    setOver(pointInZone(event.clientX, event.clientY));
  }, [pointInZone]);

  const clearDrag = useCallback(() => { dragRef.current = null; setDrag(null); setOver(false); }, []);
  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    if (pointInZone(event.clientX, event.clientY)) useItem(current.item);
    clearDrag();
  }, [clearDrag, pointInZone, useItem]);

  const petFallback = petImage
    ? <img src={petImage} alt={petName} draggable={false} decoding="async" data-testid="img-levelup-pet-render-fallback" />
    : <img src={petPlaceholder} alt="" className="lupage-placeholder" draggable={false} />;

  const pet = (
    <LevelUpPetErrorBoundary
      resetKey={`${petInventoryId}:${petTemplateId ?? "still"}`}
      fallback={petFallback}
    >
      <StableLevelUpPet
        petName={petName}
        petImage={petImage}
        petTemplateId={petTemplateId}
        petInventoryId={petInventoryId}
      />
    </LevelUpPetErrorBoundary>
  );

  const stats = [
    { key: "atk", label: "ATK", value: petAtk, max: 200 },
    { key: "def", label: "DEF", value: petDef, max: 200 },
    { key: "hp", label: "HP", value: petHealth, max: 2500 },
  ];

  return <div className="lupage" style={{ zIndex: z }} role="dialog" aria-modal="true" aria-label="Level Up">
    <style>{CSS}</style>
    <img src={forestBg} alt="" className="lupage-bg" />
    <div className="lupage-shade" />
    <div className="lupage-scroll">
      <header className="lupage-head">
        <h2 className="lupage-title">LEVEL UP</h2>
        <div className="lupage-sub">{subtitle || `Drag a Level Up item onto ${petName} to gain XP`}</div>
        <button type="button" className="lupage-close" onClick={onClose} data-testid="button-close-levelup-modal" aria-label="Close Level Up"><X size={28} /></button>
      </header>
      <div className="lupage-rule">{itemsRemaining === Infinity ? "✦ No limit — use as many as you like!" : `✦ ${Math.max(0, itemsRemaining)} uses remaining`}</div>
      <section className="lupage-stage">
        <div ref={zoneRef} className={`lupage-pet-zone ${over ? "over" : ""}`} data-testid="zone-levelup-pet-drop"><div className={`lupage-pet ${petAnim}`}>{pet}</div></div>
        <div className="lupage-stars">{"★".repeat(Math.max(1, Math.min(5, rarity)))}</div>
        <div className="lupage-nameplate"><span>{petName}</span><span className="lupage-level">Lv.{petLevel}</span></div>
      </section>
      <section className="lupage-stats" data-testid="section-levelup-pet-stats">
        {stats.map((stat) => <div key={stat.key} className={`lupage-stat ${stat.key}`}><b>{stat.label}</b><div className="lupage-track"><div className="lupage-fill" style={{ width: `${Math.min(100, Math.max(3, stat.value / stat.max * 100))}%` }} /></div><span className="lupage-value">{stat.value}</span></div>)}
      </section>
      <img src={bagIcon} className="lupage-bag" alt="" />
      <section className="lupage-tray">
        {items.length ? <div className="lupage-items">{items.map((item) => <button
          type="button"
          key={item.inventoryId}
          data-testid={`item-levelup-${item.inventoryId}`}
          className={`lupage-item ${disabled(item) ? "disabled" : ""}`}
          title={`${item.name} • ${labelFor(item)}`}
          onPointerDown={(event) => onPointerDown(event, item)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={clearDrag}
          disabled={disabled(item)}
        ><span className="lupage-caption">{labelFor(item)}</span>{item.imageUrl && <img src={item.imageUrl} alt={item.name} draggable={false} />}{item.quantity > 1 && <span className="lupage-qty">{item.quantity}</span>}</button>)}</div> : <div className="lupage-empty">No Level Up items in your bag.</div>}
        <div className="lupage-hint">Drag onto {petName} to level up</div>
        {showBuyButton && <button className="lupage-buy" onClick={() => { window.location.href = "/world/swamp?shopHint=a1b2c3d4-0004-4000-8000-000000000004"; }}>Find Level Up Items</button>}
      </section>
    </div>
    {drag && <div className="lupage-ghost" style={{ left: drag.x, top: drag.y }}><img src={drag.item.imageUrl || bagIcon} alt="" /></div>}
    {sparks.map((spark) => <i key={spark.id} className="lupage-spark" style={{ left: spark.x, top: spark.y, "--dx": `${spark.dx}px`, "--dy": `${spark.dy}px` } as CSSProperties} />)}
    {successEffect && <div className="lupage-success" data-testid="text-level-up-success"><div className="lupage-success-card"><Star size={70} fill="#f0c040" /><div className="lupage-success-title">LEVEL UP!</div><div className="lupage-success-label">{successEffect.label}</div></div></div>}
  </div>;
}
