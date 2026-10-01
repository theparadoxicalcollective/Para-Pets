import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import coinIconImg from "@assets/icon_coin.webp";

const mixingTreeCauldronImg = "/mixing-tree-cauldron.png";
const recipeScrollIcon = "/recipe-scroll-icon.png";

export interface CauldronInventoryItem {
  inventoryId: string;
  name: string;
  type: string;
  quantity?: number;
  imageUrl?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CauldronOverlay — the bayou cauldron decoration shown inside the Mixing
// Tree's interior view. Players see it as a clickable scene element that
// opens the ingredient panel. Admins additionally get a drag handle (move
// the whole cauldron around the scene) and a corner resize grip (change
// its size). Position + size are persisted server-side so changes are
// shared by everyone and survive restarts.
// ─────────────────────────────────────────────────────────────────────────────
export function CauldronOverlay({
  isAdmin, x, y, size, onCommit, onClick,
  isOpen, dragOver, onDragOver, onDragLeave, onDrop, zoneRef, unlockAnimating,
}: {
  isAdmin: boolean;
  x: number;
  y: number;
  size: number;
  onCommit: (layout: { x: number; y: number; size: number }) => void;
  onClick: () => void;
  isOpen?: boolean;
  dragOver?: boolean;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  zoneRef?: React.RefObject<HTMLDivElement | null>;
  unlockAnimating?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; size: number } | null>(null);
  const dragStateRef = useRef<{
    mode: "move" | "resize";
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startSize: number;
    parentRect: DOMRect;
  } | null>(null);

  const cur = draft ?? { x, y, size };

  const beginDrag = (mode: "move" | "resize", e: React.PointerEvent) => {
    if (!isAdmin) return;
    const parent = wrapRef.current?.parentElement;
    if (!parent) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: cur.x,
      startY: cur.y,
      startSize: cur.size,
      parentRect: parent.getBoundingClientRect(),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragStateRef.current;
    if (!s) return;
    const dxPct = ((e.clientX - s.startClientX) / s.parentRect.width) * 100;
    const dyPct = ((e.clientY - s.startClientY) / s.parentRect.height) * 100;
    if (s.mode === "move") {
      setDraft({
        x: Math.max(0, Math.min(100, s.startX + dxPct)),
        y: Math.max(0, Math.min(100, s.startY - dyPct)), // y is from bottom
        size: s.startSize,
      });
    } else {
      setDraft({
        x: s.startX,
        y: s.startY,
        size: Math.max(10, Math.min(90, s.startSize + dxPct)),
      });
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const s = dragStateRef.current;
    if (!s) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    dragStateRef.current = null;
    if (draft) {
      onCommit(draft);
      // keep the draft until the parent re-renders with the new server value;
      // clearing here briefly causes a flicker if the query hasn't updated.
      setTimeout(() => setDraft(null), 0);
    }
  };

  return (
    <div
      ref={(node) => {
        (wrapRef as any).current = node;
        if (zoneRef) (zoneRef as any).current = node;
      }}
      className="absolute"
      style={{
        left: `${cur.x}%`,
        bottom: `${cur.y}%`,
        transform: `translateX(-50%)${isOpen ? " scale(1.2)" : ""}`,
        transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        width: `${cur.size}%`,
        maxWidth: 320,
        zIndex: isOpen ? 25 : 20,
        cursor: isAdmin ? "move" : "pointer",
        touchAction: "none",
      }}
      onPointerDown={(e) => isAdmin && beginDrag("move", e)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(e) => {
        if (isAdmin && draft) return;
        e.stopPropagation();
        onClick();
      }}
      onDragOver={isOpen ? (e) => { e.preventDefault(); onDragOver?.(); } : undefined}
      onDragLeave={isOpen ? () => onDragLeave?.() : undefined}
      onDrop={isOpen ? onDrop : undefined}
      data-testid="cauldron-mixing-tree"
    >
      {/* under-cauldron glow puddle */}
      <div
        className="pointer-events-none"
        style={{
          position: "absolute",
          left: "50%",
          bottom: "-6%",
          transform: "translateX(-50%)",
          width: "92%",
          height: 28,
          borderRadius: "50%",
          background: unlockAnimating
            ? "radial-gradient(ellipse at center, rgba(250,200,60,0.6) 0%, rgba(20,83,75,0.22) 45%, transparent 75%)"
            : dragOver
            ? "radial-gradient(ellipse at center, rgba(94,234,212,0.65) 0%, rgba(20,83,75,0.22) 45%, transparent 75%)"
            : "radial-gradient(ellipse at center, rgba(45,212,191,0.45) 0%, rgba(20,83,75,0.22) 45%, transparent 75%)",
          filter: "blur(7px)",
          transition: "background 150ms ease",
        }}
      />
      <img
        src={mixingTreeCauldronImg}
        alt=""
        className="w-full h-auto block select-none pointer-events-none"
        draggable={false}
        style={{
          filter: unlockAnimating
            ? "drop-shadow(0 0 22px rgba(250,200,60,1)) brightness(1.4)"
            : dragOver
            ? "drop-shadow(0 0 24px rgba(94,234,212,1)) brightness(1.3)"
            : "drop-shadow(0 8px 14px rgba(0,0,0,0.65)) drop-shadow(0 0 12px rgba(45,138,120,0.45))",
          transition: "filter 200ms ease",
        }}
      />
      {isAdmin && (
        <>
          {/* admin outline so the draggable hit-area is visible */}
          <div
            className="absolute inset-0 pointer-events-none rounded-md"
            style={{
              border: "1px dashed rgba(94,234,212,0.55)",
              boxShadow: "inset 0 0 16px rgba(94,234,212,0.18)",
            }}
          />
          {/* resize grip — bottom-right corner */}
          <div
            onPointerDown={(e) => beginDrag("resize", e)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute"
            data-testid="cauldron-resize-handle"
            style={{
              right: -8,
              bottom: -8,
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "linear-gradient(135deg, #2dd4bf 0%, #0f766e 100%)",
              border: "1.5px solid rgba(20,30,30,0.85)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
              cursor: "nwse-resize",
              touchAction: "none",
            }}
          />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CauldronPanel — compact floating bar for the Mixing Tree cauldron. Players
// drag recipe scrolls / ingredients onto the enlarged cauldron image in the
// scene. No modal overlay — the world stays visible.
// ─────────────────────────────────────────────────────────────────────────────
export function CauldronPanel({
  inventory, contents, onAdd, onClear, onClose, isAdding, isClearing,
  onBrew, isBrewing, brewResult, onClearBrewResult,
  brewError, onClearBrewError,
  onUnlockRecipe, isUnlockingRecipe,
  userCoins,
  dropZoneRef,
}: {
  inventory: CauldronInventoryItem[];
  contents: Array<{ shopItemId: string; quantity: number; name: string; imageUrl: string | null }>;
  onAdd: (inventoryId: string) => void;
  onClear: () => void;
  onClose: () => void;
  isAdding: boolean;
  isClearing: boolean;
  onBrew: () => void;
  isBrewing: boolean;
  brewResult: { name: string; imageUrl: string | null; type: string } | null;
  onClearBrewResult: () => void;
  brewError: "incorrect" | "locked" | null;
  onClearBrewError: () => void;
  onUnlockRecipe: (inventoryId: string) => void;
  isUnlockingRecipe: boolean;
  userCoins: number;
  dropZoneRef: React.RefObject<HTMLDivElement | null>;
}) {
  const recipeItems = useMemo(
    () => inventory.filter((i) => i.type === "recipe"),
    [inventory]
  );
  const ingredients = useMemo(
    () => inventory.filter((i) => i.type === "ingredient"),
    [inventory]
  );
  const [dragOver, setDragOver] = useState(false);
  const [unlockAnimating, setUnlockAnimating] = useState(false);
  const { toast } = useToast();
  const [touchGhost, setTouchGhost] = useState<{ inventoryId: string; label: string; imageUrl: string | null; x: number; y: number } | null>(null);
  const touchItemRef = useRef<{ inventoryId: string; itemType: string } | null>(null);

  const CAULDRON_CAPACITY = 2;
  const totalInCauldron = contents.reduce((n, c) => n + c.quantity, 0);
  const isFull = totalInCauldron >= CAULDRON_CAPACITY;

  const tryAdd = (invId: string) => {
    if (isFull) {
      toast({ title: "Cauldron is full", description: `Only ${CAULDRON_CAPACITY} ingredients at a time. Clear it to brew.` });
      return;
    }
    onAdd(invId);
  };

  const dispatchToCauldron = (invId: string, itemType: string) => {
    if (itemType === "recipe") {
      setUnlockAnimating(true);
      setTimeout(() => setUnlockAnimating(false), 1400);
      onUnlockRecipe(invId);
    } else {
      tryAdd(invId);
    }
  };

  // ── Touch drag (mobile) ─────────────────────────────────────────────────
  const handleItemTouchStart = (e: React.TouchEvent, invId: string, itemType: string) => {
    const touch = e.touches[0];
    const item = inventory.find((i) => i.inventoryId === invId);
    touchItemRef.current = { inventoryId: invId, itemType };
    setTouchGhost({ inventoryId: invId, label: item?.name ?? "", imageUrl: item?.imageUrl ?? null, x: touch.clientX, y: touch.clientY });
  };

  const handleItemTouchMove = (e: React.TouchEvent) => {
    if (!touchItemRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    setTouchGhost((prev) => prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null);
    // Highlight cauldron zone when hovering over it
    const zone = dropZoneRef.current;
    if (zone) {
      const rect = zone.getBoundingClientRect();
      const over = touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom;
      setDragOver(over);
    }
  };

  const handleItemTouchEnd = (e: React.TouchEvent) => {
    const item = touchItemRef.current;
    touchItemRef.current = null;
    setTouchGhost(null);
    setDragOver(false);
    if (!item) return;
    const touch = e.changedTouches[0];
    const zone = dropZoneRef.current;
    if (!zone) return;
    const rect = zone.getBoundingClientRect();
    const overCauldron = touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom;
    if (overCauldron) {
      dispatchToCauldron(item.inventoryId, item.itemType);
    }
  };

  return (
    <>

      {/* Brew error popups — Incorrect Recipe / Find Recipe */}
      {brewError && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-auto" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClearBrewError} />
          <div className="relative z-10 flex flex-col items-center gap-3 rounded-2xl px-8 py-7 pointer-events-auto text-center"
            style={{ background: "linear-gradient(160deg,rgba(28,12,12,.98) 0%,rgba(40,8,8,.98) 100%)", border: `1.5px solid ${brewError === "locked" ? "rgba(250,200,60,.55)" : "rgba(248,80,80,.45)"}`, boxShadow: "0 0 60px rgba(0,0,0,.85)", minWidth: 220, animation: "brewPop .4s cubic-bezier(.34,1.56,.64,1) both" }}
          >
            <div className="text-4xl mb-1">{brewError === "locked" ? "📜" : "💥"}</div>
            <p className="font-fantasy text-lg tracking-wider" style={{ color: brewError === "locked" ? "#fde68a" : "#fca5a5" }}>
              {brewError === "locked" ? "Find Recipe" : "Incorrect Recipe"}
            </p>
            <p className="font-fantasy text-[11px] leading-snug" style={{ color: "#ffffff66", maxWidth: 200 }}>
              {brewError === "locked"
                ? "These ingredients can make something — but you need to find and unlock the recipe scroll first!"
                : "These ingredients don't create anything together. Try a different combination."}
            </p>
            <p className="font-fantasy text-[10px] mt-1" style={{ color: "#ffffff44" }}>Your ingredients were returned.</p>
            <button data-testid="button-brew-error-close" onClick={onClearBrewError}
              className="mt-1 font-fantasy text-xs tracking-wider px-6 py-2 rounded-full active:scale-95 transition-transform"
              style={{ background: brewError === "locked" ? "rgba(250,200,60,.15)" : "rgba(248,80,80,.15)", border: `1px solid ${brewError === "locked" ? "rgba(250,200,60,.45)" : "rgba(248,80,80,.4)"}`, color: brewError === "locked" ? "#fde68a" : "#fca5a5", cursor: "pointer" }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Brew result popup */}
      {brewResult && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-auto" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClearBrewResult} />
          <div className="relative z-10 flex flex-col items-center gap-3 rounded-2xl px-8 py-7 pointer-events-auto"
            style={{ background: "linear-gradient(160deg,rgba(12,28,22,.98) 0%,rgba(8,40,32,.98) 100%)", border: "1.5px solid rgba(94,234,212,.45)", boxShadow: "0 0 60px rgba(0,0,0,.85),0 0 40px rgba(45,212,191,.18)", minWidth: 220, animation: "brewPop .4s cubic-bezier(.34,1.56,.64,1) both" }}
          >
            <p className="font-fantasy text-xs tracking-widest" style={{ color: "#5eead4aa" }}>BREW SUCCESSFUL</p>
            <div className="w-20 h-20 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: "rgba(94,234,212,.1)", border: "1.5px solid rgba(94,234,212,.3)", boxShadow: "0 0 24px rgba(45,212,191,.25)" }}>
              {brewResult.imageUrl ? <img src={brewResult.imageUrl} alt={brewResult.name} className="w-full h-full object-contain" /> : <span className="text-3xl">✨</span>}
            </div>
            <p className="font-fantasy text-base text-center" style={{ color: "#d1faf3" }}>{brewResult.name}</p>
            <p className="font-fantasy text-[10px] text-center" style={{ color: "#5eead4aa" }}>Added to your bag</p>
            <button data-testid="button-brew-result-close" onClick={onClearBrewResult}
              className="mt-1 font-fantasy text-xs tracking-wider px-6 py-2 rounded-full active:scale-95 transition-transform"
              style={{ background: "rgba(94,234,212,.18)", border: "1px solid rgba(94,234,212,.5)", color: "#5eead4", cursor: "pointer" }}>
              Nice!
            </button>
          </div>
        </div>
      )}

      {/* Compact floating items bar — no backdrop, world stays visible */}
      <div className="fixed z-[60] bottom-0 left-0 right-0 pointer-events-none"
        style={{ maxWidth: "768px", margin: "0 auto" }}>
        <div className="pointer-events-auto"
          style={{
            background: "linear-gradient(to top, rgba(10,26,22,.98) 0%, rgba(8,38,30,.96) 100%)",
            borderTop: "1.5px solid rgba(94,234,212,.35)",
            boxShadow: "0 -6px 32px rgba(0,0,0,.65)",
            paddingBottom: "max(env(safe-area-inset-bottom, 0px) + 10px, 12px)",
          }}>

          {/* Row 1: cauldron status + brew/clear + close */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {contents.length === 0 ? (
                <span className="font-fantasy text-[9px]" style={{ color: "#5eead444" }}>↑ Drop items on the cauldron above</span>
              ) : (
                <>
                  {contents.flatMap((c) => Array.from({ length: c.quantity }, (_, i) => (
                    <div key={`${c.shopItemId}-${i}`} title={c.name}
                      className="w-7 h-7 rounded overflow-hidden shrink-0"
                      style={{ background: "rgba(0,0,0,.5)", border: "1.5px solid rgba(94,234,212,.5)" }}>
                      {c.imageUrl && <img src={c.imageUrl} alt="" className="w-full h-full object-contain" />}
                    </div>
                  )))}
                  {isFull && <span className="font-fantasy text-[9px] ml-1 shrink-0" style={{ color: "#5eead4" }}>Ready!</span>}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {isFull && (
                <button data-testid="button-brew-cauldron" onClick={onBrew} disabled={isBrewing || userCoins < 100}
                  className="font-fantasy text-[11px] tracking-wider px-3 py-1 rounded-full disabled:opacity-50 active:scale-95 transition-transform"
                  style={{ background: "linear-gradient(135deg,rgba(94,234,212,.35) 0%,rgba(45,212,191,.22) 100%)", border: "1.5px solid rgba(94,234,212,.75)", color: "#5eead4", cursor: userCoins < 100 ? "not-allowed" : "pointer", boxShadow: "0 0 14px rgba(45,212,191,.4)", whiteSpace: "nowrap" }}>
                  {isBrewing ? "Brewing…" : <span>✨ Brew <span style={{ fontSize: "0.75em", opacity: 0.75, display: "inline-flex", alignItems: "center", gap: 2 }}>(-100 <img src={coinIconImg} alt="" style={{ width: "1em", height: "1em", objectFit: "contain", verticalAlign: "middle" }} />)</span></span>}
                </button>
              )}
              {totalInCauldron > 0 && (
                <button data-testid="button-clear-cauldron" onClick={onClear} disabled={isClearing}
                  className="font-fantasy text-[9px] tracking-wider disabled:opacity-50"
                  style={{ background: "none", border: "none", color: "#fca5a5aa", cursor: "pointer", whiteSpace: "nowrap" }}>
                  Clear
                </button>
              )}
              <button data-testid="button-close-cauldron" onClick={onClose}
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(15,40,38,.9)", border: "1.5px solid rgba(94,234,212,.4)", color: "#5eead4", cursor: "pointer" }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-3 mb-2" style={{ height: 1, background: "rgba(94,234,212,.1)" }} />

          {/* Row 2: horizontal scrollable items */}
          <div className="flex gap-2 overflow-x-auto px-3 pb-1" style={{ scrollbarWidth: "none" }}>
            {recipeItems.map((item) => (
              <div key={item.inventoryId} data-testid={`button-recipe-scroll-${item.inventoryId}`}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", item.inventoryId); }}
                onTouchStart={(e) => handleItemTouchStart(e, item.inventoryId, "recipe")}
                onTouchMove={handleItemTouchMove}
                onTouchEnd={handleItemTouchEnd}
                className="flex flex-col items-center gap-1 p-2 rounded-lg select-none shrink-0"
                style={{ background: "rgba(250,200,60,.07)", border: `1px solid ${touchGhost?.inventoryId === item.inventoryId ? "rgba(250,200,60,.75)" : "rgba(250,200,60,.25)"}`, cursor: "grab", opacity: isUnlockingRecipe ? 0.5 : 1, touchAction: "none", minWidth: 62 }}>
                <div className="w-10 h-10 rounded-md flex items-center justify-center overflow-hidden pointer-events-none"
                  style={{ background: "rgba(0,0,0,.35)" }}>
                  {item.imageUrl
                    ? <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                    : <img src={recipeScrollIcon} alt="" className="w-8 h-8 object-contain opacity-50" />}
                </div>
                <p className="font-fantasy text-[9px] text-center leading-tight pointer-events-none"
                  style={{ color: "#fde68a", maxWidth: 62 }}>{item.name}</p>
              </div>
            ))}
            {ingredients.map((ing) => (
              <div key={ing.inventoryId} data-testid={`div-ingredient-${ing.inventoryId}`}
                draggable={!isFull}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", ing.inventoryId); }}
                onTouchStart={(e) => { if (!isFull) handleItemTouchStart(e, ing.inventoryId, "ingredient"); }}
                onTouchMove={handleItemTouchMove}
                onTouchEnd={handleItemTouchEnd}
                className="flex flex-col items-center gap-1 p-2 rounded-lg select-none shrink-0"
                style={{ background: "rgba(94,234,212,.07)", border: `1px solid ${touchGhost?.inventoryId === ing.inventoryId ? "rgba(94,234,212,.75)" : "rgba(94,234,212,.2)"}`, cursor: isFull ? "not-allowed" : "grab", opacity: isFull ? 0.45 : 1, touchAction: "none", minWidth: 62 }}>
                <div className="w-10 h-10 rounded-md flex items-center justify-center overflow-hidden pointer-events-none"
                  style={{ background: "rgba(0,0,0,.3)" }}>
                  {ing.imageUrl
                    ? <img src={ing.imageUrl} alt="" className="w-full h-full object-contain" />
                    : <span className="text-[10px]" style={{ color: "#5eead455" }}>?</span>}
                </div>
                <p className="font-fantasy text-[9px] text-center leading-tight pointer-events-none"
                  style={{ color: "#d1faf3", maxWidth: 62 }}>{ing.name}</p>
                {(ing.quantity ?? 1) > 1 && (
                  <p className="font-fantasy text-[8px] pointer-events-none" style={{ color: "#5eead4aa" }}>×{ing.quantity}</p>
                )}
              </div>
            ))}
            {recipeItems.length === 0 && ingredients.length === 0 && (
              <p className="font-fantasy text-[10px] py-3 px-1" style={{ color: "#5eead433" }}>
                No items yet. Visit the market to find ingredients!
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Touch drag ghost — floats under finger */}
      {touchGhost && (
        <div className="fixed pointer-events-none z-[100]" style={{ left: touchGhost.x - 35, top: touchGhost.y - 35, width: 70, height: 70, transition: "none" }}>
          <div className="w-full h-full rounded-xl overflow-hidden flex items-center justify-center"
            style={{ background: "rgba(8,30,24,.92)", border: "2px solid rgba(94,234,212,.8)", boxShadow: "0 0 24px rgba(45,212,191,.6)", opacity: 0.92 }}>
            {touchGhost.imageUrl
              ? <img src={touchGhost.imageUrl} alt="" className="w-full h-full object-contain p-1" />
              : <span className="font-fantasy text-xs text-center px-1" style={{ color: "#5eead4" }}>{touchGhost.label}</span>}
          </div>
        </div>
      )}
    </>
  );
}
