import { Smartphone } from "lucide-react";

export default function PortraitOrientationBlocker({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div
      data-testid="portrait-orientation-blocker"
      role="dialog"
      aria-modal="true"
      aria-label="Portrait orientation required"
      className="fixed inset-0"
      onPointerDown={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerMove={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUp={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      style={{
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "max(24px, env(safe-area-inset-top, 0px)) max(24px, env(safe-area-inset-right, 0px)) max(24px, env(safe-area-inset-bottom, 0px)) max(24px, env(safe-area-inset-left, 0px))",
        background:
          "radial-gradient(circle at 50% 30%, rgba(56,84,48,0.22), transparent 34%), linear-gradient(180deg, #071009 0%, #020604 100%)",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        overscrollBehavior: "none",
      }}
    >
      <div
        style={{
          width: "min(330px, 88vw)",
          textAlign: "center",
          padding: "26px 24px 24px",
          borderRadius: 22,
          background:
            "linear-gradient(180deg, rgba(16,31,17,0.98) 0%, rgba(7,16,9,0.99) 100%)",
          border: "1.5px solid rgba(240,192,64,0.48)",
          boxShadow:
            "0 18px 58px rgba(0,0,0,0.82), 0 0 30px rgba(240,192,64,0.10), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 74,
            height: 104,
            margin: "0 auto 18px",
            borderRadius: 16,
            border: "3px solid rgba(246,214,118,0.92)",
            boxShadow:
              "0 0 16px rgba(240,192,64,0.20), inset 0 0 20px rgba(240,192,64,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#f6d676",
          }}
        >
          <Smartphone size={39} strokeWidth={1.6} />
        </div>

        <h2
          style={{
            margin: 0,
            color: "#f6d676",
            fontFamily: "Lora, serif",
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "0.03em",
            textShadow: "0 0 12px rgba(240,192,64,0.18)",
          }}
        >
          Rotate to Portrait
        </h2>

        <p
          style={{
            margin: "10px auto 0",
            maxWidth: 270,
            color: "rgba(239,235,216,0.82)",
            fontFamily: "Lora, serif",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          Para Pets is designed to be played upright. Rotate your phone or tablet back to portrait to continue.
        </p>
      </div>
    </div>
  );
}
