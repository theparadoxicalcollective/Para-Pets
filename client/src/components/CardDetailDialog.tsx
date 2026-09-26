import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
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
  const turnGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startedAt: number;
    width: number;
    baseAngle: number;
  } | null>(null);
  const longDescription = card.secondDescription || card.description || "No description yet.";

  useEffect(() => () => {
    if (turnFrameRef.current !== null) window.cancelAnimationFrame(turnFrameRef.current);
  }, []);

  // Move the card once per display frame without rerendering its artwork on every pointer event.
  const queueTurn = (angle: number) => {
    angleRef.current = angle;
    if (turnFrameRef.current !== null) return;
    turnFrameRef.current = window.requestAnimationFrame(() => {
      turnFrameRef.current = null;
      if (turnCardRef.current) {
        const turn = turnCardRef.current;
        const nearestFace = Math.round(angleRef.current / 180) * 180;
        const localAngle = angleRef.current - nearestFace;
        const intensity = Math.min(1, Math.abs(localAngle) / 58);
        turn.style.transform = `rotateY(${angleRef.current}deg)`;
        turn.style.setProperty("--card-turn-intensity", String(intensity));
        turn.style.setProperty("--card-turn-opacity", String(intensity * .9));
        turn.style.setProperty("--card-turn-position", `${intensity > 0 ? Math.max(0, Math.min(100, 50 + localAngle * .85)) : 0}%`);
      }
    });
  };

  const setTurnTransition = (transition: string) => {
    if (turnCardRef.current) turnCardRef.current.style.transition = transition;
  };

  const flipCard = (direction = 1) => {
    const nextFlipped = !flipped;
    setFlipped(nextFlipped);
    setTurnTransition("transform 380ms cubic-bezier(.2,.78,.2,1)");
    queueTurn(nextFlipped ? direction * 180 : 0);
  };

  const beginTurn = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (turnGestureRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    turnGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startedAt: performance.now(),
      width: Math.max(bounds.width, 1),
      baseAngle: flipped ? 180 : 0,
    };
    setTurnTransition("none");
    event.currentTarget.style.cursor = "grabbing";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveTurn = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = turnGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    if (Math.abs(dx) > 6) event.preventDefault();
    const previewTurn = Math.max(-58, Math.min(58, (dx / gesture.width) * 160));
    queueTurn(gesture.baseAngle + previewTurn);
  };

  const finishTurn = (event: ReactPointerEvent<HTMLDivElement>, allowFlip: boolean) => {
    const gesture = turnGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = Math.abs(dx) / elapsed;
    const quickSwipe = allowFlip && Math.abs(dx) >= gesture.width * 0.1 && velocity >= 0.35;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.style.cursor = "grab";
    turnGestureRef.current = null;

    if (quickSwipe) {
      flipCard(dx < 0 ? -1 : 1);
      return;
    }

    setTurnTransition("transform 300ms cubic-bezier(.2,.8,.2,1)");
    queueTurn(flipped ? 180 : 0);
  };

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100000] bg-black/90" />
      <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-[100001] flex flex-col items-center overflow-y-auto bg-[#06150d] px-4 pb-6 text-[#f6df9e]"
        style={{ paddingTop: "max(56px, calc(env(safe-area-inset-top) + 44px))", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        {card.artworkUrl && <div aria-hidden="true" className="pointer-events-none fixed inset-0" style={{ backgroundImage: `linear-gradient(rgba(3,13,8,.70), rgba(3,13,8,.82)), url("${card.artworkUrl.replace(/["\\]/g, "")}")`, backgroundSize: "cover", backgroundPosition: "center" }} />}
        <Dialog.Title className="sr-only">{card.name}</Dialog.Title>
        <Dialog.Close aria-label="Close card viewer" className="absolute right-4 z-10 grid h-11 w-11 place-items-center rounded-full border border-amber-200/40 bg-black/50" style={{ top: "max(8px, env(safe-area-inset-top))" }}><X /></Dialog.Close>

        <div className="relative my-auto w-full max-w-[430px]">
          <div className="relative mb-8">
            <div
              data-testid="card-turn-surface"
              role="button"
              tabIndex={0}
              aria-label={`Turn ${card.name} card. Swipe quickly left or right to flip between the artwork and description.`}
              onPointerDown={beginTurn}
              onPointerMove={moveTurn}
              onPointerUp={(event) => finishTurn(event, true)}
              onPointerCancel={(event) => finishTurn(event, false)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  flipCard(1);
                }
              }}
              className="outline-none"
              style={{
                perspective: "750px",
                userSelect: "none",
                touchAction: "pan-y",
                cursor: "grab",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <div
                ref={turnCardRef}
                style={{
                  position: "relative",
                  transform: "rotateY(0deg)",
                  transformStyle: "preserve-3d",
                  transition: "transform 240ms cubic-bezier(.22,.8,.2,1)",
                  willChange: "transform",
                }}
              >
                <div
                  data-testid="card-front-face"
                  style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
                >
                  <CardPreview
                    textSize="detail"
                    rarity={card.rarity}
                    artworkUrl={card.artworkUrl}
                    effectColor={card.effectColor}
                    specialEffect={card.specialEffect}
                    label={card.label}
                    name={card.name}
                    layout={getCardBorderLayout(layouts, card.rarity)}
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
                    transform: "rotateY(180deg)",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    overflow: "hidden",
                    filter: "drop-shadow(0 8px 12px rgba(0,0,0,.48))",
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: "4.5% 4.5%",
                      borderRadius: "8% / 5%",
                      background: `linear-gradient(145deg, ${CARD_BACK_SURFACE_COLORS[card.rarity]}, color-mix(in srgb, ${CARD_BACK_SURFACE_COLORS[card.rarity]} 88%, #cfae75 12%))`,
                      boxShadow: "inset 0 0 30px rgba(120,76,24,.12)",
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
                      width: "100%",
                      height: "100%",
                      objectFit: "fill",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    data-testid="card-back-description"
                    style={{
                      position: "absolute",
                      inset: "18% 14% 15%",
                      zIndex: 2,
                      overflowY: "auto",
                      padding: "4% 3%",
                      color: CARD_TITLE_COLORS[card.rarity],
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: "clamp(12px, 3.55cqw, 17px)",
                      lineHeight: 1.48,
                      textAlign: "center",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      textShadow: "0 1px 0 rgba(255,255,255,.5)",
                      scrollbarWidth: "thin",
                    }}
                  >
                    {longDescription}
                  </div>
                </div>
              </div>
            </div>

            <CardRewardCoin cardName={card.name} claimed={card.firstRewardClaimed} claiming={claiming} disabled={claiming}
              rewardAmount={rewardAmount} onClaim={onClaim} onDismiss={onDismissReward} />
          </div>
          <p className="mt-3 text-center text-sm">Owned: ×{card.quantity}</p>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
