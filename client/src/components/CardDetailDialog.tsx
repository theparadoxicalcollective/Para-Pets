import { useState } from "react";
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
  const longDescription = card.secondDescription || card.description || "No description yet.";
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100000] bg-black/90" />
      <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-[100001] flex flex-col items-center overflow-y-auto bg-[#06150d] px-4 pb-6 text-[#f6df9e]"
        style={{ paddingTop: "max(56px, calc(env(safe-area-inset-top) + 44px))", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        <Dialog.Title className="sr-only">{card.name}</Dialog.Title>
        <Dialog.Close aria-label="Close card viewer" className="absolute right-4 grid h-11 w-11 place-items-center rounded-full border border-amber-200/40 bg-black/50" style={{ top: "max(8px, env(safe-area-inset-top))" }}><X /></Dialog.Close>
        <div className="my-auto w-full max-w-[430px]">
          <div className="relative mb-8">
          <CardPreview textSize="detail" rarity={card.rarity} artworkUrl={card.artworkUrl} name={card.name} description={card.description}
            layout={getCardBorderLayout(layouts, card.rarity)} onDescriptionClick={() => setDescriptionOpen(true)} />
          <CardRewardCoin cardName={card.name} claimed={card.firstRewardClaimed} claiming={claiming} disabled={claiming}
            rewardAmount={rewardAmount} onClaim={onClaim} onDismiss={onDismissReward} />
          </div>
          <p className="mt-3 text-center text-sm text-amber-100/70">Tap the description on the card to read more.</p>
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
