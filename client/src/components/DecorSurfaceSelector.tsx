import type { DecorRole } from "@shared/decorSurface";

const OPTIONS: { value: DecorRole; label: string; description: string }[] = [
  { value: "barrier", label: "Barrier", description: "Default. The visible artwork blocks walking; transparent pixels stay open." },
  { value: "grass", label: "Grass", description: "Walk through the decoration normally." },
  { value: "ground", label: "Ground", description: "Walk over it. Draw above terrain tiles but beneath pets and other objects." },
  { value: "water", label: "Water Source", description: "Keep the garden-tool refill interaction." },
];

/** Single-choice controls make conflicting decor behavior settings impossible. */
export default function DecorSurfaceSelector({
  value, onChange, disabled = false, name, testId,
}: {
  value: DecorRole;
  onChange: (value: DecorRole) => void;
  disabled?: boolean;
  name: string;
  testId: string;
}) {
  return <fieldset data-testid={testId}
    disabled={disabled}
    className="rounded-xl border border-[#c9a85d] bg-[#102c20] p-3 text-[#fae8b6]">
    <legend className="px-2 text-sm font-bold text-[#ffe4a1]">Decoration behavior</legend>
    <p className="mb-3 text-xs leading-relaxed text-[#f4dfad]">
      Choose one. Existing decorations default to Barrier. This setting belongs to this placed item.
    </p>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {OPTIONS.map(option => {
        const selected = value === option.value;
        return <label key={option.value}
          className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-[#fff1be] disabled:opacity-50 ${
            selected ? "border-[#ffe6a4] bg-[#31543b]" : "border-[#8e7845] bg-[#193829]"
          }`}>
          <input type="radio" name={name} aria-label={option.label} value={option.value} checked={selected}
            disabled={disabled} onChange={() => onChange(option.value)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#f2d17f]" />
          <span className="min-w-0">
            <strong className="block text-sm font-semibold leading-5 text-[#ffebba]">{option.label}</strong>
            <span className="mt-0.5 block text-xs leading-snug text-[#f5e4bb]">{option.description}</span>
          </span>
        </label>;
      })}
    </div>
  </fieldset>;
}
