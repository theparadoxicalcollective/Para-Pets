import { useEffect, useMemo, useRef, useState } from "react";
import type { HauntedSlotPrizePreview } from "@shared/hauntedCasino";
import { currencyAssets } from "@/lib/currencyAssets";

export default function SlotPrizeStrip({ prizes, loaded }: {
  prizes: HauntedSlotPrizePreview[];
  loaded: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const cards = useMemo(() => [
    { id: "currency-coins", name: "Coins", imageUrl: currencyAssets.coin, kind: "Currency" },
    { id: "currency-essence", name: "Essence", imageUrl: currencyAssets.essenceToken, kind: "Currency" },
    { id: "currency-tickets", name: "PvP tickets", imageUrl: null, kind: "Jackpot / pair" },
    ...prizes.map(prize => ({ ...prize, kind: prize.category === "egg" ? "Pet egg" : "Item prize" })),
  ], [prizes]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || paused || reducedMotion || !loaded) return;
    let frame = 0;
    let previous = 0;
    let position = scroller.scrollLeft;
    let direction = 1;
    const advance = (now: number) => {
      const elapsed = previous ? Math.min(now - previous, 50) : 0;
      previous = now;
      const end = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      position = Math.max(0, Math.min(end, position + direction * elapsed * 0.025));
      scroller.scrollLeft = position;
      if (position >= end) direction = -1;
      if (position <= 0) direction = 1;
      frame = window.requestAnimationFrame(advance);
    };
    frame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frame);
  }, [cards, loaded, paused, reducedMotion]);

  return (
    <section data-testid="slaughter-slots-prize-strip" aria-label="Available slot prizes"
      className="mt-2 h-[104px] w-full shrink-0 rounded-xl border border-amber-300/35 bg-black/65 px-2">
      <div className="flex h-7 items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[.12em] text-amber-100">Available prizes &amp; eggs</h2>
        {!reducedMotion && loaded && <button type="button" onClick={() => setPaused(value => !value)}
          className="px-2 py-1 text-[10px] text-amber-100 underline" aria-pressed={paused}>
          {paused ? "Resume scrolling" : "Pause scrolling"}
        </button>}
      </div>
      <div ref={scrollerRef} tabIndex={0} aria-label="Scroll available prizes"
        onPointerDown={() => setPaused(true)} onWheel={() => setPaused(true)} onFocus={() => setPaused(true)}
        className="flex h-[72px] gap-2 overflow-x-auto overflow-y-hidden"
        style={{ overscrollBehaviorX: "contain", touchAction: "pan-x", scrollbarWidth: "thin" }}>
        {!loaded ? <p className="p-2 text-xs text-amber-100/70">Prizes load with the machine.</p> : cards.map(card => (
          <div key={card.id} title={card.name} className="flex w-24 shrink-0 items-center gap-1.5 rounded-lg border border-amber-200/15 bg-emerald-950/45 p-1.5">
            {card.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" decoding="async" draggable={false}
              className="h-10 w-10 shrink-0 object-contain" /> : <span aria-hidden="true" className="text-xl text-amber-200">★</span>}
            <span className="min-w-0 text-[9px] leading-tight text-amber-50">
              <span className="line-clamp-3">{card.name}</span>
              <span className="mt-1 block text-[8px] text-amber-100/60">{card.kind}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
