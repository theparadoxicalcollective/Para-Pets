import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, X } from "lucide-react";
import { EVOLUTION_SLOT_COUNT, evolutionTargetForRarity } from "@shared/evolution";
import socketActive from "@assets/generated_images/powerup_chamber/powerup_socket_active.webp";
import socketLocked from "@assets/generated_images/powerup_chamber/powerup_socket_locked.webp";

interface EvolutionFeederPet {
  inventoryId: string;
  name: string;
  rarity: number;
  imageUrl: string | null;
  evolutionPoints: number;
}

interface EvolutionState {
  target: { inventoryId: string; name: string; rarity: number; imageUrl: string | null };
  slotCount: number;
  completedSlots: number;
  currentPoints: number;
  pointsRequired: number;
  percent: number;
  isComplete: boolean;
  feeders: EvolutionFeederPet[];
  blockedPetCount: number;
}

interface EvolutionPanelProps {
  enabled: boolean;
  fallbackRarity: number;
  layout?: "panel" | "orbit";
}

const ORBIT_POSITIONS = [
  { x: 10, y: 43 },
  { x: 22, y: 72 },
  { x: 39, y: 88 },
  { x: 61, y: 88 },
  { x: 78, y: 72 },
  { x: 90, y: 43 },
] as const;

const CSS = String.raw`
.evo-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.evo-orbit{position:absolute;left:50%;top:70px;width:min(98%,520px);height:250px;transform:translateX(-50%);z-index:7;pointer-events:none}.evo-orbit .evo-slot{position:absolute;left:var(--x);top:var(--y);width:clamp(46px,13vw,68px);height:clamp(46px,13vw,68px);transform:translate(-50%,-50%);padding:0;border:0;background:transparent;pointer-events:none;-webkit-tap-highlight-color:transparent}.evo-orbit .evo-slot.current{pointer-events:auto;cursor:pointer;filter:drop-shadow(0 0 8px #52ffaf99) drop-shadow(0 0 18px #27d98655)}.evo-orbit .evo-slot.complete{filter:drop-shadow(0 0 8px #30ef9a77)}.evo-orbit .evo-slot.locked{opacity:.82}.evo-orbit .evo-slot img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}.evo-orbit .evo-base{filter:grayscale(1) brightness(.45);opacity:.82}.evo-orbit .evo-fill{position:absolute;inset:0;overflow:hidden;filter:drop-shadow(0 0 7px #4dffad88)}.evo-orbit .evo-fill img{filter:saturate(1.15) brightness(1.08)}.evo-orbit .evo-lock-badge{position:absolute;left:50%;top:51%;transform:translate(-50%,-50%);width:34%;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:#07110fe8;border:1px solid #7e9289;color:#cdd8d3;box-shadow:0 2px 6px #000b}.evo-orbit-status{position:absolute;left:50%;bottom:0;transform:translateX(-50%);min-width:118px;max-width:72%;padding:3px 9px;border-radius:999px;background:#04130fc9;border:1px solid #377c60;color:#9cd9bb;text-align:center;font:700 9px/1.2 system-ui,sans-serif;letter-spacing:.03em;pointer-events:none}.evo-orbit-error{color:#ffc0b4;border-color:#98564d;background:#1d0908dc}
.evo-wrap{max-width:560px;margin:8px auto 12px;padding:12px;border:1px solid #387f64;border-radius:18px;background:linear-gradient(180deg,#071c18eb,#04110fee);box-shadow:inset 0 0 24px #19c87914,0 8px 20px #0006;box-sizing:border-box;width:100%}.evo-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:8px}.evo-title{font:700 12px/1 system-ui,sans-serif;letter-spacing:.18em;color:#baffda}.evo-copy{font:600 11px/1.2 system-ui,sans-serif;color:#8bbba5;text-align:right}.evo-slots{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}.evo-wrap .evo-slot{position:relative;aspect-ratio:1;border:0;background:transparent;padding:0;min-width:0;cursor:default;-webkit-tap-highlight-color:transparent}.evo-wrap .evo-slot.current{cursor:pointer}.evo-wrap .evo-slot img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}.evo-wrap .evo-base{filter:grayscale(1) brightness(.48);opacity:.72}.evo-wrap .evo-slot.locked{opacity:.58;filter:grayscale(.75)}.evo-wrap .evo-slot.current{filter:drop-shadow(0 0 8px #4dffac66)}.evo-wrap .evo-slot.complete{filter:drop-shadow(0 0 7px #2cff9966)}.evo-wrap .evo-fill{position:absolute;inset:0;overflow:hidden}.evo-wrap .evo-fill img{filter:saturate(1.08) brightness(1.05)}.evo-wrap .evo-lock-badge{position:absolute;right:2%;bottom:1%;width:31%;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:#07120fdc;border:1px solid #8e9c95;color:#cad2ce;box-shadow:0 2px 5px #0008}.evo-current-bar{margin-top:9px}.evo-bar-label{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;font:700 11px/1 system-ui,sans-serif;color:#b7e9d0}.evo-track{height:9px;border-radius:999px;border:1px solid #3f735f;background:#03100c;overflow:hidden}.evo-track>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#147d52,#36e890,#91ffd0);box-shadow:0 0 9px #3effa177;transition:width .35s ease}.evo-note{margin-top:6px;font:500 10px/1.3 system-ui,sans-serif;color:#769d8b;text-align:center}.evo-error{padding:8px 12px;color:#ffb4a8;font:600 11px/1.35 system-ui,sans-serif}
.evo-picker-backdrop{position:fixed;inset:0;z-index:10020;background:#000c;display:flex;align-items:flex-end;justify-content:center;padding:14px;box-sizing:border-box;backdrop-filter:blur(2px)}.evo-picker{position:relative;width:min(100%,560px);max-height:min(78vh,720px);overflow:hidden;border:1px solid #55b987;border-radius:22px;background:linear-gradient(180deg,#0b211b,#06110f);box-shadow:0 -12px 55px #000;display:flex;flex-direction:column}.evo-picker-head{padding:16px 50px 10px 16px;border-bottom:1px solid #22533f}.evo-picker-head h3{margin:0;color:#c8ffe1;font:700 20px/1.1 Georgia,serif}.evo-picker-head p{margin:5px 0 0;color:#9fc5b2;font:500 12px/1.35 system-ui,sans-serif}.evo-picker-close{position:absolute;right:12px;top:12px;width:36px;height:36px;border-radius:50%;border:1px solid #478267;background:#071711;color:#d7ffea;display:grid;place-items:center}.evo-feeders{overflow-y:auto;padding:10px 12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;overscroll-behavior:contain}.evo-feeder{position:relative;display:grid;grid-template-columns:58px 1fr;align-items:center;gap:8px;min-width:0;padding:8px;border:1px solid #2f604c;border-radius:13px;background:#081812;color:#dfffee;text-align:left}.evo-feeder.selected{border-color:#68f0ad;background:#0c2a1d;box-shadow:inset 0 0 14px #29d88122}.evo-feeder img{width:58px;height:58px;object-fit:contain}.evo-feeder-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 12px/1.2 system-ui,sans-serif}.evo-feeder-meta{display:block;margin-top:3px;color:#9ec9b4;font:600 10px/1.2 system-ui,sans-serif}.evo-check{position:absolute;right:6px;top:6px;width:18px;height:18px;border-radius:50%;border:1px solid #5a8d73;background:#06100d;color:#062012;font:900 12px/17px system-ui;text-align:center}.selected .evo-check{background:#6ff0ae;border-color:#adffd3}.evo-picker-foot{padding:10px 12px 12px;border-top:1px solid #22533f;background:#06110f}.evo-total{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;color:#c8ffe1;font:700 12px/1.2 system-ui,sans-serif}.evo-warning{margin:0 0 8px;color:#e5b9a8;font:600 10px/1.3 system-ui,sans-serif}.evo-feed-btn{width:100%;min-height:44px;border-radius:999px;border:1px solid #67e8a9;background:linear-gradient(#147a51,#0b5538);color:#eafff3;font:800 13px/1 system-ui,sans-serif;letter-spacing:.04em}.evo-feed-btn:disabled{opacity:.45}.evo-empty{grid-column:1/-1;padding:25px 10px;text-align:center;color:#a6c9b8;font:600 12px/1.4 system-ui,sans-serif}
@media(max-width:430px){.evo-orbit{top:64px;height:224px}.evo-orbit .evo-slot{width:52px;height:52px}.evo-feeders{grid-template-columns:1fr}.evo-picker-backdrop{padding:8px}.evo-wrap{border-radius:15px;padding:10px 8px}.evo-wrap .evo-slots{gap:2px}}
`;

function randomActionId(): string {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto?.randomUUID) return browserCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  browserCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function EvolutionPanel({ enabled, fallbackRarity, layout = "panel" }: EvolutionPanelProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<EvolutionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [feeding, setFeeding] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pet-evolution/active", { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Could not load evolution progress.");
      setState(body as EvolutionState);
    } catch (err: any) {
      setError(err?.message || "Could not load evolution progress.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!pickerOpen) setSelected(new Set()); }, [pickerOpen]);

  const pointsRequired = state?.pointsRequired ?? evolutionTargetForRarity(fallbackRarity);
  const completedSlots = state?.completedSlots ?? 0;
  const currentPoints = state?.currentPoints ?? 0;
  const currentPercent = state?.isComplete ? 100 : state?.percent ?? 0;
  const slotCount = Math.max(1, Math.min(EVOLUTION_SLOT_COUNT, state?.slotCount ?? EVOLUTION_SLOT_COUNT));
  const selectedPets = useMemo(() => (state?.feeders ?? []).filter((pet) => selected.has(pet.inventoryId)), [state?.feeders, selected]);
  const selectedPoints = selectedPets.reduce((sum, pet) => sum + pet.evolutionPoints, 0);

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const feed = async () => {
    if (!selectedPets.length || feeding) return;
    setFeeding(true);
    setError("");
    try {
      const response = await fetch("/api/pet-evolution/active/feed", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feederPetIds: selectedPets.map((pet) => pet.inventoryId), actionId: randomActionId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Evolution failed safely.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }),
        refresh(),
      ]);
      setPickerOpen(false);
      setSelected(new Set());
    } catch (err: any) {
      setError(err?.message || "Evolution failed safely.");
    } finally {
      setFeeding(false);
    }
  };

  if (!enabled) return null;

  const renderSlots = (orbit: boolean) => Array.from({ length: slotCount }, (_, index) => {
    const complete = index < completedSlots;
    const current = !state?.isComplete && index === completedSlots;
    const locked = !complete && !current;
    const fill = complete ? 100 : current ? currentPercent : 0;
    const position = ORBIT_POSITIONS[index] ?? ORBIT_POSITIONS[ORBIT_POSITIONS.length - 1];
    const style = orbit ? ({ "--x": `${position.x}%`, "--y": `${position.y}%` } as React.CSSProperties) : undefined;

    return <button
      key={index}
      type="button"
      className={`evo-slot ${complete ? "complete" : ""} ${current ? "current" : ""} ${locked ? "locked" : ""}`}
      style={style}
      onClick={() => current && setPickerOpen(true)}
      disabled={!current}
      aria-label={complete ? `Evolution slot ${index + 1} complete` : current ? `Evolution slot ${index + 1}, ${Math.round(fill)} percent filled. Tap to choose feeder pets.` : `Evolution slot ${index + 1} locked`}
      data-testid={`button-evolution-slot-${index + 1}`}
    >
      {locked ? <img src={socketLocked} alt="" /> : <>
        <img className="evo-base" src={socketActive} alt="" />
        <span className="evo-fill" style={{ clipPath: `inset(${100 - fill}% 0 0 0)` }}><img src={socketActive} alt="" /></span>
      </>}
      {locked && <span className="evo-lock-badge"><Lock size={orbit ? 12 : 11} /></span>}
    </button>;
  });

  const visual = layout === "orbit" ? (
    <section className="evo-orbit" data-testid="section-pet-evolution" aria-label="Pet evolution progress">
      {renderSlots(true)}
      <span className="evo-sr" aria-live="polite">
        {state?.isComplete ? "Evolution track complete" : `Evolution slot ${Math.min(slotCount, completedSlots + 1)} of ${slotCount}: ${currentPoints} of ${pointsRequired} points`}
      </span>
      {(loading || error) && <span className={`evo-orbit-status ${error ? "evo-orbit-error" : ""}`}>{error || "Reading evolution energy…"}</span>}
    </section>
  ) : (
    <section className="evo-wrap" data-testid="section-pet-evolution">
      <div className="evo-head">
        <span className="evo-title">EVOLUTION</span>
        <span className="evo-copy">{state?.isComplete ? "Evolution track complete" : `Slot ${Math.min(slotCount, completedSlots + 1)} of ${slotCount}`}</span>
      </div>
      <div className="evo-slots" aria-label="Evolution slots">{renderSlots(false)}</div>
      <div className="evo-current-bar">
        <div className="evo-bar-label"><span>{state?.isComplete ? "Evolution complete" : "Current evolution"}</span><span>{state?.isComplete ? `${pointsRequired}/${pointsRequired}` : `${currentPoints}/${pointsRequired} pts`}</span></div>
        <div className="evo-track"><i style={{ width: `${state?.isComplete ? 100 : currentPercent}%` }} /></div>
      </div>
      <div className="evo-note">{loading ? "Reading evolution energy…" : state?.isComplete ? "All evolution icons are filled." : "Tap the unlocked icon to choose feeder pets. Icons unlock one at a time."}</div>
      {error && !pickerOpen && <div className="evo-error">{error}</div>}
    </section>
  );

  return <>
    <style>{CSS}</style>
    {visual}

    {pickerOpen && <div className="evo-picker-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
      <div className="evo-picker" role="dialog" aria-modal="true" aria-label="Choose evolution feeder pets">
        <button className="evo-picker-close" type="button" onClick={() => setPickerOpen(false)} aria-label="Close evolution pet picker"><X size={21} /></button>
        <div className="evo-picker-head">
          <h3>Feed Pets for Evolution</h3>
          <p>Current icon: {currentPoints}/{pointsRequired} pts. Select pets to convert into evolution points.</p>
        </div>
        {error && <div className="evo-error">{error}</div>}
        <div className="evo-feeders">
          {(state?.feeders ?? []).length ? state!.feeders.map((pet) => {
            const checked = selected.has(pet.inventoryId);
            return <button key={pet.inventoryId} type="button" className={`evo-feeder ${checked ? "selected" : ""}`} onClick={() => toggle(pet.inventoryId)} data-testid={`button-evolution-feeder-${pet.inventoryId}`}>
              {pet.imageUrl ? <img src={pet.imageUrl} alt="" /> : <div style={{ width: 58, height: 58 }} />}
              <span style={{ minWidth: 0 }}><span className="evo-feeder-name">{pet.name}</span><span className="evo-feeder-meta">{"★".repeat(Math.max(1, Math.min(5, pet.rarity)))} · +{pet.evolutionPoints} evolution pts</span></span>
              <span className="evo-check">{checked ? "✓" : ""}</span>
            </button>;
          }) : <div className="evo-empty">No eligible feeder pets are available. Pets in the market, house, PvP teams, with accessories, eggs, and protected cave pets are excluded.</div>}
        </div>
        <div className="evo-picker-foot">
          <div className="evo-total"><span>{selectedPets.length} pet{selectedPets.length === 1 ? "" : "s"} selected</span><span>+{selectedPoints} pts</span></div>
          <p className="evo-warning">Feeder pets are permanently consumed when you confirm. This action cannot be undone.</p>
          <button className="evo-feed-btn" type="button" disabled={!selectedPets.length || feeding} onClick={feed}>{feeding ? "Infusing…" : selectedPets.length ? `Feed ${selectedPets.length} Pet${selectedPets.length === 1 ? "" : "s"} (+${selectedPoints})` : "Select feeder pets"}</button>
        </div>
      </div>
    </div>}
  </>;
}
