import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { getNextZ } from "@/lib/layerManager";
import { setNavHidden } from "@/lib/navVisibility";
import PetAnimator from "@/components/PetAnimator";
import EvolutionPanel from "@/components/powerup/EvolutionPanel";
import type { PetUpgradeModalProps, PowerUpItem } from "@/components/powerup/PowerUpModalTypes";
import petPlaceholder from "@assets/generated_images/icon_pet_placeholder.png";
import pupBackground from "@assets/ui/power-up/background.png";
import pupPlatform from "@assets/ui/power-up/active-pet-platform.png";
import pupEnhancementBar from "@assets/ui/power-up/enhancements-remaining-bar.png";
import pupItemBar from "@assets/ui/power-up/power-up-item-bar.png";
import pupNameLevelBar from "@assets/ui/power-up/pet-name-level-bar.png";
import pupLogo from "@assets/ui/power-up/power-up-logo.png";
import pupCloseButton from "@assets/ui/power-up/close-page-icon.png";
import pupStatBox from "@assets/ui/power-up/stat-box.png";

const ITEMS_PER_PAGE = 5;
type StatFilter = "atk" | "def" | "health" | null;

const CSS = String.raw`
.pupage{position:fixed;inset:0;width:100%;max-width:768px;margin:0 auto;overflow:hidden;background:#020a0c;color:#effff6;isolation:isolate;font-family:Georgia,serif;touch-action:none}.pupage *{box-sizing:border-box}.pupage-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;z-index:-3;pointer-events:none}.pupage-vignette{position:absolute;inset:0;z-index:-2;pointer-events:none;background:linear-gradient(180deg,rgba(0,6,9,.08),rgba(0,7,9,.03) 62%,rgba(0,4,7,.58))}.pupage-scroll{height:100%;width:100%;overflow:hidden;overscroll-behavior:none;touch-action:none;scrollbar-width:none;padding:max(env(safe-area-inset-top),8px) 10px max(env(safe-area-inset-bottom),12px)}.pupage-scroll::-webkit-scrollbar{display:none}.pupage-head{position:relative;min-height:106px;padding:0 52px;text-align:center}.pupage-logo{display:block;width:min(88vw,560px);max-width:100%;height:auto;margin:0 auto;object-fit:contain;filter:drop-shadow(0 0 9px rgba(76,255,170,.3))}.pupage-corner{position:absolute;top:0;width:38px;height:38px;border:0;padding:0;background:transparent;z-index:15;cursor:pointer;-webkit-tap-highlight-color:transparent}.pupage-corner img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 4px 8px #0009)}.pupage-close{right:2px}.pupage-corner:active{transform:scale(.96)}
.pupage-capacity{width:min(88%,480px);margin:0 auto 3px;padding:5px 11px 6px;border:1px solid rgba(69,219,142,.72);border-radius:13px;background:linear-gradient(180deg,rgba(4,31,24,.95),rgba(2,15,13,.96));box-shadow:inset 0 0 18px rgba(42,215,128,.1),0 5px 14px #0006}.pupage-cap-track{height:11px;border:1px solid #4b7463;border-radius:999px;background:#020d0a;overflow:hidden}.pupage-cap-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#168254,#42e494,#a1ffd1);box-shadow:0 0 10px rgba(77,255,174,.42);transition:width .28s ease}.pupage-cap-ticks{display:flex;justify-content:space-between;gap:8px;margin-top:3px;color:#b7d9c8;font:700 9px/1.1 system-ui,sans-serif}.pupage-cap-ticks span:last-child{text-align:right}
.pupage-enhance{position:relative;width:min(58%,310px);margin:-3px auto -4px;display:grid;place-items:center}.pupage-enhance-art{position:relative;z-index:0;display:block;width:100%;height:auto;pointer-events:none}.pupage-enhance-copy{position:absolute;inset:0;z-index:1;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:5px;padding:0 16%;white-space:nowrap;text-align:center}.pupage-enhance-count{color:#72f2a8;font:800 clamp(14px,3.7vw,20px)/1 Georgia,serif;text-shadow:0 2px 6px #00130d,0 0 10px rgba(94,255,174,.48)}.pupage-enhance-label{color:#dffbec;font:700 clamp(9px,2.4vw,13px)/1 Georgia,serif;letter-spacing:.02em;text-shadow:0 2px 5px #00130d}
.pupage-stage{position:relative;width:100%;max-width:610px;height:clamp(330px,90vw,455px);margin:-8px auto 0}.pupage-platform{position:absolute;left:50%;top:51%;width:min(75%,435px);height:auto;transform:translate(-50%,-50%);z-index:2;pointer-events:none;filter:drop-shadow(0 10px 14px #0007)}.pupage-pet-zone{position:absolute;left:50%;top:37%;width:min(64vw,350px);height:min(64vw,350px);transform:translate(-50%,-50%);display:grid;place-items:center;z-index:6;touch-action:pan-y;transition:filter .18s,transform .18s;cursor:pointer;-webkit-tap-highlight-color:transparent}.pupage-pet-zone:focus-visible{outline:2px solid #7bffc0;outline-offset:5px;border-radius:50%}.pupage-pet-zone.over{filter:drop-shadow(0 0 22px #4cffae);transform:translate(-50%,-50%) scale(1.035)}.pupage-pet{width:100%;height:100%;display:grid;place-items:center;pointer-events:none;filter:drop-shadow(0 11px 10px #0008)}.pupage-pet>img{display:block;width:100%;height:100%;object-fit:contain}.pupage-placeholder{width:72%!important;height:72%!important;opacity:.72}.pupage-pet.bounce{animation:pupageBounce .72s ease-out}.pupage-pet.flash{animation:pupageFlash .58s ease-out}.pupage-nameplate{position:absolute;left:50%;bottom:-1px;width:min(74%,410px);transform:translateX(-50%);z-index:12}.pupage-nameplate-art{position:relative;z-index:0;display:block;width:100%;height:auto;pointer-events:none}.pupage-name{position:absolute;left:17%;right:29%;top:50%;z-index:1;transform:translateY(-52%);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;color:#f7dd98;font-size:clamp(12px,3.3vw,18px);text-shadow:0 2px 4px #000}.pupage-level{position:absolute;right:6.5%;top:51%;z-index:1;transform:translateY(-50%);color:#c6ffe1;font:700 clamp(9px,2.4vw,12px)/1 system-ui,sans-serif;white-space:nowrap;text-shadow:0 2px 3px #00130d}
.pupage-stats-backdrop{position:fixed;inset:0;z-index:10080;display:grid;place-items:center;padding:max(env(safe-area-inset-top),16px) 14px max(env(safe-area-inset-bottom),16px);background:rgba(0,8,8,.78);backdrop-filter:blur(4px)}.pupage-stats-modal{position:relative;width:min(100%,570px);filter:drop-shadow(0 14px 32px #000c)}.pupage-stats-close{position:absolute;right:1%;top:0;z-index:5;width:34px;height:34px;border:0;padding:0;background:transparent;cursor:pointer}.pupage-stats-close img{display:block;width:100%;height:100%;object-fit:contain}.pupage-stats{position:relative;width:100%;margin:0}.pupage-stat-art{position:relative;z-index:0;display:block;width:100%;height:auto;pointer-events:none;filter:drop-shadow(0 8px 20px #0007)}.pupage-stat-row{position:absolute;z-index:1;left:22%;right:7%;height:18%;display:grid;grid-template-columns:minmax(0,1fr) 53px 38px;align-items:center;gap:7px}.pupage-stat-row.atk{top:18%}.pupage-stat-row.def{top:42%}.pupage-stat-row.hp{top:66%}.pupage-stat-track{height:12px;border-radius:999px;background:rgba(2,15,12,.72);overflow:hidden}.pupage-stat-fill{height:100%;border-radius:inherit;box-shadow:0 0 8px currentColor}.atk .pupage-stat-fill{background:linear-gradient(90deg,#d44a56,#ff737b);color:#ff737b}.def .pupage-stat-fill{background:linear-gradient(90deg,#3776d4,#69a5ff);color:#69a5ff}.hp .pupage-stat-fill{background:linear-gradient(90deg,#24a25e,#52ec8b);color:#52ec8b}.pupage-stat-value{text-align:right;font-size:clamp(15px,4.3vw,21px);text-shadow:0 2px 3px #000}.atk .pupage-stat-value{color:#ff8188}.def .pupage-stat-value{color:#7db2ff}.hp .pupage-stat-value{color:#67ef98}.pupage-stat-plus{width:100%;height:100%;border:0;border-radius:50%;background:transparent;color:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent}.pupage-stat-plus:focus-visible{outline:2px solid #ffe177;outline-offset:-3px}.pupage-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.pupage-inventory{position:relative;width:100%;max-width:590px;margin:-24px auto 0}.pupage-inventory-art{position:relative;z-index:0;display:block;width:100%;height:auto;pointer-events:none;filter:drop-shadow(0 10px 18px #0008)}.pupage-items-window{position:absolute;z-index:2;left:13%;right:13%;top:24%;height:49%;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch}.pupage-item{position:relative;min-width:0;border:0;background:transparent;padding:8% 6% 4%;display:grid;place-items:center;touch-action:none;user-select:none;-webkit-tap-highlight-color:transparent}.pupage-item.disabled{opacity:.42;filter:grayscale(.8)}.pupage-item img{position:relative;z-index:1;display:block;width:78%;height:78%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 3px 4px #0008);transform:translateY(4%)}.pupage-item:not(.disabled) img{filter:drop-shadow(0 0 1px #baffd7) drop-shadow(0 0 3px rgba(75,238,157,.78)) drop-shadow(0 3px 4px #0008)}.pupage-item-caption{position:absolute;left:10%;right:10%;top:-1%;z-index:3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;color:#70efa8;font:700 8px/1 system-ui,sans-serif;padding:3px 4px;border:1px solid rgba(84,219,151,.72);border-radius:999px;background:linear-gradient(180deg,rgba(5,39,29,.96),rgba(2,20,16,.96));box-shadow:0 2px 5px #0009,inset 0 0 7px rgba(57,216,137,.12);text-shadow:0 1px 2px #00150d}.pupage-qty{position:absolute;right:7%;bottom:4%;z-index:3;min-width:22px;height:22px;padding:0 5px;display:grid;place-items:center;border-radius:999px;border:1px solid #cfab54;background:#07110ee8;color:white;font:700 11px/1 system-ui,sans-serif}.pupage-empty{position:absolute;z-index:2;left:14%;right:14%;top:37%;text-align:center;color:#edf7ef;font-size:clamp(13px,3.7vw,19px);text-shadow:0 2px 4px #000}.pupage-arrow{position:absolute;top:39%;transform:translateY(-50%);z-index:6;width:38px;height:48px;border:0;background:rgba(3,24,18,.82);color:#c6ffe0;border-radius:12px;display:grid;place-items:center;box-shadow:0 2px 10px #0008;cursor:pointer}.pupage-arrow.left{left:1%}.pupage-arrow.right{right:1%}.pupage-arrow:disabled{opacity:.25;cursor:default}.pupage-filter{position:absolute;z-index:2;left:15%;right:15%;bottom:5%;display:flex;align-items:center;justify-content:center;gap:8px;color:#baffd1;font:700 11px/1.2 system-ui,sans-serif;text-shadow:0 1px 3px #000}.pupage-filter button{border:1px solid #70c493;border-radius:999px;background:#082219;color:#d6ffe8;padding:3px 8px;font:700 10px system-ui}.pupage-buy{display:block;margin:8px auto 0;border:1px solid #c9a33e;border-radius:999px;background:#112019;color:#ffe48a;padding:9px 16px;font-weight:700}.pupage-bottom-spacer{height:34px}
.pupage-ghost{position:fixed;z-index:10050;width:74px;height:74px;pointer-events:none;transform:translate(-50%,-50%);display:grid;place-items:center;border:1px solid #61f3ad;border-radius:50%;background:#082b21e8;box-shadow:0 0 21px rgba(38,230,138,.58)}.pupage-ghost img{width:61px;height:61px;object-fit:contain}.pupage-spark{position:fixed;z-index:10049;pointer-events:none;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c);animation:pupageSpark .72s ease-out forwards}.pupage-success{position:absolute;inset:0;z-index:10060;display:grid;place-items:center;background:rgba(0,17,13,.72);backdrop-filter:blur(2px)}.pupage-success-card{text-align:center;color:#66f2a5;filter:drop-shadow(0 0 24px #4ade80)}.pupage-success-title{margin-top:8px;font-size:clamp(38px,11vw,68px);font-weight:800;text-shadow:0 0 22px #4ade80}.pupage-success-label{color:white;font:700 18px/1.2 system-ui,sans-serif}
@keyframes pupageBounce{40%{transform:translateY(-13px) scale(1.04)}70%{transform:translateY(3px) scale(.98)}}@keyframes pupageFlash{35%{filter:brightness(2) drop-shadow(0 0 22px #fff)}}@keyframes pupageSpark{to{transform:translate(var(--dx),var(--dy)) scale(.1);opacity:0}}
@media(max-width:430px){.pupage-head{min-height:92px;padding:0 42px}.pupage-logo{width:86vw}.pupage-corner{width:34px;height:34px}.pupage-capacity{width:90%;padding:5px 10px;margin-top:0}.pupage-cap-track{height:10px}.pupage-enhance{width:60%}.pupage-stage{height:clamp(325px,89vw,380px);margin-top:-6px}.pupage-pet-zone{width:min(62vw,260px);height:min(62vw,260px);top:37%}.pupage-platform{width:76%;top:51%}.pupage-nameplate{width:76%}.pupage-inventory{margin-top:-27px}.pupage-stat-row{left:22%;right:6%;grid-template-columns:minmax(0,1fr) 43px 34px;gap:5px}.pupage-items-window{left:13%;right:13%;top:24%;height:49%}.pupage-arrow{width:32px;height:41px}.pupage-stats-close{width:32px;height:32px}}
@media(max-height:720px){.pupage-scroll{padding-top:max(env(safe-area-inset-top),4px);padding-bottom:max(env(safe-area-inset-bottom),5px)}.pupage-head{min-height:78px}.pupage-logo{width:min(78vw,470px)}.pupage-capacity{padding-top:4px;padding-bottom:4px}.pupage-enhance{width:min(52%,280px)}.pupage-stage{height:clamp(270px,78vw,330px);margin-top:-5px}.pupage-pet-zone{width:min(56vw,235px);height:min(56vw,235px)}.pupage-nameplate{width:min(70%,375px)}.pupage-inventory{width:94%;margin-top:-23px}.pupage-bottom-spacer{height:2px}}
@media(max-height:640px){.pupage-head{min-height:68px}.pupage-stage{height:clamp(245px,70vw,295px)}.pupage-inventory{width:88%;margin-top:-19px}.pupage-enhance{width:min(48%,250px)}}
`;

function usesCapacity(item: PowerUpItem) {
  return item.type !== "special" && item.statBoostType !== "lvl";
}

function itemLabel(item: PowerUpItem) {
  const amount = item.type === "special" ? item.specialAmount : item.statBoostAmount;
  if (item.type === "special") return item.specialType === "hatch_time" ? `-${amount ?? "?"} min` : `+${amount ?? "?"} LVL`;
  return item.statBoostType === "health" ? `+${amount ?? "?"} HP` : `+${amount ?? "?"} ${(item.statBoostType || "").toUpperCase()}`;
}

function itemColor(item: PowerUpItem) {
  if (item.type === "special") return item.specialType === "hatch_time" ? "#38bdf8" : "#f0c040";
  if (item.statBoostType === "health") return "#4ade80";
  if (item.statBoostType === "atk") return "#f87171";
  if (item.statBoostType === "def") return "#60a5fa";
  return "#f0c040";
}

function powerValue(item: PowerUpItem) {
  return item.statBoostAmount ?? item.specialAmount ?? Number.MAX_SAFE_INTEGER;
}

export default function PetPowerUpPage(props: PetUpgradeModalProps) {
  const { petName, petImage, petTemplateId, rarity, petLevel, petAtk, petDef, petHealth, itemsRemaining, items, isPending, showBuyButton = false, successEffect, onUseItem, onSuccessAnimEnd, onClose } = props;
  const [z] = useState(() => getNextZ());
  const zoneRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [over, setOver] = useState(false);
  const [petAnim, setPetAnim] = useState<"" | "bounce" | "flash">("");
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number; dx: number; dy: number; color: string }[]>([]);
  const [statFilter, setStatFilter] = useState<StatFilter>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [itemOffset, setItemOffset] = useState(0);
  const sparkId = useRef(0);

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    const bodyTouchAction = document.body.style.touchAction;
    setNavHidden(true);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      setNavHidden(false);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      document.body.style.touchAction = bodyTouchAction;
    };
  }, []);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  useEffect(() => {
    if (!statsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setStatsOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [statsOpen]);
  useEffect(() => {
    if (!successEffect) return;
    const timer = window.setTimeout(onSuccessAnimEnd, 2400);
    return () => window.clearTimeout(timer);
  }, [successEffect, onSuccessAnimEnd]);

  const disabled = useCallback((item: PowerUpItem) => isPending || item.quantity <= 0 || (usesCapacity(item) && itemsRemaining !== Infinity && itemsRemaining <= 0), [isPending, itemsRemaining]);
  const pointInZone = useCallback((x: number, y: number) => { const r = zoneRef.current?.getBoundingClientRect(); return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }, []);
  const burst = useCallback((color: string) => {
    const r = zoneRef.current?.getBoundingClientRect(); if (!r) return;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const next = Array.from({ length: 16 }, (_, i) => { const angle = (i / 16) * Math.PI * 2; return { id: sparkId.current++, x, y, dx: Math.cos(angle) * (58 + Math.random() * 72), dy: Math.sin(angle) * (58 + Math.random() * 72), color }; });
    setSparks(next); window.setTimeout(() => setSparks([]), 760);
  }, []);
  const useItem = useCallback((item: PowerUpItem) => { if (disabled(item)) return; burst(itemColor(item)); setPetAnim("bounce"); window.setTimeout(() => setPetAnim("flash"), 260); window.setTimeout(() => setPetAnim(""), 850); onUseItem(item); }, [burst, disabled, onUseItem]);
  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>, item: PowerUpItem) => { if (disabled(item)) return; event.preventDefault(); event.stopPropagation(); try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} const next = { item, x: event.clientX, y: event.clientY }; dragRef.current = next; setDrag(next); }, [disabled]);
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => { if (!dragRef.current) return; event.preventDefault(); event.stopPropagation(); const next = { ...dragRef.current, x: event.clientX, y: event.clientY }; dragRef.current = next; setDrag(next); setOver(pointInZone(event.clientX, event.clientY)); }, [pointInZone]);
  const clearDrag = useCallback(() => { dragRef.current = null; setDrag(null); setOver(false); }, []);
  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => { const current = dragRef.current; if (!current) return; event.preventDefault(); event.stopPropagation(); try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {} if (pointInZone(event.clientX, event.clientY)) useItem(current.item); clearDrag(); }, [clearDrag, pointInZone, useItem]);

  const sortedItems = useMemo(() => [...items].filter((item) => !statFilter || item.statBoostType === statFilter).sort((a, b) => powerValue(a) - powerValue(b) || a.name.localeCompare(b.name)), [items, statFilter]);
  useEffect(() => { setItemOffset((previous) => Math.max(0, Math.min(previous, Math.max(0, sortedItems.length - ITEMS_PER_PAGE)))); }, [sortedItems.length]);
  const visibleItems = sortedItems.slice(itemOffset, itemOffset + ITEMS_PER_PAGE);
  const openItems = useCallback((filter: StatFilter = null) => { setStatsOpen(false); setStatFilter(filter); setItemOffset(0); window.requestAnimationFrame(() => trayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })); }, []);

  const pet = petImage ? <img src={petImage} alt={petName} draggable={false} /> : petTemplateId ? <PetAnimator petTemplateId={petTemplateId} mode="idle" view="front" size={700} className="w-full" style={{ aspectRatio: "1/1", pointerEvents: "none" }} /> : <img src={petPlaceholder} alt="" className="pupage-placeholder" draggable={false} />;
  const slotsPerLevel = rarity <= 2 ? 1 : rarity === 3 ? 2 : 3;
  const capacity = Math.max(1, petLevel || 1) * slotsPerLevel;
  const remaining = itemsRemaining === Infinity ? capacity : Math.max(0, Math.min(capacity, itemsRemaining));
  const used = Math.max(0, capacity - remaining);
  const capacityPercent = Math.max(0, Math.min(100, (used / capacity) * 100));
  const stats = [
    { key: "atk", filter: "atk" as const, label: "ATK", value: petAtk, max: 200 },
    { key: "def", filter: "def" as const, label: "DEF", value: petDef, max: 200 },
    { key: "hp", filter: "health" as const, label: "HP", value: petHealth, max: 2500 },
  ];
  const filterLabel = statFilter === "health" ? "HP" : statFilter?.toUpperCase();

  return <div className="pupage" style={{ zIndex: z }} role="dialog" aria-modal="true" aria-label="Power Up">
    <style>{CSS}</style><img src={pupBackground} alt="" className="pupage-bg" /><div className="pupage-vignette" />
    <div className="pupage-scroll">
      <header className="pupage-head">
        <img src={pupLogo} alt="Power Up" className="pupage-logo" />
        <button type="button" className="pupage-corner pupage-close" onClick={onClose} data-testid="button-close-powerup-modal" aria-label="Close Power Up"><img src={pupCloseButton} alt="" /></button>
      </header>

      <section className="pupage-capacity" data-testid="section-powerup-progress" aria-label={`${petName} Power Up capacity: ${used} used of ${capacity} total`}><div className="pupage-cap-track" data-testid="bar-powerup-capacity"><i style={{ width: `${capacityPercent}%` }} /></div><div className="pupage-cap-ticks"><span>{used} used</span><span>{capacity} total</span></div></section>

      <section className="pupage-enhance" aria-label={`${petName} has ${remaining} enhancements remaining`}><img src={pupEnhancementBar} alt="" className="pupage-enhance-art" /><div className="pupage-enhance-copy"><strong className="pupage-enhance-count">{remaining}</strong><span className="pupage-enhance-label">Remaining</span></div></section>

      <section className="pupage-stage">
        <img src={pupPlatform} alt="" className="pupage-platform" /><EvolutionPanel enabled fallbackRarity={rarity} layout="orbit" />
        <div ref={zoneRef} className={`pupage-pet-zone ${over ? "over" : ""}`} data-testid="zone-pet-drop" role="button" tabIndex={0} aria-haspopup="dialog" aria-expanded={statsOpen} aria-label={`View ${petName} stats`} onClick={() => setStatsOpen(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setStatsOpen(true); } }}><div className={`pupage-pet ${petAnim}`}>{pet}</div></div>
        <div className="pupage-nameplate"><img src={pupNameLevelBar} alt="" className="pupage-nameplate-art" /><div className="pupage-name">{petName}</div><div className="pupage-level">Lv.{petLevel}</div></div>
      </section>

      <section className="pupage-inventory" ref={trayRef} aria-label="Power Up item bar"><img src={pupItemBar} alt="" className="pupage-inventory-art" />
        <button type="button" className="pupage-arrow left" aria-label="Previous Power Up items" disabled={itemOffset <= 0} onClick={() => setItemOffset((value) => Math.max(0, value - ITEMS_PER_PAGE))}><ChevronLeft /></button>
        <button type="button" className="pupage-arrow right" aria-label="Next Power Up items" disabled={itemOffset + ITEMS_PER_PAGE >= sortedItems.length} onClick={() => setItemOffset((value) => Math.min(Math.max(0, sortedItems.length - ITEMS_PER_PAGE), value + ITEMS_PER_PAGE))}><ChevronRight /></button>
        {visibleItems.length ? <div className="pupage-items-window">{visibleItems.map((item) => <button type="button" key={item.inventoryId} data-testid={`item-powerup-${item.inventoryId}`} className={`pupage-item ${disabled(item) ? "disabled" : ""}`} title={`${item.name} • ${itemLabel(item)}`} onPointerDown={(event) => onPointerDown(event, item)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={clearDrag} disabled={disabled(item)}><span className="pupage-item-caption">{itemLabel(item)}</span>{item.imageUrl && <img src={item.imageUrl} alt={item.name} draggable={false} />}{item.quantity > 1 && <span className="pupage-qty">{item.quantity}</span>}</button>)}</div> : <div className="pupage-empty">{statFilter ? `No ${filterLabel} Power Up items available.` : "No usable items in your bag."}</div>}
        {statFilter && <div className="pupage-filter"><span>Showing {filterLabel} items · low → high</span><button type="button" onClick={() => openItems(null)}>Show all</button></div>}
      </section>

      {showBuyButton && <button className="pupage-buy" data-testid="button-buy-powerups" onClick={() => { window.location.href = "/world/swamp?shopHint=a1b2c3d4-0004-4000-8000-000000000004"; }}>Find Power Up Items</button>}<div className="pupage-bottom-spacer" />
    </div>
    {drag && <div className="pupage-ghost" style={{ left: drag.x, top: drag.y }}><img src={drag.item.imageUrl || petPlaceholder} alt="" /></div>}
    {sparks.map((spark) => <i key={spark.id} className="pupage-spark" style={{ left: spark.x, top: spark.y, "--c": spark.color, "--dx": `${spark.dx}px`, "--dy": `${spark.dy}px` } as CSSProperties} />)}
    {statsOpen && <div className="pupage-stats-backdrop" onClick={() => setStatsOpen(false)}><div className="pupage-stats-modal" role="dialog" aria-modal="true" aria-label={`${petName} stats`} onClick={(event) => event.stopPropagation()}><button type="button" className="pupage-stats-close" onClick={() => setStatsOpen(false)} aria-label="Close pet stats"><img src={pupCloseButton} alt="" /></button><section className="pupage-stats" data-testid="section-pet-stats"><img src={pupStatBox} alt="Pet stats" className="pupage-stat-art" />{stats.map((stat) => <div key={stat.key} className={`pupage-stat-row ${stat.key}`}><span className="pupage-sr">{stat.label}</span><div className="pupage-stat-track" data-testid={`bar-stat-${stat.key}`}><div className="pupage-stat-fill" style={{ width: `${Math.min(100, Math.max(3, stat.value / stat.max * 100))}%` }} /></div><span className="pupage-stat-value" data-testid={`text-stat-${stat.key}`}>{stat.value}</span><button type="button" className="pupage-stat-plus" onClick={() => openItems(stat.filter)} aria-label={`Show Power Up items for ${stat.label}`}>+</button></div>)}</section></div></div>}
    {successEffect && <div className="pupage-success" data-testid="text-power-up-success"><div className="pupage-success-card"><Zap size={70} fill="#4ade80" /><div className="pupage-success-title">POWER UP!</div><div className="pupage-success-label">{successEffect.label}</div></div></div>}
  </div>;
}
