import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ClearingEquipmentSlot, ClearingInventoryItem, ClearingLoadoutResponse } from "@shared/clearingEquipment";
import slotBorderUrl from "@assets/uploads/ClearingEquipmentBorder.png";
import popupBackgroundUrl from "@assets/uploads/ClearingEquipPopUp.png";
import bagIcon from "@assets/icon_bag.png";
import { inventoryWeaponRotation } from "@/lib/clearingWeaponVisuals";

type DisplaySlot = ClearingEquipmentSlot;

const slotLayout: Array<{ slot: DisplaySlot; grid: string }> = [
  { slot: "helmet", grid: "col-start-2 row-start-1" },
  { slot: "weapon", grid: "col-start-1 row-start-2" },
  { slot: "armor", grid: "col-start-2 row-start-2" },
  { slot: "charm", grid: "col-start-3 row-start-2" },
  { slot: "boots", grid: "col-start-2 row-start-3" },
];

const isSupportedSlot = (_slot: DisplaySlot): _slot is ClearingEquipmentSlot => true;

export default function ClearingEquipmentModal({
  open,
  onOpenChange,
  inventory = [],
  loadout,
  onEquip,
  onUnequip,
  onOpenInventory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory?: ClearingInventoryItem[];
  loadout?: ClearingLoadoutResponse;
  onEquip: (inventoryId: string) => void;
  onUnequip: (slot: ClearingEquipmentSlot) => void;
  onOpenInventory: () => void;
}) {
  const [selectedSlot, setSelectedSlot] = useState<DisplaySlot | null>(null);
  const compatibleItems = useMemo(
    () => selectedSlot ? inventory.filter((item) => item.slot === selectedSlot) : [],
    [inventory, selectedSlot],
  );

  const setOpen = (next: boolean) => {
    if (!next) setSelectedSlot(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        data-interactive
        data-testid="clearing-equipment-modal"
        className="h-auto max-w-none overflow-hidden border-0 bg-transparent bg-cover bg-center p-[clamp(30px,7vw,52px)] text-amber-50 shadow-none sm:rounded-none"
        style={{
          aspectRatio: "2 / 3",
          width: "min(92vw, 480px, calc((100dvh - max(48px, env(safe-area-inset-top)) - max(48px, env(safe-area-inset-bottom))) * 2 / 3))",
          backgroundImage: `url(${popupBackgroundUrl})`,
          maxHeight: "calc(100dvh - max(24px, env(safe-area-inset-top)) - max(24px, env(safe-area-inset-bottom)))",
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogTitle className="text-center font-serif text-xl tracking-wide text-amber-200 drop-shadow-[0_2px_2px_#000]">
          Clearing Equipment
        </DialogTitle>

        {!selectedSlot && <div className="mx-auto -mt-1 flex items-center gap-2"><div className="rounded-xl border border-amber-500/60 bg-emerald-950/80 px-3 py-1.5 text-center text-xs shadow-inner" data-testid="clearing-total-equipment-power"><b className="text-amber-200">Total Equipment Power</b><br/><span className="text-emerald-100">{(loadout?.totals.atk??0)+(loadout?.totals.def??0)+Math.round((loadout?.totals.hp??0)*.05)} · ATK +{loadout?.totals.atk??0} · DEF +{loadout?.totals.def??0} · HP +{loadout?.totals.hp??0}</span></div><button type="button" aria-label="Open Clearing inventory" className="h-12 w-12 shrink-0 rounded-md border border-amber-500/30 bg-transparent p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950" onClick={()=>{onOpenChange(false);onOpenInventory();}}><img src={bagIcon} alt="" className="h-full w-full object-contain"/></button></div>}

        {!selectedSlot ? (
          <div className="grid flex-1 -mt-2 grid-cols-3 grid-rows-3 place-items-center gap-[clamp(4px,1.5vw,10px)]" data-testid="clearing-equipment-slot-grid">
            {slotLayout.map(({ slot, grid }) => {
              const item = isSupportedSlot(slot) ? loadout?.[slot] : null;
              return (
                <button
                  key={slot}
                  type="button"
                  aria-label={`Equip ${slot}`}
                  className={`${grid} relative aspect-square w-full max-w-[112px] bg-contain bg-center bg-no-repeat transition-transform outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950 active:scale-95`}
                  style={{ backgroundImage: `url(${slotBorderUrl})` }}
                  onClick={() => setSelectedSlot(slot)}
                >
                  {item?.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="absolute inset-[12%] h-[76%] w-[76%] object-contain" style={{transform:`rotate(${inventoryWeaponRotation(item.stableKey)}deg)`}} />
                  ) : (
                    <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[clamp(24px,8vw,42px)] font-light text-amber-100 drop-shadow-[0_2px_2px_#000]">+</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <button type="button" className="mb-3 self-start rounded-lg border border-amber-500/70 bg-black/30 px-3 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" onClick={() => setSelectedSlot(null)}>‹ Back</button>
            <h2 className="mb-3 text-center font-semibold capitalize">Choose {selectedSlot}</h2>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
              {compatibleItems.map((item) => (
                <button
                  key={item.inventoryId}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-amber-500/60 bg-black/40 p-2 text-left"
                  onClick={() => { onEquip(item.inventoryId); setSelectedSlot(null); }}
                >
                  <span className="h-12 w-12 shrink-0">{item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-contain" />}</span>
                  <span className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><small>{"★".repeat(item.stars)} · ATK +{item.atkBonus} · DEF +{item.defBonus} · HP +{item.hpBonus}</small></span>
                  {item.equipped && <span className="text-xs text-amber-200">Equipped</span>}
                </button>
              ))}
              {!compatibleItems.length && <p className="py-10 text-center text-sm text-emerald-100">No compatible owned equipment for this slot.</p>}
            </div>
            {isSupportedSlot(selectedSlot) && loadout?.[selectedSlot] && (
              <button type="button" className="mt-3 rounded-lg border border-amber-500 bg-black/35 py-2 text-sm" onClick={() => { onUnequip(selectedSlot); setSelectedSlot(null); }}>Unequip current item</button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
