import PetHeartParticle from "@/components/PetHeartParticle";
import coinIconImg from "@assets/icon_coin.webp";

const HEART_LAYOUT = [
  { left: "34%", top: "38%", size: 18, dx: -18, delay: 0 },
  { left: "48%", top: "31%", size: 22, dx: 8, delay: 0.08 },
  { left: "62%", top: "39%", size: 19, dx: 18, delay: 0.16 },
  { left: "41%", top: "48%", size: 16, dx: -8, delay: 0.22 },
  { left: "57%", top: "50%", size: 17, dx: 10, delay: 0.28 },
] as const;

const VISIT_REWARD_STYLE = `
@keyframes para-visit-pet-coin-spin {
  0% { transform: translateX(-50%) rotateY(0deg) translateY(0); }
  50% { transform: translateX(-50%) rotateY(180deg) translateY(-3px); }
  100% { transform: translateX(-50%) rotateY(360deg) translateY(0); }
}
@keyframes para-visit-pet-reward-text {
  0% { opacity: 0; transform: translate(-50%, 4px) scale(.8); }
  20% { opacity: 1; transform: translate(-50%, -4px) scale(1.08); }
  100% { opacity: 0; transform: translate(-50%, -34px) scale(.92); }
}
`;

export default function PetHomeVisitRewardCue({
  available,
  reacting,
  amount = 10,
}: {
  available: boolean;
  reacting: boolean;
  amount?: number;
}) {
  return (
    <>
      <style>{VISIT_REWARD_STYLE}</style>
      {available && (
        <div
          data-testid="pet-home-visit-coin-cue"
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            left: "50%",
            top: -20,
            width: 30,
            height: 30,
            zIndex: 40,
            animation: "para-visit-pet-coin-spin 1.15s linear infinite",
            filter: "drop-shadow(0 0 6px rgba(255,218,90,.95)) drop-shadow(0 2px 3px rgba(0,0,0,.65))",
            transformStyle: "preserve-3d",
          }}
        >
          <img
            src={coinIconImg}
            alt=""
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
          />
        </div>
      )}

      {reacting && (
        <>
          <div
            data-testid="pet-home-visit-reward-text"
            className="absolute pointer-events-none"
            style={{
              left: "50%",
              top: "7%",
              zIndex: 42,
              color: "#ffe273",
              fontFamily: "Lora, serif",
              fontWeight: 800,
              fontSize: 14,
              whiteSpace: "nowrap",
              textShadow: "0 1px 2px #000, 0 0 8px rgba(255,207,64,.9)",
              animation: "para-visit-pet-reward-text 1.45s ease-out forwards",
            }}
          >
            +{amount}
          </div>
          {HEART_LAYOUT.map((heart, index) => (
            <PetHeartParticle
              key={index}
              id={`visit-${index}`}
              left={heart.left}
              top={heart.top}
              size={heart.size}
              dx={heart.dx}
              delay={heart.delay}
              position="absolute"
              zIndex={41}
            />
          ))}
        </>
      )}
    </>
  );
}
