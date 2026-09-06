import { useEffect, useMemo, useRef, useState } from "react";
import type { HauntedSlotPrizePreview } from "@shared/hauntedCasino";
import { currencyAssets } from "@/lib/currencyAssets";

export default function SlotPrizeStrip({ prizes, loaded }: {
  prizes: HauntedSlotPrizePreview[];
  loaded: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const marqueeGroupRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const cards = useMemo(() => [
    { id: "currency-coins", name: "Coins", imageUrl: currencyAssets.coin, kind: "Currency" },
    { id: "currency-essence", name: "Essence", imageUrl: currencyAssets.essenceToken, kind: "Currency" },
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
    const marqueeGroup = marqueeGroupRef.current;
    if (!scroller || !marqueeGroup || reducedMotion || !loaded || cards.length === 0) return;
    let frame = 0;
    let previous = 0;
    let position = scroller.scrollLeft;
    let lastApplied = position;
    const advance = (now: number) => {
      const elapsed = previous ? Math.min(now - previous, 50) : 0;
      previous = now;
      const loopWidth = marqueeGroup.offsetWidth;
      if (loopWidth > scroller.clientWidth) {
        // Continue from the player's swipe/keyboard position instead of snapping
        // back to the last animation position. The duplicated group lets the
        // strip keep moving in one direction and wrap without reversing.
        if (Math.abs(scroller.scrollLeft - lastApplied) > 1) position = scroller.scrollLeft;
        position += elapsed * 0.025;
        if (position >= loopWidth) position %= loopWidth;
        scroller.scrollLeft = position;
        lastApplied = scroller.scrollLeft;
      }
      frame = window.requestAnimationFrame(advance);
    };
    frame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frame);
  }, [cards, loaded, reducedMotion]);

  const renderCards = (copy: number, duplicate = false) => (
    <div
      ref={copy === 0 ? marqueeGroupRef : undefined}
      className="flex h-12 shrink-0 gap-2 pr-2"
      aria-hidden={duplicate ? true : undefined}
    >
      {cards.map(card => (
        <div key={`${copy}-${card.id}`} title={card.name} className="flex w-28 shrink-0 items-center gap-1.5 rounded-lg border border-amber-200/15 bg-emerald-950/45 px-1.5 py-0.5">
          {card.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" decoding="async" draggable={false}
            className="h-10 w-10 shrink-0 object-contain" /> : <span aria-hidden="true" className="text-xl text-amber-200">★</span>}
          <span className="min-w-0 text-[9px] leading-tight text-amber-50">
            <span className="line-clamp-2">{card.name}</span>
            <span className="mt-1 block text-[8px] text-amber-100/60">{card.kind}</span>
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <section data-testid="slaughter-slots-prize-strip" aria-label="Available slot prizes"
      className="absolute inset-x-0 bottom-0 h-[72px] w-full rounded-xl border border-amber-300/35 bg-black/65 px-2">
      <style>{`
        .slaughter-prize-scroller::-webkit-scrollbar { display: none; width: 0; height: 0; }
        [data-testid="slaughter-slots-bet-control"] { transform: translateY(15%); }
      `}</style>
      <div className="flex h-5 items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[.12em] text-amber-100">Available prizes &amp; eggs</h2>
        <span className="flex shrink-0 items-center gap-1" aria-label="Coin and essence prizes">
          <img data-testid="slot-prize-coin-image" src={currencyAssets.coin} alt="Coins" className="h-4 w-4 object-contain" />
          <img data-testid="slot-prize-essence-image" src={currencyAssets.essenceToken} alt="Essence" className="h-4 w-4 object-contain" />
        </span>
      </div>
      <div ref={scrollerRef} tabIndex={0} aria-label="Scroll available prizes"
        className="slaughter-prize-scroller flex h-12 overflow-x-auto overflow-y-hidden"
        style={{ overscrollBehaviorX: "contain", touchAction: "pan-x", scrollbarWidth: "none" }}>
        {!loaded ? <p className="p-2 text-xs text-amber-100/70">Prizes load with the machine.</p> : <>
          {renderCards(0)}
          {!reducedMotion && renderCards(1, true)}
        </>}
      </div>
    </section>
  );
}
