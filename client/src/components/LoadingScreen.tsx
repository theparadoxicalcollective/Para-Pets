export default function LoadingScreen({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#07110a]">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="text-2xl font-fantasy text-[#7fbfb0] animate-pulse tracking-widest">
          Para Pets
        </div>
        <div className="text-xs text-[#4a7a6a] tracking-widest uppercase font-sans mb-1">
          {label}
        </div>
        <div className="w-44 h-1.5 bg-[#0d2018] rounded-full overflow-hidden">
          <div className="h-full bg-[#1a6b55] rounded-full animate-loading-bar" />
        </div>
      </div>
    </div>
  );
}
