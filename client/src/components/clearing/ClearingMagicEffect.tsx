type ClearingMagicEffectProps = {
  kind: "heal" | "special" | "special-impact";
  x: number;
  y: number;
  size: number;
  testId?: string;
};

/** A short-lived, CSS-only burst. The parent owns its lifetime so this component
 * never creates an animation loop or timer of its own. */
export default function ClearingMagicEffect({ kind, x, y, size, testId }: ClearingMagicEffectProps) {
  return (
    <div
      aria-hidden
      data-testid={testId}
      className={`clearing-magic-effect is-${kind}`}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: size, height: size }}
    >
      <i /><i /><i /><i /><i /><i /><i /><i />
    </div>
  );
}
