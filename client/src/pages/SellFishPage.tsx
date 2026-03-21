import { useState, useRef, useCallback } from "react";
import { playChime } from "@/lib/sounds";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import fishCommonIcon from "@assets/generated_images/icon_fish_common.png";
import fishRodIcon from "@assets/generated_images/icon_fish_rod.png";
import fishBarrelImg from "@assets/fish_barrel.png";
import { X, ShoppingBag, Coins } from "lucide-react";
import coinIconImg from "@assets/icon_coin.png";

const ACCENT = "#5eead4";

const SELL_PRICES: Record<number, number> = { 1: 5, 2: 10, 3: 15, 4: 25, 5: 30 };

interface ShopItem {
  id: string;
  name: string;
  imageUrl: string | null;
  rarity: number | null;
  starRarity: number | null;
}

interface CaughtFish {
  id: string;
  shopItemId: string;
  caughtAt: string;
  inAquarium: boolean;
  item: ShopItem | null;
}

interface SellFishPageProps {
  user: { id: string; username: string; coins: number; isAdmin: boolean };
  worldId: string;
  onClose: () => void;
  onUserUpdate?: (user: any) => void;
}

function RarityStars({ rarity }: { rarity: number | null }) {
  if (!rarity) return null;
  return (
    <span style={{ color: "#fbbf24", fontSize: 9, letterSpacing: 0.5 }}>
      {"★".repeat(rarity)}
    </span>
  );
}

export default function SellFishPage({ user, worldId, onClose, onUserUpdate }: SellFishPageProps) {
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());
  const [dragOverSell, setDragOverSell] = useState(false);
  const [draggingFish, setDraggingFish] = useState<CaughtFish | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const sellZoneRef = useRef<HTMLDivElement>(null);
  const dragFishRef = useRef<CaughtFish | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: fishInventory = [], isLoading } = useQuery<CaughtFish[]>({
    queryKey: ["/api/fishing/inventory"],
  });

  const sellMutation = useMutation({
    mutationFn: async (fishIds: string[]) => {
      const res = await apiRequest("POST", "/api/fishing/sell", { fishIds });
      return res.json();
    },
    onSuccess: (data: { sold: number; coinsEarned: number; newBalance: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      if (onUserUpdate) onUserUpdate({ ...user, coins: data.newBalance });
      setCartIds(new Set());
      playChime();
      toast({
        title: "Fish sold!",
        description: `Sold ${data.sold} fish for ${data.coinsEarned} coins.`,
      });
    },
    onError: () => {
      toast({ title: "Sale failed", description: "Could not sell fish.", variant: "destructive" });
    },
  });

  // Fish in the aquarium cannot be sold — only show bag fish
  const bagFish = fishInventory.filter(f => !f.inAquarium);
  const cartFish = bagFish.filter(f => cartIds.has(f.id));
  const inventoryFish = bagFish.filter(f => !cartIds.has(f.id));
  const totalCoins = cartFish.reduce((sum, f) => sum + (SELL_PRICES[f.item?.starRarity ?? 1] ?? 5), 0);
  const aquariumCount = fishInventory.filter(f => f.inAquarium).length;

  const toggleCart = useCallback((fish: CaughtFish) => {
    setCartIds(prev => {
      const next = new Set(prev);
      if (next.has(fish.id)) next.delete(fish.id);
      else next.add(fish.id);
      return next;
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCartIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((e: React.PointerEvent, fish: CaughtFish) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragFishRef.current = fish;
    setDraggingFish(fish);
    setDragPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragFishRef.current) return;
    setDragPos({ x: e.clientX, y: e.clientY });
    if (sellZoneRef.current) {
      const rect = sellZoneRef.current.getBoundingClientRect();
      const over = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      setDragOverSell(over);
    }
  }, []);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    const fish = dragFishRef.current;
    dragFishRef.current = null;
    setDraggingFish(null);
    setDragPos(null);
    if (!fish) return;
    if (sellZoneRef.current) {
      const rect = sellZoneRef.current.getBoundingClientRect();
      const over = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (over) {
        setCartIds(prev => new Set([...prev, fish.id]));
      }
    }
    setDragOverSell(false);
  }, []);

  const handleConfirmSell = () => {
    if (cartIds.size === 0) return;
    sellMutation.mutate([...cartIds]);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
      style={{ background: "rgba(5,12,10,0.97)", backdropFilter: "blur(6px)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{ borderBottom: `1px solid ${ACCENT}25`, paddingTop: "max(env(safe-area-inset-top, 0px) + 10px, 48px)", paddingBottom: 12 }}
      >
        <div className="flex items-center gap-2">
          <img src={fishBarrelImg} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div>
            <h2 className="font-fantasy text-base tracking-widest" style={{ color: ACCENT }}>Fish Market</h2>
            <p className="font-fantasy text-[10px]" style={{ color: `${ACCENT}60` }}>Drag or tap fish to sell</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <img src={coinIconImg} alt="coins" className="w-4 h-4 object-contain" />
            <span className="font-fantasy text-sm" style={{ color: "#fbbf24" }}>{user.coins.toLocaleString()}</span>
          </div>
          <button
            data-testid="button-close-sell-fish"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${ACCENT}25` }}
          >
            <X className="w-4 h-4" style={{ color: `${ACCENT}80` }} />
          </button>
        </div>
      </div>

      {/* Price reference */}
      <div
        className="flex items-center justify-center gap-3 px-4 py-2 shrink-0 overflow-x-auto"
        style={{ borderBottom: `1px solid ${ACCENT}15`, background: "rgba(0,0,0,0.3)" }}
      >
        {[1, 2, 3, 4, 5].map(r => (
          <div key={r} className="flex items-center gap-1 shrink-0">
            <span className="font-fantasy text-[10px]" style={{ color: "#fbbf24" }}>{"★".repeat(r)}</span>
            <span className="font-fantasy text-[10px]" style={{ color: `${ACCENT}80` }}>= {SELL_PRICES[r]}c</span>
          </div>
        ))}
      </div>

      {/* Sell zone */}
      <div
        ref={sellZoneRef}
        className="mx-4 mt-3 mb-2 rounded-xl shrink-0 transition-all"
        style={{
          minHeight: 90,
          border: `2px dashed ${dragOverSell ? ACCENT : `${ACCENT}35`}`,
          background: dragOverSell ? `${ACCENT}12` : "rgba(0,0,0,0.25)",
          padding: "8px",
        }}
        data-testid="sell-drop-zone"
      >
        <p className="font-fantasy text-[10px] text-center mb-2" style={{ color: `${ACCENT}60` }}>
          {cartFish.length === 0 ? "Drop fish here to sell" : `${cartFish.length} fish queued`}
        </p>
        {cartFish.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {cartFish.map(fish => (
              <div key={fish.id} className="relative">
                <button
                  data-testid={`button-remove-from-cart-${fish.id}`}
                  onClick={() => removeFromCart(fish.id)}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg"
                  style={{
                    background: "rgba(94,234,212,0.12)",
                    border: `1.5px solid ${ACCENT}50`,
                    minWidth: 52,
                  }}
                >
                  <div className="w-9 h-9 flex items-center justify-center">
                    {fish.item?.imageUrl
                      ? <img src={fish.item.imageUrl} alt="" className="w-full h-full object-contain" />
                      : <img src={fishCommonIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                    }
                  </div>
                  <RarityStars rarity={fish.item?.starRarity ?? null} />
                </button>
                <div
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(200,30,30,0.9)", border: "1.5px solid rgba(255,100,100,0.7)", pointerEvents: "none" }}
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm sell bar */}
      {cartFish.length > 0 && (
        <div
          className="mx-4 mb-2 rounded-xl flex items-center justify-between px-4 py-2.5 shrink-0"
          style={{ background: "rgba(94,234,212,0.08)", border: `1px solid ${ACCENT}30` }}
        >
          <div>
            <p className="font-fantasy text-[10px]" style={{ color: `${ACCENT}70` }}>You will receive</p>
            <div className="flex items-center gap-1.5">
              <img src={coinIconImg} alt="coins" className="w-4 h-4 object-contain" />
              <span className="font-fantasy text-lg font-bold" style={{ color: "#fbbf24" }}>{totalCoins}</span>
              <span className="font-fantasy text-[10px]" style={{ color: `${ACCENT}60` }}>coins</span>
            </div>
          </div>
          <button
            data-testid="button-confirm-sell"
            onClick={handleConfirmSell}
            disabled={sellMutation.isPending}
            className="font-fantasy text-sm px-5 py-2 rounded-lg transition-all active:scale-95"
            style={{
              background: sellMutation.isPending ? "rgba(94,234,212,0.2)" : `linear-gradient(135deg, ${ACCENT}, #0d9488)`,
              color: "#050f0c",
              fontWeight: "bold",
              cursor: sellMutation.isPending ? "not-allowed" : "pointer",
              boxShadow: `0 0 12px ${ACCENT}40`,
            }}
          >
            {sellMutation.isPending ? "Selling..." : "Confirm Sale"}
          </button>
        </div>
      )}

      {/* Fish inventory */}
      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: "thin" }}>
        <p className="font-fantasy text-[10px] mb-2" style={{ color: `${ACCENT}50` }}>
          Your Fish ({inventoryFish.length})
          {aquariumCount > 0 && (
            <span style={{ color: `${ACCENT}35`, marginLeft: 6 }}>· {aquariumCount} in aquarium (not for sale)</span>
          )}
        </p>
        {isLoading ? (
          <p className="font-fantasy text-xs text-center py-8" style={{ color: `${ACCENT}50` }}>Loading...</p>
        ) : inventoryFish.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <img src={fishRodIcon} alt="" style={{ width: 64, height: 64, objectFit: "contain", opacity: 0.6 }} />
            <p className="font-fantasy text-sm" style={{ color: `${ACCENT}60` }}>
              {bagFish.length === 0 && aquariumCount > 0
                ? "All your fish are in the aquarium!"
                : bagFish.length === 0
                ? "No fish to sell. Go fishing!"
                : "All fish queued for sale!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2.5">
            {inventoryFish.map(fish => {
              const rarity = fish.item?.starRarity ?? 1;
              const price = SELL_PRICES[rarity] ?? 5;
              return (
                <div
                  key={fish.id}
                  className="relative"
                  onPointerDown={(e) => handleDragStart(e, fish)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                  style={{ touchAction: "none" }}
                >
                  <button
                    data-testid={`button-fish-item-${fish.id}`}
                    onClick={() => toggleCart(fish)}
                    className="w-full flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all active:scale-95"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${ACCENT}20`,
                      cursor: "grab",
                    }}
                  >
                    <div className="w-11 h-11 flex items-center justify-center">
                      {fish.item?.imageUrl
                        ? <img src={fish.item.imageUrl} alt="" className="w-full h-full object-contain" draggable={false} />
                        : <img src={fishCommonIcon} alt="" style={{ width: 36, height: 36, objectFit: "contain" }} />
                      }
                    </div>
                    <RarityStars rarity={rarity} />
                    <div className="flex items-center gap-0.5">
                      <img src={coinIconImg} alt="" className="w-3 h-3 object-contain" />
                      <span className="font-fantasy text-[9px]" style={{ color: `${ACCENT}80` }}>{price}</span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drag ghost */}
      {draggingFish && dragPos && (
        <div
          className="fixed pointer-events-none z-[100] flex flex-col items-center"
          style={{
            left: dragPos.x - 28,
            top: dragPos.y - 28,
            width: 56,
            opacity: 0.85,
          }}
        >
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: `${ACCENT}20`, border: `2px solid ${ACCENT}80` }}
          >
            {draggingFish.item?.imageUrl
              ? <img src={draggingFish.item.imageUrl} alt="" className="w-10 h-10 object-contain" />
              : <img src={fishCommonIcon} alt="" style={{ width: 36, height: 36, objectFit: "contain" }} />
            }
          </div>
        </div>
      )}
    </div>
  );
}
