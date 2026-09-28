import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { npcNamesMatch } from "@/lib/npcMetadata";
import { ELYSIAN_BAYOU_CLEARING_ID } from "@/lib/exploreLocations";
import { getQuestGuideSurface, guideDialogMaxHeight } from "@/lib/questGuideViewport";
import QuestGuideSpotlight from "@/components/QuestGuideSpotlight";

const pawCoin = "/paw-print-coin.webp";
const API = "/api/quests/lonelle-lost-adornment";
const WORLD = "/world/swamp";
const CLEARING = "/explore/elysian-bayou-clearing";

interface QuestState {
  status: "available" | "accepted" | "found" | "taken" | "claimed";
  kills: number;
  requiredKills: number;
  scarfInventoryId: string | null;
  scarfOwned: boolean;
  scarfEquipped: boolean;
  scarf: { name: string; imageUrl: string | null } | null;
  reward: { name: string; imageUrl: string | null; coins: number } | null;
  configured: boolean;
  npcImageUrl: string | null;
  npcPhases: Record<string, string>;
}
interface Location { id: string; name: string; type: string; iconUrl: string | null }
interface ClaimResult { alreadyClaimed: boolean; coinsGranted: number; reward: { name: string; imageUrl: string | null } | null }

function visible(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 3 || rect.height <= 3) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none" || Number(style.opacity || 1) <= 0.1) return false;
  }
  return true;
}

function LonellePortrait({ state, mood }: { state: QuestState; mood: string }) {
  const src = state.npcPhases[mood] || state.npcPhases.talking_casual || state.npcImageUrl;
  return <div className="h-28 w-24 shrink-0 overflow-hidden rounded-xl" style={{ background: "radial-gradient(#40604a,#162c21)", border: "1px solid #e7c675" }}>
    {src && <img src={src} alt="Lonelle" className="h-full w-full object-cover object-top" />}
  </div>;
}

export default function LonelleQuestOverlay() {
  const [pathname, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [questLogMount, setQuestLogMount] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [prize, setPrize] = useState<ClaimResult | null>(null);
  const [showReturnHome, setShowReturnHome] = useState(false);
  const { data: user } = useQuery<{ id: string } | null>({ queryKey: ["/api/auth/me"] });
  const { data: state } = useQuery<QuestState>({
    queryKey: [API], enabled: Boolean(user?.id), staleTime: 1_000, refetchOnWindowFocus: true,
    refetchInterval: query => ["accepted", "found", "taken"].includes(query.state.data?.status ?? "") ? 2_000 : false,
    queryFn: async () => (await apiRequest("GET", API)).json(),
  });
  const inBayou = pathname.startsWith(WORLD);
  useEffect(() => { if (pathname !== CLEARING) setShowReturnHome(false); }, [pathname]);
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/world", "swamp", "locations"], enabled: Boolean(user && inBayou), staleTime: 5_000,
    queryFn: async () => (await apiRequest("GET", "/api/world/swamp/locations")).json(),
  });
  const lonelle = useMemo(() => locations.find(row => row.type === "npc" && npcNamesMatch(row.name, "Lonelle")), [locations]);

  useEffect(() => {
    if (!inBayou || !lonelle) { setMount(null); return; }
    const refresh = () => setMount(document.querySelector<HTMLElement>(`[data-testid="location-${lonelle.id}"]`));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [inBayou, lonelle?.id]);

  useEffect(() => {
    const refresh = () => {
      const heading = Array.from(document.querySelectorAll("h3")).find(node => node.textContent?.trim() === "QUESTS");
      setQuestLogMount(heading?.parentElement?.parentElement?.querySelector<HTMLElement>(".overflow-y-auto") ?? null);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const refresh = (next: QuestState) => {
    queryClient.setQueryData([API], next);
    void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
  };
  const start = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${API}/start`, {})).json() as Promise<QuestState>,
    onSuccess: next => { refresh(next); setDialogOpen(false); setMessage(null); },
    onError: (error: Error) => setMessage(error.message),
  });
  const take = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${API}/take`, {})).json() as Promise<QuestState>,
    onSuccess: next => { refresh(next); setMessage(null); if (pathname === CLEARING) setShowReturnHome(true); },
    onError: (error: Error) => setMessage(error.message),
  });
  const claim = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${API}/claim`, {})).json() as Promise<ClaimResult>,
    onSuccess: result => {
      setDialogOpen(false);
      setMessage(null);
      if (!result.alreadyClaimed) setPrize(result);
      void queryClient.invalidateQueries({ queryKey: [API] });
      void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/user/equipped-costume-counts"] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const navMap = document.querySelector<HTMLElement>('[data-testid="nav-item-map"]');
  const mapOpen = visible(navMap);
  const adornmentPicker = document.querySelector<HTMLElement>('[data-testid="adornment-inventory-picker"]');
  const guiding = state && (["accepted", "found", "taken"].includes(state.status));
  let target: string | null = null;
  let instruction = "";
  let focus: "pet" | "control" | null = null;
  if (guiding && state.status === "accepted" && inBayou) {
    target = `[data-testid="location-${ELYSIAN_BAYOU_CLEARING_ID}"]`;
    instruction = "The Clearing is here!";
  } else if (guiding && state.status === "taken" && !state.scarfOwned) {
    target = inBayou ? lonelle ? '[data-testid="button-talk-lonelle"]' : null : pathname === "/map" ? '[data-testid="button-location-swamp"]' : mapOpen ? '[data-testid="nav-item-map"]' : '[data-testid="button-floating-nav"]';
    instruction = inBayou ? "Ask Lonelle to recover her scarf" : "Return to Lonelle for the quest scarf";
  } else if (guiding && state.status === "taken" && pathname === "/" && !state.scarfEquipped) {
    const closet = document.querySelector<HTMLElement>('[data-testid="button-action-equip-accessories"]');
    target = visible(closet) ? '[data-testid="button-action-equip-accessories"]' : '[data-testid="button-open-pet-actions"]';
    instruction = visible(closet) ? "Open your pet's Closet" : "Tap your pet";
    focus = visible(closet) ? "control" : "pet";
  } else if (guiding && state.status === "taken" && pathname === "/equip-accessories") {
    if (state.scarfEquipped) { target = '[data-testid="button-close-equip-accessories"]'; instruction = "Close the Closet"; }
    else if (visible(document.querySelector<HTMLElement>('[data-testid="button-confirm-unequip-adornment"]'))) {
      target = '[data-testid="button-confirm-unequip-adornment"]'; instruction = "Make room for Lonelle's Scarf"; focus = "control";
    } else if (visible(document.querySelector<HTMLElement>('[data-testid="button-cancel-unequip-adornment"]'))) {
      target = '[data-testid="button-cancel-unequip-adornment"]'; instruction = "Choose the third space instead"; focus = "control";
    } else if (state.scarfInventoryId && visible(document.querySelector<HTMLElement>(`[data-testid="bag-costume-${state.scarfInventoryId}"]`))) {
      target = `[data-testid="bag-costume-${state.scarfInventoryId}"]`; instruction = "Equip Lonelle's Scarf";
    } else if (adornmentPicker) {
      target = '[data-testid="button-close-adornment-inventory"]';
      instruction = adornmentPicker.dataset.selectedSlot === "3" ? "Scarf not here? Close and check with Lonelle" : "Close this list, then choose the third space";
    } else {
      target = '[data-testid="slot-costume-3"]';
      const occupied = document.querySelector<HTMLElement>(target)?.getAttribute("aria-label")?.startsWith("Unequip");
      instruction = occupied ? "Tap to free the third adornment space" : "Choose the third adornment space";
    }
  } else if (guiding && state.status === "taken" && state.scarfEquipped && pathname === "/map") {
    target = '[data-testid="button-location-swamp"]'; instruction = "Return to the Bayou";
  } else if (guiding && state.status === "taken" && state.scarfEquipped && inBayou && lonelle) {
    target = `[data-testid="button-talk-lonelle"]`; instruction = "Talk to Lonelle";
  } else if (guiding && state.status === "taken" && state.scarfEquipped) {
    target = mapOpen ? '[data-testid="nav-item-map"]' : '[data-testid="button-floating-nav"]';
    instruction = mapOpen ? "Open the world map" : "Open main navigation";
  } else if (guiding && state.status === "accepted" && !inBayou && pathname !== CLEARING) {
    target = pathname === "/map" ? '[data-testid="button-location-swamp"]' : mapOpen ? '[data-testid="nav-item-map"]' : '[data-testid="button-floating-nav"]';
    instruction = "Travel to the Elysian Bayou";
  }
  const guideMode = target && (
    (pathname === "/map" && target.includes("button-location-"))
    || (inBayou && (target.includes("location-") || target === '[data-testid="button-talk-lonelle"]'))
  ) ? "pan" as const : "target" as const;

  if (!user || !state) return null;
  const surface = getQuestGuideSurface();
  const overlayPosition = surface.inStage ? "absolute" : "fixed";
  const dialogMaxHeight = guideDialogMaxHeight(surface.height);
  const finding = pathname === CLEARING && state.status === "found";
  const heading = state.status === "available" ? "I've lost my scarf!" : state.status === "claimed" ? "Thank you, dear friend!" : state.scarfEquipped ? "You found my scarf!" : "My scarf is still out there.";
  const speech = state.status === "available"
    ? "Adornments are simply a way to decorate your pet and make them your own. I lost my favorite scarf in the Bayou Clearing! Will you defeat five monsters, find it, and bring it back to me?"
    : state.status === "claimed" ? "Your kindness will glow in the Bayou whenever I see those fireflies." : state.scarfEquipped
      ? "There it is! Thank you for keeping it safe. May I have my scarf back? Please accept this Firefly Cluster and 300 coins as my thanks."
      : state.status === "taken" ? state.scarfOwned ? "You found it! Try it on your pet in the third adornment space, then come back and show me." : "It seems my scarf went missing again. Let me give you the quest scarf so you can try it on your pet." : "Defeat five monsters in the Clearing. I know my scarf is out there somewhere!";

  return <>
    <style>{`@media (prefers-reduced-motion: reduce) { [data-testid="lonelle-quest-badge"] { animation: none !important; } }`}</style>
    {mount && createPortal(<button type="button" data-testid="button-talk-lonelle" aria-label="Talk to Lonelle" onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.preventDefault(); event.stopPropagation(); setMessage(null); setDialogOpen(true); }}
      style={{ position: "absolute", inset: "4%", zIndex: 33, border: 0, background: "transparent", cursor: "pointer", touchAction: "manipulation" }}>
      {state.status !== "claimed" && <span data-testid="lonelle-quest-badge" aria-hidden="true" className="absolute left-1/2 -top-2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[#ffe082] bg-[#465a33] text-2xl font-bold text-[#fff4c7] shadow-[0_0_18px_#e9ce6b] animate-pulse">!</span>}
    </button>, mount)}
    {questLogMount && state.status !== "claimed" && createPortal(<div data-testid="quest-card-lonelle" className="rounded-lg border border-[#a17a37]/50 bg-[#694b25]/10 p-2 font-fantasy text-[#482912]">
      <div className="flex items-center justify-between gap-2"><strong className="text-xs">Lost Adornment · Lonelle</strong><button type="button" className="rounded bg-[#315d37] px-2 py-1 text-[10px] text-white" onClick={() => pathname === WORLD ? setDialogOpen(true) : navigate(WORLD)}>GO</button></div>
      <p className="mt-1 text-[10px]">{state.status === "accepted" ? `${state.kills}/${state.requiredKills} Clearing monsters defeated` : state.status === "found" ? "Take Lonelle's Scarf from the Clearing" : state.status === "taken" ? state.scarfEquipped ? "Return to Lonelle in the Bayou" : "Equip the scarf in the third adornment space" : "Talk to Lonelle in the Bayou"}</p>
    </div>, questLogMount)}
    {state.status === "accepted" && pathname === CLEARING && createPortal(<div data-testid="lonelle-clearing-progress" className={`${overlayPosition} left-1/2 top-[8%] -translate-x-1/2 rounded-xl border border-[#eed486] bg-[#10291f]/95 px-4 py-2 text-center font-fantasy text-[#fff0c7] shadow-lg`} style={{ zIndex: 2147481000, pointerEvents: "none" }}>Lonelle's Scarf · {state.kills}/{state.requiredKills} monsters</div>, surface.target)}
    {!dialogOpen && !prize && !finding && !(pathname === CLEARING && showReturnHome && state.status === "taken") && target && <QuestGuideSpotlight
      selector={target}
      label={instruction}
      focus={focus}
      mode={guideMode}
      testId="lonelle-guide-spotlight"
    />}
    {(finding || (pathname === CLEARING && showReturnHome && state.status === "taken")) && createPortal(<div className={`${overlayPosition} inset-0 grid place-items-center bg-black/75 p-4`} style={{ zIndex: 2147482000 }} onPointerDown={event => event.stopPropagation()}>
      <section role="dialog" aria-modal="true" aria-label="Scarf found" className="w-full max-w-sm overflow-y-auto rounded-2xl border-2 border-[#eccc78] bg-[#173126] p-5 text-center font-fantasy text-[#ffefc6] shadow-2xl" style={{ maxHeight: dialogMaxHeight }}>
        {state.scarf?.imageUrl && <img src={state.scarf.imageUrl} alt="Lonelle's Scarf" className="mx-auto h-24 w-24 object-contain" />}
        <h2 className="mt-2 text-xl text-[#ffe38a]">You found Lonelle's Scarf!</h2>
        <p className="mt-2 text-sm">She'll be so glad to see it again.</p>
        {finding ? <button type="button" data-testid="button-take-lonelle-scarf" disabled={take.isPending} onClick={() => take.mutate()} className="mt-4 w-full rounded-xl bg-[#e4ba60] p-3 font-bold text-[#17261d] disabled:opacity-60">Take</button>
          : <button type="button" data-testid="button-lonelle-return-home" onClick={() => navigate("/")} className="mt-4 w-full rounded-xl bg-[#e4ba60] p-3 font-bold text-[#17261d]">Return Home</button>}
        {message && <p role="alert" className="mt-2 text-sm text-red-200">{message}</p>}
      </section>
    </div>, surface.target)}
    {dialogOpen && inBayou && createPortal(<div className={`${overlayPosition} inset-0 grid place-items-center bg-black/80 p-4`} style={{ zIndex: 2147482000 }} onClick={() => setDialogOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Lonelle's Lost Adornment quest" data-testid="lonelle-quest-dialog" onClick={event => event.stopPropagation()} className="w-full max-w-md overflow-y-auto rounded-2xl border border-[#e5c06c] p-4 font-fantasy text-[#fff0c9] shadow-2xl" style={{ maxHeight: dialogMaxHeight, background: "linear-gradient(155deg,#244735,#10221c)" }}>
        <div className="flex gap-3"><LonellePortrait state={state} mood={state.status === "available" ? "sad" : state.scarfEquipped ? "happy" : "talking_casual"} /><div><span className="text-xl font-bold text-[#ffe288]">Lonelle</span><p className="mt-1 text-lg">“{heading}”</p></div></div>
        <p className="mt-4 text-sm leading-relaxed">“{speech}”</p>
        {state.status === "accepted" && <p className="mt-3 text-sm text-[#f8d779]">Clearing monsters: {state.kills}/{state.requiredKills}</p>}
        {state.status === "available" && !state.configured && <p role="alert" className="mt-3 text-sm text-amber-200">My scarf or Firefly Cluster still needs to be configured. Come back soon.</p>}
        {message && <p role="alert" className="mt-3 text-sm text-red-200">{message}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {state.status === "available" && <button type="button" data-testid="button-accept-lonelle-quest" disabled={!state.configured || start.isPending} onClick={() => start.mutate()} className="rounded-lg bg-[#e4ba60] px-4 py-2 text-sm font-bold text-[#12291d] disabled:opacity-50">Accept Quest</button>}
          {state.status === "taken" && state.scarfEquipped && <button type="button" data-testid="button-claim-lonelle-quest" disabled={claim.isPending} onClick={() => claim.mutate()} className="rounded-lg bg-[#e4ba60] px-4 py-2 text-sm font-bold text-[#12291d] disabled:opacity-50">Return Scarf · Accept Rewards</button>}
          {state.status === "taken" && !state.scarfOwned && <button type="button" disabled={take.isPending} onClick={() => take.mutate()} className="rounded-lg bg-[#e4ba60] px-4 py-2 text-sm font-bold text-[#12291d]">Recover Quest Scarf</button>}
          <button type="button" onClick={() => setDialogOpen(false)} className="rounded-lg border border-[#d2b977]/60 px-4 py-2 text-sm">Close</button>
        </div>
      </section>
    </div>, surface.target)}
    {prize && createPortal(<div className={`${overlayPosition} inset-0 grid place-items-center bg-black/80 p-4`} style={{ zIndex: 2147482100 }}>
      <section role="dialog" aria-modal="true" aria-label="Quest rewards" data-testid="lonelle-quest-rewards" className="w-full max-w-sm overflow-y-auto rounded-2xl border-2 border-[#ffe28b] p-6 text-center font-fantasy text-[#fff6d5] shadow-[0_0_40px_#e8bd6c88]" style={{ maxHeight: dialogMaxHeight, background: "radial-gradient(#31513a,#12251e)" }}>
        <span className="text-3xl">✦</span><h2 className="mt-2 text-2xl text-[#ffe28b]">Quest Complete!</h2><p className="mt-2 text-sm">Lonelle's thanks are yours.</p>
        <div className="mt-5 flex items-center justify-center gap-4 rounded-xl bg-black/20 p-3">{prize.reward?.imageUrl && <img src={prize.reward.imageUrl} alt="Firefly Cluster" className="h-20 w-20 object-contain" />}<strong>{prize.reward?.name ?? "Firefly Cluster"}</strong></div>
        <div className="mt-3 flex items-center justify-center gap-2 text-xl font-bold"><img src={pawCoin} alt="Paw print coins" className="h-8 w-8 object-contain" />+{prize.coinsGranted}</div>
        <button type="button" data-testid="button-close-lonelle-rewards" onClick={() => setPrize(null)} className="mt-5 w-full rounded-xl bg-[#e8c46e] p-3 font-bold text-[#13281d]">Wonderful!</button>
      </section>
    </div>, surface.target)}
  </>;
}
