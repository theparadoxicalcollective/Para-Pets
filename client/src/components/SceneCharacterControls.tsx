import { useQuery } from "@tanstack/react-query";
import { isMiniPetAnimation, type MiniPetAnimation, type SceneMiniPet } from "@shared/miniPet";

/** Existing catalog only; no player-owned pets are deposited or duplicated. */
export function SceneMiniPetPicker({ busy, onPlace }: { busy: boolean; onPlace: (pet: SceneMiniPet) => void }) {
  const catalog = useQuery<SceneMiniPet[]>({ queryKey: ["/api/admin/mini-pets"] });
  return <section data-testid="scene-mini-pet-picker" className="space-y-3">
    <p className="text-xs text-amber-100/75">Choose an existing Mini Pet to place as decorative scenery. It will stay near its placement, and does not use any player's inventory.</p>
    {catalog.isLoading ? <p>Loading Mini Pets…</p>
      : catalog.isError ? <p role="alert" className="text-amber-100">Could not load Mini Pets. Try reopening the picker.</p>
      : !catalog.data?.length ? <p className="text-xs">No saved Mini Pets. Create one in Admin → Mini Pets first.</p>
      : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {catalog.data.map(pet => <button type="button" key={pet.shopItemId}
          aria-label={`Place Mini Pet ${pet.name}`} data-testid={`button-place-mini-pet-${pet.shopItemId}`}
          disabled={busy} onClick={() => onPlace(pet)}
          className="flex min-h-36 flex-col items-center gap-2 rounded-xl border border-[#b99a4c]/60 bg-[#173726] p-3 text-center text-xs disabled:opacity-40">
          {pet.imageUrl && <img src={pet.imageUrl} alt="" loading="lazy" draggable={false} className="h-24 w-full object-contain" />}
          <span className="break-words text-[#f5d77b]">{pet.name}</span>
        </button>)}
      </div>}
  </section>;
}

export function SceneIdleAnimationSelector({ value, disabled, onChange }: {
  value: MiniPetAnimation; disabled?: boolean; onChange: (animation: MiniPetAnimation) => void;
}) {
  return <label className="flex items-center justify-between gap-2 rounded-lg border border-[#b99a4c]/55 bg-[#173b28] px-2 py-1 text-xs text-[#f5d77b]">
    Idle animation
    <select aria-label="Idle animation" data-testid="scene-idle-animation"
      className="min-h-11 rounded-md border border-[#b99a4c]/55 bg-[#10291d] px-3 text-[#f5d77b]"
      value={value} disabled={disabled}
      onChange={event => { if (isMiniPetAnimation(event.target.value)) onChange(event.target.value); }}>
      <option value="breath">Breathing</option>
      <option value="float">Float</option>
    </select>
  </label>;
}
