import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Heart, Plus, Shield, Sword, Zap } from "lucide-react";
import { getNextZ } from "@/lib/layerManager";
import PetAnimator from "@/components/PetAnimator";
import EvolutionPanel from "@/components/powerup/EvolutionPanel";
import type { PetUpgradeModalProps, PowerUpItem } from "@/components/powerup/PowerUpModalTypes";
import petPlaceholder from "@assets/generated_images/icon_pet_placeholder.png";
import pupBackground from "@assets/PUP-Background .png";
import pupPlatform from "@assets/PUP-ActivePetPlatform.png";
import pupEnhancementBar from "@assets/PUP-EnhancementBar.png";
import pupInventory from "@assets/PUP-Inventory.png";
import pupNameLevelBar from "@assets/PUP-PetName&LvlBar.png";
import pupBagButton from "@assets/PUP-PowerUpButton.png";
import pupCloseButton from "@assets/PUP-XButton.png";

const CSS = String.raw`
.pupage{position:fixed;inset:0;width:100%;max-width:768px;margin:0 auto;overflow:hidden;background:#020a0c;color:#effff6;isolation:isolate;font-family:Georgia,serif;touch-action:pan-y}.pupage *{box-sizing:border-box}.pupage-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:-3;pointer-events:none}.pupage-vignette{position:absolute;inset:0;z-index:-2;pointer-events:none;background:linear-gradient(180deg,rgba(0,8,12,.12),rgba(0,9,11,.02) 38%,rgba(0,7,9,.25) 77%,rgba(0,4,7,.72)),radial-gradient(ellipse at 50% 38%,rgba(26,245,166,.09),transparent 50%)}
.pupage-scroll{height:100%;width:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;overscroll-behavior-x:none;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:max(env(safe-area-inset-top),10px) 10px max(env(safe-area-inset-bottom),18px)}.pupage-scroll::-webkit-scrollbar,.pupage-items::-webkit-scrollbar{display:none}
.pupage-head{position:relative;min-height:147px;text-align:center;padding:7px 70px 0}.pupage-title{margin:6px auto 8px;max-width:100%;white-space:nowrap;font-size:clamp(39px,10.5vw,70px);line-height:.92;font-weight:800;letter-spacing:.045em;background:linear-gradient(#f1fff7 0%,#a9ffd0 37%,#57f4a2 68%,#20b96f 100%);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 8px rgba(80,255,173,.7)) drop-shadow(0 2px 1px rgba(0,19,14,.85))}.pupage-sub{max-width:430px;margin:0 auto;color:#e9f6d9;font-size:clamp(14px,3.8vw,20px);line-height:1.28;text-shadow:0 2px 4px #00120e}.pupage-corner{position:absolute;top:0;width:61px;height:61px;border:0;padding:0;background:transparent;z-index:15;cursor:pointer;-webkit-tap-highlight-color:transparent}.pupage-corner img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 4px 8px #0009)}.pupage-bag{left:0}.pupage-close{right:0}.pupage-corner:active{transform:scale(.96)}
.pupage-enhance{position:relative;width:min(86%,480px);margin:2px auto 5px;display:grid;place-items:center}.pupage-enhance-art{display:block;width:100%;height:auto;pointer-events:none}.pupage-enhance-copy{position:absolute;inset:0;display:grid;place-items:center;padding:0 14%;color:#e7ffe9;font-size:clamp(14px,4vw,22px);font-weight:700;letter-spacing:.015em;text-shadow:0 2px 4px #00130d;white-space:nowrap}
.pupage-stage{position:relative;width:100%;max-width:590px;height:clamp(370px,94vw,510px);margin:0 auto 2px}.pupage-stage-glow{position:absolute;left:50%;top:44%;width:72%;height:58%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(38,255,170,.17),rgba(25,170,126,.055) 47%,transparent 72%);filter:blur(4px);pointer-events:none}.pupage-platform{position:absolute;left:50%;bottom:13%;width:min(64%,370px);height:auto;transform:translateX(-50%);z-index:2;pointer-events:none;filter:drop-shadow(0 9px 13px #0007)}.pupage-pet-zone{position:absolute;left:50%;top:43%;width:min(52vw,280px);height:min(52vw,280px);transform:translate(-50%,-50%);display:grid;place-items:center;z-index:5;touch-action:pan-y;transition:filter .18s,transform .18s}.pupage-pet-zone.over{filter:drop-shadow(0 0 20px #4cffae);transform:translate(-50%,-50%) scale(1.035)}.pupage-pet{width:100%;height:100%;display:grid;place-items:center;pointer-events:none;filter:drop-shadow(0 10px 9px #0008)}.pupage-pet>img{display:block;width:100%;height:100%;object-fit:contain}.pupage-pet .pupage-placeholder{width:72%;height:72%;object-fit:contain;opacity:.72}.pupage-pet.bounce{animation:pupageBounce .72s ease-out}.pupage-pet.flash{animation:pupageFlash .58s ease-out}
.pupage-nameplate{position:absolute;left:50%;bottom:0;width:min(91%,520px);transform:translateX(-50%);z-index:11}.pupage-nameplate-art{display:block;width:100%;height:auto;pointer-events:none;filter:drop-shadow(0 5px 8px #0007)}.pupage-name{position:absolute;left:17%;right:32%;top:50%;transform:translateY(-52%);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;color:#f5d78a;font-size:clamp(18px,5vw,29px);text-shadow:0 2px 4px #000}.pupage-level{position:absolute;right:10%;top:50%;transform:translateY(-50%);color:#baffd9;font:700 clamp(12px,3.6vw,18px)/1 system-ui,sans-serif;white-space:nowrap;text-shadow:0 2px 3px #00130d}
.pupage-stats{position:relative;width:100%;max-width:560px;margin:8px auto 12px;padding:11px 15px 13px;border:1px solid rgba(62,221,141,.75);border-radius:20px;background:linear-gradient(180deg,rgba(3,28,22,.95),rgba(2,15,13,.97));box-shadow:inset 0 0 25px rgba(36,207,119,.12),0 8px 24px #0008,0 0 13px rgba(39,231,141,.1)}.pupage-stats:before,.pupage-stats:after{content:"";position:absolute;top:11px;bottom:11px;width:2px;background:linear-gradient(transparent,#46e79d,transparent);opacity:.58}.pupage-stats:before{left:5px}.pupage-stats:after{right:5px}.pupage-capacity{padding:0 2px 9px;margin-bottom:7px;border-bottom:1px solid rgba(188,151,61,.36)}.pupage-cap-head{display:flex;justify-content:space-between;align-items:center;gap:9px;margin-bottom:6px;color:#dbffea;font:800 11px/1.2 system-ui,sans-serif;letter-spacing:.1em}.pupage-cap-head span:last-child{color:#93f7be;letter-spacing:.015em;text-align:right}.pupage-cap-track{height:9px;border:1px solid #466f5e;border-radius:999px;background:#020d0a;overflow:hidden}.pupage-cap-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#168254,#42e494,#a1ffd1);box-shadow:0 0 10px rgba(77,255,174,.42);transition:width .28s ease}.pupage-cap-ticks{display:flex;justify-content:space-between;margin-top:4px;color:#769987;font:600 9px/1 system-ui,sans-serif}.pupage-stat{display:grid;grid-template-columns:72px minmax(0,1fr) 55px 31px;align-items:center;gap:8px;margin:8px 0}.pupage-stat-label{display:flex;align-items:center;gap:6px;font:800 14px/1 system-ui,sans-serif;letter-spacing:.035em}.pupage-stat-label svg{filter:drop-shadow(0 0 5px currentColor)}.pupage-stat.atk .pupage-stat-label,.pupage-stat.atk .pupage-stat-value{color:#ff737b}.pupage-stat.def .pupage-stat-label,.pupage-stat.def .pupage-stat-value{color:#70aaff}.pupage-stat.hp .pupage-stat-label,.pupage-stat.hp .pupage-stat-value{color:#57ea8d}.pupage-stat-track{height:11px;border:1px solid #46675e;border-radius:999px;background:#05130f;overflow:hidden}.pupage-stat-fill{height:100%;border-radius:inherit;box-shadow:0 0 8px currentColor}.atk .pupage-stat-fill{background:linear-gradient(90deg,#d44a56,#ff737b);color:#ff737b}.def .pupage-stat-fill{background:linear-gradient(90deg,#3776d4,#69a5ff);color:#69a5ff}.hp .pupage-stat-fill{background:linear-gradient(90deg,#24a25e,#52ec8b);color:#52ec8b}.pupage-stat-value{text-align:right;font-size:18px}.pupage-stat-plus{width:30px;height:30px;padding:0;border:1px solid #d1ab47;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle,#15513a,#061b14 72%);color:#ffd967;box-shadow:0 0 8px rgba(64,236,151,.25);cursor:pointer}.pupage-stat-plus:active{transform:scale(.95)}
.pupage-inventory{position:relative;width:100%;max-width:590px;margin:4px auto 0}.pupage-inventory-art{display:block;width:100%;height:auto;pointer-events:none;filter:drop-shadow(0 10px 18px #0008)}.pupage-items-window{position:absolute;left:6.8%;right:17.5%;top:17%;height:47%;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:none}.pupage-items{height:100%;display:grid;grid-auto-flow:column;grid-auto-columns:20%;align-items:stretch;min-width:100%;gap:0}.pupage-item{position:relative;min-width:0;border:0;background:transparent;padding:5%;display:grid;place-items:center;touch-action:none;user-select:none;scroll-snap-align:start;-webkit-tap-highlight-color:transparent}.pupage-item.disabled{opacity:.42;filter:grayscale(.8)}.pupage-item img{display:block;width:78%;height:78%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 3px 4px #0008)}.pupage-qty{position:absolute;right:9%;bottom:6%;min-width:22px;height:22px;padding:0 5px;display:grid;place-items:center;border-radius:999px;border:1px solid #cfab54;background:#07110ee8;color:white;font:700 11px/1 system-ui,sans-serif}.pupage-empty{position:absolute;left:8%;right:18%;top:27%;text-align:center;color:#e9f3e9;font-size:clamp(13px,3.7vw,20px);text-shadow:0 2px 4px #000}.pupage-item-caption{position:absolute;left:5%;right:5%;top:1%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;color:#d5f7e5;font:600 8px/1 system-ui,sans-serif;opacity:.76}.pupage-inventory-hint{position:absolute;left:12%;right:21%;bottom:10%;text-align:center;color:#b6f6c9;font-size:clamp(13px,3.7vw,19px);font-weight:700;text-shadow:0 0 8px rgba(66,255,156,.38)}.pupage-buy{position:absolute;left:50%;bottom:-4px;transform:translate(-50%,100%);z-index:3;border:1px solid #c9a33e;border-radius:999px;background:#112019;color:#ffe48a;padding:9px 16px;font-weight:700;white-space:nowrap}.pupage-bottom-spacer{height:34px}
.pupage-ghost{position:fixed;z-index:10050;width:74px;height:74px;pointer-events:none;transform:translate(-50%,-50%);display:grid;place-items:center;border:1px solid #61f3ad;border-radius:50%;background:#082b21e8;box-shadow:0 0 21px rgba(38,230,138,.58)}.pupage-ghost img{width:61px;height:61px;object-fit:contain}.pupage-spark{position:fixed;z-index:10049;pointer-events:none;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c);animation:pupageSpark .72s ease-out forwards}.pupage-success{position:absolute;inset:0;z-index:10060;display:grid;place-items:center;background:rgba(0,17,13,.72);backdrop-filter:blur(2px);animation:pupageFade .18s ease-out}.pupage-success-card{text-align:center;color:#66f2a5;filter:drop-shadow(0 0 24px #4ade80);animation:pupagePop .48s cubic-bezier(.2,1.5,.4,1)}.pupage-success-card svg{filter:drop-shadow(0 0 15px #4ade80)}.pupage-success-title{margin-top:8px;font-size:clamp(38px,11vw,68px);font-weight:800;text-shadow:0 0 22px #4ade80}.pupage-success-label{color:white;font:700 18px/1.2 system-ui,sans-serif}
@keyframes pupageBounce{40%{transform:translateY(-13px) scale(1.04)}70%{transform:translateY(3px) scale(.98)}}@keyframes pupageFlash{35%{filter:brightness(2) drop-shadow(0 0 22px #fff)}}@keyframes pupageSpark{to{transform:translate(var(--dx),var(--dy)) scale(.1);opacity:0}}@keyframes pupageFade{from{opacity:0}}@keyframes pupagePop{from{transform:scale(.45);opacity:0}}
@media(max-width:430px){.pupage-head{min-height:139px;padding-left:59px;padding-right:59px}.pupage-corner{width:54px;height:54px}.pupage-enhance{width:93%}.pupage-stage{height:clamp(350px,101vw,435px)}.pupage-pet-zone{width:min(54vw,225px);height:min(54vw,225px)}.pupage-platform{width:68%;bottom:14%}.pupage-nameplate{width:96%}.pupage-stats{padding:10px 10px 12px}.pupage-stat{grid-template-columns:62px minmax(0,1fr) 44px 28px;gap:6px}.pupage-stat-label{font-size:12px}.pupage-stat-label svg{width:17px;height:17px}.pupage-stat-value{font-size:15px}.pupage-stat-plus{width:28px;height:28px}.pupage-items-window{left:6.5%;right:17%;top:16%;height:48%}.pupage-inventory-hint{bottom:8%}}
@media(max-height:740px){.pupage-head{min-height:122px}.pupage-title{font-size:39px}.pupage-sub{font-size:13px}.pupage-stage{height:345px}.pupage-pet-zone{width:min(48vw,200px);height:min(48vw,200px)}.pupage-stat{margin:6px 0}.pupage-enhance-copy{font-size:14px}}
@media(prefers-reduced-motion:reduce){.pupage *{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;

function usesCapacity(item: PowerUpItem) {
  return item.type !== "special" && item.statBoostType !== "lvl";
}

function itemLabel(item: PowerUpItem) {
  const n = item.type === "special" ? item.specialAmount : item.statBoostAmount;
  if (item.type === "special") return item.specialType === "hatch_time" ? `-${n ?? "?"} min` : `+${n ?? "?"} LVL pts`;
  return item.statBoostType === "health" ? `+${n ?? "?"} HP` : `+${n ?? "?"} ${(item.statBoostType || "").toUpperCase()}`;
}

function itemColor(item: PowerUpItem) {
  if (item.statBoostType === "health") return "#4ade80";
  if (item.statBoostType === "atk") return "#f87171";
  if (item.statBoostType === "def") return "#60a5fa";
  return "#f0c040";
}

export default function PetPowerUpPage(props: PetUpgradeModalProps) {
  const {
    petName, petImage, petTemplateId, rarity, petLevel, petAtk, petDef, petHealth,
    itemsRemaining, items, isPending, subtitle, showBuyButton = false,
    successEffect, onUseItem, onSuccessAnimEnd, onClose,
  } = props;
  const [z] = useState(() => getNextZ());
  const zoneRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ item: PowerUpItem; x: number; y: number } | null>(null);
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
    return usesCapacity(item) && itemsRemaining !== Infinity && itemsRemaining <= 0;
  }, [isPending, itemsRemaining]);

  const pointInZone = useCallback((x: number, y: number) => {
    const r = zoneRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }, []);

  const burst = useCallback((color: string) => {
    const r = zoneRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const next = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      return {
        id: sparkId.current++, x, y,
        dx: Math.cos(angle) * (58 + Math.random() * 72),
        dy: Math.sin(angle) * (58 + Math.random() * 72),
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
  }, [burst, disabled, onUseItem]);

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

  const clearDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setOver(false);
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    if (pointInZone(event.clientX, event.clientY)) useItem(current.item);
    clearDrag();
  }, [clearDrag, pointInZone, useItem]);

  const scrollToItems = useCallback(() => {
    trayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const pet = petImage ? (
    <img src={petImage} alt={petName} draggable={false} />
  ) : petTemplateId ? (
    <PetAnimator petTemplateId={petTemplateId} mode="idle" view="front" size={700} className="w-full" style={{ aspectRatio: "1/1", pointerEvents: "none" }} />
  ) : (
    <img src={petPlaceholder} alt="" className="pupage-placeholder" draggable={false} />
  );

  const slotsPerLevel = rarity <= 2 ? 1 : rarity === 3 ? 2 : 3;
  const capacity = Math.max(1, petLevel || 1) * slotsPerLevel;
  const remaining = itemsRemaining === Infinity ? capacity : Math.max(0, Math.min(capacity, itemsRemaining));
  const used = Math.max(0, capacity - remaining);
  const capacityPercent = Math.max(0, Math.min(100, (used / capacity) * 100));
  const statRows = [
    { key: "atk", label: "ATK", value: petAtk, max: 200, icon: <Sword size={19} /> },
    { key: "def", label: "DEF", value: petDef, max: 200, icon: <Shield size={19} /> },
    { key: "hp", label: "HP", value: petHealth, max: 2500, icon: <Heart size={19} fill="currentColor" /> },
  ];

  return <div className="pupage" style={{ zIndex: z }} role="dialog" aria-modal="true" aria-label="Power Up">
    <style>{CSS}</style>
    <img src={pupBackground} alt="" className="pupage-bg" />
    <div className="pupage-vignette" />
    <div className="pupage-scroll">
      <header className="pupage-head">
        <button type="button" className="pupage-corner pupage-bag" onClick={scrollToItems} aria-label="Show Power Up items">
          <img src={pupBagButton} alt="" />
        </button>
        <h2 className="pupage-title">POWER UP</h2>
        <div className="pupage-sub">{subtitle || `Drag an item onto ${petName} to boost their stats`}</div>
        <button type="button" className="pupage-corner pupage-close" onClick={onClose} data-testid="button-close-powerup-modal" aria-label="Close Power Up">
          <img src={pupCloseButton} alt="" />
        </button>
      </header>

      <section className="pupage-enhance" aria-label={`${remaining} enhancements remaining`}>
        <img src={pupEnhancementBar} alt="" className="pupage-enhance-art" />
        <div className="pupage-enhance-copy">{remaining} enhancement{remaining === 1 ? "" : "s"} remaining</div>
      </section>

      <section className="pupage-stage">
        <div className="pupage-stage-glow" />
        <img src={pupPlatform} alt="" className="pupage-platform" />
        <EvolutionPanel enabled fallbackRarity={rarity} layout="orbit" />
        <div ref={zoneRef} className={`pupage-pet-zone ${over ? "over" : ""}`} data-testid="zone-pet-drop">
          <div className={`pupage-pet ${petAnim}`}>{pet}</div>
        </div>
        <div className="pupage-nameplate">
          <img src={pupNameLevelBar} alt="" className="pupage-nameplate-art" />
          <div className="pupage-name">{petName}</div>
          <div className="pupage-level">Lv.{petLevel}</div>
        </div>
      </section>

      <section className="pupage-stats" data-testid="section-pet-stats">
        <div className="pupage-capacity" data-testid="section-powerup-progress">
          <div className="pupage-cap-head"><span>POWER UP CAPACITY</span><span>{used} used · {remaining} available</span></div>
          <div className="pupage-cap-track" data-testid="bar-powerup-capacity"><i style={{ width: `${capacityPercent}%` }} /></div>
          <div className="pupage-cap-ticks"><span>0</span><span>{capacity} total through Lv.{Math.max(1, petLevel || 1)}</span></div>
        </div>
        {statRows.map((stat) => <div key={stat.key} className={`pupage-stat ${stat.key}`}>
          <div className="pupage-stat-label">{stat.icon}<b>{stat.label}</b></div>
          <div className="pupage-stat-track" data-testid={`bar-stat-${stat.key}`}><div className="pupage-stat-fill" style={{ width: `${Math.min(100, Math.max(3, stat.value / stat.max * 100))}%` }} /></div>
          <span className="pupage-stat-value" data-testid={`text-stat-${stat.key}`}>{stat.value}</span>
          <button type="button" className="pupage-stat-plus" onClick={scrollToItems} aria-label={`Choose an item to increase ${stat.label}`}><Plus size={18} strokeWidth={3} /></button>
        </div>)}
      </section>

      <section className="pupage-inventory" ref={trayRef} aria-label="Power Up inventory">
        <img src={pupInventory} alt="" className="pupage-inventory-art" />
        {items.length ? <div className="pupage-items-window">
          <div className="pupage-items">
            {items.map((item) => <button
              type="button"
              key={item.inventoryId}
              data-testid={`item-powerup-${item.inventoryId}`}
              className={`pupage-item ${disabled(item) ? "disabled" : ""}`}
              title={`${item.name} • ${itemLabel(item)}`}
              onPointerDown={(event) => onPointerDown(event, item)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={clearDrag}
              disabled={disabled(item)}
            >
              <span className="pupage-item-caption">{itemLabel(item)}</span>
              {item.imageUrl && <img src={item.imageUrl} alt={item.name} draggable={false} />}
              {item.quantity > 1 && <span className="pupage-qty">{item.quantity}</span>}
            </button>)}
          </div>
        </div> : <div className="pupage-empty">No usable items in your bag.</div>}
        <div className="pupage-inventory-hint">Drag to infuse</div>
        {showBuyButton && <button className="pupage-buy" data-testid="button-buy-powerups" onClick={() => { window.location.href = "/world/swamp?shopHint=a1b2c3d4-0004-4000-8000-000000000004"; }}>Find Power Up Items</button>}
      </section>
      <div className="pupage-bottom-spacer" />
    </div>

    {drag && <div className="pupage-ghost" style={{ left: drag.x, top: drag.y }}><img src={drag.item.imageUrl || petPlaceholder} alt="" /></div>}
    {sparks.map((spark) => <i key={spark.id} className="pupage-spark" style={{ left: spark.x, top: spark.y, "--c": spark.color, "--dx": `${spark.dx}px`, "--dy": `${spark.dy}px` } as CSSProperties} />)}
    {successEffect && <div className="pupage-success" data-testid="text-power-up-success"><div className="pupage-success-card"><Zap size={70} fill="#4ade80" /><div className="pupage-success-title">POWER UP!</div><div className="pupage-success-label">{successEffect.label}</div></div></div>}
  </div>;
}
