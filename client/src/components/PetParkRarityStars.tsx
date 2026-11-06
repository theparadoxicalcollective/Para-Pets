import cardStarImg from "@assets/uploads/CardStar.png";

/** Same five-star upward arc as Active Pet, scaled to a placed park pet.
 * Decorative only: ownership and pet information stay in accessible labels.
 */
export default function PetParkRarityStars({ rarity, petSize }: { rarity: number | null | undefined; petSize: number }) {
  const filledCount = Math.max(0, Math.min(5, Math.round(Number(rarity) || 0)));
  const starSize = Math.max(11, Math.min(20, petSize * 0.145));
  return <div data-testid="pet-park-rarity-stars" role="img" aria-label={`${filledCount} of 5 stars`}
    className="pointer-events-none absolute left-1/2 top-0 z-[4] flex w-max -translate-x-1/2 items-center justify-center"
    style={{ transform: "translate(-50%, -75%)" }}>
    {Array.from({ length: 5 }, (_, index) => {
      const t = (index - 2) / 2;
      const curveY = -(1 - t * t) * starSize * 0.28;
      return <img key={index} src={cardStarImg} alt="" draggable={false}
        style={{ width: starSize, height: starSize, opacity: index < filledCount ? 1 : 0.26,
          filter: index < filledCount ? "drop-shadow(0 0 3px rgba(255,210,75,.55))" : "grayscale(.45)",
          transform: `translateY(${curveY}px)` }} />;
    })}
  </div>;
}
