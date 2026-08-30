import { useLocation } from "wouter";
import { Layers3 } from "lucide-react";

const PLACEHOLDER_SLOTS = Array.from({ length: 6 }, (_, index) => index);

export default function CardsCollectionPage() {
  const [, navigate] = useLocation();

  return (
    <main
      data-testid="page-cards-collection"
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        background:
          "radial-gradient(circle at 50% 18%, rgba(59,104,68,.34), transparent 38%), linear-gradient(180deg, #07120c 0%, #0d2115 54%, #050b08 100%)",
        color: "#f8e7b0",
        fontFamily: "'Cinzel', 'Palatino Linotype', serif",
      }}
    >
      <div style={{ width: "min(100%, 430px)", minHeight: "100%", margin: "0 auto", padding: "46px 18px 88px", boxSizing: "border-box" }}>
        <button
          type="button"
          data-testid="button-close-cards"
          aria-label="Close cards collection"
          onClick={() => navigate("/")}
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1px solid rgba(224,181,74,.65)",
            background: "rgba(7,18,12,.86)",
            color: "#f0c040",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,.45)",
          }}
        >
          ×
        </button>

        <header style={{ textAlign: "center", marginBottom: 26 }}>
          <div
            aria-hidden="true"
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 10px",
              borderRadius: 18,
              display: "grid",
              placeItems: "center",
              border: "1px solid rgba(224,181,74,.55)",
              background: "rgba(224,181,74,.08)",
              boxShadow: "0 0 24px rgba(224,181,74,.12)",
            }}
          >
            <Layers3 size={34} strokeWidth={1.5} color="#f0c040" />
          </div>
          <h1 style={{ margin: 0, fontSize: 25, letterSpacing: ".12em", color: "#f0c040", textShadow: "0 2px 8px #000" }}>
            Cards
          </h1>
          <p style={{ margin: "8px auto 0", maxWidth: 300, color: "rgba(248,231,176,.68)", fontFamily: "Georgia, serif", fontSize: 12, lineHeight: 1.5 }}>
            Your card collection will be displayed here.
          </p>
        </header>

        <section aria-label="Card collection" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          {PLACEHOLDER_SLOTS.map(slot => (
            <div
              key={slot}
              data-testid={`card-collection-placeholder-${slot + 1}`}
              aria-hidden="true"
              style={{
                aspectRatio: "2 / 3",
                borderRadius: 14,
                border: "1px dashed rgba(224,181,74,.28)",
                background: "linear-gradient(145deg, rgba(255,255,255,.035), rgba(224,181,74,.025))",
                display: "grid",
                placeItems: "center",
                boxShadow: "inset 0 0 22px rgba(0,0,0,.28)",
              }}
            >
              <Layers3 size={25} strokeWidth={1.2} color="rgba(224,181,74,.24)" />
            </div>
          ))}
        </section>

        <p style={{ margin: "22px 0 0", textAlign: "center", color: "rgba(248,231,176,.45)", fontFamily: "Georgia, serif", fontSize: 11 }}>
          Card artwork and collection details coming soon.
        </p>
      </div>
    </main>
  );
}
