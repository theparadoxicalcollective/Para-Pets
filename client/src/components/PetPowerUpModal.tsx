import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Clock, Heart, Plus, Shield, Star, Sword, X, Zap } from "lucide-react";
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
.pum{position:fixed;inset:0;left:0;right:0;width:100%;max-width:768px;margin:0 auto;box-sizing:border-box;background:#02090d;color:#effff7;overflow:hidden;overflow-x:hidden;overscroll-behavior-x:none;touch-action:pan-y;isolation:isolate;font-family:Georgia,serif}.pum *{box-sizing:border-box}
.pum-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:-5}.pum.power .pum-bg{filter:saturate(1.18) brightness(.7)}.pum-shade{position:absolute;inset:0;z-index:-4;pointer-events:none;background:linear-gradient(180deg,rgba(0,7,12,.28) 0%,rgba(0,14,17,.05) 35%,rgba(0,11,14,.2) 68%,rgba(0,5,8,.78) 100%),radial-gradient(ellipse at 50% 35%,rgba(38,246,165,.13),transparent 48%)}
.pum-scroll{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;overscroll-behavior-x:none;touch-action:pan-y;padding:max(env(safe-area-inset-top),8px) 14px max(env(safe-area-inset-bottom),18px);scrollbar-width:none;-webkit-overflow-scrolling:touch}.pum-scroll::-webkit-scrollbar,.pum-items::-webkit-scrollbar{display:none}
.pum-head{position:relative;text-align:center;min-height:132px;padding:5px 64px 0;display:flex;flex-direction:column;align-items:center}.pum-title{margin:5px 0 6px;font-size:clamp(42px,12vw,72px);line-height:.95;font-weight:800;letter-spacing:.06em;color:#baffdc;background:linear-gradient(#effff8 0%,#9cffce 42%,#36e592 74%,#21ae72 100%);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 7px rgba(83,255,176,.72)) drop-shadow(0 2px 1px rgba(0,25,17,.9));white-space:nowrap}.pum-sub{max-width:430px;font-size:clamp(13px,3.6vw,18px);line-height:1.25;color:#e0f8de;text-shadow:0 2px 5px #00140e;margin:0 auto}.pum-close{position:absolute;right:0;top:0;width:54px;height:54px;border:0;background:#06251d;border-radius:50%;display:grid;place-items:center;color:#c8ffe3;z-index:10}.pum-close.asset{width:60px;height:60px;background:transparent;padding:0}.pum-close.asset img{width:100%;height:100%;object-fit:contain}.pum-bag-btn{position:absolute;left:0;top:1px;width:58px;height:58px;padding:0;border:0;background:rgba(5,20,16,.78);border-radius:50%;display:grid;place-items:center;z-index:10;box-shadow:0 0 0 1px rgba(205,166,62,.5),0 4px 16px #0008}.pum-bag-btn img{width:88%;height:88%;object-fit:contain;filter:drop-shadow(0 2px 5px #0008)}
.pum-rule{position:relative;max-width:430px;margin:0 auto 5px;padding:9px 24px;border:1px solid #72d69f;border-radius:999px;background:linear-gradient(90deg,rgba(3,24,18,.95),rgba(8,48,34,.96),rgba(3,24,18,.95));color:#d9ffe8;text-align:center;font-weight:700;letter-spacing:.025em;box-shadow:inset 0 0 18px rgba(49,224,137,.16),0 0 16px rgba(49,224,137,.12)}.pum-rule:before,.pum-rule:after{content:"";position:absolute;top:50%;width:22px;height:1px;background:linear-gradient(90deg,transparent,#d5b75a)}.pum-rule:before{right:100%}.pum-rule:after{left:100%;transform:scaleX(-1)}
.pum-stage{position:relative;width:100%;max-width:560px;height:322px;margin:0 auto;overflow:visible}.pum-stage-glow{position:absolute;left:50%;top:34%;width:76%;height:68%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(43,255,163,.16),rgba(17,137,101,.06) 48%,transparent 72%);filter:blur(2px);pointer-events:none}.pum-mote{position:absolute;border-radius:50%;background:#75ffbd;box-shadow:0 0 14px #4bffad;opacity:.7;animation:pumMote 3.6s ease-in-out infinite}.pum-mote.m1{left:14%;top:24%;width:5px;height:5px}.pum-mote.m2{right:13%;top:35%;width:7px;height:7px;animation-delay:-1.2s}.pum-mote.m3{left:22%;top:55%;width:4px;height:4px;animation-delay:-2s}
.pum-pet-zone{position:relative;width:min(54vw,285px);height:min(54vw,285px);margin:8px auto 0;display:grid;place-items:center;touch-action:pan-y;transition:filter .2s,transform .2s;z-index:4}.pum-pet-zone.over{filter:drop-shadow(0 0 18px #5bffae);transform:scale(1.025)}.pum-rune{position:absolute;left:50%;bottom:-4%;width:92%;height:35%;transform:translateX(-50%);border:2px solid rgba(72,255,190,.74);border-radius:50%;box-shadow:0 0 17px rgba(33,232,140,.7),inset 0 0 22px rgba(29,229,138,.34);background:repeating-radial-gradient(ellipse,rgba(50,247,161,.07) 0 10%,rgba(96,255,197,.2) 11%,transparent 12% 20%);animation:pumPulse 2.1s ease-in-out infinite}.pum-rune:after{content:"✦";position:absolute;inset:17%;display:grid;place-items:center;border:1px solid rgba(121,255,208,.68);border-radius:50%;color:#8affd1;font-size:28px}.pum-pet{position:relative;z-index:4;width:100%;height:100%;display:grid;place-items:center;filter:drop-shadow(0 12px 10px #0009);pointer-events:none}.pum-pet>img{display:block;width:100%;height:100%;object-fit:contain}.pum-pet.bounce{animation:pumBounce .7s ease-out}.pum-pet.flash{animation:pumFlash .6s ease-out}.pum-placeholder{width:72%!important;height:72%!important;opacity:.72}
.pum-identity{position:absolute;left:50%;bottom:0;transform:translateX(-50%);z-index:9;width:min(92%,500px);min-height:49px;display:flex;align-items:center;justify-content:center;gap:12px;padding:7px 18px;background:linear-gradient(90deg,rgba(2,12,11,.38),rgba(9,30,24,.96) 10% 90%,rgba(2,12,11,.38));border-top:1px solid #c39c45;border-bottom:1px solid #c39c45;color:#f7d97b;font-size:clamp(21px,5.5vw,30px);text-align:center;text-shadow:0 2px 4px #000}.pum-identity:before,.pum-identity:after{content:"";width:12px;height:12px;border:1px solid #c39c45;transform:rotate(45deg);background:#09251d;flex:0 0 auto}.pum-level{font:700 .62em/1 system-ui,sans-serif;padding:7px 11px;border:1px solid #43d28e;border-radius:999px;color:#b9ffda;background:#073226;white-space:nowrap}
.pum-stat-card{width:100%;max-width:560px;margin:5px auto 9px;padding:10px 14px 12px;border:1px solid rgba(72,223,146,.72);border-radius:19px;background:linear-gradient(180deg,rgba(3,26,21,.95),rgba(3,15,14,.97));box-shadow:inset 0 0 24px rgba(39,200,119,.12),0 8px 22px #0007,0 0 12px rgba(45,230,141,.12);position:relative}.pum-stat-card:before,.pum-stat-card:after{content:"";position:absolute;inset:7px auto 7px;width:2px;background:linear-gradient(transparent,#49e6a0,transparent);opacity:.58}.pum-stat-card:before{left:5px}.pum-stat-card:after{right:5px}.pum-power-progress{padding:0 2px 9px;margin-bottom:6px;border-bottom:1px solid rgba(182,151,64,.38)}.pum-power-progress-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;font:800 10px/1.2 system-ui,sans-serif;color:#d8ffe9;letter-spacing:.1em}.pum-power-progress-head span:last-child{color:#8ef3bd;letter-spacing:.02em;text-align:right}.pum-power-track{height:8px;border-radius:999px;border:1px solid #477663;background:#020d0a;overflow:hidden}.pum-power-track>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#168354,#3be291,#a0ffd0);box-shadow:0 0 9px #4dffae66;transition:width .3s ease}.pum-power-ticks{display:flex;justify-content:space-between;margin-top:3px;color:#789d8c;font:600 8px/1 system-ui,sans-serif}.pum-stats{width:100%;padding:0 2px}.pum-stat{display:grid;grid-template-columns:70px minmax(0,1fr) 52px 29px;align-items:center;gap:8px;margin:7px 0}.pum-stat-label{display:flex;align-items:center;gap:6px;font:800 13px/1 system-ui,sans-serif;letter-spacing:.04em}.pum-stat-label svg{filter:drop-shadow(0 0 5px currentColor)}.pum-stat.atk .pum-stat-label,.pum-stat.atk .pum-val{color:#ff777d}.pum-stat.def .pum-stat-label,.pum-stat.def .pum-val{color:#77aefc}.pum-stat.hp .pum-stat-label,.pum-stat.hp .pum-val{color:#5deb91}.pum-track{height:10px;border:1px solid #48665e;border-radius:999px;background:#061310;overflow:hidden}.pum-fill{height:100%;border-radius:inherit;box-shadow:0 0 8px currentColor}.atk .pum-fill{background:linear-gradient(90deg,#d84f5b,#ff7b7d);color:#ef6464}.def .pum-fill{background:linear-gradient(90deg,#3b78d9,#6fa9ff);color:#5798f2}.hp .pum-fill{background:linear-gradient(90deg,#28a963,#54ef92);color:#42d77d}.pum-val{text-align:right;font-size:17px}.pum-stat-plus{width:27px;height:27px;padding:0;border-radius:50%;border:1px solid #caa33f;background:radial-gradient(circle,#164c36,#061d16 70%);color:#ffd86a;display:grid;place-items:center;box-shadow:0 0 8px rgba(68,232,151,.25);cursor:pointer}
.pum-tray{position:relative;width:100%;max-width:580px;margin:9px auto 0;padding:12px 10px 9px;border:1px solid rgba(93,151,111,.7);border-radius:18px 18px 12px 12px;background:linear-gradient(180deg,rgba(15,35,29,.96),rgba(6,17,15,.98));box-shadow:inset 0 0 22px rgba(72,188,124,.12),0 10px 24px #0008}.pum-tray:before{content:"";position:absolute;left:7%;right:7%;top:-4px;height:7px;border-top:2px solid rgba(169,141,67,.62);border-radius:50%}.pum-items{display:flex;gap:7px;width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;padding:3px 2px 7px;scroll-snap-type:x proximity}.pum-item{position:relative;flex:0 0 72px;height:75px;border:1px solid #4d8e74;border-radius:11px;background:linear-gradient(145deg,#0b251d,#071712);display:grid;place-items:center;touch-action:none;user-select:none;scroll-snap-align:center;box-shadow:inset 0 0 12px #22c77a16}.pum-item:active{transform:scale(.96)}.pum-item.disabled{opacity:.42;filter:grayscale(.75)}.pum-item img{width:55px;height:55px;object-fit:contain;pointer-events:none}.pum-qty{position:absolute;right:2px;bottom:2px;min-width:21px;height:21px;padding:0 4px;display:grid;place-items:center;border-radius:999px;background:#07100f;border:1px solid #cfad55;color:#fff;font:700 11px system-ui}.pum-item-name{position:absolute;left:3px;right:3px;top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#d6f9e5;font:600 8px system-ui;text-align:center;opacity:.82}.pum-hint{text-align:center;color:#9cffc9;font-weight:700;letter-spacing:.05em;padding:3px 0 0;text-shadow:0 0 9px #2dff9a55}.pum-empty{text-align:center;color:#d3eadc;padding:17px 8px 13px;font-size:16px}.pum-buy{display:block;margin:7px auto 0;border:1px solid #cda63e;border-radius:999px;background:#1b2115;color:#ffe68a;padding:9px 17px;font-weight:700}
.pum-ghost{position:fixed;z-index:9999;width:72px;height:72px;pointer-events:none;transform:translate(-50%,-50%);display:grid;place-items:center;border-radius:50%;background:#0a2d22dd;border:1px solid #60f4ac;box-shadow:0 0 20px #26e68a88}.pum-ghost img{width:58px;height:58px;object-fit:contain}.pum-spark{position:fixed;z-index:9998;pointer-events:none;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c);animation:pumSpark .72s ease-out forwards}.pum-success{position:absolute;inset:0;z-index:30;display:grid;place-items:center;background:#00110db8;backdrop-filter:blur(2px);animation:pumFade .18s ease-out}.pum-success-card{text-align:center;animation:pumPop .5s cubic-bezier(.2,1.5,.4,1);filter:drop-shadow(0 0 24px var(--c))}.pum-success-card svg{color:var(--c);filter:drop-shadow(0 0 15px var(--c))}.pum-success-title{font-size:clamp(38px,11vw,68px);font-weight:800;color:var(--c);text-shadow:0 0 22px var(--c);margin-top:8px}.pum-success-label{font:700 18px system-ui;color:white}
.pum-legacy-stage{width:100%;max-width:480px;margin:12px auto;display:grid;place-items:center}.pum-legacy-pet{width:min(76vw,360px);height:min(76vw,360px);display:grid;place-items:center;touch-action:pan-y}.pum-legacy-pet>img{width:100%;height:100%;object-fit:contain}.pum-legacy-stars{text-align:center;color:#ffd950;font-size:28px;letter-spacing:.12em;margin:-12px 0 5px}.pum-legacy .pum-head{min-height:102px}.pum-legacy .pum-title{color:#f2cf67;background:none;-webkit-text-fill-color:initial;filter:none;text-shadow:0 2px #16200d,0 0 18px #f7d86b66}.pum-legacy .pum-stat-card{border-color:#8d7437}.pum-legacy .pum-tray{background:rgba(20,22,15,.92);border-color:#a8863b55}.pum-legacy .pum-item{background:#14160fdd;border-color:#aa8c41}.pum-legacy .pum-hint{color:#f9d778}.pum-bag{width:54px;height:54px;object-fit:contain;display:block;margin:4px auto}
@keyframes pumMote{50%{transform:translateY(-13px);opacity:1}}@keyframes pumPulse{50%{filter:brightness(1.3);box-shadow:0 0 25px #21e88caa,inset 0 0 28px #1de58a77}}@keyframes pumBounce{40%{transform:translateY(-12px) scale(1.04)}70%{transform:translateY(3px) scale(.98)}}@keyframes pumFlash{35%{filter:brightness(2) drop-shadow(0 0 22px #fff)}}@keyframes pumSpark{to{transform:translate(var(--dx),var(--dy)) scale(.1);opacity:0}}@keyframes pumFade{from{opacity:0}}@keyframes pumPop{from{transform:scale(.45);opacity:0}}
@media(max-width:430px){.pum-scroll{padding-left:10px;padding-right:10px}.pum-head{min-height:126px;padding-left:57px;padding-right:57px}.pum-bag-btn{width:52px;height:52px}.pum-close.asset{width:55px;height:55px}.pum-stage{height:302px}.pum-pet-zone{width:min(54vw,230px);height:min(54vw,230px);margin-top:9px}.pum-identity{min-height:45px}.pum-stat-card{padding:9px 10px 10px}.pum-stat{grid-template-columns:63px minmax(0,1fr) 43px 27px;gap:6px}.pum-stat-label{font-size:12px}.pum-stat-label svg{width:17px;height:17px}.pum-val{font-size:15px}.pum-item{flex-basis:68px;height:70px}.pum-item img{width:51px;height:51px}}
@media(max-height:740px){.pum-head{min-height:112px}.pum-title{font-size:42px}.pum-sub{font-size:13px}.pum-rule{padding-top:7px;padding-bottom:7px}.pum-stage{height:278px}.pum-pet-zone{width:min(48vw,205px);height:min(48vw,205px)}.pum-identity{min-height:42px;font-size:20px}.pum-stat{margin:5px 0}.pum-tray{margin-top:7px}.pum-item{height:66px}.pum-item img{width:47px;height:47px}}
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [z] = useState(() => getNextZ());
  const [drag, setDrag] = useState<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [over, setOver] = useState(false);
  const [petAnim, setPetAnim] = useState<"" | "bounce" | "flash">("");
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number; dx: number; dy: number; color: string }[]>([]);
  const sparkId = useRef(0);

  useEffect(() => { dragRef.current = drag; }, [drag]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, []);
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
      return { id: sparkId.current++, x, y, dx: Math.cos(angle) * (55 + Math.random() * 75), dy: Math.sin(angle) * (55 + Math.random() * 75), color };
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

  const scrollToItems = useCallback(() => {
    trayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const pet = petImage ? (
    <img src={petImage} alt={petName} draggable={false} />
  ) : petTemplateId ? (
    <PetAnimator petTemplateId={petTemplateId} mode="idle" view="front" size={700} className="w-full" style={{ aspectRatio: "1/1", pointerEvents: "none" }} />
  ) : (
    <img src={petPawIcon} alt="" className="pum-placeholder" draggable={false} />
  );

  const itemTray = (
    <div className="pum-tray" ref={trayRef}>
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

  const statRows = [
    { k: "atk", n: "ATK", v: petAtk, max: 200, icon: <Sword size={19} /> },
    { k: "def", n: "DEF", v: petDef, max: 200, icon: <Shield size={19} /> },
    { k: "hp", n: "HP", v: petHealth, max: 2500, icon: <Heart size={19} fill="currentColor" /> },
  ];

  const stats = (
    <div className="pum-stat-card" data-testid="section-pet-stats">
      {powerProgress}
      <div className="pum-stats">
        {statRows.map((s) => <div key={s.k} className={`pum-stat ${s.k}`}>
          <div className="pum-stat-label">{s.icon}<b>{s.n}</b></div>
          <div className="pum-track" data-testid={`bar-stat-${s.k}`}><div className="pum-fill" style={{ width: `${Math.min(100, Math.max(3, s.v / s.max * 100))}%` }} /></div>
          <span className="pum-val" data-testid={`text-stat-${s.k}`}>{s.v}</span>
          {isPower && <button type="button" className="pum-stat-plus" onClick={scrollToItems} aria-label={`Choose an item to increase ${s.n}`}><Plus size={17} strokeWidth={3} /></button>}
        </div>)}
      </div>
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
    <div ref={scrollRef} className="pum-scroll">
      <header className="pum-head">
        {isPower && <button className="pum-bag-btn" type="button" onClick={scrollToItems} aria-label="Show Power Up items"><img src={powerupBagIcon} alt="" /></button>}
        <h2 className="pum-title">{title}</h2>
        {subtitle && <div className="pum-sub">{subtitle}</div>}
        <button className={`pum-close ${isPower ? "asset" : ""}`} onClick={onClose} data-testid="button-close-powerup-modal" aria-label="Close">
          {isPower ? <img src={chamberClose} alt="" /> : <X size={30} />}
        </button>
      </header>
      <div className="pum-rule">{isPower ? `✦ ${Math.max(0, finiteRemaining)} enhancement${finiteRemaining === 1 ? "" : "s"} remaining` : itemsRemaining === Infinity ? "✦ No limit — use as many as you like!" : `✦ ${Math.max(0, itemsRemaining)} slots remaining this level`}</div>

      {isPower ? <>
        <section className="pum-stage">
          <div className="pum-stage-glow" />
          <i className="pum-mote m1" /><i className="pum-mote m2" /><i className="pum-mote m3" />
          <EvolutionPanel enabled fallbackRarity={rarity} layout="orbit" />
          <div ref={zoneRef} className={`pum-pet-zone ${over ? "over" : ""}`} data-testid="zone-pet-drop">
            <div className="pum-rune" />
            <div className={`pum-pet ${petAnim}`}>{pet}</div>
          </div>
          <div className="pum-identity"><span>{petName}</span><span className="pum-level">Lv.{petLevel}</span></div>
        </section>
        {stats}
        {itemTray}
      </> : <>
        <section className="pum-legacy-stage">
          <div ref={zoneRef} className={`pum-legacy-pet pum-pet ${petAnim} ${over ? "over" : ""}`} data-testid="zone-pet-drop">{pet}</div>
          <div className="pum-legacy-stars">{"★".repeat(Math.max(1, Math.min(5, rarity)))}</div>
          <div className="pum-identity" style={{ position: "relative", left: "auto", bottom: "auto", transform: "none" }}><span>{petName}</span><span className="pum-level">Lv.{petLevel}</span></div>
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
