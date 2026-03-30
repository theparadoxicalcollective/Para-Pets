import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetAnimator from "@/components/PetAnimator";
import petHouseBg from "@assets/IMG_6459_1774822089433.jpeg";
import homeInventoryIcon from "@assets/icon_home_inventory.png";
import decorInventoryIcon from "@assets/icon_decor_inventory.png";

interface PetHousePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    activePetId: string | null;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

interface HousePet {
  inventoryId: string;
  shopItemId: string;
  name: string;
  nickname: string | null;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  eggImageUrl: string | null;
  rarity: number | null;
  petLevel: number;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petTemplateId: string | null;
  posLeft: string | null;
  posTop: string | null;
}

interface HouseBundle {
  id: string;
  name: string;
  shopImageUrl: string | null;
  bgImageUrl: string | null;
  price: number;
}

interface ActiveBundle extends HouseBundle {
  buildings: { id: string; name: string; imageUrl: string; posX: number; posY: number; width: number; flippedX: boolean }[];
}

interface OwnedBundle {
  id: string;
  bundleId: string;
  bundle: HouseBundle & { shopImageUrl: string | null };
}

const DEFAULT_BG_RATIO = 1920 / 2400;
const BUILDING_REF_H   = 900; // must match HouseBundleAdminPanel constant

function randomGroundConfig(index: number) {
  const seed = index * 137.508;
  const pseudo = (n: number) => ((Math.sin(n) * 10000) % 1 + 1) % 1;
  const size = 140 + pseudo(seed + 2) * 40;
  // Center position as percentages — pet is anchored at its center via calc()
  // so these are the safe center ranges (keeps even the largest pet inside the container)
  const centerX = 20 + pseudo(seed) * 60;      // 20–80% horizontally
  const centerY = 62 + pseudo(seed + 1) * 22;  // 62–84% vertically (lower half only)
  return {
    wanderIdx: index % 6,
    left: `calc(${centerX}% - ${size / 2}px)`,
    top: `calc(${centerY}% - ${size / 2}px)`,
    size,
    duration: `${26 + pseudo(seed + 3) * 18}s`,
    delay: `${pseudo(seed + 4) * 28}s`,
  };
}

interface WalkingPetViewProps {
  pet: HousePet;
  index: number;
}

function WalkingPetView({ pet, index }: WalkingPetViewProps) {
  const cfg = useMemo(() => randomGroundConfig(index), [index]);

  return (
    <div
      style={{
        position: "absolute",
        left: cfg.left,
        top: cfg.top,
        width: cfg.size,
        height: cfg.size,
        pointerEvents: "none",
      }}
    >
      {pet.petTemplateId ? (
        <PetAnimator
          petTemplateId={pet.petTemplateId}
          mode="idle"
          size={cfg.size}
        />
      ) : (
        <img
          src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
          alt={pet.nickname ?? pet.name}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      )}
    </div>
  );
}

export default function PetHousePage({ user }: PetHousePageProps) {
  const { toast } = useToast();
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [openInventory, setOpenInventory] = useState<"home" | "decor" | null>(null);

  const [panX, setPanX] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [bgAspect, setBgAspect] = useState(DEFAULT_BG_RATIO);
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);

  // Active bundle query
  const { data: activeBundle, refetch: refetchActiveBundle } = useQuery<ActiveBundle | null>({
    queryKey: ["/api/users", user.id, "active-house-bundle"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/active-house-bundle`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30000,
  });

  // User's owned bundles
  const { data: ownedBundles = [], refetch: refetchOwned } = useQuery<OwnedBundle[]>({
    queryKey: ["/api/users", user.id, "house-bundles"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/house-bundles`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30000,
  });

  const activateMutation = useMutation({
    mutationFn: async (bundleId: string) => {
      const res = await apiRequest("POST", `/api/house-bundles/${bundleId}/activate`, {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      refetchActiveBundle();
      toast({ title: "Bundle activated!" });
    },
    onError: (e: any) => toast({ title: "Activation failed", description: e.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/house-bundles/deactivate", {});
    },
    onSuccess: () => {
      refetchActiveBundle();
      toast({ title: "Reverted to default background" });
    },
  });

  // Determine background URL
  const bgUrl = activeBundle?.bgImageUrl ?? petHouseBg;

  // Load image to get natural aspect ratio
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalHeight > 0) {
        setBgAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = bgUrl;
  }, [bgUrl]);

  // Recalculate imgWidth and center pan when aspect ratio or container changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const recalc = () => {
      const containerW = container.offsetWidth;
      const h = container.offsetHeight;
      const imgW = h * bgAspect;
      setContainerH(h);
      setImgWidth(imgW);
      setPanX(Math.max(Math.min(0, containerW - imgW), -(imgW - containerW) / 2));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [bgAspect]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const imgW = containerH * bgAspect;
    const min = Math.min(0, containerW - imgW);
    setPanX(Math.min(0, Math.max(min, drag.startPanX + (e.clientX - drag.startX))));
  }, [bgAspect]);

  const handlePointerUp = useCallback(() => {
    panStartRef.current = null;
  }, []);

  const { data: petsData } = useQuery<{ username: string; pets: HousePet[] }>({
    queryKey: ["/api/users", user.id, "pets"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/pets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const pets = petsData?.pets ?? [];

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen-frame overflow-hidden"
      style={{ maxWidth: "768px", margin: "0 auto", touchAction: "none", cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Pannable background */}
      <img
        src={bgUrl}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: `${panX}px`,
          height: "100%",
          width: "auto",
          maxWidth: "none",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />

      {/* Ambient gradients */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 18%, transparent 72%, rgba(0,0,0,0.45) 100%)" }} />

      {/* Bundle buildings layer — moves with background */}
      {imgWidth > 0 && activeBundle?.buildings && activeBundle.buildings.length > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{ zIndex: 4, top: 0, left: `${panX}px`, width: imgWidth, height: "100%" }}
        >
          {activeBundle.buildings.map((b) => (
            <div
              key={b.id}
              className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
              style={{
                left: `${b.posX}%`,
                top: `${b.posY}%`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <img
                src={b.imageUrl}
                alt={b.name}
                draggable={false}
                style={{
                  width:  Math.round((b.width ?? 80) * (containerH || BUILDING_REF_H) / BUILDING_REF_H),
                  height: Math.round((b.width ?? 80) * (containerH || BUILDING_REF_H) / BUILDING_REF_H),
                  objectFit: "contain",
                  filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.7))",
                  transform: b.flippedX ? "scaleX(-1)" : undefined,
                }}
              />
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: "rgba(0,0,0,0.65)", color: "#fff", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
              >
                {b.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pets layer — moves with background, clipped to background bounds */}
      {imgWidth > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{ zIndex: 5, top: 0, left: `${panX}px`, width: imgWidth, height: "100%", overflow: "hidden" }}
        >
          {pets.map((pet, i) => (
            <WalkingPetView key={pet.inventoryId} pet={pet} index={i} />
          ))}
        </div>
      )}

      {/* TopBar */}
      <div className="absolute inset-0 flex flex-col" style={{ zIndex: 10, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />
        </div>
      </div>

      {/* Bottom inventory bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex justify-center gap-6 pb-5 pt-3"
        style={{ zIndex: 15, pointerEvents: "auto", background: "linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          data-testid="button-home-inventory"
          onClick={() => setOpenInventory(openInventory === "home" ? null : "home")}
          className="flex flex-col items-center gap-1 group"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90"
            style={{
              background: openInventory === "home" ? "rgba(120,200,100,0.35)" : "rgba(0,0,0,0.45)",
              border: openInventory === "home" ? "2px solid rgba(120,220,80,0.8)" : "2px solid rgba(255,255,255,0.2)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              backdropFilter: "blur(6px)",
            }}
          >
            <img src={homeInventoryIcon} alt="Home Inventory" className="w-12 h-12 object-contain" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-md" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            Home
          </span>
        </button>

        <button
          data-testid="button-decor-inventory"
          onClick={() => setOpenInventory(openInventory === "decor" ? null : "decor")}
          className="flex flex-col items-center gap-1 group"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90"
            style={{
              background: openInventory === "decor" ? "rgba(180,120,220,0.35)" : "rgba(0,0,0,0.45)",
              border: openInventory === "decor" ? "2px solid rgba(200,120,255,0.8)" : "2px solid rgba(255,255,255,0.2)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              backdropFilter: "blur(6px)",
            }}
          >
            <img src={decorInventoryIcon} alt="Decor Inventory" className="w-12 h-12 object-contain" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-md" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            Decor
          </span>
        </button>
      </div>

      {/* Inventory overlay panels */}
      {openInventory && (
        <div
          className="absolute inset-0 flex flex-col justify-end"
          style={{ zIndex: 20, pointerEvents: "none" }}
        >
          {/* Tap-outside to close */}
          <div
            className="absolute inset-0"
            style={{ pointerEvents: "auto" }}
            onPointerDown={(e) => { e.stopPropagation(); setOpenInventory(null); }}
          />

          {/* Panel */}
          <div
            className="relative rounded-t-3xl px-5 pt-5 pb-28"
            style={{
              pointerEvents: "auto",
              background: "linear-gradient(180deg, rgba(20,30,20,0.97) 0%, rgba(10,18,10,0.99) 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
              minHeight: 280,
              maxHeight: "70vh",
              overflowY: "auto",
            }}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <img
                src={openInventory === "home" ? homeInventoryIcon : decorInventoryIcon}
                alt=""
                className="w-10 h-10 object-contain"
              />
              <div>
                <h2 className="text-white font-bold text-lg leading-tight">
                  {openInventory === "home" ? "Home Inventory" : "Decor Inventory"}
                </h2>
                <p className="text-white/50 text-xs">
                  {openInventory === "home"
                    ? "House bundles you own"
                    : "Home decorations you own"}
                </p>
              </div>
            </div>

            {openInventory === "home" ? (
              <div className="flex flex-col gap-3">
                {/* Active bundle info */}
                {activeBundle && (
                  <div
                    className="rounded-2xl p-3 flex items-center gap-3 mb-1"
                    style={{ background: "rgba(120,220,80,0.12)", border: "1.5px solid rgba(120,220,80,0.4)" }}
                  >
                    <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                    <span className="text-green-300 text-xs font-semibold flex-1">Active: {activeBundle.name}</span>
                    <button
                      data-testid="button-deactivate-bundle"
                      onClick={() => deactivateMutation.mutate()}
                      disabled={deactivateMutation.isPending}
                      className="text-xs px-2 py-1 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
                    >
                      Reset
                    </button>
                  </div>
                )}

                {ownedBundles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <span className="text-4xl">🏡</span>
                    <p className="text-white/40 text-sm text-center">No house bundles owned yet.{"\n"}Visit a shop to purchase one!</p>
                  </div>
                ) : (
                  ownedBundles.map(({ bundleId, bundle }) => {
                    const isActive = activeBundle?.id === bundleId;
                    return (
                      <div
                        key={bundleId}
                        data-testid={`bundle-item-${bundleId}`}
                        className="rounded-2xl p-3 flex items-center gap-3"
                        style={{
                          background: isActive ? "rgba(120,220,80,0.1)" : "rgba(255,255,255,0.05)",
                          border: isActive ? "1.5px solid rgba(120,220,80,0.35)" : "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        {bundle.shopImageUrl ? (
                          <img
                            src={bundle.shopImageUrl}
                            alt={bundle.name}
                            className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl"
                            style={{ background: "rgba(255,255,255,0.07)" }}
                          >🏡</div>
                        )}
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <span className="text-white font-bold text-sm truncate">{bundle.name}</span>
                          <span className="text-green-400 text-xs font-semibold">Owned</span>
                        </div>
                        {isActive ? (
                          <span className="text-green-400 text-xs font-bold flex-shrink-0">✓ Active</span>
                        ) : (
                          <button
                            data-testid={`button-activate-bundle-${bundleId}`}
                            onClick={() => activateMutation.mutate(bundleId)}
                            disabled={activateMutation.isPending}
                            className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-opacity disabled:opacity-50"
                            style={{ background: "rgba(120,220,80,0.25)", color: "#86efac", border: "1px solid rgba(120,220,80,0.4)" }}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <span className="text-4xl">🪴</span>
                <p className="text-white/40 text-sm text-center">
                  No decor items yet.{"\n"}Visit the shop to find some!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(u) => setCurrentUser(u)}
        />
      )}
    </div>
  );
}
