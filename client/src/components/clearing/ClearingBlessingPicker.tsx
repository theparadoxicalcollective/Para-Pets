import * as Dialog from "@radix-ui/react-dialog";
import { CLEARING_BLESSINGS, type ClearingBlessingId } from "@shared/clearingBlessings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (id: ClearingBlessingId) => void;
  pending: boolean;
  error: string | null;
  hasSpecial: boolean;
  container: HTMLElement | null;
}

export default function ClearingBlessingPicker({ open, onOpenChange, onChoose, pending, error, hasSpecial, container }: Props) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal container={container}>
      <Dialog.Overlay className="absolute inset-0 z-40 bg-black/65 pointer-events-auto" />
      <Dialog.Content data-interactive className="absolute left-1/2 top-1/2 z-50 max-h-[80dvh] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-amber-300/60 bg-emerald-950 p-4 text-amber-100 shadow-2xl pointer-events-auto" onPointerDown={event => event.stopPropagation()} onInteractOutside={event => event.preventDefault()}>
        <Dialog.Title className="font-fantasy text-xl">A gift from the bayou</Dialog.Title>
        <Dialog.Description className="mt-2 text-xs leading-relaxed text-emerald-100/80">Choose one blessing for this hunt, through the boss fight. Combat is paused while you choose. Ground drops still expire.</Dialog.Description>
        <div className="mt-4 grid gap-2">
          {(Object.keys(CLEARING_BLESSINGS) as ClearingBlessingId[]).map(id => <button key={id} type="button" disabled={pending || (id === "wisplight" && !hasSpecial)} className="min-h-16 rounded-xl border border-amber-300/35 bg-black/20 px-3 py-2 text-left hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50" onClick={() => onChoose(id)}>
            <span className="block text-sm font-bold">{CLEARING_BLESSINGS[id].name}</span>
            <span className="mt-1 block text-xs text-emerald-100/80">{id === "wisplight" && !hasSpecial ? "Requires a pet with a special skill." : CLEARING_BLESSINGS[id].description}</span>
          </button>)}
        </div>
        {pending && <p role="status" className="mt-3 text-xs">Receiving blessing…</p>}
        {error && <p role="alert" className="mt-3 text-xs text-red-200">{error}</p>}
        <Dialog.Close asChild><button type="button" className="mt-3 min-h-11 w-full rounded-xl border border-amber-300/25 text-sm">Choose later</button></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
