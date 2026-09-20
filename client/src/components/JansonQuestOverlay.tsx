import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { npcNamesMatch } from "@/lib/npcMetadata";

type QuestStatus = "locked" | "available" | "accepted" | "completed" | "claimed";
interface Quest {
  questKey: "catch_fish" | "sell_fish";
  title: string;
  description: string;
  targetCount: number;
  progress: number;
  status: QuestStatus;
  coinReward: number;
  rewardItemName: string | null;
  rewardItemQuantity: number;
}
interface JansonState { quests: Quest[]; marketUnlocked: boolean }
interface WorldNpc { id: string; name: string; type: string; iconUrl?: string | null }
const API = "/api/quests/janson";
const WORLD = "swamp";

function QuestCard({ quest, busy, onGo, onClaim }: {
  quest: Quest; busy: boolean; onGo: () => void; onClaim: () => void;
}) {
  return <div data-testid={`quest-card-janson-${quest.questKey}`} style={{ border: "1px solid rgba(99,143,73,.52)", borderRadius: 7, padding: 9, background: quest.status === "completed" ? "rgba(120,80,10,.18)" : "rgba(28,76,50,.13)", color: "#492b13", fontFamily: "Lora,serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 7, alignItems: "center" }}>
      <div>
        <span style={{ display: "block", fontSize: 7, textTransform: "uppercase", letterSpacing: ".13em" }}>One-Time · Janson</span>
        <strong style={{ fontSize: 11 }}>{quest.title}</strong>
      </div>
      {quest.status === "completed" ? <button type="button" disabled={busy} onClick={onClaim} data-testid={`button-claim-janson-${quest.questKey}`} style={actionStyle}>{busy ? "…" : "CLAIM"}</button>
        : <button type="button" onClick={onGo} data-testid={`button-go-janson-${quest.questKey}`} style={actionStyle}>{quest.status === "available" ? "GO" : "GUIDE"}</button>}
    </div>
    <div style={{ fontSize: 9, marginTop: 4 }}>{quest.description} · {Math.min(quest.progress, quest.targetCount)}/{quest.targetCount}</div>
    {(quest.coinReward > 0 || quest.rewardItemName) && <div style={{ fontSize: 8, marginTop: 3 }}>Reward: {quest.coinReward > 0 ? `${quest.coinReward} coins` : ""}{quest.rewardItemName ? ` ${quest.rewardItemQuantity} × ${quest.rewardItemName}` : ""}</div>}
  </div>;
}

const actionStyle: CSSProperties = { flexShrink: 0, padding: "5px 8px", borderRadius: 6, border: "1px solid #d7b469", background: "#386143", color: "#fff4d8", fontSize: 9, fontWeight: 800, cursor: "pointer" };

export default function JansonQuestOverlay() {
  const [pathname, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [npcMount, setNpcMount] = useState<HTMLElement | null>(null);
  const [questListMount, setQuestListMount] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data: user } = useQuery<{ id: string; isAdmin: boolean } | null>({
    queryKey: ["/api/auth/me"], retry: false, staleTime: 5_000,
    queryFn: async () => {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Session unavailable");
      return response.json();
    },
  });
  const { data: state } = useQuery<JansonState>({
    queryKey: [API], enabled: Boolean(user), staleTime: 2_000, refetchOnWindowFocus: true,
    refetchInterval: query => query.state.data?.quests.some(quest => quest.status === "accepted") ? 5_000 : false,
    queryFn: async () => (await apiRequest("GET", API)).json(),
  });
  const inBayou = pathname.startsWith(`/world/${WORLD}`);
  const { data: locations = [] } = useQuery<WorldNpc[]>({
    queryKey: ["/api/world", WORLD, "locations"], enabled: Boolean(user && inBayou), staleTime: 5_000,
    queryFn: async () => {
      const response = await fetch(`/api/world/${WORLD}/locations`, { credentials: "include" });
      return response.ok ? response.json() : [];
    },
  });
  const janson = useMemo(() => locations.find(location => location.type === "npc" && npcNamesMatch(location.name, "Janson")) ?? null, [locations]);

  useEffect(() => {
    if (!inBayou || !janson) { setNpcMount(null); return; }
    const refresh = () => setNpcMount(document.querySelector<HTMLElement>(`[data-testid="location-${janson.id}"]`));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [inBayou, janson?.id]);

  useEffect(() => {
    const refresh = () => {
      const heading = Array.from(document.querySelectorAll("h3")).find(node => node.textContent?.trim() === "QUESTS");
      setQuestListMount(heading?.parentElement?.parentElement?.querySelector<HTMLElement>(".overflow-y-auto") ?? null);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const start = useMutation({
    mutationFn: async (key: Quest["questKey"]) => (await apiRequest("POST", `${API}/${key}/start`, {})).json() as Promise<JansonState>,
    onSuccess: data => { queryClient.setQueryData([API], data); setMessage(null); },
    onError: (error: Error) => setMessage(error.message),
  });
  const claim = useMutation({
    mutationFn: async (key: Quest["questKey"]) => (await apiRequest("POST", `${API}/${key}/claim`, {})).json() as Promise<JansonState & { newCoinBalance: number }>,
    onSuccess: data => {
      queryClient.setQueryData([API], data);
      queryClient.setQueryData(["/api/auth/me"], (current: any) => current ? { ...current, coins: data.newCoinBalance } : current);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setMessage(null);
    },
    onError: (error: Error) => setMessage(error.message),
  });

  if (!user || !state) return null;
  const current = state.quests.find(quest => quest.status !== "claimed" && quest.status !== "locked");
  const openMarket = () => {
    if (!state.marketUnlocked || !inBayou) return;
    setDialogOpen(false);
    window.dispatchEvent(new Event("para:open-fish-market"));
  };
  const onQuestGo = (quest: Quest) => {
    setDialogOpen(false);
    if (quest.status === "available") {
      if (quest.questKey === "catch_fish") navigate(`/world/${WORLD}?fishHint=1`);
      else navigate(`/world/${WORLD}`);
    }
    else if (quest.questKey === "catch_fish") navigate(`/world/${WORLD}?fishHint=1`);
    else if (state.marketUnlocked && inBayou) openMarket();
    else navigate(`/world/${WORLD}`);
  };

  return <>
    {npcMount && createPortal(
      <button type="button" data-testid="button-talk-janson" aria-label={state.quests[1]?.status === "claimed" ? "Open Janson's fish market" : "Talk to Janson"}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.preventDefault(); event.stopPropagation(); setMessage(null);
          if (state.quests[1]?.status === "claimed") openMarket();
          else setDialogOpen(true);
        }}
        style={{ position: "absolute", inset: user.isAdmin ? "-10%" : "4%", zIndex: 32, background: "transparent", border: 0, cursor: "pointer", touchAction: "manipulation" }}>
        <span aria-hidden style={{ position: "absolute", left: "50%", top: "-8%", transform: "translate(-50%,-50%)", display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "50%", background: state.quests[1]?.status === "claimed" ? "#245a54" : "#775226", border: "2px solid #f6d587", color: "#fff8d4", fontSize: 23, boxShadow: "0 0 15px rgba(255,211,107,.65)", pointerEvents: "none" }}>{state.quests[1]?.status === "claimed" ? "🐟" : current?.status === "completed" ? "✓" : "!"}</span>
      </button>, npcMount)}
    {questListMount && current && createPortal(<QuestCard quest={current} busy={claim.isPending} onGo={() => onQuestGo(current)} onClaim={() => claim.mutate(current.questKey)} />, questListMount)}
    {dialogOpen && inBayou && <div className="fixed inset-0 z-[2147482000] flex items-center justify-center p-3" style={{ background: "rgba(2,10,7,.82)" }} onClick={() => setDialogOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Janson's fishing quests" data-testid="janson-quest-dialog" onClick={event => event.stopPropagation()}
        style={{ width: "min(94vw,410px)", padding: 18, borderRadius: 18, border: "1px solid rgba(184,219,142,.65)", background: "linear-gradient(#163528,#081b16)", boxShadow: "0 16px 45px #000a", color: "#f5ead0", fontFamily: "Lora,serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {janson?.iconUrl && <img src={janson.iconUrl} alt="" style={{ width: 66, height: 66, objectFit: "contain" }} />}
          <div style={{ flex: 1 }}><strong style={{ color: "#f3d88b", fontSize: 18 }}>Janson</strong>
            <p style={{ fontSize: 12, lineHeight: 1.45, margin: "5px 0" }}>
              {state.quests[0]?.status === "available" ? "The Bayou has plenty of fish. Catch a few and I'll show you the trade." :
                state.quests[0]?.status === "accepted" ? "Try your luck at a fishing spot. Come back when you've caught enough." :
                  state.quests[0]?.status === "completed" ? "Nice catch! Claim Gone Fishing in your quest log, then I'll teach you to sell." :
                    state.quests[1]?.status === "available" ? "Ready for the next step? Sell your catch here at the fish market." :
                      state.quests[1]?.status === "accepted" ? "Open my fish market and sell your catch." :
                        state.quests[1]?.status === "completed" ? "Well done! Claim your Sell Fish reward in the quest log." : "The fish market is always open to you."}
            </p>
          </div>
          <button type="button" aria-label="Close Janson dialog" onClick={() => setDialogOpen(false)} style={{ alignSelf: "flex-start", border: 0, background: "transparent", color: "#fff", fontSize: 24 }}>×</button>
        </div>
        {current?.status === "available" && <button type="button" data-testid={`button-start-janson-${current.questKey}`} disabled={start.isPending} onClick={() => start.mutate(current.questKey)} style={{ ...actionStyle, width: "100%", marginTop: 14, padding: 12 }}>START {current.title.toUpperCase()}</button>}
        {current?.status === "accepted" && current.questKey === "catch_fish" && <button type="button" onClick={() => onQuestGo(current)} style={{ ...actionStyle, width: "100%", marginTop: 14, padding: 12 }}>FIND A FISHING SPOT</button>}
        {state.marketUnlocked && <button type="button" data-testid="button-janson-fish-market" onClick={openMarket} style={{ ...actionStyle, width: "100%", marginTop: 14, padding: 12 }}>OPEN FISH MARKET</button>}
        {current?.status === "completed" && <p style={{ fontSize: 11, marginTop: 12 }}>Claim your reward from the Quest log to continue.</p>}
        {message && <p role="status" style={{ color: "#ffcb9a", fontSize: 11 }}>{message}</p>}
      </section>
    </div>}
  </>;
}
