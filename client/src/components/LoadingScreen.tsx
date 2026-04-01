export default function LoadingScreen({ label = "Loading..." }: { label?: string }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "#07110a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        <div className="font-fantasy animate-pulse" style={{ color: "#7fbfb0", fontSize: "1.5rem", letterSpacing: "0.15em", paddingLeft: "0.15em" }}>
          Para Pets
        </div>
        <div className="font-sans uppercase" style={{ color: "#4a7a6a", fontSize: "0.75rem", letterSpacing: "0.1em", paddingLeft: "0.1em" }}>
          {label}
        </div>
        <div style={{ width: "11rem", height: "6px", background: "#0d2018", borderRadius: "9999px", overflow: "hidden" }}>
          <div className="animate-loading-bar" style={{ height: "100%", background: "#1a6b55", borderRadius: "9999px" }} />
        </div>
      </div>
    </div>
  );
}
