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
  const [turnAngle, setTurnAngle] = useState(0);
  const [turnTransition, setTurnTransition] = useState("transform 240ms cubic-bezier(.22,.8,.2,1)");
  const turnGestureRef = useRef<{ pointerId: number; startX: number; startedAt: number; width: number } | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const longDescription = card.secondDescription || card.description || "No description yet.";

  useEffect(() => () => {
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
  }, []);

  const beginTurn = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (descriptionOpen) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    turnGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startedAt: performance.now(),
      width: Math.max(bounds.width, 1),
    };
    setTurnTransition("none");
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveTurn = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = turnGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    if (Math.abs(dx) > 6) event.preventDefault();
    const angle = Math.max(-34, Math.min(34, (dx / gesture.width) * 72));
    setTurnAngle(angle);
  };

  const finishTurn = (event: ReactPointerEvent<HTMLDivElement>, allowReveal: boolean) => {
    const gesture = turnGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = Math.abs(dx) / elapsed;
    const quickSwipe = allowReveal && Math.abs(dx) >= gesture.width * 0.12 && velocity >= 0.45;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    turnGestureRef.current = null;

    if (quickSwipe) {
      const direction = dx < 0 ? -1 : 1;
      setTurnTransition("transform 130ms ease-out");
      setTurnAngle(direction * 28);
      if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = window.setTimeout(() => {
        setDescriptionOpen(true);
        setTurnTransition("transform 260ms cubic-bezier(.2,.8,.2,1)");
        setTurnAngle(0);
        revealTimerRef.current = null;
      }, 140);
      return;
    }

    setTurnTransition("transform 260ms cubic-bezier(.2,.8,.2,1)");
    setTurnAngle(0);
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
                perspective: "1200px",
                touchAction: "pan-y",
                cursor: "grab",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <div
                style={{
                  transform: `rotateY(${turnAngle}deg)`,
                  transformStyle: "preserve-3d",
                  transition: turnTransition,
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
                />
              </div>
            </div>
            <CardRewardCoin cardName={card.name} claimed={card.firstRewardClaimed} claiming={claiming} disabled={claiming}
              rewardAmount={rewardAmount} onClaim={onClaim} onDismiss={onDismissReward} />
          </div>
          <p className="mt-3 text-center text-sm text-amber-100/70">Drag left or right to turn the card. Swipe quickly to read more.</p>
          <p className="mt-2 text-center text-sm">Owned: ×{card.quantity}</p>
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
