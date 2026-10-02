const PET_SLEEP_ZZZ_STYLES = `
@keyframes para-pet-sleep-z {
  0% { transform: translate(0, 8px) scale(0.72); opacity: 0; }
  18% { opacity: 0.82; }
  70% { opacity: 0.7; }
  100% { transform: translate(18px, -26px) scale(1.08); opacity: 0; }
}
`;

export default function PetSleepZzz() {
  const zzz = [
    { text: "z", right: "4%", top: "20%", delay: "0s", size: 12 },
    { text: "Z", right: "-2%", top: "10%", delay: "0.7s", size: 15 },
    { text: "Z", right: "-10%", top: "0%", delay: "1.4s", size: 18 },
  ];

  return (
    <div
      aria-hidden
      data-testid="pet-sleep-zzz"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 12,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <style>{PET_SLEEP_ZZZ_STYLES}</style>
      {zzz.map((item, index) => (
        <span
          key={index}
          style={{
            position: "absolute",
            right: item.right,
            top: item.top,
            color: "rgba(224,231,255,0.92)",
            fontFamily: "Georgia, serif",
            fontWeight: 700,
            fontSize: item.size,
            lineHeight: 1,
            textShadow: "0 0 5px rgba(117,139,232,0.72), 0 1px 2px rgba(0,0,0,0.55)",
            animation: `para-pet-sleep-z 2.35s ease-out ${item.delay} infinite`,
          }}
        >
          {item.text}
        </span>
      ))}
    </div>
  );
}
