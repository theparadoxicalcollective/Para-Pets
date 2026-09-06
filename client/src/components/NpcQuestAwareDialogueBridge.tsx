import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  chooseNpcMessage,
  getNpcQuestAssociations,
  npcNamesMatch,
  parseNpcMetadata,
} from "@/lib/npcMetadata";

type GinnyQuestStatus = "available" | "accepted" | "completed" | "claimed";

interface NpcCatalogRow {
  id: string;
  name: string;
  imageUrl: string | null;
  type: string;
  worldId: string;
  specialSkill?: string | null;
}

interface WorldLocationRow {
  id: string;
  worldId: string;
  name: string;
  type: string;
  description?: string | null;
}

const NPC_CATALOG_WORLD = "__npc_catalog__";
const GINNY_QUEST_KEY = "ginny_mini_pet_companion";

function currentWorldId(): string {
  return window.location.pathname.match(/^\/world\/([^/]+)/)?.[1] ?? "";
}

/**
 * The generic NPC overlay intentionally yields to quest interactions, but its
 * original gate only checked whether a quest was registered for an NPC. That
 * permanently disabled normal dialogue for Ginny even after her one-time quest
 * had been claimed. This bridge handles the state-aware handoff until all NPC
 * quests share one server-side availability endpoint.
 */
export default function NpcQuestAwareDialogueBridge() {
  const [worldId, setWorldId] = useState(currentWorldId);
  const [isAdmin, setIsAdmin] = useState(false);
  const [locations, setLocations] = useState<WorldLocationRow[]>([]);
  const [catalog, setCatalog] = useState<NpcCatalogRow[]>([]);
  const [ginnyStatus, setGinnyStatus] = useState<GinnyQuestStatus | null>(null);
  const [mounts, setMounts] = useState<Record<string, HTMLElement>>({});
  const [spokenMessages, setSpokenMessages] = useState<Record<string, string>>({});
  const speechTimeouts = useRef<Record<string, number>>({});

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = currentWorldId();
      if (next !== worldId) setWorldId(next);
    }, 350);
    return () => window.clearInterval(timer);
  }, [worldId]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(user => { if (!cancelled) setIsAdmin(Boolean(user?.isAdmin)); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [worldId]);

  useEffect(() => {
    if (!worldId) {
      setLocations([]);
      setCatalog([]);
      setGinnyStatus(null);
      return;
    }

    let cancelled = false;
    void Promise.all([
      fetch(`/api/world/${worldId}/locations`, { credentials: "include", cache: "no-store" }),
      fetch(`/api/shop/${encodeURIComponent(NPC_CATALOG_WORLD)}`, { credentials: "include", cache: "no-store" }),
    ]).then(async ([locationResponse, catalogResponse]) => {
      if (cancelled) return;
      if (locationResponse.ok) setLocations(await locationResponse.json());
      if (catalogResponse.ok) {
        const rows = await catalogResponse.json() as NpcCatalogRow[];
        setCatalog(rows.filter(row => row.type === "npc" && row.worldId === NPC_CATALOG_WORLD));
      }
    }).catch(() => {});

    if (worldId === "haunted_woods") {
      void fetch("/api/quests/ginny-mini-pet", { credentials: "include", cache: "no-store" })
        .then(response => response.ok ? response.json() : null)
        .then(state => {
          if (!cancelled) setGinnyStatus((state?.status as GinnyQuestStatus | undefined) ?? null);
        })
        .catch(() => { if (!cancelled) setGinnyStatus(null); });
    } else {
      setGinnyStatus(null);
    }

    return () => { cancelled = true; };
  }, [worldId]);

  useEffect(() => {
    const refresh = () => {
      const next: Record<string, HTMLElement> = {};
      for (const location of locations) {
        if (location.type !== "npc") continue;
        const mount = document.querySelector<HTMLElement>(`[data-testid="location-${location.id}"]`);
        if (mount) next[location.id] = mount;
      }
      setMounts(next);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locations]);

  useEffect(() => () => {
    Object.values(speechTimeouts.current).forEach(timeout => window.clearTimeout(timeout));
  }, []);

  const speak = useCallback((locationId: string, messages: readonly string[]) => {
    setSpokenMessages(previous => {
      const chosen = chooseNpcMessage(messages, previous[locationId]);
      return chosen ? { ...previous, [locationId]: chosen } : previous;
    });
    if (speechTimeouts.current[locationId] !== undefined) {
      window.clearTimeout(speechTimeouts.current[locationId]);
    }
    speechTimeouts.current[locationId] = window.setTimeout(() => {
      setSpokenMessages(previous => {
        const next = { ...previous };
        delete next[locationId];
        return next;
      });
      delete speechTimeouts.current[locationId];
    }, 4500);
  }, []);

  const eligible = useMemo(() => locations.flatMap(location => {
    if (location.type !== "npc") return [];
    const quests = getNpcQuestAssociations(location.name, location.worldId);
    if (!quests.some(quest => quest.key === GINNY_QUEST_KEY)) return [];

    // available/accepted/completed still have an actionable quest interaction.
    // claimed means the one-time quest is over, so normal configured NPC
    // dialogue becomes the interaction again.
    if (ginnyStatus !== "claimed") return [];

    const catalogNpc = catalog.find(npc => npcNamesMatch(npc.name, location.name));
    const metadata = parseNpcMetadata(catalogNpc?.specialSkill ?? location.description);
    if (metadata.messages.length === 0) return [];
    return [{ location, messages: metadata.messages }];
  }), [catalog, ginnyStatus, locations]);

  useEffect(() => {
    if (!isAdmin || eligible.length === 0) return;
    const onAdminClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const hotspot = event.target.closest<HTMLElement>('[data-testid^="admin-location-hotspot-"]');
      if (!hotspot) return;
      const match = eligible.find(({ location }) => hotspot.getAttribute("data-testid") === `admin-location-hotspot-${location.id}`);
      if (match) speak(match.location.id, match.messages);
    };
    document.addEventListener("click", onAdminClick, true);
    return () => document.removeEventListener("click", onAdminClick, true);
  }, [eligible, isAdmin, speak]);

  if (!worldId) return null;

  return (
    <>
      {eligible.map(({ location, messages }) => {
        const mount = mounts[location.id];
        if (!mount) return null;
        const spoken = spokenMessages[location.id];
        return createPortal(
          <>
            {!isAdmin && (
              <button
                type="button"
                aria-label={`Talk to ${location.name}`}
                data-testid={`button-quest-finished-talk-npc-${location.id}`}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  speak(location.id, messages);
                }}
                style={{ position: "absolute", inset: 0, zIndex: 9, border: 0, padding: 0, background: "transparent", cursor: "pointer", touchAction: "manipulation" }}
              />
            )}
            {spoken && (
              <div
                role="status"
                aria-live="polite"
                data-testid={`npc-quest-finished-message-${location.id}`}
                style={{
                  position: "absolute", left: "50%", bottom: "98%", transform: "translate(-50%, -8px)", zIndex: 15,
                  width: "max-content", maxWidth: "min(220px, 72vw)", padding: "7px 10px", borderRadius: 10,
                  border: "1px solid rgba(255,220,128,.72)", background: "rgba(18,12,20,.94)",
                  boxShadow: "0 5px 18px rgba(0,0,0,.6), 0 0 12px rgba(255,205,90,.13)", color: "#fff2c7",
                  fontFamily: "Lora, serif", fontSize: 10, lineHeight: 1.35, textAlign: "center", pointerEvents: "none", whiteSpace: "normal",
                }}
              >
                <strong style={{ display: "block", marginBottom: 2, color: "#ffd978", fontSize: 9 }}>{location.name}</strong>
                {spoken}
              </div>
            )}
          </>,
          mount,
        );
      })}
    </>
  );
}
