import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import CardFittedText from "@/components/CardFittedText";
import CardPreview from "@/components/CardPreview";
import CardRewardCoin from "@/components/CardRewardCoin";
import {
  CARD_BACK_SURFACE_COLORS,
  CARD_BORDER_ASSETS,
  CARD_TITLE_COLORS,
  getCardBorderLayout,
  type CardBorderLayout,
  type OwnedCard,
} from "@/lib/cardCatalog";

export default function CardDetailDialog({ card, layouts, onClose, onClaim, claiming, rewardAmount, onDismissReward }: {
  card: OwnedCard; layouts: CardBorderLayout[]; onClose: () => void;
  onClaim: () => void; claiming: boolean;
  rewardAmount?: number; onDismissReward: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const turnCardRef = useRef<HTMLDivElement>(null);
  const turnFrameRef = useRef<number | null>(null);
  const angleRef = useRef(0);
  const settledAngleRef = useRef(0);
  const turnAnimatingRef = useRef(false);
  const turnGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startedAt: number;
    width: number;
    baseAngle: number;
  } | null>(null);

  const layout = getCardBorderLayout(layouts, card.rarity);
  const longDescription = card.secondDescription || card.description || "No description yet.";
  const backTitleYNudge = card.rarity === 2 ? .75 : card.rarity === 3 ? .9 : 0;
  const backTitleFontSize = `clamp(16px, ${layout.nameFontSize / 240 * 100}cqw, 22px)`;

  useEffect(() => () => {
    if (turnFrameRef.current !== null) window.cancelAnimationFrame(turnFrameRef.current);
  }, []);

  // Update the physical turn at most once per display frame. The front CardPreview
  // keeps its own translated Z layers while this wrapper performs the whole-card turn.
  const queueTurn = (angle: number) => {
    angleRef.current = angle;
    if (turnFrameRef.current !== null) return;
    turnFrameRef.current = window.requestAnimationFrame(() => {
      turnFrameRef.current = null;
      const turn = turnCardRef.current;
      if (!turn) return;

      const nearestFace = Math.round(angleRef.current / 180) * 180;
      const localAngle = angleRef.current - nearestFace;
      const intensity = Math.min(1, Math.abs(localAngle) / 70);
      turn.style.transform = `rotateY(${angleRef.current}deg)`;
      turn.style.setProperty("--card-turn-intensity", String(intensity));
      turn.style.setProperty("--card-turn-opacity", String(intensity * .9));
      turn.style.setProperty(
        "--card-turn-position",
        `${intensity > 0 ? Math.max(0, Math.min(100, 50 + localAngle * .72)) : 0}%`,
      );
    });
  };

  const animateTurnTo = (targetAngle: number) => {
    settledAngleRef.current = targetAngle;
    turnAnimatingRef.current = true;
    if (turnCardRef.current) {
      turnCardRef.current.style.transition = "transform 420ms cubic-bezier(.2,.72,.16,1)";
    }
    queueTurn(targetAngle);
  };

  const flipByDirection = (direction: -1 | 1) => {
    if (turnAnimatingRef.current) return;
    setFlipped((current) => !current);
    animateTurnTo(settledAngleRef.current + direction * 180);
  };

  const beginTurn = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      turnAnimatingRef.current
      || turnGestureRef.current
      || (event.pointerType === "mouse" && event.button !== 0)
    ) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    turnGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startedAt: performance.now(),
      width: Math.max(bounds.width, 1),
      baseAngle: settledAngleRef.current,
    };
    if (turnCardRef.current) turnCardRef.current.style.transition = "none";
    event.currentTarget.style.cursor = "grabbing";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveTurn = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = turnGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dx = event.clientX - gesture.startX;
    if (Math.abs(dx) > 6) event.preventDefault();

    // Let a deliberate drag visibly travel most/all of the way to the next face.
    const previewTurn = Math.max(-180, Math.min(180, (dx / gesture.width) * 220));
    queueTurn(gesture.baseAngle + previewTurn);
  };

  const finishTurn = (event: ReactPointerEvent<HTMLDivElement>, allowFlip: boolean) => {
    const gesture = turnGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dx = event.clientX - gesture.startX;
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = Math.abs(dx) / elapsed;
    const deliberateDrag = Math.abs(dx) >= gesture.width * .22;
    const quickSwipe = Math.abs(dx) >= gesture.width * .08 && velocity >= .32;
    const shouldFlip = allowFlip && (deliberateDrag || quickSwipe);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.style.cursor = "grab";
    turnGestureRef.current = null;

    if (shouldFlip) {
      const direction: -1 | 1 = dx < 0 ? -1 : 1;
      setFlipped((current) => !current);
      animateTurnTo(gesture.baseAngle + direction * 180);
      return;
    }

    // A short/aborted drag returns smoothly to the exact face angle it started from.
    animateTurnTo(gesture.baseAngle);
  };

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100000] bg-black/90" />
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed inset-0 z-[100001] flex flex-col items-center overflow-y-auto bg-[#06150d] px-4 pb-6 text-[#f6df9e]"
        style={{ paddingTop: "max(56px, calc(env(safe-area-inset-top) + 44px))", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        {card.artworkUrl && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0"
            style={{
              backgroundImage: `linear-gradient(rgba(3,13,8,.70), rgba(3,13,8,.82)), url("${card.artworkUrl.replace(/["\\]/g, "")}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        <Dialog.Title className="sr-only">{card.name}</Dialog.Title>
        <Dialog.Close
          aria-label="Close card viewer"
          className="absolute right-4 z-10 grid h-11 w-11 place-items-center rounded-full border border-amber-200/40 bg-black/50"
          style={{ top: "max(8px, env(safe-area-inset-top))" }}
        >
          <X />
        </Dialog.Close>

        <div className="relative my-auto w-full max-w-[430px]">
          <div className="relative mb-8">
            <div
              data-testid="card-turn-surface"
              role="button"
              tabIndex={0}
              aria-label={`Turn ${card.name} card. Drag or swipe left or right to flip between the artwork and description.`}
              onPointerDown={beginTurn}
              onPointerMove={moveTurn}
              onPointerUp={(event) => finishTurn(event, true)}
              onPointerCancel={(event) => finishTurn(event, false)}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && !turnAnimatingRef.current) {
                  event.preventDefault();
                  flipByDirection(1);
                }
              }}
              className="outline-none"
              style={{
                perspective: "850px",
                perspectiveOrigin: "50% 48%",
                userSelect: "none",
                touchAction: "pan-y",
                cursor: "grab",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <div
                ref={turnCardRef}
                onTransitionEnd={(event) => {
                  if (event.propertyName === "transform") turnAnimatingRef.current = false;
                }}
                style={{
                  position: "relative",
                  transform: "rotateY(0deg)",
                  transformStyle: "preserve-3d",
                  transition: "none",
                  willChange: "transform",
                }}
              >
                <div
                  data-testid="card-front-face"
                  aria-hidden={flipped}
                  style={{
                    position: "relative",
                    transformStyle: "preserve-3d",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                >
                  <CardPreview
                    textSize="detail"
                    rarity={card.rarity}
                    artworkUrl={card.artworkUrl}
                    effectColor={card.effectColor}
                    specialEffect={card.specialEffect}
                    label={card.label}
                    name={card.name}
                    layout={layout}
                    depth3d
                    showSparkles
                  />
                </div>

                <div
                  data-testid="card-back-face"
                  aria-hidden={!flipped}
                  style={{
                    position: "absolute",
                    inset: 0,
                    containerType: "inline-size",
                    transform: "rotateY(180deg)",
                    transformStyle: "flat",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    overflow: "hidden",
                    filter: "drop-shadow(0 8px 12px rgba(0,0,0,.48))",
                  }}
                >
                  <div
                    data-testid="card-back-surface"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: "10.5% 9.5% 9.5%",
                      borderRadius: "7% / 5%",
                      background: CARD_BACK_SURFACE_COLORS[card.rarity],
                      boxShadow: "inset 0 0 26px rgba(120,76,24,.13)",
                    }}
                  />
                  <img
                    src={CARD_BORDER_ASSETS[card.rarity]}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 2,
                      width: "100%",
                      height: "100%",
                      objectFit: "fill",
                      pointerEvents: "none",
                    }}
                  />

                  <div
                    data-testid="card-back-title"
                    style={{
                      position: "absolute",
                      left: `${layout.nameX}%`,
                      top: `${layout.nameY + backTitleYNudge}%`,
                      width: `${layout.nameWidth}%`,
                      height: `${layout.nameHeight}%`,
                      zIndex: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "1% 3%",
                      boxSizing: "border-box",
                      overflow: (layout.nameCurve ?? 0) > 0 ? "visible" : "hidden",
                      color: CARD_TITLE_COLORS[card.rarity],
                      fontFamily: "'Cinzel', 'Palatino Linotype', serif",
                      fontWeight: 700,
                      fontSize: backTitleFontSize,
                      lineHeight: 1.05,
                      letterSpacing: ".05em",
                      textAlign: "center",
                      textShadow: "0 1px 0 rgba(255,255,255,.58), 0 0 2px rgba(255,244,205,.28)",
                      pointerEvents: "none",
                    }}
                  >
                    <CardFittedText
                      text={card.name}
                      preferredFontSize={backTitleFontSize}
                      minimumFontSize={14}
                      curve={layout.nameCurve ?? 0}
                    />
                  </div>

                  <div
                    data-testid="card-back-description"
                    style={{
                      position: "absolute",
                      inset: "23% 17% 19%",
                      zIndex: 3,
                      overflowY: "auto",
                      overscrollBehavior: "contain",
                      WebkitOverflowScrolling: "touch",
                      padding: "1% 1.5%",
                      color: CARD_TITLE_COLORS[card.rarity],
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: "clamp(10.5px, 3cqw, 14.5px)",
                      lineHeight: 1.4,
                      textAlign: "center",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      textShadow: "0 1px 0 rgba(255,255,255,.52)",
                      scrollbarWidth: "thin",
                    }}
                  >
                    {longDescription}
                  </div>
                </div>
              </div>
            </div>

            <CardRewardCoin
              cardName={card.name}
              claimed={card.firstRewardClaimed}
              claiming={claiming}
              disabled={claiming}
              rewardAmount={rewardAmount}
              onClaim={onClaim}
              onDismiss={onDismissReward}
            />
          </div>
          <p className="mt-3 text-center text-sm">Owned: ×{card.quantity}</p>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
