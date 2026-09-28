import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BJ_EVENT, bjGetStatus } from "@/lib/beginJourney";
import { npcNamesMatch } from "@/lib/npcMetadata";
import { getQuestGuideSurface, guideBoundsInSurface, guideCardShouldMoveUp, guideTargetOnScreen } from "@/lib/questGuideViewport";
import tutorialArrow from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";

interface GuideNpc { id: string; name: string; worldId: string; worldName: string }
interface Location { id: string; name: string; type: string }
const PROGRESS_KEY = "bj_npc_tour_v1";
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
export default function NpcQuestDiscoveryGuide({ user }: { user: { id: string; tutorial_quest_completed?: boolean; tutorial_reward_claimed?: boolean } }) {
  const [location] = useLocation();
  const [index, setIndex] = useState(() => savedIndex(user.id));
  const [tutorialStatus, setTutorialStatus] = useState(bjGetStatus);
  useEffect(() => {
    const sync = () => setTutorialStatus(bjGetStatus());
    window.addEventListener(BJ_EVENT, sync);
    sync();
    return () => window.removeEventListener(BJ_EVENT, sync);
  }, []);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const guideCardRef = useRef<HTMLDivElement>(null);
  const eligible = !!(user.tutorial_quest_completed || user.tutorial_reward_claimed) && tutorialStatus === "done";

  useEffect(() => { setIndex(savedIndex(user.id)); }, [user.id]);
  const { data: npcs, isError, isLoading, refetch } = useQuery<GuideNpc[]>({
    queryKey: ["npc-discovery-tour", user.id],
    enabled: eligible && index < worlds.length,
    staleTime: 30_000,
    retry: 2,
    queryFn: async () => {
      const [ginny, janson, lonelle, ...locations] = await Promise.all([
        fetch("/api/quests/ginny-mini-pet", { credentials: "include" }),
        fetch("/api/quests/janson", { credentials: "include" }),
        fetch("/api/quests/lonelle-lost-adornment", { credentials: "include" }),
        ...worlds.map(world => fetch(`/api/world/${world.worldId}/locations`, { credentials: "include" })),
      ]);
      if ([ginny, janson, lonelle, ...locations].some(response => !response.ok)) throw new Error("Quest locations are unavailable");
      const [ginnyState, jansonState, lonelleState, ...worldLocations] = await Promise.all([
        ginny.json(), janson.json(), lonelle.json(), ...locations.map(response => response.json()),
      ]);
      const jansonAvailable = jansonState.quests?.some((quest: { status: string }) => quest.status === "available")
        || jansonState.dailyQuest?.status === "available";
      return worlds.flatMap((world, position) => {
        const available = position === 0 ? ginnyState.status === "available" : position === 1 ? jansonAvailable : lonelleState.status === "available" && lonelleState.configured;
        const match = (worldLocations[position] as Location[]).find(
          row => row.type === "npc" && npcNamesMatch(row.name, world.name),
        );
        return available && match ? [{ id: match.id, name: world.name, worldId: world.worldId, worldName: world.worldName }] : [];
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
  const guideRect = rect ? guideBoundsInSurface(rect, surface) : null;
  const targetOnScreen = guideTargetOnScreen(guideRect, surface.width, surface.height);
  const selector = atWorld && current ? `[data-testid="location-${current.id}"]`
    : atMap ? `[data-testid="button-location-${current?.worldId}"]`
    : mapIsOpen ? '[data-testid="nav-item-map"]' : '[data-testid="button-floating-nav"]';
  const instruction = atWorld && targetOnScreen ? `This is ${current?.name}. Their quest is ready here!`
    : atWorld ? `Drag the world to find ${current?.name} in ${current?.worldName}.`
    : atMap && !targetOnScreen ? `Drag the map to find ${current?.worldName}.`
    : atMap ? `Choose ${current?.worldName} on the world map.`
    : mapIsOpen ? "Tap World Map." : "Open the main navigation.";

  useEffect(() => {
    if (!eligible || !current) { setRect(null); return; }
    const interval = window.setInterval(() => {
      const node = document.querySelector<HTMLElement>(selector);
      const bounds = node?.getBoundingClientRect();
      setRect(bounds && bounds.width && bounds.height ? bounds : null);
    }, 250);
    return () => window.clearInterval(interval);
  }, [eligible, current?.id, selector, location]);

  if (!eligible || index >= worlds.length || isLoading || !npcs?.length && !isError) return null;
  const finish = (next: number) => {
    saveIndex(user.id, next);
    setIndex(next);
  };
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
  return createPortal(<>
    {targetOnScreen && guideRect && <img src={tutorialArrow} alt="" aria-hidden="true" className={`${surface.inStage ? "absolute" : "fixed"} z-[9001] pointer-events-none w-12 animate-bounce`}
      style={{ left: Math.max(0, Math.min(surface.width - 48, (guideRect.left + guideRect.right) / 2 - 24)), top: Math.max(4, guideRect.top - 55), filter: "drop-shadow(0 2px 5px #000)" }} />}
    <div ref={guideCardRef} role="status" data-testid="npc-discovery-guide" className={`${surface.inStage ? "absolute" : "fixed"} z-[9000] left-3 right-3 mx-auto max-w-sm rounded-xl p-3 font-fantasy text-[#f9e4b3]`}
      style={{ top: guideAtTop ? "calc(env(safe-area-inset-top, 0px) + 5rem)" : undefined, bottom: guideAtTop ? undefined : 112, pointerEvents: "none", background: "linear-gradient(130deg, #17251b, #37250e)", border: "1px solid #d4a747", boxShadow: "0 4px 25px #000a" }}>
      <div className="flex justify-between gap-2 text-[11px]">
        <strong className="text-[#f0c040]">Explore quests · {npcs.indexOf(current) + 1}/{npcs.length}</strong>
        <button type="button" onClick={() => finish(worlds.length)} className="underline" style={{ pointerEvents: "auto" }}>Skip guide</button>
      </div>
      <p className="mt-1 text-sm">{instruction}</p>
      {atWorld && targetOnScreen && npcElement && <button type="button" data-testid="button-next-npc-guide" className="mt-2 rounded-lg px-3 py-1.5 text-sm text-[#211605]"
        style={{ background: "#eac56b", pointerEvents: "auto" }} onClick={() => finish(worlds.findIndex(world => world.worldId === current.worldId && world.name === current.name) + 1)}>
        {npcs.some(npc => worlds.findIndex(world => world.worldId === npc.worldId && world.name === npc.name) > worlds.findIndex(world => world.worldId === current.worldId && world.name === current.name)) ? "Show next NPC" : "Finish guide"}
      </button>}
      {!targetOnScreen && <p className="mt-1 text-xs text-[#d9bd85]">Move around until the arrow appears over the location.</p>}
    </div>
  </>, surface.target);
}
