import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import CardPreview from "@/components/CardPreview";
import CardRewardCoin from "@/components/CardRewardCoin";
import { getCardBorderLayout, type CardBorderLayout, type OwnedCard } from "@/lib/cardCatalog";

export default function CardDetailDialog({ card, layouts, onClose, onClaim, claiming, rewardAmount, onDismissReward }: {
  card: OwnedCard; layouts: CardBorderLayout[]; onClose: () => void;
  onClaim: () => void; claiming: boolean;
  rewardAmount?: number; onDismissReward: () => void;
}) {
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const turnCardRef = useRef<HTMLDivElement>(null);
  const turnFrameRef = useRef<number | null>(null);
  const angleRef = useRef(0);
  const turnGestureRef = useRef<{ pointerId: number; startX: number; startedAt: number; width: number } | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const longDescription = card.secondDescription || card.description || "No description yet.";

  useEffect(() => () => {
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
    if (turnFrameRef.current !== null) window.cancelAnimationFrame(turnFrameRef.current);
  }, []);

  // Move the card once per display frame without rerendering its artwork on every pointer event.
  const queueTurn = (angle: number) => {
    angleRef.current = angle;
    if (turnFrameRef.current !== null) return;
    turnFrameRef.current = window.requestAnimationFrame(() => {
      turnFrameRef.current = null;
      if (turnCardRef.current) turnCardRef.current.style.transform = `rotateY(${angleRef.current}deg)`;
    });
  };

  const setTurnTransition = (transition: string) => {
    if (turnCardRef.current) turnCardRef.current.style.transition = transition;
  };

  const beginTurn = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (descriptionOpen || turnGestureRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    turnGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startedAt: performance.now(),
      width: Math.max(bounds.width, 1),
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
    queueTurn(Math.max(-58, Math.min(58, (dx / gesture.width) * 160)));
  };

  const finishTurn = (event: ReactPointerEvent<HTMLDivElement>, allowReveal: boolean) => {
    const gesture = turnGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = Math.abs(dx) / elapsed;
    const quickSwipe = allowReveal && Math.abs(dx) >= gesture.width * 0.1 && velocity >= 0.35;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.style.cursor = "grab";
    turnGestureRef.current = null;

    if (quickSwipe) {
      const direction = dx < 0 ? -1 : 1;
      setTurnTransition("transform 150ms ease-out");
      queueTurn(direction * 46);
      if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = window.setTimeout(() => {
        setDescriptionOpen(true);
        setTurnTransition("transform 260ms cubic-bezier(.2,.8,.2,1)");
        queueTurn(0);
        revealTimerRef.current = null;
      }, 160);
      return;
    }

    setTurnTransition("transform 300ms cubic-bezier(.2,.8,.2,1)");
    queueTurn(0);
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
              aria-label={`Turn ${card.name} card. Swipe quickly left or right to read the full description.`}
              onPointerDown={beginTurn}
              onPointerMove={moveTurn}
              onPointerUp={(event) => finishTurn(event, true)}
              onPointerCancel={(event) => finishTurn(event, false)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setDescriptionOpen(true);
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
                  transform: "rotateY(0deg)",
                  transformStyle: "preserve-3d",
                  transition: "transform 240ms cubic-bezier(.22,.8,.2,1)",
                  willChange: "transform",
                }}
              >
                <CardPreview
                  textSize="detail"
                  rarity={card.rarity}
                  artworkUrl={card.artworkUrl}
                  name={card.name}
                  description={card.description}
                  layout={getCardBorderLayout(layouts, card.rarity)}
                  depth3d
                  showSparkles
                />
              </div>
            </div>
            <CardRewardCoin cardName={card.name} claimed={card.firstRewardClaimed} claiming={claiming} disabled={claiming}
              rewardAmount={rewardAmount} onClaim={onClaim} onDismiss={onDismissReward} />
          </div>
          <p className="mt-3 text-center text-sm">Owned: ×{card.quantity}</p>
        </div>
        <Dialog.Root open={descriptionOpen} onOpenChange={setDescriptionOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[100002] bg-black/80" />
            <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[100003] flex max-h-[80dvh] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-amber-200/50 bg-[#102419] p-5 text-amber-50 shadow-2xl">
              <Dialog.Title className="pr-10 font-fantasy text-lg">{card.name}</Dialog.Title>
              <Dialog.Close aria-label="Close full description" className="absolute right-2 top-2 grid h-11 w-11 place-items-center"><X /></Dialog.Close>
              <div className="mt-4 overflow-y-auto whitespace-pre-wrap break-words text-base leading-relaxed" data-testid="card-full-description">{longDescription}</div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
