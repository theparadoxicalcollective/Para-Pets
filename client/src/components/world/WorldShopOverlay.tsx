import { useRef, useState } from "react";
import { Package, Plus, X } from "lucide-react";
import { burstGoldenOrbs } from "@/lib/goldenOrbs";
import { playTick } from "@/lib/sounds";
import coinIconImg from "@assets/icon_coin.webp";
import bgShopMystical from "@assets/bg_shop_mystical.webp";
import bgShopBayou from "@assets/bg_shop_bayou.png";
import bgShopFishing from "@assets/bg_shop_fishing.png";
import bgShopCentralMarket from "@assets/bg_central_market.png";
import bgShopVolcanic from "@assets/bg_shop_volcanic.png";
import bgShopVolcanicPets from "@assets/bg_shop_volcanic_pets.png";
import bgShopForgeFang from "@assets/bg_shop_forge_fang_volcanic.png";
import bgShopBookshopVolcanic from "@assets/bg_shop_bookshop_volcanic.png";
import bgShopFoodVolcanic from "@assets/bg_shop_food_volcanic.png";
import bgShopFoodSwamp from "@assets/bg_shop_food_swamp.png";
import npcLavaHook from "@assets/npc_lava_hook_shopkeeper.png";

export interface WorldShopItem {
  id: string; name: string; description: string | null; price: number; type: string; worldId: string; imageUrl: string | null; rarity: number | null; hatchTime: number | null; eggImageUrl: string | null; hatchedImageUrl: string | null; statBoostType: string | null; statBoostAmount: number | null; specialSkill: string | null; healthRestored: number | null; manaRestored: number | null; atkBoost: number | null; defBoost: number | null; healthBoost: number | null; petsRevived: number | null; specialType: string | null; specialAmount: number | null; shopPosX: number; shopPosY: number; shopWidth: number; fishingType: string | null; rarityBoostPercent: number | null; baitRarityBoostStar: number | null; poleMaxUses: number | null; catchEasePercent: number | null; giftPoints: number | null; locationId: string | null; createdAt: string;
}

export interface WorldShopLocation { id: string; name: string; type?: string | null; iconUrl?: string | null; ownerImageUrl?: string | null; }
export interface WorldShopBundle { id: string; name: string; shopImageUrl: string | null; price: number; }
export interface WorldShopDecor { id: string; name: string; imageUrl: string | null; price: number; }

interface WorldShopOverlayProps {
  worldId: string; worldName: string; accent: string; location: WorldShopLocation | undefined; items: WorldShopItem[]; itemsLoading: boolean; bundles: WorldShopBundle[]; decor: WorldShopDecor[]; coins: number; isAdmin: boolean; ownedShopItemIds: ReadonlySet<string>; ownedPetCount: (shopItemId: string) => number; showSellPanel: boolean; isPurchasePending: boolean; isBundlePurchasePending: boolean; onPurchase: (itemId: string, quantity: number) => Promise<unknown>; onBuyBundle: (bundleId: string) => void; onUnassignItem: (itemId: string) => void; onOpenItemPicker: () => void; onToggleSellPanel: () => void; onClose: () => void;
}

function getItemDescription(item: WorldShopItem): string[] {
  const lines: string[] = item.description?.trim() ? [item.description.trim()] : [];
  if (item.type === "fishing") {
    if (item.fishingType === "pole") { if (item.catchEasePercent) lines.push(`Easy Catch +${item.catchEasePercent}%`); lines.push(item.poleMaxUses ? `${item.poleMaxUses} uses` : "Unlimited uses"); }
    else if (item.fishingType === "bait") { if (item.rarityBoostPercent && item.baitRarityBoostStar) { lines.push(`+${item.rarityBoostPercent}% Rarity Boost`); lines.push(`Targets ${"★".repeat(item.baitRarityBoostStar)} fish`); } else if (item.rarityBoostPercent) lines.push(`+${item.rarityBoostPercent}% Rarity Boost`); if (item.specialSkill) lines.push(item.specialSkill); }
    else if (item.fishingType === "fish" && item.rarity) lines.push(`${"★".repeat(item.rarity)} Rarity`);
  } else if (item.type === "pet") { if (item.rarity) lines.push(`${"★".repeat(item.rarity)} Rarity`); if (item.hatchTime) lines.push(`Hatch time: ${item.hatchTime}h`); }
  else { if (item.healthRestored) lines.push(`Restores ${item.healthRestored} HP`); if (item.manaRestored) lines.push(`Restores ${item.manaRestored} Mana`); if (item.atkBoost) lines.push(`Boosts ATK by ${item.atkBoost}`); if (item.defBoost) lines.push(`Boosts DEF by ${item.defBoost}`); if (item.healthBoost) lines.push(`Boosts HP by ${item.healthBoost}`); if (item.statBoostType && item.statBoostAmount) { const label = item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : item.statBoostType === "lvl" ? "Feed pts" : item.statBoostType === "level" ? "Level Points" : item.statBoostType; lines.push(`+${item.statBoostAmount} ${label}`); } if (item.petsRevived) lines.push(`Revives ${item.petsRevived} pet(s)`); if (item.specialSkill) lines.push(item.specialSkill); if (item.specialType && item.specialAmount) { const label = item.specialType === "level" ? "Level Points" : item.specialType === "hatch_time" ? `Hatching Reduced by ${item.specialAmount}min` : item.specialType; lines.push(item.specialType === "hatch_time" ? label : `+${item.specialAmount} ${label}`); } }
  return lines;
}

export default function WorldShopOverlay(props: WorldShopOverlayProps) {
  const { worldId, worldName, accent, location, items, itemsLoading, bundles: shopBundlesForSale, decor: shopDecorForSale, coins, isAdmin, ownedShopItemIds: ownedItemIds, ownedPetCount, showSellPanel, isPurchasePending, isBundlePurchasePending, onPurchase, onBuyBundle, onUnassignItem, onOpenItemPicker, onToggleSellPanel, onClose } = props;
  const currentUser = { coins, isAdmin };
  const locations = location ? [location] : [];
  const activeLocationId = location?.id ?? null;
  const world = { name: worldName };
  const staticWorld = { accent };
  const [fishingShopTab, setFishingShopTab] = useState<"pole" | "bait">("pole");
  const [selectedShopItem, setSelectedShopItem] = useState<WorldShopItem | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buyConfirmPending, setBuyConfirmPending] = useState(false);
  const [buyFlash, setBuyFlash] = useState(0);
  const shopScrollRef = useRef<HTMLDivElement>(null);
  const handlePurchase = async (itemId: string) => {
    try { await onPurchase(itemId, 1); setBuyError(null); setBuyConfirmPending(false); setBuyFlash(n => n + 1); }
    catch (err: any) { let msg = "Could not purchase item"; try { const parsed = JSON.parse(err.message.split(": ").slice(1).join(": ")); msg = parsed.message || msg; } catch {} setBuyError(msg); }
  };
  return (<>
      {(() => {
        const activeLoc = locations.find(l => l.id === activeLocationId);
        const shopName = activeLoc?.name || world.name;
        const sortedItems = [...items].sort((a, b) => a.price - b.price);
        const isFishingShop = activeLoc?.type === "fishing";
        const isVolcanicFishing = isFishingShop && worldId === "volcanic";
        const isVolcanicShop = worldId === "volcanic" && !isFishingShop;
        const isCentralMarket = worldId === "pet_world";
        const volcanicShopBg = (() => {
          const id = activeLoc?.id ?? "";
          if (id === "c3d4e5f6-0003-4000-8000-000000000003") return bgShopForgeFang;
          if (id === "c3d4e5f6-0004-4000-8000-000000000004") return bgShopBookshopVolcanic;
          if (id === "c3d4e5f6-0006-4000-8000-000000000006") return bgShopFoodVolcanic;
          return bgShopVolcanicPets;
        })();
        const isSwampFishing = isFishingShop && worldId === "swamp";
        const shopBg = isFishingShop
          ? (isVolcanicFishing ? bgShopVolcanic : isSwampFishing ? bgShopBayou : bgShopFishing)
          : isCentralMarket ? bgShopCentralMarket
          : isVolcanicShop ? volcanicShopBg
          : worldId === "swamp"
            ? (activeLoc?.id === "a1b2c3d4-0010-4000-8000-000000000010" ? bgShopFoodSwamp : bgShopBayou)
            : bgShopMystical;
        return (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, background: isCentralMarket ? "#08060a" : (isVolcanicFishing || isVolcanicShop) ? "#0d0502" : "#080510", overflow: "hidden" }}>
          {/* Themed background image — fixed, not admin-uploaded */}
          <img src={shopBg} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ zIndex: 0, opacity: (isVolcanicFishing || isVolcanicShop) ? 0.45 : 0.55 }} />
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, background: (isVolcanicFishing || isVolcanicShop) ? "linear-gradient(180deg, rgba(10,3,2,0.88) 0%, rgba(18,6,3,0.62) 40%, rgba(10,3,2,0.82) 100%)" : isFishingShop ? "linear-gradient(180deg, rgba(2,10,6,0.86) 0%, rgba(4,14,8,0.60) 40%, rgba(2,10,5,0.80) 100%)" : isCentralMarket ? "linear-gradient(180deg, rgba(6,4,10,0.82) 0%, rgba(10,7,18,0.55) 40%, rgba(6,4,12,0.72) 100%)" : "linear-gradient(180deg, rgba(4,2,14,0.82) 0%, rgba(8,4,22,0.55) 40%, rgba(6,3,18,0.72) 100%)" }} />
          {/* Subtle accent shimmer at top */}
          <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none" style={{ zIndex: 2, background: (isVolcanicFishing || isVolcanicShop) ? "linear-gradient(180deg, rgba(180,60,20,0.28) 0%, transparent 100%)" : isFishingShop ? "linear-gradient(180deg, rgba(40,120,60,0.18) 0%, transparent 100%)" : `linear-gradient(180deg, ${accent}18 0%, transparent 100%)` }} />
          {/* Lava ember particles for volcanic fishing shop */}
          {isVolcanicFishing && (
            <>
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                <div style={{ position: "absolute", left: "15%", bottom: "28%", width: 6, height: 6, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,180,50,0.95) 0%, rgba(255,80,10,0.4) 60%, transparent 80%)", filter: "blur(1px)", animation: "lavaSpark1 4.2s ease-out 0s infinite" }} />
                <div style={{ position: "absolute", left: "38%", bottom: "22%", width: 4, height: 4, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,200,80,0.9) 0%, rgba(255,100,20,0.35) 60%, transparent 80%)", filter: "blur(0.8px)", animation: "lavaSpark2 5.1s ease-out 1.4s infinite" }} />
                <div style={{ position: "absolute", left: "62%", bottom: "30%", width: 5, height: 5, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,160,30,0.95) 0%, rgba(240,60,10,0.4) 60%, transparent 80%)", filter: "blur(1px)", animation: "lavaSpark3 3.8s ease-out 2.7s infinite" }} />
                <div style={{ position: "absolute", left: "80%", bottom: "20%", width: 3, height: 3, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,220,100,0.9) 0%, rgba(255,120,30,0.3) 65%, transparent 80%)", filter: "blur(0.6px)", animation: "lavaSpark1 6.3s ease-out 0.8s infinite" }} />
                <div style={{ position: "absolute", left: "25%", bottom: "15%", width: 5, height: 5, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,140,20,0.9) 0%, rgba(220,50,5,0.35) 60%, transparent 80%)", filter: "blur(1px)", animation: "lavaSpark2 4.7s ease-out 3.5s infinite" }} />
                <div style={{ position: "absolute", left: "50%", bottom: "10%", width: 60, height: 60, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,80,10,0.18) 0%, rgba(200,40,5,0.06) 55%, transparent 75%)", animation: "lavaGlow 5s ease-in-out infinite 1s" }} />
                <div style={{ position: "absolute", left: "20%", bottom: "5%", width: 50, height: 50, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,120,20,0.15) 0%, rgba(180,40,5,0.05) 55%, transparent 75%)", animation: "lavaGlow 7s ease-in-out infinite 3s" }} />
              </div>
            </>
          )}

          {/* ── Header ─────────────────────────────────────── */}
          <div className="relative flex items-center justify-between px-4 pb-3 flex-shrink-0" style={{ paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 72px)", zIndex: 10 }}>
            <div className="flex items-center gap-2.5">
              {activeLoc?.iconUrl && (
                <img src={activeLoc.iconUrl} alt="" className="w-10 h-10 object-contain" style={{ filter: `drop-shadow(0 0 8px ${accent}80) drop-shadow(0 2px 4px rgba(0,0,0,0.6))` }} />
              )}
              <div>
                <h3 className="font-fantasy text-base tracking-widest font-semibold" style={{ color: accent, textShadow: `0 0 14px ${accent}60` }} data-testid="text-shop-name">
                  {shopName}
                </h3>
                <div className="flex items-center gap-1">
                  <img src={coinIconImg} alt="" className="w-3 h-3 object-contain" />
                  <span className="font-fantasy text-[11px]" style={{ color: `${accent}cc` }}>{currentUser.coins} coins</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentUser.isAdmin && (
                <button
                  data-testid="button-add-shop-item"
                  onClick={() => { onOpenItemPicker(); }}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                  style={{ background: `${accent}35`, border: `2px solid ${accent}70`, color: accent, cursor: "pointer", boxShadow: `0 0 10px ${accent}25` }}
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
              <button
                data-testid="button-sell-items"
                onClick={() => { onToggleSellPanel(); }}
                className="flex items-center gap-1.5 px-3 h-9 rounded-full font-fantasy tracking-wider transition-transform active:scale-90 text-[11px]"
                style={{ background: showSellPanel ? `${accent}35` : "rgba(0,0,0,0.55)", border: `1.5px solid ${accent}60`, color: accent, cursor: "pointer", boxShadow: showSellPanel ? `0 0 10px ${accent}25` : "none" }}
              >
                <Package className="w-3.5 h-3.5" />
                Sell
              </button>
              <button
                data-testid="button-close-shop"
                onClick={() => { onClose(); setSelectedShopItem(null); }}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${accent}40`, color: accent, cursor: "pointer" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ── Volcanic Fishing Shop NPC ─────────────────────── */}
          {isVolcanicFishing && (
            <div className="relative flex-shrink-0 flex flex-col items-center px-4 pb-1" style={{ zIndex: 10 }}>
              {/* aspectRatio 1/1 = shows top 75% of the 3:4 NPC (container height = width, image is taller) */}
              <div className="relative overflow-hidden" style={{ width: "min(240px, calc(64*var(--vw)))", aspectRatio: "1/1" }}>
                {/* warm lava glow behind NPC */}
                <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "130%", height: "70%", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,80,10,0.30) 0%, rgba(180,40,5,0.10) 55%, transparent 75%)", filter: "blur(16px)" }} />
                <img
                  src={npcLavaHook}
                  alt="Shopkeeper"
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", filter: "drop-shadow(0 4px 18px rgba(255,80,10,0.6)) drop-shadow(0 0 36px rgba(255,60,5,0.25))" }}
                  draggable={false}
                />
              </div>
            </div>
          )}

          {/* ── Divider ─────────────────────────────────────── */}
          <div className="relative flex-shrink-0 mx-4 mb-3" style={{ zIndex: 10, height: "1px", background: isVolcanicFishing ? "linear-gradient(90deg, transparent, rgba(255,100,30,0.55), transparent)" : isFishingShop ? "linear-gradient(90deg, transparent, rgba(74,180,100,0.5), transparent)" : `linear-gradient(90deg, transparent, ${accent}50, transparent)` }} />

          {/* ── Type tabs (non-fishing) ──────────────────────── */}
          {!isFishingShop && (() => {
            const TYPE_ORDER = ["pet","edibles","power_up","potion","special","accessory","item","fishing","gift"];
            const TYPE_LABELS: Record<string,string> = { pet:"Pets", edibles:"Edibles", power_up:"Power-Ups", potion:"Potions", special:"Special", accessory:"Accessories", item:"Items", fishing:"Fishing", gift:"Gifts" };
            const allPresentTypes = [...new Set(sortedItems.map(i => i.type))];
            const presentTypes = [...TYPE_ORDER.filter(t => allPresentTypes.includes(t)), ...allPresentTypes.filter(t => !TYPE_ORDER.includes(t))];
            const hasHomeGoods = shopBundlesForSale.length > 0 || shopDecorForSale.length > 0;
            if (presentTypes.length === 0 && !hasHomeGoods) return null;
            const allTabs = [...presentTypes, ...(hasHomeGoods ? ["home_goods"] : [])];
            if (allTabs.length <= 1) return null;
            return (
              <div className="relative flex-shrink-0 flex gap-2 px-3 pb-3 overflow-x-auto" style={{ zIndex: 10, scrollbarWidth: "none" }}>
                {allTabs.map(t => {
                  const label = t === "home_goods" ? "Home Goods" : (TYPE_LABELS[t] ?? t);
                  return (
                    <button
                      key={t}
                      data-testid={`button-shop-tab-${t}`}
                      onClick={() => {
                        const el = shopScrollRef.current?.querySelector(`[data-section="${t}"]`) as HTMLElement | null;
                        el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="flex-shrink-0 font-fantasy tracking-widest transition-all active:scale-95"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        padding: "6px 14px",
                        borderRadius: 20,
                        background: `${accent}18`,
                        border: `1.5px solid ${accent}55`,
                        color: accent,
                        cursor: "pointer",
                        boxShadow: `0 0 10px ${accent}18`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* ── Fishing Shop Category Tabs ──────────────────── */}
          {isFishingShop && (
            <div className="relative flex-shrink-0 flex gap-2 px-3 pb-3" style={{ zIndex: 10 }}>
              {(["pole", "bait"] as const).map(tab => {
                const labels: Record<string, string> = { pole: "🎣  Fishing Poles", bait: "🪱  Bait" };
                const isActive = fishingShopTab === tab;
                return (
                  <button
                    key={tab}
                    data-testid={`button-fishing-tab-${tab}`}
                    onClick={() => setFishingShopTab(tab)}
                    style={{
                      flex: 1,
                      padding: "7px 4px",
                      borderRadius: 10,
                      border: isVolcanicFishing
                        ? isActive ? "1.5px solid rgba(255,100,30,0.75)" : "1.5px solid rgba(255,100,30,0.22)"
                        : isActive ? "1.5px solid rgba(74,180,100,0.7)" : "1.5px solid rgba(74,180,100,0.2)",
                      background: isVolcanicFishing
                        ? isActive ? "linear-gradient(160deg, rgba(120,40,10,0.60) 0%, rgba(80,20,5,0.45) 100%)" : "rgba(30,8,3,0.55)"
                        : isActive ? "linear-gradient(160deg, rgba(40,120,55,0.55) 0%, rgba(20,80,35,0.4) 100%)" : "rgba(10,30,15,0.55)",
                      cursor: "pointer",
                      transition: "all 0.18s ease",
                    }}
                  >
                    <div className="font-fantasy text-center" style={{ fontSize: 10, letterSpacing: "0.05em", color: isVolcanicFishing ? (isActive ? "#ff9060" : "rgba(255,160,80,0.65)") : (isActive ? "#7dde9a" : "rgba(150,220,170,0.65)"), lineHeight: 1.3 }}>
                      {labels[tab]}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Scrollable Items Body ────────────────────────── */}
          <div ref={shopScrollRef} className="relative flex-1 overflow-y-auto pb-6" style={{ zIndex: 10, scrollbarWidth: "none" }}>
            {itemsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full" style={{ width: 40, height: 40, border: `3px solid ${accent}25`, borderTopColor: `${accent}90` }} />
              </div>
            ) : isFishingShop ? (
              (() => {
                const displayItems = sortedItems.filter(i => i.fishingType === fishingShopTab);
                const emptyBorder = isVolcanicFishing ? "1px solid rgba(255,100,30,0.22)" : "1px solid rgba(74,180,100,0.2)";
                const emptyAdminColor = isVolcanicFishing ? "rgba(255,100,30,0.65)" : "rgba(74,180,100,0.6)";
                if (displayItems.length === 0) return (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center px-8 py-6 rounded-2xl" style={{ background: "rgba(0,0,0,0.55)", border: emptyBorder }}>
                      <p className="font-fantasy text-[#c8b89a] text-sm tracking-wider">No wares yet.</p>
                      {currentUser.isAdmin && <p className="font-fantasy text-[10px] tracking-wider mt-1" style={{ color: emptyAdminColor }}>Tap + to add items</p>}
                    </div>
                  </div>
                );
                return (
                  <div className="grid grid-cols-3 gap-3 px-3 pt-2">
                    {displayItems.map(item => {
                      const imgSrc = item.imageUrl;
                      const canAfford = currentUser.coins >= item.price;
                      const descLines = getItemDescription(item);
                      return (
                        <div
                          key={item.id}
                          className="relative flex flex-col items-center rounded-2xl transition-transform active:scale-95"
                          style={{ background: "linear-gradient(160deg,rgba(0,0,0,0.42),rgba(0,0,0,0.58))", border: `1.5px solid ${accent}30`, boxShadow: `0 2px 16px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.05)`, cursor: "pointer", padding: "10px 8px 8px" }}
                          onClick={() => { if (currentUser.isAdmin) return; playTick(); setSelectedShopItem(item); setBuyError(null); setBuyConfirmPending(false); setBuyFlash(0); }}
                        >
                          {currentUser.isAdmin && (
                            <button data-testid={`button-unassign-item-${item.id}`} onClick={e => { e.stopPropagation(); if (activeLocationId) onUnassignItem(item.id); }} className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(220,38,38,0.95)", border: "1px solid rgba(255,100,100,0.6)", cursor: "pointer" }}><X className="w-3 h-3 text-white" /></button>
                          )}
                          <div className="w-full flex items-center justify-center mb-2" style={{ height: "72px" }}>
                            {imgSrc ? <img src={imgSrc} alt={item.name} className="max-w-full max-h-full object-contain" style={{ filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.7)) drop-shadow(0 0 6px ${accent}30)` }} /> : <Package className="w-10 h-10" style={{ color: `${accent}60` }} />}
                          </div>
                          <p className="font-fantasy text-center text-white leading-tight mb-1.5" style={{ fontSize: "10px", lineHeight: "1.3" }}>{item.name}</p>
                          {descLines.length > 0 && <p className="font-fantasy text-center leading-tight mb-1.5" style={{ fontSize: "8px", color: `${accent}bb`, lineHeight: "1.2" }}>{descLines[0]}</p>}
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: canAfford ? `${accent}20` : "rgba(80,60,40,0.25)", border: `1px solid ${canAfford ? accent + "50" : "rgba(100,80,50,0.35)"}` }}>
                            <img src={coinIconImg} alt="" style={{ width: "9px", height: "9px", objectFit: "contain" }} />
                            <span className="font-fantasy" style={{ fontSize: "9px", color: canAfford ? accent : "#7a6040", fontWeight: 700 }}>{item.price}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : sortedItems.length === 0 && shopBundlesForSale.length === 0 && shopDecorForSale.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center px-8 py-6 rounded-2xl" style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${accent}20` }}>
                  <p className="font-fantasy text-[#c8b89a] text-sm tracking-wider">No wares yet.</p>
                  {currentUser.isAdmin && <p className="font-fantasy text-[10px] tracking-wider mt-1" style={{ color: `${accent}60` }}>Tap + to add items</p>}
                </div>
              </div>
            ) : (
              (() => {
                const TYPE_ORDER = ["pet","edibles","power_up","potion","special","accessory","item","fishing","gift"];
                const TYPE_LABELS: Record<string,string> = { pet:"Pets", edibles:"Edibles", power_up:"Power-Ups", potion:"Potions", special:"Special", accessory:"Accessories", item:"Items", fishing:"Fishing", gift:"Gifts" };
                const allPresentTypes = [...new Set(sortedItems.map(i => i.type))];
                const orderedTypes = [...TYPE_ORDER.filter(t => allPresentTypes.includes(t)), ...allPresentTypes.filter(t => !TYPE_ORDER.includes(t))];
                const grouped = orderedTypes.map(t => ({ type: t, label: TYPE_LABELS[t] ?? t.replace(/_/g, " "), groupItems: sortedItems.filter(i => i.type === t) }));
                const hasHomeGoods = shopBundlesForSale.length > 0 || shopDecorForSale.length > 0;
                return (
                  <>
                    {grouped.map(({ type, label, groupItems }) => (
                      <div key={type} data-section={type} className="mb-6 pt-2">
                        {/* Centered section label */}
                        <div className="text-center mb-1 px-4">
                          <span className="font-fantasy tracking-[0.22em]" style={{ fontSize: 13, color: accent, textShadow: `0 0 14px ${accent}55`, letterSpacing: "0.22em" }}>
                            {label.toUpperCase()}
                          </span>
                        </div>
                        {/* Full-width divider */}
                        <div className="mb-4 mx-4" style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}70, transparent)` }} />
                        {/* Items grid */}
                        <div className="grid grid-cols-3 gap-3 px-3">
                          {groupItems.map(item => {
                            const imgSrc = item.type === "pet" ? (item.eggImageUrl || item.imageUrl) : item.imageUrl;
                            const isOwned = item.type === "pet" && ownedItemIds.has(item.id);
                            const canAfford = currentUser.coins >= item.price;
                            const descLines = getItemDescription(item);
                            return (
                              <div
                                key={item.id}
                                className="relative flex flex-col items-center rounded-2xl transition-transform active:scale-95"
                                style={{ background: "linear-gradient(160deg,rgba(0,0,0,0.42),rgba(0,0,0,0.58))", border: `1.5px solid ${accent}30`, boxShadow: `0 2px 16px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.05)`, cursor: "pointer", padding: "10px 8px 8px" }}
                                onClick={() => { if (currentUser.isAdmin) return; playTick(); setSelectedShopItem(item); setBuyError(null); setBuyConfirmPending(false); setBuyFlash(0); }}
                              >
                                {currentUser.isAdmin && (
                                  <button data-testid={`button-unassign-item-${item.id}`} onClick={e => { e.stopPropagation(); if (activeLocationId) onUnassignItem(item.id); }} className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(220,38,38,0.95)", border: "1px solid rgba(255,100,100,0.6)", cursor: "pointer" }}><X className="w-3 h-3 text-white" /></button>
                                )}
                                {isOwned && (
                                  <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-full font-fantasy" style={{ fontSize: "7px", background: "rgba(232,168,0,0.25)", border: "1px solid rgba(232,168,0,0.5)", color: "#e8c84a" }}>Owned</div>
                                )}
                                <div className="w-full flex items-center justify-center mb-2" style={{ height: "72px" }}>
                                  {imgSrc ? <img src={imgSrc} alt={item.name} className="max-w-full max-h-full object-contain" style={{ filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.7)) drop-shadow(0 0 6px ${accent}30)` }} /> : <Package className="w-10 h-10" style={{ color: `${accent}60` }} />}
                                </div>
                                <p className="font-fantasy text-center text-white leading-tight mb-1.5" style={{ fontSize: "10px", lineHeight: "1.3" }}>{item.name}</p>
                                {descLines.length > 0 && <p className="font-fantasy text-center leading-tight mb-1.5" style={{ fontSize: "8px", color: `${accent}bb`, lineHeight: "1.2" }}>{descLines[0]}</p>}
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: canAfford ? `${accent}20` : "rgba(80,60,40,0.25)", border: `1px solid ${canAfford ? accent + "50" : "rgba(100,80,50,0.35)"}` }}>
                                  <img src={coinIconImg} alt="" style={{ width: "9px", height: "9px", objectFit: "contain" }} />
                                  <span className="font-fantasy" style={{ fontSize: "9px", color: canAfford ? accent : "#7a6040", fontWeight: 700 }}>{item.price}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* ── Home Goods section ───────────────────── */}
                    {hasHomeGoods && (
                      <div data-section="home_goods" className="mb-6 pt-2">
                        <div className="text-center mb-1 px-4">
                          <span className="font-fantasy tracking-[0.22em]" style={{ fontSize: 13, color: accent, textShadow: `0 0 14px ${accent}55`, letterSpacing: "0.22em" }}>
                            HOME GOODS
                          </span>
                        </div>
                        <div className="mb-4 mx-4" style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}70, transparent)` }} />
                        <div className="flex gap-3 overflow-x-auto px-3 pb-2" style={{ scrollbarWidth: "none" }}>
                          {shopBundlesForSale.map(bundle => (
                            <button key={bundle.id} data-testid={`button-buy-bundle-shop-${bundle.id}`} onClick={() => { if (!currentUser.isAdmin) onBuyBundle(bundle.id); }} disabled={isBundlePurchasePending || currentUser.isAdmin} className="flex-shrink-0 flex flex-col items-center gap-1.5 group" style={{ cursor: currentUser.isAdmin ? "default" : "pointer" }}>
                              <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center transition-transform group-active:scale-90" style={{ background: "rgba(255,255,255,0.07)", border: `1.5px solid ${accent}40`, boxShadow: `0 2px 10px rgba(0,0,0,0.5)` }}>
                                {bundle.shopImageUrl ? <img src={bundle.shopImageUrl} alt={bundle.name} className="w-full h-full object-cover" /> : <span className="text-2xl">🏡</span>}
                              </div>
                              <p className="font-fantasy text-[8px] text-white/80 max-w-[64px] text-center truncate leading-tight">{bundle.name}</p>
                              <span className="font-fantasy text-[8px] px-2 py-0.5 rounded-full" style={{ background: `${accent}25`, color: accent, border: `1px solid ${accent}40` }}>{bundle.price}c</span>
                            </button>
                          ))}
                          {shopDecorForSale.map(decor => (
                            <div key={decor.id} data-testid={`button-buy-decor-shop-${decor.id}`} className="flex-shrink-0 flex flex-col items-center gap-1.5">
                              <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: "rgba(255,255,255,0.07)", border: `1.5px solid ${accent}40`, boxShadow: `0 2px 10px rgba(0,0,0,0.5)` }}>
                                {decor.imageUrl ? <img src={decor.imageUrl} alt={decor.name} className="w-full h-full object-cover" /> : <span className="text-2xl">🪴</span>}
                              </div>
                              <p className="font-fantasy text-[8px] text-white/80 max-w-[64px] text-center truncate leading-tight">{decor.name}</p>
                              <span className="font-fantasy text-[8px] px-2 py-0.5 rounded-full" style={{ background: `${accent}25`, color: accent, border: `1px solid ${accent}40` }}>{decor.price}c</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </div>

          {/* Owner character floating bottom-left */}
          {activeLoc?.ownerImageUrl && (
            <div className="absolute bottom-4 left-4 pointer-events-none" style={{ zIndex: 10, animation: "locFloat 4s ease-in-out infinite" }}>
              <img src={activeLoc.ownerImageUrl} alt="Owner" className="w-20 h-20 object-contain" style={{ filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.6)) drop-shadow(0 0 12px ${accent}30)` }} />
            </div>
          )}
        </div>
        );
      })()}

      {selectedShopItem && (() => {
        const item = selectedShopItem;
        const imgSrc = item.type === "pet" ? (item.eggImageUrl || item.imageUrl) : item.imageUrl;
        const descLines = getItemDescription(item);
        const ownedCount = item.type === "pet" ? ownedPetCount(item.id) : 0;
        const canAfford = currentUser.coins >= item.price;
        const shopAccent = staticWorld?.accent || "#d4af37";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/75" onClick={() => { setSelectedShopItem(null); setBuyError(null); setBuyConfirmPending(false); }} />

            <div className="relative z-10 flex flex-col items-center" style={{ gap: 12, width: "min(calc(85*var(--vw)), 300px)" }}>
              {/* ── Styled shop card ── */}
              <div
                className="relative w-full"
                style={{
                  background: `linear-gradient(160deg, ${shopAccent}1a 0%, #080808 100%)`,
                  border: "2px solid #d4af37",
                  borderRadius: 14,
                  padding: "20px 20px 16px",
                  boxShadow: `0 0 50px rgba(0,0,0,0.97), 0 0 28px ${shopAccent}44`,
                }}
              >
                {/* Item image */}
                <div className="flex justify-center" style={{ marginBottom: 10 }}>
                  {imgSrc ? (
                    <img src={imgSrc} alt={item.name} style={{ width: 90, height: 90, objectFit: "contain", filter: `drop-shadow(0 4px 14px rgba(0,0,0,0.8)) drop-shadow(0 0 10px ${shopAccent}55)` }} />
                  ) : (
                    <Package style={{ width: 80, height: 80, color: `${shopAccent}88` }} />
                  )}
                </div>

                {/* Owned badge */}
                {ownedCount > 0 && item.type === "pet" && (
                  <div className="text-center font-fantasy font-bold" style={{ fontSize: 9.5, color: "#e8a800", textShadow: "0 0 6px rgba(232,168,0,0.5)", marginBottom: 4 }}>
                    Owned{ownedCount > 1 ? ` ×${ownedCount}` : ""}
                  </div>
                )}

                {/* Item name */}
                <h3
                  className="font-fantasy font-bold text-center"
                  style={{ fontSize: 15, color: "#ffd04a", marginBottom: 6, lineHeight: 1.3 }}
                  data-testid="text-detail-item-name"
                >
                  {item.name}
                </h3>

                {/* Description lines */}
                {descLines.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {descLines.slice(0, 4).map((line, i) => (
                      <div key={i} className="font-fantasy text-center" style={{ fontSize: 10, color: "rgba(255,240,200,0.75)", lineHeight: 1.45 }}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}

                {/* Divider */}
                <div style={{ borderTop: `1px solid ${shopAccent}33`, marginBottom: 8 }} />

                {/* Price */}
                <div className="flex items-center justify-center" style={{ gap: 5 }}>
                  <img src={coinIconImg} alt="" style={{ width: 15, height: 15, objectFit: "contain" }} />
                  <span className="font-fantasy font-bold" style={{ fontSize: 16, color: canAfford ? "#ffd04a" : "#e84040" }}>
                    {item.price} coins
                  </span>
                </div>

                {/* Confirm prompt — shown for pets or items over 500 coins */}
                {buyConfirmPending && (
                  <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.35)", textAlign: "center" }}>
                    <span className="font-fantasy" style={{ fontSize: 11, color: "#fde68a", fontWeight: 700 }}>
                      Spend {item.price.toLocaleString()} coins on this?
                    </span>
                  </div>
                )}
              </div>

              {/* Error message */}
              {buyError && (
                <div className="font-fantasy text-center w-full" style={{ fontSize: 9.5, padding: "5px 10px", borderRadius: 8, background: "rgba(150,10,10,0.35)", color: "#ffaaaa", border: "1px solid rgba(200,50,50,0.4)" }} data-testid="text-buy-error">
                  {buyError}
                </div>
              )}

              {/* Button row — with +1 flash */}
              <div className="relative flex w-full" style={{ gap: 8 }}>
                {/* Green +1 flash after purchase */}
                {buyFlash > 0 && (
                  <div
                    key={buyFlash}
                    className="pointer-events-none font-fantasy font-bold"
                    style={{
                      position: "absolute",
                      top: -32,
                      left: "50%",
                      transform: "translateX(-50%)",
                      animation: "shopBuyFlash 1s ease-out forwards",
                      fontSize: 20,
                      color: "#4ade80",
                      textShadow: "0 0 14px rgba(74,222,128,1), 0 0 28px rgba(74,222,128,0.6)",
                      zIndex: 10,
                      whiteSpace: "nowrap",
                    }}
                  >
                    +1
                  </div>
                )}

                {!buyConfirmPending ? (
                  <>
                    {/* Close button (secondary, smaller) */}
                    <button
                      data-testid="button-close-item-detail"
                      onClick={() => { setSelectedShopItem(null); setBuyError(null); setBuyConfirmPending(false); }}
                      className="font-fantasy font-semibold transition-transform active:scale-95 flex-shrink-0"
                      style={{ padding: "10px 14px", fontSize: 12, borderRadius: 10, background: "rgba(30,15,5,0.8)", border: "1.5px solid rgba(140,100,40,0.4)", color: "#a07840", cursor: "pointer", letterSpacing: "0.04em" }}
                    >
                      Close
                    </button>
                    {/* Buy button (primary) */}
                    <button
                      data-testid="button-price-buy"
                      onClick={(e) => {
                        if (!canAfford || isPurchasePending) return;
                        const requiresConfirm = item.type === "pet" || item.price > 500;
                        if (requiresConfirm) { setBuyConfirmPending(true); return; }
                        burstGoldenOrbs(e.clientX, e.clientY);
                        handlePurchase(item.id);
                      }}
                      disabled={!canAfford || isPurchasePending}
                      className="flex-1 font-fantasy font-bold tracking-wide transition-transform active:scale-95 disabled:opacity-50"
                      style={{
                        padding: "11px 0",
                        fontSize: 14,
                        borderRadius: 10,
                        background: canAfford ? "linear-gradient(135deg, rgba(115,62,10,0.97) 0%, rgba(78,40,6,0.97) 100%)" : "rgba(60,42,18,0.55)",
                        border: `2px solid ${canAfford ? "#d4af37" : "rgba(100,75,40,0.3)"}`,
                        color: canAfford ? "#ffd04a" : "#7a6040",
                        cursor: canAfford ? "pointer" : "default",
                        boxShadow: canAfford ? "0 4px 16px rgba(90,45,0,0.5)" : "none",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {isPurchasePending ? "Buying…" : "Buy"}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Cancel (back to normal view) */}
                    <button
                      data-testid="button-confirm-cancel"
                      onClick={() => setBuyConfirmPending(false)}
                      className="font-fantasy font-semibold transition-transform active:scale-95 flex-shrink-0"
                      style={{ padding: "10px 14px", fontSize: 12, borderRadius: 10, background: "rgba(30,15,5,0.8)", border: "1.5px solid rgba(140,100,40,0.4)", color: "#a07840", cursor: "pointer", letterSpacing: "0.04em" }}
                    >
                      Cancel
                    </button>
                    {/* Confirm purchase */}
                    <button
                      data-testid="button-confirm-buy"
                      onClick={(e) => {
                        if (!canAfford || isPurchasePending) return;
                        burstGoldenOrbs(e.clientX, e.clientY);
                        handlePurchase(item.id);
                      }}
                      disabled={!canAfford || isPurchasePending}
                      className="flex-1 font-fantasy font-bold tracking-wide transition-transform active:scale-95 disabled:opacity-50"
                      style={{
                        padding: "11px 0",
                        fontSize: 13,
                        borderRadius: 10,
                        background: "linear-gradient(135deg, rgba(115,62,10,0.97) 0%, rgba(78,40,6,0.97) 100%)",
                        border: "2px solid #d4af37",
                        color: "#ffd04a",
                        cursor: "pointer",
                        boxShadow: "0 4px 16px rgba(90,45,0,0.5)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {isPurchasePending ? "Buying…" : "Confirm!"}
                    </button>
                  </>
                )}
              </div>

              {!canAfford && (
                <p className="font-fantasy text-center" style={{ fontSize: 10, color: "#e84040", marginTop: -6 }} data-testid="text-not-enough-coins">
                  Not enough coins
                </p>
              )}
            </div>
          </div>
        );
      })()}

  </>);
}
