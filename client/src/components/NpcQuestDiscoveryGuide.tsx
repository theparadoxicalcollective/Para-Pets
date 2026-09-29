import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BJ_EVENT, bjGetStatus } from "@/lib/beginJourney";
import { npcNamesMatch } from "@/lib/npcMetadata";
import { getQuestGuideSurface, guideBoundsInSurface, guideCardShouldMoveUp, guideTargetOnScreen } from "@/lib/questGuideViewport";
import QuestGuideSpotlight from "@/components/QuestGuideSpotlight";

interface GuideNpc { id: string; name: string; worldId: string; worldName: string }
interface Location { id: string; name: string; type: string }
const PROGRESS_KEY = "bj_npc_tour_v1";
const RESET_TOKEN_KEY = "bj_npc_tour_reset_token_v1";
const worlds = [
  { worldId: "haunted_woods", worldName: "Haunted Woods", name: "Ginny" },
  { worldId: "swamp", worldName: "Elysian Swamplands", name: "Janson" },
  { worldId: "swamp", worldName: "Elysian Swamplands", name: "Lonelle" },
];

function savedIndex(userId: string): number {
  try {
    const value = Number(localStorage.getItem(`${PROGRESS_KEY}:${userId}`));
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}
function saveIndex(userId: string, value: number) {
  try { localStorage.setItem(`${PROGRESS_KEY}:${userId}`, String(value)); } catch {}
}

/** A separate, read-only tour. It never starts or claims an NPC quest. */
export default function NpcQuestDiscoveryGuide({ user }: { user: { id: string; tutorial_quest_completed?: boolean; tutorial_reward_claimed?: boolean; isModerator?: boolean } }) {
  const [location] = useLocation();
  const [index, setIndex] = useState(() => savedIndex(user.id));
  const [tutorialStatus, setTutorialStatus] = useState(bjGetStatus);
  useEffect(() => {
    const sync = () => setTutorialStatus(bjGetStatus());
    window.addEventListener(BJ_EVENT, sync);
    sync();
    return () => window.removeEventListener(BJ_EVENT, sync);
  }, []);
  const [targetRect, setTargetRect] = useState<{ selector: string; rect: DOMRect } | null>(null);
  const guideCardRef = useRef<HTMLDivElement>(null);
  const recentTourTap = useRef<{ x: number; y: number; until: number } | null>(null);
  const eligible = !!(user.tutorial_quest_completed || user.tutorial_reward_claimed) && tutorialStatus === "done";
  const shouldLoadTour = eligible || tutorialStatus === "active";

  useEffect(() => { setIndex(savedIndex(user.id)); }, [user.id]);

  // Admin moderator resets must cross browsers/devices. The server exposes a
  // per-moderator reset token; a new token restarts only this discovery guide.
  const { data: resetState } = useQuery<{ resetToken: string | null }>({
    queryKey: ["/api/quests/npc-discovery-tour/reset-token", user.id],
    enabled: user.isModerator === true,
    staleTime: 0,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch("/api/quests/npc-discovery-tour/reset-token", { credentials: "include" });
      if (!response.ok) throw new Error("NPC guide reset state is unavailable");
      return response.json();
    },
  });
  useEffect(() => {
    const token = resetState?.resetToken;
    if (!token) return;
    const storageKey = `${RESET_TOKEN_KEY}:${user.id}`;
    try {
      if (localStorage.getItem(storageKey) === token) return;
      localStorage.setItem(storageKey, token);
    } catch {}
    saveIndex(user.id, 0);
    setIndex(0);
  }, [resetState?.resetToken, user.id]);

  const { data: npcs, isError, isLoading, refetch } = useQuery<GuideNpc[]>({
    queryKey: ["npc-discovery-tour", user.id],
    enabled: shouldLoadTour && index < worlds.length,
    staleTime: 30_000,
    retry: 2,
    queryFn: async () => {
      // This is a location tour, not an NPC quest-state check. Keeping it
      // independent means a moderator can replay it after completing the NPC
      // quests, and new players need only two lightweight world requests.
      const worldIds = Array.from(new Set(worlds.map(world => world.worldId)));
      const responses = await Promise.all(
        worldIds.map(worldId => fetch(`/api/world/${worldId}/locations`, { credentials: "include" })),
      );
      if (responses.some(response => !response.ok)) throw new Error("Quest locations are unavailable");
      const locations = await Promise.all(responses.map(response => response.json() as Promise<Location[]>));
      const byWorld = new Map(worldIds.map((worldId, position) => [worldId, locations[position]]));
      return worlds.flatMap(world => {
        const match = (byWorld.get(world.worldId) ?? []).find(
          row => row.type === "npc" && npcNamesMatch(row.name, world.name),
        );
        return match ? [{ id: match.id, name: world.name, worldId: world.worldId, worldName: world.worldName }] : [];
      });
    },
  });

  // Save a position in the stable world registry, not the filtered list:
  // a quest may be claimed between visits and disappear from the results.
  const current = npcs?.find(npc => worlds.findIndex(world => world.worldId === npc.worldId && world.name === npc.name) >= index);
  useEffect(() => {
    if (!eligible || !npcs || current) return;
    saveIndex(user.id, worlds.length);
    setIndex(worlds.length);
  }, [eligible, npcs, current, user.id]);
  const atWorld = current && location.split("?")[0] === `/world/${current.worldId}`;
  const atMap = location === "/map";
  const npcSelector = current && `[data-testid="location-${current.id}"]`;
  const npcElement = atWorld && npcSelector ? document.querySelector<HTMLElement>(npcSelector) : null;
  const navMap = document.querySelector<HTMLElement>('[data-testid="nav-item-map"]');
  const mapIsOpen = navMap && getComputedStyle(navMap).pointerEvents !== "none";
  const surface = getQuestGuideSurface();
  const selector = atWorld && current ? `[data-testid="location-${current.id}"]`
    : atMap ? `[data-testid="button-location-${current?.worldId}"]`
    : mapIsOpen ? '[data-testid="nav-item-map"]' : '[data-testid="button-floating-nav"]';
  const rect = targetRect?.selector === selector ? targetRect.rect : null;
  const guideRect = rect ? guideBoundsInSurface(rect, surface) : null;
  const targetOnScreen = guideTargetOnScreen(guideRect, surface.width, surface.height);
  const instruction = atWorld && targetOnScreen ? `This is ${current?.name}. Tap anywhere to see the next NPC — their quest will stay closed.`
    : atWorld ? `Drag the world to find ${current?.name} in ${current?.worldName}.`
    : atMap && !targetOnScreen ? `Drag the map to find ${current?.worldName}.`
    : atMap ? `Choose ${current?.worldName} on the world map.`
    : mapIsOpen ? "Tap World Map." : "Open the main navigation.";

  useEffect(() => {
    if (!eligible || !current) { setTargetRect(null); return; }
    const update = () => {
      const node = document.querySelector<HTMLElement>(selector);
      const bounds = node?.getBoundingClientRect();
      setTargetRect(bounds && bounds.width && bounds.height ? { selector, rect: bounds } : null);
    };
    update();
    const interval = window.setInterval(() => {
      update();
    }, 250);
    return () => window.clearInterval(interval);
  }, [eligible, current?.id, selector, location]);

  // The NPC is a live world control. During this read-only tour, even a tap on
  // its visible edge must never start its actual quest.
  useEffect(() => {
    if (!eligible || !atWorld || !npcSelector) return;
    const blockNpcClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(npcSelector)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("click", blockNpcClick, true);
    return () => document.removeEventListener("click", blockNpcClick, true);
  }, [eligible, atWorld, npcSelector]);

  // Some Android browsers send a second, delayed click at the same position
  // after a touch. Swallow that click if the tour has already advanced.
  useEffect(() => {
    const blockGhostClick = (event: MouseEvent) => {
      const tap = recentTourTap.current;
      if (!tap || Date.now() > tap.until || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 24) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("click", blockGhostClick, true);
    return () => document.removeEventListener("click", blockGhostClick, true);
  }, []);

  const blockingOverlay = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"], [data-quest-guide-blocker="true"]')).some(node => {
    const rect = node.getBoundingClientRect();
    if (rect.width <= 3 || rect.height <= 3) return false;
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.1;
  });
  if (!eligible || blockingOverlay || index >= worlds.length || isLoading || !npcs?.length && !isError) return null;
  const finish = (next: number) => {
    saveIndex(user.id, next);
    setIndex(next);
  };
  const advance = () => finish(worlds.findIndex(world => world.worldId === current?.worldId && world.name === current?.name) + 1);
  if (isError) return createPortal(
    <div role="status" className={`${surface.inStage ? "absolute" : "fixed"} bottom-28 left-3 z-[9000] rounded-xl p-3 text-[#f5d98a]`} style={{ background: "#1e2417", border: "1px solid #b58b35" }}>
      World guide could not load. <button type="button" onClick={() => void refetch()} className="underline ml-2">Retry</button>
      <button type="button" onClick={() => finish(worlds.length)} className="underline ml-3">Skip guide</button>
    </div>, surface.target,
  );
  if (!current) return null;
  // The Bayou sits low on the map. Keep the guide clear of whichever world or
  // NPC it points at, including when the map has been panned on a small screen.
  const guideAtTop = targetOnScreen && guideCardShouldMoveUp(guideRect, surface.height, guideCardRef.current?.offsetHeight ?? 130);
  const guideMode = atWorld ? (targetOnScreen && npcElement ? "tour" as const : "pan" as const) : atMap ? "pan" as const : "target" as const;
  return createPortal(<>
    <QuestGuideSpotlight
      selector={selector}
      label={instruction}
      mode={guideMode}
      allowedSelectors={['[data-testid="button-skip-npc-guide"]']}
      baseZ={9000}
      testId="npc-discovery-spotlight"
      showHint={false}
      onTourAdvance={point => {
        if (point) recentTourTap.current = { x: point.x, y: point.y, until: Date.now() + 450 };
        advance();
      }}
    />
    <div ref={guideCardRef} role="status" data-testid="npc-discovery-guide" className={`${surface.inStage ? "absolute" : "fixed"} z-[9003] left-3 right-3 mx-auto max-w-sm rounded-xl p-3 font-fantasy text-[#f9e4b3]`}
      style={{ top: guideAtTop ? "calc(env(safe-area-inset-top, 0px) + 5rem)" : undefined, bottom: guideAtTop ? undefined : 112, pointerEvents: "none", background: "linear-gradient(130deg, #17251b, #37250e)", border: "1px solid #d4a747", boxShadow: "0 4px 25px #000a" }}>
      <div className="flex justify-between gap-2 text-[11px]">
        <strong className="text-[#f0c040]">Explore quests · {npcs.indexOf(current) + 1}/{npcs.length}</strong>
        <button type="button" data-testid="button-skip-npc-guide" onClick={() => finish(worlds.length)} className="underline" style={{ pointerEvents: "auto" }}>Skip guide</button>
      </div>
      <p className="mt-1 text-sm">{instruction}</p>
      {atWorld && targetOnScreen && npcElement && <p className="mt-2 text-xs text-[#f0d060]">Tap the screen to {npcs.some(npc => worlds.findIndex(world => world.worldId === npc.worldId && world.name === npc.name) > worlds.findIndex(world => world.worldId === current.worldId && world.name === current.name)) ? "continue" : "finish the guide"}.</p>}
      {!targetOnScreen && <p className="mt-1 text-xs text-[#d9bd85]">Move around until the arrow appears over the location.</p>}
    </div>
  </>, surface.target);
}
