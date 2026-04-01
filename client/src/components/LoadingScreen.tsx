export default function LoadingScreen({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#07110a]">
      <div className="w-full flex flex-col gap-4" style={{ alignItems: "stretch" }}>
        <p className="font-fantasy text-[#7fbfb0] animate-pulse w-full text-center" style={{ fontSize: "1.5rem", letterSpacing: "0.15em", margin: 0 }}>
          Para Pets
        </p>
        <p className="text-[#4a7a6a] uppercase font-sans w-full text-center" style={{ fontSize: "0.75rem", letterSpacing: "0.1em", margin: 0 }}>
          {label}
        </p>
        <div className="w-44 h-1.5 bg-[#0d2018] rounded-full overflow-hidden mx-auto">
          <div className="h-full bg-[#1a6b55] rounded-full animate-loading-bar" />
        </div>
      </div>
    </div>
  );
}
