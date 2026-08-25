import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Clock, Star, X, Zap } from "lucide-react";
import { getNextZ } from "@/lib/layerManager";
import PetAnimator from "@/components/PetAnimator";
import EvolutionPanel from "@/components/powerup/EvolutionPanel";
import powerupBagIcon from "@assets/generated_images/icon_powerup_bag.png";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import forestBg from "@assets/generated_images/powerup_forest_bg.png";
import chamberClose from "@assets/generated_images/powerup_chamber/powerup_close.webp";

const EFFECTS: Record<"stat" | "level" | "hatch", { color: string; icon: ReactNode; title: string }> = {
  stat: { color: "#4ade80", icon: <Zap size={70} fill="#4ade80" />, title: "POWER UP!" },
  level: { color: "#f0c040", icon: <Star size={70} fill="#f0c040" />, title: "LEVEL UP!" },
  hatch: { color: "#38bdf8", icon: <Clock size={70} />, title: "SPEED UP!" },
};

export interface PowerUpItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  statBoostType: string | null;
  statBoostAmount: number | null;
  specialType: string | null;
  specialAmount: number | null;
  quantity: number;
}

interface PetPowerUpModalProps {
  petName: string;
  petImage: string | null;
  petTemplateId: string | null;
  rarity: number;
  petLevel: number;
  petAtk: number;
  petDef: number;
  petHealth: number;
  itemsRemaining: number;
  items: PowerUpItem[];
  isPending: boolean;
  title?: string;
  subtitle?: string;
  showBuyButton?: boolean;
  successEffect?: { type: "stat" | "level" | "hatch"; label: string } | null;
  onUseItem: (item: PowerUpItem) => void;
  onSuccessAnimEnd: () => void;
  onClose: () => void;
}

const CSS = String.raw`
.pum{position:fixed;inset:0;left:0;right:0;width:100%;max-width:768px;margin:0 auto;box-sizing:border-box;background:#02090d;color:#effff7;overflow:hidden;overflow-x:hidden;overscroll-behavior-x:none;touch-action:pan-y;isolation:isolate;font-family:Georgia,serif}
.pum *{box-sizing:border-box}.pum-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-4}.pum.power .pum-bg{filter:saturate(1.25) hue-rotate(12deg) brightness(.72)}.pum-shade{position:absolute;inset:0;z-index:-3;pointer-events:none;background:linear-gradient(#00111780,#00101410 35%,#00101252 70%,#00070bd9),radial-gradient(circle at 50% 38%,#23f7a219 0 29%,transparent 57%)}
.pum-scroll{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;overscroll-behavior-x:none;touch-action:pan-y;padding:max(env(safe-area-inset-top),10px) 12px max(env(safe-area-inset-bottom),18px);scrollbar-width:none;-webkit-overflow-scrolling:touch}.pum-scroll::-webkit-scrollbar,.pum-items::-webkit-scrollbar{display:none}
.pum-head{position:relative;text-align:center;min-height:102px;padding:5px 58px 0}.pum-title{margin:6px 0 4px;font-size:clamp(32px,10vw,56px);line-height:1;font-weight:700;letter-spacing:.08em;color:#f2cf67;text-shadow:0 2px #16200d,0 0 18px #f7d86b66}.power .pum-title{color:#baffdc;background:linear-gradient(#ecfff6,#78ffc0 52%,#1ecc81);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:none;filter:drop-shadow(0 0 11px #35ffb36b)}.pum-sub{font-size:clamp(13px,3.6vw,18px);line-height:1.2;color:#b8e8ce}.pum-close{position:absolute;right:1px;top:0;width:52px;height:52px;border:0;background:#06251d;border-radius:50%;display:grid;place-items:center;color:#c8ffe3;z-index:3}.pum-close.asset{width:58px;height:58px;background:transparent}.pum-close.asset img{width:100%;height:100%;object-fit:contain}
.pum-rule{max-width:470px;margin:0 auto 8px;padding:9px 15px;border:1px solid #af852f;border-radius:999px;background:#191a11dd;color:#ffe58a;text-align:center;font-weight:700;letter-spacing:.03em}.power .pum-rule{border-color:#66eaa3;background:linear-gradient(90deg,#05231bea,#0a3628f2,#05231bea);box-shadow:inset 0 0 18px #18cf7733,0 0 14px #1ff38a1c;color:#caffdf}
.pum-stage{position:relative;width:100%;max-width:550px;margin:0 auto;min-height:350px;overflow:visible}.pum-mote{position:absolute;border-radius:50%;background:#75ffbd;box-shadow:0 0 14px #4bffad;opacity:.65;animation:pumMote 3.6s ease-in-out infinite}.pum-mote:nth-child(1){left:12%;top:25%;width:5px;height:5px}.pum-mote:nth-child(2){right:12%;top:34%;width:7px;height:7px;animation-delay:-1.2s}.pum-mote:nth-child(3){left:20%;top:60%;width:4px;height:4px;animation-delay:-2s}
.pum-pet-zone{position:relative;width:min(76vw,350px);max-width:100%;aspect-ratio:1;margin:4px auto 0;display:grid;place-items:center;touch-action:pan-y;transition:filter .2s,transform .2s}.pum-pet-zone.over{filter:drop-shadow(0 0 18px #5bffae);transform:scale(1.025)}.pum-rune{position:absolute;left:50%;bottom:0;width:72%;aspect-ratio:1;transform:translateX(-50%) rotateX(63deg);border:2px solid #4affb6aa;border-radius:50%;box-shadow:0 0 18px #21e88c88,inset 0 0 28px #1de58a55;background:repeating-radial-gradient(circle,#32f7a111 0 9%,#60ffc533 10%,transparent 11% 19%);animation:pumPulse 2.1s ease-in-out infinite}.pum-rune:after{content:"✦";position:absolute;inset:18%;display:grid;place-items:center;border:1px solid #79ffd0aa;border-radius:50%;color:#8affd1;font-size:42px}
.pum-pet{position:relative;z-index:3;width:92%;height:92%;display:grid;place-items:center;filter:drop-shadow(0 12px 10px #0009);pointer-events:none}.pum-pet>img{display:block;width:100%;height:100%;object-fit:contain}.pum-pet.bounce{animation:pumBounce .7s ease-out}.pum-pet.flash{animation:pumFlash .6s ease-out}.pum-identity{position:relative;z-index:5;margin:-4px auto 8px;width:min(94%,500px);display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 14px;background:linear-gradient(90deg,transparent,#071c18e8 15% 85%,transparent);border-top:1px solid #b79746;border-bottom:1px solid #b79746;color:#f7d97b;font-size:clamp(20px,5.3vw,28px);text-align:center}.pum-level{font-size:.65em;padding:5px 10px;border:1px solid #3ecc86;border-radius:999px;color:#a9ffd0;background:#073226}
.pum-power-progress{width:100%;max-width:540px;margin:0 auto 10px;padding:11px 13px;border:1px solid #3c8f6b;border-radius:16px;background:linear-gradient(180deg,#092019ed,#05130fee);box-shadow:inset 0 0 18px #32df8514,0 7px 17px #0005}.pum-power-progress-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;font:700 11px/1.2 system-ui,sans-serif;color:#c7ffe0;letter-spacing:.03em}.pum-power-progress-head span:last-child{color:#8ef3bd}.pum-power-track{height:11px;border-radius:999px;border:1px solid #427761;background:#03100c;overflow:hidden}.pum-power-track>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#1f8f5e,#47e99b,#a6ffd4);box-shadow:0 0 9px #4dffae66;transition:width .3s ease}.pum-power-ticks{display:flex;justify-content:space-between;margin-top:4px;color:#719985;font:600 9px/1 system-ui,sans-serif}
.pum-stats{width:100%;max-width:540px;margin:0 auto 10px;padding:12px 13px;border:1px solid #2d9a6c;border-radius:18px;background:linear-gradient(135deg,#071c1bea,#031311ee);box-shadow:inset 0 0 18px #1eaa6c1d,0 7px 18px #0007}.pum-stat{display:grid;grid-template-columns:54px minmax(0,1fr) 55px;align-items:center;gap:9px;margin:8px 0}.pum-stat b{font-family:system-ui,sans-serif;letter-spacing:.04em}.pum-stat.atk b,.pum-stat.atk .pum-val{color:#ff7979}.pum-stat.def b,.pum-stat.def .pum-val{color:#72adff}.pum-stat.hp b,.pum-stat.hp .pum-val{color:#58e891}.pum-track{height:11px;border:1px solid #41665d;border-radius:999px;background:#061310;overflow:hidden}.pum-fill{height:100%;border-radius:inherit;box-shadow:0 0 9px currentColor}.atk .pum-fill{background:#ef6464;color:#ef6464}.def .pum-fill{background:#5798f2;color:#5798f2}.hp .pum-fill{background:#42d77d;color:#42d77d}.pum-val{text-align:right;font-size:18px}
.pum-tray{width:100%;max-width:560px;margin:9px auto 0;padding:11px 8px 8px;border:1px solid #398b68;border-radius:16px;background:linear-gradient(#10231fec,#07100fef);box-shadow:inset 0 0 20px #27b87d1f,0 12px 22px #0008}.pum-items{display:flex;gap:8px;width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;padding:4px 3px 8px;scroll-snap-type:x proximity}.pum-item{position:relative;flex:0 0 78px;height:82px;border:1px solid #4d8e74;border-radius:13px;background:#081b17;display:grid;place-items:center;touch-action:none;user-select:none;scroll-snap-align:center;box-shadow:inset 0 0 12px #22c77a16}.pum-item:active{transform:scale(.96)}.pum-item.disabled{opacity:.42;filter:grayscale(.75)}.pum-item img{width:60px;height:60px;object-fit:contain;pointer-events:none}.pum-qty{position:absolute;right:3px;bottom:3px;min-width:23px;height:23px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:#07100f;border:1px solid #cfad55;color:#fff;font:700 12px system-ui}.pum-item-name{position:absolute;left:4px;right:4px;top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#d6f9e5;font:600 9px system-ui;text-align:center;opacity:.78}.pum-hint{text-align:center;color:#8effc5;font-weight:700;letter-spacing:.05em;padding:4px 0 1px;text-shadow:0 0 9px #2dff9a55}.pum-empty{text-align:center;color:#d3eadc;padding:18px 8px}.pum-buy{display:block;margin:7px auto 0;border:1px solid #cda63e;border-radius:999px;background:#1b2115;color:#ffe68a;padding:10px 18px;font-weight:700}
.pum-ghost{position:fixed;z-index:9999;width:76px;height:76px;pointer-events:none;transform:translate(-50%,-50%);display:grid;place-items:center;border-radius:50%;background:#0a2d22dd;border:1px solid #60f4ac;box-shadow:0 0 20px #26e68a88}.pum-ghost img{width:62px;height:62px;object-fit:contain}.pum-spark{position:fixed;z-index:9998;pointer-events:none;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c);animation:pumSpark .72s ease-out forwards}.pum-success{position:absolute;inset:0;z-index:30;display:grid;place-items:center;background:#00110db8;backdrop-filter:blur(2px);animation:pumFade .18s ease-out}.pum-success-card{text-align:center;animation:pumPop .5s cubic-bezier(.2,1.5,.4,1);filter:drop-shadow(0 0 24px var(--c))}.pum-success-card svg{color:var(--c);filter:drop-shadow(0 0 15px var(--c))}.pum-success-title{font-size:clamp(38px,11vw,68px);font-weight:800;color:var(--c);text-shadow:0 0 22px var(--c);margin-top:8px}.pum-success-label{font:700 18px system-ui;color:white}
.pum-legacy-stage{width:100%;max-width:480px;margin:12px auto;display:grid;place-items:center}.pum-legacy-pet{width:min(76vw,360px);height:min(76vw,360px);display:grid;place-items:center;touch-action:pan-y}.pum-legacy-pet>img{width:100%;height:100%;object-fit:contain}.pum-legacy-stars{text-align:center;color:#ffd950;font-size:28px;letter-spacing:.12em;margin:-12px 0 5px}.pum-legacy .pum-tray{margin-top:18px;background:transparent;border-color:#a8863b55}.pum-legacy .pum-item{background:#14160fdd;border-color:#aa8c41}.pum-legacy .pum-hint{color:#f9d778}.pum-bag{width:54px;height:54px;object-fit:contain;display:block;margin:4px auto}.pum-placeholder{width:75%!important;height:75%!important;object-fit:contain;opacity:.7}
@keyframes pumMote{50%{transform:translateY(-13px);opacity:1}}@keyframes pumPulse{50%{filter:brightness(1.35);box-shadow:0 0 28px #21e88ccc,inset 0 0 34px #1de58a88}}@keyframes pumBounce{40%{transform:translateY(-14px) scale(1.04)}70%{transform:translateY(3px) scale(.98)}}@keyframes pumFlash{35%{filter:brightness(2) drop-shadow(0 0 22px #fff)}}@keyframes pumSpark{to{transform:translate(var(--dx),var(--dy)) scale(.1);opacity:0}}@keyframes pumFade{from{opacity:0}}@keyframes pumPop{from{transform:scale(.45);opacity:0}}
@media(max-width:430px){.pum-scroll{padding-left:8px;padding-right:8px}.pum-head{padding-left:50px;padding-right:50px}.pum-stage{min-height:330px}.pum-pet-zone{width:min(80vw,330px)}.pum-stat{grid-template-columns:50px minmax(0,1fr) 48px;gap:7px}.pum-power-progress,.pum-stats,.pum-tray{border-radius:14px}}
@media(max-height:740px){.pum-head{min-height:88px}.pum-stage{min-height:305px}.pum-pet-zone{width:min(66vw,290px);margin-top:0}.pum-stat{margin:5px 0}.pum-item{height:72px;flex-basis:70px}.pum-item img{width:52px;height:52px}}
@media(prefers-reduced-motion:reduce){.pum *{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;

function itemColor(item: PowerUpItem) {
  if (item.type === "special") return item.specialType === "hatch_time" ? "#38bdf8" : "#f0c040";
  return item.statBoostType === "health" ? "#4ade80" : item.statBoostType === "atk" ? "#f87171" : item.statBoostType === "def" ? "#60a5fa" : "#f0c040";
}

function itemLabel(item: PowerUpItem) {
  const n = item.type === "special" ? item.specialAmount : item.statBoostAmount;
  if (item.type === "special") return item.specialType === "hatch_time" ? `-${n ?? "?"} min` : `+${n ?? "?"} LVL pts`;
  return item.statBoostType === "health" ? `+${n ?? "?"} HP` : `+${n ?? "?"} ${(item.statBoostType || "").toUpperCase()}`;
}

function usesSlot(item: PowerUpItem) {
  return item.type !== "special" && item.statBoostType !== "lvl";
}

export default function PetPowerUpModal(props: PetPowerUpModalProps) {
  const {
    petName, petImage, petTemplateId, rarity, petLevel, petAtk, petDef, petHealth,
    itemsRemaining, items, isPending, title = "POWER UP", subtitle, showBuyButton = false,
    successEffect, onUseItem, onSuccessAnimEnd, onClose,
  } = props;
  const isPower = title.trim().toUpperCase() === "POWER UP";
  const zoneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [z] = useState(() => getNextZ());
  const [drag, setDrag] = useState<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [over, setOver] = useState(false);
  const [petAnim, setPetAnim] = useState<"" | "bounce" | "flash">("");
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number; dx: number; dy: number; color: string }[]>([]);
  const sparkId = useRef(0);

  useEffect(() => { dragRef.current = drag; }, [drag]);
  useEffect(() => {
    if (!successEffect) return;
    const timer = window.setTimeout(onSuccessAnimEnd, 2400);
    return () => window.clearTimeout(timer);
  }, [successEffect, onSuccessAnimEnd]);

  const disabled = useCallback((item: PowerUpItem) => {
    if (isPending || item.quantity <= 0) return true;
    return usesSlot(item) && itemsRemaining !== Infinity && itemsRemaining <= 0;
  }, [isPending, itemsRemaining]);

  const burst = useCallback((color: string) => {
    const r = zoneRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const next = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      return {
        id: sparkId.current++, x, y,
        dx: Math.cos(angle) * (55 + Math.random() * 75),
        dy: Math.sin(angle) * (55 + Math.random() * 75),
        color,
      };
    });
    setSparks(next);
    window.setTimeout(() => setSparks([]), 760);
  }, []);

  const useItem = useCallback((item: PowerUpItem) => {
    if (disabled(item)) return;
    burst(itemColor(item));
    setPetAnim("bounce");
    window.setTimeout(() => setPetAnim("flash"), 260);
    window.setTimeout(() => setPetAnim(""), 850);
    onUseItem(item);
  }, [disabled, burst, onUseItem]);

  const pointInZone = useCallback((x: number, y: number) => {
    const r = zoneRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }, []);

  const onDown = useCallback((e: ReactPointerEvent<HTMLDivElement>, item: PowerUpItem) => {
    if (disabled(item)) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const next = { item, x: e.clientX, y: e.clientY };
    dragRef.current = next;
    setDrag(next);
  }, [disabled]);

  const onMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const next = { ...dragRef.current, x: e.clientX, y: e.clientY };
    dragRef.current = next;
    setDrag(next);
    setOver(pointInZone(e.clientX, e.clientY));
  }, [pointInZone]);

  const clearDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setOver(false);
  }, []);

  const onUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (pointInZone(e.clientX, e.clientY)) useItem(current.item);
    clearDrag();
  }, [clearDrag, pointInZone, useItem]);

  // Prefer the pet's flattened hatched image when available. It is the most
  // reliable representation inside a full-screen modal; layered templates are
  // still used as a fallback for pets that do not have a flattened image.
  const pet = petImage ? (
    <img src={petImage} alt={petName} draggable={false} />
  ) : petTemplateId ? (
    <PetAnimator petTemplateId={petTemplateId} mode="idle" view="front" size={700} className="w-full" style={{ aspectRatio: "1/1", pointerEvents: "none" }} />
  ) : (
    <img src={petPawIcon} alt="" className="pum-placeholder" draggable={false} />
  );

  const itemTray = (
    <div className="pum-tray">
      {items.length ? <div className="pum-items">
        {items.map((item) => <div
          key={item.inventoryId}
          data-testid={`item-powerup-${item.inventoryId}`}
          className={`pum-item ${disabled(item) ? "disabled" : ""}`}
          title={`${item.name} • ${itemLabel(item)}`}
          onPointerDown={(e) => onDown(e, item)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={clearDrag}
        >
          <span className="pum-item-name">{itemLabel(item)}</span>
          <img src={item.imageUrl || powerupBagIcon} alt={item.name} draggable={false} />
          {item.quantity > 1 && <span className="pum-qty">{item.quantity}</span>}
        </div>)}
      </div> : <div className="pum-empty">No usable items in your bag.</div>}
      {isPower && <div className="pum-hint">↖ Drag to infuse ↗</div>}
      {showBuyButton && <button className="pum-buy" data-testid="button-buy-powerups" onClick={() => { window.location.href = "/world/swamp?shopHint=a1b2c3d4-0004-4000-8000-000000000004"; }}>Find Power Up Items</button>}
    </div>
  );

  const slotsPerLevel = rarity <= 2 ? 1 : rarity === 3 ? 2 : 3;
  const powerCapacity = Math.max(1, petLevel || 1) * slotsPerLevel;
  const finiteRemaining = itemsRemaining === Infinity ? powerCapacity : Math.max(0, Math.min(powerCapacity, itemsRemaining));
  const powerUsed = Math.max(0, powerCapacity - finiteRemaining);
  const powerPercent = Math.max(0, Math.min(100, (powerUsed / powerCapacity) * 100));

  const powerProgress = isPower ? (
    <section className="pum-power-progress" data-testid="section-powerup-progress">
      <div className="pum-power-progress-head">
        <span>POWER UP CAPACITY</span>
        <span>{powerUsed} used · {finiteRemaining} available</span>
      </div>
      <div className="pum-power-track" data-testid="bar-powerup-capacity"><i style={{ width: `${powerPercent}%` }} /></div>
      <div className="pum-power-ticks"><span>0</span><span>{powerCapacity} total through Lv.{Math.max(1, petLevel || 1)}</span></div>
    </section>
  ) : null;

  const stats = (
    <div className="pum-stats" data-testid="section-pet-stats">
      {[{ k: "atk", n: "ATK", v: petAtk, max: 200 }, { k: "def", n: "DEF", v: petDef, max: 200 }, { k: "hp", n: "HP", v: petHealth, max: 2500 }].map((s) => (
        <div key={s.k} className={`pum-stat ${s.k}`}>
          <b>{s.n}</b>
          <div className="pum-track" data-testid={`bar-stat-${s.k}`}><div className="pum-fill" style={{ width: `${Math.min(100, Math.max(3, s.v / s.max * 100))}%` }} /></div>
          <span className="pum-val" data-testid={`text-stat-${s.k}`}>{s.v}</span>
        </div>
      ))}
    </div>
  );

  const success = successEffect ? (() => {
    const cfg = EFFECTS[successEffect.type];
    return <div className="pum-success" data-testid="text-power-up-success"><div className="pum-success-card" style={{ "--c": cfg.color } as CSSProperties}>{cfg.icon}<div className="pum-success-title">{cfg.title}</div><div className="pum-success-label">{successEffect.label}</div></div></div>;
  })() : null;

  return <div className={`pum ${isPower ? "power" : "pum-legacy"}`} style={{ zIndex: z }} role="dialog" aria-modal="true" aria-label={title}>
    <style>{CSS}</style>
    <img src={forestBg} alt="" className="pum-bg" />
    <div className="pum-shade" />
    <div className="pum-scroll">
      <header className="pum-head">
        <h2 className="pum-title">{title}</h2>
        {subtitle && <div className="pum-sub">{subtitle}</div>}
        <button className={`pum-close ${isPower ? "asset" : ""}`} onClick={onClose} data-testid="button-close-powerup-modal" aria-label="Close">
          {isPower ? <img src={chamberClose} alt="" /> : <X size={30} />}
        </button>
      </header>
      <div className="pum-rule">{isPower ? `✦ ${Math.max(0, finiteRemaining)} regular power up${finiteRemaining === 1 ? "" : "s"} available` : itemsRemaining === Infinity ? "✦ No limit — use as many as you like!" : `✦ ${Math.max(0, itemsRemaining)} slots remaining this level`}</div>

      {isPower ? <>
        <section className="pum-stage">
          <i className="pum-mote" /><i className="pum-mote" /><i className="pum-mote" />
          <div ref={zoneRef} className={`pum-pet-zone ${over ? "over" : ""}`} data-testid="zone-pet-drop">
            <div className="pum-rune" />
            <div className={`pum-pet ${petAnim}`}>{pet}</div>
          </div>
          <div className="pum-identity"><span>{petName}</span><span className="pum-level">Lv.{petLevel}</span></div>
        </section>
        {powerProgress}
        {stats}
        <EvolutionPanel enabled fallbackRarity={rarity} />
        {itemTray}
      </> : <>
        <section className="pum-legacy-stage">
          <div ref={zoneRef} className={`pum-legacy-pet pum-pet ${petAnim} ${over ? "over" : ""}`} data-testid="zone-pet-drop">{pet}</div>
          <div className="pum-legacy-stars">{"★".repeat(Math.max(1, Math.min(5, rarity)))}</div>
          <div className="pum-identity"><span>{petName}</span><span className="pum-level">Lv.{petLevel}</span></div>
        </section>
        {stats}
        <img className="pum-bag" src={powerupBagIcon} alt="" />
        {itemTray}
      </>}
    </div>

    {drag && <div className="pum-ghost" style={{ left: drag.x, top: drag.y }}><img src={drag.item.imageUrl || powerupBagIcon} alt="" /></div>}
    {sparks.map((s) => <i key={s.id} className="pum-spark" style={{ left: s.x, top: s.y, "--c": s.color, "--dx": `${s.dx}px`, "--dy": `${s.dy}px` } as CSSProperties} />)}
    {success}
  </div>;
}
